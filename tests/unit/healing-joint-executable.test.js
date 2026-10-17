import test from 'node:test';
import assert from 'node:assert/strict';
import { world, healer, target, duplicateWorld, heals } from '../fixtures/healing-generated-world.js';
import { healingOracleCases } from '../fixtures/healing-joint-cases.js';
import { jointHealingOracle } from '../fixtures/healing-joint-oracle.js';
import { runHealingTick } from '../fixtures/healing-intent-ledger-candidate.js';
import { runJointHealingTick } from '../fixtures/healing-joint-executable.js';

const plannedCalls = p => p.actions.filter(a => a.method).map(a => [a.actorId, a.method, a.targetId]);
const rebuild = (w, returns) => world(w.friends, { flags: w.flags, enemies: w.enemies, returns });
const nominal = r => Object.fromEntries(r.accepted.targets.map(t => [t.targetId, t.nominal]));
const assertBounds = r => {
    assert(r.work.assignments <= 3615);
    assert.equal(new Set(r.solves.map(s => s.remainingHealers)).size, r.solves.length);
    for (const s of r.solves) {
        assert(s.remainingHealers >= 1 && s.remainingHealers <= 3);
        assert(s.work.assignments <= 15 ** s.remainingHealers);
        assert.equal(s.work.assignments, s.combinations);
        assert(Number.isFinite(s.elapsedMs) && s.elapsedMs >= 0);
    }
    assert.equal(new Set(heals(r).map(c => c[0])).size, heals(r).length);
    assert.equal(r.accepted.total, r.total, 'Independent numeric-0 reporter accounting agrees with the planner');
    assert.equal(r.resolved, null);
};

for (const [name, make, expected] of healingOracleCases) {
    for (const variant of ['success', 'rejected', 'unknown', 'target-dependent']) test(`${name}: execute ${variant}`, async t => {
        const original = make(), first = original.friends.find(c => jointHealingOracle(original).healerIds.includes(c.id));
        const returns = variant === 'success' ? {} : { [first.id]: variant === 'rejected' ? -9 : variant === 'unknown'
            ? undefined : ({ target }) => target.id === 'a' ? -9 : 0 };
        const w = rebuild(original, returns), before = JSON.stringify([w.friends, w.enemies, w.flags]);
        const oracle = jointHealingOracle(w), baseline = await runHealingTick(w), repeat = await runHealingTick(w);
        assert.deepEqual(baseline.calls, repeat.calls, 'Reproduce unchanged baseline command traces');
        assert.deepEqual(heals(baseline), plannedCalls(oracle.baseline));
        const greedy = await runHealingTick(w, { enabled: true }), joint = await runJointHealingTick(w);
        assert.equal(joint.executed, true); assertBounds(joint);
        assert.deepEqual(joint.baseline, oracle.baseline);
        assert.equal(joint.solves[0].constrained.total, expected[3]);
        if (variant === 'success') {
            assert.equal(baseline.total, expected[0]); assert.equal(greedy.total, expected[1]);
            assert.equal(joint.accepted.total, expected[3]);
            assert.deepEqual(heals(joint), plannedCalls(oracle.constrained));
            assert.equal(joint.solves.length, 1); assert.deepEqual(joint.shortfalls, []);
        }
        assert.equal(JSON.stringify([w.friends, w.enemies, w.flags]), before);
        t.diagnostic(JSON.stringify({ case: name, variant, baselinePlanned: oracle.baseline.total,
            initialJointPlanned: joint.solves[0].constrained.total, baselineAccepted: baseline.total,
            greedyAccepted: greedy.total, jointAccepted: joint.accepted.total,
            exposureFloor: joint.exposureFloor, acceptedNominal: nominal(joint), shortfalls: joint.shortfalls,
            limitations: joint.limitations, solves: joint.solves.map(s => ({ remaining: s.remainingHealers,
                assignments: s.work.assignments, elapsedMs: s.elapsedMs, feasible: !!s.constrained })) }));
    });
}

test('a better initial plan can have STRICTLY WORSE accepted capacity; no actor is retried', async t => {
    const make = healingOracleCases.find(([n]) => n === 'asymmetric reach')[1];
    const w = rebuild(make(), { constrained: ({ target }) => target.id === 'a' ? -9 : 0 });
    const b = await runHealingTick(w), r = await runJointHealingTick(w);
    assert.equal(b.total, 10); assert.equal(r.solves[0].constrained.total, 14);
    assert.equal(r.accepted.total, 4); assert.deepEqual(heals(r), [['flexible', 'rangedHeal', 'b'], ['constrained', 'heal', 'a']]);
    assert.equal(r.solves.length, 1); assertBounds(r);
    t.diagnostic('Retained adverse outcome: planned 10→14, accepted baseline10 versus joint4; late rejection cannot undo earlier allocation.');
    const reversed = await runJointHealingTick(w, { order: [...w.friends].reverse() });
    assert.deepEqual(heals(reversed), [['constrained', 'heal', 'a'], ['flexible', 'heal', 'a']]);
    assert.equal(reversed.accepted.total, 10, 'Earlier failure permits a residual change; actor order is not repaired by sorting');
});

test('failure makes ORIGINAL nominal floor infeasible; use remaining baseline, never lower floor or retry', async () => {
    const w = duplicateWorld({ returns: { h1: -9 }, enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 } }] });
    const r = await runJointHealingTick(w);
    assert.equal(r.exposureFloor.a, 24); assert.equal(r.solves[1].constrained, null);
    assert.equal(r.solves[1].exposureFloor.a, 24);
    assert.deepEqual(r.limitations.map(l => l.reason), ['remaining-floors-infeasible']);
    assert.deepEqual(heals(r), [['h1', 'heal', 'a'], ['h2', 'heal', 'a']]);
    assert.equal(nominal(r).a, 12); assert.deepEqual(r.shortfalls, [{ targetId: 'a', floor: 24, acceptedNominal: 12 }]);
    assertBounds(r);
});

for (const rc of [undefined, null, '0', false, NaN, {}, new Number(0), -9]) test(`only numeric0 earns credit: ${String(rc)}`, async () => {
    const r = await runJointHealingTick(duplicateWorld({ returns: { h1: rc, h2: rc } }));
    assert.equal(r.accepted.total, 0); assert.deepEqual(r.solves.map(s => s.remainingHealers), [2, 1]); assertBounds(r);
});

test('partial acceptance is carried forward into residual plan, with no repeated actor and baseline ties preferred', async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10), healer('h3', 10, 12),
        target('a', 10, 11, 4), target('b', 11, 11, 4), target('c', 12, 11, 4)], { returns: { h2: -9 } });
    const r = await runJointHealingTick(w); assertBounds(r);
    assert.deepEqual(r.solves.map(s => s.remainingHealers), [3, 1]);
    const first = heals(r)[0];
    assert.deepEqual(r.solves[1].constrained.actions.find(a => a.actorId === first[0]),
        r.solves[0].constrained.actions.find(a => a.actorId === first[0]));
    assert.equal(r.accepted.total, 8);
    assert.equal(r.solves[0].constrained.actions.find(a => a.actorId === 'h3').targetId, 'c');
    assert.equal(heals(r).find(a => a[0] === 'h3')[2], 'b', 'Only the unacted healer changes after h2 fails');
    const tie = await runJointHealingTick(world([healer('h', 10, 10), target('a', 10, 11, 4), target('b', 11, 11, 4)]));
    assert.deepEqual(heals(tie), [['h', 'heal', 'a']]);
});

test('exact full residual bound: 3375 + 225 + 15, local timing is NOT Arena CPU', async t => {
    const cells = [];
    for (let y = 9; y <= 12; y++) for (let x = 9; x <= 12; x++) cells.push([x, y]);
    const specs = cells.slice(0, 14).map(([x, y], i) => i < 3 ? healer(`h${i}`, x, y, 1, { deficit: 1 }) : target(`t${i}`, x, y, 1));
    const r = await runJointHealingTick(world(specs, { returns: { h0: -9, h1: undefined, h2: -9 } }));
    assert.deepEqual(r.solves.map(s => s.work.assignments), [3375, 225, 15]);
    assert.equal(r.work.assignments, 3615); assert.equal(r.accepted.total, 0); assertBounds(r);
    t.diagnostic(JSON.stringify({ localPlanningMs: r.solves.map(s => s.elapsedMs), assignments: r.work.assignments, arenaCpu: null }));
});

test('mixed actor order: movement, hybrids and action compatibility stay exact; hybrid rejection can invalidate floors', async () => {
    const w = world([healer('h1', 10, 10), { id: 'mixed', x: 11, y: 10, parts: { move: 1, ranged_attack: 1, heal: 1 } },
        healer('h2', 9, 10), target('a', 10, 11, 4), target('b', 12, 11, 4)],
    { returns: { mixed: ({ method }) => method === 'heal' ? -9 : 0 },
        enemies: [{ id: 'foe', x: 11, y: 12, parts: { move: 1, attack: 1 } }] });
    const b = await runHealingTick(w, { movement: true }), r = await runJointHealingTick(w, { movement: true });
    assertBounds(r);
    const nonPureHealing = calls => calls.filter(c => !['heal', 'rangedHeal'].includes(c.method) || c.actor === 'mixed');
    assert.deepEqual(nonPureHealing(r.calls), nonPureHealing(b.calls));
    assert(r.calls.some(c => c.actor === 'mixed' && c.method === 'rangedAttack'));
    assert.deepEqual(heals(r).map(c => c[0]), ['h1', 'mixed', 'h2']);
    assert.equal(r.solves[1].constrained, null); assert.equal(r.exposureFloor.a, 36);
    assert.equal(r.shortfalls.find(t => t.targetId === 'a').acceptedNominal, 24);
});

test('hybrid acts before first pure healer: solve only after actual result, no second full solve', async () => {
    const w = world([{ id: 'mixed', x: 10, y: 10, parts: { move: 1, ranged_attack: 1, heal: 1 } },
        healer('h1', 11, 10), healer('h2', 12, 10), target('a', 10, 11, 4), target('b', 12, 11, 4)],
    { returns: { mixed: undefined }, enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 } }] });
    const r = await runJointHealingTick(w); assertBounds(r);
    assert.equal(r.solves.length, 1); assert.equal(r.solves[0].remainingHealers, 2);
    assert.equal(r.solves[0].constrained, null); assert.equal(r.limitations.length, 1);
    assert.deepEqual(heals(r), plannedCalls(r.baseline));
});

test('irrelevant observation order leaves commands unchanged; actual execution order is NEVER sorted', async () => {
    const w = healingOracleCases.find(([n]) => n === 'asymmetric reach')[1]();
    const order = [...w.friends], a = await runJointHealingTick(w, { order });
    const b = await runJointHealingTick({ ...w, friends: [...w.friends].reverse(), creeps: [...w.creeps].reverse() }, { order });
    assert.deepEqual(b.calls, a.calls);
    const c = await runJointHealingTick(w, { order: [...order].reverse() });
    assert.deepEqual(heals(c).map(x => x[0]), ['constrained', 'flexible']);
    assert.equal(c.accepted.total, a.accepted.total);
});

test('duplicate/malformed observations cannot execute; each new tick resets all accepted and solve accounting', async () => {
    const w = duplicateWorld(), a = await runJointHealingTick(w); assert.equal(a.accepted.total, 8);
    for (const bad of [undefined, null, { ...w, friends: [...w.friends, w.friends[0]] }, { ...w, creeps: [...w.creeps, w.creeps[0]] },
        { ...w, flags: [] }, { ...w, tick: NaN }]) {
        const before = w.calls.length, r = await runJointHealingTick(bad);
        assert.equal(r.executed, false); assert.equal(w.calls.length, before); assert.deepEqual(r.solves, []);
    }
    const badOrder = await runJointHealingTick(w, { order: [w.friends[0], w.friends[0], ...w.friends.slice(2)] });
    assert.equal(badOrder.executed, false);
    w.tick++; const b = await runJointHealingTick(w); assert.equal(b.accepted.total, 8); assert.deepEqual(b.calls, a.calls);
    const repeatedObservation = await runJointHealingTick(w);
    assert.deepEqual(repeatedObservation.calls, a.calls, 'Separate isolated runs, not a persistent cross-call deduplicator');
});

test('no-action and zero pure healers issue no extra healing and no zero-healer solve', async () => {
    const w = world([target('healthy', 10, 10, 0)]), r = await runJointHealingTick(w);
    assert.deepEqual(r.calls, []); assert.deepEqual(r.solves, []); assertBounds(r);
    const healthy = await runJointHealingTick(world([healer('h', 10, 10)]));
    assert.deepEqual(heals(healthy), []); assertBounds(healthy);
});

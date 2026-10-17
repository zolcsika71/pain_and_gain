import test from 'node:test';
import assert from 'node:assert/strict';
import { world, healer, target, duplicateWorld, heals, freeze } from '../fixtures/healing-generated-world.js';
import { runHealingTick } from '../fixtures/healing-intent-ledger-candidate.js';
import { jointHealingOracle, healingOracleLimits } from '../fixtures/healing-joint-oracle.js';

const plannedCalls = p => p.actions.filter(a => a.method).map(a => [a.actorId, a.method, a.targetId]);
const capacities = p => Object.fromEntries(p.targets.map(t => [t.targetId, t.nominal]));
import { protectedWorld, healingOracleCases as cases } from '../fixtures/healing-joint-cases.js';
for (const [name, make, expected] of cases) test(`generated comparison: ${name}`, async t => {
    const w = make(), before = JSON.stringify(w.friends), oracle = jointHealingOracle(w);
    assert.equal(oracle.supported, true); assert.deepEqual(w.calls, [], 'Oracle issues no calls');
    assert.equal(oracle.accepted, null); assert.equal(oracle.resolved, null);
    const baseline = await runHealingTick(w), greedy = await runHealingTick(w, { enabled: true });
    assert.deepEqual(plannedCalls(oracle.baseline), heals(baseline), 'Reproduce production baseline, do not invent a planned oracle');
    const values = [oracle.baseline.total, greedy.total, oracle.unconstrained.total, oracle.constrained.total];
    assert.deepEqual(values, expected);
    assert.equal(baseline.total, oracle.baseline.total, 'Only these generated stubs all return numeric0');
    assert(oracle.work.assignments <= 3375); assert(oracle.work.eligibilityProbes <= 42);
    assert.equal(oracle.work.assignments, oracle.combinations); assert(oracle.work.exposureFeasible > 0);
    for (const p of [oracle.unconstrained, oracle.constrained]) {
        assert.deepEqual(p.actions.map(a => a.actorId), w.friends.map(c => c.id), 'Output retains execution order');
        assert.equal(new Set(p.actions.map(a => a.actorId)).size, p.actions.length);
        assert.equal(p.total, p.targets.reduce((n, x) => n + Math.min(x.deficit, x.planned), 0));
    }
    for (const [id, floor] of Object.entries(oracle.exposureFloor))
        assert(capacities(oracle.constrained)[id] >= floor, 'Retain BASELINE NOMINAL allocation, not just capped deficit');
    assert.equal(JSON.stringify(w.friends), before);
    t.diagnostic(JSON.stringify({ case: name, baselinePlanned: oracle.baseline.total,
        greedyPlannedWithZeroReturnStubs: greedy.total, unconstrainedPlanned: oracle.unconstrained.total,
        constrainedPlanned: oracle.constrained.total, baselineAcceptedStubCapacity: baseline.total,
        greedyAcceptedStubCapacity: greedy.total, oracleAccepted: null, oracleResolved: null,
        exposureFloor: oracle.exposureFloor, assignments: oracle.work.assignments }));
});

test('the exposed baseline floor is uncapped nominal capacity, not observed deficit or a damage prediction', () => {
    const w = cases.find(([name]) => name === 'exposed small wound forbids diversion')[1]();
    const r = jointHealingOracle(w);
    assert.equal(r.exposureFloor.a, 24); assert.equal(r.baseline.targets.find(t => t.targetId === 'a').deficit, 4);
    assert.equal(capacities(r.unconstrained).a, 12);
    assert.equal(capacities(r.constrained).a, 24); assert.equal(r.constrained.total, 4);
});

test('nominal floors remain pre-modifier while the planned objective uses the validated modifier', () => {
    for (const count of [0, 1, 2]) {
        const r = jointHealingOracle(protectedWorld(count)), a = r.constrained.targets.find(t => t.targetId === 'a');
        assert.equal(r.exposureFloor.a, 72); assert.equal(a.nominal, 72);
        assert.equal(a.planned, 72 * (1 - count * 0.25));
    }
});

test('exact worst-case bound: three healers, fourteen reachable injured targets plus no-action enumerate3375 ONCE', () => {
    const cells = [];
    for (let y = 9; y <= 12; y++) for (let x = 9; x <= 12; x++) cells.push([x, y]);
    const specs = cells.slice(0, 14).map(([x, y], i) => i < 3 ? healer(`h${i}`, x, y, 1, { deficit: 1 }) : target(`t${i}`, x, y, 1));
    const w = world(specs), r = jointHealingOracle(w);
    assert.equal(r.supported, true); assert.equal(r.combinations, 15 ** 3);
    assert.equal(r.work.assignments, 3375); assert.equal(r.work.exposureFeasible, 3375);
    assert.equal(r.work.eligibilityProbes, 42); assert.equal(r.unconstrained.total, 3); assert.equal(r.constrained.total, 3);
    assert.deepEqual(w.calls, []); assert.deepEqual(healingOracleLimits, { healers: 3, targets: 14, assignments: 3375 });
});

test('no-action and zero-healer bounds do not invent a heal or require a full number of participants', () => {
    for (const w of [world([target('healthy', 10, 10, 0)]), world([healer('h1', 10, 10), healer('h2', 11, 10)])]) {
        const r = jointHealingOracle(w); assert.equal(r.supported, true); assert.equal(r.work.assignments, 1);
        assert.equal(r.baseline.total, 0); assert.equal(r.constrained.total, 0);
        assert(r.constrained.actions.every(a => a.method === null)); assert.deepEqual(w.calls, []);
    }
});

test('irrelevant target/roster/enemy order preserves both optimal totals and deterministic witnesses without sorting execution', () => {
    const w = protectedWorld();
    const other = world([], { enemies: [{ id: 'other', x: 80, y: 80, parts: { move: 1, ranged_attack: 1 } }] }).enemies[0];
    w.enemies = freeze([...w.enemies, other]); w.creeps = freeze([...w.friends, ...w.enemies]);
    const a = jointHealingOracle(w), order = [...w.friends];
    const reordered = { ...w, friends: [...w.friends].reverse(), enemies: [...w.enemies].reverse(), creeps: [...w.creeps].reverse() };
    const b = jointHealingOracle(reordered, { executionOrder: order, targets: [...w.friends].reverse() });
    assert.deepEqual(b, a); assert.deepEqual(b.constrained.actions.map(x => x.actorId), order.map(c => c.id));
});

test('equal-score plans preserve baseline where optimal, and otherwise use stable witnesses', () => {
    const w = duplicateWorld(), a = jointHealingOracle(w), b = jointHealingOracle(w, { targets: [...w.friends].reverse() });
    assert.equal(a.unconstrained.changed, 1); assert.deepEqual(a.unconstrained, b.unconstrained);
    const trap = jointHealingOracle(cases.find(([name]) => name === 'greedy 30 to 26 counterexample')[1]());
    assert.equal(trap.constrained.changed, 0); assert.deepEqual(trap.constrained.actions, trap.baseline.actions);
});

test('changing actual execution order cannot change the joint optimum, but output keeps that exact order', () => {
    const w = cases.find(([name]) => name === 'asymmetric reach')[1](), a = jointHealingOracle(w), order = [...w.friends].reverse();
    const b = jointHealingOracle(w, { executionOrder: order });
    assert.equal(a.constrained.total, 14); assert.equal(b.constrained.total, 14);
    assert.deepEqual(b.constrained.actions.map(a => a.actorId), order.map(c => c.id));
    assert.deepEqual([...a.constrained.actions].sort((a, b) => a.actorId.localeCompare(b.actorId)),
        [...b.constrained.actions].sort((a, b) => a.actorId.localeCompare(b.actorId)));
});

test('planned capacity remains separate when baseline/greedy generated calls fail or return unknown', async () => {
    const w = duplicateWorld({ returns: { h1: undefined, h2: -9 } }), r = jointHealingOracle(w);
    assert.equal(r.baseline.total, 4); assert.equal(r.constrained.total, 8); assert.equal(r.accepted, null);
    assert.deepEqual(w.calls, []);
    const b = await runHealingTick(w), g = await runHealingTick(w, { enabled: true });
    assert.equal(b.total, 0); assert.equal(g.total, 0);
    assert.deepEqual(heals(g), heals(b), 'No unknown accepted credit is assumed by the rejected greedy adapter');
});

test('hybrid healing choices are fixed; no joint command, movement or tactical reorder is executed', async () => {
    const w = world([{ id: 'mixed', x: 10, y: 10, parts: { move: 1, ranged_attack: 1, heal: 1 } },
        healer('h1', 11, 10), healer('h2', 12, 10), target('a', 10, 11, 4), target('b', 12, 11, 4)],
    { enemies: [{ id: 'foe', x: 11, y: 9, parts: { move: 1, attack: 1 } }] });
    const r = jointHealingOracle(w);
    for (const p of [r.unconstrained, r.constrained])
        assert.deepEqual(p.actions.find(a => a.actorId === 'mixed'), r.baseline.actions.find(a => a.actorId === 'mixed'));
    assert.deepEqual(w.calls, []);
    const baseline = await runHealingTick(w, { movement: true });
    assert(baseline.calls.some(c => c.actor === 'mixed' && c.method === 'rangedAttack'));
    assert(!baseline.calls.some(c => c.actor === 'mixed' && c.method === 'attack'));
    // The oracle only reads: it cannot alter the subsequent real baseline flow.
    jointHealingOracle(w); const again = await runHealingTick(w, { movement: true });
    assert.deepEqual(again.calls, baseline.calls);
});

test('functioning current weapon reach, inclusive boundaries and fatigue determine exposure without future movement forecasts', () => {
    const variants = [
        [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 }, fatigue: 10 }, true],
        [{ id: 'foe', x: 8, y: 11, parts: { move: 1, attack: 1 } }, false],
        [{ id: 'foe', x: 7, y: 11, parts: { move: 1, ranged_attack: 1 } }, true],
        [{ id: 'foe', x: 6, y: 11, parts: { move: 1, ranged_attack: 1 } }, false],
        [{ id: 'foe', x: 9, y: 11, body: [{ type: 'move', hits: 100 }, { type: 'attack', hits: 0 }] }, false],
        [{ id: 'foe', x: 9, y: 11, body: [{ type: 'move', hits: 0 }, { type: 'attack', hits: 0 }] }, false],
    ];
    for (const [enemy, expected] of variants) {
        const r = jointHealingOracle(duplicateWorld({ enemies: [enemy] }));
        assert.equal(r.supported, true); assert.equal(r.exposedIds.includes('a'), expected);
        assert.equal(r.exposureFloor.a ?? 0, expected ? 24 : 0);
    }
});

test('unsupported or missing observations fence enumeration instead of assuming clearance or zero capacity', () => {
    for (const w of [undefined, null, {}, { tick: NaN }]) assert.equal(jointHealingOracle(w).supported, false);
    const replace = (w, change) => {
        w.friends = w.friends.map((c, i) => i ? c : freeze({ ...c, ...change }));
        w.creeps = [...w.friends, ...w.enemies];
    };
    const mutations = [w => w.enemies = null, w => w.creeps = [], w => w.flags = [],
        w => w.flags = w.flags.map((f, i) => i ? f : { ...f, my: null }),
        w => replace(w, { body: null }), w => replace(w, { hits: NaN }), w => replace(w, { x: Infinity }),
        w => replace(w, { effects: [{ effectType: 'unknown', data: {} }] }), w => replace(w, { getRangeTo: () => NaN }),
        w => replace(w, { heal: undefined }), w => replace(w, { fatigue: undefined }),
        w => replace(w, { id: w.friends[1].id }),
        w => { w.enemies = [{ ...w.enemies[0], body: null }]; w.creeps = [...w.friends, ...w.enemies]; },
    ];
    for (const mutate of mutations) {
        const w = duplicateWorld({ enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 } }] });
        mutate(w); const r = jointHealingOracle(w);
        assert.equal(r.supported, false); assert.equal(r.work.assignments, 0);
        assert.equal(r.constrained, null); assert.deepEqual(w.calls, []);
    }
});

test('the greedy-loss observation also preserves the exposed target baseline schedule when constrained', () => {
    const w = cases.find(([name]) => name === 'greedy 30 to 26 counterexample')[1]();
    const foe = world([], { enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 } }] }).enemies[0];
    w.enemies = freeze([foe]); w.creeps = freeze([...w.friends, foe]);
    const r = jointHealingOracle(w);
    assert.equal(r.exposureFloor.a, 24); assert.equal(r.constrained.total, 30);
    assert.equal(capacities(r.constrained).a, 24); assert.deepEqual(r.constrained.actions, r.baseline.actions);
});

test('oversized healer/target inputs and duplicate/missing targets/orders are rejected, never truncated', () => {
    const four = world(Array.from({ length: 4 }, (_, i) => healer(`h${i}`, 10 + i, 10)));
    assert.equal(jointHealingOracle(four).reason, 'healer-limit');
    const fifteen = world(Array.from({ length: 15 }, (_, i) => target(`c${i}`, 10 + i, 10, 1)));
    assert.equal(jointHealingOracle(fifteen).supported, false);
    const w = duplicateWorld();
    for (const options of [{ targets: w.friends.slice(1) }, { targets: [w.friends[0], w.friends[0], ...w.friends.slice(2)] },
        { executionOrder: w.friends.slice(1) }, { executionOrder: [w.friends[0], w.friends[0], ...w.friends.slice(2)] }]) {
        const r = jointHealingOracle(w, options); assert.equal(r.supported, false); assert.equal(r.work.assignments, 0);
    }
});

test('destroyed extra weapon parts do not turn a hybrid into an oracle-controlled pure healer', () => {
    const w = world([healer('h1', 10, 10), healer('mixed', 11, 10, 1,
        { body: [{ type: 'move', hits: 100 }, { type: 'heal', hits: 100 }, { type: 'ranged_attack', hits: 0 }] }),
    target('a', 10, 11, 4), target('b', 11, 11, 4)]);
    const r = jointHealingOracle(w); assert.deepEqual(r.healerIds, ['h1']);
    assert.deepEqual(r.constrained.actions.find(a => a.actorId === 'mixed'), r.baseline.actions.find(a => a.actorId === 'mixed'));
    assert.equal(r.constrained.total, r.baseline.total);
});

test('healer fatigue does not remove current healing eligibility or authorize a movement call', () => {
    const w = world([healer('h1', 10, 10, 1, { fatigue: 12 }), healer('h2', 11, 10),
        target('a', 10, 11, 4), target('b', 11, 11, 4)]);
    const r = jointHealingOracle(w); assert.equal(r.supported, true); assert.equal(r.constrained.total, 8);
    assert(r.constrained.actions.some(a => a.actorId === 'h1' && a.method === 'heal'));
    assert.deepEqual(w.calls, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHealingDecision } from '../../src/tactics/healing.js';
import { executeTactics } from '../../src/arena/execute.js';
import { world, healer, target, heals, total, duplicateWorld } from '../fixtures/healing-generated-world.js';
import { createHealingLedger, runHealingTick } from '../fixtures/healing-intent-ledger-candidate.js';


test('baseline reproduction: original selector and full executor trace agree before ledger comparison', async () => {
    const w = duplicateWorld();
    const injured = w.friends.filter(c => c.hits < c.hitsMax);
    assert.deepEqual(w.friends.slice(0, 2).map(h => selectHealingDecision(h, injured).action.target.id), ['a', 'a']);
    const observed = await runHealingTick(w);
    assert.deepEqual(heals(observed), [['h1', 'heal', 'a'], ['h2', 'heal', 'a']]);
    const start = w.calls.length; executeTactics(w.friends, [], injured, null, w);
    assert.deepEqual(w.calls.slice(start), observed.calls);
    assert.equal(observed.total, 4); assert.deepEqual(total(observed), { a: 24 });
    assert.equal(observed.work.selections, 0, 'disabled run bypasses test-side evaluation');
});

test('duplicate small wounds: accepted earlier capacity redirects only the next pure healer', async () => {
    const w = duplicateWorld(), before = JSON.stringify(w.friends);
    const baseline = await runHealingTick(w), candidate = await runHealingTick(w, { enabled: true });
    assert.deepEqual(heals(candidate), [['h1', 'heal', 'a'], ['h2', 'heal', 'b']]);
    assert.equal(baseline.total, 4); assert.equal(candidate.total, 8);
    assert.deepEqual(candidate.allocated, { a: 12, b: 12 });
    assert.equal(candidate.work.creditedActors, 2); assert.equal(candidate.work.searches, 0);
    assert.equal(JSON.stringify(w.friends), before);
    assert(candidate.records.filter(r => r.channel === 'healing').every(r => !r.actions.length || w.friends.includes(r.actions[0].target)));
});

test('necessary multi-healer focus remains when the observed deficit exceeds the accepted capacity', async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10), target('a', 10, 11, 40), target('b', 11, 11, 3)]);
    const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(heals(c), heals(b)); assert.deepEqual(total(c), { a: 24 }); assert.equal(c.total, 24);
});

test('direct and ranged capacities use observed range, not intended movement', async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10), target('a', 10, 11, 12), target('b', 13, 11, 20)]);
    const c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(heals(c), [['h1', 'heal', 'a'], ['h2', 'rangedHeal', 'b']]);
    assert.deepEqual(total(c), { a: 12, b: 4 }); assert.equal(c.total, 16);
});

for (const count of [0, 1, 2]) test(`validated ${count} owned healing flags affect accounting without changing first-call nominal ranking`, async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10), target('a', 10, 11, 12), target('b', 11, 11, 2)], { modifiers: count });
    const c = await runHealingTick(w, { enabled: true });
    assert.equal(c.modifier, 1 - count * 0.25);
    assert.deepEqual(heals(c), [['h1', 'heal', 'a'], ['h2', 'heal', count === 0 ? 'b' : 'a']]);
    assert.deepEqual(total(c), count === 0 ? { a: 12, b: 12 } : { a: 24 * c.modifier });
    assert.equal(c.total, count === 0 ? 14 : 12);
});

test('damaged HEAL parts never supply capacity; functioning fraction still supplies full per-part power', async () => {
    const damaged = [{ type: 'move', hits: 100 }, { type: 'heal', hits: 0 }, { type: 'heal', hits: 1 }];
    const w = world([healer('h1', 10, 10, 1, { body: damaged }), healer('h2', 11, 10),
        target('a', 10, 11, 15), target('b', 11, 11, 4)]);
    const c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(heals(c), [['h1', 'heal', 'h1'], ['h2', 'heal', 'a']]);
    assert.deepEqual(total(c), { h1: 12, a: 12 }); assert.equal(c.total, 24);
    assert.equal(w.friends[0].hits, 101); assert.equal(w.friends[0].hitsMax, 300);
});

for (const rc of [-9, undefined, null, '0', false, NaN, { code: 0 }, new Number(0)])
    test(`failed/unknown/non-numeric return ${String(rc)} receives no credit`, async () => {
        const w = duplicateWorld({ returns: { h1: rc } });
        const c = await runHealingTick(w, { enabled: true });
        assert.deepEqual(heals(c), [['h1', 'heal', 'a'], ['h2', 'heal', 'a']]);
        assert.deepEqual(c.allocated, { a: 12 }); assert.equal(c.total, 4);
    });

test('unknown modifier or extra effect fences selection and leaves accepted capacity explicitly unknown', async () => {
    for (const mode of ['missing-flags', 'malformed-owner', 'extra-effect']) {
        const base = duplicateWorld(); let flags = base.flags;
        if (mode === 'missing-flags') flags = [];
        if (mode === 'malformed-owner') flags = base.flags.map((f, i) => i ? f : { ...f, my: null });
        const w = world([healer('h1', 10, 10, 1, mode === 'extra-effect' ? { effects: [{ effectType: 'unknown', data: {} }] } : {}),
            healer('h2', 11, 10), target('a', 10, 11, 4), target('b', 11, 11, 4)], { flags });
        const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
        assert.equal(c.supported, false); assert.deepEqual(c.calls, b.calls);
        assert.deepEqual(c.allocated, {}); assert.equal(c.total, null); assert.equal(c.unknown.length, 2);
    }
});

test('greedy asymmetric reach counterexample is retained; changing actual execution order changes the allocation', async () => {
    const w = world([healer('flexible', 10, 10), healer('constrained', 11, 10),
        target('a', 10, 11, 10), target('b', 7, 10, 9)]);
    const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(heals(b), [['flexible', 'heal', 'a'], ['constrained', 'heal', 'a']]);
    assert.equal(b.total, 10);
    assert.deepEqual(heals(c), [['flexible', 'heal', 'a']]); assert.equal(c.total, 10);
    // Reordering is an explicit comparison, NEVER a candidate implementation step.
    const order = [w.friends[1], w.friends[0], ...w.friends.slice(2)];
    const changed = await runHealingTick(w, { enabled: true, order });
    assert.deepEqual(heals(changed), [['constrained', 'heal', 'a'], ['flexible', 'rangedHeal', 'b']]);
    assert.equal(changed.total, 14);
});

test('greedy direct/ranged allocation can be WORSE than independent baseline, without tuning away the loss', async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10), healer('h3', 13, 10),
        target('a', 10, 11, 20), target('b', 12, 11, 10)]);
    const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(heals(b), [['h1', 'heal', 'a'], ['h2', 'heal', 'a'], ['h3', 'heal', 'b']]);
    assert.deepEqual(heals(c), [['h1', 'heal', 'a'], ['h2', 'heal', 'b'], ['h3', 'rangedHeal', 'a']]);
    assert.equal(b.total, 30); assert.equal(c.total, 26);
    const alternate = await runHealingTick(w, { enabled: true,
        order: [w.friends[0], w.friends[2], w.friends[1], ...w.friends.slice(3)] });
    assert.deepEqual(heals(alternate), [['h1', 'heal', 'a'], ['h3', 'heal', 'b'], ['h2', 'heal', 'a']]);
    assert.equal(alternate.total, 30, 'Order sensitivity is retained, not repaired by sorting execution');
});

test('incoming-pressure risk: higher capped allocation does not establish adequate focus healing', async () => {
    const w = duplicateWorld({ enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 } }] });
    const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
    assert.equal(total(b).a, 24); assert.equal(total(c).a, 12);
    assert.equal(b.total, 4); assert.equal(c.total, 8);
    assert.equal(w.enemies[0].getRangeTo(w.friends[2]), 1);
    assert(w.enemies[0].body.some(p => p.type === 'attack' && p.hits > 0));
    // Potential reach is observed; no attack, damage, healing or casualty resolves.
    assert.equal(w.friends[2].hits, w.friends[2].hitsMax - 4);
});

test('tick-local reset: unchanged supplied observations select the first target again next invocation', async () => {
    const w = duplicateWorld();
    const one = await runHealingTick(w, { enabled: true }); w.tick++;
    const two = await runHealingTick(w, { enabled: true });
    assert.deepEqual(two.calls, one.calls); assert.deepEqual(two.allocated, one.allocated);
});

test('duplicate callback is counted once; unsupported actions, methods and ranges supply no ledger capacity', () => {
    const w = duplicateWorld(), l = createHealingLedger(w.friends, w.friends, w.flags);
    l.record('h1', 'heal', 'a', 0); l.record('h1', 'heal', 'a', 0);
    assert.deepEqual(l.result().allocated, { a: 12 });
    const other = createHealingLedger(w.friends, w.friends, w.flags);
    other.record('h1', 'rangedAttack', 'a', 0); assert.equal(other.result().total, 0);
    other.record('h2', 'rangedHeal', 'a', 0); // Adjacent rangedHeal is outside this selector's supported method/range pairing.
    assert.deepEqual(other.result().allocated, {}); assert.equal(other.result().total, null);
});

test('duplicate actor in execution input fences the ledger rather than counting a second engine intent', async () => {
    const w = duplicateWorld(), order = [w.friends[0], w.friends[0], ...w.friends.slice(1)];
    const b = await runHealingTick(w, { order }), c = await runHealingTick(w, { enabled: true, order });
    assert.equal(c.supported, false); assert.deepEqual(c.calls, b.calls); assert.deepEqual(c.allocated, {});
    assert.equal(c.total, null);
});

test('injured-input ordering and duplicate target references are irrelevant with fixed execution order', async () => {
    const w = duplicateWorld(), a = await runHealingTick(w, { enabled: true });
    const b = await runHealingTick(w, { enabled: true, injured: [w.friends[3], w.friends[2], w.friends[2]] });
    assert.deepEqual(b.calls, a.calls); assert.equal(b.total, a.total);
});

test('hybrids, including destroyed extra weapons, retain independent selection and compatible attacks', async () => {
    for (const ranged of [false, true]) {
        const extra = ranged ? { ranged_attack: 1 } : { attack: 1 };
        const w = world([healer('h1', 10, 10), { ...healer('mixed', 11, 10), parts: { move: 1, heal: 1, ...extra } },
            target('a', 10, 11, 4), target('b', 13, 11, 4)],
        { enemies: [{ id: 'foe', x: 12, y: 10, parts: { move: 1, attack: 1 } }] });
        const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
        assert.deepEqual(c.calls.filter(x => x.actor === 'mixed'), b.calls.filter(x => x.actor === 'mixed'));
        assert.deepEqual(c.allocated, { a: 12 });
        assert.equal(c.calls.some(x => x.actor === 'mixed' && x.method === 'rangedAttack'), ranged);
        assert(!c.calls.some(x => x.actor === 'mixed' && x.method === 'attack'));
    }
    const body = [{ type: 'move', hits: 100 }, { type: 'heal', hits: 100 }, { type: 'ranged_attack', hits: 0 }];
    const w = world([healer('h1', 10, 10), healer('mixed', 11, 10, 1, { body }),
        target('a', 10, 11, 4), target('b', 11, 11, 4)]);
    const c = await runHealingTick(w, { enabled: true });
    const b = await runHealingTick(w);
    assert.deepEqual(c.calls, b.calls);
    assert.deepEqual(heals(c), [['h1', 'heal', 'mixed'], ['mixed', 'heal', 'mixed']]);
    assert.deepEqual(c.allocated, { mixed: 12 });
});

test('real movement pass and hybrid ranged-heal attack exclusions remain unchanged', async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10),
        { id: 'mixed', x: 12, y: 10, parts: { move: 1, heal: 1, ranged_attack: 1 } },
        target('a', 10, 11, 3), target('b', 11, 11, 3), target('far', 15, 10, 50)],
    { enemies: [{ id: 'foe', x: 14, y: 10, parts: { move: 1, ranged_attack: 1 } }] });
    const b = await runHealingTick(w, { movement: true }), c = await runHealingTick(w, { enabled: true, movement: true });
    const moves = r => r.calls.filter(x => ['move', 'moveTo'].includes(x.method));
    assert.deepEqual(moves(c), moves(b));
    assert.deepEqual(c.calls.filter(x => x.actor === 'mixed'), b.calls.filter(x => x.actor === 'mixed'));
    assert(c.calls.some(x => x.actor === 'mixed' && x.method === 'rangedHeal'));
    assert(!c.calls.some(x => x.actor === 'mixed' && x.method === 'rangedAttack'));
});

test('hybrids cannot fund later pure-healer credits even when their scheduled capacity is measurable', async () => {
    const w = world([{ id: 'mixed', x: 10, y: 10, parts: { move: 1, heal: 1, ranged_attack: 1 } },
        healer('h', 11, 10), target('a', 10, 11, 4), target('b', 11, 11, 4)]);
    const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(c.calls, b.calls); assert.deepEqual(total(c), { a: 24 });
    assert.deepEqual(c.allocated, { a: 12 }); assert.equal(c.work.creditedActors, 1);
});

test('self is included once and fully scheduled injuries do not generate another healing call', async () => {
    const w = world([healer('h1', 10, 10, 1, { deficit: 3 }), healer('h2', 11, 10)]);
    const c = await runHealingTick(w, { enabled: true,
        injured: [w.friends[0], w.friends[0], w.friends[0]] });
    assert.deepEqual(heals(c), [['h1', 'heal', 'h1']]);
    assert.equal(c.total, 3); assert.deepEqual(c.allocated, { h1: 12 });
    assert.equal(w.friends[0].hits, w.friends[0].hitsMax - 3);
});

test('zero-functioning-HEAL actors do not acquire a healing action or contribute ledger capacity', async () => {
    const w = world([healer('h1', 10, 10, 1, { body: [{ type: 'move', hits: 100 }, { type: 'heal', hits: 0 }] }),
        healer('h2', 11, 10), target('a', 10, 11, 4), target('b', 11, 11, 4)]);
    const b = await runHealingTick(w), c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(c.calls, b.calls); assert.deepEqual(heals(c), [['h2', 'heal', 'h1']]);
    assert.equal(c.work.creditedActors, 1);
});

test('real movement priorities are unchanged for explicit escort ownership and adjacent emergency retreat', async () => {
    const w = world([healer('h1', 10, 10), healer('h2', 11, 10),
        { id: 'ranged', x: 12, y: 10, parts: { move: 1, ranged_attack: 1 } },
        target('a', 10, 11, 4), target('b', 11, 11, 4)],
    { enemies: [{ id: 'foe', x: 13, y: 10, parts: { move: 1, attack: 1 } }] });
    w.escort = { healerId: 'h1', allyId: 'a', ally: w.friends[3], mode: 'hold' };
    const b = await runHealingTick(w, { movement: true }), c = await runHealingTick(w, { enabled: true, movement: true });
    assert.deepEqual(c.calls.filter(x => ['move', 'moveTo'].includes(x.method)),
        b.calls.filter(x => ['move', 'moveTo'].includes(x.method)));
    assert(c.records.some(r => r.reason === 'ranged-melee-retreat'));
    assert(c.records.some(r => r.reason?.startsWith('escort-')));
});

test('full 14-actor generated roster remains bounded, including duplicate damaged-reference filtering', async () => {
    const specs = [healer('h1', 10, 10), healer('h2', 11, 10), healer('h3', 12, 10),
        target('a', 10, 11, 4), target('b', 11, 11, 4), target('c', 12, 11, 4),
        ...Array.from({ length: 8 }, (_, i) => target(`outside${i}`, 60 + i, 60, 0))];
    const w = world(specs), c = await runHealingTick(w, { enabled: true });
    assert.equal(c.supported, true); assert.equal(c.total, 12);
    assert(c.work.selections <= 14); assert(c.work.rankingViews <= 14 * 14);
    assert.equal(c.work.creditedActors, 3); assert.equal(c.work.searches, 0);
    assert(c.calls.every(x => ['heal', 'rangedHeal'].includes(x.method)));
});

test('actual interleaved tactical execution order and hybrid attack follow the original executor', async () => {
    const w = world([healer('h1', 10, 10),
        { id: 'mixed', x: 11, y: 10, parts: { move: 1, heal: 1, ranged_attack: 1 } },
        healer('h2', 11, 12), target('a', 10, 11, 4), target('b', 12, 11, 4)],
    { enemies: [{ id: 'foe', x: 12, y: 9, parts: { move: 1, attack: 1 } }] });
    const c = await runHealingTick(w, { enabled: true });
    assert.deepEqual(c.calls.map(x => [x.actor, x.method, x.target]), [
        ['h1', 'heal', 'a'], ['mixed', 'heal', 'a'], ['mixed', 'rangedAttack', 'foe'], ['h2', 'heal', 'b'],
    ]);
    assert.deepEqual(c.records.filter(r => r.phase === 'tactics').map(r => [r.actorId, r.channel]),
        w.friends.flatMap(c => [[c.id, 'healing'], [c.id, 'combat']]));
});

test('unobserved actor/target and out-of-range accepted calls remain unsupported, never invented capacity', () => {
    const w = world([healer('h', 10, 10), target('far', 14, 10, 20)]);
    for (const [actor, method, id] of [['h', 'rangedHeal', 'far'], ['unknown', 'heal', 'far'], ['h', 'heal', 'unknown']]) {
        const l = createHealingLedger(w.friends, w.friends, w.flags); l.record(actor, method, id, 0);
        assert.deepEqual(l.result().allocated, {}); assert.equal(l.result().total, null);
        assert.equal(l.result().unknown.length, 1);
    }
});

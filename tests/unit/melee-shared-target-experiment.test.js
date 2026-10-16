import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sharedTargetPlan, sharedWeapons } from '../fixtures/melee-shared-target-candidate.js';
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { executeTactics, moveCreeps } from '../../src/arena/execute.js';
const retained = JSON.parse(fs.readFileSync(new URL('../fixtures/melee-pursuit-window.json', import.meta.url)));
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const flag = { id: 'first', x: 49, y: 49 };
function unit(id, x, y, types, options = {}) {
    const c = { id, x, y, my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: types.map(type => ({ type, hits: 100 })), ...options, calls: [],
        getRangeTo(t) { return range(this, t); } };
    for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
        c[method] = target => { c.calls.push({ method, id: target.id, x: target.x, y: target.y }); return 0; };
    }
    return c;
}
function window(tick) {
    const w = retained.windows.find(w => w.tick === tick);
    const convert = c => unit(c.id, c.x, c.y, Object.entries(c.parts).flatMap(([t, n]) => Array(n).fill(t)),
        { my: c.my, hits: c.hits, hitsMax: retained.windows[0].friends.find(f => f.id === c.id)?.hits ?? c.hits });
    const friends = w.friends.map(convert), enemies = w.enemies.map(convert);
    return { friends, enemies, actor: friends.find(f => f.id === 'pg_player2_melee_3'), recorded: w.recorded };
}
const plan = (w, previous, candidate = true, escort = null) => candidate
    ? sharedTargetPlan(w.actor, w.enemies, flag, previous, w.friends, escort)
    : selectMovementPlan(w.actor, w.enemies, flag, previous, w.friends);
function small() {
    return { actor: unit('m', 0, 0, ['attack', 'move']),
        enemies: [unit('a', -2, 0, ['ranged_attack', 'move'], { my: false }),
            unit('b', 0, -2, ['ranged_attack', 'move'], { my: false })],
        friends: [unit('h', 2, 1, ['heal', 'move']), unit('r', 2, -3, ['ranged_attack', 'move'])] };
}

test('retained36..40: only tick39 changes; adjacent attack hold at40 is preserved', t => {
    let baseline, candidate;
    const comparisons = [];
    for (const tick of [36, 37, 38, 39, 40]) {
        const w = window(tick), b = plan(w, baseline, false), c = plan(w, candidate);
        assert.equal(b.reason, w.recorded.reason);
        assert.equal(b.target?.id ?? null, w.recorded.target?.id ?? null);
        if (tick === 39) {
            assert.equal(c.target.id, 'pg_player1_ranged_4');
            assert.equal(sharedWeapons(w.actor, b.target, w.friends), 0);
            assert.equal(sharedWeapons(w.actor, c.target, w.friends), 2);
        } else assert.equal(c.target?.id, b.target?.id);
        comparisons.push({ tick, baseline: b.engagement?.id, candidate: c.engagement?.id, reason: c.reason });
        baseline = b.engagement; candidate = c.engagement;
    }
    t.diagnostic(JSON.stringify({ fixedObservationComparison: comparisons }));
});

test('stable observations select deterministically; support loss, acquisition bound and absent targets fallback', () => {
    const w = small();
    for (let i = 0; i < 4; i++) {
        assert.equal(plan(w).target.id, 'b');
        w.friends.reverse(); w.enemies.reverse();
    }
    w.friends.find(f => f.id === 'r').body[0].hits = 0;
    assert.equal(plan(w).target.id, 'a');
    w.enemies.forEach(e => { e.x = -20; });
    assert.equal(plan(w).reason, 'flag-fallback');
    w.enemies = [];
    assert.equal(plan(w).reason, 'flag-fallback');
});

test('no new pause, refreshed budget, rejoin bypass, mixed-role takeover or escort override', () => {
    const w = small(), previous = { id: 'a', outsideTicks: 0, supportWaitTicks: 2 };
    assert.equal(plan(w, previous).engagement.supportWaitTicks, 2);
    assert.equal(plan(w, previous).engagement.id, 'b');
    assert.equal(plan(w, previous, true, { healerId: 'h' }).target.id, 'a');
    assert.deepEqual(plan(w, { ...previous, pursuit: {} }), plan(w, { ...previous, pursuit: {} }, false));
    const rejoin = { ...previous, rejoin: { targetId: 'a', healerId: 'h', ticks: 0, done: false } };
    assert.deepEqual(plan(w, rejoin), plan(w, rejoin, false));
    w.friends.find(f => f.id === 'h').x = 4;
    assert.equal(plan(w).reason, 'await-local-healer');
    w.actor.body.push({ type: 'heal', hits: 0 });
    assert.deepEqual(plan(w), plan(w, undefined, false));
});

test('same-observation tactics and explicit executor escort stay unchanged', () => {
    const w = window(39);
    executeTactics(w.friends, w.enemies, w.friends.filter(f => f.hits < f.hitsMax));
    const before = w.friends.map(c => [...c.calls]);
    plan(w);
    w.friends.forEach(c => { c.calls.length = 0; });
    executeTactics(w.friends, w.enemies, w.friends.filter(f => f.hits < f.hitsMax));
    assert.deepEqual(w.friends.map(c => c.calls), before);
    const h = w.friends.find(c => c.id.endsWith('healer_3'));
    h.calls.length = 0;
    moveCreeps([h], w.enemies, flag, new Map(), new Map(),
        { healerId: h.id, allyId: w.actor.id, ally: w.actor, distance: 4, mode: 'move-attempt' });
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].id, w.actor.id);
});

function trajectory(candidate, blocked) {
    const w = window(39), trace = []; let previous;
    if (blocked) w.friends.find(f => f.id.endsWith('scout_2')).x = 50;
    if (blocked) w.friends.find(f => f.id.endsWith('scout_2')).y = 47;
    const all = [...w.friends, ...w.enemies];
    for (let tick = 39; tick <= 42; tick++) {
        const p = plan(w, previous, candidate); previous = p.engagement;
        const before = { x: w.actor.x, y: w.actor.y };
        // Frozen support/enemy positions and one direct step; conservative
        // occupancy rejection, not Arena routes/collisions/combat resolution.
        if (p.target) {
            const next = { x: before.x + Math.sign(p.target.x - before.x), y: before.y + Math.sign(p.target.y - before.y) };
            if (!all.some(c => c !== w.actor && range(c, next) === 0)) Object.assign(w.actor, next);
        }
        assert.equal(new Set(all.map(c => `${c.x},${c.y}`)).size, all.length);
        trace.push({ tick, target: p.target?.id ?? null, reason: p.reason, x: w.actor.x, y: w.actor.y });
    }
    return trace;
}
test('generated distinct-cell multi-tick movement can be identical despite changed target; blocking remains', t => {
    for (const blocked of [false, true]) {
        const b = trajectory(false, blocked), c = trajectory(true, blocked);
        assert.deepEqual(c.map(r => [r.x, r.y]), b.map(r => [r.x, r.y]));
        assert.equal(c[0].target, 'pg_player1_ranged_4');
        assert.equal(c.at(-1).reason, blocked ? 'equal-range-shared-pursuit' : 'combat-in-range');
        t.diagnostic(JSON.stringify({ blocked, baseline: b, candidate: c }));
    }
});

test('support flicker reveals target oscillation without restoring waits: reject integration', () => {
    const w = small(); let previous = { id: 'a', supportWaitTicks: 2 }, targets = [];
    for (let tick = 0; tick < 4; tick++) {
        w.friends.find(f => f.id === 'r').body[0].hits = tick % 2 ? 0 : 100;
        const p = plan(w, previous); previous = p.engagement;
        targets.push(p.target.id); assert.equal(previous.supportWaitTicks, 2);
    }
    assert.deepEqual(targets, ['b', 'a', 'b', 'a']);
});

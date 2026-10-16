import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planOpeningRally, rallyRole } from '../fixtures/opening-rally-candidate.js';
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { planHealerEscort } from '../../src/tactics/healer-escort.js';

const retained = JSON.parse(fs.readFileSync(new URL('../fixtures/opening-rally-window.json', import.meta.url)));
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const parts = (c, t) => c.body.filter(p => p.type === t && p.hits > 0).length;
function world(records, flag = { id: 'first', x: -8, y: 0, my: undefined }, enemies = []) {
    const w = { calls: [], queued: new Map(), engagements: new Map(), transferred: new Set(),
        rally: null, escort: null, lastTick: null, flags: [flag] };
    function actor(c) {
        const body = c.body ?? Object.entries(c.activeBodyParts).flatMap(([type, n]) =>
            Array.from({ length: n }, () => ({ type, hits: 100 })));
        const unit = { exists: true, my: true, hits: 100, hitsMax: 100, fatigue: 0, ...c,
            body: body.map(p => ({ ...p })), getRangeTo(t) { return range(this, t); } };
        unit.moveTo = t => { w.calls.push([unit.id, 'moveTo', t.id ?? [t.x, t.y]]);
            w.queued.set(unit.id, { x: t.x, y: t.y }); return 0; };
        for (const method of ['attack', 'rangedAttack', 'heal', 'rangedHeal']) {
            unit[method] = t => { w.calls.push([unit.id, method, t.id]); return 0; };
        }
        return unit;
    }
    w.friends = records.map(actor); w.enemies = enemies.map(c => actor({ ...c, my: false }));
    return w;
}
const unit = (id, x, y, role) => ({ id, x, y, activeBodyParts: { [role]: 1, move: 1 } });
function simple() {
    // Generated lanes: one lagging ranged unit needs two unobstructed steps.
    return world([unit('m0', 0, 0, 'attack'), unit('m1', 1, 0, 'attack'), unit('m2', 1, 1, 'attack'),
        unit('r0', 0, 1, 'ranged_attack'), unit('r1', 0, -1, 'ranged_attack'), unit('r2', 5, 2, 'ranged_attack'),
        unit('h0', 1, -1, 'heal'), unit('h1', 2, 1, 'heal')]);
}
function snapshot(w, tick) {
    return { tick, flags: w.flags, myCreeps: w.friends, enemies: w.enemies };
}
function metrics(w) {
    const melee = w.friends.filter(c => parts(c, 'attack')), ranged = w.friends.filter(c => parts(c, 'ranged_attack'));
    const healers = w.friends.filter(c => parts(c, 'heal'));
    return { reachableMelee: melee.filter(c => w.enemies.some(e => range(c, e) <= 1)).length,
        reachableRanged: ranged.filter(c => w.enemies.some(e => range(c, e) <= 3)).length,
        meleeWithHealAccess: melee.filter(c => healers.some(h => range(c, h) <= 3)).length,
        meleeWithAdjacentHeal: melee.filter(c => healers.some(h => range(c, h) <= 1)).length,
        nominalAccess: melee.map(c => ({ id: c.id, capacity: healers.reduce((n, h) => n + parts(h, 'heal') *
            (range(c, h) <= 1 ? 12 : range(c, h) <= 3 ? 4 : 0), 0) })),
        flagRange: Math.min(...w.friends.map(c => range(c, w.flags[0]))) };
}
function step(w, tick, candidate = true, { blocked = new Set(), conservative = true, approachEnemy = false } = {}) {
    w.calls.length = 0; w.queued.clear();
    if (w.lastTick !== null && tick <= w.lastTick) { w.engagements.clear(); w.transferred.clear(); w.escort = null; }
    w.lastTick = tick;
    const state = snapshot(w, tick), escort = planHealerEscort(state, w.flags[0], w.escort);
    w.escort = escort.state;
    const plan = candidate ? planOpeningRally(state, w.rally, escort.escort) : null;
    if (plan) w.rally = plan.state;
    const decisions = [];
    if (!candidate) {
        moveCreeps(w.friends, w.enemies, w.flags[0], w.engagements, new Map(), escort.escort, null,
            { decision: d => { decisions.push(d); return null; } });
    } else {
        for (const c of w.friends) {
            // One-time handoff only at the first real local engagement. Never
            // seed new waits repeatedly after a later full disengagement.
            const spent = plan.state.spentWaits[c.id] ?? 0;
            if (plan.state.phase === 'finished' && spent && !w.transferred.has(c.id) &&
                w.enemies.some(e => e.hits > 0 && range(c, e) <= 5)) {
                w.engagements.set(c.id, { ...w.engagements.get(c.id), supportWaitTicks: spent });
                w.transferred.add(c.id);
            }
            if (escort.escort?.healerId === c.id) {
                if (escort.escort.mode === 'move-attempt') c.moveTo(escort.escort.ally);
                decisions.push({ actorId: c.id, reason: `escort-${escort.escort.mode}` }); continue;
            }
            const normal = selectMovementPlan(c, w.enemies, w.flags[0], w.engagements.get(c.id), w.friends);
            if (normal.engagement) w.engagements.set(c.id, normal.engagement); else w.engagements.delete(c.id);
            const override = plan.moves.get(c.id), selected = override ?? normal;
            decisions.push({ actorId: c.id, reason: selected.reason });
            if (selected.target) c.moveTo(selected.target);
        }
    }
    // Production tactical selectors/executor, unchanged and run once. No damage
    // or healing effects are simulated; movement resolves only afterward.
    executeTactics(w.friends, w.enemies, w.friends.filter(c => c.hits < c.hitsMax));
    const before = w.friends.map(c => ({ id: c.id, x: c.x, y: c.y })), capacity = metrics(w);
    for (const c of w.friends) assert(w.calls.filter(a => a[0] === c.id && a[1] === 'moveTo').length <= 1);
    if (approachEnemy) for (const c of w.enemies) w.queued.set(c.id, w.flags[0]);
    const all = [...w.friends, ...w.enemies], proposed = new Map();
    for (const c of all) { const t = w.queued.get(c.id); if (t && !blocked.has(c.id) && !c.fatigue) proposed.set(c.id,
        { x: c.x + Math.sign(t.x - c.x), y: c.y + Math.sign(t.y - c.y) }); }
    // Conservative stress resolver: reject occupied destinations even when the
    // occupant wanted to vacate, plus all multiply requested cells. No swaps,
    // terrain or Arena arbitration. The permissive comparison ignores these.
    let rejectedMoves = 0;
    const accepted = [...proposed].filter(([id, p]) => {
        const occupied = all.some(c => c.id !== id && c.x === p.x && c.y === p.y);
        const conflict = [...proposed].some(([other, q]) => other !== id && p.x === q.x && p.y === q.y);
        if (conservative && (occupied || conflict)) { rejectedMoves++; return false; } return true;
    });
    for (const [id, p] of accepted) Object.assign(all.find(c => c.id === id), p);
    const cells = new Set(all.map(c => `${c.x},${c.y}`));
    if (conservative) assert.equal(cells.size, all.length, 'Conservative fixture never invents overlapping units');
    return { tick, rally: plan?.reason ?? 'baseline', readiness: plan?.readiness, before,
        after: w.friends.map(c => ({ id: c.id, x: c.x, y: c.y })), capacity,
        decisions, calls: [...w.calls], rejectedMoves, duplicateCellOccupants: all.length - cells.size };
}

test('generated quorum catches up, releases once, and does not reacquire', t => {
    const w = simple(), trace = [step(w, 1), step(w, 2), step(w, 3), step(w, 4)];
    assert.deepEqual(trace.map(t => t.rally), ['opening-rally', 'opening-rally', 'rally-ready', 'rally-finished']);
    assert.equal(trace[2].readiness.ready, true);
    assert(trace[2].calls.some(a => a[0] === 'm0' && a[1] === 'moveTo'));
    t.diagnostic(JSON.stringify({ quorumTrace: trace.map(t => ({ tick: t.tick, reason: t.rally, readiness: t.readiness })) }));
});

test('blocked support times out before a third rally wait; missing support never starts', () => {
    const w = simple(), trace = [];
    for (let tick = 1; tick <= 12; tick++) trace.push(step(w, tick, true, { blocked: new Set(['r2']) }));
    assert.equal(trace[2].rally, 'rally-timeout');
    assert(trace.slice(3).every(t => t.rally === 'rally-finished'));
    const missing = simple(); missing.friends = missing.friends.filter(c => c.id !== 'h1');
    assert.equal(step(missing, 1).rally, 'missing-quorum');
});

test('enemy approach releases immediately and adjacent attacks remain available', () => {
    const w = simple(); step(w, 1);
    w.enemies = world([], undefined, [unit('enemy', -1, 0, 'attack')]).enemies;
    const row = step(w, 2);
    assert.equal(row.rally, 'enemy-approach');
    assert(row.calls.some(a => a[0] === 'm0' && a[1] === 'attack' && a[2] === 'enemy'));
});

test('rally melee holds consume the existing allowance, not two more support waits', () => {
    const w = simple(); step(w, 1); step(w, 2); step(w, 3);
    assert.equal(w.rally.spentWaits.m0, 2);
    const m = w.friends.find(c => c.id === 'm0');
    w.friends.filter(c => parts(c, 'heal')).forEach((c, i) => { c.x = m.x + 4 + i; c.y = m.y; });
    w.enemies = world([], undefined, [unit('enemy', m.x - 4, m.y, 'attack')]).enemies;
    const row = step(w, 4);
    assert.equal(row.decisions.find(d => d.actorId === 'm0').reason, 'combat-approach');
    assert.equal(w.engagements.get('m0').supportWaitTicks, 2);
    assert.equal(w.transferred.has('m0'), true);
});

test('escort, ownership, injury, fatigue and member loss terminate without a second command', () => {
    const w = simple(); const active = planOpeningRally(snapshot(w, 1));
    const before = JSON.stringify(snapshot(w, 2)), old = JSON.stringify(active.state);
    assert.equal(planOpeningRally(snapshot(w, 2), active.state, { healerId: 'h0' }).reason, 'escort-priority');
    assert.equal(JSON.stringify(snapshot(w, 2)), before); assert.equal(JSON.stringify(active.state), old);
    w.flags[0].my = true;
    assert.equal(planOpeningRally(snapshot(w, 2), active.state).reason, 'objective-no-longer-neutral');
    for (const change of [c => { c.fatigue = 1; }, c => { c.hits--; }, c => { c.body[1].hits = 0; }]) {
        const f = simple(); const first = planOpeningRally(snapshot(f, 1)); change(f.friends.find(c => c.id === 'h0'));
        assert.equal(planOpeningRally(snapshot(f, 2), first.state).reason, 'support-unavailable');
    }
    const lost = simple(), first = planOpeningRally(snapshot(lost, 1)); lost.friends.pop();
    assert.equal(planOpeningRally(snapshot(lost, 2), first.state).reason, 'rally-member-lost');
});

test('deterministic fixed anchor, reset, finite roster, and unchanged mixed/scout routing', () => {
    const w = simple(), reversed = simple(); reversed.friends.reverse();
    assert.deepEqual(planOpeningRally(snapshot(w, 1)).state.anchor, planOpeningRally(snapshot(reversed, 1)).state.anchor);
    const ended = { ...planOpeningRally(snapshot(w, 1)).state, phase: 'finished', lastTick: 10 };
    assert.equal(planOpeningRally(snapshot(w, 1), ended).reason, 'opening-rally');
    w.friends.push(...Array.from({ length: 7 }, (_, i) => ({ ...w.friends[0], id: `extra${i}` })));
    assert.equal(planOpeningRally(snapshot(w, 1)).reason, 'unsupported-roster');
    const mixed = simple(); mixed.friends.push(world([unit('mixed', 2, 2, 'attack')]).friends[0]);
    mixed.friends.at(-1).body.push({ type: 'heal', hits: 0 });
    assert.equal(rallyRole(mixed.friends.at(-1)), null);
    assert.equal(planOpeningRally(snapshot(mixed, 1)).moves.has('mixed'), false);
    const scout = world([{ id: 'scout', x: 3, y: 2, activeBodyParts: { move: 1 } }]).friends[0];
    mixed.friends.push(scout);
    assert.equal(planOpeningRally(snapshot(mixed, 1)).moves.has('scout'), false);
});

test('role changes and duplicate identities reject rather than silently re-forming the group', () => {
    const w = simple();
    w.friends.push(world([unit('extra-melee', 1, 2, 'attack')]).friends[0]);
    const first = planOpeningRally(snapshot(w, 1));
    w.friends[0].body[0].type = 'ranged_attack';
    assert.equal(planOpeningRally(snapshot(w, 2), first.state).reason, 'rally-role-changed');
    const duplicate = simple(); duplicate.friends.push(duplicate.friends[0]);
    assert.equal(planOpeningRally(snapshot(duplicate, 1)).reason, 'unsupported-roster');
});

test('actors that advanced into rally keep unused local support pauses; spent transfer is once only', () => {
    const w = simple();
    w.friends.push(world([unit('m3', 5, -2, 'attack')]).friends[0]);
    step(w, 1); step(w, 2); step(w, 3);
    assert.equal(w.rally.spentWaits.m3, undefined);
    const m = w.friends.find(c => c.id === 'm3');
    for (const c of w.friends.filter(c => parts(c, 'heal'))) { c.x = m.x + 4; c.y = m.y; }
    w.enemies = world([], undefined, [unit('enemy', m.x - 4, m.y, 'attack')]).enemies;
    assert.equal(step(w, 4, true, { conservative: false }).decisions.find(d => d.actorId === 'm3').reason, 'await-local-healer');
    const spent = simple(); step(spent, 1); step(spent, 2); step(spent, 3);
    const front = spent.friends.find(c => c.id === 'm0');
    for (const h of spent.friends.filter(c => parts(c, 'heal'))) { h.x = front.x + 4; h.y = front.y; }
    spent.enemies = world([], undefined, [unit('e', front.x - 4, front.y, 'attack')]).enemies;
    step(spent, 4, true, { conservative: false }); assert(spent.transferred.has('m0'));
    spent.enemies[0].x = 99; spent.enemies[0].y = 99;
    step(spent, 5, true, { conservative: false }); step(spent, 6, true, { conservative: false });
    spent.enemies[0].x = front.x - 4; spent.enemies[0].y = front.y;
    for (const h of spent.friends.filter(c => parts(c, 'heal'))) { h.x = front.x + 4; h.y = front.y; }
    assert.equal(step(spent, 7, true, { conservative: false }).decisions.find(d => d.actorId === 'm0').reason, 'await-local-healer');
});

test('rally overrides do not change same-observation healing/attack selection', () => {
    const w = simple(), control = simple();
    // Real available healing, but candidate invalidates on injury before taking control.
    w.friends[0].hits = control.friends[0].hits = 90;
    w.enemies = world([], undefined, [unit('e', -1, 0, 'attack')]).enemies;
    control.enemies = world([], undefined, [unit('e', -1, 0, 'attack')]).enemies;
    const a = step(w, 1), b = step(control, 1, false);
    assert.deepEqual(a.calls.filter(c => c[1] !== 'moveTo'), b.calls.filter(c => c[1] !== 'moveTo'));
    assert(a.calls.some(c => c[1] === 'heal')); assert(a.calls.some(c => c[1] === 'attack'));
});

test('replay-shaped generated approach: compare coordination, pressure and congestion without combat effects', t => {
    const outputs = [];
    for (const conservative of [false, true]) for (const candidate of [false, true]) {
        const s = retained.state, w = world(s.creeps.filter(c => c.my), { ...s.flags[0], my: undefined }, s.creeps.filter(c => !c.my));
        const trace = [];
        for (let tick = 30; tick <= 44; tick++) trace.push(step(w, tick, candidate, { conservative, approachEnemy: true }));
        assert(trace.filter(r => r.rally === 'opening-rally').length <= 2);
        assert(w.friends.every(c => c.hits === c.hitsMax), 'No damage/survival outcome is simulated');
        outputs.push({ model: conservative ? 'conservative-blocking-stress' : 'permissive-empty-grid', candidate,
            firstContact: trace.find(r => r.capacity.reachableMelee || r.capacity.reachableRanged)?.tick ?? null,
            firstFlagTileReach: trace.find(r => r.capacity.flagRange === 0)?.tick ?? null,
            trace: trace.map(r => ({ tick: r.tick, rally: r.rally, readiness: r.readiness,
                capacity: r.capacity, rejectedMoves: r.rejectedMoves, duplicateCellOccupants: r.duplicateCellOccupants })) });
    }
    t.diagnostic(JSON.stringify({ generatedComparison: outputs }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { selectMovementPlan } from '../../src/tactics/movement.js';

function unit(id, x, y, parts, options = {}) {
    const actor = { id, x, y, my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: parts.map(type => ({ type, hits: 100 })), ...options, calls: [],
        getRangeTo(t) { return Math.max(Math.abs(this.x - t.x), Math.abs(this.y - t.y)); } };
    for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
        actor[method] = target => { actor.calls.push({ method, id: target.id, x: target.x, y: target.y }); return 0; };
    }
    return actor;
}

test('synthetic successive ticks pursue, abandon a retreating ranged target, rejoin and do not oscillate', t => {
    // Empty-grid simultaneous one-step movement, not Arena routing or a replay
    // counterfactual. Enemy motion/health are controlled; no damage is simulated.
    const front = unit('front', 0, 0, ['attack', 'move']);
    const healer = unit('healer', 4, 0, ['heal', 'move']);
    const enemy = unit('ranged', -3, 0, ['ranged_attack', 'move'], { my: false });
    const flag = { id: 'first', x: 4, y: 0, my: true };
    const friends = [front, healer], engagements = new Map(), trace = [];
    for (let tick = 1; tick <= 12; tick++) {
        if (tick === 5) enemy.x = -4; // Retreat cancels the previous closing step.
        if (tick > 5) enemy.x = front.x - (tick === 12 ? 1 : 2);
        for (const c of friends) c.calls.length = 0;
        const decisions = [];
        moveCreeps(friends, [enemy], flag, engagements, new Map(), null, null,
            { decision: d => { decisions.push(d); return null; } });
        executeTactics(friends, [enemy], []);
        const from = front.x, targets = new Map(friends.map(c => [c.id, c.calls.find(a => a.method === 'moveTo')]));
        for (const c of friends) {
            assert.ok(c.calls.filter(a => a.method === 'moveTo').length <= 1);
            const target = targets.get(c.id);
            if (target) { c.x += Math.sign(target.x - c.x); c.y += Math.sign(target.y - c.y); }
        }
        trace.push({ tick, from, to: front.x, healerRange: front.getRangeTo(healer),
            reason: decisions.find(d => d.actorId === front.id).reason, calls: [...front.calls] });
    }
    t.diagnostic(JSON.stringify(trace));
    assert.deepEqual(trace.slice(0, 4).map(t => t.reason),
        ['await-local-healer', 'await-local-healer', 'combat-approach', 'combat-approach']);
    assert.equal(trace[4].reason, 'melee-rejoin-support');
    assert.equal(trace[4].calls[0].id, 'healer');
    assert.ok(trace[4].to > trace[4].from);
    assert.ok(trace.some(t => t.tick >= 5 && t.healerRange <= 3));
    assert.equal(trace.filter(t => t.reason === 'rejoin-arrived').length, 1);
    assert.ok(trace.slice(4).every(t => !t.calls.some(a => a.method === 'moveTo' && a.id === 'ranged')));
    assert.equal(trace[11].reason, 'combat-in-range');
    assert.ok(trace[11].calls.some(a => a.method === 'attack'));
});

function snapshot() {
    // Observed melee4 tick47→48 geometry from retained Glaucous review. Bodies
    // are minimal generated eligibility values, not historical per-part HP.
    const actor = unit('front', 41, 57, ['attack', 'move'], { hits: 81 });
    const enemy = unit('ranged', 41, 59, ['ranged_attack', 'move'], { my: false });
    const healer = unit('healer', 48, 50, ['heal', 'move']);
    const flag = { id: 'first', x: 49, y: 49, my: true };
    const previous = { id: 'ranged', outsideTicks: 0, supportWaitTicks: 2,
        pursuit: { x: 42, y: 56, targetX: 42, targetY: 58, range: 2 } };
    return { actor, enemy, healer, flag, previous };
}

test('recorded non-closing geometry triggers; supported, productive and adjacent approaches stay intact', () => {
    const { actor, enemy, healer, flag, previous } = snapshot();
    const before = JSON.stringify(previous);
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [actor, healer]).reason, 'melee-rejoin-support');
    healer.x = 44; healer.y = 54; // Already in heal range.
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [healer]).reason, 'combat-approach');
    healer.x = 48; healer.y = 50;
    enemy.x = 42; enemy.y = 58; // Closed to range one: do not suppress an attack.
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [healer]).reason, 'combat-in-range');
    enemy.x = 41; enemy.y = 59;
    const productive = { ...previous, pursuit: { ...previous.pursuit, range: 3 } };
    assert.equal(selectMovementPlan(actor, [enemy], flag, productive, [healer]).reason, 'combat-approach');
    const blocked = { ...previous, pursuit: { ...previous.pursuit, x: actor.x, y: actor.y } };
    assert.equal(selectMovementPlan(actor, [enemy], flag, blocked, [healer]).reason, 'combat-approach');
    assert.equal(selectMovementPlan(actor, [enemy], flag, { ...previous, supportWaitTicks: 1 }, [healer]).reason,
        'combat-approach'); // No support at4–5, so the unchanged wait gate does not apply.
    assert.equal(JSON.stringify(previous), before);
});

test('missing support/flag, mixed roles and melee enemies do not create a rejoin', () => {
    const { actor, enemy, healer, flag, previous } = snapshot();
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, []).target, enemy);
    assert.equal(selectMovementPlan(actor, [enemy], null, previous, [healer]).target, enemy);
    healer.hits = 0;
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [healer]).target, enemy);
    healer.hits = 100;
    actor.fatigue = 1;
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [healer]).target, enemy);
    actor.fatigue = 0;
    actor.body.push({ type: 'heal', hits: 0 });
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [healer]).target, enemy);
    actor.body.pop(); enemy.body.push({ type: 'attack', hits: 100 });
    assert.equal(selectMovementPlan(actor, [enemy], flag, previous, [healer]).target, enemy);
});

test('rejoin pins its healer, times out after five attempts and latches abandoned pursuit until disengagement', () => {
    const { actor, enemy, healer, flag, previous } = snapshot();
    const engagements = new Map([[actor.id, previous]]);
    const nearerLater = unit('other', 60, 60, ['heal', 'move']);
    const reasons = [];
    for (let i = 0; i < 8; i++) {
        actor.calls.length = 0;
        // Deliberately no engine displacement: failed/blocked movement cannot
        // keep rejoining forever or select a new healer each tick.
        const records = [];
        moveCreeps([actor, healer, nearerLater], [enemy], flag, engagements, new Map(), null, null,
            { decision: d => { records.push(d); return null; } });
        reasons.push(records.find(d => d.actorId === actor.id).reason);
        if (i === 0) { nearerLater.x = 45; nearerLater.y = 53; }
        if (i < 5) assert.equal(actor.calls[0].id, healer.id);
    }
    assert.deepEqual(reasons, [...Array(5).fill('melee-rejoin-support'), 'rejoin-timeout',
        'abandoned-ranged-pursuit', 'abandoned-ranged-pursuit']);
    const state = engagements.get(actor.id);
    assert.equal(state.rejoin.done, true);
    assert.equal(state.supportWaitTicks, 2);
    assert.equal(selectMovementPlan(actor, [], flag, state, [healer]).engagement, null);
});

test('support loss releases explicitly; adjacent combat still attacks during an active rejoin', () => {
    const { actor, enemy, healer, flag, previous } = snapshot();
    const first = selectMovementPlan(actor, [enemy], flag, previous, [healer]);
    healer.hits = 0;
    assert.equal(selectMovementPlan(actor, [enemy], flag, first.engagement, [healer]).reason, 'rejoin-support-lost');
    healer.hits = 100; enemy.x = actor.x; enemy.y = actor.y + 1;
    const engagements = new Map([[actor.id, first.engagement]]);
    moveCreeps([actor, healer], [enemy], flag, engagements);
    executeTactics([actor, healer], [enemy], []);
    assert.deepEqual(actor.calls.map(a => a.method), ['attack']);
});

test('arrival/timeout/support-loss boundaries never replace an adjacent attack hold with a flag move', () => {
    for (const boundary of ['arrival', 'timeout', 'support-loss']) {
        const { actor, enemy, healer, flag, previous } = snapshot();
        let plan = selectMovementPlan(actor, [enemy], flag, previous, [healer]);
        if (boundary === 'arrival') { healer.x = actor.x + 3; healer.y = actor.y; }
        if (boundary === 'timeout') plan.engagement.rejoin.ticks = 5;
        if (boundary === 'support-loss') healer.hits = 0;
        enemy.x = actor.x; enemy.y = actor.y + 1;
        plan = selectMovementPlan(actor, [enemy], flag, plan.engagement, [healer]);
        assert.equal(plan.reason, 'combat-in-range');
        assert.equal(plan.target, null);
        assert.equal(plan.engagement.rejoin.done, true);
    }
});

test('anchor ties are deterministic; role/flag loss cancels rejoin and actor removal clears state', () => {
    const { actor, enemy, healer, flag, previous } = snapshot();
    const other = unit('a-healer', healer.x, healer.y, ['heal', 'move']);
    let plan = selectMovementPlan(actor, [enemy], flag, previous, [healer, other]);
    assert.equal(plan.engagement.rejoin.healerId, other.id);
    assert.deepEqual(selectMovementPlan(actor, [enemy], flag, previous, [other, healer]), plan);
    assert.equal(selectMovementPlan(actor, [enemy], null, plan.engagement, [other]).target, enemy);
    actor.body[1].hits = 0;
    assert.equal(selectMovementPlan(actor, [enemy], flag, plan.engagement, [other]).target, enemy);
    actor.body[1].hits = 100;
    const engagements = new Map([[actor.id, plan.engagement]]);
    moveCreeps([healer], [enemy], flag, engagements);
    assert.equal(engagements.has(actor.id), false);
    const fresh = selectMovementPlan(actor, [enemy], flag, null, [healer]);
    assert.equal(fresh.engagement.supportWaitTicks, undefined);
    assert.equal(fresh.engagement.rejoin, undefined);
});

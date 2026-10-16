import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { selectMovementPlan } from '../../src/tactics/movement.js';

function unit(id, x, y, types, extra = {}) {
    return { id, x, y, my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: types.map(type => ({ type, hits: 100 })), ...extra, calls: [],
        getRangeTo(t) { return Math.max(Math.abs(this.x - t.x), Math.abs(this.y - t.y)); },
        moveTo(t) { this.calls.push({ method: 'moveTo', target: { id: t.id, x: t.x, y: t.y } }); return 0; },
        attack(t) { this.calls.push({ method: 'attack', target: { id: t.id, x: t.x, y: t.y } }); return 0; },
        rangedAttack(t) { this.calls.push({ method: 'rangedAttack', target: { id: t.id, x: t.x, y: t.y } }); return 0; },
        heal(t) { this.calls.push({ method: 'heal', target: { id: t.id, x: t.x, y: t.y } }); return 0; },
        rangedHeal(t) { this.calls.push({ method: 'rangedHeal', target: { id: t.id, x: t.x, y: t.y } }); return 0; } };
}
function setup() {
    return { actor: unit('front', 0, 0, ['attack', 'move']),
        healer: unit('healer', 2, 1, ['heal', 'move']),
        target: unit('enemy-melee', -2, 0, ['attack', 'move'], { my: false }),
        ranged: unit('enemy-ranged', -2, -3, ['ranged_attack', 'move'], { my: false }),
        flag: { id: 'first', x: 2, y: 1, my: true } };
}
function step(friends, enemies, flag, engagements) {
    const decisions = [];
    for (const c of friends) c.calls.length = 0;
    moveCreeps(friends, enemies, flag, engagements, new Map(), null, null,
        { decision: d => { decisions.push(d); return null; } });
    executeTactics(friends, enemies, friends.filter(c => c.hits < c.hitsMax));
    const moves = friends.map(c => [c, c.calls.find(a => a.method === 'moveTo')]);
    // Generated empty-grid one-step simultaneous resolver, not Arena paths,
    // collisions, combat damage or an alternate replay trajectory.
    for (const [c, move] of moves) {
        assert.ok(c.calls.filter(a => a.method === 'moveTo').length <= 1);
        if (move) { c.x += Math.sign(move.target.x - c.x); c.y += Math.sign(move.target.y - c.y); }
    }
    return decisions.find(d => d.actorId === friends[0].id);
}

test('synthetic contact waits for combat support, then advances/attacks without refilling or oscillating', t => {
    const { actor, healer, target, ranged, flag } = setup();
    const backup = unit('backup', 3, 0, ['ranged_attack', 'move']);
    const friends = [actor, healer, backup], engagements = new Map(), trace = [];
    for (let tick = 1; tick <= 6; tick++) {
        if (tick === 5) { friends.pop(); target.x = -3; } // Support lost; spent budget must not refill.
        const from = [actor.x, actor.y];
        const d = step(friends, [target, ranged], flag, engagements);
        trace.push({ tick, from, to: [actor.x, actor.y], reason: d.reason,
            waits: engagements.get(actor.id)?.supportWaitTicks, calls: [...actor.calls] });
    }
    t.diagnostic(JSON.stringify(trace));
    assert.deepEqual(trace.map(r => r.reason), ['await-close-combat-support', 'await-close-combat-support',
        'combat-approach', 'combat-in-range', 'combat-approach', 'combat-in-range']);
    assert.deepEqual(trace[0].to, [0, 0]);
    assert.deepEqual(trace[2].to, [-1, 0]);
    assert.ok(trace[3].calls.some(a => a.method === 'attack'));
    assert.ok(trace[5].calls.some(a => a.method === 'attack'));
    assert.equal(trace[5].waits, 2);
});

test('actual adjacent support arrival releases on the next observation', () => {
    const { actor, healer, target, ranged } = setup();
    healer.y = 0;
    const flag = { id: 'first', x: 1, y: 0, my: true }, engagements = new Map();
    const first = step([actor, healer], [target, ranged], flag, engagements);
    assert.equal(first.reason, 'await-close-combat-support');
    assert.equal(healer.getRangeTo(actor), 1); // Existing healer fallback reached the flag.
    const next = step([actor, healer], [target, ranged], flag, engagements);
    assert.equal(next.reason, 'combat-approach');
    assert.equal(engagements.get(actor.id).supportWaitTicks, 1);
});

test('recorded tick48 geometry exposes the healthy isolated contact step, not an HP-loss trigger', () => {
    // Provenance: retained 6ad14cc074ae432a5565af4f log48, build a83ba9df…43f3.
    // Positions/roles project the recorded geometry; minimal generated bodies
    // are eligibility sentinels, not reconstructed per-part HP or combat power.
    const actor = unit('front', 45, 49, ['attack', 'move']);
    const target = unit('enemy-melee', 43, 47, ['attack', 'move'], { my: false });
    const ranged = unit('enemy-ranged', 43, 46, ['ranged_attack', 'move'], { my: false });
    const healer = unit('healer', 47, 50, ['heal', 'move']);
    const backup = unit('backup', 47, 49, ['ranged_attack', 'move']);
    const plan = selectMovementPlan(actor, [target, ranged], { id: 'first', x: 49, y: 49 }, null,
        [actor, healer, backup]);
    assert.equal(actor.hits, actor.hitsMax);
    assert.equal(plan.reason, 'await-close-combat-support');
    assert.equal(plan.target, null);
});

test('productive/supporting approaches, adjacency and other roles remain available', () => {
    const { actor, healer, target, ranged, flag } = setup();
    const select = (enemies = [target, ranged], friends = [actor, healer]) =>
        selectMovementPlan(actor, enemies, flag, null, friends);
    assert.equal(select([target]).reason, 'combat-approach'); // No ranged overlap.
    target.x = -3;
    assert.equal(select().reason, 'combat-approach'); // Not the contact step.
    target.x = -1;
    assert.equal(select().reason, 'combat-in-range');
    target.x = -2; healer.x = 1;
    assert.equal(select().reason, 'combat-approach'); // Adjacent healing already available.
    healer.x = 2;
    const fighter = unit('fighter', -1, 1, ['attack', 'move']);
    assert.equal(select(undefined, [actor, healer, fighter]).reason, 'combat-approach');
    fighter.body[0].hits = 0;
    assert.equal(select(undefined, [actor, healer, fighter]).reason, 'await-close-combat-support');
    actor.body.push({ type: 'heal', hits: 0 });
    assert.equal(select().reason, 'combat-approach'); // Original mixed body excluded.
});

test('unavailable heal support and inactive ranged weapons never invent a catch-up opportunity', () => {
    for (const change of ['injured', 'fatigued', 'immobile', 'dead', 'enemy', 'mixed', 'too-far', 'no-heal']) {
        const { actor, healer, target, ranged, flag } = setup();
        if (change === 'injured') healer.hits--;
        if (change === 'fatigued') healer.fatigue = 1;
        if (change === 'immobile') healer.body[1].hits = 0;
        if (change === 'dead') healer.hits = 0;
        if (change === 'enemy') healer.my = false;
        if (change === 'mixed') healer.body.push({ type: 'attack', hits: 0 });
        if (change === 'too-far') healer.x = 6;
        if (change === 'no-heal') healer.body[0].hits = 0;
        assert.equal(selectMovementPlan(actor, [target, ranged], flag, null, [actor, healer]).reason,
            'combat-approach', change);
    }
    const { actor, healer, target, ranged, flag } = setup();
    ranged.body[0].hits = 0;
    assert.equal(selectMovementPlan(actor, [target, ranged], flag, null, [actor, healer]).reason, 'combat-approach');
});

test('contact and existing local-healer waits share exactly two pauses, without mutating input state', () => {
    const { actor, healer, target, ranged, flag } = setup();
    const previous = { id: target.id, outsideTicks: 0, supportWaitTicks: 1 };
    const before = JSON.stringify(previous);
    const second = selectMovementPlan(actor, [target, ranged], flag, previous, [actor, healer]);
    assert.equal(second.reason, 'await-close-combat-support');
    assert.equal(second.engagement.supportWaitTicks, 2);
    const exhausted = selectMovementPlan(actor, [target, ranged], flag, second.engagement, [actor, healer]);
    assert.equal(exhausted.reason, 'combat-approach');
    healer.x = 4;
    assert.equal(selectMovementPlan(actor, [target, ranged], flag, second.engagement, [healer]).reason, 'combat-approach');
    assert.equal(JSON.stringify(previous), before);
    assert.equal(selectMovementPlan(actor, [], flag, exhausted.engagement, [healer]).engagement, null);
});

test('a combat ally reaching weapon range releases before exhaustion', () => {
    const { actor, healer, target, ranged, flag } = setup();
    const backup = unit('backup', 2, 0, ['ranged_attack', 'move']), engagements = new Map();
    assert.equal(step([actor, healer, backup], [target, ranged], flag, engagements).reason,
        'await-close-combat-support');
    assert.equal(backup.getRangeTo(target), 3);
    assert.equal(step([actor, healer, backup], [target, ranged], flag, engagements).reason, 'combat-approach');
    assert.equal(engagements.get(actor.id).supportWaitTicks, 1);
});

test('contact boundaries use functioning parts and do not assume a healing mixed unit will attack', () => {
    const { actor, healer, target, ranged, flag } = setup();
    const select = (friends = [actor, healer]) => selectMovementPlan(actor, [target, ranged], flag, null, friends);
    ranged.y = -4;
    assert.equal(select().reason, 'combat-approach');
    ranged.y = -3;
    assert.equal(select().reason, 'await-close-combat-support');
    target.body[0].hits = 0;
    assert.equal(select().reason, 'combat-approach');
    target.body[0].hits = 100;
    actor.fatigue = 1;
    assert.equal(select().reason, 'combat-approach');
    actor.fatigue = 0;
    const mixed = unit('mixed', -3, 0, ['attack', 'heal', 'move']);
    assert.equal(select([actor, healer, mixed]).reason, 'await-close-combat-support');
    mixed.body[1].hits = 0;
    assert.equal(select([actor, healer, mixed]).reason, 'combat-approach');
    assert.deepEqual(select([mixed, healer, actor]), select([actor, healer, mixed]));
    // Injured/fatigued/immobile adjacent HEAL still provides direct heal access.
    healer.x = 1; healer.hits--; healer.fatigue = 1; healer.body[1].hits = 0;
    assert.equal(select().reason, 'combat-approach');
});

test('contact waiting leaves healing selection and adjacent attacks intact', () => {
    const { actor, healer, target, ranged, flag } = setup();
    actor.hits = 50;
    const decisions = [];
    moveCreeps([actor, healer], [target, ranged], flag, new Map(), new Map(), null, null,
        { decision: d => { decisions.push(d); return null; } });
    executeTactics([actor, healer], [target, ranged], [actor]);
    assert.equal(decisions[0].reason, 'await-close-combat-support');
    assert.deepEqual(actor.calls, []);
    assert.deepEqual(healer.calls, [{ method: 'rangedHeal', target: { id: actor.id, x: actor.x, y: actor.y } }]);
    target.x = -1; actor.calls.length = 0; healer.calls.length = 0;
    moveCreeps([actor, healer], [target, ranged], flag);
    executeTactics([actor, healer], [target, ranged], [actor]);
    assert.deepEqual(actor.calls.map(c => c.method), ['attack']);
    assert.deepEqual(healer.calls.map(c => c.method), ['rangedHeal']);
});

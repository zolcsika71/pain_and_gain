import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps } from '../../src/arena/execute.js';
import { planScoutFlagAllocation } from '../../src/strategy/flag-allocation.js';
import { selectFlag } from '../../src/strategy/objectives.js';

const attackEffect = 'eff_attack_modifier';

function unit(id, x, y, types = ['move'], options = {}) {
    const moves = [];
    return {
        id, x, y, my: options.my ?? true, hits: options.hits ?? 100,
        hitsMax: 100, fatigue: options.fatigue ?? 0,
        body: types.map(type => ({ type, hits: 10 })), moves,
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo(target) { moves.push(target); },
    };
}

function fixture() {
    const first = { id: 'first', x: 0, y: 0, my: true };
    const a = { id: 'a', x: 20, y: 10, my: undefined, effectType: attackEffect };
    const z = { id: 'z', x: 20, y: -10, my: undefined, effectType: attackEffect };
    const nearScout = unit('scout-1', 1, 0);
    const farScout = unit('scout-2', 4, 0);
    const defender = unit('defender', 0, 1, ['attack', 'move']);
    const state = { tick: 39, flags: [first, a, z], myCreeps: [nearScout, farScout, defender], enemies: [] };
    const route = (from, to) => Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    return { state, first, a, z, nearScout, farScout, defender, route };
}

function plan(state, previous, route) {
    return planScoutFlagAllocation(state, previous, route, attackEffect);
}

test('without an allocation, every fallback stays on the first flag', () => {
    const { state, first, nearScout, farScout } = fixture();
    moveCreeps(state.myCreeps, state.enemies, selectFlag(state.flags));
    assert.deepEqual(nearScout.moves, [first]);
    assert.deepEqual(farScout.moves, [first]);
});

test('one scout takes the shortest eligible route, then flag ID; other movement stays unchanged', () => {
    const { state, first, a, z, nearScout, farScout, defender, route } = fixture();
    // On equal route lengths, a precedes z despite the reverse flag order.
    state.flags = [first, z, a];
    const sameLength = (from, to) => to === a || to === z ? 20 : route(from, to);
    let decision = plan(state, null, sameLength);
    assert.deepEqual(decision.state, { scoutId: 'scout-2', targetId: 'a', startedAt: 39 });
    moveCreeps(state.myCreeps, state.enemies, first, new Map(), decision.fallbackById);
    assert.deepEqual(farScout.moves, [a]);
    assert.deepEqual(nearScout.moves, [first]);
    assert.deepEqual(defender.moves, [first]);

    decision = plan(state, null, (from, to) => to === z ? 18 : sameLength(from, to));
    assert.equal(decision.state.targetId, 'z');
    assert.equal(decision.fallbackById.size, 1);
});

test('only full-health, unfatigued MOVE-only scouts can start; a defender must remain', () => {
    for (const change of [
        ({ farScout, nearScout }) => { farScout.hits = 99; nearScout.hits = 99; },
        ({ farScout, nearScout }) => { farScout.fatigue = 1; nearScout.fatigue = 1; },
        ({ farScout, nearScout }) => { farScout.body[0].hits = 0; nearScout.body[0].hits = 0; },
        ({ farScout, nearScout }) => { farScout.body.push({ type: 'heal', hits: 0 }); nearScout.body.push({ type: 'attack', hits: 0 }); },
        ({ defender }) => { defender.x = 10; },
    ]) {
        const f = fixture();
        change(f);
        assert.equal(plan(f.state, null, f.route).state, null);
    }
});

test('neutral attack target, complete bounded route, and enemy arrival margin are required', () => {
    const f = fixture();
    f.a.my = false;
    f.z.effectType = 'eff_heal_modifier';
    assert.equal(plan(f.state, null, f.route).state, null);
    f.a.my = undefined;
    assert.equal(plan(f.state, null, () => null).state, null);
    assert.equal(plan(f.state, null, () => 41).state, null);
    f.z.effectType = attackEffect;
    f.state.enemies = [unit('enemy', 24, 0, ['move'], { my: false })];
    assert.equal(plan(f.state, null, f.route).state, null); // target contested within five
    f.state.enemies = [unit('enemy', 20, 14, ['move'], { my: false })];
    assert.equal(plan(f.state, null, f.route).state.targetId, 'z'); // a is contested, z is not
    f.state.enemies = [unit('enemy', 20, 0, ['move'], { my: false })];
    assert.equal(plan(f.state, null, f.route).state, null); // neither has a five-step lead
    const unknownEnemyRoute = (from, to) => from.id === 'enemy' ? null : f.route(from, to);
    assert.equal(plan(f.state, null, unknownEnemyRoute).state, null);
});

test('first-flag threat and late start reject allocation', () => {
    const f = fixture();
    f.first.my = undefined;
    assert.equal(plan(f.state, null, f.route).state, null);
    f.first.my = true;
    f.state.enemies = [unit('enemy', 5, 0, ['move'], { my: false })];
    assert.equal(plan(f.state, null, f.route).state, null);
    f.state.enemies = [];
    f.state.tick = 81;
    assert.equal(plan(f.state, null, f.route).state, null);
});

test('capture finishes one attempt and returns to first flag without chaining', () => {
    const f = fixture();
    let decision = plan(f.state, null, f.route);
    f.state.tick = 40;
    f.a.my = true;
    decision = plan(f.state, decision.state, f.route);
    assert.deepEqual(decision.state, { finished: true });
    assert.equal(decision.fallbackById.size, 0);
    moveCreeps(f.state.myCreeps, [], f.first, new Map(), decision.fallbackById);
    assert.deepEqual(f.farScout.moves, [f.first]);
    f.state.tick = 41;
    assert.deepEqual(plan(f.state, decision.state, f.route).state, { finished: true });
    assert.equal(f.a.my, true); // returning does not undo the observed ownership/debuff
});

test('active assignment cancels on threat, invalid target, injury, lost MOVE, or timeout', () => {
    for (const change of [
        ({ state, first }) => { state.enemies = [unit('enemy', 5, 0, [], { my: false })]; first.my = true; },
        ({ first }) => { first.my = false; },
        ({ a }) => { a.my = false; },
        ({ state }) => { state.enemies = [unit('enemy', 20, 14, [], { my: false })]; },
        ({ farScout }) => { farScout.hits = 90; },
        ({ farScout }) => { farScout.body[0].hits = 0; },
        ({ defender }) => { defender.x = 10; },
        ({ state }) => { state.tick = 100; },
    ]) {
        const f = fixture();
        const started = plan(f.state, null, f.route).state;
        f.state.tick = 40;
        change(f);
        const decision = plan(f.state, started, f.route);
        assert.deepEqual(decision.state, { finished: true });
        assert.equal(decision.fallbackById.size, 0);
        moveCreeps(f.state.myCreeps, f.state.enemies, f.first, new Map(), decision.fallbackById);
        assert.deepEqual(f.farScout.moves, [f.first]);
    }
});

test('a scout at the neutral target holds until capture; later route loss cancels', () => {
    const f = fixture();
    const started = plan(f.state, null, f.route).state;
    f.state.tick = 40;
    f.farScout.x = f.a.x;
    f.farScout.y = f.a.y;
    let decision = plan(f.state, started, f.route);
    moveCreeps(f.state.myCreeps, [], f.first, new Map(), decision.fallbackById);
    assert.deepEqual(f.farScout.moves, []);
    f.farScout.x = 4;
    f.farScout.y = 0;
    decision = plan(f.state, started, () => null);
    assert.deepEqual(decision.state, { finished: true });
});

test('assignment diagnostics retain evaluated paths and ordering without extra path searches', () => {
    const f = fixture();
    const calls = [];
    const route = (from, to, report) => {
        calls.push([from.id, to.id]);
        const length = to === f.a ? 22 : 18;
        report?.({ incomplete: false, length, cost: length + 2, ops: 17 });
        return length;
    };
    const diagnostics = [];
    const decision = planScoutFlagAllocation(f.state, null, route, attackEffect,
        value => diagnostics.push(value));
    assert.equal(decision.state.targetId, 'z');
    assert.deepEqual(calls, [['scout-2', 'a'], ['scout-2', 'z']]);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].event, 'assign');
    assert.equal(diagnostics[0].reason, 'shortest-eligible-route');
    assert.equal(diagnostics[0].objectiveId, 'z');
    assert.deepEqual(diagnostics[0].state, decision.state);
    assert.deepEqual(diagnostics[0].evaluations.map(item => [item.flagId, item.scoutRoute]), [
        ['a', { incomplete: false, length: 22, cost: 24, ops: 17 }],
        ['z', { incomplete: false, length: 18, cost: 20, ops: 17 }],
    ]);
    calls.length = 0;
    assert.deepEqual(planScoutFlagAllocation(f.state, null, route, attackEffect).state, decision.state);
    assert.deepEqual(calls, [['scout-2', 'a'], ['scout-2', 'z']]);
});

test('rejection diagnostics include actual incomplete routes and enemy arrival comparisons', () => {
    const f = fixture();
    f.z.effectType = 'other';
    f.state.enemies = [unit('enemy', 20, 0, ['move'], { my: false })];
    const diagnostics = [];
    const route = (from, to, report) => {
        const incomplete = from.id === 'scout-2';
        report?.({ incomplete, length: 24, cost: 27, ops: 5000 });
        return incomplete ? null : 24;
    };
    assert.equal(planScoutFlagAllocation(f.state, null, route, attackEffect,
        value => diagnostics.push(value)).state, null);
    assert.equal(diagnostics[0].event, 'reject');
    assert.equal(diagnostics[0].reason, 'no-eligible-target');
    assert.equal(diagnostics[0].evaluations[0].reason, 'scout-route-ineligible');
    assert.deepEqual(diagnostics[0].evaluations[0].scoutRoute,
        { incomplete: true, length: 24, cost: 27, ops: 5000 });

    diagnostics.length = 0;
    const arrivalRoute = (from, to, report) => {
        const length = from.id === 'enemy' ? 20 : 18;
        report?.({ incomplete: false, length, cost: length, ops: 22 });
        return length;
    };
    planScoutFlagAllocation(f.state, null, arrivalRoute, attackEffect,
        value => diagnostics.push(value));
    const evaluation = diagnostics[0].evaluations[0];
    assert.equal(evaluation.requiredEnemySteps, 23);
    assert.deepEqual(evaluation.enemyRoutes[0], {
        enemyId: 'enemy', range: 10, route: { incomplete: false, length: 20, cost: 20, ops: 22 },
        steps: 20, result: 'too-close',
    });
    assert.equal(evaluation.reason, 'enemy-arrival-margin');
});

test('active cancellation and capture completion diagnostics preserve first-flag fallback', () => {
    const f = fixture();
    const started = plan(f.state, null, f.route).state;
    const diagnostics = [];
    f.state.tick = 40;
    f.state.enemies = [unit('enemy', 5, 0, ['move'], { my: false })];
    const canceled = planScoutFlagAllocation(f.state, started, f.route, attackEffect,
        value => diagnostics.push(value));
    assert.deepEqual(canceled.state, { finished: true });
    assert.deepEqual(diagnostics[0], {
        tick: 40, event: 'cancel', reason: 'first-flag-threatened', firstFlagId: 'first',
        state: { finished: true }, objectiveId: 'first', scoutId: 'scout-2', targetId: 'a',
        threatEnemyId: 'enemy', threatRange: 5,
    });
    f.state.enemies = [];
    f.a.my = true;
    const completed = planScoutFlagAllocation(f.state, started, f.route, attackEffect,
        value => diagnostics.push(value));
    assert.deepEqual(completed.state, { finished: true });
    assert.equal(diagnostics[1].event, 'complete');
    assert.equal(diagnostics[1].reason, 'target-owned');
    assert.equal(diagnostics[1].objectiveId, 'first');
});

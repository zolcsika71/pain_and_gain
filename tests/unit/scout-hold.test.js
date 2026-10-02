import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { moveCreeps } from '../../src/arena/execute.js';

const flag = () => ({ id: 'first', x: 49, y: 49, my: true });
function scout(options = {}) {
    return { id: 'scout', x: 47, y: 50, my: true, hits: 100, hitsMax: 100,
        fatigue: 0, body: [{ type: 'move', hits: 100 }], moves: [],
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo(target) { this.moves.push(target.id); return 0; }, ...options };
}
const plan = (actor, first = flag(), enemies = [], enabled = true) =>
    selectMovementPlan(actor, enemies, first, null, [], enabled);

test('hold includes range zero through diagonal two, but not three', () => {
    for (const [x, y] of [[49, 49], [48, 49], [47, 49], [47, 50], [47, 47], [51, 51]]) {
        assert.deepEqual(plan(scout({ x, y })), { target: null, engagement: null,
            outcome: 'hold', reason: 'scout-owned-flag-hold', targetKind: null });
    }
    const first = flag();
    assert.equal(plan(scout({ x: 46 }), first).target, first);
});

test('only healthy owned zero-fatigue MOVE-only scouts can hold', () => {
    const first = flag();
    for (const changes of [{ my: false }, { hits: 0 }, { hits: 99 }, { fatigue: 1 },
        { body: [] }, { body: [{ type: 'move', hits: 0 }] },
        ...['attack', 'ranged_attack', 'heal', 'carry', 'tough'].map(type =>
            ({ body: [{ type: 'move', hits: 100 }, { type, hits: 0 }] }))]) {
        const actor = scout(changes);
        assert.deepEqual(plan(actor, first), plan(actor, first, [], false));
        assert.notEqual(plan(actor, first).reason, 'scout-owned-flag-hold');
    }
});

test('ownership, health, fatigue, range and threat are reevaluated without sticky state', () => {
    const actor = scout(), first = flag();
    assert.equal(plan(actor, first).outcome, 'hold');
    for (const owner of [false, undefined]) {
        first.my = owner;
        assert.equal(plan(actor, first).target, first);
    }
    assert.equal(plan(actor, null).reason, 'no-movement-objective');
    first.my = true;
    actor.hits = 99;
    assert.equal(plan(actor, first).target, first);
    actor.hits = 100;
    actor.fatigue = 1;
    assert.equal(plan(actor, first).target, first);
    actor.fatigue = 0;
    actor.x = 46;
    assert.equal(plan(actor, first).target, first);
    actor.x = 47;
    assert.equal(plan(actor, first).outcome, 'hold');
    // Range five to flag only, or to scout only, both release holding.
    for (const x of [54, 42]) {
        const enemy = scout({ id: 'enemy', my: false, x, y: 49 });
        assert.equal(plan(actor, first, [enemy]).target, first);
        enemy.hits = 0;
        assert.equal(plan(actor, first, [enemy]).outcome, 'hold');
        enemy.hits = 100;
        enemy.my = true;
        assert.equal(plan(actor, first, [enemy]).outcome, 'hold');
    }
    assert.equal(plan(actor, first, [scout({ my: false, x: 55, y: 49 })]).outcome, 'hold');
});

test('disabled and omitted options preserve original fallback including at the owned flag', () => {
    const actor = scout(), first = flag();
    assert.equal(plan(actor, first, [], false).target, first);
    assert.deepEqual(selectMovementPlan(actor, [], first), plan(actor, first, [], false));
    moveCreeps([actor], [], first);
    moveCreeps([actor], [], first, new Map(), new Map(), null, null, null, false);
    assert.deepEqual(actor.moves, ['first', 'first']);
});

test('allocation overrides, including explicit null, have precedence; unassigned scouts hold', () => {
    const actor = scout(), idle = scout({ id: 'idle' }), first = flag();
    const target = { id: 'allocation', x: 60, y: 49 };
    const records = [];
    const reporter = { decision: d => { records.push(d); return d; }, attempt() {} };
    moveCreeps([actor, idle], [], first, new Map(), new Map([[actor.id, target]]),
        null, null, reporter, true);
    assert.deepEqual(actor.moves, ['allocation']);
    assert.deepEqual(idle.moves, []);
    assert.equal(records.find(r => r.actorId === 'idle').reason, 'scout-owned-flag-hold');
    records.length = 0;
    moveCreeps([actor], [], first, new Map(), new Map([[actor.id, null]]),
        null, null, reporter, true);
    assert.equal(records[0].reason, 'no-movement-objective');
    assert.deepEqual(actor.moves, ['allocation']);
});

test('escort handling wins even for an otherwise hold-eligible actor', () => {
    const actor = scout(), ally = { id: 'ally', x: 45, y: 50 };
    const records = [], attempts = [];
    moveCreeps([actor], [], flag(), new Map(), new Map(),
        { healerId: actor.id, allyId: ally.id, ally, mode: 'move-attempt', distance: 2 }, null,
        { decision: d => { records.push(d); return d; }, attempt: (...a) => attempts.push(a) }, true);
    assert.deepEqual(actor.moves, ['ally']);
    assert.equal(records[0].reason, 'escort-approach');
    assert.equal(attempts.length, 1);
});

test('armed, healer and mixed-role plans are unchanged with holding enabled', () => {
    const first = flag(), enemy = scout({ id: 'enemy', my: false, x: 51 });
    const injured = scout({ id: 'injured', x: 48, hits: 50 });
    for (const types of [['attack', 'move'], ['ranged_attack', 'move'], ['heal', 'move'],
        ['heal', 'attack', 'move']]) {
        const actor = scout({ body: types.map(type => ({ type, hits: 100 })) });
        assert.deepEqual(selectMovementPlan(actor, [enemy], first, null, [injured], true),
            selectMovementPlan(actor, [enemy], first, null, [injured], false));
    }
});

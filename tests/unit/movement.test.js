import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps } from '../../src/arena/execute.js';
import { selectMovementDecision, selectMovementTarget } from '../../src/tactics/movement.js';

function creep(id, x, parts = [], options = {}) {
    const moves = [];
    return {
        id, x, y: 0, my: options.my ?? true, hits: options.hits ?? 100,
        body: parts.map(([type, hits]) => ({ type, hits })), moves,
        getRangeTo(target) {
            return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y));
        },
        moveTo(target) { moves.push(target); },
    };
}

test('armed creeps approach local enemies and hold at their weapon ranges', () => {
    const flag = { id: 'flag' };
    const melee = creep('melee', 0, [['attack', 10]]);
    const ranged = creep('ranged', 0, [['ranged_attack', 10]]);
    const enemy = creep('enemy', 4, [], { my: false });

    assert.equal(selectMovementTarget(melee, [enemy], flag), enemy);
    assert.equal(selectMovementTarget(ranged, [enemy], flag), enemy);
    enemy.x = 3;
    assert.equal(selectMovementTarget(melee, [enemy], flag), enemy);
    assert.equal(selectMovementTarget(ranged, [enemy], flag), null);
    enemy.x = 1;
    assert.equal(selectMovementTarget(melee, [enemy], flag), null);
});

test('functioning parts determine range, including mixed weapons and destroyed parts', () => {
    const flag = { id: 'flag' };
    const enemy = creep('enemy', 3, [], { my: false });
    const mixed = creep('mixed', 0, [['attack', 10], ['ranged_attack', 10]]);
    const rangedOnly = creep('ranged', 0, [['attack', 0], ['ranged_attack', 10]]);
    const unarmed = creep('unarmed', 0, [['attack', 0], ['ranged_attack', 0]]);

    assert.equal(selectMovementTarget(mixed, [enemy], flag), enemy);
    assert.equal(selectMovementTarget(rangedOnly, [enemy], flag), null);
    assert.equal(selectMovementTarget(unarmed, [enemy], flag), flag);
    enemy.x = 1;
    assert.equal(selectMovementTarget(mixed, [enemy], flag), null);
});

test('nearest living enemy wins, with ID tie-breaking and first-flag fallback', () => {
    const flag = { id: 'first' };
    const actor = creep('actor', 0, [['ranged_attack', 10]]);
    const farther = creep('a', 5, [], { my: false });
    const nearer = creep('z', 4, [], { my: false });
    const tied = creep('b', -4, [], { my: false });
    const dead = creep('dead', 1, [], { my: false, hits: 0 });
    const friendly = creep('friendly', 1);

    assert.equal(selectMovementTarget(actor, [farther, nearer, dead, friendly], flag), nearer);
    assert.equal(selectMovementTarget(actor, [nearer, tied], flag), tied);
    farther.x = 6;
    nearer.x = 6;
    tied.x = -6;
    assert.equal(selectMovementTarget(actor, [farther, nearer, tied, dead, friendly], flag), flag);
    assert.equal(selectMovementTarget(actor, [], null), null);
});

test('engagement includes diagonal range 5 and falls back beyond it', () => {
    const flag = { id: 'first' };
    const actor = creep('actor', 0, [['ranged_attack', 10]]);
    const enemy = creep('enemy', 5, [], { my: false });
    enemy.y = 5;

    assert.equal(selectMovementTarget(actor, [enemy], flag), enemy);
    assert.equal(selectMovementTarget(actor, [enemy], null), enemy);
    enemy.y = 6;
    assert.equal(selectMovementTarget(actor, [enemy], flag), flag);
    assert.equal(selectMovementTarget(actor, [enemy], null), null);
});

test('each creep receives at most one movement command', () => {
    const flag = { id: 'first' };
    const enemy = creep('enemy', 4, [], { my: false });
    const approaching = creep('approaching', 0, [['ranged_attack', 10]]);
    const holding = creep('holding', 1, [['ranged_attack', 10]]);
    const fallback = creep('fallback', 0);

    moveCreeps([approaching, holding, fallback], [enemy], flag);

    assert.deepEqual(approaching.moves, [enemy]);
    assert.deepEqual(holding.moves, []);
    assert.deepEqual(fallback.moves, [flag]);
});

test('an acquired target survives one range-six tick, then releases to the first flag', () => {
    const flag = { id: 'first' };
    const actor = creep('actor', 0, [['ranged_attack', 10]]);
    const enemy = creep('enemy', 5, [], { my: false });
    let decision = selectMovementDecision(actor, [enemy], flag);
    assert.equal(decision.target, enemy);
    assert.deepEqual(decision.engagement, { id: 'enemy', outsideTicks: 0 });

    enemy.x = 6;
    decision = selectMovementDecision(actor, [enemy], flag, decision.engagement);
    assert.equal(selectMovementTarget(actor, [enemy], flag), flag); // stateless baseline
    assert.equal(decision.target, enemy);
    assert.deepEqual(decision.engagement, { id: 'enemy', outsideTicks: 1 });

    decision = selectMovementDecision(actor, [enemy], flag, decision.engagement);
    assert.equal(decision.target, flag);
    assert.equal(decision.engagement, null);
    enemy.x = 5;
    decision = selectMovementDecision(actor, [enemy], flag, decision.engagement);
    assert.equal(decision.target, enemy);
    assert.deepEqual(decision.engagement, { id: 'enemy', outsideTicks: 0 });
});

test('retention holds weapon range and resets its grace after reentry', () => {
    const actor = creep('actor', 0, [['ranged_attack', 10]]);
    const enemy = creep('enemy', 5, [], { my: false });
    let decision = selectMovementDecision(actor, [enemy], null);
    enemy.x = 6;
    decision = selectMovementDecision(actor, [enemy], null, decision.engagement);
    enemy.x = 3;
    decision = selectMovementDecision(actor, [enemy], null, decision.engagement);
    assert.equal(decision.target, null);
    assert.deepEqual(decision.engagement, { id: 'enemy', outsideTicks: 0 });
    enemy.x = 6;
    decision = selectMovementDecision(actor, [enemy], null, decision.engagement);
    assert.equal(decision.target, enemy);
    assert.equal(decision.engagement.outsideTicks, 1);
});

test('nearest local target wins; invalid targets release and reacquire deterministically', () => {
    const flag = { id: 'first' };
    const actor = creep('actor', 0, [['ranged_attack', 10]]);
    const old = creep('old', 5, [], { my: false });
    const fartherId = creep('z', 4, [], { my: false });
    const nearerId = creep('a', 4, [], { my: false });
    let decision = selectMovementDecision(actor, [old], flag);
    decision = selectMovementDecision(actor, [fartherId, old, nearerId], flag, decision.engagement);
    assert.equal(decision.target, nearerId); // normal local targeting remains unchanged
    old.x = 7;
    decision = selectMovementDecision(actor, [fartherId, old, nearerId], flag, decision.engagement);
    assert.equal(decision.target, nearerId);
    nearerId.hits = 0;
    decision = selectMovementDecision(actor, [fartherId, nearerId], flag, decision.engagement);
    assert.equal(decision.target, fartherId);
    decision = selectMovementDecision(actor, [], flag, decision.engagement);
    assert.equal(decision.target, flag);
    assert.equal(decision.engagement, null);
    actor.body[0].hits = 0;
    decision = selectMovementDecision(actor, [fartherId], flag, { id: 'z', outsideTicks: 0 });
    assert.equal(decision.target, flag);
    assert.equal(decision.engagement, null);
});

test('a different local enemy supersedes the one-tick boundary grace', () => {
    const actor = creep('actor', 0, [['ranged_attack', 10]]);
    const old = creep('old', 5, [], { my: false });
    const nearer = creep('nearer', 4, [], { my: false });
    let decision = selectMovementDecision(actor, [old], null);
    old.x = 6;
    decision = selectMovementDecision(actor, [old, nearer], null, decision.engagement);
    assert.equal(decision.target, nearer);
    assert.deepEqual(decision.engagement, { id: 'nearer', outsideTicks: 0 });
});

test('per-creep retention does not issue competing flag and combat moves', () => {
    const flag = { id: 'first' };
    const enemy = creep('enemy', 5, [], { my: false });
    const ranged = creep('ranged', 0, [['ranged_attack', 10]]);
    const scout = creep('scout', 0);
    const engagements = new Map();
    moveCreeps([ranged, scout], [enemy], flag, engagements);
    enemy.x = 6;
    moveCreeps([ranged, scout], [enemy], flag, engagements);
    moveCreeps([ranged, scout], [enemy], flag, engagements);
    assert.deepEqual(ranged.moves, [enemy, enemy, flag]);
    assert.deepEqual(scout.moves, [flag, flag, flag]);
    assert.equal(engagements.has('ranged'), false);
});

test('a retained target at range seven releases to the first flag', () => {
    const flag = { id: 'first' };
    const enemy = creep('enemy', 5, [], { my: false });
    const ranged = creep('ranged', 0, [['ranged_attack', 10]]);
    const engagements = new Map();

    moveCreeps([ranged], [enemy], flag, engagements);
    assert.deepEqual(engagements.get('ranged'), { id: 'enemy', outsideTicks: 0 });
    enemy.x = 6;
    moveCreeps([ranged], [enemy], flag, engagements);
    assert.deepEqual(engagements.get('ranged'), { id: 'enemy', outsideTicks: 1 });
    enemy.x = 7;
    moveCreeps([ranged], [enemy], flag, engagements);

    assert.deepEqual(ranged.moves, [enemy, enemy, flag]);
    assert.equal(engagements.has('ranged'), false);
});

test('a dead retained target releases to the first flag', () => {
    const flag = { id: 'first' };
    const enemy = creep('enemy', 5, [], { my: false });
    const ranged = creep('ranged', 0, [['ranged_attack', 10]]);
    const engagements = new Map();

    moveCreeps([ranged], [enemy], flag, engagements);
    assert.deepEqual(engagements.get('ranged'), { id: 'enemy', outsideTicks: 0 });
    enemy.x = 6;
    moveCreeps([ranged], [enemy], flag, engagements);
    assert.deepEqual(engagements.get('ranged'), { id: 'enemy', outsideTicks: 1 });
    enemy.hits = 0;
    moveCreeps([ranged], [enemy], flag, engagements);

    assert.deepEqual(ranged.moves, [enemy, enemy, flag]);
    assert.equal(engagements.has('ranged'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { selectMovementDecision, selectMovementTarget } from '../../src/tactics/movement.js';

function creep(id, x, parts = [], options = {}) {
    const moves = [];
    return {
        id, x, y: 0, my: options.my ?? true, hits: options.hits ?? 100,
        hitsMax: options.hitsMax ?? 100,
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

test('pure healer approaches the nearest out-of-range damaged ally, not the most injured', () => {
    const flag = { id: 'first' };
    const healer = creep('healer', 0, [['heal', 10]], { hits: 50 });
    const farther = creep('a', 5, [], { hits: 10 });
    const nearer = creep('z', 4, [], { hits: 90 });
    const covered = creep('covered', 2, [], { hits: 10 });

    moveCreeps([healer, farther, nearer, covered], [], flag);
    assert.deepEqual(healer.moves, [nearer]);

    farther.x = -4;
    moveCreeps([healer, farther, nearer, covered], [], flag);
    assert.deepEqual(healer.moves, [nearer, farther]); // distance tie uses ID
});

test('pure healer holds inside heal range and falls back without local eligible allies', () => {
    const flag = { id: 'first' };
    const healer = creep('healer', 0, [['heal', 10]]);
    const ally = creep('ally', 4, [], { hits: 50 });

    moveCreeps([healer, ally], [], flag);
    assert.deepEqual(healer.moves, [ally]);
    ally.x = 5;
    moveCreeps([healer, ally], [], flag);
    assert.deepEqual(healer.moves, [ally, ally]);
    ally.x = 3;
    moveCreeps([healer, ally], [], flag);
    assert.deepEqual(healer.moves, [ally, ally]); // ranged-heal distance is the hold range
    ally.x = 6;
    moveCreeps([healer, ally], [], flag);
    ally.x = 2;
    ally.hits = 100;
    moveCreeps([healer, ally], [], flag);
    ally.hits = 0;
    moveCreeps([healer, ally], [], flag);
    healer.hits = 50;
    moveCreeps([healer, ally], [], flag); // self-healing does not make self a movement target
    healer.body[0].hits = 0;
    ally.hits = 50;
    moveCreeps([healer, ally], [], flag);
    assert.deepEqual(healer.moves, [ally, ally, flag, flag, flag, flag, flag]);
});

test('mixed-role healer retains combat movement instead of following an injured ally', () => {
    const flag = { id: 'first' };
    const mixed = creep('mixed', 0, [['heal', 10], ['ranged_attack', 10]]);
    const ally = creep('ally', 2, [], { hits: 50 });
    const enemy = creep('enemy', 5, [], { my: false });
    const engagements = new Map();

    moveCreeps([mixed, ally], [enemy], flag, engagements);
    assert.deepEqual(engagements.get('mixed'), { id: 'enemy', outsideTicks: 0 });
    enemy.x = 6;
    moveCreeps([mixed, ally], [enemy], flag, engagements);
    assert.deepEqual(engagements.get('mixed'), { id: 'enemy', outsideTicks: 1 });
    moveCreeps([mixed, ally], [enemy], flag, engagements);
    assert.deepEqual(mixed.moves, [enemy, enemy, flag]);
    assert.equal(engagements.has('mixed'), false);
});

test('support movement leaves the current-position healing choice unchanged', () => {
    const flag = { id: 'first' };
    const healer = creep('healer', 0, [['heal', 10]]);
    const near = creep('near', 1, [], { hits: 50 });
    const far = creep('far', 4, [], { hits: 10 });
    const calls = [];
    healer.moveTo = target => calls.push(['moveTo', target.id]);
    healer.heal = target => calls.push(['heal', target.id]);

    moveCreeps([healer, near, far], [], flag);
    executeTactics([healer, near, far], [], [near, far]);

    assert.deepEqual(calls, [['moveTo', 'far'], ['heal', 'near']]);
});

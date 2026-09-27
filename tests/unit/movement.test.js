import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps } from '../../src/arena/execute.js';
import { selectMovementTarget } from '../../src/tactics/movement.js';

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

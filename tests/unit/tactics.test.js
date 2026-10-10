import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTactics } from '../../src/arena/execute.js';
import { hasFunctioningPart } from '../../src/tactics/body.js';
import { selectCombatActions } from '../../src/tactics/combat.js';
import { selectHealingAction } from '../../src/tactics/healing.js';

function creep(id, x, y, parts = [], options = {}) {
    const calls = [];
    return {
        id, x, y, my: options.my ?? true,
        hits: options.hits ?? 100,
        hitsMax: 100,
        body: parts.map(([type, hits]) => ({ type, hits })),
        calls,
        getRangeTo(target) {
            return Math.max(Math.abs(x - target.x), Math.abs(y - target.y));
        },
        attack(target) { calls.push(['attack', target.id]); },
        rangedAttack(target) { calls.push(['rangedAttack', target.id]); },
        heal(target) { calls.push(['heal', target.id]); },
        rangedHeal(target) { calls.push(['rangedHeal', target.id]); },
    };
}

test('only functioning body parts permit actions', () => {
    const actor = creep('actor', 0, 0, [
        ['attack', 0], ['ranged_attack', 0], ['heal', 0], ['ranged_attack', 10],
    ]);
    const enemy = creep('enemy', 1, 0, [], { my: false });
    const ally = creep('ally', 1, 0, [], { hits: 50 });

    assert.equal(hasFunctioningPart(actor, 'attack'), false);
    assert.equal(hasFunctioningPart(actor, 'ranged_attack'), true);
    assert.equal(selectHealingAction(actor, [ally]), null);
    assert.deepEqual(selectCombatActions(actor, [enemy], null), [
        { method: 'rangedAttack', target: enemy },
    ]);
});

test('melee stops at range 1 and ranged attack stops at range 3', () => {
    const actor = creep('actor', 0, 0, [['attack', 10], ['ranged_attack', 10]]);
    const adjacent = creep('adjacent', 1, 1, [], { my: false });
    const atThree = creep('three', 3, 0, [], { my: false });
    const atFour = creep('four', 4, 0, [], { my: false });

    assert.deepEqual(selectCombatActions(actor, [adjacent], null).map(a => a.method), [
        'rangedAttack', 'attack',
    ]);
    assert.deepEqual(selectCombatActions(actor, [atThree], null), [
        { method: 'rangedAttack', target: atThree },
    ]);
    assert.deepEqual(selectCombatActions(actor, [atFour], null), []);
});

test('equal-range targets use lexicographically smallest ID', () => {
    const actor = creep('actor', 0, 0, [['attack', 10], ['heal', 10]]);
    const enemyZ = creep('z', 1, 0, [], { my: false });
    const enemyA = creep('a', 0, 1, [], { my: false });
    const allyZ = creep('z', 1, 0, [], { hits: 50 });
    const allyA = creep('a', 0, 1, [], { hits: 50 });

    assert.equal(selectCombatActions(actor, [enemyZ, enemyA], null)[0].target, enemyA);
    assert.equal(selectHealingAction(actor, [allyZ, allyA]).target, allyA);
});

test('ranged combat prefers the nearest enemy over input order and ID', () => {
    const actor = creep('actor', 0, 0, [['ranged_attack', 10]]);
    const farther = creep('a', 3, 0, [], { my: false });
    const nearer = creep('z', 2, 0, [], { my: false });

    assert.deepEqual(selectCombatActions(actor, [farther, nearer], null), [
        { method: 'rangedAttack', target: nearer },
    ]);
});

test('direct healing beats ranged healing when both targets exceed capacity', () => {
    const actor = creep('actor', 0, 0, [['heal', 10]]);
    const farther = creep('a', 3, 0, [], { hits: 50 });
    const nearer = creep('z', 1, 0, [], { hits: 50 });

    assert.deepEqual(selectHealingAction(actor, [farther, nearer]), {
        method: 'heal', target: nearer,
    });
});

test('self wins equal capped scores; adjacent allies use heal and range 3 uses rangedHeal', () => {
    const actor = creep('actor', 0, 0, [['heal', 10]], { hits: 50 });
    const adjacent = creep('adjacent', 1, 0, [], { hits: 50 });
    const atThree = creep('three', 3, 0, [], { hits: 50 });
    const atFour = creep('four', 4, 0, [], { hits: 50 });

    assert.deepEqual(selectHealingAction(actor, [adjacent]), { method: 'heal', target: actor });
    actor.hits = 100;
    assert.deepEqual(selectHealingAction(actor, [adjacent]), { method: 'heal', target: adjacent });
    assert.deepEqual(selectHealingAction(actor, [atThree]), { method: 'rangedHeal', target: atThree });
    assert.equal(selectHealingAction(actor, [atFour]), null);
});

test('healing suppresses conflicting attacks but permits compatible ranged attack', () => {
    const actor = creep('actor', 0, 0, [
        ['attack', 10], ['ranged_attack', 10], ['heal', 10],
    ], { hits: 50 });
    const enemy = creep('enemy', 1, 0, [], { my: false });
    const distantAlly = creep('ally', 2, 0, [], { hits: 50 });

    executeTactics([actor], [enemy], [actor, distantAlly]);
    assert.deepEqual(actor.calls, [['heal', 'actor'], ['rangedAttack', 'enemy']]);

    actor.calls.length = 0;
    actor.hits = 100;
    executeTactics([actor], [enemy], [distantAlly]);
    assert.deepEqual(actor.calls, [['rangedHeal', 'ally']]);

    actor.calls.length = 0;
    executeTactics([actor], [enemy], []);
    assert.deepEqual(actor.calls, [['rangedAttack', 'enemy'], ['attack', 'enemy']]);
});

test('no eligible enemies or damaged allies produces no tactical actions', () => {
    const actor = creep('actor', 0, 0, [
        ['attack', 10], ['ranged_attack', 10], ['heal', 10],
    ]);
    const deadEnemy = creep('dead', 1, 0, [], { my: false, hits: 0 });
    const farEnemy = creep('far', 4, 0, [], { my: false });
    const healthyAlly = creep('healthy', 1, 0);

    executeTactics([actor], [deadEnemy, farEnemy], [healthyAlly]);
    assert.deepEqual(actor.calls, []);
});

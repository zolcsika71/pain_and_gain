import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Replace only Arena-provided imports; all project modules remain real.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__painAndGainArenaObjects.get(prototype); export const getObjects = () => [...globalThis.__painAndGainArenaObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__painAndGainTick;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000 };'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({
    resolve(specifier, context, nextResolve) {
        const source = arenaModules.get(specifier);
        if (source) {
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});

const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('runTick chooses combat movement or first-flag fallback before compatible tactics', t => {
    const calls = [];
    const snapshots = [];
    const actionCountsAtLog = [];
    const logger = t.mock.method(console, 'log', message => {
        snapshots.push(JSON.parse(message));
        actionCountsAtLog.push(calls.length);
    });
    const firstFlag = Object.assign(new ScoreFlag(), { id: 'first', x: 5, y: 5, effectType: 'heal', scorePerTick: 4 });
    const secondFlag = Object.assign(new ScoreFlag(), { id: 'second', x: 6, y: 5, effectType: 'attack', scorePerTick: 3 });

    function creep(id, x, y, my, hits, parts) {
        const unit = Object.assign(new Creep(), {
            id, x, y, my, hits, hitsMax: 100, fatigue: 0,
            body: parts.map(type => ({ type, hits: 10 })),
            getRangeTo(target) {
                return Math.max(Math.abs(x - target.x), Math.abs(y - target.y));
            },
        });
        for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
            unit[method] = target => calls.push([id, method, target]);
        }
        return unit;
    }

    const healer = creep('healer', 0, 0, true, 100, ['heal', 'ranged_attack']);
    const damagedAlly = creep('ally', 1, 0, true, 50, ['attack']);
    const scout = creep('scout', 0, 2, true, 100, ['move']);
    const enemy = creep('enemy', 3, 0, false, 100, ['attack']);
    globalThis.__painAndGainArenaObjects = new Map([
        [ScoreFlag, [firstFlag, secondFlag]],
        [Creep, [healer, damagedAlly, scout, enemy]],
    ]);
    globalThis.__painAndGainTick = 49;

    try {
        runTick();
        globalThis.__painAndGainTick = 50;
        damagedAlly.hits = 60;
        enemy.hits = 80;
        enemy.x = 2;
        runTick();
    } finally {
        delete globalThis.__painAndGainArenaObjects;
        delete globalThis.__painAndGainTick;
    }

    assert.deepEqual(calls, [
        ['ally', 'moveTo', enemy],
        ['scout', 'moveTo', firstFlag],
        ['healer', 'heal', damagedAlly],
        ['healer', 'rangedAttack', enemy],
        ['scout', 'moveTo', firstFlag],
        ['healer', 'heal', damagedAlly],
        ['healer', 'rangedAttack', enemy],
        ['ally', 'attack', enemy],
    ]);
    assert.equal(logger.mock.callCount(), 3);
    assert.ok(logger.mock.calls.every(call => call.arguments.length === 1));
    assert.deepEqual(actionCountsAtLog, [0, 0, 4]);
    assert.deepEqual(snapshots.map(state => state.type), ['map-state', 'game-state', 'game-state']);
    const map = snapshots.find(state => state.type === 'map-state');
    assert.equal(map.map.terrain.rows.length, 100);
    assert.equal(map.map.terrain.rows[0].length, 100);
    assert.equal(map.map.objects.length, 2);
    assert.deepEqual(map.map.objects.map(object => [object.type, object.id, object.effectType, object.scorePerTick]), [
        ['ScoreFlag', 'first', 'heal', 4], ['ScoreFlag', 'second', 'attack', 3],
    ]);
    assert.ok(map.map.objects.every(object => !['healer', 'ally', 'scout', 'enemy'].includes(object.id)));
    snapshots.splice(snapshots.indexOf(map), 1);
    assert.deepEqual(snapshots.map(state => state.tick), [49, 50]);
    assert.ok(snapshots.every(state => state.phase === 'before-actions'));
    assert.ok(snapshots.every(state => state.selectedFlagId === firstFlag.id));
    assert.deepEqual(snapshots[0].creeps.map(unit => [unit.id, unit.hits]), [
        ['healer', 100], ['ally', 50], ['scout', 100], ['enemy', 100],
    ]);
    assert.deepEqual(snapshots[1].creeps.map(unit => [unit.id, unit.hits]), [
        ['healer', 100], ['ally', 60], ['scout', 100], ['enemy', 80],
    ]);
});

test('runTick retains a local combat objective for one outside tick and resets it on a new match', t => {
    t.mock.method(console, 'log', () => {});
    const moves = [];
    const flag = Object.assign(new ScoreFlag(), { id: 'first', x: 0, y: 5, effectType: 'heal', scorePerTick: 4 });
    const actor = Object.assign(new Creep(), {
        id: 'ranged', x: 0, y: 0, my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: [{ type: 'ranged_attack', hits: 10 }],
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo(target) { moves.push(target); },
        rangedAttack() {},
    });
    const enemy = Object.assign(new Creep(), {
        id: 'enemy', x: 5, y: 0, my: false, hits: 100, hitsMax: 100, fatigue: 0,
        body: [],
    });
    globalThis.__painAndGainArenaObjects = new Map([[ScoreFlag, [flag]], [Creep, [actor, enemy]]]);
    try {
        globalThis.__painAndGainTick = 1;
        runTick();
        enemy.x = 6;
        globalThis.__painAndGainTick = 2;
        runTick();
        globalThis.__painAndGainTick = 1; // A new match must not retain the old target.
        runTick();
    } finally {
        delete globalThis.__painAndGainArenaObjects;
        delete globalThis.__painAndGainTick;
    }
    assert.deepEqual(moves, [enemy, enemy, flag]);
});

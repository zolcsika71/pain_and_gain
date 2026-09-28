import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { oneHealerEscortExperiment, oneScoutFlagExperiment } from '../../src/config.js';
import { buildId } from '../../src/debug/build-id.js';

// Replace only Arena-provided imports; all project modules remain real.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__painAndGainArenaObjects.get(prototype); export const getObjects = () => [...globalThis.__painAndGainArenaObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__painAndGainTick;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000 };'],
    ['game/path-finder', 'export const searchPath = () => { globalThis.__painAndGainPathCalls = (globalThis.__painAndGainPathCalls ?? 0) + 1; return { path: [], incomplete: false }; };'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
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
    const expectedTypes = oneScoutFlagExperiment
        ? ['flag-allocation', 'map-state', 'game-state', 'game-state']
        : ['map-state', 'game-state', 'game-state'];
    assert.equal(logger.mock.callCount(), expectedTypes.length);
    assert.ok(logger.mock.calls.every(call => call.arguments.length === 1));
    assert.deepEqual(actionCountsAtLog, oneScoutFlagExperiment ? [0, 0, 0, 4] : [0, 0, 4]);
    assert.deepEqual(snapshots.map(state => state.type), expectedTypes);
    if (oneScoutFlagExperiment) {
        assert.deepEqual(snapshots[0], {
            type: 'flag-allocation', buildId, phase: 'before-actions', tick: 49,
            event: 'reject', reason: 'first-flag-not-owned', firstFlagId: 'first',
            state: null, objectiveId: 'first', scoutId: null, targetId: null,
        });
    }
    const map = snapshots.find(state => state.type === 'map-state');
    assert.equal(map.buildId, buildId);
    assert.equal(map.tick, 49);
    assert.equal(map.phase, 'before-actions');
    assert.equal(map.map.terrain.rows.length, 100);
    assert.equal(map.map.terrain.rows[0].length, 100);
    assert.equal(map.map.objects.length, 2);
    assert.deepEqual(map.map.objects.map(object => [object.type, object.id, object.effectType, object.scorePerTick]), [
        ['ScoreFlag', 'first', 'heal', 4], ['ScoreFlag', 'second', 'attack', 3],
    ]);
    assert.ok(map.map.objects.every(object => !['healer', 'ally', 'scout', 'enemy'].includes(object.id)));
    const gameStates = snapshots.filter(state => state.type === 'game-state');
    assert.deepEqual(gameStates.map(state => state.tick), [49, 50]);
    assert.ok(gameStates.every(state => state.phase === 'before-actions'));
    assert.ok(gameStates.every(state => state.buildId === buildId));
    assert.ok(gameStates.every(state => state.selectedFlagId === firstFlag.id));
    assert.deepEqual(gameStates[0].creeps.map(unit => [unit.id, unit.hits]), [
        ['healer', 100], ['ally', 50], ['scout', 100], ['enemy', 100],
    ]);
    assert.deepEqual(gameStates[1].creeps.map(unit => [unit.id, unit.hits]), [
        ['healer', 100], ['ally', 60], ['scout', 100], ['enemy', 80],
    ]);
});

test('runTick keeps escort opt-in, records actual movement results, and resets after a new match', t => {
    const entries = [];
    const calls = [];
    t.mock.method(console, 'log', message => entries.push({ value: JSON.parse(message), calls: calls.length }));
    const first = Object.assign(new ScoreFlag(), {
        id: 'first', x: 10, y: 10, my: true, effectType: 'heal', scorePerTick: 4,
    });
    function unit(id, x, parts, my = true) {
        return Object.assign(new Creep(), {
            id, x, y: 0, my, hits: 100, hitsMax: 100, fatigue: 0,
            body: parts.map(type => ({ type, hits: 100 })),
            getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
            moveTo(target) { calls.push([id, 'moveTo', target.id]); return -11; },
            attack() {}, heal() {}, rangedHeal() {}, rangedAttack() {},
        });
    }
    const healer = unit('healer', 4, ['heal', 'move']);
    const melee = unit('melee', 0, ['attack', 'move']);
    const foe = unit('foe', -4, ['attack', 'move'], false);
    globalThis.__painAndGainArenaObjects = new Map([[ScoreFlag, [first]], [Creep, [healer, melee, foe]]]);
    globalThis.__painAndGainPathCalls = 0;
    let pathCalls;
    try {
        globalThis.__painAndGainTick = 1000;
        runTick();
        globalThis.__painAndGainTick = 1001;
        melee.hits = 80;
        runTick();
        globalThis.__painAndGainTick = 1;
        melee.hits = 100;
        runTick();
    } finally {
        pathCalls = globalThis.__painAndGainPathCalls;
        delete globalThis.__painAndGainArenaObjects;
        delete globalThis.__painAndGainPathCalls;
        delete globalThis.__painAndGainTick;
    }
    assert.deepEqual(calls.filter(([id]) => id === 'healer').map(([, , target]) => target),
        oneHealerEscortExperiment ? ['melee', 'melee', 'melee'] : ['first', 'melee', 'first']);
    assert.equal(calls.filter(([id]) => id === 'healer').length, 3);
    assert.equal(pathCalls, 0);
    assert.deepEqual(entries.filter(({ value }) => value.type === 'game-state').map(({ value }) => value.tick),
        [1000, 1001, 1]);
    const diagnostics = entries.filter(({ value }) => value.type === 'healer-escort');
    if (!oneHealerEscortExperiment) {
        assert.deepEqual(diagnostics, []);
    } else {
        assert.deepEqual(diagnostics.map(({ value }) => [value.tick, value.event]), [
            [1000, 'assign'], [1000, 'move-attempt'], [1001, 'release'],
            [1, 'assign'], [1, 'move-attempt'],
        ]);
        assert.ok(diagnostics.every(({ value }) => value.buildId === buildId));
        assert.deepEqual(diagnostics.filter(({ value }) => value.event === 'move-attempt')
            .map(({ value }) => [value.targetId, value.returnCode, value.range]),
        [['melee', -11, 4], ['melee', -11, 4]]);
        assert.equal(diagnostics.find(({ value }) => value.event === 'release').value.reason, 'friendly-injured');
        assert.deepEqual(diagnostics.filter(({ value }) => value.phase === 'before-actions')
            .map(({ calls: count }) => count), [0, 2, 4]);
    }
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

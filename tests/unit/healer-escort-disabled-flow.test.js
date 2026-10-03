import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { oneHealerEscortExperiment, oneScoutFlagExperiment } from '../../src/config.js';

// Preserve the disabled deployment baseline through an isolated module-boundary
// configuration. The checked-in configuration remains independently asserted.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__disabledEscortObjects.get(prototype); export const getObjects = () => [...globalThis.__disabledEscortObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__disabledEscortTick; export const getCpuTime = () => 123456;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
    ['game/path-finder', 'export const searchPath = () => { globalThis.__disabledEscortPathCalls = (globalThis.__disabledEscortPathCalls ?? 0) + 1; return { path: [], incomplete: false }; };'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === './config.js' && context.parentURL?.endsWith('/src/loop.js')) {
            return { url: 'data:text/javascript,export const oneScoutFlagExperiment = false; export const oneHealerEscortExperiment = false; export const scoutHoldExperiment = false; export const squadPairExperiment = false;', shortCircuit: true };
        }
        const source = arenaModules.get(specifier);
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('isolated disabled config preserves first-flag fallback and injury support', t => {
    assert.equal(oneScoutFlagExperiment, false);
    assert.equal(oneHealerEscortExperiment, true);
    const calls = [];
    const records = [];
    t.mock.method(console, 'log', line => records.push(JSON.parse(line)));
    const first = Object.assign(new ScoreFlag(), { id: 'first', x: 10, y: 10, my: true,
        effectType: 'heal', scorePerTick: 4 });
    function unit(id, x, parts, my = true) {
        return Object.assign(new Creep(), {
            id, x, y: 0, my, hits: 100, hitsMax: 100, fatigue: 0,
            body: parts.map(type => ({ type, hits: 100 })),
            getRangeTo(target) {
                return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y));
            },
            moveTo(target) { calls.push([globalThis.__disabledEscortTick, id, 'moveTo', target.id]); },
            attack() {}, rangedAttack() {}, heal() {}, rangedHeal() {},
        });
    }
    const healer = unit('healer', 4, ['heal', 'move']);
    const melee = unit('melee', 0, ['attack', 'move']);
    const foe = unit('foe', -4, ['attack', 'move'], false);
    const creeps = [healer, melee, foe];
    globalThis.__disabledEscortObjects = new Map([[ScoreFlag, [first]], [Creep, creeps]]);
    globalThis.__disabledEscortPathCalls = 0;
    const inputSnapshot = () => JSON.stringify(creeps.map(creep => ({ id: creep.id,
        x: creep.x, y: creep.y, my: creep.my, hits: creep.hits, hitsMax: creep.hitsMax,
        fatigue: creep.fatigue, body: creep.body })));
    let pathCalls;
    try {
        globalThis.__disabledEscortTick = 98;
        const beforeHealthy = inputSnapshot();
        runTick();
        assert.equal(inputSnapshot(), beforeHealthy);

        melee.hits = 80;
        globalThis.__disabledEscortTick = 99;
        const beforeInjury = inputSnapshot();
        runTick();
        assert.equal(inputSnapshot(), beforeInjury);

        melee.hits = 100;
        globalThis.__disabledEscortTick = 1;
        const beforeReset = inputSnapshot();
        runTick();
        assert.equal(inputSnapshot(), beforeReset);
    } finally {
        pathCalls = globalThis.__disabledEscortPathCalls;
        delete globalThis.__disabledEscortObjects;
        delete globalThis.__disabledEscortPathCalls;
        delete globalThis.__disabledEscortTick;
    }

    assert.deepEqual(calls, [
        [98, 'healer', 'moveTo', 'first'], [98, 'melee', 'moveTo', 'foe'],
        [99, 'healer', 'moveTo', 'melee'], [99, 'melee', 'moveTo', 'foe'],
        [1, 'healer', 'moveTo', 'first'], [1, 'melee', 'moveTo', 'foe'],
    ]);
    assert.equal(pathCalls, 0);
    assert.ok(calls.every((call, index) => calls.findIndex(other =>
        other[0] === call[0] && other[1] === call[1]) === index));
    assert.ok(!records.some(record => record.type === 'healer-escort'));
    assert.ok(!records.some(record => record.type === 'flag-allocation'));
});

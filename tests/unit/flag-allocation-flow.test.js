import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Keep production tick orchestration and planner; replace Arena imports and
// the deployment switch only at the module boundary for this enabled-mode test.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__flagFlowObjects.get(prototype); export const getObjects = () => [...globalThis.__flagFlowObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__flagFlowTick;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000 };'],
    ['game/path-finder', 'export const searchPath = (...args) => globalThis.__flagFlowSearch(...args);'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === './config.js' && context.parentURL?.endsWith('/src/loop.js')) {
            return { url: 'data:text/javascript,export const oneScoutFlagExperiment = true;', shortCircuit: true };
        }
        const source = arenaModules.get(specifier);
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('enabled runTick logs evaluated Arena route and assignment before action, then completion', t => {
    const events = [];
    const logs = [];
    t.mock.method(console, 'log', line => { logs.push(JSON.parse(line)); events.push('log'); });
    const first = Object.assign(new ScoreFlag(), { id: 'first', x: 1, y: 0, my: true,
        effectType: 'other', scorePerTick: 4 });
    const target = Object.assign(new ScoreFlag(), { id: 'target', x: 10, y: 0,
        effectType: 'eff_attack_modifier', scorePerTick: 3 });
    const scout = Object.assign(new Creep(), { id: 'scout', x: 0, y: 0, my: true,
        hits: 100, hitsMax: 100, fatigue: 0, body: [{ type: 'move', hits: 100 }],
        moveTo(flag) { events.push(`scout:${flag.id}`); } });
    const defender = Object.assign(new Creep(), { id: 'defender', x: 1, y: 1, my: true,
        hits: 100, hitsMax: 100, fatigue: 0, body: [{ type: 'attack', hits: 100 }],
        moveTo(flag) { events.push(`defender:${flag.id}`); } });
    let searches = 0;
    globalThis.__flagFlowSearch = () => {
        searches++;
        return { path: Array(10), incomplete: false, cost: 12, ops: 37 };
    };
    globalThis.__flagFlowObjects = new Map([[ScoreFlag, [first, target]], [Creep, [scout, defender]]]);
    try {
        globalThis.__flagFlowTick = 40;
        runTick();
        target.my = true;
        globalThis.__flagFlowTick = 41;
        runTick();
        globalThis.__flagFlowTick = 42;
        runTick();
        globalThis.__flagFlowTick = 43;
        runTick();
    } finally {
        delete globalThis.__flagFlowTick;
        delete globalThis.__flagFlowObjects;
        delete globalThis.__flagFlowSearch;
    }
    assert.equal(searches, 1);
    assert.deepEqual(logs.filter(entry => entry.type === 'flag-allocation').map(entry =>
        [entry.tick, entry.event, entry.reason, entry.objectiveId]), [
        [40, 'assign', 'shortest-eligible-route', 'target'],
        [41, 'complete', 'target-owned', 'first'],
        [42, 'reject', 'attempt-finished', 'first'],
    ]);
    assert.deepEqual(logs.find(entry => entry.type === 'flag-allocation').evaluations[0].scoutRoute,
        { incomplete: false, length: 10, cost: 12, ops: 37 });
    assert.deepEqual(events.filter(entry => entry.startsWith('scout:')),
        ['scout:target', 'scout:first', 'scout:first', 'scout:first']);
    assert.ok(events.indexOf('scout:target') > events.indexOf('log'));
});

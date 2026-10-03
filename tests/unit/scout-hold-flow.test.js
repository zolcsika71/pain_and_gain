import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { buildId } from '../../src/debug/build-id.js';

// Isolate deployment switches, not production orchestration or action logging.
const modules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = p => globalThis.__holdObjects.get(p); export const getObjects = () => [...globalThis.__holdObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__holdTick; export const getCpuTime = () => 123456;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
    ['game/path-finder', 'export const searchPath = () => ({ path: Array(10), incomplete: false });'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === './config.js' && context.parentURL?.endsWith('/src/loop.js')) {
            return { url: 'data:text/javascript,export const oneScoutFlagExperiment = true; export const oneHealerEscortExperiment = true; export const scoutHoldExperiment = true; export const squadPairExperiment = false;', shortCircuit: true };
    }
    if (modules.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(modules.get(specifier))}`, shortCircuit: true };
    return nextResolve(specifier, context);
} });
const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('enabled tick flow records threat release, re-hold, and allocation priority', t => {
    const logs = [], moves = [];
    t.mock.method(console, 'log', line => logs.push(JSON.parse(line)));
    const first = Object.assign(new ScoreFlag(), { id: 'first', x: 49, y: 49,
        my: true, effectType: 'other', scorePerTick: 5 });
    const target = Object.assign(new ScoreFlag(), { id: 'target', x: 57, y: 50,
        effectType: 'eff_attack_modifier', scorePerTick: 3 });
    const unit = (id, x, parts) => Object.assign(new Creep(), { id, x, y: 50,
        my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: parts.map(type => ({ type, hits: 100 })),
        getRangeTo(o) { return Math.max(Math.abs(this.x - o.x), Math.abs(this.y - o.y)); },
        moveTo(o) { moves.push([globalThis.__holdTick, id, o.id]); return 0; } });
    const scout = unit('scout', 47, ['move']), defender = unit('defender', 49, ['attack']);
    globalThis.__holdObjects = new Map([[Creep, [scout, defender]], [ScoreFlag, [first]]]);
    t.after(() => { delete globalThis.__holdObjects; delete globalThis.__holdTick; });
    globalThis.__holdTick = 1; runTick();
    first.my = false;
    globalThis.__holdTick = 2; runTick();
    first.my = true;
    globalThis.__holdObjects.set(ScoreFlag, [first, target]);
    globalThis.__holdTick = 3; runTick();
    globalThis.__holdObjects.set(ScoreFlag, [first]);
    globalThis.__holdTick = 4; runTick();
    const enemy = unit('enemy', 54, ['move']);
    enemy.y = 49;
    enemy.my = false; // Exactly five tiles from the flag, seven from the scout.
    globalThis.__holdObjects.set(Creep, [scout, defender, enemy]);
    globalThis.__holdTick = 5; runTick();
    globalThis.__holdObjects.set(Creep, [scout, defender]);
    globalThis.__holdTick = 6; runTick();
    const decisions = logs.filter(x => x.type === 'action-decision' && x.actorId === 'scout' && x.channel === 'movement');
    assert.deepEqual(decisions.map(d => [d.tick, d.outcome, d.reason]), [
        [1, 'hold', 'scout-owned-flag-hold'], [2, 'selected', 'flag-fallback'],
        [3, 'selected', 'flag-fallback'], [4, 'hold', 'scout-owned-flag-hold'],
        [5, 'selected', 'flag-fallback'], [6, 'hold', 'scout-owned-flag-hold'],
    ]);
    assert.deepEqual(moves.filter(([, id]) => id === 'scout'),
        [[2, 'scout', 'first'], [3, 'scout', 'target'], [5, 'scout', 'first']]);
    assert.ok(decisions.every(d => d.buildId === buildId));
    const attempts = logs.filter(x => x.type === 'action-attempt' && x.actorId === 'scout');
    assert.deepEqual(attempts.map(a => [a.tick, a.method, a.returnCode]),
        [[2, 'moveTo', 0], [3, 'moveTo', 0], [5, 'moveTo', 0]]);
    assert.equal(logs.find(x => x.type === 'flag-allocation' && x.tick === 3).event, 'assign');
    assert.equal(logs.filter(x => x.type === 'evidence-coverage').length, 6);
});

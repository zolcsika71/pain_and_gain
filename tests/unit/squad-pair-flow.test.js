import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { validActionDecision, validActionAttempt, summarizeDiagnosticCoverage } from '../../tools/replay-logs.js';

const modules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = p => globalThis.__pairObjects.get(p); export const getObjects = () => [...globalThis.__pairObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__pairTick; export const getCpuTime = () => 12345;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
    ['game/path-finder', 'export const searchPath = () => { throw Error("allocation must remain off"); };'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({ resolve(specifier, context, next) {
    if (specifier === './config.js' && context.parentURL?.endsWith('/src/loop.js')) {
        return { url: 'data:text/javascript,export const oneScoutFlagExperiment = false; export const oneHealerEscortExperiment = true; export const scoutHoldExperiment = false; export const squadPairExperiment = true;', shortCircuit: true };
    }
    const source = modules.get(specifier);
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
        : next(specifier, context);
} });
const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('enabled production tick flow resets the pair, yields to escort/combat/healing, and closes diagnostics', t => {
    const records = [], calls = [], searches = [];
    t.mock.method(console, 'log', line => records.push(JSON.parse(line)));
    function unit(id, x, y, parts, my = true) {
        const creep = Object.assign(new Creep(), { id, x, y, my, hits: 100, hitsMax: 100, fatigue: 0,
            body: parts.map(type => ({ type, hits: 100 })),
            getRangeTo(to) { return Math.max(Math.abs(this.x - to.x), Math.abs(this.y - to.y)); },
            findPathTo(to, opts) {
                searches.push({ id, tick: globalThis.__pairTick, opts });
                return [{ x: this.x + Math.sign(to.x - this.x), y: this.y + Math.sign(to.y - this.y) }];
            },
        });
        for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
            creep[method] = target => { calls.push({ tick: globalThis.__pairTick, id, method,
                target: { id: target.id, x: target.x, y: target.y } }); return 0; };
        }
        return creep;
    }
    const leader = unit('a', 10, 10, ['attack', 'move']);
    const follower = unit('h', 9, 10, ['heal', 'move']);
    const scouts = Array.from({ length: 12 }, (_, i) => unit(`s${i}`, 30 + i, 30, ['move']));
    const owned = [follower, leader, ...scouts];
    const flag = Object.assign(new ScoreFlag(), { id: 'flag', x: 20, y: 10, my: false,
        effectType: 'heal', scorePerTick: 4 });
    globalThis.__pairObjects = new Map([[Creep, owned], [ScoreFlag, [flag]]]);
    const tick = number => {
        const start = records.length;
        globalThis.__pairTick = number;
        runTick();
        const emitted = records.slice(start);
        const coverage = summarizeDiagnosticCoverage(
            emitted.filter(r => r.type === 'game-state').map(r => JSON.stringify(r)),
            emitted.filter(r => r.recordId).map(r => ({ entry: r, key: r.recordId })));
        assert.deepEqual(coverage.completeTicks, [number]);
        assert.deepEqual(coverage.correlationIssues, []);
        assert.deepEqual(coverage.gaps, []);
    };
    try {
        tick(1);
        assert.equal(calls[0].id, 'a');
        assert.deepEqual(calls.find(c => c.id === 'h').target, { id: undefined, x: 10, y: 10 });
        follower.x = 7; tick(2);
        assert.ok(!calls.some(c => c.tick === 2 && c.id === 'a' && c.method === 'moveTo'));
        assert.ok(records.some(r => r.tick === 2 && r.reason === 'pair-leader-wait'));
        follower.x = 9; follower.fatigue = 1; tick(3);
        assert.ok(!calls.some(c => c.tick === 3 && ['a', 'h'].includes(c.id) && c.method === 'moveTo'));
        follower.fatigue = 0;
        flag.my = true;
        // Enemy engages the leader while remaining outside the healer's danger radius.
        const foe = unit('foe', 14, 10, ['attack', 'move'], false);
        globalThis.__pairObjects.set(Creep, [...owned, foe]);
        tick(4);
        assert.ok(records.some(r => r.tick === 4 && r.pair?.reason === 'escort-priority'));
        assert.ok(records.some(r => r.tick === 4 && r.actorId === 'h' && r.reason === 'escort-in-range'));
        assert.ok(calls.some(c => c.tick === 4 && c.id === 'a' && c.target.id === 'foe'));
        // Injury releases escort, ordinary healer support and attacks remain available.
        scouts[0].x = 9; scouts[0].y = 11; scouts[0].hits = 50;
        foe.x = 11; tick(5);
        assert.ok(calls.some(c => c.tick === 5 && c.id === 'h' && c.method === 'heal'));
        assert.ok(calls.some(c => c.tick === 5 && c.id === 'a' && c.method === 'attack'));
        assert.ok(!records.some(r => r.tick === 5 && r.pair));
        globalThis.__pairObjects.set(Creep, owned);
        scouts[0].hits = 100; scouts[0].x = 30; scouts[0].y = 30;
        flag.my = false;
        tick(1);
        assert.ok(records.filter(r => r.tick === 1 && r.pair?.status === 'active').length === 4);
        const decisions = records.filter(r => r.type === 'action-decision');
        assert.ok(decisions.every(validActionDecision));
        assert.ok(records.filter(r => r.type === 'action-attempt').every(validActionAttempt));
        const closures = records.filter(r => r.type === 'evidence-coverage');
        assert.equal(closures.length, 6);
        for (const closure of closures) {
            assert.equal(closure.counts['movement-decisions'], 14);
            assert.equal(closure.counts['healing-decisions'], 14);
            assert.equal(closure.counts['combat-decisions'], 14);
            assert.equal(closure.counts['runtime-cpu'], 1);
        }
        for (const number of [2, 3, 4, 5]) {
            const moves = calls.filter(c => c.tick === number && c.method === 'moveTo');
            assert.equal(moves.length, new Set(moves.map(c => c.id)).size);
        }
        assert.ok(searches.every(search => search.opts.maxOps === 1000));
        assert.ok(!searches.some(search => search.tick === 3 || search.tick === 4 || search.tick === 5));
    } finally {
        delete globalThis.__pairObjects; delete globalThis.__pairTick;
    }
});

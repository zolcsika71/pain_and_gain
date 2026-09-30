import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { oneHealerEscortExperiment, oneScoutFlagExperiment } from '../../src/config.js';

// Exercise production orchestration, selectors, and the checked-in deployment
// configuration. Only Arena-provided modules are replaced.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__escortFlowObjects.get(prototype); export const getObjects = () => [...globalThis.__escortFlowObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__escortFlowTick; export const getCpuTime = () => 123456;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
    ['game/path-finder', 'export const searchPath = () => { globalThis.__escortFlowPathCalls = (globalThis.__escortFlowPathCalls ?? 0) + 1; return { path: [], incomplete: false }; };'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({
    resolve(specifier, context, nextResolve) {
        const source = arenaModules.get(specifier);
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

function unit(id, x, y, parts, my, calls) {
    const creep = Object.assign(new Creep(), {
        id, x, y, my, hits: 100, hitsMax: 100, fatigue: 0,
        body: parts.map(type => ({ type, hits: 100 })),
        getRangeTo(target) {
            return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y));
        },
    });
    for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
        creep[method] = target => {
            const returnCode = method === 'moveTo' && id === 'healer' &&
                globalThis.__escortFlowTick === 98 ? -11 : 0;
            calls.push([globalThis.__escortFlowTick, id, method, target.id, returnCode]);
            return returnCode;
        };
    }
    return creep;
}

function inputSnapshot(flag, creeps) {
    return JSON.stringify({ flag: { id: flag.id, x: flag.x, y: flag.y, my: flag.my },
        creeps: creeps.map(creep => ({ id: creep.id, x: creep.x, y: creep.y, my: creep.my,
            hits: creep.hits, hitsMax: creep.hitsMax, fatigue: creep.fatigue,
            body: creep.body.map(part => ({ ...part })) })) });
}

test('enabled runTick retains for remote injury, releases for local injury, and resets', t => {
    assert.equal(oneScoutFlagExperiment, false);
    assert.equal(oneHealerEscortExperiment, true);
    const calls = [];
    const records = [];
    t.mock.method(console, 'log', line => records.push(JSON.parse(line)));
    const first = Object.assign(new ScoreFlag(), { id: 'first', x: 10, y: 10, my: true,
        effectType: 'heal', scorePerTick: 4 });
    const melee = unit('melee', 0, 0, ['attack', 'move'], true, calls);
    const scout = unit('scout', 1, 2, ['move'], true, calls);
    const healer = unit('healer', 4, 0, ['heal', 'move'], true, calls);
    const ranged = unit('ranged', -2, 2, ['ranged_attack', 'move'], true, calls);
    const foe = unit('foe', -4, 0, ['attack', 'move'], false, calls);
    const engaged = unit('engaged', 0, 2, ['attack', 'move'], false, calls);
    const creeps = [melee, scout, healer, ranged, foe, engaged];
    globalThis.__escortFlowObjects = new Map([[ScoreFlag, [first]], [Creep, creeps]]);
    globalThis.__escortFlowPathCalls = 0;
    let pathCalls;

    try {
        globalThis.__escortFlowTick = 98;
        const beforeHealthyTick = inputSnapshot(first, creeps);
        runTick();
        assert.equal(inputSnapshot(first, creeps), beforeHealthyTick);

        scout.x = 10;
        scout.y = 0;
        scout.hits = 80; // Six tiles from the assigned healer.
        globalThis.__escortFlowTick = 99;
        const beforeRemoteInjuryTick = inputSnapshot(first, creeps);
        runTick();
        assert.equal(inputSnapshot(first, creeps), beforeRemoteInjuryTick);

        healer.x = 3;
        scout.x = 6; // Three tiles from the assigned healer.
        globalThis.__escortFlowTick = 100;
        const beforeLocalInjuryTick = inputSnapshot(first, creeps);
        runTick();
        assert.equal(inputSnapshot(first, creeps), beforeLocalInjuryTick);

        healer.x = 4;
        scout.hits = 100;
        scout.x = 1;
        scout.y = 2;
        globalThis.__escortFlowTick = 1;
        const beforeResetTick = inputSnapshot(first, creeps);
        runTick();
        assert.equal(inputSnapshot(first, creeps), beforeResetTick);
    } finally {
        pathCalls = globalThis.__escortFlowPathCalls;
        delete globalThis.__escortFlowObjects;
        delete globalThis.__escortFlowPathCalls;
        delete globalThis.__escortFlowTick;
    }

    const disabledBaselineTick98 = [
        [98, 'melee', 'moveTo', 'engaged', 0],
        [98, 'scout', 'moveTo', 'first', 0],
        [98, 'healer', 'moveTo', 'first', -11],
        [98, 'ranged', 'rangedAttack', 'engaged', 0],
    ];
    assert.deepEqual(calls, [
        [98, 'melee', 'moveTo', 'engaged', 0],
        [98, 'scout', 'moveTo', 'first', 0],
        [98, 'healer', 'moveTo', 'melee', -11],
        [98, 'ranged', 'rangedAttack', 'engaged', 0],
        [99, 'melee', 'moveTo', 'engaged', 0],
        [99, 'scout', 'moveTo', 'first', 0],
        [99, 'healer', 'moveTo', 'melee', 0],
        [99, 'ranged', 'rangedAttack', 'engaged', 0],
        [100, 'melee', 'moveTo', 'engaged', 0],
        [100, 'scout', 'moveTo', 'first', 0],
        [100, 'healer', 'rangedHeal', 'scout', 0],
        [100, 'ranged', 'rangedAttack', 'engaged', 0],
        [1, 'melee', 'moveTo', 'engaged', 0],
        [1, 'scout', 'moveTo', 'first', 0],
        [1, 'healer', 'moveTo', 'melee', 0],
        [1, 'ranged', 'rangedAttack', 'engaged', 0],
    ]);
    assert.deepEqual(calls.slice(0, 2), disabledBaselineTick98.slice(0, 2));
    assert.deepEqual(calls[2].slice(0, 3), disabledBaselineTick98[2].slice(0, 3));
    assert.equal(disabledBaselineTick98[2][3], 'first');
    assert.equal(calls[2][3], 'melee');
    assert.deepEqual(calls[3], disabledBaselineTick98[3]);
    assert.deepEqual(calls.slice(4, 8), [
        [99, 'melee', 'moveTo', 'engaged', 0],
        [99, 'scout', 'moveTo', 'first', 0],
        [99, 'healer', 'moveTo', 'melee', 0],
        [99, 'ranged', 'rangedAttack', 'engaged', 0],
    ]);
    assert.deepEqual(calls.slice(8, 12), [
        [100, 'melee', 'moveTo', 'engaged', 0],
        [100, 'scout', 'moveTo', 'first', 0],
        [100, 'healer', 'rangedHeal', 'scout', 0],
        [100, 'ranged', 'rangedAttack', 'engaged', 0],
    ]);
    assert.equal(pathCalls, 0);
    assert.ok(calls.filter(([, , method]) => method === 'moveTo').every((call, index, moves) =>
        moves.findIndex(other => other[0] === call[0] && other[1] === call[1]) === index));

    const escort = records.filter(record => record.type === 'healer-escort');
    assert.deepEqual(escort.map(record => [record.tick, record.phase, record.event, record.reason,
        record.healerId, record.allyId, record.targetId, record.returnCode]), [
        [98, 'before-actions', 'assign', 'local-engagement', 'healer', 'melee', null, null],
        [98, 'movement', 'move-attempt', null, 'healer', 'melee', 'melee', -11],
        [99, 'movement', 'move-attempt', null, 'healer', 'melee', 'melee', 0],
        [100, 'before-actions', 'release', 'friendly-injured', 'healer', 'melee', null, null],
        [1, 'before-actions', 'assign', 'local-engagement', 'healer', 'melee', null, null],
        [1, 'movement', 'move-attempt', null, 'healer', 'melee', 'melee', 0],
    ]);

    const decisions = records.filter(record => record.type === 'action-decision');
    const attempts = records.filter(record => record.type === 'action-attempt');
    const escortDecision = decisions.find(record => record.tick === 98 &&
        record.actorId === 'healer' && record.channel === 'movement');
    const escortAttempt = attempts.find(record => record.tick === 98 &&
        record.actorId === 'healer' && record.channel === 'movement');
    assert.deepEqual({ outcome: escortDecision.outcome, reason: escortDecision.reason,
        action: escortDecision.actions[0] }, {
        outcome: 'selected', reason: 'escort-approach',
        action: { actionId: `${escortDecision.decisionId}#0`, method: 'moveTo',
            target: { kind: 'creep', id: 'melee', x: 0, y: 0 } },
    });
    assert.deepEqual({ decisionId: escortAttempt.decisionId, actionId: escortAttempt.actionId,
        method: escortAttempt.method, target: escortAttempt.target,
        returnCode: escortAttempt.returnCode }, {
        decisionId: escortDecision.decisionId, actionId: escortDecision.actions[0].actionId,
        method: 'moveTo', target: escortDecision.actions[0].target, returnCode: -11,
    });
    const retainedDecision = decisions.find(record => record.tick === 99 &&
        record.actorId === 'healer' && record.channel === 'movement');
    const retainedAttempt = attempts.find(record => record.tick === 99 &&
        record.actorId === 'healer' && record.channel === 'movement');
    assert.deepEqual({ outcome: retainedDecision.outcome, reason: retainedDecision.reason,
        decisionId: retainedAttempt.decisionId, actionId: retainedAttempt.actionId,
        returnCode: retainedAttempt.returnCode }, {
        outcome: 'selected', reason: 'escort-approach',
        decisionId: retainedDecision.decisionId,
        actionId: retainedDecision.actions[0].actionId, returnCode: 0,
    });
    const releasedMovement = decisions.find(record => record.tick === 100 &&
        record.actorId === 'healer' && record.channel === 'movement');
    const healingDecision = decisions.find(record => record.tick === 100 &&
        record.actorId === 'healer' && record.channel === 'healing');
    assert.deepEqual([releasedMovement.outcome, releasedMovement.reason,
        releasedMovement.actions.length], ['hold', 'injured-ally-in-range', 0]);
    assert.deepEqual([healingDecision.outcome, healingDecision.reason,
        healingDecision.actions[0].method, healingDecision.actions[0].target.id],
    ['selected', 'injured-ally-in-range', 'rangedHeal', 'scout']);
    assert.ok(!records.some(record => record.type === 'flag-allocation'));
});

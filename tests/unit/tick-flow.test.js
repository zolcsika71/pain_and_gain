import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { oneHealerEscortExperiment, oneScoutFlagExperiment } from '../../src/config.js';
import { buildId } from '../../src/debug/build-id.js';

// Replace only Arena-provided imports; all project modules remain real.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__painAndGainArenaObjects.get(prototype); export const getObjects = () => [...globalThis.__painAndGainArenaObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__painAndGainTick; export const getCpuTime = () => globalThis.__painAndGainCpuTime ?? 123456;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
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

const { runTick, getMembershipState } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('production enables only the healer escort experiment', () => {
    assert.equal(oneScoutFlagExperiment, false);
    assert.equal(oneHealerEscortExperiment, true);
});

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

    // Exact pre-integration action trace on these same observations: membership
    // bookkeeping must not change targets, commands, or their order.
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
    const legacyTypes = oneScoutFlagExperiment
        ? ['flag-allocation', 'map-state', 'game-state', 'game-state']
        : ['map-state', 'game-state', 'game-state'];
    assert.equal(logger.mock.callCount(), oneScoutFlagExperiment ? 35 : 34);
    assert.ok(logger.mock.calls.every(call => call.arguments.length === 1));
    assert.deepEqual(snapshots.filter(state => !['membership-baseline', 'membership-change',
        'action-decision', 'action-attempt', 'runtime-cpu', 'evidence-coverage'].includes(state.type))
        .map(state => state.type), legacyTypes);
    const actionEvidence = snapshots.filter(state => state.type === 'action-decision' ||
        state.type === 'action-attempt');
    assert.equal(actionEvidence.filter(record => record.type === 'action-decision').length, 18);
    assert.equal(actionEvidence.filter(record => record.type === 'action-attempt').length, 8);
    for (const attempt of actionEvidence.filter(record => record.type === 'action-attempt')) {
        const selection = actionEvidence.find(record => record.type === 'action-decision' &&
            record.decisionId === attempt.decisionId);
        const action = selection.actions.find(item => item.actionId === attempt.actionId);
        assert.equal(attempt.actorId, selection.actorId);
        assert.equal(attempt.channel, selection.channel);
        assert.equal(attempt.method, action.method);
        assert.deepEqual(attempt.target, action.target);
    }
    assert.deepEqual(snapshots.filter(state => state.type === 'evidence-coverage')
        .map(state => [state.tick, state.recordCount, state.counts]), [
        [49, 15, { 'membership-baseline': 1, 'membership-change': 0,
            'action-decision': 9, 'action-attempt': 4, 'movement-decisions': 3,
            'healing-decisions': 3, 'combat-decisions': 3, 'runtime-cpu': 1 }],
        [50, 14, { 'membership-baseline': 0, 'membership-change': 0,
            'action-decision': 9, 'action-attempt': 4, 'movement-decisions': 3,
            'healing-decisions': 3, 'combat-decisions': 3, 'runtime-cpu': 1 }],
    ]);
    assert.deepEqual(snapshots.filter(state => state.type === 'runtime-cpu').map(state => ({
        tick: state.tick, phase: state.phase, elapsedNs: state.elapsedNs,
        limitNs: state.limitNs, limitKind: state.limitKind, unit: state.unit,
    })), [
        { tick: 49, phase: 'after-actions', elapsedNs: 123456,
            limitNs: 20000000, limitKind: 'ordinary-tick', unit: 'nanoseconds' },
        { tick: 50, phase: 'after-actions', elapsedNs: 123456,
            limitNs: 20000000, limitKind: 'ordinary-tick', unit: 'nanoseconds' },
    ]);
    assert.ok(snapshots.filter(state => state.type === 'runtime-cpu').every((sample, index) =>
        snapshots.indexOf(sample) + 1 === snapshots.indexOf(snapshots.filter(state =>
            state.type === 'evidence-coverage')[index])));
    assert.deepEqual(snapshots.map((state, index) => state.type === 'runtime-cpu'
        ? actionCountsAtLog[index] : null).filter(value => value !== null), [4, 8]);
    assert.equal(actionCountsAtLog[snapshots.findIndex(state => state.type === 'action-attempt')], 1);
    if (oneScoutFlagExperiment) {
        assert.deepEqual(snapshots.find(state => state.type === 'flag-allocation'), {
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
    assert.equal(getMembershipState().initialized, false);
    assert.equal(getMembershipState().reason, 'initial-tick-missed');
});

test('runTick selects the first-tick CPU limit and emits the sample immediately before closure', t => {
    const records = [];
    t.mock.method(console, 'log', message => records.push(JSON.parse(message)));
    globalThis.__painAndGainArenaObjects = new Map([[ScoreFlag, []], [Creep, []]]);
    globalThis.__painAndGainTick = 1;
    globalThis.__painAndGainCpuTime = 25_000_000;
    try {
        runTick();
    } finally {
        delete globalThis.__painAndGainArenaObjects;
        delete globalThis.__painAndGainTick;
        delete globalThis.__painAndGainCpuTime;
    }
    const sampleIndex = records.findIndex(record => record.type === 'runtime-cpu');
    const closureIndex = records.findIndex(record => record.type === 'evidence-coverage');
    assert.deepEqual(records[sampleIndex], {
        type: 'runtime-cpu', formatVersion: 1, buildId, tick: 1,
        phase: 'after-actions', sequence: 2, recordId: '1:2',
        elapsedNs: 25_000_000, limitNs: 100_000_000,
        limitKind: 'first-tick', unit: 'nanoseconds',
    });
    assert.equal(closureIndex, sampleIndex + 1);
    assert.equal(records[closureIndex].formatVersion, 2);
    assert.ok(records[closureIndex].coveredTypes.includes('runtime-cpu'));
});

function membershipFixture(prefix = 'pg_player1_') {
    const specs = [
        ['healer_1', 9, 11, 'heal', 6], ['melee_2', 10, 11, 'attack', 8],
        ['melee_3', 10, 12, 'attack', 8], ['melee_4', 9, 12, 'attack', 8],
        ['healer_2', 14, 6, 'heal', 6], ['melee_1', 15, 7, 'attack', 8],
        ['ranged_1', 15, 6, 'ranged_attack', 6], ['ranged_2', 14, 7, 'ranged_attack', 6],
        ['healer_3', 14, 11, 'heal', 6], ['ranged_3', 15, 11, 'ranged_attack', 6],
        ['ranged_4', 14, 12, 'ranged_attack', 6], ['ranged_5', 15, 12, 'ranged_attack', 6],
        ['scout_1', 12, 9, null, 1], ['scout_2', 9, 6, null, 1],
    ];
    return specs.map(([name, x, y, action, count]) => Object.assign(new Creep(), {
        id: prefix + name, x, y, my: true, exists: true, fatigue: 0,
        hits: (action ? count * 2 : count) * 100,
        hitsMax: (action ? count * 2 : count) * 100,
        body: [...Array(count).fill(action ?? 'move'),
            ...Array(action ? count : 0).fill('move')].map(type => ({ type, hits: 100 })),
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo() {}, attack() {}, rangedAttack() {}, heal() {}, rangedHeal() {},
    }));
}

function observedMember(id) {
    return getMembershipState().members.find(member => member.id.endsWith(id));
}

test('runTick initializes and updates stable membership from current owned observations', t => {
    const evidence = [];
    t.mock.method(console, 'log', message => {
        const record = JSON.parse(message);
        if (record.type.startsWith('membership-') || record.type === 'evidence-coverage') evidence.push(record);
    });
    const flag = Object.assign(new ScoreFlag(), { id: 'first', x: 50, y: 50 });
    const units = membershipFixture();
    globalThis.__painAndGainArenaObjects = new Map([[ScoreFlag, [flag]], [Creep, units]]);
    try {
        globalThis.__painAndGainTick = 1;
        runTick();
        const first = getMembershipState();
        assert.equal(first.initialized, true);
        assert.deepEqual(first.squads.map(group => group.memberIds.length), [4, 4, 4]);
        assert.equal(first.members.length, 14);
        assert.equal(observedMember('scout_1').squadId, null);
        const firstBaseline = evidence.find(record => record.type === 'membership-baseline' && record.tick === 1);
        assert.equal(firstBaseline.initialized, true);
        assert.equal(firstBaseline.members.length, 14);

        const absent = units.find(unit => unit.id.endsWith('melee_2'));
        globalThis.__painAndGainArenaObjects.set(Creep, units.filter(unit => unit !== absent));
        globalThis.__painAndGainTick = 2;
        runTick();
        assert.equal(observedMember('melee_2').presence, 'missing');
        assert.equal(observedMember('melee_2').squadId, 'A');
        assert.deepEqual(evidence.find(record => record.type === 'membership-change' && record.tick === 2)
            .changes.map(change => change.kind), ['presence', 'capability', 'participation']);

        for (const part of absent.body) if (part.type === 'attack') part.hits = 0;
        absent.hits = 800;
        globalThis.__painAndGainArenaObjects.set(Creep, units);
        globalThis.__painAndGainTick = 3;
        runTick();
        assert.equal(observedMember('melee_2').presence, 'present');
        assert.equal(observedMember('melee_2').capable, false);
        assert.equal(observedMember('melee_2').squadId, 'A');
        assert.deepEqual(evidence.find(record => record.type === 'membership-change' && record.tick === 3)
            .changes.map(change => change.kind), ['presence', 'capability']);

        for (const part of absent.body) if (part.type === 'attack') part.hits = 100;
        absent.hits = absent.hitsMax;
        globalThis.__painAndGainTick = 4;
        runTick();
        assert.equal(observedMember('melee_2').capable, true);
        assert.equal(observedMember('melee_2').participating, true);
        assert.deepEqual(getMembershipState().squads, first.squads);
        assert.deepEqual(evidence.find(record => record.type === 'membership-change' && record.tick === 4)
            .changes.map(change => change.kind), ['capability', 'participation']);

        globalThis.__painAndGainArenaObjects.set(Creep, membershipFixture('pg_player2_'));
        globalThis.__painAndGainTick = 1;
        runTick();
        assert.equal(getMembershipState().initialized, true);
        assert.ok(getMembershipState().members.every(member => member.id.startsWith('pg_player2_')));
        const lastReset = evidence.filter(record => record.type === 'membership-change' && record.tick === 1).at(-1);
        assert.equal(lastReset.changes[0].kind, 'reset');
        const lastBaseline = evidence.filter(record => record.type === 'membership-baseline' && record.tick === 1).at(-1);
        assert.ok(lastBaseline.members.every(member => member.id.startsWith('pg_player2_')));
    } finally {
        delete globalThis.__painAndGainArenaObjects;
        delete globalThis.__painAndGainTick;
    }
});

test('runTick preserves explicit invalid and late initialization reasons', async t => {
    t.mock.method(console, 'log', () => {});
    const flag = Object.assign(new ScoreFlag(), { id: 'first', x: 50, y: 50 });
    const units = membershipFixture();
    globalThis.__painAndGainArenaObjects = new Map([[ScoreFlag, [flag]], [Creep, units.slice(1)]]);
    try {
        globalThis.__painAndGainTick = 1;
        runTick();
        assert.equal(getMembershipState().reason, 'expected-14-owned-living');
        globalThis.__painAndGainArenaObjects.set(Creep, units);
        globalThis.__painAndGainTick = 2;
        runTick();
        assert.equal(getMembershipState().initialized, false);
        assert.equal(getMembershipState().reason, 'expected-14-owned-living');

        // A fresh loop module at tick > 1 models a late Arena module reload.
        const lateLoop = await import('../../src/loop.js?late-membership-test');
        globalThis.__painAndGainTick = 9;
        lateLoop.runTick();
        assert.equal(lateLoop.getMembershipState().initialized, false);
        assert.equal(lateLoop.getMembershipState().reason, 'initial-tick-missed');
    } finally {
        delete globalThis.__painAndGainArenaObjects;
        delete globalThis.__painAndGainTick;
    }
});

test('runTick executes enabled escort behavior across injury and a new match', t => {
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
    assert.deepEqual(calls, [
        ['healer', 'moveTo', 'melee'], ['melee', 'moveTo', 'foe'],
        ['healer', 'moveTo', 'melee'], ['melee', 'moveTo', 'foe'],
        ['healer', 'moveTo', 'melee'], ['melee', 'moveTo', 'foe'],
    ]);
    assert.equal(calls.filter(([id]) => id === 'healer').length, 3);
    assert.equal(pathCalls, 0);
    assert.deepEqual(entries.filter(({ value }) => value.type === 'game-state').map(({ value }) => value.tick),
        [1000, 1001, 1]);
    const diagnostics = entries.filter(({ value }) => value.type === 'healer-escort');
    assert.deepEqual(diagnostics.map(({ value }) => [value.tick, value.event]), [
        [1000, 'assign'], [1000, 'move-attempt'], [1001, 'release'],
        [1, 'assign'], [1, 'move-attempt'],
    ]);
    assert.ok(diagnostics.every(({ value }) => value.buildId === buildId));
    assert.deepEqual(diagnostics.filter(({ value }) => value.event === 'move-attempt')
        .map(({ value }) => [value.targetId, value.returnCode, value.range]),
    [['melee', -11, 4], ['melee', -11, 4]]);
    assert.equal(diagnostics.find(({ value }) => value.event === 'release').value.reason,
        'friendly-injured');
    assert.deepEqual(diagnostics.filter(({ value }) => value.phase === 'before-actions')
        .map(({ calls: count }) => count), [0, 2, 4]);
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

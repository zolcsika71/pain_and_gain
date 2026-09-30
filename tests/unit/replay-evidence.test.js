import assert from 'node:assert/strict';
import test from 'node:test';
import { createMembershipEvidenceLogger, createReplayEvidenceLogger } from '../../src/debug/replay-evidence.js';
import { resetMembership, updateMembership } from '../../src/squads/membership.js';
import { executeTactics, moveCreeps } from '../../src/arena/execute.js';

const testBuildId = 'a'.repeat(64);

function creep(id, x, y, action, count, overrides = {}) {
    const body = [...Array(count).fill(action ?? 'move'),
        ...Array(action ? count : 0).fill('move')].map(type => ({ type, hits: 100 }));
    return {
        id, x, y, my: true, exists: true, fatigue: 0,
        hits: body.length * 100, hitsMax: body.length * 100, body, ...overrides,
    };
}

function roster() {
    return [
        creep('healer_1', 9, 11, 'heal', 6), creep('melee_2', 10, 11, 'attack', 8),
        creep('melee_3', 10, 12, 'attack', 8), creep('melee_4', 9, 12, 'attack', 8),
        creep('healer_2', 14, 6, 'heal', 6), creep('melee_1', 15, 7, 'attack', 8),
        creep('ranged_1', 15, 6, 'ranged_attack', 6), creep('ranged_2', 14, 7, 'ranged_attack', 6),
        creep('healer_3', 14, 11, 'heal', 6), creep('ranged_3', 15, 11, 'ranged_attack', 6),
        creep('ranged_4', 14, 12, 'ranged_attack', 6), creep('ranged_5', 15, 12, 'ranged_attack', 6),
        creep('scout_1', 12, 9, null, 1), creep('scout_2', 9, 6, null, 1),
    ];
}

function logger(records) {
    return createMembershipEvidenceLogger({ runtimeBuildId: testBuildId,
        emit: record => records.push(record) });
}

test('emits deterministic initialized and failed baselines with membership-only closure', () => {
    const units = roster();
    const records = [];
    const evidence = logger(records);
    const state = updateMembership(resetMembership(), { tick: 1, myCreeps: [...units].reverse() });
    const before = structuredClone(state);
    evidence.beginTick(1);
    evidence.recordMembership(state);
    evidence.closeTick();
    assert.deepEqual(state, before);
    assert.equal(records[0].type, 'membership-baseline');
    assert.equal(records[0].initialized, true);
    assert.deepEqual(records[0].members.map(member => member.id),
        [...records[0].members.map(member => member.id)].sort());
    assert.deepEqual(records[0].squads.map(squad => squad.memberIds), [
        ['healer_1', 'melee_2', 'melee_3', 'melee_4'],
        ['healer_2', 'melee_1', 'ranged_1', 'ranged_2'],
        ['healer_3', 'ranged_3', 'ranged_4', 'ranged_5'],
    ]);
    assert.deepEqual(records[1], {
        type: 'evidence-coverage', formatVersion: 1, buildId: testBuildId,
        tick: 1, phase: 'after-actions', sequence: 1, recordId: '1:1',
        firstSequence: 0, lastSequence: 0, recordCount: 1,
        coveredTypes: ['membership-baseline', 'membership-change'],
        counts: { 'membership-baseline': 1, 'membership-change': 0,
            'action-decision': 0, 'action-attempt': 0, 'movement-decisions': 0,
            'healing-decisions': 0, 'combat-decisions': 0 },
        closed: true,
    });

    const failed = [];
    const failedEvidence = logger(failed);
    failedEvidence.beginTick(1);
    failedEvidence.recordMembership(updateMembership(resetMembership(),
        { tick: 1, myCreeps: units.slice(1) }));
    failedEvidence.closeTick();
    assert.equal(failed[0].initialized, false);
    assert.equal(failed[0].initializationReason, 'expected-14-owned-living');
    assert.deepEqual(failed[0].members, []);
});

test('emits changes only for missing, return, capability, fatigue, death, and late IDs', () => {
    const units = roster();
    const records = [];
    const evidence = logger(records);
    let state = updateMembership(resetMembership(), { tick: 1, myCreeps: units });
    evidence.beginTick(1); evidence.recordMembership(state); evidence.closeTick();

    evidence.beginTick(2); state = updateMembership(state, { tick: 2, myCreeps: units });
    evidence.recordMembership(state); evidence.closeTick();
    assert.equal(records.at(-1).sequence, 0);
    assert.equal(records.at(-1).recordCount, 0);

    const melee = units.find(unit => unit.id === 'melee_2');
    evidence.beginTick(3); state = updateMembership(state,
        { tick: 3, myCreeps: units.filter(unit => unit !== melee) });
    evidence.recordMembership(state); evidence.closeTick();
    assert.deepEqual(records.at(-2).changes.map(change => change.kind),
        ['presence', 'capability', 'participation']);

    for (const part of melee.body) if (part.type === 'attack') part.hits = 0;
    melee.fatigue = 4;
    evidence.beginTick(4); state = updateMembership(state, { tick: 4, myCreeps: units });
    evidence.recordMembership(state); evidence.closeTick();
    assert.deepEqual(records.at(-2).changes.map(change => change.kind), ['presence', 'capability']);
    assert.equal(records.at(-2).changes[1].capable, false);
    assert.equal(records.at(-2).changes[1].canMoveNow, false);

    for (const part of melee.body) if (part.type === 'attack') part.hits = 100;
    evidence.beginTick(5); state = updateMembership(state, { tick: 5, myCreeps: units });
    evidence.recordMembership(state); evidence.closeTick();
    assert.deepEqual(records.at(-2).changes.map(change => change.kind), ['capability', 'participation']);
    assert.equal(records.at(-2).changes[0].capable, true);
    assert.equal(records.at(-2).changes[0].canMoveNow, false);

    melee.fatigue = 0;
    evidence.beginTick(6); state = updateMembership(state, { tick: 6, myCreeps: units });
    evidence.recordMembership(state); evidence.closeTick();
    assert.deepEqual(records.at(-2).changes, [{ kind: 'capability', memberId: 'melee_2',
        functioning: { attack: 8, move: 8 }, capable: true, canMoveNow: true }]);

    melee.hits = 0;
    evidence.beginTick(7); state = updateMembership(state, { tick: 7, myCreeps: units });
    evidence.recordMembership(state); evidence.closeTick();
    assert.equal(records.at(-2).changes[0].kind, 'presence');
    assert.equal(records.at(-2).changes[0].to, 'dead');

    const late = creep('late_scout', 1, 1, null, 1);
    evidence.beginTick(8); state = updateMembership(state, { tick: 8, myCreeps: [...units, late] });
    evidence.recordMembership(state); evidence.closeTick();
    const added = records.at(-2).changes.find(change => change.kind === 'member-added');
    assert.equal(added.member.id, 'late_scout');
    assert.equal(added.member.late, true);
    assert.equal(added.member.squadId, null);
});

test('reset starts a new epoch and baseline without changing deterministic assignment', () => {
    const units = roster();
    const records = [];
    const evidence = logger(records);
    let state = updateMembership(resetMembership(), { tick: 1, myCreeps: units });
    evidence.beginTick(1); evidence.recordMembership(state); evidence.closeTick();
    state = updateMembership(state, { tick: 1, myCreeps: [...units].reverse() });
    evidence.beginTick(1, { previousTick: 1, reason: 'tick-not-increasing' });
    evidence.recordMembership(state); evidence.closeTick();
    const reset = records.find(record => record.type === 'membership-change' && record.epoch === 2);
    const baseline = records.find(record => record.type === 'membership-baseline' && record.epoch === 2);
    assert.equal(reset.sequence, 0);
    assert.deepEqual(reset.changes, [{ kind: 'reset', previousTick: 1, currentTick: 1,
        fromEpoch: 1, toEpoch: 2, reason: 'tick-not-increasing' }]);
    assert.equal(baseline.sequence, 1);
    assert.deepEqual(baseline.squads.map(squad => squad.memberIds), records[0].squads.map(squad => squad.memberIds));
});

test('represents an explicit assignment transition without mutating supplied state', () => {
    const records = [];
    const evidence = logger(records);
    const initialized = updateMembership(resetMembership(), { tick: 1, myCreeps: roster() });
    evidence.beginTick(1); evidence.recordMembership(initialized); evidence.closeTick();
    const memberId = initialized.squads[0].memberIds[3];
    const changed = structuredClone(initialized);
    changed.lastTick = 2;
    changed.reason = 'invalid-observation';
    changed.squads[0].memberIds.pop();
    const member = changed.members.find(item => item.id === memberId);
    member.squadId = null;
    member.participating = false;
    const before = structuredClone(changed);
    evidence.beginTick(2); evidence.recordMembership(changed); evidence.closeTick();
    assert.deepEqual(changed, before);
    assert.deepEqual(records.at(-2).changes, [
        { kind: 'initialization', initialized: true, initializationReason: 'invalid-observation' },
        { kind: 'assignment', memberId, squadId: null, slotIndex: null },
        { kind: 'participation', memberId, participating: false },
    ]);
});

test('emits correlated decisions, holds, no-actions, and actual return values in production order', () => {
    const records = [];
    const evidence = createReplayEvidenceLogger({ runtimeBuildId: testBuildId,
        emit: record => records.push(record) });
    evidence.beginTick(9);
    const movementAction = { method: 'moveTo', target: { id: 'enemy', x: 4, y: 5 },
        targetKind: 'creep' };
    const movement = evidence.recordActionDecision({ phase: 'movement', channel: 'movement',
        actorId: 'melee', outcome: 'selected', reason: 'combat-approach', actions: [movementAction] });
    evidence.recordActionAttempt(movement, 0, movementAction, -11);
    evidence.recordActionDecision({ phase: 'tactics', channel: 'healing', actorId: 'melee',
        outcome: 'no-action', reason: 'no-functioning-heal', actions: [] });
    evidence.recordActionDecision({ phase: 'tactics', channel: 'combat', actorId: 'melee',
        outcome: 'hold', reason: 'combat-in-range', actions: [] });
    evidence.closeTick();

    assert.deepEqual(records.map(record => [record.type, record.phase, record.sequence]), [
        ['action-decision', 'movement', 0], ['action-attempt', 'movement', 1],
        ['action-decision', 'tactics', 2], ['action-decision', 'tactics', 3],
        ['evidence-coverage', 'after-actions', 4],
    ]);
    assert.deepEqual(records[0].actions, [{ actionId: '9:0#0', method: 'moveTo',
        target: { kind: 'creep', id: 'enemy', x: 4, y: 5 } }]);
    assert.equal(records[1].decisionId, '9:0');
    assert.equal(records[1].actionId, '9:0#0');
    assert.equal(records[1].returnCode, -11);
    assert.deepEqual(records.at(-1).coveredTypes,
        ['membership-baseline', 'membership-change', 'action-decision', 'action-attempt']);
    assert.deepEqual(records.at(-1).counts, {
        'membership-baseline': 0, 'membership-change': 0,
        'action-decision': 3, 'action-attempt': 1,
        'movement-decisions': 1, 'healing-decisions': 1, 'combat-decisions': 1,
    });
});

function actionFixture(instrumented, records = []) {
    const calls = [];
    const unit = (id, x, parts, options = {}) => ({
        id, x, y: options.y ?? 0, my: options.my ?? true,
        hits: options.hits ?? 100, hitsMax: 100, fatigue: 0,
        body: parts.map(type => ({ type, hits: 100 })),
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo(target) { calls.push([id, 'moveTo', target.id]); return options.moveCode; },
        heal(target) { calls.push([id, 'heal', target.id]); return options.healCode ?? 0; },
        rangedHeal(target) { calls.push([id, 'rangedHeal', target.id]); return options.healCode ?? 0; },
        attack(target) { calls.push([id, 'attack', target.id]); return options.attackCode ?? 0; },
        rangedAttack(target) { calls.push([id, 'rangedAttack', target.id]); return options.attackCode ?? 0; },
    });
    const mixed = unit('mixed', 0, ['move', 'heal', 'attack', 'ranged_attack'],
        { hits: 50, attackCode: -9 });
    const healer = unit('healer', 0, ['move', 'heal']);
    const meleeHealer = unit('melee-healer', 0, ['move', 'heal', 'attack']);
    const scout = unit('scout', 2, ['move'], { moveCode: -11 });
    const walker = unit('walker', 3, ['move']);
    const enemy = unit('enemy', 1, ['move', 'attack'], { my: false });
    const flag = { id: 'flag', x: 9, y: 9 };
    const reporter = instrumented ? (() => {
        const evidence = createReplayEvidenceLogger({ runtimeBuildId: testBuildId,
            emit: record => records.push(record) });
        evidence.beginTick(12);
        return { decision: evidence.recordActionDecision, attempt: evidence.recordActionAttempt,
            close: evidence.closeTick };
    })() : null;
    const before = [mixed, healer, meleeHealer, scout, walker, enemy].map(creep => ({ id: creep.id, x: creep.x, y: creep.y,
        hits: creep.hits, body: creep.body.map(part => ({ ...part })) }));
    moveCreeps([mixed, healer, meleeHealer, scout, walker], [enemy], flag,
        new Map(), new Map(), null, null, reporter);
    executeTactics([mixed, healer, meleeHealer, scout, walker], [enemy], [mixed], reporter);
    reporter?.close();
    const after = [mixed, healer, meleeHealer, scout, walker, enemy].map(creep => ({ id: creep.id, x: creep.x, y: creep.y,
        hits: creep.hits, body: creep.body.map(part => ({ ...part })) }));
    return { calls, before, after };
}

test('action diagnostics preserve mixed/healing-conflict/hold command traces and inputs', () => {
    const baseline = actionFixture(false);
    const records = [];
    const instrumented = actionFixture(true, records);
    assert.deepEqual(instrumented.calls, baseline.calls);
    assert.deepEqual(instrumented.after, instrumented.before);
    assert.deepEqual(baseline.after, baseline.before);
    assert.deepEqual(instrumented.calls, [
        ['scout', 'moveTo', 'flag'],
        ['walker', 'moveTo', 'flag'],
        ['mixed', 'heal', 'mixed'], ['mixed', 'rangedAttack', 'enemy'],
        ['healer', 'heal', 'mixed'],
        ['melee-healer', 'heal', 'mixed'],
    ]);
    assert.ok(records.some(record => record.type === 'action-decision' &&
        record.channel === 'movement' && record.outcome === 'hold'));
    assert.ok(records.some(record => record.type === 'action-decision' &&
        record.channel === 'combat' && record.reason === 'healing-compatibility'));
    assert.ok(records.some(record => record.type === 'action-attempt' && record.returnCode === -11));
    assert.ok(records.some(record => record.type === 'action-attempt' && record.returnCode === -9));
    assert.ok(records.some(record => record.type === 'action-attempt' && record.returnCode === null));
});

test('measures diagnostic volume for 14-scout tick-1 and steady no-combat fixtures', () => {
    const records = [];
    const evidence = createReplayEvidenceLogger({ runtimeBuildId: testBuildId,
        emit: record => records.push(record) });
    const reporter = { decision: evidence.recordActionDecision, attempt: evidence.recordActionAttempt };
    const flag = { id: 'flag', x: 50, y: 50 };
    const scouts = Array.from({ length: 14 }, (_, index) => ({
        id: `scout_${String(index + 1).padStart(2, '0')}`, x: index, y: 0, my: true,
        hits: 100, hitsMax: 100, fatigue: 0, body: [{ type: 'move', hits: 100 }],
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo() { return 0; }, heal() {}, rangedHeal() {}, attack() {}, rangedAttack() {},
    }));
    let membership = updateMembership(resetMembership(), { tick: 1, myCreeps: scouts });
    evidence.beginTick(1);
    evidence.recordMembership(membership);
    moveCreeps(scouts, [], flag, new Map(), new Map(), null, null, reporter);
    executeTactics(scouts, [], [], reporter);
    evidence.closeTick();
    const firstTick = [...records];

    records.length = 0;
    membership = updateMembership(membership, { tick: 12, myCreeps: scouts });
    evidence.beginTick(12);
    evidence.recordMembership(membership);
    moveCreeps(scouts, [], flag, new Map(), new Map(), null, null, reporter);
    executeTactics(scouts, [], [], reporter);
    evidence.closeTick();

    const size = entries => entries.reduce((total, record) =>
        total + Buffer.byteLength(`${JSON.stringify(record)}\n`), 0);
    assert.equal(firstTick.length, 58);
    assert.equal(firstTick.at(-1).recordCount, 57);
    assert.equal(size(firstTick), 22_813);
    assert.equal(Math.max(...firstTick.map(record => Buffer.byteLength(JSON.stringify(record)))), 3_167);
    assert.equal(records.length, 57);
    assert.equal(records.at(-1).recordCount, 56);
    assert.equal(size(records), 19_841);
});

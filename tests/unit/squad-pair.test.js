import test from 'node:test';
import assert from 'node:assert/strict';
import { planSquadPair, pairLimits } from '../../src/squads/pair.js';
import { updateMembership } from '../../src/squads/membership.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { createReplayEvidenceLogger } from '../../src/debug/replay-evidence.js';
import { validActionDecision, validActionAttempt } from '../../tools/replay-logs.js';
import { squadPairExperiment } from '../../src/config.js';

function unit(id, x, y, parts, my = true) {
    return { id, x, y, my, hits: 100, hitsMax: 100, fatigue: 0,
        body: parts.map(type => ({ type, hits: 100 })),
        getRangeTo(other) { return Math.max(Math.abs(this.x - other.x), Math.abs(this.y - other.y)); },
    };
}

function fixture() {
    const leader = unit('a', 10, 10, ['move', 'attack']);
    const follower = unit('h', 9, 10, ['move', 'heal']);
    const spare = unit('b', 11, 11, ['move', 'attack']);
    const myCreeps = [follower, spare, leader, ...Array.from({ length: 11 }, (_, i) =>
        unit(`s${i}`, 30 + i, 30, ['move']))];
    const membership = updateMembership(null, { tick: 1, myCreeps });
    const flag = { id: 'flag', x: 20, y: 10 };
    const nextStep = (from, to) => ({ x: from.x + Math.sign(to.x - from.x),
        y: from.y + Math.sign(to.y - from.y) });
    const input = { tick: 1, myCreeps, enemies: [] };
    const plan = (previous = null, options = {}) => planSquadPair(input, membership, flag, previous,
        { nextStep, ...options });
    return { leader, follower, spare, myCreeps, membership, flag, input, plan };
}

test('deployment switch is off; deterministic same-squad selection uses functioning capabilities', () => {
    assert.equal(squadPairExperiment, false);
    const f = fixture();
    const first = f.plan();
    assert.deepEqual(first.state.pair, { squadId: 'A', leaderId: 'a', followerId: 'h', leaderRole: 'melee' });
    f.input.myCreeps.reverse();
    f.membership.members.reverse();
    assert.deepEqual(f.plan(), first);
    f.leader.body.find(part => part.type === 'attack').hits = 0;
    assert.equal(f.plan().state.pair.leaderId, 'b');
    f.spare.body.find(part => part.type === 'attack').hits = 0;
    assert.equal(f.plan().state.reason, 'no-eligible-squad-pair');
    f.spare.body.push({ type: 'ranged_attack', hits: 100 });
    f.membership.members.find(member => member.id === 'b').role = 'ranged';
    assert.equal(f.plan().state.pair.leaderRole, 'ranged');
});

test('missing membership stays explicitly inactive and creates no movement plan', () => {
    const f = fixture();
    f.membership.initialized = false;
    f.membership.reason = 'initial-tick-missed';
    assert.equal(f.plan().state.reason, 'initial-tick-missed');
    assert.equal(f.plan().moves.size, 0);
});

test('pair stays stable as other members become closer; separation waits and approaches an empty step', () => {
    const f = fixture();
    let plan = f.plan();
    f.input.tick++;
    f.follower.x = 7;
    f.spare.x = 7; f.spare.y = 11;
    plan = f.plan(plan.state);
    assert.equal(plan.context.leaderId, 'a');
    assert.deepEqual(plan.moves.get('a'), { target: null, reason: 'pair-leader-wait' });
    assert.deepEqual(plan.moves.get('h').target, { x: 8, y: 10 });
    f.input.tick++;
    f.follower.x = 8;
    plan = f.plan(plan.state);
    assert.equal(plan.context.stalledTicks, 0);
    f.input.tick++;
    f.follower.x = 9;
    plan = f.plan(plan.state);
    assert.equal(plan.state.reason, 'pair-advance');
});

test('fatigue of either member pauses both; unavailable or occupied paths never target the leader tile', () => {
    for (const member of ['leader', 'follower']) {
        const f = fixture(); f[member].fatigue = 1;
        const plan = f.plan(null, { nextStep: () => { throw Error('must not search'); } });
        assert.equal(plan.state.reason, 'pair-fatigue-wait');
        assert.ok([...plan.moves.values()].every(move => move.target === null));
    }
    const f = fixture();
    for (const step of [null, { x: 9, y: 10 }, { x: 11, y: 11 }, { x: 15, y: 10 }, { x: -1, y: 10 }]) {
        const plan = f.plan(null, { nextStep: () => step });
        assert.equal(plan.state.reason, 'pair-blocked');
        assert.ok([...plan.moves.values()].every(move => move.target === null));
    }
    f.follower.x = 8;
    assert.equal(f.plan(null, { nextStep: () => f.leader }).state.reason, 'pair-blocked');
});

test('three failed progress observations release permanently, including OK without displacement', () => {
    for (const block of ['stationary', 'fatigue', 'path', 'separation']) {
        const f = fixture();
        if (block === 'fatigue') f.follower.fatigue = 2;
        if (block === 'separation') f.follower.x = 7;
        const options = block === 'path' ? { nextStep: () => null } : {};
        let plan = f.plan(null, options);
        for (let tick = 2; tick <= 4; tick++) {
            f.input.tick = tick; plan = f.plan(plan.state, options);
        }
        assert.equal(plan.state.reason, 'recovery-limit');
        assert.equal(plan.moves.size, 0);
        f.follower.fatigue = 0; f.follower.x = 9;
        f.input.tick = 5;
        assert.equal(f.plan(plan.state).state.status, 'released');
    }
});

test('death, absence, lost MOVE or action, injury, and excessive separation release without new partners', () => {
    for (const [change, reason] of [
        [f => { f.leader.hits = 0; }, 'partner-lost'],
        [f => { f.follower.exists = false; }, 'partner-lost'],
        [f => { f.input.myCreeps = f.myCreeps.filter(c => c !== f.leader); }, 'partner-lost'],
        [f => { f.leader.body[0].hits = 0; }, 'partner-capability-lost'],
        [f => { f.follower.body[1].hits = 0; }, 'partner-capability-lost'],
        [f => { f.follower.hits = 90; }, 'partner-injured'],
        [f => { f.follower.x = 4; }, 'separation-limit'],
    ]) {
        const f = fixture(); const first = f.plan();
        change(f); f.input.tick++;
        const plan = f.plan(first.state);
        assert.equal(plan.state.reason, reason);
        assert.equal(plan.moves.size, 0);
        f.input.tick++;
        assert.equal(f.plan(plan.state).state.pair.leaderId, 'a');
    }
});

test('escort on either partner, explicit null override, combat and injured support take priority', () => {
    for (const id of ['a', 'h']) {
        const f = fixture();
        assert.equal(f.plan(null, { escort: { healerId: 'other', allyId: id } }).state.reason, 'escort-priority');
        assert.equal(f.plan(null, { fallbackById: new Map([[id, null]]) }).state.reason, 'objective-override');
    }
    const f = fixture();
    f.input.enemies = [unit('enemy', 14, 10, ['attack', 'move'], false)];
    assert.equal(f.plan().state.reason, 'movement-priority');
    f.input.enemies = [unit('enemy', 5, 10, ['attack', 'move'], false)];
    f.leader.x = 11;
    assert.equal(f.plan().state.reason, 'unsafe-to-wait');
    f.input.enemies = [];
    f.spare.hits = 50;
    assert.equal(f.plan().state.reason, 'movement-priority');
});

test('objective arrival and lifetime release; tick restart clears used state', () => {
    const f = fixture();
    const initial = f.plan();
    f.input.tick = 1 + pairLimits.lifetimeTicks;
    const expired = f.plan(initial.state);
    assert.equal(expired.state.reason, 'lifetime-limit');
    f.input.tick = 1;
    assert.equal(f.plan(expired.state).state.status, 'active');
    f.flag.x = f.leader.x;
    assert.equal(f.plan().state.reason, 'objective-reached');
});

test('leader executes first; follower enters its old tile only after an accepted joint move', t => {
    for (const code of [0, -11, undefined]) {
        const f = fixture(); const plan = f.plan(); const calls = [], records = [];
        for (const creep of f.myCreeps) creep.moveTo = (target, options) => {
            calls.push({ id: creep.id, target, options }); return creep === f.leader ? code : 0;
        };
        const logger = createReplayEvidenceLogger({ emit: record => records.push(record), cpuCoverage: false });
        logger.beginTick(1);
        moveCreeps(f.myCreeps, [], f.flag, new Map(), new Map(), null, null,
            { decision: logger.recordActionDecision, attempt: logger.recordActionAttempt }, false, plan);
        logger.closeTick();
        assert.equal(calls[0].id, 'a');
        assert.equal(calls.filter(call => call.id === 'h').length, code === 0 ? 1 : 0);
        if (code === 0) {
            assert.deepEqual(calls.find(call => call.id === 'h').target, { x: 10, y: 10 });
            assert.deepEqual(calls.find(call => call.id === 'h').options, { ignore: [f.leader] });
        }
        assert.equal(new Set(calls.map(call => call.id)).size, calls.length);
        assert.ok(records.filter(r => r.type === 'action-decision').every(validActionDecision));
        assert.ok(records.filter(r => r.type === 'action-attempt').every(validActionAttempt));
        assert.equal(records.at(-1).counts['movement-decisions'], 14);
        assert.equal(records.at(-1).recordCount, records.length - 1);
        assert.equal(records.filter(r => r.pair).length, 2);
        if (code === 0) {
            const bytes = records.filter(r => r.pair).reduce((sum, record) => {
                const { pair, ...withoutPair } = record;
                return sum + Buffer.byteLength(JSON.stringify(record)) - Buffer.byteLength(JSON.stringify(withoutPair));
            }, 0);
            assert.ok(bytes > 0 && bytes < 700);
            t.diagnostic(`Pair metadata: ${bytes} additional JSON bytes across two existing decisions; zero new records.`);
        }
    }
});

test('an unrelated escort does not disable the selected pair or get a second movement command', () => {
    const f = fixture();
    const other = f.myCreeps.find(creep => creep.id === 's0');
    const escort = { healerId: other.id, allyId: 's1', ally: f.myCreeps.find(c => c.id === 's1'),
        mode: 'move-attempt', distance: 4 };
    const plan = f.plan(null, { escort });
    assert.equal(plan.state.status, 'active');
    const calls = [];
    for (const creep of f.myCreeps) creep.moveTo = target => { calls.push([creep.id, target]); return 0; };
    moveCreeps(f.myCreeps, [], f.flag, new Map(), new Map(), escort, null, null, false, plan);
    assert.deepEqual(calls.filter(([id]) => id === other.id), [[other.id, escort.ally]]);
    assert.equal(new Set(calls.map(([id]) => id)).size, calls.length);
});

test('movement waits leave healing and combat execution independent; disabled movement remains unchanged', () => {
    const f = fixture(); const calls = [];
    for (const creep of f.myCreeps) for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
        creep[method] = target => { calls.push([creep.id, method, target.id]); return 0; };
    }
    f.follower.fatigue = 1;
    const plan = f.plan();
    moveCreeps(f.myCreeps, [], f.flag, new Map(), new Map(), null, null, null, false, plan);
    assert.ok(!calls.some(([id]) => id === 'a' || id === 'h'));
    // Exercise the independent tactical executor with actionable targets.
    const foe = unit('foe', 11, 10, ['attack'], false);
    f.spare.hits = 50;
    executeTactics(f.myCreeps, [foe], [f.spare]);
    assert.ok(calls.some(([id, method]) => id === 'a' && method === 'attack'));
    assert.ok(calls.some(([id, method]) => id === 'h' && method === 'rangedHeal'));
    calls.length = 0;
    f.spare.hits = 100;
    moveCreeps(f.myCreeps, [], f.flag);
    assert.equal(calls.length, 14);
    assert.ok(calls.some(([id, method, target]) => id === 'a' && method === 'moveTo' && target === 'flag'));
});

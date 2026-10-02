import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHoldRelease } from '../../tools/scout-hold-screen.js';

const buildId = 'a'.repeat(64);
const actor = { id: 'scout', my: true, x: 47, y: 50, hits: 100, hitsMax: 100, fatigue: 0 };
const flag = { id: 'first', x: 49, y: 49, owner: 'me' };
const enemy = { id: 'enemy', my: false, x: 54, y: 49, hits: 100 };
const state = (tick, creeps, sourceBuildId = buildId) => ({ tick, fingerprint: `source-${tick}`,
    state: { tick, buildId: sourceBuildId, selectedFlagId: 'first', creeps, flags: [flag] } });
const entry = (tick, type, data) => ({ fingerprint: `source-${tick}`,
    entry: { tick, buildId, type, actorId: 'scout', channel: 'movement', ...data } });
const hold = tick => entry(tick, 'action-decision',
    { outcome: 'hold', reason: 'scout-owned-flag-hold', actions: [] });
const release = (tick = 2) => entry(tick, 'action-decision', { outcome: 'selected', reason: 'flag-fallback',
    actions: [{ method: 'moveTo', target: { id: 'first' } }] });
const attempt = (returnCode, tick = 2) => entry(tick, 'action-attempt',
    { method: 'moveTo', target: { id: 'first' }, returnCode });

test('enemy entering flag guard gives a sourced hold-to-command screening pass', () => {
    const result = summarizeHoldRelease(
        [state(1, [actor]), state(2, [actor, enemy]), state(3, [{ ...actor, x: 48 }, enemy])],
        [hold(1), release(), attempt(0)], ['scout'], new Set([1, 2]));
    assert.equal(result.enemyRelease, 'pass');
    assert.equal(result.holds, 1);
    assert.equal(result.offFlagHolds, 1);
    assert.deepEqual(result.enemyReleaseCandidates, { pass: 1, fail: 0, unknown: 0 });
    assert.deepEqual(result.transitions[0].threats, ['enemy']);
    assert.deepEqual(result.transitions[0].observedAfter, { x: 48, y: 50 });
    assert.deepEqual(result.transitions[0].followingPosition, {
        status: 'observed', expectedTick: 3,
        source: { fingerprint: 'source-3', tick: 3, buildId },
        position: { x: 48, y: 50 },
    });
    assert.equal(result.transitions[0].sources.release.snapshot, 'source-2');
});

test('incomplete enemy-entry candidate is unknown; complete guard violation fails', () => {
    const snapshots = [state(1, [actor]), state(2, [actor, enemy])];
    const missing = summarizeHoldRelease(snapshots, [hold(1)], ['scout'], new Set([1]));
    assert.equal(missing.enemyRelease, 'unknown');
    assert.deepEqual(missing.enemyReleaseCandidates, { pass: 0, fail: 0, unknown: 1 });
    assert.equal(missing.transitions[0].verdict, 'unknown');
    const coveredMissing = summarizeHoldRelease(snapshots, [hold(1)], ['scout'], new Set([1, 2]));
    assert.equal(coveredMissing.enemyRelease, 'fail');
    assert.equal(coveredMissing.transitions[0].verdict, 'fail');
    const incompleteHold = summarizeHoldRelease(snapshots, [hold(1), hold(2)],
        ['scout'], new Set([1]));
    assert.equal(incompleteHold.enemyRelease, 'unknown');
    assert.deepEqual(incompleteHold.enemyReleaseCandidates, { pass: 0, fail: 0, unknown: 1 });
    const violation = summarizeHoldRelease(snapshots, [hold(1), hold(2)], ['scout'], new Set([1, 2]));
    assert.equal(violation.enemyRelease, 'fail');
    assert.deepEqual(violation.guardViolations[0].threats, ['enemy']);
});

test('unknown candidate takes aggregate precedence over a separate command pass', () => {
    const snapshots = [state(1, [actor]), state(2, [actor, enemy]), state(3, [actor]),
        state(4, [actor]), state(5, [actor, enemy])];
    const result = summarizeHoldRelease(snapshots,
        [hold(1), release(), attempt(0), hold(4), release(5), attempt(0, 5)],
        ['scout'], new Set([1, 2, 4]));
    assert.deepEqual(result.enemyReleaseCandidates, { pass: 1, fail: 0, unknown: 1 });
    assert.equal(result.enemyRelease, 'unknown');
    const failed = summarizeHoldRelease(snapshots,
        [hold(1), release(), attempt(-7), hold(4), release(5), attempt(0, 5)],
        ['scout'], new Set([1, 2, 4]));
    assert.deepEqual(failed.enemyReleaseCandidates, { pass: 0, fail: 1, unknown: 1 });
    assert.equal(failed.enemyRelease, 'fail');
});

test('absent or definitively ineligible enemy-entry scenario is unexercised', () => {
    const noEnemy = summarizeHoldRelease([state(1, [actor]), state(2, [actor])],
        [hold(1), hold(2)], ['scout'], new Set([1, 2]));
    assert.equal(noEnemy.enemyRelease, 'unexercised');
    assert.deepEqual(noEnemy.enemyReleaseCandidates, { pass: 0, fail: 0, unknown: 0 });

    const injured = summarizeHoldRelease([state(1, [actor]),
        state(2, [{ ...actor, hits: 90 }, enemy])], [hold(1), release(), attempt(0)],
        ['scout'], new Set([1, 2]));
    assert.equal(injured.transitions[0].verdict, 'unexercised');
    assert.equal(injured.enemyRelease, 'unexercised');
    assert.deepEqual(injured.enemyReleaseCandidates, { pass: 0, fail: 0, unknown: 0 });
});

test('missing or incompatible following snapshot does not negate a command pass', () => {
    const entries = [hold(1), release(), attempt(0)];
    const first = [state(1, [actor]), state(2, [actor, enemy])];
    const missing = summarizeHoldRelease(first, entries, ['scout'], new Set([1, 2]));
    assert.equal(missing.enemyRelease, 'pass');
    assert.equal(missing.transitions[0].observedAfter, null);
    assert.deepEqual(missing.transitions[0].followingPosition,
        { status: 'missing-snapshot', expectedTick: 3, source: null, position: null });

    const incompatible = summarizeHoldRelease([...first, state(3, [actor], 'b'.repeat(64))],
        entries, ['scout'], new Set([1, 2]));
    assert.equal(incompatible.enemyRelease, 'pass');
    assert.equal(incompatible.transitions[0].observedAfter, null);
    assert.deepEqual(incompatible.transitions[0].followingPosition, {
        status: 'incompatible-build', expectedTick: 3,
        source: { fingerprint: 'source-3', tick: 3, buildId: 'b'.repeat(64) },
        position: null,
    });

    const wrongTick = state(3, [actor]);
    wrongTick.state.tick = 4;
    const nonconsecutive = summarizeHoldRelease([...first, wrongTick],
        entries, ['scout'], new Set([1, 2]));
    assert.equal(nonconsecutive.enemyRelease, 'pass');
    assert.equal(nonconsecutive.transitions[0].observedAfter, null);
    assert.equal(nonconsecutive.transitions[0].followingPosition.status, 'incompatible-tick');
});

test('stationary on-flag following position is a valid observation', () => {
    const onFlag = { ...actor, x: 49, y: 49 };
    const result = summarizeHoldRelease(
        [state(1, [onFlag]), state(2, [onFlag, enemy]), state(3, [onFlag, enemy])],
        [hold(1), release(), attempt(0)], ['scout'], new Set([1, 2]));
    assert.equal(result.enemyRelease, 'pass');
    assert.deepEqual(result.transitions[0].observedAfter, { x: 49, y: 49 });
    assert.equal(result.transitions[0].followingPosition.status, 'observed');
});

test('a rejected move fails the command criterion without claiming displacement', () => {
    const result = summarizeHoldRelease([state(1, [actor]), state(2, [actor, enemy])],
        [hold(1), release(), attempt(-7)], ['scout'], new Set([1, 2]));
    assert.equal(result.enemyRelease, 'fail');
    assert.equal(result.transitions[0].verdict, 'fail');
    assert.equal(result.transitions[0].attempts[0].returnCode, -7);
});

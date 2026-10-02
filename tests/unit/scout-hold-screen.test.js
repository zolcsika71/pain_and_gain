import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHoldRelease } from '../../tools/scout-hold-screen.js';

const buildId = 'a'.repeat(64);
const actor = { id: 'scout', my: true, x: 47, y: 50, hits: 100, hitsMax: 100, fatigue: 0 };
const flag = { id: 'first', x: 49, y: 49, owner: 'me' };
const enemy = { id: 'enemy', my: false, x: 54, y: 49, hits: 100 };
const state = (tick, creeps) => ({ tick, fingerprint: `source-${tick}`,
    state: { tick, buildId, selectedFlagId: 'first', creeps, flags: [flag] } });
const entry = (tick, type, data) => ({ fingerprint: `source-${tick}`,
    entry: { tick, buildId, type, actorId: 'scout', channel: 'movement', ...data } });
const hold = tick => entry(tick, 'action-decision',
    { outcome: 'hold', reason: 'scout-owned-flag-hold', actions: [] });
const release = () => entry(2, 'action-decision', { outcome: 'selected', reason: 'flag-fallback',
    actions: [{ method: 'moveTo', target: { id: 'first' } }] });
const attempt = returnCode => entry(2, 'action-attempt',
    { method: 'moveTo', target: { id: 'first' }, returnCode });

test('enemy entering flag guard gives a sourced hold-to-command screening pass', () => {
    const result = summarizeHoldRelease(
        [state(1, [actor]), state(2, [actor, enemy]), state(3, [{ ...actor, x: 48 }, enemy])],
        [hold(1), release(), attempt(0)], ['scout'], new Set([1, 2]));
    assert.equal(result.enemyRelease, 'pass');
    assert.equal(result.holds, 1);
    assert.equal(result.offFlagHolds, 1);
    assert.deepEqual(result.transitions[0].threats, ['enemy']);
    assert.deepEqual(result.transitions[0].observedAfter, { x: 48, y: 50 });
    assert.equal(result.transitions[0].sources.release.snapshot, 'source-2');
});

test('missing command coverage remains unexercised and a hold inside the guard fails', () => {
    const snapshots = [state(1, [actor]), state(2, [actor, enemy])];
    const missing = summarizeHoldRelease(snapshots, [hold(1)], ['scout'], new Set([1]));
    assert.equal(missing.enemyRelease, 'unexercised');
    assert.equal(missing.transitions[0].verdict, 'unknown');
    const coveredMissing = summarizeHoldRelease(snapshots, [hold(1)], ['scout'], new Set([1, 2]));
    assert.equal(coveredMissing.enemyRelease, 'fail');
    assert.equal(coveredMissing.transitions[0].verdict, 'fail');
    const violation = summarizeHoldRelease(snapshots, [hold(1), hold(2)], ['scout'], new Set([1, 2]));
    assert.equal(violation.enemyRelease, 'fail');
    assert.deepEqual(violation.guardViolations[0].threats, ['enemy']);
});

test('a rejected move fails the command criterion without claiming displacement', () => {
    const result = summarizeHoldRelease([state(1, [actor]), state(2, [actor, enemy])],
        [hold(1), release(), attempt(-7)], ['scout'], new Set([1, 2]));
    assert.equal(result.enemyRelease, 'fail');
    assert.equal(result.transitions[0].verdict, 'fail');
    assert.equal(result.transitions[0].attempts[0].returnCode, -7);
});

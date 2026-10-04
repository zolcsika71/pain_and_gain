import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeReplay } from '../../tools/replay-analysis.js';
import { canonical, mapChecksum, sha256, summarizeDiagnosticCoverage } from '../../tools/replay-logs.js';
import { summarizeHoldRelease } from '../../tools/scout-hold-screen.js';

const buildId = 'a'.repeat(64);
const replayId = 'b'.repeat(24);
const taskId = 'codex/screen-cache-test';

async function cacheFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-hold-cache-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    // Execute unmodified modules in a synthetic project; never redirect production evidence.
    for (const file of ['scout-hold-screen.js', 'replay-analysis.js',
        'replay-logs.js', 'replay-score-analysis.js']) {
        fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
        fs.copyFileSync(new URL(`../../tools/${file}`, import.meta.url), path.join(root, 'tools', file));
    }
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.mkdirSync(path.join(root, 'src/debug'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/config.js'), '// synthetic configuration');
    fs.writeFileSync(path.join(root, 'src/debug/build-id.js'), `export const buildId = '${buildId}';\n`);
    const directory = path.join(root, 'replay_logs');
    fs.mkdirSync(directory);
    const map = { arena: { name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000 },
        terrain: { width: 100, height: 100, rows: Array.from({ length: 100 }, () => Array(100).fill(0)) },
        objects: [{ id: 'flag', type: 'ScoreFlag', x: 5, y: 5, effectType: 'attack', scorePerTick: 3 }] };
    const checksum = mapChecksum(map);
    const mapFile = 'pain_and_gain_map_2026-10-04T00-00-00-000Z.json';
    fs.writeFileSync(path.join(directory, mapFile), canonical({ ...map, checksum }));
    const manifest = { version: 2, maps: [{ id: checksum, checksum, file: mapFile, status: 'validated' }],
        replays: [{ replayId, mapId: checksum, buildId, status: 'active' }], records: [{
            replayId, fingerprint: sha256('synthetic response'), requestedTick: 1,
            sourceEntry: 'synthetic', sourceKey: 'manual-jsonl', importedAt: 'synthetic',
            status: 'claim', buildId, outputPath: null, outputFingerprint: null,
            mapId: checksum, mapChecksum: checksum, mapFile, otherEntries: [],
            coverage: { count: 0, firstTick: null, lastTick: null, duplicates: [], gaps: [] },
            diagnosticCoverage: summarizeDiagnosticCoverage([], []),
            reviews: { [taskId]: { claimedAt: 'synthetic' } },
        }] };
    const save = () => fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    save();
    const { screenReplay } = await import(pathToFileURL(path.join(root, 'tools/scout-hold-screen.js')));
    const screen = (expected = buildId) => screenReplay(replayId, taskId, expected);
    const fresh = () => analyzeReplay({ root, replayId, reportMode: 'compact' });
    assert.equal(fresh().summary.fail, 0);
    assert.equal(fresh().evidenceSummary.trustedLogRecords, 1);
    return { root, directory, manifest, save, screen, fresh };
}

for (const [label, mutate] of [
    ['changed association', m => { m.replays[0].mapId = 'f'.repeat(64); }],
    ['missing association', m => { m.replays = []; }],
    ['duplicate association', m => { m.replays.push({ ...m.replays[0] }); }],
    ['inactive association', m => { m.replays[0].status = 'retired'; }],
    ['association build mismatch', m => { m.replays[0].buildId = 'f'.repeat(64); }],
    ['missing registration', m => { m.maps = []; }],
    ['invalid registration', m => { m.maps[0].status = 'pending'; }],
    ['registration checksum mismatch', m => { m.maps[0].checksum = 'f'.repeat(64); }],
    ['registration path mismatch', m => { m.maps[0].file = 'absent.json'; }],
    ['record linkage mismatch', m => { m.records[0].mapId = 'f'.repeat(64); }],
    ['record coverage mismatch', m => { m.records[0].coverage.count = 1; }],
    ['unsupported manifest', m => { m.version = 1; }],
]) test(`screen cache rejects current invalid evidence: ${label}`, async t => {
    const f = await cacheFixture(t);
    assert.equal(f.screen().cache, 'miss');
    assert.equal(f.screen().cache, 'hit');
    const before = structuredClone(f.manifest);
    mutate(f.manifest);
    f.save();
    assert.ok(f.fresh().summary.fail > 0);
    assert.throws(() => f.screen(), /validation|evidence/);
    Object.assign(f.manifest, before);
    f.save();
    assert.equal(f.screen().cache, 'hit');
});

test('screen cache preserves selected-input reuse and rechecks claims/build/availability', async t => {
    const f = await cacheFixture(t);
    const first = f.screen();
    f.manifest.replays[0].retiredFingerprints = ['unrelated retired response'];
    f.manifest.maps[0].registeredAt = 'changed annotation';
    f.manifest.records[0].reviews.other = { claimedAt: 'another task' };
    f.manifest.replays.push({ replayId: 'c'.repeat(24), mapId: 'unrelated' });
    f.manifest.maps.push({ id: 'unrelated', file: 'must-not-be-read.json' });
    f.manifest.records.push({ replayId: 'c'.repeat(24), outputPath: 'must-not-be-read.json' });
    f.save();
    assert.equal(f.screen().cache, 'hit');
    assert.deepEqual(f.screen().report, first.report);
    assert.deepEqual(f.screen().report.evidence.analyzer, f.fresh().summary);
    assert.throws(() => f.screen('f'.repeat(64)), /build does not match/);
    delete f.manifest.records[0].reviews[taskId];
    f.save();
    assert.throws(() => f.screen(), /Claim/);
    f.manifest.records[0].reviews[taskId] = { claimedAt: 'again' };
    f.save();
    const mapPath = path.join(f.directory, f.manifest.maps[0].file);
    const original = fs.readFileSync(mapPath);
    fs.writeFileSync(mapPath, '{}');
    assert.ok(f.fresh().summary.fail > 0);
    assert.throws(() => f.screen(), /validation/);
    fs.unlinkSync(mapPath);
    assert.ok(f.fresh().summary.fail > 0);
    assert.throws(() => f.screen(), /ENOENT/);
    fs.writeFileSync(mapPath, original);
    assert.equal(f.screen().cache, 'hit');
});

test('legacy screen cache is retained but not trusted', async t => {
    const f = await cacheFixture(t);
    f.screen();
    const cacheDir = path.join(f.directory, 'analysis_cache');
    const current = path.join(cacheDir, fs.readdirSync(cacheDir)[0]);
    const legacy = path.join(cacheDir, `scout-hold-${replayId}.json`);
    const bytes = fs.readFileSync(current);
    fs.renameSync(current, legacy);
    assert.equal(f.screen().cache, 'miss');
    assert.equal(f.screen().cache, 'hit');
    assert.deepEqual(fs.readFileSync(legacy), bytes);
});

test('valid selected provenance changes recompute, retain history, and agree with fresh analysis', async t => {
    const f = await cacheFixture(t);
    f.screen();
    const cacheDir = path.join(f.directory, 'analysis_cache');
    const firstFile = path.join(cacheDir, fs.readdirSync(cacheDir)[0]);
    const firstBytes = fs.readFileSync(firstFile);
    f.manifest.replays[0].buildId = null;
    f.save();
    const changed = f.screen();
    assert.equal(changed.cache, 'miss');
    assert.deepEqual(changed.report.evidence.analyzer, f.fresh().summary);
    assert.equal(f.screen().cache, 'hit');
    assert.equal(fs.readdirSync(cacheDir).length, 2);
    assert.deepEqual(fs.readFileSync(firstFile), firstBytes);
    f.manifest.replays[0].buildId = buildId;
    f.save();
    assert.equal(f.screen().cache, 'hit');
});

test('selected diagnostic wrapper validation cannot hide behind unchanged raw bytes', async t => {
    const f = await cacheFixture(t);
    f.manifest.records[0].otherEntries = [{ key: 'console', type: 'other', raw: 'ordinary console text' }];
    f.save();
    assert.equal(f.screen().cache, 'miss');
    f.manifest.records[0].otherEntries[0].type = 'action-decision';
    f.save();
    assert.ok(f.fresh().summary.fail > 0);
    assert.throws(() => f.screen(), /validation/);
});

test('current manifest and evidence-directory aliases cannot bypass fresh path validation', async t => {
    for (const name of ['manifest.json', 'directory']) {
        const f = await cacheFixture(t);
        f.screen();
        const original = name === 'directory' ? f.directory : path.join(f.directory, name);
        const moved = `${original}-moved`;
        fs.renameSync(original, moved);
        fs.symlinkSync(moved, original);
        assert.ok(f.fresh().summary.fail > 0);
        assert.throws(() => f.screen(), /Unsafe managed evidence/);
    }
});
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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, gzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    cleanupScoreSource, importCacheFile, importScoreCacheFile, migrateReviewStatuses,
    parseScoreCacheEntry, reconcileCleanup, registerLocalFile, scanCache,
    scoreSourceFingerprint, updateReview, updateScoreReview, upgradeMapChecksums,
    validateScoreBody, verifyScoreSource,
} from '../../tools/replay-logs.js';
import { analyzeReplay } from '../../tools/replay-analysis.js';

const replayId = '6abd7222b72ca0c20fa0bce2';
const sha256 = value => createHash('sha256').update(value).digest('hex');

function workspace(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-score-'));
    const cache = path.join(root, 'cache');
    fs.mkdirSync(cache);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return { root, cache };
}

function scoreCacheFrame(body, { id = replayId, time = 100, encoding = 'gzip', version = 5,
    lengthAdjustment = 0, includeLength = true, stream0Factory = null } = {}) {
    const url = time === null ? `https://arena.screeps.com/api/game/${id}`
        : `https://arena.screeps.com/api/game/${id}/replay/${time}`;
    const key = Buffer.from(`1/0/${url}`);
    const header = Buffer.alloc(24);
    Buffer.from('305c72a71b6dfbfc', 'hex').copy(header);
    header.writeUInt32LE(version, 8);
    header.writeUInt32LE(key.length, 12);
    const source = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const payload = encoding === 'gzip' ? gzipSync(source) : source;
    const stream0 = Buffer.from(stream0Factory ? stream0Factory(payload.length) :
        `HTTP/1.1 200\0content-type:application/json\0${includeLength ?
            `content-length:${payload.length + lengthAdjustment}\0` : ''}content-encoding:${encoding}\0`);
    const eof = (data, streamSize, flags) => {
        const result = Buffer.alloc(24);
        result.writeBigUInt64LE(0xf4fa6f45970d41d8n);
        result.writeUInt32LE(flags, 8);
        result.writeUInt32LE(crc32(data) >>> 0, 12);
        result.writeUInt32LE(streamSize, 16);
        return result;
    };
    const keyHash = createHash('sha256').update(key).digest();
    return Buffer.concat([header, key, payload, eof(payload, 0, 1), stream0, keyHash,
        eof(stream0, stream0.length, 3)]);
}

function scoreItems(overrides = {}) {
    const values = {
        'player1-score': { id: 'player1-score', name: 'Score', value: 10 },
        'player1-gain': { id: 'player1-gain', name: 'Gained this tick', value: 2 },
        'player2-score': { id: 'player2-score', name: 'Score', value: 8 },
        'player2-gain': { id: 'player2-gain', name: 'Gained this tick', value: 1 },
        ...overrides,
    };
    return ['player1-score', 'player1-gain', 'player2-score', 'player2-gain']
        .flatMap(id => Array.isArray(values[id]) ? values[id] : values[id] === null ? [] : [values[id]]);
}

function frame(gameTime, overrides = {}) {
    return { gameTime, ui: { version: 1, items: scoreItems() }, ...overrides };
}

function manifest(root) {
    return JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', 'manifest.json'), 'utf8'));
}

function writeManifest(root, value) {
    fs.writeFileSync(path.join(root, 'replay_logs', 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function snapshotReplayFiles(root) {
    const directory = path.join(root, 'replay_logs');
    return Object.fromEntries(fs.readdirSync(directory).sort().map(name => {
        const file = path.join(directory, name);
        const stat = fs.lstatSync(file);
        return [name, stat.isSymbolicLink() ? `symlink:${fs.readlinkSync(file)}` :
            fs.readFileSync(file).toString('hex')];
    }));
}

function mapEntry() {
    return JSON.stringify({
        type: 'map-state', formatVersion: 1, tick: 1, phase: 'before-actions',
        map: {
            arena: { name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000 },
            terrain: { width: 100, height: 100,
                rows: Array.from({ length: 100 }, () => Array(100).fill(0)) },
            objects: [{ type: 'ScoreFlag', id: 'flag', x: 5, y: 5,
                effectType: 'test', scorePerTick: 1 }],
        },
    });
}

function gameEntry(tick) {
    return JSON.stringify({
        type: 'game-state', tick, phase: 'before-actions', selectedFlagId: 'flag',
        creeps: [], flags: [{ id: 'flag', x: 5, y: 5, owner: 'neutral',
            effectType: 'test', scorePerTick: 1 }],
    });
}

function logCacheFrame(values, tick = 1) {
    const key = Buffer.from(`1/0/https://arena.screeps.com/api/game/${replayId}/log/${tick}`);
    const header = Buffer.alloc(24);
    Buffer.from('305c72a71b6dfbfc', 'hex').copy(header);
    header.writeUInt32LE(5, 8);
    header.writeUInt32LE(key.length, 12);
    const payload = gzipSync(Buffer.from(JSON.stringify(values)));
    const metadata = Buffer.from(`\0content-type:application/octet-stream\0content-length:${payload.length}\0content-encoding:gzip\0`);
    return Buffer.concat([header, key, payload, metadata]);
}

async function importFrames(root, cache, body = JSON.stringify([frame(1)]), name = 'score_0', time = 100) {
    const source = path.join(cache, name);
    fs.writeFileSync(source, scoreCacheFrame(body, { time }));
    return importScoreCacheFile(root, source);
}

test('parses and imports exact replay-score sources with distinct identities and idempotent recovery', async t => {
    const { root, cache } = workspace(t);
    const body = Buffer.from(JSON.stringify([frame(1), frame(2)]));
    const cacheBytes = scoreCacheFrame(body);
    const parsed = parseScoreCacheEntry(cacheBytes);
    const sourceKey = `1/0/https://arena.screeps.com/api/game/${replayId}/replay/100`;
    assert.equal(parsed.kind, 'score-source');
    assert.equal(parsed.sourceKind, 'replay-frames');
    assert.equal(parsed.requestedGameTime, 100);
    assert.equal(parsed.cacheEntryFingerprint, sha256(cacheBytes));
    assert.equal(parsed.responseFingerprint, sha256(body));
    assert.equal(parsed.fingerprint, scoreSourceFingerprint(sourceKey, body));
    assert.notEqual(parsed.cacheEntryFingerprint, parsed.responseFingerprint);
    assert.notEqual(parsed.fingerprint, parsed.responseFingerprint);
    assert.equal(parsed.coverage.status, 'complete');
    assert.equal(parsed.validation.items.status, 'valid');

    const source = path.join(cache, 'score_0');
    fs.writeFileSync(source, cacheBytes);
    const imported = await importScoreCacheFile(root, source);
    assert.equal(imported.kind, 'imported');
    assert.equal(imported.record.status, 'claim');
    assert.equal(imported.record.mapId, null);
    const output = path.join(root, 'replay_logs', imported.record.outputPath);
    assert.deepEqual(fs.readFileSync(output), body);
    assert.equal(verifyScoreSource(root, replayId, imported.record.fingerprint).verified, true);
    const before = manifest(root);
    assert.equal((await importScoreCacheFile(root, source)).kind, 'deduplicated');
    assert.deepEqual(manifest(root), before);

    const sameBodyOtherRequest = parseScoreCacheEntry(scoreCacheFrame(body, { time: 200 }));
    assert.notEqual(sameBodyOtherRequest.fingerprint, parsed.fingerprint);
    const changed = await importFrames(root, cache, JSON.stringify([frame(1), frame(3)]), 'score_1');
    assert.equal(changed.kind, 'imported');
    assert.notEqual(changed.record.fingerprint, imported.record.fingerprint);
    assert.deepEqual(changed.record.coverage.localSegments[0].gaps,
        [{ firstGameTime: 2, lastGameTime: 2 }]);
    const legacy = manifest(root);
    legacy.scoreRecords.find(item => item.fingerprint === changed.record.fingerprint)
        .coverage.localSegments[0].gaps = [2];
    writeManifest(root, legacy);
    assert.equal(verifyScoreSource(root, replayId, changed.record.fingerprint).verified, true);
    assert.equal((await importScoreCacheFile(root, path.join(cache, 'score_1'))).kind, 'deduplicated');

    let interrupted = manifest(root);
    const pending = interrupted.scoreRecords[0];
    pending.status = 'pending';
    writeManifest(root, interrupted);
    const recoveredPublished = await importScoreCacheFile(root, source);
    assert.equal(recoveredPublished.record.status, 'claim');
    assert.deepEqual(fs.readFileSync(output), body);

    interrupted = manifest(root);
    interrupted.scoreRecords[0].status = 'pending';
    fs.unlinkSync(output);
    writeManifest(root, interrupted);
    const recovered = await importScoreCacheFile(root, source);
    assert.equal(recovered.record.status, 'claim');
    assert.deepEqual(fs.readFileSync(output), body);

    interrupted = manifest(root);
    interrupted.scoreRecords[0].status = 'claim';
    fs.unlinkSync(output);
    writeManifest(root, interrupted);
    await assert.rejects(importScoreCacheFile(root, source), /missing after publication/);
    interrupted = manifest(root);
    interrupted.scoreRecords[0].status = 'done';
    interrupted.scoreRecords[0].reviews = { task: { claimedAt: 'x', examinedAt: 'y', completedAt: 'z' } };
    writeManifest(root, interrupted);
    assert.equal((await importScoreCacheFile(root, source)).record.status, 'done');
    assert.deepEqual(fs.readFileSync(output), body);
});

test('publishes exclusively without adopting unsafe paths or overwriting occupied names', async t => {
    const { root, cache } = workspace(t);
    const body = Buffer.from(JSON.stringify([frame(1)]));
    const bytes = scoreCacheFrame(body);
    const parsed = parseScoreCacheEntry(bytes);
    const directory = path.join(root, 'replay_logs');
    fs.mkdirSync(directory);
    const outside = path.join(root, 'outside.response');
    fs.writeFileSync(outside, 'keep');
    const truncated = path.join(directory,
        `replay-score-source-${replayId}-${parsed.fingerprint.slice(0, 12)}.response`);
    fs.symlinkSync(outside, truncated);
    const source = path.join(cache, 'score_0');
    fs.writeFileSync(source, bytes);
    const imported = await importScoreCacheFile(root, source);
    assert.equal(imported.record.outputPath,
        `replay-score-source-${replayId}-${parsed.fingerprint}.response`);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
    assert.equal(fs.lstatSync(truncated).isSymbolicLink(), true);
    assert.deepEqual(fs.readFileSync(path.join(directory, imported.record.outputPath)), body);

    const sourceLink = path.join(cache, 'linked_0');
    fs.symlinkSync(source, sourceLink);
    await assert.rejects(importScoreCacheFile(root, sourceLink), /Unsafe replay-score cache source/);

    const interruptedSource = path.join(cache, 'verification_failure');
    fs.writeFileSync(interruptedSource, scoreCacheFrame(JSON.stringify([frame(2)]), { time: 200 }));
    await assert.rejects(importScoreCacheFile(root, interruptedSource, {
        afterPublish: target => fs.writeFileSync(target, 'changed-after-publication'),
    }), /failed final verification/);
    const pending = manifest(root).scoreRecords.find(item => item.requestedGameTime === 200);
    assert.equal(pending.status, 'pending');
    const pendingPath = path.join(directory, pending.outputPath);
    assert.equal(fs.readFileSync(pendingPath, 'utf8'), 'changed-after-publication');
    fs.unlinkSync(pendingPath);
    const recovered = await importScoreCacheFile(root, interruptedSource);
    assert.equal(recovered.record.status, 'claim');
    assert.equal(verifyScoreSource(root, replayId, pending.fingerprint).verified, true);
});

test('retains malformed and unsupported semantic bodies with layered deterministic validation', async t => {
    const { root, cache } = workspace(t);
    const malformed = parseScoreCacheEntry(scoreCacheFrame('{broken'));
    assert.equal(malformed.kind, 'score-source');
    assert.equal(malformed.coverage, null);
    assert.equal(malformed.validation.json, 'malformed');
    assert.equal(malformed.validation.items.status, 'unavailable');
    assert.deepEqual(malformed.validation.items.blockedBy, ['json-malformed']);
    const retained = await importFrames(root, cache, '{broken');
    assert.equal(retained.record.validation.json, 'malformed');
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', retained.record.outputPath), 'utf8'), '{broken');

    const nonArray = validateScoreBody('replay-frames', Buffer.from('{}'));
    assert.equal(nonArray.coverage, null);
    assert.equal(nonArray.validation.frames, 'malformed');
    assert.deepEqual(nonArray.validation.items.blockedBy, ['frames-malformed']);

    const partial = validateScoreBody('replay-frames', Buffer.from(JSON.stringify([
        frame(1), null, frame(3, { ui: { version: 2, items: scoreItems() } }),
    ])));
    assert.equal(partial.coverage.status, 'partial');
    assert.deepEqual(partial.coverage.localSegments.map(item => [item.firstGameTime, item.lastGameTime]),
        [[1, 1], [3, 3]]);
    assert.equal(partial.validation.frames, 'partial');
    assert.equal(partial.validation.ui, 'partial');
    assert.equal(partial.validation.items.counts.unassessed, 8);
    assert.deepEqual(partial.validation.items.blockedBy, ['frame-malformed', 'ui-unsupported']);

    const metadata = parseScoreCacheEntry(scoreCacheFrame(JSON.stringify({ players: ['a', 'b'] }),
        { time: null, includeLength: false }));
    assert.equal(metadata.sourceKind, 'game-metadata');
    assert.equal(metadata.requestedGameTime, null);
    assert.equal(metadata.validation.metadata, 'valid');
    assert.equal(metadata.validation.items.status, 'not-applicable');
    for (const value of [
        { players: [{}, {}] },
        { players: ['', 'b'] },
        { players: ['a', 'b'], users: ['b', 'a'] },
    ]) {
        assert.equal(validateScoreBody('game-metadata', Buffer.from(JSON.stringify(value)))
            .validation.metadata, 'partial');
    }

    const incomplete = scoreCacheFrame('[]', { lengthAdjustment: 10 });
    assert.equal(parseScoreCacheEntry(incomplete).kind, 'incomplete');
    const corrupt = Buffer.from(scoreCacheFrame('[]'));
    corrupt[24 + Buffer.byteLength(
        `1/0/https://arena.screeps.com/api/game/${replayId}/replay/100`)] ^= 0xff;
    assert.equal(parseScoreCacheEntry(corrupt).kind, 'incomplete');
    const unsupported = scoreCacheFrame('[]', { encoding: 'br' });
    assert.equal(parseScoreCacheEntry(unsupported).kind, 'unsupported');
    const misleadingStatus = scoreCacheFrame('[]', { stream0Factory: length =>
        `HTTP/1.1 500\0x-note:HTTP/1.1 200\0content-length:${length}\0content-encoding:gzip\0` });
    assert.equal(parseScoreCacheEntry(misleadingStatus).kind, 'unsupported');
    const conflictingEncoding = scoreCacheFrame('[]', { stream0Factory: length =>
        `HTTP/1.1 200\0content-length:${length}\0content-encoding:gzip\0content-encoding:br\0` });
    assert.equal(parseScoreCacheEntry(conflictingEncoding).kind, 'unsupported');
    const conflictingLength = scoreCacheFrame('[]', { stream0Factory: length =>
        `HTTP/1.1 200\0content-length:${length}\0content-length:${length + 1}\0content-encoding:gzip\0` });
    assert.equal(parseScoreCacheEntry(conflictingLength).kind, 'incomplete');
    const source = path.join(cache, 'incomplete_0');
    fs.writeFileSync(source, incomplete);
    assert.equal((await importScoreCacheFile(root, source)).kind, 'incomplete');
    assert.equal(manifest(root).scoreRecords.length, 1);
});

test('summarizes arbitrarily wide game-time gaps in input-bounded ranges', () => {
    const result = validateScoreBody('replay-frames', Buffer.from(JSON.stringify([
        frame(0), frame(Number.MAX_SAFE_INTEGER),
    ])));
    assert.deepEqual(result.coverage.localSegments[0].gaps,
        [{ firstGameTime: 1, lastGameTime: Number.MAX_SAFE_INTEGER - 1 }]);
    assert.equal(result.coverage.localSegments[0].firstGameTime, 0);
    assert.equal(result.coverage.localSegments[0].lastGameTime, Number.MAX_SAFE_INTEGER);
});

test('uses deterministic dual-defect item precedence, diagnostics, duplicates, and aggregation', () => {
    const both = { id: 'player1-score', name: 'Points', value: 1.5 };
    const single = validateScoreBody('replay-frames', Buffer.from(JSON.stringify([
        frame(1, { ui: { version: 1, items: scoreItems({ 'player1-score': both }) } }),
    ])));
    const assessment = single.validation.items.assessments[0];
    assert.deepEqual(assessment, {
        frameIndex: 0, gameTime: 1, slot: 'player1', itemId: 'player1-score',
        measurement: 'cumulativeScore', status: 'mislabeled', occurrenceIndexes: [0],
        value: null, reason: null,
    });
    assert.deepEqual(single.validation.issues.map(item => item.code),
        ['item-label-mismatch', 'item-value-invalid']);
    assert.equal(single.validation.items.status, 'partial');
    assert.equal(single.validation.items.counts.valid, 3);
    assert.equal(single.validation.items.counts.mislabeled, 1);
    assert.deepEqual(single.validation.items.assessments.map(item => item.value), [null, 2, 8, 1]);

    const duplicated = validateScoreBody('replay-frames', Buffer.from(JSON.stringify([
        frame(1, { ui: { version: 1, items: scoreItems({ 'player1-score': [both, { ...both }] }) } }),
    ])));
    assert.equal(duplicated.validation.items.assessments[0].status, 'mislabeled');
    assert.deepEqual(duplicated.validation.items.assessments[0].occurrenceIndexes, [0, 1]);
    assert.deepEqual(duplicated.validation.issues.map(item => item.code),
        ['item-label-mismatch', 'item-value-invalid']);

    const conflicting = validateScoreBody('replay-frames', Buffer.from(JSON.stringify([
        frame(1, { ui: { version: 1, items: scoreItems({ 'player1-score':
            [both, { id: 'player1-score', name: 'Score', value: 10 }] }) } }),
    ])));
    assert.equal(conflicting.validation.items.assessments[0].status, 'conflicting');
    assert.deepEqual(conflicting.validation.issues.map(item => item.code), ['item-conflict']);

    const blocked = validateScoreBody('replay-frames', Buffer.from(JSON.stringify([
        frame(1, { ui: { version: 2, items: scoreItems() } }),
    ])));
    assert.ok(blocked.validation.items.assessments.every(item => item.status === 'unassessed'));
    assert.deepEqual(blocked.validation.issues.map(item => item.code), ['ui-unsupported']);
});

test('keeps score review completion separate from retry-safe map-independent cleanup', async t => {
    const { root, cache } = workspace(t);
    const imported = await importFrames(root, cache);
    const { fingerprint, outputPath } = imported.record;
    const output = path.join(root, 'replay_logs', outputPath);
    await updateScoreReview(root, 'claim', replayId, fingerprint, 'codex/score-test');
    await assert.rejects(updateScoreReview(root, 'done', replayId, fingerprint, 'codex/score-test'),
        /examination/);
    await updateScoreReview(root, 'examined', replayId, fingerprint, 'codex/score-test');
    const done = await updateScoreReview(root, 'done', replayId, fingerprint, 'codex/score-test');
    assert.equal(done.status, 'done');
    assert.equal(fs.existsSync(output), true);
    assert.equal(manifest(root).retiredScoreSources.length, 0);

    await assert.rejects(cleanupScoreSource(root, replayId, fingerprint,
        { deleteFile: () => { throw new Error('synthetic deletion failure'); } }),
    /synthetic deletion failure/);
    let failed = manifest(root);
    assert.equal(failed.scoreRecords[0].status, 'retiring');
    assert.equal(failed.retiredScoreSources.length, 0);
    assert.equal(fs.existsSync(output), true);
    assert.equal((await cleanupScoreSource(root, replayId, fingerprint)).kind, 'retired');
    assert.equal(fs.existsSync(output), false);
    let cleaned = manifest(root);
    assert.equal(cleaned.scoreRecords.length, 0);
    assert.deepEqual(cleaned.retiredScoreSources, [{ sourceType: 'replay-score-source', replayId, fingerprint }]);
    assert.equal((await cleanupScoreSource(root, replayId, fingerprint)).kind, 'already-retired');
    assert.equal((await importScoreCacheFile(root, path.join(cache, 'score_0'))).kind, 'deduplicated');
    assert.equal(manifest(root).replays.length, 0);

    const second = await importFrames(root, cache, JSON.stringify([frame(2)]), 'score_1', 200);
    await updateScoreReview(root, 'claim', replayId, second.record.fingerprint, 'codex/second');
    await updateScoreReview(root, 'examined', replayId, second.record.fingerprint, 'codex/second');
    await updateScoreReview(root, 'done', replayId, second.record.fingerprint, 'codex/second');
    fs.unlinkSync(path.join(root, 'replay_logs', second.record.outputPath));
    await assert.rejects(cleanupScoreSource(root, replayId, second.record.fingerprint), /missing before retirement/);
    let interrupted = manifest(root);
    interrupted.scoreRecords[0].status = 'retiring';
    writeManifest(root, interrupted);
    assert.equal((await cleanupScoreSource(root, replayId, second.record.fingerprint)).kind, 'retired');
});

test('refuses cross-record output aliases before changing cleanup state or artifacts', async t => {
    const { root, cache } = workspace(t);
    const body = JSON.stringify([frame(1)]);
    const first = await importFrames(root, cache, body, 'first', 100);
    const second = await importFrames(root, cache, body, 'second', 200);
    await updateScoreReview(root, 'claim', replayId, first.record.fingerprint, 'codex/alias');
    await updateScoreReview(root, 'examined', replayId, first.record.fingerprint, 'codex/alias');
    await updateScoreReview(root, 'done', replayId, first.record.fingerprint, 'codex/alias');
    const directory = path.join(root, 'replay_logs');
    const original = manifest(root);
    const firstRecord = original.scoreRecords.find(item => item.fingerprint === first.record.fingerprint);
    const secondRecord = original.scoreRecords.find(item => item.fingerprint === second.record.fingerprint);
    const firstPath = path.join(directory, firstRecord.outputPath);
    const secondPath = path.join(directory, secondRecord.outputPath);
    const firstBytes = fs.readFileSync(firstPath);
    const secondBytes = fs.readFileSync(secondPath);

    firstRecord.outputPath = secondRecord.outputPath;
    writeManifest(root, original);
    const aliased = manifest(root);
    await assert.rejects(cleanupScoreSource(root, replayId, first.record.fingerprint),
        /does not match record identity/);
    assert.deepEqual(manifest(root), aliased);
    assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
    assert.deepEqual(fs.readFileSync(secondPath), secondBytes);

    firstRecord.outputPath = first.record.outputPath;
    secondRecord.outputPath = first.record.outputPath;
    writeManifest(root, original);
    const multiplyOwned = manifest(root);
    await assert.rejects(cleanupScoreSource(root, replayId, first.record.fingerprint),
        /unique record ownership/);
    assert.deepEqual(manifest(root), multiplyOwned);
    assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
    assert.deepEqual(fs.readFileSync(secondPath), secondBytes);
});

test('preserves score collections across existing manifest writer paths', async t => {
    const { root, cache } = workspace(t);
    const score = await importFrames(root, cache);
    await updateScoreReview(root, 'claim', replayId, score.record.fingerprint, 'codex/preserve');
    const populated = manifest(root);
    populated.scoreRecords[0].compatibilityFixture = {
        nested: { array: [1, { futureField: true }], nullable: null },
    };
    populated.retiredScoreSources.push({ sourceType: 'replay-score-source',
        replayId: 'bbbbbbbbbbbbbbbbbbbbbbbb', fingerprint: 'f'.repeat(64) });
    writeManifest(root, populated);
    const expected = () => {
        const current = manifest(root);
        return { scoreRecords: structuredClone(current.scoreRecords),
            retiredScoreSources: structuredClone(current.retiredScoreSources) };
    };
    const assertPreserved = before => {
        const current = manifest(root);
        assert.deepEqual(current.scoreRecords, before.scoreRecords);
        assert.deepEqual(current.retiredScoreSources, before.retiredScoreSources);
    };

    let before = expected();
    const mapSource = path.join(cache, 'map_0');
    fs.writeFileSync(mapSource, logCacheFrame({ 1: mapEntry(), 2: gameEntry(1) }));
    const logRecord = (await importCacheFile(root, mapSource)).record;
    assertPreserved(before);

    before = expected();
    const localName = `${replayId}-aaaaaaaaaaaa.jsonl`;
    fs.writeFileSync(path.join(root, 'replay_logs', localName), `${gameEntry(2)}\n`);
    await registerLocalFile(root, replayId, localName);
    assertPreserved(before);

    let current = manifest(root);
    current.records[0].status = 'waiting';
    writeManifest(root, current);
    before = expected();
    assert.equal(await migrateReviewStatuses(root), 1);
    assertPreserved(before);

    before = expected();
    await updateReview(root, 'claim', replayId, logRecord.fingerprint, 'codex/log');
    await updateReview(root, 'examined', replayId, logRecord.fingerprint, 'codex/log');
    await updateReview(root, 'done', replayId, logRecord.fingerprint, 'codex/log');
    assertPreserved(before);

    before = expected();
    await reconcileCleanup(root);
    assertPreserved(before);

    before = expected();
    const scanSource = path.join(cache, 'scan_0');
    fs.writeFileSync(scanSource, logCacheFrame({ 3: gameEntry(3) }, 3));
    await scanCache(root, cache, new Map());
    assertPreserved(before);

    before = expected();
    const results = await upgradeMapChecksums(root);
    assert.ok(results.every(result => ['verified', 'updated'].includes(result.status)));
    assertPreserved(before);

    before = expected();
    let filesBefore = snapshotReplayFiles(root);
    const success = analyzeReplay({ root, replayId });
    assert.ok(success.findings.some(item => item.rule === 'manifest.schema' && item.verdict === 'pass'));
    assert.deepEqual(snapshotReplayFiles(root), filesBefore);
    assertPreserved(before);

    const currentRecord = manifest(root).records.find(item => item.outputPath);
    fs.writeFileSync(path.join(root, 'replay_logs', currentRecord.outputPath), 'changed');
    before = expected();
    filesBefore = snapshotReplayFiles(root);
    const failure = analyzeReplay({ root, replayId });
    assert.ok(failure.findings.some(item => item.verdict === 'fail'));
    assert.deepEqual(snapshotReplayFiles(root), filesBefore);
    assertPreserved(before);
});

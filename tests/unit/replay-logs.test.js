import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importCacheFile, parseCacheEntry, scanCache, updateReview } from '../../tools/replay-logs.js';

const replayId = '6ab84434e0351372bc91e8fe';
const entry = tick => JSON.stringify({
    type: 'game-state', tick, phase: 'before-actions', selectedFlagId: 'flag',
    creeps: [{ id: 'owned', my: true, x: tick, y: 2, hits: 90, hitsMax: 100, fatigue: 0, activeBodyParts: { heal: 1 } }],
    flags: [{ id: 'flag', x: 5, y: 5, owner: 'neutral', effectType: 'test', scorePerTick: 1 }],
});

function cacheFrame(values, { id = replayId, tick = 72, encoding = 'gzip', malformed = false } = {}) {
    const key = Buffer.from(`1/0/https://arena.screeps.com/api/game/${id}/log/${tick}`);
    const header = Buffer.alloc(24);
    Buffer.from('305c72a71b6dfbfc', 'hex').copy(header);
    header.writeUInt32LE(5, 8);
    header.writeUInt32LE(key.length, 12);
    const body = Buffer.from(malformed ? '{invalid' : JSON.stringify(values));
    const payload = encoding === 'gzip' ? gzipSync(body) : body;
    const metadata = Buffer.from(`\0content-type:application/octet-stream\0content-length:${payload.length}\0content-encoding:${encoding}\0`);
    return Buffer.concat([header, key, payload, metadata]);
}

function workspace(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-replay-'));
    const cache = path.join(root, 'cache');
    fs.mkdirSync(cache);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return { root, cache };
}

test('extracts original complete game-state strings and reports other console entries', () => {
    const first = entry(1);
    const second = entry(3);
    const result = parseCacheEntry(cacheFrame({ 1: first, 2: 'Runtime warning', 3: second }));
    assert.equal(result.kind, 'log');
    assert.equal(result.replayId, replayId);
    assert.deepEqual(result.gameState, [first, second]);
    assert.deepEqual(result.otherEntries, [{ key: '2', raw: 'Runtime warning' }]);
    assert.deepEqual(result.coverage, { count: 2, firstTick: 1, lastTick: 3, duplicates: [], gaps: [2] });
});

test('distinguishes unrelated, incomplete, unsupported, and malformed cache responses', () => {
    assert.equal(parseCacheEntry(Buffer.from('unrelated')).kind, 'unrelated');
    assert.equal(parseCacheEntry(cacheFrame({ 1: entry(1) }).subarray(0, 70)).kind, 'incomplete');
    assert.equal(parseCacheEntry(cacheFrame({ 1: entry(1) }, { encoding: 'br' })).kind, 'unsupported');
    assert.equal(parseCacheEntry(cacheFrame({}, { malformed: true })).kind, 'malformed');
    assert.equal(parseCacheEntry(cacheFrame({ 1: '{"type":"game-state",broken' })).kind, 'malformed');
    assert.equal(parseCacheEntry(cacheFrame({ 1: JSON.stringify({ type: 'game-state', tick: 1 }) })).kind, 'malformed');
    assert.equal(parseCacheEntry(cacheFrame({ 1: entry(1) }, { id: 'not-a-replay-id' })).kind, 'unrelated');
});

test('scans existing, new, and rewritten cache files without overwriting different content', async t => {
    const { root, cache } = workspace(t);
    const seen = new Map();
    const source = path.join(cache, '0ba51337f83c1645_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    let events = await scanCache(root, cache, seen);
    assert.equal(events.length, 1);
    const first = events[0].record;
    assert.equal(first.outputPath, `${replayId}.jsonl`);
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', first.outputPath), 'utf8'), `${entry(1)}\n`);
    assert.deepEqual(await scanCache(root, cache, seen), []);

    fs.writeFileSync(source, cacheFrame({ 1: entry(1), 2: entry(2) }));
    fs.utimesSync(source, new Date(1_000_000), new Date(1_000_000));
    events = await scanCache(root, cache, seen);
    assert.equal(events.length, 1);
    const second = events[0].record;
    assert.notEqual(second.fingerprint, first.fingerprint);
    assert.match(second.outputPath, new RegExp(`^${replayId}-[a-f0-9]+\\.jsonl$`));
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', first.outputPath), 'utf8'), `${entry(1)}\n`);
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', second.outputPath), 'utf8'), `${entry(1)}\n${entry(2)}\n`);

    const newSource = path.join(cache, 'another_0');
    fs.writeFileSync(newSource, cacheFrame({ 1: entry(1) }, { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }));
    events = await scanCache(root, cache, seen);
    assert.equal(events.length, 1);
    assert.equal(events[0].record.replayId, 'aaaaaaaaaaaaaaaaaaaaaaaa');
});

test('review state survives restarts; all claimants must examine and complete before deletion', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    const initial = await importCacheFile(root, source);
    const { fingerprint, outputPath } = initial.record;
    const output = path.join(root, 'replay_logs', outputPath);
    await updateReview(root, 'claim', replayId, fingerprint, 'codex/task-a');
    await updateReview(root, 'claim', replayId, fingerprint, 'codex/task-b');
    await updateReview(root, 'examined', replayId, fingerprint, 'codex/task-a');
    await assert.rejects(updateReview(root, 'complete', replayId, fingerprint, 'codex/task-b'), /Record examination/);
    await updateReview(root, 'complete', replayId, fingerprint, 'codex/task-a');
    assert.equal(fs.existsSync(output), true);
    const persisted = JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', 'manifest.json'), 'utf8'));
    assert.equal(persisted.records[0].reviews['codex/task-a'].completedAt !== null, true);
    assert.equal(persisted.records[0].reviews['codex/task-b'].completedAt, null);
    await updateReview(root, 'examined', replayId, fingerprint, 'codex/task-b');
    const done = await updateReview(root, 'complete', replayId, fingerprint, 'codex/task-b');
    assert.equal(done.status, 'deleted');
    assert.equal(fs.existsSync(output), false);
    assert.equal((await updateReview(root, 'complete', replayId, fingerprint, 'codex/task-b')).status, 'deleted');
    assert.equal((await importCacheFile(root, source)).kind, 'deduplicated');
    assert.equal(fs.existsSync(output), false);
});

test('never adopts or deletes a pre-existing file or a symlink escape', async t => {
    const { root, cache } = workspace(t);
    const outputDir = path.join(root, 'replay_logs');
    fs.mkdirSync(outputDir);
    const canonical = path.join(outputDir, `${replayId}.jsonl`);
    fs.writeFileSync(canonical, 'user-owned\n');
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    const record = (await importCacheFile(root, source)).record;
    assert.notEqual(record.outputPath, path.basename(canonical));
    const managed = path.join(outputDir, record.outputPath);
    const outside = path.join(root, 'outside.jsonl');
    fs.writeFileSync(outside, 'keep me\n');
    fs.unlinkSync(managed);
    fs.symlinkSync(outside, managed);
    await updateReview(root, 'claim', replayId, record.fingerprint, 'codex/task');
    await updateReview(root, 'examined', replayId, record.fingerprint, 'codex/task');
    await assert.rejects(updateReview(root, 'complete', replayId, record.fingerprint, 'codex/task'), /Refusing to delete/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep me\n');
    assert.equal(fs.readFileSync(canonical, 'utf8'), 'user-owned\n');
});

test('bounded retries defer incomplete cache entries until they change', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'partial_0');
    const complete = cacheFrame({ 1: entry(1) });
    fs.writeFileSync(source, complete.subarray(0, 70));
    const seen = new Map();
    let reported = 0;
    for (let n = 0; n < 8; n++) reported += (await scanCache(root, cache, seen)).length;
    assert.equal(reported, 5);
    fs.writeFileSync(source, complete);
    assert.equal((await scanCache(root, cache, seen))[0].kind, 'imported');
});

test('an interrupted pending import resumes from the cached response', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    const record = (await importCacheFile(root, source)).record;
    const output = path.join(root, 'replay_logs', record.outputPath);
    const manifestPath = path.join(root, 'replay_logs', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.records[0].status = 'pending';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.unlinkSync(output);
    assert.equal((await importCacheFile(root, source)).kind, 'deduplicated');
    assert.equal(fs.readFileSync(output, 'utf8'), `${entry(1)}\n`);
    assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).records[0].status, 'available');
});

test('path traversal and changed managed content block deletion', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    const record = (await importCacheFile(root, source)).record;
    const outputDir = path.join(root, 'replay_logs');
    const output = path.join(outputDir, record.outputPath);
    const outside = path.join(root, 'outside.jsonl');
    fs.writeFileSync(outside, 'keep me\n');
    await updateReview(root, 'claim', replayId, record.fingerprint, 'codex/task');
    await updateReview(root, 'examined', replayId, record.fingerprint, 'codex/task');

    fs.writeFileSync(output, 'changed by another actor\n');
    await assert.rejects(updateReview(root, 'complete', replayId, record.fingerprint, 'codex/task'), /Refusing to delete/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'changed by another actor\n');

    const manifestPath = path.join(outputDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.records[0].outputPath = '../outside.jsonl';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await assert.rejects(updateReview(root, 'complete', replayId, record.fingerprint, 'codex/task'), /Unsafe managed output filename/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep me\n');
});

test('every accepted task ID holds an independent review claim', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    const record = (await importCacheFile(root, source)).record;
    await updateReview(root, 'claim', replayId, record.fingerprint, 'normal-task');
    await updateReview(root, 'claim', replayId, record.fingerprint, 'constructor');
    await updateReview(root, 'examined', replayId, record.fingerprint, 'normal-task');
    await updateReview(root, 'complete', replayId, record.fingerprint, 'normal-task');
    assert.equal(fs.existsSync(path.join(root, 'replay_logs', record.outputPath)), true);
    await updateReview(root, 'examined', replayId, record.fingerprint, 'constructor');
    assert.equal((await updateReview(root, 'complete', replayId, record.fingerprint, 'constructor')).status, 'deleted');
});

test('reports unsupported replay frames and malformed records regardless of field order', () => {
    const unsupported = cacheFrame({ 1: entry(1) });
    unsupported.writeUInt32LE(6, 8);
    assert.equal(parseCacheEntry(unsupported).kind, 'unsupported');
    assert.equal(parseCacheEntry(cacheFrame({ 1: '{"tick":1,"type":"game-state",broken' })).kind, 'malformed');
    const index = Buffer.alloc(24);
    Buffer.from('305c72a71b6dfbfc', 'hex').copy(index);
    index.writeUInt32LE(9, 8);
    assert.equal(parseCacheEntry(index).kind, 'unrelated');
});

test('recovers an abandoned empty lock from an interrupted older importer', async t => {
    const { root, cache } = workspace(t);
    fs.mkdirSync(path.join(root, 'replay_logs'));
    const lock = path.join(root, 'replay_logs', '.manifest.lock');
    fs.writeFileSync(lock, '');
    fs.utimesSync(lock, new Date(0), new Date(0));
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: entry(1) }));
    assert.equal((await importCacheFile(root, source)).kind, 'imported');
    assert.equal(fs.existsSync(lock), false);
});

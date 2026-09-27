import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importCacheFile, parseCacheEntry, reconcileCleanup, scanCache, updateReview } from '../../tools/replay-logs.js';

const replayId = '6ab84434e0351372bc91e8fe';
const entry = tick => JSON.stringify({
    type: 'game-state', tick, phase: 'before-actions', selectedFlagId: 'flag',
    creeps: [{ id: 'owned', my: true, x: tick, y: 2, hits: 90, hitsMax: 100, fatigue: 0, activeBodyParts: { heal: 1 } }],
    flags: [{ id: 'flag', x: 5, y: 5, owner: 'neutral', effectType: 'test', scorePerTick: 1 }],
});
const mapEntry = (terrain = 0) => JSON.stringify({
    type: 'map-state', formatVersion: 1, tick: 1, phase: 'before-actions',
    map: {
        arena: { name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000 },
        terrain: { width: 100, height: 100, rows: Array.from({ length: 100 }, () => Array(100).fill(terrain)) },
        objects: [{ type: 'ScoreFlag', id: 'flag', x: 5, y: 5, effectType: 'test', scorePerTick: 1 }],
    },
});
const mappedFirst = () => `${mapEntry()}\n${entry(1)}`;

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

test('splits Arena console calls joined under the same tick without changing either JSON record', () => {
    const joined = `${mapEntry()}\n${entry(1)}`;
    const result = parseCacheEntry(cacheFrame({ 1: joined, 2: entry(2) }));
    assert.equal(result.kind, 'log');
    assert.deepEqual(result.map, JSON.parse(mapEntry()).map);
    assert.deepEqual(result.gameState, [entry(1), entry(2)]);
    assert.deepEqual(result.otherEntries, []);
    assert.deepEqual(result.coverage, { count: 2, firstTick: 1, lastTick: 2, duplicates: [], gaps: [] });
    const bad = parseCacheEntry(cacheFrame({ 1: `${mapEntry()}\n{"type":"game-state",broken` }));
    assert.equal(bad.kind, 'malformed');
});

test('validates and registers unique maps, then links only explicitly associated replay logs', async t => {
    const { root, cache } = workspace(t);
    const late = path.join(cache, 'late_0');
    const first = path.join(cache, 'first_0');
    fs.writeFileSync(late, cacheFrame({ 101: entry(101) }, { tick: 101 }));
    fs.writeFileSync(first, cacheFrame({ 1: mappedFirst() }, { tick: 1 }));
    assert.equal((await importCacheFile(root, late)).kind, 'deferred');
    assert.equal(fs.existsSync(path.join(root, 'replay_logs', `${replayId}.jsonl`)), false);
    const firstRecord = (await importCacheFile(root, first)).record;
    assert.equal(firstRecord.status, 'waiting');
    assert.match(firstRecord.mapFile, /^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]+)?\.json$/);
    const mapPath = path.join(root, 'replay_logs', firstRecord.mapFile);
    assert.deepEqual(JSON.parse(fs.readFileSync(mapPath, 'utf8')), JSON.parse(mapEntry()).map);
    const lateRecord = (await importCacheFile(root, late)).record;
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', firstRecord.outputPath), 'utf8'), `${entry(1)}\n`);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, 2);
    assert.equal(manifest.maps.length, 1);
    assert.equal(manifest.maps[0].id, firstRecord.mapId);
    assert.equal(manifest.maps[0].checksum, firstRecord.mapChecksum);
    assert.equal(manifest.maps[0].status, 'validated');
    assert.equal(manifest.replays[0].replayId, replayId);
    assert.equal(manifest.replays[0].mapId, firstRecord.mapId);
    assert.equal(manifest.replays[0].status, 'active');
    assert.equal(lateRecord.mapId, firstRecord.mapId);
    assert.equal(lateRecord.mapFile, firstRecord.mapFile);
    assert.equal((await importCacheFile(root, first)).kind, 'deduplicated');
    assert.equal(fs.readdirSync(path.join(root, 'replay_logs')).filter(name => name.startsWith('pain_and_gain_map_')).length, 1);

    const otherReplay = path.join(cache, 'other_0');
    fs.writeFileSync(otherReplay, cacheFrame({ 1: entry(1) }, { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', tick: 1 }));
    assert.equal((await importCacheFile(root, otherReplay)).kind, 'deferred');
    fs.writeFileSync(otherReplay, cacheFrame({ 1: mapEntry(), 2: entry(1) }, { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', tick: 1 }));
    assert.equal((await importCacheFile(root, otherReplay)).record.mapFile, firstRecord.mapFile);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', 'manifest.json'), 'utf8')).maps.length, 1);
    const changed = path.join(cache, 'changed_0');
    fs.writeFileSync(changed, cacheFrame({ 1: mapEntry(1), 2: entry(1) }, { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', tick: 1 }));
    const changedRecord = (await importCacheFile(root, changed)).record;
    assert.notEqual(changedRecord.mapFile, firstRecord.mapFile);
    assert.equal(JSON.parse(fs.readFileSync(mapPath, 'utf8')).terrain.rows[0][0], 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', changedRecord.mapFile), 'utf8')).terrain.rows[0][0], 1);
});

test('a scan defers a response before its map and imports it after the map arrives', async t => {
    const { root, cache } = workspace(t);
    fs.writeFileSync(path.join(cache, 'a_late_0'), cacheFrame({ 101: entry(101) }, { tick: 101 }));
    fs.writeFileSync(path.join(cache, 'z_first_0'), cacheFrame({ 1: mappedFirst() }, { tick: 1 }));
    const events = await scanCache(root, cache, new Map());
    assert.equal(events.filter(event => event.kind === 'imported').length, 2);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', 'manifest.json'), 'utf8'));
    assert.equal(manifest.records.length, 2);
    assert.ok(manifest.records.every(record => record.status === 'waiting' && record.mapId === manifest.replays[0].mapId));
    assert.ok(manifest.records.every(record => fs.existsSync(path.join(root, 'replay_logs', record.outputPath))));
});

test('map-only response activates its replay; schema, checksum, and association gate later logs', async t => {
    const { root, cache } = workspace(t);
    const mapOnly = path.join(cache, 'map_0');
    const later = path.join(cache, 'later_0');
    fs.writeFileSync(mapOnly, cacheFrame({ 1: mapEntry() }, { tick: 1 }));
    fs.writeFileSync(later, cacheFrame({ 2: entry(2) }, { tick: 2 }));
    assert.equal((await importCacheFile(root, mapOnly)).kind, 'mapped');
    const dir = path.join(root, 'replay_logs');
    const manifestPath = path.join(dir, 'manifest.json');
    let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.records.length, 0);
    const registration = manifest.maps[0];
    const file = path.join(dir, registration.file);
    const original = fs.readFileSync(file);
    assert.equal(createHash('sha256').update(original).digest('hex'), registration.checksum);
    assert.equal((await importCacheFile(root, later)).record.status, 'waiting');

    fs.writeFileSync(file, '{}\n');
    const more = path.join(cache, 'more_0');
    fs.writeFileSync(more, cacheFrame({ 3: entry(3) }, { tick: 3 }));
    await assert.rejects(importCacheFile(root, more), /Map schema or checksum mismatch/);
    assert.equal(fs.readdirSync(dir).filter(name => name.endsWith('.jsonl')).length, 1);
    fs.unlinkSync(file);
    await assert.rejects(importCacheFile(root, more), /ENOENT/);
    assert.equal(fs.readdirSync(dir).filter(name => name.endsWith('.jsonl')).length, 1);
    fs.writeFileSync(file, original);
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.replays[0].status = 'inactive';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.equal((await importCacheFile(root, more)).kind, 'deferred');
    assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).records.length, 1);
    await assert.rejects(importCacheFile(root, mapOnly), /not active/);
});

test('rejects malformed or conflicting map entries without linking them', async t => {
    const { root, cache } = workspace(t);
    assert.equal(parseCacheEntry(cacheFrame({ 1: '{"type":"map-state",broken' })).kind, 'malformed');
    const withCreep = JSON.parse(mapEntry());
    withCreep.map.objects.push({ type: 'Creep', id: 'owned' });
    assert.equal(parseCacheEntry(cacheFrame({ 1: JSON.stringify(withCreep) })).kind, 'malformed');
    withCreep.map.objects.pop();
    withCreep.map.creeps = [{ id: 'owned' }];
    assert.equal(parseCacheEntry(cacheFrame({ 1: JSON.stringify(withCreep) })).kind, 'malformed');
    assert.equal(parseCacheEntry(cacheFrame({ 1: mapEntry(), 2: mapEntry(1) })).kind, 'malformed');
    const first = path.join(cache, 'first_0');
    fs.writeFileSync(first, cacheFrame({ 1: mapEntry(), 2: entry(1) }, { tick: 1 }));
    await importCacheFile(root, first);
    const conflicting = path.join(cache, 'conflicting_0');
    fs.writeFileSync(conflicting, cacheFrame({ 101: mapEntry(1), 102: entry(101) }, { tick: 101 }));
    await assert.rejects(importCacheFile(root, conflicting), /Conflicting maps/);
    assert.equal(fs.readdirSync(path.join(root, 'replay_logs')).filter(name => name.startsWith('pain_and_gain_map_')).length, 1);
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
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
    let events = await scanCache(root, cache, seen);
    assert.equal(events.length, 1);
    const first = events[0].record;
    assert.equal(first.outputPath, `${replayId}.jsonl`);
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', first.outputPath), 'utf8'), `${entry(1)}\n`);
    assert.deepEqual(await scanCache(root, cache, seen), []);

    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst(), 2: entry(2) }));
    fs.utimesSync(source, new Date(1_000_000), new Date(1_000_000));
    events = await scanCache(root, cache, seen);
    assert.equal(events.length, 1);
    const second = events[0].record;
    assert.notEqual(second.fingerprint, first.fingerprint);
    assert.match(second.outputPath, new RegExp(`^${replayId}-[a-f0-9]+\\.jsonl$`));
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', first.outputPath), 'utf8'), `${entry(1)}\n`);
    assert.equal(fs.readFileSync(path.join(root, 'replay_logs', second.outputPath), 'utf8'), `${entry(1)}\n${entry(2)}\n`);

    const newSource = path.join(cache, 'another_0');
    fs.writeFileSync(newSource, cacheFrame({ 1: mappedFirst() }, { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }));
    events = await scanCache(root, cache, seen);
    assert.equal(events.length, 1);
    assert.equal(events[0].record.replayId, 'aaaaaaaaaaaaaaaaaaaaaaaa');
});

test('waiting reviews survive restarts; all claimants must examine and complete before done cleanup', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
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
    assert.equal(persisted.records[0].status, 'waiting');
    assert.equal(persisted.records[0].reviews['codex/task-a'].completedAt !== null, true);
    assert.equal(persisted.records[0].reviews['codex/task-b'].completedAt, null);
    await updateReview(root, 'examined', replayId, fingerprint, 'codex/task-b');
    const done = await updateReview(root, 'done', replayId, fingerprint, 'codex/task-b');
    assert.equal(done.status, 'done');
    assert.equal(fs.existsSync(output), false);
    const cleaned = JSON.parse(fs.readFileSync(path.join(root, 'replay_logs', 'manifest.json'), 'utf8'));
    assert.equal(cleaned.records.length, 0);
    assert.equal(cleaned.maps.length, 1);
    assert.equal(cleaned.replays[0].retiredFingerprints.includes(fingerprint), true);
    assert.equal((await updateReview(root, 'complete', replayId, fingerprint, 'codex/task-b')).status, 'done');
    assert.equal((await importCacheFile(root, source)).kind, 'deduplicated');
    assert.equal(fs.existsSync(output), false);
});

test('interrupted done cleanup removes only the log and preserves its map and fingerprint', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
    const record = (await importCacheFile(root, source)).record;
    const directory = path.join(root, 'replay_logs');
    const manifestPath = path.join(directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.records[0].status = 'done';
    manifest.records[0].reviews['codex/recovered'] = {
        claimedAt: new Date().toISOString(), examinedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await reconcileCleanup(root);
    const cleaned = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(cleaned.records.length, 0);
    assert.equal(cleaned.maps.length, 1);
    assert.equal(cleaned.replays[0].retiredFingerprints.includes(record.fingerprint), true);
    assert.equal(fs.existsSync(path.join(directory, record.outputPath)), false);
    assert.equal(fs.existsSync(path.join(directory, record.mapFile)), true);
    assert.equal((await importCacheFile(root, source)).kind, 'deduplicated');
});

test('cleanup refuses a done status without explicit completed analysis', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
    const record = (await importCacheFile(root, source)).record;
    const directory = path.join(root, 'replay_logs');
    const manifestPath = path.join(directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.records[0].status = 'done';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await assert.rejects(reconcileCleanup(root), /lacks completed analysis/);
    assert.equal(fs.existsSync(path.join(directory, record.outputPath)), true);
    assert.equal(fs.existsSync(path.join(directory, record.mapFile)), true);
});

test('never adopts or deletes a pre-existing file or a symlink escape', async t => {
    const { root, cache } = workspace(t);
    const outputDir = path.join(root, 'replay_logs');
    fs.mkdirSync(outputDir);
    const canonical = path.join(outputDir, `${replayId}.jsonl`);
    fs.writeFileSync(canonical, 'user-owned\n');
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
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
    const complete = cacheFrame({ 1: mappedFirst() });
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
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
    const record = (await importCacheFile(root, source)).record;
    const output = path.join(root, 'replay_logs', record.outputPath);
    const manifestPath = path.join(root, 'replay_logs', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.records[0].status = 'pending';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.unlinkSync(output);
    assert.equal((await importCacheFile(root, source)).kind, 'deduplicated');
    assert.equal(fs.readFileSync(output, 'utf8'), `${entry(1)}\n`);
    assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).records[0].status, 'waiting');
});

test('path traversal and changed managed content block deletion', async t => {
    const { root, cache } = workspace(t);
    const source = path.join(cache, 'response_0');
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
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
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
    const record = (await importCacheFile(root, source)).record;
    await updateReview(root, 'claim', replayId, record.fingerprint, 'normal-task');
    await updateReview(root, 'claim', replayId, record.fingerprint, 'constructor');
    await updateReview(root, 'examined', replayId, record.fingerprint, 'normal-task');
    await updateReview(root, 'complete', replayId, record.fingerprint, 'normal-task');
    assert.equal(fs.existsSync(path.join(root, 'replay_logs', record.outputPath)), true);
    await updateReview(root, 'examined', replayId, record.fingerprint, 'constructor');
    assert.equal((await updateReview(root, 'complete', replayId, record.fingerprint, 'constructor')).status, 'done');
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
    fs.writeFileSync(source, cacheFrame({ 1: mappedFirst() }));
    assert.equal((await importCacheFile(root, source)).kind, 'imported');
    assert.equal(fs.existsSync(lock), false);
});

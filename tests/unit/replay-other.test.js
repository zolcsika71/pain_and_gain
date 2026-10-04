import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import test, { mock } from 'node:test';
import { writeOtherEntries, writeOtherToStream, writeFixtureOther } from '../../tools/replay-other.js';
import { createFixtureStore, openStore, recordOwner, recordKey } from '../../tools/replay-store.js';
import { createCatalogFixture, openCatalog } from '../../tools/replay-catalog.js';
import { diagnosticChunks, digestChunks, jsonChunks, payloadPath, iterateDiagnostics } from '../../tools/replay-store-payloads.js';

const prefix = path.join(fs.realpathSync(os.tmpdir()), 'pain-gain-store-v3-fixture-');
const replayId = 'b'.repeat(24), mapId = 'a'.repeat(64);
const key = (i = 0) => ({collection: 'log', replayId, fingerprint: i.toString(16).padStart(64, '0')});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const options = f => ({root: f.s.root, schemaVersion: f.schema, ...key()});
const database = s => path.join(s.root, JSON.parse(fs.readFileSync(path.join(s.root, 'manifest.json'))).database);
const chunks = function* (bytes) { for (let i = 0; i < bytes.length; i += 65536) yield bytes.subarray(i, i + 65536); };
const output = async f => { const parts = []; await writeFixtureOther(options(f), c => parts.push(c)); return Buffer.concat(parts).toString(); };
const oracle = values => values.map(v => JSON.stringify(v) + '\n').join('');
async function fixture(t, schema = 1, root = fs.mkdtempSync(prefix)) {
    const h = await (schema === 1 ? createFixtureStore : createCatalogFixture)({root, filesystem: 'local-apfs'}), s = h.evidence ?? h;
    t?.after(() => { h.close(); fs.rmSync(root, {recursive: true, force: true}); });
    fs.writeFileSync(path.join(root, 'map.json'), '{}');
    await s.withWriter(w => w.transaction(tx => {
        tx.insertEntity({kind: 'map', key: mapId, ordinal: 0, value: {path: 'map.json', hash: hash('{}')}});
        tx.insertEntity({kind: 'replay', key: replayId, ordinal: 0, value: {mapId}});
    }));
    return {s, h, schema};
}
async function publish(f, wrappers, {overflow = -1, bytes, items = wrappers.length, fileOutput = false, role = 'diagnostics', bind = true} = {}) {
    const {s} = f, k = key(), owner = recordOwner(k), pointer = '/otherEntries', childPointer = pointer + '/overflow';
    const source = bytes ? () => chunks(bytes) : function* () {
        for (let ordinal = 0; ordinal < wrappers.length; ordinal++) {
            const envelope = ordinal === overflow ? {ordinal, wrapperRef: childPointer} : {ordinal, wrapper: wrappers[ordinal]};
            yield* chunks(Buffer.from(JSON.stringify(envelope) + '\n'));
        }
    };
    const inputs = [{owner, pointer, role, items, source, ...digestChunks(source())}];
    if (overflow >= 0) inputs.push({owner, pointer: childPointer, parentPointer: pointer, role: 'extensions', source: () => jsonChunks(wrappers[overflow]), ...digestChunks(jsonChunks(wrappers[overflow]))});
    const refs = [];
    await s.withWriter(async w => {
        w.transaction(tx => {
            tx.insertEntity({kind: 'record', key: recordKey(k), ordinal: 0, value: {mapId}});
            if (fileOutput) tx.reserveOutput({recordKey: k, path: 'capture.jsonl', expectedHash: hash('{}\n'), expectedBytes: 3});
            tx.appendIntent({id: 'publish', recordKey: k, files: [
                ...inputs.map((v, ordinal) => ({ordinal, path: payloadPath(s.storeId, owner, v.pointer, v.role, v.expectedHash), hash: v.expectedHash, bytes: v.expectedBytes, payload: {owner, pointer: v.pointer, role: v.role, parentPointer: v.parentPointer, items: v.items}})),
                ...(fileOutput ? [{ordinal: inputs.length, path: 'capture.jsonl', hash: hash('{}\n'), bytes: 3}] : [])
            ]});
        });
        for (const v of inputs) refs.push(await w.publishPayload({...v, source: v.source()}));
        if (fileOutput) await w.publishOutput({recordKey: k, path: 'capture.jsonl', source: [Buffer.from('{}\n')], expectedHash: hash('{}\n'), expectedBytes: 3});
        w.transaction(tx => {
            tx.finishPublication({recordKey: k, operationId: 'publish'});
            if (bind) tx.setProperty({owner, pointer, ordinal: 3, payloadRef: refs[0]});
            tx.putReview({recordKey: k, taskId: 'synthetic', ordinal: 0, value: {examined: 'retained', completed: null}});
        });
    });
    return refs;
}
function state(root) {
    const result = {};
    function walk(dir) { for (const name of fs.readdirSync(dir)) { const file = path.join(dir, name); const st = fs.lstatSync(file); if (st.isDirectory()) walk(file); else result[path.relative(root, file)] = hash(fs.readFileSync(file)); } }
    walk(root); return result;
}
async function rejectedUnchanged(f, expected) {
    const before = state(f.s.root); let writes = 0;
    await assert.rejects(writeFixtureOther(options(f), () => writes++), expected);
    assert.equal(writes, 0); assert.deepEqual(state(f.s.root), before);
    await f.s.withWriter(() => {});
}
async function runChild(args, timeout = 15000) {
    const p = spawn(process.execPath, args, {stdio: ['ignore', 'pipe', 'pipe']}); let stdout = '', stderr = '', expired = false;
    p.stdout.on('data', c => stdout += c); p.stderr.on('data', c => stderr += c);
    const timer = setTimeout(() => { expired = true; p.kill('SIGKILL'); }, timeout);
    const code = await new Promise((resolve, reject) => { p.once('error', reject); p.once('close', resolve); }); clearTimeout(timer);
    assert.equal(expired, false, stderr); assert.equal(code, 0, stderr + stdout); return stdout;
}

// Instrument the public entrypoint without exposing a metrics/test-only API.
// Includes connection PRAGMA statements; excludes SQLite's internal page I/O.
function instrument() {
    const original = {open: fs.openSync, read: fs.readSync, close: fs.closeSync, prepare: DatabaseSync.prototype.prepare};
    const fds = new Map(), metrics = {sql: 0, rows: 0, opens: 0, reads: 0, bytes: 0, readPaths: {}, openPaths: {}};
    fs.openSync = (file, ...args) => {
        const fd = original.open(file, ...args), p = String(file);
        if (/\/(diagnostics|extensions|summaries)\//.test(p) || p.endsWith('/map.json')) { fds.set(fd, p); metrics.opens++; metrics.openPaths[p] = (metrics.openPaths[p] ?? 0) + 1; }
        return fd;
    };
    fs.readSync = (fd, ...args) => {
        const n = original.read(fd, ...args), p = fds.get(fd);
        if (p) { metrics.reads++; metrics.bytes += n; metrics.readPaths[p] = (metrics.readPaths[p] ?? 0) + n; }
        return n;
    };
    fs.closeSync = fd => { fds.delete(fd); return original.close(fd); };
    DatabaseSync.prototype.prepare = function(sql) {
        metrics.sql++; const statement = original.prepare.call(this, sql), get = statement.get, iterate = statement.iterate;
        statement.get = function(...args) { const row = get.apply(this, args); if (row) metrics.rows++; return row; };
        statement.iterate = function*(...args) { for (const row of iterate.apply(this, args)) { metrics.rows++; yield row; } };
        return statement;
    };
    return {metrics, restore() { fs.openSync = original.open; fs.readSync = original.read; fs.closeSync = original.close; DatabaseSync.prototype.prepare = original.prepare; assert.equal(fds.size, 0); }};
}

if (process.argv[2] === 'm2a-scale') {
    const [root, phase, schemaText] = process.argv.slice(3), schema = Number(schemaText), started = performance.now();
    if (phase === 'generate') {
        const f = await fixture(null, schema, root);
        const values = Array.from({length: 4096}, (_, i) => ({key: String(i), raw: 'x'.repeat(128), type: 'other'}));
        await publish(f, values, {overflow: 2048});
        for (let i = 1; i <= 8; i++) {
            const source = function* () { yield Buffer.from('"'); const block = Buffer.alloc(65536, 64 + i); let left = 75 * 1024 * 1024 - 2; while (left) { const n = Math.min(left, block.length); yield block.subarray(0, n); left -= n; } yield Buffer.from('"'); };
            await f.s.withWriter(async w => {
                const ref = await w.publishPayload({owner: recordOwner(key(i)), pointer: '/large', role: 'extensions', evidenceOnly: true, source: source(), ...digestChunks(source())});
                w.transaction(tx => { tx.insertEntity({kind: 'record', key: recordKey(key(i)), ordinal: i, value: {mapId}}); tx.finishPublication({recordKey: key(i), payloadRefs: [ref]}); });
            });
        }
        await f.s.withWriter(w => w.transaction(tx => tx.insertEntity({kind: 'record', key: recordKey(key(9)), ordinal: 9, value: {mapId, status: 'claim'}})));
        const db = new DatabaseSync(database(f.s), {readOnly: true});
        const large = db.prepare("SELECT path,bytes FROM payloads WHERE pointer='/large'").all(); db.close();
        assert.equal(large.length, 8); assert.equal(new Set(large.map(r => r.path)).size, 8);
        const unrelatedBytes = large.reduce((n, r) => { assert.equal(r.bytes, 75 * 1024 * 1024); assert.equal(fs.statSync(path.join(root, r.path)).size, r.bytes); return n + r.bytes; }, 0);
        assert.equal(unrelatedBytes, 600 * 1024 * 1024);
        f.h.close();
        console.log(JSON.stringify({phase, schema, unrelatedBytes, elapsedMs: performance.now() - started, maxRssBytes: process.resourceUsage().maxRSS * 1024}));
    } else {
        const h = await (schema === 1 ? openStore : openCatalog)({root, mode: 'write'}), s = h.evidence ?? h, f = {s, h, schema};
        // Wrap only the dynamic opener to observe the actual read handle's
        // counters. The implementation and native runtime remain unchanged.
        let reader;
        const module = schema === 1 ? '../../tools/replay-store.js' : '../../tools/replay-catalog.js';
        const actual = await import(new URL(module, import.meta.url));
        const opener = schema === 1 ? 'openStore' : 'openCatalog';
        mock.module(new URL(module, import.meta.url).href, {namedExports: {...actual, [opener]: async args => { const handle = await actual[opener](args); reader = handle.evidence ?? handle; return handle; }}});
        const oracleHash = createHash('sha256'); let expectedBytes = 0;
        for (let i = 0; i < 4096; i++) { const line = JSON.stringify({key: String(i), raw: 'x'.repeat(128), type: 'other'}) + '\n'; oracleHash.update(line); expectedBytes += Buffer.byteLength(line); }
        const expectedHash = oracleHash.digest('hex'), runs = [];
        for (const count of [10, 1000]) {
            if (count === 1000) await s.withWriter(w => w.transaction(tx => { for (let i = 10; i < 1000; i++) tx.insertEntity({kind: 'record', key: recordKey(key(i)), ordinal: i, value: {mapId, status: 'claim'}}); }));
            const db = new DatabaseSync(database(s), {readOnly: true}); assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n, count);
            const selected = db.prepare('SELECT path,bytes FROM payloads WHERE owner_key=?').all(recordKey(key())); db.close();
            const beforeDb = hash(fs.readFileSync(database(s))), beforeFiles = {};
            function inventory(dir) { for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name), st = fs.statSync(p); if (st.isDirectory()) inventory(p); else beforeFiles[p] = [st.ino, st.size, st.mtimeMs, st.ctimeMs]; } }
            inventory(path.join(root, 'store-v3'));
            const measured = instrument(), outHash = createHash('sha256'); let bytes = 0, calls = 0, active = 0, maxChunk = 0;
            const at = performance.now();
            try {
                await writeFixtureOther(options(f), async chunk => { assert.equal(++active, 1); maxChunk = Math.max(maxChunk, chunk.length); assert.ok(chunk.length <= 65536); outHash.update(chunk); bytes += chunk.length; calls++; await Promise.resolve(); active--; });
            } finally { measured.restore(); }
            const elapsedMs = performance.now() - at;
            assert.equal(outHash.digest('hex'), expectedHash); assert.equal(bytes, expectedBytes); assert.equal(hash(fs.readFileSync(database(s))), beforeDb);
            for (const [file, identity] of Object.entries(beforeFiles)) { const st = fs.statSync(file); assert.deepEqual([st.ino, st.size, st.mtimeMs, st.ctimeMs], identity); }
            const selectedPaths = selected.map(r => path.join(root, r.path));
            assert.ok(Object.keys(measured.metrics.readPaths).every(p => selectedPaths.includes(p))); assert.equal(measured.metrics.readPaths[path.join(root, 'map.json')], undefined);
            assert.equal(measured.metrics.opens, 3); assert.ok(measured.metrics.bytes <= 8 * selected.reduce((n, r) => n + r.bytes, 0));
            assert.ok(reader); assert.equal(reader.metrics.payloadReadBytes, measured.metrics.bytes); assert.equal(reader.metrics.payloadWriteBytes, 0); assert.equal(reader.metrics.fsWrites, 0);
            runs.push({count, elapsedMs, maxChunk, sinkCalls: calls, outputBytes: bytes, core: {...reader.metrics}, ...measured.metrics});
        }
        for (const name of ['sql', 'rows', 'opens', 'reads', 'bytes', 'sinkCalls', 'outputBytes']) assert.equal(runs[0][name], runs[1][name], name);
        assert.deepEqual(runs[0].core, runs[1].core);
        console.log(JSON.stringify({phase, schema, elapsedMs: performance.now() - started, maxRssBytes: process.resourceUsage().maxRSS * 1024, runs})); h.close();
    }
    assert.ok(process.resourceUsage().maxRSS * 1024 <= 256 * 1024 * 1024, '256 MiB RSS');
}

if (process.argv[2] !== 'm2a-scale') {
test('native serialization, Unicode chunk boundaries, ordering and sequential backpressure', async () => {
    const values = [JSON.parse('{"n":1e400}'), {raw: 'x'.repeat(21836) + '😀Á中'.repeat(30000), unknown: [0, false, null, '\\"\n']}, {}, {}];
    let active = 0, calls = 0; const parts = [];
    await writeOtherEntries(values, async c => { assert.ok(c.length <= 65536); assert.equal(++active, 1); await new Promise(r => setImmediate(r)); parts.push(c); calls++; active--; });
    assert.equal(Buffer.concat(parts).toString(), oracle(values)); assert.ok(calls > 6);
    await assert.rejects(writeOtherEntries(values, () => { throw null; }), e => e === null);
    let pulled = 0;
    async function* entries() { pulled++; yield {}; pulled++; yield {}; }
    await assert.rejects(writeOtherEntries(entries(), () => Promise.reject(Error('sink'))), /sink/); assert.equal(pulled, 1);
});

test('Writable completion/backpressure and EPIPE propagate without an unhandled error', async () => {
    let bytes = '';
    const stream = new Writable({highWaterMark: 1, write(chunk, encoding, done) { setImmediate(() => { bytes += chunk; done(); }); }});
    await writeOtherToStream([{raw: 'Á'}], stream); assert.equal(bytes, oracle([{raw: 'Á'}])); assert.equal(stream.listenerCount('error'), 0);
    const broken = new Writable({write(c, e, done) { done(Object.assign(Error('broken pipe'), {code: 'EPIPE'})); }});
    await assert.rejects(writeOtherToStream([{}], broken), {code: 'EPIPE'}); assert.equal(broken.listenerCount('error'), 0);
});

test('isolated v2 CLI parity, pretty/compact manifests and SQLite-free imports', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'pain-gain-other-cli-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.cpSync(new URL('../../tools/', import.meta.url), path.join(root, 'tools'), {recursive: true});
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}'); fs.mkdirSync(path.join(root, 'replay_logs'));
    // Fixed committed baseline; no production evidence is copied or read.
    fs.writeFileSync(path.join(root, 'tools/legacy.js'), execFileSync('git', ['show', '84753ca921367cc4252aab9c3c1996171d2ac8c1:tools/replay-logs.js']));
    const deny = 'data:text/javascript,' + encodeURIComponent("import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLITE_FORBIDDEN');return n(s,c)}})");
    const invoke = (name, args) => spawnSync(process.execPath, ['--import', deny, path.join(root, 'tools', name), ...args], {encoding: 'utf8'});
    for (const space of [undefined, 2]) for (const values of [[], [{raw: 'Á😀\n', x: null, zero: 0, no: false}, {raw: 'repeat'}, {raw: 'repeat'}]]) {
        const manifest = {version: 2, records: [{...key(), otherEntries: values}], maps: [], replays: [], retired: []};
        fs.writeFileSync(path.join(root, 'replay_logs/manifest.json'), JSON.stringify(manifest, null, space).replace('"zero":0', '"zero":1e400').replace('"zero": 0', '"zero": 1e400'));
        for (const args of [['other', replayId, key().fingerprint], ['other', replayId, key(9).fingerprint], ['other', 'bad']]) {
            const before = state(path.join(root, 'replay_logs')), old = invoke('legacy.js', args), current = invoke('replay-logs.js', args);
            assert.equal(current.status, old.status); assert.equal(current.stdout, old.stdout); assert.equal(current.stderr, old.stderr); assert.deepEqual(state(path.join(root, 'replay_logs')), before);
            if (args[2] === key().fingerprint) { const parsed = JSON.parse(fs.readFileSync(path.join(root, 'replay_logs/manifest.json'))); assert.equal(current.stdout, oracle(parsed.records[0].otherEntries)); assert.equal(current.status, 0); }
            else assert.equal(current.status, 1);
        }
    }
});

test('v2 CLI reports a broken stdout pipe with nonzero exit', {timeout: 10000}, async t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'pain-gain-other-cli-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.cpSync(new URL('../../tools/', import.meta.url), path.join(root, 'tools'), {recursive: true});
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}'); fs.mkdirSync(path.join(root, 'replay_logs'));
    fs.writeFileSync(path.join(root, 'replay_logs/manifest.json'), JSON.stringify({version: 2, records: [{...key(), otherEntries: [{raw: 'x'.repeat(1000000)}]}], maps: [], replays: []}));
    const p = spawn(process.execPath, [path.join(root, 'tools/replay-logs.js'), 'other', replayId, key().fingerprint], {stdio: ['ignore', 'pipe', 'pipe']});
    t.after(() => { if (p.exitCode === null) p.kill('SIGKILL'); });
    let errors = ''; p.stderr.on('data', c => errors += c); p.stdout.destroy();
    const code = await new Promise((resolve, reject) => { p.once('error', reject); p.once('close', resolve); });
    assert.equal(code, 1); assert.match(errors, /EPIPE|broken pipe/i);
});

for (const schema of [1, 2]) test(`schema ${schema}: ordinary/overflow/exact root selection, output parity, repeat reads and empty evidence`, async t => {
    for (const empty of [false, true]) {
        const f = await fixture(t, schema), values = empty ? [] : [{raw: 'Á😀\n', zero: 0, unknown: {no: false, n: null}}, {raw: 'overflow'}, {raw: 'overflow'}];
        await publish(f, values, {overflow: empty ? -1 : 1, fileOutput: !empty});
        // Earlier unrelated diagnostics are pinned but never emitted.
        await f.s.withWriter(async w => {
            const source = () => diagnosticChunks([{raw: 'not selected'}]), expected = digestChunks(source()), p = '/aaa';
            w.transaction(tx => tx.appendIntent({id: 'extra', recordKey: key(), files: [{ordinal: 0, path: payloadPath(f.s.storeId, recordOwner(key()), p, 'diagnostics', expected.expectedHash), hash: expected.expectedHash, bytes: expected.expectedBytes, payload: {owner: recordOwner(key()), pointer: p, role: 'diagnostics', items: 1}}, ...(!empty ? [{ordinal: 1, path: 'capture.jsonl', hash: hash('{}\n'), bytes: 3}] : [])]}));
            if (!empty) await w.publishOutput({recordKey: key(), path: 'capture.jsonl', source: [Buffer.from('{}\n')], expectedHash: hash('{}\n'), expectedBytes: 3});
            await w.publishPayload({owner: recordOwner(key()), pointer: p, role: 'diagnostics', source: source(), items: 1, ...expected}); w.transaction(tx => tx.finishPublication({recordKey: key(), operationId: 'extra'}));
        });
        const before = state(f.s.root); assert.equal(await output(f), oracle(values)); assert.equal(await output(f), oracle(values)); assert.deepEqual(state(f.s.root), before);
    }
});

for (const [name, overrides, expected] of [
    ['ordinal gap', {bytes: Buffer.from('{"ordinal":0,"wrapper":{}}\n{"ordinal":2,"wrapper":{}}\n'), items: 2}, 'INVALID_ARTIFACT'],
    ['late bad JSON', {bytes: Buffer.from('{"ordinal":0,"wrapper":{}}\n{broken}\n')}, undefined],
    ['late bad UTF8', {bytes: Buffer.concat([Buffer.from('{"ordinal":0,"wrapper":{}}\n'), Buffer.from([255, 10])])}, undefined],
    ['null count', {items: null}, 'INVALID_ARTIFACT'], ['wrong count', {items: 2}, 'INVALID_ARTIFACT'],
    ['nonfinite', {bytes: Buffer.from('{"ordinal":0,"wrapper":{}}\n{"ordinal":1,"wrapper":{"n":1e400}}\n'), items: 2}, 'INVALID_JSON'],
    ['scalar', {bytes: Buffer.from('{"ordinal":0,"wrapper":{}}\n{"ordinal":1,"wrapper":false}\n'), items: 2}, 'INVALID_JSON'],
    ['missing binding', {bind: false}, 'INVALID_REFERENCE'], ['wrong role', {role: 'summaries'}, 'INVALID_REFERENCE'],
    ['missing overflow', {bytes: Buffer.from('{"ordinal":0,"wrapper":{}}\n{"ordinal":1,"wrapperRef":"/missing"}\n'), items: 2}, 'INVALID_REFERENCE'],
]) test(`preflight ${name}: no output, evidence/metadata unchanged`, async t => {
    const f = await fixture(t); await publish(f, [{raw: 'valid'}], overrides); await rejectedUnchanged(f, expected ? {code: expected} : undefined);
});

test('oversized envelope/overflow and expanded encoded wrapper reject before output', async t => {
    for (const [raw, overflow] of [['x'.repeat(1100000), -1], ['x'.repeat(1100000), 1], ['\0'.repeat(180000), 1]]) {
        const f = await fixture(t); await publish(f, [{raw: 'first'}, {raw}], {overflow}); await rejectedUnchanged(f, {code: 'RESOURCE_LIMIT'});
    }
});

test('unavailable and invalid selected artifacts, bindings, active intents and roots fail closed', async t => {
    for (const mode of ['hash', 'missing', 'inline', 'null', 'pending', 'publish', 'cleanup', 'absent', 'retired', 'symlink']) {
        const f = await fixture(t), refs = await publish(f, [{}]);
        if (mode === 'hash') { const p = path.join(f.s.root, refs[0].path), b = fs.readFileSync(p); b[1] = 120; fs.writeFileSync(p, b); }
        if (mode === 'missing') fs.unlinkSync(path.join(f.s.root, refs[0].path));
        if (mode === 'symlink') { const p = path.join(f.s.root, refs[0].path); fs.renameSync(p, p + '.saved'); fs.symlinkSync(p + '.saved', p); }
        if (['inline', 'null'].includes(mode)) await f.s.withWriter(w => w.transaction(tx => tx.setProperty({owner: recordOwner(key()), pointer: '/otherEntries', ordinal: 3, value: mode === 'null' ? null : []})));
        if (['pending', 'absent', 'retired'].includes(mode)) {
            const db = new DatabaseSync(database(f.s));
            if (mode === 'pending') db.exec("UPDATE payloads SET state='pending'");
            else { db.exec('PRAGMA foreign_keys=OFF; DELETE FROM records'); if (mode === 'retired') db.prepare('INSERT INTO retired VALUES (?,?,?,?,?)').run('log', replayId, key().fingerprint, recordKey(key()), 0); }
            db.close();
        }
        if (['publish', 'cleanup'].includes(mode)) await f.s.withWriter(w => w.transaction(tx => { if (mode === 'cleanup') tx.setStatus({recordKey: key(), status: 'done'}); tx.appendIntent({id: 'blocked', recordKey: key(), phase: mode, files: []}); }));
        await rejectedUnchanged(f);
    }
    await assert.rejects(writeFixtureOther({...options(await fixture(t)), schemaVersion: 3}, () => {}), {code: 'UNSUPPORTED_STORE'});
    await assert.rejects(writeFixtureOther({root: process.cwd(), schemaVersion: 1, ...key()}, () => {}), {code: 'UNSAFE_PATH'});
    await assert.rejects(writeFixtureOther({root: 'unused', schemaVersion: 1, ...key(), replayId: 'bad'}, () => {}), {code: 'INVALID_IDENTITY'});
});

test('explicit iterator pointer cannot select child or non-diagnostic root; default remains compatible', async t => {
    const f = await fixture(t); await publish(f, [{}], {overflow: 0});
    await f.s.withReadSnapshot({recordKeys: [key()]}, async view => {
        const read = async options => { const values = []; for await (const v of iterateDiagnostics(view, key(), options)) values.push(v.value); return values; };
        assert.deepEqual(await read(), [{}]); assert.deepEqual(await read({pointer: '/otherEntries'}), [{}]);
        await assert.rejects(read({pointer: '/otherEntries/overflow'}), {code: 'INVALID_REFERENCE'});
    });
});

test('pending output, corrupted late overflow and safe-integer item counts reject without writes', async t => {
    for (const mode of ['output', 'overflow-hash', 'overflow-json', 'big-count', 'wrong-binding']) {
        const f = await fixture(t), refs = await publish(f, [{raw: 'first'}, {raw: 'last'}], {overflow: 1, fileOutput: true});
        const db = new DatabaseSync(database(f.s));
        if (mode === 'output') db.exec("UPDATE outputs SET state='pending'");
        if (mode === 'big-count') db.exec('UPDATE payloads SET items=9007199254740993 WHERE parent IS NULL');
        if (mode === 'wrong-binding') db.exec("UPDATE properties SET payload_pointer='/otherEntries/overflow' WHERE pointer='/otherEntries'");
        if (mode.startsWith('overflow')) {
            const file = path.join(f.s.root, refs[1].path), bytes = fs.readFileSync(file); bytes[0] = 120; fs.writeFileSync(file, bytes);
            if (mode === 'overflow-json') db.prepare('UPDATE payloads SET hash=? WHERE pointer=?').run(hash(bytes), refs[1].pointer);
        }
        db.close(); await rejectedUnchanged(f);
    }
});

test('hot journal is recovery-required and read attempts preserve database/journal bytes', async t => {
    const f = await fixture(t); await publish(f, [{}]); f.h.close();
    const code = `import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA synchronous=FULL;PRAGMA cache_size=8;BEGIN IMMEDIATE');const q=db.prepare('INSERT INTO properties VALUES (?,?,?,?,?,NULL)');for(let i=0;i<1000;i++)q.run('root','root','/crash'+i,i,JSON.stringify('x'.repeat(60000)));process.kill(process.pid,'SIGKILL');`;
    const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', code, database(f.s)], {timeout: 15000}); assert.equal(crashed.signal, 'SIGKILL');
    assert.ok(fs.statSync(database(f.s) + '-journal').size > 0);
    const before = state(f.s.root); let calls = 0;
    await assert.rejects(writeFixtureOther(options(f), () => calls++), {code: 'RECOVERY_REQUIRED'});
    assert.equal(calls, 0); assert.deepEqual(state(f.s.root), before);
});

test('reading a log does not reconcile done logs or retire score-done evidence', async t => {
    const f = await fixture(t); await publish(f, [{}]); const score = {...key(1), collection: 'score'};
    await f.s.withWriter(async w => {
        w.transaction(tx => { tx.insertEntity({kind: 'record', key: recordKey(score), ordinal: 1}); tx.reserveOutput({recordKey: score, path: 'score.response', expectedHash: hash('{}'), expectedBytes: 2}); tx.appendIntent({id: 'score', recordKey: score, files: [{ordinal: 0, path: 'score.response', hash: hash('{}'), bytes: 2}]}); });
        await w.publishOutput({recordKey: score, path: 'score.response', source: [Buffer.from('{}')], expectedHash: hash('{}'), expectedBytes: 2});
        w.transaction(tx => { tx.finishPublication({recordKey: score, operationId: 'score'}); tx.setStatus({recordKey: score, status: 'done'}); tx.setStatus({recordKey: key(), status: 'done'}); });
    });
    const before = state(f.s.root); assert.equal(await output(f), '{}\n'); assert.deepEqual(state(f.s.root), before);
    assert.equal(f.s.getRecord(score).status, 'done'); assert.equal(f.s.getRecord(key()).status, 'done');
});

test('slow sink releases lock; authorized child cleanup preserves pinned root/overflow, next read unavailable', async t => {
    for (const overflow of [-1, 1]) {
        const f = await fixture(t), values = [{raw: 'one'}, {raw: 'two'}], refs = await publish(f, values, {overflow}); let cleaned = false; const parts = [];
        const code = `import {openStore} from ${JSON.stringify(new URL('../../tools/replay-store.js', import.meta.url).href)};const s=await openStore({root:process.argv[1],mode:'write'}),k=JSON.parse(process.argv[2]),refs=JSON.parse(process.argv[3]);await s.withWriter(async w=>{w.transaction(tx=>{tx.setStatus({recordKey:k,status:'done'});tx.appendIntent({id:'cleanup',recordKey:k,phase:'cleanup',files:refs.map((r,ordinal)=>({ordinal,path:r.path,hash:r.hash,bytes:r.bytes}))});});for(let ordinal=0;ordinal<refs.length;ordinal++)await w.deleteFile({operationId:'cleanup',ordinal});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'cleanup',retire:true}));});s.close();`;
        await writeFixtureOther(options(f), async c => {
            if (!cleaned) { cleaned = true; await runChild(['--input-type=module', '-e', code, f.s.root, JSON.stringify(key()), JSON.stringify(refs)]); }
            parts.push(c);
        });
        assert.equal(Buffer.concat(parts).toString(), oracle(values)); assert.equal(f.s.getRecord(key()).kind, 'retired'); await rejectedUnchanged(f, {code: 'UNAVAILABLE'});
    }
});

test('sink, setup, interrupted reads and close errors release all handles and preserve primary null', async t => {
    const f = await fixture(t); await publish(f, [{raw: 'one'}, {raw: 'two'}], {overflow: 1});
    for (const failure of ['sink', 'null', 'fstat', 'read', 'close', 'null-close']) {
        const before = state(f.s.root), native = {open: fs.openSync, close: fs.closeSync, stat: fs.fstatSync, read: fs.readSync};
        const owned = new Set(); let closes = 0, injected = false;
        fs.openSync = (file, ...args) => { const fd = native.open(file, ...args); if (String(file).includes('/diagnostics/') || String(file).includes('/extensions/') || String(file).endsWith('/map.json')) owned.add(fd); return fd; };
        fs.closeSync = fd => { const ours = owned.delete(fd); native.close(fd); if (ours) { closes++; if (failure.includes('close') && !injected) { injected = true; throw Error('close'); } } };
        fs.fstatSync = fd => { if (owned.has(fd) && failure === 'fstat' && !injected) { injected = true; throw Error('inspect'); } return native.stat(fd); };
        fs.readSync = (fd, ...args) => { if (owned.has(fd) && failure === 'read' && !injected) { injected = true; throw Error('read'); } return native.read(fd, ...args); };
        try {
            let calls = 0;
            await assert.rejects(writeFixtureOther(options(f), () => { calls++; if (failure.startsWith('null')) throw null; if (failure === 'sink') throw Error('sink'); }), e => failure.startsWith('null') ? e === null : e instanceof Error);
            if (['fstat', 'read'].includes(failure)) assert.equal(calls, 0);
            assert.equal(owned.size, 0); assert.ok(closes > 0);
        } finally { Object.assign(fs, {openSync: native.open, closeSync: native.close, fstatSync: native.stat, readSync: native.read}); }
        assert.deepEqual(state(f.s.root), before); await f.s.withWriter(() => {}); assert.equal(await output(f), oracle([{raw: 'one'}, {raw: 'two'}]));
    }
});

test('I/O failure during emission rejects after a prefix and permits a subsequent complete read', async t => {
    const f = await fixture(t), values = [{raw: 'x'.repeat(80000)}, {raw: 'y'.repeat(80000)}]; await publish(f, values);
    const before = state(f.s.root), open = fs.openSync, read = fs.readSync, close = fs.closeSync, handles = new Set(); let writes = 0, failed = false;
    fs.openSync = (p, ...args) => { const fd = open(p, ...args); if (String(p).includes('/diagnostics/')) handles.add(fd); return fd; };
    fs.closeSync = fd => { handles.delete(fd); return close(fd); };
    fs.readSync = (fd, ...args) => { if (handles.has(fd) && writes && !failed) { failed = true; throw Error('interrupted emission'); } return read(fd, ...args); };
    try { await assert.rejects(writeFixtureOther(options(f), () => writes++), /interrupted emission/); assert.ok(writes > 0); assert.equal(handles.size, 0); }
    finally { fs.openSync = open; fs.readSync = read; fs.closeSync = close; }
    assert.deepEqual(state(f.s.root), before); assert.equal(await output(f), oracle(values));
});

for (const schema of [1, 2]) test(`M2a schema ${schema} 600 MiB streaming gate at exactly 10/1000 records`, {timeout: 100000}, async t => {
    const root = fs.mkdtempSync(prefix); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const results = [];
    for (const phase of ['generate', 'operations']) {
        const text = await runChild(['--experimental-test-module-mocks', '--max-old-space-size=192', new URL(import.meta.url).pathname, 'm2a-scale', root, phase, String(schema)], phase === 'generate' ? 60000 : 30000);
        const result = JSON.parse(text.trim()); assert.ok(result.maxRssBytes <= 256 * 1024 * 1024); results.push(result);
    }
    assert.equal(results[0].unrelatedBytes, 629145600); t.diagnostic(JSON.stringify(results));
});
}

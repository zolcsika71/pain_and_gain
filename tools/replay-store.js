// ADR 0006 M1: isolated synthetic core, deliberately not used by replay tools.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { LIMITS, fail, inlineJson, payloadPath } from './replay-store-payloads.js';
import { catalogDefinition } from './replay-catalog.js';

const MARKER = '.storage-v3-fixture';
const MAX_INTEGER = 9_223_372_036_854_775_807n;
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{24}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const safeNumber = value => typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
const normalizeRow = row => row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safeNumber(v)]));

function text(value, name) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > LIMITS.inline) fail('RESOURCE_LIMIT', `Invalid/oversized ${name}`);
    return value;
}
function integer(value, name) {
    if ((typeof value !== 'bigint' && !Number.isSafeInteger(value)) || value < 0 || BigInt(value) > MAX_INTEGER) fail('RESOURCE_LIMIT', `Invalid ${name}`);
    return value;
}
export function recordKey(key) {
    if (!key || !['log', 'score'].includes(key.collection) || !ID.test(key.replayId) || !HEX.test(key.fingerprint)) fail('INVALID_IDENTITY', 'Invalid record identity');
    return JSON.stringify([key.collection, key.replayId, key.fingerprint]);
}
export const recordOwner = key => ({ kind: 'record', key: recordKey(key) });
const parseKey = key => { const [collection, replayId, fingerprint] = JSON.parse(key); const result = { collection, replayId, fingerprint }; recordKey(result); return result; };
function ownerTuple(owner) {
    if (!owner || !['root','collection','map','replay','record','review','retired'].includes(owner.kind)) fail('INVALID_IDENTITY', 'Invalid property owner');
    text(owner.key, 'owner key'); return [owner.kind, owner.key];
}
function rowJson(row) {
    // SQLite integers remain BigInt above JS's safe range. Budget their decimal
    // representation without changing the returned number type.
    return inlineJson(Object.fromEntries(Object.entries(row).map(([k,v]) => [k,typeof v === 'bigint' ? v.toString() : v])));
}
function rowBudget(row) {
    rowJson(row);
    return row;
}
function pointer(value) { text(value, 'JSON pointer'); if (value && !/^(?:\/(?:[^~]|~[01])*)+$/.test(value)) fail('INVALID_REFERENCE', 'Invalid JSON pointer'); return value; }

export function runtimeCapabilities() {
    const [major, minor, patch] = process.versions.node.split('.').map(Number);
    if (major !== 24 || minor < 19 || (minor === 19 && patch < 0) || process.platform !== 'darwin' || typeof backup !== 'function') fail('UNSUPPORTED_RUNTIME', 'M1 requires qualified Node 24.19+ on local macOS APFS');
    const db = new DatabaseSync(':memory:');
    try {
        const stmt = db.prepare('SELECT sqlite_version() AS version');
        const version = stmt.get().version;
        const n = version.split('.').map(Number);
        if (n[0] < 3 || (n[0] === 3 && (n[1] < 53 || (n[1] === 53 && n[2] < 3))) || typeof stmt.iterate !== 'function') fail('UNSUPPORTED_RUNTIME', 'SQLite 3.53.3+ required');
        return { node: process.version, sqlite: version, filesystem: 'declared-local-apfs', backup: true };
    } finally { db.close(); }
}

function fixtureRoot(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) fail('UNSAFE_PATH', 'Explicit canonical temporary root required');
    const tmp = fs.realpathSync(os.tmpdir());
    if (path.dirname(root) !== tmp || !path.basename(root).startsWith('pain-gain-store-v3-fixture-')) fail('UNSAFE_PATH', 'M1 only permits direct temporary fixture roots');
    const st = fs.lstatSync(root);
    if (!st.isDirectory() || st.isSymbolicLink() || fs.realpathSync(root) !== root) fail('UNSAFE_PATH', 'Unsafe fixture root');
    return root;
}
function safePath(root, relative, mkdir = false) {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(x => !x || x === '.' || x === '..')) fail('UNSAFE_PATH', 'Unsafe store-relative path');
    text(relative, 'relative path'); let current = root;
    const parts = relative.split('/');
    for (const [i, component] of parts.entries()) {
        current = path.join(current, component);
        let st; try { st = fs.lstatSync(current); } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            if (mkdir && i < parts.length - 1) { fs.mkdirSync(current, { mode: 0o700 }); syncDir(path.dirname(current)); st = fs.lstatSync(current); }
        }
        if (st && (st.isSymbolicLink() || (i < parts.length - 1 ? !st.isDirectory() : !st.isFile()))) fail('UNSAFE_PATH', 'Unsafe path component');
        if (!st && i < parts.length - 1 && !mkdir) fail('UNAVAILABLE', 'Missing path component');
    }
    return current;
}
function syncDir(directory) { const fd = fs.openSync(directory, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function boundedFile(root, relative, budget) {
    const file = safePath(root, relative); const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { const st = fs.fstatSync(fd); if (!st.isFile() || st.size > budget) fail('RESOURCE_LIMIT', `${relative} exceeds budget`); return fs.readFileSync(fd, 'utf8'); }
    finally { fs.closeSync(fd); }
}
function descriptor(root, schemaVersion = 1) {
    const marker = JSON.parse(boundedFile(root, MARKER, 16_384));
    if (marker.root !== root || marker.filesystem !== 'local-apfs' || !UUID.test(marker.storeId)) fail('UNSAFE_PATH', 'Fixture marker mismatch');
    const d = JSON.parse(boundedFile(root, 'manifest.json', 16_384));
    if (d.version !== 3 || d.schemaVersion !== schemaVersion || (schemaVersion === 2 && d.catalogVersion !== 1) || d.payloadVersion !== 1 || d.storage !== 'sqlite-sidecars' || d.storeId !== marker.storeId || d.database !== `store-v3/${d.storeId}/index.sqlite`) fail('UNSUPPORTED_STORE', 'Descriptor/store identity mismatch');
    const database = safePath(root, d.database);
    if (!fs.existsSync(database)) fail('UNAVAILABLE', 'Missing database; open never creates it');
    for (const suffix of ['-journal','-wal','-shm']) {
        if (fs.existsSync(database + suffix)) safePath(root, d.database + suffix);
    }
    return d;
}
function writeExclusive(file, bytes) { const fd = fs.openSync(file, 'wx', 0o600); try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } syncDir(path.dirname(file)); }

// Fully written lock owner, hard-link publication, inode-checked stale removal.
async function locked(root, action, metrics) {
    const lock = path.join(root, '.manifest.lock'), token = randomUUID(), owner = `${lock}.${token}.tmp`;
    writeExclusive(owner, JSON.stringify({ pid: process.pid, token })); let acquired = false;
    try {
        for (let attempt = 0; attempt < 50; attempt++) {
            try { fs.linkSync(owner, lock); acquired = true; metrics.locks++; break; }
            catch (error) {
                if (error.code !== 'EEXIST') throw error;
                let st; try { st = fs.lstatSync(lock); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
                if (!st.isFile() || st.isSymbolicLink() || st.size > 16_384) fail('UNSAFE_LOCK', 'Unsafe lock owner');
                const raw = boundedFile(root, '.manifest.lock', 16_384); let abandoned = false;
                if (raw) {
                    let other; try { other = JSON.parse(raw); } catch { fail('UNSAFE_LOCK', 'Malformed nonempty owner'); }
                    if (!Number.isSafeInteger(other.pid) || other.pid <= 0 || typeof other.token !== 'string' || !other.token) fail('UNSAFE_LOCK', 'Invalid lock owner');
                    if (Date.now() - st.mtimeMs > 30_000) try { process.kill(other.pid, 0); } catch (e) { if (e.code === 'ESRCH') abandoned = true; else if (e.code !== 'EPERM') throw e; }
                } else if (Date.now() - st.mtimeMs > 30_000) abandoned = true;
                if (abandoned && fs.lstatSync(lock).ino === st.ino) { fs.unlinkSync(lock); continue; }
                await sleep(100);
            }
        }
        if (!acquired) fail('LOCKED', 'Fixture store is locked; retry after owner exits');
        return await action();
    } finally {
        if (acquired) {
            const current = JSON.parse(boundedFile(root, '.manifest.lock', 16_384));
            if (current.token === token) fs.unlinkSync(lock);
        }
        fs.unlinkSync(owner);
    }
}

const SCHEMA = `
CREATE TABLE store_meta (store_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, payload_version INTEGER NOT NULL, generation INTEGER NOT NULL CHECK(generation>=0), receipt TEXT CHECK(length(CAST(receipt AS BLOB))<=65536)) STRICT;
CREATE TABLE collections (key TEXT PRIMARY KEY, present INTEGER NOT NULL CHECK(present IN (0,1)), ordinal INTEGER NOT NULL CHECK(ordinal>=0)) STRICT;
CREATE TABLE maps (key TEXT PRIMARY KEY, path TEXT UNIQUE, hash TEXT, status TEXT, ordinal INTEGER NOT NULL CHECK(ordinal>=0)) STRICT;
CREATE INDEX map_status ON maps(status);
CREATE TABLE replays (key TEXT PRIMARY KEY, map_id TEXT REFERENCES maps(key), build_id TEXT, status TEXT, ordinal INTEGER NOT NULL CHECK(ordinal>=0)) STRICT;
CREATE INDEX replay_map ON replays(map_id); CREATE INDEX replay_status ON replays(status);
CREATE TABLE records (collection TEXT NOT NULL CHECK(collection IN ('log','score')), replay_id TEXT NOT NULL REFERENCES replays(key), fingerprint TEXT NOT NULL, key TEXT NOT NULL UNIQUE, map_id TEXT REFERENCES maps(key), build_id TEXT, status TEXT NOT NULL,
 output_path TEXT, output_hash TEXT, ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 PRIMARY KEY(collection,replay_id,fingerprint), CHECK((collection='log' AND status IN ('pending','claim','done','waiting')) OR (collection='score' AND status IN ('pending','claim','done','retiring')))) STRICT;
CREATE INDEX record_page ON records(collection,ordinal,key); CREATE INDEX record_replay ON records(collection,replay_id,ordinal,key); CREATE INDEX record_status ON records(collection,status,ordinal,key);
CREATE INDEX record_map ON records(map_id); CREATE INDEX record_build ON records(build_id); CREATE INDEX record_output_hash ON records(output_hash);
CREATE TABLE reviews (collection TEXT NOT NULL, replay_id TEXT NOT NULL, fingerprint TEXT NOT NULL, task TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>=0), value TEXT CHECK(length(CAST(value AS BLOB))<=65536), owner_key TEXT NOT NULL UNIQUE, PRIMARY KEY(collection,replay_id,fingerprint,task), FOREIGN KEY(collection,replay_id,fingerprint) REFERENCES records ON DELETE CASCADE) STRICT;
CREATE INDEX review_page ON reviews(collection,replay_id,fingerprint,ordinal,task);
CREATE TABLE retired (collection TEXT NOT NULL CHECK(collection IN ('log','score')), replay_id TEXT NOT NULL, fingerprint TEXT NOT NULL, key TEXT NOT NULL UNIQUE, ordinal INTEGER NOT NULL CHECK(ordinal>=0), PRIMARY KEY(collection,replay_id,fingerprint)) STRICT;
CREATE TABLE payloads (owner_kind TEXT NOT NULL, owner_key TEXT NOT NULL, pointer TEXT NOT NULL, parent TEXT, role TEXT NOT NULL CHECK(role IN ('diagnostics','summaries','extensions')), path TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0), items INTEGER CHECK(items>=0), state TEXT NOT NULL CHECK(state IN ('pending','ready')), ordinal INTEGER NOT NULL CHECK(ordinal>=0), encoding TEXT NOT NULL CHECK((role='diagnostics' AND encoding='jsonl-v1') OR (role!='diagnostics' AND encoding='json-v1')), PRIMARY KEY(owner_kind,owner_key,pointer), FOREIGN KEY(owner_kind,owner_key,parent) REFERENCES payloads(owner_kind,owner_key,pointer)) STRICT;
CREATE INDEX payload_parent ON payloads(owner_kind,owner_key,parent,ordinal,pointer);
CREATE INDEX payload_role ON payloads(owner_kind,owner_key,parent,role,ordinal,pointer);
CREATE TABLE properties (owner_kind TEXT NOT NULL, owner_key TEXT NOT NULL, pointer TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>=0), value TEXT CHECK(length(CAST(value AS BLOB))<=65536), payload_pointer TEXT, PRIMARY KEY(owner_kind,owner_key,pointer), CHECK((value IS NULL)!=(payload_pointer IS NULL)), FOREIGN KEY(owner_kind,owner_key,payload_pointer) REFERENCES payloads(owner_kind,owner_key,pointer)) STRICT;
CREATE INDEX property_page ON properties(owner_kind,owner_key,ordinal,pointer);
CREATE TABLE outputs (path TEXT PRIMARY KEY, collection TEXT NOT NULL, replay_id TEXT NOT NULL, fingerprint TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0), state TEXT NOT NULL CHECK(state IN ('pending','ready')), UNIQUE(collection,replay_id,fingerprint), FOREIGN KEY(collection,replay_id,fingerprint) REFERENCES records ON DELETE CASCADE) STRICT;
CREATE INDEX output_hash ON outputs(hash);
CREATE TABLE operations (id TEXT PRIMARY KEY, collection TEXT NOT NULL, replay_id TEXT NOT NULL, fingerprint TEXT NOT NULL, phase TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>=0), FOREIGN KEY(collection,replay_id,fingerprint) REFERENCES records ON DELETE CASCADE) STRICT;
CREATE INDEX operation_page ON operations(ordinal,id); CREATE INDEX operation_record ON operations(collection,replay_id,fingerprint,phase);
CREATE TABLE operation_files (operation_id TEXT NOT NULL REFERENCES operations ON DELETE CASCADE, ordinal INTEGER NOT NULL CHECK(ordinal>=0), path TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0), state TEXT NOT NULL, original_present INTEGER NOT NULL CHECK(original_present IN (0,1)), PRIMARY KEY(operation_id,ordinal), UNIQUE(operation_id,path)) STRICT;
CREATE INDEX operation_file_path ON operation_files(path);
CREATE TABLE migration_progress (source_hash TEXT PRIMARY KEY, ordinal INTEGER NOT NULL CHECK(ordinal>=0), receipt TEXT CHECK(length(CAST(receipt AS BLOB))<=65536)) STRICT;
`;

function connection(root, d, write, metrics, create = false) {
    const file = safePath(root, d.database);
    if (!write && fs.existsSync(file + '-journal') && fs.statSync(file + '-journal').size > 0) fail('RECOVERY_REQUIRED', 'Read-only open cannot recover a journal; invoke an isolated writer');
    const db = new DatabaseSync(file, { readOnly: !write }); metrics.connections++;
    try {
        if (create) db.exec('PRAGMA journal_mode=DELETE');
        db.exec('PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA mmap_size=0; PRAGMA cache_size=-8192; PRAGMA busy_timeout=5000;');
        for (const [pragma, expected] of Object.entries({ journal_mode:'delete', synchronous:2, foreign_keys:1, mmap_size:0, cache_size:-8192, busy_timeout:5000 })) {
            const value = Object.values(db.prepare(`PRAGMA ${pragma}`).get())[0];
            if (value !== expected) fail('UNSUPPORTED_RUNTIME', `SQLite ${pragma} did not take effect`);
        }
        if (!create) {
            const meta = db.prepare('SELECT store_id,schema_version,payload_version FROM store_meta').get();
            if (!meta || meta.store_id !== d.storeId || meta.schema_version !== d.schemaVersion || meta.payload_version !== 1) fail('UNSUPPORTED_STORE', 'Database identity/version mismatch');
            if (d.schemaVersion === 2 && db.prepare('SELECT catalog_version FROM store_meta').get().catalog_version !== 1) fail('UNSUPPORTED_STORE','Catalog version mismatch');
        }
        return db;
    } catch (e) { db.close(); throw e; }
}

export const createFixtureStore = options => createVersionedFixture(options, 1);
// Typed schema-2 entry points; no caller-supplied schema or raw SQL hook.
export const createCatalogFoundation = options => createVersionedFixture(options, 2);
export const openCatalogFoundation = options => openVersionedStore(options, 2);
async function createVersionedFixture({ root, filesystem, fault } = {}, schemaVersion) {
    runtimeCapabilities(); root = fixtureRoot(root);
    if (filesystem !== 'local-apfs' || fs.readdirSync(root).length) fail('UNSAFE_PATH', 'Empty local-apfs fixture root required');
    // Exercise the declared primitives in this fixture, not elsewhere.
    const storeId = randomUUID(); writeExclusive(path.join(root, MARKER), JSON.stringify({ root, storeId, filesystem }));
    const probe = path.join(root, '.probe'); writeExclusive(probe, 'fixture');
    fs.linkSync(probe, probe + '.link'); fs.renameSync(probe + '.link', probe + '.renamed'); syncDir(root);
    const fd = fs.openSync(probe, 'r'); fs.unlinkSync(probe); try { if (fs.readFileSync(fd, 'utf8') !== 'fixture') fail('UNSUPPORTED_FILESYSTEM', 'Open-after-unlink failed'); } finally { fs.closeSync(fd); }
    fs.unlinkSync(probe + '.renamed'); syncDir(root);
    const d = { version:3, storage:'sqlite-sidecars', schemaVersion, payloadVersion:1, storeId, database:`store-v3/${storeId}/index.sqlite`, ...(schemaVersion === 2 ? {catalogVersion:1} : {}) };
    const file = safePath(root, d.database, true); writeExclusive(file, Buffer.alloc(0));
    const metrics = newMetrics();
    await locked(root, async () => {
        const db = connection(root, d, true, metrics, true);
        try {
            db.exec(`BEGIN IMMEDIATE; ${SCHEMA}`);
            db.prepare('INSERT INTO store_meta VALUES (?,?,1,0,NULL)').run(storeId,schemaVersion);
            if (schemaVersion === 2) db.exec('ALTER TABLE store_meta ADD COLUMN catalog_version INTEGER NOT NULL DEFAULT 1;'+catalogDefinition.schema);
            db.exec('COMMIT');
        }
        catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; } finally { db.close(); }
        syncDir(path.dirname(file));
        writeExclusive(path.join(root, 'manifest.json.tmp'), JSON.stringify(d)); fs.renameSync(path.join(root, 'manifest.json.tmp'), path.join(root, 'manifest.json')); syncDir(root);
    }, metrics);
    return openVersionedStore({ root, mode:'write', fault },schemaVersion);
}
function newMetrics() { return { sql:0, rows:0, connections:0, locks:0, payloadOpens:0, payloadReadBytes:0, payloadWriteBytes:0, fsReads:0, fsWrites:0 }; }

export const openStore = options => openVersionedStore(options,1);
async function openVersionedStore({ root, mode, fault, recover = false } = {},schemaVersion) {
    runtimeCapabilities(); root = fixtureRoot(root);
    if (!['read','write'].includes(mode)) fail('INVALID_MODE', 'Explicit read/write mode required');
    if (typeof recover !== 'boolean' || (recover && mode !== 'write')) fail('INVALID_MODE', 'Recovery requires explicit write mode and boolean opt-in');
    const currentDescriptor = () => descriptor(root,schemaVersion);
    const d = currentDescriptor(), metrics = newMetrics(); let closed = false, inWriter = false;
    const assertOpen = () => { if (closed) fail('CLOSED', 'Store is closed'); fixtureRoot(root); };
    const stmt = (db, sql, params = [], type = 'get') => {
        metrics.sql++; const statement = db.prepare(sql); statement.setReadBigInts(true);
        if (type === 'run') return statement.run(...params);
        if (type === 'all') { const rows = [...statement.iterate(...params)].map(normalizeRow).map(rowBudget); metrics.rows += rows.length; return rows; }
        const row = normalizeRow(statement.get(...params)); if (row) rowBudget(row); metrics.rows += row ? 1 : 0; return row;
    };
    const generation = db => stmt(db, 'SELECT generation FROM store_meta').generation;
    const read = action => { assertOpen(); const current = currentDescriptor(); if(current.storeId !== d.storeId) fail('UNSUPPORTED_STORE','Store handle identity changed'); const db = connection(root, current, false, metrics); try { db.exec('BEGIN'); const result = action(db); db.exec('COMMIT'); return result; } finally { db.close(); } };
    // Normal opens remain nonmutating. A fresh process may explicitly request
    // native journal recovery without first obtaining a read-validated handle.
    if (recover) await locked(root,async () => {
        fixtureRoot(root);
        const current = currentDescriptor();
        if (current.storeId !== d.storeId) fail('UNSUPPORTED_STORE','Store changed while acquiring recovery lock');
        const db = connection(root,current,true,metrics);
        try { /* connection verifies settings and identity after native recovery */ }
        finally { db.close(); }
    },metrics);
    else read(() => null);
    function entity(db, owner) {
        const [kind, key] = ownerTuple(owner); let row;
        if (kind === 'root') row = key === 'root' ? stmt(db, 'SELECT store_id AS key FROM store_meta') : null;
        else if (kind === 'review') { const [r, task] = JSON.parse(key); const k = parseKey(r); row = stmt(db, 'SELECT task AS key FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=? AND task=?', [k.collection,k.replayId,k.fingerprint,task]); }
        else { const table = { collection:'collections', map:'maps', replay:'replays', record:'records', retired:'retired' }[kind]; row = stmt(db, `SELECT key FROM ${table} WHERE key=?`, [key]); }
        if (!row) fail('MISSING_OWNER', 'Property/payload owner does not exist'); return owner;
    }
    const record = (db, k) => stmt(db, 'SELECT * FROM records WHERE collection=? AND replay_id=? AND fingerprint=?', [k.collection,k.replayId,k.fingerprint]);
    function page(db, query, params, orderKey, cursor, limit, domain) {
        limit ??= LIMITS.page; if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.page) fail('RESOURCE_LIMIT', 'Page row budget exceeded');
        const gen = generation(db); const signature = inlineJson(domain);
        if (cursor && (cursor.storeId !== d.storeId || cursor.generation !== String(gen) || cursor.query !== signature)) fail('STALE_CURSOR', 'Cursor generation/query mismatch');
        const last = cursor?.last ?? [-1,''];
        const rows = stmt(db, `${query} AND (ordinal>? OR (ordinal=? AND ${orderKey}>?)) ORDER BY ordinal,${orderKey} LIMIT ?`, [...params,last[0],last[0],last[1],limit], 'all');
        let bytes = 0; for (const row of rows) { bytes += Buffer.byteLength(rowJson(row)); if (bytes > LIMITS.pageBytes) fail('RESOURCE_LIMIT', 'Metadata page byte budget exceeded'); }
        const end = rows.at(-1); return { rows, generation:gen, cursor: end && rows.length === limit ? { storeId:d.storeId,generation:String(gen),query:signature,last:[end.ordinal,end[orderKey]] } : null };
    }
    function refRow(row) { return row && Object.freeze({ owner:Object.freeze({kind:row.owner_kind,key:row.owner_key}),pointer:row.pointer,parentPointer:row.parent,role:row.role,encoding:row.encoding,path:row.path,hash:row.hash,bytes:row.bytes,items:row.items,state:row.state }); }
    function payload(db, owner, p) { const [kind,key] = ownerTuple(owner); return refRow(stmt(db, 'SELECT * FROM payloads WHERE owner_kind=? AND owner_key=? AND pointer=?', [kind,key,p])); }
    function checkedExpected(bytes, hash) { integer(bytes, 'artifact length'); if (!HEX.test(hash)) fail('INVALID_IDENTITY', 'Invalid artifact hash'); if (BigInt(bytes) > BigInt(Number.MAX_SAFE_INTEGER)) fail('RESOURCE_LIMIT', 'Artifact positional-read limit'); }
    async function hashFile(file) {
        const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); metrics.fsReads++; const hash = createHash('sha256'); let bytes = 0;
        try { if (!fs.fstatSync(fd).isFile()) fail('UNSAFE_PATH', 'Artifact is not regular'); const b = Buffer.allocUnsafe(LIMITS.chunk); for (;;) { const n = fs.readSync(fd,b,0,b.length,null); if (!n) break; hash.update(b.subarray(0,n)); bytes += n; metrics.payloadReadBytes += n; } }
        finally { fs.closeSync(fd); }
        return { bytes, hash:hash.digest('hex') };
    }
    function assertPathKind(db, p, table, payloadPaths) {
        // Per-table UNIQUE constraints cannot prevent cross-kind ownership.
        // These exact indexed lookups run under the writer lock, including for
        // pending reservations. No unrelated payload or corpus scan is needed.
        if (table !== 'payloads' && payloadPaths.has(p)) fail('OWNERSHIP_CONFLICT','Path belongs to this writer\'s payload publication');
        for (const other of ['maps','outputs','payloads']) {
            if (other !== table && stmt(db,`SELECT path FROM ${other} WHERE path=?`,[p])) fail('OWNERSHIP_CONFLICT','Cross-kind artifact path conflict');
        }
    }
    function txApi(db, published, payloadPaths) {
        const run = (sql, params) => stmt(db, sql, params, 'run');
        const api = {
            insertEntity({ kind, key, ordinal, value = {}, payloadRefs = {} }) {
                ownerTuple({kind,key}); integer(ordinal,'ordinal');
                if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_JSON', 'Entity value must be an object');
                if (kind === 'collection') { if (typeof value.present !== 'boolean') fail('INVALID_JSON','Collection presence required'); run('INSERT INTO collections VALUES (?,?,?)',[key,Number(value.present),ordinal]); }
                else if (kind === 'map') { if (!HEX.test(key)) fail('INVALID_IDENTITY','Invalid map ID'); if (value.path) { safePath(root,value.path); assertPathKind(db,value.path,'maps',payloadPaths); if(!HEX.test(value.hash)) fail('INVALID_IDENTITY','Map file needs exact body hash'); } if (value.hash && !HEX.test(value.hash)) fail('INVALID_IDENTITY','Invalid map hash'); run('INSERT INTO maps VALUES (?,?,?,?,?)',[key,value.path??null,value.hash??null,value.status??null,ordinal]); }
                else if (kind === 'replay') { if (!ID.test(key)) fail('INVALID_IDENTITY','Invalid replay ID'); if (value.buildId && !HEX.test(value.buildId)) fail('INVALID_IDENTITY','Invalid build ID'); run('INSERT INTO replays VALUES (?,?,?,?,?)',[key,value.mapId??null,value.buildId??null,value.status??null,ordinal]); }
                else if (kind === 'record' || kind === 'retired') {
                    const k = parseKey(key); const opposite = stmt(db, `SELECT key FROM ${kind === 'record' ? 'retired' : 'records'} WHERE key=?`,[key]);
                    if (opposite) fail('IDENTITY_CONFLICT','Current/retired identity conflict');
                    if (kind === 'retired') run('INSERT INTO retired VALUES (?,?,?,?,?)',[k.collection,k.replayId,k.fingerprint,key,ordinal]);
                    else {
                        if (value.buildId && !HEX.test(value.buildId)) fail('INVALID_IDENTITY','Invalid build ID');
                        const association = stmt(db,'SELECT map_id,build_id FROM replays WHERE key=?',[k.replayId]);
                        if (!association || (k.collection === 'log' && (!value.mapId || value.mapId !== association.map_id))) fail('INVALID_ASSOCIATION','Log needs its validated map association');
                        if (value.buildId && association.build_id && value.buildId !== association.build_id) fail('INVALID_ASSOCIATION','Build association conflict');
                        if (value.outputPath != null || value.outputFingerprint != null) fail('INVALID_REFERENCE','Use output reservation, not arbitrary path projections');
                        run('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?)',[k.collection,k.replayId,k.fingerprint,key,value.mapId??null,value.buildId??null,value.status??'pending',null,null,ordinal]);
                    }
                } else fail('INVALID_IDENTITY','Unsupported insert entity kind');
                for (const [i,p] of Object.keys(value).entries()) api.setProperty({owner:{kind,key},pointer:'/'+p.replaceAll('~','~0').replaceAll('/','~1'),ordinal:i,value:value[p]});
                for (const [p,ref] of Object.entries(payloadRefs)) api.setProperty({owner:{kind,key},pointer:p,ordinal:Object.keys(value).length,payloadRef:ref});
                return {kind,key};
            },
            setProperty({ owner, pointer:p, ordinal, value, payloadRef }) {
                entity(db,owner); pointer(p); integer(ordinal,'property ordinal'); let encoded = null, pp = null;
                const projectionNames = {record:{'/collection':'collection','/replayId':'replay_id','/fingerprint':'fingerprint','/mapId':'map_id','/buildId':'build_id','/status':'status','/outputPath':'output_path','/outputFingerprint':'output_hash'},replay:{'/replayId':'key','/mapId':'map_id','/buildId':'build_id','/status':'status'},map:{'/mapId':'key','/path':'path','/hash':'hash','/status':'status'},collection:{'/present':'present'}};
                const projection = projectionNames[owner.kind]?.[p];
                if (projection) {
                    const table = {record:'records',replay:'replays',map:'maps',collection:'collections'}[owner.kind];
                    const row = stmt(db,`SELECT ${projection} AS value FROM ${table} WHERE key=?`,[owner.key]);
                    const expected = p === '/present' ? Number(value) : value;
                    if (payloadRef || row.value !== expected) fail('INVALID_PROJECTION','Indexed/original value disagreement');
                }
                if (payloadRef) { const saved = payload(db,owner,payloadRef.pointer); if (!saved || saved.hash !== payloadRef.hash || saved.state !== 'ready') fail('INVALID_REFERENCE','Property payload is not ready/owned'); pp = saved.pointer; }
                else encoded = inlineJson(value);
                rowBudget({owner_kind:owner.kind,owner_key:owner.key,pointer:p,ordinal,value:encoded,payload_pointer:pp});
                run('INSERT INTO properties VALUES (?,?,?,?,?,?) ON CONFLICT(owner_kind,owner_key,pointer) DO UPDATE SET ordinal=excluded.ordinal,value=excluded.value,payload_pointer=excluded.payload_pointer',[owner.kind,owner.key,p,ordinal,encoded,pp]);
                // The inline review is a bounded convenience projection. A
                // direct original-property update must never leave it stale.
                if (owner.kind === 'review') run('UPDATE reviews SET value=NULL WHERE owner_key=?',[owner.key]);
            },
            putReview({ recordKey:k, taskId, ordinal, value, payloadRefs = {} }) {
                recordKey(k); text(taskId,'task ID'); integer(ordinal,'review ordinal');
                if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_JSON','Review must be an object');
                let json = null;
                try {
                    const candidate = inlineJson(value);
                    rowBudget({collection:k.collection,replay_id:k.replayId,fingerprint:k.fingerprint,task:taskId,ordinal,value:candidate});
                    if (!Object.keys(payloadRefs).length) json = candidate;
                } catch (error) { if (error.code !== 'RESOURCE_LIMIT') throw error; }
                const owner = {kind:'review',key:inlineJson([recordKey(k),taskId])};
                run('INSERT INTO reviews VALUES (?,?,?,?,?,?,?) ON CONFLICT(collection,replay_id,fingerprint,task) DO UPDATE SET ordinal=excluded.ordinal,value=excluded.value',[k.collection,k.replayId,k.fingerprint,taskId,ordinal,json,owner.key]);
                run('DELETE FROM properties WHERE owner_kind=? AND owner_key=?',[owner.kind,owner.key]);
                // Lossless original review properties remain paginated even
                // when a complete inline view exceeds one metadata row.
                let i = 0;
                for (const p of Object.keys(value)) api.setProperty({owner,pointer:'/'+p.replaceAll('~','~0').replaceAll('/','~1'),ordinal:i++,value:value[p]});
                for (const [p,ref] of Object.entries(payloadRefs)) api.setProperty({owner,pointer:p,ordinal:i++,payloadRef:ref});
                if (json !== null) run('UPDATE reviews SET value=? WHERE owner_key=?',[json,owner.key]);
            },
            reserveOutput({ recordKey:k, path:p, expectedBytes, expectedHash }) {
                recordKey(k); safePath(root,p,true); checkedExpected(expectedBytes,expectedHash);
                if (fs.existsSync(path.join(root,p))) fail('OWNERSHIP_CONFLICT','Cannot reserve/adopt an existing unowned file');
                assertPathKind(db,p,'outputs',payloadPaths);
                const r = record(db,k); if (!r || r.status !== 'pending') fail('INVALID_STATE','Output reservation requires pending record');
                run('INSERT INTO outputs VALUES (?,?,?,?,?,?,?)',[p,k.collection,k.replayId,k.fingerprint,expectedHash,expectedBytes,'pending']);
                run('UPDATE records SET output_path=?,output_hash=? WHERE key=?',[p,expectedHash,recordKey(k)]);
                for (const [name,value] of [['outputPath',p],['outputFingerprint',expectedHash]]) api.setProperty({owner:recordOwner(k),pointer:'/'+name,ordinal:stmt(db,'SELECT COALESCE(MAX(ordinal),-1)+1 AS n FROM properties WHERE owner_kind=? AND owner_key=?',['record',recordKey(k)]).n,value});
            },
            appendIntent({ id, recordKey:k, phase = 'publish', ordinal = 0, files = [] }) {
                text(id,'operation ID'); recordKey(k); integer(ordinal,'operation ordinal'); if (!['publish','cleanup'].includes(phase)) fail('INVALID_STATE','Invalid operation phase');
                if (files.length > LIMITS.page) fail('RESOURCE_LIMIT','Intent files must be appended in bounded pages');
                const existing = stmt(db,'SELECT * FROM operations WHERE id=?',[id]);
                if (existing) { if (existing.collection !== k.collection || existing.replay_id !== k.replayId || existing.fingerprint !== k.fingerprint || existing.phase !== phase) fail('OWNERSHIP_CONFLICT','Intent identity changed'); }
                else run('INSERT INTO operations VALUES (?,?,?,?,?,?)',[id,k.collection,k.replayId,k.fingerprint,phase,ordinal]);
                for (const file of files) {
                    checkedExpected(file.bytes,file.hash); safePath(root,file.path,true); integer(file.ordinal,'file ordinal');
                    if (phase === 'cleanup') {
                        const owned = stmt(db,'SELECT hash,bytes FROM outputs WHERE path=? AND collection=? AND replay_id=? AND fingerprint=?',[file.path,k.collection,k.replayId,k.fingerprint]) ?? stmt(db,'SELECT hash,bytes FROM payloads WHERE path=? AND owner_kind=? AND owner_key=?',[file.path,'record',recordKey(k)]) ?? stmt(db,'SELECT hash,bytes FROM payloads JOIN reviews ON payloads.owner_key=reviews.owner_key WHERE path=? AND owner_kind=? AND collection=? AND replay_id=? AND fingerprint=?',[file.path,'review',k.collection,k.replayId,k.fingerprint]);
                        if (!owned || owned.hash !== file.hash || owned.bytes !== file.bytes) fail('OWNERSHIP_CONFLICT','Cleanup may journal only exact owned artifacts');
                    }
                    const old = stmt(db,'SELECT * FROM operation_files WHERE operation_id=? AND ordinal=?',[id,file.ordinal]);
                    if (old) { if (old.path !== file.path || old.hash !== file.hash || old.bytes !== file.bytes) fail('OWNERSHIP_CONFLICT','Intent file changed'); }
                    else run('INSERT INTO operation_files VALUES (?,?,?,?,?,?,?)',[id,file.ordinal,file.path,file.hash,file.bytes,'pending',Number(file.originalPresent ?? false)]);
                    if (file.payload) {
                        const {owner,pointer:p,role,parentPointer = null,items = null} = file.payload; entity(db,owner); pointer(p); if (parentPointer !== null) pointer(parentPointer);
                        const responseOwner = owner.kind === 'record' && owner.key === recordKey(k);
                        const reviewOwner = owner.kind === 'review' && JSON.parse(owner.key)[0] === recordKey(k);
                        if ((!responseOwner && !reviewOwner) || file.path !== payloadPath(d.storeId,owner,p,role,file.hash)) fail('OWNERSHIP_CONFLICT','Payload intent owner/path mismatch');
                        assertPathKind(db,file.path,'payloads',payloadPaths);
                        const saved = payload(db,owner,p);
                        if (saved) { if (saved.hash !== file.hash || saved.path !== file.path || saved.parentPointer !== parentPointer) fail('OWNERSHIP_CONFLICT','Payload changed'); }
                        else { if (parentPointer === p) fail('INVALID_REFERENCE','Self-parent payload'); run('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[owner.kind,owner.key,p,parentPointer,role,file.path,file.hash,file.bytes,items,'pending',file.ordinal,role === 'diagnostics' ? 'jsonl-v1' : 'json-v1']); }
                    }
                }
            },
            setStatus({ recordKey:k, status }) {
                recordKey(k); const row = record(db,k); if (!row) fail('MISSING_OWNER','Record unavailable');
                if (status === 'claim') fail('INVALID_STATE','Use finishPublication for readiness');
                run('UPDATE records SET status=? WHERE key=?',[status,recordKey(k)]);
                const original = stmt(db,'SELECT ordinal FROM properties WHERE owner_kind=? AND owner_key=? AND pointer=?',['record',recordKey(k),'/status']);
                api.setProperty({owner:recordOwner(k),pointer:'/status',ordinal:original?.ordinal ?? 0,value:status});
            },
            finishPublication({ recordKey:k, operationId, payloadRefs = [], retire = false }) {
                recordKey(k); const r = record(db,k); if (!r) fail('MISSING_OWNER','Missing record');
                if (retire) {
                    const op = stmt(db,'SELECT * FROM operations WHERE id=? AND phase=?',[operationId,'cleanup']);
                    if (!op || op.collection !== k.collection || op.replay_id !== k.replayId || op.fingerprint !== k.fingerprint || r.status !== (k.collection === 'score' ? 'retiring' : 'done')) fail('INVALID_STATE','Synthetic cleanup needs collection-specific recorded authorization');
                    if (stmt(db,'SELECT path FROM operation_files WHERE operation_id=? AND state!=? LIMIT 1',[operationId,'deleted'])) fail('INVALID_STATE','Cleanup files not journaled deleted');
                    if (stmt(db,"SELECT path FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=? AND path NOT IN (SELECT path FROM operation_files WHERE operation_id=? AND state='deleted') LIMIT 1",[k.collection,k.replayId,k.fingerprint,operationId])) fail('INVALID_STATE','Owned output must have a deleted checkpoint');
                    const unjournaled = stmt(db,`SELECT path FROM payloads WHERE ((owner_kind='record' AND owner_key=?) OR (owner_kind='review' AND owner_key IN (SELECT owner_key FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=?))) AND path NOT IN (SELECT path FROM operation_files WHERE operation_id=? AND state='deleted') LIMIT 1`,[r.key,k.collection,k.replayId,k.fingerprint,operationId]);
                    if (unjournaled) fail('INVALID_STATE','Owned payloads must all have deleted checkpoints');
                    run('DELETE FROM properties WHERE owner_kind=? AND owner_key IN (SELECT owner_key FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=?)',['review',k.collection,k.replayId,k.fingerprint]);
                    run('DELETE FROM payloads WHERE owner_kind=? AND owner_key IN (SELECT owner_key FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=?)',['review',k.collection,k.replayId,k.fingerprint]);
                    run('DELETE FROM properties WHERE owner_kind=? AND owner_key=?',['record',r.key]);
                    // Dependency trees are deleted leaf-first by a bounded SQL cascade.
                    run('DELETE FROM payloads WHERE owner_kind=? AND owner_key=?',['record',r.key]);
                    run('DELETE FROM records WHERE key=?',[r.key]); api.insertEntity({kind:'retired',key:r.key,ordinal:r.ordinal,value:{}}); return;
                }
                const op = operationId && stmt(db,'SELECT * FROM operations WHERE id=?',[operationId]);
                if (operationId && (!op || op.phase !== 'publish' || op.collection !== k.collection || op.replay_id !== k.replayId || op.fingerprint !== k.fingerprint)) fail('OWNERSHIP_CONFLICT','Publication intent mismatch');
                if (op && stmt(db,'SELECT path FROM operation_files WHERE operation_id=? AND state!=? LIMIT 1',[operationId,'verified'])) fail('INVALID_STATE','Publication is incomplete');
                if (!op && (r.collection !== 'log' || r.output_path !== null)) fail('INVALID_STATE','Only evidence-only logs may prepublish without intent');
                // An empty/partial intent is not proof that the record's actual
                // output was published. Resolve its unique owner reservation,
                // then require that exact output in this verified intent.
                const output = stmt(db,'SELECT path,hash,bytes,state FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=?',[k.collection,k.replayId,k.fingerprint]);
                if (output || r.output_path !== null || r.output_hash !== null || r.collection === 'score') {
                    if (!output || output.state !== 'ready' || output.path !== r.output_path || output.hash !== r.output_hash || !op) fail('INVALID_STATE','Record requires its owned ready output and publication intent');
                    const checkpoint = stmt(db,'SELECT hash,bytes,state FROM operation_files WHERE operation_id=? AND path=?',[operationId,output.path]);
                    if (!checkpoint || checkpoint.state !== 'verified' || checkpoint.hash !== output.hash || checkpoint.bytes !== output.bytes) fail('INVALID_STATE','Owned output needs an exact verified publication checkpoint');
                }
                for (const ref of payloadRefs) {
                    if (published.get(ref.path) !== inlineJson(ref)) fail('INVALID_ARTIFACT','Evidence-only reference was not verified by this writer');
                    if (ref.owner.kind !== 'record' || ref.owner.key !== r.key || ref.path !== payloadPath(d.storeId,ref.owner,ref.pointer,ref.role,ref.hash)) fail('OWNERSHIP_CONFLICT','Evidence-only reference mismatch');
                    assertPathKind(db,ref.path,'payloads',payloadPaths);
                    if (!payload(db,ref.owner,ref.pointer)) run('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[ref.owner.kind,ref.owner.key,ref.pointer,ref.parentPointer??null,ref.role,ref.path,ref.hash,ref.bytes,ref.items??null,'ready',0,ref.encoding]);
                }
                if (stmt(db,'SELECT pointer FROM payloads WHERE owner_kind=? AND owner_key=? AND state!=? LIMIT 1',['record',r.key,'ready'])) fail('INVALID_STATE','Pending payloads cannot be claimed');
                const readyStatus = r.status === 'pending' ? 'claim' : r.status;
                if (!['claim','done'].includes(readyStatus)) fail('INVALID_STATE','Publication cannot normalize waiting/retiring state');
                run('UPDATE records SET status=? WHERE key=?',[readyStatus,r.key]);
                const original = stmt(db,'SELECT ordinal FROM properties WHERE owner_kind=? AND owner_key=? AND pointer=?',['record',r.key,'/status']);
                api.setProperty({owner:recordOwner(k),pointer:'/status',ordinal:original?.ordinal??0,value:readyStatus});
                if (op) run('DELETE FROM operations WHERE id=?',[operationId]);
            },
        };
        return api;
    }
    async function writerCallback(db, callback) {
        let active = true, transactionActive = false; const ensure = () => { if (!active) fail('CLOSED','Writer callback ended'); };
        const published = new Map(), payloadPaths = new Set();
        const outstanding = new Set(), temporaryCloses = new Set();
        const inject = boundary => fault?.(boundary);
        const writer = {
            transaction(callback) {
                ensure(); if (transactionActive) fail('INVALID_STATE','Nested transactions prohibited'); transactionActive = true;
                try {
                    inject('transaction-begin'); db.exec('BEGIN IMMEDIATE');
                    let txActive = true;
                    const api = Object.fromEntries(Object.entries(txApi(db,published,payloadPaths)).map(([name,method]) => [name,(...args) => {
                        ensure(); if (!txActive) fail('CLOSED','Transaction callback ended'); return method(...args);
                    }]));
                    let result; try { result = callback(api); } finally { txActive = false; }
                    if (result && typeof result.then === 'function') { result.catch(() => {}); fail('INVALID_STATE','Transaction callback must be synchronous'); }
                    const gen = generation(db); if (BigInt(gen) >= MAX_INTEGER) fail('RESOURCE_LIMIT','Generation exhausted');
                    stmt(db,'UPDATE store_meta SET generation=generation+1',[],'run'); inject('transaction-commit'); db.exec('COMMIT'); return result;
                } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; } finally { transactionActive = false; }
            },
            async publishPayload({ owner, pointer:p, role, source, expectedBytes, expectedHash, parentPointer = null, evidenceOnly = false, items = null }) {
                ensure(); pointer(p); ownerTuple(owner); const relative = payloadPath(d.storeId,owner,p,role,expectedHash);
                const saved = payload(db,owner,p);
                if (!saved && !(evidenceOnly && owner.kind === 'record' && parseKey(owner.key).collection === 'log' && parentPointer === null)) fail('INVALID_STATE','Payload needs matching reservation');
                if (saved && (saved.role !== role || saved.path !== relative || saved.hash !== expectedHash || saved.bytes !== expectedBytes || saved.parentPointer !== parentPointer)) fail('OWNERSHIP_CONFLICT','Payload reservation mismatch');
                assertPathKind(db,relative,'payloads',payloadPaths);
                // Evidence-only prepublication has no database owner row yet.
                // Reserve its deterministic path before yielding to the source;
                // keep it through failure/retry until this writer callback ends.
                payloadPaths.add(relative);
                await publish(relative,source,expectedBytes,expectedHash);
                ensure();
                const ref = {owner,pointer:p,role,encoding:role === 'diagnostics' ? 'jsonl-v1' : 'json-v1',path:relative,bytes:expectedBytes,hash:expectedHash,parentPointer,items,state:'ready'};
                published.set(ref.path,inlineJson(ref));
                if (saved) writer.transaction(() => { stmt(db,'UPDATE payloads SET state=? WHERE owner_kind=? AND owner_key=? AND pointer=?',['ready',owner.kind,owner.key,p],'run'); stmt(db,'UPDATE operation_files SET state=? WHERE path=?',['verified',relative],'run'); });
                return ref;
            },
            async publishOutput({ recordKey:k, path:p, source, expectedBytes, expectedHash }) {
                ensure(); recordKey(k); const row = stmt(db,'SELECT * FROM outputs WHERE path=?',[p]);
                if (!row || row.collection !== k.collection || row.replay_id !== k.replayId || row.fingerprint !== k.fingerprint || row.hash !== expectedHash || row.bytes !== expectedBytes || !stmt(db,'SELECT path FROM operation_files JOIN operations ON id=operation_id WHERE path=? AND collection=? AND replay_id=? AND fingerprint=? AND phase=?',[p,k.collection,k.replayId,k.fingerprint,'publish'])) fail('OWNERSHIP_CONFLICT','Output lacks matching reservation/intent');
                assertPathKind(db,p,'outputs',payloadPaths);
                await publish(p,source,expectedBytes,expectedHash);
                ensure();
                writer.transaction(() => { stmt(db,'UPDATE outputs SET state=? WHERE path=?',['ready',p],'run'); stmt(db,'UPDATE operation_files SET state=? WHERE path=?',['verified',p],'run'); });
                return {path:p,bytes:expectedBytes,hash:expectedHash};
            },
            async deleteFile({ operationId, ordinal }) {
                ensure(); if (transactionActive) fail('INVALID_STATE','File IO must stay outside transactions');
                const row = stmt(db,'SELECT operation_files.*,operations.phase,records.collection,records.status FROM operation_files JOIN operations ON id=operation_id JOIN records USING(collection,replay_id,fingerprint) WHERE operation_id=? AND operation_files.ordinal=?',[operationId,ordinal]);
                if (!row || row.phase !== 'cleanup' || row.status !== (row.collection === 'score' ? 'retiring' : 'done')) fail('INVALID_STATE','No collection-specific synthetic cleanup authorization');
                const file = safePath(root,row.path); if (fs.existsSync(file)) { const got = await hashFile(file); ensure(); if (got.hash !== row.hash || got.bytes !== row.bytes) fail('INVALID_ARTIFACT','Changed cleanup artifact'); fs.unlinkSync(file); }
                // An absent retry may follow unlink with an interrupted flush.
                // Complete directory durability before recording deletion.
                syncDir(path.dirname(file));
                writer.transaction(() => stmt(db,'UPDATE operation_files SET state=? WHERE operation_id=? AND ordinal=?',['deleted',operationId,ordinal],'run'));
            },
        };
        async function publish(relative, source, bytes, hash) {
            ensure(); if (transactionActive) fail('INVALID_STATE','File IO must stay outside transactions'); checkedExpected(bytes,hash);
            const destination = safePath(root,relative,true);
            if (fs.existsSync(destination)) {
                const current = await hashFile(destination); ensure(); if (current.hash !== hash || current.bytes !== bytes) fail('INVALID_ARTIFACT','Changed publication destination');
                // The initial link can survive a failure before directory
                // fsync. Exact bytes alone do not complete its publication.
                inject('directory-fsync'); syncDir(path.dirname(destination));
                inject('verification'); return;
            }
            const temporary = destination + '.' + randomUUID() + '.tmp'; const fd = fs.openSync(temporary,'wx',0o600); let size = 0; const digest = createHash('sha256');
            // Register ownership before consuming a possibly suspended source.
            // Callback exit closes this descriptor; its late finally must not
            // close a descriptor number already reused by a subsequent writer.
            const close = () => { if (temporaryCloses.delete(close)) fs.closeSync(fd); };
            temporaryCloses.add(close); let failed = false;
            try {
                for await (const chunk of source) {
                    ensure(); if (!(chunk instanceof Uint8Array) || chunk.length > LIMITS.chunk) fail('RESOURCE_LIMIT','Publication chunk budget exceeded');
                    size += chunk.length; if (size > bytes) fail('INVALID_ARTIFACT','Source exceeds reserved size'); digest.update(chunk);
                    let offset = 0; while (offset < chunk.length) offset += fs.writeSync(fd,chunk,offset,chunk.length-offset);
                    metrics.fsWrites++; metrics.payloadWriteBytes += chunk.length; inject('temporary-write');
                }
                ensure(); // The iterator can suspend while returning done.
                if (size !== bytes || digest.digest('hex') !== hash) fail('INVALID_ARTIFACT','Source hash/length mismatch');
                inject('temporary-fsync'); fs.fsyncSync(fd);
            } catch (error) { failed = true; throw error; }
            finally { try { close(); } catch (error) { if (!failed) throw error; } }
            inject('exclusive-publication'); fs.linkSync(temporary,destination); inject('directory-fsync'); syncDir(path.dirname(destination));
            const current = await hashFile(destination); ensure(); inject('verification'); if (current.hash !== hash || current.bytes !== bytes) fail('INVALID_ARTIFACT','Published bytes mismatch');
            // Only this successful operation's owned temporary is removed.
            fs.unlinkSync(temporary); syncDir(path.dirname(destination));
        }
        // Do not drain arbitrary caller iterators under the lock: next() can
        // wait indefinitely. Revoke at callback exit, close owned descriptors,
        // and guard every await-to-mutation/success continuation instead. Attach
        // rejection handlers now so abandoned operations cannot be unhandled.
        for (const name of ['publishPayload','publishOutput','deleteFile']) {
            const method = writer[name];
            writer[name] = (...args) => {
                const operation = method(...args);
                outstanding.add(operation);
                operation.then(() => outstanding.delete(operation), () => outstanding.delete(operation));
                return operation;
            };
        }
        let failed = false;
        try {
            const result = await callback(writer);
            if (outstanding.size) fail('INVALID_STATE','Writer callback ended with outstanding file operations');
            return result;
        } catch (error) { failed = true; throw error; }
        finally {
            active = false;
            let cleanupFailed = false, cleanupError;
            for (const close of temporaryCloses) {
                try { close(); } catch (error) { if (!cleanupFailed) { cleanupFailed = true; cleanupError = error; } }
            }
            if (!failed && cleanupFailed) throw cleanupError;
        }
    }
    const store = {
        root, storeId:d.storeId, metrics,
        resetMetrics() { Object.assign(metrics,newMetrics()); },
        close() { if (inWriter) fail('INVALID_STATE','Cannot close during writer callback'); closed = true; },
        getRecord(k) { recordKey(k); return read(db => record(db,k) ?? (stmt(db,'SELECT * FROM retired WHERE key=?',[recordKey(k)]) ? {kind:'retired',key:recordKey(k)} : {kind:'missing'})); },
        getReplay(id) { if (!ID.test(id)) fail('INVALID_IDENTITY','Invalid replay ID'); return read(db => stmt(db,'SELECT * FROM replays WHERE key=?',[id]) ?? {kind:'missing'}); },
        getMap(id) { if (!HEX.test(id)) fail('INVALID_IDENTITY','Invalid map ID'); return read(db => stmt(db,'SELECT * FROM maps WHERE key=?',[id]) ?? {kind:'missing'}); },
        getReview(k,task) {
            recordKey(k); text(task,'task ID');
            return read(db => {
                const row = stmt(db,'SELECT value,ordinal FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=? AND task=?',[k.collection,k.replayId,k.fingerprint,task]);
                if (!row) return {kind:'missing'};
                if (row.value !== null) return {value:JSON.parse(row.value),ordinal:row.ordinal};
                const owner = {kind:'review',key:inlineJson([recordKey(k),task])}, structured = {kind:'structured',owner,ordinal:row.ordinal};
                // Reconstruct a small invalidated projection from current
                // original properties. Never hydrate an overflow or scan an
                // unbounded review to provide this convenience view.
                const value = {}; let bytes = 2, count = 0; metrics.sql++;
                for (const raw of db.prepare('SELECT pointer,value,payload_pointer FROM properties WHERE owner_kind=? AND owner_key=? ORDER BY ordinal,pointer LIMIT 129').iterate(owner.kind,owner.key)) {
                    metrics.rows++; rowBudget(raw);
                    if (++count > LIMITS.page || raw.value === null || !/^\/(?:[^/~]|~[01])*$/.test(raw.pointer)) return structured;
                    const name = raw.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');
                    bytes += Buffer.byteLength(inlineJson(name)) + 1 + Buffer.byteLength(raw.value) + (count > 1 ? 1 : 0);
                    if (bytes > LIMITS.inline) return structured;
                    Object.defineProperty(value,name,{value:JSON.parse(raw.value),enumerable:true,writable:true,configurable:true});
                }
                try { rowBudget({collection:k.collection,replay_id:k.replayId,fingerprint:k.fingerprint,task,ordinal:row.ordinal,value:inlineJson(value)}); }
                catch (error) { if (error.code === 'RESOURCE_LIMIT') return structured; throw error; }
                return {value,ordinal:row.ordinal};
            });
        },
        pageRecords({collection,replayId = null,status = null,after = null,limit} = {}) { if (!['log','score'].includes(collection)) fail('INVALID_IDENTITY','Collection required'); return read(db => page(db,'SELECT * FROM records WHERE collection=?'+(replayId ? ' AND replay_id=?' : '')+(status ? ' AND status=?' : ''),[collection,...(replayId?[replayId]:[]),...(status?[status]:[])],'key',after,limit,['records',collection,replayId,status])); },
        pageReviews(k,cursor) { recordKey(k); return read(db => page(db,'SELECT task,ordinal,value FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=?',[k.collection,k.replayId,k.fingerprint],'task',cursor,LIMITS.page,['reviews',recordKey(k)])); },
        pageOperations(cursor) { return read(db => page(db,'SELECT * FROM operations WHERE 1=1',[],'id',cursor,LIMITS.page,['operations'])); },
        pageProperties(owner,cursor) { ownerTuple(owner); return read(db => page(db,'SELECT pointer,ordinal,value,payload_pointer FROM properties WHERE owner_kind=? AND owner_key=?',[owner.kind,owner.key],'pointer',cursor,LIMITS.page,['properties',owner])); },
        pagePayloads(owner,parentPointer = null,cursor) { ownerTuple(owner); return read(db => page(db,'SELECT * FROM payloads WHERE owner_kind=? AND owner_key=? AND parent IS ?',[owner.kind,owner.key,parentPointer],'pointer',cursor,LIMITS.page,['payloads',owner,parentPointer])); },
        async withWriter(callback) {
            assertOpen(); if (mode !== 'write' || inWriter) fail('INVALID_STATE','Writable nonnested handle required'); inWriter = true;
            try { return await locked(root,async () => { const current = currentDescriptor(); if (current.storeId !== d.storeId) fail('UNSUPPORTED_STORE','Store changed while acquiring lock'); const db = connection(root,current,true,metrics); try { return await writerCallback(db,w => callback(catalogCallback ? catalogDefinition.writer({db,stmt,writer:w,root,store}) : w)); } finally { db.close(); } },metrics); }
            finally { inWriter = false; }
        },
        async withReadSnapshot(options = {},callback) {
            let {recordKeys = [],mapIds = [],reviewKeys = [],payloadRoles = ['diagnostics','summaries','extensions'],scoreSelection,combinedSelection} = options;
            let scoreFacts,combinedFacts,logKeys;
            if (combinedSelection !== undefined) {
                if (['recordKeys','mapIds','reviewKeys','payloadRoles','scoreSelection'].some(k=>Object.hasOwn(options,k))) fail('INVALID_REFERENCE','Combined snapshot mode is exclusive');
                const request=combinedSelection;
                if ((Array.isArray(request?.logFingerprints)?request.logFingerprints.length:0)+(Array.isArray(request?.scoreFingerprints)?request.scoreFingerprints.length:0)>LIMITS.sources) fail('RESOURCE_LIMIT','Snapshot source budget exceeded');
                if (!request || typeof request.replayId!=='string' || !ID.test(request.replayId) ||
                    [request.logFingerprints,request.scoreFingerprints].some(values=>!Array.isArray(values)||!values.length||values.some(f=>typeof f!=='string'||!HEX.test(f))||new Set(values).size!==values.length)) fail('INVALID_IDENTITY','Explicit combined selection required');
                combinedSelection={replayId:request.replayId,logFingerprints:[...request.logFingerprints],scoreFingerprints:[...request.scoreFingerprints]};
                logKeys=combinedSelection.logFingerprints.map(fingerprint=>Object.freeze({collection:'log',replayId:request.replayId,fingerprint}));
                scoreSelection={replayId:request.replayId,fingerprints:combinedSelection.scoreFingerprints};
            }
            if (scoreSelection !== undefined) {
                if (['recordKeys','mapIds','reviewKeys','payloadRoles'].some(k=>Object.hasOwn(options,k))) fail('INVALID_REFERENCE','Score snapshot mode is exclusive');
                if (Array.isArray(scoreSelection?.fingerprints) && scoreSelection.fingerprints.length > LIMITS.sources) fail('RESOURCE_LIMIT','Snapshot source budget exceeded');
                if (!scoreSelection || !ID.test(scoreSelection.replayId) || !Array.isArray(scoreSelection.fingerprints) ||
                    !scoreSelection.fingerprints.length || scoreSelection.fingerprints.some(f=>typeof f !== 'string' || !HEX.test(f)) ||
                    new Set(scoreSelection.fingerprints).size !== scoreSelection.fingerprints.length) fail('INVALID_IDENTITY','Explicit score selection required');
                scoreSelection = {replayId:scoreSelection.replayId,fingerprints:[...scoreSelection.fingerprints]};
                recordKeys = [...(logKeys??[]),...scoreSelection.fingerprints.map(fingerprint=>({collection:'score',replayId:scoreSelection.replayId,fingerprint}))];
            }
            assertOpen(); if (recordKeys.length > LIMITS.sources) fail('RESOURCE_LIMIT','Snapshot source budget exceeded');
            const selected = new Map(recordKeys.map(k => [recordKey(k),k]));
            for (const review of reviewKeys) selected.set(recordKey(review.recordKey),review.recordKey);
            if (selected.size > LIMITS.sources) fail('RESOURCE_LIMIT','Snapshot review source budget exceeded');
            recordKeys = [...selected.values()];
            if (!Array.isArray(payloadRoles) || payloadRoles.length > 3 || payloadRoles.some(role=>!['diagnostics','summaries','extensions'].includes(role))) fail('INVALID_REFERENCE','Invalid payload role selection');
            const handles = new Map(), refs = new Map(); let open = true, metadataBytes = 0;
            const addMeta = row => { if (row) { metadataBytes += Buffer.byteLength(rowJson(row)); if (metadataBytes > LIMITS.pageBytes) fail('RESOURCE_LIMIT','Snapshot metadata budget exceeded'); } return row; };
            const records = new Map(), maps = new Map(), replays = new Map(), reviews = new Map(), properties = new Map();
            const outputRefs = new Map(), mapRefs = new Map();
            const collectProperties = (db,owner) => {
                metrics.sql++; const rows = [];
                const statement = db.prepare('SELECT * FROM properties WHERE owner_kind=? AND owner_key=? ORDER BY ordinal,pointer');
                statement.setReadBigInts(true);
                for (const raw of statement.iterate(owner.kind,owner.key)) {
                    metrics.rows++; rows.push(addMeta(normalizeRow(raw)));
                }
                properties.set(inlineJson(owner),rows);
            };
            const addFile = ref => {
                if (handles.has(ref.path)) return;
                if (handles.size >= LIMITS.handles) fail('RESOURCE_LIMIT','Snapshot handle budget exceeded');
                const file = safePath(root,ref.path); let fd;
                try { fd = fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW); } catch(e) { if(e.code === 'ENOENT') fail('UNAVAILABLE','Missing selected artifact'); throw e; }
                try {
                    const st = fs.fstatSync(fd); if (!st.isFile() || st.size !== ref.bytes) fail('INVALID_ARTIFACT','Selected artifact identity/size mismatch');
                    handles.set(ref.path,{fd,ref,dev:st.dev,ino:st.ino});
                } catch (error) {
                    // Own the opened descriptor until snapshot cleanup takes it.
                    // Preserve the setup error if local close also fails.
                    if (handles.get(ref.path)?.fd !== fd) try { fs.closeSync(fd); } catch {}
                    throw error;
                }
                metrics.payloadOpens++;
            };
            const collect = (db,owner,parent = null) => {
                // Select each requested root role through its ordered index
                // before applying a bound. Unselected roots cannot hide a
                // later selected file or force a corpus scan/sort. Children
                // include every role because overflow dependencies are pinned.
                const roles = parent === null ? [...new Set(payloadRoles)] : [null];
                for (const role of roles) {
                    metrics.sql++;
                    const statement = db.prepare(`SELECT * FROM payloads WHERE owner_kind=? AND owner_key=? AND parent IS ?${role === null ? '' : ' AND role=?'} ORDER BY ordinal,pointer LIMIT 257`);
                    statement.setReadBigInts(true);
                    const rows = statement.iterate(owner.kind,owner.key,parent,...(role === null ? [] : [role]));
                    for (const raw of rows) {
                        metrics.rows++; const row = addMeta(normalizeRow(raw)); const ref = refRow(row);
                        if (ref.state !== 'ready') fail('UNAVAILABLE','Selected payload pending');
                        if (combinedSelection) assertPathKind(db,ref.path,'payloads',new Set());
                        refs.set(inlineJson([owner,ref.pointer]),ref); addFile(ref); collect(db,owner,ref.pointer);
                    }
                }
            };
            const view = {
                records,maps,replays,reviews,properties,
                assertOpen() { if (!open) fail('CLOSED','Snapshot callback ended'); },
                scoreSelection() { this.assertOpen(); if (!scoreFacts) fail('INVALID_REFERENCE','Not a score-selection snapshot'); return scoreFacts; },
                combinedSelection() { this.assertOpen(); if (!combinedFacts) fail('INVALID_REFERENCE','Not a combined-selection snapshot'); return combinedFacts; },
                artifact(ref) { this.assertOpen(); const h = handles.get(ref.path); if (!h || h.ref.hash !== ref.hash || h.ref.bytes !== ref.bytes) fail('INVALID_REFERENCE','Unpinned artifact reference'); return h; },
                read(artifact,buffer,offset) { this.assertOpen(); const n = fs.readSync(artifact.fd,buffer,0,buffer.length,offset); metrics.fsReads++; metrics.payloadReadBytes += n; return n; },
                output(k) { this.assertOpen(); const key = recordKey(k); if (!outputRefs.has(key)) fail('INVALID_REFERENCE','Output record is not selected'); return outputRefs.get(key); },
                mapArtifact(id) { this.assertOpen(); if (!mapRefs.has(id)) fail('INVALID_REFERENCE','Map is not selected'); return mapRefs.get(id); },
                diagnostics(k) { this.assertOpen(); const owner = recordOwner(k); const found = [...refs.values()].find(ref => ref.owner.key === owner.key && ref.role === 'diagnostics' && ref.parentPointer === null); if (!found) fail('UNAVAILABLE','No selected diagnostics'); return found; },
                payload(owner,p) { this.assertOpen(); const ref = refs.get(inlineJson([owner,p])); if (!ref) fail('INVALID_REFERENCE','Unpinned payload'); return ref; },
                child(parent,p) { this.assertOpen(); const ref = this.payload(parent.owner,p); if (ref.parentPointer !== parent.pointer) fail('INVALID_REFERENCE','Overflow dependency is not registered to parent'); return ref; },
            };
            let failed = false;
            try {
                await locked(root,async () => {
                    const current = currentDescriptor(); if (current.storeId !== d.storeId) fail('UNSUPPORTED_STORE','Snapshot store changed'); const db = connection(root,current,false,metrics);
                    let setupFailed = false;
                    try {
                        db.exec('BEGIN');
                        if (scoreSelection) {
                            const collections = {};
                            for (const [name,table] of [['scoreRecords','records'],['retiredScoreSources','retired']]) {
                                const row=addMeta(stmt(db,'SELECT * FROM collections WHERE key=?',[name]));
                                if (!row) fail('UNSUPPORTED_REPRESENTATION','Explicit score collection presence required');
                                const original=addMeta(stmt(db,'SELECT value,payload_pointer FROM properties WHERE owner_kind=? AND owner_key=? AND pointer=?',['collection',name,'/present']));
                                if (original && (original.payload_pointer !== null || JSON.parse(original.value) !== Boolean(row.present))) fail('INVALID_REFERENCE','Collection presence projection mismatch');
                                const hasRows=Boolean(stmt(db,`SELECT key FROM ${table} WHERE collection=? LIMIT 1`,['score']));
                                if (!row.present && hasRows) fail('INVALID_REFERENCE','Absent collection has rows');
                                collections[name]=Object.freeze({present:Boolean(row.present),hasRows});
                            }
                            const currentKeys=[],missingFingerprints=[],retiredFingerprints=[];
                            for (const k of recordKeys.filter(k=>k.collection==='score')) {
                                const current=record(db,k),retired=stmt(db,'SELECT key FROM retired WHERE collection=? AND replay_id=? AND fingerprint=?',[k.collection,k.replayId,k.fingerprint]);
                                if (current && retired) fail('INVALID_REFERENCE','Current and retired score identity conflict');
                                if (current) currentKeys.push(Object.freeze(k));
                                else (retired?retiredFingerprints:missingFingerprints).push(k.fingerprint);
                            }
                            recordKeys=[...(logKeys??[]),...currentKeys];
                            scoreFacts=Object.freeze({collections:Object.freeze(collections),currentKeys:Object.freeze(currentKeys),missingFingerprints:Object.freeze(missingFingerprints),retiredFingerprints:Object.freeze(retiredFingerprints)});
                            if (combinedSelection) combinedFacts=Object.freeze(addMeta({logKeys:Object.freeze(logKeys),scores:scoreFacts}));
                        }
                        for (const k of recordKeys) { recordKey(k); const r = addMeta(record(db,k)); if (!r || !['claim','done'].includes(r.status)) fail('UNAVAILABLE','Selected record is missing/not ready');
                            if (stmt(db,'SELECT id FROM operations WHERE collection=? AND replay_id=? AND fingerprint=? LIMIT 1',[k.collection,k.replayId,k.fingerprint])) fail('UNAVAILABLE','Selected record has an unresolved file intent');
                            records.set(recordKey(k),r); collectProperties(db,recordOwner(k)); collect(db,recordOwner(k));
                            const scorePolicy=scoreSelection && k.collection==='score';
                            if (!replays.has(k.replayId)) { const replay = addMeta(stmt(db,'SELECT * FROM replays WHERE key=?',[k.replayId])); if(!replay) fail('UNAVAILABLE','Replay association absent'); replays.set(k.replayId,replay); if (!scorePolicy) collectProperties(db,{kind:'replay',key:k.replayId}); }
                            if (!scorePolicy && r.map_id && !mapIds.includes(r.map_id)) mapIds = [...mapIds,r.map_id];
                            // Resolve by unique owner, not only projected path: a
                            // null projection must not conceal a reservation.
                            const o = addMeta(stmt(db,'SELECT * FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=?',[k.collection,k.replayId,k.fingerprint]));
                            if (scorePolicy) {
                                if (!o) fail('UNAVAILABLE','Score output reservation absent');
                                const prefix=`replay-score-source-${k.replayId}-`,suffix=o.path.slice(prefix.length);
                                if (!o.path.startsWith(prefix) || !(suffix === k.fingerprint.slice(0,12)+'.response' || suffix === k.fingerprint+'.response' || new RegExp(`^${k.fingerprint}-[2-9]\\d*\\.response$`).test(suffix))) fail('INVALID_REFERENCE','Score output filename identity mismatch');
                                assertPathKind(db,o.path,'outputs',new Set());
                            }
                            if (combinedSelection && k.collection==='log' && o) assertPathKind(db,o.path,'outputs',new Set());
                            for (const [pointer,expected] of [['/outputPath',r.output_path],['/outputFingerprint',r.output_hash]]) {
                                const original = properties.get(inlineJson(recordOwner(k))).find(p=>p.pointer === pointer);
                                if (original && (original.payload_pointer !== null || JSON.parse(original.value) !== expected)) fail('INVALID_REFERENCE','Output original/projection mismatch');
                            }
                            if (o || r.output_path !== null || r.output_hash !== null) {
                                if (!o || o.state !== 'ready') fail('UNAVAILABLE','Selected output pending');
                                if (o.path !== r.output_path || o.hash !== r.output_hash) fail('INVALID_REFERENCE','Selected output owner/projection mismatch');
                                const ref = Object.freeze(addMeta({path:o.path,hash:o.hash,bytes:o.bytes})); addFile(ref); outputRefs.set(r.key,ref);
                            } else outputRefs.set(r.key,null);
                        }
                        for (const id of mapIds) {
                            const m = addMeta(stmt(db,'SELECT * FROM maps WHERE key=?',[id]));
                            if (!m) fail('UNAVAILABLE','Selected map absent');
                            maps.set(id,m); collectProperties(db,{kind:'map',key:id});
                            if (m.path) {
                                if (combinedSelection) assertPathKind(db,m.path,'maps',new Set());
                                const file = safePath(root,m.path); let size;
                                try { size = fs.statSync(file).size; } catch (error) { if (error.code === 'ENOENT') fail('UNAVAILABLE','Missing selected map artifact'); throw error; }
                                const ref = Object.freeze(addMeta({path:m.path,hash:m.hash,bytes:size}));
                                addFile(ref); mapRefs.set(id,ref);
                            } else mapRefs.set(id,null);
                        }
                        for (const {recordKey:k,taskId} of reviewKeys) { recordKey(k); const row = addMeta(stmt(db,'SELECT * FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=? AND task=?',[k.collection,k.replayId,k.fingerprint,taskId])); if(!row) fail('UNAVAILABLE','Selected review absent'); reviews.set(inlineJson([k,taskId]),row); const owner={kind:'review',key:inlineJson([recordKey(k),taskId])}; collectProperties(db,owner); collect(db,owner); }
                        // Check represented identity/link projections while the
                        // same metadata transaction and owner lock are held.
                        const originals = (owner,row,fields) => {
                            for (const p of properties.get(inlineJson(owner)) ?? []) {
                                const column = fields[p.pointer]; if (!column) continue;
                                if (p.payload_pointer !== null || JSON.parse(p.value) !== row[column]) fail('INVALID_REFERENCE','Snapshot original/projection mismatch');
                            }
                        };
                        for (const r of records.values()) {
                            originals({kind:'record',key:r.key},r,{'/collection':'collection','/replayId':'replay_id','/fingerprint':'fingerprint','/mapId':'map_id','/buildId':'build_id','/status':'status'});
                            if (r.collection === 'log' && (!r.map_id || r.map_id !== replays.get(r.replay_id)?.map_id || !maps.has(r.map_id))) fail('INVALID_REFERENCE','Snapshot log/map association mismatch');
                            if (combinedSelection && r.collection==='log' && (replays.get(r.replay_id)?.status!=='active' || maps.get(r.map_id)?.status!=='validated')) fail('INVALID_REFERENCE','Combined log association/map is not active/validated');
                        }
                        for (const r of replays.values()) originals({kind:'replay',key:r.key},r,{'/replayId':'key','/mapId':'map_id','/buildId':'build_id','/status':'status'});
                        for (const m of maps.values()) originals({kind:'map',key:m.key},m,{'/mapId':'key','/path':'path','/hash':'hash','/status':'status'});
                        db.exec('COMMIT');
                    } catch (error) { setupFailed = true; throw error; }
                    finally {
                        try { db.close(); }
                        catch (error) { if (!setupFailed) throw error; }
                    }
                },metrics);
                return await callback(view);
            } catch (error) { failed = true; throw error; }
            finally {
                open = false; let cleanupFailed = false, cleanupError;
                for (const h of handles.values()) {
                    try { fs.closeSync(h.fd); }
                    catch (error) { if (!cleanupFailed) { cleanupFailed = true; cleanupError = error; } }
                }
                // A primary setup/analysis error wins; otherwise report the
                // first cleanup failure, after attempting every close once.
                if (!failed && cleanupFailed) throw cleanupError;
            }
        },
    };
    let catalogCallback = false;
    if (schemaVersion === 1) return store;
    return catalogDefinition.attach({root,store,stmt,read,generation,
        write: async callback => {
            // Flag cannot span an await before acquisition: prevent a second
            // caller from changing this handle's adapter while a writer runs.
            if (catalogCallback || inWriter) fail('INVALID_STATE','Nonnested writer required');
            catalogCallback = true;
            try { return await store.withWriter(callback); } finally { catalogCallback = false; }
        },
        snapshot: async action => {
            assertOpen(); return locked(root,async () => {
                const current = currentDescriptor(); if(current.storeId !== d.storeId) fail('UNSUPPORTED_STORE','Snapshot store changed');
                const db=connection(root,current,false,metrics);
                try { db.exec('BEGIN'); const result=action(db); db.exec('COMMIT'); return result; }
                finally { db.close(); }
            },metrics);
        }});
}

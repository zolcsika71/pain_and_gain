// M2c only: explicit synthetic roots, no CLI or production dispatch.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReplayAnalysisSession} from './replay-analysis.js';
import {fail, LIMITS, iterateDiagnostics, iterateJson, jsonChunks, payloadChunks} from './replay-store-payloads.js';

const MiB = 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
const same = (actual, expected, field) => { if (actual !== expected) fail('INVALID_REFERENCE', `${field} original/projection disagreement`); };
const own = (object, key, value) => Object.defineProperty(object, key, {value, enumerable:true, writable:true, configurable:true});
const ownerKey = owner => JSON.stringify(owner);

function encodedSize(value, limit, field) {
    let bytes = 0;
    for (const chunk of jsonChunks(value)) {
        bytes += chunk.length;
        if (bytes > limit) fail('RESOURCE_LIMIT', `${field} exceeds ${limit} encoded bytes`);
    }
    return bytes;
}

// This provenance file is not a capture and is not a fallback to main's build.
function localBuild(root) {
    let current = root;
    for (const name of ['src','debug','build-id.js']) {
        current = path.join(current,name);
        let st;
        try { st = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
        if (st.isSymbolicLink() || (name === 'build-id.js' ? !st.isFile() : !st.isDirectory())) fail('UNSAFE_PATH','Unsafe local build input');
    }
    const fd = fs.openSync(current,fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); let failed = false;
    try {
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.size > 16384) fail('RESOURCE_LIMIT','Local build input exceeds 16 KiB');
        const buffer = Buffer.alloc(st.size); let offset = 0;
        while (offset < buffer.length) {
            const n = fs.readSync(fd,buffer,offset,buffer.length-offset,offset);
            if (!n) fail('INVALID_ARTIFACT','Local build input ended early');
            offset += n;
        }
        return buffer.toString('utf8').match(/export const buildId = '([a-f0-9]{64})'/)?.[1] ?? null;
    } catch (error) { failed = true; throw error; }
    finally { try { fs.closeSync(fd); } catch (error) { if (!failed) throw error; } }
}

async function bytes(view, ref, limit, field, jsonl = false) {
    if (!ref) fail('UNAVAILABLE',`${field} artifact absent`);
    if (!Number.isSafeInteger(ref.bytes) || ref.bytes > limit) fail('RESOURCE_LIMIT',`${field} exceeds ${limit} bytes`);
    const hash = createHash('sha256'), parts = []; let count = 0, lineBytes = 0;
    for await (const part of payloadChunks(view,ref)) {
        hash.update(part); count += part.length;
        if (jsonl) for (const byte of part) {
            if (byte === 10) lineBytes = 0;
            else if (++lineBytes > LIMITS.token) fail('RESOURCE_LIMIT','JSONL line exceeds 1 MiB');
        }
        parts.push(part);
    }
    if (count !== ref.bytes || hash.digest('hex') !== ref.hash) fail('INVALID_ARTIFACT',`${field} hash/length mismatch`);
    return Buffer.concat(parts,count);
}

async function properties(view, owner, budget, recordKey) {
    const rows = view.properties.get(ownerKey(owner));
    if (!rows) fail('INVALID_REFERENCE','Original properties absent');
    const result = {};
    for (const row of rows) {
        if (!/^\/(?:[^~/]|~[01])*$/.test(row.pointer)) fail('UNSUPPORTED_REPRESENTATION','M2c requires top-level original properties');
        const name = row.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');
        let value;
        if (row.payload_pointer !== null) {
            if (owner.kind !== 'record') fail('UNSUPPORTED_REPRESENTATION','Map/replay originals must be inline');
            const ref = view.payload(owner,row.payload_pointer);
            if (ref.parentPointer !== null || ref.owner.kind !== owner.kind || ref.owner.key !== owner.key) fail('INVALID_REFERENCE','Original value requires its owned root');
            if (name === 'otherEntries') {
                if (row.value !== null || row.payload_pointer !== '/otherEntries' || ref.pointer !== '/otherEntries') fail('INVALID_REFERENCE','Diagnostic binding mismatch');
                if (!((typeof ref.items === 'bigint' && ref.items >= 0n) || (Number.isSafeInteger(ref.items) && ref.items >= 0))) fail('INVALID_ARTIFACT','Diagnostic item count invalid');
                value = []; let count = 0n;
                for await (const item of iterateDiagnostics(view,recordKey,{pointer:'/otherEntries'})) {
                    if (item.kind !== 'value') fail('RESOURCE_LIMIT','Diagnostic wrapper exceeds 1 MiB');
                    if (!plain(item.value)) fail('INVALID_JSON','Diagnostic wrapper must be an object');
                    budget.diagnostics += encodedSize(item.value,LIMITS.token,'diagnostic wrapper');
                    if (budget.diagnostics > 16 * MiB) fail('RESOURCE_LIMIT','Diagnostics exceed 16 MiB');
                    value.push(item.value); count++;
                }
                if (count !== BigInt(ref.items)) fail('INVALID_ARTIFACT','Diagnostic item count mismatch');
            } else {
                let count = 0;
                for await (const item of iterateJson(view,ref)) {
                    if (item.kind !== 'value') fail('RESOURCE_LIMIT',`${name} exceeds 1 MiB`);
                    value = item.value; count++;
                }
                if (count !== 1) fail('INVALID_ARTIFACT','Original value absent');
            }
        } else {
            if (name === 'otherEntries' && owner.kind === 'record') fail('UNSUPPORTED_REPRESENTATION','Diagnostics require the exact owned root');
            value = JSON.parse(row.value);
        }
        if (name !== 'otherEntries' || owner.kind !== 'record') {
            budget.metadata += Buffer.byteLength(row.pointer) + encodedSize(value,LIMITS.token,name);
            if (budget.metadata > LIMITS.pageBytes) fail('RESOURCE_LIMIT','Expanded metadata exceeds 8 MiB');
        }
        own(result,name,value);
    }
    if (owner.kind === 'record' && (!Object.hasOwn(result,'reviews') || !Object.hasOwn(result,'otherEntries'))) fail('UNSUPPORTED_REPRESENTATION','Original reviews and diagnostics bindings required');
    return result;
}

function projections(value, row, fields) {
    for (const [field, column] of Object.entries(fields)) if (Object.hasOwn(value,field)) same(value[field],row[column],field);
}

export async function analyzeFixtureReplay(options) {
    if (!plain(options)) fail('INVALID_ARGUMENT','Explicit plain options required');
    const allowed = new Set(['root','schemaVersion','replayId','fingerprints','reportMode']);
    if (Reflect.ownKeys(options).some(k=>!allowed.has(k))) fail('UNSUPPORTED_OPTION','Unsupported fixture analyzer option');
    const {root,schemaVersion,replayId,fingerprints,reportMode='full'} = options;
    if (schemaVersion !== 1 && schemaVersion !== 2) fail('UNSUPPORTED_STORE','Expected schema 1 or 2');
    if (!Array.isArray(fingerprints)) fail('INVALID_IDENTITY','Explicit fingerprints required');
    if (fingerprints.length > LIMITS.sources) fail('RESOURCE_LIMIT','Selection exceeds 64 records');
    if (typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || !fingerprints.length ||
        fingerprints.some(f=>typeof f !== 'string' || !/^[a-f0-9]{64}$/.test(f)) || new Set(fingerprints).size !== fingerprints.length) fail('INVALID_IDENTITY','Invalid/duplicate log selection');
    if (!['full','compact'].includes(reportMode)) fail('INVALID_ARGUMENT','Expected full or compact report');
    const selection = [...fingerprints]; // Caller mutation across awaits cannot change this request.
    const handle = schemaVersion === 1 ? await (await import('./replay-store.js')).openStore({root,mode:'read'}) :
        await (await import('./replay-catalog.js')).openCatalog({root,mode:'read'});
    const store = handle.evidence ?? handle; let failed = false;
    try {
        const localBuildId = localBuild(root);
        const recordKeys = selection.map(fingerprint=>({collection:'log',replayId,fingerprint}));
        return await store.withReadSnapshot({recordKeys},async view => {
            const budget = {metadata:0,diagnostics:0};
            const replayRow = view.replays.get(replayId);
            if (!replayRow) fail('UNAVAILABLE','Selected replay association absent');
            const replay = await properties(view,{kind:'replay',key:replayId},budget);
            projections(replay,replayRow,{replayId:'key',mapId:'map_id',buildId:'build_id',status:'status'});
            same(replay.replayId,replayId,'replay identity');
            if (replay.status !== 'active') fail('INVALID_REFERENCE','Replay association is not active');
            const mapRow = view.maps.get(replay.mapId);
            if (!mapRow) fail('INVALID_REFERENCE','Selected map association mismatch');
            const map = await properties(view,{kind:'map',key:replay.mapId},budget);
            projections(map,mapRow,{mapId:'key',path:'path',hash:'hash',status:'status'});
            same(map.id,mapRow.key,'map identity'); same(map.checksum,mapRow.key,'map checksum');
            same(map.file,mapRow.path,'map file');
            if (typeof map.file !== 'string' || !/^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/.test(map.file)) fail('INVALID_REFERENCE','Unsafe logical map name');
            if (map.status !== 'validated') fail('INVALID_REFERENCE','Map registration is not validated');
            const mapEvidence = Object.create(null);
            mapEvidence[map.file] = {bytes:await bytes(view,view.mapArtifact(map.id),MiB,'map')};
            const records = [], outputs = []; let outputBytes = 0;
            // Relational comparison is exact for the core's Number/BigInt
            // ordinals; Array.sort must receive an ordinary numeric sign.
            const ordered = [...view.records.values()].sort((a,b)=>
                a.ordinal < b.ordinal ? -1 : a.ordinal > b.ordinal ? 1 :
                    a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
            for (const row of ordered) {
                const key = {collection:'log',replayId,fingerprint:row.fingerprint};
                const record = await properties(view,{kind:'record',key:row.key},budget,key);
                projections(record,row,{collection:'collection',replayId:'replay_id',fingerprint:'fingerprint',mapId:'map_id',buildId:'build_id',status:'status',outputPath:'output_path',outputFingerprint:'output_hash'});
                same(record.replayId,replayId,'record replay'); same(record.fingerprint,row.fingerprint,'record fingerprint');
                same(record.mapId,map.id,'record map'); same(record.mapChecksum,map.checksum,'record map checksum'); same(record.mapFile,map.file,'record map file');
                const ref = view.output(key);
                if (ref === null) {
                    same(record.outputPath,null,'output-free path'); same(record.outputFingerprint,null,'output-free hash'); outputs.push(null);
                } else {
                    if (typeof record.outputPath !== 'string' || !/^[a-f0-9]{24}(?:-[a-f0-9]{12,64}(?:-\d+)?)?\.jsonl$/.test(record.outputPath)) fail('INVALID_REFERENCE','Unsafe logical output name');
                    same(record.outputPath,ref.path,'output path'); same(record.outputFingerprint,ref.hash,'output hash');
                    const content = await bytes(view,ref,16*MiB-outputBytes,'JSONL',true); outputBytes += content.length;
                    outputs.push({bytes:content});
                }
                records.push(record);
            }
            const logicalManifest = {version:2,maps:[map],replays:[replay],records};
            const session = createReplayAnalysisSession({replayId,fingerprints:selection,reportMode,localBuildId,logicalManifest,mapEvidence});
            records.forEach((record,i)=>session.acceptRecord(record,outputs[i]));
            return session.finish();
        });
    } catch (error) { failed = true; throw error; }
    finally { try { handle.close(); } catch (error) { if (!failed) throw error; } }
}

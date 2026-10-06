// M2f: explicit synthetic fixtures only; no production dispatch or completion.
import {fail} from './replay-store-payloads.js';

const MAX_INTEGER = 9_223_372_036_854_775_807n;
const names = ['claimedAt','examinedAt','completedAt'];
const next = value => {
    const n = value === undefined ? 0n : BigInt(value) + 1n;
    if (n > MAX_INTEGER) fail('RESOURCE_LIMIT','Checkpoint ordinal/generation exhausted');
    return n;
};
function originals(rows,row,fields) {
    for (const p of rows) {
        if (p.payload_pointer !== null || p.value === null || JSON.parse(p.value) !== row[fields[p.pointer]]) fail('INVALID_REFERENCE','Checkpoint original/projection mismatch');
    }
}
function checkFacts(f,k,taskId) {
    if (f.current && f.retired) fail('INVALID_REFERENCE','Current and retired identity conflict');
    if (!f.current) fail(f.retired ? 'RETIRED_RECORD' : 'MISSING_RECORD','Checkpoint record is not current');
    const r = f.current;
    if (r.key !== JSON.stringify([k.collection,k.replayId,k.fingerprint]) || r.collection !== k.collection || r.replay_id !== k.replayId || r.fingerprint !== k.fingerprint) fail('INVALID_REFERENCE','Checkpoint identity mismatch');
    originals(f.recordProperties,r,{'/collection':'collection','/replayId':'replay_id','/fingerprint':'fingerprint','/mapId':'map_id','/buildId':'build_id','/status':'status','/outputPath':'output_path','/outputFingerprint':'output_hash','/mapChecksum':'map_id','/mapFile':'map_path'});
    if (r.status !== 'claim' || f.intent) fail('NOT_READY','Checkpoint requires claim status without an active intent');
    if (k.collection === 'log') {
        if (!f.replay || !f.map || f.replay.key !== k.replayId || !r.map_id || f.map.key !== r.map_id || f.replay.map_id !== r.map_id || f.replay.status !== 'active' || f.map.status !== 'validated') fail('INVALID_REFERENCE','Checkpoint log association mismatch');
        originals(f.replayProperties,f.replay,{'/replayId':'key','/mapId':'map_id','/buildId':'build_id','/status':'status'});
        originals(f.mapProperties,f.map,{'/mapId':'key','/id':'key','/checksum':'key','/path':'path','/file':'path','/hash':'hash','/status':'status'});
    }
    const o = f.output;
    if (o || r.output_path !== null || r.output_hash !== null || k.collection === 'score') {
        if (!o || o.path !== r.output_path || o.hash !== r.output_hash || o.collection !== k.collection || o.replay_id !== k.replayId || o.fingerprint !== k.fingerprint) fail('INVALID_REFERENCE','Checkpoint output owner/projection mismatch');
        if (o.state !== 'ready') fail('NOT_READY','Checkpoint output reservation is not ready');
        if (k.collection === 'score') {
            const prefix = `replay-score-source-${k.replayId}-`, suffix = o.path.slice(prefix.length);
            if (!o.path.startsWith(prefix) || !(suffix === k.fingerprint.slice(0,12)+'.response' || suffix === k.fingerprint+'.response' || new RegExp(`^${k.fingerprint}-[2-9]\\d*\\.response$`).test(suffix))) fail('INVALID_REFERENCE','Score output filename identity mismatch');
        }
    }
    if (Boolean(f.review) !== Boolean(f.binding) || (f.review && (f.review.owner_key !== f.owner.key || f.review.task !== taskId || f.binding.task !== taskId || f.binding.collection !== k.collection || f.binding.replay_id !== k.replayId || f.binding.fingerprint !== k.fingerprint)) || (!f.review && f.propertyTail)) fail('OWNERSHIP_CONFLICT','Review owner-key binding mismatch');
}
export async function updateFixtureReviewCheckpoint(options) {
    if (options === null || typeof options !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(options))) fail('INVALID_ARGUMENT','Explicit plain options required');
    const allowed = ['root','schemaVersion','collection','replayId','fingerprint','taskId','action'];
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(k=>!allowed.includes(k))) fail('UNSUPPORTED_OPTION','Unsupported checkpoint option');
    if (allowed.some(k=>!Object.hasOwn(descriptors,k) || !Object.hasOwn(descriptors[k],'value'))) fail('INVALID_ARGUMENT','Exactly the required data properties must be supplied');
    const {root,schemaVersion,collection,replayId,fingerprint,taskId,action} = options;
    if (schemaVersion !== 1 && schemaVersion !== 2) fail('UNSUPPORTED_STORE','Expected schema 1 or 2');
    if (typeof root !== 'string') fail('INVALID_ARGUMENT','Explicit root string required');
    if (!['log','score'].includes(collection) || typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) || typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(taskId)) fail('INVALID_IDENTITY','Invalid exact checkpoint identity/task');
    if (action !== 'claim' && action !== 'examined') fail('UNSUPPORTED_OPTION','Expected claim or examined');
    const k = {collection,replayId,fingerprint};
    const handle = schemaVersion === 1 ? await (await import('./replay-store.js')).openStore({root,mode:'write'}) : await (await import('./replay-catalog.js')).openCatalog({root,mode:'write'});
    let failed = false;
    try {
        return await (handle.evidence ?? handle).withWriter(w=>{
            const f = w.readReviewCheckpoint({recordKey:k,taskId});
            // mapFile is an original-only alias of the selected map path.
            if (f.current) f.current.map_path = f.map?.path;
            checkFacts(f,k,taskId);
            const checkpoints = Object.fromEntries(names.map(name=>{
                const p = f.checkpoints.find(p=>p.pointer === '/'+name);
                if (!p) return [name,{present:false}];
                if (p.payload_pointer !== null || p.value === null) fail('UNSUPPORTED_CHECKPOINT','Checkpoint must be inline null or string');
                const value = JSON.parse(p.value);
                if (value !== null && typeof value !== 'string') fail('UNSUPPORTED_CHECKPOINT','Checkpoint must be null or string');
                if (typeof value === 'string' && Buffer.byteLength(value) > 256) fail('RESOURCE_LIMIT','Checkpoint exceeds 256 decoded UTF-8 bytes');
                return [name,{present:true,value}];
            }));
            if (!f.review && action === 'examined') fail('NOT_CLAIMED','Task has not claimed this record');
            const changed = !f.review || (action === 'examined' && (!checkpoints.examinedAt.present || checkpoints.examinedAt.value === null));
            const ordinal = f.review?.ordinal ?? next(f.reviewTail?.ordinal);
            let propertyOrdinal, generation = BigInt(f.generation);
            if (changed) {
                generation = next(generation);
                const now = new Date().toISOString();
                if (!f.review) Object.assign(checkpoints,{claimedAt:{present:true,value:now},examinedAt:{present:true,value:null},completedAt:{present:true,value:null}});
                else {
                    propertyOrdinal = f.checkpoints.find(p=>p.pointer === '/examinedAt')?.ordinal ?? next(f.propertyTail?.ordinal);
                    checkpoints.examinedAt = {present:true,value:now};
                }
            }
            const result = {collection,replayId,fingerprint,taskId,action,changed,recordStatus:'claim',reviewOrdinal:String(ordinal),generation:String(generation),checkpoints};
            if (Buffer.byteLength(JSON.stringify(result)) > 4096) fail('RESOURCE_LIMIT','Checkpoint result exceeds 4 KiB');
            if (changed) w.transaction(tx=>{
                if (!f.review) tx.putReview({recordKey:k,taskId,ordinal,value:Object.fromEntries(names.map(n=>[n,checkpoints[n].value]))});
                else tx.setProperty({owner:f.owner,pointer:'/examinedAt',ordinal:propertyOrdinal,value:checkpoints.examinedAt.value});
            });
            return result;
        });
    } catch (error) { failed = true; throw error; }
    finally { try { handle.close(); } catch (error) { if (!failed) throw error; } }
}

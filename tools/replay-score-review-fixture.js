// M2g: caller-asserted completion on explicit synthetic score fixtures only.
import {fail} from './replay-store-payloads.js';

const MAX_INTEGER = 9_223_372_036_854_775_807n;
const names = ['claimedAt','examinedAt','completedAt'];
const taskPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const json = value => JSON.stringify(value,(_,v)=>typeof v === 'bigint' ? String(v) : v);
const next = value => {
    const n = value === undefined ? 0n : BigInt(value) + 1n;
    if (n > MAX_INTEGER) fail('RESOURCE_LIMIT','Completion ordinal/generation exhausted');
    return n;
};
function parse(raw) {
    try { return JSON.parse(raw); }
    catch { fail('INVALID_REFERENCE','Malformed completion metadata JSON'); }
}
function checkpoints(properties) {
    return Object.fromEntries(names.map(name=>{
        const p = properties.find(p=>p.pointer === '/'+name);
        if (!p) return [name,{present:false}];
        if (p.payload_pointer !== null) fail('UNSUPPORTED_CHECKPOINT','Completion checkpoints must be inline');
        if (p.value === null) fail('INVALID_REFERENCE','Missing inline checkpoint JSON');
        const value = parse(p.value);
        if (value !== null && typeof value !== 'string') fail('UNSUPPORTED_CHECKPOINT','Completion checkpoints must be null or strings');
        if (typeof value === 'string' && Buffer.byteLength(value) > 256) fail('RESOURCE_LIMIT','Checkpoint exceeds 256 decoded UTF-8 bytes');
        return [name,{present:true,value}];
    }));
}
function validate(f,k,taskId) {
    if (f.current && f.retired) fail('INVALID_REFERENCE','Current/retired identity conflict');
    if (!f.current) fail(f.retired ? 'RETIRED_RECORD' : 'MISSING_RECORD','Score is not current');
    const r = f.current, key = JSON.stringify([k.collection,k.replayId,k.fingerprint]);
    if (r.key !== key || r.collection !== k.collection || r.replay_id !== k.replayId || r.fingerprint !== k.fingerprint) fail('INVALID_REFERENCE','Score identity mismatch');
    const fields = {'/collection':'collection','/replayId':'replay_id','/fingerprint':'fingerprint','/mapId':'map_id','/buildId':'build_id','/status':'status','/outputPath':'output_path','/outputFingerprint':'output_hash'};
    for (const p of f.recordProperties) if (p.payload_pointer !== null || p.value === null || parse(p.value) !== r[fields[p.pointer]]) fail('INVALID_REFERENCE','Score original/projection mismatch');
    if (!['claim','done'].includes(r.status) || f.intent) fail('NOT_READY','Completion needs claim/done without an intent');
    const o = f.output;
    if (!o || o.path !== r.output_path || o.hash !== r.output_hash || o.collection !== k.collection || o.replay_id !== k.replayId || o.fingerprint !== k.fingerprint) fail('INVALID_REFERENCE','Score output owner/projection mismatch');
    if (o.state !== 'ready') fail('NOT_READY','Score output reservation is not ready');
    const prefix = `replay-score-source-${k.replayId}-`, suffix = o.path.slice(prefix.length);
    if (!o.path.startsWith(prefix) || !(suffix === k.fingerprint.slice(0,12)+'.response' || suffix === k.fingerprint+'.response' || new RegExp(`^${k.fingerprint}-[2-9]\\d*\\.response$`).test(suffix))) fail('INVALID_REFERENCE','Score output filename identity mismatch');
    if (Boolean(f.review) !== Boolean(f.binding) || (f.review && (f.review.owner_key !== f.owner.key || f.review.task !== taskId || f.binding.task !== taskId || f.binding.collection !== k.collection || f.binding.replay_id !== k.replayId || f.binding.fingerprint !== k.fingerprint)) || (!f.review && f.propertyTail)) fail('OWNERSHIP_CONFLICT','Review owner binding mismatch');
}

export async function completeFixtureScoreReview(options) {
    if (options === null || typeof options !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(options))) fail('INVALID_ARGUMENT','Explicit plain options required');
    const allowed = ['root','schemaVersion','replayId','fingerprint','taskId'], descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(k=>!allowed.includes(k))) fail('UNSUPPORTED_OPTION','Unsupported completion option');
    if (allowed.some(k=>!Object.hasOwn(descriptors,k) || !Object.hasOwn(descriptors[k],'value'))) fail('INVALID_ARGUMENT','Exactly five data properties required');
    const {root,schemaVersion,replayId,fingerprint,taskId} = options;
    if (schemaVersion !== 1 && schemaVersion !== 2) fail('UNSUPPORTED_STORE','Expected schema 1 or 2');
    if (typeof root !== 'string') fail('INVALID_ARGUMENT','Explicit root string required');
    if (typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) || typeof taskId !== 'string' || !taskPattern.test(taskId)) fail('INVALID_IDENTITY','Invalid exact score/task identity');
    const k = {collection:'score',replayId,fingerprint};
    const handle = schemaVersion === 1 ? await (await import('./replay-store.js')).openStore({root,mode:'write'}) : await (await import('./replay-catalog.js')).openCatalog({root,mode:'write'});
    let failed = false;
    try {
        return await (handle.evidence ?? handle).withWriter(w=>{
            const f = w.readScoreCompletionFacts({recordKey:k,taskId});
            validate(f,k,taskId);
            const selected = f.review ? checkpoints(f.checkpoints) : null;
            let completionChanged = false, statusChanged = false;
            if (f.current.status === 'claim') {
                if (!f.review) fail('NOT_CLAIMED','Task has not claimed this score');
                if (!selected.examinedAt.value) fail('NOT_EXAMINED','Score examination required before completion');
                completionChanged = !selected.completedAt.present || selected.completedAt.value === null;
                let after = null, count = 0, selectedCount = 0, allFinished = true, copiedBytes = Buffer.byteLength(json(f));
                do {
                    const page = w.pageScoreReviewCheckpoints({recordKey:k,after});
                    copiedBytes += Buffer.byteLength(json(page));
                    if (copiedBytes > 8*1_048_576) fail('RESOURCE_LIMIT','Completion cumulative metadata exceeds 8 MiB');
                    for (const row of page.rows) {
                        if (++count > 1000) fail('RESOURCE_LIMIT','Completion exceeds 1000 reviewers');
                        if (row.collection !== k.collection || row.replay_id !== replayId || row.fingerprint !== fingerprint || typeof row.task !== 'string' || !taskPattern.test(row.task)) fail('INVALID_REFERENCE','Reviewer identity mismatch');
                        if (row.owner_key !== JSON.stringify([f.current.key,row.task])) fail('OWNERSHIP_CONFLICT','Reviewer owner binding mismatch');
                        const properties = names.flatMap(n=>row[n+'Ordinal'] === null ? [] : [{pointer:'/'+n,ordinal:row[n+'Ordinal'],value:row[n+'Value'],payload_pointer:row[n+'Payload']}]);
                        const state = checkpoints(properties);
                        if (row.task === taskId) {
                            selectedCount++;
                            if (String(row.ordinal) !== String(f.review.ordinal) || json(state) !== json(selected) || names.some(n=>String(properties.find(p=>p.pointer==='/'+n)?.ordinal) !== String(f.checkpoints.find(p=>p.pointer==='/'+n)?.ordinal))) fail('INVALID_REFERENCE','Selected reviewer facts changed');
                        }
                        const complete = row.task === taskId && completionChanged ? true : Boolean(state.completedAt.value);
                        if (!state.examinedAt.value || !complete) allFinished = false;
                    }
                    after = page.cursor;
                } while (after);
                if (selectedCount !== 1) fail('OWNERSHIP_CONFLICT','Selected reviewer missing from locked traversal');
                statusChanged = allFinished;
            }
            const changed = completionChanged || statusChanged;
            let generation = BigInt(f.generation), completionOrdinal, statusOrdinal;
            if (changed) generation = next(generation);
            if (completionChanged) {
                completionOrdinal = f.checkpoints.find(p=>p.pointer === '/completedAt')?.ordinal ?? next(f.propertyTail?.ordinal);
                selected.completedAt = {present:true,value:new Date().toISOString()};
            }
            if (statusChanged) statusOrdinal = f.recordProperties.find(p=>p.pointer === '/status')?.ordinal ?? next(f.recordPropertyTail?.ordinal);
            const result = {collection:'score',replayId,fingerprint,taskId,changed,completionChanged,statusChanged,recordStatus:statusChanged ? 'done' : f.current.status,reviewOrdinal:f.review ? String(f.review.ordinal) : null,generation:String(generation),checkpoints:selected};
            if (Buffer.byteLength(JSON.stringify(result)) > 4096) fail('RESOURCE_LIMIT','Completion result exceeds 4 KiB');
            if (changed) w.transaction(tx=>{
                if (completionChanged) tx.setProperty({owner:f.owner,pointer:'/completedAt',ordinal:completionOrdinal,value:selected.completedAt.value});
                if (statusChanged) tx.setStatus({recordKey:k,status:'done',propertyOrdinal:statusOrdinal});
            });
            return result;
        });
    } catch (error) { failed = true; throw error; }
    finally { try { handle.close(); } catch (error) { if (!failed) throw error; } }
}

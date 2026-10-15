// Selected schema-1 reads, guarded by fixture or production lease; opt-in derived caches.
import {assertConsumerMode} from './replay-production-scope.js';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fail, jsonChunks, LIMITS} from './replay-store-payloads.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';
import {resident, withCleanup} from './retrieval-files.js';
import {openStore} from './replay-store.js';
import {localBuild, loadFixtureLogs} from './replay-analysis-fixture.js';
import {loadFixtureScores} from './replay-score-analysis-fixture.js';
import {analyzeLoadedCombinedReplay, analyzeLoadedScoreReplay} from './replay-analysis.js';
import {buildLoadedHistoricalIndex, validateSelection} from './historical-index.js';
import {screenLoadedEvidence} from './scout-hold-screen.js';
import {cacheSyntheticReport} from './replay-analysis-cache-fixture.js';

const controlBytes = 65536, deadlineMs = 60000;
const id = v => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const task = v => typeof v === 'string' && /^codex\/[a-z0-9-]+$/.test(v);

// Snapshot every consumed nested value before the first await, without invoking accessors.
function snapshot(value, depth = 0, budget = {values:0}) {
    if (++budget.values > 2048 || depth > 16) fail('RESOURCE_LIMIT', 'Selection structure limit');
    if (value === null || ['string','boolean','undefined'].includes(typeof value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') fail('INVALID_ARGUMENT', 'Data-only selection required');
    const array = Array.isArray(value);
    if (!(array ? Object.getPrototypeOf(value) === Array.prototype : [Object.prototype,null].includes(Object.getPrototypeOf(value)))) fail('INVALID_ARGUMENT', 'Ordinary selection objects required');
    const keys = Reflect.ownKeys(value);
    if (array && value.length > 128 || keys.length > 128) fail('RESOURCE_LIMIT', 'Selection property/count limit');
    const copy = array ? [] : Object.create(null);
    for (const key of keys) {
        if (array && key === 'length') continue;
        const d = Object.getOwnPropertyDescriptor(value,key);
        if (typeof key !== 'string' || !Object.hasOwn(d,'value') || !d.enumerable ||
            array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail('INVALID_ARGUMENT', 'Accessor/custom selection unsupported');
        Object.defineProperty(copy,key,{value:snapshot(d.value,depth+1,budget),enumerable:true,writable:true,configurable:true});
    }
    if (array && copy.length !== value.length || array && keys.length !== value.length+1) fail('INVALID_ARGUMENT', 'Sparse selection unsupported');
    return copy;
}
function options(input, allowed) {
    const o = snapshot(input);
    if (!o || Array.isArray(o) || typeof o !== 'object' || Object.keys(o).some(k => !allowed.includes(k))) fail('UNSUPPORTED_OPTION', 'Unsupported consumer options');
    let n = 0; for (const c of jsonChunks(o)) if ((n += c.length) > controlBytes) fail('RESOURCE_LIMIT', 'Selection exceeds 64 KiB');
    assertConsumerMode(o);
    if (typeof o.root !== 'string') fail('UNSAFE_PATH', 'Explicit synthetic root required');
    return o;
}
function fingerprints(values, nonempty = false) {
    if (!Array.isArray(values) || values.some(v => !hash(v)) || new Set(values).size !== values.length || nonempty && !values.length) fail('INVALID_IDENTITY', 'Explicit distinct fingerprints required');
    if (values.length > LIMITS.sources) fail('RESOURCE_LIMIT', 'Selection exceeds 64 sources');
}
function checkTime(start) { if (performance.now()-start > deadlineMs) fail('RESOURCE_LIMIT', 'Consumer cooperative deadline exceeded'); }
function generation(store) { return store.pageRecords({collection:'log',limit:1}).generation; }

// CLI control input only; never a production manifest or an evidence payload reader.
export function readSyntheticSelection(file,root) {
    assertSyntheticFixtureAccess(root);
    resident(file);
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink()) fail('UNSAFE_PATH', 'Regular selection file required');
    if (before.size > controlBytes) fail('RESOURCE_LIMIT', 'Selection exceeds 64 KiB');
    const fd = fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW); let primary;
    try {
        const st = fs.fstatSync(fd);
        if (st.dev !== before.dev || st.ino !== before.ino || st.size !== before.size) fail('CHANGED_INPUT','Selection changed during open');
        const b = Buffer.alloc(st.size); let offset = 0;
        while (offset < b.length) { const n = fs.readSync(fd,b,offset,b.length-offset,offset); if (!n) fail('CHANGED_INPUT','Selection truncated'); offset += n; }
        const end = fs.fstatSync(fd);
        if (end.size !== st.size || end.mtimeMs !== st.mtimeMs || end.ctimeMs !== st.ctimeMs) fail('CHANGED_INPUT','Selection changed during read');
        return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
    } catch (e) { primary = e; throw e; }
    finally { try { fs.closeSync(fd); } catch (e) { if (!primary) throw e; withCleanup(primary,e); } }
}

async function access(root, callback) {
    const [major,minor] = process.versions.node.split('.').map(Number);
    if (major !== 24 || minor < 19 || process.platform !== 'darwin') fail('UNSUPPORTED_RUNTIME','Node 24.19+ on macOS required');
    assertSyntheticFixtureAccess(root);
    const store = await openStore({root,mode:'read'}); let primary;
    try { return await callback(store); }
    catch (e) { primary = e; throw e; }
    finally { try { store.close(); } catch (e) { if (!primary) throw e; withCleanup(primary,e); } }
}

async function selected(store, root, match, taskId, consume) {
    const before = generation(store), replayId = match.replayId;
    const choices = [...match.logFingerprints.map(fingerprint => ({collection:'log',replayId,fingerprint})),
        ...(match.scoreFingerprints ?? []).map(fingerprint => ({collection:'score',replayId,fingerprint}))];
    const facts = choices.map(key => ({key,row:store.getRecord(key)}));
    const logs = facts.filter(f => f.key.collection === 'log' && !f.row.kind).map(f => f.key.fingerprint);
    const scores = facts.filter(f => f.key.collection === 'score' && !f.row.kind).map(f => f.key.fingerprint);
    const association = store.getReplay(replayId), map = association.map_id ? store.getMap(association.map_id) : null;
    const manifest = {version:2,records:[],scoreRecords:[],maps:map && !map.kind ? [{id:map.key,checksum:map.key}] : [],
        replays:association.kind ? [] : [{replayId,mapId:association.map_id,
            retiredFingerprints:facts.filter(f => f.key.collection === 'log' && f.row.kind === 'retired').map(f => f.key.fingerprint)}],
        retiredScoreSources:facts.filter(f => f.key.collection === 'score' && f.row.kind === 'retired').map(f => ({replayId,fingerprint:f.key.fingerprint}))};
    let result;
    if (!logs.length && !scores.length) result = consume({manifest,analysis:null,logEvidence:new Map(),isClaimed:()=>false});
    else {
        const request = logs.length && scores.length ? {combinedSelection:{replayId,logFingerprints:logs,scoreFingerprints:scores}}
            : scores.length ? {scoreSelection:{replayId,fingerprints:scores}}
                : {recordKeys:logs.map(fingerprint => ({collection:'log',replayId,fingerprint}))};
        result = await store.withReadSnapshot({...request,claimTaskId:taskId},async view => {
            const budget = {combined:true,metadata:0,diagnostics:0,raw:0};
            const loaded = logs.length ? await loadFixtureLogs(view,{replayId,budget}) : {logicalManifest:manifest,mapEvidence:{},logEvidence:new Map()};
            const score = scores.length ? await loadFixtureScores(view,{replayId,budget}) : {scoreRecords:[],sourceEvidence:new Map()};
            loaded.logicalManifest.scoreRecords = score.scoreRecords;
            // Availability facts supplement only explicitly requested unavailable identities.
            loaded.logicalManifest.retiredScoreSources = manifest.retiredScoreSources;
            if (logs.length) {
                const history = loaded.logicalManifest.replays[0].retiredFingerprints ?? [];
                if (!Array.isArray(history)) fail('INVALID_REFERENCE','Invalid selected replay history');
                for (const f of facts.filter(f => f.key.collection === 'log')) if (history.includes(f.key.fingerprint) !== (f.row.kind === 'retired')) fail('INVALID_REFERENCE','Selected history/index disagreement');
            }
            const claims=new Map();
            for (const [collection,records] of [['log',loaded.logicalManifest.records],['score',score.scoreRecords]])for(const r of records){
                const k={collection,replayId,fingerprint:r.fingerprint},row=view.reviews.get(JSON.stringify([k,taskId]));let claimed;
                if(row){
                    const owner={kind:'review',key:JSON.stringify([JSON.stringify([collection,replayId,r.fingerprint]),taskId])};
                    const p=view.properties.get(JSON.stringify(owner))?.find(p=>p.pointer==='/claimedAt');
                    if(!p||p.payload_pointer!==null||p.value===null)fail('UNSUPPORTED_REPRESENTATION','Claim checkpoint must be inline');
                    const value=JSON.parse(p.value);if(value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>256))fail('INVALID_REFERENCE','Invalid claim checkpoint');
                    if(row.value!==null&&JSON.parse(row.value).claimedAt!==value)fail('INVALID_REFERENCE','Claim inline/original disagreement');
                    claimed=Boolean(value);
                }else claimed=Boolean(r.reviews?.[taskId]?.claimedAt);
                if(!claimed)fail('UNCLAIMED',`Claim ${replayId}/${r.fingerprint} for ${taskId} before analysis`);claims.set(r,true);
            }
            const localBuildId = localBuild(root);
            const analysis = logs.length ? analyzeLoadedCombinedReplay({...loaded,sourceEvidence:score.sourceEvidence,replayId,fingerprints:logs,
                ...(scores.length ? {scoreFingerprints:scores} : {}),reportMode:'compact',localBuildId})
                : analyzeLoadedScoreReplay({replayId,scoreFingerprints:scores,reportMode:'compact',localBuildId,
                    scoreCollectionPresent:view.scoreSelection().collections.scoreRecords.present,...score});
            return consume({manifest:loaded.logicalManifest,analysis,logEvidence:loaded.logEvidence,isClaimed:r=>claims.has(r),generation:before,localBuildId});
        });
    }
    if (generation(store) !== before) fail('CHANGED_INPUT','Store changed while assembling historical/screen selection');
    return result;
}

export async function buildSyntheticHistoricalIndex(input) {
    const o = options(input,['synthetic','production','root','selection','cache']); validateSelection(o.selection);
    if(Object.hasOwn(o,'cache')&&typeof o.cache!=='boolean')fail('INVALID_ARGUMENT','Explicit boolean cache option required');
    if (!task(o.selection.taskId)) fail('INVALID_IDENTITY','Exact historical task ID required');
    let count = 0;
    for (const m of o.selection.matches) {
        if (!id(m.replayId) || m.configuration.expectedBuildId !== null && !hash(m.configuration.expectedBuildId)) fail('INVALID_IDENTITY','Exact historical replay/build required');
        fingerprints(m.logFingerprints); fingerprints(m.scoreFingerprints ?? []);
        count += m.logFingerprints.length + (m.scoreFingerprints?.length ?? 0);
    }
    if (count > LIMITS.sources) fail('RESOURCE_LIMIT','Historical request exceeds 64 sources');
    return access(o.root,async store => {
        const start = performance.now(), matches = []; let header;
        for (const match of o.selection.matches) {
            checkTime(start);
            const index = await selected(store,o.root,match,o.selection.taskId,({manifest,analysis,isClaimed,generation,localBuildId}) =>
                buildLoadedHistoricalIndex({selection:{...o.selection,matches:[match]},manifest,
                    isClaimed,reportFor:() => o.cache ? cacheSyntheticReport({root:o.root,store,domain:'historical-store-v3-v1',generation,
                        inputs:{match,manifest:cacheManifest(manifest),localBuildId},report:analysis}) : ({report:analysis,cache:'disabled'})}));
            header = index; matches.push(index.matches[0]); checkTime(start);
        }
        return {...header,matches};
    });
}

export async function screenSyntheticReplay(input) {
    const o = options(input,['synthetic','production','root','replayId','taskId','expectedBuildId','fingerprints','cache']);
    if(Object.hasOwn(o,'cache')&&typeof o.cache!=='boolean')fail('INVALID_ARGUMENT','Explicit boolean cache option required');
    if (!id(o.replayId) || !task(o.taskId) || !hash(o.expectedBuildId)) fail('INVALID_IDENTITY','Explicit replay/task/build required');
    fingerprints(o.fingerprints,true);
    return access(o.root,async store => {
        const start = performance.now();
        const result = await selected(store,o.root,{replayId:o.replayId,logFingerprints:o.fingerprints},o.taskId,({manifest,analysis,logEvidence,generation,localBuildId}) => {
            const records = manifest.records.slice().sort((a,b) => a.fingerprint.localeCompare(b.fingerprint));
            if (records.length !== o.fingerprints.length) fail('UNAVAILABLE','Every screened log must be current');
            if (records.some(r => r.buildId !== o.expectedBuildId)) fail('IDENTITY_CONFLICT','Replay log build does not match expected build');
            if (analysis.summary.fail || analysis.evidenceSummary.trustedLogRecords !== records.length) fail('INVALID_EVIDENCE','Managed evidence did not pass replay analyzer validation');
            checkTime(start);
            const report=screenLoadedEvidence({replayId:o.replayId,records,analysis,outputBytes:r => logEvidence.get(r).bytes});
            return o.cache ? cacheSyntheticReport({root:o.root,store,domain:'scout-hold-store-v3-v1',generation,
                inputs:{replayId:o.replayId,fingerprints:o.fingerprints,expectedBuildId:o.expectedBuildId,manifest:cacheManifest(manifest),localBuildId},report}) : {report,cache:'disabled'};
        });
        checkTime(start); return result;
    });
}

function cacheManifest(manifest){
    return {...manifest,records:manifest.records.map(({reviews,...record})=>record),scoreRecords:(manifest.scoreRecords??[]).map(({reviews,...record})=>record)};
}

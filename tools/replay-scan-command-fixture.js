// Finite selected log-cache discovery; fixture guard or production lease, never a service.
import {assertConsumerMode,consumerMode,productionCacheCapacity} from './replay-production-scope.js';
import fs from 'node:fs';import path from 'node:path';import {performance} from 'node:perf_hooks';import {setTimeout as delay,setImmediate as yieldTurn} from 'node:timers/promises';import {Buffer} from 'node:buffer';
import {importSyntheticCache,importRehearsalCache,inspectRehearsalCacheFile,inspectSyntheticCacheRoot,inspectSyntheticCacheFile,inspectProductionCachePage,syntheticImportLimits,importTraversalBudget,importControlRows} from './replay-import-command-fixture.js';
import {rehearsalCacheDetails,rehearsalCacheFiles} from './replay-rehearsal-cache-scope.js';
import {listSyntheticLogs} from './replay-lifecycle-command-fixture.js';
import {openStore,openRehearsalStore} from './replay-store.js';import {fail} from './replay-store-payloads.js';import {resident,withCleanup} from './retrieval-files.js';
import {authorityV2Boundary} from './replay-authority-guard.js';
import {createHash} from 'node:crypto';

export const SCAN_LIMITS=Object.freeze({files:64,cycleBytes:16*1048576,discoveryBytes:64*1048576,attemptBytes:128*1048576,attempts:128,retries:5,cycles:3,pollMs:2000,deadlineMs:180000,reportBytes:1048576});
const plain=o=>o&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
function data(o,keys){if(!plain(o))fail('INVALID_ARGUMENT','Plain scan options required');const copy={};for(const k of Reflect.ownKeys(o)){const d=Object.getOwnPropertyDescriptor(o,k);if(!keys.includes(k)||!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Unsupported/accessor scan option');copy[k]=d.value;}return copy;}
function request(options,backend){const o=data(options,['synthetic','production','root','sourceRoot','limits','signal']);if(!backend?.rehearsal)assertConsumerMode(o);const capacity=backend?.rehearsal?backend.capacity:productionCacheCapacity(o.root),limits={...SCAN_LIMITS};if(capacity)for(const k of ['files','entries','directoryIterations','cycleBytes','discoveryBytes','attemptBytes','attempts','reportBytes'])limits[k]=capacity[k];for(const[k,v]of Object.entries(o.limits===undefined?{}:data(o.limits,Object.keys(limits)))){if(!Number.isSafeInteger(v)||v<1||v>limits[k])fail('RESOURCE_LIMIT','Reduced finite scan limits required');limits[k]=v;}
    // Intrinsic brand check; do not trust an overridden aborted accessor.
    if(o.signal!==undefined)Reflect.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(o.signal);
    return{...o,limits:Object.freeze(limits),capacity};
}
const aborted=signal=>signal!==undefined&&Reflect.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal);
function event(result,source){const r=result.record;return r?{source,event:result.kind,replayId:r.replayId,fingerprint:r.fingerprint,outputPath:r.outputPath,mapId:r.mapId,mapFile:r.mapFile,buildId:r.buildId??null,status:r.status,coverage:r.coverage,diagnosticCoverage:r.diagnosticCoverage,otherEntries:r.otherEntries.length}:{source,event:result.kind,replayId:result.replayId,fingerprint:result.fingerprint,mapId:result.mapId,mapFile:result.mapFile,message:result.message};}
async function pending(root,check,rehearsal){const limits=rehearsal?.importBudget??importTraversalBudget(root),s=rehearsal?await openRehearsalStore(rehearsal.scope,'read'):await openStore({root,mode:'read'});let failed=false,primary;
    try{const generation=String(s.pageProperties({kind:'root',key:'root'}).generation);let found=null;
        for(const row of importControlRows(s,limits,check)){
            if(row.pointer==='/boundedFixtureConversionV1'){if(row.value===null||row.payload_pointer!==null)fail('INVALID_REFERENCE','Invalid conversion commitment');const cp=JSON.parse(row.value);if(cp.phase!=='verified'||cp.current!==null)fail('NOT_READY','Finish conversion before scan reconciliation');continue;}
            if(!row.pointer.startsWith('/syntheticCacheImportV1/')&&!row.pointer.startsWith('/syntheticLocalLogV1/'))continue;
            if(row.value===null||row.payload_pointer!==null)fail('INVALID_REFERENCE','Invalid import commitment');const cp=JSON.parse(row.value);
            if(!['prepared','reserved','published','verified'].includes(cp.phase))fail('INVALID_REFERENCE','Unknown import phase');
            if(cp.phase!=='verified'){if(found||row.pointer.startsWith('/syntheticLocalLogV1/'))fail('NOT_READY','Resume the exact unfinished import/adoption');found=cp;}
        }
        let cursor=null,count=0;do{check();const operations=s.pageOperations(cursor);count+=operations.rows.length;if(count>limits.operations)fail('RESOURCE_LIMIT','Scan operation budget exceeded');if(String(operations.generation)!==generation)fail('STALE_CURSOR','Import state changed during inspection');if(!found&&operations.rows.some(r=>r.phase==='publish'))fail('NOT_READY','Pending publication lacks an exact supported commitment');cursor=operations.cursor;}while(cursor);return found;
    }
    catch(e){failed=true;primary=e;throw e;}finally{try{s.close();}catch(e){if(!failed){if(e instanceof Error)e.scanCleanupUncertain=true;throw e;}if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Scan checkpoint and close failed',{cause:primary});}}
}
export async function scanSyntheticCache(options){return run(options,false);}
export async function watchSyntheticCache(options){return run(options,true);}
// One exact, sorted approved log selection. No directory discovery or watch.
export async function scanRehearsalCache(token,options={}){
    const d=rehearsalCacheDetails(token);if(d.operation!=='scan')fail('UNSUPPORTED_OPTION','Scan capability required');
    const selected=rehearsalCacheFiles(token),o=data(options,['limits','signal']);
    const backend={rehearsal:true,capacity:d.capacity,sourcePath:name=>name,
        inspect:name=>{const v=inspectRehearsalCacheFile(token,name,'log');delete v.parsed;return v;},
        import:name=>importRehearsalCache(token,name,'log'),pending:()=>pending(d.root,()=>{},d),
        matches:(cp,e)=>path.join(cp.source?.sourceRoot??'',cp.source?.sourceFile??'')===e.name&&cp.source?.sourceScopeHash===e.sourceScopeHash,
        inventory:()=>selected.map(f=>({name:f.path,bytes:f.bytes})),
        list:async()=>{const s=await openRehearsalStore(d.scope,'write');let primary;try{return await s.withWriter(w=>{
            // This capability admits inputs, not lifecycle deletion or status migration.
            let after=null,n=0;do{const page=s.pageRecords({collection:'log',after});for(const row of page.rows){if(++n>d.importBudget.logs)fail('RESOURCE_LIMIT','Rehearsal corpus bound');if(row.status!=='claim')fail('UNSUPPORTED_STATE','Rehearsal scan requires neutral reconciliation');}after=page.cursor;}while(after);
            return w.reconcileLogList();});}catch(e){primary=e;throw e;}finally{try{s.close();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Rehearsal list and close',{cause:primary});else throw e;}}}};
    return run({root:d.root,sourceRoot:'',...o},false,backend);
}
// Reuse the finite discovery/retry/shutdown loop with v2's existing importer and
// reconciliation. Access is possible only inside a selected restored-v2 lease.
export async function scanRestoredV2Cache(options,watch,backend){
    if(authorityV2Boundary(options.root,'scan')!==true)fail('AUTHORITY_REQUIRED','Bounded restored-v2 scan required');
    return run(options,watch,backend);
}
async function run(options,watch,backend){
    const o=request(options,backend),L=o.limits,start=performance.now(),seen=new Map(),identities=new Set();
    const sourcePath=name=>backend?.sourcePath?backend.sourcePath(name):path.join(o.sourceRoot,name);
    const state={mode:watch?'watch':'scan',cycles:0,attempts:0,attemptBytes:0,discoveryBytes:0,events:[],reconciliation:null,recovered:false,shutdownConfirmed:false,...(o.capacity?{discovery:{maxPage:0,pages:0,ignoredDirectories:0,directoryIterations:0,inspected:0}}:{})};let reportBytes=0,rootIdentity;
    const check=()=>{if(performance.now()-start>L.deadlineMs)fail('RESOURCE_LIMIT','Synthetic scan deadline exhausted');if(aborted(o.signal))fail('CANCELLED','Synthetic scan cancelled');};
    const emit=e=>{reportBytes+=Buffer.byteLength(JSON.stringify(e));if(reportBytes>L.reportBytes)fail('RESOURCE_LIMIT','Scan report exceeds bound');state.events.push(e);};
    const guard=()=>{if(backend)backend.guard();else inspectSyntheticCacheRoot({...consumerMode(o.root),root:o.root,sourceRoot:o.sourceRoot});const st=resident(o.sourceRoot,true),id=`${st.dev}:${st.ino}`;if(rootIdentity!==undefined&&id!==rootIdentity)fail('CHANGED_INPUT','Cache directory identity changed');rootIdentity=id;};
    const pendingNow=()=>backend?backend.pending():pending(o.root,check);
    function names(){guard();const dir=fs.opendirSync(o.sourceRoot),out=[];let failed=false,primary,examined=0;
        try{for(let d;(d=dir.readSync());){check();if(++examined>L.files+1)fail('RESOURCE_LIMIT','Directory iteration budget exceeded');if(d.name==='.synthetic-cache-fixture')continue;if(out.length>=L.files)fail('RESOURCE_LIMIT','Cache directory file cap exceeded');if(!/^[A-Za-z0-9._-]{1,120}$/.test(d.name)||['.','..'].includes(d.name))fail('UNSAFE_PATH','Unsafe cache name');const st=resident(path.join(o.sourceRoot,d.name));if(!st.isFile()||st.nlink!==1)fail('UNSAFE_PATH','Independent cache file required');if(st.size>syntheticImportLimits.cache)fail('RESOURCE_LIMIT','Selected cache exceeds 1 MiB');out.push({name:d.name,bytes:st.size});}return out.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);}
        catch(e){failed=true;primary=e;throw e;}finally{try{dir.closeSync();}catch(e){if(!failed){if(e instanceof Error)e.scanCleanupUncertain=true;throw e;}if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Discovery and directory close failed',{cause:primary});}}
    }
    function inspect(item){check();if(state.discoveryBytes+(o.capacity?item.bytes:syntheticImportLimits.cache)>L.discoveryBytes)fail('RESOURCE_LIMIT','Discovery byte budget exhausted');const value=backend?backend.inspect(item.name):inspectSyntheticCacheFile({...consumerMode(o.root),root:o.root,sourceRoot:o.sourceRoot,sourceFile:item.name,collection:'log'});state.discoveryBytes+=value.bytes;if(value.bytes!==item.bytes)fail('CHANGED_INPUT','Cache length changed during discovery');return value;}
    // Metadata keyset pages: every bounded directory walk selects only the next
    // 128 names. Never retain all directory entries or decoded responses.
    async function* pagedItems(){
        guard();const initial=resident(o.sourceRoot,true),same=()=>{const s=resident(o.sourceRoot,true);if(['dev','ino','mtimeMs','ctimeMs'].some(k=>s[k]!==initial[k]))fail('CHANGED_INPUT','Directory changed during paged discovery');};let after=null,bytes=0;
        for(;;){await yieldTurn();check();same();const selected=[],dir=fs.opendirSync(o.sourceRoot);let primary,failed=false,entries=0,files=0,directories=0;
            try{let e;while((e=dir.readSync())){check();if(++state.discovery.directoryIterations>L.directoryIterations||++entries>L.entries)fail('RESOURCE_LIMIT','Directory iteration budget exceeded');if(e.name==='.synthetic-cache-fixture')continue;if(e.isDirectory()){directories++;continue;}if(!e.isFile())fail('UNSAFE_PATH','Nonregular cache entry');if(++files>L.files)fail('RESOURCE_LIMIT','Cache directory file cap exceeded');if(!/^[A-Za-z0-9._-]{1,120}$/.test(e.name)||['.','..'].includes(e.name))fail('UNSAFE_PATH','Unsafe cache name');if(after!==null&&e.name<=after)continue;let i=0;while(i<selected.length&&selected[i]<e.name)i++;if(i<128){selected.splice(i,0,e.name);if(selected.length>128)selected.pop();}}}
            catch(e){failed=true;primary=e;throw e;}finally{try{dir.closeSync();}catch(e){if(!failed){if(e instanceof Error)e.scanCleanupUncertain=true;throw e;}if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Discovery and directory close failed',{cause:primary});}}
            same();state.discovery.pages++;state.discovery.maxPage=Math.max(state.discovery.maxPage,selected.length);state.discovery.ignoredDirectories=Math.max(state.discovery.ignoredDirectories,directories);
            let pageBytes=0;for(const name of selected){check();const st=resident(path.join(o.sourceRoot,name));if(!st.isFile()||st.nlink!==1)fail('UNSAFE_PATH','Independent cache file required');if(st.size>syntheticImportLimits.cache)fail('RESOURCE_LIMIT','Selected cache exceeds 1 MiB');pageBytes+=st.size;bytes+=st.size;if(!Number.isSafeInteger(bytes)||bytes>L.cycleBytes)fail('RESOURCE_LIMIT','Cache cycle byte budget exceeded');identities.add(name);if(identities.size>L.files)fail('RESOURCE_LIMIT','Cumulative filename budget exceeded');}
            if(state.discoveryBytes+pageBytes>L.discoveryBytes)fail('RESOURCE_LIMIT','Discovery byte budget exhausted');
            const page=inspectProductionCachePage({...consumerMode(o.root),root:o.root,sourceRoot:o.sourceRoot,sourceFile:'page-check',collection:'log'},selected,Math.min(128*syntheticImportLimits.cache,L.discoveryBytes-state.discoveryBytes,L.cycleBytes-(bytes-pageBytes)));state.discoveryBytes+=page.reduce((n,item)=>n+item.bytes,0);if(page.reduce((n,item)=>n+item.bytes,0)!==pageBytes)fail('CHANGED_INPUT','Cache length changed during discovery');
            for(const item of page){check();state.discovery.inspected++;yield item;if(state.discovery.inspected%16===0){await yieldTurn();check();}}
            if(selected.length<128){same();return;}after=selected.at(-1);
        }
    }
    async function inventory(){if(backend?.inventory){const entries=backend.inventory();if(entries.length>L.files||entries.reduce((n,e)=>n+e.bytes,0)>L.cycleBytes)fail('RESOURCE_LIMIT','Approved scan inventory exceeds bound');const h=createHash('sha256');async function* items(){for(const e of entries){await yieldTurn();check();yield{...e,...inspect(e)};}}for await(const e of items())h.update(JSON.stringify(e)+'\n');return{signature:h.digest('hex'),[Symbol.asyncIterator]:items};}if(o.capacity){const h=createHash('sha256');let count=0;for await(const item of pagedItems()){h.update(JSON.stringify(item)+'\n');count++;}return{signature:h.update(String(count)).digest('hex'),[Symbol.asyncIterator]:()=>pagedItems()};}const entries=names();if(entries.reduce((n,e)=>n+e.bytes,0)>L.cycleBytes)fail('RESOURCE_LIMIT','Cache cycle byte budget exceeded');for(const e of entries){identities.add(e.name);if(identities.size>L.files)fail('RESOURCE_LIMIT','Cumulative filename budget exceeded');}return entries.map(item=>({...item,...inspect(item)}));}
    async function stable(before){const after=await inventory();if(o.capacity?before.signature!==after.signature:JSON.stringify(after)!==JSON.stringify(before))fail('CHANGED_INPUT','Cache changed during scan; retained partial work requires explicit retry');}
    async function attempt(item){await yieldTurn();check();const old=seen.get(item.name),attempts=old?.cacheHash===item.cacheHash?old.attempts+1:1;if(attempts>L.retries||state.attempts>=L.attempts||state.attemptBytes+item.bytes>L.attemptBytes)fail('RESOURCE_LIMIT','Scan attempt budget exhausted');
        state.attempts++;state.attemptBytes+=item.bytes;seen.set(item.name,{cacheHash:item.cacheHash,attempts,kind:'in-progress'});
        const current=inspect(item);if(current.cacheHash!==item.cacheHash)fail('CHANGED_INPUT','Source changed before import');
        const result=backend?await backend.import(item.name):await importSyntheticCache({...consumerMode(o.root),root:o.root,sourceRoot:o.sourceRoot,sourceFile:item.name,collection:'log'});
        await yieldTurn();check();if(inspect(item).cacheHash!==item.cacheHash)fail('CHANGED_INPUT','Source changed across import');
        if(!['imported','mapped','deduplicated','deferred'].includes(result.kind))fail('UNSUPPORTED_STATE','Unexpected import outcome');seen.set(item.name,{cacheHash:item.cacheHash,attempts,kind:result.kind});return result;
    }
    async function recover(entries){const cp=await pendingNow();check();
        if(cp){let selected;for await(const e of entries)if(backend?.matches?backend.matches(cp,e):e.name===cp.source?.sourceFile){selected=e;break;}if((!backend?.matches&&cp.source?.sourceRoot!==o.sourceRoot)||!selected||selected.cacheHash!==cp.source?.cacheHash||selected.markerHash!==cp.source?.markerHash)fail('CHANGED_INPUT','Exact pending source is missing/changed/outside selected cache');const result=await attempt(selected);if(result.kind==='deferred')fail('NOT_READY','Pending import did not recover');emit({...event(result,sourcePath(selected.name)),recovered:true});state.recovered=true;}
    }
    try{
        check();let entries=await inventory();await recover(entries);
        const reconciled=backend?await backend.list():await listSyntheticLogs({...consumerMode(o.root),root:o.root});state.reconciliation={migrated:reconciled.migrated,retired:reconciled.retired,generation:reconciled.generation,survivors:reconciled.records.length};check();
        for(let cycle=0;cycle<(watch?L.cycles:1);cycle++){
            if(cycle){entries=await inventory();await recover(entries);}check();let mapMayHaveArrived=false;const deferred=[];
            for await(const item of entries){const old=seen.get(item.name);if(old?.cacheHash===item.cacheHash&&['mapped','imported','deduplicated','unrelated'].includes(old.kind))continue;if(item.classification==='unrelated'){seen.set(item.name,{cacheHash:item.cacheHash,attempts:0,kind:'unrelated'});emit({source:sourcePath(item.name),event:'unrelated'});await yieldTurn();check();continue;}const result=await attempt(item);if(result.kind==='deferred')deferred.push({item,result});else{emit(event(result,sourcePath(item.name)));if(['mapped','imported'].includes(result.kind))mapMayHaveArrived=true;}}
            for(const d of deferred){const result=mapMayHaveArrived?await attempt(d.item):d.result;emit(event(result,sourcePath(d.item.name)));}
            await stable(entries);if(await pendingNow())fail('NOT_READY','Concurrent unfinished import prevents scan completion');state.cycles++;check();
            if(!watch||cycle+1===L.cycles)break;
            if(performance.now()-start+L.pollMs>L.deadlineMs)fail('RESOURCE_LIMIT','Insufficient watch deadline for next poll');
            try{await delay(L.pollMs,undefined,{signal:o.signal});}catch(e){if(!aborted(o.signal))throw e;}check();
        }
        if([...seen.values()].some(v=>v.kind==='deferred'))fail('DEFERRED_INPUT','Unresolved mapless logs remain; no complete scan claimed');
        return{...state,complete:true,shutdownConfirmed:true,stopReason:watch?'cycles-complete':'scan-complete',durationMs:performance.now()-start};
    }catch(error){const cleanupUncertain=Boolean(error?.scanCleanupUncertain||error?.cleanupFailures?.length||error instanceof AggregateError&&error.errors.length>1);const stopped={...state,complete:false,executionStopped:true,shutdownConfirmed:!cleanupUncertain,cleanupUncertain,durationMs:performance.now()-start};if(error?.code==='CANCELLED')return{...stopped,stopReason:'cancelled'};if(error instanceof Error){error.scanState=stopped;throw error;}const combined=new AggregateError([error],'Synthetic scan failed',{cause:error});combined.scanState=stopped;throw combined;}
}

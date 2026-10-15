// Explicit isolated rehearsal consumers. No production selector or fixture relabelling.
import fs from 'node:fs';
import path from 'node:path';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {authorizeBackupRehearsal,authorizeRehearsalLineage,rehearsalDetails,rehearsalDestination,rehearsalLineage,rehearsalOptions,verifyRehearsalSource,REHEARSAL_LINEAGE} from './replay-rehearsal-scope.js';
import {openRehearsalStore,withRehearsalAuthorityLock} from './replay-store.js';
import {AUTHORITY_FILE,MEMBER_FILE,authorityControl,authorityLease} from './replay-authority-guard.js';
import {need,equal,digest,recoveryBudget,exclusiveControl,writeRecoveryControl,readControl} from './replay-sqlite-recovery-data.js';
import {withCleanup} from './retrieval-files.js';
import {updateRehearsalReviewCheckpoint} from './replay-review-fixture.js';
import {listRehearsalMaps} from './replay-maintenance-command-fixture.js';
import {loadFixtureLogs} from './replay-analysis-fixture.js';
import {loadFixtureScores} from './replay-score-analysis-fixture.js';
import {createReplayAnalysisSession,analyzeLoadedScoreReplay,analyzeLoadedCombinedReplay} from './replay-analysis.js';
import {authorizeRehearsalCache,rehearsalCacheFiles} from './replay-rehearsal-cache-scope.js';
import {importRehearsalCache,classifyRehearsalCacheFile} from './replay-import-command-fixture.js';
import {scanRehearsalCache} from './replay-scan-command-fixture.js';
import {digestChunks,jsonChunks} from './replay-store-payloads.js';

// Private bounded JSON snapshot before any await; no accessors or inherited options.
export function rehearsalCommandOptions(value,depth=0,b={nodes:0,bytes:0}){
    need(depth<=16&&++b.nodes<=4096,'RESOURCE_LIMIT');
    if(value===null||['string','boolean','number'].includes(typeof value)){
        need(typeof value!=='number'||Number.isFinite(value),'INVALID_ARGUMENT');b.bytes+=Buffer.byteLength(JSON.stringify(value));need(b.bytes<=65536,'RESOURCE_LIMIT');return value;
    }
    need(value&&(Array.isArray(value)?Object.getPrototypeOf(value)===Array.prototype:Object.getPrototypeOf(value)===Object.prototype),'INVALID_ARGUMENT');
    const out=Array.isArray(value)?[]:{};let n=0;
    for(const k of Reflect.ownKeys(value)){if(Array.isArray(value)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(value,k);need(typeof k==='string'&&Object.hasOwn(d,'value')&&d.enumerable,'INVALID_ARGUMENT');
        if(Array.isArray(value))need(k===String(n++),'INVALID_ARGUMENT');b.bytes+=Buffer.byteLength(k);need(b.bytes<=65536,'RESOURCE_LIMIT');Object.defineProperty(out,k,{value:rehearsalCommandOptions(d.value,depth+1,b),enumerable:true});}
    if(Array.isArray(value))need(n===value.length,'INVALID_ARGUMENT');return out;
}
async function using(scope,mode,fn){const s=await openRehearsalStore(scope,mode);let primary;try{return await fn(s);}catch(e){primary=e;throw e;}finally{try{s.close();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Rehearsal operation/cleanup',{cause:primary});else throw e;}}}
export function rehearsalSelectedState(scope){
    const root=rehearsalDestination(scope),lineage=rehearsalLineage(scope),got=authorityControl(path.join(root,AUTHORITY_FILE)),s=got.value;
    need(s.backend!=='sqlite-recovery-fenced','RECOVERY_REQUIRED');
    const descriptor=authorityControl(path.join(root,'manifest.json'));
    const expected={scope:'rehearsal-authority-v1',productionAuthority:false,storeId:lineage.storeId,descriptorHash:lineage.descriptorHash,backend:'sqlite',target:root,epoch:0,rollback:null,lineageHash:authorityControl(path.join(root,REHEARSAL_LINEAGE)).hash};
    // The lineage file was residency/hash checked by rehearsalDestination.
    need(equal(s,expected)&&descriptor.hash===lineage.descriptorHash&&equal(descriptor.value.rehearsal,lineage.binding),'AUTHORITY_CONFLICT');
    if(root!==lineage.initialRoot){const b=recoveryBudget(),intent=readControl(path.join(root,'sqlite-restore-intent.json'),b).value,receipt=readControl(path.join(root,'sqlite-restore-receipt.json'),b).value;
        need(equal(intent,receipt)&&intent.version===1&&intent.productionAuthority===false&&intent.destination===root&&intent.storeId===lineage.storeId&&intent.lineageHash===expected.lineageHash,'CHANGED_BINDING');}
    need(equal(authorityControl(path.join(root,MEMBER_FILE)).value,{anchor:root,storeId:s.storeId,productionAuthority:false}),'AUTHORITY_CONFLICT');return got;
}
export async function selectRehearsalAuthority(input){
    const o=rehearsalOptions(input,['authorization','fault']);need(o.fault===undefined||typeof o.fault==='function','INVALID_ARGUMENT');
    const scope=authorizeBackupRehearsal(o.authorization),root=rehearsalDestination(scope),b=recoveryBudget();
    return withRehearsalAuthorityLock(scope,async()=>{
        if(fs.existsSync(path.join(root,AUTHORITY_FILE))){const l=readControl(path.join(root,REHEARSAL_LINEAGE),b);const access=authorizeRehearsalLineage({root,lineageHash:l.hash});const got=rehearsalSelectedState(access);need(equal(l.value.binding,rehearsalDetails(scope).binding),'CHANGED_BINDING');await authorityLease(root,got.value,got.hash,()=>using(access,'read',s=>s.authorityCapabilities()));return{phase:'selected',lineageHash:l.hash,selected:got.value};}
        const descriptor=authorityControl(path.join(root,'manifest.json'));
        return authorityLease(root,{backend:'sqlite',target:root,storeId:descriptor.value.storeId},null,()=>using(scope,'write',s=>s.withWriter(async()=>{
            s.authorityCapabilities();let after=null,cp,count=0;
            do{const page=s.pageProperties({kind:'root',key:'root'},after);for(const p of page.rows){need(++count<=128,'RESOURCE_LIMIT');if(p.pointer==='/boundedFixtureConversionV1'){need(p.payload_pointer===null&&p.value!==null,'INVALID_CHECKPOINT');cp=JSON.parse(p.value);}}after=page.cursor;}while(after);
            need(cp?.phase==='verified'&&cp.storeId===s.storeId&&cp.current===null&&equal(cp.identity?.rehearsal,rehearsalDetails(scope).binding),'INVALID_CHECKPOINT');
            verifyRehearsalSource(scope);
            const lineage={version:1,scope:'rehearsal-lineage-v1',productionAuthority:false,initialRoot:root,storeId:s.storeId,descriptorHash:descriptor.hash,conversionHash:digest(cp),binding:rehearsalDetails(scope).binding};
            exclusiveControl(path.join(root,REHEARSAL_LINEAGE),lineage,b);const lineageHash=readControl(path.join(root,REHEARSAL_LINEAGE),b).hash;
            exclusiveControl(path.join(root,MEMBER_FILE),{anchor:root,storeId:s.storeId,productionAuthority:false},b);
            const selected={scope:'rehearsal-authority-v1',productionAuthority:false,storeId:s.storeId,descriptorHash:descriptor.hash,backend:'sqlite',target:root,epoch:0,rollback:null,lineageHash};
            await o.fault?.('before-authority');await writeRecoveryControl(path.join(root,AUTHORITY_FILE),selected,b);await o.fault?.('after-authority');return{phase:'selected',lineageHash,selected};
        })));
    });
}
async function analyze(scope,options){
    const o=rehearsalOptions(options,['replayId','fingerprints','scoreFingerprints','reportMode']);
    need(typeof o.replayId==='string'&&/^[a-f0-9]{24}$/.test(o.replayId),'INVALID_IDENTITY');
    const logs=Object.hasOwn(o,'fingerprints')?o.fingerprints:[],scores=Object.hasOwn(o,'scoreFingerprints')?o.scoreFingerprints:[];
    for(const values of [logs,scores])need(Array.isArray(values)&&values.every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))&&new Set(values).size===values.length,'INVALID_IDENTITY');
    need(logs.length+scores.length>0&&(!Object.hasOwn(o,'scoreFingerprints')||scores.length>0),'INVALID_IDENTITY');need(logs.length+scores.length<=64,'RESOURCE_LIMIT');
    const reportMode=Object.hasOwn(o,'reportMode')?o.reportMode:'full';need(['full','compact'].includes(reportMode),'INVALID_ARGUMENT');
    return using(scope,'read',s=>{
        const both=logs.length&&scores.length,selection=both?{combinedSelection:{replayId:o.replayId,logFingerprints:logs,scoreFingerprints:scores}}:
            scores.length?{scoreSelection:{replayId:o.replayId,fingerprints:scores}}:{recordKeys:logs.map(fingerprint=>({collection:'log',replayId:o.replayId,fingerprint}))};
        return s.withReadSnapshot(selection,async view=>{
            const budget={combined:Boolean(both),metadata:0,diagnostics:0,raw:0},base={replayId:o.replayId,reportMode,localBuildId:null};
            if(both){const loaded=await loadFixtureLogs(view,{replayId:o.replayId,budget}),scored=await loadFixtureScores(view,{replayId:o.replayId,budget});if(view.combinedSelection().scores.collections.scoreRecords.present)loaded.logicalManifest.scoreRecords=scored.scoreRecords;return analyzeLoadedCombinedReplay({...loaded,sourceEvidence:scored.sourceEvidence,...base,fingerprints:logs,scoreFingerprints:scores});}
            if(scores.length){const loaded=await loadFixtureScores(view,{replayId:o.replayId,budget});return analyzeLoadedScoreReplay({...loaded,...base,scoreFingerprints:scores,scoreCollectionPresent:view.scoreSelection().collections.scoreRecords.present});}
            const loaded=await loadFixtureLogs(view,{replayId:o.replayId,budget}),session=createReplayAnalysisSession({...loaded,...base,fingerprints:logs});for(const r of loaded.logicalManifest.records)session.acceptRecord(r,loaded.logEvidence.get(r));return session.finish();
        });
    });
}
export async function runRehearsalCommand(input){
    const o=rehearsalOptions(input,['root','lineageHash','command','options','signal']),copied=rehearsalCommandOptions(o.options??{});
    need(['claim','examined','score-claim','score-examined','analyze','maps','import','score-import','scan'].includes(o.command),'UNSUPPORTED_OPTION');
    if(o.signal!==undefined){need(o.command==='scan','UNSUPPORTED_OPTION');Reflect.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(o.signal);}
    const scope=authorizeRehearsalLineage({root:o.root,lineageHash:o.lineageHash});
    return withRehearsalAuthorityLock(scope,async()=>{const current=rehearsalSelectedState(scope);return authorityLease(o.root,current.value,current.hash,async()=>{
        await using(scope,'read',s=>s.authorityCapabilities());
        if(['import','score-import','scan'].includes(o.command)){
            const q=rehearsalOptions(copied,o.command==='scan'?['capability','capabilitySha256','limits']:['capability','capabilitySha256','source']);
            const token=authorizeRehearsalCache(scope,{capability:q.capability,capabilitySha256:q.capabilitySha256},o.command);
            if(o.command==='scan')return scanRehearsalCache(token,{...(q.limits?{limits:q.limits}:{}),...(o.signal?{signal:o.signal}:{})});
            const result=await importRehearsalCache(token,q.source,o.command==='import'?'log':'score'),r=result.record;
            // Bounded result metadata, not a diagnostic dump over the CLI pipe.
            return r?{kind:result.kind,replayId:r.replayId,fingerprint:r.fingerprint,outputPath:r.outputPath,mapId:r.mapId,recordHash:digestChunks(jsonChunks(r)).expectedHash,...(Object.hasOwn(r,'validation')?{validation:digestChunks(jsonChunks(r.validation))}:{})}:result;
        }
        if(o.command==='maps')return listRehearsalMaps(scope,copied);
        if(o.command==='analyze')return analyze(scope,copied);
        const exact=rehearsalOptions(copied,['replayId','fingerprint','taskId']);return updateRehearsalReviewCheckpoint(scope,{...exact,collection:o.command.startsWith('score-')?'score':'log',action:o.command.endsWith('examined')?'examined':'claim'});
    });});
}
export async function classifyRehearsalCache(input){
    const token=authorizeRehearsalCache(undefined,input,'classify'),start=performance.now(),results=[];
    for(const f of rehearsalCacheFiles(token)){need(performance.now()-start<=600000&&process.memoryUsage().heapUsed<=256*1048576&&process.memoryUsage().rss<=512*1048576,'RESOURCE_LIMIT');results.push(classifyRehearsalCacheFile(token,f.path));await yieldTurn();}
    return{scope:'read-only-cache-classification',complete:true,admitted:0,results};
}

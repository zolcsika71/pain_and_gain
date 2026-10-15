// Bounded map/output/adoption commands; fixture guards or a selected production lease.
import {assertConsumerMode} from './replay-production-scope.js';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {Buffer} from 'node:buffer';
import {setImmediate} from 'node:timers';
import {openStore,openRehearsalStore,openMapRepairStore,recordKey,recordOwner} from './replay-store.js';
import {rehearsalLineage,rehearsalDestination} from './replay-rehearsal-scope.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';
import {fail,inlineJson,iterateDiagnostics,jsonChunks,payloadPath} from './replay-store-payloads.js';
import {writeOtherEntries} from './replay-other.js';
import {canonical,sha256,validMap,mapPayload,mapChecksum,parseLocalLog,summarizeDiagnosticCoverage} from './replay-logs.js';
import {resident,withCleanup} from './retrieval-files.js';

export const MAINTENANCE_LIMITS=Object.freeze({maps:64,replays:128,records:512,properties:128,metadataBytes:4*1048576,
    fileBytes:4*1048576,mapBytes:1048576,artifactBytes:64*1048576,wrappers:4096,outputBytes:16*1048576,
    lines:4096,lineBytes:65536,tickSpan:10000,pageSize:128,deadlineMs:60000});
const ROOT={kind:'root',key:'root'},own=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true});
const need=(v,c='INVALID_REFERENCE',m=c)=>{if(!v)fail(c,m);};
function data(o,keys){need(o&&[Object.prototype,null].includes(Object.getPrototypeOf(o)),'INVALID_ARGUMENT');const result={};for(const k of Reflect.ownKeys(o)){const d=Object.getOwnPropertyDescriptor(o,k);need(keys.includes(k)&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');own(result,k,d.value);}return result;}
function request(options,keys){const o=data(options,['synthetic','production','root','limits',...keys]);assertConsumerMode(o);const L={...MAINTENANCE_LIMITS};for(const[k,v]of Object.entries(o.limits===undefined?{}:data(o.limits,Object.keys(L)))){need(Number.isSafeInteger(v)&&v>0&&v<=L[k],'RESOURCE_LIMIT');L[k]=v;}assertSyntheticFixtureAccess(o.root);return{...o,L:Object.freeze(L)};}
function budget(L){let metadata=0,artifacts=0;const start=performance.now();return{
    check(){need(performance.now()-start<=L.deadlineMs,'RESOURCE_LIMIT','Maintenance deadline exceeded');},
    metadata(value){this.check();metadata+=Buffer.byteLength(inlineJson(value));need(metadata<=L.metadataBytes,'RESOURCE_LIMIT','Maintenance metadata exceeded');},
    artifact(n){this.check();artifacts+=n;need(Number.isSafeInteger(artifacts)&&artifacts<=L.artifactBytes,'RESOURCE_LIMIT','Maintenance artifact budget exceeded');}
};}
function clean(primary,e){if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Maintenance operation and cleanup failed',{cause:primary});}
async function using(o,mode,fn){assertSyntheticFixtureAccess(o.root);const s=await openStore({root:o.root,mode});let failed=false,primary;try{return await fn(s);}catch(e){failed=true;primary=e;throw e;}finally{try{s.close();}catch(e){if(!failed)throw e;clean(primary,e);}}}
function read(file,max,b){b.check();const before=resident(file);need(fs.realpathSync(file)===file&&before.nlink===1,'UNSAFE_PATH');need(before.size<=max,'RESOURCE_LIMIT');b.artifact(before.size);
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let failed=false,primary;
    try{const st=fs.fstatSync(fd);need(st.dev===before.dev&&st.ino===before.ino&&st.size===before.size,'CHANGED_INPUT');const bytes=Buffer.alloc(st.size);let pos=0;while(pos<bytes.length){b.check();const n=fs.readSync(fd,bytes,pos,Math.min(65536,bytes.length-pos),pos);need(n>0,'CHANGED_INPUT');pos+=n;}
        const end=fs.fstatSync(fd),named=fs.lstatSync(file);need(end.size===st.size&&end.mtimeMs===st.mtimeMs&&end.ctimeMs===st.ctimeMs&&named.dev===st.dev&&named.ino===st.ino,'CHANGED_INPUT');return bytes;
    }catch(e){failed=true;primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;clean(primary,e);}}
}
function properties(s,owner,o,b,diagnostics){const value={},rows=[];let cursor=null;do{const p=s.pageProperties(owner,cursor);for(const r of p.rows){b.metadata(r);need(rows.length<o.L.properties,'RESOURCE_LIMIT');rows.push(r);const selectedDiagnostics=diagnostics!==undefined&&owner.kind==='record'&&r.pointer==='/otherEntries'&&r.value===null&&r.payload_pointer==='/otherEntries';need(selectedDiagnostics||r.value!==null&&r.payload_pointer===null&&(owner.kind==='root'||/^\/(?:[^/~]|~[01])*$/.test(r.pointer)),'UNSUPPORTED_REPRESENTATION');own(value,r.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),selectedDiagnostics?diagnostics:JSON.parse(r.value));}cursor=p.cursor;}while(cursor);return{value,rows};}
function pageAll(s,method,limit,o,b){const rows=[];let after=null,generation;do{const p=s[method]({after,limit:o.L.pageSize});need(generation===undefined||String(p.generation)===generation,'STALE_CURSOR');generation=String(p.generation);for(const row of p.rows){need(rows.length<limit,'RESOURCE_LIMIT');b.metadata(row);rows.push(row);}after=p.cursor;}while(after);return rows;}
function basename(root,name){need(typeof name==='string'&&path.basename(name)===name&&name!=='.'&&name!=='..'&&!name.includes('\\'),'UNSAFE_PATH');return path.join(root,name);}
function mapFact(s,row,o,b,allowLegacy=false){const {value:registration}=properties(s,{kind:'map',key:row.key},o,b);
    need(registration.id===row.key&&registration.checksum===row.key&&registration.status==='validated'&&row.status==='validated'&&registration.file===row.path,'INVALID_ASSOCIATION');
    for(const [name,expected]of [['mapId',row.key],['path',row.path],['hash',row.hash]])if(Object.hasOwn(registration,name))need(registration[name]===expected,'INVALID_REFERENCE');
    need(/^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/.test(row.path),'UNSAFE_PATH');
    const bytes=read(basename(o.root,row.path),o.L.mapBytes,b);need(sha256(bytes)===row.hash,'INVALID_ARTIFACT');const map=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    need(validMap(mapPayload(map))&&mapChecksum(map)===row.key,'INVALID_ARTIFACT');
    need(map.checksum===row.key||allowLegacy&&!Object.hasOwn(map,'checksum'),'INVALID_ARTIFACT');return{registration,map,hash:row.hash};
}
function replayFact(s,row,o,b){const {value}=properties(s,{kind:'replay',key:row.key},o,b);need(value.replayId===row.key&&value.mapId===row.map_id&&value.status===row.status&&(value.buildId??null)===row.build_id,'INVALID_ASSOCIATION');return value;}

function mapsWithStore(s,o){const b=budget(o.L);return s.withWriter(()=>{
    const maps=pageAll(s,'pageMaps',o.L.maps,o,b),replays=pageAll(s,'pageReplays',o.L.replays,o,b).map(r=>replayFact(s,r,o,b));
    const results=maps.map(row=>({...mapFact(s,row,o,b).registration,activeReplays:replays.filter(r=>r.mapId===row.key&&r.status==='active').map(r=>r.replayId)}));
    for(const row of results)b.metadata(row);b.check();return results;
});}
export async function listSyntheticMaps(options){const o=request(options,[]);return using(o,'write',s=>mapsWithStore(s,o));}
export async function listRehearsalMaps(scope,options={}){
    rehearsalLineage(scope);const o=data(options,['limits']),L={...MAINTENANCE_LIMITS};
    for(const[k,v]of Object.entries(o.limits===undefined?{}:data(o.limits,Object.keys(L)))){need(Number.isSafeInteger(v)&&v>0&&v<=L[k],'RESOURCE_LIMIT');L[k]=v;}
    const s=await openRehearsalStore(scope,'write');let primary;
    try{return await mapsWithStore(s,{root:rehearsalDestination(scope),L});}catch(e){primary=e;throw e;}
    finally{try{s.close();}catch(e){if(primary!==undefined)clean(primary,e);else throw e;}}
}

export async function checkSyntheticMapChecksums(options){const o=request(options,[]),s=await openMapRepairStore({root:o.root});let failed=false,primary;
    try{return await s.repairMapChecksums({limits:Object.fromEntries(['maps','properties','metadataBytes','mapBytes','artifactBytes','deadlineMs'].map(k=>[k,o.L[k]]))});}
    catch(e){failed=true;primary=e;throw e;}finally{try{s.close();}catch(e){if(!failed)throw e;clean(primary,e);}}
}

const migrationLimits=o=>({records:o.L.records,metadataBytes:o.L.metadataBytes,artifactBytes:o.L.artifactBytes,deadlineMs:o.L.deadlineMs,pageSize:o.L.pageSize});
export async function migrateSyntheticStatuses(options){const o=request(options,[]);return using(o,'write',s=>s.withWriter(async w=>({migrated:(await w.migrateLogStatuses({limits:migrationLimits(o)})).migrated})));}

export async function writeSyntheticOther(options,sink){const o=request(options,['replayId','fingerprint']);need(typeof sink==='function','INVALID_ARGUMENT');need(typeof o.replayId==='string'&&/^[a-f0-9]{24}$/.test(o.replayId)&&typeof o.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(o.fingerprint),'INVALID_IDENTITY');
    const b=budget(o.L),k={collection:'log',replayId:o.replayId,fingerprint:o.fingerprint},owner=recordOwner(k);
    return using(o,'read',async s=>{
        // Check selected file residency before the existing snapshot opens them.
        const r=s.getRecord(k);need(!r.kind,'UNAVAILABLE');need(['claim','waiting','done'].includes(r.status),'NOT_READY');
        if(r.output_path)resident(basename(o.root,r.output_path));const m=s.getMap(r.map_id);need(!m.kind,'INVALID_ASSOCIATION');resident(basename(o.root,m.path));
        const p=s.pagePayloads(owner);need(!p.cursor&&p.rows.length<=o.L.properties,'RESOURCE_LIMIT');for(const ref of p.rows){const child=s.pagePayloads(owner,ref.pointer);need(!child.cursor&&!child.rows.length,'UNSUPPORTED_REPRESENTATION','Selected other output currently requires leaf diagnostics');resident(path.join(o.root,ref.path));}
        return s.withReadSnapshot({recordKeys:[k],payloadRoles:['diagnostics']},async view=>{
            const rows=view.properties.get(JSON.stringify(owner))??[],binding=rows.find(p=>p.pointer==='/otherEntries');need(binding,'UNAVAILABLE');
            let inline=null,ref=null;
            if(binding.payload_pointer===null){inline=JSON.parse(binding.value);need(Array.isArray(inline),'INVALID_REFERENCE');}
            else{need(binding.value===null&&binding.payload_pointer==='/otherEntries','INVALID_REFERENCE');ref=view.payload(owner,'/otherEntries');need(ref.parentPointer===null&&ref.role==='diagnostics'&&ref.state==='ready'&&Number.isSafeInteger(ref.items)&&ref.items>=0,'INVALID_REFERENCE');b.artifact(ref.bytes);}
            const wrappers=async function*(){if(inline!==null){for(const wrapper of inline)yield wrapper;}else for await(const item of iterateDiagnostics(view,k,{pointer:'/otherEntries'})){need(item.kind==='value','UNSUPPORTED_REPRESENTATION');yield item.value;}};
            let count=0,bytes=0;for await(const wrapper of wrappers()){b.check();need(++count<=o.L.wrappers,'RESOURCE_LIMIT');need(wrapper&&typeof wrapper==='object'&&!Array.isArray(wrapper),'INVALID_JSON');for(const chunk of jsonChunks(wrapper)){bytes+=chunk.length;need(bytes<=o.L.outputBytes,'RESOURCE_LIMIT');}bytes++;need(bytes<=o.L.outputBytes,'RESOURCE_LIMIT');}
            if(ref)need(count===ref.items,'INVALID_ARTIFACT');b.check();
            // A complete dry pass gates output; the second pass rechecks the same
            // pinned hash/order and awaits sink backpressure, without an array.
            let emitted=0;await writeOtherEntries(wrappers(),async chunk=>{b.check();emitted+=chunk.length;need(emitted<=o.L.outputBytes,'RESOURCE_LIMIT');await sink(chunk);});
            need(emitted===bytes,'INVALID_ARTIFACT');return{wrappers:count,bytes:emitted};
        });
    });
}

export async function writeSyntheticOtherToStream(options,stream){let streamError;const onError=e=>{streamError=e;};stream.on('error',onError);
    try{return await writeSyntheticOther(options,chunk=>new Promise((resolve,reject)=>{if(streamError){reject(streamError);return;}stream.write(chunk,e=>e?setImmediate(()=>reject(e)):resolve());}));}
    finally{stream.off('error',onError);}
}

export async function registerSyntheticLocalLog(options){const o=request(options,['replayId','sourceFile']),b=budget(o.L);
    need(typeof o.replayId==='string'&&/^[a-f0-9]{24}$/.test(o.replayId),'INVALID_IDENTITY');need(typeof o.sourceFile==='string'&&new RegExp(`^${o.replayId}(?:-[a-f0-9]{12,64}(?:-\\d+)?)?\\.jsonl$`).test(o.sourceFile),'UNSAFE_PATH');
    const file=basename(o.root,o.sourceFile);return using(o,'write',s=>s.withWriter(async w=>{
        const rootProps=properties(s,ROOT,o,b),allOperations=s.pageOperations();need(!allOperations.cursor,'RESOURCE_LIMIT');
        const replayRow=s.getReplay(o.replayId);need(!replayRow.kind&&replayRow.status==='active','INVALID_ASSOCIATION');const replay=replayFact(s,replayRow,o,b),mapRow=s.getMap(replay.mapId);need(!mapRow.kind,'INVALID_ASSOCIATION');const fact=mapFact(s,mapRow,o,b);
        const bytes=read(file,o.L.fileBytes,b),parsed=parseLocalLog(bytes,mapPayload(fact.map).objects.filter(x=>x.type==='ScoreFlag').map(({id,x,y,effectType,scorePerTick})=>({id,x,y,effectType,scorePerTick})).sort((a,b)=>a.id.localeCompare(b.id)),o.L);
        const fingerprint=sha256(`manual-jsonl:${o.replayId}\n${parsed.content}`),key={collection:'log',replayId:o.replayId,fingerprint},owner=recordOwner(key),pointer='/syntheticLocalLogV1/'+sha256(recordKey(key)),op='synthetic-local-'+sha256(recordKey(key));
        const saved=rootProps.rows.find(p=>p.pointer===pointer);let cp=saved?JSON.parse(saved.value):null;
        for(const p of rootProps.rows.filter(p=>/^\/(syntheticCacheImportV1|syntheticLocalLogV1)\//.test(p.pointer))){const c=JSON.parse(p.value);if(c.phase!=='verified'){if(p.pointer.startsWith('/syntheticLocalLogV1/')&&c.sourceFile===o.sourceFile)need(c.sourceHash===sha256(bytes),'CHANGED_INPUT','Pending local adoption source changed');need(p.pointer===pointer,'NOT_READY','Recover the existing exact publication first');}}
        need(allOperations.rows.every(r=>r.id===op&&r.collection==='log'&&r.replay_id===o.replayId&&r.fingerprint===fingerprint&&r.phase==='publish'),'NOT_READY');
        if(parsed.buildId!==null&&replay.buildId)need(parsed.buildId===replay.buildId,'IDENTITY_CONFLICT');
        need(!Object.hasOwn(replay,'retiredFingerprints')||Array.isArray(replay.retiredFingerprints)&&replay.retiredFingerprints.length<=128,'UNSUPPORTED_REPRESENTATION');
        const row=s.getRecord(key),retired=Array.isArray(replay.retiredFingerprints)&&replay.retiredFingerprints.includes(fingerprint);need((row.kind==='retired')===retired,'INVALID_REFERENCE','Retired original/index disagreement');
        if(retired)return{kind:'deduplicated',replayId:o.replayId,fingerprint};
        const stable=()=>{b.check();need(read(file,o.L.fileBytes,b).equals(bytes),'CHANGED_INPUT');mapFact(s,mapRow,o,b);};
        const counts=new Map();for(const tick of parsed.ticks)counts.set(tick,(counts.get(tick)??0)+1);const firstTick=Math.min(...parsed.ticks),lastTick=Math.max(...parsed.ticks),gaps=[];for(let tick=firstTick;tick<=lastTick;tick++)if(!counts.has(tick))gaps.push(tick);
        const record={replayId:o.replayId,requestedTick:null,sourceEntry:`replay_logs/${o.sourceFile}`,sourceKey:'manual-jsonl',fingerprint,outputPath:o.sourceFile,outputFingerprint:sha256(bytes),mapId:fact.registration.id,mapChecksum:fact.registration.checksum,mapFile:fact.registration.file,buildId:parsed.buildId??null,importedAt:cp?.record?.importedAt??new Date().toISOString(),status:'claim',coverage:{count:parsed.ticks.length,firstTick,lastTick,duplicates:[...counts].filter(([,n])=>n>1).map(([tick])=>tick),gaps},diagnosticCoverage:summarizeDiagnosticCoverage(parsed.lines,[]),otherEntries:[],reviews:{}};
        b.metadata(record);for(const value of Object.values(record))inlineJson(value,16384);
        const diagnostic={path:payloadPath(s.storeId,owner,'/otherEntries','diagnostics',sha256('')),hash:sha256(''),bytes:0,items:0};
        const expected={version:1,storeId:s.storeId,sourceFile:o.sourceFile,sourceHash:sha256(bytes),sourceBytes:bytes.length,mapHash:mapRow.hash,diagnostic,record};
        if(cp)need(['ordinal','recordOrdinal'].every(n=>typeof cp[n]==='string'&&/^(0|[1-9]\d*)$/.test(cp[n]))&&String(saved.ordinal)===cp.ordinal&&['reserved','published','verified'].includes(cp.phase)&&canonical({...cp,phase:undefined,ordinal:undefined,recordOrdinal:undefined})===canonical(expected),'INVALID_REFERENCE');
        const facts=()=>w.readReviewCheckpoint({recordKey:key,taskId:'synthetic/register-local'});
        function verify(ready){const f=facts(),r=f.current;need(r&&String(r.ordinal)===cp.recordOrdinal&&r.output_path===o.sourceFile&&r.output_hash===record.outputFingerprint&&r.map_id===record.mapId&&r.build_id===record.buildId&&(ready?['claim','done','waiting'].includes(r.status):r.status==='pending'),'INVALID_REFERENCE');
            const originals=properties(s,owner,o,b,[]);for(const[name,value]of Object.entries(record)){if(name==='reviews'||name==='status'||name==='otherEntries'&&!ready)continue;need(Object.hasOwn(originals.value,name)&&canonical(originals.value[name])===canonical(value),'INVALID_REFERENCE');}need(originals.value.status===r.status&&canonical(originals.value.reviews)==='{}','INVALID_REFERENCE');
            const names=Object.keys(record).filter(n=>ready||n!=='otherEntries');for(const p of originals.rows){const name=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),index=names.indexOf(name);if(index!==-1)need(Number(p.ordinal)===index,'INVALID_REFERENCE','Local metadata ordinal changed');}
            const out=f.output;need(out&&out.collection==='log'&&out.replay_id===key.replayId&&out.fingerprint===key.fingerprint&&out.path===o.sourceFile&&out.hash===record.outputFingerprint&&Number(out.bytes)===bytes.length&&(ready?out.state==='ready':['pending','ready'].includes(out.state)),'OWNERSHIP_CONFLICT');
            const refs=s.pagePayloads(owner),ref=refs.rows[0];need(!refs.cursor&&refs.rows.length===1&&ref.owner_kind===owner.kind&&ref.owner_key===owner.key&&ref.pointer==='/otherEntries'&&ref.parent===null&&ref.role==='diagnostics'&&ref.encoding==='jsonl-v1'&&ref.path===diagnostic.path&&ref.hash===diagnostic.hash&&ref.bytes===0&&ref.items===0&&(ready?ref.state==='ready':['pending','ready'].includes(ref.state)),'INVALID_REFERENCE');const children=s.pagePayloads(owner,'/otherEntries');need(!children.cursor&&!children.rows.length,'INVALID_REFERENCE');
            if(ready){need(!f.intent,'NOT_READY');need(read(path.join(o.root,diagnostic.path),0,b).length===0,'INVALID_ARTIFACT');}
            else{const files=w.readImportIntent(op);need(f.intent?.id===op&&files.length===2&&files[0].path===o.sourceFile&&files[0].hash===record.outputFingerprint&&Number(files[0].bytes)===bytes.length&&Number(files[0].ordinal)===0&&files[0].original_present===1&&files[1].path===diagnostic.path&&files[1].hash===diagnostic.hash&&files[1].bytes===0&&Number(files[1].ordinal)===1,'INVALID_REFERENCE');}
        }
        const checkpoint=(tx,phase)=>{cp={...cp,phase};tx.setProperty({owner:ROOT,pointer,ordinal:BigInt(cp.ordinal),value:cp});};
        if(!cp){need(row.kind==='missing','UNSUPPORTED_STATE','Existing local record lacks an adoption commitment');need(!w.artifactOwner(o.sourceFile),'OWNERSHIP_CONFLICT');need(Number(s.entityCounts().records)<o.L.records,'RESOURCE_LIMIT');need(rootProps.rows.length<o.L.properties,'RESOURCE_LIMIT');
            // V2 local adoption first migrates waiting logs, but does not retire
            // done logs. Reuse that atomic subset, never full list cleanup.
            stable();const proof=await w.prepareLocalLogAdoption({recordKey:key,path:o.sourceFile,expectedBytes:bytes.length,expectedHash:record.outputFingerprint});await w.migrateLogStatuses({limits:migrationLimits(o)});const ord=w.importOrdinals('log');stable();
            cp={...expected,ordinal:String(ord.root),recordOrdinal:String(ord.record),phase:'reserved'};
            w.transaction(tx=>{if(parsed.buildId!==null)tx.associateReplayBuild({replayId:o.replayId,buildId:parsed.buildId});const value={...record,status:'pending',outputPath:null,outputFingerprint:null};delete value.otherEntries;tx.insertEntity({kind:'record',key:recordKey(key),ordinal:ord.record,value});tx.adoptLocalLogOutput(proof);for(const n of ['outputPath','outputFingerprint'])tx.setProperty({owner,pointer:'/'+n,ordinal:Object.keys(record).indexOf(n),value:record[n]});tx.appendIntent({id:op,recordKey:key,files:[{ordinal:0,path:o.sourceFile,hash:record.outputFingerprint,bytes:bytes.length,originalPresent:true},{ordinal:1,...diagnostic,payload:{owner,pointer:'/otherEntries',role:'diagnostics',items:0}}]});checkpoint(tx,'reserved');});
        }
        if(cp.phase==='reserved'){verify(false);stable();await w.publishOutput({recordKey:key,path:o.sourceFile,source:(function*(){for(let i=0;i<bytes.length;i+=65536)yield bytes.subarray(i,i+65536);})(),expectedBytes:bytes.length,expectedHash:record.outputFingerprint});await w.publishPayload({owner,pointer:'/otherEntries',role:'diagnostics',source:[],expectedBytes:0,expectedHash:diagnostic.hash,items:0});stable();w.transaction(tx=>{tx.finishPublication({recordKey:key,operationId:op});for(const[i,name]of Object.keys(record).entries())tx.setProperty({owner,pointer:'/'+name,ordinal:i,...(name==='otherEntries'?{payloadRef:{pointer:'/otherEntries',hash:diagnostic.hash}}:{value:record[name]})});checkpoint(tx,'published');});}
        verify(true);stable();
        const retained=properties(s,owner,o,b,[]).value,reviews=s.pageReviews(key);need(!reviews.cursor&&reviews.rows.length<=128,'RESOURCE_LIMIT');
        for(const row of reviews.rows){const owner={kind:'review',key:JSON.stringify([recordKey(key),row.task])},f=w.readReviewCheckpoint({recordKey:key,taskId:row.task}),value=properties(s,owner,o,b).value;need(f.review?.owner_key===owner.key&&f.binding?.collection===key.collection&&f.binding?.replay_id===key.replayId&&f.binding?.fingerprint===key.fingerprint&&f.binding?.task===row.task,'OWNERSHIP_CONFLICT');if(row.value!==null)need(JSON.stringify(JSON.parse(row.value))===JSON.stringify(value),'INVALID_REFERENCE');own(retained.reviews,row.task,value);}
        b.check();if(cp.phase==='published')w.transaction(tx=>checkpoint(tx,'verified'));
        return{kind:saved?'deduplicated':'registered',record:retained};
    }));
}

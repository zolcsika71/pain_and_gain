// Selected original Chromium transport; bounded fixture or approved production admission.
import {assertConsumerMode,productionAccess,productionCacheRoot,productionImportBudget,productionCacheCapacity} from './replay-production-scope.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {parseCacheEntry,parseScoreCacheEntry,parseSimpleCacheV5,parseScoreHttpMetadata,
    canonical,sha256,mapChecksum,mapPayload,validMap,hasRetainedDiagnostics,
    logImportRecord,scoreImportRecord,logOutputNames,scoreOutputNames} from './replay-logs.js';
import {openStore,openRehearsalStore,recordKey,recordOwner} from './replay-store.js';
import {rehearsalCacheDetails,readRehearsalCache} from './replay-rehearsal-cache-scope.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';
import {fail,jsonChunks,diagnosticChunks,digestChunks,payloadPath} from './replay-store-payloads.js';
import {resident,syncDirectory,withCleanup} from './retrieval-files.js';

export const syntheticImportLimits=Object.freeze({cache:1048576,decoded:4194304,artifact:4194304,map:1048576,
    diagnostics:2097152,wrappers:4096,field:16384,properties:64,records:64,depth:64,values:100000,tickSpan:10000,deadlineMs:60000});
export const scoreValidationLimits=Object.freeze({bytes:1048576,metadata:2097152});
const ROOT={kind:'root',key:'root'},MARKER='.synthetic-cache-fixture';
const need=(v,code='INVALID_REFERENCE',message=code)=>{if(!v)fail(code,message);};
const equal=(a,b)=>canonical(a)===canonical(b);
const pointer=k=>'/'+k.replaceAll('~','~0').replaceAll('/','~1');
const chunks=function*(bytes){for(let i=0;i<bytes.length;i+=65536)yield bytes.subarray(i,i+65536);};
const rowBytes=row=>Buffer.byteLength(JSON.stringify(row,(_,v)=>typeof v==='bigint'?String(v):v));
function cleanup(primary,error){if(primary instanceof Error)withCleanup(primary,error);else throw new AggregateError([primary,error],'Operation and cleanup failed',{cause:primary});}
function read(file,limit,independent=true){
    const before=resident(file);need(fs.realpathSync(file)===file&&(!independent||before.nlink===1),'UNSAFE_PATH');need(before.size<=limit,'RESOURCE_LIMIT');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let failed=false,primary;
    try{const st=fs.fstatSync(fd);need(st.dev===before.dev&&st.ino===before.ino&&st.size===before.size,'CHANGED_INPUT');const b=Buffer.alloc(st.size);let offset=0;
        while(offset<b.length){const n=fs.readSync(fd,b,offset,Math.min(65536,b.length-offset),offset);need(n>0,'CHANGED_INPUT');offset+=n;}
        const end=fs.fstatSync(fd),named=fs.lstatSync(file);need(end.size===st.size&&end.mtimeMs===st.mtimeMs&&end.ctimeMs===st.ctimeMs&&named.dev===st.dev&&named.ino===st.ino,'CHANGED_INPUT');return b;
    }catch(e){failed=true;primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;cleanup(primary,e);}}
}
function request(input){
    need(input&&[Object.prototype,null].includes(Object.getPrototypeOf(input)),'INVALID_ARGUMENT');const o=Object.create(null),keys=['synthetic','production','root','collection','sourceRoot','sourceFile'];
    for(const key of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,key);need(keys.includes(key),'UNSUPPORTED_OPTION');need(Object.hasOwn(d,'value'),'INVALID_ARGUMENT');o[key]=d.value;}
    assertConsumerMode(o);need(keys.filter(k=>!['synthetic','production'].includes(k)).every(k=>Object.hasOwn(o,k)),'INVALID_ARGUMENT');need(['log','score'].includes(o.collection),'INVALID_IDENTITY');
    if(productionAccess(o.root))productionCacheRoot(o.root,o.sourceRoot);
    else need(typeof o.sourceRoot==='string'&&path.isAbsolute(o.sourceRoot)&&path.resolve(o.sourceRoot)===o.sourceRoot&&path.dirname(o.sourceRoot)===fs.realpathSync(os.tmpdir())&&path.basename(o.sourceRoot).startsWith('pain-gain-cache-import-fixture-'),'UNSAFE_PATH');
    resident(o.sourceRoot,true);need(fs.realpathSync(o.sourceRoot)===o.sourceRoot,'UNSAFE_PATH');
    need(typeof o.sourceFile==='string'&&/^[A-Za-z0-9._-]{1,120}$/.test(o.sourceFile)&&!['.','..'].includes(o.sourceFile),'UNSAFE_PATH');
    assertSyntheticFixtureAccess(o.root);return o;
}
function structure(value){let count=0;const visit=(v,depth)=>{need(++count<=syntheticImportLimits.values&&depth<=syntheticImportLimits.depth,'RESOURCE_LIMIT');if(v&&typeof v==='object')for(const c of Object.values(v))visit(c,depth+1);};visit(value,0);}
function fields(value,score=false){let bytes=0;need(Object.keys(value).length<=syntheticImportLimits.properties,'RESOURCE_LIMIT');for(const[k,v]of Object.entries(value))if(k!=='otherEntries'){
    structure(v);const size=digestChunks(jsonChunks(v)).expectedBytes;need(size<=(score&&k==='validation'?scoreValidationLimits.bytes:syntheticImportLimits.field),'RESOURCE_LIMIT');
    bytes+=size+Buffer.byteLength(k);need(Number.isSafeInteger(bytes)&&bytes<=scoreValidationLimits.metadata,'RESOURCE_LIMIT');
}}
function rows(store,owner){const p=store.pageProperties(owner);need(!p.cursor&&p.rows.length<=128,'RESOURCE_LIMIT');return p.rows;}
function originals(store,owner){const value={};for(const p of rows(store,owner)){need(p.payload_pointer===null&&p.value!==null,'UNSUPPORTED_REPRESENTATION');need(/^\/(?:[^~/]|~[01])*$/.test(p.pointer),'UNSUPPORTED_REPRESENTATION');const name=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');Object.defineProperty(value,name,{value:JSON.parse(p.value),enumerable:true});}return value;}
export function importTraversalBudget(root){return productionImportBudget(root)??Object.freeze({records:64,maps:64,replays:64,rootProperties:127,rootBytes:8388608,operations:127});}
// One bounded page is retained at a time; cursors bind store/generation/order.
// Count bytes before parsing any checkpoint and never collect the root corpus.
export function* importControlRows(store,limits,check=()=>{}){
    let cursor=null,count=0,bytes=0,generation;
    do{check();const page=store.pageProperties(ROOT,cursor);if(generation!==undefined)need(String(page.generation)===generation,'STALE_CURSOR');generation=String(page.generation);
        for(const row of page.rows){check();bytes+=rowBytes(row);need(++count<=limits.rootProperties&&Number.isSafeInteger(bytes)&&bytes<=limits.rootBytes,'RESOURCE_LIMIT');yield row;}cursor=page.cursor;
    }while(cursor);
}
function corpusCounts(store,limits,check){
    if(limits.records!==undefined){const counts=store.entityCounts();for(const n of Object.values(counts))need(Number.isSafeInteger(Number(n))&&Number(n)>=0,'RESOURCE_LIMIT');need(Number(counts.records)<=limits.records&&Number(counts.maps)<=limits.maps&&Number(counts.replays)<=limits.replays,'RESOURCE_LIMIT');return{...counts,selected:null};}
    let generation;
    const count=(next,max)=>{let cursor=null,n=0;do{check();const page=next(cursor);if(generation!==undefined)need(String(page.generation)===generation,'STALE_CURSOR');generation=String(page.generation);n+=page.rows.length;need(n<=max,'RESOURCE_LIMIT');cursor=page.cursor;}while(cursor);return n;};
    const selected={log:count(after=>store.pageRecords({collection:'log',after}),limits.logs),score:count(after=>store.pageRecords({collection:'score',after}),limits.scores)};
    return{records:selected.log+selected.score,maps:count(after=>store.pageMaps({after}),limits.maps),replays:count(after=>store.pageReplays({after}),limits.replays),selected};
}
function validationReference(store,owner,expected,ready=true){
    const page=store.pagePayloads(owner),row=page.rows[0];need(!page.cursor&&page.rows.length===1&&row.owner_kind===owner.kind&&row.owner_key===owner.key&&row.pointer==='/validation'&&row.parent===null&&row.role==='extensions'&&row.encoding==='json-v1'&&row.items===null&&Number.isSafeInteger(Number(row.bytes))&&Number(row.bytes)>=0&&Number(row.bytes)<=scoreValidationLimits.bytes&&row.path===payloadPath(store.storeId,owner,'/validation','extensions',row.hash)&&(ready?row.state==='ready':['pending','ready'].includes(row.state)),'INVALID_REFERENCE');
    if(expected)need(row.path===expected.path&&row.hash===expected.hash&&Number(row.bytes)===expected.bytes,'INVALID_REFERENCE');
    const child=store.pagePayloads(owner,'/validation');need(!child.rows.length&&!child.cursor,'INVALID_REFERENCE');return row;
}
function validationValue(store,root,owner){
    const row=validationReference(store,owner,null),bytes=verifyFile(root,row);let value;
    try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('INVALID_JSON','Invalid retained score validation');}
    structure(value);return value;
}
function resultRecord(store,w,key,diagnostics,root){
    const result={};let metadata=0;for(const p of rows(store,recordOwner(key))){const name=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');
        need(/^\/(?:[^~/]|~[01])*$/.test(p.pointer),'UNSUPPORTED_REPRESENTATION');
        let value;
        if(name==='otherEntries')value=diagnostics;
        else if(key.collection==='score'&&name==='validation'&&p.payload_pointer!==null){need(p.value===null&&p.payload_pointer==='/validation','INVALID_REFERENCE');value=validationValue(store,root,recordOwner(key));}
        else{need(p.payload_pointer===null&&p.value!==null,'UNSUPPORTED_REPRESENTATION');value=JSON.parse(p.value);}
        if(key.collection==='score'&&name!=='reviews'){metadata+=digestChunks(jsonChunks(value)).expectedBytes+Buffer.byteLength(name);need(Number.isSafeInteger(metadata)&&metadata<=scoreValidationLimits.metadata,'RESOURCE_LIMIT');}
        Object.defineProperty(result,name,{value,enumerable:true,writable:true});}
    const page=store.pageReviews(key);need(!page.cursor&&page.rows.length<=8,'RESOURCE_LIMIT');
    const reviews={...result.reviews};
    for(const row of page.rows){const owner={kind:'review',key:JSON.stringify([recordKey(key),row.task])},facts=w.readReviewCheckpoint({recordKey:key,taskId:row.task});
        need(facts.review?.owner_key===owner.key&&facts.binding?.collection===key.collection&&facts.binding?.replay_id===key.replayId&&facts.binding?.fingerprint===key.fingerprint&&facts.binding?.task===row.task,'OWNERSHIP_CONFLICT');
        const value=originals(store,owner);if(row.value!==null)need(equal(JSON.parse(row.value),value),'INVALID_REFERENCE');Object.defineProperty(reviews,row.task,{value,enumerable:true});}
    if(key.collection==='score'){metadata+=digestChunks(jsonChunks(reviews)).expectedBytes+Buffer.byteLength('reviews');need(Number.isSafeInteger(metadata)&&metadata<=scoreValidationLimits.metadata,'RESOURCE_LIMIT');}
    result.reviews=reviews;return result;
}
function source(o){if(o.rehearsalCache)return readRehearsalCache(o.rehearsalCache,path.join(o.sourceRoot,o.sourceFile),o.collection);let binding;
    if(productionAccess(o.root))binding={sourceScopeHash:productionCacheRoot(o.root,o.sourceRoot)};
    else{const marker=read(path.join(o.sourceRoot,MARKER),64);need(marker.toString()==='synthetic-chromium-cache-v1\n','UNSUPPORTED_FIXTURE');binding={markerHash:sha256(marker)};}
    const file=path.join(o.sourceRoot,o.sourceFile),bytes=read(file,syntheticImportLimits.cache);return{file,bytes,identity:{sourceRoot:o.sourceRoot,sourceFile:o.sourceFile,...binding,cacheHash:sha256(bytes)}};}
// Discovery reuses precisely the selected-import guards and stable bounded reads.
export function inspectSyntheticCacheRoot(options){
    need(options&&[Object.prototype,null].includes(Object.getPrototypeOf(options)),'INVALID_ARGUMENT');const selected={};
    for(const key of Reflect.ownKeys(options)){const d=Object.getOwnPropertyDescriptor(options,key);need(['synthetic','production','root','sourceRoot'].includes(key)&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');selected[key]=d.value;}
    const o=request({...selected,collection:'log',sourceFile:'root-check'});
    if(productionAccess(o.root))return productionCacheRoot(o.root,o.sourceRoot);
    const marker=read(path.join(o.sourceRoot,MARKER),64);need(marker.toString()==='synthetic-chromium-cache-v1\n','UNSUPPORTED_FIXTURE');
    return sha256(marker);
}
export function inspectSyntheticCacheFile(options){const o=request(options),s=source(o),capacity=productionCacheCapacity(o.root);return{...s.identity,bytes:s.bytes.length,...(capacity?{classification:parseCacheEntry(s.bytes,{maxDecodedBytes:syntheticImportLimits.decoded,maxTickSpan:syntheticImportLimits.tickSpan,strictUtf8:true}).kind==='unrelated'?'unrelated':'log'}:{})};}
// Synchronous discovery page under the production writer lease. Scope is checked
// at both boundaries; each file still has its own pre-open residency, identity,
// byte cap, content hash and post-read stability checks. No decoded body escapes.
export function inspectProductionCachePage(options,names,maxBytes){
    const o=request(options),capacity=productionCacheCapacity(o.root);
    need(capacity&&o.production===true,'AUTHORITY_REQUIRED');
    need(Array.isArray(names)&&Object.getPrototypeOf(names)===Array.prototype,'INVALID_ARGUMENT');const count=Object.getOwnPropertyDescriptor(names,'length')?.value;need(Number.isSafeInteger(count)&&count>=0&&count<=128,'INVALID_ARGUMENT');
    need(Number.isSafeInteger(maxBytes)&&maxBytes>=0&&maxBytes<=128*syntheticImportLimits.cache,'RESOURCE_LIMIT');
    const selected=[];for(let i=0;i<count;i++){const d=Object.getOwnPropertyDescriptor(names,String(i));need(d&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');const name=d.value;need(typeof name==='string'&&/^[A-Za-z0-9._-]{1,120}$/.test(name)&&!['.','..'].includes(name)&&(!i||name>selected[i-1]),'UNSAFE_PATH');selected.push(name);}
    const binding=productionCacheRoot(o.root,o.sourceRoot),before=resident(o.sourceRoot,true),out=[];let used=0;
    for(const name of selected){const bytes=read(path.join(o.sourceRoot,name),Math.min(syntheticImportLimits.cache,maxBytes-used));used+=bytes.length;out.push({name,sourceRoot:o.sourceRoot,sourceFile:name,sourceScopeHash:binding,cacheHash:sha256(bytes),bytes:bytes.length,classification:parseCacheEntry(bytes,{maxDecodedBytes:syntheticImportLimits.decoded,maxTickSpan:syntheticImportLimits.tickSpan,strictUtf8:true}).kind==='unrelated'?'unrelated':'log'});}
    need(productionCacheRoot(o.root,o.sourceRoot)===binding,'CHANGED_AUTHORITY');const after=resident(o.sourceRoot,true);need(['dev','ino','mtimeMs','ctimeMs'].every(k=>before[k]===after[k]),'CHANGED_INPUT');return out;
}
function parse(bytes,collection,capacity=null){
    // Reuse the original full transport validators, never wrap a raw HTTP body.
    need(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from('305c72a71b6dfbfc','hex')),'UNSUPPORTED_TRANSPORT');
    const length=bytes.readUInt32LE(12);need(bytes.readUInt32LE(8)===5&&length>0&&length<=2048&&24+length<=bytes.length,'UNSUPPORTED_TRANSPORT');
    const streams=parseSimpleCacheV5(bytes,length),http=parseScoreHttpMetadata(streams.stream0,'synthetic selected cache');
    need(http.kind==='http-metadata'&&(http.contentLength===null||http.contentLength===streams.stream1.length),'UNSUPPORTED_TRANSPORT');
    const p=collection==='log'?parseCacheEntry(bytes,{maxDecodedBytes:syntheticImportLimits.decoded,maxTickSpan:syntheticImportLimits.tickSpan,strictUtf8:true}):parseScoreCacheEntry(bytes,{maxDecodedBytes:syntheticImportLimits.decoded});
    need(p.kind===(collection==='log'?'log':'score-source'),'UNSUPPORTED_TRANSPORT',p.message??'Unsupported selected transport');
    need(typeof p.replayId==='string'&&/^[a-f0-9]{24}$/.test(p.replayId),'INVALID_IDENTITY');
    structure(collection==='log'?p.otherEntries:p.validation);
    if(collection==='log'){if(p.map){structure(p.map);need(mapBytes(p.map).length<=syntheticImportLimits.map,'RESOURCE_LIMIT');}need(p.otherEntries.length<=(capacity?.wrappers??syntheticImportLimits.wrappers),'RESOURCE_LIMIT');need(digestChunks(diagnosticChunks(p.otherEntries)).expectedBytes<=(capacity?.diagnostics??syntheticImportLimits.diagnostics),'RESOURCE_LIMIT');}
    return p;
}
// Pure full-transport/cap validation shared by the selected restored-v2 route.
// This does not relax either existing source or destination fixture guard.
export function parseSyntheticCacheBytes(bytes,collection){
    need(Buffer.isBuffer(bytes)&&bytes.length<=syntheticImportLimits.cache,'RESOURCE_LIMIT');
    need(['log','score'].includes(collection),'INVALID_IDENTITY');return parse(bytes,collection);
}
// The opaque inventory capability selects the existing finite capacity profile.
export function inspectRehearsalCacheFile(token,file,collection){
    const d=rehearsalCacheDetails(token),s=readRehearsalCache(token,file,collection);
    return{...s.identity,bytes:s.bytes.length,parsed:parse(s.bytes,collection,d.capacity)};
}
export function importRehearsalCache(token,file,collection){
    const d=rehearsalCacheDetails(token);
    need(['import','score-import','scan'].includes(d.operation),'UNSUPPORTED_OPTION');
    // Check the exact operation/path before opening the destination.
    readRehearsalCache(token,file,collection);
    return importSelected({root:d.root,collection,sourceRoot:path.dirname(file),sourceFile:path.basename(file),rehearsalCache:token},d.importBudget,d.capacity,d.scope);
}
export function classifyRehearsalCacheFile(token,file){
    const d=rehearsalCacheDetails(token);need(d.operation==='classify','UNSUPPORTED_OPTION');const s=readRehearsalCache(token,file);
    const log=parseCacheEntry(s.bytes,{maxDecodedBytes:syntheticImportLimits.decoded,maxTickSpan:syntheticImportLimits.tickSpan,strictUtf8:true});
    const score=log.kind==='unrelated'?parseScoreCacheEntry(s.bytes,{maxDecodedBytes:syntheticImportLimits.decoded}):null;
    if(log.kind==='unrelated'&&score?.kind==='unrelated')return{file,bytes:s.bytes.length,sha256:s.identity.cacheHash,family:'unrelated',admitted:false};
    const collection=log.kind==='unrelated'?'score':'log',p=parse(s.bytes,collection,d.capacity);
    if(collection==='score')fields({validation:p.validation},true);
    const validation=collection==='score'?digestChunks(jsonChunks(p.validation)):null;
    return{file,bytes:s.bytes.length,sha256:s.identity.cacheHash,family:collection==='log'?'log':p.sourceKind,replayId:p.replayId,fingerprint:p.fingerprint,wrappers:p.otherEntries?.length??0,validationBytes:validation?.expectedBytes??0,validationHash:validation?.expectedHash??null,admitted:false};
}
function target(root,name){need(typeof name==='string'&&name!=='.'&&name!=='..'&&path.basename(name)===name&&!name.includes('\\'),'UNSAFE_PATH');return path.join(root,name);}
function verifyFile(root,ref,expectedBytes){
    // Derived diagnostic paths are core-owned, canonical store-v3 paths; maps/outputs are basenames.
    const file=ref.path.startsWith('store-v3/')?path.join(root,ref.path):target(root,ref.path);
    if(ref.path.startsWith('store-v3/'))need(!ref.path.split('/').some(p=>p==='..'||p==='.'||!p)&&!ref.path.includes('\\'),'UNSAFE_PATH');
    const b=read(file,syntheticImportLimits.artifact,false);need(b.length===Number(ref.bytes)&&sha256(b)===ref.hash,'INVALID_ARTIFACT');if(expectedBytes)need(b.equals(expectedBytes),'INVALID_ARTIFACT');return b;
}
function choose(root,w,names){for(const name of names){if(w.artifactOwner(name))continue;try{fs.lstatSync(path.join(root,name));}catch(e){if(e.code==='ENOENT')return name;throw e;}}fail('OWNERSHIP_CONFLICT','No exclusive output name');}
function mapBytes(map){return Buffer.from(canonical({...mapPayload(map),checksum:mapChecksum(map)})+'\n');}
function mapState(store,root,replayId,incoming){
    const row=store.getReplay(replayId);if(row.kind==='missing')return null;
    const replay=originals(store,{kind:'replay',key:replayId});need(replay.replayId===replayId&&replay.status==='active'&&row.status==='active'&&replay.mapId===row.map_id&&(replay.buildId??null)===row.build_id,'IDENTITY_CONFLICT');
    const mapRow=store.getMap(replay.mapId);need(!mapRow.kind&&mapRow.status==='validated','INVALID_ASSOCIATION');const map=originals(store,{kind:'map',key:replay.mapId});
    need(map.id===replay.mapId&&map.checksum===replay.mapId&&map.file===mapRow.path&&map.status==='validated','INVALID_ASSOCIATION');
    const content=verifyFile(root,{path:mapRow.path,hash:mapRow.hash,bytes:fs.lstatSync(target(root,mapRow.path)).size});const value=JSON.parse(content.toString('utf8'));
    need(validMap(mapPayload(value))&&value.checksum===map.id&&mapChecksum(value)===map.id,'INVALID_ARTIFACT');
    if(incoming)need(mapChecksum(incoming)===map.id,'IDENTITY_CONFLICT');return{map,replay};
}
function convertedDuplicate(store,w,o,parsed,key,facts,conversion){
    // A conversion receipt identifies the original member, not a historical
    // import transaction. Do not manufacture a commitment to adopt it.
    need(conversion?.storeId===store.storeId&&conversion.phase==='verified'&&conversion.current===null&&Array.isArray(conversion.records)&&conversion.records.length<=448,'UNSUPPORTED_STATE');
    const identity=recordKey(key),index=conversion.records.indexOf(identity);
    need(index>=0&&conversion.records.lastIndexOf(identity)===index,'INVALID_REFERENCE');
    const ordinal=conversion.records.slice(0,index).filter(k=>typeof k==='string'&&k.startsWith('["'+key.collection+'",')).length;
    const current=facts.current;need(current&&current.key===identity&&current.collection===key.collection&&current.replay_id===key.replayId&&current.fingerprint===key.fingerprint&&String(current.ordinal)===String(ordinal),'INVALID_REFERENCE');
    need(['claim','waiting','done'].includes(current.status)&&!facts.intent,'NOT_READY');
    const record=resultRecord(store,w,key,parsed.otherEntries,o.root),properties=rows(store,recordOwner(key));
    if(Object.hasOwn(record,'collection'))need(record.collection===key.collection,'IDENTITY_CONFLICT');
    need(typeof record.sourceEntry==='string'&&path.isAbsolute(record.sourceEntry)&&Buffer.byteLength(record.sourceEntry)<=syntheticImportLimits.field&&typeof record.importedAt==='string'&&record.importedAt.length>0&&record.importedAt.length<=256,'INVALID_REFERENCE');
    need(record.reviews&&typeof record.reviews==='object'&&!Array.isArray(record.reviews),'INVALID_REFERENCE');
    // The existing converter accepts linked scores only. Association-free
    // imports have their own exact commitment; never infer converted support.
    const active=mapState(store,o.root,key.replayId,key.collection==='log'?parsed.map:null);
    need(active&&record.mapId===active.map.id,'INVALID_ASSOCIATION');
    if(Object.hasOwn(record,'buildId'))need(key.collection==='log'&&record.buildId===null||typeof record.buildId==='string'&&/^[a-f0-9]{64}$/.test(record.buildId),'INVALID_IDENTITY');
    if(record.buildId!=null){if(key.collection==='log')need(record.buildId===parsed.buildId,'IDENTITY_CONFLICT');if(active?.replay.buildId)need(record.buildId===active.replay.buildId,'IDENTITY_CONFLICT');}
    if(key.collection==='log'&&parsed.buildId!==null&&active.replay.buildId)need(parsed.buildId===active.replay.buildId,'IDENTITY_CONFLICT');
    const evidenceOnly=key.collection==='log'&&!parsed.gameState.length;
    need(!evidenceOnly||hasRetainedDiagnostics(parsed),'IDENTITY_CONFLICT');
    const names=key.collection==='log'?logOutputNames(key.replayId,key.fingerprint):scoreOutputNames(key.replayId,key.fingerprint);
    need(evidenceOnly?record.outputPath===null:names.includes(record.outputPath),'INVALID_REFERENCE');
    const expected=key.collection==='log'?logImportRecord(parsed,record.sourceEntry,record.outputPath,active.map,record.importedAt):scoreImportRecord(parsed,record.sourceEntry,record.outputPath,record.mapId,record.importedAt);
    expected.status=record.status;
    for(const [name,value]of Object.entries(expected)){
        if(['reviews','otherEntries','buildId'].includes(name))continue;
        if(key.collection==='log'&&name==='diagnosticCoverage'&&!Object.hasOwn(record,name)){
            // Legacy converted logs may predate this derived summary. Membership,
            // ordinal and verified store binding above are required; keep absence
            // authoritative, and still verify the original output/diagnostics below.
            const provenance=conversion.identity;
            need(provenance?.version===1&&typeof provenance.sourceRoot==='string'&&path.isAbsolute(provenance.sourceRoot)&&
                [provenance.sourceHash,provenance.markerHash].every(ref=>ref&&typeof ref.expectedHash==='string'&&/^[a-f0-9]{64}$/.test(ref.expectedHash)&&Number.isSafeInteger(ref.expectedBytes)&&ref.expectedBytes>0),'INVALID_REFERENCE');
            continue;
        }
        need(Object.hasOwn(record,name)&&equal(record[name],value),'IDENTITY_CONFLICT');
    }
    for(const [name,column]of Object.entries({mapId:'map_id',status:'status',outputPath:'output_path',outputFingerprint:'output_hash'}))need(record[name]===current[column],'INVALID_REFERENCE');
    need((record.buildId??null)===current.build_id,'INVALID_REFERENCE');
    const body=evidenceOnly?null:key.collection==='log'?Buffer.from(parsed.gameState.join('\n')+'\n'):parsed.body;
    if(body){const output=facts.output;need(output&&output.collection===key.collection&&output.replay_id===key.replayId&&output.fingerprint===key.fingerprint&&output.path===record.outputPath&&output.hash===sha256(body)&&Number(output.bytes)===body.length&&output.state==='ready','INVALID_REFERENCE');verifyFile(o.root,output,body);}
    else need(!facts.output,'INVALID_REFERENCE');
    const payloads=store.pagePayloads(recordOwner(key));need(!payloads.cursor,'RESOURCE_LIMIT');
    if(key.collection==='log'){
        const property=properties.find(p=>p.pointer==='/otherEntries'),row=payloads.rows[0],diag=digestChunks(diagnosticChunks(parsed.otherEntries));
        need(property?.value===null&&property.payload_pointer==='/otherEntries'&&payloads.rows.length===1&&row.owner_kind==='record'&&row.owner_key===identity&&row.pointer==='/otherEntries'&&row.parent===null&&row.role==='diagnostics'&&row.encoding==='jsonl-v1'&&row.state==='ready'&&row.hash===diag.expectedHash&&Number(row.bytes)===diag.expectedBytes&&Number(row.items)===parsed.otherEntries.length&&row.path===payloadPath(store.storeId,recordOwner(key),'/otherEntries','diagnostics',diag.expectedHash),'INVALID_REFERENCE');
        const children=store.pagePayloads(recordOwner(key),'/otherEntries');need(!children.rows.length&&!children.cursor,'INVALID_REFERENCE');
        verifyFile(o.root,row,Buffer.concat([...diagnosticChunks(parsed.otherEntries)]));
    }else{
        const property=properties.find(p=>p.pointer==='/validation');
        if(property?.payload_pointer!==null&&property!==undefined){const digest=digestChunks(jsonChunks(parsed.validation));validationReference(store,recordOwner(key),{path:payloadPath(store.storeId,recordOwner(key),'/validation','extensions',digest.expectedHash),hash:digest.expectedHash,bytes:digest.expectedBytes});verifyFile(o.root,payloads.rows[0],Buffer.concat([...jsonChunks(parsed.validation)]));}
        else need(payloads.rows.length===0,'UNSUPPORTED_REPRESENTATION');
    }
    return{kind:'deduplicated',record};
}
function writeMap(root,name,bytes){
    const file=target(root,name);if(fs.existsSync(file)){verifyFile(root,{path:name,hash:sha256(bytes),bytes:bytes.length},bytes);syncDirectory(root);return;}
    const tmp=file+'.'+randomUUID()+'.pending',fd=fs.openSync(tmp,'wx',0o600);let failed=false,primary;
    try{for(const b of chunks(bytes)){let offset=0;while(offset<b.length){const n=fs.writeSync(fd,b,offset,b.length-offset);need(n>0,'INVALID_ARTIFACT');offset+=n;}}fs.fsyncSync(fd);}
    catch(e){failed=true;primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;cleanup(primary,e);}}
    fs.linkSync(tmp,file);syncDirectory(root);fs.unlinkSync(tmp);syncDirectory(root);
}
function set(tx,owner,value,refs,validation){for(const[i,k]of Object.keys(value).entries())tx.setProperty({owner,pointer:pointer(k),ordinal:i,...(k==='otherEntries'?{payloadRef:refs}:k==='validation'&&validation?{payloadRef:validation}:{value:value[k]})});}

export async function importSyntheticCache(input){
    const o=request(input);return importSelected(o,importTraversalBudget(o.root),productionCacheCapacity(o.root));
}
async function importSelected(o,limits,capacity,rehearsalScope){
    const start=performance.now(),check=()=>need(performance.now()-start<=syntheticImportLimits.deadlineMs,'RESOURCE_LIMIT');
    const s=source(o),parsed=parse(s.bytes,o.collection,capacity),key={collection:o.collection,replayId:parsed.replayId,fingerprint:parsed.fingerprint},owner=recordOwner(key);
    const [major,minor]=process.versions.node.split('.').map(Number);need(process.platform==='darwin'&&major===24&&minor>=19,'UNSUPPORTED_RUNTIME');
    const store=rehearsalScope?await openRehearsalStore(rehearsalScope,'write'):await openStore({root:o.root,mode:'write'});let failed=false,primary;
    try{return await store.withWriter(async w=>{
        check();const stable=()=>{check();need(equal(source(o).identity,s.identity),'CHANGED_INPUT');};
        // The same selected filename cannot strand a differently identified
        // pending publication by being replaced and imported as new content.
        const cpPointer='/syntheticCacheImportV1/'+sha256(recordKey(key));
        let saved=null,conversion=null,rootCount=0,rootBytes=0,savedBytes=0;
        for(const p of importControlRows(store,limits,check)){rootCount++;rootBytes+=rowBytes(p);
            if(!p.pointer.startsWith('/syntheticLocalLogV1/')&&!p.pointer.startsWith('/syntheticCacheImportV1/')&&p.pointer!=='/boundedFixtureConversionV1')continue;
            need(p.value!==null&&p.payload_pointer===null,'INVALID_REFERENCE');const c=JSON.parse(p.value);
            if(p.pointer==='/boundedFixtureConversionV1'){need(c?.phase==='verified'&&c.current===null,'NOT_READY');conversion=c;continue;}
            if(p.pointer.startsWith('/syntheticLocalLogV1/')){need(c.phase==='verified','NOT_READY','Resume the exact local-log adoption before cache import');continue;}
            need(['prepared','reserved','published','verified'].includes(c.phase),'INVALID_REFERENCE');
            if(p.pointer===cpPointer){saved={value:c,ordinal:p.ordinal};savedBytes=rowBytes(p);}
            if(c.phase!=='verified'){
                if(c.source?.sourceRoot===s.identity.sourceRoot&&c.source?.sourceFile===s.identity.sourceFile)need(equal(c.source,s.identity),'CHANGED_INPUT');
                need(p.pointer===cpPointer,'NOT_READY','Resume the existing selected import before another source');
            }}
        const facts=w.readReviewCheckpoint({recordKey:key,taskId:'synthetic/import'});
        need(!(facts.current&&facts.retired),'INVALID_REFERENCE');if(facts.retired)return{kind:'deduplicated',replayId:key.replayId,fingerprint:key.fingerprint,retired:true};
        const counts=corpusCounts(store,limits,check);
        if(facts.current&&!saved){const result=convertedDuplicate(store,w,o,parsed,key,facts,conversion);stable();return result;}
        // A committed map-independent score stays independent if a later log
        // registers a map. Never rewrite its original metadata on repetition.
        const independent=o.collection==='score'&&saved?.value.map===null&&saved?.value.replay===null;
        let active=independent?null:mapState(store,o.root,key.replayId,o.collection==='log'?parsed.map:null);
        if(o.collection==='log'&&!active&&!parsed.map)return{kind:'deferred',replayId:key.replayId,fingerprint:key.fingerprint,coverage:parsed.coverage,diagnosticCoverage:parsed.diagnosticCoverage,message:'No validated active map for replay; no record created'};
        if(active&&o.collection==='log'&&parsed.buildId!==null&&active.replay.buildId)need(parsed.buildId===active.replay.buildId,'IDENTITY_CONFLICT');
        if(saved)need(saved.value.version===1&&saved.value.storeId===store.storeId&&['prepared','reserved','published','verified'].includes(saved.value.phase)&&String(saved.ordinal)===saved.value.ordinal&&
            (independent?saved.value.mapOrdinal===null&&saved.value.replayOrdinal===null:['mapOrdinal','replayOrdinal'].every(k=>typeof saved.value[k]==='string'&&/^(0|[1-9]\d*)$/.test(saved.value[k])))&&typeof saved.value.recordOrdinal==='string'&&/^(0|[1-9]\d*)$/.test(saved.value.recordOrdinal),'INVALID_REFERENCE');
        need(!facts.current||saved,'UNSUPPORTED_STATE','Existing record lacks an import commitment');
        let cp=saved?.value;
        if(cp&&(cp.phase!=='verified'||cp.source?.sourceRoot===s.identity.sourceRoot&&cp.source?.sourceFile===s.identity.sourceFile))need(equal(cp.source,s.identity),'CHANGED_INPUT');
        if(cp)need(cp.source?.cacheHash===s.identity.cacheHash&&cp.source?.markerHash===s.identity.markerHash,'CHANGED_INPUT');
        const ord=w.importOrdinals(o.collection),now=cp?.createdAt??new Date().toISOString();
        if(o.collection==='score'&&!active)need(ord.mapIndependentScores,'UNSUPPORTED_STORE','Legacy fixture schema cannot import association-free scores');
        if(!active&&o.collection==='log'){
            const checksum=mapChecksum(parsed.map),existing=store.getMap(checksum);
            if(!existing.kind){
                const map=originals(store,{kind:'map',key:checksum}),content=mapBytes(parsed.map);need(map.checksum===checksum&&map.status==='validated'&&map.file===existing.path,'INVALID_ASSOCIATION');verifyFile(o.root,{path:map.file,hash:existing.hash,bytes:content.length},content);
                active={map,replay:{replayId:key.replayId,mapId:checksum,status:'active',associatedAt:now,retiredFingerprints:[]}};
            }else{
                const date=now.replace(/:/g,'-').replace('.','-'),file=cp?.map?.file??choose(o.root,w,[`pain_and_gain_map_${date}.json`,`pain_and_gain_map_${date}-${checksum.slice(0,12)}.json`,`pain_and_gain_map_${date}-${checksum}.json`]);
                active={map:{id:checksum,checksum,file,status:'validated',registeredAt:now},replay:{replayId:key.replayId,mapId:checksum,status:'active',associatedAt:now,retiredFingerprints:[]}};
            }
        }
        if(o.collection==='log'&&parsed.buildId!==null&&!active.replay.buildId)active.replay={...active.replay,buildId:parsed.buildId};
        const mapped=o.collection==='log'&&!parsed.gameState.length&&!hasRetainedDiagnostics(parsed),evidenceOnly=o.collection==='log'&&!parsed.gameState.length&&!mapped;
        // Prepared recovery may not have inserted its record yet. Recheck the
        // remaining capacity under this lock even when its commitment exists.
        if(!facts.current&&!mapped)need(counts.selected?counts.selected[o.collection]<(o.collection==='log'?limits.logs:limits.scores):Number(counts.records)<limits.records,'RESOURCE_LIMIT');
        if(active)need(/^[a-f0-9]{64}$/.test(active.map.id)&&/^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/.test(active.map.file),'UNSAFE_PATH');
        const names=o.collection==='log'?logOutputNames(key.replayId,key.fingerprint):scoreOutputNames(key.replayId,key.fingerprint);
        const output=mapped||evidenceOnly?null:cp?.output?.path??choose(o.root,w,names);need(output===null||names.includes(output),'UNSAFE_PATH');
        const sourceEntry=cp?.phase==='verified'?path.join(cp.source.sourceRoot,cp.source.sourceFile):s.file;
        const record=mapped?null:o.collection==='log'?logImportRecord(parsed,sourceEntry,output,active.map,now):scoreImportRecord(parsed,sourceEntry,output,active?.map.id??null,now);
        if(record&&o.collection==='score'&&cp?.phase==='verified')record.cacheEntryFingerprint=cp.source.cacheHash;
        if(record)record.status='claim';
        const body=output===null?null:o.collection==='log'?Buffer.from(parsed.gameState.join('\n')+'\n'):parsed.body;
        need(!body||body.length<=syntheticImportLimits.artifact,'RESOURCE_LIMIT');if(record)fields(record,o.collection==='score');if(active){fields(active.map);fields(active.replay);}
        const diag=record&&o.collection==='log'?{...digestChunks(diagnosticChunks(parsed.otherEntries)),items:parsed.otherEntries.length}:null;
        const validationDigest=record&&o.collection==='score'?digestChunks(jsonChunks(record.validation)):null;
        const validation=validationDigest&&validationDigest.expectedBytes>syntheticImportLimits.field?{path:payloadPath(store.storeId,owner,'/validation','extensions',validationDigest.expectedHash),hash:validationDigest.expectedHash,bytes:validationDigest.expectedBytes}:null;
        if(cp){need(active?cp.replay?.mapId===active.replay.mapId&&cp.replay?.status===active.replay.status&&(!cp.replay.buildId||cp.replay.buildId===active.replay.buildId):cp.map===null&&cp.replay===null,'IDENTITY_CONFLICT');}
        const expected={version:1,storeId:store.storeId,createdAt:now,source:s.identity,map:active?.map??null,replay:cp?.replay??active?.replay??null,mapped,
            output:body?{path:output,hash:sha256(body),bytes:body.length}:null,diagnostics:diag?{path:payloadPath(store.storeId,owner,'/otherEntries','diagnostics',diag.expectedHash),hash:diag.expectedHash,bytes:diag.expectedBytes,items:diag.items}:null,...(validation?{validation}: {})};
        if(cp){need(equal({...cp,source:expected.source,phase:undefined,ordinal:undefined,recordOrdinal:undefined,mapOrdinal:undefined,replayOrdinal:undefined}, {...expected,phase:undefined,ordinal:undefined,recordOrdinal:undefined,mapOrdinal:undefined,replayOrdinal:undefined}),'INVALID_REFERENCE');}
        // Read once while locked, before BEGIN IMMEDIATE writes. Opening a
        // second read connection inside a live rollback journal is prohibited.
        const mapProjection=active?store.getMap(active.map.id):null,replayProjection=active?store.getReplay(key.replayId):null,insertMap=mapProjection?.kind==='missing',insertReplay=replayProjection?.kind==='missing';
        need(!insertMap||Number(counts.maps)<limits.maps,'RESOURCE_LIMIT');need(!insertReplay||Number(counts.replays)<limits.replays,'RESOURCE_LIMIT');
        const collections=o.collection==='score'?['scoreRecords','retiredScoreSources'].map(name=>({name,row:store.getCollection(name)})):[];
        for(const c of collections)need(c.row.kind==='missing'||c.row.present===1,'UNSUPPORTED_REPRESENTATION');
        const newCheckpoint=!cp;
        if(newCheckpoint){need(rootCount<limits.rootProperties&&!facts.current&&(mapped||(counts.selected?counts.selected[o.collection]<(o.collection==='log'?limits.logs:limits.scores):Number(counts.records)<limits.records)),'RESOURCE_LIMIT');cp={...expected,ordinal:String(ord.root),recordOrdinal:String(ord.record),mapOrdinal:active?String(insertMap?ord.map:mapProjection.ordinal):null,replayOrdinal:active?String(insertReplay?ord.replay:replayProjection.ordinal):null,phase:'prepared'};}
        // Reserve the longest phase before any checkpoint/publication mutation.
        need(rootBytes-savedBytes+rowBytes({pointer:cpPointer,ordinal:cp.ordinal,value:JSON.stringify({...cp,phase:'published'}),payload_pointer:null})<=limits.rootBytes,'RESOURCE_LIMIT');
        if(newCheckpoint){stable();w.transaction(tx=>tx.setProperty({owner:ROOT,pointer:cpPointer,ordinal:ord.root,value:cp}));}
        if(active&&!insertMap)need(String(mapProjection.ordinal)===cp.mapOrdinal,'INVALID_REFERENCE');if(active&&!insertReplay)need(String(replayProjection.ordinal)===cp.replayOrdinal,'INVALID_REFERENCE');
        const checkpoint=(tx,phase)=>{cp={...cp,phase};tx.setProperty({owner:ROOT,pointer:cpPointer,ordinal:BigInt(cp.ordinal),value:cp});};
        const mapContent=parsed.map?mapBytes(parsed.map):null;
        const prepareLinks=tx=>{
            if(!active)return;
            if(insertMap)tx.insertEntity({kind:'map',key:active.map.id,ordinal:BigInt(cp.mapOrdinal),value:active.map,mapArtifact:{path:active.map.file,hash:sha256(mapContent)}});
            if(insertReplay)tx.insertEntity({kind:'replay',key:key.replayId,ordinal:BigInt(cp.replayOrdinal),value:active.replay});
            else if(o.collection==='log'&&parsed.buildId!==null)tx.associateReplayBuild({replayId:key.replayId,buildId:parsed.buildId});
        };
        const verifyRecord=(published)=>{
            const f=w.readReviewCheckpoint({recordKey:key,taskId:'synthetic/import'}),r=f.current;need(r&&String(r.ordinal)===cp.recordOrdinal&&r.map_id===record.mapId&&r.build_id===(record.buildId??null)&&r.status===(published?'claim':'pending')&&r.key===recordKey(key)&&r.output_path===output&&r.output_hash===(body?sha256(body):null),'INVALID_REFERENCE');
            for(const p of rows(store,owner)){if(p.pointer==='/otherEntries'){need(diag&&p.value===null&&p.payload_pointer==='/otherEntries','INVALID_REFERENCE');continue;}if(p.pointer==='/validation'&&validation){need(published&&p.value===null&&p.payload_pointer==='/validation','INVALID_REFERENCE');continue;}const name=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');if(Object.hasOwn(record,name)&&name!=='reviews'){need(p.payload_pointer===null&&equal(JSON.parse(p.value),name==='status'?(published?'claim':'pending'):record[name]),'IDENTITY_CONFLICT');}}
            const names=Object.keys(record).filter(n=>published||(n!=='otherEntries'&&!(n==='validation'&&validation)));
            const originalsFound=new Set(rows(store,owner).map(p=>p.pointer));for(const name of names)need(originalsFound.has(pointer(name)),'INVALID_REFERENCE');
            for(const p of rows(store,owner)){const index=names.indexOf(p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'));if(index!==-1)need(Number(p.ordinal)===index,'INVALID_REFERENCE');}
            if(body)need(f.output&&f.output.collection===key.collection&&f.output.replay_id===key.replayId&&f.output.fingerprint===key.fingerprint&&f.output.path===output&&f.output.hash===sha256(body)&&Number(f.output.bytes)===body.length&&(published?f.output.state==='ready':['pending','ready'].includes(f.output.state)),'INVALID_REFERENCE');else need(!f.output,'INVALID_REFERENCE');
            if(diag){const page=store.pagePayloads(owner),row=page.rows[0];need(!page.cursor&&page.rows.length===1&&row.owner_kind===owner.kind&&row.owner_key===owner.key&&row.pointer==='/otherEntries'&&row.parent===null&&row.role==='diagnostics'&&row.encoding==='jsonl-v1'&&row.path===expected.diagnostics.path&&row.hash===diag.expectedHash&&Number(row.bytes)===diag.expectedBytes&&Number(row.items)===diag.items&&(published?row.state==='ready':['pending','ready'].includes(row.state)),'INVALID_REFERENCE');const child=store.pagePayloads(owner,'/otherEntries');need(!child.cursor&&!child.rows.length,'INVALID_REFERENCE');}
            if(validation)validationReference(store,owner,validation,published);
            else if(o.collection==='score'){const page=store.pagePayloads(owner);need(!page.cursor&&!page.rows.length,'INVALID_REFERENCE');}
            if(published)need(!f.intent,'INVALID_REFERENCE');else{
                const operationId='synthetic-import-'+sha256(recordKey(key)),operations=store.pageOperations();need(!operations.cursor&&operations.rows.filter(r=>r.collection===key.collection&&r.replay_id===key.replayId&&r.fingerprint===key.fingerprint).length===1&&f.intent?.id===operationId,'INVALID_REFERENCE');
                const expectedFiles=[expected.output,...(diag?[expected.diagnostics]:[]),...(validation?[validation]:[])],files=w.readImportIntent(operationId);need(files.length===expectedFiles.length,'INVALID_REFERENCE');
                for(const[i,file]of files.entries()){const target=expectedFiles[i];need(Number(file.ordinal)===i&&file.path===target.path&&file.hash===target.hash&&Number(file.bytes)===target.bytes&&['pending','verified'].includes(file.state),'INVALID_REFERENCE');}
            }
        };
        if(['published','verified'].includes(cp.phase)){
            if(record){verifyRecord(true);if(body)verifyFile(o.root,expected.output,body);if(diag)verifyFile(o.root,expected.diagnostics,Buffer.concat([...diagnosticChunks(parsed.otherEntries)]));if(validation)verifyFile(o.root,validation,Buffer.concat([...jsonChunks(record.validation)]));}
            stable();const retained=record?resultRecord(store,w,key,parsed.otherEntries,o.root):null;if(cp.phase==='published')w.transaction(tx=>checkpoint(tx,'verified'));return mapped?{kind:'mapped',replayId:key.replayId,mapId:active.map.id,mapFile:active.map.file,otherEntries:parsed.otherEntries}:{kind:'deduplicated',record:retained};
        }
        // Existing maps were verified against their pinned original bytes above.
        // A new response must not require those bytes to use importer formatting.
        stable();if(mapContent&&insertMap)writeMap(o.root,active.map.file,mapContent);
        const operationId='synthetic-import-'+sha256(recordKey(key));
        if(mapped){stable();w.transaction(tx=>{prepareLinks(tx);checkpoint(tx,'verified');});return{kind:'mapped',replayId:key.replayId,mapId:active.map.id,mapFile:active.map.file,otherEntries:parsed.otherEntries};}
        if(evidenceOnly){
            const ref=await w.publishPayload({owner,pointer:'/otherEntries',role:'diagnostics',source:diagnosticChunks(parsed.otherEntries),evidenceOnly:true,...diag});stable();
            w.transaction(tx=>{prepareLinks(tx);const value={...record};delete value.otherEntries;tx.insertEntity({kind:'record',key:recordKey(key),ordinal:BigInt(cp.recordOrdinal),value});tx.finishPublication({recordKey:key,payloadRefs:[ref]});set(tx,owner,record,ref);checkpoint(tx,'published');});
        }else{
            if(cp.phase==='prepared'){stable();w.transaction(tx=>{prepareLinks(tx);
                for(const[i,c]of collections.entries()){if(c.row.kind==='missing')tx.insertEntity({kind:'collection',key:c.name,ordinal:i,value:{present:true}});else need(c.row.present===1,'UNSUPPORTED_REPRESENTATION');}
                const value={...record,status:'pending',outputPath:null,outputFingerprint:null};delete value.otherEntries;if(validation)delete value.validation;tx.insertEntity({kind:'record',key:recordKey(key),ordinal:BigInt(cp.recordOrdinal),value});tx.reserveOutput({recordKey:key,path:output,expectedBytes:body.length,expectedHash:sha256(body)});
                // reserveOutput's generic append semantics are not the original
                // import property order. Restore those two existing ordinals
                // inside this same preparation transaction, before checkpointing.
                for(const[name,v]of [['outputPath',output],['outputFingerprint',sha256(body)]])tx.setProperty({owner,pointer:pointer(name),ordinal:Object.keys(value).indexOf(name),value:v});
                tx.appendIntent({id:operationId,recordKey:key,files:[{ordinal:0,...expected.output},...(diag?[{ordinal:1,...expected.diagnostics,payload:{owner,pointer:'/otherEntries',role:'diagnostics',items:diag.items}}]:[]),...(validation?[{ordinal:1,...validation,payload:{owner,pointer:'/validation',role:'extensions',items:null}}]:[])]});checkpoint(tx,'reserved');});}
            verifyRecord(false);stable();await w.publishOutput({recordKey:key,path:output,source:chunks(body),expectedBytes:body.length,expectedHash:sha256(body)});
            let ref;if(diag){stable();ref=await w.publishPayload({owner,pointer:'/otherEntries',role:'diagnostics',source:diagnosticChunks(parsed.otherEntries),...diag});}
            let validationRef;if(validation){stable();validationRef=await w.publishPayload({owner,pointer:'/validation',role:'extensions',source:jsonChunks(record.validation),...validationDigest});}
            stable();w.transaction(tx=>{tx.finishPublication({recordKey:key,operationId});set(tx,owner,record,ref,validationRef);checkpoint(tx,'published');});
        }
        verifyRecord(true);if(body)verifyFile(o.root,expected.output,body);if(diag)verifyFile(o.root,expected.diagnostics,Buffer.concat([...diagnosticChunks(parsed.otherEntries)]));if(validation)verifyFile(o.root,validation,Buffer.concat([...jsonChunks(record.validation)]));stable();const retained=resultRecord(store,w,key,parsed.otherEntries,o.root);w.transaction(tx=>checkpoint(tx,'verified'));return{kind:'imported',record:retained};
    });}catch(e){failed=true;primary=e;throw e;}finally{try{store.close();}catch(e){if(!failed)throw e;cleanup(primary,e);}}
}

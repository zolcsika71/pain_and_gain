// Bounded synthetic administrative export, not a production migration exporter.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Buffer} from 'node:buffer';
import {resident,withCleanup} from './retrieval-files.js';
import {fail,jsonChunks,iterateDiagnostics,verifyPayload,payloadChunks,payloadPath} from './replay-store-payloads.js';
import {authorityHash} from './replay-authority-guard.js';
import {validMap,mapPayload,mapChecksum} from './replay-logs.js';

export const ROLLBACK_LIMITS=Object.freeze({manifestBytes:4*1048576,artifactBytes:32*1048576,ioBytes:256*1048576,wrappers:4096,deadlineMs:60000});
const need=(ok,code='INVALID_REFERENCE')=>{if(!ok)fail(code,'Synthetic rollback contract failed');};
const own=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});
const encode=v=>JSON.stringify(v),same=(a,b)=>encode(a)===encode(b);
const ordered=rows=>[...rows].sort((a,b)=>Number(a.ordinal)-Number(b.ordinal)||String(a.key??a.pointer??a.task).localeCompare(String(b.key??b.pointer??b.task)));
export function rollbackBudget(input={}){
    need(input&&[Object.prototype,null].includes(Object.getPrototypeOf(input)),'INVALID_ARGUMENT');const limits={...ROLLBACK_LIMITS};
    for(const k of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,k);need(Object.hasOwn(limits,k)&&Object.hasOwn(d,'value')&&Number.isSafeInteger(d.value)&&d.value>0&&d.value<=limits[k],'RESOURCE_LIMIT');limits[k]=d.value;}
    const start=performance.now();let io=0;
    return{limits,charge(n=0){io+=n;need(Number.isSafeInteger(io)&&io<=limits.ioBytes&&performance.now()-start<=limits.deadlineMs,'RESOURCE_LIMIT');},get io(){return io;}};
}
export function close(fd,primary){try{fs.closeSync(fd);}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Rollback operation/cleanup',{cause:primary});else throw e;}}
export function syncDirectory(directory){const fd=fs.openSync(directory,fs.constants.O_RDONLY);let primary;try{fs.fsyncSync(fd);}catch(e){primary=e;throw e;}finally{close(fd,primary);}}
export function regular(file){const st=resident(file);need(fs.realpathSync(file)===file&&st.nlink===1,'UNSAFE_PATH');return st;}
function safe(root,relative){need(typeof relative==='string'&&relative.length>0&&!path.isAbsolute(relative)&&!relative.includes('\\')&&relative.split('/').every(s=>s&&s!=='.'&&s!=='..'),'UNSAFE_PATH');let p=root;for(const part of relative.split('/')){p=path.join(p,part);const st=fs.lstatSync(p);need(!st.isSymbolicLink(),'UNSAFE_PATH');}return p;}
export function verifyAuthoritySource(root,facts,b){
    for(const row of [...facts.tables.maps,...facts.tables.outputs,...facts.tables.payloads]){
        if(row.state!==undefined)need(row.state==='ready','RECOVERY_REQUIRED');const digest=hashFile(safe(root,row.path),b);
        need(digest.hash===row.hash&&(row.bytes===undefined||digest.bytes===row.bytes),'INVALID_ARTIFACT');
    }
}
export function hashFile(file,b,max=32*1048576){const st=regular(file);need(st.size<=max,'RESOURCE_LIMIT');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
    try{const opened=fs.fstatSync(fd);need(opened.ino===st.ino&&opened.dev===st.dev&&opened.size===st.size,'CHANGED_INPUT');const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let bytes=0;for(;;){b.charge();const n=fs.readSync(fd,buffer,0,buffer.length,bytes);if(!n)break;b.charge(n);hash.update(buffer.subarray(0,n));bytes+=n;need(bytes<=max,'RESOURCE_LIMIT');}const end=fs.fstatSync(fd),named=fs.lstatSync(file);need(bytes===st.size&&end.mtimeMs===st.mtimeMs&&end.ctimeMs===st.ctimeMs&&named.ino===st.ino&&named.dev===st.dev,'CHANGED_INPUT');return{bytes,hash:hash.digest('hex')};
    }catch(e){primary=e;throw e;}finally{close(fd,primary);}}
export async function publishStream(file,chunks,b,max,{replace=false,fault=()=>{}}={}){
    const temp=path.join(path.dirname(file),`.authority-${randomUUID()}.tmp`),fd=fs.openSync(temp,'wx',0o600);let primary,bytes=0;const hash=createHash('sha256');
    try{for await(const piece of chunks){const chunk=Buffer.isBuffer(piece)?piece:Buffer.from(piece);bytes+=chunk.length;need(bytes<=max,'RESOURCE_LIMIT');for(let offset=0;offset<chunk.length;){const n=fs.writeSync(fd,chunk,offset,Math.min(65536,chunk.length-offset));need(n>0,'IO_ERROR');offset+=n;b.charge(n);}hash.update(chunk);}fs.fsyncSync(fd);
    }catch(e){primary=e;throw e;}finally{close(fd,primary);}
    const fact={bytes,hash:hash.digest('hex')};await fault('before-file-publication');
    if(!replace&&fs.existsSync(file)){need(same(hashFile(file,b,max),fact),'CHANGED_DESTINATION');return fact;}
    // All callers hold the authority lock (and the source writer lock for
    // exports). As elsewhere in the fixture protocol, non-cooperating path
    // replacement between this check and rename is not an OS-level CAS.
    fs.renameSync(temp,file);
    syncDirectory(path.dirname(file));await fault('after-file-publication');return fact;
}
function properties(t,kind,key){const rows=ordered(t.properties.filter(p=>p.owner_kind===kind&&p.owner_key===key));need(rows.length<=128,'RESOURCE_LIMIT');need(new Set(rows.map(p=>p.ordinal)).size===rows.length,'INVALID_REFERENCE');return rows;}
function plainProperties(t,kind,key){const result={};for(const p of properties(t,kind,key)){need(p.value!==null&&p.payload_pointer===null&&/^\/(?:[^/~]|~[01])*$/.test(p.pointer),'UNSUPPORTED_REPRESENTATION');own(result,p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),JSON.parse(p.value));}return result;}
function projections(value,row,mapping){for(const[k,col]of Object.entries(mapping))if(Object.hasOwn(value,k))need(same(value[k],row[col]),'INVALID_REFERENCE');}
function key(r){return{collection:r.collection,replayId:r.replay_id,fingerprint:r.fingerprint};}
function reviewValues(t,r){const value={},reviews=ordered(t.reviews.filter(x=>x.collection===r.collection&&x.replay_id===r.replay_id&&x.fingerprint===r.fingerprint));need(reviews.length<=16,'RESOURCE_LIMIT');
    for(const review of reviews){need(review.owner_key===encode([r.key,review.task]),'OWNERSHIP_CONFLICT');const v=plainProperties(t,'review',review.owner_key);if(review.value!==null)need(same(JSON.parse(review.value),v));own(value,review.task,v);}return value;
}
function diagnosticsView(root,p,b,validation=false){
    need(p.state==='ready'&&p.parent===null&&(validation?p.role==='extensions'&&p.encoding==='json-v1'&&p.items===null:p.role==='diagnostics'&&p.encoding==='jsonl-v1')&&Number.isSafeInteger(p.bytes)&&p.bytes>=0&&p.bytes<=(validation?1048576:16*1048576),'UNSUPPORTED_REPRESENTATION');
    const file=safe(root,p.path),before=regular(file);need(before.size===p.bytes);const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let st;
    try{st=fs.fstatSync(fd);need(st.ino===before.ino&&st.dev===before.dev,'CHANGED_INPUT');}catch(e){close(fd,e);throw e;}
    const ref={...p,owner:{kind:p.owner_kind,key:p.owner_key},parentPointer:p.parent};let active=true;
    const view={assertOpen(){need(active,'CLOSED');b.charge();},artifact(r){need(r.path===ref.path&&r.hash===ref.hash);return{fd};},read(a,buffer,offset){this.assertOpen();const n=fs.readSync(a.fd,buffer,0,buffer.length,offset);b.charge(n);return n;},diagnostics(){return ref;},child(){fail('UNSUPPORTED_REPRESENTATION','Rollback supports diagnostic leaves only');},
        close(primary){active=false;close(fd,primary);},stable(){const end=fs.fstatSync(fd),named=regular(file);need(end.size===st.size&&end.mtimeMs===st.mtimeMs&&end.ctimeMs===st.ctimeMs&&named.ino===st.ino,'CHANGED_INPUT');}};
    return{view,ref};
}
export async function exportAuthoritySnapshot(root,destination,facts,b,fault=()=>{}){
    const t=facts.tables,usedProperties=new Set(),usedPayloads=new Set(),usedOutputs=new Set(),files=[],archive=[];
    const data=path.join(destination,'replay_logs');if(!fs.existsSync(data)){fs.mkdirSync(data,{mode:0o700});syncDirectory(destination);}need(fs.realpathSync(data)===data,'UNSAFE_PATH');
    const projected=(kind,row)=>{const value=plainProperties(t,kind,row.key);for(const p of properties(t,kind,row.key))usedProperties.add(p);
        if(kind==='map')projections(value,row,{id:'key',mapId:'key',file:'path',path:'path',hash:'hash',status:'status',checksum:'key'});
        if(kind==='replay')projections(value,row,{replayId:'key',mapId:'map_id',buildId:'build_id',status:'status'});return value;};
    const maps=ordered(t.maps).map(r=>({row:r,value:projected('map',r)})),replays=ordered(t.replays).map(r=>({row:r,value:projected('replay',r)}));
    for(const r of t.retired){if(r.collection==='log'){const replay=replays.find(x=>x.row.key===r.replay_id);need(replay&&replay.value.retiredFingerprints?.[Number(r.ordinal)]===r.fingerprint&&r.key===encode(['log',r.replay_id,r.fingerprint]));need(!t.records.some(x=>x.key===r.key));}else need(r.collection==='score','UNSUPPORTED_REPRESENTATION');}
    for(const replay of replays)for(const[i,fp]of(replay.value.retiredFingerprints??[]).entries())need(t.retired.some(r=>r.collection==='log'&&r.replay_id===replay.row.key&&r.fingerprint===fp&&Number(r.ordinal)===i));
    let artifactBytes=0;
    async function copy(relative,expected){need(path.basename(relative)===relative,'UNSUPPORTED_REPRESENTATION');const file=safe(root,relative),digest=hashFile(file,b);need(digest.hash===expected.hash&&(expected.bytes===undefined||digest.bytes===expected.bytes));artifactBytes+=digest.bytes;need(artifactBytes<=b.limits.artifactBytes,'RESOURCE_LIMIT');
        const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
        async function* chunks(){let offset=0;while(offset<digest.bytes){const chunk=Buffer.alloc(Math.min(65536,digest.bytes-offset)),n=fs.readSync(fd,chunk,0,chunk.length,offset);need(n>0,'CHANGED_INPUT');offset+=n;b.charge(n);yield chunk.subarray(0,n);}}
        try{const copied=await publishStream(path.join(data,relative),chunks(),b,b.limits.artifactBytes,{fault});need(same(copied,digest));}catch(e){primary=e;throw e;}finally{close(fd,primary);}
        need(same(hashFile(file,b),digest),'CHANGED_INPUT');files.push({path:relative,...digest});
    }
    for(const m of maps){const file=safe(root,m.row.path),st=regular(file);need(st.size<=1048576,'RESOURCE_LIMIT');const bytes=fs.readFileSync(file);b.charge(bytes.length);need(authorityHash(bytes)===m.row.hash,'INVALID_ARTIFACT');const map=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));need(validMap(mapPayload(map))&&mapChecksum(map)===m.row.key&&map.checksum===m.row.key,'INVALID_ARTIFACT');await copy(m.row.path,{hash:m.row.hash});}
    for(const r of t.records){need(r.key===encode([r.collection,r.replay_id,r.fingerprint]));const outputs=t.outputs.filter(o=>o.collection===r.collection&&o.replay_id===r.replay_id&&o.fingerprint===r.fingerprint);
        if(r.output_path!==null||r.output_hash!==null||outputs.length){need(outputs.length===1);const o=outputs[0];need(o.state==='ready'&&o.path===r.output_path&&o.hash===r.output_hash);usedOutputs.add(o);await copy(o.path,o);}}
    const recovery=path.join(destination,'recovery');if(!fs.existsSync(recovery)){fs.mkdirSync(recovery,{mode:0o700});syncDirectory(destination);}resident(recovery,true);need(fs.realpathSync(recovery)===recovery,'UNSAFE_PATH');
    const factsDigest=await publishStream(path.join(recovery,'source-facts.json'),jsonChunks(facts),b,8*1048576,{fault});archive.push({path:'recovery/source-facts.json',...factsDigest});
    const retained=t.payloads.map(p=>({path:p.path,hash:p.hash,bytes:p.bytes}));
    for(const repair of t.map_repairs){need(repair.phase==='verified','RECOVERY_REQUIRED');retained.push({path:repair.old_path,hash:repair.old_hash,bytes:repair.old_bytes},{path:repair.new_path,hash:repair.new_hash,bytes:repair.new_bytes});}
    for(const [i,ref]of retained.entries()){
        const original=safe(root,ref.path),digest=hashFile(original,b);need(same(digest,{bytes:ref.bytes,hash:ref.hash}));artifactBytes+=ref.bytes;need(artifactBytes<=b.limits.artifactBytes,'RESOURCE_LIMIT');
        const fd=fs.openSync(original,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
        async function* chunks(){let offset=0;while(offset<ref.bytes){const bytes=Buffer.alloc(Math.min(65536,ref.bytes-offset)),n=fs.readSync(fd,bytes,0,bytes.length,offset);need(n>0,'CHANGED_INPUT');offset+=n;b.charge(n);yield bytes.subarray(0,n);}}
        const relative=`recovery/original-${i}.bytes`;try{const d=await publishStream(path.join(destination,relative),chunks(),b,b.limits.artifactBytes,{fault});need(d.hash===ref.hash&&d.bytes===ref.bytes);}catch(e){primary=e;throw e;}finally{close(fd,primary);}
        need(same(hashFile(original,b),digest),'CHANGED_INPUT');archive.push({path:relative,sourcePath:ref.path,...digest});
    }
    async function* record(r){const rows=properties(t,'record',r.key),value=plainRecord(rows),reviews=reviewValues(t,r);projections(value,r,{replayId:'replay_id',fingerprint:'fingerprint',buildId:'build_id',mapId:'map_id',status:'status',outputPath:'output_path',outputFingerprint:'output_hash'});
        need(value.replayId===r.replay_id&&value.fingerprint===r.fingerprint&&value.status===r.status,'INVALID_REFERENCE');
        if(Object.hasOwn(value,'reviews'))need(value.reviews&&typeof value.reviews==='object'&&!Array.isArray(value.reviews)&&Object.keys(value.reviews).every(k=>Object.hasOwn(reviews,k)),'INVALID_REFERENCE');
        const replay=replays.find(x=>x.row.key===r.replay_id)?.row;
        if(r.collection==='log'||r.map_id!==null)need(replay&&replay.map_id===r.map_id&&maps.some(m=>m.row.key===r.map_id),'INVALID_REFERENCE');
        if(r.build_id!==null&&replay?.build_id!==null&&replay?.build_id!==undefined)need(r.build_id===replay.build_id,'INVALID_REFERENCE');
        for(const review of t.reviews.filter(x=>x.collection===r.collection&&x.replay_id===r.replay_id&&x.fingerprint===r.fingerprint))for(const p of properties(t,'review',review.owner_key))usedProperties.add(p);
        if(!Object.hasOwn(value,'reviews'))need(!Object.keys(reviews).length,'UNSUPPORTED_REPRESENTATION');
        yield Buffer.from('{');let first=true;
        for(const p of rows){usedProperties.add(p);const name=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');if(!first)yield Buffer.from(',');first=false;yield*jsonChunks(name);yield Buffer.from(':');
            if(name==='reviews'){yield*jsonChunks(reviews);continue;}
            if(p.value!==null){yield*jsonChunks(JSON.parse(p.value));continue;}
            if(r.collection==='score'&&name==='validation'){
                need(p.payload_pointer==='/validation','INVALID_REFERENCE');const refs=t.payloads.filter(x=>x.owner_kind==='record'&&x.owner_key===r.key);need(refs.length===1&&refs[0].pointer==='/validation','INVALID_REFERENCE');const pRef=refs[0];
                need(pRef.path===payloadPath(facts.storeId,{kind:'record',key:r.key},'/validation','extensions',pRef.hash),'INVALID_REFERENCE');usedPayloads.add(pRef);
                const {view,ref}=diagnosticsView(root,pRef,b,true);let primary;
                try{const parts=[];let bytes=0;for await(const chunk of payloadChunks(view,ref)){bytes+=chunk.length;need(bytes<=1048576,'RESOURCE_LIMIT');parts.push(chunk);}await verifyPayload(view,ref,true);view.stable();
                    const content=Buffer.concat(parts,bytes);JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content));yield content;
                }catch(e){primary=e;throw e;}finally{view.close(primary);}continue;
            }
            need(name==='otherEntries'&&p.payload_pointer==='/otherEntries','UNSUPPORTED_REPRESENTATION');const refs=t.payloads.filter(x=>x.owner_kind==='record'&&x.owner_key===r.key);need(refs.length===1&&refs[0].pointer===p.payload_pointer);const pRef=refs[0];usedPayloads.add(pRef);
            const {view,ref}=diagnosticsView(root,pRef,b);let primary,count=0;try{yield Buffer.from('[');for await(const entry of iterateDiagnostics(view,key(r))){need(entry.kind==='value'&&++count<=b.limits.wrappers,'RESOURCE_LIMIT');if(count>1)yield Buffer.from(',');yield*jsonChunks(entry.value);}need(count===pRef.items);await verifyPayload(view,ref,true);view.stable();yield Buffer.from(']');}catch(e){primary=e;throw e;}finally{view.close(primary);}
        }yield Buffer.from('}');
    }
    function plainRecord(rows){const value={};for(const p of rows){need(/^\/(?:[^/~]|~[01])*$/.test(p.pointer),'UNSUPPORTED_REPRESENTATION');own(value,p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),p.value===null?null:JSON.parse(p.value));}return value;}
    const rootRows=properties(t,'root','root'),internal=new Set(['/fixtureConversionV1','/boundedFixtureConversionV1']);
    const headers=[];
    for(const p of rootRows){usedProperties.add(p);need(p.value!==null&&p.payload_pointer===null,'UNSUPPORTED_REPRESENTATION');const v=JSON.parse(p.value);
        if(internal.has(p.pointer)||p.pointer.startsWith('/syntheticCacheImportV1/')||p.pointer.startsWith('/syntheticLocalLogV1/')){need(v.storeId===facts.storeId,'INVALID_REFERENCE');need(v.phase==='verified','RECOVERY_REQUIRED');continue;}
        need(/^\/(?:[^/~]|~[01])*$/.test(p.pointer),'UNSUPPORTED_REPRESENTATION');headers.push({ordinal:p.ordinal,name:p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),value:v});}
    if(!headers.some(x=>x.name==='version'))headers.push({name:'version',ordinal:-1,value:2});need(headers.find(x=>x.name==='version').value===2,'UNSUPPORTED_REPRESENTATION');
    const groups={maps,replays,records:ordered(t.records.filter(r=>r.collection==='log')),scoreRecords:ordered(t.records.filter(r=>r.collection==='score')),retiredScoreSources:ordered(t.retired.filter(r=>r.collection==='score'))};
    for(const c of ordered(t.collections)){need(Object.hasOwn(groups,c.key),'UNSUPPORTED_REPRESENTATION');const props=plainProperties(t,'collection',c.key);need(Object.keys(props).every(k=>k==='present')&&(!Object.hasOwn(props,'present')||props.present===Boolean(c.present)),'UNSUPPORTED_REPRESENTATION');for(const p of properties(t,'collection',c.key))usedProperties.add(p);if(!c.present){need(!groups[c.key].length);continue;}need(!headers.some(h=>h.name===c.key));headers.push({name:c.key,ordinal:c.ordinal,collection:true});}
    for(const[name,values]of Object.entries(groups))need(!values.length||headers.some(h=>h.name===name&&h.collection),'UNSUPPORTED_REPRESENTATION');
    need(new Set(headers.map(h=>h.ordinal)).size===headers.length,'UNSUPPORTED_REPRESENTATION');
    async function* manifest(){yield Buffer.from('{');let first=true;for(const h of ordered(headers)){if(!first)yield Buffer.from(',');first=false;yield*jsonChunks(h.name);yield Buffer.from(':');if(!h.collection){yield*jsonChunks(h.value);continue;}yield Buffer.from('[');let n=0;for(const item of groups[h.name]){b.charge();if(n++)yield Buffer.from(',');if(h.name==='records'||h.name==='scoreRecords')yield*record(item);else if(h.name==='retiredScoreSources'){const v=plainProperties(t,'retired',item.key);for(const p of properties(t,'retired',item.key))usedProperties.add(p);need(v.replayId===item.replay_id&&v.fingerprint===item.fingerprint);yield*jsonChunks(v);}else yield*jsonChunks(item.value);}yield Buffer.from(']');}yield Buffer.from('}\n');
        need(usedProperties.size===t.properties.length&&usedPayloads.size===t.payloads.length&&usedOutputs.size===t.outputs.length,'UNSUPPORTED_REPRESENTATION');}
    const manifestDigest=await publishStream(path.join(data,'manifest.json'),manifest(),b,b.limits.manifestBytes,{fault});
    // Independent bounded legacy load: actual bytes, collection counts and exact
    // stream re-encoding comparison below. Never used for a production manifest.
    const manifestFile=path.join(data,'manifest.json');need(same(hashFile(manifestFile,b,b.limits.manifestBytes),manifestDigest));
    const bytes=fs.readFileSync(manifestFile);b.charge(bytes.length);const loaded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    need(loaded.version===2&&['maps','replays','records'].every(k=>Array.isArray(loaded[k])),'UNSUPPORTED_REPRESENTATION');
    for(const h of headers.filter(h=>h.collection))need(loaded[h.name].length===groups[h.name].length);
    const second=createHash('sha256');let secondBytes=0;for await(const chunk of manifest()){second.update(chunk);secondBytes+=chunk.length;}need(secondBytes===manifestDigest.bytes&&second.digest('hex')===manifestDigest.hash);
    for(const file of files)need(same(hashFile(path.join(data,file.path),b),{bytes:file.bytes,hash:file.hash}));
    return{manifest:manifestDigest,files,archive,counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),generation:facts.generation,storeId:facts.storeId,factsHash:authorityHash(encode(facts)),limits:b.limits};
}

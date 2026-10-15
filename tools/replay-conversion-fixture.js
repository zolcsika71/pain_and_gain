// Opt-in synthetic slice only. No CLI, production dispatch, migration or cleanup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openStore, recordKey, recordOwner} from './replay-store.js';
import {Scanner} from './replay-legacy-json.js';
import {readFixtureV2Members} from './replay-legacy-reader.js';
import {mapChecksum, mapPayload, validMap} from './replay-logs.js';
import {fail, jsonChunks, diagnosticChunks, digestChunks, payloadPath} from './replay-store-payloads.js';
import {resident, readResident, publish, syncDirectory, withCleanup} from './retrieval-files.js';

export const conversionLimits = Object.freeze({manifest:2*1048576, map:1048576,
    artifact:8*1048576, totalArtifacts:17*1048576, properties:64, reviews:8,
    records:8, wrappers:4096, payloads:64, elapsedMs:30000});
const CHECKPOINT = '/fixtureConversionV1', ROOT = {kind:'root',key:'root'};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pointer = name => '/'+name.replaceAll('~','~0').replaceAll('/','~1');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const requireValue = (ok, code='INVALID_FIXTURE') => { if (!ok) fail(code,'Synthetic conversion contract failed'); };
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = v => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);

function fixtureRoot(root,prefix) {
    // Reject project/trial paths before reading their contents or opening a store.
    requireValue(typeof root === 'string' && path.isAbsolute(root) && path.resolve(root) === root &&
        path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith(prefix),'UNSAFE_PATH');
    resident(root,true); requireValue(fs.realpathSync(root) === root,'UNSAFE_PATH');
}
function file(root,name,limit) {
    requireValue(typeof name === 'string' && (name === '.v2-conversion-fixture.json' || /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)),'UNSAFE_PATH');
    const p=path.join(root,name),stat=resident(p);
    requireValue(stat.size <= limit,'RESOURCE_LIMIT'); return p;
}
function closeDescriptor(fd,error) {
    try { fs.closeSync(fd); }
    catch(cleanup) { if(error)withCleanup(error,cleanup);else throw cleanup; }
}
function* chunks(p,check,maxBytes=Infinity,range) {
    const st=resident(p);requireValue(st.size<=maxBytes,'RESOURCE_LIMIT');
    const start=range?.start??0,end=range?.end??st.size;
    requireValue(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<=st.size,'RESOURCE_LIMIT');
    const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    let error;
    try {
        const now=fs.fstatSync(fd);requireValue(now.ino===st.ino&&now.dev===st.dev,'CHANGED_INPUT');
        let offset=start;
        while(offset<end){check();const b=Buffer.alloc(Math.min(65536,end-offset));const n=fs.readSync(fd,b,0,b.length,offset);
            requireValue(n===b.length,'CHANGED_INPUT');offset+=n;yield b;}
        const finalStat=fs.fstatSync(fd);requireValue(finalStat.size===st.size&&finalStat.mtimeMs===st.mtimeMs,'CHANGED_INPUT');
    } catch(e){error=e;throw e;} finally { closeDescriptor(fd,error); }
}
function fingerprint(p,check,maxBytes,range) { return digestChunks(chunks(p,check,maxBytes,range)); }

// Small marker/map JSON only; the legacy manifest uses the member API below.
class UniqueScanner extends Scanner {
    value(depth=0,_fields=null,scalar=false) {
        requireValue(depth<=64,'RESOURCE_LIMIT'); const seen=new Set();
        return super.value(depth,{keys:{has:()=>true},scalarKeys:{has:()=>false},accept:key=>{
            requireValue(!seen.has(key),'DUPLICATE_KEY');seen.add(key);
            requireValue(seen.size<=4096&&Buffer.byteLength(key)<=512,'RESOURCE_LIMIT');
        }},scalar);
    }
}
function jsonFile(p,limit) {
    requireValue(resident(p).size<=limit,'RESOURCE_LIMIT');
    const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    let error;
    try {
        const n=fs.fstatSync(fd).size;requireValue(n<=limit,'RESOURCE_LIMIT');
        const scanner=new UniqueScanner(fd,0,n);scanner.value();scanner.eof();
        const b=Buffer.alloc(n);requireValue(fs.readSync(fd,b,0,n,0)===n,'CHANGED_INPUT');
        const text=new TextDecoder('utf-8',{fatal:true}).decode(b);
        return {value:JSON.parse(text),hash:hash(b)};
    } catch(e){error=e;throw e;} finally { closeDescriptor(fd,error); }
}
function properties(value) {
    requireValue(plain(value)); const keys=Object.keys(value);
    requireValue(keys.length<=conversionLimits.properties,'RESOURCE_LIMIT');
    return keys.map((name,ordinal)=>({name,pointer:pointer(name),ordinal,value:value[name]}));
}
function inline(value) { requireValue(digestChunks(jsonChunks(value)).expectedBytes<=16384,'RESOURCE_LIMIT'); }
function rows(store,owner) {
    const page=store.pageProperties(owner); requireValue(!page.cursor,'RESOURCE_LIMIT'); return page.rows;
}
function assertRows(actual,expected) {
    requireValue(actual.length===expected.length,'CHANGED_DESTINATION');
    for(let i=0;i<actual.length;i++) {
        const a=actual[i],e=expected[i];
        requireValue(a.pointer===e.pointer&&Number(a.ordinal)===e.ordinal,'CHANGED_DESTINATION');
        requireValue(e.ref ? a.value===null&&a.payload_pointer===e.pointer :
            a.payload_pointer===null&&same(JSON.parse(a.value),e.value),'CHANGED_DESTINATION');
    }
}
function setProperties(tx,owner,props,refs=new Map()) {
    for(const p of props)tx.setProperty({owner,pointer:p.pointer,ordinal:p.ordinal,
        ...(p.ref?{payloadRef:refs.get(JSON.stringify([owner,p.pointer]))}:{value:p.value})});
}

async function selectedManifest(sourceRoot,replayId,logFingerprint,scoreFingerprint,check,fault) {
    const p=file(sourceRoot,'manifest.json',conversionLimits.manifest),stamp=resident(p),digest=fingerprint(p,check,conversionLimits.manifest);
    const selected=Object.create(null),seen=Object.fromEntries(['maps','replays','records','scoreRecords'].map(n=>[n,new Set()]));
    const fields=new Set();
    const unchanged=()=>{
        const now=resident(p);
        requireValue(['dev','ino','size','mtimeMs'].every(k=>now[k]===stamp[k])&&same(fingerprint(p,check,conversionLimits.manifest),digest),'CHANGED_INPUT');
    };
    const visit=async sink=>{
        await readFixtureV2Members({synthetic:true,root:sourceRoot,layout:'conversion',
            limits:{inputBytes:conversionLimits.manifest,events:5+4*conversionLimits.records}},e=>{
            check();sink(e);if(e.kind==='member')fault('input-member');
        });
        unchanged();
    };
    // Retain only selected values plus at most eight identity keys per collection.
    // Map selection is a second pass because root collections may occur in any order.
    await visit(e=>{
        if(e.kind==='property'){requireValue(e.name==='version'&&e.value===2);fields.add(e.name);return;}
        requireValue(Object.hasOwn(seen,e.name));
        if(e.kind==='collection'){
            requireValue(e.count>0&&e.count<=conversionLimits.records);fields.add(e.name);return;
        }
        const v=e.value;requireValue(plain(v));
        const k=e.name==='maps'?v.id:e.name==='replays'?v.replayId:recordKey({...v,collection:e.name==='records'?'log':'score'});
        requireValue(typeof k==='string'&&!seen[e.name].has(k),'IDENTITY_CONFLICT');seen[e.name].add(k);
        if(e.name==='replays'&&v.replayId===replayId ||
            e.name==='records'&&v.replayId===replayId&&v.fingerprint===logFingerprint ||
            e.name==='scoreRecords'&&v.replayId===replayId&&v.fingerprint===scoreFingerprint)
            selected[e.name]={value:v,ordinal:e.ordinal};
    });
    requireValue(fields.size===5&&selected.replays&&selected.records&&selected.scoreRecords);
    const replay=selected.replays.value;requireValue(hex(replay.mapId));
    await visit(e=>{if(e.kind==='member'&&e.name==='maps'&&e.value.id===replay.mapId)selected.maps={value:e.value,ordinal:e.ordinal};});
    requireValue(selected.maps);
    return {selected,hash:digest.expectedHash};
}

async function input(options,check,fault) {
    const {sourceRoot,root,replayId,logFingerprint,scoreFingerprint}=options;
    fixtureRoot(sourceRoot,'pain-gain-v2-conversion-fixture-');fixtureRoot(root,'pain-gain-store-v3-fixture-');
    requireValue(id(replayId)&&hex(logFingerprint)&&hex(scoreFingerprint));
    const marker=jsonFile(file(sourceRoot,'.v2-conversion-fixture.json',4096),4096);
    requireValue(same(marker.value,{fixture:'synthetic-v2-conversion',version:1}));
    // Check every pre-existing destination path for residency before SQLite opens.
    let paths=0;
    const inspect=(dir,depth=0)=>{requireValue(depth<=8,'RESOURCE_LIMIT');resident(dir,true);for(const e of fs.readdirSync(dir,{withFileTypes:true})){
        requireValue(++paths<=512,'RESOURCE_LIMIT');
        const p=path.join(dir,e.name);if(e.isDirectory())inspect(p,depth+1);else resident(p);}};
    inspect(root);
    const parsed=await selectedManifest(sourceRoot,replayId,logFingerprint,scoreFingerprint,check,fault);
    const {value:replay,ordinal:replayOrdinal}=parsed.selected.replays;
    requireValue(replay&&hex(replay.mapId)&&hex(replay.buildId)&&replay.status==='active');
    const {value:map,ordinal:mapOrdinal}=parsed.selected.maps;
    requireValue(map&&map.checksum===map.id&&map.status==='validated');
    properties(map).forEach(p=>inline(p.value));properties(replay).forEach(p=>inline(p.value));
    const mapFile=file(sourceRoot,map.file,conversionLimits.map),mapDigest=fingerprint(mapFile,check);
    const mapValue=jsonFile(mapFile,conversionLimits.map).value;
    requireValue(validMap(mapPayload(mapValue))&&mapChecksum(mapValue)===map.id&&mapValue.checksum===map.id,'INVALID_ARTIFACT');
    requireValue(map.path===map.file&&map.hash===mapDigest.expectedHash,'INVALID_ARTIFACT');
    const records=[['log','records',logFingerprint],['score','scoreRecords',scoreFingerprint]].map(([collection,name,fp])=>{
        const {ordinal,value}=parsed.selected[name];
        requireValue(value&&value.status==='claim'&&value.mapId===map.id&&value.buildId===replay.buildId);
        requireValue(!Object.hasOwn(value,'collection')||value.collection===collection);
        requireValue(hex(value.outputFingerprint)&&plain(value.reviews));
        if(Object.hasOwn(value,'mapChecksum'))requireValue(value.mapChecksum===map.id,'IDENTITY_CONFLICT');
        if(Object.hasOwn(value,'mapFile'))requireValue(value.mapFile===map.file,'IDENTITY_CONFLICT');
        if(collection==='score')requireValue(['game-metadata','replay-frames'].includes(value.kind));
        const reviews=Object.entries(value.reviews);requireValue(reviews.length>0&&reviews.length<=conversionLimits.reviews,'RESOURCE_LIMIT');
        for(const [task,v]of reviews){requireValue(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(task)&&plain(v)&&typeof v.claimedAt==='string'&&v.claimedAt.length>0&&v.completedAt===null&&(v.examinedAt===null||typeof v.examinedAt==='string'));properties(v);}
        if(collection==='log')requireValue(Array.isArray(value.otherEntries)&&value.otherEntries.length<=conversionLimits.wrappers);
        else requireValue(!Object.hasOwn(value,'otherEntries'));
        for(const wrapper of value.otherEntries??[]){requireValue(plain(wrapper)&&typeof wrapper.key==='string'&&typeof wrapper.raw==='string');requireValue(digestChunks(jsonChunks(wrapper)).expectedBytes<524288,'RESOURCE_LIMIT');}
        properties(value);
        const output=file(sourceRoot,value.outputPath,conversionLimits.artifact),digest=fingerprint(output,check);
        requireValue(digest.expectedHash===value.outputFingerprint,'INVALID_ARTIFACT');
        const key={collection,replayId,fingerprint:fp};
        return {key,ordinal,value,reviews,output,digest,owner:recordOwner(key)};
    });
    requireValue(new Set([map.file,...records.map(r=>r.value.outputPath)]).size===3,'OWNERSHIP_CONFLICT');
    requireValue(mapDigest.expectedBytes+records.reduce((n,r)=>n+r.digest.expectedBytes,0)<=conversionLimits.totalArtifacts,'RESOURCE_LIMIT');
    const identity={version:1,sourceRoot,manifestHash:parsed.hash,markerHash:marker.hash,replayId,logFingerprint,scoreFingerprint,
        artifacts:[{path:map.file,...mapDigest},...records.map(r=>({path:r.value.outputPath,...r.digest}))]};
    return {map,mapOrdinal,mapFile,mapDigest,replay,replayOrdinal,records,identity};
}

function plan(data,storeId) {
    for(const r of data.records){
        r.operation='fixture-conversion-'+r.key.collection;
        r.pending={replayId:r.key.replayId,fingerprint:r.key.fingerprint,mapId:data.map.id,...(Object.hasOwn(r.value,'buildId')?{buildId:r.value.buildId}:{}),status:'pending'};
        r.payloads=[];
        const convert=(owner,value,record=false)=>properties(value).map(p=>{
            if(record&&p.name==='reviews')return {...p,value:{}}; // Layout marker; actual reviews have distinct owners.
            const role=record&&p.name==='otherEntries'?'diagnostics':'extensions';
            if(role==='diagnostics'||digestChunks(jsonChunks(p.value)).expectedBytes>16384){
                const source=()=>role==='diagnostics'?diagnosticChunks(r.diagnostics?r.diagnostics.entries():p.value):jsonChunks(p.value),digest=digestChunks(source());
                r.payloads.push({owner,pointer:p.pointer,role,source,...digest,
                    path:payloadPath(storeId,owner,p.pointer,role,digest.expectedHash),items:role==='diagnostics'?(r.diagnostics?r.diagnostics.count:p.value.length):null});
                return {...p,ref:true};
            }return p;
        });
        r.props=convert(r.owner,r.value,true);
        r.reviewPlans=r.reviews.map(([task,value],ordinal)=>{const owner={kind:'review',key:JSON.stringify([recordKey(r.key),task])};return{task,ordinal,owner,props:convert(owner,value)};});
        requireValue(r.payloads.length<=conversionLimits.payloads,'RESOURCE_LIMIT');
    }
}
function verifyStructure(store,writer,data,published,multiple=false) {
    for(const collection of multiple?[]:['log','score']){
        const page=store.pageRecords({collection});requireValue(!page.cursor&&page.rows.length===1,'CHANGED_DESTINATION');
    }
    const map=store.getMap(data.map.id),replay=store.getReplay(data.replay.replayId);
    requireValue(map.path===data.map.file&&map.hash===data.mapDigest.expectedHash&&Number(map.ordinal)===data.mapOrdinal&&map.status==='validated','CHANGED_DESTINATION');
    requireValue(replay.map_id===data.map.id&&replay.build_id===(data.replay.buildId??null)&&replay.status==='active'&&Number(replay.ordinal)===data.replayOrdinal,'CHANGED_DESTINATION');
    assertRows(rows(store,{kind:'map',key:data.map.id}),properties(data.map));
    assertRows(rows(store,{kind:'replay',key:data.replay.replayId}),properties(data.replay));
    for(const r of data.records){
        const row=store.getRecord(r.key);requireValue(row.key===recordKey(r.key)&&Number(row.ordinal)===r.ordinal&&row.map_id===data.map.id&&row.build_id===(r.value.buildId??null)&&row.status===(published?(multiple?r.value.status:'claim'):'pending')&&row.output_path===r.value.outputPath&&row.output_hash===r.digest.expectedHash,'CHANGED_DESTINATION');
        // Resolve by the unique record owner on the locked writer connection,
        // not merely by the record's path/hash projections or physical bytes.
        const {output}=writer.readReviewCheckpoint({recordKey:r.key,taskId:r.reviewPlans[0]?.task??'fixture/unclaimed'});
        requireValue(output&&output.collection===r.key.collection&&output.replay_id===r.key.replayId&&
            output.fingerprint===r.key.fingerprint&&output.path===r.value.outputPath&&
            output.hash===r.digest.expectedHash&&output.bytes===r.digest.expectedBytes&&
            (published?output.state==='ready':['pending','ready'].includes(output.state)),'CHANGED_DESTINATION');
        const pending=properties({...r.pending,outputPath:r.value.outputPath,outputFingerprint:r.digest.expectedHash});
        assertRows(rows(store,r.owner),published?r.props:pending);
        const reviews=store.pageReviews(r.key);requireValue(!reviews.cursor&&reviews.rows.length===r.reviewPlans.length,'CHANGED_DESTINATION');
        r.reviewPlans.forEach((v,i)=>{
            const row=reviews.rows[i],facts=writer.readReviewCheckpoint({recordKey:r.key,taskId:v.task});
            const matches=value=>value&&value.collection===r.key.collection&&value.replay_id===r.key.replayId&&
                value.fingerprint===r.key.fingerprint&&value.task===v.task;
            requireValue(row.task===v.task&&Number(row.ordinal)===v.ordinal&&
                same(facts.owner,v.owner)&&matches(facts.review)&&matches(facts.binding)&&
                facts.review.owner_key===v.owner.key&&Number(facts.review.ordinal)===v.ordinal,'CHANGED_DESTINATION');
            // Null is the supported invalidated/overflow projection. A populated
            // projection must agree with the complete original, not just timestamps.
            if(row.value!==null){
                let value;try{value=JSON.parse(row.value);}catch{requireValue(false,'CHANGED_DESTINATION');}
                requireValue(same(value,published?r.reviews[i][1]:{}),'CHANGED_DESTINATION');
            }
            assertRows(rows(store,v.owner),published?v.props:[]);
        });
        for(const owner of [r.owner,...r.reviewPlans.map(v=>v.owner)]){
            const page=store.pagePayloads(owner),expected=r.payloads.filter(p=>same(p.owner,owner));
            requireValue(!page.cursor&&page.rows.length===expected.length,'CHANGED_DESTINATION');
            for(const p of expected){const got=page.rows.find(v=>v.pointer===p.pointer);requireValue(got&&got.path===p.path&&got.hash===p.expectedHash&&Number(got.bytes)===p.expectedBytes&&got.role===p.role&&got.parent===null&&(!published||got.state==='ready'),'CHANGED_DESTINATION');
                if(r.diagnostics)requireValue(got.items===p.items&&Number(got.ordinal)===r.payloads.indexOf(p)+1&&got.encoding===(p.role==='diagnostics'?'jsonl-v1':'json-v1'),'CHANGED_DESTINATION');
                // This planner creates leaves only. Downstream snapshots follow
                // children, so root equality alone cannot certify the closure.
                // Reject the first bounded child page; never traverse corruption.
                const children=store.pagePayloads(owner,p.pointer);
                requireValue(!children.cursor&&children.rows.length===0,'CHANGED_DESTINATION');}
        }
    }
}
function verifyFiles(root,data,check) {
    const artifacts=[{path:data.map.file,...data.mapDigest,source:()=>chunks(data.mapFile,check)},
        ...data.records.flatMap(r=>[{path:r.value.outputPath,...r.digest,source:()=>chunks(r.output,check)},...r.payloads])];
    for(const a of artifacts){
        const target=path.join(root,a.path),got=fingerprint(target,check);
        requireValue(same(got,{expectedBytes:a.expectedBytes,expectedHash:a.expectedHash}),'INVALID_ARTIFACT');
        resident(target);const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
        let error;
        try{let offset=0;for(const original of a.source()){
            check();requireValue(original.length<=65536,'RESOURCE_LIMIT');const copy=Buffer.alloc(original.length);
            requireValue(fs.readSync(fd,copy,0,copy.length,offset)===copy.length&&copy.equals(Buffer.from(original)),'INVALID_ARTIFACT');offset+=copy.length;
        }requireValue(offset===a.expectedBytes,'INVALID_ARTIFACT');}catch(e){error=e;throw e;}finally{closeDescriptor(fd,error);}
    }
    return artifacts.map(a=>({path:a.path,bytes:a.expectedBytes,sha256:a.expectedHash}));
}

export async function convertFixtureV2Slice(options) {
    // Async member consumption must not reread caller-mutated selection/root values.
    requireValue(plain(options),'UNSUPPORTED_FIXTURE');options={...options};
    requireValue(plain(options)&&options.synthetic===true,'UNSUPPORTED_FIXTURE');
    requireValue(Object.keys(options).every(k=>['synthetic','sourceRoot','root','replayId','logFingerprint','scoreFingerprint','fault'].includes(k)));
    const start=performance.now(),check=()=>requireValue(performance.now()-start<conversionLimits.elapsedMs,'RESOURCE_LIMIT');
    const fault=name=>{check();const result=options.fault?.(name);requireValue(!result?.then,'INVALID_FIXTURE');};
    const data=await input(options,check,fault); // Every source identity/hash is checked before destination mutation.
    const store=await openStore({root:options.root,mode:'write',fault:name=>fault('storage:'+name)});let error;
    try {
        plan(data,store.storeId);
        return await store.withWriter(async w=>{
            const rootRows=rows(store,ROOT),saved=rootRows.find(r=>r.pointer===CHECKPOINT);
            if(saved)requireValue(rootRows.length===1&&typeof saved.value==='string'&&saved.payload_pointer===null&&Number(saved.ordinal)===0,'INVALID_CHECKPOINT');
            let state=saved?JSON.parse(saved.value):null;
            if(saved)requireValue(plain(state),'INVALID_CHECKPOINT');
            if(state)requireValue(same(state.identity,data.identity)&&state.storeId===store.storeId&&['prepared','reserved','published','verified'].includes(state.phase),'SOURCE_CONFLICT');
            else requireValue(rootRows.length===0&&Number(store.pageProperties(ROOT).generation)===0,'DESTINATION_NOT_EMPTY');
            const checkpoint=(tx,phase)=>{state={identity:data.identity,storeId:store.storeId,phase};tx.setProperty({owner:ROOT,pointer:CHECKPOINT,ordinal:0,value:state});};
            if(!state){fault('before-prepare');w.transaction(tx=>checkpoint(tx,'prepared'));fault('after-prepare');}
            if(state.phase==='prepared'){
                requireValue(Number(store.pageProperties(ROOT).generation)===1,'CHANGED_DESTINATION');
                requireValue(store.getMap(data.map.id).kind==='missing'&&data.records.every(r=>store.getRecord(r.key).kind==='missing'),'CHANGED_DESTINATION');
                const target=path.join(options.root,data.map.file);fault('before-map');
                if(fs.existsSync(target)){requireValue(same(fingerprint(target,check),data.mapDigest),'INVALID_ARTIFACT');syncDirectory(options.root);}
                else publish(target,readResident(data.mapFile));
                requireValue(same(fingerprint(target,check),data.mapDigest),'INVALID_ARTIFACT');fault('after-map');
                fault('before-reserve');w.transaction(tx=>{
                    tx.insertEntity({kind:'map',key:data.map.id,ordinal:data.mapOrdinal,value:data.map});
                    tx.insertEntity({kind:'replay',key:data.replay.replayId,ordinal:data.replayOrdinal,value:data.replay});
                    for(const r of data.records){
                        tx.insertEntity({kind:'record',key:recordKey(r.key),ordinal:r.ordinal,value:r.pending});
                        for(const v of r.reviewPlans)tx.putReview({recordKey:r.key,taskId:v.task,ordinal:v.ordinal,value:{}});
                        tx.reserveOutput({recordKey:r.key,path:r.value.outputPath,...r.digest});
                        tx.appendIntent({id:r.operation,recordKey:r.key,files:[
                            {ordinal:0,path:r.value.outputPath,hash:r.digest.expectedHash,bytes:r.digest.expectedBytes},
                            ...r.payloads.map((p,i)=>({ordinal:i+1,path:p.path,hash:p.expectedHash,bytes:p.expectedBytes,
                                payload:{owner:p.owner,pointer:p.pointer,role:p.role,items:p.items}}))]});
                    }
                    checkpoint(tx,'reserved');
                });
                fault('after-reserve');
            }
            verifyStructure(store,w,data,['published','verified'].includes(state.phase));
            if(state.phase==='reserved'){
                const refs=new Map();
                for(const r of data.records){
                    fault('before-output-'+r.key.collection);
                    await w.publishOutput({recordKey:r.key,path:r.value.outputPath,source:chunks(r.output,check),...r.digest});
                    fault('after-output-'+r.key.collection);
                    for(const p of r.payloads){
                        fault('before-payload-'+r.key.collection);
                        const ref=await w.publishPayload({...p,source:p.source()});
                        refs.set(JSON.stringify([p.owner,p.pointer]),ref);
                        fault('after-payload-'+r.key.collection);
                    }
                }
                verifyFiles(options.root,data,check);
                requireValue(same((await input(options,check,fault)).identity,data.identity),'CHANGED_INPUT');
                fault('before-publication-checkpoint');
                w.transaction(tx=>{
                    for(const r of data.records){
                        tx.finishPublication({recordKey:r.key,operationId:r.operation});
                        setProperties(tx,r.owner,r.props,refs);
                        for(const v of r.reviewPlans)setProperties(tx,v.owner,v.props,refs);
                    }
                    checkpoint(tx,'published');
                });
                fault('after-publication-checkpoint');
            }
            verifyStructure(store,w,data,true);
            requireValue(store.pageOperations().rows.length===0,'CHANGED_DESTINATION');
            const artifacts=verifyFiles(options.root,data,check);
            // Recheck the committed source identity, including all streamed body hashes.
            requireValue(same((await input(options,check,fault)).identity,data.identity),'CHANGED_INPUT');
            if(state.phase!=='verified'){
                fault('before-verification-checkpoint');
                w.transaction(tx=>checkpoint(tx,'verified'));fault('after-verification-checkpoint');
            }
            return {fixtureOnly:true,phase:state.phase,storeId:store.storeId,identity:data.identity,
                records:data.records.map(r=>({key:r.key,ordinal:r.ordinal,reviews:r.reviewPlans.length,
                    diagnostics:r.value.otherEntries?.length??0})),artifacts,generation:String(store.pageProperties(ROOT).generation)};
        });
    } catch(e){error=e;throw e;} finally {try{store.close();}catch(e){if(error)withCleanup(error,e);else throw e;}}
}

// Shared bounded mechanisms, not a production entry point. Slice defaults and
// permissions above remain unchanged; the multi-member fixture has its own gate.
export const conversionFixtureInternals = Object.freeze({fixtureRoot,file,fingerprint,
    chunks,jsonFile,properties,inline,rows,assertRows,setProperties,plan,verifyStructure,
    verifyFiles,requireValue,same,pointer});

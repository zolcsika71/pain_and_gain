// Production-shaped v2 input, synthetic roots only. No CLI or activation path.
import fs from 'node:fs';
import path from 'node:path';
import {readFixtureV2Members,readFixtureV2DiagnosticMembers,readRehearsalV2DiagnosticMembers,legacyDiagnosticLimits,legacyExpandedDiagnosticLimits,legacyBackupDiagnosticLimits} from './replay-legacy-reader.js';
import {openStore,openRehearsalStore,recordKey,recordOwner} from './replay-store.js';
import {checkRehearsal,rehearsalDetails,verifyRehearsalSource} from './replay-rehearsal-scope.js';
import {conversionFixtureInternals as h} from './replay-conversion-fixture.js';
import {mapPayload,mapChecksum,validMap} from './replay-logs.js';
import {digestChunks,jsonChunks} from './replay-store-payloads.js';
import {resident,readResident,publish,syncDirectory,withCleanup} from './retrieval-files.js';

export const boundedConversionLimits=Object.freeze({inputBytes:16*1048576,memberBytes:1048576,
    members:8,rootProperties:32,artifactBytes:8*1048576,totalArtifactBytes:136*1048576,
    elapsedMs:60000,heapBytes:256*1048576,rssBytes:512*1048576,paths:4096});
const diagnosticLimitKeys=['diagnosticBytes','diagnosticItems','wrapperBytes','scalarBytes'];
export const streamingConversionLimits=Object.freeze({...boundedConversionLimits,
    ...Object.fromEntries(diagnosticLimitKeys.map(k=>[k,legacyDiagnosticLimits[k]]))});
export const expandedStreamingLimits=Object.freeze({...streamingConversionLimits,
    inputBytes:legacyExpandedDiagnosticLimits.inputBytes,diagnosticBytes:legacyExpandedDiagnosticLimits.diagnosticBytes,
    diagnosticItems:legacyExpandedDiagnosticLimits.diagnosticItems,elapsedMs:legacyExpandedDiagnosticLimits.elapsedMs,
    values:legacyExpandedDiagnosticLimits.values,maps:64,replays:64,records:320,scoreRecords:128});
export const backupStreamingLimits=Object.freeze({...expandedStreamingLimits,
    inputBytes:legacyBackupDiagnosticLimits.inputBytes,values:legacyBackupDiagnosticLimits.values,
    totalArtifactBytes:320*1048576});
const ROOT={kind:'root',key:'root'},CP='/boundedFixtureConversionV1';
const collections=['maps','replays','records','scoreRecords','retiredScoreSources'];
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
// Missing identity is not an identity conflict and must never be inferred.
const optionalBuild=v=>!Object.hasOwn(v,'buildId')||hex(v.buildId);
const id=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=h.requireValue;
function optionsCopy(input,allowed){
    need(input&&Object.getPrototypeOf(input)===Object.prototype,'UNSUPPORTED_FIXTURE');
    const out={};for(const [k,d]of Object.entries(Object.getOwnPropertyDescriptors(input))){
        need(allowed.includes(k)&&Object.hasOwn(d,'value'),'UNSUPPORTED_FIXTURE');out[k]=d.value;
    }need(Reflect.ownKeys(input).length===Object.keys(out).length,'UNSUPPORTED_FIXTURE');return out;
}
function supportedValue(v){
    // Reject native JSON cases that would silently lose value/order on re-encoding.
    if(typeof v==='number')need(!Object.is(v,-0)&&(!Number.isInteger(v)||Number.isSafeInteger(v)),'UNSUPPORTED_VALUE');
    if(v&&typeof v==='object')for(const k of Object.keys(v)){
        if(!Array.isArray(v))need(!/^(0|[1-9]\d*)$/.test(k),'UNSUPPORTED_VALUE');supportedValue(v[k]);
    }
}
function inspectDestination(root,limit){
    let count=0;const walk=(p,depth)=>{need(depth<=8,'RESOURCE_LIMIT');resident(p,true);
        for(const e of fs.readdirSync(p,{withFileTypes:true})){need(++count<=limit,'RESOURCE_LIMIT');
            const q=path.join(p,e.name);if(e.isDirectory())walk(q,depth+1);else resident(q);}};walk(root,0);
}

export async function convertFixtureV2Bounded(input){
    return convert(input,false);
}
export async function convertFixtureV2Streaming(input){
    return convert(input,true);
}
export async function convertRehearsalV2(scope,input={}){
    checkRehearsal(scope);const options=optionsCopy(input,['limits','fault']),d=rehearsalDetails(scope);
    return convert({...options,sourceRoot:d.dataRoot,root:d.root,capacity:'backup-sized-synthetic-v1'},true,scope);
}
async function convert(input,streamDiagnostics,rehearsal){
    const o=optionsCopy(input,['synthetic','sourceRoot','root','limits','fault',...(streamDiagnostics?['capacity']:[])]);
    if(rehearsal)checkRehearsal(rehearsal);else need(o.synthetic===true,'UNSUPPORTED_FIXTURE');
    const expanded=o.capacity!==undefined;
    need(!expanded||streamDiagnostics&&['expanded-synthetic-v1','backup-sized-synthetic-v1'].includes(o.capacity),'UNSUPPORTED_FIXTURE');
    const limits={...(o.capacity==='backup-sized-synthetic-v1'?backupStreamingLimits:
        expanded?expandedStreamingLimits:streamDiagnostics?streamingConversionLimits:boundedConversionLimits)},overrides=optionsCopy(o.limits??{},Object.keys(limits));
    if(rehearsal)limits.elapsedMs=rehearsalDetails(rehearsal).deadlineMs;
    for(const [k,v]of Object.entries(overrides)){need(Number.isSafeInteger(v)&&v>0&&v<=limits[k],'RESOURCE_LIMIT');limits[k]=v;}
    need(o.fault===undefined||typeof o.fault==='function','UNSUPPORTED_FIXTURE');
    if(!rehearsal){h.fixtureRoot(o.sourceRoot,'pain-gain-v2-reader-fixture-');h.fixtureRoot(o.root,'pain-gain-store-v3-fixture-');}
    const source=rehearsal?o.sourceRoot:path.join(o.sourceRoot,'replay_logs');resident(source,true);
    need(fs.realpathSync(source)===source,'UNSAFE_PATH');inspectDestination(o.root,limits.paths);
    const start=performance.now(),check=()=>{if(rehearsal)checkRehearsal(rehearsal);const m=process.memoryUsage();need(performance.now()-start<limits.elapsedMs&&m.heapUsed<=limits.heapBytes&&m.rss<=limits.rssBytes,'RESOURCE_LIMIT');};
    const fault=async name=>{check();await o.fault?.(name);check();};
    const manifest=h.file(source,'manifest.json',limits.inputBytes),stamp=resident(manifest);
    const sourceHash=h.fingerprint(manifest,check,limits.inputBytes);
    const marker=rehearsal?rehearsalDetails(rehearsal).receipt:path.join(o.sourceRoot,'.replay-v2-reader-fixture.json');
    const markerHash=h.fingerprint(marker,check,16384);
    const sourceStamp=()=>{check();const now=resident(manifest);need(['dev','ino','size','mtimeMs'].every(k=>now[k]===stamp[k])&&
        h.same(h.fingerprint(marker,check,16384),markerHash),'CHANGED_INPUT');};
    const unchanged=()=>{sourceStamp();need(h.same(h.fingerprint(manifest,check,limits.inputBytes),sourceHash),'CHANGED_INPUT');};
    const reader=rehearsal?(options,sink)=>readRehearsalV2DiagnosticMembers(rehearsal,options.limits,sink):streamDiagnostics?readFixtureV2DiagnosticMembers:readFixtureV2Members;
    const memberCap=name=>expanded&&name!=='retiredScoreSources'?limits[name]:limits.members;
    const eventLimit=limits.rootProperties+collections.reduce((n,k)=>n+memberCap(k),0);
    // Rebuilt from the source committed by sourceHash on every invocation. Keep
    // only bounded event descriptors/digests, never record/diagnostic bodies.
    const sourceMembers=new Map();let visits=0;
    const memberDigest=ref=>h.fingerprint(manifest,check,limits.inputBytes,ref);
    const verifyMember=ref=>{sourceStamp();if(ref.digest)need(h.same(memberDigest(ref),ref.digest),'CHANGED_INPUT');};
    const visit=async sink=>{unchanged();const initial=visits++===0;let count=0;await reader({...(!rehearsal?{synthetic:true}:{}),root:o.sourceRoot,
        ...(expanded?{capacity:o.capacity}:{}),
        limits:{inputBytes:limits.inputBytes,memberBytes:limits.memberBytes,events:eventLimit,
            ...(expanded?{values:limits.values}:{}),
            ...(streamDiagnostics?Object.fromEntries([...diagnosticLimitKeys,'elapsedMs','heapBytes','rssBytes'].map(k=>[k,limits[k]])):{})}},async e=>{
        check();need(++count<=eventLimit,'RESOURCE_LIMIT');
        const key=JSON.stringify([e.kind,e.name,e.ordinal,e.rootOrdinal??null]),shape=JSON.stringify([e.start,e.end,e.count??null]);
        let ref=sourceMembers.get(key);
        if(initial){need(!ref,'CHANGED_INPUT');sourceStamp();ref={start:e.start,end:e.end,shape};
            if(e.kind!=='collection')ref.digest=memberDigest(ref);sourceMembers.set(key,ref);
        }else{need(ref&&ref.shape===shape,'CHANGED_INPUT');verifyMember(ref);}
        supportedValue(e.value);await sink(e,ref);await fault('input-member');verifyMember(ref);
    });need(count===sourceMembers.size,'CHANGED_INPUT');unchanged();};
    const maps=new Map(),replays=new Map(),keys={log:new Set(),score:new Set()},paths=new Set(),rootProps=[];
    const artifacts=[],headers=[];let totalBytes=0,reviewCount=0,retiredCount=0;
    const artifact=(name,cap)=>{need(typeof name==='string'&&name!=='manifest.json'&&!name.startsWith('.'),'UNSAFE_PATH');
        const p=h.file(source,name,cap),digest=h.fingerprint(p,check,cap);
        need(!paths.has(name),'OWNERSHIP_CONFLICT');paths.add(name);
        need(Number.isSafeInteger(digest.expectedBytes)&&digest.expectedBytes>=0&&digest.expectedBytes<=limits.totalArtifactBytes-totalBytes,'RESOURCE_LIMIT');
        totalBytes+=digest.expectedBytes;artifacts.push({path:name,...digest});return {p,digest};};
    // All syntax, shapes, references and source artifacts are validated before store mutation.
    await visit((e,sourceRef)=>{
        if(e.kind==='property'){need(e.name!=='boundedFixtureConversionV1','UNSUPPORTED_VALUE');
            h.inline(e.value);rootProps.push({name:e.name,pointer:h.pointer(e.name),ordinal:e.ordinal,value:e.value});need(rootProps.length+headers.length<=limits.rootProperties,'RESOURCE_LIMIT');return;}
        if(e.kind==='collection'){need(collections.includes(e.name)&&e.count<=memberCap(e.name),'RESOURCE_LIMIT');
            need(e.name!=='retiredScoreSources'||e.count===0,'UNSUPPORTED_STATE');headers.push({name:e.name,ordinal:e.ordinal,count:e.count});need(rootProps.length+headers.length<=limits.rootProperties,'RESOURCE_LIMIT');return;}
        const v=e.value;need(plain(v));h.properties(v);
        if(e.name==='maps'){
            need(hex(v.id)&&v.id===v.checksum&&v.status==='validated'&&!maps.has(v.id),'IDENTITY_CONFLICT');h.inline(v);
            const {p,digest}=artifact(v.file,1048576),map=h.jsonFile(p,1048576).value;
            need(validMap(mapPayload(map))&&mapChecksum(map)===v.id&&map.checksum===v.id,'INVALID_ARTIFACT');
            need((!Object.hasOwn(v,'path')||v.path===v.file)&&(!Object.hasOwn(v,'hash')||v.hash===digest.expectedHash),'INVALID_ARTIFACT');
            maps.set(v.id,{value:v,ordinal:e.ordinal,file:p,digest,sourceRef});
        }else if(e.name==='replays'){
            need(id(v.replayId)&&hex(v.mapId)&&optionalBuild(v)&&v.status==='active'&&!replays.has(v.replayId),'UNSUPPORTED_STATE');h.inline(v);
            // Explicit v2 log-retirement metadata only; never infer history from
            // an absent current record. The existing inline replay cap bounds it.
            if(Object.hasOwn(v,'retiredFingerprints')){
                need(Array.isArray(v.retiredFingerprints)&&v.retiredFingerprints.every(hex),'UNSUPPORTED_STATE');
                need(new Set(v.retiredFingerprints).size===v.retiredFingerprints.length,'IDENTITY_CONFLICT');
                retiredCount+=v.retiredFingerprints.length;
            }
            replays.set(v.replayId,{value:v,ordinal:e.ordinal,sourceRef});
        }else{
            const collection=e.name==='records'?'log':'score',key=recordKey({collection,...v});
            need(!keys[collection].has(key),'IDENTITY_CONFLICT');keys[collection].add(key);
            record(v,collection,e.ordinal,e.diagnostics);reviewCount+=Object.keys(v.reviews).length;artifact(v.outputPath,limits.artifactBytes);
        }
    });
    for(const {value:v}of replays.values()){
        need(maps.has(v.mapId),'INVALID_ASSOCIATION');
        for(const fingerprint of v.retiredFingerprints??[])
            need(!keys.log.has(recordKey({collection:'log',replayId:v.replayId,fingerprint})),'IDENTITY_CONFLICT');
    }
    function record(v,collection,ordinal,diagnostics){
        need(['claim','done','waiting','pending',...(collection==='score'?['retiring']:[])].includes(v.status)&&
            !(collection==='score'&&v.status==='waiting'),'UNSUPPORTED_STATE');
        // Legacy log writers explicitly retain null for unknown provenance.
        // Scores and replay associations keep the omission-or-known-ID contract.
        need(hex(v.mapId)&&(optionalBuild(v)||(collection==='log'&&v.buildId===null))&&hex(v.outputFingerprint)&&plain(v.reviews),'UNSUPPORTED_STATE');
        need(!Object.hasOwn(v,'collection')||v.collection===collection,'IDENTITY_CONFLICT');
        if(collection==='score')need(['game-metadata','replay-frames'].includes(v.kind)&&!Object.hasOwn(v,'otherEntries'),'UNSUPPORTED_STATE');
        else if(streamDiagnostics)need(diagnostics&&v.otherEntries===null&&diagnostics.count<=limits.diagnosticItems,'UNSUPPORTED_STATE');
        else need(Array.isArray(v.otherEntries)&&v.otherEntries.length<=4096,'RESOURCE_LIMIT');
        const reviews=Object.entries(v.reviews);need(reviews.length<=8,'RESOURCE_LIMIT');
        for(const [task,value]of reviews){need(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(task)&&plain(value));h.properties(value);}
        for(const wrapper of diagnostics?diagnostics.entries():v.otherEntries??[]){check();if(diagnostics)supportedValue(wrapper);
            need(plain(wrapper)&&typeof wrapper.key==='string'&&typeof wrapper.raw==='string');need(digestChunks(jsonChunks(wrapper)).expectedBytes<524288,'RESOURCE_LIMIT');}
        const output=h.file(source,v.outputPath,limits.artifactBytes),digest=h.fingerprint(output,check,limits.artifactBytes);
        need(digest.expectedHash===v.outputFingerprint,'INVALID_ARTIFACT');
        const key={collection,replayId:v.replayId,fingerprint:v.fingerprint};
        return {key,ordinal,value:v,reviews,output,digest,owner:recordOwner(key),...(diagnostics?{diagnostics}:{})};
    }
    await visit(e=>{if(e.kind!=='member'||!['records','scoreRecords'].includes(e.name))return;
        const v=e.value,r=replays.get(v.replayId)?.value,m=maps.get(v.mapId)?.value;
        need(r&&m&&r.mapId===v.mapId&&(!hex(r.buildId)||!hex(v.buildId)||r.buildId===v.buildId),'INVALID_ASSOCIATION');
        need((!Object.hasOwn(v,'mapChecksum')||v.mapChecksum===m.id)&&(!Object.hasOwn(v,'mapFile')||v.mapFile===m.file),'INVALID_ASSOCIATION');});
    // Commit the bounded artifact inventory without serializing it into one
    // oversized checkpoint value. Rebuild and compare its ordered digest on resume.
    const identity={version:1,...(rehearsal?{rehearsal:rehearsalDetails(rehearsal).binding}:{}),...(streamDiagnostics?{diagnosticStreaming:1}:{}),sourceRoot:o.sourceRoot,sourceHash,markerHash,stamp:{dev:stamp.dev,ino:stamp.ino,size:stamp.size,mtimeMs:stamp.mtimeMs},
        ...(expanded?{capacity:o.capacity,artifactCommitment:{count:artifacts.length,...digestChunks(jsonChunks(artifacts))}}:{artifacts})};
    h.inline(identity);unchanged();
    const store=rehearsal?await openRehearsalStore(rehearsal,'write'):await openStore({root:o.root,mode:'write'});let error;
    try{return await store.withWriter(async w=>{
        unchanged();const saved=h.rows(store,ROOT).find(p=>p.pointer===CP);let state=saved?JSON.parse(saved.value):null;
        if(state)need(h.same(state.identity,identity)&&state.storeId===store.storeId&&['prepared','verified'].includes(state.phase),'SOURCE_CONFLICT');
        else need(Number(store.pageProperties(ROOT).generation)===0&&h.rows(store,ROOT).length===0,'DESTINATION_NOT_EMPTY');
        const checkpoint=tx=>tx.setProperty({owner:ROOT,pointer:CP,ordinal:1000000,value:state});
        if(!state){state={identity,storeId:store.storeId,phase:'prepared',maps:[],replays:[],records:[],current:null};
            await fault('before-prepare');w.transaction(tx=>{for(const p of rootProps)tx.setProperty({owner:ROOT,...p});
                for(const x of headers)tx.insertEntity({kind:'collection',key:x.name,ordinal:x.ordinal,value:{present:true}});checkpoint(tx);});await fault('after-prepare');}
        const orderedKeys=[...keys.log,...keys.score];
        for(const [field,expected]of [['maps',[...maps.keys()]],['replays',[...replays.keys()]],['records',orderedKeys]])
            need(Array.isArray(state[field])&&h.same(state[field],expected.slice(0,state[field].length))&&state[field].length<=expected.length,'INVALID_CHECKPOINT');
        need(state.current===null||state.current===orderedKeys[state.records.length],'INVALID_CHECKPOINT');
        if(state.phase==='verified')need(state.maps.length===maps.size&&state.replays.length===replays.size&&state.records.length===orderedKeys.length&&!state.current,'INVALID_CHECKPOINT');
        for(const [key,m]of maps){check();const target=path.join(o.root,m.value.file);
            if(!state.maps.includes(key)){
                await fault('before-map');verifyMember(m.sourceRef);if(fs.existsSync(target)){need(h.same(h.fingerprint(target,check),m.digest),'INVALID_ARTIFACT');syncDirectory(o.root);}else publish(target,readResident(m.file));
                need(h.same(h.fingerprint(target,check),m.digest),'INVALID_ARTIFACT');await fault('after-map');verifyMember(m.sourceRef);
                w.transaction(tx=>{tx.insertEntity({kind:'map',key,ordinal:m.ordinal,value:m.value,mapArtifact:{path:m.value.file,hash:m.digest.expectedHash}});state.maps.push(key);checkpoint(tx);});await fault('after-map-checkpoint');
            }
            const row=store.getMap(key);need(row.path===m.value.file&&row.hash===m.digest.expectedHash&&row.status===m.value.status&&Number(row.ordinal)===m.ordinal,'CHANGED_DESTINATION');h.assertRows(h.rows(store,{kind:'map',key}),h.properties(m.value));
            need(h.same(h.fingerprint(target,check),m.digest),'INVALID_ARTIFACT');
        }
        for(const [key,r]of replays){if(!state.replays.includes(key)){verifyMember(r.sourceRef);w.transaction(tx=>{
                tx.insertEntity({kind:'replay',key,ordinal:r.ordinal,value:r.value});
                for(const [ordinal,fingerprint]of (r.value.retiredFingerprints??[]).entries()){
                    check();tx.insertEntity({kind:'retired',key:recordKey({collection:'log',replayId:key,fingerprint}),ordinal,value:{}});
                }
                state.replays.push(key);checkpoint(tx);
            });await fault('after-replay-checkpoint');}
            const row=store.getReplay(key);need(row.map_id===r.value.mapId&&row.build_id===(r.value.buildId??null)&&row.status===r.value.status&&Number(row.ordinal)===r.ordinal,'CHANGED_DESTINATION');
            h.assertRows(h.rows(store,{kind:'replay',key}),h.properties(r.value));
            for(const [ordinal,fingerprint]of (r.value.retiredFingerprints??[]).entries()){
                check();
                const k={collection:'log',replayId:key,fingerprint},owner={kind:'retired',key:recordKey(k)};
                const facts=w.readReviewCheckpoint({recordKey:k,taskId:'fixture/history-check'}),retired=facts.retired;
                need(!facts.current&&retired&&retired.collection==='log'&&retired.replay_id===key&&retired.fingerprint===fingerprint&&retired.key===owner.key&&Number(retired.ordinal)===ordinal,'CHANGED_DESTINATION');
                h.assertRows(h.rows(store,owner),[]);
                need(!facts.retiredPayload,'CHANGED_DESTINATION');
            }
        }
        // Collection-ordered passes avoid retaining a record array even if root order differs.
        for(const collection of ['log','score'])await visit(async (e,sourceRef)=>{
            if(e.kind!=='member'||e.name!==(collection==='log'?'records':'scoreRecords'))return;
            const r=record(e.value,collection,e.ordinal,e.diagnostics),key=recordKey(r.key),map=maps.get(r.value.mapId),replay=replays.get(r.key.replayId);
            const data={map:map.value,mapOrdinal:map.ordinal,mapFile:map.file,mapDigest:map.digest,replay:replay.value,replayOrdinal:replay.ordinal,records:[r]};
            h.plan(data,store.storeId);r.operation='bounded-conversion-'+collection+'-'+r.key.fingerprint;
            if(!state.records.includes(key)){
                need(state.phase!=='verified','INVALID_CHECKPOINT');
                if(!state.current){await fault('before-reserve');verifyMember(sourceRef);w.transaction(tx=>{
                    tx.insertEntity({kind:'record',key,ordinal:r.ordinal,value:r.pending});
                    for(const v of r.reviewPlans)tx.putReview({recordKey:r.key,taskId:v.task,ordinal:v.ordinal,value:{}});
                    tx.reserveOutput({recordKey:r.key,path:r.value.outputPath,...r.digest});
                    tx.appendIntent({id:r.operation,recordKey:r.key,files:[{ordinal:0,path:r.value.outputPath,hash:r.digest.expectedHash,bytes:r.digest.expectedBytes},...r.payloads.map((p,i)=>({ordinal:i+1,path:p.path,hash:p.expectedHash,bytes:p.expectedBytes,payload:{owner:p.owner,pointer:p.pointer,role:p.role,items:p.items}}))]});
                    state.current=key;checkpoint(tx);});await fault('after-reserve');}
                need(state.current===key,'INVALID_CHECKPOINT');
                // Shared reservation validator needs a task key even for empty reviews.
                h.verifyStructure(store,w,data,false,true);
                await w.publishOutput({recordKey:r.key,path:r.value.outputPath,source:h.chunks(r.output,check),...r.digest});await fault('after-output');
                const refs=new Map();for(const p of r.payloads){const ref=await w.publishPayload({...p,source:p.source()});refs.set(JSON.stringify([p.owner,p.pointer]),ref);await fault('after-payload');}
                h.verifyFiles(o.root,data,check);await fault('before-record-checkpoint');verifyMember(sourceRef);
                w.transaction(tx=>{tx.finishPublication({recordKey:r.key,operationId:r.operation});
                    if(r.value.status!=='claim')tx.setStatus({recordKey:r.key,status:r.value.status});
                    h.setProperties(tx,r.owner,r.props,refs);for(const v of r.reviewPlans)h.setProperties(tx,v.owner,v.props,refs);
                    state.records.push(key);state.current=null;checkpoint(tx);});await fault('after-record-checkpoint');
            }
            h.verifyStructure(store,w,data,true,true);h.verifyFiles(o.root,data,check);
        });
        need(state.records.length===orderedKeys.length&&!state.current&&store.pageOperations().rows.length===0,'INVALID_CHECKPOINT');
        for(const c of ['log','score']){
            let count=0,after=null;
            do{check();const page=store.pageRecords({collection:c,after});count+=page.rows.length;
                need(count<=keys[c].size&&page.rows.every(row=>keys[c].has(row.key)),'CHANGED_DESTINATION');
                after=page.cursor;
            }while(after);
            need(count===keys[c].size,'CHANGED_DESTINATION');
        }
        const rootRows=h.rows(store,ROOT);need(rootRows.length===rootProps.length+1,'CHANGED_DESTINATION');
        for(const p of rootProps){const actual=rootRows.find(x=>x.pointer===p.pointer);need(actual,'CHANGED_DESTINATION');h.assertRows([actual],[p]);}
        for(const x of headers){const c=store.getCollection(x.name);need(c.present===1&&Number(c.ordinal)===x.ordinal,'CHANGED_DESTINATION');h.assertRows(h.rows(store,{kind:'collection',key:x.name}),h.properties({present:true}));}
        need(h.same(store.entityCounts(),{collections:headers.length,maps:maps.size,replays:replays.size,records:orderedKeys.length,reviews:reviewCount,retired:retiredCount}),'CHANGED_DESTINATION');
        const finalSource=()=>{unchanged();if(rehearsal)verifyRehearsalSource(rehearsal);for(const a of artifacts)need(h.same(h.fingerprint(h.file(source,a.path,limits.artifactBytes),check),{expectedBytes:a.expectedBytes,expectedHash:a.expectedHash}),'CHANGED_INPUT');};
        finalSource();if(state.phase!=='verified'){await fault('before-verified');finalSource();w.transaction(tx=>{state.phase='verified';checkpoint(tx);});await fault('after-verified');finalSource();}
        return {...(rehearsal?{backupRehearsal:true,productionAuthority:false}:{fixtureOnly:true}),phase:state.phase,storeId:store.storeId,identity,counts:Object.fromEntries(headers.map(h=>[h.name,h.count])),limits,generation:String(store.pageProperties(ROOT).generation)};
    });}catch(e){error=e;throw e;}finally{try{store.close();}catch(e){if(error)withCleanup(error,e);else throw e;}}
}

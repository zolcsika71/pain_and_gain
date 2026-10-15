// Generated inputs only. The selected-authority controls below are test state,
// not operator approvals or qualification of any real source/release.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fixture,cacheFrame,log,frames,replayId,buildId} from '../fixtures/replay-import-command-fixture.js';
import {database,logical,hashFiles} from '../fixtures/replay-log-review-command-fixture.js';
import {parseCacheEntry,parseScoreCacheEntry,logImportRecord,scoreImportRecord,mapChecksum,mapPayload,canonical,sha256} from '../../tools/replay-logs.js';
import {convertFixtureV2Streaming} from '../../tools/replay-conversion-bounded-fixture.js';
import {importSyntheticCache as admit} from '../../tools/replay-import-command-fixture.js';
import {scanSyntheticCache} from '../../tools/replay-scan-command-fixture.js';
import {productionSelection,productionLease,validateProductionImportBudget} from '../../tools/replay-production-scope.js';
import {recordKey,openStore,recoverySchemaHash,withProductionLock} from '../../tools/replay-store.js';
import {validationFrames} from '../fixtures/replay-score-validation-fixture.js';

const PROFILE={profile:'converted-corpus-v1',logs:320,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128};
function dir(t,prefix){const p=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),prefix));t.diagnostic(JSON.stringify({root:p,generated:true,retained:true}));return p;}
function control(file,value){const bytes=JSON.stringify(value)+'\n';fs.writeFileSync(file,bytes);return sha256(bytes);}
function copy(source,destination){fs.mkdirSync(destination,{recursive:true});for(const e of fs.readdirSync(source,{withFileTypes:true})){if(e.name==='.storage-v3-fixture')continue;assert(!e.isSymbolicLink());const a=path.join(source,e.name),b=path.join(destination,e.name);if(e.isDirectory())copy(a,b);else fs.copyFileSync(a,b);}}
async function converted(t,{logs=1,scores=1,production=false,budget=PROFILE,modify,scoreFrames=frames}={}){
    const f=await fixture(t),source=dir(t,'pain-gain-v2-reader-fixture-'),archive=dir(t,'pain-gain-cache-archive-fixture-');
    control(path.join(source,'.replay-v2-reader-fixture.json'),{fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'});
    const data=path.join(source,'replay_logs');fs.mkdirSync(data);
    const map=parseCacheEntry(cacheFrame(log())).map,id=mapChecksum(map),name='pain_and_gain_map_2026-10-14T00-00-00-000Z.json',now='2026-10-14T00:00:00.000Z';
    const registration={id,checksum:id,file:name,status:'validated',registeredAt:now};fs.writeFileSync(path.join(data,name),canonical({...mapPayload(map),checksum:id})+'\n');
    const manifest={version:2,maps:[registration],replays:[{replayId,mapId:id,buildId,status:'active',associatedAt:now,retiredFingerprints:[]}],records:[],scoreRecords:[],retiredScoreSources:[],unknown:{order:[null,false,2]}},queries={};
    for(const [collection,count]of [['log',logs],['score',scores]])for(let i=0;i<count;i++){
        const bytes=cacheFrame(collection==='log'?log({tick:i+1,map:i===0}):scoreFrames(),{collection,time:i+1}),parsed=(collection==='log'?parseCacheEntry:parseScoreCacheEntry)(bytes);
        const basename=collection+'-'+i,sourceEntry=path.join(i===0?f.sourceRoot:archive,basename);fs.writeFileSync(sourceEntry,bytes);
        const output=collection==='log'?`${replayId}-${parsed.fingerprint}.jsonl`:`replay-score-source-${replayId}-${parsed.fingerprint}.response`;
        const record=collection==='log'?logImportRecord(parsed,sourceEntry,output,registration,now):scoreImportRecord(parsed,sourceEntry,output,id,now);
        record.status='claim';record.unknown={order:[i,false,null]};record.reviews={'original/owner':{claimedAt:now,examinedAt:null,completedAt:null,extra:{order:[3,1]}}};
        fs.writeFileSync(path.join(data,output),collection==='log'?parsed.gameState.join('\n')+'\n':parsed.body);
        manifest[collection==='log'?'records':'scoreRecords'].push(record);if(i===0)queries[collection]={synthetic:true,root:f.root,collection,sourceRoot:f.sourceRoot,sourceFile:basename};
    }
    modify?.(manifest);control(path.join(data,'manifest.json'),manifest);
    await convertFixtureV2Streaming({synthetic:true,sourceRoot:source,root:f.root,capacity:'expanded-synthetic-v1'});
    let projectRoot,root=f.root;
    if(production){
        projectRoot=dir(t,'pain-gain-import-production-fixture-');root=path.join(projectRoot,'replay_logs');copy(f.root,root);
        const selectedBudget=typeof budget==='function'?budget(root):budget;
        const proof={testOnly:'Generated authority state; no production approval',cacheRoots:[f.sourceRoot],...(selectedBudget===undefined?{}:{importBudget:selectedBudget})},proofHash=control(path.join(root,'.production-proof.json'),proof),releaseHash='a'.repeat(64);
        const descriptor=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));descriptor.production={scope:'production-authority-v1',projectRoot,mode:'read-write',epoch:0,proofHash,releaseHash,schemaHash:recoverySchemaHash()};control(path.join(root,'manifest.json'),descriptor);
        database(root,db=>db.prepare('UPDATE store_meta SET receipt=?').run(JSON.stringify({productionProofHash:proofHash,releaseHash})));
        control(path.join(root,'.production-state.json'),{phase:'active',projectRoot,storeId:descriptor.storeId,descriptorHash:sha256(fs.readFileSync(path.join(root,'manifest.json'))),proofHash,releaseHash});
        for(const q of Object.values(queries)){delete q.synthetic;q.production=true;q.root=root;}
    }
    const invoke=fn=>production?withProductionLock(projectRoot,()=>productionLease(productionSelection(projectRoot),fn)):fn();
    return{...f,root,source,archive,manifest,queries,projectRoot,invoke,admit:q=>invoke(()=>admit(q)),scan:()=>invoke(()=>scanSyntheticCache({...production?{production:true}:{synthetic:true},root,sourceRoot:f.sourceRoot}))};
}
async function unchanged(f,fn){const rows=logical(f.root),files=hashFiles(f.root);const value=await fn();assert.deepEqual(logical(f.root),rows);assert.deepEqual(hashFiles(f.root),files);return value;}
const query=(f,name,value,options)=>{const q=f.write(name,value,options);if(f.projectRoot){delete q.synthetic;q.production=true;q.root=f.root;}return q;};
for(const bytes of [16384,16385,65536,69624])test('converted validation '+bytes+' reimport is an exact generation-neutral no-op',async t=>{
    const f=await converted(t,{scoreFrames:()=>validationFrames(bytes)}),expected=f.manifest.scoreRecords[0];
    for(let i=0;i<2;i++)assert.deepEqual((await unchanged(f,()=>f.admit(f.queries.score))).record,expected);
});
async function rejectUnchanged(f,fn,code){await unchanged(f,()=>assert.rejects(fn,code?{code}:undefined));}
async function rootFields(f,count){await f.invoke(async()=>{const s=await openStore({root:f.root,mode:'write'});try{await s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<count;i++)tx.setProperty({owner:{kind:'root',key:'root'},pointer:'/unrelated-'+i,ordinal:10+i,value:{retained:i}});}));}finally{s.close();}});}

for(const collection of ['log','score'])test('converted '+collection+' reimport verifies without a historical commitment or mutation',async t=>{
    const f=await converted(t),expected=f.manifest[collection==='log'?'records':'scoreRecords'][0];
    const result=await unchanged(f,()=>f.admit(f.queries[collection]));assert.equal(result.kind,'deduplicated');assert.deepEqual(result.record,expected);assert.deepEqual(Object.keys(result.record),Object.keys(expected));
});
test('descriptor-bound import budget admits a new log beyond 64 corpus records',async t=>{
    const f=await converted(t,{logs:65,scores:1,production:true}),q=f.write('new-log',log({tick:300,map:false}),{time:300});delete q.synthetic;q.production=true;q.root=f.root;
    const result=await f.admit(q);assert.equal(result.kind,'imported');assert.equal(logical(f.root).records.length,67);
});
test('291-log 95-score corpus supports paginated new imports and unchanged converted scan',async t=>{
    const f=await converted(t,{logs:291,scores:95,production:true});await rootFields(f,130);
    for(const collection of ['log','score'])await unchanged(f,()=>f.admit(f.queries[collection]));
    const original=logical(f.root),a=query(f,'arrival-log',log({tick:400,map:false}),{time:400}),b=query(f,'arrival-score',frames(),{collection:'score',time:400});
    const importedLog=await f.admit(a),importedScore=await f.admit(b);assert.equal(importedLog.kind,'imported');assert.equal(importedScore.kind,'imported');
    const after=logical(f.root);assert.equal(after.records.filter(r=>r.collection==='log').length,292);assert.equal(after.records.filter(r=>r.collection==='score').length,96);assert.deepEqual(after.reviews,original.reviews);
    for(const row of original.records)assert.deepEqual(after.records.find(r=>r.key===row.key),row);
    for(const row of original.properties)assert.deepEqual(after.properties.find(r=>r.owner_kind===row.owner_kind&&r.owner_key===row.owner_key&&r.pointer===row.pointer),row);
    for(const q of [a,b])await unchanged(f,()=>f.admit(q));
    // Scan is log-only. Keep generated score transports outside its explicit directory.
    for(const name of ['score-0','arrival-score'])fs.renameSync(path.join(f.sourceRoot,name),path.join(f.archive,name+'.scan-excluded'));
    const result=await unchanged(f,()=>f.scan());assert.equal(result.complete,true);assert.equal(result.events.length,2);assert(result.events.every(e=>e.event==='deduplicated'));
    t.diagnostic(JSON.stringify({generatedCounts:{logs:291,scores:95},after:{logs:292,scores:96},manifestBytes:fs.statSync(path.join(f.source,'replay_logs/manifest.json')).size,rootProperties:after.properties.filter(p=>p.owner_kind==='root').length}));
});
for(const defect of ['source-key','coverage','build','output-owner','output-hash','output-length','output-readiness','output-bytes','diagnostic-hash','diagnostic-bytes','diagnostic-child','review-owner','review-value','conversion-membership'])test('converted corruption '+defect+' rejects without mutation',async t=>{
    const f=await converted(t),record=f.manifest.records[0],key=recordKey({collection:'log',replayId,fingerprint:record.fingerprint});
    if(defect==='output-bytes')fs.appendFileSync(path.join(f.root,record.outputPath),'changed');
    else database(f.root,db=>{
        const property=(name,value)=>db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND owner_key=? AND pointer=?").run(JSON.stringify(value),key,'/'+name);
        if(defect==='source-key')property('sourceKey','1/0/https://arena.screeps.com/api/game/'+replayId+'/log/999');
        if(defect==='coverage')property('coverage',{});if(defect==='build')property('buildId','invalid');
        if(defect==='output-owner'){db.exec('PRAGMA foreign_keys=OFF');db.prepare("UPDATE outputs SET fingerprint=? WHERE fingerprint=?").run('f'.repeat(64),record.fingerprint);}
        if(defect==='output-hash')db.prepare('UPDATE outputs SET hash=? WHERE fingerprint=?').run('f'.repeat(64),record.fingerprint);
        if(defect==='output-length')db.prepare('UPDATE outputs SET bytes=bytes+1 WHERE fingerprint=?').run(record.fingerprint);
        if(defect==='output-readiness')db.prepare("UPDATE outputs SET state='pending' WHERE fingerprint=?").run(record.fingerprint);
        if(defect.startsWith('diagnostic')){const p=db.prepare('SELECT * FROM payloads WHERE owner_key=?').get(key);
            if(defect==='diagnostic-hash')db.prepare('UPDATE payloads SET hash=? WHERE owner_key=?').run('f'.repeat(64),key);
            if(defect==='diagnostic-bytes')fs.appendFileSync(path.join(f.root,p.path),'changed');
            if(defect==='diagnostic-child')db.prepare('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(p.owner_kind,p.owner_key,p.pointer+'/unexpected',p.pointer,p.role,p.path+'.missing',p.hash,1,null,'ready',8,p.encoding);
        }
        if(defect==='review-owner')db.prepare("UPDATE reviews SET owner_key='wrong' WHERE collection='log' AND fingerprint=?").run(record.fingerprint);
        if(defect==='review-value')db.prepare("UPDATE reviews SET value=? WHERE collection='log' AND fingerprint=?").run(JSON.stringify({claimedAt:'forged'}),record.fingerprint);
        if(defect==='conversion-membership'){const p=db.prepare("SELECT value FROM properties WHERE pointer='/boundedFixtureConversionV1'").get(),v=JSON.parse(p.value);v.records=v.records.filter(k=>k!==key);db.prepare("UPDATE properties SET value=? WHERE pointer='/boundedFixtureConversionV1'").run(JSON.stringify(v));}
    });await rejectUnchanged(f,()=>f.admit(f.queries.log));
});
for(const variant of ['omitted','null'])test('converted '+variant+' metadata remains original on repeat',async t=>{
    const f=await converted(t,{modify:m=>{if(variant==='omitted')delete m.records[0].buildId;else m.records[0].buildId=null;}}),collection='log';
    const expected=f.manifest[collection==='log'?'records':'scoreRecords'][0],r=await unchanged(f,()=>f.admit(f.queries[collection]));assert.deepEqual(r.record,expected);await unchanged(f,()=>f.admit(f.queries[collection]));
});
test('map-independent conversion remains outside the existing conversion contract',async t=>{
    await assert.rejects(converted(t,{modify:m=>{m.scoreRecords[0].mapId=null;}}),{code:'UNSUPPORTED_STATE'});
});
test('converted score cannot be reinterpreted as association-free',async t=>{
    const f=await converted(t),key=recordKey({collection:'score',replayId,fingerprint:f.manifest.scoreRecords[0].fingerprint});
    database(f.root,db=>{db.prepare("UPDATE records SET map_id=NULL,build_id=NULL WHERE key=?").run(key);db.prepare("UPDATE properties SET value='null' WHERE owner_kind='record' AND owner_key=? AND pointer='/mapId'").run(key);});
    await rejectUnchanged(f,()=>f.admit(f.queries.score),'INVALID_ASSOCIATION');
});
test('incomplete conversion fences new imports without a checkpoint mutation',async t=>{
    const f=await converted(t);database(f.root,db=>{const p=db.prepare("SELECT value FROM properties WHERE pointer='/boundedFixtureConversionV1'").get(),v=JSON.parse(p.value);v.phase='reserved';db.prepare("UPDATE properties SET value=? WHERE pointer='/boundedFixtureConversionV1'").run(JSON.stringify(v));});
    await rejectUnchanged(f,()=>f.admit(query(f,'new',log({tick:5,map:false}),{time:5})),'NOT_READY');
    await rejectUnchanged(f,()=>f.scan(),'NOT_READY');
});
test('new checkpoint bytes are reserved before mutation',async t=>{
    const f=await converted(t,{production:true,budget:root=>{let bytes=0;database(root,db=>{for(const r of db.prepare("SELECT pointer,ordinal,value,payload_pointer FROM properties WHERE owner_kind='root' AND owner_key='root'").all())bytes+=Buffer.byteLength(JSON.stringify(r));});return{...PROFILE,rootBytes:bytes+64};}});
    await rejectUnchanged(f,()=>f.admit(query(f,'new',log({tick:5,map:false}),{time:5})),'RESOURCE_LIMIT');
});
test('changed requested source identity and score transport reject against converted provenance',async t=>{
    const f=await converted(t),q=f.queries.log;fs.writeFileSync(path.join(q.sourceRoot,q.sourceFile),cacheFrame(log(),{time:9}));await rejectUnchanged(f,()=>f.admit(q),'IDENTITY_CONFLICT');
    const score=f.queries.score,b=fs.readFileSync(path.join(score.sourceRoot,score.sourceFile));b[16]^=1;fs.writeFileSync(path.join(score.sourceRoot,score.sourceFile),b);await rejectUnchanged(f,()=>f.admit(score),'IDENTITY_CONFLICT');
});
test('duplicate and concurrent new imports preserve original reviews and append once',async t=>{
    const f=await converted(t,{production:true}),q=query(f,'concurrent',log({tick:5,map:false}),{time:5}),before=logical(f.root);
    const duplicates=await unchanged(f,()=>Promise.all([f.admit(f.queries.log),f.admit(f.queries.log)]));assert(duplicates.every(r=>r.kind==='deduplicated'));
    const results=await Promise.all([f.admit(q),f.admit(q)]);assert.deepEqual(results.map(r=>r.kind).sort(),['deduplicated','imported']);const after=logical(f.root);assert.equal(after.records.length,before.records.length+1);assert.deepEqual(after.reviews,before.reviews);
});
test('pending import after a root page recovers exactly and scan sees its changed source',async t=>{
    const f=await converted(t,{scores:0,production:true});await rootFields(f,130);const q=query(f,'pending',log({tick:5,map:false}),{time:5}),link=fs.linkSync;let hit=false;
    fs.linkSync=(a,b)=>{link(a,b);if(!hit&&String(b).endsWith('.jsonl')&&!String(b).includes('/diagnostics/')){hit=true;throw Object.assign(Error('generated interruption'),{code:'EIO'});}};
    try{await assert.rejects(f.admit(q),{code:'EIO'});}finally{fs.linkSync=link;}assert(hit);
    const file=path.join(q.sourceRoot,q.sourceFile),original=fs.readFileSync(file);fs.writeFileSync(file,cacheFrame(log({tick:6,map:false}),{time:5}));await rejectUnchanged(f,()=>f.scan(),'CHANGED_INPUT');
    fs.writeFileSync(file,original);const r=await f.scan();assert.equal(r.complete,true);assert.equal(r.recovered,true);await unchanged(f,()=>f.admit(q));
});
test('prepared recovery rechecks capacity after another writer consumes the last slot',async t=>{
    const f=await converted(t,{production:true,budget:{...PROFILE,logs:2}}),q=query(f,'prepared',log({tick:5,map:false}),{time:5}),file=path.join(q.sourceRoot,q.sourceFile),open=fs.openSync;let reads=0;
    fs.openSync=(p,...args)=>{if(p===file&&++reads===3)throw Object.assign(Error('after checkpoint'),{code:'EIO'});return open(p,...args);};
    try{await assert.rejects(f.admit(q),{code:'EIO'});}finally{fs.openSync=open;}
    const checkpoint=logical(f.root).properties.find(p=>p.pointer.startsWith('/syntheticCacheImportV1/'));assert.equal(JSON.parse(checkpoint.value).phase,'prepared');assert.equal(logical(f.root).records.filter(r=>r.collection==='log').length,1);
    // A separate writer-owned pending insertion consumes capacity. This does
    // not manufacture a historical conversion/import commitment.
    const other=query(f,'other-writer',log({tick:6,map:false}),{time:6}),parsed=parseCacheEntry(fs.readFileSync(path.join(other.sourceRoot,other.sourceFile))),value=logImportRecord(parsed,path.join(other.sourceRoot,other.sourceFile),null,f.manifest.maps[0],'generated');value.status='pending';value.outputFingerprint=null;delete value.otherEntries;
    await f.invoke(async()=>{const s=await openStore({root:f.root,mode:'write'});try{await s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'record',key:recordKey({collection:'log',replayId,fingerprint:parsed.fingerprint}),ordinal:1,value})));}finally{s.close();}});
    await rejectUnchanged(f,()=>f.admit(q),'RESOURCE_LIMIT');
});
for(const field of ['logs','scores','rootProperties','rootBytes'])test('reduced descriptor '+field+' budget rejects before publication',async t=>{
    const f=await converted(t,{production:true,budget:{...PROFILE,[field]:field==='rootBytes'?1:field==='rootProperties'?3:1}}),q=query(f,'limit',field==='scores'?frames():log({tick:5,map:false}),{collection:field==='scores'?'score':'log',time:5});
    if(field==='rootProperties')await rootFields(f,3);await rejectUnchanged(f,()=>f.admit(q),'RESOURCE_LIMIT');
});
test('invalid/accessor budgets reject without invoking getters; original defaults remain finite',async t=>{
    let called=0;assert.throws(()=>validateProductionImportBudget({...PROFILE,get logs(){called++;return 320;}}));assert.equal(called,0);
    for(const bad of [{...PROFILE,logs:Infinity},{...PROFILE,logs:321},{...PROFILE,profile:'unknown'},{...PROFILE,unknown:1},{profile:'converted-corpus-v1'},Object.create(PROFILE)])assert.throws(()=>validateProductionImportBudget(bad));
    const value={...PROFILE},snapshot=validateProductionImportBudget(value);value.logs=999;assert.equal(snapshot.logs,320);assert(Object.isFrozen(snapshot));
    const f=await converted(t,{logs:65,scores:0}),q=query(f,'default',log({tick:300,map:false}),{time:300});await rejectUnchanged(f,()=>f.admit(q),'RESOURCE_LIMIT');
});

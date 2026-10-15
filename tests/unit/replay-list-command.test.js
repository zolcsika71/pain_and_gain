// Every mutation/deletion targets a newly generated, retained synthetic root.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fixture,log,frames,replayId,fixedTime} from '../fixtures/replay-import-command-fixture.js';
import {fixture as metadataFixture,database,logical,hashFiles} from '../fixtures/replay-log-review-command-fixture.js';
import {importSyntheticCache as admit} from '../../tools/replay-import-command-fixture.js';
import {listSyntheticLogs as list} from '../../tools/replay-lifecycle-command-fixture.js';
import {openStore,recordKey} from '../../tools/replay-store.js';
import {importCacheFile,reconcileCleanup} from '../../tools/replay-logs.js';
const finished={claimedAt:'synthetic',examinedAt:'synthetic',completedAt:'synthetic',unknown:[false,null,3]};
const q=f=>({synthetic:true,root:f.root});
async function metadata(t,n=2){const f=await metadataFixture(t),s=await openStore({root:f.root,mode:'write'});t.after(()=>s.close());
    await s.withWriter(w=>w.transaction(tx=>{for(const k of f.keys)tx.setProperty({owner:{kind:'record',key:recordKey(k)},pointer:'/otherEntries',ordinal:99,value:[]});
        for(let i=2;i<n;i++){const k={...f.keys[0],fingerprint:i.toString(16).padStart(64,'0')};tx.insertEntity({kind:'record',key:recordKey(k),ordinal:i,value:{...f.records[0],fingerprint:k.fingerprint,otherEntries:[]}});}
    }));return{...f,store:s};}
async function imported(t,status='done'){
    const f=await fixture(t),request=f.write('log_0',log()),r=(await admit(request)).record,k={collection:'log',replayId,fingerprint:r.fingerprint};
    await f.store.withWriter(w=>w.transaction(tx=>{tx.putReview({recordKey:k,taskId:'owner',ordinal:0,value:finished});tx.setStatus({recordKey:k,status});}));return{...f,r,k,request};
}
const report=r=>({replayId:r.replayId,fingerprint:r.fingerprint,outputPath:r.outputPath,mapId:r.mapId,mapFile:r.mapFile,buildId:r.buildId??null,status:r.status,coverage:r.coverage,diagnosticCoverage:r.diagnosticCoverage??null,reviews:r.reviews,otherEntries:r.otherEntries.length});
test('v2 parity: waiting migration, done retirement, shared map, reviews and repeated list',async t=>{
    const f=await fixedTime(()=>imported(t));await fixedTime(()=>importCacheFile(f.v2,path.join(f.sourceRoot,'log_0')));
    const second=f.write('log_1',log({tick:2})),survivor=(await admit(second)).record;await importCacheFile(f.v2,path.join(f.sourceRoot,'log_1'));
    const k={collection:'log',replayId,fingerprint:survivor.fingerprint};await f.store.withWriter(w=>w.transaction(tx=>{tx.setStatus({recordKey:k,status:'waiting'});tx.putReview({recordKey:k,taskId:'owner',ordinal:0,value:{...finished,completedAt:null}});}));
    const file=path.join(f.v2,'replay_logs/manifest.json'),m=JSON.parse(fs.readFileSync(file));for(const r of m.records){r.status=r.fingerprint===f.k.fingerprint?'done':'waiting';r.reviews={owner:{...finished,completedAt:r.status==='done'?'synthetic':null}};}fs.writeFileSync(file,JSON.stringify(m));
    const before=logical(f.root),old=await reconcileCleanup(f.v2),now=await list(q(f));assert.deepEqual(JSON.parse(JSON.stringify(now.records)),old.records.map(report));assert.equal(now.migrated,1);assert.equal(now.retired,1);assert.equal(f.store.entityCounts().maps,1);assert.deepEqual(logical(f.root).maps,before.maps);
    assert.deepEqual(JSON.parse(f.store.pageProperties({kind:'replay',key:replayId}).rows.find(p=>p.pointer==='/retiredFingerprints').value),old.replays[0].retiredFingerprints);
    const stable=logical(f.root);assert.equal((await list(q(f))).migrated,0);assert.deepEqual(logical(f.root),stable);assert.ok(fs.existsSync(path.join(f.root,survivor.outputPath)));
});
test('pagination preserves ordinal order and unrelated metadata, with exact corpus boundary',async t=>{
    const f=await metadata(t,130),before=logical(f.root),result=await list({...q(f),limits:{records:130,pageSize:3}});assert.equal(result.records.length,130);assert.deepEqual(result.records.map(r=>r.fingerprint),before.records.map(r=>r.fingerprint));assert.deepEqual(logical(f.root),before);
    await assert.rejects(list({...q(f),limits:{records:129}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(logical(f.root),before);
});
for(const limits of [{metadataBytes:1},{rows:1},{reviews:1},{sql:1}])test('preflight limit rejects without mutation '+JSON.stringify(limits),async t=>{const f=await metadata(t),before=logical(f.root);await assert.rejects(list({...q(f),limits}),{code:'RESOURCE_LIMIT'});assert.deepEqual(logical(f.root),before);});
for(const limits of [{artifactBytes:1},{files:1}])test('retirement budget rejects before deletion '+JSON.stringify(limits),async t=>{const f=await imported(t),before=logical(f.root),files=hashFiles(f.root);await assert.rejects(list({...q(f),limits}),{code:'RESOURCE_LIMIT'});assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);});
test('empty list is generation neutral',async t=>{const f=await fixture(t),before=logical(f.root);assert.deepEqual((await list(q(f))).records,[]);assert.deepEqual(logical(f.root),before);});
for(const defect of ['owner','inline','unfinished','projection','intent','pending','diagnostic-child'])test('explicit rejection without repair '+defect,async t=>{
    const f=await imported(t);database(f.root,db=>{if(defect==='owner')db.exec("UPDATE reviews SET owner_key='forged'");if(defect==='inline')db.exec("UPDATE reviews SET value='{}'");if(defect==='unfinished')db.exec("UPDATE properties SET value='null' WHERE owner_kind='review' AND pointer='/completedAt'");if(defect==='projection')db.exec("UPDATE properties SET value='\"waiting\"' WHERE owner_kind='record' AND pointer='/status'");if(defect==='intent')db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run('foreign','log',replayId,f.k.fingerprint,'publish',0);if(defect==='pending')db.exec("UPDATE records SET status='pending'");if(defect==='diagnostic-child'){const r=db.prepare('SELECT * FROM payloads LIMIT 1').get();db.prepare('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(r.owner_kind,r.owner_key,'/child',r.pointer,r.role,'child.jsonl',r.hash,r.bytes,r.items,'ready',99,r.encoding);}});
    const before=logical(f.root),files=hashFiles(f.root);await assert.rejects(list(q(f)));assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);
});
test('waiting migration is atomic and preserves status ordinal/unknown metadata',async t=>{
    const f=await metadata(t);await f.store.withWriter(w=>w.transaction(tx=>{for(const k of f.keys)tx.setStatus({recordKey:k,status:'waiting'});}));const before=logical(f.root);
    const s=await openStore({root:f.root,mode:'write',fault:b=>{if(b==='transaction-commit')throw Object.assign(Error('interrupted'),{code:'EIO'});}});try{await assert.rejects(s.withWriter(w=>w.reconcileLogList()),{code:'EIO'});}finally{s.close();}assert.deepEqual(logical(f.root),before);
    assert.equal((await list(q(f))).migrated,2);const after=logical(f.root);assert.deepEqual(after.properties.filter(p=>p.pointer!=='/status'),before.properties.filter(p=>p.pointer!=='/status'));assert.deepEqual(after.properties.filter(p=>p.pointer==='/status').map(p=>p.ordinal),before.properties.filter(p=>p.pointer==='/status').map(p=>p.ordinal));
});
for(const boundary of ['list-waiting-committed','retirement-after-unlink','list-record-retired','list-before-result'])test('interrupted list resumes without duplicate history '+boundary,async t=>{
    const f=await imported(t),s=await openStore({root:f.root,mode:'write',fault:b=>{if(b===boundary)throw Object.assign(Error('retained interruption'),{code:'EIO'});}});
    try{await assert.rejects(s.withWriter(w=>w.reconcileLogList()),{code:'EIO'});}finally{s.close();}const interrupted=logical(f.root);t.diagnostic(JSON.stringify({interrupted:boundary,root:f.root,operations:interrupted.operations,operationFiles:interrupted.operation_files,records:interrupted.records,generation:interrupted.store_meta}));
    await list(q(f));const stable=logical(f.root);await list(q(f));assert.deepEqual(logical(f.root),stable);assert.equal(stable.retired.length,1);
});
test('missing original done log allowed; missing sidecar rejects, live missing file is metadata only',async t=>{
    const a=await imported(t);fs.unlinkSync(path.join(a.root,a.r.outputPath));assert.equal((await list(q(a))).retired,1);
    const b=await imported(t),p=logical(b.root).payloads[0];fs.unlinkSync(path.join(b.root,p.path));const before=logical(b.root);await assert.rejects(list(q(b)),{code:'UNAVAILABLE'});assert.deepEqual(logical(b.root),before);
    const c=await imported(t,'waiting');fs.unlinkSync(path.join(c.root,c.r.outputPath));assert.equal((await list(q(c))).records[0].status,'claim');
});
test('score done sources are untouched by log corpus reconciliation',async t=>{const f=await fixture(t),r=(await admit(f.write('score_0',frames(),{collection:'score',time:2}))).record;const k={collection:'score',replayId,fingerprint:r.fingerprint};await f.store.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:'done'})));const before=logical(f.root),files=hashFiles(f.root);assert.deepEqual((await list(q(f))).records,[]);assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);});
test('concurrent invocations serialize reconciliation and both return complete listings',async t=>{const f=await imported(t);const results=await Promise.all([list(q(f)),list(q(f))]);assert.deepEqual(results.map(r=>r.retired).sort(),[0,1]);assert.ok(results.every(r=>r.records.length===0));assert.equal(f.store.entityCounts().retired,1);});
test('interleaved same-writer mutation rejects stale successful listing',async t=>{const f=await imported(t);await assert.rejects(f.store.withWriter(async w=>{const pending=w.reconcileLogList();w.transaction(tx=>tx.setProperty({owner:{kind:'root',key:'root'},pointer:'/interleaved',ordinal:99,value:true}));return pending;}),{code:'INVALID_STATE'});await list(q(f));});
test('CLI list prints v2-shaped lines; unsupported or incomplete selections stay fenced',async t=>{const f=await metadata(t);const a=spawnSync(process.execPath,['tools/replay-logs.js','--synthetic-sqlite',f.root,'list'],{encoding:'utf8',timeout:30000});assert.equal(a.status,0,a.stderr);assert.deepEqual(a.stdout.trim().split('\n').map(line=>JSON.parse(line)),JSON.parse(JSON.stringify((await list(q(f))).records)));for(const cmd of ['scan','watch','maps','other']){const r=spawnSync(process.execPath,['tools/replay-logs.js','--synthetic-sqlite',f.root,cmd],{encoding:'utf8',timeout:30000});assert.notEqual(r.status,0);}const migrated=spawnSync(process.execPath,['tools/replay-logs.js','--synthetic-sqlite',f.root,'migrate-status'],{encoding:'utf8',timeout:30000});assert.equal(migrated.status,0,migrated.stderr);assert.deepEqual(JSON.parse(migrated.stdout),{migrated:0});});
test('private options reject accessors/inheritance and retain reduced finite limits',async t=>{const f=await metadata(t);let invoked=false;for(const options of [{...q(f),get root(){invoked=true;return f.root;}},{...q(f),limits:{get records(){invoked=true;return 512;}}},Object.create(q(f)),{...q(f),limits:{records:Infinity}},{...q(f),limits:{pageSize:129}}])await assert.rejects(list(options));assert.equal(invoked,false);const limits={records:2},options={...q(f),limits},pending=list(options);limits.records=1;options.root='/invalid';assert.equal((await pending).records.length,2);});
test('cumulative retirement budget is checked before retiring the first record',async t=>{
    const f=await imported(t),r=(await admit(f.write('log_2',log({tick:2})))).record,k={collection:'log',replayId,fingerprint:r.fingerprint};await f.store.withWriter(w=>w.transaction(tx=>{tx.putReview({recordKey:k,taskId:'owner',ordinal:0,value:finished});tx.setStatus({recordKey:k,status:'done'});}));
    const before=logical(f.root),files=hashFiles(f.root);const max=Math.max(...before.outputs.map(r=>r.bytes))+Math.max(...before.payloads.map(r=>r.bytes));await assert.rejects(list({...q(f),limits:{artifactBytes:max}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);
});
test('list preserves EIO with separate ENOSPC cleanup and does not delete',async t=>{
    const f=await imported(t),before=logical(f.root),files=hashFiles(f.root),target=path.join(f.root,f.r.outputPath),open=fs.openSync,read=fs.readSync,close=fs.closeSync;let selected;
    fs.openSync=(p,...args)=>{const fd=open(p,...args);if(p===target)selected=fd;return fd;};fs.readSync=(fd,...args)=>{if(fd===selected)throw Object.assign(Error('read'),{code:'EIO'});return read(fd,...args);};fs.closeSync=fd=>{close(fd);if(fd===selected){selected=undefined;throw Object.assign(Error('close'),{code:'ENOSPC'});}};
    try{await assert.rejects(list(q(f)),e=>e.code==='EIO'&&e.cleanupFailures.some(x=>x.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);
});
test('cooperative deadline rejects at the pre-mutation boundary',async t=>{
    const f=await imported(t),before=logical(f.root),s=await openStore({root:f.root,mode:'write',fault:b=>{if(b==='list-preflight'){const end=performance.now()+25;while(performance.now()<end){/* synthetic bounded delay */}}}});
    try{await assert.rejects(s.withWriter(w=>w.reconcileLogList({limits:{deadlineMs:20}})),{code:'RESOURCE_LIMIT'});}finally{s.close();}assert.deepEqual(logical(f.root),before);
});
test('generation change after preflight rejects before status migration',async t=>{
    const f=await metadata(t);let writer;const s=await openStore({root:f.root,mode:'write',fault:b=>{if(b==='list-preflight')writer.transaction(tx=>tx.setProperty({owner:{kind:'root',key:'root'},pointer:'/concurrent',ordinal:99,value:1}));}});
    try{await assert.rejects(s.withWriter(w=>{writer=w;return w.reconcileLogList();}),{code:'STALE_CURSOR'});}finally{s.close();}
});
test('unsupported review layout cannot silently discard embedded owners',async t=>{const f=await metadata(t);database(f.root,db=>db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND pointer='/reviews'").run(JSON.stringify({lost:{claimedAt:'original'}})));const before=logical(f.root);await assert.rejects(list(q(f)),{code:'UNSUPPORTED_REPRESENTATION'});assert.deepEqual(logical(f.root),before);});
test('committed waiting migration survives interruption without repeated generation changes',async t=>{
    const f=await imported(t,'waiting'),s=await openStore({root:f.root,mode:'write',fault:b=>{if(b==='list-waiting-committed')throw Object.assign(Error('after migration'),{code:'EIO'});}});
    try{await assert.rejects(s.withWriter(w=>w.reconcileLogList()),{code:'EIO'});}finally{s.close();}assert.equal(f.store.getRecord(f.k).status,'claim');const before=logical(f.root);const result=await list(q(f));assert.equal(result.migrated,0);assert.equal(result.records.length,1);assert.deepEqual(logical(f.root),before);
});
test('interrupted multi-record corpus pass resumes remaining ordinal identities exactly once',async t=>{
    const f=await imported(t),r=(await admit(f.write('log_later',log({tick:2})))).record,k={collection:'log',replayId,fingerprint:r.fingerprint};await f.store.withWriter(w=>w.transaction(tx=>{tx.putReview({recordKey:k,taskId:'owner',ordinal:0,value:finished});tx.setStatus({recordKey:k,status:'done'});}));
    const s=await openStore({root:f.root,mode:'write',fault:b=>{if(b==='list-record-retired')throw Object.assign(Error('between records'),{code:'EIO'});}});
    try{await assert.rejects(s.withWriter(w=>w.reconcileLogList()),{code:'EIO'});}finally{s.close();}assert.equal(f.store.entityCounts().retired,1);assert.equal(f.store.getRecord(k).status,'done');t.diagnostic(JSON.stringify({root:f.root,betweenRecords:logical(f.root).retired}));assert.equal((await list(q(f))).retired,1);
    const fingerprints=JSON.parse(f.store.pageProperties({kind:'replay',key:replayId}).rows.find(p=>p.pointer==='/retiredFingerprints').value);assert.deepEqual(fingerprints,[f.k.fingerprint,k.fingerprint]);const before=logical(f.root);await list(q(f));assert.deepEqual(logical(f.root),before);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {spawnSync,fork} from 'node:child_process';
import {completeFixtureScoreReview as complete} from '../../tools/replay-score-review-fixture.js';
import {makeFixture} from '../fixtures/replay-combined-analysis-m2e-store.js';
import {recordKey,openStore} from '../../tools/replay-store.js';
import {openCatalog} from '../../tools/replay-catalog.js';
import {updateFixtureReviewCheckpoint} from '../../tools/replay-review-fixture.js';
import {digestChunks,payloadPath} from '../../tools/replay-store-payloads.js';
import {chunks} from '../fixtures/replay-combined-analysis-m2e-store.js';
import {golden,request,key,owner,logical,database,clock,json,expectedChange,measure,seed,task} from '../fixtures/replay-score-review-m2g-helpers.js';
import {phase} from '../fixtures/replay-review-m2f-process.js';
import {child} from '../fixtures/replay-score-analysis-m2d-process.js';

async function rejected(f,q,code){const before=logical(f.root),m=measure();try{await assert.rejects(complete(q),{code});}finally{m.restore();}assert.deepEqual(logical(f.root),before);assert.equal(m.m.transactions,0);assert.ok(!fs.existsSync(path.join(f.root,'.manifest.lock')));await f.s.withWriter(()=>{});}
async function reviewed(f,q,value={examinedAt:'examined',completedAt:null},ordinal=7){await f.s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:key(q),taskId:q.taskId,ordinal,value})));}
async function fixture(t,schema){const f=await makeFixture(schema);t.after(()=>f.h.close());t.diagnostic('Retained fixture '+f.root);return f;}

for(const schema of [1,2])for(const scenario of golden.scenarios.filter(s=>!s.label.startsWith('scale-')))test(`M2g schema ${schema}: v2 ${scenario.kind}/${scenario.label}`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());t.diagnostic('Retained fixture '+f.root);const q=request(f,scenario.kind,scenario.task);
 await f.s.withWriter(w=>w.transaction(tx=>{for(const [i,[taskId,value]]of Object.entries(scenario.reviews).entries())tx.putReview({recordKey:key(q),taskId,ordinal:7+2*i,value});if(scenario.status!=='claim')tx.setStatus({recordKey:key(q),status:scenario.status});}));
 if(scenario.special){q.fingerprint='f'.repeat(64);if(scenario.special==='retired')await f.s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'retired',key:recordKey(key(q)),ordinal:0})));}
 for(const step of scenario.steps){const before=logical(f.root),restore=clock(step.clock),m=measure();let r;
  const code=scenario.label.startsWith('unsupported-')?'UNSUPPORTED_CHECKPOINT':step.error?(scenario.special==='retired'?'RETIRED_RECORD':scenario.special==='missing'?'MISSING_RECORD':scenario.status!=='claim'?'NOT_READY':!Object.hasOwn(scenario.reviews,q.taskId)?'NOT_CLAIMED':'NOT_EXAMINED'):null;
  try{if(code)await assert.rejects(complete(q),{code});else r=await complete(q);}finally{m.restore();restore();}
  assert.deepEqual(logical(f.root),code?before:expectedChange(before,q,step));
  if(r){assert.deepEqual(r,{collection:'score',replayId:q.replayId,fingerprint:q.fingerprint,taskId:q.taskId,changed:step.changed,completionChanged:step.completionChanged,statusChanged:step.statusChanged,recordStatus:step.recordStatus,reviewOrdinal:step.checkpoints?'7':null,generation:String(BigInt(before.store_meta[0].generation)+(step.changed?1n:0n)),checkpoints:step.checkpoints});assert.equal(m.m.transactions,step.changed?1:0);}
 }
});
test('M2g strict five-field admission',async()=>{
 const q={root:'/invalid',schemaVersion:1,replayId:'b'.repeat(24),fingerprint:'a'.repeat(64),taskId:'a'};
 for(const v of [null,undefined,[],1,new Date()])await assert.rejects(complete(v),{code:'INVALID_ARGUMENT'});
 for(const extra of [{action:'done'},{collection:'score'},{recover:true},{timestamp:'x'},{[Symbol()]:1}])await assert.rejects(complete({...q,...extra}),{code:'UNSUPPORTED_OPTION'});
 for(const name of Object.keys(q)){const missing={...q};delete missing[name];await assert.rejects(complete(missing),{code:'INVALID_ARGUMENT'});const accessor={...q};Object.defineProperty(accessor,name,{get(){assert.fail('getter');}});await assert.rejects(complete(accessor),{code:'INVALID_ARGUMENT'});}
 for(const taskId of ['', '/a',' a','a ', 'é','a'.repeat(201),1])await assert.rejects(complete({...q,taskId}),{code:'INVALID_IDENTITY'});
 for(const schemaVersion of ['1',0,3])await assert.rejects(complete({...q,schemaVersion}),{code:'UNSUPPORTED_STORE'});
});
for(const schema of [1,2])test(`M2g schema ${schema}: exact ordinals, property presence, exhaustion and opaque extensions`,async t=>{
 const f=await fixture(t,schema),q=request(f),o=owner(q),max=9223372036854775807n;
 await reviewed(f,q,{claimedAt:null,examinedAt:'x',note:{zero:0,flag:false}},9007199254740993n);
 await f.s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<140;i++)tx.setProperty({owner:o,pointer:'/extension-'+i,ordinal:9007199254740993n+BigInt(i),value:{i}});tx.setProperty({owner:{kind:'record',key:recordKey(key(q))},pointer:'/unknown-tail',ordinal:9007199254741500n,value:false});}));
 database(f.root,db=>db.prepare("DELETE FROM properties WHERE owner_kind='record' AND owner_key=? AND pointer='/status'").run(recordKey(key(q))));
 const before=logical(f.root),restore=clock('2026-10-06T00:02:00.000Z');let r;try{r=await complete(q);}finally{restore();}
 assert.equal(r.reviewOrdinal,'9007199254740993');assert.deepEqual(logical(f.root),expectedChange(before,q,{changed:true,completionChanged:true,statusChanged:true,checkpoints:{completedAt:{present:true,value:'2026-10-06T00:02:00.000Z'}}}));
 const after=logical(f.root);assert.equal(after.properties.find(p=>p.owner_key===o.key&&p.pointer==='/completedAt').ordinal,'9007199254741133');assert.equal(after.properties.find(p=>p.owner_kind==='record'&&p.owner_key===recordKey(key(q))&&p.pointer==='/status').ordinal,'9007199254741501');
 database(f.root,db=>db.prepare('UPDATE store_meta SET generation=?').run(max));assert.equal((await complete(q)).generation,String(max));
 for(const mode of ['generation','completion-tail','status-tail']){const g=await fixture(t,schema),a=request(g);await reviewed(g,a,{examinedAt:'x',...(mode==='status-tail'?{completedAt:'old'}:{})});if(mode==='generation')database(g.root,db=>db.prepare('UPDATE store_meta SET generation=?').run(max));else{const target=mode==='status-tail'?{kind:'record',key:recordKey(key(a))}:owner(a);await g.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:target,pointer:'/tail',ordinal:max,value:0})));if(mode==='status-tail')database(g.root,db=>db.prepare("DELETE FROM properties WHERE owner_kind='record' AND owner_key=? AND pointer='/status'").run(target.key));}await rejected(g,a,'RESOURCE_LIMIT');}
 const g=await fixture(t,schema),a=request(g);await reviewed(g,a);await g.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:owner(a),pointer:'/completedAt',ordinal:max,value:null})));await complete(a);assert.equal(logical(g.root).properties.find(p=>p.owner_key===owner(a).key&&p.pointer==='/completedAt').ordinal,String(max));
 const b=logical(g.root);await assert.rejects(g.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:key(a),status:'done',propertyOrdinal:0}))),{code:'INVALID_REFERENCE'});assert.deepEqual(logical(g.root),b);
});
for(const schema of [1,2])test(`M2g schema ${schema}: reviewer boundaries, keyset ties and lifetime`,async t=>{
 for(const R of [127,128,129,255,256,999,1000,1001]){const f=await fixture(t,schema);await seed(f,R);const q=request(f,1,task(R-1));
  // Nonselected sparse/tied ordinals above the safe Number range.
  database(f.root,db=>db.prepare('UPDATE reviews SET ordinal=? WHERE collection=? AND replay_id=? AND fingerprint=?').run(9007199254740993n,'score',q.replayId,q.fingerprint));
  if(R===1001){await rejected(f,q,'RESOURCE_LIMIT');await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:key(q),status:'done'})));assert.equal((await complete({...q,taskId:'unowned'})).checkpoints,null);continue;}
  const m=measure();try{assert.equal((await complete(q)).statusChanged,true);}finally{m.restore();}assert.equal(m.m.pages,Math.floor(R/128)+1);assert.equal(m.m.reviewerRows,R);
 }
 const f=await fixture(t,schema);await seed(f,129);const q=request(f),k=key(q);let escaped,cursor;
 await f.s.withWriter(w=>{escaped=w;const a=w.pageScoreReviewCheckpoints({recordKey:k});cursor=a.cursor;assert.equal(a.rows.length,128);a.rows[0].task='changed';assert.notEqual(w.pageScoreReviewCheckpoints({recordKey:k}).rows[0].task,'changed');assert.throws(()=>w.pageScoreReviewCheckpoints({recordKey:k,after:{...cursor}}),{code:'STALE_CURSOR'});assert.throws(()=>w.pageScoreReviewCheckpoints({recordKey:key(request(f,1)),after:cursor}),{code:'STALE_CURSOR'});w.transaction(tx=>tx.setProperty({owner:{kind:'record',key:recordKey(k)},pointer:'/cursor-test',ordinal:200,value:0}));assert.throws(()=>w.pageScoreReviewCheckpoints({recordKey:k,after:cursor}),{code:'STALE_CURSOR'});});
 assert.throws(()=>escaped.readScoreCompletionFacts({recordKey:k,taskId:q.taskId}),{code:'CLOSED'});assert.throws(()=>escaped.pageScoreReviewCheckpoints({recordKey:k}),{code:'CLOSED'});await f.s.withWriter(w=>assert.throws(()=>w.pageScoreReviewCheckpoints({recordKey:k,after:cursor}),{code:'STALE_CURSOR'}));
});
for(const schema of [1,2])test(`M2g schema ${schema}: final-page rejection, terminal restrictions and metadata corruption`,async t=>{
 const f=await fixture(t,schema);await seed(f,129);const q=request(f,0,task(127)),last=owner({...q,taskId:task(128)});
 await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:last,pointer:'/completedAt',ordinal:2,value:{unsupported:true}})));await rejected(f,q,'UNSUPPORTED_CHECKPOINT');
 await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:key(q),status:'done'})));assert.equal((await complete(q)).changed,false);assert.equal((await complete({...q,taskId:'unowned'})).reviewOrdinal,null);await rejected(f,{...q,taskId:task(128)},'UNSUPPORTED_CHECKPOINT');
 const mutations=[
  ["UPDATE reviews SET owner_key='wrong' WHERE task=?",[task(127)],'OWNERSHIP_CONFLICT'],
  ["UPDATE properties SET value='broken' WHERE owner_kind='review' AND owner_key=? AND pointer='/examinedAt'",[owner(q).key],'INVALID_REFERENCE'],
  ["UPDATE outputs SET state='pending' WHERE fingerprint=?",[q.fingerprint],'NOT_READY'],
  ["UPDATE properties SET value='\"wrong\"' WHERE owner_kind='record' AND owner_key=? AND pointer='/fingerprint'",[recordKey(key(q))],'INVALID_REFERENCE'],
  ["INSERT INTO retired VALUES (?,?,?,?,0)",['score',q.replayId,q.fingerprint,recordKey(key(q))],'INVALID_REFERENCE'],
 ];
 for(const [sql,args,code]of mutations){const g=await fixture(t,schema),a=request(g,0,task(127));await reviewed(g,a);database(g.root,db=>db.prepare(sql).run(...args));await rejected(g,a,code);}
 const g=await fixture(t,schema),a=request(g);await reviewed(g,a);await g.s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'selected-intent',recordKey:key(a)})));await rejected(g,a,'NOT_READY');
});
for(const schema of [1,2])test(`M2g schema ${schema}: bounded pages, result admission, payload references and missing artifacts`,async t=>{
 const f=await fixture(t,schema);await seed(f,128);const q=request(f,1,task(0));
 await f.s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<128;i++)for(const [ordinal,n]of ['claimedAt','examinedAt','completedAt'].entries())tx.setProperty({owner:owner({...q,taskId:task(i)}),pointer:'/'+n,ordinal,value:'x'.repeat(10000)});}));
 await assert.rejects(f.s.withWriter(w=>w.pageScoreReviewCheckpoints({recordKey:key(q)})),{code:'RESOURCE_LIMIT'});
 const g=await fixture(t,schema),a=request(g);await reviewed(g,a,{claimedAt:'\0'.repeat(256),examinedAt:'\0'.repeat(256),completedAt:'\0'.repeat(256)});await rejected(g,a,'RESOURCE_LIMIT');
 await reviewed(g,a);const bytes=Buffer.from('{"unknown":true}'),expected=digestChunks(chunks(bytes)),o=owner(a),r=g.data.manifest.scoreRecords[0];let ref;
 await g.s.withWriter(async w=>{w.transaction(tx=>tx.appendIntent({id:'extension',recordKey:key(a),files:[{ordinal:0,path:payloadPath(g.s.storeId,o,'/note','extensions',expected.expectedHash),hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner:o,pointer:'/note',role:'extensions'}},{ordinal:1,path:r.outputPath,hash:r.outputFingerprint,bytes:g.data.files[r.outputPath].length}]}));ref=await w.publishPayload({owner:o,pointer:'/note',role:'extensions',source:chunks(bytes),...expected});await w.publishOutput({recordKey:key(a),path:r.outputPath,source:chunks(g.data.files[r.outputPath]),expectedBytes:g.data.files[r.outputPath].length,expectedHash:r.outputFingerprint});w.transaction(tx=>{tx.setProperty({owner:o,pointer:'/note',ordinal:9007199254740993n,payloadRef:ref});tx.finishPublication({recordKey:key(a),operationId:'extension'});});});
 await g.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:o,pointer:'/claimedAt',ordinal:0,payloadRef:ref})));await rejected(g,a,'UNSUPPORTED_CHECKPOINT');await g.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:o,pointer:'/claimedAt',ordinal:0,value:null})));
 fs.unlinkSync(path.join(g.root,r.outputPath));const before=logical(g.root),m=measure();try{assert.equal((await complete(a)).changed,true);}finally{m.restore();}assert.deepEqual(logical(g.root).payloads,before.payloads);assert.deepEqual(logical(g.root).properties.filter(p=>p.pointer==='/note'),before.properties.filter(p=>p.pointer==='/note'));
 const {analyzeFixtureCombinedReplay}=await import('../../tools/replay-combined-analysis-fixture.js');await assert.rejects(analyzeFixtureCombinedReplay({...g.options,fingerprints:g.options.fingerprints}),{code:'UNAVAILABLE'});
});
for(const schema of [1,2])test(`M2g schema ${schema}: detached input, snapshots and subsequent M2f behavior`,async t=>{
 const f=await fixture(t,schema),q=request(f);await reviewed(f,q);const original={...q};let borrowed;
 await f.s.withReadSnapshot({reviewKeys:[{recordKey:key(q),taskId:q.taskId}],payloadRoles:[]},async view=>{borrowed=view;const rows=view.properties.get(JSON.stringify(owner(q))),ref=view.output(key(q)),artifact=view.artifact(ref),b=Buffer.alloc(10);assert.ok(view.read(artifact,b,0)>0);const pending=complete(q);q.root='/wrong';q.taskId='changed';assert.equal((await pending).taskId,original.taskId);assert.equal(JSON.parse(rows.find(p=>p.pointer==='/completedAt').value),null);assert.ok(view.read(artifact,b,0)>0);});
 assert.throws(()=>borrowed.assertOpen(),{code:'CLOSED'});await f.s.withReadSnapshot({reviewKeys:[{recordKey:key(original),taskId:original.taskId}],payloadRoles:[]},view=>assert.equal(typeof JSON.parse(view.properties.get(JSON.stringify(owner(original))).find(p=>p.pointer==='/completedAt').value),'string'));
 await assert.rejects(updateFixtureReviewCheckpoint({...original,collection:'score',action:'claim'}),{code:'NOT_READY'});assert.equal((await complete({...original,taskId:'unowned'})).checkpoints,null);
});
test('M2g schema 2: populated catalog evidence remains byte-for-byte unchanged',async t=>{
 const f=await fixture(t,2),q=request(f),c=f.h,id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,artifact=f.refs.find(r=>r.key.fingerprint===q.fingerprint).refs[0];await reviewed(f,q);
 await c.withWriter(w=>w.transaction(tx=>{tx.registerIdentity({kind:'task',id:q.taskId,subjectId:id(1)});tx.registerIdentity({kind:'replay',id:q.replayId,subjectId:id(2),unknown:{zero:0,no:false}});tx.registerIdentity({kind:'capture',capture:key(q),subjectId:id(3)});tx.registerIdentity({kind:'artifact',id:id(4),subjectId:id(5),owner:artifact.owner,field:artifact.pointer,format:artifact.encoding,path:artifact.path,hash:artifact.hash,bytes:artifact.bytes});tx.appendEvidenceRef({evidenceRefId:id(8),captureKey:recordKey(key(q)),artifactId:id(4),sourceKey:'synthetic/m2g',ordinal:0});}));
 const before=logical(f.root),ref=c.resolveEvidence(id(8));assert.equal(ref.availability,'not-checked');const m=measure();try{await complete(q);}finally{m.restore();}const after=logical(f.root);for(const n of Object.keys(before).filter(n=>n.startsWith('catalog_')))assert.deepEqual(after[n],before[n]);assert.deepEqual(c.resolveEvidence(id(8)),ref);assert.equal(c.pageReviews(id(3)).rows.length,0);
});
for(const schema of [1,2])test(`M2g schema ${schema}: missing-status no-op, encoded limits and independent collections`,async t=>{
 const f=await fixture(t,schema),q=request(f);await reviewed(f,q,{examinedAt:'x',completedAt:''});database(f.root,db=>db.prepare("DELETE FROM properties WHERE owner_kind='record' AND owner_key=? AND pointer='/status'").run(recordKey(key(q))));const before=logical(f.root);assert.equal((await complete(q)).changed,false);assert.deepEqual(logical(f.root),before);
 for(const value of ['é'.repeat(129),'x'.repeat(257)]){await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:owner(q),pointer:'/claimedAt',ordinal:0,value})));await rejected(f,q,'RESOURCE_LIMIT');}
 // A same-fingerprint log never substitutes for an absent score selection.
 await rejected(f,{...q,fingerprint:f.options.fingerprints[0]},'MISSING_RECORD');
 for(const taskId of ['a','A','a/b._-','x'.repeat(200)]){const g=await fixture(t,schema),a=request(g,0,taskId);await reviewed(g,a);assert.equal((await complete(a)).taskId,taskId);}
});
test('M2g module import keeps legacy CLI/API SQLite-isolated',()=>{
 const moduleUrl=new URL('../../tools/replay-score-review-fixture.js',import.meta.url).href,legacy=new URL('../../tools/replay-logs.js',import.meta.url).href;
 const r=spawnSync(process.execPath,['--no-experimental-sqlite','--input-type=module','-e',`await import(${JSON.stringify(moduleUrl)});await import(${JSON.stringify(legacy)});`],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);
});
for(const schema of [1,2])test(`M2g schema ${schema}: concurrent completion/claim/examined and pre-lock races`,async t=>{
 const events=[];
 function actor(mode,q){const p=fork(new URL('../fixtures/replay-score-review-m2g-racer.js',import.meta.url),[mode,JSON.stringify(q)],{stdio:['ignore','pipe','pipe','ipc']}),messages=[],waiters=[];let stderr='';p.stderr.on('data',b=>{stderr+=b;if(stderr.length>1048576)p.kill('SIGKILL');});p.stdout.resume();p.on('message',m=>{events.push({pid:p.pid,...m});messages.push(m);for(const fn of [...waiters])fn();});const wait=event=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Race latch deadline '+stderr));},15000);const check=()=>{const m=messages.find(m=>m.event===event);if(m){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(m);}};waiters.push(check);check();});const exit=new Promise((resolve,reject)=>p.on('close',(code,signal)=>code===0?resolve():reject(Error(`Race worker ${code}/${signal} ${stderr}`))));return{p,wait,exit};}
 for(const scenario of ['same','different','claim','examined']){const f=await fixture(t,schema),q=request(f);await reviewed(f,q,{examinedAt:scenario==='examined'?null:'x',completedAt:null});if(scenario==='different')await reviewed(f,{...q,taskId:'other'});const before=logical(f.root),hold=actor('hold',q);await hold.wait('held');const a=actor('complete',q),b=actor(['same','different'].includes(scenario)?'complete':scenario,{...q,taskId:['different','claim'].includes(scenario)?'other':q.taskId});await Promise.all([a.wait('waiting'),b.wait('waiting')]);hold.p.send({});const [ar,br]=await Promise.all([a.wait('result'),b.wait('result')]);await Promise.all([hold.exit,a.exit,b.exit]);const aFirst=events.filter(e=>e.event==='acquired'&&[a.p.pid,b.p.pid].includes(e.pid))[0].pid===a.p.pid;
  if(scenario==='same'){assert.ok(!ar.error&&!br.error);assert.equal(Number(ar.value.changed)+Number(br.value.changed),1);}else if(scenario==='different'){assert.ok(ar.value.changed&&br.value.changed);assert.equal(Number(ar.value.statusChanged)+Number(br.value.statusChanged),1);}else if(scenario==='claim'){assert.equal(ar.value.statusChanged,aFirst);assert.equal(br.error?.code,aFirst?'NOT_READY':undefined);}else{assert.equal(ar.error?.code,aFirst?'NOT_EXAMINED':undefined);assert.equal(br.value.changed,true);}
  const successes=[ar,br].filter(r=>r.value?.changed).length;assert.equal(BigInt(logical(f.root).store_meta[0].generation),BigInt(before.store_meta[0].generation)+BigInt(successes));
 }
 for(const [message,code]of [[{intent:true},'NOT_READY'],[{status:'retiring'},'NOT_READY'],[{identity:true},'INVALID_REFERENCE'],[{owner:true},'OWNERSHIP_CONFLICT'],[{output:true},'INVALID_REFERENCE'],[{descriptor:true},'UNSUPPORTED_STORE'],[{root:true},'UNSAFE_PATH'],[{retirement:true},'RETIRED_RECORD']]){const f=await fixture(t,schema),q=request(f);await reviewed(f,q);const hold=actor('hold',q);await hold.wait('held');const a=actor('complete',q);await a.wait('waiting');if(message.retirement){delete message.retirement;message.retire=[...f.refs.find(r=>r.key.collection==='score'&&r.key.fingerprint===q.fingerprint).refs];const r=f.data.manifest.scoreRecords[0];message.retire.push({path:r.outputPath,hash:r.outputFingerprint,bytes:f.data.files[r.outputPath].length});}hold.p.send(message);const result=await a.wait('result');await Promise.all([hold.exit,a.exit]);assert.equal(result.error.code,code);}
 t.diagnostic(json({events}));
});
for(const schema of [1,2])test(`M2g schema ${schema}: fault cleanup precedence including null and committed retry`,async t=>{
 const r=await child(['--experimental-test-module-mocks',new URL('../fixtures/replay-score-review-m2g-faults.js',import.meta.url).pathname,String(schema)],30000);assert.equal(r.result.passed,true);t.diagnostic(json(r.result));
});
for(const schema of [1,2])test(`M2g schema ${schema}: restart before/after commit and cold/hot explicit recovery`,async t=>{
 for(const mode of ['before','after','hot']){const f=await fixture(t,schema),q=request(f);await reviewed(f,q);database(f.root,db=>db.exec('PRAGMA user_version=12345'));const before=logical(f.root);
  const crash=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('../fixtures/replay-score-review-m2g-restart.js',import.meta.url).pathname,mode,JSON.stringify(q)],{encoding:'utf8',timeout:15000});assert.equal(crash.signal,'SIGKILL',crash.stderr);fs.utimesSync(path.join(f.root,'.manifest.lock'),new Date(0),new Date(0));if(mode!=='after')await assert.rejects(complete(q),{code:'RECOVERY_REQUIRED'});
  const recovered=await(schema===1?openStore:openCatalog)({root:f.root,mode:'write',recover:true});recovered.close();const after=logical(f.root);database(f.root,db=>assert.equal(db.prepare('PRAGMA user_version').get().user_version,12345));assert.equal(fs.existsSync(path.join(f.root,JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).database)+'-journal'),false);
  if(mode!=='after')assert.deepEqual(after,before);else{assert.equal(BigInt(after.store_meta[0].generation),BigInt(before.store_meta[0].generation)+1n);assert.equal(after.records.find(r=>r.key===recordKey(key(q))).status,'done');assert.equal(typeof JSON.parse(after.properties.find(p=>p.owner_key===owner(q).key&&p.pointer==='/completedAt').value),'string');}
  const retry=await complete(q);assert.equal(retry.changed,mode!=='after');assert.equal((await complete(q)).changed,false);t.diagnostic(json({mode,root:f.root,signal:crash.signal,retry}));
 }
});
for(const schema of [1,2])for(const R of [1,128,1000])test(`M2g schema ${schema}: R=${R} paired 10/1000 resource gate`,async t=>{
 const roots=[10,1000].map(()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'))),receipts=fs.mkdtempSync(path.join(os.tmpdir(),'pain-gain-m2g-gate-'));
 t.diagnostic(json({schema,R,roots,receipts}));const worker=new URL('../fixtures/replay-score-review-m2g-worker.js',import.meta.url).pathname;
 for(const [name,deadline]of [['generate',60000],['operations',30000],['preservation',60000]])t.diagnostic(json(await phase(['--max-old-space-size=192',worker,name,String(schema),String(R),receipts,...roots],deadline,receipts,name==='generate'?'generation':name)));
});

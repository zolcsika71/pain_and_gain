import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {fork,spawnSync} from 'node:child_process';
import {updateFixtureReviewCheckpoint as update} from '../../tools/replay-review-fixture.js';
import {makeFixture} from '../fixtures/replay-combined-analysis-m2e-store.js';
import {recordKey} from '../../tools/replay-store.js';
import {openStore} from '../../tools/replay-store.js';
import {openCatalog} from '../../tools/replay-catalog.js';
import {payloadPath,digestChunks} from '../../tools/replay-store-payloads.js';
import {chunks} from '../fixtures/replay-combined-analysis-m2e-store.js';
import {golden,clock,logical,database,measure,json} from '../fixtures/replay-review-m2f-helpers.js';
import {child} from '../fixtures/replay-score-analysis-m2d-process.js';
import {phase} from '../fixtures/replay-review-m2f-process.js';
const request=(f,collection='log',action='claim',taskId='codex/m2f-test')=>({root:f.root,schemaVersion:f.schema,collection,replayId:f.options.replayId,fingerprint:collection==='log'?f.options.fingerprints[0]:f.options.scoreFingerprints[0],taskId,action});
const owner=(q)=>({kind:'review',key:JSON.stringify([recordKey(q),q.taskId])});
async function unchanged(f,q,code){const before=logical(f.root);await assert.rejects(update(q),{code});assert.deepEqual(logical(f.root),before);assert.ok(!fs.existsSync(path.join(f.root,'.manifest.lock')));await f.s.withWriter(()=>{});}
for(const schema of [1,2])test(`M2f schema ${schema}: exact 10/1000 and 600 MiB resource gate`,async t=>{
 const roots=[10,1000].map(()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'))),receipts=fs.mkdtempSync(path.join(os.tmpdir(),'pain-gain-m2f-gate-'));
 t.diagnostic(JSON.stringify({roots,receipts}));const worker=new URL('../fixtures/replay-review-m2f-worker.js',import.meta.url).pathname;
 const runs=[];for(const [name,deadline]of [['generate',60000],['operations',30000],['preservation',60000]])runs.push(await phase(['--max-old-space-size=192',worker,name,String(schema),receipts,...roots],deadline,receipts,name==='generate'?'generation':name));
 t.diagnostic(JSON.stringify(runs));
});
for(const schema of [1,2])for(const scenario of golden.scenarios)test(`M2f schema ${schema}: v2 ${scenario.collection}/${scenario.name}/${scenario.action}/${scenario.taskId}`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());t.diagnostic(`Retained fixture ${f.root}`);
 const q=request(f,scenario.collection,scenario.action,scenario.taskId);
 if(!scenario.absent)await f.s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:q,taskId:q.taskId,ordinal:7,value:scenario.initial})));
 for(const step of scenario.steps){const restore=clock(step.clock),before=logical(f.root),m=measure();let result;
  try{if(step.error)await assert.rejects(update(q),{code:'NOT_CLAIMED'});else result=await update(q);}finally{m.restore();restore();}
  if(step.error||!step.changed)assert.deepEqual(logical(f.root),before);
  if(result){assert.deepEqual(result.checkpoints,step.checkpoints);assert.equal(result.changed,step.changed);assert.equal(result.generation,String(BigInt(before.store_meta[0].generation)+(step.changed?1n:0n)));assert.equal(result.reviewOrdinal,scenario.absent?'0':'7');assert.ok(Buffer.byteLength(JSON.stringify(result))<=4096);assert.equal(m.m.transactions,step.changed?1:0);}
 }
});
test('M2f strict request admission before any store open',async()=>{
 const base={root:'/not-a-fixture',schemaVersion:1,collection:'log',replayId:'b'.repeat(24),fingerprint:'0'.repeat(64),taskId:'a',action:'claim'};
 for(const value of [null,undefined,[],1,new Date()])await assert.rejects(update(value),{code:'INVALID_ARGUMENT'});
 for(const action of ['complete','done','Claim',null])await assert.rejects(update({...base,action}),{code:'UNSUPPORTED_OPTION'});
 for(const taskId of ['', ' a','a ', '/a','é','a'.repeat(201),1])await assert.rejects(update({...base,taskId}),{code:'INVALID_IDENTITY'});
 for(const field of ['collection','replayId','fingerprint'])await assert.rejects(update({...base,[field]:'BAD'}),{code:'INVALID_IDENTITY'});
 for(const schemaVersion of ['1',0,3])await assert.rejects(update({...base,schemaVersion}),{code:'UNSUPPORTED_STORE'});
 for(const extra of [{recover:true},{timestamp:'x'},{[Symbol()]:1}])await assert.rejects(update({...base,...extra}),{code:'UNSUPPORTED_OPTION'});
 for(const key of Object.keys(base)){const missing={...base};delete missing[key];await assert.rejects(update(missing),{code:'INVALID_ARGUMENT'});const access={...base};Object.defineProperty(access,key,{get(){assert.fail('getter evaluated');}});await assert.rejects(update(access),{code:'INVALID_ARGUMENT'});}
});
for(const schema of [1,2])test(`M2f schema ${schema}: extensions, exact ordinals, checkpoint admission and overflow`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());const q=request(f),o=owner(q),max=9223372036854775807n;
 await f.s.withWriter(w=>w.transaction(tx=>{tx.putReview({recordKey:q,taskId:q.taskId,ordinal:9007199254740993n,value:{claimedAt:null,completedAt:'retained',note:{zero:0,flag:false}}});for(let i=0;i<140;i++)tx.setProperty({owner:o,pointer:`/extension-${i}`,ordinal:BigInt(i)+9007199254740993n,value:{i}});}));
 let before=logical(f.root),m=measure(),r;try{r=await update({...q,action:'examined'});}finally{m.restore();}assert.equal(r.reviewOrdinal,'9007199254740993');
 let after=logical(f.root);const added=after.properties.find(p=>p.owner_key===o.key&&p.pointer==='/examinedAt');assert.equal(added.ordinal,String(9007199254740993n+140n));
 assert.deepEqual(after.properties.filter(p=>p!==added),before.properties);assert.equal(after.reviews[0].value,null);assert.equal(r.checkpoints.completedAt.value,'retained');
 for(const value of [0,false,{},[], 'é'.repeat(129)]){await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:o,pointer:'/examinedAt',ordinal:max,value})));for(const action of ['claim','examined'])await unchanged(f,{...q,action},typeof value==='string'?'RESOURCE_LIMIT':'UNSUPPORTED_CHECKPOINT');}
 await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:o,pointer:'/examinedAt',ordinal:max,value:null})));
 r=await update({...q,action:'examined'});assert.equal(logical(f.root).properties.find(p=>p.owner_key===o.key&&p.pointer==='/examinedAt').ordinal,String(max));
 database(f.root,db=>db.prepare('UPDATE store_meta SET generation=?').run(max));assert.equal((await update(q)).generation,String(max));assert.equal((await update({...q,action:'examined'})).changed,false);
 await unchanged(f,{...q,taskId:'new'},'RESOURCE_LIMIT');
 database(f.root,db=>{db.prepare('UPDATE store_meta SET generation=10').run();db.prepare('UPDATE reviews SET ordinal=?').run(max);});await unchanged(f,{...q,taskId:'new'},'RESOURCE_LIMIT');
 database(f.root,db=>db.prepare("DELETE FROM properties WHERE owner_key=? AND pointer='/examinedAt'").run(o.key));await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:o,pointer:'/tail',ordinal:max,value:0})));await unchanged(f,{...q,action:'examined'},'RESOURCE_LIMIT');
});
for(const schema of [1,2])test(`M2f schema ${schema}: states, ownership, absent evidence and expired facts`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());const q=request(f);
 for(const taskId of ['a','A','a/b._-','x'.repeat(200),'constructor'])assert.equal((await update({...q,taskId})).changed,true);
 for(const collection of ['log','score'])for(const status of collection==='log'?['pending','waiting','done']:['pending','done','retiring']){
  const r=request(f,collection);await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:r,status})));await unchanged(f,r,'NOT_READY');
 }
 await unchanged(f,{...q,fingerprint:'f'.repeat(64)},'MISSING_RECORD');
 await f.s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'retired',key:recordKey({...q,fingerprint:'e'.repeat(64)}),ordinal:0})));await unchanged(f,{...q,fingerprint:'e'.repeat(64)},'RETIRED_RECORD');
 let escaped;await f.s.withWriter(w=>{escaped=w.readReviewCheckpoint;});assert.throws(()=>escaped({recordKey:q,taskId:q.taskId}),{code:'CLOSED'});
 const fresh=await makeFixture(schema);t.after(()=>fresh.h.close());const rq=request(fresh),before=logical(fresh.root);fs.unlinkSync(path.join(fresh.root,fresh.data.manifest.records[0].outputPath));
 const measured=measure();try{assert.equal((await update(rq)).changed,true);}finally{measured.restore();}
 const {analyzeFixtureCombinedReplay}=await import('../../tools/replay-combined-analysis-fixture.js');await assert.rejects(analyzeFixtureCombinedReplay({...fresh.options,fingerprints:fresh.options.fingerprints}),{code:'UNAVAILABLE'});
 assert.deepEqual(logical(fresh.root).records,before.records);
});
for(const schema of [1,2])test(`M2f schema ${schema}: primary null and rollback/close/release commit boundaries`,async t=>{
 const result=await child(['--experimental-test-module-mocks',new URL('../fixtures/replay-review-m2f-faults.js',import.meta.url).pathname,String(schema)],30000);assert.equal(result.result.passed,true);t.diagnostic(json(result.result));
});
for(const schema of [1,2])test(`M2f schema ${schema}: live lock-serialized races and snapshot coherence`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());const base=request(f),events=[];
 function actor(mode,q){const p=fork(new URL('../fixtures/replay-review-m2f-racer.js',import.meta.url),[mode,JSON.stringify(q)],{stdio:['ignore','pipe','pipe','ipc']}),messages=[],waiters=[];let stderr='';p.stderr.on('data',b=>stderr+=b);p.stdout.resume();p.on('message',m=>{events.push({pid:p.pid,...m});messages.push(m);for(const fn of [...waiters])fn();});const wait=event=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Race latch deadline '+stderr));},15000);const check=()=>{const m=messages.find(m=>m.event===event);if(m){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(m);}};waiters.push(check);check();});const exit=new Promise((resolve,reject)=>p.on('close',(code,signal)=>code===0?resolve():reject(Error(`Race worker ${code}/${signal} ${stderr}`))));return{p,wait,exit};}
 for(const tasks of [['same','same'],['first','second']]){
  const held=actor('hold',base);await held.wait('held');const actors=tasks.map(taskId=>actor('update',{...base,taskId}));await Promise.all(actors.map(a=>a.wait('waiting')));held.p.send({});const results=await Promise.all(actors.map(a=>a.wait('result')));await Promise.all([held.exit,...actors.map(a=>a.exit)]);assert.ok(results.every(r=>!r.error));assert.equal(results.filter(r=>r.value.changed).length,tasks[0]===tasks[1]?1:2);if(tasks[0]!==tasks[1])assert.notEqual(results[0].value.reviewOrdinal,results[1].value.reviewOrdinal);
 }
 const held=actor('hold',base);await held.wait('held');const a=actor('update',{...base,taskId:'race-examine',action:'examined'}),b=actor('update',{...base,taskId:'race-examine'});await Promise.all([a.wait('waiting'),b.wait('waiting')]);held.p.send({});const [examined,claimed]=await Promise.all([a.wait('result'),b.wait('result')]);await Promise.all([held.exit,a.exit,b.exit]);assert.equal(claimed.value.changed,true);if(examined.error)assert.equal(examined.error.code,'NOT_CLAIMED');else assert.equal(examined.value.changed,true);
 const firstAcquisition=events.filter(e=>e.event==='acquired'&&[a.p.pid,b.p.pid].includes(e.pid))[0];assert.equal(Boolean(examined.error),firstAcquisition.pid===a.p.pid);
 const rq={...base,taskId:'snapshot'};await update(rq);let pinned;
 await f.s.withReadSnapshot({reviewKeys:[{recordKey:rq,taskId:rq.taskId}],payloadRoles:[]},async view=>{pinned=view;const reviewOwner=owner(rq),rows=view.properties.get(JSON.stringify(reviewOwner));assert.equal(JSON.parse(rows.find(p=>p.pointer==='/examinedAt').value),null);const ref=view.output(rq),artifact=view.artifact(ref),buf=Buffer.alloc(20);assert.ok(view.read(artifact,buf,0)>0);await update({...rq,action:'examined'});assert.equal(JSON.parse(rows.find(p=>p.pointer==='/examinedAt').value),null);assert.ok(view.read(artifact,buf,0)>0);});assert.throws(()=>pinned.assertOpen(),{code:'CLOSED'});await f.s.withReadSnapshot({reviewKeys:[{recordKey:rq,taskId:rq.taskId}],payloadRoles:[]},view=>assert.equal(typeof JSON.parse(view.properties.get(JSON.stringify(owner(rq))).find(p=>p.pointer==='/examinedAt').value),'string'));
 for(const [message,code]of [[{intent:true},'NOT_READY'],[{status:'done'},'NOT_READY'],[{identity:true},'INVALID_REFERENCE'],[{descriptor:true},'UNSUPPORTED_STORE'],[{retirement:true},'RETIRED_RECORD']]){const fixture=await makeFixture(schema);t.after(()=>fixture.h.close());const q=request(fixture,'score'),hold=actor('hold',q);await hold.wait('held');const updateActor=actor('update',q);await updateActor.wait('waiting');if(message.retirement){delete message.retirement;message.retire=[...fixture.refs.find(r=>r.key.collection==='score'&&r.key.fingerprint===q.fingerprint).refs];const record=fixture.data.manifest.scoreRecords[0];message.retire.push({path:record.outputPath,hash:record.outputFingerprint,bytes:fixture.data.files[record.outputPath].length});}hold.p.send(message);const result=await updateActor.wait('result');await Promise.all([hold.exit,updateActor.exit]);assert.equal(result.error.code,code);}
 t.diagnostic(json({root:f.root,events}));
});
for(const schema of [1,2])test(`M2f schema ${schema}: payload-backed review extensions remain opaque and checkpoints reject references`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());t.diagnostic(`Retained fixture ${f.root}`);const q={...request(f),fingerprint:f.options.fingerprints[1]},o=owner(q),bytes=Buffer.from(JSON.stringify({unknown:'retained'})),expected=digestChunks(chunks(bytes));let ref;
 await f.s.withWriter(async w=>{w.transaction(tx=>{tx.putReview({recordKey:q,taskId:q.taskId,ordinal:4,value:{}});tx.appendIntent({id:'review-extension',recordKey:q,files:[{ordinal:0,path:payloadPath(f.s.storeId,o,'/unknown','extensions',expected.expectedHash),hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner:o,pointer:'/unknown',role:'extensions'}}]});});ref=await w.publishPayload({owner:o,pointer:'/unknown',role:'extensions',source:chunks(bytes),...expected});w.transaction(tx=>{tx.setProperty({owner:o,pointer:'/unknown',ordinal:9007199254740993n,payloadRef:ref});tx.finishPublication({recordKey:q,operationId:'review-extension'});});});
 const before=logical(f.root),m=measure();try{await update({...q,action:'examined'});}finally{m.restore();}const after=logical(f.root);assert.deepEqual(after.payloads,before.payloads);assert.deepEqual(after.properties.filter(p=>p.owner_key===o.key&&p.pointer==='/unknown'),before.properties.filter(p=>p.owner_key===o.key&&p.pointer==='/unknown'));
 await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:o,pointer:'/claimedAt',ordinal:0,payloadRef:ref})));const measured=measure();try{await assert.rejects(update(q),{code:'UNSUPPORTED_CHECKPOINT'});}finally{measured.restore();}
});
for(const schema of [1,2])test(`M2f schema ${schema}: selected metadata corruption rejects unchanged`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());const q=request(f);await update(q);
 const cases=[
  ["UPDATE records SET key='wrong' WHERE key=?",[recordKey(q)],'INVALID_REFERENCE'],
  ["UPDATE properties SET value='\"wrong\"' WHERE owner_kind='record' AND owner_key=? AND pointer='/fingerprint'",[recordKey(q)],'INVALID_REFERENCE'],
  ["UPDATE reviews SET owner_key='wrong' WHERE task=?",[q.taskId],'OWNERSHIP_CONFLICT'],
  ["UPDATE replays SET status='pending' WHERE key=?",[q.replayId],'INVALID_REFERENCE'],
  ["UPDATE outputs SET state='pending' WHERE collection='log'",[],'NOT_READY'],
  ["UPDATE outputs SET hash=? WHERE collection='log'",['f'.repeat(64)],'INVALID_REFERENCE'],
  ["UPDATE properties SET value='null' WHERE owner_kind='record' AND owner_key=? AND pointer='/outputPath'",[recordKey(q)],'INVALID_REFERENCE'],
  ["UPDATE maps SET path=(SELECT path FROM outputs WHERE collection='log')",[],'OWNERSHIP_CONFLICT'],
  ["INSERT INTO retired VALUES (?,?,?,?,0)",['log',q.replayId,q.fingerprint,recordKey(q)],'INVALID_REFERENCE'],
 ];
 for(const [sql,args,code]of cases){const before=logical(f.root);database(f.root,db=>{db.exec('BEGIN');db.prepare(sql).run(...args);db.exec('COMMIT');});await unchanged(f,q,code);database(f.root,db=>{db.exec('PRAGMA foreign_keys=OFF;BEGIN');for(const table of ['records','reviews','properties','replays','outputs','maps','retired']){db.exec(`DELETE FROM ${table}`);for(const row of before[table]){const keys=Object.keys(row),s=db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`);s.run(...Object.values(row));}}db.exec('COMMIT');});assert.deepEqual(logical(f.root),before);}
 // Same fingerprint in the other collection remains independently addressable.
 const score=request(f,'score');database(f.root,db=>{db.exec('PRAGMA foreign_keys=OFF');const old=recordKey(score),next=recordKey({...score,fingerprint:q.fingerprint});db.prepare('UPDATE records SET fingerprint=?,key=? WHERE key=?').run(q.fingerprint,next,old);db.prepare('UPDATE properties SET owner_key=? WHERE owner_kind=? AND owner_key=?').run(next,'record',old);db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND owner_key=? AND pointer='/fingerprint'").run(JSON.stringify(q.fingerprint),next);const p=`replay-score-source-${q.replayId}-${q.fingerprint}.response`;db.prepare('UPDATE outputs SET fingerprint=?,path=? WHERE fingerprint=?').run(q.fingerprint,p,score.fingerprint);db.prepare('UPDATE records SET output_path=? WHERE key=?').run(p,next);db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND owner_key=? AND pointer='/outputPath'").run(JSON.stringify(p),next);});assert.equal((await update({...score,fingerprint:q.fingerprint})).changed,true);assert.equal((await update(q)).changed,false);
});
for(const schema of [1,2])test(`M2f schema ${schema}: restart before/after commit, hot journal and explicit recovery`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());t.diagnostic(`Retained fixture ${f.root}`);const worker=new URL('../fixtures/replay-review-m2f-restart.js',import.meta.url).pathname,opener=schema===1?openStore:openCatalog;
 database(f.root,db=>db.exec('PRAGMA user_version=12345'));
 for(const mode of ['before','after','hot']){const q={...request(f),taskId:'restart-'+mode},before=logical(f.root),crash=spawnSync(process.execPath,['--experimental-test-module-mocks',worker,mode,JSON.stringify(q)],{encoding:'utf8',timeout:15000});assert.equal(crash.signal,'SIGKILL',crash.stderr);const lock=path.join(f.root,'.manifest.lock');fs.utimesSync(lock,new Date(0),new Date(0));
  if(mode!=='after')await assert.rejects(update(q),{code:'RECOVERY_REQUIRED'});
  const recovered=await opener({root:f.root,mode:'write',recover:true});recovered.close();const after=logical(f.root);
  database(f.root,db=>assert.equal(db.prepare('PRAGMA user_version').get().user_version,12345));
  assert.equal(fs.existsSync(path.join(f.root,JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).database)+'-journal'),false);
  if(mode!=='after')assert.deepEqual(after,before);else assert.equal(BigInt(after.store_meta[0].generation),BigInt(before.store_meta[0].generation)+1n);
  const retry=await update(q);assert.equal(retry.changed,mode!=='after');assert.equal((await update(q)).changed,false);t.diagnostic(json({mode,root:f.root,signal:crash.signal,retry}));
 }
});
for(const schema of [1,2])test(`M2f schema ${schema}: detached request, large reviewer tails, ties and exact result budgets`,async t=>{
 const f=await makeFixture(schema);t.after(()=>f.h.close());const q=request(f),original={...q},pending=update(q);q.root='/invalid';q.taskId='mutated';assert.equal((await pending).taskId,original.taskId);const o=owner(original);
 await f.s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<150;i++)tx.putReview({recordKey:original,taskId:'other-'+i,ordinal:i===149?9007199254740995n:9007199254740993n,value:{unknown:{ordinal:i},examinedAt:'retained'}});}));
 const before=logical(f.root),m=measure();let result;try{result=await update({...original,taskId:'appended'});}finally{m.restore();}assert.equal(result.reviewOrdinal,'9007199254740996');assert.deepEqual(logical(f.root).reviews.slice(0,-1),before.reviews);
 await f.s.withWriter(w=>w.transaction(tx=>{for(const [ordinal,name]of ['claimedAt','examinedAt','completedAt'].entries())tx.setProperty({owner:o,pointer:'/'+name,ordinal,value:'\0'.repeat(256)});}));await unchanged(f,original,'RESOURCE_LIMIT');
 await f.s.withWriter(w=>w.transaction(tx=>{for(const [ordinal,name]of ['claimedAt','examinedAt','completedAt'].entries())tx.setProperty({owner:o,pointer:'/'+name,ordinal,value:'é'.repeat(128)});}));assert.equal((await update(original)).changed,false);
 await f.s.withWriter(w=>{const a=w.readReviewCheckpoint({recordKey:original,taskId:original.taskId});a.current.status='done';a.checkpoints[0].value='false';const b=w.readReviewCheckpoint({recordKey:original,taskId:original.taskId});assert.equal(b.current.status,'claim');assert.notEqual(b.checkpoints[0].value,'false');});
});

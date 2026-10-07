import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import * as core from '../../tools/replay-store.js';
import * as catalog from '../../tools/replay-catalog.js';
import {makeFixture} from './replay-combined-analysis-m2e-store.js';
import {logical,json,clock,key,request} from './replay-score-review-m2g-helpers.js';
const schema=Number(process.argv[2]),f=await makeFixture(schema),q=request(f),roots=[f.root];let mode='none',escaped,attempts={},primary=null,changed=false;
process.stderr.write('Retained M2g fault fixture '+f.root+'\n');
await f.s.withWriter(w=>w.transaction(tx=>{for(const [ordinal,taskId]of [q.taskId,'other','subsequent','recovery-null','recovery-error'].entries())tx.putReview({recordKey:key(q),taskId,ordinal,value:{examinedAt:'examined',completedAt:null}});}));
const wrap=opener=>async options=>{
 const h=await opener({...options,fault:boundary=>{if(boundary===mode)throw primary;}}),s=h.evidence??h,writer=s.withWriter.bind(s),close=h.close.bind(h);
 s.getRecord=s.getReview=s.pageReviews=s.getMap=s.getReplay=()=>assert.fail('Public readers cannot authorize completion');
 s.withWriter=callback=>writer(w=>{escaped=w;const transaction=w.transaction.bind(w);w.transaction=fn=>transaction(tx=>{const value=fn(tx);if(mode==='body')throw primary;return value;});return callback(w);});
 h.close=()=>{attempts.owner=(attempts.owner??0)+1;close();if(['cleanup','body','postcommit','cleanup-null'].includes(mode))throw Error('owner-close');};return h;
};
mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{namedExports:{...core,openStore:wrap(core.openStore)}});
mock.module(new URL('../../tools/replay-catalog.js',import.meta.url).href,{namedExports:{...catalog,openCatalog:wrap(catalog.openCatalog)}});
const {completeFixtureScoreReview:complete}=await import('../../tools/replay-score-review-fixture.js');
const native={exec:DatabaseSync.prototype.exec,prepare:DatabaseSync.prototype.prepare,close:DatabaseSync.prototype.close,unlink:fs.unlinkSync};let writerDb;
DatabaseSync.prototype.prepare=function(sql){if(sql==='SELECT * FROM records WHERE collection=? AND replay_id=? AND fingerprint=?')writerDb=this;return native.prepare.call(this,sql);};
DatabaseSync.prototype.exec=function(sql){if(sql==='BEGIN IMMEDIATE')writerDb=this;const r=native.exec.call(this,sql);if(sql==='COMMIT'&&this===writerDb)changed=true;if(sql==='ROLLBACK'){attempts.rollback=(attempts.rollback??0)+1;if(['body','recovery'].includes(mode))throw Error('rollback-after-rollback');}return r;};
DatabaseSync.prototype.close=function(){const isWriter=this===writerDb,r=native.close.call(this);if(isWriter){writerDb=null;attempts.database=(attempts.database??0)+1;if(mode==='cleanup-null')throw null;if(['body','postcommit','cleanup','recovery'].includes(mode))throw Error('database-close');}return r;};
fs.unlinkSync=p=>{const r=native.unlink(p),cleanupFault=['body','postcommit','cleanup','cleanup-null'].includes(mode)||(mode==='recovery'&&attempts.rollback);if(String(p).endsWith('/.manifest.lock')){attempts.lock=(attempts.lock??0)+1;if(cleanupFault)throw Error('lock-release');}else if(/\.manifest\.lock\..*\.tmp$/.test(p)){attempts.ownerFile=(attempts.ownerFile??0)+1;if(cleanupFault)throw Error('owner-file');}return r;};
const receipts=[];
try{
 for(const fault of ['transaction-begin','transaction-commit','body'])for(const value of [null,new Error('primary')]){
  mode=fault;primary=value;attempts={};changed=false;const before=logical(f.root);await assert.rejects(complete(q),e=>e===primary);assert.equal(changed,false);assert.deepEqual(logical(f.root),before);assert.deepEqual(attempts,{...(fault==='transaction-begin'?{}:{rollback:1}),database:1,lock:1,ownerFile:1,owner:1});assert.throws(()=>escaped.readScoreCompletionFacts({recordKey:key(q),taskId:q.taskId}),{code:'CLOSED'});receipts.push({fault,primary:value===null?'null':'Error',attempts:{...attempts},precommitUnchanged:true});mode='none';await f.s.withWriter(()=>{});
 }
 mode='postcommit';attempts={};changed=false;const before=logical(f.root),restore=clock('2026-10-06T00:02:00.000Z');try{await assert.rejects(complete(q),{message:'database-close'});}finally{restore();}assert.equal(changed,true);const after=logical(f.root);assert.equal(BigInt(after.store_meta[0].generation),BigInt(before.store_meta[0].generation)+1n);assert.deepEqual(attempts,{database:1,lock:1,ownerFile:1,owner:1});const cleanupAttempts={...attempts};
 mode='none';const retry=await complete(q);assert.equal(retry.changed,false);assert.deepEqual(logical(f.root),after);assert.equal(retry.checkpoints.completedAt.value,'2026-10-06T00:02:00.000Z');receipts.push({fault:'postcommit',committed:true,attempts:cleanupAttempts,retry});
 for(const failure of ['cleanup','cleanup-null']){mode=failure;attempts={};await assert.rejects(complete(q),e=>failure==='cleanup-null'?e===null:e.message==='database-close');assert.deepEqual(logical(f.root),after);assert.deepEqual(attempts,{database:1,lock:1,ownerFile:1,owner:1});receipts.push({fault:failure,attempts:{...attempts},unchanged:true});}mode='none';assert.equal((await complete({...q,taskId:'subsequent'})).changed,true);
 const opener=schema===1?core.openStore:catalog.openCatalog;
 for(const value of [null,new Error('recovery-primary')]){
  const recoveryRequest={...q,taskId:value===null?'recovery-null':'recovery-error'},before=logical(f.root);
  const crash=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./replay-score-review-m2g-restart.js',import.meta.url).pathname,'before',JSON.stringify(recoveryRequest)],{encoding:'utf8',timeout:15000});assert.equal(crash.signal,'SIGKILL',crash.stderr);fs.utimesSync(path.join(f.root,'.manifest.lock'),new Date(0),new Date(0));await assert.rejects(complete(recoveryRequest),{code:'RECOVERY_REQUIRED'});
  mode='recovery';primary=value;attempts={};changed=false;await assert.rejects(opener({root:f.root,mode:'write',recover:true,fault:boundary=>{if(boundary==='recovery-commit')throw primary;}}),e=>e===primary);assert.equal(changed,false);assert.deepEqual(attempts,{rollback:1,database:1,lock:2,ownerFile:1});const captured={...attempts};
  mode='none';const recovered=await opener({root:f.root,mode:'write',recover:true});recovered.close();assert.deepEqual(logical(f.root),before);assert.equal((await complete(recoveryRequest)).changed,true);assert.equal((await complete(recoveryRequest)).changed,false);receipts.push({fault:'recovery-commit',primary:value===null?'null':'Error',attempts:captured,precommitUnchanged:true,subsequentCompletion:true});
 }
 for(const statusOnly of [false,true]){
  mode='none';const g=await makeFixture(schema),a=request(g);roots.push(g.root);process.stderr.write('Retained final/status-only fault fixture '+g.root+'\n');
  try{
   await g.s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:key(a),taskId:a.taskId,ordinal:7,value:{examinedAt:'x',completedAt:statusOnly?'retained':null}})));
   for(const fault of ['body','transaction-commit'])for(const value of [null,new Error('primary')]){mode=fault;primary=value;attempts={};changed=false;const before=logical(g.root);await assert.rejects(complete(a),e=>e===primary);assert.equal(changed,false);assert.deepEqual(logical(g.root),before);assert.deepEqual(attempts,{rollback:1,database:1,lock:1,ownerFile:1,owner:1});receipts.push({fault,statusOnly,primary:value===null?'null':'Error',attempts:{...attempts},precommitUnchanged:true});}
   mode='postcommit';attempts={};changed=false;const before=logical(g.root);await assert.rejects(complete(a),{message:'database-close'});assert.equal(changed,true);const after=logical(g.root);assert.equal(BigInt(after.store_meta[0].generation),BigInt(before.store_meta[0].generation)+1n);assert.equal(after.records.find(r=>r.fingerprint===a.fingerprint).status,'done');assert.deepEqual(attempts,{database:1,lock:1,ownerFile:1,owner:1});const captured={...attempts};mode='none';assert.equal((await complete(a)).changed,false);assert.deepEqual(logical(g.root),after);receipts.push({fault:'postcommit',statusOnly,attempts:captured,committed:true,retryNoop:true});
  }finally{mode='none';g.h.close();}
 }
 console.log(json({passed:true,schema,roots,receipts}));
}finally{Object.assign(DatabaseSync.prototype,{exec:native.exec,prepare:native.prepare,close:native.close});fs.unlinkSync=native.unlink;f.h.close();}

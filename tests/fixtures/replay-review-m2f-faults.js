import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import * as core from '../../tools/replay-store.js';
import * as catalog from '../../tools/replay-catalog.js';
import {makeFixture} from './replay-combined-analysis-m2e-store.js';
import {logical,json,clock} from './replay-review-m2f-helpers.js';
const schema=Number(process.argv[2]),f=await makeFixture(schema),roots=[f.root];let mode='none',escaped,attempts={},primary=null,changed=false;
process.stderr.write(`Retained M2f fault fixture ${f.root}\n`);
const wrap=opener=>async options=>{
 const h=await opener({...options,fault:boundary=>{if(boundary===mode)throw primary;}}),s=h.evidence??h,writer=s.withWriter.bind(s),close=h.close.bind(h);
 s.getRecord=s.getReview=s.getMap=s.getReplay=()=>assert.fail('Preliminary getters must not authorize checkpoints');
 s.withWriter=callback=>writer(w=>{escaped=w;const transaction=w.transaction.bind(w);w.transaction=fn=>transaction(tx=>{const value=fn(tx);if(mode==='body')throw primary;return value;});return callback(w);});
 h.close=()=>{attempts.owner=(attempts.owner??0)+1;close();if(mode==='cleanup'||mode==='body'||mode==='postcommit')throw Error('owner-close');};return h;
};
mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{namedExports:{...core,openStore:wrap(core.openStore)}});
mock.module(new URL('../../tools/replay-catalog.js',import.meta.url).href,{namedExports:{...catalog,openCatalog:wrap(catalog.openCatalog)}});
const {updateFixtureReviewCheckpoint:update}=await import('../../tools/replay-review-fixture.js');
const q={root:f.root,schemaVersion:schema,collection:'log',replayId:f.options.replayId,fingerprint:f.options.fingerprints[0],taskId:'fault',action:'claim'};
const native={exec:DatabaseSync.prototype.exec,close:DatabaseSync.prototype.close,unlink:fs.unlinkSync};let writerDb;
DatabaseSync.prototype.exec=function(sql){if(sql==='BEGIN IMMEDIATE')writerDb=this;const r=native.exec.call(this,sql);if(sql==='COMMIT'&&this===writerDb)changed=true;if(sql==='ROLLBACK'){attempts.rollback=(attempts.rollback??0)+1;if(['body','recovery'].includes(mode))throw Error('rollback-after-rollback');}return r;};
DatabaseSync.prototype.close=function(){const isWriter=this===writerDb;const r=native.close.call(this);if(isWriter){writerDb=null;attempts.database=(attempts.database??0)+1;if(['body','postcommit','cleanup','recovery'].includes(mode))throw Error('database-close');}return r;};
fs.unlinkSync=p=>{const r=native.unlink(p),cleanupFault=['body','postcommit','cleanup'].includes(mode)||(mode==='recovery'&&attempts.rollback);if(String(p).endsWith('/.manifest.lock')){attempts.lock=(attempts.lock??0)+1;if(cleanupFault)throw Error('lock-release');}else if(/\.manifest\.lock\..*\.tmp$/.test(p)){attempts.ownerFile=(attempts.ownerFile??0)+1;if(cleanupFault)throw Error('owner-file');}return r;};
const receipts=[];
try{
 for(const fault of ['transaction-begin','transaction-commit','body'])for(const value of [null,new Error('primary')]){
  mode=fault;primary=value;attempts={};changed=false;const before=logical(f.root);await assert.rejects(update(q),e=>e===primary);assert.equal(changed,false);assert.deepEqual(logical(f.root),before);assert.equal(attempts.owner,1);assert.equal(attempts.lock,1);assert.equal(attempts.ownerFile,1);assert.throws(()=>escaped.readReviewCheckpoint({recordKey:q,taskId:q.taskId}),{code:'CLOSED'});mode='none';await f.s.withWriter(()=>{});receipts.push({fault,primary:value===null?'null':'Error',attempts,precommitUnchanged:true});
 }
 mode='postcommit';attempts={};changed=false;const before=logical(f.root);const restore=clock('2026-10-06T00:01:00.000Z');try{await assert.rejects(update(q),{message:'database-close'});}finally{restore();}assert.equal(changed,true);const after=logical(f.root);assert.equal(BigInt(after.store_meta[0].generation),BigInt(before.store_meta[0].generation)+1n);assert.equal(attempts.database,1);assert.equal(attempts.owner,1);assert.equal(attempts.lock,1);assert.equal(attempts.ownerFile,1);
 mode='none';const retry=await update(q);assert.equal(retry.changed,false);assert.deepEqual(logical(f.root),after);assert.equal(retry.checkpoints.claimedAt.value,'2026-10-06T00:01:00.000Z');receipts.push({fault:'postcommit',committed:true,attempts,retry});
 // No-op owner/lock cleanup rejection is not an attempted write.
 mode='cleanup';attempts={};await assert.rejects(update(q),{message:'lock-release'});assert.deepEqual(logical(f.root),after);mode='none';assert.equal((await update({...q,action:'examined'})).changed,true);
 // Recovery is explicit and locked. A pre-commit failure, including null,
 // survives secondary rollback/close/unlink errors; logical state is unchanged.
 const opener=schema===1?core.openStore:catalog.openCatalog;
 for(const value of [null,new Error('recovery-primary')]){
  const recoveryRequest={...q,taskId:value===null?'recovery-null':'recovery-error'},before=logical(f.root);
  const crash=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./replay-review-m2f-restart.js',import.meta.url).pathname,'before',JSON.stringify(recoveryRequest)],{encoding:'utf8',timeout:15000});assert.equal(crash.signal,'SIGKILL',crash.stderr);
  fs.utimesSync(path.join(f.root,'.manifest.lock'),new Date(0),new Date(0));
  await assert.rejects(update(recoveryRequest),{code:'RECOVERY_REQUIRED'});
  mode='recovery';primary=value;attempts={};changed=false;
  await assert.rejects(opener({root:f.root,mode:'write',recover:true,fault:boundary=>{if(boundary==='recovery-commit')throw primary;}}),e=>e===primary);
  assert.equal(changed,false);assert.equal(attempts.rollback,1);assert.equal(attempts.database,1);assert.equal(attempts.lock,2);assert.equal(attempts.ownerFile,1);
  mode='none';const recovered=await opener({root:f.root,mode:'write',recover:true});recovered.close();assert.deepEqual(logical(f.root),before);
  assert.equal((await update(recoveryRequest)).changed,true);assert.equal((await update(recoveryRequest)).changed,false);
  receipts.push({fault:'recovery-commit',primary:value===null?'null':'Error',attempts,precommitUnchanged:true,subsequentCheckpoint:true});
 }
 console.log(json({passed:true,schema,roots,receipts}));
}finally{Object.assign(DatabaseSync.prototype,{exec:native.exec,close:native.close});fs.unlinkSync=native.unlink;f.h.close();}

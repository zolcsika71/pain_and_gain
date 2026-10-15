import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import * as core from '../../tools/replay-store.js';
import {logical} from './replay-log-review-command-fixture.js';
const score=process.argv[3]==='score';
const {fixture}=await import(score?'./replay-score-review-command-fixture.js':'./replay-log-review-command-fixture.js');
const cli=process.argv[2]==='null-owner-cli',mode=cli?'null-owner':process.argv[2],f=await fixture();
if(process.argv[4]==='examined'){
    const seed=await core.openStore({root:f.root,mode:'write'});
    try{await seed.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:f.keys[0],taskId:f.request.taskId,ordinal:8,value:{claimedAt:'original',examinedAt:null,completedAt:null,unknown:[null,false]}})));}finally{seed.close();}
    f.request.action='examined';
}
const before=logical(f.root);
console.error(JSON.stringify({root:f.root,synthetic:true,retained:true,mode}));
const primary=mode==='null-owner'?null:Object.assign(Error('synthetic operation failure'),{code:'EIO'}),cleanup=Object.assign(Error('synthetic cleanup failure'),{code:'ENOSPC'});
const exec=DatabaseSync.prototype.exec,close=DatabaseSync.prototype.close,prepare=DatabaseSync.prototype.prepare;let writer,failedConnection;
DatabaseSync.prototype.exec=function(sql){
    if(sql==='BEGIN IMMEDIATE')writer=this;
    if((mode==='combined-read'&&sql==='BEGIN')||(mode==='combined-connection'&&sql.startsWith('PRAGMA synchronous=FULL;'))){failedConnection=this;throw primary;}
    return exec.call(this,sql);
};
DatabaseSync.prototype.prepare=function(sql){if(mode==='combined-runtime'&&sql==='SELECT sqlite_version() AS version'){failedConnection=this;throw primary;}return prepare.call(this,sql);};
DatabaseSync.prototype.close=function(){const chosen=this===writer,failed=this===failedConnection,r=close.call(this);if(chosen)writer=null;if(failed){failedConnection=null;throw cleanup;}if(chosen&&mode==='combined-db')throw cleanup;return r;};
mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{exports:{...core,openStore:async options=>{
    const handle=await core.openStore({...options,fault:p=>{if((mode==='begin'&&p==='transaction-begin')||(['commit','combined-db','combined-owner','null-owner'].includes(mode)&&p==='transaction-commit'))throw primary;}});
    const shut=handle.close.bind(handle);handle.close=()=>{shut();if(['cleanup','combined-owner','null-owner'].includes(mode))throw cleanup;};return handle;
}}});
const adapter=await import('../../tools/replay-log-review-fixture.js'),update=score?adapter.updateSyntheticScoreReview:adapter.updateSyntheticLogReview;let caught;
if(cli){
    process.argv=[process.execPath,new URL('../../tools/replay-logs.js',import.meta.url).pathname,'--synthetic-sqlite',f.root,score?'score-'+f.request.action:f.request.action,f.request.replayId,f.request.fingerprint,f.request.taskId];
    // The storage/map-repair dependency graph may already have imported the
    // CLI module before argv was set. Execute this independently scoped CLI
    // instance rather than accepting a cached, non-executed import as a test.
    await import('../../tools/replay-logs.js?synthetic-cli-fault=1');
}else{
try{await update(f.request);assert.fail('Expected failure');}catch(e){caught=e;}
DatabaseSync.prototype.exec=exec;DatabaseSync.prototype.close=close;DatabaseSync.prototype.prepare=prepare;
if(mode==='cleanup'){assert.equal(caught,cleanup);const after=logical(f.root);assert.equal(after.reviews.length,before.reviews.length+1);assert.equal(after.store_meta[0].generation,before.store_meta[0].generation+1);}
else{
    if(mode==='null-owner'){assert(caught instanceof AggregateError);assert.equal(caught.cause,null);assert.equal(caught.errors[0],null);assert.equal(caught.errors[1],cleanup);}
    else{assert.equal(caught,primary);if(mode.startsWith('combined'))assert(caught.cleanupFailures?.some(x=>x.systemCode==='ENOSPC'),'Cleanup failure must remain separate');}
    assert.deepEqual(logical(f.root),before);
}
console.log(JSON.stringify({passed:true,mode,root:f.root,code:caught?.code,cleanupFailures:caught?.cleanupFailures,primitiveCause:mode==='null-owner'?caught.cause:undefined}));
}

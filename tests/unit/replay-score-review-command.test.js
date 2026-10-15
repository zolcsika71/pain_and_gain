import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as adapter from '../../tools/replay-log-review-fixture.js';
import {updateFixtureReviewCheckpoint} from '../../tools/replay-review-fixture.js';
import {openStore,recordKey} from '../../tools/replay-store.js';
import {updateScoreReview} from '../../tools/replay-logs.js';
import {fixture} from '../fixtures/replay-score-review-command-fixture.js';
import {database,logical,hashFiles} from '../fixtures/replay-log-review-command-fixture.js';
const update=q=>adapter.updateSyntheticScoreReview(q);
const cli=(f,action='score-claim')=>['tools/replay-logs.js','--synthetic-sqlite',f.root,action,f.request.replayId,f.request.fingerprint,f.request.taskId];
async function rejection(f,q,code){const before=logical(f.root),files=hashFiles(f.root);await assert.rejects(update(q),{code});assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);}
test('selected score CLI claims and examines an exact score without touching equal log identity',async t=>{
    const f=await fixture(t),before=logical(f.root);let r=spawnSync(process.execPath,cli(f),{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const first=JSON.parse(r.stdout);assert.equal(first.collection,'score');assert.equal(first.action,'claim');assert.equal(first.changed,true);
    r=spawnSync(process.execPath,cli(f,'score-examined'),{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const examined=JSON.parse(r.stdout);assert.equal(examined.collection,'score');assert.equal(examined.action,'examined');assert.equal(examined.changed,true);
    const after=logical(f.root);assert.deepEqual(after.reviews.filter(x=>x.collection==='log'),before.reviews.filter(x=>x.collection==='log'));
    assert.deepEqual(after.records,before.records);assert.equal(first.generation,String(before.store_meta[0].generation+1));assert.equal(examined.generation,String(before.store_meta[0].generation+2));
});
test('selected score existing checkpoint seam accepts documented collision output name',async t=>{
    const f=await fixture(t,'collision');const r=await updateFixtureReviewCheckpoint({root:f.root,schemaVersion:1,collection:'score',replayId:f.request.replayId,fingerprint:f.request.fingerprint,taskId:f.request.taskId,action:'claim'});assert.equal(r.changed,true);
});
test('selected score accepts the full fingerprint output name',async t=>{
    const f=await fixture(t,'full');assert.equal((await update(f.request)).changed,true);
});
test('selected score review reconstruction, repeats and unrelated state preservation',async t=>{
    const f=await fixture(t),before=logical(f.root),files=hashFiles(f.root),first=await update(f.request);assert.equal(first.reviewOrdinal,'8');
    const claimed=logical(f.root);assert.deepEqual(await update(f.request),{...first,changed:false});assert.deepEqual(logical(f.root),claimed);
    const examined=await update({...f.request,action:'examined'}),after=logical(f.root);assert.deepEqual(await update({...f.request,action:'examined'}),{...examined,changed:false});assert.deepEqual(logical(f.root),after);
    for(const table of ['maps','replays','records','outputs','payloads','operations','operation_files','retired'])assert.deepEqual(after[table],before[table]);
    const own=JSON.stringify([recordKey(f.keys[0]),f.request.taskId]);assert.deepEqual(after.properties.filter(p=>p.owner_key!==own),before.properties);assert.deepEqual(after.reviews.filter(r=>r.owner_key!==own),before.reviews);
    for(const name of f.outputs)assert.equal(hashFiles(f.root)[name],files[name]);
    const s=await openStore({root:f.root,mode:'read'});try{assert.deepEqual(s.getReview(f.keys[0],f.request.taskId).value,{claimedAt:first.checkpoints.claimedAt.value,examinedAt:examined.checkpoints.examinedAt.value,completedAt:null});assert.deepEqual(s.getReview(f.keys[0],'other/owner').value,f.other);}finally{s.close();}
});
test('selected score existing review retains unknown fields, absent checkpoints and ordinal',async t=>{
    const f=await fixture(t),s=await openStore({root:f.root,mode:'write'}),value={claimedAt:null,completedAt:'retained',unknown:{order:[3,2],nil:null,no:false}};
    try{await s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:f.keys[0],taskId:f.request.taskId,ordinal:10,value})));}finally{s.close();}
    const before=logical(f.root),r=await update({...f.request,action:'examined'}),after=logical(f.root);assert.equal(r.reviewOrdinal,'10');assert.deepEqual(r.checkpoints.claimedAt,{present:true,value:null});
    const own=JSON.stringify([recordKey(f.keys[0]),f.request.taskId]),added=after.properties.find(p=>p.owner_key===own&&p.pointer==='/examinedAt');assert.equal(added.ordinal,3);assert.deepEqual(after.properties.filter(p=>p!==added),before.properties);
    const h=await openStore({root:f.root,mode:'read'});try{assert.deepEqual(h.getReview(f.keys[0],f.request.taskId).value,{...value,examinedAt:r.checkpoints.examinedAt.value});}finally{h.close();}
});
test('selected score map-independent omitted identity stays unknown and payloads are not opened',async t=>{
    const f=await fixture(t),q={...f.request,replayId:f.keys[2].replayId,fingerprint:f.keys[2].fingerprint},before=logical(f.root),open=fs.openSync;let n=0;
    fs.openSync=(p,...rest)=>{if(f.outputs.some(x=>p===path.join(f.root,x))){n++;throw Error('checkpoint must not read score payload');}return open(p,...rest);};
    try{assert.equal((await update(q)).changed,true);}finally{fs.openSync=open;}
    assert.equal(n,0);const after=logical(f.root);assert.deepEqual(after.records,before.records);assert.deepEqual(after.properties.filter(p=>p.owner_kind==='record'),before.properties.filter(p=>p.owner_kind==='record'));
    const props=after.properties.filter(p=>p.owner_kind==='record'&&p.owner_key===recordKey(f.keys[2]));assert(!props.some(p=>p.pointer==='/buildId'));assert.equal(props.find(p=>p.pointer==='/embeddedBuildId').value,'null');
});
for(const status of ['pending','done','retiring'])test('selected score rejects ineligible '+status,async t=>{
    const f=await fixture(t),s=await openStore({root:f.root,mode:'write'});try{await s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:f.keys[0],status})));}finally{s.close();}await rejection(f,f.request,'NOT_READY');
});
test('selected score requires exact record and existing task for examination',async t=>{
    const f=await fixture(t);await rejection(f,{...f.request,action:'examined'},'NOT_CLAIMED');await rejection(f,{...f.request,fingerprint:'e'.repeat(64)},'MISSING_RECORD');
});
test('selected score rejects missing reservations and separately retired selections',async t=>{
    const f=await fixture(t);database(f.root,db=>db.prepare('DELETE FROM outputs WHERE path=?').run(f.outputs[0]));await rejection(f,f.request,'INVALID_REFERENCE');
    const s=await openStore({root:f.root,mode:'write'}),retired={...f.keys[0],fingerprint:'e'.repeat(64)};try{await s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'retired',key:recordKey(retired),ordinal:3,value:{}})));}finally{s.close();}
    await rejection(f,{...f.request,fingerprint:retired.fingerprint},'RETIRED_RECORD');
});
for(const mode of ['owner','binding','intent','checkpoint','output-pending','output-hash','output-owner','output-path','original','cross-kind'])test('selected score rejects '+mode+' without repair',async t=>{
    const f=await fixture(t);await update(f.request);const own=JSON.stringify([recordKey(f.keys[0]),f.request.taskId]);database(f.root,db=>{
        if(mode==='owner')db.prepare('UPDATE reviews SET owner_key=? WHERE collection=? AND fingerprint=? AND task=?').run('forged','score',f.request.fingerprint,f.request.taskId);
        if(mode==='binding')db.prepare('UPDATE reviews SET task=? WHERE owner_key=?').run('misbound',own);
        if(mode==='intent')db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run('blocked','score',f.request.replayId,f.request.fingerprint,'publish',0);
        if(mode==='checkpoint')db.prepare("UPDATE properties SET value='false' WHERE owner_kind='review' AND owner_key=? AND pointer='/examinedAt'").run(own);
        if(mode==='output-pending')db.prepare("UPDATE outputs SET state='pending' WHERE path=?").run(f.outputs[0]);
        if(mode==='output-hash')db.prepare('UPDATE outputs SET hash=? WHERE path=?').run('e'.repeat(64),f.outputs[0]);
        if(mode==='output-owner')db.prepare('UPDATE outputs SET collection=? WHERE path=?').run('log',f.outputs[0]);
        if(mode==='output-path'){
            db.prepare('UPDATE outputs SET path=? WHERE path=?').run('not-score.response',f.outputs[0]);db.prepare('UPDATE records SET output_path=? WHERE key=?').run('not-score.response',recordKey(f.keys[0]));
            db.prepare('UPDATE properties SET value=? WHERE owner_kind=? AND owner_key=? AND pointer=?').run(JSON.stringify('not-score.response'),'record',recordKey(f.keys[0]),'/outputPath');
        }
        if(mode==='original')db.prepare('UPDATE properties SET value=? WHERE owner_kind=? AND owner_key=? AND pointer=?').run(JSON.stringify('e'.repeat(64)),'record',recordKey(f.keys[0]),'/fingerprint');
        if(mode==='cross-kind')db.prepare('UPDATE maps SET path=?').run(f.outputs[0]);
    });const code=['owner','binding','cross-kind'].includes(mode)?'OWNERSHIP_CONFLICT':mode==='intent'||mode==='output-pending'?'NOT_READY':mode==='checkpoint'?'UNSUPPORTED_CHECKPOINT':'INVALID_REFERENCE';await rejection(f,{...f.request,action:'examined'},code);
});
test('selected score concurrency makes one claim and one generation-neutral no-op',async t=>{
    const f=await fixture(t),before=logical(f.root),results=await Promise.all([update(f.request),update(f.request)]);assert.equal(results.filter(r=>r.changed).length,1);assert.equal(new Set(results.map(r=>r.generation)).size,1);assert.equal(logical(f.root).store_meta[0].generation,before.store_meta[0].generation+1);
});
for(const action of ['score-claim','score-examined','done','release','complete','score-done','cleanup','verify','import'])test('selected score API excludes '+action+' before content access',async()=>{
    const open=fs.openSync;let n=0;fs.openSync=(...a)=>{n++;return open(...a);};try{await assert.rejects(update({synthetic:true,root:'/forbidden',action,replayId:'a'.repeat(24),fingerprint:'0'.repeat(64),taskId:'test'}),{code:'UNSUPPORTED_OPTION'});assert.equal(n,0);}finally{fs.openSync=open;}
});
test('selected score stable options and identities reject accessors or permissive fallback',async t=>{
    const f=await fixture(t);let reads=0;await assert.rejects(update({...f.request,get root(){reads++;return f.root;}}),{code:'INVALID_ARGUMENT'});assert.equal(reads,0);
    for(const extra of [{collection:'log'},{synthetic:false},{replayId:'game'},{fingerprint:'A'.repeat(64)},{taskId:' bad'},{schemaVersion:2}])await assert.rejects(update({...f.request,...extra}));
    const q={...f.request},op=update(q);q.root='/forbidden';q.action='done';q.fingerprint='e'.repeat(64);assert.equal((await op).changed,true);
});
test('selected score supported actions still reject nonfixture roots before content access',async()=>{
    const open=fs.openSync;let n=0;fs.openSync=(...a)=>{n++;return open(...a);};
    try{for(const root of [process.cwd(),'/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-forbidden'])await assert.rejects(update({synthetic:true,root,action:'claim',replayId:'a'.repeat(24),fingerprint:'0'.repeat(64),taskId:'test'}),{code:'UNSAFE_PATH'});assert.equal(n,0);}finally{fs.openSync=open;}
});
test('selected score CLI rejects unsupported score operations and misplaced mode without mutation',async t=>{
    const f=await fixture(t),before=hashFiles(f.root);
    for(const action of ['score-cleanup','score-verify','score-import','release','score-claim-extra']){const r=spawnSync(process.execPath,cli(f,action),{encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr).code,'UNSUPPORTED_OPTION');}
    const unclaimed=spawnSync(process.execPath,cli(f,'score-done'),{encoding:'utf8',timeout:5000});assert.equal(unclaimed.status,1);assert.equal(JSON.parse(unclaimed.stderr).code,'NOT_CLAIMED');
    const r=spawnSync(process.execPath,['tools/replay-logs.js','score-claim','--synthetic-sqlite'],{encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.deepEqual(hashFiles(f.root),before);
});
test('selected score production semantics remain unchanged on isolated v2 input',async t=>{
    const f=await fixture(t),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-score-checkpoint-v2-fixture-'));t.diagnostic(JSON.stringify({root,synthetic:true,retained:true}));fs.mkdirSync(path.join(root,'replay_logs'));
    const p=path.join(root,'replay_logs','manifest.json'),manifest={version:2,maps:[],replays:[],records:[],scoreRecords:f.records.map((r,i)=>({...r,status:'claim',reviews:i===0?{'other/owner':f.other}:{},unknown:r.unknown}))};fs.writeFileSync(p,JSON.stringify(manifest));
    const first=await updateScoreReview(root,'claim',f.request.replayId,f.request.fingerprint,f.request.taskId);assert.deepEqual(first.reviews['other/owner'],f.other);
    const claimed=JSON.parse(fs.readFileSync(p));await updateScoreReview(root,'claim',f.request.replayId,f.request.fingerprint,f.request.taskId);assert.deepEqual(JSON.parse(fs.readFileSync(p)),claimed);
    const examined=await updateScoreReview(root,'examined',f.request.replayId,f.request.fingerprint,f.request.taskId);assert.equal(examined.reviews[f.request.taskId].claimedAt,first.reviews[f.request.taskId].claimedAt);assert.equal(examined.reviews[f.request.taskId].completedAt,null);assert.equal(typeof examined.reviews[f.request.taskId].examinedAt,'string');assert.deepEqual(JSON.parse(fs.readFileSync(p)).scoreRecords[1],manifest.scoreRecords[1]);
});
for(const mode of ['begin','commit','cleanup','combined-db','combined-owner','null-owner'])test('selected score atomic/error boundary '+mode,t=>{
    const r=spawnSync(process.execPath,['--experimental-test-module-mocks','tests/fixtures/replay-log-review-command-faults.js',mode,'score'],{encoding:'utf8',timeout:15000});t.diagnostic(r.stderr);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).passed,true);
});
for(const mode of ['commit','combined-owner'])test('selected score examined rollback/error boundary '+mode,t=>{
    const r=spawnSync(process.execPath,['--experimental-test-module-mocks','tests/fixtures/replay-log-review-command-faults.js',mode,'score','examined'],{encoding:'utf8',timeout:15000});t.diagnostic(r.stderr);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).passed,true);
});
test('selected score CLI reports combined primitive operation and cleanup failure',t=>{
    const r=spawnSync(process.execPath,['--experimental-test-module-mocks','tests/fixtures/replay-log-review-command-faults.js','null-owner-cli','score'],{encoding:'utf8',timeout:15000});t.diagnostic(r.stderr);assert.equal(r.status,1);
    const lines=r.stderr.split('\n').filter(line=>line.startsWith('{"code":'));assert.equal(lines.length,1);const d=JSON.parse(lines[0]);assert.equal(d.operationFailure,null);assert(d.cleanupFailures.some(x=>x.systemCode==='ENOSPC'));
});

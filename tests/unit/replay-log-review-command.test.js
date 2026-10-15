import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess,{spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {updateSyntheticLogReview as update} from '../../tools/replay-log-review-fixture.js';
import {openStore,recordKey} from '../../tools/replay-store.js';
import {updateReview} from '../../tools/replay-logs.js';
import {fixture,database,logical,hashFiles} from '../fixtures/replay-log-review-command-fixture.js';

const cli=f=>['tools/replay-logs.js','--synthetic-sqlite',f.root,'claim',f.request.replayId,f.request.fingerprint,f.request.taskId];
async function rejection(f,q,code){const before=logical(f.root),files=hashFiles(f.root);await assert.rejects(update(q),{code});assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);}
test('selected log commands claim/examined reconstruct reviews and preserve unrelated data',async t=>{
    const f=await fixture(t),before=logical(f.root),first=await update(f.request);assert.equal(first.changed,true);assert.equal(first.reviewOrdinal,'8');assert.equal(first.generation,String(before.store_meta[0].generation+1));
    const claimed=logical(f.root);assert.deepEqual(await update(f.request),{...first,changed:false});assert.deepEqual(logical(f.root),claimed);
    const examined=await update({...f.request,action:'examined'});assert.equal(examined.changed,true);assert.equal(examined.generation,String(before.store_meta[0].generation+2));assert.equal(examined.checkpoints.completedAt.value,null);
    const after=logical(f.root);assert.deepEqual(await update({...f.request,action:'examined'}),{...examined,changed:false});assert.deepEqual(logical(f.root),after);
    for(const name of ['maps','replays','records','outputs','payloads','operations','operation_files','retired'])assert.deepEqual(after[name],before[name]);
    assert.deepEqual(after.reviews.filter(r=>r.task!==f.request.taskId||r.fingerprint!==f.request.fingerprint),before.reviews);
    const s=await openStore({root:f.root,mode:'read'});try{assert.deepEqual(s.getReview(f.keys[0],'other/owner').value,f.other);assert.deepEqual(s.getReview(f.keys[0],f.request.taskId).value,{claimedAt:first.checkpoints.claimedAt.value,examinedAt:examined.checkpoints.examinedAt.value,completedAt:null});}finally{s.close();}
});
test('selected log existing unknown properties and absent/null checkpoints survive examination',async t=>{
    const f=await fixture(t),s=await openStore({root:f.root,mode:'write'});const value={claimedAt:null,completedAt:'retained',unknown:{empty:[],nil:null,flag:false}};
    await s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:f.keys[0],taskId:f.request.taskId,ordinal:10,value})));s.close();const before=logical(f.root),r=await update({...f.request,action:'examined'}),after=logical(f.root);
    assert.deepEqual(r.checkpoints.claimedAt,{present:true,value:null});assert.equal(r.reviewOrdinal,'10');
    const added=after.properties.find(p=>p.owner_key===JSON.stringify([recordKey(f.keys[0]),f.request.taskId])&&p.pointer==='/examinedAt');assert(added);assert.deepEqual(after.properties.filter(p=>p!==added),before.properties);
    const h=await openStore({root:f.root,mode:'read'});try{assert.deepEqual(h.getReview(f.keys[0],f.request.taskId).value,{...value,examinedAt:r.checkpoints.examinedAt.value});}finally{h.close();}
});
for(const status of ['pending','waiting','done'])test('selected log rejects ineligible '+status,async t=>{const f=await fixture(t),s=await openStore({root:f.root,mode:'write'});await s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:f.keys[0],status})));s.close();await rejection(f,f.request,'NOT_READY');});
test('selected log rejects unclaimed examination and exact-selection misses',async t=>{const f=await fixture(t);await rejection(f,{...f.request,action:'examined'},'NOT_CLAIMED');await rejection(f,{...f.request,fingerprint:'e'.repeat(64)},'MISSING_RECORD');});
for(const mode of ['owner','binding','association','intent','checkpoint'])test('selected log rejects corruption '+mode+' without repair',async t=>{
    const f=await fixture(t);await update(f.request);database(f.root,db=>{
        if(mode==='owner')db.prepare('UPDATE reviews SET owner_key=? WHERE task=? AND fingerprint=?').run('forged',f.request.taskId,f.request.fingerprint);
        if(mode==='binding')db.prepare('UPDATE reviews SET task=? WHERE owner_key=?').run('misbound',JSON.stringify([recordKey(f.keys[0]),f.request.taskId]));
        if(mode==='association')db.prepare("UPDATE replays SET status='deferred'").run();
        if(mode==='intent')db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run('blocked','log',f.request.replayId,f.request.fingerprint,'planned',0);
        if(mode==='checkpoint')db.prepare("UPDATE properties SET value='false' WHERE owner_kind='review' AND owner_key=? AND pointer='/examinedAt'").run(JSON.stringify([recordKey(f.keys[0]),f.request.taskId]));
    });await rejection(f,{...f.request,action:'examined'},mode==='owner'||mode==='binding'?'OWNERSHIP_CONFLICT':mode==='association'?'INVALID_REFERENCE':mode==='intent'?'NOT_READY':'UNSUPPORTED_CHECKPOINT');
});
test('selected log concurrent same-task calls serialize one mutation and one no-op',async t=>{
    const f=await fixture(t),before=logical(f.root),results=await Promise.all([update(f.request),update(f.request)]);
    assert.equal(results.filter(r=>r.changed).length,1);assert.equal(new Set(results.map(r=>r.generation)).size,1);
    const after=logical(f.root);assert.equal(after.reviews.length,before.reviews.length+1);assert.equal(after.store_meta[0].generation,before.store_meta[0].generation+1);
});
test('selected log legacy v2 command semantics remain available on independent synthetic input',async t=>{
    const f=await fixture(t),legacy=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-log-checkpoint-v2-fixture-'));t.diagnostic(JSON.stringify({legacy,synthetic:true,retained:true}));fs.mkdirSync(path.join(legacy,'replay_logs'));
    const manifest={version:2,maps:[],replays:[],records:f.records.map((r,i)=>({...r,reviews:i===0?{'other/owner':f.other}:{'same/task':{claimedAt:'unrelated',unknown:[null,false]}}}))};
    fs.writeFileSync(path.join(legacy,'replay_logs','manifest.json'),JSON.stringify(manifest));
    const result=await updateReview(legacy,'claim',f.request.replayId,f.request.fingerprint,f.request.taskId);assert.equal(result.status,'claim');assert.deepEqual(result.reviews['other/owner'],f.other);
    const first=JSON.parse(fs.readFileSync(path.join(legacy,'replay_logs','manifest.json')));await updateReview(legacy,'claim',f.request.replayId,f.request.fingerprint,f.request.taskId);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(legacy,'replay_logs','manifest.json'))),first);
    const examined=await updateReview(legacy,'examined',f.request.replayId,f.request.fingerprint,f.request.taskId);assert.equal(examined.reviews[f.request.taskId].claimedAt,first.records[0].reviews[f.request.taskId].claimedAt);assert.equal(examined.reviews[f.request.taskId].completedAt,null);assert.equal(typeof examined.reviews[f.request.taskId].examinedAt,'string');
    const last=JSON.parse(fs.readFileSync(path.join(legacy,'replay_logs','manifest.json')));assert.deepEqual(last.records[1],manifest.records[1]);assert.deepEqual(last.records[0].unknown,manifest.records[0].unknown);
});
test('selected log ordinary module import stays SQLite-free',()=>{
    const script=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){if(s==='node:sqlite'||s==='sqlite')throw Error('unexpected SQLite import');return next(s,c);}});await import('./tools/replay-logs.js');console.log('imported');`;
    const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'imported');
});
test('selected log rejects a known build conflict under the checkpoint lock',async t=>{
    const f=await fixture(t);database(f.root,db=>{db.prepare('UPDATE replays SET build_id=?').run('e'.repeat(64));db.prepare("UPDATE properties SET value=? WHERE owner_kind='replay' AND pointer='/buildId'").run(JSON.stringify('e'.repeat(64)));});
    await rejection(f,f.request,'INVALID_REFERENCE');
});
for(const kind of ['null','omitted'])test('selected log preserves unknown '+kind+' build without association inference',async t=>{
    const f=await fixture(t);database(f.root,db=>{
        db.prepare('UPDATE records SET build_id=NULL WHERE fingerprint=?').run(f.request.fingerprint);
        if(kind==='null')db.prepare("UPDATE properties SET value='null' WHERE owner_kind='record' AND owner_key=? AND pointer='/buildId'").run(recordKey(f.keys[0]));
        else db.prepare("DELETE FROM properties WHERE owner_kind='record' AND owner_key=? AND pointer='/buildId'").run(recordKey(f.keys[0]));
    });
    const before=logical(f.root);await update(f.request);await update({...f.request,action:'examined'});const after=logical(f.root);
    assert.deepEqual(after.records,before.records);assert.deepEqual(after.replays,before.replays);
    assert.deepEqual(after.properties.filter(p=>p.owner_kind!=='review'),before.properties.filter(p=>p.owner_kind!=='review'));
});
test('selected log invalid exact identities and inherited options reject before access',async t=>{
    const f=await fixture(t),open=fs.openSync;let n=0,calls=0;fs.openSync=(...args)=>{n++;return open(...args);};
    try{
        for(const extra of [{replayId:'game'},{fingerprint:'A'.repeat(64)},{taskId:' bad'}])await assert.rejects(update({...f.request,...extra}),{code:'INVALID_IDENTITY'});
        await assert.rejects(update(Object.assign(Object.create({get root(){calls++;return f.root;}}),{synthetic:true})),{code:'INVALID_ARGUMENT'});
        assert.equal(n,0);assert.equal(calls,0);
    }finally{fs.openSync=open;}
});
for(const alteration of ['schema','path','rehearsal'])test('selected log rejects descriptor '+alteration+' before native open',async t=>{
    const f=await fixture(t),p=path.join(f.root,'manifest.json'),d=JSON.parse(fs.readFileSync(p));
    if(alteration==='schema')d.schemaVersion=2;
    if(alteration==='path')d.database='../outside.sqlite';
    if(alteration==='rehearsal')d.rehearsal={productionAuthority:false};
    fs.writeFileSync(p,JSON.stringify(d));await assert.rejects(update(f.request),{code:'UNSUPPORTED_STORE'});
});
for(const part of ['marker','descriptor','database'])for(const kind of ['hardlink','symlink'])test('selected log rejects '+kind+' '+part,async t=>{
    const f=await fixture(t),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),p=path.join(f.root,part==='marker'?'.storage-v3-fixture':part==='descriptor'?'manifest.json':d.database),retained=path.join(path.dirname(f.root),'pain-gain-retained-control-'+path.basename(f.root)+'-'+part);
    if(kind==='hardlink')fs.linkSync(p,retained);else{fs.renameSync(p,retained);fs.symlinkSync(retained,p);}await assert.rejects(update(f.request),e=>['UNSAFE_PATH','unsafe-path'].includes(e.code));
});
test('selected log descriptor read and close failures preserve both system codes',async t=>{
    const f=await fixture(t),target=path.join(f.root,'manifest.json'),open=fs.openSync,read=fs.readSync,close=fs.closeSync;let chosen;
    const primary=Object.assign(Error('descriptor read'),{code:'EIO'}),cleanup=Object.assign(Error('descriptor close'),{code:'ENOSPC'});
    fs.openSync=(p,...a)=>{const fd=open(p,...a);if(p===target)chosen=fd;return fd;};fs.readSync=(fd,...a)=>{if(fd===chosen)throw primary;return read(fd,...a);};fs.closeSync=fd=>{close(fd);if(fd===chosen){chosen=undefined;throw cleanup;}};
    try{await assert.rejects(update(f.request),e=>e===primary&&e.cleanupFailures.some(x=>x.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}
});
for(const action of ['score-claim','score-examined','done','release','complete','import','Claim'])test('selected log excludes '+action+' before file opens',async t=>{
    const f=await fixture(t),open=fs.openSync;let n=0;fs.openSync=(...a)=>{n++;return open(...a);};try{await assert.rejects(update({...f.request,action}),{code:'UNSUPPORTED_OPTION'});assert.equal(n,0);}finally{fs.openSync=open;}
});
test('selected log options are private and accessors/overrides reject',async t=>{
    const f=await fixture(t);let calls=0;await assert.rejects(update({...f.request,get root(){calls++;return f.root;}}),{code:'INVALID_ARGUMENT'});assert.equal(calls,0);
    for(const extra of [{synthetic:false},{collection:'score'},{schemaVersion:2},{timestamp:'forged'},{recover:true}])await assert.rejects(update({...f.request,...extra}));
    const q={...f.request},op=update(q);q.root='/forbidden';q.action='done';assert.equal((await op).changed,true);
});
for(const root of [process.cwd(),path.join(process.cwd(),'replay_logs'),'/tmp/trial','/Users/zoltanka/.local/share/pain-and-gain-evidence/backup','/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-forbidden'])test('selected log rejects nonfixture root '+root,async()=>{
    const open=fs.openSync;let n=0;fs.openSync=(...a)=>{n++;return open(...a);};try{await assert.rejects(update({synthetic:true,root,action:'claim',replayId:'a'.repeat(24),fingerprint:'0'.repeat(64),taskId:'test'}),{code:'UNSAFE_PATH'});assert.equal(n,0);}finally{fs.openSync=open;}
});
test('selected log CLI is explicit and has no production fallback',async t=>{
    const f=await fixture(t),a=cli(f);let r=spawnSync(process.execPath,a,{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).collection,'log');
    r=spawnSync(process.execPath,[...a.slice(0,3),'examined',...a.slice(4)],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const before=hashFiles(f.root);
    // Exact completion is covered by the lifecycle suite; unsupported routes remain fenced.
    for(const action of ['release','scan','import']){const bad=spawnSync(process.execPath,[...a.slice(0,3),action,...a.slice(4)],{encoding:'utf8',timeout:5000});assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stderr).code,'UNSUPPORTED_OPTION');}
    const missingScore=spawnSync(process.execPath,[...a.slice(0,3),'score-claim',...a.slice(4)],{encoding:'utf8',timeout:5000});assert.equal(missingScore.status,1);assert.equal(JSON.parse(missingScore.stderr).code,'MISSING_RECORD');
    for(const args of [['claim','--synthetic-sqlite'],['score-claim','--synthetic-sqlite'],['--synthetic-sqlite']]){const bad=spawnSync(process.execPath,['tools/replay-logs.js',...args],{encoding:'utf8',timeout:5000});assert.equal(bad.status,1);}
    assert.deepEqual(hashFiles(f.root),before);
});
for(const mode of ['begin','commit','cleanup','combined-db','combined-owner','null-owner','combined-runtime','combined-connection','combined-read'])test('selected log atomic/error boundary '+mode,t=>{
    const r=spawnSync(process.execPath,['--experimental-test-module-mocks','tests/fixtures/replay-log-review-command-faults.js',mode],{encoding:'utf8',timeout:15000});t.diagnostic(r.stderr);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).passed,true);
});
test('selected log CLI retains primitive operation and cleanup failure separately',t=>{
    const r=spawnSync(process.execPath,['--experimental-test-module-mocks','tests/fixtures/replay-log-review-command-faults.js','null-owner-cli'],{encoding:'utf8',timeout:15000});t.diagnostic(r.stderr);
    assert.equal(r.status,1);const lines=r.stderr.split('\n').filter(line=>line.startsWith('{"code":'));assert.equal(lines.length,1);
    const details=JSON.parse(lines[0]);assert.equal(details.operationFailure,null);assert(details.cleanupFailures.some(e=>e.systemCode==='ENOSPC'));
});
for(const name of ['marker','descriptor','database','-journal','-wal','-shm'])test('selected log dataless '+name+' rejects before selected open',async t=>{
    const f=await fixture(t),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),file=path.join(f.root,name==='marker'?'.storage-v3-fixture':name==='descriptor'?'manifest.json':d.database+(name==='database'?'':name));if(name.startsWith('-'))fs.writeFileSync(file,'');
    const stat=childProcess.execFileSync,open=fs.openSync;let selected=0;childProcess.execFileSync=(cmd,args,...rest)=>cmd==='/usr/bin/stat'&&args.at(-1)===file?'dataless\n':stat(cmd,args,...rest);
    fs.openSync=(p,...rest)=>{if(p===file){selected++;throw Error('premature open');}return open(p,...rest);};syncBuiltinESMExports();
    try{await assert.rejects(update(f.request),{code:'dataless-input'});assert.equal(selected,0);}finally{childProcess.execFileSync=stat;fs.openSync=open;syncBuiltinESMExports();}
});

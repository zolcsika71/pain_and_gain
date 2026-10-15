import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture,run,api,recovery,pin,hashes,db,replayId,cacheFrame,log,module} from '../fixtures/replay-rehearsal-cache-fixture.js';
import {validationFrames} from '../fixtures/replay-score-validation-fixture.js';

test('inventory scope converts, reimports, scans, writes and restores complete post-write state',async t=>{
    const f=await fixture(t,{scoreValue:validationFrames(69624)}),sources=hashes(f.parent),cache=hashes(f.cache),before=hashes(f.root);
    const classified=await api.classifyRehearsalCache({capability:f.capability,capabilitySha256:f.capabilitySha256});assert.equal(classified.admitted,0);assert.equal(classified.results[1].validationBytes,69624);
    assert.equal((await run(f,'import',{source:f.logPath})).kind,'deduplicated');const score=await run(f,'score-import',{source:f.scorePath});assert.equal(score.kind,'deduplicated');assert.equal(score.validation.expectedBytes,69624);
    const scan=await run(f,'scan');assert(scan.complete&&scan.shutdownConfirmed);assert.equal(scan.events.length,1);assert.equal(scan.events[0].event,'deduplicated');assert.deepEqual(hashes(f.root),before);
    const command=(command,options)=>api.runRehearsalCommand({root:f.root,lineageHash:f.lineageHash,command,options});
    await command('claim',{replayId,fingerprint:f.lr.fingerprint,taskId:'new/rehearsal'});await command('examined',{replayId,fingerprint:f.lr.fingerprint,taskId:'new/rehearsal'});
    const newer=path.join(f.cache,'new_0');fs.writeFileSync(newer,cacheFrame(log({tick:2}),{time:2}));f.approve(newer,['import','scan']);f.bind();assert.equal((await run(f,'import',{source:newer})).kind,'imported');
    const current=hashes(f.root);assert.equal((await run(f,'import',{source:newer})).kind,'deduplicated');assert.deepEqual(hashes(f.root),current);
    const backupRoot=f.dir('pain-gain-rehearsal-recovery-backup-'),destination=f.dir('pain-gain-rehearsal-recovery-restored-'),request={rehearsal:{lineageHash:f.lineageHash},root:f.root,backupRoot,destination,releaseHash:pin};
    const p=await recovery.prepareSqliteRecovery(request),r={rehearsal:request.rehearsal,backupRoot,destination,releaseHash:pin,receiptHash:p.receiptHash};await recovery.restoreSqliteRecovery(r);const restored=hashes(destination);await recovery.restoreSqliteRecovery(r);assert.deepEqual(hashes(destination),restored);await recovery.selectRestoredSqliteAuthority(r);
    assert.equal(db(destination,s=>s.prepare('SELECT count(*) n FROM records').get().n),3);assert.equal(db(destination,s=>s.prepare('SELECT count(*) n FROM reviews').get().n),2);
    await assert.rejects(run({...f,root:destination},'import',{source:newer}),{code:'CHANGED_BINDING'});assert.deepEqual(hashes(f.parent),sources);for(const[k,v]of Object.entries(cache))assert.equal(hashes(f.cache)[k],v);
});
for(const defect of ['hash','snapshot','release','destination','duplicate','wrong-operation','unlisted','changed','symlink','inventory-change','accessor'])test('inventory rejection is neutral: '+defect,async t=>{
    const f=await fixture(t),before=hashes(f.root);let options={source:f.logPath};
    if(defect==='hash')f.capabilitySha256='f'.repeat(64);
    if(defect==='snapshot'){f.cap.snapshot.receiptSha256='f'.repeat(64);f.bind();}
    if(defect==='release'){f.cap.releaseHash='f'.repeat(64);f.bind();}
    if(defect==='destination'){f.cap.destination=f.dir('pain-gain-backup-rehearsal-');f.bind();}
    if(defect==='duplicate'){f.cap.files.push(f.cap.files[0]);f.bind();}
    if(defect==='wrong-operation')options.source=f.scorePath;
    if(defect==='unlisted'){options.source=path.join(f.cache,'unlisted_0');fs.writeFileSync(options.source,fs.readFileSync(f.logPath));}
    if(defect==='changed')fs.appendFileSync(f.logPath,' ');
    if(defect==='symlink'){options.source=path.join(f.cache,'alias_0');fs.symlinkSync(f.logPath,options.source);f.cap.files.push({...f.cap.files[0],path:options.source});f.bind();}
    if(defect==='inventory-change')fs.appendFileSync(f.capability,' ');
    if(defect==='accessor'){let invoked=0;options={get source(){invoked++;return f.logPath;}};await assert.rejects(api.runRehearsalCommand({root:f.root,lineageHash:f.lineageHash,command:'import',options}));assert.equal(invoked,0);}
    else await assert.rejects(run(f,'import',options));assert.deepEqual(hashes(f.root),before);
});
test('private options, concurrency and cancellation preserve duplicate generation and owners',async t=>{
    const f=await fixture(t),before=hashes(f.root),q={root:f.root,lineageHash:f.lineageHash,command:'import',options:{source:f.logPath,capability:f.capability,capabilitySha256:f.capabilitySha256}};
    const call=api.runRehearsalCommand(q);q.options.source='/unlisted';q.root='/wrong';await call;
    await Promise.all([run(f,'import',{source:f.logPath}),run(f,'score-import',{source:f.scorePath})]);
    const abort=new AbortController();abort.abort();const stopped=await run(f,'scan',{}, {signal:abort.signal});assert.equal(stopped.stopReason,'cancelled');assert.equal(stopped.shutdownConfirmed,true);
    await assert.rejects(run(f,'scan',{limits:{cycleBytes:1}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(hashes(f.root),before);
});
for(const boundary of ['output','validation'])test('approved source recovers interrupted '+boundary+' publication',async t=>{
    const f=await fixture(t),file=path.join(f.cache,'new_score_0');fs.writeFileSync(file,cacheFrame(validationFrames(69624),{collection:'score',time:3}));f.approve(file,['score-import']);f.bind();
    const link=fs.linkSync;let fired=false;fs.linkSync=(a,b)=>{if(!fired&&(boundary==='output'?String(b).endsWith('.response'):String(b).includes('/extensions/'))){fired=true;throw Object.assign(Error('retained interruption'),{code:'EIO'});}return link(a,b);};
    try{await assert.rejects(run(f,'score-import',{source:file}),{code:'EIO'});}finally{fs.linkSync=link;}assert(fired);
    const r=await run(f,'score-import',{source:file});assert.equal(r.validation.expectedBytes,69624);const state=hashes(f.root);await run(f,'score-import',{source:file});assert.deepEqual(hashes(f.root),state);
});
test('classification capability cannot authorize writes or a forged token',async t=>{
    const f=await fixture(t),scope=await module('replay-rehearsal-cache-scope'),imports=await module('replay-import-command-fixture'),before=hashes(f.root);
    const token=scope.authorizeRehearsalCache(undefined,{capability:f.capability,capabilitySha256:f.capabilitySha256},'classify');
    await assert.rejects(async()=>imports.importRehearsalCache(token,f.logPath,'log'),{code:'UNSUPPORTED_OPTION'});await assert.rejects(async()=>imports.importRehearsalCache({},f.logPath,'log'),{code:'INVALID_REHEARSAL_SCOPE'});assert.deepEqual(hashes(f.root),before);
});
test('changed source during publication rejects and exact pinned source can recover',async t=>{
    const f=await fixture(t),file=path.join(f.cache,'new_0'),bytes=cacheFrame(log({tick:3}),{time:3});fs.writeFileSync(file,bytes);f.approve(file,['import','scan']);f.bind();
    const link=fs.linkSync;let fired=false;fs.linkSync=(a,b)=>{const r=link(a,b);if(!fired&&String(b).endsWith('.jsonl')){fired=true;fs.appendFileSync(file,' ');}return r;};
    try{await assert.rejects(run(f,'import',{source:file}),{code:'CHANGED_INPUT'});}finally{fs.linkSync=link;}assert(fired);
    const partial=hashes(f.root);await assert.rejects(run(f,'scan'),{code:'CHANGED_INPUT'});assert.deepEqual(hashes(f.root),partial);
    fs.writeFileSync(file,bytes);const result=await run(f,'scan');assert(result.recovered&&result.complete);const done=hashes(f.root);await run(f,'scan');assert.deepEqual(hashes(f.root),done);
});
test('post-link interruption stays fenced with all artifacts retained',async t=>{
    const f=await fixture(t),file=path.join(f.cache,'new_0');fs.writeFileSync(file,cacheFrame(log({tick:4}),{time:4}));f.approve(file,['import']);f.bind();const link=fs.linkSync;let fired=false;
    fs.linkSync=(a,b)=>{link(a,b);if(!fired&&String(b).endsWith('.jsonl')){fired=true;throw Object.assign(Error('post-link crash'),{code:'EIO'});}};
    try{await assert.rejects(run(f,'import',{source:file}),{code:'EIO'});}finally{fs.linkSync=link;}assert(fired);const before=hashes(f.root);await assert.rejects(run(f,'import',{source:file}),{code:'UNSAFE_PATH'});assert.deepEqual(hashes(f.root),before);
});
test('source read error retains its system code alongside close failure',async t=>{
    const f=await fixture(t),before=hashes(f.root),open=fs.openSync,read=fs.readSync,close=fs.closeSync,targets=new Set();
    fs.openSync=(file,...args)=>{const fd=open(file,...args);if(file===f.logPath)targets.add(fd);return fd;};fs.readSync=(fd,...args)=>{if(targets.has(fd))throw Object.assign(Error('read'),{code:'EIO'});return read(fd,...args);};fs.closeSync=fd=>{const fail=targets.delete(fd);close(fd);if(fail)throw Object.assign(Error('close'),{code:'ENOSPC'});};
    try{await assert.rejects(run(f,'import',{source:f.logPath}),e=>e.code==='EIO'&&e.cleanupFailures?.some(c=>c.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}assert.deepEqual(hashes(f.root),before);
});
for(const defect of ['empty','oversized-file','duplicate-operation','unsupported-operation','unbounded-capacity','unknown-field'])test('classification rejects malformed finite inventory '+defect,async t=>{
    const f=await fixture(t,{convert:false}),before=hashes(f.cache);
    if(defect==='empty')f.cap.files=[];
    if(defect==='oversized-file')f.cap.files[0].bytes=1048577;
    if(defect==='duplicate-operation')f.cap.files[0].operations.push('import');
    if(defect==='unsupported-operation')f.cap.operations.push('done');
    if(defect==='unbounded-capacity')f.cap.cacheCapacity={...f.cap.cacheCapacity,files:9007199254740991};
    if(defect==='unknown-field')f.cap.inferIdentities=true;
    f.bind();await assert.rejects(api.classifyRehearsalCache({capability:f.capability,capabilitySha256:f.capabilitySha256}));assert.deepEqual(hashes(f.cache),before);assert.deepEqual(fs.readdirSync(f.root),[]);
});

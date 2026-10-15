import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {importSyntheticCache as admit} from '../../tools/replay-import-command-fixture.js';
import {importCacheFile,importScoreCacheFile,parseCacheEntry,parseScoreCacheEntry} from '../../tools/replay-logs.js';
import {analyzeReplay} from '../../tools/replay-analysis.js';
import {analyzeSyntheticReplay} from '../../tools/replay-analysis-command-fixture.js';
import {buildSyntheticHistoricalIndex,screenSyntheticReplay} from '../../tools/replay-evidence-consumers-fixture.js';
import {updateSyntheticLogReview,updateSyntheticScoreReview} from '../../tools/replay-log-review-fixture.js';
import {recordKey} from '../../tools/replay-store.js';
import {fixture,fixedTime,log,frames,cacheFrame,replayId,buildId} from '../fixtures/replay-import-command-fixture.js';
import {logical,hashFiles,database} from '../fixtures/replay-log-review-command-fixture.js';
const original=q=>fs.readFileSync(path.join(q.sourceRoot,q.sourceFile));
const parsed=q=>(q.collection==='log'?parseCacheEntry:parseScoreCacheEntry)(original(q));
async function rejectUnchanged(f,q,code){const rows=logical(f.root),files=hashFiles(f.root);await assert.rejects(admit(q),code?{code}:undefined);assert.deepEqual(logical(f.root),rows);assert.deepEqual(hashFiles(f.root),files);}
async function basic(t){const f=await fixture(t),q=f.write('log_0',log());const r=await fixedTime(()=>admit(q));return{...f,q,r};}
test('log then frame/metadata score import parity: all record fields, links, order and bytes',async t=>{
    const f=await fixture(t),queries=[f.write('log_0',log()),f.write('score_0',frames(),{collection:'score',time:2}),f.write('metadata_0',{players:['ours','opponent'],_id:replayId},{collection:'score',time:null})];
    await fixedTime(async()=>{for(const q of queries){const sqlite=await admit(q),v2=await(q.collection==='log'?importCacheFile:importScoreCacheFile)(f.v2,path.join(q.sourceRoot,q.sourceFile));assert.deepEqual(sqlite.record,v2.record);assert.deepEqual(Object.keys(sqlite.record),Object.keys(v2.record));assert.deepEqual(fs.readFileSync(path.join(f.root,sqlite.record.outputPath)),fs.readFileSync(path.join(f.v2,'replay_logs',v2.record.outputPath)));}});
    const records=JSON.parse(fs.readFileSync(path.join(f.v2,'replay_logs/manifest.json'))),logs=records.records.map(r=>r.fingerprint),scores=records.scoreRecords.map(r=>r.fingerprint);
    const a=await analyzeSyntheticReplay({synthetic:true,root:f.root,replayId,fingerprints:logs,scoreFingerprints:scores,reportMode:'compact'}),b=analyzeReplay({root:f.v2,replayId,fingerprints:logs,scoreFingerprints:scores,reportMode:'compact'});assert.deepEqual(a,b);
    assert.deepEqual(f.store.pageRecords({collection:'score'}).rows.map(r=>r.fingerprint),scores);
});
test('duplicate imports are generation-neutral and preserve existing review rows and unrelated records',async t=>{
    const f=await basic(t),second=f.write('second_0',log({tick:2,map:false}),{time:2});await admit(second);
    const q={synthetic:true,root:f.root,replayId,fingerprint:f.r.record.fingerprint,taskId:'codex/import-check',action:'claim'};await updateSyntheticLogReview(q);await updateSyntheticLogReview({...q,action:'examined'});
    const rows=logical(f.root),files=hashFiles(f.root);const result=await admit(f.q);assert.equal(result.kind,'deduplicated');assert.deepEqual(logical(f.root),rows);assert.deepEqual(hashFiles(f.root),files);
});
test('mapless log defers without creating records or checkpoints',async t=>{
    const f=await fixture(t),q=f.write('deferred_0',log({map:false})),before=logical(f.root);assert.equal((await admit(q)).kind,'deferred');assert.deepEqual(logical(f.root),before);
});
test('map-only and diagnostic-only imports preserve distinct states and resume',async t=>{
    const f=await fixture(t),map=f.write('map_0',log({game:false,diagnostics:false}));assert.equal((await admit(map)).kind,'mapped');assert.equal(f.store.entityCounts().records,0);
    const q=f.write('evidence_0',log({map:false,game:false,tick:2}),{time:2}),r=await admit(q);assert.equal(r.record.outputPath,null);assert.equal(r.record.status,'claim');assert.deepEqual(r.record.otherEntries,parsed(q).otherEntries);
    const before=logical(f.root);assert.equal((await admit(q)).kind,'deduplicated');assert.deepEqual(logical(f.root),before);
});
for(const variant of ['map','build'])test('conflicting '+variant+' rejects before mutation',async t=>{
    const f=await basic(t);const q=f.write('conflict_0',log(variant==='map'?{terrain:1}:{tag:'c'.repeat(64)}));await rejectUnchanged(f,q,'IDENTITY_CONFLICT');
});
test('output collision skips unowned files without adoption or replacement',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),p=parsed(q);fs.writeFileSync(path.join(f.root,replayId+'.jsonl'),'unowned');const r=await admit(q);assert.equal(r.record.outputPath,`${replayId}-${p.fingerprint.slice(0,12)}.jsonl`);assert.equal(fs.readFileSync(path.join(f.root,replayId+'.jsonl'),'utf8'),'unowned');
    const score=f.write('score_0',frames(),{collection:'score',time:2}),sp=parsed(score),name=`replay-score-source-${replayId}-${sp.fingerprint.slice(0,12)}.response`;fs.writeFileSync(path.join(f.root,name),sp.body);const sr=await admit(score);assert.equal(sr.record.outputPath,`replay-score-source-${replayId}-${sp.fingerprint}.response`);assert.deepEqual(fs.readFileSync(path.join(f.root,name)),sp.body);
});
for(const variant of ['raw','crc','status','version','gzip','nonstring'])test('unsupported/corrupt '+variant+' transport leaves store unchanged',async t=>{
    const f=await fixture(t),q=f.write('bad_0',variant==='nonstring'?{1:{type:'game-state'}}:log(),{version:variant==='version'?6:5,status:variant==='status'?403:200});
    if(variant==='raw')fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),JSON.stringify(log()));
    if(variant==='crc'||variant==='gzip'){const b=original(q);b[24+b.readUInt32LE(12)+(variant==='gzip'?0:12)]^=255;fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),b);}
    await rejectUnchanged(f,q);
});
for(const collection of ['log','score'])test('interrupted '+collection+' publication recovers exact bytes through repeated imports',async t=>{
    const f=collection==='log'?await fixture(t):await basic(t),q=f.write('interrupted_0',collection==='log'?log():frames(),{collection,time:2}),link=fs.linkSync;let fired=false;
    fs.linkSync=(a,b)=>{link(a,b);if(!fired&&String(b).endsWith(collection==='log'?'.jsonl':'.response')&&!String(b).includes('/diagnostics/')){fired=true;throw Object.assign(Error('interrupted'),{code:'EIO'});}};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.linkSync=link;}
    assert.ok(fired);assert.equal(f.store.getRecord({collection,replayId,fingerprint:parsed(q).fingerprint}).status,'pending');
    const r=await admit(q);assert.equal(r.record.status,'claim');const rows=logical(f.root),files=hashFiles(f.root);assert.equal((await admit(q)).kind,'deduplicated');assert.deepEqual(logical(f.root),rows);assert.deepEqual(hashFiles(f.root),files);
});
test('changed pending source rejects and retains every incomplete artifact',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),write=fs.writeSync;let fired=false;fs.writeSync=(fd,...args)=>{if(!fired){fired=true;throw Object.assign(Error('write'),{code:'EIO'});}return write(fd,...args);};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.writeSync=write;}
    const b=original(q);b[16]^=1;fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),b);await rejectUnchanged(f,q,'CHANGED_INPUT');
});
test('corrupted reserved output metadata cannot become a completed import',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),write=fs.writeSync;let calls=0;fs.writeSync=(fd,...args)=>{if(++calls===2)throw Object.assign(Error('write'),{code:'EIO'});return write(fd,...args);};try{await assert.rejects(admit(q));}finally{fs.writeSync=write;}
    const k={collection:'log',replayId,fingerprint:parsed(q).fingerprint};if(f.store.getRecord(k).kind==='missing'){await admit(q);}
    database(f.root,db=>db.prepare('UPDATE outputs SET hash=? WHERE fingerprint=?').run('f'.repeat(64),k.fingerprint));await rejectUnchanged(f,q,'INVALID_REFERENCE');
});
test('protected roots, input aliases, accessors and reduced parser limits reject',async t=>{
    const f=await fixture(t),q=f.write('log_0',log());await rejectUnchanged(f,{...q,root:process.cwd()},'UNSAFE_PATH');await rejectUnchanged(f,{...q,sourceRoot:process.cwd()},'UNSAFE_PATH');await rejectUnchanged(f,{...q,sourceFile:'../manifest.json'},'UNSAFE_PATH');
    let n=0;await rejectUnchanged(f,{...q,get sourceRoot(){n++;return f.sourceRoot;}},'INVALID_ARGUMENT');assert.equal(n,0);
    const linked=path.join(f.sourceRoot,'alias_0');fs.symlinkSync(path.join(f.sourceRoot,'log_0'),linked);await rejectUnchanged(f,{...q,sourceFile:'alias_0'});
    assert.throws(()=>parseCacheEntry(original(q),{maxDecodedBytes:Infinity}));assert.notEqual(parseCacheEntry(original(q),{maxDecodedBytes:10}).kind,'log');
});
test('source read EIO keeps separate close ENOSPC',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),file=path.join(f.sourceRoot,q.sourceFile),open=fs.openSync,read=fs.readSync,close=fs.closeSync;let selected;
    fs.openSync=(p,...a)=>{const fd=open(p,...a);if(p===file)selected=fd;return fd;};fs.readSync=(fd,...a)=>{if(fd===selected)throw Object.assign(Error('read'),{code:'EIO'});return read(fd,...a);};fs.closeSync=fd=>{close(fd);if(fd===selected)throw Object.assign(Error('close'),{code:'ENOSPC'});};
    try{await assert.rejects(admit(q),e=>e.code==='EIO'&&e.cleanupFailures?.[0].systemCode==='ENOSPC');}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}
});
test('existing checkpoint and read-only commands work on admitted records',async t=>{
    const f=await basic(t),sq=f.write('score_0',frames(),{collection:'score',time:2}),sr=await admit(sq),taskId='codex/import-commands';
    for(const [collection,r]of [['log',f.r],['score',sr]]){const update=collection==='log'?updateSyntheticLogReview:updateSyntheticScoreReview,q={synthetic:true,root:f.root,replayId,fingerprint:r.record.fingerprint,taskId,action:'claim'};await update(q);await update({...q,action:'examined'});}
    const state=logical(f.root),files=hashFiles(f.root);const result=await analyzeSyntheticReplay({synthetic:true,root:f.root,replayId,fingerprints:[f.r.record.fingerprint],scoreFingerprints:[sr.record.fingerprint],reportMode:'compact'});assert.equal(result.evidenceSummary.trustedLogRecords,1);
    const selection={version:1,taskId,matches:[{replayId,logFingerprints:[f.r.record.fingerprint],scoreFingerprints:[sr.record.fingerprint],opponent:'synthetic',configuration:{label:'synthetic',basis:'fixture',expectedBuildId:buildId}}]};
    assert.equal((await buildSyntheticHistoricalIndex({synthetic:true,root:f.root,selection})).matches[0].status,'analyzed');
    assert.equal((await screenSyntheticReplay({synthetic:true,root:f.root,replayId,taskId,expectedBuildId:buildId,fingerprints:[f.r.record.fingerprint]})).cache,'disabled');assert.deepEqual(logical(f.root),state);assert.deepEqual(hashFiles(f.root),files);
});
test('explicit synthetic import CLI is guarded and ordinary module imports remain SQLite-free',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),r=spawnSync(process.execPath,['tools/replay-logs.js','--synthetic-sqlite',f.root,'import',f.sourceRoot,q.sourceFile],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).kind,'imported');
    const plain=spawnSync(process.execPath,['--input-type=module','-e',`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){if(s==='node:sqlite')throw Error('unexpected SQLite');return next(s,c);}});await import('./tools/replay-logs.js');`],{encoding:'utf8',timeout:5000});assert.equal(plain.status,0,plain.stderr);
});
test('legacy unknown log provenance stays null when association later becomes known',async t=>{
    const f=await fixture(t),legacy=f.write('legacy_0',log({tag:undefined,diagnostics:false}));
    // Undefined passed to a default parameter selects its default; explicitly
    // remove source tags from independently generated synthetic console strings.
    const values=log({diagnostics:false});values[1]=values[1].split('\n').map(s=>{const v=JSON.parse(s);delete v.buildId;return JSON.stringify(v);}).join('\n');fs.writeFileSync(path.join(f.sourceRoot,legacy.sourceFile),cacheFrame(values));
    const first=await admit(legacy);assert.equal(first.record.buildId,null);
    const known=f.write('known_0',log({map:false,tick:2}),{time:2});await admit(known);assert.equal(f.store.getReplay(replayId).build_id,buildId);
    const before=logical(f.root);assert.equal((await admit(legacy)).record.buildId,null);assert.deepEqual(logical(f.root),before);
});
test('repeat reconstructs original unknown properties and relational reviews without overwriting them',async t=>{
    const f=await basic(t),key={collection:'log',replayId,fingerprint:f.r.record.fingerprint},taskId='codex/import-original';await updateSyntheticLogReview({synthetic:true,root:f.root,replayId,fingerprint:key.fingerprint,taskId,action:'claim'});
    await f.store.withWriter(w=>w.transaction(tx=>{
        tx.setProperty({owner:{kind:'record',key:recordKey(key)},pointer:'/extension',ordinal:64,value:{nil:null,no:false,order:[3,1]}});
        tx.setProperty({owner:{kind:'review',key:JSON.stringify([recordKey(key),taskId])},pointer:'/unknown',ordinal:3,value:{order:[2,1],nil:null}});
    }));const before=logical(f.root),r=await admit(f.q);assert.deepEqual(r.record.extension,{nil:null,no:false,order:[3,1]});assert.deepEqual(r.record.reviews[taskId].unknown,{order:[2,1],nil:null});assert.deepEqual(logical(f.root),before);
});
test('equivalent transport at a different synthetic path deduplicates while retaining first provenance',async t=>{
    const f=await basic(t),q=f.write('equivalent_0',log());const before=logical(f.root),r=await admit(q);assert.equal(r.kind,'deduplicated');assert.equal(r.record.sourceEntry,f.r.record.sourceEntry);assert.deepEqual(logical(f.root),before);
});
test('changed pending body cannot sidestep the original commitment with a new fingerprint',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),write=fs.writeSync;fs.writeSync=()=>{throw Object.assign(Error('interruption'),{code:'EIO'});};try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.writeSync=write;}
    fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),cacheFrame(log({tick:2})));await rejectUnchanged(f,q,'CHANGED_INPUT');
});
for(const corruption of ['encoding','child','ordinal','body','checkpoint-path'])test('completed '+corruption+' corruption rejects without repair',async t=>{
    const f=await basic(t),key=recordKey({collection:'log',replayId,fingerprint:f.r.record.fingerprint});
    if(corruption==='body')fs.appendFileSync(path.join(f.root,f.r.record.outputPath),'!');else database(f.root,db=>{
        if(corruption==='encoding'){db.exec('PRAGMA ignore_check_constraints=ON');db.prepare("UPDATE payloads SET encoding='json-v1' WHERE owner_key=?").run(key);}
        if(corruption==='ordinal')db.prepare('UPDATE records SET ordinal=9 WHERE key=?').run(key);
        if(corruption==='child'){const p=db.prepare('SELECT * FROM payloads WHERE owner_key=?').get(key);db.prepare('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(p.owner_kind,p.owner_key,p.pointer+'/unexpected',p.pointer,p.role,p.path+'.missing',p.hash,1,null,'ready',8,p.encoding);}
        if(corruption==='checkpoint-path'){const p=db.prepare("SELECT * FROM properties WHERE owner_kind='root'").get(),v=JSON.parse(p.value);v.output.path='../forbidden.jsonl';db.prepare("UPDATE properties SET value=? WHERE owner_kind='root' AND pointer=?").run(JSON.stringify(v),p.pointer);}
    });await rejectUnchanged(f,f.q);
});
test('source and decoded limits and finite tick spans reject without mutation',async t=>{
    const f=await fixture(t),q=f.write('oversize_0',log());fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),Buffer.alloc(1048577));await rejectUnchanged(f,q,'RESOURCE_LIMIT');
    fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),cacheFrame({1:'x'.repeat(4194305)}));await rejectUnchanged(f,q,'UNSUPPORTED_TRANSPORT');
    const v=log({map:false,tick:1,diagnostics:false}),other=log({map:false,tick:10002,diagnostics:false});fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),cacheFrame({1:v[1],10002:other[10002]}));await rejectUnchanged(f,q,'UNSUPPORTED_TRANSPORT');
    fs.writeFileSync(path.join(f.sourceRoot,q.sourceFile),cacheFrame(Buffer.from([123,34,49,34,58,34,255,34,125])));await rejectUnchanged(f,q,'UNSUPPORTED_TRANSPORT');
});
test('claim binding and claimedAt corruption cannot bypass read-only consumer gates',async t=>{
    const f=await basic(t),taskId='codex/import-binding',key={collection:'log',replayId,fingerprint:f.r.record.fingerprint};await updateSyntheticLogReview({synthetic:true,root:f.root,replayId,fingerprint:key.fingerprint,taskId,action:'claim'});
    const owner=JSON.stringify([recordKey(key),taskId]);database(f.root,db=>db.prepare('UPDATE reviews SET owner_key=? WHERE owner_key=?').run('forged',owner));
    const rows=logical(f.root);await assert.rejects(screenSyntheticReplay({synthetic:true,root:f.root,replayId,taskId,expectedBuildId:buildId,fingerprints:[key.fingerprint]}),{code:'OWNERSHIP_CONFLICT'});assert.deepEqual(logical(f.root),rows);
});
test('map write EIO retains separate close ENOSPC and no ready record',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),open=fs.openSync,write=fs.writeSync,close=fs.closeSync;let selected;
    fs.openSync=(p,...a)=>{const fd=open(p,...a);if(typeof p==='string'&&p.startsWith(path.join(f.root,'pain_and_gain_map_'))&&p.endsWith('.pending'))selected=fd;return fd;};
    fs.writeSync=(fd,...a)=>{if(fd===selected)throw Object.assign(Error('write'),{code:'EIO'});return write(fd,...a);};fs.closeSync=fd=>{close(fd);if(fd===selected)throw Object.assign(Error('close'),{code:'ENOSPC'});};
    try{await assert.rejects(admit(q),e=>e.code==='EIO'&&e.cleanupFailures?.[0].systemCode==='ENOSPC');}finally{fs.openSync=open;fs.writeSync=write;fs.closeSync=close;}
    assert.equal(f.store.entityCounts().records,0);assert.equal(f.store.entityCounts().maps,0);
});
test('interrupted diagnostic-only prepublication remains record-free until exact recovery',async t=>{
    const f=await fixture(t);await admit(f.write('map_0',log({game:false,diagnostics:false})));const q=f.write('diagnostics_0',log({map:false,game:false,tick:2}),{time:2}),link=fs.linkSync;let interrupted=false;
    fs.linkSync=(a,b)=>{link(a,b);if(!interrupted&&String(b).includes('/diagnostics/')){interrupted=true;throw Object.assign(Error('interruption'),{code:'EIO'});}};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.linkSync=link;}
    assert.ok(interrupted);assert.equal(f.store.entityCounts().records,0);assert.equal((await admit(q)).record.outputPath,null);assert.equal((await admit(q)).kind,'deduplicated');
});
test('concurrent exact imports produce one ready record and a no-op duplicate',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),results=await Promise.all([admit(q),admit(q)]);assert.deepEqual(results.map(r=>r.kind).sort(),['deduplicated','imported']);assert.equal(f.store.entityCounts().records,1);assert.equal(f.store.pageOperations().rows.length,0);
});
test('store count and unsupported collection-presence gates precede checkpoint mutation',async t=>{
    const f=await basic(t);await f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'collection',key:'scoreRecords',ordinal:0,value:{present:false}})));
    await rejectUnchanged(f,f.write('score_0',frames(),{collection:'score',time:2}),'UNSUPPORTED_REPRESENTATION');
});
test('claim null projections remain supported but forged inline claims reject',async t=>{
    const f=await basic(t),taskId='codex/import-null-projection',key={collection:'log',replayId,fingerprint:f.r.record.fingerprint};await updateSyntheticLogReview({synthetic:true,root:f.root,replayId,fingerprint:key.fingerprint,taskId,action:'claim'});await updateSyntheticLogReview({synthetic:true,root:f.root,replayId,fingerprint:key.fingerprint,taskId,action:'examined'});
    const q={synthetic:true,root:f.root,replayId,taskId,expectedBuildId:buildId,fingerprints:[key.fingerprint]},rows=logical(f.root);assert.equal((await screenSyntheticReplay(q)).cache,'disabled');assert.deepEqual(logical(f.root),rows);
    database(f.root,db=>db.prepare('UPDATE reviews SET value=? WHERE task=?').run(JSON.stringify({claimedAt:'forged'}),taskId));const corrupted=logical(f.root);await assert.rejects(screenSyntheticReplay(q),{code:'INVALID_REFERENCE'});assert.deepEqual(logical(f.root),corrupted);
});
test('uncompleted import fences other selected imports, preserving committed append order',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),write=fs.writeSync;fs.writeSync=()=>{throw Object.assign(Error('interruption'),{code:'EIO'});};try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.writeSync=write;}
    const second=f.write('second_0',log({map:false,tick:2}),{time:2});await rejectUnchanged(f,second,'NOT_READY');await admit(q);await admit(second);assert.deepEqual(f.store.pageRecords({collection:'log'}).rows.map(r=>Number(r.ordinal)),[0,1]);
});
test('corrupt publication-intent hash is rejected before any repair or readiness update',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),link=fs.linkSync;let fired=false;fs.linkSync=(a,b)=>{link(a,b);if(!fired&&String(b).endsWith('.jsonl')){fired=true;throw Object.assign(Error('interruption'),{code:'EIO'});}};try{await assert.rejects(admit(q));}finally{fs.linkSync=link;}
    database(f.root,db=>db.prepare('UPDATE operation_files SET hash=? WHERE ordinal=0').run('f'.repeat(64)));await rejectUnchanged(f,q,'INVALID_REFERENCE');
});
test('claimed record property-order corruption rejects without normalization',async t=>{
    const f=await basic(t);database(f.root,db=>db.prepare("UPDATE properties SET ordinal=60 WHERE owner_kind='record' AND pointer='/sourceKey'").run());await rejectUnchanged(f,f.q,'INVALID_REFERENCE');
});
test('import option snapshots remain stable across await boundaries',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),op=admit(q);q.root='/forbidden';q.sourceRoot='/forbidden';q.sourceFile='not-cache';q.collection='score';assert.equal((await op).kind,'imported');
});
test('score CLI dispatch and equivalent alternate transport preserve the first cache receipt',async t=>{
    const f=await basic(t),q=f.write('score_0',frames(),{collection:'score',time:2}),r=spawnSync(process.execPath,['tools/replay-logs.js','--synthetic-sqlite',f.root,'score-import',f.sourceRoot,q.sourceFile],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);const first=JSON.parse(r.stdout);
    const q2=f.write('score-copy_0',frames(),{collection:'score',time:2}),before=logical(f.root);const result=await admit(q2);assert.equal(result.record.sourceEntry,first.record.sourceEntry);assert.equal(result.record.cacheEntryFingerprint,first.record.cacheEntryFingerprint);assert.deepEqual(logical(f.root),before);
});
test('published state survives a failed verification checkpoint and exact resume',async t=>{
    const f=await fixture(t),q=f.write('log_0',log()),prepare=DatabaseSync.prototype.prepare;let rejected=false;
    DatabaseSync.prototype.prepare=function(sql){const statement=prepare.call(this,sql);if(sql.startsWith('INSERT INTO properties VALUES')){const run=statement.run.bind(statement);statement.run=(...args)=>{
        if(!rejected&&args[0]==='root'&&typeof args[2]==='string'&&args[2].startsWith('/syntheticCacheImportV1/')&&JSON.parse(args[4]).phase==='verified'){rejected=true;throw Object.assign(Error('verification checkpoint'),{code:'EIO'});}return run(...args);
    };}return statement;};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{DatabaseSync.prototype.prepare=prepare;}
    assert.ok(rejected);const p=f.store.pageProperties({kind:'root',key:'root'}).rows[0];assert.equal(JSON.parse(p.value).phase,'published');assert.equal(f.store.pageOperations().rows.length,0);
    const before=hashFiles(f.root),r=await admit(q);assert.equal(r.kind,'deduplicated');for(const[name,hash]of Object.entries(before))if(name.endsWith('.jsonl')||name.startsWith('pain_and_gain_map_'))assert.equal(hashFiles(f.root)[name],hash);
    assert.equal(JSON.parse(f.store.pageProperties({kind:'root',key:'root'}).rows[0].value).phase,'verified');
});
test('verified source-cache commitment corruption rejects an original-path repeat',async t=>{
    const f=await basic(t);database(f.root,db=>{const p=db.prepare("SELECT * FROM properties WHERE owner_kind='root'").get(),value=JSON.parse(p.value);value.source.cacheHash='f'.repeat(64);db.prepare("UPDATE properties SET value=? WHERE owner_kind='root' AND pointer=?").run(JSON.stringify(value),p.pointer);});
    await rejectUnchanged(f,f.q,'CHANGED_INPUT');const alternate=f.write('alternate_0',log());await rejectUnchanged(f,alternate,'CHANGED_INPUT');
});

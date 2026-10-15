// Newly generated retained fixtures only; no protected evidence or lifecycle cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {importSyntheticCache as admit} from '../../tools/replay-import-command-fixture.js';
import {importScoreCacheFile,parseScoreCacheEntry} from '../../tools/replay-logs.js';
import {analyzeReplay} from '../../tools/replay-analysis.js';
import {analyzeSyntheticReplay} from '../../tools/replay-analysis-command-fixture.js';
import {updateSyntheticScoreReview} from '../../tools/replay-log-review-fixture.js';
import {recordKey} from '../../tools/replay-store.js';
import {fixture,fixedTime,frames,cacheFrame,log,replayId} from '../fixtures/replay-import-command-fixture.js';
import {logical,hashFiles,database} from '../fixtures/replay-log-review-command-fixture.js';
const parse=q=>parseScoreCacheEntry(fs.readFileSync(path.join(q.sourceRoot,q.sourceFile)));
const checkpoint=f=>JSON.parse(f.store.pageProperties({kind:'root',key:'root'}).rows.find(r=>r.pointer.startsWith('/syntheticCacheImportV1/')).value);
function absent(f){assert.equal(f.store.getReplay(replayId).kind,'missing');assert.equal(f.store.entityCounts().maps,0);assert.equal(f.store.entityCounts().replays,0);}
async function unchanged(f,operation,code){const before=logical(f.root),files=hashFiles(f.root);await assert.rejects(operation,code?{code}:undefined);assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);}
for(const [kind,value,time] of [['frames',frames(),2],['metadata',{_id:replayId,players:['ours','opponent']},null],['invalid-json',Buffer.from('{'),2]])
test('map-independent score parity '+kind,async t=>{
    const f=await fixture(t),q=f.write('score_0',value,{collection:'score',time});
    const [a,b]=await fixedTime(async()=>[await admit(q),await importScoreCacheFile(f.v2,path.join(q.sourceRoot,q.sourceFile))]);
    assert.deepEqual(a.record,b.record);assert.deepEqual(Object.keys(a.record),Object.keys(b.record));assert.equal(a.record.mapId,null);assert.equal(a.record.embeddedBuildId,null);assert.ok(!Object.hasOwn(a.record,'buildId'));absent(f);
    assert.deepEqual(fs.readFileSync(path.join(f.root,a.record.outputPath)),parse(q).body);
    assert.deepEqual(fs.readFileSync(path.join(f.root,a.record.outputPath)),fs.readFileSync(path.join(f.v2,'replay_logs',b.record.outputPath)));
    const cp=checkpoint(f);assert.equal(cp.phase,'verified');assert.equal(cp.map,null);assert.equal(cp.replay,null);assert.equal(cp.mapOrdinal,null);assert.equal(cp.replayOrdinal,null);
    const before=logical(f.root),files=hashFiles(f.root);assert.equal((await admit(q)).kind,'deduplicated');assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);
});
test('map-independent reviews and score readers preserve provenance, unknown fields and unrelated state',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),first=await admit(q),key={collection:'score',replayId,fingerprint:first.record.fingerprint},taskId='codex/map-independent';
    const request={synthetic:true,root:f.root,replayId,fingerprint:key.fingerprint,taskId,action:'claim'};
    await updateSyntheticScoreReview(request);await updateSyntheticScoreReview({...request,action:'examined'});
    await f.store.withWriter(w=>w.transaction(tx=>{
        tx.setProperty({owner:{kind:'record',key:recordKey(key)},pointer:'/extension',ordinal:64,value:{nil:null,no:false,order:[3,1]}});
        tx.setProperty({owner:{kind:'review',key:JSON.stringify([recordKey(key),taskId])},pointer:'/extension',ordinal:3,value:[null,false,3]});
    }));
    const second=f.write('other_0',frames(),{collection:'score',time:3,id:'c'.repeat(24)});await admit(second);
    const before=logical(f.root),files=hashFiles(f.root),repeat=await admit(q);assert.equal(repeat.record.sourceEntry,first.record.sourceEntry);assert.deepEqual(repeat.record.extension,{nil:null,no:false,order:[3,1]});assert.deepEqual(repeat.record.reviews[taskId].extension,[null,false,3]);
    assert.equal((await updateSyntheticScoreReview({...request,action:'examined'})).changed,false);
    const a=await analyzeSyntheticReplay({synthetic:true,root:f.root,replayId,scoreFingerprints:[key.fingerprint],reportMode:'compact'});
    // Independent v2 comparison uses a clean original without SQL-only extensions.
    await importScoreCacheFile(f.v2,path.join(q.sourceRoot,q.sourceFile));
    const b=analyzeReplay({root:f.v2,replayId,scoreFingerprints:[key.fingerprint],reportMode:'compact'});assert.deepEqual(a,b);
    await assert.rejects(f.store.withReadSnapshot({recordKeys:[key]},()=>{}),{code:'UNAVAILABLE'});
    assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);absent(f);
});
for(const phase of ['prepared','reserved','published'])test('map-independent interrupted '+phase+' recovery is exact and repeatable',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),prepare=DatabaseSync.prototype.prepare,link=fs.linkSync;let hit=false;
    if(phase==='reserved')fs.linkSync=(a,b)=>{link(a,b);if(!hit&&String(b).endsWith('.response')){hit=true;throw Object.assign(Error('publication interruption'),{code:'EIO'});}};
    else DatabaseSync.prototype.prepare=function(sql){const s=prepare.call(this,sql);if(sql.startsWith('INSERT INTO properties VALUES')){const run=s.run.bind(s);s.run=(...args)=>{if(!hit&&args[0]==='root'&&String(args[2]).startsWith('/syntheticCacheImportV1/')&&JSON.parse(args[4]).phase===(phase==='prepared'?'reserved':'verified')){hit=true;throw Object.assign(Error('checkpoint interruption'),{code:'EIO'});}return run(...args);};}return s;};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{DatabaseSync.prototype.prepare=prepare;fs.linkSync=link;}
    assert.ok(hit);assert.equal(checkpoint(f).phase,phase);absent(f);const retained=hashFiles(f.root),r=await admit(q);assert.equal(r.record.mapId,null);
    for(const [name,hash]of Object.entries(retained))if(name.endsWith('.response'))assert.equal(hashFiles(f.root)[name],hash);
    const before=logical(f.root),files=hashFiles(f.root);await admit(q);assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);absent(f);
});
test('map-independent original remains unlinked after a real synthetic map association arrives',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),first=await admit(q);await admit(f.write('map_0',log({game:false,diagnostics:false})));
    const before=logical(f.root),r=await admit(q);assert.deepEqual(r.record,first.record);assert.deepEqual(logical(f.root),before);
    const linked=await admit(f.write('linked_0',frames(),{collection:'score',time:3}));assert.notEqual(linked.record.mapId,null);assert.equal(f.store.entityCounts().replays,1);
});
test('each linked score is checked even after an independent score pins the replay',async t=>{
    const f=await fixture(t),first=await admit(f.write('score_0',frames(),{collection:'score',time:2}));await admit(f.write('map_0',log({game:false,diagnostics:false})));
    const linked=await admit(f.write('linked_0',frames(),{collection:'score',time:3})),other='f'.repeat(64),key=recordKey({collection:'score',replayId,fingerprint:linked.record.fingerprint});
    await f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'map',key:other,ordinal:1,value:{id:other,checksum:other,status:'validated'}})));
    database(f.root,db=>{db.prepare('UPDATE records SET map_id=? WHERE key=?').run(other,key);db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND owner_key=? AND pointer='/mapId'").run(JSON.stringify(other),key);});
    await unchanged(f,()=>analyzeSyntheticReplay({synthetic:true,root:f.root,replayId,scoreFingerprints:[first.record.fingerprint,linked.record.fingerprint],reportMode:'compact'}),'INVALID_REFERENCE');
});
test('map-independent pending source replacement cannot bypass its exact commitment',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),link=fs.linkSync;let hit=false;fs.linkSync=(a,b)=>{link(a,b);if(!hit&&String(b).endsWith('.response')){hit=true;throw Object.assign(Error('interruption'),{code:'EIO'});}};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.linkSync=link;}
    const body=frames();body[0].ui.items[0].value=99;fs.writeFileSync(path.join(q.sourceRoot,q.sourceFile),cacheFrame(body,{collection:'score',time:2}));await unchanged(f,()=>admit(q),'CHANGED_INPUT');absent(f);
});
for(const corruption of ['hash','bytes','state','mapId','binding'])test('map-independent corrupt '+corruption+' cannot verify or repair',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2});await admit(q);
    database(f.root,db=>{
        if(corruption==='hash')db.prepare('UPDATE outputs SET hash=?').run('f'.repeat(64));
        if(corruption==='bytes')db.exec('UPDATE outputs SET bytes=bytes+1');
        if(corruption==='state')db.exec("UPDATE outputs SET state='pending'");
        if(corruption==='mapId')db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND pointer='/mapId'").run(JSON.stringify('f'.repeat(64)));
        if(corruption==='binding'){const p=db.prepare("SELECT * FROM properties WHERE owner_kind='root'").get(),cp=JSON.parse(p.value);cp.replay={replayId,mapId:null};db.prepare("UPDATE properties SET value=? WHERE owner_kind='root' AND pointer=?").run(JSON.stringify(cp),p.pointer);}
    });await unchanged(f,()=>admit(q));absent(f);
});
test('map-independent collisions preserve unowned files and use the original v2 candidate order',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),p=parse(q),short=`replay-score-source-${replayId}-${p.fingerprint.slice(0,12)}.response`;
    fs.writeFileSync(path.join(f.root,short),'unowned');fs.mkdirSync(path.join(f.v2,'replay_logs'));fs.writeFileSync(path.join(f.v2,'replay_logs',short),'unowned');
    const [a,b]=await fixedTime(async()=>[await admit(q),await importScoreCacheFile(f.v2,path.join(q.sourceRoot,q.sourceFile))]);assert.equal(a.record.outputPath,b.record.outputPath);assert.equal(a.record.outputPath,`replay-score-source-${replayId}-${p.fingerprint}.response`);assert.equal(fs.readFileSync(path.join(f.root,short),'utf8'),'unowned');absent(f);
});
for(const status of ['inactive','active'])test('invalid existing score association '+status+' is not treated as absent',async t=>{
    const f=await fixture(t);await f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:{replayId,mapId:null,status}})));
    await unchanged(f,()=>admit(f.write('score_0',frames(),{collection:'score',time:2})));assert.equal(f.store.entityCounts().records,0);
});
for(const [collection,value]of [['log',{mapId:null}],['score',{}],['score',{mapId:'f'.repeat(64)}],['score',{mapId:null,buildId:'invalid'}],['score',{mapId:null,buildId:null}],['score',{mapId:null,buildId:'a'.repeat(64)}]])
test('association-free insertion rejects unsupported '+collection+' '+JSON.stringify(value),async t=>{
    const f=await fixture(t),key={collection,replayId,fingerprint:'d'.repeat(64)};await unchanged(f,()=>f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'record',key:recordKey(key),ordinal:0,value:{kind:'replay-frames',formatVersion:1,status:'pending',...value}}))));absent(f);
});
test('linked-score map disagreement is rejected atomically by the core',async t=>{
    const f=await fixture(t);await admit(f.write('map_0',log({game:false,diagnostics:false})));const key={collection:'score',replayId,fingerprint:'d'.repeat(64)};
    await unchanged(f,()=>f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'record',key:recordKey(key),ordinal:0,value:{mapId:'f'.repeat(64),status:'pending'}}))), 'INVALID_ASSOCIATION');
});
test('map-independent database constraints retain linked foreign keys and source IDs',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2});await admit(q);
    database(f.root,db=>{db.exec('PRAGMA foreign_keys=ON');const row=db.prepare('SELECT * FROM records').get();assert.equal(row.replay_id,replayId);assert.equal(row.association_id,null);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
        assert.throws(()=>db.prepare('UPDATE records SET build_id=?').run('a'.repeat(64)),/FOREIGN KEY/);
        assert.equal(db.prepare('SELECT build_id FROM records').get().build_id,null);
    });absent(f);
});
test('map-independent publication preserves EIO with separate close ENOSPC',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),open=fs.openSync,read=fs.readSync,close=fs.closeSync;let selected;
    fs.openSync=(file,...args)=>{const fd=open(file,...args);if(file===path.join(q.sourceRoot,q.sourceFile))selected=fd;return fd;};
    fs.readSync=(fd,...args)=>{if(fd===selected)throw Object.assign(Error('read'),{code:'EIO'});return read(fd,...args);};fs.closeSync=fd=>{close(fd);if(fd===selected){selected=undefined;throw Object.assign(Error('close'),{code:'ENOSPC'});}};
    try{await unchanged(f,()=>admit(q));await assert.rejects(admit(q),e=>e.code==='EIO'&&e.cleanupFailures?.[0].systemCode==='ENOSPC');}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}
    absent(f);
});
test('legacy schema rejects association-free imports before checkpoints but preserves linked imports',async t=>{
    const f=await fixture(t);
    database(f.root,db=>{
        const ddl=db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='records'").get().sql
            .replace('replay_id TEXT NOT NULL,','replay_id TEXT NOT NULL REFERENCES replays(key),')
            .replace(/\n association_id TEXT GENERATED ALWAYS AS[^\n]+\n/,'\n');
        const indexes=db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name='records' AND sql IS NOT NULL").all();
        db.exec('PRAGMA foreign_keys=OFF;BEGIN;DROP TABLE records;'+ddl+';'+indexes.map(r=>r.sql+';').join('')+'COMMIT;');
    });
    const q=f.write('score_0',frames(),{collection:'score',time:2});await unchanged(f,()=>admit(q),'UNSUPPORTED_STORE');absent(f);
    await admit(f.write('log_0',log()));assert.notEqual((await admit(q)).record.mapId,null);
    database(f.root,db=>assert.equal(db.prepare("SELECT name FROM pragma_table_xinfo('records') WHERE name='association_id'").get(),undefined));
});
test('concurrent map-independent imports share one reservation and stable identity',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2}),results=await Promise.all([admit(q),admit(q)]);
    assert.deepEqual(results.map(r=>r.kind).sort(),['deduplicated','imported']);assert.equal(f.store.entityCounts().records,1);assert.equal(f.store.pageOperations().rows.length,0);absent(f);
});
test('map-independent alternate path deduplication retains original transport provenance',async t=>{
    const f=await fixture(t),first=await admit(f.write('score_0',frames(),{collection:'score',time:2})),q=f.write('copy_0',frames(),{collection:'score',time:2}),before=logical(f.root),files=hashFiles(f.root);
    assert.deepEqual((await admit(q)).record,first.record);assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);absent(f);
});
test('map-independent raw HTTP and corrupted cache framing reject before mutation',async t=>{
    const f=await fixture(t),q=f.write('score_0',frames(),{collection:'score',time:2});fs.writeFileSync(path.join(q.sourceRoot,q.sourceFile),JSON.stringify(frames()));await unchanged(f,()=>admit(q),'UNSUPPORTED_TRANSPORT');
    const bytes=cacheFrame(frames(),{collection:'score',time:2});bytes[24+bytes.readUInt32LE(12)+12]^=255;fs.writeFileSync(path.join(q.sourceRoot,q.sourceFile),bytes);await unchanged(f,()=>admit(q));absent(f);
});

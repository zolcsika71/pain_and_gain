import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {importSyntheticCache as admit} from '../../tools/replay-import-command-fixture.js';
import {parseScoreCacheEntry} from '../../tools/replay-logs.js';
import {fixture,fixedTime,log,replayId} from '../fixtures/replay-import-command-fixture.js';
import {validationFrames} from '../fixtures/replay-score-validation-fixture.js';
import {logical,hashFiles,database} from '../fixtures/replay-log-review-command-fixture.js';
import {loadFixtureScores} from '../../tools/replay-score-analysis-fixture.js';
import {recordOwner} from '../../tools/replay-store.js';
import {analyzeSyntheticReplay} from '../../tools/replay-analysis-command-fixture.js';
import {importScoreCacheFile,importCacheFile} from '../../tools/replay-logs.js';
import {analyzeReplay} from '../../tools/replay-analysis.js';
import {updateSyntheticScoreReview} from '../../tools/replay-log-review-fixture.js';
import {exportAuthoritySnapshot,rollbackBudget} from '../../tools/replay-authority-export.js';
import os from 'node:os';

for(const linked of [false,true])test('69,624-byte validation '+(linked?'linked':'independent')+' import/reimport',async t=>{
    const f=await fixture(t);if(linked)await admit(f.write('log_0',log()));
    const q=f.write('score_0',validationFrames(69624),{collection:'score',time:2}),source=fs.readFileSync(path.join(q.sourceRoot,q.sourceFile)),expected=parseScoreCacheEntry(source).validation;
    assert.equal(Buffer.byteLength(JSON.stringify(expected)),69624);
    const r=await admit(q);assert.equal(JSON.stringify(r.record.validation),JSON.stringify(expected));assert.equal(r.record.mapId===null,!linked);
    const state=logical(f.root),files=hashFiles(f.root);assert.deepEqual((await admit(q)).record,r.record);assert.deepEqual(logical(f.root),state);assert.deepEqual(hashFiles(f.root),files);
    await f.store.withReadSnapshot({scoreSelection:{replayId,fingerprints:[r.record.fingerprint]}},async view=>{
        const {scoreRecords}=await loadFixtureScores(view,{replayId});assert.equal(JSON.stringify(scoreRecords[0].validation),JSON.stringify(expected));
        assert.deepEqual(Object.keys(scoreRecords[0].validation),Object.keys(expected));
    });
});

async function score(t,bytes=69624){const f=await fixture(t),q=f.write('score_0',validationFrames(bytes),{collection:'score',time:2}),r=await admit(q),key={collection:'score',replayId,fingerprint:r.record.fingerprint};return{...f,q,r,key,owner:recordOwner(key)};}
async function rejectUnchanged(f,fn){const state=logical(f.root),files=hashFiles(f.root);await assert.rejects(fn);assert.deepEqual(logical(f.root),state);assert.deepEqual(hashFiles(f.root),files);}
for(const bytes of [16383,16384,16385,65535,65536,65537])test('validation threshold '+bytes+' preserves values and original property order',async t=>{
    const f=await score(t,bytes),p=f.store.pageProperties(f.owner).rows.find(p=>p.pointer==='/validation');
    assert.equal(p.payload_pointer,bytes>16384?'/validation':null);const expected=Object.keys(f.r.record);assert.deepEqual(f.store.pageProperties(f.owner).rows.map(p=>p.pointer),expected.map(n=>'/'+n));
    assert.deepEqual((await admit(f.q)).record,f.r.record);
});
for(const defect of ['missing-file','corrupt-file','owner','hash','length','path','readiness','property','child'])test('external validation '+defect+' rejects without repair',async t=>{
    const f=await score(t),ref=f.store.pagePayloads(f.owner).rows[0];
    if(defect==='missing-file')fs.renameSync(path.join(f.root,ref.path),path.join(f.root,ref.path)+'.retained');
    else if(defect==='corrupt-file')fs.appendFileSync(path.join(f.root,ref.path),' ');
    else database(f.root,db=>{
        const where=" WHERE owner_kind='record' AND owner_key=? AND pointer='/validation'";
        if(defect==='owner'){db.exec('PRAGMA foreign_keys=OFF');db.prepare('UPDATE payloads SET owner_key=?'+where).run('wrong',f.owner.key);}
        if(defect==='hash')db.prepare('UPDATE payloads SET hash=?'+where).run('f'.repeat(64),f.owner.key);
        if(defect==='length')db.prepare('UPDATE payloads SET bytes=bytes+1'+where).run(f.owner.key);
        if(defect==='path')db.prepare('UPDATE payloads SET path=path||?'+where).run('.wrong',f.owner.key);
        if(defect==='readiness')db.prepare("UPDATE payloads SET state='pending'"+where).run(f.owner.key);
        if(defect==='property')db.prepare('DELETE FROM properties'+where).run(f.owner.key);
        if(defect==='child')db.prepare('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(ref.owner_kind,ref.owner_key,'/validation/child','/validation',ref.role,ref.path+'.missing',ref.hash,1,null,'ready',8,ref.encoding);
    });await rejectUnchanged(f,()=>admit(f.q));
    if(['missing-file','corrupt-file','owner','hash','length','path','readiness'].includes(defect))await rejectUnchanged(f,()=>f.store.withReadSnapshot({scoreSelection:{replayId,fingerprints:[f.key.fingerprint]}},view=>loadFixtureScores(view,{replayId})));
});
for(const boundary of ['output','validation'])test('interrupted '+boundary+' publication recovers validation exactly and repeatedly',async t=>{
    const f=await fixture(t),q=f.write('score_0',validationFrames(69624),{collection:'score',time:2}),link=fs.linkSync;let fired=false;
    fs.linkSync=(a,b)=>{link(a,b);if(!fired&&(boundary==='output'?String(b).endsWith('.response'):String(b).includes('/extensions/'))){fired=true;throw Object.assign(Error('synthetic interruption'),{code:'EIO'});}};
    try{await assert.rejects(admit(q),{code:'EIO'});}finally{fs.linkSync=link;}assert(fired);
    const r=await admit(q),state=logical(f.root),files=hashFiles(f.root);assert.equal(Buffer.byteLength(JSON.stringify(r.record.validation)),69624);assert.deepEqual((await admit(q)).record,r.record);assert.deepEqual(logical(f.root),state);assert.deepEqual(hashFiles(f.root),files);
});
test('large semantic findings remain findings, and analysis/reviews match v2',async t=>fixedTime(async()=>{
    const f=await fixture(t),l=f.write('log_0',log()),lr=await admit(l);await importCacheFile(f.v2,path.join(l.sourceRoot,l.sourceFile));const frames=validationFrames(69624);frames[0].ui.items.pop();
    const q=f.write('score_0',frames,{collection:'score',time:2}),r=await admit(q);assert(r.record.validation.issues.some(i=>i.code==='item-missing'));
    // Both destinations and all transports are newly generated for this task.
    const v2=await importScoreCacheFile(f.v2,path.join(q.sourceRoot,q.sourceFile));assert.deepEqual(r.record.validation,v2.record.validation);
    const fingerprints=[r.record.fingerprint],opts={replayId,fingerprints:[lr.record.fingerprint],scoreFingerprints:fingerprints,reportMode:'compact'};
    const a=await analyzeSyntheticReplay({synthetic:true,root:f.root,...opts}),b=analyzeReplay({root:f.v2,...opts});assert.deepEqual(a,b);
    const review={synthetic:true,root:f.root,replayId,fingerprint:r.record.fingerprint,taskId:'codex/validation-property',action:'claim'};await updateSyntheticScoreReview(review);await updateSyntheticScoreReview({...review,action:'examined'});
    const state=logical(f.root),files=hashFiles(f.root);await admit(q);assert.deepEqual(logical(f.root),state);assert.deepEqual(hashFiles(f.root),files);
}));
test('external validation remains finitely bounded without a partial import',async t=>{
    const f=await fixture(t),q=f.write('oversized_0',validationFrames(1048577),{collection:'score',time:2});
    assert.equal(Buffer.byteLength(JSON.stringify(parseScoreCacheEntry(fs.readFileSync(path.join(q.sourceRoot,q.sourceFile))).validation)),1048577);
    await rejectUnchanged(f,()=>admit(q));
});
test('capped rollback export preserves complete external validation and its raw archive',async t=>{
    const f=await score(t),destination=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-authority-v2-fixture-'));
    t.diagnostic(JSON.stringify({root:destination,synthetic:true,retained:true}));
    // Construct explicit, noncolliding legacy collection ordinals in this new
    // fixture. Ordinary import's absent-collection export restriction is unchanged.
    await f.store.withWriter(w=>w.transaction(tx=>{
        for(const [i,key]of ['maps','replays','records'].entries())tx.insertEntity({kind:'collection',key,ordinal:i+2,value:{present:true}});
        tx.setProperty({owner:{kind:'root',key:'root'},pointer:'/version',ordinal:5,value:2});
    }));
    const before=logical(f.root),files=hashFiles(f.root);
    await f.store.withWriter(async w=>{
        const receipt=await exportAuthoritySnapshot(f.root,destination,w.authorityExportFacts(),rollbackBudget());
        const restored=JSON.parse(fs.readFileSync(path.join(destination,'replay_logs/manifest.json')));assert.deepEqual(restored.scoreRecords[0],f.r.record);assert.deepEqual(Object.keys(restored.scoreRecords[0]),Object.keys(f.r.record));
        const ref=f.store.pagePayloads(f.owner).rows[0],archived=receipt.archive.find(x=>x.sourcePath===ref.path);assert(archived);assert.deepEqual(fs.readFileSync(path.join(destination,archived.path)),fs.readFileSync(path.join(f.root,ref.path)));
    });assert.deepEqual(logical(f.root),before);assert.deepEqual(hashFiles(f.root),files);
});
test('external property read EIO preserves separate close ENOSPC',async t=>{
    const f=await score(t),ref=f.store.pagePayloads(f.owner).rows[0],file=path.join(f.root,ref.path),open=fs.openSync,read=fs.readSync,close=fs.closeSync;let selected;
    fs.openSync=(p,...args)=>{const fd=open(p,...args);if(p===file)selected=fd;return fd;};fs.readSync=(fd,...args)=>{if(fd===selected)throw Object.assign(Error('validation read'),{code:'EIO'});return read(fd,...args);};fs.closeSync=fd=>{close(fd);if(fd===selected)throw Object.assign(Error('validation close'),{code:'ENOSPC'});};
    try{await assert.rejects(admit(f.q),e=>e.code==='EIO'&&e.cleanupFailures?.some(f=>f.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}
});

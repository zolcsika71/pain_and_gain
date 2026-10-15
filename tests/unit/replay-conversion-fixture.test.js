import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {convertFixtureV2Slice} from '../../tools/replay-conversion-fixture.js';
import {readFixtureV2Members} from '../../tools/replay-legacy-reader.js';
import {createFixtureStore,openStore,recordOwner,recordKey} from '../../tools/replay-store.js';
import {iterateDiagnostics,streamOriginalValue} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const replayId='111111111111111111111111',logFingerprint='a'.repeat(64),scoreFingerprint='b'.repeat(64);
const key=collection=>({collection,replayId,fingerprint:collection==='log'?logFingerprint:scoreFingerprint});
const tmp=fs.realpathSync(os.tmpdir());
async function fixture(t){
    const sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-conversion-fixture-'));
    const root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
    t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
    fs.writeFileSync(path.join(sourceRoot,'.v2-conversion-fixture.json'),JSON.stringify({fixture:'synthetic-v2-conversion',version:1}));
    const map={arena:{name:'Pain and Gain',season:'synthetic',level:1,ticksLimit:10},
        terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]};
    const mapId=mapChecksum(map),mapBytes=JSON.stringify({...map,checksum:mapId}),buildId='c'.repeat(64);
    fs.writeFileSync(path.join(sourceRoot,'map.json'),mapBytes);
    const reviews={'fixture/owner':{claimedAt:'2026-10-11T00:00:00Z',examinedAt:null,completedAt:null,unknown:{zero:0,no:false,empty:[]}},
        'fixture/examined':{claimedAt:'2026-10-11T00:00:00Z',examinedAt:'2026-10-11T00:01:00Z',completedAt:null,note:'Á'.repeat(9000)}};
    const wrappers=[{key:'1:2',raw:' {"kind":"diagnostic","tick":1} ',unknown:false},
        {key:'1:2',raw:'{"duplicate":true}',conflict:{retained:true}},
        {key:'1:3',raw:'{"closure":true}',unknown:null}];
    const log=Buffer.from('{"synthetic":true,"tick":1}\n'),score=Buffer.from('{"synthetic":true,"game":{"_id":"'+replayId+'"}}');
    const common={replayId,mapId,buildId,status:'claim',owner:'fixture-owner',conflicts:[{key:'1:2',reason:'synthetic duplicate'}],reviews};
    const record={...common,fingerprint:logFingerprint,outputPath:replayId+'.jsonl',outputFingerprint:sha(log),otherEntries:wrappers,largeExtension:'😀'.repeat(5000)};
    const scoreRecord={...common,fingerprint:scoreFingerprint,kind:'game-metadata',outputPath:`replay-score-source-${replayId}-${scoreFingerprint.slice(0,12)}.response`,outputFingerprint:sha(score)};
    fs.writeFileSync(path.join(sourceRoot,record.outputPath),log);fs.writeFileSync(path.join(sourceRoot,scoreRecord.outputPath),score);
    // Unselected identities prove that source ordinals are retained, not compacted.
    const m={version:2,maps:[{id:'d'.repeat(64)},{id:mapId,checksum:mapId,file:'map.json',path:'map.json',hash:sha(mapBytes),status:'validated',unknown:null}],
        replays:[{replayId:'222222222222222222222222'},{replayId,mapId,buildId,status:'active',unknown:false}],
        records:[{replayId,fingerprint:'d'.repeat(64)},record],scoreRecords:[{replayId,fingerprint:'e'.repeat(64)},scoreRecord]};
    const save=()=>fs.writeFileSync(path.join(sourceRoot,'manifest.json'),JSON.stringify(m));save();
    const s=await createFixtureStore({root,filesystem:'local-apfs'});s.close();
    return {sourceRoot,root,m,save,options:{synthetic:true,sourceRoot,root,replayId,logFingerprint,scoreFingerprint}};
}
function files(root){
    const result={};const visit=(dir)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else result[path.relative(root,p)]=sha(fs.readFileSync(p));}};visit(root);return result;
}
async function verify(f,result){
    assert.equal(result.phase,'verified');assert.equal(result.records.length,2);
    const s=await openStore({root:f.root,mode:'read'});
    try{
        for(const [collection,original] of [['log',f.m.records[1]],['score',f.m.scoreRecords[1]]]){
            const k=key(collection),row=s.getRecord(k);assert.equal(Number(row.ordinal),1);assert.equal(row.status,'claim');
            assert.equal(s.pageRecords({collection}).rows.length,1);
            const reviews=s.pageReviews(k).rows;assert.equal(reviews.length,2);
            await s.withReadSnapshot({recordKeys:[k],reviewKeys:reviews.map(r=>({recordKey:k,taskId:r.task}))},async view=>{
                const restored={};
                for(const p of s.pageProperties(recordOwner(k)).rows){
                    const name=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');
                    if(name==='reviews'){
                        restored[name]={};for(const r of reviews){
                            const owner={kind:'review',key:JSON.stringify([recordKey(k),r.task])},value={};
                            for(const p of s.pageProperties(owner).rows){const n=p.pointer.slice(1);if(p.payload_pointer){const chunks=[];await streamOriginalValue(view,view.payload(owner,p.pointer),c=>chunks.push(c));value[n]=JSON.parse(Buffer.concat(chunks));}else value[n]=JSON.parse(p.value);}
                            restored[name][r.task]=value;
                        }
                    }else if(name==='otherEntries'){
                        restored[name]=[];for await(const v of iterateDiagnostics(view,k,{pointer:p.pointer})){assert.equal(v.ordinal,restored[name].length);restored[name].push(v.value);}
                    }else if(p.payload_pointer){const chunks=[];await streamOriginalValue(view,view.payload(recordOwner(k),p.pointer),c=>chunks.push(c));restored[name]=JSON.parse(Buffer.concat(chunks));}
                    else restored[name]=JSON.parse(p.value);
                }
                assert.equal(JSON.stringify(restored),JSON.stringify(original),'all original properties, order and active reviews');
            });
        }
        assert.equal(s.pageOperations().rows.length,0);
        for(const a of result.artifacts){assert.equal(sha(fs.readFileSync(path.join(f.root,a.path))),a.sha256);assert.equal(fs.statSync(path.join(f.root,a.path)).size,a.bytes);}
    }finally{s.close();}
}
test('synthetic conversion preserves exact selected identities, properties, reviews and diagnostic order',async t=>{
    const f=await fixture(t),before=files(f.sourceRoot),r=await convertFixtureV2Slice(f.options);await verify(f,r);
    assert.deepEqual(files(f.sourceRoot),before);
    const converted=files(f.root),repeat=await convertFixtureV2Slice(f.options);assert.equal(repeat.generation,r.generation);assert.deepEqual(files(f.root),converted);
});

for(const collection of ['log','score'])for(const phase of ['reserved','published','verified'])for(const field of ['value','owner_key'])test(`review integrity slice ${collection} ${phase} ${field}`,async t=>{
    const f=await fixture(t),point={reserved:'after-reserve',published:'after-publication-checkpoint'}[phase];
    if(point)await assert.rejects(convertFixtureV2Slice({...f.options,fault:n=>{if(n===point)throw Error('retained interruption');}}));
    else await convertFixtureV2Slice(f.options);
    const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
    try{db.prepare(`UPDATE reviews SET ${field}=? WHERE collection=? AND task=?`).run(field==='value'?JSON.stringify({claimedAt:'forged',examinedAt:'forged',completedAt:'forged'}):'wrong-owner',collection,'fixture/examined');}finally{db.close();}
    const before=files(f.root);
    await assert.rejects(convertFixtureV2Slice(f.options),{code:'CHANGED_DESTINATION'});
    assert.deepEqual(files(f.root),before,'reject without changing rows, checkpoint or payloads');
});

test('review integrity slice valid inline and null projections repeat unchanged',async t=>{
    const f=await fixture(t),result=await convertFixtureV2Slice(f.options);
    const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
    try{for(const collection of ['log','score'])db.prepare('UPDATE reviews SET value=? WHERE collection=? AND task=?').run(JSON.stringify(f.m.records[1].reviews['fixture/owner']),collection,'fixture/owner');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE value IS NULL').get().n,2);
    }finally{db.close();}
    const before=files(f.root);for(let i=0;i<2;i++){const again=await convertFixtureV2Slice(f.options);assert.equal(again.generation,result.generation);await verify(f,again);assert.deepEqual(files(f.root),before);}
});

test('review integrity slice compares unknown values beyond timestamps',async t=>{
    const f=await fixture(t);await convertFixtureV2Slice(f.options);
    const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
    try{db.prepare('UPDATE reviews SET value=? WHERE collection=? AND task=?').run(JSON.stringify({...f.m.records[1].reviews['fixture/owner'],unknown:null}),'log','fixture/owner');}finally{db.close();}
    const before=files(f.root);await assert.rejects(convertFixtureV2Slice(f.options),{code:'CHANGED_DESTINATION'});assert.deepEqual(files(f.root),before);
});

test('member integration: no whole-manifest parse or read, arbitrary root order',async t=>{
    const f=await fixture(t);
    // Large enough to distinguish a whole input read, still under 150 KiB.
    f.m.records[0].unselected='x'.repeat(70000);
    const m=f.m;f.m={scoreRecords:m.scoreRecords,records:m.records,maps:m.maps,version:2,replays:m.replays};
    const text=JSON.stringify(f.m),manifest=path.join(f.sourceRoot,'manifest.json');fs.writeFileSync(manifest,text);
    const native={parse:JSON.parse,open:fs.openSync,read:fs.readSync,readFile:fs.readFileSync,close:fs.closeSync},fds=new Set();let maxRead=0,memberEvents=0;
    JSON.parse=(v,...a)=>{assert.notEqual(String(v),text,'whole-manifest parsing forbidden');return native.parse(v,...a);};
    fs.openSync=(p,...a)=>{const fd=native.open(p,...a);if(p===manifest)fds.add(fd);return fd;};
    fs.readSync=(fd,b,o,n,p)=>{if(fds.has(fd)){maxRead=Math.max(maxRead,n);assert.ok(n<=65536,'manifest reads must be chunked');}return native.read(fd,b,o,n,p);};
    fs.readFileSync=(p,...a)=>{assert.ok(p!==manifest&&!fds.has(p),'whole-manifest reading forbidden');return native.readFile(p,...a);};
    fs.closeSync=fd=>{fds.delete(fd);return native.close(fd);};
    let result;try{result=await convertFixtureV2Slice({...f.options,fault:n=>{if(n==='input-member')memberEvents++;}});}
    finally{JSON.parse=native.parse;fs.openSync=native.open;fs.readSync=native.read;fs.readFileSync=native.readFile;fs.closeSync=native.close;}
    assert.ok(memberEvents>0);assert.ok(maxRead<=65536);assert.equal(result.identity.manifestHash,sha(text));await verify(f,result);
});

for(const mode of ['interrupt','change','replace'])test('member integration: input boundary '+mode,async t=>{
    const f=await fixture(t),before=files(f.root),manifest=path.join(f.sourceRoot,'manifest.json'),original=fs.readFileSync(manifest);
    const failure=Object.assign(Error('member interrupted'),{code:'EIO'});let hit=false;
    await assert.rejects(convertFixtureV2Slice({...f.options,fault:n=>{
        if(n!=='input-member'||hit)return;hit=true;
        if(mode==='interrupt')throw failure;
        if(mode==='change')fs.appendFileSync(manifest,' ');
        else{fs.renameSync(manifest,manifest+'.original');fs.writeFileSync(manifest,original);}
    }}),e=>mode==='interrupt'?e===failure:e.code==='CHANGED_INPUT');
    assert.ok(hit);assert.deepEqual(files(f.root),before);
    if(mode==='change')fs.writeFileSync(manifest,original);
    await verify(f,await convertFixtureV2Slice(f.options));
});

for(const mode of ['rows','root-property','truncated','member','input','nonfinite','duplicate-unselected'])
test('member integration: reject unsupported input '+mode,async t=>{
    const f=await fixture(t),before=files(f.root),manifest=path.join(f.sourceRoot,'manifest.json');
    if(mode==='rows')f.m.records=Array.from({length:9},(_,i)=>({replayId,fingerprint:String(i).padStart(64,'0')}));
    if(mode==='root-property')f.m.unknownRoot={mustNotDiscard:true};
    if(mode==='member')f.m.records[0].large='x'.repeat(1048576);
    if(mode==='input')f.m.records[0].large='x'.repeat(2*1048576);
    if(mode==='duplicate-unselected')f.m.records.push(f.m.records[0]);
    f.save();
    if(mode==='truncated')fs.truncateSync(manifest,100);
    if(mode==='nonfinite')fs.writeFileSync(manifest,JSON.stringify(f.m).replace('"unknown":null','"unknown":1e400'));
    await assert.rejects(convertFixtureV2Slice(f.options));assert.deepEqual(files(f.root),before);
});

test('member integration: explicit conversion layout does not weaken fixture roots',async t=>{
    const f=await fixture(t),before=files(f.root),source=files(f.sourceRoot);let calls=0;
    await assert.rejects(readFixtureV2Members({synthetic:true,root:f.sourceRoot},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    for(const root of [process.cwd(),path.resolve('../pain_and_gain_hold_trial_2026-10-02'),path.resolve('../pain_and_gain_pair_trial_2026-10-02')])
        await assert.rejects(readFixtureV2Members({synthetic:true,layout:'conversion',root},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    await assert.rejects(readFixtureV2Members({synthetic:true,root:f.sourceRoot,get layout(){throw Error('accessor invoked');}},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    await assert.rejects(readFixtureV2Members({synthetic:true,root:f.sourceRoot,layout:'unknown'},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    await readFixtureV2Members({synthetic:true,root:f.sourceRoot,layout:'conversion'},()=>calls++);assert.equal(calls,13);
    const marker=path.join(f.sourceRoot,'.v2-conversion-fixture.json'),bytes=fs.readFileSync(marker);
    fs.writeFileSync(marker,JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
    await assert.rejects(readFixtureV2Members({synthetic:true,root:f.sourceRoot,layout:'conversion'},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    fs.writeFileSync(marker,bytes);
    assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.sourceRoot),source);
});

test('member integration: reader operation and close failures remain separate',async t=>{
    const f=await fixture(t),manifest=path.join(f.sourceRoot,'manifest.json'),before=files(f.root);
    const native={open:fs.openSync,read:fs.readSync,close:fs.closeSync};let opens=0,selected;
    const primary=Object.assign(Error('member read'),{code:'EIO'}),cleanup=Object.assign(Error('member close'),{code:'ENOSPC'});
    fs.openSync=(p,...a)=>{const fd=native.open(p,...a);if(p===manifest&&++opens===2)selected=fd;return fd;};
    fs.readSync=(fd,...a)=>{if(fd===selected)throw primary;return native.read(fd,...a);};
    fs.closeSync=fd=>{const hit=fd===selected;if(hit)selected=undefined;native.close(fd);if(hit)throw cleanup;};
    let caught;try{await convertFixtureV2Slice(f.options);}catch(e){caught=e;}
    finally{fs.openSync=native.open;fs.readSync=native.read;fs.closeSync=native.close;}
    assert.equal(caught,primary);assert.deepEqual(caught.cleanupFailures,[{reason:'cleanup-failed',systemCode:'ENOSPC'}]);
    assert.deepEqual(files(f.root),before);await verify(f,await convertFixtureV2Slice(f.options));
});

test('member integration: caller mutation cannot redirect async conversion',async t=>{
    const f=await fixture(t),options={...f.options};let hit=false;
    options.fault=n=>{if(n==='input-member'&&!hit){hit=true;options.root='/not-a-fixture';options.sourceRoot='/not-a-fixture';options.replayId='0'.repeat(24);}};
    await verify(f,await convertFixtureV2Slice(options));assert.ok(hit);
});

for(const boundary of ['before-prepare','after-prepare','before-map','after-map','before-reserve','after-reserve',
    'before-output-log','after-output-log','before-payload-log','after-payload-log','before-output-score','after-output-score',
    'before-payload-score','after-payload-score','before-publication-checkpoint','after-publication-checkpoint',
    'before-verification-checkpoint','after-verification-checkpoint','storage:transaction-commit',
    'storage:temporary-write','storage:temporary-fsync','storage:exclusive-publication','storage:directory-fsync',
    'storage:verification'])test('resume interruption: '+boundary,async t=>{
    const f=await fixture(t),failure=Object.assign(Error(boundary),{code:'EIO'});let hit=false;
    await assert.rejects(convertFixtureV2Slice({...f.options,fault:name=>{if(name===boundary){hit=true;throw failure;}}}),e=>e===failure);assert.ok(hit);
    const r=await convertFixtureV2Slice(f.options);await verify(f,r);
    const before=files(f.root);await convertFixtureV2Slice(f.options);assert.deepEqual(files(f.root),before);
});

test('production/trial roots and missing opt-in rejected before mutation',async t=>{
    const f=await fixture(t),before=files(f.root),source=files(f.sourceRoot);
    for(const bad of [process.cwd(),path.join(process.cwd(),'replay_logs'),path.resolve('../pain_and_gain_hold_trial_2026-10-02'),path.resolve('../pain_and_gain_pair_trial_2026-10-02')]){
        await assert.rejects(convertFixtureV2Slice({...f.options,root:bad}),{code:'UNSAFE_PATH'});
        await assert.rejects(convertFixtureV2Slice({...f.options,sourceRoot:bad}),{code:'UNSAFE_PATH'});
    }
    await assert.rejects(convertFixtureV2Slice({...f.options,synthetic:false}),{code:'UNSUPPORTED_FIXTURE'});
    assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.sourceRoot),source);
});
for(const mode of ['body','duplicate','map','link','path','review'])test('reject corrupt/conflicting input before publication: '+mode,async t=>{
    const f=await fixture(t),before=files(f.root);
    if(mode==='body')fs.appendFileSync(path.join(f.sourceRoot,f.m.records[1].outputPath),'corrupt');
    if(mode==='duplicate')f.m.records.push(f.m.records[1]);
    if(mode==='map')f.m.maps[1].hash='0'.repeat(64);
    if(mode==='link')f.m.records[1].mapId='0'.repeat(64);
    if(mode==='path')f.m.records[1].outputPath='../escape';
    if(mode==='review')f.m.records[1].reviews['fixture/owner'].completedAt='done';
    f.save();await assert.rejects(convertFixtureV2Slice(f.options));assert.deepEqual(files(f.root),before);
});
test('changed source after committed preparation cannot be repinned',async t=>{
    const f=await fixture(t);await assert.rejects(convertFixtureV2Slice({...f.options,fault:n=>{if(n==='after-prepare')throw Error('stop');}}));
    const before=files(f.root);f.m.records[1].owner='different';f.save();
    await assert.rejects(convertFixtureV2Slice(f.options),{code:'SOURCE_CONFLICT'});assert.deepEqual(files(f.root),before);
});
test('corrupt retained output is not overwritten during resume',async t=>{
    const f=await fixture(t);await assert.rejects(convertFixtureV2Slice({...f.options,fault:n=>{if(n==='after-output-log')throw Error('stop');}}));
    const output=path.join(f.root,f.m.records[1].outputPath);fs.appendFileSync(output,'corrupt');const before=files(f.root);
    await assert.rejects(convertFixtureV2Slice(f.options));assert.deepEqual(files(f.root),before);
});
test('duplicate JSON keys rejected instead of last-key-wins',async t=>{
    const f=await fixture(t),before=files(f.root),p=path.join(f.sourceRoot,'manifest.json');
    fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('"version":2','"version":2,"version":2'));
    await assert.rejects(convertFixtureV2Slice(f.options),{code:'DUPLICATE_KEY'});assert.deepEqual(files(f.root),before);
});

test('missing or invalid committed checkpoint cannot adopt existing conversion',async t=>{
    const f=await fixture(t);await assert.rejects(convertFixtureV2Slice({...f.options,fault:n=>{if(n==='after-prepare')throw Error('stop');}}));
    const s=await openStore({root:f.root,mode:'write'});
    await s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:{kind:'root',key:'root'},pointer:'/fixtureConversionV1',ordinal:0,value:null})));s.close();
    const before=files(f.root);await assert.rejects(convertFixtureV2Slice(f.options),{code:'INVALID_CHECKPOINT'});assert.deepEqual(files(f.root),before);
});

test('concurrent invocations reconcile to a single verified conversion',async t=>{
    const f=await fixture(t);const results=await Promise.all([convertFixtureV2Slice(f.options),convertFixtureV2Slice(f.options)]);
    assert.equal(results[0].storeId,results[1].storeId);assert.equal(results[0].generation,results[1].generation);await verify(f,results[0]);
});

test('review checkpoint API recognizes preserved active owners without changing them',async t=>{
    const {updateFixtureReviewCheckpoint}=await import('../../tools/replay-review-fixture.js');
    const f=await fixture(t);await convertFixtureV2Slice(f.options);const before=files(f.root);
    for(const collection of ['log','score']){
        const result=await updateFixtureReviewCheckpoint({root:f.root,schemaVersion:1,...key(collection),taskId:'fixture/examined',action:'examined'});
        assert.equal(result.changed,false);assert.equal(result.recordStatus,'claim');assert.equal(result.checkpoints.completedAt.value,null);
    }
    assert.deepEqual(files(f.root),before);
});

// Deliberately corrupt only newly generated fixture databases. Foreign keys are
// disabled solely for the owner-mismatch injection, never by converter code.
for(const collection of ['log','score'])for(const phase of ['published','verified'])for(const field of ['owner','path','hash','bytes','state','missing'])
    test(`reservation regression: ${phase} ${field} ${collection}`,async t=>{
        const f=await fixture(t);
        if(phase==='published')await assert.rejects(convertFixtureV2Slice({...f.options,fault:n=>{if(n==='after-publication-checkpoint')throw Error('interrupted');}}));
        else await convertFixtureV2Slice(f.options);
        const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
        try{
            if(field==='owner'){db.exec('PRAGMA foreign_keys=OFF');db.prepare('UPDATE outputs SET fingerprint=? WHERE collection=?').run('0'.repeat(64),collection);}
            if(field==='path')db.prepare('UPDATE outputs SET path=? WHERE collection=?').run('different.response',collection);
            if(field==='hash')db.prepare('UPDATE outputs SET hash=? WHERE collection=?').run('0'.repeat(64),collection);
            if(field==='bytes')db.prepare('UPDATE outputs SET bytes=bytes+1 WHERE collection=?').run(collection);
            if(field==='state')db.prepare('UPDATE outputs SET state=? WHERE collection=?').run('pending',collection);
            if(field==='missing')db.prepare('DELETE FROM outputs WHERE collection=?').run(collection);
        }finally{db.close();}
        const before=files(f.root),source=files(f.sourceRoot);
        await assert.rejects(convertFixtureV2Slice(f.options),{code:'CHANGED_DESTINATION'});
        assert.deepEqual(files(f.root),before,'inconsistent reservation is not repaired');
        assert.deepEqual(files(f.sourceRoot),source);
    });

for(const location of ['json','chunks','comparison'])for(const mode of ['both','read-only','close-only'])
    test(`descriptor regression: ${location} ${mode}`,async t=>{
        const f=await fixture(t);if(location==='comparison')await convertFixtureV2Slice(f.options);
        const target=location==='json'?path.join(f.sourceRoot,'.v2-conversion-fixture.json'):
            path.join(location==='chunks'?f.sourceRoot:f.root,'map.json');
        const before=files(f.root),source=files(f.sourceRoot);
        const native={open:fs.openSync,read:fs.readSync,close:fs.closeSync};let selected,opens=0,readHit=false,closeHit=false;
        const primary=Object.assign(Error('synthetic read failure'),{code:'EIO'}),cleanup=Object.assign(Error('synthetic close failure'),{code:'ENOSPC'});
        fs.openSync=(file,...args)=>{const fd=native.open(file,...args);if(file===target&&++opens===(location==='comparison'?2:1))selected=fd;return fd;};
        fs.readSync=(fd,...args)=>{if(fd===selected&&mode!=='close-only'){readHit=true;throw primary;}return native.read(fd,...args);};
        fs.closeSync=fd=>{const matches=fd===selected;if(matches)selected=undefined;const result=native.close(fd);
            if(matches&&mode!=='read-only'){closeHit=true;throw cleanup;}return result;};
        let caught;
        try{await convertFixtureV2Slice(f.options);}catch(error){caught=error;}
        finally{fs.openSync=native.open;fs.readSync=native.read;fs.closeSync=native.close;}
        assert.equal(readHit,mode!=='close-only');assert.equal(closeHit,mode!=='read-only');
        assert.equal(caught,mode==='close-only'?cleanup:primary,'original operation failure retains its identity/code');
        if(mode==='both')assert.deepEqual(caught.cleanupFailures,[{reason:'cleanup-failed',systemCode:'ENOSPC'}]);
        else assert.equal(caught.cleanupFailures,undefined);
        assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.sourceRoot),source);
        await verify(f,await convertFixtureV2Slice(f.options));
    });

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {analyzeFixtureCombinedReplay} from '../../tools/replay-combined-analysis-fixture.js';
import {makeFixture,inventory,key} from '../fixtures/replay-combined-analysis-m2e-store.js';
import {variants,hash} from '../fixtures/replay-combined-analysis-m2e-recipe.js';
import {child} from '../fixtures/replay-score-analysis-m2d-process.js';
import {recordKey,recordOwner} from '../../tools/replay-store.js';
import {payloadPath,digestChunks} from '../../tools/replay-store-payloads.js';
import {scoreSourceFingerprint,validateScoreBody} from '../../tools/replay-logs.js';
import {chunks} from '../fixtures/replay-combined-analysis-m2e-store.js';
const golden=JSON.parse(fs.readFileSync(new URL('../fixtures/replay-combined-analysis-m2e-oracle.json',import.meta.url)));
const equal=(actual,expected)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected));
async function fixture(t,schema,variant='scale',options){const f=await makeFixture(schema,variant,options);t.after(()=>{f.h.close();fs.rmSync(f.root,{recursive:true,force:true});});return f;}
async function rejectsUnchanged(f,expected,options=f.options){const before=inventory(f.root);await assert.rejects(analyzeFixtureCombinedReplay(options),expected);assert.deepEqual(inventory(f.root),before);assert.equal(fs.existsSync(path.join(f.root,'.manifest.lock')),false);await f.s.withWriter(()=>{});}
function corrupt(f,sql,args=[]){const db=new DatabaseSync(path.join(f.root,JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).database));try{db.prepare(sql).run(...args);}finally{db.close();}}
for(const schema of [1,2])for(const fault of ['binding-pointer','binding-role','binding-encoding','ownership-root','ownership-child','ownership-map','valid-extensions','valid-summaries'])test(`M2e validation schema ${schema}: ${fault}`,async()=>{
    const worker=new URL('../fixtures/replay-combined-analysis-m2e-validation.js',import.meta.url).pathname;
    const result=await child(['--experimental-test-module-mocks',worker,String(schema),fault],30000);assert.equal(result.result.passed,true);
});
for(const schema of [1,2])for(const variant of variants)test(`M2e schema ${schema}: frozen ${variant} full/compact parity and preservation`,async t=>{
    const f=await fixture(t,schema,variant),before=inventory(f.root);
    for(const reportMode of ['full','compact']){
        const report=await analyzeFixtureCombinedReplay({...f.options,reportMode});equal(report,golden.scenarios[variant].reports[reportMode]);assert.equal(hash(JSON.stringify(report)+'\n'),golden.scenarios[variant].reportHashes[reportMode]);
    }
    assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});
});
for(const schema of [1,2])test(`M2e schema ${schema}: explicit options, aggregate selection and exclusive snapshot lifetime`,async t=>{
    const f=await fixture(t,schema);
    for(const options of [{...f.options,fingerprints:[]},{...f.options,scoreFingerprints:[]},{...f.options,fingerprints:[...f.options.fingerprints,f.options.fingerprints[0]]}])await rejectsUnchanged(f,{code:'INVALID_IDENTITY'},options);
    await rejectsUnchanged(f,{code:'UNSUPPORTED_OPTION'},{...f.options,recover:true});await rejectsUnchanged(f,{code:'INVALID_ARGUMENT'},{...f.options,reportMode:'invalid'});
    const oversized=new Array(63);Object.defineProperty(oversized,0,{get(){throw Error('Inspected before count guard');}});
    await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'},{...f.options,scoreFingerprints:oversized});
    const singleOversized=new Array(65);Object.defineProperty(singleOversized,0,{get(){throw Error('Oversized array inspected with absent peer');}});
    await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'},{...f.options,fingerprints:singleOversized,scoreFingerprints:undefined});
    const combinedSelection={replayId:f.options.replayId,logFingerprints:f.options.fingerprints,scoreFingerprints:f.options.scoreFingerprints};
    for(const name of ['recordKeys','mapIds','reviewKeys','payloadRoles','scoreSelection'])await assert.rejects(f.s.withReadSnapshot({combinedSelection,[name]:[]},()=>{}),{code:'INVALID_REFERENCE'});
    await assert.rejects(f.s.withReadSnapshot({combinedSelection:{...combinedSelection,scoreFingerprints:oversized}},()=>{}),{code:'RESOURCE_LIMIT'});
    await assert.rejects(f.s.withReadSnapshot({combinedSelection:{replayId:f.options.replayId,logFingerprints:singleOversized}},()=>{}),{code:'RESOURCE_LIMIT'});
    let escaped;const before=inventory(f.root);await assert.rejects(f.s.withReadSnapshot({combinedSelection},view=>{escaped=view;assert.equal(view.records.size,4);assert.equal(view.maps.size,1);assert.ok(Object.isFrozen(view.combinedSelection().logKeys));throw null;}),e=>e===null);
    assert.throws(()=>escaped.combinedSelection(),{code:'CLOSED'});assert.deepEqual(inventory(f.root),before);equal(await analyzeFixtureCombinedReplay(f.options),golden.scenarios.scale.reports.full);
});
for(const schema of [1,2])test(`M2e schema ${schema}: selected unavailable logs never become partial score success`,async t=>{
    const f=await fixture(t,schema);await rejectsUnchanged(f,{code:'UNAVAILABLE'},{...f.options,fingerprints:['f'.repeat(64)]});
    for(const collection of ['log','score']){
        const record=(collection==='log'?f.data.manifest.records:f.data.manifest.scoreRecords)[0];
        await f.s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'unresolved-'+collection,recordKey:key(record,collection)})));
        await rejectsUnchanged(f,{code:'UNAVAILABLE'});
    }
});

for(const schema of [1,2])for(const fault of ['score-pending','score-retiring','log-pending','score-output','map-file','score-file','overflow-file','corrupt-body','presence','presence-conflict','retired-conflict','owner','projection','parent','items','reviews','map-inactive'])test(`M2e schema ${schema}: ${fault} rejects atomically`,async t=>{
    const f=await fixture(t,schema),r=f.data.manifest.scoreRecords[0],k=key(r,'score'),owner=recordOwner(k),l=f.data.manifest.records[0];
    if(fault==='score-pending'||fault==='score-retiring')await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:fault==='score-pending'?'pending':'retiring'})));
    if(fault==='log-pending')await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:key(l,'log'),status:'pending'})));
    if(fault==='score-output')corrupt(f,'DELETE FROM outputs WHERE path=?',[r.outputPath]);
    if(fault==='score-file')fs.unlinkSync(path.join(f.root,r.outputPath));
    if(fault==='map-file')fs.unlinkSync(path.join(f.root,f.data.manifest.maps[0].file));
    if(fault==='overflow-file')fs.unlinkSync(path.join(f.root,f.refs[0].refs[1].path));
    if(fault==='corrupt-body'){const file=path.join(f.root,r.outputPath),bytes=fs.readFileSync(file);bytes[0]^=1;fs.writeFileSync(file,bytes);}
    if(fault==='presence')corrupt(f,"DELETE FROM collections WHERE key='scoreRecords'");
    if(fault==='presence-conflict')corrupt(f,"UPDATE collections SET present=0 WHERE key='scoreRecords'");
    if(fault==='retired-conflict')corrupt(f,'INSERT INTO retired VALUES (?,?,?,?,?)',['score',k.replayId,k.fingerprint,owner.key,0]);
    if(fault==='owner')corrupt(f,'INSERT INTO maps VALUES (?,?,?,?,?)',['f'.repeat(64),l.outputPath,l.outputFingerprint,'validated',1]);
    if(fault==='projection')corrupt(f,"UPDATE properties SET value='null' WHERE owner_key=? AND pointer='/outputPath'",[owner.key]);
    if(fault==='parent')corrupt(f,'UPDATE payloads SET parent=NULL WHERE path=?',[f.refs[0].refs[1].path]);
    if(fault==='items')corrupt(f,'UPDATE payloads SET items=0 WHERE path=?',[f.refs[0].refs[0].path]);
    if(fault==='reviews')corrupt(f,"DELETE FROM properties WHERE owner_key=? AND pointer='/reviews'",[owner.key]);
    if(fault==='map-inactive')corrupt(f,"UPDATE maps SET status='pending'");
    await rejectsUnchanged(f);
});

for(const schema of [1,2])test(`M2e schema ${schema}: optional score map, retired scores, exact large ordinals and fixed requests`,async t=>{
    const f=await fixture(t,schema),r=f.data.manifest.scoreRecords[0],owner=recordOwner(key(r,'score')),mapId='f'.repeat(64);
    await f.s.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'map',key:mapId,ordinal:1,value:{path:'missing-score-map.json',hash:mapId}});
        tx.insertEntity({kind:'retired',key:recordKey({collection:'score',replayId:f.options.replayId,fingerprint:'f'.repeat(64)}),ordinal:9223372036854775807n});
        for(const {key:k}of f.refs)tx.setProperty({owner:recordOwner(k),pointer:'/ordinalProbe',ordinal:9223372036854775807n,value:null});
    }));
    corrupt(f,'UPDATE records SET map_id=? WHERE key=?',[mapId,owner.key]);corrupt(f,"UPDATE properties SET value=? WHERE owner_key=? AND pointer='/mapId'",[JSON.stringify(mapId),owner.key]);
    corrupt(f,"UPDATE payloads SET ordinal=9223372036854775807 WHERE owner_key=?",[owner.key]);
    const before=inventory(f.root),request={...f.options,fingerprints:[...f.options.fingerprints],scoreFingerprints:[...f.options.scoreFingerprints]};
    const pending=analyzeFixtureCombinedReplay(request);request.fingerprints.length=0;request.scoreFingerprints.length=0;
    const report=await pending;assert.equal(report.scoring.sources.find(s=>s.fingerprint===r.fingerprint).mapId,mapId);
    const missing=await analyzeFixtureCombinedReplay({...f.options,scoreFingerprints:['f'.repeat(64)]});equal(missing,golden.scenarios.missing.reports.full);
    assert.deepEqual(inventory(f.root),before);
});

for(const schema of [1,2])for(const primary of ['error','null','none'])test(`M2e schema ${schema}: every-close setup ${primary} and subsequent operation`,async t=>{
    const f=await fixture(t,schema),before=inventory(f.root),native={open:fs.openSync,close:fs.closeSync,stat:fs.fstatSync},handles=new Set();let opens=0,closes=0;
    const primaryError=primary==='null'?null:Error('setup'),closeError=Error('close');
    fs.openSync=(p,...args)=>{const fd=native.open(p,...args);if(f.selected.some(ref=>path.join(f.root,ref.path)===String(p))){handles.add(fd);opens++;}return fd;};
    fs.fstatSync=fd=>{if(primary!=='none'&&handles.has(fd)&&opens===2)throw primaryError;return native.stat(fd);};
    fs.closeSync=fd=>{if(handles.delete(fd)){closes++;native.close(fd);throw closeError;}return native.close(fd);};
    try{await assert.rejects(analyzeFixtureCombinedReplay(f.options),e=>e===(primary==='none'?closeError:primaryError));assert.equal(closes,opens);assert.equal(handles.size,0);}
    finally{Object.assign(fs,{openSync:native.open,closeSync:native.close,fstatSync:native.stat});}
    assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});equal(await analyzeFixtureCombinedReplay(f.options),golden.scenarios.scale.reports.full);
});

// Valid reserved extensions, preserving the exact mandatory output checkpoint.
async function extend(f,collection,values) {
    const r=(collection==='log'?f.data.manifest.records:f.data.manifest.scoreRecords)[0],k=key(r,collection),owner=recordOwner(k);
    const inputs=values.map((value,i)=>{const content=Buffer.from(JSON.stringify(value));return {owner,pointer:'/extra-'+i,role:'extensions',content,...digestChunks(chunks(content))};});
    await f.s.withWriter(async w=>{
        for(let start=0;start<inputs.length;start+=127)w.transaction(tx=>tx.appendIntent({id:'extend-'+collection,recordKey:k,files:inputs.slice(start,start+127).map((v,i)=>({ordinal:start+i,path:payloadPath(f.s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role}}))}));
        w.transaction(tx=>tx.appendIntent({id:'extend-'+collection,recordKey:k,files:[{ordinal:inputs.length,path:r.outputPath,hash:r.outputFingerprint,bytes:f.data.files[r.outputPath].length}]}));
        for(const [i,v]of inputs.entries()){const ref=await w.publishPayload({...v,source:chunks(v.content)});w.transaction(tx=>tx.setProperty({owner,pointer:v.pointer,ordinal:100+i,payloadRef:ref}));}
        await w.publishOutput({recordKey:k,path:r.outputPath,source:[],expectedBytes:f.data.files[r.outputPath].length,expectedHash:r.outputFingerprint});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'extend-'+collection}));
    });
}
for(const schema of [1,2])test(`M2e schema ${schema}: shared expanded metadata exact limit and one byte over`,async t=>{
    for(const over of [0,1]){
        const f=await fixture(t,schema);let remaining=8*1048576;
        for(const r of [...f.data.manifest.maps,...f.data.manifest.replays,...f.data.manifest.records,...f.data.manifest.scoreRecords])for(const [name,value]of Object.entries(r))remaining-=Buffer.byteLength('/'+name)+(name==='otherEntries'?0:Buffer.byteLength(JSON.stringify(value)));
        const halves=[Math.floor(remaining/2),remaining-Math.floor(remaining/2)];
        for(const [c,collection]of ['log','score'].entries()){
            let left=halves[c];const values=[];let i=0;
            while(left>0){const pointer=Buffer.byteLength('/extra-'+i++),size=Math.min(1048576,left-pointer);assert.ok(size>=2);values.push('x'.repeat(size-2));left-=size+pointer;}
            if(over&&c===1)values[values.length-1]+='x';await extend(f,collection,values);
        }
        if(over)await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'});else equal(await analyzeFixtureCombinedReplay(f.options),golden.scenarios.scale.reports.full);
    }
});
for(const schema of [1,2])test(`M2e schema ${schema}: union handle cap and individual property caps`,async t=>{
    const exact=await fixture(t,schema);await extend(exact,'score',['x'.repeat(1048574)]);equal(await analyzeFixtureCombinedReplay(exact.options),golden.scenarios.scale.reports.full);
    const over=await fixture(t,schema);await extend(over,'log',['x'.repeat(1048575)]);await rejectsUnchanged(over,{code:'RESOURCE_LIMIT'});
    const handles=await fixture(t,schema);await extend(handles,'log',Array.from({length:122},()=>null));await extend(handles,'score',Array.from({length:122},()=>null));equal(await analyzeFixtureCombinedReplay(handles.options),golden.scenarios.scale.reports.full);
    const plus=await fixture(t,schema);await extend(plus,'log',Array.from({length:123},()=>null));await extend(plus,'score',Array.from({length:122},()=>null));await rejectsUnchanged(plus,{code:'RESOURCE_LIMIT'});
});

test('M2e v2 synchronous combined API and actual CLI remain SQLite-free',t=>{
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-m2e-v2-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    // Rebuild synthetic inputs, not retained production evidence or oracle-root dependencies.
    const script=`import fs from 'node:fs';import {recipe,replayId} from ${JSON.stringify(new URL('../fixtures/replay-combined-analysis-m2e-recipe.js',import.meta.url).href)};import * as h from ${JSON.stringify(new URL('../../tools/replay-logs.js',import.meta.url).href)};const d=recipe(h);fs.mkdirSync(process.argv[1]+'/replay_logs');fs.writeFileSync(process.argv[1]+'/replay_logs/manifest.json',JSON.stringify(d.manifest));for(const [p,b]of Object.entries(d.files))fs.writeFileSync(process.argv[1]+'/replay_logs/'+p,b);`;
    const setup=spawnSync(process.execPath,['--input-type=module','-e',script,root],{encoding:'utf8',timeout:15000});assert.equal(setup.status,0,setup.stderr);
    // CLI root is module-relative, not cwd. Execute copied code inside this
    // fixture and omit the repository build input (the oracle uses null).
    fs.cpSync(new URL('../../tools',import.meta.url),path.join(root,'tools'),{recursive:true});
    fs.cpSync(new URL('../../src',import.meta.url),path.join(root,'src'),{recursive:true,filter:p=>!String(p).endsWith('/debug/build-id.js')});
    fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
    const deny='data:text/javascript,'+encodeURIComponent("import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLITE_FORBIDDEN');return n(s,c)}})");
    const analyzer=path.join(root,'tools/replay-analysis.js'),before=inventory(root);
    for(const reportMode of ['full','compact']){
        const args=[golden.scenarios.scale.reports.full.replayId,...['0'.repeat(64),'0'.repeat(63)+'1'],'--score',...golden.scenarios.scale.reports.full.selectedScoreFingerprints,...(reportMode==='full'?['--full-detail']:[])];
        const p=spawnSync(process.execPath,['--import',deny,analyzer,...args],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:8*1048576});assert.equal(p.status,Number(golden.scenarios.scale.reports[reportMode].summary.fail>0),p.stderr);assert.ok(p.stdout.length,p.stderr||'CLI did not run');equal(JSON.parse(p.stdout),golden.scenarios.scale.reports[reportMode]);
    }
    assert.deepEqual(inventory(root),before);
});

for(const schema of [1,2])test(`M2e schema ${schema}: exact 10/1000 and 600 MiB corpus gate`,async t=>{
    const roots=[10,1000].map(()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'))),receipts=fs.mkdtempSync(path.join(os.tmpdir(),'pain-gain-m2e-gate-'));
    const worker=new URL('../fixtures/replay-combined-analysis-m2e-worker.js',import.meta.url).pathname;let passed=false;
    t.after(()=>{if(passed)for(const root of [...roots,receipts])fs.rmSync(root,{recursive:true,force:true});else t.diagnostic(JSON.stringify({retainedFailedFixtures:[...roots,receipts]}));});
    try{
        const generate=await child(['--max-old-space-size=192',worker,'generate',String(schema),...roots],60000),receipt=path.join(receipts,'generation.json');fs.writeFileSync(receipt,JSON.stringify(generate.result));
        const operations=await child(['--max-old-space-size=192',worker,'operations',String(schema),...roots,receipt],30000);
        const preservation=await child(['--max-old-space-size=192',worker,'preservation',String(schema),...roots,receipt],60000);
        for(const r of [generate,operations,preservation])assert.ok(r.result.maxRssBytes<=256*1048576);
        passed=true;t.diagnostic(JSON.stringify({schema,generate,operations,preservation}));
    }catch(error){fs.writeFileSync(path.join(receipts,'failure.json'),JSON.stringify({message:error.message,stdout:error.stdout,stderr:error.stderr,code:error.code,signal:error.signal,elapsedMs:error.elapsedMs}));throw error;}
});

for(const schema of [1,2])test(`M2e schema ${schema}: callback faults, acquisition race, concurrent log cleanup and score retirement`,async()=>{
    const worker=new URL('../fixtures/replay-combined-analysis-m2e-faults.js',import.meta.url).pathname;
    const result=await child(['--experimental-test-module-mocks',worker,String(schema)],30000);assert.equal(result.result.passed,true);
});

for(const schema of [1,2])test(`M2e schema ${schema}: exact 64 combined sources, missing counts and collection-qualified identities`,async t=>{
    const f=await fixture(t,schema),scores=Array.from({length:62},(_,i)=>(i+100).toString(16).padStart(64,'0')),before=inventory(f.root);
    const report=await analyzeFixtureCombinedReplay({...f.options,scoreFingerprints:scores});assert.equal(report.selectedFingerprints.length,2);assert.equal(report.scoring.sources.length,0);assert.equal(report.findings.filter(f=>f.rule==='score.record-selection'&&f.message==='Requested score fingerprint is not present for this replay.').length,62);assert.deepEqual(inventory(f.root),before);
    const collision=await fixture(t,schema,'scale',{transform:data=>{const r=data.manifest.scoreRecords[0],old=r.outputPath,fp=data.fingerprints[0];r.fingerprint=fp;r.outputPath=`replay-score-source-${r.replayId}-${fp}.response`;data.files[r.outputPath]=data.files[old];delete data.files[old];data.scoreFingerprints[0]=fp;}});
    const result=await analyzeFixtureCombinedReplay(collision.options);assert.equal(result.selectedFingerprints.length,2);assert.equal(result.scoring.sources.length,2);assert.ok(result.findings.some(f=>f.verdict==='fail'&&f.rule.startsWith('score.')));
});

for(const schema of [1,2])for(const primary of ['null','error','none'])test(`M2e schema ${schema}: snapshot connection close preserves setup ${primary}`,async t=>{
    const f=await fixture(t,schema),before=inventory(f.root),nativeClose=DatabaseSync.prototype.close,nativeStat=fs.fstatSync,nativeOpen=fs.openSync;let readTransaction=false,injected=false,closes=0;
    const expected=primary==='null'?null:Error('setup-primary');
    // Arm only for snapshot artifact setup, not the earlier read-only open's
    // identity-validation transaction, which has no primary setup error.
    fs.openSync=(p,...args)=>{const fd=nativeOpen(p,...args);if(f.selected.some(r=>path.join(f.root,r.path)===String(p)))readTransaction=true;return fd;};
    fs.fstatSync=fd=>{if(readTransaction&&primary!=='none'&&!injected){injected=true;throw expected;}return nativeStat(fd);};
    DatabaseSync.prototype.close=function(){nativeClose.call(this);if(readTransaction){closes++;throw Error('db-close');}};
    try{await assert.rejects(analyzeFixtureCombinedReplay(f.options),e=>primary==='none'?e.message==='db-close':e===expected);assert.equal(closes,1);}
    finally{DatabaseSync.prototype.close=nativeClose;fs.openSync=nativeOpen;fs.fstatSync=nativeStat;}
    assert.deepEqual(inventory(f.root),before);equal(await analyzeFixtureCombinedReplay(f.options),golden.scenarios.scale.reports.full);
});

for(const schema of [1,2])test(`M2e schema ${schema}: raw score caps remain distinct from semantic malformed bodies`,async t=>{
    const transform=(size,count)=>data=>{
        const base=data.manifest.scoreRecords[1],records=[];
        for(let i=0;i<count;i++){
            const body=Buffer.alloc(size,32);body[0]=123;const requestUrl=`https://arena.screeps.com/api/game/${base.replayId}/replay/${i}`,sourceKey='1/0/'+requestUrl,responseFingerprint=hash(body),fingerprint=scoreSourceFingerprint(sourceKey,body),outputPath=`replay-score-source-${base.replayId}-${fingerprint}.response`,summary=validateScoreBody('replay-frames',body,responseFingerprint);
            records.push({...base,requestedGameTime:i,requestUrl,sourceKey,responseFingerprint,fingerprint,outputPath,outputFingerprint:responseFingerprint,coverage:summary.coverage,validation:summary.validation});data.files[outputPath]=body;
        }data.manifest.scoreRecords=records;data.scoreFingerprints=records.map(r=>r.fingerprint);
    };
    const exact=await fixture(t,schema,'scale',{transform:transform(4*1048576,4)}),before=inventory(exact.root),report=await analyzeFixtureCombinedReplay(exact.options);
    assert.equal(report.scoring.sources.length,4);assert.ok(report.scoring.sources.every(s=>s.validation.json==='malformed'));assert.deepEqual(inventory(exact.root),before);
    const over=await fixture(t,schema,'scale',{transform:transform(4*1048576+1,1)});await rejectsUnchanged(over,{code:'RESOURCE_LIMIT'});
    const total=await fixture(t,schema,'scale',{transform:transform(4*1048576,5)});await rejectsUnchanged(total,{code:'RESOURCE_LIMIT'});
});

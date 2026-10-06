import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {analyzeFixtureScoreReplay} from '../../tools/replay-score-analysis-fixture.js';
import {recordOwner,recordKey} from '../../tools/replay-store.js';
import {digestChunks,payloadPath} from '../../tools/replay-store-payloads.js';
import {validateScoreBody,scoreSourceFingerprint} from '../../tools/replay-logs.js';
import {makeFixture,key,inventory,chunks} from '../fixtures/replay-score-analysis-m2d-store.js';
import {variants,replayId,hash} from '../fixtures/replay-score-analysis-m2d-recipe.js';
import {child} from '../fixtures/replay-score-analysis-m2d-process.js';
const golden=JSON.parse(fs.readFileSync(new URL('../fixtures/replay-score-analysis-m2d-oracle.json',import.meta.url)));
const compatibility=JSON.parse(fs.readFileSync(new URL('../fixtures/replay-score-analysis-m2d-compat-oracle.json',import.meta.url)));
// Compare every JSON report field without traversing the analyzer's repeated
// shared object graph repeatedly in Node's deep-strict-equality bookkeeping.
const reportEqual=(actual,expected)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected));
const worker=new URL('../fixtures/replay-score-analysis-m2d-worker.js',import.meta.url).pathname;
const dbPath=f=>path.join(f.root,JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).database);
async function fixture(t,schema=1,variant='scale',options){const f=await makeFixture(schema,variant,options);t.after(()=>{f.h.close();fs.rmSync(f.root,{recursive:true,force:true});});return f;}
function corrupt(f,sql,args=[]){const db=new DatabaseSync(dbPath(f));try{db.prepare(sql).run(...args);}finally{db.close();}}
async function rejectsUnchanged(f,expected){const before=inventory(f.root);await assert.rejects(analyzeFixtureScoreReplay(f.options),expected);assert.deepEqual(inventory(f.root),before);assert.equal(fs.existsSync(path.join(f.root,'.manifest.lock')),false);await f.s.withWriter(()=>{});}

for(const schema of [1,2])for(const variant of variants)test(`M2d schema ${schema}: frozen ${variant} parity, preservation and selection order`,async t=>{
    const f=await fixture(t,schema,variant),before=inventory(f.root);
    for(const reportMode of ['full','compact']) {
        const report=await analyzeFixtureScoreReplay({...f.options,scoreFingerprints:[...f.options.scoreFingerprints].reverse(),reportMode});
        reportEqual(report,golden.scenarios[variant].reports[reportMode]);assert.equal(hash(JSON.stringify(report)+'\n'),golden.scenarios[variant].hashes[reportMode]);
    }
    assert.deepEqual(inventory(f.root),before);
});

for(const schema of [1,2])for(const mode of ['pending','retiring','intent','missing','hash','presence','absent-rows','tombstone','binding','split','reviews','map','output','unavailable-summary'])test(`M2d schema ${schema}: ${mode} transport rejects without mutation`,async t=>{
    const f=await fixture(t,schema),r=f.data.manifest.scoreRecords[0],k=key(r),owner=recordOwner(k);
    if(['pending','retiring'].includes(mode))await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:mode})));
    if(mode==='intent')await f.s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'pending',recordKey:k})));
    if(mode==='missing')fs.unlinkSync(path.join(f.root,r.outputPath));
    if(mode==='hash'){const p=path.join(f.root,r.outputPath),b=fs.readFileSync(p);b[0]=32;fs.writeFileSync(p,b);}
    if(mode==='presence')corrupt(f,"DELETE FROM collections WHERE key='scoreRecords'");
    if(mode==='absent-rows')corrupt(f,"UPDATE collections SET present=0 WHERE key='scoreRecords'");
    if(mode==='tombstone')corrupt(f,'INSERT INTO retired VALUES (?,?,?,?,?)',['score',replayId,r.fingerprint,recordKey(k),0]);
    if(mode==='binding')corrupt(f,"UPDATE properties SET payload_pointer='/validation' WHERE owner_key=? AND pointer='/fixtureNote'",[owner.key]);
    if(mode==='split')await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner,pointer:'/nested/a',ordinal:100,value:null})));
    if(mode==='reviews')corrupt(f,"DELETE FROM properties WHERE owner_key=? AND pointer='/reviews'",[owner.key]);
    if(mode==='map')corrupt(f,"INSERT INTO maps VALUES (?, ?, ?, ?, ?)",['a'.repeat(64),r.outputPath,r.outputFingerprint,'validated',0]);
    if(mode==='output')corrupt(f,'DELETE FROM outputs WHERE path=?',[r.outputPath]);
    if(mode==='unavailable-summary')fs.unlinkSync(path.join(f.root,f.refs[0][0].path));
    await rejectsUnchanged(f);
});

for(const schema of [1,2])test(`M2d schema ${schema}: optional absent map, exact ordinals, missing and retired semantics`,async t=>{
    const f=await fixture(t,schema),r=f.data.manifest.scoreRecords[0],k=key(r),owner=recordOwner(k),mapId='a'.repeat(64);
    await f.s.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'map',key:mapId,ordinal:0,value:{path:'missing-map.json',hash:mapId}});
        tx.setProperty({owner,pointer:'/ordinalProbe',ordinal:9223372036854775807n,value:null});
        tx.insertEntity({kind:'retired',key:recordKey({collection:'score',replayId,fingerprint:'f'.repeat(64)}),ordinal:9007199254740993n});
    }));
    // SQL only injects a valid optional projection absent from the fixed golden input.
    corrupt(f,'UPDATE records SET map_id=? WHERE key=?',[mapId,owner.key]);
    corrupt(f,"UPDATE properties SET value=? WHERE owner_key=? AND pointer='/mapId'",[JSON.stringify(mapId),owner.key]);
    const before=inventory(f.root);const report=await analyzeFixtureScoreReplay(f.options);
    assert.equal(report.scoring.sources.find(s=>s.fingerprint===r.fingerprint).mapId,mapId);
    await f.s.withReadSnapshot({scoreSelection:{replayId,fingerprints:['f'.repeat(64)]}},view=>{assert.deepEqual(view.scoreSelection().retiredFingerprints,['f'.repeat(64)]);assert.equal(view.maps.size,0);});
    reportEqual(await analyzeFixtureScoreReplay({...f.options,scoreFingerprints:['f'.repeat(64)]}),golden.scenarios.missing.reports.full);
    assert.deepEqual(inventory(f.root),before);
});

test('M2d argument gates and original options fixed across awaits',async t=>{
    const f=await fixture(t);
    for(const scoreFingerprints of [undefined,[],['bad'],[f.options.scoreFingerprints[0],f.options.scoreFingerprints[0]]])await assert.rejects(analyzeFixtureScoreReplay({...f.options,scoreFingerprints}),{code:'INVALID_IDENTITY'});
    await assert.rejects(analyzeFixtureScoreReplay({...f.options,scoreFingerprints:Array.from({length:65},(_,i)=>i.toString(16).padStart(64,'0'))}),{code:'RESOURCE_LIMIT'});
    for(const extra of [{fingerprints:[]},{other:1},{reportMode:'bad'},{schemaVersion:3},{root:process.cwd()}])await assert.rejects(analyzeFixtureScoreReplay({...f.options,...extra}));
    const selection=[...f.options.scoreFingerprints],p=analyzeFixtureScoreReplay({...f.options,scoreFingerprints:selection});selection.splice(0);reportEqual(await p,golden.scenarios.scale.reports.full);
});

for(const schema of [1,2])for(const primary of ['error','null','none'])test(`M2d schema ${schema}: setup ${primary}, every-close cleanup and subsequent read`,async t=>{
    const f=await fixture(t,schema),before=inventory(f.root),native={open:fs.openSync,close:fs.closeSync,stat:fs.fstatSync},handles=new Set();let opens=0,closes=0;
    const primaryError=primary==='null'?null:Error('setup'),closeError=Error('close');
    fs.openSync=(p,...a)=>{const fd=native.open(p,...a);if(/\/(summaries|extensions)\//.test(String(p))||String(p).endsWith('.response')){handles.add(fd);opens++;}return fd;};
    fs.fstatSync=fd=>{if(primary!=='none'&&handles.has(fd)&&opens===2)throw primaryError;return native.stat(fd);};
    fs.closeSync=fd=>{if(handles.delete(fd)){closes++;native.close(fd);throw closeError;}return native.close(fd);};
    try{await assert.rejects(analyzeFixtureScoreReplay(f.options),e=>e===(primary==='none'?closeError:primaryError));assert.equal(closes,opens);assert.equal(handles.size,0);}
    finally{Object.assign(fs,{openSync:native.open,closeSync:native.close,fstatSync:native.stat});}
    assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});reportEqual(await analyzeFixtureScoreReplay(f.options),golden.scenarios.scale.reports.full);
});

test('M2d v2 API and actual CLI stay SQLite-free and match the frozen oracle',async t=>{
    const f=await fixture(t),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-m2d-v2-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    fs.mkdirSync(path.join(root,'replay_logs'));for(const [p,b]of Object.entries(f.data.files))fs.writeFileSync(path.join(root,'replay_logs',p),b);
    fs.writeFileSync(path.join(root,'replay_logs/manifest.json'),JSON.stringify(f.data.manifest));fs.cpSync(new URL('../../tools/',import.meta.url),path.join(root,'tools'),{recursive:true});fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
    const deny='data:text/javascript,'+encodeURIComponent("import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLITE_FORBIDDEN');return n(s,c)}})");
    for(const reportMode of ['full','compact']){const p=spawnSync(process.execPath,['--import',deny,path.join(root,'tools/replay-analysis.js'),replayId,'--score',...f.options.scoreFingerprints,...(reportMode==='full'?['--full-detail']:[])],{encoding:'utf8',timeout:15000,maxBuffer:16*1048576});assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),golden.scenarios.scale.reports[reportMode]);}
});

for(const schema of [1,2])test(`M2d schema ${schema}: callback/analysis faults and concurrent committed retirement`,async()=>{
    const r=await child(['--experimental-test-module-mocks',worker,'faults',String(schema)],30000);assert.equal(r.result.passed,true);
});

async function extend(f,values) {
    const r=f.data.manifest.scoreRecords[0],k=key(r),owner=recordOwner(k),inputs=values.map((value,i)=>{const content=Buffer.from(JSON.stringify(value));return{owner,pointer:'/extra-'+i,role:'extensions',content,...digestChunks(chunks(content))};});
    await f.s.withWriter(async w=>{
        // Page reservations under one operation; publish exact existing output
        // again so finalization has its mandatory verified output checkpoint.
        for(let start=0;start<inputs.length;start+=127)w.transaction(tx=>tx.appendIntent({id:'extensions',recordKey:k,files:inputs.slice(start,start+127).map((v,i)=>({ordinal:start+i,path:payloadPath(f.s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role}}))}));
        w.transaction(tx=>tx.appendIntent({id:'extensions',recordKey:k,files:[{ordinal:inputs.length,path:r.outputPath,hash:r.outputFingerprint,bytes:f.data.files[r.outputPath].length}]}));
        for(const [i,v]of inputs.entries()){const ref=await w.publishPayload({...v,source:chunks(v.content)});w.transaction(tx=>tx.setProperty({owner,pointer:v.pointer,ordinal:100+i,payloadRef:ref}));}
        await w.publishOutput({recordKey:k,path:r.outputPath,source:[],expectedBytes:f.data.files[r.outputPath].length,expectedHash:r.outputFingerprint});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'extensions'}));
    });
}
for(const schema of [1,2])test(`M2d schema ${schema}: original value cap, handle budget and bounded unsupported values`,async t=>{
    const exact=await fixture(t,schema);await extend(exact,['x'.repeat(1048574)]);reportEqual(await analyzeFixtureScoreReplay(exact.options),golden.scenarios.scale.reports.full);
    const over=await fixture(t,schema);await extend(over,['x'.repeat(1048575)]);await rejectsUnchanged(over,{code:'RESOURCE_LIMIT'});
    const handles=await fixture(t,schema);await extend(handles,Array.from({length:245},()=>null));await rejectsUnchanged(handles,{code:'RESOURCE_LIMIT'});
});

function rawTransform(bytes,count=1) {
    return data=>{
        const base=data.manifest.scoreRecords[1],records=[];data.files={};
        for(let i=0;i<count;i++){
            const body=Buffer.alloc(bytes,32);body[0]=123;const requestedGameTime=i,requestUrl=`https://arena.screeps.com/api/game/${replayId}/replay/${i}`,sourceKey='1/0/'+requestUrl,responseFingerprint=hash(body),fingerprint=scoreSourceFingerprint(sourceKey,body),outputPath=`replay-score-source-${replayId}-${fingerprint}.response`,summary=validateScoreBody('replay-frames',body,responseFingerprint);
            const r={...base,requestedGameTime,requestUrl,sourceKey,responseFingerprint,fingerprint,outputPath,outputFingerprint:responseFingerprint,coverage:summary.coverage,validation:summary.validation};records.push(r);data.files[outputPath]=body;
        }
        data.manifest.scoreRecords=records;data.selected=records.map(r=>r.fingerprint);
    };
}
for(const schema of [1,2])test(`M2d schema ${schema}: exact raw caps preserve malformed-body findings, overages reject`,async t=>{
    const f=await fixture(t,schema,'scale',{transform:rawTransform(4*1048576,4)}),before=inventory(f.root);
    const r=await analyzeFixtureScoreReplay(f.options);assert.equal(r.scoring.sources.length,4);assert.ok(r.scoring.sources.every(s=>s.validation.json==='malformed'));assert.deepEqual(inventory(f.root),before);
    const per=await fixture(t,schema,'scale',{transform:rawTransform(4*1048576+1)});await rejectsUnchanged(per,{code:'RESOURCE_LIMIT'});
    const total=await fixture(t,schema,'scale',{transform:rawTransform(4*1048576,5)});await rejectsUnchanged(total,{code:'RESOURCE_LIMIT'});
});

for(const schema of [1,2])test(`M2d schema ${schema}: snapshot mode exclusivity and callback lifetime`,async t=>{
    const f=await fixture(t,schema),scoreSelection={replayId,fingerprints:f.options.scoreFingerprints};let escaped;
    for(const name of ['recordKeys','mapIds','reviewKeys','payloadRoles'])await assert.rejects(f.s.withReadSnapshot({scoreSelection,[name]:[]},()=>{}),{code:'INVALID_REFERENCE'});
    const oversized=new Array(65);Object.defineProperty(oversized,0,{get(){throw Error('Oversized selection was inspected before its bound');}});
    await assert.rejects(f.s.withReadSnapshot({scoreSelection:{replayId,fingerprints:oversized}},()=>{}),{code:'RESOURCE_LIMIT'});
    const before=inventory(f.root);await assert.rejects(f.s.withReadSnapshot({scoreSelection},view=>{escaped=view;assert.ok(Object.isFrozen(view.scoreSelection().currentKeys));throw null;}),e=>e===null);
    assert.throws(()=>escaped.output(key(f.data.manifest.scoreRecords[0])),{code:'CLOSED'});assert.throws(()=>escaped.scoreSelection(),{code:'CLOSED'});assert.deepEqual(inventory(f.root),before);
});

for(const schema of [1,2])test(`M2d schema ${schema}: expanded metadata exact 8 MiB and one-byte over`,async t=>{
    for(const over of [0,1]){
        const f=await fixture(t,schema);let remaining=8*1048576;
        for(const r of f.data.manifest.scoreRecords)for(const [name,value]of Object.entries(r))remaining-=Buffer.byteLength('/'+name)+Buffer.byteLength(JSON.stringify(value));
        const values=[];let i=0;
        while(remaining>0){const pointerBytes=Buffer.byteLength('/extra-'+i++),size=Math.min(1048576,remaining-pointerBytes);assert.ok(size>=2);values.push('x'.repeat(size-2));remaining-=pointerBytes+size;}
        if(over)values[values.length-1]+='x';await extend(f,values);
        if(over)await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'});else reportEqual(await analyzeFixtureScoreReplay(f.options),golden.scenarios.scale.reports.full);
    }
});

for(const schema of [1,2])test(`M2d schema ${schema}: exact 10/1000 and 600 MiB corpus gate`,async t=>{
    const roots=[10,1000].map(()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'))),receipts=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-m2d-gate-'));
    let passed=false;
    t.after(()=>{if(passed){for(const root of [...roots,receipts])fs.rmSync(root,{recursive:true,force:true});}else t.diagnostic(JSON.stringify({retainedFailedFixtures:[...roots,receipts]}));});
    const generate=await child(['--max-old-space-size=192',worker,'generate',String(schema),...roots],60000);
    const receipt=path.join(receipts,'generation.json');fs.writeFileSync(receipt,JSON.stringify(generate.result));
    const operations=await child(['--max-old-space-size=192',worker,'operations',String(schema),...roots,receipt],30000);
    const preservation=await child(['--max-old-space-size=192',worker,'preservation',String(schema),...roots,receipt],60000);
    for(const result of [generate,operations,preservation])assert.ok(result.result.maxRssBytes<=256*1048576);
    passed=true;
    t.diagnostic(JSON.stringify({schema,generate,operations,preservation}));
});

test('M2d worker deadline rejects instead of accepting a late or nonterminating worker',async()=>{
    await assert.rejects(child(['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],500),error=>{
        assert.match(error.message,/exceeded 500ms/);assert.match(error.stdout,/ready/);assert.equal(error.signal,'SIGKILL');assert.ok(error.elapsedMs<=5500);return true;
    });
});

// Supplemental expectations were frozen from the unmodified published v2
// implementation, not this loader or its shared analysis boundary.
for(const [name,expected]of Object.entries(compatibility.cases))test(`M2d compatibility: v2 ${name} preserves occurrence loading and native raw numbers`,t=>{
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-m2d-compat-v2-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    fs.mkdirSync(path.join(root,'replay_logs'));
    fs.writeFileSync(path.join(root,'replay_logs/manifest.json'),JSON.stringify(expected.manifest));
    for(const [file,body]of Object.entries(expected.bodies))fs.writeFileSync(path.join(root,'replay_logs',file),Buffer.from(body,'base64'));
    const before=inventory(root),deny='data:text/javascript,'+encodeURIComponent("import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLITE_FORBIDDEN');return n(s,c)}})");
    const module=new URL('../../tools/replay-analysis.js',import.meta.url).href;
    const script=`import assert from 'node:assert/strict';import {analyzeReplay} from ${JSON.stringify(module)};const options=JSON.parse(process.argv[1]);console.log(JSON.stringify(['full','compact'].map(reportMode=>{const r=analyzeReplay({...options,reportMode});assert.equal(typeof r?.then,'undefined');return r;})));`;
    const result=spawnSync(process.execPath,['--import',deny,'--input-type=module','-e',script,JSON.stringify({root,replayId,fingerprints:[],scoreFingerprints:expected.selected})],{encoding:'utf8',timeout:15000,maxBuffer:4*1048576});
    assert.equal(result.status,0,result.stderr);
    const reports=JSON.parse(result.stdout);
    for(const [i,mode]of ['full','compact'].entries()){
        reportEqual(reports[i],expected.reports[mode]);assert.equal(hash(JSON.stringify(reports[i])+'\n'),expected.hashes[mode]);
    }
    if(name.startsWith('duplicate-')){
        const records=expected.manifest.scoreRecords;
        assert.equal(records[0].fingerprint,records[1].fingerprint);
        assert.notEqual(records[0].outputPath,records[1].outputPath);
        assert.deepEqual(reports[0].scoring.sources.map(s=>s.integrity),name==='duplicate-readable-missing'?['verified','invalid']:['invalid','verified']);
        const failure=reports[0].findings.find(f=>f.rule==='score.output-file'&&f.verdict==='fail');
        assert.match(failure.message,/file is missing/);
        assert.equal(reports[0].scoring.sources.filter(s=>s.integrity==='verified').length,1);
    }
    assert.deepEqual(inventory(root),before);
});

for(const schema of [1,2])for(const name of ['numeric-frames','numeric-metadata'])test(`M2d compatibility: schema ${schema} ${name} retains exact raw-body semantics`,async t=>{
    const expected=compatibility.cases[name],files=Object.fromEntries(Object.entries(expected.bodies).map(([p,b])=>[p,Buffer.from(b,'base64')]));
    const f=await fixture(t,schema,'scale',{transform:data=>Object.assign(data,{manifest:structuredClone(expected.manifest),selected:[...expected.selected],files})});
    const before=inventory(f.root),raw=Object.values(files)[0],parsed=JSON.parse(raw.toString('utf8'));
    const numbers=name==='numeric-frames'?parsed.map(frame=>frame.ui.items[0].value):parsed.numericProbe;
    assert.equal(numbers[0],Infinity);assert.equal(numbers[1],-Infinity);assert.ok(Object.is(numbers[2],-0));
    assert.equal(numbers[3],0);assert.equal(numbers[4],9007199254740992);assert.equal(numbers[5],100);
    assert.notEqual(hash(raw),hash(JSON.stringify(parsed)),'Native reserialization must not replace retained raw bytes');
    for(const artifact of expected.artifacts){assert.equal(files[artifact.path].length,artifact.bytes);assert.equal(hash(files[artifact.path]),artifact.hash);}
    for(const reportMode of ['full','compact']){
        const report=await analyzeFixtureScoreReplay({...f.options,reportMode});
        reportEqual(report,expected.reports[reportMode]);assert.equal(hash(JSON.stringify(report)+'\n'),expected.hashes[reportMode]);
        assert.equal(report.scoring.sources[0].integrity,'verified');
        assert.equal(report.scoring.sources[0].validation.json,'valid');
        if(name==='numeric-frames'&&reportMode==='full')assert.deepEqual(report.scoring.sources[0].validation.items.assessments.filter(a=>a.itemId==='player1-score').map(a=>a.status),['invalid','invalid','valid','valid','invalid','valid']);
    }
    assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});
});

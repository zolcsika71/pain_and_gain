import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawn,spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {analyzeFixtureReplay} from '../../tools/replay-analysis-fixture.js';
import {analyzeReplay,createReplayAnalysisSession} from '../../tools/replay-analysis.js';
import {recordOwner,recordKey} from '../../tools/replay-store.js';
import {digestChunks,payloadChunks,payloadPath,iterateJson} from '../../tools/replay-store-payloads.js';
import {variants,fingerprint,replayId,buildId} from '../fixtures/replay-analysis-m2c-recipe.js';
import {makeFixture,inventory,hash,chunks,key} from '../fixtures/replay-analysis-m2c-store.js';

const golden=JSON.parse(fs.readFileSync(new URL('../fixtures/replay-analysis-m2c-oracle.json',import.meta.url)));
const emptyGolden=JSON.parse(fs.readFileSync(new URL('../fixtures/replay-analysis-m2c-empty-oracle.json',import.meta.url)));
const dbPath=f=>path.join(f.root,JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).database);
async function fixture(t,schema=1,variant='scale',options) {
    const f=await makeFixture(schema,variant,options);
    t.after(()=>{f.h.close();fs.rmSync(f.root,{recursive:true,force:true});});return f;
}
function v2(t,f) {
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-m2c-v2-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true})); fs.mkdirSync(path.join(root,'replay_logs'));
    for(const [name,content] of Object.entries(f.data.files))fs.writeFileSync(path.join(root,'replay_logs',name),content);
    fs.writeFileSync(path.join(root,'replay_logs/manifest.json'),JSON.stringify(f.data.manifest));return root;
}
async function rejectsUnchanged(f, expected) {
    const before=inventory(f.root);await assert.rejects(analyzeFixtureReplay(f.options),expected);
    assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});
}
function corrupt(f, sql, params=[]) {const db=new DatabaseSync(dbPath(f));try{db.prepare(sql).run(...params);}finally{db.close();}}

for(const schema of [1,2])for(const kind of ['property','payload'])for(const range of ['safe','bigint'])test(`M2c iterator: schema ${schema} ${kind} ${range} ordinals`,async t=>{
    const f=await fixture(t,schema),owner=recordOwner(key(3));
    const ordinals=range==='safe'?[100,101]:[9007199254740993n,9223372036854775807n];
    const pointers=['/ordinalProbe','/ordinalProbeMax'],values=[null,0],refs=[];
    await f.s.withWriter(async w=>{
        if(kind==='property')w.transaction(tx=>{
            for(const i of [1,0])tx.setProperty({owner,pointer:pointers[i],ordinal:ordinals[i],value:values[i]});
        });
        else {
            const inputs=pointers.map((pointer,i)=>{const content=Buffer.from(JSON.stringify(values[i]));return{owner,pointer,role:'extensions',content,...digestChunks(chunks(content))};});
            w.transaction(tx=>tx.appendIntent({id:'ordinal-probes',recordKey:key(3),files:[1,0].map(i=>({
                ordinal:ordinals[i],path:payloadPath(f.s.storeId,owner,pointers[i],'extensions',inputs[i].expectedHash),
                hash:inputs[i].expectedHash,bytes:inputs[i].expectedBytes,payload:{owner,pointer:pointers[i],role:'extensions'},
            }))}));
            for(const input of inputs)refs.push(await w.publishPayload({...input,source:chunks(input.content)}));
            w.transaction(tx=>{
                tx.finishPublication({recordKey:key(3),operationId:'ordinal-probes'});
                refs.forEach((payloadRef,i)=>tx.setProperty({owner,pointer:pointers[i],ordinal:100+i,payloadRef}));
            });
        }
    });
    // Public paging proves exact storage and normal safe-integer normalization;
    // the snapshot exercises the separate iterator decoding paths.
    const rows=(kind==='property'?f.s.pageProperties(owner):f.s.pagePayloads(owner)).rows.filter(r=>pointers.includes(r.pointer));
    assert.deepEqual(rows.map(r=>r.pointer),pointers);assert.deepEqual(rows.map(r=>r.ordinal),ordinals);
    const before=inventory(f.root),native={open:fs.openSync,close:fs.closeSync},handles=new Set();let opened=0,closed=0;
    fs.openSync=(p,...args)=>{const fd=native.open(p,...args);if(/\/(diagnostics|extensions)\//.test(String(p))||String(p).endsWith('.jsonl')||String(p).includes('/pain_and_gain_map_')){handles.add(fd);opened++;}return fd;};
    fs.closeSync=fd=>{if(handles.delete(fd))closed++;return native.close(fd);};
    let escaped;
    try {
        const selection={recordKeys:[0,1,2,3].map(key)};
        await f.s.withReadSnapshot(selection,async view=>{
            escaped=view;
            if(kind==='property')assert.deepEqual(view.properties.get(JSON.stringify(owner)).filter(r=>pointers.includes(r.pointer)).map(r=>r.ordinal),ordinals);
            else for(const [i,pointer] of pointers.entries()) {
                const ref=view.payload(owner,pointer),items=[];
                assert.equal(ref.bytes,refs[i].bytes);assert.equal(typeof ref.bytes,'number');
                for await(const item of iterateJson(view,ref))items.push(item.value);
                assert.deepEqual(items,[values[i]]);
            }
        });
        assert.throws(()=>escaped.assertOpen(),{code:'CLOSED'});
        await assert.rejects(f.s.withReadSnapshot(selection,()=>{throw null;}),error=>error===null);
        for(const reportMode of ['full','compact'])assert.deepEqual(await analyzeFixtureReplay({...f.options,reportMode}),golden.scenarios.scale.reports[reportMode]);
    } finally {
        Object.assign(fs,{openSync:native.open,closeSync:native.close});
        assert.ok(opened>0);assert.equal(closed,opened);assert.equal(handles.size,0);
        assert.deepEqual(inventory(f.root),before);assert.equal(fs.existsSync(path.join(f.root,'.manifest.lock')),false);
        // Also works after a setup rejection on the pre-correction code.
        await f.s.withReadSnapshot({recordKeys:[key(0)]},view=>assert.equal(view.records.size,1));
        await f.s.withWriter(()=>{});
    }
});

for(const [scenario,expected] of Object.entries(emptyGolden.scenarios))for(const reportMode of ['full','compact'])test(`M2c correction: frozen v2 ${scenario} ${reportMode}`,async t=>{
    const f=await fixture(t),root=v2(t,f);
    if(scenario==='empty-manifest')fs.writeFileSync(path.join(root,'replay_logs/manifest.json'),JSON.stringify({version:2,maps:[],replays:[],records:[]}));
    const before=inventory(root);
    const actual=analyzeReplay({root,replayId,...expected.selection,reportMode});
    assert.deepEqual(actual,expected.reports[reportMode]);
    assert.equal(hash(JSON.stringify(actual)+'\n'),expected.hashes[reportMode]);
    assert.deepEqual(inventory(root),before);
});

for(const schema of [1,2])for(const kind of ['mixed','large'])test(`M2c correction: schema ${schema} exact ${kind} ordinals`,async()=>{
    const result=await child(['--experimental-test-module-mocks',new URL('../fixtures/replay-analysis-m2c-worker.js',import.meta.url).pathname,'ordinals',String(schema),kind],15000);
    assert.equal(result.result.passed,true);
});

for(const schema of [1,2])for(const primary of ['error','null','none'])test(`M2c correction: schema ${schema} setup ${primary} survives database close failure`,async t=>{
    const f=await fixture(t,schema),before=inventory(f.root);
    const native={prepare:DatabaseSync.prototype.prepare,closeDb:DatabaseSync.prototype.close,open:fs.openSync,close:fs.closeSync,stat:fs.fstatSync};
    const setupError=primary==='null'?null:new Error('primary setup failure'),closeError=new Error('database close failure');
    let target,closeAttempts=0,injected=false,opened=0,closed=0;
    const handles=new Set();
    DatabaseSync.prototype.prepare=function(sql){if(sql==='SELECT * FROM records WHERE collection=? AND replay_id=? AND fingerprint=?')target=this;return native.prepare.call(this,sql);};
    DatabaseSync.prototype.close=function(){if(this===target){closeAttempts++;native.closeDb.call(this);throw closeError;}return native.closeDb.call(this);};
    fs.openSync=(p,...args)=>{const fd=native.open(p,...args);if(/\/(diagnostics|extensions)\//.test(String(p))||String(p).endsWith('.jsonl')||String(p).includes('/pain_and_gain_map_')){handles.add(fd);opened++;}return fd;};
    fs.closeSync=fd=>{if(handles.delete(fd))closed++;return native.close(fd);};
    fs.fstatSync=fd=>{if(primary!=='none'&&handles.has(fd)&&opened===2&&!injected){injected=true;throw setupError;}return native.stat(fd);};
    try {
        await assert.rejects(analyzeFixtureReplay(f.options),error=>error===(primary==='none'?closeError:setupError));
        assert.equal(closeAttempts,1);assert.equal(injected,primary!=='none');
        assert.ok(opened>=2);assert.equal(closed,opened);assert.equal(handles.size,0);
    } finally {
        DatabaseSync.prototype.prepare=native.prepare;DatabaseSync.prototype.close=native.closeDb;
        Object.assign(fs,{openSync:native.open,closeSync:native.close,fstatSync:native.stat});
    }
    assert.deepEqual(inventory(f.root),before);assert.equal(fs.existsSync(path.join(f.root,'.manifest.lock')),false);
    await f.s.withWriter(()=>{});assert.deepEqual(await analyzeFixtureReplay(f.options),golden.scenarios.scale.reports.full);
});
async function extension(f,pointer,content) {
    const owner=recordOwner(key(3));let ref;
    await f.s.withWriter(async w=>{
        ref=await w.publishPayload({owner,pointer,role:'extensions',evidenceOnly:true,source:chunks(content),...digestChunks(chunks(content))});
        w.transaction(tx=>{tx.finishPublication({recordKey:key(3),payloadRefs:[ref]});tx.setProperty({owner,pointer,ordinal:100,payloadRef:ref});});
    });return ref;
}

for(const schema of [1,2])for(const variant of variants)test(`schema ${schema}: independent frozen ${variant} full/compact parity and preservation`,async t=>{
    const f=await fixture(t,schema,variant),before=inventory(f.root),legacyRoot=v2(t,f);
    for(const reportMode of ['full','compact']) {
        const expected=golden.scenarios[variant].reports[reportMode];
        assert.deepEqual(analyzeReplay({...f.options,root:legacyRoot,reportMode}),expected);
        const actual=await analyzeFixtureReplay({...f.options,reportMode});
        assert.deepEqual(actual,expected);assert.equal(hash(JSON.stringify(actual)+'\n'),golden.scenarios[variant].hashes[reportMode]);
    }
    assert.deepEqual(inventory(f.root),before);
});

test('explicit subset, request permutation, local-build provenance and original unknown values',async t=>{
    const f=await fixture(t,1,'unicode');
    assert.deepEqual(await analyzeFixtureReplay({...f.options,fingerprints:[...f.options.fingerprints].reverse()}),golden.scenarios.unicode.reports.full);
    for(const selection of [[fingerprint(3)],[fingerprint(2),fingerprint(0)]]) {
        fs.mkdirSync(path.join(f.root,'src/debug'),{recursive:true});fs.writeFileSync(path.join(f.root,'src/debug/build-id.js'),`export const buildId = '${buildId}';\n`);
        for(const reportMode of ['compact','full']) {
            const report=await analyzeFixtureReplay({...f.options,fingerprints:selection,reportMode});
            assert.deepEqual(report.selectedFingerprints,[...selection].sort());
            if(reportMode==='compact'){assert.equal(report.evidenceSummary.selectedLogRecords,selection.length);assert.equal(report.evidenceSummary.trustedLogRecords,selection.length);assert.equal(report.evidenceSummary.buildProvenance.status,'local-source-match');}
            else assert.ok(report.findings.some(f=>f.provenance.status==='local-source-match'));
        }
    }
});

test('actual synchronous v2 CLI, missing selection and score API stay SQLite-free',async t=>{
    const f=await fixture(t),root=v2(t,f);
    fs.cpSync(new URL('../../tools/',import.meta.url),path.join(root,'tools'),{recursive:true});
    fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
    const deny='data:text/javascript,'+encodeURIComponent("import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLITE_FORBIDDEN');return n(s,c)}})");
    for(const reportMode of ['compact','full']) {
        const p=spawnSync(process.execPath,['--import',deny,path.join(root,'tools/replay-analysis.js'),replayId,...f.options.fingerprints,...(reportMode==='full'?['--full-detail']:[])],{encoding:'utf8',timeout:15000,maxBuffer:1048576});
        assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),golden.scenarios.scale.reports[reportMode]);
    }
    const code=`import assert from 'node:assert/strict';import {analyzeReplay} from ${JSON.stringify(new URL('../../tools/replay-analysis.js',import.meta.url).href)};const opts={root:process.argv[1],replayId:${JSON.stringify(replayId)},fingerprints:['f'.repeat(64)]};const report=analyzeReplay(opts);assert.ok(report.findings.some(f=>f.rule==='manifest.record-selection'&&f.verdict==='unknown'));const scores=analyzeReplay({...opts,scoreFingerprints:['e'.repeat(64)]});assert.deepEqual(scores.selectedScoreFingerprints,[]);`;
    const p=spawnSync(process.execPath,['--import',deny,'--input-type=module','-e',code,root],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr);
});

test('request selection is fixed before awaiting open; done/reviewer metadata is not lifecycle orchestration',async t=>{
    const f=await fixture(t,2,'m2');
    await f.s.withWriter(w=>w.transaction(tx=>{tx.setStatus({recordKey:key(0),status:'done'});tx.putReview({recordKey:key(0),taskId:'synthetic/retained',ordinal:0,value:{claimedAt:'fixed',examinedAt:null,completedAt:null}});}));
    const before=inventory(f.root),selection=[...f.options.fingerprints];
    const pending=analyzeFixtureReplay({...f.options,fingerprints:selection});selection.splice(0);
    assert.deepEqual(await pending,golden.scenarios.m2.reports.full);
    assert.deepEqual(inventory(f.root),before);assert.equal(f.s.getRecord(key(0)).status,'done');
});

test('missing selected map reports UNAVAILABLE without changing the fixture',async t=>{
    const f=await fixture(t);fs.unlinkSync(path.join(f.root,f.data.manifest.maps[0].file));
    await rejectsUnchanged(f,{code:'UNAVAILABLE'});
});

test('argument gates reject unsupported score requests, implicit/all selections and unsafe roots',async()=>{
    for(const options of [undefined,null,[],{scoreFingerprints:undefined},{extra:1}])await assert.rejects(analyzeFixtureReplay(options));
    const o={root:process.cwd(),schemaVersion:1,replayId,fingerprints:[fingerprint(0)]};
    for(const fingerprints of [undefined,[],['bad'],[fingerprint(0),fingerprint(0)]])await assert.rejects(analyzeFixtureReplay({...o,fingerprints}),{code:'INVALID_IDENTITY'});
    await assert.rejects(analyzeFixtureReplay({...o,fingerprints:Array.from({length:65},(_,i)=>fingerprint(i))}),{code:'RESOURCE_LIMIT'});
    await assert.rejects(analyzeFixtureReplay({...o,reportMode:'bad'}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(analyzeFixtureReplay({...o,schemaVersion:3}),{code:'UNSUPPORTED_STORE'});
    await assert.rejects(analyzeFixtureReplay(o),{code:'UNSAFE_PATH'});
});

for(const mode of ['missing','retired','pending','intent','output-pending','wrong-output-owner','null-hidden-output','map-link','missing-output','hash','unsafe','count','binding','overflow-hash','overflow-json','nonfinite','missing-reviews','inline-diagnostics','map-overflow'])test(`transport ${mode} rejects atomically before any report`,async t=>{
    const f=await fixture(t),r=f.data.manifest.records[0];
    if(mode==='missing') f.options.fingerprints=[fingerprint(99)];
    if(mode==='retired'){await f.s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'retired',key:recordKey(key(99)),ordinal:99})));f.options.fingerprints=[fingerprint(99)];}
    if(mode==='pending')await f.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:key(0),status:'pending'})));
    if(mode==='intent')await f.s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'unfinished',recordKey:key(0),phase:'cleanup'})));
    if(mode==='output-pending')corrupt(f,"UPDATE outputs SET state='pending' WHERE path=?",[r.outputPath]);
    if(mode==='wrong-output-owner')corrupt(f,'UPDATE outputs SET fingerprint=? WHERE path=?',[fingerprint(3),r.outputPath]);
    if(mode==='null-hidden-output')corrupt(f,'UPDATE records SET output_path=NULL,output_hash=NULL WHERE fingerprint=?',[fingerprint(0)]);
    if(mode==='map-link')corrupt(f,"UPDATE replays SET map_id=NULL");
    if(mode==='missing-output')fs.unlinkSync(path.join(f.root,r.outputPath));
    if(mode==='hash'){const b=Buffer.from(f.data.files[r.outputPath]);b[5]^=1;fs.writeFileSync(path.join(f.root,r.outputPath),b);}
    if(mode==='unsafe'){fs.renameSync(path.join(f.root,r.outputPath),path.join(f.root,'saved'));fs.symlinkSync(path.join(f.root,'saved'),path.join(f.root,r.outputPath));}
    if(mode==='count')corrupt(f,"UPDATE payloads SET items=1 WHERE pointer='/otherEntries'");
    if(mode==='binding')corrupt(f,"UPDATE properties SET payload_pointer='/otherEntries/overflow' WHERE pointer='/otherEntries'");
    if(mode.startsWith('overflow-')){const ref=f.refs[0][1],p=path.join(f.root,ref.path),b=fs.readFileSync(p);b[0]=120;fs.writeFileSync(p,b);if(mode==='overflow-json')corrupt(f,'UPDATE payloads SET hash=? WHERE path=?',[hash(b),ref.path]);}
    if(mode==='nonfinite')await extension(f,'/unknown',Buffer.from('1e400'));
    if(mode==='missing-reviews')corrupt(f,"DELETE FROM properties WHERE pointer='/reviews'");
    if(mode==='inline-diagnostics')await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:recordOwner(key(0)),pointer:'/otherEntries',ordinal:15,value:[]})));
    if(mode==='map-overflow') {const db=new DatabaseSync(dbPath(f));try{db.exec("PRAGMA foreign_keys=OFF;UPDATE properties SET value=NULL,payload_pointer='/future' WHERE owner_kind='map' AND pointer='/registeredAt'");}finally{db.close();}}
    await rejectsUnchanged(f);
});

test('root-payload properties retain exact JSON values; 1 MiB limit and limit+1 reject without writes',async t=>{
    const f=await fixture(t,2,'unicode');
    await extension(f,'/unknown',Buffer.from(JSON.stringify({text:'é',n:null,z:0,b:false})));
    await analyzeFixtureReplay(f.options);
    await extension(f,'/at-limit',Buffer.from('"'+'x'.repeat(1048574)+'"'));
    await analyzeFixtureReplay(f.options);
    await extension(f,'/too-large',Buffer.from('"'+'x'.repeat(1048575)+'"'));
    await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'});
});

test('snapshot metadata/handle budgets reject before analysis; no lifecycle writes',async t=>{
    for(const mode of ['metadata','handles']) {
        const f=await fixture(t,1,'m2');
        if(mode==='metadata')await f.s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<145;i++)tx.setProperty({owner:recordOwner(key(0)),pointer:`/field-${i}`,ordinal:100+i,value:'x'.repeat(60000)});}));
        else for(let i=0;i<253;i++)await extension(f,`/handle-${i}`,Buffer.from('null'));
        await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'});
    }
});

for(const mode of ['map-size','jsonl-line','jsonl-total','diagnostics-total','outer-wrapper','utf8'])test(`${mode} preflight limit/encoding rejection preserves input`,async t=>{
    const f=await fixture(t,1,'m2',{transform(data){
        const record=data.manifest.records[0];
        if(mode==='map-size')data.files[data.manifest.maps[0].file]+=' '.repeat(1048576);
        if(mode==='jsonl-line'||mode==='jsonl-total') {
            data.files[record.outputPath]=(mode==='jsonl-line'?'"'+'x'.repeat(1048576)+'"\n':('{}\n'+' '.repeat(65530)+'\n').repeat(257));
            record.outputFingerprint=hash(data.files[record.outputPath]);
        }
        if(mode==='diagnostics-total')for(const r of data.manifest.records)r.otherEntries=Array.from({length:5},(_,i)=>({key:String(i),raw:'x'.repeat(900000),type:'other'}));
        if(mode==='outer-wrapper')record.otherEntries=[null];
    }});
    if(mode==='utf8') {
        const ref=f.refs[0][0],b=fs.readFileSync(path.join(f.root,ref.path));b[5]=255;fs.writeFileSync(path.join(f.root,ref.path),b);
        corrupt(f,'UPDATE payloads SET hash=? WHERE path=?',[hash(b),ref.path]);
    }
    await rejectsUnchanged(f,['outer-wrapper','utf8'].includes(mode)?undefined:{code:'RESOURCE_LIMIT'});
});

test('local provenance bounds, unsafe aliases and explicit schema identity remain fail-closed',async t=>{
    const f=await fixture(t,2,'m2');
    await assert.rejects(analyzeFixtureReplay({...f.options,root:f.root+'/.'}),{code:'UNSAFE_PATH'});
    await assert.rejects(analyzeFixtureReplay({...f.options,schemaVersion:1}),{code:'UNSUPPORTED_STORE'});
    fs.mkdirSync(path.join(f.root,'src/debug'),{recursive:true});
    fs.writeFileSync(path.join(f.root,'src/debug/build-id.js'),'x'.repeat(16385));
    await rejectsUnchanged(f,{code:'RESOURCE_LIMIT'});
});

test('adapter read-side recovery refusal preserves a fresh hot-journal fixture',async t=>{
    const f=await fixture(t,1,'m2');f.h.close();
    const code="import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA synchronous=FULL;PRAGMA cache_size=8;BEGIN IMMEDIATE');const q=db.prepare('INSERT INTO properties VALUES (?,?,?,?,?,NULL)');for(let i=0;i<1000;i++)q.run('root','root','/crash'+i,i,JSON.stringify('x'.repeat(60000)));process.kill(process.pid,'SIGKILL');";
    const p=spawnSync(process.execPath,['--input-type=module','-e',code,dbPath(f)],{timeout:15000});assert.equal(p.signal,'SIGKILL');
    const before=inventory(f.root);await assert.rejects(analyzeFixtureReplay(f.options),{code:'RECOVERY_REQUIRED'});assert.deepEqual(inventory(f.root),before);
});

test('pinned accessors reject unselected and escaped capabilities and retain normal handle lifetime',async t=>{
    const f=await fixture(t);let escaped,ref;
    await f.s.withReadSnapshot({recordKeys:[key(0)]},async view=>{
        escaped=view;ref=view.output(key(0));assert.equal(ref.path,f.data.manifest.records[0].outputPath);
        assert.throws(()=>view.output(key(3)),{code:'INVALID_REFERENCE'});
        assert.throws(()=>view.mapArtifact('0'.repeat(64)),{code:'INVALID_REFERENCE'});
        const parts=[];for await(const b of payloadChunks(view,ref))parts.push(b);
        assert.equal(Buffer.concat(parts).toString(),f.data.files[ref.path]);
    });
    assert.throws(()=>escaped.output(key(0)),{code:'CLOSED'});
    assert.throws(()=>escaped.mapArtifact(f.data.manifest.maps[0].id),{code:'CLOSED'});
    await assert.rejects(async()=>{for await(const b of payloadChunks(escaped,ref))assert.fail(b);},{code:'CLOSED'});
});

test('inspection/read/close failures close every descriptor, preserve primary null and permit later reads',async t=>{
    const f=await fixture(t);
    for(const failure of ['inspect','read','read-null','close','read-null-close','inspect-close']) {
        const before=inventory(f.root),native={open:fs.openSync,close:fs.closeSync,stat:fs.fstatSync,read:fs.readSync};
        const handles=new Set();let opened=0,closed=0,injected=false,closeInjected=false;
        const artifact=p=>/\/(diagnostics|extensions)\//.test(String(p))||String(p).endsWith('.jsonl')||String(p).includes('/pain_and_gain_map_');
        fs.openSync=(p,...a)=>{const fd=native.open(p,...a);if(artifact(p)){handles.add(fd);opened++;}return fd;};
        fs.closeSync=fd=>{const ours=handles.delete(fd);native.close(fd);if(ours){closed++;if(failure.includes('close')&&!closeInjected){closeInjected=true;throw Error('close failure');}}};
        fs.fstatSync=fd=>{if(handles.has(fd)&&opened===2&&failure.startsWith('inspect')&&!injected){injected=true;throw Error('inspection failure');}return native.stat(fd);};
        fs.readSync=(fd,...a)=>{if(handles.has(fd)&&failure.startsWith('read')&&!injected){injected=true;if(failure.includes('null'))throw null;throw Error('read failure');}return native.read(fd,...a);};
        try{await assert.rejects(analyzeFixtureReplay(f.options),e=>failure.includes('null')?e===null:e.message.startsWith(failure.startsWith('inspect')?'inspection':failure.startsWith('read')?'read':'close'));assert.equal(handles.size,0);assert.equal(closed,opened);}
        finally{Object.assign(fs,{openSync:native.open,closeSync:native.close,fstatSync:native.stat,readSync:native.read});}
        assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});await analyzeFixtureReplay(f.options);
    }
});

test('session requires ordered complete input and single finish',async t=>{
    const f=await fixture(t,1,'m2'),map=f.data.manifest.maps[0],make=()=>createReplayAnalysisSession({replayId,fingerprints:f.options.fingerprints,reportMode:'full',localBuildId:null,logicalManifest:f.data.manifest,mapEvidence:{[map.file]:{bytes:Buffer.from(f.data.files[map.file])}}});
    const session=make();assert.throws(()=>session.finish(),/incomplete/);
    assert.throws(()=>session.acceptRecord(f.data.manifest.records[1]),/ordered/);
    const good=make();for(const r of f.data.manifest.records)good.acceptRecord(r,r.outputPath?{bytes:Buffer.from(f.data.files[r.outputPath])}:null);
    assert.deepEqual(good.finish(),golden.scenarios.m2.reports.full);assert.throws(()=>good.finish(),/ended/);
});

// Real subprocess barriers and accessor/session instrumentation live in a worker;
// no instrumentation API is added to the implementation.
async function child(args,deadline) {
    const start=performance.now(),p=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});let out='',err='',expired=false,killer,reaper,rejectReap;
    const stop=()=>{if(expired)return;expired=true;p.kill('SIGTERM');killer=setTimeout(()=>{p.kill('SIGKILL');reaper=setTimeout(()=>rejectReap(Error('Worker did not reap within shutdown budget')),3000);},2000);};
    const timer=setTimeout(stop,deadline);
    for(const [stream,which] of [[p.stdout,'out'],[p.stderr,'err']])stream.on('data',c=>{const next=Buffer.concat([Buffer.from(which==='out'?out:err),c]);if(next.length>1048576)stop();const retained=next.subarray(0,1048576).toString();if(which==='out')out=retained;else err=retained;});
    const result=await new Promise((resolve,reject)=>{rejectReap=reject;p.once('error',reject);p.once('close',(code,signal)=>resolve({code,signal}));});
    clearTimeout(timer);clearTimeout(killer);clearTimeout(reaper);
    assert.equal(expired,false,err);assert.equal(result.code,0,out+err);return {result:JSON.parse(out),elapsedMs:performance.now()-start,...result};
}
test('callback/session failures and real competing cleanup keep pinned artifacts coherent',async()=>{
    const result=await child(['--experimental-test-module-mocks',new URL('../fixtures/replay-analysis-m2c-worker.js',import.meta.url).pathname,'faults'],30000);
    assert.equal(result.result.passed,true);
});

for(const schema of [1,2])test(`M2c schema ${schema} independent 10/1000 and 600 MiB fixed-selection gate`,{timeout:155000},async t=>{
    const roots=[10,1000].map(()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-')));
    t.after(()=>roots.forEach(root=>fs.rmSync(root,{recursive:true,force:true})));
    const runs=[];
    for(const phase of ['generate','operations','preservation'])runs.push(await child(['--experimental-test-module-mocks','--max-old-space-size=192',new URL('../fixtures/replay-analysis-m2c-worker.js',import.meta.url).pathname,phase,String(schema),...roots],phase==='operations'?30000:60000));
    assert.deepEqual(runs[2].result.inventoryHashes,runs[0].result.stores.map(s=>s.inventoryHash));
    t.diagnostic(JSON.stringify({schema,runs}));
});

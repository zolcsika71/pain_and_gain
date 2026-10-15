import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {analyzeSyntheticReplay as analyze} from '../../tools/replay-analysis-command-fixture.js';
import {analyzeReplay} from '../../tools/replay-analysis.js';
import {loadFixtureLogs} from '../../tools/replay-analysis-fixture.js';
import {DatabaseSync} from 'node:sqlite';
import {recordKey} from '../../tools/replay-store.js';
import {fixture,inventory} from '../fixtures/replay-analysis-command-fixture.js';
import {logical} from '../fixtures/replay-log-review-command-fixture.js';
const sameReport=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const v2=(f,q)=>analyzeReplay({root:f.v2,replayId:q.replayId,fingerprints:q.fingerprints??[],scoreFingerprints:q.scoreFingerprints,reportMode:q.reportMode});
async function unchanged(f,op){const before=inventory(f.root),state=logical(f.root);try{return await op();}finally{assert.deepEqual(logical(f.root),state);assert.deepEqual(inventory(f.root),before);}}
for(const[kind,variants]of [['log',['cpu','overlap','conflict']],['score',['metadata','frames','conflict','malformed']],['combined',['scale','reverse-mapping','unaligned','conflicting-mapping']]])for(const variant of variants)for(const reportMode of ['full','compact'])test(`synthetic analysis parity ${kind} ${variant} ${reportMode}`,async t=>{
    const f=await fixture(t,kind,variant),q={...f.q,reportMode};const result=await unchanged(f,()=>analyze(q));sameReport(result,v2(f,q));
});
test('synthetic analysis CLI log and score-only results equal v2, with semantic failure exits',async t=>{
    for(const kind of ['log','score']){
        const f=await fixture(t,kind,kind==='log'?'cpu':'metadata'),args=['tools/replay-analysis.js','--synthetic-sqlite',f.root,f.q.replayId,...(f.q.fingerprints??[]),...(f.q.scoreFingerprints?['--score',...f.q.scoreFingerprints]:[])];
        const expected=v2(f,{...f.q,reportMode:'compact'});const result=await unchanged(f,async()=>spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024**2}));assert.equal(result.status,expected.summary.fail?1:0,result.stderr);sameReport(JSON.parse(result.stdout),expected);
    }
});
test('synthetic analysis preserves nonempty original review metadata without review commands',async t=>{
    const reviews={'synthetic/active':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:{nil:null,order:[2,1]}}};
    const f=await fixture(t,'log','cpu',{transform:d=>{d.manifest.records[0].reviews=structuredClone(reviews);}});
    assert.deepEqual(f.data.manifest.records[0].reviews,reviews);sameReport(await unchanged(f,()=>analyze(f.q)),v2(f,f.q));
});
test('synthetic analysis selection excludes every unselected diagnostic/output; preserves wrapper order',async t=>{
    const f=await fixture(t,'log','scale'),q={...f.q,fingerprints:[f.q.fingerprints[0]]},blocked=new Set(f.refs.slice(1).flat().map(r=>path.join(f.root,r.path)));for(const r of f.data.manifest.records.slice(1))if(r.outputPath)blocked.add(path.join(f.root,r.outputPath));
    const open=fs.openSync;let attempts=0;
    await unchanged(f,async()=>{
        fs.openSync=(p,...rest)=>{if(blocked.has(p)){attempts++;throw Error('unselected evidence opened');}return open(p,...rest);};
        try{sameReport(await analyze(q),v2(f,q));await f.s.withReadSnapshot({recordKeys:[{collection:'log',replayId:q.replayId,fingerprint:q.fingerprints[0]}]},async view=>{const loaded=await loadFixtureLogs(view,{replayId:q.replayId});assert.deepEqual(loaded.logicalManifest.records[0].otherEntries,f.data.manifest.records[0].otherEntries);});}finally{fs.openSync=open;}
    });assert.equal(attempts,0);
});
test('synthetic analysis score-only never opens log diagnostics or map payloads',async t=>{
    const f=await fixture(t,'combined'),q={...f.q,fingerprints:[]},blocked=new Set([path.join(f.root,f.data.manifest.maps[0].file),...f.refs.filter(r=>r.key.collection==='log').flatMap(r=>r.refs.map(v=>path.join(f.root,v.path))),...f.data.manifest.records.filter(r=>r.outputPath).map(r=>path.join(f.root,r.outputPath))]),open=fs.openSync;let n=0;
    await unchanged(f,async()=>{fs.openSync=(p,...rest)=>{if(blocked.has(p)){n++;throw Error('log payload opened by score-only selection');}return open(p,...rest);};try{sameReport(await analyze(q),v2(f,q));}finally{fs.openSync=open;}});assert.equal(n,0);
});
for(const kind of ['log','score'])for(const defect of ['missing','corrupt','identity'])test(`synthetic analysis rejects ${kind} ${defect} as transport, not findings`,async t=>{
    const f=await fixture(t,kind,kind==='log'?'cpu':'metadata');
    const record=(kind==='log'?f.data.manifest.records:f.data.manifest.scoreRecords)[0],file=path.join(f.root,record.outputPath);
    if(defect==='missing')fs.renameSync(file,file+'.retained');
    if(defect==='corrupt')fs.appendFileSync(file,'!');
    if(defect==='identity'){
        const d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,d.database));try{db.prepare("UPDATE properties SET value=? WHERE owner_kind='record' AND owner_key=? AND pointer='/fingerprint'").run(JSON.stringify('e'.repeat(64)),recordKey({collection:kind,replayId:f.q.replayId,fingerprint:record.fingerprint}));}finally{db.close();}
    }
    await unchanged(f,()=>assert.rejects(analyze(f.q),e=>['UNAVAILABLE','INVALID_ARTIFACT','INVALID_REFERENCE','ENOENT'].includes(e.code)));
});
test('synthetic analysis rejects an oversized individual diagnostic without truncation',async t=>{
    const f=await fixture(t,'log','cpu',{transform:d=>{d.manifest.records[0].otherEntries=[{key:'0',type:'other',raw:'x'.repeat(1048577)}];}});
    await unchanged(f,()=>assert.rejects(analyze(f.q),{code:'RESOURCE_LIMIT'}));
});
const base={synthetic:true,root:'/forbidden',replayId:'b'.repeat(24),fingerprints:['0'.repeat(64)]};
for(const[extra,code]of [[{fingerprints:[]},'INVALID_IDENTITY'],[{fingerprints:[],scoreFingerprints:[]},'INVALID_IDENTITY'],[{scoreFingerprints:[]},'INVALID_IDENTITY'],[{fingerprints:['0'.repeat(64),'0'.repeat(64)]},'INVALID_IDENTITY'],[{fingerprints:Array.from({length:65},(_,i)=>i.toString(16).padStart(64,'0'))},'RESOURCE_LIMIT'],[{fingerprints:Array.from({length:33},(_,i)=>i.toString(16).padStart(64,'0')),scoreFingerprints:Array.from({length:32},(_,i)=>i.toString(16).padStart(64,'0'))},'RESOURCE_LIMIT'],[{taskId:'test'},'UNSUPPORTED_OPTION'],[{recover:true},'UNSUPPORTED_OPTION'],[{reportMode:'all'},'INVALID_ARGUMENT']])test('synthetic analysis rejects empty/unsupported/over-limit request '+JSON.stringify(extra).slice(0,70),async()=>{
    const open=fs.openSync;let n=0;fs.openSync=(...a)=>{n++;return open(...a);};try{await assert.rejects(analyze({...base,...extra}),{code});assert.equal(n,0);}finally{fs.openSync=open;}
});
test('synthetic analysis snapshots options and arrays; accessors never execute',async t=>{
    let calls=0;await assert.rejects(analyze({...base,get root(){calls++;return '/forbidden';}}),{code:'INVALID_ARGUMENT'});const a=['0'.repeat(64)];Object.defineProperty(a,'0',{get(){calls++;return '0'.repeat(64);}});await assert.rejects(analyze({...base,fingerprints:a}),{code:'INVALID_IDENTITY'});assert.equal(calls,0);
    const f=await fixture(t,'log','cpu'),q={...f.q,fingerprints:[f.q.fingerprints[0]],reportMode:'compact'},expected=v2(f,q);
    await unchanged(f,async()=>{const op=analyze(q);q.root='/forbidden';q.replayId='e'.repeat(24);q.fingerprints.fill('f'.repeat(64));sameReport(await op,expected);});
});
test('synthetic analysis rejects protected roots and misplaced CLI mode without evidence access',async()=>{
    for(const root of [process.cwd(),'/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-forbidden'])await assert.rejects(analyze({...base,root}),{code:'UNSAFE_PATH'});
    const r=spawnSync(process.execPath,['tools/replay-analysis.js','b'.repeat(24),'--synthetic-sqlite'],{encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.equal(r.stdout,'');
});
test('ordinary analyzer import does not load SQLite',()=>{
    const script=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){if(s==='node:sqlite')throw Error('unexpected SQLite');return next(s,c);}});await import('./tools/replay-analysis.js');console.log('imported');`;
    const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'imported');
});

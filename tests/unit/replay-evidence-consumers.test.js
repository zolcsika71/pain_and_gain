import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {buildSyntheticHistoricalIndex as index, screenSyntheticReplay as screen, readSyntheticSelection} from '../../tools/replay-evidence-consumers-fixture.js';
import {buildHistoricalIndex} from '../../tools/historical-index.js';
import {mapChecksum,sha256,summarizeDiagnosticCoverage} from '../../tools/replay-logs.js';
import {fixture,inventory} from '../fixtures/replay-analysis-command-fixture.js';
import {logical} from '../fixtures/replay-log-review-command-fixture.js';
const taskId='codex/synthetic-consumers',buildId='a'.repeat(64);
const deps=['tools/historical-index.js','tools/scout-hold-screen.js','tools/replay-analysis.js','tools/replay-score-analysis.js','tools/replay-logs.js','tools/replay-authority-guard.js','tools/replay-store-payloads.js','tools/retrieval-files.js','src/config.js','src/debug/build-id.js'];
const claim=d=>{for(const r of [...d.manifest.records,...(d.manifest.scoreRecords??[])])r.reviews={[taskId]:{claimedAt:'synthetic',examinedAt:'synthetic',completedAt:null,unknown:[null,false]},other:{claimedAt:'prior'}};};
async function make(t,kind='log',variant='cpu',transform){
    const f=await fixture(t,kind,variant,{transform:d=>{claim(d);transform?.(d);}});
    for(const p of deps){fs.mkdirSync(path.dirname(path.join(f.v2,p)),{recursive:true});if(p.startsWith('tools/'))fs.copyFileSync(p,path.join(f.v2,p));else fs.writeFileSync(path.join(f.v2,p),'// synthetic reference');}
    fs.writeFileSync(path.join(f.v2,'package.json'),'{"type":"module"}');
    return f;
}
const match=f=>({replayId:f.q.replayId,logFingerprints:f.q.fingerprints??[],...(f.q.scoreFingerprints?{scoreFingerprints:f.q.scoreFingerprints}:{}),opponent:'synthetic opponent',configuration:{label:'synthetic',basis:'generated fixture',expectedBuildId:buildId},reportedFinalTick:8});
const request=f=>({synthetic:true,root:f.root,selection:{version:1,taskId,matches:[match(f)]}});
const screening=f=>({synthetic:true,root:f.root,replayId:f.q.replayId,taskId,expectedBuildId:buildId,fingerprints:f.q.fingerprints});
async function unchanged(f,op){const before=inventory(f.root),rows=logical(f.root);try{return await op();}finally{assert.deepEqual(logical(f.root),rows);assert.deepEqual(inventory(f.root),before);}}
const noCache=result=>({...result,matches:result.matches.map(m=>({...m,cache:m.cache==='none'?'none':'disabled'}))});
const sameIndex=(actual,expected)=>assert.deepEqual(structuredClone(actual),expected);
for(const[kind,variant]of [['log','cpu'],['log','overlap'],['log','conflict'],['score','metadata'],['score','frames'],['combined','scale'],['combined','conflicting-mapping']])test(`historical parity ${kind} ${variant}`,async t=>{
    const f=await make(t,kind,variant),q=request(f);
    sameIndex(await unchanged(f,()=>index(q)),noCache(buildHistoricalIndex({root:f.v2,selection:q.selection})));
});
for(const variant of ['cpu','scale','overlap'])test(`scout screen parity ${variant}`,async t=>{
    const f=await make(t,'log',variant),{screenReplay}=await import(pathToFileURL(path.join(f.v2,'tools/scout-hold-screen.js')));
    const expected=screenReplay(f.q.replayId,taskId,buildId).report;
    assert.deepEqual((await unchanged(f,()=>screen(screening(f)))).report,expected);
});
test('historical ordering and missing/retired selections remain explicit without reading absent bodies',async t=>{
    const f=await make(t),q=request(f),missing='e'.repeat(64),retired='d'.repeat(64);
    // Generated metadata only: no retirement command or original artifact deletion.
    await f.s.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'retired',key:JSON.stringify(['log',f.q.replayId,retired]),ordinal:0,value:{}});
        tx.setProperty({owner:{kind:'replay',key:f.q.replayId},pointer:'/retiredFingerprints',ordinal:6,value:[retired]});
    }));
    const m=q.selection.matches[0];m.logFingerprints=[f.q.fingerprints[2],missing,retired,f.q.fingerprints[0]];
    const result=await unchanged(f,()=>index(q)),row=result.matches[0];
    assert.deepEqual(row.selectedEvidence.map(r=>r.fingerprint),m.logFingerprints);
    assert.deepEqual(row.unavailable,[{kind:'log',fingerprint:missing,reason:'missing'},{kind:'log',fingerprint:retired,reason:'retired'}]);assert.equal(row.status,'partial');
    m.logFingerprints=[retired,missing];const absent=await unchanged(f,()=>index(q));assert.equal(absent.matches[0].status,'unavailable');assert.equal(absent.matches[0].cache,'none');
    await unchanged(f,()=>assert.rejects(screen({...screening(f),fingerprints:[missing]}),{code:'UNAVAILABLE'}));
});
test('historical and scout explicit selections exclude unselected payloads and preserve order',async t=>{
    const f=await make(t,'log','scale'),q=request(f);q.selection.matches[0].logFingerprints=[f.q.fingerprints[0]];
    const blocked=new Set(f.refs.slice(1).flat().map(r=>path.join(f.root,r.path)));for(const r of f.data.manifest.records.slice(1))if(r.outputPath)blocked.add(path.join(f.root,r.outputPath));
    const open=fs.openSync;let calls=0;
    await unchanged(f,async()=>{fs.openSync=(p,...a)=>{if(blocked.has(p)){calls++;throw Error('unselected payload');}return open(p,...a);};try{
        sameIndex(await index(q),noCache(buildHistoricalIndex({root:f.v2,selection:q.selection})));
        const result=await screen({...screening(f),fingerprints:[f.q.fingerprints[0]]});assert.deepEqual(result.report.evidence.fingerprints,[f.q.fingerprints[0]]);
    }finally{fs.openSync=open;}});assert.equal(calls,0);
});
for(const kind of ['log','score'])test(`claim gate ${kind} without review mutation`,async t=>{
    const f=await make(t,kind,kind==='log'?'cpu':'frames',d=>{for(const r of (kind==='log'?d.manifest.records:d.manifest.scoreRecords))r.reviews={other:{claimedAt:'prior'}};});
    await unchanged(f,()=>assert.rejects(index(request(f)),{code:'UNCLAIMED'}));if(kind==='log')await unchanged(f,()=>assert.rejects(screen(screening(f)),{code:'UNCLAIMED'}));
});
for(const defect of ['missing','corrupt','link','summary'])test(`strict selected evidence rejection ${defect}`,async t=>{
    const f=await make(t,'log',defect==='summary'?'summary':'cpu',defect==='link'?d=>{d.manifest.records[0].mapChecksum='f'.repeat(64);}:undefined);
    const p=path.join(f.root,f.data.manifest.records[0].outputPath);
    if(defect==='missing')fs.renameSync(p,p+'.retained');if(defect==='corrupt')fs.appendFileSync(p,'!');
    if(defect==='summary'){
        const result=await unchanged(f,()=>index(request(f)));assert.equal(result.matches[0].status,'invalid');
        await unchanged(f,()=>assert.rejects(screen(screening(f)),{code:'INVALID_EVIDENCE'}));
    }else for(const operation of [()=>index(request(f)),()=>screen(screening(f))])await unchanged(f,()=>assert.rejects(operation));
});
test('scout expected build conflict rejects without inferring or mutating',async t=>{
    const f=await make(t);await unchanged(f,()=>assert.rejects(screen({...screening(f),expectedBuildId:'f'.repeat(64)}),{code:'IDENTITY_CONFLICT'}));
});
test('oversized selected diagnostic rejects both consumers without truncation',async t=>{
    const f=await make(t,'log','cpu',d=>{d.manifest.records[0].otherEntries=[{key:'0',type:'other',raw:'x'.repeat(1048577)}];});
    for(const operation of [()=>index(request(f)),()=>screen(screening(f))])await unchanged(f,()=>assert.rejects(operation,{code:'RESOURCE_LIMIT'}));
});
test('nested options are stable across awaits and accessors never run',async t=>{
    let n=0;await assert.rejects(index({synthetic:true,get root(){n++;return '/forbidden';},selection:{}}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(index({synthetic:true,root:'/forbidden',selection:{get matches(){n++;return [];}}}),{code:'INVALID_ARGUMENT'});assert.equal(n,0);
    const f=await make(t),q=request(f),expected=noCache(buildHistoricalIndex({root:f.v2,selection:q.selection}));
    await unchanged(f,async()=>{const op=index(q);q.root='/forbidden';q.selection.taskId='codex/changed';q.selection.matches[0].logFingerprints.fill('f'.repeat(64));sameIndex(await op,expected);});
});
test('finite selection bounds and protected roots reject',async()=>{
    const base={synthetic:true,root:process.cwd(),replayId:'b'.repeat(24),taskId,expectedBuildId:buildId,fingerprints:['0'.repeat(64)]};
    for(const [extra,code]of [[{fingerprints:[]},'INVALID_IDENTITY'],[{fingerprints:['0'.repeat(64),'0'.repeat(64)]},'INVALID_IDENTITY'],[{fingerprints:Array.from({length:65},(_,i)=>i.toString(16).padStart(64,'0'))},'RESOURCE_LIMIT'],[{recover:true},'UNSUPPORTED_OPTION'],[{},'UNSAFE_PATH']])await assert.rejects(screen({...base,...extra}),{code});
    const m={replayId:base.replayId,logFingerprints:base.fingerprints,opponent:'synthetic',configuration:{label:'label',basis:'basis',expectedBuildId:buildId}};
    await assert.rejects(index({synthetic:true,root:'/forbidden',selection:{version:1,taskId,matches:Array.from({length:9},()=>m)}}));
    await assert.rejects(index({synthetic:true,root:'/forbidden',selection:{version:1,taskId,matches:[{...m,logFingerprints:Array.from({length:65},(_,i)=>i.toString(16).padStart(64,'0'))}]}}),{code:'RESOURCE_LIMIT'});
});
test('both synthetic CLI routes select explicitly and never publish cache files',async t=>{
    const f=await make(t),q=request(f),file=path.join(f.v2,'selection.json');fs.writeFileSync(file,JSON.stringify(q.selection));
    await unchanged(f,async()=>{
        for(const args of [['tools/historical-index.js','--synthetic-sqlite',f.root,file],['tools/scout-hold-screen.js','--synthetic-sqlite',f.root,f.q.replayId,taskId,buildId,...f.q.fingerprints]]){
            const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024**2});assert.equal(r.status,0,r.stderr);JSON.parse(r.stdout);
        }
    });assert.equal(fs.existsSync(path.join(f.root,'replay_logs/analysis_cache')),false);
});
test('ordinary consumer imports remain SQLite-free',()=>{
    const script=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){if(s==='node:sqlite')throw Error('unexpected SQLite');return next(s,c);}});await import('./tools/historical-index.js');await import('./tools/scout-hold-screen.js');`;
    const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);
});

function holdFixture(data) {
    const map=data.manifest.maps[0],body=JSON.parse(data.files[map.file]);delete body.checksum;
    body.objects=[{id:'flag',type:'ScoreFlag',x:49,y:49,effectType:'attack',scorePerTick:1}];
    // The existing checksum helper's canonical payload semantics, not an invented map identity.
    const checksum=mapChecksum(body);
    map.id=map.checksum=checksum;data.manifest.replays[0].mapId=checksum;data.files[map.file]=JSON.stringify({...body,checksum})+'\n';
    for(const r of data.manifest.records){
        r.mapId=r.mapChecksum=checksum;
        if(!r.outputPath)continue;
        const tick=r.requestedTick,actor={id:'scout',my:true,x:tick===3?48:47,y:50,hits:100,hitsMax:100,fatigue:0,activeBodyParts:{move:1}};
        const flag={id:'flag',x:49,y:49,owner:'me',effectType:'attack',scorePerTick:1};
        const creeps=[actor,...(tick>1?[{id:'enemy',my:false,x:54,y:49,hits:100,hitsMax:100,fatigue:0,activeBodyParts:{move:1}}]:[])];
        const state={type:'game-state',buildId,tick,phase:'before-actions',selectedFlagId:'flag',creeps,flags:[flag]};
        const entries=[];
        const add=e=>{const sequence=entries.length;entries.push({formatVersion:1,buildId,tick,sequence,recordId:`${tick}:${sequence}`,...e});return entries.at(-1);};
        if(tick===1)add({type:'membership-baseline',phase:'before-actions',epoch:1,initialized:true,initializationReason:null,lastTick:null,squads:[],members:[{id:'scout',role:'scout',originalParts:{move:1},squadId:null,slotIndex:null,late:false,presence:'present',functioning:{move:1},capable:true,participating:true,canMoveNow:true}]});
        for(const channel of ['movement','healing','combat']){
            const selected=channel==='movement'&&tick>1,seq=entries.length,decisionId=`${tick}:${seq}`,target={kind:'score-flag',id:'flag',x:49,y:49};
            const decision=add({type:'action-decision',phase:channel==='movement'?'movement':'tactics',actorId:'scout',channel,decisionId,outcome:selected?'selected':channel==='movement'?'hold':'no-action',reason:selected?'flag-fallback':channel==='movement'?'scout-owned-flag-hold':'no-target',actions:selected?[{actionId:decisionId+'#0',method:'moveTo',target}]:[]});
            if(selected)add({type:'action-attempt',phase:'movement',actorId:'scout',channel,decisionId:decision.decisionId,actionId:decisionId+'#0',method:'moveTo',target,returnCode:0});
        }
        const count=entries.length;
        add({type:'evidence-coverage',phase:'after-actions',firstSequence:0,lastSequence:count-1,recordCount:count,coveredTypes:['membership-baseline','membership-change','action-decision','action-attempt'],counts:{'membership-baseline':tick===1?1:0,'membership-change':0,'action-decision':3,'action-attempt':tick===1?0:1,'movement-decisions':1,'healing-decisions':1,'combat-decisions':1},closed:true});
        const line=JSON.stringify(state);data.files[r.outputPath]=line+'\n';r.outputFingerprint=sha256(data.files[r.outputPath]);
        r.otherEntries=entries.map((e,i)=>({key:String(i),type:e.type,formatVersion:1,raw:JSON.stringify(e)}));
        r.diagnosticCoverage=summarizeDiagnosticCoverage([line],entries.map((entry,i)=>({entry,key:String(i)})));
    }
}
test('exercised scout hold/release preserves decisions, sources and following observation across routes',async t=>{
    const f=await make(t,'log','cpu',holdFixture),{screenReplay}=await import(pathToFileURL(path.join(f.v2,'tools/scout-hold-screen.js')));
    const expected=screenReplay(f.q.replayId,taskId,buildId).report;
    const actual=(await unchanged(f,()=>screen(screening(f)))).report;
    assert.deepEqual(actual,expected);assert.deepEqual(actual.scoutIds,['scout']);assert.equal(actual.holds,1);assert.equal(actual.enemyRelease,'pass');assert.deepEqual(actual.transitions[0].observedAfter,{x:48,y:50});
});
test('historical original history/index conflicts reject without repair',async t=>{
    const f=await make(t,'log','cpu',d=>{d.manifest.replays[0].retiredFingerprints=['e'.repeat(64)];});
    const q=request(f);q.selection.matches[0].logFingerprints.push('e'.repeat(64));await unchanged(f,()=>assert.rejects(index(q),{code:'INVALID_REFERENCE'}));
});
test('generation changes while assembling a selection reject, including unavailable-only requests',async t=>{
    const f=await make(t),prepare=DatabaseSync.prototype.prepare;
    for(const missing of [false,true])await unchanged(f,async()=>{
        let calls=0;DatabaseSync.prototype.prepare=function(sql){const statement=prepare.call(this,sql);if(sql==='SELECT generation FROM store_meta'){const get=statement.get.bind(statement);statement.get=(...args)=>{const row=get(...args);if(++calls===2)row.generation+=typeof row.generation==='bigint'?1n:1;return row;};}return statement;};
        try{const q=request(f);if(missing)q.selection.matches[0].logFingerprints=['f'.repeat(64)];await assert.rejects(index(q),{code:'CHANGED_INPUT'});}finally{DatabaseSync.prototype.prepare=prepare;}
    });
});
test('selection controls reject limits and preserve primary read errors plus cleanup failures',async t=>{
    const f=await make(t),file=path.join(f.v2,'control.json');fs.writeFileSync(file,'x'.repeat(65537));assert.throws(()=>readSyntheticSelection(file,f.root),{code:'RESOURCE_LIMIT'});
    fs.writeFileSync(file,'{}');
    for(const kind of ['operation','cleanup','combined']){
        const open=fs.openSync,read=fs.readSync,close=fs.closeSync;let fd;
        fs.openSync=(p,...args)=>{const handle=open(p,...args);if(p===file)fd=handle;return handle;};
        fs.readSync=(handle,...args)=>{if(handle===fd&&kind!=='cleanup')throw Object.assign(Error('read'),{code:'EIO'});return read(handle,...args);};
        fs.closeSync=handle=>{close(handle);if(handle===fd&&kind!=='operation')throw Object.assign(Error('close'),{code:'ENOSPC'});};
        try{assert.throws(()=>readSyntheticSelection(file,f.root),e=>{assert.equal(e.code,kind==='cleanup'?'ENOSPC':'EIO');if(kind==='combined')assert.equal(e.cleanupFailures[0].systemCode,'ENOSPC');return true;});}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}
    }
});
test('historical 64-source boundary and ordered cross-match independence',async t=>{
    const f=await make(t),q=request(f),first=match(f);
    first.logFingerprints=[f.q.fingerprints[0],...Array.from({length:62},(_,i)=>(100+i).toString(16).padStart(64,'0'))];
    const second={...match(f),replayId:'c'.repeat(24),logFingerprints:['f'.repeat(64)]};q.selection.matches=[second,first];
    const result=await unchanged(f,()=>index(q));assert.deepEqual(result.matches.map(m=>m.replayId),[second.replayId,first.replayId]);assert.equal(result.matches[0].status,'unavailable');assert.equal(result.matches[1].selectedEvidence.length,63);assert.equal(result.matches[1].status,'partial');
    q.selection.matches[1].logFingerprints.push('e'.repeat(64));await unchanged(f,()=>assert.rejects(index(q),{code:'RESOURCE_LIMIT'}));
});
test('nested fingerprint accessors, sparse arrays and coercible identities reject before store access',async()=>{
    const base={synthetic:true,root:'/forbidden',replayId:'b'.repeat(24),taskId,expectedBuildId:buildId,fingerprints:['0'.repeat(64)]};
    let calls=0;const a=['0'.repeat(64)];Object.defineProperty(a,'0',{get(){calls++;return '0'.repeat(64);}});
    await assert.rejects(screen({...base,fingerprints:a}),{code:'INVALID_ARGUMENT'});assert.equal(calls,0);
    await assert.rejects(screen({...base,fingerprints:Array(1)}),{code:'INVALID_ARGUMENT'});
    const selection={version:1,taskId,matches:[{replayId:[base.replayId],logFingerprints:base.fingerprints,opponent:'synthetic',configuration:{label:'label',basis:'basis',expectedBuildId:buildId}}]};
    await assert.rejects(index({synthetic:true,root:'/forbidden',selection}),{code:'INVALID_IDENTITY'});
});

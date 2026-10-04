import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import nativeTest from 'node:test';
import { createCatalogFixture, openCatalog, aggregateVerdicts } from '../../tools/replay-catalog.js';
import { openStore, createFixtureStore, recordKey, recordOwner } from '../../tools/replay-store.js';
import { jsonChunks, digestChunks } from '../../tools/replay-store-payloads.js';

const prefix=path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-');
const test=process.argv[2]==='catalog-scale-worker'?()=>{}:nativeTest;
const moduleUrl=new URL('../../tools/replay-catalog.js',import.meta.url).href;
const id=n=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const replayId='a'.repeat(24),mapId='b'.repeat(64),taskId='codex/synthetic-C1/Á';
const cap=n=>({collection:'log',replayId,fingerprint:n.toString(16).padStart(64,'0')});
const counts=verdict=>Object.fromEntries(['unknown','unexercised','passed','failed'].map(k=>[k,Number(k===verdict)]));
const baseVerdict=verdict=>({verdict,semanticsVersion:'synthetic-v1',criterion:'following',unit:'transitions',counts:counts(verdict),opportunities:verdict==='unexercised'?0:1,level:'position',coverageSufficient:true,provenanceState:'established'});
const question={questionId:id(10),subjectId:id(11),question:'Did following resume?',criterion:'following',unit:'transitions',requiredEvidence:{position:true},comparisonPolicy:{compatible:'same-source'},unknown:{null:null,zero:0,no:false},empty:[]};
const conclusion={kind:'conclusion',id:id(30),subjectId:id(31),questionId:id(10),taskId,eventId:id(32)};
function runInput(n=20){return {runId:id(n),subjectId:id(n+1),questionId:id(10),taskId,eventId:id(n+2),analyzer:{name:'synthetic',version:'1',dependencyDigest:'c'.repeat(64)},parameters:{unknown:null,zero:0,no:false}};}
const transition=(n=20,event=23)=>({eventId:id(event),subjectId:id(n+1),expectedState:'planned',nextState:'running',taskId,reason:'selected evidence sealed'});
const finding=(n=26,verdict='passed')=>({findingId:id(n),subjectId:id(n+1),...baseVerdict(verdict),kind:'position',rule:'following',observed:{leader:[2,2],follower:[1,2]},originalVerdict:{passed:'pass',failed:'fail',unknown:'unknown',unexercised:'unexercised'}[verdict],evidence:[{evidenceRefId:id(8),role:'observation'}]});
const result=(n=20,event=24,f=finding())=>({runId:id(n),expectedState:'running',taskId,eventId:id(event),declaredCounts:{findings:1,evidenceLinks:f.evidence.length,evidenceRefs:0},findings:[f],evidenceRefs:[]});
const revision=(n=1,verdict='passed')=>({conclusionId:id(30),revisionSubjectId:id(40+n),expectedRevision:n-1,revision:n,predecessor:n===1?null:n-1,taskId,...baseVerdict(verdict),scope:{range:{start:1,end:2}},rationale:'Synthetic observed positions',support:[{findingId:id(26),role:'support'}]});
const transaction=(c,fn)=>c.withWriter(w=>w.transaction(fn));
function dbFile(c){return path.join(c.root,JSON.parse(fs.readFileSync(path.join(c.root,'manifest.json'))).database);}
async function fixture(t,options={}){
    const root=fs.mkdtempSync(prefix),c=await createCatalogFixture({root,filesystem:'local-apfs',...options});t.after(()=>{c.close();fs.rmSync(root,{recursive:true,force:true});});
    await c.evidence.withWriter(w=>w.transaction(tx=>{tx.insertEntity({kind:'map',key:mapId,ordinal:0});tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:{mapId}});}));
    let artifact;
    await c.evidence.withWriter(async w=>{artifact=await w.publishPayload({owner:recordOwner(cap(0)),pointer:'/positions',role:'extensions',source:jsonChunks({positions:[0,false,null,'Á😀']}),evidenceOnly:true,...digestChunks(jsonChunks({positions:[0,false,null,'Á😀']}))});w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(cap(0)),ordinal:0,value:{mapId}});tx.finishPublication({recordKey:cap(0),payloadRefs:[artifact]});});});
    await transaction(c,tx=>{
        tx.registerIdentity({kind:'task',id:taskId,subjectId:id(1)});
        tx.registerIdentity({kind:'replay',id:replayId,subjectId:id(2),unknown:{no:false,zero:0,null:null}});
        tx.registerIdentity({kind:'capture',capture:cap(0),subjectId:id(3)});
        tx.registerIdentity({kind:'artifact',id:id(4),subjectId:id(5),owner:artifact.owner,field:artifact.pointer,format:artifact.encoding,path:artifact.path,hash:artifact.hash,bytes:artifact.bytes});
        tx.appendEvidenceRef({evidenceRefId:id(8),captureKey:recordKey(cap(0)),artifactId:id(4),range:{start:1,end:2},actor:{replayId,id:'creep-1'},sourceKey:'synthetic/positions',ordinal:0});
        tx.createQuestion(question);
        tx.registerIdentity(conclusion);
    });return {c,artifact};
}
async function completed(c,n=20,event=24,f=finding()){
    await transaction(c,tx=>{tx.createRun(runInput(n));tx.appendRunSources({runId:id(n),sources:[{ordinal:0,captureKey:recordKey(cap(0)),availability:'not-checked',reason:'synthetic retained',fingerprints:{evidence:'d'.repeat(64),map:mapId},validation:{state:'verified',validator:'synthetic-v1'}}]});tx.sealRun({runId:id(n),semanticsVersion:'selection-v1'});tx.transitionRun(transition(n,n+3));});
    await transaction(c,tx=>tx.publishRunResult(result(n,event,f)));
}
async function child(code,args=[],timeout=15_000){const p=spawn(process.execPath,['--input-type=module','-e',code,...args],{stdio:['ignore','pipe','pipe']});let output='',errors='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>errors+=b);let expired=false;const timer=setTimeout(()=>{expired=true;p.kill('SIGKILL');},timeout);const r=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',(code,signal)=>resolve({code,signal,pid:p.pid}));});clearTimeout(timer);return {...r,output,errors,expired};}

test('C1 runtime, root and schema separation; no production or schema-1 upgrades',async t=>{
    for(const root of [undefined,process.cwd(),path.join(process.cwd(),'replay_logs')]){await assert.rejects(createCatalogFixture({root,filesystem:'local-apfs'}));await assert.rejects(openCatalog({root,mode:'read'}));}
    const {c}=await fixture(t);await assert.rejects(openStore({root:c.root,mode:'write'}),{code:'UNSUPPORTED_STORE'});
    const root=fs.mkdtempSync(prefix),s=await createFixtureStore({root,filesystem:'local-apfs'});t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true});});await assert.rejects(openCatalog({root,mode:'write'}),{code:'UNSUPPORTED_STORE'});
    const alias=prefix+'alias-'+Date.now();fs.symlinkSync(c.root,alias);t.after(()=>fs.unlinkSync(alias));await assert.rejects(openCatalog({root:alias,mode:'read'}),{code:'UNSAFE_PATH'});
    const db=new DatabaseSync(dbFile(c),{readOnly:true});try{assert.equal(db.prepare('SELECT catalog_version FROM store_meta').get().catalog_version,1);assert.ok(db.prepare("PRAGMA table_list").all().filter(r=>r.name.startsWith('catalog_')).every(r=>r.strict===1));assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{db.close();}
});

test('C1 preservation, scoped provenance, coverage and absent/null/zero values',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>{
        tx.registerIdentity({kind:'build',id:'e'.repeat(64),subjectId:id(50)});
        tx.registerIdentity({kind:'config',id:id(51),subjectId:id(52),switches:{pairing:false,unknown:null},source:'local'});
        tx.registerIdentity({kind:'upload',playerKey:'ours',codeId:'f'.repeat(24),subjectId:id(53),version:0});
        for(const [i,state] of ['observed','reported','unknown','conflicting','invalid','local-verified'].entries())tx.appendProvenance({assertionId:id(60+i),subjectId:id(3),field:'runtime-build',captureKey:recordKey(cap(0)),state,reason:'explicit synthetic uncertainty',validatorVersion:'v1',...(state==='observed'?{evidenceRefId:id(8)}:{origin:{kind:'user'}}),value:i===2?null:'e'.repeat(64),ordinal:i});
        for(const [i,state]of ['covered','gap','unknown','conflicting','invalid'].entries())tx.appendCoverage({coverageId:id(70+i),captureKey:recordKey(cap(0)),dimension:'runtime-tick',range:{start:1,end:state==='gap'?1_000_000:2},state,reason:'synthetic receipt',validatorVersion:'v1',evidenceRefId:id(8),zeroEvents:0,ordinal:i});
        tx.appendProperty({subjectId:id(2),pointer:'/__proto__',ordinal:0,value:{zero:0,no:false}});
        tx.appendProperty({subjectId:id(3),pointer:'/__proto__',ordinal:0,value:null});
    });
    assert.deepEqual(c.getReplay(replayId).value.unknown,{no:false,zero:0,null:null});assert.equal(Object.hasOwn(c.getReplay(replayId).value,'terminal'),false);
    assert.equal(c.pageProvenance(id(3)).rows.length,6);assert.equal(c.pageCoverage(cap(0),'runtime-tick').rows.length,5);assert.equal(c.pageProperties(id(3)).rows[0].value,null);
    c.resetMetrics();c.getCapture(cap(0));c.pageProvenance(id(3));assert.equal(c.metrics.payloadReadBytes,0);
    await assert.rejects(transaction(c,tx=>tx.appendProvenance({assertionId:id(80),subjectId:id(3),captureKey:recordKey(cap(1)),evidenceRefId:id(8),field:'build',state:'observed',reason:'bad',validatorVersion:'v1'})),{code:'INVALID_REFERENCE'});
    await assert.rejects(transaction(c,tx=>tx.appendEvidenceRef({evidenceRefId:id(81),captureKey:recordKey(cap(0)),artifactId:id(4),actor:{replayId:'f'.repeat(24),id:'creep-1'}})),{code:'INVALID_REFERENCE'});
    await assert.rejects(transaction(c,tx=>tx.appendCoverage({coverageId:id(82),captureKey:recordKey(cap(0)),dimension:'runtime-tick',state:'covered',reason:'no proof',validatorVersion:'1'})),{code:'INVALID_REFERENCE'});
});

test('C1 atomic frozen runs, result counts and exact retries; no partial state on caught errors',async t=>{
    const {c}=await fixture(t);await transaction(c,tx=>tx.createRun(runInput()));
    await assert.rejects(transaction(c,tx=>tx.transitionRun(transition())),{code:'INVALID_STATE'});
    const selection={runId:id(20),sources:[{ordinal:0,captureKey:recordKey(cap(0)),availability:'not-checked',reason:'retained',fingerprints:{evidence:'d'.repeat(64)},validation:{state:'verified',validator:'synthetic-v1'}}]};
    await transaction(c,tx=>{tx.appendRunSources(selection);tx.appendRunSources(selection);});let seal;
    await transaction(c,tx=>{seal=tx.sealRun({runId:id(20),semanticsVersion:'selection-v1'});tx.transitionRun(transition());});
    assert.equal(c.getRun(id(20)).selection_digest,seal);assert.equal(c.pageRunSources(id(20)).rows.length,1);
    await assert.rejects(transaction(c,tx=>tx.appendRunSources(selection)),{code:'INVALID_STATE'});
    await assert.rejects(transaction(c,tx=>tx.publishRunResult({...result(),declaredCounts:{findings:0,evidenceLinks:0,evidenceRefs:0}})),{code:'INVALID_REFERENCE'});assert.equal(c.getRun(id(20)).workflow,'running');assert.equal(c.pageFindings(id(20)).rows.length,0);
    await assert.rejects(transaction(c,tx=>{try{tx.publishRunResult({...result(),findings:[{...finding(),evidence:[{evidenceRefId:id(999),role:'observation'}]}]});}catch{};}),{code:'INVALID_STATE'});assert.equal(c.pageFindings(id(20)).rows.length,0);
    await transaction(c,tx=>tx.publishRunResult(result()));await transaction(c,tx=>tx.publishRunResult(result()));assert.equal(c.pageFindings(id(20)).rows.length,1);assert.equal(c.pageEvidence(id(26)).rows.length,1);
    await transaction(c,tx=>tx.transitionRun(transition())); // exact old event before expectedState check
    await assert.rejects(transaction(c,tx=>tx.publishRunResult({...result(),findings:[{...finding(),observed:null}]})),{code:'IDENTITY_CONFLICT'});
    await assert.rejects(transaction(c,tx=>tx.appendFinding({...finding(),runId:id(20)})),{code:'INVALID_STATE'});
});

test('C1 immutable conclusion revisions, predecessor/CAS validation and review/workflow history',async t=>{
    const {c}=await fixture(t);await completed(c);const first=revision();await transaction(c,tx=>tx.appendConclusionRevision(first));await transaction(c,tx=>tx.appendConclusionRevision(revision(2,'unknown')));
    await transaction(c,tx=>tx.appendConclusionRevision(first));assert.equal(c.getConclusion(id(30)).current_revision,2);assert.equal(c.pageConclusionHistory(id(30)).rows.length,2);
    for(const value of [{...revision(3),predecessor:null},{...revision(3),predecessor:1},{...revision(3),verdict:'fail'}])await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision(value)));
    await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...revision(),revisionSubjectId:id(90)})),{code:'REVISION_CONFLICT'});
    await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...first,rationale:'changed'})),{code:'IDENTITY_CONFLICT'});
    const review={eventId:id(100),targetSubjectId:id(41),taskId,expectedState:'unclaimed',checkpoint:'claimed',reason:'synthetic review'};
    await transaction(c,tx=>tx.appendReviewEvent(review));await assert.rejects(transaction(c,tx=>tx.appendReviewEvent({...review,eventId:id(101),expectedState:'claimed',checkpoint:'completed'})),{code:'INVALID_STATE'});
    await transaction(c,tx=>{tx.appendReviewEvent({...review,eventId:id(101),expectedState:'claimed',checkpoint:'examined'});tx.appendReviewEvent({...review,eventId:id(102),expectedState:'examined',checkpoint:'completed'});});await transaction(c,tx=>tx.appendReviewEvent(review));
    assert.equal(c.pageReviewHistory(id(41),taskId).rows.length,3);assert.equal(c.pageReviews(id(41)).rows[0].checkpoint,'completed');assert.equal(c.pageReviews(id(42)).rows.length,0);
    const state={eventId:id(103),subjectId:id(31),taskId,expectedState:'open',nextState:'deferred',reason:'benefit inconclusive'};await transaction(c,tx=>tx.transitionWorkflow(state));assert.equal(c.getConclusion(id(30),2).value.verdict,'unknown');assert.equal(c.getConclusion(id(30)).workflow,'deferred');
    await assert.rejects(transaction(c,tx=>tx.transitionWorkflow({...state,eventId:id(104),expectedState:'deferred',nextState:'open'})),{code:'INVALID_STATE'});
    const db=new DatabaseSync(dbFile(c));try{assert.throws(()=>db.prepare('UPDATE catalog_conclusion_revisions SET verdict=? WHERE subject_id=?').run('failed',id(41)),/IMMUTABLE/);assert.throws(()=>db.prepare('INSERT INTO catalog_conclusion_support VALUES (?,?,?,?,?,?,?)').run('late',id(30),1,id(26),'support',1,'{}'),/IMMUTABLE/);assert.throws(()=>db.prepare('UPDATE catalog_runs SET selection_digest=? WHERE run_id=?').run('e'.repeat(64),id(20)),/IMMUTABLE/);assert.throws(()=>db.prepare('UPDATE catalog_runs SET workflow=? WHERE run_id=?').run('errored',id(20)),/IMMUTABLE/);assert.throws(()=>db.prepare('UPDATE catalog_conclusions SET current_revision=? WHERE conclusion_id=?').run(0,id(30)),/INVALID_STATE/);}finally{db.close();}
});

test('C1 distinct verdicts, unavailable selection, integrity exclusions and explicit experiments',async t=>{
    const {c}=await fixture(t);for(const [i,v]of ['passed','failed','unknown','unexercised'].entries())await completed(c,200+i*10,204+i*10,finding(206+i*10,v));
    for(const [i,v]of ['passed','failed','unknown','unexercised'].entries()){assert.equal(c.getRun(id(200+i*10)).workflow,'completed');assert.equal(c.pageFindings(id(200+i*10)).rows[0].verdict,v);}
    assert.equal(aggregateVerdicts({passed:1,unknown:1,failed:0,unexercised:3}),'unknown');assert.equal(aggregateVerdicts({passed:1,unknown:1,failed:1,unexercised:3}),'failed');assert.equal(aggregateVerdicts(counts('unexercised')),'unexercised');
    await transaction(c,tx=>{tx.registerIdentity({kind:'capture',capture:cap(1),subjectId:id(300)});tx.appendEvidenceRef({evidenceRefId:id(301),captureKey:recordKey(cap(1)),range:{start:3,end:4}});tx.createRun(runInput(310));tx.appendRunSources({runId:id(310),sources:[{ordinal:0,captureKey:recordKey(cap(1)),availability:'missing',reason:'source unavailable',fingerprints:{evidence:null}}]});tx.sealRun({runId:id(310),semanticsVersion:'1'});tx.transitionRun(transition(310,313));});
    await assert.rejects(transaction(c,tx=>tx.publishRunResult(result(310,314,finding(316,'passed')))),{code:'INVALID_REFERENCE'}); // cap 0 outside sealed selection
    await transaction(c,tx=>tx.publishRunResult(result(310,314,{...finding(316,'unknown'),evidence:[{evidenceRefId:id(301),role:'coverage'}]})));assert.equal(c.getCapture(cap(1)).availability,'missing');
    await transaction(c,tx=>{tx.registerIdentity({kind:'experiment',id:id(330),subjectId:id(331),taskId,eventId:id(332)});tx.appendExperimentRevision({experimentId:id(330),revisionSubjectId:id(333),expectedRevision:0,revision:1,predecessor:null,questionId:id(10),taskId,hypothesis:'synthetic question, no promotion',baseline:{buildId:null,configId:null},candidate:{buildId:null,configId:null},criteria:{acceptance:'supported positions',failure:'supported violation',unexercised:'no opportunity'},limits:{ticks:24}});tx.linkExperimentRun({experimentId:id(330),revision:1,runId:id(200),arm:'observational',assignmentProvenance:{state:'unknown'}});});assert.equal(c.getExperiment(id(330)).current_revision,1);
});

test('C1 snapshots remain metadata-only, bounded, intent-aware, coherent and callback-scoped',async t=>{
    const {c,artifact}=await fixture(t);await completed(c);let saved;c.resetMetrics();await c.withCatalogSnapshot({captureKeys:[cap(0)],runIds:[id(20)],evidenceRefIds:[id(8)]},async view=>{saved=view;assert.equal(view.get('captures')[0].availability,'not-checked');await transaction(c,tx=>tx.appendProperty({subjectId:id(2),pointer:'/new',ordinal:2,value:false}));assert.equal(view.get('runs')[0].workflow,'completed');});assert.throws(()=>saved.get('captures'),{code:'CLOSED'});assert.equal(c.metrics.payloadOpens,0);assert.equal(c.metrics.payloadReadBytes,0);
    await assert.rejects(c.withCatalogSnapshot({captureKeys:Array(65).fill(cap(0))},()=>{}),{code:'RESOURCE_LIMIT'});
    await c.evidence.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'intent',recordKey:cap(0),files:[{ordinal:0,path:artifact.path,hash:artifact.hash,bytes:artifact.bytes}]})));let called=false;await assert.rejects(c.withCatalogSnapshot({runIds:[id(20)]},()=>{called=true;}),{code:'UNAVAILABLE'});assert.equal(called,false);assert.equal(c.resolveEvidence(id(8)).availability,'pending');
});

test('C1 references survive core log retirement without owning files or completing reviews',async t=>{
    const {c,artifact}=await fixture(t);await completed(c);await transaction(c,tx=>tx.appendConclusionRevision(revision()));
    await c.evidence.withWriter(async w=>{w.transaction(tx=>{tx.setStatus({recordKey:cap(0),status:'done'});tx.appendIntent({id:'cleanup',recordKey:cap(0),phase:'cleanup',files:[{ordinal:0,path:artifact.path,hash:artifact.hash,bytes:artifact.bytes,originalPresent:true}]});});await w.deleteFile({operationId:'cleanup',ordinal:0});w.transaction(tx=>tx.finishPublication({recordKey:cap(0),operationId:'cleanup',retire:true}));});
    assert.equal(fs.existsSync(path.join(c.root,artifact.path)),false);assert.equal(c.resolveEvidence(id(8)).availability,'retired');assert.equal(c.getConclusion(id(30),1).value.verdict,'passed');assert.equal(c.pageSupport(id(30),1).rows[0].finding_id,id(26));assert.equal(c.pageReviews(id(3)).rows.length,0);await c.withCatalogSnapshot({evidenceRefIds:[id(8)]},view=>assert.equal(view.get('captures')[0].availability,'retired'));
});

test('C1 bounded pages, identities, properties, stale cursors and transaction capabilities',async t=>{
    const {c}=await fixture(t);for(let start=1;start<141;start+=100)await transaction(c,tx=>{for(let i=start;i<Math.min(start+100,141);i++)tx.registerIdentity({kind:'capture',capture:cap(i),subjectId:id(1000+i),ordinal:i});});const page=c.pageCaptures(replayId);assert.equal(page.rows.length,128);assert.equal(c.pageCaptures(replayId,page.cursor).rows.length,13);
    await assert.rejects(transaction(c,tx=>tx.registerIdentity({kind:'replay',id:replayId,subjectId:id(2),different:0})),{code:'IDENTITY_CONFLICT'});
    await assert.rejects(transaction(c,tx=>tx.appendProperty({subjectId:id(2),pointer:'/big',ordinal:0,value:'x'.repeat(65537)})),{code:'RESOURCE_LIMIT'});
    await assert.rejects(transaction(c,tx=>{for(let i=0;i<129;i++)tx.appendProperty({subjectId:id(2),pointer:'/p'+i,ordinal:i,value:i});}),{code:'RESOURCE_LIMIT'});assert.equal(c.pageProperties(id(2)).rows.length,0);
    await transaction(c,tx=>tx.appendProperty({subjectId:id(2),pointer:'/retained',ordinal:0,value:0}));assert.throws(()=>c.pageCaptures(replayId,page.cursor),{code:'STALE_CURSOR'});
    let escaped;await transaction(c,tx=>{escaped=tx;});assert.throws(()=>escaped.createRun(runInput()),{code:'CLOSED'});await assert.rejects(transaction(c,async()=>{}),{code:'INVALID_STATE'});
});

test('C1 supported verdicts reject incomplete coverage, aggregate and provenance receipts atomically',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>{tx.appendProvenance({assertionId:id(800),subjectId:id(3),captureKey:recordKey(cap(0)),field:'runtime-build',state:'conflicting',origin:{kind:'user'},reason:'incompatible tags',validatorVersion:'synthetic'});tx.appendEvidenceRef({evidenceRefId:id(801),captureKey:recordKey(cap(0)),buildAssertionId:id(800),range:{start:1,end:2}});});
    await assert.rejects(transaction(c,tx=>tx.appendEvidenceRef({evidenceRefId:id(802),captureKey:recordKey(cap(0)),configAssertionId:id(800)})),{code:'INVALID_REFERENCE'});
    await completed(c); // prepare a second running run for rejected result batches
    await transaction(c,tx=>{tx.createRun(runInput(810));tx.appendRunSources({runId:id(810),sources:[{ordinal:0,captureKey:recordKey(cap(0)),range:{start:1,end:2},availability:'not-checked',fingerprints:{evidence:'d'.repeat(64)},validation:{state:'verified'}}]});tx.sealRun({runId:id(810),semanticsVersion:'1'});tx.transitionRun(transition(810,813));});
    for(const bad of [
        {...finding(816),coverageSufficient:false},
        {...finding(816,'unexercised'),opportunities:null},
        {...finding(816),aggregate:true,counts:{passed:1,unknown:1,failed:0,unexercised:0}},
        {...finding(816),evidence:[{evidenceRefId:id(801),role:'provenance'}]}
    ])await assert.rejects(transaction(c,tx=>tx.publishRunResult(result(810,814,bad))),{code:'INVALID_REFERENCE'});
    assert.equal(c.getRun(id(810)).workflow,'running');assert.equal(c.pageFindings(id(810)).rows.length,0);
    await transaction(c,tx=>tx.publishRunResult(result(810,814,{...finding(816,'unknown'),evidence:[{evidenceRefId:id(801),role:'provenance'}]})));
    assert.equal(c.pageFindings(id(810)).rows[0].verdict,'unknown');
    await transaction(c,tx=>tx.appendConclusionRevision({...revision(),verdict:null,support:[]}));
    assert.equal(c.getConclusion(id(30),1).verdict,null);
});

test('C1 complete bounded result batches do not embed their findings in workflow receipts',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>{tx.createRun(runInput());tx.appendRunSources({runId:id(20),sources:[{ordinal:0,captureKey:recordKey(cap(0)),availability:'not-checked',fingerprints:{evidence:'d'.repeat(64)},validation:{state:'verified'}}]});tx.sealRun({runId:id(20),semanticsVersion:'1'});tx.transitionRun(transition());});
    const findings=[{...finding(26),detail:'x'.repeat(40_000)},{...finding(28),detail:'y'.repeat(40_000)}];
    const batch={...result(),findings,declaredCounts:{findings:2,evidenceLinks:2,evidenceRefs:0}};
    await transaction(c,tx=>tx.publishRunResult(batch));await transaction(c,tx=>tx.publishRunResult(batch));
    assert.equal(c.pageFindings(id(20)).rows.length,2);
    assert.equal(Object.hasOwn(c.pageWorkflow(id(21)).rows.at(-1).value,'findings'),false);
});

test('C1 child evidence cannot redirect parent ownership; rejected batches leave no partial receipts',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>{tx.createRun(runInput());tx.appendRunSources({runId:id(20),sources:[{ordinal:0,captureKey:recordKey(cap(0)),availability:'not-checked',fingerprints:{},validation:{state:'verified'}}]});tx.sealRun({runId:id(20),semanticsVersion:'1'});tx.transitionRun(transition());});
    const before=c.getRun(id(20)),workflow=c.pageWorkflow(id(21));
    const first=finding(26),second={...finding(28),evidence:[{findingId:id(26),evidenceRefId:id(8),role:'observation'}]};
    const rejected={...result(),findings:[first,second],evidenceRefs:[{evidenceRefId:id(9),captureKey:recordKey(cap(0)),range:{start:1,end:2}}],declaredCounts:{findings:2,evidenceLinks:2,evidenceRefs:1}};
    await assert.rejects(transaction(c,tx=>tx.publishRunResult(rejected)),{code:'INVALID_REFERENCE'});
    assert.deepEqual(c.getRun(id(20)),before);assert.deepEqual(c.pageWorkflow(id(21)),workflow);
    assert.equal(c.pageFindings(id(20)).rows.length,0);assert.equal(c.pageEvidence(id(26)).rows.length,0);assert.equal(c.pageEvidence(id(28)).rows.length,0);assert.equal(c.resolveEvidence(id(9)).kind,'missing');
    const valid={...result(),findings:[first,{...second,evidence:[{findingId:id(28),evidenceRefId:id(8),role:'observation'}]}],declaredCounts:{findings:2,evidenceLinks:2,evidenceRefs:0}};
    await transaction(c,tx=>tx.publishRunResult(valid));await transaction(c,tx=>tx.publishRunResult(valid));
    assert.equal(c.getRun(id(20)).workflow,'completed');for(const n of [26,28]){assert.equal(c.pageEvidence(id(n)).rows.length,1);assert.equal(c.pageEvidence(id(n)).rows[0].finding_id,id(n));}
});

test('C1 every finding needs its own complete evidence even when aggregate counts match',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>{tx.createRun(runInput());tx.appendRunSources({runId:id(20),sources:[{ordinal:0,captureKey:recordKey(cap(0)),availability:'not-checked',fingerprints:{},validation:{state:'verified'}}]});tx.sealRun({runId:id(20),semanticsVersion:'1'});tx.transitionRun(transition());});
    const before=c.getRun(id(20)),first={...finding(),evidence:[...finding().evidence,...finding().evidence]},second={...finding(28),evidence:[]};
    await assert.rejects(transaction(c,tx=>tx.publishRunResult({...result(),findings:[first,second],declaredCounts:{findings:2,evidenceLinks:2,evidenceRefs:0}})),{code:'INVALID_REFERENCE'});
    assert.deepEqual(c.getRun(id(20)),before);assert.equal(c.pageFindings(id(20)).rows.length,0);assert.equal(c.pageEvidence(id(26)).rows.length,0);
    const valid={...result(),findings:[first,finding(28)],declaredCounts:{findings:2,evidenceLinks:3,evidenceRefs:0}};
    await transaction(c,tx=>tx.publishRunResult(valid));await transaction(c,tx=>tx.publishRunResult(valid));
    assert.deepEqual(c.pageEvidence(id(26)).rows.map(r=>r.ordinal),[0,1]);assert.equal(c.pageEvidence(id(28)).rows.length,1);
});

for(const [label,selectedDimension,evidenceDimension,verdict,domainOnly=false,extra={}] of [
    ['runtime-to-game','runtime-tick','game-time','passed'],
    ['game-to-runtime','game-time','runtime-tick','passed'],
    ['unknown-runtime-to-game','runtime-tick','game-time','unknown'],
    ['unknown-game-to-runtime','game-time','runtime-tick','unknown'],
    ['implicit-runtime-to-game',undefined,'game-time','passed'],
    ['game-to-implicit-runtime','game-time',undefined,'passed'],
    ['game-to-null-runtime','game-time',null,'passed'],
    ['domain-only-selection','game-time','runtime-tick','unknown',true],
    ['opaque-alignment-is-not-authorization','runtime-tick','game-time','passed',false,{alignment:{state:'verified',from:'game-time',to:'runtime-tick',offset:0}}],
])test(`C1 F4 sealed domains: ${label} rejects atomically and matching retry succeeds`,async t=>{
    const {c}=await fixture(t);
    const interval=dimension=>({start:1,end:2,...(dimension===undefined?{}:{dimension})});
    const selectedRange=domainOnly?{dimension:selectedDimension}:interval(selectedDimension);
    const goodRef={evidenceRefId:id(9),captureKey:recordKey(cap(0)),range:interval(selectedDimension)};
    await transaction(c,tx=>{
        tx.appendEvidenceRef(goodRef);tx.createRun(runInput());
        tx.appendRunSources({runId:id(20),sources:[{ordinal:0,captureKey:recordKey(cap(0)),range:selectedRange,availability:'not-checked',fingerprints:{},validation:{state:'verified'}}]});
        tx.sealRun({runId:id(20),semanticsVersion:'synthetic-domain-v1'});tx.transitionRun(transition());
    });
    const state=()=>{const db=new DatabaseSync(dbFile(c),{readOnly:true});try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM ${name}`).all()]));}finally{db.close();}};
    const before=state(),sealed=c.pageRunSources(id(20));
    const first={...finding(26),evidence:[{evidenceRefId:id(9),role:'observation'}]};
    const second={...finding(28,verdict),evidence:[{evidenceRefId:id(12),role:'observation',...extra}]};
    const batch={...result(),findings:[first,second],evidenceRefs:[{evidenceRefId:id(12),captureKey:recordKey(cap(0)),range:interval(evidenceDimension),...extra}],declaredCounts:{findings:2,evidenceLinks:2,evidenceRefs:1}};
    c.resetMetrics();
    for(let retry=0;retry<2;retry++){
        await assert.rejects(transaction(c,tx=>tx.publishRunResult(batch)),{code:'INVALID_REFERENCE'});
        assert.deepEqual(state(),before);assert.deepEqual(c.pageRunSources(id(20)),sealed);
        assert.equal(c.resolveEvidence(id(12)).kind,'missing');assert.equal(c.pageFindings(id(20)).rows.length,0);
        assert.equal(c.getRun(id(20)).workflow,'running');assert.equal(c.metrics.payloadReadBytes,0);assert.equal(c.metrics.payloadWriteBytes,0);
    }
    // Retry the same identities with supported evidence, then retry the exact
    // completed batch. No selection edits or new run are needed after rollback.
    const valid={...batch,evidenceRefs:[{...batch.evidenceRefs[0],range:{...interval(selectedDimension),start:2}}]};
    await transaction(c,tx=>tx.publishRunResult(valid));const committed=state();
    await transaction(c,tx=>tx.publishRunResult(valid));
    assert.equal(c.getRun(id(20)).workflow,'completed');assert.equal(c.pageFindings(id(20)).rows.length,2);
    assert.equal(c.pageFindings(id(20)).rows[1].verdict,verdict);
    assert.deepEqual(c.pageRunSources(id(20)).rows,sealed.rows);
    const retried=state();assert.equal(retried.store_meta[0].generation,committed.store_meta[0].generation+1);delete retried.store_meta;delete committed.store_meta;assert.deepEqual(retried,committed);
    assert.equal(c.metrics.payloadReadBytes,0);assert.equal(c.metrics.payloadWriteBytes,0);
});

test('C1 F4 sealed domains: defaults, unbounded selections and unknown bounds retain original values',async t=>{
    for(const [selectedRange,evidenceRange,verdict] of [
        [{start:1,end:2},{start:1,end:2,dimension:'runtime-tick'},'passed'],
        [{start:1,end:2,dimension:null},{start:1,end:2},'passed'],
        [undefined,{start:1,end:2,dimension:'game-time'},'passed'],
        [null,null,'unknown'],[{},null,'unknown'],
        [{dimension:'game-time'},{dimension:'game-time'},'unknown'],
    ]){
        const {c}=await fixture(t),source={ordinal:0,captureKey:recordKey(cap(0)),...(selectedRange===undefined?{}:{range:selectedRange}),availability:verdict==='unknown'?'missing':'not-checked',fingerprints:{},validation:{state:verdict==='unknown'?'unknown':'verified'}};
        const ref={evidenceRefId:id(9),captureKey:recordKey(cap(0)),range:evidenceRange};
        await transaction(c,tx=>{tx.appendEvidenceRef(ref);tx.createRun(runInput());tx.appendRunSources({runId:id(20),sources:[source]});tx.sealRun({runId:id(20),semanticsVersion:'synthetic-domain-v1'});tx.transitionRun(transition());});
        const f={...finding(26,verdict),...(verdict==='unknown'?{coverageSufficient:false,provenanceState:'unknown',opportunities:null}:{}),evidence:[{evidenceRefId:id(9),role:'coverage'}]};
        await transaction(c,tx=>tx.publishRunResult(result(20,24,f)));await transaction(c,tx=>tx.publishRunResult(result(20,24,f)));
        assert.deepEqual(c.pageRunSources(id(20)).rows[0].value,source);assert.deepEqual(c.resolveEvidence(id(9)).reference.value,ref);assert.equal(c.pageFindings(id(20)).rows[0].verdict,verdict);
    }
});

test('C1 same-question conclusion scopes cannot extend or escape their evidence intervals',async t=>{
    const {c}=await fixture(t);await completed(c);const before=c.getConclusion(id(30));
    for(const scope of [{range:{start:100,end:101}},{ticks:[100,101]},{range:{start:0,end:2}},{range:{start:1,end:3}},{range:{start:1,end:2},ticks:[1,3]}]){
        await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...revision(),scope})),{code:'INVALID_REFERENCE'});
        assert.deepEqual(c.getConclusion(id(30)),before);assert.equal(c.getConclusion(id(30),1).kind,'missing');assert.equal(c.pageSupport(id(30),1).rows.length,0);assert.equal(c.pageReviews(id(41)).rows.length,0);
    }
    const left={...revision(),scope:{ticks:[1,1]}},right={...revision(2),scope:{range:{start:2,end:2}}};
    await transaction(c,tx=>tx.appendConclusionRevision(left));await transaction(c,tx=>tx.appendConclusionRevision(right));await transaction(c,tx=>tx.appendConclusionRevision(left));
    assert.equal(c.getConclusion(id(30)).current_revision,2);assert.equal(c.pageConclusionHistory(id(30)).rows.length,2);assert.deepEqual(c.getConclusion(id(30),1).value.scope,left.scope);
});

test('C1 cross-question conclusions enforce comparison scope separately from actual coverage',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>tx.appendEvidenceRef({evidenceRefId:id(9),captureKey:recordKey(cap(0)),range:{start:1,end:4}}));
    await completed(c,20,24,{...finding(),evidence:[{evidenceRefId:id(9),role:'observation'}]});
    await transaction(c,tx=>{tx.createQuestion({...question,questionId:id(900),subjectId:id(901)});tx.registerIdentity({...conclusion,id:id(902),subjectId:id(903),questionId:id(900),eventId:id(904)});tx.linkQuestions({questionId:id(900),relatedQuestionId:id(10),role:'comparison',policy:{scope:{ticks:[1,2]},criterion:'following',unit:'transitions'},taskId,reason:'only ticks 1-2 authorized'});});
    const value={...revision(),conclusionId:id(902),revisionSubjectId:id(905),support:[{findingId:id(26),role:'support',comparisonLink:JSON.stringify([id(900),id(10),'comparison'])}]},before=c.getConclusion(id(902));
    for(const scope of [{range:{start:100,end:101}},{range:{start:3,end:4}},{range:{start:1,end:3}},{}]){
        await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...value,scope})),{code:'INVALID_REFERENCE'});
        assert.deepEqual(c.getConclusion(id(902)),before);assert.equal(c.getConclusion(id(902),1).kind,'missing');assert.equal(c.pageSupport(id(902),1).rows.length,0);
    }
    await transaction(c,tx=>tx.appendConclusionRevision(value));await transaction(c,tx=>tx.appendConclusionRevision(value));assert.equal(c.getConclusion(id(902)).current_revision,1);
});

test('C1 scoped coverage uses actual interval unions, not extrema; incomplete interpretations stay unknown',async t=>{
    const {c}=await fixture(t);await transaction(c,tx=>{tx.appendEvidenceRef({evidenceRefId:id(9),captureKey:recordKey(cap(0)),range:{start:4,end:5}});tx.appendEvidenceRef({evidenceRefId:id(12),captureKey:recordKey(cap(0)),range:{start:3,end:3}});});
    await completed(c,20,24,{...finding(),evidence:[{evidenceRefId:id(8),role:'observation'},{evidenceRefId:id(9),role:'coverage'}]});
    c.resetMetrics();await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...revision(),scope:{range:{start:1,end:5}}})),{code:'INVALID_REFERENCE'});assert.equal(c.getConclusion(id(30)).current_revision,0);
    const incomplete={...revision(1,'unknown'),scope:{range:{start:1,end:5}},coverageSufficient:false,provenanceState:'unknown',opportunities:null};
    await transaction(c,tx=>tx.appendConclusionRevision(incomplete));await transaction(c,tx=>tx.appendConclusionRevision(incomplete));
    await completed(c,60,64,{...finding(66),evidence:[{evidenceRefId:id(12),role:'coverage'}]});
    const covered={...revision(2),scope:{range:{start:1,end:5}},support:[{findingId:id(26),role:'support'},{findingId:id(66),role:'support'}]};
    await transaction(c,tx=>tx.appendConclusionRevision(covered));await transaction(c,tx=>tx.appendConclusionRevision(covered));assert.equal(c.getConclusion(id(30)).current_revision,2);
    assert.equal(c.metrics.payloadReadBytes,0);
});

test('C1 unknown coverage bounds can support uncertainty but never a supported scoped verdict',async t=>{
    const {c}=await fixture(t);await transaction(c,tx=>tx.appendEvidenceRef({evidenceRefId:id(9),captureKey:recordKey(cap(0)),range:null,reason:'interval unavailable'}));
    await completed(c,20,24,{...finding(26,'unknown'),evidence:[{evidenceRefId:id(9),role:'coverage'}]});
    await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision(revision())),{code:'INVALID_REFERENCE'});assert.equal(c.getConclusion(id(30)).current_revision,0);
    const incomplete={...revision(1,'unknown'),coverageSufficient:false,provenanceState:'unknown',opportunities:null};
    await transaction(c,tx=>tx.appendConclusionRevision(incomplete));await transaction(c,tx=>tx.appendConclusionRevision(incomplete));
    assert.equal(c.getConclusion(id(30),1).verdict,'unknown');assert.equal(c.resolveEvidence(id(9)).reference.value.range,null);
    await completed(c,60,64,{...finding(66,'unknown'),scope:{ticks:[100,101]},evidence:[{evidenceRefId:id(9),role:'coverage'}]});
    await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...incomplete,...revision(2,'unknown'),support:[{findingId:id(66),role:'support'}]})),{code:'INVALID_REFERENCE'});assert.equal(c.getConclusion(id(30)).current_revision,1);
});

test('C1 scope checks respect finding boundaries and do not join incompatible dimensions or builds',async t=>{
    const {c}=await fixture(t);
    await transaction(c,tx=>{
        tx.appendProvenance({assertionId:id(700),subjectId:id(3),captureKey:recordKey(cap(0)),field:'runtime-build',state:'observed',origin:{kind:'user'},reason:'first build',validatorVersion:'synthetic',value:'e'.repeat(64)});
        tx.appendProvenance({assertionId:id(701),subjectId:id(3),captureKey:recordKey(cap(0)),field:'runtime-build',state:'observed',origin:{kind:'user'},reason:'different build',validatorVersion:'synthetic',value:'f'.repeat(64),ordinal:1});
        tx.appendEvidenceRef({evidenceRefId:id(702),captureKey:recordKey(cap(0)),range:{start:1,end:2},buildAssertionId:id(700)});
        tx.appendEvidenceRef({evidenceRefId:id(703),captureKey:recordKey(cap(0)),range:{start:3,end:4},buildAssertionId:id(701)});
        tx.appendEvidenceRef({evidenceRefId:id(704),captureKey:recordKey(cap(0)),range:{start:3,end:4,dimension:'game-time'}});
    });
    await completed(c,20,24,{...finding(),evidence:[{evidenceRefId:id(702),role:'observation'},{evidenceRefId:id(703),role:'observation'}]});
    await completed(c,60,64,{...finding(66),evidence:[{evidenceRefId:id(8),role:'observation'},{evidenceRefId:id(704),role:'coverage'}]});
    await completed(c,80,84,{...finding(86),scope:{ticks:[1,1]}});
    for(const [findingId,scope] of [[id(26),{ticks:[1,4]}],[id(66),{ticks:[1,4]}],[id(86),{ticks:[1,2]}]])await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision({...revision(),scope,support:[{findingId,role:'support'}]})),{code:'INVALID_REFERENCE'});
    assert.equal(c.getConclusion(id(30)).current_revision,0);assert.equal(c.pageSupport(id(30),1).rows.length,0);
});

test('C1 support inspection permits multiple bounded pages but rejects exceeded byte limits atomically',async t=>{
    const {c}=await fixture(t);
    const many={...finding(),evidence:Array.from({length:70},()=>({evidenceRefId:id(8),role:'observation'}))};
    await completed(c,20,24,many);await completed(c,60,64,{...many,findingId:id(66),subjectId:id(67)});
    const valid={...revision(),support:[{findingId:id(26),role:'support'},{findingId:id(66),role:'support'}]};await transaction(c,tx=>tx.appendConclusionRevision(valid));await transaction(c,tx=>tx.appendConclusionRevision(valid));assert.equal(c.getConclusion(id(30)).current_revision,1);
    await transaction(c,tx=>tx.appendEvidenceRef({evidenceRefId:id(700),captureKey:recordKey(cap(0)),range:{start:1,end:2},opaque:'x'.repeat(45_000)}));
    const large={...finding(86),evidence:Array.from({length:100},()=>({evidenceRefId:id(700),role:'observation'}))};
    await completed(c,80,84,large);await completed(c,100,104,{...large,findingId:id(106),subjectId:id(107)});
    const before=c.getConclusion(id(30)),overLimit={...revision(2),support:[{findingId:id(86),role:'support'},{findingId:id(106),role:'support'}]};
    c.resetMetrics();await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision(overLimit)),{code:'RESOURCE_LIMIT'});
    assert.deepEqual(c.getConclusion(id(30)),before);assert.equal(c.getConclusion(id(30),2).kind,'missing');assert.equal(c.pageSupport(id(30),2).rows.length,0);assert.equal(c.metrics.payloadOpens,0);assert.equal(c.metrics.payloadReadBytes,0);
    const bounded={...revision(2),support:[{findingId:id(86),role:'support'}]};await transaction(c,tx=>tx.appendConclusionRevision(bounded));await transaction(c,tx=>tx.appendConclusionRevision(bounded));assert.equal(c.getConclusion(id(30)).current_revision,2);
});

test('C1 cross-question support requires an explicit comparison; source ranges and history stay exact',async t=>{
    const {c}=await fixture(t);await completed(c);
    await transaction(c,tx=>{tx.createQuestion({...question,questionId:id(900),subjectId:id(901),predecessor:id(10)});tx.registerIdentity({...conclusion,id:id(902),subjectId:id(903),questionId:id(900),eventId:id(904)});});
    const rev={...revision(),conclusionId:id(902),revisionSubjectId:id(905)};
    await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision(rev)),{code:'INVALID_REFERENCE'});
    assert.equal(c.getConclusion(id(902)).current_revision,0);
    await assert.rejects(transaction(c,tx=>tx.linkQuestions({questionId:id(900),relatedQuestionId:id(10),role:'comparison',policy:{},taskId,reason:'no scope'})),{code:'INVALID_REFERENCE'});
    await transaction(c,tx=>tx.linkQuestions({questionId:id(900),relatedQuestionId:id(10),role:'comparison',policy:{scope:{range:{start:1,end:2}},criterion:'following',unit:'transitions'},taskId,reason:'explicit synthetic comparison'}));
    const linked={...rev,support:[{findingId:id(26),role:'support',comparisonLink:JSON.stringify([id(900),id(10),'comparison'])}]};
    await transaction(c,tx=>tx.appendConclusionRevision(linked));await transaction(c,tx=>tx.appendConclusionRevision({...linked,revision:2,expectedRevision:1,predecessor:1,revisionSubjectId:id(906),support:[{...linked.support[0],role:'counterevidence'}]}));
    assert.equal(c.pageSupport(id(902),1).rows[0].role,'support');assert.equal(c.pageSupport(id(902),2).rows[0].role,'counterevidence');
    await transaction(c,tx=>{tx.createRun(runInput(910));tx.appendRunSources({runId:id(910),sources:[{ordinal:0,captureKey:recordKey(cap(0)),range:{start:1,end:1},availability:'not-checked',fingerprints:{},validation:{state:'verified'}}]});tx.sealRun({runId:id(910),semanticsVersion:'1'});tx.transitionRun(transition(910,913));});
    await assert.rejects(transaction(c,tx=>tx.publishRunResult(result(910,914,finding(916)))),{code:'INVALID_REFERENCE'});
    assert.equal(c.getRun(id(910)).workflow,'running');
    await transaction(c,tx=>tx.transitionRun({eventId:id(914),subjectId:id(911),expectedState:'running',nextState:'errored',taskId,reason:'execution failure, not gameplay failure'}));
    assert.equal(c.pageFindings(id(910)).rows.length,0);
});

test('C1 score done retains files; explicit retiring preserves historical non-owning references and retries',async t=>{
    const {c}=await fixture(t),score={...cap(2),collection:'score'},source=()=>jsonChunks({score:0}),expected=digestChunks(source());
    await c.evidence.withWriter(async w=>{
        w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(score),ordinal:1,value:{}});tx.reserveOutput({recordKey:score,path:'synthetic-score.response',...expected});tx.appendIntent({id:'score-publish',recordKey:score,files:[{ordinal:0,path:'synthetic-score.response',hash:expected.expectedHash,bytes:expected.expectedBytes}]});});
        await w.publishOutput({recordKey:score,path:'synthetic-score.response',source:source(),...expected});w.transaction(tx=>tx.finishPublication({recordKey:score,operationId:'score-publish'}));
    });
    const artifact={kind:'artifact',id:id(950),subjectId:id(951),owner:recordOwner(score),field:'output',format:'raw-response-v1',path:'synthetic-score.response',hash:expected.expectedHash,bytes:expected.expectedBytes};
    await transaction(c,tx=>{tx.registerIdentity({kind:'capture',capture:score,subjectId:id(952)});tx.registerIdentity(artifact);tx.appendEvidenceRef({evidenceRefId:id(953),captureKey:recordKey(score),artifactId:id(950)});tx.appendReviewEvent({eventId:id(954),targetSubjectId:id(952),taskId,expectedState:'unclaimed',checkpoint:'claimed',reason:'catalog only'});});
    await c.evidence.withWriter(w=>w.transaction(tx=>{tx.setStatus({recordKey:score,status:'done'});tx.appendIntent({id:'score-cleanup',recordKey:score,phase:'cleanup',files:[{ordinal:0,path:artifact.path,hash:artifact.hash,bytes:artifact.bytes,originalPresent:true}]});}));
    await assert.rejects(c.evidence.withWriter(w=>w.deleteFile({operationId:'score-cleanup',ordinal:0})),{code:'INVALID_STATE'});assert.ok(fs.existsSync(path.join(c.root,artifact.path)));
    await c.evidence.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:score,status:'retiring'})));
    await c.evidence.withWriter(async w=>{await w.deleteFile({operationId:'score-cleanup',ordinal:0});w.transaction(tx=>tx.finishPublication({recordKey:score,operationId:'score-cleanup',retire:true}));});
    assert.equal(c.resolveEvidence(id(953)).availability,'retired');assert.equal(c.pageReviews(id(952)).rows[0].checkpoint,'claimed');
    await transaction(c,tx=>tx.registerIdentity(artifact));
    await assert.rejects(transaction(c,tx=>tx.registerIdentity({...artifact,hash:'e'.repeat(64)})),{code:'IDENTITY_CONFLICT'});
    assert.equal(c.resolveEvidence(id(953)).artifact.hash,artifact.hash);
});

test('C1 schema-2 core snapshot still pins selected payload bytes across cleanup',async t=>{
    const {c,artifact}=await fixture(t);
    await c.evidence.withReadSnapshot({recordKeys:[cap(0)]},async view=>{
        await c.evidence.withWriter(async w=>{w.transaction(tx=>{tx.setStatus({recordKey:cap(0),status:'done'});tx.appendIntent({id:'pin-cleanup',recordKey:cap(0),phase:'cleanup',files:[{ordinal:0,path:artifact.path,hash:artifact.hash,bytes:artifact.bytes,originalPresent:true}]});});await w.deleteFile({operationId:'pin-cleanup',ordinal:0});w.transaction(tx=>tx.finishPublication({recordKey:cap(0),operationId:'pin-cleanup',retire:true}));});
        assert.equal(fs.existsSync(path.join(c.root,artifact.path)),false);
        // The operational reader uses its already-opened handle, never the path.
        const pinned=view.artifact(artifact),bytes=Buffer.alloc(artifact.bytes);
        assert.equal(view.read(pinned,bytes,0),artifact.bytes);
        assert.deepEqual(JSON.parse(bytes.toString()),{positions:[0,false,null,'Á😀']});
    });
});

test('C1 fault rollback and competing revision/review writers preserve atomic histories',async t=>{
    let armed=false;const {c}=await fixture(t,{fault:name=>{if(armed&&name==='transaction-commit')throw Object.assign(Error('commit failed'),{code:'EIO'});}});await completed(c);armed=true;await assert.rejects(transaction(c,tx=>tx.appendConclusionRevision(revision())),{code:'EIO'});armed=false;assert.equal(c.getConclusion(id(30)).current_revision,0);assert.equal(c.pageSupport(id(30),1).rows.length,0);
    const race=`import {openCatalog} from ${JSON.stringify(moduleUrl)};const c=await openCatalog({root:process.argv[1],mode:'write'});try{await c.withWriter(w=>w.transaction(tx=>tx.appendConclusionRevision(JSON.parse(process.argv[2]))));console.log('ok');}catch(e){console.log(e.code);}finally{c.close();}`;
    const results=await Promise.all([revision(),{...revision(),revisionSubjectId:id(91)}].map(v=>child(race,[c.root,JSON.stringify(v)])));assert.ok(results.every(r=>r.code===0),JSON.stringify(results));assert.deepEqual(results.map(r=>r.output.trim()).sort(),['REVISION_CONFLICT','ok']);assert.equal(c.getConclusion(id(30)).current_revision,1);assert.equal(c.pageSupport(id(30),1).rows.length,1);
    const review=`import {openCatalog} from ${JSON.stringify(moduleUrl)};const c=await openCatalog({root:process.argv[1],mode:'write'});await c.withWriter(w=>w.transaction(tx=>tx.appendReviewEvent(JSON.parse(process.argv[2]))));c.close();`;
    const target=c.getConclusion(id(30),1).subject_id;await transaction(c,tx=>tx.registerIdentity({kind:'task',id:'second',subjectId:id(92)}));const reviews=await Promise.all([taskId,'second'].map((taskId,i)=>child(review,[c.root,JSON.stringify({eventId:id(93+i),targetSubjectId:target,taskId,expectedState:'unclaimed',checkpoint:'claimed',reason:'independent'})])));assert.ok(reviews.every(r=>r.code===0),JSON.stringify(reviews));assert.equal(c.pageReviews(target).rows.length,2);
});

test('C1 post-commit failure leaves one complete revision and exact retry resolves its receipt',async t=>{
    const {c}=await fixture(t);await completed(c);
    await assert.rejects(c.withWriter(w=>{w.transaction(tx=>tx.appendConclusionRevision(revision()));throw Object.assign(Error('receipt interrupted after COMMIT'),{code:'EIO'});}),{code:'EIO'});
    assert.equal(c.getConclusion(id(30)).current_revision,1);assert.equal(c.pageSupport(id(30),1).rows.length,1);
    await transaction(c,tx=>tx.appendConclusionRevision(revision()));assert.equal(c.pageConclusionHistory(id(30)).rows.length,1);
});

test('C1 sealed source counts and logical digest remain bounded, deterministic and independent of unrelated rows',async t=>{
    const {c}=await fixture(t);const source={ordinal:0,captureKey:recordKey(cap(0)),availability:'not-checked',reason:'explicit selection',fingerprints:{evidence:'d'.repeat(64),map:mapId}};let a,b;
    await transaction(c,tx=>{tx.createRun(runInput());tx.appendRunSources({runId:id(20),sources:[source]});a=tx.sealRun({runId:id(20),semanticsVersion:'1'});});
    assert.equal(c.getRun(id(20)).selection_version,'1');
    await transaction(c,tx=>{tx.appendProperty({subjectId:id(2),pointer:'/unrelated',ordinal:0,value:0});tx.createRun(runInput(960));tx.appendRunSources({runId:id(960),sources:[source]});b=tx.sealRun({runId:id(960),semanticsVersion:'1'});});assert.equal(a,b);
    await transaction(c,tx=>tx.createRun(runInput(970)));
    await assert.rejects(transaction(c,tx=>tx.appendRunSources({runId:id(970),sources:Array(65).fill(source)})),{code:'RESOURCE_LIMIT'});assert.equal(c.pageRunSources(id(970)).rows.length,0);
    await transaction(c,tx=>tx.appendRunSources({runId:id(970),sources:[{...source,ordinal:1}]}));
    await assert.rejects(transaction(c,tx=>tx.sealRun({runId:id(970),semanticsVersion:'1'})),{code:'INVALID_REFERENCE'});assert.equal(c.getRun(id(970)).sealed,0);
    await assert.rejects(transaction(c,tx=>tx.sealRun({runId:id(20),semanticsVersion:'changed'})),{code:'IDENTITY_CONFLICT'});
});

test('C1 process interruption before commit retains old head and resumes exact bounded selection',async t=>{
    const {c}=await fixture(t);await completed(c);const code=`import {openCatalog} from ${JSON.stringify(moduleUrl)};const c=await openCatalog({root:process.argv[1],mode:'write'});await c.withWriter(w=>w.transaction(tx=>{tx.appendConclusionRevision(JSON.parse(process.argv[2]));process.kill(process.pid,'SIGKILL');}));`;
    const crashed=await child(code,[c.root,JSON.stringify(revision())]);assert.equal(crashed.signal,'SIGKILL');fs.utimesSync(path.join(c.root,'.manifest.lock'),new Date(0),new Date(0));await transaction(c,()=>{});assert.equal(c.getConclusion(id(30)).current_revision,0);assert.equal(c.pageSupport(id(30),1).rows.length,0);await transaction(c,tx=>tx.appendConclusionRevision(revision()));assert.equal(c.getConclusion(id(30)).current_revision,1);
});

if(process.argv[2]==='catalog-scale-worker'){
    const started=performance.now(),measurements=[],fixtureCounts=[];
    for(const count of [10,1000]){
        const root=process.argv[count===10?3:4],c=await createCatalogFixture({root,filesystem:'local-apfs'});
        try{
        await transaction(c,tx=>{tx.registerIdentity({kind:'replay',id:replayId,subjectId:id(2)});tx.registerIdentity({kind:'task',id:taskId,subjectId:id(1)});tx.createQuestion(question);tx.registerIdentity(conclusion);});
        for(let start=0;start<count;start+=100)await transaction(c,tx=>{for(let i=start;i<Math.min(start+100,count);i++)tx.registerIdentity({kind:'capture',capture:cap(i),subjectId:id(1000+i),ordinal:i});});
        const db=new DatabaseSync(dbFile(c),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM catalog_captures').get().n,count);const plan=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM catalog_captures WHERE replay_id=? AND ordinal>? ORDER BY ordinal,capture_key LIMIT 128').all(replayId,-1);assert.ok(plan.some(r=>r.detail.includes('catalog_capture_page')));assert.ok(plan.every(r=>!r.detail.includes('SCAN catalog_captures')));}finally{db.close();}
        await transaction(c,tx=>tx.appendEvidenceRef({evidenceRefId:id(8),captureKey:recordKey(cap(0)),range:{start:1,end:2}}));await completed(c,20,24,finding(26,'unknown'));await transaction(c,tx=>tx.appendConclusionRevision(revision(1,'unknown')));
        const reviewTask='scale/'+count;await transaction(c,tx=>tx.registerIdentity({kind:'task',id:reviewTask,subjectId:id(6000+count)}));
        for(const op of ['list','lookup','support','history','review']){c.resetMetrics();const t=performance.now();if(op==='list')assert.equal(c.pageCaptures(replayId,null,10).rows.length,10);if(op==='lookup')assert.equal(c.getCapture(cap(0)).capture_key,recordKey(cap(0)));if(op==='support')assert.equal(c.pageSupport(id(30),1).rows.length,1);if(op==='history')assert.equal(c.pageConclusionHistory(id(30)).rows.length,1);if(op==='review')await transaction(c,tx=>tx.appendReviewEvent({eventId:id(5000+count),targetSubjectId:id(31),taskId:reviewTask,expectedState:'unclaimed',checkpoint:'claimed',reason:'bounded review'}));assert.equal(c.metrics.payloadOpens,0);assert.equal(c.metrics.payloadReadBytes,0);assert.equal(c.metrics.payloadWriteBytes,0);measurements.push({count,op,ms:performance.now()-t,metrics:{...c.metrics}});}
    const inspection=new DatabaseSync(dbFile(c),{readOnly:true});let tableCounts;
    try{
        tableCounts=Object.fromEntries(inspection.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'catalog_%' ORDER BY name").all().map(({name})=>[name,inspection.prepare(`SELECT count(*) n FROM ${name}`).get().n]));
        for(const [sql,args]of [
            ['SELECT * FROM catalog_captures WHERE capture_key=?',[recordKey(cap(0))]],
            ['SELECT * FROM catalog_conclusion_support WHERE conclusion_id=? AND revision=? ORDER BY ordinal,link_key LIMIT 128',[id(30),1]],
            ['SELECT * FROM catalog_conclusion_revisions WHERE conclusion_id=? ORDER BY ordinal,subject_id LIMIT 128',[id(30)]],
            ['SELECT * FROM catalog_reviews WHERE target_subject_id=? ORDER BY ordinal,review_key LIMIT 128',[id(31)]]
        ]){const plan=inspection.prepare('EXPLAIN QUERY PLAN '+sql).all(...args);assert.ok(plan.some(v=>v.detail.startsWith('SEARCH ')&&v.detail.includes('INDEX')),JSON.stringify(plan));assert.ok(plan.every(v=>!v.detail.startsWith('SCAN ')),JSON.stringify(plan));}
    }finally{inspection.close();}
    fixtureCounts.push({count,tableCounts});
    }finally{c.close();}
    }
    for(const op of ['list','lookup','support','history','review']){const a=measurements.find(v=>v.count===10&&v.op===op),b=measurements.find(v=>v.count===1000&&v.op===op);assert.equal(a.metrics.sql,b.metrics.sql);assert.equal(a.metrics.rows,b.metrics.rows);}
    assert.ok(process.resourceUsage().maxRSS*1024<=256*1024*1024);console.log(JSON.stringify({elapsedMs:performance.now()-started,maxRssBytes:process.resourceUsage().maxRSS*1024,fixtureCounts,measurements}));
}else test('C1 10/1000-anchor metadata resource gate under 192 MiB heap / 256 MiB RSS',{timeout:35_000},async t=>{
    const roots=[fs.mkdtempSync(prefix),fs.mkdtempSync(prefix)];t.after(()=>roots.forEach(root=>fs.rmSync(root,{recursive:true,force:true})));const p=spawn(process.execPath,['--max-old-space-size=192',new URL(import.meta.url).pathname,'catalog-scale-worker',...roots],{stdio:['ignore','pipe','pipe']});let output='',errors='',expired=false;p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>errors+=b);const timer=setTimeout(()=>{expired=true;p.kill('SIGKILL');},30_000);const code=await new Promise((r,j)=>{p.once('error',j);p.once('exit',r);});clearTimeout(timer);assert.equal(expired,false);assert.equal(code,0,errors+output);const receipt=JSON.parse(output.trim());assert.ok(receipt.maxRssBytes<=256*1024*1024);t.diagnostic(JSON.stringify(receipt));
});

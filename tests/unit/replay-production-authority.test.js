import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {fixture,log,frames,replayId} from '../fixtures/replay-import-command-fixture.js';
import {hashFiles} from '../fixtures/replay-log-review-command-fixture.js';
import {importCacheFile,updateReview,verifyScoreSource,sha256} from '../../tools/replay-logs.js';
import {convertFixtureV2Bounded} from '../../tools/replay-conversion-bounded-fixture.js';
import {openStore,recoverySchemaHash} from '../../tools/replay-store.js';
import {recoveryBudget,readDatabase,databaseFacts,artifactInventory,digest} from '../../tools/replay-sqlite-recovery-data.js';
import * as admin from '../../tools/replay-store-migrate.js';
import {productionSelection,productionLease,PRODUCTION_STATE,PRODUCTION_PROOF} from '../../tools/replay-production-scope.js';
import {runProductionCommand,productionLogCli} from '../../tools/replay-production-authority.js';
import {assertSyntheticFixtureAccess} from '../../tools/replay-log-review-fixture.js';
import {analyzeReplay} from '../../tools/replay-analysis.js';
import {CAPACITY} from '../fixtures/replay-capacity-fixture.js';

const tmp=fs.realpathSync(os.tmpdir()),codeRoot=process.cwd();
function directory(prefix,t){const root=fs.mkdtempSync(path.join(tmp,prefix));t?.diagnostic(JSON.stringify({root,generated:true,retained:true}));return root;}
function control(file,value){fs.writeFileSync(file,JSON.stringify(value)+'\n');return sha256(fs.readFileSync(file));}
function copyDirectory(source,destination){fs.mkdirSync(destination,{recursive:true});for(const item of fs.readdirSync(source,{withFileTypes:true})){const src=path.join(source,item.name),dst=path.join(destination,item.name);assert(!item.isSymbolicLink());if(item.isDirectory())copyDirectory(src,dst);else{assert(!execFileSync('/usr/bin/stat',['-f','%Sf',src],{encoding:'utf8'}).includes('dataless'));fs.copyFileSync(src,dst);assert.notEqual(fs.statSync(src).ino,fs.statSync(dst).ino);}}}
let retainedRelease;
function release(t){
    if(retainedRelease)return retainedRelease;
    const root=directory('pain-gain-production-release-fixture-',t);fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'runtime'));
    const files=[];
    for(const name of fs.readdirSync(path.join(codeRoot,'tools')).filter(n=>n.endsWith('.js'))){const relative='tools/'+name,file=path.join(codeRoot,relative);assert(!execFileSync('/usr/bin/stat',['-f','%Sf',file],{encoding:'utf8'}).includes('dataless'));fs.copyFileSync(file,path.join(root,relative));files.push({path:relative,sha256:sha256(fs.readFileSync(file))});}
    fs.copyFileSync(process.execPath,path.join(root,'runtime/node'));fs.chmodSync(path.join(root,'runtime/node'),0o700);files.push({path:'runtime/node',sha256:sha256(fs.readFileSync(process.execPath))});
    for(const relative of ['src/config.js','src/debug/build-id.js']){const file=path.join(codeRoot,relative);assert(!execFileSync('/usr/bin/stat',['-f','%Sf',file],{encoding:'utf8'}).includes('dataless'));fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.copyFileSync(file,path.join(root,relative));files.push({path:relative,sha256:sha256(fs.readFileSync(file))});}
    control(path.join(root,'package.json'),{type:'module'});files.push({path:'package.json',sha256:sha256(fs.readFileSync(path.join(root,'package.json')))});
    const file=path.join(root,'release.json'),hash=control(file,{version:1,scope:'production-recovery-release-v1',node:process.version,schemaHash:recoverySchemaHash(),capabilities:['map-independent-scores','map-repair','production-authority-v1'],files});
    retainedRelease={root,file,hash};return retainedRelease;
}
async function setup(t){
    const f=await fixture(t),input=f.write('initial',log());await importCacheFile(f.v2,path.join(input.sourceRoot,input.sourceFile));
    const v2file=path.join(f.v2,'replay_logs/manifest.json'),v2=JSON.parse(fs.readFileSync(v2file));v2.scoreRecords=[];v2.retiredScoreSources=[];v2.unknown={order:[false,null,2]};v2.records[0].reviews['other/owner']={claimedAt:'original',examinedAt:null,completedAt:null,unknown:[2,1]};control(v2file,v2);
    const source=directory('pain-gain-v2-reader-fixture-',t);control(path.join(source,'.replay-v2-reader-fixture.json'),{fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'});copyDirectory(path.join(f.v2,'replay_logs'),path.join(source,'replay_logs'));
    await convertFixtureV2Bounded({synthetic:true,sourceRoot:source,root:f.root});
    const projectRoot=directory('pain-gain-production-project-fixture-',t),root=path.join(projectRoot,'replay_logs');copyDirectory(path.join(f.v2,'replay_logs'),root);
    const backupRoot=directory('pain-gain-production-v2-backup-fixture-',t),restoreRoot=directory('pain-gain-production-v2-restore-fixture-',t);copyDirectory(root,backupRoot);copyDirectory(root,restoreRoot);
    const controls=directory('pain-gain-production-controls-fixture-',t),inventory=path.join(controls,'inventory.json'),files=Object.entries(hashFiles(root)).map(([p,hash])=>({path:p,bytes:fs.statSync(path.join(root,p)).size,hash}));
    const inventoryHash=control(inventory,{version:1,files}),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),b=recoveryBudget();
    const facts=readDatabase(path.join(f.root,d.database),b,db=>({facts:databaseFacts(db,recoverySchemaHash(),b),artifacts:artifactInventory(db,f.root,b)})),r=release(t);
    const qualification=path.join(controls,'qualification.json'),qualificationHash=control(qualification,{version:1,scope:'production-storage-qualification-v1',status:'accepted',releaseHash:r.hash,inventoryHash,logicalHash:facts.facts.logicalHash,artifactsHash:digest(facts.artifacts),consumerCoverageAccepted:true,m2hAccepted:true,durabilityDecisionReceiptHash:'d'.repeat(64),testOnly:'Generated contract declarations; not real qualification'});
    const proof=path.join(controls,'proof.json'),proofValue={version:1,scope:'production-migration-proof-v1',projectRoot,stageRoot:f.root,backupRoot,restoreRoot,inventory,inventoryHash,release:r.file,releaseHash:r.hash,qualification,qualificationHash,logicalHash:facts.facts.logicalHash,artifactsHash:digest(facts.artifacts),preservationVerified:true,requiredConsumersQualified:true,m2hAccepted:true,cacheRoots:[f.sourceRoot]};
    const proofSha256=control(proof,proofValue);
    return{...f,projectRoot,root,stageRoot:f.root,controls,proof,proofSha256,proofValue,original:v2,release:r};
}
function approved(f,action,subject,projectRoot=f.projectRoot,changes={}){
    const file=path.join(f.controls,action+'-'+path.basename(projectRoot)+'.json');const hash=control(file,{version:1,scope:'production-storage-approval-v1',action,projectRoot,subjectHash:subject,approved:true,operator:'generated-contract-test-only',expiresAt:Date.now()+3600000,quiescence:{writersStopped:true,lockCoverageConfirmed:true},durability:{filesystem:'local-apfs',fsyncRenameAccepted:true,powerLossDecision:'accepted-platform-assumptions',decisionReceiptHash:'d'.repeat(64)},...changes});
    return{projectRoot,approval:file,approvalSha256:hash};
}
const prepare=f=>admin.prepareProductionCutover({...approved(f,'prepare',f.proofSha256),proof:f.proof,proofSha256:f.proofSha256});
async function activate(f){await prepare(f);return admin.cutoverProduction(approved(f,'cutover',f.proofSha256));}
async function writable(f){await activate(f);await admin.enableProductionWrites(approved(f,'enable-writes',productionSelection(f.projectRoot).descriptorHash));}
const command=(f,command,options={})=>runProductionCommand({projectRoot:f.projectRoot,command,options});
const key=f=>({replayId,fingerprint:f.original.records[0].fingerprint,taskId:'codex/production-fixture'});

test('v2 stays default; explicit preparation fences old callers without relabelling',async t=>{
    const f=await setup(t);assert.equal(productionSelection(f.projectRoot),null);const stage=hashFiles(f.stageRoot);
    await prepare(f);assert.throws(()=>productionSelection(f.projectRoot),{code:'RECOVERY_REQUIRED'});await assert.rejects(importCacheFile(f.projectRoot,path.join(f.sourceRoot,'initial')),{code:'RECOVERY_REQUIRED'});
    assert(!fs.existsSync(path.join(f.root,'.storage-v3-fixture')));assert(!fs.existsSync(path.join(f.root,'.storage-v3-rehearsal')));assert.deepEqual(hashFiles(f.stageRoot),stage);
    assert.throws(()=>assertSyntheticFixtureAccess(f.root),{code:'UNSAFE_PATH'});await assert.rejects(openStore({root:f.root,mode:'read'}),{code:'UNSAFE_PATH'});
});
test('read-only activation, separate writes, consumers and exclusive post-write restore',async t=>{
    const f=await setup(t),stage=hashFiles(f.stageRoot),original=hashFiles(path.join(f.v2,'replay_logs'));f.proofValue.importBudget={profile:'converted-corpus-v1',logs:320,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128};f.proofValue.cacheCapacity={...CAPACITY};f.proofSha256=control(f.proof,f.proofValue);await activate(f);
    assert.equal(productionSelection(f.projectRoot).descriptor.production.mode,'read-only');assert.equal((await command(f,'maps')).length,1);
    await assert.rejects(command(f,'claim',key(f)),{code:'WRITE_FENCED'});const selected=productionSelection(f.projectRoot);
    await productionLease(selected,async()=>{const s=await openStore({root:f.root,mode:'write'});try{await assert.rejects(s.withWriter(w=>w.transaction(()=>{})),{code:'WRITE_FENCED'});}finally{s.close();}});
    await admin.enableProductionWrites(approved(f,'enable-writes',selected.descriptorHash));
    const convertedBefore=hashFiles(f.root);assert.equal((await command(f,'import',{sourceRoot:f.sourceRoot,sourceFile:'initial'})).kind,'deduplicated');assert.deepEqual(hashFiles(f.root),convertedBefore);
    assert.equal((await updateReview(f.projectRoot,'claim',replayId,key(f).fingerprint,key(f).taskId)).changed,true);assert.equal((await command(f,'examined',key(f))).changed,true);assert.equal((await command(f,'examined',key(f))).changed,false);
    const report=await analyzeReplay({root:f.projectRoot,replayId,fingerprints:[key(f).fingerprint],reportMode:'compact'});assert(report.summary);
    const score=f.write('score',frames(),{collection:'score'}),scored=await command(f,'score-import',{sourceRoot:score.sourceRoot,sourceFile:score.sourceFile});assert.equal((await verifyScoreSource(f.projectRoot,replayId,scored.record.fingerprint)).verified,true);
    await command(f,'score-claim',{...key(f),fingerprint:scored.record.fingerprint});await command(f,'score-examined',{...key(f),fingerprint:scored.record.fingerprint});
    const arrival=f.write('post-conversion-log',log({tick:2})),added=await command(f,'import',{sourceRoot:arrival.sourceRoot,sourceFile:arrival.sourceFile});assert.equal(added.kind,'imported');
    assert.equal((await command(f,'list')).records.length,2);
    const backupRoot=directory('pain-gain-production-current-backup-fixture-',t),destination=directory('pain-gain-production-restored-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));
    const recovered=await admin.prepareProductionRecovery({...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination});
    assert.throws(()=>productionSelection(f.projectRoot),{code:'RECOVERY_REQUIRED'});const fenced=hashFiles(f.root);
    const restore={...approved(f,'restore',recovered.receiptHash,destination),backupRoot,receiptSha256:recovered.receiptHash};await admin.restoreProductionRecovery(restore);const before=hashFiles(path.join(destination,'replay_logs'));await admin.restoreProductionRecovery(restore);assert.deepEqual(hashFiles(path.join(destination,'replay_logs')),before);
    await admin.selectRestoredProduction(approved(f,'select-restored',recovered.receiptHash,destination));
    const restored={...f,projectRoot:destination,root:path.join(destination,'replay_logs')};assert.deepEqual(await command(restored,'analyze',{replayId,fingerprints:[key(f).fingerprint],reportMode:'compact'}),report);
    assert.equal((await verifyScoreSource(destination,replayId,scored.record.fingerprint)).verified,true);
    assert.deepEqual(productionSelection(destination).proof.importBudget,f.proofValue.importBudget);
    assert.deepEqual(productionSelection(destination).proof.cacheCapacity,f.proofValue.cacheCapacity);
    assert.equal(sha256(fs.readFileSync(path.join(restored.root,added.record.outputPath))),added.record.outputFingerprint);
    await admin.enableProductionWrites(approved(f,'enable-writes',productionSelection(destination).descriptorHash,destination));assert.equal((await command(restored,'claim',{...key(f),taskId:'codex/restored-write'})).changed,true);
    assert((await command(restored,'list')).records.some(r=>r.fingerprint===added.record.fingerprint));
    assert.deepEqual(hashFiles(f.root),fenced);assert.deepEqual(hashFiles(f.stageRoot),stage);assert.deepEqual(hashFiles(path.join(f.v2,'replay_logs')),original);
    const req=path.join(f.controls,'independent-read.json'),pin=control(req,{projectRoot:destination,command:'maps'});
    const hook=path.join(f.controls,'deny-original.mjs');fs.writeFileSync(hook,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {registerHooks} from 'node:module';const denied=${JSON.stringify([codeRoot,f.root,f.stageRoot])};function check(v){if(typeof v==='number')return;const s=String(v);if(denied.some(p=>s===p||s.startsWith(p+'/')||s.startsWith('file://'+p+'/')))throw Error('Original/worktree access denied');}for(const k of ['openSync','readFileSync','statSync','lstatSync','realpathSync','opendirSync','readdirSync']){const old=fs[k];fs[k]=function(p,...a){check(p);return old.call(this,p,...a);};Object.assign(fs[k],old);}syncBuiltinESMExports();registerHooks({load(u,c,next){check(u);return next(u,c);}});`);
    const script=path.join(f.controls,'independent-read.mjs');fs.writeFileSync(script,`import fs from 'node:fs';import {runProductionCommand} from ${JSON.stringify('file://'+f.release.root+'/tools/replay-production-authority.js')};console.log(JSON.stringify(await runProductionCommand(JSON.parse(fs.readFileSync(${JSON.stringify(req)})))));`);
    const result=spawnSync(path.join(f.release.root,'runtime/node'),['--import',hook,script],{cwd:f.controls,encoding:'utf8',timeout:60000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});control(path.join(f.controls,'independent-result.json'),{pin,status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).length,1);
});

for(const fault of ['after-stage-copy','after-database-seal','before-descriptor','after-descriptor','after-activation'])test('retained cutover interruption '+fault,async t=>{
    const f=await setup(t),error=Object.assign(Error('retained synthetic interruption'),{code:'EIO'}),inject=p=>{if(p===fault)throw error;};
    if(fault==='after-stage-copy'){await assert.rejects(admin.prepareProductionCutover({...approved(f,'prepare',f.proofSha256),proof:f.proof,proofSha256:f.proofSha256,fault:inject}),e=>e===error);await prepare(f);}
    else{await prepare(f);await assert.rejects(admin.cutoverProduction({...approved(f,'cutover',f.proofSha256),fault:inject}),e=>e===error);}
    await admin.cutoverProduction(approved(f,'cutover',f.proofSha256));assert.equal((await command(f,'maps')).length,1);
});
for(const defect of ['approval','quiescence','durability','inventory','backup','restore','stage','release','capability','unknown-layout'])test('production preparation rejects '+defect+' without publication',async t=>{
    const f=await setup(t);let approvalChanges={};
    if(defect==='approval')approvalChanges.approved=false;if(defect==='quiescence')approvalChanges.quiescence={writersStopped:false,lockCoverageConfirmed:true};if(defect==='durability')approvalChanges.durability={};
    if(defect==='inventory')fs.appendFileSync(f.proofValue.inventory,' ');
    if(defect==='backup'||defect==='restore')fs.appendFileSync(path.join(f.proofValue[defect==='backup'?'backupRoot':'restoreRoot'],'manifest.json'),' ');
    if(defect==='stage')fs.appendFileSync(path.join(f.stageRoot,f.original.records[0].outputPath),'corrupt');
    if(defect==='release'){f.proofValue.releaseHash='0'.repeat(64);f.proofSha256=control(f.proof,f.proofValue);}
    if(defect==='capability'||defect==='unknown-layout'){f.proofValue[defect==='capability'?'m2hAccepted':'scope']=false;f.proofSha256=control(f.proof,f.proofValue);}
    const before=hashFiles(f.root);await assert.rejects(admin.prepareProductionCutover({...approved(f,'prepare',f.proofSha256,f.projectRoot,approvalChanges),proof:f.proof,proofSha256:f.proofSha256}));assert.deepEqual(hashFiles(f.root),before);assert.equal(productionSelection(f.projectRoot),null);
});
test('changed source, corrupt retained diagnostics and changed descriptor cannot be blessed',async t=>{
    const f=await setup(t);await prepare(f);fs.appendFileSync(path.join(f.root,'manifest.json'),' ');await assert.rejects(admin.cutoverProduction(approved(f,'cutover',f.proofSha256)),{code:'CHANGED_SOURCE'});
    const g=await setup(t);await prepare(g);const d=JSON.parse(fs.readFileSync(path.join(g.stageRoot,'manifest.json'))),b=recoveryBudget(),ref=readDatabase(path.join(g.root,d.database),b,db=>db.prepare('SELECT path FROM payloads LIMIT 1').get());fs.appendFileSync(path.join(g.root,ref.path),'corrupt');await assert.rejects(admin.cutoverProduction(approved(g,'cutover',g.proofSha256)),{code:'INVALID_ARTIFACT'});
    const h=await setup(t);await activate(h);const manifest=path.join(h.root,'manifest.json');fs.appendFileSync(manifest,' ');assert.throws(()=>productionSelection(h.projectRoot),{code:'AUTHORITY_CONFLICT'});
});
test('concurrent reviews, mutated options, wrong owners and bounds retain atomic behavior',async t=>{
    const f=await setup(t);await writable(f);const request={projectRoot:f.projectRoot,command:'claim',options:key(f)},pending=runProductionCommand(request);request.options.fingerprint='f'.repeat(64);await pending;
    const results=await Promise.all([command(f,'examined',key(f)),command(f,'examined',key(f))]);assert.equal(results.filter(r=>r.changed).length,1);
    const before=hashFiles(f.root);await assert.rejects(command(f,'examined',{...key(f),taskId:'unclaimed'}),{code:'NOT_CLAIMED'});await assert.rejects(command(f,'analyze',{replayId,fingerprints:Array.from({length:65},(_,i)=>i.toString(16).padStart(64,'0'))}),{code:'RESOURCE_LIMIT'});assert.deepEqual(hashFiles(f.root),before);
    let n=0;await assert.rejects(command(f,'maps',{get limits(){n++;return {};}}),{code:'INVALID_ARGUMENT'});assert.equal(n,0);
});
test('explicit production CLI dispatch does not inspect default live evidence',async t=>{
    const f=await setup(t);await activate(f);let out='';await productionLogCli(f.projectRoot,'maps',[],{write:s=>{out+=s;return true;}});assert.equal(JSON.parse(out).length,1);
    const result=spawnSync(process.execPath,['tools/replay-logs.js','--storage-root',f.projectRoot,'maps'],{cwd:codeRoot,encoding:'utf8',timeout:60000});control(path.join(f.controls,'cli-result.json'),{status:result.status,stdout:result.stdout,stderr:result.stderr});assert.equal(result.status,0,result.stderr);
});
test('mock dataless descriptor/database/sidecar rejects before its content open',async t=>{
    const f=await setup(t);await activate(f);const d=productionSelection(f.projectRoot).descriptor,db=path.join(f.root,d.database),sidecar=db+'-journal';fs.writeFileSync(sidecar,'retained mock');
    for(const target of [path.join(f.root,'manifest.json'),path.join(f.root,PRODUCTION_STATE),path.join(f.root,PRODUCTION_PROOF),db,sidecar]){
        const child=await import('node:child_process'),original=child.default.execFileSync,open=fs.openSync;let count=0;
        child.default.execFileSync=(cmd,args,opt)=>args?.includes(target)?'dataless\n':original(cmd,args,opt);fs.openSync=(p,...args)=>{if(p===target)count++;return open(p,...args);};syncBuiltinESMExports();
        try{await assert.rejects(command(f,'maps'),e=>e.code==='dataless-input');assert.equal(count,0);}finally{child.default.execFileSync=original;fs.openSync=open;syncBuiltinESMExports();}
    }
});

for(const point of ['before-descriptor','after-descriptor'])test('write-enable publication recovery '+point,async t=>{
    const f=await setup(t);await activate(f);const request=approved(f,'enable-writes',productionSelection(f.projectRoot).descriptorHash);
    await assert.rejects(admin.enableProductionWrites({...request,fault:p=>{if(p===point)throw Object.assign(Error('retained'),{code:'EIO'});}}),{code:'EIO'});
    assert.throws(()=>productionSelection(f.projectRoot),{code:'RECOVERY_REQUIRED'});await admin.enableProductionWrites(request);assert.equal((await command(f,'claim',key(f))).changed,true);
});
for(const point of ['after-database-backup','before-source-fence','after-source-fence'])test('current-state recovery handoff interruption '+point,async t=>{
    const f=await setup(t);await writable(f);await command(f,'claim',key(f));const backupRoot=directory('pain-gain-production-current-backup-fixture-',t),destination=directory('pain-gain-production-restored-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));
    const request={...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination};await assert.rejects(admin.prepareProductionRecovery({...request,fault:p=>{if(p===point)throw Object.assign(Error('retained'),{code:'EIO'});}}),{code:'EIO'});
    const recovered=await admin.prepareProductionRecovery(request),restore={...approved(f,'restore',recovered.receiptHash,destination),backupRoot,receiptSha256:recovered.receiptHash};
    await assert.rejects(admin.restoreProductionRecovery({...restore,fault:p=>{if(p==='after-restore-copy')throw Object.assign(Error('retained'),{code:'EIO'});}}),{code:'EIO'});assert.throws(()=>productionSelection(destination),{code:'RECOVERY_REQUIRED'});
    await admin.restoreProductionRecovery(restore);const select=approved(f,'select-restored',recovered.receiptHash,destination);await assert.rejects(admin.selectRestoredProduction({...select,fault:p=>{if(p==='after-descriptor')throw Object.assign(Error('retained'),{code:'EIO'});}}),{code:'EIO'});
    await admin.selectRestoredProduction(select);await admin.selectRestoredProduction(select);assert.equal((await command({...f,projectRoot:destination},'maps')).length,1);
});
for(const point of ['before-v2-publication','after-v2-publication'])test('small unchanged pre-write v2 rollback recovery '+point,async t=>{
    const f=await setup(t);await activate(f);const old=fs.readFileSync(path.join(f.root,'production-v2-frozen.json')),request=approved(f,'rollback-before-writes',productionSelection(f.projectRoot).descriptorHash);
    await assert.rejects(admin.rollbackProductionBeforeWrites({...request,fault:p=>{if(p===point)throw Object.assign(Error('retained'),{code:'EIO'});}}),{code:'EIO'});
    assert.throws(()=>productionSelection(f.projectRoot),{code:'RECOVERY_REQUIRED'});await admin.rollbackProductionBeforeWrites(request);assert.equal(productionSelection(f.projectRoot),null);assert(fs.readFileSync(path.join(f.root,'manifest.json')).equals(old));
    const input=f.write('post-rollback',log({tick:2}));assert.equal((await importCacheFile(f.projectRoot,path.join(input.sourceRoot,input.sourceFile))).kind,'imported');
});
test('post-write old-manifest rollback, aliases, overlapping roots and stale snapshot all reject',async t=>{
    const f=await setup(t);await writable(f);await command(f,'claim',key(f));const before=hashFiles(f.root);
    await assert.rejects(admin.rollbackProductionBeforeWrites(approved(f,'rollback-before-writes',productionSelection(f.projectRoot).descriptorHash)),{code:'WRITE_FENCED'});assert.deepEqual(hashFiles(f.root),before);
    const alias=path.join(f.controls,'project-alias');fs.symlinkSync(f.projectRoot,alias);assert.throws(()=>productionSelection(alias));
    await assert.rejects(admin.prepareProductionRecovery({...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash),backupRoot:f.root,destination:f.projectRoot}),{code:'UNSAFE_PATH'});
    const request={projectRoot:f.projectRoot,command:'maps',get options(){throw Error('getter invoked');}};await assert.rejects(runProductionCommand(request),{code:'INVALID_ARGUMENT'});
});
test('production scan/watch use the approved cache and retain cancellation/error state',async t=>{
    const f=await setup(t);f.proofValue.importBudget={profile:'converted-corpus-v1',logs:320,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128};f.proofSha256=control(f.proof,f.proofValue);await writable(f);const beforeDuplicate=hashFiles(f.root);
    assert.equal((await command(f,'import',{sourceRoot:f.sourceRoot,sourceFile:'initial'})).kind,'deduplicated');assert.deepEqual(hashFiles(f.root),beforeDuplicate);
    const added=f.write('arrival',log({tick:2}));const scan=await command(f,'scan',{sourceRoot:added.sourceRoot,limits:{files:4,cycles:1}});assert.equal(scan.complete,true);assert.equal(scan.shutdownConfirmed,true);
    const controller=new AbortController();controller.abort();const watch=await command(f,'watch',{sourceRoot:added.sourceRoot,signal:controller.signal,limits:{files:4,cycles:1}});assert.equal(watch.stopReason,'cancelled');assert.equal(watch.shutdownConfirmed,true);
    f.write('extra',log({tick:3}));const before=hashFiles(f.root);await assert.rejects(command(f,'scan',{sourceRoot:f.controls}),{code:'UNSAFE_PATH'});await assert.rejects(command(f,'scan',{sourceRoot:added.sourceRoot,limits:{files:1}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(hashFiles(f.root),before);
});
test('production preparation rejects an invalid corpus budget before publication',async t=>{
    const f=await setup(t);f.proofValue.importBudget={profile:'converted-corpus-v1',logs:321,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128};f.proofSha256=control(f.proof,f.proofValue);
    const before=hashFiles(f.root);await assert.rejects(prepare(f),{code:'RESOURCE_LIMIT'});assert.deepEqual(hashFiles(f.root),before);assert.equal(productionSelection(f.projectRoot),null);
});
test('production preparation rejects an invalid cache capacity before publication',async t=>{
    const f=await setup(t);f.proofValue.cacheCapacity={...CAPACITY,wrappers:8193};f.proofSha256=control(f.proof,f.proofValue);const before=hashFiles(f.root);await assert.rejects(prepare(f),{code:'RESOURCE_LIMIT'});assert.deepEqual(hashFiles(f.root),before);
});
test('retained corrupt recovery files reject without touching source or destination',async t=>{
    const f=await setup(t);await writable(f);const backupRoot=directory('pain-gain-production-current-backup-fixture-',t),destination=directory('pain-gain-production-restored-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));
    const recovered=await admin.prepareProductionRecovery({...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination}),source=hashFiles(f.root),receipt=JSON.parse(fs.readFileSync(path.join(backupRoot,'receipt.json')));fs.appendFileSync(path.join(backupRoot,'data',receipt.artifacts.files[0].path),'corrupt');
    await assert.rejects(admin.restoreProductionRecovery({...approved(f,'restore',recovered.receiptHash,destination),backupRoot,receiptSha256:recovered.receiptHash}),{code:'INVALID_ARTIFACT'});assert.deepEqual(hashFiles(f.root),source);assert.deepEqual(fs.readdirSync(path.join(destination,'replay_logs')),[]);
});
test('production descriptor EIO preserves cleanup ENOSPC and releases locks',async t=>{
    const f=await setup(t);await activate(f);const target=path.join(f.root,'manifest.json'),open=fs.openSync,read=fs.readFileSync,close=fs.closeSync;let selectedFd;
    fs.openSync=(p,...args)=>{const fd=open(p,...args);if(p===target)selectedFd=fd;return fd;};
    fs.readFileSync=(p,...args)=>{if(p===selectedFd)throw Object.assign(Error('retained read'),{code:'EIO'});return read(p,...args);};
    fs.closeSync=fd=>{close(fd);if(fd===selectedFd){selectedFd=undefined;throw Object.assign(Error('retained close'),{code:'ENOSPC'});}};
    try{await assert.rejects(command(f,'maps'),e=>e.code==='EIO'&&e.cleanupFailures?.some(f=>f.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readFileSync=read;fs.closeSync=close;}
    assert(!fs.existsSync(path.join(f.root,'.manifest.lock')));assert(!fs.existsSync(path.join(f.root,'.authority.lock')));
});
test('independent retained release restores and selects without worktree/original reads',async t=>{
    const f=await setup(t);await writable(f);await command(f,'claim',key(f));const backupRoot=directory('pain-gain-production-independent-backup-fixture-',t),destination=directory('pain-gain-production-independent-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));
    const prepared=await admin.prepareProductionRecovery({...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination}),before=hashFiles(f.root);
    const hook=path.join(f.controls,'deny-independent-originals.mjs');fs.writeFileSync(hook,`import fs from 'node:fs';import {syncBuiltinESMExports,registerHooks} from 'node:module';const roots=${JSON.stringify([codeRoot,f.root,f.stageRoot])};function check(p){const s=String(p);if(roots.some(r=>s===r||s.startsWith(r+'/')||s.startsWith('file://'+r+'/')))throw Error('Original source blocked');}for(const k of ['openSync','readFileSync','statSync','lstatSync','realpathSync','opendirSync','readdirSync']){const old=fs[k];fs[k]=function(p,...a){check(p);return old.call(this,p,...a);};Object.assign(fs[k],old);}syncBuiltinESMExports();registerHooks({load(u,c,next){check(u);return next(u,c);}});`);
    for(const action of ['restore','select-restored']){
        const file=path.join(f.controls,'independent-'+action+'.json'),pin=control(file,{...approved(f,action,prepared.receiptHash,destination),...(action==='restore'?{backupRoot,receiptSha256:prepared.receiptHash}:{})});
        const args=['--import',hook,path.join(f.release.root,'tools/replay-store-migrate.js'),action,file,pin],result=spawnSync(path.join(f.release.root,'runtime/node'),args,{cwd:f.controls,encoding:'utf8',timeout:60000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});control(path.join(f.controls,action+'-result.json'),{args,status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr});assert.equal(result.status,0,result.stderr);
    }
    assert.equal((await command({...f,projectRoot:destination},'maps')).length,1);assert.deepEqual(hashFiles(f.root),before);
    for(const [pkg,local]of [['proof.json',PRODUCTION_PROOF],['qualification.json','production-qualification.json'],['inventory.json','production-source-inventory.json']])assert.equal(sha256(fs.readFileSync(path.join(backupRoot,pkg))),sha256(fs.readFileSync(path.join(destination,'replay_logs',local))));
});
test('shared production command matrix preserves cache validity and lifecycle separation',async t=>{
    const f=await setup(t);await writable(f);await command(f,'claim',key(f));await command(f,'examined',key(f));
    const selected={version:1,taskId:key(f).taskId,matches:[{replayId,logFingerprints:[key(f).fingerprint],opponent:'generated opponent',configuration:{label:'generated',basis:'independent synthetic fixture',expectedBuildId:'a'.repeat(64)}}]};
    assert.equal((await command(f,'index',{selection:selected,cache:false})).matches.length,1);
    assert.equal((await command(f,'screen',{replayId,taskId:key(f).taskId,expectedBuildId:'a'.repeat(64),fingerprints:[key(f).fingerprint],cache:false})).cache,'disabled');
    const first=await command(f,'index',{selection:selected,cache:true}),again=await command(f,'index',{selection:selected,cache:true});assert.equal(first.matches[0].cache,'miss');assert.equal(again.matches[0].cache,'hit');
    const dir=path.join(f.root,'analysis_cache'),file=path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith('historical-store-v3-v1-'))),cache=JSON.parse(fs.readFileSync(file));cache.generation='999999';control(file,cache);
    const damaged=hashFiles(f.root);await assert.rejects(command(f,'index',{selection:selected,cache:true}),{code:'INVALID_CACHE'});assert.deepEqual(hashFiles(f.root),damaged);
    let text='';const streamed=await runProductionCommand({projectRoot:f.projectRoot,command:'other',options:{replayId,fingerprint:key(f).fingerprint},sink:async b=>{text+=b.toString();}});assert(streamed.wrappers>0);assert(text.endsWith('\n'));
    assert.equal((await command(f,'migrate-status')).migrated,0);assert.equal((await command(f,'upgrade-map-checksums'))[0].status,'verified');
    const score=f.write('matrix-score',frames(),{collection:'score'}),scored=await command(f,'score-import',{sourceRoot:score.sourceRoot,sourceFile:score.sourceFile}),scoreKey={...key(f),fingerprint:scored.record.fingerprint};
    await command(f,'score-claim',scoreKey);await command(f,'score-examined',scoreKey);assert.equal((await command(f,'score-done',scoreKey)).recordStatus,'done');await command(f,'score-cleanup',{replayId,fingerprint:scoreKey.fingerprint});
    for(const action of ['complete','done']){const input=f.write('matrix-'+action,log({tick:action==='complete'?3:4})),added=await command(f,'import',{sourceRoot:input.sourceRoot,sourceFile:input.sourceFile}),q={...key(f),fingerprint:added.record.fingerprint};await command(f,'claim',q);await command(f,'examined',q);await command(f,action,q);await command(f,'reconcile',{replayId,fingerprint:q.fingerprint});}
    const before=hashFiles(f.root);await assert.rejects(command(f,'register-local',{replayId,sourceFile:'not-an-authorized-log.jsonl'}));assert.deepEqual(hashFiles(f.root),before);
    // A relevant replay-history change chooses a different key. The old corrupt
    // cache is retained, not silently normalized or reused for the new inputs.
    assert.equal((await command(f,'index',{selection:selected,cache:true})).matches[0].cache,'miss');
});
test('restored selection cannot bless self-consistent changed rows and rewritten local receipt',async t=>{
    const f=await setup(t);await writable(f);const backupRoot=directory('pain-gain-production-pinned-backup-fixture-',t),destination=directory('pain-gain-production-pinned-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));
    const prepared=await admin.prepareProductionRecovery({...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination});await admin.restoreProductionRecovery({...approved(f,'restore',prepared.receiptHash,destination),backupRoot,receiptSha256:prepared.receiptHash});
    const root=path.join(destination,'replay_logs'),file=path.join(root,'production-restore-receipt.json'),r=JSON.parse(fs.readFileSync(file)),database=path.join(root,r.descriptor.database),db=new DatabaseSync(database);
    try{db.prepare("UPDATE properties SET value=? WHERE owner_kind='root' AND owner_key='root' AND pointer='/unknown'").run(JSON.stringify({forged:[3,2]}));}finally{db.close();}
    r.facts=readDatabase(database,recoveryBudget(),d=>databaseFacts(d,recoverySchemaHash(),recoveryBudget()));control(file,r);const before=hashFiles(root),source=hashFiles(f.root);
    await assert.rejects(admin.selectRestoredProduction(approved(f,'select-restored',prepared.receiptHash,destination)),{code:'CHANGED_BINDING'});assert.deepEqual(hashFiles(root),before);assert.deepEqual(hashFiles(f.root),source);
});
test('prepared transition rejects changed resume budgets before publication',async t=>{
    const f=await setup(t);await prepare(f);const before=hashFiles(f.root);
    await assert.rejects(admin.cutoverProduction({...approved(f,'cutover',f.proofSha256),limits:{deadlineMs:1700000}}),{code:'CHANGED_BINDING'});assert.deepEqual(hashFiles(f.root),before);
});
test('local build stays an independently read reference and analysis retains v2 parity',async t=>{
    const f=await setup(t);for(const root of [f.projectRoot,f.v2]){fs.mkdirSync(path.join(root,'src/debug'),{recursive:true});fs.writeFileSync(path.join(root,'src/debug/build-id.js'),`// independently generated code reference\nexport const buildId = '${'f'.repeat(64)}';\n`);}
    const expected=analyzeReplay({root:f.v2,replayId,fingerprints:[key(f).fingerprint],reportMode:'compact'});await activate(f);const before=hashFiles(f.root);
    assert.deepEqual(await command(f,'analyze',{replayId,fingerprints:[key(f).fingerprint],reportMode:'compact'}),expected);assert.deepEqual(hashFiles(f.root),before);
    const build=path.join(f.projectRoot,'src/debug/build-id.js'),child=await import('node:child_process'),exec=child.default.execFileSync,open=fs.openSync;let attempts=0;
    child.default.execFileSync=(cmd,args,opt)=>args?.includes(build)?'dataless\n':exec(cmd,args,opt);fs.openSync=(p,...args)=>{if(p===build)attempts++;return open(p,...args);};syncBuiltinESMExports();
    try{await assert.rejects(command(f,'analyze',{replayId,fingerprints:[key(f).fingerprint],reportMode:'compact'}),e=>e.code==='dataless-input');assert.equal(attempts,0);}finally{child.default.execFileSync=exec;fs.openSync=open;syncBuiltinESMExports();}
});
test('unsupported runtime rejects before authority-lock or database-file creation',async t=>{
    const f=await setup(t);await activate(f);const before=hashFiles(f.root),node=process.versions.node;
    Object.defineProperty(process.versions,'node',{value:'26.11.1',configurable:true});
    try{await assert.rejects(command(f,'maps'),{code:'UNSUPPORTED_RUNTIME'});assert.deepEqual(hashFiles(f.root),before);}finally{Object.defineProperty(process.versions,'node',{value:node,configurable:true});}
});
test('missing or changed retained qualification controls block recovery without repair',async t=>{
    const f=await setup(t);await writable(f);const backupRoot=directory('pain-gain-production-control-backup-fixture-',t),destination=directory('pain-gain-production-control-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));
    const prepared=await admin.prepareProductionRecovery({...approved(f,'prepare-recovery',productionSelection(f.projectRoot).descriptorHash,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination}),restore={...approved(f,'restore',prepared.receiptHash,destination),backupRoot,receiptSha256:prepared.receiptHash};
    await admin.restoreProductionRecovery(restore);const q=path.join(destination,'replay_logs/production-qualification.json');fs.appendFileSync(q,' ');const before=hashFiles(path.join(destination,'replay_logs'));
    await assert.rejects(admin.selectRestoredProduction(approved(f,'select-restored',prepared.receiptHash,destination)),{code:'CHANGED_BINDING'});assert.deepEqual(hashFiles(path.join(destination,'replay_logs')),before);
    fs.renameSync(path.join(backupRoot,'qualification.json'),path.join(backupRoot,'qualification.retained'));await assert.rejects(admin.restoreProductionRecovery(restore));
});
test('recovery requires an empty backup and an approval bound to exact destinations',async t=>{
    const f=await setup(t);await writable(f);const backupRoot=directory('pain-gain-production-nonempty-backup-fixture-',t),destination=directory('pain-gain-production-fresh-project-fixture-',t);fs.mkdirSync(path.join(destination,'replay_logs'));fs.writeFileSync(path.join(backupRoot,'unrelated.retained'),'must not change');
    const before=hashFiles(f.root),backup=hashFiles(backupRoot),subject=productionSelection(f.projectRoot).descriptorHash;
    await assert.rejects(admin.prepareProductionRecovery({...approved(f,'prepare-recovery',subject,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot,destination}),{code:'DESTINATION_NOT_EMPTY'});assert.deepEqual(hashFiles(f.root),before);assert.deepEqual(hashFiles(backupRoot),backup);
    const other=directory('pain-gain-production-wrong-target-fixture-',t);await assert.rejects(admin.prepareProductionRecovery({...approved(f,'prepare-recovery',subject,f.projectRoot,{targets:{backupRoot,destination}}),backupRoot:other,destination}),{code:'APPROVAL_REQUIRED'});assert.deepEqual(fs.readdirSync(other),[]);
});

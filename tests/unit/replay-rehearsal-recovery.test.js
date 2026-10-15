import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {cacheFrame,log,frames,replayId} from '../fixtures/replay-import-command-fixture.js';
import {parseCacheEntry,parseScoreCacheEntry,logImportRecord,scoreImportRecord,sha256,mapChecksum} from '../../tools/replay-logs.js';
import {analyzeReplay} from '../../tools/replay-analysis.js';
const release=process.env.PAIN_GAIN_RECOVERY_RELEASE;assert.ok(release&&path.isAbsolute(release),'Explicit retained release required');
const pin=sha256(fs.readFileSync(path.join(release,'release.json'))),module=name=>import(pathToFileURL(path.join(release,'tools',name)));
const conversion=await module('replay-backup-rehearsal.js'),api=await module('replay-rehearsal-operations.js'),recovery=await module('replay-sqlite-recovery-fixture.js'),scopeApi=await module('replay-rehearsal-scope.js'),core=await module('replay-store.js');
const tmp=fs.realpathSync(os.tmpdir());
const dir=(t,prefix)=>{const p=fs.mkdtempSync(path.join(tmp,prefix));t.diagnostic(JSON.stringify({path:p,generated:true,retained:true}));return p;};
function hashes(root){const out={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else out[path.relative(root,q)]=sha256(fs.readFileSync(q));}}walk(root);return out;}
function fixture(t){const parent=dir(t,'pain-gain-backup-input-'),sourceRoot=path.join(parent,'backup'),data=path.join(sourceRoot,'data/replay_logs'),root=dir(t,'pain-gain-backup-rehearsal-');fs.mkdirSync(data,{recursive:true});
    const parsed=parseCacheEntry(cacheFrame(log())),score=parseScoreCacheEntry(cacheFrame(frames(),{collection:'score'})),map=parsed.map,id=mapChecksum(map),file='pain_and_gain_map_2026-10-14T00-00-00-000Z.json',registration={id,checksum:id,file,status:'validated'};
    fs.writeFileSync(path.join(data,file),JSON.stringify({...map,checksum:id}));
    const lr=logImportRecord(parsed,'synthetic-cache',replayId+'.jsonl',registration,'2026-10-14T00:00:00.000Z');lr.status='claim';lr.buildId=null;lr.unknown={nil:null,order:[2,1]};lr.reviews={'prior/owner':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}};
    const sr=scoreImportRecord(score,'synthetic-score',`replay-score-source-${replayId}-${score.fingerprint.slice(0,12)}.response`,id,'2026-10-14T00:00:00.000Z');sr.status='claim';
    fs.writeFileSync(path.join(data,lr.outputPath),parsed.gameState.join('\n')+'\n');fs.writeFileSync(path.join(data,sr.outputPath),score.body);
    const manifest={version:2,maps:[registration],replays:[{replayId,mapId:id,buildId:'a'.repeat(64),status:'active',retiredFingerprints:[sha256('explicit-history')]}],records:[lr],scoreRecords:[sr],retiredScoreSources:[],unknown:[null,false]};
    const authorization={sourceRoot,root,layout:'scoped-managed-v2-v1',inventory:path.join(sourceRoot,'inventory.json'),receipt:path.join(parent,'binding.json'),acknowledge:'backup-rehearsal-only'};
    function bind(){fs.writeFileSync(path.join(data,'manifest.json'),JSON.stringify(manifest));const files=fs.readdirSync(data).sort().map(name=>{const b=fs.readFileSync(path.join(data,name));return{relativePath:'replay_logs/'+name,bytes:b.length,sha256:sha256(b)};}),bytes=files.reduce((a,f)=>a+f.bytes,0);fs.writeFileSync(authorization.inventory,JSON.stringify({format:'scoped-managed-v2-backup-v1',sourceRoot:'/synthetic/historical-origin',totalBytes:bytes,files}));authorization.inventorySha256=sha256(fs.readFileSync(authorization.inventory));fs.writeFileSync(authorization.receipt,JSON.stringify({schema:'replay-backup-binding-v2',sourceRoot,inventorySha256:authorization.inventorySha256,files:files.length,bytes,complete:true,verified:true,origin:'synthetic-backup',layout:authorization.layout,dataRoot:data}));authorization.receiptSha256=sha256(fs.readFileSync(authorization.receipt));}
    bind();return{root,parent,data,manifest,lr,sr,authorization,bind,backupRoot:dir(t,'pain-gain-rehearsal-recovery-backup-'),destination:dir(t,'pain-gain-rehearsal-recovery-restored-')};
}
async function ready(t){const f=fixture(t);assert.equal((await conversion.rehearseBackupV2(f.authorization)).phase,'verified');f.lineageHash=(await api.selectRehearsalAuthority({authorization:f.authorization})).lineageHash;return f;}
const command=(f,command,options={})=>api.runRehearsalCommand({root:f.root,lineageHash:f.lineageHash,command,options});
const request=f=>({rehearsal:{lineageHash:f.lineageHash},root:f.root,backupRoot:f.backupRoot,destination:f.destination,releaseHash:pin});
const restoreRequest=f=>({rehearsal:{lineageHash:f.lineageHash},backupRoot:f.backupRoot,destination:f.destination,releaseHash:pin,receiptHash:f.receiptHash});
async function prepare(f){const p=await recovery.prepareSqliteRecovery(request(f));f.receiptHash=p.receiptHash;return p;}
const selection=f=>({replayId,fingerprint:f.lr.fingerprint,taskId:'rehearsal/new-review'});
function database(root,fn){const d=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),db=new DatabaseSync(path.join(root,d.database));try{return fn(db);}finally{db.close();}}

test('rehearsal conversion, reviews, analysis and independent restored authority preserve post-write state',async t=>{
    const f=await ready(t),original=hashes(f.parent),before=hashes(f.root);
    const q={replayId,fingerprints:[f.lr.fingerprint],scoreFingerprints:[f.sr.fingerprint],reportMode:'compact'};
    const report=await command(f,'analyze',q);assert.deepEqual(report,analyzeReplay({root:path.join(f.authorization.sourceRoot,'data'),...q}));assert.equal((await command(f,'maps')).length,1);assert.deepEqual(hashes(f.root),before);
    assert.equal((await command(f,'claim',selection(f))).changed,true);assert.equal((await command(f,'examined',selection(f))).changed,true);assert.equal((await command(f,'examined',selection(f))).changed,false);
    const score={...selection(f),fingerprint:f.sr.fingerprint};await command(f,'score-claim',score);await command(f,'score-examined',score);
    for(const only of [{replayId,fingerprints:[f.lr.fingerprint]},{replayId,scoreFingerprints:[f.sr.fingerprint]}])assert.deepEqual(await command(f,'analyze',only),analyzeReplay({root:path.join(f.authorization.sourceRoot,'data'),fingerprints:[],...only}));
    const pre=hashes(f.root),p=await prepare(f);assert.equal(p.facts.tables.find(x=>x.table==='reviews').count,3);
    const post=hashes(f.root);delete pre['.synthetic-authority.json'];delete post['.synthetic-authority.json'];assert.deepEqual(post,pre);
    await assert.rejects(command(f,'maps'),{code:'RECOVERY_REQUIRED'});await assert.rejects(core.openRehearsalStore(scopeApi.authorizeRehearsalLineage({root:f.root,lineageHash:f.lineageHash})),{code:'AUTHORITY_REQUIRED'});
    const controls=dir(t,'pain-gain-rehearsal-controls-'),req=path.join(controls,'request.json'),hook=path.join(controls,'deny.mjs');
    fs.writeFileSync(req,JSON.stringify({...restoreRequest(f),releaseHash:undefined}));
    fs.writeFileSync(hook,`import fs from 'node:fs';import {registerHooks} from 'node:module';const blocked=${JSON.stringify([f.root,f.parent,process.cwd()])};function check(p){if(p instanceof URL)p=p.pathname;if(typeof p==='string'&&blocked.some(r=>p===r||p.startsWith(r+'/')))throw Error('Forbidden original/worktree read: '+p);}for(const key of ['openSync','readFileSync','statSync','lstatSync','realpathSync','opendirSync','readdirSync']){const orig=fs[key],wrapped=function(p,...a){check(p);return orig.call(this,p,...a);};Object.assign(wrapped,orig);fs[key]=wrapped;}registerHooks({load(u,c,next){check(new URL(u));return next(u,c);}});`);
    const run=action=>{const argv=['--import',hook,path.join(release,'tools/replay-recovery-launch.cjs'),pin,action,req],r=spawnSync(path.join(release,'runtime/node'),argv,{cwd:controls,timeout:60000,encoding:'utf8',env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});fs.writeFileSync(path.join(controls,action+'-'+Date.now()+'.json'),JSON.stringify({argv,status:r.status,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
    assert.equal(run('restore').phase,'restored');await assert.rejects(api.runRehearsalCommand({root:f.destination,lineageHash:f.lineageHash,command:'maps'}));
    const restored=hashes(f.destination);run('restore');assert.deepEqual(hashes(f.destination),restored);run('select');
    const originalRoot=f.root;f.root=f.destination;assert.deepEqual(await command(f,'analyze',q),report);
    fs.writeFileSync(req,JSON.stringify({root:f.root,lineageHash:f.lineageHash,command:'claim',options:{...selection(f),taskId:'restored/new'}}));assert.equal(run('rehearsal-command').changed,true);
    assert.deepEqual(hashes(f.parent),original);const source=hashes(originalRoot);delete source['.synthetic-authority.json'];assert.deepEqual(source,pre);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).rehearsal.origin,'synthetic-backup');assert(!fs.existsSync(path.join(f.root,'.storage-v3-fixture')));
});
for(const phase of ['after-database-backup','before-source-fence','after-source-fence'])test('rehearsal prepare interruption '+phase,async t=>{const f=await ready(t);await command(f,'claim',selection(f));const error=Object.assign(Error('retained interruption'),{code:'EIO'});await assert.rejects(recovery.prepareSqliteRecovery({...request(f),fault:p=>{if(p===phase)throw error;}}),e=>e===error);await prepare(f);await recovery.restoreSqliteRecovery(restoreRequest(f));await recovery.selectRestoredSqliteAuthority(restoreRequest(f));assert.equal((await command({...f,root:f.destination},'maps')).length,1);});
for(const phase of ['after-restore-database','before-restore-receipt','before-restored-selection','after-restored-selection'])test('rehearsal destination interruption '+phase,async t=>{const f=await ready(t);await prepare(f);const fault=p=>{if(p===phase)throw Error('retained interruption');};if(phase.includes('selection')){await recovery.restoreSqliteRecovery(restoreRequest(f));await assert.rejects(recovery.selectRestoredSqliteAuthority({...restoreRequest(f),fault}));}else await assert.rejects(recovery.restoreSqliteRecovery({...restoreRequest(f),fault}));await recovery.restoreSqliteRecovery(restoreRequest(f));await recovery.selectRestoredSqliteAuthority(restoreRequest(f));});
for(const defect of ['lineage','descriptor','incomplete','capability','unsupported-command','source-control'])test('rehearsal rejects '+defect,async t=>{const f=await ready(t),expected=hashes(f.parent);
    if(defect==='lineage')fs.appendFileSync(path.join(f.root,'.rehearsal-lineage.json'),' ');
    if(defect==='descriptor'){const p=path.join(f.root,'manifest.json'),d=JSON.parse(fs.readFileSync(p));d.rehearsal.productionAuthority=true;fs.writeFileSync(p,JSON.stringify(d));}
    if(defect==='incomplete')fs.renameSync(path.join(f.root,'.synthetic-authority.json'),path.join(f.root,'retained-selector.json'));
    if(defect==='capability')database(f.root,db=>db.exec('DROP TABLE map_repairs'));
    if(defect==='source-control'){fs.appendFileSync(f.authorization.receipt,' ');await assert.rejects(api.selectRehearsalAuthority({authorization:f.authorization}));return;}
    const before=hashes(f.root);await assert.rejects(command(f,defect==='unsupported-command'?'done':'maps'));assert.deepEqual(hashes(f.root),before);assert.deepEqual(hashes(f.parent),expected);
});
test('unsafe or conflicting roots, options and snapshot pins cannot publish',async t=>{const f=await ready(t);for(const destination of [f.root,f.parent,f.authorization.sourceRoot,process.cwd()])await assert.rejects(recovery.prepareSqliteRecovery({...request(f),destination}));
    let calls=0;await assert.rejects(api.runRehearsalCommand({root:f.root,lineageHash:f.lineageHash,command:'maps',options:{get limits(){calls++;return {};}}}));assert.equal(calls,0);
    await prepare(f);await assert.rejects(recovery.restoreSqliteRecovery({...restoreRequest(f),receiptHash:'0'.repeat(64)}),{code:'SNAPSHOT_MISMATCH'});assert.deepEqual(fs.readdirSync(f.destination),[]);
});
test('rehearsal initialization interruption is fenced and recoverable',async t=>{const f=fixture(t);await conversion.rehearseBackupV2(f.authorization);await assert.rejects(api.selectRehearsalAuthority({authorization:f.authorization,fault:p=>{if(p==='before-authority')throw Error('retained');}}));await assert.rejects(core.openRehearsalStore(scopeApi.authorizeBackupRehearsal(f.authorization)),{code:'AUTHORITY_REQUIRED'});const result=await api.selectRehearsalAuthority({authorization:f.authorization});assert.equal(result.phase,'selected');});
test('incomplete conversion cannot select authority',async t=>{const f=fixture(t);await assert.rejects(conversion.rehearseBackupV2({...f.authorization,fault:p=>{if(p==='after-prepare')throw Error('retained');}}));await assert.rejects(api.selectRehearsalAuthority({authorization:f.authorization}),{code:'INVALID_CHECKPOINT'});assert(!fs.existsSync(path.join(f.root,'.synthetic-authority.json')));});
test('lineage controls, database and sidecars reject mocked dataless state before opening them',async t=>{
    const f=await ready(t),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=path.join(f.root,d.database),sidecar=db+'-journal';fs.writeFileSync(sidecar,'retained mock sidecar');
    for(const target of [path.join(f.root,'.rehearsal-lineage.json'),path.join(f.root,'.storage-v3-rehearsal'),path.join(f.root,'manifest.json'),db,sidecar]){
        const exec=childProcess.execFileSync,open=fs.openSync;let attempted=0;
        childProcess.execFileSync=(file,args,options)=>args?.includes(target)?'dataless\n':exec(file,args,options);syncBuiltinESMExports();
        fs.openSync=(p,...args)=>{if(p===target)attempted++;return open(p,...args);};
        try{await assert.rejects(command(f,'maps'),e=>e.code==='dataless-input');assert.equal(attempted,0);}finally{childProcess.execFileSync=exec;fs.openSync=open;syncBuiltinESMExports();}
    }
});
test('rehearsal concurrent reviews serialize, mutation snapshots stay stable, and invalid calls are neutral',async t=>{
    const f=await ready(t),q=selection(f),input={root:f.root,lineageHash:f.lineageHash,command:'claim',options:{...q}},pending=api.runRehearsalCommand(input);input.root='/forbidden';input.options.fingerprint='f'.repeat(64);await pending;
    const results=await Promise.all([command(f,'examined',q),command(f,'examined',q)]);assert.equal(results.filter(x=>x.changed).length,1);
    const before=hashes(f.root);await assert.rejects(command(f,'examined',{...q,taskId:'unclaimed'}),{code:'NOT_CLAIMED'});await assert.rejects(command(f,'analyze',{replayId,fingerprints:Array.from({length:65},(_,i)=>i.toString(16).padStart(64,'0'))}),{code:'RESOURCE_LIMIT'});assert.deepEqual(hashes(f.root),before);
    await assert.rejects(command(f,'analyze',{replayId,fingerprints:null,scoreFingerprints:[f.sr.fingerprint]}),{code:'INVALID_IDENTITY'});await assert.rejects(command(f,'analyze',{replayId,fingerprints:[f.lr.fingerprint],reportMode:null}),{code:'INVALID_ARGUMENT'});assert.deepEqual(hashes(f.root),before);
});
test('rehearsal changed post-snapshot state and corrupted package artifacts cannot be restored',async t=>{
    const f=await ready(t);await assert.rejects(recovery.prepareSqliteRecovery({...request(f),fault:p=>{if(p==='after-database-backup')throw Error('retained');}}));await command(f,'claim',selection(f));await assert.rejects(prepare(f),{code:'CHANGED_BINDING'});assert(!fs.existsSync(path.join(f.backupRoot,'handoff.json')));
    const g=await ready(t);await prepare(g);fs.appendFileSync(path.join(g.backupRoot,'data',g.lr.outputPath),'corrupt');const before=hashes(g.backupRoot);await assert.rejects(recovery.restoreSqliteRecovery(restoreRequest(g)),{code:'INVALID_ARTIFACT'});assert.deepEqual(hashes(g.backupRoot),before);assert.deepEqual(fs.readdirSync(g.destination),[]);
});
test('rehearsal lineage EIO retains separate ENOSPC cleanup failure',async t=>{
    const f=await ready(t),read=fs.readSync,close=fs.closeSync;fs.readSync=()=>{throw Object.assign(Error('read'),{code:'EIO'});};fs.closeSync=fd=>{close(fd);throw Object.assign(Error('close'),{code:'ENOSPC'});};
    try{await assert.rejects(command(f,'maps'),e=>e.code==='EIO'&&e.cleanupFailures?.some(x=>x.systemCode==='ENOSPC'));}finally{fs.readSync=read;fs.closeSync=close;}
});
test('retained conversion entrypoint and selected consumer launch without worktree module access',async t=>{
    const f=fixture(t),controls=dir(t,'pain-gain-rehearsal-controls-'),file=path.join(controls,'request.json'),hook=path.join(controls,'deny.mjs');
    fs.writeFileSync(hook,`import {registerHooks} from 'node:module';const root=${JSON.stringify(process.cwd())};registerHooks({load(u,c,n){if(u.startsWith('file://'+root+'/'))throw Error('worktree module');return n(u,c);}});`);
    const run=(action,value)=>{fs.writeFileSync(file,JSON.stringify(value));const args=['--import',hook,path.join(release,'tools/replay-recovery-launch.cjs'),pin,action,file],r=spawnSync(path.join(release,'runtime/node'),args,{cwd:controls,encoding:'utf8',timeout:60000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});fs.writeFileSync(path.join(controls,action+'.json'),JSON.stringify({args,status:r.status,stdout:r.stdout,stderr:r.stderr}));assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
    const before=hashes(f.parent);assert.equal(run('rehearsal-convert',f.authorization).phase,'verified');const selected=run('rehearsal-select',{authorization:f.authorization});assert.equal(run('rehearsal-command',{root:f.root,lineageHash:selected.lineageHash,command:'maps'}).length,1);assert.deepEqual(hashes(f.parent),before);
});
test('independent rehearsal files are required, with only writer-lock links exempt',async t=>{
    const f=await ready(t),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=path.join(f.root,d.database),target=path.join(dir(t,'pain-gain-rehearsal-controls-'),'linked-database');fs.linkSync(db,target);const before=hashes(f.root);await assert.rejects(command(f,'claim',selection(f)),{code:'UNSAFE_PATH'});assert.deepEqual(hashes(f.root),before);
});
test('altered restored marker or lineage cannot select authority',async t=>{
    const f=await ready(t);await prepare(f);await recovery.restoreSqliteRecovery(restoreRequest(f));const file=path.join(f.destination,'.storage-v3-rehearsal'),m=JSON.parse(fs.readFileSync(file));m.rehearsal.origin='verified-backup';fs.writeFileSync(file,JSON.stringify(m));const before=hashes(f.destination);await assert.rejects(recovery.selectRestoredSqliteAuthority(restoreRequest(f)),{code:'CHANGED_BINDING'});assert.deepEqual(hashes(f.destination),before);assert(!fs.existsSync(path.join(f.destination,'.synthetic-authority.json')));
});
test('changed conversion commitment rejects consumers and backup without repair',async t=>{
    const f=await ready(t);database(f.root,db=>{const cp=JSON.parse(db.prepare("SELECT value FROM properties WHERE owner_kind='root' AND pointer='/boundedFixtureConversionV1'").get().value);cp.identity.sourceHash='f'.repeat(64);db.prepare("UPDATE properties SET value=? WHERE owner_kind='root' AND pointer='/boundedFixtureConversionV1'").run(JSON.stringify(cp));});
    const before=hashes(f.root);await assert.rejects(command(f,'claim',selection(f)),{code:'INVALID_CHECKPOINT'});await assert.rejects(prepare(f),{code:'INVALID_CHECKPOINT'});assert.deepEqual(hashes(f.root),before);assert(!fs.existsSync(path.join(f.backupRoot,'handoff.json')));
});

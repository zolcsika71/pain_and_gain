import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {rehearseBackupV2} from '../../tools/replay-backup-rehearsal.js';
import {authorizeBackupRehearsal,rehearsalDetails,checkRehearsal,rehearsalDestination} from '../../tools/replay-rehearsal-scope.js';
import {openStore,openRehearsalStore,createFixtureStore,createRehearsalStore} from '../../tools/replay-store.js';
import {readFixtureV2DiagnosticMembers,readRehearsalV2DiagnosticMembers,legacyBackupDiagnosticLimits} from '../../tools/replay-legacy-reader.js';
import {convertFixtureV2Streaming,convertRehearsalV2,backupStreamingLimits} from '../../tools/replay-conversion-bounded-fixture.js';
import {iterateDiagnostics} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),tmp=fs.realpathSync(os.tmpdir());
function files(root){const out={};for(const e of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isDirectory())for(const [k,v]of Object.entries(files(p)))out[e.name+'/'+k]=v;else out[e.name]=sha(fs.readFileSync(p));}return out;}
function fixture(t,nested=false){
 const parent=fs.mkdtempSync(path.join(tmp,'pain-gain-backup-input-')),sourceRoot=path.join(parent,'backup'),root=fs.mkdtempSync(path.join(tmp,'pain-gain-backup-rehearsal-'));fs.mkdirSync(sourceRoot);
 const dataRoot=nested?path.join(sourceRoot,'data','replay_logs'):sourceRoot;if(nested)fs.mkdirSync(dataRoot,{recursive:true});
 t.diagnostic(JSON.stringify({syntheticBackup:true,parent,root,retained:true}));
 const map={arena:{name:'Pain and Gain',season:'rehearsal-synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]},mapId=mapChecksum(map),replayId='1'.repeat(24);
 fs.writeFileSync(path.join(dataRoot,'map.json'),JSON.stringify({...map,checksum:mapId}));
 const m={version:2,unknown:{nil:null,flag:false},maps:[{id:mapId,file:'map.json',checksum:mapId,status:'validated',unknown:null}],replays:[{replayId,mapId,status:'active',retiredFingerprints:[sha('retired')],unknown:false}],records:[],scoreRecords:[],retiredScoreSources:[]};
 for(let i=0;i<3;i++){const outputPath='original-'+i,body=Buffer.from([0,255,i,10]);fs.writeFileSync(path.join(dataRoot,outputPath),body);const record={replayId,mapId,fingerprint:sha('record-'+i),status:'claim',outputPath,outputFingerprint:sha(body),reviews:{'synthetic/rehearsal':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}},unknown:[false,null,i],...(i===1?{buildId:'c'.repeat(64)}:{})};
 if(i<2){record.otherEntries=[{key:'same',raw:' {"synthetic":true} ',unknown:[false,null,i]},{key:'same',raw:'duplicate'}];m.records.push(record);}else{record.kind='replay-frames';record.embeddedBuildId=null;m.scoreRecords.push(record);}}
 const manifest=path.join(dataRoot,'manifest.json'),inventory=path.join(nested?sourceRoot:parent,'inventory.json'),receipt=path.join(parent,'binding.json');
 const o={sourceRoot,root,inventory,receipt,acknowledge:'backup-rehearsal-only',...(nested?{layout:'scoped-managed-v2-v1'}:{})};
 function bind(){fs.writeFileSync(manifest,JSON.stringify(m));const rows=fs.readdirSync(dataRoot).sort().map(name=>{const b=fs.readFileSync(path.join(dataRoot,name));return nested?{relativePath:'replay_logs/'+name,bytes:b.length,sha256:sha(b),sourceMetadata:{state:'resident'},references:['synthetic'],purpose:'synthetic original'}:{path:name,bytes:b.length,sha256:sha(b)};});
  const total=rows.reduce((n,r)=>n+r.bytes,0),ib=Buffer.from(JSON.stringify(nested?{format:'scoped-managed-v2-backup-v1',sourceRoot:path.join(parent,'synthetic-historical-source'),totalBytes:total,files:rows}:{schema:'replay-backup-inventory-v1',files:rows}));fs.writeFileSync(inventory,ib);o.inventorySha256=sha(ib);
  const rb=Buffer.from(JSON.stringify({schema:nested?'replay-backup-binding-v2':'replay-backup-binding-v1',sourceRoot,inventorySha256:o.inventorySha256,files:rows.length,bytes:total,complete:true,verified:true,origin:'synthetic-backup',...(nested?{layout:o.layout,dataRoot}:{})}));fs.writeFileSync(receipt,rb);o.receiptSha256=sha(rb);}
 bind();return{parent,sourceRoot,dataRoot,root,manifest,m,o,bind};
}
async function verify(f){const scope=authorizeBackupRehearsal(f.o),s=await openRehearsalStore(scope);try{
 assert.deepEqual(s.entityCounts(),{collections:5,maps:1,replays:1,records:3,reviews:3,retired:1});
 for(const [collection,rows]of [['log',f.m.records],['score',f.m.scoreRecords]])for(const [ordinal,r]of rows.entries()){
 const key={collection,replayId:r.replayId,fingerprint:r.fingerprint},got=s.getRecord(key);assert.equal(got.ordinal,ordinal);assert.equal(got.build_id,r.buildId??null);assert.equal(got.output_hash,r.outputFingerprint);assert.deepEqual(s.getReview(key,'synthetic/rehearsal').value,r.reviews['synthetic/rehearsal']);assert.equal(sha(fs.readFileSync(path.join(f.root,r.outputPath))),r.outputFingerprint);
 if(collection==='log')await s.withReadSnapshot({recordKeys:[key]},async view=>{let i=0;for await(const d of iterateDiagnostics(view,key)){assert.equal(d.ordinal,i);assert.deepEqual(d.value,r.otherEntries[i++]);}assert.equal(i,r.otherEntries.length);});
 }
 assert.equal(s.getRecord({collection:'log',replayId:f.m.replays[0].replayId,fingerprint:sha('retired')}).kind,'retired');
}finally{s.close();}}
test('rehearsal converts, reads and resumes without source or destination changes',async t=>{
 const f=fixture(t),source=files(f.parent),first=await rehearseBackupV2(f.o);assert.equal(first.phase,'verified');assert.equal(first.backupRehearsal,true);assert.equal(first.fixtureOnly,undefined);assert.equal(first.productionAuthority,false);await verify(f);
 const marker=JSON.parse(fs.readFileSync(path.join(f.root,'.storage-v3-rehearsal'))),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json')));assert.deepEqual(d.rehearsal,marker.rehearsal);assert.equal(d.rehearsal.inventorySha256,f.o.inventorySha256);assert(!fs.existsSync(path.join(f.root,'.storage-v3-fixture')));
 const dest=files(f.root);const again=await rehearseBackupV2(f.o);assert.deepEqual(again,first);assert.deepEqual(files(f.root),dest);assert.deepEqual(files(f.parent),source);
});
for(const nested of [false,true])for(const point of ['after-reserve','after-record-checkpoint'])test(`legacy null log rehearsal ${nested?'nested':'flat'} ${point}`,async t=>{
 const f=fixture(t,nested);f.m.records[0].buildId=null;f.m.replays[0].buildId='c'.repeat(64);f.bind();
 const source=files(f.parent),primary=Object.assign(Error('synthetic legacy null interruption'),{code:'EIO'});let hit=false;
 await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(p===point&&!hit){hit=true;throw primary;}}}),e=>e===primary);assert(hit);
 const s=await openRehearsalStore(authorizeBackupRehearsal(f.o));try{
  const r=f.m.records[0],key={collection:'log',replayId:r.replayId,fingerprint:r.fingerprint};assert.equal(s.getRecord(key).build_id,null);
  const p=s.pageProperties({kind:'record',key:JSON.stringify(['log',r.replayId,r.fingerprint])}).rows.find(p=>p.pointer==='/buildId');assert(p);assert.equal(JSON.parse(p.value),null);
 }finally{s.close();}
 const first=await rehearseBackupV2(f.o);await verify(f);const before=files(f.root);assert.deepEqual(await rehearseBackupV2(f.o),first);await verify(f);assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.parent),source);
});
for(const kind of ['inventory-hash','receipt-hash','missing','extra','changed','incomplete','duplicate','traversal'])test('rehearsal rejects source '+kind+' before destination writes',async t=>{
 const f=fixture(t);
 if(kind==='inventory-hash')f.o.inventorySha256='0'.repeat(64);else if(kind==='receipt-hash')f.o.receiptSha256='0'.repeat(64);
 else if(kind==='missing')fs.renameSync(path.join(f.sourceRoot,'original-0'),path.join(f.parent,'retained-original'));
 else if(kind==='extra')fs.writeFileSync(path.join(f.sourceRoot,'extra'),'unlisted');else if(kind==='changed')fs.appendFileSync(path.join(f.sourceRoot,'original-0'),'changed');
 else if(kind==='incomplete'){const r=JSON.parse(fs.readFileSync(f.o.receipt));r.complete=false;fs.writeFileSync(f.o.receipt,JSON.stringify(r));f.o.receiptSha256=sha(fs.readFileSync(f.o.receipt));}
 else{const i=JSON.parse(fs.readFileSync(f.o.inventory));if(kind==='duplicate')i.files.push(i.files[0]);else i.files[0].path='../escape';fs.writeFileSync(f.o.inventory,JSON.stringify(i));f.o.inventorySha256=sha(fs.readFileSync(f.o.inventory));const r=JSON.parse(fs.readFileSync(f.o.receipt));r.inventorySha256=f.o.inventorySha256;fs.writeFileSync(f.o.receipt,JSON.stringify(r));f.o.receiptSha256=sha(fs.readFileSync(f.o.receipt));}
 await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(fs.readdirSync(f.root),[]);
});
for(const kind of ['production','trial','overlap','alias','hardlink'])test('rehearsal unsafe '+kind,async t=>{
 const f=fixture(t);if(kind==='production')f.o.sourceRoot=path.join(process.cwd(),'replay_logs');else if(kind==='trial')f.o.root=path.join(tmp,'trial-root');else if(kind==='overlap')f.o.root=f.sourceRoot;
 else if(kind==='alias'){const q=path.join(f.parent,'alias');fs.symlinkSync(f.sourceRoot,q);f.o.sourceRoot=q;}
 else fs.linkSync(path.join(f.sourceRoot,'original-0'),path.join(f.parent,'hardlinked-original'));
 await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(fs.readdirSync(f.root),[]);
});
for(const point of ['after-prepare','after-reserve','after-payload','after-record-checkpoint'])test('rehearsal interruption '+point,async t=>{
 const f=fixture(t),error=Object.assign(Error('retained interruption'),{code:'EIO'});let hit=false;
 await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(!hit&&p===point){hit=true;throw error;}}}),e=>e===error);assert(hit);
 const result=await rehearseBackupV2(f.o);assert.equal(result.phase,'verified');await verify(f);const before=files(f.root);await rehearseBackupV2(f.o);assert.deepEqual(files(f.root),before);
});
for(const point of ['after-reserve','before-verified'])test('rehearsal detects source mutation '+point,async t=>{
 const f=fixture(t);let hit=false;await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(!hit&&p===point){hit=true;fs.appendFileSync(path.join(f.sourceRoot,'original-1'),'corrupt');}}}));assert(hit);const before=files(f.root);await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(files(f.root),before);
});
test('rehearsal source rebind and destination tampering reject without repair',async t=>{
 const f=fixture(t);await rehearseBackupV2(f.o);const before=files(f.root);f.m.unknown.flag=true;f.bind();await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(files(f.root),before);
});
test('rehearsal incomplete initialization remains explicit',async t=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,'.storage-v3-rehearsal'),'{}');const before=files(f.root);await assert.rejects(rehearseBackupV2(f.o),{code:'INCOMPLETE_REHEARSAL'});assert.deepEqual(files(f.root),before);});
test('rehearsal cannot bypass fixture entrypoints or forge capability',async t=>{
 const f=fixture(t);await assert.rejects(createFixtureStore({root:f.root,filesystem:'local-apfs'}));await rehearseBackupV2(f.o);
 await assert.rejects(openStore({root:f.root,mode:'read'}));await assert.rejects(convertFixtureV2Streaming({synthetic:true,sourceRoot:f.sourceRoot,root:f.root,capacity:'backup-sized-synthetic-v1'}));await assert.rejects(readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot},()=>{}));assert.throws(()=>checkRehearsal({}),{code:'INVALID_REHEARSAL_SCOPE'});
});
test('rehearsal snapshots caller options and rejects accessors',async t=>{
 const f=fixture(t);let calls=0;await assert.rejects(rehearseBackupV2({...f.o,get root(){calls++;return f.root;}}));assert.equal(calls,0);
 const o={...f.o,fault:()=>{o.root='/forbidden';o.inventorySha256='f'.repeat(64);}};await rehearseBackupV2(o);await verify(f);
 const scope=authorizeBackupRehearsal(f.o);assert(Object.isFrozen(rehearsalDetails(scope).binding));assert.equal(checkRehearsal(scope),undefined);
});
test('rehearsal concurrent initialized resumes use the same locked job',async t=>{
 const f=fixture(t);let hit=false;await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(p==='after-reserve'&&!hit){hit=true;throw Error('retained');}}}));
 const [a,b]=await Promise.all([rehearseBackupV2(f.o),rehearseBackupV2(f.o)]);assert.equal(a.storeId,b.storeId);assert.equal(a.generation,b.generation);await verify(f);
});
test('rehearsal corrupted destination binding rejects unchanged',async t=>{
 const f=fixture(t);await rehearseBackupV2(f.o);const p=path.join(f.root,'manifest.json'),d=JSON.parse(fs.readFileSync(p));d.rehearsal.productionAuthority=true;fs.writeFileSync(p,JSON.stringify(d));const before=files(f.root);await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(files(f.root),before);
});
test('rehearsal snapshot receipt cannot be changed during publication',async t=>{
 const f=fixture(t);let hit=false;await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(p==='after-reserve'&&!hit){hit=true;fs.appendFileSync(f.o.inventory,' ');}}}));assert(hit);const before=files(f.root);await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(files(f.root),before);
});
test('rehearsal retains operation and descriptor cleanup failures',async t=>{
 const f=fixture(t),open=fs.openSync,read=fs.readSync,close=fs.closeSync;let selected;
 const primary=Object.assign(Error('synthetic read failure'),{code:'EIO'}),cleanup=Object.assign(Error('synthetic close failure'),{code:'ENOSPC'});
 fs.openSync=(p,...a)=>{const fd=open(p,...a);if(p===f.manifest)selected=fd;return fd;};
 fs.readSync=(fd,...a)=>{if(fd===selected)throw primary;return read(fd,...a);};
 fs.closeSync=fd=>{close(fd);if(fd===selected){selected=undefined;throw cleanup;}};
 try{await assert.rejects(rehearseBackupV2(f.o),e=>e===primary&&e.cleanupFailures.some(c=>c.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readSync=read;fs.closeSync=close;}
 assert.deepEqual(fs.readdirSync(f.root),[]);
});
test('rehearsal explicit CLI converts synthetic input and rejects unknown flags',async t=>{
 const f=fixture(t),args=['tools/replay-backup-rehearsal.js','--source',f.o.sourceRoot,'--destination',f.o.root,'--inventory',f.o.inventory,'--inventory-sha256',f.o.inventorySha256,'--receipt',f.o.receipt,'--receipt-sha256',f.o.receiptSha256,'--ack-backup-rehearsal-only'];
 const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).backupRehearsal,true);await verify(f);
 const before=files(f.root),bad=spawnSync(process.execPath,[...args,'--activate'],{encoding:'utf8',timeout:15000});assert.equal(bad.status,1);assert.deepEqual(files(f.root),before);
});
test('rehearsal canonical-prefix symlink destination rejects',async t=>{
 const f=fixture(t),alias=path.join(tmp,'pain-gain-backup-rehearsal-alias-'+path.basename(f.parent));fs.symlinkSync(f.root,alias);await assert.rejects(rehearseBackupV2({...f.o,root:alias}));assert.deepEqual(fs.readdirSync(f.root),[]);
});

// Metadata mocks only: never create or open an actual dataless placeholder.
const sqlite=createRequire(import.meta.url)('node:sqlite');
for(const entry of ['wrapper','direct'])for(const part of ['marker','descriptor','database','-journal','-wal','-shm'])
test('rehearsal residency rejects '+entry+' '+part+' before opens',async t=>{
 const f=fixture(t),scope=authorizeBackupRehearsal(f.o),created=await createRehearsalStore(scope);created.close();
 const d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json')));
 const relative=part==='marker'?'.storage-v3-rehearsal':part==='descriptor'?'manifest.json':d.database+(part==='database'?'':part);
 const target=path.join(f.root,relative);if(part.startsWith('-'))fs.writeFileSync(target,'');
 const before=files(f.root),source=files(f.parent),stat=childProcess.execFileSync,open=fs.openSync,Database=sqlite.DatabaseSync;
 let checks=0,contentOpens=0,databaseOpens=0;
 childProcess.execFileSync=(cmd,args,...rest)=>{if(cmd==='/usr/bin/stat'&&args?.at(-1)===target){checks++;return 'dataless\n';}return stat(cmd,args,...rest);};
 fs.openSync=(p,...rest)=>{if(typeof p==='string'&&p.startsWith(f.root+'/')&&!fs.lstatSync(p).isDirectory()){contentOpens++;throw Error('premature destination content open');}return open(p,...rest);};
 sqlite.DatabaseSync=new Proxy(Database,{construct(ctor,args){if(args[0]!==':memory:'){databaseOpens++;throw Error('premature database open');}return Reflect.construct(ctor,args);}});syncBuiltinESMExports();
 try{await assert.rejects(entry==='wrapper'?rehearseBackupV2(f.o):openRehearsalStore(scope),{code:'dataless-input'});assert(checks>0);assert.equal(contentOpens,0);assert.equal(databaseOpens,0);}
 finally{childProcess.execFileSync=stat;fs.openSync=open;sqlite.DatabaseSync=Database;syncBuiltinESMExports();}
 assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.parent),source);
});

for(const part of ['marker','descriptor','database','-journal','-wal','-shm'])
test('rehearsal residency rechecks an existing handle '+part,async t=>{
 const f=fixture(t),scope=authorizeBackupRehearsal(f.o),s=await createRehearsalStore(scope);
 const d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),relative=part==='marker'?'.storage-v3-rehearsal':part==='descriptor'?'manifest.json':d.database+(part==='database'?'':part),target=path.join(f.root,relative);
 if(part.startsWith('-'))fs.writeFileSync(target,'');
 const stat=childProcess.execFileSync,open=fs.openSync,Database=sqlite.DatabaseSync;let checked=0,opened=0,dbOpened=0;
 childProcess.execFileSync=(cmd,args,...rest)=>{if(cmd==='/usr/bin/stat'&&args?.at(-1)===target){checked++;return 'dataless\n';}return stat(cmd,args,...rest);};
 fs.openSync=(p,...rest)=>{if(p===target){opened++;throw Error('premature target open');}return open(p,...rest);};
 sqlite.DatabaseSync=new Proxy(Database,{construct(ctor,args){if(args[0]!==':memory:'){dbOpened++;throw Error('premature database open');}return Reflect.construct(ctor,args);}});syncBuiltinESMExports();
 try{assert.throws(()=>s.entityCounts(),{code:'dataless-input'});assert(checked>0);assert.equal(opened,0);assert.equal(dbOpened,0);}
 finally{childProcess.execFileSync=stat;fs.openSync=open;sqlite.DatabaseSync=Database;syncBuiltinESMExports();s.close();}
});

for(const kind of ['operation','cleanup','combined'])test('rehearsal residency preserves '+kind+' failure',async t=>{
 const f=fixture(t),scope=authorizeBackupRehearsal(f.o),s=await createRehearsalStore(scope);s.close();const before=files(f.root);
 const stat=childProcess.execFileSync,opendir=fs.opendirSync;const primary=Object.assign(Error('synthetic metadata failure'),{code:'EIO'}),cleanup=Object.assign(Error('synthetic directory close failure'),{code:'ENOSPC'});let hit=false;
 childProcess.execFileSync=(cmd,args,...rest)=>{if(kind!=='cleanup'&&cmd==='/usr/bin/stat'&&args?.at(-1)===path.join(f.root,'.storage-v3-rehearsal')){hit=true;throw primary;}return stat(cmd,args,...rest);};
 fs.opendirSync=(p,...rest)=>{const dir=opendir(p,...rest);if(p===f.root&&kind!=='operation'){const close=dir.closeSync.bind(dir);dir.closeSync=()=>{close();hit=true;throw cleanup;};}return dir;};syncBuiltinESMExports();
 try{await assert.rejects(openRehearsalStore(scope),e=>{assert.equal(e,kind==='cleanup'?cleanup:primary);if(kind==='combined')assert(e.cleanupFailures.some(x=>x.systemCode==='ENOSPC'));return true;});assert(hit);}
 finally{childProcess.execFileSync=stat;fs.opendirSync=opendir;syncBuiltinESMExports();}assert.deepEqual(files(f.root),before);
});

test('rehearsal residency rejects missing required descriptor before marker open',async t=>{
 const f=fixture(t),scope=authorizeBackupRehearsal(f.o),s=await createRehearsalStore(scope);s.close();
 fs.renameSync(path.join(f.root,'manifest.json'),path.join(f.parent,'retained-destination-descriptor.json'));
 const open=fs.openSync;let opened=0;fs.openSync=(p,...rest)=>{if(p===path.join(f.root,'.storage-v3-rehearsal')){opened++;throw Error('premature marker open');}return open(p,...rest);};
 try{await assert.rejects(openRehearsalStore(scope),{code:'ENOENT'});assert.equal(opened,0);}finally{fs.openSync=open;}
});

test('rehearsal nested converts and resumes original inventory unchanged',async t=>{
 const f=fixture(t,true),before=files(f.parent),first=await rehearseBackupV2(f.o);assert.equal(first.phase,'verified');await verify(f);
 const d=rehearsalDetails(authorizeBackupRehearsal(f.o));assert.equal(d.sourceRoot,f.sourceRoot);assert.equal(d.dataRoot,f.dataRoot);assert.equal(d.binding.layout,'scoped-managed-v2-v1');assert.equal(d.binding.dataRoot,f.dataRoot);assert.equal(d.binding.productionAuthority,false);
 const destination=files(f.root);assert.deepEqual(await rehearseBackupV2(f.o),first);assert.deepEqual(files(f.root),destination);assert.deepEqual(files(f.parent),before);
});

function rebindNested(f,editInventory,editReceipt){
 const i=JSON.parse(fs.readFileSync(f.o.inventory)),r=JSON.parse(fs.readFileSync(f.o.receipt));editInventory?.(i);
 fs.writeFileSync(f.o.inventory,JSON.stringify(i));f.o.inventorySha256=sha(fs.readFileSync(f.o.inventory));r.inventorySha256=f.o.inventorySha256;editReceipt?.(r);
 fs.writeFileSync(f.o.receipt,JSON.stringify(r));f.o.receiptSha256=sha(fs.readFileSync(f.o.receipt));
}
for(const kind of ['traversal','absolute','backslash','wrong-prefix','duplicate','alias-path','extra-data','wrong-total','wrong-data-root','wrong-receipt-layout','wrong-origin','incomplete'])
test('rehearsal nested rejects '+kind+' before payload opens',async t=>{
 const f=fixture(t,true);
 const badPaths={traversal:'replay_logs/../manifest.json',absolute:f.manifest,backslash:'replay_logs\\manifest.json','wrong-prefix':'data/replay_logs/manifest.json','alias-path':'replay_logs/./manifest.json'};
 rebindNested(f,i=>{if(Object.hasOwn(badPaths,kind))i.files[0].relativePath=badPaths[kind];if(kind==='duplicate')i.files.push({...i.files[0]});if(kind==='wrong-total')i.totalBytes++;},r=>{if(kind==='wrong-data-root')r.dataRoot=f.sourceRoot;if(kind==='wrong-receipt-layout')r.layout='flat-v1';if(kind==='wrong-origin')r.origin='verified-backup';if(kind==='incomplete')r.verified=false;});
 if(kind==='extra-data')fs.writeFileSync(path.join(f.dataRoot,'unlisted'),'retained');
 const open=fs.openSync;let opens=0;fs.openSync=(p,...args)=>{if(typeof p==='string'&&p.startsWith(f.dataRoot+'/')){opens++;throw Error('premature data open');}return open(p,...args);};
 try{await assert.rejects(rehearseBackupV2(f.o));assert.equal(opens,0);}finally{fs.openSync=open;}
 assert.deepEqual(fs.readdirSync(f.root),[]);
});
for(const kind of ['data-alias','control-alias','package-overlap','nested-selection','unknown-layout','null-layout','override-data-root'])
test('rehearsal nested rejects unsafe '+kind+' before content',async t=>{
 const f=fixture(t,true);
 if(kind==='data-alias'){const retained=path.join(f.parent,'retained-data');fs.renameSync(f.dataRoot,retained);fs.symlinkSync(retained,f.dataRoot);}
 if(kind==='control-alias')fs.symlinkSync(f.o.receipt,path.join(f.sourceRoot,'RESTORE.md'));
 if(kind==='package-overlap'){f.o.root=path.join(f.sourceRoot,'replay-backup-rehearsal-retained');fs.mkdirSync(f.o.root);}
 if(kind==='nested-selection')f.o.sourceRoot=f.dataRoot;
 if(kind==='unknown-layout')f.o.layout='arbitrary/nested';if(kind==='null-layout')f.o.layout=null;if(kind==='override-data-root')f.o.dataRoot=f.parent;
 const open=fs.openSync;let opens=0;fs.openSync=(p,...args)=>{if(typeof p==='string'&&p.startsWith(f.parent+'/')){opens++;throw Error('premature content open');}return open(p,...args);};
 try{await assert.rejects(rehearseBackupV2(f.o));assert.equal(opens,0);}finally{fs.openSync=open;}
 assert.deepEqual(fs.readdirSync(f.root),[]);
});
test('rehearsal nested snapshots layout and rejects accessors',async t=>{
 const f=fixture(t,true);let calls=0;await assert.rejects(rehearseBackupV2({...f.o,get layout(){calls++;return 'scoped-managed-v2-v1';}}));assert.equal(calls,0);
 const o={...f.o,fault:()=>{o.layout='flat-v1';o.sourceRoot='/forbidden';}};assert.equal((await rehearseBackupV2(o)).phase,'verified');await verify(f);
});
test('rehearsal nested interrupted resume keeps inventory and bindings',async t=>{
 const f=fixture(t,true),before=files(f.parent);let hit=false;
 await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(p==='after-reserve'&&!hit){hit=true;throw Error('retained interruption');}}}));assert(hit);
 assert.equal((await rehearseBackupV2(f.o)).phase,'verified');await verify(f);assert.deepEqual(files(f.parent),before);
 const d=path.join(f.root,'manifest.json'),v=JSON.parse(fs.readFileSync(d));v.rehearsal.dataRoot=f.sourceRoot;fs.writeFileSync(d,JSON.stringify(v));const dest=files(f.root);await assert.rejects(rehearseBackupV2(f.o));assert.deepEqual(files(f.root),dest);
});
test('rehearsal nested changed inventory cannot complete',async t=>{
 const f=fixture(t,true);let hit=false;await assert.rejects(rehearseBackupV2({...f.o,fault:p=>{if(p==='before-verified'&&!hit){hit=true;fs.appendFileSync(f.o.inventory,' ');}}}));assert(hit);await assert.rejects(rehearseBackupV2(f.o));
});
test('rehearsal nested explicit CLI',async t=>{
 const f=fixture(t,true),args=['tools/replay-backup-rehearsal.js','--layout','scoped-managed-v2-v1','--source',f.sourceRoot,'--destination',f.root,'--inventory',f.o.inventory,'--inventory-sha256',f.o.inventorySha256,'--receipt',f.o.receipt,'--receipt-sha256',f.o.receiptSha256,'--ack-backup-rehearsal-only'];
 const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).identity.rehearsal.dataRoot,f.dataRoot);await verify(f);
});
test('rehearsal explicit flat layout preserves old resume binding',async t=>{
 const f=fixture(t),first=await rehearseBackupV2(f.o);assert.deepEqual(await rehearseBackupV2({...f.o,layout:'flat-v1'}),first);assert.equal(Object.hasOwn(first.identity.rehearsal,'layout'),false);
});

const packageControls=['inventory.json','COMPLETE.json','scope.json','source-consistency.json','RESTORE.md','restore.mjs','io.mjs'];
function controlFixture(t){const f=fixture(t,true);for(const name of packageControls.slice(1))fs.writeFileSync(path.join(f.sourceRoot,name),'synthetic control',{flag:'wx'});return f;}
test('rehearsal batched controls use one fresh process per boundary',t=>{
 const f=controlFixture(t),scope=authorizeBackupRehearsal(f.o),stat=childProcess.execFileSync,calls=[];
 const expected=packageControls.map(n=>path.join(f.sourceRoot,n)).sort();
 childProcess.execFileSync=(cmd,args,...rest)=>{if(cmd==='/usr/bin/stat'&&args.some(p=>expected.includes(p)))calls.push(args.filter(p=>expected.includes(p)));return stat(cmd,args,...rest);};syncBuiltinESMExports();
 try{for(let i=0;i<2;i++){assert.equal(rehearsalDestination(scope),f.root);assert.equal(calls.length,i+1);assert.deepEqual([...calls[i]].sort(),expected);}}
 finally{childProcess.execFileSync=stat;syncBuiltinESMExports();}
});
for(const name of packageControls)test('rehearsal batched controls freshly reject dataless '+name,t=>{
 const f=controlFixture(t),scope=authorizeBackupRehearsal(f.o),target=path.join(f.sourceRoot,name),stat=childProcess.execFileSync,open=fs.openSync;
 assert.equal(rehearsalDestination(scope),f.root);let hit=0,opens=0;
 childProcess.execFileSync=(cmd,args,...rest)=>{if(cmd==='/usr/bin/stat'&&args.includes(target)){hit++;return args.slice(2).map(p=>p===target?'dataless':'-').join('\n')+'\n';}return stat(cmd,args,...rest);};
 fs.openSync=(...args)=>{opens++;return open(...args);};syncBuiltinESMExports();
 try{assert.throws(()=>rehearsalDestination(scope),{code:'dataless-input'});assert.equal(hit,1);assert.equal(opens,0);}
 finally{childProcess.execFileSync=stat;fs.openSync=open;syncBuiltinESMExports();}
});
for(const kind of ['empty','truncated','extra','malformed','EIO'])test('rehearsal batched controls reject unverifiable '+kind,t=>{
 const f=controlFixture(t),scope=authorizeBackupRehearsal(f.o),stat=childProcess.execFileSync,open=fs.openSync,target=path.join(f.sourceRoot,'inventory.json');
 const primary=Object.assign(Error('synthetic stat failure'),{code:'EIO'});let opens=0;
 childProcess.execFileSync=(cmd,args,...rest)=>{if(cmd==='/usr/bin/stat'&&args.includes(target)){
  if(kind==='EIO')throw primary;
  return kind==='empty'?'':kind==='truncated'?'-\n':kind==='extra'?'-\n'.repeat(8):'unverifiable output\n'.repeat(7);
 }return stat(cmd,args,...rest);};fs.openSync=(...args)=>{opens++;return open(...args);};syncBuiltinESMExports();
 try{assert.throws(()=>rehearsalDestination(scope),e=>kind==='EIO'?e===primary:e.code==='UNVERIFIABLE_RESIDENCY');assert.equal(opens,0);}
 finally{childProcess.execFileSync=stat;fs.openSync=open;syncBuiltinESMExports();}
});
for(const kind of ['symlink','hardlink','directory','missing'])test('rehearsal batched controls reject changed type '+kind,t=>{
 const f=controlFixture(t),scope=authorizeBackupRehearsal(f.o),p=path.join(f.sourceRoot,'RESTORE.md'),retained=path.join(f.parent,'retained-control');fs.renameSync(p,retained);
 if(kind==='symlink')fs.symlinkSync(retained,p);if(kind==='hardlink')fs.linkSync(retained,p);if(kind==='directory')fs.mkdirSync(p);
 const open=fs.openSync;let opens=0;fs.openSync=(...args)=>{opens++;return open(...args);};
 try{if(kind==='missing')assert.equal(rehearsalDestination(scope),f.root);else assert.throws(()=>rehearsalDestination(scope));assert.equal(opens,0);}
 finally{fs.openSync=open;}
 // Optional package controls may disappear; pinned inventory/receipt checks remain separate.
});

function clock(){const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>now});return{advance:n=>{now+=n;},restore:()=>{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}};}
for(const deadlineMs of [undefined,1800000])test('rehearsal deadline scope boundary '+String(deadlineMs),t=>{
 const f=fixture(t),c=clock();try{
  const options={...f.o,...(deadlineMs===undefined?{}:{deadlineMs})},scope=authorizeBackupRehearsal(options),expected=deadlineMs??600000;
  assert.equal(rehearsalDetails(scope).deadlineMs,expected);options.deadlineMs=Infinity;
  c.advance(expected-1);checkRehearsal(scope);c.advance(1);assert.throws(()=>checkRehearsal(scope),{code:'RESOURCE_LIMIT'});
 }finally{c.restore();}
 assert.deepEqual(fs.readdirSync(f.root),[]);
});
for(const value of [null,'1800000',Infinity,NaN,0,-1,1800001,1.5])test('rehearsal deadline rejects invalid '+String(value)+' before opens',t=>{
 const f=fixture(t),open=fs.openSync;let opens=0;fs.openSync=(...a)=>{opens++;return open(...a);};
 try{assert.throws(()=>authorizeBackupRehearsal({...f.o,deadlineMs:value}),{code:'RESOURCE_LIMIT'});assert.equal(opens,0);}finally{fs.openSync=open;}
 assert.deepEqual(fs.readdirSync(f.root),[]);
});
test('rehearsal deadline rejects accessors without invocation',t=>{
 const f=fixture(t);let reads=0;assert.throws(()=>authorizeBackupRehearsal({...f.o,get deadlineMs(){reads++;return 1800000;}}),{code:'INVALID_REHEARSAL'});assert.equal(reads,0);
});
test('rehearsal deadline propagates without changing profiles or non-time limits',async t=>{
 const f=fixture(t,true),before=files(f.parent),c=clock();let advanced=false;
 try{
  const options={...f.o,deadlineMs:1800000,fault:point=>{if(point==='before-prepare'&&!advanced){advanced=true;c.advance(600001);options.deadlineMs=Infinity;}}};
  const first=await rehearseBackupV2(options);assert(advanced);assert.equal(first.phase,'verified');assert.deepEqual(first.limits,{...backupStreamingLimits,elapsedMs:1800000});
  const destination=files(f.root),second=await rehearseBackupV2({...f.o,deadlineMs:1800000});assert.deepEqual(second,first);assert.deepEqual(files(f.root),destination);
  assert.equal(backupStreamingLimits.elapsedMs,600000);assert.equal(legacyBackupDiagnosticLimits.elapsedMs,600000);assert.deepEqual(files(f.parent),before);
 }finally{c.restore();}
 await verify(f);
});
test('rehearsal deadline lower limits and overall expiry still reject',async t=>{
 const f=fixture(t),scope=authorizeBackupRehearsal({...f.o,deadlineMs:1800000}),s=await createRehearsalStore(scope);s.close();
 await assert.rejects(convertRehearsalV2(scope,{limits:{elapsedMs:1800001}}),{code:'RESOURCE_LIMIT'});
 await assert.rejects(readRehearsalV2DiagnosticMembers(scope,{elapsedMs:1800001},()=>{}),{code:'RESOURCE_LIMIT'});
 const c=clock();let hit=false;try{await assert.rejects(convertRehearsalV2(scope,{limits:{elapsedMs:1000},fault:p=>{if(p==='before-prepare'){hit=true;c.advance(1000);}}}),{code:'RESOURCE_LIMIT'});assert(hit);}finally{c.restore();}
 const fresh=fixture(t),d=clock();let expired=false;try{await assert.rejects(rehearseBackupV2({...fresh.o,deadlineMs:1800000,fault:p=>{if(p==='before-reserve'){expired=true;d.advance(1800000);}}}),{code:'RESOURCE_LIMIT'});assert(expired);}finally{d.restore();}
 const partial=files(fresh.root);assert.equal((await rehearseBackupV2({...fresh.o,deadlineMs:1800000})).phase,'verified');assert(Object.keys(partial).length>0);await verify(fresh);
});
test('rehearsal deadline CLI accepts exact decimal and rejects malformed flags',t=>{
 const f=fixture(t),args=['tools/replay-backup-rehearsal.js','--source',f.sourceRoot,'--destination',f.root,'--inventory',f.o.inventory,'--inventory-sha256',f.o.inventorySha256,'--receipt',f.o.receipt,'--receipt-sha256',f.o.receiptSha256,'--ack-backup-rehearsal-only'];
 const r=spawnSync(process.execPath,[...args,'--deadline-ms','1800000'],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).limits.elapsedMs,1800000);
 const before=files(f.root);for(const value of ['Infinity','1e6','1800001','0','1.5','01800000']){const bad=spawnSync(process.execPath,[...args,'--deadline-ms',value],{encoding:'utf8',timeout:5000});assert.equal(bad.status,1);}
 const duplicate=spawnSync(process.execPath,[...args,'--deadline-ms','1800000','--deadline-ms','1800000'],{encoding:'utf8',timeout:5000});assert.equal(duplicate.status,1);assert.deepEqual(files(f.root),before);
});

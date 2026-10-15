import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {convertFixtureV2Bounded as convert,boundedConversionLimits} from '../../tools/replay-conversion-bounded-fixture.js';
import {createFixtureStore,openStore,recordKey,recordOwner} from '../../tools/replay-store.js';
import {iterateDiagnostics,streamOriginalValue} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';

const sha=b=>createHash('sha256').update(b).digest('hex'),tmp=fs.realpathSync(os.tmpdir());
async function fixture(t){
 const sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
 t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 const m={extension:{nil:null,no:false,zero:0,empty:[],unicode:'árvíz'},scoreRecords:[],records:[],replays:[],maps:[],version:2,retiredScoreSources:[]};
 for(let i=0;i<2;i++){
  const replayId=String(i+1).repeat(24),buildId='c'.repeat(64);
  const map={arena:{name:'Pain and Gain',season:'synthetic-'+i,level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]};
  const mid=mapChecksum(map),name='map-'+i+'.json';fs.writeFileSync(path.join(dir,name),JSON.stringify({...map,checksum:mid}));
  m.maps.push({id:mid,file:name,checksum:mid,status:'validated',unknown:null});
  m.replays.push({replayId,mapId:mid,buildId,status:'active',retiredFingerprints:[],unknown:false});
  for(const collection of ['log','score']){
   const fingerprint=(collection==='log'?String(i+1):String(i+3)).repeat(64),outputPath=collection+'-'+i+'.original',body=Buffer.from([0,1,255,i,10]);fs.writeFileSync(path.join(dir,outputPath),body);
   const value={replayId,fingerprint,mapId:mid,buildId,status:'claim',outputPath,outputFingerprint:sha(body),reviews:{'synthetic/owner':{claimedAt:'original',examinedAt:null,completedAt:null,extra:false}},unknown:{n:null,empty:{},no:false},owner:'synthetic',conflicts:[{opaque:'keep'}],large:'x'.repeat(17000)};
   if(collection==='log')value.otherEntries=[{key:'1:0',raw:' {"synthetic":true} ',extra:false},{key:'1:0',raw:'duplicate',extra:null}];else value.kind='replay-frames';
   m[collection==='log'?'records':'scoreRecords'].push(value);
  }
 }
 const manifest=path.join(dir,'manifest.json'),save=()=>fs.writeFileSync(manifest,JSON.stringify(m));save();
 const store=await createFixtureStore({root,filesystem:'local-apfs'});store.close();
 return {sourceRoot,root,dir,m,manifest,save,options:{synthetic:true,sourceRoot,root}};
}
const files=root=>{const all={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else all[path.relative(root,q)]=sha(fs.readFileSync(q));}}walk(root);return all;};
async function verify(f,result){
 assert.equal(result.phase,'verified');const s=await openStore({root:f.root,mode:'read'});
 const decode=p=>p.slice(1).replaceAll('~1','/').replaceAll('~0','~');
 try{
  for(const collection of ['log','score'])for(const [ordinal,original]of f.m[collection==='log'?'records':'scoreRecords'].entries()){
   const key={collection,replayId:original.replayId,fingerprint:original.fingerprint};assert.equal(s.getRecord(key).ordinal,ordinal);assert.equal(s.getRecord(key).status,original.status);
   const reviews=s.pageReviews(key).rows;
   if(!['claim','done'].includes(original.status)){
    const restore=owner=>Object.fromEntries(s.pageProperties(owner).rows.map(p=>{
     if(!p.payload_pointer)return[decode(p.pointer),JSON.parse(p.value)];
     const ref=s.pagePayloads(owner).rows.find(r=>r.pointer===p.pointer),bytes=fs.readFileSync(path.join(f.root,ref.path));
     return[decode(p.pointer),ref.role==='diagnostics'?bytes.toString().trim().split('\n').map(l=>JSON.parse(l).wrapper):JSON.parse(bytes)];
    }));
    const actual=restore(recordOwner(key));actual.reviews=Object.fromEntries(reviews.map(v=>[v.task,restore({kind:'review',key:JSON.stringify([recordKey(key),v.task])})]));
    assert.equal(JSON.stringify(actual),JSON.stringify(original));continue;
   }
   await s.withReadSnapshot({recordKeys:[key],reviewKeys:reviews.map(v=>({recordKey:key,taskId:v.task}))},async view=>{
    const readProps=async owner=>{const obj={};for(const p of s.pageProperties(owner).rows){const name=decode(p.pointer);if(p.payload_pointer){const chunks=[];await streamOriginalValue(view,view.payload(owner,p.pointer),b=>chunks.push(b));obj[name]=JSON.parse(Buffer.concat(chunks));}else obj[name]=JSON.parse(p.value);}return obj;};
    const actual={};for(const p of s.pageProperties(recordOwner(key)).rows){const name=decode(p.pointer);
     if(name==='reviews'){actual[name]={};for(const v of reviews)actual[name][v.task]=await readProps({kind:'review',key:JSON.stringify([recordKey(key),v.task])});}
     else if(name==='otherEntries'){actual[name]=[];for await(const e of iterateDiagnostics(view,key)){assert.equal(e.ordinal,actual[name].length);actual[name].push(e.value);}}
     else if(p.payload_pointer){const chunks=[];await streamOriginalValue(view,view.payload(recordOwner(key),p.pointer),b=>chunks.push(b));actual[name]=JSON.parse(Buffer.concat(chunks));}else actual[name]=JSON.parse(p.value);
    }assert.equal(JSON.stringify(actual),JSON.stringify(original));
   });
  }
  for(const [kind,values]of [['map',f.m.maps],['replay',f.m.replays]])for(const [ordinal,v]of values.entries()){
   const key=kind==='map'?v.id:v.replayId,row=kind==='map'?s.getMap(key):s.getReplay(key);assert.equal(row.ordinal,ordinal);
   const actual=Object.fromEntries(s.pageProperties({kind,key}).rows.map(p=>[decode(p.pointer),JSON.parse(p.value)]));assert.equal(JSON.stringify(actual),JSON.stringify(v));
  }
  for(const a of result.identity.artifacts){assert.equal(sha(fs.readFileSync(path.join(f.root,a.path))),a.expectedHash);assert.deepEqual(fs.readFileSync(path.join(f.root,a.path)),fs.readFileSync(path.join(f.dir,a.path)));}
  assert.equal(s.pageOperations().rows.length,0);
 }finally{s.close();}
 const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database),{readOnly:true});
 try{assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const rows=db.prepare('SELECT key,ordinal,present FROM collections ORDER BY ordinal').all();assert.deepEqual(rows.map(r=>r.key),Object.keys(f.m).filter(k=>Array.isArray(f.m[k])));assert.ok(rows.every(r=>r.present===1));
 }finally{db.close();}
}
test('multi-record preserves complete supported source, aliases absent, ordered diagnostics and repeats',async t=>{
 const f=await fixture(t),source=files(f.sourceRoot),result=await convert(f.options);await verify(f,result);
 const before=files(f.root),again=await convert(f.options);assert.equal(again.generation,result.generation);assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.sourceRoot),source);
});

for(const collection of ['log','score'])for(const phase of ['reserved','published','verified'])for(const field of ['value','owner_key'])test(`review integrity multi ${collection} ${phase} ${field}`,async t=>{
 const f=await fixture(t),record=f.m[collection==='log'?'records':'scoreRecords'][0];
 record.reviews['synthetic/second']={claimedAt:'original-second',examinedAt:null,completedAt:null,unknown:{flag:false,large:'x'.repeat(17000)}};f.save();
 const point={reserved:'after-reserve',published:'after-record-checkpoint'}[phase],stopAt=collection==='log'?1:3;let hits=0;
 if(point)await assert.rejects(convert({...f.options,fault:n=>{if(n===point&&++hits===stopAt)throw Error('retained interruption');}}));else await convert(f.options);
 const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
 try{db.prepare(`UPDATE reviews SET ${field}=? WHERE collection=? AND fingerprint=? AND task=?`).run(field==='value'?JSON.stringify({claimedAt:'forged',examinedAt:'forged',completedAt:'forged'}):'wrong-owner',collection,record.fingerprint,'synthetic/second');}finally{db.close();}
 const before=files(f.root);await assert.rejects(convert(f.options),{code:'CHANGED_DESTINATION'});assert.deepEqual(files(f.root),before,'reject without changing rows, checkpoint or payloads');
});

test('review integrity multi valid inline, null and empty reviews repeat unchanged',async t=>{
 const f=await fixture(t);f.m.records[0].reviews['synthetic/large']={claimedAt:'original',examinedAt:null,completedAt:null,unknown:'x'.repeat(17000)};f.m.scoreRecords[1].reviews={};f.save();
 const result=await convert(f.options),descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
 try{db.prepare('UPDATE reviews SET value=? WHERE collection=? AND fingerprint=? AND task=?').run(JSON.stringify(f.m.records[0].reviews['synthetic/owner']),'log',f.m.records[0].fingerprint,'synthetic/owner');
  assert.equal(db.prepare('SELECT value FROM reviews WHERE task=?').get('synthetic/large').value,null);
 }finally{db.close();}
 const before=files(f.root);for(let i=0;i<2;i++){const again=await convert(f.options);assert.equal(again.generation,result.generation);await verify(f,again);assert.deepEqual(files(f.root),before);}
});

test('review integrity multi distinguishes absent unknown fields from null',async t=>{
 const f=await fixture(t);await convert(f.options);
 const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
 try{db.prepare('UPDATE reviews SET value=? WHERE collection=? AND fingerprint=? AND task=?').run(JSON.stringify({...f.m.scoreRecords[0].reviews['synthetic/owner'],unknown:null}),'score',f.m.scoreRecords[0].fingerprint,'synthetic/owner');}finally{db.close();}
 const before=files(f.root);await assert.rejects(convert(f.options),{code:'CHANGED_DESTINATION'});assert.deepEqual(files(f.root),before);
});
for(const point of ['before-prepare','after-prepare','before-map','after-map','after-map-checkpoint','after-replay-checkpoint','before-reserve','after-reserve','after-output','after-payload','before-record-checkpoint','after-record-checkpoint','before-verified','after-verified'])test('bounded resume '+point,async t=>{
 const f=await fixture(t),e=Object.assign(Error(point),{code:'EIO'});let hit=false;
 await assert.rejects(convert({...f.options,fault:n=>{if(n===point&&!hit){hit=true;throw e;}}}),x=>x===e);assert.ok(hit);await verify(f,await convert(f.options));
});
test('all supported record statuses and empty reviews preserve without lifecycle actions',async t=>{
 const f=await fixture(t);f.m.records[0].status='waiting';f.m.records[0].reviews={};f.m.records[1].status='done';f.m.records[1].reviews['synthetic/owner'].completedAt='original-completion';f.m.scoreRecords[0].status='retiring';f.m.scoreRecords[1].status='pending';f.save();await verify(f,await convert(f.options));
});
for(const mode of ['truncated','duplicate','unsupported','missing-link','conflict','member','count','numeric-order','negative-zero'])test('reject before mutation '+mode,async t=>{
 const f=await fixture(t),before=files(f.root);
 if(mode==='truncated')fs.appendFileSync(f.manifest,'{');
 if(mode==='duplicate')fs.writeFileSync(f.manifest,fs.readFileSync(f.manifest,'utf8').replace('"version":2','"version":2,"version":2'));
 if(mode==='unsupported'){f.m.retiredScoreSources.push({opaque:true});f.save();}
 if(mode==='missing-link'){f.m.records[1].mapId='0'.repeat(64);f.save();}
 if(mode==='conflict'){f.m.records.push(f.m.records[0]);f.save();}
 if(mode==='member'){f.m.records[0].large='x'.repeat(1048576);f.save();}
 if(mode==='count'){while(f.m.records.length<9)f.m.records.push({...f.m.records[0],fingerprint:sha(String(f.m.records.length))});f.save();}
 if(mode==='numeric-order'){f.m.records[0].unknown={'2':'two','1':'one'};f.save();}
 if(mode==='negative-zero')fs.writeFileSync(f.manifest,fs.readFileSync(f.manifest,'utf8').replace('"zero":0','"zero":-0'));
 await assert.rejects(convert(f.options));assert.deepEqual(files(f.root),before);
});
for(const mode of ['source','body','replacement'])test('source commitments reject '+mode,async t=>{
 const f=await fixture(t);await assert.rejects(convert({...f.options,fault:n=>{if(n==='after-prepare')throw Error('stop');}}));
 const before=files(f.root);if(mode==='source'){f.m.extension.changed=true;f.save();}else if(mode==='body')fs.appendFileSync(path.join(f.dir,f.m.records[0].outputPath),'changed');else{fs.renameSync(f.manifest,f.manifest+'.old');f.save();}
 await assert.rejects(convert(f.options));assert.deepEqual(files(f.root),before);
});
for(const field of ['hash','path','bytes','state','fingerprint'])test('reservation corruption '+field,async t=>{
 const f=await fixture(t);await convert(f.options);const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
 try{db.exec('PRAGMA foreign_keys=OFF');const values={hash:'0'.repeat(64),path:'wrong.original',bytes:999,state:'pending',fingerprint:'f'.repeat(64)};db.prepare('UPDATE outputs SET '+field+'=? WHERE collection=? AND fingerprint=?').run(values[field],'log',f.m.records[0].fingerprint);}finally{db.close();}
 const before=files(f.root);await assert.rejects(convert(f.options));assert.deepEqual(files(f.root),before);
});
test('bounded input reads, awaited callback and private options',async t=>{
 const f=await fixture(t),original=fs.readFileSync(f.manifest,'utf8'),native={read:fs.readSync,readFile:fs.readFileSync,parse:JSON.parse},opts={...f.options,limits:{members:8}};let events=0;
 opts.fault=async name=>{if(name==='input-member'){events++;opts.sourceRoot='/not-a-fixture';opts.limits.members=Infinity;await Promise.resolve();}};
 fs.readFileSync=(p,...a)=>{assert.notEqual(p,f.manifest);return native.readFile(p,...a);};JSON.parse=(s,...a)=>{assert.notEqual(String(s),original);return native.parse(s,...a);};
 let result;try{result=await convert(opts);}finally{fs.readFileSync=native.readFile;JSON.parse=native.parse;}
 assert.ok(events>0);await verify(f,result);
});
test('finite lower limits reject, ordinary limit boundary succeeds',async t=>{
 const f=await fixture(t),before=files(f.root);for(const limits of [{members:1},{inputBytes:20},{memberBytes:20},{totalArtifactBytes:1},{elapsedMs:1},{heapBytes:1},{rssBytes:1},{members:Infinity}]){await assert.rejects(convert({...f.options,limits}));assert.deepEqual(files(f.root),before);}
 await verify(f,await convert({...f.options,limits:{members:2}}));assert.equal(boundedConversionLimits.members,8);
});
test('unsafe production, backup, cache, trial and aliased roots fail without opens',async t=>{
 const f=await fixture(t),before=files(f.root);for(const bad of [process.cwd(),path.join(process.cwd(),'replay_logs'),'/tmp/backup','/tmp/Cache_Data',path.resolve('../pain_and_gain_hold_trial_2026-10-02')])for(const field of ['root','sourceRoot'])await assert.rejects(convert({...f.options,[field]:bad}),{code:'UNSAFE_PATH'});
 const alias=path.join(tmp,'pain-gain-v2-reader-fixture-alias-'+process.pid);fs.symlinkSync(f.sourceRoot,alias);await assert.rejects(convert({...f.options,sourceRoot:alias}));assert.deepEqual(files(f.root),before);
});
test('concurrent runs reconcile one stable conversion',async t=>{
 const f=await fixture(t),results=await Promise.all([convert(f.options),convert(f.options)]);assert.equal(results[0].storeId,results[1].storeId);await verify(f,results[1]);
});
test('operation EIO and descriptor close ENOSPC remain separate',async t=>{
 const f=await fixture(t),before=files(f.root),native={open:fs.openSync,read:fs.readSync,close:fs.closeSync};let fd;
 const e=Object.assign(Error('read'),{code:'EIO'});fs.openSync=(p,...a)=>{const n=native.open(p,...a);if(p===f.manifest)fd=n;return n;};
 fs.readSync=(n,...a)=>{if(n===fd)throw e;return native.read(n,...a);};fs.closeSync=n=>{const selected=n===fd;if(selected)fd=undefined;native.close(n);if(selected)throw Object.assign(Error('close'),{code:'ENOSPC'});};
 try{await assert.rejects(convert(f.options),x=>x===e&&x.cleanupFailures.some(c=>c.systemCode==='ENOSPC'));}finally{fs.openSync=native.open;fs.readSync=native.read;fs.closeSync=native.close;}
 assert.deepEqual(files(f.root),before);
});

test('source change at final checkpoint boundary cannot return verified',async t=>{
 const f=await fixture(t);await assert.rejects(convert({...f.options,fault:n=>{if(n==='before-verified'){f.m.extension.changed=true;f.save();}}}),{code:'CHANGED_INPUT'});
});

test('primary conversion error retains lock cleanup failure',async t=>{
 const f=await fixture(t),unlink=fs.unlinkSync,e=Object.assign(Error('conversion'),{code:'EIO'});let inject=false;
 fs.unlinkSync=p=>{unlink(p);if(inject&&p===path.join(f.root,'.manifest.lock'))throw Object.assign(Error('lock cleanup'),{code:'ENOSPC'});};
 try{await assert.rejects(convert({...f.options,fault:n=>{if(n==='after-prepare'){inject=true;throw e;}}}),x=>x===e&&x.cleanupFailures?.some(c=>c.systemCode==='ENOSPC'));}
 finally{fs.unlinkSync=unlink;}
});

test('optional absent collections and standalone map/replay entities retain layout',async t=>{
 const f=await fixture(t);delete f.m.scoreRecords;delete f.m.retiredScoreSources;f.m.records=[];f.save();
 const r=await convert(f.options);assert.equal(r.phase,'verified');const s=await openStore({root:f.root,mode:'read'});
 try{assert.equal(s.getCollection('scoreRecords').kind,'missing');assert.equal(s.getCollection('retiredScoreSources').kind,'missing');assert.equal(s.getCollection('records').present,1);
  const extension=s.pageProperties({kind:'root',key:'root'}).rows.find(p=>p.pointer==='/extension');assert.deepEqual(JSON.parse(extension.value),f.m.extension);
  assert.deepEqual(s.entityCounts(),{collections:3,maps:2,replays:2,records:0,reviews:0,retired:0});
 }finally{s.close();}
});

test('map projection corruption and collection ordinal corruption reject unchanged resume',async t=>{
 for(const sql of ['UPDATE maps SET hash=printf("%064d",0)','UPDATE collections SET ordinal=999 WHERE key="maps"']){
  const f=await fixture(t);await convert(f.options);const d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,d.database));
  try{db.exec(sql.replaceAll('"',"'"));}finally{db.close();}
  await assert.rejects(convert(f.options),{code:'CHANGED_DESTINATION'});
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {convertFixtureV2Bounded,convertFixtureV2Streaming} from '../../tools/replay-conversion-bounded-fixture.js';
import {createFixtureStore,openStore,recordKey,recordOwner} from '../../tools/replay-store.js';
import {iterateDiagnostics} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';

const sha=b=>createHash('sha256').update(b).digest('hex'),build='c'.repeat(64);
const modes=[['bounded',convertFixtureV2Bounded,{}],['streaming',convertFixtureV2Streaming,{}],['expanded',convertFixtureV2Streaming,{capacity:'expanded-synthetic-v1'}]];
async function fixture(t){
 const tmp=fs.realpathSync(os.tmpdir()),sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
 t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 const map={arena:{name:'Pain and Gain',season:'synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]};
 const mid=mapChecksum(map),replayId='1'.repeat(24);fs.writeFileSync(path.join(dir,'map.json'),JSON.stringify({...map,checksum:mid}));
 const m={version:2,maps:[{id:mid,file:'map.json',checksum:mid,status:'validated',unknown:null}],replays:[{replayId,mapId:mid,buildId:build,status:'active',retiredFingerprints:[],unknown:false}],records:[],scoreRecords:[],retiredScoreSources:[]};
 for(let i=0;i<3;i++){
  const outputPath=`original-${i}`,body=Buffer.from([0,255,i,10]);fs.writeFileSync(path.join(dir,outputPath),body);
  const v={replayId,fingerprint:sha(String(i)),mapId:mid,buildId:build,status:'claim',outputPath,outputFingerprint:sha(body),reviews:{'synthetic/review':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}},unknown:{nil:null,empty:[],flag:false}};
  if(i<2){v.otherEntries=[{key:'1:0',raw:' {"keep":null} ',unknown:false},{key:'1:0',raw:'duplicate',unknown:null}];m.records.push(v);}else{v.kind='replay-frames';v.embeddedBuildId=null;m.scoreRecords.push(v);}
 }
 const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));save();
 const s=await createFixtureStore({root,filesystem:'local-apfs'});s.close();return {m,save,root,sourceRoot,options:{synthetic:true,root,sourceRoot}};
}
function hashes(root){const out={};function visit(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())visit(q);else out[path.relative(root,q)]=sha(fs.readFileSync(q));}}visit(root);return out;}
function omit(f,variant){
 const rows=[...f.m.records,...f.m.scoreRecords];
 if(variant!=='known-records')for(const v of rows)delete v.buildId;
 if(variant!=='known-replay')delete f.m.replays[0].buildId;
 if(variant==='mixed')f.m.records[0].buildId=build;
 f.save();
}
async function verify(f,result){
 assert.equal(result.phase,'verified');const s=await openStore({root:f.root,mode:'read'});
 const props=owner=>Object.fromEntries(s.pageProperties(owner).rows.map(p=>{assert.equal(p.payload_pointer,null);return[p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),JSON.parse(p.value)];}));
 try{
  assert.equal(s.getReplay(f.m.replays[0].replayId).build_id,f.m.replays[0].buildId??null);
  assert.equal(JSON.stringify(props({kind:'replay',key:f.m.replays[0].replayId})),JSON.stringify(f.m.replays[0]));
  for(const [collection,values]of [['log',f.m.records],['score',f.m.scoreRecords]])for(const [ordinal,v]of values.entries()){
   const key={collection,replayId:v.replayId,fingerprint:v.fingerprint},owner=recordOwner(key),row=s.getRecord(key);
   assert.equal(row.build_id,v.buildId??null);assert.equal(row.ordinal,ordinal);
   const reviews=s.pageReviews(key).rows;
   await s.withReadSnapshot({recordKeys:[key],reviewKeys:reviews.map(r=>({recordKey:key,taskId:r.task}))},async view=>{
    const actual={};for(const p of s.pageProperties(owner).rows){const name=p.pointer.slice(1);
     if(name==='otherEntries'){actual[name]=[];for await(const d of iterateDiagnostics(view,key)){assert.equal(d.ordinal,actual[name].length);actual[name].push(d.value);}}
     else if(name==='reviews')actual[name]=Object.fromEntries(reviews.map(r=>[r.task,props({kind:'review',key:JSON.stringify([recordKey(key),r.task])})]));
     else{assert.equal(p.payload_pointer,null);actual[name]=JSON.parse(p.value);}
    }assert.equal(JSON.stringify(actual),JSON.stringify(v));
    assert.equal(Object.hasOwn(actual,'buildId'),Object.hasOwn(v,'buildId'));
    if(collection==='score'){assert.equal(actual.embeddedBuildId,null);assert.ok(Object.hasOwn(actual,'embeddedBuildId'));}
   });
   assert.equal(sha(fs.readFileSync(path.join(f.root,v.outputPath))),v.outputFingerprint);
  }
 }finally{s.close();}
}
for(const [mode,convert,extra]of modes){
 for(const variant of ['all','known-replay','known-records','mixed'])test(`omitted build regression ${mode} ${variant}`,async t=>{
  const f=await fixture(t);omit(f,variant);const source=hashes(f.sourceRoot),options={...f.options,...extra};await verify(f,await convert(options));
  const before=hashes(f.root);for(let i=0;i<2;i++){await verify(f,await convert(options));assert.deepEqual(hashes(f.root),before);}assert.deepEqual(hashes(f.sourceRoot),source);
 });
 // Explicit null is legacy-log metadata only; score/replay null still rejects.
 for(const target of ['records','scoreRecords','replays'])for(const value of target==='records'?['',42,'A'.repeat(64)]:[null,'',42,'A'.repeat(64)])test(`invalid present build ${mode} ${target} ${JSON.stringify(value)}`,async t=>{
  const f=await fixture(t);f.m[target][0].buildId=value;f.save();const before=hashes(f.root);await assert.rejects(convert({...f.options,...extra}),{code:'UNSUPPORTED_STATE'});assert.deepEqual(hashes(f.root),before);
 });
 for(const target of ['records','scoreRecords'])test(`known build conflict ${mode} ${target}`,async t=>{
  const f=await fixture(t);f.m[target][0].buildId='d'.repeat(64);f.save();const before=hashes(f.root);await assert.rejects(convert({...f.options,...extra}),{code:'INVALID_ASSOCIATION'});assert.deepEqual(hashes(f.root),before);
 });
 for(const point of ['after-reserve','after-payload','after-record-checkpoint','before-verified'])test(`omitted build recovery ${mode} ${point}`,async t=>{
  const f=await fixture(t);omit(f,'known-replay');const options={...f.options,...extra};let stopped=false;
  await assert.rejects(convert({...options,fault:n=>{if(n===point&&!stopped){stopped=true;throw Object.assign(Error('retained interruption'),{code:'EIO'});}}}),{code:'EIO'});assert.ok(stopped);
  await verify(f,await convert(options));const before=hashes(f.root);await verify(f,await convert(options));assert.deepEqual(hashes(f.root),before);
 });
 test(`omitted identity commitment rejects changed source ${mode}`,async t=>{
  const f=await fixture(t);omit(f,'all');const options={...f.options,...extra};await assert.rejects(convert({...options,fault:n=>{if(n==='after-prepare')throw Error('stop');}}));
  f.m.records[0].buildId=build;f.save();const before=hashes(f.root);await assert.rejects(convert(options));assert.deepEqual(hashes(f.root),before);
 });
}

// Independent tiny legacy-shaped input: no copied real record or payload bytes.
function legacyNullLogs(f){
 const known=structuredClone(f.m.records[1]),body=Buffer.from('synthetic known-build log\n');
 known.fingerprint=sha('third-synthetic-log');known.outputPath='known-log';known.outputFingerprint=sha(body);
 fs.writeFileSync(path.join(f.sourceRoot,'replay_logs',known.outputPath),body);
 f.m.records[0].buildId=null;delete f.m.records[1].buildId;f.m.records.push(known);f.save();
}
const nullModes=[...modes,['backup-sized',convertFixtureV2Streaming,{capacity:'backup-sized-synthetic-v1'}]];
for(const [mode,convert,extra]of nullModes){
 for(const association of ['known','omitted'])test(`legacy null log ${mode} exact identities and repeat ${association}`,async t=>{
  const f=await fixture(t);legacyNullLogs(f);if(association==='omitted'){delete f.m.replays[0].buildId;f.save();}
  const source=hashes(f.sourceRoot),options={...f.options,...extra},first=await convert(options);await verify(f,first);
  const before=hashes(f.root);for(let i=0;i<2;i++){assert.deepEqual(await convert(options),first);await verify(f,first);assert.deepEqual(hashes(f.root),before);}
  assert.deepEqual(hashes(f.sourceRoot),source);
 });
 for(const [point,occurrence]of [['after-reserve',1],['after-reserve',2],['after-reserve',3],['after-payload',1],['after-record-checkpoint',1],['before-verified',1]])test(`legacy null log ${mode} interruption ${point} ${occurrence}`,async t=>{
  const f=await fixture(t);legacyNullLogs(f);const options={...f.options,...extra},primary=Object.assign(Error('synthetic null-log interruption'),{code:'EIO'});let hits=0;
  await assert.rejects(convert({...options,fault:p=>{if(p===point&&++hits===occurrence)throw primary;}}),e=>e===primary);assert.equal(hits,occurrence);
  if(point==='after-reserve'){
   const s=await openStore({root:f.root,mode:'read'});try{const v=f.m.records[occurrence-1],key={collection:'log',replayId:v.replayId,fingerprint:v.fingerprint};
    assert.equal(s.getRecord(key).status,'pending');assert.equal(s.getRecord(key).build_id,v.buildId??null);
    const p=s.pageProperties(recordOwner(key)).rows.find(p=>p.pointer==='/buildId');assert.equal(!!p,Object.hasOwn(v,'buildId'));if(p)assert.equal(JSON.parse(p.value),v.buildId);
   }finally{s.close();}
  }
  const first=await convert(options);await verify(f,first);const before=hashes(f.root);assert.deepEqual(await convert(options),first);assert.deepEqual(hashes(f.root),before);
 });
 for(const change of ['omit','known'])test(`legacy null log ${mode} committed source ${change} rejects`,async t=>{
  const f=await fixture(t);legacyNullLogs(f);const options={...f.options,...extra};let hit=false;
  await assert.rejects(convert({...options,fault:p=>{if(p==='after-prepare'){hit=true;throw Error('retained');}}}));assert(hit);
  if(change==='omit')delete f.m.records[0].buildId;else f.m.records[0].buildId=build;f.save();
  const before=hashes(f.root);await assert.rejects(convert(options),{code:'SOURCE_CONFLICT'});assert.deepEqual(hashes(f.root),before);
 });
 for(const conflict of ['known-build','map','replay'])test(`legacy null log ${mode} strict linkage ${conflict}`,async t=>{
  const f=await fixture(t);legacyNullLogs(f);
  if(conflict==='known-build')f.m.records[2].buildId='d'.repeat(64);else if(conflict==='map')f.m.records[0].mapId='e'.repeat(64);else f.m.records[0].replayId='2'.repeat(24);f.save();
  const before=hashes(f.root);await assert.rejects(convert({...f.options,...extra}),{code:'INVALID_ASSOCIATION'});assert.deepEqual(hashes(f.root),before);
 });
}

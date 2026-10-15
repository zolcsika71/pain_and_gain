import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {convertFixtureV2Bounded,convertFixtureV2Streaming} from '../../tools/replay-conversion-bounded-fixture.js';
import {createFixtureStore,openStore,recordKey} from '../../tools/replay-store.js';
import {iterateDiagnostics} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const modes=[['bounded',convertFixtureV2Bounded,{}],['streaming',convertFixtureV2Streaming,{}],['expanded',convertFixtureV2Streaming,{capacity:'expanded-synthetic-v1'}]];
async function fixture(t){
 const tmp=fs.realpathSync(os.tmpdir()),sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
 t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 const map={arena:{name:'Pain and Gain',season:'synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]},mid=mapChecksum(map);
 fs.writeFileSync(path.join(dir,'map.json'),JSON.stringify({...map,checksum:mid}));
 const history=[sha('history-z'),sha('history-a'),sha('history-m')];
 const m={version:2,maps:[{id:mid,file:'map.json',checksum:mid,status:'validated'}],replays:[],records:[],scoreRecords:[],retiredScoreSources:[]};
 for(let i=0;i<2;i++){
  const replayId=String(i+1).repeat(24);
  m.replays.push({replayId,mapId:mid,status:'active',retiredFingerprints:i?history.slice(0,1):history,unknown:{nil:null,empty:[],flag:false}});
  const outputPath='log-'+i,body=Buffer.from([0,255,i]);fs.writeFileSync(path.join(dir,outputPath),body);
  m.records.push({replayId,fingerprint:sha('current-'+i),mapId:mid,status:'claim',outputPath,outputFingerprint:sha(body),reviews:{'synthetic/owner':{claimedAt:'original',examinedAt:null,completedAt:null}},otherEntries:[{key:'1:0',raw:' raw ',unknown:false}]});
 }
 const score={...m.records[0],fingerprint:history[0],outputPath:'score',kind:'replay-frames',embeddedBuildId:null};delete score.otherEntries;fs.writeFileSync(path.join(dir,'score'),Buffer.from([0,255,0]));m.scoreRecords.push(score);
 const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));save();const s=await createFixtureStore({root,filesystem:'local-apfs'});s.close();return {m,root,sourceRoot,save,options:{synthetic:true,root,sourceRoot}};
}
function files(root){const out={};function visit(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())visit(q);else out[path.relative(root,q)]=sha(fs.readFileSync(q));}}visit(root);return out;}
function db(f,fn){const d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),s=new DatabaseSync(path.join(f.root,d.database));try{return fn(s);}finally{s.close();}}
async function verify(f,result){
 assert.equal(result.phase,'verified');const s=await openStore({root:f.root,mode:'write'});
 try{
  let count=0;for(const replay of f.m.replays){
   const owner={kind:'replay',key:replay.replayId};const actual=Object.fromEntries(s.pageProperties(owner).rows.map(p=>[p.pointer.slice(1),JSON.parse(p.value)]));assert.equal(JSON.stringify(actual),JSON.stringify(replay));assert.equal(s.getReplay(replay.replayId).build_id,null);
   for(const [ordinal,fingerprint]of (replay.retiredFingerprints??[]).entries()){
    count++;const key={collection:'log',replayId:replay.replayId,fingerprint},retiredOwner={kind:'retired',key:recordKey(key)};
    assert.deepEqual(s.getRecord(key),{kind:'retired',key:recordKey(key)});
    await s.withWriter(w=>{const facts=w.readReviewCheckpoint({recordKey:key,taskId:'synthetic/check'});assert.equal(facts.current,undefined);assert.equal(facts.retired.ordinal,ordinal);assert.equal(facts.retired.key,recordKey(key));});
    assert.deepEqual(s.pageProperties(retiredOwner).rows,[]);assert.deepEqual(s.pagePayloads(retiredOwner).rows,[]);
    await assert.rejects(s.withReadSnapshot({recordKeys:[key]},()=>assert.fail('Historical source must not become readable')));
   }
  }
  assert.equal(s.entityCounts().retired,count);assert.equal(s.entityCounts().records,3);
  assert.equal(s.getRecord({collection:'log',replayId:f.m.replays[0].replayId,fingerprint:sha('missing')}).kind,'missing');
  for(const [collection,values]of [['log',f.m.records],['score',f.m.scoreRecords]])for(const v of values){const key={collection,replayId:v.replayId,fingerprint:v.fingerprint};assert.equal(s.getRecord(key).status,'claim');
   await s.withReadSnapshot({recordKeys:[key]},async view=>{if(collection==='log'){const got=[];for await(const d of iterateDiagnostics(view,key))got.push(d.value);assert.deepEqual(got,v.otherEntries);}assert.equal(view.output(key).hash,v.outputFingerprint);});
  }
 }finally{s.close();}
}
for(const [name,convert,extra]of modes){
 test(`history rejection regression ${name}`,async t=>{const f=await fixture(t),source=files(f.sourceRoot),options={...f.options,...extra};await verify(f,await convert(options));const before=files(f.root);await verify(f,await convert(options));assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.sourceRoot),source);});
 for(const bad of [null,'a'.repeat(64),['BAD'],[42],['a'.repeat(63)],['A'.repeat(64)]])test(`history malformed ${name} ${JSON.stringify(bad)}`,async t=>{const f=await fixture(t);f.m.replays[0].retiredFingerprints=bad;f.save();const before=files(f.root);await assert.rejects(convert({...f.options,...extra}));assert.deepEqual(files(f.root),before);});
 for(const kind of ['duplicate','current-conflict','missing-association','map-conflict','build-conflict','score-retirement','capacity'])test(`history rejects ${name} ${kind}`,async t=>{
  const f=await fixture(t),r=f.m.replays[0];
  if(kind==='duplicate')r.retiredFingerprints.push(r.retiredFingerprints[0]);
  if(kind==='current-conflict')r.retiredFingerprints.push(f.m.records[0].fingerprint);
  if(kind==='missing-association')f.m.records[0].replayId='9'.repeat(24);
  if(kind==='map-conflict')f.m.records[0].mapId='f'.repeat(64);
  if(kind==='build-conflict'){r.buildId='a'.repeat(64);f.m.records[0].buildId='b'.repeat(64);}
  if(kind==='score-retirement')f.m.retiredScoreSources.push({replayId:r.replayId,fingerprint:sha('score')});
  if(kind==='capacity')r.retiredFingerprints=Array.from({length:300},(_,i)=>sha(String(i)));
  f.save();const before=files(f.root);await assert.rejects(convert({...f.options,...extra}));assert.deepEqual(files(f.root),before);
 });
 for(const point of ['after-prepare','after-replay-checkpoint','after-reserve','after-record-checkpoint','before-verified'])test(`history recovery ${name} ${point}`,async t=>{const f=await fixture(t),options={...f.options,...extra};let hit=false;await assert.rejects(convert({...options,fault:n=>{if(n===point&&!hit){hit=true;throw Object.assign(Error('interrupted'),{code:'EIO'});}}}),{code:'EIO'});assert.ok(hit);await verify(f,await convert(options));const before=files(f.root);await verify(f,await convert(options));assert.deepEqual(files(f.root),before);});
 test(`history changed source ${name}`,async t=>{const f=await fixture(t),options={...f.options,...extra};await assert.rejects(convert({...options,fault:n=>{if(n==='after-replay-checkpoint')throw Error('stop');}}));f.m.replays[0].retiredFingerprints.reverse();f.save();const before=files(f.root);await assert.rejects(convert(options),{code:'SOURCE_CONFLICT'});assert.deepEqual(files(f.root),before);});
 for(const corruption of ['ordinal','missing','unexpected','property','payload','nested-payload'])test(`history corrupt resume ${name} ${corruption}`,async t=>{
  const f=await fixture(t),options={...f.options,...extra};await convert(options);const key=recordKey({collection:'log',replayId:f.m.replays[0].replayId,fingerprint:f.m.replays[0].retiredFingerprints[0]});
  db(f,d=>{if(corruption==='ordinal')d.prepare('UPDATE retired SET ordinal=999 WHERE key=?').run(key);
   if(corruption==='missing')d.prepare('DELETE FROM retired WHERE key=?').run(key);
   if(corruption==='unexpected'){const fp=sha('unplanned'),k=recordKey({collection:'log',replayId:f.m.replays[0].replayId,fingerprint:fp});d.prepare('INSERT INTO retired VALUES (?,?,?,?,?)').run('log',f.m.replays[0].replayId,fp,k,0);}
   if(corruption==='property')d.prepare('INSERT INTO properties VALUES (?,?,?,?,?,?)').run('retired',key,'/forged',0,'null',null);
   if(corruption==='payload'||corruption==='nested-payload'){d.exec('PRAGMA foreign_keys=OFF');d.prepare("UPDATE payloads SET owner_kind='retired',owner_key=?,parent=? WHERE rowid=(SELECT rowid FROM payloads LIMIT 1)").run(key,corruption==='payload'?null:'/absent-parent');}
  });const before=files(f.root);await assert.rejects(convert(options),{code:'CHANGED_DESTINATION'});assert.deepEqual(files(f.root),before);
 });
 test(`history absent and empty unchanged ${name}`,async t=>{const f=await fixture(t);delete f.m.replays[0].retiredFingerprints;f.m.replays[1].retiredFingerprints=[];f.save();await verify(f,await convert({...f.options,...extra}));});
}

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {makeFixture} from './replay-combined-analysis-m2e-store.js';
import {updateFixtureReviewCheckpoint} from '../../tools/replay-review-fixture.js';
import {recordKey} from '../../tools/replay-store.js';
import {golden,hash,json,logical,artifacts,clock,measure} from './replay-review-m2f-helpers.js';
const [phase,schemaText,receipts,...roots]=process.argv.slice(2),schema=Number(schemaText),started=performance.now(),cpu=process.cpuUsage();
const save=(name,v)=>fs.writeFileSync(path.join(receipts,name),json(v));
const load=name=>JSON.parse(fs.readFileSync(path.join(receipts,name)));
const output=v=>{const result={phase,schema,...v,elapsedMs:performance.now()-started,cpu:process.cpuUsage(cpu),maxRssBytes:process.resourceUsage().maxRSS*1024};assert.ok(result.maxRssBytes<=256*1048576);assert.ok(Buffer.byteLength(json(result))<=512*1024);console.log(json(result));};
if(phase==='generate'){
 for(const name of ['tests/fixtures/replay-combined-analysis-m2e-recipe.js','tests/fixtures/replay-combined-analysis-m2e-definitions.js','tests/fixtures/replay-combined-analysis-m2e-store.js','tools/replay-logs.js'])assert.equal(hash(fs.readFileSync(new URL('../../'+name,import.meta.url))),golden.exports[name].sha256);
 const stores=[];
 for(const [i,root]of roots.entries()){
  const count=[10,1000][i],f=await makeFixture(schema,'scale',{root,count,large:true});
  await f.s.withWriter(w=>w.transaction(tx=>{for(const {key}of f.refs)tx.putReview({recordKey:key,taskId:'codex/m2f-existing',ordinal:7,value:{claimedAt:'2026-10-06T00:00:00.000Z',examinedAt:null,completedAt:null,note:{zero:0,flag:false}}});}));
  f.h.close();const db=logical(root),files=artifacts(root);assert.equal(db.records.length,count);assert.equal(db.retired.length,0);assert.equal(db.records.filter(r=>r.status==='pending').length,count-4);assert.equal(db.operations.length,6);assert.equal(db.operation_files.length,12);assert.equal(db.reviews.length,4);
  for(const a of golden.artifacts){const p=a.logical??f.refs.find(r=>r.key.collection===a.collection&&r.key.fingerprint===a.fingerprint).refs.find(r=>r.pointer===a.pointer).path;assert.equal(files[p].bytes,a.bytes);assert.equal(files[p].hash,a.hash);}
  const inodes=new Set();let bytes=0;for(const [j,ref]of f.largeRefs.entries()){const st=files[ref.path];assert.equal(st.bytes,golden.large[j].bytes);assert.equal(st.hash,golden.large[j].hash);assert.equal(st.nlink,1);assert.ok(st.blocks*512>=st.bytes);inodes.add(`${st.dev}:${st.ino}`);bytes+=st.bytes;}assert.equal(inodes.size,12);assert.equal(bytes,629145600);
  save(`before-${i}.json`,{db,files});stores.push({count,generation:db.store_meta[0].generation,logicalHash:hash(json(db)),artifactsHash:hash(json(files)),selectedArtifacts:golden.artifacts.length,unrelatedBytes:bytes});
 }
 output({stores});
}else if(phase==='operations'){
 const generation=load('generation.json'),runs=[];
 for(const [i,root]of roots.entries())for(const [q,step]of golden.scale.entries()){
  const restore=clock(step.clock),m=measure(),at=performance.now();let result;
  try{result=await updateFixtureReviewCheckpoint({root,schemaVersion:schema,...step.request});}finally{m.restore();restore();}
  const normalized={...result,generation:String(BigInt(result.generation)-BigInt(generation.stores[i].generation))};assert.deepEqual(normalized,step.result);assert.equal(m.m.transactions,result.changed?1:0);assert.equal(m.m.payloadOpens+m.m.payloadReadBytes+m.m.payloadWrites+m.m.corpusScans,0);
  runs.push({count:generation.stores[i].count,q,result,normalizedHash:hash(json(normalized)),...m.m,elapsedMs:performance.now()-at});
  save(`plans-${i}-${q}.json`,m.plans);
 }
 for(let q=0;q<24;q++)for(const name of ['sql','pragmas','rows','metadataOpens','connections','transactions','commits','rollbacks','normalizedHash'])assert.equal(runs[q][name],runs[q+24][name],name);
 assert.equal(runs.filter(r=>r.result.changed).length,24);output({runs});
}else if(phase==='preservation'){
 const operations=load('operations.json'),stores=[];
 for(const [i,root]of roots.entries()){
  const before=load(`before-${i}.json`),after=logical(root),files=artifacts(root),expected=before.db;
  for(const {result:r}of operations.runs.filter(r=>r.count===[10,1000][i]&&r.result.changed)){
   const key=recordKey(r),owner=JSON.stringify([key,r.taskId]);
   const existing=expected.reviews.find(v=>v.owner_key===owner);
   if(!existing){const value=Object.fromEntries(Object.entries(r.checkpoints).map(([n,p])=>[n,p.value]));expected.reviews.push({collection:r.collection,replay_id:r.replayId,fingerprint:r.fingerprint,task:r.taskId,ordinal:r.reviewOrdinal,value:JSON.stringify(value),owner_key:owner});for(const [n,name]of ['claimedAt','examinedAt','completedAt'].entries())expected.properties.push({owner_kind:'review',owner_key:owner,pointer:'/'+name,ordinal:String(n),value:JSON.stringify(value[name]),payload_pointer:null});}
   else{existing.value=null;expected.properties.find(p=>p.owner_kind==='review'&&p.owner_key===owner&&p.pointer==='/examinedAt').value=JSON.stringify(r.checkpoints.examinedAt.value);}
   expected.store_meta[0].generation=String(BigInt(expected.store_meta[0].generation)+1n);
  }
  assert.deepEqual(after,expected);assert.deepEqual(files,before.files);assert.ok(!fs.existsSync(path.join(root,'.manifest.lock')));stores.push({count:[10,1000][i],generation:after.store_meta[0].generation,logicalHash:hash(json(after)),artifactsHash:hash(json(files)),authorizedMutations:12});
 }
 output({stores});
}else throw Error('Unknown phase');

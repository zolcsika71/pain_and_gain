import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {makeFixture} from './replay-combined-analysis-m2e-store.js';
import {completeFixtureScoreReview} from '../../tools/replay-score-review-fixture.js';
import {golden,request,seed,hash,json,logical,artifacts,clock,measure,expectedChange} from './replay-score-review-m2g-helpers.js';
const [phase,schemaText,rText,receipts,...roots]=process.argv.slice(2),schema=Number(schemaText),R=Number(rText),started=performance.now(),cpu=process.cpuUsage();
const save=(name,v)=>fs.writeFileSync(path.join(receipts,name),json(v));
const load=name=>JSON.parse(fs.readFileSync(path.join(receipts,name)));
const schedule=golden.scenarios[golden.scales.find(s=>s.R===R).scenario].steps;
const output=v=>{const result={phase,schema,R,...v,elapsedMs:performance.now()-started,cpu:process.cpuUsage(cpu),maxRssBytes:process.resourceUsage().maxRSS*1024};assert.ok(result.maxRssBytes<=256*1048576);assert.ok(Buffer.byteLength(json(result))<=512*1024);console.log(json(result));};
const qFor=(root,step)=>({root,schemaVersion:schema,replayId:'b'.repeat(24),fingerprint:golden.scoreFingerprints[step.kind],taskId:step.task});
if(phase==='generate'){
 for(const name of ['tests/fixtures/replay-combined-analysis-m2e-recipe.js','tests/fixtures/replay-combined-analysis-m2e-definitions.js','tests/fixtures/replay-combined-analysis-m2e-store.js','tools/replay-logs.js'])assert.equal(hash(fs.readFileSync(new URL('../../'+name,import.meta.url))),golden.sources[name].sha256);
 const stores=[];
 for(const [i,root]of roots.entries()){
  const count=[10,1000][i],f=await makeFixture(schema,'scale',{root,count,large:true});await seed(f,R);f.h.close();
  const db=logical(root),files=artifacts(root);assert.equal(db.records.length,count);assert.equal(db.retired.length,0);assert.equal(db.records.filter(r=>r.status==='pending').length,count-4);assert.equal(db.operations.length,6);assert.equal(db.operation_files.length,12);assert.equal(db.reviews.length,2*R);assert.equal(db.properties.filter(p=>p.owner_kind==='review').length,8*R);assert.equal(db.store_meta[0].generation,'52');
  for(const a of golden.artifactHashes){let p=a.logical;if(!files[p]){const record=f.refs.find(r=>a.logical.startsWith(r.key.fingerprint));p=record.refs.find(r=>r.pointer===a.logical.slice(64)).path;}assert.equal(files[p].bytes,a.bytes);assert.equal(files[p].hash,a.hash);}
  const inodes=new Set();let bytes=0;for(const [j,ref]of f.largeRefs.entries()){const st=files[ref.path];assert.equal(st.bytes,golden.largeHashes[j].bytes);assert.equal(st.hash,golden.largeHashes[j].hash);assert.equal(st.nlink,1);assert.ok(st.blocks*512>=st.bytes);inodes.add(`${st.dev}:${st.ino}`);bytes+=st.bytes;}assert.equal(inodes.size,12);assert.equal(bytes,629145600);
  save(`before-${i}.json`,{db,files});stores.push({count,generation:db.store_meta[0].generation,logicalHash:hash(json(db)),artifactsHash:hash(json(files)),selectedArtifacts:golden.artifactHashes.length,unrelatedBytes:bytes});
 }
 output({stores});
}else if(phase==='operations'){
 const runs=[];
 for(const [i,root]of roots.entries()){let generation=52n;
  for(const [q,step]of schedule.entries()){
   const restore=clock(step.clock),m=measure(),at=performance.now();let result;
   try{result=await completeFixtureScoreReview(qFor(root,step));}finally{m.restore();restore();}
   generation+=step.changed?1n:0n;
   const ordinal=step.checkpoints?String(7+2*Number(step.task.slice(-4))):null;
   assert.deepEqual(result,{collection:'score',replayId:'b'.repeat(24),fingerprint:golden.scoreFingerprints[step.kind],taskId:step.task,changed:step.changed,completionChanged:step.completionChanged,statusChanged:step.statusChanged,recordStatus:step.recordStatus,reviewOrdinal:ordinal,generation:String(generation),checkpoints:step.checkpoints});
   runs.push({count:[10,1000][i],q,result,normalizedHash:hash(json({...result,generation:String(generation-52n)})),...m.m,elapsedMs:performance.now()-at});
   assert.equal(result.generation,String(generation));assert.equal(result.reviewOrdinal,ordinal);assert.deepEqual(result.checkpoints,step.checkpoints);for(const n of ['changed','completionChanged','statusChanged','recordStatus'])assert.equal(result[n],step[n]);
   const traverses=q===0||q===4||(R>1&&(q===1||q===2)),P=traverses?Math.floor(R/128)+1:0;
   assert.equal(m.m.pages,P);assert.equal(m.m.reviewerRows,traverses?R:0);assert.ok(m.m.sql+m.m.pragmas<=128+4*P);assert.ok(m.m.rows<=128+(traverses?R+P:0));assert.equal(m.m.transactions,step.changed?1:0);assert.equal(m.m.rollbacks,0);assert.equal(m.m.payloadOpens+m.m.payloadReadBytes+m.m.payloadWrites+m.m.corpusScans,0);save(`plans-${i}-${q}.json`,m.plans);
  }
 }
 for(let q=0;q<8;q++)for(const n of ['sql','pragmas','statements','rows','pages','reviewerRows','metadataOpens','connections','transactions','commits','rollbacks','normalizedHash'])assert.equal(runs[q][n],runs[q+8][n],n);
 assert.equal(runs.filter(r=>r.result.changed).length,R===1?4:6);assert.equal(runs.reduce((n,r)=>n+r.pages,0),R===1?4:R===128?16:64);output({runs});
}else if(phase==='preservation'){
 const stores=[];
 for(const [i,root]of roots.entries()){
  const before=load(`before-${i}.json`),after=logical(root),files=artifacts(root);let expected=before.db;
  for(const step of schedule)expected=expectedChange(expected,qFor(root,step),step);
  assert.deepEqual(after,expected);assert.deepEqual(files,before.files);assert.equal(after.store_meta[0].generation,R===1?'54':'55');assert.ok(!fs.existsSync(path.join(root,'.manifest.lock')));stores.push({count:[10,1000][i],generation:after.store_meta[0].generation,logicalHash:hash(json(after)),artifactsHash:hash(json(files)),authorizedMutations:R===1?2:3});
 }
 output({stores});
}else throw Error('Unknown phase');

// Small retained fixtures only; never generate the nominal 600 MiB maximum.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as converter from '../../tools/replay-conversion-bounded-fixture.js';
import * as reader from '../../tools/replay-legacy-reader.js';
import {createFixtureStore,openStore} from '../../tools/replay-store.js';
import {iterateDiagnostics} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';
const capacity='backup-sized-synthetic-v1',sha=b=>createHash('sha256').update(b).digest('hex');
const convert=converter.convertFixtureV2Streaming;
const countValues=v=>1+(v&&typeof v==='object'?Object.values(v).reduce((n,x)=>n+countValues(x),0):0);
function inventory(root){const result={};for(const e of fs.readdirSync(root,{withFileTypes:true})){
 const p=path.join(root,e.name);if(e.isDirectory())for(const [k,v]of Object.entries(inventory(p)))result[e.name+'/'+k]=v;
 else result[e.name]=sha(fs.readFileSync(p));}return result;}
async function fixture(t){
 const tmp=fs.realpathSync(os.tmpdir()),sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),
 root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-')),dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const map={arena:{name:'Pain and Gain',season:'backup-capacity-synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]};
 const mapId=mapChecksum(map),mapBytes=Buffer.from(JSON.stringify({...map,checksum:mapId})),replayId='1'.repeat(24),retired=sha('explicit-history');
 fs.writeFileSync(path.join(dir,'map.json'),mapBytes);
 const m={version:2,maps:[{id:mapId,file:'map.json',checksum:mapId,status:'validated'}],replays:[{replayId,mapId,status:'active',retiredFingerprints:[retired]}],records:[],scoreRecords:[],retiredScoreSources:[]};
 let total=mapBytes.length;
 for(const [collection,count]of [['records',2],['scoreRecords',1]])for(let i=0;i<count;i++){
  const outputPath=collection+'-'+i,body=Buffer.alloc(4096,65+i);fs.writeFileSync(path.join(dir,outputPath),body);total+=body.length;
  m[collection].push({replayId,mapId,status:'claim',fingerprint:sha(outputPath),outputPath,outputFingerprint:sha(body),
   reviews:{'synthetic/reviewer':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}},unknown:[null,false,i],
   ...(collection==='records'?{otherEntries:[{key:'1:0',raw:' original\r\n',unknown:[1,null]},{key:'1:0',raw:'second',unknown:false}]}:{kind:'replay-frames',embeddedBuildId:null})});
 }
 const manifest=path.join(dir,'manifest.json'),bytes=Buffer.from(JSON.stringify(m));fs.writeFileSync(manifest,bytes);
 const store=await createFixtureStore({root,filesystem:'local-apfs'});store.close();
 return{root,sourceRoot,dir,manifest,m,total,inputBytes:bytes.length,values:countValues(m),options:{synthetic:true,sourceRoot,root,capacity}};
}
async function verify(f,result){
 assert.equal(result.phase,'verified');assert.equal(result.identity.capacity,capacity);
 assert.equal(result.identity.artifactCommitment.count,4);assert.equal(result.identity.artifacts,undefined);
 const s=await openStore({root:f.root,mode:'read'});
 try{assert.equal(s.getRecord({collection:'log',replayId:f.m.replays[0].replayId,fingerprint:f.m.replays[0].retiredFingerprints[0]}).kind,'retired');
  for(const [collection,records]of [['log',f.m.records],['score',f.m.scoreRecords]])for(const record of records){
   const key={collection,replayId:record.replayId,fingerprint:record.fingerprint};assert.equal(s.getRecord(key).build_id,null);
   assert.equal(sha(fs.readFileSync(path.join(f.root,record.outputPath))),record.outputFingerprint);
   assert.deepEqual(s.getReview(key,'synthetic/reviewer').value,record.reviews['synthetic/reviewer']);
   if(collection==='log')await s.withReadSnapshot({recordKeys:[key]},async view=>{let i=0;for await(const d of iterateDiagnostics(view,key)){assert.equal(d.ordinal,i);assert.deepEqual(d.value,record.otherEntries[i++]);}assert.equal(i,2);});
  }
 }finally{s.close();}
}
test('backup profile reader accepts explicit profile',async t=>{
 const f=await fixture(t);let wrappers=0;
 const result=await reader.readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity},async e=>{
  if(e.diagnostics)for(const item of e.diagnostics.entries()){assert.equal(typeof item.raw,'string');wrappers++;await Promise.resolve();}});
 assert.equal(result.complete,true);assert.equal(wrappers,4);
});
test('backup profile converter accepts explicit profile',async t=>{
 const f=await fixture(t);await verify(f,await convert(f.options));
});
test('backup profile changes exactly three finite maxima and covers measured requirements',()=>{
 assert.deepEqual(reader.legacyBackupDiagnosticLimits,{...reader.legacyExpandedDiagnosticLimits,inputBytes:600*1048576,values:8000000});
 assert.deepEqual(converter.backupStreamingLimits,{...converter.expandedStreamingLimits,inputBytes:600*1048576,values:8000000,totalArtifactBytes:320*1048576});
 for(const v of [reader.legacyBackupDiagnosticLimits,converter.backupStreamingLimits])assert.ok(Object.isFrozen(v));
 assert.ok(converter.backupStreamingLimits.inputBytes>=533731722);
 assert.ok(converter.backupStreamingLimits.values>=5736411);
 assert.ok(converter.backupStreamingLimits.totalArtifactBytes>=244622392);
 assert.equal(converter.expandedStreamingLimits.inputBytes,64*1048576);
 assert.equal(converter.expandedStreamingLimits.totalArtifactBytes,136*1048576);
});
test('backup exact reduced boundaries, bounded I/O, commitments and repeated resume',async t=>{
 const f=await fixture(t),source=inventory(f.sourceRoot),limits={inputBytes:f.inputBytes,values:f.values,totalArtifactBytes:f.total};
 const original={read:fs.readSync,readFile:fs.readFileSync,parse:JSON.parse};let maxRead=0,maxParse=0;
 fs.readSync=(fd,b,o,n,p)=>{maxRead=Math.max(maxRead,n);assert.ok(n<=65536);return original.read(fd,b,o,n,p);};
 fs.readFileSync=(p,...args)=>{assert.notEqual(p,f.manifest);return original.readFile(p,...args);};
 JSON.parse=(text,...args)=>{maxParse=Math.max(maxParse,Buffer.byteLength(String(text)));return original.parse(text,...args);};
 let result;try{result=await convert({...f.options,limits});}finally{fs.readSync=original.read;fs.readFileSync=original.readFile;JSON.parse=original.parse;}
 await verify(f,result);const before=inventory(f.root);assert.equal((await convert({...f.options,limits})).generation,result.generation);assert.deepEqual(inventory(f.root),before);assert.deepEqual(inventory(f.sourceRoot),source);
 assert.ok(maxParse<=65536);t.diagnostic(JSON.stringify({inputBytes:f.inputBytes,values:f.values,totalOriginalBytes:f.total,maxRead,maxParse,fullSizeTested:false}));
});
for(const field of ['inputBytes','values','totalArtifactBytes'])test('backup reduced '+field+' fails before mutation and on verified resume',async t=>{
 const f=await fixture(t),n={inputBytes:f.inputBytes,values:f.values,totalArtifactBytes:f.total}[field],before=inventory(f.root);
 await assert.rejects(convert({...f.options,limits:{[field]:n-1}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(inventory(f.root),before);
 await convert(f.options);const verified=inventory(f.root);await assert.rejects(convert({...f.options,limits:{[field]:n-1}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(inventory(f.root),verified);
});
test('backup cumulative artifact cap includes map plus every log and score',async t=>{
 const f=await fixture(t),individual=fs.readdirSync(f.dir).filter(n=>n!=='manifest.json').map(n=>fs.statSync(path.join(f.dir,n)).size);
 const cap=f.total-1;assert.ok(individual.every(n=>n<cap));const before=inventory(f.root);
 await assert.rejects(convert({...f.options,limits:{totalArtifactBytes:cap}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(inventory(f.root),before);
});
test('backup reader input/value exact boundaries reject one less before callbacks',async t=>{
 const f=await fixture(t);for(const field of ['inputBytes','values']){let callbacks=0;const n=f[field];
  await assert.rejects(reader.readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity,limits:{[field]:n-1}},()=>{callbacks++;}),{code:'RESOURCE_LIMIT'});assert.equal(callbacks,0);
  assert.equal((await reader.readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity,limits:{[field]:n}},()=>{})).complete,true);
 }
});
test('backup finite ceilings, invalid options and wrong API/layout reject',async t=>{
 const f=await fixture(t),before=inventory(f.root);let getters=0;
 for(const field of ['inputBytes','values','totalArtifactBytes'])for(const value of [0,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER,converter.backupStreamingLimits[field]+1])
  await assert.rejects(convert({...f.options,limits:{[field]:value}}),{code:'RESOURCE_LIMIT'});
 for(const field of ['inputBytes','values'])await assert.rejects(reader.readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity,limits:{[field]:reader.legacyBackupDiagnosticLimits[field]+1}},()=>{}),{code:'RESOURCE_LIMIT'});
 for(const o of [Object.defineProperty({...f.options},'capacity',{get(){getters++;return capacity;}}),
  {...f.options,limits:Object.defineProperty({},'totalArtifactBytes',{get(){getters++;return Infinity;}})},Object.assign(Object.create({capacity}),f.options),{...f.options,capacity:'backup-sized-synthetic-v2'}])await assert.rejects(convert(o),{code:'UNSUPPORTED_FIXTURE'});
 await assert.rejects(converter.convertFixtureV2Bounded(f.options),{code:'UNSUPPORTED_FIXTURE'});
 await assert.rejects(reader.readFixtureV2Members({synthetic:true,root:f.sourceRoot,capacity},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
 await assert.rejects(reader.readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity,layout:'conversion'},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
 assert.equal(getters,0);assert.deepEqual(inventory(f.root),before);
});
test('backup options snapshot survives callback mutation with awaited processing',async t=>{
 const f=await fixture(t),o={...f.options,limits:{inputBytes:f.inputBytes,values:f.values,totalArtifactBytes:f.total}};let hit=false;
 o.fault=async point=>{if(point==='input-member'&&!hit){hit=true;o.capacity='invalid';o.root='/invalid';o.sourceRoot='/invalid';o.limits.inputBytes=1;o.limits.values=1;o.limits.totalArtifactBytes=Infinity;await Promise.resolve();}};
 await verify(f,await convert(o));assert.ok(hit);
 const opts={synthetic:true,root:f.sourceRoot,capacity,limits:{inputBytes:f.inputBytes,values:f.values}};let callbacks=0;
 await reader.readFixtureV2DiagnosticMembers(opts,async()=>{opts.root='/invalid';opts.capacity='invalid';opts.limits.values=Infinity;callbacks++;await Promise.resolve();});assert.ok(callbacks>0);
});
for(const point of ['after-prepare','after-reserve','after-payload','before-verified'])test('backup interruption '+point+' retains budgets and resumes',async t=>{
 const f=await fixture(t),error=Object.assign(Error('retained interruption'),{code:'EIO'});let hit=false;
 await assert.rejects(convert({...f.options,fault:p=>{if(!hit&&p===point){hit=true;throw error;}}}),e=>e===error);assert.ok(hit);
 const before=inventory(f.root);await assert.rejects(convert({...f.options,limits:{totalArtifactBytes:f.total-1}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(inventory(f.root),before);
 const r=await convert(f.options);await verify(f,r);assert.equal((await convert(f.options)).generation,r.generation);
});
for(const previous of [undefined,'expanded-synthetic-v1'])test('backup profile cannot cross-resume '+String(previous),async t=>{
 for(const [from,to]of [[previous,capacity],[capacity,previous]]){const f=await fixture(t);await convert({...f.options,capacity:from});const before=inventory(f.root);await assert.rejects(convert({...f.options,capacity:to}),{code:'SOURCE_CONFLICT'});assert.deepEqual(inventory(f.root),before);}
});
test('backup changed input during copying cannot verify or resume',async t=>{
 const f=await fixture(t);let hit=false;
 await assert.rejects(convert({...f.options,fault:p=>{if(!hit&&p==='after-output'){hit=true;fs.appendFileSync(f.manifest,' ');}}}),{code:'CHANGED_INPUT'});assert.ok(hit);
 const before=inventory(f.root);await assert.rejects(convert(f.options),{code:'SOURCE_CONFLICT'});assert.deepEqual(inventory(f.root),before);
});

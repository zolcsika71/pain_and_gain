import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {convertFixtureV2Streaming as convert,convertFixtureV2Bounded,expandedStreamingLimits} from '../../tools/replay-conversion-bounded-fixture.js';
import {readFixtureV2DiagnosticMembers,readFixtureV2Members} from '../../tools/replay-legacy-reader.js';
import {createFixtureStore,openStore,recordOwner,recordKey} from '../../tools/replay-store.js';
import {iterateDiagnostics} from '../../tools/replay-store-payloads.js';import {mapChecksum} from '../../tools/replay-logs.js';
const capacity='expanded-synthetic-v1',tmp=fs.realpathSync(os.tmpdir()),sha=b=>createHash('sha256').update(b).digest('hex');
function hashFile(file){const fd=fs.openSync(file,'r'),h=createHash('sha256'),b=Buffer.alloc(65536);try{for(;;){const n=fs.readSync(fd,b,0,b.length,null);if(!n)break;h.update(b.subarray(0,n));}}finally{fs.closeSync(fd);}return h.digest('hex');}
function inventory(root){const out={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else out[path.relative(root,p)]=hashFile(p);}}walk(root);return out;}
async function fixture(t,{logs=1,scores=1,maps=1,wrappers=2,rawBytes=20}={}){
 const sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-')),dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const mapRows=[];for(let i=0;i<maps;i++){const map={arena:{name:'Pain and Gain',season:'capacity-'+i,level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]},id=mapChecksum(map),file='map-'+i+'.json';fs.writeFileSync(path.join(dir,file),JSON.stringify({...map,checksum:id}));mapRows.push({id,checksum:id,file,status:'validated',unknown:null});}
 const replay=i=>({replayId:(i+1).toString(16).padStart(24,'0'),mapId:mapRows[i].id,buildId:'c'.repeat(64),status:'active',unknown:false});
 const wrapper=(i,j)=>({key:'1:'+j%2,raw:' '+i+':'+j+' '+ 'x'.repeat(rawBytes)+'\r\n',unknown:{nil:null,no:false,order:[j,'árvíz']}});
 const record=(collection,i)=>{const r=replay(i%maps),outputPath=collection+'-'+i+'.original',body=JSON.stringify({synthetic:collection,i})+'\n';return {replayId:r.replayId,mapId:r.mapId,buildId:r.buildId,status:'claim',owner:'synthetic',fingerprint:sha(collection+':'+i),outputPath,outputFingerprint:sha(body),reviews:{'synthetic/reviewer':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:{no:false,zero:0}}},unknown:[null,false,i],...(collection==='score'?{kind:'replay-frames'}:{otherEntries:null})};};
 for(const [collection,n]of [['log',logs],['score',scores]])for(let i=0;i<n;i++)fs.writeFileSync(path.join(dir,collection+'-'+i+'.original'),JSON.stringify({synthetic:collection,i})+'\n');
 const manifest=path.join(dir,'manifest.json'),fd=fs.openSync(manifest,'wx');
 try{fs.writeSync(fd,'{"version":2,"unknown":null,"maps":[');for(let i=0;i<maps;i++)fs.writeSync(fd,(i?',':'')+JSON.stringify(mapRows[i]));fs.writeSync(fd,'],"replays":[');for(let i=0;i<maps;i++)fs.writeSync(fd,(i?',':'')+JSON.stringify(replay(i)));fs.writeSync(fd,'],"records":[');
  for(let i=0;i<logs;i++){const r=record('log',i);delete r.otherEntries;fs.writeSync(fd,(i?',':'')+JSON.stringify(r).slice(0,-1)+',"otherEntries":[');for(let j=0;j<wrappers;j++)fs.writeSync(fd,(j?',':'')+JSON.stringify(wrapper(i,j)));fs.writeSync(fd,']}');}
  fs.writeSync(fd,'],"scoreRecords":[');for(let i=0;i<scores;i++)fs.writeSync(fd,(i?',':'')+JSON.stringify(record('score',i)));fs.writeSync(fd,'],"retiredScoreSources":[]}');
 }finally{fs.closeSync(fd);}
 const s=await createFixtureStore({root,filesystem:'local-apfs'});s.close();
 return {root,sourceRoot,dir,manifest,logs,scores,maps,wrappers,wrapper,record,mapRows,replay,options:{synthetic:true,sourceRoot,root,capacity}};
}
async function verify(f,result){
 assert.equal(result.phase,'verified');assert.deepEqual(result.counts,{maps:f.maps,replays:f.maps,records:f.logs,scoreRecords:f.scores,retiredScoreSources:0});
 assert.equal(result.identity.capacity,capacity);assert.equal(result.identity.artifactCommitment.count,f.maps+f.logs+f.scores);assert.equal(result.identity.artifacts,undefined);
 const s=await openStore({root:f.root,mode:'read'});
 try{
  for(const [collection,n]of [['log',f.logs],['score',f.scores]])for(let i=0;i<n;i++){
   const expected=f.record(collection,i),k={collection,replayId:expected.replayId,fingerprint:expected.fingerprint},reviewOwner={kind:'review',key:JSON.stringify([recordKey(k),'synthetic/reviewer'])};assert.equal(s.getRecord(k).ordinal,i);
   const restored={};for(const p of s.pageProperties(recordOwner(k)).rows){if(p.pointer==='/otherEntries'){assert.equal(p.payload_pointer,'/otherEntries');restored.otherEntries=null;}else restored[p.pointer.slice(1)]=JSON.parse(p.value);}
   restored.reviews={'synthetic/reviewer':Object.fromEntries(s.pageProperties(reviewOwner).rows.map(p=>[p.pointer.slice(1),JSON.parse(p.value)]))};assert.equal(JSON.stringify(restored),JSON.stringify(expected));
   await s.withReadSnapshot({recordKeys:[k]},async view=>{if(collection==='log'){let j=0;for await(const d of iterateDiagnostics(view,k)){assert.equal(d.ordinal,j);assert.deepEqual(d.value,f.wrapper(i,j++));}assert.equal(j,f.wrappers);}});
   assert.equal(hashFile(path.join(f.root,expected.outputPath)),hashFile(path.join(f.dir,expected.outputPath)));
  }
  for(let i=0;i<f.maps;i++){assert.equal(s.getMap(f.mapRows[i].id).ordinal,i);assert.equal(s.getReplay(f.replay(i).replayId).ordinal,i);assert.equal(hashFile(path.join(f.root,f.mapRows[i].file)),hashFile(path.join(f.dir,f.mapRows[i].file)));}
 }finally{s.close();}
}
async function measured(f){
 const native={parse:JSON.parse,read:fs.readSync,readFile:fs.readFileSync};let maxParse=0,maxRead=0,heap=0,rss=0,callbacks=0;
 JSON.parse=(s,...args)=>{maxParse=Math.max(maxParse,Buffer.byteLength(String(s)));assert.ok(maxParse<=65536,'bounded fixture parse');return native.parse(s,...args);};
 fs.readSync=(fd,b,o,n,p)=>{maxRead=Math.max(maxRead,n);assert.ok(n<=65536,'bounded fixture read');return native.read(fd,b,o,n,p);};
 fs.readFileSync=(p,...args)=>{assert.notEqual(p,f.manifest,'no whole manifest read');return native.readFile(p,...args);};
 const start=performance.now();let result;try{result=await convert({...f.options,fault:async()=>{callbacks++;const m=process.memoryUsage();heap=Math.max(heap,m.heapUsed);rss=Math.max(rss,m.rss);await Promise.resolve();}});}finally{JSON.parse=native.parse;fs.readSync=native.read;fs.readFileSync=native.readFile;}
 return {result,measurement:{inputBytes:fs.statSync(f.manifest).size,maxParse,maxRead,sampledHeap:heap,sampledRss:rss,callbacks,elapsedMs:performance.now()-start}};
}
test('capacity bytes exceeds old input and diagnostic limits',async t=>{
 const f=await fixture(t,{logs:2,scores:1,wrappers:600,rawBytes:16384}),source=inventory(f.sourceRoot),dest=inventory(f.root);assert.ok(fs.statSync(f.manifest).size>16*1048576);
 await assert.rejects(convert({...f.options,capacity:undefined}),{code:'RESOURCE_LIMIT'});assert.deepEqual(inventory(f.root),dest);
 const {result,measurement}=await measured(f);await verify(f,result);assert.deepEqual(inventory(f.sourceRoot),source);t.diagnostic(JSON.stringify(measurement));
});
test('capacity inventory exercises 291 logs 95 scores 45 maps and replays',async t=>{
 const f=await fixture(t,{logs:291,scores:95,maps:45}),source=inventory(f.sourceRoot);
 const {result,measurement}=await measured(f);await verify(f,result);const before=inventory(f.root),again=await convert(f.options);assert.equal(again.generation,result.generation);assert.deepEqual(inventory(f.root),before);assert.deepEqual(inventory(f.sourceRoot),source);t.diagnostic(JSON.stringify(measurement));
});
for(const field of ['inputBytes','diagnosticBytes','diagnosticItems','wrapperBytes','scalarBytes','records','scoreRecords','maps','replays','values','elapsedMs','heapBytes','rssBytes'])test('capacity small rejects reduced '+field,async t=>{
 const f=await fixture(t,{logs:2,scores:2,maps:2}),before=inventory(f.root);await assert.rejects(convert({...f.options,limits:{[field]:1}}),{code:'RESOURCE_LIMIT'});assert.deepEqual(inventory(f.root),before);
});
for(const kind of ['unknown','accessor','nested-accessor','inherited','infinite','wrong-api','wrong-layout'])test('capacity small invalid options '+kind,async t=>{
 const f=await fixture(t),before=inventory(f.root),o={...f.options};let getters=0;
 if(kind==='unknown')o.capacity='production';if(kind==='accessor')Object.defineProperty(o,'capacity',{get(){getters++;return capacity;}});
 if(kind==='nested-accessor')o.limits=Object.defineProperty({},'inputBytes',{get(){getters++;return Infinity;}});
 if(kind==='inherited')Object.setPrototypeOf(o,{capacity});if(kind==='infinite')o.limits={inputBytes:Infinity};
 await assert.rejects(kind==='wrong-api'?convertFixtureV2Bounded(o):kind==='wrong-layout'?readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity,layout:'conversion'},()=>{}):convert(o));assert.equal(getters,0);assert.deepEqual(inventory(f.root),before);
});
test('capacity small immutable options and awaited reader callbacks',async t=>{
 const f=await fixture(t,{logs:9}),o={...f.options,limits:{records:9}};let hit=false;
 o.fault=async n=>{if(n==='input-member'&&!hit){hit=true;o.limits.records=1;o.sourceRoot='/invalid';o.root='/invalid';o.capacity='bad';await Promise.resolve();}};
 const r=await convert(o);await verify(f,r);
 const ro={synthetic:true,root:f.sourceRoot,capacity,limits:{diagnosticItems:2}};let count=0;await readFixtureV2DiagnosticMembers(ro,async e=>{ro.root='/invalid';ro.capacity='bad';ro.limits.diagnosticItems=Infinity;if(e.diagnostics)for(const w of e.diagnostics.entries()){assert.equal(typeof w.raw,'string');count++;await Promise.resolve();}});assert.equal(count,18);
 await assert.rejects(readFixtureV2Members({synthetic:true,root:f.sourceRoot,capacity},()=>{}));
});
test('capacity small finite ceilings and exact wrapper boundary',async t=>{
 const f=await fixture(t,{wrappers:8192,rawBytes:1}),before=inventory(f.root);
 for(const k of ['inputBytes','diagnosticBytes','diagnosticItems','records','scoreRecords','maps','replays','values','elapsedMs'])
  await assert.rejects(convert({...f.options,limits:{[k]:expandedStreamingLimits[k]+1}}),{code:'RESOURCE_LIMIT'});
 await assert.rejects(readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot},()=>{}),{code:'RESOURCE_LIMIT'});
 await assert.rejects(readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity,limits:{diagnosticItems:8191}},()=>{}),{code:'RESOURCE_LIMIT'});
 let count=0;const result=await readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,capacity},async e=>{if(e.diagnostics)for(const w of e.diagnostics.entries()){assert.deepEqual(w,f.wrapper(0,count++));await Promise.resolve();}});
 assert.equal(result.complete,true);assert.equal(count,8192);assert.deepEqual(inventory(f.root),before);
});
test('capacity small profile commitment prevents cross-mode resume',async t=>{
 const f=await fixture(t);await convert(f.options);const before=inventory(f.root);
 await assert.rejects(convert({...f.options,capacity:undefined}),{code:'SOURCE_CONFLICT'});assert.deepEqual(inventory(f.root),before);
 const g=await fixture(t);await convert({...g.options,capacity:undefined});const saved=inventory(g.root);
 await assert.rejects(convert(g.options),{code:'SOURCE_CONFLICT'});assert.deepEqual(inventory(g.root),saved);
});
for(const point of ['after-prepare','after-reserve','after-payload','after-record-checkpoint','before-verified'])test('capacity small interrupted '+point,async t=>{
 const f=await fixture(t,{logs:9}),e=Object.assign(Error('retained interruption'),{code:'EIO'});let hit=false;await assert.rejects(convert({...f.options,fault:n=>{if(n===point&&!hit){hit=true;throw e;}}}),x=>x===e);assert.ok(hit);const r=await convert(f.options);await verify(f,r);assert.equal((await convert(f.options)).generation,r.generation);
});
test('capacity small changed input and artifact commitments reject',async t=>{
 const f=await fixture(t);await convert(f.options);const before=inventory(f.root);fs.appendFileSync(path.join(f.dir,'log-0.original'),'changed');await assert.rejects(convert(f.options),{code:'INVALID_ARTIFACT'});assert.deepEqual(inventory(f.root),before);
 const g=await fixture(t);let hit=false;await assert.rejects(convert({...g.options,fault:n=>{if(n==='after-reserve'&&!hit){hit=true;fs.appendFileSync(g.manifest,' ');}}}),{code:'CHANGED_INPUT'});const saved=inventory(g.root);await assert.rejects(convert(g.options),{code:'SOURCE_CONFLICT'});assert.deepEqual(inventory(g.root),saved);
});

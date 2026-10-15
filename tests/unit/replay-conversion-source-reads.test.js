// Retained small synthetic inputs only. Converter-only counters exclude setup/assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {convertFixtureV2Streaming,convertFixtureV2Bounded} from '../../tools/replay-conversion-bounded-fixture.js';
import {conversionFixtureInternals as h} from '../../tools/replay-conversion-fixture.js';
import {createFixtureStore,openStore} from '../../tools/replay-store.js';
import {iterateDiagnostics} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),fixedTime=new Date('2026-01-01T00:00:00.000Z');
async function fixture(t,n=2,capacity='backup-sized-synthetic-v1'){
 const tmp=fs.realpathSync(os.tmpdir()),sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
 t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));const dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const map={arena:{name:'Pain and Gain',season:'source-reads-synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]},mapId=mapChecksum(map),replayId='1'.repeat(24);
 fs.writeFileSync(path.join(dir,'map.json'),JSON.stringify({...map,checksum:mapId}));
 const m={version:2,maps:[{id:mapId,file:'map.json',checksum:mapId,status:'validated'}],replays:[{replayId,mapId,status:'active',retiredFingerprints:[sha('history')]}],records:[],scoreRecords:[],retiredScoreSources:[],unknown:'ROOT-A'};
 for(const [collection,count]of [['records',n],['scoreRecords',1]])for(let i=0;i<count;i++){
  const outputPath=collection+'-'+i,body=Buffer.from('synthetic original '+outputPath);fs.writeFileSync(path.join(dir,outputPath),body);
  m[collection].push({replayId,mapId,status:'claim',fingerprint:sha(outputPath),outputPath,outputFingerprint:sha(body),reviews:{'synthetic/source':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}},unknown:'META-A',
   ...(collection==='records'?{otherEntries:[{key:'same',raw:'RAW-A'+'.'.repeat(256),unknown:[false,null,i]},{key:'same',raw:'RAW-B',unknown:true}]}:{kind:'replay-frames',embeddedBuildId:null})});
 }
 const manifest=path.join(dir,'manifest.json'),bytes=Buffer.from(JSON.stringify(m));fs.writeFileSync(manifest,bytes);fs.utimesSync(manifest,fixedTime,fixedTime);
 const s=await createFixtureStore({root,filesystem:'local-apfs'}),db=s.databasePath; s.close();
 const descriptor=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 return{sourceRoot,root,dir,manifest,bytes,m,db:db??path.join(root,descriptor.database),options:{synthetic:true,sourceRoot,root,...(capacity?{capacity}:{})}};
}
function inventory(root){const out={};for(const e of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isDirectory())for(const [k,v]of Object.entries(inventory(p)))out[e.name+'/'+k]=v;else out[e.name]=sha(fs.readFileSync(p));}return out;}
async function measure(f,fn){
 const original={open:fs.openSync,read:fs.readSync,close:fs.closeSync},fds=new Map(),m={manifestBytes:f.bytes.length,manifestHashBytes:0,manifestReaderBytes:0,sourceArtifactBytes:0,destinationBytes:0,otherBytes:0,fullHashes:0,maxRead:0};
 fs.openSync=(p,...a)=>{const stack=new Error().stack,fd=original.open(p,...a);fds.set(fd,{path:String(p),hash:stack.includes('at chunks ('),bytes:0,start:null});return fd;};
 fs.readSync=(fd,b,o,n,pos)=>{const got=original.read(fd,b,o,n,pos),entry=fds.get(fd);m.maxRead=Math.max(m.maxRead,n);if(entry){entry.start??=pos;entry.bytes+=got;const key=entry.path===f.manifest?(entry.hash?'manifestHashBytes':'manifestReaderBytes'):entry.path.startsWith(f.dir+'/')?'sourceArtifactBytes':entry.path.startsWith(f.root+'/')?'destinationBytes':'otherBytes';m[key]+=got;}return got;};
 fs.closeSync=fd=>{const e=fds.get(fd);if(e?.path===f.manifest&&e.hash&&e.start===0&&e.bytes===f.bytes.length)m.fullHashes++;fds.delete(fd);return original.close(fd);};
 try{const result=await fn();return{result,counters:m};}finally{fs.openSync=original.open;fs.readSync=original.read;fs.closeSync=original.close;}
}
async function verify(f){const s=await openStore({root:f.root,mode:'read'});try{
 assert.deepEqual(s.entityCounts(),{collections:5,maps:1,replays:1,records:f.m.records.length+1,reviews:f.m.records.length+1,retired:1});
 for(const [collection,records]of [['log',f.m.records],['score',f.m.scoreRecords]])for(const r of records){const key={collection,replayId:r.replayId,fingerprint:r.fingerprint};assert.equal(s.getRecord(key).build_id,null);assert.deepEqual(s.getReview(key,'synthetic/source').value,r.reviews['synthetic/source']);assert.equal(sha(fs.readFileSync(path.join(f.root,r.outputPath))),r.outputFingerprint);
  if(collection==='log')await s.withReadSnapshot({recordKeys:[key]},async view=>{let i=0;for await(const d of iterateDiagnostics(view,key)){assert.equal(d.ordinal,i);assert.deepEqual(d.value,r.otherEntries[i++]);}assert.equal(i,r.otherEntries.length);});
 }
}finally{s.close();}}
function mutate(f,from,to){const bytes=fs.readFileSync(f.manifest);assert.equal(from.length,to.length);const at=bytes.indexOf(from);assert.ok(at>=0);Buffer.from(to).copy(bytes,at);fs.writeFileSync(f.manifest,bytes);fs.utimesSync(f.manifest,fixedTime,fixedTime);}
async function checkpoint(f){const s=await openStore({root:f.root,mode:'read'});try{return s.pageProperties({kind:'root',key:'root'}).rows.find(r=>r.pointer==='/boundedFixtureConversionV1')?.value;}finally{s.close();}}
for(const count of [1,8,32])test('source read amplification '+count,async t=>{
 const f=await fixture(t,count),first=await measure(f,()=>convertFixtureV2Streaming(f.options));await verify(f);const before=inventory(f.root);
 const resume=await measure(f,()=>convertFixtureV2Streaming(f.options));assert.equal(resume.result.generation,first.result.generation);assert.deepEqual(inventory(f.root),before);await verify(f);
 t.diagnostic(JSON.stringify({measurement:true,count,conversion:first.counters,resume:resume.counters,harnessExcluded:true,nativeSqliteExcluded:true}));
 assert.ok(first.counters.fullHashes<=14,JSON.stringify(first.counters));assert.ok(resume.counters.fullHashes<=12,JSON.stringify(resume.counters));
 assert.ok(first.counters.manifestHashBytes<=24*f.bytes.length);assert.ok(resume.counters.manifestHashBytes<=20*f.bytes.length);assert.equal(first.result.phase,'verified');
});
for(const point of ['before-prepare','before-map','after-map','after-replay-checkpoint','before-reserve','after-reserve','after-output','after-payload','before-record-checkpoint','after-record-checkpoint','before-verified','after-verified'])test('source content mutation at '+point,async t=>{
 const f=await fixture(t);let hit=false;await assert.rejects(convertFixtureV2Streaming({...f.options,fault:p=>{if(!hit&&p===point){hit=true;mutate(f,point.includes('map')?'validated':'RAW-A',point.includes('map')?'validaTed':'RAW-X');}}}),e=>['CHANGED_INPUT','SOURCE_CONFLICT','INVALID_ARTIFACT'].includes(e.code));assert.ok(hit);
 const saved=await checkpoint(f);if(point!=='after-verified')assert.notEqual(saved&&JSON.parse(saved).phase,'verified');
 const before=inventory(f.root);await assert.rejects(convertFixtureV2Streaming(f.options));assert.deepEqual(inventory(f.root),before);
});
for(const mode of ['same-length','replace','truncated','marker'])test('source changed resume '+mode,async t=>{
 const f=await fixture(t);await convertFixtureV2Streaming(f.options);const before=inventory(f.root);
 if(mode==='same-length')mutate(f,'ROOT-A','ROOT-X');else if(mode==='replace'){fs.renameSync(f.manifest,f.manifest+'.retained-original');fs.writeFileSync(f.manifest,f.bytes);fs.utimesSync(f.manifest,fixedTime,fixedTime);}else if(mode==='truncated')fs.truncateSync(f.manifest,f.bytes.length-1);else fs.appendFileSync(path.join(f.sourceRoot,'.replay-v2-reader-fixture.json'),' ');
 await assert.rejects(convertFixtureV2Streaming(f.options));assert.deepEqual(inventory(f.root),before);
});
for(const point of ['after-prepare','after-reserve','after-payload','after-record-checkpoint'])test('source checks interrupted recovery '+point,async t=>{
 const f=await fixture(t),error=Object.assign(Error('synthetic interruption'),{code:'EIO'});let hit=false;await assert.rejects(convertFixtureV2Streaming({...f.options,fault:p=>{if(!hit&&p===point){hit=true;throw error;}}}),e=>e===error);assert.ok(hit);
 await convertFixtureV2Streaming(f.options);await verify(f);const before=inventory(f.root);await convertFixtureV2Streaming(f.options);assert.deepEqual(inventory(f.root),before);
});
for(const type of ['commitment','payload','diagnostic'])test('source checks reject corrupt '+type,async t=>{
 const f=await fixture(t);await convertFixtureV2Streaming(f.options);
 if(type==='payload'){fs.appendFileSync(path.join(f.root,f.m.records[0].outputPath),'corrupt');}
 else{const db=new DatabaseSync(f.db);try{if(type==='diagnostic'){const row=db.prepare('SELECT path FROM payloads WHERE role=? LIMIT 1').get('diagnostics');fs.appendFileSync(path.join(f.root,row.path),'corrupt');}
  else{const row=db.prepare('SELECT value FROM properties WHERE owner_kind=? AND pointer=?').get('root','/boundedFixtureConversionV1'),state=JSON.parse(row.value);state.identity.artifactCommitment.expectedHash='f'.repeat(64);db.prepare('UPDATE properties SET value=? WHERE owner_kind=? AND pointer=?').run(JSON.stringify(state),'root','/boundedFixtureConversionV1');}}finally{db.close();}}
 const before=inventory(f.root);await assert.rejects(convertFixtureV2Streaming(f.options));assert.deepEqual(inventory(f.root),before);
});
for(const profile of [null,'expanded-synthetic-v1'])test('source checks existing profile '+String(profile),async t=>{const f=await fixture(t,2,profile);await convertFixtureV2Streaming(f.options);await verify(f);});
test('source checks bounded converter remains supported',async t=>{const f=await fixture(t,2,null);await convertFixtureV2Bounded(f.options);await verify(f);});
test('range hashing preserves descriptor operation and cleanup errors',async t=>{
 const f=await fixture(t),read=fs.readSync,close=fs.closeSync,primary=Object.assign(Error('synthetic read'),{code:'EIO'}),cleanup=Object.assign(Error('synthetic close'),{code:'ENOSPC'});let injected=false;
 fs.readSync=()=>{throw primary;};fs.closeSync=fd=>{close(fd);injected=true;throw cleanup;};try{assert.throws(()=>h.fingerprint(f.manifest,()=>{},f.bytes.length,{start:0,end:8}),e=>e===primary&&e.code==='EIO'&&e.cleanupFailures?.some(v=>v.systemCode==='ENOSPC'));}finally{fs.readSync=read;fs.closeSync=close;}assert.ok(injected);
});
test('range hashing validates intervals and retains whole input cap',async t=>{
 const f=await fixture(t);for(const range of [{start:-1,end:2},{start:3,end:2},{start:0,end:f.bytes.length+1},{start:Infinity,end:8},{start:0.5,end:8}])assert.throws(()=>h.fingerprint(f.manifest,()=>{},f.bytes.length,range),{code:'RESOURCE_LIMIT'});
 assert.throws(()=>h.fingerprint(f.manifest,()=>{},f.bytes.length-1,{start:0,end:8}),{code:'RESOURCE_LIMIT'});
 assert.deepEqual(h.fingerprint(f.manifest,()=>{},f.bytes.length,{start:3,end:11}),{expectedBytes:8,expectedHash:sha(f.bytes.subarray(3,11))});
});
for(const target of ['earlier-root','future-record','replacement'])test('member boundary detects '+target,async t=>{
 const f=await fixture(t);let hit=false;await assert.rejects(convertFixtureV2Streaming({...f.options,fault:p=>{if(!hit&&p==='before-record-checkpoint'){
  hit=true;if(target==='earlier-root')mutate(f,'ROOT-A','ROOT-X');
  else if(target==='future-record'){const bytes=fs.readFileSync(f.manifest),at=bytes.indexOf('RAW-A',bytes.indexOf('RAW-A')+5);assert.ok(at>0);Buffer.from('RAW-X').copy(bytes,at);fs.writeFileSync(f.manifest,bytes);fs.utimesSync(f.manifest,fixedTime,fixedTime);}
  else{fs.renameSync(f.manifest,f.manifest+'.retained-original');fs.writeFileSync(f.manifest,f.bytes);fs.utimesSync(f.manifest,fixedTime,fixedTime);}
 }}}),e=>['CHANGED_INPUT','INVALID_ARTIFACT'].includes(e.code));assert.ok(hit);assert.notEqual(JSON.parse(await checkpoint(f)).phase,'verified');
});

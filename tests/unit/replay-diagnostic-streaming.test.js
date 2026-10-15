import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFixtureV2DiagnosticMembers,readFixtureV2Members} from '../../tools/replay-legacy-reader.js';
import {convertFixtureV2Streaming as convert,convertFixtureV2Bounded} from '../../tools/replay-conversion-bounded-fixture.js';
import {createFixtureStore,openStore,recordOwner,recordKey} from '../../tools/replay-store.js';
import {iterateDiagnostics,streamOriginalValue,diagnosticChunks,digestChunks} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';

const tmp=fs.realpathSync(os.tmpdir()),sha=b=>createHash('sha256').update(b).digest('hex');
function hashFile(p){const fd=fs.openSync(p,'r'),h=createHash('sha256'),b=Buffer.alloc(65536);try{for(;;){const n=fs.readSync(fd,b,0,b.length,null);if(!n)break;h.update(b.subarray(0,n));}return h.digest('hex');}finally{fs.closeSync(fd);}}
function files(root){const out={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else out[path.relative(root,q)]=hashFile(q);}}walk(root);return out;}
async function fixture(t,{count=160,rawLength=8192}={}){
 const sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-v2-reader-fixture-')),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
 t.diagnostic(JSON.stringify({sourceRoot,root,synthetic:true,retained:true}));
 fs.writeFileSync(path.join(sourceRoot,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
 const dir=path.join(sourceRoot,'replay_logs');fs.mkdirSync(dir);
 const map={arena:{name:'Pain and Gain',season:'streaming-synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]},mapId=mapChecksum(map);
 fs.writeFileSync(path.join(dir,'map.json'),JSON.stringify({...map,checksum:mapId}));
 const replayId='1'.repeat(24),buildId='c'.repeat(64),reviews={'synthetic/owner':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false},'synthetic/second':{claimedAt:'original',examinedAt:null,completedAt:null,large:'x'.repeat(17000)}};
 const logBody=Buffer.from(' {"synthetic":true}\n'),scoreBody=Buffer.from('{"synthetic":"score"}');
 fs.writeFileSync(path.join(dir,'log.original'),logBody);fs.writeFileSync(path.join(dir,'score.original'),scoreBody);
 const common={replayId,mapId,buildId,status:'claim',owner:'synthetic',reviews,conflicts:[{unknown:null}]};
 const record={...common,fingerprint:'2'.repeat(64),outputPath:'log.original',outputFingerprint:sha(logBody),unknown:{no:false,n:null,list:[1,'x']}};
 const score={...common,fingerprint:'3'.repeat(64),outputPath:'score.original',outputFingerprint:sha(scoreBody),kind:'replay-frames'};
 const prefix=JSON.stringify({version:2,maps:[{id:mapId,checksum:mapId,file:'map.json',status:'validated'}],replays:[{replayId,mapId,buildId,status:'active'}],unknown:null}).slice(0,-1)+',"records":['+JSON.stringify(record).slice(0,-1)+',"otherEntries":[';
 const tail='],"after":null}],"scoreRecords":['+JSON.stringify(score)+'],"retiredScoreSources":[]}';
 const wrapper=i=>({key:'1:'+i%3,raw:' \t'+String(i)+' '+ 'x'.repeat(rawLength)+'\r\n',unknown:{nil:null,no:false,zero:0,text:'árvíz',order:[i,true]}});
 const manifest=path.join(dir,'manifest.json');
 const save=(transform=w=>JSON.stringify(w))=>{const fd=fs.openSync(manifest,'w');try{fs.writeSync(fd,prefix);for(let i=0;i<count;i++){if(i)fs.writeSync(fd,',');fs.writeSync(fd,transform(wrapper(i),i));}fs.writeSync(fd,tail);}finally{fs.closeSync(fd);}};save();
 const store=await createFixtureStore({root,filesystem:'local-apfs'});store.close();
 return{sourceRoot,root,dir,manifest,count,wrapper,save,record,score,options:{synthetic:true,sourceRoot,root},key:{collection:'log',replayId,fingerprint:record.fingerprint}};
}
async function mutate(f,fn){const d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,d.database));try{return fn(db);}finally{db.close();}}
async function verify(f,result){
 assert.equal(result.phase,'verified');const store=await openStore({root:f.root,mode:'read'});
 try{await store.withReadSnapshot({recordKeys:[f.key],reviewKeys:Object.keys(f.record.reviews).map(taskId=>({recordKey:f.key,taskId}))},async view=>{
  let count=0;for await(const e of iterateDiagnostics(view,f.key)){assert.equal(e.ordinal,count);assert.deepEqual(e.value,f.wrapper(count++));}assert.equal(count,f.count);
  const expected=digestChunks(diagnosticChunks((function*(){for(let i=0;i<f.count;i++)yield f.wrapper(i);})())),ref=view.diagnostics(f.key);
  assert.equal(ref.items,f.count);assert.equal(ref.hash,expected.expectedHash);assert.equal(ref.bytes,expected.expectedBytes);assert.equal(hashFile(path.join(f.root,ref.path)),ref.hash);
  const restored={};for(const p of store.pageProperties(recordOwner(f.key)).rows){const name=p.pointer.slice(1);if(name==='otherEntries'){assert.equal(p.payload_pointer,'/otherEntries');continue;}
   if(name==='reviews'){restored.reviews={};for(const task of Object.keys(f.record.reviews)){const owner={kind:'review',key:JSON.stringify([recordKey(f.key),task])},v={};for(const q of store.pageProperties(owner).rows){if(q.payload_pointer){const chunks=[];await streamOriginalValue(view,view.payload(owner,q.pointer),b=>chunks.push(b));v[q.pointer.slice(1)]=JSON.parse(Buffer.concat(chunks));}else v[q.pointer.slice(1)]=JSON.parse(q.value);}restored.reviews[task]=v;}}
   else restored[name]=JSON.parse(p.value);
  }assert.equal(JSON.stringify(restored),JSON.stringify({...f.record,after:null}));
 });for(const a of result.identity.artifacts)assert.equal(hashFile(path.join(f.root,a.path)),hashFile(path.join(f.dir,a.path)));}finally{store.close();}
}

test('stream >1MiB diagnostics without whole-record parsing; downstream exact preservation and repeat',async t=>{
 const f=await fixture(t),source=files(f.sourceRoot),dest=files(f.root);assert.ok(fs.statSync(f.manifest).size>1048576);
 await assert.rejects(convertFixtureV2Bounded(f.options),{code:'RESOURCE_LIMIT'});await assert.rejects(readFixtureV2Members({synthetic:true,root:f.sourceRoot},()=>{}),{code:'RESOURCE_LIMIT'});assert.deepEqual(files(f.root),dest);
 const native={readFile:fs.readFileSync,read:fs.readSync,parse:JSON.parse};let maxParse=0,maxRead=0;
 fs.readFileSync=(p,...a)=>{assert.notEqual(p,f.manifest);return native.readFile(p,...a);};
 fs.readSync=(fd,b,o,n,p)=>{maxRead=Math.max(maxRead,n);assert.ok(n<=65536);return native.read(fd,b,o,n,p);};
 JSON.parse=(s,...a)=>{maxParse=Math.max(maxParse,Buffer.byteLength(String(s)));assert.ok(Buffer.byteLength(String(s))<=65536,'no complete diagnostic record/string');return native.parse(s,...a);};
 let result;try{result=await convert(f.options);}finally{fs.readFileSync=native.readFile;fs.readSync=native.read;JSON.parse=native.parse;}
 assert.ok(maxParse<65536);assert.ok(maxRead<=65536);await verify(f,result);const before=files(f.root);assert.equal((await convert(f.options)).generation,result.generation);assert.deepEqual(files(f.root),before);assert.deepEqual(files(f.sourceRoot),source);
 const diagnosticDigest=digestChunks(diagnosticChunks((function*(){for(let i=0;i<f.count;i++)yield f.wrapper(i);})()));
 t.diagnostic(JSON.stringify({manifestBytes:fs.statSync(f.manifest).size,wrappers:f.count,maxParseBytes:maxParse,maxReadBytes:maxRead,diagnosticDigest}));
});
test('stream reader awaits sink, rejects escaped iterators, private finite limits',async t=>{
 const f=await fixture(t,{count:3,rawLength:10}),opts={synthetic:true,root:f.sourceRoot,limits:{diagnosticItems:3}};let escaped,events=0;
 await readFixtureV2DiagnosticMembers(opts,async e=>{events++;if(e.diagnostics){escaped=e.diagnostics.entries;assert.equal(e.value.otherEntries,null);assert.equal(e.raw,undefined);let n=0;for(const w of e.diagnostics.entries()){assert.deepEqual(w,f.wrapper(n++));await Promise.resolve();}assert.equal(n,3);opts.root='/invalid';opts.limits.diagnosticItems=Infinity;await Promise.resolve();}});
 assert.ok(events>0);assert.throws(()=>[...escaped()],{code:'CLOSED'});
 await assert.rejects(readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot,limits:{diagnosticItems:2}},()=>{}),{code:'RESOURCE_LIMIT'});
 await assert.rejects(convert({...f.options,limits:{diagnosticItems:Infinity}}),{code:'RESOURCE_LIMIT'});
});
for(const point of ['after-reserve','after-output','after-payload','before-record-checkpoint','after-record-checkpoint','before-verified','after-verified'])test('stream interruption and resume '+point,async t=>{
 const f=await fixture(t),e=Object.assign(Error(point),{code:'EIO'});let hit=false;await assert.rejects(convert({...f.options,fault:n=>{if(n===point&&!hit){hit=true;throw e;}}}),x=>x===e);assert.ok(hit);await verify(f,await convert(f.options));
});
for(const mode of ['truncated','duplicate','null-wrapper','wrong-raw','nonfinite','invalid-utf8','scalar','wrapper','bytes','count','depth'])test('stream rejects before mutation '+mode,async t=>{
 const f=await fixture(t,{count:3,rawLength:10}),before=files(f.root);let limits;
 if(mode==='truncated')fs.truncateSync(f.manifest,fs.statSync(f.manifest).size-2);
 if(mode==='duplicate')f.save(w=>JSON.stringify(w).replace('"unknown":','"key":"duplicate","unknown":'));
 if(mode==='null-wrapper')f.save(()=> 'null');if(mode==='wrong-raw')f.save(w=>JSON.stringify({...w,raw:7}));
 if(mode==='nonfinite')f.save(w=>JSON.stringify(w).replace('"zero":0','"zero":1e999'));
 if(mode==='invalid-utf8')f.save(()=>Buffer.from([123,34,120,34,58,34,255,34,125]));
 if(mode==='scalar')f.save(w=>JSON.stringify({...w,raw:'x'.repeat(32769)}));
 if(mode==='wrapper')limits={wrapperBytes:100};if(mode==='bytes')limits={diagnosticBytes:100};if(mode==='count')limits={diagnosticItems:2};
 if(mode==='depth')f.save(w=>'{"key":"x","raw":"x","deep":'+'['.repeat(65)+'0'+']'.repeat(65)+'}');
 await assert.rejects(convert({...f.options,limits}));assert.deepEqual(files(f.root),before);
});
test('stream exact byte/wrapper/count boundaries and empty diagnostics',async t=>{
 const f=await fixture(t,{count:1,rawLength:10}),wrapperBytes=Buffer.byteLength(JSON.stringify(f.wrapper(0)));
 await verify(f,await convert({...f.options,limits:{wrapperBytes,diagnosticBytes:wrapperBytes+2,diagnosticItems:1}}));
 const empty=await fixture(t,{count:0});await verify(empty,await convert(empty.options));
});
for(const mode of ['between-passes','after-reserve'])test('stream source change '+mode,async t=>{
 const f=await fixture(t);let hit=false;
 await assert.rejects(convert({...f.options,fault:n=>{if(!hit&&n===(mode==='between-passes'?'input-member':'after-reserve')){hit=true;fs.appendFileSync(f.manifest,' ');}}}),{code:'CHANGED_INPUT'});
 if(mode==='after-reserve'){const before=files(f.root);await assert.rejects(convert(f.options),{code:'SOURCE_CONFLICT'});assert.deepEqual(files(f.root),before);}
});
for(const field of ['file','hash','items','ordinal','state','path','owner_key','review-owner','review-value'])test('stream corrupt retained reference '+field,async t=>{
 const f=await fixture(t);await convert(f.options);
 await mutate(f,db=>{if(field==='owner_key')db.exec('PRAGMA foreign_keys=OFF'); // Only deliberate corruption of this newly generated test store.
  if(field==='file'){const p=db.prepare("SELECT path FROM payloads WHERE role='diagnostics'").get().path;fs.appendFileSync(path.join(f.root,p),'bad');}
  else if(field==='review-owner')db.prepare("UPDATE reviews SET owner_key='wrong' WHERE collection='log' AND task='synthetic/second'").run();
  else if(field==='review-value')db.prepare("UPDATE reviews SET value='{}' WHERE collection='log' AND task='synthetic/second'").run();
  else db.prepare(`UPDATE payloads SET ${field}=? WHERE role='diagnostics'`).run({hash:'0'.repeat(64),items:999,ordinal:999,state:'pending',path:'wrong.jsonl',owner_key:'wrong-owner'}[field]);});
 const before=files(f.root);await assert.rejects(convert(f.options));assert.deepEqual(files(f.root),before);
});
test('stream descriptor read EIO plus close ENOSPC retains original error',async t=>{
 const f=await fixture(t,{count:3,rawLength:10}),native={open:fs.openSync,read:fs.readSync,close:fs.closeSync},e=Object.assign(Error('read'),{code:'EIO'});let fd;
 fs.openSync=(p,...a)=>{const n=native.open(p,...a);if(p===f.manifest)fd=n;return n;};fs.readSync=(n,...a)=>{if(n===fd)throw e;return native.read(n,...a);};
 fs.closeSync=n=>{const selected=n===fd;if(selected)fd=undefined;native.close(n);if(selected)throw Object.assign(Error('close'),{code:'ENOSPC'});};
 try{await assert.rejects(readFixtureV2DiagnosticMembers({synthetic:true,root:f.sourceRoot},()=>{}),x=>x===e&&x.cleanupFailures.some(c=>c.systemCode==='ENOSPC'));}finally{Object.assign(fs,{openSync:native.open,readSync:native.read,closeSync:native.close});}
});

test('stream converter publication EIO plus reader close ENOSPC retain both errors',async t=>{
 const f=await fixture(t),native={open:fs.openSync,close:fs.closeSync},fds=new Set(),e=Object.assign(Error('publication interruption'),{code:'EIO'});let inject=false;
 fs.openSync=(p,...a)=>{const n=native.open(p,...a);if(p===f.manifest)fds.add(n);return n;};
 fs.closeSync=n=>{const selected=fds.delete(n);native.close(n);if(selected&&inject)throw Object.assign(Error('reader close'),{code:'ENOSPC'});};
 try{await assert.rejects(convert({...f.options,fault:n=>{if(n==='after-output'){inject=true;throw e;}}}),x=>x===e&&x.cleanupFailures.some(c=>c.systemCode==='ENOSPC'));}
 finally{fs.openSync=native.open;fs.closeSync=native.close;}
 await verify(f,await convert(f.options));
});

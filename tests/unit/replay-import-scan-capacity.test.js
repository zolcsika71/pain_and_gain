import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {selectedFixture,diagnosticLog,logical,hashFiles,unchanged,CAPACITY} from '../fixtures/replay-capacity-fixture.js';
import {cacheFrame,log} from '../fixtures/replay-import-command-fixture.js';
import {parseCacheEntry} from '../../tools/replay-logs.js';
import {importSyntheticCache as admit,inspectProductionCachePage} from '../../tools/replay-import-command-fixture.js';
import {scanSyntheticCache as scan,watchSyntheticCache as watch} from '../../tools/replay-scan-command-fixture.js';
import {database} from '../fixtures/replay-log-review-command-fixture.js';
import {openStore} from '../../tools/replay-store.js';
import {diagnosticChunks,digestChunks,iterateDiagnostics} from '../../tools/replay-store-payloads.js';
import * as scope from '../../tools/replay-production-scope.js';
test('capacity reproduction: 5882 wrappers import exactly and repeat without mutation',async t=>{
    const value=diagnosticLog(),f=await selectedFixture(t),q=f.write('large',value),parsed=parseCacheEntry(cacheFrame(value));assert.equal(parsed.otherEntries.length,5882);
    const r=await f.invoke(()=>admit(f.query(q.sourceFile)));assert.equal(r.kind,'imported');assert.deepEqual(r.record.otherEntries,parsed.otherEntries);
    await unchanged(f,()=>f.invoke(async()=>{const s=await openStore({root:f.root,mode:'read'}),key={collection:'log',replayId:r.record.replayId,fingerprint:r.record.fingerprint};try{await s.withReadSnapshot({recordKeys:[key]},async view=>{let i=0;for await(const wrapper of iterateDiagnostics(view,key,{pointer:'/otherEntries'})){assert.equal(wrapper.ordinal,i);assert.equal(wrapper.kind,'value');assert.deepEqual(wrapper.value,parsed.otherEntries[i++]);}assert.equal(i,5882);});}finally{s.close();}}));
    const again=await unchanged(f,()=>f.invoke(()=>admit(f.query(q.sourceFile))));assert.equal(again.kind,'deduplicated');assert.deepEqual(again.record,r.record);
    t.diagnostic(JSON.stringify({cacheBytes:fs.statSync(path.join(f.sourceRoot,q.sourceFile)).size,wrappers:r.record.otherEntries.length,decodedBytes:Buffer.byteLength(JSON.stringify(value))}));
});
async function rejectsUnchanged(f,fn,expected){const rows=logical(f.root),files=hashFiles(f.root);await assert.rejects(fn,expected);assert.deepEqual(logical(f.root),rows);assert.deepEqual(hashFiles(f.root),files);}
const scanQuery=f=>({production:true,root:f.root,sourceRoot:f.sourceRoot});
test('private capacity snapshot rejects accessors, inherited/missing/invalid fields and finite overflows',()=>{
    let invoked=0;assert.equal(scope.validateProductionCacheCapacity(undefined),null);
    assert.throws(()=>scope.validateProductionCacheCapacity({...CAPACITY,get wrappers(){invoked++;return 8192;}}),{code:'INVALID_ARGUMENT'});
    assert.throws(()=>scope.validateProductionCacheCapacity(Object.create(CAPACITY)),{code:'INVALID_ARGUMENT'});
    for(const change of [{profile:'future'},{extra:1},{wrappers:Infinity},{wrappers:8193},{files:0},{diagnostics:Number.MAX_SAFE_INTEGER},{directoryIterations:1.5}])assert.throws(()=>scope.validateProductionCacheCapacity({...CAPACITY,...change}));
    const missing={...CAPACITY};delete missing.files;assert.throws(()=>scope.validateProductionCacheCapacity(missing));
    const input={...CAPACITY},copy=scope.validateProductionCacheCapacity(input);input.wrappers=Infinity;assert.equal(copy.wrappers,8192);assert(Object.isFrozen(copy));assert.equal(invoked,0);
});
for(const [count,ok]of [[8192,true],[8193,false]])test('explicit wrapper boundary '+count,async t=>{
    const f=await selectedFixture(t),q=f.write('boundary',diagnosticLog(count,0));if(ok)assert.equal((await f.invoke(()=>admit(f.query(q.sourceFile)))).record.otherEntries.length,count);else await rejectsUnchanged(f,()=>f.invoke(()=>admit(f.query(q.sourceFile))),{code:'RESOURCE_LIMIT'});
});
for(const dimension of ['wrappers','diagnostics'])test('reduced '+dimension+' budget rejects without publication',async t=>{
    const value=diagnosticLog(20,40),p=parseCacheEntry(cacheFrame(value)),max=dimension==='wrappers'?19:digestChunks(diagnosticChunks(p.otherEntries)).expectedBytes-1;
    const f=await selectedFixture(t,{capacity:{...CAPACITY,[dimension]:max}}),q=f.write('reduced',value);await rejectsUnchanged(f,()=>f.invoke(()=>admit(f.query(q.sourceFile))),{code:'RESOURCE_LIMIT'});
});
test('exact diagnostic-byte boundary succeeds with private proof-pinned reductions',async t=>{
    const value=diagnosticLog(20,40),bytes=digestChunks(diagnosticChunks(parseCacheEntry(cacheFrame(value)).otherEntries)).expectedBytes,f=await selectedFixture(t,{capacity:{...CAPACITY,diagnostics:bytes}}),q=f.write('exact',value);assert.equal((await f.invoke(()=>admit(f.query(q.sourceFile)))).kind,'imported');
});
test('absent opt-in preserves wrapper and discovery defaults',async t=>{
    const f=await selectedFixture(t,{capacity:null}),q=f.write('large',diagnosticLog());await rejectsUnchanged(f,()=>f.invoke(()=>admit(f.query(q.sourceFile))),{code:'RESOURCE_LIMIT'});for(let i=0;i<65;i++)fs.writeFileSync(path.join(f.sourceRoot,'unrelated-'+i),'synthetic');await rejectsUnchanged(f,()=>f.invoke(()=>scan(scanQuery(f))),{code:'RESOURCE_LIMIT'});
});
for(const limits of [{files:1},{entries:1},{directoryIterations:1},{cycleBytes:1},{discoveryBytes:1}])test('paged preflight explicit bound '+JSON.stringify(limits),async t=>{
    const f=await selectedFixture(t);for(const name of ['a','b'])fs.writeFileSync(path.join(f.sourceRoot,name),'generated unrelated');await rejectsUnchanged(f,()=>f.invoke(()=>scan({...scanQuery(f),limits})),e=>e.code==='RESOURCE_LIMIT'&&!e.scanState.complete&&e.scanState.shutdownConfirmed);
});
test('report budget fails explicitly, not truncated successful discovery',async t=>{const f=await selectedFixture(t);fs.writeFileSync(path.join(f.sourceRoot,'a'),'unrelated');await assert.rejects(f.invoke(()=>scan({...scanQuery(f),limits:{reportBytes:1}})),e=>e.code==='RESOURCE_LIMIT'&&!e.scanState.complete);});
test('cache byte ceiling remains metadata-first and decoded ceiling unchanged',async t=>{
    const f=await selectedFixture(t),file=path.join(f.sourceRoot,'oversized');fs.writeFileSync(file,Buffer.alloc(1048577));let opened=false;const open=fs.openSync;fs.openSync=(p,...a)=>{if(p===file)opened=true;return open(p,...a);};try{await rejectsUnchanged(f,()=>f.invoke(()=>scan(scanQuery(f))),{code:'RESOURCE_LIMIT'});assert.equal(opened,false);}finally{fs.openSync=open;}
    const q=f.write('decoded',diagnosticLog(5882,750));await rejectsUnchanged(f,()=>f.invoke(()=>admit(f.query(q.sourceFile))),{code:'UNSUPPORTED_TRANSPORT'});
});
test('profile scan preserves ordered imports and strict malformed selected transport',async t=>{
    const f=await selectedFixture(t);f.write('b',log({tick:2}));f.write('a',log());const r=await f.invoke(()=>scan(scanQuery(f)));assert.deepEqual(r.events.map(e=>path.basename(e.source)),['a','b']);assert(r.events.every(e=>e.event==='imported'));assert.equal((await unchanged(f,()=>f.invoke(()=>scan(scanQuery(f))))).complete,true);
    f.write('bad',log(),{version:6});await rejectsUnchanged(f,()=>f.invoke(()=>scan(scanQuery(f))),e=>e.code==='UNSUPPORTED_TRANSPORT'&&!e.scanState.complete);
});
test('paged cancellation confirms shutdown before writes and snapshots caller options',async t=>{
    const f=await selectedFixture(t);for(let i=0;i<130;i++)fs.writeFileSync(path.join(f.sourceRoot,'cache-'+i),'unrelated');const c=new AbortController(),open=fs.opendirSync;let count=0;fs.opendirSync=(p,...a)=>{if(p===f.sourceRoot&&++count===1)setImmediate(()=>c.abort());return open(p,...a);};
    try{const limits={files:130},o={...scanQuery(f),signal:c.signal,limits},p=f.invoke(()=>watch(o));setImmediate(()=>{o.root='/invalid';limits.files=Infinity;});const r=await p;assert.equal(r.stopReason,'cancelled');assert.equal(r.shutdownConfirmed,true);assert.equal(r.attempts,0);}finally{fs.opendirSync=open;}
});
for(const combined of [false,true])test('paged directory cleanup '+(combined?'preserves primary EIO':'only ENOSPC remains visible'),async t=>{
    const f=await selectedFixture(t),open=fs.opendirSync;fs.opendirSync=(p,...a)=>{const dir=open(p,...a);if(p===f.sourceRoot){const close=dir.closeSync.bind(dir);if(combined)dir.readSync=()=>{throw Object.assign(Error('read'),{code:'EIO'});};dir.closeSync=()=>{close();throw Object.assign(Error('close'),{code:'ENOSPC'});};}return dir;};
    try{await assert.rejects(f.invoke(()=>scan(scanQuery(f))),e=>e.code===(combined?'EIO':'ENOSPC')&&(!combined||e.cleanupFailures?.some(f=>f.systemCode==='ENOSPC'))&&e.scanState.cleanupUncertain&&!e.scanState.shutdownConfirmed);}finally{fs.opendirSync=open;}
});
test('page access rejects malformed arrays, aliases and byte overrun without weakening file checks',async t=>{
    const f=await selectedFixture(t);f.write('a',log());const accessor=Object.defineProperty(['a'],'0',{get(){throw Error('accessor invoked');}});for(const names of [['../a'],['a','a'],Array(1),accessor])await assert.rejects(f.invoke(()=>inspectProductionCachePage(f.query('page'),names,1048576)));
    const privateLength=new Proxy(['a'],{get(target,key,receiver){if(key==='length')throw Error('mutable length must not be consulted');return Reflect.get(target,key,receiver);}});assert.equal((await f.invoke(()=>inspectProductionCachePage(f.query('page'),privateLength,1048576))).length,1);
    await assert.rejects(f.invoke(()=>inspectProductionCachePage(f.query('page'),['a'],1)),{code:'RESOURCE_LIMIT'});fs.symlinkSync(path.join(f.sourceRoot,'a'),path.join(f.sourceRoot,'alias'));await assert.rejects(f.invoke(()=>scan(scanQuery(f))),{code:'UNSAFE_PATH'});
});
async function interrupted(t){const f=await selectedFixture(t),q=f.write('pending',diagnosticLog(100,20)),link=fs.linkSync;let hit=false;fs.linkSync=(a,b)=>{link(a,b);if(!hit&&String(b).endsWith('.jsonl')&&!String(b).includes('/diagnostics/')){hit=true;throw Object.assign(Error('interrupted'),{code:'EIO'});}};try{await assert.rejects(f.invoke(()=>admit(f.query(q.sourceFile))),{code:'EIO'});}finally{fs.linkSync=link;}assert(hit);return f;}
test('profile scan recovers exact interrupted publication and repeats without mutation',async t=>{const f=await interrupted(t),r=await f.invoke(()=>scan(scanQuery(f)));assert.equal(r.recovered,true);assert.equal(logical(f.root).records.length,1);await unchanged(f,()=>f.invoke(()=>scan(scanQuery(f))));});
test('profile pending source changes reject without abandoning the import',async t=>{const f=await interrupted(t);f.write('pending',log({tick:2}));await rejectsUnchanged(f,()=>f.invoke(()=>scan(scanQuery(f))),{code:'CHANGED_INPUT'});});
test('profile reimport rejects corrupted reservation without repair',async t=>{const f=await selectedFixture(t),q=f.write('a',log());await f.invoke(()=>admit(f.query(q.sourceFile)));database(f.root,db=>db.prepare('UPDATE outputs SET hash=?').run('f'.repeat(64)));await rejectsUnchanged(f,()=>f.invoke(()=>admit(f.query(q.sourceFile))),{code:'INVALID_REFERENCE'});});
test('2049 discovery files reject above the authority-pinned maximum before file opens',async t=>{
    const f=await selectedFixture(t);for(let i=0;i<2049;i++)fs.writeFileSync(path.join(f.sourceRoot,'entry-'+i),'generated');const open=fs.openSync;let contentOpens=0;fs.openSync=(p,...a)=>{if(typeof p==='string'&&p.startsWith(f.sourceRoot+'/'))contentOpens++;return open(p,...a);};try{await rejectsUnchanged(f,()=>f.invoke(()=>scan(scanQuery(f))),{code:'RESOURCE_LIMIT'});assert.equal(contentOpens,0);}finally{fs.openSync=open;}
});
test('changed source between discovery and processing cannot produce complete scan',async t=>{
    const f=await selectedFixture(t);fs.writeFileSync(path.join(f.sourceRoot,'a'),'generated first');const open=fs.opendirSync;let count=0;fs.opendirSync=(p,...a)=>{if(p===f.sourceRoot&&++count===2)fs.writeFileSync(path.join(f.sourceRoot,'a'),'generated second');return open(p,...a);};try{await assert.rejects(f.invoke(()=>scan(scanQuery(f))),e=>e.code==='CHANGED_INPUT'&&!e.scanState.complete);}finally{fs.opendirSync=open;}
});
test('page completion rejects an altered authority proof rather than caching its access grant',async t=>{
    const f=await selectedFixture(t);fs.writeFileSync(path.join(f.sourceRoot,'a'),'generated');const read=fs.readSync,open=fs.openSync;let selected;fs.openSync=(p,...a)=>{const fd=open(p,...a);if(p===path.join(f.sourceRoot,'a'))selected=fd;return fd;};fs.readSync=(fd,...a)=>{const n=read(fd,...a);if(fd===selected&&n){selected=undefined;fs.appendFileSync(path.join(f.root,'.production-proof.json'),' ');}return n;};try{await assert.rejects(f.invoke(()=>inspectProductionCachePage(f.query('page'),['a'],1048576)),{code:'AUTHORITY_CONFLICT'});}finally{fs.openSync=open;fs.readSync=read;}
});
test('capacity reproduction: converted 5882-wrapper record verifies without adoption',async t=>{
    const f=await selectedFixture(t,{converted:diagnosticLog()});const r=await unchanged(f,()=>f.invoke(()=>admit(f.query('converted'))));assert.equal(r.kind,'deduplicated');assert.equal(r.record.otherEntries.length,5882);
});
test('capacity reproduction: paged discovery covers 1388 files with explicit unrelated results',async t=>{
    const f=await selectedFixture(t);for(let i=0;i<1388;i++)fs.writeFileSync(path.join(f.sourceRoot,'unrelated-'+String(i).padStart(4,'0')),'generated non-replay cache');fs.mkdirSync(path.join(f.sourceRoot,'index-dir'));
    const r=await unchanged(f,()=>f.invoke(()=>scan({production:true,root:f.root,sourceRoot:f.sourceRoot})));assert.equal(r.complete,true);assert.equal(r.events.length,1388);assert(r.events.every(e=>e.event==='unrelated'));assert.equal(r.discovery.ignoredDirectories,1);assert(r.discovery.maxPage<=128);assert.deepEqual(r.events.map(e=>path.basename(e.source)),Array.from({length:1388},(_,i)=>'unrelated-'+String(i).padStart(4,'0')));
});

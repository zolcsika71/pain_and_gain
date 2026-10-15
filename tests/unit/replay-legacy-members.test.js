import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as reader from '../../tools/replay-legacy-reader.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const input=()=>({version:2,maps:[{id:'a'.repeat(64),file:'map.json'}],
    replays:[{replayId:'1'.repeat(24),mapId:'a'.repeat(64),retiredFingerprints:[]}],
    records:[{replayId:'1'.repeat(24),fingerprint:'b'.repeat(64),outputPath:'original.jsonl',
        reviews:{'owner/task':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}},
        otherEntries:[{key:'1:1',raw:' {"tick":1} '},{key:'1:1',raw:'duplicate'}],unknown:{empty:[],zero:0}}],
    scoreRecords:[{replayId:'1'.repeat(24),fingerprint:'c'.repeat(64),kind:'game-metadata'}],
    retiredScoreSources:[],unknownRoot:{nullValue:null}});
function fixture(t,text=JSON.stringify(input())){
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-v2-reader-fixture-'));
    fs.mkdirSync(path.join(root,'replay_logs'));
    fs.writeFileSync(path.join(root,'.replay-v2-reader-fixture.json'),JSON.stringify({fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
    const file=path.join(root,'replay_logs/manifest.json');fs.writeFileSync(file,text);
    t.diagnostic(JSON.stringify({synthetic:true,root,retained:true}));return{root,file};
}
const run=(f,sink=()=>{},limits)=>reader.readFixtureV2Members({synthetic:true,root:f.root,...(limits?{limits}:{})},sink);
test('options regression: root accessor cannot redirect after validation',async t=>{
    const f=fixture(t),other=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'synthetic-unmarked-members-'));
    fs.mkdirSync(path.join(other,'replay_logs'));
    fs.writeFileSync(path.join(other,'replay_logs/manifest.json'),' {"version":2,"maps":[],"replays":[],"records":[],"synthetic":"unguarded"}');
    t.diagnostic(JSON.stringify({synthetic:true,root:other,retained:true}));
    let reads=0,emitted=0;
    const options={synthetic:true,get root(){return ++reads<5?f.root:other;}};
    await assert.rejects(reader.readFixtureV2Members(options,()=>emitted++),{code:'UNSUPPORTED_FIXTURE'});
    assert.equal(reads,0);assert.equal(emitted,0);
});
test('options regression: nested event accessor cannot bypass hard cap',async t=>{
    const f=fixture(t,JSON.stringify({version:2,maps:[],replays:[],records:Array.from({length:4100},()=>({}))}));
    let reads=0,emitted=0;
    const limits={get events(){return ++reads===1?1:Infinity;}};
    await assert.rejects(run(f,()=>emitted++,limits),{code:'RESOURCE_LIMIT'});
    assert.equal(reads,0);assert.equal(emitted,0);
});
for(const key of ['synthetic','root','limits'])for(const enumerable of [true,false])
test(`options snapshot rejects top-level accessor: ${key}/${enumerable}`,async t=>{
    const f=fixture(t),options={synthetic:true,root:f.root},native=fs.openSync;let reads=0,opens=0;
    Object.defineProperty(options,key,{enumerable,get(){reads++;throw Error('getter executed');}});
    fs.openSync=(...a)=>{opens++;return native(...a);};
    try{await assert.rejects(reader.readFixtureV2Members(options,()=>{}),{code:'UNSUPPORTED_FIXTURE'});}
    finally{fs.openSync=native;}
    assert.equal(reads,0);assert.equal(opens,0);
});
test('options snapshot rejects nonenumerable and setter-only nested accessors',async t=>{
    const f=fixture(t);
    for(const descriptor of [{get(){throw Error('getter executed');}},{set(_v){throw Error('setter executed');}}]){
        const limits={};Object.defineProperty(limits,'events',descriptor);
        await assert.rejects(run(f,()=>{},limits),{code:'RESOURCE_LIMIT'});
    }
});
test('options snapshot ignores inherited accessors and rejects custom prototypes',async t=>{
    const f=fixture(t);let reads=0;
    const inherited={get root(){reads++;return f.root;}};
    await assert.rejects(reader.readFixtureV2Members(Object.assign(Object.create(inherited),{synthetic:true}),()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    await assert.rejects(run(f,()=>{},Object.create({get events(){reads++;return Infinity;}})),{code:'RESOURCE_LIMIT'});
    // Even Object.prototype properties must not supply missing options.
    const saved=Object.getOwnPropertyDescriptor(Object.prototype,'root');
    Object.defineProperty(Object.prototype,'root',{configurable:true,get(){reads++;return f.root;}});
    try{await assert.rejects(reader.readFixtureV2Members({synthetic:true},()=>{}),{code:'UNSUPPORTED_FIXTURE'});}
    finally{if(saved)Object.defineProperty(Object.prototype,'root',saved);else delete Object.prototype.root;}
    assert.equal(reads,0);
});
test('options snapshot survives awaited callback mutation and replacement',async t=>{
    const f=fixture(t),limits={events:20,memberBytes:1024},options={synthetic:true,root:f.root,limits};let count=0;
    const result=await reader.readFixtureV2Members(options,async()=>{
        if(++count===1){
            await Promise.resolve();limits.events=1;limits.memberBytes=1;
            options.root='/not-a-fixture';options.synthetic=false;
            for(const key of ['root','limits'])Object.defineProperty(options,key,{get(){throw Error('options reread');}});
            Object.defineProperty(limits,'depth',{get(){throw Error('limits reread');}});
        }
    });
    assert.equal(result.complete,true);assert.equal(result.events,count);assert.equal(count,11);
});
test('options snapshot enforces exact 4096-event boundary with small members',async t=>{
    for(const n of [4092,4093]){
        const f=fixture(t,JSON.stringify({version:2,maps:[],replays:[],records:Array.from({length:n},()=>({}))}));let count=0;
        if(n===4092){const result=await run(f,()=>count++,{events:4096});assert.equal(count,4096);assert.equal(result.complete,true);}
        else{await assert.rejects(run(f,()=>count++),{code:'RESOURCE_LIMIT'});assert.equal(count,0);}
    }
});
test('member stream preserves complete selected record metadata without a manifest object',async t=>{
    const f=fixture(t),before=sha(fs.readFileSync(f.file)),out={},events=[];
    const result=await run(f,event=>{
        events.push(event);
        if(event.kind==='collection')Object.defineProperty(out,event.name,{value:[],enumerable:true});
        else if(event.kind==='member')out[event.name].push(event.value);
        else Object.defineProperty(out,event.name,{value:event.value,enumerable:true});
        if(event.raw)assert.deepEqual(event.raw,fs.readFileSync(f.file).subarray(event.start,event.end));
    });
    assert.deepEqual(out,input());assert.equal(result.complete,true);
    assert.deepEqual(events.filter(e=>e.kind==='member').map(e=>[e.name,e.ordinal]),[['maps',0],['replays',0],['records',0],['scoreRecords',0]]);
    assert.equal(sha(fs.readFileSync(f.file)),before);
});
test('incremental bounded members, backpressure and no payload or whole-file reads',async t=>{
    const m=input();m.records=Array.from({length:150},(_,i)=>({ordinal:i,unknown:'x'.repeat(100)}));
    const f=fixture(t,JSON.stringify(m)),native={readFile:fs.readFileSync,read:fs.readSync,open:fs.openSync};let active=0,count=0,maxRead=0;
    fs.readFileSync=()=>{throw Error('whole-file read forbidden');};
    fs.openSync=(p,...args)=>{assert.ok([f.file,path.join(f.root,'.replay-v2-reader-fixture.json')].includes(p));return native.open(p,...args);};
    fs.readSync=(fd,b,o,n,p)=>{maxRead=Math.max(maxRead,n);assert.ok(n<=65536);return native.read(fd,b,o,n,p);};
    try{await run(f,async e=>{assert.equal(active++,0);await Promise.resolve();if(e.kind==='member'&&e.name==='records'){assert.equal(e.value.ordinal,count++);assert.ok(e.raw.length<=256);}active--;},{memberBytes:256});}
    finally{fs.readFileSync=native.readFile;fs.readSync=native.read;fs.openSync=native.open;}
    assert.equal(count,150);assert.ok(maxRead<=65536);
});
for(const [name,text,limits,code]of [
    ['input',JSON.stringify(input()),{inputBytes:20},'RESOURCE_LIMIT'],
    ['member',JSON.stringify(input()),{memberBytes:32},'RESOURCE_LIMIT'],
    ['depth',JSON.stringify(input()),{depth:2},'RESOURCE_LIMIT'],
    ['keys',JSON.stringify(input()),{keys:2},'RESOURCE_LIMIT'],
    ['key bytes',JSON.stringify(input()),{keyBytes:3},'RESOURCE_LIMIT'],
    ['values',JSON.stringify(input()),{values:5},'RESOURCE_LIMIT'],
    ['events',JSON.stringify(input()),{events:3},'RESOURCE_LIMIT'],
    ['truncated','{"version":2,"maps":[],"replays":[],"records":[',null,'INVALID_JSON'],
    ['trailing',JSON.stringify(input())+'x',null,'INVALID_JSON'],
    ['duplicate nested',JSON.stringify(input()).replace('"zero":0','"zero":0,"zero":1'),null,'DUPLICATE_KEY'],
    ['duplicate root',JSON.stringify(input()).replace('"version":2','"version":2,"version":2'),null,'DUPLICATE_KEY'],
    ['wrong collection',JSON.stringify({...input(),scoreRecords:null}),null,'UNSUPPORTED_MANIFEST'],
    ['wrong version',JSON.stringify({...input(),version:3}),null,'UNSUPPORTED_MANIFEST'],
    ['invalid utf8',Buffer.concat([Buffer.from('{"version":2,"maps":[],"replays":[],"records":[],"x":"'),Buffer.from([255]),Buffer.from('"}')]),null,'UNSUPPORTED_VALUE'],
    ['nonfinite','{"version":2,"maps":[],"replays":[],"records":[],"x":1e400}',null,'UNSUPPORTED_VALUE']
])test('explicit preflight rejection: '+name,async t=>{
    const f=fixture(t,text),before=sha(fs.readFileSync(f.file));let emitted=0;
    await assert.rejects(run(f,()=>emitted++,limits),{code});assert.equal(emitted,0);assert.equal(sha(fs.readFileSync(f.file)),before);
});
test('absent versus empty collections, duplicate identities and escaped/numeric keys are not normalized',async t=>{
    const m=input();delete m.scoreRecords;delete m.retiredScoreSources;m.records.push(m.records[0]);
    const f=fixture(t,JSON.stringify(m).replace('"unknownRoot":','"10":false,"2":null,"__proto__":{},"unknown\\u0052oot":'));
    const events=[];await run(f,e=>events.push(e));
    assert.equal(events.filter(e=>e.name==='scoreRecords').length,0);
    assert.equal(events.filter(e=>e.name==='records'&&e.kind==='member').length,2);
    assert.deepEqual(events.filter(e=>e.kind==='property').map(e=>e.name),['version','10','2','__proto__','unknownRoot']);
});
test('unsafe roots, aliases, symlinks and missing opt-in fail before manifest access',async t=>{
    const f=fixture(t),native=fs.openSync;let opens=0;fs.openSync=(...a)=>{opens++;return native(...a);};
    try{
        for(const root of [process.cwd(),path.join(process.cwd(),'replay_logs'),path.resolve('../pain_and_gain_hold_trial_2026-10-02'),path.resolve('../pain_and_gain_pair_trial_2026-10-02'),f.root+'/../'+path.basename(f.root)])
            await assert.rejects(reader.readFixtureV2Members({root,synthetic:true},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
        await assert.rejects(reader.readFixtureV2Members({root:f.root},()=>{}),{code:'UNSUPPORTED_FIXTURE'});assert.equal(opens,0);
    }finally{fs.openSync=native;}
    const link=path.join(f.root,'link');fs.symlinkSync(f.file,link);fs.renameSync(f.file,path.join(f.root,'saved'));fs.renameSync(link,f.file);
    await assert.rejects(run(f));
});
test('pinned source survives replacement; in-place modification and truncation reject',async t=>{
    for(const mode of ['replace','change','truncate']){
        const f=fixture(t);let first=true,records=0;
        const operation=run(f,e=>{if(first){first=false;if(mode==='replace'){fs.renameSync(f.file,f.file+'.old');fs.writeFileSync(f.file,'{}');}else if(mode==='change')fs.appendFileSync(f.file,' ');else fs.truncateSync(f.file,10);}if(e.name==='records'&&e.kind==='member')records++;});
        if(mode==='replace'){await operation;assert.equal(records,1);}else await assert.rejects(operation,{code:'CHANGED_INPUT'});
    }
});
for(const mode of ['read','close','both','sink','sink-close'])test('descriptor cleanup preserves failures: '+mode,async t=>{
    const f=fixture(t),native={open:fs.openSync,read:fs.readSync,close:fs.closeSync},fds=new Set();let target;
    const primary=Object.assign(Error('operation'),{code:'EIO'}),cleanup=Object.assign(Error('close'),{code:'ENOSPC'});
    fs.openSync=(p,...a)=>{const fd=native.open(p,...a);fds.add(fd);if(p===f.file)target=fd;return fd;};
    fs.readSync=(fd,...a)=>{if(fd===target&&['read','both'].includes(mode))throw primary;return native.read(fd,...a);};
    fs.closeSync=fd=>{fds.delete(fd);native.close(fd);if(fd===target&&['close','both','sink-close'].includes(mode))throw cleanup;};
    let caught;try{await run(f,()=>{if(mode.startsWith('sink'))throw primary;});}catch(e){caught=e;}
    finally{fs.openSync=native.open;fs.readSync=native.read;fs.closeSync=native.close;}
    assert.equal(fds.size,0);assert.equal(caught,mode==='close'?cleanup:primary);
    if(['both','sink-close'].includes(mode))assert.deepEqual(caught.cleanupFailures,[{reason:'cleanup-failed',systemCode:'ENOSPC'}]);
    await run(f);
});
test('interruption has no success result; repeat starts from pinned source without state',async t=>{
    const f=fixture(t),stop=Error('stop');let n=0;
    await assert.rejects(run(f,()=>{if(++n===4)throw stop;}),e=>e===stop);
    let count=0;const result=await run(f,()=>count++);assert.equal(result.events,count);assert.ok(count>n);
    await assert.rejects(run(f,()=>{throw null;}),e=>e===null);
});

test('empty input collections and exact member byte boundary',async t=>{
    const f=fixture(t,'{"version":2,"maps":[],"replays":[],"records":[],"unknown":"12345678"}');
    let count=0;await run(f,()=>count++,{memberBytes:10});assert.equal(count,5);
    await assert.rejects(run(f,()=>{}, {memberBytes:9}),{code:'RESOURCE_LIMIT'});
    for(const limits of [{memberBytes:0},{inputBytes:Infinity},{events:4097},{unknown:1}])
        await assert.rejects(run(f,()=>{},limits),{code:'RESOURCE_LIMIT'});
});
test('post-open inspection failure closes both handles and preserves combined errors',async t=>{
    const f=fixture(t),native={open:fs.openSync,stat:fs.fstatSync,close:fs.closeSync},fds=new Set();let selected;
    const primary=Object.assign(Error('inspect'),{code:'EIO'}),cleanup=Object.assign(Error('close'),{code:'ENOSPC'});
    fs.openSync=(p,...a)=>{const fd=native.open(p,...a);fds.add(fd);if(p===f.file)selected=fd;return fd;};
    fs.fstatSync=(fd,...a)=>{if(fd===selected)throw primary;return native.stat(fd,...a);};
    fs.closeSync=fd=>{fds.delete(fd);native.close(fd);if(fd===selected)throw cleanup;};
    let caught;try{await run(f);}catch(e){caught=e;}finally{fs.openSync=native.open;fs.fstatSync=native.stat;fs.closeSync=native.close;}
    assert.equal(caught,primary);assert.equal(fds.size,0);assert.equal(caught.cleanupFailures[0].systemCode,'ENOSPC');
});
test('non-Error interruption plus close error retains both causes',async t=>{
    const f=fixture(t),native={open:fs.openSync,close:fs.closeSync};let selected;
    const cleanup=Object.assign(Error('close'),{code:'ENOSPC'});
    fs.openSync=(p,...a)=>{const fd=native.open(p,...a);if(p===f.file)selected=fd;return fd;};
    fs.closeSync=fd=>{native.close(fd);if(fd===selected)throw cleanup;};
    let caught;try{await run(f,()=>{throw null;});}catch(e){caught=e;}finally{fs.openSync=native.open;fs.closeSync=native.close;}
    assert.ok(caught instanceof AggregateError);assert.equal(caught.cause,null);assert.deepEqual(caught.errors,[null,cleanup]);
});
test('reader import and execution never load SQLite',async t=>{
    const f=fixture(t),url=new URL('../../tools/replay-legacy-reader.js',import.meta.url).href;
    const code=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLite forbidden');return n(s,c);}});const m=await import(${JSON.stringify(url)});await m.readFixtureV2Members({synthetic:true,root:${JSON.stringify(f.root)}},()=>{});`;
    const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:10000,maxBuffer:1048576});
    assert.equal(r.status,0,r.stderr);assert.equal(r.error,undefined);
});

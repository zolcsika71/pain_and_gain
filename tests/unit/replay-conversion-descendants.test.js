import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {convertFixtureV2Slice} from '../../tools/replay-conversion-fixture.js';
import {convertFixtureV2Bounded,convertFixtureV2Streaming} from '../../tools/replay-conversion-bounded-fixture.js';
import {createFixtureStore,openStore,recordOwner,recordKey} from '../../tools/replay-store.js';
import {iterateDiagnostics,streamOriginalValue} from '../../tools/replay-store-payloads.js';
import {mapChecksum} from '../../tools/replay-logs.js';

const tmp=fs.realpathSync(os.tmpdir()),sha=b=>createHash('sha256').update(b).digest('hex');
const callers={slice:convertFixtureV2Slice,bounded:convertFixtureV2Bounded,streaming:convertFixtureV2Streaming};
async function fixture(t,caller){
    const sourceRoot=fs.mkdtempSync(path.join(tmp,caller==='slice'?'pain-gain-v2-conversion-fixture-':'pain-gain-v2-reader-fixture-'));
    const root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-'));
    t.diagnostic(JSON.stringify({synthetic:true,sourceRoot,root,retained:true}));
    const dir=caller==='slice'?sourceRoot:path.join(sourceRoot,'replay_logs');if(dir!==sourceRoot)fs.mkdirSync(dir);
    fs.writeFileSync(path.join(sourceRoot,caller==='slice'?'.v2-conversion-fixture.json':'.replay-v2-reader-fixture.json'),JSON.stringify(caller==='slice'?{fixture:'synthetic-v2-conversion',version:1}:{fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'}));
    const map={arena:{name:'Pain and Gain',season:'descendant-synthetic',level:1,ticksLimit:10},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(0))},objects:[]};
    const mapId=mapChecksum(map),mapBytes=JSON.stringify({...map,checksum:mapId});fs.writeFileSync(path.join(dir,'map.json'),mapBytes);
    const replayId='1'.repeat(24),buildId='c'.repeat(64),logFingerprint='2'.repeat(64),scoreFingerprint='3'.repeat(64);
    const reviews={'synthetic/reviewer':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:'r'.repeat(17000)}};
    const wrappers=[{key:'1:0',raw:' first raw ',unknown:null},{key:'1:0',raw:'second\r\n',unknown:false}];
    const records=['log','score'].map(collection=>{
        const outputPath=collection+'.original',body=Buffer.from('{"synthetic":"'+collection+'"}\n');fs.writeFileSync(path.join(dir,outputPath),body);
        return {replayId,fingerprint:collection==='log'?logFingerprint:scoreFingerprint,mapId,buildId,status:'claim',owner:'synthetic',reviews,outputPath,outputFingerprint:sha(body),extension:'e'.repeat(17000),...(collection==='log'?{otherEntries:wrappers}:{kind:'replay-frames'})};
    });
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:2,maps:[{id:mapId,checksum:mapId,file:'map.json',path:'map.json',hash:sha(mapBytes),status:'validated'}],replays:[{replayId,mapId,buildId,status:'active'}],records:[records[0]],scoreRecords:[records[1]]}));
    const store=await createFixtureStore({root,filesystem:'local-apfs'});store.close();
    const options={synthetic:true,sourceRoot,root,...(caller==='slice'?{replayId,logFingerprint,scoreFingerprint}:{})};
    return {root,sourceRoot,options,wrappers,records,run:callers[caller],key:{collection:'log',replayId,fingerprint:logFingerprint}};
}
function inventory(root){
    const result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else{
        const fd=fs.openSync(p,'r'),h=createHash('sha256'),b=Buffer.alloc(65536);try{for(;;){const n=fs.readSync(fd,b,0,b.length,null);if(!n)break;h.update(b.subarray(0,n));}}finally{fs.closeSync(fd);}result[path.relative(root,p)]=h.digest('hex');
    }}}walk(root);return result;
}
function corrupt(f,target,depth){
    const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),db=new DatabaseSync(path.join(f.root,descriptor.database));
    try{
        const p=db.prepare(target==='diagnostics'?"SELECT * FROM payloads WHERE role='diagnostics'":target==='review'?"SELECT * FROM payloads WHERE owner_kind='review' LIMIT 1":"SELECT * FROM payloads WHERE owner_kind='record' AND role='extensions' LIMIT 1").get();assert.ok(p);
        let parent=p.pointer;
        const insert=db.prepare('INSERT INTO payloads(owner_kind,owner_key,pointer,parent,role,path,hash,bytes,items,state,ordinal,encoding) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
        for(let i=0;i<depth;i++){
            const pointer=parent+'/unexpected',file='unexpected-'+i+'.json';
            // For nested cases the first child is a valid readable file; only
            // its descendant is missing. Both are unexpected planner references.
            if(i<depth-1)fs.writeFileSync(path.join(f.root,file),'{}');
            insert.run(p.owner_kind,p.owner_key,pointer,parent,'extensions',file,sha('{}'),2,null,'ready',100+i,'json-v1');parent=pointer;
        }
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    }finally{db.close();}
}
async function readable(f){
    const store=await openStore({root:f.root,mode:'read'});
    try{
        await store.withReadSnapshot({recordKeys:[f.key],reviewKeys:[{recordKey:f.key,taskId:'synthetic/reviewer'}]},async view=>{
            let i=0;for await(const d of iterateDiagnostics(view,f.key)){assert.equal(d.ordinal,i);assert.deepEqual(d.value,f.wrappers[i++]);}assert.equal(i,f.wrappers.length);
            for(const [owner,pointer,expected]of [[recordOwner(f.key),'/extension',f.records[0].extension],[{kind:'review',key:JSON.stringify([recordKey(f.key),'synthetic/reviewer'])},'/unknown',f.records[0].reviews['synthetic/reviewer'].unknown]]){
                const chunks=[];await streamOriginalValue(view,view.payload(owner,pointer),b=>chunks.push(b));assert.equal(JSON.parse(Buffer.concat(chunks)),expected);
            }
        });
    }finally{store.close();}
}
for(const caller of Object.keys(callers)){
    for(const phase of ['reserved','published','verified'])for(const depth of [1,2])test(`leaf closure ${caller} ${phase} depth ${depth}`,async t=>{
        const f=await fixture(t,caller),point=phase==='reserved'?'after-reserve':phase==='published'?(caller==='slice'?'after-publication-checkpoint':'after-record-checkpoint'):null;
        if(point){const failure=Object.assign(Error('retained interruption'),{code:'EIO'});await assert.rejects(f.run({...f.options,fault:n=>{if(n===point)throw failure;}}),e=>e===failure);}else{await f.run(f.options);await readable(f);}
        corrupt(f,'diagnostics',depth);const before=inventory(f.root),source=inventory(f.sourceRoot);
        if(phase==='verified')await assert.rejects(readable(f),{code:'UNAVAILABLE'});
        for(let i=0;i<2;i++){
            await assert.rejects(f.run(f.options),{code:'CHANGED_DESTINATION'});
            assert.deepEqual(inventory(f.root),before,'no reference, checkpoint, file or generation repair');assert.deepEqual(inventory(f.sourceRoot),source);
        }
    });
    for(const target of ['record','review'])test(`leaf closure ${caller} extension ${target}`,async t=>{
        const f=await fixture(t,caller);await f.run(f.options);corrupt(f,target,2);const before=inventory(f.root);
        await assert.rejects(f.run(f.options),{code:'CHANGED_DESTINATION'});assert.deepEqual(inventory(f.root),before);
    });
    test(`leaf closure ${caller} valid recovery and repeated readable leaves`,async t=>{
        const f=await fixture(t,caller),point=caller==='slice'?'after-payload-log':'after-payload';let hit=false;
        await assert.rejects(f.run({...f.options,fault:n=>{if(n===point&&!hit){hit=true;throw Object.assign(Error('retained partial publication'),{code:'EIO'});}}}),{code:'EIO'});assert.ok(hit);
        const first=await f.run(f.options);await readable(f);const before=inventory(f.root);
        for(let i=0;i<2;i++){const next=await f.run(f.options);assert.equal(next.phase,'verified');assert.equal(next.generation,first.generation);await readable(f);assert.deepEqual(inventory(f.root),before);}
    });
}

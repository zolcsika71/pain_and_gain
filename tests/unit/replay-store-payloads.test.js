import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { createFixtureStore, openStore, recordKey, recordOwner } from '../../tools/replay-store.js';
import { diagnosticChunks, digestChunks, inlineJson, iterateDiagnostics, iterateJson,
    jsonChunks, LIMITS, payloadChunks, payloadPath, streamOriginalValue } from '../../tools/replay-store-payloads.js';

const mapId='a'.repeat(64),replayId='b'.repeat(24);
const key=(i=0)=>({collection:'log',replayId,fingerprint:i.toString(16).padStart(64,'0')});
const prefix=path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-');
async function fixture(t){const root=fs.mkdtempSync(prefix),s=await createFixtureStore({root,filesystem:'local-apfs'});t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true});});await associations(s);return s;}
async function associations(s){await s.withWriter(w=>w.transaction(tx=>{tx.insertEntity({kind:'map',key:mapId,ordinal:0});tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:{mapId}});}));}
async function evidence(s,k,p,role,source,expected){let ref;await s.withWriter(async w=>{ref=await w.publishPayload({owner:recordOwner(k),pointer:p,role,source:source(),evidenceOnly:true,...expected});w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:Number.parseInt(k.fingerprint,16),value:{mapId}});tx.finishPublication({recordKey:k,payloadRefs:[ref]});tx.setProperty({owner:recordOwner(k),pointer:p,ordinal:2,payloadRef:ref});});});return ref;}
async function collect(generator){const result=[];for await(const item of generator)result.push(item);return result;}

if(process.argv[2]==='scale-worker'){
    const root=process.argv[3],phase=process.argv[4];
    const s=phase==='generate'?await createFixtureStore({root,filesystem:'local-apfs'}):await openStore({root,mode:'write'});
    const started=performance.now();
    if(phase==='generate'){
        await associations(s);
        // Ten distinct 60 MiB ASCII JSON strings, generated a chunk at a time.
        for(let i=0;i<10;i++){
            const size=60*1024*1024;
            const source=function*(){yield Buffer.from('"');let remain=size-2;const block=Buffer.alloc(65_536,65+i);while(remain){const n=Math.min(remain,block.length);yield block.subarray(0,n);remain-=n;}yield Buffer.from('"');};
            await evidence(s,key(i),'/large','extensions',source,digestChunks(source()));
        }
        console.log(JSON.stringify({phase,bytes:600*1024*1024,elapsedMs:performance.now()-started,maxRssBytes:process.resourceUsage().maxRSS*1024,metrics:s.metrics}));
    }else{
        // Audit file identities without reading the large payload bodies.
        const files=[];const walk=directory=>{for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);if(stat.isDirectory())walk(file);else if(name.endsWith('.json')||name.endsWith('.jsonl'))files.push([file,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs]);}};walk(path.join(root,'store-v3'));
        const runs=[];
        for(const count of [10,1000]){
            // The first measured import added one row: add 989, not 990.
            if(count===1000)await s.withWriter(w=>w.transaction(tx=>{for(let i=10;i<999;i++)tx.insertEntity({kind:'record',key:recordKey(key(i)),ordinal:i,value:{mapId,status:'claim'}});}));
            const native=new DatabaseSync(path.join(root,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).database),{readOnly:true});assert.equal(native.prepare('SELECT count(*) AS count FROM records').get().count,count);native.close();
            for(const operation of ['list','lookup','review','import']){
                s.resetMetrics();const before=performance.now();
                if(operation==='list'){const page=s.pageRecords({collection:'log',limit:10});assert.equal(page.rows.length,10);}
                if(operation==='lookup')assert.equal(s.getRecord(key()).fingerprint,key().fingerprint);
                if(operation==='review')await s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:key(),taskId:'scale',ordinal:0,value:{examined:null,completed:null}})));
                if(operation==='import'){
                    // Separate identity each time; write one new payload only.
                    const k=key(count+10000),source=()=>jsonChunks({fresh:count});await evidence(s,k,'/summary','summaries',source,digestChunks(source()));
                }
                runs.push({count,operation,elapsedMs:performance.now()-before,metrics:{...s.metrics}});
                if(operation!=='import'){assert.equal(s.metrics.payloadOpens,0);assert.equal(s.metrics.payloadReadBytes,0);assert.equal(s.metrics.payloadWriteBytes,0);}
            }
        }
        for(const operation of ['list','lookup','review','import'])assert.equal(runs.find(r=>r.count===10&&r.operation===operation).metrics.sql,runs.find(r=>r.count===1000&&r.operation===operation).metrics.sql);
        for(const [file,ino,size,mtime,ctime]of files){const stat=fs.statSync(file);assert.deepEqual([stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs],[ino,size,mtime,ctime]);}
        console.log(JSON.stringify({phase,elapsedMs:performance.now()-started,maxRssBytes:process.resourceUsage().maxRSS*1024,runs}));
    }
    assert.ok(process.resourceUsage().maxRSS*1024<=256*1024*1024,'256 MiB RSS budget');s.close();
}else{
test('bounded JSON encoding preserves Unicode/types and rejects lossy JSON',()=>{
    const value={unicode:'Á😀',bool:false,zero:0,null:null,empty:[],object:{},unknown:[1,'x']};
    assert.equal(Buffer.concat([...jsonChunks(value)]).toString(),JSON.stringify(value));
    assert.equal(inlineJson(value),JSON.stringify(value));
    assert.ok([...jsonChunks('😀'.repeat(300000))].every(c=>c.length<=LIMITS.chunk));
    for(const value of [undefined,Infinity,NaN,1n,Array(3),new Date(),new Map()])assert.throws(()=>inlineJson(value),{code:'INVALID_JSON'});
    const cyclic={};cyclic.self=cyclic;assert.throws(()=>inlineJson(cyclic),{code:'INVALID_JSON'});
    assert.throws(()=>inlineJson('x'.repeat(65536)),{code:'RESOURCE_LIMIT'});
});

test('selected JSON iteration, stream ranges, integrity failure and callback lifetime',async t=>{
    const s=await fixture(t),k=key(0),value={unknown:{zero:0,missing:null},array:[false,null,0,'Á😀'],large:'x'.repeat(1_100_000)},source=()=>jsonChunks(value);
    const ref=await evidence(s,k,'/data','extensions',source,digestChunks(source()));let escaped;
    await s.withReadSnapshot({recordKeys:[k]},async view=>{
        escaped=view;assert.deepEqual((await collect(iterateJson(view,ref,'/array/*'))).map(r=>r.value),value.array);
        assert.ok(view.replays.has(replayId));assert.ok(view.properties.get(JSON.stringify(recordOwner(k))).some(r=>r.pointer==='/data'));
        assert.deepEqual(await collect(iterateJson(view,ref,'/absent')),[]);
        const selected=await collect(iterateJson(view,ref,'/large'));assert.equal(selected[0].kind,'stream');
        let bytes=0;for await(const part of payloadChunks(view,ref,selected[0].start,selected[0].end))bytes+=part.length;assert.equal(bytes,1_100_002);
        const hash=createHash('sha256');await streamOriginalValue(view,ref,c=>hash.update(c));assert.equal(hash.digest('hex'),ref.hash);
        await assert.rejects(collect(iterateJson(view,{...ref,path:'not-pinned'},'')),{code:'INVALID_REFERENCE'});
    });assert.throws(()=>escaped.assertOpen(),{code:'CLOSED'});
    const file=path.join(s.root,ref.path);const fd=fs.openSync(file,'r+');fs.writeSync(fd,Buffer.from('z'),0,1,10);fs.closeSync(fd);
    await assert.rejects(s.withReadSnapshot({recordKeys:[k]},view=>collect(iterateJson(view,ref))),{code:'INVALID_ARTIFACT'});
});

test('diagnostic occurrence order, overflow dependency pinning and cleanup coherence',async t=>{
    const s=await fixture(t),k=key(0),owner=recordOwner(k);
    const wrappers=[{key:'1',raw:'first\nÁ',unknown:false},{key:'2',raw:'😀'.repeat(280000),extension:null},{key:'3',raw:'last',zero:0}];
    const childSource=()=>jsonChunks(wrappers[1]),childExpected=digestChunks(childSource()),childPointer='/diagnostics/1';
    const source=()=>diagnosticChunks(wrappers,()=>childPointer),rootExpected=digestChunks(source());
    const rootPath=payloadPath(s.storeId,owner,'/diagnostics','diagnostics',rootExpected.expectedHash),childPath=payloadPath(s.storeId,owner,childPointer,'extensions',childExpected.expectedHash);
    let rootRef,childRef;
    await s.withWriter(async w=>{
        w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId}});tx.appendIntent({id:'overflow',recordKey:k,files:[
            {ordinal:0,path:rootPath,hash:rootExpected.expectedHash,bytes:rootExpected.expectedBytes,payload:{owner,pointer:'/diagnostics',role:'diagnostics'}},
            {ordinal:1,path:childPath,hash:childExpected.expectedHash,bytes:childExpected.expectedBytes,payload:{owner,pointer:childPointer,role:'extensions',parentPointer:'/diagnostics'}}]});});
        rootRef=await w.publishPayload({owner,pointer:'/diagnostics',role:'diagnostics',source:source(),...rootExpected});
        childRef=await w.publishPayload({owner,pointer:childPointer,role:'extensions',parentPointer:'/diagnostics',source:childSource(),...childExpected});
        w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'overflow'}));
    });
    await s.withReadSnapshot({recordKeys:[k],payloadRoles:['diagnostics']},async view=>{
        assert.equal(view.child(rootRef,childPointer).hash,childRef.hash);assert.throws(()=>view.child(rootRef,'/other'),{code:'INVALID_REFERENCE'});
        // Prove overflow handles are pinned too, not opened lazily by path.
        fs.unlinkSync(path.join(s.root,childRef.path));
        const result=await collect(iterateDiagnostics(view,k));assert.deepEqual(result.map(r=>r.ordinal),[0,1,2]);assert.deepEqual(result[0].value,wrappers[0]);assert.deepEqual(result[2].value,wrappers[2]);assert.equal(result[1].kind,'stream');
        const digest=createHash('sha256');for await(const c of payloadChunks(view,result[1].ref,result[1].start,result[1].end))digest.update(c);assert.equal(digest.digest('hex'),childRef.hash);
    });
    await assert.rejects(s.withReadSnapshot({recordKeys:[k],payloadRoles:['diagnostics']},()=>{}),{code:'UNAVAILABLE'});
});

test('chunk limits, missing/unsafe artifacts, unregistered references and bounded handles',async t=>{
    const s=await fixture(t),k=key(0),owner=recordOwner(k),source=()=>jsonChunks({v:0});const expected=digestChunks(source());
    await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/x',role:'extensions',source:source(),...expected})),{code:'INVALID_STATE'});
    const oversized=Buffer.alloc(65537);await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/x',role:'extensions',evidenceOnly:true,source:[oversized],...digestChunks([oversized])})),{code:'RESOURCE_LIMIT'});
    const ref=await evidence(s,k,'/data','extensions',source,expected);const target=path.join(s.root,ref.path);fs.renameSync(target,target+'.saved');fs.symlinkSync(target+'.saved',target);
    await assert.rejects(s.withReadSnapshot({recordKeys:[k]},()=>{}),{code:'UNSAFE_PATH'});fs.unlinkSync(target);fs.renameSync(target+'.saved',target);
    let failedView;await assert.rejects(s.withReadSnapshot({recordKeys:[k]},view=>{failedView=view;throw Error('callback failure');}),/callback failure/);assert.throws(()=>failedView.assertOpen(),{code:'CLOSED'});
    await s.withWriter(async w=>{
        for(let i=0;i<256;i++){
            const p='/child'+i,relative=payloadPath(s.storeId,owner,p,'extensions',expected.expectedHash);
            w.transaction(tx=>tx.appendIntent({id:'many',recordKey:k,files:[{ordinal:i,path:relative,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:p,role:'extensions'}}]}));
            await w.publishPayload({owner,pointer:p,role:'extensions',source:source(),...expected});
        }
        w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'many'}));
    });let called=false;await assert.rejects(s.withReadSnapshot({recordKeys:[k]},()=>{called=true;}),{code:'RESOURCE_LIMIT'});assert.equal(called,false);
});

test('unresolved intents are unavailable even if public status is claim/done',async t=>{
    const s=await fixture(t),k=key(),source=()=>jsonChunks({known:0}),expected=digestChunks(source());const ref=await evidence(s,k,'/summary','summaries',source,expected);
    for(const phase of ['publish','cleanup']){
        await s.withWriter(w=>w.transaction(tx=>{if(phase==='cleanup')tx.setStatus({recordKey:k,status:'done'});tx.appendIntent({id:'intent',recordKey:k,phase,files:[{ordinal:0,path:ref.path,hash:ref.hash,bytes:ref.bytes}]});}));
        let called=false;await assert.rejects(s.withReadSnapshot({recordKeys:[k]},()=>{called=true;}),{code:'UNAVAILABLE'});assert.equal(called,false);assert.equal(fs.existsSync(path.join(s.root,ref.path)),true);
        if(phase==='publish'){
            // Exact payload retry checkpoints and removes the publication intent.
            await s.withWriter(async w=>{await w.publishPayload({owner:recordOwner(k),pointer:'/summary',role:'summaries',source:source(),...expected});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'intent'}));});
        }
    }
});

test('M1 regression: filtered snapshots pin late selected roots and their dependencies',async t=>{
    const s=await fixture(t),k=key(),owner=recordOwner(k),source=()=>jsonChunks(0),expected=digestChunks(source());
    const files=Array.from({length:259},(_,i)=>{
        const role=i===257?'summaries':'extensions',pointer='/p'+i;
        return {ordinal:i,path:payloadPath(s.storeId,owner,pointer,role,expected.expectedHash),hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer,role,...(i===258?{parentPointer:'/p257'}:{})}};
    });
    await s.withWriter(async w=>{
        w.transaction(tx=>tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId}}));
        for(let i=0;i<files.length;i+=128)w.transaction(tx=>tx.appendIntent({id:'selected',recordKey:k,files:files.slice(i,i+128)}));
        for(const file of files)await w.publishPayload({...file.payload,source:source(),...expected});
        w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'selected'}));
    });
    s.resetMetrics();let borrowed;
    await s.withReadSnapshot({recordKeys:[k],payloadRoles:['summaries']},async view=>{
        borrowed=view;const selected=view.payload(owner,'/p257'),child=view.child(selected,'/p258');
        assert.deepEqual((await collect(iterateJson(view,selected))).map(r=>r.value),[0]);
        assert.deepEqual((await collect(iterateJson(view,child))).map(r=>r.value),[0]);
        assert.throws(()=>view.payload(owner,'/p0'),{code:'INVALID_REFERENCE'});
    });
    assert.equal(s.metrics.payloadOpens,2);assert.ok(s.metrics.rows<20,'Excluded roots must not be materialized');assert.throws(()=>borrowed.assertOpen(),{code:'CLOSED'});
    const database=path.join(s.root,JSON.parse(fs.readFileSync(path.join(s.root,'manifest.json'))).database),db=new DatabaseSync(database,{readOnly:true});
    try{const plan=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM payloads WHERE owner_kind=? AND owner_key=? AND parent IS ? AND role=? ORDER BY ordinal,pointer LIMIT 257').all(owner.kind,owner.key,null,'summaries');assert.ok(plan.some(r=>r.detail.includes('payload_role')));assert.ok(plan.every(r=>!r.detail.includes('TEMP B-TREE')));}finally{db.close();}
    let called=false;await assert.rejects(s.withReadSnapshot({recordKeys:[k]},()=>{called=true;}),{code:'RESOURCE_LIMIT'});assert.equal(called,false);
});

test('malformed/trailing JSON and invalid diagnostic envelopes cannot become findings',async t=>{
    for(const [index,raw,role]of [[1,'{"a":}', 'extensions'],[2,'0 true','extensions'],[3,'{"ordinal":2,"wrapper":{}}\n','diagnostics'],[4,'{"ordinal":0,"wrapper":{}}','diagnostics']]){
        const s=await fixture(t),k=key(index),source=()=>[Buffer.from(raw)];const ref=await evidence(s,k,'/bad',role,source,digestChunks(source()));
        await assert.rejects(s.withReadSnapshot({recordKeys:[k]},view=>collect(role==='diagnostics'?iterateDiagnostics(view,k):iterateJson(view,ref))));
    }
});

test('large unknown reviewer values spill without replacing identity or checkpoints',async t=>{
    const s=await fixture(t),k=key(),record=recordOwner(k),taskId='review/unknown',owner={kind:'review',key:JSON.stringify([recordKey(k),taskId])};
    await s.withWriter(w=>w.transaction(tx=>{tx.insertEntity({kind:'record',key:record.key,ordinal:0,value:{mapId,status:'claim'}});tx.putReview({recordKey:k,taskId,ordinal:1,value:{examined:null,completed:null}});}));
    const unknown={nested:'Á'.repeat(40000)},source=()=>jsonChunks(unknown),expected=digestChunks(source()),relative=payloadPath(s.storeId,owner,'/unknown','extensions',expected.expectedHash);let ref;
    await s.withWriter(async w=>{
        w.transaction(tx=>tx.appendIntent({id:'review-extension',recordKey:k,files:[{ordinal:0,path:relative,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/unknown',role:'extensions'}}]}));
        ref=await w.publishPayload({owner,pointer:'/unknown',role:'extensions',source:source(),...expected});
        w.transaction(tx=>{tx.putReview({recordKey:k,taskId,ordinal:1,value:{examined:null,completed:null},payloadRefs:{'/unknown':ref}});tx.finishPublication({recordKey:k,operationId:'review-extension'});});
    });
    assert.equal(s.getReview(k,taskId).kind,'structured');const p=s.pageProperties(owner).rows;assert.equal(p.find(r=>r.pointer==='/completed').value,'null');assert.equal(p.find(r=>r.pointer==='/unknown').payload_pointer,'/unknown');
    await s.withReadSnapshot({recordKeys:[k],reviewKeys:[{recordKey:k,taskId}]},async view=>{const result=await collect(iterateJson(view,view.payload(owner,'/unknown')));assert.deepEqual(result[0].value,unknown);});
});

test('600 MiB streaming scale gate: fixed selections at 10/1000 metadata records', {timeout:100_000},async t=>{
    const root=fs.mkdtempSync(prefix);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    async function run(phase,timeout){
        const proc=spawn(process.execPath,['--max-old-space-size=192',new URL(import.meta.url).pathname,'scale-worker',root,phase],{stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='',timedOut=false;proc.stdout.on('data',c=>stdout+=c);proc.stderr.on('data',c=>stderr+=c);
        const timer=setTimeout(()=>{timedOut=true;proc.kill('SIGKILL');},timeout);
        const code=await new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('exit',resolve);});clearTimeout(timer);
        assert.equal(timedOut,false,`${phase} deadline; ${stderr}`);assert.equal(code,0,stderr+stdout);
        const result=JSON.parse(stdout.trim());assert.ok(result.maxRssBytes<=256*1024*1024);return result;
    }
    const generated=await run('generate',60_000),operations=await run('operations',30_000);
    assert.equal(generated.bytes,629_145_600);assert.equal(generated.metrics.payloadWriteBytes,generated.bytes);
    t.diagnostic(JSON.stringify({generated,operations}));
});
}

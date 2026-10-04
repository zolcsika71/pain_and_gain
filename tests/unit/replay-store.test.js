import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createFixtureStore, openStore, recordKey, recordOwner, runtimeCapabilities } from '../../tools/replay-store.js';
import { digestChunks, jsonChunks, payloadPath, streamOriginalValue } from '../../tools/replay-store-payloads.js';

const mapId = 'a'.repeat(64), replayId = 'b'.repeat(24);
const key = (i = 0, collection = 'log') => ({ collection, replayId, fingerprint:i.toString(16).padStart(64,'0') });
const moduleUrl = new URL('../../tools/replay-store.js',import.meta.url).href;
const rootPrefix = path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-');
async function fixture(t, options = {}) {
    const root = fs.mkdtempSync(rootPrefix);
    const store = await createFixtureStore({root,filesystem:'local-apfs',...options});
    t.after(() => { store.close(); fs.rmSync(root,{recursive:true,force:true}); });
    await store.withWriter(w => w.transaction(tx => {
        tx.insertEntity({kind:'map',key:mapId,ordinal:0,value:{unknown:null}});
        tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:{mapId}});
    }));
    return store;
}
async function insert(store, k = key(), value = {}, ordinal = 0) {
    await store.withWriter(w => w.transaction(tx => tx.insertEntity({kind:'record',key:recordKey(k),ordinal,value:{mapId,status:'pending',...value}})));
}
function properties(store, owner) {
    const rows = []; let cursor;
    do { const page = store.pageProperties(owner,cursor); rows.push(...page.rows); cursor = page.cursor; } while (cursor);
    return Object.fromEntries(rows.map(r=>[r.pointer, r.value === null ? {payloadPointer:r.payload_pointer} : JSON.parse(r.value)]));
}
async function child(code, args = [], timeout = 15_000) {
    const process = spawn(globalThis.process.execPath,['--input-type=module','-e',code,...args],{stdio:['ignore','pipe','pipe']});
    let output = '', errors = ''; process.stdout.on('data',c=>output+=c); process.stderr.on('data',c=>errors+=c);
    const timer = setTimeout(()=>process.kill('SIGKILL'),timeout);
    const result = await new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',(code,signal)=>resolve({code,signal,output,errors,pid:process.pid}));});
    clearTimeout(timer); return result;
}
function digestFile(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function dbFile(s) { return path.join(s.root,JSON.parse(fs.readFileSync(path.join(s.root,'manifest.json'))).database); }

test('M1 runtime gate and explicit temporary roots; no creation on rejected paths',async t=>{
    const capabilities=runtimeCapabilities();assert.equal(capabilities.node,process.version);assert.ok(capabilities.sqlite);assert.equal(capabilities.filesystem,'declared-local-apfs');assert.equal(capabilities.backup,true);
    for (const root of [undefined,process.cwd(),path.join(process.cwd(),'replay_logs'),rootPrefix+'../escape']) {
        await assert.rejects(createFixtureStore({root,filesystem:'local-apfs'}));
        await assert.rejects(openStore({root,mode:'read'}));
    }
    const root = fs.mkdtempSync(rootPrefix);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    await assert.rejects(createFixtureStore({root,filesystem:'network'}),{code:'UNSAFE_PATH'});assert.deepEqual(fs.readdirSync(root),[]);
    fs.writeFileSync(path.join(root,'unmanaged'),'keep');await assert.rejects(createFixtureStore({root,filesystem:'local-apfs'}));assert.equal(fs.readFileSync(path.join(root,'unmanaged'),'utf8'),'keep');
    const alias = rootPrefix+'alias-'+Date.now();fs.symlinkSync(root,alias);t.after(()=>fs.unlinkSync(alias));await assert.rejects(openStore({root:alias,mode:'read'}),{code:'UNSAFE_PATH'});
});

test('descriptor, marker, database and SQLite settings fail closed',async t=>{
    const s=await fixture(t),file=dbFile(s);const d=JSON.parse(fs.readFileSync(path.join(s.root,'manifest.json')));
    const read=await openStore({root:s.root,mode:'read'});await assert.rejects(read.withWriter(()=>{}));read.close();
    const db=new DatabaseSync(file);assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode,'delete');
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
    for(const name of ['store_meta','collections','maps','replays','records','reviews','retired','payloads','properties','outputs','operations','operation_files','migration_progress'])assert.ok(names.includes(name));
    assert.ok(db.prepare("PRAGMA table_list").all().filter(r=>names.includes(r.name)).every(r=>r.strict===1));db.close();
    await s.withWriter(()=>{});assert.equal(fs.statSync(file).mode & 0o777,0o600);
    const manifest=path.join(s.root,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({...d,version:4}));await assert.rejects(openStore({root:s.root,mode:'read'}),{code:'UNSUPPORTED_STORE'});
    fs.writeFileSync(manifest,JSON.stringify(d));fs.renameSync(file,file+'.saved');await assert.rejects(openStore({root:s.root,mode:'write'}),{code:'UNAVAILABLE'});assert.equal(fs.existsSync(file),false);fs.renameSync(file+'.saved',file);
    fs.writeFileSync(manifest,' '.repeat(16_385));await assert.rejects(openStore({root:s.root,mode:'read'}),{code:'RESOURCE_LIMIT'});fs.writeFileSync(manifest,JSON.stringify(d));
    const marker=path.join(s.root,'.storage-v3-fixture');const saved=fs.readFileSync(marker);fs.writeFileSync(marker,JSON.stringify({root:s.root,storeId:d.storeId,filesystem:'network'}));await assert.rejects(openStore({root:s.root,mode:'read'}));fs.writeFileSync(marker,saved);
    const native=new DatabaseSync(file);native.exec('PRAGMA journal_mode=WAL');native.close();await assert.rejects(openStore({root:s.root,mode:'read'}),{code:'UNSUPPORTED_RUNTIME'});
});

test('exact property, collection presence, review, retired and ordinal preservation',async t=>{
    const s=await fixture(t);const value={mapId,status:'pending',null:null,zero:0,no:false,unicode:'Á😀',unknown:{a:[0,false,null],empty:{}}};
    await insert(s,key(),value);
    await s.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'collection',key:'optional-absent',ordinal:8,value:{present:false}});
        tx.insertEntity({kind:'collection',key:'optional-empty',ordinal:2,value:{present:true,empty:[]}});
        tx.insertEntity({kind:'retired',key:recordKey(key(99,'score')),ordinal:10,value:{unknown:null}});
        tx.putReview({recordKey:key(),taskId:'task/Á',ordinal:4,value:{claimed:'original time',examined:null,completed:null,unknown:false}});
        tx.setProperty({owner:{kind:'review',key:JSON.stringify([recordKey(key()),'task/Á'])},pointer:'/extension',ordinal:9,value:0});
        for(let i=0;i<140;i++)tx.setProperty({owner:recordOwner(key()),pointer:'/extra'+i,ordinal:20+i,value:i});
    }));
    const found=properties(s,recordOwner(key()));for(const [name,v]of Object.entries(value))assert.deepEqual(found['/'+name],v);
    assert.equal(Object.hasOwn(found,'/missing'),false);assert.deepEqual(s.getReview(key(),'task/Á').value,{claimed:'original time',examined:null,completed:null,unknown:false,extension:0});
    assert.deepEqual(properties(s,{kind:'collection',key:'optional-empty'}),{'/present':true,'/empty':[]});
    assert.equal(s.getRecord(key(99,'score')).kind,'retired');assert.equal(s.getRecord(key(98)).kind,'missing');
    const before=s.pageRecords({collection:'log'}).generation;
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'record',key:recordKey(key(99,'score')),ordinal:0,value:{}}))),{code:'IDENTITY_CONFLICT'});
    assert.equal(s.pageRecords({collection:'log'}).generation,before);
    s.resetMetrics();s.getRecord(key());s.getReview(key(),'task/Á');s.pageProperties(recordOwner(key()));assert.equal(s.metrics.payloadOpens,0);assert.equal(s.metrics.payloadReadBytes,0);
});

test('bounded pages, stale/query cursors, invalid identities, rollback and escaped capabilities',async t=>{
    const s=await fixture(t);await s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<140;i++)tx.insertEntity({kind:'record',key:recordKey(key(i)),ordinal:i,value:{mapId}});}));
    const page=s.pageRecords({collection:'log'});assert.equal(page.rows.length,128);assert.equal(s.pageRecords({collection:'log',after:page.cursor}).rows.length,12);
    assert.throws(()=>s.pageRecords({collection:'log',limit:129}),{code:'RESOURCE_LIMIT'});
    assert.throws(()=>s.pageRecords({collection:'score',after:page.cursor}),{code:'STALE_CURSOR'});
    const queryDb=new DatabaseSync(dbFile(s));const plan=queryDb.prepare('EXPLAIN QUERY PLAN SELECT * FROM records WHERE collection=? AND (ordinal>? OR (ordinal=? AND key>?)) ORDER BY ordinal,key LIMIT ?').all('log',-1,-1,'',10);assert.ok(plan.some(r=>r.detail.includes('record_page')));assert.ok(plan.every(r=>!r.detail.includes('SCAN records')));queryDb.close();
    await s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:key(),taskId:'new',ordinal:0,value:{completed:null}})));
    assert.throws(()=>s.pageRecords({collection:'log',after:page.cursor}),{code:'STALE_CURSOR'});
    let escaped;await s.withWriter(w=>{escaped=w;w.transaction(tx=>{escaped.tx=tx;});});assert.throws(()=>escaped.transaction(()=>{}),{code:'CLOSED'});assert.throws(()=>escaped.tx.setStatus({recordKey:key(),status:'done'}),{code:'CLOSED'});
    await assert.rejects(s.withWriter(w=>w.transaction(async()=>{})),{code:'INVALID_STATE'});
    await assert.rejects(s.withWriter(w=>w.transaction(()=>w.transaction(()=>{}))),{code:'INVALID_STATE'});
    const gen=s.pageRecords({collection:'log'}).generation;
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>{tx.setProperty({owner:recordOwner(key()),pointer:'/would-rollback',ordinal:0,value:true});throw Error('rollback');})),/rollback/);
    assert.equal(s.pageRecords({collection:'log'}).generation,gen);assert.equal(Object.hasOwn(properties(s,recordOwner(key())),'/would-rollback'),false);
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:recordOwner(key()),pointer:'/huge',ordinal:0,value:'x'.repeat(65_537)}))),{code:'RESOURCE_LIMIT'});
    assert.throws(()=>s.getRecord({...key(),fingerprint:'X'.repeat(64)}),{code:'INVALID_IDENTITY'});
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.reserveOutput({recordKey:key(),path:'../outside',expectedHash:'a'.repeat(64),expectedBytes:0}))),{code:'UNSAFE_PATH'});
    await assert.rejects(s.withReadSnapshot({recordKeys:Array(65).fill(key())},()=>{}),{code:'RESOURCE_LIMIT'});
    await assert.rejects(s.withReadSnapshot({reviewKeys:Array.from({length:65},(_,i)=>({recordKey:key(i),taskId:'review'}))},()=>{}),{code:'RESOURCE_LIMIT'});
    const db=new DatabaseSync(dbFile(s));db.prepare('UPDATE store_meta SET generation=?').run(9_223_372_036_854_775_807n);db.close();
    assert.equal(typeof s.pageRecords({collection:'log'}).generation,'bigint');await assert.rejects(s.withWriter(w=>w.transaction(()=>{})),{code:'RESOURCE_LIMIT'});
});

test('output publication, score lifecycle separation, retry and owner conflicts',async t=>{
    const s=await fixture(t);const k=key(1,'score');await insert(s,k);
    const chunks=()=>jsonChunks({zero:0,unknown:null});const expected=digestChunks(chunks());const output='synthetic.response';
    await s.withWriter(async w=>{
        w.transaction(tx=>{tx.reserveOutput({recordKey:k,path:output,...expected});tx.appendIntent({id:'publish',recordKey:k,files:[{ordinal:0,path:output,hash:expected.expectedHash,bytes:expected.expectedBytes}]});});
        assert.throws(()=>w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'publish'})),{code:'INVALID_STATE'});
        await w.publishOutput({recordKey:k,path:output,source:chunks(),...expected});
        await w.publishOutput({recordKey:k,path:output,source:chunks(),...expected});
        w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'publish'}));
    });
    assert.equal(s.getRecord(k).status,'claim');assert.equal(s.pageOperations().rows.length,0);
    const hash=digestFile(path.join(s.root,output));await s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:'done'})));assert.equal(digestFile(path.join(s.root,output)),hash);
    await insert(s,key(2,'score'));await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.reserveOutput({recordKey:key(2,'score'),path:output,...expected}))));
    await assert.rejects(s.withWriter(w=>w.publishOutput({recordKey:key(2,'score'),path:output,source:chunks(),...expected})),{code:'OWNERSHIP_CONFLICT'});
    assert.equal(s.getRecord(key(2,'score')).output_path,null);
});

test('M1 regression: payload publication rejects reserved role mismatches without mutation',async t=>{
    const s=await fixture(t),k=key(),owner=recordOwner(k),source=()=>jsonChunks({v:0}),expected=digestChunks(source());await insert(s,k);
    const reserved=payloadPath(s.storeId,owner,'/summary','extensions',expected.expectedHash);
    const unreserved=payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash);
    await s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'role',recordKey:k,files:[{ordinal:0,path:reserved,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/summary',role:'extensions'}}]})));
    function checkpoints(){
        const db=new DatabaseSync(dbFile(s),{readOnly:true});
        try{return Object.fromEntries(['store_meta','records','properties','payloads','operations','operation_files'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));}finally{db.close();}
    }
    for(const ready of [false,true]){
        if(ready)await s.withWriter(w=>w.publishPayload({owner,pointer:'/summary',role:'extensions',source:source(),...expected}));
        const before=checkpoints(),file=path.join(s.root,reserved),stat=ready?fs.statSync(file,{bigint:true}):null;
        s.resetMetrics();let consumed=false;
        await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:(async function*(){consumed=true;yield* source();})(),...expected})),{code:'OWNERSHIP_CONFLICT'});
        assert.equal(consumed,false);assert.equal(s.metrics.fsWrites,0);assert.equal(s.metrics.fsReads,0);
        assert.deepEqual(checkpoints(),before);assert.equal(fs.existsSync(path.join(s.root,unreserved)),false);
        assert.equal(fs.existsSync(path.dirname(path.join(s.root,unreserved))),false);
        assert.equal(fs.existsSync(file),ready);
        if(ready){assert.equal(digestFile(file),expected.expectedHash);assert.deepEqual(fs.statSync(file,{bigint:true}),stat);}
        assert.equal(s.getRecord(k).status,'pending');
    }
    await s.withWriter(async w=>{
        for(let i=0;i<2;i++)await w.publishPayload({owner,pointer:'/summary',role:'extensions',source:source(),...expected});
        w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'role'}));
    });
    assert.equal(s.getRecord(k).status,'claim');assert.equal(s.pageOperations().rows.length,0);assert.equal(s.pagePayloads(owner).rows.length,1);
    await s.withReadSnapshot({recordKeys:[k]},async view=>{const chunks=[];await streamOriginalValue(view,view.payload(owner,'/summary'),c=>chunks.push(c));assert.equal(Buffer.concat(chunks).toString(),'{"v":0}');});
});

test('M1 regression: payload publication rejects a mismatched saved path before IO',async t=>{
    const s=await fixture(t),k=key(),owner=recordOwner(k),source=()=>jsonChunks({v:0}),expected=digestChunks(source());await insert(s,k);
    const reserved=payloadPath(s.storeId,owner,'/summary','extensions',expected.expectedHash);
    await s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'path',recordKey:k,files:[{ordinal:0,path:reserved,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/summary',role:'extensions'}}]})));
    // Seed a noncanonical saved reservation only in this synthetic database:
    // otherwise matching role/hash always derives the same path at reservation.
    const db=new DatabaseSync(dbFile(s));try{db.prepare('UPDATE payloads SET path=? WHERE owner_kind=? AND owner_key=? AND pointer=?').run('wrong-reserved.json',owner.kind,owner.key,'/summary');}finally{db.close();}
    function checkpoints(){const db=new DatabaseSync(dbFile(s),{readOnly:true});try{return Object.fromEntries(['store_meta','records','properties','payloads','operations','operation_files'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));}finally{db.close();}}
    const before=checkpoints(),directory=path.dirname(path.join(s.root,reserved)),entries=fs.readdirSync(directory);s.resetMetrics();let consumed=false;
    await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/summary',role:'extensions',source:(async function*(){consumed=true;yield* source();})(),...expected})),{code:'OWNERSHIP_CONFLICT'});
    assert.equal(consumed,false);assert.equal(s.metrics.fsWrites,0);assert.equal(s.metrics.fsReads,0);assert.deepEqual(checkpoints(),before);
    assert.equal(fs.existsSync(path.join(s.root,reserved)),false);assert.deepEqual(fs.readdirSync(directory),entries);assert.equal(fs.existsSync(path.join(s.root,'wrong-reserved.json')),false);
    // Restore the synthetic fixture's exact reservation; normal retry still works.
    const restore=new DatabaseSync(dbFile(s));try{restore.prepare('UPDATE payloads SET path=? WHERE owner_kind=? AND owner_key=? AND pointer=?').run(reserved,owner.kind,owner.key,'/summary');}finally{restore.close();}
    await s.withWriter(async w=>{for(let i=0;i<2;i++)await w.publishPayload({owner,pointer:'/summary',role:'extensions',source:source(),...expected});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'path'}));});
    assert.equal(s.getRecord(k).status,'claim');assert.equal(s.pageOperations().rows.length,0);assert.equal(s.pagePayloads(owner).rows.length,1);assert.equal(digestFile(path.join(s.root,reserved)),expected.expectedHash);
});

test('cross-kind ownership: payload-first reservations and cleanup preserve score evidence',async t=>{
    const s=await fixture(t),a=key(),b=key(1,'score'),owner=recordOwner(a),source=()=>jsonChunks({value:0}),expected=digestChunks(source());
    await insert(s,a);await insert(s,b,{},1);
    const p=payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash);
    const file={ordinal:0,path:p,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/summary',role:'summaries'}};
    await s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'a-publish',recordKey:a,files:[file]})));
    const generation=s.pageRecords({collection:'score'}).generation,before=s.getRecord(b),intent=s.pageOperations().rows;
    // Reservations must conflict before any final file exists, even for the same record.
    for(const k of [b,a])await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.reserveOutput({recordKey:k,path:p,...expected}))),{code:'OWNERSHIP_CONFLICT'});
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'map',key:'c'.repeat(64),ordinal:1,value:{path:p,hash:expected.expectedHash}}))),{code:'OWNERSHIP_CONFLICT'});
    assert.equal(s.pageRecords({collection:'score'}).generation,generation);assert.deepEqual(s.getRecord(b),before);assert.deepEqual(s.pageOperations().rows,intent);assert.equal(fs.existsSync(path.join(s.root,p)),false);
    await s.withWriter(async w=>{
        w.transaction(tx=>tx.appendIntent({id:'a-publish',recordKey:a,files:[file]}));
        for(let i=0;i<2;i++)await w.publishPayload({owner,pointer:'/summary',role:'summaries',source:source(),...expected});
        w.transaction(tx=>tx.finishPublication({recordKey:a,operationId:'a-publish'}));
        w.transaction(tx=>{tx.reserveOutput({recordKey:b,path:'score.response',...expected});tx.appendIntent({id:'b-publish',recordKey:b,files:[{ordinal:0,path:'score.response',hash:expected.expectedHash,bytes:expected.expectedBytes}]});});
        for(let i=0;i<2;i++)await w.publishOutput({recordKey:b,path:'score.response',source:source(),...expected});
        w.transaction(tx=>tx.finishPublication({recordKey:b,operationId:'b-publish'}));
    });
    const scoreBefore=s.getRecord(b),scoreHash=digestFile(path.join(s.root,'score.response'));
    await s.withWriter(async w=>{
        w.transaction(tx=>{tx.setStatus({recordKey:a,status:'done'});tx.appendIntent({id:'a-clean',recordKey:a,phase:'cleanup',files:[{ordinal:0,path:p,hash:expected.expectedHash,bytes:expected.expectedBytes,originalPresent:true}]});});
        assert.throws(()=>w.transaction(tx=>tx.appendIntent({id:'wrong-clean',recordKey:a,phase:'cleanup',files:[{ordinal:0,path:'score.response',hash:expected.expectedHash,bytes:expected.expectedBytes,originalPresent:true}]})),{code:'OWNERSHIP_CONFLICT'});
        await w.deleteFile({operationId:'a-clean',ordinal:0});
        w.transaction(tx=>tx.finishPublication({recordKey:a,operationId:'a-clean',retire:true}));
    });
    assert.equal(s.getRecord(a).kind,'retired');assert.deepEqual(s.getRecord(b),scoreBefore);assert.equal(digestFile(path.join(s.root,'score.response')),scoreHash);
    await s.withReadSnapshot({recordKeys:[b]},view=>{
        const artifact=view.artifact({path:'score.response',hash:expected.expectedHash,bytes:expected.expectedBytes}),buffer=Buffer.alloc(expected.expectedBytes);
        assert.equal(view.read(artifact,buffer,0),buffer.length);assert.equal(buffer.toString(),'{"value":0}');
    });
});

test('cross-kind ownership: output-first and map-first reservations reject pending payloads',async t=>{
    for(const first of ['output','map']){
        const s=await fixture(t),a=key(),b=key(1,'score'),owner=recordOwner(a),source=()=>jsonChunks(0),expected=digestChunks(source());
        await insert(s,a);await insert(s,b,{},1);
        const p=payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash);
        fs.mkdirSync(path.dirname(path.join(s.root,p)),{recursive:true});
        await s.withWriter(w=>w.transaction(tx=>{
            if(first==='output')tx.reserveOutput({recordKey:b,path:p,...expected});
            else tx.insertEntity({kind:'map',key:'c'.repeat(64),ordinal:1,value:{path:p,hash:expected.expectedHash}});
        }));
        const before=s.getRecord(b),generation=s.pageRecords({collection:'log'}).generation;
        await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'conflict',recordKey:a,files:[{ordinal:0,path:p,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/summary',role:'summaries'}}]}))),{code:'OWNERSHIP_CONFLICT'});
        await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:source(),...expected})),{code:'OWNERSHIP_CONFLICT'});
        if(first==='map')await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.reserveOutput({recordKey:b,path:p,...expected}))),{code:'OWNERSHIP_CONFLICT'});
        assert.deepEqual(s.getRecord(b),before);assert.equal(s.pageRecords({collection:'log'}).generation,generation);assert.equal(s.pageOperations().rows.length,0);assert.equal(s.pagePayloads(owner).rows.length,0);assert.equal(fs.existsSync(path.join(s.root,p)),false);
        if(first==='output'){
            await s.withWriter(async w=>{
                w.transaction(tx=>tx.appendIntent({id:'score-publish',recordKey:b,files:[{ordinal:0,path:p,hash:expected.expectedHash,bytes:expected.expectedBytes}]}));
                await w.publishOutput({recordKey:b,path:p,source:source(),...expected});w.transaction(tx=>tx.finishPublication({recordKey:b,operationId:'score-publish'}));
            });
            const ready=s.getRecord(b),hash=digestFile(path.join(s.root,p));
            await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:source(),...expected})),{code:'OWNERSHIP_CONFLICT'});
            assert.deepEqual(s.getRecord(b),ready);assert.equal(digestFile(path.join(s.root,p)),hash);
            await s.withReadSnapshot({recordKeys:[b]},view=>{const buffer=Buffer.alloc(1);assert.equal(view.read(view.artifact({path:p,hash,bytes:1}),buffer,0),1);assert.equal(buffer.toString(),'0');});
        }
    }
});

test('cross-kind ownership: evidence-only publication reserves its path through awaits',async t=>{
    const s=await fixture(t),a=key(),b=key(1,'score'),owner=recordOwner(a),source=()=>jsonChunks({value:0}),expected=digestChunks(source());await insert(s,b);
    const p=payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash);
    let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
    await s.withWriter(async w=>{
        const publishing=w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:(async function*(){entered();await gate;yield* source();})(),...expected});
        await started;
        try{
            assert.equal(fs.existsSync(path.join(s.root,p)),false);
            assert.throws(()=>w.transaction(tx=>tx.reserveOutput({recordKey:b,path:p,...expected})),{code:'OWNERSHIP_CONFLICT'});
            assert.throws(()=>w.transaction(tx=>tx.insertEntity({kind:'map',key:'c'.repeat(64),ordinal:1,value:{path:p,hash:expected.expectedHash}})),{code:'OWNERSHIP_CONFLICT'});
        }finally{release();await publishing;}
        const ref=await publishing,hash=digestFile(path.join(s.root,p));
        assert.throws(()=>w.transaction(tx=>tx.insertEntity({kind:'map',key:'c'.repeat(64),ordinal:1,value:{path:p,hash:expected.expectedHash}})),{code:'OWNERSHIP_CONFLICT'});
        assert.equal(digestFile(path.join(s.root,p)),hash);assert.equal(s.getRecord(b).output_path,null);assert.equal(s.getRecord(a).kind,'missing');
        const retry=await w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:source(),...expected});assert.deepEqual(retry,ref);
        w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(a),ordinal:1,value:{mapId}});tx.finishPublication({recordKey:a,payloadRefs:[ref]});});
    });
    await s.withReadSnapshot({recordKeys:[a]},async view=>{const chunks=[];await streamOriginalValue(view,view.payload(owner,'/summary'),c=>chunks.push(c));assert.equal(Buffer.concat(chunks).toString(),'{"value":0}');});
});

test('cross-kind ownership: publication rechecks pre-existing conflicting reservations',async t=>{
    for(const mode of ['payload','output'])for(const other of mode==='payload'?['output','map']:['payload','map']){
        const s=await fixture(t),a=key(),b=key(1,'score'),owner=recordOwner(a),source=()=>jsonChunks(0),expected=digestChunks(source());await insert(s,a);await insert(s,b,{},1);
        const p=payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash);
        await s.withWriter(w=>w.transaction(tx=>{
            if(mode==='output')tx.reserveOutput({recordKey:b,path:p,...expected});
            tx.appendIntent({id:'publish',recordKey:mode==='payload'?a:b,files:[{ordinal:0,path:p,hash:expected.expectedHash,bytes:expected.expectedBytes,...(mode==='payload'?{payload:{owner,pointer:'/summary',role:'summaries'}}:{})}]});
        }));
        // A synthetic database seeded with the old defect must not publish either kind.
        const db=new DatabaseSync(dbFile(s));
        try{
            if(other==='map')db.prepare('INSERT INTO maps VALUES (?,?,?,?,?)').run('c'.repeat(64),p,expected.expectedHash,null,1);
            if(other==='output')db.prepare('INSERT INTO outputs VALUES (?,?,?,?,?,?,?)').run(p,b.collection,b.replayId,b.fingerprint,expected.expectedHash,expected.expectedBytes,'pending');
            if(other==='payload')db.prepare('INSERT INTO payloads VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(owner.kind,owner.key,'/summary',null,'summaries',p,expected.expectedHash,expected.expectedBytes,null,'pending',0,'json-v1');
        }finally{db.close();}
        const before=[s.getRecord(a),s.getRecord(b),s.pageOperations().rows];s.resetMetrics();
        await assert.rejects(s.withWriter(w=>mode==='payload'?w.publishPayload({owner,pointer:'/summary',role:'summaries',source:source(),...expected}):w.publishOutput({recordKey:b,path:p,source:source(),...expected})),{code:'OWNERSHIP_CONFLICT'});
        assert.equal(s.metrics.payloadWriteBytes,0);assert.equal(fs.existsSync(path.join(s.root,p)),false);assert.deepEqual([s.getRecord(a),s.getRecord(b),s.pageOperations().rows],before);
    }
});

test('cross-kind ownership: competing processes cannot own one pending path',async t=>{
    const s=await fixture(t),a=key(),b=key(1,'score'),owner=recordOwner(a),source=()=>jsonChunks(0),expected=digestChunks(source());await insert(s,a);await insert(s,b,{},1);
    const p=payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash),file={ordinal:0,path:p,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/summary',role:'summaries'}};
    const code=`import {openStore} from ${JSON.stringify(moduleUrl)};const s=await openStore({root:process.argv[1],mode:'write'}),a=JSON.parse(process.argv[2]),b=JSON.parse(process.argv[3]),file=JSON.parse(process.argv[4]);await s.withWriter(async w=>{w.transaction(tx=>{if(process.argv[5]==='payload')tx.appendIntent({id:'payload-publish',recordKey:a,files:[file]});else{tx.reserveOutput({recordKey:b,path:file.path,expectedBytes:file.bytes,expectedHash:file.hash});tx.appendIntent({id:'output-publish',recordKey:b,files:[{ordinal:0,path:file.path,hash:file.hash,bytes:file.bytes}]});}});await new Promise(r=>setTimeout(r,100));});s.close();`;
    const results=await Promise.all(['payload','output'].map(kind=>child(code,[s.root,JSON.stringify(a),JSON.stringify(b),JSON.stringify(file),kind])));
    assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));assert.match(results.find(r=>r.code!==0).errors,/OWNERSHIP_CONFLICT/);
    assert.equal(s.pageOperations().rows.length,1);assert.equal(fs.existsSync(path.join(s.root,p)),false);
    const payloadWon=s.pagePayloads(owner).rows.length===1;assert.equal(s.getRecord(b).output_path,payloadWon?null:p);assert.equal(s.getRecord(a).status,'pending');assert.equal(s.getRecord(b).status,'pending');
    await s.withWriter(async w=>{
        if(payloadWon)await w.publishPayload({owner,pointer:'/summary',role:'summaries',source:source(),...expected});else await w.publishOutput({recordKey:b,path:p,source:source(),...expected});
        w.transaction(tx=>tx.finishPublication({recordKey:payloadWon?a:b,operationId:payloadWon?'payload-publish':'output-publish'}));
    });
    await s.withReadSnapshot({recordKeys:[payloadWon?a:b]},()=>{});
});

test('publication failure boundaries retain pending and exact retries recover',async t=>{
    const boundaries=['transaction-commit','temporary-write','temporary-fsync','exclusive-publication','directory-fsync','verification'];
    for(const boundary of boundaries){
        let armed=false,hit=false;const s=await fixture(t,{fault:name=>{if(armed&&!hit&&name===boundary){hit=true;throw Object.assign(Error(boundary),{code:'EIO'});}}});
        const k=key();await insert(s,k);const expected=digestChunks(jsonChunks({retained:true}));const owner=recordOwner(k),p='/diagnostics';const relative=payloadPath(s.storeId,owner,p,'extensions',expected.expectedHash);
        const reserve=w=>w.transaction(tx=>tx.appendIntent({id:'op',recordKey:k,files:[{ordinal:0,path:relative,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:p,role:'extensions'}}]}));
        if(boundary==='transaction-commit'){armed=true;await assert.rejects(s.withWriter(reserve));assert.equal(s.pageOperations().rows.length,0);armed=false;await s.withWriter(reserve);}
        else {await s.withWriter(reserve);armed=true;await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:p,role:'extensions',source:jsonChunks({retained:true}),...expected})));}
        assert.ok(hit);assert.equal(s.getRecord(k).status,'pending');armed=false;
        await s.withWriter(async w=>{await w.publishPayload({owner,pointer:p,role:'extensions',source:jsonChunks({retained:true}),...expected});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'op'}));});
        assert.equal(s.getRecord(k).status,'claim');assert.equal(s.pagePayloads(owner).rows.length,1);
        await s.withReadSnapshot({recordKeys:[k]},async view=>{const output=[];await streamOriginalValue(view,view.payload(owner,p),c=>output.push(c));assert.equal(Buffer.concat(output).toString(),'{"retained":true}');});
    }
});

test('M1 regression: publication retry completes directory fsync before claim',async t=>{
    for(const mode of ['payload','output']){
        let armed=false;const s=await fixture(t,{fault:name=>{if(armed&&name==='directory-fsync')throw Object.assign(Error('interrupted directory fsync'),{code:'EIO'});}});
        const k=key(0,mode==='output'?'score':'log'),owner=recordOwner(k),source=()=>jsonChunks({v:0}),expected=digestChunks(source());await insert(s,k);
        const relative=mode==='output'?'responses/score.response':payloadPath(s.storeId,owner,'/summary','summaries',expected.expectedHash);
        await s.withWriter(w=>w.transaction(tx=>{
            if(mode==='output')tx.reserveOutput({recordKey:k,path:relative,...expected});
            tx.appendIntent({id:'retry',recordKey:k,files:[{ordinal:0,path:relative,hash:expected.expectedHash,bytes:expected.expectedBytes,...(mode==='payload'?{payload:{owner,pointer:'/summary',role:'summaries'}}:{})}]});
        }));
        const publish=w=>mode==='output'?w.publishOutput({recordKey:k,path:relative,source:source(),...expected}):w.publishPayload({owner,pointer:'/summary',role:'summaries',source:source(),...expected});
        armed=true;await assert.rejects(s.withWriter(publish),{code:'EIO'});armed=false;
        assert.equal(fs.existsSync(path.join(s.root,relative)),true);assert.equal(s.getRecord(k).status,'pending');
        const parent=fs.statSync(path.dirname(path.join(s.root,relative))),original=fs.fsyncSync;let failOnce=true,syncs=0;
        fs.fsyncSync=fd=>{
            const st=fs.fstatSync(fd);
            if(st.isDirectory()&&st.dev===parent.dev&&st.ino===parent.ino){syncs++;assert.equal(s.getRecord(k).status,'pending');if(failOnce){failOnce=false;throw Object.assign(Error('retry fsync EIO'),{code:'EIO'});}}
            return original(fd);
        };
        try{
            await assert.rejects(s.withWriter(publish),{code:'EIO'});
            assert.equal(s.getRecord(k).status,'pending');assert.equal(s.pageOperations().rows.length,1);
            await s.withWriter(async w=>{await publish(w);w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'retry'}));});
        }finally{fs.fsyncSync=original;}
        assert.equal(syncs,2);assert.equal(s.getRecord(k).status,'claim');assert.equal(s.pageOperations().rows.length,0);
    }
});

test('M1 regression: score deletion and retirement require persisted retiring state',async t=>{
    const s=await fixture(t),k=key(0,'score'),source=()=>jsonChunks({score:0}),expected=digestChunks(source());await insert(s,k);
    await s.withWriter(async w=>{
        w.transaction(tx=>{tx.reserveOutput({recordKey:k,path:'score.response',...expected});tx.appendIntent({id:'pub',recordKey:k,files:[{ordinal:0,path:'score.response',hash:expected.expectedHash,bytes:expected.expectedBytes}]});});
        await w.publishOutput({recordKey:k,path:'score.response',source:source(),...expected});
        w.transaction(tx=>{tx.finishPublication({recordKey:k,operationId:'pub'});tx.setStatus({recordKey:k,status:'done'});tx.appendIntent({id:'clean',recordKey:k,phase:'cleanup',files:[{ordinal:0,path:'score.response',hash:expected.expectedHash,bytes:expected.expectedBytes,originalPresent:true}]});});
    });
    const file=path.join(s.root,'score.response'),hash=digestFile(file);
    await assert.rejects(s.withWriter(w=>w.deleteFile({operationId:'clean',ordinal:0})),{code:'INVALID_STATE'});
    assert.equal(s.getRecord(k).status,'done');assert.equal(digestFile(file),hash);
    await s.withWriter(async w=>{
        let attempted;
        assert.throws(()=>w.transaction(tx=>{tx.setStatus({recordKey:k,status:'retiring'});attempted=w.deleteFile({operationId:'clean',ordinal:0});throw Error('retiring rollback');}),/retiring rollback/);
        await assert.rejects(attempted,{code:'INVALID_STATE'});
    });
    assert.equal(s.getRecord(k).status,'done');assert.equal(digestFile(file),hash);
    // Policy orchestration explicitly commits retiring, rather than the file primitive inferring it.
    await s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:'retiring'})));
    const reopened=await openStore({root:s.root,mode:'write'});assert.equal(reopened.getRecord(k).status,'retiring');
    try{
        await reopened.withWriter(async w=>{await w.deleteFile({operationId:'clean',ordinal:0});await w.deleteFile({operationId:'clean',ordinal:0});});
        assert.equal(fs.existsSync(file),false);
        await reopened.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:'done'})));
        await assert.rejects(reopened.withWriter(w=>w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'clean',retire:true}))),{code:'INVALID_STATE'});
        assert.equal(reopened.getRecord(k).status,'done');
        await reopened.withWriter(w=>w.transaction(tx=>{tx.setStatus({recordKey:k,status:'retiring'});tx.finishPublication({recordKey:k,operationId:'clean',retire:true});}));
        assert.equal(reopened.getRecord(k).kind,'retired');
    }finally{reopened.close();}
});

for(const collection of ['log','score'])test(`M1 regression: ${collection} cleanup retries directory fsync before deletion checkpoint`,async t=>{
    const s=await fixture(t),k=key(1,collection),owner=recordOwner(k),keep=key(2),keepOwner=recordOwner(keep);
    const source=()=>jsonChunks({value:0}),expected=digestChunks(source());let ref,keepRef;
    await s.withWriter(async w=>{
        keepRef=await w.publishPayload({owner:keepOwner,pointer:'/keep',role:'extensions',source:jsonChunks({keep:true}),evidenceOnly:true,...digestChunks(jsonChunks({keep:true}))});
        w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(keep),ordinal:2,value:{mapId,unknown:{zero:0,no:false}}});tx.finishPublication({recordKey:keep,payloadRefs:[keepRef]});tx.putReview({recordKey:keep,taskId:'retain',ordinal:0,value:{examined:null,completed:null}});});
        if(collection==='log')ref=await w.publishPayload({owner,pointer:'/summary',role:'summaries',source:source(),evidenceOnly:true,...expected});
        w.transaction(tx=>{
            tx.insertEntity({kind:'record',key:recordKey(k),ordinal:1,value:{mapId}});
            if(collection==='log')tx.finishPublication({recordKey:k,payloadRefs:[ref]});
            else{tx.reserveOutput({recordKey:k,path:'target/score.response',...expected});tx.appendIntent({id:'publish',recordKey:k,files:[{ordinal:0,path:'target/score.response',hash:expected.expectedHash,bytes:expected.expectedBytes}]});}
        });
        if(collection==='score'){ref=await w.publishOutput({recordKey:k,path:'target/score.response',source:source(),...expected});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'publish'}));}
        w.transaction(tx=>{tx.setStatus({recordKey:k,status:collection==='log'?'done':'retiring'});tx.appendIntent({id:'cleanup',recordKey:k,phase:'cleanup',files:[{ordinal:0,path:ref.path,hash:ref.hash,bytes:ref.bytes,originalPresent:true}]});});
    });
    const file=path.join(s.root,ref.path),directory=fs.statSync(path.dirname(file)),keepFile=path.join(s.root,keepRef.path);
    const keepState={record:s.getRecord(keep),properties:properties(s,keepOwner),review:s.getReview(keep,'retain'),map:s.getMap(mapId),replay:s.getReplay(replayId)};
    const identity=()=>{const st=fs.statSync(keepFile,{bigint:true});return [st.ino,st.size,st.mtimeNs,st.ctimeNs,digestFile(keepFile)];},keepIdentity=identity();
    const preserved=()=>{assert.deepEqual({record:s.getRecord(keep),properties:properties(s,keepOwner),review:s.getReview(keep,'retain'),map:s.getMap(mapId),replay:s.getReplay(replayId)},keepState);assert.deepEqual(identity(),keepIdentity);};
    function checkpoints(){const db=new DatabaseSync(dbFile(s),{readOnly:true});try{return Object.fromEntries(['store_meta','records','reviews','properties','payloads','outputs','operations','operation_files','retired'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));}finally{db.close();}}
    const before=checkpoints(),original=fs.fsyncSync;let failSync=true,syncs=0;
    fs.fsyncSync=fd=>{
        const st=fs.fstatSync(fd);
        if(st.isDirectory()&&st.dev===directory.dev&&st.ino===directory.ino){
            syncs++;assert.equal(fs.existsSync(file),false);
            if(failSync){assert.deepEqual(checkpoints(),before);throw Object.assign(Error('cleanup directory fsync EIO'),{code:'EIO'});}
        }
        return original(fd);
    };
    try{
        for(let attempt=1;attempt<=2;attempt++){
            await assert.rejects(s.withWriter(w=>w.deleteFile({operationId:'cleanup',ordinal:0})),{code:'EIO'});
            assert.equal(syncs,attempt);assert.equal(fs.existsSync(file),false);assert.deepEqual(checkpoints(),before);preserved();
            await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'cleanup',retire:true}))),{code:'INVALID_STATE'});
            assert.deepEqual(checkpoints(),before);
        }
        failSync=false;
        await s.withWriter(w=>w.deleteFile({operationId:'cleanup',ordinal:0}));assert.equal(syncs,3);
        assert.equal(checkpoints().operation_files[0].state,'deleted');assert.equal(s.pageOperations().rows[0].id,'cleanup');
        assert.equal(s.getRecord(k).status,collection==='log'?'done':'retiring');preserved();
        await s.withWriter(w=>w.deleteFile({operationId:'cleanup',ordinal:0}));assert.equal(syncs,4);preserved();
    }finally{fs.fsyncSync=original;}
    await s.withWriter(w=>w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'cleanup',retire:true})));
    assert.equal(s.getRecord(k).kind,'retired');assert.equal(s.pageOperations().rows.length,0);preserved();
    await s.withReadSnapshot({recordKeys:[keep],reviewKeys:[{recordKey:keep,taskId:'retain'}]},async view=>{const chunks=[];await streamOriginalValue(view,view.payload(keepOwner,'/keep'),c=>chunks.push(c));assert.equal(Buffer.concat(chunks).toString(),'{"keep":true}');});
});

test('M1 regression: review lookup reflects original-property checkpoint updates',async t=>{
    const s=await fixture(t),k=key(),taskId='task/Á',owner={kind:'review',key:JSON.stringify([recordKey(k),taskId])};await insert(s,k);
    await s.withWriter(w=>w.transaction(tx=>{
        tx.putReview({recordKey:k,taskId,ordinal:3,value:{examinedAt:null,completedAt:null,unknown:{zero:0,no:false}}});
        tx.setProperty({owner,pointer:'/examinedAt',ordinal:0,value:'2026-10-03T12:00:00Z'});
    }));
    const expected={examinedAt:'2026-10-03T12:00:00Z',completedAt:null,unknown:{zero:0,no:false}};
    assert.deepEqual(s.getReview(k,taskId),{value:expected,ordinal:3});
    const other=await openStore({root:s.root,mode:'read'});try{assert.deepEqual(other.getReview(k,taskId).value,expected);}finally{other.close();}
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>{tx.setProperty({owner,pointer:'/completedAt',ordinal:1,value:'not-committed'});throw Error('rollback');})),/rollback/);
    assert.deepEqual(s.getReview(k,taskId).value,expected);
    await s.withWriter(w=>w.transaction(tx=>{tx.setProperty({owner,pointer:'/unknown~1name~0',ordinal:4,value:false});tx.setProperty({owner,pointer:'/__proto__',ordinal:5,value:{retained:true}});}));
    const updated=s.getReview(k,taskId).value;assert.equal(updated['unknown/name~'],false);assert.equal(Object.hasOwn(updated,'__proto__'),true);assert.deepEqual(updated.__proto__,{retained:true});
    assert.equal(Object.getPrototypeOf(updated),Object.prototype);
    await s.withWriter(w=>w.transaction(tx=>{for(let i=0;i<129;i++)tx.setProperty({owner,pointer:'/extra'+i,ordinal:6+i,value:i});}));
    s.resetMetrics();assert.equal(s.getReview(k,taskId).kind,'structured');assert.ok(s.metrics.rows<=130);assert.equal(s.metrics.payloadReadBytes,0);
    assert.equal(properties(s,owner)['/examinedAt'],expected.examinedAt);
});

test('claim-commit failure, changed destinations and evidence-only forged references',async t=>{
    let armed=false;const s=await fixture(t,{fault:name=>{if(armed&&name==='transaction-commit')throw Error('claim commit');}});
    const k=key(),owner=recordOwner(k),expected=digestChunks(jsonChunks({v:0}));
    let ref;await s.withWriter(async w=>{ref=await w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:jsonChunks({v:0}),...expected});armed=true;assert.throws(()=>w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId}});tx.finishPublication({recordKey:k,payloadRefs:[ref]});}),/claim commit/);armed=false;});
    assert.equal(s.getRecord(k).kind,'missing');assert.equal(fs.existsSync(path.join(s.root,ref.path)),true);assert.equal(fs.readdirSync(s.root).filter(n=>n.endsWith('.jsonl')).length,0);
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId}});tx.finishPublication({recordKey:k,payloadRefs:[ref]});})),{code:'INVALID_ARTIFACT'});
    await s.withWriter(async w=>{ref=await w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:jsonChunks({v:0}),...expected});w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId}});tx.finishPublication({recordKey:k,payloadRefs:[ref]});});});
    fs.writeFileSync(path.join(s.root,ref.path),'changed');await assert.rejects(s.withWriter(w=>w.publishPayload({owner,pointer:'/summary',role:'summaries',evidenceOnly:true,source:jsonChunks({v:0}),...expected})),{code:'INVALID_ARTIFACT'});
});

test('two processes serialize updates and one output owner; live/stale/malformed locks',async t=>{
    const s=await fixture(t);await insert(s,key());await insert(s,key(1),{},1);
    const code=`import {openStore,recordOwner} from ${JSON.stringify(moduleUrl)};const s=await openStore({root:process.argv[1],mode:'write'});const k=JSON.parse(process.argv[2]);await s.withWriter(async w=>{w.transaction(tx=>{tx.putReview({recordKey:k,taskId:process.argv[3],ordinal:0,value:{completed:null}});tx.setProperty({owner:recordOwner(k),pointer:'/p'+process.argv[3],ordinal:100,value:process.argv[3]});});await new Promise(r=>setTimeout(r,150));});s.close();`;
    const results=await Promise.all(['one','two'].map(task=>child(code,[s.root,JSON.stringify(key()),task])));assert.ok(results.every(r=>r.code===0),JSON.stringify(results));
    assert.equal(s.getReview(key(),'one').value.completed,null);assert.equal(s.getReview(key(),'two').value.completed,null);assert.equal(properties(s,recordOwner(key()))['/ptwo'],'two');
    const race=`import {openStore} from ${JSON.stringify(moduleUrl)};const s=await openStore({root:process.argv[1],mode:'write'});await s.withWriter(w=>w.transaction(tx=>tx.reserveOutput({recordKey:JSON.parse(process.argv[2]),path:'race.response',expectedBytes:0,expectedHash:'e'.repeat(64)})));`;
    const races=await Promise.all([key(),key(1)].map(k=>child(race,[s.root,JSON.stringify(k)])));assert.equal(races.filter(r=>r.code===0).length,1);
    const lock=path.join(s.root,'.manifest.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'live'}));fs.utimesSync(lock,new Date(0),new Date(0));await assert.rejects(s.withWriter(()=>{}),{code:'LOCKED'});assert.equal(JSON.parse(fs.readFileSync(lock)).token,'live');fs.unlinkSync(lock);
    const killed=await child(`process.kill(process.pid,'SIGKILL')`);fs.writeFileSync(lock,JSON.stringify({pid:killed.pid,token:'terminated'}));fs.utimesSync(lock,new Date(0),new Date(0));await s.withWriter(()=>{});assert.equal(fs.existsSync(lock),false);
    fs.writeFileSync(lock,'');fs.utimesSync(lock,new Date(0),new Date(0));await s.withWriter(()=>{});assert.equal(fs.existsSync(lock),false);
    fs.writeFileSync(lock,'malformed');await assert.rejects(s.withWriter(()=>{}),{code:'UNSAFE_LOCK'});assert.equal(fs.readFileSync(lock,'utf8'),'malformed');fs.unlinkSync(lock);
});

test('process death leaves pending and read-only hot journal fails without recovery',async t=>{
    const s=await fixture(t);await insert(s,key());
    const crash=`import {openStore} from ${JSON.stringify(moduleUrl)};const s=await openStore({root:process.argv[1],mode:'write'});await s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'durable',recordKey:JSON.parse(process.argv[2]),files:[]})));await s.withWriter(()=>process.kill(process.pid,'SIGKILL'));`;
    const result=await child(crash,[s.root,JSON.stringify(key())]);assert.equal(result.signal,'SIGKILL');assert.equal(s.getRecord(key()).status,'pending');assert.equal(s.pageOperations().rows[0].id,'durable');
    const lock=path.join(s.root,'.manifest.lock');fs.utimesSync(lock,new Date(0),new Date(0));await s.withWriter(()=>{});
    const hot=`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA synchronous=FULL;PRAGMA cache_size=8;BEGIN IMMEDIATE');const q=db.prepare('INSERT INTO properties VALUES (?,?,?,?,?,NULL)');for(let i=0;i<1000;i++)q.run('root','root','/crash'+i,i,JSON.stringify('x'.repeat(60000)));process.kill(process.pid,'SIGKILL');`;
    const journalCrash=await child(hot,[dbFile(s)],15_000);assert.equal(journalCrash.signal,'SIGKILL');const journal=dbFile(s)+'-journal';assert.ok(fs.statSync(journal).size>0);const before=digestFile(journal);
    await assert.rejects(openStore({root:s.root,mode:'read'}),{code:'RECOVERY_REQUIRED'});assert.equal(digestFile(journal),before);
    await s.withWriter(()=>{});assert.equal(s.pageProperties({kind:'root',key:'root'}).rows.length,0);assert.equal(s.getRecord(key()).status,'pending');
});

test('pinned snapshot survives a second writer cleanup, and closes on failure',async t=>{
    const s=await fixture(t),k=key(),owner=recordOwner(k),expected=digestChunks(jsonChunks({immutable:'yes'}));let ref;
    await s.withWriter(async w=>{ref=await w.publishPayload({owner,pointer:'/summary',role:'summaries',source:jsonChunks({immutable:'yes'}),evidenceOnly:true,...expected});w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId}});tx.finishPublication({recordKey:k,payloadRefs:[ref]});});});
    let escaped;await s.withReadSnapshot({recordKeys:[k]},async view=>{
        escaped=view;
        const cleanup=`import {openStore} from ${JSON.stringify(moduleUrl)};const s=await openStore({root:process.argv[1],mode:'write'}),k=JSON.parse(process.argv[2]),r=JSON.parse(process.argv[3]);await s.withWriter(async w=>{w.transaction(tx=>{tx.setStatus({recordKey:k,status:'done'});tx.appendIntent({id:'clean',recordKey:k,phase:'cleanup',files:[{ordinal:0,path:r.path,hash:r.hash,bytes:r.bytes,originalPresent:true}]});});await w.deleteFile({operationId:'clean',ordinal:0});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'clean',retire:true}));});`;
        const result=await child(cleanup,[s.root,JSON.stringify(k),JSON.stringify(ref)]);assert.equal(result.code,0,result.errors);assert.equal(fs.existsSync(path.join(s.root,ref.path)),false);
        const chunks=[];await streamOriginalValue(view,view.payload(owner,'/summary'),c=>chunks.push(c));assert.equal(Buffer.concat(chunks).toString(),'{"immutable":"yes"}');assert.equal(view.records.get(recordKey(k)).status,'claim');
    });assert.throws(()=>escaped.assertOpen(),{code:'CLOSED'});assert.equal(s.getRecord(k).kind,'retired');
});

for(const boundary of ['inspection','registration','inspection-close-error'])test(`M1 regression: snapshot setup closes descriptors after ${boundary} failure`,async t=>{
    const s=await fixture(t),k=key(),owner=recordOwner(k),refs=[];
    await s.withWriter(async w=>{
        for(const p of ['/first','/second'])refs.push(await w.publishPayload({owner,pointer:p,role:'summaries',source:jsonChunks({pointer:p}),evidenceOnly:true,...digestChunks(jsonChunks({pointer:p}))}));
        w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId,unknown:{zero:0,no:false}}});tx.finishPublication({recordKey:k,payloadRefs:refs});tx.putReview({recordKey:k,taskId:'retain',ordinal:0,value:{examined:null,completed:null}});});
    });
    const state=()=>({record:s.getRecord(k),properties:properties(s,owner),review:s.getReview(k,'retain'),map:s.getMap(mapId),replay:s.getReplay(replayId),operations:s.pageOperations()});
    const identities=()=>refs.map(ref=>{const file=path.join(s.root,ref.path),st=fs.statSync(file,{bigint:true});return [st.ino,st.size,st.mtimeNs,st.ctimeNs,digestFile(file)];});
    const before=state(),filesBefore=identities(),second=path.join(s.root,refs[1].path);
    const nativeOpen=fs.openSync,nativeStat=fs.fstatSync,nativeClose=fs.closeSync,nativeSet=Map.prototype.set;
    const opened=[],live=new Map(),failure=Object.assign(Error(`selected artifact ${boundary} EIO`),{code:'EIO'});let callback=false;
    fs.openSync=(file,...args)=>{const fd=nativeOpen(file,...args),ref=refs.find(r=>path.join(s.root,r.path)===file);if(ref){const item={fd,file,closeCalls:0};opened.push(item);nativeSet.call(live,fd,item);}else live.delete(fd);return fd;};
    fs.fstatSync=(fd,...args)=>{if(boundary!=='registration'&&live.get(fd)?.file===second)throw failure;return nativeStat(fd,...args);};
    Map.prototype.set=function(key,value){if(boundary==='registration'&&key===refs[1].path)throw failure;return nativeSet.call(this,key,value);};
    fs.closeSync=fd=>{const item=live.get(fd);if(item){item.closeCalls++;live.delete(fd);}const result=nativeClose(fd);if(boundary==='inspection-close-error'&&item?.file===second)throw Error('secondary close failure');return result;};
    try{
        await assert.rejects(s.withReadSnapshot({recordKeys:[k]},()=>{callback=true;}),error=>error===failure);
    }finally{fs.openSync=nativeOpen;fs.fstatSync=nativeStat;fs.closeSync=nativeClose;Map.prototype.set=nativeSet;}
    try{
        assert.equal(callback,false);assert.equal(opened.length,2);assert.ok(opened.every(item=>item.closeCalls===1),'Each opened artifact must be closed exactly once');
        for(const item of opened)assert.throws(()=>nativeStat(item.fd),{code:'EBADF'});
        assert.equal(fs.existsSync(path.join(s.root,'.manifest.lock')),false);assert.deepEqual(state(),before);assert.deepEqual(identities(),filesBefore);
    }finally{
        // Keep the red-test run isolated too: close only leaked fixture handles.
        for(const item of live.values())try{const st=nativeStat(item.fd),expected=fs.statSync(item.file);if(st.dev===expected.dev&&st.ino===expected.ino)nativeClose(item.fd);}catch(error){if(error.code!=='EBADF')throw error;}
    }
    // Normal ownership transfers to the snapshot: no early or double close.
    const successful=[],active=new Map();let viewAfter;
    fs.openSync=(file,...args)=>{const fd=nativeOpen(file,...args);if(refs.some(r=>path.join(s.root,r.path)===file)){const item={fd,closeCalls:0};successful.push(item);active.set(fd,item);}else active.delete(fd);return fd;};
    fs.closeSync=fd=>{const item=active.get(fd);if(item){item.closeCalls++;active.delete(fd);}return nativeClose(fd);};
    try{
        await s.withReadSnapshot({recordKeys:[k]},async view=>{
            viewAfter=view;assert.equal(successful.length,2);
            for(const item of successful){assert.equal(item.closeCalls,0);assert.ok(nativeStat(item.fd).isFile());}
            for(const ref of refs){const chunks=[];await streamOriginalValue(view,view.payload(owner,ref.pointer),c=>chunks.push(c));assert.equal(Buffer.concat(chunks).toString(),JSON.stringify({pointer:ref.pointer}));}
        });
    }finally{fs.openSync=nativeOpen;fs.closeSync=nativeClose;}
    assert.ok(successful.every(item=>item.closeCalls===1));for(const item of successful)assert.throws(()=>nativeStat(item.fd),{code:'EBADF'});
    assert.throws(()=>viewAfter.assertOpen(),{code:'CLOSED'});assert.deepEqual(state(),before);assert.deepEqual(identities(),filesBefore);
});

for(const boundary of ['success','callback','setup','callback-null'])test(`M1 regression: snapshot cleanup attempts every close after ${boundary}`,async t=>{
    const s=await fixture(t),k=key(),owner=recordOwner(k),refs=[];
    await s.withWriter(async w=>{
        for(const pointer of ['/first','/second','/third'])refs.push(await w.publishPayload({owner,pointer,role:'summaries',source:jsonChunks({pointer}),evidenceOnly:true,...digestChunks(jsonChunks({pointer}))}));
        w.transaction(tx=>{tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId,unknown:{zero:0,no:false}}});tx.finishPublication({recordKey:k,payloadRefs:refs});tx.putReview({recordKey:k,taskId:'retain',ordinal:0,value:{examined:null,completed:null}});});
    });
    const state=()=>({record:s.getRecord(k),properties:properties(s,owner),review:s.getReview(k,'retain'),map:s.getMap(mapId),replay:s.getReplay(replayId),operations:s.pageOperations()});
    const files=refs.map(ref=>path.join(s.root,ref.path)),identities=()=>files.map(file=>{const st=fs.statSync(file,{bigint:true});return [st.ino,st.size,st.mtimeNs,st.ctimeNs,digestFile(file)];});
    const before=state(),filesBefore=identities(),nativeOpen=fs.openSync,nativeStat=fs.fstatSync,nativeClose=fs.closeSync;
    const opened=[],live=new Map(),primary=boundary==='callback-null'?null:Object.assign(Error(`${boundary} primary`),{code:'EIO'}),cleanupErrors=files.slice(0,2).map((_,i)=>Object.assign(Error(`cleanup ${i} EIO`),{code:'EIO'}));let called=false,borrowed;
    fs.openSync=(file,...args)=>{const fd=nativeOpen(file,...args);if(files.includes(file)){const item={fd,file,closeCalls:0};opened.push(item);live.set(fd,item);}else live.delete(fd);return fd;};
    fs.fstatSync=(fd,...args)=>{if(boundary==='setup'&&live.get(fd)?.file===files[2])throw primary;return nativeStat(fd,...args);};
    fs.closeSync=fd=>{const item=live.get(fd);if(item){item.closeCalls++;live.delete(fd);}const result=nativeClose(fd),index=item?files.indexOf(item.file):-1;if(index>=0&&index<2)throw cleanupErrors[index];return result;};
    try{
        await assert.rejects(s.withReadSnapshot({recordKeys:[k]},view=>{
            called=true;borrowed=view;assert.equal(opened.length,3);
            for(const item of opened){assert.equal(item.closeCalls,0);assert.ok(nativeStat(item.fd).isFile());}
            if(boundary!=='success')throw primary;
            return 'callback succeeded';
        }),error=>error===(boundary==='success'?cleanupErrors[0]:primary));
        assert.equal(called,boundary!=='setup');assert.equal(opened.length,3);
        assert.ok(opened.every(item=>item.closeCalls===1),'Every opened descriptor must receive exactly one close attempt');
        for(const item of opened)assert.throws(()=>nativeStat(item.fd),{code:'EBADF'});
    }finally{
        fs.openSync=nativeOpen;fs.fstatSync=nativeStat;fs.closeSync=nativeClose;
        // Red runs must not leak their synthetic fixture handles either.
        for(const item of live.values())try{const st=nativeStat(item.fd),expected=fs.statSync(item.file);if(st.dev===expected.dev&&st.ino===expected.ino)nativeClose(item.fd);}catch(error){if(error.code!=='EBADF')throw error;}
    }
    if(borrowed)assert.throws(()=>borrowed.assertOpen(),{code:'CLOSED'});
    assert.equal(fs.existsSync(path.join(s.root,'.manifest.lock')),false);assert.deepEqual(state(),before);assert.deepEqual(identities(),filesBefore);
    const successful=[],active=new Map();let afterView;
    fs.openSync=(file,...args)=>{const fd=nativeOpen(file,...args);if(files.includes(file)){const item={fd,closeCalls:0};successful.push(item);active.set(fd,item);}else active.delete(fd);return fd;};
    fs.closeSync=fd=>{const item=active.get(fd);if(item){item.closeCalls++;active.delete(fd);}return nativeClose(fd);};
    try{
        assert.equal(await s.withReadSnapshot({recordKeys:[k]},async view=>{
            afterView=view;assert.equal(successful.length,3);
            for(const item of successful){assert.equal(item.closeCalls,0);assert.ok(nativeStat(item.fd).isFile());}
            for(const ref of refs){const chunks=[];await streamOriginalValue(view,view.payload(owner,ref.pointer),c=>chunks.push(c));assert.equal(Buffer.concat(chunks).toString(),JSON.stringify({pointer:ref.pointer}));}
            return 'normal snapshot';
        }),'normal snapshot');
    }finally{fs.openSync=nativeOpen;fs.closeSync=nativeClose;}
    assert.ok(successful.every(item=>item.closeCalls===1));for(const item of successful)assert.throws(()=>nativeStat(item.fd),{code:'EBADF'});
    assert.throws(()=>afterView.assertOpen(),{code:'CLOSED'});assert.equal(fs.existsSync(path.join(s.root,'.manifest.lock')),false);assert.deepEqual(state(),before);assert.deepEqual(identities(),filesBefore);
});

test('unmanaged adoption, projection disagreement and unauthorized cleanup fail unchanged',async t=>{
    const s=await fixture(t);await insert(s,key());const file=path.join(s.root,'unmanaged.response');fs.writeFileSync(file,'original');const hash=digestFile(file);
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.reserveOutput({recordKey:key(),path:'unmanaged.response',expectedBytes:8,expectedHash:hash}))),{code:'OWNERSHIP_CONFLICT'});
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'bad',recordKey:key(),phase:'cleanup',files:[{ordinal:0,path:'unmanaged.response',hash,bytes:8}]}))),{code:'OWNERSHIP_CONFLICT'});
    await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner:recordOwner(key()),pointer:'/status',ordinal:0,value:'claim'}))),{code:'INVALID_PROJECTION'});
    assert.equal(s.getRecord(key()).status,'pending');assert.equal(s.pageOperations().rows.length,0);assert.equal(digestFile(file),hash);
});

test('SQLite busy exhaustion is bounded and cannot publish ready evidence', {timeout:15000},async t=>{
    const s=await fixture(t);await insert(s,key());
    const db=new DatabaseSync(dbFile(s));db.exec('BEGIN IMMEDIATE');const started=performance.now();
    try {await assert.rejects(s.withWriter(w=>w.transaction(tx=>tx.putReview({recordKey:key(),taskId:'blocked',ordinal:0,value:{completed:null}}))),/locked/);}
    finally{db.exec('ROLLBACK');db.close();}
    const elapsed=performance.now()-started;assert.ok(elapsed>=4500&&elapsed<10000);assert.equal(s.getRecord(key()).status,'pending');assert.equal(s.getReview(key(),'blocked').kind,'missing');
});

test('SIGKILL at publication boundaries leaves recoverable exact intents',async t=>{
    for(const boundary of ['temporary-write','temporary-fsync','exclusive-publication','directory-fsync','verification']){
        const s=await fixture(t),k=key(),owner=recordOwner(k);await insert(s,k);const expected=digestChunks(jsonChunks({v:1}));const relative=payloadPath(s.storeId,owner,'/crash','extensions',expected.expectedHash);
        await s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'crash',recordKey:k,files:[{ordinal:0,path:relative,hash:expected.expectedHash,bytes:expected.expectedBytes,payload:{owner,pointer:'/crash',role:'extensions'}}]})));
        const code=`import {openStore} from ${JSON.stringify(moduleUrl)};import {jsonChunks} from ${JSON.stringify(new URL('../../tools/replay-store-payloads.js',import.meta.url).href)};const s=await openStore({root:process.argv[1],mode:'write',fault:name=>{if(name===process.argv[2])process.kill(process.pid,'SIGKILL');}});await s.withWriter(w=>w.publishPayload({...JSON.parse(process.argv[3]),source:jsonChunks({v:1})}));`;
        const crashed=await child(code,[s.root,boundary,JSON.stringify({owner,pointer:'/crash',role:'extensions',...expected})]);assert.equal(crashed.signal,'SIGKILL');assert.equal(s.getRecord(k).status,'pending');
        fs.utimesSync(path.join(s.root,'.manifest.lock'),new Date(0),new Date(0));
        await s.withWriter(async w=>{await w.publishPayload({owner,pointer:'/crash',role:'extensions',source:jsonChunks({v:1}),...expected});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'crash'}));});
        assert.equal(s.getRecord(k).status,'claim');assert.equal(s.pagePayloads(owner).rows.length,1);
    }
});

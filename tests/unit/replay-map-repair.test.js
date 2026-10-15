// Independently generated synthetic maps/stores. Retain fixtures and failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture,log,replayId} from '../fixtures/replay-import-command-fixture.js';
import {database,logical,hashFiles} from '../fixtures/replay-log-review-command-fixture.js';
import {checkSyntheticMapChecksums as repair} from '../../tools/replay-maintenance-command-fixture.js';
import {mapChecksum,sha256,upgradeMapChecksums} from '../../tools/replay-logs.js';
import {openStore,openMapRepairStore,recordKey} from '../../tools/replay-store.js';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const request=f=>({synthetic:true,root:f.root});
async function legacy(t){
    const f=await fixture(t),map=JSON.parse(log()[1].split('\n')[0]).map;
    map.arena.unknown={nil:null,no:false,order:[2,1]};
    const id=mapChecksum(map),file='pain_and_gain_map_2026-10-13T00-00-00-000Z.json',bytes=Buffer.from(JSON.stringify(map,null,2)+'\n');
    const registration={id,checksum:id,file,status:'validated',unknown:{order:['second','first']}};
    fs.writeFileSync(path.join(f.root,file),bytes);
    await f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'map',key:id,ordinal:7,value:registration,mapArtifact:{path:file,hash:sha256(bytes)}})));
    fs.mkdirSync(path.join(f.v2,'replay_logs'));fs.writeFileSync(path.join(f.v2,'replay_logs',file),bytes);
    fs.writeFileSync(path.join(f.v2,'replay_logs/manifest.json'),JSON.stringify({version:2,maps:[registration],replays:[],records:[]}));
    return{...f,id,file,bytes,registration};
}
test('missing checksum repair matches v2 exact bytes for a map without a record owner',async t=>{
    const f=await legacy(t),expected=await upgradeMapChecksums(f.v2);
    assert.deepEqual(await repair(request(f)),expected);
    const bytes=fs.readFileSync(path.join(f.root,f.file));assert.deepEqual(bytes,fs.readFileSync(path.join(f.v2,'replay_logs',f.file)));
    assert.equal(f.store.getMap(f.id).hash,sha256(bytes));assert.equal(logical(f.root).records.length,0);
    const state=logical(f.root),files=hashFiles(f.root);assert.equal((await repair(request(f)))[0].status,'verified');assert.deepEqual(logical(f.root),state);assert.deepEqual(hashFiles(f.root),files);
});

const journals=f=>database(f.root,db=>db.prepare('SELECT * FROM map_repairs ORDER BY map_id').all());
const state=f=>({...logical(f.root),map_repairs:journals(f)});
async function direct(f,fault,options){const s=await openMapRepairStore({root:f.root,fault});try{return await s.repairMapChecksums(options);}finally{s.close();}}
async function interrupted(f,boundary){let seen=false;await assert.rejects(direct(f,b=>{if(b===boundary&&!seen){seen=true;throw Object.assign(Error('retained interruption '+b),{code:'EIO'});}}),{code:'EIO'});assert.equal(seen,true);}

for(const boundary of ['map-temporary-write','map-temporary-fsync','map-retained-published','map-original-retained','map-replacement-retained','map-intent-committed','map-before-replace','map-replaced','map-directory-synced','map-published','map-before-commit','map-verified'])test('deterministic retained recovery at '+boundary,async t=>{
    const f=await legacy(t);await interrupted(f,boundary);const before=journals(f);t.diagnostic(JSON.stringify({interrupted:boundary,journals:before,root:f.root}));
    if(before.length&&before[0].phase!=='verified'){
        assert.throws(()=>f.store.getMap(f.id),{code:'RECOVERY_REQUIRED'});
        await assert.rejects(openStore({root:f.root,mode:'read'}),{code:'RECOVERY_REQUIRED'});
        await assert.rejects(f.store.withWriter(()=>assert.fail('ordinary writer reached')),{code:'RECOVERY_REQUIRED'});
        await assert.rejects(f.store.withReadSnapshot({mapIds:[f.id]},()=>assert.fail('snapshot reached')),{code:'RECOVERY_REQUIRED'});
    }
    await repair(request(f));assert.equal(journals(f)[0].phase,'verified');assert.deepEqual(fs.readFileSync(path.join(f.root,journals(f)[0].old_path)),f.bytes);
    assert.deepEqual(fs.readFileSync(path.join(f.root,f.file)),fs.readFileSync(path.join(f.root,journals(f)[0].new_path)));
    const done=state(f),files=hashFiles(f.root);assert.equal((await repair(request(f)))[0].status,'verified');assert.deepEqual(state(f),done);assert.deepEqual(hashFiles(f.root),files);
});
for(const count of [1,2,3])test('map database transaction failure rolls back at commit '+count,async t=>{
    const f=await legacy(t);let n=0;await assert.rejects(direct(f,b=>{if(b==='transaction-commit'&&++n===count)throw Object.assign(Error('rollback'),{code:'EIO'});}),{code:'EIO'});assert.equal(n,count);
    const j=journals(f)[0];if(count===1)assert.equal(j,undefined);else{assert.notEqual(j.phase,'verified');assert.equal(logical(f.root).maps[0].hash,j.old_hash);}
    await repair(request(f));assert.equal(journals(f)[0].phase,'verified');
});
test('shared maps preserve replay links, reviews, record outputs and unknown registration fields',async t=>{
    const f=await legacy(t),k={collection:'log',replayId,fingerprint:'f'.repeat(64)},otherId='c'.repeat(24);
    await f.store.withWriter(w=>w.transaction(tx=>{
        for(const [ordinal,id]of [replayId,otherId].entries())tx.insertEntity({kind:'replay',key:id,ordinal,value:{replayId:id,mapId:f.id,status:'active',unknown:[false,null]}});
        tx.insertEntity({kind:'record',key:recordKey(k),ordinal:0,value:{mapId:f.id,status:'claim',outputPath:null,outputFingerprint:null,unknown:{nil:null}}});
        tx.putReview({recordKey:k,taskId:'owner',ordinal:4,value:{claimedAt:'original',examinedAt:null,unknown:{order:[2,1]}}});
        tx.setProperty({owner:{kind:'map',key:f.id},pointer:'/hash',ordinal:19,value:sha256(f.bytes)});
    }));
    // A second map has its own original bytes and must remain a neutral no-op.
    const map=JSON.parse(f.bytes);map.arena.level=2;map.checksum=mapChecksum(map);const id=map.checksum,file=f.file.replace('.json','-aaaaaaaaaaaa.json'),bytes=JSON.stringify(map)+'\n';fs.writeFileSync(path.join(f.root,file),bytes);
    await f.store.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'map',key:id,ordinal:8,value:{id,checksum:id,file,status:'validated'},mapArtifact:{path:file,hash:sha256(bytes)}})));
    const before=logical(f.root);const got=await repair(request(f));assert.deepEqual(got.map(r=>r.status),['updated','verified']);
    const after=logical(f.root);assert.deepEqual(after.maps[1],before.maps[1]);for(const k of ['records','replays','reviews','outputs','payloads','operations','operation_files','retired'])assert.deepEqual(after[k],before[k]);
    assert.deepEqual(after.properties.filter(p=>p.pointer!=='/hash'),before.properties.filter(p=>p.pointer!=='/hash'));const hash=after.properties.find(p=>p.owner_kind==='map'&&p.pointer==='/hash');assert.equal(hash.ordinal,19);assert.equal(JSON.parse(hash.value),after.maps[0].hash);assert.equal(fs.readFileSync(path.join(f.root,file),'utf8'),bytes);
});
test('concurrent repair has one intent and generation-neutral verified repetition',async t=>{
    const f=await legacy(t);const results=await Promise.all([repair(request(f)),repair(request(f))]);assert.deepEqual(results.map(x=>x[0].status).sort(),['updated','verified']);assert.equal(journals(f).length,1);
});
for(const defect of ['old-hash','new-hash','old-length','new-length','owner','path','old-path','ordinal','properties','old-bytes','new-bytes','current-bytes','missing-original','symlink','hardlink'])test('pending recovery rejects unchanged corrupt state '+defect,async t=>{
    const f=await legacy(t);await interrupted(f,'map-intent-committed');const j=journals(f)[0];
    const columns={'old-hash':['old_hash','a'.repeat(64)],'new-hash':['new_hash','a'.repeat(64)],'old-length':['old_bytes',1],'new-length':['new_bytes',1],owner:['map_id','a'.repeat(64)],path:['path','unrelated.json'],'old-path':['old_path',j.new_path],ordinal:['map_ordinal','999'],properties:['properties_hash','a'.repeat(64)]};
    if(columns[defect])database(f.root,db=>{if(defect==='owner')db.exec('PRAGMA foreign_keys=OFF');const [key,value]=columns[defect];db.prepare(`UPDATE map_repairs SET ${key}=?`).run(value);});
    if(defect==='old-bytes')fs.appendFileSync(path.join(f.root,j.old_path),' ');
    if(defect==='new-bytes')fs.appendFileSync(path.join(f.root,j.new_path),' ');
    if(defect==='current-bytes')fs.appendFileSync(path.join(f.root,f.file),' ');
    if(defect==='missing-original')fs.renameSync(path.join(f.root,j.old_path),path.join(f.root,j.old_path)+'.retained');
    if(defect==='symlink'){fs.renameSync(path.join(f.root,f.file),path.join(f.root,f.file)+'.retained');fs.symlinkSync(path.join(f.root,f.file)+'.retained',path.join(f.root,f.file));}
    if(defect==='hardlink')fs.linkSync(path.join(f.root,f.file),path.join(f.root,f.file)+'.retained');
    const before=state(f);await assert.rejects(repair(request(f)));assert.deepEqual(state(f),before);
});
for(const boundary of ['map-original-retained','map-intent-committed','map-before-replace','map-before-commit'])test('source mutation is rejected at '+boundary,async t=>{
    const f=await legacy(t);let seen=false;
    await assert.rejects(direct(f,b=>{if(b===boundary&&!seen){seen=true;fs.appendFileSync(path.join(f.root,f.file),'changed');}}));assert.equal(seen,true);
    assert.ok(fs.readFileSync(path.join(f.root,f.file),'utf8').endsWith('changed'));assert.notEqual(journals(f)[0]?.phase,'verified');
});
test('same-byte replacement of the old inode is rejected on pending recovery',async t=>{
    const f=await legacy(t);await interrupted(f,'map-intent-committed');fs.renameSync(path.join(f.root,f.file),path.join(f.root,f.file)+'.original');fs.writeFileSync(path.join(f.root,f.file),f.bytes);const before=state(f);await assert.rejects(repair(request(f)),{code:'CHANGED_INPUT'});assert.deepEqual(state(f),before);
});
for(const kind of ['output','property','checksum','schema','legacy-capability'])test('preflight rejects '+kind+' without map mutation',async t=>{
    const f=await legacy(t);
    database(f.root,db=>{
        if(kind==='output')db.exec('PRAGMA foreign_keys=OFF');
        if(kind==='output')db.prepare('INSERT INTO outputs VALUES (?,?,?,?,?,?,?)').run(f.file,'log',replayId,'f'.repeat(64),sha256(f.bytes),f.bytes.length,'ready');
        if(kind==='property')db.prepare("UPDATE properties SET value='\"unrelated\"' WHERE owner_kind='map' AND pointer='/file'").run();
        if(kind==='schema')db.exec('ALTER TABLE map_repairs ADD COLUMN unsupported TEXT');
        if(kind==='legacy-capability')db.exec('DROP TABLE map_repairs');
        if(kind==='checksum'){const v=JSON.parse(f.bytes);v.checksum='f'.repeat(64);const bytes=JSON.stringify(v);fs.writeFileSync(path.join(f.root,f.file),bytes);db.prepare('UPDATE maps SET hash=?').run(sha256(bytes));}
    });const before=logical(f.root),bytes=fs.readFileSync(path.join(f.root,f.file));await assert.rejects(repair(request(f)));assert.deepEqual(logical(f.root),before);assert.deepEqual(fs.readFileSync(path.join(f.root,f.file)),bytes);
});
for(const limits of [{maps:0},{maps:65},{mapBytes:1},{artifactBytes:1},{metadataBytes:1},{properties:1}])test('finite repair limit rejects '+JSON.stringify(limits),async t=>{
    const f=await legacy(t),before=state(f);await assert.rejects(repair({...request(f),limits}),{code:'RESOURCE_LIMIT'});assert.deepEqual(state(f),before);
});
test('private repair options reject accessors and retain reduced limits across lock acquisition',async t=>{
    const f=await legacy(t),s=await openMapRepairStore({root:f.root});let invoked=false;
    try{assert.throws(()=>s.repairMapChecksums({get limits(){invoked=true;return{};}}),{code:'INVALID_ARGUMENT'});assert.throws(()=>s.repairMapChecksums({limits:{get maps(){invoked=true;return 64;}}}),{code:'INVALID_ARGUMENT'});assert.equal(invoked,false);
        const limits={mapBytes:1},p=s.repairMapChecksums({limits});limits.mapBytes=1048576;await assert.rejects(p,{code:'RESOURCE_LIMIT'});assert.equal(s.withWriter,undefined);
    }finally{s.close();}
});
test('repair rejects unverifiable/dataless-like map metadata before opening content',async t=>{
    const f=await legacy(t),lstat=fs.lstatSync,open=fs.openSync;let opens=0;
    fs.lstatSync=(p,...a)=>{if(p===path.join(f.root,f.file))throw Object.assign(Error('unverifiable'),{code:'EACCES'});return lstat(p,...a);};fs.openSync=(p,...a)=>{if(p===path.join(f.root,f.file))opens++;return open(p,...a);};
    try{await assert.rejects(repair(request(f)),{code:'EACCES'});}finally{fs.lstatSync=lstat;fs.openSync=open;}assert.equal(opens,0);
});
for(const write of [false,true])test('repair retains primary and separate descriptor cleanup errors '+(write?'write':'read'),async t=>{
    const f=await legacy(t),open=fs.openSync,read=fs.readSync,put=fs.writeSync,close=fs.closeSync;const selected=new Set();
    fs.openSync=(p,...a)=>{const fd=open(p,...a);if(write?String(p).includes('/map-repairs/')&&String(p).endsWith('.tmp'):p===path.join(f.root,f.file))selected.add(fd);return fd;};
    fs.readSync=(fd,...a)=>{if(!write&&selected.has(fd))throw Object.assign(Error('primary read'),{code:'EIO'});return read(fd,...a);};
    fs.writeSync=(fd,...a)=>{if(write&&selected.has(fd))throw Object.assign(Error('primary write'),{code:'EIO'});return put(fd,...a);};
    fs.closeSync=fd=>{close(fd);if(selected.delete(fd))throw Object.assign(Error('cleanup'),{code:'ENOSPC'});};
    try{await assert.rejects(repair(request(f)),e=>e.code==='EIO'&&e.cleanupFailures?.some(c=>c.systemCode==='ENOSPC'));}finally{fs.openSync=open;fs.readSync=read;fs.writeSync=put;fs.closeSync=close;}
    assert.equal(logical(f.root).maps[0].hash,sha256(f.bytes));assert.deepEqual(fs.readFileSync(path.join(f.root,f.file)),f.bytes);
});
test('cleanup-only errors remain visible; normal retry is permitted only for exact retained state',async t=>{
    const f=await legacy(t),open=fs.openSync,close=fs.closeSync;let selected;
    fs.openSync=(p,...a)=>{const fd=open(p,...a);if(p===path.join(f.root,f.file))selected=fd;return fd;};fs.closeSync=fd=>{close(fd);if(fd===selected){selected=undefined;throw Object.assign(Error('cleanup only'),{code:'ENOSPC'});}};
    try{await assert.rejects(repair(request(f)),{code:'ENOSPC'});}finally{fs.openSync=open;fs.closeSync=close;}assert.equal((await repair(request(f)))[0].status,'updated');
});
test('existing CLI repairs generated legacy map and rejects unsafe roots',async t=>{
    const f=await legacy(t),r=spawnSync(process.execPath,['tools/replay-logs.js','--synthetic-sqlite',f.root,'upgrade-map-checksums'],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/updated/);
    await assert.rejects(openMapRepairStore({root:process.cwd()}),{code:'UNSAFE_PATH'});
});
test('completed repair retains map-owned original paths against ordinary reservation',async t=>{
    const f=await legacy(t);await repair(request(f));const j=journals(f)[0],before=state(f);
    await f.store.withWriter(w=>{assert.equal(w.artifactOwner(j.old_path),'map_repairs');assert.throws(()=>w.transaction(tx=>tx.insertEntity({kind:'map',key:'a'.repeat(64),ordinal:8,value:{path:j.old_path,hash:j.old_hash}})),{code:'OWNERSHIP_CONFLICT'});});assert.deepEqual(state(f),before);
});
test('changed map properties during pending recovery reject without blessing unknown metadata',async t=>{
    const f=await legacy(t);await interrupted(f,'map-published');database(f.root,db=>db.prepare("UPDATE properties SET value='null' WHERE owner_kind='map' AND pointer='/unknown'").run());const before=state(f);await assert.rejects(repair(request(f)),{code:'INVALID_REFERENCE'});assert.deepEqual(state(f),before);
});
test('legacy stores stay readable and schema capability is never installed by repair',async t=>{
    const f=await legacy(t);database(f.root,db=>db.exec('DROP TABLE map_repairs'));const before=logical(f.root);assert.equal(f.store.getMap(f.id).hash,sha256(f.bytes));await assert.rejects(repair(request(f)),{code:'UNSUPPORTED_STORE'});assert.deepEqual(logical(f.root),before);assert.equal(database(f.root,db=>db.prepare("SELECT name FROM sqlite_master WHERE name='map_repairs'").get()),undefined);
});
test('a pinned old map view remains coherent across repair rename',async t=>{
    const f=await legacy(t);await f.store.withReadSnapshot({mapIds:[f.id]},async view=>{
        const ref=view.mapArtifact(f.id),artifact=view.artifact(ref);await repair(request(f));const bytes=Buffer.alloc(f.bytes.length);assert.equal(view.read(artifact,bytes,0),bytes.length);assert.deepEqual(bytes,f.bytes);assert.equal(ref.hash,sha256(f.bytes));
    });assert.notDeepEqual(fs.readFileSync(path.join(f.root,f.file)),f.bytes);
});
test('map repair does not adopt an unrelated file at its retained path',async t=>{
    const f=await legacy(t),d=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))),dir=path.join(f.root,'store-v3',d.storeId,'map-repairs',f.id);fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,sha256(f.bytes)+'.original');fs.writeFileSync(target,'unrelated');const before=state(f);await assert.rejects(repair(request(f)),{code:'INVALID_ARTIFACT'});assert.equal(fs.readFileSync(target,'utf8'),'unrelated');assert.deepEqual(state(f),before);
});
test('map intent failure preserves primary commit error and separate rollback failure',async t=>{
    const f=await legacy(t),exec=DatabaseSync.prototype.exec;let armed=false;
    DatabaseSync.prototype.exec=function(sql){if(armed&&sql==='COMMIT'){armed=false;throw Object.assign(Error('commit failed'),{code:'EIO'});}if(sql==='ROLLBACK'){exec.call(this,sql);throw Object.assign(Error('rollback cleanup'),{code:'ENOSPC'});}return exec.call(this,sql);};
    try{await assert.rejects(direct(f,b=>{if(b==='transaction-commit')armed=true;}),e=>e.code==='EIO'&&e.cleanupFailures?.some(x=>x.systemCode==='ENOSPC'));}finally{DatabaseSync.prototype.exec=exec;}
    assert.equal(journals(f).length,0);assert.deepEqual(fs.readFileSync(path.join(f.root,f.file)),f.bytes);
});
test('verified repair rejects corrupt retained originals without changing completed rows',async t=>{
    const f=await legacy(t);await repair(request(f));const j=journals(f)[0];fs.appendFileSync(path.join(f.root,j.old_path),'changed');const before=state(f),current=fs.readFileSync(path.join(f.root,f.file));await assert.rejects(repair(request(f)),{code:'INVALID_ARTIFACT'});assert.deepEqual(state(f),before);assert.deepEqual(fs.readFileSync(path.join(f.root,f.file)),current);
});
test('directory flush interruption retains recoverable exact replacement',async t=>{
    const f=await legacy(t),sync=fs.fsyncSync;let armed=false,seen=false;
    fs.fsyncSync=fd=>{if(armed&&fs.fstatSync(fd).isDirectory()){armed=false;seen=true;throw Object.assign(Error('directory flush'),{code:'EIO'});}return sync(fd);};
    try{await assert.rejects(direct(f,b=>{if(b==='map-replaced')armed=true;}),{code:'EIO'});}finally{fs.fsyncSync=sync;}
    assert.equal(seen,true);assert.equal(journals(f)[0].phase,'reserved');assert.equal((await repair(request(f)))[0].status,'updated');
});

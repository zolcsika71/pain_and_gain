import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {makeFixture,inventory} from './replay-combined-analysis-m2e-store.js';
import {hash,replayId} from './replay-combined-analysis-m2e-recipe.js';
const [phase,schemaText,...roots]=process.argv.slice(2),schema=Number(schemaText),started=performance.now();
const golden=JSON.parse(fs.readFileSync(new URL('./replay-combined-analysis-m2e-oracle.json',import.meta.url)));
const rss=()=>process.resourceUsage().maxRSS*1024;
const dbPath=root=>path.join(root,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).database);
function measure(paths){
    const native={open:fs.openSync,read:fs.readSync,close:fs.closeSync,write:fs.writeSync,prepare:DatabaseSync.prototype.prepare,exec:DatabaseSync.prototype.exec};
    const descriptors=new Map(),all=new Set(),m={sql:0,pragmas:0,rows:0,opens:0,bytes:0,reads:0,maxChunk:0,writes:0,metadataOpens:0,unselected:0},seen=new Set();
    const count=sql=>/^PRAGMA /i.test(sql)?m.pragmas++:m.sql++;
    fs.openSync=(p,...args)=>{const fd=native.open(p,...args),file=String(p);all.add(fd);if(paths.has(file)||/\/(extensions|summaries|diagnostics)\//.test(file)||file.endsWith('.response')||file.endsWith('.jsonl')||file.includes('/pain_and_gain_map_')){descriptors.set(fd,file);m.opens++;if(!paths.has(file))m.unselected++;assert.ok(!seen.has(file),'No artifact pathname reopening');seen.add(file);}else m.metadataOpens++;return fd;};
    fs.readSync=(fd,b,...args)=>{const n=native.read(fd,b,...args);if(descriptors.has(fd)){m.reads++;m.bytes+=n;m.maxChunk=Math.max(m.maxChunk,b.length);}return n;};
    fs.closeSync=fd=>{descriptors.delete(fd);all.delete(fd);return native.close(fd);};
    fs.writeSync=(fd,...args)=>{if(descriptors.has(fd))m.writes++;return native.write(fd,...args);};
    DatabaseSync.prototype.exec=function(sql){count(sql);assert.ok(!/^(INSERT|UPDATE|DELETE|CREATE|DROP|BEGIN IMMEDIATE)/i.test(sql),'No persistent SQL writes');return native.exec.call(this,sql);};
    DatabaseSync.prototype.prepare=function(sql){count(sql);assert.ok(!/^(INSERT|UPDATE|DELETE|CREATE|DROP)/i.test(sql));const s=native.prepare.call(this,sql),get=s.get,all=s.all,iterate=s.iterate;
        s.get=function(...a){const r=get.apply(this,a);if(r)m.rows++;return r;};s.all=function(...a){const r=all.apply(this,a);m.rows+=r.length;return r;};s.iterate=function*(...a){for(const r of iterate.apply(this,a)){m.rows++;yield r;}};return s;};
    return{m,restore(){Object.assign(fs,{openSync:native.open,readSync:native.read,closeSync:native.close,writeSync:native.write});DatabaseSync.prototype.prepare=native.prepare;DatabaseSync.prototype.exec=native.exec;assert.equal(all.size,0);assert.equal(descriptors.size,0);}};
}
if(phase==='generate') {
    const stores=[];
    for(const [i,root]of roots.entries()){
        const count=[10,1000][i],f=await makeFixture(schema,'scale',{root,count,large:true});
        const db=new DatabaseSync(dbPath(root),{readOnly:true});
        try{
            assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,count);
            assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE status='pending'").get().n,count-4);
            assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE collection='log'").get().n,2);
            assert.equal(db.prepare('SELECT count(*) AS n FROM operations').get().n,6);
            assert.equal(db.prepare("SELECT count(*) AS n FROM operation_files WHERE state='verified'").get().n,12);
        }finally{db.close();}
        const inv=inventory(root),inodes=new Set();
        assert.equal(f.largeRefs.length,12);assert.equal(new Set(f.largeRefs.map(r=>r.hash)).size,12);
        for(const ref of f.largeRefs){const st=fs.statSync(path.join(root,ref.path));assert.equal(st.size,50*1048576);assert.equal(st.nlink,1);assert.ok(st.blocks*512>=st.size);inodes.add(`${st.dev}:${st.ino}`);assert.equal(inv[ref.path].hash,ref.hash);}assert.equal(inodes.size,12);
        const selected=[];
        for(const artifact of golden.scenarios.scale.artifacts){
            const file=artifact.logical??f.refs.find(p=>p.key.collection===artifact.collection&&p.key.fingerprint===artifact.fingerprint).refs.find(p=>p.pointer===artifact.pointer).path;
            assert.deepEqual(inv[file],{bytes:artifact.bytes,hash:artifact.hash});selected.push({path:file,bytes:artifact.bytes});
        }
        assert.equal(selected.length,12);assert.equal(new Set(selected.map(r=>r.path)).size,12);
        f.h.close();stores.push({count,selected,fingerprints:f.options.fingerprints,scoreFingerprints:f.options.scoreFingerprints,inventoryHash:hash(JSON.stringify(inv)),unrelatedBytes:12*50*1048576});
    }
    console.log(JSON.stringify({phase,schema,stores,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
}else if(phase==='operations'){
    const receipt=JSON.parse(fs.readFileSync(roots.pop())),{analyzeFixtureCombinedReplay}=await import('../../tools/replay-combined-analysis-fixture.js'),runs=[];
    for(const [i,root]of roots.entries()){
        const store=receipt.stores[i],paths=new Set(store.selected.map(r=>path.join(root,r.path))),size=store.selected.reduce((n,r)=>n+r.bytes,0);
        for(const reportMode of ['full','compact']){
            const measured=measure(paths),at=performance.now();let report;
            try{report=await analyzeFixtureCombinedReplay({root,schemaVersion:schema,replayId,fingerprints:store.fingerprints,scoreFingerprints:store.scoreFingerprints,reportMode});}finally{measured.restore();}
            const reportHash=hash(JSON.stringify(report)+'\n');assert.equal(reportHash,golden.scenarios.scale.reportHashes[reportMode]);assert.equal(measured.m.opens,12);assert.equal(measured.m.unselected,0);assert.equal(measured.m.writes,0);assert.ok(measured.m.maxChunk<=65536);assert.ok(measured.m.bytes<=8*size);
            runs.push({count:store.count,reportMode,reportHash,selectedBytes:size,elapsedMs:performance.now()-at,...measured.m});
        }
    }
    for(const mode of ['full','compact']){const [a,b]=runs.filter(r=>r.reportMode===mode);for(const name of ['sql','pragmas','rows','opens','reads','bytes','maxChunk','writes','metadataOpens','reportHash'])assert.equal(a[name],b[name],name);}
    console.log(JSON.stringify({phase,schema,runs,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
}else if(phase==='preservation'){
    const receipt=JSON.parse(fs.readFileSync(roots.pop())),hashes=roots.map(root=>hash(JSON.stringify(inventory(root))));assert.deepEqual(hashes,receipt.stores.map(s=>s.inventoryHash));
    console.log(JSON.stringify({phase,schema,hashes,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
}else throw Error('Unknown phase');

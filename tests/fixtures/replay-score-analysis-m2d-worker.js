// Test-only worker: newly created synthetic roots, no production dispatch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {mock} from 'node:test';
import * as core from '../../tools/replay-store.js';
import * as catalog from '../../tools/replay-catalog.js';
import * as analysis from '../../tools/replay-analysis.js';
import {makeFixture,inventory,key} from './replay-score-analysis-m2d-store.js';
import {replayId,hash} from './replay-score-analysis-m2d-recipe.js';
const golden=JSON.parse(fs.readFileSync(new URL('./replay-score-analysis-m2d-oracle.json',import.meta.url)));
const reportEqual=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const [phase,schemaText,...roots]=process.argv.slice(2),schema=Number(schemaText),started=performance.now();
const dbPath=root=>path.join(root,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).database);
const options=root=>({root,schemaVersion:schema,replayId,scoreFingerprints:golden.scenarios.scale.selected});
const rss=()=>process.resourceUsage().maxRSS*1024;
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
if(phase==='generate'){
    const stores=[];
    for(const [i,root]of roots.entries()){
        const count=[10,1000][i],f=await makeFixture(schema,'scale',{root,count,large:true}),db=new DatabaseSync(dbPath(root),{readOnly:true});
        try{assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,count);assert.equal(db.prepare('SELECT count(*) AS n FROM operations').get().n,6);assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE status='pending'").get().n,count-4);assert.ok(db.prepare("EXPLAIN QUERY PLAN SELECT key FROM records WHERE collection='score' LIMIT 1").all().every(r=>!r.detail.includes('SCAN records')));}finally{db.close();}
        const inv=inventory(root),inodes=new Set();assert.equal(f.largeRefs.length,12);assert.equal(new Set(f.largeRefs.map(r=>r.hash)).size,12);
        for(const ref of f.largeRefs){const st=fs.statSync(path.join(root,ref.path));assert.equal(st.size,50*1048576);assert.equal(st.nlink,1);assert.ok(st.blocks*512>=st.size);inodes.add(`${st.dev}:${st.ino}`);assert.equal(inv[ref.path].hash,ref.hash);}assert.equal(inodes.size,12);
        const selected=[];
        for(const artifact of golden.scenarios.scale.artifacts){const index=f.data.manifest.scoreRecords.findIndex(r=>r.fingerprint===artifact.fingerprint),r=f.data.manifest.scoreRecords[index];const file=artifact.pointer==='output'?r.outputPath:f.refs[index].find(ref=>ref.pointer===artifact.pointer).path;assert.deepEqual(inv[file],{bytes:artifact.bytes,hash:artifact.hash});selected.push({path:file,bytes:artifact.bytes});}
        f.h.close();stores.push({count,selected,inventoryHash:hash(JSON.stringify(inv)),unrelatedBytes:12*50*1048576});
    }
    console.log(JSON.stringify({phase,schema,stores,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
}else if(phase==='operations'){
    const receipt=JSON.parse(fs.readFileSync(roots.pop())),{analyzeFixtureScoreReplay}=await import('../../tools/replay-score-analysis-fixture.js'),runs=[];
    for(const [i,root]of roots.entries()){
        const selected=receipt.stores[i].selected,paths=new Set(selected.map(r=>path.join(root,r.path))),size=selected.reduce((n,r)=>n+r.bytes,0);
        assert.equal(paths.size,12);
        for(const reportMode of ['full','compact']){
            const m=measure(paths),at=performance.now();let report;try{report=await analyzeFixtureScoreReplay({...options(root),reportMode});}finally{m.restore();}
            const reportHash=hash(JSON.stringify(report)+'\n');assert.equal(reportHash,golden.scenarios.scale.hashes[reportMode]);assert.equal(m.m.opens,12);assert.equal(m.m.unselected,0);assert.equal(m.m.writes,0);assert.ok(m.m.maxChunk<=65536);assert.ok(m.m.bytes<=8*size);
            runs.push({count:[10,1000][i],reportMode,reportHash,selectedBytes:size,elapsedMs:performance.now()-at,...m.m});
        }
    }
    for(const mode of ['full','compact']){const a=runs.filter(r=>r.reportMode===mode);for(const name of ['sql','pragmas','rows','opens','reads','bytes','maxChunk','writes','metadataOpens','reportHash'])assert.equal(a[0][name],a[1][name],name);}
    console.log(JSON.stringify({phase,schema,runs,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
}else if(phase==='preservation'){
    const receipt=JSON.parse(fs.readFileSync(roots.pop())),hashes=roots.map(root=>hash(JSON.stringify(inventory(root))));assert.deepEqual(hashes,receipt.stores.map(s=>s.inventoryHash));
    console.log(JSON.stringify({phase,schema,hashes,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
}else if(phase==='faults'){
    let mode='none',current,sessions=0,escaped;
    const wrap=opener=>async args=>{const h=await opener(args),s=h.evidence??h,native=s.withReadSnapshot.bind(s),close=h.close.bind(h);
        s.withReadSnapshot=(selection,callback)=>native(selection,async view=>{
            escaped=view;
            if(mode==='retire'){
                const r=current.data.manifest.scoreRecords[0],refs=[...current.refs[0],{path:r.outputPath,hash:r.outputFingerprint,bytes:current.data.files[r.outputPath].length}];
                const module=new URL(schema===1?'../../tools/replay-store.js':'../../tools/replay-catalog.js',import.meta.url).href,name=schema===1?'openStore':'openCatalog';
                const code=`import {${name}} from ${JSON.stringify(module)};const h=await ${name}({root:process.argv[1],mode:'write'}),s=h.evidence??h,k=JSON.parse(process.argv[2]),refs=JSON.parse(process.argv[3]);await s.withWriter(async w=>{w.transaction(tx=>tx.setStatus({recordKey:k,status:'done'}));w.transaction(tx=>{tx.setStatus({recordKey:k,status:'retiring'});tx.appendIntent({id:'retire',recordKey:k,phase:'cleanup',files:refs.map((r,ordinal)=>({...r,ordinal}))});});for(let ordinal=0;ordinal<refs.length;ordinal++)await w.deleteFile({operationId:'retire',ordinal});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'retire',retire:true}));});h.close();`;
                const p=spawnSync(process.execPath,['--input-type=module','-e',code,current.root,JSON.stringify(key(r)),JSON.stringify(refs)],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr);
            }
            if(mode==='callback-null')throw null;
            if(mode==='read-null')view.read=()=>{throw null;};
            return callback(view);
        });h.close=()=>{close();if(mode.endsWith('close'))throw Error('handle-close');};return h;};
    mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{namedExports:{...core,openStore:wrap(core.openStore)}});
    mock.module(new URL('../../tools/replay-catalog.js',import.meta.url).href,{namedExports:{...catalog,openCatalog:wrap(catalog.openCatalog)}});
    mock.module(new URL('../../tools/replay-analysis.js',import.meta.url).href,{namedExports:{...analysis,analyzeLoadedScoreReplay:options=>{sessions++;if(mode.startsWith('analysis-null'))throw null;return analysis.analyzeLoadedScoreReplay(options);}}});
    const {analyzeFixtureScoreReplay}=await import('../../tools/replay-score-analysis-fixture.js');current=await makeFixture(schema);
    try{
        for(mode of ['callback-null','read-null','analysis-null','analysis-null-close','handle-close']){const before=inventory(current.root);await assert.rejects(analyzeFixtureScoreReplay(current.options),e=>mode.includes('null')?e===null:e.message==='handle-close');assert.deepEqual(inventory(current.root),before);assert.throws(()=>escaped.scoreSelection(),{code:'CLOSED'});await current.s.withWriter(()=>{});}
        mode='none';reportEqual(await analyzeFixtureScoreReplay(current.options),golden.scenarios.scale.reports.full);
        const k=key(current.data.manifest.scoreRecords[0]);await current.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:'pending'})));const beforeSessions=sessions;await assert.rejects(analyzeFixtureScoreReplay(current.options),{code:'UNAVAILABLE'});assert.equal(sessions,beforeSessions);
        // Restore readiness through the existing exact reservation/intent retry.
        const r=current.data.manifest.scoreRecords[0];await current.s.withWriter(w=>w.transaction(tx=>{tx.appendIntent({id:'restore',recordKey:k,files:[{ordinal:0,path:r.outputPath,hash:r.outputFingerprint,bytes:current.data.files[r.outputPath].length}]});}));
        await current.s.withWriter(async w=>{await w.publishOutput({recordKey:k,path:r.outputPath,source:[],expectedHash:r.outputFingerprint,expectedBytes:current.data.files[r.outputPath].length});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'restore'}));});
        const before=inventory(current.root),retained=current.data.manifest.scoreRecords.slice(1).map(r=>current.s.getRecord(key(r)));mode='retire';reportEqual(await analyzeFixtureScoreReplay(current.options),golden.scenarios.scale.reports.full);
        mode='none';const after=inventory(current.root),removed=[r.outputPath,...current.refs[0].map(r=>r.path)];assert.deepEqual(Object.keys(before).filter(p=>!(p in after)).sort(),removed.sort());for(const p in after)if(p!==path.relative(current.root,dbPath(current.root)))assert.deepEqual(after[p],before[p]);assert.deepEqual(current.data.manifest.scoreRecords.slice(1).map(r=>current.s.getRecord(key(r))),retained);
        assert.equal(current.s.getRecord(k).kind,'retired');const report=await analyzeFixtureScoreReplay({...current.options,scoreFingerprints:[r.fingerprint]});assert.ok(report.findings.some(f=>f.rule==='score.record-selection'&&f.verdict==='unknown'));
        await current.s.withWriter(()=>{});console.log(JSON.stringify({phase,schema,passed:true}));
    }finally{current.h.close();fs.rmSync(current.root,{recursive:true,force:true});}
}else throw Error('Unknown M2d test worker phase');
assert.ok(rss()<=256*1048576,`Peak RSS ${rss()}`);

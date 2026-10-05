// Synthetic qualification subprocesses; never a production entrypoint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {mock} from 'node:test';
import * as core from '../../tools/replay-store.js';
import * as catalog from '../../tools/replay-catalog.js';
import * as analysis from '../../tools/replay-analysis.js';
import {makeFixture,inventory,hash,key} from './replay-analysis-m2c-store.js';
import {replayId,fingerprint} from './replay-analysis-m2c-recipe.js';
const golden=JSON.parse(fs.readFileSync(new URL('./replay-analysis-m2c-oracle.json',import.meta.url)));
const [phase,schemaText,...roots]=process.argv.slice(2), schema=Number(schemaText), started=performance.now();
const dbPath=root=>path.join(root,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).database);
const options=root=>({root,schemaVersion:schema,replayId,fingerprints:[0,1,2,3].map(fingerprint)});
const rss=()=>process.resourceUsage().maxRSS*1024;
function rowCount(root,count) {const db=new DatabaseSync(dbPath(root),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,count);}finally{db.close();}}
function instrument(paths) {
    const original={open:fs.openSync,read:fs.readSync,close:fs.closeSync,write:fs.writeSync,prepare:DatabaseSync.prototype.prepare,exec:DatabaseSync.prototype.exec};
    const fds=new Map(), all=new Set(), metrics={sql:0,pragmas:0,rows:0,opens:0,reads:0,bytes:0,maxChunk:0,writes:0,metadataOpens:0,openPaths:{},readPaths:{}};
    const classify=sql=>{if(/^PRAGMA /i.test(sql))metrics.pragmas++;else metrics.sql++;};
    fs.openSync=(file,...args)=>{const fd=original.open(file,...args),p=String(file);all.add(fd);
        if(paths.has(p)||/\/(diagnostics|extensions|summaries)\//.test(p)||p.endsWith('.jsonl')||p.includes('/pain_and_gain_map_')) {fds.set(fd,p);metrics.opens++;metrics.openPaths[p]=(metrics.openPaths[p]??0)+1;}else metrics.metadataOpens++;return fd;};
    fs.readSync=(fd,buffer,...args)=>{const n=original.read(fd,buffer,...args),p=fds.get(fd);if(p){metrics.reads++;metrics.bytes+=n;metrics.maxChunk=Math.max(metrics.maxChunk,buffer.length);metrics.readPaths[p]=(metrics.readPaths[p]??0)+n;}return n;};
    fs.closeSync=fd=>{fds.delete(fd);all.delete(fd);return original.close(fd);};
    fs.writeSync=(fd,...args)=>{if(fds.has(fd))metrics.writes++;return original.write(fd,...args);};
    DatabaseSync.prototype.exec=function(sql){classify(sql);return original.exec.call(this,sql);};
    DatabaseSync.prototype.prepare=function(sql){classify(sql);const s=original.prepare.call(this,sql),get=s.get,all=s.all,iterate=s.iterate;
        s.get=function(...a){const r=get.apply(this,a);if(r)metrics.rows++;return r;};
        s.all=function(...a){const r=all.apply(this,a);metrics.rows+=r.length;return r;};
        s.iterate=function*(...a){for(const r of iterate.apply(this,a)){metrics.rows++;yield r;}};return s;};
    return {metrics,restore(){Object.assign(fs,{openSync:original.open,readSync:original.read,closeSync:original.close,writeSync:original.write});DatabaseSync.prototype.prepare=original.prepare;DatabaseSync.prototype.exec=original.exec;assert.equal(fds.size,0);assert.equal(all.size,0);}};
}

if(phase==='generate') {
    const stores=[];
    for(const [i,root] of roots.entries()) {
        const count=[10,1000][i], f=await makeFixture(schema,'scale',{root,count,large:true});rowCount(root,count);
        const inv=inventory(root), ino=new Set();
        assert.equal(f.largeRefs.length,12);assert.equal(new Set(f.largeRefs.map(r=>r.hash)).size,12);
        for(const ref of f.largeRefs){const st=fs.statSync(path.join(root,ref.path));assert.equal(st.size,50*1024*1024);assert.equal(st.nlink,1);ino.add(`${st.dev}:${st.ino}`);assert.equal(inv[ref.path].hash,ref.hash);}
        assert.equal(ino.size,12);
        for(const expected of golden.scenarios.scale.artifacts) {
            const ref=expected.file?{path:expected.file}:f.refs[parseInt(expected.fingerprint,16)].find(r=>r.pointer===expected.pointer);
            assert.deepEqual(inv[ref.path],{bytes:expected.bytes,hash:expected.hash});
        }
        stores.push({count,unrelatedBytes:12*50*1024*1024,inventoryHash:hash(JSON.stringify(inv))});f.h.close();
    }
    console.log(JSON.stringify({phase,schema,stores,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
} else if(phase==='operations') {
    const {analyzeFixtureReplay}=await import('../../tools/replay-analysis-fixture.js'),runs=[];
    for(const [i,root] of roots.entries()) {
        const count=[10,1000][i];rowCount(root,count);
        const db=new DatabaseSync(dbPath(root),{readOnly:true});let selected;
        try {selected=[...db.prepare('SELECT path,bytes FROM payloads WHERE owner_key IN (?,?,?,?)').all(...[0,1,2,3].map(i=>core.recordKey(key(i)))),...db.prepare('SELECT path,bytes FROM outputs').all(),...db.prepare('SELECT path FROM maps').all().map(r=>({...r,bytes:fs.statSync(path.join(root,r.path)).size}))];}finally{db.close();}
        assert.equal(selected.length,12);const paths=new Set(selected.map(r=>path.join(root,r.path))),size=selected.reduce((sum,r)=>sum+r.bytes,0);
        for(const reportMode of ['full','compact']) {
            const beforeDb=hash(fs.readFileSync(dbPath(root))),measurement=instrument(paths),at=performance.now();let report;
            try{report=await analyzeFixtureReplay({...options(root),reportMode});}finally{measurement.restore();}
            const reportHash=hash(JSON.stringify(report)+'\n');assert.equal(reportHash,golden.scenarios.scale.hashes[reportMode]);
            assert.equal(hash(fs.readFileSync(dbPath(root))),beforeDb);
            const m=measurement.metrics;assert.equal(m.opens,12);assert.equal(m.writes,0);assert.ok(m.maxChunk<=65536);assert.ok(m.bytes<=8*size);
            assert.ok(Object.keys(m.openPaths).every(p=>paths.has(p)));assert.ok(Object.keys(m.readPaths).every(p=>paths.has(p)));assert.ok(Object.values(m.openPaths).every(n=>n===1));
            // Keep physical paths out of measured receipts; identity is checked
            // above and report hashes contain logical references only.
            delete m.openPaths;delete m.readPaths;runs.push({count,reportMode,reportHash,selectedArtifactBytes:size,elapsedMs:performance.now()-at,...m});
        }
    }
    for(const reportMode of ['full','compact']){const a=runs.filter(r=>r.reportMode===reportMode);for(const name of ['sql','pragmas','rows','opens','reads','bytes','maxChunk','writes','metadataOpens','reportHash'])assert.equal(a[0][name],a[1][name],name);}
    console.log(JSON.stringify({phase,schema,runs,elapsedMs:performance.now()-started,maxRssBytes:rss()}));
} else if(phase==='preservation') {
    console.log(JSON.stringify({phase,schema,inventoryHashes:roots.map(root=>hash(JSON.stringify(inventory(root)))),elapsedMs:performance.now()-started,maxRssBytes:rss()}));
} else if(phase==='ordinals') {
    const f=await makeFixture(schema),kind=roots[0],high=9007199254740992n,max=9223372036854775807n;
    const ordinals=kind==='mixed'?[high+1n,high,3,4]:[high+1n,high,max,max-1n];
    const expected=kind==='mixed'?[2,3,1,0]:[1,0,3,2];
    try {
        const db=new DatabaseSync(dbPath(f.root));
        try {const q=db.prepare('UPDATE records SET ordinal=? WHERE key=?');for(let i=0;i<4;i++)q.run(ordinals[i],core.recordKey(key(i)));}finally{db.close();}
        assert.deepEqual([0,1,2,3].map(i=>f.s.getRecord(key(i)).ordinal),ordinals);
        let observed;
        mock.module(new URL('../../tools/replay-analysis.js',import.meta.url).href,{namedExports:{...analysis,createReplayAnalysisSession:opts=>{observed=opts.logicalManifest.records.map(r=>r.fingerprint);return analysis.createReplayAnalysisSession(opts);}}});
        const {analyzeFixtureReplay}=await import('../../tools/replay-analysis-fixture.js'),before=inventory(f.root);
        for(const reportMode of ['full','compact']) {
            const report=await analyzeFixtureReplay({...f.options,fingerprints:[...f.options.fingerprints].reverse(),reportMode});
            assert.deepEqual(observed,expected.map(fingerprint));assert.deepEqual(report.selectedFingerprints,f.options.fingerprints);
        }
        assert.deepEqual(inventory(f.root),before);await f.s.withWriter(()=>{});
        console.log(JSON.stringify({passed:true,schema,kind}));
    } finally {f.h.close();fs.rmSync(f.root,{recursive:true,force:true});}
} else if(phase==='faults') {
    let mode='none', current, sessions=0;
    const wrap=opener=>async args=>{
        const h=await opener(args),s=h.evidence??h,native=s.withReadSnapshot.bind(s),close=h.close.bind(h);
        s.withReadSnapshot=(selection,callback)=>native(selection,async view=>{
            if(mode==='cleanup') {
                const r=current.data.manifest.records[0],refs=[...current.refs[0],{path:r.outputPath,hash:r.outputFingerprint,bytes:Buffer.byteLength(current.data.files[r.outputPath])}];
                const module=new URL(current.schema===1?'../../tools/replay-store.js':'../../tools/replay-catalog.js',import.meta.url).href;
                const name=current.schema===1?'openStore':'openCatalog';
                const script=`import {${name}} from ${JSON.stringify(module)};const h=await ${name}({root:process.argv[1],mode:'write'}),s=h.evidence??h,k=JSON.parse(process.argv[2]),refs=JSON.parse(process.argv[3]);await s.withWriter(async w=>{w.transaction(tx=>{tx.setStatus({recordKey:k,status:'done'});tx.appendIntent({id:'cleanup',recordKey:k,phase:'cleanup',files:refs.map((r,ordinal)=>({...r,ordinal}))});});for(let ordinal=0;ordinal<refs.length;ordinal++)await w.deleteFile({operationId:'cleanup',ordinal});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'cleanup',retire:true}));});h.close();console.log('retired');`;
                const p=spawnSync(process.execPath,['--input-type=module','-e',script,current.root,JSON.stringify(key(0)),JSON.stringify(refs)],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'retired');
            }
            if(mode==='callback-null')throw null;
            return callback(view);
        });
        h.close=()=>{close();if(mode.endsWith('close'))throw Error('handle-close');};return h;
    };
    mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{namedExports:{...core,openStore:wrap(core.openStore)}});
    mock.module(new URL('../../tools/replay-catalog.js',import.meta.url).href,{namedExports:{...catalog,openCatalog:wrap(catalog.openCatalog)}});
    mock.module(new URL('../../tools/replay-analysis.js',import.meta.url).href,{namedExports:{...analysis,createReplayAnalysisSession:opts=>{sessions++;const s=analysis.createReplayAnalysisSession(opts);if(mode.startsWith('session-null'))s.finish=()=>{throw null;};return s;}}});
    const {analyzeFixtureReplay}=await import('../../tools/replay-analysis-fixture.js');
    for(const schema of [1,2]) {
        current=await makeFixture(schema);
        try {
            for(mode of ['callback-null','session-null','session-null-close','handle-close']) {
                const before=inventory(current.root);await assert.rejects(analyzeFixtureReplay(current.options),e=>mode.includes('null')?e===null:e.message==='handle-close');
                assert.deepEqual(inventory(current.root),before);await current.s.withWriter(()=>{});
            }
            mode='none';await analyzeFixtureReplay(current.options);
            const beforeSessions=sessions;
            await assert.rejects(analyzeFixtureReplay({...current.options,fingerprints:[fingerprint(99)]}),{code:'UNAVAILABLE'});assert.equal(sessions,beforeSessions);
            const before=inventory(current.root), retained=[1,2,3].map(i=>current.s.getRecord(key(i)));
            const removed=[...current.refs[0].map(r=>r.path),current.data.manifest.records[0].outputPath];
            mode='cleanup';const report=await analyzeFixtureReplay(current.options);assert.deepEqual(report,golden.scenarios.scale.reports.full);
            const after=inventory(current.root),database=path.relative(current.root,dbPath(current.root));
            assert.deepEqual(Object.keys(before).filter(p=>!Object.hasOwn(after,p)).sort(),removed.sort());
            for(const p of Object.keys(after))if(p!==database)assert.deepEqual(after[p],before[p]);
            assert.deepEqual([1,2,3].map(i=>current.s.getRecord(key(i))),retained);
            assert.equal(current.s.pageOperations().rows.length,0);
            mode='none';assert.equal(current.s.getRecord(key(0)).kind,'retired');await assert.rejects(analyzeFixtureReplay(current.options),{code:'UNAVAILABLE'});
            await analyzeFixtureReplay({...current.options,fingerprints:[fingerprint(1)]});
        }finally{current.h.close();fs.rmSync(current.root,{recursive:true,force:true});}
    }
    console.log(JSON.stringify({passed:true}));
} else throw Error('Unknown synthetic worker phase');
assert.ok(rss()<=256*1024*1024,`256 MiB RSS: ${rss()}`);

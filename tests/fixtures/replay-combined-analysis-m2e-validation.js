// Isolated module mock proves transport rejection precedes combined analysis.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {mock} from 'node:test';
import * as analysis from '../../tools/replay-analysis.js';
import {analyzeFixtureReplay} from '../../tools/replay-analysis-fixture.js';
import {recordKey,recordOwner} from '../../tools/replay-store.js';
import {digestChunks} from '../../tools/replay-store-payloads.js';
import {makeFixture,inventory,key,chunks} from './replay-combined-analysis-m2e-store.js';
const schema=Number(process.argv[2]),fault=process.argv[3];let entries=0;
mock.module(new URL('../../tools/replay-analysis.js',import.meta.url).href,{namedExports:{...analysis,
    analyzeLoadedCombinedReplay:options=>{entries++;return analysis.analyzeLoadedCombinedReplay(options);}}});
const {analyzeFixtureCombinedReplay}=await import('../../tools/replay-combined-analysis-fixture.js');
const golden=JSON.parse(fs.readFileSync(new URL('./replay-combined-analysis-m2e-oracle.json',import.meta.url)));
const equal=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const f=await makeFixture(schema);let passed=false,restore;
function sql(statement,args=[],ignoreChecks=false){
    const db=new DatabaseSync(path.join(f.root,JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json'))).database));
    try{if(ignoreChecks)db.exec('PRAGMA ignore_check_constraints=ON');db.prepare(statement).run(...args);}finally{db.close();}
}
try{
    const logOptions={...f.options};delete logOptions.scoreFingerprints;
    const logBefore=await analyzeFixtureReplay(logOptions);
    if(fault.startsWith('binding-')||fault.startsWith('valid-')){
        const k=key(f.data.manifest.records[1],'log'),owner=recordOwner(k),pointer='/z-binding';
        const role=fault==='binding-role'?'diagnostics':fault==='valid-summaries'?'summaries':'extensions';
        const content=Buffer.from('{}');let ref;
        await f.s.withWriter(async w=>{
            ref=await w.publishPayload({owner,pointer,role,evidenceOnly:true,source:chunks(content),...digestChunks(chunks(content))});
            w.transaction(tx=>{tx.finishPublication({recordKey:k,payloadRefs:[ref]});tx.setProperty({owner,pointer,ordinal:100,payloadRef:ref});});
        });
        if(fault==='binding-pointer'){
            // Public writer allows same-owner indirection; M2e's admitted
            // profile is deliberately narrower than M2c's existing loader.
            await f.s.withWriter(w=>w.transaction(tx=>tx.setProperty({owner,pointer:'/z-alias',ordinal:101,payloadRef:ref})));
            restore=()=>sql('DELETE FROM properties WHERE owner_kind=? AND owner_key=? AND pointer=?',[owner.kind,owner.key,'/z-alias']);
        }else if(fault==='binding-encoding'){
            sql('UPDATE payloads SET encoding=? WHERE path=?',['jsonl-v1',ref.path],true);
            restore=()=>sql('UPDATE payloads SET encoding=? WHERE path=?',['json-v1',ref.path]);
        }else if(fault==='binding-role'){
            // Remove only the original-property binding for the subsequent
            // operation; retain the published artifact and its registration.
            restore=()=>sql('DELETE FROM properties WHERE owner_kind=? AND owner_key=? AND pointer=?',[owner.kind,owner.key,pointer]);
        }
        const before=inventory(f.root);equal(await analyzeFixtureReplay(logOptions),logBefore);assert.deepEqual(inventory(f.root),before);
    }else if(fault==='ownership-root'||fault==='ownership-child'){
        const ref=f.refs[0].refs[fault==='ownership-root'?0:1],mapId='f'.repeat(64);
        sql('INSERT INTO maps VALUES (?,?,?,?,?)',[mapId,ref.path,ref.hash,'validated',1]);
        restore=()=>sql('DELETE FROM maps WHERE key=?',[mapId]);
    }else if(fault==='ownership-map'){
        const k={collection:'score',replayId:f.options.replayId,fingerprint:'f'.repeat(64)};
        await f.s.withWriter(w=>w.transaction(tx=>tx.insertEntity({kind:'record',key:recordKey(k),ordinal:4})));
        const m=f.data.manifest.maps[0],bytes=f.data.files[m.file];
        sql('INSERT INTO outputs VALUES (?,?,?,?,?,?,?)',[m.file,k.collection,k.replayId,k.fingerprint,f.selected.at(-1).hash,bytes.length,'pending']);
        restore=()=>sql('DELETE FROM outputs WHERE path=?',[m.file]);
    }else throw Error('Unknown validation case');

    const before=inventory(f.root),native={open:fs.openSync,close:fs.closeSync},handles=new Set();let opened=0,closed=0;
    const selected=new Set(f.selected.map(ref=>path.join(f.root,ref.path)));
    fs.openSync=(p,...args)=>{const fd=native.open(p,...args);if(selected.has(String(p))){handles.add(fd);opened++;}return fd;};
    fs.closeSync=fd=>{if(handles.delete(fd))closed++;return native.close(fd);};
    try{
        if(fault.startsWith('valid-')){equal(await analyzeFixtureCombinedReplay(f.options),golden.scenarios.scale.reports.full);assert.equal(entries,1);}
        else{await assert.rejects(analyzeFixtureCombinedReplay(f.options),{code:fault.startsWith('ownership-')?'OWNERSHIP_CONFLICT':fault==='binding-pointer'?'INVALID_REFERENCE':'UNSUPPORTED_REPRESENTATION'});assert.equal(entries,0);}
        // A first-root conflict rejects before any artifact is opened; later
        // failures must close the already acquired descriptors as well.
        if(fault!=='ownership-root')assert.ok(opened>0);
        assert.equal(opened,closed);assert.equal(handles.size,0);
    }finally{Object.assign(fs,{openSync:native.open,closeSync:native.close});}
    assert.deepEqual(inventory(f.root),before);assert.equal(fs.existsSync(path.join(f.root,'.manifest.lock')),false);
    await f.s.withWriter(()=>{});
    restore?.();const restored=inventory(f.root);
    equal(await analyzeFixtureCombinedReplay(f.options),golden.scenarios.scale.reports.full);
    assert.deepEqual(inventory(f.root),restored);await f.s.withWriter(()=>{});
    passed=true;console.log(JSON.stringify({passed,schema,fault,entries,opened,closed}));
}finally{f.h.close();if(passed)fs.rmSync(f.root,{recursive:true,force:true});else console.error(JSON.stringify({retainedFailedFixture:f.root,fault,entries}));}

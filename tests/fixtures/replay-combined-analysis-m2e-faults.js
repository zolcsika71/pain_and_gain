import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mock} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import * as core from '../../tools/replay-store.js';
import * as catalog from '../../tools/replay-catalog.js';
import * as analysis from '../../tools/replay-analysis.js';
import {makeFixture,inventory,key} from './replay-combined-analysis-m2e-store.js';
const schema=Number(process.argv[2]),golden=JSON.parse(fs.readFileSync(new URL('./replay-combined-analysis-m2e-oracle.json',import.meta.url)));
let mode='none',current,entered=0,escaped,writerInventory;
const equal=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
function retire(collection){
    const record=(collection==='log'?current.data.manifest.records:current.data.manifest.scoreRecords)[0],k=key(record,collection),refs=[...current.refs.find(r=>r.key.collection===collection&&r.key.fingerprint===record.fingerprint).refs];
    if(record.outputPath)refs.push({path:record.outputPath,hash:record.outputFingerprint,bytes:current.data.files[record.outputPath].length});
    const name=schema===1?'openStore':'openCatalog',module=new URL(schema===1?'../../tools/replay-store.js':'../../tools/replay-catalog.js',import.meta.url).href;
    const code=`import {${name}} from ${JSON.stringify(module)};const h=await ${name}({root:process.argv[1],mode:'write'}),s=h.evidence??h,k=JSON.parse(process.argv[2]),refs=JSON.parse(process.argv[3]);await s.withWriter(async w=>{w.transaction(tx=>tx.setStatus({recordKey:k,status:'done'}));w.transaction(tx=>{if(k.collection==='score')tx.setStatus({recordKey:k,status:'retiring'});tx.appendIntent({id:'retire',recordKey:k,phase:'cleanup',files:refs.map((r,ordinal)=>({...r,ordinal}))});});for(let ordinal=0;ordinal<refs.length;ordinal++)await w.deleteFile({operationId:'retire',ordinal});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'retire',retire:true}));});h.close();`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code,current.root,JSON.stringify(k),JSON.stringify(refs)],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
}
const wrap=opener=>async options=>{
    const h=await opener(options),s=h.evidence??h,snapshot=s.withReadSnapshot.bind(s),close=h.close.bind(h);
    // Any attempt to authorize using preliminary getters would fail this worker.
    s.getRecord=s.getReplay=s.getMap=()=>{throw Error('Advisory getter used');};
    s.withReadSnapshot=async(selection,callback)=>{
        if(mode==='acquisition-intent')await current.s.withWriter(w=>w.transaction(tx=>tx.appendIntent({id:'race',recordKey:key(current.data.manifest.scoreRecords[0],'score')})));
        if(mode==='acquisition-retire'){retire('score');writerInventory=inventory(current.root);}
        if(mode==='acquisition-presence'||mode==='acquisition-association'){
            // Adversarial metadata transition before the real acquisition;
            // no snapshot callback has run and no lock is bypassed by reading.
            const db=new DatabaseSync(path.join(current.root,JSON.parse(fs.readFileSync(path.join(current.root,'manifest.json'))).database));
            try{if(mode==='acquisition-presence')db.prepare("DELETE FROM collections WHERE key='scoreRecords'").run();else db.prepare("UPDATE replays SET status='pending' WHERE key=?").run(current.options.replayId);}finally{db.close();}
            writerInventory=inventory(current.root);
        }
        return snapshot(selection,async view=>{
            escaped=view;
            if(mode==='retire-score'||mode==='retire-log'){retire(mode.slice(7));writerInventory=inventory(current.root);}
            if(mode==='callback-null')throw null;
            if(mode==='read-null')view.read=()=>{throw null;};
            if(mode==='read-error')view.read=()=>{throw Error('read-primary');};
            return callback(view);
        });
    };
    h.close=()=>{close();if(mode.endsWith('close'))throw Error('owner-close');};return h;
};
mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{namedExports:{...core,openStore:wrap(core.openStore)}});
mock.module(new URL('../../tools/replay-catalog.js',import.meta.url).href,{namedExports:{...catalog,openCatalog:wrap(catalog.openCatalog)}});
mock.module(new URL('../../tools/replay-analysis.js',import.meta.url).href,{namedExports:{...analysis,analyzeLoadedCombinedReplay:options=>{entered++;if(mode.startsWith('analysis-null'))throw null;if(mode==='analysis-error-close')throw Error('analysis-primary');return analysis.analyzeLoadedCombinedReplay(options);}}});
const {analyzeFixtureCombinedReplay}=await import('../../tools/replay-combined-analysis-fixture.js');
current=await makeFixture(schema);
let passed=false;const roots=[current.root];
try{
    for(mode of ['callback-null','read-null','read-error','analysis-null','analysis-null-close','analysis-error-close','owner-close']){
        const before=inventory(current.root);await assert.rejects(analyzeFixtureCombinedReplay(current.options),e=>mode.includes('null')?e===null:e.message===(mode==='read-error'?'read-primary':mode==='analysis-error-close'?'analysis-primary':'owner-close'));
        assert.deepEqual(inventory(current.root),before);assert.throws(()=>escaped.combinedSelection(),{code:'CLOSED'});await current.s.withWriter(()=>{});
    }
    mode='none';equal(await analyzeFixtureCombinedReplay(current.options),golden.scenarios.scale.reports.full);
    mode='acquisition-intent';const beforeEntry=entered;await assert.rejects(analyzeFixtureCombinedReplay(current.options),{code:'UNAVAILABLE'});assert.equal(entered,beforeEntry);current.h.close();
    for(mode of ['acquisition-presence','acquisition-association']){
        current=await makeFixture(schema);roots.push(current.root);const previous=entered;
        await assert.rejects(analyzeFixtureCombinedReplay(current.options),{code:mode==='acquisition-presence'?'UNSUPPORTED_REPRESENTATION':'INVALID_REFERENCE'});
        assert.equal(entered,previous);assert.deepEqual(inventory(current.root),writerInventory);await current.s.withWriter(()=>{});current.h.close();
    }
    current=await makeFixture(schema);roots.push(current.root);mode='acquisition-retire';
    const raced=await analyzeFixtureCombinedReplay(current.options);assert.equal(raced.scoring.sources.length,1);assert.ok(raced.findings.some(f=>f.rule==='score.record-selection'&&f.verdict==='unknown'));assert.deepEqual(inventory(current.root),writerInventory);current.h.close();
    for(const collection of ['score','log']){
        current=await makeFixture(schema);roots.push(current.root);
        const k=key((collection==='log'?current.data.manifest.records:current.data.manifest.scoreRecords)[0],collection);
        await current.s.withWriter(w=>w.transaction(tx=>tx.setStatus({recordKey:k,status:'done'})));
        // Done score remains readable until the explicit child writer retires it.
        mode='none';const before=inventory(current.root);const done=await analyzeFixtureCombinedReplay(current.options);assert.deepEqual(inventory(current.root),before);assert.equal(done.scoring.sources.length,2);
        mode='retire-'+collection;const pinned=await analyzeFixtureCombinedReplay(current.options);equal(pinned,done);assert.deepEqual(inventory(current.root),writerInventory);
        mode='none';if(collection==='log')await assert.rejects(analyzeFixtureCombinedReplay(current.options),{code:'UNAVAILABLE'});
        else{const later=await analyzeFixtureCombinedReplay(current.options);assert.equal(later.scoring.sources.length,1);assert.ok(later.findings.some(f=>f.rule==='score.record-selection'&&f.verdict==='unknown'));}
        await current.s.withWriter(()=>{});current.h.close();
    }
    passed=true;console.log(JSON.stringify({passed,schema,analyzerEntries:entered}));
}finally{current.h.close();if(passed)for(const root of roots)fs.rmSync(root,{recursive:true,force:true});else console.error(JSON.stringify({retainedFailedFixtures:roots}));}

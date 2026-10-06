// M2e: fixture-only. No production command imports or dispatches this adapter.
import {fail,LIMITS} from './replay-store-payloads.js';
import {localBuild,loadFixtureLogs} from './replay-analysis-fixture.js';
import {loadFixtureScores} from './replay-score-analysis-fixture.js';
import {analyzeLoadedCombinedReplay} from './replay-analysis.js';

export async function analyzeFixtureCombinedReplay(options) {
    if(options===null||typeof options!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(options)))fail('INVALID_ARGUMENT','Explicit plain options required');
    const allowed=new Set(['root','schemaVersion','replayId','fingerprints','scoreFingerprints','reportMode']);
    if(Reflect.ownKeys(options).some(k=>!allowed.has(k)))fail('UNSUPPORTED_OPTION','Unsupported combined fixture option');
    const {root,schemaVersion,replayId,fingerprints,scoreFingerprints,reportMode='full'}=options;
    if(schemaVersion!==1&&schemaVersion!==2)fail('UNSUPPORTED_STORE','Expected schema 1 or 2');
    if((Array.isArray(fingerprints)?fingerprints.length:0)+(Array.isArray(scoreFingerprints)?scoreFingerprints.length:0)>LIMITS.sources)fail('RESOURCE_LIMIT','Combined selection exceeds 64 sources');
    if(typeof replayId!=='string'||!/^[a-f0-9]{24}$/.test(replayId)||[fingerprints,scoreFingerprints].some(values=>!Array.isArray(values)||!values.length||values.some(f=>typeof f!=='string'||!/^[a-f0-9]{64}$/.test(f))||new Set(values).size!==values.length))fail('INVALID_IDENTITY','Explicit distinct log and score fingerprints required');
    if(!['full','compact'].includes(reportMode))fail('INVALID_ARGUMENT','Expected full or compact report');
    const logs=[...fingerprints],scores=[...scoreFingerprints];
    const handle=schemaVersion===1?await(await import('./replay-store.js')).openStore({root,mode:'read'}):await(await import('./replay-catalog.js')).openCatalog({root,mode:'read'});
    const store=handle.evidence??handle;let failed=false;
    try {
        const localBuildId=localBuild(root);
        return await store.withReadSnapshot({combinedSelection:{replayId,logFingerprints:logs,scoreFingerprints:scores}},async view=>{
            const budget={combined:true,metadata:0,diagnostics:0,raw:0};
            const loaded=await loadFixtureLogs(view,{replayId,budget});
            const scoreInputs=await loadFixtureScores(view,{replayId,budget});
            if(view.combinedSelection().scores.collections.scoreRecords.present)loaded.logicalManifest.scoreRecords=scoreInputs.scoreRecords;
            return analyzeLoadedCombinedReplay({...loaded,sourceEvidence:scoreInputs.sourceEvidence,replayId,fingerprints:logs,scoreFingerprints:scores,reportMode,localBuildId});
        });
    }catch(error){failed=true;throw error;}
    finally{try{handle.close();}catch(error){if(!failed)throw error;}}
}

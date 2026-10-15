// Bounded schema-1 analysis; fixture guards or a selected production lease. No review writes.
import {assertConsumerMode} from './replay-production-scope.js';
import {fail,LIMITS} from './replay-store-payloads.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';

function selection(value){
    if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)fail('INVALID_IDENTITY','Ordinary fingerprint arrays required');
    const length=Object.getOwnPropertyDescriptor(value,'length').value;
    if(length>LIMITS.sources)fail('RESOURCE_LIMIT','Selection exceeds 64 sources');
    if(Reflect.ownKeys(value).some(k=>k!=='length'&&!(typeof k==='string'&&/^(0|[1-9]\d*)$/.test(k)&&Number(k)<length)))fail('UNSUPPORTED_OPTION','Unsupported selection properties');
    const copy=[];
    for(let i=0;i<length;i++){
        const d=Object.getOwnPropertyDescriptor(value,String(i));
        if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!/^[a-f0-9]{64}$/.test(d.value))fail('INVALID_IDENTITY','Exact data-property fingerprints required');
        copy.push(d.value);
    }
    if(new Set(copy).size!==copy.length)fail('INVALID_IDENTITY','Duplicate fingerprints');return copy;
}
export async function analyzeSyntheticReplay(options){
    if(!options||![Object.prototype,null].includes(Object.getPrototypeOf(options)))fail('INVALID_ARGUMENT','Explicit plain synthetic options required');
    const allowed=['synthetic','production','root','replayId','fingerprints','scoreFingerprints','reportMode'],o={};
    for(const key of Reflect.ownKeys(options)){
        if(!allowed.includes(key))fail('UNSUPPORTED_OPTION','Unsupported synthetic analysis option');
        const d=Object.getOwnPropertyDescriptor(options,key);if(!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Accessor options unsupported');o[key]=d.value;
    }
    assertConsumerMode(o);
    if(!Object.hasOwn(o,'root')||typeof o.replayId!=='string'||!/^[a-f0-9]{24}$/.test(o.replayId))fail('INVALID_IDENTITY','Explicit synthetic root and replay identity required');
    const logs=Object.hasOwn(o,'fingerprints')?selection(o.fingerprints):[],scores=Object.hasOwn(o,'scoreFingerprints')?selection(o.scoreFingerprints):[];
    if(!logs.length&&!scores.length)fail('INVALID_IDENTITY','At least one explicitly selected source required');
    if(logs.length+scores.length>LIMITS.sources)fail('RESOURCE_LIMIT','Combined selection exceeds 64 sources');
    if(Object.hasOwn(o,'scoreFingerprints')&&!scores.length)fail('INVALID_IDENTITY','Explicit score selection cannot be empty');
    const reportMode=Object.hasOwn(o,'reportMode')?o.reportMode:'full';if(!['full','compact'].includes(reportMode))fail('INVALID_ARGUMENT','Expected full or compact report');
    const [major,minor]=process.versions.node.split('.').map(Number);if(process.platform!=='darwin'||major!==24||minor<19)fail('UNSUPPORTED_RUNTIME','Requires Node 24.19+ on macOS');
    assertSyntheticFixtureAccess(o.root);
    const request={root:o.root,schemaVersion:1,replayId:o.replayId,reportMode};
    if(logs.length&&scores.length)return (await import('./replay-combined-analysis-fixture.js')).analyzeFixtureCombinedReplay({...request,fingerprints:logs,scoreFingerprints:scores});
    if(scores.length)return (await import('./replay-score-analysis-fixture.js')).analyzeFixtureScoreReplay({...request,scoreFingerprints:scores});
    return (await import('./replay-analysis-fixture.js')).analyzeFixtureReplay({...request,fingerprints:logs});
}

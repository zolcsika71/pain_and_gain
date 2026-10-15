// Exact selections; fixture guards or a selected production lease. No legacy cleanup fallback.
import {assertConsumerMode} from './replay-production-scope.js';
import {fail} from './replay-store-payloads.js';
import {withCleanup} from './retrieval-files.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';
import {completeFixtureLogReview,completeFixtureScoreReview} from './replay-score-review-fixture.js';
import {openStore} from './replay-store.js';
import {loadFixtureScores} from './replay-score-analysis-fixture.js';
import {canonical,sha256,scoreSourceFingerprint,scoreCoverageMatches,validateScoreBody} from './replay-logs.js';
import {listLimits} from './replay-store-list.js';

export async function listSyntheticLogs(options){
    if(!options||![Object.prototype,null].includes(Object.getPrototypeOf(options)))fail('INVALID_ARGUMENT','Plain synthetic list options required');
    const o={};for(const key of Reflect.ownKeys(options)){const d=Object.getOwnPropertyDescriptor(options,key);if(!['synthetic','production','root','limits'].includes(key)||!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Unsupported/accessor list option');o[key]=d.value;}
    assertConsumerMode(o);
    const limits=listLimits({limits:o.limits});assertSyntheticFixtureAccess(o.root);
    const store=await openStore({root:o.root,mode:'write'});let failed=false,primary;
    try{return await store.withWriter(w=>w.reconcileLogList({limits}));}
    catch(error){failed=true;primary=error;throw error;}
    finally{try{store.close();}catch(error){if(!failed)throw error;if(primary instanceof Error)withCleanup(primary,error);else throw new AggregateError([primary,error],'List and close failed',{cause:primary});}}
}

const commands=['done','complete','reconcile','score-done','score-cleanup','score-verify'];
export async function runSyntheticLifecycle(options){
    if(!options||![Object.prototype,null].includes(Object.getPrototypeOf(options)))fail('INVALID_ARGUMENT','Plain synthetic options required');
    const o={},allowed=['synthetic','production','root','action','replayId','fingerprint','taskId'];
    for(const key of Reflect.ownKeys(options)){
        const d=Object.getOwnPropertyDescriptor(options,key);
        if(!allowed.includes(key)||!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Unsupported/accessor lifecycle option');
        o[key]=d.value;
    }
    assertConsumerMode(o);
    if(!commands.includes(o.action))fail('UNSUPPORTED_OPTION','Exact synthetic lifecycle command required');
    if(typeof o.replayId!=='string'||!/^[a-f0-9]{24}$/.test(o.replayId)||typeof o.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(o.fingerprint))fail('INVALID_IDENTITY','Exact lifecycle identity required');
    const complete=['done','complete','score-done'].includes(o.action),score=o.action.startsWith('score-');
    if(complete?typeof o.taskId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(o.taskId):Object.hasOwn(o,'taskId'))fail('INVALID_IDENTITY','Completion requires an exact task; other commands take no task');
    assertSyntheticFixtureAccess(o.root);
    const request={root:o.root,schemaVersion:1,replayId:o.replayId,fingerprint:o.fingerprint},k={collection:score?'score':'log',replayId:o.replayId,fingerprint:o.fingerprint};
    let completed;
    if(complete){
        // A durable log cleanup intent is resumed by retirement, not completion.
        // The retirement writer rechecks every owner/checkpoint under its lock.
        let retiring=false;
        if(!score){
            const reader=await openStore({root:o.root,mode:'read'});let failed=false,primary;
            try{retiring=reader.getRecord(k).status==='done';}catch(e){failed=true;primary=e;throw e;}
            finally{try{reader.close();}catch(e){if(!failed)throw e;if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Lifecycle read and close failed',{cause:primary});}}
        }
        if(!retiring){completed=await (score?completeFixtureScoreReview:completeFixtureLogReview)({...request,taskId:o.taskId});
        if(score||completed.recordStatus!=='done')return completed;}
    }
    assertSyntheticFixtureAccess(o.root);
    const store=await openStore({root:o.root,mode:o.action==='score-verify'?'read':'write'});let primary,failed=false;
    try{
        if(o.action==='score-verify')return await store.withReadSnapshot({scoreSelection:{replayId:o.replayId,fingerprints:[o.fingerprint]}},async view=>{
            const {scoreRecords,sourceEvidence}=await loadFixtureScores(view,{replayId:o.replayId});
            if(scoreRecords.length!==1)fail('UNAVAILABLE','Exact score is not available');
            const record=scoreRecords[0],body=sourceEvidence.get(record).bytes,responseFingerprint=sha256(body);
            if(responseFingerprint!==record.responseFingerprint||responseFingerprint!==record.outputFingerprint||scoreSourceFingerprint(record.sourceKey,body)!==record.fingerprint)fail('INVALID_ARTIFACT','Score identity/hash mismatch');
            const summary=validateScoreBody(record.kind,body,responseFingerprint);
            if(!scoreCoverageMatches(record.coverage,summary.coverage)||canonical(summary.validation)!==canonical(record.validation))fail('INVALID_ARTIFACT','Score summary mismatch');
            return {replayId:o.replayId,fingerprint:o.fingerprint,responseFingerprint,outputPath:record.outputPath,bytes:body.length,status:record.status,coverage:record.coverage,validation:record.validation,verified:true};
        });
        const retirement=await store.withWriter(w=>score?w.retireScore(k):w.retireLog(k));
        return completed?{...completed,retirement}:retirement;
    }catch(e){primary=e;failed=true;throw e;}finally{try{store.close();}catch(e){if(!failed)throw e;if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Lifecycle operation and close failed',{cause:primary});}}
}

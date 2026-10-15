// One explicitly selected authority for a small, isolated synthetic workflow.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {openStore,withFixtureAuthorityLock,inspectFixtureAuthorityCapabilities} from './replay-store.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';
import {sqliteConsumerCommands,runSqliteConsumer} from './replay-sqlite-consumers.js';
import {resident,withCleanup} from './retrieval-files.js';
import {fail,jsonChunks} from './replay-store-payloads.js';
import {AUTHORITY_FILE,MEMBER_FILE,authorityControl,authorityHash,authorityLease} from './replay-authority-guard.js';
import {rollbackBudget,publishStream,hashFile,exportAuthoritySnapshot,verifyAuthoritySource,syncDirectory} from './replay-authority-export.js';

const need=(ok,code='AUTHORITY_CONFLICT')=>{if(!ok)fail(code,'Synthetic authority contract failed');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const prefix='pain-gain-authority-v2-fixture-';
function copyOptions(value,depth=0,budget={nodes:0,bytes:0}){
    need(depth<=16&&++budget.nodes<=4096,'RESOURCE_LIMIT');
    if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'){
        need(typeof value!=='number'||Number.isFinite(value),'INVALID_ARGUMENT');budget.bytes+=Buffer.byteLength(JSON.stringify(value));need(budget.bytes<=65536,'RESOURCE_LIMIT');return value;
    }
    need(value&&typeof value==='object'&&(Array.isArray(value)?Object.getPrototypeOf(value)===Array.prototype:[Object.prototype,null].includes(Object.getPrototypeOf(value))),'INVALID_ARGUMENT');
    const out=Array.isArray(value)?[]:{};let count=0;
    for(const k of Reflect.ownKeys(value)){if(Array.isArray(value)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(value,k);need(typeof k==='string'&&Object.hasOwn(d,'value')&&d.enumerable,'INVALID_ARGUMENT');budget.bytes+=Buffer.byteLength(k);need(budget.bytes<=65536,'RESOURCE_LIMIT');if(Array.isArray(value))need(k===String(count++),'INVALID_ARGUMENT');Object.defineProperty(out,k,{value:copyOptions(d.value,depth+1,budget),enumerable:true,writable:true,configurable:true});}
    if(Array.isArray(value))need(out.length===value.length,'INVALID_ARGUMENT');return out;
}
function data(input,keys){need(input&&[Object.prototype,null].includes(Object.getPrototypeOf(input)),'INVALID_ARGUMENT');const o={};for(const k of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,k);need(keys.includes(k)&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');Object.defineProperty(o,k,{value:d.value,enumerable:true});}return o;}
function rootPath(root,p){need(typeof root==='string'&&path.isAbsolute(root)&&path.resolve(root)===root&&path.dirname(root)===fs.realpathSync(os.tmpdir())&&path.basename(root).startsWith(p),'UNSAFE_PATH');resident(root,true);need(fs.realpathSync(root)===root,'UNSAFE_PATH');return root;}
function targetRoot(root){return rootPath(root,prefix);}
function sourceRoot(root){return rootPath(root,'pain-gain-store-v3-fixture-');}
function emptyDirectory(root){const directory=fs.opendirSync(root);let failed=false,primary;try{return directory.readSync()===null;}catch(e){failed=true;primary=e;throw e;}finally{try{directory.closeSync();}catch(e){if(!failed)throw e;if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Directory operation/cleanup',{cause:primary});}}}
function state(root){sourceRoot(root);const got=authorityControl(path.join(root,AUTHORITY_FILE)),s=got.value;
    need(s?.backend!=='sqlite-recovery-fenced','RECOVERY_REQUIRED');
    need(s&&same(Object.keys(s).sort(),['backend','descriptorHash','epoch','productionAuthority','rollback','scope','storeId','target'].sort())&&s.scope==='synthetic-authority-v1'&&s.productionAuthority===false&&Number.isSafeInteger(s.epoch)&&s.epoch>=0&&typeof s.storeId==='string'&&/^[a-f0-9-]{36}$/.test(s.storeId)&&/^[a-f0-9]{64}$/.test(s.descriptorHash));
    need(['sqlite','v2'].includes(s.backend));if(s.backend==='sqlite')need(s.target===root);else{targetRoot(s.target);need(s.rollback&&s.rollback.destination===s.target);need(same(authorityControl(path.join(s.target,MEMBER_FILE)).value,{anchor:root,storeId:s.storeId,productionAuthority:false}));}
    need(authorityControl(path.join(root,'manifest.json')).hash===s.descriptorHash);
    const member=authorityControl(path.join(root,MEMBER_FILE)).value;need(same(member,{anchor:root,storeId:s.storeId,productionAuthority:false}));
    if(s.rollback)need(s.rollback&&same(Object.keys(s.rollback).sort(),['destination','receiptHash'].sort())&&/^[a-f0-9]{64}$/.test(s.rollback.receiptHash)&&targetRoot(s.rollback.destination));
    return got;
}
async function writeControl(file,value,b,fault=()=>{},replace=false){return publishStream(file,jsonChunks(value),b,16384,{fault,replace});}
async function usingStore(root,callback){const store=await openStore({root,mode:'write'});let primary;try{return await callback(store);}catch(e){primary=e;throw e;}finally{try{store.close();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Authority operation/cleanup',{cause:primary});else throw e;}}}
function request(input,extra=[]){const o=data(input,['synthetic','root','fault','limits',...extra]);need(o.synthetic===true,'UNSUPPORTED_OPTION');sourceRoot(o.root);need(o.fault===undefined||typeof o.fault==='function','INVALID_ARGUMENT');return{...o,b:rollbackBudget(o.limits),fault:o.fault??(()=>{})};}

export async function selectSyntheticSqliteAuthority(input){const o=request(input);
    return withFixtureAuthorityLock(o.root,async()=>{
        if(fs.existsSync(path.join(o.root,AUTHORITY_FILE))){const current=state(o.root);need(current.value.backend==='sqlite');syncDirectory(o.root);return current.value;}
        assertSyntheticFixtureAccess(o.root);const descriptor=authorityControl(path.join(o.root,'manifest.json'));
        return authorityLease(o.root,{backend:'sqlite',target:o.root,storeId:descriptor.value.storeId},null,()=>usingStore(o.root,store=>store.withWriter(async()=>{const facts=store.authorityCapabilities();const binding={anchor:o.root,storeId:store.storeId,productionAuthority:false};
            // A sticky member fence is published first. Incomplete initialization
            // blocks ordinary store use; this exact operation can recover it.
            const file=path.join(o.root,MEMBER_FILE);if(fs.existsSync(file))need(same(authorityControl(file).value,binding));else await writeControl(file,binding,o.b);
            const selected={scope:'synthetic-authority-v1',productionAuthority:false,storeId:facts.storeId,descriptorHash:descriptor.hash,backend:'sqlite',target:o.root,epoch:0,rollback:null};
            await o.fault('before-authority');await writeControl(path.join(o.root,AUTHORITY_FILE),selected,o.b);await o.fault('after-authority');return selected;
        })));
    });
}
async function selected(o,callback){return withFixtureAuthorityLock(o.root,async()=>{const current=state(o.root);return authorityLease(o.root,current.value,current.hash,async()=>{if(current.value.backend==='sqlite')await inspectFixtureAuthorityCapabilities(o.root);return callback(current);});});}
function rollbackReceipt(s,b){const file=path.join(s.rollback.destination,'rollback-receipt.json');const read=authorityControl(file);need(read.hash===s.rollback.receiptHash);const r=read.value;need(r.version===1&&r.productionAuthority===false&&r.storeId===s.storeId&&r.destination===s.rollback.destination);const data=path.join(r.destination,'replay_logs');need(fs.realpathSync(data)===data);need(same(hashFile(path.join(data,'manifest.json'),b,b.limits.manifestBytes),r.manifest));need(Array.isArray(r.files)&&r.files.length<=40);for(const f of r.files){need(path.basename(f.path)===f.path);need(same(hashFile(path.join(data,f.path),b),{bytes:f.bytes,hash:f.hash}));}
    need(Array.isArray(r.archive)&&r.archive.length<=82&&new Set(r.archive.map(f=>f.path)).size===r.archive.length);
    for(const f of r.archive){need(/^recovery\/(?:source-facts\.json|index\.sqlite|original-\d+\.bytes)$/.test(f.path));need(same(hashFile(path.join(r.destination,f.path),b),{bytes:f.bytes,hash:f.hash}));}
    need(r.archive.some(f=>f.path==='recovery/index.sqlite')&&r.archive.some(f=>f.path==='recovery/source-facts.json'));return r;}

export async function prepareSyntheticRollback(input){const o=request(input,['destination']);targetRoot(o.destination);need(o.destination!==o.root);
    return selected(o,async current=>{need(current.value.backend==='sqlite');
        return usingStore(o.root,store=>store.withWriter(async w=>{const facts=w.authorityExportFacts(),factsHash=authorityHash(JSON.stringify(facts));
            if(current.value.rollback?.destination===o.destination){const prior=rollbackReceipt(current.value,o.b);need(prior.generation===facts.generation&&prior.factsHash===factsHash,'CHANGED_SOURCE');need(same(prior.limits,o.b.limits),'AUTHORITY_CONFLICT');verifyAuthoritySource(o.root,facts,o.b);syncDirectory(o.root);return prior;}
            const binding={anchor:o.root,storeId:store.storeId,productionAuthority:false},member=path.join(o.destination,MEMBER_FILE),intentFile=path.join(o.destination,'rollback-intent.json');
            const intent={version:1,anchor:o.root,destination:o.destination,storeId:store.storeId,generation:facts.generation,factsHash,limits:o.b.limits};
            if(fs.existsSync(intentFile))need(same(authorityControl(intentFile).value,intent),'CHANGED_SOURCE');else{need(emptyDirectory(o.destination),'DESTINATION_NOT_EMPTY');await writeControl(intentFile,intent,o.b);}
            if(fs.existsSync(member))need(same(authorityControl(member).value,binding));else await writeControl(member,binding,o.b);
            await o.fault('before-export');const snapshot=await w.backupAuthorityIndex(o.destination),snapshotDigest=hashFile(path.join(o.destination,snapshot.path),o.b);
            const exported=await exportAuthoritySnapshot(o.root,o.destination,facts,o.b,o.fault);exported.archive.push({path:snapshot.path,...snapshotDigest});await o.fault('after-export');
            need(authorityHash(JSON.stringify(w.authorityExportFacts()))===factsHash,'CHANGED_SOURCE');verifyAuthoritySource(o.root,facts,o.b);
            const receipt={version:1,productionAuthority:false,anchor:o.root,destination:o.destination,...exported};
            const digest=await writeControl(path.join(o.destination,'rollback-receipt.json'),receipt,o.b);
            const next={...current.value,rollback:{destination:o.destination,receiptHash:digest.hash}};
            await o.fault('before-prepare-checkpoint');await writeControl(path.join(o.root,AUTHORITY_FILE),next,o.b,()=>{},true);await o.fault('after-prepare-checkpoint');return receipt;
        }));
    });
}
export async function selectSyntheticV2Authority(input){const o=request(input);
    return selected(o,async current=>{const s=current.value;need(s.rollback,'ROLLBACK_NOT_PREPARED');const receipt=rollbackReceipt(s,o.b);
        if(s.backend==='v2'){syncDirectory(o.root);return s;}
        return usingStore(o.root,store=>store.withWriter(async w=>{const facts=w.authorityExportFacts();need(facts.generation===receipt.generation&&authorityHash(JSON.stringify(facts))===receipt.factsHash,'CHANGED_SOURCE');verifyAuthoritySource(o.root,facts,o.b);
            const next={...s,backend:'v2',target:receipt.destination,epoch:s.epoch+1};need(Number.isSafeInteger(next.epoch),'RESOURCE_LIMIT');
            await o.fault('before-select-v2');await writeControl(path.join(o.root,AUTHORITY_FILE),next,o.b,()=>{},true);await o.fault('after-select-v2');return next;
        }));
    });
}

export const syntheticAuthorityCommands=sqliteConsumerCommands;
export async function runSyntheticAuthorityCommand(input){const o=request(input,['command','options','sink']);need(syntheticAuthorityCommands.includes(o.command),'UNSUPPORTED_OPTION');
    const options=data(o.options??{},['replayId','fingerprint','taskId','fingerprints','scoreFingerprints','reportMode','sourceRoot','sourceFile','selection','expectedBuildId','cache','limits','signal']);
    // Snapshot JSON data (including arrays) before waiting on the outer lock;
    // existing consumers validate their own exact operation-specific contract.
    const {signal,...plain}=options;const copied=copyOptions(plain);if(signal!==undefined)copied.signal=signal;
    return selected(o,async current=>{const s=current.value;
        if(s.backend==='sqlite'){
            if(o.command==='other')need(typeof o.sink==='function','INVALID_ARGUMENT');
            return runSqliteConsumer(s.target,o.command,copied,o.sink);
        }
        return(await import('./replay-authority-v2.js')).runRestoredV2Command({root:s.target,command:o.command,options:copied,b:o.b,sink:o.sink});
    });
}

// One CLI for every authority consumer. JSON options remain bounded controls.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const [action,root,arg]=process.argv.slice(2);
    const invoke=async()=>{
        need(process.argv.length>3&&process.argv.length<=5,'INVALID_ARGUMENT');
        const o={synthetic:true,root};
        if(action==='select-sqlite'){need(arg===undefined,'INVALID_ARGUMENT');return selectSyntheticSqliteAuthority(o);}
        if(action==='prepare-rollback')return prepareSyntheticRollback({...o,destination:arg});
        if(action==='select-v2'){need(arg===undefined,'INVALID_ARGUMENT');return selectSyntheticV2Authority(o);}
        if(arg)need(path.dirname(path.resolve(arg))===root,'UNSAFE_PATH');
        const options=arg?authorityControl(path.resolve(arg)).value:{};
        if(action==='watch'){
            need(options&&typeof options==='object'&&!Array.isArray(options)&&!Object.hasOwn(options,'signal'),'INVALID_ARGUMENT');
            const controller=new AbortController(),stop=()=>controller.abort();process.on('SIGINT',stop);process.on('SIGTERM',stop);
            try{return await runSyntheticAuthorityCommand({...o,command:action,options:{...options,signal:controller.signal}});}
            finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
        }
        return runSyntheticAuthorityCommand({...o,command:action,options,...(action==='other'?{sink:chunk=>new Promise((resolve,reject)=>process.stdout.write(chunk,e=>e?reject(e):resolve()))}:{})});
    };
    invoke().then(result=>{if(action!=='other')process.stdout.write(JSON.stringify(result)+'\n');if(action==='watch'&&result?.stopReason==='cancelled')process.exitCode=130;}).catch(error=>{console.error(JSON.stringify({code:error.code,message:error.message,cleanupFailures:error.cleanupFailures}));process.exitCode=1;});
}

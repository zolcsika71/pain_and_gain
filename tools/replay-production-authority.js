// Ordinary commands select the ADR descriptor; v2 remains the unselected default.
import path from 'node:path';
import process from 'node:process';
import {productionSelection,productionLease,assertProductionWrite} from './replay-production-scope.js';
import {withProductionLock,inspectFixtureAuthorityCapabilities,runtimeCapabilities} from './replay-store.js';
import {rehearsalCommandOptions} from './replay-rehearsal-operations.js';
import {sqliteConsumerCommands,runSqliteConsumer} from './replay-sqlite-consumers.js';
import {fail} from './replay-store-payloads.js';
import {readControl,recoveryBudget} from './replay-sqlite-recovery-data.js';
const reads=new Set(['analyze','index','screen','maps','other','score-verify']);
export const selectedProduction=projectRoot=>productionSelection(projectRoot)!==null;
export const readProductionSelection=file=>readControl(file,recoveryBudget({controlBytes:65536})).value;
export async function runProductionCommand(input){
    if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input)))fail('INVALID_ARGUMENT','Plain production command required');
    const data={};for(const key of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,key);if(!['projectRoot','command','options','sink'].includes(key)||!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Unsupported/accessor production option');Object.defineProperty(data,key,{value:d.value,enumerable:true});}
    const {projectRoot,command,options={},sink}=data;
    if(!sqliteConsumerCommands.includes(command))fail('UNSUPPORTED_OPTION','Unsupported production command');
    const signal=Object.getOwnPropertyDescriptor(options,'signal');
    if(signal&&!Object.hasOwn(signal,'value'))fail('INVALID_ARGUMENT','Accessor signal unsupported');
    const descriptors=Object.getOwnPropertyDescriptors(options);delete descriptors.signal;
    const plain=Object.defineProperties({},descriptors),copy=rehearsalCommandOptions(plain);
    if(signal){Reflect.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal.value);copy.signal=signal.value;}
    runtimeCapabilities();
    try{return await withProductionLock(projectRoot,async()=>{
        const selected=productionSelection(projectRoot);if(!selected)fail('AUTHORITY_REQUIRED','No selected production SQLite descriptor');
        (await import('./replay-store-migrate.js')).verifyProductionRelease(selected.proof,recoveryBudget());
        return productionLease(selected,async()=>{
            if(!reads.has(command)||copy.cache===true)assertProductionWrite(selected.root);
            await inspectFixtureAuthorityCapabilities(selected.root);
            return runSqliteConsumer(selected.root,command,copy,sink);
        });
    });}catch(e){if(e instanceof Error)e.productionAuthority=true;throw e;}
}
export async function productionLogCli(projectRoot,command,args,stream=process.stdout){
    let options={},sink;
    if(['claim','examined','done','complete','score-claim','score-examined','score-done'].includes(command)){
        if(args.length!==3)fail('INVALID_ARGUMENT','Exact review selection required');
        options={replayId:args[0],fingerprint:args[1],taskId:args[2]};
    }else if(['other','reconcile','score-cleanup','score-verify'].includes(command)){
        if(args.length!==2)fail('INVALID_ARGUMENT','Exact record selection required');options={replayId:args[0],fingerprint:args[1]};
        if(command==='other')sink=chunk=>new Promise((resolve,reject)=>stream.write(chunk,e=>e?reject(e):resolve()));
    }else if(['import','score-import'].includes(command)){
        if(args.length!==1)fail('INVALID_ARGUMENT','Exact cache file required');const file=path.resolve(args[0]);options={sourceRoot:path.dirname(file),sourceFile:path.basename(file)};
    }else if(['scan','watch'].includes(command)){
        if(args.length!==1)fail('INVALID_ARGUMENT','Explicit approved cache root required');options={sourceRoot:path.resolve(args[0])};
    }else if(command==='register-local'){
        if(args.length!==2)fail('INVALID_ARGUMENT','Exact local selection required');options={replayId:args[0],sourceFile:args[1]};
    }else if(args.length)fail('INVALID_ARGUMENT','Unexpected production command arguments');
    const controller=new AbortController(),stop=()=>controller.abort();
    if(command==='watch'){options.signal=controller.signal;process.on('SIGINT',stop);process.on('SIGTERM',stop);}
    try{const result=await runProductionCommand({projectRoot,command,options,sink});if(command!=='other')stream.write(JSON.stringify(result)+'\n');return result;}
    finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
}

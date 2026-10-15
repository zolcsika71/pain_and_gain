// Production access is descriptor-selected, never a fixture/rehearsal marker.
import fs from 'node:fs';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {authorityControl} from './replay-authority-guard.js';
import {resident} from './retrieval-files.js';

export const PRODUCTION_STATE='.production-state.json';
export const PRODUCTION_PROOF='.production-proof.json';
const leases=new AsyncLocalStorage();
// Residency/owner-token cleanup needs the lease's root even after publication
// fences ordinary access. This predicate grants no store/data access.
export const hasProductionLease=root=>leases.getStore()?.active===true&&leases.getStore().root===root;
const need=(ok,code='AUTHORITY_CONFLICT')=>{if(!ok){const error=Object.assign(new Error('Production authority contract failed'),{code,productionAuthority:true});throw error;}};
// Corpus traversal only: selected cache/decoded/payload and execution limits do
// not change. The proof hash in the descriptor commits this explicit opt-in.
const IMPORT_BUDGET=Object.freeze({logs:320,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128});
export function validateProductionImportBudget(value){
    if(value===undefined)return null;
    need(value&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'INVALID_ARGUMENT');
    const copy={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);need((key==='profile'||Object.hasOwn(IMPORT_BUDGET,key))&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');copy[key]=d.value;}
    need(copy.profile==='converted-corpus-v1'&&Object.keys(copy).length===Object.keys(IMPORT_BUDGET).length+1,'UNSUPPORTED_CAPABILITY');
    for(const [key,max]of Object.entries(IMPORT_BUDGET))need(Number.isSafeInteger(copy[key])&&copy[key]>0&&copy[key]<=max,'RESOURCE_LIMIT');
    return Object.freeze(copy);
}
export const productionImportBudget=root=>validateProductionImportBudget(productionAccess(root)?.proof.importBudget);
const CACHE_CAPACITY=Object.freeze({wrappers:8192,diagnostics:4194304,files:2048,entries:4096,directoryIterations:1048576,cycleBytes:67108864,discoveryBytes:536870912,attemptBytes:268435456,attempts:4096,reportBytes:2097152});
export function validateProductionCacheCapacity(value){
    if(value===undefined)return null;
    need(value&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'INVALID_ARGUMENT');
    const copy={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);need((key==='profile'||Object.hasOwn(CACHE_CAPACITY,key))&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');copy[key]=d.value;}
    need(copy.profile==='replay-cache-v1'&&Object.keys(copy).length===Object.keys(CACHE_CAPACITY).length+1,'UNSUPPORTED_CAPABILITY');
    for(const[key,max]of Object.entries(CACHE_CAPACITY))need(Number.isSafeInteger(copy[key])&&copy[key]>0&&copy[key]<=max,'RESOURCE_LIMIT');
    return Object.freeze(copy);
}
export const productionCacheCapacity=root=>validateProductionCacheCapacity(productionAccess(root)?.proof.cacheCapacity);
export function canonicalDirectory(root){
    need(typeof root==='string'&&path.isAbsolute(root)&&path.resolve(root)===root,'UNSAFE_PATH');
    // Check every named component, not just realpath's final result.
    let part=path.parse(root).root;
    for(const name of root.slice(part.length).split('/').filter(Boolean)){part=path.join(part,name);resident(part,true);need(fs.realpathSync(part)===part,'UNSAFE_PATH');}
    return root;
}
export const productionDataRoot=project=>path.join(canonicalDirectory(project),'replay_logs');
export function present(file){try{fs.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export function productionSelection(project){
    const root=productionDataRoot(project),file=path.join(root,'manifest.json'),stateFile=path.join(root,PRODUCTION_STATE);
    if(!present(file)){need(!present(stateFile),'RECOVERY_REQUIRED');return null;}
    const st=resident(file);need(st.nlink===1&&fs.realpathSync(file)===file,'UNSAFE_PATH');
    // Ordinary large v2 input is left to its unchanged legacy reader. A sticky
    // transition fence always requires the bounded v3 descriptor, even if damaged.
    if(st.size>16384){need(!present(stateFile),'RECOVERY_REQUIRED');return null;}
    const descriptor=authorityControl(file),d=descriptor.value;
    if(d?.version!==3){need(!present(stateFile),'RECOVERY_REQUIRED');return null;}
    need(present(stateFile),'AUTHORITY_REQUIRED');const state=authorityControl(stateFile),s=state.value,p=d.production;
    need(d.storage==='sqlite-sidecars'&&d.schemaVersion===1&&d.payloadVersion===1&&typeof d.storeId==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(d.storeId)&&d.database===`store-v3/${d.storeId}/index.sqlite`,'UNSUPPORTED_STORE');
    need(p&&Object.keys(p).sort().join()===['epoch','mode','projectRoot','proofHash','releaseHash','schemaHash','scope'].sort().join()&&p.scope==='production-authority-v1'&&p.projectRoot===project&&['read-only','read-write'].includes(p.mode)&&Number.isSafeInteger(p.epoch)&&p.epoch>=0);
    for(const key of ['proofHash','releaseHash','schemaHash'])need(typeof p[key]==='string'&&/^[a-f0-9]{64}$/.test(p[key]));
    need(!Object.hasOwn(d,'rehearsal')&&!Object.hasOwn(d,'catalogVersion'),'UNSUPPORTED_STORE');
    need(s.phase==='active','RECOVERY_REQUIRED');need(s.projectRoot===project&&s.storeId===d.storeId&&s.descriptorHash===descriptor.hash&&s.proofHash===p.proofHash&&s.releaseHash===p.releaseHash);
    const proof=authorityControl(path.join(root,PRODUCTION_PROOF));need(proof.hash===p.proofHash);validateProductionImportBudget(proof.value.importBudget);validateProductionCacheCapacity(proof.value.cacheCapacity);
    return{projectRoot:project,root,descriptor:d,descriptorHash:descriptor.hash,stateHash:state.hash,proof:proof.value};
}
export function productionAccess(root){
    const lease=leases.getStore();if(!lease?.active||lease.root!==root)return null;
    const current=productionSelection(lease.projectRoot);need(current&&current.descriptorHash===lease.descriptorHash&&current.stateHash===lease.stateHash,'CHANGED_AUTHORITY');
    return{...lease,...current};
}
export async function productionLease(selection,callback){
    need(!leases.getStore()?.active,'AUTHORITY_CONFLICT');
    const current=productionSelection(selection.projectRoot);need(current&&current.descriptorHash===selection.descriptorHash&&current.stateHash===selection.stateHash,'CHANGED_AUTHORITY');
    const lease={...current,active:true};try{return await leases.run(lease,callback);}finally{lease.active=false;}
}
export function consumerMode(root){return productionAccess(root)?{production:true}:{synthetic:true};}
export function assertConsumerMode(o){
    if(o.production===true){need(!Object.hasOwn(o,'synthetic')&&productionAccess(o.root),'AUTHORITY_REQUIRED');return;}
    need(o.synthetic===true&&!Object.hasOwn(o,'production'),'UNSUPPORTED_OPTION');
    need(!productionAccess(o.root),'AUTHORITY_CONFLICT');
}
export function assertLegacyAuthority(project){
    need(!productionSelection(project),'AUTHORITY_REQUIRED');
}
export function assertProductionWrite(root){const p=productionAccess(root);if(p)need(p.descriptor.production.mode==='read-write','WRITE_FENCED');}
export const dispatchProduction=(projectRoot,command,options={},sink)=>import('./replay-production-authority.js').then(m=>m.runProductionCommand({projectRoot,command,options,sink}));
export function assertProductionFiles(root){
    const p=productionAccess(root);if(!p)return false;
    canonicalDirectory(root);const file=path.join(root,p.descriptor.database);
    canonicalDirectory(path.dirname(file));
    for(const f of [file,...['-journal','-wal','-shm'].map(s=>file+s)])if(present(f)){const s=resident(f);need(s.nlink===1&&fs.realpathSync(f)===f,'UNSAFE_PATH');}else need(f!==file,'UNAVAILABLE');
    return true;
}
export function productionCacheRoot(root,sourceRoot){
    const p=productionAccess(root);need(p,'AUTHORITY_REQUIRED');assertProductionWrite(root);
    canonicalDirectory(sourceRoot);need(Array.isArray(p.proof.cacheRoots)&&p.proof.cacheRoots.includes(sourceRoot),'UNSAFE_PATH');
    need(sourceRoot!==root&&!sourceRoot.startsWith(root+path.sep)&&!root.startsWith(sourceRoot+path.sep),'UNSAFE_PATH');
    return p.descriptor.production.proofHash;
}

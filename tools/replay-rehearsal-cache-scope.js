// Exact original-cache inventory capability; never a production or fixture lease.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {rehearsalDestination,rehearsalLineage,rehearsalOptions} from './replay-rehearsal-scope.js';
import {canonicalDirectory,validateProductionImportBudget,validateProductionCacheCapacity} from './replay-production-scope.js';
import {readControl,recoveryBudget,need} from './replay-sqlite-recovery-data.js';
import {resident,withCleanup} from './retrieval-files.js';

const tokens=new WeakMap(),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const contains=(a,b)=>a===b||b.startsWith(a+path.sep);
const releaseRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
function exact(o,keys){need(o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),'INVALID_ARGUMENT');}
function load(input){
    const [major,minor]=process.versions.node.split('.').map(Number);need(process.platform==='darwin'&&major===24&&minor>=19,'UNSUPPORTED_RUNTIME');
    const o=rehearsalOptions(input,['capability','capabilitySha256']);need(hex(o.capabilitySha256),'INVALID_ARGUMENT');
    canonicalDirectory(path.dirname(o.capability));
    const budget=recoveryBudget({controlBytes:1048576,ioBytes:16777216,deadlineMs:60000});
    const control=readControl(o.capability,budget);need(control.hash===o.capabilitySha256,'CHANGED_BINDING');const c=control.value;
    exact(c,['version','scope','productionAuthority','releaseHash','destination','snapshot','operations','importBudget','cacheCapacity','files']);
    need(c.version===1&&c.scope==='rehearsal-cache-inventory-v1'&&c.productionAuthority===false&&hex(c.releaseHash),'UNSUPPORTED_CAPABILITY');
    const release=readControl(path.join(releaseRoot,'release.json'),budget);need(release.hash===c.releaseHash&&release.value.productionAuthority===false&&release.value.rehearsalCapabilities?.includes('inventory-bound-rehearsal-cache-v1'),'UNSUPPORTED_CAPABILITY');
    // A copied declaration cannot grant this capability to mutable worktree code.
    const self=release.value.files.find(f=>f.path==='tools/replay-rehearsal-cache-scope.js');
    need(self&&readControlBytes(fileURLToPath(import.meta.url),1048576).hash===self.sha256,'CHANGED_RELEASE');
    need(typeof c.destination==='string'&&path.isAbsolute(c.destination)&&path.resolve(c.destination)===c.destination,'UNSAFE_PATH');
    need(!contains(c.destination,o.capability),'UNSAFE_PATH');
    const parent=canonicalDirectory(path.dirname(c.destination)),tmp=fs.realpathSync(os.tmpdir());
    need(parent===tmp&&path.basename(c.destination).startsWith('pain-gain-backup-rehearsal-')||parent===path.join(os.homedir(),'.local/share/pain-and-gain-evidence')&&path.basename(c.destination).startsWith('replay-backup-rehearsal-'),'UNSAFE_PATH');
    exact(c.snapshot,['inventorySha256','receiptSha256']);need(Object.values(c.snapshot).every(hex),'INVALID_ARGUMENT');
    need(Array.isArray(c.operations)&&c.operations.length>0&&c.operations.length<=4&&new Set(c.operations).size===c.operations.length&&c.operations.every(v=>['classify','import','score-import','scan'].includes(v)),'UNSUPPORTED_OPTION');
    const importBudget=validateProductionImportBudget(c.importBudget),capacity=validateProductionCacheCapacity(c.cacheCapacity);need(importBudget&&capacity,'UNSUPPORTED_CAPABILITY');
    need(Array.isArray(c.files)&&c.files.length>0&&c.files.length<=capacity.files,'RESOURCE_LIMIT');const files=new Map();let bytes=0;
    for(const f of c.files){exact(f,['path','bytes','sha256','operations']);need(typeof f.path==='string'&&path.isAbsolute(f.path)&&path.resolve(f.path)===f.path&&f.path.length<=4096&&/^[A-Za-z0-9._-]{1,120}$/.test(path.basename(f.path))&&!contains(c.destination,f.path)&&!contains(path.dirname(f.path),c.destination),'UNSAFE_PATH');
        need(!files.has(f.path)&&hex(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=1048576,'INVALID_INVENTORY');bytes+=f.bytes;need(Number.isSafeInteger(bytes)&&bytes<=capacity.cycleBytes,'RESOURCE_LIMIT');
        need(Array.isArray(f.operations)&&f.operations.length>0&&new Set(f.operations).size===f.operations.length&&f.operations.every(v=>c.operations.includes(v))&&!(f.operations.includes('score-import')&&(f.operations.includes('import')||f.operations.includes('scan'))),'INVALID_INVENTORY');
        files.set(f.path,Object.freeze({...f,operations:Object.freeze([...f.operations])}));
    }
    return{request:Object.freeze({...o}),control:c,files,importBudget,capacity};
}
// One selected transport is bounded at 1 MiB, in 64 KiB reads, before parsing.
function readControlBytes(file,max){const before=resident(file);need(before.nlink===1&&before.size<=max&&fs.realpathSync(file)===file,'UNSAFE_PATH');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
    try{const s=fs.fstatSync(fd);need(s.dev===before.dev&&s.ino===before.ino&&s.size===before.size,'CHANGED_INPUT');const bytes=Buffer.alloc(s.size);let offset=0;
        while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,Math.min(65536,bytes.length-offset),offset);need(n>0,'CHANGED_INPUT');offset+=n;}
        for(const after of [fs.fstatSync(fd),fs.lstatSync(file)])need(['dev','ino','size','mtimeMs','ctimeMs'].every(k=>after[k]===before[k]),'CHANGED_INPUT');return{bytes,hash:hash(bytes)};
    }catch(e){primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Cache read and close failed',{cause:primary});else throw e;}}
}
export function authorizeRehearsalCache(scope,input,operation){
    const data=load(input),c=data.control;need(c.operations.includes(operation),'UNSUPPORTED_OPTION');
    if(operation!=='classify'){
        const root=rehearsalDestination(scope),lineage=rehearsalLineage(scope);need(root===c.destination&&lineage.binding.inventorySha256===c.snapshot.inventorySha256&&lineage.binding.receiptSha256===c.snapshot.receiptSha256,'CHANGED_BINDING');
        for(const f of data.files.values())need(!contains(lineage.binding.sourceRoot,f.path),'UNSAFE_PATH');
    }
    const token=Object.freeze({});tokens.set(token,{...data,scope,operation});return token;
}
export function rehearsalCacheDetails(token){const d=tokens.get(token);need(d,'INVALID_REHEARSAL_SCOPE');return{scope:d.scope,root:d.control.destination,importBudget:d.importBudget,capacity:d.capacity,operation:d.operation};}
export function rehearsalCacheFiles(token){const d=tokens.get(token);need(d,'INVALID_REHEARSAL_SCOPE');return [...d.files.values()].filter(f=>f.operations.includes(d.operation)).map(f=>({...f})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);}
export function readRehearsalCache(token,file,collection){
    const d=tokens.get(token);need(d,'INVALID_REHEARSAL_SCOPE');
    if(d.operation!=='classify')need(rehearsalDestination(d.scope)===d.control.destination,'CHANGED_BINDING');
    const control=readControl(d.request.capability,recoveryBudget({controlBytes:1048576,ioBytes:4194304,deadlineMs:60000}));need(control.hash===d.request.capabilitySha256,'CHANGED_BINDING');
    const row=d.files.get(file);need(row&&row.operations.includes(d.operation),'UNLISTED_SOURCE');
    if(collection!==undefined)need(collection===(d.operation==='score-import'?'score':'log'),'UNSUPPORTED_OPTION');
    canonicalDirectory(path.dirname(file));const got=readControlBytes(file,1048576);need(got.bytes.length===row.bytes&&got.hash===row.sha256,'CHANGED_INPUT');
    return{file,bytes:got.bytes,identity:{sourceRoot:path.dirname(file),sourceFile:path.basename(file),sourceScopeHash:d.request.capabilitySha256,cacheHash:got.hash}};
}

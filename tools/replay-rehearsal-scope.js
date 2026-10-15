// Explicit unpublished backup rehearsal capability. Never a production authority.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resident,withCleanup,RetrievalError} from './retrieval-files.js';
import {fail,digestChunks} from './replay-store-payloads.js';

const scopes=new WeakMap(),MiB=1048576,hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const need=(ok,code='INVALID_REHEARSAL')=>{if(!ok)fail(code,'Backup rehearsal contract rejected');};
const sha=b=>createHash('sha256').update(b).digest('hex');
export const REHEARSAL_MARKER='.storage-v3-rehearsal';
export const REHEARSAL_LINEAGE='.rehearsal-lineage.json';
export function rehearsalOptions(value,keys){
 need(value&&Object.getPrototypeOf(value)===Object.prototype);
 const out={};for(const k of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,k);need(keys.includes(k)&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;
}
function canonical(p,dir=true){need(typeof p==='string'&&path.isAbsolute(p)&&path.resolve(p)===p,'UNSAFE_PATH');resident(p,dir);need(fs.realpathSync(p)===p,'UNSAFE_PATH');if(!dir)need(fs.lstatSync(p).nlink===1,'UNSAFE_PATH');return p;}
const contains=(a,b)=>a===b||b.startsWith(a+path.sep);
function allowed(source,root){
 const tmp=fs.realpathSync(os.tmpdir()),evidence=path.join(os.homedir(),'.local/share/pain-and-gain-evidence');
 need(typeof source==='string'&&typeof root==='string'&&path.basename(source)==='backup','UNSAFE_PATH');
 const parent=path.dirname(source),synthetic=path.dirname(parent)===tmp&&path.basename(parent).startsWith('pain-gain-backup-input-');
 need(synthetic||path.dirname(parent)===evidence&&path.basename(parent).startsWith('scoped-v2-backup-'),'UNSAFE_PATH');
 need(path.dirname(root)===tmp&&path.basename(root).startsWith('pain-gain-backup-rehearsal-')||path.dirname(root)===evidence&&path.basename(root).startsWith('replay-backup-rehearsal-'),'UNSAFE_PATH');
 need(!contains(source,root)&&!contains(root,source),'UNSAFE_PATH');canonical(source);canonical(root);return synthetic;
}
function* chunks(p,check){const s=resident(p);need(s.nlink===1,'UNSAFE_PATH');const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let error;
 try{const opened=fs.fstatSync(fd);need(opened.dev===s.dev&&opened.ino===s.ino,'CHANGED_INPUT');let offset=0;
  while(offset<s.size){check();const b=Buffer.alloc(Math.min(65536,s.size-offset)),n=fs.readSync(fd,b,0,b.length,offset);need(n===b.length,'CHANGED_INPUT');offset+=n;yield b;}
  const end=fs.fstatSync(fd);need(end.size===s.size&&end.mtimeMs===s.mtimeMs,'CHANGED_INPUT');
 }catch(e){error=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(error)withCleanup(error,e);else throw e;}}
}
function bytes(p,cap){canonical(p,false);need(fs.statSync(p).size<=cap,'RESOURCE_LIMIT');return Buffer.concat([...chunks(p,()=>{})]);}
function exactKeys(o,keys){need(o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)));}
function entries(p,limit){const dir=fs.opendirSync(p),names=[];let error;try{let e;while((e=dir.readSync())){need(names.length<limit,'RESOURCE_LIMIT');names.push(e.name);}return names;}
 catch(e){error=e;throw e;}finally{try{dir.closeSync();}catch(e){if(error)withCleanup(error,e);else throw e;}}}
function canonicalControls(files){
 // Same macOS metadata mechanism as resident(), freshly invoked at every
 // boundary. Batch only the at-most-seven allowlisted regular package controls;
 // no content open, stored result, or relaxation of destination access checks.
 need(files.length<=7,'RESOURCE_LIMIT');if(!files.length)return;
 for(const p of files){need(path.isAbsolute(p)&&path.resolve(p)===p,'UNSAFE_PATH');
  const st=fs.lstatSync(p);if(st.isSymbolicLink()||!st.isFile())throw new RetrievalError('unsafe-path');}
 const output=execFileSync('/usr/bin/stat',['-f','%Sf',...files],{encoding:'utf8',maxBuffer:4096});
 const flags=output.split('\n');need(flags.pop()===''&&flags.length===files.length&&flags.every(v=>/^(?:-|[a-z]+(?:,[a-z]+)*)$/.test(v)),'UNVERIFIABLE_RESIDENCY');
 if(flags.some(v=>v.includes('dataless')))throw new RetrievalError('dataless-input');
 for(const p of files){need(fs.realpathSync(p)===p,'UNSAFE_PATH');need(fs.lstatSync(p).nlink===1,'UNSAFE_PATH');}
}
function sourceDataRoot(source,layout){
 if(layout==='flat-v1')return source;
 need(layout==='scoped-managed-v2-v1');
 const parent=canonical(path.join(source,'data')),dataRoot=canonical(path.join(parent,'replay_logs'));
 need(JSON.stringify(entries(parent,1))===JSON.stringify(['replay_logs']),'SOURCE_CONFLICT');
 // Package controls are preserved, not converted or treated as data records.
 const controls=new Set(['inventory.json','COMPLETE.json','scope.json','source-consistency.json','RESTORE.md','restore.mjs','io.mjs']);
 const files=[];for(const name of entries(source,8)){if(name==='data')continue;need(controls.has(name),'SOURCE_CONFLICT');files.push(path.join(source,name));}
 canonicalControls(files);
 return dataRoot;
}
export function authorizeBackupRehearsal(input){
 const [major,minor]=process.versions.node.split('.').map(Number);need(process.platform==='darwin'&&major===24&&minor>=19,'UNSUPPORTED_RUNTIME');
 const o=rehearsalOptions(input,['sourceRoot','root','inventory','inventorySha256','receipt','receiptSha256','acknowledge','layout','deadlineMs']);
 const deadlineMs=o.deadlineMs===undefined?600000:o.deadlineMs;
 need(Number.isSafeInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=1800000,'RESOURCE_LIMIT');
 const layout=o.layout===undefined?'flat-v1':o.layout;need(['flat-v1','scoped-managed-v2-v1'].includes(layout));const nested=layout==='scoped-managed-v2-v1';
 need(o.acknowledge==='backup-rehearsal-only'&&hex(o.inventorySha256)&&hex(o.receiptSha256));
 const synthetic=allowed(o.sourceRoot,o.root);
 const dataRoot=sourceDataRoot(o.sourceRoot,layout);
 for(const [role,p] of [['inventory',o.inventory],['receipt',o.receipt]]){
  const valid=nested&&role==='inventory'?p===path.join(o.sourceRoot,'inventory.json'):typeof p==='string'&&path.dirname(p)===path.dirname(o.sourceRoot)&&!contains(o.sourceRoot,p);
  need(valid&&!contains(o.root,p),'UNSAFE_PATH');canonical(p,false);
 }
 const ib=bytes(o.inventory,MiB),rb=bytes(o.receipt,16384);need(sha(ib)===o.inventorySha256&&sha(rb)===o.receiptSha256,'SOURCE_CONFLICT');
 const inventory=JSON.parse(ib),receipt=JSON.parse(rb);
 exactKeys(inventory,nested?['format','sourceRoot','totalBytes','files']:['schema','files']);
 need((nested?inventory.format==='scoped-managed-v2-backup-v1'&&typeof inventory.sourceRoot==='string'&&path.isAbsolute(inventory.sourceRoot):inventory.schema==='replay-backup-inventory-v1')&&Array.isArray(inventory.files)&&inventory.files.length>0&&inventory.files.length<=513);
 exactKeys(receipt,['schema','sourceRoot','inventorySha256','files','bytes','complete','verified','origin',...(nested?['layout','dataRoot']:[])]);
 need(receipt.schema===(nested?'replay-backup-binding-v2':'replay-backup-binding-v1')&&(!nested||receipt.layout===layout&&receipt.dataRoot===dataRoot)&&receipt.sourceRoot===o.sourceRoot&&receipt.inventorySha256===o.inventorySha256&&receipt.complete===true&&receipt.verified===true&&receipt.origin===(synthetic?'synthetic-backup':'verified-backup'),'SOURCE_CONFLICT');
 let total=0;const names=new Set(),files=[];
 for(const row of inventory.files){
  if(!nested)exactKeys(row,['path','bytes','sha256']);
  need(row&&typeof row==='object');const originalPath=nested?row.relativePath:row.path;
  need(typeof originalPath==='string'&&(nested?/^replay_logs\/[A-Za-z0-9][A-Za-z0-9._-]*$/:/^[A-Za-z0-9][A-Za-z0-9._-]*$/).test(originalPath),'UNSAFE_PATH');
  const name=nested?originalPath.slice('replay_logs/'.length):originalPath;
  need(!names.has(name)&&hex(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0);
  need(row.bytes<=(name==='manifest.json'?600*MiB:8*MiB),'RESOURCE_LIMIT');names.add(name);total+=row.bytes;need(Number.isSafeInteger(total)&&total<=920*MiB,'RESOURCE_LIMIT');
  files.push(Object.freeze({path:name,originalPath,bytes:row.bytes,sha256:row.sha256}));
 }
 if(nested)need(inventory.totalBytes===total,'SOURCE_CONFLICT');
 need(names.has('manifest.json')&&receipt.files===names.size&&receipt.bytes===total,'SOURCE_CONFLICT');
 const originals=total-files.find(x=>x.path==='manifest.json').bytes;need(originals<=320*MiB,'RESOURCE_LIMIT');
 const binding=Object.freeze({scope:'backup-rehearsal-v1',sourceRoot:o.sourceRoot,inventorySha256:o.inventorySha256,receiptSha256:o.receiptSha256,origin:receipt.origin,productionAuthority:false,...(nested?{layout,dataRoot}:{})});
 const start=performance.now(),check=()=>{const m=process.memoryUsage();need(performance.now()-start<deadlineMs&&m.heapUsed<=256*MiB&&m.rss<=512*MiB,'RESOURCE_LIMIT');};
 const token=Object.freeze({}),info={...o,deadlineMs,layout,dataRoot,binding,files:Object.freeze(files),stamps:new Map(),check};scopes.set(token,info);
 verifyRehearsalSource(token);return token;
}
export function rehearsalDetails(token){const s=scopes.get(token);need(s,'INVALID_REHEARSAL_SCOPE');return Object.freeze({sourceRoot:s.sourceRoot,dataRoot:s.dataRoot,root:s.root,receipt:s.receipt,binding:s.binding,deadlineMs:s.deadlineMs,lineage:s.lineage});}
export function checkRehearsal(token){const s=scopes.get(token);need(s,'INVALID_REHEARSAL_SCOPE');s.check();}
export function rehearsalDestination(token){checkRehearsal(token);const s=scopes.get(token);
 if(s.lineage){rehearsalOperationRoot(s.root,s.binding.origin,'store');need(sha(bytes(path.join(s.root,REHEARSAL_LINEAGE),16384))===s.lineageHash,'CHANGED_BINDING');}
 else{allowed(s.sourceRoot,s.root);need(sourceDataRoot(s.sourceRoot,s.layout)===s.dataRoot,'SOURCE_CONFLICT');}return s.root;}
export function rehearsalDestinationEntries(token){return entries(rehearsalDestination(token),4096);}
// Metadata only, before any destination content/SQLite open. No unbounded readdir.
export function verifyRehearsalDestination(token){
 const root=rehearsalDestination(token);let count=0;
 const walk=(p,depth)=>{checkRehearsal(token);need(depth<=8,'RESOURCE_LIMIT');resident(p,true);
  const dir=fs.opendirSync(p);let error;
  try{let e;while((e=dir.readSync())){checkRehearsal(token);need(++count<=4096,'RESOURCE_LIMIT');
   const child=path.join(p,e.name);if(e.isDirectory())walk(child,depth+1);else{const st=resident(child);const lock=p===root&&/^\.(?:manifest|authority)\.lock(?:\.[a-f0-9-]{36}\.tmp)?$/.test(e.name);need(st.nlink===1||lock&&st.nlink===2,'UNSAFE_PATH');}}}
  catch(e){error=e;throw e;}finally{try{dir.closeSync();}catch(e){if(error)withCleanup(error,e);else throw e;}}
 };walk(root,0);return root;
}
export function verifyRehearsalSource(token){
 need(!scopes.get(token)?.lineage,'INVALID_REHEARSAL_SCOPE');
 rehearsalDestination(token);const s=scopes.get(token);need(sha(bytes(s.inventory,MiB))===s.inventorySha256&&sha(bytes(s.receipt,16384))===s.receiptSha256,'SOURCE_CONFLICT');
 const names=entries(s.dataRoot,513);need(names.length===s.files.length&&s.files.every(r=>names.includes(r.path)),'SOURCE_CONFLICT');
 for(const r of s.files){const p=path.join(s.dataRoot,r.path);canonical(p,false);const st=fs.statSync(p),stamp={dev:st.dev,ino:st.ino,size:st.size,mtimeMs:st.mtimeMs};
  if(s.stamps.has(p))need(JSON.stringify(stamp)===JSON.stringify(s.stamps.get(p)),'CHANGED_INPUT');
  const d=digestChunks(chunks(p,s.check));need(d.expectedBytes===r.bytes&&d.expectedHash===r.sha256,'SOURCE_CONFLICT');s.stamps.set(p,stamp);}
}

// Post-conversion operations carry the pinned lineage, not access to the original
// backup. A restored store can therefore operate with the original inaccessible.
export function rehearsalOperationRoot(value,origin,role){
 need(['synthetic-backup','verified-backup'].includes(origin),'CHANGED_BINDING');
 const synthetic=origin==='synthetic-backup',parent=synthetic?fs.realpathSync(os.tmpdir()):path.join(os.homedir(),'.local/share/pain-and-gain-evidence');
 const prefixes=role==='backup'?(synthetic?['pain-gain-rehearsal-recovery-backup-']:['replay-sqlite-recovery-backup-']):
  role==='restore'?(synthetic?['pain-gain-rehearsal-recovery-restored-']:['replay-sqlite-recovery-restored-']):
  (synthetic?['pain-gain-backup-rehearsal-','pain-gain-rehearsal-recovery-restored-']:['replay-backup-rehearsal-','replay-sqlite-recovery-restored-']);
 need(typeof value==='string'&&path.dirname(value)===parent&&prefixes.some(p=>path.basename(value).startsWith(p)),'UNSAFE_PATH');return canonical(value);
}
export function validateRehearsalLineage(value){
 exactKeys(value,['version','scope','productionAuthority','initialRoot','storeId','descriptorHash','conversionHash','binding']);
 need(value.version===1&&value.scope==='rehearsal-lineage-v1'&&value.productionAuthority===false&&hex(value.descriptorHash)&&hex(value.conversionHash)&&typeof value.storeId==='string'&&/^[a-f0-9-]{36}$/.test(value.storeId),'CHANGED_BINDING');
 const b=value.binding,nested=Object.hasOwn(b,'layout');exactKeys(b,['scope','sourceRoot','inventorySha256','receiptSha256','origin','productionAuthority',...(nested?['layout','dataRoot']:[])]);
 need(b.scope==='backup-rehearsal-v1'&&b.productionAuthority===false&&hex(b.inventorySha256)&&hex(b.receiptSha256)&&['synthetic-backup','verified-backup'].includes(b.origin),'CHANGED_BINDING');
 const parent=b.origin==='synthetic-backup'?fs.realpathSync(os.tmpdir()):path.join(os.homedir(),'.local/share/pain-and-gain-evidence');
 need(typeof b.sourceRoot==='string'&&path.resolve(b.sourceRoot)===b.sourceRoot&&path.basename(b.sourceRoot)==='backup'&&path.dirname(path.dirname(b.sourceRoot))===parent&&path.basename(path.dirname(b.sourceRoot)).startsWith(b.origin==='synthetic-backup'?'pain-gain-backup-input-':'scoped-v2-backup-'),'UNSAFE_PATH');
 need(typeof value.initialRoot==='string'&&path.resolve(value.initialRoot)===value.initialRoot&&path.dirname(value.initialRoot)===parent&&path.basename(value.initialRoot).startsWith(b.origin==='synthetic-backup'?'pain-gain-backup-rehearsal-':'replay-backup-rehearsal-'),'UNSAFE_PATH');
 if(nested)need(b.layout==='scoped-managed-v2-v1'&&b.dataRoot===path.join(b.sourceRoot,'data/replay_logs'),'CHANGED_BINDING');
 return value;
}
export function authorizeRehearsalLineage(input){
 const o=rehearsalOptions(input,['root','lineageHash']),raw=bytes(path.join(rehearsalOperationRoot(o.root, // determine origin only after bounded metadata validation
  path.dirname(o.root)===fs.realpathSync(os.tmpdir())?'synthetic-backup':'verified-backup','store'),REHEARSAL_LINEAGE),16384);
 need(hex(o.lineageHash)&&sha(raw)===o.lineageHash,'CHANGED_BINDING');
 const lineage=validateRehearsalLineage(JSON.parse(raw));rehearsalOperationRoot(o.root,lineage.binding.origin,'store');
 Object.freeze(lineage.binding);Object.freeze(lineage);
 const start=performance.now(),token=Object.freeze({});
 scopes.set(token,{root:o.root,sourceRoot:lineage.binding.sourceRoot,dataRoot:lineage.binding.dataRoot??lineage.binding.sourceRoot,binding:lineage.binding,lineage,lineageHash:o.lineageHash,check(){const m=process.memoryUsage();need(performance.now()-start<=1800000&&m.heapUsed<=256*MiB&&m.rss<=512*MiB,'RESOURCE_LIMIT');}});
 return token;
}
export function rehearsalLineage(token){checkRehearsal(token);const s=scopes.get(token);need(s.lineage,'INVALID_REHEARSAL_SCOPE');return s.lineage;}

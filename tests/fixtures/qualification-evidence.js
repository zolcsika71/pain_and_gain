// Test-only, explicit evidence retention. Never patches filesystem/child APIs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn as nativeSpawn,spawnSync as nativeSpawnSync,fork as nativeFork,execFileSync} from 'node:child_process';

// Keep evidence I/O outside operation instrumentation and injected cleanup faults.
const io=Object.fromEntries(Object.entries(fs).filter(([,v])=>typeof v==='function').map(([k,v])=>[k,v.bind(fs)]));
const failureListeners=new Set();let failureNotified=false;
export function onEvidenceFailure(listener){failureListeners.add(listener);return()=>failureListeners.delete(listener);}
// An independent watchdog acknowledges this channel before the failing producer
// continues. No disk write is needed to propagate the failure. Failure-only child
// is bounded and never used for ordinary operation/fault outcomes.
export function evidenceFailure(reason,file=''){
 let handled=false;for(const listener of failureListeners)handled=listener(String(reason),file)===true||handled;if(handled)return;
 const endpoint=process.env.PAIN_GAIN_STORAGE_FAILURE_ENDPOINT;
 if(!endpoint||failureNotified)return;failureNotified=true;
 try{notifyStorage({type:'failure',reason:String(reason).slice(0,1024)},endpoint);}catch{
  // Fail the producer too: missing close/exit evidence prevents acceptance even
  // if the independent channel failed. Do not invent a completion receipt.
  process.exitCode=1;
 }
}
export function notifyStorage(message,endpoint=process.env.PAIN_GAIN_STORAGE_FAILURE_ENDPOINT){
 if(!endpoint)return;
 execFileSync(process.execPath,['--input-type=module','-e',`import net from 'node:net';process.exitCode=1;let reply='',failed=false;const e=JSON.parse(process.argv[1]);const s=net.connect(e.port,'127.0.0.1',()=>s.write(JSON.stringify({...JSON.parse(process.argv[2]),token:e.token})+'\\n'));const fail=()=>{failed=true;process.exitCode=1;s.destroy();};s.setTimeout(1000,fail);s.on('error',fail);s.on('data',b=>{reply+=b.toString();if(!'latched\\n'.startsWith(reply))fail();});s.on('end',()=>{if(!failed&&reply==='latched\\n')process.exitCode=0;else fail();});`,endpoint,JSON.stringify(message)],{timeout:1500,killSignal:'SIGKILL',stdio:'ignore'});
}
export const durableParent='/Users/zoltanka/Library/Application Support/pain-and-gain/qualification/m2h';
const safeName=s=>{if(typeof s!=='string'||!/^[a-zA-Z0-9_.-]+$/.test(s))throw Error('Unsafe evidence name');return s;};
export function canonicalDirectory(p){
 if(!path.isAbsolute(p)||path.resolve(p)!==p)throw Error('Canonical absolute directory required');
 for(let q=p;;q=path.dirname(q)){const st=io.lstatSync(q);if(!st.isDirectory()||st.isSymbolicLink()||io.realpathSync(q)!==q)throw Error('Unsafe directory: '+q);if(q===path.dirname(q))break;}
 if(execFileSync('stat',['-f','%Sf',p],{encoding:'utf8'}).includes('dataless'))throw Error('Dataless directory');
 return p;
}
export function writeJSON(file,value){
 try{return writeJSONBytes(file,value);}catch(e){evidenceFailure('receipt write: '+e.message,file);throw e;}
}
function writeJSONBytes(file,value){
 const fd=io.openSync(file,'wx',0o600);
 const write=s=>{const b=Buffer.from(s);for(let offset=0;offset<b.length;){const n=io.writeSync(fd,b,offset,Math.min(65536,b.length-offset));if(n<=0)throw Error('zero-length receipt write');offset+=n;}};
 function emit(v){
  if(v instanceof Error)v={name:v.name,message:v.message,code:v.code,stack:v.stack};
  if(typeof v==='bigint')v=String(v);
  if(v===undefined){write('null');return;}
  if(v===null||typeof v!=='object'){write(JSON.stringify(v));return;}
  if(Buffer.isBuffer(v)){emit({type:'Buffer',base64:v.toString('base64')});return;}
  write(Array.isArray(v)?'[':'{');let first=true;
  for(const [k,item]of Object.entries(v)){if(!first)write(',');first=false;if(!Array.isArray(v)){write(JSON.stringify(k));write(':');}emit(item);}
  write(Array.isArray(v)?']':'}');
 }
 try{emit(value);write('\n');io.fsyncSync(fd);}finally{io.closeSync(fd);}
}
export function createRun(purpose='safeguard',{parent=durableParent}={}){
 canonicalDirectory(parent);safeName(purpose);
 if(parent!==durableParent){if(path.basename(parent)!=='tmp'||!purpose.endsWith('safeguard'))throw Error('Only nested safeguards permitted');validateRun(path.dirname(parent));if(path.dirname(path.dirname(parent))!==durableParent)throw Error('Nested safeguard depth exceeded');}
 const run=path.join(parent,`${purpose}-${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`);
 io.mkdirSync(run,{mode:0o700});for(const name of ['candidate','receipts','logs','inventories','tmp'])io.mkdirSync(path.join(run,name),{mode:0o700});
 writeJSON(path.join(run,'run.json'),{version:1,id:path.basename(run),purpose,uid:process.getuid(),createdAt:new Date().toISOString()});return run;
}
export function validateRun(run){
 canonicalDirectory(run);
 if(execFileSync('stat',['-f','%Sf',run],{encoding:'utf8'}).includes('dataless'))throw Error('Dataless attempt');
 const st=io.statSync(run),marker=JSON.parse(io.readFileSync(path.join(run,'run.json')));
 if(path.dirname(run)!==durableParent){const parent=path.dirname(run);if(path.basename(parent)!=='tmp'||path.dirname(path.dirname(parent))!==durableParent||!marker.purpose?.endsWith('safeguard'))throw Error('Not a qualification attempt');validateRun(path.dirname(parent));}
 if(st.uid!==process.getuid()||(st.mode&0o077)||marker.version!==1||marker.uid!==st.uid||marker.id!==path.basename(run))throw Error('Invalid attempt ownership/marker');
 for(const name of ['candidate','receipts','logs','inventories','tmp'])canonicalDirectory(path.join(run,name));
 return run;
}
export function context(env=process.env){
 if(!Object.hasOwn(env,'PAIN_GAIN_QUALIFICATION_RUN'))return null;
 const run=validateRun(env.PAIN_GAIN_QUALIFICATION_RUN);
 if(env.TMPDIR!==path.join(run,'tmp')||io.realpathSync(env.TMPDIR)!==env.TMPDIR)throw Error('Evidence TMPDIR mismatch');return run;
}
const active=context(); // Invalid activation fails at import, before fixtures.
let sequence=0;
const registered=new Set();
export const evidenceEnabled=()=>active!==null;
function recordPath(kind,label){return path.join(active,kind,`${process.pid}-${String(++sequence).padStart(6,'0')}-${safeName(label)}`);}
export function observe(label,value){if(!active)return null;const file=recordPath('inventories',label+'.json');writeJSON(file,{pid:process.pid,argv:process.argv,stage:process.env.PAIN_GAIN_QUALIFICATION_STAGE??null,label,value:typeof value==='function'?value():value});return file;}
export function registerRoot(root){
 if(!active)return root;canonicalDirectory(root);
 if(path.dirname(root)!==path.join(active,'tmp')||io.statSync(root).uid!==process.getuid())throw Error('Foreign evidence root');
 if(!registered.has(root)){observe('fixture-root',{root});registered.add(root);}return root;
}
export function evidenceTemp(prefix){
 if(active&&path.dirname(prefix)!==path.join(active,'tmp'))throw Error('Foreign fixture prefix');
 return registerRoot(io.mkdtempSync(prefix));
}
export function disposeFixture(root,options){
 if(!active)return io.rmSync(root,options);
 registerRoot(root);observe('retained-disposal',{root});
}
export function hashFile(file){
 const st=io.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())throw Error('Regular file required');
 const fd=io.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),h=createHash('sha256'),b=Buffer.alloc(65536);
 try{for(;;){const n=io.readSync(fd,b,0,b.length,null);if(!n)break;h.update(b.subarray(0,n));}}finally{io.closeSync(fd);}
 const after=io.lstatSync(file);if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>st[k]!==after[k]))throw Error('Evidence changed while hashing');return h.digest('hex');
}
export function manifest(root){
 canonicalDirectory(root);const entries=[];
 function walk(dir){for(const name of io.readdirSync(dir).sort()){
  const p=path.join(dir,name),s=io.lstatSync(p),entry={path:path.relative(root,p),originalPath:p,mode:s.mode&0o777,dev:s.dev,ino:s.ino,nlink:s.nlink,blocks:s.blocks,bytes:s.size,mtimeMs:s.mtimeMs};
  if(s.isSymbolicLink()){entry.type='symlink';entry.target=io.readlinkSync(p);}
  else if(s.isDirectory())entry.type='directory';else if(s.isFile()){entry.type='file';entry.sha256=hashFile(p);}else throw Error('Unsupported evidence type: '+p);
  entries.push(entry);if(entry.type==='directory')walk(p);
 }}walk(root);return{version:1,root,entries};
}
function member(root,relative){if(!relative||path.isAbsolute(relative)||relative.split(path.sep).some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe manifest member');return path.join(root,relative);}
export function verifyManifest(root,m,{exact=true}={}){
 canonicalDirectory(root);const links=new Map(),originals=new Map();
 for(const e of m.entries){const p=member(root,e.path);canonicalDirectory(path.dirname(p));const st=io.lstatSync(p);
  if((st.mode&0o777)!==e.mode)throw Error('Evidence mode mismatch: '+e.path);
  if(e.type==='file'){if(!st.isFile()||st.isSymbolicLink()||st.size!==e.bytes||hashFile(p)!==e.sha256)throw Error('Evidence bytes mismatch: '+e.path);const old=`${e.dev}:${e.ino}`,current=`${st.dev}:${st.ino}`;if((links.has(old)&&links.get(old)!==current)||(originals.has(current)&&originals.get(current)!==old))throw Error('Evidence hard-link mismatch');links.set(old,current);originals.set(current,old);}
  else if(e.type==='directory'){if(!st.isDirectory()||st.isSymbolicLink())throw Error('Evidence directory mismatch');}
  else if(e.type==='symlink'){if(!st.isSymbolicLink()||io.readlinkSync(p)!==e.target)throw Error('Evidence link mismatch');}
  else throw Error('Unknown manifest type');
 }
 if(exact){const actual=manifest(root).entries.map(e=>e.path),expected=m.entries.map(e=>e.path);if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Evidence file set mismatch');}
 return true;
}
// Append-only: existing destination bytes are verified, never replaced.
export function copyManifest(source,destination,m){
 canonicalDirectory(source);canonicalDirectory(destination);verifyManifest(source,m,{exact:false});
 const links=new Map();
 for(const e of m.entries){const from=member(source,e.path),to=member(destination,e.path);canonicalDirectory(path.dirname(to));
  if(io.existsSync(to)||(()=>{try{return io.lstatSync(to).isSymbolicLink();}catch{return false;}})()){
   verifyManifest(destination,{entries:[e]},{exact:false});if(e.type==='file')links.set(`${e.dev}:${e.ino}`,to);continue;
  }
  if(e.type==='directory')io.mkdirSync(to,{mode:e.mode});
  else if(e.type==='symlink')io.symlinkSync(e.target,to);
  else if(e.type==='file'){
   const identity=`${e.dev}:${e.ino}`;
   if(e.nlink>1&&links.has(identity))io.linkSync(links.get(identity),to);
   else{const input=io.openSync(from,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),output=io.openSync(to,'wx',e.mode),b=Buffer.alloc(65536);try{for(;;){const n=io.readSync(input,b,0,b.length,null);if(!n)break;for(let at=0;at<n;)at+=io.writeSync(output,b,at,n-at);}io.fchmodSync(output,e.mode);io.fsyncSync(output);}finally{io.closeSync(input);io.closeSync(output);}}
   links.set(identity,to);
  }
 }
 verifyManifest(source,m,{exact:false});verifyManifest(destination,m,{exact:false});return true;
}
export function snapshot(root,label='pre-recovery'){
 if(!active)return null;
 try{registerRoot(root);const target=recordPath('inventories',label);io.mkdirSync(target,{mode:0o700});const tree=path.join(target,'tree');io.mkdirSync(tree,{mode:0o700});const m=manifest(root);writeJSON(path.join(target,'original.json'),m);copyManifest(root,tree,m);verifyManifest(tree,m);return target;}catch(e){evidenceFailure('snapshot: '+e.message,root);throw e;}
}
export function fileState(root){
 registerRoot(root);const rows=[];
 function walk(dir){for(const name of io.readdirSync(dir).sort()){const p=path.join(dir,name),s=io.lstatSync(p);rows.push({path:path.relative(root,p),bytes:s.size,dev:s.dev,ino:s.ino,nlink:s.nlink,blocks:s.blocks,type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':'file'});if(s.isDirectory())walk(p);}}
 walk(root);return rows;
}
function captureStart(command,args,options={}){
 try{return captureStartBytes(command,args,options);}catch(e){evidenceFailure('capture start: '+e.message,active??'');throw e;}
}
function captureStartBytes(command,args,options={}){
 if(!active)return null;const base=recordPath('logs','process'),fds={stdout:io.openSync(base+'.stdout','wx',0o600),stderr:io.openSync(base+'.stderr','wx',0o600)},sizes={stdout:0,stderr:0};let failed=null,ended=false;
 for(const arg of args??[])if(typeof arg==='string'&&path.dirname(arg)===path.join(active,'tmp')){try{if(io.lstatSync(arg).isDirectory())registerRoot(arg);}catch(e){if(e.code!=='ENOENT')throw e;}}
 writeJSON(base+'.started.json',{command:String(command),args,options:{cwd:options.cwd??process.cwd(),timeout:options.timeout??null,maxBuffer:options.maxBuffer??null},pid:process.pid,stage:process.env.PAIN_GAIN_QUALIFICATION_STAGE??null});
 const persisted={stdout:0,stderr:0};
 return{write(key,b){b=Buffer.isBuffer(b)?b:Buffer.from(b??'');const limit=options.maxBuffer??Infinity,keep=Math.max(0,Math.min(b.length,limit-sizes[key]));sizes[key]+=b.length;try{for(let at=0;at<keep;){const n=io.writeSync(fds[key],b,at,keep-at);if(n<=0)throw Error('zero-length evidence write');at+=n;persisted[key]+=n;}}catch(e){failed='write: '+e.message;}if(sizes[key]>limit)failed='output overflow';if(failed)evidenceFailure(failed,base);return failed;},
  end(result){if(ended)return;ended=true;if(result.error||!result.exitSeen||!result.closed){failed??='incomplete capture';evidenceFailure(failed,base);}try{for(const fd of Object.values(fds)){try{io.fsyncSync(fd);}finally{io.closeSync(fd);}}writeJSON(base+'.completed.json',{...result,bytes:sizes,persisted,lostReceived:{stdout:sizes.stdout-persisted.stdout,stderr:sizes.stderr-persisted.stderr},captureFailure:failed,complete:!failed&&!result.error&&result.exitSeen&&result.closed,observedOutcome:true});}catch(e){evidenceFailure('capture closure: '+e.message,base);throw e;}},
  event(value){observe('child-event',value);}};
}
export function captureSpawnSync(command,args,options={}){
 const capture=captureStart(command,args,{...options,maxBuffer:options.maxBuffer??1048576}),result=nativeSpawnSync(command,args,options);
 if(capture){capture.write('stdout',result.stdout);capture.write('stderr',result.stderr);capture.end({status:result.status,signal:result.signal,error:result.error??null,exitSeen:!result.error,closed:true});}return result;
}
function attach(child,capture){
 if(!capture)return child;
 // Existing supervisors own overflow deadlines and TERM/KILL policy.
 for(const key of ['stdout','stderr'])child[key]?.on('data',b=>{const failure=capture.write(key,b);if(failure?.startsWith('write:'))child.kill('SIGKILL');});
 for(const key of ['stdout','stderr'])child[key]?.on('error',e=>evidenceFailure('capture read: '+e.message,active));
 child.on('message',value=>capture.event({child:child.pid,value}));
 let error,exitSeen=false;child.on('error',e=>{error=e;});child.on('exit',()=>{exitSeen=true;});child.on('close',(code,signal)=>capture.end({code,signal,error:error??null,exitSeen,closed:true}));return child;
}
export function captureSpawn(command,args,options){const c=captureStart(command,args,options);return attach(nativeSpawn(command,args,options),c);}
export function captureFork(module,args,options){const c=captureStart(module,args,options);return attach(nativeFork(module,args,options),c);}

// Standalone verifier: builtin dependencies only, before loading the retained tools.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.dirname(__dirname),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function resident(p){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||cp.execFileSync('/usr/bin/stat',['-f','%Sf',p],{encoding:'utf8'}).includes('dataless'))throw Error('Unsafe/unavailable release file');return s;}
function verify(pin){if(!/^[a-f0-9]{64}$/.test(pin)||process.version!=='v24.19.0'||process.platform!=='darwin'||process.env.NODE_OPTIONS||process.env.NODE_PATH)throw Error('Unsupported release/runtime configuration');
    const file=path.join(root,'release.json');if(resident(file).size>1048576)throw Error('Release inventory too large');const bytes=fs.readFileSync(file);if(hash(bytes)!==pin)throw Error('Release inventory mismatch');const r=JSON.parse(bytes);
    if(r.format!=='pain-gain-recovery-release-v1'||r.productionAuthority!==false||r.node!==process.version||r.arch!==process.arch||r.platform!==process.platform||!Array.isArray(r.files)||r.files.length>180||new Set(r.files.map(f=>f.path)).size!==r.files.length)throw Error('Invalid release inventory');
    if(fs.realpathSync(process.execPath)!==path.join(root,'runtime/node'))throw Error('Use retained runtime');let total=0;
    for(const f of r.files){if(!/^(?:tools|src|docs|runtime)\/[A-Za-z0-9_./-]+$/.test(f.path)&&f.path!=='package.json')throw Error('Invalid inventory path');if(f.path.split('/').some(p=>p==='..'||p==='.'||!p))throw Error('Unsafe inventory path');const p=path.join(root,f.path);if(fs.realpathSync(p)!==p)throw Error('Aliased release file');const s=resident(p);if(s.size!==f.bytes||(total+=s.size)>256*1048576)throw Error('Invalid release length');const h=crypto.createHash('sha256'),fd=fs.openSync(p,'r'),buffer=Buffer.alloc(65536);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}if(h.digest('hex')!==f.sha256)throw Error('Release file mismatch: '+f.path);}
    for(const required of ['runtime/node','tools/replay-recovery-launch.cjs','tools/replay-sqlite-recovery-fixture.js','tools/replay-store.js'])if(!r.files.some(f=>f.path===required))throw Error('Incomplete release');return r;
}
async function main(){const[pin,action,request]=process.argv.slice(2);if(process.argv.length!==5)throw Error('Usage: retained-node replay-recovery-launch.cjs <release-sha256> <action> <request.json>');verify(pin);if(resident(request).size>16384)throw Error('Request too large');const value=JSON.parse(fs.readFileSync(request));if(Object.hasOwn(value,'releaseHash'))throw Error('Release identity supplied by pinned launcher');
    let result;
    if(action==='rehearsal-convert')result=await(await import('./replay-backup-rehearsal.js')).rehearseBackupV2(value);
    else if(action==='rehearsal-select')result=await(await import('./replay-rehearsal-operations.js')).selectRehearsalAuthority(value);
    else if(action==='rehearsal-command')result=await(await import('./replay-rehearsal-operations.js')).runRehearsalCommand(value);
    else if(action==='rehearsal-classify')result=await(await import('./replay-rehearsal-operations.js')).classifyRehearsalCache(value);
    else{const api=await import('./replay-sqlite-recovery-fixture.js');result=await api.recoveryCommand(action,{...value,releaseHash:pin});}
    console.log(JSON.stringify(result));}
main().catch(e=>{console.error(JSON.stringify({code:e.code??'RELEASE_REJECTED',message:e.message,cleanupFailures:e.cleanupFailures}));process.exitCode=1;});

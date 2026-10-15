import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {DatabaseSync} from 'node:sqlite';
import {cacheFrame,log,frames,replayId} from './replay-import-command-fixture.js';
export {cacheFrame,log,frames,replayId};
export const release=process.env.PAIN_GAIN_RECOVERY_RELEASE;assert(release&&path.isAbsolute(release));
export const module=name=>import(pathToFileURL(path.join(release,'tools',name+'.js')));
export const parser=await module('replay-logs'),api=await module('replay-rehearsal-operations'),conversion=await module('replay-backup-rehearsal'),recovery=await module('replay-sqlite-recovery-fixture');
export const pin=parser.sha256(fs.readFileSync(path.join(release,'release.json')));
export const importBudget={profile:'converted-corpus-v1',logs:320,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128};
export const cacheCapacity={profile:'replay-cache-v1',wrappers:8192,diagnostics:4194304,files:2048,entries:4096,directoryIterations:1048576,cycleBytes:67108864,discoveryBytes:536870912,attemptBytes:268435456,attempts:4096,reportBytes:2097152};
export function hashes(root){const out={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else out[path.relative(root,f)]=parser.sha256(fs.readFileSync(f));}}walk(root);return out;}
export function db(root,fn){const d=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),s=new DatabaseSync(path.join(root,d.database),{readOnly:true});try{return fn(s);}finally{s.close();}}
export async function fixture(t,{scoreValue=frames(),convert=true}={}){
    const tmp=fs.realpathSync(os.tmpdir()),dir=prefix=>{const p=fs.mkdtempSync(path.join(tmp,prefix));t.diagnostic(JSON.stringify({generated:true,retained:p}));return p;};
    const parent=dir('pain-gain-backup-input-'),sourceRoot=path.join(parent,'backup'),data=path.join(sourceRoot,'data/replay_logs'),root=dir('pain-gain-backup-rehearsal-'),cache=dir('pain-gain-rehearsal-original-cache-'),controls=dir('pain-gain-rehearsal-cache-controls-');fs.mkdirSync(data,{recursive:true});
    const logPath=path.join(cache,'log_0'),scorePath=path.join(cache,'score_0');fs.writeFileSync(logPath,cacheFrame(log()));fs.writeFileSync(scorePath,cacheFrame(scoreValue,{collection:'score'}));
    const parsed=parser.parseCacheEntry(fs.readFileSync(logPath)),score=parser.parseScoreCacheEntry(fs.readFileSync(scorePath)),id=parser.mapChecksum(parsed.map),mapFile='pain_and_gain_map_2026-10-15T00-00-00-000Z.json',registration={id,checksum:id,file:mapFile,status:'validated'};
    const lr=parser.logImportRecord(parsed,logPath,replayId+'.jsonl',registration,'2026-10-15T00:00:00.000Z');lr.status='claim';lr.buildId=null;lr.unknown={nil:null,order:[2,1]};lr.reviews={'original/owner':{claimedAt:'original',examinedAt:null,completedAt:null,unknown:false}};
    const sr=parser.scoreImportRecord(score,scorePath,`replay-score-source-${replayId}-${score.fingerprint.slice(0,12)}.response`,id,'2026-10-15T00:00:00.000Z');sr.status='claim';
    const manifest={version:2,maps:[registration],replays:[{replayId,mapId:id,buildId:'a'.repeat(64),status:'active',retiredFingerprints:[parser.sha256('history')]}],records:[lr],scoreRecords:[sr],retiredScoreSources:[],unknown:[null,false]};
    fs.writeFileSync(path.join(data,mapFile),JSON.stringify({...parsed.map,checksum:id}));fs.writeFileSync(path.join(data,lr.outputPath),parsed.gameState.join('\n')+'\n');fs.writeFileSync(path.join(data,sr.outputPath),score.body);fs.writeFileSync(path.join(data,'manifest.json'),JSON.stringify(manifest));
    const files=fs.readdirSync(data).sort().map(n=>({relativePath:'replay_logs/'+n,bytes:fs.statSync(path.join(data,n)).size,sha256:parser.sha256(fs.readFileSync(path.join(data,n)))})),bytes=files.reduce((n,f)=>n+f.bytes,0),inventory=path.join(sourceRoot,'inventory.json'),receipt=path.join(parent,'binding.json');
    fs.writeFileSync(inventory,JSON.stringify({format:'scoped-managed-v2-backup-v1',sourceRoot:'/generated/origin',totalBytes:bytes,files}));const inventorySha256=parser.sha256(fs.readFileSync(inventory));
    fs.writeFileSync(receipt,JSON.stringify({schema:'replay-backup-binding-v2',sourceRoot,inventorySha256,files:files.length,bytes,complete:true,verified:true,origin:'synthetic-backup',layout:'scoped-managed-v2-v1',dataRoot:data}));const receiptSha256=parser.sha256(fs.readFileSync(receipt));
    const authorization={sourceRoot,root,layout:'scoped-managed-v2-v1',inventory,inventorySha256,receipt,receiptSha256,acknowledge:'backup-rehearsal-only'};
    const capability=path.join(controls,'capability.json'),cap={version:1,scope:'rehearsal-cache-inventory-v1',productionAuthority:false,releaseHash:pin,destination:root,snapshot:{inventorySha256,receiptSha256},operations:['classify','import','score-import','scan'],importBudget,cacheCapacity,files:[]};
    const f={root,parent,sourceRoot,data,cache,controls,logPath,scorePath,lr,sr,manifest,authorization,cap,capability,dir};
    f.approve=(file,operations)=>{cap.files.push({path:file,bytes:fs.statSync(file).size,sha256:parser.sha256(fs.readFileSync(file)),operations});};
    f.bind=()=>{fs.writeFileSync(capability,JSON.stringify(cap));f.capabilitySha256=parser.sha256(fs.readFileSync(capability));};f.approve(logPath,['classify','import','scan']);f.approve(scorePath,['classify','score-import']);f.bind();
    if(convert){assert.equal((await conversion.rehearseBackupV2(authorization)).phase,'verified');f.lineageHash=(await api.selectRehearsalAuthority({authorization})).lineageHash;}return f;
}
export const run=(f,command,options={},extra={})=>api.runRehearsalCommand({root:f.root,lineageHash:f.lineageHash,command,options:{capability:f.capability,capabilitySha256:f.capabilitySha256,...options},...extra});

// Bounded connections to existing v2 consumers, inside one selected authority
// lease. No SQLite handle or production default root is used here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Buffer} from 'node:buffer';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {fail,jsonChunks} from './replay-store-payloads.js';
import {resident,withCleanup} from './retrieval-files.js';
import {regular,hashFile} from './replay-authority-export.js';
import {withAuthorityV2Checks,assertAuthorityAccess} from './replay-authority-guard.js';
import * as legacy from './replay-logs.js';
import {parseSyntheticCacheBytes,syntheticImportLimits} from './replay-import-command-fixture.js';
import {listLimits} from './replay-store-list.js';
import {MAINTENANCE_LIMITS} from './replay-maintenance-command-fixture.js';
import {scanRestoredV2Cache} from './replay-scan-command-fixture.js';
import {buildHistoricalIndex,validateSelection} from './historical-index.js';
import {screenReplay} from './scout-hold-screen.js';
import {analyzeReplay} from './replay-analysis.js';
import {writeOtherEntries} from './replay-other.js';

const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const need=(ok,code='INVALID_ARGUMENT')=>{if(!ok)fail(code,'Restored-v2 command contract failed');};
const id=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const task=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(v);
const plain=v=>v&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function fields(o,allowed,required=[]){need(Object.keys(o).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(o,k)));}
function fingerprintSelection(values,nonempty=false){need(Array.isArray(values)&&values.length<=64&&(!nonempty||values.length>0)&&values.every(hash)&&new Set(values).size===values.length,'INVALID_IDENTITY');}
function reduced(given,defaults){const result={...defaults};if(given!==undefined){need(plain(given));for(const[k,v]of Object.entries(given)){need(Object.hasOwn(result,k)&&Number.isSafeInteger(v)&&v>0&&v<=result[k],'RESOURCE_LIMIT');result[k]=v;}}return result;}
function maintenanceBudget(given){if(given)need(!Object.hasOwn(given,'pageSize'),'UNSUPPORTED_OPTION');return reduced(given,MAINTENANCE_LIMITS);}
function byteLength(value,max){let bytes=0;for(const chunk of jsonChunks(value)){bytes+=chunk.length;need(bytes<=max,'RESOURCE_LIMIT');}return bytes;}
function manifestBounds(m,b){
    let values=0;
    const json=(v,depth)=>{need(depth<=64&&++values<=b.limits.manifestBytes,'RESOURCE_LIMIT');if(values%1024===0)b.charge();if(typeof v==='number')need(Number.isFinite(v),'UNSUPPORTED_REPRESENTATION');if(v&&typeof v==='object'){if(Array.isArray(v)){for(const child of v)json(child,depth+1);}else for(const key of Object.keys(v))json(v[key],depth+1);}};
    json(m,0);
    need(plain(m)&&m.version===2&&['records','maps','replays'].every(k=>Array.isArray(m[k])),'UNSUPPORTED_REPRESENTATION');
    for(const k of ['scoreRecords','retiredScoreSources'])need(!Object.hasOwn(m,k)||Array.isArray(m[k]),'UNSUPPORTED_REPRESENTATION');
    const records=[...m.records,...(m.scoreRecords??[])];
    need(records.length<=32&&m.maps.length<=8&&m.replays.length<=8,'RESOURCE_LIMIT');
    let reviews=0,properties=Object.keys(m).length,retired=(m.retiredScoreSources??[]).length;
    for(const a of [m.records,m.scoreRecords??[]])need(new Set(a.map(r=>JSON.stringify([r.replayId,r.fingerprint]))).size===a.length,'IDENTITY_CONFLICT');
    for(const a of [m.maps,m.replays])need(new Set(a.map(r=>r.id??r.replayId)).size===a.length,'IDENTITY_CONFLICT');
    for(const r of records){need(plain(r)&&id(r.replayId)&&hash(r.fingerprint)&&plain(r.reviews),'INVALID_IDENTITY');const owners=Object.values(r.reviews);need(owners.length<=16&&owners.every(plain),'RESOURCE_LIMIT');reviews+=owners.length;properties+=Object.keys(r).length+owners.reduce((n,v)=>n+Object.keys(v).length,0);
        need(Object.keys(r).length<=128&&owners.every(v=>Object.keys(v).length<=128),'RESOURCE_LIMIT');
        if(m.records.includes(r))need(Array.isArray(r.otherEntries)&&r.otherEntries.length<=b.limits.wrappers,'RESOURCE_LIMIT');
    }
    for(const r of [...m.maps,...m.replays,...(m.retiredScoreSources??[])]){need(plain(r)&&Object.keys(r).length<=128,'RESOURCE_LIMIT');properties+=Object.keys(r).length;}
    for(const r of m.replays){if(Object.hasOwn(r,'retiredFingerprints')){need(Array.isArray(r.retiredFingerprints)&&r.retiredFingerprints.every(hash)&&new Set(r.retiredFingerprints).size===r.retiredFingerprints.length,'INVALID_REFERENCE');need(!m.records.some(log=>log.replayId===r.replayId&&r.retiredFingerprints.includes(log.fingerprint)),'IDENTITY_CONFLICT');retired+=r.retiredFingerprints.length;}}
    need(!(m.retiredScoreSources??[]).some(old=>(m.scoreRecords??[]).some(r=>r.replayId===old.replayId&&r.fingerprint===old.fingerprint)),'IDENTITY_CONFLICT');
    need(Object.keys(m).length<=128&&reviews<=128&&properties<=2048&&retired<=512,'RESOURCE_LIMIT');
    byteLength(m,b.limits.manifestBytes);b.charge();return m;
}

export async function runRestoredV2Command({root,command,options:o,b,sink}){
    const start=performance.now(),baseBudget=b;let deadlineMs=b.limits.deadlineMs;
    b={limits:baseBudget.limits,charge(n=0){baseBudget.charge(n);need(performance.now()-start<=deadlineMs,'RESOURCE_LIMIT');}};
    assertAuthorityAccess(root,'v2');const dataRoot=path.join(root,'replay_logs');resident(dataRoot,true);need(fs.realpathSync(dataRoot)===dataRoot,'UNSAFE_PATH');
    const manifestFile=path.join(dataRoot,'manifest.json');let currentSource,currentLocal;
    const read=(file,max)=>{assertAuthorityAccess(root,'v2');b.charge();const before=regular(file);need(before.size<=max,'RESOURCE_LIMIT');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let failed=false,primary;
        try{const opened=fs.fstatSync(fd);need(opened.ino===before.ino&&opened.dev===before.dev&&opened.size===before.size,'CHANGED_INPUT');const bytes=Buffer.alloc(before.size);let offset=0;while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,Math.min(65536,bytes.length-offset),offset);need(n>0,'CHANGED_INPUT');offset+=n;b.charge(n);}const end=fs.fstatSync(fd),named=regular(file);need(end.size===before.size&&end.mtimeMs===before.mtimeMs&&end.ctimeMs===before.ctimeMs&&named.ino===before.ino&&named.dev===before.dev,'CHANGED_INPUT');return bytes;}
        catch(e){failed=true;primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Restored-v2 read/cleanup',{cause:primary});}}
    };
    const basename=(name)=>{need(typeof name==='string'&&path.basename(name)===name&&!['.','..'].includes(name)&&!name.includes('\\'),'UNSAFE_PATH');return path.join(dataRoot,name);};
    const load=()=>manifestBounds(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read(manifestFile,b.limits.manifestBytes))),b);
    function verifyFiles(m,allowRecovery=false){let total=0;
        for(const map of m.maps){const file=basename(map.file),bytes=read(file,1048576),payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));need(legacy.validMap(legacy.mapPayload(payload))&&legacy.mapChecksum(payload)===map.id&&map.checksum===map.id&&(payload.checksum===map.id||command==='upgrade-map-checksums'&&!Object.hasOwn(payload,'checksum')),'INVALID_ARTIFACT');total+=bytes.length;}
        const owned=new Set();for(const r of [...m.records,...(m.scoreRecords??[])])if(r.outputPath!==null){need(hash(r.outputFingerprint),'INVALID_REFERENCE');const file=basename(r.outputPath);need(!owned.has(file),'OWNERSHIP_CONFLICT');owned.add(file);
            try{const got=hashFile(file,b,4*1048576);need(got.hash===r.outputFingerprint,'INVALID_ARTIFACT');total+=got.bytes;}
            catch(e){if(e.code!=='ENOENT'||!allowRecovery)throw e;
                const permitted=r.status==='pending'&&['import','score-import','scan','watch'].includes(command)||r.status==='done'&&m.records.includes(r)&&['done','complete','reconcile','list','scan','watch'].includes(command)||r.status==='retiring'&&!m.records.includes(r)&&command==='score-cleanup';need(permitted,'UNAVAILABLE');
            }
        }need(total<=b.limits.artifactBytes,'RESOURCE_LIMIT');return total;
    }
    function sourceRoot(dir){need(typeof dir==='string'&&path.isAbsolute(dir)&&path.resolve(dir)===dir&&path.dirname(dir)===fs.realpathSync(os.tmpdir())&&path.basename(dir).startsWith('pain-gain-cache-import-fixture-'),'UNSAFE_PATH');resident(dir,true);need(fs.realpathSync(dir)===dir,'UNSAFE_PATH');const marker=read(path.join(dir,'.synthetic-cache-fixture'),64);need(marker.toString()==='synthetic-chromium-cache-v1\n','UNSUPPORTED_FIXTURE');return legacy.sha256(marker);}
    function source(dir,name,collection){const markerHash=sourceRoot(dir);need(typeof name==='string'&&/^[A-Za-z0-9._-]{1,120}$/.test(name)&&!['.','..'].includes(name),'UNSAFE_PATH');const file=path.join(dir,name),bytes=read(file,syntheticImportLimits.cache),parsed=parseSyntheticCacheBytes(bytes,collection);return{file,bytes,parsed,sourceRoot:dir,sourceFile:name,markerHash,cacheHash:legacy.sha256(bytes)};}
    function stableSource(){if(currentSource){need(sourceRoot(currentSource.sourceRoot)===currentSource.markerHash&&hashFile(currentSource.file,b,syntheticImportLimits.cache).hash===currentSource.cacheHash,'CHANGED_INPUT');}if(currentLocal)need(hashFile(currentLocal.file,b,currentLocal.max).hash===currentLocal.hash,'CHANGED_INPUT');}
    function beforeImport(s,collection){const m=load(),records=collection==='log'?m.records:m.scoreRecords??[],existing=records.find(r=>r.replayId===s.parsed.replayId&&r.fingerprint===s.parsed.fingerprint),retired=collection==='log'?m.replays.find(r=>r.replayId===s.parsed.replayId)?.retiredFingerprints?.includes(s.parsed.fingerprint):(m.retiredScoreSources??[]).some(r=>r.replayId===s.parsed.replayId&&r.fingerprint===s.parsed.fingerprint);
        const pending=[...m.records,...(m.scoreRecords??[])].filter(r=>r.status==='pending');need(pending.length<=1&&pending.every(r=>r===existing&&path.resolve(r.sourceEntry)===s.file),'NOT_READY');
        if(existing){need(existing.sourceKey===s.parsed.key,'IDENTITY_CONFLICT');if(collection==='score')need(existing.cacheEntryFingerprint===s.parsed.cacheEntryFingerprint,'CHANGED_INPUT');}
        if(!existing&&!retired&&(collection==='score'||s.parsed.gameState.length||legacy.hasRetainedDiagnostics(s.parsed)))need(m.records.length+(m.scoreRecords??[]).length<32,'RESOURCE_LIMIT');
        if(collection==='log'&&s.parsed.map&&!m.maps.some(r=>r.id===legacy.mapChecksum(s.parsed.map)))need(m.maps.length<8,'RESOURCE_LIMIT');
        if(collection==='log'&&s.parsed.map&&!m.replays.some(r=>r.replayId===s.parsed.replayId))need(m.replays.length<8,'RESOURCE_LIMIT');
        const retainedBytes=verifyFiles(m,true),output=collection==='score'?s.parsed.body:s.parsed.gameState.length?Buffer.from(s.parsed.gameState.join('\n')+'\n'):Buffer.alloc(0);need(output.length<=4*1048576,'RESOURCE_LIMIT');
        const extraOutput=retired||existing?.outputPath&&fs.existsSync(basename(existing.outputPath))?0:output.length,extraMap=collection==='log'&&s.parsed.map&&!m.maps.some(r=>r.id===legacy.mapChecksum(s.parsed.map))?Buffer.byteLength(legacy.savedMapContent(s.parsed.map)):0;
        need(retainedBytes+extraOutput+extraMap<=b.limits.artifactBytes,'RESOURCE_LIMIT');b.charge(output.length);return existing;
    }
    const checks=(operation,value)=>{if(operation==='error')throw value;b.charge();
        if(operation==='scan')return true;
        if(operation==='save'){stableSource();manifestBounds(value,b);b.charge(byteLength(value,b.limits.manifestBytes));return true;}
        if(operation==='retire-log'){const{manifest,record,association}=value;manifestBounds({...manifest,records:manifest.records.filter(r=>r!==record),replays:manifest.replays.map(r=>r!==association?r:{...r,retiredFingerprints:(r.retiredFingerprints??[]).includes(record.fingerprint)?r.retiredFingerprints:[...(r.retiredFingerprints??[]),record.fingerprint]})},b);return true;}
        if(operation==='retire-score'){const{manifest,record,tombstone}=value;manifestBounds({...manifest,scoreRecords:manifest.scoreRecords.filter(r=>r!==record),retiredScoreSources:[...(manifest.retiredScoreSources??[]),tombstone].sort((a,c)=>legacy.canonical(a).localeCompare(legacy.canonical(c)))},b);return true;}
        if(operation==='directory'){need(value===dataRoot,'UNSAFE_PATH');const dir=fs.opendirSync(value),names=[];let failed=false,primary;try{for(let d;(d=dir.readSync());){need(names.length<64,'RESOURCE_LIMIT');names.push(d.name);}return names;}catch(e){failed=true;primary=e;throw e;}finally{try{dir.closeSync();}catch(e){if(!failed)throw e;if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Directory/cleanup',{cause:primary});}}}
        if(operation==='cache-write'){need(path.dirname(value.file)===path.join(dataRoot,'analysis_cache'),'UNSAFE_PATH');if(fs.existsSync(path.dirname(value.file))){resident(path.dirname(value.file),true);need(fs.realpathSync(path.dirname(value.file))===path.dirname(value.file),'UNSAFE_PATH');}if(fs.existsSync(value.file))regular(value.file);need(Buffer.byteLength(value.content)<=4*1048576,'RESOURCE_LIMIT');b.charge(Buffer.byteLength(value.content));return true;}
        need(operation==='read');const{file,kind}=value;
        if(kind==='cache'){need(currentSource&&file===currentSource.file,'UNSAFE_PATH');stableSource();return currentSource.bytes;}
        if(kind==='code'){need(file.startsWith(codeRoot+path.sep)&&['tools/historical-index.js','tools/scout-hold-screen.js','tools/replay-analysis.js','tools/replay-score-analysis.js','tools/replay-logs.js','src/config.js','src/debug/build-id.js'].includes(path.relative(codeRoot,file)),'UNSAFE_PATH');return read(file,1048576);}
        if(kind==='manifest'){need(file===manifestFile,'UNSAFE_PATH');return read(file,b.limits.manifestBytes);}
        if(kind==='cache-report'){need(path.dirname(file)===path.join(dataRoot,'analysis_cache'),'UNSAFE_PATH');return read(file,4*1048576);}
        need(path.dirname(file)===dataRoot,'UNSAFE_PATH');if(currentLocal?.file===file){stableSource();return currentLocal.bytes;}return read(file,kind==='map'?1048576:4*1048576);
    };
    async function imported(name,collection){const s=source(o.sourceRoot,name,collection);currentSource=s;try{beforeImport(s,collection);const result=await legacy[collection==='score'?'importScoreCacheFile':'importCacheFile'](root,s.file);stableSource();verifyFiles(load());return result;}finally{currentSource=undefined;}}
    const identity=()=>need(id(o.replayId)&&hash(o.fingerprint),'INVALID_IDENTITY');
    const selectedReview=()=>{identity();need(task(o.taskId),'INVALID_IDENTITY');};
    function localCapacity(m,association,fingerprint,bytes,L){const existing=m.records.some(r=>r.replayId===o.replayId&&r.fingerprint===fingerprint),retired=association.retiredFingerprints?.includes(fingerprint);need(existing||retired||m.records.length+(m.scoreRecords??[]).length<32,'RESOURCE_LIMIT');const total=verifyFiles(m,true)+(existing||retired?0:bytes.length);need(total<=b.limits.artifactBytes&&total<=L.artifactBytes,'RESOURCE_LIMIT');}
    function repairCapacity(m,L){let total=verifyFiles(m,true);for(const map of m.maps){const bytes=read(basename(map.file),L.mapBytes),value=JSON.parse(bytes);if(!Object.hasOwn(value,'checksum')){const length=Buffer.byteLength(legacy.savedMapContent(value));need(length<=1048576&&length<=L.mapBytes,'RESOURCE_LIMIT');total+=length-bytes.length;}}need(total<=b.limits.artifactBytes&&total<=L.artifactBytes,'RESOURCE_LIMIT');}
    function readSelection(m,logs,scores,replayId=o.replayId){let raw=0,diagnostics=0;for(const r of [...m.records.filter(r=>r.replayId===replayId&&logs.includes(r.fingerprint)),...(m.scoreRecords??[]).filter(r=>r.replayId===replayId&&scores.includes(r.fingerprint))]){if(r.outputPath)raw+=regular(basename(r.outputPath)).size;if(r.otherEntries)diagnostics+=byteLength(r.otherEntries,16*1048576);}need(raw<=16*1048576&&diagnostics<=16*1048576,'RESOURCE_LIMIT');}
    const corpusLimits=limits=>{deadlineMs=Math.min(deadlineMs,limits.deadlineMs);b.charge();const m=load();need(m.records.length<=limits.records,'RESOURCE_LIMIT');need(m.records.reduce((n,r)=>n+Object.keys(r.reviews).length,0)<=(limits.reviews??128),'RESOURCE_LIMIT');need(byteLength(m,b.limits.manifestBytes)<=limits.metadataBytes,'RESOURCE_LIMIT');
        if(limits.maps!==undefined)need(m.maps.length<=limits.maps&&m.replays.length<=limits.replays,'RESOURCE_LIMIT');
        if(limits.properties!==undefined)need([m,...m.records,...(m.scoreRecords??[]),...m.maps,...m.replays].every(r=>Object.keys(r).length<=limits.properties),'RESOURCE_LIMIT');
        if(limits.mapBytes!==undefined)for(const map of m.maps)need(regular(basename(map.file)).size<=limits.mapBytes,'RESOURCE_LIMIT');
        if(limits.files!==undefined)need(m.maps.length+[...m.records,...(m.scoreRecords??[])].filter(r=>r.outputPath).length<=limits.files,'RESOURCE_LIMIT');
        if(limits.rows!==undefined){const rows=m.records.reduce((n,r)=>n+1+Object.keys(r).length+Object.values(r.reviews).reduce((sum,v)=>sum+1+Object.keys(v).length,0),0);need(rows<=limits.rows,'RESOURCE_LIMIT');}
        const bytes=verifyFiles(m,true);need(bytes<=limits.artifactBytes,'RESOURCE_LIMIT');return m;};
    function listBudget(){if(command==='list'&&o.limits)need(!Object.hasOwn(o.limits,'sql')&&!Object.hasOwn(o.limits,'pageSize'),'UNSUPPORTED_OPTION');return listLimits({limits:command==='list'?o.limits:undefined});}
    async function list(){const before=corpusLimits(listBudget()),after=await legacy.reconcileCleanup(root);return{records:after.records,migrated:before.records.filter(r=>r.status==='waiting').length,retired:before.records.length-after.records.length,generation:legacy.sha256(read(manifestFile,b.limits.manifestBytes))};}
    async function pending(){const m=load(),records=[...m.records,...(m.scoreRecords??[])].filter(r=>['pending','retiring'].includes(r.status));need(records.length<=1,'NOT_READY');if(!records.length)return null;const r=records[0];need(m.records.includes(r)&&r.status==='pending','NOT_READY');need(path.dirname(r.sourceEntry)===o.sourceRoot,'CHANGED_INPUT');const s=source(o.sourceRoot,path.basename(r.sourceEntry),'log');need(s.parsed.fingerprint===r.fingerprint&&s.parsed.replayId===r.replayId,'CHANGED_INPUT');return{source:{sourceRoot:s.sourceRoot,sourceFile:s.sourceFile,markerHash:s.markerHash,cacheHash:s.cacheHash}};}
    return withAuthorityV2Checks(checks,async()=>{
        const initial=load();verifyFiles(initial,true);
        let result;
        if(['import','score-import'].includes(command)){fields(o,['sourceRoot','sourceFile'],['sourceRoot','sourceFile']);result=await imported(o.sourceFile,command==='score-import'?'score':'log');}
        else if(['scan','watch'].includes(command)){fields(o,['sourceRoot','limits','signal'],['sourceRoot']);result=await scanRestoredV2Cache({synthetic:true,root,...o},command==='watch',{guard:()=>sourceRoot(o.sourceRoot),inspect:name=>{const s=source(o.sourceRoot,name,'log');return{sourceRoot:s.sourceRoot,sourceFile:s.sourceFile,markerHash:s.markerHash,cacheHash:s.cacheHash,bytes:s.bytes.length};},pending,import:name=>imported(name,'log'),list:()=>list()});}
        else if(command==='list'){fields(o,['limits']);corpusLimits(listBudget());result=await legacy.reconcileCleanup(root);}
        else if(command==='reconcile'){fields(o,['replayId','fingerprint'],['replayId','fingerprint']);identity();result=await legacy.reconcileSelectedLog(root,o.replayId,o.fingerprint);}
        else if(['claim','examined','done','complete','score-claim','score-examined','score-done'].includes(command)){fields(o,['replayId','fingerprint','taskId'],['replayId','fingerprint','taskId']);selectedReview();const score=command.startsWith('score-');result=await legacy[score?'updateScoreReview':'updateReview'](root,score?command.slice(6):command,o.replayId,o.fingerprint,o.taskId);}
        else if(['score-cleanup','score-verify'].includes(command)){fields(o,['replayId','fingerprint'],['replayId','fingerprint']);identity();result=await legacy[command==='score-cleanup'?'cleanupScoreSource':'verifyScoreSource'](root,o.replayId,o.fingerprint);}
        else if(command==='register-local'){fields(o,['replayId','sourceFile','limits'],['replayId','sourceFile']);need(id(o.replayId),'INVALID_IDENTITY');const L=maintenanceBudget(o.limits);corpusLimits(L);const file=basename(o.sourceFile),bytes=read(file,L.fileBytes),m=load(),association=m.replays.find(r=>r.replayId===o.replayId&&r.status==='active'),map=m.maps.find(r=>r.id===association?.mapId);need(map,'UNAVAILABLE');const payload=JSON.parse(read(basename(map.file),L.mapBytes)),parsed=legacy.parseLocalLog(bytes,legacy.mapPayload(payload).objects.filter(x=>x.type==='ScoreFlag').map(({id,x,y,effectType,scorePerTick})=>({id,x,y,effectType,scorePerTick})).sort((a,b)=>a.id.localeCompare(b.id)),L),fp=legacy.sha256(`manual-jsonl:${o.replayId}\n${parsed.content}`);localCapacity(m,association,fp,bytes,L);currentLocal={file,bytes,hash:legacy.sha256(bytes),max:L.fileBytes};try{result=await legacy.registerLocalFile(root,o.replayId,o.sourceFile);stableSource();}finally{currentLocal=undefined;}}
        else if(['maps','migrate-status','upgrade-map-checksums'].includes(command)){fields(o,['limits']);const L=maintenanceBudget(o.limits);need(initial.maps.length<=L.maps&&initial.replays.length<=L.replays,'RESOURCE_LIMIT');corpusLimits(L);if(command==='upgrade-map-checksums')repairCapacity(initial,L);result=command==='maps'?load().maps:await legacy[command==='migrate-status'?'migrateReviewStatuses':'upgradeMapChecksums'](root);if(command==='upgrade-map-checksums')need(!result.some(r=>r.status==='error'),'INVALID_ARTIFACT');}
        else if(command==='analyze'){fields(o,['replayId','fingerprints','scoreFingerprints','reportMode'],['replayId']);need(id(o.replayId),'INVALID_IDENTITY');if(o.fingerprints!==undefined)fingerprintSelection(o.fingerprints);if(o.scoreFingerprints!==undefined)fingerprintSelection(o.scoreFingerprints);readSelection(initial,o.fingerprints??initial.records.filter(r=>r.replayId===o.replayId).map(r=>r.fingerprint),o.scoreFingerprints??[]);result=analyzeReplay({...o,root});}
        else if(command==='index'){fields(o,['selection','cache'],['selection']);need(o.cache===undefined||typeof o.cache==='boolean');validateSelection(o.selection);let n=0;for(const m of o.selection.matches){fingerprintSelection(m.logFingerprints);fingerprintSelection(m.scoreFingerprints??[]);readSelection(initial,m.logFingerprints,m.scoreFingerprints??[],m.replayId);n+=m.logFingerprints.length+(m.scoreFingerprints??[]).length;}need(n<=64,'RESOURCE_LIMIT');result=buildHistoricalIndex({root,selection:o.selection,cache:o.cache??false,codeRoot});}
        else if(command==='screen'){fields(o,['replayId','taskId','expectedBuildId','fingerprints','cache'],['replayId','taskId','expectedBuildId','fingerprints']);need(id(o.replayId)&&typeof o.taskId==='string'&&/^codex\/[a-z0-9-]+$/.test(o.taskId)&&hash(o.expectedBuildId),'INVALID_IDENTITY');need(o.cache===undefined||typeof o.cache==='boolean');fingerprintSelection(o.fingerprints,true);readSelection(initial,o.fingerprints,[]);result=screenReplay(o.replayId,o.taskId,o.expectedBuildId,{root,codeRoot,fingerprints:o.fingerprints,cache:o.cache??false});}
        else if(command==='other'){fields(o,['replayId','fingerprint','limits'],['replayId','fingerprint']);identity();need(typeof sink==='function');const L=maintenanceBudget(o.limits),r=initial.records.find(r=>r.replayId===o.replayId&&r.fingerprint===o.fingerprint);corpusLimits(L);need(r,'UNAVAILABLE');need(r.otherEntries.length<=L.wrappers,'RESOURCE_LIMIT');let bytes=0;for(const entry of r.otherEntries){bytes+=byteLength(entry,L.outputBytes)+1;need(bytes<=L.outputBytes,'RESOURCE_LIMIT');}result=await writeOtherEntries(r.otherEntries,sink);}
        else fail('UNSUPPORTED_AUTHORITY_COMMAND','No restored-v2 connection for '+command);
        verifyFiles(load());b.charge();assertAuthorityAccess(root,'v2');return result;
    });
}

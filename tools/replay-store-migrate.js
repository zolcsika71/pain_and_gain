// Explicit production administration. No default root, open-time migration or cleanup.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {DatabaseSync} from 'node:sqlite';
import {withProductionLock,runtimeCapabilities,recoverySchemaHash,openStore} from './replay-store.js';
import {productionDataRoot,canonicalDirectory,productionSelection,productionLease,validateProductionImportBudget,validateProductionCacheCapacity,PRODUCTION_STATE,PRODUCTION_PROOF,present} from './replay-production-scope.js';
import {need,equal,digest,options,recoveryBudget,safe,readControl,exclusiveControl,copyFile,readDatabase,databaseFacts,artifactInventory,writeRecoveryControl} from './replay-sqlite-recovery-data.js';
import {hashFile,close,syncDirectory,publishStream} from './replay-authority-export.js';
import {withCleanup} from './retrieval-files.js';

const HEX=/^[a-f0-9]{64}$/;
const dataRoot=p=>canonicalDirectory(productionDataRoot(p));
function separate(...roots){for(const root of roots)canonicalDirectory(root);for(let i=0;i<roots.length;i++)for(let j=0;j<i;j++)need(roots[i]!==roots[j]&&!roots[i].startsWith(roots[j]+path.sep)&&!roots[j].startsWith(roots[i]+path.sep),'UNSAFE_PATH');}
function pinned(file,pin,b){need(typeof pin==='string'&&HEX.test(pin),'INVALID_ARGUMENT');const r=readControl(file,b);need(r.hash===pin,'CHANGED_BINDING');return r.value;}
function request(input,extra){const o={...options(input,['projectRoot','approval','approvalSha256','limits','fault',...extra])};dataRoot(o.projectRoot);need(o.fault===undefined||typeof o.fault==='function','INVALID_ARGUMENT');return{...o,b:recoveryBudget(o.limits),fault:o.fault??(()=>{})};}
function approval(o,action,subject){
    const a=pinned(o.approval,o.approvalSha256,o.b);
    need(a.version===1&&a.scope==='production-storage-approval-v1'&&a.action===action&&a.projectRoot===o.projectRoot&&a.subjectHash===subject&&a.approved===true&&typeof a.operator==='string'&&a.operator.length>0,'APPROVAL_REQUIRED');
    need(Number.isSafeInteger(a.expiresAt)&&a.expiresAt>=Date.now()&&a.expiresAt-Date.now()<=86400000,'APPROVAL_REQUIRED');
    need(a.quiescence?.writersStopped===true&&a.quiescence?.lockCoverageConfirmed===true,'QUIESCENCE_REQUIRED');
    need(a.durability?.filesystem==='local-apfs'&&a.durability?.fsyncRenameAccepted===true&&a.durability?.powerLossDecision==='accepted-platform-assumptions'&&typeof a.durability?.decisionReceiptHash==='string'&&HEX.test(a.durability.decisionReceiptHash),'DURABILITY_REQUIRED');
    return a;
}
async function locked(o,fn){runtimeCapabilities();return withProductionLock(o.projectRoot,()=>withProductionLock(o.projectRoot,fn,true));}
function state(root,b){return readControl(path.join(root,PRODUCTION_STATE),b).value;}
function inventory(proof,b){const input=pinned(proof.inventory,proof.inventoryHash,b);need(input.version===1&&Array.isArray(input.files)&&input.files.length>0&&input.files.length<=b.limits.files,'INVALID_INVENTORY');
    const seen=new Set();let bytes=0;
    for(const f of input.files){need(f&&Object.keys(f).sort().join()==='bytes,hash,path'&&typeof f.path==='string'&&!seen.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&HEX.test(f.hash),'INVALID_INVENTORY');seen.add(f.path);bytes+=f.bytes;need(Number.isSafeInteger(bytes)&&bytes<=b.limits.artifactBytes,'RESOURCE_LIMIT');}
    need(seen.has('manifest.json')&&input.files.find(f=>f.path==='manifest.json').bytes<=629145600,'INVALID_INVENTORY');return input.files;
}
function verifyFiles(root,files,b){for(const f of files)need(equal(hashFile(safe(root,f.path),b,b.limits.artifactBytes),{bytes:f.bytes,hash:f.hash}),'CHANGED_SOURCE');}
function release(proof,b){
    validateProductionImportBudget(proof.importBudget);
    validateProductionCacheCapacity(proof.cacheCapacity);
    const r=pinned(proof.release,proof.releaseHash,b),root=canonicalDirectory(path.dirname(proof.release));
    need(r.version===1&&r.scope==='production-recovery-release-v1'&&r.node===process.version&&process.versions.node.split('.')[0]==='24'&&Number(process.versions.node.split('.')[1])>=19&&r.schemaHash===recoverySchemaHash()&&r.capabilities?.join()===['map-independent-scores','map-repair','production-authority-v1'].join(),'UNSUPPORTED_CAPABILITY');
    need(Array.isArray(r.files)&&r.files.length>0&&r.files.length<=256,'UNSUPPORTED_CAPABILITY');const seen=new Set();
    for(const f of r.files){need(!seen.has(f.path),'INVALID_REFERENCE');seen.add(f.path);need(hashFile(safe(root,f.path),b,256*1048576).hash===f.sha256,'RELEASE_MISMATCH');}
    // Pin the running tooling as well as the independent copy. The qualified
    // release must contain every module in this existing storage tool family.
    const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    const directory=fs.opendirSync(canonicalDirectory(path.join(codeRoot,'tools')));let primary,count=0;
    try{for(let entry;(entry=directory.readSync());){need(++count<=256,'RESOURCE_LIMIT');const name=entry.name;if(!/^(?:replay-|historical-index|scout-hold-screen).*\.js$/.test(name)&&name!=='retrieval-files.js')continue;
        const f=r.files.find(f=>f.path==='tools/'+name);need(f&&hashFile(safe(codeRoot,f.path),b,4*1048576).hash===f.sha256,'RELEASE_MISMATCH');
    }}catch(e){primary=e;throw e;}finally{try{directory.closeSync();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Release enumeration and close',{cause:primary});else throw e;}}
    need(r.files.some(f=>f.path==='package.json'),'RELEASE_MISMATCH');
    for(const relative of ['src/config.js','src/debug/build-id.js']){const f=r.files.find(f=>f.path===relative);need(f&&hashFile(safe(codeRoot,relative),b,1048576).hash===f.sha256,'RELEASE_MISMATCH');}
    const node=r.files.find(f=>f.path==='runtime/node');need(node&&hashFile(process.execPath,b,256*1048576).hash===node.sha256,'RELEASE_MISMATCH');return r;
}
export const verifyProductionRelease=release;
function qualification(proof,b){
    const q=pinned(proof.qualification,proof.qualificationHash,b);
    need(q.version===1&&q.scope==='production-storage-qualification-v1'&&q.status==='accepted'&&q.releaseHash===proof.releaseHash&&q.inventoryHash===proof.inventoryHash&&q.logicalHash===proof.logicalHash&&q.artifactsHash===proof.artifactsHash&&q.consumerCoverageAccepted===true&&q.m2hAccepted===true&&HEX.test(q.durabilityDecisionReceiptHash),'QUALIFICATION_REQUIRED');
    return q;
}
function stageSnapshot(root,descriptor,b){
    need(descriptor.version===3&&descriptor.schemaVersion===1&&descriptor.payloadVersion===1&&descriptor.storage==='sqlite-sidecars'&&typeof descriptor.storeId==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(descriptor.storeId)&&descriptor.database===`store-v3/${descriptor.storeId}/index.sqlite`,'UNSUPPORTED_STORE');
    const file=safe(root,descriptor.database);return readDatabase(file,b,db=>{need(db.prepare('PRAGMA journal_mode').get().journal_mode==='delete','UNSUPPORTED_CAPABILITY');return{facts:databaseFacts(db,recoverySchemaHash(),b),artifacts:artifactInventory(db,root,b),database:hashFile(file,b,b.limits.databaseBytes)};});
}
function recoveryControls(r){return[
    {file:'proof.json',local:PRODUCTION_PROOF,hash:r.descriptor.production.proofHash,max:16384},
    {file:'qualification.json',local:'production-qualification.json',hash:r.proof.qualificationHash,max:1048576},
    {file:'inventory.json',local:'production-source-inventory.json',hash:r.proof.inventoryHash,max:1048576},
];}
function verifyRecoveryControls(r,backupRoot,b,restoredRoot){
    const intent=pinned(path.join(backupRoot,'production-recovery-intent.json'),r.intentHash,b);
    need(equal(intent,{version:1,projectRoot:r.projectRoot,backupRoot,destination:r.destination,descriptorHash:digest(r.descriptor),releaseHash:r.releaseHash,limits:r.limits}),'CHANGED_BINDING');
    const expected=recoveryControls(r);need(Array.isArray(r.controls)&&r.controls.length===expected.length,'CHANGED_BINDING');
    for(const [i,c]of expected.entries()){
        const row=r.controls[i];need(row&&Object.keys(row).sort().join()==='bytes,file,hash'&&row.file===c.file&&row.hash===c.hash,'CHANGED_BINDING');
        need(equal(hashFile(safe(backupRoot,c.file),b,c.max),{bytes:row.bytes,hash:c.hash}),'INVALID_ARTIFACT');
        if(restoredRoot)need(equal(hashFile(safe(restoredRoot,c.local),b,c.max),{bytes:row.bytes,hash:c.hash}),'CHANGED_BINDING');
    }
}
function emptyDirectory(root){const directory=fs.opendirSync(canonicalDirectory(root));let primary;try{return directory.readSync()===null;}catch(e){primary=e;throw e;}finally{try{directory.closeSync();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Directory and close',{cause:primary});else throw e;}}}
function freshRecoveryProject(root){const directory=fs.opendirSync(canonicalDirectory(root));let primary;try{need(directory.readSync()?.name==='replay_logs'&&directory.readSync()===null,'DESTINATION_NOT_EMPTY');}catch(e){primary=e;throw e;}finally{try{directory.closeSync();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Directory and close',{cause:primary});else throw e;}}need(emptyDirectory(dataRoot(root)),'DESTINATION_NOT_EMPTY');}
function compareMigrationCopy(root,source,d,proofHash,releaseHash,b){
    const expectedReceipt=JSON.stringify({productionProofHash:proofHash,releaseHash});
    // Only the explicitly journaled administrative receipt may differ from the
    // converted copy. Compare every other typed cell, row and ordering exactly.
    readDatabase(safe(source,d.database),b,a=>readDatabase(safe(root,d.database),b,c=>{
        databaseFacts(a,recoverySchemaHash(),b);databaseFacts(c,recoverySchemaHash(),b);
        let rows=0;
        for(const table of a.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name LIMIT 65").all()){
            need(/^[a-z_]+$/.test(table.name),'UNSUPPORTED_CAPABILITY');
            const pk=a.prepare(`PRAGMA table_xinfo(${table.name})`).all().filter(v=>v.pk).sort((x,y)=>x.pk-y.pk).map(v=>v.name);need(pk.length,'UNSUPPORTED_CAPABILITY');
            const query=`SELECT * FROM ${table.name} ORDER BY ${pk.join(',')}`,x=a.prepare(query),y=c.prepare(query);x.setReadBigInts(true);y.setReadBigInts(true);
            const left=x.iterate(),right=y.iterate();
            for(;;){b.charge();const l=left.next(),r=right.next();need(l.done===r.done,'CHANGED_DESTINATION');if(l.done)break;need(++rows<=b.limits.rows,'RESOURCE_LIMIT');
                if(table.name==='store_meta'){need(r.value.receipt===l.value.receipt||r.value.receipt===expectedReceipt,'CHANGED_DESTINATION');r.value.receipt=l.value.receipt;}
                const encode=v=>JSON.stringify(Object.entries(v).map(([k,v])=>[k,typeof v,typeof v==='bigint'?v.toString():v]));need(encode(l.value)===encode(r.value),'CHANGED_DESTINATION');
            }
        }
    }));
}
function stripDescriptor(d){return{version:3,storage:'sqlite-sidecars',schemaVersion:1,payloadVersion:1,storeId:d.storeId,database:d.database};}
async function controls(root,d,s,b,fault){
    // The sticky fence precedes the sole activation point. A crash/mismatch
    // blocks ordinary access; repeating this exact operation can finish it.
    const expected={...s,limits:b.limits,phase:'active',descriptorHash:digest(d)};
    const ready={...expected,phase:'publishing'};
    await writeRecoveryControl(path.join(root,PRODUCTION_STATE),ready,b,{replace:present(path.join(root,PRODUCTION_STATE))});await fault('before-descriptor');
    await writeRecoveryControl(path.join(root,'manifest.json'),d,b,{replace:true});await fault('after-descriptor');
    await writeRecoveryControl(path.join(root,PRODUCTION_STATE),expected,b,{replace:true});await fault('after-activation');
}
function sealDatabase(root,d,proofHash,releaseHash,b){
    const file=safe(root,d.database);readDatabase(file,b,db=>databaseFacts(db,recoverySchemaHash(),b));
    const db=new DatabaseSync(file);let primary;
    try{db.exec('PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA mmap_size=0; PRAGMA cache_size=-8192; PRAGMA busy_timeout=5000;');
        for(const [key,value]of Object.entries({journal_mode:'delete',synchronous:2,foreign_keys:1,mmap_size:0,cache_size:-8192,busy_timeout:5000}))need(Object.values(db.prepare(`PRAGMA ${key}`).get())[0]===value,'UNSUPPORTED_CAPABILITY');db.exec('BEGIN IMMEDIATE');
        db.prepare('UPDATE store_meta SET receipt=? WHERE store_id=?').run(JSON.stringify({productionProofHash:proofHash,releaseHash}),d.storeId);db.exec('COMMIT');
    }catch(e){primary=e;try{if(db.isTransaction)db.exec('ROLLBACK');}catch(cleanup){withCleanup(e,cleanup);}throw e;}
    finally{try{db.close();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Seal and close',{cause:primary});else throw e;}}
    const fd=fs.openSync(file,'r');try{fs.fsyncSync(fd);}catch(e){primary=e;throw e;}finally{close(fd,primary);}syncDirectory(path.dirname(file));
}

export async function prepareProductionCutover(input){const o=request(input,['proof','proofSha256']);const proof=pinned(o.proof,o.proofSha256,o.b);approval(o,'prepare',o.proofSha256);
    need(proof.version===1&&proof.scope==='production-migration-proof-v1'&&proof.projectRoot===o.projectRoot&&proof.preservationVerified===true&&proof.requiredConsumersQualified===true&&proof.m2hAccepted===true,'QUALIFICATION_REQUIRED');
    const root=dataRoot(o.projectRoot);separate(o.projectRoot,proof.stageRoot,proof.backupRoot,proof.restoreRoot);release(proof,o.b);qualification(proof,o.b);const files=inventory(proof,o.b);
    need(Array.isArray(proof.cacheRoots)&&proof.cacheRoots.length<=8,'INVALID_ARGUMENT');for(const cache of proof.cacheRoots)separate(root,cache);
    return locked(o,async()=>{
        const existing=present(path.join(root,PRODUCTION_STATE))?state(root,o.b):null;
        need(!existing||existing.proofHash===o.proofSha256&&existing.phase==='prepared','RECOVERY_REQUIRED');
        verifyFiles(root,files,o.b);verifyFiles(proof.backupRoot,files,o.b);verifyFiles(proof.restoreRoot,files,o.b);
        const raw=readControl(path.join(proof.stageRoot,'manifest.json'),o.b).value,snapshot=stageSnapshot(proof.stageRoot,raw,o.b);
        need(snapshot.facts.logicalHash===proof.logicalHash&&digest(snapshot.artifacts)===proof.artifactsHash,'PRESERVATION_REQUIRED');
        const sourceManifest=files.find(f=>f.path==='manifest.json');
        readDatabase(safe(proof.stageRoot,raw.database),o.b,db=>{
            const row=db.prepare("SELECT value,payload_pointer FROM properties WHERE owner_kind='root' AND owner_key='root' AND pointer='/boundedFixtureConversionV1'").get();
            need(row&&row.value!==null&&row.payload_pointer===null,'INVALID_CHECKPOINT');const cp=JSON.parse(row.value);
            need(cp.phase==='verified'&&cp.storeId===raw.storeId&&cp.current===null&&cp.identity?.sourceHash?.expectedHash===sourceManifest.hash&&cp.identity?.sourceHash?.expectedBytes===sourceManifest.bytes,'INVALID_CHECKPOINT');
        });
        const originals=snapshot.artifacts.files.filter(f=>!f.path.startsWith('store-v3/'));
        need(files.length===originals.length+1&&originals.every(f=>files.some(s=>equal(s,f))),'INVALID_INVENTORY');
        const d={...stripDescriptor(raw),production:{scope:'production-authority-v1',projectRoot:o.projectRoot,mode:'read-only',epoch:0,proofHash:o.proofSha256,releaseHash:proof.releaseHash,schemaHash:recoverySchemaHash()}};
        const intent={version:1,projectRoot:o.projectRoot,storeId:d.storeId,proofHash:o.proofSha256,releaseHash:proof.releaseHash,descriptor:d,limits:o.b.limits,phase:'prepared'};
        if(existing)need(equal(existing,intent),'CHANGED_BINDING');else exclusiveControl(path.join(root,PRODUCTION_STATE),intent,o.b);
        const originalProof=hashFile(o.proof,o.b,16384);need(originalProof.hash===o.proofSha256,'CHANGED_BINDING');await copyFile(o.proof,path.join(root,PRODUCTION_PROOF),originalProof,o.b,16384);
        for(const [source,name,pin]of [[proof.qualification,'production-qualification.json',proof.qualificationHash],[proof.inventory,'production-source-inventory.json',proof.inventoryHash]]){const found=hashFile(source,o.b,o.b.limits.controlBytes);need(found.hash===pin,'CHANGED_BINDING');await copyFile(source,path.join(root,name),found,o.b,o.b.limits.controlBytes);}
        for(const f of [{path:d.database,...snapshot.database},...snapshot.artifacts.files]){await copyFile(safe(proof.stageRoot,f.path),safe(root,f.path,true),{bytes:f.bytes,hash:f.hash},o.b,o.b.limits.artifactBytes);await o.fault('after-stage-copy');}
        need(equal(stageSnapshot(proof.stageRoot,raw,o.b),snapshot),'CHANGED_SOURCE');verifyFiles(root,files,o.b);return{phase:'prepared',proofHash:o.proofSha256,descriptor:d,metrics:o.b.metrics()};
    });
}
export async function cutoverProduction(input){const o=request(input,[]),root=dataRoot(o.projectRoot),s=state(root,o.b);approval(o,'cutover',s.proofHash);
    return locked(o,async()=>{const current=state(root,o.b);need(equal(current,s)&&equal(s.limits,o.b.limits),'CHANGED_BINDING');
        if(s.phase==='active'){need(productionSelection(o.projectRoot)?.descriptor.production.mode==='read-only','WRITE_FENCED');return{phase:'active',repeated:true};}
        need(['prepared','publishing'].includes(s.phase),'RECOVERY_REQUIRED');const proof=pinned(path.join(root,PRODUCTION_PROOF),s.proofHash,o.b);release(proof,o.b);const q=qualification(proof,o.b);need(q.durabilityDecisionReceiptHash===approval(o,'cutover',s.proofHash).durability.decisionReceiptHash,'DURABILITY_REQUIRED');
        const files=inventory(proof,o.b),manifest=files.find(f=>f.path==='manifest.json');
        const descriptor=s.descriptor??readControl(path.join(root,'cutover-intent.json'),o.b).value.descriptor;
        const raw=readControl(path.join(proof.stageRoot,'manifest.json'),o.b).value,stage=stageSnapshot(proof.stageRoot,raw,o.b);
        need(stage.facts.logicalHash===proof.logicalHash&&digest(stage.artifacts)===proof.artifactsHash&&equal(stripDescriptor(raw),stripDescriptor(descriptor)),'CHANGED_SOURCE');
        compareMigrationCopy(root,proof.stageRoot,descriptor,s.proofHash,s.releaseHash,o.b);
        need(digest(stageSnapshot(root,descriptor,o.b).artifacts)===proof.artifactsHash,'INVALID_ARTIFACT');
        // A retained exact manifest is the pre-write recovery source. Publication
        // recovery recognizes only the two exact old/new byte identities.
        const frozen=path.join(root,'production-v2-frozen.json');
        if(!present(frozen)){need(equal(hashFile(path.join(root,'manifest.json'),o.b,o.b.limits.artifactBytes),{bytes:manifest.bytes,hash:manifest.hash}),'CHANGED_SOURCE');await copyFile(path.join(root,'manifest.json'),frozen,{bytes:manifest.bytes,hash:manifest.hash},o.b,o.b.limits.artifactBytes);}
        need(equal(hashFile(frozen,o.b,o.b.limits.artifactBytes),{bytes:manifest.bytes,hash:manifest.hash}),'CHANGED_SOURCE');
        const currentManifest=hashFile(path.join(root,'manifest.json'),o.b,o.b.limits.artifactBytes);need(currentManifest.hash===manifest.hash||currentManifest.hash===digest(descriptor),'CHANGED_SOURCE');
        verifyFiles(root,files.filter(f=>f.path!=='manifest.json'),o.b);verifyFiles(proof.backupRoot,files,o.b);verifyFiles(proof.restoreRoot,files,o.b);
        exclusiveControl(path.join(root,'cutover-intent.json'),{descriptor,proofHash:s.proofHash},o.b);
        sealDatabase(root,descriptor,s.proofHash,s.releaseHash,o.b);await o.fault('after-database-seal');
        await controls(root,descriptor,{version:1,projectRoot:o.projectRoot,storeId:s.storeId,proofHash:s.proofHash,releaseHash:s.releaseHash},o.b,o.fault);
        return{phase:'active',mode:'read-only',descriptorHash:digest(descriptor),metrics:o.b.metrics()};
    });
}
export async function enableProductionWrites(input){const o=request(input,[]),root=dataRoot(o.projectRoot);
    return locked(o,async()=>{const s=state(root,o.b),intentFile=path.join(root,'production-write-intent.json');let d,subject;
        if(s.phase==='publishing'){
            const intent=readControl(intentFile,o.b).value;need(intent.projectRoot===o.projectRoot&&equal(intent.limits,o.b.limits)&&equal(intent.next.production,{...intent.before.production,mode:'read-write',epoch:intent.before.production.epoch+1}),'CHANGED_BINDING');
            const actual=readControl(path.join(root,'manifest.json'),o.b);need([digest(intent.before),digest(intent.next)].includes(actual.hash),'CHANGED_AUTHORITY');d=intent.next;subject=digest(intent.before);
        }else{const now=productionSelection(o.projectRoot);need(now,'AUTHORITY_REQUIRED');subject=now.descriptorHash;
            if(now.descriptor.production.mode==='read-write'){approval(o,'enable-writes',subject);return{phase:'active',mode:'read-write',repeated:true,descriptorHash:subject};}
            d={...now.descriptor,production:{...now.descriptor.production,mode:'read-write',epoch:now.descriptor.production.epoch+1}};
            need(Number.isSafeInteger(d.production.epoch),'RESOURCE_LIMIT');approval(o,'enable-writes',subject);exclusiveControl(intentFile,{projectRoot:o.projectRoot,before:now.descriptor,next:d,limits:o.b.limits},o.b);
        }
        approval(o,'enable-writes',subject);const proof=pinned(path.join(root,PRODUCTION_PROOF),d.production.proofHash,o.b);release(proof,o.b);need(Number.isSafeInteger(d.production.epoch),'RESOURCE_LIMIT');
        await controls(root,d,{version:1,projectRoot:o.projectRoot,storeId:d.storeId,proofHash:d.production.proofHash,releaseHash:d.production.releaseHash},o.b,o.fault);return{phase:'active',mode:'read-write',descriptorHash:digest(d)};
    });
}
export async function rollbackProductionBeforeWrites(input){const o=request(input,[]),root=dataRoot(o.projectRoot);
    return locked(o,async()=>{
        const s=state(root,o.b),intent=readControl(path.join(root,'cutover-intent.json'),o.b).value,d=intent.descriptor;
        need(['active','returning-v2'].includes(s.phase)&&s.descriptorHash===digest(d)&&d.production.mode==='read-only','WRITE_FENCED');need(equal(s.limits,o.b.limits),'CHANGED_BINDING');approval(o,'rollback-before-writes',s.descriptorHash);
        const proof=pinned(path.join(root,PRODUCTION_PROOF),s.proofHash,o.b);release(proof,o.b);
        compareMigrationCopy(root,proof.stageRoot,d,s.proofHash,s.releaseHash,o.b);need(digest(stageSnapshot(root,d,o.b).artifacts)===proof.artifactsHash,'CHANGED_SOURCE');
        const manifest=inventory(proof,o.b).find(f=>f.path==='manifest.json'),frozen=path.join(root,'production-v2-frozen.json');need(equal(hashFile(frozen,o.b,629145600),{bytes:manifest.bytes,hash:manifest.hash}),'CHANGED_SOURCE');
        // This is deliberately not a production-sized JSON rollback promise.
        // Only a small, actually parsed legacy endpoint is selectable. Larger
        // stores must use compatible-release SQLite recovery, even pre-write.
        need(manifest.bytes<=o.b.limits.controlBytes,'UNSUPPORTED_ROLLBACK');const legacy=readControl(frozen,o.b).value;need(legacy.version===2&&Array.isArray(legacy.maps)&&Array.isArray(legacy.replays)&&Array.isArray(legacy.records),'UNSUPPORTED_ROLLBACK');
        const active=hashFile(path.join(root,'manifest.json'),o.b,629145600);need(active.hash===s.descriptorHash||active.hash===manifest.hash,'CHANGED_AUTHORITY');
        await writeRecoveryControl(path.join(root,PRODUCTION_STATE),{...s,phase:'returning-v2'},o.b,{replace:true});await o.fault('before-v2-publication');
        const fd=fs.openSync(frozen,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
        async function* chunks(){const buffer=Buffer.alloc(65536);let at=0;while(at<manifest.bytes){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,manifest.bytes-at),at);need(n>0,'CHANGED_INPUT');at+=n;o.b.charge(n);yield buffer.subarray(0,n);}}
        try{need(equal(await publishStream(path.join(root,'manifest.json'),chunks(),o.b,629145600,{replace:true}),{bytes:manifest.bytes,hash:manifest.hash}),'INVALID_ARTIFACT');}catch(e){primary=e;throw e;}finally{close(fd,primary);}
        await o.fault('after-v2-publication');const retained=path.join(root,'production-before-write-rollback.json');need(!present(retained),'DESTINATION_NOT_EMPTY');fs.renameSync(path.join(root,PRODUCTION_STATE),retained);syncDirectory(root);
        return{phase:'v2',retainedDatabase:true,metrics:o.b.metrics()};
    });
}

export async function prepareProductionRecovery(input){const o=request(input,['backupRoot','destination']);const root=dataRoot(o.projectRoot);separate(o.projectRoot,o.backupRoot,o.destination);
    const approved=subject=>{const a=approval(o,'prepare-recovery',subject);need(equal(a.targets,{backupRoot:o.backupRoot,destination:o.destination}),'APPROVAL_REQUIRED');};
    if(state(root,o.b).phase==='recovery-fenced')return locked(o,async()=>{
        const s=state(root,o.b);need(s.phase==='recovery-fenced'&&s.recovery?.backupRoot===o.backupRoot&&s.recovery?.destination===o.destination,'CHANGED_BINDING');approved(s.descriptorHash);
        const r=pinned(path.join(o.backupRoot,'receipt.json'),s.recovery.receiptHash,o.b);need(r.destination===o.destination&&r.projectRoot===o.projectRoot&&digest(r.descriptor)===s.descriptorHash&&equal(r.limits,o.b.limits),'CHANGED_BINDING');release(r.proof,o.b);verifyRecoveryControls(r,o.backupRoot,o.b);
        const source=stageSnapshot(root,r.descriptor,o.b),backup=stageSnapshot(path.join(o.backupRoot,'data'),r.descriptor,o.b);need(equal(source.facts,r.facts)&&equal(source.artifacts,r.artifacts)&&equal(backup.facts,r.facts)&&equal(backup.artifacts,r.artifacts)&&equal(backup.database,r.database),'CHANGED_SOURCE');
        exclusiveControl(path.join(o.backupRoot,'handoff.json'),{source:o.projectRoot,destination:o.destination,receiptHash:s.recovery.receiptHash},o.b);return{phase:'prepared',repeated:true,receiptHash:s.recovery.receiptHash,facts:r.facts};
    });
    const current=productionSelection(o.projectRoot);need(current,'AUTHORITY_REQUIRED');approved(current.descriptorHash);
    return withProductionLock(o.projectRoot,async()=>{
        const selected=productionSelection(o.projectRoot);need(selected?.descriptorHash===current.descriptorHash,'CHANGED_AUTHORITY');release(selected.proof,o.b);
        return productionLease(selected,async()=>{const store=await openStore({root,mode:'write'});let primary;
            try{return await store.withWriter(async w=>{
                const intent={version:1,projectRoot:o.projectRoot,backupRoot:o.backupRoot,destination:o.destination,descriptorHash:selected.descriptorHash,releaseHash:selected.descriptor.production.releaseHash,limits:o.b.limits};
                const intentFile=path.join(o.backupRoot,'production-recovery-intent.json');
                if(!present(intentFile)){need(emptyDirectory(o.backupRoot),'DESTINATION_NOT_EMPTY');freshRecoveryProject(o.destination);}
                exclusiveControl(intentFile,intent,o.b);const intentHash=hashFile(intentFile,o.b,o.b.limits.controlBytes).hash;
                const snapshot=await w.backupRecoverySnapshot({backupRoot:o.backupRoot,b:o.b,fault:o.fault});
                const controls=[];
                for(const c of recoveryControls({descriptor:selected.descriptor,proof:selected.proof})){const found=hashFile(safe(root,c.local),o.b,c.max);need(found.hash===c.hash,'CHANGED_BINDING');await copyFile(safe(root,c.local),safe(o.backupRoot,c.file,true),found,o.b,c.max);controls.push({file:c.file,...found});}
                const binding={version:1,scope:'production-recovery-v1',projectRoot:o.projectRoot,destination:o.destination,releaseHash:selected.descriptor.production.releaseHash,proof:selected.proof,controls,intentHash,...snapshot};
                const receipt=await writeRecoveryControl(path.join(o.backupRoot,'receipt.json'),binding,o.b);
                await o.fault('before-source-fence');await w.verifyRecoverySnapshot({snapshot,b:o.b});
                await writeRecoveryControl(path.join(root,PRODUCTION_STATE),{...state(root,o.b),phase:'recovery-fenced',recovery:{backupRoot:o.backupRoot,destination:o.destination,receiptHash:receipt.hash}},o.b,{replace:true});
                await o.fault('after-source-fence');exclusiveControl(path.join(o.backupRoot,'handoff.json'),{source:o.projectRoot,destination:o.destination,receiptHash:receipt.hash},o.b);
                return{phase:'prepared',receiptHash:receipt.hash,facts:snapshot.facts,metrics:o.b.metrics()};
            });}catch(e){primary=e;throw e;}finally{try{store.close();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Backup and close',{cause:primary});else throw e;}}
        });
    });
}
export async function restoreProductionRecovery(input){const o=request(input,['backupRoot','receiptSha256']);const root=dataRoot(o.projectRoot);separate(root,o.backupRoot);const r=pinned(path.join(o.backupRoot,'receipt.json'),o.receiptSha256,o.b);approval(o,'restore',o.receiptSha256);
    need(r.scope==='production-recovery-v1'&&r.destination===o.projectRoot&&r.releaseHash===r.descriptor.production.releaseHash&&equal(r.limits,o.b.limits),'CHANGED_BINDING');release(r.proof,o.b);verifyRecoveryControls(r,o.backupRoot,o.b);
    const handoff=readControl(path.join(o.backupRoot,'handoff.json'),o.b).value;need(equal(handoff,{source:r.projectRoot,destination:o.projectRoot,receiptHash:o.receiptSha256}),'HANDOFF_REQUIRED');
    const verify=()=>{const snap=stageSnapshot(path.join(o.backupRoot,'data'),r.descriptor,o.b);need(equal(snap.facts,r.facts)&&equal(snap.artifacts,r.artifacts)&&equal(snap.database,r.database),'INVALID_ARTIFACT');};verify();
    return locked(o,async()=>{
        const intent={version:1,phase:'restoring',projectRoot:o.projectRoot,receiptHash:o.receiptSha256,backupRoot:o.backupRoot,limits:o.b.limits};
        if(present(path.join(root,PRODUCTION_STATE))){const s=state(root,o.b);if(s.phase==='active'){
            const selected=productionSelection(o.projectRoot);need(selected?.descriptor.storeId===r.descriptor.storeId&&selected.descriptor.production.proofHash===r.descriptor.production.proofHash,'CHANGED_BINDING');const actual=stageSnapshot(root,r.descriptor,o.b);need(equal(actual.facts,r.facts)&&equal(actual.artifacts,r.artifacts),'CHANGED_DESTINATION');verifyRecoveryControls(r,o.backupRoot,o.b,root);return{phase:'restored',repeated:true};
        }need(equal(s,intent),'CHANGED_BINDING');}else{const dir=fs.opendirSync(root);let primary,n=0;try{for(let e;(e=dir.readSync());){need(++n<=4&&/^\.(?:manifest|authority)\.lock(?:\.[a-f0-9-]{36}\.tmp)?$/.test(e.name),'DESTINATION_NOT_EMPTY');}}catch(e){primary=e;throw e;}finally{try{dir.closeSync();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Directory and close',{cause:primary});else throw e;}}exclusiveControl(path.join(root,PRODUCTION_STATE),intent,o.b);}
        for(const f of [{path:r.descriptor.database,...r.database},...r.artifacts.files]){await copyFile(safe(o.backupRoot,'data/'+f.path),safe(root,f.path,true),{bytes:f.bytes,hash:f.hash},o.b,o.b.limits.artifactBytes);await o.fault('after-restore-copy');}
        const snap=stageSnapshot(root,r.descriptor,o.b);need(equal(snap.facts,r.facts)&&equal(snap.artifacts,r.artifacts),'CHANGED_DESTINATION');verify();
        for(const [i,c]of recoveryControls(r).entries())await copyFile(safe(o.backupRoot,c.file),safe(root,c.local,true),{bytes:r.controls[i].bytes,hash:c.hash},o.b,c.max);
        verifyRecoveryControls(r,o.backupRoot,o.b,root);
        exclusiveControl(path.join(root,'production-restore-receipt.json'),{...intent,descriptor:r.descriptor,facts:r.facts,artifacts:r.artifacts,controls:r.controls},o.b);
        return{phase:'restored',metrics:o.b.metrics()};
    });
}
export async function selectRestoredProduction(input){const o=request(input,[]),root=dataRoot(o.projectRoot),r=readControl(path.join(root,'production-restore-receipt.json'),o.b).value;approval(o,'select-restored',r.receiptHash);
    return locked(o,async()=>{
        need(equal(readControl(path.join(root,'production-restore-receipt.json'),o.b).value,r),'CHANGED_BINDING');
        canonicalDirectory(r.backupRoot);separate(root,r.backupRoot);
        const original=pinned(path.join(r.backupRoot,'receipt.json'),r.receiptHash,o.b);
        need(original.scope==='production-recovery-v1'&&original.destination===o.projectRoot&&equal(original.limits,o.b.limits),'CHANGED_BINDING');
        const expected={version:1,phase:'restoring',projectRoot:o.projectRoot,receiptHash:r.receiptHash,backupRoot:r.backupRoot,limits:o.b.limits,descriptor:original.descriptor,facts:original.facts,artifacts:original.artifacts,controls:original.controls};
        need(equal(r,expected),'CHANGED_BINDING');release(original.proof,o.b);
        verifyRecoveryControls(original,r.backupRoot,o.b,root);
        need(equal(readControl(path.join(r.backupRoot,'handoff.json'),o.b).value,{source:original.projectRoot,destination:o.projectRoot,receiptHash:r.receiptHash}),'HANDOFF_REQUIRED');
        const retained=stageSnapshot(path.join(r.backupRoot,'data'),original.descriptor,o.b);
        need(equal(retained.facts,original.facts)&&equal(retained.artifacts,original.artifacts)&&equal(retained.database,original.database),'INVALID_ARTIFACT');
        need(readControl(path.join(root,PRODUCTION_PROOF),o.b).hash===original.descriptor.production.proofHash,'CHANGED_BINDING');
        const snap=stageSnapshot(root,r.descriptor,o.b);need(equal(snap.facts,r.facts)&&equal(snap.artifacts,r.artifacts),'CHANGED_DESTINATION');
        const p=r.descriptor.production,d={...r.descriptor,production:{...p,projectRoot:o.projectRoot,mode:'read-only',epoch:p.epoch+1}};need(Number.isSafeInteger(d.production.epoch),'RESOURCE_LIMIT');
        if(state(root,o.b).phase==='active'){need(equal(productionSelection(o.projectRoot)?.descriptor,d),'CHANGED_AUTHORITY');return{phase:'selected',repeated:true,descriptorHash:digest(d)};}
        await controls(root,d,{version:1,projectRoot:o.projectRoot,storeId:d.storeId,proofHash:p.proofHash,releaseHash:p.releaseHash},o.b,o.fault);
        return{phase:'selected',mode:'read-only',descriptorHash:digest(d)};
    });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const actions={prepare:prepareProductionCutover,cutover:cutoverProduction,'enable-writes':enableProductionWrites,'rollback-before-writes':rollbackProductionBeforeWrites,'prepare-recovery':prepareProductionRecovery,restore:restoreProductionRecovery,'select-restored':selectRestoredProduction};
    try{const [action,file,pin]=process.argv.slice(2);need(process.argv.length===5&&actions[action],'INVALID_ARGUMENT');const b=recoveryBudget();console.log(JSON.stringify(await actions[action](pinned(file,pin,b))));}
    catch(e){console.error(JSON.stringify({code:e.code??'ADMIN_FAILED',message:e.message,cleanupFailures:e.cleanupFailures}));process.exitCode=1;}
}

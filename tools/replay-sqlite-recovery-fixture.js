// Explicit isolated SQLite restore; the backup package is its only data source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {resident,withCleanup} from './retrieval-files.js';
import {openStore,openRehearsalStore,withFixtureAuthorityLock,withRehearsalAuthorityLock,recoverySchemaHash} from './replay-store.js';
import {authorizeRehearsalLineage,rehearsalLineage,rehearsalOperationRoot,validateRehearsalLineage,REHEARSAL_MARKER,REHEARSAL_LINEAGE} from './replay-rehearsal-scope.js';
import {AUTHORITY_FILE,MEMBER_FILE,authorityControl,authorityLease,authorityHash} from './replay-authority-guard.js';
import {runSyntheticAuthorityCommand} from './replay-authority-fixture.js';
import {hashFile,syncDirectory} from './replay-authority-export.js';
import {need,equal,digest,options,recoveryBudget,safe,readControl,exclusiveControl,copyFile,readDatabase,databaseFacts,artifactInventory,writeRecoveryControl} from './replay-sqlite-recovery-data.js';

const sourcePrefix='pain-gain-store-v3-fixture-',backupPrefix='pain-gain-sqlite-backup-fixture-';
const controlNames=[['descriptor.json','manifest.json'],['marker.json','.storage-v3-fixture'],['selector.json',AUTHORITY_FILE]];
function names(o){return o.rehearsal?[controlNames[0],['marker.json',REHEARSAL_MARKER],controlNames[2],['lineage.json',REHEARSAL_LINEAGE]]:controlNames;}
function checkControls(controls,o){const selected=names(o);need(Array.isArray(controls)&&controls.length===selected.length,'CHANGED_BINDING');controls.forEach((c,i)=>need(c&&equal(Object.keys(c).sort(),['bytes','file','hash','name'])&&c.name===selected[i][0]&&c.file===selected[i][1]&&Number.isSafeInteger(c.bytes)&&c.bytes>=0&&c.bytes<=16384&&typeof c.hash==='string'&&/^[a-f0-9]{64}$/.test(c.hash),'CHANGED_BINDING'));return controls;}
function root(value,prefix){need(typeof value==='string'&&path.isAbsolute(value)&&path.resolve(value)===value&&path.dirname(value)===fs.realpathSync(os.tmpdir())&&path.basename(value).startsWith(prefix),'UNSAFE_PATH');resident(value,true);need(fs.realpathSync(value)===value,'UNSAFE_PATH');return value;}
function request(input,keys){const o={...options(input,['synthetic','rehearsal','releaseHash','limits','fault',...keys])};
    if(Object.hasOwn(o,'rehearsal')){need(!Object.hasOwn(o,'synthetic'),'INVALID_ARGUMENT');const r=options(o.rehearsal,['lineageHash']);need(typeof r.lineageHash==='string'&&/^[a-f0-9]{64}$/.test(r.lineageHash),'INVALID_ARGUMENT');o.rehearsal=Object.freeze(r);}else need(o.synthetic===true,'INVALID_ARGUMENT');
    need(typeof o.releaseHash==='string'&&/^[a-f0-9]{64}$/.test(o.releaseHash),'INVALID_ARGUMENT');need(o.fault===undefined||typeof o.fault==='function','INVALID_ARGUMENT');const b=recoveryBudget(o.limits);
    const release=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../release.json');need(hashFile(release,b,1048576).hash===o.releaseHash,'RELEASE_MISMATCH');return{...o,b,fault:o.fault??(()=>{})};}
function empty(rootPath){const d=fs.opendirSync(rootPath);let primary;try{return d.readSync()===null;}catch(e){primary=e;throw e;}finally{try{d.closeSync();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else throw e;}}}
function bootstrapOnly(rootPath,o){const d=fs.opendirSync(rootPath);let primary;try{const allowed=o.rehearsal?[REHEARSAL_MARKER,REHEARSAL_LINEAGE]:['.storage-v3-fixture'];let n=0,e;while((e=d.readSync()))if(++n>allowed.length||!allowed.includes(e.name))return false;return n>0;}catch(e){primary=e;throw e;}finally{try{d.closeSync();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else throw e;}}}
const scopeName=o=>o.rehearsal?'rehearsal-sqlite-recovery-v1':'synthetic-sqlite-recovery-v1';
const authorityScope=o=>o.rehearsal?'rehearsal-authority-v1':'synthetic-authority-v1';
const markerName=o=>o.rehearsal?REHEARSAL_MARKER:'.storage-v3-fixture';
function scopedRoot(o,value,role){return o.rehearsal?rehearsalOperationRoot(value,o.lineage.binding.origin,role):root(value,role==='backup'?backupPrefix:sourcePrefix);}
function accessScope(o,value){return o.rehearsal?authorizeRehearsalLineage({root:value,lineageHash:o.rehearsal.lineageHash}):null;}
function lock(o,value,fn){return o.rehearsal?withRehearsalAuthorityLock(accessScope(o,value),fn):withFixtureAuthorityLock(value,fn);}
async function using(rootPath,fn,o){const s=o.rehearsal?await openRehearsalStore(accessScope(o,rootPath),'write'):await openStore({root:rootPath,mode:'write'});let primary;try{return await fn(s);}catch(e){primary=e;throw e;}finally{try{s.close();}catch(e){if(primary instanceof Error)withCleanup(primary,e);else throw e;}}}
function packageReceipt(o){
    if(o.rehearsal){const origin=path.dirname(o.backupRoot)===fs.realpathSync(os.tmpdir())?'synthetic-backup':'verified-backup';rehearsalOperationRoot(o.backupRoot,origin,'backup');const l=readControl(safe(o.backupRoot,'controls/lineage.json'),o.b);need(l.hash===o.rehearsal.lineageHash,'CHANGED_BINDING');o.lineage=validateRehearsalLineage(l.value);}
    scopedRoot(o,o.backupRoot,'backup');const receipt=readControl(path.join(o.backupRoot,'receipt.json'),o.b),r=receipt.value;
    need(typeof o.receiptHash==='string'&&/^[a-f0-9]{64}$/.test(o.receiptHash)&&receipt.hash===o.receiptHash,'SNAPSHOT_MISMATCH');
    need(r.version===1&&r.scope===scopeName(o)&&r.productionAuthority===false&&r.releaseHash===o.releaseHash&&r.destination===o.destination&&equal(r.limits,o.b.limits),'CHANGED_BINDING');
    scopedRoot(o,r.destination,'restore');need(r.destination!==r.source&&r.destination!==o.backupRoot,'UNSAFE_PATH');
    const binding=readControl(path.join(o.backupRoot,'binding.json'),o.b);need(binding.hash===r.bindingHash&&binding.value.source===r.source&&binding.value.destination===r.destination&&binding.value.releaseHash===r.releaseHash,'CHANGED_BINDING');
    for(const c of checkControls(binding.value.controls,o))need(equal(hashFile(safe(o.backupRoot,'controls/'+c.name),o.b,16384),{bytes:c.bytes,hash:c.hash}),'INVALID_ARTIFACT');
    need(equal(binding.value.descriptor,r.descriptor)&&r.facts.schemaHash===recoverySchemaHash(),'UNSUPPORTED_CAPABILITY');
    if(o.rehearsal)need(r.lineageHash===o.rehearsal.lineageHash&&binding.value.lineageHash===r.lineageHash&&equal(r.descriptor.rehearsal,o.lineage.binding)&&r.facts.storeId===o.lineage.storeId&&binding.value.originalSelector.lineageHash===r.lineageHash,'CHANGED_BINDING');
    const handoff=readControl(path.join(o.backupRoot,'handoff.json'),o.b).value;need(equal(handoff,{version:1,receiptHash:receipt.hash,releaseHash:o.releaseHash,destination:r.destination,source:r.source,storeId:r.facts.storeId,fenceHash:r.fenceHash}),'HANDOFF_REQUIRED');
    return{receipt,r,binding:binding.value};
}
function verifyPackage(o,parts){const{r}=parts,database=safe(o.backupRoot,'data/'+r.descriptor.database);need(equal(hashFile(database,o.b,o.b.limits.databaseBytes),r.database),'INVALID_ARTIFACT');
    readDatabase(database,o.b,db=>{need(equal(databaseFacts(db,recoverySchemaHash(),o.b),r.facts),'CHANGED_DESTINATION');need(equal(artifactInventory(db,path.join(o.backupRoot,'data'),o.b),r.artifacts),'INVALID_ARTIFACT');});}

export async function prepareSqliteRecovery(input){const o=request(input,['root','backupRoot','destination']);if(o.rehearsal)o.lineage=rehearsalLineage(accessScope(o,o.root));scopedRoot(o,o.root,'store');scopedRoot(o,o.backupRoot,'backup');scopedRoot(o,o.destination,'restore');need(new Set([o.root,o.backupRoot,o.destination]).size===3,'UNSAFE_PATH');
    return lock(o,o.root,async()=>{const current=authorityControl(path.join(o.root,AUTHORITY_FILE)),s=current.value;
        need(s.scope===authorityScope(o)&&s.productionAuthority===false&&['sqlite','sqlite-recovery-fenced'].includes(s.backend)&&s.target===o.root,'AUTHORITY_CONFLICT');
        const descriptor=authorityControl(path.join(o.root,'manifest.json')),marker=authorityControl(path.join(o.root,markerName(o))).value;need(descriptor.hash===s.descriptorHash&&descriptor.value.storeId===s.storeId&&marker.root===o.root&&marker.storeId===s.storeId,'AUTHORITY_CONFLICT');
        if(o.rehearsal)need(s.lineageHash===o.rehearsal.lineageHash&&descriptor.hash===o.lineage.descriptorHash&&s.storeId===o.lineage.storeId&&equal(descriptor.value.rehearsal,o.lineage.binding)&&equal(marker.rehearsal,o.lineage.binding),'CHANGED_BINDING');
        need(equal(authorityControl(path.join(o.root,MEMBER_FILE)).value,{anchor:o.root,storeId:s.storeId,productionAuthority:false}),'AUTHORITY_CONFLICT');
        const bindingFile=path.join(o.backupRoot,'binding.json');let original=s;
        if(s.backend==='sqlite-recovery-fenced'){need(s.recovery?.backupRoot===o.backupRoot&&s.recovery.destination===o.destination&&s.recovery.releaseHash===o.releaseHash,'CHANGED_BINDING');original=readControl(bindingFile,o.b).value.originalSelector;}
        if(!fs.existsSync(bindingFile))need(empty(o.backupRoot)&&empty(o.destination),'DESTINATION_NOT_EMPTY');
        const controls=checkControls(fs.existsSync(bindingFile)?readControl(bindingFile,o.b).value.controls:names(o).map(([name,file])=>({name,file,...hashFile(path.join(o.root,file),o.b,16384)})),o);
        const lineage=o.rehearsal?{lineageHash:o.rehearsal.lineageHash}:{};
        const binding={version:1,source:o.root,destination:o.destination,releaseHash:o.releaseHash,descriptor:descriptor.value,marker,originalSelector:original,controls,limits:o.b.limits,...lineage};exclusiveControl(bindingFile,binding,o.b);const bindingHash=readControl(bindingFile,o.b).hash;
        for(const c of controls){const target=safe(o.backupRoot,'controls/'+c.name,true),expected={bytes:c.bytes,hash:c.hash};if(s.backend==='sqlite-recovery-fenced')need(equal(hashFile(target,o.b,16384),expected),'INVALID_ARTIFACT');else await copyFile(path.join(o.root,c.file),target,expected,o.b,16384);}
        return authorityLease(o.root,{...s,backend:'sqlite'},current.hash,()=>using(o.root,store=>store.withWriter(async w=>{
            const snapshot=await w.backupRecoverySnapshot({backupRoot:o.backupRoot,b:o.b,fault:o.fault});
            const base={version:1,scope:scopeName(o),productionAuthority:false,releaseHash:o.releaseHash,destination:o.destination,bindingHash,...snapshot,...lineage};
            // The source fence binds the package intent, avoiding a circular receipt hash.
            const fence={...original,backend:'sqlite-recovery-fenced',recovery:{backupRoot:o.backupRoot,destination:o.destination,releaseHash:o.releaseHash,snapshotHash:digest(base)}};
            const fenceHash=authorityHash(JSON.stringify(fence));const r={...base,fenceHash};
            await o.fault('before-source-fence');await w.verifyRecoverySnapshot({snapshot,b:o.b});need(authorityControl(path.join(o.root,AUTHORITY_FILE)).hash===current.hash,'AUTHORITY_CONFLICT');
            const receipt=await writeRecoveryControl(path.join(o.backupRoot,'receipt.json'),r,o.b);
            if(s.backend==='sqlite-recovery-fenced')need(equal(s,fence),'CHANGED_BINDING');else await writeRecoveryControl(path.join(o.root,AUTHORITY_FILE),fence,o.b,{replace:true});
            await o.fault('after-source-fence');exclusiveControl(path.join(o.backupRoot,'handoff.json'),{version:1,receiptHash:receipt.hash,releaseHash:o.releaseHash,destination:o.destination,source:o.root,storeId:s.storeId,fenceHash},o.b);
            return{phase:'prepared',backupRoot:o.backupRoot,destination:o.destination,receiptHash:receipt.hash,facts:snapshot.facts,artifacts:snapshot.artifacts.files.length,metrics:o.b.metrics()};
        }),o));
    });
}
function restoredFacts(o,r){const file=safe(o.destination,r.descriptor.database);need(equal(hashFile(file,o.b,o.b.limits.databaseBytes),r.database),'CHANGED_DESTINATION');readDatabase(file,o.b,db=>{need(equal(databaseFacts(db,recoverySchemaHash(),o.b),r.facts),'CHANGED_DESTINATION');need(equal(artifactInventory(db,o.destination,o.b),r.artifacts),'CHANGED_DESTINATION');});}
function restoreIntent(o,parts){return{version:1,productionAuthority:false,releaseHash:o.releaseHash,backupRoot:o.backupRoot,destination:o.destination,receiptHash:parts.receipt.hash,storeId:parts.r.facts.storeId,limits:o.b.limits,...(o.rehearsal?{lineageHash:o.rehearsal.lineageHash}:{})};}
export async function restoreSqliteRecovery(input){const o=request(input,['backupRoot','destination','receiptHash']);if(!o.rehearsal)root(o.destination,sourcePrefix);const parts=packageReceipt(o),{r,binding}=parts;verifyPackage(o,parts);
    const marker=path.join(o.destination,markerName(o));if(!fs.existsSync(path.join(o.destination,'sqlite-restore-intent.json')))need(empty(o.destination)||bootstrapOnly(o.destination,o),'DESTINATION_NOT_EMPTY');
    if(o.rehearsal)await copyFile(safe(o.backupRoot,'controls/lineage.json'),path.join(o.destination,REHEARSAL_LINEAGE),hashFile(safe(o.backupRoot,'controls/lineage.json'),o.b,16384),o.b,16384);
    exclusiveControl(marker,{...binding.marker,root:o.destination},o.b);
    return lock(o,o.destination,async()=>{exclusiveControl(path.join(o.destination,'sqlite-restore-intent.json'),restoreIntent(o,parts),o.b);exclusiveControl(path.join(o.destination,MEMBER_FILE),{anchor:o.destination,storeId:r.facts.storeId,productionAuthority:false},o.b);
        if(fs.existsSync(path.join(o.destination,AUTHORITY_FILE))){need(equal(readControl(path.join(o.destination,'sqlite-restore-receipt.json'),o.b).value,restoreIntent(o,parts)),'CHANGED_BINDING');restoredFacts(o,r);return{phase:'restored',repeated:true,metrics:o.b.metrics()};}
        await o.fault('before-restore-copy');await copyFile(safe(o.backupRoot,'data/'+r.descriptor.database),safe(o.destination,r.descriptor.database,true),r.database,o.b,o.b.limits.databaseBytes);await o.fault('after-restore-database');
        for(const f of r.artifacts.files){await copyFile(safe(o.backupRoot,'data/'+f.path),safe(o.destination,f.path,true),{bytes:f.bytes,hash:f.hash},o.b,o.b.limits.artifactBytes);await o.fault('after-restore-artifact');}
        if(o.rehearsal){const c=binding.controls.find(c=>c.name==='descriptor.json');await copyFile(safe(o.backupRoot,'controls/descriptor.json'),path.join(o.destination,'manifest.json'),{bytes:c.bytes,hash:c.hash},o.b,16384);}
        else exclusiveControl(path.join(o.destination,'manifest.json'),r.descriptor,o.b);
        restoredFacts(o,r);verifyPackage(o,parts);await o.fault('before-restore-receipt');exclusiveControl(path.join(o.destination,'sqlite-restore-receipt.json'),restoreIntent(o,parts),o.b);syncDirectory(o.destination);
        return{phase:'restored',facts:r.facts,metrics:o.b.metrics()};
    });
}
export async function selectRestoredSqliteAuthority(input){const o=request(input,['backupRoot','destination','receiptHash']);if(!o.rehearsal)root(o.destination,sourcePrefix);const parts=packageReceipt(o),{r}=parts;verifyPackage(o,parts);
    return lock(o,o.destination,async()=>{need(equal(readControl(path.join(o.destination,'sqlite-restore-receipt.json'),o.b).value,restoreIntent(o,parts))&&equal(readControl(path.join(o.destination,'sqlite-restore-intent.json'),o.b).value,restoreIntent(o,parts)),'CHANGED_BINDING');
        if(o.rehearsal)need(equal(authorityControl(path.join(o.destination,REHEARSAL_MARKER)).value,{...parts.binding.marker,root:o.destination}),'CHANGED_BINDING');
        const descriptor=authorityControl(path.join(o.destination,'manifest.json'));need(equal(descriptor.value,r.descriptor),'CHANGED_BINDING');need(equal(authorityControl(path.join(o.destination,MEMBER_FILE)).value,{anchor:o.destination,storeId:r.facts.storeId,productionAuthority:false}),'CHANGED_BINDING');
        const selected={scope:authorityScope(o),productionAuthority:false,storeId:r.facts.storeId,descriptorHash:descriptor.hash,backend:'sqlite',target:o.destination,epoch:0,rollback:null,...(o.rehearsal?{lineageHash:o.rehearsal.lineageHash}:{})};const file=path.join(o.destination,AUTHORITY_FILE);
        if(fs.existsSync(file)){need(equal(authorityControl(file).value,selected),'AUTHORITY_CONFLICT');readDatabase(safe(o.destination,r.descriptor.database),o.b,db=>{databaseFacts(db,recoverySchemaHash(),o.b);artifactInventory(db,o.destination,o.b);});return{phase:'selected',repeated:true,selected};}
        await o.fault('before-restored-selection');restoredFacts(o,r);need(equal(readControl(path.join(o.destination,'sqlite-restore-intent.json'),o.b).value,restoreIntent(o,parts))&&authorityControl(path.join(o.destination,'manifest.json')).hash===descriptor.hash,'CHANGED_BINDING');await writeRecoveryControl(file,selected,o.b);await o.fault('after-restored-selection');return{phase:'selected',selected,metrics:o.b.metrics()};
    });
}
export async function recoveryCommand(action,input){if(action==='prepare')return prepareSqliteRecovery(input);if(action==='restore')return restoreSqliteRecovery(input);if(action==='select')return selectRestoredSqliteAuthority(input);
    if(action==='command'){const o=request(input,['root','command','options']);
        if(o.rehearsal){o.lineage=rehearsalLineage(accessScope(o,o.root));scopedRoot(o,o.root,'store');}else root(o.root,sourcePrefix);
        const intent=readControl(path.join(o.root,'sqlite-restore-receipt.json'),o.b).value;need(intent.releaseHash===o.releaseHash&&intent.destination===o.root,'CHANGED_BINDING');
        if(o.rehearsal)return(await import('./replay-rehearsal-operations.js')).runRehearsalCommand({root:o.root,lineageHash:o.rehearsal.lineageHash,command:o.command,options:o.options});
        return runSyntheticAuthorityCommand({synthetic:true,root:o.root,command:o.command,options:o.options});}need(false,'UNSUPPORTED_OPTION');}

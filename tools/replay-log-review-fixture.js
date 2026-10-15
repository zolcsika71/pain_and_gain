// Selected checkpoints: fixture guards or an existing production authority lease.
import {assertConsumerMode,productionAccess,assertProductionFiles} from './replay-production-scope.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fail} from './replay-store-payloads.js';
import {resident,withCleanup} from './retrieval-files.js';
import {updateFixtureReviewCheckpoint} from './replay-review-fixture.js';

function required(file,directory=false){
    const st=resident(file,directory);
    if(fs.realpathSync(file)!==file||(!directory&&st.nlink!==1))fail('UNSAFE_PATH','Independent canonical fixture files required');
    return st;
}
function optional(file,independent=true){
    try{fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
    if(independent)required(file);else resident(file);
}
function fixtureAccess(root){
    if(productionAccess(root)){assertProductionFiles(root);return;}
    if(typeof root!=='string'||!path.isAbsolute(root)||path.resolve(root)!==root||
        path.dirname(root)!==fs.realpathSync(os.tmpdir())||!path.basename(root).startsWith('pain-gain-store-v3-fixture-'))
        fail('UNSAFE_PATH','Explicit direct temporary SQLite fixture root required');
    required(root,true);
    // Both controls must be resident before either can be opened by the store.
    required(path.join(root,'.storage-v3-fixture'));
    const file=path.join(root,'manifest.json'),before=required(file);
    if(before.size>16384)fail('RESOURCE_LIMIT','Fixture descriptor exceeds 16 KiB');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary,failed=false;
    let descriptor;
    try{
        const st=fs.fstatSync(fd);if(st.dev!==before.dev||st.ino!==before.ino||st.size!==before.size)fail('CHANGED_INPUT','Fixture descriptor changed during open');
        const bytes=Buffer.alloc(st.size);let offset=0;
        while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)fail('CHANGED_INPUT','Truncated fixture descriptor');offset+=n;}
        const end=fs.fstatSync(fd);if(end.size!==st.size||end.mtimeMs!==st.mtimeMs)fail('CHANGED_INPUT','Fixture descriptor changed during read');
        descriptor=JSON.parse(bytes.toString('utf8'));
    }catch(e){primary=e;failed=true;throw e;}finally{try{fs.closeSync(fd);}catch(e){
        if(!failed)throw e;if(primary instanceof Error)withCleanup(primary,e);
        else throw new AggregateError([primary,e],'Descriptor operation and cleanup failed',{cause:primary});
    }}
    const d=descriptor;
    if(!d||d.version!==3||d.schemaVersion!==1||d.payloadVersion!==1||d.storage!=='sqlite-sidecars'||
        typeof d.storeId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(d.storeId)||
        d.database!==`store-v3/${d.storeId}/index.sqlite`||Object.hasOwn(d,'rehearsal'))
        fail('UNSUPPORTED_STORE','Selected command requires schema-1 fixture storage');
    required(path.join(root,'store-v3'),true);required(path.join(root,'store-v3',d.storeId),true);
    const db=path.join(root,d.database);required(db);
    for(const suffix of ['-journal','-wal','-shm'])optional(db+suffix);
    // Existing lock publication intentionally uses hardlinks. Never remove/recover it here.
    optional(path.join(root,'.manifest.lock'),false);
}

export const updateSyntheticLogReview = options => updateSyntheticReview(options,'log');
export const updateSyntheticScoreReview = options => updateSyntheticReview(options,'score');
export {fixtureAccess as assertSyntheticFixtureAccess};

async function updateSyntheticReview(options,collection){
    if(!options||![Object.prototype,null].includes(Object.getPrototypeOf(options)))fail('INVALID_ARGUMENT','Explicit plain synthetic options required');
    const keys=['synthetic','production','root','action','replayId','fingerprint','taskId'],o={};
    for(const key of Reflect.ownKeys(options)){
        const d=Object.getOwnPropertyDescriptor(options,key);
        if(!keys.includes(key))fail('UNSUPPORTED_OPTION','Unsupported synthetic checkpoint option');
        if(!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Accessor options are unsupported');o[key]=d.value;
    }
    assertConsumerMode(o);
    if(keys.filter(k=>!['synthetic','production'].includes(k)).some(k=>!Object.hasOwn(o,k)))fail('INVALID_ARGUMENT','Synthetic mode and exact selection are required');
    if(!['claim','examined'].includes(o.action))fail('UNSUPPORTED_OPTION',`Only selected-${collection} claim/examined are supported`);
    if(typeof o.replayId!=='string'||!/^[a-f0-9]{24}$/.test(o.replayId)||typeof o.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(o.fingerprint)||
        typeof o.taskId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(o.taskId))fail('INVALID_IDENTITY',`Exact ${collection}/review identities required`);
    const [major,minor]=process.versions.node.split('.').map(Number);
    if(process.platform!=='darwin'||major!==24||minor<19)fail('UNSUPPORTED_RUNTIME','Requires supported Node 24.19+ on macOS');
    fixtureAccess(o.root);
    return updateFixtureReviewCheckpoint({root:o.root,schemaVersion:1,collection,replayId:o.replayId,fingerprint:o.fingerprint,taskId:o.taskId,action:o.action});
}

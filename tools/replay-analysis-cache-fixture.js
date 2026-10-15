// Disposable derived reports in explicit fixture roots; never evidence authority.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {fail,jsonChunks} from './replay-store-payloads.js';
import {resident,withCleanup} from './retrieval-files.js';
import {assertSyntheticFixtureAccess} from './replay-log-review-fixture.js';

const maxBytes=8*1048576;
const dependencies=['replay-analysis-cache-fixture.js','replay-evidence-consumers-fixture.js','replay-store.js','replay-store-payloads.js','replay-catalog.js','replay-store-retirement.js','replay-rehearsal-scope.js','retrieval-files.js','replay-log-review-fixture.js','replay-review-fixture.js','replay-analysis-fixture.js','replay-score-analysis-fixture.js','replay-combined-analysis-fixture.js','replay-analysis.js','replay-score-analysis.js','replay-logs.js','historical-index.js','scout-hold-screen.js','../src/config.js','../src/debug/build-id.js'];
function digest(value){const h=createHash('sha256');let bytes=0;for(const c of jsonChunks(value)){if((bytes+=c.length)>64*1048576)fail('RESOURCE_LIMIT','Cache input exceeds 64 MiB');h.update(c);}return h.digest('hex');}
function read(file,limit){
    const before=resident(file);if(before.nlink!==1||before.size>limit)fail('UNSAFE_PATH','Independent bounded cache/control file required');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
    try{
        const st=fs.fstatSync(fd);if(st.ino!==before.ino||st.dev!==before.dev||st.size!==before.size)fail('CHANGED_INPUT','Cache/control changed on open');
        const buffer=Buffer.alloc(st.size);let offset=0;
        while(offset<buffer.length){const n=fs.readSync(fd,buffer,offset,Math.min(65536,buffer.length-offset),offset);if(!n)fail('CHANGED_INPUT','Cache/control truncated');offset+=n;}
        const end=fs.fstatSync(fd);if(end.size!==st.size||end.mtimeMs!==st.mtimeMs||end.ctimeMs!==st.ctimeMs)fail('CHANGED_INPUT','Cache/control changed');return buffer;
    }catch(e){primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!primary)throw e;withCleanup(primary,e);}}
}
function directory(root){
    const dir=path.join(root,'analysis_cache');
    try{fs.mkdirSync(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
    resident(dir,true);if(fs.realpathSync(dir)!==dir)fail('UNSAFE_PATH','Canonical cache directory required');return dir;
}
// Called only after pinned readers and analyzer have revalidated selected claims,
// originals, bytes and linkage. Generation guards assembly; it is not in the key.
export function cacheSyntheticReport({root,store,domain,inputs,report,generation}){
    if(!['historical-store-v3-v1','scout-hold-store-v3-v1'].includes(domain))fail('INVALID_ARGUMENT','Versioned cache domain required');
    assertSyntheticFixtureAccess(root);
    const code=dependencies.map(p=>[p,createHash('sha256').update(read(fileURLToPath(new URL(p,import.meta.url)),1048576)).digest('hex')]);
    const key=digest({domain,encoding:1,storeId:store.storeId,inputs,code}),reportHash=digest(report);
    const dir=directory(root),file=path.join(dir,`${domain}-${key}.json`);
    const existing=()=>{
        fs.lstatSync(file);
        const saved=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(read(file,maxBytes)));
        if(saved.domain!==domain||saved.key!==key||saved.storeId!==store.storeId||typeof saved.generation!=='string'||!/^(0|[1-9]\d*)$/.test(saved.generation)||BigInt(saved.generation)>BigInt(generation)||saved.reportHash!==reportHash||digest(saved.report)!==reportHash)fail('INVALID_CACHE','Stale, foreign or altered derived cache');
        return {report:saved.report,cache:'hit'};
    };
    try{return existing();}catch(e){if(e.code!=='ENOENT')throw e;}
    const envelope={domain,key,storeId:store.storeId,generation:String(generation),reportHash,report};
    const temporary=path.join(dir,`.cache-${randomUUID()}.tmp`),fd=fs.openSync(temporary,'wx',0o600);let primary;
    try{let bytes=0;for(const c of jsonChunks(envelope)){if((bytes+=c.length)>maxBytes)fail('RESOURCE_LIMIT','Cache report exceeds 8 MiB');let at=0;while(at<c.length){const n=fs.writeSync(fd,c,at,c.length-at);if(!n)fail('EIO','Short cache write');at+=n;}}fs.fsyncSync(fd);}
    catch(e){primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!primary)throw e;withCleanup(primary,e);}}
    // Exclusive publication; failed/concurrent temporary artifacts are retained.
    try{fs.linkSync(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;return existing();}
    fs.unlinkSync(temporary);
    const d=fs.openSync(dir,'r');let syncError;try{fs.fsyncSync(d);}catch(e){syncError=e;throw e;}finally{try{fs.closeSync(d);}catch(e){if(!syncError)throw e;withCleanup(syncError,e);}}
    return {report,cache:'miss'};
}

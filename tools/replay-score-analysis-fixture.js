// M2d: synthetic roots only; never imported by the existing v2 CLI.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeLoadedScoreReplay} from './replay-analysis.js';
import {fail,LIMITS,jsonChunks,payloadChunks} from './replay-store-payloads.js';

const MiB=1048576;
const plain=v=>v!==null && typeof v==='object' && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const own=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});
function localBuild(root) {
    let file=root;
    for(const name of ['src','debug','build-id.js']) {
        file=path.join(file,name);let st;
        try{st=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}
        if(st.isSymbolicLink() || (name==='build-id.js'?!st.isFile():!st.isDirectory()))fail('UNSAFE_PATH','Unsafe local build input');
    }
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let failed=false;
    try {
        const st=fs.fstatSync(fd);if(!st.isFile()||st.size>16384)fail('RESOURCE_LIMIT','Local build input exceeds 16 KiB');
        const buffer=Buffer.alloc(st.size);let offset=0;
        while(offset<buffer.length){const n=fs.readSync(fd,buffer,offset,buffer.length-offset,offset);if(!n)fail('INVALID_ARTIFACT','Local build input ended early');offset+=n;}
        return buffer.toString('utf8').match(/export const buildId = '([a-f0-9]{64})'/)?.[1]??null;
    }catch(e){failed=true;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;}}
}
async function originals(view,owner,budget) {
    const rows=view.properties.get(JSON.stringify(owner));if(!rows)fail('INVALID_REFERENCE','Original properties absent');
    const result={};
    for(const row of rows) {
        if(!/^\/(?:[^~/]|~[01])*$/.test(row.pointer))fail('UNSUPPORTED_REPRESENTATION','Score originals require top-level properties');
        const name=row.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');let value;
        if(row.payload_pointer!==null) {
            const ref=view.payload(owner,row.payload_pointer);
            if(row.value!==null||row.payload_pointer!==row.pointer||ref.pointer!==row.pointer||ref.owner.kind!==owner.kind||ref.owner.key!==owner.key||ref.parentPointer!==null)fail('INVALID_REFERENCE','Original property root binding mismatch');
            if(ref.encoding!=='json-v1'||!['summaries','extensions'].includes(ref.role))fail('UNSUPPORTED_REPRESENTATION','Score originals require JSON root values');
            if(ref.bytes>MiB)fail('RESOURCE_LIMIT',`${name} exceeds 1 MiB`);
            // The complete admitted JSON value is capped before allocation.
            // No need for per-byte asynchronous token iteration here: a larger
            // root is rejected, never materialized as a stream reference.
            const content=await readBytes(view,ref,MiB,name);
            try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content));}
            catch(error){fail('INVALID_JSON',`${name}: ${error.message}`);}
            const pending=[[value,0]];
            while(pending.length){const [v,depth]=pending.pop();if(depth>1024)fail('RESOURCE_LIMIT','JSON nesting budget exceeded');if(v!==null&&typeof v==='object')for(const child of Object.values(v))pending.push([child,depth+1]);}
        }else value=JSON.parse(row.value);
        let size=0;for(const chunk of jsonChunks(value)){size+=chunk.length;if(size>MiB)fail('RESOURCE_LIMIT',`${name} exceeds 1 MiB`);}
        budget.metadata+=size+Buffer.byteLength(row.pointer);if(budget.metadata>8*MiB)fail('RESOURCE_LIMIT','Expanded metadata exceeds 8 MiB');
        own(result,name,value);
    }
    if(!Object.hasOwn(result,'reviews'))fail('UNSUPPORTED_REPRESENTATION','Original reviews value required');
    return result;
}
async function rawBody(view,ref,budget) {
    if(!ref)fail('UNAVAILABLE','Score output absent');
    if(!Number.isSafeInteger(ref.bytes)||ref.bytes>4*MiB||budget.raw+ref.bytes>16*MiB)fail('RESOURCE_LIMIT','Score raw body exceeds per-source 4 MiB or total 16 MiB');
    budget.raw+=ref.bytes;return readBytes(view,ref,4*MiB,'Score raw body');
}
async function readBytes(view,ref,limit,field) {
    if(!Number.isSafeInteger(ref.bytes)||ref.bytes>limit)fail('RESOURCE_LIMIT',`${field} exceeds ${limit} bytes`);
    const parts=[],digest=createHash('sha256');let size=0;
    for await(const chunk of payloadChunks(view,ref)){parts.push(chunk);digest.update(chunk);size+=chunk.length;}
    if(size!==ref.bytes||digest.digest('hex')!==ref.hash)fail('INVALID_ARTIFACT',`${field} hash/length mismatch`);
    return Buffer.concat(parts,size);
}
export async function analyzeFixtureScoreReplay(options) {
    if(!plain(options))fail('INVALID_ARGUMENT','Explicit plain options required');
    const allowed=new Set(['root','schemaVersion','replayId','scoreFingerprints','reportMode']);
    if(Reflect.ownKeys(options).some(k=>!allowed.has(k)))fail('UNSUPPORTED_OPTION','Unsupported score fixture option');
    const {root,schemaVersion,replayId,scoreFingerprints,reportMode='full'}=options;
    if(schemaVersion!==1&&schemaVersion!==2)fail('UNSUPPORTED_STORE','Expected schema 1 or 2');
    if(Array.isArray(scoreFingerprints)&&scoreFingerprints.length>LIMITS.sources)fail('RESOURCE_LIMIT','Selection exceeds 64 records');
    if(typeof replayId!=='string'||!/^[a-f0-9]{24}$/.test(replayId)||!Array.isArray(scoreFingerprints)||!scoreFingerprints.length||scoreFingerprints.some(f=>typeof f!=='string'||!/^[a-f0-9]{64}$/.test(f))||new Set(scoreFingerprints).size!==scoreFingerprints.length)fail('INVALID_IDENTITY','Explicit distinct score fingerprints required');
    if(!['full','compact'].includes(reportMode))fail('INVALID_ARGUMENT','Expected full or compact report');
    const fingerprints=[...scoreFingerprints];
    const handle=schemaVersion===1?await(await import('./replay-store.js')).openStore({root,mode:'read'}):await(await import('./replay-catalog.js')).openCatalog({root,mode:'read'});
    const store=handle.evidence??handle;let failed=false;
    try {
        const localBuildId=localBuild(root);
        return await store.withReadSnapshot({scoreSelection:{replayId,fingerprints}},async view=>{
            const facts=view.scoreSelection(),scoreRecords=[],sourceEvidence=new Map(),budget={metadata:0,raw:0};
            const ordered=[...view.records.values()].sort((a,b)=>a.ordinal<b.ordinal?-1:a.ordinal>b.ordinal?1:a.key<b.key?-1:a.key>b.key?1:0);
            for(const row of ordered) {
                const owner={kind:'record',key:row.key},record=await originals(view,owner,budget);
                for(const [name,column]of Object.entries({replayId:'replay_id',fingerprint:'fingerprint',outputPath:'output_path',outputFingerprint:'output_hash'}))if(record[name]!==row[column])fail('INVALID_REFERENCE',`${name} original/projection mismatch`);
                const ref=view.output({collection:'score',replayId,fingerprint:row.fingerprint});
                sourceEvidence.set(record,{bytes:await rawBody(view,ref,budget)});scoreRecords.push(record);
            }
            return analyzeLoadedScoreReplay({replayId,scoreFingerprints:fingerprints,reportMode,localBuildId,scoreCollectionPresent:facts.collections.scoreRecords.present,scoreRecords,sourceEvidence});
        });
    }catch(e){failed=true;throw e;}finally{try{handle.close();}catch(e){if(!failed)throw e;}}
}

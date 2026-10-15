// Bounded map-owned replacement journal. Only the explicit synthetic repair handle
// supplies this module with a locked writer; record publication is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fail} from './replay-store-payloads.js';
import {resident,withCleanup} from './retrieval-files.js';
import {sha256,validMap,mapPayload,mapChecksum,savedMapContent} from './replay-logs.js';

export const MAP_REPAIR_SCHEMA = `CREATE TABLE map_repairs (
 map_id TEXT PRIMARY KEY REFERENCES maps(key), path TEXT NOT NULL UNIQUE,
 old_hash TEXT NOT NULL, new_hash TEXT NOT NULL, old_bytes INTEGER NOT NULL CHECK(old_bytes>=0), new_bytes INTEGER NOT NULL CHECK(new_bytes>=0),
 old_path TEXT NOT NULL UNIQUE, new_path TEXT NOT NULL UNIQUE,
 old_dev TEXT NOT NULL, old_ino TEXT NOT NULL, map_ordinal TEXT NOT NULL, properties_hash TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('reserved','published','verified'))
) STRICT`;
export const MAP_REPAIR_LIMITS=Object.freeze({maps:64,properties:128,metadataBytes:4*1048576,mapBytes:1048576,artifactBytes:64*1048576,deadlineMs:60000});
const need=(v,c='INVALID_REFERENCE',m=c)=>{if(!v)fail(c,m);};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const name=v=>typeof v==='string'&&/^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/.test(v);
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const cleanup=(primary,e)=>{if(primary instanceof Error)withCleanup(primary,e);else throw new AggregateError([primary,e],'Map operation and cleanup failed',{cause:primary});};
export function mapRepairOptions(input){
    const copy=(v,keys)=>{need(v&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),'INVALID_ARGUMENT');const out={};for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k);need(keys.includes(k)&&Object.hasOwn(d,'value'),'INVALID_ARGUMENT');out[k]=d.value;}return out;};
    const o=copy(input??{},['limits']),L={...MAP_REPAIR_LIMITS};
    for(const[k,v]of Object.entries(o.limits===undefined?{}:copy(o.limits,Object.keys(L)))){need(Number.isSafeInteger(v)&&v>0&&v<=L[k],'RESOURCE_LIMIT');L[k]=v;}
    return Object.freeze(L);
}
export function mapRepairCapability(query,required=false){
    const row=query("SELECT sql FROM sqlite_master WHERE type='table' AND name='map_repairs'");
    if(!row){if(required)fail('UNSUPPORTED_STORE','Store lacks map-repair-v1; no automatic schema migration');return false;}
    need(row.sql===MAP_REPAIR_SCHEMA,'UNSUPPORTED_STORE','Unsupported map-repair schema');return true;
}
export function rejectPendingMapRepair(query){
    if(mapRepairCapability(query)&&query("SELECT map_id FROM map_repairs WHERE phase!='verified' LIMIT 1"))fail('RECOVERY_REQUIRED','Recover the exact map checksum repair before ordinary access');
}

export function mapRepairWriter({root,storeId,query,transaction,ensure,inject,safePath,syncDir,metrics}){
    return async function repairMapChecksums(input={}){
        const L=mapRepairOptions(input),started=performance.now();let io=0,metadata=0;
        const check=()=>{ensure();need(performance.now()-started<=L.deadlineMs,'RESOURCE_LIMIT','Map repair deadline exceeded');};
        const charge=n=>{check();io+=n;need(Number.isSafeInteger(io)&&io<=L.artifactBytes,'RESOURCE_LIMIT','Map repair I/O budget exceeded');};
        const meta=value=>{metadata+=Buffer.byteLength(json(value));need(metadata<=L.metadataBytes,'RESOURCE_LIMIT','Map repair metadata budget exceeded');};
        const run=(sql,args=[])=>query(sql,args,'run');
        mapRepairCapability(query,true);check();
        need(!query('SELECT id FROM operations LIMIT 1')&&!query("SELECT key FROM records WHERE status IN ('pending','retiring') LIMIT 1"),'NOT_READY','Finish pending record publication/retirement first');
        need(!query("SELECT pointer FROM properties WHERE owner_kind='root' AND (pointer LIKE '/syntheticCacheImportV1/%' OR pointer LIKE '/syntheticLocalLogV1/%') AND (value IS NULL OR json_extract(value,'$.phase') IS NOT 'verified') LIMIT 1"),'NOT_READY','Finish pending source publication first');
        const maps=query('SELECT * FROM maps ORDER BY ordinal,key LIMIT ?',[L.maps+1],'all');need(maps.length<=L.maps,'RESOURCE_LIMIT');maps.forEach(meta);
        const journals=query('SELECT * FROM map_repairs ORDER BY map_id LIMIT ?',[L.maps+1],'all');need(journals.length<=L.maps,'RESOURCE_LIMIT');journals.forEach(meta);
        need(journals.every(j=>maps.some(m=>m.key===j.map_id)),'INVALID_REFERENCE','Orphan map journal');
        function read(relative,durable=false){
            const file=safePath(relative),st=resident(file);need(st.nlink===1&&fs.realpathSync(file)===file,'UNSAFE_PATH');need(st.size<=L.mapBytes,'RESOURCE_LIMIT');charge(st.size);
            const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let failed=false,primary;
            try{const opened=fs.fstatSync(fd);need(opened.dev===st.dev&&opened.ino===st.ino&&opened.size===st.size,'CHANGED_INPUT');const bytes=Buffer.alloc(st.size);let n=0;
                while(n<bytes.length){check();const got=fs.readSync(fd,bytes,n,Math.min(65536,bytes.length-n),n);need(got>0,'CHANGED_INPUT');n+=got;metrics.fsReads++;metrics.payloadReadBytes+=got;}
                const end=fs.fstatSync(fd),named=resident(file);need(end.size===st.size&&end.mtimeMs===st.mtimeMs&&end.ctimeMs===st.ctimeMs&&named.dev===st.dev&&named.ino===st.ino&&named.size===st.size,'CHANGED_INPUT');if(durable)fs.fsyncSync(fd);return{bytes,st,hash:sha256(bytes)};
            }catch(e){failed=true;primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;cleanup(primary,e);}}
        }
        function props(m){
            const rows=query("SELECT pointer,ordinal,value,payload_pointer FROM properties WHERE owner_kind='map' AND owner_key=? ORDER BY ordinal,pointer LIMIT ?",[m.key,L.properties+1],'all');need(rows.length<=L.properties,'RESOURCE_LIMIT');
            const value={};for(const p of rows){meta(p);need(p.value!==null&&p.payload_pointer===null&&/^\/(?:[^/~]|~[01])*$/.test(p.pointer),'UNSUPPORTED_REPRESENTATION');const k=p.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~');Object.defineProperty(value,k,{value:JSON.parse(p.value),enumerable:true});}
            need(value.id===m.key&&value.checksum===m.key&&value.file===m.path&&value.status==='validated'&&m.status==='validated','INVALID_ASSOCIATION');
            for(const [k,v]of [['mapId',m.key],['path',m.path],['hash',m.hash]])if(Object.hasOwn(value,k))need(value[k]===v,'INVALID_REFERENCE');
            return{rows,value};
        }
        const propHash=(rows,oldHash)=>sha256(json(rows.map(p=>p.pointer==='/hash'?{...p,value:JSON.stringify(oldHash)}:p)));
        function parse(bytes,id,legacy){const map=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));need(validMap(mapPayload(map))&&mapChecksum(map)===id,'INVALID_ARTIFACT');need(legacy?!Object.hasOwn(map,'checksum'):map.checksum===id,'INVALID_ARTIFACT');return map;}
        function ownership(m,j){
            need(name(m.path)&&hex(m.key)&&hex(m.hash),'INVALID_REFERENCE');
            const paths=j?[m.path,j.old_path,j.new_path]:[m.path];
            for(const p of paths){try{safePath(p);}catch(e){if(p===m.path||e.code!=='UNAVAILABLE')throw e;}need(!query('SELECT path FROM outputs WHERE path=?',[p])&&!query('SELECT path FROM payloads WHERE path=?',[p])&&!query('SELECT path FROM operation_files WHERE path=? LIMIT 1',[p]),'OWNERSHIP_CONFLICT');
                const owner=query('SELECT key FROM maps WHERE path=?',[p]);need(p===m.path?owner?.key===m.key:!owner,'OWNERSHIP_CONFLICT');}
        }
        const retained=(id,hash,kind)=>`store-v3/${storeId}/map-repairs/${id}/${hash}.${kind}`;
        function fact(m,j){
            ownership(m,j);const p=props(m),current=read(m.path);
            if(!j){need(current.hash===m.hash,'INVALID_ARTIFACT');const map=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(current.bytes));need(validMap(mapPayload(map))&&mapChecksum(map)===m.key&&(map.checksum===m.key||!Object.hasOwn(map,'checksum')),'INVALID_ARTIFACT');const replacement=Buffer.from(savedMapContent(map));need(replacement.length<=L.mapBytes,'RESOURCE_LIMIT');return{p,current,replacement,missing:!Object.hasOwn(map,'checksum')};}
            need(j.map_id===m.key&&j.path===m.path&&j.map_ordinal===String(m.ordinal)&&hex(j.old_hash)&&hex(j.new_hash)&&j.old_hash!==j.new_hash&&['reserved','published','verified'].includes(j.phase)&&j.properties_hash===propHash(p.rows,j.old_hash),'INVALID_REFERENCE');
            need(j.old_path===retained(m.key,j.old_hash,'original')&&j.new_path===retained(m.key,j.new_hash,'replacement')&&Number.isSafeInteger(j.old_bytes)&&Number.isSafeInteger(j.new_bytes)&&j.old_bytes<=L.mapBytes&&j.new_bytes<=L.mapBytes&&/^\d+$/.test(j.old_dev)&&/^\d+$/.test(j.old_ino),'INVALID_REFERENCE');
            const old=read(j.old_path),next=read(j.new_path);need(old.hash===j.old_hash&&old.bytes.length===j.old_bytes&&next.hash===j.new_hash&&next.bytes.length===j.new_bytes,'INVALID_ARTIFACT');
            const map=parse(old.bytes,m.key,true);need(next.bytes.equals(Buffer.from(savedMapContent(map))),'INVALID_ARTIFACT');parse(next.bytes,m.key,false);
            need(m.hash===(j.phase==='verified'?j.new_hash:j.old_hash),'INVALID_REFERENCE');
            if(current.hash===j.old_hash){need(j.phase==='reserved'&&String(current.st.dev)===j.old_dev&&String(current.st.ino)===j.old_ino&&current.bytes.equals(old.bytes),'CHANGED_INPUT');}
            else need(current.hash===j.new_hash&&current.bytes.equals(next.bytes),'CHANGED_INPUT');
            return{p,current,replacement:next.bytes,missing:j.phase!=='verified',journal:j};
        }
        function writeFile(file,bytes){
            charge(bytes.length);const fd=fs.openSync(file,'wx',0o600);let failed=false,primary;
            try{let n=0;while(n<bytes.length){check();const count=fs.writeSync(fd,bytes,n,Math.min(65536,bytes.length-n));need(count>0,'EIO');n+=count;metrics.fsWrites++;metrics.payloadWriteBytes+=count;inject('map-temporary-write');}inject('map-temporary-fsync');fs.fsyncSync(fd);}
            catch(e){failed=true;primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(!failed)throw e;cleanup(primary,e);}}
        }
        function preserve(relative,bytes){
            // Private store-qualified directories; every component validated.
            const parts=relative.split('/');for(let i=1;i<parts.length;i++){const p=parts.slice(0,i).join('/'),dir=path.join(root,p);let st;try{st=fs.lstatSync(dir);}catch(e){if(e.code!=='ENOENT')throw e;fs.mkdirSync(dir,{mode:0o700});st=fs.lstatSync(dir);}need(st.isDirectory()&&!st.isSymbolicLink()&&fs.realpathSync(dir)===dir,'UNSAFE_PATH');resident(dir,true);syncDir(path.dirname(dir));}
            const file=safePath(relative);let exists=true;try{fs.lstatSync(file);}catch(e){if(e.code!=='ENOENT')throw e;exists=false;}
            if(exists){need(read(relative,true).bytes.equals(bytes),'INVALID_ARTIFACT');syncDir(path.dirname(file));return;}
            const temporary=file+'.'+randomUUID()+'.tmp';writeFile(temporary,bytes);
            // Lock-protected rename avoids a crash window leaving two hardlinks
            // to a retained copy. Recheck an unexpectedly appeared target; never
            // replace it. Abandoned private temporaries remain retained.
            let appeared=true;try{fs.lstatSync(file);}catch(e){if(e.code!=='ENOENT')throw e;appeared=false;}
            if(appeared)need(read(relative,true).bytes.equals(bytes),'INVALID_ARTIFACT');else fs.renameSync(temporary,file);
            inject('map-retained-published');syncDir(path.dirname(file));need(read(relative).bytes.equals(bytes),'INVALID_ARTIFACT');
        }
        // Validate the entire bounded selection before starting any repair. Keep
        // only small rows; map bodies are reacquired one at a time under the lock.
        for(const m of maps){check();fact(m,journals.find(j=>j.map_id===m.key));}
        const results=[];
        for(const original of maps){
            check();let m=query('SELECT * FROM maps WHERE key=?',[original.key]);need(json(m)===json(original),'CHANGED_INPUT');
            let j=query('SELECT * FROM map_repairs WHERE map_id=?',[m.key]),f=fact(m,j),updated=f.missing;
            if(!updated){results.push({file:m.path,checksum:m.key,status:'verified'});continue;}
            if(!j){
                const oldHash=f.current.hash,newHash=sha256(f.replacement),oldPath=retained(m.key,oldHash,'original'),newPath=retained(m.key,newHash,'replacement');
                j={map_id:m.key,path:m.path,old_hash:oldHash,new_hash:newHash,old_bytes:f.current.bytes.length,new_bytes:f.replacement.length,old_path:oldPath,new_path:newPath,old_dev:String(f.current.st.dev),old_ino:String(f.current.st.ino),map_ordinal:String(m.ordinal),properties_hash:propHash(f.p.rows,oldHash),phase:'reserved'};
                // Retain durable independent originals before committing an intent.
                ownership(m,j);preserve(oldPath,f.current.bytes);inject('map-original-retained');preserve(newPath,f.replacement);inject('map-replacement-retained');
                const now=read(m.path);need(now.bytes.equals(f.current.bytes)&&now.st.dev===f.current.st.dev&&now.st.ino===f.current.st.ino,'CHANGED_INPUT');
                transaction(()=>run('INSERT INTO map_repairs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',Object.values(j)));inject('map-intent-committed');
            }
            f=fact(m,j);
            if(f.current.hash===j.old_hash){
                const temporary=safePath(m.path)+'.map-repair-'+randomUUID()+'.tmp';writeFile(temporary,f.replacement);inject('map-before-replace');
                const current=read(m.path);need(current.hash===j.old_hash&&String(current.st.dev)===j.old_dev&&String(current.st.ino)===j.old_ino&&current.bytes.equals(read(j.old_path).bytes),'CHANGED_INPUT');
                // The writer lock excludes cooperating writers. Check/open/rename
                // is not an OS atomic compare-and-swap against hostile writers.
                fs.renameSync(temporary,safePath(m.path));inject('map-replaced');
            }
            need(read(m.path,true).hash===j.new_hash,'INVALID_ARTIFACT');syncDir(path.dirname(safePath(m.path)));inject('map-directory-synced');
            f=fact(m,j);need(f.current.hash===j.new_hash,'INVALID_ARTIFACT');
            if(j.phase==='reserved'){transaction(()=>run("UPDATE map_repairs SET phase='published' WHERE map_id=?",[m.key]));j={...j,phase:'published'};inject('map-published');}
            fact(m,j);inject('map-before-commit');
            // Revalidate after the last fault/phase hook as well as immediately
            // before changing projections. Unknown properties and ordinals stay.
            f=fact(m,j);
            transaction(()=>{run('UPDATE maps SET hash=? WHERE key=?',[j.new_hash,m.key]);const p=f.p.rows.find(p=>p.pointer==='/hash');if(p)run("UPDATE properties SET value=? WHERE owner_kind='map' AND owner_key=? AND pointer='/hash'",[JSON.stringify(j.new_hash),m.key]);run("UPDATE map_repairs SET phase='verified' WHERE map_id=?",[m.key]);});
            inject('map-verified');m=query('SELECT * FROM maps WHERE key=?',[m.key]);fact(m,{...j,phase:'verified'});results.push({file:m.path,checksum:m.key,status:'updated'});
        }
        check();return results;
    };
}

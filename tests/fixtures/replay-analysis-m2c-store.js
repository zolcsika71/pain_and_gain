import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as helpers from '../../tools/replay-logs.js';
import {createFixtureStore,recordKey,recordOwner} from '../../tools/replay-store.js';
import {createCatalogFixture} from '../../tools/replay-catalog.js';
import {digestChunks,payloadPath} from '../../tools/replay-store-payloads.js';
import {recipe,replayId,fingerprint} from './replay-analysis-m2c-recipe.js';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const chunks = function* (bytes) { for (let i=0;i<bytes.length;i+=65536) yield bytes.subarray(i,i+65536); };
export const key = i => ({collection:'log',replayId,fingerprint:fingerprint(i)});
export function inventory(root) {
    const result = {};
    function walk(dir) { for (const name of fs.readdirSync(dir).sort()) {
        const full=path.join(dir,name), st=fs.lstatSync(full);
        if(st.isDirectory()) walk(full);
        else {
            const h=createHash('sha256'), fd=fs.openSync(full,'r'), buf=Buffer.alloc(65536);
            try { for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;h.update(buf.subarray(0,n));} }
            finally {fs.closeSync(fd);}
            result[path.relative(root,full)]={bytes:st.size,hash:h.digest('hex')};
        }
    }}
    walk(root); return result;
}
export async function makeFixture(schema=1, variant='scale', {root, count=4, large=false, transform}={}) {
    root ??= fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'));
    const h=await(schema===1?createFixtureStore:createCatalogFixture)({root,filesystem:'local-apfs'}), s=h.evidence??h;
    const data=recipe(helpers,variant), map=data.manifest.maps[0];
    transform?.(data);
    fs.writeFileSync(path.join(root,map.file),data.files[map.file]);
    await s.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'map',key:map.id,ordinal:0,value:{...map,path:map.file,hash:hash(data.files[map.file])}});
        tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:data.manifest.replays[0]});
    }));
    const refs=[];
    for(const [i,r] of data.manifest.records.entries()) {
        const owner=recordOwner(key(i)), pointer='/otherEntries', childPointer=pointer+'/overflow';
        const overflow=r.otherEntries.length>512;
        const source=function*(){for(const [ordinal,wrapper] of r.otherEntries.entries())yield* chunks(Buffer.from(JSON.stringify(overflow&&ordinal===512?{ordinal,wrapperRef:childPointer}:{ordinal,wrapper})+'\n'));};
        const inputs=[{owner,pointer,role:'diagnostics',items:r.otherEntries.length,source,...digestChunks(source())}];
        if(overflow){const content=Buffer.from(JSON.stringify(r.otherEntries[512]));inputs.push({owner,pointer:childPointer,parentPointer:pointer,role:'extensions',source:()=>chunks(content),...digestChunks(chunks(content))});}
        const published=[];
        await s.withWriter(async w=>{
            w.transaction(tx=>{
                const value={...r,status:'pending',outputPath:null,outputFingerprint:null};delete value.otherEntries;
                tx.insertEntity({kind:'record',key:recordKey(key(i)),ordinal:i,value});
                if(r.outputPath)tx.reserveOutput({recordKey:key(i),path:r.outputPath,expectedHash:r.outputFingerprint,expectedBytes:Buffer.byteLength(data.files[r.outputPath])});
                tx.appendIntent({id:`publish-${i}`,recordKey:key(i),files:[...inputs.map((v,ordinal)=>({ordinal,path:payloadPath(s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role,parentPointer:v.parentPointer,items:v.items}})),
                    ...(r.outputPath?[{ordinal:inputs.length,path:r.outputPath,hash:r.outputFingerprint,bytes:Buffer.byteLength(data.files[r.outputPath])}]:[])]});
            });
            for(const input of inputs)published.push(await w.publishPayload({...input,source:input.source()}));
            if(r.outputPath)await w.publishOutput({recordKey:key(i),path:r.outputPath,source:chunks(Buffer.from(data.files[r.outputPath])),expectedHash:r.outputFingerprint,expectedBytes:Buffer.byteLength(data.files[r.outputPath])});
            w.transaction(tx=>{
                tx.finishPublication({recordKey:key(i),operationId:`publish-${i}`});
                for(const [ordinal,name] of Object.keys(r).entries())tx.setProperty({owner,pointer:'/'+name.replaceAll('~','~0').replaceAll('/','~1'),ordinal,...(name==='otherEntries'?{payloadRef:published[0]}:{value:r[name]})});
            });
        });
        refs.push(published);
    }
    await s.withWriter(w=>w.transaction(tx=>{for(let i=4;i<count;i++)tx.insertEntity({kind:'record',key:recordKey(key(i)),ordinal:i,value:{mapId:map.id}});}));
    const largeRefs=[];
    if(large)for(let i=0;i<12;i++) {
        const source=function*(){yield Buffer.from('"');let n=50*1024*1024-2;const b=Buffer.alloc(65536,65+i);while(n){const len=Math.min(n,b.length);yield b.subarray(0,len);n-=len;}yield Buffer.from('"');};
        const owner=recordOwner(key(4+Math.floor(i/2)));
        await s.withWriter(async w=>{
            const ref=await w.publishPayload({owner,pointer:`/large-${i}`,role:'extensions',evidenceOnly:true,source:source(),...digestChunks(source())});
            w.transaction(tx=>tx.finishPublication({recordKey:key(4+Math.floor(i/2)),payloadRefs:[ref]}));largeRefs.push(ref);
        });
    }
    return {root,h,s,schema,data,refs,largeRefs,options:{root,schemaVersion:schema,replayId,fingerprints:data.manifest.records.map(r=>r.fingerprint)}};
}

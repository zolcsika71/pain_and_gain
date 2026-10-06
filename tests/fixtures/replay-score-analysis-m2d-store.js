import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as helpers from '../../tools/replay-logs.js';
import {createFixtureStore,recordKey,recordOwner} from '../../tools/replay-store.js';
import {createCatalogFixture} from '../../tools/replay-catalog.js';
import {digestChunks,payloadPath} from '../../tools/replay-store-payloads.js';
import {recipe,replayId,hash} from './replay-score-analysis-m2d-recipe.js';
export {inventory,chunks} from './replay-analysis-m2c-store.js';
import {chunks} from './replay-analysis-m2c-store.js';
export const key=r=>({collection:'score',replayId:r.replayId,fingerprint:r.fingerprint});
export async function makeFixture(schema=1,variant='scale',{root,count=4,large=false,transform}={}) {
    root??=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'));
    const h=await(schema===1?createFixtureStore:createCatalogFixture)({root,filesystem:'local-apfs'}),s=h.evidence??h,data=recipe(helpers,variant);transform?.(data);
    await s.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'collection',key:'scoreRecords',ordinal:4,value:{present:Object.hasOwn(data.manifest,'scoreRecords')}});
        tx.insertEntity({kind:'collection',key:'retiredScoreSources',ordinal:5,value:{present:true}});
        tx.insertEntity({kind:'replay',key:replayId,ordinal:0});
        tx.insertEntity({kind:'replay',key:'e'.repeat(24),ordinal:1});
    }));
    const refs=[];
    for(const [i,r]of(data.manifest.scoreRecords??[]).entries()) {
        const k=key(r),owner=recordOwner(k),published=[],inputs=['validation','fixtureNote'].map(name=>{
            const content=Buffer.from(JSON.stringify(r[name]));return {owner,pointer:'/'+name,role:name==='validation'?'summaries':'extensions',content,...digestChunks(chunks(content))};
        });
        await s.withWriter(async w=>{
            w.transaction(tx=>{
                const value={...r,status:'pending',outputPath:null,outputFingerprint:null};delete value.validation;delete value.fixtureNote;
                tx.insertEntity({kind:'record',key:recordKey(k),ordinal:i,value});
                const content=data.files[r.outputPath];tx.reserveOutput({recordKey:k,path:r.outputPath,expectedHash:r.outputFingerprint,expectedBytes:content.length});
                tx.appendIntent({id:`publish-${i}`,recordKey:k,files:[...inputs.map((v,ordinal)=>({ordinal,path:payloadPath(s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role}})),{ordinal:2,path:r.outputPath,hash:r.outputFingerprint,bytes:content.length}]});
            });
            for(const input of inputs)published.push(await w.publishPayload({...input,source:chunks(input.content)}));
            await w.publishOutput({recordKey:k,path:r.outputPath,source:chunks(data.files[r.outputPath]),expectedHash:r.outputFingerprint,expectedBytes:data.files[r.outputPath].length});
            w.transaction(tx=>{
                tx.finishPublication({recordKey:k,operationId:`publish-${i}`});
                Object.keys(r).forEach((name,ordinal)=>tx.setProperty({owner,pointer:'/'+name,ordinal,...(name==='validation'||name==='fixtureNote'?{payloadRef:published[name==='validation'?0:1]}:{value:r[name]})}));
            });
        });refs.push(published);
    }
    const filler=i=>({collection:'score',replayId:'e'.repeat(24),fingerprint:hash(`m2d-unselected-${i}`)});
    if(count>4)await s.withWriter(w=>w.transaction(tx=>{for(let i=4;i<count;i++)tx.insertEntity({kind:'record',key:recordKey(filler(i)),ordinal:i});}));
    const largeRefs=[];
    if(large)for(let i=4;i<=9;i++) {
        const k=filler(i),owner=recordOwner(k),inputs=[0,1].map(ordinal=>{
            const j=2*(i-4)+ordinal,source=function*(){yield Buffer.from('"');let n=50*1048576-2;const b=Buffer.alloc(65536,65+j);while(n){const len=Math.min(n,b.length);yield b.subarray(0,len);n-=len;}yield Buffer.from('"');};
            return {owner,pointer:`/large-${j}`,role:'extensions',ordinal,source,...digestChunks(source())};
        });
        await s.withWriter(async w=>{
            w.transaction(tx=>tx.appendIntent({id:`m2d-unrelated-${i}`,recordKey:k,files:inputs.map(v=>({ordinal:v.ordinal,path:payloadPath(s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role}}))}));
            for(const input of inputs){const ref=await w.publishPayload({...input,source:input.source()});w.transaction(tx=>tx.setProperty({owner,pointer:input.pointer,ordinal:input.ordinal,payloadRef:ref}));largeRefs.push(ref);}
        });
    }
    return {root,h,s,schema,data,refs,largeRefs,options:{root,schemaVersion:schema,replayId,scoreFingerprints:data.selected}};
}

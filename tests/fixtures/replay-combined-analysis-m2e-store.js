import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as helpers from '../../tools/replay-logs.js';
import {createFixtureStore,recordKey,recordOwner} from '../../tools/replay-store.js';
import {createCatalogFixture} from '../../tools/replay-catalog.js';
import {digestChunks,payloadPath} from '../../tools/replay-store-payloads.js';
import {recipe,payloads,replayId,hash} from './replay-combined-analysis-m2e-recipe.js';
import {chunks} from './replay-analysis-m2c-store.js';
export {chunks,inventory} from './replay-analysis-m2c-store.js';
export const key=(r,collection)=>({collection,replayId:r.replayId,fingerprint:r.fingerprint});

export async function makeFixture(schema=1,variant='scale',{root,count,large=false,transform}={}) {
    root??=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'));
    const h=await(schema===1?createFixtureStore:createCatalogFixture)({root,filesystem:'local-apfs'}),s=h.evidence??h,data=recipe(helpers,variant);
    transform?.(data);const map=data.manifest.maps[0];
    fs.writeFileSync(path.join(root,map.file),data.files[map.file]);
    await s.withWriter(w=>w.transaction(tx=>{
        // Projection inputs are nonenumerable: retain only original map fields.
        const value=Object.defineProperties({...map},{path:{value:map.file},hash:{value:hash(data.files[map.file])}});
        tx.insertEntity({kind:'map',key:map.id,ordinal:0,value});
        tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:data.manifest.replays[0]});
        tx.insertEntity({kind:'replay',key:'e'.repeat(24),ordinal:1});
        for(const [i,name]of ['scoreRecords','retiredScoreSources'].entries())tx.insertEntity({kind:'collection',key:name,ordinal:4+i,value:{present:Object.hasOwn(data.manifest,name)}});
    }));
    const refs=[],selected=[];let ordinal=0;
    for(const collection of ['log','score'])for(const r of collection==='log'?data.manifest.records:data.manifest.scoreRecords??[]) {
        const k=key(r,collection),owner=recordOwner(k),published=[];
        // This one adversarial oracle deliberately contradicts the replay's
        // build association. Construct owned artifacts normally, then inject
        // the malformed metadata below; never relax the public writer rule.
        const buildConflict=variant==='conflicting-build'&&collection==='log'&&r.buildId!==data.manifest.replays[0].buildId;
        const inputs=payloads(r,collection).map(p=>({...p,owner,...digestChunks(chunks(p.content))}));
        await s.withWriter(async w=>{
            w.transaction(tx=>{
                const value={...r,status:'pending',outputPath:null,outputFingerprint:null};
                if(buildConflict)value.buildId=data.manifest.replays[0].buildId;
                for(const input of inputs)if(input.parentPointer===null)delete value[input.pointer.slice(1)];
                tx.insertEntity({kind:'record',key:recordKey(k),ordinal:ordinal++,value});
                if(r.outputPath)tx.reserveOutput({recordKey:k,path:r.outputPath,expectedHash:r.outputFingerprint,expectedBytes:data.files[r.outputPath].length});
                tx.appendIntent({id:`publish-${collection}-${r.fingerprint}`,recordKey:k,files:[...inputs.map((v,i)=>({ordinal:i,path:payloadPath(s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role,parentPointer:v.parentPointer,items:v.items}})),...(r.outputPath?[{ordinal:inputs.length,path:r.outputPath,hash:r.outputFingerprint,bytes:data.files[r.outputPath].length}]:[])]});
            });
            for(const input of inputs)published.push(await w.publishPayload({...input,source:chunks(input.content)}));
            if(r.outputPath)await w.publishOutput({recordKey:k,path:r.outputPath,source:chunks(data.files[r.outputPath]),expectedBytes:data.files[r.outputPath].length,expectedHash:r.outputFingerprint});
            w.transaction(tx=>{
                tx.finishPublication({recordKey:k,operationId:`publish-${collection}-${r.fingerprint}`});
                for(const [i,name]of Object.keys(r).entries()){
                    const ref=published.find(p=>p.pointer==='/'+name&&p.parentPointer===null);
                    tx.setProperty({owner,pointer:'/'+name.replaceAll('~','~0').replaceAll('/','~1'),ordinal:i,...(ref?{payloadRef:ref}:{value:buildConflict&&name==='buildId'?data.manifest.replays[0].buildId:r[name]})});
                }
            });
        });
        if(buildConflict){const db=new DatabaseSync(path.join(root,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).database));try{db.prepare('UPDATE records SET build_id=? WHERE key=?').run(r.buildId,owner.key);db.prepare("UPDATE properties SET value=? WHERE owner_key=? AND pointer='/buildId'").run(JSON.stringify(r.buildId),owner.key);}finally{db.close();}}
        refs.push({key:k,refs:published});
        if((collection==='log'?data.fingerprints:data.scoreFingerprints).includes(r.fingerprint)){
            selected.push(...published);if(r.outputPath)selected.push({path:r.outputPath,hash:r.outputFingerprint,bytes:data.files[r.outputPath].length});
        }
    }
    selected.push({path:map.file,hash:hash(data.files[map.file]),bytes:data.files[map.file].length});
    const filler=i=>({collection:'score',replayId:'e'.repeat(24),fingerprint:hash(`m2e-unselected-${i}`)});
    if(count>ordinal)await s.withWriter(w=>w.transaction(tx=>{for(let i=ordinal;i<count;i++)tx.insertEntity({kind:'record',key:recordKey(filler(i)),ordinal:i});}));
    const largeRefs=[];
    if(large)for(let i=4;i<=9;i++) {
        const k=filler(i),owner=recordOwner(k),inputs=[0,1].map(ordinal=>{
            const j=2*(i-4)+ordinal,source=function*(){yield Buffer.from('"');let n=50*1048576-2;const b=Buffer.alloc(65536,65+j);while(n){const size=Math.min(n,b.length);yield b.subarray(0,size);n-=size;}yield Buffer.from('"');};
            return {owner,pointer:`/large-${j}`,role:'extensions',ordinal,source,...digestChunks(source())};
        });
        await s.withWriter(async w=>{
            w.transaction(tx=>tx.appendIntent({id:`m2e-unrelated-${i}`,recordKey:k,files:inputs.map(v=>({ordinal:v.ordinal,path:payloadPath(s.storeId,owner,v.pointer,v.role,v.expectedHash),hash:v.expectedHash,bytes:v.expectedBytes,payload:{owner,pointer:v.pointer,role:v.role}}))}));
            for(const v of inputs){const ref=await w.publishPayload({...v,source:v.source()});w.transaction(tx=>tx.setProperty({owner,pointer:v.pointer,ordinal:v.ordinal,payloadRef:ref}));largeRefs.push(ref);}
        });
    }
    return {root,h,s,schema,data,refs,selected,largeRefs,options:{root,schemaVersion:schema,replayId,fingerprints:data.fingerprints,scoreFingerprints:data.scoreFingerprints}};
}

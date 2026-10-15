import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureStore,recordKey} from '../../tools/replay-store.js';

export async function fixture(t){
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-store-v3-fixture-'));
    t?.diagnostic(JSON.stringify({root,synthetic:true,retained:true}));
    const store=await createFixtureStore({root,filesystem:'local-apfs'}),replayId='a'.repeat(24),mapId='b'.repeat(64),buildId='c'.repeat(64);
    const keys=[0,1].map(i=>({collection:'log',replayId,fingerprint:String(i).repeat(64)}));
    const records=keys.map((k,i)=>({...k,mapId,buildId,status:'claim',outputPath:null,outputFingerprint:null,reviews:{},unknown:{nil:null,no:false,order:[i,'synthetic']}}));
    const other={claimedAt:'original',examinedAt:null,completedAt:null,unknown:{nil:null,no:false,order:[2,1]}};
    await store.withWriter(w=>w.transaction(tx=>{
        tx.insertEntity({kind:'map',key:mapId,ordinal:0,value:{id:mapId,checksum:mapId,path:'synthetic-map.json',hash:'d'.repeat(64),status:'validated'}});
        tx.insertEntity({kind:'replay',key:replayId,ordinal:0,value:{replayId,mapId,buildId,status:'active'}});
        records.forEach((value,ordinal)=>tx.insertEntity({kind:'record',key:recordKey(keys[ordinal]),ordinal,value}));
        tx.putReview({recordKey:keys[0],taskId:'other/owner',ordinal:7,value:other});
        tx.putReview({recordKey:keys[1],taskId:'same/task',ordinal:2,value:{claimedAt:'unrelated',unknown:[null,false]}});
    }));store.close();
    return{root,keys,mapId,records,other,request:{synthetic:true,root,replayId,fingerprint:keys[0].fingerprint,taskId:'same/task',action:'claim'}};
}
export function database(root,callback){
    const d=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),db=new DatabaseSync(path.join(root,d.database));
    try{return callback(db);}finally{db.close();}
}
export function logical(root){return database(root,db=>Object.fromEntries(['store_meta','maps','replays','records','reviews','properties','outputs','payloads','operations','operation_files','retired'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));}
export function hashFiles(root){const out={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())walk(q);else{const fd=fs.openSync(q,'r'),h=createHash('sha256'),b=Buffer.alloc(65536);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));}finally{fs.closeSync(fd);}out[path.relative(root,q)]=h.digest('hex');}}}walk(root);return out;}

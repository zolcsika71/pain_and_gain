// Original-format synthetic transport generated from independently constructed data.
// Never wraps a downloaded body, never reads Arena cache or removes fixtures.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {gzipSync,crc32} from 'node:zlib';
import {createFixtureStore} from '../../tools/replay-store.js';
export const replayId='b'.repeat(24),buildId='a'.repeat(64);
export function cacheFrame(value,{collection='log',id=replayId,time=1,version=5,status=200}={}){
    const url=`https://arena.screeps.com/api/game/${id}`+(collection==='log'?`/log/${time}`:time===null?'':`/replay/${time}`),key=Buffer.from('1/0/'+url),header=Buffer.alloc(24);
    Buffer.from('305c72a71b6dfbfc','hex').copy(header);header.writeUInt32LE(version,8);header.writeUInt32LE(key.length,12);
    const body=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),compressed=gzipSync(body),meta=Buffer.from(`HTTP/1.1 ${status}\0content-length:${compressed.length}\0content-encoding:gzip\0`);
    const eof=(data,size,flags)=>{const b=Buffer.alloc(24);b.writeBigUInt64LE(0xf4fa6f45970d41d8n);b.writeUInt32LE(flags,8);b.writeUInt32LE(crc32(data)>>>0,12);b.writeUInt32LE(size,16);return b;};
    return Buffer.concat([header,key,compressed,eof(compressed,0,1),meta,createHash('sha256').update(key).digest(),eof(meta,meta.length,3)]);
}
export function log({tick=1,tag=buildId,map=true,game=true,diagnostics=true,terrain=0}={}){
    const tagged=o=>tag===undefined?o:{...o,buildId:tag};
    const entries=[];
    if(map)entries.push(JSON.stringify(tagged({type:'map-state',formatVersion:1,tick,phase:'before-actions',map:{arena:{name:'Pain and Gain',season:'4',level:1,ticksLimit:2000},terrain:{width:100,height:100,rows:Array.from({length:100},()=>Array(100).fill(terrain))},objects:[]}})));
    if(game)entries.push(JSON.stringify(tagged({type:'game-state',tick,phase:'before-actions',selectedFlagId:null,creeps:[],flags:[]})));
    if(diagnostics){entries.push(JSON.stringify({type:'runtime-cpu',formatVersion:1,buildId:tag??buildId,tick,sequence:0,recordId:tick+':0',phase:'after-actions',elapsedNs:1000,limitNs:tick===1?100000000:20000000,limitKind:tick===1?'first-tick':'ordinary-tick',unit:'nanoseconds'}));entries.push(JSON.stringify({type:'evidence-coverage',formatVersion:2,buildId:tag??buildId,tick,sequence:1,recordId:tick+':1',phase:'after-actions',firstSequence:0,lastSequence:0,recordCount:1,coveredTypes:['membership-baseline','membership-change','action-decision','action-attempt','runtime-cpu'],counts:{'membership-baseline':0,'membership-change':0,'action-decision':0,'action-attempt':0,'runtime-cpu':1,'movement-decisions':0,'healing-decisions':0,'combat-decisions':0},closed:true}));}
    return{[tick]:entries.join('\n'),note:'synthetic ordinary console'};
}
export function frames(){return[0,1,2].map(gameTime=>({gameTime,objects:[],flags:[],ui:{version:1,items:[{id:'player1-score',name:'Score',value:gameTime*2},{id:'player1-gain',name:'Gained this tick',value:2},{id:'player2-score',name:'Score',value:gameTime},{id:'player2-gain',name:'Gained this tick',value:1}]}}));}
export async function fixture(t){
    const tmp=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(tmp,'pain-gain-store-v3-fixture-')),sourceRoot=fs.mkdtempSync(path.join(tmp,'pain-gain-cache-import-fixture-')),v2=fs.mkdtempSync(path.join(tmp,'pain-gain-import-v2-fixture-'));
    fs.writeFileSync(path.join(sourceRoot,'.synthetic-cache-fixture'),'synthetic-chromium-cache-v1\n');fs.writeFileSync(path.join(v2,'.synthetic-import-fixture'),'synthetic\n');
    const store=await createFixtureStore({root,filesystem:'local-apfs'});t.after(()=>store.close());for(const p of [root,sourceRoot,v2])t.diagnostic(JSON.stringify({root:p,synthetic:true,retained:true}));
    const write=(name,value,options)=>{fs.writeFileSync(path.join(sourceRoot,name),cacheFrame(value,options));return{synthetic:true,root,sourceRoot,sourceFile:name,collection:options?.collection??'log'};};
    return{root,sourceRoot,v2,store,write};
}
export async function fixedTime(fn){const Original=Date;globalThis.Date=class extends Original{constructor(...args){super(...(args.length?args:['2026-10-13T00:00:00.000Z']));}static now(){return Original.parse('2026-10-13T00:00:00.000Z');}};try{return await fn();}finally{globalThis.Date=Original;}}

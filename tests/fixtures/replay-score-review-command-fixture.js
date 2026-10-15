import {fixture as logFixture} from './replay-log-review-command-fixture.js';
import {openStore,recordKey} from '../../tools/replay-store.js';
import {digestChunks} from '../../tools/replay-store-payloads.js';

export async function fixture(t,suffix='short'){
    const f=await logFixture(t),store=await openStore({root:f.root,mode:'write'});
    const body=Buffer.from('{"synthetic":true,"winner":1,"unknown":[null,false]}\n');
    const source=async function*(){yield body;},expected=digestChunks([body]);
    const keys=[0,1,2].map(i=>({collection:'score',replayId:i===2?'f'.repeat(24):f.request.replayId,fingerprint:String(i).repeat(64)}));
    const records=keys.map((k,i)=>({...k,status:'pending',embeddedBuildId:null,unknown:{nil:null,no:false,order:[i,'synthetic']},winner:1,reviews:{}}));
    const outputs=keys.map((k,i)=>`replay-score-source-${k.replayId}-${i===0&&suffix==='collision'?k.fingerprint+'-2':i===0&&suffix==='full'?k.fingerprint:k.fingerprint.slice(0,12)}.response`);
    try{
        await store.withWriter(async w=>{
            w.transaction(tx=>{
                tx.insertEntity({kind:'replay',key:keys[2].replayId,ordinal:1,value:{replayId:keys[2].replayId,buildId:'c'.repeat(64),status:'deferred'}});
                records.forEach((value,ordinal)=>{
                    tx.insertEntity({kind:'record',key:recordKey(keys[ordinal]),ordinal,value});
                    tx.reserveOutput({recordKey:keys[ordinal],path:outputs[ordinal],...expected});
                    tx.appendIntent({id:'score-'+ordinal,recordKey:keys[ordinal],files:[{ordinal:0,path:outputs[ordinal],hash:expected.expectedHash,bytes:expected.expectedBytes}]});
                });
                tx.putReview({recordKey:keys[0],taskId:'other/owner',ordinal:7,value:f.other});
                tx.putReview({recordKey:keys[1],taskId:'same/task',ordinal:2,value:{claimedAt:'unrelated',unknown:[null,false]}});
            });
            for(const [i,k] of keys.entries()){
                await w.publishOutput({recordKey:k,path:outputs[i],source:source(),...expected});
                w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'score-'+i}));
            }
        });
    }finally{store.close();}
    return{...f,keys,records,outputs,logKeys:f.keys,request:{...f.request},bodyHash:expected.expectedHash};
}

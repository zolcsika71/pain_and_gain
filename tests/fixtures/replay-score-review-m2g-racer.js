import fs from 'node:fs';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {openStore,recordKey} from '../../tools/replay-store.js';
import {openCatalog} from '../../tools/replay-catalog.js';
import {completeFixtureScoreReview} from '../../tools/replay-score-review-fixture.js';
import {updateFixtureReviewCheckpoint} from '../../tools/replay-review-fixture.js';
const [mode,raw]=process.argv.slice(2),q=JSON.parse(raw),k={collection:'score',replayId:q.replayId,fingerprint:q.fingerprint},send=value=>process.send(value);
const native=fs.linkSync;let waiting=false;
fs.linkSync=(a,b)=>{try{const r=native(a,b);if(String(b).endsWith('/.manifest.lock'))send({event:'acquired'});return r;}catch(e){if(e.code==='EEXIST'&&!waiting){waiting=true;send({event:'waiting'});}throw e;}};
if(mode==='hold'){
 const h=await(q.schemaVersion===1?openStore:openCatalog)({root:q.root,mode:'write'}),s=h.evidence??h;
 await s.withWriter(async w=>{send({event:'held'});const [message]=await once(process,'message');if(message.status)w.transaction(tx=>tx.setStatus({recordKey:k,status:message.status}));if(message.intent)w.transaction(tx=>tx.appendIntent({id:'race-intent',recordKey:k}));
  if(message.identity||message.owner||message.output){const d=JSON.parse(fs.readFileSync(q.root+'/manifest.json')),db=new DatabaseSync(q.root+'/'+d.database);try{if(message.identity)db.prepare("UPDATE properties SET value='\"wrong\"' WHERE owner_kind='record' AND owner_key=? AND pointer='/fingerprint'").run(recordKey(k));if(message.owner)db.prepare("UPDATE reviews SET owner_key='wrong' WHERE task=?").run(q.taskId);if(message.output)db.prepare('UPDATE outputs SET hash=? WHERE fingerprint=?').run('e'.repeat(64),q.fingerprint);}finally{db.close();}}
  if(message.descriptor){const p=q.root+'/manifest.json',d=JSON.parse(fs.readFileSync(p));d.payloadVersion=99;fs.writeFileSync(p,JSON.stringify(d));}
  if(message.root){const p=q.root+'/.storage-v3-fixture',d=JSON.parse(fs.readFileSync(p));d.root='/wrong';fs.writeFileSync(p,JSON.stringify(d));}
  if(message.retire){w.transaction(tx=>{tx.setStatus({recordKey:k,status:'retiring'});tx.appendIntent({id:'race-retire',recordKey:k,phase:'cleanup',files:message.retire.map((r,ordinal)=>({...r,ordinal}))});});for(let ordinal=0;ordinal<message.retire.length;ordinal++)await w.deleteFile({operationId:'race-retire',ordinal});w.transaction(tx=>tx.finishPublication({recordKey:k,operationId:'race-retire',retire:true}));}
 });h.close();send({event:'result',value:'released'});
}else{
 try{send({event:'result',value:await(mode==='complete'?completeFixtureScoreReview(q):updateFixtureReviewCheckpoint({...q,collection:'score',action:mode}))});}catch(e){send({event:'result',error:{code:e?.code,message:e?.message}});}
}
process.disconnect();

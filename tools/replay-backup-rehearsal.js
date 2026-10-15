// Explicit rehearsal only. No discovery, production authority, admission or cutover.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {authorizeBackupRehearsal,rehearsalOptions,rehearsalDestinationEntries,REHEARSAL_MARKER} from './replay-rehearsal-scope.js';
import {createRehearsalStore,openRehearsalStore} from './replay-store.js';
import {convertRehearsalV2} from './replay-conversion-bounded-fixture.js';
import {fail} from './replay-store-payloads.js';
const keys=['sourceRoot','root','inventory','inventorySha256','receipt','receiptSha256','acknowledge','layout','deadlineMs'];
export async function rehearseBackupV2(input){
 const o=rehearsalOptions(input,[...keys,'fault']);
 if(o.fault!==undefined&&typeof o.fault!=='function')fail('INVALID_REHEARSAL','Invalid fault callback');
 const selected=Object.fromEntries(keys.map(k=>[k,o[k]])),scope=authorizeBackupRehearsal(selected);
 const entries=rehearsalDestinationEntries(scope);
 if(entries.length===0){const store=await createRehearsalStore(scope);store.close();}
 else{
  if(!entries.includes(REHEARSAL_MARKER)||!entries.includes('manifest.json'))fail('INCOMPLETE_REHEARSAL','Existing destination is not an initialized matching rehearsal');
  const store=await openRehearsalStore(scope,'read');store.close();
 }
 return convertRehearsalV2(scope,{fault:o.fault});
}
function cli(args){
 const names={'--source':'sourceRoot','--destination':'root','--inventory':'inventory','--inventory-sha256':'inventorySha256','--receipt':'receipt','--receipt-sha256':'receiptSha256','--layout':'layout','--deadline-ms':'deadlineMs'},o={};
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(flag==='--ack-backup-rehearsal-only'){if(o.acknowledge)fail('INVALID_REHEARSAL','Duplicate acknowledgment');o.acknowledge='backup-rehearsal-only';continue;}
  const name=names[flag];if(!name||Object.hasOwn(o,name)||!args[i+1]||args[i+1].startsWith('--'))fail('INVALID_REHEARSAL','Explicit rehearsal arguments required');
  const value=args[++i];if(name==='deadlineMs'&&!/^[1-9]\d*$/.test(value))fail('INVALID_REHEARSAL','Deadline must be decimal integer milliseconds');o[name]=name==='deadlineMs'?Number(value):value;
 }return o;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await rehearseBackupV2(cli(process.argv.slice(2))),null,2));}
 catch(e){console.error(JSON.stringify({code:e.code??'REHEARSAL_FAILED',message:e.message,cleanupFailures:e.cleanupFailures}));process.exitCode=1;}
}

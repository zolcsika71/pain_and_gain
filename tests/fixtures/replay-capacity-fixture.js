// Independently generated cache/store data only; no real approvals or evidence.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fixture,log,cacheFrame} from './replay-import-command-fixture.js';
import {database,logical,hashFiles} from './replay-log-review-command-fixture.js';
import {parseCacheEntry,importCacheFile,sha256} from '../../tools/replay-logs.js';
import {convertFixtureV2Streaming} from '../../tools/replay-conversion-bounded-fixture.js';
import {withProductionLock,recoverySchemaHash} from '../../tools/replay-store.js';
import {productionSelection,productionLease} from '../../tools/replay-production-scope.js';
export {logical,hashFiles};
export const CORPUS={profile:'converted-corpus-v1',logs:320,scores:128,maps:64,replays:64,rootProperties:1024,rootBytes:8388608,operations:128};
export const CAPACITY={profile:'replay-cache-v1',wrappers:8192,diagnostics:4194304,files:2048,entries:4096,directoryIterations:1048576,cycleBytes:67108864,discoveryBytes:536870912,attemptBytes:268435456,attempts:4096,reportBytes:2097152};
function write(file,value){fs.writeFileSync(file,JSON.stringify(value)+'\n');}
function copy(source,target){fs.mkdirSync(target,{recursive:true});for(const e of fs.readdirSync(source,{withFileTypes:true})){if(e.name==='.storage-v3-fixture')continue;const a=path.join(source,e.name),b=path.join(target,e.name);if(e.isDirectory())copy(a,b);else fs.copyFileSync(a,b);}}
function directory(t,prefix){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),prefix));t.diagnostic(JSON.stringify({root,generated:true,retained:true}));return root;}
export function diagnosticLog(count=5882,width=360){const value=log(),base=parseCacheEntry(cacheFrame(value)).otherEntries.length;for(let i=0;i<count-base;i++)value['diagnostic-'+String(i).padStart(5,'0')]=JSON.stringify({type:'synthetic-capacity',sequence:i,payload:'q'.repeat(width)});return value;}
export async function selectedFixture(t,{capacity=CAPACITY,converted}={}){
    const f=await fixture(t);
    if(converted){const q=f.write('converted',converted);await importCacheFile(f.v2,path.join(q.sourceRoot,q.sourceFile));const source=directory(t,'pain-gain-v2-reader-fixture-');write(path.join(source,'.replay-v2-reader-fixture.json'),{fixture:'replay-v2-reader',version:1,filesystem:'local-apfs'});copy(path.join(f.v2,'replay_logs'),path.join(source,'replay_logs'));await convertFixtureV2Streaming({synthetic:true,sourceRoot:source,root:f.root,capacity:'expanded-synthetic-v1'});}
    const projectRoot=directory(t,'pain-gain-capacity-production-fixture-'),root=path.join(projectRoot,'replay_logs');copy(f.root,root);
    const proof={testOnly:'Generated fixture declarations; no production qualification/approval',cacheRoots:[f.sourceRoot],importBudget:CORPUS,...(capacity===null?{}:{cacheCapacity:capacity})},proofHash=sha256(JSON.stringify(proof)+'\n'),releaseHash='a'.repeat(64);write(path.join(root,'.production-proof.json'),proof);
    const descriptor=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));descriptor.production={scope:'production-authority-v1',projectRoot,mode:'read-write',epoch:0,proofHash,releaseHash,schemaHash:recoverySchemaHash()};write(path.join(root,'manifest.json'),descriptor);
    database(root,db=>db.prepare('UPDATE store_meta SET receipt=?').run(JSON.stringify({productionProofHash:proofHash,releaseHash})));
    write(path.join(root,'.production-state.json'),{phase:'active',projectRoot,storeId:descriptor.storeId,descriptorHash:sha256(fs.readFileSync(path.join(root,'manifest.json'))),proofHash,releaseHash});
    return{...f,root,projectRoot,invoke:fn=>withProductionLock(projectRoot,()=>productionLease(productionSelection(projectRoot),fn)),query:name=>({production:true,root,collection:'log',sourceRoot:f.sourceRoot,sourceFile:name})};
}
export async function unchanged(f,fn){const before=logical(f.root),files=hashFiles(f.root),r=await fn();if(JSON.stringify(logical(f.root))!==JSON.stringify(before)||JSON.stringify(hashFiles(f.root))!==JSON.stringify(files))throw Error('Unexpected fixture mutation');return r;}

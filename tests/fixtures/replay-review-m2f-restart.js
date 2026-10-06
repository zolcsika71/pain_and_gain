import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mock} from 'node:test';
import * as core from '../../tools/replay-store.js';
import * as catalog from '../../tools/replay-catalog.js';
const [mode,raw]=process.argv.slice(2),q=JSON.parse(raw);
const wrap=opener=>options=>opener({...options,fault:boundary=>{if(mode==='before'&&boundary==='transaction-commit')process.kill(process.pid,'SIGKILL');}});
mock.module(new URL('../../tools/replay-store.js',import.meta.url).href,{namedExports:{...core,openStore:wrap(core.openStore)}});
mock.module(new URL('../../tools/replay-catalog.js',import.meta.url).href,{namedExports:{...catalog,openCatalog:wrap(catalog.openCatalog)}});
if(mode==='after'){const native=DatabaseSync.prototype.exec;DatabaseSync.prototype.exec=function(sql){const r=native.call(this,sql);if(sql==='COMMIT'&&this.isOpen&&armed)process.kill(process.pid,'SIGKILL');return r;};const prepare=DatabaseSync.prototype.prepare;let armed=false;DatabaseSync.prototype.prepare=function(sql){if(sql.startsWith('UPDATE store_meta SET generation'))armed=true;return prepare.call(this,sql);};}
if(mode==='hot'){
 const h=await(q.schemaVersion===1?core.openStore:catalog.openCatalog)({root:q.root,mode:'write'});
 await(h.evidence??h).withWriter(()=>{const d=JSON.parse(fs.readFileSync(q.root+'/manifest.json')),db=new DatabaseSync(q.root+'/'+d.database);db.exec('PRAGMA synchronous=FULL;PRAGMA cache_size=8;BEGIN IMMEDIATE');const s=db.prepare('INSERT INTO properties VALUES (?,?,?,?,?,NULL)');for(let i=0;i<1000;i++)s.run('root','root','/interrupted'+i,i,JSON.stringify('x'.repeat(60000)));process.kill(process.pid,'SIGKILL');});
}else{const {updateFixtureReviewCheckpoint}=await import('../../tools/replay-review-fixture.js');await updateFixtureReviewCheckpoint(q);throw Error('Crash boundary not reached');}

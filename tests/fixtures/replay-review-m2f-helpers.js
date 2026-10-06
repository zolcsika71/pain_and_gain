import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
export const golden=JSON.parse(fs.readFileSync(new URL('./replay-review-m2f-oracle.json',import.meta.url)));
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
export const dbPath=root=>path.join(root,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).database);
export function database(root,fn){const db=new DatabaseSync(dbPath(root));try{return fn(db);}finally{db.close();}}
export function logical(root){return database(root,db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>{const s=db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`);s.setReadBigInts(true);return[name,JSON.parse(json(s.all()))];})));}
export function artifacts(root){const entries={};function walk(dir){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),st=fs.lstatSync(p);if(st.isDirectory())walk(p);else if(!p.endsWith('/index.sqlite')){assert.ok(st.isFile());const h=createHash('sha256'),fd=fs.openSync(p,'r'),b=Buffer.alloc(65536);try{for(;;){const n=fs.readSync(fd,b,0,b.length,null);if(!n)break;h.update(b.subarray(0,n));}}finally{fs.closeSync(fd);}entries[path.relative(root,p)]={bytes:st.size,hash:h.digest('hex'),dev:st.dev,ino:st.ino,nlink:st.nlink,blocks:st.blocks};}}}walk(root);return entries;}
export function clock(iso){const Native=Date;globalThis.Date=class extends Native{constructor(...a){super(...(a.length?a:[iso]));}static now(){return Native.now();}};return()=>{globalThis.Date=Native;};}
export function measure(){
 const native={open:fs.openSync,read:fs.readSync,readFile:fs.readFileSync,close:fs.closeSync,write:fs.writeSync,prepare:DatabaseSync.prototype.prepare,exec:DatabaseSync.prototype.exec,dbClose:DatabaseSync.prototype.close};
 const fds=new Set(),dbs=new Set(),plans=[],m={sql:0,pragmas:0,rows:0,metadataOpens:0,connections:0,transactions:0,commits:0,rollbacks:0,payloadOpens:0,payloadReadBytes:0,payloadWrites:0,corpusScans:0};
 const evidence=p=>/\/(extensions|summaries|diagnostics)\//.test(String(p))||/\.(response|jsonl)$/.test(String(p))||String(p).includes('/pain_and_gain_map_');
 fs.openSync=(p,...a)=>{if(evidence(p)){m.payloadOpens++;assert.fail('Checkpoint opened evidence');}const fd=native.open(p,...a);fds.add(fd);m.metadataOpens++;return fd;};
 fs.readFileSync=(p,...a)=>{assert.ok(!evidence(p),'Checkpoint readFile evidence');return native.readFile(p,...a);};
 fs.closeSync=fd=>{fds.delete(fd);return native.close(fd);};
 const count=sql=>{if(/^PRAGMA /i.test(sql))m.pragmas++;else m.sql++;assert.ok(m.sql+m.pragmas<=128,'128 SQL call ceiling');};
 DatabaseSync.prototype.exec=function(sql){dbs.add(this);count(sql);if(sql==='BEGIN IMMEDIATE')m.transactions++;if(sql==='COMMIT')m.commits++;if(sql==='ROLLBACK')m.rollbacks++;return native.exec.call(this,sql);};
 DatabaseSync.prototype.prepare=function(sql){dbs.add(this);count(sql);if(/^SELECT /i.test(sql)&&/ FROM /i.test(sql)&&!sql.includes('FROM store_meta')){const plan=native.prepare.call(this,'EXPLAIN QUERY PLAN '+sql).all(...Array((sql.match(/\?/g)??[]).length).fill(null));for(const p of plan){if(/\bSCAN\b/.test(p.detail))m.corpusScans++;assert.ok(!/\bSCAN\b|USE TEMP B-TREE/.test(p.detail),p.detail);}plans.push({sql,plan});}
  assert.ok(!/SELECT .*\bvalue\b.* FROM reviews/i.test(sql),'No review projection hydration');
  const s=native.prepare.call(this,sql),get=s.get,all=s.all,iterate=s.iterate;const rows=n=>{m.rows+=n;assert.ok(m.rows<=128,'128 returned-row ceiling');};
  s.get=function(...a){const r=get.apply(this,a);rows(r?1:0);return r;};s.all=function(...a){const r=all.apply(this,a);rows(r.length);return r;};s.iterate=function*(...a){for(const r of iterate.apply(this,a)){rows(1);yield r;}};return s;};
 DatabaseSync.prototype.close=function(){m.connections++;dbs.delete(this);return native.dbClose.call(this);};
 return {m,plans,restore(){Object.assign(fs,{openSync:native.open,readSync:native.read,readFileSync:native.readFile,closeSync:native.close,writeSync:native.write});Object.assign(DatabaseSync.prototype,{prepare:native.prepare,exec:native.exec,close:native.dbClose});assert.equal(fds.size,0);assert.equal(dbs.size,0);}};
}

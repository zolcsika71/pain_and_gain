import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {recordKey} from '../../tools/replay-store.js';
export {hash,json,logical,artifacts,clock,database,dbPath} from './replay-review-m2f-helpers.js';
export const golden=JSON.parse(fs.readFileSync(new URL('./replay-score-review-m2g-oracle.json',import.meta.url)));
export const task=i=>'codex/m2g-r'+String(i).padStart(4,'0');
export const request=(f,kind=0,taskId='codex/m2g-test')=>({root:f.root,schemaVersion:f.schema,replayId:f.options.replayId,fingerprint:f.options.scoreFingerprints[kind],taskId});
export const key=q=>({collection:'score',replayId:q.replayId,fingerprint:q.fingerprint});
export const owner=q=>({kind:'review',key:JSON.stringify([recordKey(key(q)),q.taskId])});
export async function seed(f,R){await f.s.withWriter(w=>w.transaction(tx=>{for(const kind of [0,1])for(let i=0;i<R;i++)tx.putReview({recordKey:key(request(f,kind)),taskId:task(i),ordinal:7+2*i,value:{claimedAt:'2026-10-06T00:00:00.000Z',examinedAt:'2026-10-06T00:00:10.000Z',completedAt:kind===0&&i>=Math.max(0,R-2)?null:'2026-10-06T00:00:20.000Z',note:{zero:0,flag:false}}});}));}
// Expected logical effects come only from the frozen committed-v2 step, never
// from the candidate return value. Ordinal bookkeeping is a separate control.
export function expectedChange(before,q,step){
 const expected=structuredClone(before);if(step.error||!step.changed)return expected;
 const k=recordKey(key(q)),o=owner(q).key;
 if(step.completionChanged){const review=expected.reviews.find(r=>r.owner_key===o);review.value=null;const existing=expected.properties.find(p=>p.owner_kind==='review'&&p.owner_key===o&&p.pointer==='/completedAt');if(existing)existing.value=JSON.stringify(step.checkpoints.completedAt.value);else{const tail=expected.properties.filter(p=>p.owner_kind==='review'&&p.owner_key===o).reduce((n,p)=>BigInt(p.ordinal)>n?BigInt(p.ordinal):n,-1n);expected.properties.push({owner_kind:'review',owner_key:o,pointer:'/completedAt',ordinal:String(tail+1n),value:JSON.stringify(step.checkpoints.completedAt.value),payload_pointer:null});}}
 if(step.statusChanged){expected.records.find(r=>r.key===k).status='done';const existing=expected.properties.find(p=>p.owner_kind==='record'&&p.owner_key===k&&p.pointer==='/status');if(existing)existing.value='"done"';else{const tail=expected.properties.filter(p=>p.owner_kind==='record'&&p.owner_key===k).reduce((n,p)=>BigInt(p.ordinal)>n?BigInt(p.ordinal):n,-1n);expected.properties.push({owner_kind:'record',owner_key:k,pointer:'/status',ordinal:String(tail+1n),value:'"done"',payload_pointer:null});}}
 expected.store_meta[0].generation=String(BigInt(expected.store_meta[0].generation)+1n);return expected;
}
export function measure(){
 const native={prepare:DatabaseSync.prototype.prepare,exec:DatabaseSync.prototype.exec,dbClose:DatabaseSync.prototype.close},saved={},fds=new Set(),dbs=new Set(),plans=[];
 const m={sql:0,pragmas:0,statements:0,rows:0,pages:0,reviewerRows:0,metadataOpens:0,connections:0,transactions:0,commits:0,rollbacks:0,payloadOpens:0,payloadReadBytes:0,payloadWrites:0,corpusScans:0};
 const evidence=p=>typeof p==='string'&&(/\/(extensions|summaries|diagnostics)\//.test(p)||/\.(response|jsonl)$/.test(p)||p.includes('/pain_and_gain_map_'));
 for(const name of ['openSync','readFileSync','writeFileSync','appendFileSync','statSync','lstatSync','unlinkSync','renameSync','linkSync','createReadStream','createWriteStream']){
  saved[name]=fs[name];fs[name]=function(...args){assert.ok(!evidence(args[0])&&!(['renameSync','linkSync'].includes(name)&&evidence(args[1])),'Completion evidence access '+name);const r=saved[name].apply(this,args);if(name==='openSync'){fds.add(r);m.metadataOpens++;}return r;};
 }
 saved.closeSync=fs.closeSync;fs.closeSync=fd=>{const r=saved.closeSync(fd);fds.delete(fd);return r;};
 const count=sql=>{if(/^PRAGMA /i.test(sql))m.pragmas++;else m.sql++;m.statements+=sql.split(';').filter(s=>s.trim()).length;assert.ok(m.sql+m.pragmas<=160,'absolute SQL limit');};
 DatabaseSync.prototype.exec=function(sql){dbs.add(this);count(sql);if(sql==='BEGIN IMMEDIATE')m.transactions++;if(sql==='COMMIT')m.commits++;if(sql==='ROLLBACK')m.rollbacks++;return native.exec.call(this,sql);};
 DatabaseSync.prototype.prepare=function(sql){dbs.add(this);count(sql);const isPage=sql.includes('FROM reviews AS r');if(isPage)m.pages++;
  if(/^SELECT /i.test(sql)&&/ FROM /i.test(sql)&&!sql.includes('FROM store_meta')){const plan=native.prepare.call(this,'EXPLAIN QUERY PLAN '+sql).all(...Array((sql.match(/\?/g)??[]).length).fill(null));for(const p of plan){if(/\bSCAN\b/.test(p.detail))m.corpusScans++;assert.ok(!/\bSCAN\b|USE TEMP B-TREE/.test(p.detail),p.detail);}plans.push({sql,plan});}
  assert.ok(!/SELECT .*\bvalue\b.* FROM reviews/i.test(sql),'No review value hydration');
  const s=native.prepare.call(this,sql),get=s.get,all=s.all,iterate=s.iterate,rows=n=>{m.rows+=n;if(isPage)m.reviewerRows+=n;assert.ok(m.rows<=1160,'absolute returned-row limit');};
  s.get=function(...a){const r=get.apply(this,a);rows(r?1:0);return r;};s.all=function(...a){const r=all.apply(this,a);rows(r.length);return r;};s.iterate=function*(...a){for(const r of iterate.apply(this,a)){rows(1);yield r;}};return s;
 };
 DatabaseSync.prototype.close=function(){const r=native.dbClose.call(this);m.connections++;dbs.delete(this);return r;};
 return{m,plans,restore(){Object.assign(fs,saved);Object.assign(DatabaseSync.prototype,{prepare:native.prepare,exec:native.exec,close:native.dbClose});assert.equal(fds.size,0);assert.equal(dbs.size,0);}};
}

// Internal, locked synthetic corpus reconciliation. Not a read-only store API.
import {fail} from './replay-store-payloads.js';
import {Buffer} from 'node:buffer';
import {performance} from 'node:perf_hooks';
export const LIST_LIMITS=Object.freeze({records:512,reviews:4096,rows:65536,metadataBytes:16*1048576,files:1024,artifactBytes:64*1048576,sql:100000,deadlineMs:60000,pageSize:128});
const encoded=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const own=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});
function snapshot(value,allowed){
    if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('INVALID_ARGUMENT','Plain list options required');
    const out={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(!allowed.includes(key)||!Object.hasOwn(d,'value'))fail('INVALID_ARGUMENT','Unsupported/accessor list option');own(out,key,d.value);}return out;
}
export function listLimits(options={}){
    const o=snapshot(options,['limits']),limits={...LIST_LIMITS},given=o.limits===undefined?{}:snapshot(o.limits,Object.keys(limits));
    for(const [k,v]of Object.entries(given)){if(!Number.isSafeInteger(v)||v<1||v>limits[k])fail('RESOURCE_LIMIT','Invalid/reduced-only list limit '+k);limits[k]=v;}return Object.freeze(limits);
}
export function logListWriter({ensure,transactionActive,query,page,transaction,retire,metrics,setGuard,inject,neutralOnly=false}){
    let busy=false;
    async function reconcile(options={},migrationOnly=false){
        ensure();if(busy||transactionActive())fail('INVALID_STATE','Nonnested list required');const limits=listLimits(options);busy=true;
        const start=performance.now(),initialSql=metrics.sql,initialRead=metrics.payloadReadBytes;
        const check=()=>{if(performance.now()-start>limits.deadlineMs||metrics.sql-initialSql>limits.sql||metrics.payloadReadBytes-initialRead>2*limits.artifactBytes)fail('RESOURCE_LIMIT','List execution/I/O budget exhausted');};
        setGuard(check);
        let rows=0,bytes=0,reviews=0,files=0,artifactBytes=0n;
        const charge=value=>{check();bytes+=Buffer.byteLength(encoded(value));if(++rows>limits.rows||bytes>limits.metadataBytes)fail('RESOURCE_LIMIT','List metadata budget exhausted');};
        const sql=(s,a=[],method='get')=>{ensure();const r=query(s,a,method);for(const row of method==='all'?r:r?[r]:[])charge(row);return r;};
        const gen=()=>String(sql('SELECT generation FROM store_meta').generation);
        const parse=p=>{if(p.value===null||p.payload_pointer!==null)fail('UNSUPPORTED_REPRESENTATION','List field requires inline metadata');try{return JSON.parse(p.value);}catch{fail('INVALID_REFERENCE','Invalid list JSON');}};
        const fields={replayId:'replay_id',fingerprint:'fingerprint',mapId:'map_id',buildId:'build_id',status:'status',outputPath:'output_path',outputFingerprint:'output_hash'};
        function properties(kind,key){
            const out=[];let cursor=null;do{const p=page('SELECT pointer,ordinal,value,payload_pointer FROM properties WHERE owner_kind=? AND owner_key=?',[kind,key],'pointer',cursor,limits.pageSize,['list-properties',kind,key]);for(const r of p.rows){charge(r);out.push(r);}cursor=p.cursor;}while(cursor);return out;
        }
        function collect(r){
            if(neutralOnly&&r.status!=='claim')fail('UNSUPPORTED_STATE','Rehearsal scan requires neutral reconciliation');
            const k={collection:'log',replayId:r.replay_id,fingerprint:r.fingerprint},key=JSON.stringify(['log',r.replay_id,r.fingerprint]);
            if(r.key!==key||!['claim','waiting','done'].includes(r.status))fail('UNSUPPORTED_STATE','List supports claim/waiting/done logs only');
            if(sql('SELECT key FROM retired WHERE key=?',[key]))fail('INVALID_REFERENCE','Current/retired list conflict');
            const ps=properties('record',key),selected={};let statusOrdinal,hasReviews=false;
            for(const p of ps){
                const name=p.pointer.slice(1);
                if(Object.hasOwn(fields,name)){const value=parse(p);if(value!==r[fields[name]])fail('INVALID_REFERENCE','List original/projection conflict');own(selected,name,value);if(name==='status')statusOrdinal=p.ordinal;}
                else if(['mapFile','coverage','diagnosticCoverage'].includes(name))own(selected,name,parse(p));
                else if(name==='reviews'){const value=parse(p);if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length)fail('UNSUPPORTED_REPRESENTATION','Empty review layout marker required');hasReviews=true;}
                else if(name==='otherEntries'){
                    if(p.payload_pointer===null){const value=parse(p);if(!Array.isArray(value))fail('INVALID_REFERENCE','Diagnostic array required');selected.otherEntries=value.length;}
                    else{
                        const ref=sql('SELECT * FROM payloads WHERE owner_kind=? AND owner_key=? AND pointer=?',['record',key,p.payload_pointer]);
                        if(p.value!==null||p.payload_pointer!=='/otherEntries'||!ref||ref.parent!==null||ref.role!=='diagnostics'||ref.encoding!=='jsonl-v1'||ref.state!=='ready'||!Number.isSafeInteger(ref.items)||ref.items<0)fail('INVALID_REFERENCE','Invalid diagnostic count binding');
                        if(sql('SELECT pointer FROM payloads WHERE owner_kind=? AND owner_key=? AND parent=? LIMIT 1',['record',key,ref.pointer]))fail('UNSUPPORTED_REPRESENTATION','List diagnostic count requires a leaf');
                        selected.otherEntries=ref.items;
                    }
                }
            }
            if(statusOrdinal===undefined||selected.replayId!==k.replayId||selected.fingerprint!==k.fingerprint||selected.otherEntries===undefined||!hasReviews)fail('UNSUPPORTED_REPRESENTATION','Missing list originals');
            const values={};let cursor=null;
            do{const p=page('SELECT * FROM reviews WHERE collection=? AND replay_id=? AND fingerprint=?',['log',k.replayId,k.fingerprint],'task',cursor,limits.pageSize,['list-reviews',key]);
                for(const row of p.rows){charge(row);if(++reviews>limits.reviews)fail('RESOURCE_LIMIT','List review count exceeded');const owner=JSON.stringify([key,row.task]);if(row.owner_key!==owner)fail('OWNERSHIP_CONFLICT','List review owner conflict');const value={};
                    for(const property of properties('review',owner)){if(!/^\/(?:[^/~]|~[01])*$/.test(property.pointer))fail('UNSUPPORTED_REPRESENTATION','Top-level review properties required');own(value,property.pointer.slice(1).replaceAll('~1','/').replaceAll('~0','~'),parse(property));}
                    if(row.value!==null&&JSON.stringify(value)!==JSON.stringify(JSON.parse(row.value)))fail('INVALID_REFERENCE','List inline review conflict');own(values,row.task,value);
                }cursor=p.cursor;
            }while(cursor);
            if(r.status==='done'&&(!Object.keys(values).length||Object.values(values).some(v=>!v.examinedAt||!v.completedAt)))fail('NOT_REVIEWED','Done log lacks completed owners');
            const intent=sql('SELECT id FROM operations WHERE collection=? AND replay_id=? AND fingerprint=? LIMIT 1',['log',k.replayId,k.fingerprint]);
            if(r.status!=='done'&&intent)fail('NOT_READY','List cannot migrate/list pending publication');
            if(r.status==='waiting'){
                const o=sql('SELECT * FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=?',['log',k.replayId,k.fingerprint]);
                if(o&&(o.state!=='ready'||o.path!==r.output_path||o.hash!==r.output_hash)||!o&&(r.output_path!==null||r.output_hash!==null))fail('INVALID_REFERENCE','Waiting output reservation conflict');
                if(sql('SELECT pointer FROM payloads WHERE owner_kind=? AND owner_key=? AND state!=? LIMIT 1',['record',key,'ready']))fail('NOT_READY','Waiting payload not ready');
            }
            if(r.status==='done'){
                // Count all record/review artifacts without reading bodies. The
                // retirement API independently validates ownership and each byte.
                const o=sql('SELECT bytes FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=?',['log',k.replayId,k.fingerprint]);
                const account=f=>{if(++files>limits.files||!Number.isSafeInteger(f.bytes)||f.bytes<0)fail('RESOURCE_LIMIT','List file budget exceeded');artifactBytes+=BigInt(f.bytes);if(artifactBytes>BigInt(limits.artifactBytes))fail('RESOURCE_LIMIT','List artifact budget exceeded');};if(o)account(o);
                for(const owner of [{kind:'record',key},...Object.keys(values).map(task=>({kind:'review',key:JSON.stringify([key,task])}))]){let c=null;do{const p=page('SELECT pointer,ordinal,bytes FROM payloads WHERE owner_kind=? AND owner_key=?',[owner.kind,owner.key],'pointer',c,limits.pageSize,['list-files',owner]);for(const f of p.rows){charge(f);account(f);}c=p.cursor;}while(c);}
            }
            const report={replayId:selected.replayId,fingerprint:selected.fingerprint,outputPath:selected.outputPath,mapId:selected.mapId,mapFile:selected.mapFile,buildId:selected.buildId??null,status:r.status==='waiting'?'claim':r.status,coverage:selected.coverage,diagnosticCoverage:selected.diagnosticCoverage??null,reviews:values,otherEntries:selected.otherEntries};charge(report);
            return{k,key,status:r.status,statusOrdinal,report};
        }
        try{
            let generation=gen(),cursor=null;const plan=[];
            do{ensure();const p=page('SELECT * FROM records WHERE collection=?',['log'],'key',cursor,limits.pageSize,['list-records']);if(String(p.generation)!==generation)fail('STALE_CURSOR','List snapshot changed');for(const r of p.rows){charge(r);if(plan.length>=limits.records)fail('RESOURCE_LIMIT','List corpus exceeds bound');plan.push(collect(r));}cursor=p.cursor;}while(cursor);
            inject('list-preflight');if(gen()!==generation)fail('STALE_CURSOR','List changed before reconciliation');
            const waiting=plan.filter(p=>p.status==='waiting');
            if(waiting.length){transaction(tx=>{for(const p of waiting){const r=sql('SELECT status FROM records WHERE key=?',[p.key]);if(r?.status!=='waiting')fail('INVALID_STATE','Waiting eligibility changed');sql('UPDATE records SET status=? WHERE key=?',['claim',p.key],'run');tx.setProperty({owner:{kind:'record',key:p.key},pointer:'/status',ordinal:p.statusOrdinal,value:'claim'});}});generation=String(BigInt(generation)+1n);}
            inject('list-waiting-committed');let retired=0;
            for(const p of plan){if(migrationOnly||p.status!=='done')continue;if(gen()!==generation)fail('STALE_CURSOR','List changed before retirement');const result=await retire(p.k);generation=result.generation;retired++;inject('list-record-retired');if(gen()!==generation)fail('STALE_CURSOR','List changed during retirement');}
            inject('list-before-result');if(gen()!==generation)fail('STALE_CURSOR','List changed before result');check();
            return{records:plan.filter(p=>p.status!=='done').map(p=>p.report),migrated:waiting.length,retired,generation};
        }finally{setGuard(null);busy=false;}
    }
    return{reconcileLogList:options=>reconcile(options),migrateLogStatuses:options=>reconcile(options,true)};
}

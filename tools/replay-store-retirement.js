// Internal M2h capabilities. The core supplies its locked connection; no public SQL hook.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fail,payloadPath} from './replay-store-payloads.js';
import {resident,withCleanup} from './retrieval-files.js';

const MAX = 9_223_372_036_854_775_807n, HEX = /^[a-f0-9]{64}$/, TASK = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const json = v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const size = v=>Buffer.byteLength(json(v));
const parse = v=>{try{return JSON.parse(v);}catch{fail('INVALID_REFERENCE','Malformed retirement metadata JSON');}};
const next = n=>{const value=n===undefined?0n:BigInt(n)+1n;if(value>MAX)fail('RESOURCE_LIMIT','Retirement ordinal exhausted');return value;};
const prefixOf = key=>JSON.stringify([key]).slice(0,-1)+',';
const upperOf = prefix=>prefix.slice(0,-1)+'-';
const compare = (a,b)=>{for(const n of ['owner_kind','owner_key','pointer']){const c=Buffer.compare(Buffer.from(a[n]),Buffer.from(b[n]));if(c)return c;}return 0;};

export function scoreRetirementWriter({storeId,ensure,transaction,transactionActive,checkpoints,query,rowBudget,safePath,syncDir,metrics,inject,collection='score'}) {
    if(!['log','score'].includes(collection))fail('INVALID_IDENTITY','Retirement collection required');
    const log=collection==='log';
    const keyOf=k=>{if(k?.collection!==collection||typeof k.replayId!=='string'||!/^[a-f0-9]{24}$/.test(k.replayId)||typeof k.fingerprint!=='string'||!HEX.test(k.fingerprint))fail('INVALID_IDENTITY','Exact collection identity required');return JSON.stringify([collection,k.replayId,k.fingerprint]);};
    const tuple=k=>[collection,k.replayId,k.fingerprint];
    const sameIdentity=(r,k)=>r&&r.collection===collection&&r.replay_id===k.replayId&&r.fingerprint===k.fingerprint;
    const opOf=k=>`${log?'log':'m2h'}-retire:${k.replayId}:${k.fingerprint}`;
    const cursors = new WeakMap(); let copied=0,sqlCalls=0,returned=0,busy=false;
    const charge = value=>{copied+=size(value);if(copied>8*1048576)fail('RESOURCE_LIMIT','Retirement cumulative metadata exceeds 8 MiB');};
    const sql = (text,args=[],method='get',account=true)=>{
        ensure();if(++sqlCalls>4900)fail('RESOURCE_LIMIT','Retirement SQL work exhausted');
        const result=query(text,args,method);
        if(method!=='run'){const rows=method==='all'?result:result?[result]:[];returned+=rows.length;if(returned>45000)fail('RESOURCE_LIMIT','Retirement returned-row work exhausted');for(const row of rows)rowBudget(row);if(account)charge(result??null);}
        return result;
    };
    const generation = ()=>BigInt(sql('SELECT generation FROM store_meta').generation);
    const original = (kind,key,names)=>sql(`SELECT pointer,ordinal,value,payload_pointer FROM properties WHERE owner_kind=? AND owner_key=? AND pointer IN (${names.map(()=>'?').join(',')})`,[kind,key,...names],'all',false);
    const tail = (kind,key)=>sql('SELECT ordinal FROM properties WHERE owner_kind=? AND owner_key=? ORDER BY ordinal DESC,pointer DESC LIMIT 1',[kind,key],'get',false)?.ordinal;
    function readScoreRetirementFacts({recordKey:k}) {
        ensure();const key=keyOf(k),get=(s,p=[])=>sql(s,p,'get',false);
        const current=get('SELECT * FROM records WHERE collection=? AND replay_id=? AND fingerprint=?',tuple(k)),retired=get('SELECT * FROM retired WHERE collection=? AND replay_id=? AND fingerprint=?',tuple(k));
        const f={current,retired,generation:get('SELECT generation FROM store_meta').generation,
            retiredCollection:get('SELECT * FROM collections WHERE key=?',['retiredScoreSources']),
            retiredPresence:original('collection','retiredScoreSources',['/present'])};
        if(retired)f.tombstone=original('retired',key,['/sourceType','/replayId','/fingerprint']);
        if(current)Object.assign(f,{
            recordProperties:original('record',key,['/collection','/replayId','/fingerprint','/mapId','/buildId','/status','/outputPath','/outputFingerprint']),
            recordTail:tail('record',key),collectionTail:tail('collection','retiredScoreSources'),
            scoreCollection:get('SELECT * FROM collections WHERE key=?',['scoreRecords']),scorePresence:original('collection','scoreRecords',['/present']),
            anyTombstone:get('SELECT key FROM retired WHERE collection=? LIMIT 1',['score']),
            retiredOrphanProperty:get('SELECT pointer FROM properties WHERE owner_kind=? AND owner_key=? LIMIT 1',['retired',key]),
            retiredOrphanPayload:get('SELECT pointer FROM payloads WHERE owner_kind=? AND owner_key=? LIMIT 1',['retired',key]),
            output:get('SELECT * FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=?',tuple(k)),
            operation:get('SELECT * FROM operations WHERE id=?',[opOf(k)])
        });
        if(log){
            f.replay=get('SELECT * FROM replays WHERE key=?',[k.replayId]);
            f.replayProperties=original('replay',k.replayId,['/replayId','/mapId','/buildId','/status']);
            if(current){f.map=get('SELECT * FROM maps WHERE key=?',[current.map_id]);f.logAliases=original('record',key,['/mapChecksum','/mapFile']);}
            f.history=original('replay',k.replayId,['/retiredFingerprints']);
            f.historyTail=tail('replay',k.replayId);
            f.index=sql('SELECT fingerprint,ordinal FROM retired WHERE collection=? AND replay_id=? ORDER BY ordinal,key LIMIT 129',['log',k.replayId],'all');
            if(f.index.length>128)fail('RESOURCE_LIMIT','Log history exceeds 128 entries');
        }
        if(size(f)>16384)fail('RESOURCE_LIMIT','Retirement facts exceed 16 KiB');charge(f);return f;
    }
    function pageScoreRetirementInventory({recordKey:k,section,after=null}) {
        ensure();const key=keyOf(k),gen=String(generation()),old=after===null?null:cursors.get(after);
        if(after!==null&&(!old||old.key!==key||old.section!==section||old.generation!==gen))fail('STALE_CURSOR','Foreign, stale or expired retirement cursor');
        const review=section==='review-properties'||section==='review-payloads',property=section==='record-properties'||section==='review-properties',payload=section==='record-payloads'||section==='review-payloads';
        let text,args,keys;
        if(property||payload){
            const table=property?'properties':'payloads',alias='p',prefix=prefixOf(key);
            const fields=property?'p.owner_kind,p.owner_key,p.pointer,p.ordinal,p.payload_pointer,ref.pointer AS ref_pointer':'p.*';
            const binding=review?',r.collection AS bound_collection,r.replay_id AS bound_replay,r.fingerprint AS bound_fingerprint,r.task AS bound_task':'';
            const joins=(property?' LEFT JOIN payloads AS ref ON ref.owner_kind=p.owner_kind AND ref.owner_key=p.owner_key AND ref.pointer=p.payload_pointer':'')+(review?' LEFT JOIN reviews AS r ON r.owner_key=p.owner_key':'');
            keys=review?['owner_key','pointer']:['pointer'];
            text=`SELECT ${fields}${binding} FROM ${table} AS ${alias}${joins} WHERE p.owner_kind=? AND ${review?'p.owner_key>=? AND p.owner_key<? AND (p.owner_key,p.pointer)>(?,?)':`p.owner_key=? AND p.pointer${old?'>':'>='}?`} ORDER BY ${keys.map(n=>'p.'+n).join(',')} LIMIT 128`;
            args=review?['review',prefix,upperOf(prefix),...(old?.last??['',''])]:['record',key,...(old?.last??[''])];
        }else if(section==='operations'){
            // The admitted domain has at most one selected operation. A second
            // row is a rejection sentinel, not an invitation to sort its corpus.
            keys=['id'];text='SELECT * FROM operations WHERE collection=? AND replay_id=? AND fingerprint=? LIMIT 2';args=tuple(k);
        }else if(section==='files'){
            keys=['ordinal'];text='SELECT * FROM operation_files WHERE operation_id=? AND ordinal>? ORDER BY ordinal LIMIT 128';args=[opOf(k),...(old?.last??[-1])];
        }else fail('INVALID_ARGUMENT','Unknown retirement inventory section');
        const rows=sql(text,args,'all',false);let cursor=null;
        if(rows.length===128){const last=keys.map(n=>rows.at(-1)[n]);cursor=Object.freeze({storeId,generation:gen,record:key,section,last:last.map(String)});cursors.set(cursor,{generation:gen,key,section,last});}
        const page={rows,cursor};if(size(page)>1048576)fail('RESOURCE_LIMIT','Retirement page exceeds 1 MiB');charge(page);return page;
    }
    const validatePresence = (row,properties)=>{
        if(!row||![0,1].includes(Number(row.present)))fail('INVALID_REFERENCE','Missing or invalid collection presence');
        for(const p of properties)if(p.payload_pointer!==null||p.value===null||typeof parse(p.value)!=='boolean'||Number(parse(p.value))!==Number(row.present))fail('INVALID_REFERENCE','Collection original/projection mismatch');
    };
    function validateFacts(f,k) {
        const key=keyOf(k);
        if(f.current&&f.retired)fail('INVALID_REFERENCE','Current/tombstone conflict');
        if(!f.current&&!f.retired)fail('MISSING_RECORD','Score not found');
        const r=f.current??f.retired;if(r.key!==key||!sameIdentity(r,k))fail('INVALID_REFERENCE','Score key/projection mismatch');
        if(log){
            if(!f.replay||f.replay.status!=='active'||f.history.length>1)fail('INVALID_REFERENCE','Log history association unavailable');
            const fields={'/replayId':'key','/mapId':'map_id','/buildId':'build_id','/status':'status'};
            for(const p of f.replayProperties)if(p.payload_pointer!==null||p.value===null||parse(p.value)!==f.replay[fields[p.pointer]])fail('INVALID_REFERENCE','Log replay original mismatch');
            const p=f.history[0];
            if(p&&(p.payload_pointer!==null||p.value===null))fail('UNSUPPORTED_REPRESENTATION','Log history must be bounded inline');
            f.historyValue=p?parse(p.value):[];
            if(!Array.isArray(f.historyValue)||f.historyValue.length>128||f.historyValue.some(v=>typeof v!=='string'||!HEX.test(v))||new Set(f.historyValue).size!==f.historyValue.length)fail('INVALID_REFERENCE','Invalid log history');
            if(f.index.length!==f.historyValue.length||f.index.some((r,i)=>r.fingerprint!==f.historyValue[i]||BigInt(r.ordinal)!==BigInt(i)))fail('INVALID_REFERENCE','Log history/index mismatch');
            if(f.retired){if(!f.historyValue.includes(k.fingerprint))fail('INVALID_REFERENCE','Missing retired log history');return;}
            if(f.historyValue.includes(k.fingerprint))fail('INVALID_REFERENCE','Current/history conflict');
            if(f.historyValue.length===128)fail('RESOURCE_LIMIT','Log history full');
            if(f.replay.map_id!==r.map_id||r.build_id!==null&&f.replay.build_id!==null&&r.build_id!==f.replay.build_id)fail('INVALID_REFERENCE','Log retirement linkage mismatch');
            if(!f.map||f.map.status!=='validated')fail('INVALID_REFERENCE','Log retirement map unavailable');
            for(const p of f.logAliases)if(p.payload_pointer!==null||p.value===null||parse(p.value)!==(p.pointer==='/mapChecksum'?r.map_id:f.map.path))fail('INVALID_REFERENCE','Log original map alias mismatch');
        }else validatePresence(f.retiredCollection,f.retiredPresence);
        if(f.retired){
            if(Number(f.retiredCollection.present)!==1)fail('INVALID_REFERENCE','Retired collection absent');
            const expected={sourceType:'replay-score-source',replayId:k.replayId,fingerprint:k.fingerprint};
            if(f.tombstone.length!==3)fail('INVALID_REFERENCE','Incomplete original tombstone');
            for(const p of f.tombstone)if(p.payload_pointer!==null||p.value===null||parse(p.value)!==expected[p.pointer.slice(1)])fail('INVALID_REFERENCE','Invalid original tombstone');
            return;
        }
        if(!(log?['done']:['done','retiring']).includes(r.status))fail('NOT_READY','Retirement requires authorized status');
        if(f.retiredOrphanProperty||f.retiredOrphanPayload)fail('INVALID_REFERENCE','Orphan future tombstone metadata');
        if(!log){validatePresence(f.scoreCollection,f.scorePresence);
        if(Number(f.scoreCollection.present)!==1||Number(f.retiredCollection.present)===0&&f.anyTombstone)fail('INVALID_REFERENCE','Contradictory collection presence');}
        const fields={'/collection':'collection','/replayId':'replay_id','/fingerprint':'fingerprint','/mapId':'map_id','/buildId':'build_id','/status':'status','/outputPath':'output_path','/outputFingerprint':'output_hash'};
        for(const p of f.recordProperties)if(p.payload_pointer!==null||p.value===null||parse(p.value)!==r[fields[p.pointer]])fail('INVALID_REFERENCE','Score original/projection mismatch');
        const o=f.output;if(!log||o||r.output_path!==null||r.output_hash!==null){if(!sameIdentity(o,k)||o.path!==r.output_path||o.hash!==r.output_hash||o.state!=='ready')fail('INVALID_REFERENCE','Invalid ready output ownership');
        const prefix=`replay-score-source-${k.replayId}-`,suffix=typeof o.path==='string'?o.path.slice(prefix.length):'';
        if(log&&!new RegExp(`^${k.replayId}(?:-[a-f0-9]{12,64}(?:-\\d+)?)?\\.jsonl$`).test(o.path))fail('INVALID_REFERENCE','Log output filename identity mismatch');
        if(!log&&(!o.path?.startsWith(prefix)||!(suffix===k.fingerprint.slice(0,12)+'.response'||suffix===k.fingerprint+'.response'||new RegExp(`^${k.fingerprint}-[2-9]\\d*\\.response$`).test(suffix))))fail('INVALID_REFERENCE','Score output filename mismatch');}
        if(f.operation&&(!sameIdentity(f.operation,k)||f.operation.phase!=='cleanup'||BigInt(f.operation.ordinal)!==0n))fail('OWNERSHIP_CONFLICT','Cleanup operation identity mismatch');
    }
    function validateBinding(row,k,key) {
        if(row.bound_collection!==collection||row.bound_replay!==k.replayId||row.bound_fingerprint!==k.fingerprint||typeof row.bound_task!=='string'||!TASK.test(row.bound_task)||row.owner_key!==JSON.stringify([key,row.bound_task]))fail('OWNERSHIP_CONFLICT','Invalid/orphan selected review owner');
    }
    function checkPathOwner(file,k,resumed) {
        for(const table of ['maps','outputs','payloads']){
            if(table===(file.pointer===undefined?'outputs':'payloads'))continue;
            if(sql(`SELECT path FROM ${table} WHERE path=?`,[file.path]))fail('OWNERSHIP_CONFLICT','Cross-kind retirement file conflict');
        }
        const other=sql('SELECT operation_id FROM operation_files WHERE path=? AND operation_id!=? LIMIT 1',[file.path,resumed?opOf(k):'']);
        if(other)fail('OWNERSHIP_CONFLICT','Foreign intent names selected artifact');
    }
    function statusOf(relative) {
        const full=safePath(relative);try{return{full,stat:fs.lstatSync(full,{bigint:true})};}catch(error){if(error?.code==='ENOENT')return{full,stat:null};throw error;}
    }
    function verify(file,{missing=false,unlink=false}={}) {
        ensure();if(transactionActive())fail('INVALID_STATE','Retirement file IO inside transaction');
        const found=statusOf(file.path);
        if(!found.stat){if(!missing)fail('UNAVAILABLE','Artifact missing before retirement intent');return false;}
        if(!found.stat.isFile()||found.stat.isSymbolicLink()||found.stat.nlink!==1n)fail('UNSAFE_PATH','Retirement requires single-link regular file');
        resident(found.full);
        const fd=fs.openSync(found.full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);metrics.payloadOpens++;let failed=false,primary;
        try{
            const st=fs.fstatSync(fd,{bigint:true}),expected=BigInt(file.bytes);
            if(!st.isFile()||st.nlink!==1n||st.dev!==found.stat.dev||st.ino!==found.stat.ino)fail('UNSAFE_PATH','Artifact identity changed on open');
            if(st.size!==expected)fail('INVALID_ARTIFACT','Artifact size mismatch');
            const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);let bytes=0;
            for(;;){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(expected)-bytes+1),null);metrics.fsReads++;if(!n)break;bytes+=n;metrics.payloadReadBytes+=n;if(BigInt(bytes)>expected)fail('INVALID_ARTIFACT','Artifact grew during verification');digest.update(buffer.subarray(0,n));}
            if(BigInt(bytes)!==expected||digest.digest('hex')!==file.hash)fail('INVALID_ARTIFACT','Artifact digest/length mismatch');
            ensure();const now=statusOf(file.path).stat;
            if(!now||now.dev!==st.dev||now.ino!==st.ino||now.size!==st.size||now.nlink!==1n)fail('INVALID_ARTIFACT','Artifact path identity changed');
            if(unlink){inject('retirement-before-unlink');ensure();fs.unlinkSync(found.full);inject('retirement-after-unlink');}
        }catch(error){failed=true;primary=error;throw error;}
        finally{try{fs.closeSync(fd);}catch(error){if(!failed)throw error;if(primary instanceof Error)withCleanup(primary,error);else throw new AggregateError([primary,error],'Retirement and close failed',{cause:primary});}}
        ensure();return true;
    }
    async function retireScore(input) {
        ensure();if(busy||transactionActive())fail('INVALID_STATE','Nonnested retirement required');busy=true;copied=0;sqlCalls=0;returned=0;
        try{
            const k={collection:input?.collection,replayId:input?.replayId,fingerprint:input?.fingerprint};
            const key=keyOf(k),f=readScoreRetirementFacts({recordKey:k});validateFacts(f,k);
            const tombstone=log?{}:{sourceType:'replay-score-source',replayId:k.replayId,fingerprint:k.fingerprint};
            const result={kind:f.retired?'already-retired':'retired',collection,replayId:k.replayId,fingerprint:k.fingerprint,changed:!f.retired,resumed:log?Boolean(f.operation):f.current?.status==='retiring',filesPlanned:null,filesUnlinked:0,filesCheckpointed:0,committedTransactions:0,generation:String(f.generation),tombstone};
            if(f.retired){if(size(result)>4096)fail('RESOURCE_LIMIT','Retirement result overflow');return result;}
            let R=0,finished=true,after=null;
            do{
                const page=checkpoints({recordKey:k,after});charge(page);returned+=page.rows.length;if(returned>45000)fail('RESOURCE_LIMIT','Reviewer row work exhausted');
                for(const r of page.rows){if(++R>1000)fail('RESOURCE_LIMIT','Retirement exceeds 1000 reviewers');if(!sameIdentity(r,k)||typeof r.task!=='string'||!TASK.test(r.task))fail('INVALID_REFERENCE','Invalid reviewer identity');if(r.owner_key!==JSON.stringify([key,r.task]))fail('OWNERSHIP_CONFLICT','Invalid reviewer binding');
                    for(const n of ['claimedAt','examinedAt','completedAt']){let value=null;if(r[n+'Ordinal']!==null){if(r[n+'Payload']!==null)fail('UNSUPPORTED_CHECKPOINT','Inline retirement checkpoints required');if(r[n+'Value']===null)fail('INVALID_REFERENCE','Missing checkpoint JSON');value=parse(r[n+'Value']);if(value!==null&&typeof value!=='string')fail('UNSUPPORTED_CHECKPOINT','Null/string checkpoints required');if(typeof value==='string'&&Buffer.byteLength(value)>256)fail('RESOURCE_LIMIT','Checkpoint exceeds 256 bytes');}if(n!=='claimedAt'&&!value)finished=false;}
                }after=page.cursor;
            }while(after);
            if(!R||!finished)fail('NOT_REVIEWED','Every reviewer must have examined and completed');
            const payloads=[],entries=[],operations=[];let Q=2+R;
            for(const section of ['record-properties','review-properties','record-payloads','review-payloads','operations','files']){
                after=null;do{
                    const page=pageScoreRetirementInventory({recordKey:k,section,after});
                    for(const r of page.rows){
                        if(section.startsWith('review-'))validateBinding(r,k,key);
                        if(section.endsWith('properties')){if(r.payload_pointer!==null&&r.ref_pointer===null)fail('INVALID_REFERENCE','Dangling selected property');if(++Q>8192)fail('RESOURCE_LIMIT','Retirement metadata row cap');}
                        else if(section.endsWith('payloads')){payloads.push(r);if(payloads.length+1>128)fail('RESOURCE_LIMIT','Retirement exceeds 128 files');if(++Q>8192)fail('RESOURCE_LIMIT','Retirement metadata row cap');}
                        else if(section==='operations'){operations.push(r);if(operations.length>1)fail('NOT_READY','Multiple selected intents');}
                        else{entries.push(r);if(entries.length>128)fail('RESOURCE_LIMIT','Oversized cleanup intent');}
                    }after=page.cursor;
                }while(after);
            }
            const resumed=result.resumed,operationId=opOf(k);
            if(!resumed&&(operations.length||f.operation||entries.length)||resumed&&(!f.operation||operations.length!==1||operations[0].id!==operationId))fail('NOT_READY','Retirement requires complete matching intent');
            payloads.sort(compare);const files=[...(f.output?[f.output]:[]),...payloads],F=files.length;
            let B=0n;const paths=new Set(),byPayload=new Map();
            for(const p of payloads){
                if(p.state!=='ready'||!['diagnostics','summaries','extensions'].includes(p.role)||p.encoding!==(p.role==='diagnostics'?'jsonl-v1':'json-v1')||p.path!==payloadPath(storeId,{kind:p.owner_kind,key:p.owner_key},p.pointer,p.role,p.hash))fail('INVALID_REFERENCE','Invalid owned payload reservation');
                byPayload.set(json([p.owner_kind,p.owner_key,p.pointer]),p);
            }
            for(const p of payloads){let node=p;const seen=new Set();while(node.parent!==null){const id=json([node.owner_kind,node.owner_key,node.pointer]);if(seen.has(id)||seen.size>=128)fail('INVALID_REFERENCE','Invalid payload dependency graph');seen.add(id);node=byPayload.get(json([node.owner_kind,node.owner_key,node.parent]));if(!node)fail('INVALID_REFERENCE','Missing/cross-owner payload parent');}}
            for(const file of files){if(typeof file.hash!=='string'||!HEX.test(file.hash)||BigInt(file.bytes)<0n)fail('INVALID_REFERENCE','Invalid artifact expectation');B+=BigInt(file.bytes);if(B>134217728n)fail('RESOURCE_LIMIT','Selected artifacts exceed 128 MiB');if(paths.has(file.path))fail('OWNERSHIP_CONFLICT','Aliased owned artifact');paths.add(file.path);checkPathOwner(file,k,resumed);}
            if(size(files)>1048576)fail('RESOURCE_LIMIT','Retirement artifact vector exceeds 1 MiB');
            const statusProperty=f.recordProperties.find(p=>p.pointer==='/status'),statusOrdinal=resumed?null:statusProperty?.ordinal??next(f.recordTail),presenceOrdinal=f.retiredPresence[0]?.ordinal??next(f.collectionTail);
            Q+=1+F+(!resumed&&!statusProperty?1:0);if(Q>8192)fail('RESOURCE_LIMIT','Retirement metadata exceeds 8192 rows');
            const validPresence=(e,p)=>Number(e.original_present)===1||log&&p===f.output&&Number(e.original_present)===0;
            if(resumed){if(entries.length!==F)fail('INVALID_REFERENCE','Incomplete cleanup intent');for(const [i,e]of entries.entries()){const p=files[i];if(BigInt(e.ordinal)!==BigInt(i)||e.path!==p.path||e.hash!==p.hash||BigInt(e.bytes)!==BigInt(p.bytes)||!validPresence(e,p)||!['pending','deleted'].includes(e.state))fail('INVALID_REFERENCE','Cleanup intent diverged');}}
            const U=resumed?entries.filter(e=>e.state==='pending').length:F,delta=U+(resumed?1:2),G=BigInt(f.generation);
            if(G+BigInt(delta)>MAX)fail('RESOURCE_LIMIT','Retirement generation headroom exhausted');
            Object.assign(result,{filesPlanned:F,filesCheckpointed:U,committedTransactions:delta,generation:String(G+BigInt(delta))});
            if(size({...result,filesUnlinked:128})>4096)fail('RESOURCE_LIMIT','Retirement result exceeds 4 KiB');
            const originalPresence=[];
            for(const [i,file]of files.entries()){
                if(resumed&&entries[i].state==='deleted'){if(statusOf(file.path).stat)fail('INVALID_ARTIFACT','Deleted artifact reappeared');}
                else originalPresence[i]=verify(file,{missing:resumed||log&&file===f.output});
            }
            ensure();inject('retirement-verified');
            let lockedGeneration=G;
            if(!resumed){transaction(tx=>{
                if(!log)tx.setStatus({recordKey:k,status:'retiring',propertyOrdinal:statusOrdinal});
                tx.appendIntent({id:operationId,recordKey:k,phase:'cleanup',ordinal:0,files:files.map((p,ordinal)=>({ordinal,path:p.path,hash:p.hash,bytes:p.bytes,originalPresent:originalPresence[ordinal]}))});
            });lockedGeneration++;}
            for(const [i,file]of files.entries()){
                if(resumed&&entries[i].state==='deleted')continue;
                ensure();const entry=sql('SELECT f.*,o.collection,o.replay_id,o.fingerprint,o.phase,r.status FROM operation_files AS f JOIN operations AS o ON o.id=f.operation_id JOIN records AS r ON r.collection=o.collection AND r.replay_id=o.replay_id AND r.fingerprint=o.fingerprint WHERE f.operation_id=? AND f.ordinal=?',[operationId,i]);
                if(!sameIdentity(entry,k)||entry.phase!=='cleanup'||entry.status!==(log?'done':'retiring')||entry.state!=='pending'||entry.path!==file.path||entry.hash!==file.hash||BigInt(entry.bytes)!==BigInt(file.bytes)||!validPresence(entry,file))fail('INVALID_REFERENCE','Deletion checkpoint authority changed');
                checkPathOwner(file,k,true);
                if(verify(file,{missing:true,unlink:true}))result.filesUnlinked++;
                ensure();syncDir(path.dirname(safePath(file.path)));inject('retirement-directory-synced');
                transaction(()=>sql('UPDATE operation_files SET state=? WHERE operation_id=? AND ordinal=?',['deleted',operationId,i],'run'));
                lockedGeneration++;
                // An await boundary makes escaped/non-awaited operations revocable.
                await Promise.resolve();ensure();
                // A low-level caller can retain this same writer and interleave
                // a transaction while the owned operation is suspended. The
                // owner lock alone does not exclude that caller. Its mutation
                // invalidates the inventory before any further unlink/finalize.
                if(generation()!==lockedGeneration)fail('INVALID_STATE','Retirement inventory invalidated by interleaved transaction');
            }
            for(const file of files)if(statusOf(file.path).stat)fail('INVALID_ARTIFACT','Artifact name reappeared before finalization');
            const pending=sql('SELECT ordinal FROM operation_files WHERE operation_id=? AND state!=? LIMIT 1',[operationId,'deleted']);if(pending)fail('INVALID_STATE','Cleanup checkpoint incomplete');
            inject('retirement-before-finalize');
            transaction(tx=>{
                const prefix=prefixOf(key);
                sql('DELETE FROM properties WHERE owner_kind=? AND owner_key>=? AND owner_key<?',['review',prefix,upperOf(prefix)],'run');
                sql('DELETE FROM properties WHERE owner_kind=? AND owner_key=?',['record',key],'run');
                // Explicit bounded leaf-first deletion; no recursive/unbounded cascade.
                const remaining=new Set(payloads);
                while(remaining.size){const leaves=[...remaining].filter(p=>![...remaining].some(c=>c.owner_kind===p.owner_kind&&c.owner_key===p.owner_key&&c.parent===p.pointer));if(!leaves.length)fail('INVALID_REFERENCE','Payload dependency cycle');for(const p of leaves){sql('DELETE FROM payloads WHERE owner_kind=? AND owner_key=? AND pointer=?',[p.owner_kind,p.owner_key,p.pointer],'run');remaining.delete(p);}}
                sql('DELETE FROM records WHERE key=?',[key],'run');
                tx.insertEntity({kind:'retired',key,ordinal:log?f.historyValue.length:f.current.ordinal,value:tombstone});
                if(log)tx.setProperty({owner:{kind:'replay',key:k.replayId},pointer:'/retiredFingerprints',ordinal:f.history[0]?.ordinal??next(f.historyTail),value:[...f.historyValue,k.fingerprint]});
                else{sql('UPDATE collections SET present=1 WHERE key=?',['retiredScoreSources'],'run');
                tx.setProperty({owner:{kind:'collection',key:'retiredScoreSources'},pointer:'/present',ordinal:presenceOrdinal,value:true});}
            });
            ensure();return result;
        }finally{busy=false;}
    }
    return log?{retireLog:retireScore}:{readScoreRetirementFacts,pageScoreRetirementInventory,retireScore};
}

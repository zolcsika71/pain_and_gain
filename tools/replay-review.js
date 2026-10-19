// Explicit retained-response extraction. No discovery, provider or store access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical, sha256, parseCacheEntry, parseScoreCacheEntry, parseDecodedConsoleJson,
    summarizeDiagnosticCoverage, validBuildId} from './replay-logs.js';
import {canonicalDirectory} from './replay-production-scope.js';
import {resident, publish, acquireWriter, RetrievalError, errorDetails, withCleanup} from './retrieval-files.js';

const MiB = 1048576;
export const reviewLimits = Object.freeze({metadata:128, chunks:3, ticks:300,
    rawBytes:8*MiB, decodedLogBytes:8*MiB, metadataBytes:MiB,
    metadataTotalBytes:16*MiB, rawTotalBytes:24*MiB, artifactBytes:32*MiB});
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const need = (ok, reason) => { if (!ok) throw new RetrievalError(reason); };
const json = value => Buffer.from(JSON.stringify(value, null, 2)+'\n');
const contains = (root, file) => file===root || file.startsWith(root+path.sep);
const keyPattern = /^1\/0\/https:\/\/arena\.screeps\.com\/api\/game\/([a-f0-9]{24})(?:\/log\/(0|[1-9]\d*))?$/;

function representation(d, source) {
    // The old scope is itself an explicit cache-frame declaration, not sniffing.
    const value=d.representation??(source.scope==='retained-cache-v5'?'cache-v5':null);
    need(['cache-v5','decoded-console-json'].includes(value),'representation-required');
    need(source.scope!=='retained-cache-v5'||value==='cache-v5','representation-scope-mismatch');
    return value;
}
const rawName=(d,source)=>sha256(d.key)+(representation(d,source)==='cache-v5'?'.cache':'.console.json');
function inputReceipt(d, source, bytes) {
    const form=representation(d,source),actual=sha256(bytes);
    need(!d.historicalDecodedSha256||d.historicalDecodedSha256===actual,'historical-decoded-hash-mismatch');
    return {key:d.key,sha256:actual,bytes:bytes.length,provenance:source.provenance,raw:rawName(d,source),
        inputProvenance:{representation:form,inputSha256:actual,
            originalFrameSha256:form==='cache-v5'?actual:d.originalFrameSha256??null,
            decodedInputSha256:form==='decoded-console-json'?actual:null,
            historicalDecodedSha256:d.historicalDecodedSha256??null,
            historicalIntegrity:form==='decoded-console-json'&&d.historicalDecodedSha256
                ?'caller-declared-decoded-pin-matched':'unknown',
            presentIntegrity:'input-byte-pin-matched'}};
}

// Same canonical/residency/no-follow fencing as existing readers, with a bounded
// allocation and before/open/after identity check. File times are stability only.
export function readReviewFile(file, max) {
    canonicalDirectory(path.dirname(file));
    const before=resident(file);
    need(fs.realpathSync(file)===file && before.nlink===1, 'unsafe-path');
    need(before.size<=max, 'read-limit');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
        const same=s=>['dev','ino','size','mtimeMs','ctimeMs'].every(k=>s[k]===before[k]);
        need(same(fs.fstatSync(fd)), 'unstable-read');
        const bytes=Buffer.alloc(before.size);let offset=0;
        while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,Math.min(65536,bytes.length-offset),offset);
            need(n>0,'unstable-read');offset+=n;}
        need(same(fs.fstatSync(fd))&&same(resident(file)), 'unstable-read');
        return bytes;
    } finally { fs.closeSync(fd); }
}

function instant(value) {
    const m=typeof value==='string'&&value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/);
    need(m&&Number(m[2])>=1&&Number(m[2])<=12&&Number(m[3])>=1&&
        Number(m[3])<=new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).getUTCDate()&&
        Number(m[4])<24&&Number(m[5])<60&&Number(m[6])<60&&
        Number.isFinite(Date.parse(value)), 'invalid-recorded-time');
    return Date.parse(value);
}
function selection(request) {
    need(request && typeof request==='object', 'invalid-request');
    const {checkpoint, replayId=null, metadataKeys=[], logs=[], limits, source}=request;
    need(limits && Number.isSafeInteger(limits.chunks)&&limits.chunks>0&&limits.chunks<=reviewLimits.chunks &&
        Number.isSafeInteger(limits.firstTick)&&limits.firstTick>=1 && Number.isSafeInteger(limits.lastTick)&&
        limits.lastTick>=limits.firstTick&&limits.lastTick-limits.firstTick<reviewLimits.ticks, 'invalid-limits');
    need(Array.isArray(metadataKeys)&&metadataKeys.length<=reviewLimits.metadata &&
        Array.isArray(logs)&&logs.length<=3*reviewLimits.chunks, 'selection-limit');
    need(replayId!==null||metadataKeys.length>0,'identity-input-required');
    const descriptors=[...metadataKeys,...logs];
    need(new Set(descriptors.map(d=>d?.key)).size===descriptors.length, 'duplicate-key');
    for(const d of descriptors){const m=d?.key?.match(keyPattern);
        need(m&&hex(d.sha256)&&typeof d.file==='string'&&/^[A-Za-z0-9_.-]{1,160}$/.test(d.file)&&
            !['.','..'].includes(d.file), 'invalid-descriptor');
        need(metadataKeys.includes(d)?m[2]===undefined:m[2]!==undefined, 'wrong-key-kind');}
    need(['retained-cache-v5','retained-responses'].includes(source?.scope)&&typeof source.root==='string'&&
        typeof source.provenance==='string'&&source.provenance.length>0&&source.provenance.length<=1024, 'source-authority-required');
    for(const d of descriptors){const form=representation(d,source);
        need(form==='cache-v5'||!metadataKeys.includes(d),'decoded-metadata-unsupported');
        need((d.originalFrameSha256==null||hex(d.originalFrameSha256))&&
            (d.historicalDecodedSha256==null||hex(d.historicalDecodedSha256)), 'invalid-integrity-provenance');
        need(form!=='cache-v5'||d.originalFrameSha256==null||d.originalFrameSha256===d.sha256,'original-frame-hash-mismatch');
        need(form!=='cache-v5'||d.historicalDecodedSha256==null,'decoded-pin-on-frame');}
    canonicalDirectory(source.root);
    need(!contains(repository,source.root)&&!source.root.split(path.sep).some(p=>
        ['Cache_Data','replay_logs'].includes(p)), 'retained-copies-only');
    need(replayId===null||id(replayId), 'invalid-replay-id');
    const expectedBuild=checkpoint?.enabledBuild;
    need(validBuildId(expectedBuild), 'checkpoint-build-required');
    let window=null;
    if(metadataKeys.length){
        const start=instant(checkpoint.activationTimeBoundsUTC?.earliest??checkpoint.activatedAt??checkpoint.createdAt);
        const end=instant(request.completionRecordedAt);
        const latest=instant(checkpoint.activationTimeBoundsUTC?.latest??checkpoint.activatedAt??checkpoint.createdAt);
        need(start<=latest&&latest<=end, 'inconsistent-trial-window');
        window={start,end,startUTC:new Date(start).toISOString(),endUTC:new Date(end).toISOString()};
    }
    return {checkpoint,expectedBuild,replayId,metadataKeys,logs,limits,source,window};
}

function metadata(parsed) {
    need(parsed.kind==='score-source'&&parsed.sourceKind==='game-metadata', 'metadata-format');
    const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(parsed.body));
    const envelope=value?.game, game=envelope?.game??envelope;
    need(value?.ok===1&&game?._id===parsed.replayId &&
        (envelope._id===undefined||envelope._id===parsed.replayId), 'metadata-identity');
    const createdMs=instant(game.createdAt);
    // Names are evidence labels, not identity substitutes. No slot/opponent guess.
    const users=Array.isArray(envelope.users)?envelope.users:[];
    need(users.length<=2, 'metadata-players');
    const players=users.map(u=>({id:id(u?._id)?u._id:null,
        name:typeof u?.username==='string'&&u.username.length<=128?u.username:null}));
    return {replayId:parsed.replayId,createdAt:game.createdAt,createdMs,
        createdUTC:new Date(createdMs).toISOString(),status:game.status??null,players};
}

function extract(parsed, limits) {
    const ticks=Array.from({length:limits.lastTick-limits.firstTick+1},(_,i)=>
        ({tick:limits.firstTick+i,snapshots:[],diagnostics:[],mappings:[]}));
    const byTick=new Map(ticks.map(t=>[t.tick,t])),lines=[],diagnostics=[];
    for(const p of parsed){
        for(const raw of p.gameState){const entry=JSON.parse(raw),row=byTick.get(entry.tick);if(!row)continue;
            if(!row.snapshots.some(s=>s.raw===raw))row.snapshots.push({source:p.key,raw});
            lines.push(raw);
            const d=entry.secondaryObjective;
            const actors=Array.isArray(d?.travel?.actors)?d.travel.actors:[];
            row.mappings.push({source:p.key,actors:actors.slice(0,4).map(a=>
                ({slot:a?.slot??null,actorId:Number.isInteger(a?.slot)&&a.slot>=0&&
                    Array.isArray(d?.memberSlots)&&Number.isInteger(d.memberSlots[a.slot])&&d.memberSlots[a.slot]>=0
                    ?entry.creeps[d.memberSlots[a.slot]]?.id??null:null})),
                targetId:Number.isInteger(d?.targetSlot)&&d.targetSlot>=0?entry.flags[d.targetSlot]?.id??null:null,
                flagIds:entry.flags.map(f=>f?.id??null),squadSlot:Number.isInteger(d?.squadSlot)&&d.squadSlot>=0?d.squadSlot:null,
                membershipSquads:null});
        }
        for(const item of p.otherEntries){let entry;try{entry=JSON.parse(item.raw);}catch{continue;}
            const row=byTick.get(entry?.tick);if(!row||!item.type)continue;
            if(!row.diagnostics.some(d=>d.raw===item.raw))row.diagnostics.push({source:p.key,...item});
            if(['membership-baseline','membership-change','action-decision','action-attempt','runtime-cpu','evidence-coverage'].includes(item.type))
                diagnostics.push({...item,entry});
        }
    }
    for(const row of ticks){const baseline=row.diagnostics.filter(d=>d.type==='membership-baseline').map(d=>JSON.parse(d.raw));
        if(baseline.length===1)for(const m of row.mappings)m.membershipSquads=baseline[0].squads;}
    return {sources:parsed.map(p=>({key:p.key,...p.inputProvenance})),
        ticks,gaps:ticks.filter(t=>!t.snapshots.length).map(t=>t.tick),
        conflicts:ticks.filter(t=>t.snapshots.length>1).map(t=>t.tick),
        diagnosticCoverage:summarizeDiagnosticCoverage(lines,diagnostics),
        limits:'Only requested ticks extracted; exact complete selected responses are retained separately.'};
}

// Reader callback is intentionally the only source capability. A managed/cache
// adapter must acquire/validate its existing lease inside withSource, not bypass it.
export async function runReplayReview(request, {output,withSource,signal,fault=async()=>{}}={}) {
    canonicalDirectory(output);
    need(!contains(repository,output)&&!output.split(path.sep).some(p=>['Cache_Data','replay_logs'].includes(p)), 'unsafe-output');
    if(typeof request?.source?.root==='string')need(!contains(request.source.root,output)&&!contains(output,request.source.root),'overlapping-source-output');
    const release=await acquireWriter(output);
    let report,primary,savedReport;
    const file=name=>path.join(output,name);
    const readJSON=(name,max=2*MiB)=>{
        const bytes=readReviewFile(file(name),max);let value;
        try{value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw new RetrievalError(name==='report.json'?'stale-report':'stale-receipt');}
        need(bytes.equals(json(value)),name==='report.json'?'stale-report':'stale-receipt');return value;
    };
    const check=()=>{release.assertHeld();need(!signal?.aborted,'interrupted');};
    const save=()=>{check();const bytes=json(report);need(bytes.length<=2*MiB,'report-limit');
        publish(file('report.json'),bytes,fs.existsSync(file('report.json')));};
    try {
        check();
        const code=sha256(Buffer.concat(['replay-review.js','replay-logs.js','replay-analysis.js',
            'retrieval-files.js','replay-production-scope.js'].map(p=>
            readReviewFile(path.join(repository,'tools',p),MiB))));
        const binding={version:1,request,code};
        const bindingBytes=json(binding),requestHash=sha256(bindingBytes);
        need(bindingBytes.length<=MiB,'request-limit');
        if(fs.existsSync(file('request.json')))need(readReviewFile(file('request.json'),MiB).equals(bindingBytes),'resume-binding-mismatch');
        else publish(file('request.json'),bindingBytes);
        // Validate existing reports before replacement. Never repair a corrupt resume.
        if(fs.existsSync(file('report.json'))){const saved=readJSON('report.json');
            const {integrity,...body}=saved;need(integrity===sha256(canonical(body))&&body.requestHash===requestHash,'stale-report');savedReport=saved;}
        report={version:1,requestHash,status:'partial',reason:null,identification:{status:'unknown',candidateCount:null,candidates:[],exclusions:[],errors:[]},
            buildVerification:{status:'unknown',observed:[]},extraction:{status:'not-started'},humanReview:{status:'not-performed'},
            reads:{metadata:0,logs:0,reused:0,rawBytes:0,metadataDecodedBytes:0},responses:[],partialArtifacts:[]};
        // Integrity field is excluded from its own hash, including during partial saves.
        const persist=()=>{delete report.integrity;report.integrity=sha256(canonical(report));save();};
        let selected;
        try{selected=selection(request);}catch(e){report.status='blocked';report.reason=errorDetails(e).reason;persist();return report;}
        const {metadataKeys,logs,replayId,expectedBuild,limits,source,window}=selected;
        need(!contains(source.root,output)&&!contains(output,source.root),'overlapping-source-output');
        // Validate all resumable artifacts before any report replacement/read.
        if(savedReport){need(Array.isArray(savedReport.responses)&&savedReport.responses.length<=131,'stale-report');
            for(const r of savedReport.responses){const d=[...metadataKeys,...logs].find(d=>d.key===r.key);
                need(d&&r.sha256===d.sha256,'stale-receipt');
                const stem=sha256(d.key);need(fs.existsSync(file(rawName(d,source)))&&fs.existsSync(file(stem+'.json')),'partial-artifact-missing');}}
        for(const d of [...metadataKeys,...logs]){
            const stem=sha256(d.key),rawFile=rawName(d,source),receiptName=stem+'.json';
            const rawExists=fs.existsSync(file(rawFile)),receiptExists=fs.existsSync(file(receiptName));
            need(rawExists||!receiptExists,'partial-artifact-missing');
            if(rawExists){const bytes=readReviewFile(file(rawFile),reviewLimits.rawBytes);
                need(sha256(bytes)===d.sha256,'stale-response');
                if(receiptExists)need(canonical(readJSON(receiptName,16384))===canonical(inputReceipt(d,source,bytes)),'stale-receipt');}
        }
        const savedArtifacts=[...(savedReport?.partialArtifacts??[]),...(savedReport?.extraction?.sha256?[savedReport.extraction]:[])];
        need(savedArtifacts.length<=4,'stale-extraction');
        for(const a of savedArtifacts){need(a.artifact==='observations.json'||/^partial-[1-3]\.json$/.test(a.artifact),'stale-extraction');
            let bytes;try{bytes=readReviewFile(file(a.artifact),reviewLimits.artifactBytes);}catch{throw new RetrievalError('stale-extraction');}
            need(sha256(bytes)===a.sha256,'stale-extraction');}
        report.window=window;report.filtering='Recorded game.createdAt UTC instants, inclusive; file timestamps never used.';
        const receive=async(d,kind)=>{
            check();const stem=sha256(d.key),rawFile=rawName(d,source),receiptName=stem+'.json';let bytes,receipt;
            if(fs.existsSync(file(receiptName)))receipt=readJSON(receiptName,16384);
            if(fs.existsSync(file(rawFile))){bytes=readReviewFile(file(rawFile),reviewLimits.rawBytes);report.reads.reused++;}
            else {
                need(!receipt,'partial-artifact-missing');need(typeof withSource==='function','reader-required');
                // Reader is called only for this exact descriptor, under caller authority.
                const got=await withSource(d);check();
                need(Buffer.isBuffer(got?.bytes)&&got.bytes.length<=reviewLimits.rawBytes,'read-limit');
                need(got.provenance===source.provenance,'source-provenance-mismatch');
                bytes=Buffer.from(got.bytes);need(sha256(bytes)===d.sha256,'source-hash-mismatch');
                need(report.reads.rawBytes+bytes.length<=reviewLimits.rawTotalBytes,'aggregate-read-limit');
                publish(file(rawFile),bytes);report.reads[kind==='metadata'?'metadata':'logs']++;
                await fault('after-response',d);
            }
            need(sha256(bytes)===d.sha256,'stale-response');
            report.reads.rawBytes+=bytes.length;need(report.reads.rawBytes<=reviewLimits.rawTotalBytes,'aggregate-read-limit');
            const expected=inputReceipt(d,source,bytes);
            if(receipt)need(canonical(receipt)===canonical(expected),'stale-receipt');
            else publish(file(receiptName),json(expected));
            report.responses.push(expected);persist();await fault('after-receipt',d);
            return bytes;
        };
        const candidates=new Map();
        for(const d of metadataKeys){
            try {
                const raw=await receive(d,'metadata'),p=parseScoreCacheEntry(raw,{maxDecodedBytes:reviewLimits.metadataBytes});
                need(p.key===d.key,'request-key-mismatch');
                report.reads.metadataDecodedBytes+=p.body?.length??0;
                need(report.reads.metadataDecodedBytes<=reviewLimits.metadataTotalBytes,'metadata-total-limit');
                const m=metadata(p);
                if(m.status!=='finished'||m.createdMs<window.start||m.createdMs>window.end){report.identification.exclusions.push({...m,key:d.key,reason:m.status!=='finished'?'not-finished':'outside-recorded-window'});}
                else {const previous=candidates.get(m.replayId);need(!previous||canonical(previous)===canonical(m),'conflicting-metadata');candidates.set(m.replayId,m);}
            } catch(e){const reason=errorDetails(e).reason;
                report.identification.errors.push({key:d.key,reason});
                report.identification.candidates=[...candidates.values()];report.identification.candidateCount=candidates.size;
                if(!['metadata-format','metadata-identity','invalid-recorded-time','metadata-players'].includes(reason))throw e;}
            report.identification.candidates=[...candidates.values()];report.identification.candidateCount=candidates.size;persist();
        }
        const chosen=replayId??(candidates.size===1?[...candidates.keys()][0]:null);
        // Persist counts/metadata BEFORE enforcing identity/candidate validation.
        if(!chosen){report.status='blocked';report.reason=metadataKeys.length?(candidates.size?'ambiguous-candidates':'no-candidate-in-selected-evidence'):'identity-input-required';persist();return report;}
        need(!metadataKeys.length||candidates.has(chosen),'explicit-id-not-admitted');
        report.identification.status='selected';report.identification.replayId=chosen;persist();
        const selectedLogs=logs.filter(d=>d.key.match(keyPattern)[1]===chosen);
        need(selectedLogs.length>0,'exact-log-selection-required');need(selectedLogs.length<=limits.chunks,'chunk-limit');
        const parsed=[];
        for(const d of selectedLogs){const bytes=await receive(d,'log');
            const form=representation(d,source),options={maxDecodedBytes:reviewLimits.decodedLogBytes,maxTickSpan:299,strictUtf8:true};
            const p=form==='cache-v5'?parseCacheEntry(bytes,options):parseDecodedConsoleJson(bytes,{...options,key:d.key});
            need(p.kind==='log'&&p.key===d.key&&p.replayId===chosen,'log-format-or-identity');
            p.inputProvenance=inputReceipt(d,source,bytes).inputProvenance;
            report.identification.status=form==='decoded-console-json'||parsed.some(p=>p.inputProvenance.representation==='decoded-console-json')
                ?'declared-replay-key':'verified-request-key';
            report.buildVerification.observed.push({key:d.key,buildId:p.buildId});
            report.buildVerification.status=p.buildId===expectedBuild?'matching':'mismatch-or-unknown';persist();
            need(p.buildId===expectedBuild,'emitted-build-mismatch');parsed.push(p);
            const partial=extract(parsed,limits),partialBytes=json(partial),artifact=`partial-${parsed.length}.json`;
            need(partialBytes.length<=reviewLimits.artifactBytes,'extraction-limit');
            if(fs.existsSync(file(artifact)))need(readReviewFile(file(artifact),reviewLimits.artifactBytes).equals(partialBytes),'stale-extraction');
            else publish(file(artifact),partialBytes);
            const saved={artifact,sha256:sha256(partialBytes)};report.partialArtifacts.push(saved);
            report.extraction={status:'partial',...saved,gaps:partial.gaps,conflicts:partial.conflicts};
            persist();await fault('after-extraction',d);
        }
        const observations=extract(parsed,limits),bytes=json(observations);
        need(bytes.length<=reviewLimits.artifactBytes,'extraction-limit');
        if(fs.existsSync(file('observations.json')))need(readReviewFile(file('observations.json'),reviewLimits.artifactBytes).equals(bytes),'stale-extraction');
        else publish(file('observations.json'),bytes);
        report.extraction={status:'complete',artifact:'observations.json',sha256:sha256(bytes),
            firstTick:limits.firstTick,lastTick:limits.lastTick,gaps:observations.gaps,conflicts:observations.conflicts,
            coverage:observations.diagnosticCoverage};
        report.status=observations.conflicts.length?'blocked':'extracted';
        report.reason=observations.conflicts.length?'conflicting-observations':null;persist();return report;
    } catch(e) {
        primary=e;
        const reason=errorDetails(e).reason;
        // Integrity/binding mismatches never replace validated prior artifacts.
        // Retain a separate no-clobber failure note even if stdout is lost.
        if(/^(?:resume-binding-mismatch|source-hash-mismatch|stale-|partial-artifact)/.test(reason)){
            const name='blocked-'+sha256(reason)+'.json',bytes=json({status:'blocked',reason,
                requestHash:report?.requestHash??savedReport?.requestHash??null,
                candidateCount:savedReport?.identification?.candidateCount??report?.identification?.candidateCount??null,
                source:request.source?.provenance??null,
                failedKey:report?.identification?.errors?.at(-1)?.key??null,lastValidReport:'report.json'});
            if(!fs.existsSync(file(name)))publish(file(name),bytes);
        }else if(report){report.status='blocked';report.reason=reason;
            delete report.integrity;report.integrity=sha256(canonical(report));
            // An aborted signal must not prevent retaining already bounded work.
            release.assertHeld();publish(file('report.json'),json(report),fs.existsSync(file('report.json')));}
        throw e;
    } finally {try{await release();}catch(e){if(primary)withCleanup(primary,e);else throw e;}}
}

export async function reviewCommand(argv,{emit=line=>console.log(line),withSource}={}) {
    need(argv.length===2,'usage-review-request-output');
    const request=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(readReviewFile(argv[0],MiB)));
    if(typeof request.checkpoint==='string'){
        const bytes=readReviewFile(request.checkpoint,MiB);
        request.checkpointSource=request.checkpoint;request.checkpointSha256=sha256(bytes);
        request.checkpoint=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
    }
    const reader=withSource??(async d=>({bytes:readReviewFile(path.join(request.source.root,d.file),reviewLimits.rawBytes),
        provenance:request.source.provenance}));
    const report=await runReplayReview(request,{output:argv[1],withSource:reader});
    // All artifacts are durable before stdout. A broken/truncated sink cannot lose them.
    emit(JSON.stringify({status:report.status,reason:report.reason,candidates:report.identification.candidateCount,
        replayId:report.identification.replayId??null,build:report.buildVerification.status,
        report:path.join(argv[1],'report.json'),humanReview:'not-performed'}));
    return report;
}

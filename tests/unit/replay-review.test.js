// Generated qualification only: no historical/checkpoint/cache payload reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {cacheFrame,log,buildId,replayId} from '../fixtures/replay-import-command-fixture.js';
import {sha256,parseCacheEntry,parseDecodedConsoleJson} from '../../tools/replay-logs.js';
import {runReplayReview,reviewCommand,readReviewFile} from '../../tools/replay-review.js';
import {RetrievalError} from '../../tools/retrieval-files.js';

const json=v=>JSON.stringify(v,null,2)+'\n';
const key=(id=replayId,end=null)=>`1/0/https://arena.screeps.com/api/game/${id}${end===null?'':`/log/${end}`}`;
function setup(t){
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-review-generated-'));
    const output=path.join(root,'output'),source=path.join(root,'source');
    fs.mkdirSync(output);fs.mkdirSync(source);
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const responses=new Map(),reads=[];
    const request={checkpoint:{enabledBuild:buildId,createdAt:'2026-10-18T12:00:00.000Z'},
        completionRecordedAt:'2026-10-18T12:05:00Z',replayId,
        source:{scope:'retained-cache-v5',root:source,provenance:'generated-independent-response-v1'},
        limits:{chunks:3,firstTick:1,lastTick:3},metadataKeys:[],logs:[]};
    const add=(bytes,requestKey,kind='logs')=>{
        const d={key:requestKey,file:sha256(requestKey)+'.cache',sha256:sha256(bytes)};
        request[kind].push(d);responses.set(d.key,bytes);return d;
    };
    const addLog=(ticks=[1,2,3],{id=replayId,tag=buildId,end=100}={})=>{
        const response={};for(const tick of ticks){
            const row=log({tick,tag,map:false});
            const state={type:'game-state',tick,phase:'before-actions',buildId:tag,
                selectedFlagId:'centre',creeps:tick===2?[{id:'healer'},{id:'ranged'}]:[{id:'ranged'},{id:'healer'}],
                flags:[{id:'centre'},{id:'secondary'}],secondaryObjective:{memberSlots:[0,1],targetSlot:1,squadSlot:2,
                    travel:{actors:[{slot:0,admitted:{x:10,y:11}},{slot:1,admitted:null}]}}};
            const lines=row[tick].split('\n');lines[0]=JSON.stringify(state);response[tick]=lines.join('\n');
        }
        return add(cacheFrame(response,{id,time:end}),key(id,end));
    };
    const addMetadata=(id=replayId,createdAt='2026-10-18T12:01:00Z',status='finished')=>add(
        cacheFrame({ok:1,game:{_id:id,users:[{_id:'1'.repeat(24),username:'Generated A'},
            {_id:'2'.repeat(24),username:'Generated B'}],game:{_id:id,createdAt,status}}},
        {id,collection:'score',time:null}),key(id),'metadataKeys');
    const withSource=async d=>{reads.push(d.key);return{bytes:responses.get(d.key),provenance:request.source.provenance};};
    const run=extra=>runReplayReview(request,{output,withSource,...extra});
    const report=()=>JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8'));
    const observations=()=>JSON.parse(fs.readFileSync(path.join(output,'observations.json'),'utf8'));
    return {root,output,source,request,responses,reads,add,addLog,addMetadata,run,report,observations,withSource};
}

test('complete selected sequence, exact responses, same-tick mappings and CPU evidence persist; extraction is not review',async t=>{
    const w=setup(t),d=w.addLog(),before=structuredClone(w.request),r=await w.run();
    assert.equal(r.status,'extracted');assert.equal(r.humanReview.status,'not-performed');
    assert.equal(r.identification.status,'verified-request-key');assert.equal(r.buildVerification.status,'matching');
    assert.deepEqual(w.request,before);assert.deepEqual(w.observations().ticks.map(t=>t.tick),[1,2,3]);
    const ticks=w.observations().ticks;
    assert.deepEqual(ticks.map(t=>t.mappings[0].actors[0].actorId),['ranged','healer','ranged']);
    assert(ticks.every(t=>t.mappings[0].targetId==='secondary'&&t.mappings[0].membershipSquads===null));
    assert(ticks.every(t=>t.diagnostics.some(d=>d.type==='runtime-cpu')));
    assert(fs.readFileSync(path.join(w.output,sha256(d.key)+'.cache')).equals(w.responses.get(d.key)));
    assert.equal(r.responses[0].sha256,d.sha256);
});

test('nested opening probe evidence retains exact snapshot, slots and map bytes through extraction and no-read resume',async t=>{
    const w=setup(t);const response=log({tick:1});
    const lines=response[1].split('\n'),snapshot=JSON.parse(lines[1]);
    const probe={version:1,actorSlot:0,targetSlot:1,mapTick:1,matrix:'occupancy-v1',origin:'2520',goal:'4420',
        range:0,maxOps:1000,excluded:'26202621',queries:2,reportedOps:null,
        results:[1,2].map(ordinal=>({ordinal,status:'ops-unknown',path:'9999'.repeat(40),length:40,incomplete:false,ops:null}))};
    // Preservation of a maximum-width controlled envelope, not path legality.
    const eligibility={status:'eligible',first:null,later:null};
    snapshot.creeps=[{id:'generated-healer'}];snapshot.flags=[{id:'centre'},{id:'secondary'}];
    const adoption=[1,2,2,4];
    snapshot.secondaryObjective={mode:'opening',memberSlots:[0],targetSlot:1,squadSlot:2,routeProbe:probe,probeEligibility:eligibility,routeAdoption:adoption,
        travel:{actors:[{slot:0,proposed:{x:26,y:20},admitted:null}]}};
    lines[1]=JSON.stringify(snapshot);response[1]=lines.join('\n');
    const d=w.add(cacheFrame(response,{time:100}),key(replayId,100));
    const first=await w.run();assert.equal(first.status,'extracted');assert.equal(first.buildVerification.status,'matching');
    const row=w.observations().ticks[0];assert.deepEqual(JSON.parse(row.snapshots[0].raw).secondaryObjective.routeProbe,probe);
    assert.deepEqual(JSON.parse(row.snapshots[0].raw).secondaryObjective.probeEligibility,eligibility);
    assert.deepEqual(JSON.parse(row.snapshots[0].raw).secondaryObjective.routeAdoption,adoption);
    assert.equal(row.mappings[0].actors[0].actorId,'generated-healer');assert.equal(row.mappings[0].targetId,'secondary');
    const retained=fs.readFileSync(path.join(w.output,sha256(d.key)+'.cache'));
    assert(retained.equals(w.responses.get(d.key)));assert(parseCacheEntry(retained).map);
    w.reads.length=0;const second=await w.run({withSource:()=>{throw Error('source reread');}});
    assert.equal(second.reads.logs,0);assert.equal(second.reads.reused,1);assert.equal(w.reads.length,0);
    assert.deepEqual(JSON.parse(w.observations().ticks[0].snapshots[0].raw),snapshot);
    assert.equal(second.humanReview.status,'not-performed');
});

test('first-stop telemetry stays missing/unknown through extraction and no-source-read resume',async t=>{
    const w=setup(t),response=log({tick:1}),lines=response[1].split('\n'),snapshot=JSON.parse(lines[1]);
    snapshot.secondaryObjective={mode:'opening',probeEligibility:{status:'missing',first:'map',later:'unknown'},
        routeAdoption:[0,null,null,null]};
    lines[1]=JSON.stringify(snapshot);response[1]=lines.join('\n');w.add(cacheFrame(response,{time:100}),key(replayId,100));
    assert.equal((await w.run()).status,'extracted');
    assert.deepEqual(JSON.parse(w.observations().ticks[0].snapshots[0].raw).secondaryObjective,snapshot.secondaryObjective);
    const resumed=await w.run({withSource:()=>{throw Error('source reread');}});
    assert.equal(resumed.reads.logs,0);assert.equal(resumed.reads.reused,1);
    assert.deepEqual(JSON.parse(w.observations().ticks[0].snapshots[0].raw).secondaryObjective,snapshot.secondaryObjective);
});

test('declared decoded console JSON extracts without claiming historical frame integrity and resumes without reads',async t=>{
    const w=setup(t);w.request.source.scope='retained-responses';
    const bytes=Buffer.from(JSON.stringify({...log({tick:1,map:false}),...log({tick:2,map:false}),...log({tick:3,map:false})}));
    const d=w.add(bytes,key(replayId,100));d.representation='decoded-console-json';
    d.originalFrameSha256='f'.repeat(64);
    const first=await w.run();assert.equal(first.status,'extracted');
    assert.equal(first.identification.status,'declared-replay-key');
    const p=first.responses[0].inputProvenance;
    assert.equal(p.decodedInputSha256,sha256(bytes));assert.equal(p.originalFrameSha256,d.originalFrameSha256);
    assert.equal(p.historicalIntegrity,'unknown');assert.equal(w.observations().sources[0].historicalIntegrity,'unknown');
    w.reads.length=0;const resumed=await w.run({withSource:()=>{throw Error('source reread');}});
    assert.equal(resumed.responses[0].inputProvenance.historicalIntegrity,'unknown');
    assert.equal(resumed.reads.logs,0);assert.equal(resumed.reads.reused,1);assert.equal(w.reads.length,0);
});

test('cache and decoded paths share console validation without fabricating framing',()=>{
    const body=Buffer.from(JSON.stringify({...log({tick:1,map:false}),...log({tick:2,map:false})}));
    const decoded=parseDecodedConsoleJson(body,{key:key(replayId,100),maxDecodedBytes:8*1048576,maxTickSpan:299});
    const framed=parseCacheEntry(cacheFrame(body,{time:100}),{maxDecodedBytes:8*1048576,maxTickSpan:299,strictUtf8:true});
    const {keyBinding,...content}=decoded;assert.equal(keyBinding,'caller-declared');
    assert.deepEqual(content,framed);
});

test('a matching caller-declared prior decoded pin remains a qualified declaration on resume',async t=>{
    const w=setup(t);w.request.source.scope='retained-responses';
    const d=w.add(Buffer.from(JSON.stringify(log({tick:1,map:false}))),key(replayId,100));
    d.representation='decoded-console-json';d.historicalDecodedSha256=d.sha256;
    const first=await w.run();assert.equal(first.responses[0].inputProvenance.historicalIntegrity,'caller-declared-decoded-pin-matched');
    w.reads.length=0;const second=await w.run();assert.equal(w.reads.length,0);
    assert.equal(second.responses[0].inputProvenance.historicalIntegrity,'caller-declared-decoded-pin-matched');
    assert.equal(second.identification.status,'declared-replay-key');
});

test('cache-only scope and metadata routes cannot be relabelled as decoded input',async t=>{
    const w=setup(t),d=w.addLog();d.representation='decoded-console-json';
    assert.equal((await w.run()).reason,'representation-scope-mismatch');assert.equal(w.reads.length,0);
    const meta=setup(t);meta.request.source.scope='retained-responses';const m=meta.addMetadata();m.representation='decoded-console-json';
    assert.equal((await meta.run()).reason,'decoded-metadata-unsupported');assert.equal(meta.reads.length,0);
});

test('decoded representation must be explicit; content never selects or changes its parser',async t=>{
    for(const mode of ['missing','frame-as-json','json-as-frame']){
        const w=setup(t);w.request.source.scope='retained-responses';
        const body=Buffer.from(JSON.stringify(log({tick:1,map:false}))),frame=cacheFrame(body,{time:100});
        const d=w.add(mode==='frame-as-json'?frame:body,key(replayId,100));
        if(mode!=='missing')d.representation=mode==='frame-as-json'?'decoded-console-json':'cache-v5';
        if(mode==='missing'){assert.equal((await w.run()).reason,'representation-required');assert.equal(w.reads.length,0);}
        else await assert.rejects(w.run(),/log-format-or-identity/);
    }
});

test('frame digests neither pin decoded bytes nor establish prior decoded integrity',async t=>{
    for(const field of ['sha256','historicalDecodedSha256']){
        const w=setup(t);w.request.source.scope='retained-responses';
        const body=Buffer.from(JSON.stringify(log({tick:1,map:false}))),frameHash=sha256(cacheFrame(body,{time:100}));
        const d=w.add(body,key(replayId,100));d.representation='decoded-console-json';d.originalFrameSha256=frameHash;
        d[field]=frameHash;
        await assert.rejects(w.run(),field==='sha256'?/source-hash-mismatch/:/historical-decoded-hash-mismatch/);
        assert(!fs.existsSync(path.join(w.output,'observations.json')));
    }
});

test('historical uncertainty cannot be silently upgraded by a resumed request',async t=>{
    const w=setup(t);w.request.source.scope='retained-responses';
    const d=w.add(Buffer.from(JSON.stringify(log({tick:1,map:false}))),key(replayId,100));d.representation='decoded-console-json';
    await w.run();const prior=fs.readFileSync(path.join(w.output,'report.json'));w.reads.length=0;
    d.historicalDecodedSha256=d.sha256;
    await assert.rejects(w.run(),/resume-binding-mismatch/);assert.equal(w.reads.length,0);
    assert(fs.readFileSync(path.join(w.output,'report.json')).equals(prior));
});

test('decoded malformed JSON/UTF8/schema, build, identity and span limits reject conservatively',async t=>{
    const bodies=[Buffer.from('{'),Buffer.from([255]),Buffer.from('[]'),Buffer.from('{"1":42}'),
        Buffer.from(JSON.stringify(log({tick:1,tag:'f'.repeat(64),map:false}))),
        Buffer.from(JSON.stringify({1:JSON.stringify({type:'game-state',tick:1,phase:'before-actions',buildId,
            replayId:'c'.repeat(24),creeps:[],flags:[]})})),
        Buffer.from(JSON.stringify({...log({tick:1,map:false}),...log({tick:301,map:false})}))];
    for(const body of bodies){const w=setup(t);w.request.source.scope='retained-responses';
        const d=w.add(body,key(replayId,100));d.representation='decoded-console-json';
        await assert.rejects(w.run(),/log-format-or-identity|emitted-build-mismatch/);
        assert.equal(w.report().responses.length,1);assert(!fs.existsSync(path.join(w.output,'observations.json')));
    }
    const body=Buffer.from(JSON.stringify(log({tick:1,map:false})));
    assert.notEqual(parseDecodedConsoleJson(body,{key:key(replayId,100),maxDecodedBytes:body.length-1}).kind,'log');
    assert.equal(parseDecodedConsoleJson(body,{key:key(replayId,100),maxDecodedBytes:body.length}).kind,'log');
});

test('decoded source-byte changes reject and already-validated decoded artifacts resume without touching mutable source',async t=>{
    const w=setup(t);w.request.source.scope='retained-responses';
    const d=w.add(Buffer.from(JSON.stringify(log({tick:1,map:false}))),key(replayId,100));d.representation='decoded-console-json';
    await w.run();w.responses.set(d.key,Buffer.from('changed'));w.reads.length=0;
    const r=await w.run();assert.equal(w.reads.length,0);assert.equal(r.reads.reused,1);
    const f=path.join(w.output,sha256(d.key)+'.console.json');fs.appendFileSync(f,' ');
    await assert.rejects(w.run(),/stale-response/);assert.equal(w.reads.length,0);
});

test('resume validates saved responses and avoids all repeated source reads',async t=>{
    const w=setup(t);w.addLog([1,2],{end:100});w.addLog([3],{end:200});
    await w.run();assert.equal(w.reads.length,2);const previous=w.observations();
    w.reads.length=0;const r=await w.run({withSource:()=>{throw Error('must not read source');}});
    assert.equal(r.reads.reused,2);assert.deepEqual(w.observations(),previous);
});

for(const boundary of ['after-response','after-receipt','after-extraction'])test(`interruption at ${boundary} resumes from bounded partial artifacts`,async t=>{
    const w=setup(t);w.addLog([1,2],{end:100});w.addLog([3],{end:200});let stopped=false;
    await assert.rejects(w.run({fault:async phase=>{if(!stopped&&phase===boundary){stopped=true;throw new RetrievalError('interrupted');}}}),/interrupted/);
    assert.equal(w.report().reason,'interrupted');assert.equal(w.reads.length,1);
    if(boundary==='after-extraction'){
        assert.equal(w.report().extraction.status,'partial');
        const p=JSON.parse(fs.readFileSync(path.join(w.output,w.report().extraction.artifact),'utf8'));
        assert.deepEqual(p.ticks.map(t=>t.snapshots.length),[1,1,0]);
    }
    w.reads.length=0;const r=await w.run();assert.equal(r.status,'extracted');assert.equal(w.reads.length,1);
    assert.deepEqual(w.observations().ticks.map(t=>t.snapshots.length),[1,1,1]);
});

test('stdout truncation or a broken output sink cannot discard a completed durable report',async t=>{
    const w=setup(t);w.addLog();const input=path.join(w.root,'request.json');fs.writeFileSync(input,json(w.request));
    let prefix='';await assert.rejects(reviewCommand([input,w.output],{withSource:w.withSource,emit:s=>{prefix=s.slice(0,8);throw Error('sink closed');}}),/sink closed/);
    assert.equal(prefix,'{"status');assert.equal(w.report().status,'extracted');assert.equal(w.observations().ticks.length,3);
});

test('metadata compares numeric UTC instants, not old/future file timestamps',async t=>{
    for(const createdAt of ['2026-10-18T12:01:00Z','2026-10-18T14:01:00+02:00']){
        const w=setup(t);delete w.request.replayId;w.addMetadata(replayId,createdAt);w.addLog();
        const r=await w.run();assert.equal(r.status,'extracted');assert.equal(r.identification.candidateCount,1);
        assert.equal(r.identification.candidates[0].createdUTC,'2026-10-18T12:01:00.000Z');
    }
    const w=setup(t);delete w.request.replayId;w.addMetadata(replayId,'2026-10-17T12:01:00Z');w.addLog();
    const r=await w.run();assert.equal(r.reason,'no-candidate-in-selected-evidence');
    assert.equal(r.identification.exclusions[0].reason,'outside-recorded-window');assert.equal(r.reads.logs,0);
});

test('zero and ambiguous candidate summaries are saved before validation; System/player labels are not inferred',async t=>{
    const w=setup(t);delete w.request.replayId;w.addMetadata();w.addMetadata('c'.repeat(24));w.addLog();
    const r=await w.run();assert.equal(r.reason,'ambiguous-candidates');assert.equal(w.report().identification.candidateCount,2);
    assert.equal(w.reads.length,2);assert.equal(r.reads.logs,0);assert(r.identification.candidates.every(c=>c.players.length===2));
    const missing=setup(t);delete missing.request.replayId;missing.addLog();
    assert.equal((await missing.run()).reason,'identity-input-required');assert.equal(missing.reads.length,0);
});

for(const when of [null,'not-a-time','2026-10-18T12:01:00','2026-02-30T12:01:00Z'])test(`missing/malformed recorded time ${when} is retained as unknown, not a zero-time match`,async t=>{
    const w=setup(t);delete w.request.replayId;w.addMetadata(replayId,when);w.addLog();const r=await w.run();
    assert.equal(r.identification.candidateCount,0);assert.equal(r.identification.errors[0].reason,'invalid-recorded-time');
    assert.equal(r.reason,'no-candidate-in-selected-evidence');assert.equal(r.reads.logs,0);
});

test('inconsistent activation/completion window blocks without silently broadening or reading sources',async t=>{
    const w=setup(t);w.addMetadata();w.request.completionRecordedAt='2026-10-18T11:00:00Z';
    const r=await w.run();assert.equal(r.reason,'inconsistent-trial-window');assert.equal(w.reads.length,0);
});

test('wrong and unknown emitted builds remain observed failures, not checkpoint substitutions',async t=>{
    for(const tag of ['f'.repeat(64),undefined]){
        const w=setup(t);w.addLog([1],{tag:tag??null});
        if(tag===undefined){const d=w.request.logs[0],body={1:JSON.stringify({type:'game-state',tick:1,
            phase:'before-actions',creeps:[],flags:[]})},bytes=cacheFrame(body,{time:100});
            d.sha256=sha256(bytes);w.responses.set(d.key,bytes);}
        await assert.rejects(w.run(),/emitted-build-mismatch/);
        assert.equal(w.report().buildVerification.observed[0].buildId,tag??null);
        assert(!fs.existsSync(path.join(w.output,'observations.json')));
    }
});

test('stale raw/receipt/report/extraction artifacts stop without overwriting prior results or rereading sources',async t=>{
    for(const kind of ['raw','receipt','report','extraction','partial']){
        const w=setup(t),d=w.addLog();await w.run();
        const p=path.join(w.output,kind==='raw'?sha256(d.key)+'.cache':kind==='receipt'?sha256(d.key)+'.json':kind==='report'?'report.json':kind==='partial'?'partial-1.json':'observations.json');
        fs.appendFileSync(p,' ');const before=fs.readFileSync(path.join(w.output,'report.json'));w.reads.length=0;
        await assert.rejects(w.run(),/stale-/);assert.equal(w.reads.length,0);
        assert(fs.readFileSync(path.join(w.output,'report.json')).equals(before));
    }
});

test('changed request/limits/checkpoint or declared source hash cannot reuse old artifacts',async t=>{
    for(const kind of ['checkpoint','limits','source']){
        const w=setup(t);w.addLog();await w.run();const previous=fs.readFileSync(path.join(w.output,'report.json'));
        if(kind==='checkpoint')w.request.checkpoint.enabledBuild='c'.repeat(64);
        if(kind==='limits')w.request.limits.lastTick=2;
        if(kind==='source')w.request.logs[0].sha256='c'.repeat(64);
        await assert.rejects(w.run(),/resume-binding-mismatch/);assert(fs.readFileSync(path.join(w.output,'report.json')).equals(previous));
    }
});

test('saved code binding cannot be substituted to resume a different tool version',async t=>{
    const w=setup(t);w.addLog();await w.run();
    const p=path.join(w.output,'request.json'),binding=JSON.parse(fs.readFileSync(p,'utf8'));
    binding.code='0'.repeat(64);fs.writeFileSync(p,json(binding));w.reads.length=0;
    const previous=fs.readFileSync(path.join(w.output,'report.json'));
    await assert.rejects(w.run(),/resume-binding-mismatch/);assert.equal(w.reads.length,0);
    assert(fs.readFileSync(path.join(w.output,'report.json')).equals(previous));
});

test('missing committed response/extraction artifacts block rather than reread or replace prior report',async t=>{
    for(const kind of ['response','extraction']){
        const w=setup(t),d=w.addLog();await w.run();const previous=fs.readFileSync(path.join(w.output,'report.json'));
        fs.unlinkSync(path.join(w.output,kind==='response'?sha256(d.key)+'.cache':'observations.json'));
        w.reads.length=0;await assert.rejects(w.run(),/partial-artifact-missing|stale-extraction/);
        assert.equal(w.reads.length,0);assert(fs.readFileSync(path.join(w.output,'report.json')).equals(previous));
    }
});

test('conflicting source provenance is not silently relabelled',async t=>{
    const w=setup(t);w.addLog();await assert.rejects(w.run({withSource:async d=>
        ({bytes:w.responses.get(d.key),provenance:'different-authority'})}),/source-provenance-mismatch/);
    assert.equal(w.report().responses.length,0);assert.equal(w.report().reason,'source-provenance-mismatch');
});

test('caller chunk/tick limits, gaps and conflicting observations are explicit',async t=>{
    const w=setup(t);w.addLog([1],{end:100});w.addLog([3],{end:200});w.request.limits.chunks=1;
    await assert.rejects(w.run(),/chunk-limit/);assert.equal(w.reads.length,0);
    const gap=setup(t);gap.addLog([1,3]);const r=await gap.run();assert.deepEqual(r.extraction.gaps,[2]);
    assert.equal(gap.observations().ticks[1].snapshots.length,0);
    const excess=setup(t);excess.request.limits.lastTick=301;assert.equal((await excess.run()).reason,'invalid-limits');
    const conflict=setup(t);conflict.addLog([1]);const d=conflict.addLog([1],{end:200});
    const body={1:JSON.stringify({type:'game-state',tick:1,phase:'before-actions',buildId,creeps:[],flags:[]})};
    const bytes=cacheFrame(body,{time:200});conflict.responses.set(d.key,bytes);d.sha256=sha256(bytes);
    const rejected=await conflict.run();assert.equal(rejected.reason,'conflicting-observations');
    assert.deepEqual(rejected.extraction.conflicts,[1]);assert.equal(conflict.observations().ticks[0].snapshots.length,2);
});

test('shared file timestamps do not classify recorded match times',async t=>{
    const w=setup(t);delete w.request.replayId;w.addMetadata(replayId,'2026-10-18T12:01:00Z');
    w.addMetadata('c'.repeat(24),'2026-10-17T12:01:00Z');w.addLog();
    for(const d of [...w.request.metadataKeys,...w.request.logs]){
        const f=path.join(w.source,d.file);fs.writeFileSync(f,w.responses.get(d.key));fs.utimesSync(f,1,1);
    }
    const r=await w.run({withSource:async d=>({bytes:readReviewFile(path.join(w.source,d.file),8*1048576),provenance:w.request.source.provenance})});
    assert.equal(r.identification.candidateCount,1);assert.equal(r.identification.replayId,replayId);
    assert.equal(r.identification.exclusions[0].reason,'outside-recorded-window');
});

test('reduced decode bounds and source hashes fail closed while exact selected bytes remain retained',async t=>{
    const w=setup(t),d=w.addLog();w.responses.set(d.key,Buffer.from('not the pinned source'));
    await assert.rejects(w.run(),/source-hash-mismatch/);assert.equal(w.report().responses.length,0);
    const expanded=setup(t);const bytes=cacheFrame({1:'x'.repeat(8*1048576+1)},{time:100});
    expanded.add(bytes,key(replayId,100));await assert.rejects(expanded.run(),/log-format-or-identity/);
    assert.equal(expanded.report().responses.length,1);assert(!fs.existsSync(path.join(expanded.output,'observations.json')));
});

test('unstable/unavailable injected readers retain prior exact responses, not fictitious empty chunks',async t=>{
    const w=setup(t);w.addLog([1],{end:100});w.addLog([2,3],{end:200});let calls=0;
    await assert.rejects(w.run({withSource:async d=>{if(++calls===2)throw new RetrievalError('unstable-read');return w.withSource(d);}}),/unstable-read/);
    assert.equal(w.report().responses.length,1);assert.equal(w.report().reason,'unstable-read');
    const before=w.reads.length;await w.run();assert.equal(w.reads.length-before,1);
});

test('canonical paths, hard links, symlinks, byte bounds and retained-source authority are fenced',async t=>{
    const w=setup(t),f=path.join(w.source,'plain');fs.writeFileSync(f,'generated');
    assert.throws(()=>readReviewFile(f,2),/read-limit/);
    const link=path.join(w.source,'link');fs.symlinkSync(f,link);assert.throws(()=>readReviewFile(link,100));
    fs.unlinkSync(link);fs.linkSync(f,link);assert.throws(()=>readReviewFile(link,100),/unsafe-path/);
    w.addLog();w.request.source.scope='live-cache';assert.equal((await w.run()).reason,'source-authority-required');
    assert.equal(w.reads.length,0);
});

test('existing analyzer CLI routes explicit generated request and copied checkpoint without default discovery',async t=>{
    const w=setup(t);w.addLog();for(const d of w.request.logs)fs.writeFileSync(path.join(w.source,d.file),w.responses.get(d.key));
    const cp=path.join(w.root,'checkpoint.json');fs.writeFileSync(cp,json(w.request.checkpoint));w.request.checkpoint=cp;
    const request=path.join(w.root,'request.json');fs.writeFileSync(request,json(w.request));
    const result=spawnSync(process.execPath,['tools/replay-analysis.js','--review',request,w.output],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert(result.stdout.length<2048);
    assert.equal(JSON.parse(result.stdout).humanReview,'not-performed');assert.equal(w.report().status,'extracted');
});

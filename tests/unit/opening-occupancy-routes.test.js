// Generated-only API-shaped responses. No historical/retained payload reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import {occupancyWorld,scriptedResponse,TestCostMatrix,centreFrame,supplySteps} from '../fixtures/opening-occupancy-api-world.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {blockedOpeningReports} from '../../src/strategy/opening-deployment.js';
const moved=f=>[...f.mission.moves??[]].filter(([,p])=>p).map(([id])=>id).sort();
const snapshot=w=>JSON.stringify({creeps:w.spacing.creeps,flags:w.flags,membership:w.membership});
// Explicit alternate response corridor for cases where (27,18) is occupied;
// this is supplied test data, not a neighbour/terrain search.
const highMedic=[{x:26,y:19},{x:26,y:18},{x:26,y:17},
    ...Array.from({length:18},(_,i)=>({x:27+i,y:17})),{x:44,y:18},{x:44,y:19},{x:44,y:20}];
function advance(w){w.tick++;w.bind();w.reports();}
function block(w){Object.assign(w.actor('scout1'),{x:28,y:19});w.distinct();w.responseFamily='detour';}
function safe(w,f){
    for(const c of w.myCreeps)assert(f.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
    assert(f.plan.diagnostic.queries<=(w.tick===1?24:4));
    if(f.plan.state.phase!=='active')return;
    assert.equal(f.plan.state.selection.startedAt,1);assert((f.mission.diagnostic.travel?.examined??0)<=16);
    const destinations=[...f.plan.moves.values()].filter(Boolean);
    assert.equal(new Set(destinations.map(p=>p.x+','+p.y)).size,destinations.length);
    for(const p of destinations)assert(!w.spacing.creeps.some(c=>c.hits>0&&c.x===p.x&&c.y===p.y));
    for(const s of w.membership.squads){
        const steps=new Map(s.memberIds.map(id=>[id,f.plan.moves.get(id)??null]));
        assert(secondaryStepSupport(w.myCreeps,s.memberIds,steps));
        for(let mask=0;mask<16;mask++){
            const group=s.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?steps.get(id):null)}));
            assert(secondaryStepSupport(group,s.memberIds,new Map(s.memberIds.map(id=>[id,null]))));
        }
    }
}
test('production evicts an occupied fresh cache and refreshes once within four queries',()=>{
    const w=occupancyWorld(),first=centreFrame(w);safe(w,first);
    block(w);advance(w);const previous=JSON.stringify(w.state),before=snapshot(w);
    const next=centreFrame(w);safe(w,next);
    assert.equal(snapshot(w),before);assert.equal(previous,JSON.stringify(first.mission.state));
    assert.equal(next.plan.state.phase,'active');assert.equal(next.plan.diagnostic.queries,4);
    assert.equal(next.plan.diagnostic.cacheHits,0);
    assert.deepEqual(next.mission.requestAdapter.evictedActorIds,['bow1']);
    assert.deepEqual(next.mission.diagnostic.travel.actors.find(a=>a.actorId==='bow1').admitted,
        {x:27,y:18});
    assert.equal(w.requests.filter(r=>r.tick===2).length,4);
});

test('per-request matrix blocks every living occupied cell except origin, preserves terrain defaults and inputs',()=>{
    const w=occupancyWorld(),before=snapshot(w),f=centreFrame(w);safe(w,f);
    assert.equal(snapshot(w),before);assert.equal(f.plan.diagnostic.queries,16);
    assert.equal(f.plan.diagnostic.reportedOps,1600);
    for(const r of w.requests){
        assert(r.matrix instanceof TestCostMatrix);
        assert.equal(r.matrix.get(r.origin.x,r.origin.y),0);
        for(let y=0;y<100;y++)for(let x=0;x<100;x++){
            const occupied=r.observed.some(c=>c.exists!==false&&c.hits>0&&c.id!==r.actorId&&c.x===x&&c.y===y);
            assert.equal(r.matrix.get(x,y),occupied?255:0);
        }
        assert.equal(r.goal.range,0);assert.equal(r.maxOps,1000);
        // These positive supplied corridors respect this request's occupancy.
        for(const p of r.result.path)assert.notEqual(r.matrix.get(p.x,p.y),255);
    }
    assert.equal(new Set(w.requests.map(r=>r.matrix)).size,16);
    const a=w.requests[0].matrix,b=a.clone();b.set(0,0,255);assert.equal(a.get(0,0),0);
});

test('moving blockers update later requests; a cleared cached next cell does not refresh early',()=>{
    const w=occupancyWorld();centreFrame(w);
    Object.assign(w.actor('scout1'),{x:29,y:19});advance(w);
    const clear=centreFrame(w);safe(w,clear);
    assert.equal(clear.plan.diagnostic.cacheHits,4);assert.equal(clear.plan.diagnostic.queries,0);
    // Explicit time jump to cache expiry; positions are not command-updated.
    // API response now explicitly uses the declared detour around the blocker.
    w.responseFamily='detour';w.tick=6;w.bind();w.reports();const refresh=centreFrame(w);safe(w,refresh);
    assert.equal(refresh.plan.diagnostic.queries,4);
    for(const r of w.requests.filter(r=>r.tick===6)){
        assert.equal(r.matrix.get(28,19),0);assert.equal(r.matrix.get(29,19),255);
    }
});

test('all occupied cached next steps still use one four-query refresh, never a per-blocker retry',()=>{
    const w=occupancyWorld({respond:(w,a,g)=>w.tick===1?scriptedResponse(w,a,g):
        {path:[],incomplete:true,ops:1000}}),first=centreFrame(w);
    // Retained squads need support too: move the entire retained force near
    // their proposed blockers, without changing membership or roles.
    const points={guardH1:[28,17],guardH2:[28,23],guardM0:[26,19],guardM1:[28,19],
        guardM2:[28,20],blade:[28,21],guardR0:[29,18],guardR1:[29,22]};
    for(const[id,[x,y]]of Object.entries(points))Object.assign(w.actor(id),{x,y});
    w.distinct();advance(w);w.responseFamily='detour';
    const blocked=blockedOpeningReports({...w,creeps:w.spacing.creeps},w.state);
    assert.equal(blocked.length,4);const next=centreFrame(w);
    assert.equal(next.mission.requestAdapter.evictedActorIds.length,4);
    assert.equal(next.plan.diagnostic.queries,4);assert.equal(w.requests.filter(r=>r.tick===2).length,4);
    assert(next.plan.diagnostic.queries<=4);assert.equal(first.plan.state.selection.startedAt,1);
});

test('ordinary expiry refresh remains age5, without cache eviction, deadline reset or extra queries',()=>{
    const w=occupancyWorld();centreFrame(w);
    w.tick=6;w.bind();w.reports();const f=centreFrame(w);safe(w,f);
    assert.deepEqual(f.mission.requestAdapter.evictedActorIds,[]);
    assert.equal(f.plan.diagnostic.queries,4);assert.equal(f.plan.diagnostic.cacheHits,0);
    assert(w.state.routeControl.cache.every(r=>r.searchedAt===6));
    assert.equal(w.state.selection.startedAt+60,61);
});

test('off-path observations retain production refresh rather than fabricating a cache origin',()=>{
    const w=occupancyWorld({respond:(w,a,g)=>w.tick===2&&a.id==='medic'&&g.pos.id==='east'?
        {path:highMedic,incomplete:false,ops:100}:scriptedResponse(w,a,g)});
    centreFrame(w);Object.assign(w.actor('bow1'),{x:27,y:18});advance(w);
    w.responseFamily='detour';const f=centreFrame(w);safe(w,f);
    assert.deepEqual(f.mission.requestAdapter.evictedActorIds,[]);
    assert.equal(f.plan.diagnostic.queries,4);assert.equal(f.plan.state.selection.startedAt,1);
    assert.deepEqual(w.state.routeControl.cache.find(r=>r.actorId==='bow1').from,{x:27,y:18});
});

test('observed partial movement rebases the blocked suffix; input cache and observations stay immutable',()=>{
    const w=occupancyWorld({respond:(w,a,g)=>{
        if(w.tick===2&&a.id==='bow1'&&g.pos.id==='east')return{path:[{x:28,y:18},
            ...Array.from({length:16},(_,i)=>({x:29+i,y:18})),{x:44,y:19},{x:44,y:20}],incomplete:false,ops:100};
        return scriptedResponse(w,a,g);
    }}),first=centreFrame(w);safe(w,first);
    supplySteps(w,first,['bow1']);
    // Distinct blocker at bow1's ACTUAL next node, not its consumed origin.
    Object.assign(w.actor('scout1'),{x:29,y:19});w.distinct();
    const cached=JSON.stringify(w.state.routeControl.cache);
    const evicted=blockedOpeningReports({...w,creeps:w.spacing.creeps},w.state);
    assert.deepEqual(evicted.map(r=>r.actorId),['bow1']);
    w.responseFamily='straight';const next=centreFrame(w);safe(w,next);
    assert.equal(cached,JSON.stringify(first.mission.state.routeControl.cache));
    assert.equal(next.plan.diagnostic.queries,4);assert.equal(next.plan.state.selection.startedAt,1);
    assert.equal(w.requests.findLast(r=>r.actorId==='bow1').origin.x,28);
});

test('all eight exits blocked are represented in the matrix and an explicit incomplete response stops the mission',()=>{
    const w=occupancyWorld({respond:(w,a,g)=>w.tick===1?scriptedResponse(w,a,g):
        {path:[],incomplete:true,ops:1000}});centreFrame(w);
    const points={guardH1:[24,19],guardM0:[25,19],guardM1:[26,19],guardM2:[24,20],
        guardH2:[26,20],blade:[24,21],guardR0:[25,21],guardR1:[26,21]};
    for(const[id,[x,y]]of Object.entries(points))Object.assign(w.actor(id),{x,y});
    w.distinct();advance(w);const f=centreFrame(w);
    const r=w.requests.findLast(r=>r.actorId==='medic');assert.equal(r.tick,2);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
        assert.equal(r.matrix.get(25+dx,20+dy),dx===0&&dy===0?0:255);
    assert.equal(f.plan.diagnostic.queries,4);assert.equal(f.plan.diagnostic.reportedOps,4000);
    assert.equal(f.plan.state.phase,'finished');assert.equal(f.plan.diagnostic.reason,'objective-unavailable');
});

test('same initial responses plus an explicit detour refresh permit additional support-safe generated progress',()=>{
    const results=[];
    // Original comparison is preserved in the accepted experiment receipt;
    // do not maintain an occupancy-unaware second policy after promotion.
    const original={counts:[4,3,3,1,3],queries:16,bow1:{x:27,y:19}};
    {
        const w=occupancyWorld(),firstPositions=new Map(w.myCreeps.map(c=>[c.id,{x:c.x,y:c.y}])),counts=[];
        for(let i=0;i<5;i++){
            if(i===1){block(w);advance(w);}
            const before=snapshot(w),f=centreFrame(w);safe(w,f);assert.equal(snapshot(w),before);
            assert.equal(f.plan.state.phase,'active');counts.push(moved(f).length);
            const baseline=w.execute(null,{tacticalObservation:{...w,creeps:w.spacing.creeps}});
            const tactics=a=>a.filter(c=>!['move','moveTo'].includes(c.method));
            assert.deepEqual(tactics(f.calls),tactics(baseline.calls));
            if(i>0&&i<4)supplySteps(w,f);
        }
        assert.equal(w.actor('scout1').x,28);assert.equal(w.actor('scout1').y,19);
        for(const r of w.requests)if(r.matrix)for(const p of r.result.path)
            assert.notEqual(r.matrix.get(p.x,p.y),255,'Supplied positive responses respect request occupancy');
        assert(w.actor('bow1').x>firstPositions.get('bow1').x);
        results.push({counts,queries:w.requests.length,bow1:{x:w.actor('bow1').x,y:w.actor('bow1').y}});
    }
    assert.equal(results[0].queries,20);assert.deepEqual(results[0].counts,[4,4,4,2,4]);
    assert.deepEqual(results[0].bow1,{x:29,y:18});
    assert(results[0].counts.slice(1).reduce((a,b)=>a+b,0)>original.counts.slice(1).reduce((a,b)=>a+b,0));
});

test('successive blocked-step refreshes cannot reset non-displacement or the original deadline',()=>{
    const w=occupancyWorld({respond:(w,a,g)=>w.tick>1&&w.tick%2===1&&a.id==='medic'&&g.pos.id==='east'?
        {path:highMedic,incomplete:false,ops:100}:scriptedResponse(w,a,g)});let f;
    for(let tick=1;tick<=5;tick++){
        if(tick>1){const p=tick%2===0?{x:28,y:19}:{x:27,y:18};Object.assign(w.actor('scout1'),p);
            w.responseFamily=tick%2===0?'detour':'straight';advance(w);}
        f=centreFrame(w);safe(w,f);
        // Eviction exposes missing routes before the selector's stall branch;
        // terminal observation5 can pay the same bounded refresh before stop.
        assert.equal(f.plan.diagnostic.queries,tick===1?16:4);
    }
    assert.equal(f.plan.diagnostic.reason,'no-displacement');assert.equal(w.requests.length,32);
    assert.equal(f.plan.state.selection.startedAt,1);
    const late=occupancyWorld();centreFrame(late);block(late);late.tick=61;late.bind();late.reports();
    const timeout=centreFrame(late);assert.equal(timeout.plan.diagnostic.reason,'timeout');
    assert.equal(timeout.plan.diagnostic.queries,0);assert.equal(late.requests.length,16);
});

test('matrix cannot arbitrate convergence on a currently free cell; intersection contenders still hold',()=>{
    const w=occupancyWorld({respond:(w,a,g)=>{
        const r=scriptedResponse(w,a,g);
        if(g.pos.id==='east'&&a.id==='bow1')return{...r,path:[{x:28,y:20},...Array.from({length:16},(_,i)=>({x:29+i,y:20}))]};
        return r;
    }});
    const f=centreFrame(w);safe(w,f);
    assert.equal(f.mission.diagnostic.travel.tied,2);assert.equal(f.mission.moves.get('bow1'),null);
    assert.equal(f.mission.moves.get('bow2'),null);assert.deepEqual(moved(f),['guardR2','medic']);
    assert.equal(w.requests.find(r=>r.actorId==='bow1').matrix.get(28,20),0);
});

for(const rc of [0,-11,undefined])test(`return ${rc} without observed displacement retains original stall termination`,()=>{
    const w=occupancyWorld();w.group().memberIds.forEach(id=>w.returns.set(id,rc));let f;
    for(let i=0;i<6;i++){
        f=centreFrame(w);safe(w,f);
        if(f.plan.state.phase!=='active')break;
        const attempts=f.records.filter(r=>r.method==='move'&&w.group().memberIds.includes(r.actorId));
        assert(attempts.every(r=>r.returnCode===(rc??null)));advance(w);
    }
    assert.equal(w.tick,5);assert.equal(f.plan.diagnostic.reason,'no-displacement');
    assert.equal(w.requests.length,16);assert.equal(w.state.selection.startedAt,1);
});

for(const mutation of ['support','centre','escort'])test(`${mutation} retains cancellation and higher-priority ownership`,()=>{
    const w=occupancyWorld();centreFrame(w);block(w);advance(w);const extra={};
    if(mutation==='support')w.actor('bow2').x=30;
    if(mutation==='centre')w.actor('guardM0').x=25;
    if(mutation==='escort')extra.escort={healerId:'medic',allyId:'bow1',mode:'hold',distance:2,ally:w.actor('bow1')};
    const f=centreFrame(w,extra);assert.equal(f.plan.state.phase,'finished');
    assert.equal(f.mission.moves,null);
    assert.equal(f.plan.diagnostic.queries,mutation==='escort'?4:0);
    if(mutation==='escort')assert.equal(f.plan.diagnostic.reason,'capture-movement-priority');
    else assert(['support-unavailable','defence-unavailable','centre-mission-unavailable'].includes(f.plan.diagnostic.reason));
    assert(!f.calls.some(c=>c.method==='move'&&w.group().memberIds.includes(c.id)));
});

for(const failure of ['incomplete','overlong','unknown','ops'])test(`blocked refresh ${failure} retains conservative production rejection`,()=>{
    let bad=false;const w=occupancyWorld({respond:(w,a,g)=>{
        if(!bad)return scriptedResponse(w,a,g);
        if(failure==='incomplete')return{path:[],incomplete:true,ops:1000};
        if(failure==='overlong')return{path:Array.from({length:41},()=>({x:44,y:20})),incomplete:false,ops:100};
        if(failure==='ops')return{path:[],incomplete:false,ops:1001};
        return undefined;
    }});
    centreFrame(w);bad=true;block(w);advance(w);const f=centreFrame(w);
    assert.equal(f.plan.state.phase,'finished');assert.equal(f.mission.moves,null);
    assert.equal(f.plan.diagnostic.queries,failure==='incomplete'?4:1);
    assert.equal(f.plan.diagnostic.reason,failure==='incomplete'?'objective-unavailable':failure==='overlong'?'route-limit-exceeded':'route-result-unsupported');
    if(['unknown','ops'].includes(failure))assert.equal(f.plan.diagnostic.reportedOps,null);
});

test('twenty-four acquisition requests retain the original cap and thousand-operation options',()=>{
    const w=occupancyWorld();Object.assign(w.flags.find(f=>f.id==='south'),{x:40,y:55});
    Object.assign(w.flags.find(f=>f.id==='far'),{x:55,y:40});
    const f=centreFrame(w);safe(w,f);
    assert.equal(f.plan.diagnostic.queries,24);assert.equal(w.requests.length,24);
    assert(w.requests.every(r=>r.maxOps===1000));assert.equal(f.plan.diagnostic.reportedOps,2400);
});

for(const malformed of [false,true])test(`overlong acquisition response ${malformed?'with unknown completeness fails':'excludes only its candidate'} under unchanged validation`,()=>{
    const w=occupancyWorld({respond:(w,a,g)=>g.pos.id==='east'?{
        path:Array.from({length:41},()=>({x:44,y:20})),incomplete:malformed?undefined:false,ops:100}:
        scriptedResponse(w,a,g)});
    const f=centreFrame(w);assert.equal(f.plan.state.phase,'finished');assert.equal(f.mission.moves,null);
    assert.equal(f.plan.diagnostic.reason,malformed?'route-incomplete-unsupported':'no-useful-objective');
    assert.equal(f.plan.diagnostic.queries,malformed?1:13);
    if(!malformed)assert.equal(f.plan.diagnostic.excludedCandidates.routeLimit,1);
});

for(const active of [false,true])test(`missing matrix support rejects ${active?'cached':'initial'} opening without an unaware search`,()=>{
    const w=occupancyWorld();if(active)centreFrame(w);
    const count=w.requests.length;w.CostMatrix=null;if(active)advance(w);
    const f=centreFrame(w);assert.equal(f.plan.diagnostic.reason,'opening-matrix-unavailable');
    assert.equal(f.plan.diagnostic.queries,0);assert.equal(w.requests.length,count);
    assert.equal(f.plan.state.phase,'finished');assert.equal(f.mission.moves,null);
});

for(const missing of ['enemy','duplicate','explicit','coordinate'])test(`incomplete occupancy ${missing} rejects before matrix construction or search`,()=>{
    let constructions=0;
    const w=occupancyWorld({CostMatrix:class extends TestCostMatrix{constructor(){super();constructions++;}}});
    if(missing==='enemy')w.spacing.creeps=w.spacing.creeps.filter(c=>c!==w.enemies[0]);
    if(missing==='duplicate')w.spacing.creeps.push(w.enemies[0]);
    if(missing==='explicit')w.observationComplete=false;
    if(missing==='coordinate')w.enemies[0].x=NaN;
    const f=centreFrame(w);assert.equal(f.plan.state.phase,'finished');assert.equal(f.plan.diagnostic.queries,0);
    assert.equal(constructions,0);assert.equal(w.requests.length,0);
});

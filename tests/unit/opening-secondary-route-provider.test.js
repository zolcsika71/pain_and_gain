// Pure generated API responses/observations. No retained-seed reader import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {openingWorld} from '../fixtures/opening-secondary-generated-world.js';
import {useGeneratedOpeningSearch} from '../fixtures/opening-secondary-search-api.js';

const world=respond=>useGeneratedOpeningSearch(openingWorld(),respond);
const moving=p=>[...p.moves??[]].filter(([,s])=>s).map(([id])=>id);
const tactical=calls=>calls.filter(c=>!['move','moveTo'].includes(c.method));

test('Arena-shaped requests bind observed origins, neutral goals, range0 and maxOps1000; responses do not move actors',()=>{
    const w=world(),before=w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y})),p=w.plan();
    assert.equal(p.diagnostic.reason,'selected');assert.equal(w.centre.my,undefined);
    assert.equal(p.diagnostic.queries,16);assert.equal(p.diagnostic.reportedOps,1600);
    assert.equal(p.diagnostic.excludedCandidates.geometry,2);
    assert.equal(w.searchRequests.length,16);
    for(const r of w.searchRequests){
        assert.deepEqual(r.origin,before.map(({id,...p})=>({id,p})).find(c=>c.id===r.actorId).p);
        assert.equal(r.goal.range,0);assert.equal(r.options.maxOps,1000);
        assert.equal(r.options.costMatrix.get(r.origin.x,r.origin.y),0);
        assert.equal(w.flags.find(f=>f.id===r.goal.id).my,undefined);
    }
    assert.deepEqual(w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y})),before);
    const legacy=openingWorld().plan();assert.equal(p.objectiveId,legacy.objectiveId);
    assert.deepEqual(p.evaluation,legacy.evaluation);assert.deepEqual(p.moves,legacy.moves);
});

test('six generated successive observations advance on validated suffixes; age5 refreshes only four routes without resetting time',()=>{
    const w=world(),history=[];
    for(let tick=1;tick<=6;tick++){
        const base=w.execute(),p=w.plan(),run=w.execute(p);
        assert.equal(p.state.phase,'active');assert.equal(moving(p).length,4);
        assert.deepEqual(tactical(run.calls),tactical(base.calls));
        assert.equal(p.state.selection.startedAt,1);assert.equal(p.state.selection.unchanged,0);
        assert.equal(p.state.selection.startedAt+60,61);
        const dates=p.state.routeControl.cache.map(r=>r.searchedAt);
        assert(dates.every(t=>t===(tick<6?1:6)));
        for(const r of p.state.routeControl.cache){assert.deepEqual(r.from,{x:w.actor(r.actorId).x,y:w.actor(r.actorId).y});}
        history.push([p.diagnostic.queries,p.diagnostic.cacheHits,p.diagnostic.reportedOps]);w.next(p);
    }
    assert.deepEqual(history,[[16,0,1600],[0,4,0],[0,4,0],[0,4,0],[0,4,0],[4,0,400]]);
    assert.equal(w.searchRequests.length,20);
});

test('partial observed displacement rebases each actor independently, including the actor whose accepted step did not move',()=>{
    const w=world(),first=w.plan(),old=new Map(first.state.routeControl.cache.map(r=>[r.actorId,r.path[0]]));
    w.execute(first);w.next(first,moving(first).filter(id=>id!=='bow1'));
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(p.diagnostic.queries,0);
    assert.equal(p.diagnostic.cacheHits,4);assert.deepEqual(p.movement.steps.get('bow1'),old.get('bow1'));
    assert.equal(p.state.routeControl.cache.find(r=>r.actorId==='bow1').path.length,
        first.state.routeControl.cache.find(r=>r.actorId==='bow1').path.length);
    assert.equal(p.state.routeControl.cache.find(r=>r.actorId==='bow2').path.length,
        first.state.routeControl.cache.find(r=>r.actorId==='bow2').path.length-1);
});

test('an off-path observed position cannot reuse its suffix; bounded refresh preserves the original episode',()=>{
    const w=world(),first=w.plan();w.next(first);
    // Supplied off-path observation, not inferred from a command or arbitration.
    w.actor('bow1').y--;w.distinct();w.reports();
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(p.diagnostic.queries,4);
    assert.equal(p.diagnostic.cacheHits,0);assert.equal(p.diagnostic.reportedOps,400);
    assert.equal(p.state.selection.startedAt,1);assert.equal(w.searchRequests.length,20);
    assert.deepEqual(p.state.routeControl.cache.find(r=>r.actorId==='bow1').from,{x:28,y:18});
});

for(const [label,mutate,reason] of [
    ['target position',w=>w.flags.find(f=>f.id==='east').x++,'target-binding-changed'],
    ['target effect',w=>{const a=w.flags.find(f=>f.id==='east'),b=w.flags.find(f=>f.id==='north');
        [a.effectType,b.effectType]=[b.effectType,a.effectType];
        [a.scorePerTick,b.scorePerTick]=[b.scorePerTick,a.scorePerTick];},'target-binding-changed'],
    ['target ownership',w=>w.flags.find(f=>f.id==='east').my=false,'ownership-changed'],
    ['generated ownership confirmation',w=>w.flags.find(f=>f.id==='east').my=true,'captured'],
    ['centre identity',w=>w.centre.x++,'binding-changed'],
    ['enemy centre',w=>w.centre.my=false,'centre-enemy-owned'],
])test(`${label} terminates without a route refresh, retry or new target`,()=>{
    const w=world(),first=w.plan();w.next(first);mutate(w);
    let p=w.plan();assert.equal(p.diagnostic.reason,reason);assert.equal(p.state.phase,'finished');
    assert.equal(w.searchRequests.length,16);assert.equal(p.diagnostic.queries,0);
    w.tick++;w.bind();p=w.plan();assert.equal(p.diagnostic.reason,reason);assert.equal(w.searchRequests.length,16);
});

for(const [label,respond,reason,ops] of [
    ['missing result',()=>undefined,'route-result-unsupported',null],
    ['missing ops',r=>({...r,ops:undefined}),'route-result-unsupported',null],
    ['NaN ops',r=>({...r,ops:NaN}),'route-result-unsupported',null],
    ['fractional ops',r=>({...r,ops:0.5}),'route-result-unsupported',null],
    ['negative ops',r=>({...r,ops:-1}),'route-result-unsupported',null],
    ['over-budget ops',r=>({...r,ops:1001}),'route-result-unsupported',null],
    ['nonarray path',r=>({...r,path:{}}),'route-path-unsupported',100],
    ['missing incomplete',r=>({...r,incomplete:undefined}),'route-incomplete-unsupported',100],
    ['nonboolean incomplete',r=>({...r,incomplete:0}),'route-incomplete-unsupported',100],
    ['malformed long shape',r=>({...r,path:Array(41).fill({x:30,y:20}),incomplete:null}),
        'route-incomplete-unsupported',100],
])test(`${label} fails conservatively with one accounted query`,()=>{
    const w=world(respond),p=w.plan();assert.equal(p.state.phase,'finished');assert.equal(p.diagnostic.reason,reason);
    assert.equal(p.diagnostic.queries,1);assert.equal(p.diagnostic.reportedOps,ops);
    assert.equal(p.diagnostic.rejectedQuery.ordinal,1);assert.equal(w.searchRequests.length,1);
    assert.equal(p.moves,null);
});

test('thrown API result retains unknown operations and never retries',()=>{
    const w=world(()=>{throw Error('generated API failure');}),p=w.plan();
    assert.equal(p.diagnostic.reason,'route-result-unsupported');assert.equal(p.diagnostic.reportedOps,null);
    assert.equal(p.diagnostic.queries,1);assert.equal(p.diagnostic.rejectedQuery.pathType,'unknown');
});

test('unknown operations after earlier successful calls leave aggregate unknown, not a partial or invented total',()=>{
    const w=world((r,q,n)=>n===6?{...r,ops:undefined}:r),p=w.plan();
    assert.equal(p.diagnostic.queries,6);assert.equal(p.diagnostic.reportedOps,null);
    assert.equal(p.diagnostic.rejectedQuery.ordinal,6);assert.equal(p.diagnostic.rejectedQuery.ops,null);
    assert.equal(p.state.phase,'finished');
});

for(const [label,change] of [
    ['incomplete',r=>{r.incomplete=true;}],
    ['nonfinite coordinate',r=>{r.path[0].x=Infinity;}],
    ['missing coordinate',r=>{delete r.path[0].y;}],
    ['nonadjacent path',r=>{r.path[0].x+=5;}],
    ['wrong endpoint',r=>{r.path.pop();}],
])test(`${label} cannot qualify a candidate`,()=>{
    const w=world((r,q)=>{if(q.goal.id==='east')change(r);return r;}),p=w.plan();
    assert.equal(p.state.phase,'finished');assert.notEqual(p.diagnostic.reason,'selected');assert.equal(p.moves,null);
    assert(w.searchRequests.length<=24);
});

for(const first of [false,true])test(`a known overlong candidate ${first?'before':'after'} a usable candidate does not discard it`,()=>{
    const w=world((r,q)=>q.goal.id=== (first?'aaa':'near')?{...r,path:Array(41).fill({x:30,y:20}),incomplete:false}:r);
    if(first)w.flags.find(f=>f.id==='near').id='aaa';w.reports();
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(p.objectiveId,'east');
    assert.equal(p.diagnostic.excludedCandidates.routeLimit,1);assert.equal(moving(p).length,4);
    assert(p.diagnostic.queries<=24);assert.equal(p.diagnostic.reportedOps,p.diagnostic.queries*100);
});

test('an incomplete flag family does not discard an independently usable neutral flag',()=>{
    const w=world(),p=w.plan();assert.equal(p.objectiveId,'east');
    assert(w.searchRequests.some(r=>r.goal.id!=='east'&&r.result.incomplete===true));
});

test('all-overlong results retain a bounded centre fallback and never open a second acquisition',()=>{
    const w=world(r=>({...r,path:Array(41).fill({x:30,y:20}),incomplete:false})),p=w.plan();
    assert.equal(p.diagnostic.reason,'no-useful-objective');assert.equal(p.state.phase,'finished');
    assert.equal(p.diagnostic.excludedCandidates.routeLimit,4);assert.equal(p.diagnostic.queries,4);
    assert.equal(w.execute(p).calls.filter(c=>c.method==='moveTo').length,14);
    w.tick++;w.bind();assert.equal(w.plan().state.phase,'finished');assert.equal(w.searchRequests.length,4);
});

test('40-cell geometric lower bound permits a query; 41 excludes without searching that flag',()=>{
    for(const distance of [40,41]){
        const w=world();Object.assign(w.flags.find(f=>f.id==='east'),{x:25+distance,y:20});w.reports();
        const p=w.plan();
        assert.equal(w.searchRequests.filter(q=>q.goal.id==='east').length,distance===40?4:0);
        assert.equal(p.diagnostic.excludedCandidates.geometry,distance===40?2:3);
    }
});

test('40-cell valid paths remain usable; cost telemetry is not required by the existing route contract',()=>{
    const w=world((r,q)=>{
        if(q.goal.id!=='east')return r;
        // Explicit generated detour response, not a search or route-quality claim.
        // The first steps remain identical to the existing supported departure.
        const at=r.path.findIndex(p=>p.x===35),a=r.path[at],extra=40-r.path.length;
        const height=Math.ceil(extra/2),detour=[];
        for(let y=1;y<=height;y++)detour.push({x:a.x,y:a.y-y});
        detour.push({x:a.x+1,y:a.y-height});
        for(let y=height-1;y>=(extra%2?1:0);y--)detour.push({x:a.x+1,y:a.y-y});
        detour.push({x:a.x+2,y:a.y});
        const path=[...r.path.slice(0,at+1),...detour,...r.path.slice(at+3)];
        assert.equal(new Set(path.map(p=>`${p.x},${p.y}`)).size,40);
        return{path,ops:100,incomplete:false};
    });
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(p.evaluation.maxSteps,40);
    assert(p.state.routeControl.cache.every(r=>r.path.length===40));
});

test('the 24/4 caps and 1000 per-call boundaries include actual returned ops; zero is known, missing is not',()=>{
    for(const ops of [0,1000]){
        const w=world(r=>({...r,ops}));
        // Distinct in-range flags permit the full six-family acquisition cap.
        Object.assign(w.flags.find(f=>f.id==='far'),{x:42,y:30});
        Object.assign(w.flags.find(f=>f.id==='south'),{x:44,y:32});w.reports();
        let p=w.plan();assert.equal(p.diagnostic.queries,24);assert.equal(p.diagnostic.reportedOps,24*ops);
        for(let i=0;i<5;i++){w.next(p);p=w.plan();}
        assert.equal(p.diagnostic.queries,4);assert.equal(p.diagnostic.reportedOps,4*ops);
        assert.equal(w.searchRequests.length,28);assert(w.searchRequests.every(q=>q.options.maxOps===1000));
    }
});

test('active refresh never excludes a too-long pinned route or grants an alternate objective',()=>{
    const w=world((r,q)=>q.tick>=6?{...r,path:Array(41).fill({x:30,y:20})}:r);
    let p=w.plan();for(let i=0;i<5;i++){w.next(p);p=w.plan();}
    assert.equal(p.diagnostic.reason,'route-limit-exceeded');assert.equal(p.state.phase,'finished');
    assert.equal(p.diagnostic.queries,1);assert.equal(w.searchRequests.at(-1).goal.id,'east');
});

test('no-displacement and deadline stop before searching; return codes alone never establish progress',()=>{
    for(const rc of [0,-11,undefined]){
        const w=world();w.group().memberIds.forEach(id=>w.returns.set(id,rc));let p;
        for(let i=1;i<=5;i++){p=w.plan();w.execute(p);if(i<5)w.next(p,[]);}
        assert.equal(p.diagnostic.reason,'no-displacement');assert.equal(p.state.selection.startedAt,1);
        assert.equal(w.searchRequests.length,16);assert.equal(p.diagnostic.queries,0);
    }
    const w=world(),p=w.plan();w.next(p);w.tick=61;w.bind();
    assert.equal(w.plan().diagnostic.reason,'timeout');assert.equal(w.searchRequests.length,16);
});

test('priority and terrain failures retain original cancellation and route accounting',()=>{
    const w=world(),p=w.plan({spacing:{...w.spacing,terrainAt:()=>undefined}});
    assert.equal(p.diagnostic.reason,'opening-terrain-unavailable');assert.equal(p.diagnostic.queries,16);
    const owned=world(),r=owned.plan({unavailableIds:['bow1']});
    assert.equal(r.state.phase,'finished');assert.equal(owned.searchRequests.length,0);
    const escort=world(),extra={escort:{healerId:'medic',allyId:'bow1',mode:'hold'}},cancelled=escort.plan(extra);
    assert.equal(cancelled.diagnostic.reason,'capture-movement-priority');assert.equal(cancelled.moves,null);
    assert.equal(cancelled.diagnostic.queries,16);assert.equal(cancelled.diagnostic.reportedOps,1600);
    assert.deepEqual(escort.execute(cancelled,extra).calls,escort.execute(null,extra).calls);
});

test('API responses, supplied observations and earlier cached paths are not mutated by collection or suffix reuse',()=>{
    let response;const w=world((r,q)=>{if(q.goal.id==='east')response=r;return r;});
    const before=JSON.stringify({routes:w.routes,actors:w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y})),membership:w.membership});
    const p=w.plan(),cache=JSON.stringify(p.state.routeControl.cache);
    assert.equal(JSON.stringify({routes:w.routes,actors:w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y})),membership:w.membership}),before);
    response.path[0].x=-100;assert.equal(JSON.stringify(p.state.routeControl.cache),cache);
    w.next(p);assert.equal(w.plan().diagnostic.cacheHits,4);assert.equal(JSON.stringify(p.state.routeControl.cache),cache);
});

test('changing the injected response transport cannot reset the deadline or replenish the cache',()=>{
    const w=world(),p=w.plan();w.next(p);w.searchPath=null;
    const next=w.plan();assert.equal(next.diagnostic.reason,'retained');assert.equal(w.searchRequests.length,16);
    assert.equal(next.state.selection.startedAt,1);assert.equal(next.diagnostic.cacheHits,4);
});

test('irrelevant actor/flag input ordering does not change requests, allocation or admitted steps',()=>{
    const a=world(),b=world();b.myCreeps.reverse();b.enemies.reverse();b.flags.reverse();
    const p=a.plan(),q=b.plan();assert.equal(q.objectiveId,p.objectiveId);assert.deepEqual(q.moves,p.moves);
    assert.deepEqual(b.searchRequests,a.searchRequests);
});

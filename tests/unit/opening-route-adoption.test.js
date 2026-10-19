// Explicit generated-only boundary/size checks around the real implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {adoptionFlow,serialize} from '../fixtures/opening-adoption-flow-world.js';
import {captureOpeningRouteAdoption,adoptionDiagnosticLength,routeAdoptionStatus}
    from '../../src/strategy/opening-route-adoption.js';
import {probeOpeningRoute,resetOpeningRouteProbe,routeProbeEnvelope,openingDiagnosticLimit}
    from '../../src/debug/opening-route-probe.js';
import {openingDeploymentDiagnostic} from '../../src/strategy/opening-deployment.js';

async function prepared(t){const w=await adoptionFlow(t);w.step(1);w.step(2);return w;}

test('all branches see the same reservations: a conflicting alternative is rejected without touching live data',async t=>{
    const w=await prepared(t),a={...w.captured,spacing:{...w.captured.spacing,reserved:new Set(['26,18'])}};
    const before=serialize(a),result=captureOpeningRouteAdoption(a).finish(w.d.routeProbe);
    assert.deepEqual(result.telemetry,[5,2,2,4]);assert.equal(result.mission,a.mission);
    assert.deepEqual(result.moves,a.moves);assert.equal(serialize(a),before);
    assert.equal(result.work.queries,0);assert.equal(result.work.centreNeighbours,0);
});

test('a real prepared centre destination fences adoption without replanning centre neighbours',async t=>{
    const w=await adoptionFlow(t,{configure:world=>{
        for(const [id,x,y]of [['guardH2',23,16],['blade',24,16],['guardR0',25,17],['guardR1',24,15]])
            Object.assign(world.actor(id),{x,y});
    }});
    w.step(1);const d=w.step(2);
    assert.equal(d.routeProbe.results[1].status,'complete');
    assert.deepEqual(w.centrePlan.moves.get('guardR0'),{x:26,y:18});
    assert.equal(d.routeAdoption[0],5);assert.equal(w.comparison.mission,w.captured.mission);
    assert.deepEqual(w.comparison.moves,w.captured.moves);assert.equal(w.centreEvaluations,2);
    assert(w.centrePlan.work.neighbours<=64);assert.equal(w.comparison.work.centreNeighbours,0);
});

test('missing or thrown first-step terrain rejects the comparison, not the valid live plan',async t=>{
    const w=await prepared(t);
    for(const terrainAt of [()=>undefined,()=>{throw Error('unknown terrain');}]){
        const a={...w.captured,spacing:{...w.captured.spacing,terrainAt}},before=serialize(a);
        const result=captureOpeningRouteAdoption(a).finish(w.d.routeProbe);
        assert.deepEqual(result.telemetry,[3,2,null,null]);assert.equal(result.mission,a.mission);
        assert.deepEqual(result.moves,a.moves);assert.equal(serialize(a),before);
    }
});

test('complete but independently inadmissible comparator routes cannot establish improvement',async t=>{
    const w=await prepared(t),a=w.captured;
    for(const which of [0,1]){
        // Structurally valid API-shaped path reaches the wrong target. This is
        // direct boundary qualification, not a path the live probe accepted.
        const p=structuredClone(w.d.routeProbe);p.results[which].path=p.results[which].path.slice(0,-4);
        p.results[which].length--;
        const before=serialize(a),r=captureOpeningRouteAdoption(a).finish(p);
        assert.equal(r.telemetry[0],which===0?3:4);assert.equal(serialize(a),before);
        assert.equal(r.mission,a.mission);assert.deepEqual(r.moves,a.moves);
    }
});

test('pair identity/options/exclusion/operation bindings are checked and one captured comparison cannot be reused',async t=>{
    const w=await prepared(t);
    for(const change of [p=>p.mapTick++,p=>p.actorSlot=3,p=>p.targetSlot=6,p=>p.origin='0000',
        p=>p.goal='0000',p=>p.excluded='',p=>p.matrix='other',p=>p.range=1,p=>p.maxOps=2000,
        p=>p.reportedOps=null,p=>p.results[1].ordinal=1]){
        const p=structuredClone(w.d.routeProbe);change(p);
        const r=captureOpeningRouteAdoption(w.captured).finish(p);assert.equal(r.telemetry[0],2);
    }
    const c=captureOpeningRouteAdoption(w.captured);assert.equal(c.finish(w.d.routeProbe).telemetry[0],1);
    assert.deepEqual(c.finish(w.d.routeProbe).telemetry,[8,2,null,null]);
});

test('the qualified pair uses frozen matrices/options and complete generated paths respect all blockers',async t=>{
    const w=await prepared(t),requests=w.requests.filter(r=>r.diagnostic);
    assert.equal(requests.length,2);assert.equal(w.d.routeProbe.excluded,'2620');
    for(const r of requests){
        assert.deepEqual(r.origin,{x:25,y:19});assert.deepEqual(r.goal,{x:44,y:20});
        assert.equal(r.range,0);assert.equal(r.maxOps,1000);
        assert(r.result.path.every(p=>r.matrix.get(p.x,p.y)!==255));
    }
    for(let y=0;y<100;y++)for(let x=0;x<100;x++){
        const origin=x===25&&y===19,occupied=w.spacing.creeps.some(c=>c.hits>0&&c.x===x&&c.y===y);
        assert.equal(requests[0].matrix.get(x,y),!origin&&occupied?255:0);
        assert.equal(requests[1].matrix.get(x,y),!origin&&(occupied||x===26&&y===20)?255:0);
    }
    assert.equal(w.d.routeProbe.reportedOps,196);assert.equal(w.d.queries,0);
});

test('finite adoption tuple is at most48 chars; maximum paired evidence fits900 and worst travel stays below2700',async t=>{
    const w=await prepared(t),wide=-0.0000010000000000000002;
    let tupleMax=0;
    for(const code of Object.values(routeAdoptionStatus))for(const counts of [[null,null,null],[4,4,4]]){
        const length=JSON.stringify({routeAdoption:[code,...counts]}).length-1; // includes preceding property comma
        tupleMax=Math.max(tupleMax,length);assert(length<=48);
    }
    const raw={...w.captured.mission.diagnostic,phase:'finished',reason:'x'.repeat(64),
        startedAt:2000,unchanged:2000,queries:24,reportedOps:24000,cacheHits:4,
        utility:wide,territorialSwing:wide,ownCapacityLoss:wide,enemyCapacityRelief:wide,
        rejectedQuery:{ordinal:24,origin:{x:99,y:99},goal:{x:99,y:99},pathType:'undefined',pathIsArray:false,
            pathLength:4294967295,incompleteType:'undefined',incomplete:false,ops:Number.MAX_SAFE_INTEGER},
        excludedCandidates:{geometry:7,routeLimit:7,first:{flagId:'east',reason:'geometric-route-limit',
            lowerBound:99,queryOrdinal:24,pathLength:4294967295}},
        travel:{examined:16,bestSize:4,tied:16,actors:w.captured.mission.movement.memberIds.map(actorId=>({actorId,
            proposed:{x:99,y:99},admitted:{x:99,y:99},holdReason:'subset-hold'}))}};
    const base=openingDeploymentDiagnostic({diagnostic:raw,state:{}},w.captured.observation,w.captured.membership);
    base.memberSlots=[27,27,27,27];base.squadSlot=2;base.targetSlot=6;
    const probe={...w.d.routeProbe,mapTick:2000,actorSlot:3,targetSlot:6,excluded:'99999999',reportedOps:null,
        results:[1,2].map(ordinal=>({ordinal,status:'ops-unknown',path:'9999'.repeat(40),length:40,incomplete:false,ops:null}))};
    const extra={probeEligibility:{status:'missing',first:'configuration',later:'unknown'},routeProbe:probe,
        routeAdoption:[9,null,null,null]};
    const envelope=JSON.stringify(extra).length,total=JSON.stringify({...base,...extra}).length;
    assert(envelope<routeProbeEnvelope);assert(total<openingDiagnosticLimit);
    assert(adoptionDiagnosticLength(base)+routeProbeEnvelope<openingDiagnosticLimit);
    t.diagnostic(JSON.stringify({tupleMax,envelope,total,projection:adoptionDiagnosticLength(base)}));
});

test('headroom covers the future adopted projection before any matrix, charge or search',async t=>{
    const w=await prepared(t),diagnostic=structuredClone(w.captured.diagnostic);
    const threshold=openingDiagnosticLimit-routeProbeEnvelope;
    diagnostic.padding='x'.repeat(Math.max(0,threshold-adoptionDiagnosticLength(diagnostic)));
    while(adoptionDiagnosticLength(diagnostic)<threshold)diagnostic.padding+='x';
    assert(JSON.stringify(diagnostic).length<threshold);
    let calls=0,matrices=0;
    const args={...w.probeArgs,state:resetOpeningRouteProbe(),diagnostic,
        search:()=>{calls++;throw Error('must skip');},
        CostMatrix:class{constructor(){matrices++;}},
        prepareComparison:sample=>captureOpeningRouteAdoption({...w.captured,...sample,diagnostic})};
    const r=probeOpeningRoute(args);assert.equal(r.reason,'headroom');assert.equal(r.state.spent,false);
    assert.equal(calls,0);assert.equal(matrices,0);assert.equal(r.comparison,undefined);
});

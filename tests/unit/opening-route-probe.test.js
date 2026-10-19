// Explicit generated-only entry point. No retained evidence or cache reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {probeOpeningRoute,resetOpeningRouteProbe,routeProbeEnvelope,openingDiagnosticLimit} from '../../src/debug/opening-route-probe.js';
import {openingDeploymentDiagnostic} from '../../src/strategy/opening-deployment.js';
import {secondaryStepSupport,selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';
import {sharedRequestWorld,sharedRequestFrame} from '../fixtures/opening-shared-cell-requests.js';
import {TestCostMatrix} from '../fixtures/arena-cost-matrix.js';

const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
const point=p=>({x:p.x,y:p.y});
const bytes=value=>JSON.stringify(value,(_,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:v);
function fixture(worldOptions={}) {
    const w=sharedRequestWorld({scenario:'fresh-stall',...worldOptions});
    sharedRequestFrame(w);w.tick=2;w.bind();w.reports();
    const f=sharedRequestFrame(w);
    assert.equal(f.plan.state.phase,'active');assert.equal(f.plan.diagnostic.queries,0);
    const observation={...w,creeps:w.spacing.creeps};
    const args={state:resetOpeningRouteProbe(),observation,membership:w.membership,mission:f.plan,
        moves:f.plan.moves,centreIds:new Set([...f.plan.moves.keys()].filter(id=>!f.plan.movement.memberIds.includes(id))),
        diagnostic:openingDeploymentDiagnostic(f.plan,observation,w.membership),mapTick:1,compatible:true,
        CostMatrix:TestCostMatrix};
    const calls=[];
    args.search=(origin,goal,options)=>{
        assert.equal(args.state.spent,true,'allowance is consumed before the API call');
        calls.push({origin,goal,options});
        // Explicit GENERATED responses selected by call ordinal, not a pathfinder.
        const path=calls.length===1?row(26,44,20):[...row(26,44,19),{x:44,y:20}];
        return {path:worldOptions.mirror?path.map(p=>({x:99-p.x,y:99-p.y})):path,incomplete:false,ops:100};
    };
    return {w,f,args,calls};
}

test('paired requests differ only by frozen shared cells; all world/gameplay data remain immutable',()=>{
    const {args,calls}=fixture(),before=bytes({...args,state:null,search:null,CostMatrix:null});
    const result=probeOpeningRoute(args),p=result.diagnostic;
    assert.equal(p.results.length,2);assert(p.results.every(r=>r.status==='complete'));
    assert.equal(p.queries,2);assert.equal(p.reportedOps,200);
    assert.equal(p.excluded,'26202621');assert.equal(p.origin,'2520');assert.equal(p.goal,'4420');
    assert.equal(p.actorSlot,args.diagnostic.memberSlots.findIndex(i=>args.observation.creeps[i].id==='medic'));
    assert.deepEqual(calls[0].origin,calls[1].origin);assert.deepEqual(calls[0].goal,calls[1].goal);
    assert.deepEqual(calls[0].goal,{pos:{x:44,y:20},range:0});
    for(const c of calls){assert.deepEqual(Object.keys(c.options).sort(),['costMatrix','maxOps']);assert.equal(c.options.maxOps,1000);}
    for(let y=0;y<100;y++)for(let x=0;x<100;x++){
        const origin=x===25&&y===20,occupied=args.observation.creeps.some(c=>c.hits>0&&c.x===x&&c.y===y);
        const excluded=x===26&&(y===20||y===21);
        assert.equal(calls[0].options.costMatrix.get(x,y),!origin&&occupied?255:0);
        assert.equal(calls[1].options.costMatrix.get(x,y),!origin&&(occupied||excluded)?255:0);
    }
    assert.notEqual(calls[0].options.costMatrix,calls[1].options.costMatrix);
    assert.equal(bytes({...args,state:null,search:null,CostMatrix:null}),before);
    assert.equal(probeOpeningRoute(args).reason,'spent');assert.equal(calls.length,2);
});

test('all input/support/budget/map/preparation/headroom failures skip before matrix construction or spending',()=>{
    const cases=[
        a=>a.compatible=false,a=>a.mission={...a.mission,state:{phase:'finished'}},
        a=>a.diagnostic.queries=4,a=>a.diagnostic.cacheHits=3,a=>a.diagnostic.reportedOps=null,
        a=>a.mapTick=null,a=>a.mapTick=3,a=>a.observation.observationComplete=false,
        a=>a.observation.creeps=[...a.observation.creeps,a.observation.creeps[0]],
        a=>a.centreIds.clear(),a=>a.moves.delete('medic'),a=>a.diagnostic.memberSlots[0]=-1,
        a=>a.mission.state.routeControl.cache[0].searchedAt=-10,
        a=>a.mission.state.routeControl.cache[0].flagId='other',
        a=>a.diagnostic.memberSlots.fill(a.diagnostic.memberSlots[0]),
        a=>a.observation.myCreeps.find(c=>c.id==='medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;}),
        a=>a.diagnostic.padding='x'.repeat(1800),
    ];
    for(const change of cases){
        const {args,calls}=fixture();let matrices=0;
        args.CostMatrix=class extends TestCostMatrix{constructor(){super();matrices++;}};
        change(args);const r=probeOpeningRoute(args);
        assert.equal(r.diagnostic,null);assert.equal(r.state.spent,false);assert.equal(calls.length,0);assert.equal(matrices,0);
    }
});

test('sampling no longer depends on healer role or uniquely eligible healer',()=>{
    for(const multiple of [false,true]){
        const {args,calls}=fixture();
        const medic=args.observation.myCreeps.find(c=>c.id==='medic');
        if(multiple){const bow=args.observation.myCreeps.find(c=>c.id==='bow1');bow.body=structuredClone(medic.body);
            args.membership.members.find(m=>m.id===bow.id).role='healer';}
        else medic.body.push({type:'attack',hits:100});
        const r=probeOpeningRoute(args);assert.equal(r.reason,'observed');assert.equal(calls.length,2);
    }
});

for(const [label,make,status] of [
    ['missing',()=>undefined,'shape'],['non-array',()=>({path:{},ops:0,incomplete:false}),'shape'],
    ['overlong',()=>({path:Array(41).fill({x:26,y:20}),ops:1000,incomplete:false}),'overlong'],
    ['incomplete-type',()=>({path:[],ops:0,incomplete:'false'}),'incomplete-type'],
    ['nonfinite',()=>({path:[{x:NaN,y:20}],ops:1,incomplete:false}),'coordinates'],
    ['fraction',()=>({path:[{x:26.5,y:20}],ops:1,incomplete:false}),'coordinates'],
    ['out-of-bounds',()=>({path:[{x:100,y:20}],ops:1,incomplete:false}),'coordinates'],
    ['nonadjacent',()=>({path:[{x:28,y:20}],ops:1,incomplete:false}),'coordinates'],
    ['blocked',()=>({path:[{x:25,y:19}],ops:1,incomplete:false}),'blocked'],
    ['endpoint',()=>({path:[{x:26,y:20}],ops:1,incomplete:false}),'endpoint'],
    ['incomplete',()=>({path:[{x:26,y:20}],ops:1000,incomplete:true}),'incomplete'],
    ['unknown-ops',()=>({path:row(26,44,20),incomplete:false}),'ops-unknown'],
    ['bad-ops',()=>({path:row(26,44,20),incomplete:false,ops:1001}),'ops-unknown'],
    ['throw',()=>{throw Error('secret raw exception must not escape');},'thrown'],
]) test(`${label}: bounded summary, charged first call, no retry/second search`,()=>{
    const {args}=fixture();let calls=0;args.search=()=>{calls++;return make();};
    const r=probeOpeningRoute(args);assert.equal(r.diagnostic.results[0].status,status);
    assert.equal(r.diagnostic.queries,1);assert.equal(calls,1);assert.equal(r.state.spent,true);
    if(label.includes('ops')||label==='throw'||label==='missing')assert.equal(r.diagnostic.reportedOps,null);
    assert(!JSON.stringify(r).includes('secret'));assert(!JSON.stringify(r).includes('NaN'));
    assert(JSON.stringify({routeProbe:r.diagnostic}).length<routeProbeEnvelope);
    assert.equal(probeOpeningRoute(args).reason,'spent');assert.equal(calls,1);
});

test('second-call partial/unknown/throw preserves first result and spends exactly two queries',()=>{
    for(const result of [{path:[],incomplete:true,ops:0},{path:row(26,44,19),incomplete:true},null]){
        const {args}=fixture();let calls=0;
        args.search=()=>{if(++calls===1)return {path:row(26,44,20),incomplete:false,ops:1000};
            if(result===null)throw Error('not logged');return result;};
        const r=probeOpeningRoute(args);assert.equal(r.diagnostic.queries,2);assert.equal(calls,2);
        assert.equal(r.diagnostic.results[0].status,'complete');
        assert.equal(r.diagnostic.reportedOps,result?.ops===0?1000:null);
        assert.equal(probeOpeningRoute(args).reason,'spent');assert.equal(calls,2);
    }
});

test('matrix construction failure is charged and cannot enable a retry',()=>{
    const {args,calls}=fixture();args.CostMatrix=class{constructor(){throw Error('matrix failure');}};
    const r=probeOpeningRoute(args);assert.equal(r.diagnostic.queries,1);assert.equal(r.diagnostic.reportedOps,null);
    assert.equal(r.diagnostic.results[0].status,'thrown');assert.equal(calls.length,0);
    assert.equal(probeOpeningRoute(args).reason,'spent');
});

test('counterfactual support/subset comparison is separate and does not change prepared movement',()=>{
    const {args}=fixture(),before=bytes(args.moves),r=probeOpeningRoute(args);
    const steps=new Map(args.diagnostic.travel.actors.map(a=>
        [args.observation.creeps[args.diagnostic.memberSlots[a.slot]].id,a.proposed]));
    const encoded=r.diagnostic.results[1].path;
    steps.set('medic',{x:Number(encoded.slice(0,2)),y:Number(encoded.slice(2,4))});
    const ids=args.mission.movement.memberIds;
    const counter=selectSecondaryTravelSteps(args.observation.myCreeps,ids,steps,args.observation.creeps);
    assert(secondaryStepSupport(args.observation.myCreeps,ids,counter.moves));
    assert.equal(bytes(args.moves),before);
});

test('reserved 900-character envelope covers maximum field widths and total diagnostic stays below2700',t=>{
    const {args}=fixture();let calls=0;
    // Forty supplied adjacent cells, not an inferred route or engine movement.
    // Use independently generated valid looped paths with an exact endpoint.
    const path=[{x:26,y:19},...row(27,44,19),{x:44,y:20}];
    while(path.length<40){path.splice(1,0,{x:26,y:18},{x:26,y:19});}
    assert.equal(path.length,40);
    args.search=()=>{calls++;return{path,incomplete:false,ops:1000};};
    // The baseline may use the same non-excluded detour; equality is meaningful evidence too.
    const r=probeOpeningRoute(args),p=r.diagnostic;assert.equal(calls,2);
    assert(p.results.every(v=>v.status==='complete'));assert.equal(p.reportedOps,2000);
    const worst={...p,actorSlot:3,targetSlot:6,mapTick:2000,origin:'9999',goal:'9999',excluded:'99999999',
        results:p.results.map(r=>({...r,status:'ops-unknown',ops:null}))};
    const extra={routeProbe:worst,probeEligibility:r.eligibility};
    const envelope=JSON.stringify(extra).length;
    assert(envelope<routeProbeEnvelope);assert(JSON.stringify({...args.diagnostic,...extra}).length<openingDiagnosticLimit);
    t.diagnostic(JSON.stringify({envelope,total:JSON.stringify({...args.diagnostic,...extra}).length}));
});

test('selection is independent of IDs/input order and mirrors with unchanged geometry',()=>{
    for(const options of [{},{rename:true},{reverse:true},{mirror:true},{rename:true,reverse:true,mirror:true}]){
        const {args,calls}=fixture(options),p=probeOpeningRoute(args).diagnostic;
        assert.equal(p.queries,2,JSON.stringify({options,p}));assert.equal(p.results[0].status,'complete');assert.equal(p.results[1].status,'complete');
        const selected=args.observation.creeps[args.diagnostic.memberSlots[p.actorSlot]];
        assert(selected.body.some(b=>b.type==='heal'));assert.equal(selected.id,args.membership.members.find(m=>m.id===selected.id).id);
        assert.deepEqual(calls[0].origin,options.mirror?{x:74,y:79}:{x:25,y:20});
        assert.deepEqual(calls[0].goal.pos,options.mirror?{x:55,y:79}:{x:44,y:20});
    }
});

test('all unsupported operation telemetry remains unknown, including zero-like strings and non-finite numbers',()=>{
    for(const ops of [null,undefined,'0',-1,0.5,NaN,Infinity,1001]){
        const {args}=fixture();args.search=()=>({path:row(26,44,20),incomplete:false,ops});
        const p=probeOpeningRoute(args).diagnostic;assert.equal(p.queries,1);assert.equal(p.reportedOps,null);
        assert.equal(p.results[0].ops,null);assert.equal(p.results[0].status,'ops-unknown');
    }
});

test('headroom gate admits only below the original total limit, before doing any work',()=>{
    for(const allowed of [true,false]){
        const {args,calls}=fixture();args.diagnostic.padding='';
        const threshold=openingDiagnosticLimit-routeProbeEnvelope;
        args.diagnostic.padding='x'.repeat(threshold-JSON.stringify(args.diagnostic).length-(allowed?1:0));
        assert.equal(JSON.stringify(args.diagnostic).length,threshold-(allowed?1:0));
        const p=probeOpeningRoute(args).diagnostic;
        assert.equal(calls.length,allowed?2:0);
        if(allowed)assert(JSON.stringify({...args.diagnostic,routeProbe:p}).length<openingDiagnosticLimit);
        else assert.equal(p,null);
    }
});

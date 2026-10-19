// Explicit generated-only entry point. Retained observations are assessed separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {probeOpeningRoute as probeOpeningSlotSample,resetOpeningRouteProbe as resetSlotSample,
    routeProbeEnvelope as slotSampleEnvelope,openingDiagnosticLimit as slotSampleLimit} from '../../src/debug/opening-route-probe.js';
import {openingDeploymentDiagnostic} from '../../src/strategy/opening-deployment.js';
import {openingWorld} from '../fixtures/opening-secondary-generated-world.js';
import {occupancyWorld,centreFrame,TestCostMatrix} from '../fixtures/opening-occupancy-api-world.js';

const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
const serialize=v=>JSON.stringify(v,(_,x)=>x instanceof Map?[...x]:x instanceof Set?[...x]:x);
function fixture(){
    const make=()=>{const w=openingWorld();
        for(const [id,y]of [['medic',20],['bow1',19],['bow2',21],['guardR2',22]])Object.assign(w.actor(id),{x:25,y});
        w.membership=null;w.bind();return w;};
    const w=occupancyWorld({make,respond:(world,actor,goal)=>{
        if(goal.pos.id!=='east')return{path:[],incomplete:true,ops:0};
        const path=actor.id==='medic'?[...row(26,44,19),{x:44,y:20}]:actor.id==='guardR2'?
            [...row(26,44,21),{x:44,y:20}]:row(26,44,20);
        return {path,incomplete:false,ops:100};
    }});
    centreFrame(w);w.tick=2;w.bind();w.reports();const frame=centreFrame(w);
    assert.equal(frame.plan.state.phase,'active');assert.equal(frame.plan.diagnostic.cacheHits,4);
    const observation={...w,creeps:w.spacing.creeps};
    const args={state:resetSlotSample(),observation,membership:w.membership,mission:frame.plan,
        moves:frame.plan.moves,centreIds:new Set([...frame.plan.moves.keys()].filter(id=>!frame.plan.movement.memberIds.includes(id))),
        diagnostic:openingDeploymentDiagnostic(frame.plan,observation,w.membership),mapTick:1,compatible:true,CostMatrix:TestCostMatrix};
    const calls=[];args.search=(origin,goal,options)=>{
        assert(args.state.spent);calls.push({origin,goal,options});
        const y=calls.length===1?20:origin.y===19?18:22;
        const path=row(26,44,y);for(let last=y;last!==20;)path.push({x:44,y:last+=Math.sign(20-last)});
        return {path,incomplete:false,ops:1000};
    };
    return {w,frame,args,calls};
}
const selected=(args,p)=>args.observation.creeps[args.diagnostic.memberSlots[p.actorSlot]].id;
function renameFixedSlots(args){
    const names=new Map(args.observation.creeps.map((c,i)=>[c.id,`renamed-${String(99-i).padStart(2,'0')}`]));
    const seen=new WeakSet();
    function walk(v){
        if(typeof v==='string')return names.get(v)??v;
        if(!v||typeof v!=='object'||seen.has(v))return v;seen.add(v);
        if(v instanceof Map){const pairs=[...v].map(([k,x])=>[walk(k),walk(x)]);v.clear();for(const [k,x]of pairs)v.set(k,x);}
        else if(v instanceof Set){const values=[...v].map(walk);v.clear();for(const x of values)v.add(x);}
        else for(const key of Object.keys(v))v[key]=walk(v[key]);
        return v;
    }
    walk(args);return names;
}

test('ranged conflict samples first production member slot without changing roles or live inputs',()=>{
    const {args,calls}=fixture(),before=serialize({...args,state:null,search:null});
    const p=probeOpeningSlotSample(args).diagnostic;
    assert.equal(selected(args,p),'bow1');assert.equal(args.membership.squads.find(s=>s.id===args.mission.state.squad.id).memberIds.indexOf('bow1'),1);
    assert.equal(args.membership.members.find(m=>m.id==='bow1').role,'ranged');
    assert.equal(p.queries,2);assert.equal(p.reportedOps,2000);assert(p.results.every(r=>r.status==='complete'));
    assert.equal(serialize({...args,state:null,search:null}),before);assert.equal(calls.length,2);
    assert.equal(probeOpeningSlotSample(args).reason,'spent');assert.equal(calls.length,2);
});

test('matrix pair freezes shared cells, preserves origin/blockers/options and original four-query cap',()=>{
    const {args,calls}=fixture(),p=probeOpeningSlotSample(args).diagnostic;
    assert.equal(p.excluded,'2620');assert.equal(p.origin,'2519');assert.equal(p.goal,'4420');
    assert.equal(calls.length,2);assert(p.queries+args.diagnostic.queries<=4);
    assert.deepEqual(calls[0].origin,calls[1].origin);assert.deepEqual(calls[0].goal,calls[1].goal);
    for(const c of calls){assert.equal(c.goal.range,0);assert.equal(c.options.maxOps,1000);assert.deepEqual(Object.keys(c.options).sort(),['costMatrix','maxOps']);}
    for(let y=0;y<100;y++)for(let x=0;x<100;x++){
        const origin=x===25&&y===19,occupied=args.observation.creeps.some(c=>c.hits>0&&c.x===x&&c.y===y);
        assert.equal(calls[0].options.costMatrix.get(x,y),!origin&&occupied?255:0);
        assert.equal(calls[1].options.costMatrix.get(x,y),!origin&&(occupied||x===26&&y===20)?255:0);
    }
});

test('renaming with fixed birth slots and irrelevant input ordering retains sampled identity',()=>{
    for(const renamed of [false,true]){
        const {args}=fixture(),names=renamed?renameFixedSlots(args):null;
        args.diagnostic.travel.actors.reverse();args.mission.movement.memberIds.reverse();args.membership.members.reverse();
        const p=probeOpeningSlotSample(args).diagnostic;
        assert.equal(selected(args,p),names?.get('bow1')??'bow1');
    }
});

test('changing the original production slot allocation changes the sample: order bias is retained',()=>{
    const {args}=fixture();
    const ids=args.membership.squads.find(s=>s.id===args.mission.state.squad.id).memberIds;
    const a=ids.indexOf('bow1'),b=ids.indexOf('bow2');[ids[a],ids[b]]=[ids[b],ids[a]];
    const before=[...args.observation.myCreeps].map(c=>c.id),p=probeOpeningSlotSample(args).diagnostic;
    assert.equal(selected(args,p),'bow2');assert.deepEqual(args.observation.myCreeps.map(c=>c.id),before);
});

const skipped=[
    ['budget',a=>a.diagnostic.queries=4],['cache-hits',a=>a.diagnostic.cacheHits=3],
    ['unknown-ops',a=>a.diagnostic.reportedOps=null],['incompatible',a=>a.compatible=false],
    ['inactive',a=>a.mission={...a.mission,state:{phase:'finished'}}],['map',a=>a.mapTick=null],
    ['incomplete',a=>a.observation.observationComplete=false],['ownership',a=>a.moves.delete('bow1')],
    ['missing-slots',a=>a.membership.squads.find(s=>s.id===a.mission.state.squad.id).memberIds=[]],
    ['duplicate-slots',a=>a.membership.squads.find(s=>s.id===a.mission.state.squad.id).memberIds.fill('bow1')],
    ['lost-support',a=>a.observation.myCreeps.find(c=>c.id==='medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
    ['stale-cache',a=>a.mission.state.routeControl.cache[0].searchedAt=-10],
    ['no-cache',a=>delete a.mission.state.routeControl],['headroom',a=>a.diagnostic.padding='x'.repeat(1800)],
];
for(const [label,change]of skipped)test(`${label} skips before construction/search/spending`,()=>{
    const {args,calls}=fixture();let matrices=0;
    args.CostMatrix=class extends TestCostMatrix{constructor(){super();matrices++;}};
    change(args);const r=probeOpeningSlotSample(args);
    assert.equal(r.diagnostic,null);assert.equal(r.state.spent,false);assert.equal(calls.length,0);assert.equal(matrices,0);
});

test('first-stop telemetry distinguishes unavailable evidence from failed gates; later gates stay unknown',()=>{
    const cases=[
        ['configuration','missing',a=>delete a.compatible],['configuration','failed',a=>a.compatible=false],
        ['mission','missing',a=>delete a.mission],['mission','failed',a=>a.mission.state.phase='finished'],
        ['tick','missing',a=>delete a.observation.tick],['tick','failed',a=>a.observation.tick=Infinity],
        ['map','missing',a=>a.mapTick=null],['map','failed',a=>a.mapTick=3],
        ['work','missing',a=>a.diagnostic.reportedOps=null],['work','failed',a=>a.diagnostic.queries=4],
        ['cache','missing',a=>delete a.diagnostic.cacheHits],['cache','failed',a=>a.diagnostic.cacheHits=3],
        ['api','missing',a=>delete a.CostMatrix],['inputs','missing',a=>a.observation.observationComplete=false],
        ['inputs','missing',a=>delete a.observation.creeps[0].body],
        ['inputs','failed',a=>a.observation.creeps[0].x=NaN],
        ['membership','missing',a=>delete a.membership],
        ['preparation','missing',a=>delete a.mission.state.routeControl],
        ['preparation','failed',a=>a.moves.delete('bow1')],
        ['support','failed',a=>a.observation.myCreeps.find(c=>c.id==='medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
        ['binding','missing',a=>delete a.mission.state.routeControl.cache[0].searchedAt],
        ['binding','failed',a=>a.mission.state.routeControl.cache[0].searchedAt=-10],
        ['headroom','failed',a=>a.diagnostic.padding='x'.repeat(1800)],
        ['spent','spent',a=>a.state.spent=true],
    ];
    for(const [first,status,change]of cases){
        const {args,calls}=fixture();change(args);const before=serialize(args),r=probeOpeningSlotSample(args);
        assert.deepEqual(r.eligibility,{status,first,later:'unknown'});
        assert.equal(serialize(args),before);assert.equal(calls.length,0);assert.equal(r.diagnostic,null);
        assert(JSON.stringify({probeEligibility:r.eligibility}).length<100);
    }
    const {args}=fixture();args.mapTick=null;args.diagnostic.queries=4;delete args.mission.state.routeControl;
    assert.deepEqual(probeOpeningSlotSample(args).eligibility,{status:'missing',first:'map',later:'unknown'});
});

test('eligibility is not API success; charged failures retain an eligible status and unknown operations',()=>{
    const {args}=fixture();args.search=()=>{throw Error('never emitted');};
    const r=probeOpeningSlotSample(args);
    assert.deepEqual(r.eligibility,{status:'eligible',first:null,later:null});
    assert.equal(r.diagnostic.results[0].status,'thrown');assert.equal(r.diagnostic.reportedOps,null);
    assert.equal(r.diagnostic.queries,1);assert.equal(args.state.spent,true);
    assert.deepEqual(probeOpeningSlotSample(args).eligibility,{status:'spent',first:'spent',later:'unknown'});
});

test('all projected opening fields plus widest telemetry fit existing total bound, without truncation',t=>{
    const {args}=fixture(),number=-0.0000010000000000000002;
    // Conservative static projection envelope: includes mutually exclusive fields.
    // Source contracts: controlled reason <=64 chars, slots <=27, coordinates0..99,
    // four actors, <=7 flags, JS array length <=2^32-1 and safe ops <=2^53-1.
    const d={phase:'finished',reason:'x'.repeat(64),squadId:args.mission.state.squad.id,
        targetId:args.mission.objectiveId,memberIds:args.mission.movement.memberIds,
        startedAt:2000,unchanged:2000,queries:24,reportedOps:24000,cacheHits:4,
        utility:number,territorialSwing:number,ownCapacityLoss:number,enemyCapacityRelief:number,
        rejectedQuery:{ordinal:24,origin:{x:99,y:99},goal:{x:99,y:99},pathType:'undefined',pathIsArray:false,
            pathLength:4294967295,incompleteType:'undefined',incomplete:false,ops:Number.MAX_SAFE_INTEGER},
        excludedCandidates:{geometry:7,routeLimit:7,first:{flagId:args.mission.objectiveId,
            reason:'geometric-route-limit',lowerBound:99,queryOrdinal:24,pathLength:4294967295}},
        travel:{examined:16,bestSize:4,tied:16,actors:args.mission.movement.memberIds.map(actorId=>({actorId,
            proposed:{x:99,y:99},admitted:{x:99,y:99},holdReason:'subset-hold'}))}};
    const base=openingDeploymentDiagnostic({diagnostic:d,state:{}},args.observation,args.membership);
    base.memberSlots=[27,27,27,27];base.squadSlot=2;base.targetSlot=6;
    const baseLength=JSON.stringify(base).length;
    assert(baseLength+slotSampleEnvelope<slotSampleLimit);
    const probe=probeOpeningSlotSample(args).diagnostic;
    const maxProbe={...probe,mapTick:2000,actorSlot:3,targetSlot:6,excluded:'99999999',reportedOps:null,
        results:[1,2].map(ordinal=>({ordinal,status:'ops-unknown',path:'9999'.repeat(40),length:40,incomplete:false,ops:null}))};
    const eligibility={status:'missing',first:'configuration',later:'unknown'};
    const extra={probeEligibility:eligibility,routeProbe:maxProbe};
    const envelope=JSON.stringify(extra).length,total=JSON.stringify({...base,...extra}).length;
    assert(envelope<slotSampleEnvelope);assert(total<slotSampleLimit);
    assert.equal(JSON.parse(JSON.stringify(extra)).routeProbe.results[1].path.length,160);
    t.diagnostic(JSON.stringify({baseLength,envelope,total}));
});

test('no conflict and currently occupied conflict both retain no-probe behavior',()=>{
    for(const occupied of [false,true]){
        const {args,calls}=fixture();
        if(occupied){const enemy=args.observation.enemies[0];Object.assign(enemy,{x:26,y:20});}
        else{
            const slot=args.diagnostic.memberSlots.findIndex(i=>args.observation.creeps[i].id==='bow2');
            args.diagnostic.travel.actors.find(a=>a.slot===slot).proposed={x:26,y:22};
            args.mission.state.routeControl.cache.find(r=>r.actorId==='bow2').path[0]={x:26,y:22};
        }
        assert.equal(probeOpeningSlotSample(args).reason,'no-conflict');assert.equal(calls.length,0);
    }
});

for(const [label,response] of [['throw',()=>{throw Error('not emitted');}],['unknown',()=>undefined],
    ['incomplete',()=>({path:[],incomplete:true,ops:500})]])test(`${label} consumes allowance before failure, without a retry`,()=>{
    const {args}=fixture();let calls=0;args.search=()=>{assert(args.state.spent);calls++;return response();};
    const p=probeOpeningSlotSample(args).diagnostic;assert.equal(p.queries,1);assert.equal(calls,1);
    assert.equal(probeOpeningSlotSample(args).reason,'spent');assert.equal(calls,1);
    if(label!=='incomplete')assert.equal(p.reportedOps,null);
});

test('sampling cannot reorder execution or change current movement/healing/attack traces',()=>{
    const {w,frame,args}=fixture();w.execute(frame.plan);const before=serialize(w.calls);
    const p=probeOpeningSlotSample(args).diagnostic;assert(p);w.execute(frame.plan);
    assert.equal(serialize(w.calls),before);
    for(const c of w.myCreeps)assert(w.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
});

test('real escort-priority or injury cancellation prevents sampling and preserves available healing actions',()=>{
    for(const injury of [false,true]){
        const {w,args,calls}=fixture();w.tick=3;w.bind();w.reports();
        if(injury)w.actor('bow1').hits-=20;
        const extra=injury?{}:{escort:{healerId:'medic',allyId:'bow1',distance:1}};
        const cancelled=centreFrame(w,extra);
        assert.equal(cancelled.plan.state.phase,'finished');
        const r=probeOpeningSlotSample({...args,mission:cancelled.plan,moves:cancelled.plan.moves});
        assert.equal(r.diagnostic,null);assert.equal(calls.length,0);
        w.execute(cancelled.plan,extra);const before=serialize(w.calls);
        if(injury)assert(w.calls.some(a=>['heal','rangedHeal'].includes(a.method)));
        probeOpeningSlotSample({...args,mission:cancelled.plan,moves:cancelled.plan.moves});
        w.execute(cancelled.plan,extra);assert.equal(serialize(w.calls),before);
    }
});

test('a failed alternative retains the complete first response and cannot replan or retry',()=>{
    const {args}=fixture();let calls=0;
    args.search=()=>++calls===1?{path:row(26,44,20),incomplete:false,ops:1000}:{path:[],incomplete:true,ops:500};
    const p=probeOpeningSlotSample(args).diagnostic;
    assert.equal(p.queries,2);assert.equal(p.reportedOps,1500);assert.equal(p.results[0].status,'complete');
    assert.equal(p.results[1].status,'incomplete');assert.equal(probeOpeningSlotSample(args).reason,'spent');assert.equal(calls,2);
});

test('a budget skip may qualify later, but a spent sample never repeats on later observations',()=>{
    const {args,calls}=fixture();args.diagnostic.queries=4;
    assert.equal(probeOpeningSlotSample(args).diagnostic,null);assert.equal(args.state.spent,false);
    args.diagnostic.queries=0;assert.equal(probeOpeningSlotSample(args).diagnostic.queries,2);
    args.observation.tick=3;args.membership.lastTick=3;
    assert.equal(probeOpeningSlotSample(args).reason,'spent');assert.equal(calls.length,2);
});

test('same 900-character reservation/2700 total limit covers two40-cell results and headroom rejection',t=>{
    const {args}=fixture();
    const path=[...row(26,44,18),{x:44,y:19},{x:44,y:20}];
    // 21+18+1=40 cells: one generated detour on each side, not route availability.
    path.splice(0,0,{x:25,y:18});
    while(path.length<40)path.splice(1,0,{x:24,y:18},{x:25,y:18});
    assert.equal(path.length,40);args.search=()=>({path,incomplete:false,ops:1000});
    const result=probeOpeningSlotSample(args),p=result.diagnostic;assert.equal(p.results.length,2);assert(p.results.every(r=>r.path.length===160));
    const worst={...p,mapTick:2000,excluded:'99999999',results:p.results.map(r=>({...r,status:'ops-unknown',ops:null}))};
    const extra={routeProbe:worst,probeEligibility:result.eligibility};
    const envelope=JSON.stringify(extra).length,total=JSON.stringify({...args.diagnostic,...extra}).length;
    assert(envelope<slotSampleEnvelope);assert(total<slotSampleLimit);t.diagnostic(JSON.stringify({envelope,total}));
});

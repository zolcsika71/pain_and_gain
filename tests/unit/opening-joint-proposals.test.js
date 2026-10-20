// EXPLICIT GENERATED-ONLY ENTRY POINT. No historical readers/payloads.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {jointFlow,moveCalls,tacticalCalls} from '../fixtures/opening-joint-proposal-flow-world.js';
import {secondaryStepSupport,selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';
import {proposeOpeningJoint,pairSupportTable} from '../fixtures/opening-joint-proposals.js';

const departing=w=>moveCalls(w).filter(c=>w.livePlan.state.squad.memberIds.includes(c.id));
const point=p=>({x:p.x,y:p.y}),cell=p=>`${p.x},${p.y}`;
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const traces={};
after(()=>{if(process.env.PAIN_GAIN_JOINT_OUTPUT)fs.writeFileSync(path.join(process.env.PAIN_GAIN_JOINT_OUTPUT,
    'generated-trajectories.json'),JSON.stringify(traces,null,2)+'\n');});
const record=w=>({tick:w.tick,observation:structuredClone(w.game),membership:structuredClone(w.membership),
    commands:structuredClone(w.calls),actions:structuredClone(w.logs.filter(r=>r.type!=='game-state')),
    state:structuredClone(w.livePlan.state),joint:w.joint?{reason:w.joint.reason,work:w.joint.work}:null});
function input(w){
    const ctx=w.jointContext,creeps=ctx.observation.creeps.map(c=>({...c,body:c.body.map(p=>({...p}))}));
    const observation={...ctx.observation,creeps,myCreeps:creeps.filter(c=>c.my),enemies:creeps.filter(c=>!c.my),
        flags:ctx.observation.flags.map(f=>({...f}))};
    const steps=new Map([...w.livePlan.movement.steps].map(([id,p])=>[id,point(p)]));
    const mission={...ctx.mission,state:structuredClone(ctx.mission.state),movement:{...ctx.mission.movement,steps}};
    return {observation,mission,steps,spacing:{creeps,terrainAt:()=>0}};
}
async function fixture(t){const w=await jointFlow(t);w.step(1);return {w,args:input(w)};}
function bounds(r){
    assert(r.work.neighbours<=32);assert(r.work.candidateCounts.every(n=>n<=3));
    assert(r.work.assignments<=81);assert(r.work.pairProofs<=27);assert(r.work.admission<=1);assert.equal(r.work.queries,0);
}
function support(w){
    for(const squad of w.membership.squads){
        const ids=squad.memberIds,moves=new Map(moveCalls(w).map(c=>[c.id,c]));
        assert(secondaryStepSupport(w.myCreeps,ids,moves));
        for(let mask=0;mask<16;mask++){
            const observed=ids.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?moves.get(id):null)}));
            assert(secondaryStepSupport(observed,ids,new Map()));
        }
    }
}

test('real production seam: converging baseline versus unique full joint proposal',async t=>{
    const snapshots=[];
    for(const enabled of [false,true]){
        const w=await jointFlow(t,{enabled});const d=w.step(1);
        t.diagnostic(JSON.stringify({enabled,phase:d.phase,reason:d.reason,joint:w.joint?.reason,
            work:w.joint?.work,
            moves:departing(w)}));
        assert.equal(d.phase,'active');
        snapshots.push({moves:departing(w),tactics:tacticalCalls(w)});
        if(enabled){assert.equal(departing(w).length,4);assert.equal(w.joint.reason,'joint-proposal');support(w);bounds(w.joint);
            const target=w.flags.find(f=>f.id==='east');
            const weapons=departing(w).filter(c=>c.id!=='medic');
            assert(weapons.every(c=>range(c,target)<=range(w.actor(c.id),target)));
            assert(weapons.some(c=>range(c,target)<range(w.actor(c.id),target)));
            assert.equal(new Set(departing(w).map(cell)).size,4);
        }
        else assert.equal(departing(w).length,2);
    }
    assert.deepEqual(snapshots[0].tactics,snapshots[1].tactics);
});

test('continuous generated real-tick capture chain',async t=>{
    const w=await jointFlow(t);const rows=[];
    const birth=new Map(w.myCreeps.map(c=>[c.id,point(c)]));
    let capturedAt=null,centreCalls=0;
    for(let tick=1;tick<=61;tick++){
        const d=w.step(tick);rows.push(record(w));
        assert.equal(d.startedAt,1);assert.equal(w.livePlan.state.selection.startedAt+60,61);
        assert(d.queries<=(tick===1?24:4));assert(d.reportedOps<=d.queries*1000);
        assert((d.travel?.examined??0)<=16);
        if(w.joint)bounds(w.joint);
        if(d.phase==='finished'){assert.equal(tick,capturedAt);break;}
        centreCalls+=moveCalls(w).filter(c=>!w.livePlan.state.squad.memberIds.includes(c.id)).length;
        assert.equal(w.centreEvaluations,tick,'centre preparation once, after departing destinations');
        for(const r of w.requests.filter(r=>r.tick===tick)){
            assert.equal(r.matrix.get(r.origin.x,r.origin.y),0);
            for(const c of w.spacing.creeps)if(c.id!==r.actorId&&c.hits>0)assert.equal(r.matrix.get(c.x,c.y),255);
            assert(r.result.path.every(p=>r.matrix.get(p.x,p.y)!==255));
        }
        support(w);
        const weapons=w.livePlan.state.squad.memberIds.filter(id=>id!=='medic'),target=w.flags.find(f=>f.id==='east');
        const before=new Map(weapons.map(id=>[id,range(w.actor(id),target)]));
        w.observe();
        assert(weapons.every(id=>range(w.actor(id),target)<=before.get(id)));
        assert(weapons.some(id=>range(w.actor(id),target)<before.get(id)));
        if(w.livePlan.state.squad.memberIds.some(id=>range(w.actor(id),target)===0)){
            // Separate SUPPLIED ownership confirmation after observed arrival.
            w.flags.find(f=>f.id==='east').my=true;capturedAt=tick+1;
        }
    }
    assert.equal(w.d.reason,'captured');assert.equal(capturedAt,19);assert(centreCalls>80);
    assert.deepEqual(w.d.jointProposal,[0,null],'capture releases proposal status on the same tick');
    for(const c of w.myCreeps.filter(c=>c.body.some(p=>['attack','ranged_attack'].includes(p.type))))
        if(!w.livePlan.state.squad.memberIds.includes(c.id))assert(range(c,w.centre)<range(birth.get(c.id),w.centre));
    assert.equal(rows[1].observation.secondaryObjective.queries,4,'off-cache local steps cost an ordinary capped refresh');
    assert.equal(rows[2].observation.secondaryObjective.queries,0,'normal suffix reuse');
    assert.equal(rows[6].observation.secondaryObjective.queries,4,'search age five expires normally');
    const searches=w.requests.length,centreEvaluations=w.centreEvaluations;
    for(let n=1;n<=5;n++){
        assert.equal(w.step(capturedAt+n).phase,'finished');rows.push(record(w));
        assert.equal(w.d.reason,'captured');assert.equal(w.joint,null);
        assert.deepEqual(w.d.jointProposal,[0,null]);
        assert(!w.logs.some(r=>r.type==='action-decision'&&/^(capture-route|opening-centre)-/.test(r.reason)));
    }
    assert.equal(w.requests.length,searches);assert.equal(w.centreEvaluations,centreEvaluations);
    traces.capture=rows;t.diagnostic(JSON.stringify({capture:capturedAt,releaseThrough:w.tick,centreCalls,
        searchTicks:rows.filter(r=>r.observation.secondaryObjective.queries).map(r=>[r.tick,r.observation.secondaryObjective.queries])}));
});

test('optimized pair table equals production whole-group proof AND every independent move/stay outcome',async t=>{
    const {args}=await fixture(t);const r=proposeOpeningJoint(args);assert.equal(r.reason,'joint-proposal');
    const ids=args.mission.movement.memberIds,{proof,choices}=r;
    let checked=0;
    function visit(indices){
        if(indices.length<4){for(let i=0;i<choices.get(ids[indices.length]).length;i++)visit([...indices,i]);return;}
        const steps=new Map(ids.map((id,i)=>[id,choices.get(id)[indices[i]].step]));
        const hi=indices[ids.indexOf(proof.healer)];
        const optimized=proof.weapons.every(id=>proof.table.get(id)[hi][indices[ids.indexOf(id)]]);
        assert.equal(optimized,secondaryStepSupport(args.observation.myCreeps,ids,steps));
        let every=true;
        for(let mask=0;mask<16;mask++){
            const outcome=ids.map((id,i)=>({...args.observation.myCreeps.find(c=>c.id===id),...(mask&(1<<i)?steps.get(id):null)}));
            every=secondaryStepSupport(outcome,ids,new Map())&&every;checked++;
        }
        assert.equal(optimized,every);
    }
    visit([]);assert.equal(checked,16*r.work.assignments);bounds(r);
});

test('maximum 27 pair proofs include unsafe corners: exhaustive agreement for 81 assignments ×16 outcomes',async t=>{
    const {args}=await fixture(t),ids=args.mission.movement.memberIds;
    const group=ids.map(id=>args.observation.myCreeps.find(c=>c.id===id)),positions=[[20,20],[19,17],[20,17],[21,17]];
    group.forEach((c,i)=>[c.x,c.y]=positions[i]);
    const alternatives=[[[19,20],[20,21],[21,20]],[[18,18],[18,17],[18,16]],
        [[20,18],[20,16],[20,19]],[[22,18],[22,17],[22,16]]];
    const choices=new Map(ids.map((id,i)=>[id,alternatives[i].map(([x,y])=>({step:{x,y}}))]));
    const work={pairProofs:0},proof=pairSupportTable(group,ids,choices,work);assert.equal(work.pairProofs,27);
    let yes=0,no=0;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++)for(let d=0;d<3;d++){
        const ix=[a,b,c,d],steps=new Map(ids.map((id,i)=>[id,choices.get(id)[ix[i]].step]));
        const hi=ix[ids.indexOf(proof.healer)];
        const checked=proof.weapons.every(id=>proof.table.get(id)[hi][ix[ids.indexOf(id)]]);
        assert.equal(checked,secondaryStepSupport(group,ids,steps));
        let all=true;
        for(let mask=0;mask<16;mask++){
            const observed=group.map((c,i)=>({...c,...(mask&(1<<i)?steps.get(c.id):null)}));
            all=secondaryStepSupport(observed,ids,new Map())&&all;
        }
        assert.equal(checked,all);if(checked)yes++;else no++;
    }
    assert(yes>0&&no>0);assert.equal(yes+no,81);
});

test('proposal certificates never mutate observations, selection, caches, ages or original steps',async t=>{
    const {args}=await fixture(t);const before=JSON.stringify(args),beforeSteps=JSON.stringify([...args.steps]),r=proposeOpeningJoint(args);
    assert.equal(r.reason,'joint-proposal');assert.equal(JSON.stringify(args),before);
    assert.equal(JSON.stringify([...args.steps]),beforeSteps);
    for(const cert of r.certificates){
        const old=args.mission.state.routeControl.cache.find(c=>c.actorId===cert.actorId);
        assert.equal(cert.searchedAt,old.searchedAt);assert.equal(cert.ops,old.ops);
        assert.equal(cert.path.length,old.path.length);assert.deepEqual(cert.path.slice(1),old.path.slice(1));
        assert.deepEqual(cert.path.at(-1),old.path.at(-1));
        assert.equal(new Set([cell(cert.from),...cert.path.map(cell)]).size,cert.path.length+1);
    }
    const w=await jointFlow(t);w.step(1);const old=structuredClone(w.livePlan.state.routeControl.cache);w.observe();w.step(2);
    assert.equal(w.d.queries,4);assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===2));
    assert(old.every(r=>r.searchedAt===1));assert.equal(w.livePlan.state.selection.startedAt,1);
});

test('working non-converging travel bypasses all neighbour, proof and private-admission work',async t=>{
    const w=await jointFlow(t);w.step(1);w.observe();w.step(2);
    assert.equal(w.joint,null,'production bypasses the helper completely');
    assert.deepEqual(w.d.jointProposal,[1,0]);
    const a=w.prepareInput,r=proposeOpeningJoint({mission:a[0],observation:a[8].observation,steps:a[0].movement.steps,spacing:a[7]});
    assert.equal(r.reason,'no-convergence');assert.deepEqual(r.work,
        {neighbours:0,candidateCounts:[],assignments:0,pairProofs:0,admission:0,queries:0});
    assert.equal(r.steps,a[0].movement.steps);
});

for(const [label,patch]of [
    ['origin',a=>a.mission.state.routeControl.cache[0].from.x++],
    ['age five',a=>a.mission.state.routeControl.cache[0].searchedAt=-4],
    ['unknown ops',a=>delete a.mission.state.routeControl.cache[0].ops],
    ['too many ops',a=>a.mission.state.routeControl.cache[0].ops=1001],
    ['incomplete',a=>a.mission.state.routeControl.cache[0].incomplete=true],
    ['repeated prefix',a=>{const r=a.mission.state.routeControl.cache[0];r.path.splice(1,0,point(r.from),point(r.path[0]));}],
    ['nonadjacent reconnect',a=>a.mission.state.routeControl.cache[0].path[1].x+=2],
    ['endpoint',a=>a.mission.state.routeControl.cache[0].path.pop()],
    ['overlong',a=>{const r=a.mission.state.routeControl.cache[0];r.path=Array(41).fill(r.path[0]);}],
    ['missing report',a=>a.mission.state.routeControl.cache[0]=null],
])test(`invalid ${label} certificate retains baseline`,async t=>{
    const {args}=await fixture(t);patch(args);const r=proposeOpeningJoint(args);
    assert.equal(r.reason,'invalid-proof');assert.equal(r.steps,args.steps);assert.equal(r.work.admission,0);bounds(r);
});

for(const [label,patch,reason]of [
    ['incomplete observation',a=>a.observation.observationComplete=false,'inputs'],
    ['missing occupancy',a=>a.spacing.creeps=a.spacing.creeps.slice(1),'inputs'],
    ['duplicate occupancy',a=>Object.assign(a.observation.creeps[0],point(a.observation.creeps[1])),'inputs'],
    ['unknown terrain',a=>a.spacing.terrainAt=()=>undefined,'no-full-assignment'],
    ['throwing terrain',a=>a.spacing.terrainAt=()=>{throw Error('not retained');},'no-full-assignment'],
    ['reserved required cell',a=>a.spacing.reserved=new Set(['26,21']),'no-full-assignment'],
    ['occupied required cell',a=>Object.assign(a.observation.myCreeps.find(c=>c.id==='scout1'),{x:26,y:21}),'no-full-assignment'],
    ['blocked required cell',a=>a.spacing.terrainAt=p=>cell(p)==='26,21'?1:0,'no-full-assignment'],
    ['functioning threat',a=>Object.assign(a.observation.enemies.find(c=>c.body.some(p=>p.type==='attack')),{x:29,y:20}),'no-full-assignment'],
    ['probe authority',a=>a.probe=true,'incompatible-authority'],
    ['adoption authority',a=>a.adoption=true,'incompatible-authority'],
])test(`${label}: missing proof or adverse input never becomes an unchecked step`,async t=>{
    const {args}=await fixture(t);patch(args);const r=proposeOpeningJoint(args);
    assert.equal(r.reason,reason);assert.equal(r.steps,args.steps);bounds(r);
});

test('equal joint optima preserve proposals and the original intersection selector',async t=>{
    const {args}=await fixture(t);
    const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
    const fixtures={medic:{from:{x:24,y:20},path:[{x:25,y:21},{x:26,y:22},...row(27,43,22),{x:44,y:21},{x:44,y:20}]},
        bow1:{from:{x:25,y:19},path:row(26,44,20)},bow2:{from:{x:25,y:20},path:row(26,44,20)},
        guardR2:{from:{x:26,y:21},path:[{x:27,y:22},{x:28,y:23},{x:29,y:22},...row(30,43,22),{x:44,y:21},{x:44,y:20}]}};
    for(const [id,f]of Object.entries(fixtures)){
        Object.assign(args.observation.myCreeps.find(c=>c.id===id),f.from);
        Object.assign(args.mission.state.routeControl.cache.find(r=>r.actorId===id),f);
        args.steps.set(id,f.path[0]);
    }
    const result=proposeOpeningJoint(args);assert.equal(result.reason,'equal-optima');assert(result.ties>1);
    assert.equal(result.steps,args.steps);assert.equal(result.work.admission,0);bounds(result);
    assert.deepEqual(selectSecondaryTravelSteps(args.observation.myCreeps,args.mission.movement.memberIds,result.steps,args.observation.creeps),
        selectSecondaryTravelSteps(args.observation.myCreeps,args.mission.movement.memberIds,args.steps,args.observation.creeps));
});

test('geometrically complete proposals with no full support-safe assignment retain unchanged subset admission',async t=>{
    const {args}=await fixture(t),actor=args.observation.myCreeps.find(c=>c.id==='guardR2');
    Object.assign(actor,{x:26,y:23});
    const r=args.mission.state.routeControl.cache.find(r=>r.actorId===actor.id);
    const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
    Object.assign(r,{from:point(actor),path:[{x:27,y:22},{x:28,y:23},{x:29,y:22},...row(30,43,22),{x:44,y:21},{x:44,y:20}]});
    args.steps.set(actor.id,r.path[0]);
    assert(secondaryStepSupport(args.observation.myCreeps,args.mission.movement.memberIds,new Map()));
    const result=proposeOpeningJoint(args);assert.equal(result.reason,'no-full-assignment');
    assert.equal(result.steps,args.steps);assert.equal(result.work.admission,0);assert(result.proof);
    assert(result.proof.table.get(actor.id).flat().every(p=>!p));
    const selected=selectSecondaryTravelSteps(args.observation.myCreeps,args.mission.movement.memberIds,result.steps,args.observation.creeps);
    assert(secondaryStepSupport(args.observation.myCreeps,args.mission.movement.memberIds,selected.moves));
});

test('unknown terrain at the necessary alternative never becomes a certified move',async t=>{
    const {args}=await fixture(t);args.spacing.terrainAt=p=>cell(p)==='27,21'?undefined:0;
    const r=proposeOpeningJoint(args);assert.equal(r.reason,'no-full-assignment');assert.equal(r.steps,args.steps);
    assert([...r.steps.values()].every(p=>cell(p)!=='27,21'));bounds(r);
});

test('one-cell final approaches offer only the ordinary destination; no fabricated side step',async t=>{
    const {args}=await fixture(t),ids=args.mission.movement.memberIds,target=args.observation.flags.find(f=>f.id==='east');
    const positions=[[43,19],[43,20],[43,21],[44,21]];
    ids.forEach((id,i)=>{
        const actor=args.observation.myCreeps.find(c=>c.id===id);[actor.x,actor.y]=positions[i];
        const r=args.mission.state.routeControl.cache.find(r=>r.actorId===id);r.from=point(actor);r.path=[point(target)];
        args.steps.set(id,point(target));
    });
    const r=proposeOpeningJoint(args);assert.equal(r.reason,'no-full-assignment');
    assert.deepEqual(r.work.candidateCounts,[1,1,1,1]);assert.equal(r.steps,args.steps);bounds(r);
});

test('one private admission rejection leaves already-updated lifecycle and proposals intact',async t=>{
    const {args}=await fixture(t);args.observation.flags.find(f=>f.id==='east').my=false;
    const before=JSON.stringify(args.mission.state),r=proposeOpeningJoint(args);
    assert.equal(r.reason,'admission-rejected');assert.equal(r.work.admission,1);assert.equal(r.steps,args.steps);
    assert.equal(JSON.stringify(args.mission.state),before);
});

test('renaming, input order and mirrored route geometry preserve unique joint decisions',async t=>{
    const decisions=[];
    for(const options of [{},{rename:true},{reverse:true},{mirror:true},{mirror:'y'},{mirror:'both'},
        {rename:true,reverse:true,mirror:true}]){
        const w=await jointFlow(t,options);w.step(1);
        t.diagnostic(JSON.stringify({options,phase:w.d.phase,reason:w.d.reason,joint:w.joint?.reason}));
        assert.equal(w.joint?.reason,'joint-proposal');support(w);
        decisions.push(departing(w).map(c=>({id:c.id.replace(/^renamed-/,''),
            x:options.mirror&&options.mirror!=='y'?99-c.x:c.x,
            y:options.mirror==='y'||options.mirror==='both'?99-c.y:c.y}))
            .sort((a,b)=>a.id.localeCompare(b.id)));
    }
    decisions.slice(1).forEach(d=>assert.deepEqual(d,decisions[0]));
    const {args}=await fixture(t),r=proposeOpeningJoint(args);
    args.observation.flags.reverse();args.observation.creeps.reverse();args.observation.myCreeps.reverse();args.observation.enemies.reverse();
    args.mission.state.routeControl.cache.reverse();args.mission.movement.memberIds.reverse();
    args.steps=new Map([...args.steps].reverse());
    const reversed=proposeOpeningJoint(args);assert.equal(reversed.reason,'joint-proposal');
    assert.deepEqual([...reversed.steps].sort(),[...r.steps].sort());
});

for(const outcome of ['all','partial','rejected','unknown','accepted-stay','stationary-healer'])
    test(`${outcome}: supplied successive observations, support and original termination remain authoritative`,async t=>{
        const summaries=[];
        for(const enabled of [false,true]){
        const w=await jointFlow(t,{enabled});const rows=[];
        if(outcome==='rejected')for(const c of w.myCreeps)w.returns.set(c.id,-11);
        if(outcome==='unknown')for(const c of w.myCreeps)w.returns.set(c.id,undefined);
        for(let tick=1;tick<=61;tick++){
            const d=w.step(tick);rows.push(record(w));assert.equal(d.startedAt,1);
            if(d.phase==='finished')break;
            support(w);
            const allowed=outcome==='all'?moveCalls(w):outcome==='partial'?moveCalls(w).filter(c=>c.id==='bow1'):
                outcome==='stationary-healer'?moveCalls(w).filter(c=>c.id!=='medic'):[];
            w.observe(allowed);
            // No supplied ownership in adverse comparisons, even on arrival.
        }
        assert.equal(w.d.phase,'finished');assert(w.tick<=61);assert.notEqual(w.d.reason,'captured');
        if(['rejected','unknown','accepted-stay'].includes(outcome)){
            assert.equal(w.tick,5);assert.equal(w.d.reason,'no-displacement');
            assert(rows.slice(0,4).every(r=>r.observation.creeps.find(c=>c.id==='bow1').x===25));
            const code=outcome==='rejected'?-11:outcome==='unknown'?null:0;
            const attempts=rows.flatMap(r=>r.actions.filter(a=>a.type==='action-attempt'&&a.method==='move'));
            assert(attempts.length>0);assert(attempts.every(a=>a.returnCode===code));
        }
        traces[`${outcome}-${enabled?'joint':'baseline'}`]=rows;
        summaries.push({enabled,tick:w.tick,reason:w.d.reason,searches:w.requests.length,
            jointTicks:w.jointResults.filter(r=>r.reason==='joint-proposal').length});
        for(let n=1;n<=5;n++){
            assert.equal(w.step(rows.at(-1).tick+n).phase,'finished');
            assert(!w.logs.some(r=>r.type==='action-decision'&&/^(capture-route|opening-centre)-/.test(r.reason)));
        }
        }
        t.diagnostic(JSON.stringify({outcome,comparisons:summaries}));
    });

test('one declared compliant bow2 refresh: unchanged bow1-only outcomes in both variants',async t=>{
    const summaries=[],declarations=[],initialObservations=[];
    for(const enabled of [false,true]){
        const w=await jointFlow(t,{enabled,compliantPartialRefresh:true}),rows=[];
        declarations.push(structuredClone(w.partialRefresh));
        const initial=new Map(w.myCreeps.map(c=>[c.id,point(c)]));
        let suppliedBow1Steps=0;
        for(let tick=1;tick<=61;tick++){
            const d=w.step(tick),row=record(w);rows.push(row);
            if(tick===1)initialObservations.push({creeps:row.observation.creeps,flags:row.observation.flags,membership:row.membership});
            assert.equal(d.startedAt,1);assert.equal(w.livePlan.state.selection.startedAt+60,61);
            assert(d.queries<=(tick===1?24:4));assert.equal(d.reportedOps,d.queries*100);
            if(w.joint)bounds(w.joint);
            row.requests=w.requests.filter(r=>r.tick===tick).map(r=>({tick:r.tick,actorId:r.actorId,
                origin:r.origin,goal:r.goal,range:r.range,maxOps:r.maxOps,result:structuredClone(r.result),
                suppliedPartial:r.suppliedPartial??false,blockedCells:w.spacing.creeps.filter(c=>c.hits>0&&c.id!==r.actorId).map(point),
                originCost:r.matrix.get(r.origin.x,r.origin.y),pathCosts:r.result.path.map(p=>r.matrix.get(p.x,p.y))}));
            for(const r of w.requests.filter(r=>r.tick===tick)){
                assert.equal(r.maxOps,1000);assert.equal(r.range,0);assert.equal(r.matrix.get(r.origin.x,r.origin.y),0);
                for(const c of w.spacing.creeps)if(c.id!==r.actorId&&c.hits>0)assert.equal(r.matrix.get(c.x,c.y),255);
                let previous=r.origin;
                for(const p of r.result.path){
                    assert.equal(range(previous,p),1);assert.equal(w.spacing.terrainAt(p),0);
                    assert.notEqual(r.matrix.get(p.x,p.y),255);
                    assert(!w.enemies.some(e=>e.body.some(b=>['attack','ranged_attack'].includes(b.type)&&b.hits>0)&&range(e,p)<=5));
                    previous=p;
                }
                assert(r.result.path.length<=40);
                if(!r.result.incomplete)assert.deepEqual(previous,r.goal);
            }
            if(enabled&&tick===2){
                assert.equal(d.phase,'active','Complete supplied report passes real production admission');
                assert.equal(d.queries,4);assert.equal(d.cacheHits,0);
                const refreshed=w.livePlan.state.routeControl.cache.find(r=>r.actorId==='bow2');
                assert.deepEqual(refreshed.path,w.partialRefresh.response.path);
                assert.equal(refreshed.path.length,20);assert.equal(refreshed.incomplete,false);
                assert(refreshed.path.every(p=>cell(p)!=='26,20'));
                assert.equal(refreshed.searchedAt,2);assert.deepEqual(refreshed.from,{x:25,y:21});
                assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===2));
            }
            if(enabled&&tick>=3&&tick<=6){
                assert.equal(d.queries,0);assert.equal(d.cacheHits,4);
                assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===2),'Only suffix/tick updates, no rejuvenation');
            }
            if(enabled&&tick===7){
                assert.equal(d.queries,4);assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===7));
                assert(w.requests.filter(r=>r.tick===7).every(r=>!r.suppliedPartial),'Age-five refresh uses only unchanged old tables');
            }
            if(enabled&&tick>=4&&tick<=7){
                const id=w.livePlan.state.squad.memberIds.indexOf('bow1'),travel=d.travel.actors.find(a=>a.slot===id);
                assert.deepEqual(travel.proposed,{x:29,y:20});assert.equal(travel.admitted,null);
                assert.equal(range(w.actor('medic'),travel.proposed),4,'A successful weapon move with stationary healer would lose support');
                assert(!moveCalls(w).some(c=>c.id==='bow1'));
            }
            if(d.phase==='finished')break;
            support(w);assert.equal(w.centreEvaluations,tick,'Centre preparation runs once after departing preflight');
            const allowed=moveCalls(w).filter(c=>c.id==='bow1');
            const attempts=row.actions.filter(r=>r.type==='action-attempt'&&r.method==='move');
            assert(attempts.length>0);assert(attempts.every(r=>r.returnCode===0));
            w.observe(allowed);suppliedBow1Steps+=allowed.length;
            row.suppliedNext=w.myCreeps.map(c=>({id:c.id,...point(c)}));
            for(const c of w.myCreeps)if(c.id!=='bow1')assert.deepEqual(point(c),initial.get(c.id));
            assert(w.flags.every(f=>f.my===undefined),'No supplied ownership or capture');
        }
        assert.equal(w.d.phase,'finished');assert.notEqual(w.d.reason,'captured');assert(w.tick<=61);
        assert.equal(w.d.reason,'no-displacement');assert.equal(w.tick,enabled?8:5);
        assert.equal(suppliedBow1Steps,enabled?3:0);
        assert.equal(w.partialRefresh.uses.length,enabled?1:0);
        assert(w.requests.filter(r=>r.suppliedPartial).every(r=>r.tick===2&&r.actorId==='bow2'));
        const label=enabled?'joint':'baseline';traces[`compliant-partial-${label}`]=rows;
        summaries.push({variant:label,tick:w.tick,reason:w.d.reason,suppliedBow1Steps,
            uses:w.partialRefresh.uses,positions:w.myCreeps.filter(c=>initial.has(c.id)&&['medic','bow1','bow2','guardR2'].includes(c.id)).map(c=>({id:c.id,...point(c)})),
            queries:rows.map(r=>r.observation.secondaryObjective.queries),
            cacheHits:rows.map(r=>r.observation.secondaryObjective.cacheHits),
            unchanged:rows.map(r=>r.observation.secondaryObjective.unchanged),
            totalReportedOps:rows.reduce((n,r)=>n+r.observation.secondaryObjective.reportedOps,0)});
    }
    assert.deepEqual(declarations[0],declarations[1],'Identical declared response, never conditional on helper authority');
    assert.deepEqual(initialObservations[0],initialObservations[1],'Identical initial world and production membership');
    assert.deepEqual(summaries[0].queries,[16,0,0,0,0]);
    assert.deepEqual(summaries[1].queries,[16,4,0,0,0,0,4,0]);
    assert.equal(summaries[0].totalReportedOps,1600);assert.equal(summaries[1].totalReportedOps,2400);
    t.diagnostic(JSON.stringify(summaries));
});

for(const kind of ['emergency','lost-heal','outsider-injury','centre-support'])
    test(`${kind}: existing gates cancel before proposal evaluation and clear both groups`,async t=>{
        const w=await jointFlow(t);w.step(1);const evaluations=w.jointResults.length;
        if(kind==='emergency')Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='attack')),{x:26,y:19});
        if(kind==='lost-heal')w.actor('medic').body.filter(p=>p.type==='heal').forEach(p=>p.hits=0);
        if(kind==='outsider-injury'){Object.assign(w.actor('scout1'),{x:24,y:20});w.actor('scout1').hits-=50;}
        if(kind==='centre-support')Object.assign(w.actor('guardH1'),{x:5,y:5});
        const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(w.jointResults.length,evaluations);
        assert(!w.logs.some(r=>r.type==='action-decision'&&/^(capture-route|opening-centre)-/.test(r.reason)));
    });

test('inactive opening bypasses candidate; duplicate observations terminate instead of resetting an attempt',async t=>{
    const off=await jointFlow(t,{opening:false});off.step(1);assert.equal(off.jointResults.length,0);
    const w=await jointFlow(t);w.step(1);const searches=w.requests.length;
    w.step(1);assert.equal(w.requests.length,searches);assert.equal(w.livePlan.state.selection.startedAt,1);
    assert.equal(w.d.reason,'duplicate-observation');assert.equal(w.d.phase,'finished');assert.equal(w.joint,null);
});

test('original absolute lifetime cannot be extended by a new proposal',async t=>{
    const w=await jointFlow(t);w.step(1);w.observe();const d=w.step(61);
    assert.equal(d.phase,'finished');assert.equal(d.startedAt,1);assert.equal(w.joint,null);
    assert.equal(d.reason,'timeout');
});

test('centre-only displacement cannot postpone the original departing stall',async t=>{
    const w=await jointFlow(t);let centreDisplacements=0;
    for(let tick=1;tick<=5;tick++){
        const d=w.step(tick);assert.equal(d.startedAt,1);
        if(tick===5){assert.equal(d.phase,'finished');assert.equal(d.reason,'no-displacement');break;}
        support(w);
        const centre=moveCalls(w).filter(c=>!w.livePlan.state.squad.memberIds.includes(c.id));
        centreDisplacements+=centre.length;w.observe(centre);
    }
    assert(centreDisplacements>=16);
});

test('unchanged tactical actions are non-vacuous during a genuine priority release',async t=>{
    const traces=[];
    for(const enabled of [false,true]){
        const w=await jointFlow(t,{enabled});w.step(1);
        Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='attack')),{x:26,y:19});
        Object.assign(w.actor('scout1'),{x:24,y:20});w.actor('scout1').hits-=50;
        w.step(2);assert.equal(w.d.phase,'finished');assert.equal(w.joint,null);
        const calls=tacticalCalls(w);assert(calls.some(c=>c.method==='rangedAttack'));
        assert(calls.some(c=>['heal','rangedHeal'].includes(c.method)));traces.push(calls);
    }
    assert.deepEqual(traces[0],traces[1]);
});

// Explicit generated-only entry point. Source imports and fixed generated paths only.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {holdWorld,moveCalls,tacticalCalls} from '../fixtures/opening-hold-joint-world.js';
import {proposeHoldAwareJoint} from '../fixtures/opening-hold-joint-proposals.js';
import {proposeOpeningJoint,pairSupportTable} from '../../src/strategy/opening-joint-proposals.js';
import {secondaryStepSupport,selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';
const traces={};
after(()=>{if(process.env.PAIN_GAIN_HOLD_OUTPUT)fs.writeFileSync(path.join(process.env.PAIN_GAIN_HOLD_OUTPUT,
    'generated-trajectories.json'),JSON.stringify(traces,null,2)+'\n');});
const point=p=>({x:p.x,y:p.y}),cell=p=>`${p.x},${p.y}`;
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const ids=w=>w.livePlan.state.squad.memberIds;
const departing=w=>moveCalls(w).filter(c=>ids(w).includes(c.id));
const owned=w=>w.logs.filter(r=>r.type==='action-decision'&&/^(capture-route|opening-centre)-/.test(r.reason));
function bounds(r){
    assert(r.work.neighbours<=32);assert(r.work.candidateCounts.every(n=>n<=4));
    assert(r.work.assignments<=256);assert(r.work.nodes<=341);assert(r.work.pairProofs<=48);
    assert(r.work.admission<=1);assert.equal(r.work.queries,0);
}
function check(w){
    if(w.joint&&w.proposalPolicy)bounds(w.joint);
    assert((w.d.travel?.examined??0)<=16);assert(w.d.queries<=(w.tick===1?24:4));
    assert.equal(w.d.reportedOps,w.d.queries*100);
    const moves=new Map(moveCalls(w).map(c=>[c.id,c]));
    assert.equal(new Set(moveCalls(w).map(cell)).size,moveCalls(w).length);
    for(const squad of w.membership.squads){
        assert(secondaryStepSupport(w.myCreeps,squad.memberIds,moves));
        for(let mask=0;mask<16;mask++){
            const observed=squad.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?moves.get(id):null)}));
            assert(secondaryStepSupport(observed,squad.memberIds,new Map()));
        }
    }
    for(const q of w.requests.filter(q=>q.tick===w.tick)){
        assert.equal(q.matrix.get(q.origin.x,q.origin.y),0);let prev=q.origin;
        for(const c of w.spacing.creeps)if(c.id!==q.actorId&&c.hits>0)assert.equal(q.matrix.get(c.x,c.y),255);
        for(const p of q.result.path){assert.equal(range(prev,p),1);assert.equal(q.matrix.get(p.x,p.y),0);prev=p;}
        assert(q.result.path.length<=40);if(!q.result.incomplete)assert.deepEqual(prev,q.goal);
    }
}
const record=w=>({tick:w.tick,observation:structuredClone(w.game),membership:structuredClone(w.membership),
    commands:structuredClone(w.calls),actions:structuredClone(w.logs.filter(r=>r.type!=='game-state')),
    state:structuredClone(w.livePlan.state),joint:w.joint?{reason:w.joint.reason,work:w.joint.work}:null,
    requests:w.requests.filter(q=>q.tick===w.tick).map(q=>({actorId:q.actorId,origin:q.origin,goal:q.goal,
        maxOps:q.maxOps,range:q.range,result:q.result,pathCosts:q.result.path.map(p=>q.matrix.get(p.x,p.y))}))});
function input(w){
    const a=w.jointContext;const creeps=a.observation.creeps.map(c=>({...c,body:c.body.map(p=>({...p}))}));
    return {...a,observation:{...a.observation,creeps,myCreeps:creeps.filter(c=>c.my),enemies:creeps.filter(c=>!c.my),
        flags:a.observation.flags.map(f=>({...f}))},mission:{...a.mission,state:structuredClone(a.mission.state)},
        steps:new Map(a.steps),spacing:{...a.spacing,creeps}};
}
async function fixture(t){const w=await holdWorld(t);w.step(1);return {w,args:input(w)};}

test('real-tick regression: distinct rear approaches with owned healer/front holds',async t=>{
    const w=await holdWorld(t);w.step(1);
    assert.equal(w.joint?.reason,'joint-proposal');
    assert.deepEqual(departing(w).map(c=>[c.id,c.x,c.y]).sort(),[['bow1',23,18],['bow2',23,20]]);
    assert.equal(w.prepared.moves.get('medic'),null);assert.equal(w.prepared.moves.get('guardR2'),null);
    assert.equal(w.centreEvaluations,1);check(w);
    for(const id of ['medic','guardR2'])assert(w.logs.some(r=>r.type==='action-decision'&&r.actorId===id&&r.reason==='capture-route-hold'));
    assert.equal(w.joint.certificates.find(r=>r.actorId==='medic').path[0].x,26,'holder uses real cached route, not a hold route');
});

test('baseline versus extension: successive observed support-safe weapon progress and unchanged tactics',async t=>{
    const summaries=[];
    for(const candidate of [false,true]){
        const w=await holdWorld(t,{candidate}),rows=[];let progressTicks=0;
        for(let tick=1;tick<=61;tick++){
            w.step(tick);const r=record(w);rows.push(r);
            if(w.d.phase==='finished')break;
            check(w);assert.equal(w.centreEvaluations,tick);assert.equal(w.d.startedAt,1);
            if(candidate&&tick>=2&&tick<=6){
                assert.equal(w.d.queries,tick===2?4:0);
                assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===2));
            }
            if(candidate&&tick===7){assert.equal(w.d.queries,4);assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===7));}
            const target=w.flags.find(f=>f.id==='east'),weapons=ids(w).filter(id=>id!=='medic');
            const before=weapons.map(id=>range(w.actor(id),target));w.observe();
            assert(weapons.every((id,i)=>range(w.actor(id),target)<=before[i]));
            if(weapons.some((id,i)=>range(w.actor(id),target)<before[i]))progressTicks++;
            r.suppliedNext=w.myCreeps.map(c=>({id:c.id,...point(c)}));
        }
        summaries.push({candidate,progressTicks,stop:w.tick,reason:w.d.reason,
            queries:rows.map(r=>r.observation.secondaryObjective.queries)});
        if(candidate)assert(progressTicks>=3,'not just transient first-step movement');
        else assert.equal(progressTicks,0);
        const stop=w.tick,n=w.requests.length,centre=w.centreEvaluations;
        for(let tick=stop+1;tick<=stop+5;tick++){w.step(tick);assert.equal(owned(w).length,0);assert.equal(w.joint,null);rows.push(record(w));}
        assert.equal(w.requests.length,n);assert.equal(w.centreEvaluations,centre);
        traces[candidate?'all-candidate':'all-baseline']=rows;
    }
    t.diagnostic(JSON.stringify(summaries));
    const a=await holdWorld(t,{candidate:false});a.step(1);const baseline=tacticalCalls(a);
    const b=await holdWorld(t);b.step(1);assert.deepEqual(tacticalCalls(b),baseline);
});

test('all hold/move pair proofs agree with production support for 256 assignments ×16 outcomes',async t=>{
    const {args}=await fixture(t),members=args.mission.movement.memberIds;
    const group=members.map(id=>args.observation.myCreeps.find(c=>c.id===id));
    const alternatives=[[[24,20],[26,19],[26,20]],[[23,17],[23,18],[23,19]],
        [[23,18],[23,19],[23,20]],[[29,19],[29,20],[29,21]]];
    const choices=new Map(members.map((id,i)=>[id,[{kind:'hold',step:null},...alternatives[i].map(([x,y])=>({kind:'move',step:{x,y}}))]]));
    const work={pairProofs:0},proof=pairSupportTable(group,members,choices,work);assert.equal(work.pairProofs,48);
    let checked=0,yes=0,no=0;
    for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(let c=0;c<4;c++)for(let d=0;d<4;d++){
        const ix=[a,b,c,d],steps=new Map(members.map((id,i)=>[id,choices.get(id)[ix[i]].step]));
        const hi=ix[members.indexOf(proof.healer)];
        const optimized=proof.weapons.every(id=>proof.table.get(id)[hi][ix[members.indexOf(id)]]);
        assert.equal(optimized,secondaryStepSupport(group,members,steps));
        let all=true;for(let mask=0;mask<16;mask++){
            const outcome=group.map((c,i)=>({...c,...(mask&(1<<i)?steps.get(c.id):null)}));
            all=secondaryStepSupport(outcome,members,new Map())&&all;checked++;
        }
        assert.equal(optimized,all);if(all)yes++;else no++;
    }
    assert.equal(checked,4096);assert(yes&&no);
});

test('all moving candidates match production; observations/cache/ages/state are immutable',async t=>{
    const {args}=await fixture(t),before=JSON.stringify(args),beforeSteps=[...args.steps];
    const original=proposeOpeningJoint(args),r=proposeHoldAwareJoint(args);bounds(r);
    assert.equal(original.reason,'no-full-assignment');assert.equal(r.reason,'joint-proposal');
    for(const id of args.mission.movement.memberIds){
        assert.deepEqual(r.choices.get(id).filter(c=>c.kind==='move').map(c=>({step:c.step,certificate:c.certificate})),original.choices.get(id));
        assert.deepEqual(r.choices.get(id).filter(c=>c.kind==='hold'),[{kind:'hold',step:null}]);
    }
    assert.equal(JSON.stringify(args),before);assert.deepEqual([...args.steps],beforeSteps);
    for(const cert of r.certificates){const old=args.mission.state.routeControl.cache.find(c=>c.actorId===cert.actorId);
        assert.equal(cert.searchedAt,old.searchedAt);assert.equal(cert.path.length,old.path.length);
        assert.deepEqual(cert.path.slice(1),old.path.slice(1));assert.deepEqual(cert.path.at(-1),old.path.at(-1));
        if(r.steps.get(cert.actorId)===null)assert.equal(cert,old,'no copied/fabricated hold report');
    }
});

test('one private admission rejection cannot mutate lifecycle or commit held/moving proposals',async t=>{
    const {args}=await fixture(t);args.observation.flags.find(f=>f.id==='east').my=false;
    const state=JSON.stringify(args.mission.state),r=proposeHoldAwareJoint(args);bounds(r);
    assert.equal(r.reason,'admission-rejected');assert.equal(r.work.admission,1);assert.equal(r.steps,args.steps);
    assert.equal(JSON.stringify(args.mission.state),state);
});

test('one-cell final approaches cannot manufacture distinct splice destinations',async t=>{
    const {args}=await fixture(t),members=args.mission.movement.memberIds,target=args.observation.flags.find(f=>f.id==='east');
    const positions=[[43,19],[43,20],[43,21],[44,21]];
    members.forEach((id,i)=>{
        const c=args.observation.myCreeps.find(c=>c.id===id);[c.x,c.y]=positions[i];
        const report=args.mission.state.routeControl.cache.find(r=>r.actorId===id);
        report.from=point(c);report.path=[point(target)];args.steps.set(id,point(target));
    });
    const r=proposeHoldAwareJoint(args);bounds(r);assert.equal(r.reason,'no-full-assignment');
    assert.deepEqual(r.work.candidateCounts,[2,2,2,2]);assert.equal(r.steps,args.steps);
});

test('frozen production gates and moving-candidate predicates have not drifted',()=>{
    const source=fs.readFileSync(new URL('../../src/strategy/opening-joint-proposals.js',import.meta.url),'utf8');
    const extension=fs.readFileSync(new URL('../fixtures/opening-hold-joint-proposals.js',import.meta.url),'utf8');
    const section=s=>s.slice(s.indexOf('    if(probe||adoption)'),s.indexOf('    if(work.neighbours>32'));
    const normalize=s=>s.replace("kind:'move',",'').replace("        candidates.push({kind:'hold',step:null});\n",'');
    assert.equal(normalize(section(extension)),section(source),'unchanged gates/certificates, only explicit hold added');
});

test('maximum real enumeration visits 341 nodes, 256 leaves and 48 pair entries without pruning',async t=>{
    const {args}=await fixture(t),members=args.mission.movement.memberIds;
    const positions=[[25,20],[25,18],[25,22],[25,21]],first=[[26,19],[26,19],[26,21],[26,20]],ys=[20,18,22,21];
    members.forEach((id,i)=>{
        const actor=args.observation.myCreeps.find(c=>c.id===id);[actor.x,actor.y]=positions[i];
        const route=args.mission.state.routeControl.cache.find(r=>r.actorId===id),y=ys[i];
        route.from=point(actor);route.path=[{x:first[i][0],y:first[i][1]},
            ...Array.from({length:17},(_,j)=>({x:27+j,y})),
            ...Array.from({length:Math.max(1,Math.abs(y-20))},(_,j)=>({x:44,y:y+Math.sign(20-y)*(j+1)}))];
        args.steps.set(id,route.path[0]);
    });
    const r=proposeHoldAwareJoint(args);bounds(r);
    assert.deepEqual(r.work.candidateCounts,[4,4,4,4]);assert.equal(r.work.nodes,341);
    assert.equal(r.work.assignments,256);assert.equal(r.work.pairProofs,48);assert.equal(r.work.neighbours,32);
    t.diagnostic(JSON.stringify({maximumWork:r.work,reason:r.reason}));
});

test('unresolved original singleton conflicts retain original proposals/intersection holds',async t=>{
    const {args}=await fixture(t);const allowed=new Set(['23,18','26,20','29,20']);
    args.spacing.terrainAt=p=>allowed.has(cell(p))?0:1;
    const r=proposeHoldAwareJoint(args);bounds(r);assert.equal(r.reason,'no-full-assignment');assert.equal(r.steps,args.steps);
    const selected=selectSecondaryTravelSteps(args.observation.myCreeps,args.mission.movement.memberIds,r.steps,args.spacing.creeps);
    assert.equal(selected.bestSize,1);assert.equal(selected.tied,2);assert([...selected.moves.values()].every(p=>p===null));
});

test('exact geometric optima tie: no assignment/actor-ID winner is selected',async t=>{
    const {args}=await fixture(t),members=args.mission.movement.memberIds;
    for(const [id,y,suffixY]of [['bow1',19,19],['bow2',21,21]]){
        args.observation.myCreeps.find(c=>c.id===id).y=y;
        const report=args.mission.state.routeControl.cache.find(r=>r.actorId===id);
        report.from={x:22,y};report.path=[{x:23,y:20},...Array.from({length:20},(_,j)=>({x:24+j,y:suffixY})),{x:44,y:20}];
        args.steps.set(id,report.path[0]);
    }
    const r=proposeHoldAwareJoint(args);bounds(r);assert.equal(r.reason,'equal-optima');
    assert(r.ties>=2);assert.equal(r.work.admission,0);assert.equal(r.steps,args.steps);
    assert.equal(members.length,4);
});

for(const [name,patch,reason]of [
    ['missing cache',a=>a.mission.state.routeControl.cache=[],'missing-proof'],
    ['missing report',a=>a.mission.state.routeControl.cache[0]=null,'invalid-proof'],
    ['age five',a=>a.mission.state.routeControl.cache[0].searchedAt=-4,'invalid-proof'],
    ['unknown operations',a=>delete a.mission.state.routeControl.cache[0].ops,'invalid-proof'],
    ['incomplete',a=>a.mission.state.routeControl.cache[0].incomplete=true,'invalid-proof'],
    ['invalid suffix',a=>a.mission.state.routeControl.cache[0].path[1].x+=3,'invalid-proof'],
    ['incomplete inputs',a=>a.observation.observationComplete=false,'inputs'],
    ['incomplete occupancy',a=>a.spacing.creeps=a.spacing.creeps.slice(1),'inputs'],
    ['probe authority',a=>a.probe=true,'incompatible-authority'],
    ['adoption authority',a=>a.adoption=true,'incompatible-authority'],
    ['terminal mission',a=>a.mission.state.phase='finished','inactive'],
])test(`${name}: baseline fallback without work beyond existing proofs`,async t=>{
    const {args}=await fixture(t);patch(args);const r=proposeHoldAwareJoint(args);
    assert.equal(r.reason,reason);assert.equal(r.steps,args.steps);assert.equal(r.work.admission,0);bounds(r);
});

for(const kind of ['reservation','occupancy','unknown terrain'])test(`${kind}: forbidden cells cannot be offered or entered`,async t=>{
    const {args}=await fixture(t),blocked={x:23,y:20};
    if(kind==='reservation')args.spacing.reserved=new Set([cell(blocked)]);
    if(kind==='occupancy')Object.assign(args.observation.enemies.find(c=>!c.body.some(p=>['attack','ranged_attack'].includes(p.type))),blocked);
    if(kind==='unknown terrain')args.spacing.terrainAt=p=>cell(p)===cell(blocked)?undefined:0;
    const r=proposeHoldAwareJoint(args);bounds(r);
    for(const options of r.choices.values())assert(!options.some(c=>c.step&&cell(c.step)===cell(blocked)));
    if(r.reason==='joint-proposal')assert(![...r.steps.values()].some(p=>p&&cell(p)===cell(blocked)));
});

test('working travel bypasses terrain; no cache/lifecycle mutation or second coordinator update',async t=>{
    const {w,args}=await fixture(t);const r=proposeHoldAwareJoint(args);assert.equal(r.reason,'joint-proposal');
    args.steps=new Map(r.steps); // Replace holds only for this non-converging bypass probe.
    args.steps.set('medic',{x:26,y:20});args.steps.set('guardR2',{x:29,y:20});
    let terrain=0;args.spacing.terrainAt=()=>{terrain++;throw Error('not evaluated');};
    const bypass=proposeHoldAwareJoint(args);assert.equal(bypass.reason,'no-convergence');assert.equal(terrain,0);
    assert.equal(bypass.work.nodes,0);assert.equal(bypass.work.assignments,0);
    const old=structuredClone(w.livePlan.state.routeControl.cache);w.observe();w.step(2);
    assert.equal(w.d.queries,4,'off-cache bow2 observation gets one normal four-query group refresh');
    assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===2));assert(old.every(r=>r.searchedAt===1));
    w.observe();w.step(3);assert.equal(w.d.queries,0);assert.equal(w.d.cacheHits,4);
    assert(w.livePlan.state.routeControl.cache.every(r=>r.searchedAt===2));
    assert.equal(w.d.startedAt,1);assert.equal(w.livePlan.state.selection.startedAt,1);
});

for(const outcome of ['bow1-only','bow2-only','stationary-healer','rejected','unknown','accepted-stay'])
test(`${outcome}: generated partial outcomes retain safe support and original stop bounds`,async t=>{
    const summaries=[];
    for(const candidate of [false,true]){
        const w=await holdWorld(t,{candidate}),rows=[];let supplied=0;
        if(outcome==='rejected'||outcome==='unknown')for(const c of w.myCreeps)w.returns.set(c.id,outcome==='rejected'?-11:undefined);
        for(let tick=1;tick<=61;tick++){
            w.step(tick);rows.push(record(w));assert.equal(w.d.startedAt,1);
            if(w.d.phase==='finished')break;
            check(w);
            const allowed=outcome==='stationary-healer'?moveCalls(w).filter(c=>c.id!=='medic'):
                outcome==='bow1-only'||outcome==='bow2-only'?moveCalls(w).filter(c=>c.id===outcome.slice(0,4)):[];
            w.observe(allowed);supplied+=allowed.filter(c=>ids(w).includes(c.id)).length;
            rows.at(-1).suppliedNext=w.myCreeps.map(c=>({id:c.id,...point(c)}));
        }
        assert(w.tick<=61);assert.notEqual(w.d.reason,'captured');
        if(['rejected','unknown','accepted-stay'].includes(outcome)){
            assert.equal(w.tick,5);assert.equal(w.d.reason,'no-displacement');assert.equal(supplied,0);
            if(candidate){const attempts=rows.flatMap(r=>r.actions.filter(a=>a.type==='action-attempt'&&a.method==='move'));
                assert(attempts.length);assert(attempts.every(a=>a.returnCode===(outcome==='rejected'?-11:outcome==='unknown'?null:0)));}
        }
        if(candidate&&outcome==='bow1-only'){
            assert.equal(w.tick,2);assert.equal(w.d.reason,'objective-unavailable');
            assert.equal(w.d.queries,4);assert.equal(supplied,1);
            assert(w.requests.some(r=>r.tick===2&&r.actorId==='bow2'&&r.result.incomplete));
        }
        const stop=w.tick;for(let n=1;n<=5;n++){w.step(stop+n);assert.equal(w.d.phase,'finished');assert.equal(owned(w).length,0);assert.equal(w.joint,null);}
        summaries.push({candidate,stop,reason:w.d.reason,supplied,queries:rows.map(r=>r.observation.secondaryObjective.queries)});
        traces[`${outcome}-${candidate?'candidate':'baseline'}`]=rows;
    }
    t.diagnostic(JSON.stringify({outcome,summaries}));
});

for(const kind of ['emergency','lost-heal','outsider-injury','centre-support'])test(`${kind}: priority/safety cancels ownership before commands`,async t=>{
    const w=await holdWorld(t);w.step(1);const n=w.jointResults.length;
    if(kind==='emergency')Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='attack')),{x:23,y:18});
    if(kind==='lost-heal')w.actor('medic').body.filter(p=>p.type==='heal').forEach(p=>p.hits=0);
    if(kind==='outsider-injury'){Object.assign(w.actor('scout1'),{x:24,y:20});w.actor('scout1').hits-=50;}
    if(kind==='centre-support')Object.assign(w.actor('guardH1'),{x:5,y:5});
    w.step(2);assert.equal(w.d.phase,'finished');assert.equal(w.jointResults.length,n);assert.equal(owned(w).length,0);
});

test('late centre cancellation discards successful hold-aware map; emergency actions retain ownership',async t=>{
    const w=await holdWorld(t,{configure:w=>Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='heal')),{x:12,y:12})});
    w.step(1);assert.equal(w.joint.reason,'joint-proposal');assert.equal(w.centrePlan.reason,'priority-handoff');
    assert.equal(w.d.reason,'centre-priority-handoff');assert.equal(owned(w).length,0);assert.equal(w.centreEvaluations,1);
    assert(w.logs.some(r=>r.type==='action-decision'&&/^combat-/.test(r.reason)));
});

test('non-empty attack/healing traces match baseline after the same priority handoff',async t=>{
    const traces=[];
    for(const candidate of [false,true]){
        const w=await holdWorld(t,{candidate});w.step(1);
        // No supplied displacement: both variants have the same next positions.
        Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='attack')),{x:23,y:18});
        Object.assign(w.actor('scout1'),{x:24,y:20});w.actor('scout1').hits-=40;
        w.step(2);assert.equal(w.d.phase,'finished');assert.equal(owned(w).length,0);assert.equal(w.joint,null);
        const actions=tacticalCalls(w);assert(actions.some(c=>['attack','rangedAttack'].includes(c.method)));
        assert(actions.some(c=>['heal','rangedHeal'].includes(c.method)));traces.push(actions);
    }
    assert.deepEqual(traces[0],traces[1]);
});

test('final changed destinations fence centre proposals and holds keep current cells occupied',async t=>{
    const w=await holdWorld(t,{configure:w=>{
        Object.assign(w.centre,{x:20,y:20});
        for(const [id,x,y]of [['guardH2',24,23],['blade',25,23],['guardR0',24,21],['guardR1',26,23]])
            Object.assign(w.actor(id),{x,y});
    }});
    w.step(1);assert.equal(w.joint.reason,'joint-proposal');assert.equal(w.d.phase,'active');check(w);
    const occupied=new Set(w.spacing.creeps.filter(c=>c.hits>0).map(cell));
    const dep=new Set(departing(w).map(cell));
    for(const [id,p]of w.centrePlan.moves)if(p){assert(!dep.has(cell(p)));assert(!occupied.has(cell(p)));assert(!ids(w).includes(id));}
    assert.equal(w.prepared.moves.get('medic'),null);assert.equal(w.prepared.moves.get('guardR2'),null);
    assert(w.centrePlan.moves.size===8);assert([...w.centrePlan.moves.values()].some(Boolean));
});

test('renaming, input order and mirrored routes preserve non-tied hold/move assignments',async t=>{
    let baseline;
    for(const options of [{},{rename:true},{reverse:true},{mirror:true},{rename:true,reverse:true,mirror:true}]){
        const w=await holdWorld(t,options);w.step(1);check(w);assert.equal(w.joint.reason,'joint-proposal');
        const normalized=[...w.joint.steps].map(([id,p])=>[id.replace(/^renamed-/,''),p?{x:options.mirror?99-p.x:p.x,y:p.y}:null]).sort();
        if(!baseline)baseline=normalized;else assert.deepEqual(normalized,baseline);
        const a=input(w);a.mission.movement={...a.mission.movement,memberIds:[...a.mission.movement.memberIds].reverse()};
        a.steps=new Map([...a.steps].reverse());a.observation.myCreeps.reverse();a.observation.enemies.reverse();a.observation.creeps.reverse();
        const r=proposeHoldAwareJoint(a);assert.equal(r.reason,'joint-proposal');assert.deepEqual([...r.steps].sort(),[...w.joint.steps].sort());
    }
});

test('deadline, duplicate tick, match reset and supplied ownership release preserve existing lifecycle',async t=>{
    const w=await holdWorld(t);w.step(1);const n=w.requests.length;
    w.step(61);assert.equal(w.d.phase,'finished');assert.equal(w.d.reason,'timeout');assert.equal(w.requests.length,n);assert.equal(owned(w).length,0);
    w.step(1);assert.equal(w.d.phase,'active');assert.equal(w.joint.reason,'joint-proposal');
    w.step(1);assert.equal(w.d.reason,'duplicate-observation');assert.equal(w.joint,null);assert.equal(owned(w).length,0);
    const released=await holdWorld(t);released.step(1);released.observe();
    // SUPPLIED owner change tests release, not arrival/capture by these paths.
    released.flags.find(f=>f.id==='east').my=true;
    for(let tick=2;tick<=7;tick++){released.step(tick);assert.equal(released.d.reason,'captured');assert.equal(owned(released).length,0);assert.equal(released.joint,null);}
    assert.equal(released.centreEvaluations,1);
});

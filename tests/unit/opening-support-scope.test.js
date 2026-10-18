// Generated-only; no ID arbitration or historical/replay reader imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeWorld,healerBoundaryWorld,scopeFrame,supplySteps,ordinaryScopeWorld} from '../fixtures/opening-support-scope-world.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {planOpeningDeployment} from '../../src/strategy/opening-deployment.js';
import {retainedScopeInput} from '../fixtures/opening-support-scope-retained-input.js';
import {useGeneratedOpeningSearch} from '../fixtures/opening-secondary-search-api.js';
// Production preflight, without a support-scope import hook.
const {prepareSecondaryMovement}=await import('../../src/arena/execute.js');
const moved=m=>[...m??[]].filter(([,p])=>p).map(([id])=>id).sort();
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function supported(w,f){
    assert(f.plan.diagnostic.queries<=(w.tick===1?24:4));
    if(f.plan.diagnostic.reportedOps!==null)assert(f.plan.diagnostic.reportedOps<=(w.tick===1?24000:4000));
    for(const c of w.myCreeps)assert(f.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
    if(f.plan.state.phase!=='active')return;
    assert.equal(f.plan.state.selection.startedAt,1);
    assert((f.mission.diagnostic.travel?.examined??0)<=16);
    assert(f.plan.centre.work.neighbours<=64);
    const all=[...f.plan.moves.values()].filter(Boolean);
    assert.equal(new Set(all.map(p=>`${p.x},${p.y}`)).size,all.length);
    for(const p of all)assert(!w.spacing.creeps.some(c=>c.hits>0&&c.x===p.x&&c.y===p.y));
    for(const squad of w.membership.squads){
        const steps=new Map(squad.memberIds.map(id=>[id,f.plan.moves.get(id)]));
        assert(secondaryStepSupport(w.myCreeps,squad.memberIds,steps));
        for(let mask=0;mask<16;mask++){
            const group=squad.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?steps.get(id):null)}));
            const healers=group.filter(c=>c.body.some(p=>p.type==='heal'&&p.hits>0));
            assert(group.filter(c=>c.body.some(p=>['attack','ranged_attack'].includes(p.type)&&p.hits>0))
                .every(c=>healers.some(h=>range(c,h)<=3)));
        }
    }
}

test('retained generated unsafe proposal now examines safe subsets; intersection still holds',()=>{
    const w=scopeWorld();w.plan();
    for(const c of retainedScopeInput.positions)Object.assign(w.actor(c.id),{x:c.x,y:c.y});
    w.tick=retainedScopeInput.tick;w.bind();w.reports();
    const p=planOpeningDeployment({...w,creeps:w.spacing.creeps},w.membership,w.centre,w.state,
        {search:w.searchPath,terrainAt:w.spacing.terrainAt});
    assert.equal(p.state.phase,'active');const ids=p.movement.memberIds,steps=p.movement.steps;
    assert.deepEqual([...steps],retainedScopeInput.steps);
    assert(!secondaryStepSupport(w.myCreeps,ids,steps));
    assert(secondaryStepSupport(w.myCreeps,ids,new Map(ids.map(id=>[id,null]))));
    const candidate=prepareSecondaryMovement(p,w.myCreeps,w.enemies,w.centre,new Map(),null,null,w.spacing);
    assert.equal(candidate.secondary.state.phase,'active');assert.equal(candidate.secondary.diagnostic.travel.bestSize,1);
    assert.equal(candidate.secondary.diagnostic.travel.tied,2);assert.equal(candidate.secondary.diagnostic.travel.examined,16);
    assert.deepEqual(moved(candidate.moves),[]); // NO ID winner inserted
    for(const id of ['bow1','guardR2']){
        const only=new Map(ids.map(id=>[id,null]));only.set(id,steps.get(id));
        assert(secondaryStepSupport(w.myCreeps,ids,only));
        assert(!w.spacing.creeps.some(c=>range(c,steps.get(id))===0));
    }
    assert(w.spacing.creeps.some(c=>c.id==='bow1'&&range(c,steps.get('medic'))===0));
});

test('scoped support admits only the supported healer step when proposed weapons could move beyond healing',()=>{
    const w=healerBoundaryWorld(),f=scopeFrame(w);
    assert.equal(f.plan.state.phase,'active');
    assert.deepEqual(moved(f.mission.moves),['medic']);
    assert.equal(f.mission.diagnostic.travel.examined,16);supported(w,f);
});

test('unsafe conflict-free full proposal never escapes through production selector fast path',()=>{
    const w=healerBoundaryWorld(),f=scopeFrame(w);
    const steps=f.mission.movement.steps,ids=w.group().memberIds;
    assert.equal(new Set([...steps.values()].map(p=>`${p.x},${p.y}`)).size,4);
    assert([...steps.values()].every(p=>!w.spacing.creeps.some(c=>range(c,p)===0)));
    assert(!secondaryStepSupport(w.myCreeps,ids,steps));
    assert.equal(f.mission.diagnostic.travel.bestSize,1);
    assert.equal(f.mission.diagnostic.travel.tied,1);
    assert.deepEqual(moved(f.mission.moves),['medic']);supported(w,f);
});

test('unsafe full proposal can admit a smaller supported weapon subset without an ID tie-break',()=>{
    function make(){
        const w=healerBoundaryWorld();
        // Separate generated range2 input plus a complete supplied detour.
        // Production validates the whole route, not merely the changed step.
        Object.assign(w.actor('medic'),{x:26,y:20});w.membership=null;w.bind();w.reports();
        return useGeneratedOpeningSearch(w,(r,request)=>{
            if(request.actorId==='medic'&&request.goal.id==='east'){
                const path=[{x:25,y:20},{x:25,y:21},{x:26,y:21},...r.path.map(p=>({...p,y:21})),{x:44,y:20}];
                return{...r,path,cost:path.length*2};
            }
            return r;
        });
    }
    const w=make(),candidate=scopeFrame(w);
    assert.deepEqual(moved(candidate.mission.moves),['bow1','bow2','guardR2']);supported(w,candidate);
});

test('successive healer-first admission then supported squad progress retains cache, deadline and current-position tactics',()=>{
    const w=healerBoundaryWorld(),counts=[];
    for(let i=0;i<6;i++){
        const f=scopeFrame(w);supported(w,f);
        assert.equal(f.plan.state.phase,'active');counts.push(moved(f.mission.moves).length);
        const actual=f.calls.filter(c=>!['move','moveTo'].includes(c.method));
        const baseline=w.execute(null,{tacticalObservation:{...w,creeps:w.spacing.creeps}}).calls;
        assert.deepEqual(actual,baseline.filter(c=>!['move','moveTo'].includes(c.method)));
        if(i<5)supplySteps(w,f);
    }
    assert.deepEqual(counts,[1,4,4,4,4,4]);
    assert.equal(w.searchRequests.length,20); // initial16 plus unchanged age5 refresh4
});

for(const rc of [-11,undefined,0])test(`non-displacing healer call ${rc} retains owned holds and original stall termination`,()=>{
    const w=healerBoundaryWorld();w.returns.set('medic',rc);let last;
    for(let i=0;i<7;i++){
        last=scopeFrame(w);supported(w,last);
        if(last.plan.state.phase!=='active')break;
        assert.deepEqual(moved(last.mission.moves),['medic']);
        assert(last.calls.filter(c=>w.group().memberIds.includes(c.id)).every(c=>c.method==='move'));
        const attempted=last.records.find(r=>r.actorId==='medic'&&r.method==='move');
        assert.equal(attempted.returnCode,rc??null);
        supplySteps(w,last,[]);
    }
    assert.equal(w.tick,5);assert.equal(last.plan.diagnostic.reason,'no-displacement');
    assert.equal(last.plan.state.selection.startedAt,1);assert.equal(w.searchRequests.length,16);
});

test('partial execution is checked against observations; it does not turn accepted steps into progress',()=>{
    const w=healerBoundaryWorld();let f=scopeFrame(w);supplySteps(w,f);
    f=scopeFrame(w);assert.equal(moved(f.mission.moves).length,4);
    supplySteps(w,f,['bow1','bow2','guardR2']); // healer call accepted but no supplied displacement
    const next=scopeFrame(w);supported(w,next);
    assert.equal(next.plan.state.phase,'active');assert.deepEqual(moved(next.mission.moves),['medic']);
    assert.equal(next.plan.state.selection.startedAt,1);
});

test('lost current support and HEAL capability still cancel; complete-input and route failures never reach subset travel',()=>{
    for(const mutation of ['support','heal','observation','route']){
        const results=[];
        for(const reverse of [false,true]){
            const w=healerBoundaryWorld();
            if(mutation==='support')w.actor('bow1').x=29;
            if(mutation==='heal')for(const p of w.actor('medic').body)if(p.type==='heal')p.hits=0;
            if(mutation==='observation')w.spacing.creeps=w.spacing.creeps.slice(1);
            if(mutation==='route'){const search=w.searchPath;w.searchPath=(...args)=>({...search(...args),incomplete:true});}
            w.membership=null;w.bind();w.reports();
            if(reverse){w.myCreeps.reverse();w.spacing.creeps.reverse();}
            const f=scopeFrame(w);assert.equal(f.plan.state.phase,'finished');assert(!f.mission.diagnostic.travel);
            results.push(f.plan.diagnostic.reason);
        }
        assert.equal(results[0],results[1]);
    }
});

test('current-support preflight itself cancels even when a proposed healer/weapon move could repair some outcomes',()=>{
    const w=healerBoundaryWorld(),f=scopeFrame(w);
    // Isolated preflight input; ordinary admission would also reject it. The
    // current all-stay outcome is unsupported, so no admitted subset is safe.
    w.actor('bow1').x=29;
    const steps=new Map(f.mission.movement.steps);steps.set('bow1',{x:28,y:19});
    assert(!secondaryStepSupport(w.myCreeps,w.group().memberIds,new Map(w.group().memberIds.map(id=>[id,null]))));
    const p=prepareSecondaryMovement({...f.mission,movement:{...f.mission.movement,steps}},
        w.myCreeps,w.enemies,w.centre,new Map(),null,null,w.spacing);
    assert.equal(p.secondary.diagnostic.reason,'capture-step-support-unavailable');
    assert.equal(p.moves,null);assert(!p.secondary.diagnostic.travel);
});

test('non-adjacent or missing proposed routes and unknown occupancy retain preflight rejection',()=>{
    for(const mutation of ['nonadjacent','missing','occupancy']){
        const w=healerBoundaryWorld(),f=scopeFrame(w),steps=new Map(f.mission.movement.steps);
        if(mutation==='nonadjacent')steps.set('medic',{x:30,y:20});
        if(mutation==='missing')steps.delete('bow1');
        const spacing=mutation==='occupancy'?{...w.spacing,creeps:null}:w.spacing;
        const result=prepareSecondaryMovement({...f.mission,movement:{...f.mission.movement,steps}},
            w.myCreeps,w.enemies,w.centre,new Map(),null,null,spacing);
        assert.equal(result.secondary.state.phase,'finished');assert.equal(result.moves,null);
    }
});

test('no safe moving subset keeps objective holds then cancels at the unchanged stall bound',()=>{
    const w=healerBoundaryWorld();
    useGeneratedOpeningSearch(w,(r,request)=>{if(request.actorId==='medic'&&request.goal.id==='east'){
        // Valid supplied detour whose first adjacent cell contains a centre scout.
        return{...r,path:[{x:25,y:21},...r.path.map(p=>({...p,y:21})),{x:44,y:20}]};
    }return r;});
    Object.assign(w.actor('scout1'),{x:25,y:21});let last;
    for(let i=0;i<6;i++){
        last=scopeFrame(w);
        if(last.plan.state.phase!=='active')break;
        supported(w,last);assert.equal(moved(last.mission.moves).length,0);
        assert(last.records.filter(r=>w.group().memberIds.includes(r.actorId)&&r.channel==='movement').every(r=>r.outcome==='hold'));
        supplySteps(w,last,[]);
    }
    assert.equal(w.tick,5);assert.equal(last.plan.diagnostic.reason,'no-displacement');
});

test('original seeded congestion rerun preserves intersection ties and its adverse stall',()=>{
    const traces=[];
    for(const reverse of [false,true]){
        const w=scopeWorld(),trace=[];
        if(reverse){w.myCreeps.reverse();w.spacing.creeps.reverse();}
        for(let i=0;i<9;i++){
            const f=scopeFrame(w);supported(w,f);trace.push({tick:w.tick,count:moved(f.mission.moves).length,reason:f.plan.diagnostic.reason});
            if(f.plan.state.phase!=='active')break;supplySteps(w,f);
        }
        traces.push(trace);
    }
    assert.deepEqual(traces[0],traces[1]);
    assert.deepEqual(traces[1].map(t=>t.count),[3,1,0,0,0,0,0]);assert.equal(traces[1].at(-1).reason,'no-displacement');
});

test('unchanged absolute deadline still terminates the scoped-support mission without refresh or a new attempt',()=>{
    const w=healerBoundaryWorld();scopeFrame(w);
    const queries=w.searchRequests.length;w.tick=61;w.bind();w.reports();
    const done=scopeFrame(w);assert.equal(done.plan.diagnostic.reason,'timeout');
    assert.equal(done.plan.state.selection.startedAt,1);assert.equal(w.searchRequests.length,queries);
    w.tick=62;w.bind();w.reports();assert.equal(scopeFrame(w).plan.state.phase,'finished');
});

for(const kind of ['escort','injury','emergency'])test(`${kind} priority and actual tactical calls are invariant to input order`,()=>{
    const traces=[];
    for(const reverse of [false,true]){
        const w=healerBoundaryWorld(),extra={};
        if(kind==='escort')extra.escort={healerId:'medic',allyId:'bow1',ally:w.actor('bow1'),mode:'hold',distance:3};
        if(kind==='injury')w.actor('bow1').hits--;
        if(kind==='emergency')Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='attack')),{x:29,y:19});
        if(reverse){w.myCreeps.reverse();w.spacing.creeps.reverse();}
        const f=scopeFrame(w,extra);assert.equal(f.plan.state.phase,'finished');assert(!f.mission.diagnostic.travel);
        if(kind==='escort')assert.equal(f.plan.diagnostic.reason,'capture-movement-priority');
        if(kind==='injury')assert(f.calls.some(c=>['heal','rangedHeal'].includes(c.method)));
        if(kind==='emergency'){
            assert(f.calls.some(c=>c.method==='rangedAttack'));
            assert(f.records.some(r=>r.reason==='ranged-melee-retreat'));
        }
        // Production actor order follows the observation. Compare per-actor
        // decisions, not a claim that irrelevant input order fixes call order.
        const baseline=w.execute(null,{...extra,tacticalObservation:{...w,creeps:w.spacing.creeps}}).calls;
        assert.deepEqual(f.calls,baseline);
        traces.push(f.calls.slice().sort((a,b)=>a.id.localeCompare(b.id)||a.method.localeCompare(b.method)));
    }
    assert.deepEqual(traces[0],traces[1]);
});

test('centre crossing reservations and centre-healer non-displacement stay safe with subset-scoped support',()=>{
    for(const reverse of [false,true]){
        const w=ordinaryScopeWorld(),positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[10,11],
            medic:[12,12],bow1:[13,12],bow2:[13,13],guardR2:[12,13]};
        for(const [id,[x,y]]of Object.entries(positions))Object.assign(w.actor(id),{x,y});
        Object.assign(w.flags.find(f=>f.id==='east'),{x:8,y:30});
        if(reverse){w.myCreeps.reverse();w.spacing.creeps.reverse();}
        w.membership=null;w.bind();w.reports();
        const first=scopeFrame(w);supported(w,first);supplySteps(w,first);
        const second=scopeFrame(w);supported(w,second);
        assert.equal(range(w.actor('guardM1'),{x:12,y:12}),1);
        assert([...second.mission.moves.values()].some(p=>p&&p.x===12&&p.y===12));
        assert([...second.plan.centre.moves.values()].every(p=>!p||p.x!==12||p.y!==12));
        supplySteps(w,second,second.calls.filter(c=>c.method==='move'&&c.id!=='guardH2').map(c=>c.id));
        const third=scopeFrame(w);supported(w,third);assert.equal(third.plan.state.phase,'active');
    }
});

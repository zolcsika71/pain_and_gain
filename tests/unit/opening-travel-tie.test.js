// Generated-only. No replay/retained-payload reader imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tieWorld,tieFrame,runTieSequence,supplySteps} from '../fixtures/opening-travel-tie-world.js';
import {selectStableTravelSteps,travelAlternatives} from '../fixtures/opening-travel-tie-candidate.js';
import {selectSecondaryTravelSteps,secondaryStepSupport} from '../../src/strategy/supported-contest.js';

const moved=m=>[...m??[]].filter(([,p])=>p).map(([id])=>id).sort();
const point=p=>({x:p.x,y:p.y});
function checkFrame(w,f){
    assert(f.plan.diagnostic.queries<=(w.tick===1?24:4));
    if(f.plan.diagnostic.reportedOps!==null)assert(f.plan.diagnostic.reportedOps<=(w.tick===1?24000:4000));
    for(const c of w.myCreeps)assert(f.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
    if(f.plan.state.phase!=='active')return;
    assert.equal(f.plan.state.selection.startedAt,1);
    assert((f.mission.diagnostic.travel?.examined??0)<=16);
    assert(f.plan.centre.work.neighbours<=64);
    assert(f.plan.centre.work.subsets.every(s=>s.examined<=16));
    for(const squad of w.membership.squads){
        const map=new Map(squad.memberIds.map(id=>[id,f.plan.moves.get(id)]));
        assert(secondaryStepSupport(w.myCreeps,squad.memberIds,map));
        for(let mask=0;mask<16;mask++){
            const group=squad.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?map.get(id):null)}));
            const hs=group.filter(c=>c.body.some(p=>p.hits>0&&p.type==='heal'));
            const ws=group.filter(c=>c.body.some(p=>p.hits>0&&['attack','ranged_attack'].includes(p.type)));
            assert(ws.every(c=>hs.some(h=>Math.max(Math.abs(h.x-c.x),Math.abs(h.y-c.y))<=3)));
        }
    }
    const destinations=[...f.plan.moves.values()].filter(Boolean);
    assert.equal(new Set(destinations.map(p=>`${p.x},${p.y}`)).size,destinations.length);
    for(const p of destinations)assert(!w.spacing.creeps.some(c=>c.hits>0&&c.x===p.x&&c.y===p.y));
}

test('seeded stall contains exact safe ties before centre occupancy leaves no safe alternative',()=>{
    const w=tieWorld(),frames=[];
    for(let i=0;i<7;i++){
        const f=tieFrame(w);checkFrame(w,f);frames.push(f);
        if(f.plan.state.phase!=='active')break;
        supplySteps(w,f);
    }
    assert.deepEqual(frames.map(f=>moved(f.mission.moves).length),[3,1,0,0,0,0,0]);
    assert.deepEqual(frames[1].alternatives.best.map(s=>s.actors),[['bow1','bow2'],['bow1','guardR2']]);
    assert.deepEqual(frames[2].alternatives.best.map(s=>s.actors),[['bow2'],['guardR2']]);
    assert.equal(frames[4].alternatives.bestSize,0);
    assert.equal(frames.at(-1).plan.diagnostic.reason,'no-displacement');
});

test('current subset support removes the old cancellation, but extra ID-only progress still stalls without capture',()=>{
    const outputs={},worlds={};
    for(const rule of ['intersection','stable-id']){
        const w=tieWorld(),frames=[];
        for(let i=0;i<61;i++){
            const f=tieFrame(w,rule);checkFrame(w,f);frames.push(f);
            if(f.plan.state.phase!=='active')break;
            supplySteps(w,f);
        }
        outputs[rule]=frames;worlds[rule]=w;
    }
    const baseline=outputs.intersection,candidate=outputs['stable-id'];
    assert.deepEqual(candidate.map(f=>moved(f.mission.moves).length),[3,2,2,1,1,1,1,1,0,0,0,0,0]);
    assert.equal(candidate.at(-1).plan.diagnostic.reason,'no-displacement');
    assert.equal(candidate.length,13);assert.equal(baseline.length,7);
    assert(candidate.every(f=>f.plan.diagnostic.reason!=='capture-step-support-unavailable'));
    assert.equal(candidate.at(-1).plan.state.selection.startedAt,1);
    assert.equal(baseline.at(-1).plan.diagnostic.reason,'no-displacement');
    assert.deepEqual(moved(candidate[2].mission.moves),['bow1','bow2']);
    assert(candidate[2].alternatives.best.some(s=>s.actors.includes('medic')),
        'Keep the feasible healer alternative that stable IDs decline; do not tune IDs to select it');
    assert.deepEqual(moved(candidate[3].mission.moves),['bow1']);
    assert.deepEqual(moved(candidate[4].mission.moves),['medic']);
    assert.deepEqual(moved(candidate[7].mission.moves),['guardR2']);
    assert(candidate[7].alternatives.best.some(s=>s.actors.includes('medic')));
    assert.equal(candidate[8].alternatives.bestSize,0);
    assert.equal(candidate.at(-1).plan.state.selection.targetId,'east');
    assert.equal(candidate.at(-1).plan.state.phase,'finished');
    for(const rule of ['intersection','stable-id']){
        const w=worlds[rule],queries=w.searchRequests.length;
        w.tick++;w.bind();w.reports();const spent=tieFrame(w,rule);
        assert.equal(spent.plan.state.phase,'finished');assert.equal(spent.mission.moves,null);
        assert.equal(w.searchRequests.length,queries);
    }
});

test('same-input centre candidate decisions and unique secondary decisions remain unchanged',()=>{
    const w=tieWorld(),first=tieFrame(w); // unique initial maximum
    const ids=w.group().memberIds,steps=first.mission.movement.steps;
    assert.deepEqual(selectStableTravelSteps(w.myCreeps,ids,steps,w.spacing.creeps),
        selectSecondaryTravelSteps(w.myCreeps,ids,steps,w.spacing.creeps));
    // Two independent worlds with identical first observation and preparation.
    const b=tieFrame(tieWorld(),'intersection'),c=tieFrame(tieWorld(),'stable-id');
    assert.deepEqual([...b.plan.centre.moves],[...c.plan.centre.moves]);
    assert.deepEqual(b.plan.centre.details,c.plan.centre.details);
});

for(const rc of [-11,undefined,0])test(`failed/unknown/non-displaced lower-ID winner (${rc}) denies safe healer alternatives until the original stall bound`,()=>{
    const outputs=[];
    for(const rule of ['intersection','stable-id']){
    const w=tieWorld(),selected=[];
    for(let i=0;i<61;i++){
        w.returns.set('bow2',rc);
        const before=w.myCreeps.map(point),f=tieFrame(w,rule);checkFrame(w,f);
        assert.deepEqual(w.myCreeps.map(point),before);
        const attempted=f.records.find(r=>r.actorId==='bow2'&&r.method==='move');
        if(attempted)assert.equal(attempted.returnCode,rc??null);
        selected.push({tick:w.tick,actors:moved(f.mission.moves),best:f.alternatives?.best.map(s=>s.actors),reason:f.plan.diagnostic.reason});
        if(f.plan.state.phase!=='active')break;
        // bow2 never displaces, even for0; all other explicitly admitted steps
        // are supplied as successes. No return value changes an observation.
        supplySteps(w,f,f.calls.filter(c=>c.method==='move'&&c.id!=='bow2').map(c=>c.id));
    }
    if(rule==='stable-id'){
        const starvation=selected.filter(s=>s.tick>=2&&s.best?.some(a=>a.includes('medic')));
        assert(starvation.length>=2);assert(starvation.every(s=>s.actors.includes('bow2')&&!s.actors.includes('medic')));
        assert.deepEqual(selected.map(s=>s.actors.length),[3,2,2,1,1,1,1,0]);
    }
    assert.equal(selected.at(-1).reason,'no-displacement');assert.equal(selected.at(-1).tick,8);
    assert.equal(w.state.selection.startedAt,1);assert.equal(w.searchRequests.length,8);
    outputs.push(w.myCreeps.map(c=>({id:c.id,...point(c)})));
    }
    assert.deepEqual(outputs[0].filter(c=>['medic','bow1','bow2','guardR2'].includes(c.id)),
        outputs[1].filter(c=>['medic','bow1','bow2','guardR2'].includes(c.id)),
        'Extra failed commands are not extra observed secondary progress');
});

test('both rules spend the same stall budget without secondary displacement; ID repeats the same contender',()=>{
    const endpoints=[];
    for(const rule of ['intersection','stable-id']){
    const w=tieWorld(),frames=[];let done;
    for(let i=0;i<10;i++){
        const f=tieFrame(w,rule);checkFrame(w,f);done=f;
        frames.push({tick:w.tick,moves:moved(f.mission.moves),best:f.alternatives?.best.map(s=>s.actors)});
        if(f.plan.state.phase!=='active')break;
        const secondary=new Set(w.group().memberIds);
        supplySteps(w,f,i===0?null:f.calls.filter(c=>c.method==='move'&&!secondary.has(c.id)).map(c=>c.id));
    }
    if(rule==='stable-id'){
        const repeated=frames.filter(f=>f.tick>=2&&f.best?.some(s=>s.includes('guardR2')));
        assert(repeated.length>=2);assert(repeated.every(f=>f.moves.includes('bow2')&&!f.moves.includes('guardR2')));
    }
    assert.equal(done.plan.diagnostic.reason,'no-displacement');assert.equal(w.tick,6);
    assert.equal(done.plan.state.selection.startedAt,1);
    endpoints.push(w.group().memberIds.map(id=>point(w.actor(id))));
    }
    assert.deepEqual(endpoints[0],endpoints[1]);
});

test('partial healer non-displacement remains support-safe and cannot replenish the deadline',()=>{
    for(const rule of ['intersection','stable-id']){
    const w=tieWorld();let final;
    for(let i=0;i<61;i++){
        final=tieFrame(w,rule);checkFrame(w,final);
        if(final.plan.state.phase!=='active')break;
        supplySteps(w,final,final.calls.filter(c=>c.method==='move'&&c.id!=='medic').map(c=>c.id));
    }
    assert.equal(final.plan.state.phase,'finished');assert(w.tick<=61);assert.equal(final.plan.state.selection.startedAt,1);
    assert.equal(final.plan.diagnostic.reason,'no-displacement');assert.equal(w.tick,rule==='intersection'?7:8);
    }
});

test('current-state attacks/healing are unchanged during both generated continuations; ID decisions remain maximum safe subsets',()=>{
    for(const rule of ['intersection','stable-id']){
        const w=tieWorld();
        for(let i=0;i<61;i++){
            const f=tieFrame(w,rule);checkFrame(w,f);
            const baseline=w.execute(null,{tacticalObservation:{...w,creeps:w.spacing.creeps}});
            const tactical=calls=>calls.filter(c=>!['move','moveTo'].includes(c.method));
            assert.deepEqual(tactical(f.calls),tactical(baseline.calls));
            if(f.plan.state.phase!=='active')break;
            if(rule==='stable-id')assert.equal(moved(f.mission.moves).length,f.alternatives.bestSize);
            supplySteps(w,f);
        }
    }
});

test('current occupancy and convergence stay hard constraints; all-blocked and fast paths match production',()=>{
    const w=tieWorld(),f=tieFrame(w),ids=w.group().memberIds,steps=f.mission.movement.steps;
    const occupied=w.spacing.creeps.concat([...steps.values()].filter(Boolean).map((p,i)=>({id:`block-${i}`,hits:1,...p})));
    assert(moved(selectStableTravelSteps(w.myCreeps,ids,steps,occupied).moves).length===0);
    const holds=new Map(ids.map(id=>[id,null]));
    assert.deepEqual(selectStableTravelSteps(w.myCreeps,ids,holds,w.spacing.creeps),
        selectSecondaryTravelSteps(w.myCreeps,ids,holds,w.spacing.creeps));
    assert.equal(travelAlternatives(w.myCreeps,ids,steps,w.spacing.creeps).subsets.length,16);
});

test('crossing centre traffic is rechecked with each newly selected secondary reservation, not allowed to share destinations',()=>{
    for(const rule of ['intersection','stable-id']){
        const w=tieWorld();w.spacing.reserved=new Set(['11,11']);
        for(let i=0;i<4;i++){
            const f=tieFrame(w,rule);checkFrame(w,f);
            if(f.plan.state.phase!=='active')break;
            const reserved=new Set([...f.mission.moves.values()].filter(Boolean).map(p=>`${p.x},${p.y}`));
            for(const p of f.plan.centre.moves.values())if(p){assert(!reserved.has(`${p.x},${p.y}`));assert(!w.spacing.reserved.has(`${p.x},${p.y}`));}
            supplySteps(w,f);
        }
    }
});

test('both rules retain the existing generated adjacent crossing-reservation case with a non-displacing centre healer',async()=>{
    const {centreWorld}=await import('../fixtures/opening-centre-support-world.js');
    for(const rule of ['intersection','stable-id']){
        const w=centreWorld(),positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[10,11],
            medic:[12,12],bow1:[13,12],bow2:[13,13],guardR2:[12,13]};
        for(const [id,[x,y]]of Object.entries(positions))Object.assign(w.actor(id),{x,y});
        Object.assign(w.flags.find(f=>f.id==='east'),{x:8,y:30});w.membership=null;w.bind();w.reports();
        const a=tieFrame(w,rule);checkFrame(w,a);supplySteps(w,a);
        const b=tieFrame(w,rule);checkFrame(w,b);
        assert.equal(Math.max(Math.abs(w.actor('guardM1').x-12),Math.abs(w.actor('guardM1').y-12)),1);
        assert([...b.mission.moves.values()].some(p=>p&&p.x===12&&p.y===12));
        assert([...b.plan.centre.moves.values()].every(p=>!p||p.x!==12||p.y!==12));
        supplySteps(w,b,b.calls.filter(c=>c.method==='move'&&c.id!=='guardH2').map(c=>c.id));
        const c=tieFrame(w,rule);checkFrame(w,c);assert.equal(c.plan.state.phase,'active');
    }
});

test('escort ownership cancels before alternate subset selection; tactical commands stay identical',()=>{
    const runs=[];
    for(const rule of ['intersection','stable-id']){
        const w=tieWorld(),f=tieFrame(w,rule);supplySteps(w,f);
        const escort={healerId:'medic',allyId:'bow1',ally:w.actor('bow1'),mode:'hold',distance:2};
        const stopped=tieFrame(w,rule,{escort});
        assert.equal(stopped.plan.diagnostic.reason,'capture-movement-priority');
        assert.equal(stopped.alternatives,null);runs.push(stopped.calls);
    }
    assert.deepEqual(runs[0],runs[1]);
});

function signature(frames,mirror=false){return frames.map(f=>({tick:f.tick,reason:f.diagnostic.reason,
    secondary:f.secondary.map(([id,p])=>[id,p&&mirror?{x:99-p.x,y:99-p.y}:p]).sort((a,b)=>a[0]<b[0]?-1:1),
    commands:f.calls.filter(c=>c.method==='move').map(c=>({id:c.id,x:mirror?99-c.x:c.x,y:mirror?99-c.y:c.y})).sort((a,b)=>a.id<b.id?-1:1)}));}
test('input-order independence and mirrored geometry with unchanged identities preserve the entire generated sequence',()=>{
    const expected=runTieSequence('stable-id').frames;
    for(const mode of ['reverse','mirror']){
        const actual=runTieSequence('stable-id',{make:()=>{
            const w=tieWorld();
            if(mode==='reverse'){w.myCreeps.reverse();w.enemies.reverse();w.flags.reverse();w.spacing.creeps.reverse();}
            if(mode==='mirror')for(const p of [...w.spacing.creeps,...w.flags])Object.assign(p,{x:99-p.x,y:99-p.y});
            w.membership=null;w.bind();w.reports();return w;
        }}).frames;
        assert.deepEqual(signature(actual,mode==='mirror'),signature(expected));
    }
});

test('original fixed IDs select the lexical exact-tie winner; a unique maximum matches production',()=>{
    const w=tieWorld(),first=tieFrame(w);supplySteps(w,first);
    const tied=tieFrame(w),ids=w.group().memberIds,steps=tied.mission.movement.steps;
    const original=selectStableTravelSteps(w.myCreeps,ids,steps,w.spacing.creeps);
    assert.deepEqual(travelAlternatives(w.myCreeps,ids,steps,w.spacing.creeps).best.map(s=>s.actors),
        [['bow1','bow2'],['bow1','guardR2']]);
    assert.deepEqual(moved(original.moves),['bow1','bow2']);
    // No identity is changed to improve the continuation. Exact ties depend
    // on the original generic comparator; input-order invariance is separate.
    const u=tieWorld(),unique=tieFrame(u);
    assert.deepEqual(selectStableTravelSteps(u.myCreeps,u.group().memberIds,unique.mission.movement.steps,u.spacing.creeps),
        selectSecondaryTravelSteps(u.myCreeps,u.group().memberIds,unique.mission.movement.steps,u.spacing.creeps));
});

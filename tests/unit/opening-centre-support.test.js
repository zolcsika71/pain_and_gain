// Pure generated entry point: no retained payload reader in this import graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import {centreWorld,centreFrame,supplySteps,movement,tactical} from '../fixtures/opening-centre-support-world.js';
import {planCentreSupport,withCentreSupport} from '../fixtures/opening-centre-support-candidate.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {range} from '../fixtures/secondary-generated-world.js';

const point=c=>({x:c.x,y:c.y});
const armed=c=>c.body.some(p=>p.hits>0&&['attack','ranged_attack'].includes(p.type));
const heals=c=>c.body.some(p=>p.type==='heal'&&p.hits>0);
function allOutcomes(w,plan){
    for(const squad of w.membership.squads){
        const moves=new Map(squad.memberIds.map(id=>[id,plan.moves.get(id)??null]));
        assert(secondaryStepSupport(w.myCreeps,squad.memberIds,moves));
        for(let mask=0;mask<16;mask++){
            const group=squad.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?moves.get(id):null)}));
            const hs=group.filter(heals),ws=group.filter(armed);
            assert(ws.every(c=>hs.some(h=>range(c,h)<=3)));
            assert(hs.every(h=>ws.filter(c=>range(c,h)<=3).length>=2));
        }
    }
}
function bounds(w,frame){
    assert.equal(frame.plan.centre.work.actors,8);
    assert(frame.plan.centre.work.neighbours<=64);
    assert.equal(frame.plan.centre.work.searches,0);
    assert(frame.plan.centre.work.subsets.every(s=>s.examined<=16));
    assert(frame.plan.diagnostic.queries<=(w.tick===1?24:4));
    for(const c of w.myCreeps)assert(movement(frame.calls).filter(a=>a.id===c.id).length<=1);
    const direct=frame.calls.filter(c=>c.method==='move');
    assert.equal(new Set(direct.map(c=>`${c.x},${c.y}`)).size,direct.length);
    allOutcomes(w,frame.plan);
}

test('ordinary centre fallback can separate from a non-displacing healer; candidate admits useful supported progress',()=>{
    const baseline=centreWorld(),candidate=centreWorld();
    let baselineReason=null,centreProgress=0,secondaryProgress=0;
    for(let tick=1;tick<=6;tick++){
        // Fixed generated baseline observation schedule: only centre weapons
        // advance diagonally; their accepted healer calls do not displace.
        const b=centreFrame(baseline,{candidate:false});
        if(tick===4){assert.equal(b.plan.state.phase,'finished');baselineReason=b.plan.diagnostic.reason;}
        const f=centreFrame(candidate);assert.equal(f.plan.state.phase,'active');bounds(candidate,f);
        assert.equal(f.plan.state.selection.startedAt,1);
        const centreIds=[...f.plan.centre.moves.keys()];
        const centre=f.calls.filter(c=>c.method==='move'&&centreIds.includes(c.id)&&!heals(candidate.actor(c.id)));
        const secondary=f.calls.filter(c=>c.method==='move'&&!centreIds.includes(c.id));
        centreProgress+=centre.length;secondaryProgress+=secondary.length;
        if(tick===6)break;
        const groupIds=baseline.group().memberIds;
        const supplied=baseline.myCreeps.filter(c=>!groupIds.includes(c.id)&&armed(c)).map(c=>({id:c.id,x:c.x+1,y:c.y+1}));
        for(const c of supplied){assert(b.calls.some(a=>a.id===c.id&&a.method==='moveTo'));assert(!baseline.spacing.creeps.some(p=>p.x===c.x&&p.y===c.y));}
        for(const c of supplied)Object.assign(baseline.actor(c.id),point(c));
        baseline.tick++;baseline.bind();baseline.reports();
        // Only two centre healers fail to move; all other admitted direct
        // commands are supplied as successful, with occupancy checked first.
        supplySteps(candidate,f,f.calls.filter(c=>c.method==='move'&&!(centreIds.includes(c.id)&&heals(candidate.actor(c.id)))).map(c=>c.id));
    }
    assert(baselineReason);assert(centreProgress>=6);assert(secondaryProgress>=12);
    assert.equal(candidate.state.selection.startedAt,1);
});

test('five complete generated observations advance both retained squads and departing squad without extra searches',()=>{
    const w=centreWorld(),initial=new Map(w.myCreeps.map(c=>[c.id,range(c,w.centre)]));
    for(let i=0;i<5;i++){
        const frame=centreFrame(w);assert.equal(frame.plan.state.phase,'active');bounds(w,frame);
        assert(frame.calls.filter(c=>c.method==='move').length>=6);
        if(i<4)supplySteps(w,frame);
    }
    const rest=w.myCreeps.filter(c=>!w.group().memberIds.includes(c.id)&&armed(c));
    assert(rest.every(c=>range(c,w.centre)<initial.get(c.id)));
    assert(w.group().memberIds.every(id=>w.actor(id).x>25));
    assert.equal(w.searchRequests.length,16); // four admitted target families, original acquisition only
});

test('missing/unknown terrain gives owned holds, not ordinary unchecked movement',()=>{
    const w=centreWorld(),mission=w.plan();w.spacing.terrainAt=()=>undefined;
    const plan=withCentreSupport(w,mission);const x=w.execute(plan);
    assert.equal(plan.centre.reason,'centre-supported');assert([...plan.centre.moves.values()].every(p=>p===null));
    assert(x.calls.filter(c=>plan.centre.moves.has(c.id)).every(c=>c.method!=='moveTo'));
});

test('fully blocked centre retains no-safe-progress; original mission stall still terminates with no waiting extension',()=>{
    const w=centreWorld();let plan;
    for(let tick=1;tick<=5;tick++){
        const mission=w.plan();w.spacing.terrainAt=()=>1; // generated blocked local centre terrain, AFTER route preflight
        plan=withCentreSupport(w,mission);w.execute(plan);
        if(tick<5){assert([...plan.centre.moves.values()].every(p=>!p));assert.equal(plan.state.phase,'active');}
        w.spacing.terrainAt=()=>0;w.tick++;w.bind();w.reports();
    }
    assert.equal(plan.diagnostic.reason,'no-displacement');assert.equal(plan.state.selection.startedAt,1);
    assert.equal(w.searchRequests.length,16);
});

test('retained support loss and original absolute deadline still cancel before centre intervention',()=>{
    const w=centreWorld();centreFrame(w);Object.assign(w.actor('guardM0'),{x:8,y:20});w.tick=2;w.bind();w.reports();
    const lost=centreFrame(w);assert.equal(lost.plan.state.phase,'finished');assert.equal(lost.plan.centre.reason,'inactive');
    const timeout=centreWorld();centreFrame(timeout);timeout.tick=61;timeout.bind();timeout.reports();
    assert.equal(centreFrame(timeout).plan.diagnostic.reason,'timeout');
});

for(const kind of ['escort','pair','injury','combat','emergency','rejoin'])test(`${kind} ownership wins before centre proposals; current-tick tactics remain unchanged`,()=>{
    const w=centreWorld(),mission=w.plan(),extra={};
    if(kind==='escort')extra.escort={healerId:'guardH1',allyId:'guardM0',ally:w.actor('guardM0'),mode:'hold',distance:1};
    if(kind==='pair')extra.pair={moves:new Map([['guardM0',{target:null,reason:'pair-hold'}]]),context:{leaderId:'guardM0'}};
    if(kind==='injury')w.actor('guardM0').hits--;
    const melee=w.enemies.find(c=>c.body.some(p=>p.type==='attack'));
    if(kind==='combat')Object.assign(melee,{x:15,y:9});
    if(kind==='emergency')Object.assign(melee,{x:20,y:15});
    if(kind==='rejoin'){
        Object.assign(w.actor('guardM0'),{x:14,y:10});
        extra.engagements=new Map([['guardM0',{rejoin:{done:false,targetId:melee.id,healerId:'guardH1',ticks:0}}]]);
    }
    extra.tacticalObservation={...w,creeps:w.spacing.creeps};
    const saved=extra.engagements?structuredClone(extra.engagements):null;
    const baseline=w.execute(null,extra);
    if(saved)extra.engagements=structuredClone(saved);
    const plan=withCentreSupport(w,mission,extra),actual=w.execute(plan,extra);
    assert.equal(plan.centre.reason,'priority-handoff');assert.equal(plan.state.phase,'finished');
    assert.equal(plan.centre.work.neighbours,0);assert.deepEqual(actual.calls,baseline.calls);
    assert.deepEqual(tactical(actual.calls),tactical(baseline.calls));
    if(kind==='emergency'){
        assert(actual.records.some(r=>r.reason==='ranged-melee-retreat'));
        assert(actual.calls.some(c=>c.method==='rangedAttack'));
    }
    if(kind==='injury')assert(actual.calls.some(c=>c.method==='heal'));
    if(kind==='rejoin')assert(actual.records.some(r=>r.reason==='melee-rejoin-support'));
});

test('within-squad converging proposals reuse the16-subset common-move rule',()=>{
    const w=centreWorld();w.centre.x=11;w.spacing.reserved=new Set(['12,11']);
    const f=centreFrame(w);bounds(w,f);
    assert(f.plan.centre.work.subsets.some(s=>s.examined===16));
    assert(f.plan.centre.details.some(d=>d.reason==='subset-hold'));
    assert(f.plan.centre.details.some(d=>d.reason==='admitted'));
});

test('cross-centre-squad converging proposals hold both contenders without ID priority',()=>{
    const w=centreWorld(),positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[10,11],
        guardH2:[13,10],blade:[14,9],guardR0:[14,10],guardR1:[13,11]};
    for(const [id,[x,y]] of Object.entries(positions))Object.assign(w.actor(id),{x,y});
    w.centre.x=12;w.membership=null;w.bind();w.reports();
    const f=centreFrame(w);bounds(w,f);
    const contenders=f.plan.centre.details.filter(d=>d.reason==='cross-squad-convergence');
    assert(contenders.length>=2);assert(contenders.every(d=>d.admitted===null));
    assert(f.plan.centre.details.some(d=>d.reason==='admitted'));
});

test('reservations include secondary and shared destinations; cross-group traffic cannot use the same admitted cell',()=>{
    const w=centreWorld(),mission=w.plan();
    w.spacing.reserved=new Set(['12,12','20,17']);
    const plan=withCentreSupport(w,mission);allOutcomes(w,plan);
    const all=[...plan.moves.values()].filter(Boolean);
    assert.equal(new Set(all.map(p=>`${p.x},${p.y}`)).size,all.length);
    for(const p of plan.centre.moves.values())if(p)assert(!w.spacing.reserved.has(`${p.x},${p.y}`));
    const secondary=new Set([...mission.moves.values()].filter(Boolean).map(p=>`${p.x},${p.y}`));
    for(const p of plan.centre.moves.values())if(p)assert(!secondary.has(`${p.x},${p.y}`));
});

test('successive generated crossing traffic fences a real adjacent secondary destination, including centre-healer non-displacement',()=>{
    const w=centreWorld(),positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[10,11],
        medic:[12,12],bow1:[13,12],bow2:[13,13],guardR2:[12,13]};
    for(const [id,[x,y]] of Object.entries(positions))Object.assign(w.actor(id),{x,y});
    Object.assign(w.flags.find(f=>f.id==='east'),{x:8,y:30});
    w.membership=null;w.bind();w.reports();
    const first=centreFrame(w);bounds(w,first);supplySteps(w,first);
    const second=centreFrame(w);bounds(w,second);
    const destination={x:12,y:12};
    assert.equal(range(w.actor('guardM1'),destination),1);
    assert([...second.mission.moves.values()].some(p=>p&&range(p,destination)===0));
    assert([...second.plan.centre.moves.values()].every(p=>!p||range(p,destination)!==0));
    assert(second.calls.some(c=>c.method==='move'&&c.id==='guardH2'));
    supplySteps(w,second,second.calls.filter(c=>c.method==='move'&&c.id!=='guardH2').map(c=>c.id));
    const third=centreFrame(w);bounds(w,third);
    assert.equal(third.plan.state.phase,'active');assert.equal(third.plan.state.selection.startedAt,1);
});

for(const rc of [-11,undefined,0])test(`return ${rc} is not progress; supplied non-displacement is rechecked`,()=>{
    const w=centreWorld();for(const c of w.myCreeps)w.returns.set(c.id,rc);
    const before=w.myCreeps.map(point);const a=centreFrame(w);assert.deepEqual(w.myCreeps.map(point),before);
    supplySteps(w,a,[]);const b=centreFrame(w);bounds(w,b);
    assert.equal(b.plan.state.selection.startedAt,1);assert.equal(b.plan.diagnostic.unchanged,1);
    assert.deepEqual(w.myCreeps.map(point),before);
});

test('inactive bypass does not inspect candidate terrain or take ownership',()=>{
    const w=centreWorld();const result=planCentreSupport({mission:{state:{phase:'finished'}}});
    assert.equal(result.reason,'inactive');assert.equal(result.moves,null);assert.equal(result.work.actors,0);
    const f=centreFrame(w,{candidate:false});assert(!f.plan.centre);
    const group=w.group().memberIds;assert(f.calls.filter(c=>!group.includes(c.id)).every(c=>c.method==='moveTo'));
});

test('malformed positions fence bounded work; fatigue and lost MOVE propose no step',()=>{
    const malformed=centreWorld(),mission=malformed.plan();malformed.actor('guardM0').x=Infinity;
    const rejected=withCentreSupport(malformed,mission);
    assert.equal(rejected.centre.reason,'unsupported-input');assert.equal(rejected.centre.work.neighbours,0);
    for(const kind of ['fatigue','move']){
        const w=centreWorld(),m=w.plan(),c=w.actor('guardM0');
        if(kind==='fatigue')c.fatigue=1;
        else for(const p of c.body)if(p.type==='move')p.hits=0;
        const f=withCentreSupport(w,m);assert.equal(f.centre.moves.get(c.id),null);
        assert(f.centre.work.neighbours<=64);
    }
});

test('pinned membership, renaming, input-order and mirrored geometry preserve centre proposals/admission',()=>{
    const base=centreWorld(),mission=base.plan();const expected=planCentreSupport({observation:base,membership:base.membership,mission,spacing:base.spacing});
    for(const mode of ['reverse','rename','mirror']){
        const w=centreWorld(),m=w.plan(),rename=id=>mode==='rename'?`alias-${id.split('').reverse().join('')}`:id;
        const mirror=p=>p&&mode==='mirror'?{x:99-p.x,y:99-p.y}:p;
        for(const c of w.spacing.creeps){c.id=rename(c.id);Object.assign(c,mirror(point(c)));}
        for(const f of w.flags)Object.assign(f,mirror(point(f)));
        for(const s of w.membership.squads)s.memberIds=s.memberIds.map(rename);
        m.moves=new Map([...m.moves].map(([id,p])=>[rename(id),mirror(p)]));
        if(mode==='reverse'){w.myCreeps.reverse();w.enemies.reverse();w.membership.squads.reverse();w.spacing.creeps.reverse();}
        const actual=planCentreSupport({observation:w,membership:w.membership,mission:m,spacing:w.spacing});
        const values=Object.fromEntries([...expected.moves].map(([id,p])=>[rename(id),mirror(p)]));
        assert.deepEqual(Object.fromEntries(actual.moves),values);
        assert(actual.work.neighbours<=64);assert(actual.work.subsets.every(s=>s.examined<=16));
    }
});

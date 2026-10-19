// Generated-only comparison. No retained observations, historical readers,
// substitute pathfinder or movement arbitration enter this entry point.
import test from 'node:test';
import assert from 'node:assert/strict';
import {occupancyWorld,centreFrame,supplySteps} from '../fixtures/opening-occupancy-api-world.js';
import {congestedWorld} from '../fixtures/opening-secondary-congested-world.js';
import {tactical} from '../fixtures/opening-centre-support-world.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {range} from '../fixtures/secondary-generated-world.js';

const point=c=>({x:c.x,y:c.y});
const heal=c=>c.body.some(p=>p.type==='heal'&&p.hits>0);
const armed=c=>c.body.some(p=>p.hits>0&&['attack','ranged_attack'].includes(p.type));
const cell=p=>`${p.x},${p.y}`;
// scriptedResponse reads the fixed corridor family, not w.routes (the latter
// is an unused legacy table pruned differently after mission binding).
const inputs=w=>JSON.stringify({tick:w.tick,creeps:w.spacing.creeps,flags:w.flags,
    responseFamily:w.responseFamily,membership:w.membership});
const direct=f=>f.calls.filter(c=>c.method==='move');
function frame(w,mode,extra={}){
    if(mode==='centre-only')return{plan:{moves:new Map(),state:{phase:'ordinary'}},...w.execute(null,
        {...extra,tacticalObservation:{...w,creeps:w.spacing.creeps}})};
    return centreFrame(w,{candidate:mode==='supported',...extra});
}
function safe(w,f){
    for(const c of w.myCreeps)assert(f.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
    if(f.plan.state.phase!=='active')return;
    assert.equal(f.plan.state.selection.startedAt,1);
    assert.equal(f.plan.state.selection.startedAt+60,61);
    assert(f.plan.diagnostic.queries<=(w.tick===1?24:4));
    assert((f.mission.diagnostic.travel?.examined??0)<=16);
    assert.equal(f.plan.centre.work.actors,8);
    assert(f.plan.centre.work.neighbours<=64);
    assert.equal(f.plan.centre.work.searches,0);
    assert(f.plan.centre.work.subsets.every(s=>s.examined<=16));
    const cells=direct(f).map(cell);assert.equal(new Set(cells).size,cells.length);
    for(const c of direct(f)){
        assert.equal(range(w.actor(c.id),c),1);
        assert(!w.spacing.creeps.some(p=>p.hits>0&&cell(p)===cell(c)));
        assert.deepEqual(f.plan.moves.get(c.id),point(c));
    }
    // Current positions plus EVERY independent admitted move/stay outcome.
    // These arithmetic checks do not simulate Arena command resolution.
    for(const s of w.membership.squads){
        const steps=new Map(s.memberIds.map(id=>[id,f.plan.moves.get(id)??null]));
        assert(secondaryStepSupport(w.myCreeps,s.memberIds,steps));
        for(let mask=0;mask<16;mask++){
            const group=s.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?steps.get(id):null)}));
            const hs=group.filter(heal),ws=group.filter(armed);
            assert(ws.every(c=>hs.some(h=>range(c,h)<=3)));
            assert(hs.every(h=>ws.filter(c=>range(c,h)<=3).length>=2));
        }
    }
    for(const r of w.requests){
        assert.equal(r.maxOps,1000);assert.equal(r.goal.range,0);
        assert.equal(r.matrix.get(r.origin.x,r.origin.y),0);
        for(const c of r.observed)if(c.id!==r.actorId&&c.hits>0&&c.exists!==false)
            assert.equal(r.matrix.get(c.x,c.y),255);
    }
}
// Explicit subsequent observation inputs. Ordinary moveTo paths remain opaque:
// only require a prior fallback call, adjacent currently free distinct cells.
// No destination is inferred from moveTo, assumed vacating or return0.
function observe(w,f,{successIds=null,ordinary=[]}={}){
    const moves=direct(f).filter(c=>!successIds||successIds.includes(c.id));
    for(const p of ordinary){
        assert(f.calls.some(a=>a.id===p.id&&a.method==='moveTo'&&a.target===w.centreId));
        assert.equal(range(w.actor(p.id),p),1);
        assert(!w.spacing.creeps.some(c=>c.hits>0&&cell(c)===cell(p)));
    }
    assert.equal(new Set([...moves,...ordinary].map(cell)).size,moves.length+ordinary.length);
    supplySteps(w,f,moves.map(c=>c.id));
    for(const p of ordinary)Object.assign(w.actor(p.id),point(p));
    w.distinct();w.reports();
}

test('eight identical generated observations compare centre-only, ordinary split and supported split',t=>{
    const modes=['centre-only','ordinary','supported'],worlds=modes.map(()=>occupancyWorld());
    const supported=worlds[2],birth=new Map(supported.myCreeps.map(c=>[c.id,point(c)])),counts=[];
    for(let i=0;i<8;i++){
        assert(inputs(worlds[0])===inputs(worlds[1]),'centre-only and ordinary receive the same generated inputs');
        assert(inputs(worlds[1])===inputs(worlds[2]),'ordinary and supported receive the same generated inputs');
        const before=worlds.map(inputs),frames=worlds.map((w,j)=>frame(w,modes[j]));
        worlds.forEach((w,j)=>assert.equal(inputs(w),before[j]));
        assert.equal(worlds[0].requests.length,0);
        assert(frames[0].calls.every(c=>c.method==='moveTo'&&c.target===supported.centreId));
        const group=supported.group().memberIds;
        assert.equal(frames[1].calls.filter(c=>!group.includes(c.id)&&c.method==='moveTo').length,10);
        assert.equal(frames[1].plan.state.phase,'active');safe(supported,frames[2]);
        assert.equal(frames[2].plan.state.phase,'active');
        assert.deepEqual(tactical(frames[0].calls),tactical(frames[1].calls));
        assert.deepEqual(tactical(frames[1].calls),tactical(frames[2].calls));
        assert.equal(frames[1].plan.diagnostic.queries,frames[2].plan.diagnostic.queries);
        const centre=direct(frames[2]).filter(c=>!group.includes(c.id));
        counts.push({tick:supported.tick,centre:centre.length,secondary:direct(frames[2]).length-centre.length,
            queries:frames[2].plan.diagnostic.queries,cacheHits:frames[2].plan.diagnostic.cacheHits});
        for(const r of supported.requests)for(const p of r.result.path)
            assert.notEqual(r.matrix.get(p.x,p.y),255,'Positive supplied corridors respect current occupancy');
        if(i===7)break;
        observe(supported,frames[2]);
        // SAME next observation for all modes, supplied from checked candidate
        // steps. This compares decisions, not predicted baseline trajectories.
        for(const w of worlds.slice(0,2)){
            for(const c of w.myCreeps)Object.assign(c,point(supported.actor(c.id)));
            w.tick=supported.tick;w.bind();w.distinct();w.reports();
        }
    }
    for(const c of supported.myCreeps.filter(c=>armed(c)||heal(c)).filter(c=>!supported.group().memberIds.includes(c.id)))
        assert(range(c,supported.centre)<range(birth.get(c.id),supported.centre));
    for(const id of supported.group().memberIds)assert(range(supported.actor(id),supported.flags.find(f=>f.id==='east'))<
        range(birth.get(id),supported.flags.find(f=>f.id==='east')));
    assert(counts.filter(c=>c.centre>0&&c.secondary>0).length>=5);
    assert.deepEqual(counts.map(c=>c.queries),[16,0,0,0,0,4,0,0]);
    assert.equal(supported.requests.length,20);
    t.diagnostic(JSON.stringify({case:'common-input-eight-observations',counts}));
});

test('stationary retained healers limit progress; ordinary split cancels rather than silently borrowing departing support',t=>{
    const ordinary=occupancyWorld(),candidate=occupancyWorld(),counts=[];let rejection=null;
    for(let i=0;i<8;i++){
        const f=frame(candidate,'supported');safe(candidate,f);assert.equal(f.plan.state.phase,'active');
        const centreIds=[...f.plan.centre.moves.keys()];
        counts.push({tick:candidate.tick,centre:direct(f).filter(c=>centreIds.includes(c.id)).length,
            centreWeapons:direct(f).filter(c=>centreIds.includes(c.id)&&armed(candidate.actor(c.id))).length,
            secondary:direct(f).filter(c=>!centreIds.includes(c.id)).length});
        if(!rejection){
            const b=frame(ordinary,'ordinary');
            if(b.plan.state.phase==='finished')rejection={tick:ordinary.tick,reason:b.plan.diagnostic.reason};
            else if(i<7){
                const group=ordinary.group().memberIds;
                const positions=ordinary.myCreeps.filter(c=>!group.includes(c.id)&&armed(c))
                    .map(c=>({id:c.id,x:c.x+1,y:c.y+1}));
                observe(ordinary,b,{ordinary:positions});
            }
        }
        if(i<7)observe(candidate,f,{successIds:direct(f).filter(c=>
            !(centreIds.includes(c.id)&&heal(candidate.actor(c.id)))).map(c=>c.id)});
    }
    assert.deepEqual(rejection,{tick:4,reason:'defence-unavailable'});
    assert(counts.some(c=>c.centreWeapons>0));
    assert.equal(counts.at(-1).centreWeapons,0,'Fixed-healer support eventually holds the centre weapons');
    assert.equal(counts.at(-1).centre,2,'Repeated healer commands are NOT observed centre progress');
    assert(counts.reduce((n,c)=>n+c.secondary,0)>12);
    t.diagnostic(JSON.stringify({case:'stationary-centre-healers',rejection,counts}));
});

test('partial execution and non-displacing healers retain observed support without resetting the mission',()=>{
    const w=occupancyWorld();
    for(let i=0;i<7;i++){
        const f=frame(w,'supported');safe(w,f);assert.equal(f.plan.state.phase,'active');
        const before=new Map(w.myCreeps.map(c=>[c.id,point(c)]));
        if(i===6)break;
        const blocked=i===0?['guardH1','guardH2']:i===2?['medic']:['guardM0'];
        const successIds=direct(f).filter(c=>!blocked.includes(c.id)).map(c=>c.id);
        observe(w,f,{successIds});
        for(const id of blocked)assert.deepEqual(point(w.actor(id)),before.get(id));
    }
    assert.equal(w.state.selection.startedAt,1);
});

for(const rc of [0,-11,undefined])test(`return ${rc} without displacement still spends the original four-observation stall`,()=>{
    const w=occupancyWorld();for(const c of w.myCreeps)w.returns.set(c.id,rc);let f;
    for(let i=0;i<5;i++){
        f=frame(w,'supported');safe(w,f);
        if(i<4)observe(w,f,{successIds:[]});
    }
    assert.equal(f.plan.state.phase,'finished');assert.equal(f.plan.diagnostic.reason,'no-displacement');
    assert.equal(f.plan.state.selection.startedAt,1);assert.equal(w.tick,5);
    const timeout=occupancyWorld();frame(timeout,'supported');timeout.tick=61;timeout.bind();timeout.reports();
    const end=frame(timeout,'supported');assert.equal(end.plan.diagnostic.reason,'timeout');
    assert.equal(end.plan.diagnostic.queries,0);assert.equal(end.plan.centre.reason,'inactive');
});

for(const conflict of ['escort','injury'])test(`${conflict} support priority ends ownership before candidate commands`,()=>{
    const w=occupancyWorld(),first=frame(w,'supported');observe(w,first);const extra={};
    if(conflict==='escort')extra.escort={healerId:'guardH1',allyId:'guardM0',ally:w.actor('guardM0'),mode:'hold',distance:1};
    else w.actor('guardM0').hits-=10;
    const f=frame(w,'supported',extra),baseline=w.execute(null,
        {...extra,tacticalObservation:{...w,creeps:w.spacing.creeps}});
    assert.equal(f.plan.state.phase,'finished');assert.equal(direct(f).length,0);
    assert.equal(f.plan.centre.work.neighbours,0);assert.deepEqual(f.calls,baseline.calls);
    assert.deepEqual(tactical(f.calls),tactical(baseline.calls));
    if(conflict==='escort')assert.equal(f.plan.diagnostic.reason,'centre-priority-handoff');
    else {
        assert.equal(range(w.actor('guardH1'),w.actor('guardM0')),2);
        assert(f.calls.some(c=>c.id==='guardH1'&&c.method==='rangedHeal'&&c.target==='guardM0'));
    }
});

test('current occupancy requests preserve the unchanged generated congestion outcome with centre support',t=>{
    // Existing generated analogue, NOT the similarly shaped retained fixture.
    // Deliberately convergent supplied response tables are unchanged; they are
    // not asserted to be routes a real occupancy-aware pathfinder would return.
    const w=occupancyWorld({make:congestedWorld,respond:(w,a,g)=>{
        const r=w.routes.find(r=>r.actorId===a.id&&r.flagId===g.pos.id);
        return structuredClone({path:r.path,incomplete:r.incomplete,ops:r.ops});
    }}),counts=[],queries=[],centre=[];let f;
    for(let i=0;i<7;i++){
        f=frame(w,'supported');safe(w,f);counts.push(direct(f).filter(c=>w.group().memberIds.includes(c.id)).length);
        queries.push(f.plan.diagnostic.queries);centre.push(direct(f).filter(c=>!w.group().memberIds.includes(c.id)).length);
        if(i<6)observe(w,f);
    }
    assert.deepEqual(counts,[3,1,0,0,0,0,0]);assert.equal(f.plan.diagnostic.reason,'no-displacement');
    assert.equal(f.plan.state.selection.startedAt,1);assert(queries.every(q=>q<=4));
    t.diagnostic(JSON.stringify({case:'unchanged-generated-congestion',counts,centre,queries}));
});

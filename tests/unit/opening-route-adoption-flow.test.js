// Explicit generated-only real runTick entry point. No historical readers.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {publish} from '../../tools/retrieval-files.js';
import {adoptionFlow,moveCalls,tacticalCalls} from '../fixtures/opening-adoption-flow-world.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';

const departing=w=>moveCalls(w).filter(c=>w.membership.squads.find(s=>s.id===w.captured?.mission.state.squad.id)?.memberIds.includes(c.id));
const assertUnchanged=w=>{
    assert.equal(JSON.stringify(w.captured.mission.state),w.capturedState);
    assert.equal(JSON.stringify([...w.captured.moves]),w.capturedMoves);
};
const trajectories={};
after(()=>{if(process.env.PAIN_GAIN_ADOPTION_OUTPUT)publish(path.join(process.env.PAIN_GAIN_ADOPTION_OUTPUT,
    'generated-continuations.json'),Buffer.from(JSON.stringify(trajectories,null,2)+'\n'));});
function support(w){
    for(const s of w.membership.squads){
        const moves=w.comparison.moves;
        assert(secondaryStepSupport(w.myCreeps,s.memberIds,moves));
        for(let mask=0;mask<16;mask++){
            const actors=s.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?moves.get(id):null)}));
            assert(secondaryStepSupport(actors,s.memberIds,new Map()));
        }
    }
}

test('real tick adopts only a strict admitted-step improvement after the shared one-shot pair',async t=>{
    const w=await adoptionFlow(t);assert.equal(w.step(1).phase,'active');const d=w.step(2);
    t.diagnostic(JSON.stringify({adoption:d.routeAdoption,work:w.comparison?.work}));
    assert.equal(d.routeProbe.queries,2);assert(d.routeProbe.results.every(r=>r.status==='complete'));
    const departing=moveCalls(w).filter(c=>['medic','bow1','bow2','guardR2'].includes(c.id));
    assert.equal(departing.length,4);assert(departing.some(c=>c.id==='bow1'&&c.x===26&&c.y===18));
    assert.deepEqual(d.routeAdoption,[1,2,2,4]);
    assertUnchanged(w);support(w);
    assert.equal(w.comparison.work.validations,2);assert.equal(w.comparison.work.selections,2);
    assert(w.comparison.work.subsets.every(n=>n<=16));assert.equal(w.comparison.work.centreNeighbours,0);
    assert.equal(w.centreEvaluations,2);assert(w.centrePlan.work.neighbours<=64);
});

for(const [mode,counts]of [['equal',[2,2,2]],['baseline-superior',[2,4,4]]])
    test(`${mode}: no adoption without strict improvement over both controls`,async t=>{
        const w=await adoptionFlow(t,{mode});w.step(1);const d=w.step(2);
        assert.deepEqual(d.routeAdoption,[6,...counts]);assertUnchanged(w);
        assert.equal(w.comparison.mission,w.captured.mission);
        assert.deepEqual(w.comparison.moves,w.captured.moves);
    });

test('default-off/probe-only/unsupported dependency paths bypass authority evaluation',async t=>{
    for(const options of [{adoption:false},{adoption:true,probe:false},{adoption:true,opening:false}]){
        const w=await adoptionFlow(t,options);w.step(1);w.step(2);
        assert.equal(w.comparisonEvaluations,0);assert.equal(w.d?.routeAdoption,undefined);
    }
});

test('probe-only retains identical live state, commands and tactics; adopting preserves centre commands',async t=>{
    const runs=[];
    for(const options of [{adoption:false,probe:false},{adoption:false,probe:true},{adoption:true,probe:true}]){
        const w=await adoptionFlow(t,options);w.step(1);w.step(2);
        runs.push({calls:structuredClone(w.calls),tactics:structuredClone(tacticalCalls(w)),d:w.d,state:JSON.stringify(w.livePlan.state),
            centre:moveCalls(w).filter(c=>!['medic','bow1','bow2','guardR2'].includes(c.id))});
    }
    assert.deepEqual(runs[0].calls,runs[1].calls);assert.deepEqual(runs[1].tactics,runs[2].tactics);
    assert.equal(runs[0].state,runs[1].state);
    assert.deepEqual(runs[1].centre,runs[2].centre);
    const {routeProbe,probeEligibility,...plain}=runs[1].d;assert.deepEqual(plain,runs[0].d);
});

for(const [label,change]of [
    ['incomplete',r=>({...r,incomplete:true})],['ops missing',r=>({...r,ops:undefined})],
    ['ops invalid',r=>({...r,ops:1001})],['overlong',r=>({...r,path:Array(41).fill({x:26,y:18})})],
    ['NaN',r=>({...r,path:[{x:NaN,y:18}]})],['endpoint',r=>({...r,path:r.path.slice(0,-1)})],
    ['throw',()=>{throw Error('controlled never logged');}],
    ['unsupported-path',r=>({...r,path:{}})],['incomplete-type',r=>({...r,incomplete:'false'})],
    ['fraction',r=>({...r,path:[{x:26.5,y:18}]})],
]) for(const failureAt of [1,2])test(`${label} at charged call${failureAt}: no adoption, no retry`,async t=>{
    const w=await adoptionFlow(t);let calls=0;
    w.returnResult=({path})=>{const r={path,incomplete:false,ops:100};return ++calls===failureAt?change(r):r;};
    w.step(1);const d=w.step(2);
    assert.equal(d.routeProbe.queries,failureAt);assert.equal(calls,failureAt);assert.equal(w.probeArgs.state.spent,true);
    assert.deepEqual(d.routeAdoption,[2,2,null,null]);assertUnchanged(w);
    w.step(3);assert.equal(calls,failureAt);assert.deepEqual(w.d.routeAdoption,[0,null,null,null]);
});

test('matrix construction failure is charged before API and consumes the shared allowance',async t=>{
    const w=await adoptionFlow(t);w.step(1);w.matrixThrow=true;const d=w.step(2);
    assert.equal(d.routeProbe.queries,1);assert.equal(d.routeProbe.results[0].status,'thrown');
    assert.equal(w.requests.filter(r=>r.diagnostic).length,0);assert.equal(w.probeArgs.state.spent,true);
    assert.deepEqual(d.routeAdoption,[2,2,null,null]);assertUnchanged(w);
});

test('only the sampled report receives the actual search age; committed cancellation uses that cache',async t=>{
    const w=await adoptionFlow(t);w.step(1);w.step(2);
    const before=w.captured.mission.state,after=w.comparison.mission.state;
    assert.equal(after.selection,before.selection);assert.equal(after.selection.startedAt,1);
    for(const r of after.routeControl.cache){
        const old=before.routeControl.cache.find(p=>p.actorId===r.actorId);
        if(r.actorId==='bow1'){assert.equal(r.searchedAt,2);assert.equal(r.tick,2);assert.deepEqual(r.from,{x:25,y:19});
            assert.equal(r.ops,105);assert.deepEqual(r.path[0],{x:26,y:18});}
        else assert.equal(r,old);
    }
    const cancelled=w.comparison.mission.cancel('generated-after-commit');
    assert.equal(cancelled.state.routeControl,after.routeControl);assert.equal(cancelled.state.phase,'finished');
    assert.equal(cancelled.diagnostic.travel,w.comparison.mission.diagnostic.travel);
    assert.equal(cancelled.diagnostic.travel.actors.filter(a=>a.admitted).length,4);
    assert.equal(cancelled.movement,undefined);assert.equal(cancelled.state.selection.startedAt,1);
    const d=w.step(6);assert.equal(d.queries,4);assert.equal(d.routeProbe,undefined);
    // Original peers expire, not rejuvenated by the one selected insertion.
    assert.equal(w.comparison.mission.state.routeControl.cache.find(r=>r.actorId==='medic').searchedAt,1);
});

test('fixed-slot renaming keeps sampling/admission; original slot reallocation retains its bias',async t=>{
    for(const rename of [false,true]){
        const w=await adoptionFlow(t,{rename});w.step(1);const d=w.step(2);
        assert.equal(w.game.creeps[d.memberSlots[d.routeProbe.actorSlot]].id,rename?'renamed-bow1':'bow1');
        assert.deepEqual(d.routeAdoption,[1,2,2,4]);
    }
    const w=await adoptionFlow(t);w.step(1);
    const members=w.membership.squads.find(s=>s.memberIds.includes('bow1')).memberIds;
    const a=members.indexOf('bow1'),b=members.indexOf('bow2');[members[a],members[b]]=[members[b],members[a]];
    const d=w.step(2);assert.equal(w.game.creeps[d.memberSlots[d.routeProbe.actorSlot]].id,'bow2');
    assert.equal(w.requests.filter(r=>r.diagnostic).length,2);
});

for(const kind of ['departing-support','centre-support','priority','binding'])
    test(`${kind} changes during pair cancel and clear BOTH groups before execution`,async t=>{
        const w=await adoptionFlow(t);w.step(1);
        w.afterSearch=({extra})=>{if(!extra)return;
            if(kind==='binding')w.flags.find(f=>f.id==='east').my=false;
            else if(kind==='priority')Object.assign(w.enemies[0],{x:26,y:17});
            else w.actor(kind==='departing-support'?'medic':'guardH1').body.filter(p=>p.type==='heal').forEach(p=>{p.hits=0;});
        };
        const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.routeAdoption[0],7);
        assert.equal(w.comparison.moves,null);assert.equal(w.comparison.centreIds,null);
        assert(!w.logs.some(r=>r.type==='action-decision'&&/^(opening-centre|capture-route)-/.test(r.reason)));
    });

test('observations, not accepted returns, govern partial/no-displacement termination and release',async t=>{
    for(const outcome of ['none','partial','all']){
        const w=await adoptionFlow(t);const rows=[];
        for(let tick=1;tick<=61;tick++){
            const d=w.step(tick);rows.push({tick,phase:d.phase,reason:d.reason,unchanged:d.unchanged,
                positions:w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y})),diagnostic:structuredClone(d),
                commands:structuredClone(w.calls),
                state:structuredClone(d.routeAdoption?.[0]===1?w.comparison.mission.state:w.livePlan.state)});
            if(d.phase==='finished'){
                assert.equal(d.startedAt,1);assert(w.probeArgs.state.spent);
                for(let n=1;n<=5;n++)assert.equal(w.step(tick+n).phase,'finished');
                break;
            }
            if(tick>=2&&outcome==='partial')w.observe(departing(w).filter(c=>c.id==='bow1'));
            if(tick>=2&&outcome==='all')w.observe(departing(w));
            rows.at(-1).suppliedNext=w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y}));
        }
        assert.equal(rows.at(-1).phase,'finished');assert(rows.at(-1).tick<=61);
        if(outcome==='none'){assert.equal(rows.at(-1).tick,5);assert.equal(rows.at(-1).reason,'no-displacement');}
        assert.equal(w.requests.filter(r=>r.diagnostic).length,2);
        trajectories[outcome]=rows;t.diagnostic(JSON.stringify({outcome,termination:rows.at(-1).tick,reason:rows.at(-1).reason}));
    }
});

for(const code of [0,-11,undefined])test(`movement return ${code} with supplied stay never resets stall or retries`,async t=>{
    const w=await adoptionFlow(t);w.step(1);w.returns.set('bow1',code);
    for(let tick=2;tick<=5;tick++){
        const d=w.step(tick);assert.equal(d.startedAt,1);
        const attempts=w.logs.filter(r=>r.type==='action-attempt'&&r.actorId==='bow1'&&r.method==='move');
        assert(attempts.every(a=>a.returnCode===(code??null)));
        assert.equal(w.actor('bow1').x,25);assert.equal(w.actor('bow1').y,19);
    }
    assert.equal(w.d.reason,'no-displacement');assert.equal(w.d.phase,'finished');
    assert.equal(w.requests.filter(r=>r.diagnostic).length,2);
});

test('adopted suffix reuse follows observed nodes; off-path/stale metadata uses the ordinary capped refresh',async t=>{
    const w=await adoptionFlow(t);w.step(1);w.step(2);w.observe(departing(w).filter(c=>c.id==='bow1'));
    const d=w.step(3),report=w.livePlan.state.routeControl.cache.find(r=>r.actorId==='bow1');
    assert.equal(d.cacheHits,4);assert.equal(d.queries,0);assert.equal(report.searchedAt,2);
    assert.deepEqual(report.from,{x:26,y:18});assert.deepEqual(report.path[0],{x:27,y:18});
    for(const fault of ['off-path','stale']){
        const a=await adoptionFlow(t);a.step(1);a.step(2);
        const r=a.comparison.mission.state.routeControl.cache.find(r=>r.actorId==='bow1');
        if(fault==='off-path'){r.from={x:99,y:99};r.path=[{x:44,y:20}];}
        else r.searchedAt=-10;
        const next=a.step(3);assert.equal(next.queries,4);assert.equal(next.routeProbe,undefined);
        assert.equal(a.requests.filter(r=>r.diagnostic).length,2);
        assert(a.livePlan.state.routeControl.cache.every(r=>r.searchedAt===3));
    }
});

test('no conflict and current injury skip without allowance; cancellation retains real healing',async t=>{
    const no=await adoptionFlow(t,{mode:'no-conflict'});no.step(1);no.step(2);
    assert.equal(no.d.probeEligibility.first,'no-conflict');assert.deepEqual(no.d.routeAdoption,[0,null,null,null]);
    assert.equal(no.comparisonEvaluations,0);assert.equal(no.probeArgs.state.spent,false);
    const traces=[];
    for(const adoption of [false,true]){
        const w=await adoptionFlow(t,{adoption});w.step(1);w.actor('bow1').hits-=100;w.step(2);
        assert.equal(w.d.phase,'finished');assert.equal(w.requests.filter(r=>r.diagnostic).length,0);
        assert(w.calls.some(c=>c.id==='medic'&&c.method==='heal'&&c.target==='bow1'));
        traces.push(structuredClone(w.calls));
    }
    assert.deepEqual(traces[0],traces[1]);
});

test('absolute deadline and observed ownership termination release without adoption or further searches',async t=>{
    for(const event of ['timeout','captured']){
        const w=await adoptionFlow(t);w.step(1);w.step(2);const before=w.requests.length;
        if(event==='captured')w.flags.find(f=>f.id==='east').my=true;
        // Supplied ownership, not a claim of generated arrival or Arena capture.
        const tick=event==='timeout'?61:3;assert.equal(w.step(tick).reason,event);
        assert.equal(w.requests.length,before);assert.equal(w.d.phase,'finished');
        for(let i=1;i<=5;i++){
            w.step(tick+i);assert.equal(w.d.phase,'finished');
            assert(!w.logs.some(r=>r.type==='action-decision'&&/^(opening-centre|capture-route)-/.test(r.reason)));
        }
    }
});

test('duplicate/late ticks cannot replenish pair; genuine match reset can',async t=>{
    const w=await adoptionFlow(t);w.step(1);w.step(2);w.step(2);w.step(3);w.step(2);
    assert.equal(w.requests.filter(r=>r.diagnostic).length,2);assert.equal(w.probeArgs.state.spent,true);
    w.step(1);assert.equal(w.probeArgs.state.spent,false);w.step(2);
    assert.equal(w.requests.filter(r=>r.diagnostic).length,4);assert.deepEqual(w.d.routeAdoption,[1,2,2,4]);
});

test('actor-order/roster replacement during a pair invalidates frozen proofs before commands',async t=>{
    for(const kind of ['reorder','replace']){
        const w=await adoptionFlow(t);w.step(1);
        w.afterSearch=({extra})=>{if(extra){
            if(kind==='reorder')w.captured.observation.myCreeps.reverse();
            else w.captured.observation.myCreeps=w.captured.observation.myCreeps.map(c=>({...c}));
        }};
        const d=w.step(2);assert.equal(d.routeAdoption[0],7);assert.equal(w.comparison.moves,null);
        assert(!w.logs.some(r=>r.type==='action-decision'&&/^(opening-centre|capture-route)-/.test(r.reason)));
    }
});

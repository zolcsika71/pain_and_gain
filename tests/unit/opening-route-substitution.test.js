// Explicit generated-only suite. No eager retained/historical payload readers.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {publish} from '../../tools/retrieval-files.js';
import {compareSubstitution,substitutionWorld,checkedFrame,substituteOnce,observedPaths,decodePath}
    from '../fixtures/opening-route-substitution.js';
import {supplySteps} from '../fixtures/opening-occupancy-api-world.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';

const results={};
after(()=>{
    if(process.env.PAIN_GAIN_SUBSTITUTION_OUTPUT)
        publish(path.join(process.env.PAIN_GAIN_SUBSTITUTION_OUTPUT,'generated-results.json'),
            Buffer.from(JSON.stringify(results,null,2)+'\n'));
});
const at=(arm,tick)=>arm.frames.find(f=>f.tick===tick),last=arm=>arm.frames.at(-1);
const actor=(row,id)=>row.positions.find(c=>c.id===id);
const point=p=>({x:p.x,y:p.y});
function invariants(run){
    for(const f of run.frames){
        assert(f.diagnostic.queries<=(f.tick===1?24:4));assert.equal(f.substitutionQueries,0);
        assert.equal(run.requests.filter(r=>r.tick===f.tick).length,f.diagnostic.queries);
        assert.equal(f.diagnostic.reportedOps,f.diagnostic.queries*100);
        assert(f.diagnostic.queries+f.referencePairQueries<=(f.tick===1?24:4));
        if(f.selection?.startedAt!==undefined)assert.equal(f.diagnostic.startedAt??f.selection.startedAt,1);
        else {assert.equal(f.tick,1);assert.equal(f.diagnostic.phase,'finished');}
        assert(f.cache.every(r=>r.path.length<=40));
        assert((f.diagnostic.travel?.examined??0)<=16);
        if(f.suppliedNext)for(const c of f.suppliedNext){
            const old=actor(f,c.id);if(c.x===old.x&&c.y===old.y)continue;
            assert(f.commands.some(a=>a.id===c.id&&a.x===c.x&&a.y===c.y));
        }
    }
}
test('generated prelude reaches the observed local geometry; single insertion changes only sampled report',()=>{
    const r=results.favorable=compareSubstitution();Object.values(r).forEach(invariants);
    for(let tick=1;tick<=5;tick++)assert.deepEqual(at(r.baseline,tick).positions,at(r.substitution,tick).positions);
    const f=at(r.substitution,5);assert.equal(f.insertion.inserted,true);assert.equal(f.insertion.searchedAt,5);
    assert.equal(f.insertion.previousSearchedAt,1);assert(f.insertion.others.every(r=>r.searchedAt===1));
    assert.deepEqual(point(actor(f,'medic')),{x:14,y:13});assert.deepEqual(point(actor(f,'bow1')),{x:15,y:15});
    assert.deepEqual(point(actor(f,'bow2')),{x:11,y:15});assert.deepEqual(point(actor(f,'guardR2')),{x:16,y:15});
    assert.equal(at(r.baseline,5).commands.length,1);assert.equal(f.commands.length,3);
    assert.equal(f.diagnostic.queries,0);assert.equal(f.diagnostic.cacheHits,4);
    assert.equal(f.referencePairQueries,2);assert.equal(f.referencePairOps,196);
});
test('cache age is not rejuvenated: original peers force ordinary four-query refresh at6',()=>{
    const r=results.favorable;
    for(const arm of Object.values(r)){
        const f=at(arm,6);assert.equal(f.diagnostic.queries,4);
        assert.equal(f.cache.length,4);assert(f.cache.every(r=>r.searchedAt===6));
        assert.equal(f.referencePairQueries,0);
    }
});
test('favorable supplied outcomes retain actual progress separately from command returns',t=>{
    const r=results.favorable;
    for(const arm of Object.values(r))for(const f of arm.frames){
        assert(f.returns.every(r=>r.returnCode===0));
        if(f.suppliedNext)for(const c of f.commands)assert.deepEqual(point(f.suppliedNext.find(a=>a.id===c.id)),point(c));
    }
    const summary=Object.fromEntries(Object.entries(r).map(([key,arm])=>[key,{
        end:last(arm).tick,reason:last(arm).diagnostic.reason,calls:arm.frames.reduce((n,f)=>n+f.commands.length,0),
        sampled:last(arm).positions.find(c=>c.id==='bow1'),queries:arm.requests.length}]));
    assert.equal(last(r.baseline).tick,16);assert.equal(last(r.baseline).diagnostic.reason,'no-displacement');
    assert.equal(last(r.substitution).tick,13);assert.equal(last(r.substitution).diagnostic.reason,'objective-unavailable');
    const start=at(r.substitution,5),end=last(r.substitution);
    const distance=c=>Math.max(Math.abs(c.x-13),Math.abs(c.y-49));
    for(const id of ['medic','bow1','bow2','guardR2'])assert(distance(actor(end,id))<distance(actor(start,id)));
    assert(r.substitution.frames.filter(f=>f.tick>=5&&f.commands.length>0).length>=8);
    assert.equal(summary.baseline.calls,27);assert.equal(summary.substitution.calls,47);
    assert.equal(r.substitution.blockedDeclarations[0].tick,13);
    assert.equal(r.substitution.blockedDeclarations[0].actorId,'bow2');
    t.diagnostic(JSON.stringify(summary));
});
for(const scenario of ['partial','rejected','unknown','no-displacement','renewed','lost-heal','off-path','incomplete-refresh','occupied-alternative'])
    test(`${scenario}: retain supplied outcomes, support gates, accounting and original termination`,t=>{
        const r=results[scenario]=compareSubstitution({scenario});Object.values(r).forEach(invariants);
        t.diagnostic(JSON.stringify(Object.fromEntries(Object.entries(r).map(([key,arm])=>[key,{
            end:last(arm).tick,reason:last(arm).diagnostic.reason,calls:arm.frames.reduce((n,f)=>n+f.commands.length,0),
            sampled:last(arm).positions.find(c=>c.id==='bow1'),queries:arm.requests.length}]))));
        if(scenario==='no-displacement'){
            assert.equal(last(r.baseline).tick,last(r.substitution).tick);
            assert.equal(last(r.substitution).diagnostic.reason,'no-displacement');
            for(const arm of Object.values(r))for(const f of arm.frames.filter(f=>f.tick>=5&&f.suppliedNext))
                assert.deepEqual(f.suppliedNext,f.positions);
        }
        if(['rejected','unknown'].includes(scenario)){
            for(const f of r.substitution.frames.filter(f=>f.tick>=5)){
                assert(f.returns.filter(c=>c.actorId==='bow1').every(c=>c.returnCode===(scenario==='rejected'?-11:null)));
                if(f.suppliedNext)assert.deepEqual(point(f.suppliedNext.find(c=>c.id==='bow1')),point(actor(f,'bow1')));
            }
            assert.equal(last(r.baseline).tick,16);assert.equal(last(r.substitution).tick,6);
            assert.equal(last(r.substitution).diagnostic.reason,'objective-unavailable');
            assert.deepEqual(r.substitution.blockedDeclarations,[{tick:6,actorId:'bow1',blocked:{x:16,y:16}}]);
        }
        if(scenario==='off-path'){
            assert.equal(at(r.substitution,5).insertion.inserted,false);
            assert.equal(at(r.substitution,5).insertion.reason,'stale-or-off-path');
            assert.equal(at(r.substitution,5).diagnostic.queries,4);
        }
        if(scenario==='partial'){
            assert.equal(last(r.baseline).tick,9);assert.equal(last(r.substitution).tick,10);
            assert.equal(last(r.substitution).diagnostic.reason,'no-displacement');
            assert.deepEqual(point(actor(last(r.substitution),'bow1')),{x:15,y:16});
            for(const f of r.substitution.frames.filter(f=>f.tick>=6&&f.suppliedNext))
                assert.deepEqual(f.suppliedNext,f.positions);
        }
        if(scenario==='renewed'){
            assert.equal(last(r.substitution).tick,18);assert.equal(last(r.substitution).diagnostic.reason,'no-displacement');
            assert(r.substitution.frames.some(f=>f.holds.filter(a=>a.holdReason==='converging').length>=2));
        }
        if(scenario==='lost-heal')for(const arm of Object.values(r)){
            assert.equal(last(arm).tick,7);assert.equal(last(arm).diagnostic.reason,'squad-unavailable');
        }
        if(scenario==='incomplete-refresh'){
            assert.equal(last(r.substitution).tick,6);assert.equal(last(r.substitution).diagnostic.reason,'objective-unavailable');
        }
        if(scenario==='occupied-alternative'){
            for(const arm of Object.values(r)){
                assert.equal(last(arm).tick,1);assert.equal(last(arm).diagnostic.reason,'no-useful-objective');
                assert.equal(last(arm).diagnostic.queries,4);assert.equal(last(arm).commands.length,0);
                assert.equal(arm.shot.spent,false);
            }
        }
    });

function beforeInsertion(){
    const w=substitutionWorld();
    for(let tick=1;tick<=4;tick++){
        const f=checkedFrame(w);assert.equal(f.plan.state.phase,'active');
        supplySteps(w,f,f.calls.filter(c=>c.method==='move'&&w.group().memberIds.includes(c.id)).map(c=>c.id));
    }
    return w;
}
test('one shot cannot repeat after insertion; disabled transport leaves state byte-equivalent',()=>{
    const w=beforeInsertion(),shot={spent:false},before=JSON.stringify(w.state);
    assert.equal(substituteOnce(w,shot,{enabled:false}).reason,'baseline');
    assert.equal(JSON.stringify(w.state),before);assert.equal(shot.spent,false);
    assert.equal(substituteOnce(w,shot).inserted,true);const inserted=JSON.stringify(w.state);
    assert.equal(substituteOnce(w,shot).reason,'spent');assert.equal(JSON.stringify(w.state),inserted);
    assert.deepEqual(w.state.routeControl.cache.find(r=>r.actorId==='bow1').path,decodePath(observedPaths.alternative));
});
test('explicit stale-cache metadata fault skips substitution and ordinary refresh remains bounded',()=>{
    const w=beforeInsertion(),cache=w.state.routeControl.cache;
    w.state={...w.state,routeControl:{...w.state.routeControl,cache:cache.map((r,i)=>i? r:{...r,searchedAt:0})}};
    const shot={spent:false};assert.equal(substituteOnce(w,shot).reason,'stale-or-off-path');
    const f=checkedFrame(w);assert.equal(f.plan.diagnostic.queries,4);
    assert(w.state.routeControl.cache.every(r=>r.searchedAt===5));assert.equal(substituteOnce(w,shot).reason,'spent');
});
test('invalid replacement endpoints/coordinates/lengths still pass through production rejection, not movement',()=>{
    for(const path of [decodePath(observedPaths.alternative).slice(0,-1),[{x:NaN,y:16}],Array(41).fill({x:15,y:16})]){
        const w=beforeInsertion();substituteOnce(w,{spent:false},{path});
        const f=checkedFrame(w);assert.equal(f.plan.state.phase,'finished');
        assert(!f.calls.some(c=>c.method==='move'));assert.equal(f.plan.diagnostic.queries,0);
    }
});
test('priority cancellation releases before commands; post-release executor remains ordinary baseline',()=>{
    const w=beforeInsertion();substituteOnce(w,{spent:false});
    const extra={escort:{healerId:'medic',allyId:'bow1'}},f=checkedFrame(w,extra);
    assert.equal(f.plan.state.phase,'finished');assert.match(f.plan.diagnostic.reason,/movement-priority/);
    assert.equal(f.plan.moves,null);const actual=f.calls;
    w.calls=[];moveCreeps(w.myCreeps,w.enemies,w.centre,new Map(),new Map(),extra.escort,null,null,false,null,w.spacing);
    executeTactics(w.myCreeps,w.enemies,w.myCreeps.filter(c=>c.hits<c.hitsMax),null,{...w,creeps:w.spacing.creeps});
    assert.deepEqual(w.calls,actual);
});
test('generated injury/contact observation retains real ranged healing/attacks after cancellation',()=>{
    const w=beforeInsertion();substituteOnce(w,{spent:false});
    w.actor('bow1').hits-=100;Object.assign(w.enemies[0],{x:16,y:17});
    const f=checkedFrame(w);assert.equal(f.plan.state.phase,'finished');assert.equal(f.plan.moves,null);
    assert(f.calls.some(c=>c.method==='rangedHeal'&&c.id==='medic'&&c.target==='bow1'));
    assert(f.calls.some(c=>c.method==='rangedAttack'&&c.id==='bow1'));
    assert(!f.calls.some(c=>c.method==='heal'&&c.id==='medic'));
});
test('absolute original deadline still ends at61 without a search or ownership extension',()=>{
    const w=beforeInsertion();substituteOnce(w,{spent:false});const f=checkedFrame(w);
    supplySteps(w,f,f.calls.filter(c=>c.method==='move'&&w.group().memberIds.includes(c.id)).map(c=>c.id));
    // Explicit later unchanged observation: no claim about omitted ticks6–60.
    w.tick=61;w.bind();const terminal=checkedFrame(w);
    assert.equal(terminal.plan.diagnostic.reason,'timeout');assert.equal(terminal.plan.diagnostic.queries,0);
    assert.equal(w.state.selection.startedAt,1);assert.equal(terminal.plan.moves,null);
});

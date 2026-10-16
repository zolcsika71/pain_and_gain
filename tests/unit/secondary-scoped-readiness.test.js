import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSecondaryObjective as baseline, secondaryObjectiveLimits as limits} from '../../src/strategy/objectives.js';
import {contestReadiness} from '../../src/strategy/supported-contest.js';
import {selectMovementPlan} from '../../src/tactics/movement.js';
import {selectHealingDecision} from '../../src/tactics/healing.js';
import {prepareSecondaryMovement} from '../../src/arena/execute.js';
import {only, reports, presetFixture, transform, range} from '../fixtures/secondary-generated-world.js';
import {scopedSelect as candidate, scopedLimits, productionSource, candidateSource,
    baselineHealthGate, scopedHealthGate, scopedContestReadiness} from '../fixtures/secondary-scoped-health-candidate.js';

const actor=(w,id)=>w.myCreeps.find(c=>c.id===id);
function world(){
    const w=presetFixture();
    // Both scouts are outside production's retained-defence set. All 14 actors
    // remain present; existing squad binding and every other position persist.
    Object.assign(actor(w,'scout1'),{x:10,y:10});Object.assign(actor(w,'scout2'),{x:11,y:10});
    return only(w,'east');
}
function unrelated(){const w=world();actor(w,'scout1').hits--;return w;}
const damageParts=(c,type)=>c.body.forEach(p=>{if(p.type===type)p.hits=0;});
function observedMethods(w){
    let commands=0;
    for(const c of [...w.myCreeps,...w.enemies]){
        c.getRangeTo=function(p){return range(this,p);};c.move=()=>{commands++;return 0;};
    }
    return ()=>commands;
}

test('test-only variant changes only health scope; baseline and all finite limits stay intact',()=>{
    assert.equal(candidateSource.replace(scopedHealthGate,baselineHealthGate),productionSource);
    assert.deepEqual(scopedLimits,limits);
    const w=world(),before=structuredClone(w);
    assert.equal(w.myCreeps.length,14);assert.equal(w.enemies.length,14);
    assert.equal(baseline(w).reason,'selected');assert.deepEqual(candidate(w),baseline(w));assert.deepEqual(w,before);
});

test('one or multiple genuinely remote injuries alone change rejection to the identical healthy-world selection',()=>{
    for(const ids of [['scout1'],['scout1','scout2']]){
        const w=world(),healthy=baseline(w);for(const id of ids)actor(w,id).hits--;
        const before=structuredClone(w),b=baseline(w),c=candidate(w);
        assert.equal(b.reason,'army-injured');assert.equal(b.work.candidates,0);
        assert.equal(c.reason,'selected');assert.deepEqual(c,healthy);assert.deepEqual(w,before);
        // No selected or retained healer has even a ranged healing opportunity
        // or an approach request to either injured remote actor at this snapshot.
        const commands=observedMethods(w);
        for(const h of w.myCreeps.filter(c=>c.body.some(p=>p.type==='heal'&&p.hits>0))){
            assert.equal(selectHealingDecision(h,w.myCreeps).action,null);
            assert.equal(selectMovementPlan(h,w.enemies,w.flags[0],null,w.myCreeps).reason,'flag-fallback');
        }
        assert.equal(commands(),0);
    }
});

test('any departing actor injury remains decisive, including its weapon and required healer',()=>{
    for(const id of world().squad.memberIds){
        const w=unrelated();actor(w,id).hits--;
        assert.equal(baseline(w).reason,'army-injured');assert.equal(candidate(w).reason,'army-injured');
    }
});

test('scope is independent of outsider role; the remaining original defence must still qualify',()=>{
    for(const id of ['scout1','guardM0','guardR0','guardH2']){
        const w=world();Object.assign(actor(w,id),{x:12,y:11});const healthy=baseline(w);
        assert.equal(healthy.reason,'selected');actor(w,id).hits--;
        assert.equal(baseline(w).reason,'army-injured');assert.deepEqual(candidate(w),healthy);
    }
});

test('later remote injury changes only global-health cancellation, not active binding or original deadline',()=>{
    const w=world(),first=baseline(w);w.tick++;only(w,'east');const healthy=baseline(w,first.state);
    actor(w,'scout1').hits--;assert.equal(baseline(w,first.state).reason,'army-injured');
    const retained=candidate(w,first.state);assert.equal(retained.reason,'retained');assert.deepEqual(retained,healthy);
    assert.equal(retained.state.startedAt,first.state.startedAt);assert.deepEqual(retained.state.memberIds,first.state.memberIds);
});

test('all original retained defenders remain health-relevant; no healthier subset is substituted',()=>{
    const w=unrelated(),centre=w.flags[0];
    const retained=w.myCreeps.filter(c=>!w.squad.memberIds.includes(c.id)&&range(c,centre)<=limits.defenderRange);
    assert.equal(retained.length,8);
    for(const c of retained){const copy=structuredClone(w);actor(copy,c.id).hits--;
        assert.equal(candidate(copy).reason,'army-injured',c.id);}
    // Even an unarmed actor, surplus to the two-weapon quorum, stays relevant
    // when it belongs to the unchanged positional retained-defence set.
    Object.assign(actor(w,'scout2'),{x:38,y:38});actor(w,'scout2').hits--;
    assert.equal(candidate(w).reason,'army-injured');
});

test('membership boundary is exactly production defence radius, including an unavailable outsider',()=>{
    for(const [x,expected]of [[37,'army-injured'],[36,'selected']]){
        const w=unrelated();Object.assign(actor(w,'scout1'),{x,y:40});
        assert.equal(candidate(w).reason,expected);
    }
    const w=unrelated();Object.assign(actor(w,'scout1'),{x:38,y:38});w.unavailableIds=['scout1'];
    // Existing defence excludes unavailable actors. Never use one to satisfy
    // quorum; other healthy retained defenders still satisfy it here.
    assert.equal(candidate(w).reason,'selected');
});

const safetyCases=[
    ['centre danger','local-combat',w=>Object.assign(w.enemies[3],{x:40,y:44})],
    ['departing danger','local-combat',w=>Object.assign(w.enemies[3],{x:46,y:43})],
    ['selected HEAL lost','squad-unavailable',w=>damageParts(actor(w,'medic'),'heal')],
    ['selected weapon lost','squad-unavailable',w=>damageParts(actor(w,'bow1'),'ranged_attack')],
    ['selected MOVE lost','squad-unavailable',w=>damageParts(actor(w,'bow1'),'move')],
    ['selected fatigue','squad-unavailable',w=>actor(w,'bow1').fatigue=1],
    ['selected owned elsewhere','squad-unavailable',w=>w.unavailableIds=['medic']],
    ['selected healing inaccessible','support-unavailable',w=>Object.assign(actor(w,'medic'),{x:46,y:47})],
    ['retained HEAL lost','defence-unavailable',w=>{damageParts(actor(w,'guardH1'),'heal');damageParts(actor(w,'guardH2'),'heal');}],
    ['retained weapons lost','defence-unavailable',w=>w.myCreeps.filter(c=>!w.squad.memberIds.includes(c.id)).forEach(c=>{damageParts(c,'attack');damageParts(c,'ranged_attack');})],
    ['retained heal access lost','defence-unavailable',w=>{
        ['guardM0','guardM1','guardM2','guardR0','guardR1','guardR2'].forEach((id,i)=>Object.assign(actor(w,id),{x:37,y:37+i}));
        Object.assign(actor(w,'guardH1'),{x:43,y:40});Object.assign(actor(w,'guardH2'),{x:43,y:41});}],
];
for(const [name,reason,change]of safetyCases)test(`unrelated injury cannot bypass ${name}`,()=>{
    const w=unrelated();change(w);only(w,'east');
    assert.equal(candidate(w).reason,reason);assert.equal(candidate(w).evaluation,null);
    const healthy=structuredClone(w);actor(healthy,'scout1').hits=actor(healthy,'scout1').hitsMax;
    assert.equal(baseline(healthy).reason,reason);
});

test('existing defence quorum cannot use unavailable or remote defenders even if healthy',()=>{
    for(const mode of ['unavailable','remote']){
        const w=unrelated(),defenders=w.myCreeps.filter(c=>!w.squad.memberIds.includes(c.id)&&c.id.startsWith('guard'));
        if(mode==='unavailable')w.unavailableIds=defenders.map(c=>c.id);
        else defenders.forEach((c,i)=>Object.assign(c,{x:20+i,y:20}));
        assert.equal(candidate(w).reason,'defence-unavailable');
    }
});

test('arrival margin, occupancy, safe paths and route shape limits remain decisive',()=>{
    for(const [reason,change]of [
        ['no-useful-objective',w=>w.routes.pop()],
        ['no-useful-objective',w=>w.routes[0].incomplete=true],
        ['no-useful-objective',w=>w.routes[0].tick--],
        ['no-useful-objective',w=>w.routes[0].from.x++],
        ['no-useful-objective',w=>w.routes[0].path[0]={x:1,y:1}],
        ['no-useful-objective',w=>Object.assign(w.enemies[0],{x:49,y:47})],
        ['no-useful-objective',w=>Object.assign(w.enemies[12],{x:56,y:42})],
        ['no-useful-objective',w=>{const steps=Math.max(...w.routes.map(r=>r.path.length));Object.assign(w.enemies[12],{x:56+steps+limits.arrivalMargin,y:42});}],
        ['unsupported-observation',w=>w.routes[0].path=Array(41).fill({x:0,y:0})],
        ['unsupported-observation',w=>w.routes[0].ops=5001],
        ['no-useful-objective',w=>{w.tick=1990;only(w,'east');}],
    ]){
        const w=unrelated();change(w);assert.equal(candidate(w).reason,reason);
        actor(w,'scout1').hits=actor(w,'scout1').hitsMax;assert.equal(baseline(w).reason,reason);
    }
});

test('ownership and capacity utility arithmetic are unchanged after health admission',()=>{
    for(const owner of [true,false,undefined]){
        const w=world();w.flags.find(f=>f.id==='east').my=owner;const healthy=baseline(w);
        actor(w,'scout1').hits--;assert.deepEqual(candidate(w),healthy);
        if(owner!==true){assert.equal(healthy.reason,'selected');assert.equal(healthy.evaluation.deniedIncome,owner===false?3:0);}
    }
    const w=unrelated();w.flags[0].my=false;assert.equal(candidate(w).reason,'centre-not-owned');
});

test('missing and malformed observations remain unknown, never declared unrelated and ignored',()=>{
    for(const change of [w=>w.observationComplete=false,w=>actor(w,'scout1').hits=NaN,
        w=>delete actor(w,'scout1').hits,w=>actor(w,'scout1').hitsMax=0,w=>actor(w,'scout1').x=undefined,
        w=>actor(w,'scout1').body=null,w=>actor(w,'scout1').body[0].hits=Infinity,
        w=>actor(w,'scout1').id='medic',w=>w.flags[1].my=null,w=>w.routes[0].ops=undefined]){
        const w=unrelated();change(w);assert.equal(baseline(w).reason,'unsupported-observation');
        assert.equal(candidate(w).reason,'unsupported-observation');
    }
});

test('ownership changes, later relevant injury and danger finish the same attempt without reacquisition',()=>{
    for(const [reason,change]of [
        ['captured',w=>w.flags.find(f=>f.id==='east').my=true],
        ['ownership-changed',w=>w.flags.find(f=>f.id==='east').my=false],
        ['centre-not-owned',w=>w.flags[0].my=false],
        ['army-injured',w=>actor(w,'guardH1').hits--],
        ['army-injured',w=>Object.assign(actor(w,'scout1'),{x:38,y:38})],
        ['local-combat',w=>Object.assign(w.enemies[3],{x:40,y:44})],
    ]){
        const w=unrelated(),first=candidate(w);assert.equal(first.reason,'selected');w.tick++;change(w);only(w,'east');
        const stopped=candidate(w,first.state);assert.equal(stopped.reason,reason);assert.equal(stopped.state.phase,'finished');
        const fresh=unrelated();fresh.tick=w.tick+1;only(fresh,'east');
        assert.equal(candidate(fresh,stopped.state).state.phase,'finished');
    }
});

test('remote injury adds no waiting, deadline extension or second attempt',()=>{
    const w=unrelated();let result=candidate(w);const first=result.state;
    assert.equal(candidate(w,first).state.unchanged,0);
    for(let n=1;n<=limits.unchanged;n++){w.tick++;only(w,'east');result=candidate(w,result.state);
        assert.equal(result.reason,n===limits.unchanged?'no-displacement':'retained');assert.equal(result.state.startedAt,first.startedAt);}
    w.tick=first.startedAt+limits.lifetime;only(w,'east');assert.equal(candidate(w,first).reason,'timeout');
    assert.equal(candidate(w,result.state).state.phase,'finished');
    w.tick=1;only(w,'east');assert.equal(candidate(w,result.state).reason,'selected');
});

test('renaming, ordering, rotation and mirrored geometry preserve decisions and costs',()=>{
    for(const scenario of ['healthy','unrelated','relevant-injury','danger']){
        const injured=scenario!=='healthy',w=injured?unrelated():world();
        if(scenario==='relevant-injury')actor(w,'guardH1').hits--;
        if(scenario==='danger')Object.assign(w.enemies[3],{x:40,y:44});
        reports(w);const expected=candidate(w);
        for(const options of [{rename:true},{reverse:true},{mirror:'x'},{mirror:'y'},{mirror:true},{rename:true,mirror:true,reverse:true}]){
            const altered=transform(w,options),actual=candidate(altered);
            assert.equal(actual.reason,expected.reason);assert.equal(actual.objectiveId,expected.objectiveId);
            assert.deepEqual(actual.evaluation,expected.evaluation);assert.deepEqual(actual.work,expected.work);
            assert.equal(baseline(altered).reason,injured?'army-injured':expected.reason);
        }
        for(let n=1;n<=14;n++){
            const rotated=structuredClone(w);for(const list of [rotated.myCreeps,rotated.enemies,rotated.flags,rotated.routes,rotated.squad.memberIds])list.push(...list.splice(0,n%list.length));
            assert.deepEqual(candidate(rotated),expected);
        }
    }
});

test('shared contest readiness inherits only scoped health and preserves its extra role quorum',()=>{
    const w=unrelated();w.squad.memberIds=['medic','bow1','bow2'];only(w,'east');
    assert.equal(contestReadiness(w),'army-injured');assert.equal(scopedContestReadiness(w),null);
    actor(w,'guardH1').hits--;assert.equal(scopedContestReadiness(w),'army-injured');
    actor(w,'guardH1').hits++;w.squad.memberIds.push('blade');only(w,'east');
    assert.equal(scopedContestReadiness(w),'contest-support-quorum');
});

test('positional non-membership does not override healing work or higher-priority capture movement',()=>{
    for(const x of [44,46]){
        const w=unrelated();Object.assign(actor(w,'scout1'),{x,y:44});const commands=observedMethods(w);
        assert.equal(candidate(w).reason,'selected');const healer=actor(w,'medic');
        const plan=selectMovementPlan(healer,w.enemies,w.flags[0],null,w.myCreeps);
        assert.equal(plan.reason,x===44?'injured-ally-in-range':'injured-ally-approach');
        const healing=selectHealingDecision(healer,w.myCreeps);
        assert.equal(healing.action?.method??null,x===44?'rangedHeal':null);
        let cancelled=null;const secondary={movement:{kind:'capture',memberIds:w.squad.memberIds,
            steps:new Map(w.routes.map(r=>[r.actorId,r.path[0]]))},cancel:reason=>{cancelled=reason;return{reason};}};
        const prepared=prepareSecondaryMovement(secondary,w.myCreeps,w.enemies,w.flags[0],new Map(),null,null,
            {creeps:[...w.myCreeps,...w.enemies],terrainAt:()=>0});
        assert.equal(cancelled,'capture-movement-priority');assert.equal(prepared.moves,null);assert.equal(commands(),0);
    }
});

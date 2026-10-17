// Generated-only selector checks; historical payload cases have their own entry point.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectFlag, selectSecondaryObjective as select, secondaryObjectiveLimits as limits} from '../../src/strategy/objectives.js';
import {unit, fixture, reports, only, presetFixture, transform} from '../fixtures/secondary-generated-world.js';

function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze);}return v;}

test('full preset scoring deficit reaches ranking with independently normalized capacity arithmetic',()=>{
    const w=only(presetFixture(),'east');
    assert.equal(w.myCreeps.length,14);assert.equal(w.enemies.length,14);
    assert.equal(w.flags.filter(f=>f.my===true).reduce((n,f)=>n+f.scorePerTick,0),5);
    assert.equal(w.flags.filter(f=>f.my===false).reduce((n,f)=>n+f.scorePerTick,0),17);
    const neutral=select(w);assert.equal(neutral.reason,'selected');
    const e=neutral.evaluation,L=Math.max(...w.routes.map(r=>r.path.length));
    // Base HP/tick: 4*8*30 ATTACK + 5*6*10 RANGED + 3*6*12 HEAL.
    assert.equal(e.ownCapacityLoss,192);assert.equal(e.enemyCapacityRelief,0);
    assert.equal(e.captureIncome,3);assert.equal(e.deniedIncome,0);
    assert(Math.abs(e.utility-3/(L+1)*(1-192/1476))<1e-12);
    w.flags.find(f=>f.id==='east').my=false;
    const enemyOwned=select(w);assert.equal(enemyOwned.reason,'selected');
    assert.equal(enemyOwned.evaluation.deniedIncome,3);assert.equal(enemyOwned.evaluation.enemyCapacityRelief,192);
    // Enemy owns both of each secondary family: 576+180+108=864 HP/tick.
    assert(Math.abs(enemyOwned.evaluation.utility-6/(L+1)*(1-192/1476)/(1+192/864))<1e-12);
});

test('full preset positive utility cannot bypass centre danger, lost support or an unarmed arrival competitor',()=>{
    for(const [expected,change]of [
        ['local-combat',w=>Object.assign(w.enemies[3],{x:40,y:44})],
        ['squad-unavailable',w=>w.myCreeps.find(c=>c.id==='medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
        ['support-unavailable',w=>Object.assign(w.myCreeps.find(c=>c.id==='medic'),{x:46,y:46})],
        ['no-useful-objective',w=>Object.assign(w.enemies[12],{x:55,y:42})],
    ]){
        const w=only(presetFixture(),'east');assert.equal(select(w).reason,'selected');change(w);
        const rejected=select(w);assert.equal(rejected.reason,expected);assert.equal(rejected.evaluation,null);
    }
});

test('full preset route exclusions leave another candidate usable and missing or oversized reports stay conservative',()=>{
    const w=only(presetFixture(),'east');
    // Other flag reports are absent, as after candidate-local exclusion.
    assert.equal(select(w).objectiveId,'east');assert.equal(select(w).work.candidates,6);
    const missing=structuredClone(w);missing.routes.pop();assert.equal(select(missing).reason,'no-useful-objective');
    const oversized=structuredClone(w);oversized.routes[0].path=Array(41).fill({x:0,y:0});
    assert.equal(select(oversized).reason,'unsupported-observation');
    const incomplete=structuredClone(w);incomplete.routes[0].incomplete=true;
    assert.equal(select(incomplete).reason,'no-useful-objective');
});

test('full preset ownership transitions terminate rather than rerank an active attempt',()=>{
    for(const [owner,reason]of [[false,'ownership-changed'],[true,'captured']]){
        const w=only(presetFixture(),'east'),first=select(w);assert.equal(first.reason,'selected');
        w.tick++;w.flags.find(f=>f.id==='east').my=owner;only(w,'east');
        const stopped=select(w,first.state);assert.equal(stopped.reason,reason);assert.equal(stopped.state.phase,'finished');
        w.tick++;w.flags.find(f=>f.id==='east').my=undefined;only(w,'east');
        assert.equal(select(w,stopped.state).state.phase,'finished');
    }
});

test('full preset ranking is invariant to ordering, actor IDs, reflections and non-tied flag renaming',()=>{
    const w=reports(presetFixture()),expected=select(w);assert.equal(expected.reason,'selected');
    for(const options of [{rename:true},{reverse:true},{mirror:'x'},{mirror:'y'},{rename:true,mirror:true,reverse:true}]){
        const actual=select(transform(w,options));assert.equal(actual.objectiveId,expected.objectiveId);
        assert.deepEqual(actual.evaluation,expected.evaluation);
    }
    const renamed=structuredClone(w),rename=s=>`flag-${s}`;
    renamed.flags.forEach(f=>{f.id=rename(f.id);});renamed.centreId=rename(renamed.centreId);
    renamed.routes.forEach(r=>{r.flagId=rename(r.flagId);});
    const actual=select(renamed);assert.equal(actual.objectiveId,rename(expected.objectiveId));
    assert.deepEqual(actual.evaluation,{...expected.evaluation,flagId:rename(expected.objectiveId)});
});

test('territorial deficit without combat: new pure selector finds income while live selector keeps centre',()=>{
    const w=reports(fixture());const before=structuredClone(w);freeze(w);
    assert.equal(selectFlag(w.flags).id,'centre');assert.equal(w.flags.filter(f=>f.my===true).reduce((n,f)=>n+f.scorePerTick,0),5);
    const result=select(w);assert.equal(result.reason,'selected');assert.notEqual(result.objectiveId,w.centreId);
    assert.equal(result.centreId,w.centreId);assert.equal(result.state.memberIds.length,4);
    assert.deepEqual(w,before);assert(result.evaluation.utility>0);
});

test('neutral income and enemy income denial are distinct, including enemy combat relief',()=>{
    const w=only(fixture(),'east'),neutral=select(w).evaluation;
    assert.equal(neutral.captureIncome,3);assert.equal(neutral.deniedIncome,0);assert.equal(neutral.territorialSwing,3);
    assert.equal(neutral.enemyCapacityRelief,0);assert.equal(neutral.ownCapacityLoss,96);
    assert.equal(neutral.ownMultiplierBefore,1);assert.equal(neutral.ownMultiplierAfter,0.8);
    w.flags.find(f=>f.id==='east').my=false;const contested=select(w).evaluation;
    assert.equal(contested.territorialSwing,6);assert.equal(contested.deniedIncome,3);
    assert.equal(contested.enemyCapacityRelief,48);assert.equal(contested.enemyMultiplierBefore,0.6);assert.equal(contested.enemyMultiplierAfter,0.8);
    assert(contested.utility>neutral.utility&&contested.utility<neutral.utility*2);
});

test('all flag families account for whole-army nominal costs; route length changes ranking',()=>{
    const w=fixture();
    for(const [name,loss,score] of [['east',96,3],['near',36,3],['south',36,4]]){
        const result=select(only(w,name));assert.equal(result.evaluation.ownCapacityLoss,loss);assert.equal(result.evaluation.captureIncome,score);
    }
    only(w,'east');const short=select(w).evaluation;
    // A legal contiguous detour delays arrival; unchanged effect/income costs.
    w.routes.forEach(r=>{const p=r.from;r.path=[{x:p.x,y:p.y+1},{...p},...r.path];});
    const detour=select(w).evaluation;assert.equal(detour.maxSteps,short.maxSteps+2);assert(detour.utility<short.utility);
});

test('available army composition changes the preferred penalty family, not an opponent label',()=>{
    const w=fixture(),a=w.flags.find(f=>f.id==='east'),b=w.flags.find(f=>f.id==='near');
    Object.assign(b,{x:a.x,y:a.y+1,my:undefined});reports(w,[a,b]);
    assert.equal(select(w).objectiveId,'near'); // Less nominal capacity lost than ATTACK.
    for(const c of w.myCreeps){let kept=false;for(const p of c.body)if(p.type==='attack'){
        if(kept)p.type='tough';else kept=true;
    }}
    assert.equal(select(w).objectiveId,'east'); // Army now has much less melee capacity to lose.
});

test('nearby armed threats at centre, group, objective and route all fence departure',()=>{
    for(const pos of [{x:40,y:44},{x:45,y:43},{x:57,y:42},{x:49,y:47}]){
        const w=only(fixture(),'east');Object.assign(w.enemies[0],pos);
        const result=select(w);assert.equal(result.objectiveId,w.centreId);assert.notEqual(result.reason,'selected');
    }
    const w=only(fixture(),'east');w.enemies[0].x=57;w.enemies[0].y=42;
    w.enemies[0].body.forEach(p=>{if(p.type==='attack')p.hits=0;});
    // A weaponless competitor is still subject to the arrival/occupancy guard.
    assert.equal(select(w).objectiveId,w.centreId);
});

test('exact arrival-margin equality, occupancy and incomplete/unsafe/stale routes reject',()=>{
    const w=only(fixture(),'east'),steps=select(w).evaluation.maxSteps,goal=w.flags.find(f=>f.id==='east');
    w.enemies=[unit('competitor',goal.x+steps+5,goal.y,{},false)];
    assert.equal(select(w).reason,'no-useful-objective');w.enemies[0].x++;
    assert.equal(select(w).reason,'selected');
    for(const change of [w=>{w.enemies[0].x=56;w.enemies[0].y=42;},w=>w.routes.pop(),w=>w.routes[0].incomplete=true,
        w=>w.routes[0].tick--,w=>w.routes[0].from.x++,w=>w.routes[0].path.pop(),w=>w.routes[0].path[0]={x:0,y:0}]){
        const trial=only(fixture(),'east');change(trial);assert.equal(select(trial).objectiveId,trial.centreId);
    }
});

test('defence, support, health, fatigue, functioning roles and controller ownership are required',()=>{
    for(const change of [w=>w.myCreeps.find(c=>c.id==='guard2').body=[],w=>w.myCreeps.find(c=>c.id==='guardmedic').body=[],
        w=>w.myCreeps.find(c=>c.id==='medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;}),
        w=>{w.myCreeps[0].x=45;w.myCreeps[0].y=46;},w=>w.myCreeps[3].hits--,
        w=>w.myCreeps[0].fatigue++,w=>w.myCreeps[0].body.forEach(p=>{if(p.type==='move')p.hits=0;}),
        w=>w.unavailableIds=['medic'],w=>w.flags[0].my=false]){
        const w=only(fixture(),'east');change(w);assert.equal(select(w).objectiveId,w.centreId);
    }
});

test('retained centre weapons need actual heal access, not opposite sides of the centre radius',()=>{
    const w=only(fixture(),'east');
    Object.assign(w.myCreeps.find(c=>c.id==='guard1'),{x:37,y:40});
    Object.assign(w.myCreeps.find(c=>c.id==='guard2'),{x:37,y:39});
    Object.assign(w.myCreeps.find(c=>c.id==='guardmedic'),{x:43,y:40});
    assert.equal(select(w).reason,'defence-unavailable');
});

test('selection persists despite a better alternative; invalidation ends the attempt without oscillation',()=>{
    const w=only(fixture(),'east'),first=select(w);assert.equal(first.objectiveId,'east');
    for(let i=0;i<3;i++){
        w.tick++;w.myCreeps.filter(c=>w.squad.memberIds.includes(c.id)).forEach(c=>c.x++);reports(w);
        const retained=select(w,i? w.previous:first.state);assert.equal(retained.objectiveId,'east');assert.equal(retained.state.startedAt,50);w.previous=retained.state;
    }
    w.flags.find(f=>f.id==='east').my=false;w.tick++;reports(w);
    const ended=select(w,w.previous);assert.equal(ended.reason,'ownership-changed');assert.equal(ended.state.phase,'finished');
    w.tick++;reports(w);assert.equal(select(w,ended.state).objectiveId,'centre');
});

test('capture, centre/squad/target changes and threat/support loss invalidate, never retarget',()=>{
    const cases=[['captured',w=>w.flags.find(f=>f.id==='east').my=true],['centre-not-owned',w=>w.flags[0].my=false],
        ['binding-changed',w=>w.squad.id='other'],['target-binding-changed',w=>w.flags.find(f=>f.id==='east').x++],
        ['local-combat',w=>Object.assign(w.enemies[0],{x:40,y:44})],['squad-unavailable',w=>w.myCreeps[0].body=[]]];
    for(const [reason,change]of cases){const w=only(fixture(),'east'),first=select(w);w.tick++;change(w);only(w,'east');
        const result=select(w,first.state);assert.equal(result.reason,reason);assert.equal(result.state.phase,'finished');assert.equal(result.objectiveId,'centre');}
});

test('lost route or occupied objective ends an active attempt; enemy-to-neutral change is not silent replanning',()=>{
    for(const change of [w=>w.routes=[],w=>Object.assign(w.enemies[2],{x:56,y:42})]){
        const w=only(fixture(),'east'),first=select(w);w.tick++;only(w,'east');change(w);
        const ended=select(w,JSON.parse(JSON.stringify(first.state)));
        assert.equal(ended.reason,'objective-unavailable');assert.equal(ended.state.phase,'finished');
    }
    const w=only(fixture(),'east');w.flags.find(f=>f.id==='east').my=false;const first=select(w);
    w.tick++;w.flags.find(f=>f.id==='east').my=undefined;only(w,'east');assert.equal(select(w,first.state).reason,'ownership-changed');
});

test('bounded same-position wait, absolute timeout, same-tick calls and strict tick reset',()=>{
    const w=only(fixture(),'east');let result=select(w);const first=result.state;
    const repeated=select(w,first);assert.equal(repeated.state.unchanged,0);assert.equal(repeated.objectiveId,'east');
    for(let i=1;i<=4;i++){w.tick++;only(w,'east');result=select(w,result.state);assert.equal(result.reason,i===4?'no-displacement':'retained');}
    assert.equal(select(w,result.state).state.phase,'finished');
    w.tick=50+limits.lifetime;only(w,'east');assert.equal(select(w,first).reason,'timeout');
    w.tick=1;only(w,'east');assert.equal(select(w,result.state).reason,'selected');
});

test('malformed tick cannot erase an active attempt or authorize automatic reacquisition',()=>{
    const w=only(fixture(),'east'),first=select(w);w.tick=NaN;
    const stopped=select(w,first.state);assert.equal(stopped.reason,'unsupported-observation');assert.equal(stopped.state.phase,'finished');
    assert.equal(stopped.state.lastTick,50);w.tick=51;only(w,'east');
    assert.equal(select(w,stopped.state).state.phase,'finished');
});

test('a route with no best-case scoring time before the match limit is not useful',()=>{
    const w=fixture();w.tick=1990;only(w,'east');assert.equal(select(w).reason,'no-useful-objective');
});

test('owned-only, unavailable routes and unknown observation/effect/owner have explicit fallback',()=>{
    const w=fixture();w.flags.forEach(f=>f.my=true);assert.equal(select(reports(w)).reason,'no-useful-objective');
    const missing=fixture();assert.equal(select(missing).reason,'no-useful-objective');
    for(const change of [w=>w.observationComplete=false,w=>w.flags[1].my=null,w=>w.flags[1].effectType='unknown',
        w=>w.flags[1].scorePerTick=4,w=>w.flags[1].id=w.flags[0].id,w=>w.enemies[0].hits=NaN]){
        const w=only(fixture(),'east');change(w);assert.equal(select(w).reason,'unsupported-observation');
    }
});

test('scoped readiness admits unrelated injury independently of actor IDs and order',()=>{
    const w=only(fixture(),'east');
    w.myCreeps.push(unit('bystander',10,10,{}));
    assert.equal(select(w).reason,'selected');
    w.myCreeps.find(c=>c.id==='bystander').hits--;
    assert(w.myCreeps.filter(c=>w.squad.memberIds.includes(c.id)).every(c=>c.hits===c.hitsMax));
    // This actor belongs to neither the departing squad nor centre defence.
    // Health remains mandatory for the departing squad and all retained defence.
    for(const options of [{},{reverse:true},{rename:true},{rename:true,reverse:true}]){
        const result=select(transform(w,options));
        assert.equal(result.reason,'selected');assert.equal(result.objectiveId,'east');
        assert(result.work.candidates>0);
    }
});

test('health alone cannot qualify impaired, unsupported, undefended or threatened departures',()=>{
    const cases=[
        ['army-injured',w=>{w.myCreeps.find(c=>c.id==='blade').hits=300;}],
        ['squad-unavailable',w=>{w.myCreeps.find(c=>c.id==='blade').fatigue=1;}],
        ['squad-unavailable',w=>w.myCreeps.find(c=>c.id==='blade').body.forEach(p=>{if(p.type==='attack')p.hits=0;})],
        ['squad-unavailable',w=>w.myCreeps.find(c=>c.id==='medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
        ['support-unavailable',w=>Object.assign(w.myCreeps.find(c=>c.id==='medic'),{x:46,y:47})],
        ['defence-unavailable',w=>w.myCreeps.find(c=>c.id==='guardmedic').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
        ['local-combat',w=>Object.assign(w.enemies[0],{x:40,y:44})],
    ];
    for(const [reason,change]of cases){
        const w=fixture();change(w);only(w,'east');
        for(const options of [{},{reverse:true},{rename:true,reverse:true}]){
            const result=select(transform(w,options));
            assert.equal(result.reason,reason);assert.equal(result.objectiveId,w.centreId);
            assert.equal(result.work.candidates,0);
        }
    }
});

test('renaming friendly/enemy IDs, shuffled inputs and mirrored maps preserve non-tied decisions and costs',()=>{
    const w=reports(fixture()),expected=select(w);
    for(const options of [{rename:true},{reverse:true},{mirror:'x'},{mirror:'y'},{mirror:true},{rename:true,mirror:true,reverse:true}]){
        const actual=select(transform(w,options));assert.equal(actual.objectiveId,expected.objectiveId);assert.deepEqual(actual.evaluation,expected.evaluation);
    }
    for(let n=1;n<=20;n++){
        const rotated=structuredClone(w);
        for(const list of [rotated.flags,rotated.myCreeps,rotated.enemies,rotated.routes,rotated.squad.memberIds])list.push(...list.splice(0,n%list.length));
        assert.deepEqual(select(rotated).evaluation,expected.evaluation);
    }
});

test('exact ties use flag ID only; input order and map orientation cannot break them',()=>{
    const w=fixture(),a=w.flags.find(f=>f.id==='east'),b=w.flags.find(f=>f.id==='west');
    // Distinct goals with the same maximum group route and family/ownership.
    b.x=a.x;b.y=a.y+1;b.my=a.my;reports(w,[a,b]);
    assert.equal(select(w).objectiveId,'east');assert.equal(select(transform(w,{reverse:true,mirror:true})).objectiveId,'east');
});

test('finite budgets reject rather than truncate; frozen inputs and prior states stay unchanged',()=>{
    const w=reports(fixture());assert(w.routes.length<=limits.routes);
    const full=select(w);assert.equal(full.work.candidates,6);assert.equal(full.work.routes,24);
    const original=structuredClone(w),first=select(w);freeze(w);freeze(first.state);
    const result=select(w,first.state);assert.deepEqual(w,original);assert(result.work.candidates<=6);assert(result.work.routes<=24);
    assert(result.work.pathCells<=960);assert(result.work.routeThreatChecks<=13440);
    for(const change of [w=>w.flags.push({...w.flags[1],id:'extra'}),w=>w.enemies.push(...Array.from({length:12},(_,i)=>unit(`extra${i}`,0,i,{},false))),
        w=>w.routes.push(...Array(5).fill(w.routes[0])),w=>w.routes[0].ops=5001,w=>w.routes[0].path=Array(41).fill({x:0,y:0}),
        w=>w.routes[0].ops=undefined,w=>w.routes[1]=structuredClone(w.routes[0]),w=>w.myCreeps[0].body=Array(51).fill({type:'move',hits:100})]){
        const over=reports(fixture());change(over);assert.equal(select(over).reason,'unsupported-observation');
    }
});

test('live entrypoint does not call the inactive selector and first-flag behavior is unchanged',()=>{
    const loop=fs.readFileSync(new URL('../../src/loop.js',import.meta.url),'utf8');
    assert(!loop.includes('selectSecondaryObjective'));
    const flags=[{id:'first',my:true},{id:'other'}];assert.equal(selectFlag(flags),flags[0]);assert.equal(selectFlag([]),undefined);
});

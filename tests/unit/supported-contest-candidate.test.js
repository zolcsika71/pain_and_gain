import test from 'node:test';
import assert from 'node:assert/strict';
import {supportedContest as plan} from '../fixtures/supported-contest-candidate.js';
import {selectSecondaryObjective as capture} from '../../src/strategy/objectives.js';
import {selectMovementPlan} from '../../src/tactics/movement.js';
import {selectCombatDecision} from '../../src/tactics/combat.js';
import {moveCreeps} from '../../src/arena/execute.js';

const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function unit(id,x,y,parts,my=true){const body=Object.entries(parts).flatMap(([type,n])=>
    Array.from({length:n},()=>({type,hits:100})));return{id,x,y,my,exists:true,body,
    hits:body.length*100,hitsMax:body.length*100,fatigue:0};}
function fixture(){
    const E={centre:'eff_damage_taken_modifier',attack:'eff_attack_modifier',ranged:'eff_ranged_attack_modifier',heal:'eff_heal_modifier'};
    const flags=[['centre',40,40,'centre',5,true],['east',60,40,'attack',3,false],['west',20,40,'attack',3,undefined],
        ['north',40,20,'heal',4,undefined],['south',40,65,'heal',4,undefined],
        ['ranged-a',20,20,'ranged',3,undefined],['ranged-b',65,20,'ranged',3,undefined]]
        .map(([id,x,y,e,scorePerTick,my])=>({id,x,y,effectType:E[e],scorePerTick,my}));
    const myCreeps=[unit('medic',45,42,{move:6,heal:6}),
        unit('bow1',45,40,{move:6,ranged_attack:6}),unit('bow2',44,40,{move:6,ranged_attack:6}),
        unit('bow3',45,41,{move:6,ranged_attack:6}),
        ...[[39,40],[40,39],[39,39],[41,39]].map(([x,y],i)=>unit(`blade${i}`,x,y,{move:8,attack:8})),
        unit('guardR1',40,41,{move:6,ranged_attack:6}),unit('guardR2',39,41,{move:6,ranged_attack:6}),
        unit('guardH1',39,42,{move:6,heal:6}),unit('guardH2',38,41,{move:6,heal:6}),
        unit('scout1',38,39,{move:1}),unit('scout2',38,38,{move:1})];
    const enemies=[unit('occupant',60,40,{move:1},false),
        ...Array.from({length:13},(_,i)=>unit(`foe${i}`,90+i%4,90+Math.floor(i/4),
            i<3?{move:6,heal:6}:{move:8,attack:8},false))];
    return{tick:10,observationComplete:true,centreId:'centre',flags,myCreeps,enemies,
        squad:{id:'existing-squad',memberIds:['medic','bow1','bow2','bow3']},
        unavailableIds:[],offers:[],captureRoutes:[]};
}
const actor=(w,id)=>w.myCreeps.find(c=>c.id===id);
const flag=(w,id='east')=>w.flags.find(f=>f.id===id);
// Generated reports only. They do not assert real terrain or move actors.
function route(w,id,target,flagId='east'){
    const c=actor(w,id),path=[];let p={x:c.x,y:c.y};
    while(range(p,target)){p={x:p.x+Math.sign(target.x-p.x),y:p.y+Math.sign(target.y-p.y)};path.push(p);}
    return{actorId:id,flagId,tick:w.tick,from:{x:c.x,y:c.y},path,incomplete:false,ops:100};
}
function offer(w,id='east',anchor={x:56,y:40}){
    return{flagId:id,anchor,routes:w.squad.memberIds.map(member=>route(w,member,anchor,id))};
}
function fresh(w){w.offers=[offer(w)];return w;}
function positions(w,values){for(const [id,x,y]of values)Object.assign(actor(w,id),{x,y});}
function advance(w){w.tick++;fresh(w);}
function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze);}return v;}

test('isolated unarmed occupant admits approach while unchanged capture admission rejects the race',()=>{
    const w=fresh(fixture()),before=structuredClone(w);freeze(w);
    assert.equal(w.myCreeps.length,14);assert.equal(w.enemies.length,14);
    const r=plan(w);assert.equal(r.intent.kind,'approach');assert.equal(r.state.occupantId,'occupant');
    assert.equal(r.ordinaryFallbackById.size,4);
    assert([...r.ordinaryFallbackById.values()].every(p=>range(p,flag(w))===4));
    assert.equal(capture({...w,routes:w.squad.memberIds.map(id=>route(w,id,flag(w)))}).reason,'no-useful-objective');
    assert.deepEqual(w,before);
});

test('generated observations progress from approach to existing ranged engagement without a capture command',()=>{
    const w=fresh(fixture()),first=plan(w);advance(w);
    positions(w,[['medic',49,42],['bow1',49,40],['bow2',48,40],['bow3',49,41]]);fresh(w);
    const next=plan(w,first.state);assert.equal(next.state.phase,'approach');assert(next.state.bestDistance<first.state.bestDistance);
    advance(w);positions(w,[['medic',56,40],['bow1',57,40],['bow2',57,41],['bow3',57,39]]);fresh(w);
    const engaged=plan(w,next.state);assert.equal(engaged.intent.kind,'engage');
    // These positions are externally supplied observations, not executed moves.
    for(const c of [...w.myCreeps,...w.enemies])c.getRangeTo=p=>range(c,p);
    for(const id of ['bow1','bow2','bow3']){
        const c=actor(w,id),movement=selectMovementPlan(c,w.enemies,flag(w,'centre'),null,w.myCreeps);
        assert.equal(movement.reason,'combat-in-range');assert.equal(movement.target,null);
        const combat=selectCombatDecision(c,w.enemies,null);assert.equal(combat.actions[0].method,'rangedAttack');
        assert.equal(combat.actions[0].target.id,'occupant');
    }
    assert.equal(selectMovementPlan(actor(w,'medic'),w.enemies,flag(w,'centre'),null,w.myCreeps).reason,'flag-fallback');
    assert.equal(engaged.ordinaryFallbackById.get('medic').x,56);
});

test('existing executor seam uses stand-off fallback and preserves ordinary combat decisions',()=>{
    const w=fresh(fixture()),r=plan(w),calls=[];
    for(const c of [...w.myCreeps,...w.enemies]){
        c.getRangeTo=p=>range(c,p);c.moveTo=p=>{calls.push({id:c.id,x:p.x,y:p.y});return 0;};
    }
    moveCreeps(w.myCreeps,w.enemies,flag(w,'centre'),new Map(),new Map(),null,null,null,false,null,null,r.ordinaryFallbackById);
    assert.equal(calls.length,14);assert.equal(new Set(calls.map(c=>c.id)).size,14);
    for(const c of calls)assert.deepEqual({x:c.x,y:c.y},w.squad.memberIds.includes(c.id)?{x:56,y:40}:{x:40,y:40});
    assert(calls.every(c=>range(c,flag(w))!==0));
    // Near contact, existing weapon approach takes priority over fallback.
    Object.assign(actor(w,'bow1'),{x:55,y:40});
    assert.equal(selectMovementPlan(actor(w,'bow1'),w.enemies,flag(w,'centre'),null,w.myCreeps).reason,'combat-approach');
});

test('armed defence is rejected regardless of nominal friendly weapon superiority',()=>{
    const w=fresh(fixture());w.enemies[0].body.push({type:'attack',hits:100});w.enemies[0].hitsMax+=100;w.enemies[0].hits+=100;
    assert.equal(plan(w).reason,'armed-defence');assert.equal(plan(w).intent,null);
    w.tick++;w.enemies[0].body.at(-1).type='ranged_attack';fresh(w);assert.equal(plan(w).reason,'armed-defence');
});

test('enemy healing and reinforcements cancel a pinned contest on the next observation',()=>{
    for(const [reason,change]of [
        ['enemy-healing',w=>Object.assign(w.enemies[1],{x:62,y:40})],
        ['reinforcement-uncertainty',w=>Object.assign(w.enemies[4],{x:68,y:40})],
        ['reinforcement-uncertainty',w=>{w.enemies[4].body=[{type:'move',hits:100}];Object.assign(w.enemies[4],{x:68,y:40});}],
    ]){
        const w=fresh(fixture()),r=plan(w);assert(r.intent);advance(w);change(w);
        const stopped=plan(w,r.state);assert.equal(stopped.reason,reason);assert.equal(stopped.state.phase,'finished');
        assert.equal(stopped.ordinaryFallbackById.size,0);
    }
});

test('reinforcement equality rejects; one additional geometric cell admits without claiming safety',()=>{
    const w=fresh(fixture()),L=Math.max(...w.offers[0].routes.map(r=>r.path.length));
    Object.assign(w.enemies[4],{x:56,y:40+L+5});assert.equal(plan(w).reason,'reinforcement-uncertainty');
    w.enemies[4].y++;assert.equal(plan(w).intent.kind,'approach');
});

test('lost healing, separation, fatigue, weapons and external controller ownership terminate',()=>{
    for(const change of [w=>actor(w,'medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;}),
        w=>actor(w,'medic').x=40,w=>actor(w,'bow1').fatigue=1,
        w=>actor(w,'bow1').body.forEach(p=>{if(p.type==='ranged_attack')p.hits=0;}),
        w=>w.unavailableIds=['medic'],w=>actor(w,'bow1').hits--]){
        const w=fresh(fixture()),r=plan(w);advance(w);change(w);fresh(w);
        const stopped=plan(w,r.state);assert.equal(stopped.state.phase,'finished');assert.equal(stopped.intent,null);
    }
});

test('retained centre defence and local danger remain mandatory',()=>{
    for(const change of [w=>{for(const c of w.myCreeps.filter(c=>['guardH1','guardH2'].includes(c.id)))c.body=[];},
        w=>Object.assign(w.enemies[4],{x:40,y:44}),w=>flag(w,'centre').my=false]){
        const w=fresh(fixture()),r=plan(w);advance(w);change(w);
        const stopped=plan(w,r.state);assert.equal(stopped.state.phase,'finished');assert.equal(stopped.intent,null);
    }
});

test('unknown observations and missing or malformed required route evidence never imply support',()=>{
    for(const change of [w=>w.observationComplete=false,w=>delete w.enemies[4].body,w=>w.enemies[4].body[0].type='unknown',
        w=>w.enemies[4].x=NaN,w=>delete w.offers[0].routes[0].ops,w=>w.offers[0].routes[0].incomplete='false',
        w=>w.offers[0].routes[0].path=Array(41).fill({x:50,y:40}),w=>w.offers[0].routes.pop(),
        w=>w.offers[0].routes[0].tick--,w=>w.offers[0].routes[0].incomplete=true,
        w=>w.offers[0].routes[0].path[0]={x:NaN,y:40},w=>w.offers[0].routes[0].path[0]={x:0,y:0}]){
        const w=fresh(fixture());change(w);const result=plan(w);assert.equal(result.intent,null);assert.equal(result.ordinaryFallbackById.size,0);
    }
});

test('one functioning weapon is insufficient even with a healthy accessible healer',()=>{
    const w=fixture();w.squad.memberIds=['medic','bow1'];fresh(w);
    assert.equal(capture({...w,routes:[]}).reason,'no-useful-objective');
    assert.equal(plan(w).reason,'ranged-support-quorum');
});

test('approach exposure, unsafe healer placement and occupied stand-off reject',()=>{
    for(const change of [w=>w.offers[0].anchor={x:64,y:40},
        w=>Object.assign(actor(w,'medic'),{x:57,y:40}),
        w=>Object.assign(actor(w,'scout1'),w.offers[0].anchor),
        w=>w.offers[0].routes[0].path[0]={x:60,y:40}]){
        const w=fresh(fixture());change(w);assert.equal(plan(w).intent,null);
    }
    const w=fresh(fixture());Object.assign(w.enemies[4],{x:51,y:46});
    assert.equal(plan(w).reason,'approach-exposure-or-route');
});

test('four ticks without improved observed distance finish and do not automatically retry',()=>{
    const w=fresh(fixture());let r=plan(w);
    for(let i=1;i<=4;i++){advance(w);r=plan(w,r.state);assert.equal(r.state.phase,i===4?'finished':'approach');}
    assert.equal(r.reason,'blocked-progress');assert.equal(r.ordinaryFallbackById.size,0);
    advance(w);assert.equal(plan(w,r.state).reason,'blocked-progress');
});

test('engagement is bounded even when no opponent damage or capture is observed',()=>{
    const w=fixture();positions(w,[['medic',56,40],['bow1',57,40],['bow2',57,41],['bow3',57,39]]);fresh(w);
    let r=plan(w);assert.equal(r.intent.kind,'engage');
    for(let i=1;i<=4;i++){advance(w);r=plan(w,r.state);}
    assert.equal(r.reason,'blocked-progress');assert.equal(w.enemies[0].hits,100);
});

test('absolute lifetime, duplicate ticks and rewind cannot replenish the attempt',()=>{
    const w=fresh(fixture()),r=plan(w),copy=structuredClone(r.state);freeze(r.state);
    assert.equal(plan(w,r.state).reason,'duplicate-observation');assert.deepEqual(r.state,copy);
    w.tick+=60;fresh(w);assert.equal(plan(w,r.state).reason,'timeout');
    w.tick=9;fresh(w);assert.equal(plan(w,r.state).reason,'invalid-time');
});

test('flag or squad bindings cannot silently switch, and external ownership is not candidate capture',()=>{
    for(const change of [w=>flag(w).my=undefined,w=>flag(w).x++,w=>w.squad.id='different',
        w=>w.squad.memberIds=['guardH1','blade0','blade1'],w=>flag(w,'centre').x++]){
        const w=fresh(fixture()),r=plan(w);advance(w);change(w);fresh(w);
        assert.equal(plan(w,r.state).state.phase,'finished');
    }
    const w=fresh(fixture()),r=plan(w);advance(w);flag(w).my=true;
    assert.equal(plan(w,r.state).reason,'captured-externally');
});

test('occupant leaving prompts unchanged capture admission, with no automatic movement or restart',()=>{
    for(const eligible of [true,false]){
        const w=fresh(fixture()),first=plan(w);advance(w);Object.assign(w.enemies[0],{x:90,y:85});
        if(eligible)w.captureRoutes=w.squad.memberIds.map(id=>route(w,id,flag(w)));
        const next=plan(w,first.state);assert.equal(next.reason,eligible?'capture-eligible':'capture-not-admitted');
        assert.equal(next.state.phase,'finished');assert.equal(next.ordinaryFallbackById.size,0);
        if(eligible)assert.equal(capture({...w,routes:w.captureRoutes}).reason,'selected');
        advance(w);assert.equal(plan(w,next.state).state.phase,'finished');
    }
});

test('a merely displaced or replaced occupant cannot bypass the capture arrival or occupancy gates',()=>{
    const w=fresh(fixture()),first=plan(w);advance(w);Object.assign(w.enemies[0],{x:61,y:40});
    w.captureRoutes=w.squad.memberIds.map(id=>route(w,id,flag(w)));
    assert.equal(plan(w,first.state).reason,'capture-not-admitted');
    Object.assign(w.enemies[4],{x:60,y:40});assert.equal(plan(w,first.state).reason,'capture-not-admitted');
});

test('stable selection does not chase newly preferable offers',()=>{
    const w=fresh(fixture());flag(w).my=undefined;
    const r=plan(w);advance(w);
    flag(w,'west').my=false;Object.assign(w.enemies[4],{x:20,y:40,body:[{type:'move',hits:100}]});
    w.offers.push(offer(w,'west',{x:24,y:40}));
    assert.equal(plan(w).intent.flagId,'west');
    const next=plan(w,r.state);assert.equal(next.state.flag.id,'east');assert.equal(next.intent.flagId,'east');
});

function transformed(w,{rename=false,mirrorX=false,mirrorY=false,reverse=false}={}){
    const a=structuredClone(w),name=id=>rename?`renamed-${id.split('').reverse().join('')}`:id;
    const p=v=>{if(mirrorX)v.x=99-v.x;if(mirrorY)v.y=99-v.y;};
    for(const c of [...a.myCreeps,...a.enemies]){c.id=name(c.id);p(c);}
    a.centreId=name(a.centreId);a.squad.id=name(a.squad.id);a.squad.memberIds=a.squad.memberIds.map(name);
    a.unavailableIds=a.unavailableIds.map(name);for(const f of a.flags){f.id=name(f.id);p(f);}
    for(const o of a.offers){o.flagId=name(o.flagId);p(o.anchor);for(const r of o.routes){r.actorId=name(r.actorId);r.flagId=name(r.flagId);p(r.from);r.path.forEach(p);}if(reverse)o.routes.reverse();}
    if(reverse){a.myCreeps.reverse();a.enemies.reverse();a.flags.reverse();a.squad.memberIds.reverse();a.offers.reverse();}
    return a;
}

test('renaming, input permutations and mirrored geometry preserve decisions and lifecycle',()=>{
    for(const options of [{rename:true},{reverse:true},{mirrorX:true},{mirrorY:true},
        {rename:true,reverse:true,mirrorX:true,mirrorY:true}]){
        const w=fresh(fixture());flag(w,'west').my=false;
        Object.assign(w.enemies[4],{x:20,y:40,body:[{type:'move',hits:100}]});w.offers.push(offer(w,'west',{x:24,y:40}));
        const a=transformed(w,options),name=id=>options.rename?`renamed-${id.split('').reverse().join('')}`:id;
        let original=plan(w),actual=plan(a);assert.equal(actual.intent.kind,original.intent.kind);
        assert.equal(actual.intent.flagId,name(original.intent.flagId));assert.equal(actual.state.bestDistance,original.state.bestDistance);
        for(let i=0;i<4;i++){w.tick++;a.tick++;w.offers.forEach(o=>o.routes.forEach(r=>r.tick=w.tick));a.offers.forEach(o=>o.routes.forEach(r=>r.tick=a.tick));
            original=plan(w,original.state);actual=plan(a,actual.state);assert.equal(actual.reason,original.reason);assert.equal(actual.state.phase,original.state.phase);}
    }
});

test('equal objectives refuse an arbitrary tie under renaming, permutation and reflection',()=>{
    const w=fresh(fixture());Object.assign(flag(w,'west'),{x:29,y:40,my:false});
    Object.assign(w.enemies[4],{x:29,y:40,body:[{type:'move',hits:100}]});w.offers.push(offer(w,'west',{x:33,y:40}));
    assert.equal(plan(w).reason,'ambiguous-contest');
    for(const options of [{rename:true},{reverse:true},{mirrorX:true},{mirrorY:true},{rename:true,reverse:true,mirrorX:true,mirrorY:true}])
        assert.equal(plan(transformed(w,options)).reason,'ambiguous-contest');
});

test('route-report resource bounds reject excess work and never execute a query',()=>{
    for(const change of [w=>w.offers[0].routes[0].ops=1001,w=>w.offers=Array.from({length:7},(_,i)=>({...offer(w),flagId:`extra${i}`})),
        w=>w.captureRoutes=Array(5).fill(w.offers[0].routes[0])]){
        const w=fresh(fixture());change(w);assert.equal(plan(w).reason,'unsupported-routes');
    }
    const w=fresh(fixture());w.offers[0].routes.forEach(r=>r.ops=1000);assert.equal(plan(w).intent.kind,'approach');
    w.offers=w.flags.filter(f=>f.id!=='centre').map(f=>{
        const o=offer(w,f.id);o.routes.forEach(r=>r.ops=1000);return o;
    });
    assert.equal(w.offers.reduce((n,o)=>n+o.routes.length,0),24);
    assert.equal(plan(w).intent.kind,'approach');
    w.captureRoutes=[route(w,'medic',flag(w))];assert.equal(plan(w).reason,'unsupported-routes');
});

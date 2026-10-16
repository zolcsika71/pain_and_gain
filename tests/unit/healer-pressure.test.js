import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectMovementPlan} from '../../src/tactics/movement.js';
import {selectHealingDecision} from '../../src/tactics/healing.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';

const observed=JSON.parse(fs.readFileSync(new URL('../fixtures/healer-pressure-window.json',import.meta.url)));
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function unit(id,x,y,types,options={}){
    const c={id,x,y,my:true,exists:true,hits:100,hitsMax:100,fatigue:0,
        body:types.map(type=>({type,hits:100})),calls:[],...options,getRangeTo(p){return range(this,p);}};
    for(const method of ['moveTo','heal','rangedHeal','attack','rangedAttack'])c[method]=target=>{c.calls.push({method,id:target.id??null,x:target.x,y:target.y});return 0;};
    return c;
}
function recorded(sample){
    const all=sample.state.creeps.map(c=>{
        const original=observed.initialBodies.find(b=>b.id===c.id).parts;
        const body=Object.entries(original).flatMap(([type,n])=>Array.from({length:n},(_,i)=>({type,hits:i<(c.activeBodyParts[type]??0)?100:0})));
        return unit(c.id,c.x,c.y,[],{...c,body});
    });
    return{all,friends:all.filter(c=>c.my&&c.hits>0),enemies:all.filter(c=>!c.my&&c.hits>0),
        h:all.find(c=>c.id===sample.healer.id),flag:sample.state.flags[0],
        context:{creeps:all,terrainAt:p=>sample.terrain[`${p.x},${p.y}`]}};
}

test('recorded exposed healer hold has a free less-exposed step retaining the healing band',()=>{
    for(const sample of observed.samples){
        const w=recorded(sample),injured=w.friends.filter(c=>c.hits<c.hitsMax);
        assert.equal(sample.healer.movement.reason,'injured-ally-in-range');
        const healing=selectHealingDecision(w.h,injured);
        assert.equal(healing.action.method,sample.healer.healing.actions[0].method);
        assert.equal(healing.action.target.id,sample.healer.healing.actions[0].target.id);
        const plan=selectMovementPlan(w.h,w.enemies,w.flag,null,w.friends,false,w.context);
        assert.equal(plan.reason,'healer-pressure-retreat');assert.deepEqual(plan.target,sample.expectedRetreat);
        assert.equal(w.context.terrainAt(plan.target),0);assert(!w.all.some(c=>c.hits>0&&range(c,plan.target)===0));
        moveCreeps(w.friends,w.enemies,w.flag,new Map(),new Map(),null,null,null,false,null,w.context);
        executeTactics(w.friends,w.enemies,injured);
        assert.deepEqual(w.h.calls.find(c=>c.method==='moveTo'),{method:'moveTo',id:null,...sample.expectedRetreat});
        const call=w.h.calls.find(c=>['heal','rangedHeal'].includes(c.method));assert.equal(call.id,healing.action.target.id);
        assert.equal(call.method,healing.action.method);assert.equal(w.h.calls.filter(c=>c.method==='moveTo').length,1);
    }
});

function generated(){
    const h=unit('h',5,5,['heal','move']),ally=unit('ally',5,4,['attack','move'],{hits:60}),e=unit('e',6,6,['attack','move'],{my:false});
    return{h,ally,e,friends:[h,ally],enemies:[e],flag:{id:'centre',x:0,y:0},context:{creeps:[h,ally,e],terrainAt:()=>0}};
}
const select=w=>selectMovementPlan(w.h,w.enemies,w.flag,null,w.friends,false,w.context);

test('generated melee escape or ranged-pressure reduction retains useful healing and adds no weapon exposure',()=>{
    for(const ranged of [false,true]){
        const w=generated();if(ranged){w.e.x=8;w.e.y=8;w.e.body[0].type='ranged_attack';}
        const plan=select(w);assert.equal(plan.reason,'healer-pressure-retreat');assert.deepEqual(plan.target,{x:4,y:4});
        assert(range(plan.target,w.e)>(ranged?3:1));assert(range(plan.target,w.ally)<=1);
        assert.equal(selectHealingDecision(w.h,[w.ally]).action.method,'heal');
    }
});

test('unsafe, occupied, reserved, swamp, wall or unknown exits retain the existing support decision',()=>{
    for(const terrain of [1,2,undefined]){const w=generated();w.context.terrainAt=()=>terrain;assert.equal(select(w).reason,'injured-ally-in-range');}
    for(const blocked of ['occupant','reserved','new-ranged','melee']){
        const w=generated();w.context.terrainAt=p=>p.x===4&&p.y===4?0:1;
        if(blocked==='reserved')w.context.reserved=new Set(['4,4']);
        else{const c=blocked==='occupant'?unit('block',4,4,['move']):
            blocked==='new-ranged'?unit('new',1,1,['move','ranged_attack'],{my:false}):unit('new',3,4,['move','attack'],{my:false});
            w.context.creeps.push(c);if(!c.my)w.enemies.push(c);}
        assert.equal(select(w).reason,'injured-ally-in-range',blocked);
    }
});

test('retreat cannot drop current useful healing access or downgrade adjacent healing bands',()=>{
    for(const loss of ['adjacent-band','ranged-access','healthy-weapon-access']){
        const w=generated();w.context.terrainAt=p=>p.x===4&&p.y===4?0:1;
        if(loss==='adjacent-band')w.ally.x=6;
        else {const other=unit('other',8,5,['ranged_attack','move'],{hits:loss==='healthy-weapon-access'?100:50});w.friends.push(other);w.context.creeps.push(other);}
        assert.equal(select(w).reason,'injured-ally-in-range');
    }
    const w=generated();w.ally.hits=w.ally.hitsMax;w.ally.body[0].hits=0;
    assert.equal(select(w).reason,'flag-fallback'); // No injured/armed ally to keep supporting.
});

test('no strict exposure improvement, absent context, fatigue, lost parts and hybrids do not trigger',()=>{
    const w=generated();w.e.x=3;w.e.y=3;w.e.body[0].type='ranged_attack';
    w.context.terrainAt=p=>p.x===4&&p.y===4?0:1;assert.equal(select(w).reason,'injured-ally-in-range');
    assert.equal(selectMovementPlan(w.h,w.enemies,w.flag,null,w.friends).reason,'injured-ally-in-range');
    for(const change of [a=>a.h.fatigue=1,a=>a.h.body.find(p=>p.type==='move').hits=0,
        a=>a.h.body.find(p=>p.type==='heal').hits=0,a=>a.context.creeps=Array(29).fill(a.h),
        a=>a.friends=Array(15).fill(a.h),a=>a.h.body.push(...Array(50).fill({type:'move',hits:100}))]){
        const a=generated();change(a);assert.notEqual(select(a).reason,'healer-pressure-retreat');
    }
    for(const type of ['attack','ranged_attack'])for(const hits of [0,100]){
        const a=generated();a.h.body.push({type,hits});assert.notEqual(select(a).reason,'healer-pressure-retreat');
    }
});

test('only functioning live enemy weapons count; all eight neighbours stay in map bounds',()=>{
    for(const change of [w=>w.e.hits=0,w=>w.e.body[0].hits=0,w=>w.e.body[0].type='heal']){
        const w=generated();change(w);assert.equal(select(w).reason,'injured-ally-in-range');
    }
    const w=generated();Object.assign(w.h,{x:1,y:0});Object.assign(w.e,{x:0,y:1});Object.assign(w.ally,{x:2,y:0});let checks=0;
    w.context.terrainAt=p=>{checks++;assert(p.x>=0&&p.x<100&&p.y>=0&&p.y<100);return 0;};
    const plan=select(w);assert.equal(plan.reason,'healer-pressure-retreat');assert.deepEqual(plan.target,{x:2,y:1});assert(checks<=8);
});

test('generated successive observations retreat then hold and heal without automatic movement resolution',()=>{
    const w=generated(),engagements=new Map(),moved=[];
    for(let tick=1;tick<=4;tick++){
        w.h.calls=[];moveCreeps(w.friends,w.enemies,w.flag,engagements,new Map(),null,null,null,false,null,w.context);
        executeTactics(w.friends,w.enemies,[w.ally]);
        const movement=w.h.calls.filter(c=>c.method==='moveTo');assert(movement.length<=1);moved.push(movement.length);
        assert(w.h.calls.some(c=>c.method==='heal'&&c.id==='ally'));
        // Explicit generated next input, not a claim about an accepted Arena command.
        if(movement.length)Object.assign(w.h,{x:movement[0].x,y:movement[0].y});
        assert(range(w.h,w.ally)<=1);assert.equal(new Set(w.context.creeps.map(c=>`${c.x},${c.y}`)).size,w.context.creeps.length);
    }
    assert.deepEqual(moved,[1,0,0,0]);
});

test('rejected or unknown calls do not move the healer or suppress healing',()=>{
    for(const result of [-11,undefined]){
        const w=generated();w.h.moveTo=p=>{w.h.calls.push({method:'moveTo',x:p.x,y:p.y});return result;};
        for(let tick=1;tick<=3;tick++){
            w.h.calls=[];moveCreeps(w.friends,w.enemies,w.flag,new Map(),new Map(),null,null,null,false,null,w.context);
            executeTactics(w.friends,w.enemies,[w.ally]);assert.equal(w.h.x,5);assert.equal(w.h.y,5);
            assert.equal(w.h.calls.filter(c=>c.method==='moveTo').length,1);assert(w.h.calls.some(c=>c.method==='heal'));
        }
    }
});

test('escort and paired ownership win; failed/unknown retreats still reserve against later actors',()=>{
    const w=generated();moveCreeps(w.friends,w.enemies,w.flag,new Map(),new Map(),{healerId:'h',mode:'hold'},null,null,false,null,w.context);
    assert.equal(w.h.calls.length,0);
    moveCreeps(w.friends,w.enemies,w.flag,new Map(),new Map(),null,null,null,false,
        {context:{leaderId:'h'},moves:new Map([['h',{target:null,reason:'pair-hold'}]])},w.context);assert.equal(w.h.calls.length,0);
    for(const ranged of [false,true]){
        const a=generated();Object.assign(a.ally,{x:4,y:4});const second=unit('second',5,6,[ranged?'ranged_attack':'heal','move']);
        a.friends.splice(1,0,second);a.context.creeps.push(second);a.context.terrainAt=p=>p.x===4&&p.y===5?0:1;
        a.h.moveTo=p=>{a.h.calls.push({method:'moveTo',x:p.x,y:p.y});return undefined;};
        moveCreeps(a.friends,a.enemies,a.flag,new Map(),new Map(),null,null,null,false,null,a.context);
        assert.equal(a.friends.filter(c=>c!==a.ally).flatMap(c=>c.calls.filter(call=>call.method==='moveTo')).length,1);
    }
});

test('renaming and actor/enemy input order do not alter the geometric healer escape',()=>{
    for(const reverse of [false,true]){
        const w=generated();w.h.id='different';w.e.id='another';if(reverse){w.friends.reverse();w.enemies.reverse();w.context.creeps.reverse();}
        assert.deepEqual(select(w).target,{x:4,y:4});
    }
});

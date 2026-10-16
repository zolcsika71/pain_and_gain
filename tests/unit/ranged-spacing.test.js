import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
const observed = JSON.parse(fs.readFileSync(new URL('../fixtures/ranged-spacing-window.json', import.meta.url)));
const range = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function unit(id,x,y,types,options={}) {
    const c={id,x,y,my:true,hits:100,hitsMax:100,fatigue:0,body:types.map(type=>({type,hits:100})),...options,calls:[],
        getRangeTo(t){return range(this,t);}};
    for(const method of ['moveTo','attack','rangedAttack','heal','rangedHeal'])c[method]=t=>{c.calls.push({method,id:t.id,x:t.x,y:t.y});return 0;};
    return c;
}
const flag={id:'flag',x:0,y:0};
function small(){const r=unit('r',5,5,['ranged_attack','move']),e=unit('e',4,5,['attack','move'],{my:false});
    return {r,e,friends:[r],enemies:[e],context:{creeps:[r,e],terrainAt:()=>0}};}
const select=(w,previous)=>selectMovementPlan(w.r,w.enemies,flag,previous,w.friends,false,w.context);

test('observed holds have verified plain unoccupied retreat options, preserving a ranged target',()=>{
    for(const f of observed.findings){const s=observed.states.find(s=>s.tick===f.tick);
        const all=s.creeps.map(c=>unit(c.id,c.x,c.y,Object.entries(c.activeBodyParts).flatMap(([k,n])=>Array(n).fill(k)),{my:c.my,hits:c.hits}));
        const actor=all.find(c=>c.id===f.actor),friends=all.filter(c=>c.my),enemies=all.filter(c=>!c.my&&c.hits>0);
        const p=selectMovementPlan(actor,enemies,s.flags[0],null,friends,false,{creeps:all,terrainAt:p=>observed.terrain[`${p.x},${p.y}`]});
        assert.equal(p.reason,'ranged-melee-retreat');assert(f.available.some(([x,y])=>x===p.target.x&&y===p.target.y));
        assert(enemies.some(e=>range(p.target,e)<=3));
    }
});
test('safe standoff, hybrids, fatigue, lost MOVE and absent context retain ordinary behavior',()=>{
    const w=small();w.e.x=3;assert.equal(select(w).reason,'combat-in-range');w.e.x=4;
    assert.equal(selectMovementPlan(w.r,w.enemies,flag,null,w.friends).reason,'combat-in-range');
    for(const type of ['attack','heal']){w.r.body.push({type,hits:0});assert.equal(select(w).reason,'combat-in-range');w.r.body.pop();}
    w.r.fatigue=1;assert.equal(select(w).reason,'combat-in-range');w.r.fatigue=0;
    w.r.body[1].hits=0;assert.equal(select(w).reason,'combat-in-range');
});
test('world bounds, lost enemy ATTACK, deterministic ties and unsupported roster bounds',()=>{
    const w=small();w.r.x=1;w.r.y=0;w.e.x=0;w.e.y=0;
    w.context.terrainAt=p=>{assert(p.x>=0&&p.x<100&&p.y>=0&&p.y<100);return 0;};
    assert.deepEqual(select(w).target,{x:2,y:0});assert.deepEqual(select(w).target,{x:2,y:0});
    w.e.body[0].hits=0;assert.equal(select(w).reason,'combat-in-range');w.e.body[0].hits=100;
    w.context.creeps=Array(29).fill(w.r);assert.equal(select(w).reason,'combat-in-range');
});
test('walls, swamp/unknown terrain, occupied and unsafe/new ranged exposure destinations reject',()=>{
    for(const terrain of [1,2,undefined]){const w=small();w.context.terrainAt=()=>terrain;assert.equal(select(w).reason,'combat-in-range');}
    const w=small();w.context.terrainAt=p=>p.x===6&&p.y===5?0:1;
    const blocker=unit('block',6,5,['move']);w.context.creeps.push(blocker);assert.equal(select(w).reason,'combat-in-range');w.context.creeps.pop();
    const danger=unit('danger',9,5,['ranged_attack','move'],{my:false});w.enemies.push(danger);w.context.creeps.push(danger);
    assert.equal(select(w).reason,'combat-in-range');
    danger.x=7;danger.body[0].type='attack';assert.equal(select(w).reason,'combat-in-range');
});
test('retreat and compatible attack coexist; subsequent supported standoff does not bounce back',()=>{
    const w=small(),trace=[];const engagements=new Map();
    for(let t=1;t<=4;t++){
        w.r.calls.length=0;
        moveCreeps(w.friends,w.enemies,flag,engagements,new Map(),null,null,null,false,null,w.context);
        executeTactics(w.friends,w.enemies,[]);
        assert(w.r.calls.some(c=>c.method==='rangedAttack'));assert(w.r.calls.filter(c=>c.method==='moveTo').length<=1);
        const move=w.r.calls.find(c=>c.method==='moveTo');
        if(move){assert(!w.context.creeps.some(c=>c!==w.r&&c.x===move.x&&c.y===move.y));Object.assign(w.r,{x:move.x,y:move.y});}
        assert.equal(new Set(w.context.creeps.map(c=>`${c.x},${c.y}`)).size,w.context.creeps.length);
        trace.push(Boolean(move));
    }
    assert.deepEqual(trace,[true,false,false,false]);assert(range(w.r,w.e)>1);
});
test('rejected retreat is not displacement; still attacks and reevaluates on next tick',()=>{
    const w=small();w.r.moveTo=t=>{w.r.calls.push({method:'moveTo',x:t.x,y:t.y});return -11;};
    for(let t=0;t<3;t++){w.r.calls.length=0;moveCreeps(w.friends,w.enemies,flag,new Map(),new Map(),null,null,null,false,null,w.context);
        executeTactics(w.friends,w.enemies,[]);assert(w.r.calls.some(c=>c.method==='moveTo'));assert(w.r.calls.some(c=>c.method==='rangedAttack'));assert.equal(w.r.x,5);}
});
test('escort/pair ownership remains prior; multiple retreats reserve distinct destinations',()=>{
    const w=small();moveCreeps(w.friends,w.enemies,flag,new Map(),new Map(),{healerId:w.r.id,ally:w.e,mode:'hold'},null,null,false,null,w.context);
    assert.equal(w.r.calls.length,0);
    moveCreeps(w.friends,w.enemies,flag,new Map(),new Map(),null,null,null,false,{context:{leaderId:w.r.id},moves:new Map([[w.r.id,{target:null,reason:'pair-hold'}]])},w.context);
    assert.equal(w.r.calls.length,0);
    const r2=unit('r2',5,6,['ranged_attack','move']);w.friends.push(r2);w.context.creeps.push(r2);
    w.context.terrainAt=p=>p.x===6&&p.y===5?0:1;
    moveCreeps(w.friends,w.enemies,flag,new Map(),new Map(),null,null,null,false,null,w.context);
    const moves=w.friends.flatMap(c=>c.calls.filter(c=>c.method==='moveTo'));assert.equal(moves.length,1);
});

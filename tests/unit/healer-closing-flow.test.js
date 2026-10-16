import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as deployed from '../../src/config.js';

const modules=new Map([
    ['game/utils',`export const getObjectsByPrototype=p=>globalThis.__closing.objects.get(p);
        export const getObjects=()=>[...globalThis.__closing.objects.values()].flat();
        export const getTicks=()=>globalThis.__closing.tick;
        export const getTerrainAt=p=>{globalThis.__closing.reads++;return globalThis.__closing.terrain(p);};
        export const getCpuTime=()=>1234;`],
    ['game','export const arenaInfo={name:"Pain and Gain",season:"4",level:1,ticksLimit:2000,cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder','export const searchPath=()=>{throw Error("No closing route search allowed");};'],
    ['game/constants','export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes','export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic','export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){
    if(s==='./config.js'&&c.parentURL?.endsWith('/src/loop.js'))return{url:'data:text/javascript,'+encodeURIComponent(
        'export const oneScoutFlagExperiment=false;export const oneHealerEscortExperiment=true;export const scoutHoldExperiment=false;export const squadPairExperiment=false;export const secondaryObjectiveExperiment=false;export const healerUsefulClosingExperiment=true;'),shortCircuit:true};
    const source=modules.get(s);return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(s,c);
}});
const {runTick}=await import('../../src/loop.js');
const {Creep}=await import('game/prototypes');
const {ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function unit(id,x,y,types,options={}){
    const c=Object.assign(new Creep(),{id,x,y,my:true,exists:true,hits:1200,hitsMax:1200,fatigue:0,
        body:types.map(type=>({type,hits:100})),calls:[],returns:{},getRangeTo(p){return range(this,p);},...options});
    for(const method of ['move','moveTo','heal','rangedHeal','attack','rangedAttack'])c[method]=p=>{
        c.calls.push({tick:globalThis.__closing.tick,method,...(method==='move'?{direction:p}:{id:p.id??null,x:p.x,y:p.y})});
        return Object.hasOwn(c.returns,method)?c.returns[method]:0;
    };
    return c;
}
const body=(type,n=6)=>[...Array(n).fill(type),...Array(n).fill('move')];
function world(t){
    const h=unit('h',5,5,body('heal')),ally=unit('a',7,5,body('ranged_attack'),{hits:200});
    const types=['eff_damage_taken_modifier','eff_heal_modifier','eff_heal_modifier','eff_attack_modifier','eff_attack_modifier','eff_ranged_attack_modifier','eff_ranged_attack_modifier'];
    const flags=types.map((type,i)=>Object.assign(new ScoreFlag(),{id:'f'+i,exists:true,x:i?80+i:0,y:i?80:0,
        effectType:type,scorePerTick:i===0?5:i<3?4:3,my:i===0?true:undefined}));
    const w={h,ally,creeps:[h,ally],flags,records:[],tick:1,reads:0,terrain:()=>0};
    w.objects=new Map([[Creep,w.creeps],[ScoreFlag,flags]]);globalThis.__closing=w;
    t.mock.method(console,'log',line=>w.records.push(JSON.parse(line)));t.after(()=>delete globalThis.__closing);
    return w;
}
function tick(w,n){w.tick=n;w.reads=0;for(const c of w.creeps)c.calls=[];w.records=[];
    assert.equal(new Set(w.creeps.map(c=>`${c.x},${c.y}`)).size,w.creeps.length);runTick();
    for(const c of w.creeps.filter(c=>c.my))assert(c.calls.filter(x=>['move','moveTo'].includes(x.method)).length<=1);
}
const movement=(w,id)=>w.records.find(r=>r.type==='action-decision'&&r.channel==='movement'&&r.actorId===id);
const heal=(w,id)=>w.records.find(r=>r.type==='action-decision'&&r.channel==='healing'&&r.actorId===id);
const attempt=(w,d)=>w.records.find(r=>r.type==='action-attempt'&&r.decisionId===d.decisionId);

test('checked-in closing switch is false and all previous switches retain their values',()=>{
    assert.equal(deployed.healerUsefulClosingExperiment,false);
    assert.equal(deployed.secondaryObjectiveExperiment,false);assert.equal(deployed.oneHealerEscortExperiment,true);
    assert.equal(deployed.oneScoutFlagExperiment,false);assert.equal(deployed.scoutHoldExperiment,false);assert.equal(deployed.squadPairExperiment,false);
});

test('closing uses one direct step with bounded correlated evidence and current-position ranged healing',t=>{
    const w=world(t);tick(w,1);const d=movement(w,'h');
    assert.equal(d.reason,'healer-useful-close');assert.deepEqual(d.actions[0].target,{kind:'position',id:null,x:6,y:4});
    assert.equal(d.actions[0].method,'move');assert.equal(attempt(w,d).returnCode,0);assert.equal(attempt(w,d).method,'move');
    assert.equal(attempt(w,d).actionId,d.actions[0].actionId);
    assert.deepEqual(w.h.calls.map(c=>c.method),['move','rangedHeal']);assert.equal(w.h.calls[0].direction,2);
    assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert.deepEqual([w.h.x,w.h.y],[5,5]);assert(w.reads<=10008);
    const snapshot=w.records.find(r=>r.type==='game-state');assert.deepEqual([snapshot.creeps.find(c=>c.id==='h').x,snapshot.creeps.find(c=>c.id==='h').y],[5,5]);
    const closure=w.records.find(r=>r.type==='evidence-coverage');assert(closure.coveredTypes.includes('action-attempt'));
    // Explicit generated next observation, never inferred from accepted movement.
    Object.assign(w.h,{x:6,y:4});tick(w,2);assert.equal(movement(w,'h').outcome,'hold');
    assert.deepEqual(w.h.calls.map(c=>c.method),['heal']);assert.equal(heal(w,'h').actions[0].target.id,'a');assert.equal(w.reads,0);assert.equal(w.ally.hits,200);
});

for(const outcome of ['A','B','neither'])test(`real tick flow: convergence ${outcome} keeps distinct positions and next-observation healing`,t=>{
    const w=world(t);Object.assign(w.h,{x:5,y:4});const b=unit('h2',5,6,body('heal'));w.creeps.push(b);
    const plain=[{x:5,y:4},{x:5,y:6},{x:7,y:5},{x:6,y:5}];w.terrain=p=>plain.some(c=>range(p,c)===0)?0:1;
    tick(w,1);for(const h of [w.h,b]){assert.equal(movement(w,h.id).reason,'healer-useful-close');assert.equal(heal(w,h.id).actions[0].method,'rangedHeal');}
    assert.equal(w.h.calls[0].direction,4);assert.equal(b.calls[0].direction,2);assert(w.reads<=10016);
    if(outcome==='A')Object.assign(w.h,{x:6,y:5});if(outcome==='B')Object.assign(b,{x:6,y:5});
    tick(w,2);assert(w.reads<=16);
    assert.deepEqual([w.h,b].map(h=>heal(w,h.id).actions[0].method),outcome==='A'?['heal','rangedHeal']:outcome==='B'?['rangedHeal','heal']:['rangedHeal','rangedHeal']);
    for(const h of [w.h,b])assert.equal(movement(w,h.id).reason,outcome==='neither'?'healer-useful-close':'injured-ally-in-range');
    assert.equal(w.ally.hits,200);
    if(outcome==='neither'){
        const e=unit('urgent',6,3,['attack','move'],{my:false});w.creeps.push(e);plain.push({x:6,y:3});
        tick(w,3);assert.equal(movement(w,'h').reason,'healer-pressure-retreat');assert.equal(w.h.calls[0].method,'moveTo');
        assert.equal(movement(w,'h2').outcome,'hold','reads existing retreat reservation; creates no closing reservations');
        assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert(w.reads<=16);
    }
});

test('accepted/rejected/unknown closing returns do not prove displacement or suppress later retreat',t=>{
    const w=world(t);
    for(const [i,result] of [0,-11,undefined].entries()){
        w.h.returns.move=result;tick(w,i+1);const d=movement(w,'h');assert.equal(d.reason,'healer-useful-close');
        assert.equal(attempt(w,d).returnCode,result??null);assert.deepEqual([w.h.x,w.h.y],[5,5]);
        assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert(w.reads<=(i===0?10008:8));
    }
    w.creeps.push(unit('pressure',8,5,['ranged_attack','move'],{my:false}));tick(w,4);
    assert.equal(movement(w,'h').reason,'healer-pressure-retreat');assert.equal(w.h.calls[0].method,'moveTo');
    assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert(w.reads<=8);
});

test('unsafe, blocked, unknown terrain/flags and unsupported parts retain baseline hold and healing',t=>{
    const w=world(t);
    const variants=['wall','swamp','unknown','occupied','ranged','melee','flags','parts'];
    for(const [i,kind] of variants.entries()){
        w.creeps.splice(2);w.terrain=()=>0;w.flags[1].my=undefined;w.ally.body=body('ranged_attack').map(type=>({type,hits:100}));
        if(kind==='wall')w.terrain=()=>1;if(kind==='swamp')w.terrain=()=>2;if(kind==='unknown')w.terrain=()=>undefined;
        if(kind==='occupied')for(const y of [4,5,6])w.creeps.push(unit('b'+y,6,y,['move']));
        if(kind==='ranged')w.creeps.push(unit('e',9,5,['ranged_attack'],{my:false}));
        if(kind==='melee'){w.creeps.push(unit('e',7,3,['attack'],{my:false}));w.terrain=p=>p.x===6&&p.y===4?0:1;}
        if(kind==='flags')w.flags[1].my=null;
        if(kind==='parts')w.ally.body.push({type:'unsupported',hits:100});
        tick(w,i+1);assert.equal(movement(w,'h').reason,'injured-ally-in-range',kind);
        assert.equal(heal(w,'h').actions[0].method,'rangedHeal',kind);assert(!w.h.calls.some(c=>['move','moveTo'].includes(c.method)),kind);
        assert(w.reads<=(i===0?10008:8));
    }
});

test('real escort acquisition after recovery supersedes old closing intent',t=>{
    const w=world(t);w.creeps.push(unit('guard',8,5,body('attack',8),{hits:1600,hitsMax:1600}));
    tick(w,1);assert.equal(movement(w,'h').reason,'healer-useful-close');
    w.ally.hits=w.ally.hitsMax;w.creeps.push(unit('enemy',10,5,['attack','move'],{my:false}));tick(w,2);
    assert.equal(movement(w,'h').reason,'escort-approach');assert.deepEqual(w.h.calls.map(c=>[c.method,c.id]),[['moveTo','guard']]);
    assert.equal(heal(w,'h').outcome,'no-action');assert.equal(w.reads,0);
});

test('nominal hybrids retain their original movement including destroyed weapons',t=>{
    const w=world(t);
    let n=0;
    for(const type of ['attack','ranged_attack'])for(const hits of [0,100]){
        w.h.body=body('heal').map(type=>({type,hits:100}));w.h.body.push({type,hits});tick(w,++n);
        assert.equal(movement(w,'h').reason,hits?'flag-fallback':'injured-ally-in-range');
        assert.equal(heal(w,'h').actions[0].method,'rangedHeal');
        assert.deepEqual(w.h.calls.map(c=>c.method),hits?['moveTo','rangedHeal']:['rangedHeal']);assert(w.reads<=(n===1?10000:0));
    }
});

test('real tick flow uses current healing-flag multipliers without changing current healing selection',t=>{
    const w=world(t);w.ally.hits=1180;tick(w,1);
    assert.equal(movement(w,'h').outcome,'hold','neutral modifier: injury20 already caps ranged capacity24');
    assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert.equal(w.reads,10000);
    w.flags[1].my=true;tick(w,2);
    assert.equal(movement(w,'h').reason,'healer-useful-close','0.75 modifier: capped potential18→20');
    assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert(w.reads<=8);
    w.flags[2].my=true;tick(w,3);
    assert.equal(movement(w,'h').reason,'healer-useful-close','0.5 modifier: capped potential12→20');
    assert.equal(heal(w,'h').actions[0].method,'rangedHeal');assert(w.reads<=8);
    assert.deepEqual([w.h.x,w.h.y],[5,5]);assert.equal(w.ally.hits,1180);
});

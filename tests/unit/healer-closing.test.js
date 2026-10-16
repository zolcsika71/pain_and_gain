import test from 'node:test';
import assert from 'node:assert/strict';
import {closingHealModifier,improveHealerHold} from '../../src/tactics/healer-closing.js';
import {moveCreeps} from '../../src/arena/execute.js';
import {localRetreatStep} from '../../src/tactics/movement.js';

function flags(){return ['eff_damage_taken_modifier','eff_heal_modifier','eff_heal_modifier','eff_attack_modifier','eff_attack_modifier','eff_ranged_attack_modifier','eff_ranged_attack_modifier'].map((effectType,i)=>({id:'f'+i,exists:true,x:i,y:0,effectType,scorePerTick:i===0?5:i<3?4:3,my:undefined}));}
test('closing modifier adapter requires the bounded complete flag contract and known ownership',()=>{
    const f=flags();assert.equal(closingHealModifier(f),1);f[1].my=true;assert.equal(closingHealModifier(f),0.75);
    f[2].my=true;assert.equal(closingHealModifier(f.reverse()),0.5);
    for(const change of [a=>a.pop(),a=>a.push(a[0]),a=>a[1].my=null,a=>a[1].my='me',a=>a[1].exists=false,
        a=>a[1].effectType='unknown',a=>a[1].scorePerTick=3,a=>a[1].id=a[0].id,a=>a[1].x=NaN]){
        const a=flags();change(a);assert.equal(closingHealModifier(a),null);
    }
    assert.equal(closingHealModifier(null),null);
});

function world(){
    const make=(id,x,types,options={})=>({id,x,y:5,my:true,exists:true,hits:1200,hitsMax:1200,fatigue:0,
        body:types.map(type=>({type,hits:100})),calls:[],...options,getRangeTo(p){return Math.max(Math.abs(this.x-p.x),Math.abs(this.y-p.y));},
        move(n){this.calls.push(['move',n]);return 0;},moveTo(p){this.calls.push(['moveTo',p.x,p.y]);return 0;}});
    const h=make('h',5,['heal','move']),a=make('a',7,['ranged_attack','move'],{hits:200});
    return{h,a,friends:[h,a],spacing:{creeps:[h,a],terrainAt:()=>0},baseline:{target:null,engagement:null,outcome:'hold',reason:'injured-ally-in-range',targetKind:null}};
}
test('unsupported policy observations conservatively return the supplied baseline',()=>{
    for(const change of [w=>w.a.body.push(null),w=>w.a.body.push({type:'unknown',hits:100}),
        w=>w.a.body[0].hits=101,w=>w.a.hits=1.5,w=>w.a.id='',w=>w.a.exists=undefined]){
        const w=world();change(w);assert.strictEqual(improveHealerHold({creep:w.h,friends:w.friends,enemies:[],spacing:w.spacing,
            baseline:w.baseline,owner:'ordinary',healModifier:1},()=>{throw Error('unsupported data reached neighbour search');}),w.baseline);
    }
});

test('executor-owned pair and capture/contest step or hold bypass enabled closing',()=>{
    for(const owner of ['pair','capture','contest'])for(const hold of [false,true]){
        const w=world(),records=[],target=hold?null:{x:5,y:4};
        const pair=owner==='pair'?{context:{leaderId:'h'},moves:new Map([['h',{target,reason:'pair-test'}]])}:null;
        const moves=owner!=='pair'?new Map([['h',target]]):null;
        const reporter={decision(d){records.push(d);return null;}};
        moveCreeps(w.friends,[],{x:0,y:0},new Map(),new Map(),null,null,reporter,false,pair,w.spacing,null,moves,owner,{healModifier:1});
        const d=records.find(d=>d.actorId==='h');assert.equal(d.reason,owner==='pair'?'pair-test':`${owner}-route-${hold?'hold':'step'}`);
        assert.equal(w.h.calls.length,hold?0:1);if(!hold)assert.deepEqual(w.h.calls[0],owner==='pair'?['moveTo',5,4]:['move',1]);
    }
});

test('missing direct-move API leaves ordinary baseline unchanged; new closing never reserves its destination',()=>{
    const w=world();w.h.move=undefined;
    moveCreeps(w.friends,[],{x:0,y:0},new Map(),new Map(),null,null,null,false,null,w.spacing,null,null,'contest',{healModifier:1});
    assert.deepEqual(w.h.calls,[]);
    const x=world();const reserved=new Set();x.spacing.reserved=reserved;
    const p=improveHealerHold({creep:x.h,friends:x.friends,enemies:[],spacing:x.spacing,baseline:x.baseline,owner:'ordinary',healModifier:1},localRetreatStep);
    assert.equal(p.reason,'healer-useful-close');assert.equal(reserved.size,0);
});

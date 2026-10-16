import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {healerUsefulClosingExperiment} from '../../src/config.js';

// Actual checked-in configuration; replace only Arena APIs and throw if either
// closing policy OR its flag adapter is evaluated while the switch is off.
const modules=new Map([
    ['game/utils','export const getObjectsByPrototype=p=>globalThis.__closingOff.objects.get(p);export const getObjects=()=>[...globalThis.__closingOff.objects.values()].flat();export const getTicks=()=>globalThis.__closingOff.tick;export const getTerrainAt=()=>{globalThis.__closingOff.reads++;return 0;};export const getCpuTime=()=>1234;'],
    ['game','export const arenaInfo={name:"Pain and Gain",season:"4",level:1,ticksLimit:2000,cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder','export const searchPath=()=>{throw Error("Unexpected explicit search");};'],
    ['game/constants','export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes','export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic','export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){
    const source=s.endsWith('/healer-closing.js')
        ?'export function improveHealerHold(){throw Error("disabled closing policy evaluated");} export function closingHealModifier(){throw Error("disabled flag adapter evaluated");}'
        :modules.get(s);
    return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(s,c);
}});
const {runTick}=await import('../../src/loop.js');
const {Creep}=await import('game/prototypes');
const {ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');

test('disabled real tick flow reproduces the frozen command trace without candidate evaluation',t=>{
    assert.equal(healerUsefulClosingExperiment,false);
    const calls=[],records=[];
    const unit=(id,x,y,types,options={})=>{
        const c=Object.assign(new Creep(),{id,x,y,my:true,exists:true,hits:1200,hitsMax:1200,fatigue:0,
            body:types.map(type=>({type,hits:100})),getRangeTo(p){return Math.max(Math.abs(this.x-p.x),Math.abs(this.y-p.y));},...options});
        for(const method of ['moveTo','heal','rangedHeal','rangedAttack','attack'])c[method]=p=>{calls.push([w.tick,id,method,p.id??null,p.x,p.y]);return 0;};
        c.move=()=>{throw Error('disabled baseline unexpectedly used a direct closing step');};return c;
    };
    const h=unit('h',5,5,['heal','move']),a=unit('a',7,5,['ranged_attack','move'],{hits:200});
    const flag=Object.assign(new ScoreFlag(),{id:'centre',exists:true,my:true,x:0,y:0});
    const w={tick:1,reads:0,objects:new Map([[Creep,[h,a]],[ScoreFlag,[flag]]])};globalThis.__closingOff=w;
    t.after(()=>delete globalThis.__closingOff);t.mock.method(console,'log',s=>records.push(JSON.parse(s)));
    runTick();assert.equal(w.reads,10000);
    a.hits=1200;w.tick=2;w.reads=0;runTick();assert.equal(w.reads,0);
    a.hits=200;a.x=9;w.tick=3;runTick();assert.equal(w.reads,0);
    Object.assign(a,{x:5,y:4});const enemy=unit('e',6,6,['attack','move'],{my:false});
    w.objects.get(Creep).push(enemy);w.tick=4;runTick();assert(w.reads<=8);
    h.body.push({type:'ranged_attack',hits:100});w.tick=5;w.reads=0;runTick();assert.equal(w.reads,0);
    assert.deepEqual(calls,[
        [1,'a','moveTo','centre',0,0],[1,'h','rangedHeal','a',7,5],
        [2,'h','moveTo','centre',0,0],[2,'a','moveTo','centre',0,0],
        [3,'h','moveTo','a',9,5],[3,'a','moveTo','centre',0,0],
        [4,'h','moveTo',null,4,4],[4,'h','heal','a',5,4],[4,'a','rangedAttack','e',6,6],
        [5,'h','heal','a',5,4],[5,'h','rangedAttack','e',6,6],[5,'a','rangedAttack','e',6,6],
    ]);
    assert(!records.some(r=>r.reason==='healer-useful-close'));
    assert.deepEqual([h.x,h.y],[5,5]);assert.equal(a.hits,200);
});

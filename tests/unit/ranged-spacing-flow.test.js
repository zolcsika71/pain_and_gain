import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const modules = new Map([
    ['game/utils', 'export const getObjectsByPrototype=p=>globalThis.__spacingObjects.get(p); export const getObjects=()=>[...globalThis.__spacingObjects.values()].flat(); export const getTerrainAt=()=>{globalThis.__spacingTerrain++;return 0;}; export const getTicks=()=>globalThis.__spacingTick; export const getCpuTime=()=>1234;'],
    ['game', 'export const arenaInfo={name:"Pain and Gain",season:"4",level:1,ticksLimit:2000,cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder', 'export const searchPath=()=>{throw Error("Unexpected explicit route search");};'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){const source=modules.get(s);return source?{url:`data:text/javascript,${encodeURIComponent(source)}`,shortCircuit:true}:next(s,c);}});
const {runTick}=await import('../../src/loop.js');
const {Creep}=await import('game/prototypes');
const {ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');
test('actual tick flow supplies terrain/occupancy, reports one accepted retreat and keeps ranged attack',t=>{
    const calls=[],records=[];
    const actor=(id,x,y,my,types)=>Object.assign(new Creep(),{id,x,y,my,exists:true,hits:100,hitsMax:100,fatigue:0,
        body:types.map(type=>({type,hits:100})),getRangeTo(o){return Math.max(Math.abs(this.x-o.x),Math.abs(this.y-o.y));},
        moveTo(o){calls.push([id,'moveTo',o.x,o.y]);return 0;},rangedAttack(o){calls.push([id,'rangedAttack',o.id]);return 0;},attack(){return 0;}});
    const r=actor('r',5,5,true,['ranged_attack','move']),e=actor('e',4,5,false,['attack','move']);
    globalThis.__spacingObjects=new Map([[Creep,[r,e]],[ScoreFlag,[Object.assign(new ScoreFlag(),{id:'first',x:0,y:0})]]]);
    globalThis.__spacingTick=60;globalThis.__spacingTerrain=0;
    t.mock.method(console,'log',s=>records.push(JSON.parse(s)));
    try {
        runTick();
        assert.equal(calls.filter(c=>c[0]==='r'&&c[1]==='moveTo').length,1);
        assert(calls.some(c=>c[0]==='r'&&c[1]==='rangedAttack'));
        const decision=records.find(r=>r.type==='action-decision'&&r.reason==='ranged-melee-retreat');assert(decision);
        assert(records.some(r=>r.type==='action-attempt'&&r.decisionId===decision.decisionId&&
            r.actionId===decision.actions[0].actionId&&r.actorId==='r'&&r.channel==='movement'&&r.returnCode===0));
        assert(globalThis.__spacingTerrain<=10008,'Map capture plus at most eight local terrain checks');
        // Generated displacement, not an observed Arena effect.
        const move=calls.find(c=>c[0]==='r'&&c[1]==='moveTo');r.x=move[2];r.y=move[3];
        calls.length=0;globalThis.__spacingTerrain=0;globalThis.__spacingTick=61;runTick();
        assert(!calls.some(c=>c[0]==='r'&&c[1]==='moveTo'));
        assert(calls.some(c=>c[0]==='r'&&c[1]==='rangedAttack'));assert.equal(globalThis.__spacingTerrain,0);
    } finally {for(const key of ['__spacingObjects','__spacingTick','__spacingTerrain'])delete globalThis[key];}
});

test('actual tick flow supplies a pure healer escape while preserving its healing choice and next-tick hold',t=>{
    const calls=[],records=[];
    const actor=(id,x,y,my,types,hits=100)=>Object.assign(new Creep(),{id,x,y,my,exists:true,hits,hitsMax:100,fatigue:0,
        body:types.map(type=>({type,hits:100})),getRangeTo(o){return Math.max(Math.abs(this.x-o.x),Math.abs(this.y-o.y));},
        ...Object.fromEntries(['moveTo','heal','rangedHeal','attack','rangedAttack'].map(method=>[method,function(o){calls.push({id,method,target:o.id??null,x:o.x,y:o.y});return 0;}]))});
    const h=actor('h',5,5,true,['heal','move']),ally=actor('ally',5,4,true,['attack','move'],60),enemy=actor('enemy',6,6,false,['attack','move']);
    globalThis.__spacingObjects=new Map([[Creep,[h,ally,enemy]],[ScoreFlag,[Object.assign(new ScoreFlag(),{id:'centre',x:0,y:0})]]]);
    globalThis.__spacingTick=1;globalThis.__spacingTerrain=0;t.mock.method(console,'log',s=>records.push(JSON.parse(s)));
    try{
        runTick();const decision=records.find(r=>r.type==='action-decision'&&r.reason==='healer-pressure-retreat');assert(decision);
        assert(records.some(r=>r.type==='action-attempt'&&r.decisionId===decision.decisionId&&r.returnCode===0));
        assert.deepEqual(calls.find(c=>c.id==='h'&&c.method==='moveTo'),{id:'h',method:'moveTo',target:null,x:4,y:4});
        assert(calls.some(c=>c.id==='h'&&c.method==='heal'&&c.target==='ally'));assert(globalThis.__spacingTerrain<=10008);
        // Supplied generated next observation, not movement or healing resolution.
        h.x=4;h.y=4;calls.length=0;globalThis.__spacingTick=2;globalThis.__spacingTerrain=0;runTick();
        assert(!calls.some(c=>c.id==='h'&&c.method==='moveTo'));assert(calls.some(c=>c.id==='h'&&c.method==='heal'&&c.target==='ally'));
        assert.equal(globalThis.__spacingTerrain,0);
    }finally{for(const key of ['__spacingObjects','__spacingTick','__spacingTerrain'])delete globalThis[key];}
});

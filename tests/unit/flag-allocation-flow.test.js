import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Keep production tick orchestration and planner; replace Arena imports and
// the deployment switch only at the module boundary for this enabled-mode test.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__flagFlowObjects.get(prototype); export const getObjects = () => [...globalThis.__flagFlowObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__flagFlowTick; export const getCpuTime = () => 123456;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
    ['game/path-finder', 'export const searchPath = (...args) => globalThis.__flagFlowSearch(...args);'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === './config.js' && context.parentURL?.endsWith('/src/loop.js')) {
            return { url: 'data:text/javascript,export const oneScoutFlagExperiment = true; export const oneHealerEscortExperiment = false; export const scoutHoldExperiment = false; export const squadPairExperiment = false;', shortCircuit: true };
        }
        const source = arenaModules.get(specifier);
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('enabled runTick selects the earliest safe pair, logs routes, then completes one attempt', t => {
    const events = [];
    const logs = [];
    t.mock.method(console, 'log', line => { logs.push(JSON.parse(line)); events.push('log'); });
    const first = Object.assign(new ScoreFlag(), { id: 'first', x: 11, y: 10, my: true,
        effectType: 'other', scorePerTick: 4 });
    const target = Object.assign(new ScoreFlag(), { id: 'target', x: 20, y: 10,
        effectType: 'eff_attack_modifier', scorePerTick: 3 });
    const scout = Object.assign(new Creep(), { id: 'scout', x: 10, y: 10, my: true,
        hits: 100, hitsMax: 100, fatigue: 0, body: [{ type: 'move', hits: 100 }],
        moveTo(flag) { events.push(`scout:${flag.id}`); } });
    const fartherScout = Object.assign(new Creep(), { id: 'farther-scout', x: 7, y: 10, my: true,
        hits: 100, hitsMax: 100, fatigue: 0, body: [{ type: 'move', hits: 100 }],
        moveTo(flag) { events.push(`farther-scout:${flag.id}`); } });
    const defender = Object.assign(new Creep(), { id: 'defender', x: 11, y: 11, my: true,
        hits: 100, hitsMax: 100, fatigue: 0, body: [{ type: 'attack', hits: 100 }],
        moveTo(flag) { events.push(`defender:${flag.id}`); } });
    let searches = 0;
    globalThis.__flagFlowSearch = (from, goal, options) => {
        searches++;
        assert.equal(goal.range, 0);
        assert.equal(options.maxOps, 5000);
        return { path: Array(from === fartherScout ? 13 : 10), incomplete: false, cost: 12, ops: 37 };
    };
    globalThis.__flagFlowObjects = new Map([[ScoreFlag, [first, target]], [Creep, [scout, fartherScout, defender]]]);
    try {
        globalThis.__flagFlowTick = 40;
        runTick();
        target.my = true;
        globalThis.__flagFlowTick = 41;
        runTick();
        globalThis.__flagFlowTick = 42;
        runTick();
        globalThis.__flagFlowTick = 43;
        runTick();
    } finally {
        delete globalThis.__flagFlowTick;
        delete globalThis.__flagFlowObjects;
        delete globalThis.__flagFlowSearch;
    }
    assert.equal(searches, 2);
    assert.deepEqual(logs.filter(entry => entry.type === 'flag-allocation').map(entry =>
        [entry.tick, entry.event, entry.reason, entry.objectiveId]), [
        [40, 'assign', 'shortest-eligible-route', 'target'],
        [41, 'complete', 'target-owned', 'first'],
        [42, 'reject', 'attempt-finished', 'first'],
    ]);
    const assignment = logs.find(entry => entry.type === 'flag-allocation');
    assert.equal(assignment.scoutId, scout.id);
    assert.deepEqual(assignment.evaluations.find(item => item.scoutId === scout.id).scoutRoute,
        { incomplete: false, length: 10, cost: 12, ops: 37 });
    assert.deepEqual(events.filter(entry => entry.startsWith('scout:')),
        ['scout:target', 'scout:first', 'scout:first', 'scout:first']);
    assert.deepEqual(events.filter(entry => entry.startsWith('farther-scout:')),
        Array(4).fill('farther-scout:first'));
    assert.ok(events.indexOf('scout:target') > events.indexOf('log'));
});

test('enabled late tick flow contests once, holds at target, then returns without changing defender movement', t => {
    const events=[], logs=[];
    t.mock.method(console,'log',line=>logs.push(JSON.parse(line)));
    const first=Object.assign(new ScoreFlag(),{id:'first',x:11,y:10});
    const target=Object.assign(new ScoreFlag(),{id:'target',x:20,y:10,my:false,effectType:'eff_attack_modifier'});
    const actor=(id,x,y,my,types)=>Object.assign(new Creep(),{id,x,y,my,hits:100,hitsMax:100,fatigue:0,
        body:types.map(type=>({type,hits:100})),
        getRangeTo(t){return Math.max(Math.abs(this.x-t.x),Math.abs(this.y-t.y));},
        moveTo(t){events.push([id,t.id]);return 0;}});
    const scout=actor('scout',10,10,true,['move']);
    const defender=actor('defender',11,11,true,['attack','move']);
    const enemy=actor('enemy-scout',70,70,false,['move']);
    let searches=0;
    globalThis.__flagFlowObjects=new Map([[ScoreFlag,[first,target]],[Creep,[scout,defender,enemy]]]);
    globalThis.__flagFlowSearch=(from,goal,options)=>{
        searches++;assert.equal(options.maxOps,5000);assert.equal(goal.range,0);
        return{path:Array(scout.getRangeTo(target)),incomplete:false,cost:20,ops:20};
    };
    try {
        globalThis.__flagFlowTick=1;runTick(); // resets the preceding test's finished attempt
        Object.assign(first,{my:true}); // simulated engine ownership update on the mock
        globalThis.__flagFlowTick=520;runTick();
        scout.x=20;
        globalThis.__flagFlowTick=521;runTick(); // still enemy-owned: zero-step hold
        target.my=true;
        globalThis.__flagFlowTick=522;runTick();
        globalThis.__flagFlowTick=540;runTick();
    } finally {
        delete globalThis.__flagFlowTick;delete globalThis.__flagFlowObjects;delete globalThis.__flagFlowSearch;
    }
    assert.equal(searches,2);
    assert.deepEqual(logs.filter(e=>e.type==='flag-allocation').map(e=>[e.tick,e.event,e.reason]),[
        [1,'reject','first-flag-not-owned'],[520,'assign','shortest-eligible-route'],
        [521,'retain','target-eligible'],[522,'complete','target-owned'],[540,'reject','attempt-finished'],
    ]);
    assert.deepEqual(events.filter(([id])=>id==='scout'),[
        ['scout','first'],['scout','target'],['scout','first'],['scout','first'],
    ]);
    assert.deepEqual(events.filter(([id])=>id==='defender'),Array.from({length:5},()=>['defender','first']));
});

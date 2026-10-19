// Generated-only real runTick coverage: no retained payload/seed reader imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {openingWorld} from '../fixtures/opening-secondary-generated-world.js';
import {congestedWorld} from '../fixtures/opening-secondary-congested-world.js';
import {useGeneratedOpeningSearch} from '../fixtures/opening-secondary-search-api.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {selectSecondaryObjective} from '../../src/strategy/objectives.js';
import {openingDeploymentExperiment} from '../../src/config.js';
import {TestCostMatrix} from '../fixtures/arena-cost-matrix.js';
import {validActionDecision,validActionAttempt} from '../../tools/replay-logs.js';

const configuration=fs.readFileSync(new URL('../../src/config.js',import.meta.url),'utf8');
const controller=new URL('../../src/strategy/opening-deployment.js',import.meta.url).href;
const centreController=new URL('../../src/strategy/opening-centre-support.js',import.meta.url).href;
const probeController=new URL('../../src/debug/opening-route-probe.js',import.meta.url).href;
const configurations=new Map();let instance=0;
const modules=new Map([
    ['game/utils','export const getObjectsByPrototype=p=>globalThis.__opening.objects.get(p); export const getObjects=()=>globalThis.__opening.spacing.creeps; export const getTicks=()=>globalThis.__opening.tick; export const getTerrainAt=(...p)=>globalThis.__opening.spacing.terrainAt(...p); export const getCpuTime=()=>1234;'],
    ['game','export const arenaInfo={cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder','export const searchPath=(...a)=>globalThis.__opening.searchPath(...a); export class CostMatrix {constructor(){return globalThis.__opening.newMatrix();}}'],
    ['game/constants','export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes','export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic','export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){
    let code=modules.get(s);
    if(s==='./config.js'&&c.parentURL?.includes('/src/loop.js'))code=configurations.get(c.parentURL);
    if(s==='./strategy/opening-deployment.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `export {openingDeploymentDiagnostic} from ${JSON.stringify(controller)}; import {planOpeningDeployment as plan} from ${JSON.stringify(controller)}; export function planOpeningDeployment(...a){globalThis.__opening.evaluations++;return plan(...a);}`;
    if(s==='./strategy/opening-centre-support.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `import {planCentreSupport as plan} from ${JSON.stringify(centreController)}; export function planCentreSupport(...a){const w=globalThis.__opening;w.centreEvaluations++;if(w.centreOwner)a[0].escort=w.centreOwner;return w.centrePlan=plan(...a);}`;
    if(s==='./debug/opening-route-probe.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `export {resetOpeningRouteProbe} from ${JSON.stringify(probeController)}; import {probeOpeningRoute as probe} from ${JSON.stringify(probeController)}; export function probeOpeningRoute(a){const w=globalThis.__opening;w.probeEvaluations++;return w.probeResult=probe(a);}`;
    return code?{url:`data:text/javascript,${encodeURIComponent(code)}`,shortCircuit:true}:next(s,c);
}});
const {Creep}=await import('game/prototypes'),{ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');
const point=c=>({x:c.x,y:c.y}),range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const tactical=calls=>calls.filter(c=>!['move','moveTo'].includes(c.method));
const healing=c=>c.body.some(p=>p.type==='heal'&&p.hits>0);
const armed=c=>c.body.some(p=>['attack','ranged_attack'].includes(p.type)&&p.hits>0);
function supportedOutcomes(w){
    const moves=new Map([...w.centrePlan.moves,...w.diagnostic.travel.actors.map(a=>
        [w.spacing.creeps[w.diagnostic.memberSlots[a.slot]].id,a.admitted])]);
    for(const squad of w.membership.squads){
        const steps=new Map(squad.memberIds.map(id=>[id,moves.get(id)??null]));
        assert(secondaryStepSupport(w.myCreeps,squad.memberIds,steps));
        for(let mask=0;mask<16;mask++){
            const group=squad.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?steps.get(id):null)}));
            const hs=group.filter(healing),ws=group.filter(armed);
            assert(ws.every(c=>hs.some(h=>range(c,h)<=3)));
            assert(hs.every(h=>ws.filter(c=>range(c,h)<=3).length>=2));
        }
    }
    assert.equal(w.centrePlan.work.actors,8);assert(w.centrePlan.work.neighbours<=64);
    assert.equal(w.centrePlan.work.searches,0);assert(w.centrePlan.work.subsets.every(s=>s.examined<=16));
}

async function fixture(t,{enabled=true,conflicts=[],make=openingWorld,probe=false}={}){
    const w=useGeneratedOpeningSearch(make());w.logs=[];w.evaluations=0;w.centreEvaluations=0;
    w.probeEvaluations=0;w.probeRequests=[];
    w.matrices=0;w.newMatrix=()=>{w.matrices++;return new TestCostMatrix();};
    for(const c of w.spacing.creeps)Object.setPrototypeOf(c,Creep.prototype);
    for(const f of w.flags)Object.setPrototypeOf(f,ScoreFlag.prototype);
    w.objects=new Map([[Creep,w.spacing.creeps],[ScoreFlag,w.flags]]);
    let config=configuration;
    for(const name of [...(enabled?['openingDeploymentExperiment']:[]),...(probe?['openingRouteProbeExperiment']:[]),...conflicts])
        config=config.replace(`${name} = false`,`${name} = true`);
    const url=new URL(`../../src/loop.js?opening-${instance++}`,import.meta.url).href;
    configurations.set(url,config);w.loop=await import(url);globalThis.__opening=w;
    t.mock.method(console,'log',s=>w.logs.push(JSON.parse(s)));
    w.step=tick=>{
        globalThis.__opening=w;w.tick=tick;w.bind();w.reports();w.calls=[];w.logs=[];w.centrePlan=null;w.loop.runTick();
        w.membership=w.loop.getMembershipState();
        const game=w.logs.find(r=>r.type==='game-state');assert.equal(game.selectedFlagId,w.centreId);
        assert.equal(w.logs.filter(r=>r.type==='game-state').length,1);
        for(const c of w.myCreeps)assert(w.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
        assert(w.logs.filter(r=>r.type==='action-decision').every(validActionDecision));
        assert(w.logs.filter(r=>r.type==='action-attempt').every(validActionAttempt));
        w.game=game;w.diagnostic=game.secondaryObjective;
        if(w.diagnostic)assert(JSON.stringify(w.diagnostic).length<2700);
        return w.diagnostic;
    };
    w.observe=(calls=w.calls.filter(c=>c.method==='move'))=>{
        // Supplied next positions, not engine movement or collision arbitration.
        for(const c of calls){assert.equal(range(w.actor(c.id),c),1);
            assert(!w.spacing.creeps.some(p=>p.hits>0&&p.x===c.x&&p.y===c.y));
            const slot=w.diagnostic.memberSlots.indexOf(w.spacing.creeps.indexOf(w.actor(c.id)));
            if(slot>=0)assert.deepEqual(w.diagnostic.travel.actors.find(a=>a.slot===slot).admitted,point(c));
            else assert.deepEqual(w.centrePlan.moves.get(c.id),point(c));}
        assert.equal(new Set(calls.map(c=>`${c.x},${c.y}`)).size,calls.length);
        for(const c of calls)Object.assign(w.actor(c.id),point(c));w.distinct();
    };
    return w;
}

// Generated free-cell convergence. No engine arbitration or historical geometry.
function probeWorld(){
    const w=openingWorld();
    for(const [id,y]of [['medic',20],['bow1',19],['bow2',21],['guardR2',22]])Object.assign(w.actor(id),{x:25,y});
    w.membership=null;w.bind();const original=w.reports;
    w.reports=()=>{original([w.flags[1].id]);for(const r of w.routes.filter(r=>r.flagId===w.flags[1].id)){
        const y=w.actor(r.actorId).y<=20?20:21;
        r.path=Array.from({length:19},(_,i)=>({x:26+i,y}));if(y===21)r.path.push({x:44,y:20});
    }};
    return w;
}
function probeSearch(w,{throwFirst=false}={}){
    const live=w.searchPath;
    w.searchPath=(origin,goal,options)=>{
        if(origin.id!==undefined)return live(origin,goal,options);
        assert(!w.calls.length,'probe occurs before movement/tactical execution');
        assert(w.probeResult?.state.spent!==false);
        w.probeRequests.push({tick:w.tick,origin,goal,options});
        if(throwFirst)throw Error('controlled diagnostic failure');
        const extra=options.costMatrix.get(26,20)===255,y=extra?origin.y-1:20;
        const path=Array.from({length:19},(_,i)=>({x:26+i,y}));
        for(let last=y;last!==20;)path.push({x:44,y:last+=Math.sign(20-last)});
        return {path,incomplete:false,ops:1000};
    };
}

function rangedProbeWorld(){
    const w=probeWorld(),original=w.reports;
    w.reports=()=>{original();for(const r of w.routes.filter(r=>r.flagId===w.flags[1].id)){
        const actor=w.actor(r.actorId),y=actor.id==='medic'?19:actor.id==='guardR2'?21:20;
        r.path=Array.from({length:19},(_,i)=>({x:26+i,y}));
        if(y!==20)r.path.push({x:44,y:20});
    }};
    return w;
}

test('real tick ranged conflict samples original birth slot without changing live execution',async t=>{
    const traces=[];
    for(const probe of [false,true]){
        const w=await fixture(t,{probe,make:rangedProbeWorld});probeSearch(w);const rows=[];
        for(let tick=1;tick<=5;tick++){
            const {routeProbe,probeEligibility,...live}=w.step(tick);
            rows.push({live,calls:structuredClone(w.calls)});
            if(probe&&tick===2){
                assert(routeProbe,'ranged-only conflict must be sampled');
                assert.equal(w.game.creeps[live.memberSlots[routeProbe.actorSlot]].id,'bow1');
                assert.equal(routeProbe.queries,2);assert.equal(live.queries,0);
                assert(routeProbe.results.every(r=>r.status==='complete'));
                assert.deepEqual(probeEligibility,{status:'eligible',first:null,later:null});
            }
        }
        assert.equal(w.diagnostic.reason,'no-displacement');
        assert.equal(w.probeRequests.length,probe?2:0);traces.push(rows);
    }
    assert.deepEqual(traces[0],traces[1]);
});

test('route probe bypasses evaluation and telemetry when off or opening off',async t=>{
    for(const options of [{probe:false},{probe:true,enabled:false}]){
        const w=await fixture(t,{...options,make:probeWorld});probeSearch(w);
        w.step(1);w.step(2);assert.equal(w.probeEvaluations,0);assert.equal(w.probeRequests.length,0);
    }
});

test('incompatible configuration and priority cancellation report only the first stop without probe work',async t=>{
    const incompatible=await fixture(t,{probe:true,conflicts:['secondaryObjectiveExperiment'],make:probeWorld});
    probeSearch(incompatible);
    assert.deepEqual(incompatible.step(1).probeEligibility,{status:'failed',first:'configuration',later:'unknown'});
    assert.equal(incompatible.probeRequests.length,0);assert.equal(incompatible.probeResult.state.spent,false);
    const w=await fixture(t,{probe:true,make:probeWorld});probeSearch(w);
    w.centreOwner={healerId:'guardH1',allyId:'guardM0'};
    const d=w.step(1);assert.equal(d.phase,'finished');assert.equal(w.probeEvaluations,1);
    assert.deepEqual(d.probeEligibility,{status:'failed',first:'mission',later:'unknown'});
    assert.equal(w.probeResult.state.spent,false);
    w.step(2);assert.equal(w.probeRequests.length,0);
});

test('real one-shot probe retains same live routes, timers, movements and tactical traces',async t=>{
    const traces=[];
    for(const probe of [false,true]){
        const w=await fixture(t,{probe,make:probeWorld});probeSearch(w);const rows=[];
        for(let tick=1;tick<=5;tick++){
            const d=w.step(tick),{routeProbe,probeEligibility,...live}=d;
            rows.push({diagnostic:live,calls:structuredClone(w.calls)});
            assert(d.queries+(routeProbe?.queries??0)<= (tick===1?24:4));
            if(probe&&tick===2){
                assert.equal(d.cacheHits,4);assert.equal(d.queries,0);assert.equal(routeProbe.queries,2);
                assert.equal(routeProbe.reportedOps,2000);assert.equal(routeProbe.results.length,2);
                assert(routeProbe.results.every(r=>r.status==='complete'));
                assert.equal(routeProbe.mapTick,1);assert.equal(w.probeResult.state.spent,true);
                assert.equal(w.searchRequests.length,16); // Live acquisition only; probe accounted separately.
            }else assert.equal(routeProbe,undefined);
        }
        assert.equal(w.diagnostic.reason,'no-displacement');assert.equal(w.diagnostic.startedAt,1);
        assert.equal(w.probeRequests.length,probe?2:0);traces.push(rows);
    }
    assert.deepEqual(traces[0],traces[1]);
});

test('probe exceptions stay diagnostic-only; duplicates/late rewind do not replenish, genuine match reset does',async t=>{
    const w=await fixture(t,{probe:true,make:probeWorld});probeSearch(w,{throwFirst:true});
    w.step(1);const d=w.step(2);assert.equal(d.routeProbe.queries,1);
    assert.equal(d.routeProbe.results[0].status,'thrown');assert.equal(d.phase,'active');
    assert.equal(w.step(2).phase,'finished');assert.equal(w.probeRequests.length,1);
    w.step(3);w.step(2);assert.equal(w.probeResult.state.spent,true);assert.equal(w.probeRequests.length,1);
    assert.equal(w.step(1).phase,'active');assert.equal(w.probeResult.state.spent,false);
    w.step(2);assert.equal(w.probeRequests.length,2);assert.equal(w.probeResult.state.spent,true);
});

test('probe cannot spend additional work on a live four-query refresh',async t=>{
    const w=await fixture(t,{probe:true});probeSearch(w);
    for(let tick=1;tick<=6;tick++){
        const d=w.step(tick);assert.equal(d.routeProbe,undefined);
        if(tick===6)assert.equal(d.queries,4);
        if(tick<6)w.observe();
    }
    assert.equal(w.probeRequests.length,0);
});

test('complete real opening diagnostic with probe remains bounded under maximum escaped IDs',async t=>{
    for(const char of ['"','\\','\u0001']){
        const w=await fixture(t,{probe:true,make:probeWorld});
        for(const c of w.spacing.creeps)c.id=(c.id+'-'+char.repeat(128)).slice(0,128);
        for(const f of w.flags)f.id=(f.id+'-'+char.repeat(128)).slice(0,128);
        w.centreId=w.centre.id;w.membership=null;w.bind();probeSearch(w);
        assert.equal(w.step(1).phase,'active');const d=w.step(2);
        assert.equal(d.routeProbe.results.length,2);assert.equal(d.routeProbe.actorSlot,3);
        assert(JSON.stringify(d).length<2700);assert(!JSON.stringify(d).includes(char.repeat(20)));
        assert.equal(w.game.creeps[d.memberSlots[d.routeProbe.actorSlot]].id,
            w.myCreeps.find(c=>c.body.some(p=>p.type==='heal')&&c.x===25).id);
    }
});

test('default-off bypasses opening evaluation and preserves centre-only and combat/healing command traces',async t=>{
    assert.equal(openingDeploymentExperiment,false);
    for(const contact of [false,true]){
        const w=await fixture(t,{enabled:false});if(contact){Object.assign(w.enemies[3],{x:28,y:19});w.actor('bow1').hits--;}
        assert.equal(w.step(1),undefined);assert.equal(w.evaluations,0);assert.equal(w.searchRequests.length,0);
        assert.equal(w.matrices,0);assert.equal(w.centreEvaluations,0);
        const actual=[...w.calls];w.calls=[];
        moveCreeps(w.myCreeps,w.enemies,w.centre,new Map(),new Map(),null,null,null,false,null,w.spacing);
        executeTactics(w.myCreeps,w.enemies,w.myCreeps.filter(c=>c.hits<c.hitsMax),null,
            {tick:1,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
        assert.deepEqual(w.calls,actual);
    }
});

test('real active opening owns eight retained actors with distinct centre provenance',async t=>{
    const w=await fixture(t),d=w.step(1),group=w.group().memberIds;
    assert.equal(d.phase,'active');
    const decisions=w.logs.filter(r=>r.type==='action-decision'&&r.channel==='movement');
    const centre=decisions.filter(r=>r.reason==='opening-centre-step'||r.reason==='opening-centre-hold');
    assert.equal(centre.length,8);assert(centre.some(r=>r.reason==='opening-centre-step'));
    assert(centre.every(r=>!group.includes(r.actorId)));
    assert.equal(decisions.filter(r=>r.reason==='capture-route-step').length,4);
    assert.equal(w.calls.filter(c=>c.method==='moveTo').length,2);
    assert.equal(d.memberSlots.length,4);assert.equal(d.queries,16);
});

test('real opening sustains both groups with support in every admitted move/stay outcome and unchanged tactics',async t=>{
    const w=await fixture(t),birth=new Map(w.myCreeps.map(c=>[c.id,point(c)])),counts=[];
    for(let tick=1;tick<=8;tick++){
        const d=w.step(tick);assert.equal(d.phase,'active');assert.equal(d.startedAt+60,61);
        supportedOutcomes(w);const moves=w.calls.filter(c=>c.method==='move');
        counts.push({centre:moves.filter(c=>w.centrePlan.moves.has(c.id)).length,
            secondary:moves.filter(c=>w.group().memberIds.includes(c.id)).length,queries:d.queries});
        const actions=tactical(w.calls);w.calls=[];
        executeTactics(w.myCreeps,w.enemies,[],null,{tick,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
        assert.deepEqual(tactical(w.calls),actions);
        if(tick<8)w.observe(moves);
    }
    assert(counts.filter(c=>c.centre>0&&c.secondary>0).length>=5);
    for(const c of w.myCreeps.filter(c=>w.centrePlan.moves.has(c.id)))
        assert(range(c,w.centre)<range(birth.get(c.id),w.centre));
    assert.deepEqual(counts.map(c=>c.queries),[16,0,0,0,0,4,0,0]);
    t.diagnostic(JSON.stringify({case:'real-both-forces',counts}));
});

test('real centre-only progress cannot replenish a stalled departing mission',async t=>{
    const w=await fixture(t);let d;
    for(let tick=1;tick<=5;tick++){
        d=w.step(tick);assert.equal(d.startedAt,1);
        if(tick<5){supportedOutcomes(w);w.observe(w.calls.filter(c=>c.method==='move'&&w.centrePlan.moves.has(c.id)));}
    }
    assert.equal(d.reason,'no-displacement');assert.equal(d.phase,'finished');
    // Terminal diagnostics retain the last active counter; tick5 is the fourth
    // unchanged observation after tick1, not a fifth active preparation.
    assert.equal(d.unchanged,3);assert.equal(w.centreEvaluations,4);
    const evaluations=w.centreEvaluations;assert.equal(w.centrePlan,null);
    assert(!w.logs.some(r=>r.reason?.startsWith('opening-centre-')||r.reason?.startsWith('capture-route-')));
    assert.equal(w.step(6).phase,'finished');assert.equal(w.centreEvaluations,evaluations);
});

test('real prepared departing steps are discarded on centre priority handoff before the single movement pass',async t=>{
    const w=await fixture(t);
    // Generated ownership input at the preparation boundary. The real escort
    // selector's earlier admission fencing is covered separately below.
    w.centreOwner={healerId:'guardH1',allyId:'guardM0'};
    const d=w.step(1);assert.equal(d.queries,16);assert.equal(d.reason,'centre-priority-handoff');
    assert.equal(d.phase,'finished');assert.equal(w.centrePlan.work.neighbours,0);
    assert(!w.calls.some(c=>c.method==='move'));
    assert(!w.logs.some(r=>r.reason?.startsWith('opening-centre-')||r.reason?.startsWith('capture-route-')));
    const actual=[...w.calls];w.calls=[];
    moveCreeps(w.myCreeps,w.enemies,w.centre,new Map(),new Map(),null,null,null,false,null,w.spacing);
    executeTactics(w.myCreeps,w.enemies,[],null,{tick:1,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
    assert.deepEqual(w.calls,actual);delete w.centreOwner;
    assert.equal(w.step(2).phase,'finished');assert.equal(w.centrePlan,null);
});

test('real partial movement and permanently non-displacing centre healers bound centre progress without weakening support',async t=>{
    const w=await fixture(t),counts=[];
    for(let tick=1;tick<=8;tick++){
        const d=w.step(tick);assert.equal(d.phase,'active');supportedOutcomes(w);
        const moves=w.calls.filter(c=>c.method==='move');
        counts.push(moves.filter(c=>w.centrePlan.moves.has(c.id)&&armed(w.actor(c.id))).length);
        if(tick<8)w.observe(moves.filter(c=>!(w.centrePlan.moves.has(c.id)&&healing(w.actor(c.id)))&&
            !(tick===1&&c.id==='bow1')));
    }
    assert(counts.some(n=>n>0));assert.equal(counts.at(-1),0);
    assert.equal(w.diagnostic.startedAt,1);
});

test('real cross-centre convergence holds both contenders while other safe actors progress',async t=>{
    const make=()=>{
        const w=openingWorld(),positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[10,11],
            guardH2:[13,10],blade:[14,9],guardR0:[14,10],guardR1:[13,11]};
        for(const [id,[x,y]]of Object.entries(positions))Object.assign(w.actor(id),{x,y});
        w.centre.x=12;w.membership=null;w.bind();w.reports();return w;
    };
    const w=await fixture(t,{make});assert.equal(w.step(1).phase,'active');supportedOutcomes(w);
    const contenders=w.centrePlan.details.filter(d=>d.reason==='cross-squad-convergence');
    assert(contenders.length>=2);
    for(const c of contenders){assert.equal(w.centrePlan.moves.get(c.actorId),null);
        assert(!w.calls.some(a=>a.id===c.actorId&&['move','moveTo'].includes(a.method)));
        assert(w.logs.some(r=>r.actorId===c.actorId&&r.reason==='opening-centre-hold'));}
    assert(w.centrePlan.details.some(d=>d.admitted));w.observe();
    assert.equal(w.step(2).phase,'active');supportedOutcomes(w);
});

test('real cross-group traffic reserves departing destinations before centre preparation',async t=>{
    const make=()=>{
        const w=openingWorld(),positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[10,11],
            medic:[12,12],bow1:[13,12],bow2:[13,13],guardR2:[12,13]};
        for(const [id,[x,y]]of Object.entries(positions))Object.assign(w.actor(id),{x,y});
        Object.assign(w.flags.find(f=>f.id==='east'),{x:8,y:30});
        w.membership=null;w.bind();w.reports();return w;
    };
    const w=await fixture(t,{make});
    for(let tick=1;tick<=3;tick++){
        assert.equal(w.step(tick).phase,'active');supportedOutcomes(w);
        const destinations=w.diagnostic.travel.actors.map(a=>a.admitted).filter(Boolean);
        for(const p of w.centrePlan.moves.values())if(p)assert(!destinations.some(q=>range(p,q)===0));
        const moves=w.calls.filter(c=>c.method==='move');
        assert.equal(new Set(moves.map(p=>`${p.x},${p.y}`)).size,moves.length);
        if(tick<3)w.observe(moves.filter(c=>!(tick===2&&c.id==='guardH2')));
    }
});

test('real missing member or current centre-support loss releases both groups without centre evaluation',async t=>{
    for(const missing of [false,true]){
        const w=await fixture(t);w.step(1);const evaluations=w.centreEvaluations;
        if(missing){
            w.myCreeps=w.myCreeps.filter(c=>c.id!=='guardM0');
            w.spacing.creeps=w.spacing.creeps.filter(c=>c.id!=='guardM0');w.objects.set(Creep,w.spacing.creeps);
            w.reports=()=>{}; // No new route response is requested after lost membership.
        }else Object.assign(w.actor('guardM0'),{x:8,y:20});
        const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
        assert.equal(w.centreEvaluations,evaluations);assert.equal(w.centrePlan,null);
        assert(!w.logs.some(r=>r.reason?.startsWith('opening-centre-')||r.reason?.startsWith('capture-route-')));
    }
});

test('real split uses original C membership, two scout fallbacks and unchanged post-centre admission',async t=>{
    const w=await fixture(t),d=w.step(1),group=w.group().memberIds;
    assert.equal(d.mode,'opening');assert.equal(d.phase,'active');assert.equal(w.flags[d.targetSlot].id,'east');
    assert.deepEqual(d.memberSlots.map(i=>w.spacing.creeps[i].id),[...group].sort());
    assert.equal(w.calls.filter(c=>group.includes(c.id)&&c.method==='move').length,4);
    assert.equal(w.calls.filter(c=>!group.includes(c.id)&&c.method==='moveTo'&&c.target===w.centreId).length,2);
    assert.equal(selectSecondaryObjective({...w,squad:w.group(),routes:[]}).reason,'centre-not-owned');
    assert.equal(w.centre.my,undefined);assert.equal(d.startedAt,1);assert.equal(d.queries,16);
    assert.equal(d.reportedOps,1600);assert.equal(w.searchRequests.length,16);
});

test('real opening preflight admits healer-first travel from an unsafe conflict-free full proposal',async t=>{
    const make=()=>{
        const w=openingWorld();
        for(const [id,y]of [['bow1',19],['bow2',20],['guardR2',21]])Object.assign(w.actor(id),{x:28,y});
        w.membership=null;w.bind();w.reports();return w;
    };
    const w=await fixture(t,{make}),first=w.step(1),ids=w.group().memberIds;
    assert.equal(first.phase,'active');assert.equal(first.queries,16);
    assert.deepEqual(w.calls.filter(c=>ids.includes(c.id)&&c.method==='move').map(c=>c.id),['medic']);
    assert.equal(first.travel.examined,16);assert.equal(first.travel.bestSize,1);
    assert(first.travel.actors.filter(a=>!a.admitted).every(a=>a.holdReason==='subset-hold'));
    const proposals=new Map(first.travel.actors.map(a=>[ids.slice().sort()[a.slot],a.proposed]));
    assert(!secondaryStepSupport(w.myCreeps,ids,proposals));
    let previous=[];
    for(let tick=1;tick<=6;tick++){
        if(tick>1){w.observe(previous);w.step(tick);}
        const d=w.diagnostic,allMoves=w.calls.filter(c=>c.method==='move'),moves=allMoves.filter(c=>ids.includes(c.id));
        assert.equal(d.phase,'active');assert.equal(d.startedAt,1);assert(d.queries<=(tick===1?24:4));
        assert.equal(moves.length,tick===1?1:4);
        const admitted=new Map(ids.map(id=>[id,moves.find(c=>c.id===id)??null]));
        assert(secondaryStepSupport(w.myCreeps,ids,admitted));
        const actions=tactical(w.calls);w.calls=[];
        executeTactics(w.myCreeps,w.enemies,[],null,{tick,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
        assert.deepEqual(tactical(w.calls),actions);previous=allMoves;
    }
    assert.equal(w.searchRequests.length,20);
});

test('real suffix reuse, partial displacement and age5 refresh preserve tactics, support and the original deadline',async t=>{
    const w=await fixture(t);w.step(1);w.observe(w.calls.filter(c=>c.method==='move'&&c.id!=='bow1'));
    for(let tick=2;tick<=6;tick++){
        const d=w.step(tick);assert.equal(d.phase,'active');assert.equal(d.startedAt+60,61);
        assert.equal(d.queries,tick===6?4:0);assert.equal(d.cacheHits,tick===6?0:4);
        assert(secondaryStepSupport(w.myCreeps,w.group().memberIds,new Map(w.group().memberIds.map(id=>[id,null]))));
        const actions=tactical(w.calls),moves=w.calls.filter(c=>c.method==='move');w.calls=[];
        executeTactics(w.myCreeps,w.enemies,[],null,{tick,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
        assert.deepEqual(tactical(w.calls),actions);w.observe(moves);
    }
    assert.equal(w.searchRequests.length,20);
});

test('real opening refreshes an occupied next step in a fresh cache within the original four-query budget',async t=>{
    const w=await fixture(t);w.step(1);
    Object.assign(w.actor('scout1'),{x:28,y:19});w.distinct();
    const before=JSON.stringify(w.spacing.creeps),d=w.step(2);
    assert.equal(d.phase,'active');assert.equal(d.startedAt,1);
    assert.equal(d.queries,4);assert.equal(d.cacheHits,0);
    assert.equal(w.searchRequests.length,20);
    assert.equal(JSON.stringify(w.spacing.creeps),before);
    // The supplied response still points at the blocker: refresh is not a
    // path-quality guarantee, and preflight must continue to hold this actor.
    assert(!w.calls.some(c=>c.id==='bow1'&&c.method==='move'));
    const requests=w.searchRequests.filter(r=>r.tick===2);
    assert.equal(requests.length,4);
    for(const r of requests){assert.equal(r.options.costMatrix.get(28,19),255);
        assert.equal(r.options.costMatrix.get(r.origin.x,r.origin.y),0);}
});

for(const rc of [0,-11,undefined])test(`real return ${rc} without displacement spends at5 and strict match rewind resets`,async t=>{
    const w=await fixture(t);w.group().memberIds.forEach(id=>w.returns.set(id,rc));
    let d=w.step(1);assert.equal(d.phase,'active');
    const attempts=w.logs.filter(r=>r.type==='action-attempt'&&r.method==='move'&&w.group().memberIds.includes(r.actorId));assert.equal(attempts.length,4);
    assert(attempts.every(a=>a.returnCode===(rc??null)));
    for(let tick=2;tick<=5;tick++)d=w.step(tick);
    assert.equal(d.reason,'no-displacement');assert.equal(w.searchRequests.length,16);
    assert.equal(w.step(6).phase,'finished');assert(w.calls.every(c=>c.method==='moveTo'));
    assert.equal(w.step(1).phase,'active');assert.equal(w.searchRequests.length,32);
});

test('real supplied capture ownership releases movement and remains spent for five observations',async t=>{
    const w=await fixture(t);let arrived=false,tick=1,queries=0;
    for(;tick<=30;tick++){
        const d=w.step(tick);assert.equal(d.phase,'active');assert.equal(d.startedAt,1);assert(d.queries<=(tick===1?24:4));
        w.observe();const target=w.flags[d.targetSlot];
        if(w.group().memberIds.some(id=>range(w.actor(id),target)===0)){target.my=true;arrived=true;queries=w.searchRequests.length;break;}
    }
    assert(arrived,'Generated arrival must precede supplied ownership');
    const capture=w.step(++tick);assert.equal(capture.reason,'captured');assert.equal(capture.phase,'finished');
    assert(!capture.travel);assert(!w.calls.some(c=>c.method==='move'));
    const centreEvaluations=w.centreEvaluations;assert.equal(w.centrePlan,null);
    for(let i=0;i<5;i++){const d=w.step(++tick);assert.equal(d.reason,'captured');assert.equal(d.startedAt,1);
        assert(!w.calls.some(c=>c.method==='move'));assert.equal(w.searchRequests.length,queries);
        assert.equal(w.centreEvaluations,centreEvaluations);assert(w.calls.every(c=>c.method==='moveTo'));
        assert(!w.logs.some(r=>r.reason?.startsWith('opening-centre-')));}
});

// Generated analogue of the accepted compact start/convergent route geometry.
// No historical identity, seed payload or replay reader enters this module.
for(const stationary of [false,true])test(`real generated congestion retains bounded stall with centre healers ${stationary?'stationary':'moving'}`,async t=>{
    const w=await fixture(t,{make:congestedWorld});
    const group=w.group().memberIds,counts=[],queries=[];let d;
    for(let tick=1;tick<=7;tick++){
        d=w.step(tick);const direct=w.calls.filter(c=>c.method==='move');counts.push(direct.filter(c=>group.includes(c.id)).length);queries.push(d.queries);
        if(tick===7)break;
        supportedOutcomes(w);
        w.observe(direct.filter(c=>!stationary||group.includes(c.id)||!healing(w.actor(c.id))));
    }
    assert.deepEqual(counts,[3,1,0,0,0,0,0]);assert.equal(d.reason,'no-displacement');
    assert.deepEqual(queries,[4,4,4,4,4,4,4]);
    assert.equal(w.searchRequests.length,28);assert.equal(d.startedAt,1);
});

test('real repeated blocked refresh pays at most four queries even on the terminal stall tick',async t=>{
    const w=await fixture(t);w.step(1);Object.assign(w.actor('scout1'),{x:28,y:19});
    for(let tick=2;tick<=5;tick++){
        const d=w.step(tick);assert.equal(d.queries,4);assert.equal(d.startedAt,1);
        assert.equal(d.phase,tick===5?'finished':'active');
        if(tick===5)assert.equal(d.reason,'no-displacement');
    }
    assert.equal(w.searchRequests.length,32);assert.equal(w.step(6).queries,0);
});

test('real matrix construction failure never falls back to an occupancy-unaware search',async t=>{
    for(const active of [false,true]){
        const w=await fixture(t);if(active){w.step(1);Object.assign(w.actor('scout1'),{x:28,y:19});}
        w.newMatrix=()=>{throw Error('generated matrix unavailable');};
        const count=w.searchRequests.length,d=w.step(active?2:1);
        // Active blocked cache is explicitly invalidated so construction is
        // attempted via the same paid query path, not an unaccounted retry.
        assert.equal(d.reason,'route-result-unsupported');assert.equal(d.queries,1);
        assert.equal(d.reportedOps,null);assert.equal(w.searchRequests.length,count);
    }
});

for(const conflict of ['secondaryObjectiveExperiment','supportLockedEngagementExperiment','healerUsefulClosingExperiment',
    'oneScoutFlagExperiment','scoutHoldExperiment','squadPairExperiment'])test(`unsupported ${conflict} combination rejects without independent routing`,async t=>{
    const w=await fixture(t,{conflicts:[conflict]}),d=w.step(1);
    assert.equal(d.reason,'incompatible-configuration');assert.equal(d.phase,'finished');assert.equal(d.queries,0);
    assert.equal(w.searchRequests.length,0);assert(w.calls.every(c=>c.method==='moveTo'&&c.target===w.centreId));
    assert(!w.game.supportLockedEngagement);assert.equal(w.step(2).phase,'finished');
});

test('real injury/contact cancellation retains current-position tactical actions and emergency movement',async t=>{
    const w=await fixture(t);w.step(1);Object.assign(w.enemies[3],{x:28,y:19});w.actor('bow1').hits--;
    const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
    assert(w.logs.some(r=>r.type==='action-decision'&&r.reason==='ranged-melee-retreat'));
    const actual=[...w.calls];w.calls=[];
    moveCreeps(w.myCreeps,w.enemies,w.centre,new Map(),new Map(),null,null,null,false,null,w.spacing);
    executeTactics(w.myCreeps,w.enemies,w.myCreeps.filter(c=>c.hits<c.hitsMax),null,
        {tick:2,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});assert.deepEqual(w.calls,actual);
});

test('actual healer-escort ownership fences the opening before movement without changing tactical selection',async t=>{
    const w=await fixture(t);w.step(1);
    // Separate supplied later observation: centre is now ours, and a melee
    // engagement is within escort range without exposing the healer within3.
    // The controller never invents this ownership or resolves travel to centre.
    w.centre.my=true;
    Object.assign(w.actor('blade'),{x:26,y:19});Object.assign(w.enemies[3],{x:30,y:19});w.distinct();
    const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
    assert(w.logs.some(r=>r.type==='healer-escort'&&r.event==='assign'&&r.healerId==='medic'));
    assert(w.logs.some(r=>r.type==='action-decision'&&r.actorId==='medic'&&r.reason==='escort-in-range'));
    assert(!w.calls.some(c=>c.method==='move'));
    const actions=tactical(w.calls);w.calls=[];
    executeTactics(w.myCreeps,w.enemies,[],null,{tick:2,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
    assert.deepEqual(tactical(w.calls),actions);
});

test('absolute timeout and duplicate ticks cannot refresh, extend or reacquire an opening mission',async t=>{
    const w=await fixture(t);w.step(1);const d=w.step(61);
    assert.equal(d.reason,'timeout');assert.equal(d.startedAt,1);assert.equal(d.queries,0);assert.equal(w.searchRequests.length,16);
    const duplicate=await fixture(t);duplicate.step(1);assert.equal(duplicate.step(1).reason,'duplicate-observation');
    assert.equal(duplicate.step(2).phase,'finished');assert.equal(duplicate.searchRequests.length,16);
});

test('complete diagnostic uses snapshot slots and fits existing2700 limit with escaped maximum-length IDs',async t=>{
    for(const char of ['x','"','\\','\u0001'])for(const failure of [false,true,'subset']){
        const w=await fixture(t);
        if(failure==='subset')for(const [id,y]of [['bow1',19],['bow2',20],['guardR2',21]])
            Object.assign(w.actor(id),{x:28,y});
        for(const c of w.spacing.creeps)c.id=(c.id+'-'+char.repeat(128)).slice(0,128);
        for(const f of w.flags)f.id=(f.id+'-'+char.repeat(128)).slice(0,128);
        w.centreId=w.centre.id;w.membership=null;w.bind();
        const reports=w.reports;w.reports=()=>reports([w.flags[1].id]);
        if(failure===true){const search=w.searchPath;w.searchPath=(...a)=>({...search(...a),path:null});}
        const d=w.step(1);assert.equal(d.phase,failure===true?'finished':'active');
        if(failure===true){assert.equal(d.reason,'route-path-unsupported');assert(d.rejectedQuery);assert(d.excludedCandidates);}
        else{assert.equal(d.travel.actors.length,4);assert.equal(d.memberSlots.length,4);
            assert.equal(w.game.flags[d.targetSlot].id,w.flags[1].id);
            assert.deepEqual(new Set(d.memberSlots.map(i=>w.game.creeps[i].id)),new Set(w.group().memberIds));}
        if(failure==='subset'){
            assert.equal(d.travel.examined,16);assert.equal(d.travel.bestSize,1);
            assert.equal(d.travel.actors.filter(a=>a.holdReason==='subset-hold').length,3);
        }
        assert(JSON.stringify(d).length<2700);assert(!JSON.stringify(d).includes(char.repeat(20)));
        assert.equal(w.game.selectedFlagId,w.centre.id);
    }
});

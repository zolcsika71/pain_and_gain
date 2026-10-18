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
import {validActionDecision,validActionAttempt} from '../../tools/replay-logs.js';

const configuration=fs.readFileSync(new URL('../../src/config.js',import.meta.url),'utf8');
const controller=new URL('../../src/strategy/opening-deployment.js',import.meta.url).href;
const configurations=new Map();let instance=0;
const modules=new Map([
    ['game/utils','export const getObjectsByPrototype=p=>globalThis.__opening.objects.get(p); export const getObjects=()=>globalThis.__opening.spacing.creeps; export const getTicks=()=>globalThis.__opening.tick; export const getTerrainAt=(...p)=>globalThis.__opening.spacing.terrainAt(...p); export const getCpuTime=()=>1234;'],
    ['game','export const arenaInfo={cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder','export const searchPath=(...a)=>globalThis.__opening.searchPath(...a);'],
    ['game/constants','export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes','export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic','export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){
    let code=modules.get(s);
    if(s==='./config.js'&&c.parentURL?.includes('/src/loop.js'))code=configurations.get(c.parentURL);
    if(s==='./strategy/opening-deployment.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `export {openingDeploymentDiagnostic} from ${JSON.stringify(controller)}; import {planOpeningDeployment as plan} from ${JSON.stringify(controller)}; export function planOpeningDeployment(...a){globalThis.__opening.evaluations++;return plan(...a);}`;
    return code?{url:`data:text/javascript,${encodeURIComponent(code)}`,shortCircuit:true}:next(s,c);
}});
const {Creep}=await import('game/prototypes'),{ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');
const point=c=>({x:c.x,y:c.y}),range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const tactical=calls=>calls.filter(c=>!['move','moveTo'].includes(c.method));

async function fixture(t,{enabled=true,conflicts=[],make=openingWorld}={}){
    const w=useGeneratedOpeningSearch(make());w.logs=[];w.evaluations=0;
    for(const c of w.spacing.creeps)Object.setPrototypeOf(c,Creep.prototype);
    for(const f of w.flags)Object.setPrototypeOf(f,ScoreFlag.prototype);
    w.objects=new Map([[Creep,w.spacing.creeps],[ScoreFlag,w.flags]]);
    let config=configuration;
    for(const name of [...(enabled?['openingDeploymentExperiment']:[]),...conflicts])
        config=config.replace(`${name} = false`,`${name} = true`);
    const url=new URL(`../../src/loop.js?opening-${instance++}`,import.meta.url).href;
    configurations.set(url,config);w.loop=await import(url);globalThis.__opening=w;
    t.mock.method(console,'log',s=>w.logs.push(JSON.parse(s)));
    w.step=tick=>{
        globalThis.__opening=w;w.tick=tick;w.bind();w.reports();w.calls=[];w.logs=[];w.loop.runTick();
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
            assert.deepEqual(w.diagnostic.travel.actors.find(a=>a.slot===slot).admitted,point(c));}
        assert.equal(new Set(calls.map(c=>`${c.x},${c.y}`)).size,calls.length);
        for(const c of calls)Object.assign(w.actor(c.id),point(c));w.distinct();
    };
    return w;
}

test('default-off bypasses opening evaluation and preserves centre-only and combat/healing command traces',async t=>{
    assert.equal(openingDeploymentExperiment,false);
    for(const contact of [false,true]){
        const w=await fixture(t,{enabled:false});if(contact){Object.assign(w.enemies[3],{x:28,y:19});w.actor('bow1').hits--;}
        assert.equal(w.step(1),undefined);assert.equal(w.evaluations,0);assert.equal(w.searchRequests.length,0);
        const actual=[...w.calls];w.calls=[];
        moveCreeps(w.myCreeps,w.enemies,w.centre,new Map(),new Map(),null,null,null,false,null,w.spacing);
        executeTactics(w.myCreeps,w.enemies,w.myCreeps.filter(c=>c.hits<c.hitsMax),null,
            {tick:1,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
        assert.deepEqual(w.calls,actual);
    }
});

test('real split uses original C membership, four direct commands, ten centre fallbacks and unchanged post-centre admission',async t=>{
    const w=await fixture(t),d=w.step(1),group=w.group().memberIds;
    assert.equal(d.mode,'opening');assert.equal(d.phase,'active');assert.equal(w.flags[d.targetSlot].id,'east');
    assert.deepEqual(d.memberSlots.map(i=>w.spacing.creeps[i].id),[...group].sort());
    assert.equal(w.calls.filter(c=>c.method==='move').length,4);
    assert.equal(w.calls.filter(c=>!group.includes(c.id)&&c.method==='moveTo'&&c.target===w.centreId).length,10);
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
    assert.deepEqual(w.calls.filter(c=>c.method==='move').map(c=>c.id),['medic']);
    assert.equal(first.travel.examined,16);assert.equal(first.travel.bestSize,1);
    assert(first.travel.actors.filter(a=>!a.admitted).every(a=>a.holdReason==='subset-hold'));
    const proposals=new Map(first.travel.actors.map(a=>[ids.slice().sort()[a.slot],a.proposed]));
    assert(!secondaryStepSupport(w.myCreeps,ids,proposals));
    let previous=[];
    for(let tick=1;tick<=6;tick++){
        if(tick>1){w.observe(previous);w.step(tick);}
        const d=w.diagnostic,moves=w.calls.filter(c=>c.method==='move');
        assert.equal(d.phase,'active');assert.equal(d.startedAt,1);assert(d.queries<=(tick===1?24:4));
        assert.equal(moves.length,tick===1?1:4);
        const admitted=new Map(ids.map(id=>[id,moves.find(c=>c.id===id)??null]));
        assert(secondaryStepSupport(w.myCreeps,ids,admitted));
        const actions=tactical(w.calls);w.calls=[];
        executeTactics(w.myCreeps,w.enemies,[],null,{tick,flags:w.flags,creeps:w.spacing.creeps,myCreeps:w.myCreeps,enemies:w.enemies});
        assert.deepEqual(tactical(w.calls),actions);previous=moves;
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

for(const rc of [0,-11,undefined])test(`real return ${rc} without displacement spends at5 and strict match rewind resets`,async t=>{
    const w=await fixture(t);w.group().memberIds.forEach(id=>w.returns.set(id,rc));
    let d=w.step(1);assert.equal(d.phase,'active');
    const attempts=w.logs.filter(r=>r.type==='action-attempt'&&r.method==='move');assert.equal(attempts.length,4);
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
    for(let i=0;i<5;i++){const d=w.step(++tick);assert.equal(d.reason,'captured');assert.equal(d.startedAt,1);
        assert(!w.calls.some(c=>c.method==='move'));assert.equal(w.searchRequests.length,queries);}
});

// Generated analogue of the accepted compact start/convergent route geometry.
// No historical identity, seed payload or replay reader enters this module.
for(const stationary of [false,true])test(`real generated whole-army congestion retains ${stationary?'centre-support cancellation':'bounded stall'}`,async t=>{
    const w=await fixture(t,{make:congestedWorld}),birth=new Map(w.myCreeps.map(c=>[c.id,point(c)]));
    const group=w.group().memberIds,rest=w.myCreeps.filter(c=>!group.includes(c.id)),counts=[];let d;
    for(let tick=1;tick<=7;tick++){
        d=w.step(tick);const direct=w.calls.filter(c=>c.method==='move');counts.push(direct.length);
        if(tick===7)break;
        const centre=rest.map(c=>{const b=birth.get(c.id),healer=c.body.some(p=>p.type==='heal'&&p.hits>0),n=healer?(stationary?0:tick-1):tick;
            return{id:c.id,x:b.x+n,y:b.y+n};}).filter(c=>range(w.actor(c.id),c)>0);
        for(const c of centre){assert.equal(range(w.actor(c.id),c),1);assert(w.calls.some(a=>a.id===c.id&&a.method==='moveTo'&&a.target===w.centreId));
            assert(!w.spacing.creeps.some(p=>p.hits>0&&p.x===c.x&&p.y===c.y));}
        assert.equal(new Set([...centre,...direct].map(c=>`${c.x},${c.y}`)).size,centre.length+direct.length);
        w.observe(direct);for(const c of centre)Object.assign(w.actor(c.id),point(c));w.distinct();
    }
    assert.deepEqual(counts,[3,1,0,0,0,0,0]);assert.equal(d.reason,stationary?'defence-unavailable':'no-displacement');
    assert.equal(w.searchRequests.length,stationary?4:8);assert.equal(d.startedAt,1);
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

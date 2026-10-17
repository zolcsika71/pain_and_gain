import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {secondaryObjectiveExperiment} from '../../src/config.js';
import {moveCreeps,prepareSecondaryMovement} from '../../src/arena/execute.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {validActionDecision,validActionAttempt} from '../../tools/replay-logs.js';
const configuration=fs.readFileSync(new URL('../../src/config.js',import.meta.url),'utf8');
const modules=new Map([
    ['game/utils','export const getObjectsByPrototype=p=>globalThis.__secondary.objects.get(p); export const getObjects=()=>[...globalThis.__secondary.objects.values()].flat(); export const getTerrainAt=()=>0; export const getTicks=()=>globalThis.__secondary.tick; export const getCpuTime=()=>1234;'],
    ['game','export const arenaInfo={name:"Pain and Gain",season:"4",level:1,ticksLimit:2000,cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder','export const searchPath=(...args)=>globalThis.__secondary.search(...args);'],
    ['game/constants','export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes','export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic','export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){
    if(s==='./config.js'&&c.parentURL?.includes('/src/loop.js'))return{url:`data:text/javascript,${encodeURIComponent(
        c.parentURL.includes('secondary-on')?configuration.replace('secondaryObjectiveExperiment = false','secondaryObjectiveExperiment = true'):configuration)}`,shortCircuit:true};
    const code=modules.get(s);return code?{url:`data:text/javascript,${encodeURIComponent(code)}`,shortCircuit:true}:next(s,c);
}});
const disabled=await import('../../src/loop.js?secondary-off');
let instance=0;
const {Creep}=await import('game/prototypes'),{ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
async function fixture(t,{off=false,reverse=false}={}){
    const w={tick:1,calls:[],records:[],queries:[],mode:'east',search:null};
    // A distinct module instance models a genuinely new match, rather than
    // erasing spent state by repeating tick1 in one still-live instance.
    w.loop=off?disabled:await import(`../../src/loop.js?secondary-on-${instance++}`);
    const unit=(id,x,y,types,my=true)=>Object.assign(new Creep(),{id,x,y,my,exists:true,hits:1000,hitsMax:1000,fatigue:0,
        body:['move',...types].map(type=>({type,hits:100})),getRangeTo(p){return range(this,p);},
        move(direction){const [dx,dy]=[[0,0],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]][direction];
            w.calls.push({tick:w.tick,id,method:'move',direction,x:this.x+dx,y:this.y+dy});return 0;},
        ...Object.fromEntries(['moveTo','attack','rangedAttack','heal','rangedHeal'].map(method=>[method,function(target){w.calls.push({tick:w.tick,id,method,target:target.id,x:target.x,y:target.y});return 0;}]))});
    w.units=[unit('a-healer',40,41,['heal']),unit('a-melee',40,40,['attack']),unit('a-ranged1',39,41,['ranged_attack']),unit('a-ranged2',39,40,['ranged_attack']),
        unit('b-healer',43,42,['heal']),unit('b-melee',44,42,['attack']),unit('b-ranged1',44,43,['ranged_attack']),unit('b-ranged2',43,43,['ranged_attack']),
        unit('c-healer',36,42,['heal']),unit('c-melee1',35,42,['attack']),unit('c-melee2',35,43,['attack']),unit('c-ranged',36,43,['ranged_attack']),
        unit('scout1',40,39,[]),unit('scout2',39,39,[]),unit('enemy',90,90,['attack'],false)];
    const E={centre:'eff_damage_taken_modifier',attack:'eff_attack_modifier',ranged:'eff_ranged_attack_modifier',heal:'eff_heal_modifier'};
    w.flags=[['centre',40,40,'centre',5,true],['east',60,40,'attack',3],['west',20,40,'attack',3],
        ['north',40,20,'heal',4],['south',40,63,'heal',4],['ranged-a',25,30,'ranged',3],['ranged-b',65,30,'ranged',3]]
        .map(([id,x,y,effect,scorePerTick,my])=>Object.assign(new ScoreFlag(),{id,x,y,effectType:E[effect],scorePerTick,my}));
    if(reverse){w.units.reverse();w.flags=[w.flags[0],...w.flags.slice(1).reverse()];}
    w.search=(from,goal,opts)=>{
        w.queries.push({tick:w.tick,actor:from.id,target:goal.pos.id,opts});assert.equal(goal.range,0);assert.equal(opts.maxOps,1000);
        if(w.mode==='throw')throw Error('generated failure');
        if(w.mode==='bad-ops')return{path:[],incomplete:false,ops:1001};
        if(w.mode==='unknown')return undefined;
        if(w.mode==='incomplete'||goal.pos.id!=='east')return{path:[],incomplete:true,ops:17};
        const path=[];let p={x:from.x,y:from.y};
        while(p.x!==goal.pos.x){p={x:p.x+Math.sign(goal.pos.x-p.x),y:p.y};path.push(p);}
        while(p.y!==goal.pos.y){p={x:p.x,y:p.y+Math.sign(goal.pos.y-p.y)};path.push(p);}
        return{path,incomplete:false,ops:200};
    };
    w.objects=new Map([[Creep,w.units],[ScoreFlag,w.flags]]);globalThis.__secondary=w;
    t.mock.method(console,'log',s=>w.records.push(JSON.parse(s)));
    w.step=tick=>{w.tick=tick;w.calls=[];w.loop.runTick();
        const game=w.records.findLast(r=>r.type==='game-state'&&r.tick===tick);
        assert.equal(game.selectedFlagId,w.flags.find(f=>f.effectType==='eff_damage_taken_modifier').id);
        for(const c of w.units.filter(c=>c.my))assert(w.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
        return game.secondaryObjective;};
    w.actor=id=>w.units.find(c=>c.id===id);
    return w;
}

test('default-off real flow retains exact centre fallback with zero new searches or diagnostic fields',async t=>{
    assert.equal(secondaryObjectiveExperiment,false);const w=await fixture(t,{off:true});assert.equal(w.step(1),undefined);
    assert.equal(w.queries.length,0);assert.equal(w.calls.length,14);
    assert(w.calls.every(c=>c.method==='moveTo'&&c.target==='centre'));
});

test('real tick flow selects an existing eligible squad, bounds searches, overrides only its fallback and retains defence',async t=>{
    const w=await fixture(t),d=w.step(1);assert.equal(d.phase,'active');assert.equal(d.targetId,'east');assert.equal(d.queries,24);
    const group=w.loop.getMembershipState().squads.find(s=>s.id===d.squadId);assert.deepEqual(d.memberIds,[...group.memberIds].sort());
    const direct=w.calls.filter(c=>group.memberIds.includes(c.id));
    assert.deepEqual(direct.map(c=>c.id).sort(),['b-melee','b-ranged1']);
    for(const call of direct){assert.equal(call.method,'move');assert.equal(call.x,w.actor(call.id).x+1);assert.equal(call.y,w.actor(call.id).y);}
    assert(w.calls.filter(c=>!group.memberIds.includes(c.id)).every(c=>c.target==='centre'));
    assert(w.calls.filter(c=>c.target==='centre'&&['a-melee','a-ranged1','a-ranged2'].includes(c.id)).length===3);
    assert(d.reportedOps<=24000);assert(w.queries.every(q=>group.memberIds.includes(q.actor)));
    assert(w.records.filter(r=>r.type==='game-state').every(r=>JSON.stringify(r.secondaryObjective).length<1500));
});

test('squad eligibility and observable support choose another group without a hard-coded squad',async t=>{
    const w=await fixture(t);w.actor('b-ranged1').fatigue=1;const d=w.step(1);
    assert.equal(d.phase,'active');assert(d.memberIds.includes('c-healer'));assert(!d.memberIds.includes('b-healer'));
    assert(w.queries.every(q=>q.actor.startsWith('c-')));
});

test('ordering preserves equivalent selected members, objective and command targets',async t=>{
    const w=await fixture(t),a=w.step(1),expected=w.calls.map(c=>[c.id,c.target]).sort();w.step(2);
    const other=await fixture(t,{reverse:true}),b=other.step(1);assert.deepEqual(b.memberIds,a.memberIds);assert.equal(b.targetId,a.targetId);
    assert.deepEqual(other.calls.map(c=>[c.id,c.target]).sort(),expected);
});

test('accepted calls without observed displacement exhaust four observations; no reacquisition',async t=>{
    const w=await fixture(t);w.step(1);for(let tick=2;tick<=5;tick++){
        const d=w.step(tick);assert.equal(d.reason,tick===5?'no-displacement':'retained');
    }
    assert.equal(w.queries.length,24);const ended=w.step(20);assert.equal(ended.phase,'finished');assert.equal(w.queries.length,24);
    assert(w.calls.every(c=>c.target==='centre'));
});

test('duplicate current tick does not reset the attempt or spend another stall observation',async t=>{
    const w=await fixture(t),a=w.step(1),b=w.step(1);
    assert.equal(b.reason,'retained');assert.equal(b.unchanged,0);assert.deepEqual(b.memberIds,a.memberIds);assert.equal(w.queries.length,24);
    for(let tick=2;tick<=5;tick++)w.step(tick);
    assert.equal(w.step(5).phase,'finished');assert.equal(w.queries.length,24);
});

test('observed on-path positions rebase cached suffixes; expiry refreshes only four routes',async t=>{
    const w=await fixture(t),first=w.step(1);
    for(let tick=2;tick<=6;tick++){
        // Generated distinct pre-action positions, not Arena movement resolution.
        for(const id of first.memberIds)w.actor(id).x++;
        assert.equal(new Set(w.units.map(c=>`${c.x},${c.y}`)).size,w.units.length);
        const d=w.step(tick);assert.equal(d.reason,'retained');assert.equal(d.queries,tick===6?4:0);
        assert.equal(d.cacheHits,tick===6?0:4);
    }
    assert.equal(w.queries.length,28);
    for(let tick=7;tick<=11;tick++){
        for(const id of first.memberIds)w.actor(id).x++;
        if(tick===11)w.mode='unknown';
        const d=w.step(tick);assert.equal(d.phase,tick===11?'finished':'active');
    }
    assert.equal(w.queries.length,29);w.mode='east';assert.equal(w.step(12).phase,'finished');assert.equal(w.queries.length,29);
});

test('off-path observation refreshes bounded routes, not inferred command progress',async t=>{
    const w=await fixture(t),d=w.step(1);w.actor(d.memberIds[0]).y++;
    const next=w.step(2);assert.equal(next.reason,'retained');assert.equal(next.queries,4);
});

test('ownership, danger, malformed flags and support invalidate before repeated route queries',async t=>{
    for(const [reason,change]of [['ownership-changed',w=>w.flags.find(f=>f.id==='east').my=false],
        ['local-combat',w=>Object.assign(w.actor('enemy'),{x:42,y:40})],
        ['unsupported-observation',w=>w.flags[1].effectType='unknown'],
        ['defence-unavailable',w=>{w.actor('a-melee').x=70;w.actor('a-ranged1').x=71;}],
        ['squad-unavailable',w=>w.actor('b-healer').body.find(p=>p.type==='heal').hits=0],
        ['objective-unavailable',w=>Object.assign(w.actor('enemy'),{x:52,y:46})]]){
        const w=await fixture(t);w.step(1);change(w);const d=w.step(2);assert.equal(d.reason,reason);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
        w.step(3);assert.equal(w.queries.length,24);
    }
});

test('observed capture and absolute timeout terminate; strict match reset clears spent state',async t=>{
    const w=await fixture(t),d=w.step(1);const target=w.flags.find(f=>f.id==='east');target.my=true;
    const points=[[60,40],[59,40],[60,41],[59,41]];d.memberIds.forEach((id,i)=>Object.assign(w.actor(id),{x:points[i][0],y:points[i][1]}));
    assert.equal(w.step(2).reason,'captured');assert.equal(w.step(3).phase,'finished');
    const fresh=await fixture(t);fresh.step(1);assert.equal(fresh.step(61).reason,'timeout');assert.equal(fresh.queries.length,24);
    assert.equal(fresh.step(1).phase,'active');assert.equal(fresh.queries.length,48);
});

test('incomplete/unknown searches retain baseline, acquisition has cadence and no unbounded fallback squad search',async t=>{
    const w=await fixture(t);w.mode='incomplete';assert.equal(w.step(1).reason,'no-useful-objective');assert.equal(w.queries.length,24);
    for(let tick=2;tick<=10;tick++)assert.equal(w.step(tick).reason,'acquisition-cadence');
    assert.equal(w.queries.length,24);w.step(11);assert.equal(w.queries.length,48);
    for(const mode of ['throw','bad-ops','unknown']){const f=await fixture(t);f.mode=mode;const d=f.step(1);
        assert.equal(d.reason,'route-result-unsupported');assert.equal(d.queries,1);assert.equal(d.reportedOps,null);
        assert(f.calls.every(c=>c.target==='centre'));}
});

test('documented route objects and unconsumed telemetry preserve real tick-flow selection',async t=>{
    for(const cost of [40,undefined]){
        const w=await fixture(t),search=w.search;
        w.search=(...args)=>({...search(...args),...(cost===undefined?{}:{cost}),extraTelemetry:'ignored'});
        const d=w.step(1);assert.equal(d.phase,'active');assert.equal(d.targetId,'east');
        assert.equal(d.queries,24);assert.equal(d.reportedOps,1140);
    }
});

// Generated contiguous detour, not a claim about Arena terrain or a live route.
function detour(from,to){
    const path=[];let p={x:from.x,y:from.y};
    while(p.x!==to.x||p.y!==to.y){p={x:p.x+Math.sign(to.x-p.x),y:p.y+Math.sign(to.y-p.y)};path.push(p);}
    while(path.length<=40)path.unshift({x:from.x,y:from.y+1},{x:from.x,y:from.y});
    return path;
}

test('nearby valid objective survives a distant or detoured overlong candidate in either order',async t=>{
    for(const far of [false,true])for(const first of [false,true])for(const reverse of [false,true]){
        const w=await fixture(t,{reverse}),long=w.flags.find(f=>f.id==='west'),search=w.search;
        long.id=first?'aaa-long':'zzz-long';if(far)Object.assign(long,{x:90,y:8});
        w.search=(from,goal,opts)=>{const r=search(from,goal,opts);return goal.pos===long
            ?{path:detour(from,long),incomplete:false,ops:17}:r;};
        const d=w.step(1);assert.equal(d.phase,'active',JSON.stringify({diagnostic:d,queried:w.queries.map(q=>q.target)}));
        assert.equal(d.targetId,'east');assert(!('rejectedQuery' in d));
        assert.equal(w.queries.filter(q=>q.target===long.id).length,far?0:1);
        assert.equal(d.queries,far?20:21);assert(d.reportedOps<=24000);
        assert.equal(d.excludedCandidates.geometry,far?1:0);assert.equal(d.excludedCandidates.routeLimit,far?0:1);
        assert.equal(d.excludedCandidates.first.flagId,long.id);
        // These original routes request cells currently occupied by squad
        // members. Only the two currently free first cells are admitted.
        assert.equal(w.calls.length,12);
        assert.equal(w.records.filter(r=>r.type==='action-decision'&&r.channel==='movement'&&r.reason==='capture-route-hold').length,2);
        assert.equal(w.calls.filter(c=>c.method==='move').length,2);
        assert(w.calls.filter(c=>c.method==='moveTo').every(c=>c.target==='centre'));
        assert(JSON.stringify(d).length<1500);
    }
});

test('geometric lower bound excludes only distances strictly above forty before searching',async t=>{
    for(const distance of [39,40,41]){
        const w=await fixture(t),flag=w.flags.find(f=>f.id==='west');
        // Chosen B's smallest x is43: its slowest geometric lower bound is exact.
        Object.assign(flag,{x:43+distance,y:42});
        const d=w.step(1);assert.equal(d.phase,'active');assert.equal(d.targetId,'east');
        assert.equal(w.queries.filter(q=>q.target==='west').length,distance>40?0:4);
        assert.equal(d.queries,distance>40?20:24);
        assert.equal(d.excludedCandidates?.geometry??0,distance>40?1:0);
        if(distance>40)assert.deepEqual(d.excludedCandidates.first,{flagId:'west',reason:'geometric-route-limit',
            lowerBound:41,queryOrdinal:null,pathLength:null});
    }
});

test('all excluded objectives fall back within original acquisition query and operation caps',async t=>{
    for(const geometric of [false,true]){
        const w=await fixture(t),search=w.search;
        if(geometric)w.flags.slice(1).forEach(f=>Object.assign(f,{x:90,y:8}));
        w.search=(from,goal,opts)=>{search(from,goal,opts);return{path:detour(from,goal.pos),incomplete:false,ops:1000};};
        const d=w.step(1);assert.equal(d.reason,'no-useful-objective');assert.equal(d.phase,'idle');
        assert.equal(d.queries,geometric?0:6);assert.equal(d.reportedOps,geometric?0:6000);
        assert.equal(d.excludedCandidates.geometry,geometric?6:0);assert.equal(d.excludedCandidates.routeLimit,geometric?0:6);
        assert(!('rejectedQuery' in d));assert(w.calls.every(c=>c.target==='centre'));assert(JSON.stringify(d).length<1500);
    }
    const w=await fixture(t),search=w.search;
    w.search=(from,goal,opts)=>{const r=search(from,goal,opts);return{...r,ops:1000,
        path:w.queries.length%4===0?detour(from,goal.pos):r.path};};
    const d=w.step(1);assert.equal(d.reason,'no-useful-objective');assert.equal(d.queries,24);
    assert.equal(d.reportedOps,24000);assert.equal(d.excludedCandidates.routeLimit,6);
    assert(w.queries.every(q=>q.opts.maxOps===1000));
});

test('overlong acquisition results with unknown required fields still fail the whole poll',async t=>{
    for(const [change,reason]of [[r=>delete r.ops,'route-result-unsupported'],[r=>r.ops=1001,'route-result-unsupported'],
        [r=>delete r.incomplete,'route-incomplete-unsupported'],[r=>r.incomplete='false','route-incomplete-unsupported']]){
        const w=await fixture(t),search=w.search;
        w.search=(from,goal,opts)=>{search(from,goal,opts);const r={path:detour(from,goal.pos),incomplete:false,ops:17};change(r);return r;};
        const d=w.step(1);assert.equal(d.reason,reason);assert.equal(d.queries,1);assert.equal(d.rejectedQuery.ordinal,1);
        assert(!('excludedCandidates' in d));assert(w.calls.every(c=>c.target==='centre'));
    }
});

test('exclusion and poll-failure diagnostics stay distinct and bounded with maximum IDs',async t=>{
    const w=await fixture(t),long=w.flags.find(f=>f.id==='west'),search=w.search;
    w.units.forEach(c=>c.id=c.id.padEnd(128,'x'));long.id='z'.repeat(128);
    w.search=(from,goal,opts)=>{const r=search(from,goal,opts);return goal.pos===long
        ?{path:detour(from,long),incomplete:false,ops:1000}:r;};
    const d=w.step(1);assert.equal(d.phase,'active');assert.equal(d.excludedCandidates.routeLimit,1);
    assert(!('rejectedQuery' in d));const {travel,...original}=d;
    assert(JSON.stringify(original).length<1500);assert(JSON.stringify(travel).length<1200);
    assert(JSON.stringify(d).length<2700);assert.equal(travel.actors.length,4);
    assert(JSON.stringify(d.excludedCandidates).length<400);
    const broken=await fixture(t),base=broken.search;Object.assign(broken.flags.find(f=>f.id==='west'),{x:90,y:8});
    broken.search=(...args)=>{base(...args);return{path:null,incomplete:false,ops:17};};
    const failed=broken.step(1);assert.equal(failed.reason,'route-path-unsupported');assert.equal(failed.queries,1);
    assert.equal(failed.excludedCandidates.geometry,1);assert.equal(failed.rejectedQuery.ordinal,1);
    assert(JSON.stringify(failed).length<1500);assert(broken.calls.every(c=>c.target==='centre'));
});

test('one member overlong discards that entire candidate, without changing active refresh failure',async t=>{
    const w=await fixture(t),long=w.flags.find(f=>f.id==='west'),search=w.search;long.id='aaa-long';
    w.search=(from,goal,opts)=>{const r=search(from,goal,opts);return goal.pos===long&&w.queries.length===3
        ?{path:detour(from,long),incomplete:false,ops:17}:r;};
    const d=w.step(1);assert.equal(d.targetId,'east');assert.equal(d.queries,23);
    assert.equal(d.excludedCandidates.first.queryOrdinal,3);assert.equal(d.excludedCandidates.routeLimit,1);
    for(let tick=2;tick<=5;tick++){for(const id of d.memberIds)w.actor(id).x++;assert.equal(w.step(tick).phase,'active');}
    for(const id of d.memberIds)w.actor(id).x++;
    w.search=(from,goal,opts)=>{search(from,goal,opts);return{path:detour(from,goal.pos),incomplete:undefined,ops:17};};
    const stopped=w.step(6);assert.equal(stopped.phase,'finished');assert.equal(stopped.reason,'route-limit-exceeded');
    assert.equal(stopped.queries,1);assert(!('excludedCandidates' in stopped));assert.equal(stopped.rejectedQuery.ordinal,1);
    assert.equal(w.step(7).phase,'finished');assert.equal(w.queries.length,24);
});

test('route operation boundaries are enforced and missing counts remain unknown, never zero',async t=>{
    for(const ops of [0,1000]){
        const w=await fixture(t),search=w.search;w.search=(...args)=>({...search(...args),ops});
        const d=w.step(1);assert.equal(d.phase,'active');assert.equal(d.queries,24);assert.equal(d.reportedOps,24*ops);
    }
    for(const ops of [undefined,null,-1,1001,0.5,NaN,Infinity]){
        const w=await fixture(t),search=w.search;w.search=(...args)=>({...search(...args),ops});
        const d=w.step(1);assert.equal(d.reason,'route-result-unsupported');assert.equal(d.queries,1);
        assert.equal(d.reportedOps,null);assert(w.calls.every(c=>c.target==='centre'));
    }
});

test('first rejected query distinguishes path shape, route limit and completeness type without more work',async t=>{
    // Generated alternatives, not recovered search results from the sanados replay.
    for(const [reason,change,pathType,pathIsArray,pathLength,incompleteType,incomplete] of [
        ['route-path-unsupported',r=>r.path=undefined,'undefined',false,null,'boolean',true],
        ['route-incomplete-unsupported',r=>delete r.incomplete,'array',true,0,'undefined',null]]){
        const w=await fixture(t),search=w.search;
        w.search=(...args)=>{const r={...search(...args),ops:17};if(w.queries.length===9)change(r);return r;};
        const d=w.step(1);assert.equal(d.reason,reason);assert.equal(d.queries,9);assert.equal(w.queries.length,9);
        const q=w.queries[8],origin=w.actor(q.actor),goal=w.flags.find(f=>f.id===q.target);
        assert.deepEqual(d.rejectedQuery,{ordinal:9,origin:{x:origin.x,y:origin.y},goal:{x:goal.x,y:goal.y},
            pathType,pathIsArray,pathLength,incompleteType,incomplete,ops:17});
        assert.equal(d.reportedOps,153);assert.equal(w.calls.length,14);assert(w.calls.every(c=>c.target==='centre'));
        assert.equal(w.records.filter(r=>r.type==='game-state').length,1);
        assert(JSON.stringify(d).length<1500);assert(JSON.stringify(d.rejectedQuery).length<400);
        const next=w.step(2);assert.equal(next.reason,'acquisition-cadence');assert(!('rejectedQuery' in next));
        assert.equal(w.queries.length,9);
    }
});

test('rejected-query fields are fixed and bounded for missing, malformed and thrown results',async t=>{
    const circular={};circular.self=circular;
    const cases=[
        [()=>undefined,'route-result-unsupported','undefined',false,null,'undefined',null,null],
        [()=>({path:null,incomplete:null,ops:0}),'route-path-unsupported','null',false,null,'null',null,0],
        [()=>({path:'private'.repeat(10000),incomplete:false,ops:17}),'route-path-unsupported','string',false,null,'boolean',false,17],
        [()=>({path:circular,incomplete:true,ops:17}),'route-path-unsupported','object',false,null,'boolean',true,17],
        [()=>({path:[],incomplete:1,ops:17}),'route-incomplete-unsupported','array',true,0,'number',null,17],
        [()=>({path:[],incomplete:'false',ops:17}),'route-incomplete-unsupported','array',true,0,'string',null,17],
        [()=>({path:[],incomplete:Symbol('private'),ops:17}),'route-incomplete-unsupported','array',true,0,'symbol',null,17],
        [()=>({path:[],incomplete:1n,ops:17}),'route-incomplete-unsupported','array',true,0,'bigint',null,17],
        [()=>({path:Array(2**32-1),incomplete:undefined,ops:1000}),'route-incomplete-unsupported','array',true,2**32-1,'undefined',null,1000],
        [()=>({path:[],incomplete:false,ops:NaN}),'route-result-unsupported','array',true,0,'boolean',false,null],
        [()=>({path:[],incomplete:false,ops:Infinity}),'route-result-unsupported','array',true,0,'boolean',false,null],
        [()=>({path:[],incomplete:false,ops:1001}),'route-result-unsupported','array',true,0,'boolean',false,1001],
        [()=>{throw Error('private');},'route-result-unsupported','unknown',null,null,'unknown',null,null],
    ];
    for(const [value,reason,pathType,pathIsArray,pathLength,incompleteType,incomplete,ops] of cases){
        const w=await fixture(t),search=w.search;w.search=(...args)=>{search(...args);return value();};
        const d=w.step(1),q=w.queries[0],origin=w.actor(q.actor),goal=w.flags.find(f=>f.id===q.target);
        assert.equal(d.reason,reason);assert.equal(d.queries,1);assert.equal(w.queries.length,1);
        assert.deepEqual(d.rejectedQuery,{ordinal:1,origin:{x:origin.x,y:origin.y},goal:{x:goal.x,y:goal.y},
            pathType,pathIsArray,pathLength,incompleteType,incomplete,ops});
        assert(JSON.stringify(d.rejectedQuery).length<400);assert(JSON.stringify(d).length<1500);
        assert(!JSON.stringify(d).includes('private'));assert.equal(w.calls.length,14);
        assert(w.calls.every(c=>c.target==='centre'));
    }
});

test('valid route diagnostics, query order and movement commands are identical with irrelevant return fields',async t=>{
    const plain=await fixture(t),expected=plain.step(1),queries=structuredClone(plain.queries),calls=structuredClone(plain.calls);
    const recordTypes=plain.records.map(r=>r.type);
    const decorated=await fixture(t),search=decorated.search;
    decorated.search=(...args)=>({...search(...args),cost:Infinity,unused:{large:'private'.repeat(1000)}});
    const actual=decorated.step(1);assert.deepEqual(actual,expected);assert(!('rejectedQuery' in actual));
    assert.deepEqual(decorated.queries,queries);assert.deepEqual(decorated.calls,calls);
    assert.deepEqual(decorated.records.map(r=>r.type),recordTypes);
});

test('route coordinates and continuity remain strict despite valid API envelope and operation counts',async t=>{
    for(const change of [r=>r.path[0]=null,r=>r.path[0]={x:NaN,y:42},r=>r.path[0]={x:Infinity,y:42},
        r=>r.path[0]={x:44.5,y:42},r=>r.path[0]={x:-1,y:42},r=>r.path[0]={x:100,y:42},
        r=>r.path[0]={x:44},r=>r.path.splice(0,1),r=>r.path.pop()]){
        const w=await fixture(t),search=w.search;
        w.search=(...args)=>{const r=search(...args);if(args[1].pos.id==='east')change(r);return r;};
        const d=w.step(1);assert.equal(d.reason,'no-useful-objective');assert.equal(d.queries,24);
        assert(w.calls.every(c=>c.target==='centre'));
    }
});

test('incomplete routes and overlong paths never qualify, and active refresh obeys the same adapter',async t=>{
    const incomplete=await fixture(t);incomplete.mode='incomplete';
    assert.equal(incomplete.step(1).reason,'no-useful-objective');assert.equal(incomplete.queries.length,24);
    const boundary=await fixture(t),base=boundary.search;
    boundary.flags.find(f=>f.id==='east').x=80;
    boundary.search=(from,...args)=>{
        const r=base(from,...args);if(args[0].pos.id!=='east')return r;
        // Pad with contiguous one-cell detours to exactly forty cells. This
        // generated route tests the bound, not native terrain traversability.
        const padding=[];let extra=40-r.path.length;
        if(extra%2){padding.push({x:from.x,y:from.y-1});extra--;}
        while(extra>0){padding.push({x:from.x-1,y:from.y},{x:from.x,y:from.y});extra-=2;}
        return {...r,path:[...padding,...r.path]};
    };
    const accepted=boundary.step(1);assert.equal(accepted.phase,'active');assert.equal(accepted.queries,24);
    assert(boundary.queries.every(q=>q.opts.maxOps===1000));
    for(const length of [40,41]){
        const w=await fixture(t),search=w.search;
        w.search=(...args)=>{const r=search(...args);if(args[1].pos.id==='east')r.path=Array(length).fill({x:0,y:0});return r;};
        const d=w.step(1);assert.equal(d.reason,'no-useful-objective');
        // Forty cells pass the size gate, but this deliberately discontinuous
        // path still fails safety validation. Forty-one excludes only that flag.
        assert.equal(d.queries,length===40?24:21);assert(w.calls.every(c=>c.target==='centre'));
        assert.equal(d.excludedCandidates?.routeLimit??0,length===40?0:1);
    }
    const w=await fixture(t),d=w.step(1);
    for(let tick=2;tick<=5;tick++){for(const id of d.memberIds)w.actor(id).x++;w.step(tick);}
    for(const id of d.memberIds)w.actor(id).x++;
    const search=w.search;w.search=(...args)=>({...search(...args),incomplete:undefined});
    const stopped=w.step(6);assert.equal(stopped.reason,'route-incomplete-unsupported');assert.equal(stopped.phase,'finished');
    assert.equal(stopped.queries,1);assert.equal(stopped.rejectedQuery.ordinal,1);assert.equal(stopped.rejectedQuery.incompleteType,'undefined');
    const ended=w.step(7);assert.equal(w.queries.length,25);assert(!('rejectedQuery' in ended));
});

test('enemy contact and injury preserve actual combat/healing and escort priority',async t=>{
    const w=await fixture(t);w.step(1);Object.assign(w.actor('enemy'),{x:45,y:42});w.actor('b-melee').hits=900;
    const d=w.step(2);assert.equal(d.phase,'finished');
    assert(w.calls.some(c=>c.id==='b-melee'&&c.method==='attack'&&c.target==='enemy'));
    assert(w.calls.some(c=>c.method==='heal'&&c.target==='b-melee'));
    assert(!w.calls.some(c=>c.method==='moveTo'&&c.target==='east'));
});

test('real escort ownership wins after a territorial assignment',async t=>{
    const w=await fixture(t);w.step(1);
    // Melee is within five of the enemy, but the closest healer is outside
    // its danger radius; actual escort planning, not an injected override.
    Object.assign(w.actor('enemy'),{x:49,y:42});
    const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
    const assignment=w.records.findLast(r=>r.type==='healer-escort'&&r.event==='assign');assert(assignment);
    const decision=w.records.findLast(r=>r.tick===2&&r.type==='action-decision'&&r.actorId===assignment.healerId&&r.channel==='movement');
    assert(['escort-in-range','escort-approach'].includes(decision.reason));
});

test('centre defence loss and unavailable membership fence entry with zero searches',async t=>{
    const w=await fixture(t);w.flags[0].my=false;assert.equal(w.step(1).reason,'centre-not-owned');assert.equal(w.queries.length,0);
    w.flags[0].my=true;w.units.filter(c=>c.my).forEach(c=>{if(c.id.startsWith('a-'))c.x=70;});
    assert.equal(w.step(2).reason,'no-eligible-squad');assert.equal(w.queries.length,0);
    const missing=await fixture(t);missing.step(50);assert.equal(missing.queries.length,0);
    assert.equal(missing.records.findLast(r=>r.type==='game-state').secondaryObjective.reason,'membership-unavailable');
});

test('executor ordinary-fallback seam never replaces combat, escort or a centre-anchored rejoin release',async t=>{
    const w=await fixture(t),centre=w.flags[0],target=w.flags[1],melee=w.actor('b-melee'),healer=w.actor('b-healer'),enemy=w.actor('enemy');
    const overrides=new Map([[melee.id,target],[healer.id,target]]),engagements=new Map([[melee.id,{id:enemy.id,outsideTicks:0,supportWaitTicks:2,
        rejoin:{targetId:enemy.id,healerId:healer.id,ticks:1,done:false}}]]);
    moveCreeps([melee,healer],[enemy],centre,engagements,new Map(),null,null,null,false,null,null,overrides);
    assert(w.calls.some(c=>c.id===melee.id&&c.target==='centre'));assert(w.calls.some(c=>c.id===healer.id&&c.target==='east'));
    w.calls=[];const escort={healerId:healer.id,allyId:melee.id,ally:melee,mode:'move-attempt',distance:4};
    moveCreeps([melee,healer],[enemy],centre,new Map(),new Map(),escort,null,null,false,null,null,overrides);
    assert(w.calls.some(c=>c.id===healer.id&&c.target===melee.id));
    w.calls=[];
    const paired={moves:new Map([[melee.id,{target:{x:41,y:40},reason:'paired'}],
        [healer.id,{target:{x:41,y:41},reason:'paired'}]]),context:{leaderId:melee.id,followerId:healer.id}};
    moveCreeps([melee,healer],[enemy],centre,new Map(),new Map(),null,null,null,false,paired,null,overrides);
    assert.deepEqual(w.calls.map(c=>[c.id,c.x,c.y]),[[melee.id,41,40],[healer.id,41,41]]);
});

// Generated capture travel with distinct cells, not a replay resimulation.
async function captureTravelFixture(t,{spread=2,...options}={}){
    const w=await fixture(t,options);w.moveReturn=0;
    w.actor('c-healer').fatigue=1; // B is the one eligible departing squad.
    Object.assign(w.actor('b-healer'),{x:43,y:42});
    for(const [id,y]of [['b-melee',41],['b-ranged1',42],['b-ranged2',43]])
        Object.assign(w.actor(id),{x:43+spread,y});
    const delta=[[0,0],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(const c of w.units)c.move=function(direction){const [dx,dy]=delta[direction];
        w.calls.push({tick:w.tick,id:this.id,method:'move',direction,x:this.x+dx,y:this.y+dy});return w.moveReturn;};
    w.observeSteps=(calls=w.calls)=>{for(const c of calls.filter(c=>c.method==='move'))Object.assign(w.actor(c.id),{x:c.x,y:c.y});};
    w.distinct=()=>assert.equal(new Set(w.units.map(c=>`${c.x},${c.y}`)).size,w.units.length);
    w.distinct();return w;
}

test('scoped readiness real flow admits remote injury without changing routes or direct travel',async t=>{
    const w=await captureTravelFixture(t);
    Object.assign(w.actor('scout1'),{x:10,y:10,hits:999});w.distinct();
    const d=w.step(1);assert.equal(d.reason,'selected');assert.equal(d.phase,'active');
    assert.deepEqual(d.memberIds,['b-healer','b-melee','b-ranged1','b-ranged2']);
    assert.equal(d.queries,24);assert(d.reportedOps<=24000);
    assert.equal(w.calls.filter(c=>c.method==='move').length,4);
    w.observeSteps();w.distinct();const next=w.step(2);
    assert.equal(next.reason,'retained');assert.equal(next.queries,0);assert.equal(next.startedAt,1);
});

test('scoped readiness outsider healing ownership cancels before objective movement and spends attempt',async t=>{
    for(const x of [46,48]){
        const w=await captureTravelFixture(t);
        Object.assign(w.actor('scout1'),{x,y:44,hits:999});w.distinct();
        const d=w.step(1);assert.equal(d.phase,'finished');assert.equal(d.reason,'capture-movement-priority');
        assert.equal(d.queries,24);assert.equal(d.startedAt,1);
        // Terminal diagnostics intentionally clear active member IDs; the
        // pinned squad and queries identify which attempted departure stopped.
        const group=w.loop.getMembershipState().squads.find(s=>s.id===d.squadId);
        assert.deepEqual([...group.memberIds].sort(),['b-healer','b-melee','b-ranged1','b-ranged2']);
        assert(w.queries.every(q=>group.memberIds.includes(q.actor)));assert.deepEqual(d.memberIds,[]);
        assert(!w.calls.some(c=>c.method==='move'||c.method==='moveTo'&&c.target==='east'));
        const support=w.calls.filter(c=>c.id==='b-healer');
        assert.deepEqual(support.map(c=>[c.method,c.target]),[[x===46?'rangedHeal':'moveTo','scout1']]);
        w.actor('scout1').hits=w.actor('scout1').hitsMax;
        for(const tick of [2,11,61]){
            const spent=w.step(tick);assert.equal(spent.phase,'finished');assert.equal(spent.reason,d.reason);
            assert.equal(spent.startedAt,1);assert.deepEqual(spent.memberIds,d.memberIds);assert.equal(spent.queries,0);
        }
        assert.equal(w.queries.length,24);
    }
});

test('disabled scoped readiness preserves injured-outsider healing and exact baseline movement commands',async t=>{
    const w=await captureTravelFixture(t,{off:true});
    Object.assign(w.actor('scout1'),{x:46,y:44,hits:999});w.distinct();
    assert.equal(w.step(1),undefined);assert.equal(w.queries.length,0);
    const expected=w.units.filter(c=>c.my&&c.id!=='b-healer').map(c=>[c.id,'moveTo','centre']);
    expected.push(['b-healer','rangedHeal','scout1']);
    assert.deepEqual(w.calls.map(c=>[c.id,c.method,c.target]).sort(),expected.sort());
    assert(w.records.filter(r=>r.type==='game-state').every(r=>!('secondaryObjective' in r)));
});

test('safe-subset real capture departs around an occupied first cell without moving the held healer',async t=>{
    const w=await captureTravelFixture(t);Object.assign(w.actor('scout1'),{x:44,y:42});w.distinct();
    const first=w.step(1);assert.equal(first.phase,'active');assert.equal(first.queries,24);
    const calls=w.calls.filter(c=>c.method==='move');assert.equal(calls.length,3);
    assert(calls.every(c=>c.id!=='b-healer'&&c.x===46));
    assert(!w.calls.some(c=>c.id==='b-healer'));
    assert.deepEqual(first.travel.actors.find(c=>c.actorId==='b-healer'),{actorId:'b-healer',
        proposed:{x:44,y:42},admitted:null,holdReason:'occupied'});
    assert.equal(first.travel.examined,16);
    for(let mask=0;mask<8;mask++)for(let i=0;i<3;i++){
        const p=mask&(1<<i)?calls[i]:w.actor(calls[i].id);assert(range(p,w.actor('b-healer'))<=3);
    }
    w.observeSteps();w.distinct();const stopped=w.step(2);
    assert.equal(stopped.phase,'finished');assert.equal(stopped.reason,'capture-step-support-unavailable');
    assert.equal(stopped.startedAt,1);assert.equal(stopped.queries,0);
    assert.equal(w.step(11).phase,'finished');assert.equal(w.queries.length,24);
});

test('safe-subset real capture convergence keeps only common moves and owned holds',async t=>{
    const w=await captureTravelFixture(t),search=w.search;
    w.search=(from,goal,opts)=>{
        const r=search(from,goal,opts);
        if(goal.pos.id!=='east'||!['b-healer','b-melee'].includes(from.id))return r;
        const path=[{x:44,y:42}];let p=path[0];
        while(p.x!==goal.pos.x){p={x:p.x+1,y:p.y};path.push(p);}
        while(p.y!==goal.pos.y){p={x:p.x,y:p.y-1};path.push(p);}return{...r,path};
    };
    const d=w.step(1);assert.equal(d.phase,'active');const moves=w.calls.filter(c=>c.method==='move');
    assert.deepEqual(moves.map(c=>c.id).sort(),['b-ranged1','b-ranged2']);
    for(const id of ['b-healer','b-melee']){
        assert(!w.calls.some(c=>c.id===id));const detail=d.travel.actors.find(c=>c.actorId===id);
        assert.equal(detail.admitted,null);assert.equal(detail.holdReason,'converging');
    }
    assert.equal(d.travel.bestSize,3);assert.equal(d.travel.tied,2);assert.equal(d.travel.examined,16);
    assert.equal(d.queries,24);assert.equal(d.startedAt,1);
});

test('safe-subset travel diagnostic is bounded at maximum IDs and adds no queries or log records',async t=>{
    const w=await captureTravelFixture(t);Object.assign(w.actor('scout1'),{x:44,y:42});
    w.units.forEach(c=>c.id=c.id.padEnd(128,'x'));
    const d=w.step(1),{travel,...original}=d;
    assert.equal(d.phase,'active');assert.equal(d.queries,24);assert.equal(w.queries.length,24);
    assert.deepEqual(Object.keys(travel).sort(),['actors','bestSize','examined','tied']);
    assert.equal(travel.actors.length,4);assert.equal(travel.examined,16);
    for(const detail of travel.actors){
        assert.deepEqual(Object.keys(detail).sort(),['actorId','admitted','holdReason','proposed']);
        assert.equal(detail.actorId.length,128);
        for(const p of [detail.proposed,detail.admitted].filter(Boolean)){
            assert.deepEqual(Object.keys(p).sort(),['x','y']);assert(Number.isInteger(p.x)&&Number.isInteger(p.y));
        }
        assert([null,'occupied','converging','no-step','group-hold'].includes(detail.holdReason));
        const attempted=w.calls.find(c=>c.id===detail.actorId);
        if(detail.admitted){assert.equal(attempted.method,'move');assert.deepEqual({x:attempted.x,y:attempted.y},detail.admitted);}
        else assert.equal(attempted,undefined);
    }
    assert(JSON.stringify(travel).length<1200);assert(JSON.stringify(original).length<1500);assert(JSON.stringify(d).length<2700);
    assert.equal(w.records.filter(r=>r.type==='game-state').length,1);
    assert.equal(w.records.filter(r=>r.type==='action-decision').length,42);
    assert.equal(w.records.filter(r=>r.type==='action-attempt').length,w.calls.length);
    const known=new Set(['membership-baseline','membership-change','map-state','game-state','action-decision','action-attempt','runtime-cpu','evidence-coverage']);
    assert(w.records.every(r=>known.has(r.type)));
    // Snapshot proposals remain the pre-action cells, never command-updated
    // positions or retained arrays. Failed/non-displacing calls cannot edit it.
    const first=JSON.stringify(travel);w.step(2);assert.equal(JSON.stringify(travel),first);
});

test('capture partial movement cannot issue a departure that loses healer access',async t=>{
    const w=await captureTravelFixture(t,{spread:3}),first=w.step(1);
    const departure=w.calls.filter(c=>c.method==='move'||c.method==='moveTo'&&c.target==='east');
    // Only the weapons displace in this generated next observation. Old
    // independent moveTo permits range4; guarded travel must refuse it first.
    for(const c of departure.filter(c=>c.id.startsWith('b-')&&c.id!=='b-healer'))w.actor(c.id).x++;
    w.distinct();const next=w.step(2);
    assert.equal(departure.length,0,JSON.stringify({first,next,departure}));
    assert.equal(first.reason,'capture-step-support-unavailable');
    assert.equal(next.phase,'finished');assert.equal(next.startedAt,1);assert.equal(next.queries,0);
    assert(['b-melee','b-ranged1','b-ranged2'].every(id=>range(w.actor(id),w.actor('b-healer'))<=3));
});

test('capture makes positive observed direct-step progress and shares suffix/refresh budgets',async t=>{
    const w=await captureTravelFixture(t),first=w.step(1);assert.equal(first.reason,'selected');assert.equal(first.queries,24);
    const assertSteps=()=>{
        const calls=w.calls.filter(c=>first.memberIds.includes(c.id)&&['move','moveTo'].includes(c.method));
        assert.equal(calls.length,4);assert(calls.every(c=>c.method==='move'&&c.x===w.actor(c.id).x+1&&c.y===w.actor(c.id).y));
        for(let mask=0;mask<16;mask++){
            const positions=first.memberIds.map((id,i)=>{const actor=w.actor(id),call=calls.find(c=>c.id===id);
                return{id,x:mask&(1<<i)?call.x:actor.x,y:mask&(1<<i)?call.y:actor.y};});
            const h=positions.find(c=>c.id==='b-healer');assert(positions.every(c=>range(c,h)<=3));
        }
        assert(w.records.filter(r=>r.tick===w.tick&&r.type==='action-decision'&&r.channel==='movement'&&first.memberIds.includes(r.actorId))
            .every(r=>r.reason==='capture-route-step'&&validActionDecision(r)));
    };
    assertSteps();
    for(let tick=2;tick<=6;tick++){
        w.observeSteps();w.distinct();const d=w.step(tick);
        assert.equal(d.phase,'active');assert.equal(d.reason,'retained');assert.equal(d.startedAt,1);assert.equal(d.unchanged,0);
        assert.equal(d.queries,tick===6?4:0);assert.equal(d.cacheHits,tick===6?0:4);assertSteps();
    }
    assert.equal(w.queries.length,28);assert(w.queries.every(q=>q.opts.maxOps===1000));
    assert.equal(w.step(61).reason,'timeout');assert.equal(w.queries.length,28);assert.equal(w.step(62).phase,'finished');
});

test('capture safe partial displacement revalidates observed support before another step',async t=>{
    const w=await captureTravelFixture(t),first=w.step(1);assert.equal(first.phase,'active');
    w.observeSteps(w.calls.filter(c=>c.id==='b-ranged1'));w.distinct();
    assert.equal(range(w.actor('b-ranged1'),w.actor('b-healer')),3);
    const next=w.step(2);assert.equal(next.phase,'finished');assert.equal(next.reason,'capture-step-support-unavailable');
    assert.equal(next.queries,0);assert.equal(next.startedAt,1);
    assert(!w.calls.some(c=>c.method==='move'));assert(w.calls.filter(c=>c.id.startsWith('b-')).every(c=>c.target==='centre'));
    assert.equal(w.step(10).phase,'finished');assert.equal(w.queries.length,24);
});

test('capture accepted, rejected and unknown returns cannot create observed progress or extend waiting',async t=>{
    for(const rc of [0,-11,undefined]){
        const w=await captureTravelFixture(t);w.moveReturn=rc;const first=w.step(1);
        assert.equal(first.phase,'active');assert.equal(w.calls.filter(c=>c.method==='move').length,4);
        const attempts=w.records.filter(r=>r.type==='action-attempt'&&r.method==='move');
        assert.equal(attempts.length,4);assert(attempts.every(r=>r.returnCode===(rc??null)));
        for(let tick=2;tick<=5;tick++){const d=w.step(tick);assert.equal(d.startedAt,1);
            assert.equal(d.phase,tick===5?'finished':'active');if(tick===5)assert.equal(d.reason,'no-displacement');}
        assert.equal(w.step(20).phase,'finished');assert.equal(w.queries.length,24);
    }
});

test('capture all-occupied or wholly converging first cells hold under the original stall bound',async t=>{
    for(const collision of [false,true]){
        const w=await captureTravelFixture(t);
        if(!collision)for(const [id,x,y]of [['scout1',44,42],['scout2',46,41],['c-healer',46,42],['c-melee1',46,43]])
            Object.assign(w.actor(id),{x,y});
        else {const search=w.search;w.search=(from,goal,opts)=>{const r=search(from,goal,opts);if(goal.pos.id!=='east')return r;
            const path=[{x:44,y:42}];let p=path[0];while(p.x!==goal.pos.x){p={x:p.x+1,y:p.y};path.push(p);}
            while(p.y!==goal.pos.y){p={x:p.x,y:p.y+Math.sign(goal.pos.y-p.y)};path.push(p);}return{...r,path};};}
        w.distinct();const d=w.step(1);assert.equal(d.phase,'active');assert(!w.calls.some(c=>c.method==='move'));
        assert.equal(w.records.filter(r=>r.reason==='capture-route-hold').length,4);
        for(let tick=2;tick<=5;tick++)w.step(tick);
        assert.equal(w.step(6).reason,'no-displacement');assert.equal(w.queries.length,24);
    }
});

test('capture stale routes are refreshed once and malformed refresh cannot yield direct travel',async t=>{
    const w=await captureTravelFixture(t);w.step(1);
    for(let tick=2;tick<=5;tick++){w.observeSteps();assert.equal(w.step(tick).queries,0);}
    w.observeSteps();const search=w.search;w.search=(...args)=>({...search(...args),incomplete:'unknown'});
    const d=w.step(6);assert.equal(d.phase,'finished');assert.equal(d.reason,'route-incomplete-unsupported');assert.equal(d.queries,1);
    assert(!w.calls.some(c=>c.method==='move'));assert.equal(w.step(7).phase,'finished');assert.equal(w.queries.length,25);
});

test('capture current support or healing capability loss cancels with no refresh or direct commands',async t=>{
    for(const lostCapability of [false,true]){
        const w=await captureTravelFixture(t);w.step(1);
        if(lostCapability)w.actor('b-healer').body.find(p=>p.type==='heal').hits=0;else w.actor('b-healer').x-=3;
        const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
        assert.equal(d.reason,lostCapability?'squad-unavailable':'support-unavailable');assert(!w.calls.some(c=>c.method==='move'));
    }
});

test('capture group preflight yields to combat, escort, pairing and support before any owned movement',async t=>{
    for(const priority of ['combat','escort','pair','support']){
        const w=await captureTravelFixture(t),first=w.step(1),ids=first.memberIds;
        const steps=new Map(ids.map(id=>[id,{x:w.actor(id).x+1,y:w.actor(id).y}]));let cancelled=null;
        if(priority==='combat')Object.assign(w.actor('enemy'),{x:48,y:41,body:[{type:'move',hits:100}]});
        if(priority==='support'){w.actor('scout1').hits=900;Object.assign(w.actor('scout1'),{x:39,y:42});}
        w.calls=[];
        const s={movement:{kind:'capture',memberIds:ids,steps},cancel:reason=>{cancelled=reason;return{diagnostic:{phase:'finished',reason}};}};
        const prepared=prepareSecondaryMovement(s,w.units.filter(c=>c.my),w.units.filter(c=>!c.my),w.flags[0],new Map(),
            priority==='escort'?{healerId:'b-healer',allyId:'b-melee'}:null,
            priority==='pair'?{moves:new Map([['b-melee',{}]])}:null,{creeps:w.units,terrainAt:()=>0});
        assert.equal(cancelled,'capture-movement-priority');assert.equal(prepared.moves,null);assert.equal(w.calls.length,0);
        if(priority==='combat'){
            moveCreeps(w.units.filter(c=>c.my),w.units.filter(c=>!c.my),w.flags[0]);
            assert(w.calls.some(c=>c.id==='b-melee'&&c.target==='enemy'&&c.method==='moveTo'));
            assert(!w.calls.some(c=>c.method==='move'));
        }
    }
});

test('shared step support handles more than one capture healer without depending on input order',async t=>{
    const w=await captureTravelFixture(t),ids=['b-healer','b-melee','b-ranged1','b-ranged2'];
    w.actor('b-melee').body=[{type:'move',hits:100},{type:'heal',hits:100}];w.actor('b-healer').x=40;
    const steps=new Map(ids.map(id=>[id,{x:w.actor(id).x+1,y:w.actor(id).y}]));
    for(const actors of [w.units,[...w.units].reverse()])for(const members of [ids,[...ids].reverse()])
        assert.equal(secondaryStepSupport(actors,members,steps),true);
    w.actor('b-melee').body.find(p=>p.type==='heal').hits=0;
    assert.equal(secondaryStepSupport(w.units,ids,steps),false);
});

test('capture direct travel is invariant to actor order and mirrored geometry',async t=>{
    for(const mirror of [false,true]){
        const w=await captureTravelFixture(t,{reverse:true});if(mirror){w.units.forEach(c=>c.x=99-c.x);w.flags.forEach(f=>f.x=99-f.x);}
        const d=w.step(1);assert.equal(d.phase,'active');assert.equal(d.targetId,'east');assert.equal(d.queries,24);
        const moves=w.calls.filter(c=>c.method==='move');assert.equal(moves.length,4);
        assert(moves.every(c=>c.x-w.actor(c.id).x===(mirror?-1:1)));
    }
});

test('disabled capture-travel world retains centre commands without preflight, searches or new evidence',async t=>{
    const w=await captureTravelFixture(t,{off:true});assert.equal(w.step(1),undefined);
    assert.equal(w.queries.length,0);assert.equal(w.calls.length,14);
    assert(w.calls.every(c=>c.method==='moveTo'&&c.target==='centre'));
    assert(w.records.filter(r=>r.type==='game-state').every(r=>!('secondaryObjective' in r)));
});

// Generated contested world. Tests supply subsequent positions explicitly;
// accepted direct moves never update the mock world by themselves.
async function contestFixture(t,options={}){
    const w=await fixture(t,options);w.moveReturn=0;w.captureReady=false;
    Object.assign(w.actor('c-healer'),{x:36,y:45});
    for(const [id,y]of [['c-melee1',42],['c-melee2',43],['c-ranged',44]]){
        Object.assign(w.actor(id),{x:35,y});w.actor(id).body=[{type:'move',hits:100},{type:'ranged_attack',hits:100}];
    }
    Object.assign(w.flags.find(f=>f.id==='west'),{x:20,y:41});
    Object.assign(w.actor('enemy'),{x:20,y:41,body:[{type:'move',hits:100}]});
    const delta=[[0,0],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(const c of w.units)c.move=function(direction){const [dx,dy]=delta[direction];
        w.calls.push({tick:w.tick,id:this.id,method:'move',direction,x:this.x+dx,y:this.y+dy});return w.moveReturn;};
    w.search=(from,goal,opts)=>{
        w.queries.push({tick:w.tick,actor:from.id,target:goal.pos.id,goalRange:goal.range,opts});
        assert.equal(opts.maxOps,1000);
        if(goal.range===0&&!w.captureReady)return{path:[],incomplete:true,ops:1000};
        const path=[];let p={x:from.x,y:from.y};
        while(range(p,goal.pos)>goal.range){
            p=Math.abs(p.x-goal.pos.x)>goal.range?{x:p.x+Math.sign(goal.pos.x-p.x),y:p.y}
                :{x:p.x,y:p.y+Math.sign(goal.pos.y-p.y)};path.push(p);
        }
        return{path,incomplete:false,ops:1000};
    };
    w.observeRequestedSteps=()=>{for(const c of w.calls.filter(c=>c.method==='move'))Object.assign(w.actor(c.id),{x:c.x,y:c.y});};
    w.addEnemy=(id,x,y,parts=['move'])=>{const c=Object.assign(Object.create(Object.getPrototypeOf(w.actor('enemy'))),w.actor('enemy'),
        {id,x,y,body:parts.map(type=>({type,hits:100}))});w.units.push(c);return c;};
    return w;
}

test('safe-subset real contest shares work and retains owned holds around an occupied first cell',async t=>{
    const w=await contestFixture(t);Object.assign(w.actor('scout1'),{x:34,y:42});
    const d=w.step(1);assert.equal(d.reason,'contest-selected');assert.equal(d.queries,24);
    const moves=w.calls.filter(c=>c.method==='move');assert.equal(moves.length,3);
    assert(!w.calls.some(c=>c.id==='c-melee1'));
    assert.equal(d.travel.actors.find(c=>c.actorId==='c-melee1').holdReason,'occupied');
    assert.equal(d.travel.examined,16);assert.equal(d.startedAt,1);
    for(let tick=2;tick<=5;tick++){
        const next=w.step(tick);assert.equal(next.phase,tick===5?'finished':'active');
        if(tick===5)assert.equal(next.reason,'no-displacement');assert.equal(next.startedAt,1);
    }
    assert.equal(w.step(10).phase,'finished');assert.equal(w.queries.length,24);
});

test('contest real flow shares acquisition work and executes only validated adjacent steps',async t=>{
    const w=await contestFixture(t),d=w.step(1);assert.equal(d.reason,'contest-selected');assert.equal(d.mode,'contest');
    assert.equal(d.queries,24);assert.equal(d.reportedOps,24000);
    assert.equal(w.queries.filter(q=>q.goalRange===0).length,20);
    assert.equal(w.queries.filter(q=>q.goalRange>0).length,4);
    for(const id of d.memberIds){const call=w.calls.find(c=>c.id===id&&c.method==='move');assert(call);
        assert.deepEqual({x:call.x,y:call.y},{x:w.actor(id).x-1,y:w.actor(id).y});
        assert(!w.calls.some(c=>c.id===id&&c.method==='moveTo'));}
    assert(w.calls.filter(c=>c.method==='moveTo').every(c=>c.target==='centre'));
    for(let tick=2;tick<=6;tick++){w.observeRequestedSteps();const next=w.step(tick);
        assert.equal(next.reason,'contest-retained');assert.equal(next.queries,tick===6?4:0);
        assert.equal(next.startedAt,1);}
    const moves=w.records.filter(r=>r.tick===6&&r.type==='action-attempt'&&r.method==='move');
    assert.equal(moves.length,4);assert(moves.every(validActionAttempt));
    for(const change of [target=>target.kind='creep',target=>target.id='unexpected',target=>target.x=100]){
        const malformed=structuredClone(moves[0]);change(malformed.target);assert.equal(validActionAttempt(malformed),false);
    }
    assert(w.records.filter(r=>r.type==='action-decision').every(validActionDecision));
});

test('direct-step actuator maps all eight adjacent directions without another path search',async t=>{
    const w=await contestFixture(t),c=w.actor('c-ranged'),deltas=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(const [index,[dx,dy]]of deltas.entries()){
        w.calls=[];moveCreeps([c],[],w.flags[0],new Map(),new Map(),null,null,null,false,null,null,null,
            new Map([[c.id,{x:c.x+dx,y:c.y+dy}]]));
        assert.equal(w.calls.length,1);assert.equal(w.calls[0].method,'move');assert.equal(w.calls[0].direction,index+1);
        assert.equal(w.calls[0].x,c.x+dx);assert.equal(w.calls[0].y,c.y+dy);
    }
    assert.equal(w.queries.length,0);
});

test('contest preserves ranged attack and healing selection at observed engagement positions',async t=>{
    const w=await contestFixture(t);let d=w.step(1);
    for(let tick=2;tick<=13;tick++){w.observeRequestedSteps();d=w.step(tick);assert.equal(d.phase,'active');}
    assert.equal(w.calls.filter(c=>c.method==='rangedAttack'&&c.target==='enemy').length,3);
    assert.equal(w.calls.filter(c=>c.method==='move').length,0);
    assert(d.memberIds.every(id=>range(w.actor(id),w.actor('enemy'))===(id.includes('healer')?4:3)));
    assert(w.records.filter(r=>r.tick===13&&r.type==='action-decision'&&r.channel==='healing').every(r=>r.outcome==='no-action'));
    assert.equal(w.records.find(r=>r.tick===13&&r.actorId==='c-healer'&&r.channel==='healing').reason,'no-injured-target-in-range');
});

test('emergency armed contact invalidates all contest movement before ordinary retreat and tactics',async t=>{
    const w=await contestFixture(t),d=w.step(1);w.addEnemy('armed',34,42,['move','attack']);
    const stopped=w.step(2);assert.equal(stopped.phase,'finished');assert.equal(stopped.queries,0);
    assert(!w.calls.some(c=>c.method==='move'));
    assert(w.records.some(r=>r.tick===2&&r.reason==='ranged-melee-retreat'));
    assert(w.calls.some(c=>c.method==='rangedAttack'&&c.target==='armed'));
    assert(d.memberIds.length===4);
});

test('actual healing separation or lost functioning healing cancels before execution',async t=>{
    for(const change of [w=>w.actor('c-healer').x+=5,
        w=>w.actor('c-healer').body.find(p=>p.type==='heal').hits=0]){
        const w=await contestFixture(t);w.step(1);change(w);const d=w.step(2);
        assert.equal(d.phase,'finished');assert.equal(d.queries,0);assert(!w.calls.some(c=>c.method==='move'));
    }
});

test('injury support movement invalidates contest before the healer executes its ordinary approach',async t=>{
    const w=await contestFixture(t);w.step(1);w.actor('c-melee1').hits=900;w.actor('c-melee1').x=31;
    const d=w.step(2);assert.equal(d.phase,'finished');assert.equal(d.queries,0);
    assert(!w.calls.some(c=>c.method==='move'));
    assert(w.records.some(r=>r.tick===2&&r.actorId==='c-healer'&&r.reason==='injured-ally-approach'));
    assert(w.calls.some(c=>c.id==='c-healer'&&c.method==='moveTo'&&c.target==='c-melee1'));
});

test('prospective partial-success support loss cancels whole-group ownership before any move',async t=>{
    const w=await contestFixture(t);w.step(1);w.actor('c-melee1').x=33;
    const d=w.step(2);assert.equal(d.reason,'contest-step-support-unavailable');assert.equal(d.phase,'finished');
    assert(!w.calls.some(c=>c.method==='move'));
});

test('whole-group preflight rejects escort ownership and incompatible support before any execution',async t=>{
    for(const escort of [false,true]){
        const w=await contestFixture(t),d=w.step(1),ids=d.memberIds,steps=new Map(ids.map(id=>[id,{x:w.actor(id).x-1,y:w.actor(id).y}]));
        let cancelled=null;
        const s={movement:{memberIds:ids,steps},cancel:reason=>{cancelled=reason;return{diagnostic:{phase:'finished',reason}};}};
        if(!escort){w.actor('c-melee1').hits=900;w.actor('c-melee1').x=31;}
        w.calls=[];
        const prepared=prepareSecondaryMovement(s,w.units.filter(c=>c.my),w.units.filter(c=>!c.my),w.flags[0],new Map(),
            escort?{healerId:'c-healer',allyId:'c-melee1'}:null,null,{creeps:w.units,terrainAt:()=>0});
        assert.equal(cancelled,'contest-movement-priority');assert.equal(prepared.moves,null);assert.equal(w.calls.length,0);
    }
});

test('accepted or rejected movement commands without displacement spend the same stall budget',async t=>{
    for(const rc of [0,-11]){const w=await contestFixture(t);w.moveReturn=rc;w.step(1);
        for(let tick=2;tick<=5;tick++){const d=w.step(tick);assert.equal(d.phase,tick===5?'finished':'active');
            if(tick===5)assert.equal(d.reason,'no-displacement');}
        assert.equal(w.queries.length,24);assert.equal(w.step(20).phase,'finished');assert.equal(w.queries.length,24);
    }
});

test('all occupied contest first cells retain owned holds and eventually expire',async t=>{
    const w=await contestFixture(t);assert.equal(w.step(1).reason,'contest-selected');
    // Supply blocking observations only after original membership binds; do
    // not inadvertently form a different squad by relocating actors at birth.
    for(const [id,x,y]of [['scout1',34,42],['scout2',34,43],['b-melee',34,44],['a-melee',35,45]])Object.assign(w.actor(id),{x,y});
    const d=w.step(2);assert.equal(d.phase,'active');assert(!w.calls.some(c=>c.method==='move'));
    assert(d.travel.actors.every(c=>c.holdReason==='occupied'));
    for(let tick=3;tick<=5;tick++)w.step(tick);
    assert.equal(w.records.findLast(r=>r.type==='game-state').secondaryObjective.reason,'no-displacement');
});

test('unarmed reinforcement arrival terminates the contest without an extra search',async t=>{
    const w=await contestFixture(t);w.step(1);w.addEnemy('reinforcement',20,51);
    const d=w.step(2);assert.equal(d.reason,'contest-reinforcement');assert.equal(d.phase,'finished');assert.equal(d.queries,0);
    assert(!w.calls.some(c=>c.method==='move'));
});

test('capture handoff preserves original start, shares four refresh queries and retains direct route ownership',async t=>{
    const w=await contestFixture(t);w.step(1);w.observeRequestedSteps();w.step(2);w.observeRequestedSteps();
    Object.assign(w.actor('enemy'),{x:90,y:90});w.captureReady=true;
    const d=w.step(3);assert.equal(d.reason,'contest-capture-handoff');assert.equal(d.mode,'capture');
    assert.equal(d.startedAt,1);assert.equal(d.queries,4);assert.equal(d.reportedOps,4000);
    assert(w.queries.filter(q=>q.tick===3).every(q=>q.goalRange===0));
    assert(w.calls.filter(c=>d.memberIds.includes(c.id)&&['move','moveTo'].includes(c.method)).every(c=>c.method==='move'));
    assert.equal(w.step(61).reason,'timeout');assert.equal(w.queries.length,28);
    assert.equal(w.step(62).phase,'finished');assert.equal(w.queries.length,28);
});

test('capture handoff cannot evade arrival admission, retry or replenish stalled progress',async t=>{
    const near=await contestFixture(t);near.step(1);Object.assign(near.actor('enemy'),{x:21,y:41});near.captureReady=true;
    const rejected=near.step(2);assert.equal(rejected.phase,'finished');assert.equal(rejected.reason,'objective-unavailable');assert.equal(rejected.queries,4);
    Object.assign(near.actor('enemy'),{x:90,y:90});assert.equal(near.step(3).phase,'finished');assert.equal(near.queries.length,28);
    const stalled=await contestFixture(t);stalled.step(1);stalled.step(2);stalled.step(3);stalled.step(4);
    Object.assign(stalled.actor('enemy'),{x:90,y:90});stalled.captureReady=true;
    assert.equal(stalled.step(5).reason,'no-displacement');assert.equal(stalled.queries.length,24);
});

test('handoff cannot chain targets or return to contest when a replacement occupant appears',async t=>{
    const w=await contestFixture(t);w.step(1);w.observeRequestedSteps();Object.assign(w.actor('enemy'),{x:90,y:90});w.captureReady=true;
    assert.equal(w.step(2).mode,'capture');w.observeRequestedSteps();w.addEnemy('replacement',20,41);
    const stopped=w.step(3);assert.equal(stopped.phase,'finished');assert.equal(stopped.mode,'capture');
    assert.equal(stopped.reason,'objective-unavailable');assert.equal(w.queries.length,28);
});

test('all occupied candidates share the twenty-four-query envelope without capture budget duplication',async t=>{
    const w=await contestFixture(t);
    for(const f of w.flags.filter(f=>!['centre','west'].includes(f.id)))w.addEnemy(`at-${f.id}`,f.x,f.y);
    const d=w.step(1);assert.equal(d.queries,24);assert.equal(d.reportedOps,24000);
    assert(w.queries.every(q=>q.goalRange===3||q.goalRange===4));
});

test('contest duplicate tick cannot reset progress and strict new-match rewind resets spent ownership',async t=>{
    const w=await contestFixture(t);w.step(1);const duplicate=w.step(1);assert.equal(duplicate.startedAt,1);assert.equal(duplicate.queries,0);
    for(let tick=2;tick<=5;tick++)w.step(tick);assert.equal(w.step(6).phase,'finished');
    const reset=w.step(1);assert.equal(reset.reason,'contest-selected');assert.equal(reset.startedAt,1);assert.equal(reset.queries,24);
});

test('disabled real contest world preserves baseline calls, diagnostics and zero secondary queries',async t=>{
    const w=await contestFixture(t,{off:true});assert.equal(w.step(1),undefined);assert.equal(w.queries.length,0);
    assert(!w.calls.some(c=>c.method==='move'));assert.equal(w.calls.filter(c=>c.method==='moveTo').length,14);
    assert(w.calls.every(c=>c.method==='moveTo'&&c.target==='centre'));
});

test('contest identity renaming, input ordering and mirrored geometry retain the physical decision',async t=>{
    for(const rename of [false,true])for(const mirror of ['none','x','y','both']){
        const w=await contestFixture(t,{reverse:true});
        const point=p=>{if(['x','both'].includes(mirror))p.x=99-p.x;if(['y','both'].includes(mirror))p.y=99-p.y;};
        for(const c of w.units){point(c);if(rename)c.id=`new-${c.id.split('').reverse().join('')}`;}
        w.flags.forEach(point);if(rename)for(const f of w.flags)f.id=`new-${f.id}`;
        // Existing centre selection is observation-order based and stays first.
        const d=w.step(1);assert.equal(d.reason,'contest-selected');assert.equal(d.queries,24);
        assert.equal(d.memberIds.length,4);assert.equal(w.calls.filter(c=>c.method==='move').length,4);
        for(const c of w.calls.filter(c=>c.method==='move'))assert.equal(c.x-w.actor(c.id).x,['x','both'].includes(mirror)?1:-1);
    }
});

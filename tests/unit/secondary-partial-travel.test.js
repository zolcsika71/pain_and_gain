import test from 'node:test';
import assert from 'node:assert/strict';
import {presetFixture, range} from '../fixtures/secondary-generated-world.js';
import {prepareSecondaryMovement as candidate, moveCreeps, executeTactics} from '../../src/arena/execute.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {planSecondaryObjective, secondaryTrialLimits} from '../../src/strategy/secondary-objective-plan.js';

// Generated observations/route reports, never historical paths or an engine
// movement simulator. Command returns do not modify any position.
function world({blocked=true,converge=false,kind='capture'}={}) {
    const w=presetFixture();w.tick=1;w.calls=[];w.returns=new Map();w.cancelled=null;w.queries=[];
    const positions={medic:[41,43],bow1:[43,42],bow2:[43,43],blade:[43,44]};
    for(const [id,[x,y]]of Object.entries(positions))Object.assign(w.myCreeps.find(c=>c.id===id),{x,y});
    if(blocked)Object.assign(w.myCreeps.find(c=>c.id==='scout1'),{x:44,y:42});
    const delta=[[0,0],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(const c of [...w.myCreeps,...w.enemies]) {
        c.getRangeTo=function(p){return range(this,p);};
        c.move=function(direction){const [dx,dy]=delta[direction];
            w.calls.push({id:this.id,method:'move',x:this.x+dx,y:this.y+dy});
            return w.returns.has(this.id)?w.returns.get(this.id):0;};
        for(const method of ['moveTo','attack','rangedAttack','heal','rangedHeal'])c[method]=function(target){
            w.calls.push({id:this.id,method,target:target.id,x:target.x,y:target.y});return 0;};
        c.findPathTo=()=>{throw Error('Unexpected extra path search');};
    }
    w.actor=id=>w.myCreeps.find(c=>c.id===id);
    w.ids=[...w.squad.memberIds];
    w.steps=new Map(w.ids.map(id=>[id,{x:w.actor(id).x+1,y:w.actor(id).y}]));
    if(converge)w.steps.set('bow2',{x:44,y:42});
    w.secondary={movement:{kind,memberIds:w.ids,steps:w.steps},cancel:reason=>{
        w.cancelled=reason;return{diagnostic:{phase:'finished',reason}};}};
    w.centre=w.flags.find(f=>f.id===w.centreId);
    w.spacing={creeps:[...w.myCreeps,...w.enemies],terrainAt:()=>0};
    w.prepare=(fn=candidate,extra={})=>fn(w.secondary,w.myCreeps,w.enemies,w.centre,new Map(),
        extra.escort??null,extra.pair??null,extra.spacing??w.spacing);
    w.execute=p=>{
        const evidence=[];const reporter={decision:d=>{evidence.push(d);return d;},attempt:(d,i,a,rc)=>
            evidence.push({type:'attempt',actorId:d.actorId,method:a.method,returnCode:rc??null})};
        w.calls=[];moveCreeps(w.myCreeps,w.enemies,w.centre,new Map(),new Map(),null,null,reporter,
            false,null,w.spacing,null,p.moves,w.secondary.movement?.kind??'capture');return evidence;};
    w.distinct=()=>assert.equal(new Set(w.spacing.creeps.map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length);
    w.distinct();return w;
}
const summary=p=>{const {examined=0,bestSize=0,tied=0}=p.secondary.diagnostic?.travel??{};return{examined,bestSize,tied};};
const admitted=p=>[...p.moves??[]].filter(([,step])=>step).map(([id])=>id).sort();
const copyPositions=w=>w.spacing.creeps.map(c=>({id:c.id,x:c.x,y:c.y}));
function allOutcomesSafe(w,p) {
    const moves=admitted(p);
    for(let mask=0;mask<2**moves.length;mask++) {
        const observation=w.myCreeps.map(c=>({...c,...(moves.includes(c.id)&&mask&(1<<moves.indexOf(c.id))?p.moves.get(c.id):{})}));
        assert.equal(new Set([...observation,...w.enemies].map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length);
        assert.equal(secondaryStepSupport(observation,w.ids,new Map(w.ids.map(id=>[id,null]))),true);
    }
}

function planner(w,previous=null) {
    const membership={initialized:true,lastTick:w.tick,squads:[w.squad],
        members:w.myCreeps.map(c=>({id:c.id,squadId:w.ids.includes(c.id)?w.squad.id:null,
            participating:true,capable:true,canMoveNow:true}))};
    return planSecondaryObjective({...w,creeps:w.spacing.creeps},membership,w.centre,previous,{search:(from,goal,opts)=>{
        w.queries.push({tick:w.tick,maxOps:opts.maxOps,range:goal.range});
        if(goal.pos.id!=='east')return{path:[],incomplete:true,ops:10};
        const path=[];let p={x:from.x,y:from.y};
        while(p.x!==goal.pos.x){p={x:p.x+Math.sign(goal.pos.x-p.x),y:p.y};path.push(p);}
        while(p.y!==goal.pos.y){p={x:p.x,y:p.y+Math.sign(goal.pos.y-p.y)};path.push(p);}
        return{path,incomplete:false,ops:10};
    }});
}
function supplyNextObservation(w,p,successfulIds=admitted(p)) {
    // Explicit distinct-cell next observations supplied by the test, not a
    // claim about which moves Arena accepts/arbitrates/resolves.
    for(const id of successfulIds)Object.assign(w.actor(id),p.moves.get(id));
    w.distinct();w.tick++;
}

test('occupied alternative admits three validated direct steps and retains one owned hold',()=>{
    const w=world(),positions=copyPositions(w),steps=JSON.stringify([...w.steps]);
    const c=w.prepare();assert.deepEqual(admitted(c),['blade','bow2','medic']);
    assert.equal(summary(c).examined,16);assert.equal(summary(c).bestSize,3);assert.equal(summary(c).tied,1);
    const evidence=w.execute(c),commands=w.calls.filter(c=>w.ids.includes(c.id));
    assert.equal(commands.length,3);assert(commands.every(c=>c.method==='move'));
    for(const command of commands)assert.deepEqual({x:command.x,y:command.y},w.steps.get(command.id));
    assert.equal(evidence.filter(e=>e.type==='attempt'&&w.ids.includes(e.actorId)).length,3);
    assert.deepEqual(copyPositions(w),positions);assert.equal(JSON.stringify([...w.steps]),steps);
    allOutcomesSafe(w,c);
});

test('convergence: only common moves of tied maximum safe subsets proceed',()=>{
    const w=world({blocked:false,converge:true}),c=w.prepare();
    assert.deepEqual(admitted(c),['blade','medic']);
    assert.deepEqual(summary(c),{examined:16,bestSize:3,tied:2});allOutcomesSafe(w,c);
    assert.equal(c.moves.get('bow1'),null);assert.equal(c.moves.get('bow2'),null);
});

test('all current destinations occupied: no nonempty admissible subset',()=>{
    const w=world({blocked:false});
    for(const [id,step]of [...w.steps].map(([id,p])=>[id,{...p}])){
        const blocker=w.myCreeps.find(c=>!w.ids.includes(c.id)&&!c.testBlocker);
        Object.assign(blocker,step,{testBlocker:true});
    }
    w.distinct();const c=w.prepare();assert.deepEqual(admitted(c),[]);
    assert.deepEqual(summary(c),{examined:16,bestSize:0,tied:1});allOutcomesSafe(w,c);
});

test('symmetric convergence with other steps blocked does not invent an ID-based winner',()=>{
    const w=world({blocked:false,converge:true});
    Object.assign(w.actor('scout1'),w.steps.get('medic'));Object.assign(w.actor('scout2'),w.steps.get('blade'));
    const c=w.prepare();assert.deepEqual(admitted(c),[]);
    assert.deepEqual(summary(c),{examined:16,bestSize:1,tied:2});
    // Safe singleton moves exist, but neither contender occurs in both maxima.
});

test('no swaps or entry into a cell merely expected to be vacated',()=>{
    const w=world({blocked:false});Object.assign(w.actor('medic'),{x:42,y:43});
    w.steps.set('medic',{x:43,y:43});w.steps.set('bow2',{x:42,y:43});w.distinct();
    const c=w.prepare();assert.deepEqual(admitted(c),['blade','bow1']);
    assert.equal(c.moves.get('medic'),null);assert.equal(c.moves.get('bow2'),null);allOutcomesSafe(w,c);
});

test('full unsafe support admits only supported smaller subsets',()=>{
    const w=world();Object.assign(w.actor('bow2'),{x:44,y:43});w.steps.set('bow2',{x:45,y:43});
    // If only this weapon moved, current healer at41 would be range4 away.
    assert.equal(secondaryStepSupport(w.myCreeps,w.ids,w.steps),false);
    const c=w.prepare();assert.deepEqual(admitted(c),['blade','medic']);assert.equal(w.cancelled,null);
    assert.equal(summary(c).examined,16);allOutcomesSafe(w,c);
});

test('every partial-success outcome preserves current functioning healer access',()=>{
    for(const options of [{},{blocked:false,converge:true}]){
        const w=world(options),c=w.prepare();allOutcomesSafe(w,c);
        for(const rc of [0,-11,undefined]){
            for(const id of admitted(c))w.returns.set(id,rc);
            const before=copyPositions(w),events=w.execute(c);
            assert.deepEqual(copyPositions(w),before);
            assert(events.filter(e=>e.type==='attempt'&&w.ids.includes(e.actorId)).every(e=>e.returnCode===(rc??null)));
        }
    }
});

for(const priority of ['escort','pair','combat','healing'])test(`higher-priority ${priority} cancels before subset admission`,()=>{
    const w=world(),extra={};
    if(priority==='escort')extra.escort={healerId:'medic',allyId:'bow1'};
    if(priority==='pair')extra.pair={moves:new Map([['bow1',{}]])};
    if(priority==='combat')Object.assign(w.enemies[12],{x:46,y:42});
    if(priority==='healing')w.actor('scout1').hits--;
    const c=w.prepare(candidate,extra);
    assert.equal(w.cancelled,'capture-movement-priority');assert.equal(c.moves,null);
    assert.equal(summary(c).examined,0);assert.equal(w.calls.length,0);
});

test('missing routes, nonadjacent steps, unknown occupancy and lost healing stay conservative',()=>{
    for(const [reason,change,extra]of [
        ['capture-route-unavailable',w=>w.steps.delete('bow1'),{}],
        ['capture-route-unavailable',w=>w.steps.set('bow1',{x:90,y:90}),{}],
        ['capture-occupancy-unknown',()=>{}, {spacing:{creeps:null}}],
        ['capture-step-support-unavailable',w=>w.actor('medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;}),{}],
    ]){
        const w=world();change(w);const c=w.prepare(candidate,extra);
        assert.equal(c.moves,null);assert.equal(w.cancelled,reason);assert.equal(summary(c).examined,0);
    }
});

test('no occupancy or convergence hold returns original behavior without subset enumeration',()=>{
    const w=world({blocked:false}),c=w.prepare();
    assert.equal(c.moves,w.steps);assert.equal(summary(c).examined,0);assert.deepEqual(c.moves,w.steps);
});

test('four-member-only comparison leaves smaller groups on the production baseline',()=>{
    const w=world();w.ids.splice(w.ids.indexOf('blade'),1);w.steps.delete('blade');
    const c=w.prepare();assert.deepEqual(admitted(c),[]);assert.equal(summary(c).examined,0);
});

test('bounded no-step and smaller-group hold reasons do not invent moves or change reservations',()=>{
    const w=world();w.steps.set('bow2',null);const reserved=new Set(['80,80']);w.spacing.reserved=reserved;
    const c=w.prepare();assert.equal(c.secondary.diagnostic.travel.actors.find(c=>c.actorId==='bow2').holdReason,'no-step');
    assert.equal(c.moves.get('bow2'),null);assert.equal(w.spacing.reserved,reserved);assert.deepEqual([...reserved],['80,80']);
    w.execute(c);assert.deepEqual([...reserved],['80,80']);
    const smaller=world();smaller.ids.splice(smaller.ids.indexOf('blade'),1);smaller.steps.delete('blade');
    const held=smaller.prepare();assert.equal(held.secondary.diagnostic.travel.actors.length,3);
    assert.equal(held.secondary.diagnostic.travel.actors.find(c=>c.actorId==='medic').holdReason,'group-hold');
    assert.equal(summary(held).examined,0);assert.deepEqual(admitted(held),[]);
});

test('real planner and executor make supplied multi-tick progress with unchanged shared query caps',()=>{
    const w=world();let state=null;
    for(let tick=1;tick<=5;tick++){
        w.secondary=planner(w,state);assert.equal(w.secondary.diagnostic.phase,'active');
        assert.equal(w.secondary.diagnostic.startedAt,1);assert.equal(w.secondary.diagnostic.unchanged,0);
        assert.equal(w.secondary.diagnostic.queries,tick===1?24:0);
        const p=w.prepare();assert.deepEqual(admitted(p),['blade','bow2','medic']);
        assert.equal(summary(p).examined,16);allOutcomesSafe(w,p);w.execute(p);
        state=p.secondary.state;supplyNextObservation(w,p);
    }
    assert.equal(w.actor('medic').x,46);assert.equal(w.actor('bow2').x,48);assert.equal(w.actor('bow1').x,43);
    // Further healer departure would abandon a blocked weapon. Hold the
    // healer; allow only supported weapons, without adding catch-up time.
    w.secondary=planner(w,state);const next=w.prepare();
    assert.deepEqual(admitted(next),['blade','bow2']);allOutcomesSafe(w,next);
    assert.equal(next.secondary.diagnostic.queries,4);assert.equal(next.secondary.diagnostic.startedAt,1);
    state=next.secondary.state;
    for(let tick=7;tick<=10;tick++){
        w.tick=tick;w.secondary=planner(w,state);const p=w.prepare();state=p.secondary.state;
        assert.equal(p.secondary.diagnostic.phase,tick===10?'finished':'active');
        if(tick===10)assert.equal(p.secondary.diagnostic.reason,'no-displacement');
    }
    w.tick++;const spent=planner(w,state);assert.equal(spent.diagnostic.phase,'finished');
    assert.equal(spent.diagnostic.queries,0);assert.equal(w.queries.length,28);
    assert(w.queries.every(q=>q.maxOps===1000&&q.range===0));
    assert.deepEqual(secondaryTrialLimits,{squads:3,cadence:10,cacheTicks:5,queryOps:1000,acquisitionQueries:24,activeQueries:4});
});

for(const rc of [0,-11,undefined])test(`commands returning ${rc} without observed displacement retain the four-observation stop`,()=>{
    const w=world();let state=null;
    for(const id of w.ids)w.returns.set(id,rc);
    for(let tick=1;tick<=5;tick++){
        w.tick=tick;w.secondary=planner(w,state);const p=w.prepare();w.execute(p);state=p.secondary.state;
        assert.equal(p.secondary.diagnostic.startedAt,1);
        assert.equal(p.secondary.diagnostic.phase,tick===5?'finished':'active');
        if(tick===5)assert.equal(p.secondary.diagnostic.reason,'no-displacement');
    }
    w.tick=11;assert.equal(planner(w,state).diagnostic.phase,'finished');assert.equal(w.queries.length,24);
});

test('partial observed progress is not inferred from accepted commands and next support is rechecked',()=>{
    const w=world();w.secondary=planner(w);const p=w.prepare();w.execute(p);
    supplyNextObservation(w,p,['bow2']);assert.equal(range(w.actor('bow2'),w.actor('medic')),3);
    w.secondary=planner(w,p.secondary.state);assert.equal(w.secondary.diagnostic.unchanged,0);
    const next=w.prepare();assert.deepEqual(admitted(next),['blade','medic']);allOutcomesSafe(w,next);
    assert.equal(next.moves.get('bow2'),null);
    assert.equal(next.secondary.diagnostic.startedAt,1);assert.equal(w.queries.length,24);
});

test('original absolute deadline and spent state survive an earlier partial departure',()=>{
    const w=world();w.secondary=planner(w);const p=w.prepare();supplyNextObservation(w,p);
    w.tick=61;const stopped=planner(w,p.secondary.state);assert.equal(stopped.diagnostic.reason,'timeout');
    assert.equal(stopped.diagnostic.startedAt,1);assert.equal(stopped.diagnostic.queries,0);
    w.tick=62;assert.equal(planner(w,stopped.state).diagnostic.phase,'finished');
    assert.equal(w.queries.length,24);
});

test('ownership change is not a capture or a new attempt after a subset step',()=>{
    const w=world();w.secondary=planner(w);const p=w.prepare();supplyNextObservation(w,p);
    w.flags.find(f=>f.id==='east').my=false;
    const stopped=planner(w,p.secondary.state);assert.equal(stopped.diagnostic.reason,'ownership-changed');
    assert.equal(stopped.diagnostic.phase,'finished');assert.equal(stopped.diagnostic.queries,0);
});

test('contest seam keeps compatible ranged attacks; capture still yields to the same combat intent',()=>{
    const w=world({kind:'contest'});Object.assign(w.enemies[12],{x:46,y:42});
    const p=w.prepare();assert.deepEqual(admitted(p),['blade','bow2','medic']);
    w.execute(p);const beforeTactics=copyPositions(w);
    executeTactics(w.myCreeps,w.enemies,[]);
    assert(w.calls.some(c=>c.id==='bow1'&&c.method==='rangedAttack'));
    assert.deepEqual(copyPositions(w),beforeTactics);
    // This is an executor/preflight seam case, not contest admission evidence.
    w.secondary.movement.kind='capture';assert.equal(w.prepare().moves,null);
    assert.equal(w.cancelled,'capture-movement-priority');
});

test('current-tick healing is not upgraded using a proposed future adjacent cell',()=>{
    const w=world();w.actor('bow2').hits--;
    const p=w.prepare();assert.equal(p.moves,null);assert.equal(w.cancelled,'capture-movement-priority');
    executeTactics(w.myCreeps,w.enemies,[w.actor('bow2')]);
    assert(w.calls.some(c=>c.id==='medic'&&c.method==='rangedHeal'&&c.target==='bow2'));
    assert(!w.calls.some(c=>c.id==='medic'&&c.method==='heal'));
});

for(const convergence of [false,true])test(`order, renaming and reflections preserve physical subset decisions: convergence ${convergence}`,()=>{
    const source=world({blocked:!convergence,converge:convergence}),expected=admitted(source.prepare());
    for(const renamed of [false,true])for(const reversed of [false,true])for(const mirror of [false,'x','y','both']){
        const w=world({blocked:!convergence,converge:convergence}),rename=s=>renamed?`z-${[...s].reverse().join('')}`:s;
        const point=p=>({x:mirror&&mirror!=='y'?99-p.x:p.x,y:mirror&&mirror!=='x'?99-p.y:p.y});
        const oldSteps=[...w.steps];
        for(const c of [...w.myCreeps,...w.enemies]){Object.assign(c,point(c));c.id=rename(c.id);}
        for(const f of w.flags)Object.assign(f,point(f));
        w.ids.splice(0,w.ids.length,...w.ids.map(rename));
        w.steps.clear();for(const [id,p]of oldSteps)w.steps.set(rename(id),point(p));
        if(reversed){w.myCreeps.reverse();w.enemies.reverse();w.ids.reverse();
            const entries=[...w.steps].reverse();w.steps.clear();entries.forEach(([id,p])=>w.steps.set(id,p));w.spacing.creeps.reverse();}
        const p=w.prepare();assert.deepEqual(admitted(p),expected.map(rename).sort());
        assert(summary(p).examined<=16);allOutcomesSafe(w,p);
    }
});

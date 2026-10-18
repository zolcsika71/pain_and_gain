import test from 'node:test';
import assert from 'node:assert/strict';
import {openingWorld} from '../fixtures/opening-secondary-generated-world.js';
import {planOpeningSecondary,openingLimits} from '../fixtures/opening-secondary-candidate.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {updateMembership} from '../../src/squads/membership.js';
import {selectSecondaryObjective} from '../../src/strategy/objectives.js';

const moving=p=>[...p.moves??[]].filter(([,step])=>step).map(([id])=>id);
const positions=w=>w.spacing.creeps.map(c=>({id:c.id,x:c.x,y:c.y}));
const tactics=trace=>trace.calls.filter(c=>!['move','moveTo'].includes(c.method));
function safeOutcomes(w,p){
    const ids=moving(p),group=w.group().memberIds;
    for(let mask=0;mask<2**ids.length;mask++){
        const friends=w.myCreeps.map(c=>({...c,...(mask&(1<<ids.indexOf(c.id))&&ids.includes(c.id)?p.moves.get(c.id):{})}));
        assert.equal(new Set([...friends,...w.enemies].map(c=>`${c.x},${c.y}`)).size,28);
        assert(secondaryStepSupport(friends,group,new Map(group.map(id=>[id,null]))));
    }
}

test('production birth membership splits only its existing pure-ranged squad; centre is a mission, not defended',()=>{
    const w=openingWorld(),before=positions(w),membership=JSON.stringify(w.membership),baseline=w.execute();
    assert.equal(w.membership.squads.length,3);assert.equal(w.group().memberIds.length,4);
    assert(baseline.calls.every(c=>c.method==='moveTo'&&c.target===w.centreId));
    assert.equal(selectSecondaryObjective({...w,squad:w.group(),routes:[]}).reason,'centre-not-owned');
    const plan=w.plan();assert.equal(plan.state.phase,'active');assert.equal(plan.objectiveId,'east');
    assert.equal(plan.centreId,w.centreId);assert.equal(w.centre.my,undefined);
    assert(w.myCreeps.every(c=>c.getRangeTo(w.centre)>3));
    assert.equal(JSON.stringify(w.membership),membership);assert.deepEqual(positions(w),before);
    const split=w.execute(plan),ids=w.group().memberIds;
    assert.equal(moving(plan).length,4);assert.equal(split.calls.filter(c=>c.method==='move').length,4);
    assert(plan.work.candidates<=6);assert(plan.work.routes<=24);assert(plan.work.pathCells<=960);
    assert(plan.work.routeThreatChecks<=13440);
    assert.equal(split.calls.filter(c=>!ids.includes(c.id)&&c.method==='moveTo'&&c.target===w.centreId).length,10);
    assert.deepEqual(tactics(split),tactics(baseline));assert.deepEqual(positions(w),before);
    assert.equal(openingLimits.centreWeapons,6);assert.equal(openingLimits.centreHealers,2);safeOutcomes(w,plan);
});

test('five successive supplied observations make useful supported progress without changing centre mission or tactical traces',()=>{
    const w=openingWorld(),start=new Map(w.myCreeps.map(c=>[c.id,{x:c.x,y:c.y}]));let first=null;
    const trace=[];
    for(let tick=1;tick<=5;tick++){
        const baseline=w.execute(),plan=w.plan();assert.equal(plan.state.phase,'active');first??=plan;
        const split=w.execute(plan);assert.deepEqual(tactics(split),tactics(baseline));safeOutcomes(w,plan);
        assert.equal(plan.objectiveId,first.objectiveId);assert.equal(plan.state.selection.startedAt,1);
        assert(plan.diagnostic.queries<=(tick===1?24:4));assert.equal(plan.state.selection.unchanged,0);
        assert.equal(plan.diagnostic.reportedOps,tick===1?1600:0);
        const remaining=w.myCreeps.filter(c=>!w.group().memberIds.includes(c.id));
        assert(remaining.every(c=>c.x===start.get(c.id).x&&c.y===start.get(c.id).y));
        trace.push({tick,queries:plan.diagnostic.queries,steps:moving(plan).length});w.next(plan);
    }
    for(const id of w.group().memberIds)assert.equal(w.actor(id).x,start.get(id).x+5);
    assert.equal(w.centre.my,undefined);assert.equal(w.flags.find(f=>f.id==='east').my,undefined);
    assert.deepEqual(trace.map(t=>t.steps),[4,4,4,4,4]);
});

test('production utility compares neutral income with whole-army melee, ranged and healing penalties',()=>{
    const w=openingWorld();const p=w.plan(),e=p.evaluation;
    assert.equal(e.captureIncome,3);assert.equal(e.deniedIncome,0);assert.equal(e.ownCapacityLoss,192);
    assert.equal(e.enemyCapacityRelief,0);assert.equal(e.ownMultiplierBefore,1);assert.equal(e.ownMultiplierAfter,0.8);
    assert(Math.abs(e.utility-3/(e.maxSteps+1)*(1-192/1476))<1e-12);
    // Equal geometry across separate worlds makes the tradeoff explicit.
    // Swap the unused flag's position so every world keeps distinct flags.
    const comparisons=[];
    for(const [target,loss,income]of [['east',192,3],['near',60,3],['north',54,4]]){
        const x=openingWorld(),flag=x.flags.find(f=>f.id===target),old={x:flag.x,y:flag.y};
        if(target!=='east')Object.assign(x.flags.find(f=>f.id==='east'),old);
        Object.assign(flag,{x:44,y:20});x.reports([target]);
        const r=x.plan();assert.equal(r.objectiveId,target);assert.equal(r.evaluation.ownCapacityLoss,loss);
        assert.equal(r.evaluation.captureIncome,income);comparisons.push(r.evaluation.utility);
    }
    assert(comparisons[2]>comparisons[1]&&comparisons[1]>comparisons[0]);
});

test('ranking selects between distinct neutral destinations and does not consider enemy-owned income',()=>{
    const w=openingWorld();Object.assign(w.flags.find(f=>f.id==='north'),{x:44,y:18});w.reports(['east','north']);
    assert.equal(w.plan().objectiveId,'north');
    const enemyOwned=openingWorld();enemyOwned.flags.find(f=>f.id==='east').my=false;
    assert.equal(enemyOwned.plan().state.phase,'finished');assert.equal(enemyOwned.state.reason,'no-useful-objective');
});

test('safe subset bypasses one occupied proposed cell; non-admitted actor retains objective hold',()=>{
    const w=openingWorld();Object.assign(w.actor('scout1'),{x:28,y:19});w.distinct();
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(moving(p).length,3);
    assert.equal(p.diagnostic.travel.examined,16);assert.equal(p.moves.get('bow1'),null);safeOutcomes(w,p);
    const trace=w.execute(p);assert(!trace.calls.some(c=>c.id==='bow1'));
    w.next(p);assert.equal(w.actor('bow1').x,27);assert.equal(w.actor('medic').x,26);
    assert.equal(w.plan().state.phase,'active');
});

test('converging first cells admit only common safe moves without inventing an arbitration winner',()=>{
    const w=openingWorld(),report=w.routes.find(r=>r.actorId==='bow2'&&r.flagId==='east');
    report.path=[{x:28,y:19},...report.path.slice(1)];
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(p.diagnostic.travel.examined,16);
    assert.equal(p.moves.get('bow1'),null);assert.equal(p.moves.get('bow2'),null);
    assert.equal(moving(p).length,2);safeOutcomes(w,p);
});

test('a supplied partial success is revalidated; unsafe next weapons hold while the healer progresses',()=>{
    const w=openingWorld(),p=w.plan();safeOutcomes(w,p);
    w.next(p,moving(p).filter(id=>id!=='medic'));
    assert.equal(w.actor('medic').x,25);assert.equal(w.actor('bow1').x,28);
    const next=w.plan();assert.equal(next.state.phase,'active');
    assert.deepEqual(moving(next),['medic']);safeOutcomes(w,next);
    assert.equal(next.state.selection.startedAt,1);assert.equal(next.diagnostic.queries,0);
    assert.deepEqual(w.execute(next).calls.filter(c=>c.method==='move').map(c=>c.id),['medic']);
});

for(const returned of [0,-11,undefined])test(`return ${String(returned)} without observed displacement spends four observations, never extends mission`,()=>{
    const w=openingWorld();for(const id of w.group().memberIds)w.returns.set(id,returned);
    let plan=w.plan();
    for(let tick=2;tick<=5;tick++){
        const before=positions(w);w.execute(plan);assert.deepEqual(positions(w),before);
        w.next(plan,[]);plan=w.plan();
        assert.equal(plan.state.phase,tick===5?'finished':'active');
    }
    assert.equal(plan.diagnostic.reason,'no-displacement');w.tick++;w.bind();w.reports();
    assert.equal(w.plan().diagnostic.reason,'no-displacement');
});

test('fully occupied proposals retain objective-owned holds and terminate after four unchanged observations',()=>{
    const w=openingWorld();
    // The whole other supported squad is a supplied stationary blocker group;
    // it still meets centre-mission support, but is not claimed at centre.
    for(const[id,p]of Object.entries({guardH1:{x:26,y:20},guardM0:{x:28,y:19},
        guardM1:{x:28,y:20},guardM2:{x:28,y:21}}))Object.assign(w.actor(id),p);
    w.distinct();let p=w.plan();assert.equal(p.state.phase,'active');assert.equal(moving(p).length,0);
    for(let tick=2;tick<=5;tick++){
        const trace=w.execute(p);assert(!trace.calls.some(c=>w.group().memberIds.includes(c.id)));
        w.next(p,[]);p=w.plan();assert.equal(p.state.phase,tick===5?'finished':'active');
    }
    assert.equal(p.diagnostic.reason,'no-displacement');
});

test('support-invalid relocation of blockers is independently rejected, not forced into a congestion example',()=>{
    const w=openingWorld();const other=w.myCreeps.filter(c=>!w.group().memberIds.includes(c.id));
    const steps=w.routes.filter(r=>r.flagId==='east').map(r=>r.path[0]);
    // Move four nonmember blockers as supplied observations; no vacating assumed.
    // Use scouts and a supported weapon/healer pair; preserve mission support.
    const blockers=[w.actor('scout1'),w.actor('scout2'),w.actor('guardR0'),w.actor('guardH2')];
    blockers.forEach((c,i)=>Object.assign(c,steps[i]));
    // Relocation breaks the existing centre force's support. Rejection is
    // retained rather than weakening that independent gate to create a hold.
    assert(other.length===10);const p=w.plan();assert.equal(p.moves,null);
    assert.equal(p.state.phase,'finished');
});

test('a cell requested by a departing actor remains occupied until an observation confirms vacating',()=>{
    const w=openingWorld(),r=w.routes.find(r=>r.actorId==='bow1'&&r.flagId==='east');
    r.path.unshift({x:27,y:20}); // Current bow2 cell, even though bow2 proposes moving.
    const p=w.plan();assert.equal(p.state.phase,'active');assert.equal(p.moves.get('bow1'),null);
    assert(p.moves.get('bow2'));safeOutcomes(w,p);
});

test('absolute deadline is fixed despite supplied progress; completion cannot chain a second mission',()=>{
    const w=openingWorld(),first=w.plan();w.next(first);w.tick=61;w.bind();w.reports();
    assert.equal(w.plan().diagnostic.reason,'timeout');
    w.tick=62;w.bind();w.reports();assert.equal(w.plan().diagnostic.reason,'timeout');
    const c=openingWorld(),p=c.plan();c.next(p);c.flags.find(f=>f.id===p.objectiveId).my=true;
    assert.equal(c.plan().diagnostic.reason,'captured');c.tick++;c.bind();c.reports();
    assert.equal(c.plan().diagnostic.reason,'captured');
});

test('centre ownership may become ours without resetting opening; changed centre identity or enemy ownership cancels',()=>{
    const w=openingWorld(),p=w.plan();w.next(p);w.centre.my=true;
    const r=w.plan();assert.equal(r.state.phase,'active');assert.equal(r.state.selection.startedAt,1);
    for(const change of [x=>x.centre.my=false,x=>x.centre.x++]){
        const x=openingWorld(),a=x.plan();x.next(a);change(x);assert.equal(x.plan().state.phase,'finished');
    }
});

for(const [name,change]of [
    ['centre pressure',w=>Object.assign(w.enemies[3],{x:40,y:41})],
    ['retained mission pressure',w=>Object.assign(w.enemies[3],{x:12,y:10})],
    ['departing pressure',w=>Object.assign(w.enemies[3],{x:29,y:20})],
    ['no routes',w=>w.routes=[]],
    ['stale route',w=>w.routes.find(r=>r.flagId==='east').tick--],
    ['incomplete route',w=>w.routes.find(r=>r.flagId==='east').incomplete=true],
    ['invalid coordinate',w=>w.routes.find(r=>r.flagId==='east').path[0].x=NaN],
    ['nonadjacent route',w=>w.routes.find(r=>r.flagId==='east').path[0].x+=5],
    ['unknown ops',w=>w.routes[0].ops=undefined],
    ['excess ops',w=>w.routes[0].ops=1001],
    ['excess query reports',w=>w.routes.push({...w.routes[0]})],
    ['unknown terrain',w=>w.spacing.terrainAt=()=>undefined],
    ['wall at first step',w=>w.spacing.terrainAt=()=>1],
    ['incomplete occupancy',w=>w.spacing.creeps=w.myCreeps],
    ['duplicate occupancy',w=>w.spacing.creeps=[...w.myCreeps,...w.enemies.slice(1),w.myCreeps[0]]],
    ['lost centre healer',w=>w.actor('guardH1').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
    ['lost departing HEAL',w=>w.actor('medic').body.forEach(p=>{if(p.type==='heal')p.hits=0;})],
    ['centre support separation',w=>w.actor('guardH1').x=5],
    ['selected fatigue',w=>w.actor('bow1').fatigue=1],
    ['missing roster',w=>w.myCreeps.splice(w.myCreeps.indexOf(w.actor('scout1')),1)],
    ['malformed observation',w=>w.observationComplete=false],
])test(`inadmissible opening retains centre-only movement: ${name}`,()=>{
    const w=openingWorld();change(w);const p=w.plan();assert.equal(p.moves,null);assert.equal(p.state.phase,'finished');
    const baseline=w.execute(),candidate=w.execute(p);assert.deepEqual(candidate.calls,baseline.calls);
    assert(!candidate.records.some(r=>r.reason?.startsWith('opening-route-')));
});

test('enemy approach preserves current-tick attacks and emergency escape instead of forcing travel',()=>{
    const w=openingWorld(),p=w.plan();w.next(p);Object.assign(w.enemies[3],{x:29,y:19});
    const baseline=w.execute(),cancelled=w.plan(),result=w.execute(cancelled);
    assert.equal(cancelled.state.phase,'finished');assert.deepEqual(result.calls,baseline.calls);
    assert(result.records.some(r=>r.reason==='ranged-melee-retreat'));
    assert(tactics(result).some(c=>c.method==='rangedAttack'));
});

test('retained range-six combat approach takes priority even when a route away passes current danger and arrival checks',()=>{
    const w=openingWorld();Object.assign(w.actor('medic'),{x:26,y:20});Object.assign(w.actor('bow1'),{x:29,y:20});
    Object.assign(w.flags.find(f=>f.id==='east'),{x:10,y:20});Object.assign(w.enemies[3],{x:35,y:20});w.reports();
    const previous=()=>new Map([['bow1',{id:w.enemies[3].id,outsideTicks:0}]]);
    const p=w.plan({engagements:previous()});assert.equal(p.diagnostic.reason,'capture-movement-priority');
    assert.equal(p.moves,null);
    const baseline=w.execute(null,{engagements:previous()}),cancelled=w.execute(p,{engagements:previous()});
    assert.deepEqual(cancelled.calls,baseline.calls);
    assert(cancelled.records.some(r=>r.actorId==='bow1'&&r.reason==='combat-approach'));
});

test('competing injured ally keeps real healing selection and support ownership on cancellation',()=>{
    const w=openingWorld(),p=w.plan();w.next(p);
    Object.assign(w.actor('guardR0'),{x:27,y:22});w.actor('guardR0').hits--;
    const baseline=w.execute(),cancelled=w.plan(),result=w.execute(cancelled);
    assert.equal(cancelled.state.phase,'finished');assert.deepEqual(result.calls,baseline.calls);
    assert(tactics(result).some(c=>c.id==='medic'&&c.method==='rangedHeal'&&c.target==='guardR0'));
    assert(result.records.some(r=>r.actorId==='medic'&&r.reason==='injured-ally-in-range'));
});

test('later observed centre-force separation cancels diversion, without claiming to coordinate remaining movement',()=>{
    const w=openingWorld(),p=w.plan();w.next(p);
    // Adverse SUPPLIED observation, not a prediction of ordinary moveTo effects.
    w.actor('guardM0').x=14;
    const next=w.plan();assert.equal(next.diagnostic.reason,'centre-mission-unavailable');assert.equal(next.moves,null);
    assert.deepEqual(w.execute(next).calls,w.execute().calls);
});

for(const owner of ['escort','pair'])test(`${owner} ownership cancels group before objective execution`,()=>{
    const w=openingWorld(),extra=owner==='escort'?{escort:{healerId:'medic',allyId:'bow1',mode:'hold'}}:
        {pair:{moves:new Map([['bow1',{target:null,reason:'pair-hold'}]]),context:{leaderId:'bow1',followerId:'bow2'}}};
    const p=w.plan(extra);assert.equal(p.diagnostic.reason,'capture-movement-priority');assert.equal(p.moves,null);
    assert.deepEqual(w.execute(p,extra).calls,w.execute(null,extra).calls);
});

test('mission cannot start late, retry after rejection, or rebuild damaged birth membership to choose a healthier squad',()=>{
    const late=openingWorld();late.tick=2;late.bind();assert.equal(late.plan().diagnostic.reason,'opening-missed');
    const w=openingWorld();w.routes=[];assert.equal(w.plan().state.phase,'finished');w.tick++;w.bind();w.reports();
    assert.equal(w.plan().state.phase,'finished');
    const hybrid=openingWorld();hybrid.actor('bow1').body.push({type:'heal',hits:0});hybrid.membership=null;hybrid.bind();
    assert.equal(hybrid.plan().diagnostic.reason,'opening-squad-unavailable');
});

test('a production birth with no existing pure-ranged squad cannot be rearranged to admit a split',()=>{
    const w=openingWorld();Object.assign(w.actor('bow1'),{x:10,y:9});w.membership=null;w.bind();
    const original=JSON.stringify(w.membership),p=w.plan();
    assert.equal(p.diagnostic.reason,'opening-squad-unavailable');assert.equal(p.moves,null);
    assert.equal(JSON.stringify(w.membership),original);
});

test('generated transport rejects excess/unknown reports at refresh, while cache reuse does not repay reports',()=>{
    for(const change of [w=>w.routes.push({...w.routes[0]}),w=>w.routes[0].ops=undefined]){
        const w=openingWorld(),first=w.plan();w.next(first);w.tick=6;w.bind();w.reports();
        assert.equal(w.routes.length,4);change(w);
        const failed=w.plan();assert.equal(failed.diagnostic.reason,'route-result-unsupported');
        assert.equal(failed.diagnostic.reportedOps,null);assert.equal(failed.diagnostic.queries,1);
    }
    const boundary=openingWorld();boundary.routes.forEach(r=>{r.ops=1000;});
    const p=boundary.plan();assert.equal(p.diagnostic.queries,16);assert.equal(p.diagnostic.reportedOps,16000);
    boundary.next(p);boundary.routes.forEach(r=>{r.ops=1000;});
    const next=boundary.plan();assert.equal(next.diagnostic.queries,0);assert.equal(next.diagnostic.reportedOps,0);
    assert.equal(next.diagnostic.cacheHits,4);
});

test('invalid tick cannot reopen spent state; strict new-match tick1 can start again with fresh membership',()=>{
    const w=openingWorld(),p=w.plan();w.next(p);w.tick=NaN;
    const invalid=w.plan();assert.equal(invalid.state.phase,'finished');
    w.tick=3;w.bind();w.reports();assert.equal(w.plan().state.phase,'finished');
    const fresh=openingWorld();const reset=planOpeningSecondary(fresh,fresh.membership,w.state,{spacing:fresh.spacing});
    assert.equal(reset.state.phase,'active');assert.equal(reset.state.selection.startedAt,1);
});

test('renaming, input order and mirrored geometry retain physical grouping, non-tied ranking and admitted steps',()=>{
    const baseline=openingWorld(),expected=baseline.plan(),physical=p=>[...p.moves].map(([,v])=>v).filter(Boolean);
    for(const [rename,reverse,mirror]of [[false,true,false],[true,false,false],[false,false,true],[true,true,true]]){
        const w=openingWorld(),id=s=>rename?`z-${[...s].reverse().join('')}`:s,point=p=>mirror?{x:99-p.x,y:99-p.y}:p;
        for(const c of [...w.myCreeps,...w.enemies]){c.id=id(c.id);Object.assign(c,point(c));}
        for(const f of w.flags){f.id=id(f.id);Object.assign(f,point(f));}w.centreId=id(w.centreId);
        if(reverse){w.myCreeps.reverse();w.enemies.reverse();w.flags.reverse();}
        w.membership=updateMembership(null,{tick:1,myCreeps:w.myCreeps});w.reports([id('east')]);
        const actual=w.plan();assert.equal(actual.objectiveId,id(expected.objectiveId));
        assert.deepEqual(actual.evaluation,{...expected.evaluation,flagId:id(expected.objectiveId)});
        const sort=xs=>xs.map(p=>`${p.x},${p.y}`).sort();
        assert.deepEqual(sort(physical(actual)),sort(physical(expected).map(point)));
    }
});

test('immutable supplied observations and duplicate tick cannot cause extra objective movement',()=>{
    const w=openingWorld(),before=JSON.stringify({creeps:positions(w),routes:w.routes,membership:w.membership});
    const p=w.plan();assert.equal(JSON.stringify({creeps:positions(w),routes:w.routes,membership:w.membership}),before);
    assert.equal(w.plan().diagnostic.reason,'duplicate-observation');
    assert.equal(p.state.selection.startedAt,1);assert.equal(p.state.selection.startedAt+openingLimits.lifetime,61);
});

test('explicitly unknown ownership cannot be normalized to an empty unavailable list',()=>{
    const w=openingWorld();assert.equal(w.plan({unavailableIds:null}).diagnostic.reason,'unsupported-observation');
    const owned=openingWorld();assert.equal(owned.plan({unavailableIds:['medic']}).moves,null);
});

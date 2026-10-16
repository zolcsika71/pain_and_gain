import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectMovementPlan} from '../../src/tactics/movement.js';
import {selectHealingDecision} from '../../src/tactics/healing.js';
import {executeTactics,moveCreeps} from '../../src/arena/execute.js';
import {planHealerEscort} from '../../src/tactics/healer-escort.js';
import {improveHealerHold} from '../fixtures/healer-useful-closing-candidate.js';
import {findExistingNeighbour} from '../fixtures/healer-neighbour-evaluator.js';

const recorded=JSON.parse(fs.readFileSync(new URL('../fixtures/healer-useful-closing-window.json',import.meta.url)));
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const parts=(type,n)=>Array.from({length:n},()=>({type,hits:100}));
function unit(id,x,y,body,options={}){
    const c={id,x,y,my:true,exists:true,hits:1200,hitsMax:1200,fatigue:0,body,calls:[],...options,
        getRangeTo(p){return range(this,p);}};
    for(const method of ['moveTo','heal','rangedHeal','attack','rangedAttack'])c[method]=p=>{c.calls.push({method,id:p.id??null,x:p.x,y:p.y});return 0;};
    return c;
}
function generated(){
    const h=unit('h',5,5,[...parts('heal',6),...parts('move',6)]);
    const ally=unit('a',7,5,[...parts('ranged_attack',6),...parts('move',6)],{hits:200});
    return {h,ally,friends:[h,ally],enemies:[],flag:{id:'centre',x:0,y:0},owner:'ordinary',healModifier:1,
        spacing:{creeps:[h,ally],terrainAt:()=>0}};
}
function add(w,c){(c.my?w.friends:w.enemies).push(c);w.spacing.creeps.push(c);return c;}
function baseline(w){return selectMovementPlan(w.h,w.enemies,w.flag,null,w.friends,false,w.spacing);}
function select(w,plan=baseline(w),find=findExistingNeighbour){
    assert.equal(new Set(w.spacing.creeps.map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length,'distinct occupied cells');
    return improveHealerHold({creep:w.h,friends:w.friends,enemies:w.enemies,spacing:w.spacing,
        baseline:plan,owner:w.owner,healModifier:w.healModifier},find);
}
const healing=w=>selectHealingDecision(w.h,w.friends.filter(c=>c.hits<c.hitsMax));
const capacity=(h,t,p,modifier=1)=>Math.min(t.hitsMax-t.hits,
    h.body.filter(p=>p.type==='heal'&&p.hits>0).length*(range(p,t)<=1?12:range(p,t)<=3?4:0)*modifier);

test('generated safe closing has prospective72 vs24 capacity, unchanged current-tick ranged healing',()=>{
    const w=generated(),old=baseline(w),before=healing(w);assert.equal(old.outcome,'hold');
    let n=0;w.spacing.terrainAt=()=>{n++;return 0;};
    const plan=select(w,old);assert.equal(plan.reason,'healer-useful-close');assert.deepEqual(plan.target,{x:6,y:4});
    assert.equal(capacity(w.h,w.ally,w.h),24);assert.equal(capacity(w.h,w.ally,plan.target),72);assert(n<=8);
    assert.deepEqual(healing(w),before);assert.equal(before.action.method,'rangedHeal');
    executeTactics([w.h],[],[w.ally]);assert.deepEqual(w.h.calls.map(c=>c.method),['rangedHeal']);
    assert.deepEqual([w.h.x,w.h.y],[5,5]);assert.equal(w.ally.hits,200); // Selector/command does not resolve effects.
});

test('generated explicit next observations close once then retain adjacent healing without bounce',()=>{
    const w=generated(),reasons=[];
    for(const pos of [[5,5],[6,4],[6,4],[6,4]]){
        [w.h.x,w.h.y]=pos;const plan=select(w);reasons.push(plan.reason);
        assert.equal(healing(w).action.method,pos[0]===5?'rangedHeal':'heal');
        assert.equal(w.ally.hits,200); // No heal or movement simulation.
    }
    assert.deepEqual(reasons,['healer-useful-close',...Array(3).fill('injured-ally-in-range')]);
});

test('blocked, reserved, unknown, wall and swamp cells retain hold across repeated observations',()=>{
    for(const block of ['occupancy','reserved',undefined,1,2]){
        const w=generated();
        if(block==='occupancy')for(const y of [4,5,6])add(w,unit(`block${y}`,6,y,parts('move',1)));
        else if(block==='reserved')w.spacing.reserved=new Set(['6,4','6,5','6,6']);
        else w.spacing.terrainAt=()=>block;
        const snapshot=JSON.stringify(w.spacing.reserved?[...w.spacing.reserved]:null);
        const terrain=w.spacing.terrainAt;let n=0;w.spacing.terrainAt=p=>{n++;return terrain(p);};
        for(let tick=0;tick<3;tick++){n=0;assert.equal(select(w).reason,'injured-ally-in-range');assert(n<=8);}
        assert.equal(JSON.stringify(w.spacing.reserved?[...w.spacing.reserved]:null),snapshot);
    }
});

test('new ranged/melee exposure or existing pressure cannot buy more healing capacity',()=>{
    for(const type of ['ranged_attack','attack']){
        const w=generated();const e=add(w,unit('e',type==='attack'?7:9,type==='attack'?3:5,parts(type,1),{my:false}));
        if(type==='attack')w.spacing.terrainAt=p=>p.x===6&&p.y===4?0:1;
        assert(range(w.h,e)>(type==='attack'?1:3));assert.equal(select(w).reason,'injured-ally-in-range');
        for(let tick=0;tick<2;tick++)assert.equal(select(w).outcome,'hold');
    }
    const w=generated();add(w,unit('e',8,5,parts('ranged_attack',1),{my:false}));
    w.spacing.terrainAt=p=>p.x===6&&p.y===4?0:1; // No exposure-reducing retreat here.
    const old=baseline(w);assert.equal(old.outcome,'hold');
    assert.strictEqual(select(w,old,()=>{throw Error('pressure must gate closing first');}),old);
});

test('existing pressure retreat precedes closing without a second neighbour query',()=>{
    const w=generated();add(w,unit('e',2,2,parts('ranged_attack',1),{my:false}));
    const old=baseline(w);assert.equal(old.reason,'healer-pressure-retreat');
    assert.strictEqual(select(w,old,()=>{throw Error('retreat already owns the decision');}),old);
});

test('all current injured-ally bands and healthy armed support remain protected',()=>{
    for(const kind of ['adjacent','ranged','healthy-weapon']){
        const w=generated();add(w,unit('other',kind==='adjacent'?4:2,5,parts(kind==='healthy-weapon'?'attack':'move',1),
            {hits:kind==='healthy-weapon'?1200:1190}));
        assert.equal(healing(w).action.target.id,'a');assert.equal(select(w).outcome,'hold',kind);
    }
});

test('effective modifier, injury cap, functioning parts, self-heal and range3 bound the opportunity',()=>{
    for(const modifier of [1,0.75,0.5]){
        const w=generated();w.healModifier=modifier;w.ally.hits=1180;
        const p=select(w);assert.equal(p.reason,modifier===1?'injured-ally-in-range':'healer-useful-close');
        if(p.target)assert(capacity(w.h,w.ally,p.target,modifier)>capacity(w.h,w.ally,w.h,modifier));
    }
    for(const change of [w=>w.ally.x=8,w=>w.h.hits=1100,w=>w.h.fatigue=1,
        w=>w.h.body.filter(p=>p.type==='move').forEach(p=>p.hits=0),
        w=>w.h.body.filter(p=>p.type==='heal').forEach(p=>p.hits=0),w=>w.healModifier=undefined]){
        const w=generated();change(w);assert.notEqual(select(w).reason,'healer-useful-close');
    }
    const w=generated();w.h.body.filter(p=>p.type==='heal').slice(2).forEach(p=>p.hits=0);
    const p=select(w);assert.equal(capacity(w.h,w.ally,w.h),8);assert.equal(capacity(w.h,w.ally,p.target),24);
});

test('hybrids including destroyed nominal weapons and pre-existing owners are unchanged',()=>{
    for(const type of ['attack','ranged_attack'])for(const hits of [0,100]){
        const w=generated();w.h.body.push({type,hits});assert.notEqual(select(w).reason,'healer-useful-close');
    }
    for(const owner of ['escort','pair','capture','contest',undefined]){
        const w=generated();w.owner=owner;
        const owned={target:{x:3,y:3},engagement:null,outcome:'selected',reason:`${owner}-owner`,targetKind:'position'};
        assert.strictEqual(select(w,owned,()=>{throw Error('owner wins');}),owned);
        const ordinary=baseline(w);assert.strictEqual(select(w,ordinary),ordinary);
    }
});

test('moving targets and unsuccessful movement do not invent a capacity increase or retain stale intent',()=>{
    const w=generated();assert.equal(select(w).reason,'healer-useful-close');
    // Generated target moves away while healer stays: still ranged, no same-tick improvement.
    w.ally.x=8;assert.equal(select(w).outcome,'hold');assert.equal(capacity(w.h,w.ally,w.h),24);
    w.ally.x=7;for(const result of [-11,undefined,0]){
        w.h.moveTo=()=>result;
        for(let tick=0;tick<3;tick++){
            const p=select(w);assert.equal(w.h.moveTo(p.target),result);
            assert.equal(capacity(w.h,w.ally,w.h),24);assert.deepEqual([w.h.x,w.h.y],[5,5]);
        }
    }
    w.ally.hits=1200;assert.notEqual(select(w).reason,'healer-useful-close');
});

test('bounded evaluator is reused, deterministic under names/order and immutable',()=>{
    for(const reverse of [false,true]){
        const w=generated();w.h.id='renamed-h';w.ally.id='renamed-a';if(reverse){w.friends.reverse();w.spacing.creeps.reverse();}
        const before=JSON.stringify(w);let n=0;w.spacing.terrainAt=()=>{n++;return 0;};
        assert.deepEqual(select(w).target,{x:6,y:4});assert(n<=8);assert.equal(JSON.stringify(w),before);
    }
    for(const change of [w=>w.friends.push(...Array(14).fill(w.h)),w=>w.h.body.push(...parts('move',50)),
        w=>w.spacing.creeps.pop(),w=>w.h.x=NaN,w=>w.h.body[0].hits=NaN,
        w=>w.ally.my=false,w=>w.h.getRangeTo=null]){
        const w=generated();change(w);const old={outcome:'hold',reason:'injured-ally-in-range'};
        assert.strictEqual(improveHealerHold({creep:w.h,friends:w.friends,enemies:w.enemies,spacing:w.spacing,
            baseline:old,owner:w.owner,healModifier:w.healModifier},findExistingNeighbour),old);
    }
});

function recordedWorld(sample){
    const all=sample.state.creeps.map(c=>{
        const original=recorded.initialParts.find(p=>p.id===c.id).parts;
        const body=Object.entries(original).flatMap(([type,n])=>Array.from({length:n},(_,i)=>({type,hits:i<(c.activeBodyParts[type]??0)?100:0})));
        return unit(c.id,c.x,c.y,body,{...c});
    });
    return {h:all.find(c=>c.id===sample.id),ally:all.find(c=>c.id===sample.target.id),friends:all.filter(c=>c.my),enemies:all.filter(c=>!c.my),
        flag:sample.state.flags[0],owner:'ordinary',healModifier:1,spacing:{creeps:all,terrainAt:()=>undefined}};
}

test('only three retained holds: preserve recorded actions; no historical legal step claimed with unknown terrain',()=>{
    assert.deepEqual(recorded.samples.map(s=>[s.tick,s.id]),[[76,'pg_player2_healer_3'],[77,'pg_player2_healer_1'],[80,'pg_player2_healer_3']]);
    for(const sample of recorded.samples){
        const w=recordedWorld(sample);assert.equal(baseline(w).reason,'injured-ally-in-range');
        assert.equal(healing(w).action.target.id,sample.target.id);assert.equal(healing(w).action.method,'rangedHeal');
        assert.equal(capacity(w.h,w.ally,w.h),24);assert.equal(select(w).outcome,'hold');
        assert.equal(sample.healing.find(x=>x.type==='action-attempt').returnCode,0);
    }
});

test('generated plain variants of the three snapshots do not override pressure; tick80 only has a conditional opportunity',()=>{
    for(const sample of recorded.samples){
        const w=recordedWorld(sample);w.spacing.terrainAt=()=>0; // GENERATED assumption; NOT recovered map data.
        const p=select(w);assert.equal(p.reason,sample.tick===80?'healer-useful-close':'injured-ally-in-range');
        if(sample.tick===80){assert.deepEqual(p.target,{x:49,y:51});assert.equal(capacity(w.h,w.ally,p.target),72);}
    }
});

function convergence(){
    const w=generated();Object.assign(w.h,{x:5,y:4});
    const second=add(w,unit('h2',5,6,[...parts('heal',6),...parts('move',6)]));
    // Same single target-adjacent free option; standing cells are plain too.
    const plain=[{x:5,y:4},{x:5,y:6},{x:7,y:5},{x:6,y:5}];
    w.spacing.terrainAt=p=>plain.some(c=>range(p,c)===0)?0:1;
    return {...w,second};
}

test('no new reservations: independent closing plans may converge without determining an engine outcome',()=>{
    const w=convergence(),second=w.second;
    const one=select(w);const two=select({...w,h:second});
    assert.deepEqual(one.target,{x:6,y:5});assert.deepEqual(two.target,one.target);
    assert.equal(w.spacing.reserved,undefined);assert.deepEqual(w.h.calls,[]);assert.deepEqual(second.calls,[]);
});

test('unique-cell mirrored world-edge choices stay bounded; only functioning enemy weapons exclude',()=>{
    for(const mirrored of [false,true]){
        const w=generated();Object.assign(w.h,{x:mirrored?98:1,y:0});Object.assign(w.ally,{x:mirrored?96:3,y:0});
        const expected={x:mirrored?97:2,y:0};let n=0;
        w.spacing.terrainAt=p=>{n++;assert(p.x>=0&&p.y>=0&&p.x<100&&p.y<100);return range(p,expected)===0?0:1;};
        assert.deepEqual(select(w).target,expected);assert(n<=8);
    }
    const w=generated();add(w,unit('e',9,5,[{type:'ranged_attack',hits:0}],{my:false}));
    assert.equal(select(w).reason,'healer-useful-close');w.enemies[0].body[0].hits=100;
    assert.equal(select(w).reason,'injured-ally-in-range');
});

function healingObservation(w){
    return [w.h,w.second].map(h=>{
        const decision=selectHealingDecision(h,w.friends.filter(c=>c.hits<c.hitsMax));
        const action=decision.action;
        return {id:h.id,position:[h.x,h.y],method:action?.method??null,target:action?.target.id??null,
            range:action?range(h,action.target):null,potential:action?capacity(h,action.target,h):0,
            threats:w.enemies.filter(e=>e.hits>0&&e.body.some(p=>p.hits>0&&
                (p.type==='attack'&&range(h,e)<=1||p.type==='ranged_attack'&&range(h,e)<=3))).map(e=>e.id)};
    });
}

function failedClosing(w){
    const initial=[w.h,w.second].map(h=>({id:h.id,x:h.x,y:h.y}));
    for(const h of [w.h,w.second]){
        const plan=select({...w,h});assert.deepEqual(plan.target,{x:6,y:5});
        assert.equal(h.moveTo(plan.target),0); // Mock schedules only. It never moves either actor.
    }
    assert.deepEqual([w.h,w.second].map(h=>({id:h.id,x:h.x,y:h.y})),initial);
}

for(const outcome of ['A','B','neither'])test(`generated convergence outcome ${outcome}: distinct cells, healing/support preserved over repeated observations`,t=>{
    // These are the ONLY three supplied outcome types, not an arbitration algorithm.
    for(const injuredHealers of [false,true]){
        const w=convergence(),control=convergence();
        if(injuredHealers)for(const c of [w.h,w.second,control.h,control.second])c.hits=1193;
        const initial=w.friends.map(c=>({id:c.id,x:c.x,y:c.y,hits:c.hits,hitsMax:c.hitsMax,
            armed:c.body.some(p=>p.hits>0&&['attack','ranged_attack'].includes(p.type))}));
        const before=healingObservation(w);assert.deepEqual(before,healingObservation(control));
        assert.deepEqual(before.map(r=>[r.method,r.potential]),[['rangedHeal',24],['rangedHeal',24]]);
        failedClosing(w);
        // Current-tick tactics use ORIGINAL positions despite both accepted mock movement calls.
        executeTactics([w.h,w.second],[],w.friends.filter(c=>c.hits<c.hitsMax));
        for(const h of [w.h,w.second]){
            assert.deepEqual(h.calls.map(c=>c.method),['moveTo','rangedHeal']);
            assert.equal(h.calls[1].id,w.ally.id);
        }
        // Explicit next-observation inputs, independent of return codes. Never co-locate.
        if(outcome==='A')Object.assign(w.h,{x:6,y:5});
        if(outcome==='B')Object.assign(w.second,{x:6,y:5});
        const next=healingObservation(w),expected=outcome==='A'?[72,24]:outcome==='B'?[24,72]:[24,24];
        assert.deepEqual(next.map(r=>r.potential),expected);
        assert.deepEqual(next.map(r=>r.method),expected.map(n=>n===72?'heal':'rangedHeal'));
        assert(next.every(r=>r.target===w.ally.id&&r.threats.length===0));
        assert.equal(Math.min(w.ally.hitsMax-w.ally.hits,next.reduce((n,r)=>n+r.potential,0)),outcome==='neither'?48:96);
        assert.equal(healingObservation(control).reduce((n,r)=>n+r.potential,0),48);
        const positions=w.friends.map(c=>[c.x,c.y]);
        const proposals=[];
        for(let observation=0;observation<5;observation++){
            for(const h of [w.h,w.second])h.calls=[];
            assert.equal(new Set(w.friends.map(c=>`${c.x},${c.y}`)).size,w.friends.length);
            for(const h of [w.h,w.second]){
                const old=initial.find(c=>c.id===h.id);
                for(const ally of initial.filter(c=>c.id!==h.id)){
                    const now=w.friends.find(c=>c.id===ally.id);
                    if(ally.hits<ally.hitsMax&&range(old,ally)<=3)
                        assert(range(h,now)<=(range(old,ally)<=1?1:3),'preserve every injured band');
                    if(ally.armed&&range(old,ally)<=3)assert(range(h,now)<=3,'preserve armed support');
                }
                let reads=0;const terrain=w.spacing.terrainAt;w.spacing.terrainAt=p=>{reads++;return terrain(p);};
                const plan=select({...w,h});w.spacing.terrainAt=terrain;assert(reads<=8);
                const ordinary=baseline({...w,h});assert.equal(ordinary.outcome,'hold');
                assert.equal(plan.reason,outcome==='neither'?'healer-useful-close':'injured-ally-in-range');
                proposals.push(plan.reason);
                if(plan.target){assert.deepEqual(plan.target,{x:6,y:5});h.moveTo(plan.target);}
            }
            assert.deepEqual(w.friends.map(c=>[c.x,c.y]),positions); // No inferred movement resolution.
            assert.deepEqual(healingObservation(w),next);
            executeTactics([w.h,w.second],[],w.friends.filter(c=>c.hits<c.hitsMax));
            assert.deepEqual([w.h,w.second].map(h=>h.calls.map(c=>c.method)),
                next.map(r=>outcome==='neither'?['moveTo',r.method]:[r.method]));
            assert.equal(w.ally.hits,200); // Potential only: no resolved healing simulated.
        }
        assert.equal(w.spacing.reserved,undefined);
        t.diagnostic(JSON.stringify({outcome,injuredHealers,currentTick:before,nextObservation:next,
            baselineTeamPotential:48,nextTeamPotential:expected.reduce((a,b)=>a+b,0),subsequentProposalCount:proposals.filter(r=>r==='healer-useful-close').length,
            subsequentObservations:5,allCellsDistinct:true,injuredBandsAndArmedSupportPreserved:true,damageOrHealingResolved:false}));
    }
});

test('after neither moves, actual pressure retreat for either healer preempts closing without stale waiting state',()=>{
    for(const which of ['A','B']){
        const w=convergence();failedClosing(w);
        const h=which==='A'?w.h:w.second;
        const enemy=add(w,unit('urgent',6,which==='A'?3:7,[...parts('attack',1),...parts('move',1)],{my:false}));
        const terrain=w.spacing.terrainAt;w.spacing.terrainAt=p=>range(p,enemy)===0?0:terrain(p);
        const urgent=baseline({...w,h});assert.equal(urgent.reason,'healer-pressure-retreat');
        assert.deepEqual(urgent.target,{x:6,y:5});
        assert.strictEqual(select({...w,h},urgent,()=>{throw Error('urgent movement already wins');}),urgent);
        for(const c of w.friends)c.calls=[];
        moveCreeps(w.friends,w.enemies,w.flag,new Map(),new Map(),null,null,null,false,null,w.spacing);
        assert.deepEqual(h.calls,[{method:'moveTo',id:null,x:6,y:5}]);
        executeTactics([w.h,w.second],w.enemies,[w.ally]);
        assert.equal(h.calls.at(-1).method,'rangedHeal');assert.equal(h.calls.at(-1).id,w.ally.id);
        assert.deepEqual([h.x,h.y],which==='A'?[5,4]:[5,6]);assert.equal(w.spacing.reserved,undefined);
    }
});

test('failed closing does not override later owners; an actually eligible escort plans and executes normally',()=>{
    const w=convergence();const melee=add(w,unit('guard',8,5,[...parts('attack',8),...parts('move',8)],{hits:1600,hitsMax:1600}));
    const terrain=w.spacing.terrainAt;w.spacing.terrainAt=p=>p.y===5&&[8,10].includes(p.x)?0:terrain(p);
    failedClosing(w);
    // Fresh generated observation: the target's injury has resolved, without our mock healing simulating it.
    w.ally.hits=w.ally.hitsMax;w.flag.my=true;
    add(w,unit('remote-enemy',10,5,[...parts('attack',1),...parts('move',1)],{my:false}));
    const result=planHealerEscort({tick:2,myCreeps:w.friends,enemies:w.enemies},w.flag);
    assert.equal(result.transition.event,'assign');assert.equal(result.escort.healerId,w.h.id);
    assert.equal(result.escort.allyId,melee.id);assert.equal(result.escort.mode,'move-attempt');
    for(const owner of ['escort','pair','capture','contest']){
        const owned={target:melee,engagement:null,outcome:'selected',reason:`${owner}-owner`,targetKind:'creep'};
        assert.strictEqual(select({...w,owner},owned,()=>{throw Error('owner must win');}),owned);
    }
    for(const c of w.friends)c.calls=[];
    moveCreeps(w.friends,w.enemies,w.flag,new Map(),new Map(),result.escort,null,null,false,null,w.spacing);
    assert.deepEqual(w.h.calls,[{method:'moveTo',id:'guard',x:8,y:5}]);
    assert.equal(healing(w).action,null); // No injury: same no-action as baseline, not lost healing.
});

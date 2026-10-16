import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMovementPlan,localRetreatStep} from '../../src/tactics/movement.js';
import {executeTactics,moveCreeps} from '../../src/arena/execute.js';
import {selectHealingDecision} from '../../src/tactics/healing.js';
import {improveRangedHold} from '../fixtures/precontact-ranged-kiting-candidate.js';
import {range,unit,world,add} from '../fixtures/ranged-generated-world.js';
const baseline=(w,c=w.r)=>selectMovementPlan(c,w.enemies,w.flag,null,w.friends,false,w.spacing);
function select(w,old=baseline(w),find=localRetreatStep){
    assert.equal(new Set(w.spacing.creeps.map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length,'distinct observed cells');
    return improveRangedHold({creep:w.r,friends:w.friends,enemies:w.enemies,spacing:w.spacing,
        baseline:old,owner:w.owner},find);
}
function tactics(w){
    for(const c of w.friends)c.calls=[];
    executeTactics(w.friends,w.enemies,w.friends.filter(c=>c.hits<c.hitsMax));
    return w.friends.map(c=>({id:c.id,calls:c.calls.map(a=>({...a}))}));
}
function request(w,p){
    if(p.reason!=='precontact-ranged-kite')return null;
    const dx=p.target.x-w.r.x,dy=p.target.y-w.r.y;assert.equal(Math.max(Math.abs(dx),Math.abs(dy)),1);
    return w.r.move([[8,1,2],[7,0,3],[6,5,4]][dy+1][dx+1]);
}
const band=(r,h)=>range(r,h)<=1?1:range(r,h)<=3?3:null;

test('generated approaching enemies: observed separation, unchanged current attacks/healing, bounded work',t=>{
    const w=world(),trace=[];
    for(const [r,e,h] of [[[10,10],[8,10],[10,12]],[[11,9],[9,10],[10,12]],[[12,9],[10,10],[10,12]]]){
        [w.r.x,w.r.y]=r;[w.e.x,w.e.y]=e;[w.h.x,w.h.y]=h;
        const old=baseline(w),expected=tactics(w);assert.equal(old.reason,'combat-in-range');
        let reads=0;w.spacing.terrainAt=()=>{reads++;return 0;};
        const p=select(w,old);assert.equal(p.reason,'precontact-ranged-kite');assert(reads<=8);
        assert(range(p.target,w.e)>2);assert(range(p.target,w.e)<=3);assert(range(p.target,w.h)<=3);
        assert.equal(request(w,p),0);assert.deepEqual([w.r.x,w.r.y],r);
        assert.deepEqual(tactics(w),expected);assert.equal(w.r.calls[0].method,'rangedAttack');
        assert.equal(w.h.calls[0].method,'rangedHeal');
        trace.push({from:r,enemy:e,healer:h,baseline:old.reason,requested:p.target,currentHealBand:band(w.r,w.h),reads});
    }
    Object.assign(w.r,{x:13,y:9});Object.assign(w.e,{x:11,y:10});
    assert.equal(select(w).outcome,'hold'); // Continuing would lose the stationary healer's range3.
    t.diagnostic(JSON.stringify({generatedInputs:true,trace,thenSupportLimitedHold:true,noDamageOrArbitrationSimulated:true}));
});

test('static enemy: one supplied retreat then stable range-three standoff, versus baseline holding at two',()=>{
    const w=world(),control=world(),reasons=[];
    for(const pos of [[10,10],[11,9],[11,9],[11,9]]){
        [w.r.x,w.r.y]=pos;const p=select(w);reasons.push(p.reason);
        assert.equal(baseline(control).reason,'combat-in-range');assert.equal(range(control.r,control.e),2);
        if(p.target)assert.deepEqual(p.target,{x:11,y:9});assert(range(w.r,w.h)<=3);
        assert.deepEqual(tactics(w).map(c=>c.calls.map(a=>a.method)),[['rangedAttack'],['rangedHeal']]);
    }
    assert.deepEqual(reasons,['precontact-ranged-kite',...Array(3).fill('combat-in-range')]);
});

test('occupied/reserved, wall/swamp/unknown exits retain hold across repeated observations',()=>{
    for(const block of ['occupied','reserved',1,2,undefined]){
        const w=world();
        if(block==='occupied')for(const y of [9,10,11])add(w,unit(`b${y}`,11,y,['move']));
        else if(block==='reserved')w.spacing.reserved=new Set(['11,9','11,10','11,11']);
        else w.spacing.terrainAt=()=>block;
        for(let tick=0;tick<3;tick++){const old=baseline(w);assert.strictEqual(select(w,old),old);}
    }
});

test('all functioning melee and newly entered ranged envelopes gate destinations',()=>{
    const w=world();add(w,unit('second',12,10,['attack','move'],{my:false}));
    assert.equal(select(w).outcome,'hold'); // No neighbour is beyond two of both.
    const a=world();a.spacing.terrainAt=p=>p.x===11&&p.y===9?0:1;
    const danger=add(a,unit('ranged',14,9,['ranged_attack','move'],{my:false}));
    assert.equal(range(a.r,danger),4);assert.equal(select(a).outcome,'hold');
    danger.body[0].hits=0;assert.equal(select(a).reason,'precontact-ranged-kite');
    const b=world();b.e.body[0].hits=0;assert.equal(select(b).outcome,'hold');
});

test('each current functioning healer band is retained; unavailable support is not invented',()=>{
    for(const hx of [9,7]){
        const w=world();Object.assign(w.h,{x:hx,y:10});const old=baseline(w);
        assert.strictEqual(select(w,old),old); // Adjacent1 or ranged3 would be lost.
        w.h.body[0].hits=0;assert.equal(select(w).reason,'precontact-ranged-kite');
    }
    const w=world();add(w,unit('another',7,10,['heal','move']));assert.equal(select(w).outcome,'hold');
    w.h.fatigue=1;assert.equal(select(w).outcome,'hold'); // Fatigued HEAL still counts as access.
});

test('support loss changes the new observation, never retroactively establishes retained healing',()=>{
    const w=world();assert.equal(select(w).reason,'precontact-ranged-kite');
    w.h.body[0].hits=0;assert.equal(selectHealingDecision(w.h,[w.r]).action,null);
    assert.equal(select(w).reason,'precontact-ranged-kite'); // Explicitly no minimum-healer gate in this proposal.
    assert.deepEqual(tactics(w).map(c=>c.calls.map(a=>a.method)),[['rangedAttack'],[]]);
});

test('competing destinations: existing caller reservation excludes a second proposal even after rejected/unknown calls',()=>{
    for(const result of [-11,undefined,0]){
        const w=world(),second=add(w,unit('r2',10,12,['ranged_attack','move']));
        // Relocate healer to keep distinct occupancy and range-three access.
        Object.assign(w.h,{x:12,y:11});w.spacing.terrainAt=p=>p.x===11&&p.y===11?0:1;
        w.r.moveResult=result;const p=select(w);assert.deepEqual(p.target,{x:11,y:11});
        w.spacing.reserved.add('11,11');assert.equal(request(w,p),result);
        const old=baseline(w,second);assert.strictEqual(select({...w,r:second},old),old);
        assert.deepEqual([w.r.x,w.r.y],[10,10]);assert.deepEqual([second.x,second.y],[10,12]);
    }
});

test('rejected, unknown and accepted-without-displacement calls never count as progress or change current tactics',()=>{
    for(const result of [-11,undefined,0]){
        const w=world();w.r.moveResult=result;const expected=tactics(w);
        for(let tick=0;tick<4;tick++){
            w.r.calls=[];const p=select(w);assert.deepEqual(p.target,{x:11,y:9});
            assert.equal(request(w,p),result);assert.equal(w.r.calls.length,1);
            assert.deepEqual([w.r.x,w.r.y],[10,10]);assert.deepEqual(tactics(w),expected);
        }
    }
});

test('fatigue, lost RANGED/MOVE, nominal hybrids and malformed observations preserve baseline',()=>{
    const changes=[w=>w.r.fatigue=1,w=>w.r.body[0].hits=0,w=>w.r.body[1].hits=0,
        ...['attack','heal'].flatMap(type=>[0,100].map(hits=>w=>w.r.body.push({type,hits}))),
        w=>w.spacing.creeps.pop(),w=>w.e.body.push(null),w=>w.r.x=NaN,w=>w.r.exists=undefined,
        w=>w.friends.push(...Array(14).fill(w.h)),w=>w.r.body.push(...Array(50).fill({type:'move',hits:100}))];
    for(const change of changes){
        const w=world(),old=baseline(w);change(w);
        // Avoid calling ordinary selectors on deliberately unsupported body data.
        assert.strictEqual(improveRangedHold({creep:w.r,friends:w.friends,enemies:w.enemies,spacing:w.spacing,
            baseline:old,owner:w.owner},()=>{throw Error('guard must precede evaluation');}),old);
    }
});

test('existing adjacency retreat, approach and non-ordinary ownership are never substituted',()=>{
    const w=world();w.e.x=9;let old=baseline(w);assert.equal(old.reason,'ranged-melee-retreat');
    assert.strictEqual(select(w,old,()=>{throw Error('adjacent retreat wins');}),old);
    w.spacing.terrainAt=()=>undefined;old=baseline(w);assert.equal(old.reason,'combat-in-range');
    assert.strictEqual(select(w,old,()=>{throw Error('blocked adjacency remains baseline');}),old);
    w.e.x=6;old=baseline(w);assert.equal(old.reason,'combat-approach');assert.strictEqual(select(w,old),old);
    for(const owner of ['escort','pair','capture','contest',undefined]){
        const a=world(),hold=baseline(a);a.owner=owner;
        assert.strictEqual(select(a,hold,()=>{throw Error('owner bypass');}),hold);
    }
    const a=world();moveCreeps(a.friends,a.enemies,a.flag,new Map(),new Map(),
        {healerId:a.r.id,mode:'hold'},null,null,false,null,a.spacing);assert.equal(a.r.calls.length,0);
    moveCreeps(a.friends,a.enemies,a.flag,new Map(),new Map(),null,null,null,false,
        {context:{leaderId:a.r.id},moves:new Map([[a.r.id,{target:null,reason:'pair-hold'}]])},a.spacing);
    assert.equal(a.r.calls.length,0);
});

test('generated enemy retreat/reapproach produces a real candidate approach/retreat cycle, retained as adverse',t=>{
    const w=world(),control=world();Object.assign(w.h,{x:11,y:12});Object.assign(control.h,{x:11,y:12});
    const observations=[{r:[10,10],e:[8,10]},{r:[11,9],e:[7,10]},
        {r:[10,10],e:[8,10]},{r:[11,9],e:[7,10]}];
    const trace=[];
    for(const o of observations){
        [w.r.x,w.r.y]=o.r;[w.e.x,w.e.y]=o.e;
        [control.e.x,control.e.y]=o.e;
        const old=baseline(w),p=select(w,old),controlPlan=baseline(control);
        const attacks=tactics(w).find(c=>c.id==='r').calls.map(c=>c.method);
        assert.deepEqual(attacks,range(w.r,w.e)<=3?['rangedAttack']:[]);
        assert.equal(controlPlan.reason,'combat-in-range');
        assert.deepEqual(tactics(control).find(c=>c.id==='r').calls.map(c=>c.method),['rangedAttack']);
        trace.push({r:o.r,e:o.e,baseline:old.reason,candidate:p.reason,
            target:p.target?{x:p.target.x,y:p.target.y}:null,candidateAttack:attacks.length===1,
            heldBaselineAttack:true});
    }
    assert.deepEqual(trace.map(x=>x.candidate),['precontact-ranged-kite','combat-approach','precontact-ranged-kite','combat-approach']);
    assert.deepEqual(trace.map(x=>x.baseline),['combat-in-range','combat-approach','combat-in-range','combat-approach']);
    assert.deepEqual(trace.map(x=>x.candidateAttack),[true,false,true,false]);
    t.diagnostic(JSON.stringify({adverse:'supplied A-B-A positions; no persistent state prevents repetition',trace}));
});

for(const outcome of ['ranged-only','healer-only','both','neither'])test(`generated moving healer partial outcome ${outcome}: compare support with baseline`,t=>{
    const w=world();Object.assign(w.h,{x:10,y:11});
    // Only east is an eligible ranged exit. The healer's separate approach
    // corridor is plain; all current occupied cells are plain as well.
    w.spacing.terrainAt=p=>p.x===11&&p.y===10||p.x===10&&p.y>=10&&p.y<=16||p.x===8&&p.y===10?0:1;
    add(w,unit('remote-injury',10,16,['move'],{hits:20}));
    const old=baseline(w),p=select(w,old),hp=baseline(w,w.h);
    assert.deepEqual(p.target,{x:11,y:10});assert.equal(hp.reason,'injured-ally-approach');
    assert.equal(hp.target.id,'remote-injury');assert.equal(band(w.r,w.h),1);assert.equal(band(p.target,w.h),1);
    const current=selectHealingDecision(w.h,w.friends.filter(c=>c.hits<c.hitsMax));
    assert.equal(current.action.method,'heal');assert.equal(current.action.target,w.r);
    request(w,p);w.h.moveTo(hp.target);const expected=tactics(w);
    assert.equal(expected.find(c=>c.id==='h').calls[0].method,'heal');
    // Four explicit input outcomes, NOT an arbitration implementation. No co-location.
    if(['ranged-only','both'].includes(outcome))Object.assign(w.r,{x:11,y:10});
    if(['healer-only','both'].includes(outcome))Object.assign(w.h,{x:10,y:12});
    const nextBand=band(w.r,w.h),baselineBand=band({x:10,y:10},w.h);
    assert.equal(nextBand,['healer-only','both'].includes(outcome)?3:1);
    assert.equal(nextBand,baselineBand); // This particular loss also follows baseline holding.
    const next=selectHealingDecision(w.h,w.friends.filter(c=>c.hits<c.hitsMax));
    assert.equal(next.action.method,nextBand===1?'heal':'rangedHeal');
    const subsequent=select(w);assert.equal(subsequent.reason,
        ['ranged-only','both'].includes(outcome)?'combat-in-range':'precontact-ranged-kite');
    assert.equal(new Set(w.spacing.creeps.map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length);
    t.diagnostic(JSON.stringify({outcome,requested:p.target,healerGoal:hp.target.id,currentBand:1,nextBand,baselineBand,
        currentMethod:'heal',nextMethod:next.action.method,adverse:nextBand!==1,generatedInputs:true}));
});

test('moving-healer adverse outcome: candidate alone loses range-three access that baseline retains',t=>{
    const w=world();Object.assign(w.h,{x:8,y:13});
    const plain=new Set(['10,10','8,10','8,13','11,10','7,13','6,14','5,15','4,16']);
    w.spacing.terrainAt=p=>plain.has(`${p.x},${p.y}`)?0:1;
    const injury=add(w,unit('remote-injury',4,16,['move'],{hits:20}));
    const p=select(w);assert.deepEqual(p.target,{x:11,y:10});
    const hp=baseline(w,w.h);assert.equal(hp.reason,'injured-ally-approach');assert.equal(hp.target.id,'remote-injury');
    assert.equal(band(w.r,w.h),3);assert.equal(band(p.target,w.h),3);
    assert.equal(selectHealingDecision(w.h,w.friends.filter(c=>c.hits<c.hitsMax)).action.target,w.r);
    // Supplied plain/unoccupied neighbouring step reduces healer-to-injury
    // range4 to3. This is not a prediction of moveTo's chosen path.
    assert.equal(range(w.h,injury),4);assert.equal(w.spacing.terrainAt({x:7,y:13}),0);
    assert(!w.spacing.creeps.some(c=>c.x===7&&c.y===13));
    Object.assign(w.r,{x:11,y:10});Object.assign(w.h,{x:7,y:13});
    assert.equal(range(w.h,injury),3);
    assert.equal(range(w.r,w.h),4);assert.equal(range({x:10,y:10},w.h),3);
    assert.equal(selectHealingDecision(w.h,[w.r]).action,null);
    const control=unit('control',10,10,['ranged_attack','move'],{hits:40});
    assert.equal(selectHealingDecision(w.h,[control]).action.method,'rangedHeal');
    assert.equal(selectHealingDecision(w.h,[w.r,injury]).action.target,injury);
    assert.equal(selectHealingDecision(w.h,[control,injury]).action.target,control);
    t.diagnostic(JSON.stringify({adverse:true,current:{r:[10,10],h:[8,13],band:3},requested:p.target,
        suppliedNext:{r:[11,10],h:[7,13],band:null},baselineNext:{r:[10,10],h:[7,13],band:3},
        limitation:'Healer moveTo path not validated; this is an admissible generated displacement, not guaranteed Arena routing.'}));
});

test('partially damaged but functioning parts remain eligible and current adjacent healing is not downgraded',()=>{
    const w=world();w.r.body[0].hits=1;w.r.body[1].hits=1;w.h.body[0].hits=1;
    Object.assign(w.h,{x:10,y:11});w.spacing.terrainAt=p=>p.x===11&&p.y===10?0:1;
    const p=select(w);assert.equal(p.reason,'precontact-ranged-kite');assert.equal(band(p.target,w.h),1);
    assert.equal(selectHealingDecision(w.h,[w.r]).action.method,'heal');
    w.h.hits=0;assert.equal(select(w).reason,'precontact-ranged-kite');
    assert.equal(selectHealingDecision(w.h,[w.r]).action,null);
});

test('input order, IDs and unique mirrored exits preserve geometry; observations are not mutated',()=>{
    for(const reverse of [false,true]){
        const w=world();w.r.id='renamed';w.e.id='other';if(reverse){w.friends.reverse();w.enemies.reverse();w.spacing.creeps.reverse();}
        const before=JSON.stringify(w),p=select(w);assert.deepEqual(p.target,{x:11,y:9});assert.equal(JSON.stringify(w),before);
    }
    for(const mirror of [false,true]){
        const w=world();const project=x=>mirror?99-x:x;
        for(const c of w.spacing.creeps)c.x=project(c.x);
        const goal={x:project(11),y:10};let reads=0;w.spacing.terrainAt=p=>{reads++;return range(p,goal)===0?0:1;};
        assert.deepEqual(select(w).target,goal);assert(reads<=8);
    }
});

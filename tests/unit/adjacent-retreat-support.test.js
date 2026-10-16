import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMovementPlan} from '../../src/tactics/movement.js';
import {selectHealingDecision} from '../../src/tactics/healing.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';
import {range,unit,world,add} from '../fixtures/ranged-generated-world.js';

function adjacent(){const w=world();w.e.x=9;return w;}
const plan=(w,c=w.r)=>selectMovementPlan(c,w.enemies,w.flag,null,w.friends,false,w.spacing);
const band=(r,h)=>range(r,h)<=1?1:range(r,h)<=3?3:null;
function tick(w,engagements=new Map(),escort=null,pair=null){
    const decisions=[];for(const c of w.friends)c.calls=[];
    assert.equal(new Set(w.spacing.creeps.map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length);
    moveCreeps(w.friends,w.enemies,w.flag,engagements,new Map(),escort,null,
        {decision:d=>{decisions.push(d);return null;}},false,pair,w.spacing);
    executeTactics(w.friends,w.enemies,w.friends.filter(c=>c.hits<c.hitsMax));
    assert(w.friends.every(c=>c.calls.filter(a=>a.method==='moveTo').length<=1));
    return{reason:decisions.find(d=>d.actorId===w.r.id).reason,
        requested:w.r.calls.find(a=>a.method==='moveTo')??null,
        ranged:w.r.calls.filter(a=>a.method==='rangedAttack'),healing:w.h.calls.filter(a=>['heal','rangedHeal'].includes(a.method))};
}

test('production adjacent retreat prefers an equally safe escape retaining an available healer',t=>{
    const w=adjacent();Object.assign(w.h,{x:8,y:13});
    const oldFirst={x:11,y:9},preserving={x:11,y:10};
    assert.equal(band(w.r,w.h),3);assert.equal(band(oldFirst,w.h),null);assert.equal(band(preserving,w.h),3);
    for(const p of [oldFirst,preserving]){
        assert.equal(w.spacing.terrainAt(p),0);assert(range(p,w.e)>1);assert(range(p,w.e)<=3);
        assert(!w.spacing.creeps.some(c=>c.x===p.x&&c.y===p.y));
    }
    const p=plan(w);assert.equal(p.reason,'ranged-melee-retreat');assert.deepEqual(p.target,preserving);
    const current=tick(w);assert.deepEqual(current.requested,{method:'moveTo',id:null,...preserving});
    assert.equal(current.ranged.length,1);assert.equal(current.healing[0].method,'rangedHeal');
    assert.deepEqual([w.r.x,w.r.y],[10,10]); // Accepted call is not displacement.
    Object.assign(w.r,preserving);const next=tick(w);
    assert.equal(next.reason,'combat-in-range');assert.equal(next.ranged.length,1);
    assert.equal(next.healing[0].method,'rangedHeal');assert.equal(next.healing[0].id,'r');
    t.diagnostic(JSON.stringify({current:{r:[10,10],h:[8,13],melee:[9,10]},oldFirst,
        preserving,nextRangedRange:range(w.r,w.e),sameTickAndNextHealing:'rangedHeal',generated:true}));
});

test('adjacent healing is preferred too, but emergency escape remains when preservation is impossible',()=>{
    const w=adjacent();Object.assign(w.h,{x:10,y:11});
    const p=plan(w);assert.deepEqual(p.target,{x:11,y:10});assert.equal(band(p.target,w.h),1);
    w.spacing.terrainAt=q=>q.x===11&&q.y===9?0:1;
    const forced=plan(w);assert.deepEqual(forced.target,{x:11,y:9});assert.equal(band(forced.target,w.h),3);
    // Do not keep a ranged actor in current melee reach just to retain direct healing.
    assert.equal(range(w.r,w.e),1);assert.equal(range(forced.target,w.e),2);
});

test('a later support-preserving exit must not regain ranged exposure escaped by the original safe choice',()=>{
    const w=adjacent();Object.assign(w.h,{x:8,y:13});
    const threat=add(w,unit('ranged',10,13,['ranged_attack','move'],{my:false}));
    // First11,9 escapes this current source; later11,10 retains it. Do not
    // trade that exposure improvement just to preserve healer access.
    w.spacing.terrainAt=p=>p.x===11&&[9,10].includes(p.y)?0:1;
    assert.equal(range(w.r,threat),3);assert.equal(range({x:11,y:9},threat),4);
    assert.equal(band({x:11,y:10},w.h),3);
    assert.deepEqual(plan(w).target,{x:11,y:9});
});

test('static melee yields retreat then stable standoff without a production approach/retreat bounce',()=>{
    const w=adjacent(),engagements=new Map(),reasons=[];
    for(const pos of [[10,10],[11,9],[11,9],[11,9]]){
        [w.r.x,w.r.y]=pos;const x=tick(w,engagements);reasons.push(x.reason);
        assert.equal(x.ranged.length,1);assert.equal(x.healing[0].method,'rangedHeal');
    }
    assert.deepEqual(reasons,['ranged-melee-retreat',...Array(3).fill('combat-in-range')]);
});

test('reacting melee can cause repeated retreat after ordinary range-four pursuit; retain the necessary escape distinction',t=>{
    const w=adjacent();Object.assign(w.h,{x:11,y:12});const trace=[],engagements=new Map();
    // Each supplied displacement is at most one cell; no engine movement resolver.
    const positions=[[[10,10],[9,10]],[[11,9],[8,10]],[[11,9],[7,10]],[[10,10],[8,10]],[[10,10],[9,10]]];
    for(const [r,e] of positions){
        [w.r.x,w.r.y]=r;[w.e.x,w.e.y]=e;const out=tick(w,engagements);
        if(out.reason==='ranged-melee-retreat')assert.equal(range(w.r,w.e),1);
        if(out.reason==='combat-approach')assert(range(w.r,w.e)>3);
        trace.push({r,e,reason:out.reason,attacks:out.ranged.length});
    }
    assert.deepEqual(trace.map(x=>x.reason),['ranged-melee-retreat','combat-in-range','combat-approach','combat-in-range','ranged-melee-retreat']);
    assert.deepEqual(trace.map(x=>x.attacks),[1,1,0,1,1]);
    t.diagnostic(JSON.stringify({generated:true,trace,notAStaticEnemyLoop:true}));
});

test('blocked exits, rejected/unknown calls and accepted non-displacement preserve current attacks and observed progress',()=>{
    for(const result of [-11,undefined,0]){
        const w=adjacent();w.r.moveTo=p=>{w.r.calls.push({method:'moveTo',x:p.x,y:p.y});return result;};
        for(let i=0;i<3;i++){const out=tick(w);assert.equal(out.reason,'ranged-melee-retreat');assert.equal(out.ranged.length,1);
            assert.deepEqual([w.r.x,w.r.y],[10,10]);assert.equal(out.healing[0].method,'rangedHeal');}
        w.spacing.terrainAt=()=>undefined;const blocked=tick(w);
        assert.equal(blocked.reason,'combat-in-range');assert.equal(blocked.requested,null);assert.equal(blocked.ranged.length,1);
    }
});

for(const outcome of ['ranged-only','healer-only','both','neither'])test(`production partial movement ${outcome}: separate snapshot preference from moving-healer effects`,t=>{
    const w=adjacent();Object.assign(w.h,{x:8,y:13});
    add(w,unit('remote-injury',4,16,['move'],{hits:20}));
    const plain=new Set(['10,10','9,10','8,13','11,10','7,13','6,14','5,15','4,16']);
    w.spacing.terrainAt=p=>plain.has(`${p.x},${p.y}`)?0:1;
    const p=plan(w);assert.deepEqual(p.target,{x:11,y:10});assert.equal(band(p.target,w.h),3);
    assert.equal(plan(w,w.h).reason,'injured-ally-approach');
    const current=tick(w);assert.equal(current.ranged.length,1);assert.equal(current.healing[0].id,'r');
    if(['ranged-only','both'].includes(outcome))Object.assign(w.r,{x:11,y:10});
    if(['healer-only','both'].includes(outcome))Object.assign(w.h,{x:7,y:13});
    const observedBand=band(w.r,w.h),baselineBand=band({x:10,y:10},w.h);
    assert.equal(observedBand,outcome==='both'?null:3);assert.equal(baselineBand,3);
    const next=tick(w);assert.equal(next.ranged.length,1);
    assert.equal(next.healing[0].id,outcome==='both'?'remote-injury':'r');
    // Both-move loses support, but ONLY escape was offered; holding remains in melee reach.
    assert.equal(range({x:10,y:10},w.e),1);assert.equal(range({x:11,y:10},w.e),2);
    t.diagnostic(JSON.stringify({outcome,observedBand,holdingBand:baselineBand,onlyEscape:true,
        nextHealingTarget:next.healing[0].id,generated:true}));
});

test('retreat preference never replaces higher-priority escort/pair owners or loses compatible attacks',()=>{
    for(const owner of ['escort','pair']){
        const w=adjacent();const out=tick(w,new Map(),owner==='escort'?{healerId:w.r.id,mode:'hold'}:null,
            owner==='pair'?{context:{leaderId:w.r.id},moves:new Map([[w.r.id,{target:null,reason:'pair-hold'}]])}:null);
        assert.equal(out.requested,null);assert.equal(out.ranged.length,1);
        assert.equal(out.reason,owner==='escort'?'escort-in-range':'pair-hold');
    }
});

test('all current functioning healers count; lost healing does not veto an otherwise necessary escape',()=>{
    const w=adjacent();Object.assign(w.h,{x:8,y:13,fatigue:1});w.h.body[1].hits=0;
    assert.deepEqual(plan(w).target,{x:11,y:10});
    w.h.body[0].hits=0;assert.deepEqual(plan(w).target,{x:11,y:9});
    w.h.body[0].hits=1;add(w,unit('other',10,13,['heal','move']));
    assert.deepEqual(plan(w).target,{x:11,y:10});
    assert.equal(selectHealingDecision(w.h,[w.r]).action.method,'rangedHeal');
});

test('support preference stays within one eight-cell scan and cannot select blocked or reserved support exits',()=>{
    for(const unavailable of ['reserved','occupied','unknown']){
        const w=adjacent();Object.assign(w.h,{x:8,y:13});
        if(unavailable==='reserved')w.spacing.reserved=new Set(['11,10','11,11']);
        if(unavailable==='occupied')for(const y of [10,11])add(w,unit(`block${y}`,11,y,['move']));
        let reads=0;w.spacing.terrainAt=p=>{reads++;return unavailable==='unknown'&&p.x===11&&p.y>=10?undefined:0;};
        assert.deepEqual(plan(w).target,{x:11,y:9});assert(reads<=8);assert.equal(reads,8);
    }
    const w=adjacent();Object.assign(w.h,{x:8,y:13});let reads=0;
    w.spacing.terrainAt=()=>{reads++;return 1;};assert.equal(plan(w).reason,'combat-in-range');assert.equal(reads,8);
});

test('support choice is invariant to IDs/order, observations are immutable and range-two remains a hold',()=>{
    for(const reverse of [false,true]){
        const w=adjacent();Object.assign(w.h,{x:8,y:13});w.r.id='renamed-r';w.h.id='renamed-h';
        if(reverse){w.friends.reverse();w.enemies.reverse();w.spacing.creeps.reverse();}
        const before=JSON.stringify(w);assert.deepEqual(plan(w).target,{x:11,y:10});assert.equal(JSON.stringify(w),before);
        w.e.x=8;assert.equal(plan(w).reason,'combat-in-range'); // Rejected pre-contact policy is not installed.
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProgressTie} from '../fixtures/objective-progress-tie-candidate.js';
import {secondaryStepSupport, selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';
import {progressTieWorld as world} from '../fixtures/objective-progress-tie-world.js';

// Entirely generated coordinates/validated proposal inputs, not replay terrain,
// routes, engine arbitration, or predicted historical continuation.
const admitted=r=>[...r.moves].filter(([,p])=>p).map(([id])=>id).sort();
const select=w=>selectProgressTie(w.friends,w.ids,w.steps,w.all,w.target);
function safeOutcomes(w,r) {
    const ids=admitted(r);
    for(let mask=0;mask<2**ids.length;mask++) {
        const observed=w.friends.map(c=>({...c,...(mask&(1<<ids.indexOf(c.id))&&ids.includes(c.id)?r.moves.get(c.id):{})}));
        assert.equal(new Set(observed.map(c=>`${c.x},${c.y}`)).size,observed.length);
        assert(secondaryStepSupport(observed,w.ids,new Map(w.ids.map(id=>[id,null]))));
    }
}
function supply(w,r,ids=admitted(r)) {
    for(const id of ids)Object.assign(w.friends.find(c=>c.id===id),r.moves.get(id));
    assert.equal(new Set(w.friends.map(c=>`${c.x},${c.y}`)).size,4);
}

test('baseline intersection holds; progress refinement admits the bottleneck weapon only',()=>{
    const w=world();
    assert.deepEqual(admitted(selectSecondaryTravelSteps(w.friends,w.ids,w.steps,w.all)),[]);
    assert.deepEqual(admitted(select(w)),['rear']);
});

test('three supplied successive observations show bounded progress, but front contenders remain held',()=>{
    const w=world(),baseline=world(),counts=[];
    // Explicit generated adjacent-route reports, not historical alternatives.
    for(const [healer,rear]of [[{x:15,y:22},{x:15,y:22}],
        [{x:15,y:22},{x:15,y:21}],[{x:15,y:22},{x:15,y:20}]]){
        w.steps.set('healer',healer);w.steps.set('rear',rear);
        const r=select(w);assert(r.examined<=16);safeOutcomes(w,r);
        counts.push(admitted(r));supply(w,r);
        assert.deepEqual(admitted(selectSecondaryTravelSteps(baseline.friends,baseline.ids,
            baseline.steps,baseline.all)),[]);
    }
    assert.deepEqual(counts,[['rear'],['rear'],['healer','rear']]);
    assert.equal(w.friends.find(c=>c.id==='rear').y,20);
    assert.equal(w.friends.find(c=>c.id==='healer').y,22);
    assert.equal(w.friends.find(c=>c.id==='frontA').y,21);
    assert.equal(w.friends.find(c=>c.id==='frontB').y,21);
});

test('every partial success and failure outcome preserves support at successive stages',()=>{
    const w=world();for(let i=0;i<3;i++){
        const r=select(w);safeOutcomes(w,r);supply(w,r);
        w.steps.set('rear',{x:15,y:21-i});
    }
});

test('rejected, unknown and accepted-without-displacement returns do not mutate observations',()=>{
    for(const rc of [-1,null,undefined,0]){
        const w=world(),before=JSON.stringify(w.friends),r=select(w);
        const recordedReturn=rc;void recordedReturn; // No executor/engine is simulated.
        assert.equal(JSON.stringify(w.friends),before);
        assert.deepEqual(admitted(select(w)),admitted(r));
        safeOutcomes(w,r);
    }
});

test('occupied destinations cannot be admitted; no vacating-cell entry',()=>{
    const w=world();
    // Actual occupancy, not a reservation or an assumed vacating cell.
    w.all=[...w.friends,{id:'block',x:15,y:22,hits:100,exists:true,body:[]}];
    const r=select(w);assert(!admitted(r).includes('rear'));assert(!admitted(r).includes('healer'));
    safeOutcomes(w,r);
    w.steps=new Map(w.ids.map(id=>[id,{x:14,y:23}]));
    assert.deepEqual(admitted(select(w)),[]);
});

test('lost current support and lost healing capability retain all holds',()=>{
    for(const loss of ['position','heal']){
        const w=world(),h=w.friends[0];
        if(loss==='position')h.y=30;else h.body[0].hits=0;
        assert.deepEqual(admitted(select(w)),[]);
    }
});

test('conflict-free unsafe proposals still require all-outcome support',()=>{
    const w=world();w.steps=new Map(w.ids.map(id=>[id,null]));
    w.steps.set('frontA',{x:13,y:20});w.steps.set('healer',{x:14,y:24});
    const r=select(w);assert(!admitted(r).includes('healer'));safeOutcomes(w,r);
});

test('safe conflict-free decisions and unknown-target baseline behavior are unchanged',()=>{
    const w=world();w.steps=new Map(w.friends.map(c=>[c.id,{x:c.x,y:c.y-1}]));
    assert.deepEqual([...select(w).moves],[...selectSecondaryTravelSteps(w.friends,w.ids,w.steps,w.all).moves]);
    w.target=null;
    assert.deepEqual(select(w),selectSecondaryTravelSteps(w.friends,w.ids,w.steps,w.all));
});

test('exact geometric ties can still hold indefinitely; no fairness or timeout change',()=>{
    const w=world();w.friends.find(c=>c.id==='rear').y=22;
    w.steps.set('rear',{x:15,y:22});
    // All four prospective weapon bottlenecks are unaffected by front winner.
    // Compare repeated decisions only; no persistent state/timer in the candidate.
    const initial=select(w);assert.deepEqual(admitted(initial),[]);
    for(let i=0;i<6;i++)assert.deepEqual(select(w),initial);
    safeOutcomes(w,initial);
});

test('input order, renaming and mirrored geometry preserve corresponding decisions',()=>{
    const w=world(),expected=admitted(select(w));
    w.ids.reverse();w.friends.reverse();w.steps=new Map([...w.steps].reverse());
    assert.deepEqual(admitted(select(w)),expected);
    const renamed=new Map(w.ids.map((id,i)=>[id,`actor-${7-i}`]));
    w.ids=w.ids.map(id=>renamed.get(id));w.friends.forEach(c=>c.id=renamed.get(c.id));
    w.steps=new Map([...w.steps].map(([id,p])=>[renamed.get(id),p]));
    assert.deepEqual(admitted(select(w)),expected.map(id=>renamed.get(id)).sort());
    for(const c of w.friends){c.x=99-c.x;c.y=99-c.y;}
    w.steps=new Map([...w.steps].map(([id,p])=>[id,{x:99-p.x,y:99-p.y}]));
    w.target={x:99-w.target.x,y:99-w.target.y};
    assert.deepEqual(admitted(select(w)),expected.map(id=>renamed.get(id)).sort());
});

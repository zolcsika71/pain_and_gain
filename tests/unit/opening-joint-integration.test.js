// Explicit generated-only real production wiring, no policy injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {jointFlow,moveCalls,tacticalCalls} from '../fixtures/opening-joint-proposal-flow-world.js';
import {openingDeploymentDiagnostic} from '../../src/strategy/opening-deployment.js';
import {jointProposalStatus} from '../../src/strategy/opening-joint-proposals.js';
const {prepareSecondaryMovement}=await import('../../src/arena/execute.js');

const owned=w=>w.logs.filter(r=>r.type==='action-decision'&&/^(capture-route|opening-centre)-/.test(r.reason));
const cell=p=>`${p.x},${p.y}`;

test('default-off joint switch reaches production convergence seam',async t=>{
    const w=await jointFlow(t);w.step(1);
    const departing=moveCalls(w).filter(c=>w.livePlan.state.squad.memberIds.includes(c.id));
    assert.equal(departing.length,4,'production wiring must replace converging proposals');
    assert.equal(w.joint?.reason,'joint-proposal');
    assert.equal(w.jointContext.probe,false);assert.equal(w.jointContext.adoption,false);
    assert.deepEqual(w.d.jointProposal,[2,6]);
    for(const a of w.d.travel.actors){
        const id=w.game.creeps[w.d.memberSlots[a.slot]].id;
        assert.deepEqual(a.proposed,w.joint.steps.get(id));
        assert.deepEqual(a.admitted,w.prepared.moves.get(id));
    }
    assert.equal(w.centreEvaluations,1);
    assert.deepEqual([...w.livePlan.movement.steps].map(([id,p])=>[id,cell(p)]),
        [...w.jointContext.steps].map(([id,p])=>[id,cell(p)]));
});

test('configuration stays default-off; disabled and non-opening paths bypass policy and terrain work',async t=>{
    const config=fs.readFileSync(new URL('../../src/config.js',import.meta.url),'utf8');
    assert.match(config,/openingJointProposalsExperiment = false/);
    assert.match(config,/oneHealerEscortExperiment = true/);
    for(const options of [{enabled:false},{opening:false}]){
        const w=await jointFlow(t,options);w.step(1);
        assert.equal(w.jointResults.length,0);assert(!w.d?.jointProposal);
        if(w.prepareInput){
            const a=[...w.prepareInput];let scans=0;
            a[7]={...a[7],terrainAt:()=>{scans++;throw Error('disabled must not scan');}};
            assert.equal(a[8],null);
            const prepared=prepareSecondaryMovement(...a);
            assert.deepEqual(prepared.moves,w.prepared.moves);assert.equal(scans,0);
        }
    }
});

for(const options of [{probe:true},{adoption:true},{probe:true,adoption:true},{probe:null},{adoption:null}])
test(`joint authority rejects configuration ${JSON.stringify(options)} before route work`,async t=>{
    const w=await jointFlow(t,options);const d=w.step(1);
    assert.equal(d.reason,'incompatible-configuration');assert.equal(d.phase,'finished');
    assert.equal(d.queries,0);assert.equal(w.requests.length,0);assert.equal(w.matrices,0);
    assert.equal(w.jointResults.length,0);assert.equal(w.centreEvaluations,0);
    assert(!owned(w).length);assert.deepEqual(d.jointProposal,[0,null]);
});

test('working travel skips evaluation and its terrain scans; non-opening contest cannot enter helper',async t=>{
    const w=await jointFlow(t);w.step(1);w.observe();w.step(2);
    assert.equal(w.joint,null);assert.deepEqual(w.d.jointProposal,[1,0]);
    const a=[...w.prepareInput];let scans=0;
    a[7]={...a[7],terrainAt:()=>{scans++;throw Error('working travel must not scan');}};
    prepareSecondaryMovement(...a);assert.equal(scans,0);
    a[0]={...a[0],movement:{...a[0].movement,kind:'contest'}};
    const p=prepareSecondaryMovement(...a);assert(!p.secondary.diagnostic.jointProposal);
    assert.equal(w.joint,null);assert.equal(scans,0);
});

test('final changed destinations fence centre preparation; no cross-group destination is shared',async t=>{
    const w=await jointFlow(t,{configure:w=>{
        Object.assign(w.centre,{x:20,y:21});
        for(const [id,x,y]of [['guardH2',29,18],['blade',30,17],['guardR0',28,21],['guardR1',30,19]])
            Object.assign(w.actor(id),{x,y});
    }});w.step(1);
    assert.equal(w.joint?.reason,'joint-proposal');assert.equal(w.d.phase,'active');
    assert.deepEqual(w.joint.steps.get('guardR2'),{x:27,y:21});
    assert.notDeepEqual(w.centrePlan.moves.get('guardR0'),{x:27,y:21});
    assert(w.centrePlan.moves.get('guardR0'),'fencing is not achieved by holding every centre actor');
    const moves=moveCalls(w);assert.equal(new Set(moves.map(cell)).size,moves.length);
    const p=w.prepared.moves.get('guardR2');assert.deepEqual(p,{x:27,y:21});
});

test('late centre priority cancellation discards successful joint preparation before commands',async t=>{
    const w=await jointFlow(t,{configure:w=>Object.assign(w.enemies.find(c=>c.body.some(p=>p.type==='heal')),
        {x:12,y:12})});w.step(1);
    assert.equal(w.joint?.reason,'joint-proposal','joint preparation succeeds before centre priority handoff');
    assert.equal(w.centreEvaluations,1);assert.equal(w.centrePlan.reason,'priority-handoff');
    assert.equal(w.d.reason,'centre-priority-handoff');assert.equal(w.d.phase,'finished');
    assert.deepEqual(w.d.jointProposal,[14,null]);assert.equal(owned(w).length,0);
    assert(w.logs.some(r=>r.type==='action-decision'&&/^combat-/.test(r.reason)));
    assert(!w.d.travel);assert.equal(w.d.jointProposal[1],null,'discarded status carries no changed-slot claim');
    const n=w.jointResults.length;
    for(let tick=2;tick<=6;tick++){w.step(tick);assert.equal(owned(w).length,0);assert.equal(w.joint,null);}
    assert.equal(w.jointResults.length,n);
});

test('spent/duplicate/terminal paths have no stale joint moves or mask; genuine rewind permits a new mission',async t=>{
    const w=await jointFlow(t);w.step(1);const n=w.requests.length;
    w.step(1);assert.equal(w.d.reason,'duplicate-observation');assert.equal(w.requests.length,n);
    assert.deepEqual(w.d.jointProposal,[0,null]);assert.equal(w.joint,null);assert.equal(owned(w).length,0);
    w.step(2);assert.equal(w.d.phase,'finished');assert.equal(w.joint,null);
    w.step(1);assert.equal(w.d.phase,'active');assert.equal(w.d.startedAt,1);
    assert.equal(w.joint.reason,'joint-proposal');assert.deepEqual(w.d.jointProposal,[2,6]);
    assert.equal(w.requests.length,n+16);assert.equal(w.centreEvaluations,2);
});

test('joint-disabled command/action traces are identical when the opening context is absent',async t=>{
    const w=await jointFlow(t,{enabled:false});w.step(1);
    const input=w.prepareInput,normal=w.prepared;
    const without=prepareSecondaryMovement(...input.slice(0,8));
    assert.deepEqual(without,normal);assert.equal(w.jointResults.length,0);
    const base={calls:structuredClone(w.calls),tactics:tacticalCalls(w)};
    assert(base.calls.length>0);assert(!w.d.jointProposal);
    // Existing non-empty tactical compatibility cases remain in the main suite.
    assert.deepEqual(w.prepared.secondary.state,w.livePlan.state);
});

test('finite status/mask envelope and maximal final-travel projection stay below2700 without ID payloads',async t=>{
    const w=await jointFlow(t);w.step(1);let envelope=0;
    for(const s of Object.values(jointProposalStatus))for(const mask of [null,0,15]){
        const n=JSON.stringify({jointProposal:[s,mask]}).length-1;
        envelope=Math.max(envelope,n);assert(n<=29);
    }
    const wide=-0.0000010000000000000002;
    const raw={...w.prepared.secondary.diagnostic,reason:'x'.repeat(64),startedAt:2000,unchanged:2000,
        queries:24,reportedOps:24000,cacheHits:4,utility:wide,territorialSwing:wide,ownCapacityLoss:wide,enemyCapacityRelief:wide,
        jointProposal:[14,null],
        rejectedQuery:{ordinal:24,origin:{x:99,y:99},goal:{x:99,y:99},pathType:'undefined',pathIsArray:false,
            pathLength:4294967295,incompleteType:'undefined',incomplete:false,ops:Number.MAX_SAFE_INTEGER},
        excludedCandidates:{geometry:7,routeLimit:7,first:{flagId:'east',reason:'geometric-route-limit',
            lowerBound:99,queryOrdinal:24,pathLength:4294967295}},
        travel:{examined:16,bestSize:4,tied:16,actors:w.livePlan.movement.memberIds.map(actorId=>({actorId,
            proposed:{x:99,y:99},admitted:{x:99,y:99},holdReason:'subset-hold'}))}};
    const d=openingDeploymentDiagnostic({diagnostic:raw,state:{}},w.jointContext.observation,w.membership);
    Object.assign(d,{memberSlots:[27,27,27,27],squadSlot:2,targetSlot:6});
    const length=JSON.stringify(d).length;assert(length+900<2700,'even the incompatible probe envelope cannot exceed the existing limit');
    assert.equal(JSON.stringify(d).includes('actorId'),false);
    t.diagnostic(JSON.stringify({envelope,total:length,withUnusedProbeReservation:length+900}));
});

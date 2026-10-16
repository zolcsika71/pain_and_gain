import test from 'node:test';
import assert from 'node:assert/strict';
import {secondaryModelRoute} from '../fixtures/secondary-army-route.js';

// Retained scout-territory-live-trial-20261016-lvcce6/cache-review.json
// SHA256 9331f3cb97b636a568d5837fb9e492f7fef4868aacddc8ebea6e873a8c1c1d0b.
// Replay 6ad2243574ae43eb6165c3dd; pre-action ticks 76 ->77.
// Exact command: scout2.moveTo(flag_vulnerability at49,49), return0,
// record76:3; actual52,46 ->51,47. All eight goal neighbours occupied.
// Full terrain was NOT retained. An all-plain board below is a favorable
// relaxation, NOT that replay's map or a prediction of its chosen first step.
const plain=()=>Array.from({length:100},()=>Array(100).fill(0));
const ring=[[48,48],[49,48],[50,48],[48,49],[50,49],[48,50],[49,50],[50,50]];
const keys=points=>new Set(points.map(([x,y])=>y*100+x));

test('recorded accepted displacement can coexist with no complete model route',()=>{
    const from={x:52,y:46},observed={x:51,y:47},goal={x:49,y:49};
    const occupied=keys([...ring,[49,49],[52,46]]);
    assert.equal(ring.length,8);assert(!occupied.has(observed.y*100+observed.x));
    const result=secondaryModelRoute(plain(),from,goal,occupied);
    assert.equal(result.next,null);assert.equal(result.steps,null);
    assert.equal(result.status,'model-search-budget');assert.equal(result.ops,5000);
    assert.equal(Math.max(Math.abs(from.x-observed.x),Math.abs(from.y-observed.y)),1);
    // Deliberately retain the discrepancy, not manufacture an Arena resolver.
    // With no ring, this model finds a route on the relaxed board.
    assert(secondaryModelRoute(plain(),from,goal).next);
});

test('model search exhaustion, complete route and finite disconnected search differ',()=>{
    const terrain=plain();
    const complete=secondaryModelRoute(terrain,{x:2,y:2},{x:3,y:3});
    assert.equal(complete.status,'model-complete-route');assert.equal(complete.steps,1);
    const isolated=Array.from({length:100},()=>Array(100).fill(1));isolated[2][2]=0;
    const missing=secondaryModelRoute(isolated,{x:2,y:2},{x:3,y:3});
    assert.equal(missing.status,'model-no-complete-route');assert.equal(missing.ops,1);
    // Neither absence is a recorded moveTo rejection or proof of Arena immobility.
    assert.equal(missing.next,null);
});

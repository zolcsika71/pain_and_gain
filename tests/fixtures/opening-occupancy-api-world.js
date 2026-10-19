// TEST ONLY. Injected CostMatrix storage + explicit API response tables. No
// pathfinding, obstacle search, movement arbitration or source rewriting.
import assert from 'node:assert/strict';
import {openingWorld} from './opening-secondary-generated-world.js';
import {planOpeningDeployment,blockedOpeningReports} from '../../src/strategy/opening-deployment.js';
import {TestCostMatrix} from './arena-cost-matrix.js';
import {prepareSecondaryMovement} from '../../src/arena/execute.js';
import {centreFrame,supplySteps} from './opening-centre-support-world.js';
export {centreFrame,supplySteps};

export {TestCostMatrix};
const row=(from,to,y)=>Array.from({length:to-from+1},(_,i)=>({x:from+i,y}));
// Predetermined GENERATED corridors, not routes found using the matrix. The
// test operator chooses the response family explicitly; no adaptive search.
const corridors={
    medic:[{x:25,y:20},{x:26,y:19},{x:26,y:18},...row(27,44,18),{x:44,y:19},{x:44,y:20}],
    bow1:[{x:27,y:19},...row(28,44,19),{x:44,y:20}],
    bow2:[{x:27,y:20},...row(28,44,20)],
    guardR2:[{x:27,y:21},...row(28,44,21),{x:44,y:20}],
};
const detour=[{x:27,y:19},{x:27,y:18},...row(28,44,18),{x:44,y:19},{x:44,y:20}];
export function scriptedResponse(w,actor,goal){
    if(goal.pos.id!=='east')return{path:[],incomplete:true,ops:100};
    const points=w.responseFamily==='detour'&&actor.id==='bow1'?detour:corridors[actor.id];
    const index=points?.findIndex(p=>p.x===actor.x&&p.y===actor.y)??-1;
    if(index<0)return{path:[],incomplete:true,ops:100};
    const path=points.slice(index+1).map(p=>({...p}));
    return{path,incomplete:false,ops:100,cost:path.length*2};
}
export function occupancyWorld({make=openingWorld,respond=scriptedResponse,CostMatrix=TestCostMatrix}={}){
    const w=make();w.requests=[];w.responseFamily='straight';w.CostMatrix=CostMatrix;
    w.searchPath=(actor,goal,options)=>{
        assert.equal(options.maxOps,1000);assert.equal(goal.range,0);
        const matrix=options.costMatrix;
        assert(matrix instanceof TestCostMatrix);
        const request={tick:w.tick,actorId:actor.id,origin:{x:actor.x,y:actor.y},
            goal:{id:goal.pos.id,x:goal.pos.x,y:goal.pos.y,range:goal.range},maxOps:options.maxOps,
            matrix:matrix??null,observed:w.spacing.creeps.map(c=>({id:c.id,x:c.x,y:c.y,hits:c.hits,exists:c.exists}))};
        w.requests.push(request);const result=respond(w,actor,goal,options);
        request.result=structuredClone(result);return result;
    };
    w.plan=(extra={})=>{
        const observation={...w,creeps:w.spacing.creeps};
        // Inspection only; cache eviction and request policy have one runtime
        // implementation. This test field is not an extra diagnostic stream.
        const evictedActorIds=blockedOpeningReports(observation,w.state).map(r=>r.actorId);
        const plan=planOpeningDeployment(observation,w.membership,w.centre,w.state??null,
            {CostMatrix:w.CostMatrix,search:w.searchPath,terrainAt:w.spacing.terrainAt});
        const prepared=plan.movement?prepareSecondaryMovement(plan,w.myCreeps,w.enemies,w.centre,
            extra.engagements??new Map(),extra.escort??null,extra.pair??null,w.spacing):{secondary:plan,moves:null};
        w.state=prepared.secondary.state;
        return{...prepared.secondary,moves:prepared.moves,requestAdapter:{evictedActorIds}};
    };
    return w;
}

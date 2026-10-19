// Test transport/executor adapter only. All admission, route/cache, binding and
// lifecycle decisions now run the production opening controller.
import {planOpeningDeployment,openingLimits} from '../../src/strategy/opening-deployment.js';
import {prepareSecondaryMovement} from '../../src/arena/execute.js';
import {TestCostMatrix} from './arena-cost-matrix.js';
export {openingLimits};

export function planOpeningSecondary(observation,membership,previous=null,context={}){
    const all=context.spacing?.creeps,centre=observation.flags?.find(f=>f.id===observation.centreId);
    const routes=observation.routes,cap=previous&&!(observation.tick===1&&previous.lastTick>1)?4:24;
    const badTable=!Array.isArray(routes)||routes.length>cap||routes.some(r=>!r||
        !Number.isInteger(r.ops)||r.ops<0||r.ops>1000);
    // Explicit generated response-table transport, not a planner/pathfinder.
    // Absent table entries model a declared incomplete zero-work response.
    const supplied=(actor,goal)=>{
        if(badTable)return undefined;
        const found=routes.filter(r=>r.actorId===actor.id&&r.flagId===goal.pos.id);
        if(!found.length)return{path:[],incomplete:true,ops:0};
        const [r]=found;
        if(found.length!==1||r.tick!==observation.tick||r.from.x!==actor.x||r.from.y!==actor.y)return undefined;
        return{path:r.path,ops:r.ops,incomplete:r.incomplete};
    };
    const plan=planOpeningDeployment({...observation,creeps:all},membership,centre,previous,{
        CostMatrix:TestCostMatrix,
        search:context.searchPath===undefined?supplied:context.searchPath,
        unavailableIds:context.unavailableIds,terrainAt:context.spacing?.terrainAt});
    const prepared=plan.movement?prepareSecondaryMovement(plan,observation.myCreeps,observation.enemies,centre,
        context.engagements??new Map(),context.escort??null,context.pair??null,context.spacing):{secondary:plan,moves:null};
    return{...prepared.secondary,moves:prepared.moves};
}

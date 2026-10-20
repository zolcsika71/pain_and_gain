// Generated-only fixed response tables. No pathfinder, replay input or simulator.
import assert from 'node:assert/strict';
import {jointFlow,moveCalls,tacticalCalls} from './opening-joint-proposal-flow-world.js';
import {proposeHoldAwareJoint} from './opening-hold-joint-proposals.js';
export {moveCalls,tacticalCalls};
const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
const point=p=>({x:p.x,y:p.y});
const same=(a,b)=>a.x===b.x&&a.y===b.y;

export async function holdWorld(t,{candidate=true,mirror=false,rename=false,reverse=false,configure=null}={}){
    const transform=p=>({x:mirror?99-p.x:p.x,y:p.y});
    const w=await jointFlow(t,{mirror,rename,reverse,configure:w=>{
        for(const [id,x,y]of [['medic',25,20],['bow1',22,17],['bow2',22,19],['guardR2',28,20]])
            Object.assign(w.actor(id),{x,y});
        configure?.(w);
    }});
    if(candidate&&process.env.PAIN_GAIN_HOLD_FORCE_BASELINE!=='1')w.proposalPolicy=proposeHoldAwareJoint;
    // All paths below are supplied complete API responses for an origin that
    // occurs in the declared path. An unavailable/blocked response is incomplete.
    const tables={
        medic:[[{x:25,y:20},{x:26,y:20},{x:27,y:20},...row(28,43,19),{x:44,y:20}]],
        bow1:[[{x:22,y:17},{x:23,y:18},...row(24,43,18),{x:44,y:19},{x:44,y:20}]],
        bow2:[[{x:22,y:19},{x:23,y:18},...row(24,43,19),{x:44,y:20}],
            [{x:23,y:20},{x:24,y:20},...row(25,43,21),{x:44,y:20}]],
        guardR2:[[...row(28,44,20)]],
    };
    for(const family of Object.values(tables))for(const path of family)for(let i=0;i<path.length;i++)path[i]=transform(path[i]);
    w.responseTables=tables;
    w.searchPath=(origin,goal,options)=>{
        assert.equal(options.maxOps,1000);assert.equal(goal.range,0);
        const id=origin.id.replace(/^renamed-/,''),family=goal.pos.id==='east'?tables[id]:null;
        const declared=family?.find(path=>path.some(p=>same(origin,p)));
        let path=declared?declared.slice(declared.findIndex(p=>same(origin,p))+1).map(point):[];
        if(path.some(p=>options.costMatrix.get(p.x,p.y)===255))path=[];
        const result={path,incomplete:!path.length,ops:100};
        w.requests.push({tick:w.tick,actorId:origin.id,origin:point(origin),goal:point(goal.pos),
            maxOps:options.maxOps,range:goal.range,matrix:options.costMatrix,result});
        return result;
    };
    return w;
}

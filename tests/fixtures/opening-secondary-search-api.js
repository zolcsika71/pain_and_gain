// Generated API RESPONSE TABLE, not a pathfinder. Existing supplied fixture
// reports provide responses; no obstacle search or congestion repair occurs.
import assert from 'node:assert/strict';
import {TestCostMatrix} from './arena-cost-matrix.js';

export function useGeneratedOpeningSearch(w,respond=result=>result){
    w.searchRequests=[];
    w.searchPath=(origin,goal,options)=>{
        assert.equal(origin,w.actor(origin.id));
        assert.equal(goal.pos,w.flags.find(f=>f.id===goal.pos.id));
        assert.equal(goal.range,0);assert.deepEqual(Object.keys(options).sort(),['costMatrix','maxOps']);
        assert.equal(options.maxOps,1000);assert(options.costMatrix instanceof TestCostMatrix);
        const reports=w.routes.filter(r=>r.actorId===origin.id&&r.flagId===goal.pos.id&&
            r.tick===w.tick&&r.from.x===origin.x&&r.from.y===origin.y);
        assert.equal(reports.length,1,'Response must bind the requested observation, origin and target');
        const r=reports[0];
        const request={tick:w.tick,actorId:origin.id,origin:{x:origin.x,y:origin.y},
            goal:{id:goal.pos.id,x:goal.pos.x,y:goal.pos.y,range:goal.range},options:{...options}};
        w.searchRequests.push(request);
        const result=respond(structuredClone({path:r.path,incomplete:r.incomplete,ops:r.ops,
            cost:r.path.length*2}),request,w.searchRequests.length);
        request.result={pathIsArray:Array.isArray(result?.path),pathLength:Array.isArray(result?.path)?result.path.length:null,
            incomplete:typeof result?.incomplete==='boolean'?result.incomplete:null,
            ops:Number.isInteger(result?.ops)?result.ops:null};
        return result;
    };
    return w;
}

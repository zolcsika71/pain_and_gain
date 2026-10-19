// TEST ONLY: a request overlay around the unchanged production provider.
// Supplied corridors/terrain/outcomes are generated, not pathfinding or Arena.
import assert from 'node:assert/strict';
import {occupancyWorld,centreFrame,supplySteps} from './opening-occupancy-api-world.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {completeObjectiveObservation} from '../../src/strategy/secondary-objective-plan.js';

const same=(a,b)=>a.x===b.x&&a.y===b.y;
const row=(from,to,y)=>Array.from({length:to-from+1},(_,i)=>({x:from+i,y}));
const positions={medic:[25,20],bow1:[25,19],bow2:[25,21],guardR2:[25,22]};
const old={
    medic:[...row(25,29,20),...row(30,44,20)],
    bow1:[...row(25,29,19),...row(30,44,20)],
    bow2:[...row(25,29,21),...row(30,44,21),{x:44,y:20}],
    guardR2:[...row(25,29,22),...row(30,44,21),{x:44,y:20}],
};
const detour={
    medic:[{x:29,y:20},...row(30,44,19),{x:44,y:20}],
    bow1:[{x:29,y:19},...row(30,44,18),{x:44,y:19},{x:44,y:20}],
    bow2:[{x:29,y:21},{x:28,y:20},{x:28,y:19},{x:28,y:18},
        ...row(29,44,18),{x:44,y:19},{x:44,y:20}],
    guardR2:[{x:29,y:22},...row(30,44,22),{x:44,y:21},{x:44,y:20}],
};
const renewed={
    medic:[{x:29,y:20},...row(30,44,19),{x:44,y:20}],
    bow1:[{x:29,y:19},...row(30,44,19),{x:44,y:20}],
    bow2:[{x:29,y:21},...row(30,44,22),{x:44,y:21},{x:44,y:20}],
    guardR2:[{x:29,y:22},...row(30,44,22),{x:44,y:21},{x:44,y:20}],
};

export function sharedCachedNextCells(w){
    assert(completeObjectiveObservation({...w,creeps:w.spacing.creeps}));
    const counts=new Map();
    for(const r of w.state?.routeControl?.cache??[]){
        const actor=w.actor(r.actorId),i=same(actor,r.from)?-1:r.path.findIndex(p=>same(actor,p));
        if(i<0&&!same(actor,r.from))continue;
        const p=r.path[i+1];if(!p)continue;
        const key=`${p.x},${p.y}`,entry=counts.get(key)??{...p,count:0};
        entry.count++;counts.set(key,entry);
    }
    return Object.freeze([...counts.values()].filter(p=>p.count>1)
        .map(({x,y})=>Object.freeze({x,y})).sort((a,b)=>a.x-b.x||a.y-b.y));
}

export function sharedRequestWorld({overlay=false,scenario='progress',rename=false,reverse=false,mirror=false}={}){
    const point=p=>mirror?{x:99-p.x,y:99-p.y}:{x:p.x,y:p.y};
    const id=s=>rename?`unit-${[...s].reverse().join('')}`:s;
    const roleIds=new Map(Object.keys(positions).map(role=>[role,id(role)]));
    let w=occupancyWorld({respond:(world,actor,goal,options)=>{
        if(goal.pos.id!=='east')return{path:[],incomplete:true,ops:100};
        const role=[...roleIds].find(([,i])=>i===actor.id)[0];
        const banned=[point({x:30,y:20}),point({x:30,y:21})];
        const excluded=banned.every(p=>options.costMatrix.get(p.x,p.y)===255);
        if(excluded&&scenario==='incomplete')return{path:[],incomplete:true,ops:100};
        let points;
        if(scenario==='fresh-stall'){
            const y=['medic','bow1'].includes(role)?20:21;
            points=[{x:25,y:positions[role][1]},...row(26,44,y),{x:44,y:20}];
            // Avoid a duplicate final endpoint for the y20 pair.
            if(y===20)points.pop();
        }else points=(excluded?(scenario==='renewed'?renewed:detour):old)[role];
        points=points.map(point);
        const i=points.findIndex(p=>same(actor,p));assert(i>=0);
        return{path:points.slice(i+1).map(p=>({...p})),incomplete:false,ops:100};
    }});
    for(const [role,[x,y]]of Object.entries(positions))Object.assign(w.actor(role),{x,y});
    for(const c of [...w.myCreeps,...w.enemies]){c.id=id(c.id);Object.assign(c,point(c));}
    for(const f of w.flags)Object.assign(f,point(f));
    if(reverse){w.myCreeps.reverse();w.enemies.reverse();w.spacing.creeps.reverse();w.flags.reverse();}
    // Same production birth binding in each generated arm; roles unchanged.
    w.membership=null;w.bind();w.distinct();w.reports();
    w.roleIds=roleIds;w.overlay=overlay;w.frozenExclusions=Object.freeze([]);
    const original=w.searchPath;
    w.searchPath=(actor,goal,options)=>{
        if(overlay)for(const p of w.frozenExclusions)if(!same(p,actor))options.costMatrix.set(p.x,p.y,255);
        const result=original(actor,goal,options),request=w.requests.at(-1);
        request.exclusions=w.frozenExclusions.map(p=>({...p}));
        request.overlay=overlay;request.optionKeys=Object.keys(options).sort();
        return result; // Exactly one underlying call, no retry or per-query update.
    };
    return w;
}

export function sharedRequestFrame(w,extra={}){
    const before=JSON.stringify({creeps:w.spacing.creeps,flags:w.flags,membership:w.membership});
    w.frozenExclusions=sharedCachedNextCells(w);
    const frame=centreFrame(w,extra);
    assert.equal(JSON.stringify({creeps:w.spacing.creeps,flags:w.flags,membership:w.membership}),before);
    const steps=frame.plan.moves;
    assert(frame.plan.diagnostic.queries<=(w.tick===1?24:4));
    if(steps)for(const squad of w.membership.squads){
        const moving=squad.memberIds.filter(id=>steps.get(id));
        for(let mask=0;mask<2**moving.length;mask++){
            const supplied=w.myCreeps.map(c=>({...c,...(moving.includes(c.id)&&mask&(1<<moving.indexOf(c.id))?steps.get(c.id):{})}));
            assert.equal(new Set(supplied.map(c=>`${c.x},${c.y}`)).size,supplied.length);
            assert(secondaryStepSupport(supplied,squad.memberIds,new Map(squad.memberIds.map(id=>[id,null]))));
        }
    }
    const commands=frame.calls.filter(c=>c.method==='move');
    assert.equal(new Set(commands.map(c=>`${c.x},${c.y}`)).size,commands.length);
    for(const c of commands)assert(!w.spacing.creeps.some(a=>a.hits>0&&same(c,a)));
    for(const c of w.myCreeps)assert(frame.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
    return frame;
}

export function compareSharedRequests({scenario='progress',...options}={}){
    const results={};
    for(const overlay of [false,true]){
        const w=sharedRequestWorld({...options,overlay,scenario}),frames=[];
        const cap=scenario==='progress'?10:12;
        for(let tick=1;tick<=cap;tick++){
            assert.equal(w.tick,tick);const requestsBefore=w.requests.length;
            const previous=w.state,previousText=JSON.stringify(previous);
            const before=w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y}));
            const frame=sharedRequestFrame(w);
            assert.equal(JSON.stringify(previous),previousText);
            const ids=w.group().memberIds;
            const chosen=frame.calls.filter(c=>c.method==='move'&&ids.includes(c.id));
            frames.push({tick,positions:before,exclusions:[...w.frozenExclusions],
                diagnostic:frame.plan.diagnostic,cache:w.state.routeControl?.cache??[],
                selection:w.state.selection??null,commands:chosen,
                returns:frame.records.filter(r=>r.method==='move'&&ids.includes(r.actorId)),
                evicted:frame.mission.requestAdapter.evictedActorIds,
                paidRequests:w.requests.length-requestsBefore});
            if(frame.plan.state.phase==='finished')break;
            // Supplied outcomes, never inferred from return0. Retained centre
            // actors stay put here; their correct support remains a precondition.
            const successes=tick<5||scenario==='progress'?chosen.map(c=>c.id):
                scenario==='partial'&&tick===6?[w.roleIds.get('bow2')]:[];
            supplySteps(w,frame,successes);
            frames.at(-1).suppliedNext=w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y}));
        }
        results[overlay?'overlay':'ordinary']={frames,requests:w.requests,roleIds:[...w.roleIds]};
    }
    return results;
}

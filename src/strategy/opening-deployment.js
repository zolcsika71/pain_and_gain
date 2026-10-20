import {selectOpeningObjective as rank, secondaryObjectiveLimits as limits} from './objectives.js';
import {planOpeningRoutes, secondaryTrialLimits, completeObjectiveObservation} from './secondary-objective-plan.js';

const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const part=(c,type)=>c.body.some(p=>p.type===type&&p.hits>0);
const armed=c=>part(c,'attack')||part(c,'ranged_attack');
const point=c=>({x:c.x,y:c.y});
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const living=c=>c.exists!==false&&c.hits>0;

// Only inspect the next cell at an observed origin/path node. Off-path reports
// remain subject to the shared planner's original suffix validation/refresh.
export function blockedOpeningReports(observation,previous){
    const cache=previous?.routeControl?.cache;
    if(previous?.phase!=='active'||!Array.isArray(cache))return[];
    return cache.filter(r=>{
        const actor=observation.myCreeps.find(c=>c.id===r.actorId);
        if(!actor||!r.from||!Array.isArray(r.path))return false;
        const index=same(actor,r.from)?-1:r.path.findIndex(p=>same(actor,p));
        if(index<0&&!same(actor,r.from))return false;
        const next=r.path[index+1];
        return next&&observation.creeps.some(c=>living(c)&&same(c,next));
    });
}
export const openingLimits=Object.freeze({centreWeapons:6,centreHealers:2,
    acquisitionQueries:secondaryTrialLimits.acquisitionQueries,
    refreshQueries:secondaryTrialLimits.activeQueries,lifetime:limits.lifetime,unchanged:limits.unchanged});

/** One pinned opening allocation; no command execution or invented ownership. */
export function planOpeningDeployment(observation,membership,centre,previous=null,context={}){
    const {tick,myCreeps,enemies}=observation;
    const centreId=centre?.id;
    if(tick===1&&previous?.lastTick>1)previous=null; // explicit new-match rewind
    const finish=(reason,diagnostic={})=>({centreId,objectiveId:centreId,fallbackById:new Map(),
        state:{...previous,lastTick:Number.isInteger(tick)?tick:previous?.lastTick??null,
            phase:'finished',reason},diagnostic:{queries:0,reportedOps:0,cacheHits:0,...diagnostic,phase:'finished',reason}});
    if(previous?.phase==='finished')return finish(previous.reason);
    if(context.compatible===false)return finish('incompatible-configuration');
    if(previous&&tick===previous.lastTick)return finish('duplicate-observation');
    if(!previous&&tick!==1)return finish('opening-missed');
    if(!membership?.initialized||membership.lastTick!==tick||!Array.isArray(membership.squads)||
        membership.squads.length>3||!Array.isArray(membership.members)||membership.members.length!==14)
        return finish('membership-unavailable');
    const shapes=membership.squads.filter(s=>Array.isArray(s.memberIds)&&s.memberIds.length===4&&
        s.memberIds.every(id=>membership.members.some(m=>m.id===id&&m.squadId===s.id&&
            m.participating&&m.capable&&m.canMoveNow))&&
        s.memberIds.filter(id=>membership.members.find(m=>m.id===id)?.role==='ranged').length===3&&
        s.memberIds.filter(id=>membership.members.find(m=>m.id===id)?.role==='healer').length===1);
    const squad=previous?membership.squads.find(s=>s.id===previous.squad.id):shapes.length===1?shapes[0]:null;
    if(!squad||!shapes.includes(squad))return finish('opening-squad-unavailable');
    const observationComplete=completeObjectiveObservation(observation)&&observation.observationComplete!==false;
    const input={...observation,centreId,observationComplete,squad,routes:[],unavailableIds:
        context.unavailableIds===undefined?[]:context.unavailableIds};
    // Reuse complete schema/health/capability/support/local-danger checks first.
    const probe=rank(input);
    if(probe.reason!=='no-useful-objective')return finish(probe.reason);
    if(observationComplete!==true||myCreeps.length!==14||!centre||
        !previous&&centre.my!==undefined)return finish('opening-observation-unavailable');
    const all=observation.creeps;
    if(!Array.isArray(all)||all.length!==myCreeps.length+enemies.length||new Set(all).size!==all.length||
        [...myCreeps,...enemies].some(c=>!all.includes(c)))return finish('opening-occupancy-unavailable');
    if(typeof context.CostMatrix!=='function')return finish('opening-matrix-unavailable');
    if(previous&&(centre.id!==previous.centre.id||range(centre,previous.centre)!==0||
        [...squad.memberIds].sort().join('\0')!==previous.squad.memberIds.join('\0')))
        return finish('binding-changed');
    const remaining=myCreeps.filter(c=>!squad.memberIds.includes(c.id));
    const weapons=remaining.filter(armed),healers=remaining.filter(c=>part(c,'heal')&&!armed(c));
    if(remaining.length!==10||remaining.some(c=>c.hits!==c.hitsMax||c.hits<=0||c.exists===false||
        c.fatigue!==0||!part(c,'move')||input.unavailableIds.includes(c.id))||
        weapons.length<openingLimits.centreWeapons||healers.length<openingLimits.centreHealers||
        weapons.some(w=>!healers.some(h=>range(w,h)<=3))||
        healers.some(h=>weapons.filter(w=>range(w,h)<=3).length<2))return finish('centre-mission-unavailable');
    if(enemies.some(e=>e.hits>0&&armed(e)&&remaining.some(c=>range(e,c)<=limits.threatRange)))
        return finish('centre-mission-pressure');
    const blocked=blockedOpeningReports(observation,previous);
    // Eviction, not fabricated age/progress. Missing reports use the shared
    // planner's one <=4-query refresh, including its terminal-stall accounting.
    const routeInput=blocked.length?{...previous.routeControl,
        cache:previous.routeControl.cache.filter(r=>!blocked.includes(r))}:previous?.routeControl;
    const search=(actor,goal,options)=>{
        const costMatrix=new context.CostMatrix();
        for(const c of all)if(living(c)&&c.id!==actor.id)costMatrix.set(c.x,c.y,255);
        costMatrix.set(actor.x,actor.y,0); // terrain default; no assumed vacating
        return context.search(actor,goal,{...options,costMatrix});
    };
    const planned=planOpeningRoutes(observation,{...membership,squads:[squad]},
        centre,routeInput,{search,unavailableIds:input.unavailableIds});
    const routeControl=planned.state,routeDiagnostic=planned.diagnostic;
    if(routeControl.selection?.phase!=='active')return finish(routeDiagnostic.reason,routeDiagnostic);
    const selected={state:routeControl.selection,objectiveId:routeDiagnostic.targetId,
        evaluation:planned.evaluation,work:planned.work},steps=planned.movement.steps;
    const state={phase:'active',lastTick:tick,centre:point(centre),squad:{id:squad.id,
        memberIds:[...squad.memberIds].sort()},selection:selected.state,routeControl};
    state.centre.id=centre.id;
    try {
        if(typeof context.terrainAt!=='function'||[...steps.values()].filter(Boolean).some(p=>
            context.terrainAt(p.x,p.y)!==0))return finish('opening-terrain-unavailable',routeDiagnostic);
    } catch { return finish('opening-terrain-unavailable',routeDiagnostic); }
    const diagnostic=routeDiagnostic;
    const active={fallbackById:planned.fallbackById,centreId:centre.id,objectiveId:selected.objectiveId,state,evaluation:selected.evaluation,work:selected.work,
        diagnostic,
        movement:{kind:'capture',memberIds:[...squad.memberIds],steps},
        cancel:reason=>({...finish(reason,diagnostic),state:{...state,phase:'finished',reason}})};
    return active;
}

/** References index the same pre-action snapshot's creeps/flags, never IDs
 * repeated per travel actor. Long/escaped IDs cannot grow this diagnostic.
 * This projection does not change full identity bindings in controller state.
 */
export function openingDeploymentDiagnostic(plan, observation, membership) {
    const d=plan.diagnostic;
    const members=d.memberIds??[];
    const result={mode:'opening',phase:d.phase,reason:d.reason,
        squadSlot:membership.squads.findIndex(s=>s.id===d.squadId),
        targetSlot:observation.flags.findIndex(f=>f.id===d.targetId),
        memberSlots:members.map(id=>observation.creeps.findIndex(c=>c.id===id)),
        startedAt:d.startedAt??plan.state.selection?.startedAt??null,
        unchanged:d.unchanged??plan.state.selection?.unchanged??0,
        queries:d.queries,reportedOps:d.reportedOps,cacheHits:d.cacheHits};
    for(const key of ['utility','territorialSwing','ownCapacityLoss','enemyCapacityRelief'])
        if(key in d)result[key]=d[key];
    if(d.rejectedQuery)result.rejectedQuery=d.rejectedQuery;
    if(d.excludedCandidates){
        const {flagId,...first}=d.excludedCandidates.first;
        result.excludedCandidates={geometry:d.excludedCandidates.geometry,
            routeLimit:d.excludedCandidates.routeLimit,
            first:{flagSlot:observation.flags.findIndex(f=>f.id===flagId),...first}};
    }
    if(d.travel)result.travel={examined:d.travel.examined,bestSize:d.travel.bestSize,tied:d.travel.tied,
        actors:d.travel.actors.map(({actorId,...actor})=>({slot:members.indexOf(actorId),...actor}))};
    if(d.jointProposal)result.jointProposal=d.jointProposal;
    return result;
}

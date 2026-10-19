import {selectOpeningObjective} from './objectives.js';
import {completeObjectiveObservation} from './secondary-objective-plan.js';
import {prepareSecondaryMovement} from '../arena/execute.js';
import {openingDeploymentDiagnostic} from './opening-deployment.js';

// Tuple: [finite status, live count, fresh-baseline count, alternative count].
// Unknown/unchecked counts are null. No IDs, paths or exception text here.
export const routeAdoptionStatus=Object.freeze({unchecked:0,adopted:1,pair:2,baseline:3,
    alternative:4,reservations:5,noImprovement:6,cancelled:7,spent:8,headroom:9});
const point=p=>p?{x:p.x,y:p.y}:null;
const cell=p=>`${p.x},${p.y}`;
const count=m=>[...m.values()].filter(Boolean).length;
const copyMoves=m=>new Map([...m].map(([id,p])=>[id,point(p)]));
const json=v=>JSON.stringify(v,(_,x)=>x instanceof Map?[...x]:x instanceof Set?[...x]:x);
const encode=p=>String(p.x).padStart(2,'0')+String(p.y).padStart(2,'0');

// A null admitted cell can become a full point on adoption. Reserve the widest
// legal travel projection BEFORE requests, not only the current short holds.
export function adoptionDiagnosticLength(d) {
    const wide=-0.0000010000000000000002;
    return Math.max(JSON.stringify(d).length,JSON.stringify({...d,
        ...Object.fromEntries(['utility','territorialSwing','ownCapacityLoss','enemyCapacityRelief']
            .filter(k=>k in d).map(k=>[k,wide])),
        travel:{examined:16,bestSize:4,tied:16,actors:d.travel.actors.map(a=>({...a,
            proposed:{x:99,y:99},admitted:{x:99,y:99},holdReason:'subset-hold'}))}}).length);
}

/** Capture only after the existing probe gates, before either search. This
 * authority-side closure accepts only that synchronous pair; it cannot search,
 * retry an actor, replan centre neighbours or advance the route coordinator.
 */
export function captureOpeningRouteAdoption({observation,membership,mission,moves,centreIds,
    diagnostic,actorId,actorSlot,mapTick,exclusions,spacing,engagements=new Map(),escort=null,pair=null,unavailableIds=[]}) {
    const status=routeAdoptionStatus,ids=[...mission.movement.memberIds];
    const centreMoves=copyMoves(new Map([...moves].filter(([id])=>centreIds.has(id))));
    const liveMoves=copyMoves(new Map(ids.map(id=>[id,moves.get(id)])));
    const originalMoves=copyMoves(moves),reserved=new Set(spacing.reserved??[]);
    const all=[...observation.creeps],friends=[...observation.myCreeps],enemies=[...observation.enemies];
    const sameRoster=(now,original)=>Array.isArray(now)&&now.length===original.length&&now.every((c,i)=>c===original[i]);
    const witness=()=>json({tick:observation.tick,complete:observation.observationComplete,
        friends:observation.myCreeps.map(c=>c.id),enemies:observation.enemies.map(c=>c.id),
        flags:observation.flags.map(f=>({id:f.id,x:f.x,y:f.y,
        exists:f.exists,my:f.my,effectType:f.effectType,scorePerTick:f.scorePerTick})),
        creeps:observation.creeps.map(c=>({id:c.id,my:c.my,x:c.x,y:c.y,hits:c.hits,hitsMax:c.hitsMax,
            exists:c.exists,fatigue:c.fatigue,body:c.body.map(p=>({type:p.type,hits:p.hits}))})),
        membership,state:mission.state,steps:mission.movement.steps,moves,centreIds,
        engagements,escort,pair,unavailableIds,reserved:spacing.reserved??new Set()});
    const frozen=witness(),tick=observation.tick,terrainAt=spacing.terrainAt;
    const excluded=exclusions.map(encode).join('');
    const actor=observation.myCreeps.find(c=>c.id===actorId);
    const target=observation.flags[diagnostic.targetSlot];
    const squad=membership.squads.find(s=>s.id===mission.state.squad.id);
    const maxDiagnosticLength=adoptionDiagnosticLength(diagnostic);
    let used=false;
    const fence=departing=>{
        const seen=new Set(reserved);
        for(const p of centreMoves.values())if(p){if(seen.has(cell(p)))return false;seen.add(cell(p));}
        for(const p of departing.values())if(p){if(seen.has(cell(p)))return false;seen.add(cell(p));}
        return true;
    };
    const currentFailure=()=>{
        // Identical inputs reuse BOTH completed ownership/support proofs.
        // Any changed fact invalidates them: release, rather than evaluate
        // emergency/centre neighbours just to classify the changed priority.
        if(!sameRoster(observation.creeps,all)||!sameRoster(spacing.creeps,all)||
            !sameRoster(observation.myCreeps,friends)||!sameRoster(observation.enemies,enemies)||
            witness()!==frozen||spacing.terrainAt!==terrainAt)return 'route-adoption-input-changed';
        if(!fence(liveMoves))return 'route-adoption-reservations-changed';
        return null;
    };
    return {maxDiagnosticLength,finish(probe){
        const counts=[count(liveMoves),null,null];
        const work={validations:0,selections:0,subsets:[],centreNeighbours:0,queries:0};
        const result=(code,plan=mission,prepared=originalMoves)=>({mission:plan,moves:prepared,
            centreIds:prepared?new Set(centreIds):null,telemetry:[code,...counts],work});
        const cancel=reason=>result(status.cancelled,mission.cancel(reason),null);
        if(used)return result(status.spent);
        used=true;
        try {
            let failure=currentFailure();if(failure)return cancel(failure);
            if(!probe||probe.queries!==2||probe.results.length!==2||probe.actorSlot!==actorSlot||
                probe.targetSlot!==diagnostic.targetSlot||probe.origin!==encode(actor)||probe.goal!==encode(target)||
                probe.mapTick!==mapTick||probe.matrix!=='occupancy-v1'||probe.excluded!==excluded||
                probe.range!==0||probe.maxOps!==1000||probe.results.some((r,i)=>r.ordinal!==i+1||
                    r.status!=='complete'||r.incomplete!==false||!Number.isInteger(r.ops)||r.ops<0||r.ops>1000||
                    !Number.isInteger(r.length)||r.length<1||r.length>40||typeof r.path!=='string'||
                    r.path.length!==r.length*4||!/^\d+$/.test(r.path))||
                probe.reportedOps!==probe.results.reduce((sum,r)=>sum+r.ops,0))return result(status.pair);
            const branches=[];
            for(let index=0;index<2;index++){
                const r=probe.results[index],path=Array.from({length:r.length},(_,i)=>({
                    x:Number(r.path.slice(i*4,i*4+2)),y:Number(r.path.slice(i*4+2,i*4+4))}));
                const report={actorId,flagId:target.id,tick,searchedAt:tick,from:point(actor),path,incomplete:false,ops:r.ops};
                const reports=mission.state.routeControl.cache.map(old=>old.actorId===actorId?report:old);
                work.validations++;
                const checked=selectOpeningObjective({...observation,centreId:mission.centreId,squad,routes:reports,
                    unavailableIds,observationComplete:completeObjectiveObservation(observation)&&observation.observationComplete!==false},
                mission.state.selection);
                const code=index===0?status.baseline:status.alternative;
                if(checked.state.phase!=='active'||json(checked.state)!==json(mission.state.selection))return result(code);
                // Same existing plain first-step requirement, at most one new
                // step lookup per branch. No full-map or centre-neighbour scan.
                let plain=false;
                try { plain=typeof terrainAt==='function'&&terrainAt(path[0])===0; } catch { /* unknown terrain */ }
                if(!plain)return result(code);
                const state={...mission.state,routeControl:{...mission.state.routeControl,cache:reports}};
                const evaluation=checked.evaluation;
                let staged={...mission,state,evaluation,diagnostic:{...mission.diagnostic,
                    ...Object.fromEntries(['utility','territorialSwing','ownCapacityLoss','enemyCapacityRelief']
                        .map(k=>[k,evaluation[k]]))},
                    movement:{...mission.movement,steps:new Map(reports.map(r=>[r.actorId,r.path[0]??null]))}};
                // Rebase cancellation onto THIS cache, not the old plan's closure.
                staged.cancel=reason=>({...mission.cancel(reason),state:{...state,phase:'finished',reason},
                    diagnostic:{...staged.diagnostic,phase:'finished',reason}});
                work.selections++;
                const prepared=prepareSecondaryMovement(staged,observation.myCreeps,observation.enemies,
                    observation.flags.find(f=>f.id===mission.centreId),engagements,escort,pair,spacing);
                if(!prepared.moves)return cancel(prepared.secondary.state.reason);
                staged=prepared.secondary; // cancellation also owns final travel diagnostics
                work.subsets.push(prepared.secondary.diagnostic.travel.examined);
                counts[index+1]=count(prepared.moves);
                if(!fence(prepared.moves))return result(status.reservations);
                branches.push(prepared);
            }
            failure=currentFailure();if(failure)return cancel(failure);
            if(counts[2]<=Math.max(counts[0],counts[1]))return result(status.noImprovement);
            const chosen=branches[1];
            if(adoptionDiagnosticLength(openingDeploymentDiagnostic(chosen.secondary,observation,membership))>
                maxDiagnosticLength)return result(status.headroom);
            // One commit result: unchanged centre batch, adopted departing
            // diagnostics/map, and just the selected report's actual search age.
            return result(status.adopted,chosen.secondary,new Map([...chosen.moves,...centreMoves]));
        } catch {
            // Inputs can no longer establish safe ownership. No raw exception or
            // unchecked baseline execution after a genuine validation failure.
            return cancel('route-adoption-input-changed');
        }
    }};
}

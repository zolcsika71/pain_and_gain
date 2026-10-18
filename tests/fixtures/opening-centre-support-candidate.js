// TEST ONLY. No path search, persistent pacing or second movement pass.
import {localRetreatStep, selectMovementPlan} from '../../src/tactics/movement.js';
import {secondaryStepSupport, selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';

const range = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const part = (c,t) => c.body.some(p=>p.type===t&&p.hits>0);
const armed = c => part(c,'attack')||part(c,'ranged_attack');
const point = p => p ? {x:p.x,y:p.y} : null;
const cell = p => `${p.x},${p.y}`;
const position = p => Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&
    p.x>=0&&p.y>=0&&p.x<100&&p.y<100;

// Strengthen the shared weapon->healer check with the opening contract's
// healer->two-weapons quorum, for every independent move/stay outcome.
function supported(friends, ids, steps) {
    if (!secondaryStepSupport(friends,ids,steps)) return false;
    const group=ids.map(id=>friends.find(c=>c.id===id));
    return group.filter(c=>part(c,'heal')).every(h=>group.filter(armed).filter(w=>
        [h,steps.get(h.id)??h].every(a=>[w,steps.get(w.id)??w].every(b=>range(a,b)<=3))).length>=2);
}

/** Own only ordinary fallback of the two unchanged retained birth squads.
 * Caller supplies the already prepared secondary moves and existing tick-local
 * reservations. A priority handoff cancels the test mission before execution;
 * ordinary fallback/priority movement after release has no support guarantee.
 */
export function planCentreSupport({observation, membership, mission, spacing,
    engagements=new Map(), escort=null, pair=null}) {
    const work={actors:0,neighbours:0,subsets:[],searches:0};
    const result=(reason,moves=null,details=[])=>({reason,moves,details,work});
    if(mission?.state?.phase!=='active'||!mission.moves) return result('inactive');
    const {myCreeps:friends,enemies}=observation;
    if(!Array.isArray(friends)||friends.length!==14||!Array.isArray(enemies)||enemies.length>14||
        !Array.isArray(spacing?.creeps)||spacing.creeps.length>28||
        !membership?.initialized||membership.lastTick!==observation.tick||
        !Array.isArray(membership.squads)||membership.squads.length!==3||
        spacing.creeps.length!==friends.length+enemies.length||
        [...friends,...enemies].some(c=>!position(c)||!spacing.creeps.includes(c)||
            !Number.isFinite(c.hits)||!Number.isFinite(c.hitsMax)||!Number.isFinite(c.fatigue)||
            !Array.isArray(c.body)||c.body.length>50||
            c.body.some(p=>!p||typeof p.type!=='string'||!Number.isFinite(p.hits)))) return result('unsupported-input');
    const centre=observation.flags.find(f=>f.id===mission.centreId);
    if(!position(centre))return result('unsupported-input');
    const squads=membership.squads.filter(s=>!s.memberIds.some(id=>mission.moves.has(id)));
    if(squads.length!==2||squads.some(s=>s.memberIds.length!==4||new Set(s.memberIds).size!==4||
        s.memberIds.some(id=>!friends.some(c=>c.id===id&&c.hits>0&&c.exists!==false))))
        return result('unsupported-membership');
    const ids=squads.flatMap(s=>s.memberIds);
    if(new Set(ids).size!==8)return result('unsupported-membership');
    // One ownership preflight before any proposal/command. Do not hide a
    // pressure/escort/injury/rejoin plan behind an ordinary owned hold.
    for(const id of ids){
        const c=friends.find(c=>c.id===id);
        if(escort&&[escort.healerId,escort.allyId].includes(id)||pair?.moves.has(id))
            return result('priority-handoff');
        const plan=selectMovementPlan(c,enemies,centre,engagements.get(id),friends,false,
            {...spacing,reserved:new Set(spacing.reserved??[])});
        if(plan.reason!=='flag-fallback')return result('priority-handoff');
    }
    const hold=new Map(ids.map(id=>[id,null]));
    if(squads.some(s=>!supported(friends,s.memberIds,hold)))return result('support-unavailable');
    // Reuse the existing ephemeral reservation representation. All secondary
    // destinations are fenced before centre proposals; no fixed squad/ID wins
    // a cross-squad convergence tie. Ordinary scouts still have opaque moveTo.
    const reserved=new Set(spacing.reserved??[]);
    for(const p of mission.moves.values())if(p)reserved.add(cell(p));
    const proposed=new Map(),details=[];
    for(const squad of squads)for(const id of squad.memberIds){
        const c=friends.find(c=>c.id===id);work.actors++;
        let best=null,score=null,tied=false;
        if(typeof spacing.terrainAt==='function')localRetreatStep(c,enemies,{
            ...spacing,reserved,terrainAt:p=>{work.neighbours++;try{return spacing.terrainAt(p);}catch{return undefined;}}
        },p=>{
            if(range(p,centre)>=range(c,centre))return false;
            const alone=new Map(hold);alone.set(id,p);
            if(!supported(friends,squad.memberIds,alone))return false;
            const candidate=[range(p,centre),Math.abs(p.x-centre.x)+Math.abs(p.y-centre.y)];
            if(!score||candidate[0]<score[0]||candidate[0]===score[0]&&candidate[1]<score[1]){
                best=p;score=candidate;tied=false;
            }else if(candidate[0]===score[0]&&candidate[1]===score[1])tied=true;
            return false; // complete the same <=8-neighbour production scan
        });
        proposed.set(id,tied?null:best);
        details.push({actorId:id,proposed:point(tied?null:best),admitted:null,
            reason:tied?'equal-best-hold':best?'proposed':'no-safe-progress'});
    }
    const crossConflicts=new Set();
    for(const s of squads)for(const id of s.memberIds){
        const p=proposed.get(id);
        if(p&&squads.filter(other=>other!==s).some(other=>other.memberIds.some(j=>
            proposed.get(j)&&cell(proposed.get(j))===cell(p))))crossConflicts.add(id);
    }
    for(const id of crossConflicts){proposed.set(id,null);details.find(d=>d.actorId===id).reason='cross-squad-convergence';}
    const moves=new Map(hold);
    for(const squad of squads){
        const steps=new Map(squad.memberIds.map(id=>[id,proposed.get(id)]));
        // Same conservative preflight as objective travel: never call the
        // selector's unblocked fast path with a support-unsafe full proposal.
        if(!supported(friends,squad.memberIds,steps)){
            work.subsets.push({squadId:squad.id,examined:1});
            for(const id of squad.memberIds)details.find(d=>d.actorId===id).reason='group-support-hold';
            continue;
        }
        const selected=selectSecondaryTravelSteps(friends,squad.memberIds,steps,spacing.creeps);
        work.subsets.push({squadId:squad.id,examined:Math.max(1,selected.examined)});
        for(const id of squad.memberIds){
            const p=selected.moves.get(id);moves.set(id,p);
            const d=details.find(d=>d.actorId===id);d.admitted=point(p);
            if(p){d.reason='admitted';reserved.add(cell(p));}
            else if(proposed.get(id))d.reason='subset-hold';
        }
    }
    return result('centre-supported',moves,details);
}

// Test-side ownership transport into ONE unchanged production executor pass.
// Nothing under src/ imports this candidate.
export function withCentreSupport(w,mission,extra={}){
    const centre=planCentreSupport({observation:w,membership:w.membership,mission,
        spacing:w.spacing,...extra});
    if(centre.moves)return{...mission,moves:new Map([...mission.moves,...centre.moves]),centre};
    if(centre.reason==='inactive')return{...mission,centre};
    const stopped=mission.cancel(`centre-${centre.reason}`);
    w.state=stopped.state;
    return{...stopped,moves:null,centre};
}

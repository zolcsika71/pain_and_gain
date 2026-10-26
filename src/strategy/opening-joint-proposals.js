// Route-backed local certificates, not API results or a pathfinder.
import {localRetreatStep} from '../tactics/movement.js';
import {secondaryStepSupport} from './supported-contest.js';
import {selectOpeningObjective,secondaryObjectiveLimits as limits} from './objectives.js';
import {completeObjectiveObservation} from './secondary-objective-plan.js';

const point=p=>({x:p.x,y:p.y});
const cell=p=>`${p.x},${p.y}`;
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const position=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<100&&p.y<100;
const part=(c,t)=>c.body.some(p=>p.type===t&&p.hits>0);

// Finite snapshot status codes; never serialize proof tables/certificates.
export const jointProposalStatus = Object.freeze({
    'not-evaluated':0,'no-convergence':1,'joint-proposal':2,inputs:3,shape:4,
    'missing-proposals':5,'missing-proof':6,'invalid-proof':7,'work-bound':8,
    'no-full-assignment':9,'equal-optima':10,'admission-rejected':11,
    'incompatible-authority':12,inactive:13,discarded:14,
});

// Pure-healer/three-pure-ranged shape ONLY. Production's pair predicate proves
// all four current/next corners; ANDing the three pairs is exactly the group
// predicate for this shape, including every independent command outcome.
export function pairSupportTable(friends,ids,choices,work) {
    const healer=ids.find(id=>part(friends.find(c=>c.id===id),'heal'));
    const weapons=ids.filter(id=>id!==healer),table=new Map();
    for(const id of weapons)table.set(id,choices.get(healer).map(h=>choices.get(id).map(w=>{
        work.pairProofs++;
        return secondaryStepSupport(friends,[healer,id],new Map([[healer,h.step],[id,w.step]]));
    })));
    return {healer,weapons,table};
}

/** Called ONLY from opening preflight's production subset seam, after real
 * priority/current-support/occupancy gates. No route coordinator or commands.
 * Baseline steps and all observations/cache/state remain immutable.
 */
export function proposeOpeningJoint(input) {
    return proposeJoint(input,false);
}

// Separate fixed entry point: callers cannot enlarge the move-only budget.
export function proposeHoldAwareJoint(input) {
    return proposeJoint(input,true);
}

function proposeJoint({observation,mission,steps,spacing,probe=false,adoption=false},holdAware) {
    const work={neighbours:0,candidateCounts:[],assignments:0,pairProofs:0,admission:0,queries:0,...(holdAware?{nodes:0}:{})};
    const result=(reason,next=steps,extra={})=>({reason,steps:next,work,...extra});
    if(probe||adoption)return result('incompatible-authority');
    if(mission?.state?.phase!=='active'||mission.movement?.kind!=='capture')return result('inactive');
    const ids=mission.movement.memberIds,friends=observation?.myCreeps,all=observation?.creeps;
    if(!observation||!Array.isArray(observation.flags)||observation.flags.some(f=>!f)||
        !completeObjectiveObservation(observation)||observation.observationComplete===false||
        !Array.isArray(ids)||ids.length!==4||new Set(ids).size!==4||!(steps instanceof Map)||steps.size!==4||
        !Array.isArray(spacing?.creeps)||spacing.creeps.length!==all.length||
        !all.every(c=>spacing.creeps.includes(c))||new Set(all.map(cell)).size!==all.length||
        all.some(c=>!position(c)||!Array.isArray(c.body)||
            c.body.some(p=>!p||typeof p.type!=='string'||!Number.isFinite(p.hits))))return result('inputs');
    const group=ids.map(id=>friends.find(c=>c.id===id));
    if(group.some(c=>!c)||group.filter(c=>part(c,'heal')&&!part(c,'attack')&&!part(c,'ranged_attack')).length!==1||
        group.filter(c=>part(c,'ranged_attack')&&!part(c,'heal')&&!part(c,'attack')).length!==3)return result('shape');
    const proposed=ids.map(id=>steps.get(id));
    if(proposed.some(p=>!position(p)))return result('missing-proposals');
    if(!proposed.some((p,i)=>proposed.some((q,j)=>j<i&&cell(p)===cell(q))))return result('no-convergence');
    const target=observation.flags.find(f=>f.id===mission.objectiveId),cache=mission.state.routeControl?.cache;
    if(!position(target)||!Array.isArray(cache)||cache.length!==4||typeof spacing.terrainAt!=='function')return result('missing-proof');
    const reports=ids.map(id=>cache.find(r=>r?.actorId===id));
    for(let i=0;i<4;i++){
        const r=reports[i],actor=group[i];
        if(!r||r.flagId!==target.id||r.tick!==observation.tick||r.incomplete!==false||!position(r.from)||
            range(r.from,actor)!==0||!Number.isInteger(r.searchedAt)||observation.tick-r.searchedAt<0||
            observation.tick-r.searchedAt>=5||!Number.isInteger(r.ops)||r.ops<0||r.ops>1000||
            !Array.isArray(r.path)||r.path.length<1||r.path.length>40||
            !r.path.every((p,j)=>position(p)&&range(j?r.path[j-1]:actor,p)===1)||
            range(r.path.at(-1),target)!==0||range(r.path[0],steps.get(actor.id))!==0||
            new Set([cell(actor),...r.path.map(cell)]).size!==r.path.length+1)return result('invalid-proof');
    }
    const choices=new Map();
    for(let i=0;i<4;i++){
        const actor=group[i],r=reports[i],candidates=[];
        localRetreatStep(actor,observation.enemies,{...spacing,terrainAt:p=>{
            work.neighbours++;try{return spacing.terrainAt(p);}catch{return undefined;}
        }},q=>{
            if(range(q,target)>=range(actor,target))return false;
            const ordinary=cell(q)===cell(r.path[0]);
            if(!ordinary&&(r.path.length<2||range(q,r.path[1])!==1||r.path.slice(1).some(p=>cell(p)===cell(q))))return false;
            if(observation.enemies.some(e=>(part(e,'attack')||part(e,'ranged_attack'))&&range(q,e)<=limits.threatRange))return false;
            candidates.push({...(holdAware?{kind:'move'}:{}),step:point(q),certificate:{...r,path:[point(q),...r.path.slice(1).map(point)]}});
            return false; // Collect all legal neighbours; scan order never wins.
        });
        if(holdAware)candidates.push({kind:'hold',step:null});
        work.candidateCounts.push(candidates.length);choices.set(actor.id,candidates);
    }
    if(work.neighbours>32||work.candidateCounts.some(n=>n>(holdAware?4:3)))return result('work-bound');
    if(work.candidateCounts.some(n=>n===0))return result('no-full-assignment',steps,{choices});
    const proof=pairSupportTable(friends,ids,choices,work);
    const contenders=holdAware?ids.map((id,i)=>proposed.some((p,j)=>j!==i&&cell(p)===cell(proposed[i]))):null;
    let best=null,bestCost=Infinity,ties=0;
    const visit=(chosen,indices)=>{
        if(holdAware)work.nodes++;
        if(chosen.length<4){for(let i=0;i<choices.get(ids[chosen.length]).length;i++)visit([...chosen,choices.get(ids[chosen.length])[i]],[...indices,i]);return;}
        work.assignments++;
        const effective=chosen.map((c,i)=>c.step??group[i]);
        if(new Set(effective.map(cell)).size!==4)return;
        if(holdAware){
            // Two original contenders must actually move to distinct cells.
            // Holds cannot turn a previous singleton winner into a repair.
            if(!chosen.some((c,i)=>c.step&&contenders[i]&&chosen.some((d,j)=>
                j!==i&&d.step&&contenders[j]&&cell(proposed[i])===cell(proposed[j]))))return;
            if(!chosen.some((c,i)=>c.step&&cell(c.step)!==cell(proposed[i])))return;
            if(!chosen.some((c,i)=>c.step&&part(group[i],'ranged_attack')))return;
        }
        const hi=indices[ids.indexOf(proof.healer)];
        if(proof.weapons.some(id=>!proof.table.get(id)[hi][indices[ids.indexOf(id)]]))return;
        const cost=effective.reduce((n,p)=>n+manhattan(p,target),0);
        if(cost<bestCost){bestCost=cost;best=chosen;ties=1;}else if(cost===bestCost)ties++;
    };
    visit([],[]);
    if(ties!==1)return result(ties?'equal-optima':'no-full-assignment',steps,{choices,proof,ties});
    // ONE private admission validation. Ops reference original paid searches,
    // not a fabricated search/cost for these derived local certificates.
    work.admission++;
    // Holds retain the actual cache report; they are not zero-length routes.
    const certificates=best.map((c,i)=>c.kind==='hold'?reports[i]:c.certificate);
    const checked=selectOpeningObjective({...observation,centreId:mission.centreId,
        squad:mission.state.squad,routes:certificates,unavailableIds:[],observationComplete:true},
    mission.state.selection);
    if(checked.state.phase!=='active'||JSON.stringify(checked.state)!==JSON.stringify(mission.state.selection))
        return result('admission-rejected',steps,{choices,proof,ties});
    return result('joint-proposal',new Map(ids.map((id,i)=>[id,best[i].step])),
        {choices,proof,ties,certificates});
}

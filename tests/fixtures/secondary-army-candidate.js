// Test-only one-objective departure, not a scout allocator or multi-flag planner.
import {hasFunctioningPart as has} from '../../src/tactics/body.js';
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const armed=c=>has(c,'attack')||has(c,'ranged_attack');
export const secondaryLimits={lastStart:80,route:40,lifetime:60,noDisplacement:4,threat:5,defender:3};
export const targetId='pg_flag_attack_reduction_b';

export function secondaryArmyPlan(state,centre,groupIds,previous,routeSteps,escort=null){
    let plan=previous??{phase:'idle',lastTick:null};
    if(plan.lastTick!==null&&state.tick<=plan.lastTick)plan={phase:'idle',lastTick:null};
    plan={...plan,lastTick:state.tick};
    const fallbackById=new Map();
    const finish=reason=>({state:{...plan,phase:'finished',reason},fallbackById,reason});
    if(plan.phase==='finished')return{state:plan,fallbackById,reason:plan.reason};
    if(!centre||centre.my!==true)return plan.phase==='active'?finish('centre-lost'):{state:plan,fallbackById,reason:'await-centre'};
    const ids=plan.ids??groupIds;
    if(ids.length!==4||new Set(ids).size!==4||state.myCreeps.length>14||state.enemies.length>14)return finish('unsupported-group');
    const group=ids.map(id=>state.myCreeps.find(c=>c.id===id&&c.my&&c.hits>0));
    if(group.some(c=>!c))return finish('member-lost');
    const healers=group.filter(c=>has(c,'heal')&&!c.body.some(p=>['attack','ranged_attack'].includes(p.type)));
    const ranged=group.filter(c=>has(c,'ranged_attack')&&!c.body.some(p=>['attack','heal'].includes(p.type)));
    if(healers.length!==1||ranged.length!==3||group.some(c=>c.body.length>50||!has(c,'move')||c.hits!==c.hitsMax||c.fatigue!==0))return finish('group-unavailable');
    if(ranged.some(c=>range(c,healers[0])>3))return finish('support-separated');
    if(escort&&ids.includes(escort.healerId))return finish('escort-priority');
    if(!state.myCreeps.some(c=>!ids.includes(c.id)&&c.my&&c.hits>0&&armed(c)&&range(c,centre)<=secondaryLimits.defender))return finish('defender-lost');
    if(plan.phase==='active'&&(centre.id!==plan.centre.id||centre.x!==plan.centre.x||centre.y!==plan.centre.y))return finish('centre-binding-changed');
    const target=state.flags.find(f=>f.id===targetId);
    if(!target||target.x!==31||target.y!==67||target.effectType!=='eff_attack_modifier'||target.scorePerTick!==3)return finish('target-invalid');
    if(target.my===true)return finish('captured');
    if(target.my!==undefined)return finish('target-owner-changed');
    const enemies=state.enemies.filter(e=>!e.my&&e.hits>0);
    if(enemies.some(e=>range(e,target)===0))return finish('target-occupied');
    if(enemies.some(e=>armed(e)&&(range(e,centre)<=secondaryLimits.threat||range(e,target)<=secondaryLimits.threat||group.some(c=>range(e,c)<=secondaryLimits.threat))))return finish('enemy-approach');
    if(plan.phase!=='active'){
        if(state.tick>secondaryLimits.lastStart)return finish('start-window-closed');
        const routes=group.map(c=>routeSteps(c,target));
        if(routes.some((n,i)=>!Number.isInteger(n)||n<range(group[i],target)||n>secondaryLimits.route))return finish('route-unavailable');
        plan={...plan,phase:'active',ids:[...ids],centre:{id:centre.id,x:centre.x,y:centre.y},started:state.tick,
            routes,positions:null,stalled:0};
    }
    if(state.tick-plan.started>=secondaryLimits.lifetime)return finish('timeout');
    const positions=group.map(c=>[c.x,c.y]);
    const stalled=JSON.stringify(positions)===JSON.stringify(plan.positions)?plan.stalled+1:0;
    plan={...plan,positions,stalled};
    if(stalled>=secondaryLimits.noDisplacement)return finish('blocked-progress');
    for(const c of group)fallbackById.set(c.id,range(c,target)===0?null:target);
    return{state:plan,fallbackById,reason:'secondary-advance'};
}

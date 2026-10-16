// Test-only policy proposal. Runtime never imports this module.
import {selectSecondaryObjective as capture, secondaryObjectiveLimits as limits} from '../../src/strategy/objectives.js';

const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const part=(c,type)=>c.body.some(p=>p.type===type&&p.hits>0);
const armed=c=>part(c,'attack')||part(c,'ranged_attack');
const living=c=>c.hits>0&&c.exists!==false;
const point=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<100&&p.y<100;
const pureHealer=c=>part(c,'heal')&&!armed(c);
const pureRanged=c=>part(c,'ranged_attack')&&!part(c,'attack')&&!part(c,'heal');
const binding=f=>({id:f.id,x:f.x,y:f.y,effectType:f.effectType,scorePerTick:f.scorePerTick,my:f.my});
const bound=(f,b)=>f&&Object.keys(b).every(k=>f[k]===b[k]);
const freshRoute=(r,c,goal,tick)=>{
    if(r.tick!==tick||r.incomplete!==false||!point(r.from)||!same(r.from,c))return false;
    let last=c;
    for(const p of r.path){if(!point(p)||range(last,p)!==1)return false;last=p;}
    return same(last,goal);
};

/** One existing ranged/healer squad, one isolated unarmed occupant, one attempt.
 * Caller supplies fresh bounded routes to a stand-off point, not to the flag.
 * No searches, movement, attacks, damage prediction or state mutation here.
 */
export function supportedContest(input,previous=null){
    const {tick,flags,myCreeps,enemies,squad,centreId,offers=[],captureRoutes=[]}=input;
    const validTick=Number.isInteger(tick)&&tick>=1&&tick<=limits.matchTicks;
    // The caller owns match reset. Rewind cannot replenish a spent attempt.
    let state=previous??{phase:'idle',lastTick:null};
    const reply=(reason,intent=null)=>({state,reason,intent,ordinaryFallbackById:new Map(
        intent&&['approach','engage'].includes(intent.kind)?state.memberIds.map(id=>[id,{...state.anchor}]):[])});
    const finish=reason=>{state={...state,phase:'finished',reason,lastTick:validTick?tick:state.lastTick};return reply(reason);};
    if(state.phase==='finished')return reply(state.reason);
    if(!validTick||state.lastTick!==null&&tick<state.lastTick)return finish('invalid-time');
    // Reuse capture's representation, health, mobility, controller, support,
    // retained-defence and local-danger gates. Empty routes cannot select.
    const ready=capture({...input,routes:[]});
    if(ready.reason!=='no-useful-objective')return state.phase==='idle'
        ?reply(`readiness:${ready.reason}`):finish(`readiness:${ready.reason}`);
    const ids=[...squad.memberIds].sort(),group=ids.map(id=>myCreeps.find(c=>c.id===id));
    const healers=group.filter(pureHealer),weapons=group.filter(pureRanged);
    if(healers.length!==1||weapons.length<2||healers.length+weapons.length!==group.length)
        return state.phase==='idle'?reply('ranged-support-quorum'):finish('ranged-support-quorum');
    const centre=flags.find(f=>f.id===centreId),foes=enemies.filter(living);
    if(state.phase!=='idle'&&(state.squadId!==squad.id||ids.join('\0')!==state.memberIds.join('\0')||
        !bound(centre,state.centre)))return finish('binding-changed');
    if(state.phase!=='idle'&&tick===state.lastTick)return reply('duplicate-observation');
    if(!Array.isArray(offers)||offers.length>6||new Set(offers.map(o=>o?.flagId)).size!==offers.length||
        offers.some(o=>!Array.isArray(o?.routes)||o.routes.length>4)||
        !Array.isArray(captureRoutes)||captureRoutes.length>4)return finish('unsupported-routes');
    const supplied=[...offers.flatMap(o=>Array.isArray(o?.routes)?o.routes:[null]),...captureRoutes];
    if(supplied.length>24||supplied.some(r=>!r||!Array.isArray(r.path)||r.path.length>limits.route||
        !Number.isInteger(r.ops)||r.ops<0||r.ops>1000||typeof r.incomplete!=='boolean')||
        supplied.reduce((n,r)=>n+r.ops,0)>24000)return finish('unsupported-routes');
    const target=state.phase==='idle'?null:flags.find(f=>f.id===state.flag.id);
    if(target?.my===true)return finish('captured-externally');
    if(state.phase!=='idle'&&!bound(target,state.flag))return finish('ownership-or-target-changed');
    if(state.phase!=='idle'&&tick-state.startedAt>=limits.lifetime)return finish('timeout');
    if(target){
        const occupant=foes.find(c=>c.id===state.occupantId&&same(c,target));
        if(!occupant){
            // A separate admission check, not an automatic capture command.
            if(captureRoutes.some(r=>r.flagId!==target.id))return finish('unsupported-routes');
            const admission=capture({...input,routes:captureRoutes});
            if(admission.reason==='selected'&&admission.objectiveId===target.id){
                state={...state,phase:'finished',lastTick:tick,reason:'capture-eligible'};
                return reply('capture-eligible',{kind:'capture-eligible',flagId:target.id});
            }
            return finish('capture-not-admitted');
        }
    }
    const evaluations=[],rejections=[];
    for(const offer of offers){
        if(target&&offer.flagId!==target.id)continue;
        const flag=flags.find(f=>f.id===offer.flagId),anchor=offer.anchor;
        const reject=reason=>rejections.push(reason);
        if(!flag||flag.id===centreId||flag.my===true){reject('not-contestable');continue;}
        if(!point(anchor)||range(anchor,flag)!==4||range(anchor,centre)>=range(flag,centre)||
            target&&!same(anchor,state.anchor)){reject('stand-off-unavailable');continue;}
        const occupants=foes.filter(c=>same(c,flag));
        if(occupants.length!==1){reject('isolated-occupant-required');continue;}
        const occupant=occupants[0];
        if(armed(occupant)){reject('armed-defence');continue;}
        if(part(occupant,'heal')){reject('enemy-healing');continue;}
        if(foes.some(e=>part(e,'heal')&&range(e,occupant)<=limits.supportRange)){
            reject('enemy-healing');continue;
        }
        if(myCreeps.filter(living).some(c=>!ids.includes(c.id)&&same(c,anchor))){reject('stand-off-occupied');continue;}
        const routes=offer.routes;
        if(routes.length!==group.length||new Set(routes.map(r=>r.actorId)).size!==group.length||
            routes.some(r=>r.flagId!==flag.id||!ids.includes(r.actorId))){reject('route-unavailable');continue;}
        let valid=true,maxSteps=0;
        for(const c of group){
            const r=routes.find(r=>r.actorId===c.id);
            if(!freshRoute(r,c,anchor,tick)){valid=false;break;}
            maxSteps=Math.max(maxSteps,r.path.length);
            const nodes=[c,...r.path],standOff=p=>range(p,flag)>=(pureHealer(c)?4:3);
            if(nodes.some(p=>!standOff(p)||foes.some(e=>armed(e)&&range(e,p)<=limits.threatRange)))valid=false;
        }
        if(!valid){reject('approach-exposure-or-route');continue;}
        if(tick+maxSteps+1>=limits.matchTicks){reject('no-scoring-time');continue;}
        // One-cell/tick is an enemy arrival lower bound, not an intent model.
        // Every other enemy (including scouts) must remain outside this window.
        if(foes.some(e=>e.id!==occupant.id&&
            Math.min(range(e,flag),range(e,anchor))<=maxSteps+limits.arrivalMargin)){
            reject('reinforcement-uncertainty');continue;
        }
        const swing=flag.scorePerTick*(flag.my===false?2:1);
        evaluations.push({flag,anchor,occupant,maxSteps,swing});
    }
    // Integer cross-products compare ratios. Refuse exact ties rather than
    // make an arbitrary identity or compass direction change the objective.
    evaluations.sort((a,b)=>b.swing*(a.maxSteps+1)-a.swing*(b.maxSteps+1)||a.maxSteps-b.maxSteps);
    const best=evaluations[0];
    if(evaluations.length>1&&best.swing===evaluations[1].swing&&best.maxSteps===evaluations[1].maxSteps)
        return reply('ambiguous-contest');
    if(!best)return state.phase==='idle'?reply(rejections.length===1?rejections[0]:'no-contest')
        :finish(rejections[0]??'route-unavailable');
    const distance=Math.max(...weapons.map(c=>range(c,best.flag)));
    const progress=state.phase==='idle'||distance<state.bestDistance;
    const startedAt=state.startedAt??tick,lastProgressAt=progress?tick:state.lastProgressAt;
    if(tick-lastProgressAt>=limits.unchanged)return finish('blocked-progress');
    state={phase:weapons.every(c=>range(c,best.occupant)<=3)?'engage':'approach',lastTick:tick,
        startedAt,lastProgressAt,bestDistance:progress?distance:state.bestDistance,
        squadId:squad.id,memberIds:ids,centre:binding(centre),flag:binding(best.flag),
        occupantId:best.occupant.id,anchor:{...best.anchor}};
    return reply('supported-contest',{kind:state.phase,flagId:best.flag.id,focusId:best.occupant.id,
        anchor:{...state.anchor}});
}

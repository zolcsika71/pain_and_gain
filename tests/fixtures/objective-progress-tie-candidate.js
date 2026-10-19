// TEST ONLY. Caller supplies production-preflighted adjacent route proposals.
import {secondaryStepSupport, selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';

export function selectProgressTie(friends, ids, steps, all, target) {
    const position=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=0&&p.y>=0&&p.x<100&&p.y<100;
    // Missing objective observations never invent a direction or change baseline.
    if(!position(target))return selectSecondaryTravelSteps(friends,ids,steps,all);
    const hold=new Map(ids.map(id=>[id,null]));
    const empty={moves:hold,examined:0,bestSize:0,tied:0};
    if(ids.length!==4||new Set(ids).size!==4||steps.size!==4||
        ids.some(id=>!steps.has(id)||!friends.some(c=>c.id===id)))return empty;
    const group=ids.map(id=>friends.find(c=>c.id===id));
    if(!group.every(position)||!secondaryStepSupport(friends,ids,hold))return empty;
    const weapons=group.filter(c=>c.body.some(p=>p.hits>0&&['attack','ranged_attack'].includes(p.type)));
    if(!weapons.length)return empty;
    const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
    const accepted=new Map();let bestSize=-1,bestDistance=Infinity,common=0,tied=0;
    // Exactly16 subsets. Same current-occupancy and distinct-cell fences;
    // canonical production support proof covers every move/stay combination.
    for(let mask=0;mask<16;mask++){
        const moves=new Map(ids.map((id,i)=>[id,mask&(1<<i)?steps.get(id):null]));
        const moving=[...moves].filter(([,p])=>p);
        if(moving.some(([id,p],i)=>!position(p)||distance(group.find(c=>c.id===id),p)!==1||
            all.some(c=>c.hits>0&&c.exists!==false&&c.x===p.x&&c.y===p.y)||
            moving.some(([,q],j)=>j<i&&q.x===p.x&&q.y===p.y))||
            !secondaryStepSupport(friends,ids,moves))continue;
        accepted.set(mask,moves);
        // Ranking assumes requested steps only, not acceptance/displacement.
        // Refine equal maximum cardinality; never choose an actor by identity.
        const farthest=Math.max(...weapons.map(c=>distance(moves.get(c.id)??c,target)));
        if(moving.length>bestSize||moving.length===bestSize&&farthest<bestDistance){
            bestSize=moving.length;bestDistance=farthest;common=mask;tied=1;
        }else if(moving.length===bestSize&&farthest===bestDistance){common&=mask;tied++;}
    }
    return {moves:accepted.get(common)??hold,examined:16,bestSize:Math.max(0,bestSize),tied,
        bestDistance:Number.isFinite(bestDistance)?bestDistance:null};
}

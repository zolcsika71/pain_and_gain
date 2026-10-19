// TEST ONLY. Alternative exact tie resolution, not a new admission policy.
import {secondaryStepSupport,selectSecondaryTravelSteps as production} from '../../src/strategy/supported-contest.js';
const living=c=>c.hits>0&&c.exists!==false;
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const compareIds=(a,b)=>a<b?-1:a>b?1:0;

// Used both for the cause audit and the stable selector. Exactly16 masks for
// the existing four-member shape; no path searches or persistent arbitration.
export function travelAlternatives(friends,ids,steps,all){
    if(ids.length!==4||new Set(ids).size!==4||steps.size!==4)throw Error('Expected bounded four-member steps');
    const subsets=[];
    for(let mask=0;mask<16;mask++){
        const moves=new Map(ids.map((id,i)=>[id,mask&(1<<i)?steps.get(id):null]));
        const destinations=[...moves.values()].filter(Boolean);
        const occupied=destinations.some(p=>all.some(c=>living(c)&&same(c,p)));
        const converging=destinations.some((p,i)=>destinations.some((q,j)=>j<i&&same(p,q)));
        const support=secondaryStepSupport(friends,ids,moves);
        subsets.push({mask,moves,actors:[...moves].filter(([,p])=>p).map(([id])=>id).sort(compareIds),
            size:destinations.length,occupied,converging,support,safe:!occupied&&!converging&&support});
    }
    const safe=subsets.filter(s=>s.safe),bestSize=Math.max(...safe.map(s=>s.size));
    return{subsets,bestSize,best:safe.filter(s=>s.size===bestSize)};
}

export function selectStableTravelSteps(friends,ids,steps,all){
    const destinations=[...steps.values()].filter(Boolean);
    const conflict=destinations.some((p,i)=>all.some(c=>living(c)&&same(c,p))||
        destinations.some((q,j)=>j<i&&same(p,q)));
    // Preserve production's fast/unsupported paths exactly. As in production,
    // the caller must already have passed complete route/priority/support gates.
    if(!conflict||ids.length!==4||new Set(ids).size!==4||steps.size!==4)
        return production(friends,ids,steps,all);
    const a=travelAlternatives(friends,ids,steps,all);
    const winners=[...a.best].sort((a,b)=>{
        for(let i=0;i<a.actors.length;i++){const d=compareIds(a.actors[i],b.actors[i]);if(d)return d;}
        return 0;
    });
    return{moves:winners[0]?.moves??new Map(ids.map(id=>[id,null])),examined:16,
        bestSize:a.bestSize,tied:a.best.length};
}

// Only test harness configuration. No per-tick winner history/counter exists.
let rule='intersection';
export function setTravelRule(value){
    if(!['intersection','stable-id'].includes(value))throw Error('Unknown test rule');
    rule=value;
}
export function selectOpeningTravelSteps(...args){
    return rule==='stable-id'?selectStableTravelSteps(...args):production(...args);
}

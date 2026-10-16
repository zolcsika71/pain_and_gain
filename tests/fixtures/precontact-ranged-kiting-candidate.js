// Test-only proposal. No runtime imports this module; no commands/state/path search.
import {hasFunctioningPart as has} from '../../src/tactics/body.js';
import {localRetreatStep} from '../../src/tactics/movement.js';

const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const types=new Set(['move','attack','ranged_attack','heal','tough','work','carry']);
const known=c=>c&&c.exists===true&&typeof c.id==='string'&&c.id.length>0&&typeof c.my==='boolean'&&
    Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y)&&c.x>=0&&c.y>=0&&c.x<100&&c.y<100&&
    Number.isSafeInteger(c.hits)&&Number.isSafeInteger(c.hitsMax)&&c.hits>=0&&c.hitsMax>0&&c.hits<=c.hitsMax&&
    typeof c.getRangeTo==='function'&&Array.isArray(c.body)&&c.body.length<=50&&
    Array.from(c.body).every(p=>p&&types.has(p.type)&&Number.isFinite(p.hits)&&p.hits>=0&&p.hits<=100);

export function improveRangedHold({creep:r,friends,enemies,spacing,baseline,owner},findStep=localRetreatStep){
    if(owner!=='ordinary'||baseline?.outcome!=='hold'||baseline.reason!=='combat-in-range'||
        !Array.isArray(friends)||!Array.isArray(enemies)||friends.length>14||enemies.length>14||
        ![...friends,...enemies].every(known)||!friends.includes(r)||friends.some(c=>!c.my)||enemies.some(c=>c.my)||
        new Set([...friends,...enemies].map(c=>c.id)).size!==friends.length+enemies.length||
        !r.my||r.hits<=0||r.fatigue!==0||!has(r,'move')||!has(r,'ranged_attack')||
        r.body.some(p=>p.type==='attack'||p.type==='heal')||
        !spacing||!Array.isArray(spacing.creeps)||spacing.creeps.length!==friends.length+enemies.length||
        !spacing.creeps.every(c=>[...friends,...enemies].includes(c))||new Set(spacing.creeps).size!==spacing.creeps.length||
        typeof findStep!=='function')return baseline;
    const foes=enemies.filter(e=>e.hits>0);
    const melee=foes.filter(e=>has(e,'attack'));
    // Existing adjacent retreat (including blocked adjacent holds) is untouched.
    if(melee.some(e=>range(r,e)<=1)||!melee.some(e=>range(r,e)===2))return baseline;
    const target=foes.find(e=>e.id===baseline.engagement?.id);
    if(!target||range(r,target)>3)return baseline;
    // Preserve EACH functioning healer's current access, not summed nominal power.
    // This is a current-snapshot check: it does not predict those healers' moves.
    const support=friends.filter(h=>h!==r&&h.hits>0&&has(h,'heal')&&range(r,h)<=3);
    const step=findStep(r,foes,spacing,p=>melee.every(e=>range(p,e)>2)&&range(p,target)<=3&&
        support.every(h=>range(p,h)<=(range(r,h)<=1?1:3)));
    return step?{target:step,engagement:baseline.engagement,outcome:'selected',
        reason:'precontact-ranged-kite',targetKind:'position'}:baseline;
}

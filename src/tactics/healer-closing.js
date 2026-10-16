// Default-off useful-healing closing policy, promoted from the tested proposal.
import {hasFunctioningPart as has} from './body.js';
import {selectHealingDecision} from './healing.js';

const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const armed=c=>has(c,'attack')||has(c,'ranged_attack');
const live=c=>c.exists!==false&&c.hits>0;
const point=c=>Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y)&&c.x>=0&&c.y>=0&&c.x<100&&c.y<100;
const partTypes=new Set(['move','attack','ranged_attack','heal','tough','work','carry']);
const known=c=>c&&c.exists===true&&typeof c.id==='string'&&c.id.length>0&&typeof c.my==='boolean'&&point(c)&&
    typeof c.getRangeTo==='function'&&
    Number.isSafeInteger(c.hits)&&Number.isSafeInteger(c.hitsMax)&&c.hits>=0&&c.hitsMax>0&&c.hits<=c.hitsMax&&
    Array.isArray(c.body)&&c.body.length<=50&&c.body.every(p=>p&&partTypes.has(p.type)&&Number.isFinite(p.hits)&&p.hits>=0&&p.hits<=100);

/** Improve ONLY an ordinary hold, after all existing movement owners/retreats.
 * findStep is the unchanged runtime's private bounded neighbour evaluator,
 * supplied by the executor; there is no second neighbour implementation.
 * No commands, reservations, waiting state or future-position simulation.
 */
export function improveHealerHold({creep:h,friends,enemies,spacing,baseline,owner,healModifier},findStep){
    if(owner!=='ordinary'||baseline?.outcome!=='hold'||baseline.reason!=='injured-ally-in-range'||
        !Array.isArray(friends)||!Array.isArray(enemies)||friends.length>14||enemies.length>14||
        ![h,...friends,...enemies].every(known)||!friends.includes(h)||
        friends.some(c=>!c.my)||enemies.some(c=>c.my)||
        new Set([...friends,...enemies].map(c=>c.id)).size!==friends.length+enemies.length||
        !h.my||!live(h)||h.fatigue!==0||!has(h,'heal')||!has(h,'move')||
        h.body.some(p=>p.type==='attack'||p.type==='ranged_attack')||
        ![1,0.75,0.5].includes(healModifier)||!spacing||typeof findStep!=='function'||
        !Array.isArray(spacing.creeps)||spacing.creeps.length!==friends.length+enemies.length||
        !spacing.creeps.every(c=>[...friends,...enemies].includes(c))||
        new Set(spacing.creeps).size!==spacing.creeps.length) return baseline;
    const foes=enemies.filter(e=>!e.my&&live(e));
    const threatened=p=>foes.some(e=>has(e,'attack')&&range(p,e)<=1||has(e,'ranged_attack')&&range(p,e)<=3);
    // Never use healing potential to override pressure retreat, or turn a
    // pressure-blocked hold into an approach closer to a remaining weapon.
    if(threatened(h))return baseline;
    const allies=friends.filter(c=>c!==h&&c.my&&live(c));
    const injured=allies.filter(c=>c.hits<c.hitsMax&&range(h,c)<=3);
    const weapons=allies.filter(c=>armed(c)&&range(h,c)<=3);
    const chosen=selectHealingDecision(h,friends.filter(c=>c.hits<c.hitsMax)).action;
    if(chosen?.method!=='rangedHeal'||range(h,chosen.target)!==2)return baseline;
    const n=h.body.filter(p=>p.type==='heal'&&p.hits>0).length;
    const deficit=chosen.target.hitsMax-chosen.target.hits;
    const before=Math.min(deficit,n*4*healModifier),after=Math.min(deficit,n*12*healModifier);
    if(after<=before)return baseline;
    const step=findStep(h,foes,spacing,p=>range(p,chosen.target)===1&&!threatened(p)&&
        injured.every(c=>range(p,c)<=(range(h,c)<=1?1:3))&&weapons.every(c=>range(p,c)<=3));
    return step?{target:step,engagement:baseline.engagement,outcome:'selected',
        reason:'healer-useful-close',targetKind:'position'}:baseline;
}

// Bound the observation adapter to the complete documented seven-flag inventory.
// Undefined my is neutral; null/unknown data never implies a neutral modifier.
const flagContract={eff_damage_taken_modifier:[1,5],eff_heal_modifier:[2,4],
    eff_attack_modifier:[2,3],eff_ranged_attack_modifier:[2,3]};
export function closingHealModifier(flags){
    if(!Array.isArray(flags)||flags.length!==7||flags.some(f=>!f||f.exists!==true||
        typeof f.id!=='string'||!f.id||!point(f)||![true,false,undefined].includes(f.my)||
        !Object.prototype.hasOwnProperty.call(flagContract,f.effectType)||
        f.scorePerTick!==flagContract[f.effectType][1])||new Set(flags.map(f=>f.id)).size!==7||
        Object.entries(flagContract).some(([type,[count]])=>flags.filter(f=>f.effectType===type).length!==count))return null;
    return 1-0.25*flags.filter(f=>f.effectType==='eff_heal_modifier'&&f.my===true).length;
}

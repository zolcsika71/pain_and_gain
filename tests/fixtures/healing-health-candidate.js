// Offline experiment only. Deliberately mirrors the deployed pure selector,
// adding only health percentage between capped score and range/ID. No runtime
// module imports this file. Nominal capacities are not predicted engine effects.
export function selectHealthTieBreakDecision(creep, damagedFriends) {
    if (creep.my !== true || !(creep.hits > 0)) {
        return { action: null, outcome: 'no-action', reason: 'ineligible-healer' };
    }
    const healParts = creep.body.filter(part => part.type === 'heal' && part.hits > 0).length;
    if (healParts === 0) {
        return { action: null, outcome: 'no-action', reason: 'no-functioning-heal' };
    }

    let target = null;
    let bestScore = -Infinity;
    let bestHealth = Infinity;
    let bestRange = Infinity;
    const seen = new Set();
    for (const candidate of [creep, ...damagedFriends]) {
        const key = candidate.id ?? candidate;
        if (seen.has(key)) continue;
        seen.add(key);
        if (candidate.my !== true || !(candidate.hits > 0 && candidate.hits < candidate.hitsMax)) continue;
        const range = creep.getRangeTo(candidate);
        if (range > 3) continue;
        const capacity = healParts * (range <= 1 ? 12 : 4);
        const score = Math.min(candidate.hitsMax - candidate.hits, capacity);
        const health = candidate.hits / candidate.hitsMax;
        if (score > bestScore || (score === bestScore && (health < bestHealth ||
            (health === bestHealth && (range < bestRange ||
                (range === bestRange && (candidate.id ?? '') < (target?.id ?? ''))))))) {
            target = candidate;
            bestScore = score;
            bestHealth = health;
            bestRange = range;
        }
    }
    if (!target) return { action: null, outcome: 'no-action', reason: 'no-injured-target-in-range' };
    return { action: { method: bestRange <= 1 ? 'heal' : 'rangedHeal', target },
        outcome: 'selected', reason: target === creep ? 'self-heal' : 'injured-ally-in-range' };
}

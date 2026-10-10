// Nominal HEAL_POWER / RANGED_HEAL_POWER from the Arena API. Keep this
// selector pure; these are ranking capacities, not predicted engine healing.
const healPower = 12;
const rangedHealPower = 4;

export function selectHealingDecision(creep, damagedFriends) {
    if (creep.my !== true || !(creep.hits > 0)) {
        return { action: null, outcome: 'no-action', reason: 'ineligible-healer' };
    }
    const healParts = creep.body.filter(part => part.type === 'heal' && part.hits > 0).length;
    if (healParts === 0) {
        return { action: null, outcome: 'no-action', reason: 'no-functioning-heal' };
    }

    let target = null;
    let bestScore = -Infinity;
    let bestRange = Infinity;
    const seen = new Set();
    for (const candidate of [creep, ...damagedFriends]) {
        const key = candidate.id ?? candidate;
        if (seen.has(key)) continue;
        seen.add(key);
        if (candidate.my !== true || !(candidate.hits > 0 && candidate.hits < candidate.hitsMax)) continue;
        const range = creep.getRangeTo(candidate);
        if (range > 3) continue;
        const capacity = healParts * (range <= 1 ? healPower : rangedHealPower);
        const score = Math.min(candidate.hitsMax - candidate.hits, capacity);
        if (score > bestScore || (score === bestScore && (range < bestRange ||
            (range === bestRange && (candidate.id ?? '') < (target?.id ?? ''))))) {
            target = candidate;
            bestScore = score;
            bestRange = range;
        }
    }
    if (!target) return { action: null, outcome: 'no-action', reason: 'no-injured-target-in-range' };
    return { action: { method: bestRange <= 1 ? 'heal' : 'rangedHeal', target },
        outcome: 'selected', reason: target === creep ? 'self-heal' : 'injured-ally-in-range' };
}

export function selectHealingAction(creep, damagedFriends) {
    return selectHealingDecision(creep, damagedFriends).action;
}

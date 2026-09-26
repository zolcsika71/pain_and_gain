export function nearestTarget(creep, candidates, maxRange) {
    let best = null;
    let bestRange = Infinity;

    for (const candidate of candidates) {
        const range = creep.getRangeTo(candidate);
        if (range > maxRange) continue;

        const candidateId = candidate.id ?? '';
        const bestId = best?.id ?? '';
        if (range < bestRange || (range === bestRange && candidateId < bestId)) {
            best = candidate;
            bestRange = range;
        }
    }

    return best;
}

function describeCreep(creep) {
    const activeBodyParts = {};
    for (const part of creep.body) {
        if (part.hits > 0) {
            activeBodyParts[part.type] = (activeBodyParts[part.type] ?? 0) + 1;
        }
    }
    return {
        id: creep.id,
        my: creep.my,
        x: creep.x,
        y: creep.y,
        hits: creep.hits,
        hitsMax: creep.hitsMax,
        fatigue: creep.fatigue,
        activeBodyParts,
    };
}

export function logGameState({ tick, creeps, flags }, selectedFlag) {
    console.log(JSON.stringify({
        type: 'game-state',
        tick,
        phase: 'before-actions',
        selectedFlagId: selectedFlag?.id ?? null,
        creeps: creeps.map(describeCreep),
        flags: flags.map(flag => ({
            id: flag.id,
            x: flag.x,
            y: flag.y,
            owner: flag.my === true ? 'me' : flag.my === false ? 'enemy' : 'neutral',
            effectType: flag.effectType,
            scorePerTick: flag.scorePerTick,
        })),
    }));
}

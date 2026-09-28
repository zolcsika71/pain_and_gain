import { buildId } from './build-id.js';

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
        buildId,
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

// This is a planner result, not a record of commands issued or movement achieved.
export function logFlagAllocationDiagnostic(diagnostic) {
    console.log(JSON.stringify({ type: 'flag-allocation', buildId,
        phase: 'before-actions', ...diagnostic }));
}

let mapLogged = false;
let lastMapTick = 0;
let mapAttempts = 0;

export function logMapOnce(tick, readMap) {
    if (tick < lastMapTick) {
        mapLogged = false;
        mapAttempts = 0;
    }
    lastMapTick = tick;
    if (mapLogged || mapAttempts >= 3) return;
    mapAttempts++;
    try {
        const map = readMap();
        console.log(JSON.stringify({ type: 'map-state', formatVersion: 1, buildId,
            tick, phase: 'before-actions', map }));
        mapLogged = true;
    } catch (error) {
        console.error(`Map capture failed at tick ${tick}: ${error.message}`);
    }
}

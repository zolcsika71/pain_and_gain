import { getObjects, getObjectsByPrototype, getTerrainAt, getTicks } from 'game/utils';
import { arenaInfo } from 'game';
import { Creep } from 'game/prototypes';
import { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';

export function observeArena() {
    const flags = getObjectsByPrototype(ScoreFlag);
    const creeps = getObjectsByPrototype(Creep);
    const myCreeps = creeps.filter(creep => creep.my);
    const enemies = creeps.filter(creep => !creep.my && creep.hits > 0);
    const damagedFriends = myCreeps.filter(creep => creep.hits > 0 && creep.hits < creep.hitsMax);
    return { tick: getTicks(), flags, creeps, myCreeps, enemies, damagedFriends };
}

function copyMapValue(value, seen = new Set()) {
    if (value instanceof Creep || typeof value === 'function' || value === undefined) return undefined;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    const copy = Array.isArray(value)
        ? value.filter(item => !(item instanceof Creep)).map(item => copyMapValue(item, seen)) : {};
    if (!Array.isArray(value)) {
        for (const key of Object.keys(value).sort()) {
            const item = copyMapValue(value[key], seen);
            if (item !== undefined) copy[key] = item;
        }
    }
    seen.delete(value);
    return copy;
}

function describeMapObject(object) {
    const details = { type: object.constructor.name };
    // Public GameObject and ScoreFlag properties may be prototype getters rather than own keys.
    const keys = new Set([...Object.keys(object), 'id', 'x', 'y', 'exists',
        'ticksToDecay', 'my', 'effectType', 'scorePerTick']);
    for (let prototype = Object.getPrototypeOf(object); prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)) {
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
            if (typeof descriptor.get === 'function') keys.add(key);
        }
    }
    for (const key of [...keys].sort()) {
        if (key === 'controlledBy') continue;
        try {
            const value = copyMapValue(object[key]);
            if (value !== undefined) details[key] = value;
        } catch {
            // A getter unavailable for this object does not prevent capturing the rest of the map.
        }
    }
    try {
        if (object.controlledBy?.id !== undefined) details.controlledById = object.controlledBy.id;
    } catch {
        // Some object types do not expose a readable controller.
    }
    return details;
}

export function observeMap() {
    const rows = [];
    for (let y = 0; y < 100; y++) {
        const row = [];
        for (let x = 0; x < 100; x++) row.push(getTerrainAt({ x, y }));
        rows.push(row);
    }
    const objects = getObjects().filter(object => !(object instanceof Creep)).map(describeMapObject);
    objects.sort((a, b) => (a.type + ':' + (a.id ?? '')).localeCompare(b.type + ':' + (b.id ?? '')) ||
        JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {
        arena: { name: arenaInfo.name, season: arenaInfo.season, level: arenaInfo.level, ticksLimit: arenaInfo.ticksLimit },
        terrain: { width: 100, height: 100, rows },
        objects,
    };
}

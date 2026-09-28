import { hasFunctioningPart } from './body.js';

const engagementRange = 5;
const supportRange = 5;
const holdRange = 2;
const dangerRange = 3;
const maxEscortTicks = 12;

const range = (a, b) => a.getRangeTo(b);
const livingEnemies = enemies => enemies.filter(enemy => !enemy.my && enemy.hits > 0);
const enemyRange = (creep, enemies) => Math.min(Infinity, ...enemies.map(enemy => range(creep, enemy)));
const healthy = creep => creep.hits > 0 && creep.hits === creep.hitsMax;
const pureMelee = creep => hasFunctioningPart(creep, 'attack') && hasFunctioningPart(creep, 'move') &&
    !hasFunctioningPart(creep, 'ranged_attack') && !hasFunctioningPart(creep, 'heal');
const pureHealer = creep => hasFunctioningPart(creep, 'heal') && hasFunctioningPart(creep, 'move') &&
    !hasFunctioningPart(creep, 'attack') && !hasFunctioningPart(creep, 'ranged_attack');

function releaseReason(pair, state, flag, friends, enemies, tick) {
    const healer = friends.find(creep => creep.id === pair.healerId);
    const ally = friends.find(creep => creep.id === pair.allyId);
    if (friends.some(creep => creep.hits > 0 && creep.hits < creep.hitsMax)) return 'friendly-injured';
    if (!healer || !ally || healer.hits <= 0 || ally.hits <= 0) return 'partner-lost';
    if (!pureHealer(healer) || !pureMelee(ally)) return 'role-lost';
    if (flag?.my !== true) return 'first-flag-lost';
    if (tick >= state.startedTick + maxEscortTicks) return 'timeout';
    if (enemyRange(ally, enemies) > engagementRange) return 'engagement-ended';
    if (range(healer, ally) > supportRange) return 'separated';
    if (enemyRange(healer, enemies) <= dangerRange) return 'healer-exposed';
    return null;
}

export function planHealerEscort({ tick, myCreeps, enemies }, flag, previous = null) {
    const state = previous ?? { used: false, pair: null, startedTick: null };
    const living = livingEnemies(enemies);
    if (state.pair) {
        const reason = releaseReason(state.pair, state, flag, myCreeps, living, tick);
        if (reason) return {
            state: { ...state, pair: null }, escort: null,
            transition: { event: 'release', reason, ...state.pair },
        };
        const healer = myCreeps.find(creep => creep.id === state.pair.healerId);
        const ally = myCreeps.find(creep => creep.id === state.pair.allyId);
        const distance = range(healer, ally);
        return { state, escort: { ...state.pair, ally, distance,
            mode: healer.fatigue > 0 || ally.fatigue > 0 ? 'fatigue-pause'
                : distance <= holdRange ? 'hold' : 'move-attempt' }, transition: null };
    }
    if (state.used || flag?.my !== true || myCreeps.some(creep => creep.hits > 0 && creep.hits < creep.hitsMax)) {
        return { state, escort: null, transition: null };
    }

    const pairs = [];
    for (const ally of myCreeps) {
        if (!healthy(ally) || ally.fatigue > 0 || !pureMelee(ally)) continue;
        const threatRange = enemyRange(ally, living);
        if (threatRange > engagementRange) continue;
        for (const healer of myCreeps) {
            if (!healthy(healer) || healer.fatigue > 0 || !pureHealer(healer)) continue;
            const distance = range(healer, ally);
            if (distance > supportRange || enemyRange(healer, living) <= dangerRange) continue;
            pairs.push({ healer, ally, distance, threatRange });
        }
    }
    pairs.sort((a, b) => a.threatRange - b.threatRange ||
        a.ally.id.localeCompare(b.ally.id) || a.distance - b.distance ||
        a.healer.id.localeCompare(b.healer.id));
    const selected = pairs[0];
    if (!selected) return { state, escort: null, transition: null };
    const pair = { healerId: selected.healer.id, allyId: selected.ally.id };
    return {
        state: { used: true, pair, startedTick: tick },
        escort: { ...pair, ally: selected.ally, distance: selected.distance,
            mode: selected.distance <= holdRange ? 'hold' : 'move-attempt' },
        transition: { event: 'assign', reason: 'local-engagement', ...pair },
    };
}

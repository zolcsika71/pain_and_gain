import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

const engagementRange = 5;
const healerSupportRange = 5;
const rangedHealRange = 3;
// Give local support at most the nominal range-five to range-three gap.
// This bounds deliberate pauses, not pathfinding or engine movement success.
const maxSupportWaitTicks = healerSupportRange - rangedHealRange;
// Recorded support separation was seven: four nominal steps back into heal
// range, with one spare observation. Never extend this for a blocked route.
const maxRejoinTicks = 5;
const scoutHoldRange = 2;

function canHoldScout(creep, firstFlag, enemies) {
    return firstFlag?.my === true && creep.my === true && creep.hits > 0 &&
        creep.hits === creep.hitsMax && creep.fatigue === 0 &&
        creep.body.length > 0 && creep.body.every(part => part.type === 'move') &&
        hasFunctioningPart(creep, 'move') && creep.getRangeTo(firstFlag) <= scoutHoldRange &&
        !enemies.some(enemy => !enemy.my && enemy.hits > 0 &&
            (creep.getRangeTo(enemy) <= engagementRange ||
                Math.max(Math.abs(firstFlag.x - enemy.x), Math.abs(firstFlag.y - enemy.y)) <= engagementRange));
}

function fallbackPlan(flag) {
    return flag ? { target: flag, engagement: null, outcome: 'selected',
        reason: 'flag-fallback', targetKind: 'score-flag' }
        : { target: null, engagement: null, outcome: 'no-action',
            reason: 'no-movement-objective', targetKind: null };
}

function shouldWaitForHealer(creep, friends) {
    // Only pure melee advances wait. Never take over mixed-role movement or
    // invent support when no nearby healthy, mobile pure healer can catch up.
    if (!creep.my || creep.hits <= 0 || creep.fatigue !== 0 ||
        !hasFunctioningPart(creep, 'move') ||
        creep.body.some(part => part.type === 'heal' || part.type === 'ranged_attack')) return false;
    let canCatchUp = false;
    for (const friend of friends) {
        if (!friend.my || friend.hits <= 0 || !hasFunctioningPart(friend, 'heal')) continue;
        const distance = creep.getRangeTo(friend);
        // Healing remains possible while fatigued, injured or unable to move.
        if (distance <= rangedHealRange) return false;
        if (distance <= healerSupportRange && friend.hits === friend.hitsMax &&
            friend.fatigue === 0 && hasFunctioningPart(friend, 'move') &&
            !friend.body.some(part => part.type === 'attack' || part.type === 'ranged_attack')) {
            canCatchUp = true;
        }
    }
    return canCatchUp;
}

function isPureMelee(creep) {
    return creep.my && creep.hits > 0 && hasFunctioningPart(creep, 'attack') &&
        hasFunctioningPart(creep, 'move') &&
        !creep.body.some(part => part.type === 'heal' || part.type === 'ranged_attack');
}

function shouldWaitForCloseCombatSupport(creep, target, enemies, friends) {
    // One contact step, not a damage prediction or a general retreat policy:
    // do not immediately solo a melee line under ranged fire with only distant
    // healing when local support can still close the gap. Share the two waits.
    if (!isPureMelee(creep) || creep.fatigue !== 0 || creep.getRangeTo(target) !== 2 ||
        !hasFunctioningPart(target, 'attack') ||
        !enemies.some(enemy => enemy.id !== target.id && hasFunctioningPart(enemy, 'ranged_attack') &&
            creep.getRangeTo(enemy) <= 3)) return false;
    let canClose = false;
    for (const friend of friends) {
        if (!friend.my || friend.hits <= 0 || friend.id === creep.id) continue;
        if (hasFunctioningPart(friend, 'heal')) {
            const distance = creep.getRangeTo(friend);
            if (distance <= 1) return false;
            if (distance <= rangedHealRange && friend.hits === friend.hitsMax &&
                friend.fatigue === 0 && hasFunctioningPart(friend, 'move') &&
                !friend.body.some(part => part.type === 'attack' || part.type === 'ranged_attack')) canClose = true;
        } else if ((hasFunctioningPart(friend, 'attack') && friend.getRangeTo(target) <= 1) ||
            (hasFunctioningPart(friend, 'ranged_attack') && friend.getRangeTo(target) <= 3)) {
            // Potential weapon access, not a promise of its selected command.
            return false;
        }
    }
    return canClose;
}

function rejoinPlan(creep, enemies, friends, flag, engagement) {
    const state = engagement.rejoin;
    const healer = friends.find(friend => friend.id === state.healerId && friend.my &&
        friend.hits > 0 && hasFunctioningPart(friend, 'heal'));
    const reason = !healer ? 'rejoin-support-lost' : creep.getRangeTo(healer) <= rangedHealRange
        ? 'rejoin-arrived' : state.ticks >= maxRejoinTicks ? 'rejoin-timeout' : null;
    const next = { ...engagement, rejoin: { ...state,
        ...(reason ? { done: true } : { ticks: state.ticks + 1 }) } };
    const adjacent = nearestTarget(creep, enemies, 1);
    if (adjacent) return { target: null, engagement: next, outcome: 'hold',
        reason: 'combat-in-range', targetKind: null };
    if (reason) return { ...fallbackPlan(flag), reason, engagement: next };
    return { target: healer, engagement: next, outcome: 'selected',
        reason: 'melee-rejoin-support', targetKind: 'creep' };
}

export function localRetreatStep(creep, enemies, spacing, accepts) {
    if (!spacing || typeof spacing.terrainAt !== 'function' || !Array.isArray(spacing.creeps) ||
        spacing.creeps.length > 28 || enemies.length > 14 ||
        !creep.my || creep.hits <= 0 || creep.fatigue !== 0 || !hasFunctioningPart(creep, 'move') ||
        [creep, ...enemies].some(c => c.body.length > 50)) return null;
    const melee = enemies.filter(e => hasFunctioningPart(e, 'attack'));
    const ranged = enemies.filter(e => hasFunctioningPart(e, 'ranged_attack'));
    const distance = (p, e) => Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y));
    // Eight local observations, no path searches or extrapolated enemy orders.
    for (let y = creep.y - 1; y <= creep.y + 1; y++) for (let x = creep.x - 1; x <= creep.x + 1; x++) {
        if (x === creep.x && y === creep.y || x < 0 || y < 0 || x >= 100 || y >= 100) continue;
        const p = { x, y };
        // Plain only (Arena TERRAIN_PLAIN=0): avoid adding swamp fatigue.
        if (spacing.terrainAt(p) !== 0 || spacing.reserved?.has(`${x},${y}`) ||
            spacing.creeps.some(c => c.id !== creep.id && c.exists !== false && c.hits > 0 && c.x === x && c.y === y) ||
            melee.some(e => distance(p, e) <= 1) ||
            ranged.some(e => distance(p, e) <= 3 && creep.getRangeTo(e) > 3) || !accepts(p)) continue;
        return p;
    }
    return null;
}

function rangedRetreat(creep, target, enemies, spacing, friends) {
    if (enemies.length > 14 || [creep, ...enemies].some(c => c.body.length > 50) ||
        creep.body.some(p => p.type === 'attack' || p.type === 'heal') ||
        !enemies.some(e => hasFunctioningPart(e, 'attack') && creep.getRangeTo(e) <= 1)) return null;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const support = friends.length <= 14 ? friends.filter(friend => friend !== creep && friend.my &&
        friend.exists !== false && friend.hits > 0 && distance(creep, friend) <= rangedHealRange &&
        Array.isArray(friend.body) && friend.body.length <= 50 && friend.body.every(part => part && typeof part === 'object') &&
        hasFunctioningPart(friend, 'heal')) : [];
    let escape = null;
    const preferred = localRetreatStep(creep, enemies, spacing, p => {
        if (distance(p, target) > 3) return false;
        // Preserve the original first legal escape as an emergency fallback.
        // Look for retained healing only within this SAME eight-cell scan.
        escape ??= p;
        return support.every(friend => distance(p, friend) <= (distance(creep, friend) <= 1 ? 1 : rangedHealRange)) &&
            enemies.every(enemy => !hasFunctioningPart(enemy, 'ranged_attack') ||
                distance(p, enemy) > 3 || distance(escape, enemy) <= 3);
    });
    return preferred ?? escape;
}

function healerRetreat(creep, enemies, friends, spacing) {
    // Exclude hybrids even when their nominal weapon parts are now destroyed.
    if (friends.length > 14 || enemies.length > 14 ||
        [creep, ...friends, ...enemies].some(c => c.body.length > 50) ||
        creep.body.some(p => p.type === 'attack' || p.type === 'ranged_attack')) return null;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const meleePressure = enemies.some(e => hasFunctioningPart(e, 'attack') && distance(creep, e) <= 1);
    const ranged = enemies.filter(e => hasFunctioningPart(e, 'ranged_attack'));
    const currentRanged = ranged.filter(e => distance(creep, e) <= 3).length;
    if (!meleePressure && !currentRanged) return null;
    const allies = friends.filter(c => c.id !== creep.id && c.my && c.hits > 0 && c.exists !== false);
    const injured = allies.filter(c => c.hits < c.hitsMax && distance(creep, c) <= rangedHealRange);
    const supportedWeapons = allies.filter(c => distance(creep, c) <= rangedHealRange &&
        (hasFunctioningPart(c, 'attack') || hasFunctioningPart(c, 'ranged_attack')));
    return localRetreatStep(creep, enemies, spacing, p =>
        // Shared checks remove all melee reach and forbid every new ranged
        // envelope. Strict improvement does not sum nominal damage or predict orders.
        (meleePressure || ranged.filter(e => distance(p, e) <= 3).length < currentRanged) &&
        // Keep every currently available injured ally's healing band, not just
        // a new nominal target. Self-healing moves with the actor unchanged.
        injured.every(c => distance(p, c) <= (distance(creep, c) <= 1 ? 1 : rangedHealRange)) &&
        supportedWeapons.every(c => distance(p, c) <= rangedHealRange) &&
        allies.some(c => distance(p, c) <= rangedHealRange &&
            (c.hits < c.hitsMax || hasFunctioningPart(c, 'attack') || hasFunctioningPart(c, 'ranged_attack'))));
}

// The caller enables holding only for the unassigned first-flag fallback.
export function selectMovementPlan(creep, enemies, flag, previous = null, friends = [],
    holdUnassignedScout = false, spacing = null) {
    if (holdUnassignedScout && canHoldScout(creep, flag, enemies)) {
        return { target: null, engagement: null, outcome: 'hold',
            reason: 'scout-owned-flag-hold', targetKind: null };
    }
    const attackRange = hasFunctioningPart(creep, 'attack') ? 1
        : hasFunctioningPart(creep, 'ranged_attack') ? 3 : null;
    const livingEnemies = enemies.filter(enemy => !enemy.my && enemy.hits > 0);
    if (attackRange === null) {
        if (hasFunctioningPart(creep, 'heal')) {
            const retreat = healerRetreat(creep, livingEnemies, friends, spacing);
            if (retreat) return { target: retreat, engagement: null, outcome: 'selected',
                reason: 'healer-pressure-retreat', targetKind: 'position' };
            const injured = friends.filter(friend => friend.my && friend.id !== creep.id &&
                friend.hits > 0 && friend.hits < friend.hitsMax);
            const distant = nearestTarget(creep, injured.filter(ally => creep.getRangeTo(ally) > rangedHealRange),
                healerSupportRange);
            if (distant) return { target: distant, engagement: null, outcome: 'selected',
                reason: 'injured-ally-approach', targetKind: 'creep' };
            if (nearestTarget(creep, injured, rangedHealRange)) {
                return { target: null, engagement: null, outcome: 'hold',
                    reason: 'injured-ally-in-range', targetKind: null };
            }
        }
        return fallbackPlan(flag);
    }

    const pureMelee = isPureMelee(creep);
    if (previous?.rejoin && (!pureMelee || !flag)) {
        previous = { ...previous, rejoin: null };
    }
    if (previous?.rejoin && !previous.rejoin.done) {
        if (livingEnemies.some(enemy => enemy.id === previous.rejoin.targetId)) {
            return rejoinPlan(creep, livingEnemies, friends, flag, previous);
        }
        previous = { ...previous, rejoin: { ...previous.rejoin, done: true } };
    }
    let target = nearestTarget(creep, livingEnemies, engagementRange);
    let outsideTicks = 0;
    if (!target && previous?.id && previous.outsideTicks !== 1) {
        const retained = livingEnemies.find(enemy => enemy.id === previous.id);
        if (retained && creep.getRangeTo(retained) === engagementRange + 1) {
            target = retained;
            outsideTicks = 1;
        }
    }
    if (!target) return fallbackPlan(flag);
    const approach = creep.getRangeTo(target) > attackRange;
    // Carry the spent budget across retargets and temporary support arrival.
    // Existing disengagement/removal/match-reset paths clear the whole state.
    const supportWaitTicks = previous?.supportWaitTicks ?? 0;
    const waitForHealer = approach && attackRange === 1 && supportWaitTicks < maxSupportWaitTicks &&
        shouldWaitForHealer(creep, friends);
    const waitForCloseSupport = approach && supportWaitTicks < maxSupportWaitTicks && !waitForHealer &&
        shouldWaitForCloseCombatSupport(creep, target, livingEnemies, friends);
    const waitForSupport = waitForHealer || waitForCloseSupport;
    const engagement = { id: target.id, outsideTicks,
        ...(supportWaitTicks > 0 || waitForSupport
            ? { supportWaitTicks: Math.min(maxSupportWaitTicks, supportWaitTicks + Number(waitForSupport)) } : {}),
        ...(previous?.rejoin ? { rejoin: previous.rejoin } : {}) };
    // One abandoned target stays abandoned during this engagement: no immediate
    // chase/rejoin loop even if support arrives. Adjacent attacks still win.
    if (pureMelee && approach && engagement.rejoin?.targetId === target.id) {
        return { ...fallbackPlan(flag), reason: 'abandoned-ranged-pursuit', engagement };
    }
    if (pureMelee && creep.fatigue === 0 && approach && !waitForSupport &&
        supportWaitTicks >= maxSupportWaitTicks && hasFunctioningPart(target, 'ranged_attack') &&
        !hasFunctioningPart(target, 'attack') && !engagement.rejoin && flag &&
        !friends.some(friend => friend.my && friend.hits > 0 &&
            hasFunctioningPart(friend, 'heal') && creep.getRangeTo(friend) <= rangedHealRange)) {
        const prior = previous?.id === target.id ? previous.pursuit : null;
        const healer = nearestTarget(creep, friends.filter(friend => friend.my && friend.hits > 0 &&
            hasFunctioningPart(friend, 'heal') &&
            !friend.body.some(part => part.type === 'attack' || part.type === 'ranged_attack')), Infinity);
        if (prior && healer && creep.getRangeTo({ x: prior.targetX, y: prior.targetY }) < prior.range &&
            Math.max(Math.abs(prior.x - target.x), Math.abs(prior.y - target.y)) > prior.range &&
            creep.getRangeTo(target) >= prior.range) {
            engagement.rejoin = { targetId: target.id, healerId: healer.id, ticks: 0, done: false };
            return rejoinPlan(creep, livingEnemies, friends, flag, engagement);
        }
        engagement.pursuit = { x: creep.x, y: creep.y, targetX: target.x, targetY: target.y,
            range: creep.getRangeTo(target) };
    }
    const retreat = !approach && attackRange === 3 ? rangedRetreat(creep, target, livingEnemies, spacing, friends) : null;
    if (retreat) return { target: retreat, engagement, outcome: 'selected',
        reason: 'ranged-melee-retreat', targetKind: 'position' };
    return {
        target: approach && !waitForSupport ? target : null,
        engagement,
        outcome: approach && !waitForSupport ? 'selected' : 'hold',
        reason: waitForHealer ? 'await-local-healer' : waitForCloseSupport ? 'await-close-combat-support'
            : approach ? 'combat-approach' : 'combat-in-range',
        targetKind: approach && !waitForSupport ? 'creep' : null,
    };
}

export function selectMovementDecision(creep, enemies, flag, previous = null, friends = []) {
    const { target, engagement } = selectMovementPlan(creep, enemies, flag, previous, friends);
    return { target, engagement };
}

export function selectMovementTarget(creep, enemies, flag) {
    return selectMovementDecision(creep, enemies, flag).target;
}

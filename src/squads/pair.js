import { hasFunctioningPart } from '../tactics/body.js';
import { selectMovementPlan } from '../tactics/movement.js';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const position = creep => ({ x: creep.x, y: creep.y });
const healthy = creep => creep?.my === true && creep.exists !== false &&
    creep.hits > 0 && creep.hits === creep.hitsMax;
const capable = (creep, role) => creep && hasFunctioningPart(creep, 'move') &&
    hasFunctioningPart(creep, role === 'healer' ? 'heal' : role === 'melee' ? 'attack' : 'ranged_attack');

export const pairLimits = { recoveryTicks: 3, lifetimeTicks: 24, separation: 5 };
export const resetPair = () => ({ status: 'inactive', reason: 'awaiting-membership',
    pair: null, startedTick: null, lastTick: null, stalledTicks: 0, previous: null });

// Pure planner: paths are supplied by the Arena boundary; no commands are issued.
export function planSquadPair({ tick, myCreeps, enemies, creeps = [...myCreeps, ...enemies] },
    membership, flag, previous, { engagements = new Map(), fallbackById = new Map(),
        escort = null, nextStep } = {}) {
    let state = previous ?? resetPair();
    if (state.lastTick !== null && tick <= state.lastTick) state = resetPair();
    state = { ...state, lastTick: tick };
    const moves = new Map();
    const result = () => ({ state, moves, context: { ...state.pair,
        status: state.status, reason: state.reason, startedTick: state.startedTick,
        stalledTicks: state.stalledTicks, objectiveId: flag?.id ?? null } });
    const release = reason => {
        state = { ...state, status: 'released', reason };
        return result();
    };
    if (state.status === 'released') return { state, moves, context: null };
    if (!state.pair) {
        if (!membership.initialized) {
            state.reason = membership.reason ?? 'membership-unavailable';
            return result();
        }
        const available = new Map(myCreeps.map(creep => [creep.id, creep]));
        for (const squad of [...membership.squads].sort(byId)) {
            const members = membership.members.filter(member => member.squadId === squad.id &&
                member.participating && healthy(available.get(member.id)) &&
                capable(available.get(member.id), member.role));
            const follower = members.filter(member => member.role === 'healer').sort(byId)[0];
            const leader = members.filter(member => ['melee', 'ranged'].includes(member.role))
                .sort((a, b) => Number(a.role === 'ranged') - Number(b.role === 'ranged') || byId(a, b))[0];
            if (!leader || !follower) continue;
            state = { ...state, pair: { squadId: squad.id, leaderId: leader.id,
                followerId: follower.id, leaderRole: leader.role }, startedTick: tick, status: 'active' };
            break;
        }
        if (!state.pair) return release('no-eligible-squad-pair');
    }
    const { leaderId, followerId, leaderRole } = state.pair;
    const leader = myCreeps.find(creep => creep.id === leaderId);
    const follower = myCreeps.find(creep => creep.id === followerId);
    const partners = [leader, follower];
    if (partners.some(creep => !creep || !creep.my || creep.hits <= 0 || creep.exists === false)) {
        return release('partner-lost');
    }
    if (!capable(leader, leaderRole) || !capable(follower, 'healer') ||
        [leaderId, followerId].some(id => !membership.members.find(member => member.id === id)?.participating)) {
        return release('partner-capability-lost');
    }
    if (escort && [escort.healerId, escort.allyId].some(id => [leaderId, followerId].includes(id))) {
        return release('escort-priority');
    }
    if (partners.some(creep => fallbackById.has(creep.id))) return release('objective-override');
    const baseline = partners.map(creep => selectMovementPlan(creep, enemies, flag,
        engagements.get(creep.id), myCreeps));
    if (baseline.some(plan => plan.reason !== 'flag-fallback')) return release('movement-priority');
    if (!partners.every(healthy)) return release('partner-injured');
    if (enemies.some(enemy => !enemy.my && enemy.hits > 0 && enemy.exists !== false &&
        partners.some(creep => range(creep, enemy) <= 5))) return release('unsafe-to-wait');
    if (tick >= state.startedTick + pairLimits.lifetimeTicks) return release('lifetime-limit');
    const distance = range(leader, follower);
    if (distance > pairLimits.separation) return release('separation-limit');
    if (range(leader, flag) === 0) return release('objective-reached');

    // Count observed failed progress, not OK return codes. A gap cannot prove progress.
    if (state.previous) {
        const old = state.previous;
        const progressed = tick === old.tick + 1 && (old.separated
            ? distance < old.distance
            : partners.every((creep, index) => range(creep, old.positions[index]) > 0));
        state.stalledTicks = progressed ? 0 : state.stalledTicks + 1;
        if (state.stalledTicks >= pairLimits.recoveryTicks) return release('recovery-limit');
    }
    state.previous = { tick, separated: distance > 1, distance, positions: partners.map(position) };
    const hold = (creep, reason) => moves.set(creep.id, { target: null, reason });
    const move = (creep, target, reason, followsLeader = false) => moves.set(creep.id,
        { target: position(target), reason, followsLeader });
    const validStep = (from, step) => step && Number.isInteger(step.x) && Number.isInteger(step.y) &&
        step.x >= 0 && step.x < 100 && step.y >= 0 && step.y < 100 && range(from, step) === 1 &&
        !creeps.some(creep => creep.exists !== false && creep.hits > 0 && range(creep, step) === 0);
    const pause = reason => {
        state.reason = reason;
        partners.forEach(creep => hold(creep, reason));
        return result();
    };
    if (partners.some(creep => creep.fatigue !== 0)) return pause('pair-fatigue-wait');
    if (distance > 1) {
        const step = nextStep(follower, leader, [leader]);
        if (!validStep(follower, step)) return pause('pair-blocked');
        state.reason = 'pair-regroup';
        hold(leader, 'pair-leader-wait');
        move(follower, step, 'pair-regroup');
    } else {
        const step = nextStep(leader, flag, []);
        if (!validStep(leader, step)) return pause('pair-blocked');
        state.reason = 'pair-advance';
        move(leader, step, 'pair-leader-advance');
        move(follower, leader, 'pair-follow-vacating-leader', true);
    }
    return result();
}

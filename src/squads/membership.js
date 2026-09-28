// Bookkeeping only. No Arena imports, movement, or tactical decisions.
const actionPart = { melee: 'attack', ranged: 'ranged_attack', healer: 'heal' };
const knownParts = new Set(['move', 'tough', ...Object.values(actionPart)]);

const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function partCounts(body, functioningOnly = false) {
    if (!Array.isArray(body) || !body.length || body.some(part =>
        !part || typeof part.type !== 'string' || !Number.isFinite(part.hits) || part.hits < 0)) return null;
    const counts = {};
    for (const part of body) {
        if (!functioningOnly || part.hits > 0) counts[part.type] = (counts[part.type] ?? 0) + 1;
    }
    return counts;
}

function initialRole(counts) {
    if (!counts?.move || Object.keys(counts).some(type => !knownParts.has(type))) return 'unclassifiable';
    const actions = Object.entries(actionPart).filter(([, part]) => counts[part] > 0);
    if (actions.length > 1) return 'mixed';
    return actions[0]?.[0] ?? 'scout';
}

function observedMember(creep, previous = null, late = false) {
    const originalParts = previous ? previous.originalParts : partCounts(creep.body);
    const role = previous?.role ?? initialRole(originalParts);
    const dead = previous?.presence === 'dead' || creep.hits <= 0 || creep.exists === false;
    const functioning = dead ? {} : partCounts(creep.body, true) ?? {};
    const capable = !dead && functioning.move > 0 &&
        (role === 'scout' || (actionPart[role] && functioning[actionPart[role]] > 0));
    return {
        id: creep.id, role, originalParts, squadId: previous?.squadId ?? null,
        late: previous?.late ?? late, presence: dead ? 'dead' : 'present',
        functioning, capable: Boolean(capable),
        participating: Boolean(previous?.squadId && capable),
        canMoveNow: !dead && functioning.move > 0 && creep.fatigue === 0,
    };
}

export function resetMembership() {
    return { lastTick: null, initialized: false, reason: 'awaiting-tick-1', squads: [], members: [] };
}

function initialProblem(creeps) {
    if (!Array.isArray(creeps) || creeps.length !== 14) return 'expected-14-owned-living';
    if (creeps.some(creep => !creep || typeof creep.id !== 'string' || !creep.id ||
        !Number.isFinite(creep.x) || !Number.isFinite(creep.y))) return 'invalid-initial-member';
    if (new Set(creeps.map(creep => creep.id)).size !== creeps.length) return 'duplicate-member-id';
    if (creeps.some(creep => creep.my !== true || !Number.isFinite(creep.hits) ||
        creep.hits <= 0 || creep.exists === false)) {
        return 'expected-14-owned-living';
    }
    return null;
}

function initialize(tick, creeps) {
    const problem = initialProblem(creeps);
    if (problem) return { ...resetMembership(), lastTick: tick, reason: problem };
    const members = creeps.map(creep => observedMember(creep)).sort(byId);
    const available = new Map(creeps.map(creep => [creep.id, creep]));
    const unassigned = new Set(members.filter(member =>
        member.capable && (member.role === 'melee' || member.role === 'ranged')).map(member => member.id));
    const squads = [];
    for (const healer of members.filter(member => member.role === 'healer' && member.capable)) {
        const center = available.get(healer.id);
        const chosen = members.filter(member => unassigned.has(member.id)).sort((a, b) =>
            range(center, available.get(a.id)) - range(center, available.get(b.id)) || byId(a, b)).slice(0, 3);
        const id = String.fromCharCode(65 + squads.length);
        const memberIds = [healer.id, ...chosen.map(member => member.id)];
        for (const member of members) if (memberIds.includes(member.id)) {
            member.squadId = id;
            member.participating = true;
        }
        for (const member of chosen) unassigned.delete(member.id);
        squads.push({ id, memberIds });
    }
    return { lastTick: tick, initialized: true, reason: null, squads, members };
}

// A caller owns this match-local value. A late module reload cannot reconstruct tick 1.
export function updateMembership(previous, { tick, myCreeps }) {
    let state = previous ?? resetMembership();
    if (!Number.isInteger(tick) || tick < 1) {
        if (Number.isInteger(tick) && state.lastTick !== null && tick <= state.lastTick) {
            state = resetMembership();
        }
        return { ...state, reason: 'invalid-tick' };
    }
    if (state.lastTick !== null && tick <= state.lastTick) state = resetMembership();
    if (!state.initialized) {
        if (tick !== 1) return { ...state, lastTick: tick,
            reason: state.reason === 'awaiting-tick-1' ? 'initial-tick-missed' : state.reason };
        return initialize(tick, myCreeps);
    }
    if (!Array.isArray(myCreeps)) return { ...state, reason: 'invalid-observation' };
    const observed = new Map();
    for (const creep of myCreeps) {
        if (creep.my !== true) continue;
        if (observed.has(creep.id)) throw new Error(`Duplicate observed member ID: ${creep.id}`);
        observed.set(creep.id, creep);
    }
    const members = state.members.map(member => {
        const creep = observed.get(member.id);
        observed.delete(member.id);
        if (!creep) return member.presence === 'dead' ? member :
            { ...member, presence: 'missing', functioning: {}, capable: false,
                participating: false, canMoveNow: false };
        return observedMember(creep, member);
    });
    for (const creep of observed.values()) members.push(observedMember(creep, null, true));
    members.sort(byId);
    return { ...state, lastTick: tick, reason: null, members };
}

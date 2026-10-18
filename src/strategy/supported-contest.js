import { selectSecondaryObjective, secondaryObjectiveLimits as limits } from './objectives.js';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const same = (a, b) => a.x === b.x && a.y === b.y;
const part = (c, type) => c.body.some(p => p.type === type && p.hits > 0);
const armed = c => part(c, 'attack') || part(c, 'ranged_attack');
const living = c => c.hits > 0 && c.exists !== false;
const position = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) &&
    p.x >= 0 && p.y >= 0 && p.x < 100 && p.y < 100;
export const contestRange = c => part(c, 'heal') ? 4 : 3;

// This reuses all capture readiness gates; no capture arrival/occupancy gate
// is weakened. Caller binds one actual existing membership squad.
export function contestReadiness(input) {
    const checked = selectSecondaryObjective({ ...input, routes: [] });
    if (checked.reason !== 'no-useful-objective') return checked.reason;
    const group = input.squad.memberIds.map(id => input.myCreeps.find(c => c.id === id));
    const healers = group.filter(c => part(c, 'heal') && !armed(c));
    const ranged = group.filter(c => part(c, 'ranged_attack') && !part(c, 'attack') && !part(c, 'heal'));
    return healers.length === 1 && ranged.length >= 2 && healers.length + ranged.length === group.length
        ? null : 'contest-support-quorum';
}

export function contestOccupant(input, flag) {
    const occupants = input.enemies.filter(c => living(c) && same(c, flag));
    if (occupants.length !== 1 || armed(occupants[0]) || part(occupants[0], 'heal')) return null;
    if (input.enemies.some(e => living(e) && part(e, 'heal') && range(e, flag) <= limits.supportRange)) return null;
    return occupants[0];
}

// Validate current/rebased reports to actor-specific range3/range4 goals.
// The executor consumes only the first adjacent node, never moveTo(flag).
export function checkContestRoutes(input, flag, routes, occupantId) {
    const readiness = contestReadiness(input);
    if (readiness) return { reason: readiness };
    const occupant = contestOccupant(input, flag);
    if (!occupant || occupant.id !== occupantId) return { reason: 'contest-defence-changed' };
    const group = input.squad.memberIds.map(id => input.myCreeps.find(c => c.id === id));
    const foes = input.enemies.filter(living), centre = input.flags.find(f => f.id === input.centreId);
    if (routes.length !== group.length) return { reason: 'contest-route-unavailable' };
    let maxSteps = 0;
    const steps = new Map(), endpoints = [];
    for (const c of group) {
        const r = routes.find(r => r.actorId === c.id && r.flagId === flag.id);
        if (!r || r.tick !== input.tick || r.incomplete !== false || !position(r.from) || !same(r.from, c) ||
            !Array.isArray(r.path) || r.path.length > limits.route || !Number.isInteger(r.ops) || r.ops < 0 || r.ops > 1000)
            return { reason: 'contest-route-unavailable' };
        let last = c;
        for (const p of [c, ...r.path]) {
            if (!position(p) || p !== c && range(last, p) !== 1 || range(p, flag) < contestRange(c) ||
                foes.some(e => armed(e) && range(e, p) <= limits.threatRange)) return { reason: 'contest-approach-exposure' };
            last = p;
        }
        if (range(last, flag) !== contestRange(c) || range(last, centre) >= range(flag, centre))
            return { reason: 'contest-route-unavailable' };
        maxSteps = Math.max(maxSteps, r.path.length);
        endpoints.push(last); steps.set(c.id, r.path[0] ?? null);
    }
    if (input.tick + maxSteps + 1 >= limits.matchTicks) return { reason: 'contest-no-scoring-time' };
    if (foes.some(e => e.id !== occupantId && Math.min(range(e, flag), ...endpoints.map(p => range(e, p))) <=
        maxSteps + limits.arrivalMargin)) return { reason: 'contest-reinforcement' };
    return { reason: null, steps, maxSteps };
}

// One-step exposure check, not a traffic or movement-success simulation.
// Every moving/stationary combination retains functioning heal access.
export function secondaryStepSupport(myCreeps, memberIds, steps) {
    const group = memberIds.map(id => myCreeps.find(c => c.id === id));
    if (group.some(c => !c || !living(c))) return false;
    const healers = group.filter(c => part(c, 'heal'));
    // One functioning healer must cover all four current/next combinations
    // for each weapon. Capture may have multiple healers; contest still has one.
    return healers.length > 0 && group.filter(armed).every(c => healers.some(healer =>
        [c, steps.get(c.id) ?? c].every(p => [healer, steps.get(healer.id) ?? healer]
            .every(h => range(p, h) <= limits.supportRange))));
}

// Shared objective travel, AFTER complete-input/priority/route/CURRENT-support
// preflight. Reuse validated adjacent steps; never search or assume vacating.
export function selectSecondaryTravelSteps(friends, memberIds, steps, all) {
    const occupied = p => all.some(c => living(c) && same(c, p));
    const conflict = destinations => destinations.some((p, i) => occupied(p) ||
        destinations.some((q, j) => j < i && same(p, q)));
    const destinations = [...steps.values()].filter(Boolean);
    // Even the conflict-free fast path must prove all move/stay support.
    const fullSupport = secondaryStepSupport(friends, memberIds, steps);
    if (fullSupport && !conflict(destinations)) return { moves: steps, examined: 0, bestSize: 0, tied: 0 };
    const hold = new Map(memberIds.map(id => [id, null]));
    if (memberIds.length !== 4 || new Set(memberIds).size !== 4 || steps.size !== 4)
        return { moves: hold, examined: 0, bestSize: 0, tied: 0 };
    // Current empty was checked by preflight, full above. Check the remaining
    // 14 proper nonempty subsets: at most16 unique subsets/support proofs.
    let bestSize = 0, common = 0, tied = 1;
    const accepted = new Map([[0, hold]]);
    for (let mask = 1; mask < 15; mask++) {
        const moves = new Map(memberIds.map((id, i) => [id, mask & (1 << i) ? steps.get(id) : null]));
        const next = [...moves.values()].filter(Boolean);
        if (conflict(next) || !secondaryStepSupport(friends, memberIds, moves)) continue;
        accepted.set(mask, moves);
        if (next.length > bestSize) { bestSize = next.length; common = mask; tied = 1; }
        else if (next.length === bestSize) { common &= mask; tied++; }
    }
    // Intersection of tied maxima is an already checked safe subset. No ID,
    // geometry or iteration-order tie-break; unresolved contenders stay owned.
    return { moves: accepted.get(common) ?? hold, examined: 16, bestSize, tied };
}

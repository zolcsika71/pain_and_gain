// Bounded match-local controller. No Arena imports, path searches or actor calls.
import { localRetreatStep, selectMovementPlan } from '../tactics/movement.js';
import { selectHealingDecision } from '../tactics/healing.js';
import { secondaryStepSupport, selectSecondaryTravelSteps } from './supported-contest.js';

export const engagementLimits = Object.freeze({ members: 4, neighbours: 8, subsets: 16,
    unchanged: 3, recovery: 5, lifetime: 24, clear: 2, leash: 5 });
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const same = (a, b) => a.x === b.x && a.y === b.y;
const part = (c, type) => c.body.filter(p => p.type === type && p.hits > 0).length;
const armed = c => part(c, 'attack') + part(c, 'ranged_attack') > 0;
const living = c => c && c.exists !== false && c.hits > 0;
const point = p => ({ x: p.x, y: p.y });
const position = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 100 && p.y >= 0 && p.y < 100;
const band = d => d <= 1 ? 1 : d <= 3 ? 3 : null;
const pure = (c, type) => part(c, type) > 0 && !c.body.some(p =>
    ['attack', 'ranged_attack', 'heal'].includes(p.type) && p.type !== type);
const exposure = (p, foes) => foes.filter(e => part(e, 'attack') && range(p, e) <= 1 ||
    part(e, 'ranged_attack') && range(p, e) <= 3);
const snapshots = group => group.map(c => ({ id: c.id, ...point(c), hits: c.hits,
    ranged: part(c, 'ranged_attack'), heal: part(c, 'heal'), move: part(c, 'move') }));
const empty = ids => new Map(ids.map(id => [id, null]));
const owner = (w, id) => w.escort && [w.escort.healerId, w.escort.allyId].includes(id) ||
    w.pair?.moves instanceof Map && w.pair.moves.has(id) ||
    w.externalMoves instanceof Map && w.externalMoves.has(id);
const compare = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
function uniqueBest(values, score) {
    const sorted = values.map(value => ({ value, score: score(value) })).sort((a, b) => compare(a.score, b.score));
    return sorted.length && (!sorted[1] || compare(sorted[0].score, sorted[1].score)) ? sorted[0].value : null;
}
function movementPriority(w, group, healerId, friends, foes) {
    // The executor alone scans emergency neighbours. Ordinary probes cannot
    // issue commands, choose tactical targets or change stored engagements.
    return group.filter(Boolean).filter(c => owner(w, c.id) ||
        (c.id === healerId ? exposure(c, foes).length > 0 :
            foes.some(e => part(e, 'attack') && range(c, e) <= 1)) ||
        !['flag-fallback', 'combat-approach', 'combat-in-range'].includes(selectMovementPlan(c, foes, w.centre,
            w.engagements instanceof Map ? w.engagements.get(c.id) : null,
            friends, false, { ...w.spacing, reserved: new Set() }).reason)).map(c => c.id);
}
function valid(w) {
    if (!Number.isInteger(w.tick) || w.tick < 1 || w.observationComplete !== true ||
        !Array.isArray(w.myCreeps) || w.myCreeps.length > 14 || !Array.isArray(w.enemies) || w.enemies.length > 14 ||
        !Array.isArray(w.spacing?.creeps) || typeof w.spacing?.terrainAt !== 'function' ||
        !w.membership?.initialized || w.membership.lastTick !== w.tick || !Array.isArray(w.membership.squads) ||
        w.membership.squads.length > 3 || w.membership.squads.some(s => !s || typeof s.id !== 'string' ||
            !Array.isArray(s.memberIds) || s.memberIds.length > 4 || s.memberIds.some(id => typeof id !== 'string')) ||
        w.pair !== undefined && !(w.pair?.moves instanceof Map) ||
        w.externalMoves !== undefined && !(w.externalMoves instanceof Map) ||
        w.spacing.reserved !== undefined && !(w.spacing.reserved instanceof Set) ||
        !position(w.centre) || typeof w.centre.id !== 'string') return false;
    const all = [...w.myCreeps, ...w.enemies];
    return all.length === w.spacing.creeps.length && all.every(c => w.spacing.creeps.includes(c)) &&
        new Set(all.map(c => c?.id)).size === all.length &&
        new Set(all.filter(living).map(c => `${c.x},${c.y}`)).size === all.filter(living).length &&
        all.every(c => c && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 128 && position(c) &&
            typeof c.getRangeTo === 'function' && typeof c.my === 'boolean' &&
            w.myCreeps.includes(c) === c.my && Number.isFinite(c.hits) && Number.isFinite(c.hitsMax) &&
            c.hitsMax > 0 && c.hits >= 0 && c.hits <= c.hitsMax && Number.isFinite(c.fatigue) && c.fatigue >= 0 &&
            Array.isArray(c.body) && c.body.length <= 50 && c.body.every(p => p &&
                ['move', 'tough', 'attack', 'ranged_attack', 'heal'].includes(p.type) &&
                Number.isFinite(p.hits) && p.hits >= 0 && p.hits <= 100));
}

// Stronger than access alone: preserve the bound healer's current band to
// every weapon for all four move/stay pairs. Selected outsider demand instead
// invalidates ownership; uncoordinated outsider movement is not guaranteed.
export function engagementSupport(friends, ids, healerId, moves) {
    if (!secondaryStepSupport(friends, ids, moves)) return false;
    const h = friends.find(c => c.id === healerId);
    if (!h || !part(h, 'heal')) return false;
    return ids.filter(id => id !== healerId).every(id => {
        const c = friends.find(c => c.id === id), b = band(range(c, h));
        return b !== null && [c, moves.get(id) ?? c].every(p =>
            [h, moves.get(healerId) ?? h].every(q => range(p, q) <= b));
    });
}

export function planSupportLocked(w, previous = null) {
    const work = { neighbours: 0, subsets: 0, searches: 0 };
    // Nested bindings/snapshots are read-only; updates replace them, never mutate them.
    let state = previous ? { ...previous } : { phase: 'Ordinary', lastTick: null };
    if (Number.isInteger(w.tick) && state.lastTick !== null && w.tick < state.lastTick)
        state = { phase: 'Ordinary', lastTick: null };
    const transitions = [];
    const change = (phase, reason) => {
        if (state.phase !== phase) transitions.push({ from: state.phase, to: phase, reason });
        if (phase === 'Recover' && state.phase !== 'Recover') state.recoveryAt = w.tick;
        state.phase = phase; state.reason = reason;
    };
    let currentProposed = null;
    const reply = (moves = null, priorityIds = []) => {
        const b = state.memberIds ? state : previous?.memberIds ? previous : null;
        return { state, moves, priorityIds, transitions, work, proposed: currentProposed,
            binding: b ? { squadId: b.squadId, memberIds: b.memberIds, healerId: b.healerId } : null };
    };
    if (!valid(w)) {
        state.clearCount = 0;
        if (state.memberIds) {
            change('Spent', 'unsupported-observation');
            const moves = empty(state.memberIds);
            // Completeness/membership/centre failures fence the batch, not an
            // independently observable emergency or already explicit owner.
            const usable = c =>
                c && position(c) && typeof c.getRangeTo === 'function' && Array.isArray(c.body) &&
                c.body.length <= 50 && c.body.every(p => p && typeof p.type === 'string');
            // Partial known data can YIELD a priority, never admit a step or
            // establish absence/clearance. An unrelated unusable observation
            // cannot erase an independently observed emergency.
            const friends = Array.isArray(w.myCreeps) && w.myCreeps.length <= 14 ? w.myCreeps.filter(usable).filter(living) : [];
            const foes = Array.isArray(w.enemies) && w.enemies.length <= 14 ? w.enemies.filter(usable).filter(living) : [];
            const priority = [...new Set([...state.memberIds.filter(id => owner(w, id)),
                ...movementPriority(w, state.memberIds.map(id => friends.find(c => c.id === id)), state.healerId, friends, foes)])];
            for (const id of priority) moves.delete(id);
            return reply(moves, priority);
        }
        state.reason = 'unsupported-observation'; return reply();
    }
    const duplicate = w.tick === state.lastTick, consecutive = state.lastTick === w.tick - 1;
    const foes = w.enemies.filter(living), friends = w.myCreeps.filter(living);
    const nominated = w.membership.squads.find(s => s.id === w.squadId);
    if (!state.memberIds) {
        if (!nominated || !Array.isArray(nominated.memberIds) || nominated.memberIds.length !== 4 ||
            new Set(nominated.memberIds).size !== 4) return reply();
        const group = nominated.memberIds.map(id => friends.find(c => c.id === id));
        if (group.some(c => !c) || group.filter(c => pure(c, 'heal')).length !== 1 ||
            group.filter(c => pure(c, 'ranged_attack')).length !== 3) return reply();
        const weapons = group.filter(c => pure(c, 'ranged_attack'));
        const anchor = uniqueBest(weapons, c => [weapons.reduce((n, p) => n + range(c, p), 0), range(c, w.centre)]);
        if (!anchor || !foes.some(e => range(e, anchor) <= 5)) return reply();
        state = { ...state, memberIds: [...nominated.memberIds], squadId: nominated.id,
            healerId: group.find(c => pure(c, 'heal')).id, anchor: point(anchor), centreId: w.centre.id,
            centre: point(w.centre), startedAt: w.tick, clearCount: 0, stalled: 0, targetId: null };
        change('Assess', 'contact');
    }
    const ids = state.memberIds, group = ids.map(id => friends.find(c => c.id === id));
    let moves = empty(ids);
    // Compute priority before any coordinated command, even when spent.
    const priority = movementPriority(w, group, state.healerId, friends, foes);
    const yieldPriority = () => { for (const id of priority) moves.delete(id); return reply(moves, priority); };
    if (duplicate) { state.reason = 'duplicate-observation'; return yieldPriority(); }
    const oldTick = state.lastTick; state.lastTick = w.tick;
    const remember = () => { state.observed = snapshots(group.filter(Boolean)); return yieldPriority(); };
    if (state.phase === 'Spent') {
        // Unknown absence is not a casualty. Keep the original binding; only
        // confirmed dead members may lack a current position for clearance.
        const clear = ids.every(id => w.myCreeps.some(c => c.id === id) ||
            Array.isArray(w.membership.members) && w.membership.members.some(m => m?.id === id && m.presence === 'dead')) &&
            !foes.some(e => armed(e) && (range(e, state.anchor) <= 5 ||
                group.some(c => c && range(e, c) <= 5)));
        state.clearCount = clear ? (consecutive ? state.clearCount + 1 : 1) : 0;
        if (state.clearCount >= 2) {
            // Rearm does not execute a new contact or an ordinary chase now.
            state = { phase: 'Ordinary', lastTick: w.tick, reason: 'rearmed' };
            return yieldPriority();
        }
        state.reason = 'spent-contact'; return remember();
    }
    if (!nominated || nominated.memberIds.length !== 4 || ids.some(id => !nominated.memberIds.includes(id)) ||
        w.centre.id !== state.centreId || !same(w.centre, state.centre)) change('Spent', 'binding-changed');
    else if (w.tick - state.startedAt >= 24) change('Spent', 'deadline');
    if (state.phase === 'Spent') return remember();
    const healing = group.filter(Boolean).find(c => c.id === state.healerId);
    const healAction = healing ? selectHealingDecision(healing, friends.filter(c => c.hits < c.hitsMax)).action : null;
    const competing = healAction && !ids.includes(healAction.target.id);
    if (competing && !priority.includes(state.healerId)) priority.push(state.healerId);
    const capable = group.every(c => c && part(c, 'move') &&
        (c.id === state.healerId ? pure(c, 'heal') : pure(c, 'ranged_attack')));
    const supported = capable && engagementSupport(friends, ids, state.healerId, moves);
    const deteriorated = consecutive && state.observed?.some(old => {
        const c = group.find(c => c?.id === old.id);
        return !c || exposure(c, foes).length && (c.hits < old.hits || part(c, 'ranged_attack') < old.ranged ||
            part(c, 'heal') < old.heal || part(c, 'move') < old.move);
    });
    const uncovered = group.some(c => c && c.hits < c.hitsMax && exposure(c, foes).length && healAction?.target.id !== c.id);
    state.signals = { deteriorated: Boolean(deteriorated), uncovered,
        concentrated: group.some(c => c && exposure(c, foes).length > 1) };
    if (priority.length) change('Recover', competing ? 'competing-healing' : 'movement-priority');
    else if (!supported) change('Recover', 'support-lost');
    else if (deteriorated || uncovered) change('Recover', 'observed-pressure');
    // A firing-line hold is purposeful, not stalled travel. Only a preceding
    // movement request/blocked advance makes unchanged observations count.
    if (consecutive && state.awaitingProgress && state.observed?.length === 4)
        state.stalled = state.observed.every(old => group.some(c => c && c.id === old.id && same(c, old))) ? state.stalled + 1 : 0;
    else if (oldTick !== null && !consecutive) state.stalled = 0;
    if (state.stalled >= 3) change('Spent', 'no-displacement');
    if (state.phase === 'Recover' && w.tick - state.recoveryAt >= 5) change('Spent', 'recovery-timeout');
    if (state.phase === 'Spent' || priority.length || !supported) return remember();
    const weapons = group.filter(c => c.id !== state.healerId);
    let target = foes.find(e => e.id === state.targetId && range(e, state.anchor) <= 5);
    if (!target) target = uniqueBest(foes.filter(e => range(e, state.anchor) <= 5), e =>
        [-weapons.filter(c => range(c, e) <= 3).length, range(e, w.centre)]);
    state.targetId = target?.id ?? null;
    if (!target && state.phase !== 'Recover') change('Recover', 'contact-ended');
    const recovering = state.phase === 'Recover';
    const advance = !recovering && target && weapons.some(c => range(c, target) > 3);
    // Do not freeze a live firing line just because its members do not move.
    state.awaitingProgress = Boolean(advance || recovering);
    if (state.phase === 'Assess' && transitions.length) { state.awaitingProgress = false; return remember(); }
    if (state.phase === 'Assess') change('Engage', 'supported');
    const defenders = friends.filter(c => !ids.includes(c.id) && !owner(w, c.id) && range(c, w.centre) <= 3);
    const defence = defenders.filter(armed).filter(c => defenders.some(h => part(h, 'heal') && range(c, h) <= 3)).length >= 2;
    if (!defence) { change('Recover', 'centre-defence-unavailable'); return remember(); }
    const centroid = { x: weapons.reduce((n, c) => n + c.x, 0) / 3, y: weapons.reduce((n, c) => n + c.y, 0) / 3 };
    const proposed = empty(ids);
    if (advance || recovering) for (const c of group) {
        const current = exposure(c, foes);
        if (!recovering && c.id !== state.healerId && range(c, target) <= 3) continue;
        if (c.fatigue !== 0) continue;
        const candidates = [];
        // Reuse production's eight-cell terrain/occupancy evaluator. Threat
        // rules here are explicit: an offensive weapon may enter ONE ranged
        // envelope; a healer may not. This is not rangedRetreat semantics.
        localRetreatStep(c, [], w.spacing, p => {
            work.neighbours++;
            const nextExposure = exposure(p, foes);
            if (range(p, state.anchor) > 5 || foes.some(e => part(e, 'attack') && range(p, e) <= 1)) return false;
            if (c.id === state.healerId && nextExposure.some(e => !current.includes(e))) return false;
            if (recovering) {
                if (nextExposure.some(e => !current.includes(e)) || nextExposure.length >= current.length) return false;
            } else {
                if (nextExposure.length > 1 || current.length > 1) return false;
                const goal = c.id === state.healerId ? centroid : target;
                if (range(p, goal) >= range(c, goal)) return false;
            }
            candidates.push(p); return false; // Inspect all eight, never a second scan.
        });
        const goal = c.id === state.healerId ? centroid : target;
        const chosen = uniqueBest(candidates, p => [recovering ? exposure(p, foes).length : range(p, goal),
            Math.abs(p.x - c.x) + Math.abs(p.y - c.y)]);
        if (chosen) proposed.set(c.id, chosen);
    }
    // Full proposals must pass first; never salvage a support/band failure.
    if (!engagementSupport(friends, ids, state.healerId, proposed)) {
        change('Recover', 'proposed-support-loss'); return remember();
    }
    const selected = selectSecondaryTravelSteps(friends, ids, proposed, w.spacing.creeps);
    moves = selected.moves; work.subsets = selected.examined;
    currentProposed = proposed;
    state.proposed = [...proposed];
    state.reason = recovering ? 'recover-step-or-hold' : advance ? 'supported-advance-or-hold' : 'supported-firing-line';
    return remember();
}

// Current production data only: no fabricated completeness, terrain cache,
// replacement members or ID-based nomination. Ambiguous eligible squads decline.
export function planSupportLockedTick(observation, membership, centre, previous, {
    terrainAt, engagements, escort, pair, externalMoves = new Map(),
} = {}) {
    const { tick, creeps, myCreeps, enemies } = observation;
    const complete = Array.isArray(creeps) && creeps.length <= 28 &&
        creeps.every(c => c && typeof c.my === 'boolean') &&
        Array.isArray(myCreeps) && Array.isArray(enemies) &&
        creeps.filter(c => c.my).length === myCreeps.length &&
        creeps.filter(c => !c.my && c.hits > 0).length === enemies.length &&
        [...myCreeps, ...enemies].every(c => creeps.includes(c));
    const eligible = Array.isArray(membership?.squads) && membership.squads.length <= 3
        ? membership.squads.filter(s => Array.isArray(s?.memberIds) && s.memberIds.length === 4 &&
            Array.isArray(membership.members) && membership.members.length <= 14 &&
            s.memberIds.filter(id => membership.members.some(m => m?.id === id && m.role === 'ranged')).length === 3 &&
            s.memberIds.filter(id => membership.members.some(m => m?.id === id && m.role === 'healer')).length === 1) : [];
    return planSupportLocked({ tick, myCreeps, enemies, observationComplete: complete,
        membership, centre, squadId: previous?.squadId ?? (eligible.length === 1 ? eligible[0].id : null),
        spacing: { creeps: complete ? [...myCreeps, ...enemies] : [], terrainAt },
        engagements, ...(escort ? { escort } : {}), ...(pair ? { pair } : {}), externalMoves }, previous);
}

// Four pinned membership slots, not four repeated IDs/paths. Correlate slots
// with the existing squad-membership evidence and actions by actor ID.
export function engagementDiagnostic({ state: s, moves, priorityIds, work, proposed, binding }) {
    return { phase: s.phase, reason: s.reason ?? null, squadId: binding?.squadId ?? null,
        startedAt: s.startedAt ?? null, deadline: s.startedAt === undefined ? null : s.startedAt + engagementLimits.lifetime,
        anchor: s.anchor ?? null, targetId: s.targetId ?? null,
        healerSlot: binding?.memberIds.indexOf(binding.healerId) ?? null,
        stalled: s.stalled ?? 0, recoveryAt: s.recoveryAt ?? null, clearCount: s.clearCount ?? 0,
        work, actors: (binding?.memberIds ?? []).slice(0, 4).map((id, slot) => ({ slot,
            owner: priorityIds.includes(id) ? 'priority' : moves?.has(id) ? 'engagement' : 'ordinary',
            proposed: proposed?.get(id) ?? null,
            admitted: moves?.get(id) ?? null })) };
}

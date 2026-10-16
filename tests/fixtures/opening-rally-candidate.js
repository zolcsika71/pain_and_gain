// Test-only proposal. No runtime imports this module. This is one opening gate,
// not collision arbitration, a formation controller, or a damage prediction.
import { hasFunctioningPart as has } from '../../src/tactics/body.js';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const rallyLimits = { entryRange: 8, zone: 3, danger: 5, observations: 2,
    melee: 3, ranged: 3, healer: 2, roster: 14 };
export function rallyRole(c) {
    const types = new Set(c.body.map(p => p.type));
    if (has(c, 'attack') && !types.has('heal') && !types.has('ranged_attack')) return 'melee';
    if (has(c, 'ranged_attack') && !types.has('heal') && !types.has('attack')) return 'ranged';
    if (has(c, 'heal') && !types.has('attack') && !types.has('ranged_attack')) return 'healer';
    return null;
}

export function rallyReadiness(members, anchor) {
    const local = members.filter(c => range(c, anchor) <= rallyLimits.zone);
    const healers = local.filter(c => rallyRole(c) === 'healer');
    const melee = local.filter(c => rallyRole(c) === 'melee' && healers.some(h => range(c, h) <= 3));
    const ranged = local.filter(c => rallyRole(c) === 'ranged' && melee.some(m => range(c, m) <= 3));
    const accessibleHealers = healers.filter(h => melee.some(m => range(h, m) <= 3));
    return { melee: melee.length, ranged: ranged.length, healer: accessibleHealers.length,
        ready: melee.length >= 3 && ranged.length >= 3 && accessibleHealers.length >= 2 };
}

export function planOpeningRally({ tick, myCreeps, enemies, flags }, previous = null, escort = null) {
    let state = !previous || tick <= previous.lastTick
        ? { phase: 'idle', startedAt: null, anchor: null, members: [], roles: {}, spentWaits: {} } : previous;
    state = { ...state, lastTick: tick, spentWaits: { ...state.spentWaits } };
    const moves = new Map();
    const finish = reason => ({ state: { ...state, phase: 'finished', reason }, moves, reason });
    if (state.phase === 'finished') return { state, moves, reason: 'rally-finished' };
    const first = flags[0];
    if (myCreeps.length > rallyLimits.roster || enemies.length > rallyLimits.roster ||
        new Set([...myCreeps, ...enemies].map(c => c.id)).size !== myCreeps.length + enemies.length ||
        [...myCreeps, ...enemies].some(c => !Array.isArray(c.body) || c.body.length > 50)) return finish('unsupported-roster');
    if (!first || first.my !== undefined) return finish('objective-no-longer-neutral');
    if (escort) return finish('escort-priority');
    const members = myCreeps.filter(c => c.my && c.hits > 0 && rallyRole(c));
    if (state.members.some(id => !members.some(c => c.id === id))) return finish('rally-member-lost');
    if (state.members.some(id => rallyRole(members.find(c => c.id === id)) !== state.roles[id])) return finish('rally-role-changed');
    if (members.some(c => c.hits !== c.hitsMax || c.fatigue !== 0 || !has(c, 'move'))) return finish('support-unavailable');
    if (['melee', 'ranged', 'healer'].some(role => members.filter(c => rallyRole(c) === role).length < rallyLimits[role])) return finish('missing-quorum');
    if (enemies.some(e => !e.my && e.hits > 0 &&
        (range(e, first) <= rallyLimits.danger || members.some(c => range(e, c) <= rallyLimits.danger) ||
            state.anchor && range(e, state.anchor) <= rallyLimits.danger))) return finish('enemy-approach');
    if (!state.anchor) {
        const leader = members.filter(c => rallyRole(c) !== 'healer').sort((a, b) =>
            range(a, first) - range(b, first) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
        if (range(leader, first) > rallyLimits.entryRange) return { state, moves, reason: 'outside-rally-band' };
        state = { ...state, phase: 'rally', startedAt: tick,
            anchor: { x: leader.x, y: leader.y }, anchorActorId: leader.id,
            members: members.map(c => c.id).sort(), roles: Object.fromEntries(members.map(c => [c.id, rallyRole(c)])) };
    }
    const readiness = rallyReadiness(members, state.anchor);
    if (readiness.ready) return { ...finish('rally-ready'), readiness };
    if (tick - state.startedAt >= rallyLimits.observations) return { ...finish('rally-timeout'), readiness };
    for (const c of members) {
        const hold = range(c, state.anchor) <= 3;
        moves.set(c.id, { target: hold ? null : state.anchor,
            reason: hold ? 'opening-rally-wait' : 'opening-rally-approach' });
        // Reuse, do not stack with, the existing two-pause allowance. The test
        // runner hands this count into the FIRST subsequent melee engagement.
        if (hold && rallyRole(c) === 'melee') state.spentWaits[c.id] = Math.min(2, (state.spentWaits[c.id] ?? 0) + 1);
    }
    return { state, moves, readiness, reason: 'opening-rally' };
}

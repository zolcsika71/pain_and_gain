// Offline equal-range pursuit experiment; never imported by Arena runtime.
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { hasFunctioningPart as has } from '../../src/tactics/body.js';

export function sharedWeapons(actor, target, friends) {
    return friends.filter(f => f.id !== actor.id && f.my && f.hits > 0 && !has(f, 'heal') &&
        (has(f, 'attack') && f.getRangeTo(target) <= 1 ||
            has(f, 'ranged_attack') && f.getRangeTo(target) <= 3)).length;
}

export function sharedTargetPlan(actor, enemies, flag, previous, friends, escort = null) {
    const baseline = selectMovementPlan(actor, enemies, flag, previous, friends);
    // Only exchange identical-range pure ranged opponents while healing is
    // already accessible. Never reinterpret close-melee pauses or pursuit/rejoin
    // tracking. All existing holds, limits, spent waits and fallbacks take priority.
    if (escort || baseline.reason !== 'combat-approach' || previous?.rejoin || previous?.pursuit ||
        !actor.my || actor.hits <= 0 || actor.fatigue !== 0 || !has(actor, 'move') ||
        !has(actor, 'attack') || actor.body.some(p => ['heal', 'ranged_attack'].includes(p.type)) ||
        friends.length > 14 || enemies.length > 14 ||
        [...friends, ...enemies].some(c => c.body.length > 50)) return baseline;
    const pureRanged = e => has(e, 'ranged_attack') && !e.body.some(p => ['attack', 'heal'].includes(p.type));
    const original = baseline.target, distance = actor.getRangeTo(original);
    if (distance > 5 || !pureRanged(original) || sharedWeapons(actor, original, friends) ||
        !friends.some(h => h.my && h.hits > 0 && has(h, 'heal') && actor.getRangeTo(h) <= 3)) return baseline;
    const options = enemies.filter(e => !e.my && e.hits > 0 && pureRanged(e) &&
        actor.getRangeTo(e) === distance && sharedWeapons(actor, e, friends) > 0);
    options.sort((a, b) => sharedWeapons(actor, b, friends) - sharedWeapons(actor, a, friends) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const selected = options[0];
    return selected ? { ...baseline, target: selected,
        engagement: { ...baseline.engagement, id: selected.id }, reason: 'equal-range-shared-pursuit' } : baseline;
}

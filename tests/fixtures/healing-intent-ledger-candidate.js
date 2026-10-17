// Original test-side adapter inspired by accepted-intent accounting; no reference
// code copied. Never imported by Arena runtime. No command or effect simulation.
import { registerHooks } from 'node:module';
import { selectHealingDecision as productionDecision } from '../../src/tactics/healing.js';
import { closingHealModifier } from '../../src/tactics/healer-closing.js';
import { executeTactics as baselineTactics, moveCreeps } from '../../src/arena/execute.js';

const executorUrl = new URL('../../src/arena/execute.js?generated-healing-ledger', import.meta.url).href;
const capacityUrl = new URL('../../src/tactics/healing.js?generated-healing-capacity', import.meta.url).href;
let active = null;
registerHooks({ resolve(specifier, context, next) {
    // Only this isolated executor instance substitutes selection. Movement and
    // every other production importer retain the original module unchanged.
    if (context.parentURL === executorUrl && specifier === '../tactics/healing.js')
        return { url: import.meta.url, shortCircuit: true };
    return next(specifier, context);
}, load(url, context, next) {
    const result = next(url, context);
    if (url !== capacityUrl) return result;
    // Expose the original private constants only in this in-memory test module.
    // No runtime file edit and no second set of power constants to drift.
    const source = typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source);
    return { ...result, source: `${source}\nexport { healPower, rangedHealPower };\n` };
} });
const { healPower, rangedHealPower } = await import(capacityUrl);

const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const types = new Set(['move', 'tough', 'heal', 'attack', 'ranged_attack', 'work', 'carry']);
export const knownHealingActor = (c, ownership = true) => c && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 128 &&
    c.my === ownership && c.exists === true && Number.isInteger(c.x) && Number.isInteger(c.y) &&
    c.x >= 0 && c.x < 100 && c.y >= 0 && c.y < 100 &&
    Number.isFinite(c.hits) && Number.isFinite(c.hitsMax) && c.hitsMax > 0 && c.hits >= 0 && c.hits <= c.hitsMax &&
    Array.isArray(c.body) && c.body.length <= 50 && c.body.every(p => p && types.has(p.type) &&
        Number.isFinite(p.hits) && p.hits >= 0 && p.hits <= 100) && typeof c.getRangeTo === 'function' &&
    (c.effects == null || Array.isArray(c.effects) && c.effects.length === 0);
const healParts = c => c.body.filter(p => p.type === 'heal' && p.hits > 0).length;
const known = c => knownHealingActor(c);
export const pureHealer = c => known(c) && c.hits > 0 && healParts(c) > 0 &&
    !c.body.some(p => p.type === 'attack' || p.type === 'ranged_attack');

export function createHealingLedger(friends, executionOrder, flags) {
    const modifier = closingHealModifier(flags);
    const supported = modifier !== null && Array.isArray(friends) && friends.length <= 14 && friends.every(known) &&
        new Set(friends.map(c => c.id)).size === friends.length && Array.isArray(executionOrder) &&
        executionOrder.length <= 14 && executionOrder.every(c => friends.includes(c)) &&
        new Set(executionOrder.map(c => c.id)).size === executionOrder.length;
    const byId = new Map(friends.map(c => [c.id, c]));
    const allocated = new Map(), accepted = new Map(), seen = new Set(), unknown = [];
    const work = { selections: 0, rankingViews: 0, creditedActors: 0, searches: 0 };
    function capacity(actor, target, method) {
        if (!supported || !executionOrder.includes(actor) || !known(actor) || !known(target) ||
            actor.hits <= 0 || target.hits <= 0 || !healParts(actor)) return null;
        const range = distance(actor, target);
        if (actor.getRangeTo(target) !== range || !(method === 'heal' && range <= 1 ||
            method === 'rangedHeal' && range > 1 && range <= 3)) return null;
        return healParts(actor) * (method === 'heal' ? healPower : rangedHealPower) * modifier;
    }
    return {
        supported, modifier, work, capacity,
        select(actor, injured) {
            work.selections++;
            if (!supported || !pureHealer(actor) || !executionOrder.includes(actor) ||
                !Array.isArray(injured) || injured.length > 14 || injured.some(c => !friends.includes(c)))
                return productionDecision(actor, injured);
            // Ranking-only deficit projections, never observed health. The
            // unchanged selector supplies eligibility, capacities, range/ID ties
            // and method. Its action is mapped back to the ORIGINAL observation.
            const views = new Map();
            for (const c of new Set([actor, ...injured])) {
                work.rankingViews++;
                const residual = Math.max(0, c.hitsMax - c.hits - (allocated.get(c.id) ?? 0));
                views.set(c, { ...c, hitsMax: c.hits + residual });
            }
            const decision = productionDecision(views.get(actor), injured.map(c => views.get(c)));
            if (!decision.action) return decision;
            return { ...decision, action: { ...decision.action, target: byId.get(decision.action.target.id) } };
        },
        record(actorId, method, targetId, returnCode) {
            if (!['heal', 'rangedHeal'].includes(method)) return;
            // A repeated reporter callback cannot count another actor action.
            if (seen.has(actorId)) return;
            seen.add(actorId);
            if (typeof returnCode !== 'number' || returnCode !== 0) return;
            const actor = byId.get(actorId), target = byId.get(targetId);
            const amount = actor && target ? capacity(actor, target, method) : null;
            if (amount === null) { unknown.push({ actorId, targetId, method }); return; }
            accepted.set(targetId, (accepted.get(targetId) ?? 0) + amount);
            // Hybrids keep independent production decisions and cannot fund the
            // pure-healer ledger. Metrics still include their known accepted calls.
            if (pureHealer(actor)) {
                allocated.set(targetId, (allocated.get(targetId) ?? 0) + amount);
                work.creditedActors++;
            }
        },
        result() {
            const targets = [...accepted].map(([id, scheduled]) => ({ id, scheduled,
                deficit: byId.get(id).hitsMax - byId.get(id).hits,
                capped: Math.min(byId.get(id).hitsMax - byId.get(id).hits, scheduled) }));
            return { supported, modifier, allocated: Object.fromEntries(allocated), targets,
                knownCapped: targets.reduce((sum, t) => sum + t.capped, 0),
                total: unknown.length ? null : targets.reduce((sum, t) => sum + t.capped, 0),
                unknown: [...unknown], work: { ...work } };
        },
    };
}

// This export is the tagged executor's import, not a second healing policy.
export function selectHealingDecision(actor, injured) {
    return active ? active.select(actor, injured) : productionDecision(actor, injured);
}

export async function runHealingTick(world, { enabled = false, order = world.friends,
    injured = world.friends.filter(c => c.hits > 0 && c.hits < c.hitsMax), movement = false, adapter = null } = {}) {
    const execute = enabled || adapter ? (await import(executorUrl)).executeTactics : baselineTactics;
    if (active) throw Error('Nested ledger execution is unsupported');
    const ledger = createHealingLedger(world.friends, order, world.flags), records = [];
    const reporter = { decision(d) { records.push(d); return d; },
        attempt(d, index, action, rc) {
            records.push({ type: 'attempt', actorId: d.actorId, method: action.method,
                targetId: action.target.id ?? null, returnCode: rc });
            ledger.record(d.actorId, action.method, action.target.id, rc);
            adapter?.record(d.actorId, action.method, action.target.id, rc);
        } };
    const before = world.calls.length;
    try {
        // Movement executes with its original selector and owners BEFORE the
        // test-side healing substitution, exactly as in production tick flow.
        if (movement) moveCreeps(order, world.enemies, world.centre, new Map(), new Map(),
            world.escort ?? null, null, reporter, false, world.pair ?? null,
            { creeps: [...world.friends, ...world.enemies], terrainAt: () => 0 });
        active = adapter ?? (enabled ? ledger : null);
        execute(order, world.enemies, injured, reporter, world);
    } finally { active = null; }
    return { calls: world.calls.slice(before), records, ...ledger.result() };
}

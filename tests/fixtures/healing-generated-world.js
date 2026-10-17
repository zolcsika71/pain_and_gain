import assert from 'node:assert/strict';
import { fixture } from './secondary-generated-world.js';

// All observations are generated, distinct-cell inputs. Calls append evidence
// only: no HP, parts, movement, enemy reactions or action arbitration is resolved.
function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
}
function world(specs, { modifiers = 0, returns = {}, enemies = [], flags = null } = {}) {
    const calls = [];
    const make = ({ id, x, y, parts = { move: 1, tough: 9 }, deficit = 0, body: suppliedBody, ...extra }, my = true) => {
        const body = suppliedBody ? suppliedBody.map(p => ({ ...p })) : Object.entries(parts)
            .flatMap(([type, count]) => Array.from({ length: count }, () => ({ type, hits: 100 })));
        let missing = deficit;
        for (const p of body) { const loss = Math.min(p.hits, missing); p.hits -= loss; missing -= loss; }
        assert.equal(missing, 0, 'Generated injury must fit the supplied body');
        const c = { id, x, y, my, exists: true, fatigue: 0, hitsMax: body.length * 100,
            hits: body.reduce((sum, p) => sum + p.hits, 0), body, ...extra,
            getRangeTo(p) { return Math.max(Math.abs(this.x - p.x), Math.abs(this.y - p.y)); } };
        for (const method of ['heal', 'rangedHeal', 'attack', 'rangedAttack', 'moveTo', 'move']) c[method] = target => {
            calls.push({ actor: id, method, target: target?.id ?? null,
                ...(typeof target === 'number' ? { direction: target } : { x: target.x, y: target.y }) });
            const result = Object.hasOwn(returns, id) ? returns[id] : 0;
            return typeof result === 'function' ? result({ actor: c, method, target }) : result;
        };
        c.findPathTo = () => { throw Error('No path search permitted'); };
        return freeze(c);
    };
    const friends = specs.map(s => make(s)), foes = enemies.map(s => make(s, false));
    assert.equal(new Set([...friends, ...foes].map(c => `${c.x},${c.y}`)).size, friends.length + foes.length);
    const inventory = flags ?? fixture().flags.map(f => ({ ...f, exists: true,
        my: f.effectType === 'eff_heal_modifier' ? modifiers-- > 0 : f.my }));
    return { tick: 1, friends: freeze(friends), myCreeps: friends, enemies: freeze(foes), flags: freeze(inventory),
        creeps: freeze([...friends, ...foes]), centre: freeze({ id: 'centre', x: 40, y: 40 }), calls };
}
const healer = (id, x, y, n = 1, extra = {}) => ({ id, x, y, parts: { move: n, heal: n }, ...extra });
const target = (id, x, y, deficit) => ({ id, x, y, deficit });
const heals = r => r.calls.filter(c => ['heal', 'rangedHeal'].includes(c.method)).map(c => [c.actor, c.method, c.target]);
const total = r => Object.fromEntries(r.targets.map(t => [t.id, t.scheduled]));
function duplicateWorld(options) {
    return world([healer('h1', 10, 10), healer('h2', 11, 10), target('a', 10, 11, 4), target('b', 11, 11, 4)], options);
}

export { freeze, world, healer, target, heals, total, duplicateWorld };

import { world, healer, target, duplicateWorld, freeze } from './healing-generated-world.js';

function protectedWorld(modifiers = 0) {
    return world([healer('h1', 10, 10, 6), healer('h2', 15, 10, 6), healer('h3', 16, 10, 6),
        { ...target('a', 10, 11, 144), parts: { move: 8, attack: 8 } },
        { ...target('b', 15, 11, 60), parts: { move: 6, ranged_attack: 6 } },
        { ...target('c', 16, 11, 60), parts: { move: 6, ranged_attack: 6 } },
        ...Array.from({ length: 8 }, (_, i) => ({ id: `outside${i}`, x: 70 + i, y: 70,
            parts: i < 3 ? { move: 8, attack: 8 } : i < 6 ? { move: 6, ranged_attack: 6 } : { move: 1 } }))],
    { modifiers, enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 8, attack: 8 } }] });
}
const cases = [
    ['small wounds', () => duplicateWorld(), [4, 8, 8, 8]],
    ['necessary focus', () => world([healer('h1', 10, 10), healer('h2', 11, 10),
        target('a', 10, 11, 40), target('b', 11, 11, 3)]), [24, 24, 24, 24]],
    ['direct and ranged', () => world([healer('h1', 10, 10), healer('h2', 11, 10),
        target('a', 10, 11, 12), target('b', 13, 11, 20)]), [12, 16, 16, 16]],
    ['asymmetric reach', () => world([healer('flexible', 10, 10), healer('constrained', 11, 10),
        target('a', 10, 11, 10), target('b', 7, 10, 9)]), [10, 10, 14, 14]],
    ['greedy 30 to 26 counterexample', () => world([healer('h1', 10, 10), healer('h2', 11, 10), healer('h3', 13, 10),
        target('a', 10, 11, 20), target('b', 12, 11, 10)]), [30, 26, 30, 30]],
    ['exposed small wound forbids diversion', () => duplicateWorld({
        enemies: [{ id: 'foe', x: 9, y: 11, parts: { move: 1, attack: 1 } }],
    }), [4, 8, 8, 4]],
    ['exposed asymmetric target preserves nominal excess', () => world([healer('flexible', 10, 10), healer('constrained', 11, 10),
        target('a', 10, 11, 10), target('b', 7, 10, 9)],
    { enemies: [{ id: 'foe', x: 11, y: 11, parts: { move: 1, attack: 1 } }] }), [10, 10, 14, 10]],
    ['full roster headroom with exposed baseline allocation retained', () => protectedWorld(), [132, 192, 192, 192]],
    ['two exposed allies retain SEPARATE baseline floors', () => {
        const w = protectedWorld();
        const foe = world([], { enemies: [{ id: 'second', x: 14, y: 11, parts: { move: 8, attack: 8 } }] }).enemies[0];
        w.enemies = freeze([...w.enemies, foe]); w.creeps = freeze([...w.friends, ...w.enemies]);
        return w;
    }, [132, 192, 192, 132]],
    ['protected headroom with one owned heal modifier', () => protectedWorld(1), [114, 162, 162, 162]],
    ['protected headroom with two owned heal modifiers', () => protectedWorld(2), [96, 108, 108, 108]],
    ['damaged HEAL and self injury', () => world([
        healer('h1', 10, 10, 1, { body: [{ type: 'move', hits: 100 }, { type: 'heal', hits: 0 }, { type: 'heal', hits: 1 }] }),
        healer('h2', 11, 10), target('a', 10, 11, 15), target('b', 11, 11, 4)]), [24, 24, 24, 24]],
];
for (const count of [0, 1, 2]) cases.push([`existing modifier case ${count}`, () => world([
    healer('h1', 10, 10), healer('h2', 11, 10), target('a', 10, 11, 12), target('b', 11, 11, 2)],
{ modifiers: count }), count === 0 ? [12, 14, 14, 14] : [12, 12, 12, 12]]);

export { protectedWorld, cases as healingOracleCases };

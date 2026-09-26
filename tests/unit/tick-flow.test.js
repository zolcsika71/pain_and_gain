import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Replace only Arena-provided imports; all project modules remain real.
const arenaModules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = prototype => globalThis.__painAndGainArenaObjects.get(prototype);'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({
    resolve(specifier, context, nextResolve) {
        const source = arenaModules.get(specifier);
        if (source) {
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});

const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

test('runTick observes, selects the first flag, moves owned creeps, then applies compatible tactics', () => {
    const calls = [];
    const firstFlag = { id: 'first' };
    const secondFlag = { id: 'second' };

    function creep(id, x, y, my, hits, parts) {
        const unit = {
            id, x, y, my, hits, hitsMax: 100,
            body: parts.map(type => ({ type, hits: 10 })),
            getRangeTo(target) {
                return Math.max(Math.abs(x - target.x), Math.abs(y - target.y));
            },
        };
        for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
            unit[method] = target => calls.push([id, method, target]);
        }
        return unit;
    }

    const healer = creep('healer', 0, 0, true, 100, ['heal', 'ranged_attack']);
    const damagedAlly = creep('ally', 1, 0, true, 50, ['attack']);
    const enemy = creep('enemy', 1, 1, false, 100, ['attack']);
    globalThis.__painAndGainArenaObjects = new Map([
        [ScoreFlag, [firstFlag, secondFlag]],
        [Creep, [healer, damagedAlly, enemy]],
    ]);

    try {
        runTick();
    } finally {
        delete globalThis.__painAndGainArenaObjects;
    }

    assert.deepEqual(calls, [
        ['healer', 'moveTo', firstFlag],
        ['ally', 'moveTo', firstFlag],
        ['healer', 'heal', damagedAlly],
        ['healer', 'rangedAttack', enemy],
        ['ally', 'attack', enemy],
    ]);
});

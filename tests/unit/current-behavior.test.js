import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFlag } from '../../src/strategy/objectives.js';
import { moveCreepsToFlag } from '../../src/arena/execute.js';

test('all supplied creeps move toward the first score flag in order', () => {
    const firstFlag = { x: 10, y: 20 };
    const otherFlag = { x: 30, y: 40 };
    const moves = [];
    const creeps = [
        { moveTo: target => moves.push(['first', target]) },
        { moveTo: target => moves.push(['second', target]) },
    ];

    moveCreepsToFlag(creeps, selectFlag([firstFlag, otherFlag]));

    assert.deepEqual(moves, [
        ['first', firstFlag],
        ['second', firstFlag],
    ]);
});

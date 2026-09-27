import test from 'node:test';
import assert from 'node:assert/strict';
import { logGameState, logMapOnce } from '../../src/debug/game-state.js';
import { buildId } from '../../src/debug/build-id.js';

test('game state is one JSON line with health, active parts and all flag ownership states', t => {
    const logger = t.mock.method(console, 'log', () => {});
    const unit = Object.freeze({
        id: 'ally', my: true, x: 10, y: 20, hits: 230, hitsMax: 400, fatigue: 2,
        body: Object.freeze([
            { type: 'heal', hits: 100 }, { type: 'heal', hits: 30 },
            { type: 'move', hits: 100 }, { type: 'attack', hits: 0 },
        ]),
    });
    const flags = [undefined, true, false].map((my, index) => Object.freeze({
        id: `flag-${index}`, my, x: index, y: 4,
        effectType: 'heal', scorePerTick: 4,
    }));

    logGameState({ tick: 12, creeps: [unit], flags }, flags[0]);

    assert.equal(logger.mock.callCount(), 1);
    const args = logger.mock.calls[0].arguments;
    assert.equal(args.length, 1);
    assert.equal(args[0].includes('\n'), false);
    const state = JSON.parse(args[0]);
    assert.equal(state.type, 'game-state');
    assert.equal(state.buildId, buildId);
    assert.equal(state.tick, 12);
    assert.equal(state.phase, 'before-actions');
    assert.equal(state.selectedFlagId, 'flag-0');
    assert.deepEqual(state.creeps, [{
        id: 'ally', my: true, x: 10, y: 20, hits: 230, hitsMax: 400, fatigue: 2,
        activeBodyParts: { heal: 2, move: 1 },
    }]);
    assert.deepEqual(state.flags, ['neutral', 'me', 'enemy'].map((owner, index) => ({
        id: `flag-${index}`, x: index, y: 4, owner, effectType: 'heal', scorePerTick: 4,
    })));
});

test('an empty observation still emits a tick snapshot', t => {
    const logger = t.mock.method(console, 'log', () => {});
    logGameState({ tick: 1, creeps: [], flags: [] }, undefined);
    assert.equal(logger.mock.callCount(), 1);
    assert.deepEqual(JSON.parse(logger.mock.calls[0].arguments[0]), {
        type: 'game-state', tick: 1, phase: 'before-actions', buildId,
        selectedFlagId: null, creeps: [], flags: [],
    });
});

test('map snapshot is logged once per match before actions and retries a failed capture', t => {
    const logger = t.mock.method(console, 'log', () => {});
    const errors = t.mock.method(console, 'error', () => {});
    let reads = 0;
    const readMap = () => ({ terrain: { width: 100, height: 100, rows: [] }, objects: [], read: ++reads });
    logMapOnce(99, () => { throw new Error('not ready'); });
    logMapOnce(99, readMap);
    logMapOnce(100, readMap);
    logMapOnce(1, readMap);
    assert.equal(reads, 2);
    assert.equal(errors.mock.callCount(), 1);
    assert.equal(logger.mock.callCount(), 2);
    assert.deepEqual(JSON.parse(logger.mock.calls[0].arguments[0]), {
        type: 'map-state', formatVersion: 1, tick: 99, phase: 'before-actions', buildId,
        map: { terrain: { width: 100, height: 100, rows: [] }, objects: [], read: 1 },
    });
});

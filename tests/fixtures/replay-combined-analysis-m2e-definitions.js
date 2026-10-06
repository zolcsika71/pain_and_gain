// Exact pure declarations copied from published 859f5ab score-analysis tests.
const buildId = 'a'.repeat(64);
function scoreItems(player1Score, player1Gain, player2Score, player2Gain) {
    return [
        { id: 'player1-score', name: 'Score', value: player1Score },
        { id: 'player1-gain', name: 'Gained this tick', value: player1Gain },
        { id: 'player2-score', name: 'Score', value: player2Score },
        { id: 'player2-gain', name: 'Gained this tick', value: player2Gain },
    ];
}

function replayObject(id, user, x, y = 10) {
    return { id, user, x, y, hits: 100, fatigue: 0 };
}

function scoreFrame(gameTime, values = [0, 0, 0, 0], options = {}) {
    return {
        gameTime,
        objects: options.objects ?? [replayObject('p1', 'player1', gameTime + 10),
            replayObject('p2', 'player2', gameTime + 20)],
        flags: options.flags ?? [{ id: 'flag', x: 5, y: 5, owner: 'me', scorePerTick: 3 }],
        ui: options.missingItems ? { version: 1, items: [] }
            : { version: options.uiVersion ?? 1, items: scoreItems(...values) },
        ...(options.marker === undefined ? {} : { marker: options.marker }),
    };
}

function gameState(tick, frame, oursSlot = 'player1', stateBuildId = buildId) {
    return {
        type: 'game-state', ...(stateBuildId === null ? {} : { buildId: stateBuildId }),
        tick, phase: 'before-actions', selectedFlagId: 'flag',
        creeps: frame.objects.map(object => ({ id: object.id, my: object.user === oursSlot,
            x: object.x, y: object.y, hits: object.hits, hitsMax: 100, fatigue: object.fatigue,
            activeBodyParts: { move: 1 } })),
        flags: frame.flags.map(flag => ({ ...flag, effectType: 'attack' })),
    };
}

function mapFixture() {
    return {
        arena: { name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000 },
        terrain: { width: 100, height: 100,
            rows: Array.from({ length: 100 }, () => Array(100).fill(0)) },
        objects: [{ type: 'ScoreFlag', id: 'flag', x: 5, y: 5,
            effectType: 'attack', scorePerTick: 3 }],
    };
}

function productionMetadata(ours = 'user-b') {
    return { game: { _id: 'game', user: ours,
        users: [{ _id: 'user-a', username: 'untrusted-a' },
            { _id: 'user-b', username: 'untrusted-b' }],
        codes: [{ _id: 'code-a', user: 'user-a', version: 1 },
            { _id: 'code-b', user: 'user-b', version: 1 }],
        game: { usersCode: ['code-a', 'code-b'], firstPlayerIndex: 0 },
    }, ok: 1 };
}

function actionDiagnostics(tick, actorId) {
    const target = { kind: 'creep', id: 'ally', x: 30, y: 10 };
    const movement = { type: 'action-decision', formatVersion: 1, buildId, tick, sequence: 0,
        recordId: `${tick}:0`, decisionId: `${tick}:0`, phase: 'movement', channel: 'movement',
        actorId, outcome: 'selected', reason: 'escort-approach',
        actions: [{ actionId: `${tick}:0#0`, method: 'moveTo', target }] };
    const attempt = { type: 'action-attempt', formatVersion: 1, buildId, tick, sequence: 1,
        recordId: `${tick}:1`, decisionId: `${tick}:0`, actionId: `${tick}:0#0`, phase: 'movement',
        channel: 'movement', actorId, method: 'moveTo', target, returnCode: 0 };
    const healing = { type: 'action-decision', formatVersion: 1, buildId, tick, sequence: 2,
        recordId: `${tick}:2`, decisionId: `${tick}:2`, phase: 'tactics', channel: 'healing',
        actorId, outcome: 'no-action', reason: 'no-injured-target-in-range', actions: [] };
    const combat = { type: 'action-decision', formatVersion: 1, buildId, tick, sequence: 3,
        recordId: `${tick}:3`, decisionId: `${tick}:3`, phase: 'tactics', channel: 'combat',
        actorId, outcome: 'no-action', reason: 'no-target-in-range', actions: [] };
    const coverage = { type: 'evidence-coverage', formatVersion: 1, buildId, tick, sequence: 4,
        recordId: `${tick}:4`, phase: 'after-actions', firstSequence: 0, lastSequence: 3,
        recordCount: 4, coveredTypes: ['membership-baseline', 'membership-change',
            'action-decision', 'action-attempt'],
        counts: { 'membership-baseline': 0, 'membership-change': 0, 'action-decision': 3,
            'action-attempt': 1, 'movement-decisions': 1, 'healing-decisions': 1,
            'combat-decisions': 1 }, closed: true };
    return [movement, attempt, healing, combat, coverage];
}

function rawCoverage(gameStates) {
    const ticks = gameStates.map(item => item.tick);
    const counts = new Map();
    for (const tick of ticks) counts.set(tick, (counts.get(tick) ?? 0) + 1);
    const firstTick = ticks.length ? Math.min(...ticks) : null;
    const lastTick = ticks.length ? Math.max(...ticks) : null;
    const gaps = [];
    if (firstTick !== null) for (let tick = firstTick; tick <= lastTick; tick++) {
        if (!counts.has(tick)) gaps.push(tick);
    }
    return { count: ticks.length, firstTick, lastTick,
        duplicates: [...counts].filter(([, count]) => count > 1).map(([tick]) => tick), gaps };
}
export {scoreItems,replayObject,scoreFrame,gameState,mapFixture,productionMetadata,actionDiagnostics,rawCoverage};

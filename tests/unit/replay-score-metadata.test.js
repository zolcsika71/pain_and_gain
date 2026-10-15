// Original synthetic metadata; no reference-repository code or captured evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeLoadedScoreEvidence } from '../../tools/replay-score-analysis.js';
import { sha256, scoreSourceFingerprint, validateScoreBody } from '../../tools/replay-logs.js';

const replayId = 'a'.repeat(24);
function metadata(firstPlayerIndex = 0) {
    return { ok: 1, game: { _id: replayId, user: 'user-b',
        users: [{ _id: 'user-b' }, { _id: 'user-a' }],
        codes: [{ _id: 'code-b', user: 'user-b', version: 24 },
            { _id: 'code-a', user: 'user-a', version: 3 }],
        game: { _id: replayId, usersCode: ['code-a', 'code-b'], firstPlayerIndex } } };
}
function frames() {
    return [1, 2].map(gameTime => ({ gameTime,
        objects: ['player1', 'player2'].map((user, i) => ({
            id: `creep-${i}`, user, x: gameTime + 10 * i, y: 10, hits: 100, fatigue: 0,
        })), flags: [], ui: { version: 1, items: [
            { id: 'player1-score', name: 'Score', value: 900 },
            { id: 'player2-score', name: 'Score', value: 1 },
        ] } }));
}
function analyze(values, replayFrames = [], snapshots = new Map()) {
    const sourceEvidence = new Map();
    const inputs = values.map(value => ['game-metadata', value]);
    if (replayFrames.length) inputs.push(['replay-frames', replayFrames]);
    const scoreRecords = inputs.map(([kind, value], i) => {
        const bytes = Buffer.from(JSON.stringify(value));
        const requestUrl = `https://arena.screeps.com/api/game/${replayId}` +
            (kind === 'game-metadata' ? '' : '/replay/100');
        const sourceKey = `1/0/${requestUrl}`;
        const fingerprint = scoreSourceFingerprint(sourceKey, bytes);
        const responseFingerprint = sha256(bytes);
        const record = { formatVersion: 1, kind, replayId, sourceKey, requestUrl,
            requestedGameTime: kind === 'game-metadata' ? null : 100,
            fingerprint, responseFingerprint, outputFingerprint: responseFingerprint,
            cacheEntryFingerprint: sha256(`synthetic-${i}`), sourceEntry: `synthetic-${i}`,
            outputPath: `replay-score-source-${replayId}-${fingerprint.slice(0, 12)}.response`,
            embeddedBuildId: null, mapId: null, status: 'claim', reviews: {}, importedAt: 'synthetic',
            ...validateScoreBody(kind, bytes, responseFingerprint) };
        sourceEvidence.set(record, { bytes });
        return record;
    });
    const before = JSON.stringify(values);
    const result = analyzeLoadedScoreEvidence({ manifest: { scoreRecords }, replayId,
        scoreFingerprints: scoreRecords.map(r => r.fingerprint), sourceEvidence, snapshots,
        addFinding() {} }).scoring;
    assert.equal(JSON.stringify(values), before);
    return result;
}

for (const index of [0, 1]) {
    test(`metadata slots: orientation ${index} resolves references, not array position`, () => {
        const value = metadata(index);
        value.players = index ? ['user-b', 'user-a'] : ['user-a', 'user-b'];
        const result = analyze([value]);
        assert.equal(result.metadataIdentity.status, 'established');
        assert.deepEqual(result.metadataIdentity.slotUsers, value.players);
        assert.equal(result.metadataIdentity.oursSlot, index ? 'player1' : 'player2');
        assert.equal(result.mapping.status, 'unknown'); // No replay roster.
        assert.equal(result.alignment.status, 'unknown');
        assert.equal(result.buildAssociation.status, 'unknown');
    });
}

for (const slot of [-1, 2, 0.5, '0', '1', null, true, {}, undefined]) {
    test(`metadata slots: rejects unsupported index ${JSON.stringify(slot)}`, () => {
        const value = metadata();
        value.game.game.firstPlayerIndex = slot;
        assert.equal(analyze([value]).metadataIdentity.status, 'unknown');
    });
}

const malformed = {
    'missing current account': v => { delete v.game.user; },
    'unknown current account': v => { v.game.user = 'stranger'; },
    'duplicate users': v => { v.game.users[1] = v.game.users[0]; },
    'missing code': v => { v.game.codes.pop(); },
    'duplicate code ID': v => { v.game.codes[1]._id = v.game.codes[0]._id; },
    'duplicate code owners': v => { v.game.codes[1].user = v.game.codes[0].user; },
    'unresolved code owner': v => { v.game.codes[0].user = 'stranger'; },
    'duplicate slot references': v => { v.game.game.usersCode[1] = 'code-a'; },
    'missing slot reference': v => { v.game.game.usersCode[1] = 'missing'; },
    'conflicting ID aliases': v => { v.game.codes[0].id = 'other'; },
    'string code version': v => { v.game.codes[0].version = '24'; },
    'null code version': v => { v.game.codes[0].version = null; },
    'negative code version': v => { v.game.codes[0].version = -1; },
    'fractional code version': v => { v.game.codes[0].version = 1.5; },
};
for (const [name, mutate] of Object.entries(malformed)) {
    test(`metadata slots: ${name}`, () => {
        const value = metadata(1); mutate(value);
        assert.equal(analyze([value]).metadataIdentity.status, 'unknown');
    });
}

for (const [name, mutate] of Object.entries({
    'wrapper match': v => { v.game._id = 'b'.repeat(24); },
    'inner match': v => { v.game.game._id = 'b'.repeat(24); },
    'legacy slot order': v => { v.players = ['user-a', 'user-b']; },
})) {
    test(`metadata slots: conflicts in ${name} block mapping`, () => {
        const value = metadata(1); mutate(value);
        const result = analyze([value], frames());
        assert.equal(result.metadataIdentity.status, 'conflicting');
        assert.equal(result.mapping.status, 'conflicting');
    });
}

for (const [name, mutate] of Object.entries({
    'version': v => { v.game.codes[0].version++; },
    'code': v => { v.game.codes[0]._id = 'new-code'; v.game.game.usersCode[1] = 'new-code'; },
    'current account': v => { v.game.user = 'user-a'; },
})) {
    test(`metadata slots: selected source ${name} conflict`, () => {
        const a = metadata(1), b = metadata(1); mutate(b);
        const result = analyze([a, b], frames());
        assert.equal(result.metadataIdentity.status, 'conflicting');
        assert.equal(result.mapping.status, 'conflicting');
    });
}

test('metadata slots: omitted versions remain unknown, not inferred or conflicting', () => {
    const a = metadata(1), b = metadata(1);
    for (const code of a.game.codes) delete code.version;
    delete a.game._id; delete a.game.game._id; // Legacy body, request provenance still required.
    assert.equal(analyze([a, b]).metadataIdentity.status, 'established');
});

test('metadata slots: reversed ownership is independently corroborated and contradicted', () => {
    const replayFrames = frames();
    const snapshots = new Map(replayFrames.map(frame => [frame.gameTime + 1, {
        entry: { tick: frame.gameTime + 1, creeps: frame.objects.map(o => ({
            ...o, my: o.user === 'player1',
        })), flags: [] }, source: { path: 'synthetic-snapshot' }, buildId: null,
    }]));
    const result = analyze([metadata(1)], replayFrames, snapshots);
    assert.equal(result.mapping.status, 'established');
    assert.equal(result.mapping.oursSlot, 'player1');
    assert.equal(result.alignment.status, 'established');
    assert.equal(result.alignment.offset, 1);
    for (const snapshot of snapshots.values()) {
        snapshot.entry.creeps = snapshot.entry.creeps.slice(0, 1);
        snapshot.entry.creeps[0].my = false;
    }
    const conflict = analyze([metadata(1)], replayFrames, snapshots);
    assert.equal(conflict.mapping.status, 'conflicting');
    assert.deepEqual(conflict.events, []);
});

for (const index of [0, 1]) for (const winner of [0, 1, 0.5, '1', null]) {
    test(`metadata slots: result ${JSON.stringify(winner)} does not map slots (${index})`, () => {
        const value = metadata(index);
        value.game.game.result = winner;
        const result = analyze([value], frames());
        assert.equal(result.metadataIdentity.oursSlot, index ? 'player1' : 'player2');
        assert.equal(result.terminal.status, 'unknown');
        assert.equal(result.alignment.status, 'unknown');
        assert.equal(result.buildAssociation.status, 'unknown');
        assert.deepEqual(result.events, []);
    });
}

test('metadata slots: a replay group with only one slot does not establish ownership', () => {
    const replayFrames = frames();
    for (const frame of replayFrames) frame.objects = frame.objects.slice(0, 1);
    const result = analyze([metadata(1)], replayFrames);
    assert.equal(result.metadataIdentity.status, 'established');
    assert.equal(result.mapping.status, 'unknown');
    assert.equal(result.alignment.status, 'unknown');
});

test('metadata slots: unordered equivalent code/user arrays agree across sources', () => {
    const a = metadata(1), b = metadata(1);
    b.game.codes.reverse(); b.game.users.reverse();
    assert.equal(analyze([a, b]).metadataIdentity.status, 'established');
});

test('metadata slots: ordinary orientation also rejects known version disagreement', () => {
    const a = metadata(0), b = metadata(0);
    b.game.codes[0].version++;
    assert.equal(analyze([a, b]).metadataIdentity.status, 'conflicting');
});

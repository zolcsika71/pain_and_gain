// No storage fixture, database or filesystem analyzer: detached synthetic bytes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeLoadedScoreReplay } from '../../tools/replay-analysis.js';
import * as helpers from '../../tools/replay-logs.js';
import { loadFrozenInputs, metadataContractV2, affectedScenarios, historicalOracleHash,
    supplementalCaseIds, reportModes } from '../fixtures/replay-score-metadata-contract-v2.js';

const { oracleBytes: bytes, historical, expected, compatibility, recipe, replayId, variants, hash } = await loadFrozenInputs();
function analyze(data, mode) {
    return analyzeLoadedScoreReplay({ replayId, reportMode: mode,
        scoreFingerprints: data.selected,
        scoreCollectionPresent: Object.hasOwn(data.manifest, 'scoreRecords'),
        scoreRecords: data.manifest.scoreRecords ?? [],
        sourceEvidence: new Map((data.manifest.scoreRecords ?? []).map(record => [record,
            data.files[record.outputPath] === undefined ? { error: 'file is missing' } :
                { bytes: data.files[record.outputPath] }])) });
}

for (const name of variants) for (const mode of reportModes) {
    test(`contract v2: exact ${name} ${mode} report`, () => {
        const report = analyze(recipe(helpers, name), mode);
        assert.equal(JSON.stringify(report), JSON.stringify(expected.scenarios[name].reports[mode]));
        assert.equal(hash(JSON.stringify(report) + '\n'), expected.scenarios[name].hashes[mode]);
        if (!affectedScenarios.includes(name)) {
            assert.equal(JSON.stringify(report), JSON.stringify(historical.scenarios[name].reports[mode]));
        }
    });
}
for (const name of supplementalCaseIds) for (const mode of reportModes) {
    const value = compatibility.cases[name];
    test(`contract v2: unchanged supplemental ${name} ${mode}`, () => {
        const files = Object.fromEntries(Object.entries(value.bodies).map(([file, body]) => [file, Buffer.from(body, 'base64')]));
        const report = analyze({ manifest: value.manifest, selected: value.selected, files }, mode);
        assert.equal(JSON.stringify(report), JSON.stringify(value.reports[mode]));
        assert.equal(hash(JSON.stringify(report) + '\n'), value.hashes[mode]);
    });
}

test('contract v2: historical bytes immutable and changed oracle rejected', () => {
    assert.equal(hash(bytes), historicalOracleHash);
    assert.equal(historical.scenarios.metadata.reports.full.scoring.metadataIdentity.status, 'established');
    assert.equal(expected.scenarios.metadata.reports.full.scoring.metadataIdentity.status, 'conflicting');
    assert.throws(() => metadataContractV2(Buffer.concat([bytes, Buffer.from(' ')])), /Frozen oracle bytes changed/);
});

// Derive a new, explicitly versioned valid-ID variant without editing the old
// recipe or its artifact references. Every body-dependent field is recomputed.
function identityVariant(index, id = replayId) {
    const data = recipe(helpers, 'metadata'), record = data.manifest.scoreRecords[0];
    const value = JSON.parse(data.files[record.outputPath]);
    value.game._id = id;
    value.game.game._id = id;
    value.game.game.firstPlayerIndex = index;
    const body = Buffer.from(JSON.stringify(value));
    const fingerprint = helpers.scoreSourceFingerprint(record.sourceKey, body), h = hash(body);
    const replacement = { ...record, fingerprint, responseFingerprint: h, outputFingerprint: h,
        outputPath: `replay-score-source-${replayId}-${fingerprint}.response`,
        cacheEntryFingerprint: hash(Buffer.concat([Buffer.from('synthetic-contract-v2\0'), body])),
        ...helpers.validateScoreBody('game-metadata', body, h) };
    return { manifest: { ...data.manifest, scoreRecords: [replacement] },
        selected: [fingerprint], files: { [replacement.outputPath]: body } };
}
for (const index of [0, 1]) {
    test(`contract v2: valid-ID identity orientation ${index}`, () => {
        const result = analyze(identityVariant(index), 'full').scoring;
        assert.equal(result.metadataIdentity.status, 'established');
        assert.equal(result.metadataIdentity.oursSlot, index ? 'player1' : 'player2');
        assert.deepEqual(result.metadataIdentity.slotUsers, index ? ['user-b', 'user-a'] : ['user-a', 'user-b']);
        assert.equal(result.mapping.status, 'unknown');
        assert.equal(result.alignment.status, 'unknown');
        assert.equal(result.terminal.status, 'unknown');
    });
    for (const id of ['game', 'e'.repeat(24), null]) {
        test(`contract v2: bad ID ${id} still rejects (${index})`, () => {
            const result = analyze(identityVariant(index, id), 'full').scoring;
            assert.equal(result.metadataIdentity.status, 'conflicting');
            assert.equal(result.metadataIdentity.sources[0].reason, 'match-identity-disagrees');
        });
    }
}

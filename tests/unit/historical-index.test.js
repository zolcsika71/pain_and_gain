import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHistoricalIndex } from '../../tools/historical-index.js';
import { sha256 } from '../../tools/replay-logs.js';

const replayId = 'a'.repeat(24);
const retiredReplayId = 'b'.repeat(24);
const secondReplayId = '2'.repeat(24);
const fingerprint = 'c'.repeat(64);
const secondFingerprint = '3'.repeat(64);
const retiredFingerprint = 'd'.repeat(64);
const scoreFingerprint = '4'.repeat(64);
const buildId = 'e'.repeat(64);
const taskId = 'codex/historical-index-test';
const dependencyFiles = ['tools/historical-index.js', 'tools/replay-analysis.js',
    'tools/replay-score-analysis.js', 'tools/replay-logs.js', 'src/config.js',
    'src/debug/build-id.js'];

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-index-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'replay_logs'));
    for (const file of dependencyFiles) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), 'unchanged code');
    }
    const evidenceFile = path.join(root, 'replay_logs', 'capture.jsonl');
    const mapFile = path.join(root, 'replay_logs', 'map.json');
    fs.writeFileSync(evidenceFile, '{"tick":1}\n');
    fs.writeFileSync(mapFile, '{"map":1}\n');
    const manifest = { version: 2, scoreRecords: [], maps: [
        { id: 'map', checksum: 'map', file: 'map.json', status: 'validated' },
    ], replays: [
        { replayId, mapId: 'map', status: 'active', retiredFingerprints: [] },
        { replayId: retiredReplayId, mapId: 'map', status: 'active',
            retiredFingerprints: [retiredFingerprint] },
    ], records: [{ replayId, fingerprint, outputPath: 'capture.jsonl',
        outputFingerprint: sha256(fs.readFileSync(evidenceFile)), buildId, mapId: 'map',
        mapChecksum: 'map', status: 'claim', reviews: { [taskId]: { claimedAt: 'now' } } }] };
    const manifestFile = path.join(root, 'replay_logs', 'manifest.json');
    const saveManifest = () => fs.writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
    saveManifest();
    const selection = { version: 1, taskId, matches: [
        { replayId, logFingerprints: [fingerprint], opponent: 'opponent A',
            configuration: { label: 'escort on', basis: 'experiment record', expectedBuildId: buildId },
            reportedFinalTick: 2 },
        { replayId: retiredReplayId, logFingerprints: [retiredFingerprint],
            opponent: 'opponent B',
            configuration: { label: 'unknown', basis: 'experiment record', expectedBuildId: null } },
    ] };
    let calls = 0;
    const analyze = ({ replayId: selectedId, fingerprints, reportMode }) => {
        calls += 1;
        assert.ok([replayId, secondReplayId].includes(selectedId));
        assert.deepEqual(fingerprints, [selectedId === replayId ? fingerprint : secondFingerprint]);
        assert.equal(reportMode, 'compact');
        return { reportMode: 'compact', replayId: selectedId,
            summary: { pass: 1, fail: 0, unknown: 1 },
            evidenceSummary: { trustedLogRecords: 1, snapshots: { count: 1,
                tickRanges: [{ first: 1, last: 1 }] }, completeDiagnosticTicks: { count: 1 } },
            findingSummary: [
                { rule: 'command', verdict: 'pass', count: 1,
                    representativeEvidence: [{ fingerprint, tick: 1 }] },
                { rule: 'next-position', verdict: 'unknown', count: 1,
                    representativeEvidence: [{ fingerprint, tick: 1 }] },
            ] };
    };
    return { root, evidenceFile, mapFile, manifestFile, manifest, saveManifest, selection,
        analyze, calls: () => calls };
}

function withScoreEvidence(f) {
    const scoreFile = path.join(f.root, 'replay_logs', 'score.response');
    fs.writeFileSync(scoreFile, '{"score":0}\n');
    f.manifest.scoreRecords.push({ replayId, fingerprint: scoreFingerprint,
        outputPath: 'score.response', outputFingerprint: sha256(fs.readFileSync(scoreFile)),
        status: 'claim', reviews: { [taskId]: { claimedAt: 'now' } } });
    f.saveManifest();
    f.selection.matches[0].scoreFingerprints = [scoreFingerprint];
    const logAnalyze = f.analyze;
    f.analyze = args => {
        const report = logAnalyze(args);
        if (!args.scoreFingerprints?.length) return report;
        assert.deepEqual(args.scoreFingerprints, [scoreFingerprint]);
        return { ...report, selectedScoreFingerprints: args.scoreFingerprints,
            scoring: { sources: [{ fingerprint: scoreFingerprint, integrity: 'verified',
                coverage: { validFrames: 2 } }],
            segments: [{ id: 'segment', sourceFingerprint: scoreFingerprint }],
            groups: [{ id: 'group', segmentIds: ['segment'] }],
            scoreProgression: [
                { groupId: 'group', gameTime: 2, slot: 'player1', player: 'ours',
                    cumulativeScore: 0, displayedGain: 0, derivedScoreChange: 0,
                    derivedStatus: 'derived' },
                { groupId: 'group', gameTime: 2, slot: 'player2', player: 'opponent',
                    cumulativeScore: 9, displayedGain: null, derivedScoreChange: null,
                    derivedStatus: 'missing-score' },
            ], mapping: { status: 'established' }, alignment: { status: 'unknown' },
            buildAssociation: { status: 'unknown' }, terminal: { status: 'unknown' } } };
    };
    return scoreFile;
}

test('explicit index caches only unchanged evidence, map, analyzer, configuration and selection', t => {
    const f = fixture(t);
    const manifestBefore = fs.readFileSync(f.manifestFile);
    const first = buildHistoricalIndex(f);
    assert.equal(f.calls(), 1);
    assert.equal(first.matches[0].cache, 'miss');
    assert.equal(first.matches[0].status, 'analyzed');
    assert.equal(first.matches[0].supportedFindings[0].rule, 'command');
    assert.equal(first.matches[0].unknowns[0].rule, 'next-position');
    assert.equal(first.matches[0].coverage.terminal, 'last-reported-tick-not-captured');
    assert.deepEqual(first.matches[1].unavailable, [
        { kind: 'log', fingerprint: retiredFingerprint, reason: 'retired' },
    ]);
    assert.equal(first.matches[1].status, 'unavailable');
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'hit');
    assert.equal(f.calls(), 1);
    assert.deepEqual(fs.readFileSync(f.manifestFile), manifestBefore);

    fs.writeFileSync(f.mapFile, '{"map":2}\n');
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    fs.writeFileSync(path.join(f.root, 'tools/replay-analysis.js'), 'changed analyzer');
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    f.selection.matches[0].configuration.label = 'escort off';
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    f.selection.matches[0].reportedFinalTick = 3;
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    fs.writeFileSync(f.evidenceFile, '{"tick":2}\n');
    f.manifest.records[0].outputFingerprint = sha256(fs.readFileSync(f.evidenceFile));
    f.saveManifest();
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    assert.equal(f.calls(), 6);
});

test('changed managed bytes are invalid and cannot reuse prior support', t => {
    const f = fixture(t);
    buildHistoricalIndex(f);
    fs.writeFileSync(f.evidenceFile, '{"tick":2}\n');
    const row = buildHistoricalIndex(f).matches[0];
    assert.equal(row.status, 'invalid');
    assert.deepEqual(row.supportedFindings, []);
    assert.match(row.unavailable[0].reason, /Changed managed evidence/);
    assert.equal(f.calls(), 1);
});

test('a damaged cached report is recomputed instead of trusted', t => {
    const f = fixture(t);
    buildHistoricalIndex(f);
    const dir = path.join(f.root, 'replay_logs', 'analysis_cache');
    const [cacheName] = fs.readdirSync(dir);
    const cacheFile = path.join(dir, cacheName);
    const cache = JSON.parse(fs.readFileSync(cacheFile));
    cache.report.summary.pass = 99;
    fs.writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);
    const row = buildHistoricalIndex(f).matches[0];
    assert.equal(row.cache, 'miss');
    assert.equal(row.analyzerSummary.pass, 1);
    assert.equal(f.calls(), 2);
});

test('a change to one replay reanalyzes only that replay', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'replay_logs', 'second.jsonl'), '{"tick":2}\n');
    f.manifest.replays.push({ replayId: secondReplayId, mapId: 'map', status: 'active',
        retiredFingerprints: [] });
    f.manifest.records.push({ replayId: secondReplayId, fingerprint: secondFingerprint,
        outputPath: 'second.jsonl', outputFingerprint: sha256('{"tick":2}\n'), buildId,
        mapId: 'map', mapChecksum: 'map', status: 'claim',
        reviews: { [taskId]: { claimedAt: 'now' } } });
    f.saveManifest();
    f.selection.matches.push({ replayId: secondReplayId, logFingerprints: [secondFingerprint],
        opponent: 'opponent C',
        configuration: { label: 'escort on', basis: 'experiment record', expectedBuildId: buildId } });
    assert.deepEqual(buildHistoricalIndex(f).matches.map(x => x.cache), ['miss', 'none', 'miss']);
    assert.deepEqual(buildHistoricalIndex(f).matches.map(x => x.cache), ['hit', 'none', 'hit']);
    fs.writeFileSync(f.evidenceFile, '{"tick":3}\n');
    f.manifest.records[0].outputFingerprint = sha256(fs.readFileSync(f.evidenceFile));
    f.saveManifest();
    assert.deepEqual(buildHistoricalIndex(f).matches.map(x => x.cache), ['miss', 'none', 'hit']);
    assert.equal(f.calls(), 3);
});

test('claim and expected build are enforced before findings become supported', t => {
    const f = fixture(t);
    delete f.manifest.records[0].reviews[taskId];
    f.saveManifest();
    assert.throws(() => buildHistoricalIndex(f), /Claim .* before analysis/);
    f.manifest.records[0].reviews[taskId] = { claimedAt: 'now' };
    f.saveManifest();
    f.selection.matches[0].configuration.expectedBuildId = 'f'.repeat(64);
    const row = buildHistoricalIndex(f).matches[0];
    assert.equal(row.status, 'invalid');
    assert.equal(row.configurationCheck, 'build-mismatch');
    assert.deepEqual(row.supportedFindings, []);
});

test('duplicate selected manifest records cannot reuse a cached pass', t => {
    const f = fixture(t);
    buildHistoricalIndex(f);
    f.manifest.records.push({ ...f.manifest.records[0] });
    f.saveManifest();
    const row = buildHistoricalIndex(f).matches[0];
    assert.equal(row.status, 'invalid');
    assert.equal(row.cache, 'none');
    assert.equal(row.unavailable[0].reason, 'duplicate current records');
    assert.deepEqual(row.supportedFindings, []);
    assert.equal(f.calls(), 1);
});

test('missing selection stays visible beside analyzed evidence', t => {
    const f = fixture(t);
    f.selection.matches[0].logFingerprints.push('1'.repeat(64));
    const row = buildHistoricalIndex(f).matches[0];
    assert.equal(row.status, 'partial');
    assert.equal(row.unavailable[0].reason, 'missing');
    assert.deepEqual(row.supportedFindings, []);
    assert.equal(f.calls(), 1);
});

test('source lists must be explicit even when selecting score evidence', t => {
    const f = fixture(t);
    delete f.selection.matches[0].logFingerprints;
    f.selection.matches[0].scoreFingerprints = ['4'.repeat(64)];
    assert.throws(() => buildHistoricalIndex(f), /Invalid explicit selection/);
});

test('score row preserves sourced observations, zero values and separate uncertainty', t => {
    const f = fixture(t);
    withScoreEvidence(f);
    const row = buildHistoricalIndex(f).matches[0];
    assert.equal(row.status, 'analyzed');
    assert.equal(row.scoreSummary.status, 'observed');
    assert.deepEqual(row.scoreSummary.coverage, {
        frameSourcesWithCoverage: 1, sourceValidFrames: 2, observations: 2, cumulativeScoreValues: 2,
        displayedGainValues: 1, derivedChangeValues: 1,
        firstObservedGameTime: 2, lastObservedGameTime: 2, lastScoredGameTime: 2, groupCount: 1,
    });
    assert.deepEqual(row.scoreSummary.latestObservation.groupSourceFingerprints, [scoreFingerprint]);
    assert.equal(row.scoreSummary.latestObservation.groupSourceCount, 1);
    assert.equal(row.scoreSummary.latestObservation.groupSourcesAbbreviated, false);
    assert.equal(row.scoreSummary.latestObservation.slots[0].cumulativeScore, 0);
    assert.equal(row.scoreSummary.latestObservation.slots[0].displayedGain, 0);
    assert.equal(row.scoreSummary.latestObservation.slots[0].derivedScoreChange, 0);
    assert.equal(row.scoreSummary.latestObservation.slots[1].displayedGain, null);
    assert.deepEqual(row.scoreSummary.uncertainty, { mapping: 'established',
        alignment: 'unknown', buildAssociation: 'unknown', terminal: 'unknown' });
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'hit');
    assert.equal(f.calls(), 1);
});

test('partial and unavailable score selections never become zero observations', t => {
    const f = fixture(t);
    withScoreEvidence(f);
    f.selection.matches[0].scoreFingerprints.push('5'.repeat(64));
    const partial = buildHistoricalIndex(f).matches[0];
    assert.equal(partial.status, 'partial');
    assert.equal(partial.scoreSummary.status, 'observed');
    assert.equal(partial.scoreSummary.selectedSourceCount, 2);
    assert.equal(partial.scoreSummary.currentSourceCount, 1);
    assert.deepEqual(partial.supportedFindings, []);
    assert.equal(partial.unavailable[0].reason, 'missing');

    f.manifest.scoreRecords = [];
    f.saveManifest();
    const missing = buildHistoricalIndex(f).matches[0];
    assert.equal(missing.status, 'partial');
    assert.equal(missing.scoreSummary.status, 'unavailable');
    assert.equal(missing.scoreSummary.coverage, null);
    assert.deepEqual(missing.scoreSummary.latestObservation, { status: 'unavailable' });
    assert.equal(missing.scoreSummary.currentSourceCount, 0);

    f.manifest.retiredScoreSources = [{ replayId, fingerprint: scoreFingerprint }];
    f.saveManifest();
    f.selection.matches[0].scoreFingerprints = [scoreFingerprint];
    const retired = buildHistoricalIndex(f).matches[0];
    assert.equal(retired.scoreSummary.status, 'unavailable');
    assert.equal(retired.unavailable[0].reason, 'retired');
});

test('score bytes, score analyzer and index summary semantics invalidate score cache', t => {
    const f = fixture(t);
    const scoreFile = withScoreEvidence(f);
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'hit');
    fs.writeFileSync(scoreFile, '{"score":1}\n');
    f.manifest.scoreRecords[0].outputFingerprint = sha256(fs.readFileSync(scoreFile));
    f.saveManifest();
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    fs.writeFileSync(path.join(f.root, 'tools/replay-score-analysis.js'), 'changed score analyzer');
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    fs.writeFileSync(path.join(f.root, 'tools/historical-index.js'), 'changed summary semantics');
    assert.equal(buildHistoricalIndex(f).matches[0].cache, 'miss');
    assert.equal(f.calls(), 4);
});

test('incompatible latest score groups do not yield a synthetic match-wide observation', t => {
    const f = fixture(t);
    withScoreEvidence(f);
    const scoreAnalyze = f.analyze;
    f.analyze = args => {
        const report = scoreAnalyze(args);
        report.scoring.groups.push({ id: 'other-group', segmentIds: ['other-segment'] });
        report.scoring.segments.push({ id: 'other-segment', sourceFingerprint: scoreFingerprint });
        report.scoring.scoreProgression.push({ groupId: 'other-group', gameTime: 2,
            slot: 'player1', player: 'unknown', cumulativeScore: 15,
            displayedGain: 1, derivedScoreChange: null, derivedStatus: 'initial' });
        return report;
    };
    const latest = buildHistoricalIndex(f).matches[0].scoreSummary.latestObservation;
    assert.deepEqual(latest, { status: 'ambiguous', gameTime: 2, groupCount: 2 });
});

test('a structurally observed frame with missing score values is not a zero score', t => {
    const f = fixture(t);
    withScoreEvidence(f);
    const scoreAnalyze = f.analyze;
    f.analyze = args => {
        const report = scoreAnalyze(args);
        report.scoring.scoreProgression = report.scoring.scoreProgression.map(item => ({ ...item,
            cumulativeScore: null, displayedGain: null, derivedScoreChange: null,
            derivedStatus: 'missing-score' }));
        return report;
    };
    const summary = buildHistoricalIndex(f).matches[0].scoreSummary;
    assert.equal(summary.status, 'no-score-value');
    assert.equal(summary.coverage.observations, 2);
    assert.equal(summary.coverage.cumulativeScoreValues, 0);
    assert.equal(summary.coverage.lastScoredGameTime, null);
    assert.deepEqual(summary.latestObservation, { status: 'unavailable' });
});

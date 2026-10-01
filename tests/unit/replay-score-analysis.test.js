import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeReplay } from '../../tools/replay-analysis.js';
import {
    canonical,
    mapChecksum,
    scoreSourceFingerprint,
    sha256,
    summarizeDiagnosticCoverage,
    validateScoreBody,
} from '../../tools/replay-logs.js';

const replayId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const buildId = 'b'.repeat(64);

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

function workspace(t, { scoreSources = [], gameStates = [], diagnostics = [] } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-score-analysis-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const directory = path.join(root, 'replay_logs');
    fs.mkdirSync(directory);
    fs.mkdirSync(path.join(root, 'src/debug'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/debug/build-id.js'), `export const buildId = '${buildId}';\n`);
    const maps = [];
    const replays = [];
    const records = [];
    let mapId = null;
    if (gameStates.length || diagnostics.length) {
        const payload = mapFixture();
        mapId = mapChecksum(payload);
        const mapFile = 'pain_and_gain_map_2026-10-01T00-00-00-000Z.json';
        fs.writeFileSync(path.join(directory, mapFile), `${canonical({ ...payload, checksum: mapId })}\n`);
        maps.push({ id: mapId, checksum: mapId, file: mapFile, status: 'validated',
            registeredAt: '2026-10-01T00:00:00.000Z' });
        replays.push({ replayId, mapId, buildId, status: 'active',
            associatedAt: '2026-10-01T00:00:00.000Z', retiredFingerprints: [] });
        const lines = gameStates.map(item => JSON.stringify(item));
        const outputPath = `${replayId}.jsonl`;
        const content = `${lines.join('\n')}\n`;
        fs.writeFileSync(path.join(directory, outputPath), content);
        const fingerprint = sha256(`log:${content}:${diagnostics.map(canonical).join(':')}`);
        const wrappers = diagnostics.map((entry, index) => ({ key: `d:${index}`,
            raw: JSON.stringify(entry), type: entry.type, formatVersion: entry.formatVersion }));
        const diagnosticInputs = diagnostics.map((entry, index) => ({ entry, key: `d:${index}` }));
        records.push({ replayId, requestedTick: gameStates[0]?.tick ?? diagnostics[0]?.tick ?? null,
            sourceEntry: 'synthetic-log',
            sourceKey: `1/0/https://arena.screeps.com/api/game/${replayId}/log/1`, fingerprint,
            outputPath, outputFingerprint: sha256(content), mapId, mapChecksum: mapId, mapFile,
            buildId, importedAt: '2026-10-01T00:00:00.000Z', status: 'claim',
            coverage: rawCoverage(gameStates), diagnosticCoverage: summarizeDiagnosticCoverage(lines, diagnosticInputs),
            otherEntries: wrappers, reviews: {} });
    }
    const scoreRecords = scoreSources.map((input, index) => {
        const kind = input.kind ?? 'replay-frames';
        const body = Buffer.from(typeof input.body === 'string' ? input.body : JSON.stringify(input.body));
        const requestedGameTime = kind === 'game-metadata' ? null : input.requestedGameTime ?? index * 100;
        const requestUrl = kind === 'game-metadata' ? `https://arena.screeps.com/api/game/${replayId}` :
            `https://arena.screeps.com/api/game/${replayId}/replay/${requestedGameTime}`;
        const sourceKey = `1/0/${requestUrl}`;
        const responseFingerprint = sha256(body);
        const fingerprint = scoreSourceFingerprint(sourceKey, body);
        const outputPath = `replay-score-source-${replayId}-${fingerprint.slice(0, 12)}.response`;
        fs.writeFileSync(path.join(directory, outputPath), body);
        const summary = validateScoreBody(kind, body, responseFingerprint);
        return { formatVersion: 1, kind, replayId, requestedGameTime,
            sourceEntry: `synthetic-score-${index}`, sourceKey, requestUrl,
            cacheEntryFingerprint: sha256(`cache:${index}:${body.toString('hex')}`), responseFingerprint,
            fingerprint, outputPath, outputFingerprint: responseFingerprint, embeddedBuildId: null,
            mapId, coverage: summary.coverage, validation: summary.validation,
            importedAt: '2026-10-01T00:00:00.000Z', status: 'claim', reviews: {} };
    });
    const manifest = { version: 2, maps, replays, records, scoreRecords, retiredScoreSources: [] };
    fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { root, directory, manifest, records, scoreRecords };
}

function snapshotBytes(directory) {
    return Object.fromEntries(fs.readdirSync(directory).sort().map(name => {
        const target = path.join(directory, name);
        return [name, fs.lstatSync(target).isSymbolicLink() ? `symlink:${fs.readlinkSync(target)}` :
            fs.readFileSync(target, 'hex')];
    }));
}

function findings(report, rule) {
    return report.findings.filter(item => item.rule === rule);
}

function appendLogRecord(fixture, { gameStates = [], recordBuildId = buildId,
    evidenceOnly = false, requestedTick = gameStates[0]?.tick ?? null } = {}) {
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    const fingerprint = sha256(`synthetic-log-${manifest.records.length}-${canonical(gameStates)}`);
    const raws = gameStates.map(item => JSON.stringify(item));
    const outputPath = evidenceOnly ? null : `${replayId}-${fingerprint.slice(0, 12)}.jsonl`;
    const content = evidenceOnly ? null : `${raws.join('\n')}\n`;
    if (content !== null) fs.writeFileSync(path.join(fixture.directory, outputPath), content);
    const active = manifest.replays[0];
    const registration = manifest.maps[0];
    const record = { replayId, requestedTick, sourceEntry: `synthetic-log-${manifest.records.length}`,
        sourceKey: `1/0/https://arena.screeps.com/api/game/${replayId}/log/${manifest.records.length + 1}`,
        fingerprint, outputPath, outputFingerprint: content === null ? null : sha256(content),
        mapId: active.mapId, mapChecksum: registration.checksum, mapFile: registration.file,
        buildId: recordBuildId, importedAt: '2026-10-01T00:00:00.000Z', status: 'claim',
        coverage: rawCoverage(gameStates), diagnosticCoverage: summarizeDiagnosticCoverage(raws, []),
        otherEntries: [], reviews: {} };
    manifest.records.push(record);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return record;
}

function makePrimaryLogLegacy(fixture) {
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    const record = manifest.records[0];
    const target = path.join(fixture.directory, record.outputPath);
    const entries = fs.readFileSync(target, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
    for (const entry of entries) delete entry.buildId;
    const raws = entries.map(item => JSON.stringify(item));
    const content = `${raws.join('\n')}\n`;
    fs.writeFileSync(target, content);
    record.buildId = null;
    record.outputFingerprint = sha256(content);
    record.diagnosticCoverage = summarizeDiagnosticCoverage(raws, []);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return record;
}

test('requires explicit score selection and verifies provenance without changing log-only output', t => {
    const fixture = workspace(t, { scoreSources: [{ body: [scoreFrame(1, [10, 3, 4, 1])] }] });
    const fingerprint = fixture.scoreRecords[0].fingerprint;
    const withoutScores = analyzeReplay({ root: fixture.root, replayId });
    assert.equal(Object.hasOwn(withoutScores, 'scoring'), false);
    assert.throws(() => analyzeReplay({ root: fixture.root, replayId, scoreFingerprints: [] }),
        /nonempty array/);
    const before = snapshotBytes(fixture.directory);
    const report = analyzeReplay({ root: fixture.root, replayId, scoreFingerprints: [fingerprint] });
    assert.deepEqual(snapshotBytes(fixture.directory), before);
    assert.deepEqual(report.selectedScoreFingerprints, [fingerprint]);
    assert.equal(report.scoring.sources[0].embeddedBuildId, null);
    assert.equal(report.scoring.sources[0].integrity, 'verified');
    assert.equal(report.scoring.sources[0].responseFingerprint,
        fixture.scoreRecords[0].responseFingerprint);
    assert.equal(report.scoring.mapping.status, 'unknown');
    assert.ok(report.scoring.comparisons.every(item => item.scoreDifference === null));
    assert.ok(findings(report, 'score.output-hash').some(item => item.verdict === 'pass'));
    assert.ok(findings(report, 'score.stored-summary').some(item => item.verdict === 'pass'));

    const legacy = workspace(t);
    const legacyManifestPath = path.join(legacy.directory, 'manifest.json');
    const legacyManifest = JSON.parse(fs.readFileSync(legacyManifestPath));
    delete legacyManifest.scoreRecords;
    fs.writeFileSync(legacyManifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);
    const legacyReport = analyzeReplay({ root: legacy.root, replayId,
        scoreFingerprints: ['c'.repeat(64)] });
    assert.deepEqual(legacyReport.selectedScoreFingerprints, []);
    assert.equal(legacyReport.scoring.sources.length, 0);
    assert.ok(findings(legacyReport, 'score.record-selection').some(item => item.verdict === 'unknown'));
});

test('reports reversed mapping, alignment, direct and derived measurements, terminal differences, and events', t => {
    const frames = [
        scoreFrame(0, [0, 0, 0, 0], { missingItems: true }),
        scoreFrame(1, [10, 5, 20, 4]),
        scoreFrame(2, [15, 5, 20, 0]),
        scoreFrame(3, [15, 5, 20, 4]),
    ];
    const snapshots = frames.slice(1).map((frame, index) => gameState(index + 2, frame, 'player2'));
    const diagnostics = actionDiagnostics(3, 'p2');
    const fixture = workspace(t, { scoreSources: [
        { kind: 'game-metadata', body: { players: ['p1', 'p2'] } },
        { body: frames, requestedGameTime: 3 },
    ], gameStates: snapshots, diagnostics });
    const before = snapshotBytes(fixture.directory);
    const report = analyzeReplay({ root: fixture.root, replayId,
        fingerprints: [fixture.records[0].fingerprint],
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint).reverse() });
    assert.deepEqual(snapshotBytes(fixture.directory), before);
    assert.equal(report.scoring.mapping.status, 'established');
    assert.equal(report.scoring.mapping.oursSlot, 'player2');
    assert.equal(report.scoring.alignment.status, 'established');
    assert.equal(report.scoring.alignment.offset, 1);
    assert.equal(report.scoring.buildAssociation.status, 'associated');
    const atZero = report.scoring.observations.filter(item => item.gameTime === 0);
    assert.ok(atZero.every(item => item.cumulativeScore === null && item.derivedScoreChange === null &&
        item.derivedStatus === 'initial'));
    const player1At2 = report.scoring.observations.find(item => item.gameTime === 2 && item.slot === 'player1');
    assert.equal(player1At2.derivedScoreChange, 5);
    assert.equal(player1At2.derivedStatus, 'derived');
    assert.equal(player1At2.gainComparison, 'equal');
    const player1At3 = report.scoring.observations.find(item => item.gameTime === 3 && item.slot === 'player1');
    assert.equal(player1At3.derivedScoreChange, 0);
    assert.equal(player1At3.displayedGain, 5);
    assert.equal(player1At3.gainComparison, 'different');
    assert.equal(report.scoring.terminal.status, 'unknown');
    const comparison = report.scoring.comparisons.find(item => item.gameTime === 2);
    assert.equal(comparison.oursSlot, 'player2');
    assert.equal(comparison.scoreDifference, 5);
    assert.equal(comparison.displayedGainDifference, -5);
    const event = report.scoring.events.find(item => item.gameTime === 2);
    assert.equal(event.runtimeTick, 3);
    assert.equal(event.escortDecisions[0].reason, 'escort-approach');
    assert.equal(event.objectiveFlags[0].owner, 'me');
    assert.ok(event.scoreEvidence.every(item => item.scoreFingerprint));
    assert.ok(event.logEvidence.every(item => item.fingerprint));
    assert.ok(findings(report, 'score.event-association').some(item =>
        item.verdict === 'pass' && item.observed.causalClaim === false));

    const contradictorySnapshots = [gameState(2, frames[1], 'player1'),
        gameState(3, frames[2], 'player2')];
    const conflicting = workspace(t, { scoreSources: [{ body: frames.slice(1, 3) }],
        gameStates: contradictorySnapshots });
    const conflictReport = analyzeReplay({ root: conflicting.root, replayId,
        scoreFingerprints: [conflicting.scoreRecords[0].fingerprint] });
    assert.equal(conflictReport.scoring.mapping.status, 'conflicting');
    assert.ok(conflictReport.scoring.comparisons.every(item => item.scoreDifference === null));
    assert.deepEqual(conflictReport.scoring.events, []);
});

test('does not carry mapping across unrelated or ambiguous sequence groups', t => {
    const mapped = [scoreFrame(1, [10, 1, 8, 1]), scoreFrame(2, [11, 1, 9, 1])];
    const unmapped = [scoreFrame(10, [20, 1, 18, 1], { objects: [
        replayObject('q1', 'player1', 30), replayObject('q2', 'player2', 40),
    ] })];
    const fixture = workspace(t, { scoreSources: [
        { body: mapped, requestedGameTime: 2 },
        { body: unmapped, requestedGameTime: 10 },
    ], gameStates: mapped.map((frame, index) => gameState(index + 2, frame)) });
    const report = analyzeReplay({ root: fixture.root, replayId,
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint) });
    assert.equal(report.scoring.mapping.status, 'established');
    assert.ok(report.scoring.observations.filter(item => item.gameTime === 10)
        .every(item => item.player === 'unknown'));
    assert.ok(report.scoring.comparisons.filter(item => item.gameTime === 10)
        .every(item => item.oursSlot === null && item.scoreDifference === null));
});

test('withholds alignment and events when a structural frame gap crosses the supporting interval', t => {
    const frames = [scoreFrame(1, [10, 1, 8, 1]), scoreFrame(100, [20, 1, 18, 1])];
    const fixture = workspace(t, { scoreSources: [{ body: frames }],
        gameStates: [gameState(2, frames[0]), gameState(101, frames[1])] });
    const report = analyzeReplay({ root: fixture.root, replayId,
        fingerprints: [fixture.records[0].fingerprint],
        scoreFingerprints: [fixture.scoreRecords[0].fingerprint] });
    assert.equal(report.scoring.alignment.status, 'unknown');
    assert.ok(report.scoring.alignment.groups[0].blockedBy.includes('structural-gap'));
    assert.equal(report.scoring.buildAssociation.status, 'unknown');
    assert.deepEqual(report.scoring.events, []);
    assert.ok(report.scoring.observations.every(item => item.player !== 'unknown'));
    assert.ok(findings(report, 'score.tick-alignment').every(item => item.verdict === 'unknown'));
    assert.ok(findings(report, 'score.event-association').every(item => item.verdict === 'unknown'));
});

test('propagates an accepted-group frame conflict into alignment and event uncertainty', t => {
    const common = scoreFrame(1, [10, 1, 8, 1], { marker: 'common' });
    const last = scoreFrame(3, [12, 1, 10, 1], { marker: 'last' });
    const fixture = workspace(t, { scoreSources: [
        { body: [common, scoreFrame(2, [11, 1, 9, 1], { marker: 'a' }), last] },
        { body: [common, scoreFrame(2, [99, 9, 9, 1], { marker: 'b' }), last] },
    ], gameStates: [gameState(2, common), gameState(4, last)] });
    const report = analyzeReplay({ root: fixture.root, replayId,
        fingerprints: [fixture.records[0].fingerprint],
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint) });
    assert.ok(findings(report, 'score.conflicting-overlap').some(item => item.verdict === 'fail'));
    assert.equal(report.scoring.alignment.status, 'unknown');
    assert.deepEqual(report.scoring.alignment.groups[0].blockedBy, ['conflicting-overlap']);
    assert.equal(report.scoring.buildAssociation.status, 'unknown');
    assert.deepEqual(report.scoring.events, []);
    assert.ok(findings(report, 'score.tick-alignment').every(item => item.verdict === 'unknown'));
    assert.ok(findings(report, 'score.event-association').every(item => item.verdict === 'unknown'));
});

test('binds build association to the snapshots that actually support alignment', t => {
    const twoFrames = [scoreFrame(1, [10, 1, 8, 1]), scoreFrame(2, [11, 1, 9, 1])];
    const legacy = workspace(t, { scoreSources: [{ body: twoFrames }],
        gameStates: twoFrames.map((frame, index) => gameState(index + 2, frame)) });
    const legacyRecord = makePrimaryLogLegacy(legacy);
    const unrelatedTagged = appendLogRecord(legacy, { evidenceOnly: true, recordBuildId: buildId });
    const legacyReport = analyzeReplay({ root: legacy.root, replayId,
        fingerprints: [legacyRecord.fingerprint, unrelatedTagged.fingerprint],
        scoreFingerprints: [legacy.scoreRecords[0].fingerprint] });
    assert.equal(legacyReport.scoring.alignment.status, 'established');
    assert.ok(legacyReport.scoring.alignment.contributors.every(item => item.buildId === null));
    assert.equal(legacyReport.scoring.buildAssociation.status, 'unknown');
    assert.equal(legacyReport.scoring.buildAssociation.logBuildId, null);
    assert.equal(legacyReport.scoring.buildAssociation.hasUnknownBuild, true);
    assert.deepEqual(legacyReport.scoring.events, []);
    assert.ok(findings(legacyReport, 'score.build-association').every(item =>
        item.verdict === 'unknown' && item.provenance.status === 'legacy-unknown'));
    assert.ok(findings(legacyReport, 'score.event-association').every(item => item.verdict === 'unknown'));

    const tagged = workspace(t, { scoreSources: [{ body: twoFrames }],
        gameStates: twoFrames.map((frame, index) => gameState(index + 2, frame)) });
    const unrelatedLegacy = appendLogRecord(tagged, { evidenceOnly: true, recordBuildId: null });
    const taggedReport = analyzeReplay({ root: tagged.root, replayId,
        fingerprints: [tagged.records[0].fingerprint, unrelatedLegacy.fingerprint],
        scoreFingerprints: [tagged.scoreRecords[0].fingerprint] });
    assert.equal(taggedReport.scoring.buildAssociation.status, 'associated');
    assert.equal(taggedReport.scoring.events.length, 2);
    assert.ok(findings(taggedReport, 'score.event-association').some(item =>
        item.verdict === 'pass' && item.provenance.status === 'local-source-match'));

    const fourFrames = [1, 2, 3, 4].map(time => scoreFrame(time, [time * 10, 1, time * 9, 1]));
    const mixed = workspace(t, { scoreSources: [{ body: fourFrames }],
        gameStates: fourFrames.slice(0, 2).map((frame, index) => gameState(index + 2, frame)) });
    const mixedLegacy = appendLogRecord(mixed, { recordBuildId: null,
        gameStates: fourFrames.slice(2).map((frame, index) => gameState(index + 4, frame, 'player1', null)) });
    const mixedReport = analyzeReplay({ root: mixed.root, replayId,
        fingerprints: [mixed.records[0].fingerprint, mixedLegacy.fingerprint],
        scoreFingerprints: [mixed.scoreRecords[0].fingerprint] });
    assert.equal(mixedReport.scoring.alignment.status, 'established');
    assert.equal(mixedReport.scoring.buildAssociation.status, 'unknown');
    assert.deepEqual(mixedReport.scoring.buildAssociation.supportedBuildIds, [buildId]);
    assert.equal(mixedReport.scoring.buildAssociation.hasUnknownBuild, true);
    assert.deepEqual(mixedReport.scoring.events, []);

    const otherBuildId = 'c'.repeat(64);
    const conflicting = workspace(t, { scoreSources: [{ body: fourFrames }],
        gameStates: fourFrames.slice(0, 2).map((frame, index) => gameState(index + 2, frame)) });
    const otherRecord = appendLogRecord(conflicting, { recordBuildId: otherBuildId,
        gameStates: fourFrames.slice(2).map((frame, index) =>
            gameState(index + 4, frame, 'player1', otherBuildId)) });
    const conflictReport = analyzeReplay({ root: conflicting.root, replayId,
        fingerprints: [conflicting.records[0].fingerprint, otherRecord.fingerprint],
        scoreFingerprints: [conflicting.scoreRecords[0].fingerprint] });
    assert.equal(conflictReport.scoring.alignment.status, 'established');
    assert.equal(conflictReport.scoring.buildAssociation.status, 'conflicting');
    assert.deepEqual(conflictReport.scoring.buildAssociation.supportedBuildIds, [buildId, otherBuildId]);
    assert.deepEqual(conflictReport.scoring.events, []);
    assert.ok(findings(conflictReport, 'score.build-association').some(item =>
        item.verdict === 'fail' && item.provenance.status === 'conflicting'));
});

test('keeps gaps, source-order resets, decreases, and unrelated same-time frames explicit', t => {
    const decreasing = [scoreFrame(98, [10, 1, 10, 1]), scoreFrame(99, [12, 2, 11, 1]),
        scoreFrame(0, [3, 3, 2, 2]), scoreFrame(1, [2, 1, 4, 2])];
    const unrelated = [scoreFrame(0, [90, 9, 80, 8], { marker: 'other' }),
        scoreFrame(2, [95, 5, 82, 2], { marker: 'other-2' })];
    const wide = [scoreFrame(0, [1, 1, 1, 1], { marker: 'wide-start', objects: [] }),
        scoreFrame(Number.MAX_SAFE_INTEGER, [2, 1, 2, 1], { marker: 'wide-end', objects: [] })];
    const fixture = workspace(t, { scoreSources: [
        { body: decreasing, requestedGameTime: 100 },
        { body: unrelated, requestedGameTime: 200 },
        { body: wide, requestedGameTime: 300 },
    ] });
    const report = analyzeReplay({ root: fixture.root, replayId,
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint) });
    assert.equal(report.scoring.segments.filter(item =>
        item.sourceFingerprint === fixture.scoreRecords[0].fingerprint).length, 2);
    const resetInitial = report.scoring.observations.filter(item => item.gameTime === 0 &&
        item.sourceReferences.some(ref => ref.scoreFingerprint === fixture.scoreRecords[0].fingerprint));
    assert.ok(resetInitial.every(item => item.derivedScoreChange === null && item.derivedStatus === 'initial'));
    const gap = report.scoring.observations.filter(item => item.gameTime === 2 &&
        item.sourceReferences.some(ref => ref.scoreFingerprint === fixture.scoreRecords[1].fingerprint));
    assert.ok(gap.every(item => item.derivedScoreChange === null && item.derivedStatus === 'gap'));
    const wideGap = report.scoring.observations.filter(item => item.gameTime === Number.MAX_SAFE_INTEGER);
    assert.ok(wideGap.every(item => item.derivedScoreChange === null && item.derivedStatus === 'gap'));
    assert.ok(report.scoring.relationships.some(item => item.type === 'ambiguous-segment' &&
        item.gameTime === 0));
    assert.ok(findings(report, 'score.decrease-continuity').some(item => item.verdict === 'unknown'));
});

test('rejects a one-to-many overlap bridge invariantly under every selected-source permutation', t => {
    const shared = scoreFrame(5, [10, 1, 8, 1], { marker: 'shared' });
    const sourceA = [shared, scoreFrame(6, [11, 1, 9, 1]), shared,
        scoreFrame(7, [12, 1, 10, 1])];
    const sourceB = [shared];
    const fixture = workspace(t, { scoreSources: [
        { body: sourceA, requestedGameTime: 100 },
        { body: sourceB, requestedGameTime: 200 },
    ] });
    const [a, b] = fixture.scoreRecords.map(item => item.fingerprint);
    const first = analyzeReplay({ root: fixture.root, replayId, scoreFingerprints: [a, b] });
    const second = analyzeReplay({ root: fixture.root, replayId, scoreFingerprints: [b, a] });
    assert.deepEqual(second, first);
    const bridge = first.scoring.relationships.find(item => item.type === 'ambiguous-overlap-bridge');
    assert.deepEqual(bridge.reasons, ['same-source-boundary']);
    assert.equal(bridge.segmentIds.length, 3);
    assert.equal(first.scoring.groups.filter(item => item.rejectedComponent).length, 3);
    assert.equal(first.scoring.relationships.filter(item => item.type === 'accepted-overlap-group').length, 0);
});

test('rejects complete exact-overlap components with an ordering cycle', t => {
    const f = scoreFrame(1, [1, 1, 1, 1], { marker: 'f' });
    const g = scoreFrame(1, [2, 1, 2, 1], { marker: 'g' });
    const h = scoreFrame(1, [3, 1, 3, 1], { marker: 'h' });
    const fixture = workspace(t, { scoreSources: [
        { body: [f, g], requestedGameTime: 10 },
        { body: [g, h], requestedGameTime: 20 },
        { body: [h, f], requestedGameTime: 30 },
    ] });
    const report = analyzeReplay({ root: fixture.root, replayId,
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint) });
    const bridge = report.scoring.relationships.find(item => item.type === 'ambiguous-overlap-bridge');
    assert.ok(bridge.reasons.includes('ordering-cycle'));
    assert.equal(report.scoring.relationships.filter(item => item.type === 'accepted-overlap-group').length, 0);
});

test('withholds conflicting accepted overlaps and remains read-only when stored summaries fail', t => {
    const common = scoreFrame(1, [10, 1, 8, 1], { marker: 'common' });
    const fixture = workspace(t, { scoreSources: [
        { body: [common, scoreFrame(2, [12, 2, 9, 1], { marker: 'a' })], requestedGameTime: 10 },
        { body: [common, scoreFrame(2, [99, 9, 9, 1], { marker: 'b' })], requestedGameTime: 20 },
    ] });
    const report = analyzeReplay({ root: fixture.root, replayId,
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint) });
    assert.ok(findings(report, 'score.exact-overlap').some(item => item.verdict === 'pass'));
    assert.ok(report.scoring.observations.filter(item => item.gameTime === 1)
        .every(item => item.sourceReferences.length === 2));
    assert.ok(findings(report, 'score.conflicting-overlap').some(item => item.verdict === 'fail'));
    assert.equal(report.scoring.observations.filter(item => item.gameTime === 2).length, 0);

    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    manifest.scoreRecords[0].validation.items.counts.valid++;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const before = snapshotBytes(fixture.directory);
    const failed = analyzeReplay({ root: fixture.root, replayId,
        scoreFingerprints: fixture.scoreRecords.map(item => item.fingerprint) });
    assert.deepEqual(snapshotBytes(fixture.directory), before);
    assert.ok(findings(failed, 'score.stored-summary').some(item => item.verdict === 'fail'));
    assert.equal(failed.scoring.sources.length, 2);
    assert.ok(failed.scoring.sources.some(item => item.integrity === 'invalid'));
});

test('rejects analyzer-specific file hazards and accepts only legacy gap normalization', t => {
    const make = () => workspace(t, { scoreSources: [{ body: [
        scoreFrame(1, [10, 1, 8, 1]), scoreFrame(3, [12, 1, 10, 1]),
    ] }] });
    const runUnchanged = fixture => {
        const before = snapshotBytes(fixture.directory);
        const report = analyzeReplay({ root: fixture.root, replayId,
            scoreFingerprints: [fixture.scoreRecords[0].fingerprint] });
        assert.deepEqual(snapshotBytes(fixture.directory), before);
        return report;
    };

    const symlinked = make();
    const symlinkRecord = symlinked.scoreRecords[0];
    const symlinkPath = path.join(symlinked.directory, symlinkRecord.outputPath);
    const outside = path.join(symlinked.root, 'outside.response');
    fs.writeFileSync(outside, fs.readFileSync(symlinkPath));
    fs.rmSync(symlinkPath);
    fs.symlinkSync(outside, symlinkPath);
    assert.ok(findings(runUnchanged(symlinked), 'score.output-file').some(item => item.verdict === 'fail'));

    const unsafe = make();
    const unsafeManifestPath = path.join(unsafe.directory, 'manifest.json');
    const unsafeManifest = JSON.parse(fs.readFileSync(unsafeManifestPath));
    unsafeManifest.scoreRecords[0].outputPath = '../outside.response';
    fs.writeFileSync(unsafeManifestPath, `${JSON.stringify(unsafeManifest, null, 2)}\n`);
    assert.ok(findings(runUnchanged(unsafe), 'score.output-file').some(item => item.verdict === 'fail'));

    const multiplyOwned = make();
    const ownedManifestPath = path.join(multiplyOwned.directory, 'manifest.json');
    const ownedManifest = JSON.parse(fs.readFileSync(ownedManifestPath));
    ownedManifest.scoreRecords.push({ ...ownedManifest.scoreRecords[0],
        fingerprint: 'd'.repeat(64), reviews: { nested: { preserved: true } } });
    fs.writeFileSync(ownedManifestPath, `${JSON.stringify(ownedManifest, null, 2)}\n`);
    assert.ok(findings(runUnchanged(multiplyOwned), 'score.output-file').some(item =>
        item.verdict === 'fail' && item.message.includes('unique')));

    const changed = make();
    fs.appendFileSync(path.join(changed.directory, changed.scoreRecords[0].outputPath), 'changed');
    assert.ok(findings(runUnchanged(changed), 'score.output-hash').some(item => item.verdict === 'fail'));

    const legacy = make();
    const legacyManifestPath = path.join(legacy.directory, 'manifest.json');
    const legacyManifest = JSON.parse(fs.readFileSync(legacyManifestPath));
    legacyManifest.scoreRecords[0].coverage.localSegments[0].gaps = [2];
    fs.writeFileSync(legacyManifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);
    const legacyReport = runUnchanged(legacy);
    assert.equal(legacyReport.scoring.sources[0].integrity, 'verified');
    assert.ok(findings(legacyReport, 'score.stored-summary').some(item => item.verdict === 'pass'));
    assert.deepEqual(legacyReport.scoring.sources[0].coverage.localSegments[0].gaps,
        [{ firstGameTime: 2, lastGameTime: 2 }]);
});

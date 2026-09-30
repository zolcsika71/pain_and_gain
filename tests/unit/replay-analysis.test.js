import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeReplay } from '../../tools/replay-analysis.js';
import { canonical, mapChecksum, sha256, summarizeDiagnosticCoverage } from '../../tools/replay-logs.js';

const replayId = '6ab84434e0351372bc91e8fe';
const buildId = 'a'.repeat(64);
const otherBuildId = 'b'.repeat(64);

function mapFixture() {
    return {
        arena: { name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000 },
        terrain: { width: 100, height: 100,
            rows: Array.from({ length: 100 }, () => Array(100).fill(0)) },
        objects: [{ type: 'ScoreFlag', id: 'flag', x: 5, y: 5,
            effectType: 'attack', scorePerTick: 3 }],
    };
}

function creep(id, my, x, y, hits = 100, activeBodyParts = { move: 1 }) {
    return { id, my, x, y, hits, hitsMax: 100, fatigue: 0, activeBodyParts };
}

function gameState(tick, actorX, actorHits = 100, options = {}) {
    const actorParts = options.actorParts ?? { move: 1, attack: 1, ranged_attack: 1, heal: 1 };
    const creeps = options.actorAbsent ? [] : [creep('actor', true, actorX, 1, actorHits, actorParts)];
    if (!options.enemyAbsent) creeps.push(creep('enemy', false, options.enemyX ?? actorX + 1, 1));
    return {
        type: 'game-state', ...(options.build === null ? {} : { buildId: options.build ?? buildId }),
        tick, phase: 'before-actions', selectedFlagId: 'flag', creeps,
        flags: [{ id: 'flag', x: 5, y: 5, owner: 'neutral',
            effectType: 'attack', scorePerTick: 3 }],
    };
}

function member(actorParts = { move: 1, attack: 1, ranged_attack: 1, heal: 1 }) {
    return { id: 'actor', role: 'mixed', originalParts: { ...actorParts }, squadId: null,
        slotIndex: null, late: false, presence: 'present', functioning: { ...actorParts },
        capable: false, participating: false, canMoveNow: true };
}

function stream(tick, configure, covered = 'm3') {
    const records = [];
    const add = entry => {
        const sequence = records.length;
        const record = { ...entry, formatVersion: 1, buildId, tick, sequence,
            recordId: `${tick}:${sequence}` };
        if (record.type === 'action-decision') {
            record.decisionId = record.recordId;
            record.actions = record.actions.map((action, index) =>
                ({ ...action, actionId: `${record.recordId}#${index}` }));
        }
        records.push(record);
        return record;
    };
    const baseline = (overrides = {}) => add({ type: 'membership-baseline', phase: 'before-actions',
        epoch: 1, initialized: true, initializationReason: null, lastTick: tick,
        squads: [], members: [member()], ...overrides });
    const change = (changes, epoch = 1) => add({ type: 'membership-change', phase: 'before-actions',
        epoch, changes });
    const decision = (channel, outcome, reason, actions = [], actorId = 'actor') => add({
        type: 'action-decision', phase: channel === 'movement' ? 'movement' : 'tactics',
        channel, actorId, outcome, reason, actions,
    });
    const attempt = (decisionRecord, index, returnCode = 0) => add({
        type: 'action-attempt', phase: decisionRecord.phase, decisionId: decisionRecord.decisionId,
        actionId: decisionRecord.actions[index].actionId, channel: decisionRecord.channel,
        actorId: decisionRecord.actorId, method: decisionRecord.actions[index].method,
        target: decisionRecord.actions[index].target, returnCode,
    });
    configure({ baseline, change, decision, attempt, records });
    const typeCount = type => records.filter(item => item.type === type).length;
    const channelCount = channel => records.filter(item =>
        item.type === 'action-decision' && item.channel === channel).length;
    const count = records.length;
    add({ type: 'evidence-coverage', phase: 'after-actions', firstSequence: count ? 0 : null,
        lastSequence: count ? count - 1 : null, recordCount: count,
        coveredTypes: covered === 'm2' ? ['membership-baseline', 'membership-change'] :
            ['membership-baseline', 'membership-change', 'action-decision', 'action-attempt'],
        counts: {
            'membership-baseline': typeCount('membership-baseline'),
            'membership-change': typeCount('membership-change'),
            'action-decision': typeCount('action-decision'),
            'action-attempt': typeCount('action-attempt'),
            'movement-decisions': channelCount('movement'),
            'healing-decisions': channelCount('healing'),
            'combat-decisions': channelCount('combat'),
        }, closed: true,
    });
    return records;
}

function actionTarget(id, x, y) {
    return { kind: id === 'flag' ? 'score-flag' : 'creep', id, x, y };
}

function completeTick(tick, { baseline = false, actorX = tick, actorHits = 100 } = {}) {
    return stream(tick, api => {
        if (baseline) api.baseline();
        const movement = api.decision('movement', 'selected', 'flag-fallback',
            [{ method: 'moveTo', target: actionTarget('flag', 5, 5) }]);
        api.attempt(movement, 0, 0);
        if (tick === 2) {
            const healing = api.decision('healing', 'selected', 'self-heal',
                [{ method: 'heal', target: actionTarget('actor', actorX, 1) }]);
            api.attempt(healing, 0, -9);
            const combat = api.decision('combat', 'selected', 'target-in-range',
                [{ method: 'rangedAttack', target: actionTarget('enemy', actorX + 1, 1) }]);
            api.attempt(combat, 0, 0);
        } else {
            api.decision('healing', 'no-action', 'no-injured-target-in-range');
            if (tick === 1) {
                const combat = api.decision('combat', 'selected', 'target-in-range', [
                    { method: 'rangedAttack', target: actionTarget('enemy', actorX + 1, 1) },
                    { method: 'attack', target: actionTarget('enemy', actorX + 1, 1) },
                ]);
                api.attempt(combat, 0, 0);
                api.attempt(combat, 1, null);
            } else api.decision('combat', 'no-action', 'no-target-in-range');
        }
    });
}

function diagnosticItems(records, keyPrefix = 'd') {
    return records.map((entry, index) => ({ key: `${keyPrefix}:${index + 1}`,
        raw: JSON.stringify(entry), type: entry.type, formatVersion: entry.formatVersion }));
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

function workspace(t, inputs, { localBuild = null } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-analysis-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const directory = path.join(root, 'replay_logs');
    fs.mkdirSync(directory);
    if (localBuild) {
        fs.mkdirSync(path.join(root, 'src/debug'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src/debug/build-id.js'),
            `export const buildId = '${localBuild}';\n`);
    }
    const payload = mapFixture();
    const checksum = mapChecksum(payload);
    const mapFile = 'pain_and_gain_map_2026-09-30T00-00-00-000Z.json';
    fs.writeFileSync(path.join(directory, mapFile), `${canonical({ ...payload, checksum })}\n`);
    const records = inputs.map((input, index) => {
        const gameStates = input.gameStates ?? [];
        const diagnostics = input.diagnostics ?? [];
        const gameLines = gameStates.map(item => JSON.stringify(item));
        const fingerprint = sha256(`synthetic:${index}:${gameLines.join('\n')}:${diagnostics.map(canonical).join('\n')}`);
        const outputPath = gameLines.length ? (index === 0 ? `${replayId}.jsonl`
            : `${replayId}-${fingerprint.slice(0, 12)}.jsonl`) : null;
        const content = outputPath ? `${gameLines.join('\n')}\n` : null;
        if (outputPath) fs.writeFileSync(path.join(directory, outputPath), content);
        const items = input.otherEntries ?? diagnosticItems(diagnostics, `record-${index}`);
        const coverageDiagnostics = diagnostics.filter(item => item.formatVersion === 1)
            .map((entry, itemIndex) => ({ entry, key: `record-${index}:${itemIndex + 1}` }));
        return {
            replayId, requestedTick: input.requestedTick ?? gameStates[0]?.tick ?? diagnostics[0]?.tick ?? 1,
            sourceEntry: `synthetic-cache-${index}`,
            sourceKey: `1/0/https://arena.screeps.com/api/game/${replayId}/log/${index + 1}`,
            fingerprint, outputPath, outputFingerprint: content === null ? null : sha256(content),
            mapId: checksum, mapChecksum: checksum, mapFile,
            buildId: input.buildId === undefined ? buildId : input.buildId,
            importedAt: '2026-09-30T00:00:00.000Z', status: 'claim',
            coverage: input.coverage ?? rawCoverage(gameStates),
            diagnosticCoverage: input.diagnosticCoverage ??
                summarizeDiagnosticCoverage(gameLines, coverageDiagnostics),
            otherEntries: items,
            reviews: { 'synthetic/reviewer': { claimedAt: '2026-09-30T00:00:00.000Z',
                examinedAt: null, completedAt: null } },
            ...input.recordOverrides,
        };
    });
    const inputBuilds = [...new Set(inputs.map(input => input.buildId === undefined ? buildId : input.buildId)
        .filter(value => value !== null))];
    const manifest = { version: 2,
        maps: [{ id: checksum, checksum, file: mapFile, status: 'validated',
            registeredAt: '2026-09-30T00:00:00.000Z' }],
        replays: [{ replayId, mapId: checksum, status: 'active',
            ...(inputBuilds.length === 1 ? { buildId: inputBuilds[0] } : {}),
            associatedAt: '2026-09-30T00:00:00.000Z', retiredFingerprints: [] }],
        records };
    fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { root, directory, manifest, records, mapFile };
}

function findings(report, rule) {
    return report.findings.filter(item => item.rule === rule);
}

function snapshotBytes(directory) {
    return Object.fromEntries(fs.readdirSync(directory).sort().map(name =>
        [name, fs.lstatSync(path.join(directory, name)).isSymbolicLink() ?
            `symlink:${fs.readlinkSync(path.join(directory, name))}` : fs.readFileSync(path.join(directory, name), 'hex')]));
}

test('analyzes overlapping file-backed and evidence-only M3 records deterministically without writes', t => {
    const tick1 = completeTick(1, { baseline: true, actorX: 1 });
    const tick2 = completeTick(2, { actorX: 2, actorHits: 90 });
    const tick3 = completeTick(3, { actorX: 2, actorHits: 90 });
    const { root, directory } = workspace(t, [
        { gameStates: [gameState(1, 1), gameState(2, 2, 90)], diagnostics: [...tick1, ...tick2] },
        { gameStates: [gameState(2, 2, 90), gameState(3, 2, 90)], diagnostics: tick2 },
        { gameStates: [], diagnostics: tick3 },
    ], { localBuild: buildId });
    const before = snapshotBytes(directory);
    const first = analyzeReplay({ root, replayId });
    const second = analyzeReplay({ root, replayId });
    assert.deepEqual(first, second);
    assert.deepEqual(snapshotBytes(directory), before);
    assert.equal(first.summary.fail, 0,
        JSON.stringify(first.findings.filter(item => item.verdict === 'fail'), null, 2));
    assert.ok(first.findings.every(item => item.replayId === replayId && item.provenance &&
        ['pass', 'fail', 'unknown'].includes(item.verdict) && item.evidence.length));
    assert.ok(first.findings.some(item => item.provenance.status === 'local-source-match'));
    assert.equal(findings(first, 'snapshot.exact-overlap')[0].observed.tick, 2);
    assert.ok(findings(first, 'diagnostic.exact-overlap').length > 0);
    assert.ok(findings(first, 'capture.output-metadata').some(item => item.observed?.evidenceOnly));
    assert.deepEqual(findings(first, 'movement.observed-displacement').map(item => item.observed?.moved),
        [true, false, undefined]);
    assert.ok(findings(first, 'health.consecutive-delta').some(item => item.observed?.delta === -10));
    assert.ok(findings(first, 'health.consecutive-delta').some(item => item.observed?.delta === 0));
    assert.ok(findings(first, 'action.attempt').some(item => item.observed.returnCode === null));
    assert.ok(findings(first, 'action.attempt').some(item => item.observed.returnCode === -9));
    assert.ok(findings(first, 'action.attempt').some(item => item.observed.returnCode === 0 &&
        item.observed.schedulingAccepted === true));
    assert.ok(findings(first, 'action.command-compatibility').every(item => item.verdict === 'pass'));
});

test('keeps legacy and M2 action provenance and coverage unknown while retaining useful observations', t => {
    const legacy = workspace(t, [{ buildId: null,
        gameStates: [gameState(1, 1, 100, { build: null }), gameState(2, 1, 95, { build: null })],
        diagnostics: [], otherEntries: [
            { key: 'allocation', raw: JSON.stringify({ type: 'flag-allocation', tick: 1 }),
                type: 'flag-allocation' },
            { key: 'escort', raw: JSON.stringify({ type: 'healer-escort', tick: 1 }),
                type: 'healer-escort' },
        ] }]);
    const legacyReport = analyzeReplay({ root: legacy.root, replayId });
    assert.equal(legacyReport.summary.fail, 0);
    assert.ok(legacyReport.findings.some(item => item.provenance.status === 'legacy-unknown'));
    assert.ok(findings(legacyReport, 'action.coverage').every(item => item.verdict === 'unknown'));
    assert.ok(findings(legacyReport, 'health.consecutive-delta').some(item => item.observed?.delta === -5));

    const m2 = stream(1, api => api.baseline(), 'm2');
    const m2Workspace = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics: m2 }]);
    const m2Report = analyzeReplay({ root: m2Workspace.root, replayId });
    assert.equal(m2Report.summary.fail, 0);
    assert.ok(findings(m2Report, 'membership.baseline').some(item => item.verdict === 'pass'));
    assert.ok(findings(m2Report, 'action.coverage').some(item => item.verdict === 'unknown' &&
        item.message.includes('membership only')));
});

test('reconstructs a valid membership epoch reset followed by its new baseline', t => {
    const tick1 = stream(1, api => api.baseline(), 'm2');
    const tick2 = stream(2, api => {
        api.change([{ kind: 'reset', previousTick: 3, currentTick: 2,
            fromEpoch: 1, toEpoch: 2, reason: 'tick-not-increasing' }], 2);
        api.baseline({ epoch: 2 });
    }, 'm2');
    const fixture = workspace(t, [{
        gameStates: [gameState(1, 1), gameState(2, 1)], diagnostics: [...tick1, ...tick2],
    }]);
    const report = analyzeReplay({ root: fixture.root, replayId });
    assert.ok(findings(report, 'membership.reset').some(item => item.verdict === 'pass'));
    assert.equal(findings(report, 'membership.baseline').length, 2);
    assert.equal(report.summary.fail, 0);
});

test('reports incomplete, unsupported, reversed, and conflicting evidence without choosing a variant', t => {
    const missingAttempt = stream(5, api => {
        const selected = api.decision('movement', 'selected', 'flag-fallback',
            [{ method: 'moveTo', target: actionTarget('flag', 5, 5) }]);
        void selected;
        api.decision('healing', 'no-action', 'no-functioning-heal');
        api.decision('combat', 'no-action', 'no-functioning-weapon');
    });
    const reversed = stream(6, api => {
        api.decision('healing', 'no-action', 'no-functioning-heal');
        api.decision('movement', 'hold', 'combat-in-range');
    });
    const holdA = stream(7, api => api.decision('movement', 'hold', 'combat-in-range'));
    const holdB = structuredClone(holdA);
    holdB[0].reason = 'injured-ally-in-range';
    const unsupported = { ...holdA[0], tick: 8, sequence: 0, recordId: '8:0', decisionId: '8:0',
        formatVersion: 2 };
    const missingClosure = completeTick(9, { actorX: 1 }).slice(0, -1);
    const sequenceGap = completeTick(10, { actorX: 1 });
    sequenceGap.splice(1, 1);
    const { root } = workspace(t, [
        { gameStates: [gameState(5, 1), gameState(6, 1), gameState(7, 1)],
            diagnostics: [...missingAttempt, ...reversed, ...holdA] },
        { gameStates: [{ ...gameState(7, 1), creeps: [creep('actor', true, 9, 9)] }],
            diagnostics: holdB },
        { gameStates: [], diagnostics: [], otherEntries: [{ key: 'unsupported',
            raw: JSON.stringify(unsupported), type: 'action-decision', formatVersion: 2 }],
            diagnosticCoverage: null },
        { gameStates: [], diagnostics: [...missingClosure, ...sequenceGap] },
    ]);
    const report = analyzeReplay({ root, replayId });
    assert.ok(findings(report, 'snapshot.conflicting-overlap').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'diagnostic.conflicting-overlap').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'diagnostic.action-correlation').some(item =>
        item.verdict === 'unknown' && item.observed.kind === 'missing-attempt'));
    assert.ok(findings(report, 'diagnostic.action-correlation').some(item =>
        item.verdict === 'unknown' && item.observed.kind === 'phase-order'));
    assert.ok(findings(report, 'diagnostic.version').some(item => item.verdict === 'unknown'));
    assert.ok(findings(report, 'diagnostic.tick-coverage').some(item =>
        item.verdict === 'unknown' && item.message.includes('closure')));
    assert.ok(findings(report, 'diagnostic.tick-coverage').some(item =>
        item.verdict === 'unknown' && item.message.includes('sequence')));
    assert.ok(findings(report, 'action.coverage').every(item => item.verdict === 'unknown'));
});

test('detects membership, range, part, and command violations while preserving return semantics', t => {
    const actorParts = { move: 1, heal: 1 };
    const tick1 = stream(1, api => {
        api.baseline({ members: [member(actorParts), { ...member({ move: 1 }), id: 'ghost' }] });
        api.decision('movement', 'hold', 'combat-in-range');
        const heal = api.decision('healing', 'selected', 'injured-ally-in-range',
            [{ method: 'rangedHeal', target: actionTarget('enemy', 5, 1) }]);
        api.attempt(heal, 0, -9);
        const combat = api.decision('combat', 'selected', 'target-in-range',
            [{ method: 'attack', target: actionTarget('enemy', 5, 1) }]);
        api.attempt(combat, 0, null);
    });
    const tick2 = stream(2, api => api.change([
        { kind: 'presence', memberId: 'actor', from: 'present', to: 'dead' },
        { kind: 'capability', memberId: 'actor', functioning: {}, capable: false, canMoveNow: false },
        { kind: 'participation', memberId: 'actor', participating: false },
    ]));
    const tick3 = stream(3, api => api.change([
        { kind: 'presence', memberId: 'actor', from: 'dead', to: 'present' },
    ]));
    const { root } = workspace(t, [{
        gameStates: [gameState(1, 1, 100, { actorParts, enemyX: 5 }),
            gameState(2, 1, 0, { actorAbsent: true }), gameState(3, 1, 100, { actorParts })],
        diagnostics: [...tick1, ...tick2, ...tick3],
    }]);
    const report = analyzeReplay({ root, replayId });
    assert.ok(findings(report, 'action.range').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'action.functioning-part').some(item =>
        item.verdict === 'fail' && item.observed.requiredPart === 'attack'));
    assert.ok(findings(report, 'action.command-compatibility').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'action.attempt').some(item => item.observed.returnCode === null &&
        item.observed.schedulingAccepted === null));
    assert.ok(findings(report, 'action.attempt').some(item => item.observed.returnCode === -9 &&
        item.observed.schedulingAccepted === false));
    assert.ok(findings(report, 'membership.presence-transition').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'membership.snapshot-consistency').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'action.coverage').length === 0);
    assert.ok(findings(report, 'diagnostic.tick-coverage').some(item =>
        item.verdict === 'pass' && item.observed.recordCount === 1));
});

test('reports hash, checksum, schema, summary, build, unsafe-path, and symlink failures read-only', t => {
    const diagnostics = completeTick(1, { baseline: true, actorX: 1 });
    const fixture = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics }]);
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    let manifest = JSON.parse(fs.readFileSync(manifestPath));
    manifest.records[0].diagnosticCoverage = { incorrect: true };
    manifest.records[0].coverage = { count: 99, firstTick: 1, lastTick: 1, duplicates: [], gaps: [] };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.appendFileSync(path.join(fixture.directory, fixture.records[0].outputPath), '{}\n');
    const mapPath = path.join(fixture.directory, fixture.mapFile);
    const map = JSON.parse(fs.readFileSync(mapPath));
    map.checksum = otherBuildId;
    fs.writeFileSync(mapPath, `${JSON.stringify(map)}\n`);
    const before = snapshotBytes(fixture.directory);
    const report = analyzeReplay({ root: fixture.root, replayId });
    assert.deepEqual(snapshotBytes(fixture.directory), before);
    assert.ok(findings(report, 'capture.output-hash').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'map.canonical-checksum').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'snapshot.stored-coverage').some(item => item.verdict === 'unknown'));

    const unsafe = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics,
        recordOverrides: { outputPath: '../outside.jsonl' } }]);
    const unsafeReport = analyzeReplay({ root: unsafe.root, replayId });
    assert.ok(findings(unsafeReport, 'capture.output-file').some(item => item.verdict === 'fail'));

    const symlink = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics }]);
    const output = path.join(symlink.directory, symlink.records[0].outputPath);
    const target = path.join(symlink.root, 'outside.jsonl');
    fs.renameSync(output, target);
    fs.symlinkSync(target, output);
    const linkBefore = snapshotBytes(symlink.directory);
    const symlinkReport = analyzeReplay({ root: symlink.root, replayId });
    assert.deepEqual(snapshotBytes(symlink.directory), linkBefore);
    assert.ok(findings(symlinkReport, 'capture.output-file').some(item => item.verdict === 'fail'));

    const buildMismatch = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics,
        recordOverrides: { buildId: otherBuildId } }]);
    const mismatchReport = analyzeReplay({ root: buildMismatch.root, replayId });
    assert.ok(findings(mismatchReport, 'build.record-consistency').some(item => item.verdict === 'fail'));
    assert.ok(mismatchReport.findings.some(item => item.provenance.status === 'conflicting'));

    const malformed = workspace(t, [{ gameStates: [{ ...gameState(1, 1),
        creeps: [{ id: 'actor', my: true }] }], diagnostics: [] }]);
    const malformedReport = analyzeReplay({ root: malformed.root, replayId });
    assert.ok(findings(malformedReport, 'capture.jsonl-schema').some(item => item.verdict === 'fail'));

    const badSummary = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics }]);
    const badSummaryPath = path.join(badSummary.directory, 'manifest.json');
    const badSummaryManifest = JSON.parse(fs.readFileSync(badSummaryPath));
    badSummaryManifest.records[0].diagnosticCoverage = { incorrect: true };
    fs.writeFileSync(badSummaryPath, `${JSON.stringify(badSummaryManifest, null, 2)}\n`);
    const summaryReport = analyzeReplay({ root: badSummary.root, replayId });
    assert.ok(findings(summaryReport, 'diagnostic.stored-coverage').some(item => item.verdict === 'fail'));
});

test('supports deterministic fingerprint restriction without mutating review metadata', t => {
    const tick1 = completeTick(1, { baseline: true, actorX: 1 });
    const tick2 = completeTick(2, { actorX: 2 });
    const fixture = workspace(t, [
        { gameStates: [gameState(1, 1)], diagnostics: tick1 },
        { gameStates: [gameState(2, 2)], diagnostics: tick2 },
    ]);
    const fingerprint = fixture.records[1].fingerprint;
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const reviewsBefore = JSON.parse(fs.readFileSync(manifestPath)).records.map(item => item.reviews);
    const missing = 'c'.repeat(64);
    const report = analyzeReplay({ root: fixture.root, replayId, fingerprints: [fingerprint, missing] });
    assert.deepEqual(report.selectedFingerprints, [fingerprint]);
    const missingFinding = findings(report, 'manifest.record-selection').find(item =>
        item.evidence[0].fingerprint === missing);
    assert.equal(missingFinding.verdict, 'unknown');
    assert.deepEqual(missingFinding.provenance, { status: 'legacy-unknown', buildId: null });
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)).records.map(item => item.reviews), reviewsBefore);
    assert.throws(() => analyzeReplay({ root: fixture.root, replayId, fingerprints: ['bad'] }),
        /Fingerprints must be/);
});

test('scopes conflicting builds out of cross-tick membership, movement, and health conclusions', t => {
    const tick1 = completeTick(1, { baseline: true, actorX: 1 });
    const tick2 = stream(2, api => api.change([
        { kind: 'capability', memberId: 'actor', functioning: { move: 1 },
            capable: false, canMoveNow: true },
    ]), 'm2').map(entry => ({ ...entry, buildId: otherBuildId }));
    const fixture = workspace(t, [
        { gameStates: [gameState(1, 1)], diagnostics: tick1 },
        { buildId: otherBuildId,
            gameStates: [gameState(2, 2, 90, { build: otherBuildId })], diagnostics: tick2 },
    ]);
    const report = analyzeReplay({ root: fixture.root, replayId });
    assert.ok(findings(report, 'build.replay-consistency').some(item => item.verdict === 'fail'));
    assert.ok(findings(report, 'membership.build-continuity').some(item => item.verdict === 'unknown' &&
        item.provenance.status === 'conflicting'));
    assert.ok(findings(report, 'movement.observed-displacement').some(item =>
        item.verdict === 'unknown' && item.provenance.status === 'conflicting'));
    assert.ok(findings(report, 'health.consecutive-delta').some(item =>
        item.verdict === 'unknown' && item.provenance.status === 'conflicting'));
    assert.equal(findings(report, 'movement.observed-displacement').filter(item => item.verdict === 'pass').length, 0);
    assert.equal(findings(report, 'health.consecutive-delta').filter(item => item.verdict === 'pass').length, 0);
    assert.ok(findings(report, 'action.attempt').some(item => item.verdict === 'pass' &&
        item.provenance.status === 'tagged-unmatched'));

    const membershipOnly = stream(1, api => api.baseline(), 'm2');
    const sameTick = workspace(t, [
        { gameStates: [], diagnostics: membershipOnly },
        { buildId: otherBuildId, gameStates: [gameState(1, 1, 100, { build: otherBuildId })],
            diagnostics: [] },
    ]);
    const sameTickReport = analyzeReplay({ root: sameTick.root, replayId });
    assert.ok(findings(sameTickReport, 'membership.snapshot-consistency').some(item =>
        item.verdict === 'unknown' && item.provenance.status === 'conflicting'));
    assert.equal(findings(sameTickReport, 'membership.snapshot-consistency')
        .filter(item => item.verdict === 'pass').length, 0);

    const mixedTick = completeTick(1, { baseline: true, actorX: 1 });
    const closure = mixedTick.at(-1);
    const mixed = workspace(t, [
        { gameStates: [gameState(1, 1)], diagnostics: mixedTick.slice(0, -1) },
        { buildId: otherBuildId, gameStates: [],
            diagnostics: [{ ...closure, buildId: otherBuildId }] },
    ]);
    const mixedReport = analyzeReplay({ root: mixed.root, replayId });
    assert.ok(findings(mixedReport, 'diagnostic.build-consistency').some(item => item.verdict === 'fail'));
    assert.ok(findings(mixedReport, 'action.coverage').some(item => item.verdict === 'unknown'));
    assert.equal(findings(mixedReport, 'action.attempt').filter(item => item.verdict === 'pass').length, 0);
});

test('requires snapshot-supported actor/channel coverage before reporting covered zero actions', t => {
    const zero = stream(1, () => {});
    const noActor = workspace(t, [{ gameStates: [gameState(1, 1, 100,
        { actorAbsent: true })], diagnostics: zero }]);
    const noActorReport = analyzeReplay({ root: noActor.root, replayId });
    assert.ok(findings(noActorReport, 'action.actor-channel-coverage').some(item => item.verdict === 'pass'));
    assert.ok(findings(noActorReport, 'action.covered-zero').some(item => item.verdict === 'pass'));

    const liveActor = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics: zero }]);
    const liveActorReport = analyzeReplay({ root: liveActor.root, replayId });
    assert.ok(findings(liveActorReport, 'action.actor-channel-coverage').some(item => item.verdict === 'fail'));
    assert.equal(findings(liveActorReport, 'action.covered-zero').length, 0);

    const noSnapshot = workspace(t, [{ gameStates: [], diagnostics: zero }]);
    const noSnapshotReport = analyzeReplay({ root: noSnapshot.root, replayId });
    assert.ok(findings(noSnapshotReport, 'action.actor-channel-coverage').some(item => item.verdict === 'unknown'));
    assert.equal(findings(noSnapshotReport, 'action.covered-zero').length, 0);
});

test('recomputes stored duplicate summaries with original keys and qualifies replay-wide references', t => {
    const records = stream(1, api => api.decision('movement', 'hold', 'combat-in-range'));
    const diagnostics = [records[0], records[0], records[1]];
    const fixture = workspace(t, [{ gameStates: [], diagnostics }]);
    const report = analyzeReplay({ root: fixture.root, replayId });
    const stored = findings(report, 'diagnostic.stored-coverage')[0];
    assert.equal(stored.verdict, 'pass');
    assert.deepEqual(stored.observed.actual.duplicateRecordIds[0].sources,
        ['record-0:1', 'record-0:2']);
    const overlap = findings(report, 'diagnostic.exact-overlap')[0];
    assert.equal(overlap.verdict, 'pass');
    assert.equal(overlap.evidence.length, 2);
    assert.deepEqual(overlap.evidence.map(item => item.otherEntryKey), ['record-0:1', 'record-0:2']);

    const conflict = structuredClone(records[0]);
    conflict.reason = 'injured-ally-in-range';
    const conflictFixture = workspace(t, [{ gameStates: [],
        diagnostics: [records[0], conflict, records[1]] }]);
    const conflictReport = analyzeReplay({ root: conflictFixture.root, replayId });
    assert.equal(findings(conflictReport, 'diagnostic.stored-coverage')[0].verdict, 'pass');
    assert.ok(findings(conflictReport, 'diagnostic.conflicting-overlap').some(item =>
        item.verdict === 'fail' && item.evidence.length === 2));
});

test('rejects unexplained epoch jumps while preserving reset and module-reload boundaries', t => {
    const tick1 = stream(1, api => api.baseline(), 'm2');
    const jumped = stream(2, api => api.baseline({ epoch: 3 }), 'm2');
    const invalid = workspace(t, [{ gameStates: [gameState(1, 1), gameState(2, 1)],
        diagnostics: [...tick1, ...jumped] }]);
    const invalidReport = analyzeReplay({ root: invalid.root, replayId });
    assert.ok(findings(invalidReport, 'membership.baseline-boundary').some(item => item.verdict === 'fail'));
    assert.equal(findings(invalidReport, 'membership.baseline').length, 1);
    assert.ok(findings(invalidReport, 'membership.reconstruction').some(item =>
        item.verdict === 'unknown' && item.observed.tick === 2));

    const reloaded = stream(2, api => api.baseline({ epoch: 1 }), 'm2');
    const reload = workspace(t, [{ gameStates: [gameState(1, 1), gameState(2, 1)],
        diagnostics: [...tick1, ...reloaded] }]);
    const reloadReport = analyzeReplay({ root: reload.root, replayId });
    assert.ok(findings(reloadReport, 'membership.baseline-boundary').some(item => item.verdict === 'unknown'));
    assert.equal(findings(reloadReport, 'membership.baseline-boundary').filter(item => item.verdict === 'fail').length, 0);
    assert.equal(findings(reloadReport, 'membership.baseline').length, 2);
});

test('withholds range when actor ownership or target coordinates contradict snapshots', t => {
    const tick1 = stream(1, api => {
        api.decision('movement', 'hold', 'combat-in-range');
        api.decision('healing', 'no-action', 'no-functioning-heal');
        const combat = api.decision('combat', 'selected', 'target-in-range',
            [{ method: 'attack', target: actionTarget('enemy', 2, 1) }]);
        api.attempt(combat, 0, 0);
    });
    const targetConflict = workspace(t, [{ gameStates: [gameState(1, 1, 100, { enemyX: 5 })],
        diagnostics: tick1 }]);
    const targetReport = analyzeReplay({ root: targetConflict.root, replayId });
    assert.ok(findings(targetReport, 'action.target-consistency').some(item => item.verdict === 'fail'));
    assert.ok(findings(targetReport, 'action.range').some(item => item.verdict === 'unknown'));
    assert.equal(findings(targetReport, 'action.range').filter(item => item.verdict === 'pass').length, 0);

    const tick2 = stream(1, api => {
        api.decision('movement', 'hold', 'combat-in-range');
        api.decision('healing', 'no-action', 'no-functioning-heal');
        const combat = api.decision('combat', 'selected', 'target-in-range',
            [{ method: 'attack', target: actionTarget('actor', 1, 1) }], 'enemy');
        api.attempt(combat, 0, 0);
    });
    const actorConflict = workspace(t, [{ gameStates: [gameState(1, 1)], diagnostics: tick2 }]);
    const actorReport = analyzeReplay({ root: actorConflict.root, replayId });
    assert.ok(findings(actorReport, 'action.actor-consistency').some(item => item.verdict === 'fail'));
    assert.ok(findings(actorReport, 'action.range').some(item => item.verdict === 'unknown'));
});

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    canonical,
    mapChecksum,
    mapPayload,
    sha256,
    summarizeDiagnosticCoverage,
    validActionAttempt,
    validActionDecision,
    validBaseline,
    validBuildId,
    validChange,
    validCoverage,
    validCpuSample,
    validMap,
} from './replay-logs.js';
import { analyzeScoreEvidence } from './replay-score-analysis.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const replayIdPattern = /^[a-f0-9]{24}$/;
const fingerprintPattern = /^[a-f0-9]{64}$/;
const outputNamePattern = /^[a-f0-9]{24}(?:-[a-f0-9]{12,64}(?:-\d+)?)?\.jsonl$/;
const mapNamePattern = /^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/;
const sourceKeyPattern = /^1\/0\/https:\/\/arena\.screeps\.com\/api\/game\/([a-f0-9]{24})\/log\/\d+$/;
const diagnosticTypes = new Set(['membership-baseline', 'membership-change',
    'action-decision', 'action-attempt', 'runtime-cpu', 'evidence-coverage']);
const allCoveredTypes = ['membership-baseline', 'membership-change',
    'action-decision', 'action-attempt'];
const requiredPart = { moveTo: 'move', heal: 'heal', rangedHeal: 'heal',
    attack: 'attack', rangedAttack: 'ranged_attack' };
const maximumRange = { heal: 1, rangedHeal: 3, attack: 1, rangedAttack: 3 };

const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

function evidence(pathname, details = {}) {
    return { path: pathname, ...details };
}

function addFinding(state, rule, verdict, refs, message, observed = null, buildIds = undefined) {
    state.findings.push({ rule, verdict, replayId: state.replayId, evidence: refs,
        message, ...(observed === null ? {} : { observed }), _buildIds: buildIds });
}

function localBuildId(root) {
    try {
        const source = fs.readFileSync(path.join(root, 'src/debug/build-id.js'), 'utf8');
        return source.match(/export const buildId = '([a-f0-9]{64})'/)?.[1] ?? null;
    } catch {
        return null;
    }
}

function provenance(buildIds, localId) {
    const values = buildIds?.length ? buildIds : [null];
    const tagged = [...new Set(values.filter(validBuildId))];
    if (tagged.length > 1) return { status: 'conflicting', buildIds: tagged };
    if (values.some(value => value === null || value === undefined) || !tagged.length) {
        return { status: 'legacy-unknown', buildId: tagged[0] ?? null };
    }
    return { status: tagged[0] === localId ? 'local-source-match' : 'tagged-unmatched',
        buildId: tagged[0] };
}

function finalReport(state, localId, selectedBuildIds) {
    const findings = state.findings.map(item => {
        const { _buildIds, ...finding } = item;
        return { ...finding, provenance: provenance(_buildIds ?? selectedBuildIds, localId) };
    }).sort((a, b) => canonical([
        a.rule, a.evidence[0]?.tick ?? -1, a.evidence[0]?.actorId ?? '', a.verdict,
        a.evidence, a.message,
    ]).localeCompare(canonical([
        b.rule, b.evidence[0]?.tick ?? -1, b.evidence[0]?.actorId ?? '', b.verdict,
        b.evidence, b.message,
    ])));
    return {
        reportVersion: 1,
        replayId: state.replayId,
        selectedFingerprints: [...state.selectedFingerprints].sort(),
        ...(state.selectedScoreFingerprints === undefined ? {} : {
            selectedScoreFingerprints: [...state.selectedScoreFingerprints].sort(),
            scoring: state.scoring,
        }),
        findings,
        summary: {
            pass: findings.filter(item => item.verdict === 'pass').length,
            fail: findings.filter(item => item.verdict === 'fail').length,
            unknown: findings.filter(item => item.verdict === 'unknown').length,
        },
    };
}

function safeRegularFile(directory, name, pattern) {
    if (typeof name !== 'string' || !pattern.test(name)) return { error: 'unsafe path' };
    const target = path.join(directory, name);
    try {
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink()) return { error: 'not a regular non-symlink file' };
        return { target, bytes: fs.readFileSync(target) };
    } catch (error) {
        return { error: error.code === 'ENOENT' ? 'file is missing' : error.message };
    }
}

function validPartCounts(value) {
    return plainObject(value) && Object.entries(value).every(([part, count]) =>
        /^[a-z][a-z0-9_]*$/.test(part) && nonnegativeInteger(count));
}

function gameStateProblem(entry) {
    if (!plainObject(entry) || entry.type !== 'game-state' || !positiveInteger(entry.tick) ||
        entry.phase !== 'before-actions' ||
        !(entry.selectedFlagId === null || (typeof entry.selectedFlagId === 'string' && entry.selectedFlagId)) ||
        !Array.isArray(entry.creeps) || !Array.isArray(entry.flags) ||
        (Object.hasOwn(entry, 'buildId') && !validBuildId(entry.buildId))) return 'invalid envelope';
    const creepIds = new Set();
    for (const creep of entry.creeps) {
        if (!plainObject(creep) || typeof creep.id !== 'string' || !creep.id || creepIds.has(creep.id) ||
            typeof creep.my !== 'boolean' || !Number.isSafeInteger(creep.x) || !Number.isSafeInteger(creep.y) ||
            !nonnegativeInteger(creep.hits) || !nonnegativeInteger(creep.hitsMax) || creep.hits > creep.hitsMax ||
            !nonnegativeInteger(creep.fatigue) || !validPartCounts(creep.activeBodyParts)) return 'invalid creep';
        creepIds.add(creep.id);
    }
    const flagIds = new Set();
    for (const flag of entry.flags) {
        if (!plainObject(flag) || typeof flag.id !== 'string' || !flag.id || flagIds.has(flag.id) ||
            !Number.isSafeInteger(flag.x) || !Number.isSafeInteger(flag.y) ||
            !['me', 'enemy', 'neutral'].includes(flag.owner) || typeof flag.effectType !== 'string' ||
            !Number.isFinite(flag.scorePerTick)) return 'invalid flag';
        flagIds.add(flag.id);
    }
    return null;
}

function diagnosticValidator(type) {
    return type === 'membership-baseline' ? validBaseline
        : type === 'membership-change' ? validChange
            : type === 'action-decision' ? validActionDecision
                : type === 'action-attempt' ? validActionAttempt
                    : type === 'runtime-cpu' ? validCpuSample : validCoverage;
}

function supportedDiagnosticVersion(entry) {
    return entry.type === 'evidence-coverage' ? [1, 2].includes(entry.formatVersion)
        : entry.formatVersion === 1;
}

function gameCoverage(lines) {
    const ticks = lines.map(item => item.entry.tick);
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

function validateManifestRecord(state, record, directory, manifestPath, active, registration) {
    const ref = evidence(manifestPath, { fingerprint: record?.fingerprint ?? null });
    let trusted = true;
    const fieldsValid = plainObject(record) && record.replayId === state.replayId &&
        fingerprintPattern.test(record.fingerprint ?? '') && ['pending', 'claim', 'done', 'waiting'].includes(record.status) &&
        (record.requestedTick === null || nonnegativeInteger(record.requestedTick)) &&
        typeof record.sourceEntry === 'string' && typeof record.sourceKey === 'string' &&
        typeof record.importedAt === 'string' &&
        plainObject(record.coverage) && Array.isArray(record.otherEntries) && plainObject(record.reviews) &&
        (record.buildId === null || validBuildId(record.buildId));
    if (!fieldsValid) {
        addFinding(state, 'manifest.record-schema', 'fail', [ref], 'Manifest record schema is invalid.', null,
            [record?.buildId ?? null]);
        trusted = false;
    } else {
        addFinding(state, 'manifest.record-schema', 'pass', [ref], 'Manifest record schema is valid.', null,
            [record.buildId]);
        const sourceReplay = record.sourceKey.match(sourceKeyPattern)?.[1] ?? null;
        const sourceValid = record.sourceKey === 'manual-jsonl' || sourceReplay === state.replayId;
        addFinding(state, 'manifest.source-provenance', sourceValid ? 'pass' : 'fail', [ref],
            sourceValid ? 'Record source metadata supports the selected replay identity.' :
                'Record source metadata does not support the selected replay identity.',
            { sourceKind: record.sourceKey === 'manual-jsonl' ? 'manual-jsonl' : 'cache-request' },
            [record.buildId]);
        if (!sourceValid) trusted = false;
    }
    if (!active || !registration || record.mapId !== active.mapId || record.mapId !== registration.id ||
        record.mapChecksum !== registration.checksum || record.mapFile !== registration.file) {
        addFinding(state, 'map.record-linkage', 'fail', [ref],
            'Record map fields do not match the replay association and registration.', null,
            [record?.buildId ?? null]);
        trusted = false;
    } else {
        addFinding(state, 'map.record-linkage', 'pass', [ref],
            'Record map fields match the active replay association.', null, [record.buildId]);
    }

    const gameLines = [];
    let outputValid = true;
    const evidenceOnly = record.outputPath === null && record.outputFingerprint === null;
    if ((record.outputPath === null) !== (record.outputFingerprint === null)) {
        addFinding(state, 'capture.output-metadata', 'fail', [ref],
            'Output path and fingerprint must both be null or both be present.', null, [record?.buildId ?? null]);
        outputValid = false;
    } else if (evidenceOnly) {
        addFinding(state, 'capture.output-metadata', 'pass', [ref],
            'Evidence-only record correctly has no JSONL output.', { evidenceOnly: true }, [record.buildId]);
    } else {
        const loaded = safeRegularFile(directory, record.outputPath, outputNamePattern);
        const outputRef = evidence(`replay_logs/${record.outputPath}`, { fingerprint: record.fingerprint });
        if (loaded.error) {
            addFinding(state, 'capture.output-file', 'fail', [outputRef], loaded.error, null, [record.buildId]);
            outputValid = false;
        } else if (!fingerprintPattern.test(record.outputFingerprint) || sha256(loaded.bytes) !== record.outputFingerprint) {
            addFinding(state, 'capture.output-hash', 'fail', [outputRef],
                'Managed JSONL byte hash does not match the manifest.',
                { actualByteHash: sha256(loaded.bytes), expectedByteHash: record.outputFingerprint }, [record.buildId]);
            outputValid = false;
        } else {
            addFinding(state, 'capture.output-hash', 'pass', [outputRef],
                'Managed JSONL byte hash matches the manifest.',
                { byteHash: record.outputFingerprint }, [record.buildId]);
            const text = loaded.bytes.toString('utf8');
            if (!text.endsWith('\n')) {
                addFinding(state, 'capture.jsonl-schema', 'fail', [outputRef],
                    'Managed JSONL must end with a newline.', null, [record.buildId]);
                outputValid = false;
            } else {
                for (const [index, raw] of text.slice(0, -1).split('\n').entries()) {
                    const lineRef = evidence(`replay_logs/${record.outputPath}`,
                        { fingerprint: record.fingerprint, line: index + 1 });
                    let entry;
                    try { entry = JSON.parse(raw); }
                    catch {
                        addFinding(state, 'capture.jsonl-schema', 'fail', [lineRef],
                            'JSONL line is not valid JSON.', null, [record.buildId]);
                        outputValid = false;
                        continue;
                    }
                    const problem = gameStateProblem(entry);
                    if (problem) {
                        addFinding(state, 'capture.jsonl-schema', 'fail', [lineRef],
                            `Game-state schema is invalid: ${problem}.`, null, [record.buildId]);
                        outputValid = false;
                        continue;
                    }
                    const entryBuild = entry.buildId ?? null;
                    if (entryBuild !== record.buildId) {
                        addFinding(state, 'build.record-consistency', 'fail', [lineRef],
                            'Game-state build ID does not match its manifest record.',
                            { recordBuildId: record.buildId, entryBuildId: entryBuild }, [record.buildId, entryBuild]);
                        outputValid = false;
                    }
                    gameLines.push({ raw, entry, buildId: entryBuild,
                        source: { ...lineRef, tick: entry.tick } });
                }
            }
        }
    }

    const diagnostics = [];
    let diagnosticsValid = true;
    for (const [index, item] of (record.otherEntries ?? []).entries()) {
        if (!plainObject(item) || typeof item.raw !== 'string' || typeof item.key !== 'string') {
            addFinding(state, 'diagnostic.wrapper-schema', 'fail', [ref],
                `otherEntries[${index}] has an invalid wrapper.`, null, [record?.buildId ?? null]);
            diagnosticsValid = false;
            continue;
        }
        let entry;
        try { entry = JSON.parse(item.raw); } catch { entry = null; }
        const declared = diagnosticTypes.has(item.type);
        const recognizedRaw = diagnosticTypes.has(entry?.type);
        if (!declared && !recognizedRaw) continue;
        const entryRef = evidence(manifestPath, { fingerprint: record.fingerprint,
            otherEntryKey: item.key, recordId: entry?.recordId ?? null, tick: entry?.tick ?? null });
        if (!entry || item.type !== entry.type || item.formatVersion !== entry.formatVersion) {
            addFinding(state, 'diagnostic.wrapper-schema', 'fail', [entryRef],
                'Typed diagnostic wrapper does not match its raw record.', null, [record.buildId]);
            diagnosticsValid = false;
            continue;
        }
        if (!supportedDiagnosticVersion(entry)) {
            addFinding(state, 'diagnostic.version', 'unknown', [entryRef],
                `Diagnostic format version ${entry.formatVersion} is unsupported.`,
                { type: entry.type, formatVersion: entry.formatVersion }, [entry.buildId ?? record.buildId]);
            diagnosticsValid = false;
            continue;
        }
        if (!diagnosticValidator(entry.type)(entry)) {
            addFinding(state, 'diagnostic.raw-schema', 'fail', [entryRef],
                'Raw diagnostic schema is invalid.', { type: entry.type }, [entry.buildId ?? record.buildId]);
            diagnosticsValid = false;
            continue;
        }
        if (entry.buildId !== record.buildId) {
            addFinding(state, 'build.record-consistency', 'fail', [entryRef],
                'Diagnostic build ID does not match its manifest record.',
                { recordBuildId: record.buildId, entryBuildId: entry.buildId }, [record.buildId, entry.buildId]);
            diagnosticsValid = false;
        }
        diagnostics.push({ entry, raw: item.raw, buildId: entry.buildId, key: item.key,
            replayKey: `${record.fingerprint}:${item.key}`, source: entryRef });
    }

    if (outputValid) {
        const actualCoverage = gameCoverage(gameLines);
        const verdict = canonical(actualCoverage) === canonical(record.coverage) ? 'pass' : 'fail';
        addFinding(state, 'snapshot.stored-coverage', verdict, [ref],
            verdict === 'pass' ? 'Stored snapshot coverage matches raw JSONL.' :
                'Stored snapshot coverage does not match raw JSONL.',
            { stored: record.coverage, actual: actualCoverage }, [record.buildId]);
    } else {
        addFinding(state, 'snapshot.stored-coverage', 'unknown', [ref],
            'Snapshot coverage cannot be checked because JSONL integrity is invalid.', null, [record?.buildId ?? null]);
    }
    if (diagnosticsValid && outputValid) {
        const actual = summarizeDiagnosticCoverage(gameLines.map(item => item.raw), diagnostics);
        const verdict = canonical(actual) === canonical(record.diagnosticCoverage) ? 'pass' : 'fail';
        addFinding(state, 'diagnostic.stored-coverage', verdict, [ref],
            verdict === 'pass' ? 'Stored diagnostic coverage matches raw evidence.' :
                'Stored diagnostic coverage does not match raw evidence.',
            { stored: record.diagnosticCoverage ?? null, actual }, [record.buildId]);
    } else {
        addFinding(state, 'diagnostic.stored-coverage', 'unknown', [ref],
            'Stored diagnostic coverage cannot be trusted because raw evidence is invalid.', null,
            [record?.buildId ?? null]);
    }
    return { trusted, outputValid, diagnosticsValid, gameLines, diagnostics, record };
}

function validateMapEvidence(state, directory, manifestPath, manifest, selected) {
    const associations = manifest.replays.filter(item => item?.replayId === state.replayId);
    const active = associations.find(item => item.status === 'active') ?? null;
    const ref = evidence(manifestPath, { replayId: state.replayId });
    if (associations.length !== 1 || !active || !fingerprintPattern.test(active.mapId ?? '')) {
        addFinding(state, 'map.replay-association', 'fail', [ref],
            'Replay must have exactly one valid active map association.');
        return { active, registration: null, map: null };
    }
    const associationBuildValid = active.buildId === undefined || active.buildId === null || validBuildId(active.buildId);
    const selectedBuilds = [...new Set(selected.map(item => item.buildId).filter(validBuildId))];
    const associationBuildMatches = associationBuildValid && (!active.buildId ||
        selectedBuilds.every(build => build === active.buildId));
    addFinding(state, 'build.replay-association', associationBuildMatches ?
        (active.buildId ? 'pass' : 'unknown') : 'fail', [ref], associationBuildMatches ?
        (active.buildId ? 'Replay association build ID agrees with selected tagged records.' :
            'Replay association has no build ID; provenance remains unknown where records are untagged.') :
        'Replay association build metadata is invalid or conflicts with selected records.',
    { associationBuildId: active.buildId ?? null, selectedBuildIds: selectedBuilds },
    selected.map(item => item.buildId ?? null));
    const registration = manifest.maps.find(item => item?.id === active.mapId) ?? null;
    if (!registration || registration.status !== 'validated' || registration.id !== registration.checksum ||
        !fingerprintPattern.test(registration.checksum ?? '')) {
        addFinding(state, 'map.registration', 'fail', [ref], 'Active map registration is invalid.');
        return { active, registration, map: null };
    }
    const loaded = safeRegularFile(directory, registration.file, mapNamePattern);
    const mapRef = evidence(`replay_logs/${registration.file}`, { mapId: registration.id });
    if (loaded.error) {
        addFinding(state, 'map.saved-file', 'fail', [mapRef], loaded.error);
        return { active, registration, map: null };
    }
    let map;
    try { map = JSON.parse(loaded.bytes.toString('utf8')); }
    catch {
        addFinding(state, 'map.saved-file', 'fail', [mapRef], 'Saved map is not valid JSON.');
        return { active, registration, map: null };
    }
    const recalculated = mapChecksum(map);
    const valid = validMap(mapPayload(map)) && map.checksum === registration.checksum &&
        recalculated === registration.checksum;
    addFinding(state, 'map.canonical-checksum', valid ? 'pass' : 'fail', [mapRef],
        valid ? 'Embedded, registered, and recalculated canonical payload checksums agree.' :
            'Saved map schema or canonical payload checksum is inconsistent.',
        { registeredChecksum: registration.checksum, embeddedChecksum: map.checksum ?? null,
            recalculatedPayloadChecksum: recalculated, savedFileByteHash: sha256(loaded.bytes) },
        selected.map(item => item.buildId ?? null));
    return { active, registration, map: valid ? map : null };
}

function mergeSnapshots(state, lines) {
    const grouped = new Map();
    for (const item of lines) {
        const list = grouped.get(item.entry.tick) ?? [];
        list.push(item);
        grouped.set(item.entry.tick, list);
    }
    const snapshots = new Map();
    for (const [tick, items] of grouped) {
        const variants = new Map();
        for (const item of items) {
            const list = variants.get(canonical(item.entry)) ?? [];
            list.push(item);
            variants.set(canonical(item.entry), list);
        }
        if (variants.size > 1) {
            addFinding(state, 'snapshot.conflicting-overlap', 'fail', items.map(item => item.source),
                'Overlapping snapshots for this tick conflict.', { tick }, items.map(item => item.buildId));
            continue;
        }
        if (items.length > 1) addFinding(state, 'snapshot.exact-overlap', 'pass',
            items.map(item => item.source), 'Exact overlapping snapshots were deduplicated.',
            { tick, copies: items.length }, items.map(item => item.buildId));
        snapshots.set(tick, items[0]);
    }
    const ticks = [...snapshots.keys()].sort((a, b) => a - b);
    const gaps = [];
    if (ticks.length) for (let tick = ticks[0]; tick <= ticks.at(-1); tick++) {
        if (!snapshots.has(tick)) gaps.push(tick);
    }
    addFinding(state, 'snapshot.replay-coverage', ticks.length ? (gaps.length ? 'unknown' : 'pass') : 'unknown',
        [evidence('replay_logs/manifest.json')], ticks.length ?
            (gaps.length ? 'Observed snapshot range contains gaps.' : 'Observed snapshot range is contiguous.') :
            'No valid game-state snapshots are available.',
        { firstTick: ticks[0] ?? null, lastTick: ticks.at(-1) ?? null, count: ticks.length, gaps });
    return snapshots;
}

function mergeDiagnostics(state, diagnostics, snapshotLines) {
    const grouped = new Map();
    for (const item of diagnostics) {
        const key = `${item.entry.tick}:${item.entry.recordId}`;
        const list = grouped.get(key) ?? [];
        list.push(item);
        grouped.set(key, list);
    }
    const unique = [];
    const conflictedTicks = new Set();
    for (const items of grouped.values()) {
        const variants = new Set(items.map(item => canonical(item.entry)));
        if (variants.size > 1) {
            conflictedTicks.add(items[0].entry.tick);
            addFinding(state, 'diagnostic.conflicting-overlap', 'fail', items.map(item => item.source),
                'Diagnostics with the same record identity conflict.',
                { tick: items[0].entry.tick, recordId: items[0].entry.recordId },
                items.map(item => item.buildId));
            continue;
        }
        if (items.length > 1) addFinding(state, 'diagnostic.exact-overlap', 'pass',
            items.map(item => item.source), 'Exact overlapping diagnostics were deduplicated.',
            { tick: items[0].entry.tick, recordId: items[0].entry.recordId, copies: items.length },
            items.map(item => item.buildId));
        unique.push({ ...items[0], sources: items.map(item => item.source) });
    }
    const replayDiagnostics = unique.map(item => ({ ...item, key: item.replayKey }));
    const summary = summarizeDiagnosticCoverage(snapshotLines.map(item => item.raw), replayDiagnostics);
    const buildConflictedTicks = new Set();
    const uniqueByTick = new Map();
    for (const item of unique) {
        const list = uniqueByTick.get(item.entry.tick) ?? [];
        list.push(item);
        uniqueByTick.set(item.entry.tick, list);
    }
    for (const [tick, items] of uniqueByTick) {
        const builds = new Set(items.map(item => item.buildId ?? null));
        if (builds.size <= 1) continue;
        buildConflictedTicks.add(tick);
        addFinding(state, 'diagnostic.build-consistency', 'fail', items.map(item => item.source),
            'A diagnostic tick cannot be assembled across incompatible build provenance.',
            { tick }, items.map(item => item.buildId));
    }
    for (const tick of summary.missingClosures) addFinding(state, 'diagnostic.tick-coverage', 'unknown',
        [evidence('replay_logs/manifest.json', { tick })], 'Diagnostic closure is missing.', { tick });
    for (const gap of summary.gaps) addFinding(state, 'diagnostic.tick-coverage', 'unknown',
        [evidence('replay_logs/manifest.json', { tick: gap.tick })],
        'Diagnostic sequence or count coverage is incomplete.', gap);
    for (const issue of summary.correlationIssues) addFinding(state, 'diagnostic.action-correlation', 'unknown',
        [evidence('replay_logs/manifest.json', { tick: issue.tick, recordId: issue.recordId ?? null })],
        'Decision/attempt correlation is incomplete or contradictory.', issue);
    const complete = new Set(summary.completeTicks.filter(tick =>
        !conflictedTicks.has(tick) && !buildConflictedTicks.has(tick)));
    const byTick = new Map();
    for (const item of unique) {
        const list = byTick.get(item.entry.tick) ?? [];
        list.push(item);
        byTick.set(item.entry.tick, list);
    }
    const closures = new Map();
    for (const [tick, items] of byTick) {
        const closure = items.find(item => item.entry.type === 'evidence-coverage');
        if (closure) closures.set(tick, closure.entry);
        if (complete.has(tick)) addFinding(state, 'diagnostic.tick-coverage', 'pass',
            items.map(item => item.source), 'Diagnostic tick is complete for its declared covered types.',
            { tick, coveredTypes: closure.entry.coveredTypes, recordCount: closure.entry.recordCount },
            items.map(item => item.buildId));
    }
    return { unique, byTick, closures, complete, summary };
}

function analyzeCpuMeasurements(state, merged, snapshots) {
    const ticks = [...new Set([...merged.byTick.keys(), ...snapshots.keys()])].sort((a, b) => a - b);
    for (const tick of ticks) {
        const items = merged.byTick.get(tick) ?? [];
        const closureItem = items.find(item => item.entry.type === 'evidence-coverage');
        const closure = closureItem?.entry;
        const samples = items.filter(item => item.entry.type === 'runtime-cpu');
        const refs = items.flatMap(item => item.sources ?? [item.source]);
        const builds = items.map(item => item.buildId);
        if (!closure) {
            addFinding(state, 'cpu.measurement', 'unknown', refs.length ? refs :
                [evidence('replay_logs/manifest.json', { tick })],
            'No diagnostic closure establishes CPU measurement coverage for this tick.', { tick }, builds);
            continue;
        }
        if (!closure.coveredTypes.includes('runtime-cpu')) {
            addFinding(state, 'cpu.measurement', 'unknown', refs,
                'This older closure does not support runtime CPU evidence.',
                { tick, coveredTypes: closure.coveredTypes }, builds);
            continue;
        }
        if (!merged.complete.has(tick) || samples.length !== 1) {
            addFinding(state, 'cpu.measurement', 'unknown', refs,
                'CPU measurement depends on complete, unconflicted coverage with exactly one sample.',
                { tick, sampleCount: samples.length }, builds);
            continue;
        }
        const sample = samples[0];
        addFinding(state, 'cpu.measurement', 'pass', sample.sources ?? [sample.source],
            'Elapsed tick CPU and sampling-point headroom are recorded; this is not final-tick or differential overhead evidence.',
            { tick, elapsedNs: sample.entry.elapsedNs, limitNs: sample.entry.limitNs,
                limitKind: sample.entry.limitKind, unit: sample.entry.unit,
                headroomNs: sample.entry.limitNs - sample.entry.elapsedNs,
                scope: 'elapsed-through-sampling-point' }, [sample.entry.buildId]);
    }
}

function mapFlagChecks(state, savedMap, snapshots) {
    if (!savedMap) return;
    const expected = mapPayload(savedMap).objects.filter(item => item.type === 'ScoreFlag')
        .map(({ id, x, y, effectType, scorePerTick }) => ({ id, x, y, effectType, scorePerTick }))
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const [tick, item] of snapshots) {
        const actual = item.entry.flags.map(({ id, x, y, effectType, scorePerTick }) =>
            ({ id, x, y, effectType, scorePerTick })).sort((a, b) => a.id.localeCompare(b.id));
        addFinding(state, 'map.snapshot-flags', canonical(actual) === canonical(expected) ? 'pass' : 'fail',
            [item.source], canonical(actual) === canonical(expected) ?
                'Snapshot static flag data matches the associated map.' :
                'Snapshot static flag data conflicts with the associated map.', { tick }, [item.buildId]);
    }
}

function applyMembershipChange(state, current, entry, source) {
    if (entry.epoch !== current.epoch) {
        addFinding(state, 'membership.epoch', 'fail', [source], 'Membership change epoch is inconsistent.',
            { expected: current.epoch, actual: entry.epoch }, [entry.buildId]);
        return false;
    }
    let consistent = true;
    for (const change of entry.changes) {
        if (change.kind === 'initialization') {
            current.initialized = change.initialized;
            current.initializationReason = change.initializationReason;
            continue;
        }
        const memberId = change.memberId ?? change.member.id;
        const member = current.members.get(memberId);
        if (change.kind === 'member-added') {
            if (member) {
                addFinding(state, 'membership.member-addition', 'fail', [source],
                    'Member-added refers to an existing member.', { memberId }, [entry.buildId]);
                consistent = false;
            }
            else {
                current.members.set(memberId, structuredClone(change.member));
                addFinding(state, 'membership.member-addition', 'pass', [source],
                    'Late member was added with complete state.', { memberId }, [entry.buildId]);
            }
            continue;
        }
        if (!member) {
            addFinding(state, 'membership.transition', 'fail', [source],
                'Membership change refers to an unknown member.', { memberId, kind: change.kind }, [entry.buildId]);
            consistent = false;
            continue;
        }
        if (change.kind === 'assignment') {
            if (member.squadId !== change.squadId || member.slotIndex !== change.slotIndex) {
                addFinding(state, 'membership.assignment-stability', 'fail', [source],
                    'A stable membership assignment changed after the baseline.',
                    { memberId, from: { squadId: member.squadId, slotIndex: member.slotIndex },
                        to: { squadId: change.squadId, slotIndex: change.slotIndex } }, [entry.buildId]);
                consistent = false;
            }
            member.squadId = change.squadId;
            member.slotIndex = change.slotIndex;
        } else if (change.kind === 'presence') {
            if (member.presence !== change.from || member.presence === 'dead' && change.to !== 'dead') {
                addFinding(state, 'membership.presence-transition', 'fail', [source],
                    'Presence transition contradicts reconstructed state or reactivates a dead member.',
                    { memberId, reconstructed: member.presence, from: change.from, to: change.to }, [entry.buildId]);
                consistent = false;
            } else addFinding(state, 'membership.presence-transition', 'pass', [source],
                'Presence transition matches reconstructed state.', { memberId, from: change.from, to: change.to },
                [entry.buildId]);
            member.presence = change.to;
        } else if (change.kind === 'capability') {
            member.functioning = structuredClone(change.functioning);
            member.capable = change.capable;
            member.canMoveNow = change.canMoveNow;
        } else if (change.kind === 'participation') member.participating = change.participating;
    }
    current.source = source;
    return consistent;
}

function checkMembershipSnapshot(state, current, snapshotItem, tick) {
    const snapshot = snapshotItem.entry;
    if (!current.initialized) return;
    const owned = new Map(snapshot.creeps.filter(item => item.my).map(item => [item.id, item]));
    for (const [memberId, member] of current.members) {
        const observed = owned.get(memberId);
        const present = Boolean(observed && observed.hits > 0);
        const presenceMatches = member.presence === 'present' ? present
            : member.presence === 'missing' ? !observed : !present;
        const functioningMatches = !observed || member.presence !== 'present' ||
            canonical(member.functioning) === canonical(observed.activeBodyParts);
        const mobilityMatches = !observed || member.presence !== 'present' ||
            member.canMoveNow === ((observed.activeBodyParts.move ?? 0) > 0 && observed.fatigue === 0);
        addFinding(state, 'membership.snapshot-consistency',
            presenceMatches && functioningMatches && mobilityMatches ? 'pass' : 'fail',
            [current.source, { ...snapshotItem.source, actorId: memberId }],
            presenceMatches && functioningMatches && mobilityMatches ?
                'Reconstructed membership agrees with the owned pre-action snapshot.' :
                'Reconstructed membership conflicts with the owned pre-action snapshot.',
            { memberId, presenceMatches, functioningMatches, mobilityMatches }, [snapshotItem.buildId]);
        owned.delete(memberId);
    }
    for (const memberId of owned.keys()) addFinding(state, 'membership.snapshot-consistency', 'fail',
        [current.source, { ...snapshotItem.source, actorId: memberId }],
        'Owned snapshot creep is absent from initialized membership.', { memberId }, [snapshotItem.buildId]);
}

function analyzeMembership(state, merged, snapshots) {
    const ticks = [...new Set([...merged.byTick.keys(), ...snapshots.keys()])].sort((a, b) => a - b);
    if (!ticks.length) return;
    let current = null;
    let expectedBaselineEpoch = null;
    let expectedBaselineBuild = null;
    let baselineBlocked = false;
    for (let tick = ticks[0]; tick <= ticks.at(-1); tick++) {
        const items = merged.byTick.get(tick) ?? [];
        const closure = merged.closures.get(tick);
        const covered = merged.complete.has(tick) && closure?.coveredTypes.includes('membership-baseline');
        if (!covered) {
            if (current || snapshots.has(tick) || items.length) addFinding(state, 'membership.reconstruction', 'unknown',
                [evidence('replay_logs/manifest.json', { tick })],
                'Membership cannot continue across missing or incomplete coverage.', { tick });
            current = null;
            expectedBaselineEpoch = null;
            expectedBaselineBuild = null;
            baselineBlocked = false;
            continue;
        }
        if (!current && expectedBaselineEpoch === null) baselineBlocked = false;
        for (const item of items.sort((a, b) => a.entry.sequence - b.entry.sequence)) {
            const entry = item.entry;
            if (entry.type === 'membership-baseline') {
                let acceptable = !baselineBlocked;
                if (expectedBaselineEpoch !== null && entry.epoch !== expectedBaselineEpoch) {
                    addFinding(state, 'membership.baseline-boundary', 'fail', [item.source],
                        'Post-reset baseline epoch does not match the reset transition.',
                        { tick, expectedEpoch: expectedBaselineEpoch, actualEpoch: entry.epoch }, [entry.buildId]);
                    acceptable = false;
                } else if (expectedBaselineEpoch !== null && entry.buildId !== expectedBaselineBuild) {
                    addFinding(state, 'membership.baseline-boundary', 'unknown', [item.source],
                        'Post-reset baseline has incompatible build provenance; reset continuity is unavailable.',
                        { tick, expectedEpoch: expectedBaselineEpoch, actualEpoch: entry.epoch },
                        [expectedBaselineBuild, entry.buildId]);
                } else if (expectedBaselineEpoch === null && current) {
                    if (entry.buildId !== current.buildId || entry.epoch === 1) {
                        addFinding(state, 'membership.baseline-boundary', 'unknown', [current.source, item.source],
                            'A new baseline starts an independent runtime boundary; prior continuity is unavailable.',
                            { tick, previousEpoch: current.epoch, nextEpoch: entry.epoch },
                            [current.buildId, entry.buildId]);
                    } else {
                        addFinding(state, 'membership.baseline-boundary', 'fail', [current.source, item.source],
                            'A new membership baseline appeared without a reset or module-reload boundary.',
                            { tick, previousEpoch: current.epoch, nextEpoch: entry.epoch }, [entry.buildId]);
                        acceptable = false;
                    }
                }
                expectedBaselineEpoch = null;
                expectedBaselineBuild = null;
                baselineBlocked = !acceptable;
                current = acceptable ? { epoch: entry.epoch, initialized: entry.initialized,
                    initializationReason: entry.initializationReason, buildId: entry.buildId,
                    members: new Map(entry.members.map(member => [member.id, structuredClone(member)])),
                    source: item.source } : null;
                if (!acceptable) continue;
                addFinding(state, 'membership.baseline', 'pass', [item.source],
                    'Membership baseline establishes reconstructable state.',
                    { tick, epoch: entry.epoch, initialized: entry.initialized, members: entry.members.length },
                    [entry.buildId]);
            } else if (entry.type === 'membership-change') {
                const reset = entry.changes.find(change => change.kind === 'reset');
                if (reset) {
                    let resetValid = true;
                    if (!current || entry.buildId !== current.buildId) {
                        addFinding(state, 'membership.reset', 'unknown',
                            current ? [current.source, item.source] : [item.source],
                            'Reset continuity cannot be verified without a compatible prior baseline.', reset,
                            current ? [current.buildId, entry.buildId] : [entry.buildId]);
                    } else if (reset.fromEpoch !== current.epoch || reset.toEpoch !== current.epoch + 1 ||
                        entry.epoch !== reset.toEpoch) {
                        addFinding(state, 'membership.reset', 'fail', [item.source],
                            'Reset epoch transition is invalid.', reset, [entry.buildId]);
                        resetValid = false;
                    } else addFinding(state, 'membership.reset', 'pass', [item.source],
                        'Reset epoch transition is internally consistent.', reset, [entry.buildId]);
                    current = null;
                    expectedBaselineEpoch = resetValid ? reset.toEpoch : null;
                    expectedBaselineBuild = resetValid ? entry.buildId : null;
                    baselineBlocked = !resetValid;
                } else if (!current) addFinding(state, 'membership.reconstruction', 'unknown', [item.source],
                    'Membership change has no uninterrupted baseline.', { tick, epoch: entry.epoch }, [entry.buildId]);
                else if (entry.buildId !== current.buildId) {
                    addFinding(state, 'membership.build-continuity', 'unknown', [current.source, item.source],
                        'Membership reconstruction cannot cross incompatible build provenance.',
                        { tick, epoch: entry.epoch }, [current.buildId, entry.buildId]);
                    current = null;
                    expectedBaselineEpoch = null;
                    expectedBaselineBuild = null;
                    baselineBlocked = false;
                } else if (!applyMembershipChange(state, current, entry, item.source)) {
                    current = null;
                    baselineBlocked = true;
                }
            }
        }
        if (expectedBaselineEpoch !== null) {
            addFinding(state, 'membership.reconstruction', 'unknown',
                items.map(item => item.source), 'Reset evidence is not followed by its required full baseline.',
                { tick, expectedEpoch: expectedBaselineEpoch }, items.map(item => item.buildId));
            expectedBaselineEpoch = null;
            expectedBaselineBuild = null;
            baselineBlocked = true;
        }
        if (!current) addFinding(state, 'membership.reconstruction', 'unknown',
            items.length ? items.map(item => item.source) : [evidence('replay_logs/manifest.json', { tick })],
            'No uninterrupted valid membership baseline is available for this covered tick.', { tick },
            items.map(item => item.buildId));
        if (current && snapshots.has(tick)) {
            const snapshotItem = snapshots.get(tick);
            if (current.buildId !== snapshotItem.buildId) addFinding(state,
                'membership.snapshot-consistency', 'unknown', [current.source, snapshotItem.source],
                'Membership and snapshot consistency cannot combine incompatible build provenance.',
                { tick }, [current.buildId, snapshotItem.buildId]);
            else checkMembershipSnapshot(state, current, snapshotItem, tick);
        }
    }
}

function attemptsCompatible(attempts) {
    const methods = attempts.map(item => item.entry.method);
    const count = method => methods.filter(item => item === method).length;
    if (count('moveTo') > 1 || count('heal') + count('rangedHeal') > 1 ||
        count('attack') > 1 || count('rangedAttack') > 1) return false;
    if (count('rangedHeal') && (count('attack') || count('rangedAttack'))) return false;
    if (count('heal') && count('attack')) return false;
    return true;
}

function analyzeActions(state, merged, snapshots) {
    const movement = [];
    const ticks = [...new Set([...merged.byTick.keys(), ...snapshots.keys()])].sort((a, b) => a - b);
    for (const tick of ticks) {
        const items = merged.byTick.get(tick) ?? [];
        const closure = merged.closures.get(tick);
        const actionCovered = merged.complete.has(tick) &&
            allCoveredTypes.every(type => closure?.coveredTypes.includes(type));
        const decisions = items.filter(item => item.entry.type === 'action-decision');
        const attempts = items.filter(item => item.entry.type === 'action-attempt');
        if (!actionCovered) {
            if (decisions.length || attempts.length || closure) addFinding(state, 'action.coverage', 'unknown',
                items.map(item => item.source),
                closure && !closure.coveredTypes.includes('action-decision') ?
                    'This closure supports membership only; action evidence is unsupported.' :
                    'Action conclusions require complete correlated M3 coverage.',
                { tick, coveredTypes: closure?.coveredTypes ?? [] }, items.map(item => item.buildId));
            continue;
        }
        const snapshotItem = snapshots.get(tick);
        let actorCoverage = null;
        let expectedPairs = [];
        if (!snapshotItem) addFinding(state, 'action.actor-channel-coverage', 'unknown',
            items.map(item => item.source),
            'Actor/channel completeness requires an unconflicted same-tick snapshot.', { tick },
            items.map(item => item.buildId));
        else if (items.some(item => item.buildId !== snapshotItem.buildId)) addFinding(state,
            'action.actor-channel-coverage', 'unknown', [...items.map(item => item.source), snapshotItem.source],
            'Actor/channel completeness cannot combine incompatible build provenance.', { tick },
            [...items.map(item => item.buildId), snapshotItem.buildId]);
        else {
            const actorIds = snapshotItem.entry.creeps.filter(creep => creep.my).map(creep => creep.id).sort();
            expectedPairs = actorIds.flatMap(actorId => ['movement', 'healing', 'combat']
                .map(channel => `${actorId}:${channel}`)).sort();
            const actualPairs = decisions.map(item => `${item.entry.actorId}:${item.entry.channel}`).sort();
            actorCoverage = canonical(actualPairs) === canonical(expectedPairs);
            addFinding(state, 'action.actor-channel-coverage', actorCoverage ? 'pass' : 'fail',
                [...items.map(item => item.source), snapshotItem.source], actorCoverage ?
                    'Every owned snapshot actor has one decision for each supported channel.' :
                    'Decision actors/channels do not match the supported M3 producer contract.',
                { tick, expected: expectedPairs, actual: actualPairs },
                [...items.map(item => item.buildId), snapshotItem.buildId]);
        }
        if (!decisions.length && !attempts.length && actorCoverage && !expectedPairs.length) {
            addFinding(state, 'action.covered-zero', 'pass', items.map(item => item.source),
                'Complete M3 coverage and a valid empty owned roster establish zero action events.',
                { tick, decisions: 0, attempts: 0 }, items.map(item => item.buildId));
        }
        for (const decision of decisions) addFinding(state, 'action.decision', 'pass', [decision.source],
            decision.entry.outcome === 'selected' ? 'Selected action decision is explicitly recorded.' :
                `Explicit ${decision.entry.outcome} decision is recorded.`,
            { tick, actorId: decision.entry.actorId, channel: decision.entry.channel,
                outcome: decision.entry.outcome, reason: decision.entry.reason,
                actionCount: decision.entry.actions.length }, [decision.entry.buildId]);
        const byActor = new Map();
        for (const attempt of attempts) {
            const list = byActor.get(attempt.entry.actorId) ?? [];
            list.push(attempt);
            byActor.set(attempt.entry.actorId, list);
            addFinding(state, 'action.attempt', 'pass', [attempt.source],
                'Production API attempt is recorded; its return code does not establish an engine effect.',
                { tick, actorId: attempt.entry.actorId, method: attempt.entry.method,
                    returnCode: attempt.entry.returnCode,
                    schedulingAccepted: attempt.entry.returnCode === null ? null :
                        attempt.entry.returnCode === 0 }, [attempt.entry.buildId]);
            const snapshot = snapshotItem?.entry;
            const actor = snapshot?.creeps.find(item => item.id === attempt.entry.actorId);
            const actorBuildMatches = snapshotItem && snapshotItem.buildId === attempt.entry.buildId;
            const actorUsable = actorBuildMatches && actor?.my === true;
            addFinding(state, 'action.actor-consistency', actorUsable ? 'pass' : actor?.my === false ? 'fail' : 'unknown',
                snapshotItem ? [attempt.source, snapshotItem.source] : [attempt.source], actorUsable ?
                    'Attempt actor is an owned creep in the compatible same-tick snapshot.' : actor?.my === false ?
                    'Attempt actor is not owned in the same-tick snapshot.' :
                    'Compatible same-tick owned actor evidence is unavailable.',
                { tick, actorId: attempt.entry.actorId },
                snapshotItem ? [attempt.entry.buildId, snapshotItem.buildId] : [attempt.entry.buildId]);
            if (!actorUsable) {
                addFinding(state, 'action.functioning-part', 'unknown', [attempt.source],
                    'No compatible owned same-tick actor snapshot is available.',
                    { tick, actorId: attempt.entry.actorId, requiredPart: requiredPart[attempt.entry.method] },
                    [attempt.entry.buildId]);
            } else {
                const part = requiredPart[attempt.entry.method];
                const eligible = (actor.activeBodyParts[part] ?? 0) > 0;
                addFinding(state, 'action.functioning-part', eligible ? 'pass' : 'fail',
                    [attempt.source, snapshots.get(tick).source], eligible ?
                        'Actor has the functioning part required for the attempted method.' :
                        'Actor lacks the functioning part required for the attempted method.',
                    { tick, actorId: actor.id, method: attempt.entry.method, requiredPart: part,
                        functioningCount: actor.activeBodyParts[part] ?? 0 },
                    [attempt.entry.buildId, snapshots.get(tick).buildId]);
            }
            if (Object.hasOwn(maximumRange, attempt.entry.method)) {
                const target = attempt.entry.target.id === null ? null :
                    snapshot?.creeps.find(item => item.id === attempt.entry.target.id);
                const targetAvailable = actorBuildMatches && target;
                const targetMatches = targetAvailable && target.x === attempt.entry.target.x &&
                    target.y === attempt.entry.target.y;
                addFinding(state, 'action.target-consistency', targetMatches ? 'pass' : targetAvailable ? 'fail' : 'unknown',
                    snapshotItem ? [attempt.source, snapshotItem.source] : [attempt.source], targetMatches ?
                        'Attempt target identity and coordinates match the same-tick snapshot.' : targetAvailable ?
                        'Attempt target coordinates conflict with the same-tick snapshot.' :
                        'Same-tick target identity and coordinates are unavailable.',
                    { tick, actorId: attempt.entry.actorId, targetId: attempt.entry.target.id,
                        recorded: { x: attempt.entry.target.x, y: attempt.entry.target.y },
                        observed: target ? { x: target.x, y: target.y } : null },
                    snapshotItem ? [attempt.entry.buildId, snapshotItem.buildId] : [attempt.entry.buildId]);
                if (!actorUsable || !targetMatches) addFinding(state, 'action.range', 'unknown',
                    snapshotItem ? [attempt.source, snapshotItem.source] : [attempt.source],
                    'Tactical range requires compatible actor and target snapshot evidence.',
                    { tick, actorId: attempt.entry.actorId, method: attempt.entry.method },
                    snapshotItem ? [attempt.entry.buildId, snapshotItem.buildId] : [attempt.entry.buildId]);
                else {
                    const range = Math.max(Math.abs(actor.x - target.x), Math.abs(actor.y - target.y));
                    const eligibleRange = range <= maximumRange[attempt.entry.method];
                    addFinding(state, 'action.range', eligibleRange ? 'pass' : 'fail',
                        [attempt.source, snapshotItem.source], eligibleRange ?
                            'Recorded tactical target is within method range.' :
                            'Recorded tactical target is outside method range.',
                        { tick, actorId: actor.id, method: attempt.entry.method, range,
                            maximumRange: maximumRange[attempt.entry.method] },
                        [attempt.entry.buildId, snapshotItem.buildId]);
                }
            }
            if (attempt.entry.method === 'moveTo') movement.push(attempt);
        }
        for (const [actorId, actorAttempts] of byActor) {
            const compatible = attemptsCompatible(actorAttempts);
            addFinding(state, 'action.command-compatibility', compatible ? 'pass' : 'fail',
                actorAttempts.map(item => item.source), compatible ?
                    'Same-tick attempted methods are compatible.' :
                    'Same-tick attempted methods conflict under the documented Arena rules.',
                { tick, actorId, methods: actorAttempts.map(item => item.entry.method) },
                actorAttempts.map(item => item.buildId));
        }
    }
    return movement;
}

function analyzeObservedChanges(state, snapshots, movement) {
    for (const attempt of movement) {
        const tick = attempt.entry.tick;
        const current = snapshots.get(tick);
        const next = snapshots.get(tick + 1);
        const actor = current?.entry.creeps.find(item => item.id === attempt.entry.actorId);
        const later = next?.entry.creeps.find(item => item.id === attempt.entry.actorId);
        const compatibleBuilds = current && next && attempt.entry.buildId === current.buildId &&
            current.buildId === next.buildId;
        if (!actor || actor.my !== true || !later || later.my !== true || !compatibleBuilds) {
            addFinding(state, 'movement.observed-displacement', 'unknown',
                [attempt.source, ...[current?.source, next?.source].filter(Boolean)],
                'Consecutive compatible actor snapshots are unavailable; displacement is unknown.',
                { tick, actorId: attempt.entry.actorId, returnCode: attempt.entry.returnCode },
                [attempt.entry.buildId, current?.buildId, next?.buildId]);
            continue;
        }
        const dx = later.x - actor.x;
        const dy = later.y - actor.y;
        addFinding(state, 'movement.observed-displacement', 'pass',
            [attempt.source, current.source, next.source],
            'Consecutive snapshots provide a displacement observation; no causality is assigned.',
            { tick, actorId: actor.id, from: { x: actor.x, y: actor.y },
                to: { x: later.x, y: later.y }, dx, dy, moved: dx !== 0 || dy !== 0,
                returnCode: attempt.entry.returnCode },
            [attempt.entry.buildId, current.buildId, next.buildId]);
    }
    for (const [tick, current] of [...snapshots].sort(([a], [b]) => a - b)) {
        const next = snapshots.get(tick + 1);
        for (const creep of current.entry.creeps) {
            const later = next?.entry.creeps.find(item => item.id === creep.id);
            if (!later || current.buildId !== next?.buildId) {
                addFinding(state, 'health.consecutive-delta', 'unknown',
                    [current.source, ...[next?.source].filter(Boolean)],
                    'Consecutive compatible snapshot for this creep is unavailable; health delta is unknown.',
                    { tick, actorId: creep.id }, [current.buildId, next?.buildId]);
                continue;
            }
            addFinding(state, 'health.consecutive-delta', 'pass', [current.source, next.source],
                'Health delta is observed across consecutive snapshots; no damage or healing causality is assigned.',
                { tick, actorId: creep.id, fromHits: creep.hits, toHits: later.hits,
                    delta: later.hits - creep.hits }, [current.buildId, next.buildId]);
        }
    }
}

export function analyzeReplay({ root = projectRoot, replayId, fingerprints, scoreFingerprints } = {}) {
    if (!replayIdPattern.test(replayId ?? '')) throw new Error('Expected a verified 24-character replay ID');
    if (fingerprints !== undefined && (!Array.isArray(fingerprints) ||
        fingerprints.some(item => !fingerprintPattern.test(item)))) {
        throw new Error('Fingerprints must be full SHA-256 strings');
    }
    if (scoreFingerprints !== undefined && (!Array.isArray(scoreFingerprints) ||
        !scoreFingerprints.length || scoreFingerprints.some(item => !fingerprintPattern.test(item)))) {
        throw new Error('Score fingerprints must be a nonempty array of full SHA-256 strings');
    }
    const resolvedRoot = path.resolve(root);
    const directory = path.join(resolvedRoot, 'replay_logs');
    const manifestPath = 'replay_logs/manifest.json';
    const state = { replayId, selectedFingerprints: fingerprints ?? [], findings: [] };
    const localId = localBuildId(resolvedRoot);
    let manifestBytes;
    try {
        const directoryStat = fs.lstatSync(directory);
        if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() ||
            fs.realpathSync(directory) !== path.join(fs.realpathSync(resolvedRoot), 'replay_logs')) {
            throw new Error('replay_logs is not a real directory inside the analysis root');
        }
        const stat = fs.lstatSync(path.join(directory, 'manifest.json'));
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('manifest is not a regular non-symlink file');
        manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
    } catch (error) {
        addFinding(state, 'manifest.schema', 'fail', [evidence(manifestPath)],
            `Cannot read manifest: ${error.message}.`);
        return finalReport(state, localId, [null]);
    }
    let manifest;
    try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
    catch {
        addFinding(state, 'manifest.schema', 'fail', [evidence(manifestPath)], 'Manifest is not valid JSON.');
        return finalReport(state, localId, [null]);
    }
    if (!plainObject(manifest) || manifest.version !== 2 || !Array.isArray(manifest.maps) ||
        !Array.isArray(manifest.replays) || !Array.isArray(manifest.records)) {
        addFinding(state, 'manifest.schema', 'fail', [evidence(manifestPath)],
            'Only manifest version 2 with maps, replays, and records arrays is supported.');
        return finalReport(state, localId, [null]);
    }
    addFinding(state, 'manifest.schema', 'pass', [evidence(manifestPath)], 'Manifest version 2 schema is readable.');
    const requested = fingerprints ? new Set(fingerprints) : null;
    const selected = manifest.records.filter(item => item?.replayId === replayId &&
        (!requested || requested.has(item.fingerprint)));
    state.selectedFingerprints = selected.map(item => item.fingerprint);
    if (requested) for (const fingerprint of requested) if (!selected.some(item => item.fingerprint === fingerprint)) {
        addFinding(state, 'manifest.record-selection', 'unknown',
            [evidence(manifestPath, { fingerprint })], 'Requested fingerprint is not present for this replay.',
            null, [null]);
    }
    if (!selected.length) {
        addFinding(state, 'manifest.record-selection', 'unknown', [evidence(manifestPath)],
            'No current manifest records were selected for this replay.');
        if (scoreFingerprints === undefined) return finalReport(state, localId, [null]);
    }
    const selectedBuildIds = selected.map(item => item.buildId ?? null);
    const tagged = [...new Set(selectedBuildIds.filter(validBuildId))];
    if (selected.length) addFinding(state, 'build.replay-consistency', tagged.length > 1 ? 'fail' :
        tagged.length ? 'pass' : 'unknown',
        selected.map(item => evidence(manifestPath, { fingerprint: item.fingerprint })),
        tagged.length > 1 ? 'Selected records contain conflicting build IDs.' : tagged.length ?
            'Selected tagged records use one build ID; legacy records remain independently unknown.' :
            'Selected records have legacy unknown build provenance.', { buildIds: tagged }, selectedBuildIds);

    const mapResult = selected.length ? validateMapEvidence(state, directory, manifestPath, manifest, selected) :
        { active: null, registration: null, map: null };
    const contexts = selected.map(record => validateManifestRecord(state, record, directory,
        manifestPath, mapResult.active, mapResult.registration));
    const trusted = contexts.filter(item => item.trusted);
    const snapshotLines = trusted.filter(item => item.outputValid).flatMap(item => item.gameLines);
    const diagnosticLines = trusted.filter(item => item.diagnosticsValid).flatMap(item => item.diagnostics);
    const snapshots = mergeSnapshots(state, snapshotLines);
    const merged = mergeDiagnostics(state, diagnosticLines, [...snapshots.values()]);
    if (selected.length) {
        mapFlagChecks(state, mapResult.map, snapshots);
        analyzeCpuMeasurements(state, merged, snapshots);
        analyzeMembership(state, merged, snapshots);
        const movement = analyzeActions(state, merged, snapshots);
        analyzeObservedChanges(state, snapshots, movement);
    }
    if (scoreFingerprints !== undefined) {
        const result = analyzeScoreEvidence({ directory, manifest, replayId, scoreFingerprints,
            snapshots, merged, selectedBuildIds,
            addFinding: (rule, verdict, refs, message, observed = null, buildIds = [null]) =>
                addFinding(state, rule, verdict, refs, message, observed, buildIds) });
        state.selectedScoreFingerprints = result.selectedScoreFingerprints;
        state.scoring = result.scoring;
    }
    return finalReport(state, localId, selectedBuildIds);
}

function* jsonValueChunks(value, depth) {
    if (value === null || typeof value !== 'object') {
        yield JSON.stringify(value) ?? 'null';
        return;
    }
    const indentation = '  '.repeat(depth);
    const childIndentation = '  '.repeat(depth + 1);
    if (Array.isArray(value)) {
        yield '[';
        for (const [index, item] of value.entries()) {
            yield `${index ? ',\n' : '\n'}${childIndentation}`;
            yield* jsonValueChunks(item, depth + 1);
        }
        if (value.length) yield `\n${indentation}`;
        yield ']';
        return;
    }
    const entries = Object.entries(value).filter(([, item]) =>
        !['undefined', 'function', 'symbol'].includes(typeof item));
    yield '{';
    for (const [index, [key, item]] of entries.entries()) {
        yield `${index ? ',\n' : '\n'}${childIndentation}${JSON.stringify(key)}: `;
        yield* jsonValueChunks(item, depth + 1);
    }
    if (entries.length) yield `\n${indentation}`;
    yield '}';
}

export function* jsonReportChunks(report) {
    yield* jsonValueChunks(report, 0);
    yield '\n';
}

function writeChunk(writable, chunk) {
    if (writable.destroyed || writable.closed || writable.writableEnded || writable.writableFinished) {
        return Promise.reject(new Error('Output stream is not writable'));
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            writable.off('error', onError);
            writable.off('close', onClose);
        };
        const finish = error => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve();
        };
        const onError = error => finish(error);
        const onClose = () => finish(new Error('Output stream closed before the write completed'));
        writable.once('error', onError);
        writable.once('close', onClose);
        try {
            writable.write(chunk, error => {
                if (!error) finish();
            });
        } catch (error) {
            finish(error);
        }
    });
}

export async function writeJsonReport(report, writable = process.stdout) {
    let buffered = '';
    for (const chunk of jsonReportChunks(report)) {
        buffered += chunk;
        if (buffered.length < 64 * 1024) continue;
        await writeChunk(writable, buffered);
        buffered = '';
    }
    if (buffered) await writeChunk(writable, buffered);
}

async function main() {
    const [replayId, ...args] = process.argv.slice(2);
    if (!replayId) throw new Error(
        'Usage: node tools/replay-analysis.js <replay-id> [log-fingerprint...] [--score score-fingerprint...]');
    const marker = args.indexOf('--score');
    if (marker !== args.lastIndexOf('--score')) throw new Error('Use --score at most once');
    const fingerprints = marker < 0 ? args : args.slice(0, marker);
    const scoreFingerprints = marker < 0 ? undefined : args.slice(marker + 1);
    if (marker >= 0 && !scoreFingerprints.length) throw new Error('--score requires at least one fingerprint');
    const report = analyzeReplay({ root: projectRoot, replayId,
        fingerprints: fingerprints.length ? fingerprints : undefined, scoreFingerprints });
    await writeJsonReport(report);
    if (report.summary.fail) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

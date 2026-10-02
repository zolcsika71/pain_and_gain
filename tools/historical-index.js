import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeReplay } from './replay-analysis.js';
import { canonical, sha256 } from './replay-logs.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hashPattern = /^[a-f0-9]{64}$/;
const replayPattern = /^[a-f0-9]{24}$/;
const dependencies = ['tools/historical-index.js', 'tools/replay-analysis.js',
    'tools/replay-score-analysis.js', 'tools/replay-logs.js', 'src/config.js',
    'src/debug/build-id.js'];

function managedBytes(root, name) {
    if (typeof name !== 'string' || path.basename(name) !== name) {
        throw new Error(`Unsafe managed evidence path: ${name}`);
    }
    const file = path.join(root, 'replay_logs', name);
    if (!fs.lstatSync(file).isFile()) throw new Error(`Unavailable managed evidence file: ${name}`);
    return fs.readFileSync(file);
}

function validateSelection(selection) {
    if (selection?.version !== 1 || !/^codex\/[a-z0-9-]+$/.test(selection.taskId ?? '') ||
        !Array.isArray(selection.matches) || !selection.matches.length ||
        selection.matches.length > 8) throw new Error('Expected version-1 selection with a task ID and 1–8 matches');
    const seen = new Set();
    for (const match of selection.matches) {
        const logs = match.logFingerprints, scores = match.scoreFingerprints ?? [];
        if (!replayPattern.test(match.replayId ?? '') || seen.has(match.replayId) ||
            !Array.isArray(logs) || !Array.isArray(scores) || (!logs.length && !scores.length) ||
            [...logs, ...scores].some(x => !hashPattern.test(x)) ||
            new Set(logs).size !== logs.length || new Set(scores).size !== scores.length ||
            typeof match.opponent !== 'string' || !match.opponent ||
            typeof match.configuration?.label !== 'string' || !match.configuration.label ||
            typeof match.configuration?.basis !== 'string' || !match.configuration.basis ||
            (match.configuration.expectedBuildId !== null &&
                !hashPattern.test(match.configuration.expectedBuildId ?? '')) ||
            match.reportedFinalTick !== undefined &&
                (!Number.isSafeInteger(match.reportedFinalTick) || match.reportedFinalTick < 1)) {
            throw new Error(`Invalid explicit selection for ${match.replayId ?? 'unknown replay'}`);
        }
        seen.add(match.replayId);
    }
}

function sourceStatus(manifest, match, logRecords, scoreRecords) {
    const replay = manifest.replays.find(r => r.replayId === match.replayId);
    const selected = [
        ...match.logFingerprints.map(fingerprint => ({ kind: 'log', fingerprint,
            record: logRecords.find(r => r.fingerprint === fingerprint),
            retired: replay?.retiredFingerprints?.includes(fingerprint) ?? false })),
        ...(match.scoreFingerprints ?? []).map(fingerprint => ({ kind: 'score', fingerprint,
            record: scoreRecords.find(r => r.fingerprint === fingerprint),
            retired: manifest.retiredScoreSources?.some(r => r.replayId === match.replayId &&
                r.fingerprint === fingerprint) ?? false })),
    ];
    return selected.map(item => ({ ...item, availability: item.record ? 'current'
        : item.retired ? 'retired' : 'missing' }));
}

function cacheInput(root, manifest, match, selected) {
    const replay = manifest.replays.find(r => r.replayId === match.replayId) ?? null;
    const source = selected.filter(x => x.record).map(item => {
        const { reviews, status, importedAt, ...record } = item.record;
        const bytes = record.outputPath ? managedBytes(root, record.outputPath) : null;
        if (bytes && sha256(bytes) !== record.outputFingerprint) {
            throw new Error(`Changed managed evidence: ${item.fingerprint}`);
        }
        return { kind: item.kind, record, bytesHash: bytes ? sha256(bytes) : null };
    });
    const mapIds = new Set(source.map(x => x.record.mapId).filter(Boolean));
    if (replay?.mapId) mapIds.add(replay.mapId);
    const maps = [...mapIds].sort().map(id => {
        const record = manifest.maps.find(m => m.id === id) ?? null;
        return { record, bytesHash: record ? sha256(managedBytes(root, record.file)) : null };
    });
    const code = dependencies.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]);
    return sha256(canonical({ match, source, replay, maps, code }));
}

function summarizedGroups(report, verdict) {
    return (report.findingSummary ?? []).filter(x => x.verdict === verdict).map(x => ({
        rule: x.rule, count: x.count, provenance: x.provenance,
        firstTick: x.firstTick ?? null, lastTick: x.lastTick ?? null,
        reference: x.representativeEvidence?.[0] ?? null,
    }));
}

function summarizeScores(report, selected, unavailableStatus = 'unavailable') {
    const sources = selected.filter(item => item.kind === 'score');
    if (!sources.length) return undefined;
    const current = sources.filter(item => item.availability === 'current');
    const scoring = report?.scoring;
    if (!scoring) return { status: unavailableStatus, selectedSourceCount: sources.length,
        currentSourceCount: current.length, coverage: null,
        latestObservation: { status: 'unavailable' }, uncertainty: null };

    const observations = scoring.scoreProgression ?? [];
    const times = observations.map(item => item.gameTime).filter(Number.isSafeInteger);
    const scoredTimes = observations.filter(item => Number.isSafeInteger(item.cumulativeScore) ||
        Number.isSafeInteger(item.displayedGain)).map(item => item.gameTime);
    const lastGameTime = scoredTimes.length ? scoredTimes.reduce((a, b) => Math.max(a, b)) : null;
    const latest = observations.filter(item => item.gameTime === lastGameTime);
    const groupIds = [...new Set(latest.map(item => item.groupId))];
    const group = groupIds.length === 1 ? scoring.groups?.find(item => item.id === groupIds[0]) : null;
    const segments = new Map((scoring.segments ?? []).map(item => [item.id, item]));
    const groupSourceFingerprints = group?.segmentIds.map(id => segments.get(id)?.sourceFingerprint);
    const groupSources = groupSourceFingerprints ? [...new Set(groupSourceFingerprints)].sort() : [];
    const uniqueSlots = new Set(latest.map(item => item.slot)).size === latest.length;
    const latestObservation = lastGameTime === null ? { status: 'unavailable' } :
        !group || !uniqueSlots || groupSourceFingerprints.some(value => !value ||
            !current.some(item => item.fingerprint === value)) ?
            { status: 'ambiguous', gameTime: lastGameTime, groupCount: groupIds.length } :
            { status: 'available', gameTime: lastGameTime, groupId: group.id,
                groupSourceCount: groupSources.length,
                groupSourceFingerprints: groupSources.slice(0, 3),
                groupSourcesAbbreviated: groupSources.length > 3,
                slots: latest.map(item => ({ slot: item.slot, player: item.player,
                    cumulativeScore: item.cumulativeScore, displayedGain: item.displayedGain,
                    derivedScoreChange: item.derivedScoreChange, derivedStatus: item.derivedStatus }))
                    .sort((a, b) => a.slot.localeCompare(b.slot)) };
    return { status: scoredTimes.length ? 'observed' : 'no-score-value',
        selectedSourceCount: sources.length, currentSourceCount: current.length,
        sourceIntegrity: { verified: scoring.sources?.filter(item => item.integrity === 'verified').length ?? 0,
            invalid: scoring.sources?.filter(item => item.integrity === 'invalid').length ?? 0 },
        coverage: { frameSourcesWithCoverage: scoring.sources?.filter(item =>
            Number.isSafeInteger(item.coverage?.validFrames)).length ?? 0,
        sourceValidFrames: scoring.sources?.reduce((total, item) =>
            total + (item.coverage?.validFrames ?? 0), 0) ?? 0,
        observations: observations.length,
        cumulativeScoreValues: observations.filter(item => Number.isSafeInteger(item.cumulativeScore)).length,
        displayedGainValues: observations.filter(item => Number.isSafeInteger(item.displayedGain)).length,
        derivedChangeValues: observations.filter(item => Number.isSafeInteger(item.derivedScoreChange)).length,
        firstObservedGameTime: times.length ? times.reduce((a, b) => Math.min(a, b)) : null,
        lastObservedGameTime: times.length ? times.reduce((a, b) => Math.max(a, b)) : null,
        lastScoredGameTime: lastGameTime,
        groupCount: scoring.groups?.length ?? 0 },
        latestObservation,
        uncertainty: { mapping: scoring.mapping?.status ?? 'unknown',
            alignment: scoring.alignment?.status ?? 'unknown',
            buildAssociation: scoring.buildAssociation?.status ?? 'unknown',
            terminal: scoring.terminal?.status ?? 'unknown' } };
}

function cachedReport(root, match, key, current, analyze) {
    const name = `historical-${match.replayId}-${sha256(canonical({
        logs: match.logFingerprints, scores: match.scoreFingerprints ?? [],
    })).slice(0, 12)}.json`;
    const dir = path.join(root, 'replay_logs/analysis_cache');
    const file = path.join(dir, name);
    try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (cached.key === key && cached.report?.reportMode === 'compact' &&
            cached.report.replayId === match.replayId &&
            cached.reportHash === sha256(canonical(cached.report))) {
            return { report: cached.report, cache: 'hit' };
        }
    } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    const logs = current.filter(x => x.kind === 'log').map(x => x.fingerprint);
    const scores = current.filter(x => x.kind === 'score').map(x => x.fingerprint);
    const report = analyze({ root, replayId: match.replayId, fingerprints: logs,
        ...(scores.length ? { scoreFingerprints: scores } : {}), reportMode: 'compact' });
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ key, reportHash: sha256(canonical(report)), report })}\n`);
    fs.renameSync(temp, file);
    return { report, cache: 'miss' };
}

export function buildHistoricalIndex({ root = projectRoot, selection, analyze = analyzeReplay }) {
    validateSelection(selection);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'replay_logs/manifest.json')));
    if (manifest.version !== 2 || !Array.isArray(manifest.records) ||
        !Array.isArray(manifest.replays) || !Array.isArray(manifest.maps)) {
        throw new Error('Expected managed manifest version 2');
    }
    const matches = selection.matches.map(match => {
        const logs = manifest.records.filter(r => r.replayId === match.replayId);
        const scores = (manifest.scoreRecords ?? []).filter(r => r.replayId === match.replayId);
        const selected = sourceStatus(manifest, match, logs, scores);
        const current = selected.filter(x => x.availability === 'current');
        for (const item of current) if (!item.record.reviews?.[selection.taskId]?.claimedAt) {
            throw new Error(`Claim ${match.replayId}/${item.fingerprint} for ${selection.taskId} before analysis`);
        }
        const unavailable = selected.filter(x => x.availability !== 'current').map(x => ({
            kind: x.kind, fingerprint: x.fingerprint, reason: x.availability,
        }));
        const replay = manifest.replays.find(r => r.replayId === match.replayId);
        const buildIds = [...new Set(current.filter(x => x.kind === 'log')
            .map(x => x.record.buildId ?? null))];
        const mapIds = [...new Set(current.filter(x => x.kind === 'log')
            .map(x => x.record.mapChecksum ?? null))];
        const base = { replayId: match.replayId, opponent: match.opponent,
            configuration: match.configuration, buildIds,
            mapChecksums: mapIds.length ? mapIds : [manifest.maps.find(m => m.id === replay?.mapId)?.checksum ?? null],
            selectedEvidence: selected.map(x => ({ kind: x.kind, fingerprint: x.fingerprint,
                availability: x.availability })), unavailable };
        const duplicate = selected.find(item => (item.kind === 'log' ? logs : scores)
            .filter(record => record.fingerprint === item.fingerprint).length > 1);
        if (duplicate) return { ...base, status: 'invalid', cache: 'none',
            unavailable: [...unavailable, { kind: duplicate.kind, fingerprint: duplicate.fingerprint,
                reason: 'duplicate current records' }], coverage: null,
            supportedFindings: [], unknowns: [],
            ...(match.scoreFingerprints?.length ? { scoreSummary: summarizeScores(null, selected, 'invalid') } : {}) };
        if (!current.length) return { ...base, status: 'unavailable', cache: 'none',
            coverage: null, supportedFindings: [], unknowns: [],
            ...(match.scoreFingerprints?.length ? { scoreSummary: summarizeScores(null, selected) } : {}) };
        let key;
        try { key = cacheInput(root, manifest, match, selected); }
        catch (error) {
            return { ...base, status: error.code === 'ENOENT' ? 'unavailable' : 'invalid', cache: 'none',
                unavailable: [...unavailable, { reason: error.message }], coverage: null,
                supportedFindings: [], unknowns: [],
                ...(match.scoreFingerprints?.length ? { scoreSummary: summarizeScores(null, selected,
                    error.code === 'ENOENT' ? 'unavailable' : 'invalid') } : {}) };
        }
        const { report, cache } = cachedReport(root, match, key, current, analyze);
        const trusted = report.evidenceSummary?.trustedLogRecords ===
            current.filter(x => x.kind === 'log').length;
        const currentScores = current.filter(x => x.kind === 'score').map(x => x.fingerprint);
        const trustedScores = !match.scoreFingerprints?.length || report.scoring &&
            canonical(report.selectedScoreFingerprints ?? []) === canonical(currentScores.slice().sort()) &&
            canonical(report.scoring.sources?.map(x => x.fingerprint).sort() ?? []) ===
                canonical(currentScores.slice().sort()) &&
            report.scoring.sources.every(x => x.integrity === 'verified');
        const configurationCheck = match.configuration.expectedBuildId === null ? 'unverified' :
            buildIds.length === 1 && buildIds[0] === match.configuration.expectedBuildId ?
                'expected-build-matched' : 'build-mismatch';
        const status = report.summary?.fail || configurationCheck === 'build-mismatch' ? 'invalid' :
            unavailable.length || !trusted || !trustedScores || configurationCheck === 'unverified' ?
                'partial' : 'analyzed';
        const ranges = report.evidenceSummary?.snapshots?.tickRanges ?? [];
        const last = ranges.at(-1)?.last ?? null;
        return { ...base, status, cache,
            coverage: { snapshots: report.evidenceSummary?.snapshots ?? null,
                completeDiagnosticTicks: report.evidenceSummary?.completeDiagnosticTicks ?? null,
                reportedFinalTick: match.reportedFinalTick ?? null,
                terminal: last !== null && match.reportedFinalTick && last < match.reportedFinalTick
                    ? 'last-reported-tick-not-captured' : 'not-established' },
            analyzerSummary: report.summary,
            configurationCheck,
            supportedFindings: status === 'analyzed' ? summarizedGroups(report, 'pass') : [],
            unknowns: summarizedGroups(report, 'unknown'),
            failures: summarizedGroups(report, 'fail'),
            ...(match.scoreFingerprints?.length ? { scoreSummary: summarizeScores(report, selected) } : {}) };
    });
    return { indexVersion: 1, selectionTaskId: selection.taskId,
        comparisonPolicy: 'No cross-match pooling: compare build, documented configuration, opponent, map, and coverage separately.',
        matches };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length !== 3) throw new Error('Usage: node tools/historical-index.js <selection.json>');
        const selection = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
        process.stdout.write(`${JSON.stringify(buildHistoricalIndex({ selection }), null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

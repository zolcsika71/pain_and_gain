import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeReplay } from './replay-analysis.js';
import { canonical, sha256 } from './replay-logs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const holdReason = 'scout-owned-flag-hold';
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function managedBytes(name) {
    if (typeof name !== 'string' || path.basename(name) !== name) {
        throw new Error(`Unsafe managed evidence path: ${name}`);
    }
    const file = path.join(root, 'replay_logs', name);
    if (!fs.lstatSync(file).isFile()) throw new Error(`Unsafe managed evidence file: ${name}`);
    return fs.readFileSync(file);
}

function reportSource(snapshot, decisions) {
    return { snapshot: snapshot?.fingerprint ?? null,
        decision: decisions?.[0]?.fingerprint ?? null };
}

function followingObservation(byTick, hold, release, actorId) {
    const expectedTick = hold.tick + 2;
    const after = byTick.get(expectedTick);
    const source = after ? { fingerprint: after.fingerprint ?? null,
        tick: after.state?.tick ?? null, buildId: after.state?.buildId ?? null } : null;
    let status = 'missing-snapshot', observedAfter = null;
    if (after) {
        if (hold.state.tick !== hold.tick || release.tick !== hold.tick + 1 ||
            release.state.tick !== release.tick || after.tick !== expectedTick ||
            after.state?.tick !== expectedTick) status = 'incompatible-tick';
        else if (!hold.state.buildId || hold.state.buildId !== release.state.buildId ||
            after.state.buildId !== hold.state.buildId) status = 'incompatible-build';
        else if (!after.fingerprint) status = 'missing-provenance';
        else {
            const actor = after.state.creeps.find(c => c.id === actorId);
            if (actor) {
                status = 'observed';
                observedAfter = { x: actor.x, y: actor.y };
            } else status = 'actor-absent';
        }
    }
    return { observedAfter, followingPosition: { status, expectedTick, source,
        position: observedAfter } };
}

export function summarizeHoldRelease(snapshots, entries, scoutIds, completeTicks) {
    const byTick = new Map(snapshots.map(s => [s.tick, s]));
    const grouped = new Map();
    for (const item of entries) {
        const e = item.entry;
        if (!['action-decision', 'action-attempt'].includes(e.type) || e.channel !== 'movement') continue;
        const key = `${e.tick}:${e.actorId}:${e.type}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item);
    }
    const get = (tick, actor, type) => grouped.get(`${tick}:${actor}:${type}`) ?? [];
    let holds = 0, offFlagHolds = 0;
    const transitions = [];
    const guardViolations = [];
    for (const actorId of scoutIds) for (const item of snapshots) {
        const s = item.state, actor = s.creeps.find(c => c.id === actorId);
        const decisions = get(s.tick, actorId, 'action-decision');
        const held = decisions.length === 1 && decisions[0].entry.reason === holdReason &&
            decisions[0].entry.outcome === 'hold';
        if (!held || !actor) continue;
        holds++;
        const flag = s.flags.find(f => f.id === s.selectedFlagId);
        if (flag && range(actor, flag) > 0) offFlagHolds++;
        if (flag && completeTicks.has(s.tick) && decisions[0].entry.buildId === s.buildId) {
            const threats = s.creeps.filter(c => !c.my && c.hits > 0 &&
                (range(c, actor) <= 5 || range(c, flag) <= 5)).map(c => c.id);
            if (threats.length) guardViolations.push({ actorId, tick: s.tick, threats,
                source: reportSource(item, decisions) });
        }
        const next = byTick.get(s.tick + 1);
        if (!next) continue;
        const nextDecisions = get(s.tick + 1, actorId, 'action-decision');
        const continuedHold = nextDecisions.length === 1 &&
            nextDecisions[0].entry.reason === holdReason && nextDecisions[0].entry.outcome === 'hold';
        const nextActor = next.state.creeps.find(c => c.id === actorId);
        const nextFlag = next.state.flags.find(f => f.id === next.state.selectedFlagId);
        const threats = nextActor && nextFlag ? next.state.creeps.filter(c => !c.my && c.hits > 0 &&
            (range(c, nextActor) <= 5 || range(c, nextFlag) <= 5)).map(c => c.id) : [];
        if (continuedHold && !threats.length) continue;
        const attempts = get(s.tick + 1, actorId, 'action-attempt');
        const decision = nextDecisions[0]?.entry;
        const sameBuild = !!s.buildId && s.buildId === next.state.buildId &&
            decisions[0]?.entry.buildId === s.buildId &&
            nextDecisions.every(d => d.entry.buildId === s.buildId) &&
            attempts.every(a => a.entry.buildId === s.buildId);
        const covered = completeTicks.has(s.tick) && completeTicks.has(s.tick + 1);
        const guardRelease = threats.length > 0 && nextActor && nextFlag?.owner === 'me' &&
            nextActor.hits === nextActor.hitsMax && nextActor.fatigue === 0 &&
            range(nextActor, nextFlag) <= 2;
        const expected = decision?.outcome === 'selected' && decision.reason === 'flag-fallback' &&
            decision.actions?.length === 1 && decision.actions[0].method === 'moveTo' &&
            decision.actions[0].target?.id === nextFlag?.id && attempts.length === 1 &&
            attempts[0].entry.method === 'moveTo' && attempts[0].entry.target?.id === nextFlag?.id &&
            attempts[0].entry.returnCode === 0;
        let verdict = 'unexercised';
        if (threats.length) {
            if (!sameBuild || !nextActor || !nextFlag) verdict = 'unknown';
            else if (guardRelease) {
                if (!covered) verdict = 'unknown';
                else if (continuedHold || nextDecisions.length !== 1) verdict = 'fail';
                else verdict = decision?.reason === 'flag-fallback'
                    ? (expected ? 'pass' : 'fail') : 'unknown';
            }
        }
        const following = followingObservation(byTick, item, next, actorId);
        transitions.push({ actorId, holdTick: s.tick, releaseTick: s.tick + 1,
            cause: threats.length ? 'nearby-enemy' : 'other-or-unknown', threats,
            verdict,
            decision: decision ? { outcome: decision.outcome, reason: decision.reason,
                targetId: decision.actions?.[0]?.target?.id ?? null } : null,
            attempts: attempts.map(a => ({ method: a.entry.method,
                targetId: a.entry.target?.id ?? null, returnCode: a.entry.returnCode })),
            ...following,
            sources: { hold: reportSource(item, decisions),
                release: reportSource(next, nextDecisions),
                attempts: attempts.map(a => a.fingerprint) } });
    }
    const target = transitions.filter(t => t.cause === 'nearby-enemy' && t.verdict !== 'unexercised');
    const enemyReleaseCandidates = { pass: 0, fail: 0, unknown: 0 };
    for (const transition of target) enemyReleaseCandidates[transition.verdict]++;
    return { scoutIds, holds, offFlagHolds, transitions, guardViolations,
        enemyReleaseCandidates,
        enemyRelease: guardViolations.length || enemyReleaseCandidates.fail ? 'fail'
            : enemyReleaseCandidates.unknown ? 'unknown'
                : enemyReleaseCandidates.pass ? 'pass' : 'unexercised' };
}

function selectedEvidence(replayId, taskId) {
    const directory = path.join(root, 'replay_logs');
    const manifestFile = path.join(directory, 'manifest.json');
    if (!fs.lstatSync(directory).isDirectory() ||
        fs.realpathSync(directory) !== path.join(fs.realpathSync(root), 'replay_logs') ||
        !fs.lstatSync(manifestFile).isFile()) {
        throw new Error('Unsafe managed evidence directory or manifest');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestFile));
    if (manifest?.version !== 2 || !Array.isArray(manifest.records) ||
        !Array.isArray(manifest.replays) || !Array.isArray(manifest.maps)) {
        throw new Error('Unsupported managed evidence manifest');
    }
    const records = manifest.records.filter(r => r.replayId === replayId)
        .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
    if (!records.length) throw new Error(`No managed log records for ${replayId}`);
    for (const record of records) if (!record.reviews?.[taskId]?.claimedAt) {
        throw new Error(`Claim ${record.fingerprint} for ${taskId} before screening`);
    }
    const source = records.map(r => {
        const bytes = r.outputPath ? managedBytes(r.outputPath) : null;
        const mapBytes = managedBytes(r.mapFile);
        // Mirror selected manifest validation inputs, not unrelated review/annotation data.
        return { fingerprint: r.fingerprint, sourceKey: r.sourceKey, buildId: r.buildId,
            requestedTick: r.requestedTick, sourceEntry: r.sourceEntry,
            importedAt: r.importedAt, status: r.status,
            outputPath: r.outputPath, outputFingerprint: r.outputFingerprint,
            outputBytes: bytes ? sha256(bytes) : null,
            mapId: r.mapId, mapFile: r.mapFile, mapChecksum: r.mapChecksum, mapBytes: sha256(mapBytes),
            diagnostics: sha256(canonical(r.otherEntries.map(e => sha256(canonical({
                key: e.key, type: e.type, formatVersion: e.formatVersion, raw: e.raw,
            }))))),
            coverage: r.coverage, diagnosticCoverage: r.diagnosticCoverage };
    });
    // All matching associations matter (including duplicates). The analyzer resolves
    // the first active association and the first registration matching its map ID.
    const associations = manifest.replays.filter(r => r?.replayId === replayId);
    const active = associations.find(r => r.status === 'active');
    const registration = manifest.maps.find(m => m?.id === active?.mapId);
    const linkage = { associations: associations.map(r => ({ replayId: r.replayId,
        status: r.status, mapId: r.mapId, buildId: r.buildId })),
    registration: registration ? { id: registration.id, status: registration.status,
        checksum: registration.checksum, file: registration.file } : null };
    const dependencies = ['tools/scout-hold-screen.js', 'tools/replay-analysis.js',
        'tools/replay-logs.js', 'tools/replay-score-analysis.js', 'src/config.js',
        'src/debug/build-id.js'].map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]);
    return { records, key: sha256(canonical({ replayId, source, linkage, dependencies })) };
}

export function screenReplay(replayId, taskId, expectedBuildId) {
    if (!/^[a-f0-9]{24}$/.test(replayId) || !/^codex\/[a-z0-9-]+$/.test(taskId) ||
        !/^[a-f0-9]{64}$/.test(expectedBuildId)) {
        throw new Error('Usage: node tools/scout-hold-screen.js <replay-id> <codex/task-id> <expected-build-id>');
    }
    const { records, key } = selectedEvidence(replayId, taskId);
    if (records.some(r => r.buildId !== expectedBuildId)) {
        throw new Error(`Replay log build does not match ${expectedBuildId}`);
    }
    const cacheDir = path.join(root, 'replay_logs/analysis_cache');
    // Legacy replay-only entries lack current validation dependencies. Retain them;
    // key-addressed entries also preserve earlier reports when selected inputs change.
    const cacheFile = path.join(cacheDir, `scout-hold-${replayId}-${key}.json`);
    if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile));
        if (cached.key === key) return { report: cached.report, cache: 'hit' };
    }
    const analysis = analyzeReplay({ root, replayId,
        fingerprints: records.map(r => r.fingerprint), reportMode: 'compact' });
    if (analysis.summary.fail || analysis.evidenceSummary.trustedLogRecords !== records.length) {
        throw new Error('Managed evidence did not pass replay analyzer validation');
    }
    const states = new Map(), diagnostics = new Map(), completeTicks = new Set();
    for (const r of records) {
        const coveredTypes = r.diagnosticCoverage?.coveredTypes ?? [];
        if (coveredTypes.includes('action-decision') && coveredTypes.includes('action-attempt')) {
            for (const tick of r.diagnosticCoverage.completeTicks) completeTicks.add(tick);
        }
        if (r.outputPath) {
            for (const line of managedBytes(r.outputPath).toString('utf8').trim().split('\n')) {
                const state = JSON.parse(line), old = states.get(state.tick);
                if (old && canonical(old.state) !== canonical(state)) throw new Error(`Conflicting tick ${state.tick}`);
                states.set(state.tick, { tick: state.tick, state, fingerprint: r.fingerprint });
            }
        }
        for (const item of r.otherEntries) {
            if (!['membership-baseline', 'action-decision', 'action-attempt'].includes(item.type)) continue;
            const entry = JSON.parse(item.raw), old = diagnostics.get(entry.recordId);
            if (old && canonical(old.entry) !== canonical(entry)) throw new Error(`Conflicting record ${entry.recordId}`);
            diagnostics.set(entry.recordId, { entry, fingerprint: r.fingerprint });
        }
    }
    const entries = [...diagnostics.values()];
    const baseline = entries.find(e => e.entry.type === 'membership-baseline' && e.entry.initialized);
    const scoutIds = baseline?.entry.members.filter(m => m.role === 'scout' &&
        m.originalParts.move > 0 && Object.entries(m.originalParts).every(([part, count]) =>
            part === 'move' || count === 0)).map(m => m.id).sort() ?? [];
    const result = summarizeHoldRelease([...states.values()].sort((a, b) => a.tick - b.tick),
        entries, scoutIds, completeTicks);
    const builds = [...new Set(records.map(r => r.buildId ?? null))];
    const maps = [...new Set(records.map(r => r.mapChecksum ?? null))];
    const report = { replayId, evidence: { fingerprints: records.map(r => r.fingerprint),
        builds, maps, analyzer: analysis.summary, snapshotTicks: analysis.evidenceSummary.snapshots,
        completeDiagnosticTicks: analysis.evidenceSummary.completeDiagnosticTicks }, ...result };
    fs.mkdirSync(cacheDir, { recursive: true });
    const temp = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ key, report }, null, 2)}\n`);
    fs.renameSync(temp, cacheFile);
    return { report, cache: 'miss' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const { report, cache } = screenReplay(process.argv[2], process.argv[3], process.argv[4]);
        process.stderr.write(`scout-hold cache: ${cache}\n`);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

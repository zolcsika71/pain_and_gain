import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { analyzeReplay, writeJsonReport } from '../../tools/replay-analysis.js';
import { canonical, mapChecksum, scoreSourceFingerprint, sha256,
    summarizeDiagnosticCoverage, validateScoreBody } from '../../tools/replay-logs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../..');
const replayId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const buildId = 'b'.repeat(64);

function fixture(frameCount = 180) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-report-modes-'));
    const directory = path.join(root, 'replay_logs');
    fs.mkdirSync(directory);
    fs.mkdirSync(path.join(root, 'src/debug'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/debug/build-id.js'), `export const buildId = '${buildId}';\n`);
    const payload = { arena: { name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000 },
        terrain: { width: 100, height: 100,
            rows: Array.from({ length: 100 }, () => Array(100).fill(0)) },
        objects: [{ type: 'ScoreFlag', id: 'flag', x: 1, y: 1,
            effectType: 'attack', scorePerTick: 3 }] };
    const mapId = mapChecksum(payload);
    const mapFile = 'pain_and_gain_map_2026-10-02T00-00-00-000Z.json';
    fs.writeFileSync(path.join(directory, mapFile), `${canonical({ ...payload, checksum: mapId })}\n`);
    const objects = [
        { id: 'p1', user: 'player1', x: 10, y: 10, hits: 100, fatigue: 0 },
        { id: 'p2', user: 'player2', x: 20, y: 10, hits: 100, fatigue: 0 },
    ];
    const flags = [{ id: 'flag', x: 1, y: 1, owner: 'me', scorePerTick: 3 }];
    const gameStates = Array.from({ length: frameCount }, (_, index) => ({ type: 'game-state', buildId,
        tick: index + 1, phase: 'before-actions', selectedFlagId: 'flag',
        creeps: objects.map(object => ({ id: object.id, my: object.user === 'player1',
            x: object.x, y: object.y, hits: object.hits, hitsMax: 100, fatigue: object.fatigue,
            activeBodyParts: { move: 1 } })),
        flags: flags.map(flag => ({ ...flag, effectType: 'attack' })) }));
    const logContent = `${gameStates.map(JSON.stringify).join('\n')}\n`;
    const logPath = `${replayId}.jsonl`;
    fs.writeFileSync(path.join(directory, logPath), logContent);
    const logFingerprint = sha256(`benchmark-log:${logContent}`);
    const raws = gameStates.map(JSON.stringify);
    const coverage = { count: frameCount, firstTick: 1, lastTick: frameCount, duplicates: [], gaps: [] };
    const record = { replayId, requestedTick: frameCount, sourceEntry: 'synthetic-benchmark-log',
        sourceKey: `1/0/https://arena.screeps.com/api/game/${replayId}/log/${frameCount}`,
        fingerprint: logFingerprint, outputPath: logPath, outputFingerprint: sha256(logContent),
        mapId, mapChecksum: mapId, mapFile, buildId, importedAt: '2026-10-02T00:00:00.000Z',
        status: 'claim', coverage, diagnosticCoverage: summarizeDiagnosticCoverage(raws, []),
        otherEntries: [], reviews: {} };
    const scoreItems = (player1Score, player2Score) => [
        { id: 'player1-score', name: 'Score', value: player1Score },
        { id: 'player1-gain', name: 'Gained this tick', value: 3 },
        { id: 'player2-score', name: 'Score', value: player2Score },
        { id: 'player2-gain', name: 'Gained this tick', value: 2 },
    ];
    const frames = Array.from({ length: frameCount }, (_, index) => ({ gameTime: index + 1,
        objects, flags, ui: { version: 1, items: scoreItems(index * 3, index * 2) } }));
    const body = Buffer.from(JSON.stringify(frames));
    const requestedGameTime = frameCount;
    const requestUrl = `https://arena.screeps.com/api/game/${replayId}/replay/${requestedGameTime}`;
    const sourceKey = `1/0/${requestUrl}`;
    const responseFingerprint = sha256(body);
    const scoreFingerprint = scoreSourceFingerprint(sourceKey, body);
    const scorePath = `replay-score-source-${replayId}-${scoreFingerprint.slice(0, 12)}.response`;
    fs.writeFileSync(path.join(directory, scorePath), body);
    const validation = validateScoreBody('replay-frames', body, responseFingerprint);
    const scoreRecord = { formatVersion: 1, kind: 'replay-frames', replayId, requestedGameTime,
        sourceEntry: 'synthetic-benchmark-score', sourceKey, requestUrl,
        cacheEntryFingerprint: sha256(`benchmark-cache:${body.toString('hex')}`), responseFingerprint,
        fingerprint: scoreFingerprint, outputPath: scorePath, outputFingerprint: responseFingerprint,
        embeddedBuildId: null, mapId, coverage: validation.coverage, validation: validation.validation,
        importedAt: '2026-10-02T00:00:00.000Z', status: 'claim', reviews: {} };
    const manifest = { version: 2,
        maps: [{ id: mapId, checksum: mapId, file: mapFile, status: 'validated',
            registeredAt: '2026-10-02T00:00:00.000Z' }],
        replays: [{ replayId, mapId, buildId, status: 'active',
            associatedAt: '2026-10-02T00:00:00.000Z', retiredFingerprints: [] }],
        records: [record], scoreRecords: [scoreRecord], retiredScoreSources: [] };
    fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { root, logFingerprint, scoreFingerprint,
        selectedArtifactBytes: Buffer.byteLength(logContent) + body.length };
}

async function worker(root, mode, logFingerprint, scoreFingerprint) {
    let bytes = 0;
    const hash = crypto.createHash('sha256');
    const sink = new Writable({ write(chunk, ignored, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        callback();
    } });
    const started = process.hrtime.bigint();
    const report = analyzeReplay({ root, replayId, fingerprints: [logFingerprint],
        scoreFingerprints: [scoreFingerprint], reportMode: mode });
    await writeJsonReport(report, sink);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    return { mode, bytes, sha256: hash.digest('hex'), elapsedMs,
        maxRssKiB: process.resourceUsage().maxRSS, summary: report.summary,
        alignment: report.scoring.alignment.status,
        failureRules: mode === 'full' ? [...new Set(report.findings.filter(item => item.verdict === 'fail')
            .map(item => item.rule))].sort() : report.findingSummary.filter(item => item.verdict === 'fail')
            .map(item => item.rule).sort() };
}

if (process.argv[2] === '--worker') {
    const result = await worker(...process.argv.slice(3));
    process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
    const created = fixture(Number(process.env.REPLAY_REPORT_BENCHMARK_FRAMES ?? 180));
    try {
        const results = ['full', 'compact'].map(mode => {
            const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker',
                created.root, mode, created.logFingerprint, created.scoreFingerprint],
            { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 });
            assert.equal(child.status, 0, child.stderr);
            return JSON.parse(child.stdout);
        });
        assert.deepEqual(results[0].summary, results[1].summary);
        assert.equal(results[0].alignment, results[1].alignment);
        process.stdout.write(`${JSON.stringify({ frameCount: Number(process.env.REPLAY_REPORT_BENCHMARK_FRAMES ?? 180),
            selectedArtifactBytes: created.selectedArtifactBytes, results,
            outputReduction: 1 - results[1].bytes / results[0].bytes,
            maxRssReduction: 1 - results[1].maxRssKiB / results[0].maxRssKiB }, null, 2)}\n`);
    } finally {
        fs.rmSync(created.root, { recursive: true, force: true });
    }
}

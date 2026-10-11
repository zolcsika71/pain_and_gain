#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resident, directoryChain, readResident, publish, syncDirectory,
    acquireWriter, RetrievalError, withCleanup, normalizedError, errorDetails } from './retrieval-files.js';
import { isolatedSession, origin } from './arena-retrieval-session.js';
import { summarizeDiagnosticCoverage, validateScoreBody, mapChecksum } from './replay-logs.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprintDomain = 'explicit-match-http-v1-url-and-body-sha256';
const fingerprint = (url, bodySha256) => sha(`${fingerprintDomain}\0${url}\0${bodySha256}`);
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const now = () => new Date().toISOString();
const idPattern = /^[a-f0-9]{24}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const diagnosticTypes = new Set(['membership-baseline', 'membership-change', 'action-decision',
    'action-attempt', 'runtime-cpu', 'evidence-coverage']);

export function chunkEnds(duration) {
    if (!Number.isSafeInteger(duration) || duration < 0 || duration > 100_000) {
        throw new RetrievalError('unsupported-duration');
    }
    const ends = [];
    for (let start = 0; start < duration; start += 100) ends.push(Math.min(start + 100, duration));
    return ends;
}

export function requestPlan(duration) {
    return [{ key: 'metadata', suffix: '', kind: 'metadata', end: null },
        { key: 'replay-0', suffix: '/replay/0', kind: 'replay', end: 0 },
        ...chunkEnds(duration).flatMap(end => [
            { key: `log-${end}`, suffix: `/log/${end}`, kind: 'log', end },
            { key: `replay-${end}`, suffix: `/replay/${end}`, kind: 'replay', end },
        ])];
}

function metadataIdentity(value, expected, authenticated) {
    const envelope = value?.game, game = envelope?.game;
    if (value?.ok !== 1 || envelope?._id !== expected.matchId || game?._id !== expected.matchId) {
        throw new RetrievalError('match-identity-mismatch');
    }
    const users = envelope.users, codes = envelope.codes, references = game.usersCode;
    if (!Array.isArray(users) || !Array.isArray(codes) || !Array.isArray(references) ||
        references.length !== 2 || new Set(references).size !== 2 || ![0, 1].includes(game.firstPlayerIndex)) {
        throw new RetrievalError('metadata-mapping-unsupported');
    }
    const players = references.map(codeId => {
        const matches = codes.filter(c => c._id === codeId);
        const owners = users.filter(u => u._id === matches[0]?.user);
        if (matches.length !== 1 || owners.length !== 1) throw new RetrievalError('metadata-mapping-conflict');
        return { userId: owners[0]._id, username: owners[0].username,
            codeId, version: matches[0].version };
    });
    if (game.firstPlayerIndex === 1) players.reverse();
    const own = players.filter(p => p.userId === authenticated.id && p.username === expected.account);
    if (envelope.user !== authenticated.id || own.length !== 1 ||
        (expected.accountId && authenticated.id !== expected.accountId) ||
        (expected.arenaId && envelope.arena !== expected.arenaId) ||
        new Set(players.map(p => p.userId)).size !== 2 ||
        (expected.codeId && own[0].codeId !== expected.codeId) ||
        (expected.codeVersion !== null && own[0].version !== expected.codeVersion)) {
        throw new RetrievalError('metadata-account-code-mismatch');
    }
    if (game.status !== 'finished') throw new RetrievalError('match-not-finished');
    chunkEnds(game.meta?.ticks);
    if (envelope.meta?.ticks !== undefined && envelope.meta.ticks !== game.meta.ticks) {
        throw new RetrievalError('duration-conflict');
    }
    return { matchId: expected.matchId, duration: game.meta.ticks, status: game.status,
        hasReplay: game.hasReplay, ownSlot: `player${players.indexOf(own[0]) + 1}`, players };
}

export function validateResponse(spec, body, status, expected, authenticated) {
    if (status !== 200) return { status: 'invalid', reason: status === 401 || status === 403
        ? 'authentication-failed' : `http-${status}` };
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
    catch { return { status: 'invalid', reason: 'invalid-json' }; }
    try {
        if (spec.kind === 'metadata') return { status: 'valid', identity: metadataIdentity(value, expected, authenticated) };
        if (spec.kind === 'replay') {
            const validation = validateScoreBody('replay-frames', body);
            const first = spec.end === 0 ? 0 : Math.floor((spec.end - 1) / 100) * 100 + 1;
            const exact = Array.isArray(value) && value.length === spec.end - first + 1 &&
                value.every((frame, index) => frame.gameTime === first + index);
            return { status: exact && validation.validation.frames === 'valid' ? 'valid' : 'invalid',
                reason: exact ? null : 'frame-range-mismatch', coverage: validation.coverage,
                frameValidation: validation.validation.frames, scoringItems: validation.validation.items,
                // Missing scoring items do not invalidate frame transport/roster retention.
                scoringIssueCount: validation.validation.issues.length };
        }
        if (!value || Array.isArray(value) || typeof value !== 'object' ||
            Object.values(value).some(raw => typeof raw !== 'string')) throw new RetrievalError('log-shape');
        const first = Math.floor((spec.end - 1) / 100) * 100 + 1;
        if (Object.keys(value).some(key => !/^[0-9]+$/.test(key) || Number(key) < first || Number(key) > spec.end)) {
            throw new RetrievalError('log-key-range');
        }
        const states = [], diagnostics = [], builds = new Set(), maps = [];
        for (const [key, raw] of Object.entries(value)) for (const [part, line] of raw.split('\n').entries()) {
            let entry; try { entry = JSON.parse(line); } catch { continue; }
            if (!entry || typeof entry !== 'object') continue;
            if (entry.buildId) builds.add(entry.buildId);
            if (entry.type === 'map-state') maps.push(mapChecksum(entry.map));
            if (entry.type === 'game-state') {
                if (!Number.isSafeInteger(entry.tick) || entry.tick < first || entry.tick > spec.end) {
                    throw new RetrievalError('runtime-label-range');
                }
                states.push(line);
            }
            if (diagnosticTypes.has(entry.type)) {
                // Bound allocations inside the existing closure summarizer.
                if (!Number.isSafeInteger(entry.tick) || entry.tick < first || entry.tick > spec.end ||
                    (entry.type === 'evidence-coverage' && (!Number.isSafeInteger(entry.recordCount) ||
                        entry.recordCount < 0 || entry.recordCount > 100_000))) throw new RetrievalError('diagnostic-shape');
                diagnostics.push({ key: `${key}:${part}`, entry });
            }
        }
        const coverage = summarizeDiagnosticCoverage(states, diagnostics);
        const ticks = states.map(line => JSON.parse(line).tick);
        return { status: builds.size > 1 ? 'invalid' : 'valid', reason: builds.size > 1 ? 'mixed-builds' : null,
            responseKeys: Object.keys(value).map(Number), runtimeLabels: ticks, buildIds: [...builds],
            mapChecksums: [...new Set(maps)], diagnosticCoverage: coverage,
            runtimeEmissionCompleteness: 'unknown', validationScope: 'JSON envelope, labels and diagnostic closure consistency; not gameplay analysis' };
    } catch (error) {
        return { status: 'invalid', reason: error instanceof RetrievalError ? error.code : 'unsupported-evidence-shape' };
    }
}

export async function retrieveMatch({ matchId, output, account, codeId = null, codeVersion = null,
    accountId = null, arenaId = null,
    library, refresh = false, maxAttempts = 3, signal, sessionFactory = isolatedSession,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)), checkpointHook = () => {} }) {
    if (!idPattern.test(matchId) || typeof account !== 'string' || !account || !output ||
        (codeId !== null && !idPattern.test(codeId)) ||
        (accountId !== null && !idPattern.test(accountId)) || (arenaId !== null && !idPattern.test(arenaId)) ||
        (codeVersion !== null && (!Number.isSafeInteger(codeVersion) || codeVersion < 0)) ||
        !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new RetrievalError('invalid-options');
    const expected = { matchId, account, codeId, codeVersion,
        ...(accountId ? { accountId } : {}), ...(arenaId ? { arenaId } : {}) };
    const root = path.resolve(output);
    directoryChain(path.dirname(root));
    if (!fs.existsSync(root)) { fs.mkdirSync(root, { mode: 0o700 }); syncDirectory(path.dirname(root)); }
    resident(root, true);
    if (fs.readdirSync(root).some(name => !['ledger.json', '.writer.lock', 'bodies', 'receipts'].includes(name) &&
        !/^ledger\.json\.[a-f0-9-]+\.pending$/.test(name))) throw new RetrievalError('output-not-empty');
    const release = await acquireWriter(root);
    let session, ledger, authenticated, operationFailure;
    const ledgerFile = path.join(root, 'ledger.json');
    const guard = () => { release.assertHeld(); if (signal?.aborted) throw new RetrievalError('interrupted'); };
    const save = () => { release.assertHeld(); publish(ledgerFile, json(ledger), true); };
    const abort = () => { void session?.close().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        if (fs.existsSync(ledgerFile)) {
            const saved = JSON.parse(readResident(ledgerFile));
            if (saved.version !== 1 || JSON.stringify(saved.expected) !== JSON.stringify(expected) ||
                saved.maxAttempts !== maxAttempts || !Array.isArray(saved.runs) ||
                !saved.requests || typeof saved.requests !== 'object' || Array.isArray(saved.requests)) {
                throw new RetrievalError('job-identity-mismatch');
            }
            ledger = saved;
        } else {
            if (fs.readdirSync(root).some(name => name !== '.writer.lock' && !/^ledger\.json\..*\.pending$/.test(name))) {
                throw new RetrievalError('output-not-empty');
            }
            ledger = { version: 1, expected, maxAttempts, createdAt: now(), requests: {}, runs: [],
                runtimeEmissionCompleteness: 'unknown', managedAdmission: 'not-attempted', analysisAlignment: 'unassessed' };
            save();
        }
        for (const name of ['bodies', 'receipts']) {
            const dir = path.join(root, name);
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { mode: 0o700 }); syncDirectory(root); }
            resident(dir, true);
        }
        for (const prior of ledger.runs) if (prior.outcome === 'running') prior.outcome = 'interrupted';
        delete ledger.reason;
        const run = { startedAt: now(), refresh, outcome: 'running' };
        ledger.runs.push(run); save();
        guard(); session = sessionFactory({ matchId, account, library });
        authenticated = await session.login();
        if (!idPattern.test(authenticated?.id) || authenticated.username !== account ||
            (accountId && authenticated.id !== accountId)) throw new RetrievalError('authenticated-account-mismatch');
        run.authenticated = authenticated;

        function verifyReceipt(spec, receipt) {
            if (receipt.url !== `${origin}/api/game/${matchId}${spec.suffix}` || receipt.method !== 'GET' ||
                !digestPattern.test(receipt.bodySha256) || receipt.bodyFile !== `bodies/${receipt.bodySha256}.response` ||
                !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 0 || receipt.bytes > 100_000_000) {
                throw new RetrievalError('receipt-integrity');
            }
            const body = readResident(path.join(root, receipt.bodyFile));
            if (body.length !== receipt.bytes || sha(body) !== receipt.bodySha256 ||
                receipt.fingerprintDomain !== fingerprintDomain ||
                receipt.fingerprint !== fingerprint(receipt.url, receipt.bodySha256)) throw new RetrievalError('retained-body-corrupt');
            const validation = validateResponse(spec, body, receipt.httpStatus, expected, authenticated);
            if (JSON.stringify(validation) !== JSON.stringify(receipt.validation)) throw new RetrievalError('validation-mismatch');
            return receipt;
        }
        async function ensure(spec) {
            guard();
            const item = ledger.requests[spec.key] ??= { spec, attempts: [] };
            if (JSON.stringify(item.spec) !== JSON.stringify(spec) || !Array.isArray(item.attempts)) throw new RetrievalError('ledger-integrity');
            const receipts = [];
            for (const attempt of item.attempts) {
                if (!/^[a-f0-9-]{36}$/.test(attempt.id)) throw new RetrievalError('ledger-integrity');
                const receiptFile = path.join(root, 'receipts', `${attempt.id}.json`);
                if (fs.existsSync(receiptFile)) {
                    receipts.push(verifyReceipt(spec, JSON.parse(readResident(receiptFile))));
                    attempt.state = 'retained';
                } else if (attempt.pendingReceipt && fs.existsSync(path.join(root, attempt.pendingReceipt.bodyFile))) {
                    const recovered = verifyReceipt(spec, attempt.pendingReceipt);
                    publish(receiptFile, json(recovered)); receipts.push(recovered); attempt.state = 'retained';
                } else if (attempt.state === 'retained') throw new RetrievalError('retained-receipt-missing');
                else if (attempt.state === 'pending') attempt.state = 'interrupted';
                if (attempt.state === 'retained') await session.retained?.(attempt.id, receipts.at(-1));
            }
            function select() {
                const valid = receipts.filter(r => r.httpStatus === 200 && r.validation.status === 'valid');
                const variants = new Set(receipts.filter(r => r.httpStatus === 200).map(r => r.bodySha256));
                item.conflict = variants.size > 1;
                item.success = valid.length > 0 && !item.conflict;
                item.fingerprints = [...new Set(receipts.map(r => r.fingerprint))];
                item.coverage = valid.at(-1)?.validation ?? null;
            }
            select(); save();
            if (item.conflict) throw new RetrievalError('response-conflict');
            if (item.success && !refresh) return item.coverage;
            for (; item.attempts.length < maxAttempts;) {
                guard();
                if (item.attempts.length) { await wait(1000 * 2 ** (item.attempts.length - 1)); guard(); }
                const attempt = { id: randomUUID(), startedAt: now(), state: 'pending' };
                item.attempts.push(attempt); save();
                let response;
                try { response = await session.get(spec.suffix, attempt.id); }
                catch (error) {
                    const failure = normalizedError(error, 'transport-failed');
                    attempt.state = 'failed'; attempt.reason = failure.code;
                    try { save(); } catch (checkpointError) {
                        throw withCleanup(failure, checkpointError, 'failure-checkpoint-failed');
                    }
                    if (!['transport-failed', 'session-timeout'].includes(failure.code)) throw failure;
                    continue;
                }
                guard();
                const body = Buffer.from(response.body), bodySha256 = sha(body);
                const url = `${origin}/api/game/${matchId}${spec.suffix}`;
                const receipt = { formatVersion: 1, method: 'GET', url, startedAt: response.startedAt,
                    completedAt: response.completedAt, httpStatus: response.status, bytes: body.length,
                    bodySha256, bodyFile: `bodies/${bodySha256}.response`,
                    fingerprint: fingerprint(url, bodySha256), fingerprintDomain,
                    representation: 'exact decoded HTTP response bytes',
                    validation: validateResponse(spec, body, response.status, expected, authenticated) };
                attempt.pendingReceipt = receipt; save();
                const bodyFile = path.join(root, receipt.bodyFile);
                if (fs.existsSync(bodyFile)) {
                    if (!readResident(bodyFile).equals(body)) throw new RetrievalError('retained-body-corrupt');
                } else publish(bodyFile, body);
                checkpointHook('body-published', spec);
                publish(path.join(root, 'receipts', `${attempt.id}.json`), json(receipt));
                checkpointHook('receipt-published', spec);
                await session.retained?.(attempt.id, receipt);
                attempt.state = 'retained'; receipts.push(receipt); select(); save();
                checkpointHook('ledger-published', spec);
                if (item.conflict) throw new RetrievalError('response-conflict');
                if ([401, 403].includes(response.status)) throw new RetrievalError('authentication-failed');
                if (item.success && receipt.validation.status === 'valid') return item.coverage;
                if (spec.kind === 'metadata' && response.status === 200) throw new RetrievalError(receipt.validation.reason);
                if (![408, 429].includes(response.status) && response.status < 500) break;
            }
            item.success = false; save(); return null;
        }

        const metadata = await ensure(requestPlan(0)[0]);
        if (!metadata) throw new RetrievalError('metadata-unavailable');
        ledger.identity = metadata.identity;
        if (ledger.identity.hasReplay !== true) throw new RetrievalError('replay-unavailable');
        ledger.plan = requestPlan(ledger.identity.duration); save();
        for (const spec of ledger.plan.slice(1)) await ensure(spec);
        const selected = ledger.plan.map(spec => ledger.requests[spec.key]);
        const buildIds = [...new Set(selected.flatMap(item => item.coverage?.buildIds ?? []))];
        const mapChecksums = [...new Set(selected.flatMap(item => item.coverage?.mapChecksums ?? []))];
        ledger.coverage = {
            requiredRequests: ledger.plan.length, successfulRequests: selected.filter(item => item.success).length,
            unresolvedRequests: selected.filter(item => !item.success).map(item => item.spec.key),
            runtimeLabels: [...new Set(selected.flatMap(item => item.coverage?.runtimeLabels ?? []))].sort((a, b) => a - b),
            closedRuntimeLabels: [...new Set(selected.flatMap(item => item.coverage?.diagnosticCoverage?.completeTicks ?? []))].sort((a, b) => a - b),
            replaySegments: selected.flatMap(item => item.spec.kind === 'replay' ? item.coverage?.coverage?.localSegments ?? [] : []),
            buildIds, mapChecksums,
        };
        ledger.outcome = selected.every(item => item.success) && buildIds.length <= 1 && mapChecksums.length <= 1
            ? 'retrieved-all-planned-responses' : 'partial';
        run.outcome = ledger.outcome; run.completedAt = now(); save();
        return ledger;
    } catch (error) {
        operationFailure = normalizedError(error, 'worker-failed');
        const code = operationFailure.code;
        if (ledger && code !== 'job-identity-mismatch') {
            ledger.outcome = 'partial'; ledger.reason = code;
            const run = ledger.runs.at(-1);
            if (run) { run.outcome = 'partial'; run.reason = code; run.completedAt = now(); }
            try { save(); } catch (checkpointError) { withCleanup(operationFailure, checkpointError, 'failure-checkpoint-failed'); }
        }
        throw operationFailure;
    } finally {
        signal?.removeEventListener('abort', abort);
        let failure = operationFailure;
        try { await session?.close(); } catch (cleanup) { failure = withCleanup(failure, cleanup, 'session-cleanup-failed'); }
        try { await release(); } catch (cleanup) { failure = withCleanup(failure, cleanup, 'lock-cleanup-failed'); }
        if (!operationFailure && failure) throw failure;
    }
}

async function main() {
    const [matchId, output, ...args] = process.argv.slice(2);
    const options = { matchId, output };
    for (let index = 0; index < args.length; index++) {
        const option = args[index];
        if (option === '--refresh') options.refresh = true;
        else if (['--account', '--code-id', '--code-version', '--steam-library'].includes(option) && args[index + 1]) {
            const key = { '--account': 'account', '--code-id': 'codeId', '--code-version': 'codeVersion', '--steam-library': 'library' }[option];
            const value = args[++index]; options[key] = key === 'codeVersion' ? Number(value) : value;
        } else throw new RetrievalError('invalid-options');
    }
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const deadline = setTimeout(stop, 10 * 60 * 1000);
    try {
        const ledger = await retrieveMatch({ ...options, signal: controller.signal });
        console.log(JSON.stringify({ outcome: ledger.outcome, output: path.resolve(output),
            requiredRequests: ledger.coverage.requiredRequests, successfulRequests: ledger.coverage.successfulRequests,
            runtimeEmissionCompleteness: ledger.runtimeEmissionCompleteness,
            managedAdmission: ledger.managedAdmission, analysisAlignment: ledger.analysisAlignment }));
        if (ledger.outcome !== 'retrieved-all-planned-responses') process.exitCode = 2;
    } finally { clearTimeout(deadline); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(JSON.stringify({ outcome: 'partial', ...errorDetails(error) }));
        process.exitCode = 2;
    });
}

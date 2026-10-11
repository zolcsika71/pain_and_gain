#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedSession, discoveryPath, origin } from './arena-retrieval-session.js';
import { resident, directoryChain, readResident, publish, syncDirectory, acquireWriter,
    RetrievalError, normalizedError, withCleanup, errorDetails } from './retrieval-files.js';

const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const now = () => new Date().toISOString();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => { throw new RetrievalError(reason); };
const maxBytes = 8_000_000;
const limitations = ['retention-unqualified', 'mode-coverage-unqualified', 'pagination-snapshot-unqualified'];
const metadataReady = row => !!row?.metadataReceipt && row.status === 'finished' && row.hasReplay === true;

function rowIdentity(row, expected) {
    const game = row?.game;
    if (!id(game?._id) || row.user !== expected.accountId || row.arena !== expected.arenaId ||
        !Array.isArray(row.codes) || !Array.isArray(row.users) || !Array.isArray(game.usersCode) ||
        game.usersCode.length !== 2 || new Set(game.usersCode).size !== 2) fail('row-identity-mismatch');
    const players = game.usersCode.map(codeId => {
        const codes = row.codes.filter(c => c._id === codeId);
        const users = row.users.filter(u => u._id === codes[0]?.user);
        if (!id(codeId) || codes.length !== 1 || users.length !== 1 || !id(users[0]._id)) fail('row-mapping-conflict');
        return { codeId, codeVersion: codes[0].version, accountId: users[0]._id, account: users[0].username };
    });
    const own = players.filter(p => p.accountId === expected.accountId && p.account === expected.account);
    if (own.length !== 1 || new Set(players.map(p => p.accountId)).size !== 2 ||
        !Number.isSafeInteger(own[0].codeVersion) || own[0].codeVersion < 0) fail('row-account-code-mismatch');
    if (typeof game.status !== 'string' || typeof game.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(game.createdAt))) fail('row-status-shape');
    return { matchId: game._id, accountId: expected.accountId, account: expected.account,
        arenaId: expected.arenaId, codeId: own[0].codeId, codeVersion: own[0].codeVersion };
}

// Raw bytes are retained even when this validation rejects their interpretation.
export function validateDiscovery(descriptor, bytes, status, expected) {
    if (status !== 200) return { valid: false, reason: 'http-' + status };
    try {
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (value?.ok !== 1) fail('response-shape');
        if (descriptor.kind === 'metadata') {
            const row = value.game, identity = rowIdentity(row, expected);
            if (identity.matchId !== descriptor.matchId || row._id !== descriptor.matchId) fail('metadata-match-mismatch');
            if (row.game.status === 'finished' && ![0, 1].includes(row.game.firstPlayerIndex)) fail('metadata-slot-mismatch');
            return { valid: true, rows: [{ identity, status: row.game.status, createdAt: row.game.createdAt,
                hasReplay: row.game.hasReplay === true }] };
        }
        const rows = value[descriptor.kind === 'history' ? 'history' : descriptor.kind === 'fame' ? 'items' : 'games'];
        const length = value.meta?.length;
        if (!Array.isArray(rows) || rows.length > (descriptor.kind === 'history' ? 10 : 1000)) fail('list-shape');
        if (descriptor.kind !== 'last-games' && (!Number.isSafeInteger(length) || length < 0 || length > 100000)) fail('length-shape');
        const normalized = rows.map(row => ({ identity: rowIdentity(row, expected),
            status: row.game.status, createdAt: row.game.createdAt }));
        if (new Set(normalized.map(r => r.identity.matchId)).size !== normalized.length) fail('duplicate-page-id');
        return { valid: true, ...(length !== undefined ? { length } : {}), rows: normalized };
    } catch (error) {
        return { valid: false, reason: error instanceof RetrievalError ? error.code : 'response-shape' };
    }
}

// Derive blocks separately: old immutable validation receipts retain their exact shape.
// A metadata request identifies its subject, never an unexpected returned match ID.
// Lists have no match-bound request: only a valid nested game._id is attributable.
export function rejectedIdentities(receipt, bytes, expected) {
    const reasons = ['row-identity-mismatch', 'row-mapping-conflict', 'row-account-code-mismatch',
        'metadata-match-mismatch', 'metadata-slot-mismatch'];
    if (receipt.status !== 200 || receipt.validation.valid) return [];
    if (receipt.descriptor.kind === 'metadata') {
        return reasons.includes(receipt.validation.reason)
            ? [{ matchId: receipt.descriptor.matchId, reason: receipt.validation.reason }] : [];
    }
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return []; }
    const rows = value?.[receipt.descriptor.kind === 'history' ? 'history' : receipt.descriptor.kind === 'fame' ? 'items' : 'games'];
    if (value?.ok !== 1 || !Array.isArray(rows) || rows.length > (receipt.descriptor.kind === 'history' ? 10 : 1000)) return [];
    const failures = [];
    for (const row of rows) {
        if (!id(row?.game?._id)) continue;
        try { rowIdentity(row, expected); }
        catch (error) {
            if (error instanceof RetrievalError && reasons.includes(error.code)) {
                failures.push({ matchId: row.game._id, reason: error.code });
            }
        }
    }
    return failures;
}

// This command writes intents only. It deliberately does not import the retrieval worker.
export async function discoverMatches({ output, account, accountId, arenaId, library,
    maxRequests = 100, maxSweeps = 3, maxRuntimeMs = 600000, signal,
    sessionFactory = isolatedSession, checkpointHook = () => {} }) {
    if (!id(accountId) || !id(arenaId) || typeof account !== 'string' || !account || !output ||
        !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 1000 ||
        !Number.isSafeInteger(maxSweeps) || maxSweeps < 2 || maxSweeps > 5 ||
        !Number.isSafeInteger(maxRuntimeMs) || maxRuntimeMs < 1 || maxRuntimeMs > 600000) fail('invalid-options');
    const expected = { account, accountId, arenaId };
    const requested = path.resolve(output);
    directoryChain(path.dirname(requested));
    // Resolve directory aliases before enforcing the repository/cache boundary.
    const root = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
    const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (root === repository || root.startsWith(repository + path.sep) ||
        root.split(path.sep).includes('Cache_Data')) fail('unsafe-output');
    if (!fs.existsSync(root)) { fs.mkdirSync(root, { mode: 0o700 }); syncDirectory(path.dirname(root)); }
    resident(root, true);
    if (fs.readdirSync(root).some(name => !['discovery.json', '.writer.lock', 'bodies', 'receipts', 'intents', 'retrieval', 'collection'].includes(name) &&
        !/^discovery\.json\.[a-f0-9-]+\.pending$/.test(name))) fail('output-not-empty');
    const release = await acquireWriter(root);
    let ledger, run, session, operationFailure;
    let recovering = true;
    const deadline = Date.now() + maxRuntimeMs;
    const ledgerFile = path.join(root, 'discovery.json');
    const guard = () => {
        release.assertHeld();
        if (signal?.aborted) fail('interrupted');
        if (Date.now() >= deadline) fail('runtime-budget-exhausted');
    };
    const save = () => {
        release.assertHeld();
        const bytes = Buffer.from(json(ledger));
        if (bytes.length > 32_000_000) fail('ledger-size-limit');
        publish(ledgerFile, bytes, true);
    };
    const hook = (phase, detail) => checkpointHook(phase, detail);
    const gap = (reason, detail = {}) => {
        const entry = { reason, ...detail };
        if (!run.gaps.some(item => equal(item, entry))) run.gaps.push(entry);
    };
    const write = (relative, bytes) => {
        guard();
        const file = path.join(root, relative);
        if (fs.existsSync(file)) {
            if (!readResident(file).equals(Buffer.from(bytes))) fail('retained-file-conflict');
        } else publish(file, bytes);
    };
    // Applies the invocation deadline to login/GET too; finally uses reviewed bounded close.
    const bounded = operation => {
        guard();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new RetrievalError('runtime-budget-exhausted')), Math.max(1, deadline - Date.now()));
            const abort = () => finish(new RetrievalError('interrupted'));
            function finish(error, value) {
                clearTimeout(timer); signal?.removeEventListener('abort', abort);
                if (error) reject(error); else resolve(value);
            }
            signal?.addEventListener('abort', abort, { once: true });
            Promise.resolve().then(operation).then(value => finish(null, value), error => finish(error));
        });
    };
    function commitResponse(receipt) {
        if (!ledger.responses.some(r => r.id === receipt.id)) ledger.responses.push(receipt);
        ledger.pendingResponse = null; save();
    }
    function checkReceiptShape(receipt) {
        if (!/^[a-f0-9-]{36}$/.test(receipt.id) || !/^[a-f0-9]{64}$/.test(receipt.bodySha256) ||
            receipt.bodyFile !== 'bodies/' + receipt.bodySha256 + '.response' ||
            receipt.url !== origin + discoveryPath(arenaId, receipt.descriptor)) fail('retained-receipt-invalid');
    }
    function verifyReceipt(receipt) {
        checkReceiptShape(receipt);
        const bodyFile = path.join(root, receipt.bodyFile);
        if (resident(bodyFile).size > maxBytes) fail('retained-body-limit');
        const bytes = readResident(bodyFile);
        if (sha(bytes) !== receipt.bodySha256 || bytes.length !== receipt.byteCount) fail('retained-body-corrupt');
        const validation = validateDiscovery(receipt.descriptor, bytes, receipt.status, expected);
        if (!equal(validation, receipt.validation)) fail('retained-validation-conflict');
        return validation;
    }
    function intentFor(identity, receipt) {
        return { version: 1, key: accountId + '/' + identity.matchId, state: 'pending-retrieval',
            identity, metadataReceipt: receipt.id, metadataBodySha256: receipt.bodySha256,
            createdAt: receipt.completedAt,
            retrieval: { matchId: identity.matchId, account, codeId: identity.codeId, codeVersion: identity.codeVersion,
                output: path.join(root, 'retrieval', accountId, identity.matchId) },
            execution: 'not-started', managedAdmission: 'not-attempted' };
    }
    function updateEligibility(matchId) {
        const intent = ledger.intents[matchId], observed = ledger.observed[matchId];
        if (intent) intent.eligible = !recovering && !intent.blocked && !observed?.conflict && metadataReady(observed);
    }
    function publishIntent(value) {
        const matchId = value.identity.matchId, file = 'intents/' + accountId + '-' + matchId + '.json';
        ledger.pendingIntent = value; save(); hook('intent-planned', value);
        write(file, json(value)); hook('intent-published', value);
        ledger.intents[matchId] = { file, sha256: sha(json(value)), identity: value.identity,
            ...(ledger.identityFailures[matchId]?.length || ledger.observed[matchId]?.conflict
                ? { blocked: 'identity-conflict' } : {}) };
        updateEligibility(matchId);
        ledger.pendingIntent = null; save(); hook('intent-checkpointed', value);
    }
    function verifyIntent(value) {
        const receipt = ledger.responses.find(r => r.id === value.metadataReceipt);
        if (!receipt || receipt.descriptor.kind !== 'metadata' || !receipt.validation.valid ||
            receipt.validation.rows[0].status !== 'finished' ||
            !equal(value, intentFor(receipt.validation.rows[0].identity, receipt))) fail('retained-intent-invalid');
    }
    function applyRejectedIdentity(receipt) {
        if (receipt.validation.valid || receipt.status !== 200) return;
        const failures = rejectedIdentities(receipt, readResident(path.join(root, receipt.bodyFile)), expected);
        for (const { matchId, reason } of failures) {
            guard();
            const retained = ledger.identityFailures[matchId] ??= [];
            const failure = { receiptId: receipt.id, reason };
            if (!retained.some(item => equal(item, failure))) retained.push(failure);
            if (ledger.observed[matchId]) ledger.observed[matchId].conflict = true;
            if (ledger.intents[matchId]) ledger.intents[matchId].blocked = 'identity-conflict';
            updateEligibility(matchId);
            gap('match-identity-conflict', { matchId });
        }
        if (failures.length) save();
    }
    function applyReceipt(receipt, validation) {
        if (!validation.valid) { applyRejectedIdentity(receipt); return; }
        for (const row of validation.rows) {
            guard();
            const matchId = row.identity.matchId;
            let observed = ledger.observed[matchId];
            if (observed && !equal(observed.identity, row.identity)) {
                observed.conflict = true;
                if (ledger.intents[matchId]) ledger.intents[matchId].blocked = 'identity-conflict';
                updateEligibility(matchId);
                gap('match-identity-conflict', { matchId }); continue;
            }
            observed ??= ledger.observed[matchId] = { identity: row.identity, sources: [] };
            if (ledger.identityFailures[matchId]?.length) observed.conflict = true;
            if (!observed.sources.includes(receipt.descriptor.kind)) observed.sources.push(receipt.descriptor.kind);
            // A list projection does not replace the last exact metadata status.
            if (!observed.metadataReceipt || receipt.descriptor.kind === 'metadata') observed.status = row.status;
            observed.lastReceipt = receipt.id;
            if (observed.conflict) { updateEligibility(matchId); gap('match-identity-conflict', { matchId }); continue; }
            if (receipt.descriptor.kind === 'metadata') {
                observed.metadataReceipt = receipt.id;
                observed.hasReplay = row.hasReplay;
                if (row.status === 'finished' && !ledger.intents[matchId]) publishIntent(intentFor(row.identity, receipt));
            }
            updateEligibility(matchId);
        }
        save();
    }
    async function request(descriptor) {
        guard();
        if (run.requestCount >= maxRequests) fail('request-budget-exhausted');
        const url = origin + discoveryPath(arenaId, descriptor);
        run.requestCount++; run.inFlight = { descriptor, url, startedAt: now() }; save();
        let response;
        try { response = await bounded(() => session.get(descriptor)); }
        catch (error) {
            gap(errorDetails(error, 'transport-failed').reason, { descriptor }); throw error;
        }
        if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) fail('response-status');
        if (!Buffer.isBuffer(response.body) || response.body.length > maxBytes) fail('response-limit');
        const validation = validateDiscovery(descriptor, response.body, response.status, expected);
        const receipt = { id: randomUUID(), descriptor, method: 'GET', url, startedAt: run.inFlight.startedAt,
            completedAt: now(), status: response.status, byteCount: response.body.length,
            bodySha256: sha(response.body), bodyFile: 'bodies/' + sha(response.body) + '.response', validation };
        ledger.pendingResponse = receipt; save(); hook('response-planned', receipt);
        write(receipt.bodyFile, response.body); hook('body-published', receipt);
        write('receipts/' + receipt.id + '.json', json(receipt)); hook('receipt-published', receipt);
        commitResponse(receipt); run.inFlight = null;
        applyReceipt(receipt, validation);
        if (!validation.valid) gap(validation.reason, { descriptor });
        if ([401, 403].includes(response.status)) fail('authentication-failed');
        return validation;
    }
    const attemptedMetadata = new Set();
    async function resolveObserved(matchIds) {
        for (const matchId of matchIds) {
            guard();
            const observed = ledger.observed[matchId];
            if (observed.conflict || ledger.intents[matchId]?.blocked ||
                (ledger.intents[matchId] && metadataReady(observed)) || attemptedMetadata.has(matchId)) continue;
            attemptedMetadata.add(matchId);
            const validation = await request({ kind: 'metadata', matchId });
            if (!validation.valid) continue;
            const row = validation.rows[0];
            if (row.status !== 'finished') gap('match-not-finished', { matchId, status: row.status });
            else if (!row.hasReplay) gap('replay-unavailable', { matchId });
        }
    }
    try {
        if (fs.existsSync(ledgerFile)) {
            if (resident(ledgerFile).size > 32_000_000) fail('ledger-size-limit');
            ledger = JSON.parse(readResident(ledgerFile));
            if (ledger.version !== 1 || !equal(ledger.expected, expected) || !Array.isArray(ledger.responses) ||
                !Array.isArray(ledger.runs) || !ledger.observed || !ledger.intents) fail('discovery-identity-mismatch');
        } else {
            if (fs.readdirSync(root).some(name => !['.writer.lock', 'collection'].includes(name) && !/^discovery\.json\..*\.pending$/.test(name))) fail('output-not-empty');
            ledger = { version: 1, expected, responses: [], observed: {}, intents: {}, runs: [],
                pendingResponse: null, pendingIntent: null };
            save();
        }
        ledger.identityFailures ??= {};
        for (const name of ['bodies', 'receipts', 'intents']) {
            const directory = path.join(root, name);
            if (!fs.existsSync(directory)) { fs.mkdirSync(directory, { mode: 0o700 }); syncDirectory(root); }
            resident(directory, true);
        }
        run = { id: randomUUID(), startedAt: now(), limits: { maxRequests, maxSweeps, maxRuntimeMs, maxBytes },
            requestCount: 0, sweeps: [], gaps: [], enumeration: 'partial',
            losslessCatchUp: 'unqualified', completenessGaps: [...limitations], retrievalExecution: 'not-started' };
        // Do not expose transient readiness while replaying older receipt states.
        for (const intent of Object.values(ledger.intents)) intent.eligible = false;
        ledger.runs.push(run); save();
        // Recover immutable publication intents. Never delete orphaned temporary bytes.
        if (ledger.pendingResponse) {
            const pending = ledger.pendingResponse;
            checkReceiptShape(pending);
            if (fs.existsSync(path.join(root, pending.bodyFile))) {
                verifyReceipt(pending);
                write('receipts/' + pending.id + '.json', json(pending)); commitResponse(pending);
            } else {
                gap('interrupted-response-publication', { descriptor: pending.descriptor });
                ledger.pendingResponse = null; save();
            }
        }
        // Verify every referenced body before recovering any handoff from saved state.
        for (const receipt of ledger.responses) {
            guard(); verifyReceipt(receipt);
            if (!readResident(path.join(root, 'receipts/' + receipt.id + '.json')).equals(Buffer.from(json(receipt)))) fail('retained-receipt-conflict');
        }
        // Recover rejected evidence before any pending handoff, including old receipts.
        for (const receipt of ledger.responses) { guard(); applyRejectedIdentity(receipt); }
        for (const [matchId, intent] of Object.entries(ledger.intents)) {
            guard();
            if (!id(matchId) || intent.file !== 'intents/' + accountId + '-' + matchId + '.json' ||
                sha(readResident(path.join(root, intent.file))) !== intent.sha256) fail('retained-intent-corrupt');
            const value = JSON.parse(readResident(path.join(root, intent.file)));
            verifyIntent(value);
            if (value.identity.matchId !== matchId || !equal(value.identity, intent.identity)) fail('retained-intent-invalid');
        }
        if (ledger.pendingIntent) { verifyIntent(ledger.pendingIntent); publishIntent(ledger.pendingIntent); }
        // Replay retained validations so a crash cannot lose discovered IDs/handoffs.
        for (const receipt of ledger.responses) {
            guard();
            applyReceipt(receipt, receipt.validation);
        }
        recovering = false;
        for (const matchId of Object.keys(ledger.intents)) updateEligibility(matchId);
        save();
        const priorHistoryIds = Object.entries(ledger.observed).filter(([, row]) => row.sources.includes('history')).map(([key]) => key);
        session = sessionFactory({ account, discovery: { accountId, arenaId }, library, timeoutMs: 15000, maxBytes });
        const authenticated = await bounded(() => session.login());
        if (authenticated.id !== accountId || authenticated.username !== account) fail('authenticated-account-mismatch');
        run.authenticated = authenticated; save();
        let previousComplete;
        for (let sweep = 0; sweep < maxSweeps; sweep++) {
            const state = { index: sweep, pages: [], ids: [], completed: false };
            run.sweeps.push(state); save();
            let offset = 0, length, previousRows, stable = true;
            while (true) {
                const descriptor = { kind: 'history', offset };
                const page = await request(descriptor);
                if (!page.valid) { stable = false; break; }
                await resolveObserved(page.rows.map(row => row.identity.matchId));
                const ids = page.rows.map(row => row.identity.matchId);
                if (length === undefined) length = page.length;
                if (page.length !== length) { gap('history-count-changed', { sweep, offset }); stable = false; }
                if (ids.length !== Math.min(10, Math.max(0, length - offset))) {
                    gap('history-page-range-gap', { sweep, offset, expectedLength: length, received: ids.length }); stable = false;
                }
                const overlap = previousRows && offset < length ? previousRows.slice(8) : [];
                if (overlap.length && !equal(ids.slice(0, overlap.length), overlap)) {
                    gap('history-overlap-broken', { sweep, offset }); stable = false;
                }
                const newIds = ids.slice(overlap.length);
                if (newIds.some(matchId => state.ids.includes(matchId))) {
                    gap('history-order-conflict', { sweep, offset }); stable = false;
                }
                state.ids.push(...newIds);
                state.pages.push({ offset, received: ids.length, reportedLength: page.length });
                state.checkpoint = offset; save(); hook('page-checkpointed', descriptor);
                if (!stable) break;
                if (offset === length) { state.completed = true; break; }
                previousRows = ids;
                offset = offset + 10 >= length ? length : offset + 8;
            }
            save();
            if (state.completed) {
                const missing = priorHistoryIds.filter(matchId => !state.ids.includes(matchId));
                if (missing.length) gap('history-anchors-missing', { matchIds: missing });
                if (previousComplete && equal(previousComplete, state.ids)) {
                    run.enumeration = 'available-history-enumerated'; break;
                }
                if (previousComplete) gap('history-sweeps-differ');
                previousComplete = state.ids;
            } else previousComplete = undefined;
        }
        if (run.enumeration !== 'available-history-enumerated') gap('reconciliation-incomplete');
        for (const kind of ['last-games', 'fame']) {
            const page = await request({ kind });
            if (page.valid) {
                await resolveObserved(page.rows.map(row => row.identity.matchId));
                if (kind === 'fame' && page.length !== page.rows.length) gap('fame-list-truncated');
            }
        }
        // Pending/unavailable matches survive list disappearance and are retried by ID.
        await resolveObserved(Object.keys(ledger.observed).sort());
        run.unresolved = Object.entries(ledger.observed).filter(([key]) => !ledger.intents[key]?.eligible)
            .map(([matchId, row]) => ({ matchId, status: row.status, conflict: !!row.conflict,
                hasIntent: !!ledger.intents[matchId], hasReplay: row.hasReplay }));
        for (const row of run.unresolved) {
            if (row.status !== 'finished') gap('match-not-finished', { matchId: row.matchId, status: row.status });
        }
        run.outcome = run.gaps.length || run.unresolved.length ? 'partial-with-gaps' : 'enumerated-with-coverage-gaps';
        run.intentCount = Object.keys(ledger.intents).length; run.completedAt = now(); save();
        return { ...run, output: root };
    } catch (error) {
        operationFailure = normalizedError(error, 'discovery-failed');
        if (run) {
            gap(operationFailure.code); run.outcome = 'partial-with-gaps'; run.error = errorDetails(operationFailure);
            run.completedAt = now();
            try { save(); } catch (cleanup) { withCleanup(operationFailure, cleanup, 'failure-checkpoint-failed'); }
        }
        throw operationFailure;
    } finally {
        let failure = operationFailure;
        try { await session?.close(); } catch (cleanup) { failure = withCleanup(failure, cleanup, 'session-cleanup-failed'); }
        try { await release(); } catch (cleanup) { failure = withCleanup(failure, cleanup, 'lock-cleanup-failed'); }
        if (!operationFailure && failure) throw failure;
    }
}

async function main() {
    const [output, ...args] = process.argv.slice(2);
    const options = { output };
    const keys = { '--account': 'account', '--account-id': 'accountId', '--arena-id': 'arenaId',
        '--max-requests': 'maxRequests', '--steam-library': 'library' };
    for (let i = 0; i < args.length; i++) {
        if (!keys[args[i]] || !args[i + 1]) fail('invalid-options');
        const key = keys[args[i]], value = args[++i];
        options[key] = key === 'maxRequests' ? Number(value) : value;
    }
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
        const result = await discoverMatches({ ...options, signal: controller.signal });
        console.log(JSON.stringify(result));
        if (result.outcome === 'partial-with-gaps') process.exitCode = 2;
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(JSON.stringify({ outcome: 'partial-with-gaps', losslessCatchUp: 'unqualified', ...errorDetails(error, 'discovery-failed') }));
        process.exitCode = 2;
    });
}

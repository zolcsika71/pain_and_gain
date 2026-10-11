#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as equal } from 'node:util';
import { retrieveMatch } from './retrieve-match.js';
import { validateDiscovery, rejectedIdentities } from './discover-matches.js';
import { isolatedSession, discoveryPath, origin } from './arena-retrieval-session.js';
import { resident, directoryChain, readResident, publish, syncDirectory, acquireWriter,
    RetrievalError, normalizedError, withCleanup, errorDetails } from './retrieval-files.js';

export const handoffLimits = Object.freeze({
    runtimeMs: 600000, requests: 100, responseBytes: 16000000, totalResponseBytes: 512000000,
    responseMs: 15000, attemptsPerRequest: 3, receipts: 1000, verificationBytes: 128000000,
    ledgerBytes: 32000000, stateBytes: 1000000, runs: 100,
});
const id = s => typeof s === 'string' && /^[a-f0-9]{24}$/.test(s);
const digest = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const sha = b => createHash('sha256').update(b).digest('hex');
const json = v => JSON.stringify(v, null, 2) + '\n';
const fail = code => { throw new RetrievalError(code); };
const now = () => new Date().toISOString();

// Read-only, under the discovery writer lock. Re-derive the selected identity
// from retained responses, not merely from a persisted eligible boolean.
function verifySelection(root, accountId, matchId, guard) {
    for (const name of ['bodies', 'receipts', 'intents']) resident(path.join(root, name), true);
    let readBytes = 0;
    const read = (file, limit) => {
        guard();
        const size = resident(file).size;
        if (size > limit || readBytes + size > handoffLimits.verificationBytes) fail('verification-budget-exhausted');
        readBytes += size;
        return readResident(file);
    };
    const ledgerBytes = read(path.join(root, 'discovery.json'), handoffLimits.ledgerBytes);
    const ledger = JSON.parse(ledgerBytes), expected = ledger.expected;
    if (ledger.version !== 1 || expected?.accountId !== accountId || !id(expected?.arenaId) ||
        typeof expected.account !== 'string' || !expected.account || !Array.isArray(ledger.responses) ||
        ledger.responses.length > handoffLimits.receipts || !Array.isArray(ledger.runs)) fail('discovery-identity-invalid');
    if (ledger.pendingResponse || ledger.pendingIntent || !ledger.runs.at(-1)?.completedAt ||
        ledger.runs.at(-1)?.inFlight) fail('discovery-recovery-required');
    const indexed = ledger.intents?.[matchId], observed = ledger.observed?.[matchId];
    if (!indexed || !observed || indexed.eligible !== true || indexed.blocked || observed.conflict ||
        ledger.identityFailures?.[matchId]?.length) fail('intent-ineligible');
    const relative = 'intents/' + accountId + '-' + matchId + '.json';
    if (indexed.file !== relative || !digest(indexed.sha256)) fail('intent-integrity');
    const bytes = read(path.join(root, relative), 1000000), intent = JSON.parse(bytes);
    if (sha(bytes) !== indexed.sha256 || !equal(intent.identity, indexed.identity) ||
        !equal(intent.identity, observed.identity)) fail('intent-integrity');
    const receipts = new Map();
    let latest;
    for (const receipt of ledger.responses) {
        if (!/^[a-f0-9-]{36}$/.test(receipt.id) || receipts.has(receipt.id) ||
            !digest(receipt.bodySha256) || receipt.bodyFile !== 'bodies/' + receipt.bodySha256 + '.response' ||
            receipt.method !== 'GET' || receipt.url !== origin + discoveryPath(expected.arenaId, receipt.descriptor)) {
            fail('receipt-integrity');
        }
        const rb = read(path.join(root, 'receipts', receipt.id + '.json'), 8000000);
        if (!rb.equals(Buffer.from(json(receipt)))) fail('receipt-integrity');
        const body = read(path.join(root, receipt.bodyFile), 8000000);
        if (sha(body) !== receipt.bodySha256 || body.length !== receipt.byteCount) fail('body-integrity');
        const validation = validateDiscovery(receipt.descriptor, body, receipt.status, expected);
        if (!equal(validation, receipt.validation)) fail('validation-conflict');
        receipts.set(receipt.id, receipt);
        if (rejectedIdentities(receipt, body, expected).some(f => f.matchId === matchId)) fail('identity-conflict');
        if (validation.valid) {
            for (const row of validation.rows) if (row.identity.matchId === matchId) {
                if (!equal(row.identity, intent.identity)) fail('identity-conflict');
            }
        }
        if (receipt.descriptor.kind === 'metadata' && receipt.descriptor.matchId === matchId) {
            latest = validation.valid ? receipt : null;
        }
    }
    const original = receipts.get(intent.metadataReceipt);
    if (!original || original.descriptor.kind !== 'metadata' || original.descriptor.matchId !== matchId ||
        !original.validation.valid || original.validation.rows[0].status !== 'finished') fail('intent-metadata-invalid');
    const identity = original.validation.rows[0].identity;
    const output = path.join(root, 'retrieval', accountId, matchId);
    const expectedIntent = { version: 1, key: accountId + '/' + matchId, state: 'pending-retrieval',
        identity, metadataReceipt: original.id, metadataBodySha256: original.bodySha256,
        createdAt: original.completedAt,
        retrieval: { matchId, account: expected.account, codeId: identity.codeId, codeVersion: identity.codeVersion, output },
        execution: 'not-started', managedAdmission: 'not-attempted' };
    if (!equal(intent, expectedIntent)) fail('intent-integrity');
    if (!latest || latest.id !== observed.metadataReceipt ||
        latest.validation.rows[0].status !== 'finished' || latest.validation.rows[0].hasReplay !== true ||
        observed.status !== 'finished' || observed.hasReplay !== true) fail('metadata-unresolved');
    return { intent, intentSha256: sha(bytes), ledgerSha256: sha(ledgerBytes), output, readBytes };
}

// Exactly one explicit key. The discovery lock is held through worker cleanup;
// discovery cannot revoke eligibility mid-dispatch under the shared contract.
export async function retrieveIntent({ spool, accountId, matchId, signal, library,
    worker = retrieveMatch, sessionFactory = isolatedSession, lock = acquireWriter,
    checkpointHook = () => {} }) {
    if (!spool || !id(accountId) || !id(matchId)) fail('invalid-options');
    directoryChain(path.resolve(spool)); resident(path.resolve(spool), true);
    const root = fs.realpathSync(spool);
    const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (root === repository || root.startsWith(repository + path.sep) || root.split(path.sep).includes('Cache_Data')) fail('unsafe-spool');
    const release = await lock(root);
    let operationFailure, state, stateFile, run, snapshot, monitor;
    const controller = new AbortController(), started = Date.now();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, handoffLimits.runtimeMs);
    const guard = () => {
        release.assertHeld();
        if (Date.now() - started >= handoffLimits.runtimeMs) fail('runtime-budget-exhausted');
        if (controller.signal.aborted) fail('interrupted');
    };
    const stable = () => {
        guard();
        if (resident(path.join(root, 'discovery.json')).size > handoffLimits.ledgerBytes ||
            sha(readResident(path.join(root, 'discovery.json'))) !== snapshot.ledgerSha256) fail('eligibility-changed');
        const file = path.join(root, 'intents', accountId + '-' + matchId + '.json');
        if (resident(file).size > 1000000 || sha(readResident(file)) !== snapshot.intentSha256) fail('intent-changed');
    };
    const save = () => {
        release.assertHeld();
        const bytes = Buffer.from(json(state));
        if (bytes.length > handoffLimits.stateBytes) fail('handoff-state-limit');
        publish(stateFile, bytes, true);
    };
    try {
        snapshot = verifySelection(root, accountId, matchId, guard);
        checkpointHook('selection-verified');
        stable();
        for (const dir of [path.join(root, 'retrieval'), path.join(root, 'retrieval', accountId)]) {
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { mode: 0o700 }); syncDirectory(path.dirname(dir)); }
            resident(dir, true);
        }
        const base = path.join(root, 'retrieval', accountId, matchId);
        const association = { version: 1, key: snapshot.intent.key, intentSha256: snapshot.intentSha256,
            identity: snapshot.intent.identity, output: snapshot.output, maxAttempts: handoffLimits.attemptsPerRequest };
        const associationFile = base + '.association.json';
        if (fs.existsSync(associationFile)) {
            if (resident(associationFile).size > 1000000 ||
                !readResident(associationFile).equals(Buffer.from(json(association)))) fail('handoff-association-conflict');
        } else {
            if (fs.existsSync(base) || fs.existsSync(base + '.handoff.json')) fail('unassociated-job');
            publish(associationFile, json(association));
        }
        checkpointHook('association-published');
        stateFile = base + '.handoff.json';
        if (fs.existsSync(stateFile)) {
            if (resident(stateFile).size > handoffLimits.stateBytes) fail('handoff-state-limit');
            state = JSON.parse(readResident(stateFile));
            if (state.version !== 1 || state.associationSha256 !== sha(json(association)) ||
                !Array.isArray(state.runs)) fail('handoff-state-conflict');
        } else state = { version: 1, associationSha256: sha(json(association)), runs: [] };
        if (state.runs.length >= handoffLimits.runs) fail('handoff-run-limit');
        for (const prior of state.runs) if (prior.outcome === 'dispatching') prior.outcome = 'interrupted';
        run = { startedAt: now(), outcome: 'dispatching', requests: 0, decodedBytes: 0, reservedBytes: 0, charges: {},
            runtimeEmissionCompleteness: 'unknown', managedAdmission: 'not-attempted', analysisAlignment: 'unassessed' };
        state.runs.push(run); save(); checkpointHook('dispatch-checkpointed'); stable();
        // Contract-compliant discovery writers cannot run while this lock is held.
        // Lock loss aborts the worker; the worker owns its own bounded child cleanup.
        monitor = setInterval(() => { try { release.assertHeld(); } catch { controller.abort(); } }, 100);
        const boundedSession = options => {
            const session = sessionFactory({ ...options, maxBytes: handoffLimits.responseBytes, timeoutMs: handoffLimits.responseMs });
            return {
                login: async () => { stable(); const value = await session.login(); stable(); return value; },
                get: async (suffix, attemptId) => {
                    try {
                        stable();
                        if (!/^[a-f0-9-]{36}$/.test(attemptId) || state.runs.some(r => r.charges?.[attemptId])) fail('request-accounting-conflict');
                        if (run.requests >= handoffLimits.requests) fail('request-budget-exhausted');
                        // Keep the reservation durable until a verified retained receipt replaces it.
                        if (run.decodedBytes + run.reservedBytes + handoffLimits.responseBytes > handoffLimits.totalResponseBytes) fail('byte-budget-exhausted');
                        run.charges[attemptId] = { suffix, bytes: null, fingerprint: null };
                        run.requests++; run.reservedBytes += handoffLimits.responseBytes; save();
                    } catch (error) { throw normalizedError(error, 'handoff-checkpoint-failed'); }
                    const response = await session.get(suffix);
                    if (!Buffer.isBuffer(response.body) || response.body.length > handoffLimits.responseBytes) fail('response-limit');
                    return response;
                },
                retained: (attemptId, receipt) => {
                    // Called only after durable body/receipt publication, or byte-verified recovery.
                    try {
                        stable();
                        const owners = state.runs.filter(r => r.charges?.[attemptId]);
                        if (!owners.length) return; // Reused response from a pre-accounting job.
                        if (owners.length !== 1) fail('request-accounting-conflict');
                        const owner = owners[0], charge = owner.charges[attemptId];
                        if (receipt.url !== `${origin}/api/game/${matchId}${charge.suffix}` ||
                            !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 0 || receipt.bytes > handoffLimits.responseBytes ||
                            !digest(receipt.fingerprint)) fail('request-accounting-conflict');
                        if (charge.bytes !== null) {
                            if (charge.bytes !== receipt.bytes || charge.fingerprint !== receipt.fingerprint) fail('request-accounting-conflict');
                            return;
                        }
                        charge.bytes = receipt.bytes; charge.fingerprint = receipt.fingerprint;
                        owner.decodedBytes += receipt.bytes; owner.reservedBytes -= handoffLimits.responseBytes;
                        save();
                    } catch (error) { throw normalizedError(error, 'handoff-checkpoint-failed'); }
                },
                close: () => session.close(),
            };
        };
        const result = await worker({ ...snapshot.intent.retrieval, accountId, arenaId: snapshot.intent.identity.arenaId,
            library, maxAttempts: handoffLimits.attemptsPerRequest, refresh: false,
            signal: controller.signal, sessionFactory: boundedSession });
        stable();
        if (!['retrieved-all-planned-responses', 'partial'].includes(result?.outcome)) fail('worker-result-invalid');
        run.outcome = result.outcome; run.completedAt = now();
        run.coverage = result.coverage ?? null; save(); checkpointHook('result-checkpointed');
        return { key: snapshot.intent.key, output: snapshot.output, ...run };
    } catch (error) {
        operationFailure = normalizedError(error, 'handoff-failed');
        if (run) {
            run.outcome = 'partial'; run.completedAt = now(); run.error = errorDetails(operationFailure);
            try { save(); } catch (cleanup) { withCleanup(operationFailure, cleanup, 'failure-checkpoint-failed'); }
        }
        throw operationFailure;
    } finally {
        clearTimeout(timer); clearInterval(monitor); signal?.removeEventListener('abort', abort);
        try { await release(); } catch (cleanup) {
            const failure = withCleanup(operationFailure, cleanup, 'handoff-lock-cleanup-failed');
            if (!operationFailure) throw failure;
        }
    }
}

async function main() {
    const [spool, accountId, matchId, ...extra] = process.argv.slice(2);
    if (extra.length) fail('invalid-options');
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
        const result = await retrieveIntent({ spool, accountId, matchId, signal: controller.signal });
        console.log(JSON.stringify(result));
        if (result.outcome !== 'retrieved-all-planned-responses') process.exitCode = 2;
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
    console.error(JSON.stringify({ outcome: 'partial', ...errorDetails(error, 'handoff-failed') }));
    process.exitCode = 2;
});

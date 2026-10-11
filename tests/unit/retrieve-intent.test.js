import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { retrieveIntent, handoffLimits } from '../../tools/retrieve-intent.js';
import { retrieveMatch } from '../../tools/retrieve-match.js';
import { validateDiscovery } from '../../tools/discover-matches.js';
import { discoveryPath, origin } from '../../tools/arena-retrieval-session.js';
import { acquireWriter, readResident, RetrievalError, errorDetails } from '../../tools/retrieval-files.js';

const sha = b => createHash('sha256').update(b).digest('hex');
const json = v => JSON.stringify(v, null, 2) + '\n';
const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa', matchId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const arenaId = 'cccccccccccccccccccccccc', codeId = 'dddddddddddddddddddddddd';
const opponent = 'eeeeeeeeeeeeeeeeeeeeeeee', enemyCode = 'ffffffffffffffffffffffff';
const account = 'synthetic-account', time = '2026-10-10T00:00:00.000Z';
const identity = { matchId, accountId, account, arenaId, codeId, codeVersion: 1 };
const complete = { outcome: 'retrieved-all-planned-responses', coverage: { requiredRequests: 4, successfulRequests: 4 } };

// Entirely synthetic; no live spool or missing historical positions are filled.
function setup() {
    const spool = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-handoff-offline-')));
    for (const dir of ['bodies', 'receipts', 'intents']) fs.mkdirSync(path.join(spool, dir));
    const metadata = { ok: 1, game: { _id: matchId, arena: arenaId, user: accountId, meta: { ticks: 1 },
        codes: [{ _id: codeId, user: accountId, version: 1 }, { _id: enemyCode, user: opponent, version: 1 }],
        users: [{ _id: accountId, username: account }, { _id: opponent, username: 'synthetic-opponent' }],
        game: { _id: matchId, status: 'finished', hasReplay: true, createdAt: time, meta: { ticks: 1 },
            usersCode: [codeId, enemyCode], firstPlayerIndex: 0 } } };
    const expected = { account, accountId, arenaId };
    function receipt(value, index = 1, status = 200) {
        const body = Buffer.from(json(value)), bodySha256 = sha(body);
        const descriptor = { kind: 'metadata', matchId };
        const r = { id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'), descriptor,
            method: 'GET', url: origin + discoveryPath(arenaId, descriptor),
            startedAt: time, completedAt: time, status, byteCount: body.length,
            bodySha256, bodyFile: 'bodies/' + bodySha256 + '.response',
            validation: validateDiscovery(descriptor, body, status, expected) };
        fs.writeFileSync(path.join(spool, r.bodyFile), body);
        fs.writeFileSync(path.join(spool, 'receipts', r.id + '.json'), json(r)); return r;
    }
    const r = receipt(metadata), output = path.join(spool, 'retrieval', accountId, matchId);
    const intent = { version: 1, key: accountId + '/' + matchId, state: 'pending-retrieval', identity,
        metadataReceipt: r.id, metadataBodySha256: r.bodySha256, createdAt: time,
        retrieval: { matchId, account, codeId, codeVersion: 1, output },
        execution: 'not-started', managedAdmission: 'not-attempted' };
    const intentFile = 'intents/' + accountId + '-' + matchId + '.json';
    fs.writeFileSync(path.join(spool, intentFile), json(intent));
    const ledger = { version: 1, expected, responses: [r],
        intents: { [matchId]: { file: intentFile, sha256: sha(json(intent)), identity, eligible: true } },
        observed: { [matchId]: { identity, metadataReceipt: r.id, status: 'finished', hasReplay: true } },
        identityFailures: {}, runs: [{ completedAt: time, inFlight: null }], pendingResponse: null, pendingIntent: null };
    const save = () => fs.writeFileSync(path.join(spool, 'discovery.json'), json(ledger));
    save();
    let dispatched = 0;
    const options = { spool, accountId, matchId, worker: async args => {
        dispatched++; assert.equal(args.output, output); assert.equal(args.accountId, accountId);
        assert.equal(args.arenaId, arenaId); assert.equal(args.refresh, false);
        assert(fs.existsSync(output + '.association.json'));
        assert.equal(JSON.parse(readResident(output + '.handoff.json')).runs.at(-1).outcome, 'dispatching');
        return complete;
    } };
    return { spool, output, ledger, intent, intentFile: path.join(spool, intentFile), metadata, save, receipt,
        run: extra => retrieveIntent({ ...options, ...extra }), calls: () => dispatched,
        state: () => JSON.parse(readResident(output + '.handoff.json')) };
}

test('explicit selection publishes one immutable association; repeats use stable job and preserve discovery bytes', async () => {
    const h = setup(), before = readResident(h.intentFile), ledger = readResident(path.join(h.spool, 'discovery.json'));
    const first = await h.run(), association = readResident(h.output + '.association.json');
    assert.equal(first.outcome, complete.outcome); await h.run();
    assert.equal(h.calls(), 2); assert.equal(h.state().runs.length, 2);
    assert(readResident(h.output + '.association.json').equals(association));
    assert(readResident(h.intentFile).equals(before)); assert(readResident(path.join(h.spool, 'discovery.json')).equals(ledger));
    assert.equal(first.runtimeEmissionCompleteness, 'unknown');
    assert.equal(first.managedAdmission, 'not-attempted'); assert.equal(first.analysisAlignment, 'unassessed');
});

for (const fault of ['ineligible', 'blocked', 'conflict', 'sticky', 'pending', 'unfinished', 'no-replay',
    'wrong-account', 'body', 'receipt', 'intent', 'missing-body', 'wrong-arena', 'new-conflict', 'unavailable']) {
    test('rejects selected evidence: ' + fault, async () => {
        const h = setup(), indexed = h.ledger.intents[matchId], observed = h.ledger.observed[matchId];
        if (fault === 'ineligible') indexed.eligible = false;
        if (fault === 'blocked') indexed.blocked = 'identity-conflict';
        if (fault === 'conflict') observed.conflict = true;
        if (fault === 'sticky') h.ledger.identityFailures[matchId] = [{ reason: 'row-identity-mismatch' }];
        if (fault === 'pending') h.ledger.pendingResponse = h.ledger.responses[0];
        if (fault === 'wrong-account') h.ledger.expected.accountId = opponent;
        if (fault === 'body') fs.appendFileSync(path.join(h.spool, h.ledger.responses[0].bodyFile), ' ');
        if (fault === 'receipt') fs.appendFileSync(path.join(h.spool, 'receipts', h.ledger.responses[0].id + '.json'), ' ');
        if (fault === 'intent') fs.appendFileSync(h.intentFile, ' ');
        if (fault === 'missing-body') h.ledger.responses[0].bodyFile = 'bodies/' + '0'.repeat(64) + '.response';
        if (['unfinished', 'no-replay', 'wrong-arena', 'new-conflict', 'unavailable'].includes(fault)) {
            const changed = structuredClone(h.metadata);
            if (fault === 'unfinished') changed.game.game.status = 'running';
            if (fault === 'no-replay') changed.game.game.hasReplay = false;
            if (fault === 'wrong-arena') changed.game.arena = opponent;
            if (fault === 'new-conflict') changed.game.codes[0].version = 2;
            const r = h.receipt(changed, 2, fault === 'unavailable' ? 503 : 200);
            h.ledger.responses.push(r); observed.metadataReceipt = r.id;
        }
        h.save(); await assert.rejects(h.run()); assert.equal(h.calls(), 0);
        assert.equal(fs.existsSync(h.output + '.association.json'), false);
    });
}

test('eligibility changed after selection is rejected before association/dispatch', async () => {
    const h = setup();
    await assert.rejects(h.run({ checkpointHook: phase => {
        if (phase === 'selection-verified') { h.ledger.intents[matchId].eligible = false; h.save(); }
    } }), /eligibility-changed/); assert.equal(h.calls(), 0);
});

for (const phase of ['association-published', 'dispatch-checkpointed', 'result-checkpointed']) {
    test('interrupted publication at ' + phase + ' resumes same job', async () => {
        const h = setup(), original = readResident(h.intentFile);
        await assert.rejects(h.run({ checkpointHook: p => { if (p === phase) throw Error('offline interruption'); } }));
        const association = readResident(h.output + '.association.json');
        await h.run();
        assert(readResident(h.output + '.association.json').equals(association));
        assert(readResident(h.intentFile).equals(original));
    });
}

test('crash-left dispatch and later revoked eligibility never bypass revalidation', async () => {
    const h = setup(); await h.run();
    const s = h.state(); s.runs[0].outcome = 'dispatching'; fs.writeFileSync(h.output + '.handoff.json', json(s));
    h.ledger.intents[matchId].eligible = false; h.save(); await assert.rejects(h.run(), /intent-ineligible/);
    h.ledger.intents[matchId].eligible = true; h.save(); await h.run();
    assert.equal(h.state().runs[0].outcome, 'interrupted');
});

test('concurrent handoff and discovery writer are excluded for whole worker lifetime', async () => {
    const h = setup();
    await h.run({ worker: async () => {
        await assert.rejects(h.run(), /job-locked/);
        await assert.rejects(acquireWriter(h.spool), /job-locked/); return complete;
    } });
    await h.run();
});

test('worker error and lock cleanup failure remain separately identifiable and secret-free', async () => {
    const h = setup();
    await assert.rejects(h.run({ worker: async () => { throw new RetrievalError('worker-probe-failed'); },
        lock: async root => { const release = await acquireWriter(root);
            const wrapped = async () => { await release(); throw new RetrievalError('release-probe-failed'); };
            wrapped.assertHeld = release.assertHeld; return wrapped; },
    }), e => { const d = errorDetails(e); assert.equal(d.reason, 'worker-probe-failed');
        assert.equal(d.cleanupFailures[0].reason, 'release-probe-failed'); return true; });
    assert.equal(h.state().runs[0].outcome, 'partial');
});

test('worker partial result stays partial, never emission completeness', async () => {
    const h = setup(); const r = await h.run({ worker: async () => ({ outcome: 'partial', coverage: { unresolvedRequests: ['log-1'] } }) });
    assert.equal(r.outcome, 'partial'); assert.equal(r.runtimeEmissionCompleteness, 'unknown');
});

test('association corruption and output tampering are not repaired', async () => {
    const h = setup(); await h.run(); fs.appendFileSync(h.output + '.association.json', ' ');
    await assert.rejects(h.run(), /handoff-association-conflict/); assert.equal(h.calls(), 1);
    const other = setup(); other.intent.retrieval.output = os.tmpdir();
    fs.writeFileSync(other.intentFile, json(other.intent)); other.ledger.intents[matchId].sha256 = sha(json(other.intent)); other.save();
    await assert.rejects(other.run(), /intent-integrity/);
});

function transport(h, customize = () => {}) {
    let closed = 0; const calls = [];
    return { calls, closed: () => closed, factory: () => ({
        login: async () => ({ id: accountId, username: account }),
        get: async suffix => {
            calls.push(suffix);
            const value = suffix === '' ? structuredClone(h.metadata) : suffix.startsWith('/log/') ? {} :
                [{ gameTime: suffix === '/replay/0' ? 0 : 1, objects: [], ui: { version: 1, items: [] } }];
            customize(value, suffix);
            return { status: 200, body: Buffer.from(json(value)), startedAt: time, completedAt: time };
        }, close: async () => { closed++; },
    }) };
}

for (const cleanupFails of [false, true]) {
    test('post-response checkpoint EIO retains response without retry; cleanup fails=' + cleanupFails, async () => {
        const h = setup(), t = transport(h);
        const originalOpen = fs.openSync;
        let armed = false, injected = false, failure;
        fs.openSync = function (file, ...args) {
            if (armed && !injected && typeof file === 'string' &&
                file.startsWith(h.output + '.handoff.json.') && file.endsWith('.pending')) {
                injected = true;
                throw Object.assign(new Error('synthetic checkpoint failure'), { code: 'EIO' });
            }
            return originalOpen.call(this, file, ...args);
        };
        try {
            await h.run({ worker: options => retrieveMatch({ ...options, wait: async () => {} }),
                sessionFactory: options => {
                    const s = t.factory(options);
                    return { ...s, get: async suffix => { const response = await s.get(suffix); armed = true; return response; },
                        close: async () => { await s.close(); if (cleanupFails) throw new RetrievalError('checkpoint-close-probe'); } };
                } });
        } catch (error) { failure = error; }
        finally { fs.openSync = originalOpen; }
        assert(injected);
        assert.equal(failure?.systemCode, 'EIO');
        if (cleanupFails) assert.equal(errorDetails(failure).cleanupFailures[0].reason, 'checkpoint-close-probe');
        assert.deepEqual(t.calls, ['']);
        const ledger = JSON.parse(readResident(h.output + '/ledger.json'));
        const attempt = Object.values(ledger.requests)[0].attempts[0];
        const receipt = JSON.parse(readResident(path.join(h.output, 'receipts', attempt.id + '.json')));
        assert(readResident(path.join(h.output, receipt.bodyFile)).equals(Buffer.from(json(h.metadata))));
        assert.equal(ledger.outcome, 'partial');
        assert.equal(h.state().runs[0].outcome, 'partial');
        assert.equal(h.state().runs[0].error.systemCode, 'EIO');
        const association = readResident(h.output + '.association.json'), intent = readResident(h.intentFile);
        await h.run({ worker: undefined, sessionFactory: t.factory });
        assert.deepEqual(t.calls, ['', '/replay/0', '/log/1', '/replay/1']);
        assert(readResident(h.output + '.association.json').equals(association));
        assert(readResident(h.intentFile).equals(intent));
    });
}

for (const phase of ['body-published', 'receipt-published']) {
    test('interrupted ' + phase + ' reconciles original reservation from verified retained bytes', async () => {
        const h = setup(), t = transport(h);
        await assert.rejects(h.run({ sessionFactory: t.factory, worker: options => retrieveMatch({ ...options,
            checkpointHook: p => { if (p === phase) throw new RetrievalError('synthetic-publication-interruption'); },
        }) }), /synthetic-publication-interruption/);
        assert.deepEqual(t.calls, ['']);
        assert.equal(h.state().runs[0].requests, 1);
        assert.equal(h.state().runs[0].decodedBytes, 0);
        assert.equal(h.state().runs[0].reservedBytes, handoffLimits.responseBytes);
        await h.run({ worker: undefined, sessionFactory: t.factory });
        assert.deepEqual(t.calls, ['', '/replay/0', '/log/1', '/replay/1']);
        const state = h.state();
        assert.equal(state.runs[0].requests, 1);
        assert.equal(state.runs[0].decodedBytes, Buffer.byteLength(json(h.metadata)));
        assert.equal(state.runs[0].reservedBytes, 0);
        assert.equal(state.runs[1].requests, 3);
        await h.run({ worker: undefined, sessionFactory: t.factory });
        assert.deepEqual(h.state().runs.slice(0, 2), state.runs);
        assert.equal(h.state().runs[2].requests, 0);
        assert.equal(t.calls.length, 4);
    });
}

test('persistent accounting failure leaves durable reservation; recovery verifies evidence before reconciliation', async () => {
    const h = setup(), t = transport(h), originalOpen = fs.openSync;
    let armed = false;
    fs.openSync = function (file, ...args) {
        if (armed && typeof file === 'string' && file.startsWith(h.output + '.handoff.json.') && file.endsWith('.pending')) {
            throw Object.assign(new Error('synthetic persistent checkpoint failure'), { code: 'EIO' });
        }
        return originalOpen.call(this, file, ...args);
    };
    try {
        await assert.rejects(h.run({ worker: undefined, sessionFactory: options => {
            const s = t.factory(options);
            return { ...s, get: async suffix => { const r = await s.get(suffix); armed = true; return r; } };
        } }), error => {
            assert.equal(error.systemCode, 'EIO');
            assert.equal(errorDetails(error).cleanupFailures[0].systemCode, 'EIO'); return true;
        });
    } finally { fs.openSync = originalOpen; }
    assert.deepEqual(t.calls, ['']);
    assert.equal(h.state().runs[0].outcome, 'dispatching');
    assert.equal(h.state().runs[0].reservedBytes, handoffLimits.responseBytes);
    const ledger = JSON.parse(readResident(h.output + '/ledger.json'));
    const attempt = Object.values(ledger.requests)[0].attempts[0];
    const bodyFile = path.join(h.output, attempt.pendingReceipt.bodyFile), original = readResident(bodyFile);
    fs.appendFileSync(bodyFile, ' ');
    await assert.rejects(h.run({ worker: undefined, sessionFactory: t.factory }), /retained-body-corrupt/);
    assert.equal(h.state().runs[0].reservedBytes, handoffLimits.responseBytes);
    assert.equal(t.calls.length, 1);
    // Restore only this synthetic corruption to exercise the interrupted job's recovery.
    fs.writeFileSync(bodyFile, original);
    await h.run({ worker: undefined, sessionFactory: t.factory });
    assert.equal(h.state().runs[0].outcome, 'interrupted');
    assert.equal(h.state().runs[0].decodedBytes, original.length);
    assert.equal(h.state().runs[0].reservedBytes, 0);
    assert.equal(h.state().runs.at(-1).requests, 3);
    assert.deepEqual(t.calls, ['', '/replay/0', '/log/1', '/replay/1']);
});

test('pre-request checkpoint EIO is not a transport retry and preserves cleanup failure', async () => {
    const h = setup(), t = transport(h), originalOpen = fs.openSync;
    let armed = false, injected = false;
    fs.openSync = function (file, ...args) {
        if (armed && !injected && typeof file === 'string' && file.startsWith(h.output + '.handoff.json.') && file.endsWith('.pending')) {
            injected = true; throw Object.assign(new Error('synthetic reservation failure'), { code: 'EIO' });
        }
        return originalOpen.call(this, file, ...args);
    };
    try {
        await assert.rejects(h.run({ worker: options => retrieveMatch({ ...options, wait: async () => {} }),
            sessionFactory: options => { const s = t.factory(options); return { ...s,
                login: async () => { const result = await s.login(); armed = true; return result; },
                close: async () => { throw new RetrievalError('reservation-close-probe'); },
            }; },
        }), error => { assert.equal(error.code, 'handoff-checkpoint-failed'); assert.equal(error.systemCode, 'EIO');
            assert.equal(errorDetails(error).cleanupFailures[0].reason, 'reservation-close-probe'); return true; });
    } finally { fs.openSync = originalOpen; }
    assert(injected); assert.deepEqual(t.calls, []);
    const ledger = JSON.parse(readResident(h.output + '/ledger.json'));
    assert.equal(Object.values(ledger.requests)[0].attempts.length, 1);
});

for (const classified of [false, true]) {
    test('genuine transport failure still retries, retaining conservative reservation; classified=' + classified, async () => {
        const h = setup(), t = transport(h); let gets = 0;
        await h.run({ worker: options => retrieveMatch({ ...options, wait: async () => {} }),
            sessionFactory: options => { const s = t.factory(options); return { ...s, get: async suffix => {
                if (++gets === 1) throw classified ? new RetrievalError('transport-failed') :
                    Object.assign(new Error('synthetic transport reset'), { code: 'ECONNRESET' });
                return s.get(suffix);
            } }; },
        });
        assert.equal(gets, 5); assert.equal(h.state().runs[0].requests, 5);
        assert.equal(h.state().runs[0].reservedBytes, handoffLimits.responseBytes);
        assert.equal(h.state().runs[0].outcome, complete.outcome);
        const ledger = JSON.parse(readResident(h.output + '/ledger.json'));
        assert.equal(Object.values(ledger.requests)[0].attempts[0].reason, 'transport-failed');
    });
}

test('unsettled response reservations cannot bypass the aggregate byte budget', async () => {
    const h = setup(); let gets = 0;
    await assert.rejects(h.run({ sessionFactory: () => ({ get: async () => { gets++; return { body: Buffer.alloc(0) }; } }),
        worker: async ({ sessionFactory }) => { const s = sessionFactory({});
            for (let i = 0; i < 33; i++) await s.get('', randomUUID()); return complete; },
    }), /byte-budget-exhausted/);
    assert.equal(gets, 32); assert.equal(h.state().runs[0].reservedBytes, handoffLimits.totalResponseBytes);
    assert.equal(h.state().runs[0].decodedBytes, 0);
});
test('real resumable worker with mock transport: identity pins, four requests, byte-verified no-GET resume', async () => {
    const h = setup(), t = transport(h);
    await h.run({ worker: undefined, sessionFactory: t.factory });
    assert.deepEqual(t.calls, ['', '/replay/0', '/log/1', '/replay/1']);
    await h.run({ worker: undefined, sessionFactory: t.factory });
    assert.equal(t.calls.length, 4); assert.equal(t.closed(), 2);
    const l = JSON.parse(readResident(h.output + '/ledger.json'));
    assert.equal(l.expected.accountId, accountId); assert.equal(l.expected.arenaId, arenaId);
    const body = path.join(h.output, Object.values(l.requests)[0].attempts[0].pendingReceipt.bodyFile);
    fs.appendFileSync(body, ' ');
    await assert.rejects(h.run({ worker: undefined, sessionFactory: t.factory }), /retained-body-corrupt/);
    assert.equal(t.calls.length, 4);
});

test('worker metadata arena mismatch prevents chunk dispatch', async () => {
    const h = setup(), t = transport(h, (v, s) => { if (s === '') v.game.arena = opponent; });
    await assert.rejects(h.run({ worker: undefined, sessionFactory: t.factory }), /metadata-account-code-mismatch/);
    assert.deepEqual(t.calls, ['']); assert.equal(t.closed(), 1);
});

test('worker pins authenticated stable ID before any evidence GET', async () => {
    const h = setup(); let closed = 0;
    await assert.rejects(h.run({ worker: undefined, sessionFactory: () => ({
        login: async () => ({ id: opponent, username: account }),
        get: async () => assert.fail('must not request'), close: async () => { closed++; },
    }) }), /authenticated-account-mismatch/); assert.equal(closed, 1);
});

test('request budget is durable and finite, with unchanged helper limits', async () => {
    const h = setup(); let gets = 0;
    await assert.rejects(h.run({ sessionFactory: options => {
        assert.equal(options.maxBytes, handoffLimits.responseBytes); assert.equal(options.timeoutMs, 15000);
        return { get: async () => { gets++; return { body: Buffer.alloc(0) }; }, close: async () => {} };
    }, worker: async ({ sessionFactory }) => { const s = sessionFactory({});
        for (let i = 0; i < 101; i++) {
            const attemptId = randomUUID(); await s.get('', attemptId);
            s.retained(attemptId, { url: origin + '/api/game/' + matchId, bytes: 0, fingerprint: sha('empty') });
        } return complete; },
    }), /request-budget-exhausted/); assert.equal(gets, 100); assert.equal(h.state().runs[0].requests, 100);
});

test('pre-abort and mid-worker cancellation remain explicit partial failures', async () => {
    const h = setup(), c = new AbortController(); c.abort();
    await assert.rejects(h.run({ signal: c.signal }), /interrupted/); assert.equal(h.calls(), 0);
    const other = setup(), controller = new AbortController();
    await assert.rejects(other.run({ signal: controller.signal, worker: async () => {
        controller.abort(); return complete;
    } }), /interrupted/);
});

test('aggregate byte reservation stops before another response; oversized responses fail', async () => {
    const h = setup(); let gets = 0;
    const bytes = Buffer.alloc(handoffLimits.responseBytes);
    await assert.rejects(h.run({ sessionFactory: () => ({ get: async () => {
        gets++; return { body: bytes };
    } }), worker: async ({ sessionFactory }) => {
        const s = sessionFactory({}); for (let i = 0; i < 33; i++) {
            const attemptId = randomUUID(); await s.get('', attemptId);
            s.retained(attemptId, { url: origin + '/api/game/' + matchId, bytes: bytes.length, fingerprint: sha(bytes) });
        } return complete;
    } }), /byte-budget-exhausted/);
    assert.equal(gets, 32); assert.equal(h.state().runs[0].decodedBytes, handoffLimits.totalResponseBytes);
    const other = setup();
    await assert.rejects(other.run({ sessionFactory: () => ({ get: async () => ({ body: Buffer.alloc(16000001) }) }),
        worker: async ({ sessionFactory }) => { await sessionFactory({}).get('', randomUUID()); return complete; },
    }), /response-limit/);
});

test('real worker operation and session cleanup errors survive the handoff boundary', async () => {
    const h = setup(), t = transport(h, (v, s) => { if (s === '') v.game.arena = opponent; });
    await assert.rejects(h.run({ worker: undefined, sessionFactory: options => ({
        ...t.factory(options), close: async () => { throw new RetrievalError('session-close-probe'); },
    }) }), error => {
        assert.equal(error.code, 'metadata-account-code-mismatch');
        assert.equal(errorDetails(error).cleanupFailures[0].reason, 'session-close-probe'); return true;
    });
    assert.equal(h.state().runs[0].error.cleanupFailures[0].reason, 'session-close-probe');
});

test('eligibility change while mock worker requests evidence aborts further dispatch', async () => {
    const h = setup(); let gets = 0;
    await assert.rejects(h.run({ sessionFactory: () => ({ get: async () => {
        gets++; h.ledger.intents[matchId].eligible = false; h.save(); return { body: Buffer.alloc(0) };
    } }), worker: async ({ sessionFactory }) => {
        const s = sessionFactory({}); await s.get('', randomUUID()); await s.get('/replay/0', randomUUID()); return complete;
    } }), /eligibility-changed/); assert.equal(gets, 1);
});

test('sticky conflict prevents repeat dispatch even when replay and eligibility are true', async () => {
    const h = setup(); await h.run(); const original = readResident(h.intentFile);
    h.ledger.identityFailures[matchId] = [{ reason: 'row-identity-mismatch' }]; h.save();
    await assert.rejects(h.run(), /intent-ineligible/); assert.equal(h.calls(), 1);
    assert(readResident(h.intentFile).equals(original));
});

test('symlinked evidence directory and invalid explicit key are rejected', async () => {
    const h = setup(); fs.renameSync(path.join(h.spool, 'bodies'), path.join(h.spool, 'original-bodies'));
    fs.symlinkSync(path.join(h.spool, 'original-bodies'), path.join(h.spool, 'bodies'));
    await assert.rejects(h.run(), /unsafe-path/); assert.equal(h.calls(), 0);
    await assert.rejects(h.run({ matchId: '*' }), /invalid-options/);
});

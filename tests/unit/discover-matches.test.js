import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { discoverMatches, validateDiscovery } from '../../tools/discover-matches.js';
import { discoveryPath, steamSession } from '../../tools/arena-retrieval-session.js';
import { readResident, acquireWriter, RetrievalError, errorDetails } from '../../tools/retrieval-files.js';

const fixture = JSON.parse(readResident(fileURLToPath(new URL('../fixtures/discovery-qualified.json', import.meta.url))));
const expected = { account: 'bushdoctor2008', accountId: '60ce13d2df54262f119a12d8', arenaId: '6a86d8c454a3948a1e35f90c' };
const known = '6aca5a1a81bdde3573685fae';
const source = name => fixture.responses.find(r => r.label === name);
const realMetadata = JSON.parse(source('known-metadata').body);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const body = value => Buffer.from(JSON.stringify(value));
const response = value => ({ status: 200, body: body(value) });
const clone = value => structuredClone(value);

// All rows produced by this helper are SYNTHETIC, not recovered real matches.
function synthetic(index, status = 'finished') {
    const row = clone(realMetadata.game);
    row._id = (10000 + index).toString(16).padStart(24, '0'); // Deliberately NOT the game ID.
    row.game._id = (20000 + index).toString(16).padStart(24, '0');
    row.game.status = status;
    row.game.createdAt = '2026-10-10T15:30:34.158Z'; // All equal timestamps.
    return row;
}
function metadata(row) { return { ok: 1, game: { ...clone(row), _id: row.game._id } }; }
function harness(rows = [synthetic(1)], customize = () => null) {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-discovery-offline-'));
    const calls = []; let closed = 0, logins = 0;
    const defaults = d => {
        if (d.kind === 'history') return response({ ok: 1, history: rows.slice(d.offset, d.offset + 10), meta: { length: rows.length } });
        if (d.kind === 'last-games') return response({ ok: 1, games: rows });
        if (d.kind === 'fame') return response({ ok: 1, items: rows, meta: { length: rows.length } });
        const row = rows.find(r => r.game._id === d.matchId);
        return row ? response(metadata(row)) : { status: 404, body: body({}) };
    };
    const options = { output, ...expected, sessionFactory: () => ({
        login: async () => { logins++; return { id: expected.accountId, username: expected.account }; },
        get: async d => { calls.push(clone(d)); return await customize(d, calls, defaults(d)) ?? defaults(d); },
        close: async () => { closed++; },
    }) };
    return { options, calls, output, rows, closed: () => closed, logins: () => logins,
        ledger: () => JSON.parse(readResident(path.join(output, 'discovery.json'))),
        intents: () => fs.readdirSync(path.join(output, 'intents')).filter(f => f.endsWith('.json')) };
}

test('retained discovery fixture bytes/provenance and all inspected response shapes validate', () => {
    for (const r of fixture.responses) {
        assert.equal(sha(Buffer.from(r.body)), r.sha256);
        const url = new URL(r.url);
        const descriptor = r.label.startsWith('history-') ? { kind: 'history', offset: Number(url.searchParams.get('offset')) }
            : r.label === 'known-metadata' ? { kind: 'metadata', matchId: known }
                : { kind: r.label === 'fame-games' ? 'fame' : 'last-games' };
        assert.equal(originPath(descriptor), url.pathname + url.search);
        assert.equal(validateDiscovery(descriptor, Buffer.from(r.body), r.status, expected).valid, true);
    }
    assert.deepEqual(fixture.provenance.unrequestedHistoryPositions, [40, 46]);
    assert.equal(fixture.provenance.syntheticRecords, false);
});
function originPath(d) { return discoveryPath(expected.arenaId, d); }

test('real retained sample: one known intent, unavailable positions 40–46 stay a gap, no invented metadata', async () => {
    const positions = new Map();
    for (const [label, offset] of [['history-offset0', 0], ['history-offset10', 10],
        ['history-offset20', 20], ['history-offset30', 30], ['history-tail', 47]]) {
        JSON.parse(source(label).body).history.forEach((row, i) => positions.set(offset + i, row));
    }
    assert.equal(positions.size, 50);
    for (let i = 40; i <= 46; i++) assert.equal(positions.has(i), false);
    // Derived offset pages are MOCK responses assembled solely from retained positions.
    const h = harness([], d => {
        if (d.kind === 'history') {
            const rows = [];
            for (let i = d.offset; i < Math.min(57, d.offset + 10); i++) {
                if (!positions.has(i)) return { status: 503, body: body({ offlineFixtureGap: [40, 46] }) };
                rows.push(positions.get(i));
            }
            return response({ ok: 1, history: rows, meta: { length: 57 } });
        }
        if (d.kind === 'metadata') return d.matchId === known
            ? { status: 200, body: Buffer.from(source('known-metadata').body) } : { status: 404, body: body({ offlineMetadataUnavailable: true }) };
        return { status: 200, body: Buffer.from(source(d.kind === 'fame' ? 'fame-games' : 'last-games').body) };
    });
    const result = await discoverMatches({ ...h.options, maxSweeps: 2 });
    assert.equal(result.outcome, 'partial-with-gaps');
    assert.equal(result.enumeration, 'partial');
    assert(result.gaps.some(g => g.reason === 'http-503' && g.descriptor.offset === 32));
    assert.equal(h.intents().length, 1);
    assert(h.intents()[0].includes(known));
    assert.equal(fs.existsSync(path.join(h.output, 'retrieval')), false);
    assert.equal(result.losslessCatchUp, 'unqualified');
});

test('synthetic cross-source duplicates, wrapper IDs, repeated runs and immutable unique handoff', async () => {
    const h = harness(); const original = clone(h.rows);
    const first = await discoverMatches(h.options);
    assert.equal(first.enumeration, 'available-history-enumerated');
    assert.equal(first.outcome, 'enumerated-with-coverage-gaps');
    assert.equal(first.losslessCatchUp, 'unqualified');
    assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 1);
    assert.equal(h.intents().length, 1);
    const file = path.join(h.output, 'intents', h.intents()[0]), bytes = readResident(file);
    const intent = JSON.parse(bytes);
    assert.equal(intent.key, expected.accountId + '/' + h.rows[0].game._id);
    assert.notEqual(intent.identity.matchId, h.rows[0]._id);
    assert.equal(intent.execution, 'not-started');
    assert.equal(intent.retrieval.codeVersion, 24);
    h.calls.length = 0;
    await discoverMatches(h.options);
    assert.deepEqual(h.calls[0], { kind: 'history', offset: 0 });
    assert.equal(h.calls.some(d => d.kind === 'metadata'), false); // Reused proof is not fresh metadata.
    assert(readResident(file).equals(bytes));
    assert.deepEqual(h.rows, original);
    assert.equal(h.closed(), 2);
});

test('synthetic multi-page downtime and equal timestamps retain every distinct ID', async () => {
    const h = harness(Array.from({ length: 12 }, (_, i) => synthetic(i)));
    const result = await discoverMatches(h.options);
    assert.equal(result.intentCount, 12);
    assert.equal(result.enumeration, 'available-history-enumerated');
    assert.deepEqual(result.sweeps[0].pages.map(p => p.offset), [0, 8, 12]);
    assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 12);
});

test('synthetic unfinished match is rechecked by ID after disappearing and later creates one intent', async () => {
    let finished = false;
    const row = synthetic(1, 'running');
    const h = harness([row], d => {
        if (finished && d.kind === 'metadata') return response(metadata({ ...row, game: { ...row.game, status: 'finished' } }));
    });
    const first = await discoverMatches(h.options);
    assert.equal(h.intents().length, 0);
    assert(first.gaps.some(g => g.reason === 'match-not-finished'));
    finished = true; h.rows.length = 0; h.calls.length = 0;
    const second = await discoverMatches(h.options);
    assert.equal(h.intents().length, 1);
    assert(second.gaps.some(g => g.reason === 'history-anchors-missing'));
    assert(h.calls.some(d => d.kind === 'metadata' && d.matchId === row.game._id));
});

for (const [name, mutate] of [
    ['match', v => { v.game.game._id = 'ffffffffffffffffffffffff'; }],
    ['account', v => { v.game.user = 'ffffffffffffffffffffffff'; }],
    ['arena', v => { v.game.arena = 'ffffffffffffffffffffffff'; }],
    ['code', v => { v.game.codes.find(c => c.user === expected.accountId).version++; }],
]) test('synthetic metadata ' + name + ' mismatch never creates an intent', async () => {
    const h = harness([synthetic(1)], (d, calls, result) => {
        if (d.kind !== 'metadata') return null;
        const v = JSON.parse(result.body); mutate(v); return response(v);
    });
    const result = await discoverMatches(h.options);
    assert.equal(h.intents().length, 0); assert.equal(result.outcome, 'partial-with-gaps');
});

test('synthetic cancelled and unavailable replay remain explicit; finished errors are not silently discarded', async () => {
    const rows = [synthetic(1, 'cancelled'), synthetic(2), synthetic(3)];
    rows[1].game.hasReplay = false;
    rows[2].game.result = { error: 'SYNTHETIC GAME FAILURE' };
    const h = harness(rows), result = await discoverMatches(h.options);
    assert.equal(h.intents().length, 2);
    assert(result.unresolved.some(r => r.status === 'cancelled' && !r.hasIntent));
    assert(result.unresolved.some(r => r.hasReplay === false && r.hasIntent));
    assert.equal(result.outcome, 'partial-with-gaps');
});

for (const phase of ['response-planned', 'body-published', 'receipt-published', 'intent-planned', 'intent-published', 'intent-checkpointed']) {
    test('synthetic interrupted ' + phase + ' recovers without a second intent or blind offset resume', async () => {
        const h = harness(); let thrown = false;
        await assert.rejects(discoverMatches({ ...h.options, checkpointHook: current => {
            if (current === phase && !thrown) { thrown = true; throw new RetrievalError('mock-interruption'); }
        } }), /mock-interruption/);
        const prior = h.intents().map(f => readResident(path.join(h.output, 'intents', f)));
        h.calls.length = 0;
        await discoverMatches(h.options);
        assert.equal(h.intents().length, 1);
        if (prior.length) assert(readResident(path.join(h.output, 'intents', h.intents()[0])).equals(prior[0]));
        assert.deepEqual(h.calls[0], { kind: 'history', offset: 0 });
    });
}

test('synthetic page checkpoint follows retained metadata and durable intent', async () => {
    const h = harness();
    await discoverMatches({ ...h.options, checkpointHook: (phase, d) => {
        if (phase !== 'page-checkpointed' || d.offset !== 0) return;
        const ledger = h.ledger();
        assert.equal(h.intents().length, 1);
        assert(ledger.responses.some(r => r.descriptor.kind === 'metadata'));
        assert.equal(Object.keys(ledger.intents).length, 1);
    } });
});

for (const kind of ['count', 'overlap', 'short']) test('synthetic concurrent pagination ' + kind + ' cannot report successful enumeration', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => synthetic(i));
    const h = harness(rows, (d, calls, result) => {
        if (d.kind !== 'history' || d.offset !== 8) return null;
        const v = JSON.parse(result.body);
        if (kind === 'count') v.meta.length++;
        if (kind === 'overlap') v.history[0] = synthetic(90);
        if (kind === 'short') v.history.pop();
        return response(v);
    });
    const result = await discoverMatches(h.options);
    assert.equal(result.outcome, 'partial-with-gaps');
    assert.equal(result.enumeration, 'partial');
    assert(result.gaps.some(g => g.reason.includes(kind === 'count' ? 'count' : kind === 'short' ? 'range-gap' : 'overlap')));
});

test('synthetic unavailable history page stays partial and retained', async () => {
    const h = harness([], d => d.kind === 'history' ? { status: 503, body: body({}) } : null);
    const result = await discoverMatches(h.options);
    assert.equal(result.outcome, 'partial-with-gaps'); assert.equal(result.enumeration, 'partial');
    assert.equal(h.ledger().responses.filter(r => r.status === 503).length, 3);
});
test('synthetic request budget cannot advance an unresolved page or become catch-up success', async () => {
    const h = harness();
    await assert.rejects(discoverMatches({ ...h.options, maxRequests: 1 }), /request-budget-exhausted/);
    const run = h.ledger().runs.at(-1);
    assert.equal(h.calls.length, 1); assert.equal(run.outcome, 'partial-with-gaps');
    assert.equal(run.sweeps[0].checkpoint, undefined);
});
test('synthetic invocation deadline interrupts stuck login, closes session and keeps a partial result', async () => {
    const h = harness(); let closed = false;
    await assert.rejects(discoverMatches({ ...h.options, maxRuntimeMs: 200,
        sessionFactory: () => ({ login: () => new Promise(() => {}), close: async () => { closed = true; } }) }), /runtime-budget-exhausted/);
    assert(closed); assert.equal(h.ledger().runs.at(-1).outcome, 'partial-with-gaps');
});
test('synthetic authentication mismatch preserves original operation and cleanup errors', async () => {
    const h = harness();
    await assert.rejects(discoverMatches({ ...h.options, sessionFactory: () => ({
        login: async () => ({ id: expected.accountId, username: 'wrong' }),
        close: async () => { throw new RetrievalError('mock-close-failed'); },
    }) }), error => {
        const d = errorDetails(error);
        assert.equal(d.reason, 'authenticated-account-mismatch');
        assert(d.cleanupFailures.some(f => f.reason === 'mock-close-failed')); return true;
    });
});
test('synthetic HTTP auth failure stops without renewal; returned body stays retained', async () => {
    const h = harness([], () => ({ status: 401, body: body({}) }));
    await assert.rejects(discoverMatches(h.options), /authentication-failed/);
    assert.equal(h.calls.length, 1); assert.equal(h.logins(), 1);
    assert.equal(h.ledger().responses[0].status, 401);
});
test('synthetic corrupted retained bytes block reuse instead of overwriting', async () => {
    const h = harness(); await discoverMatches(h.options);
    const retained = path.join(h.output, h.ledger().responses[0].bodyFile);
    fs.writeFileSync(retained, 'SYNTHETIC CORRUPTION');
    h.calls.length = 0;
    await assert.rejects(discoverMatches(h.options), /retained-body-corrupt/);
    assert.equal(h.calls.length, 0); assert.equal(readResident(retained).toString(), 'SYNTHETIC CORRUPTION');
});
test('synthetic concurrent discovery writer is rejected', async () => {
    const h = harness(); const release = await acquireWriter(h.output);
    try { await assert.rejects(discoverMatches(h.options), /job-locked/); }
    finally { await release(); }
});

test('synthetic changed identity blocks an existing handoff without replacing its bytes', async () => {
    const h = harness(); await discoverMatches(h.options);
    const file = path.join(h.output, 'intents', h.intents()[0]), original = readResident(file);
    h.rows[0].codes.find(c => c.user === expected.accountId).version++;
    const result = await discoverMatches(h.options);
    assert.equal(result.outcome, 'partial-with-gaps');
    assert.equal(h.ledger().intents[h.rows[0].game._id].blocked, 'identity-conflict');
    assert(readResident(file).equals(original));
    assert(h.ledger().responses.filter(r => r.descriptor.kind === 'history').length > 4);
});
test('regression: rejected arena identity blocks an existing intent across restart', async () => {
    const h = harness(); await discoverMatches(h.options);
    const matchId = h.rows[0].game._id;
    const file = path.join(h.output, 'intents', h.intents()[0]), original = readResident(file);
    h.rows[0].arena = 'ffffffffffffffffffffffff';
    const result = await discoverMatches(h.options);
    assert.equal(result.outcome, 'partial-with-gaps');
    assert.equal(h.ledger().intents[matchId].blocked, 'identity-conflict');
    assert(h.ledger().identityFailures[matchId].some(f => f.reason === 'row-identity-mismatch'));
    h.rows[0].arena = expected.arenaId; h.rows[0].game.hasReplay = true;
    h.calls.length = 0;
    await discoverMatches(h.options);
    assert.equal(h.ledger().intents[matchId].blocked, 'identity-conflict');
    assert(h.ledger().observed[matchId].conflict);
    assert.equal(h.calls.some(d => d.kind === 'metadata'), false);
    assert(readResident(file).equals(original));
});

test('regression: unavailable replay refreshes once and preserves the immutable intent', async () => {
    const row = synthetic(1); row.game.hasReplay = false;
    const h = harness([row]); await discoverMatches(h.options);
    const file = path.join(h.output, 'intents', h.intents()[0]), original = readResident(file);
    h.rows[0].game.hasReplay = true; h.calls.length = 0;
    const result = await discoverMatches(h.options);
    assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 1);
    assert.equal(h.ledger().observed[row.game._id].hasReplay, true);
    assert.equal(result.unresolved.length, 0);
    assert.equal(result.losslessCatchUp, 'unqualified');
    const receipts = h.ledger().responses.filter(r => r.descriptor.kind === 'metadata');
    assert.deepEqual(receipts.map(r => r.validation.rows[0].hasReplay), [false, true]);
    for (const receipt of receipts) assert.equal(sha(readResident(path.join(h.output, receipt.bodyFile))), receipt.bodySha256);
    assert.equal(h.intents().length, 1); assert(readResident(file).equals(original));
    assert.equal(fs.existsSync(path.join(h.output, 'retrieval')), false);
    h.calls.length = 0; await discoverMatches(h.options);
    assert.equal(h.calls.some(d => d.kind === 'metadata'), false);
});

test('regression: rejected list identity uses game ID, never wrapper or ambiguous ID', async () => {
    let rejected;
    const h = harness([synthetic(1), synthetic(2)], d => {
        if (!rejected || d.kind !== 'fame') return null;
        return response({ ok: 1, items: [rejected], meta: { length: 1 } });
    });
    await discoverMatches(h.options);
    const [a, b] = h.rows.map(r => r.game._id);
    const originals = h.intents().map(f => [f, readResident(path.join(h.output, 'intents', f))]);
    rejected = clone(h.rows[0]); rejected._id = b;
    rejected.game._id = 'ambiguous'; rejected.arena = 'ffffffffffffffffffffffff';
    await discoverMatches(h.options);
    assert.equal(h.ledger().intents[a].blocked, undefined);
    assert.equal(h.ledger().intents[b].blocked, undefined);
    rejected.game._id = a;
    await discoverMatches(h.options);
    assert.equal(h.ledger().intents[a].blocked, 'identity-conflict');
    assert.equal(h.ledger().intents[b].blocked, undefined);
    for (const [file, bytes] of originals) assert(readResident(path.join(h.output, 'intents', file)).equals(bytes));
});

for (const failure of ['unavailable', 'arena', 'match', 'code']) {
    test('regression: bounded replay refresh handles ' + failure + ' without replacing intents', async () => {
        let refresh = false;
        const rows = [synthetic(1), synthetic(2)]; rows[0].game.hasReplay = false;
        const h = harness(rows, (d, calls, result) => {
            if (!refresh || d.kind !== 'metadata') return null;
            if (failure === 'unavailable') return { status: 503, body: body({ unavailable: true }) };
            const v = JSON.parse(result.body);
            v.game.game.hasReplay = true;
            if (failure === 'arena') v.game.arena = 'ffffffffffffffffffffffff';
            // The wrong returned ID belongs to another existing intent: do not block it.
            if (failure === 'match') v.game.game._id = rows[1].game._id;
            if (failure === 'code') v.game.codes.find(c => c.user === expected.accountId).version++;
            return response(v);
        });
        await discoverMatches(h.options);
        const originals = h.intents().map(f => [f, readResident(path.join(h.output, 'intents', f))]);
        refresh = true; h.calls.length = 0;
        const result = await discoverMatches(h.options);
        const matchId = rows[0].game._id;
        assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 1);
        assert.equal(result.outcome, 'partial-with-gaps');
        assert.equal(h.ledger().observed[matchId].hasReplay, false);
        assert.equal(h.ledger().intents[rows[1].game._id].blocked, undefined);
        assert.equal(h.ledger().intents[matchId].blocked, failure === 'unavailable' ? undefined : 'identity-conflict');
        assert.equal(h.ledger().responses.filter(r => r.descriptor.kind === 'metadata').length, 3);
        refresh = false; rows[0].game.hasReplay = true; h.calls.length = 0;
        await discoverMatches(h.options);
        assert.equal(h.calls.filter(d => d.kind === 'metadata').length, failure === 'unavailable' ? 1 : 0);
        assert.equal(h.ledger().observed[matchId].hasReplay, failure === 'unavailable');
        for (const [file, bytes] of originals) assert(readResident(path.join(h.output, 'intents', file)).equals(bytes));
    });
}

for (const phase of ['body-published', 'receipt-published']) {
    for (const conflict of [false, true]) {
        test('regression: replay refresh recovers ' + phase + (conflict ? ' identity rejection' : ' availability'), async () => {
            let refresh = false;
            const row = synthetic(1); row.game.hasReplay = false;
            const h = harness([row], (d, calls, result) => {
                if (!refresh || d.kind !== 'metadata') return null;
                const v = JSON.parse(result.body); v.game.game.hasReplay = true;
                if (conflict) v.game.user = 'ffffffffffffffffffffffff';
                return response(v);
            });
            await discoverMatches(h.options);
            const file = path.join(h.output, 'intents', h.intents()[0]), original = readResident(file);
            refresh = true;
            await assert.rejects(discoverMatches({ ...h.options, checkpointHook: (current, receipt) => {
                if (current === phase && receipt.descriptor.kind === 'metadata') throw new RetrievalError('mock-interruption');
            } }), /mock-interruption/);
            const pending = h.ledger().pendingResponse;
            assert(pending); h.calls.length = 0;
            await discoverMatches(h.options);
            const ledger = h.ledger(), matchId = row.game._id;
            assert.equal(ledger.pendingResponse, null);
            assert.equal(ledger.responses.filter(r => r.id === pending.id).length, 1);
            assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 0);
            assert.equal(ledger.observed[matchId].hasReplay, !conflict);
            assert.equal(ledger.intents[matchId].blocked, conflict ? 'identity-conflict' : undefined);
            if (conflict) assert(ledger.identityFailures[matchId].some(f => f.receiptId === pending.id));
            assert.equal(h.intents().length, 1); assert(readResident(file).equals(original));
        });
    }
}

test('regression: replay recheck respects request budget and preserves operation plus cleanup errors', async () => {
    const row = synthetic(1); row.game.hasReplay = false;
    const h = harness([row]); await discoverMatches(h.options);
    h.calls.length = 0;
    await assert.rejects(discoverMatches({ ...h.options, maxRequests: 1 }), /request-budget-exhausted/);
    assert.equal(h.calls.some(d => d.kind === 'metadata'), false);
    assert.equal(h.ledger().runs.at(-1).outcome, 'partial-with-gaps');
    const factory = h.options.sessionFactory;
    await assert.rejects(discoverMatches({ ...h.options, sessionFactory: () => {
        const session = factory();
        return { ...session, get: async d => {
            if (d.kind === 'metadata') throw new RetrievalError('mock-refresh-failed');
            return session.get(d);
        }, close: async () => { await session.close(); throw new RetrievalError('mock-close-failed'); } };
    } }), error => {
        const details = errorDetails(error);
        assert.equal(details.reason, 'mock-refresh-failed');
        assert(details.cleanupFailures.some(f => f.reason === 'mock-close-failed')); return true;
    });
    assert.equal(h.ledger().observed[row.game._id].hasReplay, false);
    assert.equal(h.intents().length, 1);
});

for (const interrupted of [false, true]) {
    test('finished-status regression: ' + (interrupted ? 'interrupted receipt recovery' : 'normal restart'), async () => {
        const row = synthetic(1); row.game.hasReplay = false;
        const h = harness([row]); await discoverMatches(h.options);
        const matchId = row.game._id;
        const file = path.join(h.output, 'intents', h.intents()[0]), original = readResident(file);
        row.game.status = 'running'; row.game.hasReplay = true;
        if (interrupted) {
            await assert.rejects(discoverMatches({ ...h.options, checkpointHook: (phase, receipt) => {
                if (phase === 'receipt-published' && receipt.descriptor.kind === 'metadata') throw new RetrievalError('mock-interruption');
            } }), /mock-interruption/);
            assert(h.ledger().pendingResponse);
        } else {
            const refresh = await discoverMatches(h.options);
            assert(refresh.gaps.some(g => g.reason === 'match-not-finished'));
        }
        h.calls.length = 0;
        const resumed = await discoverMatches(h.options);
        assert.equal(resumed.outcome, 'partial-with-gaps');
        assert(resumed.unresolved.some(r => r.matchId === matchId && r.status === 'running'));
        assert(resumed.gaps.some(g => g.reason === 'match-not-finished' && g.matchId === matchId));
        assert.equal(h.ledger().intents[matchId].eligible, false);
        assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 1);
        assert.equal(h.ledger().pendingResponse, null);
        // Budget exhaustion cannot turn retained running metadata into readiness.
        h.calls.length = 0;
        await assert.rejects(discoverMatches({ ...h.options, maxRequests: 1 }), /request-budget-exhausted/);
        assert.equal(h.calls.some(d => d.kind === 'metadata'), false);
        assert.equal(h.ledger().intents[matchId].eligible, false);
        row.game.status = 'finished'; h.calls.length = 0;
        const finished = await discoverMatches(h.options);
        assert.equal(h.calls.filter(d => d.kind === 'metadata').length, 1);
        assert.equal(finished.unresolved.length, 0);
        assert.equal(finished.outcome, 'enumerated-with-coverage-gaps');
        assert.equal(finished.losslessCatchUp, 'unqualified');
        assert.equal(h.ledger().intents[matchId].eligible, true);
        assert.equal(h.intents().length, 1); assert(readResident(file).equals(original));
        assert.equal(fs.existsSync(path.join(h.output, 'retrieval')), false);
        const metadataReceipts = h.ledger().responses.filter(r => r.descriptor.kind === 'metadata');
        assert.deepEqual(metadataReceipts.map(r => r.validation.rows[0].status), ['finished', 'running', 'running', 'finished']);
        for (const receipt of metadataReceipts) assert.equal(sha(readResident(path.join(h.output, receipt.bodyFile))), receipt.bodySha256);
        // Availability and completion never repair a sticky identity block.
        row.arena = 'ffffffffffffffffffffffff'; await discoverMatches(h.options);
        row.arena = expected.arenaId; h.calls.length = 0;
        const blocked = await discoverMatches(h.options);
        assert.equal(blocked.outcome, 'partial-with-gaps');
        assert.equal(h.ledger().intents[matchId].blocked, 'identity-conflict');
        assert.equal(h.ledger().intents[matchId].eligible, false);
        assert.equal(h.calls.some(d => d.kind === 'metadata'), false);
        assert(readResident(file).equals(original));
    });
}

test('synthetic corrupted metadata prevents recovery of a not-yet-published intent', async () => {
    const h = harness();
    await assert.rejects(discoverMatches({ ...h.options, checkpointHook: phase => {
        if (phase === 'intent-planned') throw new RetrievalError('mock-interruption');
    } }), /mock-interruption/);
    const metadata = h.ledger().responses.find(r => r.descriptor.kind === 'metadata');
    fs.writeFileSync(path.join(h.output, metadata.bodyFile), 'SYNTHETIC CORRUPTION');
    await assert.rejects(discoverMatches(h.options), /retained-body-corrupt/);
    assert.equal(h.intents().length, 0);
});
test('synthetic forged pending handoff is rejected before publication', async () => {
    const h = harness();
    await assert.rejects(discoverMatches({ ...h.options, checkpointHook: phase => {
        if (phase === 'intent-planned') throw new RetrievalError('mock-interruption');
    } }), /mock-interruption/);
    const ledger = h.ledger(); ledger.pendingIntent.retrieval.matchId = 'ffffffffffffffffffffffff';
    fs.writeFileSync(path.join(h.output, 'discovery.json'), JSON.stringify(ledger));
    await assert.rejects(discoverMatches(h.options), /retained-intent-invalid/);
    assert.equal(h.intents().length, 0);
});
test('synthetic oversized response and transport failure remain bounded partial failures', async () => {
    const large = harness([], () => ({ status: 200, body: Buffer.alloc(8_000_001) }));
    await assert.rejects(discoverMatches(large.options), /response-limit/);
    assert.equal(large.calls.length, 1);
    const failed = harness([], () => { throw Error('SECRET MUST NOT APPEAR'); });
    await assert.rejects(discoverMatches(failed.options), error => {
        assert.equal(errorDetails(error).reason, 'discovery-failed');
        assert(!JSON.stringify(errorDetails(error)).includes('SECRET')); return true;
    });
    assert(!readResident(path.join(failed.output, 'discovery.json')).includes(Buffer.from('SECRET')));
});
test('synthetic pre-aborted invocation makes no transport calls', async () => {
    const h = harness(), controller = new AbortController(); controller.abort();
    await assert.rejects(discoverMatches({ ...h.options, signal: controller.signal }), /interrupted/);
    assert.equal(h.calls.length, 0); assert.equal(h.logins(), 0);
});
test('synthetic output alias cannot bypass the repository boundary', async () => {
    const h = harness();
    const alias = path.join(h.output, 'repository-alias');
    const repository = fileURLToPath(new URL('../../', import.meta.url));
    fs.symlinkSync(repository, alias, 'dir');
    await assert.rejects(discoverMatches({ ...h.options, output: path.join(alias, 'not-created-discovery-spool') }), /unsafe-output/);
    assert.equal(fs.existsSync(path.join(repository, 'not-created-discovery-spool')), false);
    assert.equal(h.logins(), 0);
});

test('narrow transport accepts only demonstrated discovery descriptors, never log/frame/start URLs', async () => {
    for (const descriptor of [
        { kind: 'history', offset: -1 }, { kind: 'history', offset: 1.5 }, { kind: 'history', offset: 100001 },
        { kind: 'start' }, { kind: 'log', matchId: known }, { kind: 'replay', matchId: known },
        { kind: 'metadata', matchId: '../start' }, 'https://example.com',
    ]) assert.throws(() => originPath(descriptor), /request-not-allowed/);
    const urls = []; let cancelled = 0;
    const session = steamSession({ account: expected.account, discovery: { accountId: expected.accountId, arenaId: expected.arenaId },
        delay: async () => {}, loadBinding: () => ({
            init() {}, runCallbacks() {}, utils: { getAppId: () => 1137320 },
            auth: { getSessionTicketWithSteamId: async () => ({ getBytes: () => Buffer.from('synthetic-ticket'), cancel: () => cancelled++ }) },
        }), fetchImpl: async (url, options) => {
            urls.push({ url, method: options.method });
            return { status: 200, body: [body(url.endsWith('/login') ? { _id: expected.accountId, username: expected.account } : { ok: 1 })],
                headers: { getSetCookie: () => ['session=synthetic-secret; HttpOnly'] } };
        } });
    try {
        await session.login();
        for (const d of [{ kind: 'history', offset: 0 }, { kind: 'last-games' }, { kind: 'fame' }, { kind: 'metadata', matchId: known }]) {
            await session.get(d);
        }
        await assert.rejects(session.get('/log/100'), /request-not-allowed/);
    } finally { session.close(); }
    assert.equal(cancelled, 1);
    assert.deepEqual(urls.map(x => x.method), ['POST', 'GET', 'GET', 'GET', 'GET']);
    assert(urls.every(x => !x.url.includes('/start')));
});

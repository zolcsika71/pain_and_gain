import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chunkEnds, requestPlan, retrieveMatch } from '../../tools/retrieve-match.js';
import { allowedSuffix, steamSession } from '../../tools/arena-retrieval-session.js';
import { acquireWriter, RetrievalError } from '../../tools/retrieval-files.js';

const matchId = '6aca5a1a81bdde3573685fae';
const userId = '60ce13d2df54262f119a12d8';
const codeId = '6aca5a1881bdde5eaa685fad';
const account = 'bushdoctor2008';
const opponent = '626237824840c4b45529163c';
const enemyCode = '6ac3a246cc36c75c340e5c65';
const identity = { id: userId, username: account };
const body = value => Buffer.from(JSON.stringify(value));
const timestamp = '2026-10-10T17:00:00.000Z';

function metadata(duration = 1) {
    return { ok: 1, game: { _id: matchId, user: userId, meta: { ticks: duration },
        codes: [{ _id: codeId, user: userId, version: 24 }, { _id: enemyCode, user: opponent, version: 9 }],
        users: [{ _id: userId, username: account }, { _id: opponent, username: 'opponent' }],
        game: { _id: matchId, status: 'finished', hasReplay: true, meta: { ticks: duration },
            usersCode: [codeId, enemyCode], firstPlayerIndex: 1 } } };
}

function frame(gameTime) { return { gameTime, objects: [], ui: { version: 1, items: [] } }; }

function setup({ duration = 1, respond, login } = {}) {
    // Retain tiny synthetic jobs for inspection; no production fixture/qualification imports or cleanup.
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-retrieval-test-'));
    const calls = []; let closed = 0;
    const defaults = suffix => suffix === '' ? metadata(duration) : suffix.startsWith('/log/') ? {}
        : Array.from({ length: suffix === '/replay/0' ? 1 : duration }, (_, i) => frame(suffix === '/replay/0' ? 0 : i + 1));
    const sessionFactory = () => ({
        login: async () => login ? login() : identity,
        get: async suffix => {
            calls.push(suffix);
            const response = respond ? await respond(suffix, calls.length, defaults(suffix)) : { status: 200, body: body(defaults(suffix)) };
            return { startedAt: timestamp, completedAt: timestamp, ...response };
        },
        close: async () => { closed++; },
    });
    return { output, calls, closed: () => closed, run: options => retrieveMatch({ matchId, output,
        account, codeId, codeVersion: 24, sessionFactory, wait: async () => {}, ...options }) };
}

test('chunk boundaries have one capped terminal, replay zero, and no log zero', () => {
    for (const [n, expected] of [[0, []], [1, [1]], [99, [99]], [100, [100]],
        [101, [100, 101]], [200, [100, 200]], [1279, [...Array.from({ length: 12 }, (_, i) => (i + 1) * 100), 1279]]]) {
        assert.deepEqual(chunkEnds(n), expected);
        const suffixes = requestPlan(n).map(r => r.suffix);
        assert.equal(suffixes.length, new Set(suffixes).size);
        assert(suffixes.includes('/replay/0')); assert(!suffixes.includes('/log/0'));
    }
    for (const n of [-1, 0.5, NaN, 100001]) assert.throws(() => chunkEnds(n));
});

test('request allowlist cannot launch, mutate, redirect, discover or request log zero', () => {
    for (const s of ['', '/log/100', '/replay/0', '/replay/1279']) assert(allowedSuffix(s));
    for (const s of ['/start', '/log/0', '/replay/01', '/../../start', '?id=x', 'https://other', '/list']) assert(!allowedSuffix(s));
});

test('complete request retrieval remains independent from emission completeness and admission', async () => {
    const s = setup(); const result = await s.run();
    assert.equal(result.outcome, 'retrieved-all-planned-responses');
    assert.equal(result.coverage.requiredRequests, 4);
    assert.equal(result.runtimeEmissionCompleteness, 'unknown');
    assert.equal(result.managedAdmission, 'not-attempted');
    assert.equal(result.analysisAlignment, 'unassessed');
    assert.equal(result.identity.ownSlot, 'player2');
    assert.equal(s.closed(), 1);
});

test('duplicate run rehashes retained bytes and makes no evidence GETs', async () => {
    const s = setup(); await s.run(); const count = s.calls.length;
    const files = fs.readdirSync(path.join(s.output, 'bodies'));
    await s.run(); assert.equal(s.calls.length, count);
    assert.deepEqual(fs.readdirSync(path.join(s.output, 'bodies')), files);
    assert.equal(s.closed(), 2);
});

for (const stage of ['body-published', 'receipt-published', 'ledger-published']) {
    test(`resume recovers interruption at ${stage} without repeating retained GET`, async () => {
        const s = setup(); let interrupted = false;
        await assert.rejects(s.run({ checkpointHook: point => {
            if (point === stage && !interrupted) { interrupted = true; throw Error('simulated process interruption'); }
        } }));
        assert.deepEqual(s.calls, ['']);
        assert.equal((await s.run()).outcome, 'retrieved-all-planned-responses');
        assert.equal(s.calls.filter(suffix => suffix === '').length, 1);
        assert.equal(s.closed(), 2);
    });
}

test('pending download after process interruption consumes an attempt and resumes', async () => {
    const s = setup(); await s.run();
    const p = path.join(s.output, 'ledger.json'), ledger = JSON.parse(fs.readFileSync(p));
    const item = ledger.requests['log-1'];
    item.attempts = [{ id: '00000000-0000-4000-8000-000000000000', state: 'pending', startedAt: timestamp }];
    fs.writeFileSync(p, JSON.stringify(ledger));
    await s.run(); assert.equal(s.calls.filter(x => x === '/log/1').length, 2);
});

test('corrupted body is preserved and blocks resume rather than overwritten', async () => {
    const s = setup(); await s.run();
    const file = path.join(s.output, 'bodies', fs.readdirSync(path.join(s.output, 'bodies'))[0]);
    fs.writeFileSync(file, 'corrupted'); const count = s.calls.length;
    await assert.rejects(s.run(), /retained-body-corrupt/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'corrupted'); assert.equal(s.calls.length, count);
});

test('refresh retains changed responses and reports conflict; identical responses deduplicate bodies', async () => {
    let change = false;
    const s = setup({ respond: (suffix, count, value) => {
        if (change && suffix === '/replay/0') value[0].extra = true;
        return { status: 200, body: body(value) };
    } });
    await s.run(); const bodies = fs.readdirSync(path.join(s.output, 'bodies')).length;
    change = true; await assert.rejects(s.run({ refresh: true }), /response-conflict/);
    assert.equal(fs.readdirSync(path.join(s.output, 'bodies')).length, bodies + 1);
    const ledger = JSON.parse(fs.readFileSync(path.join(s.output, 'ledger.json')));
    assert.equal(ledger.requests['replay-0'].fingerprints.length, 2);
    assert.equal(ledger.requests['replay-0'].conflict, true);
    await assert.rejects(s.run(), /response-conflict/);
});

for (const variant of ['match', 'account', 'code', 'finished', 'duration']) {
    test(`metadata ${variant} mismatch retained, no chunk retrieval`, async () => {
        const s = setup({ respond: (suffix, count, value) => {
            if (variant === 'match') value.game.game._id = '000000000000000000000000';
            if (variant === 'account') value.game.user = opponent;
            if (variant === 'code') value.game.codes[0].version = 23;
            if (variant === 'finished') value.game.game.status = 'running';
            if (variant === 'duration') value.game.meta.ticks = 2;
            return { status: 200, body: body(value) };
        } });
        await assert.rejects(s.run()); assert.deepEqual(s.calls, ['']);
        assert.equal(fs.readdirSync(path.join(s.output, 'receipts')).length, 1);
        assert.equal(s.closed(), 1);
    });
}

test('authenticated account mismatch prevents any GET and closes the session', async () => {
    const s = setup({ login: () => ({ id: opponent, username: 'other' }) });
    await assert.rejects(s.run(), /authenticated-account-mismatch/);
    assert.deepEqual(s.calls, []); assert.equal(s.closed(), 1);
});

test('authentication rejection is retained and never automatically renewed', async () => {
    const s = setup({ respond: () => ({ status: 401, body: body({}) }) });
    await assert.rejects(s.run(), /authentication-failed/);
    assert.equal(s.calls.length, 1); assert.equal(s.closed(), 1);
});

test('network retries are finite and persist across invocations without leaking errors', async () => {
    const secret = 'sensitive-test-cookie';
    const s = setup({ respond: () => { throw Error(secret); } });
    await assert.rejects(s.run(), /metadata-unavailable/); assert.equal(s.calls.length, 3);
    await assert.rejects(s.run(), /metadata-unavailable/); assert.equal(s.calls.length, 3);
    assert(!fs.readFileSync(path.join(s.output, 'ledger.json'), 'utf8').includes(secret));
});

test('HTTP failures and unavailable chunks leave explicit partial coverage', async () => {
    const s = setup({ respond: (suffix, count, value) => ({ status: suffix === '/log/1' ? 404 : 200, body: body(value) }) });
    const ledger = await s.run(); assert.equal(ledger.outcome, 'partial');
    assert.deepEqual(ledger.coverage.unresolvedRequests, ['log-1']);
});

test('same-job concurrent writer is rejected and lock releases on owner pipe close', async () => {
    const s = setup(); const release = await acquireWriter(s.output);
    await assert.rejects(s.run(), /job-locked/); await release();
    assert.equal((await s.run()).outcome, 'retrieved-all-planned-responses');
});

test('wrong resume identity and unrelated output contents remain untouched', async () => {
    const s = setup(); await s.run();
    const file = path.join(s.output, 'ledger.json'), before = fs.readFileSync(file);
    await assert.rejects(s.run({ account: 'other' }), /job-identity-mismatch/);
    assert(fs.readFileSync(file).equals(before));
    const other = setup(); fs.writeFileSync(path.join(other.output, 'original'), 'keep');
    await assert.rejects(other.run(), /output-not-empty/);
    assert.deepEqual(fs.readdirSync(other.output), ['original']);
});

function authSetup({ failLogin = false, wrongAccount = false, failGet = false, reflectSecret = false } = {}) {
    let cancelled = 0;
    const ticketSecret = Buffer.from('private-ticket');
    const cookieSecret = 'private-session';
    const session = steamSession({ matchId, account, delay: async () => {}, loadBinding: () => ({
        init: id => assert.equal(id, 1137320), runCallbacks() {}, utils: { getAppId: () => 1137320 },
        auth: { getSessionTicketWithSteamId: async () => ({ getBytes: () => ticketSecret, cancel: () => { cancelled++; } }) },
    }), fetchImpl: async (url, options) => {
        assert.equal(options.redirect, 'error');
        if (url.endsWith('/auth/login')) {
            if (failLogin) throw Error(cookieSecret);
            return new Response(JSON.stringify({ _id: userId, username: wrongAccount ? 'other' : account }),
                { status: 200, headers: { 'Set-Cookie': `sid=${cookieSecret}; Secure; HttpOnly` } });
        }
        if (failGet) throw Error(cookieSecret);
        assert.equal(options.headers.Cookie, `sid=${cookieSecret}`);
        return new Response(reflectSecret ? cookieSecret : '{}');
    } });
    return { session, cancelled: () => cancelled };
}

test('Steam ticket released exactly once on success and repeated close', async () => {
    const s = authSetup(); assert.deepEqual(await s.session.login(), identity);
    await s.session.get(''); s.session.close(); s.session.close(); assert.equal(s.cancelled(), 1);
});

for (const options of [{ failLogin: true }, { wrongAccount: true }]) {
    test(`Steam ticket released on authentication failure ${JSON.stringify(options)}`, async () => {
        const s = authSetup(options); await assert.rejects(s.session.login(), error => {
            assert(error instanceof RetrievalError); assert(!error.message.includes('private')); return true;
        });
        s.session.close(); assert.equal(s.cancelled(), 1);
    });
}

test('transport failure is redacted and caller exit releases the acquired ticket', async () => {
    const s = authSetup({ failGet: true }); await s.session.login();
    try { await assert.rejects(s.session.get(''), /transport-failed/); }
    finally { s.session.close(); }
    assert.equal(s.cancelled(), 1);
});

test('cancellation before retrieval closes session without evidence calls', async () => {
    const s = setup(), controller = new AbortController(); controller.abort();
    await assert.rejects(s.run({ signal: controller.signal }), /interrupted/);
    assert.deepEqual(s.calls, []);
});

test('reflected authentication material is rejected before the retention boundary', async () => {
    const s = authSetup({ reflectSecret: true }); await s.session.login();
    try { await assert.rejects(s.session.get(''), /credential-in-response/); }
    finally { s.session.close(); }
    assert.equal(s.cancelled(), 1);
});

test('transient HTTP failure is retained before bounded successful retry', async () => {
    let failures = 0;
    const s = setup({ respond: (suffix, count, value) => ({
        status: suffix === '/log/1' && failures++ === 0 ? 503 : 200, body: body(value),
    }) });
    const result = await s.run();
    assert.equal(result.outcome, 'retrieved-all-planned-responses');
    const attempts = result.requests['log-1'].attempts;
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.map(a => a.pendingReceipt.httpStatus), [503, 200]);
});

test('close while waiting for Steam ticket cancels it when acquisition resolves', async () => {
    let deliver, cancelled = 0;
    const session = steamSession({ matchId, account, loadBinding: () => ({
        init() {}, runCallbacks() {}, utils: { getAppId: () => 1137320 },
        auth: { getSessionTicketWithSteamId: () => new Promise(resolve => { deliver = resolve; }) },
    }), fetchImpl: () => { throw Error('network must not run'); } });
    const login = session.login(); session.close();
    deliver({ cancel: () => { cancelled++; } });
    await assert.rejects(login, /session-closed/);
    assert.equal(cancelled, 1);
});

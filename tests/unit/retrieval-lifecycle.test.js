import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter, once } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { isolatedSession, steamSession } from '../../tools/arena-retrieval-session.js';
import { acquireWriter, RetrievalError, errorDetails } from '../../tools/retrieval-files.js';
import { retrieveMatch } from '../../tools/retrieve-match.js';

test('authentication timeout confirms exit of a SIGTERM-resistant child', async () => {
    const originalFork = cp.fork, originalTimeout = globalThis.setTimeout;
    let child; const signals = [];
    cp.fork = () => {
        child = cp.spawn(process.execPath, ['-e', `
            process.on('SIGTERM', () => {}); process.on('message', () => {});
            process.on('disconnect', () => {}); setInterval(() => {}, 1000);
            process.send({ ready: true });
        `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        const kill = child.kill.bind(child);
        child.kill = signal => { signals.push(signal); return kill(signal); };
        return child;
    };
    syncBuiltinESMExports();
    globalThis.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms >= 1000 ? 60 : ms, ...args);
    try {
        const session = isolatedSession({ matchId: '6aca5a1a81bdde3573685fae', account: 'offline-mock' });
        await once(child, 'message');
        await assert.rejects(session.login(), error => {
            assert.equal(error.code, 'session-timeout');
            assert(JSON.stringify(errorDetails(error)).includes('ticket-cancellation-unconfirmed'));
            assert(JSON.stringify(errorDetails(error)).includes('authentication-child-forced-stop'));
            return true;
        });
        const closing = session.close(); assert.equal(session.close(), closing);
        await assert.rejects(closing, /session-cleanup-failed/);
        assert(signals.includes('SIGKILL'), 'must escalate beyond SIGTERM');
        assert(child.exitCode !== null || child.signalCode !== null, 'must confirm exit');
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
        }
        cp.fork = originalFork; syncBuiltinESMExports(); globalThis.setTimeout = originalTimeout;
    }
});

function childMock({ closeAck = true, loginReply = true, disconnectExit = true,
    termExit = true, killExit = true } = {}) {
    const child = new EventEmitter();
    Object.assign(child, { exitCode: null, signalCode: null, pid: 123, connected: true, signals: [], sends: [], detached: 0 });
    const exit = signal => { child.exitCode = signal ? null : 0; child.signalCode = signal; child.emit('exit', child.exitCode, signal); };
    for (const key of ['stdin', 'stdout', 'stderr']) { child[key] = new EventEmitter(); child[key].destroy = () => { child.detached++; }; }
    child.stdin.end = () => queueMicrotask(() => exit(null));
    child.send = (message, callback) => {
        child.sends.push(message.operation); callback?.();
        if ((message.operation === 'login' && loginReply) || (message.operation === 'close' && closeAck)) {
            queueMicrotask(() => child.emit('message', { id: message.id, value: message.operation === 'close'
                ? { released: true } : { id: '60ce13d2df54262f119a12d8', username: 'offline' } }));
        }
    };
    child.disconnect = () => { child.connected = false; if (disconnectExit) queueMicrotask(() => exit(null)); };
    child.kill = signal => {
        child.signals.push(signal);
        if (signal === 'SIGTERM' ? termExit : killExit) queueMicrotask(() => exit(signal));
        return true;
    };
    child.unref = () => { child.detached++; };
    return child;
}

async function mockedSession(child, run) {
    const fork = cp.fork, timer = globalThis.setTimeout;
    cp.fork = () => child; syncBuiltinESMExports();
    globalThis.setTimeout = (fn, ms, ...args) => timer(fn, ms >= 1000 ? 15 : ms, ...args);
    try { await run(isolatedSession({ matchId: '6aca5a1a81bdde3573685fae', account: 'offline' })); }
    finally { cp.fork = fork; syncBuiltinESMExports(); globalThis.setTimeout = timer; }
}

test('acknowledged graceful session close confirms exit and repeated close is shared', async () => {
    const child = childMock();
    await mockedSession(child, async session => {
        await session.login(); const closing = session.close(); assert.equal(session.close(), closing);
        await closing; await session.close(); assert.equal(child.exitCode, 0);
        assert.deepEqual(child.signals, []); assert.deepEqual(child.sends, ['login', 'close']);
    });
});

test('already-exited session child needs no signal or close request', async () => {
    const child = childMock(); child.exitCode = 0;
    await mockedSession(child, async session => { await session.close(); await session.close(); });
    assert.deepEqual(child.sends, []); assert.deepEqual(child.signals, []);
});

test('SIGTERM exit without cancellation acknowledgment is explicitly unconfirmed', async () => {
    const child = childMock({ closeAck: false, disconnectExit: false });
    await mockedSession(child, async session => {
        await session.login(); await assert.rejects(session.close(), error => {
            assert(JSON.stringify(errorDetails(error)).includes('ticket-cancellation-unconfirmed')); return true;
        });
        assert.equal(child.signalCode, 'SIGTERM'); assert.deepEqual(child.signals, ['SIGTERM']);
    });
});

test('unconfirmed exit remains separate from original timeout and cannot hold parent handles', async () => {
    const child = childMock({ loginReply: false, closeAck: false, disconnectExit: false, termExit: false, killExit: false });
    await mockedSession(child, async session => {
        await assert.rejects(session.login(), error => {
            const details = errorDetails(error); assert.equal(details.reason, 'session-timeout');
            assert(JSON.stringify(details).includes('child-exit-unconfirmed'));
            assert(JSON.stringify(details).includes('ticket-cancellation-unconfirmed')); return true;
        });
        await assert.rejects(session.close()); assert.equal(child.exitCode, null);
        assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']); assert.equal(child.detached, 4);
    });
});

test('failed authentication and failed ticket cancellation retain both redacted errors', async () => {
    let cancels = 0;
    const session = steamSession({ matchId: '6aca5a1a81bdde3573685fae', account: 'offline', delay: async () => {},
        loadBinding: () => ({ init() {}, runCallbacks() {}, utils: { getAppId: () => 1137320 }, auth: {
            getSessionTicketWithSteamId: async () => ({ getBytes: () => Buffer.from('secret-ticket'), cancel() { cancels++; throw Error('secret-cookie'); } }),
        } }), fetchImpl: async () => { throw Error('secret-transport'); } });
    await assert.rejects(session.login(), error => {
        assert.equal(error.code, 'transport-failed');
        assert(JSON.stringify(errorDetails(error)).includes('ticket-release-failed'));
        assert(!JSON.stringify(errorDetails(error)).includes('secret')); return true;
    });
    assert.throws(() => session.close(), /ticket-release-failed/); assert.equal(cancels, 1);
});

async function mockedLock(child, { fsyncError, greeting = 'locked\n' } = {}, run) {
    const saved = { spawn: cp.spawn, existsSync: fs.existsSync, openSync: fs.openSync,
        fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, timer: globalThis.setTimeout };
    cp.spawn = () => {
        if (greeting !== null) process.nextTick(() => child.stdout.emit('data', Buffer.from(greeting)));
        return child;
    };
    fs.existsSync = () => false; fs.openSync = () => 77;
    fs.fsyncSync = () => { if (fsyncError) throw fsyncError; }; fs.closeSync = () => {};
    globalThis.setTimeout = (fn, ms, ...args) => saved.timer(fn, ms >= 1000 ? 15 : ms, ...args);
    syncBuiltinESMExports();
    try { await run(); } finally {
        cp.spawn = saved.spawn;
        for (const key of ['existsSync', 'openSync', 'fsyncSync', 'closeSync']) fs[key] = saved[key];
        globalThis.setTimeout = saved.timer; syncBuiltinESMExports();
    }
}

test('lock acquisition fsync error survives simultaneous unconfirmed helper exit', async () => {
    const child = childMock({ termExit: false, killExit: false }); child.stdin.end = () => {};
    const failure = Object.assign(new Error('synthetic fsync detail'), { code: 'EIO' });
    await mockedLock(child, { fsyncError: failure }, async () => {
        await assert.rejects(acquireWriter('/offline'), error => {
            assert.equal(error, failure); assert.equal(errorDetails(error).systemCode, 'EIO');
            assert(JSON.stringify(errorDetails(error)).includes('child-exit-unconfirmed')); return true;
        });
    });
    assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']); assert.equal(child.detached, 4);
});

test('repeated child error events during failed signaling do not replace acquisition error', async () => {
    const child = childMock(); child.stdin.end = () => {};
    child.kill = () => { child.emit('error', new Error('synthetic signal failure')); return false; };
    const failure = Object.assign(new Error('synthetic fsync failure'), { code: 'EIO' });
    await mockedLock(child, { fsyncError: failure }, async () => {
        await assert.rejects(acquireWriter('/offline'), error => {
            assert.equal(error, failure);
            const details = JSON.stringify(errorDetails(error));
            assert(details.includes('child-process-error')); assert(details.includes('child-exit-unconfirmed'));
            return true;
        });
    });
});

test('invalid lock handshake releases helper, and normal release is idempotent', async () => {
    const invalid = childMock();
    await mockedLock(invalid, { greeting: 'invalid\n' }, async () => {
        await assert.rejects(acquireWriter('/offline'), /lock-unavailable/); assert.equal(invalid.exitCode, 0);
    });
    const child = childMock();
    await mockedLock(child, {}, async () => {
        const release = await acquireWriter('/offline');
        const first = release(); assert.equal(release(), first); await first; await release();
        assert.equal(child.exitCode, 0); assert.deepEqual(child.signals, []);
    });
});

test('lock handshake timeout releases helper and already-exited release is safe', async () => {
    const waiting = childMock();
    await mockedLock(waiting, { greeting: null }, async () => {
        await assert.rejects(acquireWriter('/offline'), /lock-timeout/); assert.equal(waiting.exitCode, 0);
    });
    const child = childMock();
    await mockedLock(child, {}, async () => {
        const release = await acquireWriter('/offline'); child.exitCode = 0;
        await release(); await release(); assert.deepEqual(child.signals, []);
    });
});

test('worker preserves identity failure alongside session cleanup failure', async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-gain-lifecycle-'));
    await assert.rejects(retrieveMatch({ matchId: '6aca5a1a81bdde3573685fae', output, account: 'expected',
        sessionFactory: () => ({ login: async () => ({ id: '60ce13d2df54262f119a12d8', username: 'wrong' }),
            close: async () => { throw new RetrievalError('ticket-release-failed'); } }) }), error => {
        assert.equal(error.code, 'authenticated-account-mismatch');
        assert(JSON.stringify(errorDetails(error)).includes('ticket-release-failed')); return true;
    });
});

test('post-acquisition fsync failure releases helper and preserves original error', async () => {
    const saved = { spawn: cp.spawn, existsSync: fs.existsSync, openSync: fs.openSync,
        fsyncSync: fs.fsyncSync, closeSync: fs.closeSync };
    const child = new EventEmitter(); child.stdout = new EventEmitter();
    child.exitCode = null; child.signalCode = null; child.pid = 123;
    let ends = 0;
    child.stdin = { end() { ends++; queueMicrotask(() => { child.exitCode = 0; child.emit('exit', 0, null); }); } };
    child.kill = () => { throw Error('graceful close should suffice'); };
    const failure = Object.assign(new Error('synthetic fsync failure'), { code: 'EIO' });
    cp.spawn = () => { process.nextTick(() => child.stdout.emit('data', Buffer.from('locked\n'))); return child; };
    fs.existsSync = () => false; fs.openSync = () => 77;
    fs.fsyncSync = () => { throw failure; }; fs.closeSync = () => {};
    syncBuiltinESMExports();
    try {
        await assert.rejects(acquireWriter('/offline-mock-job'), error => error === failure);
        assert.equal(ends, 1); assert.equal(child.exitCode, 0);
    } finally {
        cp.spawn = saved.spawn;
        for (const key of ['existsSync', 'openSync', 'fsyncSync', 'closeSync']) fs[key] = saved[key];
        syncBuiltinESMExports();
    }
});

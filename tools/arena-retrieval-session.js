import path from 'node:path';
import os from 'node:os';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resident, directoryChain, RetrievalError, stopChild,
    withCleanup, normalizedError, errorDetails } from './retrieval-files.js';

export const origin = 'https://arena.screeps.com';
export const defaultLibrary = path.join(os.homedir(), 'Library/Application Support/Steam/steamapps/common',
    'ScreepsArena/screeps_arena.app/Contents/Resources/app/dist/native_modules/dist/osx',
    `steamworksjs.darwin-${process.arch}.node`);

export function allowedSuffix(suffix) {
    return suffix === '' || /^\/(?:log\/[1-9]\d*|replay\/(?:0|[1-9]\d*))$/.test(suffix);
}

// Discovery accepts descriptors, never caller-supplied URLs or mutation methods.
export function discoveryPath(arenaId, descriptor) {
    const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
    if (!id(arenaId) || !descriptor || typeof descriptor !== 'object') throw new RetrievalError('request-not-allowed');
    const { kind, offset, matchId } = descriptor;
    if (kind === 'history' && Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000) {
        return `/api/arena/${arenaId}/rating-history?search=&offset=${offset}&limit=10`;
    }
    if (kind === 'last-games') return `/api/arena/${arenaId}/last-games`;
    if (kind === 'fame') return `/api/fame/${arenaId}/games`;
    if (kind === 'metadata' && id(matchId)) return `/api/game/${matchId}`;
    throw new RetrievalError('request-not-allowed');
}

// Injectable boundary used by offline tests. No credentials leave this session.
export function steamSession({ matchId, account, discovery = null, library = defaultLibrary,
    loadBinding = () => {
        if (process.platform !== 'darwin') throw new RetrievalError('platform-unqualified');
        directoryChain(path.dirname(library)); resident(library);
        resident(path.join(path.dirname(library), 'libsteam_api.dylib'));
        const steam = path.join(os.homedir(), 'Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS');
        directoryChain(steam);
        for (const file of ['steamclient.dylib', 'libtier0_s.dylib', 'libvstdlib_s.dylib']) resident(path.join(steam, file));
        return createRequire(import.meta.url)(library);
    }, fetchImpl = fetch, delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
    timeoutMs = 30000, maxBytes = 100_000_000 }) {
    let binding, callbacks, ticket, cookie = '', ticketText = '', closed = false, closeFailure;
    const active = new Set();
    function close() {
        closed = true;
        for (const controller of active) controller.abort();
        clearInterval(callbacks);
        cookie = ''; ticketText = '';
        if (ticket) {
            const acquired = ticket; ticket = null;
            try { acquired.cancel(); } catch { closeFailure = new RetrievalError('ticket-release-failed'); }
        }
        if (closeFailure) throw closeFailure;
    }
    async function request(url, options) {
        if (closed) throw new RetrievalError('session-closed');
        const controller = new AbortController(); active.add(controller);
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal });
            const chunks = []; let size = 0;
            for await (const chunk of response.body) {
                size += chunk.length;
                if (size > maxBytes) { controller.abort(); throw new RetrievalError('response-limit'); }
                chunks.push(chunk);
            }
            return { status: response.status, body: Buffer.concat(chunks), response };
        } catch (error) {
            throw error instanceof RetrievalError ? error : new RetrievalError('transport-failed');
        } finally { clearTimeout(timer); active.delete(controller); }
    }
    return {
        async login() {
            try {
                const validScope = discovery
                    ? matchId === undefined && /^[a-f0-9]{24}$/.test(discovery.accountId) && /^[a-f0-9]{24}$/.test(discovery.arenaId)
                    : /^[a-f0-9]{24}$/.test(matchId);
                if (!validScope || typeof account !== 'string' || !account) {
                    throw new RetrievalError('invalid-identity');
                }
                binding = loadBinding(); binding.init(1137320);
                callbacks = setInterval(() => binding.runCallbacks(), 1000 / 30);
                if (binding.utils.getAppId() !== 1137320) throw new RetrievalError('steam-app-mismatch');
                ticket = await binding.auth.getSessionTicketWithSteamId(1137320n);
                if (closed) { close(); throw new RetrievalError('session-closed'); }
                await delay(1500);
                ticketText = ticket.getBytes().toString('hex');
                const { response, status, body } = await request(`${origin}/api/auth/login`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ArenaProtocolVersion': '1' },
                    body: JSON.stringify({ ticket: ticketText }),
                });
                if (status !== 200) throw new RetrievalError('authentication-failed');
                const value = JSON.parse(body);
                const identity = { id: value._id ?? value.user?._id, username: value.username ?? value.user?.username };
                if (!/^[a-f0-9]{24}$/.test(identity.id) || identity.username !== account ||
                    (discovery && identity.id !== discovery.accountId)) {
                    throw new RetrievalError('authenticated-account-mismatch');
                }
                cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
                if (!cookie) throw new RetrievalError('authentication-cookie-missing');
                return identity;
            } catch (error) {
                const primary = normalizedError(error, 'authentication-failed');
                try { close(); } catch (cleanup) { withCleanup(primary, cleanup); }
                throw primary;
            }
        },
        async get(suffix) {
            const requestPath = discovery ? discoveryPath(discovery.arenaId, suffix)
                : allowedSuffix(suffix) ? `/api/game/${matchId}${suffix}` : null;
            if (!requestPath) throw new RetrievalError('request-not-allowed');
            if (!cookie) throw new RetrievalError('authentication-required');
            const startedAt = new Date().toISOString();
            const { status, body } = await request(`${origin}${requestPath}`, {
                method: 'GET', headers: { Accept: 'application/json', Cookie: cookie,
                    'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            });
            const secrets = [ticketText, ...cookie.split('; ').map(c => c.slice(c.indexOf('=') + 1))];
            if (secrets.some(secret => secret && body.includes(Buffer.from(secret)))) {
                throw new RetrievalError('credential-in-response');
            }
            return { status, body, startedAt, completedAt: new Date().toISOString() };
        },
        close,
    };
}

// Suppress native library output. IPC carries only public identity and match bodies.
export function isolatedSession(options) {
    const child = fork(fileURLToPath(import.meta.url), ['--session-child'], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced',
    });
    let serial = 0, stopped = false, closing, loginRequested = false, released = false;
    const pending = new Map();
    child.on('message', message => {
        const entry = pending.get(message.id); if (!entry) return;
        pending.delete(message.id); clearTimeout(entry.timer);
        if (message.error) {
            const error = new RetrievalError(message.error);
            if (message.cleanupFailures) error.cleanupFailures = message.cleanupFailures;
            entry.reject(error);
        } else entry.resolve(message.value);
    });
    const fail = () => {
        stopped = true;
        for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new RetrievalError('session-exited')); }
        pending.clear();
    };
    child.on('exit', fail); child.on('error', fail);
    function call(operation, value, timeout = 45000) {
        if (stopped) return Promise.reject(new RetrievalError('session-exited'));
        return new Promise((resolve, reject) => {
            const id = ++serial;
            const timer = setTimeout(() => {
                pending.delete(id); reject(new RetrievalError('session-timeout'));
            }, timeout);
            pending.set(id, { resolve, reject, timer });
            child.send({ id, operation, value }, error => {
                if (error) { clearTimeout(timer); pending.delete(id); reject(new RetrievalError('session-exited')); }
            });
        });
    }
    function close() {
        if (closing) return closing;
        // Set the shared promise before rejecting outstanding operations.
        closing = Promise.resolve().then(async () => {
            for (const { reject, timer } of pending.values()) {
                clearTimeout(timer); reject(new RetrievalError('session-closed'));
            }
            pending.clear();
            let closeRequest, failure;
            const disconnect = () => {
                try { if (child.connected) child.disconnect(); }
                catch { failure = withCleanup(failure, new RetrievalError('child-disconnect-failed'), 'session-cleanup-failed'); }
            };
            try {
                const result = await stopChild(child, () => {
                    closeRequest = call('close', undefined, 1000).then(value => {
                        released = value?.released === true; disconnect();
                    }).catch(error => { failure = withCleanup(failure, error, 'session-cleanup-failed'); disconnect(); });
                });
                if (result.forced) failure = withCleanup(failure, new RetrievalError('authentication-child-forced-stop'), 'session-cleanup-failed');
            } catch (error) { failure = withCleanup(failure, error, 'session-cleanup-failed'); }
            await closeRequest;
            if (loginRequested && !released) {
                failure = withCleanup(failure, new RetrievalError('ticket-cancellation-unconfirmed'), 'session-cleanup-failed');
            }
            if (failure) throw failure;
        });
        return closing;
    }
    async function operation(name, value) {
        if (closing) throw new RetrievalError('session-closed');
        try { return await call(name, value); }
        catch (error) {
            if (name === 'login' || ['session-timeout', 'session-exited', 'session-closed'].includes(error.code)) {
                try { await close(); } catch (cleanup) { withCleanup(error, cleanup); }
            }
            throw error;
        }
    }
    return {
        login: () => { loginRequested = true; return operation('login', options); },
        get: suffix => operation('get', suffix),
        close,
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--session-child') {
    let session, login;
    const exit = () => { try { session?.close(); } finally { process.exit(0); } };
    process.on('SIGINT', exit); process.on('SIGTERM', exit); process.on('disconnect', exit);
    process.on('uncaughtException', exit); process.on('unhandledRejection', exit);
    process.on('message', async ({ id, operation, value }) => {
        try {
            let result;
            if (operation === 'login' && !session) { session = steamSession(value); login = session.login(); result = await login; }
            else if (operation === 'get' && session) result = await session.get(value);
            else if (operation === 'close') {
                session?.close();
                // A ticket still being acquired must settle/cancel before acknowledgment.
                await login?.catch(() => {});
                session?.close(); result = { released: true };
            }
            else throw new RetrievalError('session-protocol');
            process.send?.({ id, value: result });
        } catch (error) {
            const details = errorDetails(error, 'session-failed');
            process.send?.({ id, error: details.reason, cleanupFailures: details.cleanupFailures });
        }
    });
}

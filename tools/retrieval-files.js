import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export class RetrievalError extends Error {
    constructor(code) { super(code); this.code = code; }
}

// Never serialize native exception messages or causes (they may contain secrets).
export function errorDetails(error, fallback = 'worker-failed') {
    return { reason: error instanceof RetrievalError ? error.code : fallback,
        ...(/^(?:E[A-Z0-9]{2,30})$/.test(error?.systemCode ?? error?.code)
            ? { systemCode: error.systemCode ?? error.code } : {}),
        ...(error?.cleanupFailures?.length ? { cleanupFailures: error.cleanupFailures } : {}) };
}

export function withCleanup(error, cleanup, fallback = 'cleanup-failed') {
    const primary = error ?? new RetrievalError(fallback);
    if (primary === cleanup) return primary;
    const details = errorDetails(cleanup, fallback);
    const failures = primary.cleanupFailures ??= [];
    if (!failures.some(item => JSON.stringify(item) === JSON.stringify(details))) failures.push(details);
    return primary;
}

export function normalizedError(error, fallback) {
    if (error instanceof RetrievalError) return error;
    const wrapped = new RetrievalError(fallback);
    wrapped.cause = error;
    if (error?.cleanupFailures) wrapped.cleanupFailures = error.cleanupFailures;
    if (/^E[A-Z0-9]{2,30}$/.test(error?.code)) wrapped.systemCode = error.code;
    return wrapped;
}

export const childExited = child => child.exitCode !== null || child.signalCode !== null;

// A sent signal (including SIGKILL) is not exit confirmation.
export async function stopChild(child, graceful, { graceMs = 1000, termMs = 1000, killMs = 1000 } = {}) {
    let failure;
    const note = code => { failure = withCleanup(failure, new RetrievalError(code), 'child-shutdown-failed'); };
    // kill/send failures may arrive as events rather than thrown exceptions.
    child.on('error', () => note('child-process-error'));
    const waitExit = ms => new Promise(resolve => {
        if (childExited(child)) return resolve(true);
        const done = () => { clearTimeout(timer); child.removeListener('exit', exited); resolve(childExited(child)); };
        const exited = () => done();
        const timer = setTimeout(done, ms);
        child.once('exit', exited);
    });
    if (!childExited(child)) {
        try { graceful(); } catch { note('child-graceful-close-failed'); }
    }
    let forced = false;
    if (!await waitExit(graceMs)) {
        try { child.kill('SIGTERM'); } catch { note('child-sigterm-failed'); }
        if (!await waitExit(termMs)) {
            forced = true;
            try { child.kill('SIGKILL'); } catch { note('child-sigkill-failed'); }
            if (!await waitExit(killMs)) {
                // Do not keep this process alive forever on an unconfirmed child.
                // This does NOT assert that the child or its lock was released.
                try { if (child.connected) child.disconnect(); } catch { note('child-disconnect-failed'); }
                for (const stream of [child.stdin, child.stdout, child.stderr]) {
                    try { stream?.destroy?.(); } catch { note('child-stream-detach-failed'); }
                }
                try { child.unref?.(); } catch { note('child-unref-failed'); }
                const error = new RetrievalError('child-exit-unconfirmed');
                if (failure) withCleanup(error, failure);
                throw error;
            }
        }
    }
    if (failure) { if (forced) note('child-forced-stop'); throw failure; }
    return { exitConfirmed: true, forced };
}

// Fail closed before opening payloads. The qualified platform is macOS.
export function resident(file, directory = false) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) {
        throw new RetrievalError('unsafe-path');
    }
    if (process.platform === 'darwin' && execFileSync('/usr/bin/stat', ['-f', '%Sf', file],
        { encoding: 'utf8' }).includes('dataless')) throw new RetrievalError('dataless-input');
    return stat;
}

export function directoryChain(directory) {
    const absolute = path.resolve(directory);
    if (path.dirname(absolute) !== absolute) directoryChain(path.dirname(absolute));
    // System directory aliases such as /var are resolved before checking residency.
    resident(fs.realpathSync(absolute), true);
}

export function readResident(file) {
    directoryChain(path.dirname(file));
    resident(file);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
}

export function syncDirectory(directory) {
    const fd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export function publish(file, bytes, replace = false) {
    directoryChain(path.dirname(file));
    const temporary = `${file}.${randomUUID()}.pending`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (replace) {
        if (fs.existsSync(file)) resident(file);
        fs.renameSync(temporary, file);
    } else {
        // link is no-clobber even if a destination appears concurrently.
        fs.linkSync(temporary, file);
        fs.unlinkSync(temporary);
    }
    syncDirectory(path.dirname(file));
}

// A persistent lock inode plus kernel flock: crashes release ownership, not data.
// Never unlink the lock inode or guess staleness from PIDs/timeouts.
export async function acquireWriter(directory) {
    const file = path.join(directory, '.writer.lock');
    if (fs.existsSync(file)) resident(file);
    const child = spawn('python3', ['-c', `
import os, sys, fcntl
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError: sys.exit(73)
print('locked', flush=True)
sys.stdin.buffer.read()
os.close(fd)
`, file], { stdio: ['pipe', 'pipe', 'ignore'] });
    let releasePromise, pipeFailure;
    const release = () => releasePromise ??= (async () => {
        let result, failure;
        try { result = await stopChild(child, () => child.stdin.end()); } catch (error) { failure = error; }
        if (pipeFailure) failure = withCleanup(failure, pipeFailure, 'lock-cleanup-failed');
        if (failure) throw failure;
        return result;
    })();
    // EPIPE is a lifecycle failure, not an unhandled stream exception.
    child.stdin.on?.('error', () => { pipeFailure = new RetrievalError('lock-helper-pipe-failed'); });
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new RetrievalError('lock-timeout')), 5000);
            child.once('error', () => { clearTimeout(timer); reject(new RetrievalError('lock-unavailable')); });
            child.once('exit', () => { clearTimeout(timer); reject(new RetrievalError('job-locked')); });
            child.stdout.once('data', bytes => {
                clearTimeout(timer);
                if (bytes.toString().trim() !== 'locked') reject(new RetrievalError('lock-unavailable'));
                else resolve();
            });
        });
        syncDirectory(directory);
    } catch (error) {
        try { await release(); } catch (cleanup) { withCleanup(error, cleanup, 'lock-cleanup-failed'); }
        throw error;
    }
    release.assertHeld = () => {
        if (child.exitCode !== null || child.signalCode !== null) throw new RetrievalError('lock-lost');
    };
    return release;
}

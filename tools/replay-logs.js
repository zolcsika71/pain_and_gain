#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultCacheDir = path.join(os.homedir(), 'Library/Application Support/screeps_arena/Cache/Cache_Data');
const cacheMagic = Buffer.from('305c72a71b6dfbfc', 'hex');
const logKey = /^1\/0\/https:\/\/arena\.screeps\.com\/api\/game\/([a-f0-9]{24})\/log\/(\d+)$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function issue(kind, message) {
    return { kind, message };
}

export function parseCacheEntry(bytes) {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(cacheMagic)) {
        return issue('unrelated', 'Not a supported cache frame');
    }
    const keyLength = bytes.readUInt32LE(12);
    if (keyLength === 0 || keyLength > 2048 || bytes.length < 24 + keyLength) {
        if (bytes.readUInt32LE(8) !== 5) return issue('unrelated', 'No replay request key');
        return issue('incomplete', 'Incomplete cache request key');
    }
    const key = bytes.subarray(24, 24 + keyLength).toString('utf8');
    const match = key.match(logKey);
    if (!match) return issue('unrelated', 'Not an Arena replay-log response');
    if (bytes.readUInt32LE(8) !== 5) return issue('unsupported', `Unsupported cache version for ${key}`);

    const payloadStart = 24 + keyLength;
    const lengthAt = bytes.lastIndexOf(Buffer.from('content-length:'));
    const encodingAt = bytes.lastIndexOf(Buffer.from('content-encoding:'));
    if (lengthAt < payloadStart || encodingAt < payloadStart) {
        return issue('incomplete', `Missing response metadata for ${key}`);
    }
    const lengthMatch = bytes.subarray(lengthAt, lengthAt + 40).toString('latin1').match(/^content-length:(\d+)\x00/);
    const encodingMatch = bytes.subarray(encodingAt, encodingAt + 40).toString('latin1').match(/^content-encoding:([^\x00]+)\x00/);
    if (!lengthMatch || !encodingMatch) return issue('incomplete', `Incomplete response metadata for ${key}`);
    if (encodingMatch[1] !== 'gzip') return issue('unsupported', `Unsupported encoding ${encodingMatch[1]} for ${key}`);
    const length = Number(lengthMatch[1]);
    if (!Number.isSafeInteger(length) || length < 1 || length > 50_000_000) {
        return issue('unsupported', `Unsupported payload length for ${key}`);
    }
    if (payloadStart + length > lengthAt) return issue('incomplete', `Incomplete compressed payload for ${key}`);
    if (!bytes.subarray(payloadStart, payloadStart + 3).equals(Buffer.from([0x1f, 0x8b, 0x08]))) {
        return issue('malformed', `Invalid gzip header for ${key}`);
    }

    let body;
    try {
        body = gunzipSync(bytes.subarray(payloadStart, payloadStart + length), { maxOutputLength: 100_000_000 }).toString('utf8');
    } catch (error) {
        return issue('malformed', `Cannot decompress ${key}: ${error.message}`);
    }
    let response;
    try {
        response = JSON.parse(body);
    } catch (error) {
        return issue('malformed', `Invalid response JSON for ${key}: ${error.message}`);
    }
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        return issue('malformed', `Replay log is not an object for ${key}`);
    }
    const gameState = [];
    const otherEntries = [];
    for (const [entryKey, raw] of Object.entries(response)) {
        if (typeof raw !== 'string') return issue('malformed', `Non-string console entry ${entryKey} for ${key}`);
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            if (/"type"\s*:\s*"game-state"/.test(raw)) {
                return issue('malformed', `Malformed game-state entry ${entryKey} for ${key}`);
            }
            otherEntries.push({ key: entryKey, raw });
            continue;
        }
        if (parsed?.type !== 'game-state') {
            otherEntries.push({ key: entryKey, raw });
            continue;
        }
        if (!Number.isSafeInteger(parsed.tick) || parsed.phase !== 'before-actions' ||
            !Array.isArray(parsed.creeps) || !Array.isArray(parsed.flags) || raw.includes('\n')) {
            return issue('malformed', `Invalid game-state entry ${entryKey} for ${key}`);
        }
        gameState.push(raw);
    }
    const ticks = gameState.map(raw => JSON.parse(raw).tick);
    const counts = new Map();
    for (const tick of ticks) counts.set(tick, (counts.get(tick) ?? 0) + 1);
    const firstTick = ticks.length ? Math.min(...ticks) : null;
    const lastTick = ticks.length ? Math.max(...ticks) : null;
    const gaps = [];
    if (firstTick !== null) {
        for (let tick = firstTick; tick <= lastTick; tick++) if (!counts.has(tick)) gaps.push(tick);
    }
    return {
        kind: 'log', replayId: match[1], requestedTick: Number(match[2]), key,
        fingerprint: sha256(body), gameState, otherEntries,
        coverage: { count: ticks.length, firstTick, lastTick, duplicates: [...counts].filter(([, n]) => n > 1).map(([tick]) => tick), gaps },
    };
}

function outputDirectory(root) {
    const directory = path.join(path.resolve(root), 'replay_logs');
    fs.mkdirSync(directory, { recursive: true });
    if (fs.lstatSync(directory).isSymbolicLink() ||
        fs.realpathSync(directory) !== path.join(fs.realpathSync(root), 'replay_logs')) {
        throw new Error('replay_logs must be a real directory inside the project');
    }
    return directory;
}

function managedPath(root, name) {
    if (typeof name !== 'string' || !/^[a-f0-9]{24}(?:-[a-f0-9]{12,64}(?:-\d+)?)?\.jsonl$/.test(name)) {
        throw new Error('Unsafe managed output filename');
    }
    return path.join(outputDirectory(root), name);
}

function pathOccupied(file) {
    try { return fs.lstatSync(file); }
    catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

function readManifest(root) {
    const file = path.join(outputDirectory(root), 'manifest.json');
    if (!fs.existsSync(file)) return { version: 1, records: [] };
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.records)) throw new Error('Unsupported replay-log manifest');
    return manifest;
}

function atomicReplace(file, content) {
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    try {
        const descriptor = fs.openSync(temp, 'wx', 0o600);
        try {
            fs.writeFileSync(descriptor, content);
            fs.fsyncSync(descriptor);
        } finally {
            fs.closeSync(descriptor);
        }
        fs.renameSync(temp, file);
    } catch (error) {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
        throw error;
    }
}

function saveManifest(root, manifest) {
    atomicReplace(path.join(outputDirectory(root), 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function withManifestLock(root, action) {
    const lock = path.join(outputDirectory(root), '.manifest.lock');
    const token = randomUUID();
    const ownerFile = `${lock}.${token}.tmp`;
    // Publish a fully written owner so interruption cannot leave a new empty lock.
    fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
    let acquired = false;
    try {
        for (let attempt = 0; attempt < 50; attempt++) {
            try {
                fs.linkSync(ownerFile, lock);
                acquired = true;
                break;
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
                const existing = pathOccupied(lock);
                if (!existing) continue;
                if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Unsafe manifest lock');
                let abandoned = false;
                if (Date.now() - existing.mtimeMs > 30_000) {
                    // Also recover an empty lock left by the earlier implementation.
                    if (existing.size === 0) abandoned = true;
                    else {
                        const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
                        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid manifest lock owner');
                        try { process.kill(owner.pid, 0); } catch (check) {
                            if (check.code === 'ESRCH') abandoned = true;
                            else if (check.code !== 'EPERM') throw check;
                        }
                    }
                }
                if (abandoned && pathOccupied(lock)?.ino === existing.ino) {
                    fs.unlinkSync(lock);
                    continue;
                }
                await sleep(100);
            }
        }
        if (!acquired) throw new Error('Replay-log manifest is locked; retry after its owner exits');
        return await action();
    } finally {
        fs.unlinkSync(ownerFile);
        if (acquired) {
            try {
                if (JSON.parse(fs.readFileSync(lock, 'utf8')).token === token) fs.unlinkSync(lock);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }
}

function chooseOutputName(root, manifest, replayId, fingerprint) {
    const reserved = new Set(manifest.records.map(record => record.outputPath).filter(Boolean));
    const candidates = [`${replayId}.jsonl`, `${replayId}-${fingerprint.slice(0, 12)}.jsonl`, `${replayId}-${fingerprint}.jsonl`];
    for (let suffix = 2; suffix < 100; suffix++) candidates.push(`${replayId}-${fingerprint}-${suffix}.jsonl`);
    return candidates.find(name => !reserved.has(name) && !pathOccupied(managedPath(root, name))) ?? null;
}

function ensureOutput(root, record, lines) {
    const target = managedPath(root, record.outputPath);
    const content = `${lines.join('\n')}\n`;
    const expected = sha256(content);
    if (expected !== record.outputFingerprint) throw new Error('Manifest output fingerprint mismatch');
    const existing = pathOccupied(target);
    if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink() || sha256(fs.readFileSync(target)) !== expected) {
            throw new Error(`Managed output differs from source: ${target}`);
        }
        return;
    }
    const temporary = path.join(outputDirectory(root), `.${record.outputPath}.${randomUUID()}.tmp`);
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, content);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    try { fs.linkSync(temporary, target); } finally { fs.unlinkSync(temporary); }
}

export async function importCacheFile(root, sourceFile) {
    const parsed = parseCacheEntry(fs.readFileSync(sourceFile));
    if (parsed.kind !== 'log') return parsed;
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        let record = manifest.records.find(item => item.replayId === parsed.replayId && item.fingerprint === parsed.fingerprint);
        if (record) {
            if (record.status === 'pending' || (record.outputPath && record.status !== 'deleted' && !pathOccupied(managedPath(root, record.outputPath)))) {
                ensureOutput(root, record, parsed.gameState);
                record.status = record.reviews && Object.values(record.reviews).some(review => !review.completedAt) ? 'reviewing' : 'available';
                saveManifest(root, manifest);
            } else if (record.outputPath && record.status !== 'deleted') {
                ensureOutput(root, record, parsed.gameState);
            }
            return { kind: 'deduplicated', record };
        }
        const outputPath = parsed.gameState.length ? chooseOutputName(root, manifest, parsed.replayId, parsed.fingerprint) : null;
        if (parsed.gameState.length && !outputPath) throw new Error(`No safe output filename for ${parsed.replayId}`);
        const content = parsed.gameState.length ? `${parsed.gameState.join('\n')}\n` : '';
        record = {
            replayId: parsed.replayId, requestedTick: parsed.requestedTick, sourceEntry: sourceFile,
            sourceKey: parsed.key, fingerprint: parsed.fingerprint, outputPath,
            outputFingerprint: outputPath ? sha256(content) : null,
            importedAt: new Date().toISOString(), status: outputPath ? 'pending' : 'empty',
            coverage: parsed.coverage, otherEntries: parsed.otherEntries, reviews: {},
        };
        manifest.records.push(record);
        saveManifest(root, manifest);
        if (outputPath) {
            ensureOutput(root, record, parsed.gameState);
            record.status = 'available';
            saveManifest(root, manifest);
        }
        return { kind: 'imported', record };
    });
}

export async function scanCache(root, cacheDir, seen = null) {
    const results = [];
    for (const name of fs.readdirSync(cacheDir).sort()) {
        const file = path.join(cacheDir, name);
        let stat;
        try { stat = fs.lstatSync(file); }
        catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        if (!stat.isFile()) continue;
        const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        const previous = seen?.get(file);
        if (previous?.signature === signature && (previous.finished || previous.attempts >= 5)) continue;
        let result;
        try { result = await importCacheFile(root, file); } catch (error) { result = issue('error', `${file}: ${error.message}`); }
        if (seen) seen.set(file, {
            signature, attempts: previous?.signature === signature ? previous.attempts + 1 : 1,
            finished: !['incomplete', 'error'].includes(result.kind),
        });
        if (result.kind !== 'unrelated' && result.kind !== 'deduplicated') results.push({ source: file, ...result });
    }
    return results;
}

function validateTaskId(taskId) {
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(taskId)) {
        throw new Error('Task ID must be 1–200 safe characters');
    }
}

function cleanup(root, manifest, record) {
    const reviews = Object.values(record.reviews);
    if (!record.outputPath || !reviews.length || reviews.some(review => !review.examinedAt || !review.completedAt)) return;
    const file = managedPath(root, record.outputPath);
    const existing = pathOccupied(file);
    if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink() ||
            sha256(fs.readFileSync(file)) !== record.outputFingerprint) {
            throw new Error(`Refusing to delete changed or unsafe output: ${file}`);
        }
        fs.unlinkSync(file);
    }
    record.status = 'deleted';
    record.deletedAt = new Date().toISOString();
    saveManifest(root, manifest);
}

export async function updateReview(root, action, replayId, fingerprint, taskId) {
    if (!['claim', 'examined', 'complete'].includes(action)) throw new Error(`Unknown review action: ${action}`);
    validateTaskId(taskId);
    if (!/^[a-f0-9]{24}$/.test(replayId)) throw new Error('Expected a verified replay ID');
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Expected a full SHA-256 fingerprint');
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        const record = manifest.records.find(item => item.replayId === replayId && item.fingerprint === fingerprint);
        if (!record || !record.outputPath) throw new Error('Imported game-state log not found');
        if (record.status === 'deleted') {
            if (action !== 'claim' && Object.hasOwn(record.reviews, taskId) && record.reviews[taskId].completedAt) return record;
            throw new Error('Log was already reviewed and deleted');
        }
        const now = new Date().toISOString();
        if (action === 'claim') {
            if (!Object.hasOwn(record.reviews, taskId)) {
                record.reviews[taskId] = { claimedAt: now, examinedAt: null, completedAt: null };
            }
            record.status = 'reviewing';
        } else {
            if (!Object.hasOwn(record.reviews, taskId)) throw new Error(`Task ${taskId} has not claimed this log`);
            const review = record.reviews[taskId];
            if (action === 'examined') review.examinedAt ??= now;
            else if (action === 'complete') {
                if (!review.examinedAt) throw new Error('Record examination before completion');
                review.completedAt ??= now;
            } else throw new Error(`Unknown review action: ${action}`);
        }
        saveManifest(root, manifest);
        cleanup(root, manifest, record);
        return record;
    });
}

export async function reconcileCleanup(root) {
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        for (const record of manifest.records) if (record.status !== 'deleted') cleanup(root, manifest, record);
        return manifest;
    });
}

async function main() {
    const [command, ...args] = process.argv.slice(2);
    const root = projectRoot;
    if (command === 'scan' || command === 'watch') {
        const cacheDir = args[0] ? path.resolve(args[0]) : defaultCacheDir;
        await reconcileCleanup(root);
        const seen = new Map();
        const poll = async () => {
            for (const result of await scanCache(root, cacheDir, seen)) {
                if (result.record) console.log(JSON.stringify({ event: result.kind, replayId: result.record.replayId, fingerprint: result.record.fingerprint, outputPath: result.record.outputPath, status: result.record.status, coverage: result.record.coverage, otherEntries: result.record.otherEntries.length }));
                else console.error(JSON.stringify({ event: result.kind, source: result.source, message: result.message }));
            }
        };
        await poll();
        if (command === 'watch') {
            console.log(`Watching ${cacheDir} (polling every 2 seconds; Ctrl-C to stop)`);
            while (true) { await sleep(2000); await poll(); }
        }
    } else if (command === 'list') {
        const manifest = await reconcileCleanup(root);
        for (const record of manifest.records) console.log(JSON.stringify({ replayId: record.replayId, fingerprint: record.fingerprint, outputPath: record.outputPath, status: record.status, coverage: record.coverage, reviews: record.reviews, otherEntries: record.otherEntries.length }));
    } else if (command === 'other') {
        if (args.length !== 2 || !/^[a-f0-9]{24}$/.test(args[0]) || !/^[a-f0-9]{64}$/.test(args[1])) throw new Error('Usage: other <replay-id> <fingerprint>');
        const record = readManifest(root).records.find(item => item.replayId === args[0] && item.fingerprint === args[1]);
        if (!record) throw new Error('Replay-log response not found');
        for (const entry of record.otherEntries) console.log(JSON.stringify(entry));
    } else if (['claim', 'examined', 'complete'].includes(command)) {
        if (args.length !== 3) throw new Error(`Usage: ${command} <replay-id> <fingerprint> <task-id>`);
        const record = await updateReview(root, command, args[0], args[1], args[2]);
        console.log(JSON.stringify({ replayId: record.replayId, fingerprint: record.fingerprint, status: record.status, outputPath: record.outputPath, reviews: record.reviews }));
    } else {
        throw new Error('Usage: node tools/replay-logs.js <scan [cache-dir]|watch [cache-dir]|list|other replay-id fingerprint|claim replay-id fingerprint task-id|examined replay-id fingerprint task-id|complete replay-id fingerprint task-id>');
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

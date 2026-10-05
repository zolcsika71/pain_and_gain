// Explicit synthetic v2 reader; existing production commands stay disconnected.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Scanner, fail, measureNative } from './replay-legacy-json.js';
import { writeOtherEntries } from './replay-other.js';

function inspectDirectory(directory) {
    const stat = available(() => fs.lstatSync(directory));
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) fail('UNSUPPORTED_FIXTURE', 'Unsafe fixture directory');
}

function available(operation) {
    try { return operation(); }
    catch (error) {
        if (error?.code === 'ENOENT') fail('UNAVAILABLE', 'Fixture file or directory is unavailable');
        throw error;
    }
}

function selectManifest(fd, size) {
    const fields = Object.create(null), scanner = new Scanner(fd, 0, size);
    const result = scanner.value(0, {
        keys: new Set(['version', 'maps', 'replays', 'records', 'scoreRecords', 'retiredScoreSources']),
        scalarKeys: new Set(['version']),
        accept: (key, ref) => { fields[key] = key === 'version' ? (ref.kind === 'number' ? ref.value : undefined) : ref; }
    });
    scanner.eof();
    if (result.kind !== 'object') fail('UNSUPPORTED_MANIFEST', 'Expected manifest object');
    if (fields.version === 1 && fields.records?.kind === 'array' && fields.records.count === 0) fail('NOT_FOUND', 'Replay-log response not found');
    if (fields.version !== 2 || ['maps', 'replays', 'records'].some(k => fields[k]?.kind !== 'array') ||
        ['scoreRecords', 'retiredScoreSources'].some(k => Object.hasOwn(fields, k) && fields[k].kind !== 'array')) {
        fail('UNSUPPORTED_MANIFEST', 'Unsupported replay-log manifest collections/version');
    }
    return fields.records;
}

function selectRecord(fd, range, replayId, fingerprint) {
    const scanner = new Scanner(fd, range.start, range.end);
    scanner.expect(91); scanner.ws();
    if (scanner.peek() !== 93) for (;;) {
        let replayMatches = false, fingerprintMatches = false, diagnostics;
        const record = scanner.value(0, {
            keys: new Set(['replayId', 'fingerprint', 'otherEntries']),
            scalarKeys: new Set(['replayId', 'fingerprint']),
            accept: (key, ref) => {
                if (key === 'replayId') replayMatches = ref.value === replayId;
                else if (key === 'fingerprint') fingerprintMatches = ref.value === fingerprint;
                else diagnostics = {start: ref.start, end: ref.end, kind: ref.kind};
            }
        });
        if (record.kind === 'null') fail('INVALID_RECORD', 'Null encountered before selected record');
        if (record.kind === 'object' && replayMatches && fingerprintMatches) {
            if (diagnostics?.kind !== 'array') fail('INVALID_RECORD', 'Expected array otherEntries');
            return diagnostics;
        }
        scanner.ws(); if (scanner.peek() === 93) break;
        scanner.expect(44); scanner.ws();
    }
    fail('NOT_FOUND', 'Replay-log response not found');
}

export async function writeFixtureV2Other({root, replayId, fingerprint}, sink) {
    if (typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) fail('INVALID_IDENTITY', 'Invalid log identity');
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (process.platform !== 'darwin' || major !== 24 || minor < 19) fail('UNSUPPORTED_FIXTURE', 'Requires qualified native Node 24.19+/macOS');
    if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root ||
        path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('pain-gain-v2-reader-fixture-')) fail('UNSUPPORTED_FIXTURE', 'Explicit canonical temporary fixture root required');
    const owned = new Set(); let primary = false;
    const open = file => {
        const before = available(() => fs.lstatSync(file, {bigint: true}));
        if (!before.isFile() || before.isSymbolicLink()) fail('UNSUPPORTED_FIXTURE', 'Expected regular fixture file');
        const fd = available(() => fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW));
        owned.add(fd); // Cleanup responsibility precedes descriptor inspection.
        const stat = fs.fstatSync(fd, {bigint: true});
        if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) fail('UNAVAILABLE', 'Fixture file changed during open');
        return {fd, stat};
    };
    try {
        inspectDirectory(root); inspectDirectory(path.join(root, 'replay_logs'));
        const marker = open(path.join(root, '.replay-v2-reader-fixture.json'));
        if (marker.stat.size > 16_384n) fail('RESOURCE_LIMIT', 'Fixture marker exceeds 16 KiB');
        const bytes = Buffer.alloc(Number(marker.stat.size)); let offset = 0;
        while (offset < bytes.length) {
            const n = fs.readSync(marker.fd, bytes, offset, bytes.length - offset, offset);
            if (!n) fail('UNAVAILABLE', 'Truncated fixture marker'); offset += n;
        }
        let declaration;
        try { declaration = JSON.parse(bytes.toString('utf8')); } catch { fail('UNSUPPORTED_FIXTURE', 'Invalid fixture marker'); }
        if (!declaration || Object.keys(declaration).length !== 3 || declaration.fixture !== 'replay-v2-reader' || declaration.version !== 1 || declaration.filesystem !== 'local-apfs') fail('UNSUPPORTED_FIXTURE', 'Invalid fixture declaration');
        owned.delete(marker.fd); fs.closeSync(marker.fd);
        const {fd, stat} = open(path.join(root, 'replay_logs', 'manifest.json'));
        if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) fail('RESOURCE_LIMIT', 'Manifest offset exceeds safe integer');
        const unchanged = () => {
            const now = fs.fstatSync(fd, {bigint: true});
            if (now.size !== stat.size || now.mtimeNs !== stat.mtimeNs) fail('CHANGED_INPUT', 'Pinned manifest was modified');
        };
        const records = selectManifest(fd, Number(stat.size));
        const selected = selectRecord(fd, records, replayId, fingerprint);
        const entries = () => new Scanner(fd, selected.start, selected.end).elements();
        for (const value of entries()) measureNative(value);
        unchanged();
        await writeOtherEntries(entries(), sink);
        unchanged();
    } catch (error) {
        primary = true;
        throw error;
    } finally {
        let closeFailed = false, closeError;
        for (const fd of owned) try { fs.closeSync(fd); } catch (error) { if (!closeFailed) { closeFailed = true; closeError = error; } }
        if (!primary && closeFailed) throw closeError;
    }
}

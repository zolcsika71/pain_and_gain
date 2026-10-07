import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {measureRoots, referencedTemporaryRoots} from '../tools/storage-inventory.js';

test('inventory counts allocated blocks once and does not follow symlinks or read evidence', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-inventory-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const evidence = path.join(root, 'evidence');
    fs.mkdirSync(evidence);
    const file = path.join(evidence, 'protected');
    fs.writeFileSync(file, Buffer.alloc(8192, 42));
    fs.chmodSync(file, 0); // lstat accounting must not require readable content.
    fs.linkSync(file, path.join(evidence, 'alias'));
    fs.symlinkSync(evidence, path.join(root, 'linked'));
    const a = measureRoots([{root: evidence, category: 'evidence'}, {root: file, category: 'duplicate'},
        {root: path.join(root, 'linked'), category: 'link'}]);
    assert.equal(a.totals.evidence.allocatedBytes, (fs.lstatSync(evidence).blocks + fs.lstatSync(file).blocks) * 512);
    assert.equal(a.totals.evidence.entries, 2);
    assert.equal(a.totals.duplicate.allocatedBytes, 0);
    assert.equal(a.totals.link.entries, 1);
    assert.deepEqual(a.symlinksNotFollowed, [path.join(root, 'linked')]);
    assert.deepEqual(a.errors, []);
});

test('missing inventory paths are explicit errors, never silently reported as empty', () => {
    const root = path.join(os.tmpdir(), `storage-inventory-missing-${process.pid}`);
    assert.equal(fs.existsSync(root), false);
    assert.deepEqual(measureRoots([{root, category: 'missing'}]).errors, [{path: root, code: 'ENOENT'}]);
});

test('receipt discovery admits only project temporary names in explicit parents', () => {
    const parent = '/private/var/folders/aa/bb/T';
    const text = ['/tmp/pain-gain-m2h-gate-Ab1234/log.json', '/private/tmp/pain-gain-m2h-gate-Ab1234',
        '/var/folders/aa/bb/T/pain-gain-store-v3-fixture-Ab1234', '/tmp/unrelated',
        '/tmp/pain-gain-m2h-diagnostic-', '/Users/example/replay_logs',
        '/private/var/folders/other/user/T/pain-gain-foreign'].join('\n');
    assert.deepEqual(referencedTemporaryRoots(text, ['/private/tmp', parent]),
        ['/private/tmp/pain-gain-m2h-gate-Ab1234', `${parent}/pain-gain-store-v3-fixture-Ab1234`]);
});

test('destructive and arbitrary-path CLI options reject before inventory', () => {
    for (const arg of ['--apply', '--delete', '--root=/']) {
        const result = spawnSync(process.execPath, ['tools/storage-inventory.js', arg], {encoding: 'utf8'});
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /no deletion options/);
    }
});

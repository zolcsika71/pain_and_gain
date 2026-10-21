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

// Frozen expected cases from accepted coding-pilot-20261021-3dd8e272.s01.
// Keep this table in the root-level test file, outside inventory reference scans.
const temporaryRootBoundaryCases = [
    {
        "name": "tmp alias root",
        "text": "/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "compatibility"
    },
    {
        "name": "private tmp descendant",
        "text": "/private/tmp/pain-gain-alpha/log.json",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "compatibility"
    },
    {
        "name": "var alias",
        "text": "/var/folders/aa/bb/T/historical-index-beta",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/var/folders/aa/bb/T/historical-index-beta"
        ],
        "category": "compatibility"
    },
    {
        "name": "private var alias",
        "text": "/private/var/folders/aa/bb/T/scout-hold-cache-gamma",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/var/folders/aa/bb/T/scout-hold-cache-gamma"
        ],
        "category": "compatibility"
    },
    {
        "name": "deduplicate aliases and deterministic sort",
        "text": "/tmp/pain-gain-z /private/tmp/pain-gain-z /tmp/pain-gain-a",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-a",
            "/private/tmp/pain-gain-z"
        ],
        "category": "compatibility"
    },
    {
        "name": "unrelated name",
        "text": "/tmp/unrelated",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "compatibility"
    },
    {
        "name": "incomplete suffix",
        "text": "/tmp/pain-gain-incomplete-",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "compatibility"
    },
    {
        "name": "foreign parent",
        "text": "/var/folders/other/user/T/pain-gain-foreign",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "compatibility"
    },
    {
        "name": "empty input",
        "text": "",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "compatibility"
    },
    {
        "name": "valid left boundary space",
        "text": " /tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary newline",
        "text": "\n/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary tab",
        "text": "\t/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary double quote",
        "text": "\"/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary single quote",
        "text": "'/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary backtick",
        "text": "`/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary paren",
        "text": "(/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary bracket",
        "text": "[/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary brace",
        "text": "{/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary angle",
        "text": "</tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "valid left boundary equals",
        "text": "=/tmp/pain-gain-alpha",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-alpha"
        ],
        "category": "positive-boundary"
    },
    {
        "name": "reject nested tmp",
        "text": "/opt/archive/tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject nested private tmp",
        "text": "/opt/archive/private/tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject nested var",
        "text": "/else/var/folders/aa/bb/T/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject nested private var",
        "text": "/else/private/var/folders/aa/bb/T/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject URL",
        "text": "https://example.invalid/tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject file URL",
        "text": "file:///tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject relative prefix",
        "text": "../tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject word prefix",
        "text": "x/tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject double slash",
        "text": "//tmp/pain-gain-false",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [],
        "category": "regression"
    },
    {
        "name": "reject nested var then retain distinct valid tmp",
        "text": "/else/var/folders/aa/bb/T/pain-gain-false /tmp/pain-gain-real",
        "parents": [
            "/private/tmp",
            "/private/var/folders/aa/bb/T"
        ],
        "expected": [
            "/private/tmp/pain-gain-real"
        ],
        "category": "regression"
    }
];

for (const row of temporaryRootBoundaryCases) {
    test(`temporary-root boundary: ${row.name}`, () => {
        const parents = [...row.parents];
        const first = referencedTemporaryRoots(row.text, parents);
        assert.deepEqual(first, row.expected);
        assert.deepEqual(parents, row.parents);
        assert.deepEqual(referencedTemporaryRoots(row.text, parents), first);
        assert.deepEqual(parents, row.parents);
    });
}

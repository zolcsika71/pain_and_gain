// Database-free validation of unchanged historical bytes and trusted coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadFrozenInputs, validateFrozenInputs, validateCaseInventories,
    mainCaseIds, supplementalCaseIds, reportModes, contractVersion }
    from '../fixtures/replay-score-metadata-contract-v2.js';

const inputs = {
    recipeBytes: fs.readFileSync(new URL('../fixtures/replay-score-analysis-m2d-recipe.js', import.meta.url)),
    oracleBytes: fs.readFileSync(new URL('../fixtures/replay-score-analysis-m2d-oracle.json', import.meta.url)),
    compatibilityBytes: fs.readFileSync(new URL('../fixtures/replay-score-analysis-m2d-compat-oracle.json', import.meta.url)),
};
const genuine = await loadFrozenInputs(inputs);

test('frozen inputs: empty supplemental cannot remove ten comparisons', async () => {
    await assert.rejects(loadFrozenInputs({ ...inputs, compatibilityBytes: Buffer.from('{"cases":{}}') }),
        /Frozen compatibilityBytes bytes changed/);
});

for (const name of ['recipeBytes', 'oracleBytes', 'compatibilityBytes']) {
    for (const [label, value] of [['whitespace alteration', Buffer.concat([inputs[name], Buffer.from(' ')])],
        ['empty', Buffer.alloc(0)], ['malformed', Buffer.from('{')], ['unsupported', 'not bytes'],
        ['missing', undefined]]) {
        test(`frozen inputs: ${name} ${label} rejects before parsing/import`, async () => {
            await assert.rejects(loadFrozenInputs({ ...inputs, [name]: value }), /Frozen|Missing or unsupported/);
        });
    }
}

test('frozen inputs: altered executable recipe is rejected without import', async () => {
    const name = '__scoreContractUnvalidatedRecipe';
    assert.equal(Object.hasOwn(globalThis, name), false);
    await assert.rejects(loadFrozenInputs({ ...inputs,
        recipeBytes: Buffer.from(`globalThis.${name} = true;`) }), /Frozen recipeBytes/);
    assert.equal(Object.hasOwn(globalThis, name), false);
});

test('frozen inputs: all hashes precede any JSON parsing', t => {
    let calls = 0;
    t.mock.method(JSON, 'parse', () => { calls++; throw Error('Unexpected parse'); });
    assert.throws(() => validateFrozenInputs({ ...inputs, compatibilityBytes: Buffer.from('{"cases":{}}') }),
        /Frozen compatibilityBytes/);
    assert.equal(calls, 0);
});

test('frozen inputs: unsupported versions and bundles reject', async () => {
    for (const version of ['v1', '', null]) {
        assert.throws(() => validateFrozenInputs(inputs, version), /Unsupported frozen contract version/);
    }
    for (const value of [null, {}, []]) await assert.rejects(loadFrozenInputs(value), /Missing or unsupported/);
    assert.equal(contractVersion, 'score-metadata-match-identity-v2');
});

// These tiny shapes test the independent inventory gate without weakening byte
// pins or adding an expected-hash override to the real loader.
function inventories() {
    const cases = ids => Object.fromEntries(ids.map(id => [id, {
        reports: { full: {}, compact: {} }, hashes: { full: 'synthetic', compact: 'synthetic' },
    }]));
    return [{ scenarios: cases(mainCaseIds) }, { cases: cases(supplementalCaseIds) }];
}
for (const [index, collection] of [[0, 'scenarios'], [1, 'cases']]) {
    for (const change of ['empty', 'missing', 'extra', 'renamed', 'reordered', 'array']) {
        test(`frozen inventory: ${collection} ${change} rejects`, () => {
            const values = inventories(), cases = values[index][collection], names = Object.keys(cases);
            if (change === 'empty') values[index][collection] = {};
            if (change === 'missing') delete cases[names[0]];
            if (change === 'extra') cases.unexpected = cases[names[0]];
            if (change === 'renamed') { cases.renamed = cases[names[0]]; delete cases[names[0]]; }
            if (change === 'reordered') values[index][collection] = Object.fromEntries(Object.entries(cases).reverse());
            if (change === 'array') values[index][collection] = [];
            assert.throws(() => validateCaseInventories(...values), /inventory/);
        });
    }
    for (const property of ['reports', 'hashes']) for (const change of ['empty', 'missing', 'extra', 'reordered']) {
        test(`frozen inventory: ${collection} ${property} modes ${change} reject`, () => {
            const values = inventories(), first = Object.values(values[index][collection])[0];
            if (change === 'empty') first[property] = {};
            if (change === 'missing') delete first[property].compact;
            if (change === 'extra') first[property].unsupported = {};
            if (change === 'reordered') first[property] = { compact: first[property].compact, full: first[property].full };
            assert.throws(() => validateCaseInventories(...values), /inventory/);
        });
    }
}

test('frozen inputs: complete trusted inventory is 32 main plus ten supplemental comparisons', () => {
    validateCaseInventories(genuine.historical, genuine.compatibility);
    assert.equal(mainCaseIds.length * reportModes.length, 32);
    assert.equal(supplementalCaseIds.length * reportModes.length, 10);
    assert.deepEqual(genuine.variants, mainCaseIds);
    for (const ids of [mainCaseIds, supplementalCaseIds, reportModes]) assert.ok(Object.isFrozen(ids));
});

test('frozen inputs: async import uses private validated bytes despite caller mutation', async () => {
    const copy = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Buffer.from(v)]));
    const loading = loadFrozenInputs(copy);
    for (const value of Object.values(copy)) value.fill(0);
    copy.recipeBytes = Buffer.from('throw Error("not validated");');
    const loaded = await loading;
    assert.deepEqual(loaded.variants, mainCaseIds);
    assert.deepEqual(loaded.expected, genuine.expected);
});

for (const mode of reportModes) test(`frozen inputs: unrelated ${mode} report mutation still fails exact comparison`, () => {
    const expected = genuine.expected.scenarios.metadata.reports[mode];
    const changed = structuredClone(expected);
    changed.summary.fail++;
    assert.throws(() => assert.equal(JSON.stringify(changed), JSON.stringify(expected)), { code: 'ERR_ASSERTION' });
});

// Static integration checks only: do not import database-backed entry points.
for (const file of ['../fixtures/replay-score-analysis-m2d-store.js',
    '../fixtures/replay-score-analysis-m2d-worker.js', './replay-score-analysis-fixture.test.js',
    './replay-score-contract-v2.test.js']) {
    test(`frozen inputs: ${file} uses shared pre-import validation`, () => {
        const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
        assert.match(source, /await loadFrozenInputs\(\)/);
        assert.doesNotMatch(source, /from ['"][^'"]*replay-score-analysis-m2d-recipe\.js['"]/);
        assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync\(new URL\([^\n]*m2d-(?:compat-)?oracle/);
    });
}

// Synthetic expectation contract v2 (2026-10-12), not a regenerated oracle.
// The historical body says _id: 'game' but its request is for d...d. Strict
// identity validation intentionally rejects it. All other expectations survive.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const contractVersion = 'score-metadata-match-identity-v2';
export const historicalOracleHash = '07e152deb5cf7dae86eba27d06a1f1dfe503304fc09aafc1342070d232394047';
export const historicalRecipeHash = '1a0045c8bbe703f9262020a91f986c8834f3650ceeaafd62682f32a4c9b68176';
export const historicalCompatibilityHash = '38e4a31583b096b79763074d7054a768856c0af9b5ce3d0e3c862175a82898c3';
export const mainCaseIds = Object.freeze(['scale', 'metadata', 'frames', 'absent', 'empty',
    'missing', 'mixed', 'malformed', 'utf8', 'nonarray', 'unsupported', 'summary',
    'provenance', 'response', 'gap', 'conflict']);
export const supplementalCaseIds = Object.freeze(['single-readable', 'duplicate-readable-missing',
    'duplicate-missing-readable', 'numeric-frames', 'numeric-metadata']);
export const reportModes = Object.freeze(['full', 'compact']);
export const affectedScenarios = ['scale', 'metadata', 'mixed', 'malformed', 'utf8',
    'nonarray', 'unsupported', 'summary', 'provenance', 'response', 'gap', 'conflict'];
const fingerprint = 'f33fe83e565ecf8cd460de432813b2cb6193013efee9f1b722b963c7e6098856';
const source = { path: `replay_logs/replay-score-source-${'d'.repeat(24)}-${fingerprint}.response`,
    scoreFingerprint: fingerprint };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const oldIdentity = { status: 'established', oursSlot: 'player2', opponentSlot: 'player1',
    slotUsers: ['user-a', 'user-b'], sources: [{ status: 'established', oursSlot: 'player2',
        opponentSlot: 'player1', slotUsers: ['user-a', 'user-b'], source }] };
const newIdentity = { status: 'conflicting', oursSlot: null, opponentSlot: null, slotUsers: null,
    sources: [{ status: 'conflicting', reason: 'match-identity-disagrees', source }] };
const oldMessage = 'Validated nested metadata references establish current-user payload-slot ownership.';
const newMessage = 'Selected metadata identity representations conflict.';

function exactKeys(value, keys, label) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} inventory must be an object`);
    assert.deepEqual(Object.keys(value), keys, `${label} inventory changed`);
}

// Explicit trusted inventories, not counts/IDs inferred from supplied inputs.
export function validateCaseInventories(historical, compatibility) {
    for (const [cases, ids, label] of [[historical?.scenarios, mainCaseIds, 'main'],
        [compatibility?.cases, supplementalCaseIds, 'supplemental']]) {
        exactKeys(cases, ids, label);
        for (const id of ids) {
            exactKeys(cases[id]?.reports, reportModes, `${label}/${id} reports`);
            exactKeys(cases[id]?.hashes, reportModes, `${label}/${id} hashes`);
        }
    }
}

export function validateFrozenInputs(inputs, version = contractVersion) {
    assert.equal(version, contractVersion, 'Unsupported frozen contract version');
    const retained = {};
    for (const [name, expectedHash] of [['recipeBytes', historicalRecipeHash],
        ['oracleBytes', historicalOracleHash], ['compatibilityBytes', historicalCompatibilityHash]]) {
        const bytes = inputs?.[name];
        assert.ok(Buffer.isBuffer(bytes), `Missing or unsupported frozen input: ${name}`);
        retained[name] = Buffer.from(bytes);
        assert.equal(hash(retained[name]), expectedHash, `Frozen ${name} bytes changed`);
    }
    // No input is parsed or imported until ALL three byte identities pass.
    const historical = JSON.parse(retained.oracleBytes);
    const compatibility = JSON.parse(retained.compatibilityBytes);
    validateCaseInventories(historical, compatibility);
    return { ...retained, historical, compatibility, expected: metadataContractV2(retained.oracleBytes) };
}

export async function loadFrozenInputs(inputs) {
    const validated = validateFrozenInputs(inputs === undefined ? {
        recipeBytes: fs.readFileSync(new URL('./replay-score-analysis-m2d-recipe.js', import.meta.url)),
        oracleBytes: fs.readFileSync(new URL('./replay-score-analysis-m2d-oracle.json', import.meta.url)),
        compatibilityBytes: fs.readFileSync(new URL('./replay-score-analysis-m2d-compat-oracle.json', import.meta.url)),
    } : inputs);
    // Import the exact validated snapshot, not a pathname that could change
    // between hashing and import. This frozen recipe imports only node:crypto.
    const recipe = await import(`data:text/javascript;base64,${validated.recipeBytes.toString('base64')}`);
    assert.deepEqual(recipe.variants, mainCaseIds, 'Frozen recipe inventory changed');
    return { ...validated, recipe: recipe.recipe, replayId: recipe.replayId, hash: recipe.hash,
        variants: mainCaseIds };
}

export function metadataContractV2(bytes) {
    assert.equal(hash(bytes), historicalOracleHash, 'Frozen oracle bytes changed');
    const golden = JSON.parse(bytes);
    for (const name of affectedScenarios) for (const mode of ['full', 'compact']) {
        const scenario = golden.scenarios[name], report = scenario.reports[mode];
        assert.equal(hash(JSON.stringify(report) + '\n'), scenario.hashes[mode]);
        assert.deepEqual(report.scoring.metadataIdentity, oldIdentity);
        report.scoring.metadataIdentity = structuredClone(newIdentity);
        const findings = (mode === 'full' ? report.findings : report.findingSummary)
            .filter(f => f.rule === 'score.metadata-identity');
        assert.equal(findings.length, 1);
        const finding = findings[0];
        assert.equal(finding.verdict, 'pass');
        finding.verdict = 'fail';
        if (mode === 'full') {
            assert.equal(finding.message, oldMessage);
            assert.deepEqual(finding.observed, oldIdentity);
            finding.message = newMessage;
            finding.observed = structuredClone(newIdentity);
        } else {
            assert.equal(finding.count, 1);
            assert.deepEqual(finding.representativeMessages, [oldMessage]);
            finding.representativeMessages = [newMessage];
            // Explicit compact projection, independent of the implementation's
            // compactor; no unrelated finding or report field is normalized.
            finding.representativeObserved = [{ opponentSlot: null, oursSlot: null,
                slotUsers: null, sources: { count: 1, representatives: [{
                    reason: 'match-identity-disagrees', source: structuredClone(source),
                    status: 'conflicting',
                }], abbreviated: false }, status: 'conflicting' }];
        }
        assert.ok(report.summary.pass >= 1);
        report.summary.pass--;
        report.summary.fail++;
        scenario.hashes[mode] = hash(JSON.stringify(report) + '\n');
    }
    return golden;
}

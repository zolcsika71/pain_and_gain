#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, gunzipSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultCacheDir = path.join(os.homedir(), 'Library/Application Support/screeps_arena/Cache/Cache_Data');
const cacheMagic = Buffer.from('305c72a71b6dfbfc', 'hex');
const cacheFinalMagic = 0xf4fa6f45970d41d8n;
const cacheEofSize = 24;
const cacheFlagCrc32 = 1;
const cacheFlagKeySha256 = 2;
const logKey = /^1\/0\/https:\/\/arena\.screeps\.com\/api\/game\/([a-f0-9]{24})\/log\/(\d+)$/;
const scoreKey = /^1\/0\/(https:\/\/arena\.screeps\.com\/api\/game\/([a-f0-9]{24})(?:\/replay\/(0|[1-9]\d*))?)$/;
const scoreFingerprintDomain = Buffer.from('replay-score-source-v1');
const scoreItemTargets = [
    { itemId: 'player1-score', label: 'Score', slot: 'player1', measurement: 'cumulativeScore' },
    { itemId: 'player1-gain', label: 'Gained this tick', slot: 'player1', measurement: 'displayedGain' },
    { itemId: 'player2-score', label: 'Score', slot: 'player2', measurement: 'cumulativeScore' },
    { itemId: 'player2-gain', label: 'Gained this tick', slot: 'player2', measurement: 'displayedGain' },
];
const scoreItemStatuses = ['valid', 'missing', 'mislabeled', 'invalid', 'conflicting', 'unassessed'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
        : item);
const mapContent = map => `${canonical(map)}\n`;
// Only the saved map's top-level checksum is metadata; nested fields remain payload.
export const mapPayload = map => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return map;
    const { checksum, ...payload } = map;
    return payload;
};
export const mapChecksum = map => sha256(mapContent(mapPayload(map)));
const savedMapContent = map => mapContent({ ...mapPayload(map), checksum: mapChecksum(map) });
const validSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validBuildId = validSha256;
const membershipDiagnosticTypes = ['membership-baseline', 'membership-change'];
const actionDiagnosticTypes = ['action-decision', 'action-attempt'];
const actionCoveredTypes = [...membershipDiagnosticTypes, ...actionDiagnosticTypes];
const cpuDiagnosticTypes = ['runtime-cpu'];
const currentCoveredTypes = [...actionCoveredTypes, ...cpuDiagnosticTypes];
const retainedDiagnosticTypes = [...currentCoveredTypes, 'evidence-coverage',
    'flag-allocation', 'healer-escort'];
const evidenceCountKeys = [...actionCoveredTypes,
    'movement-decisions', 'healing-decisions', 'combat-decisions'];
const channels = ['movement', 'healing', 'combat'];
const phaseOrder = new Map(['before-actions', 'movement', 'tactics', 'after-actions']
    .map((phase, index) => [phase, index]));
const actionMethods = ['moveTo', 'heal', 'rangedHeal', 'attack', 'rangedAttack'];
const targetKinds = ['creep', 'score-flag', 'position', 'game-object', 'unknown'];
const roles = ['melee', 'ranged', 'healer', 'scout', 'mixed', 'unclassifiable'];
const presences = ['present', 'missing', 'dead'];
const membershipChangeOrder = ['member-added', 'assignment', 'presence', 'capability', 'participation'];
const reasonToken = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

function validPartCounts(value, nullable = false) {
    if (nullable && value === null) return true;
    return value && typeof value === 'object' && !Array.isArray(value) &&
        Object.entries(value).every(([part, count]) => /^[a-z][a-z0-9_]*$/.test(part) && nonnegativeInteger(count));
}

function validMember(member) {
    return member && typeof member === 'object' && !Array.isArray(member) &&
        typeof member.id === 'string' && member.id.length > 0 && roles.includes(member.role) &&
        validPartCounts(member.originalParts, true) &&
        (member.squadId === null || typeof member.squadId === 'string') &&
        (member.slotIndex === null || nonnegativeInteger(member.slotIndex)) &&
        typeof member.late === 'boolean' && presences.includes(member.presence) &&
        validPartCounts(member.functioning) && typeof member.capable === 'boolean' &&
        typeof member.participating === 'boolean' && typeof member.canMoveNow === 'boolean';
}

function validMembershipEnvelope(entry, type) {
    return entry?.type === type && entry.formatVersion === 1 && validBuildId(entry.buildId) &&
        positiveInteger(entry.tick) && entry.phase === 'before-actions' &&
        nonnegativeInteger(entry.sequence) && entry.recordId === `${entry.tick}:${entry.sequence}` &&
        positiveInteger(entry.epoch);
}

export function validBaseline(entry) {
    if (!validMembershipEnvelope(entry, 'membership-baseline') ||
        typeof entry.initialized !== 'boolean' ||
        (entry.initializationReason !== null && !reasonToken(entry.initializationReason)) ||
        (entry.initialized ? entry.initializationReason !== null : entry.initializationReason === null) ||
        (entry.lastTick !== null && !positiveInteger(entry.lastTick)) ||
        !Array.isArray(entry.squads) || !Array.isArray(entry.members) ||
        !entry.members.every(validMember)) return false;
    if (entry.members.some((member, index) => index && entry.members[index - 1].id >= member.id)) return false;
    const memberIds = new Set(entry.members.map(member => member.id));
    const assigned = new Set();
    const squadIds = new Set();
    for (const squad of entry.squads) {
        if (!squad || typeof squad.id !== 'string' || !Array.isArray(squad.memberIds) ||
            squadIds.has(squad.id) ||
            squad.memberIds.some(id => typeof id !== 'string' || !memberIds.has(id) || assigned.has(id))) return false;
        squadIds.add(squad.id);
        squad.memberIds.forEach(id => assigned.add(id));
    }
    return entry.members.every(member => {
        if (member.squadId === null) return member.slotIndex === null && !assigned.has(member.id);
        const squad = entry.squads.find(item => item.id === member.squadId);
        return squad && squad.memberIds[member.slotIndex] === member.id;
    });
}

function validMembershipChange(change) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) return false;
    if (change.kind === 'reset') return positiveInteger(change.previousTick) &&
        positiveInteger(change.currentTick) && positiveInteger(change.fromEpoch) &&
        positiveInteger(change.toEpoch) && change.toEpoch === change.fromEpoch + 1 && reasonToken(change.reason);
    if (change.kind === 'initialization') return typeof change.initialized === 'boolean' &&
        (change.initializationReason === null || reasonToken(change.initializationReason));
    if (change.kind === 'member-added') return validMember(change.member);
    if (typeof change.memberId !== 'string' || !change.memberId) return false;
    if (change.kind === 'assignment') return (change.squadId === null || typeof change.squadId === 'string') &&
        (change.slotIndex === null || nonnegativeInteger(change.slotIndex)) &&
        ((change.squadId === null) === (change.slotIndex === null));
    if (change.kind === 'presence') return presences.includes(change.from) &&
        presences.includes(change.to) && change.from !== change.to;
    if (change.kind === 'capability') return validPartCounts(change.functioning) &&
        typeof change.capable === 'boolean' && typeof change.canMoveNow === 'boolean';
    return change.kind === 'participation' && typeof change.participating === 'boolean';
}

export function validChange(entry) {
    if (!validMembershipEnvelope(entry, 'membership-change') || !Array.isArray(entry.changes) ||
        entry.changes.length === 0 || !entry.changes.every(validMembershipChange)) return false;
    const keys = entry.changes.map(change => {
        if (change.kind === 'reset') {
            if (change.currentTick !== entry.tick || change.toEpoch !== entry.epoch) return null;
            return `0:${change.kind}`;
        }
        if (change.kind === 'initialization') return `1:${change.kind}`;
        const memberId = change.memberId ?? change.member.id;
        return `2:${memberId}:${String(membershipChangeOrder.indexOf(change.kind)).padStart(2, '0')}`;
    });
    return !keys.includes(null) && keys.every((key, index) => index === 0 || keys[index - 1] < key);
}

function validActionEnvelope(entry, type) {
    const phase = entry?.channel === 'movement' ? 'movement' : 'tactics';
    return entry?.type === type && entry.formatVersion === 1 && validBuildId(entry.buildId) &&
        positiveInteger(entry.tick) && channels.includes(entry.channel) && entry.phase === phase &&
        nonnegativeInteger(entry.sequence) && entry.recordId === `${entry.tick}:${entry.sequence}` &&
        typeof entry.actorId === 'string' && entry.actorId.length > 0;
}

function validTarget(target) {
    return target && typeof target === 'object' && !Array.isArray(target) &&
        targetKinds.includes(target.kind) &&
        (target.id === null || (typeof target.id === 'string' && target.id.length > 0)) &&
        Number.isSafeInteger(target.x) && Number.isSafeInteger(target.y);
}

function validMethodForChannel(method, channel) {
    return actionMethods.includes(method) && (channel === 'movement' ? method === 'moveTo'
        : channel === 'healing' ? ['heal', 'rangedHeal'].includes(method)
            : ['attack', 'rangedAttack'].includes(method));
}

export function validActionDecision(entry) {
    if (!validActionEnvelope(entry, 'action-decision') || entry.decisionId !== entry.recordId ||
        !['selected', 'hold', 'no-action'].includes(entry.outcome) || !reasonToken(entry.reason) ||
        !Array.isArray(entry.actions) ||
        (entry.outcome === 'selected' ? entry.actions.length === 0 : entry.actions.length !== 0)) return false;
    return entry.actions.every((action, index) => action && typeof action === 'object' &&
        !Array.isArray(action) && action.actionId === `${entry.decisionId}#${index}` &&
        validMethodForChannel(action.method, entry.channel) && validTarget(action.target));
}

export function validActionAttempt(entry) {
    const actionMatch = typeof entry?.actionId === 'string'
        ? entry.actionId.match(/^(\d+:\d+)#(0|[1-9]\d*)$/) : null;
    return validActionEnvelope(entry, 'action-attempt') &&
        typeof entry.decisionId === 'string' && /^\d+:\d+$/.test(entry.decisionId) &&
        entry.decisionId.startsWith(`${entry.tick}:`) && actionMatch?.[1] === entry.decisionId &&
        validMethodForChannel(entry.method, entry.channel) && validTarget(entry.target) &&
        (entry.returnCode === null || Number.isSafeInteger(entry.returnCode));
}

export function validCpuSample(entry) {
    return entry?.type === 'runtime-cpu' && entry.formatVersion === 1 &&
        validBuildId(entry.buildId) && positiveInteger(entry.tick) && entry.phase === 'after-actions' &&
        nonnegativeInteger(entry.sequence) && entry.recordId === `${entry.tick}:${entry.sequence}` &&
        nonnegativeInteger(entry.elapsedNs) && positiveInteger(entry.limitNs) &&
        entry.limitKind === (entry.tick === 1 ? 'first-tick' : 'ordinary-tick') &&
        entry.unit === 'nanoseconds';
}

export function validCoverage(entry) {
    const membershipOnly = canonical(entry?.coveredTypes) === canonical(membershipDiagnosticTypes);
    const actionEvidence = canonical(entry?.coveredTypes) === canonical(actionCoveredTypes);
    const cpuEvidence = canonical(entry?.coveredTypes) === canonical(currentCoveredTypes);
    const expectedCountKeys = [...evidenceCountKeys, ...(cpuEvidence ? cpuDiagnosticTypes : [])];
    if (entry?.type !== 'evidence-coverage' ||
        !((entry.formatVersion === 1 && (membershipOnly || actionEvidence)) ||
            (entry.formatVersion === 2 && cpuEvidence)) ||
        !validBuildId(entry.buildId) || !positiveInteger(entry.tick) || entry.phase !== 'after-actions' ||
        !nonnegativeInteger(entry.sequence) || entry.recordId !== `${entry.tick}:${entry.sequence}` ||
        !nonnegativeInteger(entry.recordCount) || entry.sequence !== entry.recordCount ||
        entry.closed !== true || !Array.isArray(entry.coveredTypes) ||
        !entry.counts || typeof entry.counts !== 'object' || Array.isArray(entry.counts) ||
        canonical(Object.keys(entry.counts).sort()) !== canonical([...expectedCountKeys].sort()) ||
        !expectedCountKeys.every(key => nonnegativeInteger(entry.counts[key])) ||
        (membershipOnly && [...actionDiagnosticTypes, 'movement-decisions', 'healing-decisions',
            'combat-decisions'].some(key => entry.counts[key] !== 0)) ||
        (cpuEvidence && entry.counts['runtime-cpu'] !== 1)) return false;
    return entry.recordCount === 0
        ? entry.firstSequence === null && entry.lastSequence === null
        : entry.firstSequence === 0 && entry.lastSequence === entry.recordCount - 1;
}

export function summarizeDiagnosticCoverage(gameStateLines, diagnostics) {
    const gameTicks = gameStateLines.map(line => JSON.parse(line).tick);
    const diagnosticTicks = diagnostics.map(item => item.entry.tick);
    const ticks = [...new Set([...gameTicks, ...diagnosticTicks])].sort((a, b) => a - b);
    const cpuDeclared = diagnostics.some(item => item.entry.type === 'runtime-cpu' ||
        (item.entry.type === 'evidence-coverage' && item.entry.coveredTypes.includes('runtime-cpu')));
    const countedDiagnosticTypes = [...actionCoveredTypes, ...(cpuDeclared ? cpuDiagnosticTypes : [])];
    const summary = {
        formatVersion: 1, firstTick: ticks[0] ?? null, lastTick: ticks.at(-1) ?? null,
        versions: [...new Set(diagnostics.map(item => item.entry.formatVersion))].sort((a, b) => a - b),
        coveredTypes: [],
        completeTicks: [], missingClosures: [], gaps: [], duplicateRecordIds: [], conflicts: [],
        correlationIssues: [],
        typeCounts: Object.fromEntries([...countedDiagnosticTypes,
            'evidence-coverage'].map(type => [type, 0])),
        channelCounts: { movement: 0, healing: 0, combat: 0 },
    };
    for (const item of diagnostics) {
        summary.typeCounts[item.entry.type]++;
        if (item.entry.type === 'action-decision') summary.channelCounts[item.entry.channel]++;
    }
    for (const tick of ticks) {
        const atTick = diagnostics.filter(item => item.entry.tick === tick);
        const byRecordId = new Map();
        for (const item of atTick) {
            const items = byRecordId.get(item.entry.recordId) ?? [];
            items.push(item);
            byRecordId.set(item.entry.recordId, items);
        }
        let conflict = false;
        for (const [recordId, items] of byRecordId) {
            const variants = new Set(items.map(item => canonical(item.entry)));
            if (variants.size > 1) {
                summary.conflicts.push({ tick, recordId, sources: items.map(item => item.key) });
                conflict = true;
            } else if (items.length > 1) {
                summary.duplicateRecordIds.push({ tick, recordId, count: items.length,
                    sources: items.map(item => item.key) });
            }
        }
        const unique = [...byRecordId.values()].map(items => items[0].entry);
        const closures = unique.filter(entry => entry.type === 'evidence-coverage');
        if (closures.length === 0) {
            summary.missingClosures.push(tick);
            continue;
        }
        if (closures.length > 1) {
            summary.conflicts.push({ tick, recordIds: closures.map(entry => entry.recordId),
                sources: atTick.filter(item => item.entry.type === 'evidence-coverage').map(item => item.key) });
            continue;
        }
        const closure = closures[0];
        for (const type of closure.coveredTypes) {
            if (!summary.coveredTypes.includes(type)) summary.coveredTypes.push(type);
        }
        const preceding = unique.filter(entry => entry.type !== 'evidence-coverage');
        const actualSequences = [...new Set(preceding.map(entry => entry.sequence))].sort((a, b) => a - b);
        const expectedSequences = Array.from({ length: closure.recordCount }, (_, index) => index);
        const closureTypes = closure.coveredTypes.includes('runtime-cpu')
            ? currentCoveredTypes : actionCoveredTypes;
        const actualCounts = Object.fromEntries(closureTypes.map(type =>
            [type, preceding.filter(entry => entry.type === type).length]));
        const actualChannels = Object.fromEntries(channels.map(channel => [channel,
            preceding.filter(entry => entry.type === 'action-decision' && entry.channel === channel).length]));
        const countMismatch = closureTypes.some(type => actualCounts[type] !== closure.counts[type]) ||
            channels.some(channel => actualChannels[channel] !== closure.counts[`${channel}-decisions`]);

        const decisions = preceding.filter(entry => entry.type === 'action-decision');
        const attempts = preceding.filter(entry => entry.type === 'action-attempt');
        const selected = new Map(decisions.flatMap(decision => decision.actions.map((action, actionIndex) =>
            [action.actionId, { decision, action, actionIndex }])));
        const attemptsByAction = new Map();
        for (const attempt of attempts) {
            const list = attemptsByAction.get(attempt.actionId) ?? [];
            list.push(attempt);
            attemptsByAction.set(attempt.actionId, list);
        }
        const tickIssues = [];
        for (const [actionId, selection] of selected) {
            const matching = attemptsByAction.get(actionId) ?? [];
            if (matching.length === 0) tickIssues.push({ tick, kind: 'missing-attempt', actionId });
            if (matching.length > 1) tickIssues.push({ tick, kind: 'duplicate-attempt', actionId,
                recordIds: matching.map(attempt => attempt.recordId) });
            for (const attempt of matching) {
                if (attempt.decisionId !== selection.decision.decisionId ||
                    attempt.actorId !== selection.decision.actorId ||
                    attempt.channel !== selection.decision.channel || attempt.method !== selection.action.method ||
                    canonical(attempt.target) !== canonical(selection.action.target)) {
                    tickIssues.push({ tick, kind: 'mismatched-attempt', actionId,
                        recordId: attempt.recordId });
                }
                if (attempt.sequence !== selection.decision.sequence + selection.actionIndex + 1) {
                    tickIssues.push({ tick, kind: 'misordered-attempt', actionId,
                        recordId: attempt.recordId });
                }
            }
        }
        for (const attempt of attempts) {
            if (!selected.has(attempt.actionId)) tickIssues.push({ tick, kind: 'orphan-attempt',
                actionId: attempt.actionId, recordId: attempt.recordId });
        }
        const bySequence = [...preceding].sort((a, b) => a.sequence - b.sequence);
        for (let index = 1; index < bySequence.length; index++) {
            if (phaseOrder.get(bySequence[index].phase) < phaseOrder.get(bySequence[index - 1].phase)) {
                tickIssues.push({ tick, kind: 'phase-order',
                    recordIds: [bySequence[index - 1].recordId, bySequence[index].recordId] });
            }
        }
        summary.correlationIssues.push(...tickIssues);
        const structuralProblem = canonical(actualSequences) !== canonical(expectedSequences) ||
            countMismatch || conflict;
        if (structuralProblem) {
            summary.gaps.push({ tick, expectedSequences, actualSequences, countMismatch });
        }
        if (structuralProblem || tickIssues.length) continue;
        summary.completeTicks.push(tick);
    }
    return summary;
}

function entryBuildId(entry, source) {
    if (!Object.hasOwn(entry, 'buildId')) return null;
    if (!validBuildId(entry.buildId)) throw new Error(`Invalid build ID in ${source}`);
    return entry.buildId;
}

function consistentBuildId(current, next, source) {
    if (current !== undefined && current !== next) throw new Error(`Conflicting or missing build IDs in ${source}`);
    return next;
}

export function validMap(map) {
    const terrain = map?.terrain;
    return map && typeof map === 'object' && !Array.isArray(map) &&
        Object.keys(map).sort().join(',') === 'arena,objects,terrain' &&
        map?.arena?.name === 'Pain and Gain' &&
        typeof map.arena.season === 'string' && Number.isSafeInteger(map.arena.level) &&
        Number.isSafeInteger(map.arena.ticksLimit) &&
        terrain?.width === 100 && terrain?.height === 100 &&
        Array.isArray(terrain.rows) && terrain.rows.length === 100 &&
        terrain.rows.every(row => Array.isArray(row) && row.length === 100 &&
            row.every(cell => Number.isSafeInteger(cell))) &&
        Array.isArray(map.objects) && map.objects.every(object =>
            object && typeof object === 'object' && !Array.isArray(object) &&
            typeof object.type === 'string' && !/creep/i.test(object.type));
}

function issue(kind, message) {
    return { kind, message };
}

function readCacheEof(bytes, offset, label) {
    if (offset < 0 || offset + cacheEofSize > bytes.length ||
        bytes.readBigUInt64LE(offset) !== cacheFinalMagic) {
        throw new Error(`Invalid ${label} EOF record`);
    }
    const flags = bytes.readUInt32LE(offset + 8);
    if ((flags & ~(cacheFlagCrc32 | cacheFlagKeySha256)) !== 0 ||
        bytes.readUInt32LE(offset + 20) !== 0) {
        throw new Error(`Unsupported ${label} EOF flags`);
    }
    return { flags, dataCrc32: bytes.readUInt32LE(offset + 12),
        streamSize: bytes.readUInt32LE(offset + 16) };
}

function parseSimpleCacheV5(bytes, keyLength) {
    const payloadStart = 24 + keyLength;
    if (bytes.length < payloadStart + cacheEofSize * 2) throw new Error('Incomplete cache streams');
    const stream0EofOffset = bytes.length - cacheEofSize;
    const stream0Eof = readCacheEof(bytes, stream0EofOffset, 'stream-0');
    const keyHashSize = stream0Eof.flags & cacheFlagKeySha256 ? 32 : 0;
    const stream0End = stream0EofOffset - keyHashSize;
    const stream0Start = stream0End - stream0Eof.streamSize;
    const stream1EofOffset = stream0Start - cacheEofSize;
    if (stream0Start < payloadStart + cacheEofSize) throw new Error('Invalid cache stream sizes');
    const stream1Eof = readCacheEof(bytes, stream1EofOffset, 'stream-1');
    if (stream1Eof.streamSize !== 0 || (stream1Eof.flags & cacheFlagKeySha256)) {
        throw new Error('Invalid stream-1 EOF metadata');
    }
    const stream1 = bytes.subarray(payloadStart, stream1EofOffset);
    const stream0 = bytes.subarray(stream0Start, stream0End);
    if (stream1Eof.flags & cacheFlagCrc32 && (crc32(stream1) >>> 0) !== stream1Eof.dataCrc32) {
        throw new Error('Stream-1 CRC32 mismatch');
    }
    if (stream0Eof.flags & cacheFlagCrc32 && (crc32(stream0) >>> 0) !== stream0Eof.dataCrc32) {
        throw new Error('Stream-0 CRC32 mismatch');
    }
    if (keyHashSize) {
        const key = bytes.subarray(24, payloadStart);
        const expected = createHash('sha256').update(key).digest();
        if (!bytes.subarray(stream0End, stream0EofOffset).equals(expected)) {
            throw new Error('Cache key SHA-256 mismatch');
        }
    }
    return { stream0, stream1 };
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
    const diagnostics = [];
    let map = null;
    let buildId;
    for (const [entryKey, raw] of Object.entries(response)) {
        if (typeof raw !== 'string') return issue('malformed', `Non-string console entry ${entryKey} for ${key}`);
        // Arena joins multiple console.log calls from one tick into one newline-delimited value.
        const lines = raw.split('\n');
        for (const [part, line] of lines.entries()) {
            const sourceKey = lines.length === 1 ? entryKey : `${entryKey}:${part + 1}`;
            let parsed;
            try {
                parsed = JSON.parse(line);
            } catch {
                if (/"type"\s*:\s*"(?:game-state|map-state|flag-allocation|healer-escort|membership-baseline|membership-change|action-decision|action-attempt|runtime-cpu|evidence-coverage)"/.test(line)) {
                    return issue('malformed', `Malformed state entry ${sourceKey} for ${key}`);
                }
                otherEntries.push({ key: sourceKey, raw: line });
                continue;
            }
            if (parsed?.type === 'map-state') {
                const candidate = parsed.map;
                if (parsed.formatVersion !== 1 || !Number.isSafeInteger(parsed.tick) ||
                    parsed.phase !== 'before-actions' || !validMap(candidate)) {
                    return issue('malformed', `Invalid map-state entry ${sourceKey} for ${key}`);
                }
                if (map && canonical(map) !== canonical(candidate)) {
                    return issue('malformed', `Conflicting map-state entries for ${key}`);
                }
                try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
                catch (error) { return issue('malformed', error.message); }
                map = candidate;
                continue;
            }
            if (parsed?.type === 'flag-allocation') {
                if (!Number.isSafeInteger(parsed.tick) || parsed.phase !== 'before-actions' ||
                    !['assign', 'reject', 'retain', 'cancel', 'complete'].includes(parsed.event) ||
                    typeof parsed.reason !== 'string' || !Object.hasOwn(parsed, 'state') ||
                    (parsed.state !== null && (typeof parsed.state !== 'object' ||
                        Array.isArray(parsed.state)))) {
                    return issue('malformed', `Invalid flag-allocation entry ${sourceKey} for ${key}`);
                }
                try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
                catch (error) { return issue('malformed', error.message); }
                otherEntries.push({ key: sourceKey, raw: line, type: 'flag-allocation' });
                continue;
            }
            if (parsed?.type === 'healer-escort') {
                const transition = ['assign', 'release'].includes(parsed.event);
                const execution = ['move-attempt', 'hold', 'fatigue-pause'].includes(parsed.event);
                if (!Number.isSafeInteger(parsed.tick) ||
                    parsed.phase !== (transition ? 'before-actions' : 'movement') ||
                    (!transition && !execution) || typeof parsed.healerId !== 'string' ||
                    typeof parsed.allyId !== 'string' ||
                    (parsed.reason !== null && typeof parsed.reason !== 'string') ||
                    (parsed.range !== null && (!Number.isSafeInteger(parsed.range) || parsed.range < 0)) ||
                    (parsed.targetId !== null && typeof parsed.targetId !== 'string') ||
                    (parsed.returnCode !== null && !Number.isSafeInteger(parsed.returnCode)) ||
                    (parsed.event === 'move-attempt' && parsed.targetId !== parsed.allyId) ||
                    (parsed.event !== 'move-attempt' &&
                        (parsed.targetId !== null || parsed.returnCode !== null))) {
                    return issue('malformed', `Invalid healer-escort entry ${sourceKey} for ${key}`);
                }
                try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
                catch (error) { return issue('malformed', error.message); }
                otherEntries.push({ key: sourceKey, raw: line, type: 'healer-escort' });
                continue;
            }
            if (actionDiagnosticTypes.includes(parsed?.type)) {
                if (parsed.formatVersion !== 1) {
                    return issue('unsupported', `Unsupported ${parsed.type} version in ${sourceKey} for ${key}`);
                }
                const valid = parsed.type === 'action-decision'
                    ? validActionDecision(parsed) : validActionAttempt(parsed);
                if (!valid) return issue('malformed', `Invalid ${parsed.type} entry ${sourceKey} for ${key}`);
                try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
                catch (error) { return issue('malformed', error.message); }
                const item = { key: sourceKey, raw: line, type: parsed.type, formatVersion: 1 };
                diagnostics.push({ ...item, entry: parsed });
                otherEntries.push(item);
                continue;
            }
            if (parsed?.type === 'runtime-cpu') {
                if (parsed.formatVersion !== 1) {
                    return issue('unsupported', `Unsupported ${parsed.type} version in ${sourceKey} for ${key}`);
                }
                if (!validCpuSample(parsed)) {
                    return issue('malformed', `Invalid ${parsed.type} entry ${sourceKey} for ${key}`);
                }
                try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
                catch (error) { return issue('malformed', error.message); }
                const item = { key: sourceKey, raw: line, type: parsed.type, formatVersion: 1 };
                diagnostics.push({ ...item, entry: parsed });
                otherEntries.push(item);
                continue;
            }
            if (membershipDiagnosticTypes.includes(parsed?.type) || parsed?.type === 'evidence-coverage') {
                const supportedVersion = parsed.type === 'evidence-coverage'
                    ? [1, 2].includes(parsed.formatVersion) : parsed.formatVersion === 1;
                if (!supportedVersion) {
                    return issue('unsupported', `Unsupported ${parsed.type} version in ${sourceKey} for ${key}`);
                }
                const valid = parsed.type === 'membership-baseline' ? validBaseline(parsed) :
                    parsed.type === 'membership-change' ? validChange(parsed) : validCoverage(parsed);
                if (!valid) return issue('malformed', `Invalid ${parsed.type} entry ${sourceKey} for ${key}`);
                try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
                catch (error) { return issue('malformed', error.message); }
                const item = { key: sourceKey, raw: line, type: parsed.type,
                    formatVersion: parsed.formatVersion };
                diagnostics.push({ ...item, entry: parsed });
                otherEntries.push(item);
                continue;
            }
            if (parsed?.type !== 'game-state') {
                otherEntries.push({ key: sourceKey, raw: line });
                continue;
            }
            if (!Number.isSafeInteger(parsed.tick) || parsed.phase !== 'before-actions' ||
                !Array.isArray(parsed.creeps) || !Array.isArray(parsed.flags)) {
                return issue('malformed', `Invalid game-state entry ${sourceKey} for ${key}`);
            }
            try { buildId = consistentBuildId(buildId, entryBuildId(parsed, sourceKey), key); }
            catch (error) { return issue('malformed', error.message); }
            gameState.push(line);
        }
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
        fingerprint: sha256(body), gameState, otherEntries, map, buildId: buildId ?? null,
        coverage: { count: ticks.length, firstTick, lastTick, duplicates: [...counts].filter(([, n]) => n > 1).map(([tick]) => tick), gaps },
        diagnosticCoverage: summarizeDiagnosticCoverage(gameState, diagnostics),
    };
}

function emptyScoreItemCounts() {
    return Object.fromEntries(scoreItemStatuses.map(status => [status, 0]));
}

function unavailableScoreItems(blockedBy = []) {
    return { status: 'unavailable', counts: emptyScoreItemCounts(),
        blockedBy: [...new Set(blockedBy)].sort(), assessments: [] };
}

function metadataScoreItems() {
    return { status: 'not-applicable', counts: emptyScoreItemCounts(),
        blockedBy: [], assessments: [] };
}

function scoreIssue(code, fingerprint, details = {}) {
    return { code, fingerprint, ...details };
}

function scoreItemIssue(code, fingerprint, assessment) {
    return scoreIssue(code, fingerprint, {
        frameIndex: assessment.frameIndex, gameTime: assessment.gameTime,
        slot: assessment.slot, itemId: assessment.itemId,
        occurrenceIndexes: assessment.occurrenceIndexes,
    });
}

function scoreItemsStatus(assessments) {
    const valid = assessments.filter(item => item.status === 'valid').length;
    const failures = assessments.filter(item => !['valid', 'unassessed'].includes(item.status)).length;
    if (valid === assessments.length && valid > 0) return 'valid';
    if (valid > 0) return 'partial';
    if (failures > 0) return 'invalid';
    return 'unavailable';
}

function summarizeScoreSegments(frames) {
    const segments = [];
    let current = [];
    const finish = () => {
        if (!current.length) return;
        const counts = new Map();
        for (const item of current) counts.set(item.gameTime, (counts.get(item.gameTime) ?? 0) + 1);
        const duplicates = [...counts].filter(([, count]) => count > 1).map(([gameTime]) => gameTime)
            .sort((a, b) => a - b);
        const gaps = [];
        const firstGameTime = current[0].gameTime;
        const lastGameTime = current.at(-1).gameTime;
        const observed = [...counts.keys()].sort((a, b) => a - b);
        for (let index = 1; index < observed.length; index++) {
            if (observed[index] > observed[index - 1] + 1) {
                gaps.push({ firstGameTime: observed[index - 1] + 1,
                    lastGameTime: observed[index] - 1 });
            }
        }
        segments.push({ firstFrameIndex: current[0].frameIndex,
            lastFrameIndex: current.at(-1).frameIndex, firstGameTime, lastGameTime,
            duplicates, gaps });
        current = [];
    };
    for (const frame of frames) {
        if (!frame.valid) {
            finish();
            continue;
        }
        if (current.length && frame.gameTime < current.at(-1).gameTime) finish();
        current.push(frame);
    }
    finish();
    return segments;
}

function normalizeStoredScoreGaps(gaps) {
    if (!Array.isArray(gaps) || !gaps.every(nonnegativeInteger)) return gaps;
    if (gaps.some((value, index) => index && value <= gaps[index - 1])) return gaps;
    const ranges = [];
    for (const gameTime of gaps) {
        const current = ranges.at(-1);
        if (current && gameTime === current.lastGameTime + 1) current.lastGameTime = gameTime;
        else ranges.push({ firstGameTime: gameTime, lastGameTime: gameTime });
    }
    return ranges;
}

function normalizeStoredScoreCoverage(coverage) {
    if (!coverage || !Array.isArray(coverage.localSegments)) return coverage;
    return { ...coverage, localSegments: coverage.localSegments.map(segment => ({ ...segment,
        gaps: normalizeStoredScoreGaps(segment.gaps) })) };
}

export function scoreCoverageMatches(stored, recomputed) {
    return canonical(normalizeStoredScoreCoverage(stored)) === canonical(recomputed);
}

function validateScoreMetadata(value, fingerprint) {
    const base = {
        transport: 'complete', json: 'valid', frames: 'not-applicable',
        ui: 'not-applicable', items: metadataScoreItems(), issues: [],
    };
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { coverage: null, validation: { ...base, metadata: 'malformed',
            issues: [scoreIssue('metadata-malformed', fingerprint)] } };
    }
    const candidates = [value.players, value.users, value.game?.players]
        .filter(item => item !== undefined);
    const supported = candidate => Array.isArray(candidate) && candidate.length === 2 &&
        candidate.every(item => typeof item === 'string' && item.length > 0);
    if (candidates.length && candidates.every(supported) &&
        candidates.every(candidate => canonical(candidate) === canonical(candidates[0]))) {
        return { coverage: null, validation: { ...base, metadata: 'valid' } };
    }
    return { coverage: null, validation: { ...base, metadata: 'partial',
        issues: [scoreIssue('metadata-mapping-unavailable', fingerprint)] } };
}

function blockedAssessment(frameIndex, gameTime, target, reason) {
    return { frameIndex, gameTime, slot: target.slot, itemId: target.itemId,
        measurement: target.measurement, status: 'unassessed', occurrenceIndexes: [],
        value: null, reason };
}

function assessScoreItem(frameIndex, gameTime, target, items, fingerprint) {
    const occurrences = items.map((item, index) => ({ item, index }))
        .filter(({ item }) => item && typeof item === 'object' && !Array.isArray(item) &&
            item.id === target.itemId);
    const occurrenceIndexes = occurrences.map(item => item.index);
    const assessment = { frameIndex, gameTime, slot: target.slot, itemId: target.itemId,
        measurement: target.measurement, status: null, occurrenceIndexes,
        value: null, reason: null };
    if (!occurrences.length) {
        assessment.status = 'missing';
        return { assessment, issues: [scoreItemIssue('item-missing', fingerprint, assessment)] };
    }
    const variants = new Set(occurrences.map(({ item }) => canonical([
        Object.hasOwn(item, 'name'), item.name, Object.hasOwn(item, 'value'), item.value,
    ])));
    if (variants.size > 1) {
        assessment.status = 'conflicting';
        return { assessment, issues: [scoreItemIssue('item-conflict', fingerprint, assessment)] };
    }
    const common = occurrences[0].item;
    const labelMismatch = common.name !== target.label;
    const valueInvalid = !Number.isSafeInteger(common.value);
    if (labelMismatch) assessment.status = 'mislabeled';
    else if (valueInvalid) assessment.status = 'invalid';
    else {
        assessment.status = 'valid';
        assessment.value = common.value;
    }
    const issues = [];
    if (labelMismatch) issues.push(scoreItemIssue('item-label-mismatch', fingerprint, assessment));
    if (valueInvalid) issues.push(scoreItemIssue('item-value-invalid', fingerprint, assessment));
    return { assessment, issues };
}

function validateScoreFrames(value, fingerprint) {
    if (!Array.isArray(value)) {
        return { coverage: null, validation: {
            transport: 'complete', json: 'valid', metadata: 'not-applicable',
            frames: 'malformed', ui: 'unavailable',
            items: unavailableScoreItems(['frames-malformed']),
            issues: [scoreIssue('frames-malformed', fingerprint)],
        } };
    }
    const frames = [];
    const assessments = [];
    const frameIssues = [];
    const uiIssues = [];
    const itemIssues = [];
    const blockedBy = new Set();
    const uiStates = [];
    const uiVersions = new Set();
    if (!value.length) blockedBy.add('no-frames');
    for (const [frameIndex, frame] of value.entries()) {
        const validFrame = frame && typeof frame === 'object' && !Array.isArray(frame) &&
            nonnegativeInteger(frame.gameTime);
        if (!validFrame) {
            frames.push({ frameIndex, gameTime: null, valid: false });
            frameIssues.push(scoreIssue('frame-malformed', fingerprint,
                { frameIndex, gameTime: null }));
            blockedBy.add('frame-malformed');
            for (const target of scoreItemTargets) {
                assessments.push(blockedAssessment(frameIndex, null, target, 'frame-malformed'));
            }
            continue;
        }
        const { gameTime } = frame;
        frames.push({ frameIndex, gameTime, valid: true });
        if (Number.isSafeInteger(frame.ui?.version)) uiVersions.add(frame.ui.version);
        let reason = null;
        if (!frame.ui || typeof frame.ui !== 'object' || Array.isArray(frame.ui) ||
            !Number.isSafeInteger(frame.ui.version)) {
            reason = 'ui-unavailable';
            uiStates.push('unavailable');
        } else if (frame.ui.version !== 1) {
            reason = 'ui-unsupported';
            uiStates.push('unsupported');
        } else if (!Array.isArray(frame.ui.items)) {
            reason = 'ui-unavailable';
            uiStates.push('unavailable');
        } else {
            uiStates.push('supported');
        }
        if (reason) {
            blockedBy.add(reason);
            uiIssues.push(scoreIssue(reason, fingerprint, { frameIndex, gameTime }));
            for (const target of scoreItemTargets) {
                assessments.push(blockedAssessment(frameIndex, gameTime, target, reason));
            }
            continue;
        }
        for (const target of scoreItemTargets) {
            const result = assessScoreItem(frameIndex, gameTime, target, frame.ui.items, fingerprint);
            assessments.push(result.assessment);
            itemIssues.push(...result.issues);
        }
    }
    const validFrames = frames.filter(frame => frame.valid).length;
    const invalidFrames = frames.length - validFrames;
    const framesStatus = !frames.length || !validFrames ? 'malformed'
        : invalidFrames ? 'partial' : 'valid';
    let ui = 'unavailable';
    if (uiStates.length) {
        const distinct = new Set(uiStates);
        ui = distinct.size > 1 ? 'partial' : uiStates[0];
    }
    const counts = emptyScoreItemCounts();
    for (const assessment of assessments) counts[assessment.status]++;
    const items = { status: scoreItemsStatus(assessments), counts,
        blockedBy: [...blockedBy].sort(), assessments };
    if (!value.length) {
        frameIssues.push(scoreIssue('no-frames', fingerprint));
        items.status = 'unavailable';
    }
    return {
        coverage: {
            status: invalidFrames || !value.length ? 'partial' : 'complete',
            totalFrames: frames.length, validFrames, invalidFrames,
            localSegments: summarizeScoreSegments(frames),
            uiVersions: [...uiVersions].sort((a, b) => a - b),
        },
        validation: { transport: 'complete', json: 'valid', metadata: 'not-applicable',
            frames: framesStatus, ui, items,
            issues: [...frameIssues, ...uiIssues, ...itemIssues] },
    };
}

export function validateScoreBody(kind, body, responseFingerprint = sha256(body)) {
    let text;
    let value;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(body);
        value = JSON.parse(text);
    } catch {
        const metadata = kind === 'game-metadata';
        return { coverage: null, validation: {
            transport: 'complete', json: 'malformed',
            metadata: metadata ? 'unavailable' : 'not-applicable',
            frames: metadata ? 'not-applicable' : 'unavailable',
            ui: metadata ? 'not-applicable' : 'unavailable',
            items: metadata ? metadataScoreItems() : unavailableScoreItems(['json-malformed']),
            issues: [scoreIssue('json-malformed', responseFingerprint)],
        } };
    }
    return kind === 'game-metadata'
        ? validateScoreMetadata(value, responseFingerprint)
        : validateScoreFrames(value, responseFingerprint);
}

export function scoreSourceFingerprint(sourceKey, body) {
    return sha256(Buffer.concat([scoreFingerprintDomain, Buffer.from([0]), Buffer.from(sourceKey),
        Buffer.from([0]), Buffer.from(body)]));
}

function parseScoreHttpMetadata(stream0, key) {
    const text = stream0.toString('latin1');
    const statuses = [...text.matchAll(/HTTP\/1\.[01] ([0-9]{3})(?:[^\x00]*)\x00/g)];
    if (statuses.length !== 1) {
        return issue('unsupported', `Ambiguous HTTP response metadata for ${key}`);
    }
    if (statuses[0][1] !== '200') {
        return issue('unsupported', `Unsupported HTTP response for ${key}`);
    }
    const tokens = text.slice(statuses[0].index).split('\x00').slice(1);
    const headers = new Map();
    for (const token of tokens) {
        const match = token.match(/^([^:\s]+)\s*:\s*(.*)$/);
        if (!match) continue;
        const name = match[1].toLowerCase();
        const values = headers.get(name) ?? [];
        values.push(match[2].trim());
        headers.set(name, values);
    }
    const encodings = headers.get('content-encoding');
    if (!encodings?.length) return issue('incomplete', `Missing response encoding for ${key}`);
    const distinctEncodings = new Set(encodings.map(value => value.toLowerCase()));
    if (distinctEncodings.size !== 1) {
        return issue('unsupported', `Conflicting response encodings for ${key}`);
    }
    if (!distinctEncodings.has('gzip')) {
        return issue('unsupported', `Unsupported encoding ${encodings[0]} for ${key}`);
    }
    const lengths = headers.get('content-length') ?? [];
    if (lengths.some(value => !/^\d+$/.test(value)) || new Set(lengths).size > 1) {
        return issue('incomplete', `Conflicting response lengths for ${key}`);
    }
    return { kind: 'http-metadata', contentLength: lengths.length ? Number(lengths[0]) : null };
}

export function parseScoreCacheEntry(bytes) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(cacheMagic)) {
        return issue('unrelated', 'Not a supported cache frame');
    }
    const keyLength = bytes.readUInt32LE(12);
    if (keyLength === 0 || keyLength > 2048 || bytes.length < 24 + keyLength) {
        if (bytes.readUInt32LE(8) !== 5) return issue('unrelated', 'No replay-score request key');
        return issue('incomplete', 'Incomplete cache request key');
    }
    const key = bytes.subarray(24, 24 + keyLength).toString('utf8');
    const match = key.match(scoreKey);
    if (!match) return issue('unrelated', 'Not an Arena replay-score response');
    if (bytes.readUInt32LE(8) !== 5) return issue('unsupported', `Unsupported cache version for ${key}`);
    const requestedGameTime = match[3] === undefined ? null : Number(match[3]);
    if (requestedGameTime !== null && !nonnegativeInteger(requestedGameTime)) {
        return issue('unsupported', `Unsupported requested game time for ${key}`);
    }
    let streams;
    try { streams = parseSimpleCacheV5(bytes, keyLength); }
    catch (error) { return issue('incomplete', `${error.message} for ${key}`); }
    const http = parseScoreHttpMetadata(streams.stream0, key);
    if (http.kind !== 'http-metadata') return http;
    if (http.contentLength !== null && http.contentLength !== streams.stream1.length) {
        return issue('incomplete', `Declared payload length mismatch for ${key}`);
    }
    const length = streams.stream1.length;
    if (length < 1 || length > 50_000_000) {
        return issue('unsupported', `Unsupported payload length for ${key}`);
    }
    if (!streams.stream1.subarray(0, 3).equals(Buffer.from([0x1f, 0x8b, 0x08]))) {
        return issue('incomplete', `Invalid gzip header for ${key}`);
    }
    let body;
    try {
        const decoded = gunzipSync(streams.stream1,
            { maxOutputLength: 100_000_000, info: true });
        if (decoded.engine.bytesWritten !== length) {
            return issue('incomplete', `Declared payload length mismatch for ${key}`);
        }
        body = decoded.buffer;
    } catch (error) {
        return issue('incomplete', `Cannot decompress ${key}: ${error.message}`);
    }
    const responseFingerprint = sha256(body);
    const kind = match[3] === undefined ? 'game-metadata' : 'replay-frames';
    const summary = validateScoreBody(kind, body, responseFingerprint);
    return {
        kind: 'score-source', sourceKind: kind, replayId: match[2],
        requestedGameTime,
        key, requestUrl: match[1], body,
        cacheEntryFingerprint: sha256(bytes), responseFingerprint,
        fingerprint: scoreSourceFingerprint(key, body), ...summary,
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

function scoreManagedPath(root, name) {
    if (typeof name !== 'string' ||
        !/^replay-score-source-[a-f0-9]{24}-[a-f0-9]{12,64}(?:-\d+)?\.response$/.test(name)) {
        throw new Error('Unsafe managed replay-score filename');
    }
    return path.join(outputDirectory(root), name);
}

function mapPath(root, name) {
    if (typeof name !== 'string' ||
        !/^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/.test(name)) {
        throw new Error('Unsafe map filename');
    }
    return path.join(outputDirectory(root), name);
}

function readMapFile(root, name) {
    const file = mapPath(root, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe existing map file: ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
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
    if (!fs.existsSync(file)) return { version: 2, maps: [], replays: [], records: [] };
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.version === 1 && Array.isArray(manifest.records) && manifest.records.length === 0) {
        return { version: 2, maps: [], replays: [], records: [] };
    }
    if (manifest.version !== 2 || !Array.isArray(manifest.maps) ||
        !Array.isArray(manifest.replays) || !Array.isArray(manifest.records)) {
        throw new Error('Unsupported replay-log manifest; migrate nonempty version-1 data before importing');
    }
    if ((Object.hasOwn(manifest, 'scoreRecords') && !Array.isArray(manifest.scoreRecords)) ||
        (Object.hasOwn(manifest, 'retiredScoreSources') && !Array.isArray(manifest.retiredScoreSources))) {
        throw new Error('Invalid replay-score manifest collections');
    }
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

function validateSavedMap(map, checksum, file, allowMissingChecksum = false) {
    if (!validMap(mapPayload(map)) || mapChecksum(map) !== checksum ||
        (map.checksum !== checksum && !(allowMissingChecksum && !Object.hasOwn(map, 'checksum')))) {
        throw new Error(`Map schema or checksum mismatch: ${file}`);
    }
}

function validateRegisteredMap(root, registration, allowMissingChecksum = false) {
    if (registration?.status !== 'validated' || registration.id !== registration.checksum ||
        !/^[a-f0-9]{64}$/.test(registration.checksum)) throw new Error('Invalid map registration');
    const existing = readMapFile(root, registration.file);
    validateSavedMap(existing, registration.checksum, registration.file, allowMissingChecksum);
    return existing;
}

// Explicit, retry-safe migration. Never rewrite registrations or bless changed payloads.
export async function upgradeMapChecksums(root) {
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        return manifest.maps.map(registration => {
            try {
                const map = validateRegisteredMap(root, registration, true);
                const updated = !Object.hasOwn(map, 'checksum');
                if (updated) atomicReplace(mapPath(root, registration.file), savedMapContent(map));
                validateRegisteredMap(root, registration);
                return { file: registration.file, checksum: registration.checksum,
                    status: updated ? 'updated' : 'verified' };
            } catch (error) {
                return { file: registration?.file, status: 'error', message: error.message };
            }
        });
    });
}

function ensureMap(root, manifest, map) {
    if (!validMap(map)) throw new Error('Invalid captured map');
    const content = savedMapContent(map);
    const checksum = mapChecksum(map);
    const registered = manifest.maps.find(item => item.checksum === checksum);
    if (registered) {
        validateRegisteredMap(root, registered);
        return registered;
    }
    const directory = outputDirectory(root);
    let file = null;
    for (const name of fs.readdirSync(directory)) {
        if (!/^pain_and_gain_map_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{12,64})?\.json$/.test(name)) continue;
        const existing = readMapFile(root, name);
        if (validMap(mapPayload(existing)) && mapChecksum(existing) === checksum) {
            const registration = manifest.maps.find(item => item.file === name);
            if (registration) validateRegisteredMap(root, registration);
            // Recover an orphaned publication, including an older checksum-free map.
            // The verified incoming payload supplies its expected content identity.
            validateSavedMap(existing, checksum, name, true);
            if (!Object.hasOwn(existing, 'checksum')) atomicReplace(mapPath(root, name), content);
            file = name;
            break;
        }
    }
    if (!file) {
        const date = new Date().toISOString().replace(/:/g, '-').replace('.', '-');
        const base = `pain_and_gain_map_${date}`;
        const candidates = [`${base}.json`, `${base}-${checksum.slice(0, 12)}.json`, `${base}-${checksum}.json`];
        file = candidates.find(candidate => !pathOccupied(mapPath(root, candidate)));
        if (!file) throw new Error('No safe map filename available');
        const temporary = path.join(directory, `.${file}.${randomUUID()}.tmp`);
        const descriptor = fs.openSync(temporary, 'wx', 0o600);
        try {
            fs.writeFileSync(descriptor, content);
            fs.fsyncSync(descriptor);
        } finally {
            fs.closeSync(descriptor);
        }
        try { fs.linkSync(temporary, mapPath(root, file)); } finally { fs.unlinkSync(temporary); }
    }
    const registration = { id: checksum, checksum, file, status: 'validated', registeredAt: new Date().toISOString() };
    validateRegisteredMap(root, registration);
    manifest.maps.push(registration);
    return registration;
}

function activeReplayMap(root, manifest, replayId) {
    const association = manifest.replays.find(item => item.replayId === replayId && item.status === 'active');
    if (!association) return null;
    const registration = manifest.maps.find(item => item.id === association.mapId);
    if (!registration) throw new Error(`Missing registered map for replay ${replayId}`);
    validateRegisteredMap(root, registration);
    return { association, registration };
}

function associateReplay(manifest, replayId, registration) {
    const existing = manifest.replays.find(item => item.replayId === replayId);
    if (existing) {
        if (existing.mapId !== registration.id) throw new Error(`Conflicting maps for replay ${replayId}`);
        if (existing.status !== 'active') throw new Error(`Map is not active for replay ${replayId}`);
        return existing;
    }
    const association = { replayId, mapId: registration.id, status: 'active',
        associatedAt: new Date().toISOString(), retiredFingerprints: [] };
    manifest.replays.push(association);
    return association;
}

function associateBuildId(association, buildId) {
    if (buildId === null) return false; // Legacy response: provenance remains unknown.
    if (association.buildId && association.buildId !== buildId) {
        throw new Error(`Conflicting build IDs for replay ${association.replayId}: ${association.buildId} versus ${buildId}`);
    }
    if (association.buildId) return false;
    association.buildId = buildId;
    return true;
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

function migrateWaitingRecords(root, manifest) {
    let migrated = 0;
    for (const record of manifest.records) {
        if (record.status === 'waiting') {
            record.status = 'claim';
            migrated++;
        }
    }
    if (migrated) saveManifest(root, manifest);
    return migrated;
}

export async function migrateReviewStatuses(root) {
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        return migrateWaitingRecords(root, manifest);
    });
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

function scoreCollections(manifest, create = false) {
    if (create) {
        manifest.scoreRecords ??= [];
        manifest.retiredScoreSources ??= [];
    }
    return {
        records: manifest.scoreRecords ?? [],
        tombstones: manifest.retiredScoreSources ?? [],
    };
}

function scoreTombstone(replayId, fingerprint) {
    return { sourceType: 'replay-score-source', replayId, fingerprint };
}

function sameScoreTombstone(item, replayId, fingerprint) {
    return item?.sourceType === 'replay-score-source' && item.replayId === replayId &&
        item.fingerprint === fingerprint;
}

function scoreMapId(manifest, replayId) {
    const association = manifest.replays.find(item => item.replayId === replayId && item.status === 'active');
    if (!association) return null;
    const registration = manifest.maps.find(item => item.id === association.mapId &&
        item.status === 'validated');
    return registration ? association.mapId : null;
}

function chooseScoreOutputName(root, manifest, replayId, fingerprint, responseFingerprint) {
    const reserved = new Set((manifest.scoreRecords ?? []).map(record => record.outputPath).filter(Boolean));
    const prefix = `replay-score-source-${replayId}-`;
    const candidates = [`${prefix}${fingerprint.slice(0, 12)}.response`,
        `${prefix}${fingerprint}.response`];
    for (let suffix = 2; suffix < 100; suffix++) {
        candidates.push(`${prefix}${fingerprint}-${suffix}.response`);
    }
    for (const name of candidates) {
        if (reserved.has(name)) continue;
        const file = scoreManagedPath(root, name);
        const existing = pathOccupied(file);
        if (!existing) return name;
        if (existing.isFile() && !existing.isSymbolicLink() &&
            sha256(fs.readFileSync(file)) === responseFingerprint) return name;
    }
    return null;
}

function validateScoreOutputOwnership(root, manifest, record) {
    if (!/^[a-f0-9]{24}$/.test(record?.replayId ?? '') || !validSha256(record?.fingerprint)) {
        throw new Error('Invalid replay-score output identity');
    }
    const prefix = `replay-score-source-${record.replayId}-`;
    const suffix = record.outputPath?.startsWith(prefix) ? record.outputPath.slice(prefix.length) : '';
    if (suffix !== `${record.fingerprint.slice(0, 12)}.response` &&
        suffix !== `${record.fingerprint}.response` &&
        !new RegExp(`^${record.fingerprint}-[2-9]\\d*\\.response$`).test(suffix)) {
        throw new Error('Replay-score output path does not match record identity');
    }
    const owners = (manifest.scoreRecords ?? []).filter(item => item.outputPath === record.outputPath);
    if (owners.length !== 1 || owners[0] !== record) {
        throw new Error('Replay-score output path does not have unique record ownership');
    }
    return scoreManagedPath(root, record.outputPath);
}

function verifyScoreOutput(root, record, body) {
    const target = scoreManagedPath(root, record.outputPath);
    const expected = sha256(body);
    if (expected !== record.responseFingerprint || expected !== record.outputFingerprint) {
        throw new Error('Manifest replay-score output fingerprint mismatch');
    }
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== body.length ||
        sha256(fs.readFileSync(target)) !== expected) {
        throw new Error(`Managed replay-score output failed final verification: ${target}`);
    }
    return target;
}

function ensureScoreOutput(root, record, body, { afterPublish } = {}) {
    const target = scoreManagedPath(root, record.outputPath);
    const existing = pathOccupied(target);
    if (existing) {
        try { return verifyScoreOutput(root, record, body); }
        catch { throw new Error(`Managed replay-score output differs from source: ${target}`); }
    }
    const temporary = path.join(outputDirectory(root), `.${record.outputPath}.${randomUUID()}.tmp`);
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, body);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    try { fs.linkSync(temporary, target); } finally { fs.unlinkSync(temporary); }
    afterPublish?.(target);
    return verifyScoreOutput(root, record, body);
}

function validateScoreRecordIdentity(root, manifest, record, parsed) {
    if (record?.formatVersion !== 1 || record.kind !== parsed.sourceKind ||
        record.replayId !== parsed.replayId || record.requestedGameTime !== parsed.requestedGameTime ||
        record.sourceKey !== parsed.key || record.requestUrl !== parsed.requestUrl ||
        record.responseFingerprint !== parsed.responseFingerprint ||
        record.fingerprint !== parsed.fingerprint || record.outputFingerprint !== parsed.responseFingerprint ||
        record.embeddedBuildId !== null) {
        throw new Error('Conflicting replay-score record identity');
    }
    validateScoreOutputOwnership(root, manifest, record);
}

export async function importScoreCacheFile(root, sourceFile, options = {}) {
    const source = path.resolve(sourceFile);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe replay-score cache source: ${source}`);
    const parsed = parseScoreCacheEntry(fs.readFileSync(source));
    if (parsed.kind !== 'score-source') return parsed;
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        const collections = scoreCollections(manifest, true);
        if (collections.tombstones.some(item =>
            sameScoreTombstone(item, parsed.replayId, parsed.fingerprint))) {
            return { kind: 'deduplicated', replayId: parsed.replayId,
                fingerprint: parsed.fingerprint, retired: true };
        }
        let record = collections.records.find(item => item.replayId === parsed.replayId &&
            item.fingerprint === parsed.fingerprint);
        if (record) {
            validateScoreRecordIdentity(root, manifest, record, parsed);
            if (!scoreCoverageMatches(record.coverage, parsed.coverage) ||
                canonical(record.validation) !== canonical(parsed.validation)) {
                throw new Error('Conflicting stored replay-score derived summary');
            }
            if (!['pending', 'claim', 'done', 'retiring'].includes(record.status)) {
                throw new Error(`Unsupported replay-score record status: ${record.status}`);
            }
            if (record.status === 'retiring') {
                throw new Error('Replay-score source is retiring; retry exact score cleanup');
            }
            const target = scoreManagedPath(root, record.outputPath);
            const existing = pathOccupied(target);
            if (record.status === 'claim' && !existing) {
                throw new Error('Managed replay-score source is missing after publication');
            }
            if (['pending', 'done'].includes(record.status) || existing) {
                ensureScoreOutput(root, record, parsed.body, options);
            }
            if (record.status === 'pending') {
                record.status = 'claim';
                saveManifest(root, manifest);
            }
            return { kind: 'deduplicated', record };
        }
        const outputPath = chooseScoreOutputName(root, manifest, parsed.replayId,
            parsed.fingerprint, parsed.responseFingerprint);
        if (!outputPath) throw new Error(`No safe replay-score output filename for ${parsed.replayId}`);
        record = {
            formatVersion: 1, kind: parsed.sourceKind, replayId: parsed.replayId,
            requestedGameTime: parsed.requestedGameTime, sourceEntry: source,
            sourceKey: parsed.key, requestUrl: parsed.requestUrl,
            cacheEntryFingerprint: parsed.cacheEntryFingerprint,
            responseFingerprint: parsed.responseFingerprint, fingerprint: parsed.fingerprint,
            outputPath, outputFingerprint: parsed.responseFingerprint,
            embeddedBuildId: null, mapId: scoreMapId(manifest, parsed.replayId),
            coverage: parsed.coverage, validation: parsed.validation,
            importedAt: new Date().toISOString(), status: 'pending', reviews: {},
        };
        collections.records.push(record);
        saveManifest(root, manifest);
        validateScoreOutputOwnership(root, manifest, record);
        ensureScoreOutput(root, record, parsed.body, options);
        record.status = 'claim';
        saveManifest(root, manifest);
        return { kind: 'imported', record };
    });
}

export function verifyScoreSource(root, replayId, fingerprint) {
    if (!/^[a-f0-9]{24}$/.test(replayId) || !validSha256(fingerprint)) {
        throw new Error('Expected replay ID and full replay-score fingerprint');
    }
    const manifest = readManifest(root);
    const record = (manifest.scoreRecords ?? []).find(item => item.replayId === replayId &&
        item.fingerprint === fingerprint);
    if (!record) throw new Error('Managed replay-score source not found');
    const file = validateScoreOutputOwnership(root, manifest, record);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe managed replay-score source');
    const body = fs.readFileSync(file);
    const responseFingerprint = sha256(body);
    if (responseFingerprint !== record.responseFingerprint ||
        responseFingerprint !== record.outputFingerprint ||
        scoreSourceFingerprint(record.sourceKey, body) !== record.fingerprint) {
        throw new Error('Managed replay-score source hash mismatch');
    }
    const summary = validateScoreBody(record.kind, body, responseFingerprint);
    if (!scoreCoverageMatches(record.coverage, summary.coverage) ||
        canonical(summary.validation) !== canonical(record.validation)) {
        throw new Error('Managed replay-score derived summary mismatch');
    }
    return { record, bytes: body.length, responseFingerprint, verified: true };
}

export async function updateScoreReview(root, action, replayId, fingerprint, taskId) {
    if (!['claim', 'examined', 'complete', 'done'].includes(action)) {
        throw new Error(`Unknown replay-score review action: ${action}`);
    }
    validateTaskId(taskId);
    if (!/^[a-f0-9]{24}$/.test(replayId) || !validSha256(fingerprint)) {
        throw new Error('Expected replay ID and full replay-score fingerprint');
    }
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        const { records, tombstones } = scoreCollections(manifest);
        const record = records.find(item => item.replayId === replayId && item.fingerprint === fingerprint);
        if (!record) {
            const retired = tombstones.some(item => sameScoreTombstone(item, replayId, fingerprint));
            throw new Error(retired ? 'Replay-score source was already retired' :
                'Managed replay-score source not found');
        }
        if (record.status === 'done') {
            if (['complete', 'done'].includes(action)) return record;
            throw new Error('Replay-score review is already done');
        }
        if (record.status !== 'claim') {
            throw new Error(`Replay-score source is not ready for review: ${record.status}`);
        }
        const now = new Date().toISOString();
        if (action === 'claim') {
            if (!Object.hasOwn(record.reviews, taskId)) {
                record.reviews[taskId] = { claimedAt: now, examinedAt: null, completedAt: null };
            }
        } else {
            if (!Object.hasOwn(record.reviews, taskId)) {
                throw new Error(`Task ${taskId} has not claimed this replay-score source`);
            }
            const review = record.reviews[taskId];
            if (action === 'examined') review.examinedAt ??= now;
            else {
                if (!review.examinedAt) throw new Error('Replay-score source examination before completion');
                review.completedAt ??= now;
                if (Object.values(record.reviews).every(item => item.examinedAt && item.completedAt)) {
                    record.status = 'done';
                }
            }
        }
        saveManifest(root, manifest);
        return record;
    });
}

export async function cleanupScoreSource(root, replayId, fingerprint,
    { deleteFile = file => fs.unlinkSync(file) } = {}) {
    if (!/^[a-f0-9]{24}$/.test(replayId) || !validSha256(fingerprint)) {
        throw new Error('Expected replay ID and full replay-score fingerprint');
    }
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        const collections = scoreCollections(manifest, true);
        const tombstone = collections.tombstones.find(item =>
            sameScoreTombstone(item, replayId, fingerprint));
        const record = collections.records.find(item => item.replayId === replayId &&
            item.fingerprint === fingerprint);
        if (tombstone && record) throw new Error('Replay-score tombstone conflicts with current record');
        if (tombstone) return { kind: 'already-retired', replayId, fingerprint };
        if (!record) throw new Error('Managed replay-score source not found');
        const file = validateScoreOutputOwnership(root, manifest, record);
        const reviews = Object.values(record.reviews ?? {});
        if (!reviews.length || reviews.some(review => !review.examinedAt || !review.completedAt)) {
            throw new Error('Replay-score source lacks completed analysis');
        }
        if (!['done', 'retiring'].includes(record.status)) {
            throw new Error(`Replay-score source is not ready for cleanup: ${record.status}`);
        }
        let existing = pathOccupied(file);
        if (record.status === 'done') {
            if (!existing) throw new Error('Done replay-score source is missing before retirement intent');
            if (!existing.isFile() || existing.isSymbolicLink() ||
                sha256(fs.readFileSync(file)) !== record.outputFingerprint) {
                throw new Error(`Refusing to retire changed or unsafe replay-score source: ${file}`);
            }
            record.status = 'retiring';
            saveManifest(root, manifest);
        }
        existing = pathOccupied(file);
        if (existing) {
            if (!existing.isFile() || existing.isSymbolicLink() ||
                sha256(fs.readFileSync(file)) !== record.outputFingerprint) {
                throw new Error(`Refusing to delete changed or unsafe replay-score source: ${file}`);
            }
            deleteFile(file);
        }
        collections.tombstones.push(scoreTombstone(replayId, fingerprint));
        collections.tombstones.sort((a, b) => canonical(a).localeCompare(canonical(b)));
        collections.records.splice(collections.records.indexOf(record), 1);
        saveManifest(root, manifest);
        return { kind: 'retired', replayId, fingerprint };
    });
}

function hasManagedOutput(record) {
    const noPath = record.outputPath === null;
    const noFingerprint = record.outputFingerprint === null;
    if (noPath || noFingerprint) {
        if (!noPath || !noFingerprint) throw new Error('Invalid evidence-only output metadata');
        return false;
    }
    if (typeof record.outputPath !== 'string' || !validSha256(record.outputFingerprint)) {
        throw new Error('Invalid managed output metadata');
    }
    return true;
}

const hasRetainedDiagnostics = parsed =>
    parsed.otherEntries.some(entry => retainedDiagnosticTypes.includes(entry.type));

export async function importCacheFile(root, sourceFile) {
    const parsed = parseCacheEntry(fs.readFileSync(sourceFile));
    if (parsed.kind !== 'log') return parsed;
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        migrateWaitingRecords(root, manifest);
        let active = activeReplayMap(root, manifest, parsed.replayId);
        if (parsed.map && active && mapChecksum(parsed.map) !== active.registration.checksum) {
            throw new Error(`Conflicting maps for replay ${parsed.replayId}`);
        }
        if (parsed.map && !active) {
            if (manifest.replays.some(item => item.replayId === parsed.replayId && item.status !== 'active')) {
                throw new Error(`Map is not active for replay ${parsed.replayId}`);
            }
            const registration = ensureMap(root, manifest, parsed.map);
            associateReplay(manifest, parsed.replayId, registration);
            saveManifest(root, manifest);
            active = activeReplayMap(root, manifest, parsed.replayId);
        }
        if (!active) return { kind: 'deferred', replayId: parsed.replayId,
            fingerprint: parsed.fingerprint, coverage: parsed.coverage,
            diagnosticCoverage: parsed.diagnosticCoverage,
            message: 'No validated active map for replay; no record created' };
        if (associateBuildId(active.association, parsed.buildId)) saveManifest(root, manifest);
        if (active.association.retiredFingerprints.includes(parsed.fingerprint)) {
            return { kind: 'deduplicated', replayId: parsed.replayId, fingerprint: parsed.fingerprint };
        }
        let record = manifest.records.find(item => item.replayId === parsed.replayId && item.fingerprint === parsed.fingerprint);
        if (record) {
            if (record.mapId !== active.registration.id || record.mapFile !== active.registration.file) {
                throw new Error(`Log/map association mismatch for replay ${parsed.replayId}`);
            }
            const managedOutput = hasManagedOutput(record);
            if (!managedOutput && record.status === 'pending') {
                record.status = 'claim';
                saveManifest(root, manifest);
            } else if (managedOutput && (record.status === 'pending' ||
                (record.status === 'claim' && !pathOccupied(managedPath(root, record.outputPath))))) {
                ensureOutput(root, record, parsed.gameState);
                record.status = 'claim';
                saveManifest(root, manifest);
            } else if (managedOutput && record.status === 'claim') {
                ensureOutput(root, record, parsed.gameState);
            }
            return { kind: 'deduplicated', record };
        }
        const evidenceOnly = !parsed.gameState.length && hasRetainedDiagnostics(parsed);
        if (!parsed.gameState.length && !evidenceOnly) return { kind: 'mapped', replayId: parsed.replayId,
            mapId: active.registration.id, mapFile: active.registration.file,
            otherEntries: parsed.otherEntries };
        const outputPath = evidenceOnly ? null
            : chooseOutputName(root, manifest, parsed.replayId, parsed.fingerprint);
        if (!evidenceOnly && !outputPath) throw new Error(`No safe output filename for ${parsed.replayId}`);
        const content = evidenceOnly ? null : `${parsed.gameState.join('\n')}\n`;
        record = {
            replayId: parsed.replayId, requestedTick: parsed.requestedTick, sourceEntry: sourceFile,
            sourceKey: parsed.key, fingerprint: parsed.fingerprint, outputPath,
            outputFingerprint: content === null ? null : sha256(content), mapId: active.registration.id,
            mapChecksum: active.registration.checksum, mapFile: active.registration.file,
            buildId: parsed.buildId,
            importedAt: new Date().toISOString(), status: evidenceOnly ? 'claim' : 'pending',
            coverage: parsed.coverage, diagnosticCoverage: parsed.diagnosticCoverage,
            otherEntries: parsed.otherEntries, reviews: {},
        };
        manifest.records.push(record);
        saveManifest(root, manifest);
        if (!evidenceOnly) {
            ensureOutput(root, record, parsed.gameState);
            record.status = 'claim';
            saveManifest(root, manifest);
        }
        return { kind: 'imported', record };
    });
}

// Adopt an explicitly identified local capture only for a replay already linked to a validated map.
// JSONL has no replay ID of its own, so the caller must verify its provenance independently.
export async function registerLocalFile(root, replayId, name) {
    if (!/^[a-f0-9]{24}$/.test(replayId)) throw new Error('Expected a verified replay ID');
    const file = managedPath(root, name);
    if (name !== `${replayId}.jsonl` && !name.startsWith(`${replayId}-`)) {
        throw new Error('Local log filename does not match the supplied replay ID');
    }
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        migrateWaitingRecords(root, manifest);
        const active = activeReplayMap(root, manifest, replayId);
        if (!active) throw new Error(`No validated active map for replay ${replayId}`);
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe local log file: ${file}`);
        const bytes = fs.readFileSync(file);
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (!content.endsWith('\n')) throw new Error('Local JSONL must end with a newline');
        const lines = content.slice(0, -1).split('\n');
        const expectedFlags = mapPayload(validateRegisteredMap(root, active.registration)).objects
            .filter(object => object.type === 'ScoreFlag')
            .map(({ id, x, y, effectType, scorePerTick }) => ({ id, x, y, effectType, scorePerTick }))
            .sort((a, b) => a.id.localeCompare(b.id));
        if (!expectedFlags.length) throw new Error('Associated map has no ScoreFlags');
        const ticks = [];
        let buildId;
        for (const [index, line] of lines.entries()) {
            let entry;
            try { entry = JSON.parse(line); }
            catch { throw new Error(`Invalid JSONL line ${index + 1}`); }
            if (entry?.type !== 'game-state' || entry.phase !== 'before-actions' ||
                !Number.isSafeInteger(entry.tick) || !Array.isArray(entry.creeps) || !Array.isArray(entry.flags)) {
                throw new Error(`Invalid game-state line ${index + 1}`);
            }
            buildId = consistentBuildId(buildId, entryBuildId(entry, `line ${index + 1}`), 'local JSONL');
            const flags = entry.flags.map(({ id, x, y, effectType, scorePerTick }) =>
                ({ id, x, y, effectType, scorePerTick })).sort((a, b) => a.id.localeCompare(b.id));
            if (canonical(flags) !== canonical(expectedFlags)) {
                throw new Error(`Log flags do not match the associated map at line ${index + 1}`);
            }
            ticks.push(entry.tick);
        }
        const fingerprint = sha256(`manual-jsonl:${replayId}\n${content}`);
        if (associateBuildId(active.association, buildId ?? null)) saveManifest(root, manifest);
        if (active.association.retiredFingerprints.includes(fingerprint)) {
            return { kind: 'deduplicated', replayId, fingerprint };
        }
        const existing = manifest.records.find(record => record.replayId === replayId && record.fingerprint === fingerprint);
        if (existing) return { kind: 'deduplicated', record: existing };
        if (manifest.records.some(record => record.outputPath === name)) {
            throw new Error('Local log filename is already managed for different content');
        }
        const counts = new Map();
        for (const tick of ticks) counts.set(tick, (counts.get(tick) ?? 0) + 1);
        const firstTick = Math.min(...ticks);
        const lastTick = Math.max(...ticks);
        const gaps = [];
        for (let tick = firstTick; tick <= lastTick; tick++) if (!counts.has(tick)) gaps.push(tick);
        const record = {
            replayId, requestedTick: null, sourceEntry: `replay_logs/${name}`,
            sourceKey: 'manual-jsonl', fingerprint, outputPath: name,
            outputFingerprint: sha256(bytes), mapId: active.registration.id,
            mapChecksum: active.registration.checksum, mapFile: active.registration.file,
            buildId: buildId ?? null,
            importedAt: new Date().toISOString(), status: 'claim',
            coverage: { count: ticks.length, firstTick, lastTick,
                duplicates: [...counts].filter(([, n]) => n > 1).map(([tick]) => tick), gaps },
            diagnosticCoverage: summarizeDiagnosticCoverage(lines, []), otherEntries: [], reviews: {},
        };
        manifest.records.push(record);
        saveManifest(root, manifest);
        return { kind: 'registered', record };
    });
}

export async function scanCache(root, cacheDir, seen = null, onResult = null) {
    const results = [];
    const report = result => { results.push(result); onResult?.(result); };
    const deferred = [];
    let mapMayHaveArrived = false;
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
        if (previous?.signature === signature && (previous.finished ||
            (['incomplete', 'error'].includes(previous.kind) && previous.attempts >= 5))) continue;
        let result;
        try { result = await importCacheFile(root, file); } catch (error) { result = issue('error', `${file}: ${error.message}`); }
        if (seen) seen.set(file, {
            signature, attempts: previous?.signature === signature ? previous.attempts + 1 : 1,
            kind: result.kind, finished: !['incomplete', 'error', 'deferred'].includes(result.kind),
        });
        if (result.kind === 'deferred') deferred.push({ file, signature, result });
        else if (result.kind !== 'unrelated' && result.kind !== 'deduplicated') {
            report({ source: file, ...result });
            if (['mapped', 'imported'].includes(result.kind)) mapMayHaveArrived = true;
        }
    }
    for (const item of deferred) {
        let result = item.result;
        if (mapMayHaveArrived) {
            try { result = await importCacheFile(root, item.file); }
            catch (error) { result = issue('error', `${item.file}: ${error.message}`); }
            if (seen) seen.set(item.file, { signature: item.signature, attempts: 1,
                kind: result.kind, finished: !['incomplete', 'error', 'deferred'].includes(result.kind) });
        }
        if (result.kind !== 'deduplicated') report({ source: item.file, ...result });
    }
    return results;
}

function validateTaskId(taskId) {
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(taskId)) {
        throw new Error('Task ID must be 1–200 safe characters');
    }
}

function cleanup(root, manifest, record) {
    if (record.status !== 'done') return;
    const reviews = Object.values(record.reviews ?? {});
    if (!reviews.length || reviews.some(review => !review.examinedAt || !review.completedAt)) {
        throw new Error(`Done log lacks completed analysis for ${record.replayId}`);
    }
    const association = manifest.replays.find(item => item.replayId === record.replayId && item.mapId === record.mapId);
    if (!association) throw new Error(`Missing replay/map association for ${record.replayId}`);
    if (hasManagedOutput(record)) {
        const file = managedPath(root, record.outputPath);
        const existing = pathOccupied(file);
        if (existing) {
            if (!existing.isFile() || existing.isSymbolicLink() ||
                sha256(fs.readFileSync(file)) !== record.outputFingerprint) {
                throw new Error(`Refusing to delete changed or unsafe output: ${file}`);
            }
            fs.unlinkSync(file);
        }
    }
    association.retiredFingerprints ??= [];
    if (!association.retiredFingerprints.includes(record.fingerprint)) association.retiredFingerprints.push(record.fingerprint);
    manifest.records.splice(manifest.records.indexOf(record), 1);
    saveManifest(root, manifest);
}

export async function updateReview(root, action, replayId, fingerprint, taskId) {
    if (!['claim', 'examined', 'complete', 'done'].includes(action)) throw new Error(`Unknown review action: ${action}`);
    validateTaskId(taskId);
    if (!/^[a-f0-9]{24}$/.test(replayId)) throw new Error('Expected a verified replay ID');
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Expected a full SHA-256 fingerprint');
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        migrateWaitingRecords(root, manifest);
        const record = manifest.records.find(item => item.replayId === replayId && item.fingerprint === fingerprint);
        if (!record) {
            const retired = manifest.replays.find(item => item.replayId === replayId)?.retiredFingerprints?.includes(fingerprint);
            if (retired && ['complete', 'done'].includes(action)) return { replayId, fingerprint, status: 'done' };
            throw new Error(retired ? 'Log was already analyzed and removed' : 'Imported game-state log not found');
        }
        if (record.status === 'done') {
            if (!['complete', 'done'].includes(action)) throw new Error('Log analysis is already done');
            cleanup(root, manifest, record);
            return record;
        }
        if (record.status !== 'claim') throw new Error(`Log is not ready for analysis: ${record.status}`);
        const now = new Date().toISOString();
        if (action === 'claim') {
            if (!Object.hasOwn(record.reviews, taskId)) {
                record.reviews[taskId] = { claimedAt: now, examinedAt: null, completedAt: null };
            }
        } else {
            if (!Object.hasOwn(record.reviews, taskId)) throw new Error(`Task ${taskId} has not claimed this log`);
            const review = record.reviews[taskId];
            if (action === 'examined') review.examinedAt ??= now;
            else if (['complete', 'done'].includes(action)) {
                if (!review.examinedAt) throw new Error('Record examination before completion');
                review.completedAt ??= now;
                const reviews = Object.values(record.reviews);
                if (reviews.every(item => item.examinedAt && item.completedAt)) record.status = 'done';
            }
        }
        saveManifest(root, manifest);
        cleanup(root, manifest, record);
        return record;
    });
}

export async function reconcileCleanup(root) {
    return withManifestLock(root, () => {
        const manifest = readManifest(root);
        migrateWaitingRecords(root, manifest);
        for (const record of [...manifest.records]) cleanup(root, manifest, record);
        return manifest;
    });
}

async function main() {
    const [command, ...args] = process.argv.slice(2);
    const root = projectRoot;
    if (command === 'score-import') {
        if (args.length !== 1) throw new Error('Usage: score-import <cache-file>');
        const result = await importScoreCacheFile(root, args[0]);
        if (result.record) console.log(JSON.stringify({ event: result.kind,
            kind: result.record.kind, replayId: result.record.replayId,
            requestedGameTime: result.record.requestedGameTime,
            fingerprint: result.record.fingerprint,
            responseFingerprint: result.record.responseFingerprint,
            outputPath: result.record.outputPath, mapId: result.record.mapId,
            status: result.record.status, coverage: result.record.coverage,
            validation: result.record.validation }));
        else console.log(JSON.stringify(result));
    } else if (command === 'score-verify') {
        if (args.length !== 2) throw new Error('Usage: score-verify <replay-id> <fingerprint>');
        const result = verifyScoreSource(root, args[0], args[1]);
        console.log(JSON.stringify({ replayId: result.record.replayId,
            fingerprint: result.record.fingerprint, responseFingerprint: result.responseFingerprint,
            outputPath: result.record.outputPath, bytes: result.bytes,
            status: result.record.status, coverage: result.record.coverage,
            validation: result.record.validation, verified: result.verified }));
    } else if (['score-claim', 'score-examined', 'score-done'].includes(command)) {
        if (args.length !== 3) throw new Error(`Usage: ${command} <replay-id> <fingerprint> <task-id>`);
        const action = command.slice('score-'.length);
        const record = await updateScoreReview(root, action, args[0], args[1], args[2]);
        console.log(JSON.stringify({ replayId: record.replayId, fingerprint: record.fingerprint,
            status: record.status, outputPath: record.outputPath, reviews: record.reviews }));
    } else if (command === 'score-cleanup') {
        if (args.length !== 2) throw new Error('Usage: score-cleanup <replay-id> <fingerprint>');
        console.log(JSON.stringify(await cleanupScoreSource(root, args[0], args[1])));
    } else if (command === 'scan' || command === 'watch') {
        const cacheDir = args[0] ? path.resolve(args[0]) : defaultCacheDir;
        if (command === 'watch') console.log(`Starting replay-log watch: ${cacheDir} (initial reconciliation/scan in progress; Ctrl-C to stop)`);
        await reconcileCleanup(root);
        const seen = new Map();
        const poll = () => scanCache(root, cacheDir, seen, result => {
            if (result.record) console.log(JSON.stringify({ event: result.kind, replayId: result.record.replayId, fingerprint: result.record.fingerprint, outputPath: result.record.outputPath, mapId: result.record.mapId, mapFile: result.record.mapFile, buildId: result.record.buildId ?? null, status: result.record.status, coverage: result.record.coverage, diagnosticCoverage: result.record.diagnosticCoverage, otherEntries: result.record.otherEntries.length }));
            else if (['mapped', 'deferred'].includes(result.kind)) console.log(JSON.stringify({ event: result.kind, replayId: result.replayId, mapId: result.mapId, mapFile: result.mapFile, coverage: result.coverage, diagnosticCoverage: result.diagnosticCoverage, message: result.message }));
            else console.error(JSON.stringify({ event: result.kind, source: result.source, message: result.message }));
        });
        const initial = await poll();
        if (command === 'watch') {
            console.log(`Watching ${cacheDir} (initial scan complete: ${initial.length} reportable events; polling every 2 seconds; idle polls are silent; Ctrl-C to stop)`);
            while (true) { await sleep(2000); await poll(); }
        }
    } else if (command === 'list') {
        const manifest = await reconcileCleanup(root);
        for (const record of manifest.records) console.log(JSON.stringify({ replayId: record.replayId, fingerprint: record.fingerprint, outputPath: record.outputPath, mapId: record.mapId, mapFile: record.mapFile, buildId: record.buildId ?? null, status: record.status, coverage: record.coverage, diagnosticCoverage: record.diagnosticCoverage ?? null, reviews: record.reviews, otherEntries: record.otherEntries.length }));
    } else if (command === 'migrate-status') {
        console.log(JSON.stringify({ migrated: await migrateReviewStatuses(root) }));
    } else if (command === 'register-local') {
        if (args.length !== 2) throw new Error('Usage: register-local <replay-id> <jsonl-filename>');
        const result = await registerLocalFile(root, args[0], args[1]);
        console.log(JSON.stringify({ event: result.kind, replayId: result.record?.replayId ?? result.replayId,
            fingerprint: result.record?.fingerprint ?? result.fingerprint,
            outputPath: result.record?.outputPath, status: result.record?.status }));
    } else if (command === 'upgrade-map-checksums') {
        const results = await upgradeMapChecksums(root);
        for (const result of results) console.log(JSON.stringify(result));
        if (results.some(result => result.status === 'error')) process.exitCode = 1;
    } else if (command === 'maps') {
        const manifest = readManifest(root);
        for (const registration of manifest.maps) {
            validateRegisteredMap(root, registration);
            console.log(JSON.stringify({ ...registration, activeReplays: manifest.replays.filter(item => item.mapId === registration.id && item.status === 'active').map(item => item.replayId) }));
        }
    } else if (command === 'other') {
        if (args.length !== 2 || !/^[a-f0-9]{24}$/.test(args[0]) || !/^[a-f0-9]{64}$/.test(args[1])) throw new Error('Usage: other <replay-id> <fingerprint>');
        const record = readManifest(root).records.find(item => item.replayId === args[0] && item.fingerprint === args[1]);
        if (!record) throw new Error('Replay-log response not found');
        for (const entry of record.otherEntries) console.log(JSON.stringify(entry));
    } else if (['claim', 'examined', 'complete', 'done'].includes(command)) {
        if (args.length !== 3) throw new Error(`Usage: ${command} <replay-id> <fingerprint> <task-id>`);
        const record = await updateReview(root, command, args[0], args[1], args[2]);
        console.log(JSON.stringify({ replayId: record.replayId, fingerprint: record.fingerprint, status: record.status, outputPath: record.outputPath, reviews: record.reviews }));
    } else {
        throw new Error('Usage: node tools/replay-logs.js <score-import cache-file|score-verify replay-id fingerprint|score-claim replay-id fingerprint task-id|score-examined replay-id fingerprint task-id|score-done replay-id fingerprint task-id|score-cleanup replay-id fingerprint|scan [cache-dir]|watch [cache-dir]|list|maps|migrate-status|register-local replay-id jsonl-filename|upgrade-map-checksums|other replay-id fingerprint|claim replay-id fingerprint task-id|examined replay-id fingerprint task-id|done replay-id fingerprint task-id>');
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

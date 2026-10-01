import fs from 'node:fs';
import path from 'node:path';
import {
    canonical,
    scoreCoverageMatches,
    scoreSourceFingerprint,
    sha256,
    validateScoreBody,
    validBuildId,
} from './replay-logs.js';

const fingerprintPattern = /^[a-f0-9]{64}$/;
const replayIdPattern = /^[a-f0-9]{24}$/;
const scoreSourceKeyPattern = /^1\/0\/(https:\/\/arena\.screeps\.com\/api\/game\/([a-f0-9]{24})(?:\/replay\/(0|[1-9]\d*))?)$/;
const slotNames = ['player1', 'player2'];
const measurements = ['cumulativeScore', 'displayedGain'];
const localSegmentDomain = Buffer.from('replay-score-local-segment-v1');
const overlapDomain = Buffer.from('replay-score-overlap-v1');
const groupDomain = Buffer.from('replay-score-group-v1');

const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

function hashParts(domain, ...parts) {
    const buffers = [domain];
    for (const part of parts) buffers.push(Buffer.from([0]), Buffer.from(String(part)));
    return sha256(Buffer.concat(buffers));
}

function scoreOutputNameMatches(record) {
    const prefix = `replay-score-source-${record.replayId}-`;
    if (typeof record.outputPath !== 'string' || !record.outputPath.startsWith(prefix)) return false;
    const suffix = record.outputPath.slice(prefix.length);
    return suffix === `${record.fingerprint.slice(0, 12)}.response` ||
        suffix === `${record.fingerprint}.response` ||
        new RegExp(`^${record.fingerprint}-[2-9]\\d*\\.response$`).test(suffix);
}

function safeScoreFile(directory, record, allRecords) {
    if (!scoreOutputNameMatches(record)) return { error: 'output path does not match score record identity' };
    if (allRecords.filter(item => item?.outputPath === record.outputPath).length !== 1) {
        return { error: 'output path does not have unique score record ownership' };
    }
    const target = path.join(directory, record.outputPath);
    try {
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink()) return { error: 'not a regular non-symlink file' };
        if (fs.realpathSync(target) !== path.join(fs.realpathSync(directory), record.outputPath)) {
            return { error: 'output path escapes replay_logs' };
        }
        return { bytes: fs.readFileSync(target) };
    } catch (error) {
        return { error: error.code === 'ENOENT' ? 'file is missing' : error.message };
    }
}

function scoreRecordProblem(record, replayId) {
    if (!plainObject(record) || record.formatVersion !== 1 ||
        !['replay-frames', 'game-metadata'].includes(record.kind) || record.replayId !== replayId ||
        !fingerprintPattern.test(record.fingerprint ?? '') ||
        !fingerprintPattern.test(record.responseFingerprint ?? '') ||
        !fingerprintPattern.test(record.outputFingerprint ?? '') ||
        !fingerprintPattern.test(record.cacheEntryFingerprint ?? '') ||
        typeof record.sourceEntry !== 'string' || typeof record.sourceKey !== 'string' ||
        typeof record.requestUrl !== 'string' || record.embeddedBuildId !== null ||
        !(record.mapId === null || fingerprintPattern.test(record.mapId ?? '')) ||
        !['pending', 'claim', 'done', 'retiring'].includes(record.status) ||
        !plainObject(record.reviews) || typeof record.importedAt !== 'string') return 'invalid record fields';
    const match = record.sourceKey.match(scoreSourceKeyPattern);
    if (!match || match[1] !== record.requestUrl || match[2] !== replayId) return 'invalid request provenance';
    const requested = match[3] === undefined ? null : Number(match[3]);
    if (record.kind === 'game-metadata') {
        if (record.requestedGameTime !== null || requested !== null) return 'metadata request identity mismatch';
    } else if (!nonnegativeInteger(record.requestedGameTime) || requested !== record.requestedGameTime) {
        return 'frame request identity mismatch';
    }
    return null;
}

function validateSource(record, directory, allRecords, add) {
    const ref = { path: 'replay_logs/manifest.json', scoreFingerprint: record?.fingerprint ?? null };
    const problem = scoreRecordProblem(record, record?.replayId);
    if (problem) {
        add('score.manifest-record', 'fail', [ref], `Score record is invalid: ${problem}.`);
        return null;
    }
    add('score.manifest-record', 'pass', [ref], 'Score record schema and request provenance are valid.');
    const loaded = safeScoreFile(directory, record, allRecords);
    const outputRef = { path: `replay_logs/${record.outputPath}`, scoreFingerprint: record.fingerprint };
    if (loaded.error) {
        add('score.output-file', 'fail', [outputRef], `Managed score source is invalid: ${loaded.error}.`);
        return null;
    }
    const responseFingerprint = sha256(loaded.bytes);
    const fingerprint = scoreSourceFingerprint(record.sourceKey, loaded.bytes);
    if (responseFingerprint !== record.responseFingerprint ||
        responseFingerprint !== record.outputFingerprint || fingerprint !== record.fingerprint) {
        add('score.output-hash', 'fail', [outputRef], 'Managed score source hashes do not match the manifest.',
            { responseFingerprint, sourceFingerprint: fingerprint });
        return null;
    }
    add('score.output-hash', 'pass', [outputRef], 'Managed score source hashes match the manifest.',
        { responseFingerprint, bytes: loaded.bytes.length });
    const recomputed = validateScoreBody(record.kind, loaded.bytes, responseFingerprint);
    const coverageMatches = scoreCoverageMatches(record.coverage, recomputed.coverage);
    const validationMatches = canonical(record.validation) === canonical(recomputed.validation);
    if (!coverageMatches || !validationMatches) {
        add('score.stored-summary', 'fail', [ref, outputRef],
            'Stored score coverage or validation differs from exact-byte recomputation.',
            { coverageMatches, validationMatches });
        return null;
    }
    add('score.stored-summary', 'pass', [ref, outputRef],
        'Stored score coverage and validation match exact-byte recomputation.');
    let value = null;
    try { value = JSON.parse(loaded.bytes.toString('utf8')); } catch { /* retained malformed source */ }
    return { record, bytes: loaded.bytes, value, recomputed, ref, outputRef };
}

function directForFrame(validation, frameIndex) {
    const direct = Object.fromEntries(slotNames.map(slot => [slot,
        Object.fromEntries(measurements.map(measurement => [measurement, null]))]));
    for (const item of validation.items.assessments ?? []) {
        if (item.frameIndex === frameIndex && item.status === 'valid' && slotNames.includes(item.slot) &&
            measurements.includes(item.measurement)) direct[item.slot][item.measurement] = item.value;
    }
    return direct;
}

function objectIdentity(value, productionShape = false) {
    if (!plainObject(value)) return { id: null, conflict: false };
    const hasId = Object.hasOwn(value, 'id');
    const hasUnderscoreId = Object.hasOwn(value, '_id');
    const id = typeof value.id === 'string' && value.id.length ? value.id : null;
    const underscoreId = typeof value._id === 'string' && value._id.length ? value._id : null;
    if (hasId && hasUnderscoreId) {
        if (!id || !underscoreId || id !== underscoreId) return { id: null, conflict: true };
        return { id, conflict: false };
    }
    if (hasId) return { id, conflict: !id };
    if (hasUnderscoreId) return productionShape && underscoreId ?
        { id: underscoreId, conflict: false } : { id: null, conflict: true };
    return { id: null, conflict: false };
}

function normalizedCollection(values, normalize, kind) {
    const byId = new Map();
    const conflicts = [];
    for (const value of values) {
        const item = normalize(value);
        if (item?.conflict) {
            conflicts.push(`${kind}-identity`);
            continue;
        }
        if (!item?.value) continue;
        const prior = byId.get(item.value.id);
        if (prior && canonical(prior) !== canonical(item.value)) conflicts.push(`${kind}-duplicate`);
        else if (!prior) byId.set(item.value.id, item.value);
    }
    return { values: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)), conflicts };
}

function normalizeReplayObject(object) {
    if (!plainObject(object) || object.prototypeName === 'ScoreFlag') return null;
    const productionShape = typeof object.prototypeName === 'string' && object.prototypeName.length > 0 &&
        typeof object.type === 'string' && object.type.length > 0;
    const identity = objectIdentity(object, productionShape);
    if (identity.conflict) return { conflict: true };
    if (!identity.id) return null;
    const value = { id: identity.id };
    for (const field of ['user', 'x', 'y', 'hits', 'fatigue']) if (Object.hasOwn(object, field)) {
        value[field] = object[field];
    }
    return { value };
}

function normalizeFlag(flag, embedded) {
    if (embedded && (!plainObject(flag) || flag.prototypeName !== 'ScoreFlag')) return null;
    if (!plainObject(flag)) return { conflict: true };
    const productionShape = embedded && flag.prototypeName === 'ScoreFlag' &&
        typeof flag.type === 'string' && flag.type.length > 0;
    const identity = objectIdentity(flag, productionShape);
    if (identity.conflict) return { conflict: true };
    if (!identity.id) return { conflict: true };
    const value = { id: identity.id };
    for (const field of ['x', 'y', 'scorePerTick']) if (Object.hasOwn(flag, field)) value[field] = flag[field];
    if (!embedded && Object.hasOwn(flag, 'owner')) value.owner = flag.owner;
    return { value };
}

function normalizeFrameEvidence(frame) {
    const objects = normalizedCollection(Array.isArray(frame.objects) ? frame.objects : [],
        normalizeReplayObject, 'object');
    const topFlagsPresent = Object.hasOwn(frame, 'flags');
    const embeddedFlagsPresent = Array.isArray(frame.objects) && frame.objects.some(item =>
        plainObject(item) && item.prototypeName === 'ScoreFlag');
    const topFlags = normalizedCollection(Array.isArray(frame.flags) ? frame.flags : [],
        value => normalizeFlag(value, false), 'flag');
    const embeddedFlags = normalizedCollection(Array.isArray(frame.objects) ? frame.objects : [],
        value => normalizeFlag(value, true), 'embedded-flag');
    const conflicts = [...objects.conflicts, ...topFlags.conflicts, ...embeddedFlags.conflicts];
    if (topFlagsPresent && !Array.isArray(frame.flags)) conflicts.push('flag-representations');
    let flags = topFlagsPresent ? topFlags.values : embeddedFlags.values;
    if (topFlagsPresent && embeddedFlagsPresent) {
        const topById = new Map(topFlags.values.map(item => [item.id, item]));
        const embeddedById = new Map(embeddedFlags.values.map(item => [item.id, item]));
        if (canonical([...topById.keys()].sort()) !== canonical([...embeddedById.keys()].sort())) {
            conflicts.push('flag-representations');
        } else {
            for (const [id, embedded] of embeddedById) {
                const top = topById.get(id);
                for (const field of ['x', 'y', 'scorePerTick']) if (Object.hasOwn(top, field) &&
                    Object.hasOwn(embedded, field) && top[field] !== embedded[field]) {
                    conflicts.push('flag-representations');
                    break;
                }
            }
        }
        flags = topFlags.values;
    }
    return { objects: objects.values, flags, conflicts: [...new Set(conflicts)].sort() };
}

function makeSegments(source) {
    if (source.record.kind !== 'replay-frames' || !Array.isArray(source.value)) return [];
    const segments = [];
    let current = [];
    const finish = () => {
        if (!current.length) return;
        const firstFrameIndex = current[0].frameIndex;
        segments.push({
            id: hashParts(localSegmentDomain, source.record.fingerprint, firstFrameIndex),
            sourceFingerprint: source.record.fingerprint,
            firstFrameIndex,
            lastFrameIndex: current.at(-1).frameIndex,
            firstGameTime: current[0].gameTime,
            lastGameTime: current.at(-1).gameTime,
            frames: current,
        });
        current = [];
    };
    for (const [frameIndex, frame] of source.value.entries()) {
        const valid = plainObject(frame) && nonnegativeInteger(frame.gameTime);
        if (!valid) {
            finish();
            continue;
        }
        if (current.length && frame.gameTime < current.at(-1).gameTime) finish();
        const canonicalFrame = canonical(frame);
        current.push({ frameIndex, gameTime: frame.gameTime, frame, canonicalFrame,
            normalized: normalizeFrameEvidence(frame),
            identity: hashParts(overlapDomain, canonicalFrame),
            direct: directForFrame(source.recomputed.validation, frameIndex),
            source: { path: `replay_logs/${source.record.outputPath}`,
                scoreFingerprint: source.record.fingerprint, frameIndex, gameTime: frame.gameTime } });
    }
    finish();
    return segments;
}

function candidateEdges(segments) {
    const edges = [];
    for (let leftIndex = 0; leftIndex < segments.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex++) {
            const left = segments[leftIndex];
            const right = segments[rightIndex];
            if (left.sourceFingerprint === right.sourceFingerprint) continue;
            const leftIdentities = new Set(left.frames.map(item => item.identity));
            const shared = [...new Set(right.frames.map(item => item.identity)
                .filter(identity => leftIdentities.has(identity)))].sort();
            if (shared.length) edges.push({ leftSegmentId: left.id, rightSegmentId: right.id,
                frameIdentities: shared });
        }
    }
    return edges.sort((a, b) => canonical(a).localeCompare(canonical(b)));
}

function connectedComponents(segments, edges) {
    const adjacency = new Map(segments.map(item => [item.id, new Set()]));
    for (const edge of edges) {
        adjacency.get(edge.leftSegmentId).add(edge.rightSegmentId);
        adjacency.get(edge.rightSegmentId).add(edge.leftSegmentId);
    }
    const components = [];
    const seen = new Set();
    for (const id of [...adjacency.keys()].sort()) {
        if (seen.has(id)) continue;
        const stack = [id];
        const ids = [];
        seen.add(id);
        while (stack.length) {
            const current = stack.pop();
            ids.push(current);
            for (const next of [...adjacency.get(current)].sort().reverse()) if (!seen.has(next)) {
                seen.add(next);
                stack.push(next);
            }
        }
        components.push(ids.sort());
    }
    return components.sort((a, b) => canonical(a).localeCompare(canonical(b)));
}

function hasDirectedCycle(nodes, edges) {
    const adjacency = new Map(nodes.map(node => [node, new Set()]));
    for (const [from, to] of edges) adjacency.get(from)?.add(to);
    const visiting = new Set();
    const visited = new Set();
    const visit = node => {
        if (visiting.has(node)) return true;
        if (visited.has(node)) return false;
        visiting.add(node);
        for (const next of adjacency.get(node) ?? []) if (visit(next)) return true;
        visiting.delete(node);
        visited.add(node);
        return false;
    };
    return nodes.some(visit);
}

function componentOrderCycle(component, componentEdges, segmentById) {
    const identities = [...new Set(componentEdges.flatMap(edge => edge.frameIdentities))].sort();
    const orderEdges = new Set();
    for (const segmentId of component) {
        const segment = segmentById.get(segmentId);
        const indexes = new Map(identities.map(identity => [identity, []]));
        for (const [index, frame] of segment.frames.entries()) indexes.get(frame.identity)?.push(index);
        for (const left of identities) for (const right of identities) {
            if (left === right || !indexes.get(left).length || !indexes.get(right).length) continue;
            if (Math.max(...indexes.get(left)) < Math.min(...indexes.get(right))) {
                orderEdges.add(`${left}:${right}`);
            }
        }
    }
    return hasDirectedCycle(identities, [...orderEdges].map(item => item.split(':')));
}

function groupId(segmentIds) {
    return hashParts(groupDomain, ...segmentIds.slice().sort());
}

function establishGroups(segments, add) {
    const sorted = segments.slice().sort((a, b) => a.id.localeCompare(b.id));
    const segmentById = new Map(sorted.map(item => [item.id, item]));
    const edges = candidateEdges(sorted);
    const components = connectedComponents(sorted, edges);
    const groups = [];
    const relationships = [];
    for (const component of components) {
        const componentEdges = edges.filter(edge => component.includes(edge.leftSegmentId) &&
            component.includes(edge.rightSegmentId));
        if (!componentEdges.length) {
            groups.push({ id: groupId(component), segmentIds: component, segments: component.map(id => segmentById.get(id)),
                basis: 'local-segment', rejectedComponent: null });
            continue;
        }
        const sources = component.map(id => segmentById.get(id).sourceFingerprint);
        const reasons = [];
        if (new Set(sources).size !== sources.length) reasons.push('same-source-boundary');
        if (componentOrderCycle(component, componentEdges, segmentById)) reasons.push('ordering-cycle');
        const overlap = componentEdges.map(edge => ({ ...edge }));
        if (reasons.length) {
            const relationship = { type: 'ambiguous-overlap-bridge', segmentIds: component,
                reasons: reasons.sort(), candidateEdges: componentEdges };
            relationships.push(relationship);
            add('score.sequence-grouping', 'unknown', component.flatMap(id =>
                segmentById.get(id).frames.map(frame => frame.source)),
            'Exact-overlap component is ambiguous and remains split into source-qualified local segments.',
            relationship);
            for (const segmentId of component) groups.push({ id: groupId([segmentId]), segmentIds: [segmentId],
                segments: [segmentById.get(segmentId)], basis: 'local-segment',
                rejectedComponent: groupId(component) });
        } else {
            const group = { id: groupId(component), segmentIds: component,
                segments: component.map(id => segmentById.get(id)), basis: 'accepted-exact-overlap',
                rejectedComponent: null };
            groups.push(group);
            const relationship = { type: 'accepted-overlap-group', groupId: group.id,
                segmentIds: component, candidateEdges: componentEdges, overlap };
            relationships.push(relationship);
            add('score.sequence-grouping', 'pass', group.segments.flatMap(segment =>
                segment.frames.map(frame => frame.source)),
            'Complete exact-overlap component satisfies the group-wide invariant.', relationship);
        }
    }
    return { groups: groups.sort((a, b) => a.id.localeCompare(b.id)),
        relationships: relationships.sort((a, b) => canonical(a).localeCompare(canonical(b))), edges };
}

function groupTimeline(group, add) {
    const byTime = new Map();
    for (const segment of group.segments) for (const frame of segment.frames) {
        const list = byTime.get(frame.gameTime) ?? [];
        list.push({ ...frame, segmentId: segment.id });
        byTime.set(frame.gameTime, list);
    }
    const timeline = [];
    for (const [gameTime, frames] of [...byTime].sort(([a], [b]) => a - b)) {
        const variants = new Map();
        for (const frame of frames) {
            const list = variants.get(frame.canonicalFrame) ?? [];
            list.push(frame);
            variants.set(frame.canonicalFrame, list);
        }
        if (variants.size > 1) {
            add('score.conflicting-overlap', 'fail', frames.map(item => item.source),
                'Established sequence group contains conflicting frames at one gameTime.',
                { groupId: group.id, gameTime, variants: variants.size });
            timeline.push({ gameTime, conflict: true, frames });
            continue;
        }
        const copies = [...variants.values()][0];
        timeline.push({ gameTime, conflict: false, frame: copies[0], copies });
        if (copies.length > 1) add('score.exact-overlap', 'pass', copies.map(item => item.source),
            'Exact replay frames were deduplicated with all source references retained.',
            { groupId: group.id, gameTime, copies: copies.length });
    }
    return timeline;
}

function observationsForGroups(groups, add) {
    const observations = [];
    const timelines = new Map();
    for (const group of groups) {
        const timeline = groupTimeline(group, add);
        timelines.set(group.id, timeline);
        let previous = null;
        let boundary = 'initial';
        for (const item of timeline) {
            if (item.conflict) {
                previous = null;
                boundary = 'conflict';
                continue;
            }
            for (const slot of slotNames) {
                const direct = item.frame.direct[slot];
                let derivedScoreChange = null;
                let derivedStatus = boundary;
                if (previous && previous.gameTime + 1 === item.gameTime && !previous.conflict) {
                    const earlier = previous.frame.direct[slot].cumulativeScore;
                    if (earlier === null || direct.cumulativeScore === null) derivedStatus = 'missing-score';
                    else if (direct.cumulativeScore >= earlier) {
                        derivedScoreChange = direct.cumulativeScore - earlier;
                        derivedStatus = 'derived';
                    } else {
                        derivedStatus = 'score-decrease';
                        add('score.decrease-continuity', 'unknown',
                            [...previous.copies, ...item.copies].map(frame => frame.source),
                            'A cumulative-score decrease ends derived continuity without inferring a reset.',
                            { groupId: group.id, gameTime: item.gameTime, slot, earlier,
                                current: direct.cumulativeScore });
                    }
                } else if (previous) derivedStatus = 'gap';
                const gainComparison = direct.displayedGain === null || derivedScoreChange === null ? 'unknown'
                    : direct.displayedGain === derivedScoreChange ? 'equal' : 'different';
                observations.push({ groupId: group.id, segmentIds: group.segmentIds,
                    gameTime: item.gameTime, slot,
                    player: 'unknown', cumulativeScore: direct.cumulativeScore,
                    displayedGain: direct.displayedGain, derivedScoreChange, derivedStatus, gainComparison,
                    sourceReferences: item.copies.map(frame => frame.source)
                        .sort((a, b) => canonical(a).localeCompare(canonical(b))) });
            }
            previous = item;
            boundary = null;
        }
    }
    return { observations: observations
        .sort((a, b) => canonical([a.gameTime, a.groupId, a.slot]).localeCompare(
            canonical([b.gameTime, b.groupId, b.slot]))), timelines };
}

function addAmbiguousSegments(groups, timelines, relationships, add) {
    const timeToGroups = new Map();
    for (const group of groups) for (const item of timelines.get(group.id) ?? []) {
        const ids = timeToGroups.get(item.gameTime) ?? new Set();
        ids.add(group.id);
        timeToGroups.set(item.gameTime, ids);
    }
    for (const [gameTime, ids] of [...timeToGroups].sort(([a], [b]) => a - b)) {
        if (ids.size < 2) continue;
        const groupIds = [...ids].sort();
        const relationship = { type: 'ambiguous-segment', gameTime, groupIds };
        relationships.push(relationship);
        const refs = groups.filter(group => ids.has(group.id)).flatMap(group =>
            (timelines.get(group.id) ?? []).filter(item => item.gameTime === gameTime)
                .flatMap(item => item.conflict ? item.frames.map(frame => frame.source) :
                    item.copies.map(frame => frame.source)));
        add('score.ambiguous-segment', 'unknown', refs,
            'Repeated gameTime occurs in sequence groups whose equivalence is not established.', relationship);
    }
}

function legacyIdentityRepresentations(value) {
    const candidates = [
        { present: plainObject(value) && Object.hasOwn(value, 'players'), value: value?.players },
        { present: plainObject(value) && Object.hasOwn(value, 'users'), value: value?.users },
        { present: plainObject(value?.game) && Object.hasOwn(value.game, 'players'),
            value: value?.game?.players },
    ];
    return candidates.filter(item => item.present).map(item => ({
        status: Array.isArray(item.value) && item.value.length === 2 &&
            item.value.every(entry => typeof entry === 'string' && entry.length) ? 'valid' : 'malformed',
        value: item.value,
    }));
}

function nestedMetadataIdentity(value) {
    const wrapper = value?.game;
    if (!plainObject(wrapper) || !Object.hasOwn(wrapper, 'user') && !Object.hasOwn(wrapper, 'users') &&
        !Object.hasOwn(wrapper, 'codes') && !plainObject(wrapper.game)) return { status: 'absent' };
    const currentUser = typeof wrapper.user === 'string' && wrapper.user.length ? wrapper.user : null;
    const users = Array.isArray(wrapper.users) ? wrapper.users : [];
    const codes = Array.isArray(wrapper.codes) ? wrapper.codes : [];
    const usersCode = Array.isArray(wrapper.game?.usersCode) ? wrapper.game.usersCode : [];
    if (!currentUser || users.length !== 2 || codes.length !== 2 || usersCode.length !== 2 ||
        wrapper.game?.firstPlayerIndex !== 0) return { status: 'unknown', reason: 'unsupported-shape' };
    const nestedId = item => {
        if (!plainObject(item) || typeof item._id !== 'string' || !item._id.length) return null;
        if (Object.hasOwn(item, 'id') && (typeof item.id !== 'string' || item.id !== item._id)) return null;
        return item._id;
    };
    const userIds = users.map(nestedId);
    const codeEntries = codes.map(item => {
        const id = nestedId(item);
        return id && typeof item.user === 'string' && item.user.length ? { id, user: item.user } : null;
    });
    if (userIds.includes(null) || codeEntries.includes(null) ||
        new Set(userIds).size !== 2 || new Set(codeEntries.map(item => item.id)).size !== 2 ||
        new Set(codeEntries.map(item => item.user)).size !== 2 || new Set(usersCode).size !== 2 ||
        !userIds.includes(currentUser) || codeEntries.some(item => !userIds.includes(item.user))) {
        return { status: 'unknown', reason: 'invalid-references' };
    }
    const codeById = new Map(codeEntries.map(item => [item.id, item.user]));
    const slotUsers = usersCode.map(codeId => codeById.get(codeId) ?? null);
    if (slotUsers.includes(null) || new Set(slotUsers).size !== 2) {
        return { status: 'unknown', reason: 'invalid-slot-references' };
    }
    const legacy = legacyIdentityRepresentations(value);
    if (legacy.some(item => item.status === 'malformed')) {
        return { status: 'unknown', reason: 'malformed-identity-representation', slotUsers };
    }
    if (legacy.some(item => canonical(item.value) !== canonical(slotUsers))) {
        return { status: 'conflicting', reason: 'identity-representations-disagree', slotUsers };
    }
    const oursSlot = slotUsers.indexOf(currentUser) === 0 ? 'player1' : 'player2';
    return { status: 'established', oursSlot,
        opponentSlot: oursSlot === 'player1' ? 'player2' : 'player1', slotUsers };
}

function establishMetadataIdentity(sources, add) {
    const entries = sources.filter(source => source.record.kind === 'game-metadata').map(source => ({
        result: nestedMetadataIdentity(source.value), source: source.outputRef,
    }));
    const established = entries.filter(item => item.result.status === 'established');
    const explicitConflict = entries.some(item => item.result.status === 'conflicting');
    const signatures = [...new Set(established.map(item => canonical({ oursSlot: item.result.oursSlot,
        slotUsers: item.result.slotUsers })))];
    const status = explicitConflict || signatures.length > 1 ? 'conflicting' :
        signatures.length === 1 ? 'established' : 'unknown';
    const selected = status === 'established' ? established[0].result : null;
    const result = { status, oursSlot: selected?.oursSlot ?? null,
        opponentSlot: selected?.opponentSlot ?? null, slotUsers: selected?.slotUsers ?? null,
        sources: entries.map(item => ({ ...item.result, source: item.source })) };
    add('score.metadata-identity', status === 'established' ? 'pass' :
        status === 'conflicting' ? 'fail' : 'unknown', entries.length ? entries.map(item => item.source) :
        [{ path: 'replay_logs/manifest.json' }], status === 'established' ?
        'Validated nested metadata references establish current-user payload-slot ownership.' :
        status === 'conflicting' ? 'Selected metadata identity representations conflict.' :
        'Selected metadata does not establish current-user payload-slot ownership.', result, [null]);
    return result;
}

function establishMapping(groups, timelines, snapshots, metadataIdentity, add, buildIds) {
    const groupResults = [];
    const refs = [];
    for (const group of groups) {
        const evidenceBySlot = new Map(slotNames.map(slot => [slot, []]));
        let representationConflict = false;
        for (const item of timelines.get(group.id) ?? []) {
            if (item.conflict) continue;
            if (item.frame.normalized.conflicts.some(reason => reason.startsWith('object-'))) {
                representationConflict = true;
            }
            for (const object of item.frame.normalized.objects) if (slotNames.includes(object.user)) {
                evidenceBySlot.get(object.user).push({ id: object.id, source: item.frame.source });
            }
        }
        const slotValues = new Map(slotNames.map(slot => [slot, new Set()]));
        const groupRefs = [];
        let objectConflict = representationConflict;
        for (const slot of slotNames) {
            const byId = new Map();
            for (const item of evidenceBySlot.get(slot)) {
                const list = byId.get(item.id) ?? [];
                list.push(item.source);
                byId.set(item.id, list);
            }
            for (const [id, scoreRefs] of byId) {
                const matches = [];
                for (const snapshot of snapshots.values()) {
                    const creep = snapshot.entry.creeps.find(item => item.id === id);
                    if (creep) matches.push({ my: creep.my, source: snapshot.source });
                }
                const values = new Set(matches.map(item => item.my));
                if (values.size > 1) objectConflict = true;
                for (const value of values) slotValues.get(slot).add(value);
                if (values.size) groupRefs.push(...scoreRefs, ...matches.map(item => item.source));
            }
        }
        const first = slotValues.get('player1');
        const second = slotValues.get('player2');
        let status = 'unknown';
        let oursSlot = null;
        if (objectConflict || first.size > 1 || second.size > 1 ||
            first.size === 1 && second.size === 1 && [...first][0] === [...second][0]) status = 'conflicting';
        else if (first.size === 1 && second.size === 1) {
            status = 'established';
            oursSlot = [...first][0] ? 'player1' : 'player2';
        }
        const hasBothLocalSlots = slotNames.every(slot => evidenceBySlot.get(slot).length > 0);
        if (metadataIdentity.status === 'conflicting' && hasBothLocalSlots) status = 'conflicting';
        else if (metadataIdentity.status === 'established' && hasBothLocalSlots) {
            const metadataContradiction = slotNames.some(slot => [...slotValues.get(slot)]
                .some(value => value !== (slot === metadataIdentity.oursSlot)));
            if (metadataContradiction || status === 'established' &&
                oursSlot !== metadataIdentity.oursSlot) status = 'conflicting';
            else if (status === 'unknown') {
                status = 'established';
                oursSlot = metadataIdentity.oursSlot;
            }
            groupRefs.push(...metadataIdentity.sources.filter(item => item.status === 'established')
                .map(item => item.source));
        }
        if (status === 'conflicting') oursSlot = null;
        refs.push(...groupRefs);
        groupResults.push({ groupId: group.id, status, oursSlot,
            opponentSlot: oursSlot === 'player1' ? 'player2' : oursSlot === 'player2' ? 'player1' : null });
    }
    const establishedSlots = [...new Set(groupResults.filter(item => item.status === 'established')
        .map(item => item.oursSlot))];
    const conflicting = groupResults.some(item => item.status === 'conflicting') || establishedSlots.length > 1;
    const status = conflicting ? 'conflicting' : establishedSlots.length === 1 ? 'established' : 'unknown';
    const oursSlot = status === 'established' ? establishedSlots[0] : null;
    const result = { status, oursSlot, opponentSlot: oursSlot === 'player1' ? 'player2' :
        oursSlot === 'player2' ? 'player1' : null,
        groups: groupResults.sort((a, b) => a.groupId.localeCompare(b.groupId)) };
    add('score.player-mapping', status === 'established' ? 'pass' : status === 'conflicting' ? 'fail' : 'unknown',
        refs.length ? refs : [{ path: 'replay_logs/manifest.json' }], status === 'established' ?
            'Validated metadata references and/or stable replay object IDs establish payload-slot ownership.' :
            status === 'conflicting' ? 'Selected identity evidence gives conflicting payload-slot ownership.' :
                'Selected evidence is insufficient to map payload slots to ours/opponent.', result, buildIds);
    return result;
}

function compareFrameSnapshot(frame, snapshot) {
    let comparisons = 0;
    let conflicts = 0;
    const creeps = new Map(snapshot.creeps.map(item => [item.id, item]));
    for (const object of frame.objects) {
        const creep = creeps.get(object.id);
        if (!creep) continue;
        for (const field of ['x', 'y', 'hits', 'fatigue']) if (Object.hasOwn(object, field)) {
            comparisons++;
            if (object[field] !== creep[field]) conflicts++;
        }
    }
    const flags = new Map(snapshot.flags.map(item => [item.id, item]));
    for (const flag of frame.flags) {
        const observed = flags.get(flag.id);
        if (!observed) continue;
        for (const field of ['x', 'y', 'owner', 'scorePerTick']) if (Object.hasOwn(flag, field)) {
            comparisons++;
            if (flag[field] !== observed[field]) conflicts++;
        }
    }
    return { comparisons, conflicts };
}

function establishAlignment(groups, timelines, snapshots, add) {
    const groupResults = [];
    const snapshotTicks = [...snapshots.keys()].sort((a, b) => a - b);
    for (const group of groups) {
        const timeline = timelines.get(group.id) ?? [];
        const conflicts = timeline.filter(item => item.conflict);
        const frames = timeline.filter(item => !item.conflict);
        const representationConflicts = frames.filter(item => item.frame.normalized.conflicts.length);
        const offsets = new Set();
        for (const item of frames) for (const tick of snapshotTicks) offsets.add(tick - item.gameTime);
        const candidates = [];
        const rejectedBy = new Set();
        for (const offset of conflicts.length || representationConflicts.length ? [] :
            [...offsets].sort((a, b) => a - b)) {
            let comparisonCount = 0;
            let conflictCount = 0;
            const contributors = [];
            for (const item of frames) {
                const snapshot = snapshots.get(item.gameTime + offset);
                if (!snapshot) continue;
                const compared = compareFrameSnapshot(item.frame.normalized, snapshot.entry);
                if (!compared.comparisons) continue;
                comparisonCount += compared.comparisons;
                conflictCount += compared.conflicts;
                contributors.push({ gameTime: item.gameTime, runtimeTick: snapshot.entry.tick,
                    buildId: snapshot.buildId ?? null,
                    scoreSources: item.copies.map(frame => frame.source),
                    source: snapshot.source });
            }
            if (conflictCount) {
                rejectedBy.add('compared-fields-conflict');
                continue;
            }
            if (contributors.length < 2) {
                rejectedBy.add('insufficient-comparisons');
                continue;
            }
            const firstGameTime = contributors[0].gameTime;
            const lastGameTime = contributors.at(-1).gameTime;
            const interval = frames.filter(item => item.gameTime >= firstGameTime &&
                item.gameTime <= lastGameTime);
            if (interval.some((item, index) => index && item.gameTime !== interval[index - 1].gameTime + 1)) {
                rejectedBy.add('structural-gap');
                continue;
            }
            candidates.push({ offset, matchedTimes: contributors.length, comparisonCount,
                firstGameTime, lastGameTime, contributors });
        }
        const status = candidates.length === 1 ? 'established' : 'unknown';
        const blockedBy = conflicts.length ? ['conflicting-overlap'] : representationConflicts.length ?
            ['conflicting-payload-representation'] : status === 'established' ? [] :
            candidates.length > 1 ? ['multiple-offsets'] : [...rejectedBy].sort();
        groupResults.push({ groupId: group.id, status,
            offset: status === 'established' ? candidates[0].offset : null, blockedBy, candidates });
    }
    const establishedOffsets = [...new Set(groupResults.filter(item => item.status === 'established')
        .map(item => item.offset))];
    const ambiguous = groupResults.some(item => item.candidates.length > 1);
    const status = establishedOffsets.length === 1 && !ambiguous ? 'established'
        : establishedOffsets.length > 1 ? 'conflicting' : 'unknown';
    const contributors = status === 'established' ? groupResults.filter(item =>
        item.status === 'established' && item.offset === establishedOffsets[0])
        .flatMap(item => item.candidates[0].contributors)
        .filter((item, index, values) => values.findIndex(candidate =>
            canonical(candidate.source) === canonical(item.source)) === index)
        .sort((a, b) => canonical(a).localeCompare(canonical(b))) : [];
    const result = { status, offset: status === 'established' ? establishedOffsets[0] : null,
        contributors,
        groups: groupResults.sort((a, b) => a.groupId.localeCompare(b.groupId)) };
    const refs = contributors.length ? contributors.flatMap(item => [...item.scoreSources, item.source]) :
        [...snapshots.values()].map(item => item.source);
    const contributorBuildIds = contributors.map(item => item.buildId);
    add('score.tick-alignment', status === 'established' ? 'pass' : status === 'conflicting' ? 'fail' : 'unknown',
        refs.length ? refs : [{ path: 'replay_logs/manifest.json' }], status === 'established' ?
            'Selected replay frames and snapshots establish one replay-specific tick offset.' :
            status === 'conflicting' ? 'Independent sequence groups establish conflicting tick offsets.' :
                'Selected evidence does not establish exactly one tick offset.', result,
        contributorBuildIds.length ? contributorBuildIds : [null]);
    return result;
}

function buildAssociation(alignment, add) {
    const contributorBuildIds = alignment.contributors.map(item => item.buildId ?? null);
    const tagged = [...new Set(contributorBuildIds.filter(validBuildId))].sort();
    const hasUnknownBuild = contributorBuildIds.some(item => item === null);
    const status = tagged.length > 1 ? 'conflicting' : alignment.status === 'established' &&
        tagged.length === 1 && !hasUnknownBuild ? 'associated' : 'unknown';
    const result = { status, logBuildId: status === 'associated' ? tagged[0] : null,
        scoreEmbeddedBuildId: null, supportedBuildIds: tagged, hasUnknownBuild,
        contributingSnapshots: alignment.contributors.length };
    const refs = alignment.contributors.map(item => item.source);
    add('score.build-association', status === 'associated' ? 'pass' : status === 'conflicting' ? 'fail' : 'unknown',
        refs.length ? refs : [{ path: 'replay_logs/manifest.json' }], status === 'associated' ?
            'Every snapshot supporting alignment has one build ID; frame build provenance remains unknown.' :
            status === 'conflicting' ? 'Snapshots supporting alignment have incompatible build IDs.' :
                'Build association requires established alignment whose supporting snapshots all carry one build ID.',
        result, contributorBuildIds.length ? contributorBuildIds : [null]);
    return result;
}

function decorateMeasurements(observations, mapping) {
    const groupMappings = new Map(mapping.groups.map(item => [item.groupId, item]));
    for (const observation of observations) {
        const groupMapping = groupMappings.get(observation.groupId);
        observation.player = groupMapping?.status !== 'established' ? 'unknown'
            : observation.slot === groupMapping.oursSlot ? 'ours' : 'opponent';
    }
    const comparisons = [];
    const grouped = new Map();
    for (const observation of observations) {
        const key = `${observation.groupId}:${observation.gameTime}`;
        const entry = grouped.get(key) ?? [];
        entry.push(observation);
        grouped.set(key, entry);
    }
    for (const values of grouped.values()) {
        const player1 = values.find(item => item.slot === 'player1');
        const player2 = values.find(item => item.slot === 'player2');
        if (!player1 || !player2) continue;
        const groupMapping = groupMappings.get(player1.groupId);
        const ours = groupMapping?.oursSlot === 'player1' ? player1 :
            groupMapping?.oursSlot === 'player2' ? player2 : null;
        const opponent = groupMapping?.opponentSlot === 'player1' ? player1 :
            groupMapping?.opponentSlot === 'player2' ? player2 : null;
        comparisons.push({ groupId: player1.groupId, gameTime: player1.gameTime,
            oursSlot: groupMapping?.status === 'established' ? groupMapping.oursSlot : null,
            scoreDifference: ours && opponent && ours.cumulativeScore !== null && opponent.cumulativeScore !== null ?
                ours.cumulativeScore - opponent.cumulativeScore : null,
            displayedGainDifference: ours && opponent && ours.displayedGain !== null && opponent.displayedGain !== null ?
                ours.displayedGain - opponent.displayedGain : null,
            derivedScoreChangeDifference: ours && opponent && ours.derivedScoreChange !== null &&
                opponent.derivedScoreChange !== null ?
                ours.derivedScoreChange - opponent.derivedScoreChange : null });
    }
    return comparisons.sort((a, b) => canonical([a.gameTime, a.groupId]).localeCompare(
        canonical([b.gameTime, b.groupId])));
}

function associateEvents(observations, groups, alignment, mapping, build, snapshots, merged, add) {
    const associationBuildIds = [...build.supportedBuildIds,
        ...(build.hasUnknownBuild ? [null] : [])];
    if (alignment.status !== 'established' || mapping.status !== 'established' ||
        build.status !== 'associated') {
        add('score.event-association', 'unknown', [{ path: 'replay_logs/manifest.json' }],
            'Objective and escort association requires established mapping, timing, and log build evidence.',
            null, associationBuildIds.length ? associationBuildIds : [null]);
        return [];
    }
    const groupAlignment = new Map(alignment.groups.filter(item => item.status === 'established' &&
        item.offset === alignment.offset).map(item => [item.groupId, item]));
    const groupMapping = new Map(mapping.groups.filter(item => item.status === 'established' &&
        item.oursSlot === mapping.oursSlot).map(item => [item.groupId, item]));
    const groupById = new Map(groups.map(item => [item.id, item]));
    const events = [];
    for (const observation of observations.filter(item => item.player === 'ours')) {
        const timing = groupAlignment.get(observation.groupId);
        if (!groupMapping.has(observation.groupId) || !timing ||
            !groupById.has(observation.groupId)) continue;
        const candidate = timing.candidates[0];
        if (observation.gameTime < candidate.firstGameTime || observation.gameTime > candidate.lastGameTime) continue;
        const runtimeTick = observation.gameTime + alignment.offset;
        const snapshot = snapshots.get(runtimeTick);
        if (!snapshot || snapshot.buildId !== build.logBuildId) continue;
        const items = merged.byTick.get(runtimeTick) ?? [];
        const escort = merged.complete.has(runtimeTick) ? items.filter(item =>
            item.buildId === build.logBuildId && item.entry.type === 'action-decision' &&
            item.entry.reason.includes('escort')) : [];
        const logEvidence = [snapshot.source, ...escort.flatMap(item => item.sources ?? [item.source])];
        events.push({ groupId: observation.groupId, gameTime: observation.gameTime, runtimeTick,
            objectiveFlags: snapshot.entry.flags.map(({ id, owner, scorePerTick }) =>
                ({ id, owner, scorePerTick })).sort((a, b) => a.id.localeCompare(b.id)),
            escortDecisions: escort.map(item => ({ actorId: item.entry.actorId,
                outcome: item.entry.outcome, reason: item.entry.reason,
                evidence: item.sources ?? [item.source] })).sort((a, b) => canonical(a).localeCompare(canonical(b))),
            scoreEvidence: observation.sourceReferences, logEvidence,
            evidence: [...observation.sourceReferences, ...logEvidence] });
    }
    add('score.event-association', events.length ? 'pass' : 'unknown',
        events.flatMap(item => item.evidence).length ? events.flatMap(item => item.evidence) :
            [{ path: 'replay_logs/manifest.json' }], events.length ?
            'Score frames are temporally associated with selected objective and escort evidence; no causality is inferred.' :
            'Established dependencies contain no same-tick objective or escort observations.',
        { count: events.length, causalClaim: false },
        events.length ? [build.logBuildId] : associationBuildIds.length ? associationBuildIds : [null]);
    return events;
}

export function analyzeScoreEvidence({ directory, manifest, replayId, scoreFingerprints,
    snapshots = new Map(), merged = { byTick: new Map(), complete: new Set() },
    selectedBuildIds = [], addFinding }) {
    if (!replayIdPattern.test(replayId ?? '')) throw new Error('Expected a verified 24-character replay ID');
    if (!Array.isArray(scoreFingerprints) || !scoreFingerprints.length ||
        scoreFingerprints.some(item => !fingerprintPattern.test(item))) {
        throw new Error('Score fingerprints must be a nonempty array of full SHA-256 strings');
    }
    const add = (rule, verdict, refs, message, observed = null, buildIds = [null]) =>
        addFinding(rule, verdict, refs, message, observed, buildIds);
    const requested = [...new Set(scoreFingerprints)].sort();
    if (!Array.isArray(manifest.scoreRecords)) {
        for (const fingerprint of requested) add('score.record-selection', 'unknown',
            [{ path: 'replay_logs/manifest.json', scoreFingerprint: fingerprint }],
            'Manifest has no scoreRecords collection; retained score support is unavailable.');
        return { selectedScoreFingerprints: [], scoring: { sources: [], segments: [], groups: [],
            relationships: [], metadataIdentity: { status: 'unknown', oursSlot: null,
                opponentSlot: null, slotUsers: null, sources: [] },
            mapping: { status: 'unknown', oursSlot: null, opponentSlot: null },
            alignment: { status: 'unknown', offset: null, contributors: [], groups: [] },
            buildAssociation: { status: 'unknown', logBuildId: null, scoreEmbeddedBuildId: null,
                supportedBuildIds: [], hasUnknownBuild: false, contributingSnapshots: 0 },
            observations: [], comparisons: [], events: [], terminal: { status: 'unknown', gameTime: null,
                reason: 'Selected replay-frame sources do not by themselves establish terminal match state.' } } };
    }
    const selectedRecords = manifest.scoreRecords.filter(record => record?.replayId === replayId &&
        requested.includes(record.fingerprint)).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
    for (const fingerprint of requested) if (!selectedRecords.some(item => item.fingerprint === fingerprint)) {
        add('score.record-selection', 'unknown',
            [{ path: 'replay_logs/manifest.json', scoreFingerprint: fingerprint }],
            'Requested score fingerprint is not present for this replay.');
    }
    if (selectedRecords.length) add('score.record-selection', 'pass', selectedRecords.map(record =>
        ({ path: 'replay_logs/manifest.json', scoreFingerprint: record.fingerprint })),
    'Explicit score fingerprints selected current managed sources.', { count: selectedRecords.length });
    const sources = selectedRecords.map(record => validateSource(record, directory, manifest.scoreRecords, add))
        .filter(Boolean);
    const segments = sources.flatMap(makeSegments).sort((a, b) => a.id.localeCompare(b.id));
    const established = establishGroups(segments, add);
    const measured = observationsForGroups(established.groups, add);
    addAmbiguousSegments(established.groups, measured.timelines, established.relationships, add);
    established.relationships.sort((a, b) => canonical(a).localeCompare(canonical(b)));
    const metadataIdentity = establishMetadataIdentity(sources, add);
    const mapping = establishMapping(established.groups, measured.timelines, snapshots,
        metadataIdentity, add, selectedBuildIds);
    const alignment = establishAlignment(established.groups, measured.timelines, snapshots, add);
    const association = buildAssociation(alignment, add);
    const comparisons = decorateMeasurements(measured.observations, mapping);
    const events = associateEvents(measured.observations, established.groups, alignment, mapping,
        association, snapshots, merged, add);
    const terminal = { status: 'unknown', gameTime: null,
        reason: 'Selected replay-frame sources do not by themselves establish terminal match state.' };
    add('score.terminal-status', 'unknown', sources.length ? sources.map(source => source.outputRef) :
        [{ path: 'replay_logs/manifest.json' }],
        terminal.reason, terminal);
    return {
        selectedScoreFingerprints: selectedRecords.map(item => item.fingerprint).sort(),
        scoring: {
            sources: selectedRecords.map(record => {
                const source = sources.find(item => item.record === record);
                return source ? { fingerprint: record.fingerprint, responseFingerprint: record.responseFingerprint,
                    kind: record.kind, requestUrl: record.requestUrl,
                    requestedGameTime: record.requestedGameTime, embeddedBuildId: null,
                    mapId: record.mapId, integrity: 'verified', coverage: source.recomputed.coverage,
                    validation: source.recomputed.validation } : {
                    fingerprint: record.fingerprint, responseFingerprint: record.responseFingerprint ?? null,
                    kind: record.kind ?? null, requestUrl: record.requestUrl ?? null,
                    requestedGameTime: record.requestedGameTime ?? null,
                    embeddedBuildId: record.embeddedBuildId ?? null, mapId: record.mapId ?? null,
                    integrity: 'invalid', coverage: null, validation: null,
                };
            }),
            segments: segments.map(({ frames, ...segment }) => ({ ...segment,
                frameCount: frames.length, frameIdentities: frames.map(item => item.identity) })),
            groups: established.groups.map(({ segments: ignored, ...group }) => group),
            relationships: established.relationships,
            metadataIdentity,
            mapping,
            alignment,
            buildAssociation: association,
            observations: measured.observations,
            comparisons,
            events,
            terminal,
        },
    };
}

import { buildId } from './build-id.js';

const membershipTypes = ['membership-baseline', 'membership-change'];
const actionTypes = ['action-decision', 'action-attempt'];
const actionCoveredTypes = [...membershipTypes, ...actionTypes];
const cpuType = 'runtime-cpu';
const legacyCountKeys = [...actionCoveredTypes,
    'movement-decisions', 'healing-decisions', 'combat-decisions'];
const changeOrder = new Map(['member-added', 'assignment', 'presence', 'capability', 'participation']
    .map((kind, index) => [kind, index]));

const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function sortedCounts(counts) {
    if (counts === null) return null;
    return Object.fromEntries(Object.entries(counts ?? {}).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0));
}

function memberSnapshot(member, slots) {
    const slot = slots.get(member.id) ?? null;
    return {
        id: member.id,
        role: member.role,
        originalParts: sortedCounts(member.originalParts),
        squadId: member.squadId,
        slotIndex: slot,
        late: member.late,
        presence: member.presence,
        functioning: sortedCounts(member.functioning),
        capable: member.capable,
        participating: member.participating,
        canMoveNow: member.canMoveNow,
    };
}

function membershipSnapshot(state) {
    const squads = state.squads.map(squad => ({ id: squad.id, memberIds: [...squad.memberIds] }));
    const slots = new Map(squads.flatMap(squad =>
        squad.memberIds.map((memberId, index) => [memberId, index])));
    return {
        initialized: state.initialized,
        initializationReason: state.reason ?? null,
        lastTick: state.lastTick,
        squads,
        members: state.members.map(member => memberSnapshot(member, slots)).sort(byId),
    };
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function membershipChanges(previous, current) {
    const changes = [];
    if (previous.initialized !== current.initialized ||
        previous.initializationReason !== current.initializationReason) {
        changes.push({ kind: 'initialization', initialized: current.initialized,
            initializationReason: current.initializationReason });
    }
    const oldMembers = new Map(previous.members.map(member => [member.id, member]));
    for (const member of current.members) {
        const old = oldMembers.get(member.id);
        if (!old) {
            changes.push({ kind: 'member-added', member });
            continue;
        }
        if (old.squadId !== member.squadId || old.slotIndex !== member.slotIndex) {
            changes.push({ kind: 'assignment', memberId: member.id,
                squadId: member.squadId, slotIndex: member.slotIndex });
        }
        if (old.presence !== member.presence) {
            changes.push({ kind: 'presence', memberId: member.id,
                from: old.presence, to: member.presence });
        }
        if (!same(old.functioning, member.functioning) || old.capable !== member.capable ||
            old.canMoveNow !== member.canMoveNow) {
            changes.push({ kind: 'capability', memberId: member.id,
                functioning: member.functioning, capable: member.capable,
                canMoveNow: member.canMoveNow });
        }
        if (old.participating !== member.participating) {
            changes.push({ kind: 'participation', memberId: member.id,
                participating: member.participating });
        }
    }
    return changes.sort((a, b) => {
        if (a.kind === 'initialization' || b.kind === 'initialization') {
            return a.kind === b.kind ? 0 : a.kind === 'initialization' ? -1 : 1;
        }
        const aId = a.memberId ?? a.member.id;
        const bId = b.memberId ?? b.member.id;
        return aId < bId ? -1 : aId > bId ? 1 :
            changeOrder.get(a.kind) - changeOrder.get(b.kind);
    });
}

function emptyCounts(cpuCoverage) {
    return Object.fromEntries([...legacyCountKeys, ...(cpuCoverage ? [cpuType] : [])]
        .map(key => [key, 0]));
}

function targetSnapshot(target, kind) {
    return {
        kind,
        id: typeof target.id === 'string' ? target.id : null,
        x: target.x,
        y: target.y,
    };
}

export function createReplayEvidenceLogger({ runtimeBuildId = buildId,
    emit = record => console.log(JSON.stringify(record)), actionCoverage = true,
    cpuCoverage = true } = {}) {
    let tick = null;
    let sequence = 0;
    let counts = emptyCounts(cpuCoverage);
    let epoch = 1;
    let baselineEmitted = false;
    let previousMembership = null;
    let pendingReset = null;
    let closed = true;

    function emitRecord(type, phase, payload) {
        const record = { type, formatVersion: 1, buildId: runtimeBuildId, tick, phase,
            sequence, recordId: `${tick}:${sequence}`, ...payload };
        sequence++;
        counts[type]++;
        emit(record);
        return record;
    }

    function beginTick(currentTick, reset = null) {
        tick = currentTick;
        sequence = 0;
        counts = emptyCounts(cpuCoverage);
        closed = false;
        pendingReset = reset;
        if (reset) {
            const fromEpoch = epoch;
            epoch++;
            baselineEmitted = false;
            previousMembership = null;
            pendingReset = { ...reset, fromEpoch, toEpoch: epoch };
        }
    }

    function recordMembership(state) {
        const current = membershipSnapshot(state);
        if (pendingReset) {
            emitRecord('membership-change', 'before-actions', { epoch,
                changes: [{ kind: 'reset', previousTick: pendingReset.previousTick,
                    currentTick: tick, fromEpoch: pendingReset.fromEpoch,
                    toEpoch: pendingReset.toEpoch, reason: pendingReset.reason }] });
            pendingReset = null;
        }
        if (!baselineEmitted) {
            emitRecord('membership-baseline', 'before-actions', { epoch,
                initialized: current.initialized,
                initializationReason: current.initializationReason,
                lastTick: current.lastTick,
                squads: current.squads,
                members: current.members });
            baselineEmitted = true;
        } else {
            const changes = membershipChanges(previousMembership, current);
            if (changes.length) emitRecord('membership-change', 'before-actions', { epoch, changes });
        }
        previousMembership = current;
    }

    function recordActionDecision({ phase, channel, actorId, outcome, reason, actions }) {
        const decisionId = `${tick}:${sequence}`;
        const selected = actions.map((action, index) => ({
            actionId: `${decisionId}#${index}`,
            method: action.method,
            target: targetSnapshot(action.target, action.targetKind),
        }));
        const record = emitRecord('action-decision', phase, {
            decisionId, channel, actorId, outcome, reason, actions: selected,
        });
        counts[`${channel}-decisions`]++;
        return record;
    }

    function recordActionAttempt(decision, actionIndex, action, returnValue) {
        return emitRecord('action-attempt', decision.phase, {
            decisionId: decision.decisionId,
            actionId: `${decision.decisionId}#${actionIndex}`,
            channel: decision.channel,
            actorId: decision.actorId,
            method: action.method,
            target: targetSnapshot(action.target, action.targetKind),
            returnCode: Number.isSafeInteger(returnValue) ? returnValue : null,
        });
    }

    function recordCpuSample({ elapsedNs, limitNs, limitKind }) {
        if (!cpuCoverage || counts[cpuType] === 1) throw new Error('Unexpected runtime CPU sample');
        if (!Number.isSafeInteger(elapsedNs) || elapsedNs < 0 ||
            !Number.isSafeInteger(limitNs) || limitNs <= 0 ||
            limitKind !== (tick === 1 ? 'first-tick' : 'ordinary-tick')) {
            throw new Error('Invalid runtime CPU sample');
        }
        return emitRecord(cpuType, 'after-actions', {
            elapsedNs, limitNs, limitKind, unit: 'nanoseconds',
        });
    }

    function closeTick() {
        if (closed) return null;
        if (cpuCoverage && counts[cpuType] !== 1) throw new Error('Missing runtime CPU sample');
        const recordCount = sequence;
        const record = {
            type: 'evidence-coverage', formatVersion: cpuCoverage ? 2 : 1, buildId: runtimeBuildId,
            tick, phase: 'after-actions', sequence, recordId: `${tick}:${sequence}`,
            firstSequence: recordCount ? 0 : null,
            lastSequence: recordCount ? recordCount - 1 : null,
            recordCount,
            coveredTypes: [...(actionCoverage ? actionCoveredTypes : membershipTypes),
                ...(cpuCoverage ? [cpuType] : [])],
            counts: { ...counts },
            closed: true,
        };
        emit(record);
        closed = true;
        return record;
    }

    return { beginTick, recordMembership, recordActionDecision, recordActionAttempt,
        recordCpuSample, closeTick };
}

// M2 fixtures can still express membership-only closure semantics.
export const createMembershipEvidenceLogger = options =>
    createReplayEvidenceLogger({ ...options, actionCoverage: false, cpuCoverage: false });

const replayEvidence = createReplayEvidenceLogger();

export const beginEvidenceTick = (tick, reset) => replayEvidence.beginTick(tick, reset);
export const logMembershipEvidence = state => replayEvidence.recordMembership(state);
export const logActionDecision = decision => replayEvidence.recordActionDecision(decision);
export const logActionAttempt = (decision, actionIndex, action, returnValue) =>
    replayEvidence.recordActionAttempt(decision, actionIndex, action, returnValue);
export const logCpuEvidence = sample => replayEvidence.recordCpuSample(sample);
export const closeEvidenceTick = () => replayEvidence.closeTick();

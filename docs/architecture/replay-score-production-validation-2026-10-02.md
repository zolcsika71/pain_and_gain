# ADR 0005 production scoring validation — 2026-10-02

This record documents the bounded production verification of the scoring
compatibility implementation accepted by
[ADR 0005](../decisions/0005-replay-frame-scoring-evidence.md). The verified
implementation is commit `911aaf517d298c60b704d77b97811a88eb96fac8`
(`feat: support production replay score payloads`) on `main`. The selected
replay is `6abd7222b72ca0c20fa0bce2`, and the managed-review task is
`codex/adr0005-final-production-verification-20261002`.

The result is compatible for the exact selection below. It does not establish
support for other undocumented payload variants, complete timing, a final match
result, causal event attribution, or strategic benefit.

## Exact managed selection

The analyzer selected exactly 16 managed log records and 18 managed score
sources. The following JSON is the complete selection used by the verification;
it contains managed record fingerprints, not raw evidence:

```json
{
  "replayId": "6abd7222b72ca0c20fa0bce2",
  "logFingerprints": [
    "1fd09cfc4ff648c0748710ab9f597e76ca19775f1778c27bc7a3de1c6da6fde3",
    "3b283acf963530ac0bc96f44cf8c7725680d408e835d274375f22bd564c79baf",
    "459508a4a83c4242337370a4182293e2aac2e8abe29ffdc5b3676908ade385ac",
    "5f912540cfcb1dcb048bb2dbefdf2fa749a963b8b6c56fba87a4d0a8ffd2571c",
    "66b35cb94dee1ad0fd54d570936a61d94989be7cdf4b0a9f37ed023d18e877f2",
    "6e6fffba4de6725a80180befc7c0b5f0a265c9fd8c0b627bf5dc67cc894c33d5",
    "7a25c70ee74126060c90b0af0165d94fcfaf9b279b24308fd6823f9c8bff61ba",
    "8873d5fd5a11a822b79c9ff9424b77fb846f6f5335947ef5f75173ac907011f0",
    "8b0e57ef2e4f1a1136e0fdc38f371d86c9b775017afd8791b0ff58ddd0d1997f",
    "8f5ebfc8a97d76213905209935fde23c3e7c32b55e37024074eb1220063e8f42",
    "9cbdcec1847fe3e800851cc376246cbf747b857487f9b9906f5e7bfcbbb9e5cf",
    "a0d9d9e2ae3a45c4fb2533f704989abc0dd8c79ba55d915bd5bf8b8861a61f8d",
    "ac53103795ab29a8e94951dbe6bd8d295a5be4fb4320c4416c19a7bec476dbf5",
    "b406ec46d6ca87e857c5b344fc20ad44548f656015b20086048d6a81aa3e7cb6",
    "bea1992b7c54e8cc75a75ffd18f2a616d508a98563232c95f0e576524256a2e2",
    "db057efe93e3ea0ed2bd0afd1d83e827dadf88082257b2d8fa19db19339a775a"
  ],
  "scoreFingerprints": [
    "01f412b2a15019cc1215bddceaef45e941531fc43bf02651175c8124bb40f990",
    "1b6cdaa21b9707ef3dbd2b5e39ec57080ead53937d05c1df8ed43c922af64394",
    "27fd5a9047ea7f734c28cc3135773e624050f0b5f1c8b7a37aaae92e760f2953",
    "291b8c703fb0c4e3912e444aa8b05651f27a61916030839aec0477d73b951678",
    "35ae92e3ff851dcb906f361cc1296434a0bc37f020819b8cd2e5fd0c9d998060",
    "45bace9064f012b52983c1954f9b02d2db18ba510a12e94c612014fe4f05ceb9",
    "736e4755e0674ebb6887da68fe4823fe502df8a1f485503c5e57f075b1866430",
    "7ca5808898d9c0544934b45a6db451c9e59067f7031d649f904830d87fdafcc9",
    "8c2281dc4cfff8fc78c977587a7f29b98d1ee4d9fbe0c357246f05eac876e914",
    "8d7e68f22f4b9e9077080cf1ee86ffc700680025b9b3a12b825c31a8c6d5ad38",
    "962d659d2d99bf83f057a0893007f1588bfa2ebfd05907b172f8eb75f228b1da",
    "99851942bbd11272fd5d62d9c0dc5560d2e3854f0ba9572346075eb2fc7a42d4",
    "acf39fb7d45c74960cbcd3056955c1d1b82e077442f0b8b929c9a00af6997b36",
    "c03abf368ac58d9a5c5020543c4f472db8599c0df383d1619864ec5fbbdeda63",
    "e03bc6f34e44d9a36aa9e0b3d97508bdd1036f706fae8972b6d1a50cd9044479",
    "e0d46e91485d16e0d730491ad76c0086ae768f3aa761040132b5f1f04c2a6d59",
    "e6ef7bfb60bbfa7f96afca0ec8e19a73a125fcf4e9cf2e220582debdde61c419",
    "f79c2a4bc0eec9b2e43b6b31796f7b713ef70f7197a71eb2b7227b1ff4dfc6dd"
  ]
}
```

The score selection consists of one game-metadata response and 17 frame
responses. All 18 retained files passed path, regular-file, byte-count, and
hash validation, and all 18 stored validation/coverage summaries matched exact
recomputation. The metadata body was valid JSON with partial mapping validation.
The frame responses provide complete structural coverage of `gameTime` 0–1,536
in 17 separate local segments. Numerical adjacency did not merge them.

Structural coverage is not scoring coverage. The `gameTime` 0 frame is
structurally valid, but all four expected scoring items are missing. The other
1,536 frames have valid `cumulativeScore` and `displayedGain` items for both
slots. Retention and structural validity therefore do not imply a valid score
observation at frame 0.

## Supported results

Validated nested metadata references and group-local replay object ownership
agree that `player1` is ours in every one of the 17 source-qualified groups.
This result is evidence-derived; it is not based on slot position, username, or
an earlier conclusion.

| `gameTime` span | Score source fingerprint | Mapping | Tick alignment |
| ---: | --- | --- | --- |
| 0 | `c03abf368ac58d9a5c5020543c4f472db8599c0df383d1619864ec5fbbdeda63` | `player1` is ours | Unknown: compared-field conflict and insufficient comparisons |
| 1–100 | `291b8c703fb0c4e3912e444aa8b05651f27a61916030839aec0477d73b951678` | `player1` is ours | Established offset `+1` |
| 101–200 | `35ae92e3ff851dcb906f361cc1296434a0bc37f020819b8cd2e5fd0c9d998060` | `player1` is ours | Established offset `+1` |
| 201–300 | `e0d46e91485d16e0d730491ad76c0086ae768f3aa761040132b5f1f04c2a6d59` | `player1` is ours | Unknown: multiple offsets |
| 301–400 | `acf39fb7d45c74960cbcd3056955c1d1b82e077442f0b8b929c9a00af6997b36` | `player1` is ours | Unknown: multiple offsets |
| 401–500 | `27fd5a9047ea7f734c28cc3135773e624050f0b5f1c8b7a37aaae92e760f2953` | `player1` is ours | Unknown: multiple offsets |
| 501–600 | `8c2281dc4cfff8fc78c977587a7f29b98d1ee4d9fbe0c357246f05eac876e914` | `player1` is ours | Unknown: multiple offsets |
| 601–700 | `45bace9064f012b52983c1954f9b02d2db18ba510a12e94c612014fe4f05ceb9` | `player1` is ours | Unknown: multiple offsets |
| 701–800 | `7ca5808898d9c0544934b45a6db451c9e59067f7031d649f904830d87fdafcc9` | `player1` is ours | Unknown: multiple offsets |
| 801–900 | `01f412b2a15019cc1215bddceaef45e941531fc43bf02651175c8124bb40f990` | `player1` is ours | Unknown: multiple offsets |
| 901–1,000 | `e03bc6f34e44d9a36aa9e0b3d97508bdd1036f706fae8972b6d1a50cd9044479` | `player1` is ours | Unknown: multiple offsets |
| 1,001–1,100 | `99851942bbd11272fd5d62d9c0dc5560d2e3854f0ba9572346075eb2fc7a42d4` | `player1` is ours | Unknown: multiple offsets |
| 1,101–1,200 | `e6ef7bfb60bbfa7f96afca0ec8e19a73a125fcf4e9cf2e220582debdde61c419` | `player1` is ours | Unknown: multiple offsets |
| 1,201–1,300 | `1b6cdaa21b9707ef3dbd2b5e39ec57080ead53937d05c1df8ed43c922af64394` | `player1` is ours | Unknown: multiple offsets |
| 1,301–1,400 | `736e4755e0674ebb6887da68fe4823fe502df8a1f485503c5e57f075b1866430` | `player1` is ours | Established offset `+1` |
| 1,401–1,500 | `f79c2a4bc0eec9b2e43b6b31796f7b713ef70f7197a71eb2b7227b1ff4dfc6dd` | `player1` is ours | Unknown: multiple offsets |
| 1,501–1,536 | `8d7e68f22f4b9e9077080cf1ee86ffc700680025b9b3a12b825c31a8c6d5ad38` | `player1` is ours | Unknown: multiple offsets |

The three established alignment groups each use contributing snapshots tagged
with runtime build
`cc9d4e61eaac6962dde089593d5779d094b8ec58d1ae27c07228f136bccf1f85`.
Fourteen groups remain unknown, so global alignment is unknown. The analyzer
therefore does not promote those group-local contributors into a global build
association: global build association is unknown, no objective/escort event
association is emitted, and timing remains independent of player mapping.

The report contains 3,074 slot observations: 1,537 ours and 1,537 opponent.
There are 3,072 available cumulative-score values, 3,072 available displayed
gains, and 3,040 derived score changes. The 34 `initial` observations—two at
each of 17 group boundaries—prevent unsupported cross-source deltas. No score
decrease was observed.

`cumulativeScore`, `displayedGain`, and `derivedScoreChange` remain distinct.
At the greatest observed `gameTime`, 1,536, the cumulative scores repeat while
the displayed gains remain nonzero:

| Player | Last observed cumulative score | Displayed gain | Derived score change |
| --- | ---: | ---: | ---: |
| Ours | 7,490 | 5 | 0 |
| Opponent | 19,130 | 13 | 0 |

The supported differences at that observation are cumulative score `-11,640`,
displayed gain `-8`, and derived score change `0`. These are last observed
measurements, not asserted final scores. The selected replay-frame sources do
not establish terminal match state, so terminal status remains unknown.

## Uncertainty and compatibility boundary

The full report contains 242,647 pass findings, no failures, and 46 unknowns.
The score-specific unknowns are global tick alignment, build association, event
association, and terminal status. Partial group results do not remove those
global unknowns.

The production payload did not contain the contradictory partial ownership,
malformed simultaneous identity, or conflicting simultaneous flag cases fixed
in the final compatibility patch. Their conservative rejection and downstream
suppression were verified with isolated synthetic regressions, not exercised by
this production payload. This production run therefore establishes compatibility
with the observed retained structures, not independent production coverage of
every rejection branch.

The current verification performed one analyzer/serializer run. Its full-output
hash matches the historical pre-remediation output, but a fresh second run was
not performed, so current two-run determinism was not rechecked. Historical
results are comparison evidence, not a substitute for that omitted current
check.

## Incremental writer completion

The published `writeJsonReport` API serialized the complete report to an
asynchronous counting/SHA-256 sink. No full report file was retained.

| Measurement | Result |
| --- | ---: |
| Serialized bytes | 1,698,426,667 |
| SHA-256 | `6be57f1ee7f6a8c5fc2e6c57811cbd9ed885331e52b1a4a0ffd6deca7f62bca7` |
| Submitted writes | 25,908 |
| Completed writes at return | 25,908 |
| Backpressured writes | 25,908 |
| Pending writes at return | 0 |
| Maximum pending writes | 1 |

The destination remained open, not destroyed, not ended, and caller-owned.
Temporary `error` and `close` listener counts returned to zero. This verifies
completion and bounded output buffering, not bounded analysis memory. The
analyzer and report objects remain fully materialized in memory; incremental
serialization avoids only an additional whole-report JSON string.

## Evidence preservation and lifecycle

Before analysis, all 34 selected artifacts were regular non-symlink files. They
totaled 40,819,126 bytes. Their ordered artifact metadata/content set had
SHA-256 `b5c35460e026fb710f18e6457b6d5cd048dc90b78162a06f6e55f5db26dc18b5`
before analysis and after the final lifecycle update.

The task added exact `claim` and `examined` entries for the 16 log and 18 score
records. All 34 task entries retain `completedAt: null`. Earlier owners and
reviews were preserved. Stored validation/coverage summaries, non-review record
fields, artifacts, and prior review entries retained their respective aggregate
hashes:

- stored summaries:
  `c09cd49ed2e58dcabaf0f6e2252ff2eecbd507901ccb8c07395bac016f1294d6`;
- non-review selected-record fields:
  `14bde7fc93e4a21f2e90df37f43cc80fa8885fcf48e0974177b269d136b93b41`;
- the two prior production-review entries:
  `f36f175dcdf2ef6abbad62043288a23dba7ca2910012a6d5ca599ea99c0ff0ba`.

The manifest changed only through those authorized review entries, from
SHA-256 `873e9f2fad4b8aab93ca76e56842a1dd608c6e573cc0f1d3dd4039d44bf2a088`
to `9c836158e28ce4052d14d85d8435b9a9f768ec032a9165fa96622816e733c137`.
No review was completed, and no source was imported, rewritten, retired, or
cleaned up.

## Self-contained reproduction procedure

This recipe uses only the published `analyzeReplay` and `writeJsonReport` APIs,
the exact selection embedded above, and fresh temporary files chosen by the
operator. It does not depend on the historical `/tmp` verification directory
or retain the full report.

Prerequisites:

1. Check out commit `911aaf517d298c60b704d77b97811a88eb96fac8` with the
   exact selected managed records and artifacts still retained locally.
2. Follow the replay ownership rules in the repository README. Before any body
   access, choose a new unique task ID and claim every exact log and score
   fingerprint. Preserve existing owners and reviews. After analysis, mark only
   those records `examined`; do not use `done` unless that separate review is
   explicitly complete. Retained continuing reviews keep `completedAt: null`.
3. Copy the JSON block under [Exact managed selection](#exact-managed-selection)
   to `selection.json` and the JavaScript block below to
   `verify-replay-score-production.mjs` inside a fresh directory outside the
   repository. Inspect generated review commands before executing them.
4. Budget memory for a fully materialized analysis/report. The original run used
   an 8 GiB Node.js old-space limit. The counting sink avoids writing a 1.70 GB
   report file but does not reduce report construction memory.

```js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const [mode, ...args] = process.argv.slice(2);
const fingerprintPattern = /^[a-f0-9]{64}$/;
const replayPattern = /^[a-f0-9]{24}$/;

function readSelection(selectionPath) {
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  if (!replayPattern.test(selection.replayId) ||
      selection.logFingerprints.length !== 16 ||
      selection.scoreFingerprints.length !== 18 ||
      [...selection.logFingerprints, ...selection.scoreFingerprints]
        .some(value => !fingerprintPattern.test(value))) {
    throw new Error('Selection is not the documented 16-log/18-score shape');
  }
  return selection;
}

if (mode === 'review-commands') {
  const [selectionPath, transition, taskId] = args;
  if (!['claim', 'examined'].includes(transition) ||
      !/^[A-Za-z0-9/_-]+$/.test(taskId ?? '')) {
    throw new Error('usage: review-commands <selection.json> <claim|examined> <task-id>');
  }
  const selection = readSelection(selectionPath);
  const logCommand = transition;
  const scoreCommand = `score-${transition}`;
  for (const fingerprint of selection.logFingerprints) {
    console.log(`node tools/replay-logs.js ${logCommand} ${selection.replayId} ${fingerprint} ${taskId}`);
  }
  for (const fingerprint of selection.scoreFingerprints) {
    console.log(`node tools/replay-logs.js ${scoreCommand} ${selection.replayId} ${fingerprint} ${taskId}`);
  }
  process.exit(0);
}

if (mode !== 'analyze' || args.length !== 3) {
  throw new Error('usage: analyze <repository-root> <selection.json> <summary.json>');
}

const [repositoryRoot, selectionPath, summaryPath] = args;
const root = path.resolve(repositoryRoot);
const selection = readSelection(selectionPath);
const { analyzeReplay, writeJsonReport } = await import(
  pathToFileURL(path.join(root, 'tools/replay-analysis.js'))
);

const report = analyzeReplay({
  root,
  replayId: selection.replayId,
  fingerprints: selection.logFingerprints,
  scoreFingerprints: selection.scoreFingerprints,
});

class CountingHashSink extends Writable {
  constructor() {
    super({ highWaterMark: 16 * 1024 });
    this.hash = crypto.createHash('sha256');
    this.bytes = 0;
    this.writeCalls = 0;
    this.completedWrites = 0;
    this.pendingWrites = 0;
    this.maxPendingWrites = 0;
    this.falseWrites = 0;
  }

  write(chunk, encoding, callback) {
    this.writeCalls++;
    this.pendingWrites++;
    this.maxPendingWrites = Math.max(this.maxPendingWrites, this.pendingWrites);
    const originalCallback = typeof encoding === 'function' ? encoding : callback;
    const normalizedEncoding = typeof encoding === 'string' ? encoding : undefined;
    const wrappedCallback = error => {
      this.pendingWrites--;
      this.completedWrites++;
      originalCallback?.(error);
    };
    const accepted = super.write(chunk, normalizedEncoding, wrappedCallback);
    if (!accepted) this.falseWrites++;
    return accepted;
  }

  _write(chunk, _encoding, callback) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    setImmediate(callback);
  }
}

const sink = new CountingHashSink();
const listenersBefore = {
  error: sink.listenerCount('error'),
  close: sink.listenerCount('close'),
};
await writeJsonReport(report, sink);

const scoring = report.scoring;
const segments = new Map(scoring.segments.map(segment => [segment.id, segment]));
const mappingByGroup = new Map(scoring.mapping.groups.map(item => [item.groupId, item]));
const alignmentByGroup = new Map(scoring.alignment.groups.map(item => [item.groupId, item]));

const groups = scoring.groups.map(group => {
  const members = group.segmentIds.map(id => segments.get(id));
  const alignment = alignmentByGroup.get(group.id);
  const mapping = mappingByGroup.get(group.id);
  const offsets = alignment.candidates.map(candidate => candidate.offset);
  return {
    groupId: group.id,
    sourceFingerprints: [...new Set(members.map(item => item.sourceFingerprint))].sort(),
    firstGameTime: Math.min(...members.map(item => item.firstGameTime)),
    lastGameTime: Math.max(...members.map(item => item.lastGameTime)),
    basis: group.basis,
    rejectedComponent: group.rejectedComponent,
    mapping: {
      status: mapping.status,
      oursSlot: mapping.oursSlot,
      opponentSlot: mapping.opponentSlot,
    },
    alignment: {
      status: alignment.status,
      offset: alignment.offset,
      blockedBy: alignment.blockedBy,
      candidateCount: alignment.candidates.length,
      candidateOffsetRange: offsets.length
        ? [Math.min(...offsets), Math.max(...offsets)]
        : null,
      establishedSupport: alignment.status === 'established'
        ? {
            firstGameTime: alignment.candidates[0].firstGameTime,
            lastGameTime: alignment.candidates[0].lastGameTime,
            matchedTimes: alignment.candidates[0].matchedTimes,
            comparisonCount: alignment.candidates[0].comparisonCount,
            contributorBuildIds: [...new Set(alignment.candidates[0].contributors
              .map(item => item.buildId))].sort(),
          }
        : null,
    },
  };
}).sort((left, right) => left.firstGameTime - right.firstGameTime);

const countBy = (values, read) => Object.fromEntries([...values.reduce((counts, value) => {
  const key = String(read(value) ?? 'null');
  counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}, new Map())].sort(([left], [right]) => left.localeCompare(right)));

const ordered = [...scoring.observations].sort((left, right) =>
  left.groupId.localeCompare(right.groupId) ||
  left.slot.localeCompare(right.slot) ||
  left.gameTime - right.gameTime
);
let previous = null;
let repeatedScoreWithNonzeroGain = 0;
for (const observation of ordered) {
  if (previous && previous.groupId === observation.groupId &&
      previous.slot === observation.slot &&
      previous.gameTime + 1 === observation.gameTime &&
      previous.cumulativeScore !== null &&
      previous.cumulativeScore === observation.cumulativeScore &&
      observation.displayedGain !== null && observation.displayedGain !== 0) {
    repeatedScoreWithNonzeroGain++;
  }
  previous = observation;
}

const maxGameTime = Math.max(...scoring.observations.map(item => item.gameTime));
const scoreFindingCounts = {};
for (const finding of report.findings.filter(item => item.rule.startsWith('score.'))) {
  scoreFindingCounts[finding.rule] ??= {};
  scoreFindingCounts[finding.rule][finding.verdict] =
    (scoreFindingCounts[finding.rule][finding.verdict] ?? 0) + 1;
}

const selectedLogs = [...report.selectedFingerprints].sort();
const selectedScores = [...report.selectedScoreFingerprints].sort();
const expectedLogs = [...selection.logFingerprints].sort();
const expectedScores = [...selection.scoreFingerprints].sort();
if (JSON.stringify(selectedLogs) !== JSON.stringify(expectedLogs) ||
    JSON.stringify(selectedScores) !== JSON.stringify(expectedScores)) {
  throw new Error('Analyzer did not select exactly the documented records');
}

const summary = {
  replayId: report.replayId,
  selectedLogs,
  selectedScores,
  reportSummary: report.summary,
  serializedOutput: {
    bytes: sink.bytes,
    sha256: sink.hash.digest('hex'),
    writeCalls: sink.writeCalls,
    completedWrites: sink.completedWrites,
    pendingWrites: sink.pendingWrites,
    maxPendingWrites: sink.maxPendingWrites,
    backpressuredWrites: sink.falseWrites,
    destination: {
      destroyed: sink.destroyed,
      closed: sink.closed,
      writableEnded: sink.writableEnded,
      writableFinished: sink.writableFinished,
    },
    listenersBefore,
    listenersAfter: {
      error: sink.listenerCount('error'),
      close: sink.listenerCount('close'),
    },
  },
  scoring: {
    sourceCount: scoring.sources.length,
    sourceIntegrity: countBy(scoring.sources, source => source.integrity),
    sources: scoring.sources.map(source => ({
      fingerprint: source.fingerprint,
      kind: source.kind,
      requestedGameTime: source.requestedGameTime,
      integrity: source.integrity,
      coverage: source.coverage
        ? {
            status: source.coverage.status,
            totalFrames: source.coverage.totalFrames,
            validFrames: source.coverage.validFrames,
            invalidFrames: source.coverage.invalidFrames,
          }
        : null,
      validation: source.validation
        ? {
            transport: source.validation.transport,
            json: source.validation.json,
            metadata: source.validation.metadata,
            frames: source.validation.frames,
            ui: source.validation.ui,
            items: {
              status: source.validation.items.status,
              counts: source.validation.items.counts,
              blockedBy: source.validation.items.blockedBy,
            },
          }
        : null,
    })),
    groups,
    mapping: {
      status: scoring.mapping.status,
      oursSlot: scoring.mapping.oursSlot,
      opponentSlot: scoring.mapping.opponentSlot,
    },
    alignment: {
      status: scoring.alignment.status,
      offset: scoring.alignment.offset,
      contributorCount: scoring.alignment.contributors.length,
    },
    buildAssociation: scoring.buildAssociation,
    observations: {
      count: scoring.observations.length,
      player: countBy(scoring.observations, item => item.player),
      derivedStatus: countBy(scoring.observations, item => item.derivedStatus),
      gainComparison: countBy(scoring.observations, item => item.gainComparison),
      cumulativeAvailable: scoring.observations.filter(item => item.cumulativeScore !== null).length,
      displayedGainAvailable: scoring.observations.filter(item => item.displayedGain !== null).length,
      derivedChangeAvailable: scoring.observations.filter(item => item.derivedScoreChange !== null).length,
      repeatedScoreWithNonzeroGain,
      maxGameTime,
      atMaxGameTime: scoring.observations.filter(item => item.gameTime === maxGameTime)
        .map(item => ({
          groupId: item.groupId,
          slot: item.slot,
          player: item.player,
          cumulativeScore: item.cumulativeScore,
          displayedGain: item.displayedGain,
          derivedScoreChange: item.derivedScoreChange,
          derivedStatus: item.derivedStatus,
          gainComparison: item.gainComparison,
        })),
    },
    comparisons: {
      count: scoring.comparisons.length,
      mapped: scoring.comparisons.filter(item => item.oursSlot !== null).length,
      scoreDifferenceAvailable: scoring.comparisons
        .filter(item => item.scoreDifference !== null).length,
      displayedGainDifferenceAvailable: scoring.comparisons
        .filter(item => item.displayedGainDifference !== null).length,
      derivedChangeDifferenceAvailable: scoring.comparisons
        .filter(item => item.derivedScoreChangeDifference !== null).length,
    },
    events: scoring.events.length,
    terminal: scoring.terminal,
  },
  scoreFindingCounts,
};

fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  summaryPath: path.resolve(summaryPath),
  reportSummary: summary.reportSummary,
  serializedOutput: summary.serializedOutput,
  mapping: summary.scoring.mapping,
  alignment: summary.scoring.alignment,
  buildAssociation: summary.scoring.buildAssociation,
  events: summary.scoring.events,
  terminal: summary.scoring.terminal,
}, null, 2));
```

From the repository root, prepare review commands and run the bounded analysis:

```sh
verification_dir="$(mktemp -d -t pain-gain-score-validation)"
# Save the embedded blocks as:
#   "$verification_dir/selection.json"
#   "$verification_dir/verify-replay-score-production.mjs"

review_task='codex/choose-a-new-unique-task-id'
node "$verification_dir/verify-replay-score-production.mjs" \
  review-commands "$verification_dir/selection.json" claim "$review_task" \
  > "$verification_dir/claim.sh"
# Inspect claim.sh, then execute it from the repository root before body access.
sh "$verification_dir/claim.sh"

node --max-old-space-size=8192 \
  "$verification_dir/verify-replay-score-production.mjs" analyze "$PWD" \
  "$verification_dir/selection.json" "$verification_dir/summary.json"

node "$verification_dir/verify-replay-score-production.mjs" \
  review-commands "$verification_dir/selection.json" examined "$review_task" \
  > "$verification_dir/examined.sh"
# Inspect examined.sh, then execute it from the repository root.
sh "$verification_dir/examined.sh"
```

The SHA-256 printed by this harness is for every byte submitted through the
published full-report writer. The smaller `summary.json` has its own unrelated
file hash and must never be described as the full-report hash. A future run may
produce a different full hash if the implementation, selected managed records,
or validated summaries differ; investigate rather than weakening selection or
evidence checks.

## Verification scope

The production run was read-only except for the exact managed-review claim and
examination entries described above. It used retained evidence only and did not
perform cache discovery, import, capture, match launch, broad listing, global
reconciliation, completion, cleanup, or retirement. It made no implementation,
runtime, configuration, or gameplay change.

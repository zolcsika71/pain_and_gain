# Fixture-only bounded legacy members

Status: implemented for generated synthetic input only; no production dispatch,
database, conversion, migration or qualification activation. This is a narrow
input seam toward the [migration plan](replay-production-sqlite-migration-plan-2026-10-11.md),
not completion of its general overflow-preserving input/conversion requirements.

## Reuse and exact gap

[replay-legacy-reader.js](../../tools/replay-legacy-reader.js) already exposes
`writeFixtureV2Other`: a pinned-file reader selecting one `otherEntries` array.
It does not expose complete record/review/map/replay metadata incrementally.
The [conversion slice](replay-conversion-slice.md) now consumes complete selected
metadata through this member interface instead of parsing its manifest whole.

`readFixtureV2Members` reuses the same fixture directory/marker contract and the
existing [Scanner](../../tools/replay-legacy-json.js) grammar and array iterator.
The iterator has an opt-in range mode; its default parsed-element behavior is
unchanged. A bounded scanner subclass adds duplicate-key/depth/iteration checks,
not a second JSON parser. The existing `other` adapter retains its historical
last-key-wins and replacement-decoding semantics. The converter calls this API
through an explicit layout matching its existing fixture-root permissions.

## API and limits

```js
await readFixtureV2Members({synthetic: true, root, limits: {memberBytes: 1024}},
    async event => { /* Consume this event; do not accumulate a corpus. */ });
```

Require resident Node major 24, version 24.19+, macOS, and an explicit canonical
direct temporary root named `pain-gain-v2-reader-fixture-*`. The existing marker
declares `replay-v2-reader`, version 1, `local-apfs`; this is not durability proof.
Production/trial roots and aliases reject before manifest access. Only the marker
and `replay_logs/manifest.json` are opened, read-only, after residency checks.
No linked original map/log/score payload is opened, embedded, rewritten or verified.

The opt-in `layout: 'conversion'` selects only canonical temporary roots named
`pain-gain-v2-conversion-fixture-*`, the existing `.v2-conversion-fixture.json`
marker (`{"fixture":"synthetic-v2-conversion","version":1}`) and root-level
`manifest.json`. This layout caps the marker at 4 KiB and input at 2 MiB, even
if larger reader defaults are requested. It does not permit arbitrary filenames,
production/trial roots or missing/mismatched markers. The default `reader` layout
and historical `writeFixtureV2Other` root permissions are unchanged. `layout` is
captured and validated by the same private option-snapshot rules below.

Options and nested `limits` must be plain objects with supported own data
properties. Accessors (including nonenumerable or setter-only properties) and
custom prototypes reject without invoking getters; inherited properties never
supply options. The API copies root/opt-in values and every limit into private
state before validation and uses only that snapshot. Caller or awaited-callback
mutations cannot redirect the root or change effective limits. Ordinary mutable
data options remain supported; the caller's objects are not frozen or modified.

Limits are exported as `legacyMemberLimits`; overrides may only reduce them:

| Limit | Default maximum |
| --- | --- |
| Entire synthetic input | 16 MiB, checked before scanning |
| Materialized member or unknown root value | 1 MiB raw UTF-8 bytes |
| Open container depth | 64 |
| Properties per object / raw JSON key token | 128 / 256 bytes (including quotes/escapes) |
| JSON values visited in full structural scan | 65,536 |
| Callback events per traversal | 4,096, including collection headers |
| File read chunk / marker | 64 KiB / 16 KiB |

The scanner first validates the entire grammar and duplicates through EOF,
retaining only bounded root-field spans and nesting/key state. It then preflights
each member independently, then traverses again with awaited callbacks. It never
builds a whole-manifest string, record array or corpus-sized offset table.
One bounded member (raw bytes plus native parsed value) is materialized at a time;
consumers are responsible for not retaining all callback values. There is no
background read-ahead. Input size and iteration limits bound parsing work, not a
hard deadline for arbitrary user callbacks.

Required root fields are version 2 and array `maps`, `replays`, `records`.
Present `scoreRecords` and `retiredScoreSources` must be arrays. Unknown root
properties are emitted, never skipped. Events preserve source order:

- `property`: `name`, root `ordinal`, `start`/`end` byte span, `raw`, `value`.
- `collection`: `name`, root `ordinal`, `count`, collection `start`/`end`.
  Even empty collections emit this event; absent collections emit nothing.
- `member`: collection `name`, `rootOrdinal`, member `ordinal`, `start`/`end`,
  `raw`, `value`. Duplicate record identities remain distinct occurrences.

Spans are addresses on the pinned descriptor, not durable identities/checkpoints.
`raw` retains exact metadata-member syntax, including numeric property order and
numeric spelling; `value` uses native JSON numeric precision/key ordering. Reviews,
unknown fields, diagnostic raw strings/order and map/replay reference values are
not filtered. Semantic identity/association validation belongs to a later consumer;
this reader does not infer missing IDs, repair conflicts or bless payload hashes.

Duplicate JSON keys, malformed/truncated grammar, invalid UTF-8 and nonfinite
native numbers fail explicitly rather than being silently normalized. Oversized
members (including large embedded diagnostic arrays or unknown root values) return
`RESOURCE_LIMIT` in this default API. A separate diagnostic-only streaming API
is described below; general sub-value overflow remains unsupported. Do not
raise caps or call this a general production input converter. New strict behavior
is opt-in and does not change the historical M2b compatibility contract.

## File lifetime, failure and validation

Use one manifest descriptor through preflight and all callbacks. Atomic pathname
replacement/unlink leaves the old pinned input usable. Observed size/mtime changes
on that descriptor reject before/between/after callbacks; arbitrary in-place writes
that evade those checks remain unqualified. Parsing/limit failures precede callbacks.
A later I/O, callback or changed-source failure can leave an emitted prefix, but
never a returned `{complete: true}` result. Repeat starts from the beginning;
no persisted cursor or resume/cutover state is created.

All acquired descriptors are closed, including open-followed-by-inspection failure.
An original Error/code remains primary; simultaneous closes attach `cleanupFailures`.
Close-only failures reject. A non-Error thrown value stays unchanged if cleanup
succeeds; combined cleanup failure uses `AggregateError` with that original cause
and both failures. No failure becomes a successful empty stream.

[Focused tests](../../tests/unit/replay-legacy-members.test.js) use retained,
newly generated fixtures, controlled small limits, exact-byte comparisons, forbidden
whole-file/payload reads, backpressure, corruption/interruption and descriptor faults.
Run with an explicitly selected resident runtime:

```sh
"$NODE24" --test tests/unit/replay-legacy-members.test.js
```

Do not run the historical 600 MiB qualification cases for this small seam. No SQLite
test/store is needed; converter validation is reused only with unchanged source.
Implementation verification on 2026-10-11 recorded 30 new passing tests on Node
24.19.0. A compatibility command intended to exclude the 600 MiB cases instead
ran all 13 legacy tests, including both large synthetic cases. This was a test-scope
error, not authorized renewed qualification; the fixtures were synthetic and the
legacy harness disposed only its own newly created fixtures. No production data
or databases were accessed. New member-test fixtures and command outputs are
retained at the locations recorded under:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/legacy-members-20261011-6Gito8/`.

The options-validation correction was verified separately: both getter-bypass
regressions failed against the pre-fix implementation. Afterward, all 42 focused
member tests and two explicitly named small legacy-compatibility tests passed on
Node 24.19.0. Coverage includes accessor/inherited options, callback-time changes
and the exact 4,096-event boundary with small records. No 600 MiB case or broad
qualification suite ran for this correction. Before/after receipts and retained
member-fixture locations:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/legacy-members-options-fix-20261011-iw3zWw/`.

Production manifest capacity, general conversion, exporter/cutover/rollback and
raw-HTTP admission remain unresolved. M2h remains paused/unqualified; lost historical
evidence, prior Git-blob hydration and the pack residency change with unestablished
cause remain disclosed. No production migration readiness follows from these tests.

## Opt-in diagnostic collection streaming

`readFixtureV2DiagnosticMembers(options, sink)` is a separate synthetic-only API.
`readFixtureV2Members` and the legacy `other` adapter retain their defaults and
behavior. The same strict scanner, guarded layouts, private options, pinned input,
awaited callback and cleanup contracts apply. No database or publication occurs
in this reader.

For log `records` only, the new API observes immediate property spans rather
than parsing the entire record. An event's `value` is **metadata only**:
`otherEntries: null` is a layout marker at the original property ordinal, not an
original null or empty diagnostic value. No whole-record `raw` is exposed.
`event.diagnostics` provides `count`, raw collection `bytes` and an `entries()`
factory yielding one complete wrapper at a time. Consume it inside the awaited
callback; iterators/factories reject after that callback with `CLOSED`. Do not
accumulate wrappers. Other collections and root properties retain normal events.

Fixed streaming maxima (overrides may only reduce them): 4 MiB raw diagnostic
array, 4,096 wrappers, 64 KiB raw JSON per wrapper, 32 KiB per scalar JSON token,
and 1 MiB aggregate non-diagnostic metadata per log record. Existing 16 MiB
input, depth 64, 128 keys, 256-byte keys, 65,536 values and 4,096 callback events
remain. Streaming adds cooperative 60-second, 256 MiB heap and 512 MiB RSS checks;
it does not cancel blocked filesystem operations or nonreturning callbacks.

Full structural/duplicate/limit validation and decoding preflight precede
callbacks. Diagnostic wrappers are reparsed on demand from the pinned descriptor,
not collected in an array. Ordinary wrapper values and raw strings are preserved;
the converter rejects unsupported native number/key-order cases as before.
Large individual wrappers/scalars and large non-diagnostic values remain capped;
this is not general sub-value overflow or production manifest conversion.

See the [streaming conversion contract](replay-bounded-conversion-fixture.md#opt-in-streaming-diagnostics)
and [focused tests](../../tests/unit/replay-diagnostic-streaming.test.js).

### Explicit expanded synthetic capacity

`readFixtureV2DiagnosticMembers({synthetic: true, root,
capacity: 'expanded-synthetic-v1'}, sink)` opts into finite larger collection
bounds. Only the `reader` layout supports this profile. Ordinary member reading,
the conversion-slice layout, legacy adapters and default streaming limits remain
unchanged. Unknown profiles, accessors, inherited options and nonfinite limits
reject; capacity and nested limit values are copied before any asynchronous work.

The profile caps input at 64 MiB, each diagnostic array at 16 MiB and 8,192
wrappers, structural values at 1,000,000, and cooperative elapsed time at ten
minutes. Overrides only reduce these limits. The 1 MiB metadata/member, 64 KiB
wrapper, 32 KiB scalar token, depth-64, 4,096-event, 256 MiB heap and 512 MiB RSS
limits remain. These memory/deadline checks cannot interrupt blocked filesystem
calls or a nonreturning callback. Individual wrapper/scalar capacity beyond these
bounds remains unsupported; corpus counts do not establish maximum token sizes.

The scanner still retains bounded spans, one metadata member and one diagnostic
wrapper at a time, with awaited callbacks; callers must not accumulate emitted
wrappers. No whole-manifest string/object is produced. See the
[converter capacity contract](replay-bounded-conversion-fixture.md#expanded-synthetic-capacity)
and [focused capacity tests](../../tests/unit/replay-conversion-capacity.test.js).
Larger profiles remain synthetic-only, not permission to read production evidence.

### Backup-sized synthetic profile

`readFixtureV2DiagnosticMembers({synthetic: true, root,
capacity: 'backup-sized-synthetic-v1'}, sink)` inherits the expanded profile,
changing only input bytes to **600 MiB (629,145,600)** and structural values to
**8,000,000 per scanner pass**. The converter separately bounds original artifact
bytes. This is an explicit synthetic capacity setting, not backup access or
production conversion permission. Existing default/expanded limits and the
conversion-slice layout are unchanged. Only the diagnostic reader's guarded
`reader` layout accepts the profile; unknown profiles and upward/nonfinite
overrides reject before input use.

Both new ceilings flow through the existing private options snapshot, file-size
check and incremental structural scanner. Reduced budgets still fail explicitly,
before callbacks when the initial scan exceeds them. Member/wrapper/scalar,
event/count, nesting, I/O, cooperative memory and ten-minute elapsed limits are
unchanged. No complete manifest or diagnostic array is materialized.

See the [converter contract](replay-bounded-conversion-fixture.md#backup-sized-synthetic-profile)
and [small retained tests](../../tests/unit/replay-conversion-backup-capacity.test.js).
Only reduced-boundary behavior is exercised; full-size execution is untested.

## Separate backup-rehearsal scope

`readRehearsalV2DiagnosticMembers` reuses the same parser through an opaque,
inventory-verified capability from the [backup-rehearsal contract](replay-backup-rehearsal.md).
It accepts the separate backup layout without a synthetic marker and reports
`backupRehearsal`, not `fixtureOnly`. Existing fixture functions do not accept
that scope or those roots. This interface was exercised only with generated small
backup-shaped fixtures; real-backup execution requires separate authorization.

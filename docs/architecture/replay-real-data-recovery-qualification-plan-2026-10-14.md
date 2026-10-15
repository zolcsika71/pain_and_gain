# Isolated real-data recovery qualification plan

Status: **candidate-11/harness-v8 is the current PREPARED BUT UNAUTHORIZED
consolidated scope, validated with generated inputs only. Release-06 snapshot
qualification completed historically; no new real execution is authorized.**
The bounded read-only cache assessment confirmed a score metadata capacity gap
(74 provenance files, maximum 69,624-byte `/validation`). Synthetic external-property
publication/reconstruction now addresses it, without raising inline ceilings.
Historical candidate-10/harness-v7 pins and checks are in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/score-validation-property-20261015-GDBRFY/report.json`.
The historical `harness-v7` real plan remains intentionally execution-blocked: its inherited
eight snapshot phases do not qualify original-cache import/reimport/scan. A concrete
consolidated scope and pinned cache inventory are now prepared in candidate-11/harness-v8
below; separate execution authorization is still required. Do not run another
snapshot-only plan. No real cache or backup payload is reread by this correction.
Candidate-10/harness-v7, candidate-09 and older pins/commands below are historical
and superseded; their retained instructions do not define the current run scope.

### Consolidated successor — 2026-10-15

**Current scope: candidate-11/harness-v8 — PREPARED BUT UNAUTHORIZED.**
Only the proposed command below may be considered after separate authorization
of this exact twelve-phase scope by Zolcsika. Documentation approval is not execution
approval. Retained source/control releases remain immutable.

The [inventory-bound capability](replay-backup-rehearsal.md#inventory-bound-cache-continuation--2026-10-15)
connects selected `import`, `score-import` and bounded log `scan`. The original
candidate-10/harness-v7 remain unchanged and fenced. The successor includes the
conversion CLI, command dependencies and exact Node 24.19.0 runtime. Its separate
pinned harness requires these twelve phases; no snapshot-only real mode exists.

| Phase | Required result |
| --- | --- |
| Source | Original backup/restore provenance, 432 snapshot files and control verification |
| Cache | Read-only classification of exactly 1,408 pinned original transports |
| Convert | Snapshot conversion into a fresh non-production destination |
| Preserve | Complete metadata, reviews, history, diagnostics and artifact comparison |
| Log reimports | All 291 snapshot-associated originals are verified duplicates |
| Scan | Only those 291 logs; neutral reconciliation and complete duplicate results |
| Score imports | All 95 separately selected score originals are verified duplicates, including complete validation hashes/lengths |
| Consumers | Neutral selected analysis; two claim/examined pairs create four generations |
| Prepare | Independent post-write backup and converted-source fencing |
| Restore | Restore using only retained release and recovery package |
| Repeat | Unchanged identity, generation, commitments and artifact bytes |
| Select | Restored authority, consumer comparison, approved restored review writes and final original-source preservation |

The 1,022 classification-only files are excluded from imports. Exact original
names, lengths and SHA-256 hashes are pinned; no directory expansion or transport
wrapping is allowed. Every duplicate phase must preserve generation, reviews,
provenance and retained files. Missing-map/deferred, unavailable, changed,
conflicting or unexpectedly new inputs stop the run. Scan does not authorize
deletion/status migration. Four review generations on each isolated copy are
the only planned logical writes.

Limits remain 1,800/1,860 seconds per phase, 256/512 MiB heap/RSS, 16 GiB retained
output, 20 GiB initially free and 2 TiB aggregate instrumented JavaScript I/O.
Per-phase I/O remains at most 192 GiB, with 128 GiB reserved for parent verification;
each next child's allowance is reduced to the remaining aggregate budget. Twelve
phase ceilings do not increase the total. Keep 64 KiB streaming buffers, 20,000
monitored entries, 500-ms watchdog polling and 2 MiB/file / 16 MiB aggregate
controls. Import's 60-second, scan's 180-second and classification's ten-minute
cooperative limits apply where stricter; all converter/core caps remain unchanged.
The parent reserves the remaining aggregate allowance before each child and
requires confirmed exit before proceeding. Existing shorter parser/import/scan
limits still apply. Native SQLite I/O is unmeasured. No retries, budget increases,
cleanup or automatic repair are authorized. A post-link crash leaving multiple
links is explicitly fenced with its artifacts retained.

Successor pins, exact command/destinations, small-mode and failure results, IDE
findings and self-review are retained under:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-inventory-imports-20261015-2mP9Yd/`.
Use only its completed `authorization.md` and pinned command after separate
execution authorization. Input lists remain historical controls, not fresh
certification of current cache bytes. Power-loss durability, production adoption
and M2h remain separate gates.

The exact proposed command and pins below match that retained `authorization.md`;
**not executed and not authorized by this handoff**. Require retained Node 24.19.0
and empty `NODE_OPTIONS` and `NODE_PATH`.

```sh
/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-inventory-imports-20261015-2mP9Yd/release-candidate-11/runtime/node \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-inventory-imports-20261015-2mP9Yd/harness-v8/launch.cjs \
  e6a3ac17662d439a907ca287c3db33ed7373c3e1e914a86c38f838ca46380710 \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-inventory-imports-20261015-2mP9Yd/harness-v8/real-plan.json \
  97f7564f45289247ba4d2edcbee1ffc375bd2ba003524660cffdb7958e999b53
```

| Current pin | SHA-256 |
| --- | --- |
| `release-candidate-11/release.json` | `13cb01b463c787774f79d6285dbcf9dec1e52505f74725dd2340b7f56d3b4795` |
| Retained Node 24.19.0 | `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1` |
| `harness-v8/harness.json` | `e6a3ac17662d439a907ca287c3db33ed7373c3e1e914a86c38f838ca46380710` |
| `harness-v8/real-plan.json` | `97f7564f45289247ba4d2edcbee1ffc375bd2ba003524660cffdb7958e999b53` |
| `harness-v8/real-capability.json` | `90c6fc36ff1b936953a81b24f3205d15e932904144bb0847aa8b3e3568a241fd` |
| `harness-v8/classification-inputs.json` — 1,408 read-only | `8622570dabe702697032c1197e0b44d90d3799178b3b88455b63987cb8b7c60e` |
| `harness-v8/logs-inputs.json` — 291 reimports/neutral scan | `b183534aa43d8e9174b86558c3fbc9ecfad46edcd077a65df770e81a26ba6ec3` |
| `harness-v8/scores-inputs.json` — 95 separate imports | `3b55c491f3c9b19f2bedc793a2af53551c95537daef491eeab2a8b117835d038` |
| `harness-v8/reimports-inputs.json` — exact union of 386 | `4268bf1bb26d53b7d65aa2583d77f0bb70f5877b14ceaeed01eaded187612774` |

The unchanged snapshot inventory/binding and provenance pins remain recorded below.
The four proposed absent targets under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/` are exclusively:

- `replay-backup-rehearsal-vf0qzG-candidate11-consolidated-20261015-01`
- `replay-sqlite-recovery-backup-vf0qzG-candidate11-consolidated-20261015-01`
- `replay-sqlite-recovery-restored-vf0qzG-candidate11-consolidated-20261015-01`
- `real-data-recovery-qualification-vf0qzG-candidate11-consolidated-20261015-01`

All remain `productionAuthority: false`; no target is created by this handoff.
The only later proposed writes are the documented isolated log/score claim/examined
pairs under `codex/candidate11-consolidated-source` and
`codex/candidate11-consolidated-restored`, four review generations on each copy.
The 1,022 classification-only exclusions have no import permission. Original input
freshness is not certified by these receipts: a separately authorized run must
freshly verify residency before opens, exact hashes and metadata without hydration.
All existing approval, stop, provenance, capacity and durability gates remain;
this handoff makes no production or M2h readiness claim.

### Historical candidate-10 preparation blocker — 2026-10-15

Candidate-10 cannot execute the required continuation phases through its guarded
rehearsal scope. Its `runRehearsalCommand()` allowlist excludes `import`,
`score-import` and `scan`; the importer accepts only marked generated cache roots
or descriptor/proof-selected production leases. The production preparation route
requires accepted qualification/M2h/durability declarations; fabricating those for
an isolated copy is not a qualification shortcut. Removing harness-v7's fence,
calling an internal lease manually or relabelling original transports as synthetic
would bypass the accepted boundary. **No executable consolidated real-run command
or execution-authorization scope is ready for candidate-10.**

Control-only preparation pinned 1,408 exact previously inspected cache files for
read-only classification (453 logs, 61 metadata, 439 frame responses and 455
unrelated entries), separately identifying the snapshot-associated **291 log and
95 score originals**. Proposed scan coverage uses only those 291 logs; scores
remain separate. These lists retain original paths, filenames, hashes and source
references and are **recorded inputs, not fresh payload verification**. No other
classified response is implicitly admitted. Missing/current-map and identity
eligibility remain store-dependent gates, not parser compatibility conclusions.

The smallest prerequisite is a separately agreed, versioned extension of the
existing rehearsal cache/import/scan boundary, binding an exact cache inventory
to rehearsal lineage and preserving original provenance, finite corpus/capacity
budgets, residency, locking and recovery. Candidate-10 must remain immutable;
that prerequisite would need a successor release and generated-only validation.
Afterward, extend the existing harness—not another backend—with cache validation,
conversion/preservation, exact converted duplicates, log-only scan, separately
selected score imports, permitted isolated writes and current-state independent
recovery. No completed snapshot plan should be repeated as a substitute.

Existing proposed limits remain 1,800/1,860 seconds per phase, 256/512 MiB heap/RSS,
16 GiB retained output, 20 GiB initially free and 2 TiB aggregate instrumented I/O.
Additional phases must fit that aggregate budget, not silently multiply it.
Exact executable phase commands/destinations and full small-mode orchestration
remain deferred to the missing guarded connection; there is no authorization request
to execute partial phases now. The three unsupported commands were confirmed to
reject before filesystem access; the unchanged watchdog's failure/timeout shutdown
was checked with harmless generated children. Neither is full orchestration proof.

Preparation, input inventories, IDE tracing, scoped preservation and the retained
stopped broad-test disclosure:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/consolidated-qualification-prepare-20261015-mYFhs4/report.json`.
Production activation and M2h remain excluded.

The completed eight-phase release-06 run is recorded in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-recovery-qualification-vf0qzG-20261014-01/execution-report.json`.
Do not execute that completed plan again. The older command/authorization sections
below retain historical context; the current successor section supersedes the
candidate-08 command. This task read real cache metadata only, not payloads.
This applies the [migration plan](replay-production-sqlite-migration-plan-2026-10-11.md)
and [ADR 0006](../decisions/0006-replay-storage-v3.md#explicit-migration-and-backup-protocol).

<a id="importdiscovery-successor--current-qualification-scope"></a>

## Import/discovery successor — historical candidate-09 scope

**Historical instructions and pins, superseded by candidate-11/harness-v8 above.**

The retained successor is under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/import-scan-capacity-20261014-8klTHY`.
It preserves candidate-08/harness-v5 unchanged. Its separate pinned coverage
contract records `converted-corpus-v1` and the optional authority-proof
[`replay-cache-v1`](replay-synthetic-imports.md#proof-pinned-cache-capacity).
The production proof must explicitly pin both objects; the snapshot rehearsal
does not issue a production proof or silently enable that profile.

Metadata-only two-pass inspection found 1,388 regular default-cache files totaling
31,996,663 bytes, maximum 503,192, plus one directory. The retained provenance
cache contains 20 files totaling 1,405,882 bytes, maximum 86,426. Thus measured
transport lengths fit the unchanged 1 MiB per-file bound. The new opt-in 2,048-file
64 MiB/cycle scope covers these directory dimensions; generated page/discovery
tests retain sorted explicit unrelated reports and finite iteration/I/O budgets.
Generated 5,882-wrapper import/reimport and converted no-op tests address the
confirmed wrapper blocker without raising default caps. No actual cache payload
was opened: decoded lengths, individual metadata fields, canonical diagnostics
and supported response representations remain a precise unverified boundary.
The operational backup does not contain original cache transports; neither the
fixture generator nor qualification harness may fabricate them from decoded bodies.

The consolidated snapshot run retains the existing eight phases, source/control
pins, fixed budgets and stop conditions below, using only fresh successor targets.
Its generated production-route/capacity/recovery checks are retained separately.
It can qualify this successor against the recorded backup snapshot, **not** certify
the current live cache or authorize production adoption. Actual original-cache
compatibility needs a separately authorized bounded payload inspection/qualification
with frozen current inputs; metadata agreement does not replace that gate.
No real run, new authority or M2h/durability acceptance is created by this update.

Retained candidate-09 has 58 inventoried files (227 static relative dependency
edges plus the explicit dynamic source dependencies), Node 24.19.0 / SQLite
3.53.3, unchanged schema/payload versions 1/1 and the same capability requirements.
Runtime/release/harness files are independently copied, hash-inventoried and
sealed read-only with macOS user-immutable flags; the owner can remove those flags.
The release includes contract snapshots before this final pins/status update.

| Historical candidate-09 pin | SHA-256 |
| --- | --- |
| `release-candidate-09/release.json` | `7f829d0fa196f6ce1815ccb8cdf9046ce62677fae21ac61c95cd1ac36e34948e` |
| Retained Node 24.19.0 | `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1` |
| Schema | `80712852c6a6f783f7756f97d75aee1a8f762e62c58f31b78e2d314ef47b3b1b` |
| `harness-v6/harness.json` | `f6b6b7e1e4365c664f94ca039951afe68c57c7bfdfd14c7e5ad443764c74caf9` |
| `harness-v6/real-plan.json` | `870810514dfd0ca1b9d2d62d7c154dd0ddd3787d3060699f1125265d84601945` |

Historical proposed command, **not executed; superseded**:

```sh
/Users/zoltanka/.local/share/pain-and-gain-evidence/import-scan-capacity-20261014-8klTHY/release-candidate-09/runtime/node \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/import-scan-capacity-20261014-8klTHY/harness-v6/launch.cjs \
  f6b6b7e1e4365c664f94ca039951afe68c57c7bfdfd14c7e5ad443764c74caf9 \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/import-scan-capacity-20261014-8klTHY/harness-v6/real-plan.json \
  870810514dfd0ca1b9d2d62d7c154dd0ddd3787d3060699f1125265d84601945
```

Fresh target names replace `candidate08` below with `candidate09` (date/suffix
`20261014-01` unchanged), for converted copy, post-write backup, independent restore
and controls. None is created by preparation. Source and all original provenance
pins remain unchanged. Budgets remain 1,800/1,860 seconds per phase, 256/512 MiB
heap/RSS, 16 GiB retained output, 20 GiB free space and 2 TiB instrumented JavaScript
I/O; native SQLite I/O is unmeasured. Eight verified phases and confirmed child
exits are mandatory; stop and retain artifacts on any failure, with no retries,
tuning or budget increases. This is ready to request **snapshot-only** execution
authorization, not unrestricted production import/scan or activation approval.

## Consolidated candidate-08 — prepared snapshot scope

**Historical prepared scope and instructions, superseded by candidate-11/harness-v8.**

Retained root: `/Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr`.
The complete release has 58 independent files, including the conversion CLI,
production authority/recovery tooling, dynamic `src/config.js` and
`src/debug/build-id.js` dependencies and Node 24.19.0. No npm installation is
required. Runtime modules/contract documents are hashed; validation sources are
retained separately. Files are read-only with macOS user-immutable flags. The
owner can deliberately remove those flags; hashes remain the integrity authority.

| Input | SHA-256 |
| --- | --- |
| `release-candidate-08/release.json` | `9ac3ace03ca0f42108ef5ad72b3e4b21ab28a8dddef91d872855e580af363344` |
| Retained Node 24.19.0 macOS arm64 | `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1` |
| Exact recovery schema, schema/payload versions 1/1 | `80712852c6a6f783f7756f97d75aee1a8f762e62c58f31b78e2d314ef47b3b1b` |
| `harness-v5/harness.json` | `5807527ee7a7dfeeedfd9afdd5d4afc69ddf93913c26ee7525b9834f429715cc` |
| `harness-v5/real-plan.json` | `a5a82ad4b792a33f3fc34ee43c7adb8eac2464b28079cc54bc641100782b0380` |

Production capabilities are exactly `map-independent-scores`, `map-repair`,
`production-authority-v1`; rehearsal capability is separately declared as
`explicit-rehearsal-lineage-recovery-v1`. The manifest designates a candidate for
qualification and grants no production authority. Existing releases/harnesses
remain byte-identical. Bundle documentation is the source contract snapshot
before this retention status update; this plan and the external receipt record
the subsequent preparation result.

Twelve focused checks passed using only new small fixtures: production routing,
converted no-ops, post-write independent recovery, and pinned harness orchestration
including all eight small phases and confirmed child exits. Accepted unchanged
consumer, corruption, process-crash and scale results are reused; no full-size test
or real payload verification ran here. A missing-dependency candidate and failed
test runs are retained and excluded from the final passing result.

**One proposed authorization scope:** verify pins/absent destinations and original
backup provenance; stream-verify the same 432-file / 778,354,114-byte operational
snapshot; convert once; independently compare all metadata/reviews/history,
1,076,573 diagnostic wrappers/order and original artifact bytes; perform the
existing explicitly selected analysis plus four review checkpoints on the copy;
back up the post-write copy; independently restore; repeat restore once; explicitly
select that rehearsal restore and verify/read/write through its lineage. The
converted source remains recovery-fenced. No production descriptor or approval is
issued. Original backup files and all prior destinations remain unchanged.

Source remains
`/Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/backup`,
layout `scoped-managed-v2-v1`. The plan preserves the original inventory/binding
pins `823496672c853d6feb827fe930e489027e53f1ba1e11f587c821af3b8bf1d1e6` /
`1df994da4332b5580e73f4f010da4882c098c66f150f9715451fa264f161ac1a`
and eleven provenance-control pins. Those controls were resident and hash-verified;
payload freshness is deferred to the authorized source phase.

Fresh proposed destinations (none created in this task):

| Purpose | Absolute directory |
| --- | --- |
| Converted copy | `/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-vf0qzG-candidate08-20261014-01` |
| Post-write backup | `/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-sqlite-recovery-backup-vf0qzG-candidate08-20261014-01` |
| Independent restore | `/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-sqlite-recovery-restored-vf0qzG-candidate08-20261014-01` |
| Run controls/results | `/Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-recovery-qualification-vf0qzG-candidate08-20261014-01` |

Historical proposed command; **not executed or authorized by retention; superseded**:

```sh
/Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr/release-candidate-08/runtime/node \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr/harness-v5/launch.cjs \
  5807527ee7a7dfeeedfd9afdd5d4afc69ddf93913c26ee7525b9834f429715cc \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr/harness-v5/real-plan.json \
  a5a82ad4b792a33f3fc34ee43c7adb8eac2464b28079cc54bc641100782b0380
```

Fixed budgets are unchanged: eight phases, 1,800-second cooperative / 1,860-second
outer deadline each, 256/512 MiB heap/RSS, 192 GiB instrumented JavaScript I/O per
phase plus 128 GiB parent reserve within 2 TiB total, 16 GiB retained output,
20 GiB initial free space, 20,000 monitored entries, 64 KiB streamed buffers and
500 ms outer sampling. Control limits remain 2 MiB/file and 16 MiB total. Verify
successful complete results, measured resource gates and confirmed child exit before
each successor. Any changed/missing/dataless input, existing destination, bad pin,
incomplete comparison, conflict, timeout or resource failure stops the sequence;
retain all artifacts, with no retry, conversion resume, tuning or budget increase.
One unchanged restore repeat is the named seventh phase, not a failed-run retry.

The pinned `coverage.json` distinguishes the intended snapshot run from production
continuation. A recorded log contains **5,882 wrappers**, exceeding selected
import/other-output's **4,096** cap; a genuine reimport of that case must currently
reject. The raw 2,871,940-byte diagnostic-array span is not canonical diagnostic
JSONL; selected 2 MiB byte compatibility remains unresolved. The 71,590-byte score
member similarly does not establish any individual 16 KiB property violation.
Selected Chromium transports (1 MiB), decoded responses/output (4 MiB), actual
canonical diagnostic bytes and the current 64-file discovery scope need separate
coverage. The backup excludes original cache inputs: never manufacture Chromium
wrappers from retained bodies. The generated 386-record fixture proves counts only.

This snapshot scope is **ready for authorization**. Complete production adoption
remains blocked by required input/discovery coverage and the migration plan's
fresh-source/quiescence, qualified-release, durability and execution approvals.
Native SQLite/module-loader I/O is not fully measured, memory/time checks are
cooperative/sampled, and metadata/open races remain. SIGKILL evidence does not
prove power-loss durability; same-filesystem copies do not supply off-device
protection. M2h remains paused/unqualified.

Retention, commands, all failures and preservation:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr/report.json`.

<a id="current-executable-interface--2026-10-14"></a>

## Prior executable interface — release-06 historical reference

The [rehearsal lineage contract](replay-backup-rehearsal.md#rehearsal-consumers-and-independent-recovery--2026-10-14)
now supplies conversion, explicit selection, six selected consumers and current-state
backup/restore/selection through the retained recovery launcher. Original fixture
entrypoints remain fenced. No arbitrary roots, synthetic relabelling, lifecycle
deletion, production authority or automatic migration is enabled.

The successor release is
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-recovery-integration-20261014-0NMipc/release-06`.
Its `release.json` SHA-256 is
`a65751640f4dcb8788c7337cfcfd9db778e333b7ee4f4982cfcb5f5dbf4aa0ec`.
Set `RELEASE` and `RELEASE_SHA256` to those exact values in the commands below.
The inventory contains 48 independent files, including
`tools/replay-backup-rehearsal.js`, its module closure, the receiving recovery
implementation and Node 24.19.0 runtime. Schema/DDL fingerprints remain as stated
below; the new required interface capability is
`explicit-rehearsal-lineage-recovery-v1`. New rehearsal stores include the existing
map-repair table capability; old rehearsal stores do not receive an automatic upgrade.

Each launcher invocation uses the retained node, retained launcher and operator-pinned
release inventory. The exact action/request interface is:

```sh
"$RELEASE/runtime/node" "$RELEASE/tools/replay-recovery-launch.cjs" "$RELEASE_SHA256" rehearsal-convert "$REQUESTS/convert.json"
"$RELEASE/runtime/node" "$RELEASE/tools/replay-recovery-launch.cjs" "$RELEASE_SHA256" rehearsal-select "$REQUESTS/select-source.json"
"$RELEASE/runtime/node" "$RELEASE/tools/replay-recovery-launch.cjs" "$RELEASE_SHA256" rehearsal-command "$REQUESTS/consumer.json"
"$RELEASE/runtime/node" "$RELEASE/tools/replay-recovery-launch.cjs" "$RELEASE_SHA256" prepare "$REQUESTS/prepare.json"
"$RELEASE/runtime/node" "$RELEASE/tools/replay-recovery-launch.cjs" "$RELEASE_SHA256" restore "$REQUESTS/restore.json"
"$RELEASE/runtime/node" "$RELEASE/tools/replay-recovery-launch.cjs" "$RELEASE_SHA256" select "$REQUESTS/restore.json"
```

`convert.json` contains exactly the existing conversion API arguments: `sourceRoot`
is the pinned package below, `root` the fresh converted destination below,
`layout:"scoped-managed-v2-v1"`, `inventory` and `receipt` the named controls,
`inventorySha256` and `receiptSha256` their recorded pins,
`acknowledge:"backup-rehearsal-only"`, `deadlineMs:1800000`.
`select-source.json` is `{ "authorization": <that exact object> }`.
Selection returns a newly measured `lineageHash`; record it independently.
Never substitute an example value or unverified source declaration.

`consumer.json` contains `{root,lineageHash,command,options}`. The permitted commands
are `maps`, `analyze`, `claim`, `examined`, `score-claim`, `score-examined`.
Analysis options are exact `replayId`, `fingerprints` and/or `scoreFingerprints`,
and `reportMode`. Reviews use exact `replayId`, `fingerprint`, `taskId`.
Use the bounded independently verified selection from phase 2 below. Original
owners and source reviews are retained; new review writes affect only the copy.

`prepare.json` contains
`{rehearsal:{lineageHash},root:<converted>,backupRoot:<new package>,destination:<restored>}`.
The successful result supplies an actual `receiptHash` to pin independently.
`restore.json` contains
`{rehearsal:{lineageHash},backupRoot:<new package>,destination:<restored>,receiptHash}`.
The launcher injects `releaseHash`; supplying it in request JSON rejects.
Run identical restore once more before selection/new writes for the repeat gate.
After selection use `rehearsal-command` with `root` equal to the restored directory
and the same lineage pin. The converted source remains fenced. Restore and restored
consumers do not read the original backup, converted store or mutable worktree.

These individual commands are interface references. The separately retained harness
below now orchestrates all eight phases, full preservation comparisons and measured
selection/control pins. Source selections and lineage/snapshot hashes are generated
only after their verification gates; no absent real-run result is presented as known.

## Prepared harness and exact authorization command — 2026-10-14

**Historical release-06/harness-v4 instructions for the completed snapshot run;
do not rerun. Candidate-11/harness-v8 above is the current proposed scope.**

The immutable conversion/recovery release above remains byte-identical. Its 95
integration checks and final self-review are reused. The separate retained harness is:

`/Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-qualification-harness-20261014-UiZg4w/harness-v4`.

| Pin | SHA-256 |
| --- | --- |
| Harness `harness.json` (11 code/contract/plan files) | `3c25f9164aad4ba9ee4096bc3fe9987908397803fb75a2f33365f02a756b6c77` |
| Harness `real-plan.json` | `f63cff206a602b481142b98c65f7b98658c6319ce5f2f4df8e0a6b046ea8f950` |
| Unchanged release-06 `release.json` | `a65751640f4dcb8788c7337cfcfd9db778e333b7ee4f4982cfcb5f5dbf4aa0ec` |
| Retained Node 24.19.0 macOS arm64 | `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1` |

The historical proposed command is below. **Do not execute before the operator authorizes
this exact run.** No previous rehearsal authorization carries over.

```sh
/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-recovery-integration-20261014-0NMipc/release-06/runtime/node \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-qualification-harness-20261014-UiZg4w/harness-v4/launch.cjs \
  3c25f9164aad4ba9ee4096bc3fe9987908397803fb75a2f33365f02a756b6c77 \
  /Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-qualification-harness-20261014-UiZg4w/harness-v4/real-plan.json \
  f63cff206a602b481142b98c65f7b98658c6319ce5f2f4df8e0a6b046ea8f950
```

The pinned plan contains the exact source, thirteen original control/provenance
pins, four fresh destinations, expected counts, task identities and fixed budgets
listed below. Only control receipts were read during preparation; no real payload
was opened or newly certified. The launcher checks the harness, release and runtime
before orchestration. Each phase rechecks harness/release bytes and receives the
parent's measured predecessor-result hashes in its own pinned input control.
Changed plans, controls, results or code stop the sequence.

The harness adapts the existing recovery watchdog and the successful real-rehearsal
preservation procedure. The source gate checks independent backup/restore receipts,
exact file inventory, streamed hashes and stable metadata. Conversion runs once.
Full preservation compares property values/types/order, presence, reviews/owners,
maps/associations, explicit history, diagnostic wrapper values/order and payload
bytes incrementally before any consumer write. It retains only the first eligible
log and score under exact ascending `(replayId,fingerprint)` order. A selected input
that exceeds current analysis limits stops the run rather than changing selections.
Public analysis reports are retained and compared as exact emitted JSON strings.

Post-write backup, restore, repeat and selection reuse the retained recovery APIs.
Ordered typed SQL facts and all required artifact hashes are compared against the
post-write state. Restore/repeat workers exclude original source/store reads;
the parent independently checks the fenced converted store after restored writes.
Source/control hashes and metadata are rechecked before completion.

The watchdog owns one child process group per phase, applies the outer deadline,
samples RSS/output, kills that group on cancellation or failure, and awaits confirmed
child exit before any next phase. A final output inspection covers growth between
polls. SIGINT/SIGTERM request cancellation; arbitrary termination of the orchestrator
itself or machine failure still requires inspection of retained incomplete state.
No retries, conversion resume, cleanup or budget increases are implemented.

Thirteen focused harness checks passed on Node 24.19.0, including all eight phases on
small generated backup-shaped fixtures, source/code/control rejection, incomplete
result/resource gates, timeout/cancellation shutdown, fast output growth, spawn/child
failures, complete original-inventory/artifact correspondence and separate
operation/cleanup failures. Existing integration/scale tests
were not repeated. Intermediate preparation failures are retained in the task receipt.
External harness files are outside WebStorm's supported project inspection roots;
Node syntax checks and targeted self-review cover them without changing IDE roots.

Preparation, exact commands/results, self-review and preservation receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-qualification-harness-20261014-UiZg4w/report.json`.
At that historical preparation milestone, the operator could authorize one complete eight-phase run with the exact command,
source and destinations below. This is preparation evidence only; real completion,
production authority, power-loss durability and M2h remain separate gates.

## Reused evidence and prior receiving baseline

| Evidence | Demonstrated scope |
| --- | --- |
| `scoped-v2-backup-20261011-vf0qzG/report.json` | Independent operational backup and isolated restore: 432 files / 778,354,114 bytes |
| `real-backup-1800s-20261013-1adlVw/report.json` | Real backup conversion/resume, 8,471 property comparisons, 1,076,573 wrappers, 799 retained files; generation 1615 unchanged |
| `sqlite-recovery-release-20261014-SY8oNY/report.json` and `sqlite-recovery-crash-20261014-BY9UKe/completion.json` | Retained release, synthetic functional/compatibility checks and seven named SIGKILL recovery cases |
| `full-recovery-qualification-20261014-LOVvn7/report.json` | Seven full-scale generated phases, generation 1164 and 724 referenced artifact hashes through restore/repeat; selected restored consumer writes |

All receipt paths above are under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/`. Reuse their completed
checks; do not rerun synthetic generation, compatibility suites or crash probes.

The prior receiving baseline was exactly
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-recovery-release-20261014-SY8oNY/release-candidate-05`.
Its inventory SHA-256 is
`94365c8f527fa534a4182958f27436887127594b9df004eddc6b5f8c42d4f90b`.
It is a candidate with demonstrated synthetic coverage, not a qualified production
or real-data recovery release. The inventory/control hash was checked here;
individual code/runtime bytes were not reread in that earlier documentation-only
task. The current connection task independently verified the successor inventory
and bundled runtime; use the successor pins above for future execution.

The successor retains the same `runtime/node`: v24.19.0, macOS arm64, binary SHA-256
`27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1`.
The recorded SQLite baseline is 3.53.3. Require native backup, read-only opens,
prepared get/run/iterate, transactions, foreign keys, busy timeout, DELETE journal,
FULL synchronization and the supported local APFS/fsync/rename contracts.
System macOS libraries remain platform dependencies, not bundled OS guarantees.

Schema 1 / payload 1 is insufficient alone. Require DDL SHA-256
`54befa07fc20dfb23d5b0916cd8d83676de1b79ef1b210943ff02589c83c169d`
and ordered `sqlite_schema` fingerprint
`80712852c6a6f783f7756f97d75aee1a8f762e62c58f31b78e2d314ef47b3b1b`.
The prior recorded capabilities were `map-independent-score-association-generated-column`,
`map-qualified-repair-journal` and `explicit-synthetic-authority`. A real rehearsal
authority/recovery capability was **not** recorded in that baseline. The successor
adds the explicit interface capability and validation recorded above; do not infer
it from the schema alone. No automatic schema migration is allowed.

## Verified snapshot and immutable controls

Package:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/backup`.
Layout: `scoped-managed-v2-v1`; derived data root: package `data/replay_logs/`.
Inventory rows retain `replay_logs/...` relative paths. Do not rewrite inventory
bytes, rearrange evidence or treat its historical production path as an input root.

| Control | SHA-256 |
| --- | --- |
| Package `inventory.json` | `823496672c853d6feb827fe930e489027e53f1ba1e11f587c821af3b8bf1d1e6` |
| Beside package: `rehearsal-binding-v2-20261012-2149.json` | `1df994da4332b5580e73f4f010da4882c098c66f150f9715451fa264f161ac1a` |
| Original backup/restore `scoped-v2-backup-20261011-vf0qzG/report.json` | `87a51acd54ddb8df4a9273f825679299132cd14424f836917f7478608b68f074` |
| `backup-binding-verified-20261012-2149.json` | `49552230bbc7aad65f503f908946cfe0644eaf11fe367a5f356cbeaa8ff01cc9` |
| `backup-binding-review-20261013-0008.json` | `752fb6b9c6ec8c690b86f570a9ad3b92e4745d176609cb8a26e7972326a29db1` |
| Recorded manifest (future streamed check, not read here) | `c3d6844f3fcaebc8777ca310b044d57bc5c290cf3863f715e28a5bebcdf8905b` |

Expected manifest length: 533,731,722 bytes. Expected complete operational set:
432 files / 778,354,114 bytes; 291 logs, 95 scores, 45 maps/associations, 670
reviews, 11 history fingerprints and 1,076,573 wrappers. The original backup and
separate restore receipts establish provenance; checksum-pinning a declaration
alone would not. Before execution, reverify all source hashes/residency, controls,
inventory completeness and source stability. Stop on any change.

This is the recorded 2026-10-11 backup snapshot. It excludes 13 historical
dataless files, 386 import sources and four old lock-owner remnants, which remain
preserved. It is not a complete historical archive, current-production state or
off-device disaster protection. Do not access current production or repair the
snapshot to extend coverage.

## Historical interface gap before the 2026-10-14 connection

This table records the planning input. The scoped connection and retained command
surface above supersede its missing-interface entries. Full real execution,
independent preservation orchestration and production qualification remain gated.

| Planned operation | Existing contract / availability | Gate |
| --- | --- | --- |
| Source verification / conversion | [Receipt-bound rehearsal interface](replay-backup-rehearsal.md), `rehearseBackupV2` and its CLI, explicit nested layout and deadline; previously demonstrated on this snapshot | Fresh verification and retained entrypoint required |
| Complete conversion preservation | Existing real-rehearsal verification receipt proves a bounded comparison procedure | Bind that procedure to the exact retained run release; no new payload reads here |
| Selected log/score read and claim/examined | [Consumer/checkpoint contract](replay-log-checkpoint-integration.md) and authority dispatcher require marked generated temporary fixture roots; rehearsal descriptors reject | Missing explicit verified-backup rehearsal consumer scope |
| Current post-write backup | [SQLite recovery contract](replay-synthetic-authority.md#independent-sqlite-recovery-candidate--2026-10-14) requires a selected synthetic source; backup helper excludes rehearsal stores | Missing rehearsal-scoped current-state backup connection |
| Isolated restore / selection | Same contract requires `synthetic:true`, generated root prefixes and synthetic member/authority bindings | Missing origin-preserving rehearsal restore/authority selection |
| Outer monitoring | Retained generic watchdog is small/full-synthetic tested; qualification orchestrator accepts only generated `small`/`full` plans | Reuse monitor, but no existing real-data orchestration command covers all phases |

The prior retained `release.json` includes `replay-rehearsal-scope.js` and converter/core
libraries, but **does not include `tools/replay-backup-rehearsal.js`**. The previous
successful CLI's recorded hash was
`6c0449208f09e8367332f4bebac657faa92db246d9968ec73723c906e434bea7`;
that is historical control evidence, not a fresh hash of the mutable worktree.
Package the supported entrypoint/dependencies in the final receiving release.

There was no supported end-to-end command at that planning milestone.
Do not use `--synthetic-sqlite`, `select-sqlite`, `synthetic:true`, fixture prefixes,
the generated-source qualification launcher, or marker/descriptor edits on real
evidence. Renaming/copying real data into a fixture root does not make it synthetic.
Direct SQL and raw file copying cannot substitute for scoped APIs.

The identified prerequisite was to carry the existing opaque rehearsal capability/provenance
through selected consumers and current-state backup/restore/isolated selection,
reusing the existing locks, checkpoints, readers and publication APIs. Retain
fixture guards and `productionAuthority:false`. That scoped implementation is now
recorded above. The separate pinned harness now supplies the orchestration and
preservation driver; no historical task authorization carries over.

## Exact fresh locations and bounded execution sequence

**Historical release-06 locations and eight-phase sequence; completed, not a new
execution proposal. Current candidate-11 targets and twelve phases are above.**

All proposed new directories are outside the checkout, entire source package,
cache and trial roots, directly under the external evidence directory:

- Converted store: `/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-vf0qzG-recovery-qualification-20261014-01`
- Post-write backup: `/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-sqlite-recovery-backup-vf0qzG-qualification-20261014-01`
- Restored authority: `/Users/zoltanka/.local/share/pain-and-gain-evidence/replay-sqlite-recovery-restored-vf0qzG-qualification-20261014-01`
- Receipts: `/Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-recovery-qualification-vf0qzG-20261014-01`

These proposed paths were absent on the documentation task's metadata check;
none was created. Verify canonical containment, independent regular files, residency, target absence
and free space again before authorization/execution. Preserve all previous failed,
successful, synthetic and real rehearsal roots; none is an input or overwrite target.
The first converted-store prefix is supported by the current converter. The two
recovery prefixes are now accepted only by the explicit rehearsal recovery scope.
They do not permit arbitrary nested-root acceptance.

| Phase | Scope / deliverable | Acceptance or stop gate |
| --- | --- | --- |
| 0. Verify / bind source | Pin complete release/runtime/driver; independently stream the exact 432-file inventory and original proof chain; validate authorization before store initialization | Original hashes/lengths/stability match; all capabilities available; otherwise stop before conversion |
| 1. Convert once | New empty converted destination; existing nested-layout converter, internally selected `backup-sized-synthetic-v1`, `--deadline-ms 1800000` | Verified completion, clean operation state and confirmed child exit; no retry/resume on failure |
| 2. Preserve / pin selection | Bounded full comparison of source properties/order, unknowns, identities, reviews, history, diagnostics and artifact bytes; publish selected keys and baseline report hashes | Compare all data, not samples; select one eligible log and one eligible score by ascending exact `(replayId,fingerprint)`, within existing consumer caps; pin `selection.json`; no identity inference |
| 3. Consumers / new writes | Explicit isolated authority only; maps and selected log/score verification/analysis; claim then examined for task `codex/real-data-recovery-20261014-01` on those copies | Read results preserve existing analytical findings/gates; capture exact current generation/state after writes; no done/release, cleanup, imports or gameplay interpretation |
| 4. Current-state backup | Hold selector/writer locks; snapshot current database plus all immutable artifacts, descriptor, bindings and required recovery state; fence converted source | Pin actual snapshot hash, complete post-write logical facts and old/new map-repair bytes; pending/unsupported state rejects |
| 5. Independent restore | Use only pinned package and retained receiving release; deny original source, production and mutable worktree reads | Every ordered typed table/property, owner/reference and payload hash matches; incomplete destination remains fenced |
| 6. Repeat once | Repeat the identical restore before additional writes | Store ID, generation, commitments, complete inventory and payload bytes unchanged |
| 7. Select / isolate | Explicitly select restored rehearsal authority; repeat selected reads; claim/examined with a distinct `codex/real-data-recovery-restored-20261014-01` task | Capture new generation/reviews; only restored state changes, converted source remains fenced, no reads/writes split across authorities; backup/source/control hashes unchanged |

Preserve all prior review owners/unknown properties. The two new reviews in
phase 3 belong only to the new converted copy; original backup reviews never
change. Record actual count/generation deltas instead of assuming generation 1615
for a new release. A successful analysis may retain unavailable/conflicting
findings; it does not establish winner interpretation, live ownership, timing or
gameplay benefit. Do not broaden selections to bypass a limit or analytical gate.

## Existing direct conversion command (historical argument reference)

For reference, this is the **existing CLI argument structure**, with all source
pins and the new destination fixed. It is not an authorization to run the mutable
worktree or to begin a partial plan. `NODE24` is the exact retained runtime above;
the entrypoint must first be included in the final pinned release:

```sh
"$NODE24" tools/replay-backup-rehearsal.js \
  --layout scoped-managed-v2-v1 \
  --source /Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/backup \
  --inventory /Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/backup/inventory.json \
  --inventory-sha256 823496672c853d6feb827fe930e489027e53f1ba1e11f587c821af3b8bf1d1e6 \
  --receipt /Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/rehearsal-binding-v2-20261012-2149.json \
  --receipt-sha256 1df994da4332b5580e73f4f010da4882c098c66f150f9715451fa264f161ac1a \
  --destination /Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-vf0qzG-recovery-qualification-20261014-01 \
  --deadline-ms 1800000 --ack-backup-rehearsal-only
```

The successor retained launcher commands above now cover the scoped operations.
The prior synthetic qualification orchestrator still cannot drive real data.
Use the separate pinned harness command above for the proposed complete run;
do not launch a partial plan from this historical direct-command example.

## Fixed proposed budgets and authorization scope

**Historical eight-phase authorization scope. Candidate-11's current twelve-phase
scope above preserves the fixed limits and the 2 TiB aggregate ceiling.**

Eight phases, each with 1,800-second cooperative and 1,860-second independent
outer deadlines; 256/512 MiB heap/RSS; <=192 GiB instrumented JavaScript I/O per
phase. Eight ceilings total 1.5 TiB; reserve 128 GiB for parent/control verification
within an overall 2 TiB instrumented envelope. Require 20 GiB free initially;
cap all new retained stores/backup/restore/receipts at 16 GiB. No source resizing.

Keep converter ceilings: 600 MiB input, 8,000,000 structural values, 320 MiB
original artifacts, 16 MiB diagnostics/record, 8,192 wrappers/record, 64/32 KiB
wrapper/scalar limits, 320 logs, 128 scores and 64 maps/associations. Keep recovery
ceilings: 1 GiB database, 2 GiB referenced artifacts, 8,192 files, 1,000,000 SQL
rows, 64 KiB text cells, 256 KiB encoded rows, 128 review properties, 1 MiB operation
controls. Historical input receipts <=2 MiB each /16 MiB aggregate; 64 KiB
streaming copy/hash buffers. Selected log diagnostic arrays retain their existing
16 MiB cap; do not raise consumer limits. Any smaller existing limit still applies.

Native SQLite I/O stays unmeasured unless independently instrumented; module
loader I/O, cooperative checks, metadata/open races and 500-ms polling are not
hard OS-level bounds. Use the existing watchdog's owned-child termination and
confirmed-exit contract; retain stdout/stderr, commands, counts, hashes and errors.
If its real-data routing/meter is not ready and pinned, stop before execution.

Proposed **single future authorization**, using the pinned harness above: reverify
this frozen snapshot, convert once into the named new
store, verify preservation, exercise the two selected consumers/review writes,
take a current-state backup, restore independently, repeat once and explicitly
select/check only the isolated restored authority. Continue automatically only
through successful gates under these budgets. Do not perform an additional
conversion resume: its evidence already exists; the one repeated operation here
is restore. Any integrity/capability, source change, residency, selection,
authority, child-exit or budget failure stops the whole sequence without retry,
repair, schema migration, cleanup, alternate source or limit increase.

At that historical preparation milestone, this concrete run scope was ready for operator execution authorization. Approval
of documentation alone does not start real-data qualification.
Production cutover/authority changes, original review mutation,
current-production access and renewed M2h are outside the proposed authorization.

## Durability gate

ADR 0006's runtime/platform contract requires functioning fsync/rename/flush
semantics and explicitly assumes OS/filesystem/device flushes work as advertised.
Its M3/M4 gates require retained crash/concurrency/resource evidence and compatible
rollback. It does **not** specify a standalone arbitrary machine-power-cut test
or a pass/fail procedure for such a test. Do not invent one or mark it passed.

Power-loss/platform durability acceptance remains unresolved before production
readiness: neither the seven SIGKILL cases nor this isolated real-data plan proves
survival of arbitrary power loss or torn writes. The supported-platform assumptions
and required evidence/acceptance must be stated explicitly at that gate; any
change to existing qualification requirements needs its own documented decision.
This isolated qualification can establish preservation and scoped recovery only.
Lost M2h evidence and its unchanged acceptance/retention requirements remain open.

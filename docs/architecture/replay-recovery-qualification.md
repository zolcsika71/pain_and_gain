# Synthetic recovery qualification preparation

The retained Node 24.19.0 recovery release is the execution dependency of
[replay-recovery-qualification.js](../../tools/replay-recovery-qualification.js).
The generator directly uses its existing core publication, review, repair and
authority APIs. It does not import mutable worktree modules. A separate retained
copy of this harness and its watchdog is pinned before execution.

The seed and versioned contract fix record values/order, review timestamps and
payload content. The fixed review Date constructor leaves Date.now real for lock
age and deadline checks. Fresh store UUIDs, inode-backed repair facts and SQLite
file layout are infrastructure identities and are
not asserted byte-identical across independent generations. Generated files are
hashed during generation, then independently read and compared before the gate.
No source hashes exist for a full-scale source until it is generated and verified.

Small mode exercises three logs, two scores, two maps/associations, eight reviews,
two explicit historical identities and 96 wrappers. Full mode targets 291 logs,
95 scores, 45 maps/associations, 670 reviews, 11 historical identities and
1,076,573 wrappers. Original artifacts total 244,622,392 bytes; serialized wrapper
collections total 533,731,722 bytes. Physical diagnostic envelopes add bytes and
are measured separately. This is direct SQLite source generation, not another
legacy conversion test. Seeded strings control byte volume while independently
varied wrappers, records, reviews, identities and repaired maps supply structural
work. Synthetic string distribution is not real-data workload equivalence.

Original outputs are valid JSONL/JSON structures. No diagnostic array or entire
manifest is materialized. Wrapper emission is awaited through existing publication
APIs. Each wrapper is regenerated from the seed during downstream verification.
Core pending publication completes before qualification begins. Null, omitted
and known log identities stay distinct; score null identities are not generated.
Actual post-construction claim/examined and checksum repair exercise changed state.

[replay-recovery-watchdog.js](../../tools/replay-recovery-watchdog.js) owns one
foreground child per phase, terminates its process group on timeout/resource
failure and waits for confirmed exit. Stdout/stderr and interrupted artifacts
are retained. JavaScript file I/O and cooperative heap/time checks are sampled
inside each phase; external RSS/disk checks supplement them. Native SQLite I/O
and module-loader internals are not fully intercepted. Metadata/open races,
polling overshoot and synchronous native-call latency remain limitations.

The workflow is generation → independent verification and source pin → backup →
restore → unchanged repeat → selection → consumer read/write. A failed phase
stops the sequence; existing output/control roots reject, so there is no automatic
retry or overwrite. Seven phases each allow at most 256 GiB instrumented I/O,
leaving room within 2 TiB for bounded parent verification. Full mode requires
20 GiB free, caps new retained data at 16 GiB, and uses 1,800/1,860-second internal/
outer limits with 256/512 MiB heap/RSS. The retained release's recovery schema,
record/cell/file bounds are unchanged. Small mode reduces outer/inner deadlines
to 125/120 seconds and retained output to 256 MiB.

Preparation receipts and the exact future executable plan are retained under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/recovery-qualification-prepare-20261014-qiRyqp/`.
Only small mode is executed in the preparation task. Generated-scale execution
requires its separate authorization. Existing SIGKILL results cover seven named
process boundaries; they do not establish power-loss or arbitrary torn-write
durability. Production authority/cutover, real evidence and renewed M2h remain
outside this qualification.

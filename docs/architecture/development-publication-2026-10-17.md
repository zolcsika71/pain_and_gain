# Reviewed development publication — 2026-10-17

## Frozen gameplay identity

This handoff publishes already completed development; it does not change or
activate gameplay. The exact runtime/build remains:

`79790451f2c07eebd62902ffb77d5b7618fdd97ef5a9d9d93a2314a70e74e094`

`secondaryObjectiveExperiment` and `healerUsefulClosingExperiment` remain false.
Escort remains enabled; every other switch stays as found. The pending manual
retreat trial has not been marked completed or reviewed. Scoped-health readiness
integration remains deferred; production retains the all-living-allies health
veto.

## Published scope

- General gameplay corrections and their regression coverage: bounded melee
  support pause/rejoin, guarded ranged spillover, adjacent ranged escape with
  support preference, pure-healer pressure retreat and disabled scout changes.
- Default-off secondary capture/contest planning, bounded route diagnostics,
  candidate-local route exclusions and shared validated-step group preflight.
- Default-off useful-healer closing, preserving pressure/escort/objective
  priorities and current-observation healing semantics.
- Explicitly test-only or rejected proposals and meaningful small regression
  projections: opening rally, health/healing comparison, shared melee targets,
  secondary-army evaluation, pre-contact kiting and scoped health readiness.
  Publication does not promote these proposals.
- Additive direct-`move` evidence compatibility, isolated CLI fixture dependency
  closure with authority/canonical-path assertions retained, and the separately
  verified converted legacy diagnostic-coverage omission correction. No storage
  migration, qualification, live reimport or authority change is executed.

The [current strategy contract](general-strategy-secondary-objectives-2026-10-16.md),
[closing integration](healer-useful-closing-test-only-2026-10-17.md),
[retreat audit](adjacent-ranged-retreat-support-audit-2026-10-17.md) and
[scoped-health comparison](secondary-scoped-readiness-test-only-2026-10-17.md)
retain the implementation and observation limits.

## Excluded and preserved

The unreviewed bounded collection coordinator and its roadmap remain local.
Its independent README/project-layout additions are deliberately not staged. Paused M2h
qualification sources, large oracle/run records, IDE SQL assistance, local
handoff documentation and the unrelated deleted prompt remain untouched and
unpublished. No file is removed merely because its purpose is uncertain.

`docs/examples/` was already ignored. The added exact ignores
`/docs/manual_evidence/` and `/identifier.sqlite` keep operator captures and the
local database out of Git without deleting or opening their payloads. External
evidence/handoff directories, managed replay data, databases and PNGs are not
cleaned, migrated or hydrated. Small, dependency-required test projections are
retained as regression fixtures, not treated as disposable bulk evidence.

## Validation reused, not rerun

- Adjacent retreat correction: retained failing-before support-choice assertions;
  final affected suite 206 pass / 0 fail / 0 skip, build check and
  `npm run check`. Its receipt discloses truncated individual TAP output.
- Shared capture/contest travel: 187 affected checks.
- Useful-closing integration: 186 affected checks and disabled equivalence.
- Isolated CLI fixture repair: both original failures reproduced, original
  assertions then passed; 50 affected checks with authority/path guards.
- Legacy omission fix: 49 continuation checks and 44 compatibility checks;
  real reimport/qualification remains unperformed.
- Scoped-health test-only comparison: 27 generated checks; integration deferred.
  Its recorded accidental two historical-fixture reads remain disclosed and
  excluded from policy findings, not relabelled compliant validation.

These accepted results are reused for unchanged source. No full-suite success,
new match, capture, survival improvement or competitive benefit is asserted.
Publication adds only ignore/documentation cleanup and package indentation
without changing script values. Fresh checks are limited to read-only build and
content hashes, candidate diff/credential/binary review, changed dependency/link
closure, ignore behavior, package semantic equivalence and whitespace.
No gameplay tests or storage qualification are rerun.

## Git and preservation boundary

At task entry, branch `main` and origin's remote `main` both pointed to
`fd90f9e7fdabe8961a2fb0e1e49cca089591fe17`. Origin's SSH URL identifies the same
owner/repository as the requested HTTPS remote. The initial index contained no
staged changes. Publication uses explicit path lists and one reviewed README
patch; it does not stage the worktree indiscriminately.

Staging/ordinary commits and normal push intentionally change Git index bytes
and refs under the current authorization. They are **not** restoration of, or
an explanation for, the earlier disclosed index-byte drift and oracle ctime
exceptions. Previously disclosed PNG metadata exceptions are likewise left
untouched. No metadata repair is attempted or implied.

Before/after runtime hashes, complete selected-file inventory/diff scan, excluded
paths, commit IDs, remote result and remaining local state are retained outside
Git at:

`/Users/zoltanka/.local/share/pain-and-gain-evidence/git-handoff-20261017-9BbWKQ/report.json`.

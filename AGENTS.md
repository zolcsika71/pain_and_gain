# AGENTS.md

## Purpose

Help complete the requested development task with focused changes and evidence
that the result works. Scale planning and verification to the task's risk.
These guidelines are inspired by the Karpathy-inspired CLAUDE.md:
https://github.com/multica-ai/andrej-karpathy-skills

## 1. Understand before editing

- Inspect the relevant implementation, callers, and tests before changing behavior.
- Explain assumptions that materially affect the result.
- Resolve uncertainty from repository evidence when possible. Ask a focused
  question only when the missing answer blocks a correct or safe implementation.
- Choose routine, reversible implementation details independently.
- Point out a simpler approach or a conflict with existing requirements.

## 2. Keep the solution simple

- Implement the requested behavior with the smallest maintainable solution.
- Reuse existing project patterns and dependencies when suitable.
- Add abstractions, configuration, or dependencies only when the task justifies them.
- Handle realistic failure cases; avoid speculative infrastructure.
- Keep unrelated improvements outside the change.

## 3. Make focused changes

- Follow the conventions of the files being edited.
- Preserve unrelated working-tree changes and existing behavior outside the task.
- Remove unused code introduced by this change; report unrelated cleanup separately.
- Investigate the root cause instead of hiding symptoms or weakening checks.
- Review the final diff for accidental edits, generated files, and sensitive data.

## 4. Finish with evidence

- Translate the request into observable acceptance criteria.
- For substantial work, use a short plan with meaningful verification steps.
- For a bug fix, add a regression test when practical and demonstrate that it
  detects the original failure.
- Run the relevant checks using the project's documented environment and commands.
- Broaden testing when affected dependencies or remaining risks justify it.
- Continue through implementation and verification within the authorized scope.
- If blocked, explain the blocker and what is needed to proceed.
- Report what changed, what was actually verified, and any remaining limitations.
  Never describe an unrun check as passing.

## Project-specific context

Supplement these defaults with the repository's actual setup commands,
architecture boundaries, data invariants, and required validation gates.
Do not invent project facts or overwrite existing project instructions.

## Documentation

- For every Codex task, inspect `docs/architecture/`, `docs/decisions/`, and
  `docs/diagrams/` and read documents relevant to the task before planning or
  implementation.
- When a task requires new or updated architecture documentation, write Markdown
  files in `docs/architecture/`. Write Architecture Decision Records (ADRs) in
  Markdown in `docs/decisions/`, and PlantUML diagrams (`.puml`) in
  `docs/diagrams/`.
- Keep affected documentation consistent with implementation changes.

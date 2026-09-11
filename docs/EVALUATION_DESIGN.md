# Evaluation and conversion workspaces

Status: implemented, 2026-09-11. Automated and packaged acceptance validation is recorded in `EVALUATION_REVIEW.md`. Live model acceptance remains pending a refreshed Claude Code login. This document defines the design and acceptance criteria.

## Scope

AIOS gains Skill Lab, Memory Review, and Convert to Markdown. All input comes from selected local resources/files. No sample scores, user paths, credentials, or model results are shipped. Existing discovery and configuration transactions remain independent of background jobs.

## Delivery plan

1. Add a separate asynchronous job worker, bounded child processes, cancellation, persisted results, interrupted-job recovery, native file selection and artifact saving.
2. Add a managed MarkItDown environment. Bootstrap pinned uv with a verified archive digest, provision Python when missing, and install a pinned converter. Convert selected local documents, show extraction errors/warnings and save Markdown.
3. Add Skill Lab: editable/importable suites, immutable original/candidate snapshots, repeated paired evaluations, deterministic and model-graded assertions, blind comparison, triggering tests, improvement proposals, retests, feedback and result export. Reuse pinned Anthropic skill-creator grading/comparison/analyzer instructions with attribution.
4. Add Memory Review: local findings with locations, length/token measurements, duplicate and reference checks, scope suggestions, optional AI review/rewrite, reviewed edits and section relocation through existing conflict-aware transactions. Run behavioral comparisons through the same evaluator.
5. Review failure boundaries and data flow; run regression, Electron UI, packaged UAT and bounded live integration checks. Record exactly what passed, failed or remains unverified.

## Execution and results

Claude Code is the initial evaluation provider. The UI exposes model, repeat count, timeout and spend limits. Jobs require explicit Run; AI input is sent through the user's configured Claude authentication. Instructions and outputs are untrusted data for review/judge tasks. Runs work on copies, not installed skill files. The runner must prevent inherited MCPs and hooks from polluting tests, and must report supported execution capabilities honestly.

Current and candidate use identical prompts, assertions, model and runner settings. Store source revisions, suite hash and engine version. Never turn an authentication error, invalid judge response, cancellation or timeout into a failed skill assertion. Show partial results and completed sample counts. Distinguish measured pass rate from subjective comparison and document hygiene. Use held-out cases for final improvement checks; do not claim general improvement from the training set alone. Display token/cost values only when reported by the engine.

Drafts and suggested changes require a visible comparison before applying. Source changes after evaluation invalidate promotion. Backups and Undo remain available. A run does not itself modify a live skill or memory file.

## Local conversion

Files are selected with a native picker or drop, copied into a private job folder, and converted with MarkItDown. Dependency installation uses an AIOS-owned runtime and never sudo or system-Python modification. Ordinary supported documents stay local. Cloud OCR, transcription and unsupported formats must not silently pretend to produce complete text. Show empty extraction as a warning, not successful faithful conversion. Render output as text; never execute converted HTML/scripts. Native Save As controls the output destination.

## Memory checks

Read selected files and deduplicate physical sources shared by providers. Show the selected scope and acknowledge that actual loading depends on provider rules. Configurable length guidance; exact paragraph duplicates; unresolved relative references; machine-specific paths; project-specific sections in user files; AI-assisted ambiguity and contradiction review. Similar content across providers may be intentional. No silent deletion or relocation. Shorter files are not evidence of better model behavior.

## Acceptance matrix

- Fresh home with no tools: installation progresses or returns actionable errors, no frozen UI.
- Unicode/spaces in paths, malformed files, empty extraction, unsupported/encrypted documents, cancellation during install/conversion, retry after failure.
- Baseline/candidate fairness, deterministic grading, malformed judge output, model failure, budget/time exhaustion, partial results, history after restart, interrupted jobs.
- Memory line locations, fenced examples, duplicate scope, missing references, reviewed edit, stale revision rejection, two-file section move and recovery.
- Dark/light modes, narrow window, keyboard controls, navigation during jobs, native picker/save cancellation, renderer error-free operation.
- No discovered command is executed merely by scanning; no live user configuration is edited by tests.

## Sources

- https://github.com/anthropics/skills/tree/main/skills/skill-creator
- https://github.com/microsoft/markitdown
- https://docs.astral.sh/uv/guides/install-python/
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/memory
- https://docs.cursor.com/context/rules-for-ai

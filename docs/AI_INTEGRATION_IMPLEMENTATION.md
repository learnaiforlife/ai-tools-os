# Shared AI engines: implementation and validation

Working-tree release: **1.4.0**, implemented September 11–12, 2026. This follows the [application-wide assessment](AI_INTEGRATION_REVIEW.md). The implementation uses the current machine's installed tools, native authentication and saved preferences; it bundles no personal configuration, credentials, model IDs or executable paths.

## Delivered workflows

| Area | Available behavior |
| --- | --- |
| Settings / External tools | Auto, Claude Code, Codex CLI, Cursor Agent or Local only; optional per-engine model IDs and executable overrides; capability detection; per-call timeouts, total call count and Claude dollar budget; strict-dollar mode |
| Skills, subagents, commands, memory and prompts | Goal-based AI drafting and explicit local templates; native-format rendering/validation; draft preview, editor review and separate save |
| Existing resources | Proposed edits to writable native resources, bound to the saved source; redacted configuration cannot be regenerated over private values |
| Skill Lab | Engine selection for task evaluations, paired A/B tests, judges, improvement/retest and analysis; generated editable test suites; skills, memory, agents, commands and saved prompts |
| Prompt templates | Explicit per-test variable values; identical substitutions for both variants; missing values rejected before model calls; revision checks on save |
| Memory Review | Existing local checks and reviewed changes/moves remain available; semantic review and rewrite use the selected engine |
| Security / Review resources | Selected-resource context preview, local rule checks and semantic AI review with validated source IDs, line numbers and exact quoted evidence |
| Markdown conversion | Existing local MarkItDown extraction; optional AI formatting cleanup produces a separate derived draft and retains the original extraction |
| Job history | Persisted output, source revisions, provenance, provider/model when reported, null cost where unavailable, cancellation and interrupted-run recovery |

Generation does not install or overwrite a resource. The existing native creation/write/backup service remains responsible for saves. Engine choice is independent of the resource's destination provider and user/project scope.

## Execution contracts

The implementation lives in `scripts/lib/ai/`: settings, environment filtering, schema validation, context filtering, native draft rendering, Claude execution, Codex/Cursor adapters and a shared runtime. Evaluation orchestration remains in `evaluator.mjs`; typed jobs are in `lab.mjs`. Electron exposes a fixed operation allowlist, not arbitrary shell access.

| Capability | Claude Code | Codex CLI | Cursor Agent |
| --- | --- | --- | --- |
| Text drafting, evaluation and review | Yes | Yes | Adapter implemented; live sign-in pending |
| Confined file tests | Yes | Unavailable | Unavailable |
| Native skill-trigger observation | Yes | Unavailable | Unavailable |
| Structured output | Native schema plus local validation | Native schema plus local validation | Parse answer JSON plus local validation |
| Dollar budget / reported cost | Native dollar control and usage | Unreported; use call/time limits | Unreported; use call/time limits |

**Claude:** preserves restricted/safe modes, disabled hooks, empty MCP configuration, excluded setting sources and explicit tool allowlists. The native username environment required for macOS Keychain access is preserved, along with selected-provider authentication variables.

**Codex:** checks the installed strict-config/ignore-config interfaces and advertised features; text runs disable advertised nonremoved features, inherited instruction/config loading, skills, plugins, MCPs and tools. Runs use an ephemeral private workspace and a read-only sandbox. A documented local startup warning about disabled Code Mode is accepted only before the turn starts; unexpected tool events or absent final results invalidate the run. The native Codex home remains available for authentication while user configuration is explicitly ignored.

**Cursor:** uses ask mode, enabled sandboxing, a private home/workspace/configuration and deny rules for shell, read, write, MCP and web tools. On macOS it temporarily references the native Keychain location without copying credential bytes; those references are removed after the request. Managed Cursor hooks cause a capability error. The adapter rejects tool-use events and validates the extracted answer. Its live authentication remains unverified after the installed CLI rejected its saved login.

Both discovery and execution use the same executable resolver, including Finder-style minimal PATH and common user install locations. Capability caches include resolved path, modification/change times and size. A changed executable or reported model during a comparison stops the run. Installation detection does not assert authentication or model entitlement.

Auto checks Claude, Codex, then Cursor for the requested capability. If tools are absent/incompatible at discovery, local templates/checks remain available. Explicitly selecting a missing engine reports the problem. Auth failures, timeouts, output errors and model refusals never silently switch engines or retry paid requests. A strict budget or unsupported file/trigger profile requires a compatible engine; it is not weakened automatically.

## Findings fixed during implementation

- Unified previously inconsistent CLI discovery, including both Cursor Agent aliases and user npm/cargo paths.
- Added backend schema validation and provider-specific event parsing instead of assuming Claude's response format and cost fields.
- Added revision checks to prompt records; stale generated content cannot overwrite a newer saved prompt. Proposal preparation also rejects a native file that changes between its context and editable-source snapshots.
- Kept AI preferences separate from native discovery settings, preserving unsaved appearance edits when AI preferences are saved. A late preference load cannot replace an engine choice already edited in an open dialog.
- Added structured JSON/TOML secret-value filtering with physical line preservation; semantic resource findings must quote the exact cited line.
- Preserved macOS username variables after live testing found that omitting them hid Claude's Keychain login.
- Corrected the evaluation wrapper after a live exact-output test returned `APPLE` plus an unwanted “No files were created” sentence. Text-only tests now request the resource's exact output format without file-reporting commentary.
- Required prompt variable values before starting evaluations and capped rendered prompt size. Attached inputs and file assertions are rejected in text-only or trigger profiles before starting a model job.
- Preserved unknown total cost on failed requests while retaining any known partial cost.
- Updated accessible test selectors for the new controls and corrected dark-theme styling of AI textareas.

## Validation and evidence

**Final checks:** 148 automated tests; 21 desktop checks; 18 lab/AI desktop checks; 41 packaged acceptance checks per architecture, plus native save/reinstall verification. All passed, with no renderer errors. Lint, application build and site build passed.

The final automated and packaged acceptance results are summarized in [validation.json](ai-integration-2026-09-11/validation.json). Unit/integration coverage includes missing tools, unsupported capabilities, strict budgets, malformed output, tool attempts, changed executables, auth failure without retries, context redaction, prompt conflicts/variables, local fallback and conversion-history preservation.

Desktop UAT uses a deterministic CLI double in a disposable home. It verifies application wiring, persistence, cancellation and before/after rendering, not model quality. MarkItDown conversion uses the real managed converter. Screenshots were visually inspected in dark and light appearances, including a narrow window.

Live acceptance uses `node tests/ai-live.mjs <engine> [model-id]`, with synthetic resources in a disposable home and native authentication. It attempts drafting, improvement/retest with training and held-out cases, and evidence-based review. Native sources remain unchanged. Reports:

- [Codex live result](ai-integration-2026-09-11/live-codex.json): passed AI drafting, improvement/retest from 0% to 100% on the two-case synthetic suite, the held-out case and resource review. The original source remained unchanged. This run began before the final text-wrapper adjustment described above; the model already honored the exact-output requirements in that run. Final automated/package tests cover the adjusted wrapper and final source state.
- [Claude live result](ai-integration-2026-09-11/live-claude.json): drafting and training calls authenticated successfully after the Keychain fix; one generated-candidate request was rejected by the upstream model service. AIOS retained the failure and suppressed the incomplete comparison delta. This is not a full live acceptance pass.
- [Cursor live result](ai-integration-2026-09-11/live-cursor.json): native login was rejected with `AUTH_REQUIRED`; browser sign-in needs completion. Adapter/parser and UI tests pass with controlled fixtures, but an authenticated live run is still required.

A small successful synthetic benchmark establishes that a path works for that input; it does not guarantee skill quality on arbitrary tasks. Provider refusals, outages, expired credentials, future CLI changes and model availability remain external dependencies. The app reports them as unsuccessful runs rather than fabricated behavioral scores.

## Release and remaining scope

Version 1.4.0 is packaged locally for Apple Silicon and Intel. Package validation checks both DMG and ZIP contents, code signatures, source equality, final hashes, runtime UI, native writes and persistence after reinstall. Intel runtime acceptance on this Apple Silicon host uses Rosetta; it is not a physical Intel/macOS-version matrix. These local beta packages are ad-hoc signed and not Apple notarized, matching the existing beta distribution model. This turn does not publish them or update Vercel.

The following assessment roadmap items are deliberately outside this first delivery: arbitrary project-code security review, automatic MCP recommendations/config generation, generated multi-file skill bundles, AI-assisted resource conversion during transfers, natural-language search, overview/history summaries, context consolidation recommendations and conversational onboarding. Existing deterministic operations remain available. Plugin/MCP resources can be reviewed as selected content, but their runtime behavior is not executed or certified.

Codex/Cursor file and native-trigger modes remain unavailable until their tool/discovery isolation and events have equivalent verified support. Local fallback supplies templates, format checks and rule findings; behavioral improvement requires an actual model run. Secret filtering is limited to recognizable patterns and structured fields, so users should review selected context before sending private prose to a model service.

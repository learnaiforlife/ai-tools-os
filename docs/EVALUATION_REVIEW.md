# Evaluation workspaces: implementation review and acceptance

Date: 2026-09-11. Version: 1.3.0. Source branch: `codex/evaluation-workspaces`. Application implementation: `e8a8fa6e77a8afeda99e4835de2b38d023104547`; final release source and clean CI: `9115e8df3db7a0a6ae89ea3f4954ea96017dec40`. Changes after the application commit are tests, documentation and release metadata.

The three workspaces are implemented. Local checks, real document conversion, fixture-based application workflows and live Claude model acceptance have passed. Version 1.3.0 is published as an ad-hoc signed beta for Apple Silicon and Intel, and the production download site exposes the verified artifacts.

## Delivered behavior

| Workspace | Implemented workflow |
| --- | --- |
| Skill Lab | Select a discovered instruction file; edit or import tests; snapshot the original and candidate; run repeated task evaluations, deterministic or model-graded assertions, blind A/B judgments and native description-trigger tests; inspect scores, evidence, outputs and reported usage. Train an improvement on training cases, retest against the original including held-out cases, review changes, export reports/candidates and package a skill. |
| Memory Review | Review selected memory files together; inspect line/token estimates, duplicate paragraphs, broken relative links, machine-specific paths and potential scope issues. Request contextual AI feedback or a rewrite. Preview duplicate removal and two-file user-to-project section moves, apply with revision checks and recover through History. Compare behavioral performance through Skill Lab. |
| Convert to Markdown | Select/drop local documents; install an application-owned Python/MarkItDown runtime when absent; convert batches; inspect Markdown and extraction warnings; copy or save through the native dialog. |

The shared worker provides progress, cancellation, persisted results, feedback, export and interrupted-run recovery without blocking configuration discovery. No run starts during discovery, and evaluation never directly rewrites installed instructions.

## Code review

Review followed the complete data flow: React controls → isolated preload IPC → main-process allowlist/native file selection → background job worker → input snapshots → child process → validated result → reviewed apply or native export. It also covered the existing transaction and package paths touched by these features.

| Finding | Resolution and verification |
| --- | --- |
| Background model or installer work could monopolize the configuration worker. | A separate asynchronous worker owns lab jobs; UI UAT navigates and cancels during a running evaluation. |
| Fresh Macs cannot assume a working Python/uv installation. | Bootstrap a checksum-verified uv archive, install managed Python 3.12 and a private pinned MarkItDown environment. Fresh-runtime integration exercises the actual download and conversion. |
| New transitive document dependencies dropped Intel/macOS compatibility. | Constrain compatible dependency versions, including onnxruntime and cryptography. Native Intel and Apple Silicon CI installs and exercises the converter. |
| MarkItDown accepted a bogus `.pdf` as ordinary text. | Validate supported document signatures before extraction; malformed-PDF integration now fails visibly. |
| Python cannot open a helper inside Electron ASAR as a normal file. | Read the bundled adapter through Electron/Node and pass its source to isolated Python. Packaged UAT exercises actual conversion. |
| An AI memory review's text summary could be rendered as a benchmark object. | Render results by their validated shapes; AI review UI UAT checks the real renderer path with a structured CLI fixture. |
| Malformed model answer/rationale types could reach React. | Reject invalid result types at the evaluator/job boundary. Regression tests exercise object-valued responses. |
| Restricted Claude ignored implicit project skill registration. | Load a temporary explicit plugin for trigger tests and verify its initialization event before recording a score. Actual CLI registration and a real-model trigger/no-trigger pair passed. |
| Trigger initialization failure could omit already-reported cost. | Account for returned cost before validating registration, then stop the unusable run. Regression verifies one call, retained cost and no false-negative score. |
| A timeout or missing usage during blind judging could permit subsequent paid calls. | Use the same fatal-error handling for tasks and judges. Timeout/auth/invalid-engine regression cases stop after the first failed judge and retain prior results. |
| A partial matching pair could show an improvement delta before the requested run finished. | Withhold delta until all requested samples and optional comparisons complete successfully. Partial averages remain visible with an incomplete-run notice. |
| Child output could split Unicode characters; cancellation could leave descendants running. | Decode streaming output as UTF-8 and cancel the process group; subprocess regression covers literal arguments, Unicode, limits and timeout/cancellation. |
| A stale or changing instruction bundle could contaminate a run. | Snapshot and fingerprint support files, verify the instruction revision, and give each sample independent copies. Applying a candidate checks the original instruction file revision. |
| A section move could break relative references or overwrite a concurrent edit. | Rebase ordinary relative links/imports outside fenced examples, preview both files, check both revisions and use one recoverable transaction. Tests cover CRLF/fences, conflicts and Undo. |
| The Intel packaged workflow could reuse stale memory findings while a new review loaded after an edit. | Clear reviewed findings after a successful write and at the start of a new check; disable duplicate check requests. Acceptance now asserts stale offsets/findings disappear after applying a change. |
| Generated files or exports could follow links or change after evaluation. | Bound regular-file reads, reject output symlinks, retain content hashes and recheck exported artifacts. Regression covers actual output bytes and later tampering. |
| File-drop UAT could click Convert while native selection was still busy on a slower run. | Wait for selected files and an enabled Convert button before proceeding; the corrected Intel packaged test passes actual conversion. |
| Packaged UAT could accidentally discover the host's real Claude executable. | Put the disposable CLI fixture first in the test PATH and assert detection before model UI tests. Fixtures never edit the user's actual AI configurations. |

## Validation record

| Layer | Result and evidence boundary |
| --- | --- |
| Lint, regression and production builds | `npm run check`: 127 tests pass, zero failures; app and download-site builds pass. |
| Existing Electron workflows | 21/21 acceptance checks pass; no renderer errors. |
| Real converter integration | 9/9 checks pass: absent-runtime installation, CSV/HTML/XLSX/PPTX/DOCX/PDF extraction, empty extraction warning and malformed PDF rejection. |
| New Electron workflows | 10/10 acceptance checks pass: reviewed memory edits/moves, contextual review rendering, measured A/B fixture results, stale-save rejection, cancellation/navigation, converter UI, native picker/Save As, narrow light layout and no renderer errors. Model calls use a deterministic CLI double; conversion uses actual MarkItDown. |
| Final packaged applications | Apple Silicon and Intel/Rosetta: 33/33 workflows pass on each. Both DMG/ZIP contents, ad-hoc signatures, source equality, final hashes, actual conversion, native save and reinstall persistence pass. |
| Final native CI | Both native Apple Silicon (`macos-15`) and Intel (`macos-15-intel`) pass all checks, actual converter setup, desktop UAT, dependency audits and package validation. [Run 34670864973](https://github.com/learnaiforlife/ai-tools-os/actions/runs/34670864973), tested commit `9115e8df3db7a0a6ae89ea3f4954ea96017dec40`. |
| Live CLI mechanics | Installed Claude Code 2.1.267 supports the required flags; actual restricted initialization loads the explicit evaluation plugin without unrelated user plugins or MCPs. |
| Live model acceptance | Passed with Claude Code 2.1.267 using synthetic fixtures: paired task A/B 0% → 100%, deterministic and structured model grading, blind candidate win, native trigger 0% → 100%, structured memory feedback, structured rewrite, real output-file creation 0% → 100%, and improvement retesting with overall 50% → 100% plus held-out 0% → 100%. The tested source files remained unchanged. |
| Publication | [GitHub prerelease v1.3.0-beta](https://github.com/learnaiforlife/ai-tools-os/releases/tag/v1.3.0-beta) contains both DMG and ZIP architectures. Both public DMGs were downloaded after publication and matched their manifest byte sizes and SHA-512 digests. [The production site](https://site-six-delta-67.vercel.app/#install) renders version 1.3.0, both download choices and the Apple notarization warning. |

Reproducible commands: `npm run check`, `npm run test:desktop`, `npm run test:conversion`, `npm run test:labs:desktop`, and `npm run dist:mac:local`. The CI workflow runs these on native Apple Silicon and Intel runners and uploads test results.

## Supported limits and model variability

Live acceptance reports the usage returned by Claude Code. One natural-language trigger probe did not activate the skill, while the explicit isolated trigger case did; this is expected model variability and is why trigger suites should contain several representative positive and negative prompts. An initial improvement fixture used ambiguous language about a “code” and produced an instruction aimed at code blocks rather than the intended identifier. A clearer task definition produced a candidate that passed both training and held-out behavior. Neither run overwrote its source. These results demonstrate the complete workflow and its evidence boundaries; they do not make a universal claim about model quality.

The initial evaluation provider is Claude Code. Its restricted task mode supports text and confined file tools, not shell commands, MCPs or external applications. This does not cover every execution mode of the upstream skill-creator. Native description tests are isolated tests, not competition against every installed skill. AI judgments and small-sample scores are not universal quality measurements.

Conversion supports the document formats listed in `EVALUATION_GUIDE.md`; cloud OCR, audio/video transcription, password-protected documents and archive batches are outside this release. The real conversion corpus covers six common formats, not every possible input or advertised format. macOS 13+ is the declared minimum; native CI uses macOS 15, so successful CI is not a claim that every macOS version was exercised.

These results establish the tested behavior, not the absence of all possible defects. The published beta is ad-hoc signed and is not Apple notarized; the download site accurately describes the required first-launch approval.

## Related documents

- [Design and acceptance criteria](EVALUATION_DESIGN.md)
- [Usage guide and integration limits](EVALUATION_GUIDE.md)
- [Source branch](https://github.com/learnaiforlife/ai-tools-os/tree/codex/evaluation-workspaces)

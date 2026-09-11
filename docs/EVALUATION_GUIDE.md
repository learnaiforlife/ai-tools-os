# Skill Lab, Memory Review and Markdown conversion

AIOS 1.3 adds three local workspaces. Native configuration discovery remains local; no job runs merely because a skill or memory file was discovered.

## Skill Lab

Select a discovered skill or memory file, edit a candidate, and add/import test cases. The original is snapshotted from disk when the run starts. A skill snapshot includes its support files. Each test and repeat gets independent working directories for the original and candidate. Run order is randomized. Clearing the candidate compares against no instructions.

Assertions can check exact text, included/excluded text, valid JSON, output-file existence, or use an AI grader. Set `file` to a relative output filename to check the created file instead of the answer. Binary outputs can be checked for existence, saved and inspected; the text grader does not pretend to evaluate their visual quality. Attach inputs through the native picker/drop area. File paths inside imported JSON are never opened automatically.

The initial runner uses an installed, authenticated Claude Code CLI. It requires the CLI's restricted and safe modes and structured output/budget flags. Update Claude Code if the app reports missing capabilities. Task runs support text and confined file tools. Bash, MCP and external application operations are deliberately unavailable in this release; tasks requiring them report capability errors. These results describe this execution mode, not a complete unrestricted agent session or other providers.

Native description tests load a temporary, explicit Claude plugin containing the evaluated description. AIOS checks the CLI initialization event to confirm the skill was registered and no unrelated plugin/MCP configuration loaded. It observes Skill/Read invocations rather than asking the model to self-report whether it used a skill. This is an isolated description-selection test; it does not model competition with every installed user skill.

Scores are measured pass rates for the chosen suite. Authentication errors, timeouts, malformed judgments and cancellation are not failed assertions. Incomplete comparisons show errors and do not produce an improvement delta. Reported costs/tokens come from the CLI. Standard deviation describes the recorded samples, not statistical significance or a universal quality score.

Optional blind comparison randomizes which answer is shown as A or B to an independent judge. The original skill and variant identities are withheld. Saved reports include evidence and individual samples. Analyze benchmark uses the upstream analyzer instructions to explain variance, regressions and weak assertions. AI judgments remain fallible.

Improve and retest requires both training and held-out cases. It measures training cases, drafts one candidate from training feedback, and evaluates the candidate and original on the full suite. Held-out prompts are withheld from the drafting call. Review the result before applying it. Repeatedly tuning on the same held-out results can overfit; use fresh held-out tasks for final validation.

Use Review candidate changes to inspect the complete before/after and explicitly apply it. A changed source revision rejects the save. Existing AIOS History holds backups. Candidate export and `.skill` packaging use the saved snapshot; packaging does not imply that evaluations passed. Human feedback and job reports are retained locally.

## Memory Review

Select files to review together. Shared physical sources are counted once. Local checks cover configurable line guidance, repeated paragraphs outside code fences, missing relative references, machine-specific paths and possible project-specific sections in user instructions. Findings provide file locations. Thresholds are guidance, not provider validity limits.

AI review offers contextual feedback on ambiguity, contradictions and scope. It sees only the selected files and must not invent repository facts. Select one file to draft a rewrite or compare its behavior in Skill Lab. Line/token reduction is shown separately from measured task success.

Review removal proposes a single duplicate-paragraph removal. Move section previews changes to both the user and project file, rebases ordinary relative Markdown references/imports, and appends the section to the existing project file. Review complex references manually. Source and destination revisions are checked at apply time; both writes share one recoverable transaction. History can undo the move if neither file changed afterward. No automatic deletion, rewriting or relocation occurs.

## Convert to Markdown

Select/drop up to 20 documents (50 MiB per file, 100 MiB per batch). AIOS installs MarkItDown 0.1.7 and compatible document dependencies in its own environment if needed. A pinned, checksum-verified uv installer provisions Python 3.12 on Macs without a suitable runtime. No sudo, Homebrew requirement or system-Python modification is used. Runtime setup needs internet access.

Supported local formats: PDF, DOCX, PPTX, XLSX/XLS, CSV, HTML, text/Markdown, JSON, XML, EPUB, Outlook MSG and notebooks. The converter uses `convert_local`, disables plugins/cloud clients and blocks Python network connections during extraction. It rejects invalid document signatures rather than accepting a malformed PDF as plain text.

Results appear as inert Markdown text and can be copied or saved with the native Save As dialog. Empty extraction has a warning. Scanned-only PDFs, images, audio, video, password-protected files and archive batches need additional processing that is not implemented here; selecting an unsupported format yields an actionable error. Supported documents can still lose charts, layout or image text. Each preview/export is limited to 2 MiB.

## Jobs, privacy and recovery

One background job runs at a time, separately from the configuration worker. Cancel stops active child process groups. Leaving the page does not cancel a job. Closing AIOS cancels running work; after an unexpected interruption the next launch shows an interrupted record instead of automatically re-running paid work. A timeout stops further model calls because the last call's unreported spend is unknown.

The job runner stores selected input copies, instruction snapshots, outputs, feedback and reports in the current user's `.aios/lab` directory. These are private local records and can contain sensitive source material. Use Delete run to remove a job and its copies. Up to 100 runs are retained; no old run is silently deleted. Local conversion is separate from AI review/evaluation, which sends the selected data through the user's existing Claude authentication. Credentials are not copied into reports.

## Upstream components

- Anthropic skill-creator: pinned commit `b9e19e6f44773509fbdd7001d77ff41a49a486c1`, Apache-2.0. AIOS reuses grader, comparator and analyzer instructions. Its own orchestration adds job isolation, cancellation, error classification and native review UI. Vendored source and license are under `scripts/lib/skill-creator`.
- Microsoft MarkItDown 0.1.7, MIT: https://github.com/microsoft/markitdown
- uv 0.12.13 bootstrap (existing uv is reused if available): https://github.com/astral-sh/uv

Dependency constraints retain wheels for macOS 13+ on both Apple Silicon and Intel. The application itself continues to require macOS 13 or newer.

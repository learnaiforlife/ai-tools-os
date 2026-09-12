# AIOS 1.5.0: implementation, review and acceptance

Date: September 12, 2026. Scope: the active Electron application, shared native AI runtime, session readers and download site. This record describes delivered behavior and its evidence boundaries; it is not a guarantee that every possible defect has been eliminated.

## Delivered experience

| Request | Implementation |
| --- | --- |
| Unused MCP alerts | Home and Cleanup show no recorded use across the three most recent matching sessions only when all three are complete and have tool-event coverage. Recommendations distinguish observed tool availability from current configuration, cite the sessions and last recorded use, and offer disable, project transfer and dismissal. A newer incomplete session prevents skipping back to older evidence. |
| Context visibility and sessions | Dedicated master/detail Sessions page with provider, scope, project and search filters; recent/peak sorting; bounded history pagination; first/latest/peak request input, cumulative billing usage, context-window denominator where recorded, tool calls, availability and instruction references. Context explorer separates local file-text estimates from measured session input. |
| Simple resource management | Compact resource library, state filters, sorting, search, selection, user/project/folder scope tabs, expandable details and a persistent details preference. Read/edit, disable/restore, copy/move, project MCP access, export and recovery retain native source identity. |
| AI enhancement | Primary Enhance uses the saved engine/model. More actions → Enhance with options opens the choice first. The proposal shows changes and goes through a separate revision-checked editor save. Existing AI drafting supports skills, agents, prompts and commands; security/configuration review shares the same runtime. |
| Official news | Home fetches maintained official Claude Code, Codex, Cursor, OpenAI and Anthropic feeds, restricted to detected tools and eligible model families. Prompt preferences support named providers, exclusions, models/harnesses and a bounded lookback. Preview explains interpreted filters. Cached headlines survive outages, retries are throttled, and sources/freshness remain visible. |
| Markdown reading | GitHub-flavored rendering for instruction documents, prompts and conversion results; tables, task lists, headings, code and optional frontmatter details. Raw HTML is escaped, remote images are not fetched, and only HTTP(S) links can open externally. Full source editing remains available. |
| Simple Skill Lab | Quick evaluation selects a resource, generates four text tests and runs a paired with/without-instructions benchmark in the background. The score appears only after complete execution. Generated assumptions and grading evidence remain inspectable. Advanced retains manual suites, file tests, trigger tests, A/B judging and improvement/retest. |
| Whole-workspace review | Home reviews selected skills and memory with a visible file count and approximate source-token warning. Individual resource pages also support per-file and selected-file review. Backend snapshots at most 1,000 files/8 MiB, redacts recognized credentials, batches by count/size and shares one overall AI budget. Completed batches and known cost remain available after failure/cancellation. |
| Cleanup | Evidence-backed unused MCPs, large instruction files and exact text-duplicate candidates; preview and reversible disable/archive; full skill bundles preserved. Duplicate instructions do not imply identical support files or permission to delete. |
| Appearance and navigation | Distinct overview, session explorer, context visualization and cleanup queue; grouped sidebar; light/dark/system themes; narrow-window layouts; advanced controls, source paths and run history disclosed on demand. Navigation resets the main scroll position and completed results come before run history. |

## Backend and privacy boundaries

Session readers inspect native Claude/Codex/Cursor JSONL metadata in the lab worker. Conversation text, answers, command input and tool results are not copied into the session index. Discovery uses the current user's native locations, configured overrides and CODEX_HOME, never a shipped personal path. Readers skip symlink entries, cap enumeration per provider root, cap file/total bytes, page history and cache by source identity. Oversized logs retain bounded beginning/recent portions, mark the session partial and do not claim initial usage or non-use.

The optional Claude/Cursor observer installs only after the app shows native hook changes for review. It preserves existing command and prompt hooks, uses dynamically resolved executable/private paths, stores a narrow metadata whitelist locally with owner-only permissions, and fails open without modifying a harness response. Invalid, oversized or timed-out events mark a coverage gap; cache invalidation prevents earlier summaries from hiding the gap. Removing it removes only AIOS hook commands. Reinstall the observer if the application is moved. Codex wrapper tools and Cursor message-only transcripts cannot establish complete MCP non-use.

Claude can defer MCP schemas. Enabled configuration is not proof of full schemas in every session. First-request input includes the user's prompt and is not a pre-prompt startup measurement. Provider reserves/output accounting may differ from the displayed input-to-window ratio. Startup fields that native history does not expose remain unavailable. Resource references are observed evidence, not a complete reconstruction of historical configuration. Same-named servers across scopes can be ambiguous. No claimed token savings are invented.

Official news requests send no resource contents or prompt preference text to publishers. AI jobs use native CLI authentication and send selected content to the chosen model service. Local fallback performs checks/templates and never invents a behavioral score. Auth/model failures do not silently substitute another provider. File changes remain app-controlled, revision-bound and recoverable.

## Review findings resolved

| Finding | Resolution and regression coverage |
| --- | --- |
| Startup background reads collided with native operations | Main process queues a bounded number of requests and drains them serially; worker failure rejects queued requests explicitly. |
| Cleanup preview revision varied on every attempt | Stable source/native-plan digest excludes newly generated archive IDs; selected skill bundle contents are included. Stale edits fail without source mutation. |
| Observer installation could remove non-command Claude hooks | Ownership comparison no longer matches absent command fields. Prompt hooks survive installation and removal in a regression test. |
| Dropped observer events could permit misleading non-use | Coverage-gap marker for parse/input/storage/time limits and cache key invalidation. Real observer subprocess test exercises malformed events. |
| Older complete sessions could hide a newer incomplete one | Recommendations first select the most recent scoped sessions, then require all three to be eligible. |
| Partial large logs showed old usage and an apparent initial count | Read bounded beginning and tail, retain recent usage, mark incomplete and clear first-request usage. |
| Empty usage records could appear as measured zero | Missing input usage remains null. |
| News errors could cause repeated immediate network requests | Cache failed attempts and apply a cooldown while preserving stale successful headlines. |
| All-project session filter returned no sessions | Empty project selection includes any recorded project, consistent with the resource filter. |
| Lab prompt choices ignored global scope/provider filters | Local prompt choices now respect the same filters as the prompt library. |
| Engine choice existed internally but was unreachable before Enhance | Added Enhance with options to resource actions and exercised it in UAT. |
| Completed run was buried below history / routes retained scroll | Result precedes collapsible history; route navigation resets scroll. |
| Bulk failure could omit latest cost/partial local findings | Persist current partial result before rethrowing a batch failure. |
| Generated test variables reached the model literally | Live Codex smoke exposed the defect. Evaluation now expands test input once for execution, graders and blind comparisons; missing variables are rejected during suite validation. A regression exercises all three stages. Generated prompts are instructed to preserve the source's input shape. |

## Validation record

Lint, app/site builds and 169 automated tests passed. Core desktop UAT passed 21 checks. Final packaged, observer and public-download results are appended below after completion. Deterministic native CLI doubles exercise UI success/failure paths without making every regression test a paid request. A separate live Codex run uses synthetic instructions and native authentication; source files remain unchanged. The initial live run is retained as bug-reproduction evidence, not a product-quality score. The corrected live Codex run completed all eight samples: 4/4 with the uppercase instructions and 0/4 without them. The original source remained unchanged; cost was not reported by Codex. See [the corrected synthetic run](experience-2026-09-12/live-codex.json) and [the earlier reproduction](experience-2026-09-12/live-codex-before-fix.json).

## Release boundaries

This is an ad-hoc-signed **beta** for macOS 13 or later, with Apple Silicon and Intel installers. It is not Apple notarized. Intel execution under Rosetta is not a native Intel hardware test; current-host testing is not a claim to cover every macOS version or enterprise policy. Harness telemetry and CLI capability differences remain explicitly visible. Quick generated tests are a small behavioral sample, not a certification, and file/network/MCP tasks require capabilities outside quick text-only evaluation.

## Final local acceptance

- 169 automated tests; lint, app build and site build passed; app and site audits reported zero vulnerabilities.
- 21 core desktop checks and 28 lab/experience desktop checks passed with no renderer errors.
- 50 packaged workflow checks passed per architecture, plus a separate observer installation/execution/removal check for each packaged executable. Both native-save/reinstall checks passed.
- Both DMGs and ZIPs passed deep signature validation, architecture/minimum-system checks, exact renderer/native source comparison and final SHA-512 metadata checks.
- Screenshots were inspected for Overview, Sessions, Markdown, Cleanup, Quick evaluation, Context explorer and the narrow light layout.
- The isolated release checkout produces identical renderer assets and native modules to the tested application (44 files compared).

[Machine-readable validation](experience-2026-09-12/validation.json) contains the final results. Earlier packaged probes exposed obsolete acceptance selectors for collapsed details and the new restore comparison; these selectors were corrected and the full workflows rerun successfully. The observer probe covers the dynamically generated native hook command, not only its parser.

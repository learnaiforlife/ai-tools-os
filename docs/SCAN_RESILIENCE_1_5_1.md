# AIOS 1.5.1 — scan isolation and company-laptop edge cases

## Report and diagnosis

The five supplied screenshots show missing JDK paths (`ENOENT`), 132 invalid YAML resource headers repeated across worktrees, and a global scan-limit warning. The underlying files are on a different machine; this review reproduced their failure patterns in disposable homes rather than accessing company configuration.

Invalid headers were already retained for inspection. Broken links were already caught individually, but every source error marked inventory coverage incomplete, and the UI presented that state as a failed or stopped scan across unrelated pages. A large native resource collection could also exhaust its containing project scan's budget. Separately, write authorization tried to resolve every configured root; one broken root could prevent edits to a healthy resource elsewhere.

## Changes

| Issue | Resolution |
| --- | --- |
| Recoverable missing paths look like a failed scan | Explicit scan completion and separate skipped-path, review, and coverage-limit counts. No source files are silently repaired or deleted. |
| Hundreds of repeated warnings overwhelm Overview and resource lists | Dedicated **Scan report** page groups matching reasons, expands details on demand, paginates paths, and supports scope, provider, search and notice-type filters. Overview shows a compact summary. |
| Warnings appear on unrelated Sessions and other pages | Global discovery warning banners removed. The report remains accessible with a sidebar count. Each affected resource retains a compact expandable warning. |
| A large command/agent/skill collection prevents other discovery | Native collections have independent budgets. Nested passes restore their caller's budget correctly. Later collections and selected roots continue. |
| A deep/wide SDK tree can consume the scan before peer projects | Project indexing visits folders breadth first with bounded queues and per-directory limits. Already queued peer projects are checked before deeper descendants. Limits remain explicit. |
| An unrelated broken root prevents healthy edits or transfers | Authorization ignores unresolvable roots as grants of access, then checks the healthy file against the remaining canonical roots. Transfer staging uses the same isolation. It never authorizes a lexical substitute for a broken link. |
| Header repair preview remains in Markdown mode | Repair preview now opens the before/after comparison directly, with the existing review checkbox and separate conflict-checked save. |

Missing paths, cyclic links, permission failures, links outside selected folders, unsupported encodings and oversized/special files remain reported. Repeated identical diagnostics for one path are deduplicated. Retry scan checks skipped paths again; resolved notices disappear. Invalid metadata preserves original text and can be inspected or repaired with a reviewed draft.

## Safety and limits

- Completed scanning does not mean every source was readable. The report states exactly which paths were skipped and which limits left descendants unchecked.
- The internal `incomplete` coverage flag remains conservative for full-inventory MCP profiles. These operations still refuse to pretend that missing or malformed sources form a complete snapshot. Individual healthy-file operations remain available.
- Selected-root, queue, depth, processing-time, file-size and symlink boundaries remain enforced. Very broad folders can still require narrower selections or exclusions; the app reports this without hiding healthy resources.
- Company policy and macOS permissions are not bypassed. No company paths, file contents or screenshot images are included in the release.
- Distinct worktree copies remain distinct resources. Only presentation of equivalent warnings is grouped.

## Validation

Regression coverage includes 132 malformed headers plus seven broken JDK-style links, a large command collection with healthy sibling skills/agents, a wide unrelated directory with a healthy peer project, permission denial, cyclic/out-of-root links, malformed configuration with an independently writable MCP, and healthy writes when another provider root is broken.

Shared desktop and packaged UAT exercises grouped notices, path pagination, type/search filtering, reviewed header-repair drafts, no unrelated Sessions banner, healthy editing with warnings present, and removal of resolved notices on retry.

Validation and distribution results are recorded alongside this report after packaging completes.

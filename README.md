# AI Tools OS

AIOS is a local macOS configuration manager for Claude Code, Codex and Cursor. It discovers each user's native configuration, shows the provider and source file, and supports full-text editing, reversible resource changes, MCP profiles and protected history. No personal configuration or seeded resource inventory is bundled.

**Supported runtime target: macOS 13 or later, Apple Silicon and Intel.** Both architectures can be built. A signed, notarized release and physical-device testing across the support matrix are required before distribution. “Every macOS version” is not supported by the current Electron runtime.

## Development

Use Node.js 22.13 or a newer 22.x patch, or Node.js 24 or later. Node.js 23 is outside the supported tooling range.

```sh
npm ci
npm --prefix site ci
npm run dev             # Vite and Electron, with private native access
npm run electron:start  # build and open the production interface
npm run check           # lint, backend regression tests, app/site builds
npm run test:desktop    # real Electron UI with an isolated temporary home
```

`npm run dev:web` and `npm run preview` are layout previews. They intentionally reject filesystem APIs; use Electron to work with machine configuration. Development and installed Electron builds use the same preload, IPC validation, worker and service.

## What works

- Discover known user and project configuration; filter consistently by provider, scope and project.
- Claude Code `.claude.json`, per-project MCP entries, `.mcp.json`, settings, local settings, skills, nested commands/subagents and instruction files.
- Codex `config.toml` MCP servers, instruction files and native `.agents/skills` plus `.codex/skills` locations.
- Cursor `mcp.json`, project `.mdc` rules, shared `AGENTS.md` and legacy `.cursorrules` files. Global Cursor user rules are configured in Cursor settings.
- Respect `CLAUDE_CONFIG_DIR` and `CODEX_HOME`, with persistent directory overrides for GUI environments that do not inherit shell variables.
- Inspect and edit complete UTF-8 files, compare the baseline and draft, validate JSON/TOML/frontmatter syntax, detect stale revisions and retain failed-save drafts.
- Create skills, commands, agents, memory files and MCP entries in provider-specific destinations.
- Disable/restore a specific native resource. Whole skill directories retain supporting files. Destination collisions are rejected.
- Capture actual MCP configurations as profiles, review exact source paths and changes, then apply only if those revisions still match. Incomplete discovery and ambiguous live/parked copies prevent profile capture/application.
- Inspect and edit live and parked instances independently when a restore destination is occupied. Both copies remain recoverable.
- Change JSON MCP entries without reserializing unrelated fields; parked entry text and large numeric values survive disable/restore. Export redaction also preserves unknown numeric literals.
- Save a local prompt library, substitute variables, and copy only after clipboard success.
- Review protected history and open a previous version as a draft. Export reviewed resource text with common JSON credential fields redacted.
- Install a tested, self-contained Claude statusline after reviewing both current files and the generated script.
- Persist appearance, scan roots, exclusions, provider paths and refresh intervals. Detect external executables without running them.

## Explicit boundaries

Inventory is **configured state**, not a claim that a provider has connected or loaded a resource. Project trust, precedence, remote/managed policy, actual token usage and runtime health remain provider responsibilities. Managed Claude sources are read-only. Plugin caches, remote settings and session stores are outside the current adapters.

Runtime start/stop controls, sandbox enforcement, generated memory suggestions, skill evaluation, fake historical charts and conversion queues from the prototype are not exposed as working features. See the resolution register for the distinction between fixes and retired capabilities.

## Filesystem safeguards

The desktop app has no listening filesystem HTTP server. Its renderer uses a narrow preload connection; the main process validates the sending frame. The installed UI has a stable `aios://app` origin, restrictive content policy, blocked external navigation and no external fonts or analytics.

Discovery and filesystem work run in a worker. Project indexing skips provider caches and skill support directories, streams directory enumeration, and checks selected folders before recursive discovery. Each root has a directory/native-resource work budget; a shared time limit and depth bound keep scans responsive. Ordinary files are not opened. Missing folders, malformed sources and broken links are reported while valid siblings remain visible. Writes require a currently discovered resource or a provider-specific creation destination. Symlink targets outside selected roots are rejected; authorized file links are preserved.

AIOS stores state in `~/.aios/state-v2.json` and the latest 100 transaction journals in `~/.aios/history`. Directories are owner-only and journals are mode `0600`. Existing file modes are retained. Unique temporary files, fsync, revision checks, a process lock, before-images and rollback protect mutations. Old disabled data can be imported once from Settings without guessing project provenance.

A crashed transaction is checked at the next request. If a third-party edit makes recovery ambiguous, AIOS preserves the files and blocks further mutations. History remains inspectable; review the before-images and pending journal before reconciling files. Backups are local plaintext protected by filesystem permissions, not an encrypted credential vault. Providers do not participate in AIOS's lock, so concurrent provider writes cannot be made globally transactional.

Safe whole-directory parking currently requires the same filesystem as `~/.aios`; cross-volume operations fail explicitly without moving or deleting the source. Text editing is limited to 2 MiB per file and valid UTF-8.

## Packaging and release

```sh
npm run dist:mac:local       # unsigned local tests, both architectures
node scripts/test-package.mjs
node scripts/test-package.mjs release-local x64 # optional Intel execution under Rosetta on Apple Silicon
npm run dist:mac             # clean commit + signing + notarization + validation
```

Local outputs are `release-local/AI-Tools-OS-<version>-arm64.{dmg,zip}` and `release-local/AI-Tools-OS-<version>-x64.{dmg,zip}`. Local builds are not approved public installers. Older outputs in `release/` predate the hardening pass and must not be distributed as this version.

The public release command requires a clean reviewed commit, Developer ID Application identity, and notarization credentials in the build environment. It runs validation, builds both architectures, verifies signatures/Gatekeeper/stapling, and generates final artifact checksums. Package checks extract both ZIPs and mount both DMGs read-only, compare all renderer assets and native modules against source, and verify the Applications shortcut and update metadata. The packaged smoke test installs from the ZIP in a temporary Applications folder, saves real fixture content, reinstalls the application and verifies retained preferences, prompts, parked resources and history. This is a reinstall check, not proof of an older-version upgrade. CI defines Apple Silicon and Intel runner jobs; a workflow file alone is not evidence those remote jobs passed. It never uploads artifacts automatically. Configure `AIOS_DOWNLOAD_BASE_URL` during verification to generate a download manifest after validation.

Updates currently use the same manual installation process: quit AIOS, replace the application in Applications with a newer verified signed build, and reopen it. User configuration, preferences and history live outside the application bundle. Back up those files before a production upgrade; install/upgrade testing on the declared Mac matrix remains a release gate.

The `site/` directory is a separate static landing page. It displays no installer links until a verified release manifest is provided. See [site instructions](site/README.md).

## Implementation and review

- `src/workbench.jsx`: active interface and shared inventory; `src/api.js`: serialized native requests.
- `electron/main.mjs`, `preload.cjs`, `worker.mjs`: isolated desktop boundary and worker lifecycle.
- `scripts/lib/discovery.mjs`: provider/source inventory; `formats.mjs`: YAML/TOML/native format handling.
- `scripts/lib/storage.mjs`: protected writes, locking, journaling and recovery; `service.mjs`: source-aware operations.
- `tests/`: fixture-based regression and real Electron UI tests. They do not mutate the developer's actual tool configuration.
- [Implementation and release requirements](docs/IMPLEMENTATION.md). Detailed local machine diagnostics are excluded from this validation branch.

Older page modules remain as unshipped design references; see `src/README.md`. Earlier uncommitted prototype work and local machine diagnostics remain in the original development checkout.

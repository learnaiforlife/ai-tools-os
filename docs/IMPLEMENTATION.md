# AIOS implementation and release requirements

The active application discovers local Claude Code, Codex and Cursor files through provider-specific adapters. Resources retain provider, canonical source, project scope and native key identity. Native IPC replaces the browser filesystem API. Full-content editing, revision checks, protected transaction journals and source-correct parking/restoration provide the configuration-manager foundation.

All resource screens share one inventory. Profiles capture actual memberships, show exact changes and require a current revision-protected preview. Malformed sources and ambiguous live/parked copies block profile operations. JSON structural edits preserve unrelated native fields and unknown numeric literals. Runtime connection status remains unknown; context numbers are labeled text estimates, with shared files counted once.

The provider support registry declares supported formats and explains precedence limits. Session flags, remote policies and workspace trust are provider responsibilities. Simulated process controls, sandbox enforcement, AI transformations and file conversion are unavailable. They must not be presented as implemented behavior.

## Validation

Run npm ci, npm --prefix site ci, npm run check, npm run test:desktop, npm run dist:mac:local and node scripts/test-package.mjs. All mutating checks use disposable homes. Package checks compare renderer/native sources, inspect ZIPs and mounted DMGs, validate final metadata, install a fixture app from ZIP and verify persistence after reinstall. The optional x64 test on an Apple Silicon host uses Rosetta and is not native Intel proof.

CI runs these checks on separate Apple Silicon and Intel runners. Local screenshots, machine inventories, historical diagnostic reports and deployment credentials are intentionally excluded from this public validation branch.

## Release gates

The declared target is macOS 13 or later on Apple Silicon and Intel. Local packages are unsigned test outputs. Production release requires a clean reviewed commit, Developer ID signing, app and DMG notarization/stapling, Gatekeeper acceptance, and install/edit/upgrade verification across supported Macs. Final metadata must be generated after notarization changes artifact bytes. The site has no downloads until a verified release manifest is supplied, and it does not copy unreviewed public assets.

Changes must not be called a complete production release until those gates have actual evidence. Backups preserve content and modes but are not an encrypted vault or complete macOS metadata backup. Cross-volume parking fails safely; ambiguous external writes can require manual recovery from retained journals.

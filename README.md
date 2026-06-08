# AI Tools OS

A unified, local-first **command center** for managing AI development resources — Claude Skills, MCP servers, memory files (`CLAUDE.md`/`MEMORY.md`), config files, slash commands, subagents, prompts, and external CLI tools — all from one visual interface.

This is a front-end implementation (React + Vite) of the *AI Tools OS* design, recreated pixel-for-pixel from the Claude Design handoff. Most screens use realistic mock data, but **enable/disable on MCP servers, MCP profiles, Subagents, Slash Commands, and Skills are wired to your real Claude Code config** via a local dev bridge (`scripts/aios-bridge.mjs`, mounted as a Vite plugin in `vite.config.js`). Disabling never deletes — it parks the config/file under `~/.aios/` so a fresh Claude session won't load it, and enabling restores it verbatim. `~/.claude.json` is backed up to `~/.aios/backups/` before every write. Everything else still fires toasts (see the audit for what maps to which real file).

## Run it

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the production build
```

## What's inside

A single cohesive app shell (sidebar + workspace switcher + top bar + status bar) hosting every screen, all navigable:

- **Dashboard** — resource health ring, MCP status, security risk, token donut, skill validation, suggested optimizations, activity timeline
- **Token Usage** — startup budget meter, category donut, 12-week trend, largest consumers, Low Token Mode
- **Security Review** — risk grade, capability permission matrix, mitigation drawer
- **Skills** — table / card / dependency-graph views, plus the Skill Editor (frontmatter + markdown split, validation, version history/diff) and the Testing Playground (trigger confidence, "why it fired / didn't", A/B versions)
- **MCP Servers** — start/stop/restart cards + six profiles (Minimal → Full Power) that swap token load
- **Memory** — quality scores, stale/dup/conflict flags, smart editor with inline token-saving suggestions
- **Commands** & **Subagents** — slash-command browser and a roster of specialized agents
- **Config Files** — tree + raw/form/diff editors with linked resources
- **Prompt Library**, **Best Practices** (live audit scorecard), **Tutorial**
- **External Tools** — tool hub, the non-technical MarkItDown conversion workflow, and a visual Statusline configurator
- Global **command palette** (⌘K), **resource drawer**, **share-as-install-prompt** dialog, **toasts**, first-run **onboarding**, **Settings**, and a floating **Tweaks** panel

### Try it
Press **⌘K** for the command palette, switch scope (top-left of the sidebar), toggle MCP profiles, run the Skill playground, flip light/dark from the top bar, and adjust accent / font / density / surfaces in **Settings → Appearance**.

## Architecture

- **React 18 + Vite**, plain JSX, no router (an in-app view switch in `src/app.jsx`).
- A small design system in `src/styles.css` (CSS custom properties: surfaces, risk scale, scope colors, type, spacing/density) drives a dark-first theme with a full light theme and live accent/density/surface tweaks.
- Shared primitives live in `src/ui.jsx` (badges, meters, rings, donut, sparkline, table bits, action menu, code highlighter); icons in `src/icons.jsx`; mock data in `src/data.jsx` / `src/data2.jsx`.
- Each screen is its own module under `src/`.

Dark mode is default; the theme choice persists to `localStorage`.

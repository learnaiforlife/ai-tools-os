# Active application modules

The production entry graph is `main.jsx` → `app.jsx` → `workbench.jsx`, with `api.js`, `icons.jsx`, `styles.css` and `workbench.css`.

The other page modules are the previous prototype. They are retained for design/reference because this workspace already contained substantial uncommitted work before the hardening pass. They are **not imported, built, packaged, or presented as implemented functionality**. Their simulated scores, runtime controls, sample records and toast-only actions must not be reintroduced into the production graph.

The current views all use one native resource inventory and the private Electron request channel. `docs/IMPLEMENTATION.md` describes working functionality and retired prototypes. Tests and lint target the active implementation; archived review probes describe the earlier snapshot, not current expected behavior.

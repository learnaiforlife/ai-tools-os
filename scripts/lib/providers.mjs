// Native conventions are product knowledge. User paths and resource contents
// are resolved at runtime, never stored in this capability registry.
export const PROVIDERS = [
  { name: 'Claude Code', formats: 'JSON settings and MCP; Markdown instructions, skills, commands and subagents',
    scopes: 'User, shared project, project local, and read-only local managed files',
    precedence: 'Managed policy takes priority. Session overrides, project local, shared project and user settings follow. Lists may merge. Check /status in Claude Code for loaded sources.',
    limitations: 'AIOS does not infer session flags, worktree-local routing, organization policies delivered remotely, or whether a project is trusted.',
    docs: 'https://code.claude.com/docs/en/settings' },
  { name: 'Codex', formats: 'TOML config and MCP; AGENTS instructions; .agents/skills and existing .codex/skills',
    scopes: 'User and project files; shared skill folders',
    precedence: 'Trusted project config layers override user config; session flags and selected provider profiles can override files. AGENTS.override.md replaces AGENTS.md at the same location.',
    limitations: 'AIOS MCP profiles are enable/disable snapshots, separate from Codex profiles. System, cloud defaults, provider profile files and session overrides are not resolved here.',
    docs: 'https://developers.openai.com/codex/config-basic/' },
  { name: 'Cursor', formats: 'JSON MCP; project .mdc rules, AGENTS.md and legacy .cursorrules; local skills',
    scopes: 'User MCP/skills and project files',
    precedence: 'Rule applicability depends on its type and matching files. Nested AGENTS.md adds more specific instructions; team and user rules are managed in Cursor.',
    limitations: 'Global user rules and remote team rules have no supported file creation path in AIOS. Configure those in Cursor. Editing a shared AGENTS.md also affects other tools that read it.',
    docs: 'https://cursor.com/docs/rules' },
];

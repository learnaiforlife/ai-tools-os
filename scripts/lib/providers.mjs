// Native conventions are product knowledge. User paths and resource contents
// are resolved at runtime, never stored in this capability registry.
export const PROVIDERS = [
  { name: 'Claude Code', formats: 'JSON settings, MCP and plugin references; Markdown instructions, skills, commands and subagents',
    scopes: 'User, shared project, project local, and read-only local managed files',
    precedence: 'Managed policy takes priority. Session overrides, project local, shared project and user settings follow. Lists may merge. Check /status in Claude Code for loaded sources.',
    limitations: 'Project access edits the native per-project MCP opt-out list. Plugin references control availability; installation and dependencies stay with Claude. AIOS does not infer session flags, remote policy or project trust.',
    docs: 'https://code.claude.com/docs/en/settings' },
  { name: 'Codex', formats: 'TOML config, MCP, plugin references and standalone agents; AGENTS instructions; .agents/skills and existing .codex/skills',
    scopes: 'User and project files; shared skill folders',
    precedence: 'Trusted project config layers override user config; session flags and selected provider profiles can override files. AGENTS.override.md replaces AGENTS.md at the same location.',
    limitations: 'Project MCP enabled flags require a trusted project. Plugin flags do not override workspace-managed enablement. AIOS profiles are snapshots, separate from Codex profiles. System, cloud, provider profiles and session overrides are not resolved.',
    docs: 'https://developers.openai.com/codex/config-basic/' },
  { name: 'Cursor', formats: 'JSON MCP; project .mdc rules, AGENTS.md and legacy .cursorrules; local skills, Markdown commands and subagents',
    scopes: 'User MCP/skills and project files',
    precedence: 'Rule applicability depends on its type and matching files. Nested AGENTS.md adds more specific instructions; team and user rules are managed in Cursor.',
    limitations: 'AIOS parks individual MCP definitions to disable them. Cursor Customize manages project-only toggles of inherited user servers and plugin installations; its internal database is not edited. Shared .agents skills and AGENTS.md may affect multiple tools.',
    docs: 'https://cursor.com/docs/rules' },
];

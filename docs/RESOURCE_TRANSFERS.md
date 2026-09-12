# Resource transfers and MCP scope controls — AIOS 1.2.0

AIOS manages the native files on the running Mac. Provider paths come from the current home directory, supported environment variables and saved path overrides. Project destinations must be inside selected scan folders. No personal resource, token, server or project is seeded into the application.

## Using the controls

1. Open Skills, MCP servers, Plugins, Commands, Subagents or Memory & rules and select **Copy / move** on a resource.
2. Choose Copy or Move, the provider, user/project scope and destination name. Claude MCP and plugin references also support private **Local** project scope.
3. Select **Review transfer**. Review the exact destination, preserved enabled state, supporting-file count and compatibility/sharing notes. Converted instruction content is shown for review.
4. Apply the transfer. A changed source, supporting file, destination or disabled-resource record invalidates the preview. Existing destinations are never overwritten.
5. Reload the provider or start a new session. AIOS does not disconnect existing sessions or claim that already-loaded tools have disappeared.

**History & recovery → Undo transfer** reverses a completed transfer only while its files and configuration still match the result. Later edits cause undo to refuse; use a fresh transfer or review the original backup instead. An interrupted undo uses the same persisted recovery mechanism as an interrupted write.

## Supported transfer operations

| Resource | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| MCP definitions | User `~/.claude.json`, project `.mcp.json`, private project entries in `~/.claude.json` | User and project `.codex/config.toml` | User and project `.cursor/mcp.json` |
| Skills | User/project `.claude/skills` | User/project `.agents/skills`; existing `.codex/skills` can be sources | User/project `.cursor/skills` |
| Subagents | User/project `.claude/agents/*.md` | User/project `.codex/agents/*.toml` | User/project `.cursor/agents/*.md` |
| Commands | User/project `.claude/commands` | Commands with portable metadata become `SKILL.md` skills | User/project `.cursor/commands` |
| Instructions | Native `CLAUDE.md` destination | Native `AGENTS.md` destination | Project `.cursorrules`, or same-provider `.mdc` rules |
| Plugin references | Copy/move `enabledPlugins` entries between user, project and local settings | Copy/move `[plugins."name@marketplace"]` entries between user and trusted-project settings | Plugin installation and workspace availability remain in Cursor Customize |

Transfer preserves the entire skill folder, including executable modes, binary assets and internal relative symbolic links. External links, special files and root link aliases are rejected instead of following or rewriting them. File bundles are bounded to 2,000 entries and 50 MiB. Text editors keep their existing 2 MiB limit.

Copy and move can cross filesystems. Staging and backup directories on an external volume are private and outside native resource-loading directories. They use `.aios-transfer-*` names and are excluded from AIOS discovery. Backup paths remain visible in History. The application does not execute transferred scripts or MCP commands.

Disabled resources remain disabled at their destination. A source-file move is distinct from effective provider availability: another scope, compatibility directory or installed plugin may expose a resource with the same name. Cursor can discover Claude/Codex skill and agent directories, and shared `.agents` skills or `AGENTS.md` files can affect more than one tool. [Cursor skills](https://cursor.com/docs/skills), [Cursor subagents](https://cursor.com/docs/subagents), [Codex skills](https://learn.chatgpt.com/docs/build-skills).

## MCP enable/disable behavior

**Enable matching MCPs / Disable matching MCPs** starts with the current provider, scope, project and search filters. The review dialog lets the user deselect sources before applying one transaction. It changes only the reviewed native definitions; it does not promise that every same-named server in other scopes is disabled.

| Control | Implementation and effect |
| --- | --- |
| Claude user/shared-project/private-local definition | Park the selected JSON entry in protected AIOS state; restore its exact original JSON on enable. Other entries and project state remain intact. |
| Claude **Project access** | Update `projects[projectPath].disabledMcpServers` in the native Claude state file. This opts a regular server name out for one project while preserving its user definition. Removing the opt-out does not approve an untrusted project server or change trust. |
| Codex definition | Set the native `enabled` boolean while retaining the server configuration and unrelated TOML bytes. |
| Codex **Project access** | Write `mcp_servers.<name>.enabled` in the selected project config. **Inherit** removes that override while preserving any transport settings. Codex must trust the project; deeper layers, selected profiles and session settings can affect the result. |
| Cursor definition | Park/restore the selected entry in its user or project JSON file. A matching entry in another scope can remain available. |
| Cursor project-only override of an inherited user server | Use the provider's Customize controls. AIOS displays this boundary rather than writing an invented `disabled` property or modifying Cursor's internal database. The CLI also provides `agent mcp enable/disable`; those CLI controls are not represented as editor-wide controls. |

Claude documents its three storage scopes and per-project opt-out list. Codex documents `enabled = false` and project configuration layers. Cursor documents native locations, precedence and its Customize toggles. [Claude MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [Cursor MCP](https://cursor.com/docs/mcp), [Cursor CLI MCP](https://cursor.com/docs/cli/mcp).

## Conversion rules

- MCP transfer preserves command arguments as arrays and maps static headers and supported environment-header references between JSON and TOML. OAuth grants, credentials held outside the source file and provider session state are not copied. Relative command paths retain their text; working-directory changes are called out in the preview.
- SSE endpoints cannot be automatically converted to Codex Streamable HTTP. Unsupported provider-only fields or variable interpolation cause a visible refusal; they are not silently dropped.
- Subagent conversion maps the name, description and full instruction body between Markdown frontmatter and Codex's standalone TOML format. Read-only configurations are mapped when supported. Provider model names are omitted with an explicit preview note so the destination inherits its own model. Untranslatable permissions, tool lists, hooks and other provider-specific fields block conversion. [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- Markdown commands can become Codex skills when their metadata is portable. Skill names are updated when the destination is renamed, with their instruction bodies and supporting files retained.
- Cursor rule activation/glob metadata is not converted into another provider's always-loaded instructions. Such cross-provider transfers are refused until the user adapts the rule deliberately.
- Whole provider configuration files, credential stores, session histories and arbitrary scripts are not portable resources. Continue using their native source editor where appropriate.

## Plugin boundaries

A plugin reference is not an installed plugin package. The provider controls marketplace identity, installation, dependencies and policy. AIOS edits documented Claude and Codex configuration references; it does not relocate cache folders, install arbitrary code or reuse one provider's marketplace ID in another provider.

For a user-to-project **Move** of a plugin reference, the user reference is retained as disabled so installed-plugin defaults cannot reactivate it outside that project. The destination retains the previous enabled state. When a provider or workspace forces a plugin state, AIOS cannot override that policy.

Claude uses scoped `enabledPlugins` settings; Codex documents scoped plugin enablement in its merged configuration and notes that workspace-managed states cannot be overridden. Cursor's plugin lifecycle stays in Customize. The lack of a stable external file-edit contract for Cursor toggles is an implementation boundary, supported by inspection of the installed editor's internal storage code; it is not a claim that Cursor lacks toggles. [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference), [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [Cursor plugins](https://cursor.com/docs/plugins).

## Validation

Regression tests exercise filesystem outcomes, header and subagent conversion, native scope keys, preserved credentials and unrelated bytes, disabled transfers, collisions, stale previews, rollback, undo and an actual second mounted filesystem. Packaged UAT uses disposable homes and operates the real interface through Copy/move, MCP bulk controls, Project access and plugin references. Native Claude and Codex CLI checks in separate disposable homes confirmed that both providers recognized AIOS's project-disable settings.

No existing provider configuration on the user's machine is moved, disabled, enabled or imported by this release's tests. The user chooses those actions in the application. Current local/CI results are recorded in the release evidence; unsupported provider formats and session-level behavior are explicit limits rather than simulated success.

/* data2.jsx — data for Commands, Subagents, Prompt Library, Best Practices, Tutorials */

const COMMANDS = [
  { id: "review", name: "/review", title: "Code Review", scope: "project", enabled: true, uses: 184, updated: "2h ago", args: "[--staged] [path]", desc: "Reviews changes for bugs, security and style, grouped by severity.",
    body: "Review the staged changes for bugs, security issues, and style violations.\nGroup findings by severity (critical → nit) and suggest a concrete fix for each.\nEnd with a one-line verdict: ship / fix-first / block." },
  { id: "test", name: "/test", title: "Write Tests", scope: "project", enabled: true, uses: 132, updated: "1d ago", args: "[file]", desc: "Generates tests for the current file following repo conventions.",
    body: "Write unit tests for $FILE using the project's test framework.\nCover happy path, edge cases, and error states. Match existing naming." },
  { id: "commit", name: "/commit", title: "Commit Message", scope: "user", enabled: true, uses: 421, updated: "30m ago", args: "", desc: "Writes a conventional commit message from staged changes.",
    body: "Summarize the staged diff as a Conventional Commit.\nFormat: type(scope): subject — keep under 72 chars. Add a body only if non-obvious." },
  { id: "explain", name: "/explain", title: "Explain Code", scope: "user", enabled: true, uses: 96, updated: "4d ago", args: "[selection]", desc: "Explains the selected code in plain language.",
    body: "Explain what the selected code does, step by step, for a junior developer.\nCall out side effects and any non-obvious logic." },
  { id: "refactor", name: "/refactor", title: "Refactor", scope: "project", enabled: true, uses: 78, updated: "6d ago", args: "[goal]", desc: "Refactors toward a stated goal without changing behavior.",
    body: "Refactor the selected code to $GOAL. Preserve behavior and public API.\nShow a diff and explain the trade-offs." },
  { id: "pr", name: "/pr", title: "PR Description", scope: "project", enabled: false, uses: 54, updated: "1w ago", args: "", desc: "Drafts a pull-request description from the branch diff.",
    body: "Draft a PR description: summary, motivation, changes, test plan, screenshots placeholder." },
  { id: "standup", name: "/standup", title: "Daily Standup", scope: "workspace", enabled: true, uses: 33, updated: "1d ago", args: "", desc: "Summarizes yesterday's commits into standup notes.",
    body: "From my git log over the last 24h, write standup notes: Done / Doing / Blockers." },
  { id: "sql", name: "/sql", title: "SQL Helper", scope: "project", enabled: true, uses: 61, updated: "3d ago", args: "[question]", desc: "Turns a question into a SQL query against the project schema.",
    body: "Using the project's Postgres schema, write a SQL query that answers: $QUESTION.\nExplain the query and flag any full-table scans." },
];

const SUBAGENTS = [
  { id: "reviewer", name: "Code Reviewer", role: "Reviews PRs & diffs", model: "Sonnet 4.6", scope: "project", status: "ready", color: "#5b9dff", runs: 248, updated: "2h ago", tools: ["Read", "Grep", "github-mcp"], desc: "Inspects diffs for correctness, security and style. Posts inline comments.",
    prompt: "You are a meticulous senior code reviewer. Prioritize correctness and security over style. Be specific and cite line numbers." },
  { id: "tester", name: "Test Writer", role: "Writes & repairs tests", model: "Sonnet 4.6", scope: "project", status: "ready", color: "#2bd4a0", runs: 176, updated: "1d ago", tools: ["Read", "Edit", "Bash(npm)"], desc: "Generates and maintains unit & integration tests to match changes.",
    prompt: "You write thorough, fast tests. Follow the repo's framework and naming. Never test implementation details." },
  { id: "researcher", name: "Researcher", role: "Web & codebase research", model: "Opus 4.1", scope: "user", status: "ready", color: "#b79bff", runs: 92, updated: "5h ago", tools: ["WebFetch", "playwright-mcp", "memory-mcp"], desc: "Gathers and synthesizes information from the web and the codebase.",
    prompt: "You are a rigorous research analyst. Cite sources, separate fact from inference, and flag uncertainty." },
  { id: "docs", name: "Doc Writer", role: "Docs & changelogs", model: "Sonnet 4.6", scope: "project", status: "idle", color: "#f5b544", runs: 64, updated: "2d ago", tools: ["Read", "Edit"], desc: "Keeps READMEs, API docs and changelogs in sync with the code.",
    prompt: "You write clear, concise developer docs. Prefer examples over prose. Match the existing voice." },
  { id: "security", name: "Security Auditor", role: "Threat & risk review", model: "Opus 4.1", scope: "workspace", status: "ready", color: "#ff8a4c", runs: 41, updated: "3d ago", tools: ["Read", "Grep", "Bash(semgrep)"], desc: "Audits code and configs for vulnerabilities and risky permissions.",
    prompt: "You are a paranoid security engineer. Assume hostile input. Rank findings by exploitability and blast radius." },
  { id: "migrator", name: "Migration Planner", role: "Plans large refactors", model: "Opus 4.1", scope: "project", status: "idle", color: "#ff5d6c", runs: 18, updated: "1w ago", tools: ["Read", "Grep", "Edit"], desc: "Breaks big migrations into safe, reviewable, incremental steps.",
    prompt: "You plan migrations as a sequence of small, independently shippable PRs with rollback notes." },
];

const PROMPTS = [
  { id: "p1", title: "Rubber-duck debugger", category: "Debugging", uses: 64, fav: true, updated: "1d ago", vars: ["error", "context"],
    body: "I'm hitting this error:\n{{error}}\n\nContext:\n{{context}}\n\nWalk me through the most likely causes from most to least probable, and the fastest way to confirm each." },
  { id: "p2", title: "Architecture decision record", category: "Planning", uses: 38, fav: true, updated: "3d ago", vars: ["decision", "options"],
    body: "Write an ADR for: {{decision}}.\nOptions considered: {{options}}.\nInclude context, decision, consequences, and what we're explicitly NOT doing." },
  { id: "p3", title: "Explain like I ship tomorrow", category: "Coding", uses: 51, fav: false, updated: "5h ago", vars: ["topic"],
    body: "Explain {{topic}} to me as if I have to ship a feature using it tomorrow. Skip history. Give me the 20% I'll use 80% of the time, with a code example." },
  { id: "p4", title: "PR self-review checklist", category: "Review", uses: 27, fav: false, updated: "6d ago", vars: [],
    body: "Before I open this PR, interrogate my diff: untested paths, missing error handling, naming, perf footguns, and anything a reviewer will nitpick." },
  { id: "p5", title: "Cold-start a new repo", category: "Planning", uses: 19, fav: false, updated: "1w ago", vars: ["stack", "goal"],
    body: "I'm starting a {{stack}} project to {{goal}}. Propose a folder structure, the first 5 files, and a 1-day plan to a working skeleton." },
  { id: "p6", title: "Tighten this copy", category: "Writing", uses: 44, fav: true, updated: "2d ago", vars: ["text", "voice"],
    body: "Rewrite the following in a {{voice}} voice. Cut filler, keep meaning, no jargon:\n{{text}}" },
  { id: "p7", title: "Find the root cause", category: "Debugging", uses: 33, fav: false, updated: "4d ago", vars: ["symptom"],
    body: "Symptom: {{symptom}}. Use 5-whys. After each why, tell me what to check to validate before going deeper." },
  { id: "p8", title: "Research summary brief", category: "Research", uses: 22, fav: false, updated: "1w ago", vars: ["question"],
    body: "Research: {{question}}. Give me a 1-page brief: TL;DR, key findings with sources, open questions, and a recommendation." },
];

const PROMPT_CATS = ["Coding", "Debugging", "Review", "Planning", "Writing", "Research"];

const BEST_PRACTICES = [
  { topic: "Skills", icon: "skill", items: [
    { title: "Keep each skill under 2k tokens", status: "applied", detail: "9 of 10 skills are within budget." },
    { title: "Use distinct, specific trigger phrases", status: "applied", detail: "No trigger collisions detected." },
    { title: "Declare only the tools a skill needs", status: "partial", detail: "Deploy Runbook requests broad shell access." },
    { title: "Validate before enabling in shared scope", status: "missing", detail: "1 broken skill is still enabled." },
  ]},
  { topic: "MCP & Tokens", icon: "mcp", items: [
    { title: "Sandbox MCP servers with shell access", status: "missing", detail: "Desktop Commander runs shell unsandboxed." },
    { title: "Match your profile to the task", status: "partial", detail: "Full Power is active for routine coding." },
    { title: "Prefer local transports over networked", status: "applied", detail: "6 of 8 servers run locally over stdio." },
    { title: "Watch startup token budget", status: "partial", detail: "55.7k of 64k — approaching the warn line." },
  ]},
  { topic: "Memory", icon: "memory", items: [
    { title: "One source of truth per fact", status: "missing", detail: "Staging-DB note duplicated across 2 files." },
    { title: "Date and prune decisions", status: "partial", detail: "4 stale sections in project CLAUDE.md." },
    { title: "Compress long-lived memory", status: "applied", detail: "Claude-Mem summaries are auto-compressed." },
  ]},
  { topic: "Security", icon: "shield", items: [
    { title: "Sandbox tools with shell + network", status: "missing", detail: "2 critical resources run unsandboxed." },
    { title: "Verify publishers before install", status: "applied", detail: "Block-unverified-publishers is on." },
    { title: "Never hardcode secrets in config", status: "applied", detail: "Secrets are read from env vars." },
  ]},
];

const TUTORIALS = [
  { id: "t1", title: "Your first 10 minutes", desc: "Tour the OS, set your scope, and clean up one risky resource.", level: "Start here", mins: 10, steps: 5, progress: 100, icon: "sparkles", featured: true },
  { id: "t2", title: "Write your first Skill", desc: "Frontmatter, triggers, and validating in the playground.", level: "Beginner", mins: 15, steps: 6, progress: 60, icon: "skill" },
  { id: "t3", title: "Tame your token budget", desc: "Read the token dashboard and cut startup cost by half.", level: "Beginner", mins: 12, steps: 4, progress: 25, icon: "tokens" },
  { id: "t4", title: "Connect an MCP server", desc: "Add, scope, and profile a Model Context Protocol server.", level: "Intermediate", mins: 18, steps: 7, progress: 0, icon: "mcp" },
  { id: "t5", title: "Build a subagent team", desc: "Define agents, assign tools, and route work to them.", level: "Intermediate", mins: 20, steps: 6, progress: 0, icon: "users" },
  { id: "t6", title: "Convert any doc with MarkItDown", desc: "Turn PDFs and slides into clean Markdown for your AI.", level: "Beginner", mins: 8, steps: 3, progress: 0, icon: "file" },
];

const TUTORIAL_STEPS = [
  { t: "Set your default scope", d: "Choose User, Project, or Workspace from the sidebar switcher.", done: true },
  { t: "Run a health scan", d: "Open the Dashboard and trigger a scan to index your resources.", done: true },
  { t: "Open Security Review", d: "Find the 2 flagged critical resources.", done: true },
  { t: "Sandbox one risky resource", d: "Sandbox the Desktop Commander MCP.", done: true },
  { t: "Switch to a lighter profile", d: "Pick Low Token Mode to shrink startup cost.", done: false },
];

export { COMMANDS, SUBAGENTS, PROMPTS, PROMPT_CATS, BEST_PRACTICES, TUTORIALS, TUTORIAL_STEPS };

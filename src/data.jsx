/* data.jsx — mock data for AI Tools OS.
   MCPS are synced from your real ~/.claude.json via `npm run sync`
   (see scripts/sync-mcp.mjs); the rest is realistic sample data. */

import { MCPS } from "./mcp-servers.generated.js";

const SKILLS = [
  { id: "pdf-extract", name: "PDF Extractor", scope: "user", enabled: true, status: "valid", risk: "low", tokens: 1240, trigger: 92, desc: "Extracts text, tables, and metadata from PDF files using pdfplumber.", path: "~/.claude/skills/pdf-extract/SKILL.md", updated: "2d ago", version: "v4", deps: ["pdfplumber", "MarkItDown"], triggers: ["read pdf", "extract from document", "parse invoice"] },
  { id: "react-scaffold", name: "React Scaffolder", scope: "project", enabled: true, status: "valid", risk: "safe", tokens: 860, trigger: 88, desc: "Generates typed React components with tests following repo conventions.", path: ".claude/skills/react-scaffold/SKILL.md", updated: "5h ago", version: "v11", deps: ["typescript"], triggers: ["new component", "scaffold react", "create page"] },
  { id: "sql-explain", name: "SQL Explainer", scope: "project", enabled: true, status: "warn", risk: "med", tokens: 2180, trigger: 64, desc: "Explains query plans and suggests indexes. Reads live DB schema via MCP.", path: ".claude/skills/sql-explain/SKILL.md", updated: "1w ago", version: "v2", deps: ["postgres-mcp"], triggers: ["explain query", "why slow", "optimize sql"] },
  { id: "brand-voice", name: "Brand Voice Writer", scope: "workspace", enabled: true, status: "valid", risk: "safe", tokens: 1520, trigger: 79, desc: "Rewrites copy in the Acme brand voice with tone guardrails.", path: "@workspace/skills/brand-voice/SKILL.md", updated: "3d ago", version: "v7", deps: [], triggers: ["rewrite in brand voice", "make on-brand", "marketing copy"] },
  { id: "screenshot-diff", name: "Screenshot Diff", scope: "user", enabled: false, status: "valid", risk: "low", tokens: 640, trigger: 71, desc: "Compares UI screenshots and reports visual regressions.", path: "~/.claude/skills/screenshot-diff/SKILL.md", updated: "2w ago", version: "v1", deps: ["playwright-mcp"], triggers: ["compare screenshots", "visual diff"] },
  { id: "deploy-runbook", name: "Deploy Runbook", scope: "project", enabled: true, status: "broken", risk: "high", tokens: 3050, trigger: 41, desc: "Executes deploy steps. Broken reference to missing hooks/predeploy.sh.", path: ".claude/skills/deploy-runbook/SKILL.md", updated: "4d ago", version: "v9", deps: ["shell", "aws-cli"], triggers: ["deploy", "ship to prod", "rollback"] },
  { id: "changelog", name: "Changelog Generator", scope: "project", enabled: true, status: "valid", risk: "safe", tokens: 540, trigger: 84, desc: "Summarizes merged PRs into a clean changelog grouped by type.", path: ".claude/skills/changelog/SKILL.md", updated: "6d ago", version: "v3", deps: ["github-mcp"], triggers: ["generate changelog", "release notes"] },
  { id: "data-viz", name: "Chart Builder", scope: "user", enabled: true, status: "valid", risk: "safe", tokens: 980, trigger: 76, desc: "Turns tabular data into clean SVG charts with sensible defaults.", path: "~/.claude/skills/data-viz/SKILL.md", updated: "1d ago", version: "v5", deps: [], triggers: ["make a chart", "visualize data", "plot this"] },
  { id: "regex-smith", name: "Regex Smith", scope: "user", enabled: false, status: "valid", risk: "safe", tokens: 320, trigger: 58, desc: "Builds and explains regular expressions with test cases.", path: "~/.claude/skills/regex-smith/SKILL.md", updated: "3w ago", version: "v2", deps: [], triggers: ["write a regex", "match pattern"] },
  { id: "api-mock", name: "API Mocker", scope: "project", enabled: true, status: "valid", risk: "low", tokens: 1120, trigger: 81, desc: "Spins up mock REST endpoints from an OpenAPI spec.", path: ".claude/skills/api-mock/SKILL.md", updated: "8h ago", version: "v6", deps: ["node"], triggers: ["mock endpoint", "fake api", "stub server"] },
];

// MCP profiles swap which of your real servers load at startup.
// Token cost is computed live from the member servers so it always stays accurate.
const _profileTokens = (ids) => ids.reduce((s, id) => { const m = MCPS.find(x => x.id === id); return s + (m ? m.tokens : 0); }, 0);
const MCP_PROFILES = [
  { id: "minimal", name: "Minimal Coding", desc: "Just the essentials for writing code", icon: "cube", mcps: ["github", "filesystem"], active: false },
  { id: "research", name: "Research Mode", desc: "Docs, scraping, and recall", icon: "globe", mcps: ["firecrawl", "context7", "memory"], active: false },
  { id: "browser", name: "Browser Mode", desc: "Full web automation stack", icon: "eye", mcps: ["playwright", "puppeteer", "filesystem"], active: false },
  { id: "market", name: "Market Data", desc: "Charts, quotes, and repos", icon: "dollar", mcps: ["tradingview", "github"], active: false },
  { id: "full", name: "Full Power", desc: "Everything enabled — high token cost", icon: "zap", mcps: ["context7", "desktop-commander", "filesystem", "firecrawl", "github", "memory", "playwright", "puppeteer", "tradingview"], active: true },
  { id: "lowtoken", name: "Low Token Mode", desc: "Bare minimum context footprint", icon: "compress", mcps: ["context7"], active: false },
].map(p => ({ ...p, tokens: _profileTokens(p.mcps) }));

const MEMORY = [
  { id: "claude-user", name: "CLAUDE.md", scope: "user", path: "~/.claude/CLAUDE.md", tokens: 1840, quality: 86, lines: 142, updated: "1d ago", issues: { stale: 0, dup: 1, contradiction: 0 }, consumers: ["Claude Code", "Cursor"], desc: "Global preferences, coding style, tone." },
  { id: "claude-proj", name: "CLAUDE.md", scope: "project", path: ".claude/CLAUDE.md", tokens: 3260, quality: 62, lines: 318, updated: "3h ago", issues: { stale: 4, dup: 3, contradiction: 1 }, consumers: ["Claude Code"], desc: "Project conventions, architecture notes, gotchas." },
  { id: "memory-md", name: "MEMORY.md", scope: "project", path: ".claude/MEMORY.md", tokens: 2100, quality: 71, lines: 196, updated: "2d ago", issues: { stale: 2, dup: 0, contradiction: 1 }, consumers: ["Claude Code", "Claude-Mem"], desc: "Running log of decisions and learnings." },
  { id: "cursor-rules", name: ".cursorrules", scope: "project", path: ".cursorrules", tokens: 980, quality: 78, lines: 84, updated: "5d ago", issues: { stale: 1, dup: 0, contradiction: 0 }, consumers: ["Cursor"], desc: "Cursor-specific rules and constraints." },
  { id: "agents-md", name: "AGENTS.md", scope: "workspace", path: "@workspace/AGENTS.md", tokens: 1450, quality: 81, lines: 110, updated: "1w ago", issues: { stale: 0, dup: 2, contradiction: 0 }, consumers: ["Claude Code", "Codex"], desc: "Shared subagent roster and responsibilities." },
  { id: "claude-mem", name: "Claude-Mem Summaries", scope: "user", path: "~/.claude-mem/summaries.jsonl", tokens: 5200, quality: 90, lines: 0, updated: "20m ago", issues: { stale: 0, dup: 0, contradiction: 0 }, consumers: ["Claude-Mem"], desc: "Auto-generated session summaries, compressed." },
];

const TOOLS = [
  { id: "statusline", name: "Statusline", vendor: "Claude Code", installed: true, setup: false, locality: "local", risk: "safe", icon: "statusbar", desc: "Design the Claude Code status line visually — model, git, tokens, cost and more. No bash required.", deps: ["Claude Code ≥1.0"], lastRun: "—", actions: ["Configure"], version: "built-in" },
  { id: "markitdown", name: "MarkItDown", vendor: "Microsoft", installed: true, setup: true, locality: "local", risk: "safe", icon: "file", desc: "Convert PDF, DOCX, PPTX, XLSX, images & audio into clean Markdown for LLMs.", deps: ["python ≥3.10"], lastRun: "12m ago", actions: ["Convert", "Batch", "Logs"], version: "0.0.1a3" },
  { id: "claude-mem", name: "Claude-Mem", vendor: "community", installed: true, setup: true, locality: "local", risk: "low", icon: "memory", desc: "Persistent compressed memory across Claude Code sessions.", deps: ["node ≥18"], lastRun: "20m ago", actions: ["Open", "Compress", "Logs"], version: "2.4.0" },
  { id: "graphify", name: "Graphify", vendor: "community", installed: true, setup: false, locality: "local", risk: "low", icon: "graph", desc: "Build dependency & knowledge graphs from your codebase and notes.", deps: ["python ≥3.11", "graphviz"], lastRun: "never", actions: ["Set up", "Logs"], version: "0.9.2" },
  { id: "rtk", name: "RTK", vendor: "community", installed: false, setup: false, locality: "local", risk: "med", icon: "terminal", desc: "Resource toolkit — bulk operations on skills, MCPs and configs from the CLI.", deps: ["go ≥1.21"], lastRun: "never", actions: ["Install"], version: "1.2.0" },
  { id: "headroom", name: "Headroom", vendor: "community", installed: true, setup: true, locality: "networked", risk: "med", icon: "tokens", desc: "Live context-window & token budget monitor with alerts.", deps: ["node ≥18"], lastRun: "active", actions: ["Open", "Configure", "Logs"], version: "3.1.4" },
  { id: "custom-lint", name: "repo-lint", vendor: "you", installed: true, setup: true, locality: "local", risk: "low", icon: "terminal", desc: "Custom CLI: lint skill frontmatter & memory files for token bloat.", deps: ["node ≥18"], lastRun: "1h ago", actions: ["Run", "Edit", "Logs"], version: "local" },
];

// Security capability matrix — which capabilities each resource uses
const CAP_LIST = [
  { key: "local", label: "Runs locally", good: true },
  { key: "network", label: "Network" },
  { key: "files", label: "Reads files" },
  { key: "writes", label: "Writes files" },
  { key: "shell", label: "Shell exec" },
  { key: "env", label: "Env vars" },
  { key: "secrets", label: "Uses secrets" },
  { key: "external", label: "Sends data out" },
  { key: "ports", label: "Opens ports" },
  { key: "broad-fs", label: "Broad FS" },
];

const TOKEN_CATS = [
  { key: "mcp", label: "MCP servers", tokens: 21500, color: "#5b9dff" },
  { key: "skills", label: "Skills", tokens: 9800, color: "#2bd4a0" },
  { key: "memory", label: "Memory files", tokens: 14830, color: "#b79bff" },
  { key: "config", label: "Config & rules", tokens: 3400, color: "#f5b544" },
  { key: "system", label: "System prompt", tokens: 6200, color: "#646b78" },
];

const TOKEN_TREND = [38, 41, 39, 44, 47, 52, 49, 55, 58, 54, 61, 55.7];

const TOKEN_TOP = [
  { name: "TradingView MCP", type: "MCP", tokens: 15100, scope: "user", pct: 100, note: "81 tools" },
  { name: "Claude-Mem Summaries", type: "Memory", tokens: 5200, scope: "user", pct: 34 },
  { name: "Desktop Commander MCP", type: "MCP", tokens: 5200, scope: "user", pct: 34, note: "shell + broad FS" },
  { name: "GitHub MCP", type: "MCP", tokens: 5200, scope: "user", pct: 34 },
  { name: "Playwright MCP", type: "MCP", tokens: 4600, scope: "user", pct: 30 },
  { name: "Firecrawl MCP", type: "MCP", tokens: 4100, scope: "user", pct: 27 },
  { name: "CLAUDE.md (project)", type: "Memory", tokens: 3260, scope: "project", pct: 22 },
];

const CONFIG_TREE = [
  { id: "settings-user", name: "settings.json", path: "~/.claude/settings.json", type: "json", scope: "user", folder: "~/.claude" },
  { id: "settings-proj", name: "settings.json", path: ".claude/settings.json", type: "json", scope: "project", folder: ".claude" },
  { id: "mcp-json", name: ".mcp.json", path: ".mcp.json", type: "json", scope: "project", folder: "root" },
  { id: "cursorrules", name: ".cursorrules", path: ".cursorrules", type: "text", scope: "project", folder: "root" },
  { id: "hooks", name: "hooks.toml", path: ".claude/hooks.toml", type: "toml", scope: "project", folder: ".claude" },
  { id: "env", name: ".env.local", path: ".env.local", type: "env", scope: "project", folder: "root" },
];

const ACTIVITY = [
  { id: 1, who: "you", action: "enabled MCP", target: "Firecrawl", scope: "user", risk: "med", time: "4m ago", icon: "mcp" },
  { id: 2, who: "auto", action: "compressed memory", target: "CLAUDE.md (project)", scope: "project", risk: "safe", time: "18m ago", icon: "memory", note: "−1,240 tokens" },
  { id: 3, who: "you", action: "edited skill", target: "React Scaffolder", scope: "project", risk: "safe", time: "5h ago", icon: "skill" },
  { id: 4, who: "system", action: "flagged risk", target: "Desktop Commander MCP", scope: "user", risk: "crit", time: "6h ago", icon: "security" },
  { id: 5, who: "you", action: "converted 4 files", target: "MarkItDown", scope: "user", risk: "safe", time: "12m ago", icon: "tools" },
  { id: 6, who: "auto", action: "validation failed", target: "Deploy Runbook", scope: "project", risk: "high", time: "4d ago", icon: "alert" },
];

const SUGGESTIONS = [
  { id: 1, kind: "mcp", title: "Sandbox Desktop Commander", detail: "Has shell + full-filesystem access, unsandboxed.", save: null, risk: "crit", action: "Sandbox" },
  { id: 2, kind: "memory", title: "Deduplicate project CLAUDE.md", detail: "3 duplicate sections found across 318 lines.", save: "~900 tok", risk: "med", action: "Review" },
  { id: 3, kind: "skill", title: "Fix Deploy Runbook reference", detail: "Broken link to hooks/predeploy.sh fails validation.", save: null, risk: "high", action: "Open" },
  { id: 4, kind: "mcp", title: "Switch to Low Token Mode", detail: "Current profile loads 21.5k tokens at startup.", save: "17.3k tok", risk: "low", action: "Switch" },
];

const WORKSPACES = [
  { id: "acme", name: "Acme Platform", color: "#2bd4a0", initial: "A" },
  { id: "personal", name: "Personal", color: "#b79bff", initial: "P" },
  { id: "labs", name: "Acme Labs", color: "#f5b544", initial: "L" },
];

function riskClass(r) { return { safe: "risk-safe", low: "risk-low", med: "risk-med", high: "risk-high", crit: "risk-crit" }[r] || "risk-low"; }
function riskLabel(r) { return { safe: "Safe", low: "Low", med: "Medium", high: "High", crit: "Critical" }[r] || r; }
function riskColor(r) { return { safe: "var(--r-safe)", low: "var(--r-low)", med: "var(--r-med)", high: "var(--r-high)", crit: "var(--r-crit)" }[r]; }
function scopeClass(s) { return "scope-" + s; }
function fmtTok(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n); }

export { SKILLS, MCPS, MCP_PROFILES, MEMORY, TOOLS, CAP_LIST, TOKEN_CATS, TOKEN_TREND, TOKEN_TOP, CONFIG_TREE, ACTIVITY, SUGGESTIONS, WORKSPACES, riskClass, riskLabel, riskColor, scopeClass, fmtTok };

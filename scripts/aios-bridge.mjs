// aios-bridge.mjs — Vite dev-server plugin that bridges the AI Tools OS browser
// app to the real filesystem. Exposes /api/* endpoints in the same Node process
// as Vite (no separate server), so the UI can actually mutate Claude Code config.
//
// Safety model:
//   • Every write to ~/.claude.json is preceded by a timestamped backup under
//     ~/.aios/backups/ and performed atomically (temp file + rename).
//   • "Disabling" an MCP server never destroys it: the full config block is moved
//     into ~/.aios/disabled-mcp.json so it can be restored verbatim on enable.
//   • Env *values* are preserved as-is when moving blocks (we never log them).

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, readdirSync, unlinkSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = homedir();
const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAUDE_JSON = join(HOME, ".claude.json");
const AIOS_DIR = join(HOME, ".aios");
const BACKUP_DIR = join(AIOS_DIR, "backups");
const DISABLED_MCP = join(AIOS_DIR, "disabled-mcp.json");

function ensureDirs() {
  if (!existsSync(AIOS_DIR)) mkdirSync(AIOS_DIR, { recursive: true });
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
}

// Detect the indentation Claude Code uses so our rewrite matches its style.
function detectIndent(raw) {
  const m = raw.match(/^\{\n([ \t]+)"/);
  if (!m) return 2;
  return m[1].includes("\t") ? "\t" : m[1].length;
}

function readClaude() {
  const raw = readFileSync(CLAUDE_JSON, "utf8");
  return { obj: JSON.parse(raw), indent: detectIndent(raw) };
}

function backupClaude() {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(BACKUP_DIR, `claude.json.${stamp}.bak`);
  copyFileSync(CLAUDE_JSON, dest);
  // keep only the 20 most recent backups
  const baks = readdirSync(BACKUP_DIR).filter((f) => f.startsWith("claude.json.")).sort();
  for (const old of baks.slice(0, Math.max(0, baks.length - 20))) {
    try { unlinkSync(join(BACKUP_DIR, old)); } catch {}
  }
  return dest;
}

function writeClaudeAtomic(obj, indent) {
  backupClaude();
  const tmp = CLAUDE_JSON + ".aios.tmp";
  writeFileSync(tmp, JSON.stringify(obj, null, indent) + "\n");
  renameSync(tmp, CLAUDE_JSON);
}

function readDisabled() {
  ensureDirs();
  if (!existsSync(DISABLED_MCP)) return {};
  try { return JSON.parse(readFileSync(DISABLED_MCP, "utf8")); } catch { return {}; }
}

function writeDisabled(store) {
  ensureDirs();
  const tmp = DISABLED_MCP + ".tmp";
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n");
  renameSync(tmp, DISABLED_MCP);
}

// Build the state the UI needs: which servers are live vs. parked.
function mcpState() {
  const { obj } = readClaude();
  const enabled = Object.keys(obj.mcpServers || {});
  const disabled = Object.keys(readDisabled());
  return { enabled, disabled };
}

function disableMcp(id) {
  const { obj, indent } = readClaude();
  const servers = obj.mcpServers || {};
  if (!servers[id]) {
    // already disabled (or unknown) — make the call idempotent
    const store = readDisabled();
    if (store[id]) return { ok: true, already: true, ...mcpState() };
    throw new Error(`MCP server "${id}" not found in ~/.claude.json`);
  }
  const store = readDisabled();
  store[id] = servers[id];          // park the full config block
  delete servers[id];
  obj.mcpServers = servers;
  writeDisabled(store);
  writeClaudeAtomic(obj, indent);
  return { ok: true, ...mcpState() };
}

// Apply a profile: make the live mcpServers set exactly the wanted ids by
// parking everything not wanted and restoring any wanted server that's parked.
function applyProfile(wantIds) {
  const want = new Set(wantIds);
  const { obj, indent } = readClaude();
  const servers = obj.mcpServers || {};
  const store = readDisabled();
  for (const id of Object.keys(servers)) {
    if (!want.has(id)) { store[id] = servers[id]; delete servers[id]; }
  }
  for (const id of wantIds) {
    if (!servers[id] && store[id]) { servers[id] = store[id]; delete store[id]; }
  }
  obj.mcpServers = servers;
  writeDisabled(store);
  writeClaudeAtomic(obj, indent);
  return { ok: true, ...mcpState() };
}

function enableMcp(id) {
  const store = readDisabled();
  if (!store[id]) {
    // nothing parked — maybe it's already live
    const { obj } = readClaude();
    if ((obj.mcpServers || {})[id]) return { ok: true, already: true, ...mcpState() };
    throw new Error(`MCP server "${id}" not found in disabled store`);
  }
  const { obj, indent } = readClaude();
  obj.mcpServers = obj.mcpServers || {};
  obj.mcpServers[id] = store[id];   // restore verbatim
  delete store[id];
  writeDisabled(store);
  writeClaudeAtomic(obj, indent);
  return { ok: true, ...mcpState() };
}

// --- file-based resources (subagents, slash commands) ----------------------
// These live as .md files under ~/.claude/<kind>/. "Disabling" parks the file
// under ~/.aios/disabled-<kind>/ so a new Claude session won't load it; enabling
// moves it back. Same reversible model as MCP servers.
const RESOURCES = {
  agents:   { dir: join(HOME, ".claude", "agents"),   park: join(AIOS_DIR, "disabled-agents") },
  commands: { dir: join(HOME, ".claude", "commands"), park: join(AIOS_DIR, "disabled-commands") },
};

// Minimal YAML-frontmatter reader (handles `key: val`, block scalars `key: |`,
// and simple `- item` lists). Avoids a yaml dependency.
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const lines = m[1].split("\n");
  const fm = {};
  let i = 0;
  while (i < lines.length) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1]; const val = kv[2];
    if (val === "|" || val === ">") {
      const buf = []; i++;
      while (i < lines.length && (/^\s/.test(lines[i]) || lines[i] === "")) { buf.push(lines[i].replace(/^\s{1,4}/, "")); i++; }
      fm[key] = buf.join(" ").replace(/\s+/g, " ").trim();
      continue;
    }
    if (val === "") {
      const list = []; let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) { list.push(lines[j].replace(/^\s*-\s+/, "").trim()); j++; }
      if (list.length) { fm[key] = list; i = j; continue; }
    }
    fm[key] = val.replace(/^["']|["']$/g, "");
    i++;
  }
  return { fm, body: m[2] };
}

function readResourceDir(dir, enabled) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).map((file) => {
    const { fm, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
    const desc = Array.isArray(fm.description) ? fm.description.join(" ") : (fm.description || "");
    const tools = Array.isArray(fm.tools) ? fm.tools : (fm.tools ? [fm.tools] : []);
    return {
      file, name: fm.name || file.replace(/\.md$/, ""), description: desc.slice(0, 400),
      model: fm.model || "inherit", tools, enabled, prompt: body.trim().slice(0, 4000),
    };
  });
}

function listResource(kind) {
  const { dir, park } = RESOURCES[kind];
  return { enabled: readResourceDir(dir, true), disabled: readResourceDir(park, false) };
}

function moveResource(kind, file, toPark) {
  const { dir, park } = RESOURCES[kind];
  if (!file || !file.endsWith(".md") || file.includes("/")) throw new Error("bad file name");
  if (!existsSync(park)) mkdirSync(park, { recursive: true });
  const from = join(toPark ? dir : park, file);
  const to = join(toPark ? park : dir, file);
  if (!existsSync(from)) throw new Error(`${kind} file "${file}" not found`);
  renameSync(from, to);
  return listResource(kind);
}

// --- skills (each is a DIRECTORY ~/.claude/skills/<name>/SKILL.md) ----------
const SKILLS_DIR = join(HOME, ".claude", "skills");
const SKILLS_PARK = join(AIOS_DIR, "disabled-skills");

function readSkillsDir(base, enabled) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const skillMd = join(base, d.name, "SKILL.md");
    let name = d.name, description = "", body = "";
    if (existsSync(skillMd)) {
      const { fm, body: b } = parseFrontmatter(readFileSync(skillMd, "utf8"));
      name = fm.name || d.name;
      description = (Array.isArray(fm.description) ? fm.description.join(" ") : (fm.description || "")).slice(0, 400);
      body = b.trim().slice(0, 2000);
    }
    return { dir: d.name, name, description, body, enabled };
  }).filter(Boolean);
}

function listSkills() {
  return { enabled: readSkillsDir(SKILLS_DIR, true), disabled: readSkillsDir(SKILLS_PARK, false) };
}

function moveSkill(dir, toPark) {
  if (!dir || dir.includes("/") || dir.includes("..")) throw new Error("bad skill dir");
  if (!existsSync(SKILLS_PARK)) mkdirSync(SKILLS_PARK, { recursive: true });
  const from = join(toPark ? SKILLS_DIR : SKILLS_PARK, dir);
  const to = join(toPark ? SKILLS_PARK : SKILLS_DIR, dir);
  if (!existsSync(from)) throw new Error(`skill "${dir}" not found`);
  renameSync(from, to);
  return listSkills();
}

// --- arbitrary config/memory files (Memory editor, Config editor) -----------
// Only paths under ~/.claude, the project, or ~/.aios are allowed, and only
// text-ish extensions. JSON is parse-checked before writing; every existing
// file is backed up to ~/.aios/backups/ first.
const FILE_ROOTS = [join(HOME, ".claude"), PROJECT, AIOS_DIR];
const ALLOWED_EXT = [".md", ".json", ".txt", ".toml", ".env", ".sh", ".local"];

function resolveSafe(p) {
  if (!p || typeof p !== "string") throw new Error("missing path");
  let abs;
  if (p.startsWith("~/")) abs = join(HOME, p.slice(2));
  else if (p.startsWith("/")) abs = p;
  else abs = join(PROJECT, p); // relative paths are project-relative
  abs = resolve(abs);
  if (!FILE_ROOTS.some((r) => abs === r || abs.startsWith(r + "/"))) throw new Error("path not allowed: " + p);
  if (!ALLOWED_EXT.some((e) => abs.endsWith(e))) throw new Error("file type not allowed: " + p);
  return abs;
}

function backupFile(abs) {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const flat = abs.replace(/[/\\]/g, "_").replace(/^_+/, "");
  copyFileSync(abs, join(BACKUP_DIR, `${flat}.${stamp}.bak`));
}

function readFileSafe(p) {
  const abs = resolveSafe(p);
  if (!existsSync(abs)) return { ok: true, exists: false, content: "", path: abs };
  return { ok: true, exists: true, content: readFileSync(abs, "utf8"), path: abs };
}

function writeFileSafe(p, content) {
  const abs = resolveSafe(p);
  if (typeof content !== "string") throw new Error("content must be a string");
  if (abs.endsWith(".json")) {
    try { JSON.parse(content); } catch (e) { throw new Error("refusing to write invalid JSON: " + e.message); }
  }
  if (existsSync(abs)) backupFile(abs);
  else mkdirSync(dirname(abs), { recursive: true });
  const tmp = abs + ".aios.tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, abs);
  if (abs.endsWith(".sh")) chmodSync(abs, 0o755); // statusline scripts must be executable
  return { ok: true, path: abs, bytes: Buffer.byteLength(content) };
}

// --- tiny HTTP helpers -------------------------------------------------------
function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

// --- Vite plugin -------------------------------------------------------------
export function aiosBridge() {
  return {
    name: "aios-bridge",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const fullUrl = req.url || "";
        const url = fullUrl.split("?")[0];
        if (!url.startsWith("/api/")) return next();
        try {
          if (url === "/api/file" && req.method === "GET") {
            const qs = new URLSearchParams(fullUrl.split("?")[1] || "");
            return sendJson(res, 200, readFileSafe(qs.get("path")));
          }
          if (url === "/api/file" && req.method === "POST") {
            const { path, content } = await readBody(req);
            return sendJson(res, 200, writeFileSafe(path, content));
          }
          if (url === "/api/health" && req.method === "GET") {
            return sendJson(res, 200, { ok: true, claudeJson: CLAUDE_JSON, exists: existsSync(CLAUDE_JSON) });
          }
          if (url === "/api/mcp" && req.method === "GET") {
            return sendJson(res, 200, { ok: true, ...mcpState() });
          }
          if (url === "/api/mcp/disable" && req.method === "POST") {
            const { id } = await readBody(req);
            if (!id) return sendJson(res, 400, { ok: false, error: "missing id" });
            return sendJson(res, 200, disableMcp(id));
          }
          if (url === "/api/mcp/enable" && req.method === "POST") {
            const { id } = await readBody(req);
            if (!id) return sendJson(res, 400, { ok: false, error: "missing id" });
            return sendJson(res, 200, enableMcp(id));
          }
          if (url === "/api/mcp/profile" && req.method === "POST") {
            const { mcps } = await readBody(req);
            if (!Array.isArray(mcps)) return sendJson(res, 400, { ok: false, error: "missing mcps[]" });
            return sendJson(res, 200, applyProfile(mcps));
          }
          // skills (directory-based): /api/skills (+ /disable, /enable with {dir})
          const sm = url.match(/^\/api\/skills(?:\/(disable|enable))?$/);
          if (sm) {
            const action = sm[1];
            if (!action && req.method === "GET") return sendJson(res, 200, { ok: true, ...listSkills() });
            if (action && req.method === "POST") {
              const { dir } = await readBody(req);
              if (!dir) return sendJson(res, 400, { ok: false, error: "missing dir" });
              return sendJson(res, 200, { ok: true, ...moveSkill(dir, action === "disable") });
            }
          }
          // file-based resources: /api/agents, /api/commands (+ /disable, /enable)
          const rm = url.match(/^\/api\/(agents|commands)(?:\/(disable|enable))?$/);
          if (rm) {
            const kind = rm[1], action = rm[2];
            if (!action && req.method === "GET") return sendJson(res, 200, { ok: true, ...listResource(kind) });
            if (action && req.method === "POST") {
              const { file } = await readBody(req);
              if (!file) return sendJson(res, 400, { ok: false, error: "missing file" });
              return sendJson(res, 200, { ok: true, ...moveResource(kind, file, action === "disable") });
            }
          }
          return sendJson(res, 404, { ok: false, error: "unknown endpoint", url });
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err && err.message || err) });
        }
      });
    },
  };
}

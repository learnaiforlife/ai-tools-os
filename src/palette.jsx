import React from "react";
import { Icon } from "./icons.jsx";
import { NAV, VIEW_TITLES } from "./shell.jsx";
import { MCP_PROFILES, fmtTok, SKILLS, MCPS } from "./data.jsx";
import { COMMANDS, SUBAGENTS, PROMPTS } from "./data2.jsx";

/* palette.jsx — global command palette (Cmd+K) + generic inspector drawer */
const { useState: pS, useEffect: pE, useRef: pR, useMemo: pM } = React;

function CommandPalette({ open, onClose, nav, toast, setProfile }) {
  const [q, setQ] = pS("");
  const [active, setActive] = pS(0);
  const inputRef = pR();

  pE(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);

  const commands = pM(() => {
    const C = [];
    // navigation
    Object.entries(VIEW_TITLES).forEach(([id, label]) =>
      C.push({ group: "Go to", icon: NAV.flatMap(g => g.items).find(i => i.id === id)?.icon || "arrowR", label: "Open " + label, hint: "Navigate", run: () => nav(id) }));
    // actions
    C.push({ group: "MCP", icon: "play", label: "Enable MCP server…", hint: "Action", run: () => { nav("mcp"); toast("Pick an MCP to enable", "info"); } });
    C.push({ group: "MCP", icon: "stop", label: "Disable MCP server…", hint: "Action", run: () => { nav("mcp"); toast("Pick an MCP to disable", "info"); } });
    MCP_PROFILES.forEach(p => C.push({ group: "MCP", icon: p.icon, label: "Switch profile: " + p.name, hint: fmtTok(p.tokens) + " tok", run: () => { setProfile(p.id); toast("Switched to " + p.name + " profile", "success"); } }));
    C.push({ group: "Skills", icon: "skill", label: "Open skill…", hint: "Action", run: () => nav("skills") });
    C.push({ group: "Skills", icon: "flask", label: "Run skill validation", hint: "Action", run: () => { nav("skills"); toast("Validating all skills…", "info"); } });
    C.push({ group: "Skills", icon: "flask", label: "Open Skill Playground", hint: "Action", run: () => { nav("skills"); toast("Opening testing playground", "info"); } });
    C.push({ group: "Tools", icon: "file", label: "Convert file to Markdown", hint: "MarkItDown", run: () => { nav("tools"); toast("Opening MarkItDown", "info"); } });
    C.push({ group: "Memory", icon: "compress", label: "Compress memory file…", hint: "Action", run: () => { nav("memory"); toast("Pick a memory file to compress", "info"); } });
    C.push({ group: "Memory", icon: "merge", label: "Deduplicate memory", hint: "Action", run: () => { nav("memory"); toast("Scanning for duplicate sections…", "info"); } });
    C.push({ group: "Security", icon: "shield", label: "Open Security Review", hint: "Action", run: () => nav("security") });
    C.push({ group: "Security", icon: "lock", label: "Disable all risky resources", hint: "Action", run: () => { nav("security"); toast("2 critical resources disabled", "success"); } });
    C.push({ group: "Tokens", icon: "compress", label: "Enable Low Token Mode", hint: "−17.3k tok", run: () => { setProfile("lowtoken"); toast("Low Token Mode enabled", "success"); } });
    C.push({ group: "Config", icon: "config", label: "Open config file…", hint: "Action", run: () => nav("config") });
    C.push({ group: "Commands", icon: "slash", label: "Run a slash command…", hint: "Action", run: () => nav("commands") });
    C.push({ group: "Subagents", icon: "bot", label: "New subagent", hint: "Action", run: () => { nav("subagents"); toast("Define a role and tools", "info"); } });
    C.push({ group: "Library", icon: "bookmark", label: "Browse prompt library", hint: "Action", run: () => nav("prompts") });
    C.push({ group: "Learn", icon: "grad", label: "Open tutorials", hint: "Action", run: () => nav("tutorial") });
    C.push({ group: "Learn", icon: "award", label: "Audit best practices", hint: "Action", run: () => { nav("practices"); toast("Auditing workspace…", "info"); } });
    // resources
    SKILLS.forEach(s => C.push({ group: "Resources", icon: "skill", label: s.name, hint: "Skill · " + s.scope, run: () => { nav("skills"); toast("Opening " + s.name, "info"); } }));
    MCPS.forEach(m => C.push({ group: "Resources", icon: "mcp", label: m.name, hint: "MCP · " + m.scope, run: () => { nav("mcp"); toast("Opening " + m.name, "info"); } }));
    COMMANDS.forEach(c => C.push({ group: "Resources", icon: "slash", label: c.name + " — " + c.title, hint: "Command", run: () => { nav("commands"); toast("Opening " + c.name, "info"); } }));
    SUBAGENTS.forEach(s => C.push({ group: "Resources", icon: "bot", label: s.name, hint: "Subagent", run: () => { nav("subagents"); toast("Opening " + s.name, "info"); } }));
    PROMPTS.forEach(p => C.push({ group: "Resources", icon: "bookmark", label: p.title, hint: "Prompt · " + p.category, run: () => { nav("prompts"); toast("Opening “" + p.title + "”", "info"); } }));
    return C;
  }, [nav, toast, setProfile]);

  const filtered = pM(() => {
    if (!q.trim()) return commands.slice(0, 8);
    const ql = q.toLowerCase();
    return commands.filter(c => (c.label + " " + c.group).toLowerCase().includes(ql)).slice(0, 40);
  }, [q, commands]);

  pE(() => { setActive(0); }, [q]);

  if (!open) return null;

  const groups = [];
  filtered.forEach(c => { let g = groups.find(x => x.name === c.group); if (!g) { g = { name: c.group, items: [] }; groups.push(g); } g.items.push(c); });
  let idx = -1;

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = filtered[active]; if (c) { c.run(); onClose(); } }
    else if (e.key === "Escape") onClose();
  };

  return (
    <div className="cmdk-wrap" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={19} style={{ color: "var(--tx-lo)" }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search resources or type a command…" />
          <span className="kbd">esc</span>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="empty" style={{ padding: 36 }}><div className="faint">No matches for “{q}”</div></div>}
          {groups.map((g) => (
            <div key={g.name}>
              <div className="cmdk-group-label">{g.name}</div>
              {g.items.map((c) => { idx++; const myIdx = idx; return (
                <div key={c.label} className="cmdk-item" data-active={active === myIdx}
                  onMouseEnter={() => setActive(myIdx)} onClick={() => { c.run(); onClose(); }}>
                  <span className="ci-icon"><Icon name={c.icon} size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                  <span className="ci-hint">{c.hint}</span>
                </div>
              ); })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span className="row" style={{ gap: 5 }}><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="row" style={{ gap: 5 }}><span className="kbd">↵</span> run</span>
          <span className="row" style={{ gap: 5 }}><span className="kbd">esc</span> close</span>
          <span style={{ marginLeft: "auto" }} className="faint">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}

// Generic right-side inspector drawer
function Drawer({ open, onClose, children, width }) {
  pE(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" style={width ? { width } : null}>{children}</div>
    </>
  );
}

export { CommandPalette, Drawer };

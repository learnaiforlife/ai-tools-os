import React from "react";
import { Icon } from "./icons.jsx";
import { WORKSPACES, fmtTok } from "./data.jsx";
import { Meter } from "./ui.jsx";

/* shell.jsx — app shell: sidebar, topbar, status bar, toasts */
const { useState: uS, useEffect: uE, useRef: uR } = React;

const NAV = [
  { group: "Overview", items: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "tokens", label: "Token Usage", icon: "tokens" },
    { id: "security", label: "Security", icon: "security", badge: "2", tone: "crit" },
  ]},
  { group: "Resources", items: [
    { id: "skills", label: "Skills", icon: "skill", badge: "10" },
    { id: "mcp", label: "MCP Servers", icon: "mcp", badge: "9" },
    { id: "memory", label: "Memory", icon: "memory", badge: "6" },
    { id: "commands", label: "Commands", icon: "slash", badge: "8" },
    { id: "subagents", label: "Subagents", icon: "bot", badge: "6" },
    { id: "config", label: "Config Files", icon: "config" },
  ]},
  { group: "Learn", items: [
    { id: "prompts", label: "Prompt Library", icon: "bookmark" },
    { id: "practices", label: "Best Practices", icon: "award" },
    { id: "tutorial", label: "Tutorial", icon: "grad" },
  ]},
  { group: "Extend", items: [
    { id: "tools", label: "External Tools", icon: "tools", badge: "6" },
    { id: "settings", label: "Settings", icon: "settings" },
  ]},
];

const SCOPES = [
  { id: "user", label: "User", color: "var(--sc-user)" },
  { id: "project", label: "Project", color: "var(--sc-project)" },
  { id: "workspace", label: "Workspace", color: "var(--sc-workspace)" },
];

function Sidebar({ view, setView, scope, setScope, toast, onOnboarding }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Icon name="layers" size={16} sw={2} /></div>
        <div className="col" style={{ gap: 1 }}>
          <span className="brand-name">AI Tools OS</span>
          <span className="brand-sub">Command Center</span>
        </div>
      </div>

      <div className="scope-switch" title="Resource scope">
        {SCOPES.map((s) => (
          <button key={s.id} data-on={scope === s.id} onClick={() => setScope(s.id)}>
            <span className="sc-dot" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <nav className="nav">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-group-label">{g.group}</div>
            {g.items.map((it) => (
              <button key={it.id} className="nav-item" data-on={view === it.id} onClick={() => setView(it.id)}>
                <span className="ni-icon"><Icon name={it.icon} size={17} /></span>
                <span>{it.label}</span>
                {it.badge && <span className="ni-badge" data-tone={it.tone || ""}>{it.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button className="nav-item" onClick={onOnboarding}>
          <span className="ni-icon"><Icon name="sparkles" size={16} /></span>
          <span>Onboarding</span>
        </button>
        <div className="row" style={{ gap: 9, padding: "8px 9px 2px" }}>
          <div className="ws-avatar" style={{ background: "var(--ac-dim)", color: "var(--ac)", width: 26, height: 26 }}>JD</div>
          <div className="col" style={{ gap: 0, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Jordan Diaz</span>
            <span style={{ fontSize: 10.5, color: "var(--tx-lo)" }}>Local · Pro plan</span>
          </div>
          <button className="icon-btn" style={{ marginLeft: "auto", width: 26, height: 26 }} onClick={() => setView("settings")}><Icon name="settings" size={15} /></button>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceMenu({ ws, setWs }) {
  const [open, setOpen] = uS(false);
  const ref = uR();
  uE(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="ws-switch" onClick={() => setOpen(!open)}>
        <div className="ws-avatar" style={{ background: ws.color + "22", color: ws.color }}>{ws.initial}</div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{ws.name}</span>
        <Icon name="chevD" size={14} style={{ color: "var(--tx-lo)" }} />
      </button>
      {open && (
        <div className="menu-pop" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, width: 244, padding: 6 }}>
          <div className="cmdk-group-label">Workspaces</div>
          {WORKSPACES.map((w) => (
            <button key={w.id} className="cmdk-item" data-active={w.id === ws.id} onClick={() => { setWs(w); setOpen(false); }}>
              <div className="ws-avatar" style={{ background: w.color + "22", color: w.color }}>{w.initial}</div>
              <span>{w.name}</span>
              {w.id === ws.id && <Icon name="check" size={15} style={{ marginLeft: "auto", color: "var(--ac)" }} />}
            </button>
          ))}
          <div className="divider" style={{ margin: "6px 0" }} />
          <button className="cmdk-item"><span className="ci-icon"><Icon name="plus" size={15} /></span>New workspace</button>
        </div>
      )}
    </div>
  );
}

const VIEW_TITLES = {
  dashboard: "Dashboard", tokens: "Token Usage", security: "Security Review", skills: "Skills",
  mcp: "MCP Servers", memory: "Memory", config: "Config Files", tools: "External Tools", settings: "Settings",
  commands: "Commands", subagents: "Subagents", prompts: "Prompt Library", practices: "Best Practices", tutorial: "Tutorial",
};

function Topbar({ view, ws, setWs, scope, openPalette, toast, theme, setTheme }) {
  return (
    <header className="topbar">
      <WorkspaceMenu ws={ws} setWs={setWs} />
      <div className="crumbs">
        <span className="sep"><Icon name="chevR" size={13} /></span>
        <span style={{ textTransform: "capitalize" }}>{SCOPES.find((s) => s.id === scope).label}</span>
        <span className="sep"><Icon name="chevR" size={13} /></span>
        <span className="cur">{VIEW_TITLES[view] || "Dashboard"}</span>
      </div>

      <div className="searchbar" onClick={openPalette}>
        <Icon name="search" size={15} />
        <span style={{ fontSize: 13 }}>Search resources & actions…</span>
        <span className="kbd">⌘K</span>
      </div>

      <button className="icon-btn" onClick={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); toast(next === "light" ? "Light theme" : "Dark theme", "info"); }} title={theme === "dark" ? "Switch to light" : "Switch to dark"}><Icon name={theme === "dark" ? "sun" : "moon"} size={17} /></button>
      <button className="icon-btn" onClick={() => toast("Syncing local resources…", "info")} title="Sync"><Icon name="refresh" size={17} /></button>
      <button className="icon-btn" onClick={() => toast("3 unread alerts", "warn")} title="Alerts" style={{ position: "relative" }}>
        <Icon name="bell" size={17} />
        <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 9, background: "var(--r-crit)" }} />
      </button>
      <div style={{ width: 1, height: 22, background: "var(--line)" }} />
      <button className="btn btn-primary btn-sm" onClick={() => toast("Quick create — pick a resource type", "info")}><Icon name="plus" size={15} />New</button>
    </header>
  );
}

function StatusBar({ scope, profileName, profileTokens, mcpActive }) {
  const budget = 32000;
  const pct = Math.round((profileTokens / budget) * 100);
  return (
    <footer className="statusbar">
      <span className="row" style={{ gap: 6 }}><span className="status-dot sd-on" /> Local engine ready</span>
      <span className="row" style={{ gap: 6 }}><Icon name="scope" size={13} /> Scope: <b style={{ color: "var(--tx-hi)", textTransform: "capitalize" }}>{scope}</b></span>
      <span className="row" style={{ gap: 6 }}><Icon name="mcp" size={13} /> {mcpActive} MCP active</span>
      <span className="row" style={{ gap: 6 }}><Icon name="cube" size={13} /> Profile: <b style={{ color: "var(--tx-hi)" }}>{profileName}</b></span>
      <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
        <span>Startup tokens</span>
        <div style={{ width: 90 }}><Meter value={pct} height={5} /></div>
        <b className="mono tnum" style={{ color: pct > 70 ? "var(--r-med)" : "var(--ac)" }}>{fmtTok(profileTokens)}</b>
        <span className="faint">/ {fmtTok(budget)}</span>
      </div>
      <span className="row" style={{ gap: 6 }}><Icon name="history" size={13} /> Synced 4m ago</span>
    </footer>
  );
}

function ToastHost({ toasts, dismiss }) {
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const cfg = {
          success: { ic: "check", c: "var(--ac)", bg: "var(--ac-dim)" },
          info: { ic: "info", c: "var(--r-low)", bg: "var(--r-low-bg)" },
          warn: { ic: "warn", c: "var(--r-med)", bg: "var(--r-med-bg)" },
          error: { ic: "alert", c: "var(--r-crit)", bg: "var(--r-crit-bg)" },
        }[t.kind] || { ic: "info", c: "var(--ac)", bg: "var(--ac-dim)" };
        return (
          <div className="toast" key={t.id}>
            <span className="t-ic" style={{ background: cfg.bg, color: cfg.c }}><Icon name={cfg.ic} size={15} /></span>
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{t.msg}</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => dismiss(t.id)}><Icon name="x" size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}

export { Sidebar, Topbar, StatusBar, ToastHost, WorkspaceMenu, NAV, SCOPES, VIEW_TITLES };

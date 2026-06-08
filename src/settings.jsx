import React from "react";
import { Icon } from "./icons.jsx";
import { Toggle } from "./ui.jsx";
import { ACCENTS } from "./theme.js";

/* settings.jsx */
const { useState: stS } = React;

function Settings({ toast, t, setTweak, theme, setTheme }) {
  const [section, setSection] = stS("general");
  const SECTIONS = [["general", "General", "sliders"], ["appearance", "Appearance", "eye"], ["scopes", "Scopes & paths", "scope"], ["safety", "Safety", "shield"], ["account", "Account", "user"]];

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head"><div><h1>Settings</h1><div className="ph-sub">Configure AI Tools OS behavior</div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24 }}>
        <div className="col" style={{ gap: 2, position: "sticky", top: 0, alignSelf: "start" }}>
          {SECTIONS.map(([id, l, ic]) => (
            <button key={id} className="nav-item" data-on={section === id} onClick={() => setSection(id)}>
              <span className="ni-icon"><Icon name={ic} size={16} /></span><span>{l}</span>
            </button>
          ))}
        </div>

        <div className="col" style={{ gap: 14 }}>
          {section === "general" && <>
            <SetCard title="Startup behavior">
              <SetRow label="Auto-start MCP servers on boot" hint="Launch enabled servers when Claude Code opens"><Toggle on={true} onChange={() => {}} /></SetRow>
              <SetRow label="Low Token Mode by default" hint="Load minimal context at startup"><Toggle on={false} onChange={() => {}} /></SetRow>
              <SetRow label="Health scan on launch" hint="Validate all resources at startup"><Toggle on={true} onChange={() => {}} /></SetRow>
            </SetCard>
            <SetCard title="Command palette">
              <SetRow label="Shortcut" hint="Open the global command palette"><span className="kbd">⌘K</span></SetRow>
              <SetRow label="Fuzzy matching" hint="Match commands loosely"><Toggle on={true} onChange={() => {}} /></SetRow>
            </SetCard>
          </>}

          {section === "appearance" && <>
            <SetCard title="Theme">
              <SetRow label="Appearance" hint="Switch between light and dark">
                <div className="seg"><button data-on={theme === "dark"} onClick={() => setTheme("dark")}><Icon name="moon" size={14} />Dark</button><button data-on={theme === "light"} onClick={() => setTheme("light")}><Icon name="sun" size={14} />Light</button></div>
              </SetRow>
              <SetRow label="Accent color">
                <div className="row" style={{ gap: 7 }}>
                  {Object.keys(ACCENTS).map(c => <button key={c} onClick={() => setTweak("accent", c)} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: t.accent === c ? "2px solid var(--tx-hi)" : "2px solid transparent", cursor: "pointer", boxShadow: t.accent === c ? "0 0 0 2px var(--bg-0), 0 0 0 4px " + c : "none" }} />)}
                </div>
              </SetRow>
              <SetRow label="UI font">
                <select className="field-input" style={{ appearance: "auto", color: "var(--tx-hi)", width: 200 }} value={t.font} onChange={e => setTweak("font", e.target.value)}>
                  {["Hanken Grotesk", "Public Sans", "IBM Plex Sans", "Albert Sans", "Space Grotesk"].map(f => <option key={f}>{f}</option>)}
                </select>
              </SetRow>
              <SetRow label="Density">
                <div className="seg">{["compact", "regular", "comfy"].map(d => <button key={d} data-on={t.density === d} onClick={() => setTweak("density", d)} style={{ textTransform: "capitalize" }}>{d}</button>)}</div>
              </SetRow>
              <SetRow label="Surfaces" hint="Glass adds translucency & blur">
                <div className="seg">{["solid", "glass"].map(s => <button key={s} data-on={t.surface === s} onClick={() => setTweak("surface", s)} style={{ textTransform: "capitalize" }}>{s}</button>)}</div>
              </SetRow>
            </SetCard>
            <div className="card card-pad row" style={{ gap: 10, fontSize: 12.5 }}><Icon name="info" size={15} style={{ color: "var(--r-low)" }} /><span className="muted">These also live in the floating <b>Tweaks</b> panel — toggle it from the toolbar to experiment live.</span></div>
          </>}

          {section === "scopes" && <SetCard title="Resource paths">
            {[["User", "~/.claude", "sc-user"], ["Project", ".claude", "sc-project"], ["Workspace", "@workspace", "sc-workspace"]].map(([l, p]) => (
              <SetRow key={l} label={l + " scope"} hint="Where resources are read from">
                <span className="mono" style={{ fontSize: 12, color: "var(--tx-mid)" }}>{p}</span>
              </SetRow>
            ))}
            <SetRow label="Sync interval" hint="How often to re-scan the filesystem">
              <select className="field-input" style={{ appearance: "auto", color: "var(--tx-hi)", width: 140 }}><option>Every 5 min</option><option>Every 1 min</option><option>Manual</option></select>
            </SetRow>
          </SetCard>}

          {section === "safety" && <SetCard title="Safety & sandboxing">
            <SetRow label="Require approval for shell commands" hint="Prompt before any tool runs a shell command"><Toggle on={true} onChange={() => {}} /></SetRow>
            <SetRow label="Block unverified publishers" hint="Refuse to load unsigned MCP servers"><Toggle on={true} onChange={() => {}} /></SetRow>
            <SetRow label="Sandbox networked tools" hint="Run network tools in a container"><Toggle on={false} onChange={() => {}} /></SetRow>
            <SetRow label="Warn above token budget" hint="Alert when startup exceeds threshold"><Toggle on={true} onChange={() => {}} /></SetRow>
          </SetCard>}

          {section === "account" && <SetCard title="Account">
            <div className="row" style={{ gap: 13, padding: "4px 0 14px" }}>
              <div className="ws-avatar" style={{ width: 48, height: 48, borderRadius: 12, background: "var(--ac-dim)", color: "var(--ac)", fontSize: 18 }}>JD</div>
              <div className="col" style={{ gap: 1 }}><b style={{ fontSize: 15 }}>Jordan Diaz</b><span className="faint" style={{ fontSize: 12 }}>jordan@acme.dev · Pro plan</span></div>
              <button className="btn btn-sm" style={{ marginLeft: "auto" }}>Manage</button>
            </div>
            <SetRow label="Local-only mode" hint="Never send resource data off this machine"><Toggle on={true} onChange={() => {}} /></SetRow>
            <SetRow label="Telemetry" hint="Share anonymous usage to improve the product"><Toggle on={false} onChange={() => {}} /></SetRow>
          </SetCard>}
        </div>
      </div>
    </div>
  );
}

function SetCard({ title, children }) {
  return <div className="card"><div className="card-hd"><h3>{title}</h3></div><div className="col" style={{ padding: "4px 16px" }}>{children}</div></div>;
}
function SetRow({ label, hint, children }) {
  return <div className="row" style={{ justifyContent: "space-between", gap: 16, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
    <div className="col" style={{ gap: 2 }}><span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>{hint && <span className="faint" style={{ fontSize: 11.5 }}>{hint}</span>}</div>
    <div style={{ flex: "none" }}>{children}</div>
  </div>;
}

export { Settings };

import React from "react";
import { Icon } from "./icons.jsx";
import { Toggle, Code } from "./ui.jsx";

/* statusline.jsx — visual Claude Code statusline configurator */
const { useState: slS } = React;

// available segment catalog
const SL_CATALOG = [
  { id: "model", label: "Model", icon: "cpu", sample: "Sonnet 4.6", color: "#b79bff", desc: "Active model name" },
  { id: "dir", label: "Directory", icon: "folder", sample: "~/acme/platform", color: "#5b9dff", desc: "Current working directory" },
  { id: "git", label: "Git branch", icon: "gitbranch", sample: "main", color: "#2bd4a0", desc: "Branch + dirty/clean state" },
  { id: "tokens", label: "Token usage", icon: "tokens", sample: "22k/64k", color: "#f5b544", desc: "Context tokens used / budget" },
  { id: "context", label: "Context %", icon: "tokens", sample: "34%", color: "#ff8a4c", desc: "Percent of context window used" },
  { id: "cost", label: "Session cost", icon: "dollar", sample: "$0.12", color: "#2bd4a0", desc: "Estimated $ spent this session" },
  { id: "time", label: "Clock", icon: "clock", sample: "14:22", color: "#99a0ad", desc: "Current time" },
  { id: "lines", label: "Lines changed", icon: "edit", sample: "+128 -34", color: "#5b9dff", desc: "Added / removed this session" },
  { id: "custom", label: "Custom text", icon: "edit", sample: "acme", color: "#99a0ad", desc: "Any static label or emoji" },
];

const SL_SEPARATORS = [
  { id: "powerline", label: "Powerline", glyph: "" , render: "arrow" },
  { id: "slash", label: "Slash", glyph: "/", render: "plain" },
  { id: "pipe", label: "Pipe", glyph: "│", render: "plain" },
  { id: "dot", label: "Dot", glyph: "•", render: "plain" },
  { id: "space", label: "Spaced", glyph: "", render: "plain" },
];

const SL_THEMES = {
  vivid: { name: "Vivid", useColor: true, dim: false },
  mono: { name: "Mono", useColor: false, dim: false },
  subtle: { name: "Subtle", useColor: true, dim: true },
};

function Statusline({ onBack, toast }) {
  const [segs, setSegs] = slS([
    { ...SL_CATALOG[0], on: true },
    { ...SL_CATALOG[1], on: true },
    { ...SL_CATALOG[2], on: true },
    { ...SL_CATALOG[3], on: true },
    { ...SL_CATALOG[5], on: true },
  ]);
  const [sep, setSep] = slS("powerline");
  const [theme, setTheme] = slS("vivid");
  const [showIcons, setShowIcons] = slS(true);
  const [installed, setInstalled] = slS(false);
  const [drag, setDrag] = slS(null);

  const sepObj = SL_SEPARATORS.find(s => s.id === sep);
  const themeObj = SL_THEMES[theme];
  const active = segs.filter(s => s.on);
  const notAdded = SL_CATALOG.filter(c => !segs.find(s => s.id === c.id));

  const move = (from, to) => {
    if (to < 0 || to >= segs.length) return;
    setSegs(s => { const a = [...s]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
  };
  const toggle = (id) => setSegs(s => s.map(x => x.id === id ? { ...x, on: !x.on } : x));
  const remove = (id) => setSegs(s => s.filter(x => x.id !== id));
  const add = (cat) => { setSegs(s => [...s, { ...cat, on: true }]); toast(cat.label + " added", "success"); };

  // Real install: write ~/.claude/statusline.sh and merge the statusLine block
  // into the existing ~/.claude/settings.json (preserving all other settings).
  const install = async () => {
    try {
      const script = genScript(active, sepObj, themeObj, showIcons);
      let r = await fetch("/api/file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "~/.claude/statusline.sh", content: script }) });
      let j = await r.json(); if (!j.ok) throw new Error(j.error || "could not write statusline.sh");
      const sg = await (await fetch("/api/file?path=" + encodeURIComponent("~/.claude/settings.json"))).json();
      let settings = {};
      if (sg.ok && sg.exists && sg.content.trim()) { try { settings = JSON.parse(sg.content); } catch { throw new Error("existing settings.json isn't valid JSON"); } }
      settings.statusLine = { type: "command", command: "~/.claude/statusline.sh", padding: 1 };
      r = await fetch("/api/file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "~/.claude/settings.json", content: JSON.stringify(settings, null, 2) }) });
      j = await r.json(); if (!j.ok) throw new Error(j.error || "could not write settings.json");
      setInstalled(true);
      toast("Statusline installed → ~/.claude/statusline.sh + settings.json (backed up)", "success");
    } catch (e) { toast("Install failed: " + e.message, "error"); }
  };

  // generated settings.json
  const settingsJson = `{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 1
  }
}`;

  return (
    <div className="col" style={{ height: "100%" }}>
      {/* header */}
      <div className="row" style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", gap: 12, background: "var(--bg-1)" }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevL" size={15} />Tools</button>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg-3)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}><Icon name="statusbar" size={15} /></span>
        <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>Statusline</b><span className="faint" style={{ fontSize: 11 }}>Design your Claude Code status line</span></div>
        <span className="badge risk-safe" style={{ marginLeft: 4 }}><Icon name="lock" size={11} />Local</span>
        <div className="spacer" style={{ flex: 1 }} />
        {installed && <span className="badge risk-safe"><Icon name="check" size={11} />Installed</span>}
        <button className="btn btn-sm btn-ghost" onClick={() => toast("Reset to defaults", "info")}><Icon name="restart" size={14} />Reset</button>
        <button className="btn btn-primary btn-sm" onClick={install}><Icon name="download" size={14} />{installed ? "Update" : "Install"}</button>
      </div>

      {/* live preview band */}
      <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", background: "var(--bg-0)" }}>
        <div className="row" style={{ marginBottom: 10 }}><span className="panel-title">Live preview</span><span className="faint" style={{ fontSize: 11, marginLeft: 10 }}>how it renders at the bottom of Claude Code</span></div>
        <StatuslinePreview active={active} sepObj={sepObj} themeObj={themeObj} showIcons={showIcons} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", flex: 1, overflow: "hidden" }}>
        {/* left: segment builder */}
        <div className="col" style={{ borderRight: "1px solid var(--line)", overflow: "auto", padding: 20 }}>
          <div className="row" style={{ marginBottom: 12 }}><span className="panel-title">Segments</span><span className="faint" style={{ fontSize: 11, marginLeft: "auto" }}>drag to reorder · toggle to show/hide</span></div>
          <div className="col" style={{ gap: 7 }}>
            {segs.map((s, i) => (
              <div key={s.id} draggable
                onDragStart={() => setDrag(i)}
                onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}
                onDragEnd={() => setDrag(null)}
                className="row" style={{ gap: 10, padding: "10px 12px", background: drag === i ? "var(--bg-3)" : "var(--bg-2)", border: "1px solid " + (drag === i ? "var(--ac-line)" : "var(--line)"), borderRadius: "var(--r-sm)", opacity: s.on ? 1 : 0.5, cursor: "grab" }}>
                <Icon name="drag" size={15} style={{ color: "var(--tx-faint)" }} />
                <span style={{ width: 26, height: 26, borderRadius: 7, background: s.color + "22", color: s.color, display: "grid", placeItems: "center", flex: "none" }}><Icon name={s.icon} size={14} /></span>
                <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{s.label}</b>
                  <span className="mono faint" style={{ fontSize: 10.5 }}>{s.id === "custom" ? "static text" : s.sample}</span>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="icon-btn" style={{ width: 26, height: 26 }} title="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}><Icon name="chevUp" size={14} /></button>
                  <button className="icon-btn" style={{ width: 26, height: 26 }} title="Move down" onClick={() => move(i, i + 1)} disabled={i === segs.length - 1}><Icon name="chevD" size={14} /></button>
                  <Toggle on={s.on} onChange={() => toggle(s.id)} />
                  <button className="icon-btn" style={{ width: 26, height: 26, color: "var(--tx-lo)" }} title="Remove" onClick={() => remove(s.id)}><Icon name="x" size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          {notAdded.length > 0 && (
            <>
              <div className="panel-title" style={{ margin: "20px 0 10px" }}>Add a segment</div>
              <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
                {notAdded.map(c => (
                  <button key={c.id} className="chip" onClick={() => add(c)} title={c.desc}>
                    <Icon name={c.icon} size={13} style={{ color: c.color }} />{c.label}<Icon name="plus" size={12} style={{ color: "var(--tx-lo)" }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* right: style + output */}
        <div className="col" style={{ overflow: "auto" }}>
          <div style={{ padding: 20, borderBottom: "1px solid var(--line)" }}>
            <span className="panel-title">Style</span>
            <div className="col" style={{ gap: 14, marginTop: 12 }}>
              <div className="col" style={{ gap: 7 }}>
                <label className="faint" style={{ fontSize: 12 }}>Separator</label>
                <div className="seg" style={{ flexWrap: "wrap" }}>
                  {SL_SEPARATORS.map(s => <button key={s.id} data-on={sep === s.id} onClick={() => setSep(s.id)}>{s.label}</button>)}
                </div>
              </div>
              <div className="col" style={{ gap: 7 }}>
                <label className="faint" style={{ fontSize: 12 }}>Color theme</label>
                <div className="seg">
                  {Object.entries(SL_THEMES).map(([k, v]) => <button key={k} data-on={theme === k} onClick={() => setTheme(k)}>{v.name}</button>)}
                </div>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="col" style={{ gap: 1 }}><span style={{ fontSize: 13, fontWeight: 500 }}>Show icons</span><span className="faint" style={{ fontSize: 11 }}>Nerd-font glyphs before each segment</span></div>
                <Toggle on={showIcons} onChange={setShowIcons} />
              </div>
            </div>
          </div>

          <div style={{ padding: 20, flex: 1 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="panel-title">Generated config</span>
              <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => toast("settings.json copied", "success")}><Icon name="copy" size={13} />Copy</button>
            </div>
            <div className="col" style={{ gap: 8 }}>
              <div>
                <div className="row" style={{ gap: 6, marginBottom: 5 }}><Icon name="file" size={12} style={{ color: "var(--tx-lo)" }} /><span className="mono faint" style={{ fontSize: 11 }}>~/.claude/settings.json</span></div>
                <Code code={settingsJson} lang="json" />
              </div>
              <div>
                <div className="row" style={{ gap: 6, marginBottom: 5 }}><Icon name="terminal" size={12} style={{ color: "var(--tx-lo)" }} /><span className="mono faint" style={{ fontSize: 11 }}>~/.claude/statusline.sh</span><span className="badge risk-safe" style={{ marginLeft: "auto", fontSize: 9.5 }}>auto-generated</span></div>
                <Code code={genScript(active, sepObj, themeObj, showIcons)} lang="toml" />
              </div>
            </div>
            <div className="row" style={{ gap: 9, marginTop: 14, padding: "10px 12px", background: "var(--ac-dim)", border: "1px solid var(--ac-line)", borderRadius: "var(--r-sm)" }}>
              <Icon name="info" size={15} style={{ color: "var(--ac)" }} />
              <span style={{ fontSize: 12 }} className="muted">Install writes both files for you and reloads Claude Code — no terminal needed.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatuslinePreview({ active, sepObj, themeObj, showIcons }) {
  const ICON_GLYPH = { cpu: "◆", folder: "", gitbranch: "", tokens: "▣", clock: "", dollar: "$", edit: "✎" };
  return (
    <div style={{ background: "#0a0b0e", border: "1px solid var(--line-2)", borderRadius: "var(--r-md)", overflow: "hidden", boxShadow: "var(--shadow-2)" }}>
      {/* faux terminal body */}
      <div style={{ padding: "14px 16px 30px", fontFamily: "var(--mono)", fontSize: 12.5, color: "#5b6270", lineHeight: 1.7 }}>
        <div><span style={{ color: "#2bd4a0" }}>›</span> implement the token budget meter</div>
        <div style={{ color: "#7e8694" }}>I'll add a meter component and wire it to the budget…</div>
      </div>
      {/* the status line */}
      <div className="row" style={{ gap: 0, padding: sepObj.render === "arrow" ? 0 : "9px 14px", background: sepObj.render === "arrow" ? "transparent" : "#13151b", borderTop: "1px solid #1c1f27", fontFamily: "var(--mono)", fontSize: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        {active.length === 0 && <span style={{ color: "#5b6270", padding: "9px 14px" }}>No segments — add some on the left</span>}
        {active.map((s, i) => {
          const col = themeObj.useColor ? s.color : "#c7cdd6";
          const display = themeObj.dim ? col + "cc" : col;
          if (sepObj.render === "arrow") {
            // powerline: filled blocks with arrow tips
            const bg = themeObj.useColor ? s.color + "26" : "#1c1f27";
            const next = active[i + 1];
            return (
              <span key={s.id} className="row" style={{ alignItems: "center" }}>
                <span style={{ background: bg, color: display, padding: "9px 11px 9px 13px", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  {showIcons && <span style={{ opacity: 0.8 }}>{ICON_GLYPH[s.icon] || "•"}</span>}
                  {s.sample}
                </span>
                <span style={{ color: bg, fontSize: 18, lineHeight: 1, marginLeft: -1, marginRight: -1 }}>{""}</span>
              </span>
            );
          }
          return (
            <span key={s.id} className="row" style={{ alignItems: "center", gap: 7 }}>
              <span style={{ color: display, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                {showIcons && <span style={{ opacity: 0.85 }}>{ICON_GLYPH[s.icon] || "•"}</span>}
                {s.sample}
              </span>
              {i < active.length - 1 && <span style={{ color: "#444b56", margin: sepObj.id === "space" ? "0 8px" : "0 9px" }}>{sepObj.glyph}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function genScript(active, sepObj, themeObj, showIcons) {
  const parts = active.map(s => `  ${s.id}`).join(" \\\n");
  const segNames = active.map(s => s.id).join(", ");
  return `#!/usr/bin/env bash
# Auto-generated by AI Tools OS — Statusline
# reads session JSON on stdin, prints one line

input=$(cat)
sep="${sepObj.id}"
theme="${themeObj.name.toLowerCase()}"
icons=${showIcons ? "true" : "false"}

# segments (in order): ${segNames}
render \\
${parts || "  model"}`;
}

export { Statusline };

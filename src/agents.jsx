import React from "react";
import { Icon } from "./icons.jsx";
import { Search, ScopeBadge, Toggle, Code, ActionMenu, StatusDot } from "./ui.jsx";
import { Drawer } from "./palette.jsx";

/* agents.jsx — Commands (slash commands) + Subagents */
const { useState: agS, useEffect: agE } = React;

/* ---------------- COMMANDS ---------------- */
function Commands({ toast, share }) {
  const [data, setData] = agS([]);
  const [q, setQ] = agS("");
  const [sel, setSel] = agS(null);
  const [scopeF, setScopeF] = agS("all");
  const [busy, setBusy] = agS({});

  // Load the real slash commands from ~/.claude/commands via the bridge.
  agE(() => {
    fetch("/api/commands").then(r => r.json()).then(j => {
      if (!j || !j.ok) return;
      const mk = (c, enabled) => ({ id: c.file, file: c.file, name: "/" + c.name, title: (c.description || "slash command").slice(0, 70), desc: c.description || "No description.", body: c.prompt || "", scope: "user", enabled, uses: 0, updated: "on disk", args: "" });
      const list = [...(j.enabled || []).map(c => mk(c, true)), ...(j.disabled || []).map(c => mk(c, false))];
      setData(list);
      setSel(s => s || (list[0] && list[0].id) || null);
    }).catch(() => {});
  }, []);

  const filtered = data.filter(c => (scopeF === "all" || c.scope === scopeF) && (c.name + c.title + c.desc).toLowerCase().includes(q.toLowerCase()));
  const cur = data.find(c => c.id === sel) || filtered[0];

  // Real persistence: disable parks the .md out of ~/.claude/commands; enable restores it.
  const toggle = async (id) => {
    const c = data.find(x => x.id === id); if (!c || busy[id]) return;
    const off = c.enabled;
    setBusy(b => ({ ...b, [id]: true }));
    setData(d => d.map(x => x.id === id ? { ...x, enabled: !off } : x));
    try {
      const r = await fetch(`/api/commands/${off ? "disable" : "enable"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: c.file }) });
      const j = await r.json(); if (!j.ok) throw new Error(j.error || "failed");
      toast(off ? `${c.name} disabled — parked out of ~/.claude/commands (new sessions won't list it)` : `${c.name} enabled — restored to ~/.claude/commands`, off ? "warn" : "success");
    } catch (e) {
      setData(d => d.map(x => x.id === id ? { ...x, enabled: off } : x));
      toast(`Couldn't ${off ? "disable" : "enable"} ${c.name}: ${e.message}`, "error");
    } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  return (
    <div className="page" style={{ maxWidth: 1300 }}>
      <div className="page-head">
        <div><h1>Commands</h1><div className="ph-sub">{data.filter(c => c.enabled).length} of {data.length} enabled · live from <span className="mono">~/.claude/commands</span> · type <span className="mono" style={{ color: "var(--ac)" }}>/</span> in Claude Code to run</div></div>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => toast("New command — pick a name and prompt", "info")}><Icon name="plus" size={15} />New command</button>
      </div>

      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search commands…" width={240} />
        <div className="seg">{["all", "user", "project", "workspace"].map(s => <button key={s} data-on={scopeF === s} onClick={() => setScopeF(s)} style={{ textTransform: "capitalize" }}>{s}</button>)}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) 1fr", gap: "var(--gap)", alignItems: "start" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSel(c.id)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "11px 14px", border: 0, borderBottom: "1px solid var(--line)", background: sel === c.id ? "var(--ac-dim)" : "transparent", cursor: "pointer", fontFamily: "inherit", color: "inherit", opacity: c.enabled ? 1 : 0.55 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: sel === c.id ? "var(--ac-line)" : "var(--bg-3)", color: sel === c.id ? "var(--ac)" : "var(--tx-mid)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="slash" size={15} /></span>
              <div className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: sel === c.id ? "var(--ac)" : "var(--tx-hi)" }}>{c.name}</span>
                <span className="faint" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
              </div>
              <span className="faint tnum" style={{ fontSize: 10.5 }}>{c.uses}×</span>
            </button>
          ))}
        </div>

        {cur && (
          <div className="card" style={{ overflow: "hidden", position: "sticky", top: 0 }}>
            <div className="card-hd">
              <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center" }}><Icon name="slash" size={16} /></span>
              <div className="col" style={{ gap: 1, minWidth: 0 }}><b className="mono" style={{ fontSize: 14, whiteSpace: "nowrap" }}>{cur.name} {cur.args && <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>{cur.args}</span>}</b><span className="sub">{cur.title}</span></div>
              <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
                <ScopeBadge scope={cur.scope} icon={false} />
                <Toggle on={cur.enabled} onChange={() => toggle(cur.id)} />
              </div>
            </div>
            <div className="card-pad col" style={{ gap: 14 }}>
              <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{cur.desc}</p>
              <div className="col" style={{ gap: 6 }}>
                <span className="panel-title">Prompt template</span>
                <Code code={cur.body} lang="md" />
              </div>
              <div className="row" style={{ gap: 18, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <div className="col" style={{ gap: 1 }}><span className="stat-lbl" style={{ fontSize: 10 }}>RUNS</span><b className="tnum">{cur.uses}</b></div>
                <div className="col" style={{ gap: 1 }}><span className="stat-lbl" style={{ fontSize: 10 }}>UPDATED</span><b style={{ fontSize: 13 }}>{cur.updated}</b></div>
                <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
                  <button className="btn btn-sm" onClick={() => share && share({ kind: "command", name: cur.name, scope: cur.scope, vendor: "acme" })}><Icon name="link" size={14} />Share</button>
                  <button className="btn btn-sm" onClick={() => toast("Editing " + cur.name, "info")}><Icon name="edit" size={14} />Edit</button>
                  <button className="btn btn-primary btn-sm" onClick={() => toast("Running " + cur.name + "…", "info")}><Icon name="play" size={14} fill />Run</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- SUBAGENTS ---------------- */
const _agentPalette = ["#2bd4a0", "#5b9dff", "#b79bff", "#f5b544", "#ff7a90", "#4ec2c8"];
function _mkAgent(a, enabled, i) {
  return {
    id: a.file, file: a.file, name: a.name, enabled,
    role: a.model && a.model !== "inherit" ? a.model + " · subagent" : "subagent",
    desc: a.description || "No description.",
    model: a.model || "inherit", scope: "user",
    tools: a.tools && a.tools.length ? a.tools : ["(inherits all)"],
    prompt: a.prompt || "(system prompt is the file body)",
    color: _agentPalette[i % _agentPalette.length],
    status: enabled ? "ready" : "idle", runs: 0, updated: "on disk",
  };
}

function Subagents({ toast, share }) {
  const [data, setData] = agS([]);
  const [q, setQ] = agS("");
  const [sel, setSel] = agS(null);
  const [busy, setBusy] = agS({});
  const [loaded, setLoaded] = agS(false);

  // Load the real subagents from ~/.claude/agents via the bridge.
  agE(() => {
    fetch("/api/agents").then(r => r.json()).then(j => {
      if (!j || !j.ok) { setLoaded(true); return; }
      const list = [
        ...(j.enabled || []).map((a, i) => _mkAgent(a, true, i)),
        ...(j.disabled || []).map((a, i) => _mkAgent(a, false, i + (j.enabled || []).length)),
      ];
      setData(list); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  // Real persistence: disable parks the .md out of ~/.claude/agents; enable restores it.
  const toggle = async (id) => {
    const s = data.find(x => x.id === id); if (!s || busy[id]) return;
    const off = s.enabled;
    setBusy(b => ({ ...b, [id]: true }));
    setData(d => d.map(x => x.id === id ? { ...x, enabled: !off, status: !off ? "ready" : "idle" } : x));
    try {
      const r = await fetch(`/api/agents/${off ? "disable" : "enable"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: s.file }) });
      const j = await r.json(); if (!j.ok) throw new Error(j.error || "failed");
      toast(off ? `${s.name} disabled — moved out of ~/.claude/agents (new sessions won't load it)` : `${s.name} enabled — restored to ~/.claude/agents`, off ? "warn" : "success");
    } catch (e) {
      setData(d => d.map(x => x.id === id ? { ...x, enabled: off, status: off ? "ready" : "idle" } : x));
      toast(`Couldn't ${off ? "disable" : "enable"} ${s.name}: ${e.message}`, "error");
    } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const cur = data.find(s => s.id === sel);
  const filtered = data.filter(s => (s.name + s.role + s.desc).toLowerCase().includes(q.toLowerCase()));
  const enabledCount = data.filter(s => s.enabled).length;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Subagents</h1><div className="ph-sub">{enabledCount} of {data.length} enabled · live from <span className="mono">~/.claude/agents</span></div></div>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => toast("New subagent — define a role and tools", "info")}><Icon name="plus" size={15} />New subagent</button>
      </div>

      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search subagents…" width={260} /></div>

      {loaded && data.length === 0 && <div className="card card-pad muted">No subagents found in ~/.claude/agents.</div>}

      <div className="grid g-3">
        {filtered.map(s => (
          <div key={s.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", opacity: s.enabled ? 1 : 0.6 }} onClick={() => setSel(s.id)}>
            <div className="row" style={{ gap: 11 }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, background: s.color + "22", color: s.color, display: "grid", placeItems: "center", flex: "none", border: "1px solid " + s.color + "44" }}><Icon name="bot" size={20} /></span>
              <div className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14.5 }}>{s.name}</b>
                <span className="faint" style={{ fontSize: 11.5 }}>{s.role}</span>
              </div>
              <span onClick={e => e.stopPropagation()}><Toggle on={s.enabled} onChange={() => toggle(s.id)} /></span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, minHeight: 36 }}>{s.desc}</p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="badge sq" style={{ fontSize: 10.5 }}><Icon name="cpu" size={11} style={{ color: "var(--tx-mid)" }} />{s.model}</span>
              <ScopeBadge scope={s.scope} icon={false} />
              {!s.enabled && <span className="badge sq" style={{ fontSize: 10 }}>parked</span>}
            </div>
            <div className="col" style={{ gap: 6 }}>
              <span className="stat-lbl" style={{ fontSize: 10 }}>TOOLS</span>
              <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>{s.tools.map(t => <span key={t} className="chip mono" style={{ fontSize: 10, padding: "2px 7px" }}>{t}</span>)}</div>
            </div>
            <div className="row" style={{ paddingTop: 10, borderTop: "1px solid var(--line)", marginTop: "auto", fontSize: 11.5 }}>
              <span className="faint">{s.file}</span>
              <span className="row" style={{ gap: 6, marginLeft: "auto" }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm" style={{ padding: "4px 9px" }} onClick={() => toast("Running " + s.name, "info")}><Icon name="play" size={13} fill />Run</button>
                <ActionMenu items={[
                  { icon: "eye", label: "View system prompt", onClick: () => setSel(s.id) },
                  { icon: "edit", label: "Edit", onClick: () => toast("Editing " + s.name, "info") },
                  { icon: "link", label: "Share…", onClick: () => share && share({ kind: "subagent", name: s.name, scope: s.scope, vendor: "acme" }) },
                  { sep: true },
                  { icon: s.enabled ? "stop" : "play", label: s.enabled ? "Disable (park file)" : "Enable", onClick: () => toggle(s.id) },
                ]} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {cur && (
        <Drawer open onClose={() => setSel(null)} width={460}>
          <div className="drawer-hd">
            <span style={{ width: 40, height: 40, borderRadius: 11, background: cur.color + "22", color: cur.color, display: "grid", placeItems: "center", flex: "none", border: "1px solid " + cur.color + "44" }}><Icon name="bot" size={20} /></span>
            <div className="col" style={{ gap: 2, flex: 1 }}><b style={{ fontSize: 15 }}>{cur.name}</b><span className="faint" style={{ fontSize: 12 }}>{cur.role}</span></div>
            <button className="icon-btn" onClick={() => setSel(null)}><Icon name="x" size={17} /></button>
          </div>
          <div className="drawer-body col" style={{ gap: 16 }}>
            <div className="grid g-2" style={{ gap: 10 }}>
              {[["Model", <b className="row" style={{ gap: 5, fontSize: 13 }}><Icon name="cpu" size={13} style={{ color: "var(--tx-lo)" }} />{cur.model}</b>], ["Scope", <ScopeBadge scope={cur.scope} icon={false} />], ["Status", <span className="row" style={{ gap: 6 }}><StatusDot state={cur.status === "ready" ? "running" : "stopped"} /><b style={{ textTransform: "capitalize", fontSize: 13 }}>{cur.status}</b></span>], ["Runs", <b className="tnum">{cur.runs}</b>]].map(([l, v], i) => (
                <div key={i} className="card card-pad" style={{ padding: 12, gap: 5, display: "flex", flexDirection: "column" }}><span className="stat-lbl" style={{ fontSize: 10.5 }}>{l}</span>{v}</div>
              ))}
            </div>
            <div className="col" style={{ gap: 8 }}>
              <span className="panel-title">Allowed tools</span>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{cur.tools.map(t => <span key={t} className="chip mono" style={{ fontSize: 11 }}>{t}</span>)}</div>
            </div>
            <div className="col" style={{ gap: 8 }}>
              <span className="panel-title">System prompt</span>
              <Code code={cur.prompt} lang="md" />
            </div>
          </div>
          <div className="drawer-foot">
            <button className="btn" onClick={() => share && share({ kind: "subagent", name: cur.name, scope: cur.scope, vendor: "acme" })}><Icon name="link" size={15} />Share</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => toast("Editing " + cur.name, "info")}><Icon name="edit" size={15} />Edit</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => toast("Running " + cur.name, "info")}><Icon name="play" size={15} fill />Run agent</button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

export { Commands, Subagents };

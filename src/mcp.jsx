import React from "react";
import { Icon } from "./icons.jsx";
import { MCPS, MCP_PROFILES, fmtTok } from "./data.jsx";
import { Search, StatusDot, Toggle, ScopeBadge, RiskBadge, ActionMenu, Meter } from "./ui.jsx";

/* mcp.jsx — MCP Manager: servers, controls, profiles, details */
const { useState: mcS, useMemo: mcM, useEffect: mcE } = React;

function MCPManager(props) {
  const [tab, setTab] = mcS("servers");
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>MCP Servers</h1><div className="ph-sub">Model Context Protocol connections · {MCPS.filter(m => m.state === "running").length} running · {fmtTok(props.profile.tokens)} tokens in current profile</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => props.toast("Refreshing MCP states…", "info")}><Icon name="refresh" size={15} />Refresh</button>
        <button className="btn btn-primary btn-sm" onClick={() => props.toast("Add MCP — paste a command or URL", "info")}><Icon name="plus" size={15} />Add server</button>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        <button data-on={tab === "servers"} onClick={() => setTab("servers")}><Icon name="mcp" size={15} />Servers</button>
        <button data-on={tab === "profiles"} onClick={() => setTab("profiles")}><Icon name="cube" size={15} />Profiles</button>
      </div>

      {tab === "servers" ? <MCPServers {...props} /> : <MCPProfiles {...props} />}
    </div>
  );
}

function MCPServers({ toast, openResource, share }) {
  const [data, setData] = mcS(MCPS.map(m => ({ ...m })));
  const [q, setQ] = mcS("");
  const [scopeF, setScopeF] = mcS("all");
  const [busy, setBusy] = mcS({});

  // Sync real enabled/disabled state from ~/.claude.json via the bridge on mount.
  mcE(() => {
    fetch("/api/mcp").then(r => r.json()).then(j => {
      if (!j || !j.ok) return;
      const dis = new Set(j.disabled || []);
      setData(d => d.map(m => dis.has(m.id)
        ? { ...m, enabled: false, state: "stopped" }
        : { ...m, enabled: true, state: m.state === "stopped" ? "running" : m.state }));
    }).catch(() => {/* bridge offline — stay on mock state */});
  }, []);

  const ctrl = (id, action) => {
    setData(d => d.map(m => m.id === id ? { ...m, state: action === "stop" ? "stopped" : "running" } : m));
    const m = data.find(x => x.id === id);
    toast(`${m.name} ${action}${action.endsWith("t") ? "ped" : action === "restart" ? "ed" : "ed"}`, action === "stop" ? "warn" : "success");
  };

  // Real persistence: disable removes the server from ~/.claude.json (parks the
  // full config in ~/.aios/disabled-mcp.json); enable restores it verbatim.
  const toggle = async (id) => {
    const m = data.find(x => x.id === id);
    if (!m || busy[id]) return;
    const turningOff = m.enabled;
    setBusy(b => ({ ...b, [id]: true }));
    setData(d => d.map(x => x.id === id ? { ...x, enabled: !turningOff, state: !turningOff ? "running" : "stopped" } : x));
    try {
      const r = await fetch(`/api/mcp/${turningOff ? "disable" : "enable"}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "request failed");
      toast(turningOff
        ? `${m.name} disabled — removed from ~/.claude.json (new Claude sessions won't load it)`
        : `${m.name} enabled — restored to ~/.claude.json`, turningOff ? "warn" : "success");
    } catch (e) {
      setData(d => d.map(x => x.id === id ? { ...x, enabled: turningOff, state: turningOff ? "running" : "stopped" } : x));
      toast(`Couldn't ${turningOff ? "disable" : "enable"} ${m.name}: ${e.message}`, "error");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  const filtered = data.filter(m => (scopeF === "all" || m.scope === scopeF) && m.name.toLowerCase().includes(q.toLowerCase()));
  const activeList = filtered.filter(m => m.enabled);
  const disabledList = filtered.filter(m => !m.enabled);

  const card = (m) => (
    <div key={m.id} data-server={m.id} className="card card-pad" style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, opacity: m.enabled ? 1 : 0.62 }} onClick={() => openResource({ kind: "mcp", ...m })}>
      <div className="row" style={{ gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: "var(--bg-3)", display: "grid", placeItems: "center", flex: "none", border: "1px solid var(--line)", position: "relative" }}>
          <Icon name="mcp" size={18} style={{ color: "var(--tx-mid)" }} />
          <span style={{ position: "absolute", bottom: -2, right: -2 }}><StatusDot state={m.state} /></span>
        </span>
        <div className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 7 }}><b style={{ fontSize: 14 }}>{m.name}</b><span className="badge sq" style={{ fontSize: 10 }}>{m.transport}</span></div>
          <span className="mono faint" style={{ fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.cmd}</span>
        </div>
        <Toggle on={m.enabled} onChange={() => toggle(m.id)} />
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4 }}>{m.desc}</p>

      <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
        <ScopeBadge scope={m.scope} icon={false} />
        <RiskBadge risk={m.risk} />
        {!m.enabled && <span className="badge sq" style={{ fontSize: 10 }}>parked</span>}
        {m.errors > 0 && <span className="badge risk-crit"><Icon name="alert" size={12} />{m.errors} errors</span>}
        {m.caps.includes("shell") && <span className="badge risk-high"><Icon name="terminal" size={11} />shell</span>}
      </div>

      <div className="row" style={{ gap: 0, paddingTop: 10, borderTop: "1px solid var(--line)", justifyContent: "space-between" }}>
        <div className="col" style={{ gap: 1 }}><span className="stat-lbl" style={{ fontSize: 10 }}>TOOLS</span><b className="tnum" style={{ fontSize: 14 }}>{m.tools}</b></div>
        <div className="col" style={{ gap: 1 }}><span className="stat-lbl" style={{ fontSize: 10 }}>TOKENS</span><b className="mono tnum" style={{ fontSize: 14, color: m.tokens > 5000 ? "var(--r-med)" : "var(--tx-hi)" }}>{fmtTok(m.tokens)}</b></div>
        <div className="col" style={{ gap: 1 }}><span className="stat-lbl" style={{ fontSize: 10 }}>UPTIME</span><b className="tnum" style={{ fontSize: 14 }}>{m.enabled ? m.uptime : "—"}</b></div>
        <div className="row" style={{ gap: 5 }} onClick={e => e.stopPropagation()}>
          {m.state === "running"
            ? <><button className="icon-btn" title="Restart" onClick={() => ctrl(m.id, "restart")}><Icon name="restart" size={16} /></button>
                <button className="icon-btn" title="Stop" onClick={() => ctrl(m.id, "stop")}><Icon name="stop" size={15} /></button></>
            : <button className="btn btn-sm" title="Enable" onClick={() => toggle(m.id)}><Icon name="play" size={14} fill />Enable</button>}
          <ActionMenu items={[
            { icon: "eye", label: "Inspect tools", onClick: () => openResource({ kind: "mcp", ...m }) },
            { icon: "config", label: "Edit config", onClick: () => toast("Opening " + m.name + " config", "info") },
            { icon: "link", label: "Share…", onClick: () => share && share({ kind: "mcp", name: m.name, scope: m.scope, vendor: m.name }) },
            { icon: "terminal", label: "View logs", onClick: () => openResource({ kind: "mcp", ...m, tab: "logs" }) },
            { icon: "arrowR", label: "Move scope…", onClick: () => toast("Move " + m.name, "info") },
            { sep: true },
            { icon: m.enabled ? "stop" : "play", label: m.enabled ? "Disable" : "Enable", onClick: () => toggle(m.id) },
          ]} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search servers…" width={240} />
        <div className="seg">{["all", "user", "project", "workspace"].map(s => <button key={s} data-on={scopeF === s} onClick={() => setScopeF(s)} style={{ textTransform: "capitalize" }}>{s}</button>)}</div>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="faint" style={{ fontSize: 12 }}>{activeList.length} enabled · {disabledList.length} disabled</span>
      </div>

      <div className="grid g-2">{activeList.map(card)}</div>

      {disabledList.length > 0 && (
        <>
          <div className="row" style={{ gap: 8, margin: "22px 2px 12px", color: "var(--tx-mid)" }}>
            <Icon name="stop" size={14} />
            <b style={{ fontSize: 13 }}>Disabled · {disabledList.length}</b>
            <span className="faint mono" style={{ fontSize: 11 }}>parked in ~/.aios/disabled-mcp.json — re-enable to restore</span>
          </div>
          <div className="grid g-2">{disabledList.map(card)}</div>
        </>
      )}
    </>
  );
}

function MCPProfiles({ toast, profileId, setProfile }) {
  const active = profileId;
  return (
    <>
      <div className="card card-pad" style={{ marginBottom: "var(--gap)", display: "flex", alignItems: "center", gap: 16 }}>
        <Icon name="info" size={18} style={{ color: "var(--r-low)" }} />
        <span style={{ fontSize: 13 }} className="muted">Profiles swap which MCP servers load at startup. Fewer servers means less context overhead and faster boots — switch to match your task.</span>
      </div>
      <div className="grid g-3">
        {MCP_PROFILES.map(p => {
          const on = p.id === active;
          return (
            <div key={p.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 13, border: on ? "1px solid var(--ac-line)" : undefined, boxShadow: on ? "0 0 0 1px var(--ac-line), 0 8px 30px -12px var(--ac-glow)" : undefined }}>
              <div className="row" style={{ gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", flex: "none", background: on ? "var(--ac-dim)" : "var(--bg-3)", color: on ? "var(--ac)" : "var(--tx-mid)", border: "1px solid " + (on ? "var(--ac-line)" : "var(--line)") }}><Icon name={p.icon} size={19} /></span>
                <div className="col" style={{ gap: 1, flex: 1 }}><b style={{ fontSize: 14.5 }}>{p.name}</b><span className="faint" style={{ fontSize: 11.5 }}>{p.desc}</span></div>
                {on && <span className="badge risk-safe"><span className="dot" style={{ background: "var(--ac)" }} />Active</span>}
              </div>

              <div className="col" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: "space-between", fontSize: 11.5 }}><span className="faint">{p.mcps.length} servers</span><span className="mono tnum" style={{ color: p.tokens > 15000 ? "var(--r-med)" : "var(--tx-mid)" }}>{fmtTok(p.tokens)} tokens</span></div>
                <Meter value={p.tokens} max={22000} height={5} />
              </div>

              <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                {p.mcps.map(id => { const m = MCPS.find(x => x.id === id); return <span key={id} className="chip" style={{ fontSize: 10.5, padding: "3px 7px" }}><StatusDot state="running" />{m ? m.name : id}</span>; })}
              </div>

              <button className={"btn btn-sm " + (on ? "" : "btn-primary")} disabled={on} style={{ marginTop: "auto" }}
                onClick={async () => {
                  setProfile(p.id);
                  try {
                    const r = await fetch("/api/mcp/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mcps: p.mcps }) });
                    const j = await r.json();
                    if (!j.ok) throw new Error(j.error || "failed");
                    toast(`Applied ${p.name} — ${j.enabled.length} servers in ~/.claude.json, ${j.disabled.length} parked`, "success");
                  } catch (e) {
                    toast(`Switched to ${p.name} (UI only — ${e.message})`, "warn");
                  }
                }}>
                {on ? <><Icon name="check" size={14} />Current profile</> : <><Icon name="cube" size={14} />Activate</>}
              </button>
            </div>
          );
        })}
        <button className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "center", justifyContent: "center", border: "1.5px dashed var(--line-3)", background: "transparent", cursor: "pointer", color: "var(--tx-mid)", minHeight: 200 }} onClick={() => toast("Create a custom profile", "info")}>
          <Icon name="plus" size={22} /><b style={{ fontSize: 13 }}>Custom profile</b><span className="faint" style={{ fontSize: 11.5 }}>Hand-pick your servers</span>
        </button>
      </div>
    </>
  );
}

export { MCPManager };

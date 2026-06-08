import React from "react";
import { Icon } from "./icons.jsx";
import { MCPS, SKILLS, MEMORY, TOOLS, TOKEN_CATS, ACTIVITY, SUGGESTIONS, fmtTok, riskClass, riskColor } from "./data.jsx";
import { Stat, HealthRing, StatusDot, RiskBadge, SegBar, Donut, Meter, Badge } from "./ui.jsx";

/* dashboard.jsx */
const { useState: dS } = React;

function WidgetHead({ title, sub, icon, action }) {
  return (
    <div className="card-hd">
      {icon && <span style={{ color: "var(--tx-lo)" }}><Icon name={icon} size={16} /></span>}
      <div className="col" style={{ gap: 1 }}>
        <h3>{title}</h3>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

function Dashboard({ nav, toast, openResource, profile, setProfile }) {
  const activeMcp = MCPS.filter(m => m.state === "running").length;
  const disabledMcp = MCPS.filter(m => !m.enabled).length;
  const skillsValid = SKILLS.filter(s => s.status === "valid").length;
  const skillsBroken = SKILLS.filter(s => s.status === "broken").length;
  const crit = MCPS.filter(m => m.risk === "crit").length + SKILLS.filter(s => s.risk === "crit").length;
  const totalRes = SKILLS.length + MCPS.length + MEMORY.length + TOOLS.filter(t => t.installed).length;
  const totalTok = TOKEN_CATS.reduce((s, c) => s + c.tokens, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Good afternoon, Jordan</h1>
          <div className="ph-sub">Here's the health of your AI workspace · <span className="mono" style={{ color: "var(--tx-mid)" }}>Acme Platform</span></div>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => toast("Running full health scan…", "info")}><Icon name="refresh" size={15} />Health scan</button>
        <button className="btn btn-primary btn-sm" onClick={() => nav("tokens")}><Icon name="zap" size={15} />Optimize startup</button>
      </div>

      {/* top stat row */}
      <div className="grid g-4" style={{ marginBottom: "var(--gap)" }}>
        <Stat value={totalRes} label="Total resources" delta="+3 this week" icon="cube" />
        <Stat value={activeMcp} label="Active MCP servers" delta={disabledMcp + " disabled"} deltaDir="down" icon="mcp" accent="var(--r-low)" />
        <Stat value={fmtTok(totalTok)} label="Startup tokens" delta="+13% vs last wk" deltaDir="down" icon="tokens" accent="var(--r-med)" />
        <Stat value={crit} label="Critical risks" delta="needs action" deltaDir="down" icon="security" accent="var(--r-crit)" />
      </div>

      {/* main grid */}
      <div className="grid g-3">
        {/* Resource Health */}
        <div className="card">
          <WidgetHead title="Resource Health" sub="Across all scopes" icon="dashboard" />
          <div className="card-pad row" style={{ gap: 18 }}>
            <HealthRing value={82} size={84} stroke={8} label="82" />
            <div className="col" style={{ gap: 9, flex: 1 }}>
              {[["Healthy", 21, "var(--ac)"], ["Warnings", 4, "var(--r-med)"], ["Broken", 1, "var(--r-crit)"]].map(([l, n, c]) => (
                <div key={l} className="row" style={{ gap: 8, fontSize: 12.5 }}>
                  <span className="status-dot" style={{ background: c, boxShadow: "none" }} />
                  <span className="muted">{l}</span>
                  <b style={{ marginLeft: "auto" }} className="tnum">{n}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MCP Status */}
        <div className="card">
          <WidgetHead title="MCP Status" sub={profile.name + " profile"} icon="mcp"
            action={<button className="btn btn-sm btn-ghost" onClick={() => nav("mcp")}>Manage</button>} />
          <div className="card-pad col" style={{ gap: 8 }}>
            {MCPS.slice(0, 4).map(m => (
              <div key={m.id} className="row" style={{ gap: 9, cursor: "pointer" }} onClick={() => openResource({ kind: "mcp", ...m })}>
                <StatusDot state={m.state} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                <span className="mono faint" style={{ fontSize: 11 }}>{m.tools} tools</span>
                <span className="mono tnum" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--tx-mid)" }}>{fmtTok(m.tokens)}</span>
                <RiskBadge risk={m.risk} dot={false} />
              </div>
            ))}
            <div className="row faint" style={{ fontSize: 12, marginTop: 2 }}>+ {MCPS.length - 4} more servers</div>
          </div>
        </div>

        {/* Security Risk */}
        <div className="card" style={{ borderColor: "rgba(255,93,108,0.22)" }}>
          <WidgetHead title="Security Risk" sub="2 critical findings" icon="security"
            action={<button className="btn btn-sm btn-ghost" onClick={() => nav("security")}>Review</button>} />
          <div className="card-pad col" style={{ gap: 11 }}>
            <SegBar segments={[{ value: 18, color: "var(--r-safe)", label: "safe" }, { value: 5, color: "var(--r-low)", label: "low" }, { value: 4, color: "var(--r-med)", label: "med" }, { value: 1, color: "var(--r-high)", label: "high" }, { value: 2, color: "var(--r-crit)", label: "crit" }]} />
            <div className="row" style={{ gap: 10, fontSize: 11.5, flexWrap: "wrap" }}>
              {[["Safe", 18, "var(--r-safe)"], ["Low", 5, "var(--r-low)"], ["Med", 4, "var(--r-med)"], ["High", 1, "var(--r-high)"], ["Crit", 2, "var(--r-crit)"]].map(([l, n, c]) => (
                <span key={l} className="row" style={{ gap: 5 }}><span className="status-dot" style={{ background: c, boxShadow: "none" }} />{l} <b className="tnum">{n}</b></span>
              ))}
            </div>
            <div className="row" style={{ gap: 9, padding: "9px 11px", background: "var(--r-crit-bg)", borderRadius: "var(--r-sm)", border: "1px solid rgba(255,93,108,0.2)" }}>
              <Icon name="alert" size={16} style={{ color: "var(--r-crit)" }} />
              <span style={{ fontSize: 12.5 }}><b>Desktop Commander</b> has shell + full-filesystem access.</span>
            </div>
          </div>
        </div>

        {/* Token Budget — span 2 */}
        <div className="card col-span-2">
          <WidgetHead title="Startup Token Budget" sub="Loaded at every session start" icon="tokens"
            action={<button className="btn btn-sm btn-ghost" onClick={() => nav("tokens")}>Details</button>} />
          <div className="card-pad row" style={{ gap: 22 }}>
            <Donut data={TOKEN_CATS} size={128} stroke={17}
              center={<div><div className="stat-val tnum" style={{ fontSize: 22 }}>{fmtTok(totalTok)}</div><div className="stat-lbl">tokens</div></div>} />
            <div className="col" style={{ gap: 9, flex: 1 }}>
              {TOKEN_CATS.map(c => (
                <div key={c.key} className="row" style={{ gap: 9 }}>
                  <span className="status-dot" style={{ background: c.color, boxShadow: "none" }} />
                  <span style={{ fontSize: 12.5, width: 110 }} className="muted">{c.label}</span>
                  <div style={{ flex: 1 }}><Meter value={c.tokens} max={22000} height={5} tone="" /></div>
                  <span className="mono tnum" style={{ fontSize: 11.5, width: 48, textAlign: "right" }}>{fmtTok(c.tokens)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Skill Validation */}
        <div className="card">
          <WidgetHead title="Skill Validation" sub={`${skillsValid}/${SKILLS.length} valid`} icon="skill"
            action={<button className="btn btn-sm btn-ghost" onClick={() => nav("skills")}>View</button>} />
          <div className="card-pad col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 14 }}>
              <HealthRing value={Math.round(skillsValid / SKILLS.length * 100)} size={62} stroke={6} />
              <div className="col" style={{ gap: 7, flex: 1, fontSize: 12.5 }}>
                <div className="row"><span className="muted">Valid</span><b style={{ marginLeft: "auto" }}>{skillsValid}</b></div>
                <div className="row"><span className="muted">Warnings</span><b style={{ marginLeft: "auto", color: "var(--r-med)" }}>{SKILLS.filter(s => s.status === "warn").length}</b></div>
                <div className="row"><span className="muted">Broken</span><b style={{ marginLeft: "auto", color: "var(--r-crit)" }}>{skillsBroken}</b></div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, padding: "8px 10px", background: "var(--r-high-bg)", borderRadius: "var(--r-sm)", fontSize: 12 }}>
              <Icon name="warn" size={14} style={{ color: "var(--r-high)" }} />
              <span><b>Deploy Runbook</b> — broken reference</span>
              <button className="btn btn-sm" style={{ marginLeft: "auto", padding: "3px 8px" }} onClick={() => { nav("skills"); toast("Opening Deploy Runbook", "info"); }}>Fix</button>
            </div>
          </div>
        </div>
      </div>

      {/* lower grid: suggestions + activity */}
      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr", marginTop: "var(--gap)" }}>
        <div className="card">
          <WidgetHead title="Suggested Optimizations" sub="Ranked by impact" icon="sparkles" />
          <div className="col" style={{ padding: "6px 7px" }}>
            {SUGGESTIONS.map(s => (
              <div key={s.id} className="row" style={{ gap: 11, padding: "10px 9px", borderRadius: "var(--r-sm)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-3)"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                <span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", flex: "none",
                  background: riskClass(s.risk) === "risk-crit" ? "var(--r-crit-bg)" : "var(--ac-dim)", color: s.risk === "crit" ? "var(--r-crit)" : "var(--ac)" }}>
                  <Icon name={{ token: "tokens", memory: "memory", skill: "skill", mcp: "mcp" }[s.kind]} size={15} />
                </span>
                <div className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</span>
                  <span className="faint" style={{ fontSize: 11.5 }}>{s.detail}</span>
                </div>
                {s.save && <Badge tone="ac" style={{ flex: "none" }}>{s.save}</Badge>}
                <button className="btn btn-sm" onClick={() => toast(s.title + " — done", "success")}>{s.action}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <WidgetHead title="Recent Activity" sub="Last 24 hours" icon="history" />
          <div className="col" style={{ padding: "8px 14px 14px" }}>
            {ACTIVITY.map((a, i) => (
              <div key={a.id} className="row" style={{ gap: 11, position: "relative", paddingBottom: i === ACTIVITY.length - 1 ? 0 : 14 }}>
                <div className="col" style={{ alignItems: "center", flex: "none" }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center",
                    background: "var(--bg-3)", color: riskColor(a.risk), border: "1px solid var(--line)" }}><Icon name={a.icon} size={13} /></span>
                  {i !== ACTIVITY.length - 1 && <span style={{ width: 1, flex: 1, background: "var(--line)", marginTop: 3 }} />}
                </div>
                <div className="col" style={{ gap: 1, minWidth: 0, paddingTop: 2 }}>
                  <span style={{ fontSize: 12.5 }}>
                    <span className="faint" style={{ textTransform: "capitalize" }}>{a.who}</span> {a.action} <b>{a.target}</b>
                  </span>
                  <span className="row" style={{ gap: 7, fontSize: 11 }}>
                    <span className="faint">{a.time}</span>
                    {a.note && <span style={{ color: "var(--ac)" }} className="mono">{a.note}</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Dashboard, WidgetHead };

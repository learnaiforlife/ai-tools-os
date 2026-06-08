import React from "react";
import { Icon } from "./icons.jsx";
import { MCPS, SKILLS, TOOLS, CAP_LIST, riskColor, riskLabel } from "./data.jsx";
import { HealthRing, SegBar, RiskBadge, ActionMenu } from "./ui.jsx";
import { Drawer } from "./palette.jsx";

/* security.jsx — Security Review Center + permission matrix */
const { useState: scS, useMemo: scM } = React;

// build unified resource list with capabilities
function buildSecRes() {
  const list = [];
  MCPS.forEach(m => list.push({ id: "mcp-" + m.id, name: m.name, type: "MCP", scope: m.scope, risk: m.risk, caps: ["local", ...m.caps].filter((v, i, a) => a.indexOf(v) === i), enabled: m.enabled }));
  SKILLS.forEach(s => { const caps = ["local", "files"]; if (s.deps.includes("shell")) caps.push("shell", "writes"); if (s.deps.some(d => d.includes("mcp"))) caps.push("network"); if (s.risk === "high") caps.push("env", "secrets"); list.push({ id: "skill-" + s.id, name: s.name, type: "Skill", scope: s.scope, risk: s.risk, caps, enabled: s.enabled }); });
  TOOLS.filter(t => t.installed).forEach(t => { const caps = ["local"]; if (t.locality === "networked") caps.push("network", "external"); if (t.id === "rtk") caps.push("writes", "shell"); list.push({ id: "tool-" + t.id, name: t.name, type: "Tool", scope: "user", risk: t.risk, caps, enabled: true }); });
  return list.sort((a, b) => ({ crit: 0, high: 1, med: 2, low: 3, safe: 4 }[a.risk] - { crit: 0, high: 1, med: 2, low: 3, safe: 4 }[b.risk]));
}

function Security({ toast }) {
  const all = scM(buildSecRes, []);
  const [capF, setCapF] = scS(null);
  const [riskF, setRiskF] = scS("all");
  const [sel, setSel] = scS(null);

  const filtered = all.filter(r => (riskF === "all" || r.risk === riskF) && (!capF || r.caps.includes(capF)));
  const counts = { safe: 0, low: 0, med: 0, high: 0, crit: 0 };
  all.forEach(r => counts[r.risk]++);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Security Review</h1><div className="ph-sub">Privacy & risk across {all.length} resources · {counts.crit} critical · {counts.high} high</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => toast("Full audit started…", "info")}><Icon name="shield" size={15} />Run audit</button>
        <button className="btn btn-danger btn-sm" onClick={() => toast("2 critical resources disabled", "success")}><Icon name="lock" size={15} />Disable all risky</button>
      </div>

      {/* risk dashboard */}
      <div className="grid" style={{ gridTemplateColumns: "1.1fr 2fr", marginBottom: "var(--gap)" }}>
        <div className="card card-pad row" style={{ gap: 20 }}>
          <HealthRing value={68} size={92} stroke={9} color="var(--r-med)" label={<span style={{ fontSize: 22 }}>B−</span>} />
          <div className="col" style={{ gap: 3 }}>
            <span className="stat-lbl">Workspace risk grade</span>
            <b style={{ fontSize: 15 }}>Needs attention</b>
            <span className="faint" style={{ fontSize: 12, marginTop: 2 }}>2 critical resources can run shell commands and reach the network unsandboxed.</span>
          </div>
        </div>
        <div className="card card-pad col" style={{ gap: 12, justifyContent: "center" }}>
          <span className="panel-title">Risk distribution — click to filter</span>
          <SegBar segments={[{ value: counts.safe, color: "var(--r-safe)" }, { value: counts.low, color: "var(--r-low)" }, { value: counts.med, color: "var(--r-med)" }, { value: counts.high, color: "var(--r-high)" }, { value: counts.crit, color: "var(--r-crit)" }]} height={14} />
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            {[["safe", "Safe"], ["low", "Low"], ["med", "Medium"], ["high", "High"], ["crit", "Critical"]].map(([k, l]) => (
              <button key={k} className="chip" data-on={riskF === k} onClick={() => setRiskF(riskF === k ? "all" : k)} style={{ background: "transparent", border: "1px solid var(--line)" }}>
                <span className="status-dot" style={{ background: riskColor(k), boxShadow: "none" }} />{l} <b className="tnum">{counts[k]}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* capability filters */}
      <div className="toolbar">
        <span className="panel-title" style={{ marginRight: 4 }}>Capabilities</span>
        {CAP_LIST.filter(c => c.key !== "local").map(c => (
          <button key={c.key} className="chip" data-on={capF === c.key} onClick={() => setCapF(capF === c.key ? null : c.key)}>
            <Icon name={{ network: "globe", files: "file", writes: "edit", shell: "terminal", env: "config", secrets: "lock", external: "upload", ports: "link", "broad-fs": "folder" }[c.key] || "info"} size={13} />{c.label}
          </button>
        ))}
        {capF && <button className="btn btn-sm btn-ghost" onClick={() => setCapF(null)}>Clear</button>}
      </div>

      {/* permission matrix */}
      <div className="card" style={{ overflow: "auto" }}>
        <table className="tbl" style={{ minWidth: 880 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, zIndex: 2, minWidth: 200 }}>Resource</th>
              <th>Risk</th>
              {CAP_LIST.map(c => <th key={c.key} style={{ textAlign: "center", padding: "9px 6px" }} title={c.label}>
                <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", display: "inline-block", height: 58, fontSize: 9.5 }}>{c.label}</span>
              </th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} data-sel={sel === r.id} onClick={() => setSel(r.id)}>
                <td style={{ position: "sticky", left: 0, background: "var(--bg-2)", zIndex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--bg-3)", display: "grid", placeItems: "center", flex: "none", color: "var(--tx-mid)" }}><Icon name={r.type === "MCP" ? "mcp" : r.type === "Skill" ? "skill" : "tools"} size={12} /></span>
                    <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 12.5 }}>{r.name}</b><span className="faint" style={{ fontSize: 10 }}>{r.type} · {r.scope}</span></div>
                  </div>
                </td>
                <td><RiskBadge risk={r.risk} dot={false} /></td>
                {CAP_LIST.map(c => {
                  const has = r.caps.includes(c.key);
                  const danger = has && !c.good && ["shell", "external", "broad-fs", "ports"].includes(c.key);
                  return <td key={c.key} style={{ textAlign: "center" }}>
                    {has ? <span style={{ display: "inline-grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, background: c.good ? "var(--ac-dim)" : danger ? "var(--r-crit-bg)" : "var(--bg-4)", color: c.good ? "var(--ac)" : danger ? "var(--r-crit)" : "var(--tx-mid)" }}><Icon name={c.good ? "check" : danger ? "alert" : "check"} size={11} /></span>
                      : <span style={{ color: "var(--tx-faint)" }}>·</span>}
                  </td>;
                })}
                <td onClick={e => e.stopPropagation()}><ActionMenu align="right" items={[
                  { icon: "eye", label: "View details", onClick: () => setSel(r.id) },
                  { icon: "shield", label: "Sandbox this", onClick: () => toast("Sandbox recommended for " + r.name, "info") },
                  { icon: "lock", label: "Disable", danger: true, onClick: () => toast("Disabled " + r.name, "warn") },
                ]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* detail drawer */}
      {sel && <SecDrawer res={all.find(r => r.id === sel)} onClose={() => setSel(null)} toast={toast} />}
    </div>
  );
}

function SecDrawer({ res, onClose, toast }) {
  const mitigations = {
    crit: ["Disable until publisher is verified", "Run inside a sandboxed container", "Remove shell + network capabilities"],
    high: ["Restrict filesystem scope to the project root", "Require approval before shell commands", "Rotate any exposed secrets"],
    med: ["Review which secrets are exposed", "Limit network egress to known hosts"],
    low: ["No action required — monitor usage"],
    safe: ["No action required"],
  }[res.risk];
  return (
    <Drawer open onClose={onClose} width={440}>
      <div className="drawer-hd">
        <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", flex: "none", color: riskColor(res.risk), background: "var(--bg-3)" }}><Icon name={res.type === "MCP" ? "mcp" : res.type === "Skill" ? "skill" : "tools"} size={19} /></span>
        <div className="col" style={{ gap: 2, flex: 1 }}><b style={{ fontSize: 15 }}>{res.name}</b><span className="faint" style={{ fontSize: 12 }}>{res.type} · {res.scope} scope</span></div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>
      <div className="drawer-body col" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 10, padding: 14, borderRadius: "var(--r-md)", background: res.risk === "crit" || res.risk === "high" ? "var(--r-crit-bg)" : "var(--bg-2)", border: "1px solid " + (res.risk === "crit" ? "rgba(255,93,108,0.3)" : "var(--line)") }}>
          <Icon name={res.risk === "crit" || res.risk === "high" ? "alert" : "shield"} size={20} style={{ color: riskColor(res.risk) }} />
          <div className="col" style={{ gap: 1 }}><div className="row" style={{ gap: 7 }}><b style={{ fontSize: 13 }}>{riskLabel(res.risk)} risk</b><RiskBadge risk={res.risk} dot={false} /></div><span className="faint" style={{ fontSize: 11.5 }}>{res.caps.includes("shell") ? "Can execute shell commands" : res.caps.includes("network") ? "Communicates over the network" : "Limited local capabilities"}</span></div>
        </div>

        <div className="col" style={{ gap: 8 }}>
          <span className="panel-title">Capabilities</span>
          <div className="col" style={{ gap: 6 }}>
            {CAP_LIST.map(c => {
              const has = res.caps.includes(c.key);
              const danger = has && !c.good && ["shell", "external", "broad-fs", "ports"].includes(c.key);
              return <div key={c.key} className="row" style={{ gap: 9, fontSize: 12.5, opacity: has ? 1 : 0.4 }}>
                <span style={{ width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center", background: has ? (c.good ? "var(--ac-dim)" : danger ? "var(--r-crit-bg)" : "var(--bg-4)") : "transparent", color: has ? (c.good ? "var(--ac)" : danger ? "var(--r-crit)" : "var(--tx-mid)") : "var(--tx-faint)", border: has ? "none" : "1px solid var(--line)" }}><Icon name={has ? "check" : "x"} size={11} /></span>
                <span className={has ? "" : "faint"}>{c.label}</span>
                {danger && <span className="badge risk-crit" style={{ marginLeft: "auto" }}>sensitive</span>}
              </div>;
            })}
          </div>
        </div>

        <div className="col" style={{ gap: 8 }}>
          <span className="panel-title">Recommended mitigations</span>
          {mitigations.map((m, i) => (
            <div key={i} className="row" style={{ gap: 9, padding: "10px 12px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}>
              <Icon name="arrowR" size={14} style={{ color: "var(--ac)", marginTop: 2, flex: "none" }} />
              <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>{m}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="drawer-foot">
        <button className="btn" style={{ flex: 1 }} onClick={() => toast("Sandbox enabled for " + res.name, "success")}><Icon name="shield" size={15} />Sandbox</button>
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { toast("Disabled " + res.name, "warn"); onClose(); }}><Icon name="lock" size={15} />Disable resource</button>
      </div>
    </Drawer>
  );
}

export { Security };

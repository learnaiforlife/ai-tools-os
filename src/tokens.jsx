import React from "react";
import { Icon } from "./icons.jsx";
import { TOKEN_CATS, TOKEN_TREND, TOKEN_TOP, fmtTok } from "./data.jsx";
import { Toggle, Meter, Donut, ScopeBadge, Badge } from "./ui.jsx";

/* tokens.jsx — Claude Code startup token usage dashboard */
const { useState: tkS } = React;

function TokenUsage({ nav, toast, setProfile }) {
  const total = TOKEN_CATS.reduce((s, c) => s + c.tokens, 0);
  const budget = 64000;
  const [lowMode, setLowMode] = tkS(false);
  const projected = lowMode ? 14200 : total;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Token Usage</h1><div className="ph-sub">Context loaded at every Claude Code session start · {fmtTok(total)} of {fmtTok(budget)} budget</div></div>
        <div className="spacer" />
        <div className="row" style={{ gap: 9, padding: "6px 12px", background: "var(--bg-2)", border: "1px solid " + (lowMode ? "var(--ac-line)" : "var(--line)"), borderRadius: "var(--r-md)" }}>
          <Icon name="compress" size={15} style={{ color: lowMode ? "var(--ac)" : "var(--tx-mid)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Low Token Mode</span>
          <Toggle on={lowMode} onChange={(v) => { setLowMode(v); if (v) { setProfile("lowtoken"); toast("Low Token Mode on — saving 41.5k tokens", "success"); } else toast("Low Token Mode off", "info"); }} />
        </div>
      </div>

      {/* budget meter */}
      <div className="card card-pad" style={{ marginBottom: "var(--gap)" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="col" style={{ gap: 2 }}>
            <span className="panel-title">Startup context budget</span>
            <div className="row" style={{ gap: 9, alignItems: "baseline" }}>
              <b className="stat-val tnum" style={{ color: projected > budget * 0.7 ? "var(--r-med)" : "var(--ac)" }}>{fmtTok(projected)}</b>
              <span className="faint">/ {fmtTok(budget)} tokens · {Math.round(projected / budget * 100)}% of budget</span>
              {lowMode && <span className="badge risk-safe"><Icon name="arrowDn" size={11} />−{fmtTok(total - projected)} saved</span>}
            </div>
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 2 }}>
            <span className="faint" style={{ fontSize: 11.5 }}>≈ {(projected / 1000 * 0.003).toFixed(2)}¢ per session start</span>
            <span className="faint" style={{ fontSize: 11.5 }}>warn threshold at {fmtTok(budget * 0.7)}</span>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <Meter value={projected} max={budget} ticks={[70]} height={12} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1.4fr", marginBottom: "var(--gap)" }}>
        {/* donut by category */}
        <div className="card">
          <div className="card-hd"><Icon name="tokens" size={15} style={{ color: "var(--tx-lo)" }} /><h3>By category</h3></div>
          <div className="card-pad row" style={{ gap: 20 }}>
            <Donut data={TOKEN_CATS} size={140} stroke={19} center={<div><div className="stat-val tnum" style={{ fontSize: 22 }}>{fmtTok(total)}</div><div className="stat-lbl">total</div></div>} />
            <div className="col" style={{ gap: 10, flex: 1 }}>
              {TOKEN_CATS.map(c => (
                <div key={c.key} className="row" style={{ gap: 9 }}>
                  <span className="status-dot" style={{ background: c.color, boxShadow: "none" }} />
                  <span style={{ fontSize: 12.5, flex: 1 }} className="muted">{c.label}</span>
                  <b className="mono tnum" style={{ fontSize: 12.5 }}>{fmtTok(c.tokens)}</b>
                  <span className="faint tnum" style={{ fontSize: 11, width: 32, textAlign: "right" }}>{Math.round(c.tokens / total * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* trend */}
        <div className="card">
          <div className="card-hd"><Icon name="history" size={15} style={{ color: "var(--tx-lo)" }} /><h3>12-week trend</h3><span className="sub" style={{ marginLeft: "auto" }}>startup tokens (k)</span></div>
          <div className="card-pad">
            <div className="row" style={{ alignItems: "flex-end", gap: 6, height: 150 }}>
              {TOKEN_TREND.map((v, i) => {
                const h = (v / Math.max(...TOKEN_TREND)) * 100;
                const last = i === TOKEN_TREND.length - 1;
                return <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 6, justifyContent: "flex-end", height: "100%" }}>
                  <div style={{ width: "100%", maxWidth: 26, height: h + "%", borderRadius: "4px 4px 0 0", background: last ? "var(--ac)" : "var(--bg-4)", transition: "height .5s", position: "relative" }} title={v + "k"}>
                    {last && <span className="mono tnum" style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "var(--ac)" }}>{v}k</span>}
                  </div>
                  <span className="faint" style={{ fontSize: 9 }}>{i % 2 === 0 ? "w" + (i + 1) : ""}</span>
                </div>;
              })}
            </div>
            <div className="row" style={{ gap: 7, marginTop: 10, padding: "8px 11px", background: "var(--r-med-bg)", borderRadius: "var(--r-sm)", fontSize: 12 }}>
              <Icon name="arrowUp" size={14} style={{ color: "var(--r-med)" }} /><span><b style={{ color: "var(--r-med)" }}>+47%</b> over 12 weeks — driven by new MCP servers</span>
            </div>
          </div>
        </div>
      </div>

      {/* top consumers + suggestions */}
      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card">
          <div className="card-hd"><Icon name="zap" size={15} style={{ color: "var(--tx-lo)" }} /><h3>Largest consumers</h3><button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={() => toast("Export breakdown", "info")}><Icon name="download" size={13} />Export</button></div>
          <table className="tbl">
            <thead><tr><th>Resource</th><th>Type</th><th>Scope</th><th>Share</th><th>Tokens</th></tr></thead>
            <tbody>
              {TOKEN_TOP.map((r, i) => (
                <tr key={i}>
                  <td><div className="row" style={{ gap: 9 }}>
                    <span className="mono faint" style={{ fontSize: 11, width: 16 }}>{i + 1}</span>
                    <b style={{ fontSize: 12.5 }}>{r.name}</b>
                    {r.note && <span className="badge risk-crit" style={{ fontSize: 9.5 }}>{r.note}</span>}
                  </div></td>
                  <td><span className="badge sq" style={{ fontSize: 10 }}>{r.type}</span></td>
                  <td><ScopeBadge scope={r.scope} icon={false} /></td>
                  <td><div className="row" style={{ gap: 7 }}><div style={{ width: 70 }}><Meter value={r.pct} height={5} tone={r.pct > 85 ? "warn" : ""} /></div></div></td>
                  <td className="mono tnum" style={{ fontSize: 12.5, color: r.tokens > 5000 ? "var(--r-med)" : "var(--tx-hi)" }}>{fmtTok(r.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hd"><Icon name="sparkles" size={15} style={{ color: "var(--ac)" }} /><h3>Optimizations</h3></div>
          <div className="col" style={{ padding: 12, gap: 10 }}>
            <div className="card card-pad" style={{ padding: 13, gap: 8, display: "flex", flexDirection: "column", background: "var(--ac-dim)", border: "1px solid var(--ac-line)" }}>
              <div className="row" style={{ gap: 8 }}><Icon name="compress" size={15} style={{ color: "var(--ac)" }} /><b style={{ fontSize: 13, color: "var(--ac)" }}>Potential savings</b></div>
              <b className="stat-val tnum" style={{ fontSize: 26, color: "var(--ac)" }}>41.5k</b>
              <span className="muted" style={{ fontSize: 12 }}>tokens reclaimable — a 73% lighter startup</span>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 4 }} onClick={() => { setLowMode(true); setProfile("lowtoken"); toast("Applied all optimizations", "success"); }}><Icon name="zap" size={14} />Apply all</button>
            </div>
            {[
              { t: "Trim TradingView tool list", s: "8k", r: "med" },
              { t: "Sandbox Desktop Commander", s: "—", r: "crit" },
              { t: "Dedupe memory files", s: "1.2k", r: "low" },
              { t: "Switch to Low Token profile", s: "17.3k", r: "low" },
            ].map((o, i) => (
              <div key={i} className="row" style={{ gap: 9, fontSize: 12.5 }}>
                <Icon name="check" size={14} style={{ color: "var(--tx-lo)" }} />
                <span className="muted" style={{ flex: 1 }}>{o.t}</span>
                <Badge tone="ac">−{o.s}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* duplicate context warning */}
      <div className="card card-pad row" style={{ gap: 12, marginTop: "var(--gap)", borderLeft: "2px solid var(--r-med)" }}>
        <Icon name="copy" size={18} style={{ color: "var(--r-med)" }} />
        <div className="col" style={{ gap: 1, flex: 1 }}><b style={{ fontSize: 13 }}>Duplicate context detected</b><span className="faint" style={{ fontSize: 12 }}>The “staging DB resets nightly” note appears in both CLAUDE.md files — loaded twice (≈180 tokens).</span></div>
        <button className="btn btn-sm" onClick={() => nav("memory")}>Resolve in Memory</button>
      </div>
    </div>
  );
}

export { TokenUsage };

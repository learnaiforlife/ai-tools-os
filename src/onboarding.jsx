import React from "react";
import { Icon } from "./icons.jsx";
import { RiskBadge, Toggle } from "./ui.jsx";

/* onboarding.jsx — first-run onboarding flow */
const { useState: obS } = React;

const STEPS = [
  {
    key: "welcome", icon: "layers", title: "Welcome to AI Tools OS",
    sub: "One calm command center for every AI resource on your machine — skills, MCP servers, memory, configs and tools. Local-first and safe by default.",
  },
  {
    key: "scan", icon: "refresh", title: "We scanned your machine",
    sub: "Here's what we found across your user, project and workspace scopes. Nothing was changed.",
  },
  {
    key: "scope", icon: "scope", title: "Pick your default scope",
    sub: "Resources live at three levels. You can switch anytime from the sidebar.",
  },
  {
    key: "safety", icon: "shield", title: "We flagged 2 risks",
    sub: "A couple of resources can run shell commands and reach the network unsandboxed. Want us to disable them for now?",
  },
  {
    key: "done", icon: "sparkles", title: "You're all set",
    sub: "Jump into the dashboard, or press ⌘K anytime to search resources and run commands.",
  },
];

function Onboarding({ onFinish, onSkip, nav, setProfile }) {
  const [i, setI] = obS(0);
  const [scope, setScope] = obS("project");
  const [disableRisky, setDisableRisky] = obS(true);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="modal-wrap" style={{ alignItems: "center" }}>
      <div className="scrim" />
      <div className="modal" style={{ width: 540 }}>
        {/* header band */}
        <div style={{ padding: "26px 28px 20px", background: "radial-gradient(500px 200px at 80% -40%, var(--ac-dim), transparent)", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
            <div className="brand-mark" style={{ width: 34, height: 34, borderRadius: 9 }}><Icon name="layers" size={19} sw={2} /></div>
            <div className="row" style={{ gap: 6 }}>
              {STEPS.map((s, idx) => <span key={idx} style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 8, background: idx === i ? "var(--ac)" : idx < i ? "var(--ac-2)" : "var(--bg-4)", transition: ".25s" }} />)}
            </div>
          </div>
          <div className="row" style={{ gap: 13 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center", flex: "none", border: "1px solid var(--ac-line)" }}><Icon name={step.icon} size={22} /></span>
            <div className="col" style={{ gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 19, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{step.title}</h2>
            </div>
          </div>
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{step.sub}</p>
        </div>

        {/* body per step */}
        <div style={{ padding: 24, minHeight: 150 }}>
          {step.key === "welcome" && (
            <div className="grid g-2" style={{ gap: 10 }}>
              {[["skill", "Skills", "10 found"], ["mcp", "MCP servers", "9 found"], ["memory", "Memory files", "6 found"], ["tools", "External tools", "6 installed"]].map(([ic, l, n]) => (
                <div key={l} className="row" style={{ gap: 10, padding: 12, background: "var(--bg-1)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-3)", color: "var(--ac)", display: "grid", placeItems: "center" }}><Icon name={ic} size={15} /></span>
                  <div className="col" style={{ gap: 0, minWidth: 0 }}><b style={{ fontSize: 13, whiteSpace: "nowrap" }}>{l}</b><span className="faint" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{n}</span></div>
                </div>
              ))}
            </div>
          )}
          {step.key === "scan" && (
            <div className="col" style={{ gap: 9 }}>
              {[["Resources indexed", "30", "var(--ac)"], ["Startup tokens loaded", "55.7k", "var(--r-med)"], ["Healthy resources", "26", "var(--ac)"], ["Need attention", "4", "var(--r-high)"]].map(([l, v, c]) => (
                <div key={l} className="row" style={{ gap: 10, justifyContent: "space-between", padding: "10px 13px", background: "var(--bg-1)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                  <span className="muted" style={{ fontSize: 13 }}>{l}</span><b className="tnum" style={{ fontSize: 15, color: c }}>{v}</b>
                </div>
              ))}
            </div>
          )}
          {step.key === "scope" && (
            <div className="col" style={{ gap: 9 }}>
              {[["user", "User", "Applies everywhere on this machine", "sc-user"], ["project", "Project", "Just this repo — recommended", "sc-project"], ["workspace", "Workspace", "Shared with your team", "sc-workspace"]].map(([id, l, d]) => (
                <button key={id} className="row" onClick={() => setScope(id)} style={{ gap: 11, padding: 13, textAlign: "left", background: scope === id ? "var(--ac-dim)" : "var(--bg-1)", border: "1px solid " + (scope === id ? "var(--ac-line)" : "var(--line)"), borderRadius: "var(--r-sm)", cursor: "pointer", color: "inherit" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, border: "2px solid " + (scope === id ? "var(--ac)" : "var(--line-3)"), display: "grid", placeItems: "center", flex: "none" }}>{scope === id && <span style={{ width: 8, height: 8, borderRadius: 5, background: "var(--ac)" }} />}</span>
                  <div className="col" style={{ gap: 1 }}><b style={{ fontSize: 13.5 }}>{l}</b><span className="faint" style={{ fontSize: 11.5 }}>{d}</span></div>
                </button>
              ))}
            </div>
          )}
          {step.key === "safety" && (
            <div className="col" style={{ gap: 10 }}>
              {[["Desktop Commander MCP", "shell + full-filesystem access"], ["Deploy Runbook", "executes shell, broken reference"]].map(([n, d]) => (
                <div key={n} className="row" style={{ gap: 11, padding: 13, background: "var(--r-crit-bg)", border: "1px solid rgba(255,93,108,0.22)", borderRadius: "var(--r-sm)" }}>
                  <Icon name="alert" size={18} style={{ color: "var(--r-crit)" }} />
                  <div className="col" style={{ gap: 1, flex: 1 }}><b style={{ fontSize: 13 }}>{n}</b><span className="faint" style={{ fontSize: 11.5 }}>{d}</span></div>
                  <RiskBadge risk="crit" dot={false} />
                </div>
              ))}
              <label className="row" style={{ gap: 10, padding: "11px 13px", background: "var(--bg-1)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", cursor: "pointer" }}>
                <Toggle on={disableRisky} onChange={setDisableRisky} />
                <span style={{ fontSize: 13 }}>Disable these until I review them</span>
              </label>
            </div>
          )}
          {step.key === "done" && (
            <div className="col" style={{ gap: 12, alignItems: "center", textAlign: "center", padding: "10px 0" }}>
              <div className="row" style={{ gap: 10 }}>
                {[["dashboard", "Dashboard"], ["command", "⌘K palette"], ["shield", "Security"]].map(([ic, l]) => (
                  <div key={l} className="col" style={{ gap: 7, alignItems: "center", padding: "14px 18px", background: "var(--bg-1)", borderRadius: "var(--r-md)", border: "1px solid var(--line)" }}>
                    <Icon name={ic} size={20} style={{ color: "var(--ac)" }} /><span className="faint" style={{ fontSize: 11.5 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="row" style={{ padding: "14px 24px", borderTop: "1px solid var(--line)", gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={onSkip}>Skip tour</button>
          <div className="spacer" style={{ flex: 1 }} />
          {i > 0 && <button className="btn btn-sm" onClick={() => setI(i - 1)}><Icon name="chevL" size={14} />Back</button>}
          <button className="btn btn-primary btn-sm" onClick={() => { if (last) { if (disableRisky) setProfile("minimal"); onFinish(); } else setI(i + 1); }}>
            {last ? <><Icon name="check" size={15} />Enter AI Tools OS</> : <>Continue<Icon name="chevR" size={14} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

export { Onboarding };

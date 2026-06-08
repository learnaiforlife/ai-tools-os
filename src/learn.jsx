import React from "react";
import { Icon } from "./icons.jsx";
import { BEST_PRACTICES, TUTORIALS, TUTORIAL_STEPS } from "./data2.jsx";
import { HealthRing, Meter } from "./ui.jsx";

/* learn.jsx — Best Practices + Tutorial */
const { useState: lnS } = React;

/* ---------------- BEST PRACTICES ---------------- */
function BestPractices({ toast, nav }) {
  const all = BEST_PRACTICES.flatMap(t => t.items);
  const applied = all.filter(i => i.status === "applied").length;
  const partial = all.filter(i => i.status === "partial").length;
  const missing = all.filter(i => i.status === "missing").length;
  const score = Math.round((applied + partial * 0.5) / all.length * 100);

  const statusMeta = {
    applied: { ic: "check", c: "var(--ac)", bg: "var(--ac-dim)", label: "Following" },
    partial: { ic: "warn", c: "var(--r-med)", bg: "var(--r-med-bg)", label: "Partial" },
    missing: { ic: "x", c: "var(--r-crit)", bg: "var(--r-crit-bg)", label: "Not yet" },
  };

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page-head">
        <div><h1>Best Practices</h1><div className="ph-sub">How your workspace measures against {all.length} recommended practices — audited live</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => toast("Re-auditing workspace…", "info")}><Icon name="refresh" size={15} />Re-audit</button>
      </div>

      {/* scorecard */}
      <div className="card card-pad row" style={{ gap: 24, marginBottom: "var(--gap)", flexWrap: "wrap" }}>
        <HealthRing value={score} size={96} stroke={9} />
        <div className="col" style={{ gap: 4 }}>
          <span className="stat-lbl">Workspace practice score</span>
          <b style={{ fontSize: 17 }}>{score >= 80 ? "Strong" : score >= 60 ? "Room to improve" : "Needs work"}</b>
          <span className="faint" style={{ fontSize: 12.5, maxWidth: 320 }}>Resolve the {missing} unmet practices to harden your setup and cut token waste.</span>
        </div>
        <div className="row" style={{ gap: 22, marginLeft: "auto" }}>
          {[["Following", applied, "var(--ac)"], ["Partial", partial, "var(--r-med)"], ["Not yet", missing, "var(--r-crit)"]].map(([l, n, c]) => (
            <div key={l} className="col" style={{ gap: 3, alignItems: "center" }}>
              <b className="stat-val tnum" style={{ fontSize: 26, color: c }}>{n}</b>
              <span className="stat-lbl" style={{ fontSize: 10.5 }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g-2">
        {BEST_PRACTICES.map(topic => (
          <div key={topic.topic} className="card">
            <div className="card-hd">
              <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg-3)", color: "var(--ac)", display: "grid", placeItems: "center" }}><Icon name={topic.icon} size={15} /></span>
              <h3>{topic.topic}</h3>
              <span className="faint" style={{ fontSize: 11.5, marginLeft: "auto" }}>{topic.items.filter(i => i.status === "applied").length}/{topic.items.length} met</span>
            </div>
            <div className="col" style={{ padding: "6px 0" }}>
              {topic.items.map((it, i) => {
                const m = statusMeta[it.status];
                return (
                  <div key={i} className="row" style={{ gap: 11, padding: "11px 15px", alignItems: "flex-start" }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", flex: "none", background: m.bg, color: m.c, marginTop: 1 }}><Icon name={m.ic} size={13} /></span>
                    <div className="col" style={{ gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</span>
                      <span className="faint" style={{ fontSize: 11.5 }}>{it.detail}</span>
                    </div>
                    {it.status !== "applied" && <button className="btn btn-sm" style={{ padding: "4px 9px", flex: "none" }} onClick={() => { toast("Opening fix for: " + it.title, "info"); }}>Fix</button>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- TUTORIAL ---------------- */
function Tutorial({ toast, nav }) {
  const [active, setActive] = lnS(null);
  const featured = TUTORIALS.find(t => t.featured);
  const rest = TUTORIALS.filter(t => !t.featured);
  const cur = TUTORIALS.find(t => t.id === active);
  const overall = Math.round(TUTORIALS.reduce((a, t) => a + t.progress, 0) / TUTORIALS.length);

  if (cur) return <TutorialDetail tut={cur} onBack={() => setActive(null)} toast={toast} nav={nav} />;

  const levelColor = { "Start here": "var(--ac)", Beginner: "#5b9dff", Intermediate: "#b79bff" };

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page-head">
        <div><h1>Tutorial</h1><div className="ph-sub">Guided lessons to master your AI workspace · {overall}% of all lessons complete</div></div>
        <div className="spacer" />
        <div className="row" style={{ gap: 10, padding: "7px 13px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
          <div style={{ width: 120 }}><Meter value={overall} height={6} /></div>
          <b className="tnum" style={{ fontSize: 12.5, color: "var(--ac)" }}>{overall}%</b>
        </div>
      </div>

      {/* featured path */}
      {featured && (
        <div className="card card-pad" style={{ marginBottom: "var(--gap)", display: "flex", gap: 20, alignItems: "center", background: "linear-gradient(120deg, var(--ac-dim), transparent 70%)", borderColor: "var(--ac-line)", flexWrap: "wrap" }}>
          <span style={{ width: 56, height: 56, borderRadius: 14, background: "var(--ac)", color: "#04140e", display: "grid", placeItems: "center", flex: "none" }}><Icon name="sparkles" size={28} /></span>
          <div className="col" style={{ gap: 4, flex: 1, minWidth: 220 }}>
            <span className="badge sq" style={{ alignSelf: "flex-start", color: "var(--ac)", borderColor: "var(--ac-line)", background: "var(--ac-dim)" }}>{featured.level}</span>
            <b style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{featured.title}</b>
            <span className="muted" style={{ fontSize: 13 }}>{featured.desc}</span>
          </div>
          <div className="col" style={{ gap: 10, alignItems: "flex-end" }}>
            <span className="faint" style={{ fontSize: 12 }}><Icon name="clock" size={12} style={{ verticalAlign: "-2px" }} /> {featured.mins} min · {featured.steps} steps</span>
            <button className="btn btn-primary" onClick={() => setActive(featured.id)}>{featured.progress === 100 ? <><Icon name="restart" size={15} />Replay</> : featured.progress > 0 ? <><Icon name="play" size={15} fill />Resume</> : <><Icon name="play" size={15} fill />Start</>}</button>
          </div>
        </div>
      )}

      <div className="grid g-3">
        {rest.map(t => (
          <div key={t.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12, cursor: "pointer" }} onClick={() => setActive(t.id)}>
            <div className="row" style={{ gap: 11 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--tx-mid)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={t.icon} size={19} /></span>
              <div className="col" style={{ gap: 2, flex: 1 }}>
                <span className="badge sq" style={{ alignSelf: "flex-start", fontSize: 10, color: levelColor[t.level], borderColor: levelColor[t.level] + "55", background: levelColor[t.level] + "1a" }}>{t.level}</span>
              </div>
              {t.progress === 100 ? <span className="badge risk-safe"><Icon name="check" size={11} />Done</span> : t.progress > 0 ? <HealthRing value={t.progress} size={34} stroke={3.5} label="" /> : null}
            </div>
            <b style={{ fontSize: 14.5 }}>{t.title}</b>
            <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>{t.desc}</p>
            {t.progress > 0 && t.progress < 100 && <Meter value={t.progress} height={4} />}
            <div className="row" style={{ paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 11.5 }}>
              <span className="faint"><Icon name="clock" size={12} style={{ verticalAlign: "-2px" }} /> {t.mins} min · {t.steps} steps</span>
              <span className="row" style={{ gap: 5, marginLeft: "auto", color: "var(--ac)", fontWeight: 600 }}>{t.progress > 0 ? "Resume" : "Start"}<Icon name="arrowR" size={13} /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorialDetail({ tut, onBack, toast, nav }) {
  const [steps, setSteps] = lnS(TUTORIAL_STEPS.map(s => ({ ...s })));
  const done = steps.filter(s => s.done).length;
  const pct = Math.round(done / steps.length * 100);
  const toggle = (i) => setSteps(s => s.map((x, idx) => idx === i ? { ...x, done: !x.done } : x));

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevL" size={15} />Tutorials</button>
      </div>
      <div className="row" style={{ gap: 14, marginBottom: 20 }}>
        <span style={{ width: 48, height: 48, borderRadius: 12, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={tut.icon} size={24} /></span>
        <div className="col" style={{ gap: 3 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{tut.title}</h1>
          <span className="muted" style={{ fontSize: 13 }}>{tut.desc}</span>
        </div>
      </div>

      <div className="card card-pad row" style={{ gap: 14, marginBottom: "var(--gap)" }}>
        <span className="faint" style={{ fontSize: 12.5 }}>{done} of {steps.length} steps</span>
        <div style={{ flex: 1 }}><Meter value={pct} height={7} /></div>
        <b className="tnum" style={{ color: "var(--ac)", fontSize: 13 }}>{pct}%</b>
      </div>

      <div className="card">
        <div className="col" style={{ padding: "6px 0" }}>
          {steps.map((s, i) => (
            <div key={i} className="row" style={{ gap: 13, padding: "14px 18px", borderBottom: i < steps.length - 1 ? "1px solid var(--line)" : 0, alignItems: "flex-start" }}>
              <button onClick={() => toggle(i)} style={{ width: 24, height: 24, borderRadius: 7, flex: "none", marginTop: 1, cursor: "pointer", display: "grid", placeItems: "center", background: s.done ? "var(--ac)" : "transparent", border: "1.5px solid " + (s.done ? "var(--ac)" : "var(--line-3)"), color: "#04140e" }}>{s.done && <Icon name="check" size={14} />}</button>
              <div className="col" style={{ gap: 2, flex: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: s.done ? "none" : "none", color: s.done ? "var(--tx-mid)" : "var(--tx-hi)" }}>{i + 1}. {s.t}</span>
                <span className="faint" style={{ fontSize: 12 }}>{s.d}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={onBack}>Back to lessons</button>
        <button className="btn btn-primary" onClick={() => { if (pct === 100) { toast("Lesson complete — nice work!", "success"); onBack(); } else { setSteps(s => s.map(x => ({ ...x, done: true }))); toast("Marked all steps done", "success"); } }}>{pct === 100 ? <><Icon name="check" size={15} />Finish lesson</> : "Complete all steps"}</button>
      </div>
    </div>
  );
}

export { BestPractices, Tutorial };

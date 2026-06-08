import React from "react";
import { Icon } from "./icons.jsx";
import { SKILLS, fmtTok, riskColor } from "./data.jsx";
import { Search, Toggle, RiskBadge, ScopeBadge, Meter, ActionMenu, Code, HealthRing } from "./ui.jsx";

/* skills.jsx — Skills list, editor, testing playground */
const { useState: sS, useMemo: sM, useEffect: sE } = React;

// Map a real skill from /api/skills into the shape this screen expects,
// filling the demo-only fields (version/deps/trigger/etc.) with safe defaults.
function _mkSkill(s, enabled) {
  const tokens = Math.max(200, Math.min(4000, Math.round((s.body || "").length / 4 / 100) * 100));
  return {
    id: s.dir, dir: s.dir, name: s.name, desc: s.description || "No description.",
    scope: "user", enabled, status: "valid", risk: "low",
    tokens, trigger: 80, path: "~/.claude/skills/" + s.dir + "/SKILL.md",
    updated: "on disk", version: "v1", deps: [], triggers: [], body: s.body || "",
  };
}

const SKILL_MD = `---
name: PDF Extractor
description: Extracts text, tables, and metadata from PDF files
triggers: [read pdf, extract from document, parse invoice]
scope: user
risk: low
allowed-tools: [Read, Bash(pdfplumber)]
---

# PDF Extractor

Use this skill when the user wants to pull structured content
out of a PDF document.

## Steps
1. Resolve the file path and verify it exists.
2. Run \`pdfplumber\` to extract text and tables.
3. Return clean Markdown with tables preserved.

## Notes
- Falls back to MarkItDown for scanned PDFs.
- Never send file contents to a network tool.`;

function SkillsList({ nav, toast, onOpen, onPlayground, share }) {
  const [q, setQ] = sS("");
  const [viewMode, setViewMode] = sS("table");
  const [groupBy, setGroupBy] = sS("none");
  const [scopeF, setScopeF] = sS("all");
  const [statusF, setStatusF] = sS("all");
  const [sort, setSort] = sS({ k: "name", dir: 1 });
  const [data, setData] = sS([]);

  // Load the real skills from ~/.claude/skills via the bridge.
  sE(() => {
    fetch("/api/skills").then(r => r.json()).then(j => {
      if (!j || !j.ok) return;
      setData([...(j.enabled || []).map(s => _mkSkill(s, true)), ...(j.disabled || []).map(s => _mkSkill(s, false))]);
    }).catch(() => {});
  }, []);

  // Real persistence: disable parks the skill dir out of ~/.claude/skills; enable restores it.
  const toggle = async (id) => {
    const s = data.find(x => x.id === id); if (!s) return;
    const off = s.enabled;
    setData(d => d.map(x => x.id === id ? { ...x, enabled: !off } : x));
    try {
      const r = await fetch(`/api/skills/${off ? "disable" : "enable"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: s.dir }) });
      const j = await r.json(); if (!j.ok) throw new Error(j.error || "failed");
      toast(off ? `${s.name} disabled — moved out of ~/.claude/skills (new sessions won't load it)` : `${s.name} enabled — restored to ~/.claude/skills`, off ? "warn" : "success");
    } catch (e) {
      setData(d => d.map(x => x.id === id ? { ...x, enabled: off } : x));
      toast(`Couldn't ${off ? "disable" : "enable"} ${s.name}: ${e.message}`, "error");
    }
  };

  const filtered = sM(() => {
    let r = data.filter(s =>
      (scopeF === "all" || s.scope === scopeF) &&
      (statusF === "all" || s.status === statusF) &&
      (s.name + s.desc).toLowerCase().includes(q.toLowerCase()));
    r.sort((a, b) => { const v = typeof a[sort.k] === "string" ? a[sort.k].localeCompare(b[sort.k]) : a[sort.k] - b[sort.k]; return v * sort.dir; });
    return r;
  }, [data, q, scopeF, statusF, sort]);

  const statusBadge = (s) => ({
    valid: <span className="badge risk-safe"><Icon name="check" size={12} />Valid</span>,
    warn: <span className="badge risk-med"><Icon name="warn" size={12} />Warning</span>,
    broken: <span className="badge risk-crit"><Icon name="x" size={12} />Broken</span>,
  }[s.status]);

  const grouped = sM(() => {
    if (groupBy === "none") return [{ name: null, items: filtered }];
    const map = {};
    filtered.forEach(s => { const k = s[groupBy]; (map[k] = map[k] || []).push(s); });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, [filtered, groupBy]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Skills</h1><div className="ph-sub">{data.filter(s => s.enabled).length} of {data.length} enabled · {data.reduce((a, s) => a + (s.enabled ? s.tokens : 0), 0).toLocaleString()} tokens loaded</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onPlayground}><Icon name="flask" size={15} />Playground</button>
        <button className="btn btn-sm" onClick={() => toast("Validating 10 skills…", "info")}><Icon name="check" size={15} />Validate all</button>
        <button className="btn btn-primary btn-sm" onClick={() => data[0] ? onOpen(data[0], true) : toast("Loading skills…", "info")}><Icon name="plus" size={15} />New skill</button>
      </div>

      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search skills…" width={260} />
        <div className="seg">
          {["all", "user", "project", "workspace"].map(s => <button key={s} data-on={scopeF === s} onClick={() => setScopeF(s)} style={{ textTransform: "capitalize" }}>{s}</button>)}
        </div>
        <select className="chip" value={statusF} onChange={e => setStatusF(e.target.value)} style={{ appearance: "auto" }}>
          <option value="all">All statuses</option><option value="valid">Valid</option><option value="warn">Warning</option><option value="broken">Broken</option>
        </select>
        <select className="chip" value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ appearance: "auto" }}>
          <option value="none">No grouping</option><option value="scope">Group: scope</option><option value="status">Group: status</option><option value="risk">Group: risk</option>
        </select>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="seg">
          <button data-on={viewMode === "table"} onClick={() => setViewMode("table")}><Icon name="list" size={15} /></button>
          <button data-on={viewMode === "card"} onClick={() => setViewMode("card")}><Icon name="grid" size={15} /></button>
          <button data-on={viewMode === "graph"} onClick={() => setViewMode("graph")}><Icon name="graph" size={15} /></button>
        </div>
      </div>

      {viewMode === "graph" ? <SkillGraph data={filtered} onOpen={onOpen} />
        : viewMode === "card" ? (
        <div className="grid g-3">
          {filtered.map(s => (
            <div key={s.id} className="card card-pad" style={{ cursor: "pointer", gap: 11, display: "flex", flexDirection: "column" }} onClick={() => onOpen(s)}>
              <div className="row" style={{ gap: 9 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center" }}><Icon name="skill" size={17} /></span>
                <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                  <span className="mono faint" style={{ fontSize: 10.5 }}>{s.version} · {s.updated}</span>
                </div>
                <Toggle on={s.enabled} onChange={() => toggle(s.id)} />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, minHeight: 36 }}>{s.desc}</p>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{statusBadge(s)}<RiskBadge risk={s.risk} /><ScopeBadge scope={s.scope} icon={false} /></div>
              <div className="row" style={{ gap: 12, fontSize: 11.5, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
                <span className="row" style={{ gap: 5 }}><Icon name="tokens" size={13} style={{ color: "var(--tx-lo)" }} /><b className="tnum">{fmtTok(s.tokens)}</b></span>
                <span className="row" style={{ gap: 5 }}><Icon name="zap" size={13} style={{ color: "var(--tx-lo)" }} />trigger <b className="tnum">{s.trigger}%</b></span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {grouped.map(g => (
            <div key={g.name || "all"}>
              {g.name && <div className="row" style={{ padding: "9px 14px", background: "var(--bg-1)", borderBottom: "1px solid var(--line)", fontSize: 11.5, fontWeight: 700, textTransform: "capitalize", color: "var(--tx-mid)" }}>{g.name} <span className="ni-badge" style={{ marginLeft: 8 }}>{g.items.length}</span></div>}
              <table className="tbl">
                {!g.name && <thead><tr>
                  {[["name", "Skill"], ["scope", "Scope"], ["status", "Status"], ["risk", "Risk"], ["trigger", "Trigger"], ["tokens", "Tokens"], ["updated", "Updated"]].map(([k, l]) =>
                    <th key={k} onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : 1 }))}>{l}{sort.k === k && <Icon name={sort.dir > 0 ? "chevUp" : "chevD"} size={11} style={{ display: "inline", marginLeft: 3, verticalAlign: "middle" }} />}</th>)}
                  <th style={{ width: 90 }}></th>
                </tr></thead>}
                <tbody>
                  {g.items.map(s => (
                    <tr key={s.id} onClick={() => onOpen(s)}>
                      <td><div className="row" style={{ gap: 9 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="skill" size={14} /></span>
                        <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 13 }}>{s.name}</b><span className="mono faint" style={{ fontSize: 10.5 }}>{s.path}</span></div>
                      </div></td>
                      <td><ScopeBadge scope={s.scope} icon={false} /></td>
                      <td>{statusBadge(s)}</td>
                      <td><RiskBadge risk={s.risk} /></td>
                      <td><div className="row" style={{ gap: 7 }}><div style={{ width: 44 }}><Meter value={s.trigger} height={5} tone={s.trigger < 60 ? "warn" : ""} /></div><span className="tnum faint" style={{ fontSize: 11.5 }}>{s.trigger}%</span></div></td>
                      <td className="mono tnum" style={{ fontSize: 12.5 }}>{fmtTok(s.tokens)}</td>
                      <td className="faint" style={{ fontSize: 12 }}>{s.updated}</td>
                      <td><div className="row" style={{ gap: 4, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                        <Toggle on={s.enabled} onChange={() => toggle(s.id)} />
                        <ActionMenu items={[
                          { icon: "edit", label: "Edit", onClick: () => onOpen(s) },
                          { icon: "flask", label: "Test in playground", onClick: onPlayground },
                          { icon: "copy", label: "Duplicate", onClick: () => toast("Duplicated " + s.name) },
                          { icon: "link", label: "Share…", onClick: () => share && share({ kind: "skill", name: s.name, scope: s.scope, vendor: "acme" }) },
                          { icon: "arrowR", label: "Move scope…", onClick: () => toast("Move " + s.name + " scope", "info") },
                          { sep: true },
                          { icon: "trash", label: "Delete", danger: true, onClick: () => toast("Deleted " + s.name, "error") },
                        ]} />
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillGraph({ data, onOpen }) {
  // simple radial dependency layout
  const cx = 430, cy = 230, R = 165;
  const nodes = data.map((s, i) => { const a = (i / data.length) * Math.PI * 2 - Math.PI / 2; return { ...s, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; });
  const hub = { x: cx, y: cy };
  return (
    <div className="card" style={{ padding: 18, overflow: "hidden" }}>
      <div className="row" style={{ marginBottom: 6 }}><span className="panel-title">Dependency Graph</span><span className="faint" style={{ fontSize: 11.5, marginLeft: 10 }}>skills linked to shared MCPs & tools</span></div>
      <svg width="100%" viewBox="0 0 860 460" style={{ display: "block" }}>
        {nodes.map(n => <line key={"l" + n.id} x1={hub.x} y1={hub.y} x2={n.x} y2={n.y} stroke="var(--line-2)" strokeWidth="1" />)}
        <circle cx={hub.x} cy={hub.y} r="34" fill="var(--bg-3)" stroke="var(--ac-line)" />
        <text x={hub.x} y={hub.y + 4} textAnchor="middle" fill="var(--ac)" fontSize="12" fontWeight="700" fontFamily="var(--mono)">core</text>
        {nodes.map(n => (
          <g key={n.id} style={{ cursor: "pointer" }} onClick={() => onOpen(n)}>
            <circle cx={n.x} cy={n.y} r="26" fill="var(--bg-2)" stroke={riskColor(n.risk)} strokeWidth="1.5" opacity={n.enabled ? 1 : 0.4} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill="var(--tx-hi)" fontSize="10" fontWeight="600">{n.name.split(" ")[0]}</text>
            <text x={n.x} y={n.y + 42} textAnchor="middle" fill="var(--tx-lo)" fontSize="9" fontFamily="var(--mono)">{fmtTok(n.tokens)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SkillEditor({ skill, onBack, toast }) {
  const [tab, setTab] = sS("editor");
  const [code, setCode] = sS(SKILL_MD);
  const [dirty, setDirty] = sS(false);
  const valid = skill.status !== "broken";

  return (
    <div className="col" style={{ height: "100%" }}>
      {/* editor topbar */}
      <div className="row" style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", gap: 12, background: "var(--bg-1)" }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevL" size={15} />Skills</button>
        <div className="row" style={{ gap: 9 }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center" }}><Icon name="skill" size={15} /></span>
          <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>{skill.name}</b><span className="mono faint" style={{ fontSize: 10.5 }}>{skill.path}</span></div>
        </div>
        <ScopeBadge scope={skill.scope} icon={false} />
        {dirty && <span className="badge risk-med"><span className="dot" style={{ background: "var(--r-med)" }} />Unsaved</span>}
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" onClick={() => { setCode(SKILL_MD); setDirty(false); toast("Reverted changes", "info"); }} disabled={!dirty}><Icon name="restart" size={14} />Revert</button>
        <button className="btn btn-primary btn-sm" onClick={() => { setDirty(false); toast("Saved " + skill.name + " · v" + (parseInt(skill.version.slice(1)) + 1), "success"); }} disabled={!dirty}><Icon name="check" size={14} />Save</button>
      </div>

      <div className="row" style={{ padding: "0 22px", borderBottom: "1px solid var(--line)", gap: 4, background: "var(--bg-1)" }}>
        {[["editor", "Editor", "edit"], ["preview", "Preview", "eye"], ["validate", "Validation", "check"], ["history", "History", "history"]].map(([id, l, ic]) => (
          <button key={id} className="btn-ghost" onClick={() => setTab(id)} style={{ padding: "11px 12px", border: 0, background: "none", color: tab === id ? "var(--tx-hi)" : "var(--tx-mid)", borderBottom: tab === id ? "2px solid var(--ac)" : "2px solid transparent", borderRadius: 0, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={ic} size={14} />{l}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "editor" && (
          <div className="split" style={{ height: "100%" }}>
            <div className="col" style={{ overflow: "hidden" }}>
              <div className="row" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", gap: 8 }}>
                <Icon name="edit" size={13} style={{ color: "var(--tx-lo)" }} /><span className="panel-title">SKILL.md</span>
                <span className="mono faint" style={{ marginLeft: "auto", fontSize: 11 }}>markdown + frontmatter</span>
              </div>
              <textarea value={code} onChange={e => { setCode(e.target.value); setDirty(true); }} spellCheck={false}
                style={{ flex: 1, resize: "none", background: "var(--bg-inset)", border: 0, outline: 0, color: "var(--code-tx)", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.7, padding: "14px 18px" }} />
            </div>
            <div className="col split-sep" style={{ overflow: "hidden" }}>
              <div className="row" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", gap: 8 }}>
                <Icon name="sliders" size={13} style={{ color: "var(--tx-lo)" }} /><span className="panel-title">Frontmatter</span>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
                <FrontmatterEditor skill={skill} onChange={() => setDirty(true)} />
              </div>
            </div>
          </div>
        )}
        {tab === "preview" && <div style={{ padding: 26, overflow: "auto", height: "100%", maxWidth: 760 }}><Code code={code} lang="md" /></div>}
        {tab === "validate" && <ValidationPane skill={skill} />}
        {tab === "history" && <HistoryPane skill={skill} toast={toast} />}
      </div>
    </div>
  );
}

function FrontmatterEditor({ skill, onChange }) {
  const Row = ({ label, children }) => <div className="col" style={{ gap: 5, marginBottom: 14 }}><label className="panel-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 11.5 }}>{label}</label>{children}</div>;
  return (
    <div>
      <Row label="Name"><div className="field-input"><input defaultValue={skill.name} onChange={onChange} /></div></Row>
      <Row label="Description"><div className="field-input"><input defaultValue={skill.desc} onChange={onChange} /></div></Row>
      <Row label="Trigger phrases">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {skill.triggers.map(t => <span key={t} className="chip" data-on="true">{t}<span className="x"><Icon name="x" size={12} /></span></span>)}
          <button className="chip" onClick={onChange}><Icon name="plus" size={12} />add</button>
        </div>
      </Row>
      <div className="g-2 grid">
        <Row label="Scope"><select className="field-input" style={{ appearance: "auto", color: "var(--tx-hi)" }} defaultValue={skill.scope} onChange={onChange}><option>user</option><option>project</option><option>workspace</option></select></Row>
        <Row label="Risk"><select className="field-input" style={{ appearance: "auto", color: "var(--tx-hi)" }} defaultValue={skill.risk} onChange={onChange}><option>safe</option><option>low</option><option>med</option><option>high</option></select></Row>
      </div>
      <Row label="Allowed tools">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {["Read", "Bash(pdfplumber)", "Write"].map(t => <span key={t} className="chip mono" data-on="true" style={{ fontSize: 11 }}>{t}</span>)}
          <button className="chip" onClick={onChange}><Icon name="plus" size={12} />add</button>
        </div>
      </Row>
      <Row label="Dependencies">
        <div className="col" style={{ gap: 6 }}>
          {skill.deps.length ? skill.deps.map(d => <div key={d} className="row" style={{ gap: 8, padding: "7px 10px", background: "var(--bg-0)", borderRadius: 6, border: "1px solid var(--line)" }}><Icon name="check" size={13} style={{ color: "var(--ac)" }} /><span className="mono" style={{ fontSize: 12 }}>{d}</span><span className="badge risk-safe" style={{ marginLeft: "auto" }}>resolved</span></div>)
            : <span className="faint" style={{ fontSize: 12 }}>No dependencies</span>}
        </div>
      </Row>
    </div>
  );
}

function ValidationPane({ skill }) {
  const checks = [
    { ok: true, label: "Frontmatter schema", detail: "All required keys present" },
    { ok: true, label: "Trigger quality", detail: skill.trigger + "% — strong, distinct phrases" },
    { ok: skill.status !== "broken", label: "Referenced files exist", detail: skill.status === "broken" ? "Missing: hooks/predeploy.sh" : "All references resolved" },
    { ok: true, label: "Token budget", detail: fmtTok(skill.tokens) + " — within 2k limit" },
    { ok: skill.risk !== "high" && skill.risk !== "crit", label: "Permission scope", detail: skill.risk === "high" ? "Requests shell + aws-cli — review" : "Minimal permissions" },
    { ok: true, label: "No trigger collisions", detail: "Distinct from 9 other skills" },
  ];
  const passed = checks.filter(c => c.ok).length;
  return (
    <div style={{ padding: 26, overflow: "auto", height: "100%", maxWidth: 720 }}>
      <div className="row" style={{ gap: 14, marginBottom: 20 }}>
        <HealthRing value={Math.round(passed / checks.length * 100)} size={64} stroke={6} />
        <div className="col" style={{ gap: 2 }}>
          <b style={{ fontSize: 16 }}>{passed}/{checks.length} checks passed</b>
          <span className="muted" style={{ fontSize: 13 }}>{passed === checks.length ? "This skill is healthy and ready." : "Resolve the failing checks below."}</span>
        </div>
      </div>
      <div className="col" style={{ gap: 9 }}>
        {checks.map((c, i) => (
          <div key={i} className="card card-pad row" style={{ gap: 12, padding: 14 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", flex: "none", background: c.ok ? "var(--ac-dim)" : "var(--r-crit-bg)", color: c.ok ? "var(--ac)" : "var(--r-crit)" }}><Icon name={c.ok ? "check" : "x"} size={15} /></span>
            <div className="col" style={{ gap: 1 }}><b style={{ fontSize: 13 }}>{c.label}</b><span className="faint" style={{ fontSize: 12 }}>{c.detail}</span></div>
            {!c.ok && <button className="btn btn-sm" style={{ marginLeft: "auto" }}>Fix</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPane({ skill, toast }) {
  const versions = [
    { v: skill.version, when: skill.updated, who: "you", msg: "Tightened trigger phrases", cur: true },
    { v: "v" + (parseInt(skill.version.slice(1)) - 1), when: "3d ago", who: "you", msg: "Added MarkItDown fallback" },
    { v: "v" + (parseInt(skill.version.slice(1)) - 2), when: "1w ago", who: "auto", msg: "Token compression −340" },
  ];
  return (
    <div className="split" style={{ height: "100%" }}>
      <div style={{ padding: 22, overflow: "auto" }}>
        <span className="panel-title">Version history</span>
        <div className="col" style={{ gap: 0, marginTop: 14 }}>
          {versions.map((v, i) => (
            <div key={v.v} className="row" style={{ gap: 12, position: "relative", paddingBottom: 18 }}>
              <div className="col" style={{ alignItems: "center" }}>
                <span style={{ width: 12, height: 12, borderRadius: 9, background: v.cur ? "var(--ac)" : "var(--bg-4)", border: "2px solid var(--bg-2)", flex: "none" }} />
                {i !== versions.length - 1 && <span style={{ width: 1, flex: 1, background: "var(--line)" }} />}
              </div>
              <div className="col" style={{ gap: 2, paddingBottom: 4 }}>
                <div className="row" style={{ gap: 8 }}><b className="mono" style={{ fontSize: 13 }}>{v.v}</b>{v.cur && <span className="badge risk-safe">current</span>}</div>
                <span style={{ fontSize: 12.5 }}>{v.msg}</span>
                <span className="faint" style={{ fontSize: 11 }}>{v.who} · {v.when}</span>
                {!v.cur && <div className="row" style={{ gap: 6, marginTop: 4 }}><button className="btn btn-sm" onClick={() => toast("Restored " + v.v, "success")}>Restore</button></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="split-sep col" style={{ overflow: "hidden" }}>
        <div className="row" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", gap: 8 }}><Icon name="split" size={13} style={{ color: "var(--tx-lo)" }} /><span className="panel-title">Diff · {skill.version} vs previous</span></div>
        <div className="code-well" style={{ flex: 1, border: 0, borderRadius: 0 }}>
{`  ---
  name: ${skill.name}
`}<span className="diff-del">- triggers: [read pdf, extract]</span>
<span className="diff-add">+ triggers: [read pdf, extract from document, parse invoice]</span>{`
  scope: ${skill.scope}
  ---

  # ${skill.name}
`}<span className="diff-add">+ ## Notes
+ - Falls back to MarkItDown for scanned PDFs.</span>
        </div>
      </div>
    </div>
  );
}

function Playground({ onBack, toast }) {
  const [prompt, setPrompt] = sS("Pull the line items out of this vendor invoice PDF and total them");
  const [ran, setRan] = sS(true);
  const [running, setRunning] = sS(false);
  const run = () => { setRunning(true); setRan(false); setTimeout(() => { setRunning(false); setRan(true); toast("Trigger evaluation complete", "success"); }, 900); };

  const results = [
    { name: "PDF Extractor", conf: 94, fired: true, why: "Matched “invoice PDF” + intent to extract structured data" },
    { name: "Chart Builder", conf: 38, fired: false, why: "“total them” weakly implies aggregation, but no chart intent" },
    { name: "SQL Explainer", conf: 11, fired: false, why: "No database or query context present" },
    { name: "API Mocker", conf: 4, fired: false, why: "Unrelated trigger surface" },
  ];

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevL" size={15} />Skills</button>
        <div><h1 style={{ fontSize: 20 }}>Skill Testing Playground</h1><div className="ph-sub">See which skill fires for a prompt — and why the others don't</div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--gap)" }}>
        <div className="card">
          <div className="card-hd"><Icon name="terminal" size={15} style={{ color: "var(--tx-lo)" }} /><h3>Test prompt</h3></div>
          <div className="card-pad col" style={{ gap: 12 }}>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              style={{ resize: "vertical", background: "var(--bg-0)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", color: "var(--tx-hi)", fontFamily: "inherit", fontSize: 13.5, padding: "11px 13px", outline: 0, lineHeight: 1.5 }} />
            <div className="row" style={{ gap: 10 }}>
              <div className="col" style={{ gap: 4, flex: 1 }}>
                <label className="panel-title" style={{ textTransform: "none", letterSpacing: 0 }}>Expected skill</label>
                <select className="field-input" style={{ appearance: "auto", color: "var(--tx-hi)" }}><option>PDF Extractor</option>{SKILLS.slice(1).map(s => <option key={s.id}>{s.name}</option>)}</select>
              </div>
              <button className="btn btn-primary" style={{ alignSelf: "flex-end", height: 36 }} onClick={run} disabled={running}>{running ? <><Icon name="refresh" size={15} className="spin" />Running</> : <><Icon name="play" size={15} fill />Run test</>}</button>
            </div>
            <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
              <span className="faint" style={{ fontSize: 11.5 }}>Try:</span>
              {["deploy to production", "explain why this query is slow", "rewrite this in our brand voice"].map(p => <button key={p} className="chip" style={{ fontSize: 11 }} onClick={() => setPrompt(p)}>{p}</button>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><Icon name="zap" size={15} style={{ color: "var(--tx-lo)" }} /><h3>Trigger result</h3>{ran && <span className="badge risk-safe" style={{ marginLeft: "auto" }}><Icon name="check" size={12} />Matched expected</span>}</div>
          <div className="card-pad">
            {running ? <div className="col" style={{ gap: 10 }}>{[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 44 }} />)}</div> :
            <div className="col" style={{ gap: 9 }}>
              {results.map(r => (
                <div key={r.name} className="col" style={{ gap: 6, padding: 11, borderRadius: "var(--r-sm)", background: r.fired ? "var(--ac-dim)" : "var(--bg-0)", border: "1px solid " + (r.fired ? "var(--ac-line)" : "var(--line)") }}>
                  <div className="row" style={{ gap: 9 }}>
                    {r.fired ? <Icon name="check" size={15} style={{ color: "var(--ac)" }} /> : <Icon name="x" size={15} style={{ color: "var(--tx-faint)" }} />}
                    <b style={{ fontSize: 13, color: r.fired ? "var(--ac)" : "var(--tx-mid)" }}>{r.name}</b>
                    <span className="mono tnum" style={{ marginLeft: "auto", fontSize: 12, color: r.fired ? "var(--ac)" : "var(--tx-lo)" }}>{r.conf}%</span>
                  </div>
                  <Meter value={r.conf} height={4} tone={r.fired ? "" : "warn"} />
                  <span className="faint" style={{ fontSize: 11.5 }}>{r.fired ? "✓ " : "✗ "}{r.why}</span>
                </div>
              ))}
            </div>}
          </div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginTop: "var(--gap)" }}>
        <div className="card card-pad">
          <div className="row" style={{ gap: 8, marginBottom: 12 }}><Icon name="sparkles" size={15} style={{ color: "var(--ac)" }} /><b style={{ fontSize: 13 }}>Suggested improvements</b></div>
          <div className="col" style={{ gap: 9 }}>
            {["Add “line items” and “vendor bill” as trigger phrases to lift confidence to ~98%.", "Chart Builder is borderline — add a negative example to reduce false fires.", "Consider splitting table extraction into its own focused skill."].map((s, i) =>
              <div key={i} className="row" style={{ gap: 9, fontSize: 12.5 }}><Icon name="arrowR" size={14} style={{ color: "var(--tx-lo)", marginTop: 2, flex: "none" }} /><span className="muted">{s}</span></div>)}
          </div>
        </div>
        <div className="card card-pad">
          <div className="row" style={{ gap: 8, marginBottom: 12 }}><Icon name="history" size={15} style={{ color: "var(--tx-lo)" }} /><b style={{ fontSize: 13 }}>A/B: v4 vs v3</b><span className="faint" style={{ marginLeft: "auto", fontSize: 11.5 }}>same prompt</span></div>
          <div className="grid g-2" style={{ gap: 10 }}>
            {[["v4 (current)", 94, "var(--ac)"], ["v3", 71, "var(--r-med)"]].map(([l, n, c]) => (
              <div key={l} className="col" style={{ gap: 8, padding: 12, background: "var(--bg-0)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                <span className="faint" style={{ fontSize: 11.5 }}>{l}</span>
                <span className="stat-val" style={{ fontSize: 22, color: c }}>{n}%</span>
                <Meter value={n} height={5} />
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 7, marginTop: 12, padding: "8px 11px", background: "var(--ac-dim)", borderRadius: "var(--r-sm)", fontSize: 12 }}>
            <Icon name="arrowUp" size={14} style={{ color: "var(--ac)" }} /><span><b style={{ color: "var(--ac)" }}>+23%</b> confidence — keep v4</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Skills(props) {
  const [mode, setMode] = sS({ view: "list", skill: null });
  if (mode.view === "editor") return <SkillEditor skill={mode.skill} onBack={() => setMode({ view: "list" })} toast={props.toast} />;
  if (mode.view === "playground") return <Playground onBack={() => setMode({ view: "list" })} toast={props.toast} />;
  return <SkillsList {...props} onOpen={(s) => setMode({ view: "editor", skill: s })} onPlayground={() => setMode({ view: "playground" })} />;
}

export { Skills };

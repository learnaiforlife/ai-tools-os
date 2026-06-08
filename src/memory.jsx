import React from "react";
import { Icon } from "./icons.jsx";
import { MEMORY, fmtTok } from "./data.jsx";
import { Stat, HealthRing, ScopeBadge, ActionMenu, Toggle } from "./ui.jsx";

/* memory.jsx — Memory Manager + smart markdown editor */
const { useState: meS, useEffect: meE } = React;

const MEMORY_MD = `# Project Memory — Acme Platform

## Architecture
- Monorepo: pnpm workspaces, Turborepo for builds.
- Frontend: React 18 + Vite. State via Zustand.
- API: Fastify + Postgres (Drizzle ORM).

## Conventions
- Components are PascalCase, hooks are useCamelCase.
- All async DB calls go through \`db/queries/*\`.
- Never commit directly to \`main\`.

## Gotchas
- The staging DB resets nightly at 03:00 UTC.
- Auth tokens expire after 15m — refresh in middleware.
- Stripe webhooks must be idempotent.

## Decisions
- 2026-05: Moved from REST to tRPC for internal calls.
- 2026-04: Adopted feature flags via LaunchDarkly.`;

function MemoryManager({ toast, openResource }) {
  const [sel, setSel] = meS(null);
  if (sel) return <MemoryEditor mem={sel} onBack={() => setSel(null)} toast={toast} />;

  const totalTok = MEMORY.reduce((a, m) => a + m.tokens, 0);
  const issues = MEMORY.reduce((a, m) => a + m.issues.stale + m.issues.dup + m.issues.contradiction, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Memory</h1><div className="ph-sub">{MEMORY.length} memory files · {fmtTok(totalTok)} tokens · {issues} issues to review</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => toast("Scanning for duplicate sections across files…", "info")}><Icon name="merge" size={15} />Deduplicate</button>
        <button className="btn btn-primary btn-sm" onClick={() => toast("New memory file", "info")}><Icon name="plus" size={15} />New file</button>
      </div>

      <div className="grid g-4" style={{ marginBottom: "var(--gap)" }}>
        <Stat value={fmtTok(totalTok)} label="Total memory tokens" icon="tokens" accent="var(--sc-user)" />
        <Stat value={Math.round(MEMORY.reduce((a, m) => a + m.quality, 0) / MEMORY.length)} label="Avg quality score" icon="sparkles" accent="var(--ac)" />
        <Stat value={MEMORY.reduce((a, m) => a + m.issues.stale, 0)} label="Stale sections" icon="clock" accent="var(--r-med)" />
        <Stat value={MEMORY.reduce((a, m) => a + m.issues.dup, 0)} label="Duplicate blocks" icon="copy" accent="var(--r-high)" />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead><tr><th>File</th><th>Scope</th><th>Quality</th><th>Tokens</th><th>Issues</th><th>Consumers</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {MEMORY.map(m => {
              const iss = m.issues.stale + m.issues.dup + m.issues.contradiction;
              return (
                <tr key={m.id} onClick={() => setSel(m)}>
                  <td><div className="row" style={{ gap: 9 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--bg-3)", color: "var(--sc-user)", display: "grid", placeItems: "center", flex: "none", border: "1px solid var(--line)" }}><Icon name="memory" size={14} /></span>
                    <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 13 }}>{m.name}</b><span className="mono faint" style={{ fontSize: 10.5 }}>{m.path}</span></div>
                  </div></td>
                  <td><ScopeBadge scope={m.scope} icon={false} /></td>
                  <td><div className="row" style={{ gap: 8 }}><HealthRing value={m.quality} size={30} stroke={3.5} label="" /><span className="tnum" style={{ fontSize: 12.5, color: m.quality >= 80 ? "var(--ac)" : m.quality >= 65 ? "var(--r-med)" : "var(--r-crit)" }}>{m.quality}</span></div></td>
                  <td className="mono tnum" style={{ fontSize: 12.5 }}>{fmtTok(m.tokens)}</td>
                  <td>{iss === 0 ? <span className="badge risk-safe"><Icon name="check" size={11} />Clean</span> :
                    <div className="row" style={{ gap: 4 }}>
                      {m.issues.stale > 0 && <span className="badge risk-med" title="stale">{m.issues.stale} stale</span>}
                      {m.issues.dup > 0 && <span className="badge risk-high" title="duplicate">{m.issues.dup} dup</span>}
                      {m.issues.contradiction > 0 && <span className="badge risk-crit" title="contradiction">{m.issues.contradiction} conflict</span>}
                    </div>}
                  </td>
                  <td><div className="row" style={{ gap: 4 }}>{m.consumers.map(c => <span key={c} className="chip" style={{ fontSize: 10, padding: "2px 6px" }}>{c}</span>)}</div></td>
                  <td className="faint" style={{ fontSize: 12 }}>{m.updated}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <ActionMenu items={[
                      { icon: "edit", label: "Edit", onClick: () => setSel(m) },
                      { icon: "sparkles", label: "Improve with AI", onClick: () => toast("Improving " + m.name, "info") },
                      { icon: "compress", label: "Compress", onClick: () => toast("Compressed " + m.name + " −890 tok", "success") },
                      { icon: "split", label: "Split sections", onClick: () => toast("Split " + m.name, "info") },
                      { icon: "merge", label: "Deduplicate", onClick: () => toast("Deduplicated", "success") },
                      { sep: true },
                      { icon: "archive", label: "Archive", onClick: () => toast("Archived " + m.name, "warn") },
                    ]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemoryEditor({ mem, onBack, toast }) {
  const [code, setCode] = meS("");
  const [dirty, setDirty] = meS(false);
  const [meta, setMeta] = meS({ loading: true, exists: false, real: false });
  const tok = Math.round(code.length / 3.6);

  // Load the real file at mem.path through the bridge. Paths outside the allowed
  // roots (~/.claude, project, ~/.aios) fall back to the demo sample.
  meE(() => {
    setMeta({ loading: true, exists: false, real: false });
    fetch("/api/file?path=" + encodeURIComponent(mem.path)).then(r => r.json()).then(j => {
      if (j.ok) { setCode(j.exists ? j.content : ""); setMeta({ loading: false, exists: j.exists, real: true }); }
      else { setCode(MEMORY_MD); setMeta({ loading: false, exists: false, real: false }); }
      setDirty(false);
    }).catch(() => { setCode(MEMORY_MD); setMeta({ loading: false, exists: false, real: false }); });
  }, [mem.path]);

  const save = async () => {
    if (!meta.real) { setDirty(false); toast(`${mem.path} isn't a local file — nothing written (demo entry)`, "warn"); return; }
    try {
      const r = await fetch("/api/file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: mem.path, content: code }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "failed");
      setDirty(false); setMeta(m => ({ ...m, exists: true }));
      toast(`Saved ${mem.name} → ${mem.path} (${j.bytes} bytes, backed up)`, "success");
    } catch (e) { toast(`Save failed: ${e.message}`, "error"); }
  };

  const suggestions = [
    { line: "Gotchas", type: "dup", color: "var(--r-high)", icon: "copy", msg: "“staging DB resets” also appears in user CLAUDE.md", action: "Merge" },
    { line: "Decisions", type: "stale", color: "var(--r-med)", icon: "clock", msg: "tRPC decision is 2 months old — still accurate?", action: "Confirm" },
    { line: "Conventions", type: "token", color: "var(--r-low)", icon: "compress", msg: "This section could be 40% shorter without losing meaning", action: "Compress" },
  ];

  return (
    <div className="col" style={{ height: "100%" }}>
      <div className="row" style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", gap: 12, background: "var(--bg-1)" }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevL" size={15} />Memory</button>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg-3)", color: "var(--sc-user)", display: "grid", placeItems: "center" }}><Icon name="memory" size={15} /></span>
        <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>{mem.name}</b><span className="mono faint" style={{ fontSize: 10.5 }}>{mem.path}</span></div>
        <ScopeBadge scope={mem.scope} icon={false} />
        {meta.real
          ? <span className="badge risk-safe" style={{ fontSize: 10 }}><Icon name="check" size={11} />{meta.exists ? "live file" : "new file"}</span>
          : <span className="badge sq" style={{ fontSize: 10 }}>demo</span>}
        <div className="spacer" style={{ flex: 1 }} />
        <div className="row" style={{ gap: 8, marginRight: 6 }}>
          <span className="faint" style={{ fontSize: 11.5 }}>Tokens</span>
          <b className="mono tnum" style={{ fontSize: 13, color: tok > 3000 ? "var(--r-med)" : "var(--ac)" }}>{tok.toLocaleString()}</b>
          {tok !== mem.tokens && <span className="delta down" style={{ fontSize: 11 }}>{tok < mem.tokens ? "−" : "+"}{Math.abs(tok - mem.tokens)}</span>}
        </div>
        <button className="btn btn-sm" onClick={() => { setCode(c => c); toast("Compressed −24%", "success"); }}><Icon name="compress" size={14} />Compress</button>
        <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}><Icon name="check" size={14} />Save</button>
      </div>

      <div className="split" style={{ flex: 1, overflow: "hidden", gridTemplateColumns: "1.6fr 1fr" }}>
        <div className="col" style={{ overflow: "hidden" }}>
          <div className="row" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", gap: 8 }}>
            <Icon name="edit" size={13} style={{ color: "var(--tx-lo)" }} /><span className="panel-title">Markdown</span>
            <span className="mono faint" style={{ marginLeft: "auto", fontSize: 11 }}>{code.split("\n").length} lines</span>
          </div>
          <textarea value={code} onChange={e => { setCode(e.target.value); setDirty(true); }} spellCheck={false}
            style={{ flex: 1, resize: "none", background: "var(--bg-inset)", border: 0, outline: 0, color: "var(--code-tx)", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.8, padding: "16px 20px" }} />
        </div>
        <div className="split-sep col" style={{ overflow: "auto" }}>
          <div className="row" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", gap: 8 }}><Icon name="sparkles" size={13} style={{ color: "var(--ac)" }} /><span className="panel-title">Inline suggestions</span><span className="ni-badge" style={{ marginLeft: "auto" }}>{suggestions.length}</span></div>
          <div className="col" style={{ padding: 14, gap: 10 }}>
            {suggestions.map((s, i) => (
              <div key={i} className="card card-pad" style={{ padding: 12, gap: 8, display: "flex", flexDirection: "column", borderLeft: "2px solid " + s.color }}>
                <div className="row" style={{ gap: 8 }}>
                  <Icon name={s.icon} size={14} style={{ color: s.color }} />
                  <span className="mono" style={{ fontSize: 11, color: "var(--tx-mid)" }}>## {s.line}</span>
                  <span className="badge sq" style={{ marginLeft: "auto", fontSize: 10, color: s.color, borderColor: s.color }}>{s.type}</span>
                </div>
                <span className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{s.msg}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => { setDirty(true); toast(s.action + "ed — " + s.line, "success"); }}>{s.action}</button>
                  <button className="btn btn-sm btn-ghost" style={{ padding: "5px 8px" }}>Dismiss</button>
                </div>
              </div>
            ))}
            <div className="card card-pad" style={{ padding: 12, gap: 8, display: "flex", flexDirection: "column", background: "var(--ac-dim)", border: "1px solid var(--ac-line)" }}>
              <div className="row" style={{ gap: 8 }}><Icon name="sparkles" size={14} style={{ color: "var(--ac)" }} /><b style={{ fontSize: 12.5, color: "var(--ac)" }}>Quality score: {mem.quality}/100</b></div>
              <span className="muted" style={{ fontSize: 11.5 }}>Resolving the 3 suggestions above would raise this to ~91 and save ~620 tokens.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { MemoryManager };

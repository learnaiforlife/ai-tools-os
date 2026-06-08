import React from "react";
import { Icon } from "./icons.jsx";
import { CONFIG_TREE, MCPS } from "./data.jsx";
import { ScopeBadge, StatusDot, Toggle } from "./ui.jsx";

/* config.jsx — Config Files: tree, editors, diff, validation */
const { useState: cfS, useEffect: cfE } = React;

const CONFIG_CONTENT = {
  "mcp-json": `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "\${GITHUB_TOKEN}" }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "\${DB_URL}"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    }
  }
}`,
  "settings-proj": `{
  "model": "claude-sonnet-4-6",
  "permissions": {
    "allow": ["Read", "Edit", "Bash(npm:*)"],
    "deny": ["Bash(rm -rf:*)", "WebFetch"]
  },
  "hooks": { "PreToolUse": ".claude/hooks.toml" },
  "lowTokenMode": false
}`,
  "hooks": `[[PreToolUse]]
matcher = "Bash"
command = ".claude/scripts/guard.sh"

[[PostToolUse]]
matcher = "Edit"
command = "npm run lint:staged"

# disabled — references missing file
# [[PreCompact]]
# command = ".claude/scripts/summarize.sh"`,
};

function ConfigFiles({ toast }) {
  const [sel, setSel] = cfS("settings-user");
  const [mode, setMode] = cfS("raw");
  const [dirty, setDirty] = cfS(false);
  const [content, setContent] = cfS("");
  const [meta, setMeta] = cfS({ loading: true, exists: false, real: false });
  const file = CONFIG_TREE.find(f => f.id === sel);

  // Load the real file at file.path; fall back to the demo sample if it isn't a
  // writable local file under the allowed roots.
  cfE(() => {
    setMeta({ loading: true, exists: false, real: false });
    fetch("/api/file?path=" + encodeURIComponent(file.path)).then(r => r.json()).then(j => {
      if (j.ok && j.exists) { setContent(j.content); setMeta({ loading: false, exists: true, real: true }); }
      else if (j.ok) { setContent(CONFIG_CONTENT[sel] || ""); setMeta({ loading: false, exists: false, real: true }); }
      else { setContent(CONFIG_CONTENT[sel] || CONFIG_CONTENT["settings-proj"]); setMeta({ loading: false, exists: false, real: false }); }
      setDirty(false);
    }).catch(() => { setContent(CONFIG_CONTENT[sel] || CONFIG_CONTENT["settings-proj"]); setMeta({ loading: false, exists: false, real: false }); });
  }, [sel]);

  const save = async () => {
    if (!meta.real) { setDirty(false); toast(`${file.path} isn't a local file — nothing written (demo entry)`, "warn"); return; }
    try {
      const r = await fetch("/api/file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: file.path, content }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "failed");
      setDirty(false); setMeta(m => ({ ...m, exists: true }));
      toast(`Saved ${file.name} → ${file.path} (${j.bytes} bytes, backed up)`, "success");
    } catch (e) { toast(`Save failed: ${e.message}`, "error"); }
  };

  const folders = {};
  CONFIG_TREE.forEach(f => { (folders[f.folder] = folders[f.folder] || []).push(f); });

  return (
    <div className="col" style={{ height: "100%" }}>
      <div className="row" style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", gap: 12, background: "var(--bg-1)" }}>
        <div className="col" style={{ gap: 0 }}><h1 style={{ fontSize: 18, margin: 0 }}>Config Files</h1></div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost"><Icon name="history" size={14} />History</button>
        <button className="btn btn-sm" disabled={!dirty} onClick={() => { fetch("/api/file?path=" + encodeURIComponent(file.path)).then(r => r.json()).then(j => { if (j.ok && j.exists) setContent(j.content); setDirty(false); toast("Reverted to on-disk version", "info"); }); }}><Icon name="restart" size={14} />Revert</button>
        <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}><Icon name="check" size={14} />Save</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, overflow: "hidden" }}>
        {/* tree */}
        <div className="col" style={{ borderRight: "1px solid var(--line)", overflow: "auto", padding: 12, background: "var(--bg-1)" }}>
          <div className="field-input" style={{ marginBottom: 10 }}><Icon name="search" size={14} style={{ color: "var(--tx-lo)" }} /><input placeholder="Filter files…" /></div>
          {Object.entries(folders).map(([folder, items]) => (
            <div key={folder} style={{ marginBottom: 6 }}>
              <div className="row" style={{ gap: 7, padding: "6px 8px", color: "var(--tx-lo)", fontSize: 11.5, fontWeight: 600 }}><Icon name="folder" size={14} /><span className="mono">{folder}</span></div>
              {items.map(f => (
                <button key={f.id} className="nav-item" data-on={sel === f.id} style={{ paddingLeft: 22 }} onClick={() => { setSel(f.id); setDirty(false); }}>
                  <span className="ni-icon"><Icon name="file" size={14} /></span>
                  <span className="mono" style={{ fontSize: 12 }}>{f.name}</span>
                  <span className="ni-badge" style={{ background: "transparent", color: "var(--tx-faint)", fontSize: 9, textTransform: "uppercase" }}>{f.type}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* editor */}
        <div className="col" style={{ overflow: "hidden" }}>
          <div className="row" style={{ padding: "9px 18px", borderBottom: "1px solid var(--line)", gap: 11 }}>
            <Icon name="file" size={14} style={{ color: "var(--tx-lo)" }} />
            <b className="mono" style={{ fontSize: 13 }}>{file.path}</b>
            <ScopeBadge scope={file.scope} icon={false} />
            {sel === "hooks" ? <span className="badge risk-med"><Icon name="warn" size={11} />1 warning</span> : <span className="badge risk-safe"><Icon name="check" size={11} />Valid</span>}
            {meta.real
              ? <span className="badge risk-safe" style={{ fontSize: 10 }}><Icon name="check" size={11} />{meta.exists ? "live file" : "new file"}</span>
              : <span className="badge sq" style={{ fontSize: 10 }}>demo</span>}
            <div className="spacer" style={{ flex: 1 }} />
            <div className="seg">
              <button data-on={mode === "raw"} onClick={() => setMode("raw")}><Icon name="terminal" size={13} />Raw</button>
              <button data-on={mode === "form"} onClick={() => setMode("form")}><Icon name="sliders" size={13} />Form</button>
              <button data-on={mode === "diff"} onClick={() => setMode("diff")}><Icon name="split" size={13} />Diff</button>
            </div>
          </div>

          {/* linked resources strip */}
          {sel === "mcp-json" && (
            <div className="row" style={{ padding: "8px 18px", borderBottom: "1px solid var(--line)", gap: 8, background: "var(--bg-1)" }}>
              <span className="faint" style={{ fontSize: 11.5 }}>Linked resources:</span>
              {["GitHub", "Postgres", "Filesystem"].map(n => <span key={n} className="chip" style={{ fontSize: 10.5, padding: "2px 8px" }}><StatusDot state="running" />{n}</span>)}
            </div>
          )}

          <div style={{ flex: 1, overflow: "auto" }}>
            {mode === "raw" && (
              <textarea value={content} onChange={e => { setContent(e.target.value); setDirty(true); }} spellCheck={false}
                style={{ width: "100%", height: "100%", resize: "none", background: "var(--bg-inset)", border: 0, outline: 0, color: "var(--code-tx)", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.75, padding: "16px 20px" }} />
            )}
            {mode === "form" && <ConfigForm sel={sel} onChange={() => setDirty(true)} />}
            {mode === "diff" && (
              <div className="code-well" style={{ height: "100%", border: 0, borderRadius: 0 }}>
                {[
                  { t: "ctx", s: "{" },
                  { t: "ctx", s: '  "mcpServers": {' },
                  { t: "del", s: '-     "github": { "command": "node", "args": ["./gh.js"] }' },
                  { t: "add", s: '+     "github": {' },
                  { t: "add", s: '+       "command": "npx",' },
                  { t: "add", s: '+       "args": ["-y", "@modelcontextprotocol/server-github"]' },
                  { t: "add", s: "+     }" },
                  { t: "ctx", s: "  }" },
                  { t: "ctx", s: "}" },
                ].map((l, i) => (
                  <div key={i} className={l.t === "add" ? "diff-add" : l.t === "del" ? "diff-del" : ""}>{l.s}</div>
                ))}
              </div>
            )}
          </div>

          {sel === "hooks" && mode !== "diff" && (
            <div className="row" style={{ padding: "10px 18px", borderTop: "1px solid var(--line)", gap: 10, background: "var(--r-med-bg)" }}>
              <Icon name="warn" size={15} style={{ color: "var(--r-med)" }} />
              <span style={{ fontSize: 12.5 }}>Line 11: commented hook references <span className="mono">.claude/scripts/summarize.sh</span> which doesn't exist.</span>
              <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => toast("Created summarize.sh stub", "success")}>Create file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigForm({ sel, onChange }) {
  const F = ({ label, children, hint }) => <div className="col" style={{ gap: 5, marginBottom: 16 }}><label className="panel-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{label}</label>{children}{hint && <span className="faint" style={{ fontSize: 11 }}>{hint}</span>}</div>;
  return (
    <div style={{ padding: 24, maxWidth: 620 }}>
      {sel === "settings-proj" ? (
        <>
          <F label="Model" hint="Default model for this project"><select className="field-input" style={{ appearance: "auto", color: "var(--tx-hi)" }} onChange={onChange}><option>claude-sonnet-4-6</option><option>claude-opus-4-1</option></select></F>
          <F label="Allowed tools"><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{["Read", "Edit", "Bash(npm:*)"].map(t => <span key={t} className="chip mono" data-on="true" style={{ fontSize: 11 }}>{t}</span>)}<button className="chip" onClick={onChange}><Icon name="plus" size={12} />add</button></div></F>
          <F label="Denied tools"><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{["Bash(rm -rf:*)", "WebFetch"].map(t => <span key={t} className="chip mono" style={{ fontSize: 11, color: "var(--r-crit)", borderColor: "rgba(255,93,108,0.3)" }}>{t}</span>)}<button className="chip" onClick={onChange}><Icon name="plus" size={12} />add</button></div></F>
          <div className="row" style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--line)" }}><div className="col" style={{ gap: 1 }}><b style={{ fontSize: 13 }}>Low Token Mode</b><span className="faint" style={{ fontSize: 11.5 }}>Load minimal startup context</span></div><Toggle on={false} onChange={onChange} /></div>
        </>
      ) : (
        <>
          <span className="panel-title">MCP servers</span>
          <div className="col" style={{ gap: 10, marginTop: 12 }}>
            {["github", "postgres", "filesystem"].map(s => {
              const m = MCPS.find(x => x.id === s);
              return <div key={s} className="card card-pad" style={{ padding: 13, gap: 8, display: "flex", flexDirection: "column" }}>
                <div className="row" style={{ gap: 9 }}><StatusDot state="running" /><b style={{ fontSize: 13 }}>{m.name}</b><Toggle on={true} onChange={onChange} style={{ marginLeft: "auto" }} /></div>
                <div className="field-input"><span className="faint mono" style={{ fontSize: 11 }}>cmd</span><input defaultValue={m.cmd} onChange={onChange} className="mono" style={{ fontSize: 11.5 }} /></div>
              </div>;
            })}
            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={onChange}><Icon name="plus" size={14} />Add server</button>
          </div>
        </>
      )}
    </div>
  );
}

export { ConfigFiles };

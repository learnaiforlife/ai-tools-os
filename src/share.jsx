import React from "react";
import { Icon } from "./icons.jsx";

/* share.jsx — shareable install-prompt generator for any resource */
const { useState: shS, useEffect: shE } = React;

const SCOPE_DEST = {
  skill:    { user: "~/.claude/skills/", project: ".claude/skills/", workspace: "@workspace/skills/" },
  subagent: { user: "~/.claude/agents/", project: ".claude/agents/", workspace: "@workspace/agents/" },
  command:  { user: "~/.claude/commands/", project: ".claude/commands/", workspace: "@workspace/commands/" },
  mcp:      { user: "~/.claude/.mcp.json", project: ".mcp.json", workspace: "@workspace/.mcp.json" },
  prompt:   { user: "~/.claude/prompts/", project: ".claude/prompts/", workspace: "@workspace/prompts/" },
  plugin:   { user: "~/.claude/plugins/", project: ".claude/plugins/", workspace: "@workspace/plugins/" },
};
const SCOPE_PHRASE = {
  user: "for my user level (applies to every project on my machine)",
  project: "for this project only",
  workspace: "for our shared workspace",
};
const KIND_LABEL = { skill: "skill", subagent: "subagent", command: "slash command", mcp: "MCP server", prompt: "prompt", plugin: "plugin" };

function genShare({ kind, name, source, scope, body }, format) {
  const dest = (SCOPE_DEST[kind] || SCOPE_DEST.skill)[scope];
  const phrase = SCOPE_PHRASE[scope];
  const label = KIND_LABEL[kind] || "resource";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (format === "cli") {
    if (kind === "mcp") return `claude mcp add ${slug} --scope ${scope} --source ${source}`;
    return `npx @ai-tools-os/cli install ${kind} "${slug}" \\\n  --source ${source} \\\n  --scope ${scope}   # → ${dest}`;
  }
  if (format === "link") {
    return `aitools://install?type=${kind}&name=${slug}&scope=${scope}&source=${encodeURIComponent(source)}`;
  }
  // natural-language AI prompt
  if (kind === "prompt") {
    return `Save this prompt to my library as "${name}" ${phrase}:\n\n"""\n${(body || "").trim()}\n"""`;
  }
  if (kind === "mcp") {
    return `Install the ${label} "${name}" from ${source} ${phrase}.\nAdd it to ${dest}, then start it and confirm its tools load.`;
  }
  return `Install the ${label} "${name}" from ${source} ${phrase}.\nPlace it in ${dest} and validate it after install.`;
}

function ShareModal({ resource, onClose, toast }) {
  const r = resource;
  const [scope, setScope] = shS(r.scope || "user");
  const [source, setSource] = shS(r.source || `github.com/${(r.vendor || "jordan-diaz").toLowerCase().replace(/\s+/g, "-")}/${(KIND_LABEL[r.kind] || "resource").replace(/\s/g, "-")}s`);
  const [format, setFormat] = shS("prompt");
  const [text, setText] = shS("");

  shE(() => { setText(genShare({ ...r, source, scope }, format)); }, [scope, source, format]);

  const copy = () => {
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    toast("Install prompt copied — paste it to anyone", "success");
  };

  const fmtIcon = { prompt: "sparkles", cli: "terminal", link: "link" };

  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="scrim" />
      <div className="modal" style={{ width: 560 }} onMouseDown={e => e.stopPropagation()}>
        <div className="card-hd" style={{ padding: "16px 20px" }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--ac-dim)", color: "var(--ac)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="link" size={17} /></span>
          <div className="col" style={{ gap: 1 }}>
            <h3 style={{ fontSize: 15 }}>Share “{r.name}”</h3>
            <span className="sub" style={{ textTransform: "capitalize" }}>{KIND_LABEL[r.kind] || "resource"} · generate an install prompt</span>
          </div>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose}><Icon name="x" size={17} /></button>
        </div>

        <div className="card-pad col" style={{ gap: 16 }}>
          {/* install level */}
          <div className="col" style={{ gap: 7 }}>
            <label className="panel-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>Install at which level?</label>
            <div className="seg" style={{ width: "fit-content" }}>
              {["user", "project", "workspace"].map(s => <button key={s} data-on={scope === s} onClick={() => setScope(s)} style={{ textTransform: "capitalize", padding: "6px 14px" }}>
                <span className="sc-dot" style={{ width: 6, height: 6, borderRadius: 5, background: { user: "var(--sc-user)", project: "var(--sc-project)", workspace: "var(--sc-workspace)" }[s], display: "inline-block", marginRight: 6 }} />{s}
              </button>)}
            </div>
          </div>

          {/* source — only relevant for non-prompt */}
          {r.kind !== "prompt" && (
            <div className="col" style={{ gap: 7 }}>
              <label className="panel-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>Source</label>
              <div className="field-input"><Icon name="globe" size={14} style={{ color: "var(--tx-lo)" }} /><input className="mono" style={{ fontSize: 12 }} value={source} onChange={e => setSource(e.target.value)} placeholder="github.com/you/repo" /></div>
            </div>
          )}

          {/* format */}
          <div className="col" style={{ gap: 7 }}>
            <label className="panel-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>Share as</label>
            <div className="seg" style={{ width: "fit-content" }}>
              {[["prompt", "AI prompt"], ["cli", "CLI command"], ["link", "Install link"]].map(([k, l]) => (
                <button key={k} data-on={format === k} onClick={() => setFormat(k)}><Icon name={fmtIcon[k]} size={13} />{l}</button>
              ))}
            </div>
          </div>

          {/* generated, editable */}
          <div className="col" style={{ gap: 7 }}>
            <div className="row"><label className="panel-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{format === "prompt" ? "Copy & paste to a teammate or AI" : "Copy & run"}</label><span className="faint" style={{ fontSize: 11, marginLeft: "auto" }}>editable</span></div>
            <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false} rows={format === "prompt" && r.kind === "prompt" ? 7 : 4}
              style={{ resize: "vertical", background: "var(--bg-inset)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", color: "var(--code-tx)", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.6, padding: "12px 14px", outline: 0 }} />
          </div>
        </div>

        <div className="row" style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", gap: 9 }}>
          <span className="faint row" style={{ fontSize: 11.5, gap: 6 }}><Icon name="lock" size={13} />Nothing leaves your machine — this just builds text.</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={copy}><Icon name="copy" size={15} />Copy {format === "cli" ? "command" : format === "link" ? "link" : "prompt"}</button>
        </div>
      </div>
    </div>
  );
}

export { ShareModal, genShare };

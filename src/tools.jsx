import React from "react";
import { Icon } from "./icons.jsx";
import { TOOLS } from "./data.jsx";
import { RiskBadge, ActionMenu, Toggle, Code } from "./ui.jsx";
import { Statusline } from "./statusline.jsx";

/* tools.jsx — External Tools Hub + MarkItDown conversion workflow */
const { useState: tlS } = React;

function ToolsHub({ toast }) {
  const [open, setOpen] = tlS(null);
  if (open === "markitdown") return <MarkItDown onBack={() => setOpen(null)} toast={toast} />;
  if (open === "statusline") return <Statusline onBack={() => setOpen(null)} toast={toast} />;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>External Tools</h1><div className="ph-sub">CLI utilities with friendly interfaces · {TOOLS.filter(t => t.installed).length} installed · {TOOLS.filter(t => t.setup).length} ready</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => toast("Browse the tool registry", "info")}><Icon name="globe" size={15} />Browse registry</button>
        <button className="btn btn-primary btn-sm" onClick={() => toast("Add a custom CLI tool", "info")}><Icon name="plus" size={15} />Add tool</button>
      </div>

      <div className="grid g-3">
        {TOOLS.map(tool => (
          <div key={tool.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="row" style={{ gap: 11 }}>
              <span style={{ width: 42, height: 42, borderRadius: 11, background: "var(--bg-3)", border: "1px solid var(--line)", display: "grid", placeItems: "center", flex: "none", color: "var(--tx-hi)" }}><Icon name={tool.icon} size={20} /></span>
              <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7 }}><b style={{ fontSize: 14.5 }}>{tool.name}</b><span className="mono faint" style={{ fontSize: 10.5 }}>{tool.version}</span></div>
                <span className="faint" style={{ fontSize: 11 }}>by {tool.vendor}</span>
              </div>
            </div>

            <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, minHeight: 54 }}>{tool.desc}</p>

            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {tool.installed
                ? (tool.setup ? <span className="badge risk-safe"><Icon name="check" size={11} />Ready</span> : <span className="badge risk-med"><Icon name="warn" size={11} />Setup needed</span>)
                : <span className="badge"><Icon name="download" size={11} />Not installed</span>}
              <span className="badge sq">{tool.locality === "local" ? <><Icon name="lock" size={11} style={{ color: "var(--ac)" }} />Local</> : <><Icon name="globe" size={11} style={{ color: "var(--r-med)" }} />Networked</>}</span>
              <RiskBadge risk={tool.risk} />
            </div>

            <div className="col" style={{ gap: 4, fontSize: 11.5 }}>
              <div className="row faint"><Icon name="cube" size={12} /><span style={{ marginLeft: 6 }}>Requires</span><span className="mono" style={{ marginLeft: "auto", color: "var(--tx-mid)" }}>{tool.deps.join(", ")}</span></div>
              <div className="row faint"><Icon name="clock" size={12} /><span style={{ marginLeft: 6 }}>Last run</span><span style={{ marginLeft: "auto", color: tool.lastRun === "active" ? "var(--ac)" : "var(--tx-mid)" }}>{tool.lastRun}</span></div>
            </div>

            <div className="row" style={{ gap: 6, paddingTop: 11, borderTop: "1px solid var(--line)", marginTop: "auto" }}>
              {tool.id === "markitdown"
                ? <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => setOpen("markitdown")}><Icon name="file" size={14} />Convert files</button>
                : tool.id === "statusline"
                ? <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => setOpen("statusline")}><Icon name="statusbar" size={14} />Configure</button>
                : tool.installed && tool.setup
                  ? <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => toast("Opening " + tool.name, "info")}><Icon name="external" size={14} />{tool.actions[0]}</button>
                  : tool.installed
                    ? <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => toast("Setting up " + tool.name + "…", "info")}><Icon name="sliders" size={14} />Set up</button>
                    : <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => toast("Installing " + tool.name + "…", "info")}><Icon name="download" size={14} />Install</button>}
              <ActionMenu items={[
                { icon: "terminal", label: "View logs", onClick: () => toast(tool.name + " logs", "info") },
                { icon: "external", label: "Documentation", onClick: () => toast("Opening docs", "info") },
                { icon: "security", label: "Security review", onClick: () => toast("Reviewing " + tool.name, "info") },
                { sep: true },
                { icon: "trash", label: "Uninstall", danger: true, onClick: () => toast("Uninstalled " + tool.name, "error") },
              ]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SAMPLE_FILES = [
  { name: "Q3-vendor-invoice.pdf", size: "248 KB", type: "PDF", status: "done", icon: "file" },
  { name: "product-roadmap.pptx", size: "4.1 MB", type: "PPTX", status: "done", icon: "file" },
  { name: "user-research.docx", size: "92 KB", type: "DOCX", status: "converting", icon: "file" },
  { name: "metrics-sheet.xlsx", size: "1.3 MB", type: "XLSX", status: "queued", icon: "file" },
];

const SAMPLE_MD = `# Q3 Vendor Invoice — Northwind Supplies

**Invoice #:** NW-20294
**Date:** 2026-08-14
**Due:** 2026-09-13

## Line Items

| Item | Qty | Unit | Total |
|------|-----|------|-------|
| Standing desk (oak) | 4 | $420.00 | $1,680.00 |
| Ergonomic chair | 4 | $310.00 | $1,240.00 |
| Monitor arm, dual | 6 | $89.00 | $534.00 |
| Cable management kit | 12 | $14.50 | $174.00 |

**Subtotal:** $3,628.00
**Tax (8.25%):** $299.31
**Total Due:** **$3,927.31**`;

function MarkItDown({ onBack, toast }) {
  const [files, setFiles] = tlS(SAMPLE_FILES.map(f => ({ ...f })));
  const [drag, setDrag] = tlS(false);
  const [view, setView] = tlS("split");
  const [converting, setConverting] = tlS(false);
  const [selected, setSelected] = tlS(0);

  const addFile = () => { setFiles(f => [...f, { name: "notes-" + (f.length + 1) + ".md", size: "18 KB", type: "MD", status: "queued", icon: "file" }]); toast("File added to queue", "info"); };
  const convert = () => {
    setConverting(true);
    setFiles(f => f.map(x => x.status === "queued" ? { ...x, status: "converting" } : x));
    setTimeout(() => { setFiles(f => f.map(x => ({ ...x, status: "done" }))); setConverting(false); toast("All files converted to Markdown", "success"); }, 1400);
  };

  return (
    <div className="col" style={{ height: "100%" }}>
      <div className="row" style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)", gap: 12, background: "var(--bg-1)" }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevL" size={15} />Tools</button>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg-3)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}><Icon name="file" size={15} /></span>
        <div className="col" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>MarkItDown</b><span className="faint" style={{ fontSize: 11 }}>Turn any document into clean Markdown</span></div>
        <span className="badge risk-safe" style={{ marginLeft: 4 }}><Icon name="lock" size={11} />Runs locally</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" onClick={() => toast("Conversion log opened", "info")}><Icon name="terminal" size={14} />Logs</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", flex: 1, overflow: "hidden" }}>
        {/* left: queue + settings */}
        <div className="col" style={{ borderRight: "1px solid var(--line)", overflow: "auto", background: "var(--bg-1)" }}>
          <div style={{ padding: 16 }}>
            <div className="dropzone" data-drag={drag} onClick={addFile}
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); addFile(); }}>
              <Icon name="upload" size={26} style={{ color: "var(--ac)", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 600, fontSize: 13 }}>Drop files to convert</div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>PDF · DOCX · PPTX · XLSX · images · audio</div>
              <button className="btn btn-sm" style={{ marginTop: 12 }}><Icon name="folder" size={14} />Browse files</button>
            </div>
          </div>

          <div style={{ padding: "0 16px 8px" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}><span className="panel-title">Queue · {files.length}</span><button className="btn-ghost faint" style={{ border: 0, background: "none", fontSize: 11, cursor: "pointer" }} onClick={() => setFiles([])}>Clear</button></div>
            <div className="col" style={{ gap: 6 }}>
              {files.map((f, i) => (
                <div key={i} className="row" style={{ gap: 9, padding: "9px 10px", background: selected === i ? "var(--ac-dim)" : "var(--bg-2)", border: "1px solid " + (selected === i ? "var(--ac-line)" : "var(--line)"), borderRadius: "var(--r-sm)", cursor: "pointer" }} onClick={() => setSelected(i)}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: "var(--bg-0)", display: "grid", placeItems: "center", flex: "none", fontSize: 8, fontWeight: 700, color: "var(--tx-mid)" }} className="mono">{f.type}</span>
                  <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}><span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span><span className="faint" style={{ fontSize: 10.5 }}>{f.size}</span></div>
                  {f.status === "done" && <Icon name="check" size={15} style={{ color: "var(--ac)" }} />}
                  {f.status === "converting" && <Icon name="refresh" size={14} className="spin" style={{ color: "var(--r-low)" }} />}
                  {f.status === "queued" && <span className="faint" style={{ fontSize: 10.5 }}>queued</span>}
                </div>
              ))}
              {files.length === 0 && <span className="faint" style={{ fontSize: 12, textAlign: "center", padding: 16 }}>Queue is empty</span>}
            </div>
          </div>

          <div style={{ padding: 16, marginTop: "auto", borderTop: "1px solid var(--line)" }}>
            <span className="panel-title">Conversion settings</span>
            <div className="col" style={{ gap: 10, marginTop: 10 }}>
              {[["Preserve tables", true], ["Extract images", true], ["Include metadata", false], ["OCR scanned pages", true]].map(([l, on]) => (
                <div key={l} className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span className="muted">{l}</span><Toggle on={on} onChange={() => {}} /></div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={convert} disabled={converting}>
              {converting ? <><Icon name="refresh" size={15} className="spin" />Converting…</> : <><Icon name="zap" size={15} fill />Convert {files.filter(f => f.status !== "done").length || "all"}</>}
            </button>
          </div>
        </div>

        {/* right: preview */}
        <div className="col" style={{ overflow: "hidden" }}>
          <div className="row" style={{ padding: "9px 18px", borderBottom: "1px solid var(--line)", gap: 10 }}>
            <Icon name="file" size={14} style={{ color: "var(--tx-lo)" }} />
            <b style={{ fontSize: 12.5 }}>{files[selected]?.name || "—"}</b>
            <Icon name="arrowR" size={13} style={{ color: "var(--tx-faint)" }} />
            <span className="mono" style={{ fontSize: 12, color: "var(--ac)" }}>{files[selected]?.name.replace(/\.[a-z]+$/i, ".md") || ""}</span>
            <div className="spacer" style={{ flex: 1 }} />
            <div className="seg">
              <button data-on={view === "split"} onClick={() => setView("split")}><Icon name="split" size={14} />Side-by-side</button>
              <button data-on={view === "md"} onClick={() => setView("md")}>Markdown</button>
            </div>
            <button className="btn btn-sm" onClick={() => toast("Markdown copied", "success")}><Icon name="copy" size={13} />Copy</button>
            <button className="btn btn-sm" onClick={() => toast("Sent to Claude as context", "success")}><Icon name="sparkles" size={13} />Send to AI</button>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: view === "split" ? "grid" : "block", gridTemplateColumns: "1fr 1fr" }}>
            {view === "split" && (
              <div className="col" style={{ overflow: "hidden", borderRight: "1px solid var(--line)" }}>
                <div className="row" style={{ padding: "7px 16px", borderBottom: "1px solid var(--line)", gap: 7 }}><Icon name="file" size={12} style={{ color: "var(--tx-lo)" }} /><span className="panel-title">Original</span></div>
                <div style={{ flex: 1, overflow: "auto", padding: 20, background: "var(--bg-0)" }}>
                  <div className="ph-img" style={{ aspectRatio: "8.5 / 11", maxWidth: 320, margin: "0 auto" }}>invoice.pdf · page 1</div>
                </div>
              </div>
            )}
            <div className="col" style={{ overflow: "hidden" }}>
              <div className="row" style={{ padding: "7px 16px", borderBottom: "1px solid var(--line)", gap: 7 }}><Icon name="check" size={12} style={{ color: "var(--ac)" }} /><span className="panel-title">Converted Markdown</span><span className="badge risk-safe" style={{ marginLeft: "auto" }}>clean</span></div>
              <div style={{ flex: 1, overflow: "auto", padding: 18 }}><Code code={SAMPLE_MD} lang="md" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ToolsHub };

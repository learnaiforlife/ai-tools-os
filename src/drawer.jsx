import React from "react";
import { Icon } from "./icons.jsx";
import { fmtTok, riskColor, riskLabel } from "./data.jsx";
import { StatusDot, ScopeBadge, Code, ActionMenu } from "./ui.jsx";
import { Drawer } from "./palette.jsx";

/* drawer.jsx — ResourceDrawer: MCP inspector with tools / logs / config */
const { useState: drS } = React;

const MCP_TOOLS_SAMPLE = {
  github: ["create_issue", "list_pull_requests", "get_file_contents", "create_branch", "merge_pull_request", "search_code"],
  filesystem: ["read_file", "write_file", "list_directory", "move_file", "search_files"],
  context7: ["resolve-library-id", "query-docs"],
  "desktop-commander": ["start_process", "interact_with_process", "read_file", "write_file", "edit_block", "list_directory"],
  firecrawl: ["firecrawl_scrape", "firecrawl_search", "firecrawl_crawl", "firecrawl_map", "firecrawl_extract"],
  memory: ["create_entities", "create_relations", "add_observations", "search_nodes", "read_graph"],
  playwright: ["browser_navigate", "browser_click", "browser_snapshot", "browser_type", "browser_evaluate"],
  puppeteer: ["puppeteer_navigate", "puppeteer_click", "puppeteer_screenshot", "puppeteer_fill", "puppeteer_evaluate"],
  tradingview: ["chart_set_symbol", "data_get_ohlcv", "quote_get", "symbol_search", "alert_create"],
  default: ["invoke", "list_resources", "get_status"],
};

const LOG_SAMPLE = [
  { t: "12:04:21", lvl: "info", msg: "Server started · 26 tools registered" },
  { t: "12:04:21", lvl: "info", msg: "Authenticated as jordan-diaz (token ****4f2a)" },
  { t: "12:18:03", lvl: "info", msg: "tools/call create_issue → 201 Created (118ms)" },
  { t: "12:31:47", lvl: "warn", msg: "Rate limit 4200/5000 — backing off" },
  { t: "12:32:10", lvl: "info", msg: "tools/call search_code → 200 OK (240ms)" },
];

function ResourceDrawer({ resource, onClose, toast, nav, share }) {
  const [tab, setTab] = drS(resource.tab || "overview");
  const r = resource;
  const tools = MCP_TOOLS_SAMPLE[r.id] || MCP_TOOLS_SAMPLE.default;

  return (
    <Drawer open onClose={onClose} width={480}>
      <div className="drawer-hd">
        <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg-3)", border: "1px solid var(--line)", display: "grid", placeItems: "center", flex: "none", position: "relative" }}>
          <Icon name="mcp" size={20} style={{ color: "var(--tx-mid)" }} />
          <span style={{ position: "absolute", bottom: -2, right: -2 }}><StatusDot state={r.state} /></span>
        </span>
        <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 7 }}><b style={{ fontSize: 15 }}>{r.name}</b><span className="badge sq" style={{ fontSize: 10 }}>{r.transport}</span></div>
          <span className="mono faint" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cmd}</span>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>

      <div className="row" style={{ padding: "0 14px", borderBottom: "1px solid var(--line)", gap: 2 }}>
        {[["overview", "Overview"], ["tools", "Tools"], ["logs", "Logs"], ["config", "Config"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "11px 12px", border: 0, background: "none", color: tab === id ? "var(--tx-hi)" : "var(--tx-mid)", borderBottom: tab === id ? "2px solid var(--ac)" : "2px solid transparent", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{l}{id === "tools" && <span className="ni-badge" style={{ marginLeft: 6 }}>{r.tools}</span>}</button>
        ))}
      </div>

      <div className="drawer-body">
        {tab === "overview" && (
          <div className="col" style={{ gap: 16 }}>
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{r.desc}</p>
            <div className="grid g-2" style={{ gap: 10 }}>
              {[["Status", <span className="row" style={{ gap: 6 }}><StatusDot state={r.state} /><b style={{ textTransform: "capitalize", fontSize: 13 }}>{r.state}</b></span>],
                ["Scope", <ScopeBadge scope={r.scope} icon={false} />],
                ["Tools", <b className="tnum">{r.tools}</b>],
                ["Tokens", <b className="mono tnum" style={{ color: r.tokens > 5000 ? "var(--r-med)" : "var(--tx-hi)" }}>{fmtTok(r.tokens)}</b>],
                ["Latency", <b className="tnum">{r.latency}ms</b>],
                ["Uptime", <b className="tnum">{r.uptime}</b>]].map(([l, v], i) => (
                <div key={i} className="card card-pad" style={{ padding: 12, gap: 5, display: "flex", flexDirection: "column" }}><span className="stat-lbl" style={{ fontSize: 10.5 }}>{l}</span>{v}</div>
              ))}
            </div>
            <div className="col" style={{ gap: 8 }}>
              <span className="panel-title">Capabilities</span>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {r.caps.map(c => <span key={c} className="badge" style={{ color: ["shell", "broad-fs", "external"].includes(c) ? "var(--r-crit)" : "var(--tx-mid)" }}>{c}</span>)}
              </div>
            </div>
            {r.risk !== "low" && r.risk !== "safe" && (
              <div className="row" style={{ gap: 10, padding: 12, background: "var(--r-crit-bg)", borderRadius: "var(--r-md)", border: "1px solid rgba(255,93,108,0.2)" }}>
                <Icon name="alert" size={18} style={{ color: riskColor(r.risk) }} />
                <span style={{ fontSize: 12.5, flex: 1 }}><b>{riskLabel(r.risk)} risk.</b> Review permissions before enabling in shared scope.</span>
                <button className="btn btn-sm" onClick={() => { onClose(); nav("security"); }}>Review</button>
              </div>
            )}
          </div>
        )}

        {tab === "tools" && (
          <div className="col" style={{ gap: 7 }}>
            {tools.map(t => (
              <div key={t} className="row" style={{ gap: 10, padding: "10px 12px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}>
                <Icon name="bolt" size={14} style={{ color: "var(--ac)" }} />
                <span className="mono" style={{ fontSize: 12.5 }}>{t}</span>
                <span className="faint" style={{ marginLeft: "auto", fontSize: 11 }}>tool</span>
              </div>
            ))}
            {r.tools > tools.length && <span className="faint" style={{ fontSize: 12, padding: 6 }}>+ {r.tools - tools.length} more tools</span>}
          </div>
        )}

        {tab === "logs" && (
          <div className="code-well" style={{ fontSize: 11.5 }}>
            {LOG_SAMPLE.map((l, i) => (
              <div key={i}><span style={{ color: "var(--tx-faint)" }}>{l.t}</span> <span style={{ color: l.lvl === "warn" ? "var(--r-med)" : l.lvl === "error" ? "var(--r-crit)" : "var(--ac)" }}>{l.lvl.toUpperCase()}</span> {l.msg}</div>
            ))}
            <div className="pulse" style={{ color: "var(--tx-faint)" }}>▌ streaming…</div>
          </div>
        )}

        {tab === "config" && <Code code={`{\n  "command": "${r.cmd.split(" ")[0]}",\n  "args": ${JSON.stringify(r.cmd.split(" ").slice(1))},\n  "scope": "${r.scope}",\n  "enabled": ${r.enabled}\n}`} lang="json" lines />}
      </div>

      <div className="drawer-foot">
        {r.state === "running"
          ? <button className="btn" style={{ flex: 1 }} onClick={() => toast(r.name + " restarted", "success")}><Icon name="restart" size={15} />Restart</button>
          : <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => toast(r.name + " started", "success")}><Icon name="play" size={15} fill />Start</button>}
        <button className="btn" onClick={() => toast("Opening config", "info")}><Icon name="config" size={15} />Config</button>
        <ActionMenu align="right" trigger={<Icon name="dots" size={16} />} items={[
          { icon: "link", label: "Share…", onClick: () => share && share({ kind: "mcp", name: r.name, scope: r.scope, vendor: r.name }) },
          { icon: "arrowR", label: "Move scope…", onClick: () => toast("Move " + r.name, "info") },
          { icon: "shield", label: "Security review", onClick: () => { onClose(); nav("security"); } },
          { sep: true },
          { icon: "trash", label: "Remove server", danger: true, onClick: async () => {
              try {
                const resp = await fetch("/api/mcp/disable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id }) });
                const j = await resp.json();
                if (!j.ok) throw new Error(j.error || "failed");
                toast(`${r.name} removed — parked out of ~/.claude.json (re-enable from MCP screen)`, "warn");
              } catch (e) { toast(`Couldn't remove ${r.name}: ${e.message}`, "error"); }
              onClose();
            } },
        ]} />
      </div>
    </Drawer>
  );
}

export { ResourceDrawer };

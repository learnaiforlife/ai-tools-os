import React from "react";
import { Icon } from "./icons.jsx";
import { riskClass, riskColor, riskLabel, scopeClass } from "./data.jsx";

/* ui.jsx — shared UI primitives */
const { useState, useEffect, useRef, useMemo } = React;

function RiskBadge({ risk, dot = true, sq = false }) {
  return (
    <span className={"badge " + (sq ? "sq " : "") + riskClass(risk)}>
      {dot && <span className="dot" style={{ background: riskColor(risk) }} />}
      {riskLabel(risk)}
    </span>
  );
}

function ScopeBadge({ scope, icon = true }) {
  const label = { user: "User", project: "Project", workspace: "Workspace" }[scope] || scope;
  return (
    <span className={"badge sq scope-badge " + scopeClass(scope)}>
      {icon && <span className="dot" style={{ background: "currentColor" }} />}
      {label}
    </span>
  );
}

function StatusDot({ state }) {
  const cls = { running: "sd-on", stopped: "sd-off", error: "sd-err", warn: "sd-warn" }[state] || "sd-off";
  return <span className={"status-dot " + cls} />;
}

function Toggle({ on, onChange, onClick }) {
  return <button className="tgl" data-on={!!on} onClick={(e) => { e.stopPropagation(); (onChange || onClick) && (onChange || onClick)(!on); }} aria-pressed={!!on} />;
}

function Badge({ children, tone, style }) {
  const map = { ac: { color: "var(--ac)", background: "var(--ac-dim)", borderColor: "var(--ac-line)" } };
  return <span className="badge" style={{ ...(map[tone] || {}), ...style }}>{children}</span>;
}

function Meter({ value, max = 100, tone, ticks, height }) {
  const pct = Math.min(100, (value / max) * 100);
  const auto = pct > 88 ? "crit" : pct > 70 ? "warn" : "";
  return (
    <div className={"meter " + (tone || auto)} style={height ? { height } : null}>
      <i style={{ width: pct + "%" }} />
      {ticks && ticks.map((t, i) => <span key={i} className="tick" style={{ left: t + "%" }} />)}
    </div>
  );
}

function HealthRing({ value, size = 54, stroke = 5, label, color }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = color || (value >= 80 ? "var(--ac)" : value >= 60 ? "var(--r-med)" : "var(--r-crit)");
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.28 }}>
        {label != null ? label : value}
      </div>
    </div>
  );
}

function Donut({ data, size = 132, stroke = 18, center }) {
  const total = data.reduce((s, d) => s + d.tokens, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const frac = d.tokens / total;
          const seg = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${c * frac} ${c}`} strokeDashoffset={-off * c} />;
          off += frac;
          return seg;
        })}
      </svg>
      {center && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{center}</div>}
    </div>
  );
}

function Sparkline({ data, w = 100, h = 30, color = "var(--ac)", fill = true }) {
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  const gid = "sg" + Math.round(w + h + data[0]);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.25" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SegBar({ segments, height = 10 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="seg-bar" style={{ height }}>
      {segments.map((s, i) => <span key={i} style={{ width: (s.value / total) * 100 + "%", background: s.color }} title={s.label} />)}
    </div>
  );
}

function ActionMenu({ items, align = "right", trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        {trigger || <Icon name="dots" size={16} />}
      </button>
      {open && (
        <div className="menu-pop" style={{ position: "absolute", top: "calc(100% + 5px)", [align]: 0, zIndex: 50, minWidth: 200 }}>
          {items.map((it, i) => it.sep ? <div key={i} className="divider" style={{ margin: "5px 0" }} /> : (
            <button key={i} className="cmdk-item" data-active="false" style={{ width: "100%", color: it.danger ? "var(--r-crit)" : undefined }}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick && it.onClick(); }}>
              {it.icon && <span className="ci-icon" style={{ color: it.danger ? "var(--r-crit)" : undefined }}><Icon name={it.icon} size={15} /></span>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="empty">
      <div className="e-ic"><Icon name={icon || "info"} size={24} /></div>
      <div style={{ fontWeight: 600, color: "var(--tx-mid)", fontSize: 14 }}>{title}</div>
      {sub && <div style={{ marginTop: 4, fontSize: 12.5 }}>{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

function Search({ value, onChange, placeholder, width }) {
  return (
    <div className="field-input" style={{ width: width || 240 }}>
      <Icon name="search" size={15} style={{ color: "var(--tx-lo)" }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Search…"} />
      {value && <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => onChange("")}><Icon name="x" size={13} /></button>}
    </div>
  );
}

function Stat({ value, label, delta, deltaDir, icon, accent }) {
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="stat-lbl">{label}</span>
        {icon && <span style={{ color: accent || "var(--tx-lo)" }}><Icon name={icon} size={16} /></span>}
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: 9 }}>
        <span className="stat-val tnum" style={accent ? { color: accent } : null}>{value}</span>
        {delta && <span className={"delta " + (deltaDir || "up")}><Icon name={deltaDir === "down" ? "arrowDn" : "arrowUp"} size={12} />{delta}</span>}
      </div>
    </div>
  );
}

function Confirm({ open, title, body, confirmLabel, danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-wrap" onMouseDown={onCancel}>
      <div className="scrim" />
      <div className="modal" style={{ width: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-pad">
          <div className="row" style={{ gap: 12, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", flex: "none",
              background: danger ? "var(--r-crit-bg)" : "var(--ac-dim)", color: danger ? "var(--r-crit)" : "var(--ac)" }}>
              <Icon name={danger ? "warn" : "info"} size={18} />
            </div>
            <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          </div>
          <p className="muted" style={{ margin: "0 0 18px", fontSize: 13, lineHeight: 1.5 }}>{body}</p>
          <div className="row" style={{ justifyContent: "flex-end", gap: 9 }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className={"btn " + (danger ? "btn-danger" : "btn-primary")} onClick={onConfirm}>{confirmLabel || "Confirm"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// syntax highlight a small json/text block
function hl(code, lang) {
  let h = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (lang === "json" || lang === "mcp") {
    h = h.replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="tok-key">$1</span>$2')
         .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="tok-str">$1</span>')
         .replace(/\b(true|false|null)\b/g, '<span class="tok-num">$1</span>')
         .replace(/\b(\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
  } else if (lang === "md") {
    h = h.replace(/^(#{1,6} .+)$/gm, '<span class="tok-h">$1</span>')
         .replace(/(\*\*[^*]+\*\*)/g, '<span class="tok-key">$1</span>')
         .replace(/(`[^`]+`)/g, '<span class="tok-str">$1</span>')
         .replace(/^(- |\d+\. )/gm, '<span class="tok-punct">$1</span>');
  } else if (lang === "toml") {
    h = h.replace(/^(\[.+\])$/gm, '<span class="tok-h">$1</span>')
         .replace(/^([\w.-]+)(\s*=)/gm, '<span class="tok-key">$1</span>$2')
         .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="tok-str">$1</span>')
         .replace(/#(.*)$/gm, '<span class="tok-com">#$1</span>');
  }
  return h;
}
function Code({ code, lang, lines }) {
  const rows = code.split("\n");
  return (
    <div className="code-well">
      {lines
        ? rows.map((r, i) => <div key={i}><span className="ln">{i + 1}</span><span dangerouslySetInnerHTML={{ __html: hl(r, lang) || "&nbsp;" }} /></div>)
        : <div dangerouslySetInnerHTML={{ __html: hl(code, lang) }} />}
    </div>
  );
}

export { RiskBadge, ScopeBadge, StatusDot, Toggle, Badge, Meter, HealthRing, Donut, Sparkline, SegBar, ActionMenu, EmptyState, Search, Stat, Confirm, Code, hl };

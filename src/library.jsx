import React from "react";
import { Icon } from "./icons.jsx";
import { PROMPTS, PROMPT_CATS } from "./data2.jsx";
import { Search, EmptyState, Code } from "./ui.jsx";
import { Drawer } from "./palette.jsx";

/* library.jsx — Prompt Library */
const { useState: lbS, useMemo: lbM } = React;

function PromptLibrary({ toast, share }) {
  const [data, setData] = lbS(PROMPTS.map(p => ({ ...p })));
  const [q, setQ] = lbS("");
  const [cat, setCat] = lbS("all");
  const [onlyFav, setOnlyFav] = lbS(false);
  const [open, setOpen] = lbS(null);

  const toggleFav = (id) => setData(d => d.map(p => p.id === id ? { ...p, fav: !p.fav } : p));
  const filtered = lbM(() => data.filter(p =>
    (cat === "all" || p.category === cat) && (!onlyFav || p.fav) &&
    (p.title + p.body + p.category).toLowerCase().includes(q.toLowerCase())
  ), [data, cat, onlyFav, q]);
  const cur = data.find(p => p.id === open);

  const catColor = { Coding: "#2bd4a0", Debugging: "#ff8a4c", Review: "#5b9dff", Planning: "#b79bff", Writing: "#f5b544", Research: "#2bd4a0" };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Prompt Library</h1><div className="ph-sub">{data.length} reusable prompts · {data.filter(p => p.fav).length} favorites · click any to preview & copy</div></div>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => toast("New prompt — give it a title and body", "info")}><Icon name="plus" size={15} />New prompt</button>
      </div>

      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search prompts…" width={240} />
        <div className="seg" style={{ flexWrap: "wrap" }}>
          <button data-on={cat === "all"} onClick={() => setCat("all")}>All</button>
          {PROMPT_CATS.map(c => <button key={c} data-on={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="chip" data-on={onlyFav} onClick={() => setOnlyFav(!onlyFav)}><Icon name="bookmark" size={13} fill={onlyFav} />Favorites</button>
      </div>

      {filtered.length === 0 ? <div className="card"><EmptyState icon="bookmark" title="No prompts match" sub="Try a different category or clear the search." /></div> : (
        <div className="grid g-3">
          {filtered.map(p => (
            <div key={p.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 11, cursor: "pointer" }} onClick={() => setOpen(p.id)}>
              <div className="row" style={{ gap: 9 }}>
                <span className="badge sq" style={{ fontSize: 10.5, color: catColor[p.category], borderColor: catColor[p.category] + "55", background: catColor[p.category] + "1a" }}>{p.category}</span>
                <button className="icon-btn" style={{ width: 26, height: 26, marginLeft: "auto", color: p.fav ? "var(--r-med)" : "var(--tx-lo)" }} onClick={e => { e.stopPropagation(); toggleFav(p.id); }}><Icon name="bookmark" size={15} fill={p.fav} /></button>
              </div>
              <b style={{ fontSize: 14.5, letterSpacing: "-0.01em" }}>{p.title}</b>
              <div className="code-well" style={{ fontSize: 11.5, padding: "11px 13px", maxHeight: 96, overflow: "hidden", position: "relative", lineHeight: 1.55 }}>
                {p.body}
                <span style={{ position: "absolute", inset: "auto 0 0 0", height: 34, background: "linear-gradient(transparent, var(--bg-inset))" }} />
              </div>
              <div className="row" style={{ gap: 8, fontSize: 11, paddingTop: 6 }}>
                {p.vars.length > 0 && <span className="row faint" style={{ gap: 4 }}><Icon name="sliders" size={12} />{p.vars.length} {p.vars.length === 1 ? "variable" : "variables"}</span>}
                <span className="faint" style={{ marginLeft: "auto" }}>{p.uses}× used</span>
                <button className="btn btn-sm" style={{ padding: "4px 9px" }} onClick={e => { e.stopPropagation(); toast("Copied “" + p.title + "”", "success"); }}><Icon name="copy" size={13} />Copy</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cur && (
        <Drawer open onClose={() => setOpen(null)} width={500}>
          <div className="drawer-hd">
            <div className="col" style={{ gap: 4, flex: 1 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge sq" style={{ fontSize: 10.5, color: catColor[cur.category], borderColor: catColor[cur.category] + "55", background: catColor[cur.category] + "1a" }}>{cur.category}</span>
                <span className="faint" style={{ fontSize: 11 }}>{cur.uses}× used · {cur.updated}</span>
              </div>
              <b style={{ fontSize: 16 }}>{cur.title}</b>
            </div>
            <button className="icon-btn" onClick={() => toggleFav(cur.id)} style={{ color: cur.fav ? "var(--r-med)" : "var(--tx-lo)" }}><Icon name="bookmark" size={17} fill={cur.fav} /></button>
            <button className="icon-btn" onClick={() => setOpen(null)}><Icon name="x" size={17} /></button>
          </div>
          <div className="drawer-body col" style={{ gap: 16 }}>
            <div className="col" style={{ gap: 7 }}>
              <span className="panel-title">Prompt</span>
              <Code code={cur.body} lang="md" />
            </div>
            {cur.vars.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                <span className="panel-title">Variables — fill before running</span>
                {cur.vars.map(v => (
                  <div key={v} className="col" style={{ gap: 4 }}>
                    <label className="mono faint" style={{ fontSize: 11 }}>{"{{" + v + "}}"}</label>
                    <div className="field-input"><input placeholder={"Enter " + v + "…"} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="drawer-foot">
            <button className="btn" onClick={() => share && share({ kind: "prompt", name: cur.title, scope: "user", body: cur.body })}><Icon name="link" size={15} />Share</button>
            <button className="btn" onClick={() => toast("Sent to playground", "info")}><Icon name="flask" size={15} />Test</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => toast("Copied “" + cur.title + "” to clipboard", "success")}><Icon name="copy" size={15} />Copy prompt</button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

export { PromptLibrary };

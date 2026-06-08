/* app.jsx — root: state, routing, providers */
import React from "react";
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakSelect, TweakRadio } from "./tweaks-panel.jsx";
import { ACCENTS, TWEAK_DEFAULTS } from "./theme.js";
import { WORKSPACES, MCP_PROFILES, MCPS } from "./data.jsx";
import { Sidebar, Topbar, StatusBar, ToastHost } from "./shell.jsx";
import { CommandPalette } from "./palette.jsx";
import { Dashboard } from "./dashboard.jsx";
import { Skills } from "./skills.jsx";
import { MCPManager } from "./mcp.jsx";
import { MemoryManager } from "./memory.jsx";
import { ToolsHub } from "./tools.jsx";
import { Security } from "./security.jsx";
import { TokenUsage } from "./tokens.jsx";
import { ConfigFiles } from "./config.jsx";
import { Commands, Subagents } from "./agents.jsx";
import { PromptLibrary } from "./library.jsx";
import { BestPractices, Tutorial } from "./learn.jsx";
import { ResourceDrawer } from "./drawer.jsx";
import { ShareModal } from "./share.jsx";
import { Onboarding } from "./onboarding.jsx";
import { Settings } from "./settings.jsx";

const { useState: aS, useEffect: aE, useCallback: aC, useRef: aRef } = React;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = aS("dashboard");
  const [scope, setScope] = aS("project");
  const [ws, setWs] = aS(WORKSPACES[0]);
  const [paletteOpen, setPaletteOpen] = aS(false);
  const [toasts, setToasts] = aS([]);
  const [resource, setResource] = aS(null);
  const [profileId, setProfileId] = aS(MCP_PROFILES.find(p => p.active).id);
  const [showOnboarding, setShowOnboarding] = aS(false);
  const [theme, setTheme] = aS(() => localStorage.getItem("aitoolsos_theme") || "dark");
  const [shareRes, setShareRes] = aS(null);
  const tid = aRef(0);

  const profile = MCP_PROFILES.find(p => p.id === profileId);

  const toast = aC((msg, kind = "success") => {
    const id = ++tid.current;
    setToasts(ts => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 3600);
  }, []);
  const dismiss = (id) => setToasts(ts => ts.filter(x => x.id !== id));
  const setProfile = (id) => setProfileId(id);
  const openResource = (r) => setResource(r);
  const share = (r) => setShareRes(r);

  const nav = aC((v) => { if (v === "onboarding") { setShowOnboarding(true); return; } setView(v); }, []);

  // apply tweaks -> CSS vars
  aE(() => {
    const root = document.documentElement;
    const a = ACCENTS[t.accent] || ACCENTS["#2bd4a0"];
    root.style.setProperty("--ac", a.ac); root.style.setProperty("--ac-2", a.ac2);
    root.style.setProperty("--ac-dim", a.dim); root.style.setProperty("--ac-line", a.line);
    root.style.setProperty("--ac-glow", a.glow);
    root.style.setProperty("--r-safe", a.ac); root.style.setProperty("--r-safe-bg", a.dim);
    root.style.setProperty("--sans", `"${t.font}", ui-sans-serif, system-ui, sans-serif`);
    root.setAttribute("data-density", t.density);
    root.setAttribute("data-surface", t.surface);
    root.setAttribute("data-risk", t.riskStyle);
    // primary button text color contrast
    root.style.setProperty("--ac-on", a.on);
  }, [t.accent, t.font, t.density, t.surface, t.riskStyle]);

  // apply theme
  aE(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aitoolsos_theme", theme);
  }, [theme]);

  // keyboard
  aE(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(o => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setPaletteOpen(true); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // Onboarding is opt-in: first run lands directly on the dashboard.
  // Open the guided tour anytime from the sidebar "Onboarding" button.
  const finishOnboarding = () => { localStorage.setItem("aitoolsos_onboarded", "1"); setShowOnboarding(false); toast("Welcome to AI Tools OS", "success"); };

  const screenProps = { nav, toast, scope, setScope, openResource, profile, setProfile, ws, theme, setTheme, share };

  let Screen;
  switch (view) {
    case "dashboard": Screen = <Dashboard {...screenProps} setProfile={setProfile} />; break;
    case "skills": Screen = <Skills {...screenProps} />; break;
    case "mcp": Screen = <MCPManager {...screenProps} profileId={profileId} />; break;
    case "memory": Screen = <MemoryManager {...screenProps} />; break;
    case "tools": Screen = <ToolsHub {...screenProps} />; break;
    case "security": Screen = <Security {...screenProps} />; break;
    case "tokens": Screen = <TokenUsage {...screenProps} />; break;
    case "config": Screen = <ConfigFiles {...screenProps} />; break;
    case "commands": Screen = <Commands {...screenProps} />; break;
    case "subagents": Screen = <Subagents {...screenProps} />; break;
    case "prompts": Screen = <PromptLibrary {...screenProps} />; break;
    case "practices": Screen = <BestPractices {...screenProps} />; break;
    case "tutorial": Screen = <Tutorial {...screenProps} />; break;
    case "settings": Screen = <Settings {...screenProps} t={t} setTweak={setTweak} />; break;
    default: Screen = <Dashboard {...screenProps} setProfile={setProfile} />;
  }

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} scope={scope} setScope={setScope} toast={toast} onOnboarding={() => setShowOnboarding(true)} />
      <Topbar view={view} ws={ws} setWs={setWs} scope={scope} openPalette={() => setPaletteOpen(true)} toast={toast} theme={theme} setTheme={setTheme} />
      <main className="main" key={view}>{Screen}</main>
      <StatusBar scope={scope} profileName={profile.name} profileTokens={profile.tokens} mcpActive={MCPS.filter(m => m.state === "running").length} />

      {resource && <ResourceDrawer resource={resource} onClose={() => setResource(null)} toast={toast} nav={nav} share={share} />}
      {shareRes && <ShareModal resource={shareRes} onClose={() => setShareRes(null)} toast={toast} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={(v) => { nav(v); }} toast={toast} setProfile={setProfile} />
      {showOnboarding && <Onboarding onFinish={finishOnboarding} onSkip={finishOnboarding} nav={nav} setProfile={setProfile} />}
      <ToastHost toasts={toasts} dismiss={dismiss} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={Object.keys(ACCENTS)} onChange={(v) => setTweak("accent", v)} />
        <TweakSelect label="UI font" value={t.font} options={["Hanken Grotesk", "Public Sans", "IBM Plex Sans", "Albert Sans", "Space Grotesk"]} onChange={(v) => setTweak("font", v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakRadio label="Surfaces" value={t.surface} options={["solid", "glass"]} onChange={(v) => setTweak("surface", v)} />
        <TweakSection label="Safety" />
        <TweakRadio label="Risk colors" value={t.riskStyle} options={["vivid", "muted"]} onChange={(v) => setTweak("riskStyle", v)} />
      </TweaksPanel>
    </div>
  );
}

export { App };

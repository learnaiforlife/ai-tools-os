import './styles.css';
import release from './release.json';
import { getReleaseInfo } from './release-info.js';

document.querySelector('#app').innerHTML = `
  <main>
    <section class="hero">
      <nav class="nav" aria-label="Primary"><a class="brand" href="/" aria-label="AI Tools OS home"><span class="mark">AI</span><span>AI Tools OS</span></a><a class="nav-link" href="#install">Installation</a></nav>
      <div class="hero-grid"><div class="hero-copy"><p class="eyebrow">Your AI workspace, together</p><h1>Your AI tools.<br />Your configuration.<br />One place.</h1>
        <p class="lede">Understand your Claude Code, Codex and Cursor workspace. See session context, improve instructions with your AI engine, and clean up unused resources with recoverable changes.</p>
        <div class="actions" id="downloads"></div><p class="fine-print" id="release-status"></p>
      </div><div class="product-shot" style="padding:32px"><h2>A clearer view of your AI tools</h2><p>Session activity and measured context, where reported</p><p>Unused MCP recommendations with evidence</p><p>Quick skill evaluations and advanced A/B tests</p><p>Readable Markdown, AI enhancement and bulk review</p><p>Local configuration. Your installed AI engines.</p></div></div>
    </section>
    <section class="band"><div class="feature-grid"><article><h2>Understand each session</h2><p>Explore recorded input usage, tool calls and instruction references. Missing telemetry stays clearly marked as unavailable.</p></article><article><h2>Improve with your AI</h2><p>Use Claude Code, Codex CLI or Cursor Agent for drafts, reviews and evaluations. Start simply, or choose your engine and model. Local checks work without AI.</p></article><article><h2>Keep things organized</h2><p>Filter by user, project or folder. Review cleanup suggestions, move resources, and restore backed-up changes. Light, dark and system appearance.</p></article></div></section>
    <section id="install" class="install"><div><p class="eyebrow">Installation</p><h2>macOS 13 or later</h2><div class="actions" id="install-downloads"></div><p class="fine-print" id="install-status"></p></div><ol><li>Choose the download for your Mac: Apple Silicon or Intel.</li><li>Open the DMG and drag AI Tools OS into Applications.</li><li>Open the app and choose the project folders you want it to discover. If macOS requests access to Documents or a selected folder, choose Allow to include its configuration in the scan.</li><li id="first-launch"></li></ol></section>
  </main>`;
const info = getReleaseInfo(release);
for (const selector of ['#downloads', '#install-downloads']) {
  const downloads = document.querySelector(selector);
  for (const item of info.downloads) {
    const anchor = document.createElement('a'); anchor.className = 'button primary'; anchor.href = item.url; anchor.textContent = item.label;
    anchor.title = `${Math.round(item.size / 1024 / 1024)} MB DMG${info.beta ? ' · Beta' : ''}`; downloads.append(anchor);
  }
}
for (const selector of ['#release-status', '#install-status']) document.querySelector(selector).textContent = info.status;
const firstLaunch = document.querySelector('#first-launch');
if (info.needsApproval) {
  firstLaunch.append('This beta is not Apple notarized. If macOS blocks it, click Done, open System Settings → Privacy & Security, then choose Open Anyway for AI Tools OS and approve the next prompt. Only do this for a download you trust. See ');
  const guide = document.createElement('a'); guide.href = 'https://support.apple.com/en-us/102445'; guide.textContent = 'Apple’s instructions for opening an app from an unidentified developer'; firstLaunch.append(guide, '.');
} else firstLaunch.textContent = 'Review the macOS first-launch prompt before opening the app.';

import './styles.css';
import release from './release.json';
import { getReleaseInfo } from './release-info.js';

document.querySelector('#app').innerHTML = `
  <main>
    <section class="hero">
      <nav class="nav" aria-label="Primary"><a class="brand" href="/" aria-label="AI Tools OS home"><span class="mark">AI</span><span>AI Tools OS</span></a><a class="nav-link" href="#install">Installation</a></nav>
      <div class="hero-grid"><div class="hero-copy"><p class="eyebrow">Local macOS configuration manager</p><h1>Your AI tools.<br />Your configuration.<br />One place.</h1>
        <p class="lede">Discover native Claude Code, Codex and Cursor configuration on your Mac. Inspect complete files, make careful edits, and restore backed-up changes.</p>
        <div class="actions" id="downloads"></div><p class="fine-print" id="release-status"></p>
      </div><div class="product-shot" style="padding:32px"><h2>Built around your actual files</h2><p>Provider and project source paths</p><p>Complete Markdown, JSON and TOML editing</p><p>Conflict detection and private backup history</p><p>Reversible resource disable and restore</p><p>No account. No cloud configuration service.</p></div></div>
    </section>
    <section class="band"><div class="feature-grid"><article><h2>Machine discovery</h2><p>Detect native user locations and add your project folders. Custom provider paths are supported.</p></article><article><h2>Source-aware changes</h2><p>Edit the selected provider and project. Same-named resources in other projects retain their own identity.</p></article><article><h2>Recoverable edits</h2><p>Writes preserve permissions and detect changed files. Private transaction history supports review and recovery.</p></article></div></section>
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

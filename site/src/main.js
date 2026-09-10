import './styles.css';
import release from './release.json';

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
    <section id="install" class="install"><div><p class="eyebrow">Installation</p><h2>macOS 13 or later</h2></div><ol><li>Choose the verified installer for Apple Silicon or Intel when a signed release is available.</li><li>Open the DMG and drag AI Tools OS into Applications.</li><li>Open the app and choose the project folders you want it to discover.</li><li>If macOS rejects an installer, stop and obtain a verified release. Do not remove quarantine protection.</li></ol></section>
  </main>`;
const downloads = document.querySelector('#downloads'), status = document.querySelector('#release-status');
if (!release.available) {
  status.textContent = `Version ${release.version} is undergoing release validation. Signed installers are not yet available here.`;
} else {
  const dmgs = release.artifacts.filter(a => a.name.endsWith('.dmg'));
  if (dmgs.length !== 2 || !['arm64', 'x64'].every(arch => dmgs.some(a => a.arch === arch))) throw Error('Release manifest must contain both Mac architectures.');
  for (const item of dmgs) {
    const url = new URL(item.url); if (url.protocol !== 'https:') throw Error('Installer URL must use HTTPS.');
    const anchor = document.createElement('a'); anchor.className = 'button primary'; anchor.href = url.href; anchor.textContent = item.arch === 'arm64' ? 'Download for Apple Silicon' : 'Download for Intel';
    downloads.append(anchor);
  }
  status.textContent = `Version ${release.version}. macOS ${release.minMacOS} or later. Developer ID signed and notarized.`;
}

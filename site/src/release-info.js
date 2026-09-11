// Release metadata describes a published build, never the visitor's machine.
export function getReleaseInfo(release) {
  if (!release.available) return { downloads: [], status: `Version ${release.version} is undergoing release validation. Downloads will appear here when a build is published.`, beta: false, needsApproval: false };
  if (!['beta', 'stable'].includes(release.channel) || !['unsigned', 'ad-hoc', 'developer-id-notarized'].includes(release.verification)) throw Error('Specify the release channel and signing status.');
  const signed = release.verification === 'developer-id-notarized';
  if (release.channel === 'stable' && !signed) throw Error('Stable releases require Developer ID signing and notarization.');
  const dmgs = release.artifacts.filter(a => a.name.endsWith('.dmg'));
  if (dmgs.length !== 2 || !['arm64', 'x64'].every(arch => dmgs.some(a => a.arch === arch))) throw Error('Release manifest must contain both Mac architectures.');
  const downloads = dmgs.map(item => {
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Installer URLs must use HTTPS without embedded credentials.');
    if (!Number.isSafeInteger(item.size) || item.size <= 0 || !/^[A-Za-z0-9+/]{86}==$/.test(item.sha512)) throw Error('Each installer needs its final size and SHA-512 checksum.');
    return { ...item, url: url.href, label: item.arch === 'arm64' ? 'Download for Apple Silicon' : 'Download for Intel' };
  });
  const beta = release.channel === 'beta';
  return { downloads, beta, needsApproval: !signed,
    status: `Version ${release.version}${beta ? ' beta' : ''}. macOS ${release.minMacOS} or later. ${signed ? 'Developer ID signed and notarized.' : 'No Apple Developer ID signature or notarization. macOS may require your approval on first launch.'}` };
}

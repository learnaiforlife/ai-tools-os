import { dirname, join } from 'node:path';
import { executable } from '../processes.mjs';

export function engineEnvironment(id, home, env, path) {
  const keys = ['PATH', 'TMPDIR', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY'];
  const auth = id === 'claude' ? ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'] : id === 'codex' ? ['CODEX_HOME', 'OPENAI_API_KEY'] : ['CURSOR_API_KEY'];
  const clean = Object.fromEntries([...keys, ...auth].filter(k => typeof env[k] === 'string').map(k => [k, env[k]]));
  const node = executable('node', home, env);
  clean.HOME = home;
  clean.PATH = [...new Set([dirname(path), ...(node ? [dirname(node)] : []), ...(env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(':')])].join(':');
  if (id === 'codex') clean.CODEX_HOME ||= join(home, '.codex');
  if (id === 'claude') clean.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  return clean;
}

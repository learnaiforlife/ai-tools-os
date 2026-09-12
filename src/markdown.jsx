import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { copyText } from './api.js';
export function Markdown({ content = '', label = 'Rendered Markdown' }) {
  const [error, setError] = useState('');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  return <div className="markdown-reader" aria-label={label}>
    {header && <details className="md-metadata"><summary>Document properties</summary><pre>{header[1]}</pre></details>}
    {error && <p role="alert">{error}</p>}
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      a: ({ href, children }) => /^https?:\/\//i.test(href || '') ? <a href={href} onClick={async e => { e.preventDefault(); try { if (window.aios?.openLink) { const r = await window.aios.openLink(href); if (!r.ok) throw Error(r.error); } else { await copyText(href); setError('Link copied. Open it in your browser.'); } } catch (e) { setError(e.message); } }}>{children}<span aria-hidden="true"> ↗</span></a> : <span title={href || 'Local or unsupported link'}>{children}</span>,
      img: ({ alt }) => <span className="md-image-placeholder">Image: {alt || 'Embedded image'} · external images are not loaded</span>,
    }}>{header ? content.slice(header[0].length) : content}</ReactMarkdown>
  </div>;
}

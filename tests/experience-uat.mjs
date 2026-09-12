import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
export function seedExperienceUat(home) {
  const put = (path, content) => { const p = join(home, path); fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
  put('.claude/skills/readable/SKILL.md', '---\nname: Readable skill\ndescription: A readable instruction\n---\n# Readable guide\n\n- A clear first step\n- A clear second step\n\n| Input | Output |\n| --- | --- |\n| text | ORIGINAL |\n\n<script>window.UAT_UNSAFE=true</script>\n![Remote](https://example.invalid/tracker.png)\n');
  put('.claude/commands/readable-copy.md', '# Reusable command\nKeep precise project instructions here.\n');
  put('Documents/Lab project/.claude/commands/readable-copy.md', '# Reusable command\nKeep precise project instructions here.\n');
  put('.claude.json', JSON.stringify({ mcpServers: { 'unused-uat': { command: 'fixture-only', args: [] } } }));
  for (let n = 1; n <= 3; n++) {
    const timestamp = `2026-09-${String(12 - n).padStart(2, '0')}T10:00:00.000Z`;
    put(`.claude/projects/uat/session-${n}.jsonl`, [
      { type: 'user', timestamp, sessionId: `experience-session-${n}`, cwd: join(home, 'Documents/Lab project'), message: { content: 'PRIVATE_UAT_MESSAGE' } },
      { type: 'attachment', timestamp, attachment: { type: 'deferred_tools_delta', addedNames: ['mcp__unused-uat__query'] } },
      { type: 'assistant', timestamp, message: { id: `m-${n}`, model: 'fixture-model', stop_reason: 'end_turn', content: [], usage: { input_tokens: 100 * n, output_tokens: 20 } } },
    ].map(o => JSON.stringify(o)).join('\n') + '\n');
  }
}
export async function runExperienceUat({ evaluate: js, home, output, screenshot, probe }) {
  const pause = () => new Promise(r => setTimeout(r, 50));
  const wait = async code => { for (let i = 0; i < 800; i++) { if (await js(code)) return; await pause(); } throw Error(`Experience UAT timeout: ${code}`); };
  const button = async (text, scope = 'button') => { await wait(`!![...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`); await js(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`); await pause(); };
  const nav = async text => { await js(`[...document.querySelectorAll('.wb-sidebar nav button')].find(b=>b.innerText.startsWith(${JSON.stringify(text)})).click()`); await pause(); };
  const value = async (selector, value) => { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause(); };
  await js('window.confirm=()=>true;true'); await nav('Overview'); await button('All sources', '.scope-tabs button'); await value('[aria-label="Provider"]', 'all'); await button('Sync');
  await wait("!document.querySelector('.wb-topbar button:disabled')");
  await probe('New overview exposes checkup, context and official news preferences', async () => {
    assert.ok(await js("!!document.querySelector('.workspace-hero') && !!document.querySelector('.ai-checkup') && !!document.querySelector('.news-card')"));
    await button('Customize with a prompt'); await value('.news-config textarea', 'Only Claude model releases in the last 7 days'); await button('Preview news preferences'); await wait("document.querySelector('.news-config').innerText.includes('last 7 days')");
    await button('Save news preferences'); const saved = await js("window.aios.request('preferences.experience.get')"); assert.equal(saved.preferences.newsPrompt, 'Only Claude model releases in the last 7 days');
    await js("document.querySelector('.wb-main').scrollTop=0;true"); await pause();
    if (screenshot) fs.writeFileSync(join(output, 'experience-home.png'), await screenshot());
  });
  await probe('Resource reader renders Markdown tables and rejects scripts and remote image loads', async () => {
    await nav('Skills'); await button('Readable skill'); await wait("!!document.querySelector('dialog .markdown-reader table')");
    assert.equal(await js('window.UAT_UNSAFE'), undefined); assert.equal(await js("document.querySelectorAll('dialog .markdown-reader img').length"), 0); assert.equal(await js("!!document.querySelector('dialog [aria-label=\"File content\"]')"), false);
    if (screenshot) fs.writeFileSync(join(output, 'experience-markdown.png'), await screenshot());
    await button('Edit source'); await wait("document.querySelector('[aria-label=\"File content\"]')?.value.includes('# Readable guide')"); await button('Close', 'dialog button');
  });
  await probe('Resource pages offer compact actions, search, state sorting and scope tabs', async () => {
    await value('[aria-label="Search resources"]', 'Readable'); assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 1);
    assert.equal(await js("document.querySelector('.action-menu').open"), false); await js("document.querySelector('.action-menu summary').click()"); assert.ok(await js("document.querySelector('.action-menu').open"));
    await button('Enhance with options'); await wait("!!document.querySelector('dialog')"); assert.ok((await js("document.querySelector('dialog').innerText")).includes('Choose engine')); await button('Close', 'dialog button');
    await value('[aria-label="Sort resources"]', 'size'); await button('Folder', '.scope-tabs button'); await value('[aria-label="Project"]', join(home, 'Documents/Lab project')); assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 0);
    await button('User', '.scope-tabs button'); assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 1); await value('[aria-label="Search resources"]', ''); await button('All sources', '.scope-tabs button');
  });
  await probe('Session page shows measured usage and three-session non-use with evidence', async () => {
    await nav('Sessions'); await button('Refresh sessions'); await wait("document.querySelectorAll('.session-item').length >= 3");
    await button('Project', '.scope-tabs button'); await value('[aria-label="Project"]', ''); assert.ok(await js("document.querySelectorAll('.session-item').length >= 3")); await button('All sources', '.scope-tabs button');
    if (screenshot) fs.writeFileSync(join(output, 'experience-sessions.png'), await screenshot());
    const text = await js("document.querySelector('main').innerText"); assert.ok(text.includes('first request, including prompt')); assert.ok(!text.includes('PRIVATE_UAT_MESSAGE'));
    await nav('Cleanup'); await wait("document.querySelector('main').innerText.includes('unused-uat: no calls recorded in 3 sessions')"); assert.ok((await js("document.querySelector('main').innerText")).includes('observed availability'));
    if (screenshot) fs.writeFileSync(join(output, 'experience-cleanup.png'), await screenshot());
  });
  await probe('Cleanup requires review and changes only the selected MCP, with restore available', async () => {
    await button('Review disable'); await wait("!!document.querySelector('dialog .wb-check input')"); assert.equal(await js("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Apply cleanup').disabled"), true);
    await js("document.querySelector('dialog .wb-check input').click()"); await button('Apply cleanup'); await wait("!document.querySelector('dialog')"); assert.equal(JSON.parse(fs.readFileSync(join(home, '.claude.json'))).mcpServers['unused-uat'], undefined);
    await nav('MCP servers'); const row = "[...document.querySelectorAll('.wb-resource')].find(r=>r.textContent.includes('unused-uat'))"; await wait(`${row}?.textContent.includes('Disabled')`);
    await js(`${row}.querySelector('.action-menu summary').click()`); await js(`${row}.querySelector('[aria-label^="Restore"]').click()`); await wait(`window.aios.request('inventory').then(r=>r.resources.some(s=>s.name==='unused-uat'&&s.enabled))`);
  });
  await probe('Quick Skill Lab generates and runs tests without exposing advanced form options', async () => {
    await nav('Skill Lab'); await button('Quick evaluation'); const id = await js("[...document.querySelector('[aria-label=\"Evaluation resource\"]').options].find(o=>o.textContent.startsWith('Lab UAT skill')).value"); await value('[aria-label="Evaluation resource"]', id);
    assert.equal(await js("!!document.querySelector('[aria-label=\"Test suite\"]')"), false); await button('Run quick evaluation'); await wait("document.querySelector('.score-card strong')?.textContent==='100.0%'"); assert.ok((await js("document.querySelector('.lab-result').innerText")).includes('AI-generated text tests'));
    if (screenshot) fs.writeFileSync(join(output, 'experience-quick-eval.png'), await screenshot());
  });
  await probe('Enhance uses the saved engine and requires a separate revision-bound save', async () => {
    await nav('Skills'); const path = join(home, '.claude/skills/lab/SKILL.md'), original = fs.readFileSync(path, 'utf8'); const row = "[...document.querySelectorAll('.wb-resource')].find(r=>r.textContent.includes('Lab UAT skill'))";
    await js(`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='Enhance with AI').click()`); await wait("!![...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Review & save in editor')"); assert.equal(fs.readFileSync(path, 'utf8'), original);
    await button('Review & save in editor'); await wait("!!document.querySelector('dialog .wb-diff')"); await button('Save changes'); await wait("!document.querySelector('dialog')"); assert.ok(fs.readFileSync(path, 'utf8').includes('CANDIDATE'));
  });
  await probe('Home bulk review shows token warning, findings and navigable per-file improvements', async () => {
    await nav('Overview'); await button('Review skills & memory with AI'); assert.ok((await js("document.querySelector('dialog').innerText")).includes('substantially more tokens'));
    await button('Start AI review'); await wait("!!document.querySelector('dialog .review-finding')"); assert.ok((await js("document.querySelector('dialog').innerText")).includes('resources reviewed')); await button('Close', 'dialog button');
  });
  await probe('Observer setup preserves hooks and its installed executable records only future metadata', async () => {
    await nav('Settings'); await button('Preview observer installation');
    const observer = "[...document.querySelectorAll('main section')].find(s=>s.querySelector('h2')?.textContent==='Local activity observer')";
    await wait(`!!${observer}.querySelector('.wb-check input')`);
    assert.equal(await js(`[...${observer}.querySelectorAll('button')].find(b=>b.textContent==='Apply observer changes').disabled`), true);
    await js(`${observer}.querySelector('.wb-check input').click()`); await button('Apply observer changes'); await wait(`${observer}.textContent.includes('Observer installed.')`);
    const native = JSON.parse(fs.readFileSync(join(home, '.cursor/hooks.json'), 'utf8'));
    for (const hook_event_name of ['sessionStart', 'beforeSubmitPrompt', 'afterMCPExecution', 'stop']) {
      const input = JSON.stringify({ conversation_id: 'observer-uat', hook_event_name, workspace_roots: [join(home, 'Documents/Lab project')], tool_name: hook_event_name === 'afterMCPExecution' ? 'query' : undefined, mcp_server_name: hook_event_name === 'afterMCPExecution' ? 'uat' : undefined, status: 'completed', prompt: 'PRIVATE_OBSERVER_INPUT', result_json: 'PRIVATE_OBSERVER_RESULT' });
      execFileSync('/bin/sh', ['-c', native.hooks[hook_event_name].find(h => h.command.includes('--capture')).command], { input, timeout: 10000 });
    }
    const records = fs.readdirSync(join(home, '.aios/activity')).filter(n=>n.endsWith('.jsonl')).map(n=>fs.readFileSync(join(home, '.aios/activity',n),'utf8')).join('');
    assert.ok(records.includes('mcp__uat__query')); assert.ok(!records.includes('PRIVATE_OBSERVER'));
    let insight; for (let i = 0; i < 100; i++) { insight = await js("window.aios.lab('insights.sessions', { resources: [] })"); if (insight.code !== 'BUSY') break; await pause(); } assert.ok(insight.ok, insight.error);
    const captured = insight.sessions.find(s => s.nativeId === 'observer-uat'); assert.ok(captured); assert.equal(captured.partial, false); assert.equal(captured.toolCalls, 1); assert.equal(captured.completed, true);
    await button('Preview observer removal'); await wait(`!!${observer}.querySelector('.wb-check input')`); await js(`${observer}.querySelector('.wb-check input').click()`); await button('Apply observer changes'); await wait(`${observer}.textContent.includes('Observer removed.')`);
    assert.ok(!fs.readFileSync(join(home, '.cursor/hooks.json'),'utf8').includes('--capture'));
  });
  await probe('Context explorer separates estimates from measured session input', async () => {
    await nav('Context explorer'); assert.ok((await js("document.querySelector('main').innerText")).includes('not startup context')); assert.ok(await js("!!document.querySelector('.context-stack') && !!document.querySelector('.context-live')"));
    if (screenshot) fs.writeFileSync(join(output, 'experience-context.png'), await screenshot());
  });
}

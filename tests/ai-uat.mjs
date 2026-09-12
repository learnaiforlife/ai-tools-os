import * as fs from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

export async function runAIUat({ evaluate: js, home, output, screenshot, probe }) {
  const pause = () => new Promise(r => setTimeout(r, 40));
  const wait = async expression => { for (let i = 0; i < 600; i++) { if (await js(expression)) return; await pause(); } throw Error(`AI UAT timeout: ${expression}`); };
  const button = async name => { await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(name)});if(!e||e.disabled)throw Error('Unavailable button: '+${JSON.stringify(name)});e.click()})()`); await pause(); };
  const nav = async name => { await js(`(()=>{const e=[...document.querySelectorAll('.wb-sidebar nav button')].find(e=>e.innerText.startsWith(${JSON.stringify(name)}));if(!e)throw Error('Missing page');e.click()})()`); await pause(); };
  const value = async (selector, text) => { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause(); };
  const field = async (label, text) => { const selector = await js(`(()=>{const e=[...document.querySelectorAll('dialog label.wb-field')].find(e=>e.querySelector('span')?.textContent===${JSON.stringify(label)})?.querySelector('input,select,textarea');if(!e)throw Error('Missing labeled field');e.setAttribute('data-ai-uat-field','current');return '[data-ai-uat-field="current"]'})()`); await value(selector, text); await js("document.querySelector('[data-ai-uat-field]')?.removeAttribute('data-ai-uat-field')"); };
  const create = async (page, kind, name, provider, local) => {
    await nav(page); await button(`New ${kind}`); await field('Name', name); if (provider) await field('Provider', provider);
    await js("document.querySelector('dialog details').open=true"); await value('[aria-label="Creation goal"]', 'Create a precise summary with facts from supplied text and clearly stated assumptions.');
    if (!local) await value('dialog [aria-label="AI engine"]', 'claude');
    await button(local ? 'Use local template' : 'Generate draft');
    await wait("!!document.querySelector('[aria-label=\"Generated resource draft\"]')");
    assert.equal(fs.existsSync(join(home, '.claude/skills', name, 'SKILL.md')), false, 'Generation must not install the skill');
    await button('Put draft in editor'); assert.ok((await js("document.querySelector('[aria-label=\"New resource content\"]').value")).includes(local ? 'Inputs' : 'AI_DRAFT_UAT'));
    await button('Create resource'); await wait("!document.querySelector('dialog')");
  };
  await probe('AI settings save locally and executable readiness is visible', async () => {
    await nav('Settings'); await wait("!!document.querySelector('[aria-label=\"AI engine\"]')");
    const oldTheme = await js("document.querySelector('[aria-label=\"Appearance\"]').value"), draftTheme = oldTheme === 'light' ? 'dark' : 'light';
    await value('[aria-label="Appearance"]', draftTheme); await value('[aria-label="AI engine"]', 'claude'); await button('Save AI preferences');
    await wait("document.querySelector('main').innerText.includes('AI preferences saved.')");
    assert.equal(await js("document.querySelector('[aria-label=\"Appearance\"]').value"), draftTheme, 'Saving AI preferences must preserve a pending appearance edit');
    await value('[aria-label="Appearance"]', oldTheme); await button('Check installed engines');
    await wait("document.querySelector('main').innerText.includes('UAT CLI double')");
    assert.equal((await js("window.aios.request('preferences.ai.get')")).preferences.engine, 'claude');
    await js("document.querySelector('[aria-label=\"AI engine\"]').closest('section').scrollIntoView({block:'start'})");
    if (screenshot) fs.writeFileSync(join(output, 'ai-engines.png'), await screenshot());
  });
  await probe('AI skill drafting requires a separate reviewed editor save', async () => {
    await create('Skills', 'skills', 'ai-created', 'Claude Code', false);
    assert.ok(fs.readFileSync(join(home, '.claude/skills/ai-created/SKILL.md'), 'utf8').includes('AI_DRAFT_UAT'));
  });
  await probe('Local-only subagent creation renders native Codex TOML', async () => {
    await create('Subagents', 'agents', 'local-agent', 'Codex', true);
    const text = fs.readFileSync(join(home, '.codex/agents/local-agent.toml'), 'utf8'); assert.ok(text.includes('developer_instructions =')); assert.ok(text.includes('Inputs'));
  });
  await probe('Prompt creation uses AI drafts and persists a conflict revision', async () => {
    await nav('Prompt library'); await button('New prompt'); await field('Prompt name', 'AI prompt'); await js("document.querySelector('dialog details').open=true"); await value('[aria-label="Creation goal"]', 'Summarize {{document}} and keep supplied facts.'); await value('dialog [aria-label="AI engine"]', 'claude'); await button('Generate draft');
    await wait("!!document.querySelector('[aria-label=\"Generated resource draft\"]')"); await button('Put draft in editor'); await button('Save prompt'); await wait("!document.querySelector('dialog')");
    const p = (await js("window.aios.request('inventory')")).prompts.find(p => p.name === 'AI prompt'); assert.ok(p.revision); assert.ok(p.content.includes('AI_DRAFT_UAT'));
  });
  await probe('Resource security review has local findings, validated AI evidence and context preview', async () => {
    await nav('Security review'); await button('Select first 30 visible resources'); await button('Preview context'); await wait("document.querySelector('main').innerText.includes('Selected context after')"); await value('[aria-label="AI engine"]', 'claude'); await button('Review with selected engine');
    await wait("document.querySelector('main').innerText.includes('Resource review completed.')"); assert.ok((await js("document.querySelector('main').innerText")).includes('AI review'));
    if (screenshot) fs.writeFileSync(join(output, 'ai-resource-review.png'), await screenshot());
  });
  await probe('Skill Lab generates editable tests and supports prompt and agent selections', async () => {
    await nav('Skill Lab'); await button('Advanced');
    const items = await js("[...document.querySelector('[aria-label=\"Evaluation resource\"]').options].map(o=>({value:o.value,label:o.textContent}))"); assert.ok(items.some(o => o.label.includes('local-agent'))); assert.ok(items.some(o => o.label.includes('AI prompt')));
    await value('[aria-label="Evaluation resource"]', items.find(o => o.label.includes('ai-created')).value); await value('[aria-label="AI engine"]', 'claude'); await button('Generate test cases');
    await wait("document.querySelector('.lab-result')?.innerText.includes('Review training and held-out coverage')"); await button('Use generated tests');
    await wait("document.querySelector('[aria-label=\"Test suite\"]')?.value.includes('heldout')"); assert.ok(JSON.parse(await js("document.querySelector('[aria-label=\"Test suite\"]').value")).evals.some(t => t.holdout));
    if (screenshot) fs.writeFileSync(join(output, 'ai-suite-generation.png'), await screenshot());
  });
  await probe('Prompt A/B tests require variables and use the same fixture values for both versions', async () => {
    const saved = await js("window.aios.request('prompts.save',{prompt:{name:'Variable UAT',content:'Say ORIGINAL. Input: {{document}}.'}})"); assert.equal(saved.ok, true);
    await nav('Overview'); await button('Sync'); await nav('Skill Lab'); await button('Advanced');
    await wait("[...document.querySelector('[aria-label=\"Evaluation resource\"]').options].some(o=>o.textContent.includes('Variable UAT'))");
    const id = await js("[...document.querySelector('[aria-label=\"Evaluation resource\"]').options].find(o=>o.textContent.includes('Variable UAT')).value");
    await value('[aria-label="Evaluation resource"]', id); await value('[aria-label="Candidate instructions"]', 'Say CANDIDATE. Input: {{document}}.');
    const suite = { evals: [{ id: 'variables', prompt: 'Complete the supplied task', assertions: [{ type: 'equals', value: 'CANDIDATE' }] }] };
    await value('[aria-label="Test suite"]', JSON.stringify(suite)); await button('Run comparison');
    await wait("document.querySelector('main').innerText.includes('Supply a value for prompt variable')");
    suite.evals[0].variables = { document: 'Same input' }; await value('[aria-label="Test suite"]', JSON.stringify(suite)); await button('Run comparison');
    await wait("document.querySelector('.lab-result > p strong')?.textContent==='completed' && document.querySelector('.lab-result')?.innerText.includes('Variable UAT')");
    const text = await js("document.querySelector('.lab-result').innerText"); assert.ok(text.includes('0.0%')); assert.ok(text.includes('100.0%'));
  });
  await probe('Optional Markdown cleanup creates a separate result and retains the original extraction', async () => {
    await nav('Convert to Markdown');
    await button('Convert 1 document · completed');
    await wait("!!document.querySelector('.lab-result [aria-label^=\"Markdown preview\"]')");
    const before = await js("document.querySelector('.lab-result [aria-label^=\"Markdown preview\"]').textContent");
    const originalBytes = await js("window.aios.lab('list').then(r=>window.aios.lab('get',{id:r.jobs.find(j=>j.kind==='convert'&&j.status==='completed').id})).then(r=>r.job.result.documents[0].content)");
    await button('Review AI cleanup options'); await value('dialog [aria-label="AI engine"]', 'local'); await button('Create cleaned draft');
    await wait("document.querySelector('.lab-result > p strong')?.textContent==='completed' && document.querySelector('.lab-result').innerText.includes('Local copy')");
    assert.equal(await js("document.querySelector('.lab-result [aria-label^=\"Markdown preview\"]').textContent"), before);
    assert.ok(await js("[...document.querySelectorAll('.lab-result details')].some(d=>d.querySelector('summary')?.textContent==='Original extracted Markdown' && d.querySelector('pre').textContent===" + JSON.stringify(originalBytes) + ')'));
    if (screenshot) fs.writeFileSync(join(output, 'ai-markdown-cleanup.png'), await screenshot());
  });
}

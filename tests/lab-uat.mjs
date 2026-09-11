// UI acceptance uses a deterministic CLI double in a disposable home. This
// verifies integration and error handling, not live model quality or auth.
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

export function seedLabUat(home, nodePath) {
  const put = (path, content) => { const p = join(home, path); fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; };
  put('.claude/skills/lab/SKILL.md', '---\nname: Lab UAT skill\ndescription: Answer a test prompt\n---\nSay ORIGINAL.\n');
  put('.claude/CLAUDE.md', '# Preferences\nAlways run the established project checks before committing.\n\nAlways run the established project checks before committing.\n\n# Build\nRun npm test before changes.\n');
  put('Documents/Lab project/CLAUDE.md', '# Project\nKeep project decisions here.\n');
  const script = put('lab-cli.mjs', `import fs from 'node:fs';
const args=process.argv.slice(2);if(args[0]==='--help'){console.log('--safe-mode --restricted --json-schema --max-budget-usd --setting-sources');process.exit(0)}if(args[0]==='--version'){console.log('UAT CLI double');process.exit(0)}
const prompt=fs.readFileSync(0,'utf8'),system=args[args.indexOf('--system-prompt')+1];
if(prompt.includes('UAT_CANCEL')){setTimeout(()=>{},300000)}else{
let result='ORIGINAL',structured;
if(system.includes('Say CANDIDATE'))result='CANDIDATE';
if(args.includes('--json-schema')){const schema=JSON.parse(args[args.indexOf('--json-schema')+1]);let data;try{data=JSON.parse(prompt)}catch{}
if(schema.properties.findings)structured={summary:'Review complete with a concrete finding.',findings:[{path:data[0].path,line:1,message:'A project command may be in user instructions.',suggestion:'Review the destination project.'}]};
else if(schema.properties.content)structured={content:(data.source||data.candidate||data.original).replace('ORIGINAL','CANDIDATE'),rationale:'The candidate addresses the requested behavior.'};
else if(schema.properties.expectations)structured={expectations:data.assertions.map(a=>({text:typeof a==='string'?a:a.text,passed:data.output.includes('CANDIDATE'),evidence:'Observed the requested answer.'}))};
else structured={winner:data.output_A.includes('CANDIDATE')?'A':'B',reasoning:'This answer meets the requested criterion.'};}
const response={type:'result',subtype:'success',is_error:false,result,total_cost_usd:0.001,usage:{input_tokens:12,output_tokens:3},structured_output:structured};
if(args.includes('stream-json')){console.log(JSON.stringify({type:'system',subtype:'init',mcp_servers:[],skills:['aios-evaluation:aios-evaluated-skill'],plugins:[{name:'aios-evaluation'}]}));if(prompt.includes('activate'))console.log(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',name:'Skill',input:{skill:'aios-evaluation:aios-evaluated-skill'}}]}}));}
console.log(JSON.stringify(response));}
`);
  const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
  const cli = put('.local/bin/claude', '#!/bin/sh\nexec ' + quote(nodePath) + ' ' + quote(script) + ' "$@"\n'); fs.chmodSync(cli, 0o700);
}

export async function runLabUat({ evaluate: js, home, screenshot, output, probe }) {
  const detected = await js("window.aios.request('tools.detect')");
  assert.equal(detected.tools.find(t => t.name === 'claude')?.path, join(home, '.local/bin/claude'), 'Fixture CLI isolation must be verified before any AI run');
  const pause = () => new Promise(r => setTimeout(r, 40));
  const wait = async expression => { for (let n = 0; n < 500; n++) { if (await js(expression)) return; await pause(); } throw Error('Lab UAT timed out: ' + expression); };
  const button = async text => { await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(text)});b.click()})()`); await pause(); };
  const nav = async name => { await js(`(()=>{const b=[...document.querySelectorAll('.wb-sidebar nav button')].find(e=>e.innerText.startsWith(${JSON.stringify(name)}));if(!b)throw Error('Missing navigation');b.click()})()`); await pause(); };
  const value = async (selector, text) => { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause(); };
  const finished = () => wait("!!document.querySelector('.lab-result') && ['completed','failed','canceled'].some(s=>document.querySelector('.lab-result > p strong')?.textContent===s)");
  await value('[aria-label="Scope"]', 'all');
  await button('Sync');
  await wait("[...document.querySelectorAll('.wb-topbar button')].some(b=>b.textContent==='Sync'&&!b.disabled)");
  await probe('Memory Review finds exact duplicates and applies a reviewed edit with a backup', async () => {
    await nav('Memory Review'); await button('Select visible files'); await button('Run local checks'); await wait("document.querySelector('main').innerText.includes('DUPLICATE')");
    await button('Review removal'); await wait("!!document.querySelector('dialog .wb-check input')"); assert.equal(await js("document.querySelector('dialog button.primary').disabled"), true);
    await js("document.querySelector('dialog .wb-check input').click()"); await button('Apply reviewed changes'); await wait("!document.querySelector('dialog')");
    assert.equal((fs.readFileSync(join(home, '.claude/CLAUDE.md'), 'utf8').match(/Always run/g) || []).length, 1);
    assert.equal(await js("document.querySelector('main').innerText.includes('Local review results')"), false, 'Applying a review must invalidate the previous source offsets and findings');
  });
  await probe('Memory Review moves one section with a two-file comparison', async () => {
    await button('Run local checks'); await wait("!!document.querySelector('.lab-workspace details pre')");
    await js("[...document.querySelectorAll('.lab-workspace details')].find(d=>d.querySelector('pre'))?.setAttribute('open','')");
    await js("[...document.querySelectorAll('.lab-workspace .wb-row')].find(r=>r.textContent.startsWith('Build'))?.querySelector('button').click()"); await wait("!!document.querySelector('[aria-label=\"Memory destination\"]')");
    await value('[aria-label="Memory destination"]', join(home, 'Documents/Lab project')); await button('Preview section move'); await wait("document.querySelectorAll('dialog .wb-diff').length===2");
    await js("document.querySelector('dialog .wb-check input').click()"); await button('Apply section move'); await wait("!document.querySelector('dialog')");
    assert.ok(fs.readFileSync(join(home, 'Documents/Lab project/CLAUDE.md'), 'utf8').includes('npm test')); assert.ok(!fs.readFileSync(join(home, '.claude/CLAUDE.md'), 'utf8').includes('npm test'));
  });
  await probe('AI memory review renders contextual findings without confusing them with benchmark metrics', async () => {
    await js("[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='AI review and rewrite options').open=true"); await button('Run AI review'); await finished();
    assert.ok((await js("document.querySelector('.lab-result').innerText")).includes('Review complete with a concrete finding.'));
  });
  await probe('Skill Lab runs A/B assertions and exposes measured before/after results', async () => {
    await nav('Skill Lab'); await wait("!!document.querySelector('[aria-label=\"Evaluation resource\"]')");
    const id = await js("[...document.querySelector('[aria-label=\"Evaluation resource\"]').options].find(o=>o.textContent.startsWith('Lab UAT skill')).value");
    await value('[aria-label="Evaluation resource"]', id); await wait("!!document.querySelector('[aria-label=\"Candidate instructions\"]')");
    const original = fs.readFileSync(join(home, '.claude/skills/lab/SKILL.md'), 'utf8'); await value('[aria-label="Candidate instructions"]', original.replace('ORIGINAL', 'CANDIDATE'));
    await value('[aria-label="Test suite"]', JSON.stringify({ evals: [{ id: 1, prompt: 'Answer the task', assertions: [{ type: 'contains', text: 'Correct answer', value: 'CANDIDATE' }] }] }));
    await button('Run comparison'); await finished(); const text = await js("document.querySelector('.lab-result').innerText"); assert.ok(text.includes('0.0%')); assert.ok(text.includes('100.0%')); assert.equal(fs.readFileSync(join(home, '.claude/skills/lab/SKILL.md'), 'utf8'), original);
    if (screenshot) fs.writeFileSync(join(output, 'skill-lab.png'), await screenshot());
  });
  await probe('Candidate promotion rejects external edits and preserves original data', async () => {
    await button('Review candidate changes'); await wait("!!document.querySelector('dialog .wb-check input')");
    fs.appendFileSync(join(home, '.claude/skills/lab/SKILL.md'), '\nExternal writer\n');
    await js("document.querySelector('dialog .wb-check input').click()"); await button('Apply reviewed changes'); await wait("document.querySelector('dialog').innerText.includes('changed on disk')"); await button('Close');
    assert.ok(fs.readFileSync(join(home, '.claude/skills/lab/SKILL.md'), 'utf8').includes('External writer'));
  });
  await probe('Evaluation cancellation works while other pages remain responsive', async () => {
    await value('[aria-label="Test suite"]', JSON.stringify({ evals: [{ id: 1, prompt: 'UAT_CANCEL', assertions: [{ type: 'contains', value: 'done', text: 'Done' }] }] }));
    await button('Run comparison'); await wait("document.querySelector('.lab-result > p strong')?.textContent==='running'"); await nav('Overview'); assert.ok(await js("!!document.querySelector('.wb-metrics')")); await nav('Skill Lab');
    const active = await js("window.aios.lab('list').then(r=>r.jobs.find(j=>j.status==='running').id)");
    await js(`window.aios.lab('cancel',{id:${JSON.stringify(active)}})`); await wait(`window.aios.lab('get',{id:${JSON.stringify(active)}}).then(r=>r.job.status==='canceled')`);
  });
  await probe('Converter screen accurately describes dependency and document support', async () => { await nav('Convert to Markdown'); assert.ok((await js("document.querySelector('main').innerText")).includes('Microsoft MarkItDown')); assert.equal(await js("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Convert to Markdown').disabled"), true); });
}

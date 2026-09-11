// Acceptance checks operate the real packaged React UI. Filesystem assertions
// verify outcomes only inside the caller's disposable home.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';

export function seedUat(home) {
  const put = (name, content) => { const path = join(home, name); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, content); return path; };
  put('.claude/settings.json', '{"model":"uat-original","unrelated":{"keep":true}}\n');
  put('.claude.json', '{"mcpServers":{"uat-local":{"command":"fixture-never-executed","args":["two words"],"env":{"API_TOKEN":"uat-private-token"}}}}\n');
  put('.claude/skills/uat/SKILL.md', '---\nname: UAT skill\n---\n' + 'Complete skill body\n'.repeat(250));
  put('.claude/skills/uat/support.txt', 'Support file must survive parking');
  put('.agents/skills/codex-uat/SKILL.md', '---\nname: Codex UAT skill\n---\nCodex content');
  put('.cursor/skills/cursor-uat/SKILL.md', '---\nname: Cursor UAT skill\n---\nCursor content');
  put('.codex/config.toml', '# Keep this comment\nmodel = "uat-model"\n');
  put('Documents/UAT project % ü/.claude/skills/project/SKILL.md', '---\nname: Project UAT skill\n---\nProject content');
}

export async function runPackagedUat({ session, home, results, output }) {
  const js = expression => session.evaluate(expression), pause = () => new Promise(r => setTimeout(r, 40));
  const project = join(home, 'Documents/UAT project % ü');
  const wait = async expression => {
    for (let n = 0; n < 300; n++) { if (await js(expression)) return; await pause(); }
    throw Error('UAT timed out: ' + expression);
  };
  const button = async (text, selector = 'button') => {
    await js(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable button: '+${JSON.stringify(text)});b.click()})()`); await pause();
  };
  const input = async (selector, value) => {
    await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause();
  };
  const nav = async text => {
    await js(`(()=>{const b=[...document.querySelectorAll('.wb-sidebar nav button')].find(e=>e.innerText.startsWith(${JSON.stringify(text)}));if(!b)throw Error('Missing navigation');b.click()})()`); await pause();
    await wait(`document.querySelector('main h1')?.textContent===${JSON.stringify(text)}`);
  };
  const idle = () => wait("[...document.querySelectorAll('.wb-topbar button')].some(b=>b.textContent==='Sync'&&!b.disabled)");
  const sync = async () => { await button('Sync', '.wb-topbar button'); await idle(); };
  const close = () => button('Close', 'dialog button');
  const row = name => `[...document.querySelectorAll('.wb-resource')].find(e=>e.querySelector('.wb-resource-name').textContent===${JSON.stringify(name)})`;
  const rowButton = async (name, text) => { await js(`(()=>{const r=${row(name)};const b=r&&[...r.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable resource action');b.click()})()`); await pause(); };
  const inspect = async name => { await rowButton(name, 'Inspect / edit'); await wait("!!document.querySelector('dialog')"); };
  const content = () => wait("!!document.querySelector('dialog textarea')");
  const finish = async () => { await wait("!document.querySelector('dialog')"); await idle(); };
  const mainText = () => js("document.querySelector('main').innerText");
  const step = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log('UAT PASS', name); } catch (error) { results.push({ name, passed: false, error: error.message }); throw error; } };
  const create = async (page, kind, name, body, provider = 'Claude Code', scope = 'user') => {
    await nav(page); await button('New ' + kind); await input('dialog input', name); await input('dialog select', provider);
    await input('dialog .wb-form-grid label:nth-child(3) select', scope);
    if (scope === 'project') await input('dialog .wb-form-grid label:nth-child(4) select', project);
    await input('dialog textarea', body); await button('Create resource'); await finish();
  };
  await idle();
  await js('window.confirm=()=>true;true');
  await step('packaged window renders styled content and every navigation destination', async () => {
    assert.equal(session.rendered, true);
    for (const page of ['Overview','Skills','MCP servers','Memory & rules','Config files','Commands','Subagents','Prompt library','Security review','Context estimates','External tools','History & recovery','Getting started','Settings']) await nav(page);
    assert.ok((await mainText()).includes(home));
  });
  await step('provider, user/project scopes and search select the correct resources', async () => {
    await nav('Skills'); await input('[aria-label="Provider"]', 'Codex');
    assert.ok((await mainText()).includes('Codex UAT skill')); assert.ok(!(await mainText()).includes('Cursor UAT skill'));
    await input('[aria-label="Provider"]', 'all'); await input('[aria-label="Scope"]', 'project'); await input('[aria-label="Project"]', project);
    assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 1);
    await input('[aria-label="Scope"]', 'user'); await input('[aria-label="Search resources"]', 'Cursor UAT');
    assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 1);
    await input('[aria-label="Scope"]', 'all'); await input('[aria-label="Search resources"]', '');
  });
  await step('full editor preserves drafts on canceled close and stale writes', async () => {
    await inspect('UAT skill'); await content();
    const path = join(home,'.claude/skills/uat/SKILL.md'), original = fs.readFileSync(path,'utf8');
    assert.equal(await js("document.querySelector('dialog textarea').value"), original);
    await input('dialog textarea', original+'UAT saved'); await js('window.confirm=()=>false;true'); await close();
    assert.ok(await js("!!document.querySelector('dialog')"));
    fs.writeFileSync(path, original+'External change'); await button('Save changes');
    await wait("document.querySelector('dialog').innerText.includes('changed on disk')");
    assert.equal(await js("document.querySelector('dialog textarea').value"), original+'UAT saved');
    assert.equal(fs.readFileSync(path,'utf8'), original+'External change');
    await js('window.confirm=()=>true;true'); await button('Reload from disk');
    await wait("document.querySelector('dialog textarea')?.value.endsWith('External change')");
    await input('dialog textarea', original+'UAT saved'); await button('Compare changes');
    assert.ok(await js("document.querySelector('.wb-diff').textContent.includes('UAT saved')"));
    await button('Editor'); await button('Save changes'); await finish();
    assert.equal(fs.readFileSync(path,'utf8'), original+'UAT saved');
  });
  await step('commands and agents create, archive or disable, and restore native files', async () => {
    await create('Commands','commands','uat-command','---\nname: UAT command\n---\nCommand body');
    const commandPath=join(home,'.claude/commands/uat-command.md'); assert.ok(fs.existsSync(commandPath));
    await rowButton('UAT command','Archive'); await idle(); assert.ok(!fs.existsSync(commandPath));
    await rowButton('UAT command','Restore'); await idle(); assert.ok(fs.existsSync(commandPath));
    await create('Subagents','agents','uat-agent','---\nname: UAT agent\ndescription: UAT\n---\nAgent body');
    const agentPath=join(home,'.claude/agents/uat-agent.md'); assert.ok(fs.existsSync(agentPath));
    await rowButton('UAT agent','Disable'); await idle(); assert.ok(!fs.existsSync(agentPath));
    await rowButton('UAT agent','Restore'); await idle(); assert.ok(fs.existsSync(agentPath));
  });
  await step('project instructions use native filenames and reject duplicate creation', async () => {
    await create('Memory & rules','memory','uat-instructions','Project instructions','Codex','project');
    assert.equal(fs.readFileSync(join(project,'AGENTS.md'),'utf8'),'Project instructions');
    await button('New memory'); await input('dialog input','duplicate'); await input('dialog select','Codex');
    await input('dialog .wb-form-grid label:nth-child(3) select','project'); await input('dialog .wb-form-grid label:nth-child(4) select',project);
    await input('dialog textarea','Should not overwrite'); await button('Create resource');
    await wait("document.querySelector('dialog').innerText.includes('already exists')"); await close();
    assert.equal(fs.readFileSync(join(project,'AGENTS.md'),'utf8'),'Project instructions');
  });
  await step('invalid JSON stays in the editor and valid saves preserve unrelated settings', async () => {
    await nav('Config files'); await inspect('settings.json');
    assert.equal(await js("!!document.querySelector('dialog textarea')"),false); await button('Reveal content'); await content();
    const path=join(home,'.claude/settings.json'), original=fs.readFileSync(path,'utf8');
    await input('dialog textarea','{invalid'); await button('Save changes'); await wait("!!document.querySelector('dialog [role=alert]')");
    assert.equal(fs.readFileSync(path,'utf8'),original); assert.equal(await js("document.querySelector('dialog textarea').value"),'{invalid');
    await input('dialog textarea','{"model":"uat-edited","unrelated":{"keep":true}}'); await button('Save changes'); await finish();
    assert.equal(JSON.parse(fs.readFileSync(path)).unrelated.keep,true);
  });
  await step('Codex MCP creation preserves TOML comments and intact argument arrays', async () => {
    await create('MCP servers','MCP server','uat-codex',JSON.stringify({command:'fixture-only',args:['a b','--option=c d']}),'Codex');
    const text=fs.readFileSync(join(home,'.codex/config.toml'),'utf8'); assert.ok(text.includes('# Keep this comment'));
    await inspect('uat-codex'); await button('Reveal content'); await content();
    assert.deepEqual(JSON.parse(await js("document.querySelector('dialog textarea').value")).args,['a b','--option=c d']); await close();
  });
  await step('remote MCP export redacts credentials and requires review before copying', async () => {
    await create('MCP servers','MCP server','uat-remote',JSON.stringify({url:'https://example.test/mcp?token=uat-private-token',headers:{Authorization:'Bearer uat-private-token'}}),'Cursor');
    await rowButton('uat-remote','Export'); await wait("document.querySelector('dialog textarea')?.value.length>0");
    const text=await js("document.querySelector('dialog textarea').value"); assert.ok(!text.includes('uat-private-token')); assert.ok(!text.includes(home));
    assert.ok(await js("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Copy reviewed bundle').disabled")); await close();
  });
  await step('MCP cancellation, disable and restore preserve the selected native source', async () => {
    const path=join(home,'.claude.json'), before=fs.readFileSync(path,'utf8');
    await js('window.confirm=()=>false;true'); await rowButton('uat-local','Disable'); assert.equal(fs.readFileSync(path,'utf8'),before);
    await js('window.confirm=()=>true;true'); await rowButton('uat-local','Disable'); await idle(); assert.ok(!JSON.parse(fs.readFileSync(path)).mcpServers['uat-local']);
    await rowButton('uat-local','Restore'); await idle(); assert.equal(JSON.parse(fs.readFileSync(path)).mcpServers['uat-local'].env.API_TOKEN,'uat-private-token');
  });
  await step('profile review detects changed sources and applies only a refreshed preview', async () => {
    await button('Capture current configuration'); await input('dialog input','UAT profile'); await button('Capture profile'); await finish();
    await rowButton('uat-local','Disable'); await idle(); await button('Review / apply'); await wait("document.querySelector('dialog').innerText.includes('Restore / enable')");
    const path=join(home,'.claude.json'), data=JSON.parse(fs.readFileSync(path)); data.external=true; fs.writeFileSync(path,JSON.stringify(data));
    await button('Apply reviewed profile'); await wait("document.querySelector('dialog').innerText.includes('sources changed')");
    assert.ok(!JSON.parse(fs.readFileSync(path)).mcpServers['uat-local']); await button('Refresh preview'); await wait("!!document.querySelector('dialog .wb-button.primary')");
    await button('Apply reviewed profile'); await finish(); assert.equal(JSON.parse(fs.readFileSync(path)).external,true);
    assert.ok(JSON.parse(fs.readFileSync(path)).mcpServers['uat-local']); await button('Delete profile'); await idle();
    assert.ok(!(await mainText()).includes('UAT profile'));
  });
  await step('parked skill collisions preserve both copies and render correctly in Security', async () => {
    await nav('Skills'); const path=join(home,'.claude/skills/uat/SKILL.md'), before=fs.readFileSync(path,'utf8');
    await rowButton('UAT skill','Disable'); await idle(); fs.mkdirSync(dirname(path)); fs.writeFileSync(path,'---\nname: Live replacement\n---\nDo not overwrite');
    await sync(); await nav('Security review'); assert.ok((await mainText()).includes('(parked copy)'));
    await nav('Skills'); await rowButton('UAT skill','Restore'); await idle(); assert.ok((await mainText()).includes('Both copies were preserved'));
    assert.ok(fs.readFileSync(path,'utf8').includes('Do not overwrite')); await inspect('UAT skill'); await content();
    assert.equal(await js("document.querySelector('dialog textarea').value"),before); await close(); fs.rmSync(dirname(path),{recursive:true});
    await sync(); await rowButton('UAT skill','Restore'); await idle(); assert.equal(fs.readFileSync(path,'utf8'),before);
    assert.equal(fs.readFileSync(join(dirname(path),'support.txt'),'utf8'),'Support file must survive parking');
  });
  await step('prompt variables, favorites, validation and deletion use real saved state', async () => {
    await nav('Prompt library'); await button('New prompt'); await input('dialog input','UAT prompt'); await input('dialog textarea','Hello {{name}}');
    assert.ok(await js("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Copy rendered prompt').disabled"));
    await js("document.querySelector('dialog input[type=checkbox]').click()"); await button('Save prompt'); await finish();
    assert.ok((await mainText()).includes('UAT prompt ★')); await button('Edit / use'); await input('dialog .wb-field:last-of-type input','User');
    assert.ok(!(await js("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Copy rendered prompt').disabled"))); await close();
    await button('Delete prompt'); await idle(); assert.ok((await mainText()).includes('library is empty'));
  });
  await step('history distinguishes unavailable sources from restorable native files', async () => {
    const path=join(home,'.claude/settings.json');
    const inspectHistory = async () => { await wait("!!document.querySelector('main .wb-row button')"); await js(`(()=>{const row=[...document.querySelectorAll('main .wb-row')].find(r=>r.querySelector('code')?.textContent===${JSON.stringify(path)});row.querySelector('button').click()})()`); await content(); };
    fs.renameSync(path,path+'.uat-away'); await sync(); await nav('History & recovery'); await inspectHistory();
    assert.ok(await js("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Restore as a draft for review').disabled")); await close();
    fs.renameSync(path+'.uat-away',path); await sync(); await inspectHistory();
    await button('Restore as a draft for review'); await button('Reveal content'); await content();
    assert.ok((await js("document.querySelector('dialog textarea').value")).includes('uat-original'));
    assert.equal(JSON.parse(fs.readFileSync(path)).model,'uat-edited'); await close();
  });
  await step('settings protect unsaved preferences and reject nonexistent scan roots', async () => {
    await nav('Settings'); await input('.wb-form-grid select','light'); await js('window.confirm=()=>false;true');
    await js("[...document.querySelectorAll('.wb-sidebar nav button')].find(e=>e.innerText.startsWith('Overview')).click()"); await pause();
    assert.equal(await js("document.querySelector('main h1').textContent"),'Settings');
    assert.ok(await js("[...document.querySelectorAll('.wb-topbar button')].find(b=>b.textContent==='Sync').disabled"));
    await button('Save preferences'); await idle(); assert.equal(await js("document.documentElement.dataset.theme"),'light');
    await input('[aria-label="Absolute scan folder"]',join(home,'missing')); await button('Add folder'); await idle(); assert.ok((await mainText()).includes('does not exist'));
    await js('window.confirm=()=>true;true');
    const folder=join(home,'Extra project % ü');fs.mkdirSync(folder);fs.writeFileSync(join(folder,'untouched.txt'),'Keep me');
    await input('[aria-label="Absolute scan folder"]',folder); await button('Add folder'); await idle();
    await js(`(()=>{const r=[...document.querySelectorAll('.wb-row')].find(r=>r.querySelector('code')?.textContent===${JSON.stringify(folder)});r.querySelector('button').click()})()`); await idle();
    assert.equal(fs.readFileSync(join(folder,'untouched.txt'),'utf8'),'Keep me');
  });
  await step('statusline preview and stale-install errors stay visible inside the modal', async () => {
    const script=join(home,'.claude/statusline.sh'), outside=join(home,'private-script');fs.writeFileSync(outside,'Keep me');fs.symlinkSync(outside,script);
    await nav('Config files'); await button('Configure Claude statusline'); await wait("!!document.querySelector('dialog [role=alert]')");
    assert.ok(!(await js("document.querySelector('dialog').innerText")).includes('Loading existing files'));
    fs.unlinkSync(script); await button('Reload preview'); await wait("!!document.querySelector('dialog input[type=checkbox]')");
    await js("document.querySelector('dialog input[type=checkbox]').click()");fs.writeFileSync(script,'External script'); await button('Install statusline');
    await wait("document.querySelector('dialog [role=alert]')?.textContent.includes('files changed')"); assert.equal(fs.readFileSync(script,'utf8'),'External script');
    await button('Reload preview'); await wait("!!document.querySelector('dialog input[type=checkbox]')");
    assert.ok(!(await js("document.querySelector('dialog input[type=checkbox]').checked")));
    await js("document.querySelector('dialog input[type=checkbox]').click()"); await button('Install statusline'); await finish();
    assert.ok(fs.readFileSync(script,'utf8').startsWith('#!/bin/bash')); assert.equal(fs.statSync(script).mode&0o777,0o700);assert.equal(fs.readFileSync(outside,'utf8'),'Keep me');
  });
  await step('minimum window size keeps navigation, dialogs and controls within the viewport', async () => {
    await session.viewport(720,520); await nav('Skills'); await inspect('UAT skill'); await content();
    assert.ok(await js("document.documentElement.scrollWidth<=innerWidth && document.querySelector('dialog').getBoundingClientRect().right<=innerWidth"));
    fs.mkdirSync(dirname(output),{recursive:true});fs.writeFileSync(output.replace('.png','-small.png'),await session.screenshot()); await close(); await session.viewport(1440,960);
  });
  await step('unsupported native files report an issue without hanging the scan', async () => {
    const path = join(home, '.claude/CLAUDE.md'); execFileSync('/usr/bin/mkfifo', [path]);
    try {
      await nav('Overview'); await sync(); assert.ok((await mainText()).includes('NOT_FILE'));
      assert.ok(fs.lstatSync(path).isFIFO());
    } finally { fs.unlinkSync(path); await sync(); }
    assert.ok(!(await mainText()).includes('NOT_FILE'));
  });
  await step('context estimates and actual executable discovery render without errors', async () => {
    await nav('Context estimates'); assert.ok((await mainText()).includes('estimated text tokens'));
    await nav('External tools'); await wait("document.querySelector('main').innerText.includes('markitdown')");
    await nav('Overview'); await idle(); assert.equal(await js("!!document.querySelector('[data-aios-recovery]')"),false);
    assert.deepEqual(session.rendererErrors,[]);fs.writeFileSync(output,await session.screenshot());
  });
}

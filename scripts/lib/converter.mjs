import * as fs from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { atomicWrite, exists, hash, fail } from './storage.mjs';
import { executable, runProcess } from './processes.mjs';

const VERSION = '0.1.7', UV = '0.12.13';
const ARCHIVES = {
  arm64: ['aarch64', '7e6ddb9316acc00f2296c82ff4d99977870ee34b2f0ddcae9444d714db9364ed'],
  x64: ['x86_64', '5e287ef61cb6a9b61b3a83fef124fd143e400468a7dac794230147a810e17119'],
};
export const CONVERSION_FORMATS = ['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.csv', '.html', '.htm', '.txt', '.md', '.json', '.xml', '.epub', '.msg', '.ipynb'];

export function createConverter({ root, home, env = process.env, run = runProcess, fetcher = fetch, findExecutable = executable }) {
  const runtime = join(root, 'runtime'), venv = join(runtime, `markitdown-${VERSION}`), python = join(venv, 'bin/python');
  const constraintsText = fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'markitdown-requirements.txt'), 'utf8'), constraintsHash = hash(constraintsText);
  const runtimeEnv = { ...env, UV_PYTHON_INSTALL_DIR: join(runtime, 'python'), UV_CACHE_DIR: join(runtime, 'cache'), UV_NO_CONFIG: '1', PYTHONNOUSERSITE: '1' };
  // Prevent a caller's Python configuration or cloud converter settings from
  // changing the deliberately local conversion behavior.
  for (const name of ['PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'MARKITDOWN_CU_ENDPOINT', 'MARKITDOWN_DOCINTEL_ENDPOINT']) delete runtimeEnv[name];
  let installing;
  const status = () => { let installed = false; try { installed = exists(python) && JSON.parse(fs.readFileSync(join(venv, 'aios-ready.json'), 'utf8')).constraintsHash === constraintsHash; } catch {} return { installed, version: VERSION, formats: CONVERSION_FORMATS }; };
  async function ensure(signal, progress) {
    if (status().installed) return python;
    if (installing) return installing;
    installing = install(signal, progress).finally(() => { installing = null; }); return installing;
  }
  async function install(signal, progress) {
    fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
    let uv = findExecutable('uv', home, env);
    if (!uv) {
      if (process.platform !== 'darwin' || !ARCHIVES[process.arch]) fail('UNSUPPORTED', 'Automatic Python setup supports Apple Silicon and Intel Macs. Install uv to use another platform.');
      uv = join(runtime, 'uv');
      if (!exists(uv)) {
        progress('Downloading the Python installer…');
        const [arch, digest] = ARCHIVES[process.arch], name = `uv-${arch}-apple-darwin`;
        const response = await fetcher(`https://github.com/astral-sh/uv/releases/download/${UV}/${name}.tar.gz`, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
        if (!response.ok) fail('DOWNLOAD_FAILED', `Installer download failed (${response.status}). Check the connection and retry.`);
        const chunks = []; let bytes = 0;
        for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 40 * 1024 * 1024) fail('DOWNLOAD_FAILED', 'Installer download exceeded its size limit.'); chunks.push(chunk); }
        const data = Buffer.concat(chunks);
        if (hash(data) !== digest) fail('DOWNLOAD_FAILED', 'Installer checksum did not match. No downloaded program was executed.');
        const temp = join(runtime, randomUUID()); fs.mkdirSync(temp, { mode: 0o700 });
        try {
          atomicWrite(join(temp, 'uv.tar.gz'), data);
          await run('/usr/bin/tar', ['-xzf', join(temp, 'uv.tar.gz'), '-C', temp, `${name}/uv`], { signal, timeout: 30000 });
          fs.renameSync(join(temp, name, 'uv'), uv); fs.chmodSync(uv, 0o700);
        } finally { fs.rmSync(temp, { recursive: true, force: true }); }
      }
    }
    progress('Preparing a private Python 3.12 environment…');
    // Reuse incomplete environments on retry; uv pip repairs missing packages.
    if (!exists(python)) await run(uv, ['venv', '--python', '3.12', '--managed-python', venv], { env: runtimeEnv, signal, timeout: 300000 });
    progress('Installing MarkItDown and document readers…');
    const constraints = join(runtime, 'document-constraints.txt');
    atomicWrite(constraints, constraintsText);
    await run(uv, ['pip', 'install', '--python', python, '--only-binary', ':all:', '--constraint', constraints, `markitdown[pdf,docx,pptx,xlsx,xls,outlook]==${VERSION}`], { env: runtimeEnv, signal, timeout: 300000 });
    await run(python, ['-I', '-c', 'from markitdown import MarkItDown; print("ready")'], { env: runtimeEnv, signal, timeout: 30000 });
    atomicWrite(join(venv, 'aios-ready.json'), JSON.stringify({ version: VERSION, constraintsHash })); return python;
  }
  async function convert(input, directory, signal, progress) {
    if (!CONVERSION_FORMATS.includes(extname(input).toLowerCase())) fail('UNSUPPORTED_FORMAT', 'This file type is not supported by local document conversion. Images, scanned-only documents, audio and video need a separate OCR/transcription integration. ZIP archives are not accepted; select the documents inside them.');
    const interpreter = await ensure(signal, progress); progress('Extracting document text…');
    const output = join(directory, 'converted.md');
    const script = join(dirname(fileURLToPath(import.meta.url)), 'convert_file.py');
    await run(interpreter, ['-I', '-c', fs.readFileSync(script, 'utf8'), input, output], { env: runtimeEnv, signal, timeout: 180000, maxBytes: 100000 });
    if (!exists(output) || fs.lstatSync(output).size > 2 * 1024 * 1024) fail('OUTPUT_LIMIT', 'Converted Markdown exceeds the 2 MiB preview/export limit. Split the source document.');
    const content = fs.readFileSync(output, 'utf8');
    return { content, version: VERSION, warnings: content.trim() ? ['Text extraction may omit scanned images, charts and visual formatting. Review the Markdown before using it.'] : ['No text was extracted. The document may be empty or require OCR.'] };
  }
  return { status, ensure, convert };
}

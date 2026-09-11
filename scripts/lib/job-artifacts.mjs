import * as fs from 'node:fs';
import { join, relative, resolve, isAbsolute, dirname } from 'node:path';
import { hash, inside, fail, atomicWrite } from './storage.mjs';

export function readArtifact(path, limit = 20 * 1024 * 1024) {
  if (!fs.lstatSync(path).isFile()) fail('UNSAFE_OUTPUT', 'Output is not a regular file.');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd); if (!st.isFile() || st.size > limit) fail('OUTPUT_LIMIT', 'Output exceeds its size limit.');
    const data = Buffer.alloc(st.size + 1); let count = 0;
    while (count < data.length) { const read = fs.readSync(fd, data, count, data.length - count, null); if (!read) break; count += read; }
    if (count !== st.size) fail('CONFLICT', 'Output changed while being read.'); return data.subarray(0, count);
  } finally { fs.closeSync(fd); }
}

export function collectArtifacts(directory) {
  const artifacts = []; let count = 0, bytes = 0;
  const visit = path => {
    const st = fs.lstatSync(path);
    if (++count > 1000) fail('OUTPUT_LIMIT', 'The run created too many output files.');
    if (st.isSymbolicLink()) fail('UNSAFE_OUTPUT', 'A run created a symbolic link in its outputs. Links are not exported or graded.');
    if (st.isDirectory()) { for (const name of fs.readdirSync(path).sort()) visit(join(path, name)); return; }
    if (!st.isFile() || (bytes += st.size) > 20 * 1024 * 1024) fail('OUTPUT_LIMIT', 'Output files must be regular files totaling at most 20 MiB.');
    const data = readArtifact(path);
    let text;
    if (data.length <= 64000) { try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); if (text.includes('\0')) text = undefined; } catch {} }
    artifacts.push({ name: relative(directory, path), bytes: data.length, digest: hash(data), ...(text === undefined ? {} : { text }) });
  };
  for (const name of fs.readdirSync(directory)) if (!['skill', 'inputs', '.claude', '.git'].includes(name)) visit(join(directory, name));
  return artifacts;
}
export function artifactPath(root, name) {
  if (typeof name !== 'string' || isAbsolute(name) || !name || name.includes('\0')) fail('INVALID', 'Invalid output path.');
  const path = resolve(root, name); if (!inside(path, root)) fail('INVALID', 'Output path leaves the run.'); return path;
}
export function snapshotArtifacts(directory, artifacts, target) {
  for (const artifact of artifacts) {
    const source = artifactPath(directory, artifact.name), destination = artifactPath(target, artifact.name);
    const data = readArtifact(source); if (hash(data) !== artifact.digest) fail('CONFLICT', 'Output changed before it was saved.');
    fs.mkdirSync(dirname(destination), { recursive: true, mode: 0o700 }); atomicWrite(destination, data);
  }
}

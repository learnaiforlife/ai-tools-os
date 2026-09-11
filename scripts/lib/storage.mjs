import * as fs from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const MAX_BYTES = 2 * 1024 * 1024;
export class AiosError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const fail = (code, message) => { throw new AiosError(code, message); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const inside = (path, root) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
export function exists(path) {
  try { fs.lstatSync(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
export function canonical(path) {
  path = resolve(path);
  if (exists(path)) return fs.realpathSync(path);
  return join(canonical(dirname(path)), path.slice(dirname(path).length + 1));
}
export function readText(path) {
  // Reject special files before opening: a FIFO can otherwise block forever
  // before fstat, preventing even scan cancellation. NONBLOCK closes the race
  // where a regular file is replaced with a FIFO between lstat and open.
  if (!fs.lstatSync(path).isFile()) fail('NOT_FILE', 'The selected path is not a regular file.');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) fail('NOT_FILE', 'The selected path is not a regular file.');
    if (st.size > MAX_BYTES) fail('TOO_LARGE', 'Files larger than 2 MiB cannot be edited.');
    const chunks = []; let length = 0;
    while (length <= MAX_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, MAX_BYTES + 1 - length));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      chunks.push(chunk.subarray(0, count)); length += count;
    }
    if (length > MAX_BYTES) fail('TOO_LARGE', 'File grew beyond the 2 MiB limit.');
    const bytes = Buffer.concat(chunks, length);
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail('ENCODING', 'Only valid UTF-8 text files can be edited. Original bytes were preserved.'); }
    return { content, revision: hash(content), mode: st.mode & 0o777 };
  } finally { fs.closeSync(fd); }
}
function syncDir(dir) {
  const fd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
export function atomicWrite(path, content, mode = 0o600) {
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.aios-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', mode);
    fs.fchmodSync(fd, mode);
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, path);
    syncDir(dirname(path));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (exists(temp)) fs.unlinkSync(temp);
  }
}

// The journal contains private preimages. A crash is rolled back on the next
// request; ambiguous external changes block recovery rather than being erased.
export class Storage {
  constructor(dir, { fault } = {}) {
    if (exists(dir) && fs.lstatSync(dir).isSymbolicLink()) fail('UNSAFE_STATE', 'AIOS state directory must not be a symbolic link.');
    dir = canonical(dir);
    this.dir = dir; this.fault = fault;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
    this.journals = join(dir, 'history');
    if (exists(this.journals) && fs.lstatSync(this.journals).isSymbolicLink()) fail('UNSAFE_STATE', 'History directory must not be a symbolic link.');
    fs.mkdirSync(this.journals, { recursive: true, mode: 0o700 }); fs.chmodSync(this.journals, 0o700);
    this.lock = join(dir, 'transaction.lock');
  }
  privatePath(name) {
    const path = join(this.dir, name);
    if (!inside(canonical(path), fs.realpathSync(this.dir))) fail('UNSAFE_STATE', 'AIOS state path escapes its directory.');
    return path;
  }
  state(name, fallback) {
    const path = this.privatePath(name);
    if (!exists(path)) return structuredClone(fallback);
    try { return JSON.parse(readText(path).content); }
    catch (e) { fail('STATE_CORRUPT', `Cannot read ${name}. Original data has been preserved. ${e.code || 'Invalid JSON'}`); }
  }
  stateWrite(name, value) {
    const path = this.privatePath(name);
    return { path, content: JSON.stringify(value, null, 2) + '\n', revision: exists(path) ? readText(path).revision : null, mode: 0o600 };
  }
  locked(fn) {
    let fd;
    try { fd = fs.openSync(this.lock, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner;
      try { owner = JSON.parse(readText(this.lock).content); } catch { fail('LOCKED', 'An unreadable transaction lock requires inspection.'); }
      if (!Number.isInteger(owner.pid) || owner.pid < 1) fail('LOCKED', 'Invalid transaction lock; no files were changed.');
      try { process.kill(owner.pid, 0); fail('LOCKED', 'Another AIOS operation is in progress. Try again.'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      fs.unlinkSync(this.lock);
      fd = fs.openSync(this.lock, 'wx', 0o600);
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.fsyncSync(fd);
      this.recover(); return fn();
    } finally { fs.closeSync(fd); fs.unlinkSync(this.lock); }
  }
  readJournal(file) {
    // Journals may contain several individually bounded files.
    if (fs.lstatSync(file).isSymbolicLink()) fail('UNSAFE_STATE', 'Journal is a symbolic link.');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { fail('STATE_CORRUPT', 'A transaction journal is unreadable. Its original bytes have been preserved for inspection.'); }
  }
  recover() {
    for (const file of fs.readdirSync(this.journals).filter(n => n.endsWith('.json'))) {
      const path = join(this.journals, file), journal = this.readJournal(path);
      if (journal.status !== 'pending') continue;
      this.rollback(journal);
      journal.status = 'recovered'; atomicWrite(path, JSON.stringify(journal));
    }
  }
  rollback(journal) {
    // Verify the complete rollback before changing any file.
    for (const w of journal.writes) {
      const current = exists(w.path) ? readText(w.path).revision : null;
      if (current !== w.before?.revision && !(current === null && w.before === null) && current !== w.after) {
        fail('RECOVERY_CONFLICT', `External changes prevent automatic recovery of ${w.path}. Use History and inspect the journal.`);
      }
    }
    for (const m of journal.moves) {
      if (exists(m.from) === exists(m.to)) fail('RECOVERY_CONFLICT', `Cannot safely recover the move from ${m.from}. Both or neither destinations exist.`);
    }
    for (const w of [...journal.writes].reverse()) {
      const current = exists(w.path) ? readText(w.path).revision : null;
      if (current !== w.after) continue;
      if (w.before) atomicWrite(w.path, w.before.content, w.before.mode);
      else { fs.unlinkSync(w.path); syncDir(dirname(w.path)); }
    }
    for (const m of [...journal.moves].reverse()) if (exists(m.to)) fs.renameSync(m.to, m.from);
  }
  commit(label, writes = [], moves = []) {
    const seen = new Set();
    const prepared = writes.map(w => {
      if (seen.has(w.path)) fail('INVALID', 'A transaction contains duplicate write destinations.'); seen.add(w.path);
      if (typeof w.content !== 'string' || Buffer.byteLength(w.content) > MAX_BYTES) fail('TOO_LARGE', 'Write exceeds 2 MiB.');
      if (canonical(w.path) !== w.path) fail('CONFLICT', 'A destination changed to a symbolic link. Refresh before trying again.');
      const before = exists(w.path) ? readText(w.path) : null;
      if (w.revision === undefined || w.revision !== (before?.revision ?? null)) fail('CONFLICT', `File changed on disk: ${w.path}. Reload and review your draft before saving.`);
      if (w.mode !== undefined && (!Number.isInteger(w.mode) || w.mode < 0 || w.mode > 0o777)) fail('INVALID', 'Invalid requested file permissions.');
      return { ...w, before, after: hash(w.content), mode: w.mode ?? before?.mode ?? 0o600 };
    });
    for (const m of moves) {
      if (!exists(m.from)) fail('CONFLICT', 'The source no longer exists. Refresh the inventory.');
      m.validate?.(m.from);
      if (exists(m.to)) fail('CONFLICT', `Restore destination already exists: ${m.to}`);
      fs.mkdirSync(dirname(m.to), { recursive: true, mode: 0o700 });
      if (fs.statSync(dirname(m.from)).dev !== fs.statSync(dirname(m.to)).dev) fail('CROSS_DEVICE', 'Safe directory parking requires the same filesystem as AIOS state. Edit the provider configuration instead.');
    }
    const journal = { id: randomUUID(), at: new Date().toISOString(), label, status: 'pending', writes: prepared, moves };
    const path = join(this.journals, journal.id + '.json');
    atomicWrite(path, JSON.stringify(journal));
    try {
      for (const [i, m] of moves.entries()) {
        if (!exists(m.from) || exists(m.to)) fail('CONFLICT', 'A move destination changed during the transaction. Both copies were preserved.');
        m.validate?.(m.from);
        fs.renameSync(m.from, m.to); syncDir(dirname(m.from)); syncDir(dirname(m.to)); this.fault?.('move', i);
      }
      for (const [i, w] of prepared.entries()) {
        // Check again immediately before each replacement.
        if ((exists(w.path) ? readText(w.path).revision : null) !== (w.before?.revision ?? null)) fail('CONFLICT', 'File changed during the transaction.');
        atomicWrite(w.path, w.content, w.mode); this.fault?.('write', i);
      }
      journal.status = 'committed'; atomicWrite(path, JSON.stringify(journal));
    } catch (error) {
      try { this.rollback(journal); journal.status = 'rolled-back'; atomicWrite(path, JSON.stringify(journal)); }
      catch (recovery) { fail('RECOVERY_CONFLICT', `${error.message} Recovery needs inspection: ${recovery.message}`); }
      throw error;
    }
    const completed = fs.readdirSync(this.journals).map(n => ({ path: join(this.journals, n), mtime: fs.statSync(join(this.journals, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of completed.slice(100)) if (this.readJournal(old.path).status !== 'pending') fs.unlinkSync(old.path);
    return journal.id;
  }
  history() {
    return fs.readdirSync(this.journals).filter(n => n.endsWith('.json')).map(n => {
      const j = this.readJournal(join(this.journals, n));
      return { id: j.id, at: j.at, label: j.label, status: j.status,
        transfer: /^(Copy|Move) /.test(j.label),
        files: j.writes.filter(w => !inside(w.path, this.dir)).map(w => ({ path: w.path, beforeRevision: w.before?.revision, afterRevision: w.after })),
        moves: j.moves };
    }).sort((a, b) => b.at.localeCompare(a.at));
  }
}

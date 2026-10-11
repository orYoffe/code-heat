'use strict';

const fs = require('node:fs/promises');
const picomatch = require('picomatch');

const DEFAULTS = Object.freeze({
  enabled: true, minLines: 80, maxLines: 1000, showBadge: true,
  include: ['**/*'],
  exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
    '**/.next/**', '**/coverage/**', '**/vendor/**', '**/*.min.*',
    '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml', '**/Cargo.lock', '**/composer.lock', '**/poetry.lock', '**/*.map'],
  maxFileBytes: 8388608, concurrency: 4, cacheEntries: 5000,
  colorFolders: true, maxFolderLines: 1000, maxFolderFiles: 50, maxEntries: 100000,
});

function validateConfig(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Configuration must be a JSON object.');
  const unknown = Object.keys(raw).filter(k => k !== '$schema' && !(k in DEFAULTS));
  if (unknown.length) throw Error(`Unknown options: ${unknown.join(', ')}`);
  const c = { ...DEFAULTS, ...raw };
  for (const key of ['enabled', 'showBadge', 'colorFolders']) {
    if (typeof c[key] !== 'boolean') throw Error(`${key} must be boolean.`);
  }
  for (const [key, min, max] of [['minLines', 0, 1000000], ['maxLines', 1, 1000000],
    ['maxFileBytes', 1024, 67108864], ['concurrency', 1, 16], ['cacheEntries', 1, 100000],
    ['maxFolderLines', 1, 1000000000], ['maxFolderFiles', 1, 1000000], ['maxEntries', 100, 1000000]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  if (c.maxLines <= c.minLines) throw Error('maxLines must exceed minLines.');
  if (c.maxFolderLines <= c.minLines) throw Error('maxFolderLines must exceed minLines.');
  for (const key of ['include', 'exclude']) {
    if (!Array.isArray(c[key]) || c[key].length > 100 || c[key].some(s => typeof s !== 'string' || s.length > 512)) {
      throw Error(`${key} must contain at most 100 glob strings, each at most 512 characters.`);
    }
  }
  const include = picomatch(c.include, { dot: true });
  const exclude = picomatch(c.exclude, { dot: true });
  return { ...c, matches: relative => include(relative) && !exclude(relative), excludes: relative => exclude(relative) };
}

function colorIndex(lines, config) {
  return Math.round(Math.max(0, Math.min(1,
    (lines - config.minLines) / (config.maxLines - config.minLines))) * 20);
}

/** Count logical lines. CRLF is one separator; a terminal newline adds no line. */
async function countFile(path, config, token = {}) {
  if (token.isCancellationRequested) return undefined;
  if ((await fs.lstat(path)).isSymbolicLink()) return undefined;
  const handle = await fs.open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > config.maxFileBytes) return undefined;
    const buffer = Buffer.alloc(32768);
    let separators = 0, seen = false, last = 0, bytesRead = 0, blankLines = 0, nonblank = false;
    const finish = () => {
      const terminal = seen && last !== 10 && last !== 13 ? 1 : 0;
      const lines = separators + terminal;
      const blanks = blankLines + (terminal && !nonblank ? 1 : 0);
      return { lines, blankLines: blanks, nonBlankLines: lines - blanks, capped: false, bytesRead };
    };
    while (!token.isCancellationRequested) {
      const result = await handle.read(buffer, 0, Math.min(buffer.length, config.maxFileBytes - bytesRead));
      if (!result.bytesRead) return finish();
      bytesRead += result.bytesRead;
      // NUL indicates binary or unsupported UTF-16. Never decorate those files.
      if (buffer.subarray(0, result.bytesRead).includes(0)) return undefined;
      for (let i = 0; i < result.bytesRead; i++) {
        const byte = buffer[i];
        if (byte === 13 || (byte === 10 && last !== 13)) {
          separators++;
          if (!nonblank) blankLines++;
          nonblank = false;
        } else if (byte !== 10 && byte !== 9 && byte !== 11 && byte !== 12 && byte !== 32) nonblank = true;
        seen = true;
        last = byte;
        if (separators > config.maxLines) return { lines: config.maxLines + 1, capped: true, bytesRead };
      }
      if (bytesRead >= config.maxFileBytes) {
        // Exact limit: use stat size to distinguish EOF from growth during reading.
        if ((await handle.stat()).size > bytesRead) return undefined;
        return finish();
      }
    }
    return undefined;
  } finally { await handle.close(); }
}

class LruCache {
  constructor(limit) { this.limit = limit; this.items = new Map(); }
  get(key) {
    if (!this.items.has(key)) return undefined;
    const value = this.items.get(key);
    this.items.delete(key); this.items.set(key, value);
    return value;
  }
  set(key, value) {
    this.items.delete(key); this.items.set(key, value);
    while (this.items.size > this.limit) this.items.delete(this.items.keys().next().value);
  }
  delete(key) { this.items.delete(key); }
  clear() { this.items.clear(); }
}

/** Bound both active I/O and queued requests. Overflow can retry after completions. */
class ReadQueue {
  constructor(limit = 4, maxPending = 512) {
    this.limit = limit; this.maxPending = maxPending; this.active = 0; this.pending = []; this.closed = false;
  }
  run(work, token = {}) {
    if (this.closed || token.isCancellationRequested || this.pending.length >= this.maxPending) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => { this.pending.push({ work, token, resolve, reject }); this.drain(); });
  }
  drain() {
    while (!this.closed && this.active < this.limit && this.pending.length) {
      const task = this.pending.shift();
      if (task.token.isCancellationRequested) { task.resolve(undefined); continue; }
      this.active++;
      Promise.resolve().then(task.work).then(task.resolve, task.reject).finally(() => { this.active--; this.drain(); });
    }
  }
  dispose() { this.closed = true; for (const task of this.pending.splice(0)) task.resolve(undefined); }
}

module.exports = { DEFAULTS, validateConfig, colorIndex, countFile, LruCache, ReadQueue };

'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { countFile, ReadQueue } = require('./core');

function language(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ({ '.ts': 'TypeScript', '.tsx': 'TypeScript JSX', '.js': 'JavaScript', '.jsx': 'JavaScript JSX',
    '.py': 'Python', '.json': 'JSON', '.md': 'Markdown', '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
    '.yml': 'YAML', '.yaml': 'YAML', '.sh': 'Shell', '.go': 'Go', '.rs': 'Rust', '.java': 'Java' })[ext] || ext.slice(1) || 'Text';
}

async function fileRecord(root, relative, config, token) {
  const filename = path.join(root, relative);
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile()) return undefined; // Do not follow symlinks outside the root.
    const result = await countFile(filename, { ...config, maxLines: Infinity }, token);
    if (token.isCancellationRequested) return undefined;
    return { path: relative.split(path.sep).join('/'), type: 'file', language: language(relative),
      extension: path.extname(relative), bytes: stat.size, modified: stat.mtime.toISOString(),
      lines: result?.lines || 0, files: result ? 1 : 0, skipped: result ? 0 : 1,
      blankLines: result?.blankLines || 0, nonBlankLines: result?.nonBlankLines || 0,
      status: result ? 'counted' : stat.size > config.maxFileBytes ? 'oversize' : 'binary-or-unsupported',
      bytesRead: result?.bytesRead || 0 };
  } catch (error) {
    if (token.isCancellationRequested) return undefined;
    return { path: relative.split(path.sep).join('/'), type: 'file', lines: 0, files: 0, bytes: 0,
      skipped: 1, status: error.code || 'unreadable', language: language(relative), extension: path.extname(relative) };
  }
}

function aggregate(nodes) {
  for (const node of nodes.values()) if (node.type === 'folder') Object.assign(node, { lines: 0, files: 0, bytes: 0, blankLines: 0, nonBlankLines: 0, skipped: node.ownSkipped || 0 });
  const ordered = [...nodes.values()].sort((a, b) => b.path.split('/').length - a.path.split('/').length || b.path.length - a.path.length);
  for (const node of ordered) {
    if (!node.path) continue;
    const parentPath = path.posix.dirname(node.path);
    const parent = nodes.get(parentPath === '.' ? '' : parentPath);
    if (parent) for (const key of ['lines', 'files', 'bytes', 'skipped', 'blankLines', 'nonBlankLines']) parent[key] += node[key] || 0;
  }
}

/** A bounded full index supports folder totals; no text documents are opened. */
async function scan(root, config, { token = {}, onProgress = () => {}, readQueue } = {}) {
  const start = performance.now();
  const nodes = new Map([['', { path: '', type: 'folder', lines: 0, files: 0, bytes: 0, skipped: 0 }]]);
  const queue = readQueue || new ReadQueue(config.concurrency);
  let batch = [], scheduled = 0, excluded = 0, truncated = false, bytesRead = 0, reservedEntries = 1;
  const stack = [''];
  const flush = async () => { await Promise.all(batch); batch = []; onProgress({ entries: nodes.size, files: scheduled }); };
  try {
    while (stack.length && !token.isCancellationRequested && !truncated) {
      const directory = stack.pop();
      let handle;
      try {
        handle = await fs.opendir(path.join(root, directory));
        for await (const entry of handle) {
          if (token.isCancellationRequested) break;
          const relative = directory ? `${directory}/${entry.name}` : entry.name;
          if (entry.isSymbolicLink() || config.excludes(relative) ||
            (entry.isDirectory() && config.excludes(`${relative}/__heatmap_probe__`))) { excluded++; continue; }
          if (entry.isDirectory()) {
            if (reservedEntries >= config.maxEntries) { truncated = true; break; }
            reservedEntries++;
            nodes.set(relative, { path: relative, type: 'folder', lines: 0, files: 0, bytes: 0, skipped: 0 });
            stack.push(relative);
          } else if (entry.isFile() && config.matches(relative)) {
            if (reservedEntries >= config.maxEntries) { truncated = true; break; }
            reservedEntries++;
            scheduled++;
            batch.push(queue.run(async () => {
              const record = await fileRecord(root, relative, config, token);
              if (record) { nodes.set(relative, record); bytesRead += record.bytesRead || 0; }
            }, token));
            if (batch.length >= 32) await flush();
          } else excluded++;
        }
      } catch (error) {
        const node = nodes.get(directory);
        node.ownSkipped = (node.ownSkipped || 0) + 1;
        node.status = error.code || 'unreadable';
      }
    }
    await flush();
    aggregate(nodes);
    return { nodes, excluded, truncated, cancelled: Boolean(token.isCancellationRequested), bytesRead,
      durationMs: Math.round(performance.now() - start) };
  } finally { if (!readQueue) queue.dispose(); }
}

module.exports = { scan, aggregate, fileRecord, language };

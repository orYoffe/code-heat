'use strict';

const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULTS, validateConfig, colorIndex, countFile, LruCache, ReadQueue } = require('./core');
const { scan, fileRecord } = require('./scanner');

class HeatmapProvider {
  constructor(output) {
    this.output = output;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeFileDecorations = this.emitter.event;
    this.roots = new Map();
    this.generation = 0;
    this.disposed = false;
    this.changes = new Map();
    this.stats = { reads: 0, cacheHits: 0, bytesRead: 0 };
  }

  async reload() {
    const generation = ++this.generation;
    const roots = new Map();
    for (const folder of vscode.workspace.workspaceFolders || []) {
      if (folder.uri.scheme !== 'file') continue;
      const setting = vscode.workspace.getConfiguration('explorerSizeHeatmap', folder.uri).get('config', {});
      let raw = setting;
      const filename = path.join(folder.uri.fsPath, '.explorer-size.json');
      try {
        const stat = await fs.stat(filename);
        if (stat.size > 65536) throw Error('Configuration exceeds 64 KiB.');
        const disk = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (!disk || typeof disk !== 'object' || Array.isArray(disk)) throw Error('Configuration must be a JSON object.');
        raw = { ...setting, ...disk };
        const config = validateConfig(raw);
        roots.set(folder.uri.toString(), this.makeRoot(folder, config));
      } catch (error) {
        if (error.code === 'ENOENT') {
          try { roots.set(folder.uri.toString(), this.makeRoot(folder, validateConfig(setting))); }
          catch (invalid) { this.report(folder, invalid); }
        } else {
          this.report(folder, error);
          // Keep the last valid per-root configuration when an edit is malformed.
          const old = this.roots.get(folder.uri.toString());
          if (old) roots.set(folder.uri.toString(), this.makeRoot(folder, old.config));
          else roots.set(folder.uri.toString(), this.makeRoot(folder, validateConfig()));
        }
      }
    }
    if (generation !== this.generation || this.disposed) { for (const root of roots.values()) root.queue.dispose(); return; }
    for (const root of this.roots.values()) { clearTimeout(root.indexTimer); root.queue.dispose(); }
    this.roots = roots;
    this.emitter.fire(undefined);
    for (const root of roots.values()) if (root.config.enabled && root.config.colorFolders) void this.indexRoot(root);
  }

  makeRoot(folder, config) {
    return { folder, config, cache: new LruCache(config.cacheEntries), queue: new ReadQueue(config.concurrency), pending: new Map(), revision: 0, updating: new Set() };
  }
  async indexRoot(root) {
    if (root.scanning || root.queue.closed) return;
    root.scanning = true;
    const revision = root.revision;
    const token = { get isCancellationRequested() { return root.queue.closed; } };
    try {
      const result = await scan(root.folder.uri.fsPath, root.config, { token, readQueue: root.queue });
      if (token.isCancellationRequested || this.disposed) return;
      root.index = result.nodes; root.truncated = result.truncated;
      this.output.appendLine(`${root.folder.name}: ${result.nodes.get('').files} files, ${result.nodes.get('').lines} lines in ${result.durationMs} ms${result.truncated ? ' (entry limit reached)' : ''}.`);
      this.emitter.fire(undefined);
    } catch (error) { this.output.appendLine(`Index: ${error.message}`); }
    finally { root.scanning = false; }
    // Reconcile changes made while the initial snapshot was being built.
    if (revision !== root.revision && !root.queue.closed) {
      for (const uri of root.updating) void this.updateIndex(root, uri);
      root.updating.clear();
    }
  }

  async updateIndex(root, uri) {
    if (root.scanning) { root.updating.add(uri); return; }
    if (!root.index || root.queue.closed) return;
    const relative = path.relative(root.folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    if (root.config.excludes(relative) || root.config.excludes(`${relative}/__heatmap_probe__`)) return;
    if (root.index.get(relative)?.type === 'folder') { void this.indexRoot(root); return; }
    try {
      if ((await fs.lstat(uri.fsPath)).isDirectory()) { void this.indexRoot(root); return; }
    } catch (error) { if (error.code !== 'ENOENT') return; }
    if (!root.config.matches(relative)) return;
    const revision = root.revision;
    const token = { get isCancellationRequested() { return root.queue.closed; } };
    const record = await root.queue.run(() => fileRecord(root.folder.uri.fsPath, relative, root.config, token), token);
    if (token.isCancellationRequested) return;
    if (revision !== root.revision) { setTimeout(() => void this.updateIndex(root, uri), 100); return; }
    const old = root.index.get(relative);
    // New directories or directory deletion require a fresh structural snapshot.
    if ((old?.type === 'folder') || (!record && !old)) { void this.indexRoot(root); return; }
    if (!record) return;
    const removed = record?.status === 'ENOENT';
    if (!old && root.index.size >= root.config.maxEntries) { root.truncated = true; return; }
    let parentPath = path.posix.dirname(relative);
    const parentKey = parentPath === '.' ? '' : parentPath;
    if (!root.index.has(parentKey)) { void this.indexRoot(root); return; }
    const affected = [uri];
    if (removed) root.index.delete(relative); else if (record) root.index.set(relative, record);
    while (true) {
      const key = parentPath === '.' ? '' : parentPath;
      const parent = root.index.get(key);
      if (parent) {
        for (const metric of ['lines', 'files', 'bytes', 'skipped', 'blankLines', 'nonBlankLines']) parent[metric] += (removed ? 0 : record?.[metric] || 0) - (old?.[metric] || 0);
        affected.push(vscode.Uri.joinPath(root.folder.uri, key));
      }
      if (!key) break;
      parentPath = path.posix.dirname(key);
    }
    this.emitter.fire(affected);
  }
  report(folder, error) {
    const message = `${folder.name}: ${error.message}`;
    this.output.appendLine(message);
    void vscode.window.showWarningMessage(`Explorer Size Heatmap: ${message}`);
  }

  invalidate(uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const root = folder && this.roots.get(folder.uri.toString());
    if (root) {
      root.cache.delete(uri.toString());
      // Prevent reads started before the change from publishing stale results.
      root.revision++;
      if (root.config.colorFolders && root.config.enabled) {
        root.updating.add(uri);
        if (!root.indexTimer) root.indexTimer = setTimeout(() => {
          root.indexTimer = undefined;
          const uris = [...root.updating]; root.updating.clear();
          for (const changed of uris) void this.updateIndex(root, changed);
        }, 250);
      }
    }
    this.changes.set(uri.toString(), uri);
    if (!this.timer) this.timer = setTimeout(() => {
      this.timer = undefined;
      const uris = [...this.changes.values()]; this.changes.clear();
      if (!this.disposed) this.emitter.fire(uris.length > 500 ? undefined : uris);
    }, 100);
  }

  async provideFileDecoration(uri, token) {
    if (this.disposed || uri.scheme !== 'file' || token.isCancellationRequested) return;
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const root = folder && this.roots.get(folder.uri.toString());
    if (!root || !root.config.enabled) return;
    const relative = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    if (relative.startsWith('../')) return;
    const indexed = root.index?.get(relative);
    if (indexed?.type === 'folder' && root.config.colorFolders) {
      const index = Math.max(colorIndex(indexed.lines, { ...root.config, maxLines: root.config.maxFolderLines }),
        Math.round(Math.min(1, indexed.files / root.config.maxFolderFiles) * 20));
      return new vscode.FileDecoration(undefined,
        `${root.truncated ? 'Partial index · ' : ''}${indexed.lines.toLocaleString()} lines · ${indexed.files.toLocaleString()} files · ${indexed.skipped} skipped`,
        new vscode.ThemeColor(`explorerSizeHeatmap.level${index}`));
    }
    if (!relative || !root.config.matches(relative)) return;
    const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString() && d.isDirty);
    if (document) {
      const lines = document.lineCount - (document.lineAt(document.lineCount - 1).text === '' ? 1 : 0);
      return this.decorate({ lines, capped: false }, root.config);
    }
    const key = uri.toString();
    let result = root.cache.get(key);
    if (result) { this.stats.cacheHits++; return this.decorate(result, root.config); }
    if (root.pending.has(key)) {
      const revision = root.revision;
      const shared = await root.pending.get(key);
      if (!token.isCancellationRequested && revision === root.revision && !root.queue.closed) return this.decorate(shared, root.config);
      return;
    }
    const revision = root.revision;
    // A shared read must not depend on one caller's cancellation token.
    const readToken = { get isCancellationRequested() { return root.queue.closed; } };
    const task = root.queue.run(async () => {
      try {
        this.stats.reads++;
        const result = await countFile(uri.fsPath, root.config, readToken);
        this.stats.bytesRead += result?.bytesRead || 0;
        return result || { skipped: true };
      } catch (error) {
        if (!['ENOENT', 'EISDIR', 'EACCES', 'EPERM'].includes(error.code)) this.output.appendLine(`${relative}: ${error.message}`);
        return { skipped: true };
      }
    }, readToken);
    root.pending.set(key, task);
    try {
      result = await task;
      if (this.disposed || this.roots.get(folder.uri.toString()) !== root) return;
      if (revision !== root.revision) { this.emitter.fire(uri); return; }
      if (result) root.cache.set(key, result);
      if (!token.isCancellationRequested) return this.decorate(result, root.config);
    } finally { if (root.pending.get(key) === task) root.pending.delete(key); }
  }

  decorate(result, config) {
    if (!result || result.skipped) return;
    const index = colorIndex(result.lines, config);
    const badge = config.showBadge ? (result.lines > config.maxLines ? 'XL' : result.lines <= config.minLines ? 'S' : 'M') : undefined;
    return new vscode.FileDecoration(badge,
      `${result.capped ? 'At least ' : ''}${result.lines.toLocaleString()} lines · Explorer Size Heatmap`,
      new vscode.ThemeColor(`explorerSizeHeatmap.level${index}`));
  }

  dispose() {
    this.disposed = true; this.generation++;
    clearTimeout(this.timer);
    for (const root of this.roots.values()) { clearTimeout(root.indexTimer); root.queue.dispose(); }
    this.roots.clear(); this.changes.clear(); this.emitter.dispose();
  }
}

async function activate(context) {
  const output = vscode.window.createOutputChannel('Explorer Size Heatmap');
  const provider = new HeatmapProvider(output);
  context.subscriptions.push(output, provider, vscode.window.registerFileDecorationProvider(provider));
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const changed = uri => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder && uri.fsPath === path.join(folder.uri.fsPath, '.explorer-size.json')) void provider.reload();
    else {
      const root = folder && provider.roots.get(folder.uri.toString());
      const relative = folder && path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
      if (root && !root.config.excludes(relative) && !root.config.excludes(`${relative}/__heatmap_probe__`)) provider.invalidate(uri);
    }
  };
  context.subscriptions.push(watcher, watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void provider.reload()),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('explorerSizeHeatmap')) void provider.reload(); }),
    vscode.workspace.onDidChangeTextDocument(e => provider.invalidate(e.document.uri)),
    vscode.workspace.onDidCloseTextDocument(d => provider.invalidate(d.uri)),
    vscode.workspace.onDidSaveTextDocument(d => provider.invalidate(d.uri)),
    vscode.commands.registerCommand('explorerSizeHeatmap.refresh', () => provider.reload()),
    vscode.commands.registerCommand('explorerSizeHeatmap.openConfig', async () => {
      const folder = (vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0]
        : await vscode.window.showWorkspaceFolderPick());
      if (!folder) return;
      const uri = vscode.Uri.joinPath(folder.uri, '.explorer-size.json');
      try { await vscode.workspace.fs.stat(uri); }
      catch (error) {
        if (error.code !== 'FileNotFound') throw error;
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(DEFAULTS, null, 2) + '\n'));
      }
      await vscode.window.showTextDocument(uri);
    }));
  await provider.reload();
  return { provider };
}

module.exports = { activate, HeatmapProvider };

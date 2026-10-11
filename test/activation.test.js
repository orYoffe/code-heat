'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const uri = p => ({ scheme: 'file', fsPath: p, toString: () => `file://${p}` });
const disposable = () => ({ dispose() {} });
const commands = new Map();
const lines = [];
const statuses = [];
let shown = false;
let preview;
const output = { appendLine: line => lines.push(line), show: () => { shown = true; }, dispose() {} };
const mock = {
  EventEmitter: class {
    constructor() { this.listeners = new Set(); this.event = fn => { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }; }
    fire(value) { for (const fn of this.listeners) fn(value); }
    dispose() { this.listeners.clear(); }
  },
  StatusBarAlignment: { Left: 1 },
  Uri: { joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
  workspace: {
    workspaceFolders: [], textDocuments: [],
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    createFileSystemWatcher: () => ({ dispose() {}, onDidChange: disposable, onDidCreate: disposable, onDidDelete: disposable }),
    onDidChangeWorkspaceFolders: disposable, onDidChangeConfiguration: disposable,
    onDidChangeTextDocument: disposable, onDidCloseTextDocument: disposable, onDidSaveTextDocument: disposable,
  },
  window: {
    createOutputChannel: () => output,
    registerFileDecorationProvider: disposable,
    createStatusBarItem: () => ({ show() { statuses.push(this.text); }, dispose() {} }),
    showTextDocument: async value => { preview = value; },
  },
  commands: {
    registerCommand: (name, callback) => { commands.set(name, callback); return { dispose: () => commands.delete(name) }; },
    executeCommand: async (name, value) => { assert.equal(name, 'markdown.showPreview'); preview = value; },
  },
};
const original = Module._load;
Module._load = function(name, ...rest) { return name === 'vscode' ? mock : original.call(this, name, ...rest); };
const { activate } = require('../src/extension');
Module._load = original;

test('Activation exposes guide, diagnostics, and visible workspace scan states', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'code-heat-activation-'));
  const context = { subscriptions: [], extensionUri: uri(path.resolve(__dirname, '..')), extension: { packageJSON: { version: '0.1.1' } } };
  t.after(async () => {
    for (const item of context.subscriptions.reverse()) item.dispose();
    mock.workspace.workspaceFolders = [];
    await fs.rm(folder, { recursive: true, force: true });
  });
  const { provider } = await activate(context);
  assert.match(statuses.at(-1), /Code Heat: Open folder/);
  await commands.get('explorerSizeHeatmap.gettingStarted')();
  assert.equal(preview.fsPath, path.join(context.extensionUri.fsPath, 'resources/getting-started.md'));
  assert.match(await fs.readFile(preview.fsPath, 'utf8'), /Confirm installation/);
  commands.get('explorerSizeHeatmap.showDiagnostics')();
  assert.equal(shown, true);
  assert.ok(lines.some(line => line.includes('No workspace folder')));
  await fs.writeFile(path.join(folder, 'small.ts'), 'x\n'.repeat(20));
  mock.workspace.workspaceFolders = [{ name: 'fixture', uri: uri(folder) }];
  await provider.reload();
  const until = Date.now() + 3000;
  while (Date.now() < until && [...provider.roots.values()].some(root => root.scanning)) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(statuses.some(text => text.includes('Code Heat: Indexing')));
  assert.match(statuses.at(-1), /Code Heat: Ready/);
  commands.get('explorerSizeHeatmap.showDiagnostics')();
  assert.ok(lines.some(line => line.includes('1 files, 20 lines')));
  await fs.writeFile(path.join(folder, '.explorer-size.json'), '{"enabled":false}');
  await provider.reload();
  assert.match(statuses.at(-1), /Code Heat: Off/);
});

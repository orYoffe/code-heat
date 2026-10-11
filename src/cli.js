#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateConfig } = require('./core');
const { scan } = require('./scanner');
const { delimited, markdown, html } = require('./report');

const HELP = `Usage: code-size [folder] [options]

  --format json|csv|tsv|ndjson|markdown|html  Output format (default: json)
  --out <file>                             Write output instead of stdout
  --config <file>                          Use another JSON configuration file
  --include <glob>                         Repeat to choose file patterns
  --exclude <glob>                         Repeat to add exclusion patterns
  --max-entries <number>                   Entry budget (default: 100000)
  --open                                  Open the HTML output in your browser
  --help                                  Show help

Reads .explorer-size.json in the root by default. Counts physical lines,
including comments and blanks. Binary, symlink, and oversized files are skipped.
Folder totals include descendants. A final newline does not add a line.
Examples:
  code-size . --format csv --out sizes.csv
  code-size . --format html --out sizes.html --open
  code-size packages --include '**/*.{ts,tsx,js,jsx}' --format json
`;

async function main(args = process.argv.slice(2)) {
  let root='.', format='json', out, configPath, open=false, rootSet=false;
  const overrides = {}, includes=[], excludes=[];
  for (let i=0; i<args.length; i++) {
    const a=args[i];
    if (a==='--help' || a==='-h') { process.stdout.write(HELP); return; }
    if (a==='--open') { open=true; continue; }
    if (['--format','--out','--config','--include','--exclude','--max-entries'].includes(a)) {
      const v=args[++i]; if (!v || v.startsWith('--')) throw Error(`Missing value for ${a}.`);
      if (a==='--format') format=v;
      if (a==='--out') out=v;
      if (a==='--config') configPath=v;
      if (a==='--include') includes.push(v);
      if (a==='--exclude') excludes.push(v);
      if (a==='--max-entries') overrides.maxEntries=Number(v);
    } else if (a.startsWith('-')) throw Error(`Unknown option ${a}.`);
    else if (rootSet) throw Error('Supply one root folder.');
    else { root=a; rootSet=true; }
  }
  if (!['json','csv','tsv','ndjson','markdown','html'].includes(format)) throw Error(`Unsupported format: ${format}`);
  if (open && (format!=='html' || !out)) throw Error('--open requires --format html and --out.');
  root=path.resolve(root);
  if (!(await fs.stat(root)).isDirectory()) throw Error('The root must be a folder.');
  let raw={};
  try { raw=JSON.parse(await fs.readFile(configPath?path.resolve(configPath):path.join(root,'.explorer-size.json'),'utf8')); }
  catch (error) { if (configPath || error.code!=='ENOENT') throw error; }
  if (includes.length) overrides.include=includes;
  const base=validateConfig(raw);
  if (excludes.length) overrides.exclude=[...base.exclude,...excludes];
  const config=validateConfig({...raw,...overrides});
  // Prevent a pre-existing report under the root from counting itself.
  if (out) {
    const relative=path.relative(root,path.resolve(out)).split(path.sep).join('/');
    const matches=config.matches;
    config.matches=p=>p!==relative && matches(p);
  }
  const abort=new AbortController();
  const stop=()=>abort.abort(); process.once('SIGINT',stop);
  const token={get isCancellationRequested(){return abort.signal.aborted;}};
  let result;
  try { result=await scan(root,config,{token}); }
  finally { process.removeListener('SIGINT',stop); }
  if (result.cancelled) { process.exitCode=130; return; }
  const publicConfig={};for(const [k,v] of Object.entries(config))if(typeof v!=='function')publicConfig[k]=v;
  const report={schemaVersion:1,name:path.basename(root),root,generatedAt:new Date().toISOString(),
    metric:'physical-lines',config:publicConfig,totals:result.nodes.get(''),excluded:result.excluded,truncated:result.truncated,
    durationMs:result.durationMs,bytesRead:result.bytesRead,entries:[...result.nodes.values()].sort((a,b)=>a.path.localeCompare(b.path))};
  const output=format==='html'?html(report):format==='csv'?delimited(report):format==='tsv'?delimited(report,'\t'):
    format==='markdown'?markdown(report):format==='ndjson'?report.entries.map(r=>JSON.stringify(r)).join('\n')+'\n':JSON.stringify(report,null,2)+'\n';
  if (out) { await fs.mkdir(path.dirname(path.resolve(out)),{recursive:true}); await fs.writeFile(out,output); }
  else process.stdout.write(output);
  process.stderr.write(`${report.totals.files} files · ${report.totals.lines} lines · ${report.totals.skipped} skipped · ${result.durationMs} ms${result.truncated?' · PARTIAL (entry limit reached)':''}\n`);
  if (result.truncated) process.exitCode=2;
  if (open) {
    const { spawn }=require('node:child_process');
    const filename=path.resolve(out);
    const command=process.platform==='darwin'?'open':process.platform==='win32'?'explorer.exe':'xdg-open';
    await new Promise((resolve,reject)=>{const child=spawn(command,[filename],{stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Browser could not open the report. Open the HTML file manually.')));});
  }
}

if(require.main===module)main().catch(error=>{process.stderr.write(`code-size: ${error.message}\n`);process.exitCode=1;});
module.exports={main};

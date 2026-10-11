'use strict';
// Provider contract checks with an explicit VS Code API stub. Host tests are separate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const Module=require('node:module');
const uri=p=>({scheme:'file',fsPath:p,toString:()=>pathToFileURL(p).href});
const mock={
 EventEmitter:class{constructor(){this.listeners=[];this.event=listener=>{this.listeners.push(listener);return{dispose(){}}}}fire(value){for(const l of this.listeners)l(value)}dispose(){this.listeners=[]}},
 FileDecoration:class{constructor(badge,tooltip,color){Object.assign(this,{badge,tooltip,color})}},
 ThemeColor:class{constructor(id){this.id=id}},
 Uri:{joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
 workspace:{workspaceFolders:[],textDocuments:[],getConfiguration:()=>({get:()=>({})}),getWorkspaceFolder(u){return this.workspaceFolders.filter(f=>u.fsPath===f.uri.fsPath||u.fsPath.startsWith(f.uri.fsPath+path.sep)).sort((a,b)=>b.uri.fsPath.length-a.uri.fsPath.length)[0]}},
 window:{showWarningMessage:async()=>{}}
};
const load=Module._load;Module._load=function(name,...rest){return name==='vscode'?mock:load.call(this,name,...rest)};
const {HeatmapProvider}=require('../src/extension');Module._load=load;
const token={isCancellationRequested:false};
async function wait(check){const until=Date.now()+3000;while(Date.now()<until){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Provider did not settle.');}

test('Provider contracts: multi-root, live updates, config, exclusion, deletion, disposal',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'heatmap-provider-'));const a=path.join(temp,'a'),b=path.join(temp,'b');
 await fs.mkdir(path.join(a,'src'),{recursive:true});await fs.mkdir(path.join(b,'src'),{recursive:true});await fs.mkdir(path.join(a,'node_modules'));
 await fs.writeFile(path.join(a,'src/small.ts'),'x\n'.repeat(20));await fs.writeFile(path.join(a,'src/big.ts'),'x\n'.repeat(1500));await fs.writeFile(path.join(b,'src/small.ts'),'x\n'.repeat(20));await fs.writeFile(path.join(b,'.explorer-size.json'),JSON.stringify({minLines:1,maxLines:10}));
 mock.workspace.workspaceFolders=[{name:'a',uri:uri(a)},{name:'b',uri:uri(b)}];
 const provider=new HeatmapProvider({appendLine(){}});
 t.after(async()=>{provider.dispose();mock.workspace.textDocuments=[];mock.workspace.workspaceFolders=[];await fs.rm(temp,{recursive:true,force:true});});
 await provider.reload();await wait(()=>[...provider.roots.values()].every(r=>r.index));
 assert.equal((await provider.provideFileDecoration(uri(path.join(a,'src/small.ts')),token)).color.id,'explorerSizeHeatmap.level0');
 assert.equal((await provider.provideFileDecoration(uri(path.join(b,'src/small.ts')),token)).color.id,'explorerSizeHeatmap.level20');
 assert.equal((await provider.provideFileDecoration(uri(path.join(a,'src/big.ts')),token)).badge,'XL');
 const folder=await provider.provideFileDecoration(uri(path.join(a,'src')),token);assert.equal(folder.color.id,'explorerSizeHeatmap.level20');assert.match(folder.tooltip,/1,520 lines/);
 const reads=provider.stats.reads;await provider.provideFileDecoration(uri(path.join(a,'src/small.ts')),token);assert.equal(provider.stats.reads,reads);
 const small=uri(path.join(a,'src/small.ts'));
 mock.workspace.textDocuments=[{uri:small,isDirty:true,lineCount:1201,lineAt:()=>({text:''})}];
 assert.equal((await provider.provideFileDecoration(small,token)).color.id,'explorerSizeHeatmap.level20');
 mock.workspace.textDocuments=[];await fs.writeFile(small.fsPath,'x\n'.repeat(1200));provider.invalidate(small);
 await wait(()=>provider.roots.get(uri(a).toString()).index.get('src').lines===2700);
 await fs.unlink(path.join(a,'src/big.ts'));provider.invalidate(uri(path.join(a,'src/big.ts')));
 await wait(()=>provider.roots.get(uri(a).toString()).index.get('src').lines===1200);
 await fs.writeFile(path.join(a,'.explorer-size.json'),JSON.stringify({minLines:1,maxLines:2000,showBadge:false}));await provider.reload();
 const configured=await provider.provideFileDecoration(small,token);assert.notEqual(configured.color.id,'explorerSizeHeatmap.level20');assert.equal(configured.badge,undefined);
 await fs.writeFile(path.join(a,'.explorer-size.json'),'{bad');await provider.reload();assert.equal(provider.roots.get(uri(a).toString()).config.maxLines,2000);
 await fs.writeFile(path.join(a,'.explorer-size.json'),'[]');await provider.reload();assert.equal(provider.roots.get(uri(a).toString()).config.maxLines,2000);
 await fs.writeFile(path.join(a,'.explorer-size.json'),JSON.stringify({include:['**/*.ts']}));await provider.reload();await wait(()=>provider.roots.get(uri(a).toString()).index);
 await fs.mkdir(path.join(a,'new'));await fs.writeFile(path.join(a,'new/added.ts'),'x\n'.repeat(100));provider.invalidate(uri(path.join(a,'new')));
 await wait(()=>provider.roots.get(uri(a).toString()).index.get('new')?.lines===100);
 await fs.rm(path.join(a,'new'),{recursive:true});provider.invalidate(uri(path.join(a,'new')));
 await wait(()=>!provider.roots.get(uri(a).toString()).index.has('new'));
 assert.equal(await provider.provideFileDecoration(uri(path.join(a,'node_modules/index.js')),token),undefined);
 assert.equal(await provider.provideFileDecoration(small,{isCancellationRequested:true}),undefined);
 await fs.writeFile(path.join(a,'.explorer-size.json'),JSON.stringify({enabled:false}));await provider.reload();assert.equal(await provider.provideFileDecoration(small,token),undefined);
 provider.dispose();assert.equal(await provider.provideFileDecoration(small,token),undefined);
});

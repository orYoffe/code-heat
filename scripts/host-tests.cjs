'use strict';
const vscode=require('vscode');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

async function waitFor(check, timeout=20000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,100));}
  throw Error('Timed out waiting for the extension index.');
}

async function run(){
 const extension=vscode.extensions.getExtension('oryoffe.explorer-size-heatmap');assert.ok(extension);
 const {provider}=await extension.activate();
 const token={isCancellationRequested:false};
 const fixture=vscode.workspace.workspaceFolders.find(f=>f.name==='fixture');
 const mono=vscode.workspace.workspaceFolders.find(f=>f.name==='nextjs');
 const uri=name=>vscode.Uri.joinPath(fixture.uri,name);
 await waitFor(()=>provider.roots.get(fixture.uri.toString())?.index);
 const small=await provider.provideFileDecoration(uri('src/small.ts'),token);
 assert.equal(small.color.id,'explorerSizeHeatmap.level0');
 const big=await provider.provideFileDecoration(uri('src/big.ts'),token);
 assert.equal(big.color.id,'explorerSizeHeatmap.level20');
 const folder=await provider.provideFileDecoration(uri('src'),token);
 assert.equal(folder.color.id,'explorerSizeHeatmap.level20');assert.match(folder.tooltip,/1,520 lines/);
 const count=provider.stats.reads;await provider.provideFileDecoration(uri('src/small.ts'),token);assert.equal(provider.stats.reads,count);
 // Live unsaved file changes use the document without reading disk.
 const document=await vscode.workspace.openTextDocument(uri('src/small.ts'));
 const edit=new vscode.WorkspaceEdit();edit.replace(uri('src/small.ts'),new vscode.Range(0,0,document.lineCount,0),'x\n'.repeat(1200));
 await vscode.workspace.applyEdit(edit);
 const dirty=await provider.provideFileDecoration(uri('src/small.ts'),token);assert.equal(dirty.color.id,'explorerSizeHeatmap.level20');
 await document.save();
 await waitFor(()=>provider.roots.get(fixture.uri.toString())?.index?.get('src')?.lines===2700);
 await fs.writeFile(path.join(fixture.uri.fsPath,'.explorer-size.json'),JSON.stringify({minLines:10,maxLines:2000,maxFolderLines:5000,maxFolderFiles:200}));
 await provider.reload();
 const configured=await provider.provideFileDecoration(uri('src/big.ts'),token);assert.ok(Number(configured.color.id.replace(/.*level/,''))<20);
 await fs.writeFile(path.join(fixture.uri.fsPath,'.explorer-size.json'),'{broken');
 await provider.reload();assert.equal(provider.roots.get(fixture.uri.toString()).config.maxLines,2000);
 await fs.unlink(path.join(fixture.uri.fsPath,'.explorer-size.json'));await provider.reload();
 await fs.unlink(path.join(fixture.uri.fsPath,'src/big.ts'));provider.invalidate(uri('src/big.ts'));
 await waitFor(()=>provider.roots.get(fixture.uri.toString())?.index?.get('src')?.lines===1200);
 const realBig=await provider.provideFileDecoration(vscode.Uri.joinPath(mono.uri,'packages/next/next-server/server/next-server.ts'),token);
 assert.equal(realBig.color.id,'explorerSizeHeatmap.level20');
 const realSmall=await provider.provideFileDecoration(vscode.Uri.joinPath(mono.uri,'packages/next/next-server/server/crypto-utils.ts'),token);
 assert.equal(realSmall.color.id,'explorerSizeHeatmap.level0');
 await waitFor(()=>provider.roots.get(mono.uri.toString())?.index);
 const total=provider.roots.get(mono.uri.toString()).index.get('');
 assert.ok(total.files>5000);assert.ok(total.lines>190000);
 console.log('HOST TESTS PASSED: colors, folders, cache, unsaved edits, saved aggregates, live config, malformed config, deletion, multi-root, real Next.js.');
 const result=process.env.HEATMAP_TEST_RESULT;if(result)await fs.writeFile(result,JSON.stringify({passed:true,total,stats:provider.stats},null,2));
}
module.exports={run};

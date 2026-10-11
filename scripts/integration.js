'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {runTests}=require('@vscode/test-electron');

(async()=>{
 const mono=process.env.HEATMAP_MONOREPO;
 if(!mono)throw Error('Set HEATMAP_MONOREPO to a Next.js checkout.');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'heatmap-host-'));
 try{
  const fixture=path.join(temp,'fixture');await fs.mkdir(path.join(fixture,'src'),{recursive:true});
  await fs.writeFile(path.join(fixture,'src/small.ts'),'x\n'.repeat(20));await fs.writeFile(path.join(fixture,'src/big.ts'),'x\n'.repeat(1500));
  const workspace=path.join(temp,'tests.code-workspace');
  await fs.writeFile(workspace,JSON.stringify({folders:[{name:'fixture',path:fixture},{name:'nextjs',path:path.resolve(mono)}],settings:{'security.workspace.trust.enabled':false,'telemetry.telemetryLevel':'off'}}));
  await runTests({vscodeExecutablePath:process.env.VSCODE_EXECUTABLE,extensionDevelopmentPath:path.resolve(__dirname,'..'),extensionTestsPath:path.join(__dirname,'host-tests.cjs'),launchArgs:[workspace,'--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--skip-welcome','--skip-release-notes','--user-data-dir',path.join(temp,'profile')],extensionTestsEnv:{HEATMAP_TEST_RESULT:path.join(temp,'result.json')}});
  console.log(await fs.readFile(path.join(temp,'result.json'),'utf8'));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});

// Optional browser regression. Install Playwright locally or supply NODE_PATH.
// node 维护工具/test-browser-import.cjs PURE_DIR WEB_BUNDLE_DIR
// CHROME_PATH may select an installed Chrome. Android/Windows cases simulate only
// their JavaScript bridge; they do not certify the native file picker or installer.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const [pure,bundle]=process.argv.slice(2).map(p=>path.resolve(p));
if(!pure||!bundle)throw Error('Provide PURE_DIR and WEB_BUNDLE_DIR');
const report=[];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [1440,390])for(const mode of ['web-hosted','web-localhost','web-file','android-bridge','windows-bridge']){
  const app=mode.endsWith('-bridge'),localFile=mode==='web-file';
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  if(mode==='android-bridge')await context.addInitScript(()=>window.FadianAndroid={saveText:()=>'',copyText:()=>{}});
  if(mode==='windows-bridge')await context.addInitScript(()=>window.FadianShell={edition:'Windows 版',saveText:()=>'',copyText:()=>{}});
  const base=mode==='web-localhost'?'http://localhost:8931/notes/':'https://fadian.test/notes/';
  if(!localFile)await context.route('**/*',async route=>{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname).slice('/notes/'.length);
   const relative=app&&pathname==='index.html'?'法典笔记.html':pathname||'index.html';
   const root=app?path.join(pure,'demo'):bundle,target=path.resolve(root,relative);
   const found=target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile();
   await route.fulfill({status:found?200:404,contentType:'text/html',body:found?fs.readFileSync(target):'Not Found'});
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(localFile?pathToFileURL(path.join(bundle,'index.html')).href:base+'index.html');
  const initial=await page.evaluate(()=>CODEX.id),seen=new Set();
  const ids=await page.evaluate(()=>DATA.codes.map(c=>c.id));
  async function menu(){if(width<600){await page.locator('[data-action="more-nav"]').click();await page.locator('.code-switch-wide').click();}else await page.locator('.sidebar [data-action="code-menu"]').click();}
  async function settings(){if(width<600){await page.locator('[data-action="more-nav"]').click();await page.locator('.more-nav [data-view="settings"]').click();}else await page.locator('.sidebar [data-view="settings"]').click();}
  for(const id of [...ids,ids[0],ids[2],ids[1],initial]){
   if(await page.evaluate(()=>CODEX.id)!==id){await menu();await Promise.all([page.waitForEvent('load'),page.locator(`[data-action="switch-code"][data-id="${id}"]`).click()]);}
   assert.equal(await page.evaluate(()=>CODEX.id),id);
   if(!seen.has(id)){
    await settings();
    const before=await page.evaluate(()=>JSON.stringify(state));
    async function choose(buffer,name){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-action="import-json"]').click()]);assert.equal(await chooser.element().getAttribute('accept'),null);await chooser.setFiles({name,mimeType:'application/octet-stream',buffer});}
    await choose(Buffer.from('not a backup'),'普通文档.txt');await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('未完成：'));
    assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);
    const data=await page.evaluate(()=>{const s=M.fresh();M.addNote(s,{unitId:state.current,year:state.year,text:'导入与切换回归-'+CODEX.id});return JSON.stringify(s)});
    await choose(Buffer.from('\uFEFF'+data),'备份.json');await page.waitForFunction(()=>state.notes.length===1);
    // An attachment through the real button and chooser, kept in this code's library after reload.
    await page.evaluate(()=>{ui.view='updates';ui.materialTab='files';render();});
    const [up]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-action="upload-file"]').click()]);
    await up.setFiles({name:'摘记-'+id+'.txt',mimeType:'text/plain',buffer:Buffer.from('附件回归 '+id)});
    await page.waitForFunction(()=>service.files.length===1&&service.files[0].text.startsWith('附件回归'));
    await page.reload();seen.add(id);
    await page.waitForFunction(id=>service.files.length===1&&service.files[0].name==='摘记-'+id+'.txt',id);
   }
   assert.equal(await page.evaluate(()=>state.notes[0].text),'导入与切换回归-'+id);
  }
  assert.deepEqual(errors,[]);
  const line=`PASS ${mode} ${width}px: click/chooser/import, generic MIME/BOM, invalid input preserved, all code routes, notes and attachments after reload, libraries kept apart`;
  console.log(line);report.push(line);await context.close();
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

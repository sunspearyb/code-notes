const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2],site=process.argv[3];const read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
 for(const [pack,page] of [['constitution','法典笔记.html'],['civil-code','法典笔记-civil-code.html'],['cyber-law','法典笔记-cyber-law.html']]){
  const DATA=JSON.parse(read('demo/'+page).match(/<script id="content-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const storage=new Map();let exported;const ctx=vm.createContext({DATA,URL,Intl,crypto:require('node:crypto').webcrypto,Date,JSON,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{querySelector:()=>null},toast:()=>{},download:(name,body)=>{exported=body;}});
  vm.runInContext(['model.js','notebook.js','learning-model.js'].map(x=>read('demo/src/'+x)).join('\n'),ctx);
  const app=read('demo/src/app.js');
  vm.runInContext('const M=createLearningModel(DATA),CODEX=DATA.codex,KEY=DATA.edition.storageKey,LEGACY_KEY=DATA.edition.legacyStorageKey;let state=M.fresh(),unreadableBackup=null,storageAvailable=true,storageIssue="",initialSaved=null;const now=M.timestamp;',ctx);
  vm.runInContext(app.slice(app.indexOf('function persist(){'),app.indexOf('function current()')),ctx);
  vm.runInContext('M.addNote(state,{unitId:M.units.find(u=>M.version(u.id,M.years.at(-1))?.exists).id,year:M.years.at(-1),text:"离线备份恢复检查-'+pack+'"});persist();state=M.fresh();'+app.slice(app.indexOf('try{initialSaved='),app.indexOf('const ui=')),ctx);
  assert.equal(vm.runInContext('state.notes.length',ctx),1);
  const exportCode=app.split('\n').find(x=>x.includes("case 'export-json':")).split("case 'export-json':")[1].replace(/break;\s*$/,'');vm.runInContext(exportCode,ctx);
  assert.equal(JSON.parse(exported).notes.length,1);
  ctx.backup=exported;vm.runInContext('state=M.fresh();state=M.merge(state,JSON.parse(backup)).state;persist();',ctx);
  assert.equal(vm.runInContext('state.notes[0].text',ctx),'离线备份恢复检查-'+pack);
  vm.runInContext('state=M.merge(state,JSON.parse(backup)).state;',ctx);assert.equal(vm.runInContext('state.notes.length',ctx),1);
  
  const folder=pack==='constitution'?'':pack+'/';const sw=fs.readFileSync(path.join(site,folder,'sw.js'),'utf8');const scope='https://example.test/code-notes/'+folder;const cachesMap=new Map(),handlers={};let online=true;
  const key=x=>new URL(typeof x==='string'?x:x.url,scope).href.split('?')[0];
  const caches={open:async name=>{if(!cachesMap.has(name))cachesMap.set(name,new Map());const m=cachesMap.get(name);return {addAll:async files=>files.forEach(f=>m.set(key(f),{body:f,ok:true})),put:async(k,v)=>m.set(key(k),v)}},keys:async()=>[...cachesMap.keys()],delete:async n=>cachesMap.delete(n),match:async r=>{for(const m of cachesMap.values())if(m.has(key(r)))return m.get(key(r));}};
  const swctx=vm.createContext({URL,Set,Promise,caches,self:{registration:{scope},addEventListener:(k,v)=>handlers[k]=v,skipWaiting:async()=>{},clients:{claim:async()=>{}}},fetch:async()=>{if(!online)throw Error('offline');return {ok:true,body:'network',clone(){return this}}},setTimeout:fn=>{fn();}});vm.runInContext(sw,swctx);
  let task;handlers.install({waitUntil:p=>task=p});await task;handlers.activate({waitUntil:p=>task=p});await task;online=false;
  for(const part of ['', 'index.html','icon-192.png']){let reply;handlers.fetch({request:{url:scope+part,method:'GET',mode:part.includes('png')?'no-cors':'navigate'},respondWith:p=>reply=p});assert(await reply,pack+' offline '+part);}
  let intercepted=false;handlers.fetch({request:{url:scope+'preview/',method:'GET',mode:'navigate'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
  const preview=fs.readFileSync(path.join(site,'preview',pack,'index.html'),'utf8');assert(!/<script|<input|<textarea|<form|contenteditable/i.test(preview));assert(preview.includes('script-src &#39;none&#39;'));
  console.log('PASS',pack,'save/reopen, actual JSON export handler, restore, duplicate merge, offline routes, read-only preview');
 }
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
// Where this device keeps the notes, and how they travel: a full Markdown export, a cloud-drive
// folder chosen in the browser, conflict copies made by cloud drives, and a reminder to export
// on devices that do not sync.
//
// Folder sync uses the browser's File System Access API (Chrome and Edge on computers). The folder
// holds 法典笔记数据.json, in the same format as the JSON export, and 法典笔记.md for reading.
// The PC&Mac 通用版 started with Python writes to its own data folder instead (see local_service.py).

// ---------- Markdown: everything the reader wrote, readable by people and assistants ----------
function mdQuote(text){return String(text||'').split('\n').map(x=>'> '+x).join('\n');}
function mdDate(value){return value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'';}
function fullMarkdown(){
  const L=[],order=new Map(M.units.map((u,i)=>[u.id,i])),own=state.notes.filter(n=>!n.example);
  const unitTitle=(id,year)=>{const u=M.get(id);return u?`${label(u,year)}（${year} 年文本）`:id;};
  const relationsOf=key=>state.materialRelations.filter(r=>key===null?!r.category:r.category===key);
  L.push('---',`title: 我的法典笔记`,`code: ${CODEX.name}`,`exported: ${now()}`,'format: fadian-notes-markdown 1',`notes: ${own.length}`,`relations: ${state.materialRelations.length}`,'---','',`# 我的法典笔记 · ${CODEX.name}`,'',`> 由法典笔记导出于 ${mdDate(now())}。这份文件便于阅读、交给助手或迁移到其他笔记软件；要在法典笔记中恢复或合并，请使用 JSON 备份。条文引自 ${M.years.join('、')} 年分年文本。`,'');
  L.push('## 一、条文笔记','');
  const notes=[...own].sort((a,b)=>(order.get(a.unitId)??0)-(order.get(b.unitId)??0)||a.year-b.year||a.createdAt.localeCompare(b.createdAt));
  let last='';
  for(const n of notes){
    const head=unitTitle(n.unitId,n.year);if(head!==last){L.push(`### ${head}`,'');last=head;}
    L.push(`#### ${n.question||n.text.split('\n')[0].slice(0,40)||'笔记'}`,'');
    const meta=[n.methods?.length?`解释方法：${M.methodLabels(n.methods).join('、')}`:'',n.anchors?.length?`定位：${anchorSummary(n.anchors)}`:'',n.imported?'来源：讲义笔记':'',n.ai?`智能辅助：${n.ai.model} · ${n.ai.verification==='reviewed'?'已核对':'待核'}`:'',`建立：${mdDate(n.createdAt)}；修改：${mdDate(n.updatedAt)}`].filter(Boolean);
    L.push(...meta.map(x=>'- '+x),'');
    if(n.quote)L.push(mdQuote(n.quote),'');
    if(n.text)L.push(n.text,'');
    if(n.source)L.push(`来源：${n.source.file} ${n.source.location||'第 '+n.source.page+' 页'}`,'',mdQuote(n.source.excerpt),'');
    const evidence=state.materials.filter(m=>n.evidenceIds?.includes(m.id));
    if(evidence.length)L.push('依据材料：',...evidence.map(m=>`- ${m.title}${m.url?' '+m.url:''}`),'');
    if(n.history?.length)L.push(`（此前有 ${n.history.length} 次修改，修改记录保存在 JSON 备份中）`,'');
  }
  if(!notes.length)L.push('（还没有条文笔记）','');
  const relationSection=(title,records)=>{
    L.push(`## ${title}`,'');
    if(!records.length){L.push('（暂无）','');return;}
    for(const r of records){
      L.push(`### ${r.question||r.title}`,'');
      const fields=M.categories()[r.category]?.fields||[];
      L.push(...[`材料：${r.title}`,`关联：${scopeTitle(r.scope)}`,...fields.filter(([k])=>r.details?.[k]).map(([k,name])=>`${name}：${r.details[k]}`),r.methods?.length?`解释方法：${M.methodLabels(r.methods).join('、')}`:'',r.url?`链接：${r.url}`:'',r.ai?`智能辅助：${r.ai.model} · ${r.ai.verification==='reviewed'?'已核对':'待核'}`:'',`修改：${mdDate(r.updatedAt)}`].filter(Boolean).map(x=>'- '+x),'');
      if(r.text)L.push(r.text,'');
      if(r.sourceText)L.push('摘录：','',mdQuote(r.sourceText.length>6000?r.sourceText.slice(0,6000)+'……（全文见 JSON 备份）':r.sourceText),'');
    }
  };
  let section=2;const cn=n=>'一二三四五六七八九十'[n-1]||String(n);
  for(const [key,c] of Object.entries(M.categories()))relationSection(`${cn(section++)}、${c.name}`,relationsOf(key));
  relationSection(`${cn(section++)}、其他材料关联`,relationsOf(null));
  L.push(`## ${cn(section++)}、词条`,'');
  for(const t of state.terms){L.push(`### [[${t.name}]]`,'');if(t.text)L.push(t.text,'');for(const a of t.anchors)L.push(`- ${unitTitle(a.unitId,a.year)}：${a.quote||'全文'}`);L.push('');}
  if(!state.terms.length)L.push('（暂无）','');
  L.push(`## ${cn(section++)}、条文之间的关联`,'');
  for(const l of state.links)L.push(`- ${unitTitle(l.from[0].unitId,l.from[0].year)} ${anchorSummary(l.from)} ↔ ${unitTitle(l.to[0].unitId,l.to[0].year)} ${anchorSummary(l.to)}${l.reason?'：'+l.reason:''}`);
  if(!state.links.length)L.push('（暂无）');
  L.push('',`## ${cn(section++)}、自己划分的部分`,'');
  for(const g of state.groups){L.push(`### ${g.name}`,'');if(g.description)L.push(g.description,'');L.push(...g.anchors.map(a=>`- ${unitTitle(a.unitId,a.year)}${a.quote?'：'+a.quote:''}`),'');}
  for(const l of state.groupLinks)L.push(`- ${state.groups.find(g=>g.id===l.fromId)?.name} —${l.relation}→ ${state.groups.find(g=>g.id===l.toId)?.name}${l.reason?'：'+l.reason:''}`);
  if(!state.groups.length)L.push('（暂无）');
  L.push('',`## ${cn(section++)}、自己修改的条旨`,'');
  const subtitles=Object.entries(state.subtitles).sort((a,b)=>(order.get(a[0])??0)-(order.get(b[0])??0));
  L.push(...subtitles.map(([id,t])=>`- ${M.get(id)?.label}：【${t.title}】`));if(!subtitles.length)L.push('（暂无）');
  L.push('',`## ${cn(section++)}、记忆卡片关键词`,'');
  const cards=Object.values(state.memoryCards).filter(c=>c.keywords.length);
  L.push(...cards.map(c=>`- ${unitTitle(c.unitId,c.year)}：${c.keywords.join('、')}`));if(!cards.length)L.push('（暂无）');
  if(state.discussions.length){L.push('',`## ${cn(section++)}、讨论（本地记录）`,'');for(const t of state.discussions){L.push(`### ${t.title}`,'',t.question,'',...t.comments.map(c=>`- ${c.authorId==='self'?'我':state.people.find(p=>p.id===c.authorId)?.name||'成员'}（${mdDate(c.createdAt)}）：${c.text}`),'');}}
  return L.join('\n').replace(/\n{3,}/g,'\n\n')+'\n';
}
exportMarkdown=function(){download(`${DATA.edition.markdownName||'法典笔记'}_${new Date().toISOString().slice(0,10)}.md`,fullMarkdown(),'text/markdown;charset=utf-8');};

// ---------- Small helpers ----------
function hashText(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16)+':'+text.length;}
function stripEnvelope(raw){const s={...raw};delete s.exportedAt;delete s.device;return s;}
function deviceName(){let d=localStorage.getItem(KEY+'-device');if(!d){d=(navigator.userAgentData?.platform||navigator.platform||'设备').replace(/\s+/g,'')+'-'+Math.random().toString(36).slice(2,6);try{localStorage.setItem(KEY+'-device',d);}catch{}}return d;}
function lastExport(){return Number(localStorage.getItem(KEY+'-exported')||0);}

// ---------- Cloud-drive folder chosen in the browser ----------
const folder={handle:null,status:'off',error:'',busy:false,again:false,timer:0,conflicts:[],syncedAt:0,applying:false};
// File names come from the edition: codes other than the constitution add their short name (法典笔记数据-民法典.json).
const FOLDER_DATA=(DATA.edition.exportName||'法典笔记数据')+'.json',FOLDER_MD=(DATA.edition.markdownName||'法典笔记')+'.md';
function folderSupported(){return typeof window.showDirectoryPicker==='function'&&!SHELL&&!service.connected;}
function handleStore(mode){return new Promise((ok,fail)=>{const r=indexedDB.open('fadian-folder',1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>ok(r.result.transaction('handles',mode).objectStore('handles'));r.onerror=()=>fail(r.error);});}
const settle=request=>new Promise((ok,fail)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>fail(request.error);});
async function rememberFolder(handle){const store=await handleStore('readwrite');await settle(handle?store.put(handle,KEY):store.delete(KEY));}
async function recalledFolder(){try{return await settle((await handleStore('readonly')).get(KEY));}catch{return null;}}
async function writeFolderText(name,text){const file=await folder.handle.getFileHandle(name,{create:true}),out=await file.createWritable();await out.write(text);await out.close();}
function folderRefresh(){if(ui.view==='settings'&&!modal.open&&!document.activeElement?.matches('input,textarea,select'))render();document.querySelector('.folder-banner')?.remove();if(folder.status==='permission')showFolderBanner();}
function showFolderBanner(){const el=document.createElement('div');el.className='folder-banner';el.setAttribute('role','status');el.innerHTML=`<span>网盘文件夹“${esc(folder.handle?.name||'')}”需要重新允许读写，才能继续同步。</span><button class="btn small primary" data-action="folder-resume">继续同步</button>`;document.body.appendChild(el);}
// Read the folder first: if another device wrote it since this browser last synced, take or merge
// its notes; then write this browser's notes back when they differ from the file.
async function folderSync(){
  if(!folder.handle)return;
  if(folder.busy){folder.again=true;return;}
  folder.busy=true;
  try{
    let fileState=null,fileHash='';
    try{const text=await (await (await folder.handle.getFileHandle(FOLDER_DATA)).getFile()).text();if(text.trim()){fileState=stripEnvelope(JSON.parse(text));fileHash=hashText(JSON.stringify(fileState));}}
    catch(error){if(error.name!=='NotFoundError')throw error;}
    const lastFile=localStorage.getItem(KEY+'-folder-file')||'',lastLocal=localStorage.getItem(KEY+'-folder-local')||'';
    let changed=false,conflicts=0;
    if(fileState&&fileHash!==lastFile){
      if(lastLocal&&hashText(JSON.stringify(state))===lastLocal)state=M.migrate(fileState);
      else{const result=M.merge(state,fileState);state=result.state;conflicts+=result.conflicts;}
      changed=true;
    }
    folder.conflicts=[];
    for await (const [name,entry] of folder.handle.entries()){
      if(entry.kind!=='file'||name===FOLDER_DATA||!name.startsWith(FOLDER_DATA.slice(0,-5))||!name.endsWith('.json'))continue;
      try{const result=M.merge(state,stripEnvelope(JSON.parse(await (await entry.getFile()).text())));if(result.added||result.conflicts){state=result.state;changed=true;conflicts+=result.conflicts;}folder.conflicts.push(name);}catch{}
    }
    const text=JSON.stringify(state),hash=hashText(text);
    if(hash!==fileHash){
      await writeFolderText(FOLDER_DATA,JSON.stringify({...state,exportedAt:now(),device:deviceName()},null,2));
      await writeFolderText(FOLDER_MD,fullMarkdown());
    }
    localStorage.setItem(KEY+'-folder-file',hash);localStorage.setItem(KEY+'-folder-local',hash);
    if(changed){folder.applying=true;try{persist();}finally{folder.applying=false;}render();}
    if(conflicts)toast('另一台设备也改了笔记，有差异的记录都已保留，请在笔记中核对。');
    folder.status='on';folder.error='';folder.syncedAt=Date.now();
  }catch(error){
    folder.status=error.name==='NotAllowedError'?'permission':'error';folder.error=error.message;
  }finally{
    folder.busy=false;folderRefresh();
    if(folder.again){folder.again=false;folderSync();}
  }
}
async function folderStart(){
  if(!folderSupported())return;
  folder.handle=await recalledFolder();if(!folder.handle)return;
  const permission=await folder.handle.queryPermission({mode:'readwrite'}).catch(()=>'prompt');
  if(permission==='granted')await folderSync();else{folder.status='permission';folderRefresh();}
}
const persistBeforeFolder=persist;
persist=function(){persistBeforeFolder();if(folder.status==='on'&&!folder.applying){clearTimeout(folder.timer);folder.timer=setTimeout(folderSync,1200);}};

// ---------- Another computer may have saved through the same cloud-drive folder ----------
async function checkServiceFiles(){
  if(!service.connected||unreadableBackup)return;
  try{
    const remote=await api('snapshot');let changed=false;
    if(remote.state&&remote.savedAt!==localStorage.getItem(KEY+'-saved-at')){state=reconcileWithService(state,remote,true);service.revision=remote.revision;browserPersist();changed=true;}
    for(const copy of await api('conflicts')){
      const result=M.merge(state,copy.state);state=result.state;persist();changed=true;
      await api('conflict-done',{name:copy.name});
      toast(`已合并网盘生成的冲突副本 ${copy.name}，有差异的记录都已保留。`);
    }
    if(changed&&!modal.open&&!document.activeElement?.matches('input,textarea,select'))render();
  }catch(error){service.error=error.message;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(folder.status==='on')folderSync();else checkServiceFiles();});

// ---------- Devices that do not sync: remind the reader to export ----------
function hasOwnWork(){return state.notes.some(n=>!n.example&&!n.imported)||state.materialRelations.length>0||state.terms.length>0;}
function backupDue(){
  if(service.connected||folder.status==='on'||!hasOwnWork())return false;
  if(Date.now()<Number(localStorage.getItem(KEY+'-remind-after')||0))return false;
  return Date.now()-lastExport()>7*864e5;
}
function backupNotice(){
  if(!backupDue())return '';const days=lastExport()?Math.floor((Date.now()-lastExport())/864e5):0;
  return `<section class="backup-notice" role="status"><div><strong>${days?`已经 ${days} 天没有导出备份`:'还没有导出过备份'}</strong><p>这台设备上的笔记只存在本机，不会自动同步。导出 JSON 后放进网盘，换设备时导入即可；卸载应用或清除浏览器数据前，务必先导出。</p></div><div class="row wrap"><button class="btn primary small" data-action="export-json">导出 JSON</button><button class="text-btn" data-action="backup-later">七天后再提醒</button></div></section>`;
}
const outlineBeforeStorage=renderOutline;
renderOutline=function(){return backupNotice()+outlineBeforeStorage();};

// ---------- 导出同步: say plainly where this device keeps the notes ----------
function storagePanel(){
  const exported=lastExport()?`上次导出：${mdDate(lastExport())}`:'还没有导出过备份。';
  if(service.connected)return `<section class="storage-panel"><h3>这台电脑的笔记保存在哪里</h3><p>保存在本文件夹的 <code>${esc(DATA.edition.dataDirectory)}</code> 中${DATA.edition.exportFolder?`，并在文件夹中写出便于阅读和迁移的 <code>${FOLDER_DATA}</code> 和 <code>${FOLDER_MD}</code>`:''}（浏览器里另有一份）。把整个法典笔记文件夹放进 Dropbox、百度网盘或阿里云盘的同步文件夹，另一台电脑打开同一个文件夹，就能接着写。</p><ul><li>不要在两台电脑上同时打开；在一台上写完，等网盘同步好，再到另一台打开。</li><li>两台电脑都改过时，有差异的记录都会保留；网盘生成的冲突副本会自动合并。</li></ul><p class="note-source">${exported}</p></section>`;
  if(folderSupported()){
    const state_=folder.status,name=esc(folder.handle?.name||'');
    return `<section class="storage-panel"><h3>保存到网盘文件夹</h3><p>选择 Dropbox、百度网盘或阿里云盘同步文件夹里的一个文件夹，例如把法典笔记文件夹放进网盘后选它。每次修改都会写入其中的 <code>${FOLDER_DATA}</code>，并更新 <code>${FOLDER_MD}</code>。另一台电脑用 Chrome 或 Edge 打开法典笔记、选择同一个文件夹，笔记就会合并过来。</p>${state_==='on'?`<p class="storage-status on">已连接“${name}”${folder.syncedAt?` · 最近同步 ${mdDate(folder.syncedAt)}`:''}</p>`:state_==='permission'?`<p class="storage-status">“${name}”需要重新允许读写。</p>`:state_==='error'?`<p class="service-error">同步未完成：${esc(folder.error)}</p>`:'<p class="storage-status">尚未选择文件夹，笔记只保存在这个浏览器中。</p>'}${folder.conflicts.length?`<p class="note-source">已合并网盘生成的冲突副本：${folder.conflicts.map(esc).join('、')}。确认笔记无误后，可以在网盘中删除这些副本。</p>`:''}<div class="row wrap">${state_==='permission'?'<button class="btn primary" data-action="folder-resume">继续同步</button>':`<button class="btn ${state_==='on'?'':'primary'}" data-action="folder-choose">${state_==='on'?'改选文件夹':'选择文件夹'}</button>`}${state_==='on'?'<button class="btn" data-action="folder-sync">立即同步</button><button class="text-btn" data-action="folder-stop">停止使用</button>':''}</div><ul><li>不要在两台电脑上同时打开；在一台上写完，等网盘同步好，再到另一台打开。</li><li>两台设备都改过时，有差异的记录都会保留，不会互相覆盖。</li></ul><p class="note-source">${exported}</p></section>`;
  }
  const edition=serviceFreeEdition()||'这个浏览器';
  return `<section class="storage-panel"><h3>这台设备的笔记保存在哪里</h3><p>${esc(edition)}的笔记只保存在这台设备上，不会自动同步。请定期导出 JSON，放进网盘或发给自己；换设备时，在新设备的“导入与合并”中导入。</p>${/Safari/.test(navigator.userAgent)&&!/Chrome|Chromium|Edg/.test(navigator.userAgent)&&!SHELL?'<p class="note-source">苹果设备请从主屏幕或程序坞上的图标打开，不要直接在 Safari 中使用，以免浏览器清理网站数据。</p>':''}<p class="note-source">${exported}</p></section>`;
}
const settingsBeforeStorage=renderSettings;
renderSettings=function(){const html=settingsBeforeStorage(),at=html.indexOf('</section>')+'</section>'.length;return html.slice(0,at)+storagePanel()+html.slice(at);};

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try{
    switch(el.dataset.action){
      case 'export-json':case 'export-md':try{localStorage.setItem(KEY+'-exported',String(Date.now()));localStorage.removeItem(KEY+'-remind-after');}catch{}setTimeout(()=>{if(ui.view==='outline'&&!modal.open)render();},50);break;
      case 'backup-later':localStorage.setItem(KEY+'-remind-after',String(Date.now()+7*864e5));render();break;
      case 'folder-choose':{
        const handle=await window.showDirectoryPicker({id:'fadian-notes',mode:'readwrite'});
        folder.handle=handle;await rememberFolder(handle);localStorage.removeItem(KEY+'-folder-file');localStorage.removeItem(KEY+'-folder-local');
        await folderSync();if(folder.status==='on')toast(`已连接“${handle.name}”。以后每次修改都会写入这个文件夹。`);break;
      }
      case 'folder-resume':if(await folder.handle?.requestPermission({mode:'readwrite'})==='granted')await folderSync();break;
      case 'folder-sync':await folderSync();toast(folder.status==='on'?'已同步。':'同步未完成。');break;
      case 'folder-stop':await rememberFolder(null);Object.assign(folder,{handle:null,status:'off',conflicts:[]});localStorage.removeItem(KEY+'-folder-file');localStorage.removeItem(KEY+'-folder-local');render();toast('已停止使用网盘文件夹，笔记仍保存在这个浏览器中。');break;
    }
  }catch(error){if(error.name!=='AbortError')toast(error.message);}
});
serviceStarted.finally(()=>{folderStart();checkServiceFiles();});
render();

'use strict';
// 设置: how this device shows the app — appearance (日光华政, 暗夜华政, following the system, or the
// earlier 墨绿), the size of the law text, 专注模式, reading and citing habits — with help and the
// shortcuts in one place. These choices belong to the device, not to the notes: they are kept in
// localStorage ('fadian-settings', shared by the codes opened from the same place) and never travel
// with a backup. Note display (隐藏/摘要/全文) is the one exception, already part of the notes' preferences.
const SETTINGS_KEY='fadian-settings';
const APPEARANCES=[['auto','跟随系统'],['light','日光华政'],['dark','暗夜华政'],['green','墨绿']];
const LAW_SCALES=[[0.9,'小'],[1,'标准'],[1.15,'大'],[1.3,'特大']];
const deviceSettings=(()=>{
  const defaults={appearance:'auto',lawScale:1,focusLarger:true,continuous:true};
  let saved={};try{saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{};}catch{}
  // Earlier versions kept only the palette, per code.
  try{if(!saved.appearance&&localStorage.getItem(KEY+'-theme')==='green')saved.appearance='green';}catch{}
  const s={...defaults,...saved};
  if(!APPEARANCES.some(([k])=>k===s.appearance))s.appearance='auto';
  if(!LAW_SCALES.some(([k])=>k===s.lawScale))s.lawScale=1;
  return s;
})();
function saveDeviceSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(deviceSettings));}catch{}}
const darkQuery=window.matchMedia?.('(prefers-color-scheme: dark)');
function applyDeviceSettings(){
  const root=document.documentElement,a=deviceSettings.appearance,theme=a==='auto'?(darkQuery?.matches?'dark':''):a==='light'?'':a;
  if(theme)root.dataset.theme=theme;else delete root.dataset.theme;
  root.style.setProperty('--law-scale',String(deviceSettings.lawScale));
  root.classList.toggle('focus-large',!!deviceSettings.focusLarger);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(root).getPropertyValue('--bg').trim()||'#faf8f0');
}
darkQuery?.addEventListener?.('change',()=>{if(deviceSettings.appearance==='auto')applyDeviceSettings();});

function choiceGroup(name,options,current,action){return `<div class="segmented settings-choices" role="radiogroup" aria-label="${name}">${options.map(([value,text,title])=>`<button role="radio" data-action="${action}" data-value="${esc(value)}" class="${String(current)===String(value)?'active':''}" aria-checked="${String(current)===String(value)}" ${title?`title="${esc(title)}"`:''}>${action==='set-appearance'?`<span class="theme-swatch ${value}" aria-hidden="true"></span>`:''}${esc(text)}</button>`).join('')}</div>`;}
function switchRow(key,title,hint){return `<label class="settings-switch"><span><strong>${title}</strong><small>${hint}</small></span><input type="checkbox" role="switch" data-device-setting="${key}" ${deviceSettings[key]?'checked':''}></label>`;}
function editionName(){return SHELL?.edition||serviceFreeEdition()||(service.connected?'PC&Mac 通用版（本机服务）':'PC&Mac 通用版（直接打开）');}
const SHORTCUTS=[['← →','法条精读中翻到上一条、下一条'],['\\','进入或退出专注模式（电脑）'],['Esc','取消所选字句'],['⌘ + / ⌘ − / ⌘ 0','放大、缩小、恢复整个页面（Windows 用 Ctrl）'],['⌘ 1、2、3','Mac 教师版中切换宪法、民法典、网络法典']];
function renderPrefs(){
  const card=(title,body)=>`<section class="settings-card prefs-card"><h3>${title}</h3>${body}</section>`;
  const sample=ver(M.get(CODEX.welcome?.start)||current(),LATEST)?.paragraphs?.[0]||'';
  return `${pageHead('设置','这些设置只影响这台设备上的显示，不改变笔记，也不随备份带走。')}<div class="prefs-grid">
  ${card('外观',choiceGroup('外观',APPEARANCES,deviceSettings.appearance,'set-appearance'))}
  ${card('法条字号',`${choiceGroup('法条字号',LAW_SCALES.map(([v,t])=>[v,t]),deviceSettings.lawScale,'set-law-scale')}<p class="prefs-sample law-text">${esc(sample.slice(0,60))}</p><p class="note-source">只放大法条和笔记正文。要放大整个页面，按 ⌘ +（Windows 为 Ctrl +）。</p>`)}
  ${card('阅读',`${switchRow('continuous','页尾继续滚动，翻到下一条','关闭后只能用 ← → 键或页尾按钮翻条')}${focusAvailable?switchRow('focusLarger','专注模式中放大正文','上课投屏时更清楚'):''}<div class="settings-row"><span><strong>笔记默认显示</strong><small>法条下方的随文笔记</small></span>${noteDisplayControl()}</div>${focusAvailable?`<div class="settings-row"><span><strong>专注模式</strong><small>隐藏两侧导航，鼠标移到屏幕边缘时打开</small></span><button class="btn small" data-action="focus">${focus.on?'退出专注模式':'进入专注模式'}</button></div>`:''}`)}
  ${card('引用',`<p>点“引用”时默认使用的格式，也可以在引用窗口中随时切换。</p>${choiceGroup('引用格式',CITE_FORMATS,citeFormat(),'set-cite-format')}`)}
  ${card('数据与备份',`<p>笔记保存在这台设备上。导出、导入和网盘同步在“导出同步”中。</p><div class="row wrap"><button class="btn" data-action="nav" data-view="settings">${icon('download')}导出同步</button><button class="btn" data-action="export-json">导出数据（JSON）</button><button class="text-btn danger" data-action="reset">清空这台设备上的记录…</button></div>`)}
  ${card('帮助',`<div class="row wrap"><button class="btn" data-action="nav" data-view="guide">${icon('help')}使用说明</button>${DATA.edition.name==='debug'?'':'<a class="btn" href="https://github.com/sunspearyb/code-notes/issues" target="_blank" rel="noopener">问题反馈 ↗</a>'}</div><h4 class="prefs-sub">快捷键</h4><dl class="shortcut-list">${SHORTCUTS.map(([k,t])=>`<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(t)}</dd></div>`).join('')}</dl>`)}
  ${card('关于',`<dl class="about-list"><div><dt>法典</dt><dd>${esc(CODEX.name)}${(DATA.codes||[]).length>1?` <button class="text-btn" data-action="code-menu">切换法典</button>`:''}</dd></div><div><dt>版本</dt><dd>${esc(DATA.edition.title)} · ${esc(editionName())}</dd></div><div><dt>文本</dt><dd>${esc(M.years.join('、'))} 年</dd></div></dl><p class="note-source">软件按个性化、智能化、可塑性、可扩展、去中心化、本地化六个原则构建。正文字体为思源宋体（SIL 开放字体许可）。</p>`)}
  </div>`;
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const v=el.dataset.value;
  switch(el.dataset.action){
    case 'set-appearance':deviceSettings.appearance=v;break;
    case 'set-law-scale':deviceSettings.lawScale=Number(v);break;
    case 'set-cite-format':try{localStorage.setItem(KEY+'-cite',v);}catch{}render();return;
    default:return;
  }
  saveDeviceSettings();applyDeviceSettings();render();
});
document.addEventListener('change',event=>{
  const key=event.target.dataset?.deviceSetting;if(!key)return;
  deviceSettings[key]=event.target.checked;saveDeviceSettings();applyDeviceSettings();
});
// The focus button in 设置 changes its label with the mode.
document.addEventListener('click',event=>{if(event.target.closest('[data-action="focus"]')&&ui.view==='prefs')setTimeout(render,0);});
applyDeviceSettings();

// ---------- 切换法典: every data pack of this edition, from the sidebar, 更多 or 设置 ----------
// The Mac app switches in its own window (FadianShell.switchCodex); the web version and pages opened
// directly go to the other code's page. With the local service, each code has its own service and port,
// started by its own launcher, so the page names that launcher instead of opening the wrong service.
function showCodeMenu(){
  const codes=DATA.codes||[];
  showModal('切换法典',`<div class="code-menu">${codes.map(c=>`<button class="code-choice ${c.id===CODEX.id?'active':''}" data-action="switch-code" data-id="${esc(c.id)}" ${c.id===CODEX.id?'aria-current="true"':''}><strong>${esc(c.short)}</strong><small>${esc(c.fullName)}</small>${c.id===CODEX.id?'<span class="pill">当前</span>':''}</button>`).join('')}</div><p class="note-source">每部法典的笔记分开保存，切换不会混在一起。</p>`);
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action="code-menu"],[data-action="switch-code"]');if(!el)return;
  if(el.dataset.action==='code-menu'){showCodeMenu();return;}
  const code=(DATA.codes||[]).find(c=>c.id===el.dataset.id);if(!code||code.id===CODEX.id){closeModal();return;}
  if(SHELL?.switchCodex){closeModal();SHELL.switchCodex(code.name);return;}
  if(service.connected&&!SHELL){toast(`${code.short}有自己的本机服务：请双击项目文件夹中的「${code.webFolder===''?'打开法典笔记':DATA.edition.name==='debug'?`打开${code.short}笔记`:`打开法典笔记-${code.short}`}」启动文件。`);return;}
  location.href=codeHref(code);
});
// In the apps (Windows, Mac, Android) every code opens in the same window; reopening the app goes back
// to the code used last. The teacher's Mac app remembers this itself.
if(SHELL&&!SHELL.localService&&(DATA.codes||[]).length>1){
  try{
    const first=!sessionStorage.getItem('fadian-opened'),last=(DATA.codes||[]).find(c=>c.id===localStorage.getItem('fadian-last-code'));
    sessionStorage.setItem('fadian-opened','1');
    if(first&&last&&last.id!==CODEX.id)location.replace(codeHref(last));else localStorage.setItem('fadian-last-code',CODEX.id);
  }catch{}
}

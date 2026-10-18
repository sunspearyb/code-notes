'use strict';
Object.assign(ui,{historyView:'timeline',outlineSide:'toc',outlineSelect:false,outlineScope:M.units.length>400?'node:'+M.tree(state.year).roots[0].id:'all',outlineMode:'text',structureSelection:[],groupDraft:null,viewer:'self',discussionId:null});

function tagsHtml(list){return M.methodLabels(list).map(t=>`<span class="method-tag">${esc(t)}</span>`).join('');}
function noteKind(n){return n.ai?['note-ai','智能辅助']:n.example?['note-example','示例笔记']:n.imported?['note-imported','讲义笔记']:['note-own','我的笔记'];}
function methodField(id,value){return `<label for="${id}">解释方法（可多选，也可自拟）</label><input id="${id}" name="methods" value="${esc(M.methodLabels(value).join('，'))}" placeholder="点选下方的方法，或自拟标签" list="${id}-list"><datalist id="${id}-list">${[...M.methods,...M.optionalMethods].map(m=>`<option value="${m}">`).join('')}</datalist><div class="method-choices">${M.methods.map(m=>`<button type="button" class="method-choice" data-action="add-method" data-field="${id}" data-method="${m}">${m}</button>`).join('')}${M.optionalMethods.map(m=>`<button type="button" class="method-choice optional" data-action="add-method" data-field="${id}" data-method="${esc(m)}">${esc(m)}</button>`).join('')}</div><details class="method-guide"><summary>解释方法</summary><h3>文义解释</h3><p>按通常的语言用法和法律上的专门含义，确定字句可能的意思；比较同一用语在其他条文中的用法。</p><h3>体系解释</h3><p>把条文放回所在的款、条、节、章和${esc(CODEX.whole)}中理解，说明相关规定之间是原则与具体化、授权与限制，还是一般与例外。</p><h3>历史解释</h3><p>查考制定和历次修正的材料，比较修正前后的文本。探求制定者当时的意思（常称原意解释），一般归入这一方法。</p><h3>目的解释</h3><p>说明条文要实现什么目的，并写明这个目的从何得出：序言、总纲、相关条文或修正说明；再看哪一种理解更能实现它。</p><h3>比较法解释</h3><p>参照外国宪法法律的条款、概念和制度，理解本国的规定。外国法是理解的参照，不是解释的依据。</p>${Object.values(DATA.frameworks||{}).map(f=>`<h3>${esc(f.method)}</h3><p>${esc(f.status)}</p>`).join('')}<p class="note-source">四种基本方法之外的标签可选可删，也可以自拟；一则笔记不必只归入一种方法。新闻、案例、法规是材料，不等于某种解释方法。</p></details>`;}
function noteEditorFields(d,a){
  return `<label for="note-question">解释问题</label><input id="note-question" value="${esc(d.question||'')}" placeholder="这句话需要解释什么？">${methodField('note-methods',d.methods)}${state.materials.some(m=>m.unitId===a.id)?`<details class="note-evidence"><summary>选择作为依据的材料</summary>${state.materials.filter(m=>m.unitId===a.id).map(m=>`<label class="check"><input type="checkbox" data-note-evidence="${m.id}" ${(d.evidenceIds||[]).includes(m.id)?'checked':''}>${esc(m.title)}</label>`).join('')}</details>`:''}`;
}
function noteDetails(n){return `${n.ai?`<div class="ai-origin"><span class="pill ai">智能辅助 · ${n.ai.verification==='reviewed'?'已核对':'待核'}</span><span>${esc(n.ai.model)}</span>${n.ai.verification!=='reviewed'?`<button class="text-btn" data-action="verify-ai-note" data-id="${n.id}">标为已核对</button>`:''}</div>`:''}${n.methods?.length?`<div class="method-tags">${tagsHtml(n.methods)}</div>`:''}${n.question?`<h4 class="note-question">${esc(n.question)}</h4>`:''}${n.source?`<details class="source-note"><summary>出处 · ${esc(n.source.location||`第 ${n.source.page} 页`)}</summary><div>${esc(n.source.file)}</div><blockquote>${esc(n.source.excerpt)}</blockquote><p>${n.imported?'按讲义原位置导入，保留原话；其中的事实、数据和引文待核。':'据课件原句整理为问题式笔记，原句和整理稿分别保存。'}</p></details>`:''}${(n.evidenceIds||[]).length?`<details class="source-note note-evidence-source"><summary>依据材料（${n.evidenceIds.length}）</summary>${n.evidenceIds.map(id=>{const m=state.materials.find(m=>m.id===id);if(!m)return '<p>这份材料已移除。</p>';return `<article><strong>${esc(m.title)}</strong>${m.sourceText?`<blockquote class="guide-prose">${esc(m.sourceText)}</blockquote>`:'<p>尚未摘录原文。</p>'}<div class="row wrap">${m.attachmentId?`<button class="text-btn" data-action="file-download" data-id="${m.attachmentId}">查看原文件</button>`:''}${m.url?`<a class="text-btn" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">核对来源 ↗</a>`:''}</div></article>`;}).join('')}</details>`:''}`;}
function versionStatus(unit,year){
  const index=M.years.indexOf(year),v=unit.versions[year],previous=unit.versions[M.years[index-1]],self=unit.kind==='preamble'?'本自然段':'本条';
  if(!v.exists)return {kind:'absent',short:'尚无此条',long:`${year} 年${CODEX.short}尚无此条。`};
  if(!index)return {kind:'origin',short:'原文',long:`${year} 年${CODEX.short}原文。`};
  const law=M.lawOf(unit.id);
  if(!previous.exists&&law&&!M.units.some(u=>M.lawOf(u.id)===law&&u.versions[M.years[index-1]]?.exists))return {kind:'origin',short:'原文',long:`${year} 年${law.short||law.name}通过时的原文。`};
  if(!previous.exists)return {kind:'changed',short:'新增',long:`${year} 年修正时增设${self}。`};
  if(v.diff.some(op=>op.type==='insert'||op.type==='delete'))return {kind:'changed',short:'经修正',long:`${year} 年修正涉及${self}。`};
  if(previous.label!==v.label)return {kind:'number',short:'条号变动',long:`${year} 年修正后，条号由${previous.label}变为${v.label}，内容未经修正。`};
  const last=M.years.slice(0,index).filter(y=>['origin','changed'].includes(versionStatus(unit,y).kind)).at(-1);
  return {kind:'unchanged',short:'未修正',long:`${year} 年修正未涉及${self}，沿用 ${last===FIRST?FIRST+' 年原文':last+' 年文本'}${v.diff.some(op=>op.type==='editorial')?'；材料中的标点差异见校记':''}。`};
}
function readerYearOptions(unit){return M.years.map(year=>`<option value="${year}" ${year===state.year?'selected':''}>${year} 年 · ${versionStatus(unit,year).short}</option>`).join('');}
function revisionStrip(unit){return `<div class="revision-strip" aria-label="各年修正情况">${M.years.map(year=>{const status=versionStatus(unit,year);return `<button class="revision-point ${status.kind} yr-${year}" data-action="read-year" data-year="${year}" data-unit="${unit.id}" title="${esc(status.long)}"><strong>${year}</strong><span>${status.short}</span></button>`;}).join('')}</div>`;}
const lineageCache=new Map();
function versionLineage(unit,compact=false){
  if(!lineageCache.has(unit.id))lineageCache.set(unit.id,M.lineage(unit.id));
  const pieces=lineageCache.get(unit.id).filter(t=>!t.removedEditorial).map(t=>{
    const trailing=t.text.match(/\n+$/)?.[0]||'',content=esc(t.text.slice(0,t.text.length-trailing.length)).replace(/\n/g,'<br>'),breaks='<br>'.repeat(trailing.length);
    if(t.removed)return `<del class="revision-delete year-${t.removed}" title="${t.born} 年文字，${t.removed} 年删除">${content}</del><sup class="revision-year">${t.born!==FIRST?`${t.born}增 · `:''}${t.removed}删</sup>${breaks}`;
    if(t.born!==FIRST&&!t.bornEditorial)return `<ins class="revision-insert year-${t.born}" title="${t.born} 年新增">${content}</ins><sup class="revision-year">${t.born}增</sup>${breaks}`;
    return content+breaks;
  }).join('');
  return `${revisionStrip(unit)}${!compact?'<p class="note-source">历次增删保留在原处，角标注明年份。点年份可阅读当年全文。标点校勘不计为修正。</p>':''}<div class="law-text cumulative-text ${ui.changes?'colored':''}">${pieces}</div>`;
}
function renderMaterials(a){
  const records=state.materials.filter(m=>m.unitId===a.id);
  return `<div class="row between"><span class="small muted">材料要回应一个解释问题</span><button class="btn small" data-action="add-material">${icon('plus')}添加</button></div>${records.map(m=>`<article class="material-card"><div class="row wrap"><span class="pill">${esc(m.type)}</span><span class="pill">${esc(m.verification||'待核')}</span></div><h3>${esc(m.title)}</h3><div class="method-tags">${tagsHtml(m.methods)}</div>${m.question?`<p class="note-question">${esc(m.question)}</p>`:''}<p>${esc(m.reason)}</p><span class="small muted">${esc(m.evidenceRole||'背景')}${m.amendmentYear?` · 对应 ${m.amendmentYear} 年文本`:''}${m.sourceDate?` · 形成于 ${esc(m.sourceDate)}`:''}</span>${m.url?`<p><a class="text-btn" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer">核对来源 ↗</a></p>`:''}${m.sourceText?`<details class="source-note"><summary>材料摘记</summary><div>${esc(m.sourceText)}</div></details>`:''}<button class="text-btn danger" data-action="delete-material" data-id="${m.id}">移除</button></article>`).join('')||'<div class="empty">可以收录制宪史料、修宪史料、法律法规、案例、新闻事实或学术文献，并写明它支持、质疑还是补充了哪一种理解。</div>'}<div class="rail-hint">材料类型和解释方法分开记录：同一份材料可以服务几种解释，也可以用来检验原来的判断。</div>`;
}
function showMaterial(updateId=null,amendmentYear=null,preset=null){
  const u=preset||state.updates.find(x=>x.id===updateId);
  showModal('收录材料',`<form id="material-form" data-update="${esc(updateId||'')}"><label for="material-title">材料名称</label><input id="material-title" name="title" maxlength="500" required value="${esc(u?.title||'')}"><div class="form-columns"><div><label for="material-type">材料类型</label><select id="material-type" name="type">${['制宪史料','修宪史料','法律法规','案例','新闻／事实','学术文献','其他'].map(t=>`<option ${(u?.type==='修宪背景'?'修宪史料':u?.type)===t||amendmentYear&&t==='修宪史料'?'selected':''}>${t}</option>`).join('')}</select></div><div><label for="material-unit">关联条文 · ${state.year} 年文本</label><select id="material-unit" name="unitId">${unitOptions()}</select></div></div><label for="material-question">要回应的解释问题</label><input id="material-question" name="question" placeholder="这份材料帮助解释哪句话、哪种制度关系？">${methodField('material-methods',amendmentYear?['历史解释']:[])}<div class="form-columns"><div><label for="material-amendment-year">对应的文本年份</label><select id="material-amendment-year" name="amendmentYear"><option value="">不限定</option>${M.years.map(y=>`<option value="${y}" ${y===amendmentYear?'selected':''}>${y}</option>`).join('')}</select></div><div><label for="material-date">材料形成时间（可选）</label><input id="material-date" name="sourceDate" value="${esc(u?.date||'')}" placeholder="例如：${FIRST}年，或具体日期"></div></div><label for="material-url">来源链接（可选）</label><input id="material-url" name="url" type="url" value="${esc(u?.url||'')}" placeholder="https://…"><label for="material-text">原文摘记</label><textarea id="material-text" name="sourceText" rows="3">${esc(u?.text||'')}</textarea><div class="form-columns"><div><label for="material-role">在论证中的作用</label><select id="material-role" name="evidenceRole"><option>背景</option><option>支持</option><option>质疑</option><option>补充</option></select></div><div><label for="material-check">来源核验</label><select id="material-check" name="verification"><option>待核</option><option>已核对原文</option></select></div></div><label for="material-reason">与条文的关系和目前的判断</label><textarea id="material-reason" name="reason" required maxlength="20000" rows="3"></textarea><p class="note-source" data-material-hint>材料由自己录入、核对。</p><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn primary">保存</button></div></form>`);
}

function chapterTitle(c){return c?.title||'';}
// Scope values name a structure node; 'chapter:' and 'section:' are older spellings of 'node:'.
const scopeNode=scope=>/^(?:node|chapter|section):/.test(scope)?M.node(scope.split(':')[1],state.year):null;
function scopeOptions(){const current=scopeNode(ui.outlineScope)?.id;return `<option value="all" ${ui.outlineScope==='all'?'selected':''}>${esc(CODEX.whole)}</option>${M.tree(state.year).flat.map(n=>`<option value="node:${n.id}" ${current===n.id?'selected':''}>${'　'.repeat(n.depth)}${esc(n.title)}</option>`).join('')}${state.groups.length?`<optgroup label="我的部分">${state.groups.map(g=>`<option value="group:${g.id}" ${ui.outlineScope==='group:'+g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</optgroup>`:''}`;}
function blockLabel(unit,text,block){return clauseLabels(unit)[block]?.cite||'';}
function blockAnchor(u,year,i){return M.anchor(u.id,year,i,0,ver(u,year).paragraphs[i].length);}
function selectedAnchor(a){return ui.structureSelection.some(b=>M.anchorKey(a)===M.anchorKey(b));}
function groupMembership(unitId){return state.groups.filter(g=>g.anchors.some(a=>a.unitId===unitId));}
function renderOutline(){
  const groupId=ui.outlineScope.startsWith('group:')?ui.outlineScope.slice(6):null,group=state.groups.find(g=>g.id===groupId),units=group?[]:M.scopeUnits(ui.outlineScope,state.year);
  const scopeName=group?.name||(ui.outlineScope==='all'?CODEX.whole:scopeNode(ui.outlineScope)?.title||'所选范围');
  const shown=[];
  const body=group?renderGroupBody(group):units.map(u=>{
    const v=ver(u),a=M.whole(u.id,state.year);
    // A heading for every structure level entered here: 章 as h2, 节 as h3, deeper levels as h4.
    let heading='';M.path(u.id,state.year).forEach((n,depth)=>{if(shown[depth]===n.id)return;shown.length=depth;shown[depth]=n.id;const tag=['h2','h3'][depth]||'h4';heading+=`<${tag} class="outline-${depth?'section':'chapter'} depth-${depth}">${esc(n.title)}</${tag}>`;});
    return `${heading}<article class="outline-article" id="outline-${u.id}"><header><label class="check outline-title">${ui.outlineSelect?`<input type="checkbox" aria-label="选择${esc(v.label)}" data-structure-anchor="${esc(JSON.stringify(a))}" ${selectedAnchor(a)?'checked':''}>`:''}<strong>${esc(v.label)}</strong>${M.subtitle(state,u.id)?`<span class="outline-subtitle">【${esc(M.subtitle(state,u.id))}】</span>`:''}</label><div class="row wrap"><button class="text-btn" data-action="memorize-unit" data-unit="${u.id}">记忆卡片</button><button class="text-btn" data-action="goto" data-unit="${u.id}">逐条阅读 →</button></div></header>${ui.outlineMode==='laws'?lawStatusLine(u):''}${ui.outlineMode==='history'?versionLineage(u,true):ui.outlineMode==='english'&&!ui.outlineSelect?bilingualUnit(u,state.year):`<div class="outline-paragraphs ${ui.outlineSelect?'selecting':''}">${v.paragraphs.map((text,i)=>{const a=blockAnchor(u,state.year,i),name=blockLabel(u,text,i);return `<div class="outline-paragraph">${ui.outlineSelect||name?`<label title="${ui.outlineSelect?'选择这一款（项）':''}">${ui.outlineSelect?`<input type="checkbox" aria-label="选择${esc(v.label)}${esc(name)}" data-structure-anchor="${esc(JSON.stringify(a))}" ${selectedAnchor(a)?'checked':''}>`:''}<span>${esc(name.replace(/^第.+款(?=第)/,''))}</span></label>`:'<span></span>'}<p class="law-text">${esc(text)}</p></div>`;}).join('')}</div>`}${notesBelow(u,state.preferences.noteMode)}${groupMembership(u.id).length?`<div class="group-tags">${groupMembership(u.id).map(g=>`<button class="method-tag" data-action="open-group" data-id="${g.id}">${esc(g.name)}</button>`).join('')}</div>`:''}</article>`;
  }).join('');
  return `${welcomeCard()}${pageHead('体系阅读',`把条文放回章、节和${esc(CODEX.whole)}中读；也可以按自己的问题划分部分，写明部分之间的关系。`,`<button class="btn" data-action="outline-help">怎样划分部分</button>`)}<div class="outline-toolbar"><button class="btn small outline-toc-button" data-action="outline-toc">${icon('list')}目录</button><label>范围<select id="outline-scope">${scopeOptions()}</select></label><label>年份<select id="outline-year" ${ui.outlineMode==='history'?'disabled':''}>${yearOptions()}</select></label><label>呈现<select id="outline-mode" ${group?'disabled':''}><option value="text" ${ui.outlineMode==='text'?'selected':''}>正文</option>${M.years.length>1?`<option value="history" ${ui.outlineMode==='history'?'selected':''}>历次修正</option>`:''}${DATA.english?`<option value="english" ${ui.outlineMode==='english'?'selected':''}>中英对照</option>`:''}${CODEX.delegationTerms||DATA.relatedLaws?`<option value="laws" ${ui.outlineMode==='laws'?'selected':''}>立法实施</option>`:''}</select></label>${ui.outlineMode==='history'?`<button class="btn small" data-action="outline-colors" aria-pressed="${ui.changes}">${ui.changes?'隐藏增删标记':'显示增删标记'}</button>`:''}<button class="btn small ${ui.outlineSelect?'accent':''}" data-action="outline-select" aria-pressed="${ui.outlineSelect}">${ui.outlineSelect?'结束划分':'划分部分'}</button>${noteDisplayControl()}</div><div class="structure-workspace"><section>${ui.outlineSelect?`<div class="structure-selection"><span id="structure-count">已选 ${ui.structureSelection.length} 处</span><div class="row wrap"><button class="text-btn" data-action="select-scope">全选此范围</button><button class="text-btn" data-action="clear-structure">清除</button><button class="btn small primary" data-action="structure-group">划为一个部分</button></div></div>`:''}<div class="outline-document"><div class="document-title"><span class="pill">${ui.outlineMode==='history'?`${FIRST}—${LATEST} 历次修正`:`${state.year} 年文本`}</span><h2>${esc(scopeName)}</h2>${!group?`<p>共 ${units.length} 条${units.some(u=>u.kind==='preamble')?'（序言按自然段计）':''}</p>`:''}</div>${ui.outlineMode==='laws'&&!group&&typeof lawStatusSummary==='function'?lawStatusSummary(units):''}${body}</div></section><aside class="structure-sidebar"><div class="segmented outline-side-tabs" role="tablist" aria-label="体系阅读侧栏">${[['toc','目录'],['notes','笔记'],['groups','部分']].map(([key,text])=>`<button role="tab" data-action="outline-side" data-side="${key}" class="${ui.outlineSide===key?'active':''}" aria-selected="${ui.outlineSide===key}">${text}</button>`).join('')}</div>${ui.outlineSide==='toc'?outlineToc():ui.outlineSide==='notes'?outlineNoteList():`<div class="row between"><h3>我的部分</h3><span class="pill">${state.groups.length}</span></div>${state.groups.map(g=>`<article class="group-card"><button class="text-btn group-name" data-action="open-group" data-id="${g.id}">${esc(g.name)}</button>${g.parentId?`<div class="small muted">属于 ${esc(state.groups.find(x=>x.id===g.parentId)?.name||'')}</div>`:''}<p>${g.anchors.length} 处原文 · ${[...new Set(g.anchors.map(a=>a.year))].join('、')} 年文本</p><div class="row"><button class="text-btn" data-action="edit-group" data-id="${g.id}">编辑</button><button class="text-btn" data-action="connect-group" data-id="${g.id}">建立关联</button></div></article>`).join('')||'<div class="empty">点“划分部分”，勾选条、款、项并命名。逐条阅读时，也可以选中字句后划入部分。</div>'}<div class="rule"></div><h3>部分之间的关联</h3>${state.groupLinks.map(l=>`<article class="group-connection"><button class="text-btn" data-action="open-group" data-id="${l.fromId}">${esc(state.groups.find(g=>g.id===l.fromId)?.name)}</button><span class="relationship">${esc(l.relation)}</span><button class="text-btn" data-action="open-group" data-id="${l.toId}">${esc(state.groups.find(g=>g.id===l.toId)?.name)}</button><p>${esc(l.reason)}</p><button class="text-btn muted" data-action="remove-group-link" data-id="${l.id}">移除</button></article>`).join('')||'<p class="small muted">有两个以上的部分后，可以写明它们的关系，例如原则与具体化、授权与监督。</p>'}`}</aside></div>`;
}
// Table of contents for the outline: jump to an article, or to a note written under it.
function outlineUnits(){return ui.outlineScope.startsWith('group:')?M.scopeUnits('all',state.year):M.scopeUnits(ui.outlineScope,state.year);}
function outlineToc(){
  const shown=[];
  const items=outlineUnits().map(u=>{
    const count=state.notes.filter(n=>n.unitId===u.id).length,gist=M.subtitle(state,u.id);
    let head='';M.path(u.id,state.year).forEach((n,depth)=>{if(shown[depth]===n.id)return;shown.length=depth;shown[depth]=n.id;head+=`<div class="toc-chapter depth-${depth}" data-toc-heading>${esc(n.title)}</div>`;});
    return `${head}<button class="toc-entry" data-action="outline-jump" data-unit="${u.id}" data-toc-text="${esc(ver(u).label+gist)}"><span>${esc(ver(u).label)}</span><small>${esc(gist)}</small>${count?`<i title="${count} 则笔记">${count}</i>`:''}</button>`;
  }).join('');
  return `<div class="outline-toc"><input type="search" class="toc-filter" data-toc-filter placeholder="条号或条旨，如 三十七、人身自由" aria-label="筛选目录"><div class="toc-entries">${items}</div></div>`;
}
function outlineNoteList(){
  const order=new Map(M.units.map((u,i)=>[u.id,i])),ids=new Set(outlineUnits().map(u=>u.id));
  const notes=state.notes.filter(n=>ids.has(n.unitId)).sort((a,b)=>order.get(a.unitId)-order.get(b.unitId)||a.createdAt.localeCompare(b.createdAt));
  if(!notes.length)return '<div class="empty">此范围内还没有笔记。</div>';
  return `<div class="outline-toc"><input type="search" class="toc-filter" data-toc-filter placeholder="笔记中的字句" aria-label="筛选笔记"><div class="toc-entries">${notes.map(n=>`<button class="toc-entry toc-note" data-action="outline-jump" data-unit="${n.unitId}" data-note="${n.id}" data-toc-text="${esc(ver(M.get(n.unitId)).label+(n.question||'')+n.text)}"><span>${esc(ver(M.get(n.unitId)).label)}</span><small>${esc((n.question||n.text).slice(0,48))}</small></button>`).join('')}</div></div>`;
}
function outlineJump(unitId,noteId){
  closeModal();
  let target=document.getElementById('outline-'+unitId);
  if(!target||noteId&&state.preferences.noteMode==='hidden'){
    if(!target)ui.outlineScope='all';
    if(noteId&&state.preferences.noteMode==='hidden')state.preferences.noteMode='summary';
    persist();render();target=document.getElementById('outline-'+unitId);
  }
  const note=noteId&&target?.querySelector(`[data-note-id="${noteId}"]`);
  (note||target)?.scrollIntoView({block:'start',behavior:'smooth'});
  (note||target)?.classList.add('jump-flash');setTimeout(()=>(note||target)?.classList.remove('jump-flash'),1600);
}
function renderGroupBody(group){return `<div class="group-description"><p>${esc(group.description)}</p><button class="btn small" data-action="edit-group" data-id="${group.id}">编辑</button></div>${group.anchors.map(a=>`<article class="outline-article"><header>${anchorButton([a])}<button class="text-btn" data-action="memorize-unit" data-unit="${a.unitId}" data-year="${a.year}">记忆卡片</button>${ui.outlineSelect?`<label class="check"><input type="checkbox" data-structure-anchor="${esc(JSON.stringify(a))}" ${selectedAnchor(a)?'checked':''}>选择</label>`:''}</header>${a.block===null?paraList(M.version(a.unitId,a.year).paragraphs,'law-text'):`<p class="law-text">${esc(a.quote)}</p>`}${notesBelow(M.get(a.unitId),state.preferences.noteMode)}</article>`).join('')}<div class="group-tags">${state.groupLinks.filter(l=>l.fromId===group.id||l.toId===group.id).map(l=>{const id=l.fromId===group.id?l.toId:l.fromId;return `<button class="btn small" data-action="open-group" data-id="${id}">${esc(l.relation)} ↔ ${esc(state.groups.find(g=>g.id===id)?.name)}</button>`;}).join('')}</div>`;}
function showGroupEditor(id=null,anchors=[]){
  const g=state.groups.find(g=>g.id===id);
  ui.groupDraft={id:g?.id||null,name:g?.name||'',description:g?.description||'',parentId:g?.parentId||'',anchors:g?JSON.parse(JSON.stringify(g.anchors)):M.mergeAnchors(anchors)};
  renderGroupEditor();
}
function renderGroupEditor(){
  const g=ui.groupDraft;
  showModal(g.id?'编辑部分':'划分部分',`<form id="group-form"><label for="group-name">部分名称</label><input id="group-name" name="name" maxlength="120" required value="${esc(g.name)}" placeholder="例如：国家机构之间的监督关系"><label for="group-parent">上级部分（可选）</label><select id="group-parent" name="parentId"><option value="">独立部分</option>${state.groups.filter(x=>x.id!==g.id).map(x=>`<option value="${x.id}" ${x.id===g.parentId?'selected':''}>${esc(x.name)}</option>`).join('')}</select><label for="group-description">划分的依据与要研究的问题</label><textarea id="group-description" name="description" rows="3">${esc(g.description)}</textarea><label>组成范围 · ${g.anchors.length} 处</label><div class="group-members">${g.anchors.map((a,i)=>`<div class="group-member"><span>${esc(label(M.get(a.unitId),a.year))} · ${a.year}<br><small>${esc(a.quote||(M.get(a.unitId).kind==='preamble'?'整个自然段':'整条'))}</small></span><button type="button" class="text-btn" data-action="remove-group-member" data-index="${i}">移除</button></div>`).join('')||'<p class="empty">请先在正文中选择。</p>'}</div>${!g.id&&state.groups.length?`<label for="group-append">或加入已有部分</label><select id="group-append" name="appendId"><option value="">新建部分</option>${state.groups.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>`:''}<p class="note-source">部分是自己的阅读分类，不改变${esc(CODEX.short)}原有的章、节结构。同一处原文可以属于几个部分。</p><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn primary">保存</button></div></form>`);
}
function showGroupConnection(id){
  if(state.groups.length<2){toast('先建立另一个部分，再关联它们。');return;}
  showModal('关联两个部分',`<form id="group-link-form"><label for="group-link-from">从</label><select id="group-link-from" name="fromId">${state.groups.map(g=>`<option value="${g.id}" ${g.id===id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><label for="group-link-to">到</label><select id="group-link-to" name="toId">${state.groups.map(g=>`<option value="${g.id}" ${g.id===state.groups.find(x=>x.id!==id)?.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><label for="group-link-relation">关系名称</label><input id="group-link-relation" name="relation" required maxlength="120" placeholder="自由填写，例如：具体化、例外、授权与监督"><label for="group-link-reason">关联理由</label><textarea id="group-link-reason" name="reason" rows="3"></textarea><p class="note-source">两个部分都会显示这项关联。</p><div class="modal-actions"><button class="btn primary" type="submit">保存</button></div></form>`);
}

function personName(id){return id==='self'?'我':state.people.find(p=>p.id===id)?.name||'未命名成员';}
function renderDiscussions(){
  const visible=state.discussions.filter(t=>M.canRead(t,ui.viewer)),t=visible.find(t=>t.id===ui.discussionId)||visible[0];
  return `${pageHead('共享讨论','选定成员、笔记和主题，再留言讨论。以后修改自己的笔记，不会改变已共享的副本。',ui.viewer==='self'?'<button class="btn primary" data-action="new-discussion">新建讨论</button>':'')}<div class="demo-notice"><span class="pill warm">本地演示 · 未发送</span><span>成员和留言只保存在这台电脑上。</span><label>预览身份<select id="discussion-viewer"><option value="self" ${ui.viewer==='self'?'selected':''}>我（发起人）</option>${state.people.map(p=>`<option value="${p.id}" ${ui.viewer===p.id?'selected':''}>${esc(p.name)}（模拟）</option>`).join('')}</select></label>${ui.viewer==='self'?'<button class="text-btn" data-action="manage-people">管理成员</button>':''}</div><div class="discussion-layout"><aside class="topic-list">${visible.map(x=>`<button class="topic-button ${x.id===t?.id?'active':''}" data-action="open-discussion" data-id="${x.id}"><strong>${esc(x.title)}</strong><span>${x.notes.length} 则笔记 · ${x.comments.length} 条留言${x.archived?' · 已归档':''}</span></button>`).join('')||'<div class="empty">这个身份下还没有可见主题。</div>'}</aside><section class="discussion-paper">${t?renderDiscussion(t):`<div class="big-empty"><h3>${ui.viewer==='self'?'只分享自己选中的内容。':'尚未被选为讨论成员。'}</h3><p>${ui.viewer==='self'?'新建一个主题，选定成员，再选愿意讨论的笔记。':'在这个本地演示中，未被选中的成员看不到主题和笔记。'}</p>${ui.viewer==='self'?'<button class="btn" data-action="new-discussion">创建第一个讨论</button>':''}</div>`}</section></div>`;
}
function renderDiscussion(t){
  const owner=ui.viewer==='self';
  return `<header class="discussion-heading"><div><span class="eyebrow">${t.archived?'已归档':'讨论主题'}</span><h2>${esc(t.title)}</h2></div>${owner?`<button class="btn small" data-action="edit-discussion" data-id="${t.id}">共享设置</button>`:''}</header><p class="discussion-question">${esc(t.question)}</p><div class="member-pills"><span class="pill">我 · 发起人</span>${t.members.map(m=>`<span class="pill">${esc(personName(m.personId))} · ${m.role==='comment'?'可留言':'仅阅读'}</span>`).join('')}</div><h3 class="small section-label">共享的笔记副本 · ${t.notes.length}</h3>${t.notes.map(n=>`<article class="shared-note"><div class="row between"><span>${esc(label(M.get(n.unitId),n.year))} · ${n.year}</span><span class="pill">共享副本</span></div><div class="method-tags">${tagsHtml(n.methods)}${n.ai?'<span class="pill ai">智能辅助</span>':''}</div>${n.question?`<h4>${esc(n.question)}</h4>`:''}${n.anchors.length?`<blockquote>${esc(anchorSummary(n.anchors))}</blockquote>`:''}<p>${esc(n.text)}</p></article>`).join('')||'<p class="small muted">此主题未附个人笔记。</p>'}<div class="row between section-label"><h3 class="small">留言 · ${t.comments.length}</h3>${owner?`<button class="text-btn" data-action="archive-discussion" data-id="${t.id}">${t.archived?'重新开放':'归档主题'}</button>`:''}</div><div class="comments">${t.comments.map(c=>`<article class="comment"><div class="row between"><strong>${esc(personName(c.authorId))}${c.authorId!=='self'?' · 本地模拟':''}</strong><time>${date(c.createdAt)}</time></div><p>${esc(c.text)}</p></article>`).join('')||'<p class="empty small">还没有留言。</p>'}</div>${M.canComment(t,ui.viewer)?`<form id="comment-form" data-id="${t.id}"><label for="comment-text">${ui.viewer==='self'?'我的留言':`以 ${esc(personName(ui.viewer))} 的身份模拟留言`}</label><textarea id="comment-text" name="text" required maxlength="20000" rows="3" placeholder="写下问题、回应或补充材料。"></textarea><div class="modal-actions"><button class="btn primary" type="submit">留言</button></div></form>`:`<p class="hint-panel">${t.archived?'主题已归档，暂不接受新留言。':'这个成员只能阅读，不能留言。'}</p>`}`;
}
function showPeople(){showModal('管理讨论成员',`<p class="note-source">这里保存准备邀请的成员名称。本地演示不会发送邀请或建立真实账号。</p><div class="member-pills">${state.people.map(p=>`<span class="pill">${esc(p.name)}</span>`).join('')||'<span class="small muted">尚未添加成员。</span>'}</div><form id="person-form"><label for="person-name">成员名称</label><input id="person-name" name="name" required maxlength="120" placeholder="输入姓名或称呼"><div class="modal-actions"><button class="btn primary" type="submit">添加成员</button></div></form>`);}
function showDiscussionEditor(id=null,selectedIds=[]){
  const t=state.discussions.find(t=>t.id===id);if(t)selectedIds=t.notes.map(n=>n.noteId);
  showModal(t?'修改共享范围':'新建本地讨论',`<form id="discussion-form" data-id="${t?.id||''}"><label for="discussion-title">讨论主题</label><input id="discussion-title" name="title" required maxlength="200" value="${esc(t?.title||'')}" placeholder="用一个具体问题开始"><label for="discussion-question">说明或待讨论的问题</label><textarea id="discussion-question" name="question" rows="3">${esc(t?.question||'')}</textarea><label>选择共享成员</label><div class="member-selector">${state.people.map(p=>{const member=t?.members.find(m=>m.personId===p.id);return `<div class="member-option"><label class="check"><input type="checkbox" name="member" value="${p.id}" ${member?'checked':''}>${esc(p.name)}</label><select name="role-${p.id}" aria-label="${esc(p.name)}的权限"><option value="comment" ${member?.role!=='read'?'selected':''}>可阅读和留言</option><option value="read" ${member?.role==='read'?'selected':''}>仅阅读</option></select></div>`;}).join('')||'<p class="small muted">可以在下方填写一个成员名称。</p>'}</div><label for="new-member">添加并选中新成员（可选）</label><input id="new-member" name="newMember" maxlength="120" placeholder="姓名或称呼"><label>选择共享笔记</label><div class="share-note-selector">${state.notes.map(n=>`<label class="share-note-option"><input type="checkbox" name="note" value="${n.id}" ${selectedIds.includes(n.id)?'checked':''}><span><strong>${esc(n.question||label(M.get(n.unitId),n.year))}</strong><small>${esc(label(M.get(n.unitId),n.year))} · ${n.year} · ${esc(n.text.slice(0,85))}</small></span></label>`).join('')||'<p class="small muted">还没有个人笔记。也可以先创建一个讨论问题。</p>'}</div><p class="hint-panel">保存时生成所选笔记的副本。以后修改私人笔记不会自动同步；重新保存共享设置时，才更新这些副本。本地演示未向任何成员发送内容。</p><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">保存共享设置</button></div></form>`);
}
function appendWorkspaceMarkdown(lines){
  lines.push('# 自定义部分','');for(const g of state.groups){lines.push(`## ${g.name}`,'',g.description,'');for(const a of g.anchors)lines.push(`- ${label(M.get(a.unitId),a.year)} · ${a.year} · ${a.quote||'全文'}`);lines.push('');}
  lines.push('# 部分之间的关系','');for(const l of state.groupLinks)lines.push(`${state.groups.find(g=>g.id===l.fromId)?.name} → ${l.relation} → ${state.groups.find(g=>g.id===l.toId)?.name}`,l.reason,'');
  lines.push('# 本地讨论记录','');for(const t of state.discussions){lines.push(`## ${t.title}`,t.question,`成员：${t.members.map(m=>personName(m.personId)).join('、')}`,'');for(const n of t.notes)lines.push(`### 共享笔记：${label(M.get(n.unitId),n.year)}`,n.question,n.text,'');for(const c of t.comments)lines.push(`${personName(c.authorId)}（${date(c.createdAt)}）：${c.text}`,'');}
}
function captureGroupFields(){const form=document.getElementById('group-form');if(form&&ui.groupDraft){const f=Object.fromEntries(new FormData(form));Object.assign(ui.groupDraft,{name:f.name,description:f.description,parentId:f.parentId});}}
function updateStructureSelection(a,checked){
  let list=ui.structureSelection.filter(b=>M.anchorKey(a)!==M.anchorKey(b));
  if(checked){list=list.filter(b=>!(b.unitId===a.unitId&&b.year===a.year&&(a.block===null||b.block===null)));list.push(a);}
  ui.structureSelection=M.mergeAnchors(list);
}
// Additional actions use the same event delegation and local persistence as the reader.
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action,id=el.dataset.id;
  try{switch(action){
    case 'add-method':{const input=document.getElementById(el.dataset.field);if(!input)break;input.value=M.tags([...M.tags(input.value),el.dataset.method]).join('，');if(input.id==='note-methods'){const d=state.drafts[draftKey()]||{text:'',anchors:[]};d.methods=M.tags(input.value);state.drafts[draftKey()]=d;persist();}break;}
    case 'outline-side':ui.outlineSide=el.dataset.side;render();break;
    case 'outline-toc':showModal('目录',`<div class="outline-toc-modal">${outlineToc()}</div>`);break;
    case 'outline-jump':outlineJump(el.dataset.unit,el.dataset.note);break;
    case 'outline-help':showModal('怎样划分部分',`<p>${esc(CODEX.short)}原有的章、节，是立法者对条文的划分。读书时，也可以按自己的问题把条文重新归类，例如把涉及监督的条款放在一起，观察它们之间的关系。这正是体系解释的练习。</p><p>先选范围，点“划分部分”，勾选条、款或项，再点“划为一个部分”并命名。部分可以嵌套，也可以重叠。需要更细的范围时，在逐条阅读中选中字句，点“划入部分”。</p><p>在“我的部分”中点“建立关联”，写明关系名称和理由，例如原则与具体化、授权与监督。两个部分都会显示这项关联。</p>`);break;
    case 'outline-select':ui.outlineSelect=!ui.outlineSelect;if(!ui.outlineSelect)ui.structureSelection=[];render();break;
    case 'select-scope':{const g=state.groups.find(g=>'group:'+g.id===ui.outlineScope);ui.structureSelection=g?[...g.anchors]:M.scopeUnits(ui.outlineScope,state.year).map(u=>M.whole(u.id,state.year));render();break;}
    case 'clear-structure':ui.structureSelection=[];render();break;
    case 'structure-group':if(!ui.structureSelection.length){toast('先勾选至少一处原文。');break;}showGroupEditor(null,ui.structureSelection);break;
    case 'selection-group':showGroupEditor(null,ui.selection);break;
    case 'edit-group':showGroupEditor(id);break;
    case 'remove-group-member':captureGroupFields();ui.groupDraft.anchors.splice(Number(el.dataset.index),1);renderGroupEditor();break;
    case 'open-group':closeModal();ui.outlineScope='group:'+id;ui.outlineMode='text';ui.view='outline';render();window.scrollTo({top:0,behavior:'instant'});break;
    case 'connect-group':showGroupConnection(id);break;
    case 'remove-group-link':state.groupLinks=state.groupLinks.filter(l=>l.id!==id);persist();render();toast('关联已移除，两个部分仍然保留。');break;
    case 'outline-colors':ui.changes=!ui.changes;render();break;
    case 'revision-source-save':{
      const year=Number(el.dataset.year),doc=DATA.revisionHistory.documents[year],text=DATA.revisionHistory.points.filter(p=>p.year===year&&p.units.includes(el.dataset.unit)).map(p=>p.text).join('\n');
      ui.rail='materials';render();showMaterial(null,year,{title:`${doc.speaker.replace(/^.*\s/,'')}：${doc.title}`,type:'修宪史料',url:doc.url,text,date:doc.occasion.replace(/在.*$/,'')});break;}
    case 'revision-material':readUnit(el.dataset.unit,Number(el.dataset.year),'materials');showMaterial(null,state.year);break;
    case 'manage-people':showPeople();break;
    case 'new-discussion':showDiscussionEditor();break;
    case 'discuss-note':showDiscussionEditor(null,[id]);break;
    case 'edit-discussion':showDiscussionEditor(id);break;
    case 'open-discussion':ui.discussionId=id;render();break;
    case 'archive-discussion':{const t=state.discussions.find(t=>t.id===id);if(ui.viewer==='self'&&t){t.archived=!t.archived;t.updatedAt=now();persist();render();}break;}
  }}catch(e){toast(e.message||'操作未完成。');}
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.matches('[data-toc-search]')){
    const box=el.closest('.modal-body')||document,results=box.querySelector('[data-toc-results]'),list=tocMatches(el.value);
    box.querySelector('[data-toc-browse]').hidden=!!el.value.trim();results.hidden=!el.value.trim();
    results.innerHTML=list.map(tocUnitButton).join('')||'<p class="small muted">没有找到。可以输入条号，如“37”“第三十七条”，或条旨中的字词。</p>';
    return;
  }
  if(el.matches('[data-toc-filter]')){
    const q=el.value.replace(/\s/g,'').replace(/^第/,'').replace(/条$/,'');let visible=0;
    for(const item of el.parentElement.querySelectorAll('.toc-entry')){const show=!q||item.dataset.tocText.replace(/\s/g,'').includes(q);item.hidden=!show;visible+=show;}
    for(const head of el.parentElement.querySelectorAll('[data-toc-heading]'))head.hidden=!!q;
    return;
  }
  if(el.id==='note-question'||el.id==='note-methods'){const d=state.drafts[draftKey()]||{text:'',anchors:[]};if(el.id==='note-question')d.question=el.value;else d.methods=M.tags(el.value);state.drafts[draftKey()]=d;persist();}
});
document.addEventListener('change',event=>{
  const el=event.target;
  try{
    if(el.id==='outline-scope'){ui.outlineScope=el.value;if(el.value.startsWith('group:'))ui.outlineMode='text';ui.structureSelection=[];render();}
    if(el.id==='outline-year'){state.year=Number(el.value);ui.structureSelection=[];if(/^(?:node|chapter|section):/.test(ui.outlineScope)&&!scopeNode(ui.outlineScope))ui.outlineScope='all';persist();render();}
    if(el.id==='outline-mode'){ui.outlineMode=el.value;ui.structureSelection=[];if(el.value==='history'||el.value==='english'&&!DATA.english?.texts[state.year]){state.year=M.years.at(-1);persist();}render();}
    if(el.dataset.structureAnchor){updateStructureSelection(JSON.parse(el.dataset.structureAnchor),el.checked);render();}
    if(el.dataset.noteEvidence){const d=state.drafts[draftKey()]||{text:'',anchors:[]};d.evidenceIds=[...document.querySelectorAll('[data-note-evidence]:checked')].map(x=>x.dataset.noteEvidence);state.drafts[draftKey()]=d;persist();}
    if(el.id==='group-append')document.getElementById('group-name').required=!el.value;
    if(el.id==='discussion-viewer'){ui.viewer=el.value;ui.discussionId=null;render();}
  }catch(e){toast(e.message);}
});
document.addEventListener('submit',event=>{
  const form=event.target;if(!['group-form','group-link-form','person-form','discussion-form','comment-form'].includes(form.id))return;
  event.preventDefault();const fd=new FormData(form),f=Object.fromEntries(fd);
  try{
    if(form.id==='group-form'){
      let fields={...ui.groupDraft,...f,anchors:ui.groupDraft.anchors};
      if(f.appendId){const old=state.groups.find(g=>g.id===f.appendId);fields={...old,anchors:[...old.anchors,...fields.anchors]};}
      const g=M.saveGroup(state,fields);ui.structureSelection=[];ui.selection=[];ui.view='outline';ui.outlineScope='group:'+g.id;persist();closeModal();render();toast('自定义部分已保存。');
    }
    if(form.id==='group-link-form'){M.connectGroups(state,f);persist();closeModal();render();toast('关联已建立。');}
    if(form.id==='person-form'){M.addPerson(state,f.name);persist();render();showPeople();}
    if(form.id==='discussion-form'){
      if(ui.viewer!=='self')throw Error('只有发起人可以修改共享设置。');
      const members=fd.getAll('member').map(id=>({personId:id,role:f['role-'+id]}));
      if(f.newMember.trim()){const p=M.addPerson(state,f.newMember);if(!members.some(m=>m.personId===p.id))members.push({personId:p.id,role:'comment'});}
      const t=M.saveDiscussion(state,{id:form.dataset.id,title:f.title,question:f.question,noteIds:fd.getAll('note'),members});
      ui.discussionId=t.id;ui.view='discussions';persist();closeModal();render();toast('共享范围已保存到本机，尚未发送给成员。');
    }
    if(form.id==='comment-form'){M.addComment(state,form.dataset.id,ui.viewer,f.text);persist();render();toast('留言已保存在本机。');}
  }catch(e){toast(e.message||'保存失败。');}
});

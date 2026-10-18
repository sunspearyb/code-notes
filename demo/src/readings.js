'use strict';
// 比较阅读, 备案审查 and the official English text. The data pack switches each on: relationCategories
// in codex.json, and the english and reviewHistory files it lists. Functions read DATA directly because
// earlier files render before this one runs.

// ---------- Official English text ----------
function englishToggle(v){return DATA.english?`<button class="btn small ${ui.english?'accent':''}" data-action="toggle-english" aria-pressed="${!!ui.english}" ${!v.exists?'disabled':''} title="对照官方英文译本">英文</button>`:'';}
// Sources are keyed by year; packs of several laws may key them by law and year ("law-node:2021") or by law.
function englishSource(key,unit=null){const law=unit&&M.lawOf(unit.id)?.nodeId,S=DATA.english.sources,s=(law&&(S[`${law}:${key}`]||S[law]))||S[key];if(!s)return '';const archive=[].concat(s.archive||[])[0];return `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)}</a>${archive?`（原网页已下线，见<a href="${esc(safeUrl(archive))}" target="_blank" rel="noopener noreferrer">互联网档案馆存档</a>）`:''}${s.note?` · ${esc(s.note)}`:''}`;}
function englishBlock(unit,year){
  const E=DATA.english;if(!E)return '';
  const text=E.texts[year]?.[unit.id],years=Object.keys(E.texts).map(Number).filter(y=>unit.versions[y]?.exists);
  if(!text)return `<section class="english-text missing"><p>${years.length?`官方英文本只收录了 ${years.join('、')} 年的文本。`:'这一条没有收录官方英文译本。'}</p><div class="row wrap">${years.map(y=>`<button class="btn small" data-action="read-year" data-unit="${unit.id}" data-year="${y}">看 ${y} 年英文本</button>`).join('')}</div></section>`;
  // In a pack of several laws a law may be unchanged in this year; name the year of its text.
  const law=M.lawOf(unit.id),shown=law?lawChangeYears(law).filter(y=>y<=year).at(-1)??year:year;
  return `<section class="english-text" lang="en"><header lang="zh-CN"><span class="pill">English</span><span>${shown} 年文本的官方英文译本 · 仅供参考，以中文本为准</span></header>${text.map(p=>`<p>${esc(p)}</p>`).join('')}<p class="note-source" lang="zh-CN">出处：${englishSource(String(year),unit)}</p></section>`;
}
function amendmentEnglish(year,number){
  const E=DATA.english?.amendments?.[year];if(!E?.articles?.[number])return '';
  return `<section class="english-text" lang="en"><header lang="zh-CN"><span class="pill">English</span><span>官方英文译本 · 仅供参考</span></header>${E.articles[number].map(p=>`<p>${esc(p)}</p>`).join('')}${E.notes?.[number]?`<p class="note-source" lang="zh-CN">说明：${esc(E.notes[number])}</p>`:''}<p class="note-source" lang="zh-CN">出处：${englishSource('amendment-'+year)}</p></section>`;
}
function bilingualUnit(u,year){
  const en=DATA.english?.texts[year]?.[u.id];
  return `<div class="bilingual"><div class="law-text">${ver(u,year).paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div><div class="english-column" lang="en">${en?en.map(p=>`<p>${esc(p)}</p>`).join(''):'<p class="small muted" lang="zh-CN">该年没有官方英文全文。</p>'}</div></div>`;
}

// ---------- 备案审查: official paragraphs that name an article ----------
function reviewDoc(id){return DATA.reviewHistory?.documents.find(d=>d.id===id);}
function reviewPointsFor(unitId){return (DATA.reviewHistory?.points||[]).filter(p=>p.units.includes(unitId));}
function reviewPoint(p,withUnits=false){
  const d=reviewDoc(p.doc);
  const cases=(p.cases||[]).map(c=>`<span class="pill">${esc(c.year)} · ${esc(c.title)}</span>`).join('');
  return `<article class="review-point" data-search-text="${esc(p.text+' '+d.title+' '+(p.cases||[]).map(c=>c.title).join(' '))}">${cases?`<p class="review-cases">${cases}</p>`:''}<blockquote>${esc(p.text)}</blockquote><p class="note-source"><a href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a> · ${esc(d.date)} · 归入依据：${esc(p.basis.join('；'))}</p><div class="row wrap">${withUnits?p.units.map(id=>`<button class="text-btn" data-action="goto" data-unit="${id}">阅读${esc(M.get(id).label)} ↗</button>`).join(''):''}<button class="text-btn" data-action="review-from-point" data-index="${DATA.reviewHistory.points.indexOf(p)}">据此写笔记</button></div></article>`;
}
function reviewSources(unit){
  const points=reviewPointsFor(unit.id);if(!points.length)return '';
  const c=Object.values(M.categories()).find(c=>c.official==='reviewHistory')||{};
  return `<details class="revision-source review-source"><summary><span class="pill">${esc(c.name||'官方资料')}</span>${esc(c.officialLink||'援引本条的')} ${points.length} 段</summary>${points.map(p=>reviewPoint(p)).join('')}<p class="note-source">按原文照录，出自${esc(DATA.reviewHistory.source)}。</p></details>`;
}

// ---------- Category pages: 比较阅读, 备案审查, and any category a data pack declares ----------
// Wording comes from codex.json (relationCategories); "official" names a data file of official paragraphs.
function categoryRecords(key){return state.materialRelations.filter(r=>r.category===key).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
function categoryFilter(placeholder){return `<div class="category-tools"><input type="search" data-category-filter placeholder="${esc(placeholder||'在本页查找')}" aria-label="在本页查找"><span class="small muted" data-filter-count></span></div>`;}
function categoryHead(key){const c=M.categories()[key];return `<div class="page-heading import-heading"><div><h3>${esc(c.name)}</h3>${c.intro?`<p>${esc(c.intro)}</p>`:''}</div><button class="btn primary" data-action="category-new" data-category="${key}">${icon('plus')}${esc(c.newLabel||'新建'+c.name+'笔记')}</button></div>${c.hint?`<div class="hint-panel">${c.hintTitle?`<strong>${esc(c.hintTitle)}</strong>`:''}<p>${esc(c.hint)}</p></div>`:''}`;}
function renderCategoryPage(key){
  const c=M.categories()[key],records=categoryRecords(key),official=c.official&&DATA[c.official];
  const empty=`<div class="big-empty"><h3>${esc(c.emptyTitle||'还没有记录。')}</h3>${c.empty?`<p>${esc(c.empty)}</p>`:''}<button class="btn" data-action="category-new" data-category="${key}">${esc(c.newLabel||'新建')}</button></div>`;
  if(!official)return `<section class="category-page">${categoryHead(key)}${records.length?categoryFilter(c.filterPlaceholder):''}<div class="relation-records" data-filter-list>${records.map(relationCard).join('')||empty}</div></section>`;
  return `<section class="category-page">${categoryHead(key)}${categoryFilter(c.filterPlaceholder)}<div data-filter-list>${officialPoints(official,c)}<h3 class="subheading">我的${esc(c.name)}笔记</h3>${records.length?`<div class="relation-records">${records.map(relationCard).join('')}</div>`:`<p class="empty">${esc(c.empty||'')}</p>`}</div>${officialDocuments(official)}</section>`;
}
function officialPoints(R,c){
  const order=new Map(M.units.map((u,i)=>[u.id,i])),points=[...R.points].sort((a,b)=>(order.get(a.units[0])??1e9)-(order.get(b.units[0])??1e9)||reviewDoc(a.doc).date.localeCompare(reviewDoc(b.doc).date));
  const groups=[];for(const p of points){const key=p.units[0]||'node:'+p.chapters[0];let g=groups.find(g=>g.key===key);if(!g)groups.push(g={key,points:[]});g.points.push(p);}
  const groupTitle=key=>key.startsWith('node:')?M.node(key.slice(5),LATEST)?.title||'':`${M.get(key).label}${M.subtitle(state,key)?' · '+M.subtitle(state,key):''}`;
  return `<h3 class="subheading">${esc(c.officialTitle||'官方资料')}</h3>${R.rule?`<p class="note-source">${esc(R.rule)}</p>`:''}${R.course?`<p class="note-source">带年份标签的是${esc(R.course)}这些事例的段落多数只说宪法原则、精神，归入哪一条由 Claude 拟定，待核。</p>`:''}${groups.map(g=>`<section class="review-group"><h4>${esc(groupTitle(g.key))}${g.key.startsWith('node:')?'':`<button class="text-btn" data-action="goto" data-unit="${g.key}">阅读本条 ↗</button>`}</h4>${g.points.map(p=>reviewPoint(p)).join('')}</section>`).join('')}`;
}
function officialDocuments(R){
  const kinds=[...new Set(R.documents.map(d=>d.kind))];
  return `<details class="source-note review-documents"><summary>全部文件（${R.documents.length} 份）</summary>${kinds.map(kind=>`<h4>${esc({报告:'工作情况报告',案例:'审查案例',制度:'制度规定'}[kind]||kind)}</h4><ul>${R.documents.filter(d=>d.kind===kind).map(d=>`<li><a href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a> <span class="small muted">${esc(d.date)}</span></li>`).join('')}</ul>`).join('')}<p class="note-source">来源：${esc(R.source)}，<a href="${esc(safeUrl(R.column))}" target="_blank" rel="noopener noreferrer">栏目网址</a>。核对日期：${esc(R.documents[0]?.checked||'')}。</p></details>`;
}

// One form for every category: its own fields from codex.json, then the material, scope and the reader's own understanding.
function categoryFieldInputs(key,details={}){
  const c=M.categories()[key];
  return (c?.fields||[]).map(([field,name,options,multi])=>{
    const id='category-'+field,value=details[field]||'',list=field==='jurisdiction'&&c.jurisdictions?'list="jurisdiction-list"':'';
    if(options&&multi){const chosen=value.split('、');return `<fieldset class="check-group"><legend>${esc(name)}</legend>${options.map(o=>`<label class="check"><input type="checkbox" name="detail-${field}" value="${esc(o)}" ${chosen.includes(o)?'checked':''}>${esc(o)}</label>`).join('')}</fieldset>`;}
    if(options)return `<label for="${id}">${esc(name)}</label><select id="${id}" name="detail-${field}">${options.map(o=>`<option ${value===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    return `<label for="${id}">${esc(name)}</label><input id="${id}" name="detail-${field}" maxlength="2000" value="${esc(value)}" ${list}>`;
  }).join('')+(c?.jurisdictions?`<datalist id="jurisdiction-list">${c.jurisdictions.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`:'');
}
function showCategoryForm(key,{record=null,preset={}}={}){
  const c=M.categories()[key],defaultScope=preset.scope||{kind:'articles',year:state.year,unitIds:ver(current()).exists?[state.current]:[]};
  if(!defaultScope.unitIds.length&&defaultScope.kind==='articles')defaultScope.kind='constitution';
  showModal(record?`修改${c.name}笔记`:c.newLabel||'新建'+c.name+'笔记',`<form id="category-form" data-category="${key}" data-id="${record?.id||''}">${record?`<p class="small muted">${esc(record.title)} · ${esc(scopeTitle(record.scope))}</p>`:''}${categoryFieldInputs(key,record?.details||preset.details||{})}${record?'':`<label for="category-title">名称</label><input id="category-title" name="title" required maxlength="500" placeholder="${esc(c.titlePlaceholder||'')}" value="${esc(preset.title||'')}"><label for="category-text">原文或摘录</label><textarea id="category-text" name="text" rows="6" maxlength="200000">${esc(preset.text||'')}</textarea><div class="row wrap file-read"><label class="btn small">从文本文件读入<input type="file" accept=".txt,.md,.markdown,.html,.htm,.csv" data-read-into="category-text" hidden></label>${service.connected&&service.files.length?`<select data-library-into="category-text" aria-label="从材料库选择"><option value="">从材料库选择…</option>${service.files.filter(f=>f.text).map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select>`:''}<span class="small muted">PDF、Word 请在 PC&Mac 通用版的“新知导入”中上传，提取文字后再选。</span></div><label for="category-url">来源链接（选填）</label><input id="category-url" name="url" type="url" value="${esc(preset.url||'')}">${scopePicker('category',defaultScope,true)}`}<label for="category-question">解释问题（选填）</label><input id="category-question" name="question" maxlength="1000" value="${esc(record?.question||'')}"><label for="category-reason">${esc(c.reasonLabel||'我的理解')}</label><textarea id="category-reason" name="reason" required rows="6" maxlength="20000" placeholder="${esc(c.reasonTemplate||'')}">${esc(record?.text||'')}</textarea>${methodField('category-methods',record?.methods||(c.method?[c.method]:[]))}${record?'':`<label for="category-destination">保存方式</label><select id="category-destination" name="destination"><option value="note">关联并形成笔记</option><option value="material">只作为材料，暂不形成笔记</option></select>`}<div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn primary">保存</button></div></form>`);
}

// ---------- Search across everything the reader has ----------
const searchBeforeReadings=renderSearch;
renderSearch=function(){
  const q=ui.search.trim(),base=searchBeforeReadings();if(!q||resolveReference(q))return base;
  const low=q.toLowerCase(),hit=t=>String(t||'').toLowerCase().includes(low);
  const excerpt=t=>{const at=t.toLowerCase().indexOf(low),start=Math.max(0,at-50);return (start?'…':'')+esc(t.slice(start,start+200)).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),m=>`<mark>${m}</mark>`);};
  const enYear=DATA.english?.texts[state.year]?state.year:M.years.at(-1),english=DATA.english?M.units.filter(u=>(DATA.english.texts[enYear]?.[u.id]||[]).some(hit)).slice(0,60):[];
  const relations=state.materialRelations.filter(r=>hit(relationSearchText(r)));
  const points=(DATA.reviewHistory?.points||[]).filter(p=>hit(p.text));
  const extra=[english.length?`<h3 class="subheading">英文本（${enYear} 年）· ${english.length} 处</h3><div class="search-results">${english.map(u=>`<button class="result-card" data-action="read-year" data-unit="${u.id}" data-year="${enYear}"><h3>${esc(label(u,enYear))}</h3><p lang="en">${excerpt(DATA.english.texts[enYear][u.id].find(hit))}</p></button>`).join('')}</div>`:'',
    relations.length?`<h3 class="subheading">比较阅读、备案审查与材料关联 · ${relations.length} 则</h3><div class="relation-records">${relations.map(relationCard).join('')}</div>`:'',
    points.length?`<h3 class="subheading">备案审查报告与案例 · ${points.length} 段</h3>${points.map(p=>reviewPoint(p,true)).join('')}`:''].join('');
  return base+extra;
};

// ---------- Hooks into the reader and the outline ----------
const versionBodyBeforeReadings=versionBody;
versionBody=function(unit,year){return versionBodyBeforeReadings(unit,year)+(ui.english?englishBlock(unit,year):'')+reviewSources(unit);};

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try{
    switch(el.dataset.action){
      case 'toggle-english':ui.english=!ui.english;render();break;
      case 'category-new':showCategoryForm(el.dataset.category);break;
      case 'review-from-point':{
        const p=DATA.reviewHistory.points[Number(el.dataset.index)],d=reviewDoc(p.doc),year=M.years.at(-1);
        const scope=p.units.length?{kind:'articles',year,unitIds:p.units.filter(id=>ver(M.get(id),year).exists)}:p.chapters.length?{kind:'structure',year,nodeId:p.chapters[0],unitIds:[]}:{kind:'constitution',year,unitIds:[]};
        showCategoryForm(Object.keys(M.categories()).find(k=>M.categories()[k].official==='reviewHistory'),{preset:{title:d.title,text:p.text,url:d.url,scope}});break;
      }
    }
  }catch(error){toast(error.message);}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.matches('[data-read-into]')&&el.files?.[0]){
    const file=el.files[0];if(file.size>2*1024*1024){toast('文件超过 2 MB，请摘录相关部分。');return;}
    let text=await file.text();if(/\.html?$/i.test(file.name))text=new DOMParser().parseFromString(text,'text/html').body.innerText;
    const box=document.getElementById(el.dataset.readInto);box.value=text.slice(0,200000);
    const title=document.getElementById('category-title');if(title&&!title.value)title.value=file.name.replace(/\.[^.]+$/,'');
    toast(text.length>200000?'已读入前 200000 字。':'已读入文件文字。');
  }
  if(el.matches('[data-library-into]')&&el.value){
    const file=service.files.find(f=>f.id===el.value);if(!file)return;
    document.getElementById(el.dataset.libraryInto).value=file.text.slice(0,200000);
    const title=document.getElementById('category-title');if(title&&!title.value)title.value=file.name.replace(/\.[^.]+$/,'');
  }
});
document.addEventListener('input',event=>{
  if(!event.target.matches('[data-category-filter]'))return;
  const page=event.target.closest('.category-page'),q=event.target.value.trim().toLowerCase();let shown=0,total=0;
  for(const item of page.querySelectorAll('[data-filter-list] [data-search-text]')){total++;const show=!q||item.dataset.searchText.toLowerCase().includes(q);item.hidden=!show;shown+=show;}
  for(const group of page.querySelectorAll('.review-group'))group.hidden=!!q&&![...group.querySelectorAll('[data-search-text]')].some(x=>!x.hidden);
  const count=page.querySelector('[data-filter-count]');if(count)count.textContent=q?`${shown} / ${total}`:'';
});
document.addEventListener('submit',event=>{
  const form=event.target;if(form.id!=='category-form')return;event.preventDefault();
  try{
    const f=new FormData(form),key=form.dataset.category,details={};
    for(const [field,,options,multi] of M.categories()[key].fields)details[field]=multi?f.getAll('detail-'+field).join('、'):(f.get('detail-'+field)||'');
    if(form.dataset.id){M.editMaterialRelation(state,form.dataset.id,{text:f.get('reason'),question:f.get('question')||'',methods:f.get('methods')||'',details});}
    else M.addMaterialRelation(state,{name:f.get('title').trim(),url:f.get('url')||''},{scope:scopeFromForm(form),reason:f.get('reason'),text:f.get('text')||'',question:f.get('question')||'',methods:f.get('methods')||'',destination:f.get('destination')||'note',category:key,details});
    persist();closeModal();ui.view='terms';ui.relationTab=key;render();window.scrollTo({top:0});toast('已保存。');
  }catch(error){toast(error.message);}
});
render();

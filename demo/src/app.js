'use strict';
const DATA=JSON.parse(document.getElementById('content-data').textContent);
const M=createLearningModel(DATA);
const KEY=DATA.edition.storageKey,LEGACY_KEY=DATA.edition.legacyStorageKey;
// The code being read (names, citation, structure, special features) comes from its data pack, codes/<name>/codex.json.
const CODEX=DATA.codex;
// The first and the latest text of the code (for the constitution, 1982 and 2018).
const FIRST=M.years[0],LATEST=M.years.at(-1);
const root=document.getElementById('app'),modal=document.getElementById('modal');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const now=M.timestamp,uid=M.id;
const date=value=>new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
let storageAvailable=true,storageIssue='',unreadableBackup=null,initialSaved=null;
let state=M.fresh();
try{initialSaved=localStorage.getItem(KEY)||(LEGACY_KEY?localStorage.getItem(LEGACY_KEY):null);if(initialSaved)state=M.migrate(JSON.parse(initialSaved));}
catch(e){storageAvailable=false;unreadableBackup=initialSaved;storageIssue='本机记录未能读取，已保留原数据。请先导出原始记录。';}
const ui={view:'outline',rail:'mine',history:false,changes:false,words:false,selection:[],flash:[],search:'',tocChapter:null,course:0,slide:1,readMode:'sequence',readerDeck:[],feedPool:'all',feedMode:'sequence',feedId:null,feedHistory:[],feedIndex:-1,feedDeck:[],recall:false,revealed:true,seen:0,linkDraft:null,termSearch:'',termId:null};
let toastTimer,modalReturnFocus;

function icon(name) {
  const paths = {
    book:'<path d="M3 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3z"/><path d="M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2"/>',
    shuffle:'<path d="m17 3 4 4-4 4M17 13l4 4-4 4M3 7h3c5 0 6 10 11 10h4M3 17h3c2 0 3-2 4-4M14 9c1-2 2-2 4-2h3"/>',
    note:'<path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6"/>',
    course:'<path d="M3 4h18v13H3zM8 21l4-4 4 4M7 8h10M7 12h6"/>',
    inbox:'<path d="m5 4-3 10v6h20v-6L19 4zM2 14h6l2 3h4l2-3h6"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bookmark:'<path d="M6 3h12v19l-6-4-6 4z"/>',
    share:'<path d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9"/>',
    left:'<path d="m14 5-7 7 7 7"/>',right:'<path d="m10 5 7 7-7 7"/>',
    list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    link:'<path d="m9 15 6-6M8 17l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 7l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0" transform="translate(0 -1) scale(.95)"/>',
    leaf:'<path d="M20 3C4 1 1 11 7 17s16 3 13-14zM4 21 16 8"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    copy:'<path d="M9 9h11v11H9z"/><path d="M5 15H4V4h11v1"/>',
    more:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    cards:'<path d="M4 7h13v13H4z"/><path d="M8 3h12v13"/>',
    spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.book}</svg>`;
}
function toast(message) {
  const el = document.getElementById('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3300);
}
function persist(){
  if(unreadableBackup!==null){storageAvailable=false;toast(storageIssue);return;}
  try{localStorage.setItem(KEY,JSON.stringify(state));storageAvailable=true;}
  catch{storageAvailable=false;storageIssue='保存失败，请先导出完整备份。';toast(storageIssue);}
  const el=document.querySelector('.save-state');if(el)el.innerHTML=`<span class="dot"></span>${saveStateText()}`;
}
function current(){return M.get(state.current);}
function ver(unit=current(),year=state.year){return unit.versions[year];}
function chapter(unit,year=state.year){return M.path(unit.id,year)[0]||{id:'',title:'',unitIds:[]};}
// In packs of several laws an article number alone is ambiguous, so lists add the law's short name.
function unitName(unit,year=state.year){return (M.lawOf(unit.id)?.short||'')+(unit.versions[year]?.label||unit.label);}
function label(unit,year=state.year){return unitName(unit,year)+(M.subtitle(state,unit.id)?' · '+M.subtitle(state,unit.id):'');}
function paraList(xs,className=''){return `<div class="${className}">${xs.map(t=>`<p>${esc(t)}</p>`).join('')}</div>`;}
function isBookmarked(id){return state.bookmarks.includes(id);}
function draftKey(){return `${state.current}@${state.year}`;}
function titleOf(view){return ({reader:'法条精读',practice:'记忆卡片',notes:'我的笔记',terms:'关联阅读',outline:'体系阅读',discussions:'共享讨论',updates:'新知导入',guide:'使用说明',settings:'导出同步',ai:'智能辅助',search:'搜索'})[view];}
function unitOptions(selected=state.current,year=state.year){return M.units.filter(u=>ver(u,year).exists).map(u=>`<option value="${u.id}" ${u.id===selected?'selected':''}>${esc(label(u,year))}${u.kind==='article'&&u.versions[year]?.label!==u.label?`（${LATEST} 年${esc(u.label)}）`:''}</option>`).join('');}
function yearLabel(y){return CODEX.yearLabels?.[y]||(M.years.length===1?`${y} 年文本`:`${y} 年${y===FIRST?'原文':'修正后'}`);}
function yearOptions(selected=state.year){return M.years.map(y=>`<option value="${y}" ${y===selected?'selected':''}>${esc(yearLabel(y))}</option>`).join('');}
const CN_DIGITS='零一二三四五六七八九';
function cnNumber(n){
  if(n<10)return CN_DIGITS[n];
  if(n<100)return (n<20?'':CN_DIGITS[Math.floor(n/10)])+'十'+(n%10?CN_DIGITS[n%10]:'');
  if(n<1000){const rest=n%100;return CN_DIGITS[Math.floor(n/100)]+'百'+(!rest?'':rest<10?'零'+CN_DIGITS[rest]:rest<20?'一'+cnNumber(rest):cnNumber(rest));}
  // Thousands, for large codes: 一千零一十、一千二百六十.
  const rest=n%1000;return CN_DIGITS[Math.floor(n/1000)]+'千'+(!rest?'':rest<100?'零'+(rest<10?CN_DIGITS[rest]:rest<20?'一'+cnNumber(rest):cnNumber(rest)):cnNumber(rest));
}
function cnValue(text){
  if(/^\d+$/.test(text))return Number(text);
  const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let total=0,digit=0;
  for(const ch of text){if(ch in digits)digit=digits[ch];else if(ch==='十'){total+=(digit||1)*10;digit=0;}else if(ch==='百'){total+=digit*100;digit=0;}else if(ch==='千'){total+=digit*1000;digit=0;}else return NaN;}
  return total+digit;
}
// Accepts “33”“第三十三条”“第三十七条第二款”“序言7”“序言第七自然段”. Article numbers follow the selected year.
function resolveReference(q,year=state.year){
  // A law's name in front (个人信息保护法第十条) limits the search to that law; otherwise numbers are read
  // in the law of the article being read.
  const pattern=names=>new RegExp('^《?(?:'+names.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|')+')》?');
  q=q.replace(/\s/g,'');let law=M.lawOf(state.current),named=false;
  for(const l of M.laws){const names=[l.name,l.short,...(l.aliases||[])].filter(Boolean);if(pattern(names).test(q)){law=l;named=true;q=q.replace(pattern(names),'');break;}}
  q=q.replace(pattern(CODEX.citation.aliases),'');
  const n='[\\d零一二三四五六七八九十百千两]+';
  const p=q.match(new RegExp(`^序言(?:第)?(${n})(?:自然段|段)?$`));
  if(p){const k=cnValue(p[1]);return M.get(`p${k}`)?`p${k}`:null;}
  const a=q.match(/^(?:第)?(\d{1,4})(?:条)?$/)||q.match(new RegExp(`^第(${n})条?(?:第${n}[款项])*$|^(${n})条(?:第${n}[款项])*$`));
  if(!a)return null;
  // Numbers are read in the chosen year: articles may have been renumbered by later amendments.
  const number=cnValue(a[1]||a[2]),wanted=`第${cnNumber(number)}条`;if(!number)return null;
  const found=M.units.filter(u=>u.kind==='article'&&u.versions[year]?.exists&&u.versions[year].label===wanted);
  // A law named in the query that has no such article in this year gives no result, not another law's article.
  return (found.find(u=>M.lawOf(u.id)===law)||(named?null:found[0]))?.id||null;
}
// 款 are the paragraphs of an article; enumerated paragraphs are 项 of the preceding 款.
const ITEM_MARK=/^（([一二三四五六七八九十百]+)）/;
function clauseLabels(unit,year=state.year){
  const v=ver(unit,year);if(!v?.exists||unit.kind!=='article')return [];
  const count=v.paragraphs.filter(p=>!ITEM_MARK.test(p)).length;let clause=0;
  return v.paragraphs.map(p=>{const item=p.match(ITEM_MARK);if(!item)clause++;const k=count>1&&clause?`第${cnNumber(clause)}款`:'';return {gutter:item?'':k,cite:k+(item?`第${item[1]}项`:'')};});
}
// The citation names the text in force: the latest text plainly, an older one by the year it was adopted
// or last amended. For a pack of several laws this is the year of that law's own last change.
// citation.byYear can name a year's text exactly.
const changeYears=new Map();
function lawChangeYears(law){
  const key=law?.nodeId||'';if(changeYears.has(key))return changeYears.get(key);
  const units=M.units.filter(u=>M.lawOf(u.id)===law),changed=M.years.filter((y,i)=>units.some(u=>{const v=u.versions[y],p=u.versions[M.years[i-1]];return v?.exists&&(!i||!p?.exists||(v.diff||[]).some(op=>op.type==='insert'||op.type==='delete'));}));
  changeYears.set(key,changed);return changed;
}
function citeTitle(year,unit=null){
  const law=unit?M.lawOf(unit.id):null,c=law?.citation||CODEX.citation;
  if(c.byYear?.[year])return c.byYear[year].replace('{year}',year);
  if(year===LATEST)return c.latest;
  const changed=lawChangeYears(law),last=changed.filter(y=>y<=year).at(-1)??year;
  return (last===changed[0]?c.original:c.amended).replace('{year}',last);
}
function citePlace(unit,year,block=null){const v=ver(unit,year);if(block===null||unit.kind!=='article')return v.label;return v.label+(clauseLabels(unit,year)[block]?.cite||'');}
function pageHead(title,description='',actions=''){return `<div class="page-heading"><div><h2>${title}</h2>${description?`<p>${description}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;}
function clearSelection(){ui.selection=[];window.getSelection?.()?.removeAllRanges();updateSelectionTools();}
function readUnit(id,year=state.year,rail,anchors=[]){
  if(!M.get(id)||!M.years.includes(year))return;
  state.current=id;state.year=year;ui.view='reader';ui.history=false;ui.selection=[];ui.flash=anchors;ui.words=false;
  if(rail)ui.rail=rail;persist();render();window.scrollTo({top:0,behavior:'instant'});
  if(anchors[0]?.block!==null&&anchors.length)document.querySelector(`[data-law-block="${anchors[0].block}"]`)?.scrollIntoView({block:'nearest'});
}
const NAV_GROUPS=[['研读',[['outline','layers'],['reader','book'],['terms','link'],['notes','note']]],['工具',[['ai','spark'],['settings','download'],['discussions','people']]]];
function navActive(view){return ui.view===view||view==='reader'&&ui.view==='practice'||view==='terms'&&ui.view==='updates';}
function navButton([view,name]){const on=navActive(view);return `<button data-action="nav" data-view="${view}" class="${on?'active':''}" ${on?'aria-current="page"':''}>${icon(name)}<span>${titleOf(view)}</span></button>`;}
function brandmark(){return DATA.icon?`<img class="brandmark icon" src="${DATA.icon}" alt="" aria-hidden="true">`:'<span class="brandmark" aria-hidden="true">法</span>';}
function saveStateText(){return storageAvailable?'已保存在此浏览器':'保存失败 · 请导出备份';}
function render(){
  const scrollPositions=[...document.querySelectorAll('[data-scroll-key]')].map(el=>[el.dataset.scrollKey,el.scrollTop]);
  const noteCount=state.notes.length+state.materialRelations.filter(r=>r.scope.kind!=='articles'&&r.destination==='note').length,linkCount=state.links.length+state.groupLinks.length+state.materialRelations.length;
  root.innerHTML=`<aside class="sidebar"><div class="brand">${brandmark()}<div><h1>法典笔记</h1><span>${esc(CODEX.name)}</span></div></div><nav class="nav" aria-label="主导航">${NAV_GROUPS.map(([group,items])=>`<div class="nav-group"><span class="nav-label">${group}</span>${items.map(navButton).join('')}</div>`).join('')}</nav><div class="side-bottom"><dl class="personal-summary"><div><dt>笔记</dt><dd>${noteCount}</dd></div><div><dt>关联</dt><dd>${linkCount}</dd></div><div><dt>部分</dt><dd>${state.groups.length}</dd></div></dl><div class="nav">${navButton(['guide','help'])}</div><div class="save-state" role="status"><span class="dot"></span>${saveStateText()}</div></div></aside><div class="workspace"><header class="topbar"><span class="mobile-brand">${brandmark()}法典笔记</span><form class="search" id="search-form" role="search">${icon('search')}<input id="global-search" type="search" aria-label="搜索条文、序言、词句或笔记" placeholder="条号、词句或笔记，如 第三十七条" value="${esc(ui.search)}"><button type="submit">搜索</button></form><button class="icon-btn" data-action="data" title="导出与备份" aria-label="导出与备份">${icon('download')}</button></header><main id="main" class="page view-${ui.view}">${({reader:renderReader,practice:renderPractice,notes:renderNotes,terms:renderTerms,outline:renderOutline,discussions:renderDiscussions,updates:renderUpdates,search:renderSearch,guide:renderGuide,settings:renderSettings,ai:renderAI}[ui.view])()}</main></div><nav class="mobile-nav" aria-label="主导航">${NAV_GROUPS[0][1].map(navButton).join('')}<button data-action="more-nav" class="${['ai','settings','discussions','guide'].includes(ui.view)?'active':''}">${icon('more')}<span>更多</span></button></nav>`;
  for(const [key,top] of scrollPositions){const el=[...document.querySelectorAll('[data-scroll-key]')].find(el=>el.dataset.scrollKey===key);if(el)el.scrollTop=top;}
  updateSelectionTools();
}
function showMoreNav(){showModal('更多',`<nav class="more-nav" aria-label="更多功能">${[...NAV_GROUPS[1][1],['guide','help']].map(navButton).join('')}</nav>`);}
function relevantAnchors(unitId,year){
  return [...state.notes.flatMap(n=>n.anchors),...state.terms.flatMap(t=>t.anchors),...state.links.flatMap(l=>[...l.from,...l.to]),...ui.flash].filter(a=>a.unitId===unitId&&a.year===year&&a.block!==null);
}
function anchorMatches(list,unitId,year,block,start,end){return list.some(a=>a.unitId===unitId&&a.year===year&&a.block===block&&a.start<end&&a.end>start);}
function paragraphMarks(){return [];}
function lawParagraph(text,unitId,year,block,scope='reader',clause=''){
  const active=scope==='link'?ui.linkDraft?.to||[]:ui.selection;
  const known=relevantAnchors(unitId,year);
  let html='';
  if(ui.words&&scope==='reader'||scope==='link'){
    html=M.tokenize(text).map(t=>t.word?`<button class="word ${anchorMatches(active,unitId,year,block,t.start,t.end)?'selected':''} ${anchorMatches(known,unitId,year,block,t.start,t.end)?'has-annotation':''}" data-action="${scope==='link'?'link-word':'word'}" data-unit="${unitId}" data-year="${year}" data-block="${block}" data-start="${t.start}" data-end="${t.end}" aria-pressed="${anchorMatches(active,unitId,year,block,t.start,t.end)}">${esc(t.text)}</button>`:esc(t.text)).join('');
  }else{
    // paragraphMarks lets later files underline phrases (e.g. words leaving a matter to law) as buttons.
    const marks=known.filter(a=>a.block===block),extra=scope==='reader'?paragraphMarks(text,unitId,year,block):[];
    const cuts=[...new Set([0,text.length,...marks.flatMap(a=>[a.start,a.end]),...extra.flatMap(m=>[m.start,m.end])])].sort((a,b)=>a-b);
    html=cuts.slice(0,-1).map((start,i)=>{
      const end=cuts[i+1],mark=extra.find(m=>m.start<=start&&end<=m.end),fragment=mark?`<span class="${mark.className}" role="button" tabindex="0" title="${esc(mark.title||'')}" data-action="${mark.action}" data-unit="${unitId}" data-year="${year}" data-block="${block}" data-start="${mark.start}" data-end="${mark.end}">${esc(text.slice(start,end))}</span>`:esc(text.slice(start,end));
      return anchorMatches(known,unitId,year,block,start,end)?`<span class="annotated ${anchorMatches(ui.flash,unitId,year,block,start,end)?'flash':''}" tabindex="0" role="button" aria-label="查看 ${esc(text.slice(start,end))} 的词语注记" data-action="anchor" data-unit="${unitId}" data-year="${year}" data-block="${block}" data-start="${start}" data-end="${end}">${fragment}</span>`:fragment;
    }).join('');
  }
  return `<p data-law-block="${block}" data-unit="${unitId}" data-year="${year}" ${scope==='reader'?'class="selectable-law"':''} ${clause?`data-clause="${clause}"`:''}>${html}</p>`;
}
function diffText(v){
  if(!v.diff?.length)return paraList(v.paragraphs);
  return v.diff.map(op=>op.type==='delete'?`<del title="删除文字">${op.text==='\n'?'<span class="para-join" title="修正后与下段合并">¶</span>':esc(op.text)}</del>`:op.type==='insert'?`<ins title="新增文字">${esc(op.text)}</ins>`:esc(op.text)).join('').replace(/\n/g,'<br>');
}
function anchorSummary(anchors){return anchors.map(a=>a.quote?`“${a.quote}”`:`${label(M.get(a.unitId),a.year)}全文`).join('、');}
function anchorButton(anchors,text){const a=anchors[0];return `<button class="text-btn" data-action="jump-anchors" data-anchors="${esc(JSON.stringify(anchors))}">${esc(text||`${label(M.get(a.unitId),a.year)} · ${a.year} · ${anchorSummary(anchors)}`)} ↗</button>`;}
function noteHtml(text){
  return esc(text).replace(/\[\[([^\]\n]+)\]\]/g,(match,name)=>{const t=state.terms.find(t=>esc(t.name)===name);return t?`<button class="wikilink" data-action="term-open" data-id="${t.id}">[[${name}]]</button>`:match;});
}
// Optional outline for notes on fundamental rights (Chapter II, Articles 33-51). It follows the
// scope-limitation-justification analysis of German fundamental-rights doctrine, which some Chinese
// scholars adopt; it is offered as a template, not as a preset method tag.
const RIGHTS_TEMPLATE='保护范围：本条保护谁的什么行为、状态或利益？\n限制：哪些法律、公权力行为或其他措施对它构成限制？\n限制的正当性：限制有没有法律依据？目的是否正当？手段是否必要、适度？';
// The 基本权利 template is offered for the article range the data pack names (features.rightsTemplate).
function rightsTemplateOffer(a){const range=CODEX.features?.rightsTemplate,at=M.units.indexOf(a);return range&&at>=M.units.findIndex(u=>u.id===range.from)&&at<=M.units.findIndex(u=>u.id===range.to)?`<div class="template-offer"><button type="button" class="text-btn" data-action="rights-template">插入基本权利分析模板</button><span title="按“保护范围—限制—限制的正当性”分析，源自德国基本权利教义学，国内有学者采用。可以不用，也可以改写。">可选 · 保护范围、限制、限制的正当性</span></div>`:'';}
function renderRail(a){
  if(ui.rail==='mine'){
    const d=state.drafts[draftKey()]||{};
    return `<div class="note-editor"><h3 class="editor-title">${d.editId?'修改笔记':'写笔记'}<small>${state.year} 年文本</small></h3>${(d.anchors||[]).length?`<div class="hint-panel">定位：${esc(anchorSummary(d.anchors))}<br><button class="text-btn" data-action="clear-note-anchors">改为整${a.kind==='preamble'?'个自然段':'条'}笔记</button></div>`:''}${d.quote?`<blockquote class="draft-quote">${esc(d.quote)}</blockquote>`:''}${noteEditorFields(d,a)}<label for="note-input">理解与判断</label>${rightsTemplateOffer(a)}<textarea id="note-input" rows="6" placeholder="写下理由、疑问或待核的线索。输入 [[人民]] 可引用“人民”词条。" ${!ver(a).exists?'disabled':''}>${esc(d.text||'')}</textarea><div class="row between"><span class="small muted" id="draft-status">${d.text?'草稿已保存':'仅自己可见'}</span><div class="row">${d.editId?'<button class="text-btn" data-action="cancel-edit">取消</button>':''}<button class="btn primary small" data-action="save-note" ${!ver(a).exists?'disabled':''}>保存笔记</button></div></div></div>`;
  }
  if(ui.rail==='links'){
    const terms=state.terms.filter(t=>t.anchors.some(x=>x.unitId===a.id)),links=M.backlinks(state,a.id);
    return `<div class="rail-head"><span>${terms.length} 个词条 · ${links.length} 项关联</span><button class="btn small" data-action="new-link">${icon('plus')}建立关联</button></div>${terms.length?`<div class="term-chips">${terms.map(t=>`<button data-action="term-open" data-id="${t.id}">[[${esc(t.name)}]]</button>`).join('')}</div>`:''}${links.map(l=>{const fromHere=l.from.some(x=>x.unitId===a.id),near=fromHere?l.from:l.to,far=fromHere?l.to:l.from;return `<div class="material-card link-card"><p class="anchor-caption">${esc(anchorSummary(near))}</p>${anchorButton(far)}${l.reason?`<p>${esc(l.reason)}</p>`:''}<button class="text-btn danger" data-action="delete-link" data-id="${l.id}">移除关联</button></div>`;}).join('')}${!terms.length&&!links.length?'<div class="empty">选中字句后，可以建立词条，或与其他条文、序言自然段建立关联，并写明理由。</div>':''}<p class="rail-hint">关联在两端都能看到。</p>`;
  }
  return renderMaterials(a);
}
function updateSelectionTools(){
  const bar=document.getElementById('selection-tools');if(!bar)return;
  bar.hidden=!ui.selection.length||ui.view!=='reader'||modal.open;
  if(bar.hidden)return;
  const joined=M.mergeAnchors(ui.selection);
  bar.innerHTML=`<span class="selected-label">${esc(anchorSummary(joined))}</span><div class="row"><button class="btn small primary" data-action="selection-note">记笔记</button><button class="btn small" data-action="selection-term">建词条</button><button class="btn small" data-action="new-link">建立关联</button><button class="btn small" data-action="cite">引用</button><button class="btn small" data-action="selection-group">划入部分</button><button class="icon-btn" data-action="selection-clear" aria-label="取消选择">${icon('close')}</button></div>`;
}
function randomNext(pool,last,deckName){
  ui[deckName]=ui[deckName].filter(id=>pool.includes(id));
  if(!ui[deckName].length){ui[deckName]=[...pool];for(let i=ui[deckName].length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ui[deckName][i],ui[deckName][j]]=[ui[deckName][j],ui[deckName][i]];}if(ui[deckName].length>1&&ui[deckName].at(-1)===last)[ui[deckName][0],ui[deckName][ui[deckName].length-1]]=[ui[deckName].at(-1),ui[deckName][0]];}
  return ui[deckName].pop();
}
function readerStep(delta){
  const pool=M.sequence(state.year);let id;
  if(ui.readMode==='random')id=randomNext(pool,state.current,'readerDeck');else id=pool[pool.indexOf(state.current)+delta];
  if(!id)return;
  const history=ui.history;readUnit(id);
  if(history){ui.history=true;render();}
}
function resetFeed(){const pool=feedPool();ui.feedHistory=[];ui.feedIndex=-1;ui.feedDeck=[];ui.feedId=ui.feedMode==='sequence'?(pool.includes(state.current)?state.current:pool[0]):randomNext(pool,null,'feedDeck');if(ui.feedId){ui.feedHistory.push(ui.feedId);ui.feedIndex=0;ui.seen++;}ui.revealed=!ui.recall;}
function feedStep(delta=1){
  const pool=feedPool();if(!pool.length){ui.feedId=null;render();return;}
  if(delta<0){if(ui.feedIndex>0)ui.feedId=ui.feedHistory[--ui.feedIndex];else if(ui.feedMode==='sequence'){ui.feedId=pool[(pool.indexOf(ui.feedId)-1+pool.length)%pool.length];ui.feedHistory.unshift(ui.feedId);}else return;}
  else if(ui.feedIndex<ui.feedHistory.length-1)ui.feedId=ui.feedHistory[++ui.feedIndex];
  else{ui.feedId=ui.feedMode==='random'?randomNext(pool,ui.feedId,'feedDeck'):pool[(pool.indexOf(ui.feedId)+1)%pool.length];ui.feedHistory.push(ui.feedId);ui.feedIndex++;ui.seen++;}
  ui.revealed=!ui.recall;render();
}
const NOTE_SORTS=[['updated','最近修改'],['article','法条顺序'],['created-desc','建立时间 · 新的在前'],['created-asc','建立时间 · 早的在前']];
function sortedNotes(sort){
  const order=new Map(M.units.map((u,i)=>[u.id,i])),created=n=>n.createdAt||n.updatedAt;
  const list=[...state.notes];
  if(sort==='article')return list.sort((a,b)=>(order.get(a.unitId)??-1)-(order.get(b.unitId)??-1)||(a.anchors[0]?.block??-1)-(b.anchors[0]?.block??-1)||(a.anchors[0]?.start??-1)-(b.anchors[0]?.start??-1)||created(a).localeCompare(created(b)));
  if(sort==='created-desc')return list.sort((a,b)=>created(b).localeCompare(created(a)));
  if(sort==='created-asc')return list.sort((a,b)=>created(a).localeCompare(created(b)));
  return list.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
function noteDates(n,sort){
  const created=n.createdAt||n.updatedAt,same=date(created)===date(n.updatedAt);
  return sort.startsWith('created')?`<time title="修改于 ${date(n.updatedAt)}">建立 ${date(created)}</time>`:`<time ${same?'':`title="建立于 ${date(created)}"`}>${sort==='updated'&&!same?'修改 ':''}${date(n.updatedAt)}</time>`;
}
function renderNotes(){
  const tab=['notes','pending','methods'].includes(ui.notesTab)?ui.notesTab:'notes',sort=NOTE_SORTS.some(([k])=>k===state.preferences.noteSort)?state.preferences.noteSort:'updated';
  const notes=sortedNotes(sort),pending=pendingItems();
  const tabs=`<div class="segmented notes-tabs" role="tablist" aria-label="我的笔记">${[['notes',`笔记 ${notes.length}`],['pending',`待核清单 ${pending.length}`],['methods','方法回顾']].map(([key,text])=>`<button role="tab" data-action="notes-tab" data-tab="${key}" class="${tab===key?'active':''}" aria-selected="${tab===key}">${text}</button>`).join('')}</div>`;
  const head=pageHead('我的笔记',`${notes.length+state.materialRelations.filter(r=>r.scope.kind!=='articles'&&r.destination==='note').length} 则。每则笔记保留写下时所据的文本年份和原文位置。`,`<button class="btn" data-action="export-md">${icon('download')}导出笔记</button>`);
  if(tab==='pending')return `${head}${tabs}${renderPending(pending)}`;
  if(tab==='methods')return `${head}${tabs}${renderMethodReview()}`;
  let lastUnit=null;
  const card=n=>{const heading=sort==='article'&&n.unitId!==lastUnit?`<h3 class="notes-unit-heading">${esc(label(M.get(n.unitId),n.year))}</h3>`:'';lastUnit=n.unitId;return `${heading}<article class="saved-note ${noteKind(n)[0]}"><div class="annotation-meta"><span>${noteKind(n)[1]} · ${n.year} 年文本</span>${noteDates(n,sort)}</div><h3><button class="text-btn note-place" data-action="goto-note" data-id="${n.id}">${esc(label(M.get(n.unitId),n.year))}</button></h3>${n.anchors.length?`<blockquote>${esc(anchorSummary(n.anchors))}</blockquote>`:''}${n.quote?`<blockquote>${esc(n.quote)}</blockquote>`:''}${noteDetails(n)}<p>${noteHtml(n.text)}</p></article>`;};
  return `${head}${tabs}<div class="notes-toolbar"><label>排序<select id="note-sort">${NOTE_SORTS.map(([k,t])=>`<option value="${k}" ${k===sort?'selected':''}>${t}</option>`).join('')}</select></label></div>${notes.length?`<div class="notes-grid ${sort==='article'?'by-article':''}">${notes.map(card).join('')}</div>`:'<div class="big-empty"><h3>还没有笔记</h3><p>可以为一条、一个自然段写笔记，也可以只选其中几个词。</p><button class="btn primary" data-action="nav" data-view="reader">开始研读</button></div>'}`;
}
// Everything still awaiting verification, gathered in one place for periodic review.
function pendingItems(){
  const items=[],marked=n=>/待核/.test((n.question||'')+n.text);
  for(const n of state.notes){
    const reasons=[];
    if(n.ai&&n.ai.verification!=='reviewed')reasons.push('智能辅助建议，尚未核对来源');
    if(marked(n))reasons.push('笔记中标有“待核”');
    if(reasons.length)items.push({group:'notes',title:label(M.get(n.unitId),n.year),text:n.question||n.text,reason:reasons.join('；'),action:`data-action="goto-note" data-id="${n.id}"`,time:n.updatedAt});
    else if(n.imported)items.push({group:'imported',title:label(M.get(n.unitId),n.year),text:n.text,reason:'讲义原话，其中的事实、数据和引文待核',action:`data-action="goto-note" data-id="${n.id}"`,time:n.updatedAt});
  }
  for(const m of state.materials)if(m.verification!=='已核对原文')items.push({group:'materials',title:m.title,text:m.reason||m.question||'',reason:`材料 · ${label(M.get(m.unitId),m.year)}`,action:`data-action="goto-materials" data-unit="${m.unitId}" data-year="${m.year}"`,time:m.updatedAt||m.createdAt});
  for(const r of state.materialRelations)if(r.ai&&r.ai.verification!=='reviewed')items.push({group:'materials',title:r.question||r.title||'材料关联',text:r.text||'',reason:'智能辅助关联，尚未核对',action:'data-action="relation-tab" data-tab="records"',time:r.updatedAt});
  for(const u of state.updates)if(u.status==='pending')items.push({group:'candidates',title:u.title,text:u.summary||u.excerpt||'',reason:'检索摘记，尚未处理',action:'data-action="open-material-tab" data-tab="manual"',time:u.createdAt||''});
  for(const p of service.proposals||[])if(p.status==='pending')items.push({group:'candidates',title:p.question||'助手建议',text:p.text||'',reason:'助手建议，等待审阅',action:'data-action="relation-candidates"',time:p.createdAt||''});
  return items;
}
function renderPending(items){
  const groups=[['notes','笔记'],['materials','材料与关联'],['candidates','建议与摘记'],['imported','讲义笔记']];
  const row=x=>`<li><button class="pending-item" ${x.action}><strong>${esc(x.title)}</strong><span>${esc(String(x.text).slice(0,90))}</span><small>${esc(x.reason)}${x.time?` · ${date(x.time)}`:''}</small></button></li>`;
  const body=groups.map(([key,name])=>{const list=items.filter(x=>x.group===key);if(!list.length)return '';const inner=`<ul class="pending-list">${list.map(row).join('')}</ul>`;return key==='imported'?`<details class="pending-group"><summary><h3>${name}</h3><span class="pill">${list.length}</span><span class="small muted">导入时整体标为待核，可逐条核对后修改</span></summary>${inner}</details>`:`<section class="pending-group"><div class="row"><h3>${name}</h3><span class="pill">${list.length}</span></div>${inner}</section>`;}).join('');
  return `<p class="page-note">在笔记中写上“待核”二字，这则笔记就会列在这里；核对后删去这两个字即可。智能辅助的建议、未核对原文的材料和尚未处理的摘记也一并列出。</p>${body||'<div class="big-empty"><h3>没有待核的内容</h3><p>写笔记时，一时无法核实的事实、数据或引文，可以注明“待核”，以后在这里集中回查。</p></div>'}`;
}
// A look back at how one's notes use the four methods of interpretation; it describes, it does not score.
function renderMethodReview(){
  const notes=state.notes.filter(n=>!n.example),counts=Object.fromEntries(M.methods.map(m=>[m,0])),other=new Map();let untagged=0;
  for(const n of notes){
    const labels=M.methodLabels(n.methods).map(m=>m==='原意解释'?'历史解释':m);
    if(!labels.length)untagged++;
    for(const m of new Set(labels)){if(m in counts)counts[m]++;else other.set(m,(other.get(m)||0)+1);}
  }
  const max=Math.max(1,...Object.values(counts)),tagged=notes.length-untagged;
  const least=tagged?M.methods.filter(m=>counts[m]===Math.min(...M.methods.map(x=>counts[x]))):[];
  const prompts={'文义解释':'挑一个反复出现的词，比较它在不同条文中的意思是否相同。','体系解释':'把一条放回它所在的章、节，看看前后条文怎样分工。','历史解释':'打开“修正对照”，问一问这次修正要解决什么问题。','目的解释':'问一问这一条要保护什么、防止什么，再回头检验字面意思。'};
  return `<p class="page-note">按笔记上的解释标签统计，原意解释计入历史解释。一则笔记可以有几个标签，也可以没有标签。这里只描述你的笔记，不作评价。</p><div class="method-review">${M.methods.map(m=>`<div class="method-bar"><span>${m}</span><div><i style="width:${counts[m]/max*100}%"></i></div><strong>${counts[m]}</strong></div>`).join('')}${[...other].map(([m,c])=>`<div class="method-bar other"><span>${esc(m)}</span><div><i style="width:${Math.min(100,c/max*100)}%"></i></div><strong>${c}</strong></div>`).join('')}</div><p class="small muted">共 ${notes.length} 则笔记${state.notes.length>notes.length?`（不计 ${state.notes.length-notes.length} 则示例笔记）`:''}，${tagged} 则有解释标签，${untagged} 则没有。${untagged&&state.notes.some(n=>n.imported&&!n.methods?.length)?'讲义笔记导入时没有标签，修改笔记时可以补上。':''}</p>${least.length&&least.length<M.methods.length?`<section class="method-hint"><h3>用得较少：${least.join('、')}</h3>${least.map(m=>`<p>${prompts[m]}</p>`).join('')}</section>`:''}`;
}
function renderTerms(){
  return `<div class="section-heading"><div><h3>词条与关联</h3><p>${state.terms.length} 个词条 · ${state.links.length} 项关联</p></div><button class="btn small" data-action="term-new">${icon('plus')}新建词条</button></div>${state.terms.length?`<div class="notes-grid">${state.terms.map(t=>{const refs=M.termReferences(state,t.id);return `<article class="saved-note"><h3><button class="text-btn term-title" data-action="term-open" data-id="${t.id}">[[${esc(t.name)}]]</button></h3><p>${esc(t.text||'还没有填写词条笔记。')}</p><span class="small muted">${refs.anchors.length} 处原文 · ${refs.notes.length} 则笔记引用</span></article>`;}).join('')}</div>`:'<div class="big-empty"><h3>从“人民”“公民”这样的词开始</h3><p>在正文选词后建立词条，或在笔记中写 [[词条名]]。同一用语在不同条文中的含义是否相同，正是体系解释要回答的问题。</p></div>'}${state.links.length?`<h3 class="subheading">条文之间的关联</h3><div class="notes-grid">${state.links.map(l=>`<article class="saved-note">${anchorButton(l.from)}<div class="link-arrow" aria-hidden="true">↕</div>${anchorButton(l.to)}${l.reason?`<p>${esc(l.reason)}</p>`:''}<button class="text-btn danger" data-action="delete-link" data-id="${l.id}">移除关联</button></article>`).join('')}</div>`:''}`;
}

function renderUpdates(){
  const pending=state.updates.filter(u=>u.status==='pending');
  return `${pageHead('待处理材料','先阅读和判断，再收入自己的笔记。',`<button class="btn primary" data-action="add-update">${icon('plus')}收录材料</button>`)}<div class="update-layout"><section>${pending.length?pending.map(u=>`<article class="update-card"><span class="pill warm">${esc(u.type)} · 待判断</span><h3>${esc(u.title)}</h3>${u.url?`<a href="${esc(safeUrl(u.url))}" target="_blank" rel="noopener noreferrer">打开来源 ↗</a>`:''}<p>${esc(u.text)}</p><div class="row"><button class="btn primary small" data-action="accept-update" data-id="${u.id}">关联到条文或序言</button><button class="text-btn" data-action="ignore-update" data-id="${u.id}">忽略</button></div></article>`).join(''):'<div class="big-empty"><h3>给新材料留一个入口</h3><p>这里使用手动收录，也可上传文件，或到“智能辅助”配置分析与联网检索。</p><button class="btn" data-action="add-update">添加材料</button></div>'}${state.updates.some(u=>u.status!=='pending')?`<details class="source-note"><summary>已处理的材料</summary>${state.updates.filter(u=>u.status!=='pending').map(u=>`<div>${esc(u.title)} · ${u.status==='accepted'?'已关联':'已忽略'} <button class="text-btn" data-action="restore-update" data-id="${u.id}">放回待判断</button></div>`).join('')}</details>`:''}</section><aside class="update-intro"><h3>先判断，再收入</h3><p>材料先放在这里。选定条文或序言自然段、写明关联理由后再收入。</p><p class="muted">软件不会自动修改条文、笔记或关联。</p></aside></div>`;
}
function renderSearch(){
  const q=ui.search.trim(),ref=resolveReference(q);
  const results=q?M.units.filter(u=>ref?u.id===ref&&ver(u).exists:[u.label,...ver(u).paragraphs,...state.notes.filter(n=>n.unitId===u.id).map(n=>n.text)].some(t=>t.toLowerCase().includes(q.toLowerCase()))):[];
  const mark=(text,at)=>{const start=Math.max(0,at-40),piece=text.slice(start,start+180);return (start?'…':'')+(at<0?esc(piece):esc(piece).split(esc(q)).join(`<mark>${esc(q)}</mark>`));};
  const excerpt=u=>{const text=ver(u).paragraphs.find(t=>t.includes(q));if(text&&!ref)return mark(text,text.indexOf(q));const note=ref?null:state.notes.find(n=>n.unitId===u.id&&n.text.includes(q));return note?`<span class="pill">笔记</span> ${mark(note.text,note.text.indexOf(q))}`:mark(ver(u).paragraphs[0]||`该年${CODEX.short}尚无此条`,-1);};
  return `${pageHead(`搜索“${esc(q)}”`,`${results.length} 处 · 按 ${state.year} 年文本检索，也查找你的笔记`)}<div class="search-results">${results.map(u=>`<button class="result-card" data-action="goto" data-unit="${u.id}"><h3>${esc(label(u))}</h3><p>${excerpt(u)}</p></button>`).join('')||'<div class="big-empty"><h3>没有找到</h3><p>可以输入条号，如“第三十三条”“33”“序言第七自然段”，或输入正文中的词句。</p></div>'}</div>`;
}

function showModal(title, content) {
  const wasOpen=modal.open;
  if(!wasOpen) modalReturnFocus=document.activeElement;
  modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${content}</div>`;
  if(!wasOpen) modal.showModal();
  updateSelectionTools();
}
// Android back key: close the dialog first, then return to 体系阅读; false lets the shell leave the app.
function androidBack(){if(modal.open){closeModal();return true;}if(ui.view!=='outline'){ui.view='outline';render();window.scrollTo({top:0});return true;}return false;}
function closeModal() { modal.close(); if(modalReturnFocus?.isConnected) modalReturnFocus.focus(); }
// Table of contents: the top level (章; 编 in larger codes) as tabs, deeper levels as folding headings.
// Typing in the box searches every article of the year, by number, label or 条旨.
function tocUnitButton(u){return `<button class="${u.id===state.current?'active ':''}${state.notes.some(n=>n.unitId===u.id)?'has-note':''}" data-action="toc-go" data-unit="${u.id}">${esc(label(u))}</button>`;}
function tocBranch(node){
  const nested=new Set(node.children.flatMap(c=>c.unitIds)),own=node.unitIds.filter(id=>!nested.has(id)).map(M.get);
  return `${own.length?`<div class="toc-grid">${own.map(tocUnitButton).join('')}</div>`:''}${node.children.map(c=>`<details class="toc-branch depth-${c.depth}" ${c.unitIds.includes(state.current)||node.children.length<=12?'open':''}><summary>${esc(c.title)}<small>${c.unitIds.length} 条</small></summary>${tocBranch(c)}</details>`).join('')}`;
}
function tocMatches(q){
  q=q.trim();if(!q)return [];const ref=resolveReference(q);
  return M.units.filter(u=>ver(u).exists&&(ref?u.id===ref:(label(u)+M.subtitle(state,u.id)).includes(q))).slice(0,200);
}
function showToc(){
  const roots=M.tree(state.year).roots,top=roots.find(n=>n.id===ui.tocChapter)||chapter(current())||roots[0];
  showModal('目录',`<div class="row between toc-head"><span class="small muted">${state.year} 年文本${roots.some(n=>n.level==='preamble')?' · 序言按自然段排列':''}</span><select id="toc-year" aria-label="目录年份">${yearOptions()}</select></div><input type="search" class="toc-filter toc-search" data-toc-search placeholder="条号或条旨，如 三十七、人身自由" aria-label="在目录中查找"><div data-toc-browse><div class="chapter-nav">${roots.map(c=>`<button class="${c.id===top.id?'active':''}" data-action="toc-chapter" data-chapter="${c.id}">${esc(c.name)}</button>`).join('')}</div><div class="toc-tree">${tocBranch(top)}</div></div><div class="toc-grid" data-toc-results hidden></div><p class="note-source">圆点表示已有笔记。</p>`);
}

function showAmendment(year,number,name){const a=DATA.history.amendments.find(a=>a.year===year&&(number?a.number===number:a.label===name));if(!a)return;showModal(`${year} 年${CODEX.amendment}${a.label}`,`${paraList([a.text],'law-text')}<p class="note-source">出处：${a.sourceRefs.map(r=>`${esc(r.file)} 第 ${r.page} 页`).join('；')}</p>${amendmentEnglish(year,a.number)}`);}
function toggleWord(el,scope='reader'){
  const anchor=M.anchor(el.dataset.unit,Number(el.dataset.year),Number(el.dataset.block),Number(el.dataset.start),Number(el.dataset.end));
  const list=scope==='link'?ui.linkDraft.to:ui.selection,key=M.anchorKey(anchor),exists=list.some(a=>M.anchorKey(a)===key);
  const next=exists?list.filter(a=>M.anchorKey(a)!==key):[...list,anchor];
  if(scope==='link'){ui.linkDraft.to=next;renderLinkPreview();}else{ui.selection=next;render();}
}
function showNewTerm(){
  const anchors=M.mergeAnchors(ui.selection),name=anchors.map(a=>a.quote).join(' · ').slice(0,120);
  showModal('建立词条',`<form id="term-create-form"><label for="term-name">词条名称</label><input name="name" id="term-name" required maxlength="120" value="${esc(name)}" placeholder="例如：人民、国家权力"><label for="term-text">词条笔记</label><textarea name="text" id="term-text" placeholder="写下对这个词的理解，也可以先保存为空白词条。"></textarea><p class="note-source">${anchors.length?`已选原文：${esc(anchorSummary(anchors))}`:'词条建好后，可在原文中选词并添加定位。'}<br>同名词条会合并定位。填写新的词条笔记时会更新同名词条的笔记。</p><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">保存词条</button></div></form>`);
}
function termMentions(term){
  const result=[];
  for(const u of M.units){const v=ver(u);if(!v.exists)continue;v.paragraphs.forEach((p,block)=>{let start=0,at;while((at=p.indexOf(term.name,start))!==-1){const a=M.anchor(u.id,state.year,block,at,at+term.name.length);if(!term.anchors.some(t=>M.anchorKey(t)===M.anchorKey(a)))result.push(a);start=at+term.name.length;}});}
  return result;
}
function showTerm(id){
  ui.termId=id;const t=state.terms.find(t=>t.id===id);if(!t)return;
  const refs=M.termReferences(state,id),mentions=termMentions(t);
  showModal(`[[${t.name}]]`,`<form id="term-edit-form" data-id="${t.id}"><label for="term-edit-text">词条笔记</label><textarea id="term-edit-text" name="text">${esc(t.text)}</textarea><div class="modal-actions"><button class="btn primary small" type="submit">保存词条笔记</button></div></form><div class="rule"></div><h3 class="small">已建立的原文定位 · ${refs.anchors.length}</h3>${refs.anchors.map(a=>`<div class="reference-row">${anchorButton([a])}</div>`).join('')||'<p class="empty small">还没有原文定位。</p>'}<h3 class="small" style="margin-top:20px">引用这个词条的笔记 · ${refs.notes.length}</h3>${refs.notes.map(n=>`<div class="reference-row"><button class="text-btn" data-action="goto-note" data-id="${n.id}">${esc(label(M.get(n.unitId),n.year))} · ${n.year} 年</button><p class="small muted">${esc(n.text.slice(0,180))}</p></div>`).join('')||'<p class="empty small">在笔记中输入 [[词条名]]，即可建立引用。</p>'}<details class="source-note"><summary>${state.year} 年文本中尚未定位的同名用语 · ${mentions.length} 处</summary><p class="note-source">只按文字相同查找。同一用语在不同条文中是否含义相同，需要自己判断。</p>${mentions.slice(0,ui.mentionLimit||20).map(a=>`<div class="mention-row"><span>${esc(citePlace(M.get(a.unitId),a.year,a.block))}</span><button class="text-btn" data-action="term-mention" data-anchors="${esc(JSON.stringify([a]))}">添加定位</button></div>`).join('')}${mentions.length>(ui.mentionLimit||20)?'<button class="text-btn" data-action="more-mentions">显示更多</button>':''}</details>`);
}
function showLink(existing=false){
  if(!existing){
    if(!ver(current()).exists){toast('这个年份尚无此条，请切换年份。');return;}
    const from=ui.selection.length?M.mergeAnchors(ui.selection):[M.whole(state.current,state.year)];
    const candidate=M.sequence(state.year).find(id=>id!==state.current)||state.current;
    ui.linkDraft={from,target:candidate,year:state.year,to:[],reason:''};
  }
  const d=ui.linkDraft;
  showModal('建立关联',`<form id="link-form"><div class="hint-panel"><span class="small muted">本端</span><br>${esc(label(M.get(d.from[0].unitId),d.from[0].year))} · ${d.from[0].year} 年文本<br>${esc(anchorSummary(d.from))}</div><div class="form-columns"><div><label for="link-year">对方文本年份</label><select id="link-year">${yearOptions(d.year)}</select></div><div><label for="link-unit">关联到</label><select id="link-unit">${unitOptions(d.target,d.year)}</select></div></div><label for="link-find">按条号查找</label><input id="link-find" placeholder="如 第三十八条、38、序言第七自然段"><p class="note-source">可在下方点选对方的字句；不选时，关联到整条或整个自然段。</p><div id="link-target-preview" class="link-target-preview"></div><label for="link-reason">关联理由</label><textarea id="link-reason" rows="3" placeholder="如：原则与具体规定、权利与保障程序、职权分工、同一用语">${esc(d.reason)}</textarea><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">保存关联</button></div></form>`);
  renderLinkPreview();
}
function renderLinkPreview(){
  const d=ui.linkDraft,el=document.getElementById('link-target-preview');if(!d||!el)return;
  const scroll=el.scrollTop,v=M.version(d.target,d.year);
  el.innerHTML=`<div class="small muted" style="margin-bottom:12px">${d.to.length?`已选：${esc(anchorSummary(M.mergeAnchors(d.to)))}`:'当前关联到整条或整个自然段；点选字句可缩小范围。'}</div><div class="law-text">${v.paragraphs.map((p,i)=>lawParagraph(p,d.target,d.year,i,'link')).join('')}</div>`;el.scrollTop=scroll;
}

function showUpdate(){showModal('收录一则材料',`<form id="update-form"><label for="update-title">标题</label><input id="update-title" name="title" required maxlength="500"><label for="update-type">类型</label><select id="update-type" name="type"><option>法律修改</option><option>案例</option><option>资讯</option><option>制宪史料</option><option>修宪史料</option><option>学术文献</option></select><label for="update-url">来源链接（可选）</label><input id="update-url" name="url" type="url" placeholder="https://…"><label for="update-text">材料摘记</label><textarea id="update-text" name="text" required maxlength="20000"></textarea><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn primary">放入收件箱</button></div></form>`);}
function citeQuote(text){return text.replace(ITEM_MARK,'').replace(/[；，]$/,'');}
function showCite(selection=[]){
  const unit=current(),year=state.year,v=ver(unit,year);if(!v?.exists){toast(`该年份${CODEX.short}尚无此条。`);return;}
  const title=citeTitle(year,unit),labels=clauseLabels(unit,year),verb=unit.kind==='preamble'?'写明':'规定',options=[];
  for(const a of M.mergeAnchors(selection).filter(a=>a.unitId===unit.id&&a.year===year&&a.block!==null))options.push(['所选字句',`${title}${citePlace(unit,year,a.block)}中的“${a.quote}”`]);
  options.push([unit.kind==='preamble'?'整个自然段':'整条',v.paragraphs.length===1?`${title}${v.label}${verb}：“${v.paragraphs[0]}”`:`${title}${v.label}${verb}：\n${v.paragraphs.join('\n')}`]);
  // A 款 followed by its 项 is quoted whole: the lead sentence and every item.
  if(v.paragraphs.length>1)v.paragraphs.forEach((p,i)=>{
    if(!labels[i]?.cite)return;
    const items=[];if(!ITEM_MARK.test(p))for(let j=i+1;j<v.paragraphs.length&&ITEM_MARK.test(v.paragraphs[j]);j++)items.push(v.paragraphs[j]);
    options.push([labels[i].cite,items.length?`${title}${v.label}${labels[i].cite}${verb}：\n${[p,...items].join('\n')}`:`${title}${v.label}${labels[i].cite}${verb}：“${citeQuote(p)}”`]);
  });
  showModal('复制引文',`<div class="cite-list">${options.map(([kind,text])=>`<div class="cite-item"><span class="cite-kind">${esc(kind)}</span><p class="cite-text">${esc(text).replace(/\n/g,'<br>')}</p><button class="btn small" data-action="cite-copy" data-text="${esc(text)}">${icon('copy')}复制</button></div>`).join('')}</div><p class="note-source">${esc(CODEX.citation.note)}</p>`);
}
async function copyText(text,message){
  if(SHELL?.copyText){await SHELL.copyText(text);toast(message);return;}
  try{await navigator.clipboard.writeText(text);}
  catch{const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';(modal.open?modal:document.body).appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();if(!ok){toast('浏览器不允许复制，请手动选择文字。');return;}}
  toast(message);
}
function showShare(){showDiscussionEditor(null,state.notes.filter(n=>n.unitId===state.current&&n.year===state.year).map(n=>n.id));}
// App shells save files and copy text natively: Android (维护工具/制作安卓测试版.py) exposes window.FadianAndroid,
// the Windows app (维护工具/windows-app) exposes window.FadianShell. saveText may return a message or a Promise of one.
const SHELL=window.FadianShell||window.FadianAndroid||null;
// Editions that never reach the local service: '安卓版', 'Windows 版' or '网页版'; '' for the PC&Mac 通用版 page.
function serviceFreeEdition(){return window.FadianAndroid?'安卓版':window.FadianShell?'Windows 版':location.protocol==='file:'||/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)?'':'网页版';}
function download(name,content,type){if(SHELL?.saveText){Promise.resolve(SHELL.saveText(name,String(content),type)).then(toast,error=>toast('保存失败：'+(error?.message||error)));return;}const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('文件已生成，请查看浏览器下载。');}
function exportMarkdown(){
  const lines=['# 我的法典笔记','',`导出日期：${date(now())}`,''];
  for(const n of state.notes){lines.push(`## ${label(M.get(n.unitId),n.year)} · ${n.year} 年`,'');if(n.anchors.length)lines.push(`定位：${anchorSummary(n.anchors)}`,'');if(n.quote)lines.push('> '+n.quote.replace(/\n/g,'\n> '),'');lines.push(n.question?`解释问题：${n.question}`:'',n.methods?.length?`解释方法：${M.methodLabels(n.methods).join('、')}`:'',n.text,'',n.source?`来源：${n.source.file} 第${n.source.page}页；原文：${n.source.excerpt}`:'','正文快照：','',...n.textSnapshot,'');}
  lines.push('# 词条','');for(const t of state.terms){lines.push(`## [[${t.name}]]`,'',t.text,'');for(const a of t.anchors)lines.push(`- ${label(M.get(a.unitId),a.year)} · ${a.year} 年 · ${a.quote||'全文'}`);lines.push('');}
  lines.push('# 关联','');for(const l of state.links)lines.push(`${label(M.get(l.from[0].unitId),l.from[0].year)}（${l.from[0].year}）${anchorSummary(l.from)} ↔ ${label(M.get(l.to[0].unitId),l.to[0].year)}（${l.to[0].year}）${anchorSummary(l.to)}`,l.reason,'');
  lines.push('# 关联材料','');for(const m of state.materials)lines.push(`${label(M.get(m.unitId),m.year)} · ${m.year} 年`,m.title,m.url||'',m.reason,m.sourceText||'','');
  appendWorkspaceMarkdown(lines);
  download('我的法典笔记.md',lines.join('\n'),'text/markdown;charset=utf-8');
}

function saveNote(){
  const key=draftKey(),d=state.drafts[key]||{};
  M.addNote(state,{unitId:state.current,year:state.year,text:d.text||'',anchors:d.anchors||[],quote:d.quote||'',editId:d.editId,question:d.question||'',methods:d.methods||[],evidenceIds:d.evidenceIds||[]});delete state.drafts[key];ui.selection=[];persist();render();toast('笔记与原文位置已保存。');
}
function selectedNote(){
  const key=draftKey(),d=state.drafts[key]||{text:''};d.anchors=M.mergeAnchors(ui.selection);state.drafts[key]=d;ui.rail='mine';ui.selection=[];persist();render();document.getElementById('note-input')?.focus();
}
function confirmDelete(kind,id){showModal(kind==='link'?'移除这项关联？':'删除这条记录？',`<p class="small muted">${kind==='link'?'两端的关联同时移除，原文和笔记保留。':'删除后不能撤销；如需留存，请先导出备份。'}</p><div class="modal-actions"><button class="btn" data-action="close">保留</button><button class="btn accent" data-action="confirm-delete" data-kind="${kind}" data-id="${esc(id)}">确认删除</button></div>`);}

document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action,unitId=el.dataset.unit,id=el.dataset.id;
  try{switch(action){
    case 'nav':if(modal.open)closeModal();ui.view=el.dataset.view;ui.search='';ui.selection=[];if(ui.view==='practice'&&!ui.feedId)resetFeed();render();window.scrollTo({top:0,behavior:'instant'});break;
    case 'more-nav':showMoreNav();break;
    case 'cite':showCite(ui.selection);break;
    case 'cite-copy':copyText(el.dataset.text,'引文已复制。');break;
    case 'data':showData();break;case 'close':closeModal();break;
    case 'toc':ui.tocChapter=null;showToc();break;
    case 'toc-chapter':ui.tocChapter=el.dataset.chapter;showToc();break;
    case 'toc-go':closeModal();readUnit(unitId,Number(el.dataset.year)||state.year);break;
    case 'goto':readUnit(unitId);break;
    case 'notes-tab':ui.notesTab=el.dataset.tab;render();break;
    case 'goto-materials':readUnit(unitId,Number(el.dataset.year)||state.year,'materials');break;
    case 'open-material-tab':ui.view='updates';ui.materialTab=el.dataset.tab;render();break;
    case 'rights-template':{const input=document.getElementById('note-input');if(!input||input.disabled)break;if(!input.value.includes('保护范围：'))input.value=(input.value.trim()?input.value.trimEnd()+'\n\n':'')+RIGHTS_TEMPLATE;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();break;}
    case 'goto-note':{const n=state.notes.find(n=>n.id===id);if(!n)break;closeModal();readUnit(n.unitId,n.year,'mine',n.anchors);break;}
    case 'read-year':readUnit(unitId||state.current,Number(el.dataset.year));break;
    case 'reader-prev':readerStep(-1);break;case 'reader-next':readerStep(1);break;
    case 'text-mode':ui.history=el.dataset.mode!=='text';ui.historyView=el.dataset.mode==='combined'?'combined':'timeline';ui.words=false;ui.selection=[];render();break;
    case 'toggle-changes':ui.changes=!ui.changes;ui.words=false;ui.selection=[];render();break;
    case 'toggle-words':ui.words=!ui.words;ui.history=false;ui.selection=[];render();break;
    case 'word':toggleWord(el);break;case 'link-word':toggleWord(el,'link');break;
    case 'anchor':{const a=M.anchor(unitId,Number(el.dataset.year),Number(el.dataset.block),Number(el.dataset.start),Number(el.dataset.end));ui.selection=[a];ui.rail='links';render();break;}
    case 'selection-clear':clearSelection();render();break;
    case 'selection-note':selectedNote();break;
    case 'selection-term':case 'term-new':showNewTerm();break;
    case 'term-open':ui.mentionLimit=20;showTerm(id);break;
    case 'term-mention':{const t=state.terms.find(t=>t.id===ui.termId);if(!t)break;M.addTerm(state,{name:t.name,anchors:JSON.parse(el.dataset.anchors)});persist();showTerm(t.id);render();toast('已为词条添加这处原文。');break;}
    case 'more-mentions':ui.mentionLimit=(ui.mentionLimit||20)+20;showTerm(ui.termId);break;
    case 'new-link':showLink();break;
    case 'jump-anchors':{const anchors=JSON.parse(el.dataset.anchors);if(!anchors.every(M.anchorValid))throw Error('原文定位无效。');closeModal();readUnit(anchors[0].unitId,anchors[0].year,'links',anchors);break;}
    case 'rail':ui.rail=el.dataset.tab;render();break;
    case 'bookmark':state.bookmarks=isBookmarked(unitId)?state.bookmarks.filter(x=>x!==unitId):[...state.bookmarks,unitId];persist();render();break;
    case 'mark-read':if(!state.read.includes(state.current))state.read.push(state.current);persist();render();toast('已标为已读。');break;
    case 'clear-note-anchors':if(state.drafts[draftKey()])state.drafts[draftKey()].anchors=[];persist();render();break;
    case 'save-note':saveNote();break;
    case 'edit-note':{const n=state.notes.find(n=>n.id===id);if(!n)break;const key=`${n.unitId}@${n.year}`,d=state.drafts[key];if(d?.text&&d.editId!==n.id){toast('请先保存当前草稿，再编辑已有笔记。');break;}state.drafts[key]={text:n.text,anchors:n.anchors,quote:n.quote,editId:n.id,year:n.year,question:n.question,methods:M.methodLabels(n.methods),evidenceIds:n.evidenceIds};readUnit(n.unitId,n.year,'mine',n.anchors);document.getElementById('note-input')?.focus();break;}
    case 'cancel-edit':delete state.drafts[draftKey()];persist();render();break;
    case 'delete-note':confirmDelete('note',id);break;case 'delete-link':confirmDelete('link',id);break;case 'delete-material':confirmDelete('material',id);break;
    case 'confirm-delete':{const key=({note:'notes',link:'links',material:'materials'})[el.dataset.kind];if(!key)break;state[key]=state[key].filter(x=>x.id!==id);for(const [key,d] of Object.entries(state.drafts))if(d.editId===id)delete state.drafts[key];persist();closeModal();render();toast('已移除。');break;}
    case 'amendment':showAmendment(Number(el.dataset.year),Number(el.dataset.number),el.dataset.label);break;
    case 'feed-prev':feedStep(-1);break;case 'feed-next':feedStep(1);break;
    case 'feed-reset':resetFeed();render();break;case 'reveal':ui.revealed=true;render();break;
    case 'feed-read':readUnit(ui.feedId);break;case 'feed-note':readUnit(ui.feedId,state.year,'mine');break;
    case 'add-material':showMaterial();break;case 'add-update':showUpdate();break;case 'accept-update':showMaterial(id);break;
    case 'ignore-update':case 'restore-update':{const u=state.updates.find(x=>x.id===id);if(u)u.status=action==='ignore-update'?'ignored':'pending';persist();render();break;}
    case 'share':showShare();break;
    case 'export-json':download(`${CODEX.id==='cn-constitution'?'法典笔记备份':'法典笔记备份-'+CODEX.short}_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({...state,exportedAt:now()},null,2),'application/json;charset=utf-8');break;
    case 'export-md':exportMarkdown();break;
    case 'export-unreadable':download('法典笔记_未能读取的原始记录.txt',unreadableBackup||'','text/plain;charset=utf-8');break;
    case 'import-json':document.getElementById('import-file').click();break;
    case 'reset':showModal('清空此浏览器中的记录？','<p>这会清空此浏览器中的笔记、词条、关联、材料和复习安排。请先导出备份。旧版存储不受影响。</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn accent" data-action="confirm-reset">确认清空</button></div>');break;
    case 'confirm-reset':state=M.fresh();unreadableBackup=null;persist();closeModal();ui.view='reader';ui.rail='mine';ui.selection=[];ui.feedId=null;render();break;
  }}catch(error){toast(error.message||'操作未完成，请重试。');}
});
document.addEventListener('input',event=>{
  if(event.target.id==='note-input'){const key=draftKey(),d=state.drafts[key]||{text:'',anchors:[],year:state.year};d.text=event.target.value;state.drafts[key]=d;persist();document.getElementById('draft-status').textContent=storageAvailable?'草稿已保存':'保存失败，请导出备份';}
  if(event.target.id==='link-reason'&&ui.linkDraft)ui.linkDraft.reason=event.target.value;
  if(event.target.id==='link-find'&&ui.linkDraft){const target=resolveReference(event.target.value.trim(),ui.linkDraft.year);if(target&&M.version(target,ui.linkDraft.year)?.exists){ui.linkDraft.target=target;ui.linkDraft.to=[];document.getElementById('link-unit').value=target;renderLinkPreview();}}
});
document.addEventListener('change',async event=>{
  try{const el=event.target;
    if(el.id==='reader-year'){state.year=Number(el.value);ui.selection=[];ui.flash=[];persist();render();}
    if(el.id==='reader-order'){ui.readMode=el.value;ui.readerDeck=[];render();}
    if(el.id==='note-sort'){state.preferences.noteSort=el.value;persist();render();}
    if(el.id==='toc-year'){state.year=Number(el.value);persist();showToc();render();}
    if(el.id==='feed-mode'||el.id==='feed-pool'||el.id==='feed-year'){if(el.id==='feed-mode')ui.feedMode=el.value;if(el.id==='feed-pool')ui.feedPool=el.value;if(el.id==='feed-year'){state.year=Number(el.value);persist();}resetFeed();render();}
    if(el.id==='link-unit'){ui.linkDraft.target=el.value;ui.linkDraft.to=[];renderLinkPreview();}
    if(el.id==='link-year'){ui.linkDraft.year=Number(el.value);if(!M.version(ui.linkDraft.target,ui.linkDraft.year)?.exists)ui.linkDraft.target=M.sequence(ui.linkDraft.year)[0];ui.linkDraft.to=[];showLink(true);}
    if(el.id==='import-file'){const file=el.files[0];if(!file)return;if(file.size>25*1024*1024)throw Error('备份超过25MB。');const result=M.merge(state,JSON.parse(await file.text()));state=result.state;persist();closeModal();render();toast(`已合并：新增 ${result.added} 条，另保留 ${result.conflicts} 条不同版本。`);}
  }catch(error){toast(`未完成：${error.message}`);}
});
document.addEventListener('submit',event=>{
  const form=event.target;event.preventDefault();
  try{
    if(form.id==='search-form'){ui.search=document.getElementById('global-search').value.trim();ui.view='search';render();return;}
    const f=Object.fromEntries(new FormData(form));
    if(form.id==='term-create-form'){const t=M.addTerm(state,{name:f.name,text:f.text,anchors:ui.selection});ui.selection=[];persist();render();showTerm(t.id);toast('词条已保存。');return;}
    if(form.id==='term-edit-form'){const t=state.terms.find(t=>t.id===form.dataset.id);if(t){t.text=f.text.trim();t.updatedAt=now();persist();render();toast('词条笔记已保存。');}return;}
    if(form.id==='link-form'){const d=ui.linkDraft;M.addLink(state,{from:d.from,to:d.to.length?d.to:[M.whole(d.target,d.year)],reason:d.reason});ui.selection=[];persist();closeModal();ui.rail='links';render();toast('关联已建立，两端都能看到。');return;}
    if(!['material-form','update-form'].includes(form.id))return;
    const url=f.url.trim();if(url&&!safeUrl(url))throw Error('来源链接需以 http:// 或 https:// 开头。');if(!f.title.trim()||!(f.reason||f.text||'').trim())throw Error('请填写标题和记录内容。');
    if(form.id==='update-form'){state.updates.push({id:uid(),title:f.title.trim(),type:f.type,url,text:f.text.trim(),createdAt:now(),status:'pending'});persist();closeModal();render();toast('已放入收件箱。');}
    else{if(!M.get(f.unitId))throw Error('请选择关联条目。');const u=state.updates.find(x=>x.id===form.dataset.update);state.materials.push({id:uid(),unitId:f.unitId,year:state.year,title:f.title.trim(),type:f.type,url,reason:f.reason.trim(),sourceText:f.sourceText||u?.text||'',methods:M.tags(f.methods),question:f.question||'',sourceDate:f.sourceDate||'',amendmentYear:f.amendmentYear?Number(f.amendmentYear):null,evidenceRole:f.evidenceRole||'背景',verification:f.verification||'待核',createdAt:now()});if(u)u.status='accepted';persist();closeModal();readUnit(f.unitId,state.year,'materials');toast('材料已关联。');}
  }catch(error){toast(error.message||'保存失败。');}
});
function captureSelection(){
  if(ui.view!=='reader'||ui.history||modal.open||ui.words)return;
  const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;
  const range=selection.getRangeAt(0),container=document.getElementById('law-text');if(!container||!container.contains(range.startContainer)||!container.contains(range.endContainer))return;
  const anchors=[];
  for(const p of container.querySelectorAll('[data-law-block]')){
    if(!range.intersectsNode(p))continue;
    const r=range.cloneRange();if(!p.contains(r.startContainer))r.setStart(p,0);if(!p.contains(r.endContainer))r.setEnd(p,p.childNodes.length);
    const before=document.createRange();before.selectNodeContents(p);before.setEnd(r.startContainer,r.startOffset);
    const start=before.toString().length,end=start+r.toString().length;if(end>start)anchors.push(M.anchor(state.current,state.year,Number(p.dataset.lawBlock),start,end));
  }
  if(anchors.length){ui.selection=anchors;updateSelectionTools();}
}
document.addEventListener('pointerup',event=>{if(!event.target.closest('button,input,textarea,dialog,#selection-tools'))captureSelection();});
document.addEventListener('keyup',event=>{if(event.key==='Shift')captureSelection();});
document.addEventListener('keydown',event=>{
  if(event.target.matches('.annotated')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click();return;}
  if(modal.open||event.target.closest('input,textarea,select,[contenteditable]'))return;
  if(event.key==='Escape'){clearSelection();return;}
  if(ui.view==='practice'){
    if(['ArrowDown','ArrowRight'].includes(event.key)){event.preventDefault();feedStep(1);}
    if(['ArrowUp','ArrowLeft'].includes(event.key)){event.preventDefault();feedStep(-1);}
    if(event.code==='Space'&&ui.recall&&!ui.revealed){event.preventDefault();ui.revealed=true;render();}
  }else if(ui.view==='reader'&&!ui.selection.length&&!window.getSelection()?.toString()){if(event.key==='ArrowRight'){event.preventDefault();swipeStep('reader',1);}if(event.key==='ArrowLeft'){event.preventDefault();swipeStep('reader',-1);}}
});
// Continuous reading: at the end of a page, keep scrolling (or pull, on a touch screen) to turn to
// the next article. A cue shows where the gesture leads and how far it has gone, so nothing happens
// by surprise. Trackpad momentum is treated as part of the gesture that produced it: a gesture that
// started mid-page stops at the edge, and the next turn needs a fresh gesture.
const swipe={dir:0,amount:0,last:0,fromEdge:false,lockUntil:0,touch:null,hide:0};
const SWIPE_WHEEL=260,SWIPE_TOUCH=72,SWIPE_GAP=220;
function swipeScope(target){
  if(modal.open||ui.words||!['reader','practice'].includes(ui.view))return null;
  if(!target?.closest||!target.closest('main')||target.closest('input,textarea,select,[contenteditable],.topbar,.mobile-nav,#selection-tools,#swipe-cue'))return null;
  const rail=target.closest('.rail');if(rail&&getComputedStyle(rail).position==='sticky')return null;
  return ui.view==='reader'?'reader':'practice';
}
function swipeBlocked(target,dir){
  // Let inner scroll areas (a long comparison table, a note editor) scroll first.
  for(let el=target;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
    if(el.scrollHeight<=el.clientHeight+2||!['auto','scroll'].includes(getComputedStyle(el).overflowY))continue;
    if(dir>0?el.scrollTop+el.clientHeight<el.scrollHeight-2:el.scrollTop>2)return true;
  }
  const page=document.scrollingElement;
  return dir>0?page.scrollTop+page.clientHeight<page.scrollHeight-3:page.scrollTop>3;
}
function swipeDestination(scope,dir){
  if(scope==='practice')return dir>0?'下一张卡片':'上一张卡片';
  if(ui.readMode==='random')return '随机换一条';
  const pool=M.sequence(state.year),id=pool[pool.indexOf(state.current)+dir];
  if(!id)return null;
  const unit=M.get(id),gist=shortTitle(unit);
  return `${ver(unit).label}${gist?`【${gist}】`:''}`;
}
function swipeCue(scope,dir,progress,touch=false){
  let cue=document.getElementById('swipe-cue');
  if(!cue){cue=document.createElement('div');cue.id='swipe-cue';cue.className='swipe-cue';cue.setAttribute('aria-hidden','true');cue.innerHTML='<span></span><i></i>';document.body.append(cue);}
  if(!scope){cue.classList.remove('show');return;}
  const target=swipeDestination(scope,dir),ready=progress>=1;
  cue.classList.toggle('top',dir<0);cue.classList.toggle('ready',ready&&!!target);cue.classList.add('show');
  cue.querySelector('span').textContent=!target?(dir>0?'已是最后一条':'已是第一条'):ready&&touch?`松开，进入 ${target}`:`${dir>0?(touch?'继续上拉':'继续下滑'):(touch?'继续下拉':'继续上滑')}，进入 ${target}`;
  cue.style.setProperty('--p',target?Math.min(1,Math.max(0,progress)):0);
}
function swipeStep(scope,delta){
  swipeCue(null);swipe.amount=0;swipe.lockUntil=Date.now()+450;
  if(scope==='reader'){if(!swipeDestination(scope,delta))return;readerStep(delta);}else feedStep(delta);
  const card=document.querySelector(scope==='reader'?'.reader-main':'[data-swipe="feed"]');
  if(card){card.classList.remove('turn-up','turn-down');void card.offsetWidth;card.classList.add(delta>0?'turn-up':'turn-down');}
}
document.addEventListener('wheel',event=>{
  const now=Date.now(),fresh=now-swipe.last>SWIPE_GAP;swipe.last=now;
  const scope=swipeScope(event.target),dir=Math.sign(event.deltaY);
  if(fresh)swipe.fromEdge=!!scope&&dir!==0&&!swipeBlocked(event.target,dir);
  if(!scope||event.ctrlKey||!dir||Math.abs(event.deltaX)>Math.abs(event.deltaY)){swipeCue(null);return;}
  // Swallow the rest of the gesture that turned the page, including trackpad momentum.
  if(now<swipe.lockUntil){event.preventDefault();swipe.lockUntil=now+SWIPE_GAP;return;}
  if(swipeBlocked(event.target,dir)){swipe.amount=0;swipeCue(null);return;}
  event.preventDefault();
  if(dir!==swipe.dir){swipe.dir=dir;swipe.amount=0;}
  if(!swipe.fromEdge){swipeCue(scope,dir,0);clearTimeout(swipe.hide);swipe.hide=setTimeout(()=>swipeCue(null),900);return;}
  swipe.amount+=Math.abs(event.deltaY)*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
  clearTimeout(swipe.hide);swipe.hide=setTimeout(()=>{swipe.amount=0;swipeCue(null);},700);
  if(swipe.amount>=SWIPE_WHEEL&&swipeDestination(scope,dir)){swipeStep(scope,dir);return;}
  swipeCue(scope,dir,swipe.amount/SWIPE_WHEEL);
},{passive:false});
document.addEventListener('touchstart',event=>{
  const scope=event.touches.length===1?swipeScope(event.target):null;
  swipe.touch=scope?{scope,target:event.target,x:event.touches[0].clientX,y:event.touches[0].clientY,down:!swipeBlocked(event.target,1),up:!swipeBlocked(event.target,-1),dir:0,progress:0}:null;
},{passive:true});
document.addEventListener('touchmove',event=>{
  const t=swipe.touch;if(!t)return;
  const dy=t.y-event.touches[0].clientY,dx=t.x-event.touches[0].clientX,dir=Math.sign(dy);
  if(Math.abs(dy)<12||Math.abs(dx)>Math.abs(dy)||window.getSelection()?.toString()||!(dir>0?t.down:t.up)){t.dir=0;swipeCue(null);return;}
  t.dir=dir;t.progress=(Math.abs(dy)-12)/SWIPE_TOUCH;swipeCue(t.scope,dir,t.progress,true);
},{passive:true});
document.addEventListener('touchend',()=>{
  const t=swipe.touch;swipe.touch=null;if(!t)return;
  if(t.dir&&t.progress>=1&&Date.now()>swipe.lockUntil&&!window.getSelection()?.toString())swipeStep(t.scope,t.dir);else swipeCue(null);
},{passive:true});
document.addEventListener('touchcancel',()=>{swipe.touch=null;swipeCue(null);},{passive:true});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
modal.addEventListener('close',()=>{if(modalReturnFocus?.isConnected)modalReturnFocus.focus();updateSelectionTools();});



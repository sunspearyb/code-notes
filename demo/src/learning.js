'use strict';
Object.assign(ui,{revisionYear:null,revisionFocus:true,changes:true,recall:true,revealed:false,memoryMode:'whole',materialTab:'files'});
const service={connected:false,token:'',revision:0,status:null,files:[],proposals:[],backups:[],saving:false,pending:false,error:'',busy:''};

function shortTitle(unit){return M.subtitle(state,unit.id);}
function noteDisplayControl(){return `<div class="note-display"><span>显示</span><div class="segmented" aria-label="笔记显示方式">${[['hidden','隐藏'],['summary','摘要'],['full','全文']].map(([mode,title])=>`<button data-action="notes-mode" data-mode="${mode}" class="${state.preferences.noteMode===mode?'active':''}" aria-pressed="${state.preferences.noteMode===mode}">${title}</button>`).join('')}</div></div>`;}
function notesBelow(unit,mode='full',empty=false){
  if(mode==='hidden')return '';
  const records=state.notes.filter(n=>n.unitId===unit.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  if(!records.length)return empty?`<section class="note-invitation"><div><h3>这一条还没有笔记</h3><p>可以从一个问题开始：哪个词需要解释？它和哪一条有关？</p></div><button class="btn" data-action="focus-note">写笔记</button></section>`:'';
  return `<section class="marginalia" aria-label="${esc(unit.label)}的随文笔记">${records.map(n=>{const [kind,name]=noteKind(n);return `<article class="annotation-card ${kind} ${mode==='summary'?'summary':''}" data-note-id="${n.id}"><div class="annotation-meta"><span>${name} · ${n.year} 年文本${n.anchors.some(a=>a.block!==null)?' · 字句':''}</span><time>${date(n.updatedAt)}</time></div>${mode==='summary'?`<h3>${esc(n.question||n.text.slice(0,65))}</h3>${n.question&&n.text?`<p>${esc(n.text.slice(0,110))}${n.text.length>110?'…':''}</p>`:''}`:`${noteDetails(n)}${n.anchors.length?`<div class="annotation-quote">${anchorButton(n.anchors,anchorSummary(n.anchors))}</div>`:''}${n.quote?`<blockquote>${esc(n.quote)}</blockquote>`:''}${n.text?`<p class="annotation-body">${noteHtml(n.text)}</p>`:'<p class="small muted">问题已记下，依据待补。</p>'}`}<footer><button class="text-btn" data-action="edit-note" data-id="${n.id}">修改</button><button class="text-btn" data-action="discuss-note" data-id="${n.id}">共享讨论</button>${mode==='summary'?'<button class="text-btn" data-action="notes-mode" data-mode="full">展开</button>':`<button class="text-btn muted" data-action="delete-note" data-id="${n.id}">删除</button>`}</footer></article>`;}).join('')}</section>`;
}
function versionBody(unit,year){
  const v=ver(unit,year);if(!v.exists)return `<div class="empty">${year} 年${esc(CODEX.short)}尚无此条。</div>`;
  const labels=clauseLabels(unit,year);
  return `<div id="law-text" class="law-text ${labels.some(l=>l.gutter)?'has-clauses':''}">${v.paragraphs.map((p,i)=>lawParagraph(p,unit.id,year,i,'reader',labels[i]?.gutter||'')).join('')}</div>`;
}
function amendmentBasis(unit,year){
  const list=(ver(unit,year).amendments||[]).map(n=>DATA.history.amendments.find(a=>a.number===n)).filter(Boolean);
  return list.length?`<span class="basis">依据：${list[0].year} 年${esc(CODEX.amendment)}${list.map(a=>`<button class="text-btn" data-action="amendment" data-year="${a.year}" data-number="${a.number}">${esc(a.label)}</button>`).join('、')}</span>`:'';
}
// Official drafting explanations, quoted verbatim; years without a checked source say so.
function revisionSources(unit,year){
  const R=DATA.revisionHistory;if(!R)return '';const doc=R.documents[year],points=R.points.filter(p=>p.year===year&&p.units.includes(unit.id));
  if(!doc)return '';
  if(doc.status!=='已核对原文')return `<p class="revision-source pending">修宪史料：${esc(doc.note)}<span class="pill">待核</span></p>`;
  const cite=`${esc(doc.speaker.replace(/\s+/g,''))}：${esc(doc.title)}（${esc(doc.occasion)}）`;
  return `<details class="revision-source"${points.length?'':' data-general'}><summary><span class="pill">修宪史料</span>${points.length?`草案说明中关于本条的${points.length>1?` ${points.length} 段`:'一段'}`:'草案说明（未单独说明本条）'}</summary>${points.map(p=>`<blockquote>${p.text.split('\n').map(s=>`<p>${esc(s)}</p>`).join('')}</blockquote>`).join('')}<p class="source-line">${cite}，${esc(doc.source)}。<a href="${esc(doc.url)}" target="_blank" rel="noopener">查看全文</a> · 已核对原文</p>${points.length?`<button class="text-btn" data-action="revision-source-save" data-unit="${unit.id}" data-year="${year}">收入本条材料</button>`:''}</details>`;
}
function revisionYears(unit){return M.years.filter(y=>['changed','number'].includes(versionStatus(unit,y).kind));}
function comparisonColumns(unit,year){
  const index=M.years.indexOf(year),v=ver(unit,year),prior=index?ver(unit,M.years[index-1]):null;
  const rows=M.comparisonRows(unit.id,year),filtered=ui.revisionFocus&&rows.some(r=>r.changed)?rows.filter(r=>r.changed):rows;
  const piece=op=>{const text=esc(op.text).replace(/\n/g,'<br><span class="para-indent"></span>');return !ui.changes||op.type==='equal'?text:op.type==='delete'?op.text==='\n'?`<del class="para-join" title="修正后与下段合并">¶</del>${text}`:`<del>${text}</del>`:`<ins>${text}</ins>`;};
  const cell=(p,side)=>p?p.parts.map(piece).join(''):`<span class="absent-paragraph">${side==='before'?'本次新增':'本次删除'}</span>`;
  const rowHtml=filtered.map(r=>`<div class="comparison-row"><div class="law-text comparison-text">${cell(r.before,'before')}</div><div class="law-text comparison-text">${cell(r.after,'after')}${r.note?`<span class="row-note">${r.note}</span>`:''}</div></div>`).join('');
  const changes=v.diff.filter(op=>['insert','delete'].includes(op.type)),adds=changes.filter(x=>x.type==='insert').map(x=>x.text).join('').replace(/\s/g,'').length,dels=changes.filter(x=>x.type==='delete').map(x=>x.text).join('').replace(/\s/g,'').length;
  const rest=rows.filter(r=>!filtered.includes(r)),items=rest.filter(r=>ITEM_MARK.test((r.after||r.before).parts.map(op=>op.text).join(''))).length,clauses=rest.length-items;
  const restText=unit.kind==='preamble'?`${rest.length} 处`:[clauses?`${clauses} 款`:'',items?`${items} 项`:''].filter(Boolean).join('、');
  return `<div class="revision-caption"><div><strong>${year} 年修正</strong><span>${versionStatus(unit,year).short}${adds||dels?` · 增 ${adds} 字，删 ${dels} 字`:''}</span>${amendmentBasis(unit,year)}</div><button class="text-btn" data-action="revision-material" data-unit="${unit.id}" data-year="${year}">收录背景材料</button></div>${revisionSources(unit,year)}<div class="comparison-table ${ui.changes?'with-marks':''}"><div class="comparison-table-head"><div><strong>修正前</strong><small>${prior?.exists?`${M.years[index-1]===FIRST?FIRST+' 年原文':M.years[index-1]+' 年文本'} · ${esc(prior.label)}`:'此前尚无此条'}</small></div><div><strong>修正后</strong><small>${year} 年文本 · ${esc(v.label)}</small></div></div>${rowHtml}</div>${rest.length?`<p class="unchanged-count">其余 ${restText}未修改。<button class="text-btn" data-action="revision-full">一并显示</button></p>`:''}<div class="revision-links"><button class="text-btn" data-action="read-year" data-unit="${unit.id}" data-year="${year}">阅读 ${year} 年修正后的全文 →</button></div>`;
}
function versionTimeline(unit){
  const changed=revisionYears(unit),year=M.years.includes(ui.revisionYear)?ui.revisionYear:changed.at(-1)||LATEST,status=versionStatus(unit,year);
  return `<div class="amendment-years" role="group" aria-label="选择修正年份">${M.years.map(y=>{const s=versionStatus(unit,y);return `<button class="${year===y?'active':''} ${s.kind} yr-${y}" data-action="revision-year" data-year="${y}" aria-pressed="${year===y}" title="${y} 年：${esc(s.short)}"><strong>${y}</strong><span>${s.short}</span></button>`;}).join('')}</div><p class="amendment-legend">${year} 年：${esc(status.short)}</p>${['changed','number'].includes(status.kind)?comparisonColumns(unit,year):`<div class="revision-quiet"><h3>${status.kind==='origin'?`${year} 年${esc(CODEX.short)}原文`:status.kind==='absent'?`${year} 年${esc(CODEX.short)}尚无此条`:`${year} 年修正未涉及本条`}</h3><p>${esc(status.long)}</p>${ver(unit,year).exists?paraList(ver(unit,year).paragraphs,'law-text'):''}</div>`}`;
}
function versionCombined(unit){
  const years=revisionYears(unit);
  return `<div class="revision-overview"><div class="revision-overview-heading"><span>${FIRST}—${LATEST}</span><strong>${years.length?`${years.length} 次修正涉及本条`:'历次修正均未涉及本条'}</strong></div>${years.length?years.map((year,i)=>`<section class="revision-chapter"><div class="revision-chapter-number"><span>${cnNumber(i+1)}</span><h3>${year}</h3></div><div>${comparisonColumns(unit,year)}</div></section>`).join(''):paraList(ver(unit,LATEST).paragraphs,'law-text')}<details class="source-note original-fold"><summary>查看 ${FIRST} 年原文</summary>${ver(unit,FIRST).exists?paraList(ver(unit,FIRST).paragraphs,'law-text'):`${FIRST} 年${esc(CODEX.short)}尚无此条。`}</details></div>`;
}
function welcomeCard(){
  return state.preferences.welcomed?'':`<section class="welcome-card" aria-label="开始使用"><p class="welcome-motto">法解释的方法，就是法律人的学习方法。</p><p>${esc(CODEX.welcome.body)}</p><p class="welcome-note">不要外包思考和学习。助手可以提供线索，判断由自己作出。</p><p class="welcome-principles">软件按六个原则构建：个性化、智能化、可塑性、可扩展、去中心化、本地化。笔记存在自己的设备上，软件也可以自己改造。<button class="text-btn" data-action="guide-own">了解</button></p><div class="row wrap"><button class="btn primary" data-action="welcome-start">${esc(CODEX.welcome.startLabel)}</button><button class="btn" data-action="nav" data-view="guide">先看使用说明</button><button class="text-btn" data-action="welcome-dismiss">不再显示</button></div></section>`;
}
function renderReader(){
  const a=current(),v=ver(a),c=chapter(a),sequence=M.sequence(state.year),index=sequence.indexOf(a.id),status=versionStatus(a,state.year);
  const mode=!ui.history?'text':ui.historyView==='combined'?'combined':'history',gist=shortTitle(a),count=state.notes.filter(n=>n.unitId===a.id).length;
  const prev=sequence[index-1],next=sequence[index+1],name=id=>esc(ver(M.get(id)).label);
  return `<div class="reader-head"><nav class="breadcrumb" aria-label="当前位置"><span>${esc(CODEX.name)}</span>${M.path(a.id,state.year).map(n=>`<span class="sep">/</span><span>${esc(n.depth?n.name:n.title)}</span>`).join('')}</nav><button class="btn small" data-action="toc">${icon('list')}目录</button></div><div class="reader-grid ${ui.history?'revision-reader':''}"><section class="reader-main"><article class="reading-paper" id="reader-card"><header class="article-head"><div class="article-title"><h2><span class="article-label">${esc(v.exists?v.label:a.label)}</span>${gist?`<span class="article-gist" title="条旨是个人概括，按 ${M.years.at(-1)} 年文本拟定，不属于${esc(CODEX.short)}原文">【${esc(gist)}】</span>`:''}</h2><button class="icon-btn subtle" data-action="edit-subtitle" data-unit="${a.id}" title="修改条旨" aria-label="修改条旨">${icon('edit')}</button></div><div class="article-tools"><button class="btn small" data-action="cite" ${!v.exists?'disabled':''}>${icon('copy')}引用</button><button class="btn small" data-action="memorize-unit" data-unit="${a.id}" data-year="${state.year}">${icon('cards')}记忆卡片</button><button class="icon-btn ${isBookmarked(a.id)?'active':''}" data-action="bookmark" data-unit="${a.id}" title="${isBookmarked(a.id)?'取消收藏':'收藏'}" aria-label="收藏" aria-pressed="${isBookmarked(a.id)}">${icon('bookmark')}</button><button class="icon-btn" data-action="share" title="共享讨论" aria-label="共享讨论">${icon('share')}</button></div></header><div class="reader-tools"><div class="segmented" role="group" aria-label="阅读方式">${[['text','正文'],...(M.years.length>1?[['history','修正对照'],['combined','历次修正']]:[])].map(([key,text])=>`<button data-action="text-mode" data-mode="${key}" class="${mode===key?'active':''}" aria-pressed="${mode===key}">${text}</button>`).join('')}</div>${!ui.history?`<div class="row"><label><span class="sr-only">文本年份</span><select id="reader-year">${readerYearOptions(a)}</select></label><button class="btn small ${ui.words?'accent':''}" data-action="toggle-words" aria-pressed="${ui.words}" ${!v.exists?'disabled':''}>${ui.words?'结束选词':'选词'}</button>${englishToggle(v)}</div>`:`<div class="row"><label class="check small"><input id="revision-focus" type="checkbox" ${ui.revisionFocus?'checked':''}>只看修改之处</label><button class="btn small" data-action="toggle-changes" aria-pressed="${ui.changes}">${ui.changes?'隐藏增删标记':'显示增删标记'}</button></div>`}</div>${!ui.history?`<p class="version-status ${status.kind}"><span class="status-tag">${status.short}</span><span>${esc(status.long)}${v.exists&&v.label!==a.label?`${LATEST} 年文本为${esc(a.label)}。`:''}</span>${amendmentBasis(a,state.year)}</p>`:''}<div class="law-content ${ui.history?'revision-content':'reader-scroll'}" data-scroll-key="reader-${a.id}-${state.year}-${ui.history}">${ui.words?'<p class="selection-hint">点选词语，相邻的词会合并；也可以结束选词，直接拖选。</p>':''}${ui.history?(mode==='combined'?versionCombined(a):versionTimeline(a)):versionBody(a,state.year)}</div><footer class="reading-footer"><button class="text-btn" data-action="mark-read">${state.read.includes(a.id)?`${icon('check')}已读`:'标为已读'}</button><button class="text-btn" data-action="new-link">${icon('link')}建立关联</button></footer></article><section class="reader-notes"><div class="marginalia-head"><h3>随文笔记${count?`<span class="count">${count}</span>`:''}</h3>${noteDisplayControl()}</div>${notesBelow(a,state.preferences.noteMode,true)}</section><nav class="reader-pager" aria-label="翻阅">${ui.readMode==='random'?'<span></span>':`<button data-action="reader-prev" ${!prev?'disabled':''}>${icon('left')}<span>${prev?name(prev):'已是开头'}</span></button>`}<select id="reader-order" aria-label="阅读顺序"><option value="sequence" ${ui.readMode==='sequence'?'selected':''}>顺序</option><option value="random" ${ui.readMode==='random'?'selected':''}>随机</option></select><button data-action="reader-next" ${ui.readMode==='sequence'&&!next?'disabled':''}><span>${ui.readMode==='random'?'随机换一条':next?name(next):'已是最后'}</span>${icon('right')}</button></nav></section>${!ui.history?`<aside class="rail" aria-label="笔记、关联与材料"><div class="rail-tabs" role="tablist">${[['mine','笔记'],['links','关联'],['materials','材料']].map(([key,text])=>`<button role="tab" aria-selected="${ui.rail===key}" data-action="rail" data-tab="${key}" class="${ui.rail===key?'active':''}">${text}</button>`).join('')}</div><div class="rail-body">${renderRail(a)}</div></aside>`:''}</div>`;
}

function feedPool(){return M.units.filter(u=>ver(u).exists&&(ui.feedPool==='all'||ui.feedPool==='bookmarks'&&isBookmarked(u.id)||ui.feedPool==='review'&&state.memoryCards[u.id+'@'+state.year]&&M.card(state,u.id,state.year).due<=Date.now()||M.node(ui.feedPool,state.year)?.unitIds.includes(u.id))).map(u=>u.id);}
function renderPractice(){
  const a=M.get(ui.feedId),v=a?ver(a):null,c=a?M.card(state,a.id,state.year):null,due=Object.values(state.memoryCards).filter(c=>c.year===state.year&&c.due<=Date.now()).length;
  const keywordMode=c?.mode==='keywords'&&c.keywords.length;
  return `${pageHead('记忆卡片','先回忆原文，再核对；按回忆的情况安排下次复习。',`<span class="pill">待复习 ${due}</span><button class="btn" data-action="feed-read">返回法条精读</button>`)}<div class="practice-layout"><section>${a&&feedPool().length?`<article class="memory-card" id="practice-card"><header><span>${esc(chapter(a).title)} · ${state.year}</span><span class="pill">${keywordMode?'关键词填空':'整条回忆'}</span></header><div class="memory-body"><span class="article-label">${esc(v.label)}</span><h2>${esc(shortTitle(a))}</h2>${ui.revealed||keywordMode?`<div class="law-text memory-text" data-swipe="feed">${v.paragraphs.map(p=>`<p>${M.cloze(p,keywordMode?c.keywords:[]).map(part=>part.hidden&&!ui.revealed?`<button class="cloze-blank" data-action="reveal-cloze" aria-label="显示这个关键词">${'＿'.repeat(Math.min(6,Math.max(2,part.text.length)))}</button>`:part.hidden?`<mark class="memory-keyword">${esc(part.text)}</mark>`:esc(part.text)).join('')}</p>`).join('')}</div>`:`<div class="memory-prompt"><h3>试着回忆这一条的原文</h3><p>可以先说出主体、事项和程序，再核对完整的表述。</p></div>`}<div class="memory-reveal">${!ui.revealed?'<button class="btn primary" data-action="reveal">查看完整答案</button>':'<span class="small muted">已显示原文。按这次回忆的实际情况选择。</span>'}</div></div><footer class="memory-ratings">${[['again','忘记了','1 分钟后'],['hard','有点难','至少 1 天后'],['good','记住了','逐次延长'],['easy','很熟悉','至少 4 天后']].map(([r,t,h])=>`<button data-action="memory-rate" data-rating="${r}" ${!ui.revealed?'disabled':''}><strong>${t}</strong><small>${h}</small></button>`).join('')}</footer></article><div class="practice-controls"><button class="btn" data-action="feed-prev">上一张</button><button class="text-btn" data-action="feed-read">回到条文</button><button class="btn" data-action="feed-next">下一张</button></div>`:'<div class="big-empty"><h3>这个范围没有需要复习的条文</h3><p>换一个范围，或等到下次复习时间。</p></div>'}</section><aside class="practice-side"><h3>顺序</h3><select id="feed-mode" aria-label="复习顺序"><option value="sequence" ${ui.feedMode==='sequence'?'selected':''}>按条文顺序</option><option value="random" ${ui.feedMode==='random'?'selected':''}>随机</option></select><h3>范围</h3><select id="feed-pool" aria-label="复习范围">${[['all',CODEX.whole],...M.tree(state.year).roots.map(n=>[n.id,n.name]),['bookmarks','我的收藏'],['review','到期复习']].map(([id,t])=>`<option value="${id}" ${ui.feedPool===id?'selected':''}>${t}</option>`).join('')}</select><h3>文本年份</h3><select id="feed-year" aria-label="文本年份">${yearOptions()}</select><div class="rule"></div><h3>关键词</h3><p>${c?.keywords.length?c.keywords.map(x=>`<span class="method-tag">${esc(x)}</span>`).join(''):'选出容易混淆的主体、条件、期限或程序用语。'}</p>${a?`<button class="btn" data-action="memory-edit" data-unit="${a.id}">设定关键词</button>`:''}<p class="note-source">不同年份的文本分别记录复习进度。</p></aside></div>`;
};
function editMemory(unitId,selection=[]){
  const unit=M.get(unitId),c=M.card(state,unitId,state.year);
  const words=[...new Set([...c.keywords,...selection.filter(a=>a.unitId===unitId).map(a=>a.quote)])];
  showModal('设定记忆卡片',`<form id="memory-form" data-unit="${unitId}"><p>${esc(label(unit))} · ${state.year} 年</p><label for="memory-kind">回忆方式</label><select id="memory-kind" name="mode"><option value="whole" ${c.mode==='whole'&&!selection.length?'selected':''}>整条回忆</option><option value="keywords" ${c.mode==='keywords'||selection.length?'selected':''}>隐藏关键词，填空回忆</option></select><label for="memory-words">关键词或短语，每行一个</label><textarea id="memory-words" name="keywords" rows="5" placeholder="填写原文中的词语；下方可点选补入。">${esc(words.join('\n'))}</textarea><details open class="keyword-picker"><summary>从原文选择关键词</summary>${ver(unit).paragraphs.map(p=>`<p>${M.tokenize(p).map(t=>t.word?`<button type="button" data-action="memory-keyword" data-word="${esc(t.text)}">${esc(t.text)}</button>`:esc(t.text)).join('')}</p>`).join('')}</details><p class="note-source">同一词语在本条中出现的位置都会隐去。也可以手动填写完整短语。</p><div class="modal-actions"><button type="submit" class="btn primary">保存</button></div></form>`);
}
function renderGuide(){
  const entries=M.guideEntries(state),intro=entries.find(e=>e.key==='intro'),bottom=entries.find(e=>e.key==='bottom'),steps=entries.filter(e=>e.key.startsWith('step')),tips=entries.filter(e=>e.key.startsWith('tip-')),own=entries.filter(e=>e.key.startsWith('own-')),ownTitle=DATA.guide?.partOwn||'三、改造这本笔记';
  const edit=e=>`<button class="text-btn guide-edit" data-action="guide-edit" data-id="${esc(e.key)}" aria-label="编辑：${esc(e.title)}">编辑</button>`;
  const prose=text=>esc(text||'').split('\n').filter(x=>x.trim()).map(x=>/^\s*[-－•]\s*/.test(x)?`<li>${x.replace(/^\s*[-－•]\s*/,'')}</li>`:`<p>${x}</p>`).join('').replace(/(?:<li>.*?<\/li>)+/g,list=>`<ul class="guide-list">${list}</ul>`);
  return `<div class="guide-page"><header class="guide-hero"><span class="guide-kicker">使用说明</span><h2>${esc(intro.title)}</h2><div class="guide-lead">${prose(intro.body)}</div>${edit(intro)}</header><div class="guide-layout"><nav class="guide-toc" aria-label="本页目录"><a href="#guide-steps">一、研读${cnNumber(steps.length)}步</a>${steps.map((step,i)=>`<a href="#guide-${esc(step.key)}" class="sub">${i+1}. ${esc(step.title)}</a>`).join('')}<a href="#guide-tips">二、操作提示</a>${own.length?`<a href="#guide-own">${esc(ownTitle)}</a>${own.map(e=>`<a href="#guide-${esc(e.key)}" class="sub">${esc(e.title)}</a>`).join('')}`:''}</nav><div class="guide-content"><section id="guide-steps"><h3 class="guide-part">一、研读${cnNumber(steps.length)}步</h3><ol class="guide-steps">${steps.map((step,i)=>`<li class="guide-step" id="guide-${esc(step.key)}"><span class="guide-number">${i+1}</span><div><div class="guide-step-head"><h4>${esc(step.title)}</h4>${edit(step)}</div><div class="guide-prose">${prose(step.body)}</div>${step.example?`<div class="guide-example"><span>以条文为例</span>${prose(step.example)}</div>`:''}${step.unitId?`<button class="text-btn guide-go" data-action="guide-practice" data-step="${esc(step.key)}">${esc(step.action||'前往条文')} →</button>`:''}</div></li>`).join('')}</ol><div class="guide-bottom"><div class="guide-step-head"><h4>${esc(bottom.title)}</h4>${edit(bottom)}</div><div class="guide-prose">${prose(bottom.body)}</div></div></section><section id="guide-tips"><div class="guide-part-head"><h3 class="guide-part">二、操作提示</h3><button class="btn small" data-action="guide-add">${icon('plus')}新增提示</button></div><div class="guide-tips">${tips.map(e=>`<article class="guide-tip"><div class="guide-step-head"><h4>${esc(e.title)}</h4>${edit(e)}</div><div class="guide-prose">${prose(e.body)}</div>${e.unitId&&M.get(e.unitId)?`<button class="text-btn" data-action="goto" data-unit="${esc(e.unitId)}">前往${esc(M.get(e.unitId).label)} →</button>`:''}</article>`).join('')}</div><p class="note-source">每一项都可以修改，也可以新增提示。修改保存在自己的笔记里，随备份带走。</p></section>${own.length?`<section id="guide-own"><h3 class="guide-part">${esc(ownTitle)}</h3>${own.map(e=>`<article class="guide-own ${e.key==='own-intro'?'guide-principles':'guide-tip'}" id="guide-${esc(e.key)}"><div class="guide-step-head"><h4>${esc(e.title)}</h4>${edit(e)}</div><div class="guide-prose">${prose(e.body)}</div></article>`).join('')}</section>`:''}</div></div></div>`;
}
function editGuide(key){
  const entry=M.guideEntries(state).find(e=>e.key===key)||{title:'',body:''};
  const history=state.guideHistory[key]||[];
  showModal(key?'编辑说明':'新增提示',`<form id="guide-form" data-id="${esc(key||'tip-'+uid())}"><label for="guide-title">标题</label><input id="guide-title" name="title" required maxlength="120" value="${esc(entry.title)}"><label for="guide-body">正文（每行一段；以“- ”开头的行排成列表）</label><textarea id="guide-body" name="body" required maxlength="12000" rows="6">${esc(entry.body)}</textarea>${key?.startsWith('step')?`<label for="guide-example">条文示例</label><textarea id="guide-example" name="example" maxlength="6000" rows="4">${esc(entry.example||'')}</textarea><label for="guide-action">按钮文字</label><input id="guide-action" name="action" maxlength="120" value="${esc(entry.action||'')}">`:''}${key==='intro'||key==='bottom'?'':`<label for="guide-unit">关联条文（选填，按 ${LATEST} 年文本）</label><select id="guide-unit" name="unitId"><option value="" ${!entry.unitId?'selected':''}>不关联条文</option>${unitOptions(entry.unitId||'',LATEST)}</select>`}${history.length?`<details class="source-note"><summary>此前的版本（${history.length}）</summary>${history.map(e=>`<article><strong>${esc(e.title)}</strong><p class="guide-prose">${esc(e.body)}</p>${e.example?`<p>${esc(e.example)}</p>`:''}<small>${date(e.updatedAt)}</small></article>`).join('')}</details>`:''}<p class="note-source">修改保存在自己的笔记里；合并备份时，不同的修改都会保留。</p><div class="modal-actions"><button class="btn primary" type="submit">保存说明</button></div></form>`);
}

async function api(path,body){
  if(!service.connected&&path!=='session')throw Error(serviceFreeEdition()?serviceFreeEdition()+'不连接本机服务。上传附件、智能辅助和目录备份，请在电脑上使用 PC&Mac 通用版，并用其中的启动文件打开。':'本机服务未连接。请双击文件夹中的启动程序（Mac 为 .command 文件，Windows 为 .bat 文件）。');
  const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Fadian-Token':service.token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok){const error=Error(value.error||'本机操作失败');error.status=response.status;error.data=value.data;throw error;}return value;
}
async function refreshService(){
  if(!service.connected)return;
  const [status,files,proposals,backups]=await Promise.all(['status','attachments','proposals','backups'].map(x=>api(x)));
  Object.assign(service,{status,files,proposals,backups});
}
let saveTimer;
const browserPersist=persist;
persist=function(){browserPersist();try{localStorage.setItem(KEY+'-dirty','1');}catch{}if(!unreadableBackup&&service.connected){service.pending=true;clearTimeout(saveTimer);saveTimer=setTimeout(saveToService,650);}};
async function saveToService(){
  if(service.saving||!service.connected||unreadableBackup)return;
  service.saving=true;
  try{
    while(service.pending){
      service.pending=false;
      M.validate(state);
      const snapshot=JSON.parse(JSON.stringify(state));
      try{const saved=await api('snapshot',{revision:service.revision,state:snapshot,markdown:typeof fullMarkdown==='function'?fullMarkdown():undefined});service.revision=saved.revision;service.error='';try{localStorage.setItem(KEY+'-revision',String(saved.revision));localStorage.setItem(KEY+'-saved-at',saved.savedAt||'');if(JSON.stringify(state)===JSON.stringify(snapshot))localStorage.setItem(KEY+'-dirty','0');}catch{}}
      catch(error){
        if(error.status===409&&error.data?.state){
          const merged=M.merge(state,error.data.state);state=merged.state;service.revision=error.data.revision;browserPersist();service.pending=true;
          if(merged.conflicts)toast('另一窗口有不同记录，已另行保留，请在笔记中核对。');
        }else throw error;
      }
    }
  }catch(error){service.error=error.message;toast('本机文件保存未完成：'+error.message);}
  finally{service.saving=false;const el=document.querySelector('.save-state');if(el)el.innerHTML=`<span class="dot ${service.error?'off':''}"></span>${service.error?'本机文件未保存 · 请导出备份':storageAvailable?'已保存在浏览器和本机':'已存本机 · 浏览器保存失败'}`;}
}
async function withServiceTask(title,operation){
  if(service.busy){toast('当前正在'+service.busy+'，请稍候。');return;}
  service.busy=title;service.error='';render();
  try{await operation();}
  catch(error){service.error=error.message;toast(error.message);}
  finally{try{await refreshService();}catch(error){service.error=service.error||error.message;}service.busy='';render();}
}
function connectionNotice(){return service.connected?'':serviceFreeEdition()?`<div class="hint-panel"><strong>${serviceFreeEdition()}不连接本机服务</strong><p>阅读、笔记和记忆卡片照常可用，笔记可以导出 JSON 后在其他设备合并。上传附件、使用智能辅助或备份到目录，请在电脑上使用 PC&Mac 通用版，并用其中的启动文件打开。</p></div>`:`<div class="hint-panel"><strong>本机服务未连接</strong><p>阅读、笔记和记忆卡片照常可用。上传附件、使用智能辅助或备份到目录，需要先双击文件夹中的启动程序：Mac 为 .command 文件，Windows 为 .bat 文件。</p></div>`;}
function renderAI(){
  const status=service.status,c=status?.config||{},activity=status?.activity||{};
  return `${pageHead('智能辅助','围绕选定的范围整理材料，关注新的资料。',`<button class="btn primary" data-action="relation-import">前往新知导入</button>`)}<div class="ai-workbench"><div><h3>从一份材料开始</h3><p>先选定${esc(CODEX.whole)}、某次修正案或若干条文，再请助手提出待核的关联建议。</p></div><button class="btn" data-action="relation-candidates">审阅建议（${service.proposals.filter(p=>p.status==='pending').length}）</button></div>${connectionNotice()}${service.error?`<p class="service-error" role="alert">${esc(service.error)}</p>`:''}${service.busy?`<p class="service-progress" role="status">正在${esc(service.busy)}…</p>`:''}<form id="ai-settings-form" class="settings-grid"><section class="settings-card"><h3>模型接口</h3><p>分析选定的材料，提出与条文关联的候选笔记。原文摘录与模型整理的内容分开保存。</p><div class="connection-badge"><span class="dot ${status?.aiConnected?'':'off'}"></span>${status?.aiConnected?'密钥已设置 · 以实际分析结果检验连接':'未连接模型'}</div><label for="ai-base">模型服务地址（兼容 Chat Completions）</label><input id="ai-base" name="baseUrl" type="url" required value="${esc(c.baseUrl||'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"><label for="ai-model">模型名称</label><input id="ai-model" name="model" value="${esc(c.model||'')}" placeholder="按服务商控制台填写"><label for="ai-key">API Key</label><input id="ai-key" name="apiKey" type="password" autocomplete="off" placeholder="${status?.aiConnected?'已设置；留空则保持不变':'只保存在本次运行的服务中'}"><label class="check"><input name="clearApiKey" type="checkbox">清除已设置的模型密钥</label><label class="check"><input name="autoAnalyzeUploads" type="checkbox" ${c.autoAnalyzeUploads?'checked':''}>上传后按${esc(CODEX.whole)}自动提出关联建议</label><p class="note-source">材料会发送给所选服务商，按其接口用量计费。密钥不写入笔记、备份或网盘；停止本机服务后需重新填写。<a href="https://api-docs.deepseek.com/zh-cn/" target="_blank" rel="noopener">DeepSeek 官方文档 ↗</a></p></section><section class="settings-card"><h3>联网检索</h3><p>检索近一周的资料，保存能取得的网页正文或 PDF，再形成待核的候选笔记。</p><div class="connection-badge"><span class="dot ${status?.searchConnected?'':'off'}"></span>${status?.searchConnected?'搜索密钥已设置':'未连接联网检索'}</div><label for="search-api">博查 Web Search 地址</label><input id="search-api" name="searchUrl" type="url" required value="${esc(c.searchUrl||'https://api.bocha.cn/v1/web-search')}"><label for="search-key">搜索 API Key</label><input id="search-key" name="searchKey" type="password" autocomplete="off" placeholder="与模型密钥分别设置"><label class="check"><input name="clearSearchKey" type="checkbox">清除已设置的搜索密钥</label><label for="search-query">关注主题</label><input id="search-query" name="query" value="${esc(c.query||CODEX.searchQuery)}"><label for="search-frequency">定期检索</label><select id="search-frequency" name="searchHours">${[[0,'手动检索'],[6,'每 6 小时'],[24,'每天'],[168,'每周']].map(([v,t])=>`<option value="${v}" ${Number(c.searchHours||0)===v?'selected':''}>${t}</option>`).join('')}</select><label class="check"><input name="autoAnalyze" type="checkbox" ${c.autoAnalyze?'checked':''}>自动分析新检索材料与条文的关联</label><p class="note-source">每次最多保存 5 个新来源。取不到全文时标为“搜索摘要”。只有本机服务运行、密钥有效时，定期检索才会执行。</p><button type="button" class="btn" data-action="search-now" ${!service.connected||service.busy?'disabled':''}>立即检索（使用已保存设置）</button></section><div class="settings-submit"><button type="submit" class="btn primary" ${!service.connected?'disabled':''}>保存设置</button><span>密钥只保存在本次运行的服务中</span></div></form>`;
}
function renderSettings(){
  const status=service.status,c=status?.config||{},activity=status?.activity||{};
  return `${pageHead('导出同步','导出自己的笔记，或把完整备份放进网盘客户端的同步目录。')}<section class="export-shortcuts"><button class="btn" data-action="export-md">${icon('note')}导出笔记（Markdown）</button><button class="btn" data-action="export-json">${icon('download')}导出数据（JSON）</button><button class="btn" data-action="data">${icon('upload')}导入与合并</button></section>${connectionNotice()}${service.error?`<p class="service-error" role="alert">${esc(service.error)}</p>`:''}${service.busy?`<p class="service-progress" role="status">正在${esc(service.busy)}…</p>`:''}<form id="settings-form" class="settings-grid sync-only"><section class="settings-card backup-settings"><h3>备份到网盘同步目录</h3><p>每次生成一个 ZIP，包含笔记、条旨、记忆卡片、讨论记录、候选笔记和全部附件。</p><label for="backup-directory">Dropbox、百度网盘等客户端的本地同步目录</label><div class="directory-input"><input id="backup-directory" name="backupDirectory" value="${esc(c.backupDirectory||'')}" placeholder="填写网盘客户端同步的文件夹绝对路径"><button type="button" class="btn" data-action="default-backup">使用默认目录</button></div><label for="backup-frequency">备份频率</label><select id="backup-frequency" name="backupMinutes">${[[0,'手动备份'],[1,'每分钟'],[5,'每 5 分钟'],[30,'每 30 分钟'],[60,'每小时'],[1440,'每天']].map(([v,t])=>`<option value="${v}" ${Number(c.backupMinutes||0)===v?'selected':''}>${t}</option>`).join('')}</select><div class="backup-status"><span class="pill">${status?.backupConfigured?'本地目录已设置':'未设置同步目录'}</span><p>${activity.backupAt?`上次写入：${esc(new Date(activity.backupAt).toLocaleString('zh-CN'))} · ${esc(activity.lastBackup)}`:'尚未生成目录备份。'}</p><p>软件只写入本地目录，是否已上传云端，请在网盘客户端确认。多台设备之间通过备份合并记录，暂不支持同时编辑。</p>${activity.error?`<p class="service-error">${esc(activity.error)}</p>`:''}</div><div class="row wrap"><button class="btn" type="button" data-action="backup-now" ${!service.connected||service.busy?'disabled':''}>立即备份</button><button class="btn" type="button" data-action="backup-list" ${!service.connected?'disabled':''}>从目录备份恢复</button></div><p class="note-source">本机服务停止时，定期备份暂停，重新启动后恢复。旧备份不会自动删除。</p></section><div class="settings-submit"><button type="submit" class="btn primary" ${!service.connected?'disabled':''}>保存同步设置</button></div></form>`;
}

const originalUpdates=renderUpdates;
const formerMaterials=renderMaterials;
renderMaterials=function(a){const html=formerMaterials(a);return html+`<div class="material-local"><button class="btn small" data-action="nav" data-view="updates">上传本地材料</button>${state.materials.filter(m=>m.unitId===a.id).map(m=>`<div class="material-file-actions">${m.attachmentId?`<button class="text-btn" data-action="file-download" data-id="${m.attachmentId}">${esc(m.attachmentName)} ↗</button>`:''}${m.sourceText?`<button class="text-btn" data-action="material-analyze" data-id="${m.id}">请助手分析这份摘记</button>`:''}</div>`).join('')}</div>`;};
const formerShowMaterial=showMaterial;
showMaterial=function(...args){formerShowMaterial(...args);const p=modal.querySelector('[data-material-hint]');if(p)p.textContent='也可以在“关联阅读 → 新知导入”上传文件，请助手把有出处的材料整理为候选笔记。';};
function showData(){showModal('导出与备份',`<p>JSON 文件保存笔记、关联、使用说明、记忆卡片和阅读设置，不含附件原文件。需要连同附件一起备份，请用“导出同步”中的目录备份。</p>${unreadableBackup!==null?'<button class="btn" data-action="export-unreadable">导出未能读取的原始记录</button>':''}<div class="backup-options"><button class="btn" data-action="export-json">${icon('download')}导出数据（JSON）</button><button class="btn" data-action="import-json">${icon('upload')}导入并合并（JSON）</button><button class="btn" data-action="export-md">${icon('note')}导出笔记（Markdown）</button><button class="btn primary" data-action="open-settings">目录备份与恢复</button></div><input type="file" accept=".json,application/json" id="import-file" hidden><p class="note-source">导入时，有差异的记录都会保留，不会互相覆盖。字句定位和复习进度保留原来的文本年份。</p>`);}
function showBackups(){showModal('从目录备份恢复',`<p class="note-source">列出当前目录中最近的 50 份备份。恢复时与现有笔记合并，有差异的记录都保留；附件按校验值核对。</p>${service.backups.map(b=>`<article class="backup-row"><div><strong>${esc(b.name)}</strong><small>${(b.size/1024).toFixed(1)} KB · ${new Date(b.modifiedAt*1000).toLocaleString('zh-CN')}</small></div><button class="btn small" data-action="restore-backup" data-name="${esc(b.name)}">合并恢复</button></article>`).join('')||'<p class="empty">目录中尚无此应用生成的 ZIP 备份。</p>'}`);}

const oldAppendMarkdown=appendWorkspaceMarkdown;
appendWorkspaceMarkdown=function(lines){oldAppendMarkdown(lines);lines.push('# 条旨','');for(const u of M.units)lines.push(`${u.label}【${shortTitle(u)}】`);lines.push('','# 记忆卡片','');for(const c of Object.values(state.memoryCards))lines.push(`## ${label(M.get(c.unitId),c.year)} · ${c.year}`,`关键词：${c.keywords.join('、')}`,`下次复习：${c.due?new Date(c.due).toLocaleString('zh-CN'):'尚未安排'}`,'');lines.push('','# 使用说明','');for(const e of M.guideEntries(state))lines.push('## '+e.title,e.body,e.example||'','');for(const n of state.notes.filter(n=>n.ai))lines.push(`智能辅助记录：${label(M.get(n.unitId),n.year)} · ${n.ai.model} · ${n.ai.verification==='reviewed'?'已核对':'待核'}`);};
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action,id=el.dataset.id;
  try{
    if(action==='notes-mode'){state.preferences.noteMode=el.dataset.mode;persist();render();}
    if(action==='focus-note'){ui.rail='mine';ui.history=false;render();document.getElementById('note-question')?.focus();}
    if(action==='edit-subtitle'){const a=M.get(el.dataset.unit);showModal('修改条旨',`<form id="subtitle-form" data-unit="${a.id}"><p>${esc(a.label)}</p><label for="subtitle-text">条旨</label><input id="subtitle-text" name="title" required maxlength="80" value="${esc(shortTitle(a))}"><p class="note-source">条旨是对本条（段）内容的个人概括，用于目录和检索，不属于${esc(CODEX.short)}原文。</p>${state.subtitleHistory[a.id]?.length?`<p class="note-source">曾用条旨：${state.subtitleHistory[a.id].map(esc).join('、')}</p>`:''}<div class="modal-actions"><button class="btn primary" type="submit">保存</button></div></form>`);}
    if(action==='guide-own'){ui.view='guide';render();document.getElementById('guide-own')?.scrollIntoView();}
    if(action==='welcome-dismiss'){state.preferences.welcomed=true;persist();render();}
    if(action==='welcome-start'){state.preferences.welcomed=true;persist();readUnit(CODEX.welcome.start,M.years.at(-1),'mine');}
    if(action==='revision-full'){ui.revisionFocus=false;render();}
    if(action==='revision-year'){ui.revisionYear=Number(el.dataset.year);render();}
    if(action==='memorize-unit'){if(el.dataset.year)state.year=Number(el.dataset.year);ui.feedId=el.dataset.unit;ui.view='practice';ui.feedPool='all';ui.feedHistory=[ui.feedId];ui.feedIndex=0;ui.revealed=false;render();}
    if(action==='memory-edit')editMemory(el.dataset.unit);
    if(action==='memory-keyword'){const input=document.getElementById('memory-words'),words=input.value.split('\n');if(!words.includes(el.dataset.word))input.value=[...words.filter(Boolean),el.dataset.word].join('\n');el.classList.add('chosen');}
    if(action==='memory-rate'&&ui.feedId&&ui.revealed){const c=M.rateCard(state,ui.feedId,state.year,el.dataset.rating);persist();feedStep(1);toast('下次复习：'+new Date(c.due).toLocaleString('zh-CN'));}
    if(action==='reveal-cloze'){ui.revealed=true;render();}
    if(action==='guide-edit')editGuide(id);
    if(action==='guide-add')editGuide();
    if(action==='guide-practice'){const step=M.guideEntries(state).find(e=>e.key===el.dataset.step);if(step.title==='比较法解释'&&M.categories().comparative){readUnit(step.unitId,LATEST,'mine');showCategoryForm('comparative');return;}readUnit(step.unitId,LATEST,'mine');if(el.dataset.step==='step3'&&step.unitId==='a33'){ui.history=true;ui.revisionYear=2004;ui.historyView='timeline';render();}else if(el.dataset.step==='step2'&&step.unitId==='a37'){ui.view='outline';ui.outlineScope='chapter:rights';render();}else document.getElementById('note-question')?.focus();}
    if(action==='verify-ai-note'){const n=state.notes.find(n=>n.id===id);if(n?.ai){n.ai.verification='reviewed';n.updatedAt=now();persist();render();}}
    if(action==='open-ai'){closeModal();ui.view='ai';render();}
    if(action==='open-settings'){closeModal();ui.view='settings';render();}
    if(action==='nav'&&['settings','updates','ai','terms'].includes(el.dataset.view)&&service.connected){const view=el.dataset.view;await refreshService();if(ui.view===view&&!modal.open&&!document.activeElement?.matches('input,textarea,select'))render();}
    if(action==='default-backup'){const input=document.getElementById('backup-directory');if(input&&service.status)input.value=service.status.defaultBackupDirectory;}
    if(action==='material-tab'){ui.materialTab=el.dataset.tab;render();}
    if(action==='upload-file')document.getElementById('material-upload')?.click();
    if(action==='file-link'){closeModal();showFileLink(id);}
    if(action==='file-analyze'){closeModal();showAnalyzeFile(id);}
    if(action==='material-analyze'){const m=state.materials.find(m=>m.id===id);showScopedAnalysis({id:m.attachmentId,name:m.title,text:m.sourceText,url:m.url},{kind:'articles',year:m.year,unitIds:[m.unitId]});}
    if(action==='file-download'){if(!service.connected)throw Error('查看原附件需要启动本机服务。');const file=service.files.find(x=>x.id===id);const response=await fetch('/api/file/'+id,{headers:{'X-Fadian-Token':service.token}});if(!response.ok)throw Error('附件未在本机找到，请先从完整 ZIP 恢复。');download(file?.name||'原附件',await response.blob(),'application/octet-stream');}
    if(action==='search-now')await withServiceTask('检索新材料',async()=>{const result=await api('search',{});toast(`已保存 ${result.added} 个新来源${result.warnings.length?'；部分来源请核对状态':''}。`);});
    if(action==='backup-now')await withServiceTask('生成完整备份',async()=>{service.pending=true;await saveToService();if(service.error)throw Error(service.error);const result=await api('backup',{});toast('已写入本地同步目录：'+result.name);});
    if(action==='backup-list'){await refreshService();showBackups();}
    if(action==='restore-backup'){closeModal();await withServiceTask('恢复备份',async()=>{const restored=await api('restore',{name:el.dataset.name}),result=M.merge(state,restored.state);state=result.state;persist();toast(`已合并 ${result.added} 条记录，另保留 ${result.conflicts} 处差异；附件已恢复。`);});}
    if(action==='review-proposal')reviewProposal(id);
    if(action==='ignore-proposal'){await api('resolve',{id,status:'ignored'});await refreshService();render();}
  }catch(error){toast(error.message);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['guide-form','subtitle-form','memory-form','settings-form','ai-settings-form'].includes(form.id))return;
  event.preventDefault();const f=Object.fromEntries(new FormData(form));
  try{
    if(form.id==='guide-form'){M.saveGuide(state,form.dataset.id,f);persist();closeModal();render();toast('使用说明已保存。');}
    if(form.id==='subtitle-form'){M.setSubtitle(state,form.dataset.unit,f.title);persist();closeModal();render();toast('条旨已保存。');}
    if(form.id==='memory-form'){const keywords=f.keywords.split('\n').filter(Boolean);if(f.mode==='keywords'&&!keywords.length)throw Error('请先选择至少一个关键词。');M.saveCard(state,form.dataset.unit,state.year,keywords,f.mode);ui.revealed=false;persist();closeModal();render();toast('记忆卡片已保存。');}
    if(form.id==='settings-form'){await api('settings',{backupDirectory:f.backupDirectory,backupMinutes:Number(f.backupMinutes)});await refreshService();render();toast('导出同步设置已保存。');}
    if(form.id==='ai-settings-form'){await api('settings',{...f,searchHours:Number(f.searchHours),autoAnalyze:!!f.autoAnalyze,autoAnalyzeUploads:!!f.autoAnalyzeUploads,clearApiKey:!!f.clearApiKey,clearSearchKey:!!f.clearSearchKey});form.querySelectorAll('input[type=password]').forEach(x=>x.value='');await refreshService();render();toast('智能辅助设置已保存。');if(ui.pendingAnalysisSource&&service.status?.aiConnected&&service.status?.config.model){const pending=ui.pendingAnalysisSource;ui.pendingAnalysisSource=null;showScopedAnalysis(pending.file,pending.scope);}}


  }catch(error){toast(error.message);}
});
document.addEventListener('change',async event=>{
  if(event.target.id==='revision-focus'){ui.revisionFocus=event.target.checked;render();return;}
  if(event.target.id!=='material-upload')return;
  const file=event.target.files[0];if(!file)return;
  await withServiceTask('保存本地附件',async()=>{
    if(file.size>16*1024*1024)throw Error('每个文件不超过 16 MB。');
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    const record=await api('upload',{name:file.name,content:btoa(binary)});ui.uploadedFile=record.id;ui.materialTab='files';toast('文件已保存。可以请助手分析，也可以自己写笔记。'+record.extraction);if(service.status?.config.autoAnalyzeUploads&&record.text){await api('analyze',{attachmentId:record.id,scope:{kind:'constitution',year:LATEST,unitIds:[]}});ui.materialTab='candidates';}
  });
});

// Revision numbers alone cannot tell this computer's last save from another computer's when the
// data folder is synced by a cloud drive, so the save time of the last snapshot this browser wrote
// or read is kept too. Same save time: the browser's copy descends from the file. Otherwise an
// untouched browser copy takes the file, and a changed one is merged with it.
function reconcileWithService(local,remote,hasLocal){
  const clean=localStorage.getItem(KEY+'-dirty')==='0',savedAt=localStorage.getItem(KEY+'-saved-at');
  const revision=savedAt?(remote.savedAt===savedAt?remote.revision:-1):Number(localStorage.getItem(KEY+'-revision')||0);
  const result=M.reconcileSnapshot(local,remote,{hasLocal,clean,revision});
  try{localStorage.setItem(KEY+'-saved-at',remote.savedAt||'');localStorage.setItem(KEY+'-revision',String(remote.revision));}catch{}
  return result;
}
async function initializeLocalService(){
  if(!['http:','https:'].includes(location.protocol)||serviceFreeEdition())return;
  try{
    const session=await api('session');service.token=session.token;service.connected=true;
    const remote=await api('snapshot');service.revision=remote.revision;
    if(remote.state&&!unreadableBackup){state=reconcileWithService(state,remote,!!initialSaved);browserPersist();}
    await refreshService();render();
    if(!unreadableBackup){service.pending=true;await saveToService();}
  }catch(error){service.connected=false;service.error=error.message;if(['settings','updates','ai','terms'].includes(ui.view))render();}
}
render();
if(!storageAvailable)setTimeout(()=>toast(storageIssue),500);
const serviceStarted=initializeLocalService();
setInterval(async()=>{
  if(!service.connected||service.busy||document.hidden)return;
  try{
    const before=JSON.stringify([service.files.length,service.proposals]);await refreshService();
    if(ui.view==='updates'&&!modal.open&&!document.activeElement?.matches('input,textarea,select')&&before!==JSON.stringify([service.files.length,service.proposals]))render();
  }catch(error){service.error=error.message;}
},30000);



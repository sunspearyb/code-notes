'use strict';
// 法权分析 and other frameworks in frameworks/<id>.json: a guided note that the reader fills in step by
// step — the “权” in the text, the relations between them, the balance, the sources. The analysis is
// stored on an ordinary note (note.analysis) tagged with the framework's method, so it is edited,
// exported, merged and listed like any other note.

const FRAMEWORK=Object.values(DATA.frameworks||{})[0]||null;
Object.assign(ui,{analysisDraft:null});

function sourceName(id){const s=FRAMEWORK.sources.find(x=>x.id===id);return s?`${s.author}：《${s.title}》，${s.journal}`:'';}
function citeLine(o){return [o,...(o.also||[])].map(c=>`${esc(sourceName(c.cite))}${c.page?`，第 ${esc(c.page)} 页`:''}`).join('；');}
function categoryName(id){return FRAMEWORK.categories.find(c=>c.id===id)?.name||'待定';}
function subjectName(id){return FRAMEWORK.subjects.find(s=>s.id===id)?.name||'待定';}

// ---------- The framework's summary, shown in the editor and the guide ----------
function frameworkSummary(open=false){
  if(!FRAMEWORK)return '';
  const cat=c=>`<div class="fw-cat"><strong>${esc(c.name)}</strong><p>${esc(c.summary)}</p><small>${citeLine(c)}</small></div>`;
  const point=(title,o)=>o?`<div class="fw-cat"><strong>${title}</strong><p>${esc(o.summary)}</p><small>${citeLine(o)}</small></div>`:'';
  return `<details class="framework-summary" ${open?'open':''}><summary>${esc(FRAMEWORK.name)}的基本范畴与要点</summary><p class="note-source">${esc(FRAMEWORK.status)}以下是论文要点的概括，引用请核对原文。</p><div class="fw-cats">${FRAMEWORK.categories.map(cat).join('')}</div>${point('区分权利与权力',FRAMEWORK.criterion)}${point('法权关系',FRAMEWORK.relations)}${point('平衡的基准',FRAMEWORK.balance)}${point('宪法',FRAMEWORK.constitution)}<h4>文献</h4><ul class="fw-sources">${FRAMEWORK.sources.map(s=>`<li>${esc(s.author)}：《${esc(s.title)}》，${esc(s.journal)}${s.pages?`，第 ${esc(s.pages)} 页`:''}。</li>`).join('')}</ul></details>`;
}

// ---------- Editor ----------
function newDraft(unit,note=null){
  const a=note?.analysis?JSON.parse(JSON.stringify(note.analysis)):{framework:FRAMEWORK.id,items:[],links:[],balance:'',basis:''};
  return {unitId:unit.id,year:note?.year||state.year,noteId:note?.id||null,question:note?.question||'',text:note?.text||'',analysis:a};
}
function itemRow(it,i){
  return `<div class="fw-item" data-item="${i}"><div class="fw-item-head"><strong>“${esc(it.quote)}”</strong><button type="button" class="text-btn muted" data-action="fw-remove-item" data-index="${i}">移除</button></div>
  <div class="form-columns"><div><label>主体</label><select data-fw-field="subject" data-index="${i}"><option value="">待定</option>${FRAMEWORK.subjects.map(s=>`<option value="${s.id}" ${it.subject===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
  <div><label>类别</label><select data-fw-field="category" data-index="${i}"><option value="">待定</option>${FRAMEWORK.categories.map(c=>`<option value="${c.id}" ${it.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div></div>
  <label>判断理由</label><textarea rows="2" data-fw-field="reason" data-index="${i}" placeholder="体现个人利益还是公共利益？以谁的财产为物质承担者？">${esc(it.reason||'')}</textarea></div>`;
}
function linkRow(l,i,items){
  const a=items.find(x=>x.id===l.from),b=items.find(x=>x.id===l.to),type=M.relationType(a,b);
  return `<div class="fw-link"><div class="fw-item-head"><strong>“${esc(a?.quote)}” — “${esc(b?.quote)}”</strong><span class="pill">${esc(type||'待定')}</span><button type="button" class="text-btn muted" data-action="fw-remove-link" data-index="${i}">移除</button></div>
  <label>外化为怎样的权利—义务或权力—义务</label><input data-fw-link="form" data-index="${i}" value="${esc(l.form||'')}">
  <label>引起这一关系产生、变更、消灭的情况</label><input data-fw-link="facts" data-index="${i}" value="${esc(l.facts||'')}"></div>`;
}
function renderAnalysisEditor(){
  const d=ui.analysisDraft,u=M.get(d.unitId),v=ver(u,d.year),a=d.analysis,steps=FRAMEWORK.steps;
  const items=a.items.map(itemRow).join('')||'<p class="small muted">在左边的条文中选中字句，点“加入”。</p>';
  const options=a.items.map(it=>`<option value="${it.id}">“${esc(it.quote)}”（${esc(categoryName(it.category))}）</option>`).join('');
  return `<form id="analysis-form" class="analysis-editor"><div class="analysis-text"><p class="small muted">${esc(label(u,d.year))} · ${d.year} 年文本。选中字句后点“加入”。</p><div class="law-text analysis-law">${v.paragraphs.map((p,i)=>`<p data-analysis-block="${i}">${esc(p)}</p>`).join('')}</div><div class="row wrap"><button type="button" class="btn small" data-action="fw-add-item">加入所选字句</button><button type="button" class="btn small" data-action="fw-copy-question">复制给助手的问题</button></div>${frameworkSummary()}</div>
  <div class="analysis-steps"><label for="fw-question">分析的问题（选填）</label><input id="fw-question" value="${esc(d.question)}" placeholder="例如：本条中有哪些权利、权力，它们是什么关系？">
  <h3><span>1</span>${esc(steps[0].title)}</h3><p class="note-source">${esc(steps[0].prompt)}</p>${items}
  <h3><span>2</span>${esc(steps[1].title)}</h3><p class="note-source">${esc(steps[1].prompt)}</p>${a.links.map((l,i)=>linkRow(l,i,a.items)).join('')}${a.items.length>1?`<div class="row wrap fw-connect"><select id="fw-from">${options}</select><span>—</span><select id="fw-to">${options}</select><button type="button" class="btn small" data-action="fw-add-link">连起来</button></div>`:''}
  <h3><span>3</span>${esc(steps[2].title)}</h3><p class="note-source">${esc(steps[2].prompt)}</p><textarea id="fw-balance" rows="3">${esc(a.balance||'')}</textarea>
  <h3><span>4</span>${esc(steps[3].title)}</h3><p class="note-source">${esc(steps[3].prompt)}</p><textarea id="fw-basis" rows="3" placeholder="如：童之伟，《法律科学》2019 年第 4 期，第 17 页">${esc(a.basis||'')}</textarea>
  <label for="fw-text">我的结论</label><textarea id="fw-text" rows="4">${esc(d.text)}</textarea>
  <div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn primary">保存分析</button></div></div></form>`;
}
function openAnalysis(unit,note=null){ui.analysisDraft=newDraft(unit,note);showModal(`${FRAMEWORK.name} · ${unitName(unit,ui.analysisDraft.year)}`,renderAnalysisEditor());modal.classList.add('wide');}
function refreshAnalysis(){const body=modal.querySelector('.analysis-editor');if(!body)return;const keep=modal.querySelector('.modal-body')?.scrollTop||0;body.outerHTML=renderAnalysisEditor();const b=modal.querySelector('.modal-body');if(b)b.scrollTop=keep;}
function readEditorInto(d){
  const q=id=>modal.querySelector('#'+id);if(!q('fw-question'))return;
  d.question=q('fw-question').value;d.text=q('fw-text').value;d.analysis.balance=q('fw-balance').value;d.analysis.basis=q('fw-basis').value;
  for(const el of modal.querySelectorAll('[data-fw-field]'))d.analysis.items[Number(el.dataset.index)][el.dataset.fwField]=el.value;
  for(const el of modal.querySelectorAll('[data-fw-link]'))d.analysis.links[Number(el.dataset.index)][el.dataset.fwLink]=el.value;
}
function selectedInAnalysis(){
  const sel=getSelection();if(!sel?.rangeCount||sel.isCollapsed)return null;
  const range=sel.getRangeAt(0),p=range.startContainer.parentElement?.closest('[data-analysis-block]');
  if(!p||p!==range.endContainer.parentElement?.closest('[data-analysis-block]'))return null;
  const pre=document.createRange();pre.selectNodeContents(p);pre.setEnd(range.startContainer,range.startOffset);
  const start=pre.toString().length,quote=range.toString();if(!quote.trim())return null;
  return {block:Number(p.dataset.analysisBlock),start,end:start+quote.length,quote};
}

// ---------- Display under the article ----------
function analysisView(n){
  const a=n.analysis;if(!a)return '';
  const side=id=>a.items.filter(it=>it.subject===id);
  const node=it=>`<span class="fw-node cat-${esc(it.category||'none')}" title="${esc(it.reason||'')}">${esc(it.quote)}<small>${esc(categoryName(it.category))}</small></span>`;
  const col=s=>`<div class="fw-col"><h5>${esc(s.name)}</h5>${side(s.id).map(node).join('')||'<span class="small muted">—</span>'}</div>`;
  const undecided=a.items.filter(it=>!it.subject);
  return `<div class="fw-view"><div class="fw-graph">${FRAMEWORK.subjects.map(col).join('')}</div>${undecided.length?`<p class="small muted">主体待定：${undecided.map(it=>esc(it.quote)).join('、')}</p>`:''}${a.links.length?`<ul class="fw-links">${a.links.map(l=>{const x=a.items.find(i=>i.id===l.from),y=a.items.find(i=>i.id===l.to);return `<li><span class="pill">${esc(M.relationType(x,y)||'关系待定')}</span>“${esc(x?.quote)}” — “${esc(y?.quote)}”${l.form?`：${esc(l.form)}`:''}${l.facts?`<small>法律事实：${esc(l.facts)}</small>`:''}</li>`;}).join('')}</ul>`:''}${a.balance?`<p><strong>配置与平衡：</strong>${esc(a.balance)}</p>`:''}${a.basis?`<p class="note-source">依据：${esc(a.basis)}</p>`:''}<button class="text-btn" data-action="fw-edit" data-id="${n.id}">修改分析</button></div>`;
}
const noteDetailsBeforeAnalysis=noteDetails;
noteDetails=function(n){return noteDetailsBeforeAnalysis(n)+(n.analysis&&FRAMEWORK?analysisView(n):'');};

// The 法权分析 button beside 引用 and 记忆卡片.
const renderReaderBeforeAnalysis=renderReader;
renderReader=function(){
  const html=renderReaderBeforeAnalysis();if(!FRAMEWORK||!ver(current()).exists)return html;
  return html.replace('<div class="article-tools">',`<div class="article-tools"><button class="btn small" data-action="fw-new" data-unit="${state.current}">${esc(FRAMEWORK.name)}</button>`);
};
// Highlight the “权” of saved analyses in the article text.
const marksBeforeAnalysis=paragraphMarks;
paragraphMarks=function(text,unitId,year,block){
  const own=marksBeforeAnalysis(text,unitId,year,block);if(!FRAMEWORK)return own;
  const found=state.notes.filter(n=>n.unitId===unitId&&n.year===year&&n.analysis).flatMap(n=>n.analysis.items.filter(it=>it.anchor?.block===block).map(it=>({start:it.anchor.start,end:it.anchor.end,className:'fw-mark cat-'+(it.category||'none'),action:'fw-edit-mark',title:`${categoryName(it.category)} · ${subjectName(it.subject)}`,noteId:n.id})));
  const free=found.filter(f=>!own.some(o=>o.start<f.end&&f.start<o.end));
  return [...own,...free.filter((f,i)=>!free.slice(0,i).some(g=>g.start<f.end&&f.start<g.end))];
};

document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');if(!el||!FRAMEWORK)return;
  const d=ui.analysisDraft;
  try{
    switch(el.dataset.action){
      case 'fw-new':openAnalysis(M.get(el.dataset.unit));break;
      case 'fw-edit':{const n=state.notes.find(n=>n.id===el.dataset.id);if(n)openAnalysis(M.get(n.unitId),n);break;}
      case 'fw-edit-mark':{const n=state.notes.find(n=>n.unitId===el.dataset.unit&&n.year===Number(el.dataset.year)&&n.analysis?.items.some(it=>it.anchor?.block===Number(el.dataset.block)&&it.anchor.start===Number(el.dataset.start)));if(n)openAnalysis(M.get(n.unitId),n);break;}
      case 'fw-add-item':{readEditorInto(d);const s=selectedInAnalysis();if(!s){toast('先在条文中选中字句。');break;}d.analysis.items.push({id:M.id().slice(0,12).replace(/[^\w-]/g,''),quote:s.quote,subject:'',category:'',reason:'',anchor:M.anchor(d.unitId,d.year,s.block,s.start,s.end)});refreshAnalysis();break;}
      case 'fw-remove-item':{readEditorInto(d);const it=d.analysis.items.splice(Number(el.dataset.index),1)[0];d.analysis.links=d.analysis.links.filter(l=>l.from!==it.id&&l.to!==it.id);refreshAnalysis();break;}
      case 'fw-add-link':{readEditorInto(d);const from=modal.querySelector('#fw-from').value,to=modal.querySelector('#fw-to').value;if(from===to){toast('请选两个不同的“权”。');break;}d.analysis.links.push({from,to,form:'',facts:''});refreshAnalysis();break;}
      case 'fw-copy-question':{
        const u=M.get(d.unitId),v=ver(u,d.year),F=FRAMEWORK;
        const text=`请按法权说帮我分析下面这一条，只提供线索，判断由我自己作出。\n\n${citeTitle(d.year,u)}${v.label}：\n${v.paragraphs.join('\n')}\n\n法权说的基本范畴（据童之伟论文概括）：\n${F.categories.map(c=>`- ${c.name}：${c.summary}`).join('\n')}\n- 区分标准：${F.criterion.summary}\n- 法权关系：${F.relations.summary}\n\n请：1. 找出条文中的“权”（权利、自由、职权、权限、义务等），说明主体（${F.subjects.map(x=>x.name).join('或')}）和类别，并说明判断理由；2. 指出它们之间是权利—权力、权利—权利还是权力—权力关系；3. 提出值得追问的问题和可以查找的材料。不确定的地方标明待核，不要编造引文和页码。`;
        copyText(text,'问题已复制，可以粘贴给助手。');break;
      }
      case 'fw-remove-link':readEditorInto(d);d.analysis.links.splice(Number(el.dataset.index),1);refreshAnalysis();break;
    }
  }catch(error){toast(error.message);}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='analysis-form')return;event.preventDefault();
  const d=ui.analysisDraft;
  try{
    readEditorInto(d);
    if(!d.analysis.items.length&&!d.text.trim())throw Error('至少加入一个“权”，或写下结论。');
    const old=d.noteId&&state.notes.find(n=>n.id===d.noteId),methods=[...new Set([...(old?.methods||[]),FRAMEWORK.method])];
    const summary=d.text.trim()||d.analysis.items.map(it=>`“${it.quote}”：${categoryName(it.category)}`).join('；');
    const n=M.addNote(state,{unitId:d.unitId,year:d.year,text:summary,question:d.question,methods,anchors:old?.anchors||[],editId:old?.id,analysis:d.analysis});
    persist();closeModal();modal.classList.remove('wide');ui.analysisDraft=null;readUnit(n.unitId,n.year,'mine');toast(`${FRAMEWORK.name}已保存。`);
  }catch(error){toast(error.message);}
});
modal.addEventListener('close',()=>modal.classList.remove('wide'));

// Markdown export: write the analysis out under its note.
const fullMarkdownBeforeAnalysis=typeof fullMarkdown==='function'?fullMarkdown:null;
if(fullMarkdownBeforeAnalysis&&FRAMEWORK)fullMarkdown=function(){
  let md=fullMarkdownBeforeAnalysis();
  for(const n of state.notes.filter(n=>n.analysis)){
    const a=n.analysis,block=[`**${FRAMEWORK.name}**`,'',...a.items.map(it=>`- “${it.quote}”：${subjectName(it.subject)}，${categoryName(it.category)}${it.reason?`。${it.reason}`:''}`),...a.links.map(l=>{const x=a.items.find(i=>i.id===l.from),y=a.items.find(i=>i.id===l.to);return `- 关系：“${x?.quote}”—“${y?.quote}”（${M.relationType(x,y)||'待定'}）${l.form?`：${l.form}`:''}${l.facts?`；法律事实：${l.facts}`:''}`;}),a.balance?`- 配置与平衡：${a.balance}`:'',a.basis?`- 依据：${a.basis}`:''].filter(Boolean).join('\n');
    const head=n.text.split('\n')[0];const at=md.indexOf(head);if(at>=0){const end=md.indexOf('\n\n',at+head.length);md=md.slice(0,end)+'\n\n'+block+md.slice(end);}
  }
  return md;
};
render();

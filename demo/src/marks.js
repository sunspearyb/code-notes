'use strict';
// 标记: highlight (three colours), underline and bold on the text itself, with nothing to write. Select
// words in 法条精读 or 体系阅读 and choose a mark; choosing it again on marked words takes it off. Marks
// sit beside notes, terms and links without touching them, and travel with the JSON backup
// (state.marks; see toggleMark in learning-model.js).
const MARK_TOOLS=[['yellow','黄色高亮','高亮'],['green','绿色高亮','高亮'],['blue','蓝色高亮','高亮'],['underline','下划线','U'],['bold','加粗','B']];
function markClass(styles){return 'mk '+styles.map(s=>'mk-'+s).join(' ');}
// Paragraph text with its marks, for pages that show the text without the reader's other annotations.
function markedText(text,unitId,year,block){
  const ranges=M.markedRanges(state,unitId,year,block);if(!ranges.length)return esc(text);
  let html='',at=0;
  for(const r of ranges){html+=esc(text.slice(at,r.start))+`<span class="${markClass(r.styles)}">${esc(text.slice(r.start,r.end))}</span>`;at=r.end;}
  return html+esc(text.slice(at));
}
function markTools(){
  return `<div class="mark-tools" role="group" aria-label="标记所选字句">${MARK_TOOLS.map(([style,name,text])=>`<button class="mark-tool mark-tool-${style}" data-action="mark" data-style="${style}" title="${name}（再点一次取消）" aria-label="${name}">${text.length===1?text:'<i></i>'}</button>`).join('')}<button class="mark-tool mark-tool-clear" data-action="mark-clear" title="清除所选字句上的全部标记" aria-label="清除标记">${icon('close')}</button></div>`;
}
// Where words can be selected for marking: the article in 法条精读, and the text of 体系阅读.
function selectableText(){
  if(modal.open||ui.words)return null;
  if(ui.view==='reader')return ui.history?null:document.getElementById('law-text');
  if(ui.view==='outline'&&!ui.outlineSelect&&ui.outlineMode==='text')return document.querySelector('.outline-document');
  return null;
}
function marksMarkdown(lines){
  if(!state.marks.length)return;
  const order=new Map(M.units.map((u,i)=>[u.id,i])),name=Object.fromEntries(MARK_TOOLS.map(([style,n])=>[style,n]));
  const list=[...state.marks].sort((a,b)=>(order.get(a.anchor.unitId)??0)-(order.get(b.anchor.unitId)??0)||a.anchor.year-b.anchor.year||a.anchor.block-b.anchor.block||a.anchor.start-b.anchor.start);
  lines.push(...list.map(m=>`- ${label(M.get(m.anchor.unitId),m.anchor.year)}（${m.anchor.year} 年文本）：“${m.anchor.quote}”（${name[m.style]}）`));
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action="mark"],[data-action="mark-clear"]');if(!el)return;
  try{
    if(el.dataset.action==='mark'){const added=M.toggleMark(state,ui.selection,el.dataset.style);persist();clearSelection();render();toast(added?'已标记。选中同样的字句再点一次，可以取消。':'已取消这处标记。');}
    else{const changed=M.clearMarks(state,ui.selection);persist();clearSelection();render();toast(changed?'已清除所选字句上的标记。':'所选字句上没有标记。');}
  }catch(error){toast(error.message);}
});

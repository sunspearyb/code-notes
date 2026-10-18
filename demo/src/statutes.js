'use strict';
// 宪法相关法 and links between codes. The data pack declares which words leave a matter to law
// (codex.delegationTerms) and may bring a list of related laws (relatedLaws, built by
// build_related.py); readers add their own records as relations of the category whose "official"
// is relatedLaws. Every article also has a fixed address (#a13, or #ref=第十三条) so that other
// codes and other notes can point to it.

const RELATED=DATA.relatedLaws||null;
const RELATED_KEY=Object.keys(M.categories()).find(k=>M.categories()[k].official==='relatedLaws')||null;
const TERMS=(CODEX.delegationTerms||[]).slice().sort((a,b)=>b.length-a.length),STRICT=new Set(CODEX.delegationStrict||[]);
const delegationPattern=TERMS.length?new RegExp(TERMS.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'):null;

function delegationsOf(unit,year=state.year){
  const v=ver(unit,year);if(!delegationPattern||!v?.exists)return [];
  return v.paragraphs.flatMap((text,block)=>[...text.matchAll(delegationPattern)].map(m=>({block,start:m.index,end:m.index+m[0].length,text:m[0],strict:STRICT.has(m[0])})));
}
paragraphMarks=function(text,unitId,year,block){
  const unit=M.get(unitId);if(!unit||!delegationPattern)return [];
  return delegationsOf(unit,year).filter(d=>d.block===block).map(d=>({...d,className:'delegation'+(d.strict?' strict':''),action:'delegation',title:d.strict?'宪法要求以法律规定的事项':'依照法律的事项'}));
};
function officialLaws(unitId){return (RELATED?.laws||[]).filter(l=>l.units.includes(unitId));}
function ownRelated(unitId,key=RELATED_KEY){return key?state.materialRelations.filter(r=>r.category===key&&r.scope.kind==='articles'&&r.scope.unitIds.includes(unitId)):[];}
// 已关联 (a law is linked), 应以法律规定 (the article says 由法律规定 but nothing is linked yet),
// 依照法律 (it refers to law in the weaker sense), or nothing.
function lawStatus(unit){
  const linked=officialLaws(unit.id).length+ownRelated(unit.id).length,d=delegationsOf(unit,state.year);
  return linked?{kind:'linked',label:'已关联立法',count:linked}:d.some(x=>x.strict)?{kind:'required',label:'宪法要求以法律规定，尚未关联'}:d.length?{kind:'delegated',label:'依照法律，尚未关联'}:{kind:'none',label:''};
}
function lawLink(l){return l.url?`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.short||l.title)}</a>`:esc(l.short||l.title);}
function relatedBlock(unit){
  const laws=officialLaws(unit.id),own=ownRelated(unit.id),cross=ownRelated(unit.id,'crosscode'),d=delegationsOf(unit,state.year);
  const tools=`<button class="text-btn" data-action="crosscode-new" data-unit="${unit.id}">关联其他法典的条文</button><button class="text-btn" data-action="copy-address" data-unit="${unit.id}">复制本条网址</button>`;
  if(!laws.length&&!own.length&&!cross.length&&!d.length)return `<p class="address-line">${tools}</p>`;
  const strict=d.filter(x=>x.strict).length;
  return `<details class="revision-source related-source" ${laws.length+own.length?'':'open'}><summary><span class="pill">${esc(M.categories()[RELATED_KEY]?.name||'相关条文')}</span>${laws.length+own.length?`关联 ${laws.length+own.length} 部法律`:RELATED_KEY?'尚未关联法律':`${cross.length} 项跨法典关联`}${d.length?` · ${strict?`${strict} 处“由法律规定”`:`${d.length} 处依照法律`}`:''}</summary>
  ${laws.length?`<p class="related-laws">${laws.map(lawLink).join('、')}</p><p class="note-source">据法工委《现行有效法律目录》“宪法相关法”，与本条的对应由 Claude 拟定${laws.every(l=>l.status==='已核对')?'，已核对':'，待核'}；只到法律为止。</p>`:''}
  ${own.length?`<p class="related-laws">${own.map(r=>r.url?`<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>`:esc(r.title)).join('、')}</p><p class="note-source">自己记录的相关法律。</p>`:''}
  ${cross.length?`<p class="related-laws">${cross.map(r=>crossButton(r)).join('、')}</p><p class="note-source">跨法典关联。</p>`:''}
  ${d.length?`<p class="note-source">条文中带下划线的字句，${strict?'“由法律规定”是宪法要求以法律规定的事项，':''}点开可以查看、查找或记录相关法律。</p>`:''}
  <div class="row wrap">${RELATED_KEY?`<button class="text-btn" data-action="related-new" data-unit="${unit.id}">记录相关法律</button>`:''}${tools}</div></details>`;
}
const versionBodyBeforeStatutes=versionBody;
versionBody=function(unit,year){return versionBodyBeforeStatutes(unit,year)+relatedBlock(unit);};

// ---------- One words-to-law phrase: what is linked, and how to look further ----------
function assistantQuestion(unit,phrase){
  const v=ver(unit);
  return `请帮我查找：${citeTitle(state.year,unit)}${v.label}中“${phrase}”所说的事项，由哪些法律作出了规定或加以实施？\n\n条文原文：\n${v.paragraphs.join('\n')}\n\n请列出法律的全称、通过和最近修改的年份，并说明它与本条的关系。只列出你能在国家法律法规数据库（flk.npc.gov.cn）核实的法律；无法核实的，请标明待核。`;
}
function showDelegation(unit,phrase,strict){
  const laws=officialLaws(unit.id),own=ownRelated(unit.id);
  showModal(`${unitName(unit)} · “${phrase}”`,`<p>${strict?'这是宪法明确要求<strong>以法律规定</strong>的事项。':'这是宪法要求<strong>依照法律</strong>行使或者保护的事项。'}哪些法律作出了规定，可以自己查找，也可以请助手帮你找；找到后记录下来，写明关系。</p>
  ${laws.length+own.length?`<h3 class="subheading">已关联的法律</h3><p class="related-laws">${[...laws.map(lawLink),...own.map(r=>r.url?`<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>`:esc(r.title))].join('、')}</p>${laws.length?'<p class="note-source">关联到本条，未必对应这一处字句；只到法律为止，具体条款请自己查看。</p>':''}`:'<p class="hint-panel">这本笔记中，本条还没有关联任何法律。这不等于没有立法。</p>'}
  <div class="modal-actions spread"><a class="btn" href="${esc(RELATED?.database?.url||'https://flk.npc.gov.cn/')}" target="_blank" rel="noopener noreferrer">到国家法律法规数据库查找</a><button class="btn" data-action="copy-question" data-unit="${unit.id}" data-phrase="${esc(phrase)}">复制给助手的问题</button><button class="btn primary" data-action="related-new" data-unit="${unit.id}">记录找到的法律</button></div>
  <p class="note-source">“复制给助手的问题”会把条文和要查找的事项写成一段话，可以粘贴给你常用的助手。助手的回答要到数据库中逐一核实。</p>`);
}

// ---------- Fixed addresses and links between codes ----------
function addressOf(unitId,codeName=null){
  const code=(DATA.codes||[]).find(c=>c.name===codeName)||null;
  const own=(DATA.codes||[]).find(c=>c.id===CODEX.id);
  const hash='#'+unitId;
  if(!code||code===own)return location.href.split('#')[0]+hash;
  return codeHref(code)+hash;
}
// Where another code's page lives: next to this page in the PC&Mac folder, or in its own folder of the website.
function codeHref(code){
  const own=(DATA.codes||[]).find(c=>c.id===CODEX.id),here=location.href.split('#')[0];
  if(serviceFreeEdition()==='网页版'){const root=here.replace(/[^/]*$/,'')+(own?.webFolder?'../':'');return root+(code.webFolder?code.webFolder+'/':'');}
  return here.replace(/[^/]*$/,'')+encodeURIComponent(code.page);
}
function findCode(name){const q=String(name||'').replace(/[《》\s]/g,'');return (DATA.codes||[]).find(c=>[c.short,c.fullName,...(c.aliases||[])].some(n=>n&&(q===n||q.includes(n)||n.includes(q))));}
function crossButton(r){
  const code=findCode(r.details?.code),label=`${r.details?.code||''}${r.details?.article||''}`||r.title;
  if(code&&code.id!==CODEX.id&&!SHELL)return `<a href="${esc(codeHref(code)+'#ref='+encodeURIComponent(r.details?.article||''))}">${esc(label)}</a>`;
  if(code&&code.id===CODEX.id){const id=resolveReference(r.details?.article||'');if(id)return `<button class="text-btn" data-action="goto" data-unit="${id}">${esc(label)}</button>`;}
  return r.url?`<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:esc(label);
}
function openFromAddress(){
  const hash=decodeURIComponent(location.hash.slice(1));if(!hash)return;
  const id=hash.startsWith('ref=')?resolveReference(hash.slice(4)):M.get(hash)?hash:null;
  if(id&&id!==state.current||id&&ui.view!=='reader'){const year=M.get(id).versions[state.year]?.exists?state.year:LATEST;readUnit(id,year,'mine');}
}
const readUnitBeforeAddress=readUnit;
readUnit=function(id,...rest){readUnitBeforeAddress(id,...rest);if(M.get(id)&&location.hash!=='#'+id){try{history.replaceState(null,'','#'+id);}catch{}}};
addEventListener('hashchange',openFromAddress);

// ---------- 立法实施 view in 体系阅读 ----------
function lawStatusLine(u){
  const s=lawStatus(u);if(s.kind==='none')return '';
  const laws=[...officialLaws(u.id).map(lawLink),...ownRelated(u.id).map(r=>esc(r.title))];
  return `<div class="law-status ${s.kind}"><span class="pill">${esc(s.label)}</span>${laws.length?`<span>${laws.join('、')}</span>`:''}</div>`;
}
function lawStatusSummary(units){
  const counts={linked:0,required:0,delegated:0};for(const u of units){const k=lawStatus(u).kind;if(k in counts)counts[k]++;}
  return `<div class="law-summary"><span class="linked">已关联立法 ${counts.linked} 条</span><span class="required">要求以法律规定、尚未关联 ${counts.required} 条</span><span class="delegated">依照法律、尚未关联 ${counts.delegated} 条</span><span>共 ${units.length} 条</span></div><p class="note-source">“尚未关联”只说明这本笔记还没有记录，不等于没有立法。</p>`;
}

// ---------- 关联阅读 → 宪法相关法 ----------
const categoryPageBeforeStatutes=renderCategoryPage;
renderCategoryPage=function(key){
  if(key!==RELATED_KEY||!RELATED)return categoryPageBeforeStatutes(key);
  const records=categoryRecords(key),order=new Map(M.units.map((u,i)=>[u.id,i]));
  const lawCard=l=>`<article class="related-law" data-search-text="${esc(l.title+' '+l.units.map(id=>unitName(M.get(id))).join(' ')+' '+l.note)}"><h4>${lawLink(l)}<small>${esc(l.history.join('，'))}</small></h4>${l.note?`<p>${esc(l.note)}</p>`:''}<div class="row wrap">${[...l.units].sort((a,b)=>order.get(a)-order.get(b)).map(id=>`<button class="text-btn" data-action="goto" data-unit="${id}">${esc(unitName(M.get(id),RELATED.year))}</button>`).join('')}</div></article>`;
  return `<section class="category-page">${categoryHead(key)}${categoryFilter(M.categories()[key].filterPlaceholder)}<div data-filter-list><h3 class="subheading">${esc(RELATED.source.title)} · 宪法相关法 ${RELATED.laws.length} 件</h3><p class="note-source">来源：<a href="${esc(safeUrl(RELATED.source.url))}" target="_blank" rel="noopener noreferrer">${esc(RELATED.source.publisher)}</a>；链接指向${esc(RELATED.database.name)}。法律与宪法条文的对应由 Claude 拟定，${RELATED.laws.every(l=>l.status==='已核对')?'已核对':'待使用者核对'}，只到法律为止。</p><div class="related-law-list">${RELATED.laws.map(lawCard).join('')}</div><h3 class="subheading">我记录的相关法律</h3>${records.length?`<div class="relation-records">${records.map(relationCard).join('')}</div>`:`<p class="empty">${esc(M.categories()[key].empty||'')}</p>`}</div></section>`;
};
const relationCardBeforeStatutes=relationCard;
relationCard=function(r){const html=relationCardBeforeStatutes(r);return r.category==='crosscode'?html.replace('</footer>',`${crossButton(r)}</footer>`):html;};

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try{
    switch(el.dataset.action){
      case 'delegation':{const unit=M.get(el.dataset.unit),v=ver(unit,Number(el.dataset.year)),phrase=v.paragraphs[Number(el.dataset.block)].slice(Number(el.dataset.start),Number(el.dataset.end));showDelegation(unit,phrase,STRICT.has(phrase));break;}
      case 'copy-question':await copyText(assistantQuestion(M.get(el.dataset.unit),el.dataset.phrase),'问题已复制，可以粘贴给助手。');break;
      case 'related-new':if(RELATED_KEY)showCategoryForm(RELATED_KEY,{preset:{scope:{kind:'articles',year:state.year,unitIds:[el.dataset.unit]}}});break;
      case 'crosscode-new':showCategoryForm('crosscode',{preset:{scope:{kind:'articles',year:state.year,unitIds:[el.dataset.unit]}}});break;
      case 'copy-address':await copyText(addressOf(el.dataset.unit),'本条网址已复制。在其他笔记或法典中粘贴，即可打开这一条。');break;
    }
  }catch(error){toast(error.message);}
});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches?.('.delegation'))event.target.click();});
openFromAddress();
render();

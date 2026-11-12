'use strict';
// 塔罗研读: with 设置 → 记忆卡片配一张塔罗牌 turned on, every memory card comes with a card drawn at
// random; the card asks a lawyer's question about the article (games/tarot.json, reviewed by the
// teacher), and the answer is saved as an ordinary note. It is off by default and has no page of its
// own. Card pictures are games/tarot/<n>.jpg (0–21), put into the page by build.py; without them the
// card is typeset. Nothing
// new is stored: the note's question starts with 【牌名·正位】 and its method is the card's method,
// so it is listed, exported, merged and synced like any other note.
//
// To add another game, put its data in games/<id>.json (build.py loads every file there into
// DATA.games) and write its page here or in a file of its own, the same way.
// This file has no top-level constants on purpose: the first render happens before it runs.

function tarotData(){return DATA.games?.tarot||null;}
function tarotUi(){return ui.tarot||(ui.tarot={drawn:{},seen:[]});}
function tarotOn(){return !!tarotData()&&!!deviceSettings.tarot;}

// ---------- Pure parts (tested in test-games.cjs) ----------
// The question a card asks: reversed cards may have another wording for a given code (reversedFor).
function tarotQuestion(card,reversed,codeId){return reversed?card.reversedFor?.[codeId]||card.reversed:card.upright;}
function tarotTitle(card,reversed){return `【${card.name}·${reversed?'逆位':'正位'}】`;}
// One article and one card. Articles and cards drawn recently (seen) are avoided while others remain.
function tarotDraw(cards,unitIds,seen=[],random=Math.random){
  if(!cards.length||!unitIds.length)return null;
  const pick=(list,used)=>{const rest=list.filter(x=>!used.includes(x));const from=rest.length?rest:list;return from[Math.floor(random()*from.length)];};
  const unitId=pick(unitIds,seen.map(s=>s.unitId)),n=pick(cards.map(c=>c.n),seen.map(s=>s.n));
  return {unitId,n,reversed:random()<.5};
}
// Reads 【正义·逆位】… back from a note's question.
function tarotOfNote(note,cards){
  const m=/^【(.+?)·(正位|逆位)】/.exec(note.question||'');if(!m)return null;
  const card=cards.find(c=>c.name===m[1]);return card?{card,reversed:m[2]==='逆位'}:null;
}

// ---------- With the memory card ----------
function tarotFace(card,reversed){
  const picture=DATA.gameImages?.tarot?.[card.n];
  if(picture)return `<figure class="tarot-card picture ${reversed?'reversed':''}"><img src="${picture}" alt="${esc(card.name)}，${reversed?'逆位':'正位'}"><figcaption>${esc(card.numeral)} · ${esc(card.name)} · ${reversed?'逆位':'正位'}</figcaption></figure>`;
  return `<div class="tarot-card ${reversed?'reversed':''}" aria-label="${esc(card.name)}，${reversed?'逆位':'正位'}"><span class="tarot-numeral">${esc(card.numeral)}</span><span class="tarot-glyph" aria-hidden="true"></span><strong>${esc(card.name)}</strong><span class="tarot-side">${reversed?'逆位':'正位'}</span></div>`;
}
// The card that goes with a memory card: drawn once when the memory card first shows, kept while the page is open.
function tarotFor(unitId,year,again=false){
  const data=tarotData(),t=tarotUi(),key=unitId+'@'+year;
  if(!t.drawn[key]||again){
    const d=tarotDraw(data.cards,[unitId],t.seen);
    t.drawn[key]={n:d.n,reversed:d.reversed};t.seen=[...t.seen,{unitId:'',n:d.n}].slice(-8);
  }
  return {...t.drawn[key],card:data.cards.find(c=>c.n===t.drawn[key].n)};
}
// cover: the card lies where the law text will be, until the answer is shown; otherwise a smaller panel below the memory card.
function tarotPanel(unitId,year,cover=false){
  if(!tarotOn())return '';
  const {card,reversed}=tarotFor(unitId,year),written=state.notes.filter(n=>n.unitId===unitId&&n.year===year&&tarotOfNote(n,tarotData().cards)).length;
  return `<section class="tarot-panel ${cover?'cover':''}">${tarotFace(card,reversed)}<div class="tarot-reading">${cover?'<p class="tarot-recall">先试着回忆这一条的原文，再想牌上的问题。</p>':''}<div class="tarot-question"><span class="pill">${esc(card.method)}</span><p>${esc(tarotQuestion(card,reversed,CODEX.id))}</p>${cover&&card.meaning?`<p class="tarot-meaning">${esc(card.meaning)}</p>`:''}</div><div class="row wrap"><button class="btn primary" data-action="tarot-write">写下我的理解</button><button class="btn" data-action="tarot-card">换一张牌</button>${DATA.edition.tarotDeck!==false?'<button class="text-btn" data-action="tarot-deck">二十二张牌</button>':''}</div>${written?`<p class="note-source">这一条已有 ${written} 则塔罗笔记，在法条精读中可以看到。</p>`:''}</div></section>`;
}
function showTarotDeck(){
  const data=tarotData();
  showModal('二十二张牌',`<p class="note-source">${esc(data.about)}</p><div class="tarot-deck">${data.cards.map(c=>`<article><header><span>${esc(c.numeral)}</span><strong>${esc(c.name)}</strong><span class="pill">${esc(c.method)}</span></header><p><b>正位</b>${esc(c.upright)}</p><p><b>逆位</b>${esc(tarotQuestion(c,true,CODEX.id))}</p>${c.meaning?`<p class="tarot-meaning">${esc(c.meaning)}</p>`:''}</article>`).join('')}</div>`);
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action^="tarot-"]');if(!el||!tarotData())return;
  try{
    switch(el.dataset.action){
      case 'tarot-card':if(ui.feedId){tarotFor(ui.feedId,state.year,true);render();}break;
      case 'tarot-deck':showTarotDeck();break;
      case 'tarot-write':{
        if(!ui.feedId)break;
        const {card,reversed}=tarotFor(ui.feedId,state.year),unit=M.get(ui.feedId);
        showModal(tarotTitle(card,reversed),`<form id="tarot-form"><p>${esc(label(unit))} · ${state.year} 年</p><p class="tarot-ask">${esc(tarotQuestion(card,reversed,CODEX.id))}</p><label for="tarot-answer">我的理解</label><textarea id="tarot-answer" rows="7" placeholder="先自己想，再查资料核对。写下的内容会存为这一条的笔记。"></textarea><div class="modal-actions"><button type="submit" class="btn primary">存为笔记</button></div></form>`);
        break;
      }
    }
  }catch(error){toast(error.message||'操作未完成，请重试。');}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='tarot-form')return;event.preventDefault();
  try{
    const text=document.getElementById('tarot-answer').value.trim();
    if(!text){toast('先写下自己的理解，再保存。');return;}
    const {card,reversed}=tarotFor(ui.feedId,state.year);
    M.addNote(state,{unitId:ui.feedId,year:state.year,text,question:tarotTitle(card,reversed)+tarotQuestion(card,reversed,CODEX.id),methods:[card.method]});
    persist();closeModal();render();toast('已存为这一条的笔记。');
  }catch(error){toast(error.message||'操作未完成，请重试。');}
});
// Turning the switch in 设置 on or off shows at once.
document.addEventListener('change',event=>{if(event.target.dataset?.deviceSetting==='tarot')setTimeout(()=>{if(!modal.open)render();},0);});

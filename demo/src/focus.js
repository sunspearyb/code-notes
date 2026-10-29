'use strict';
// 专注模式 (computers only): the navigation on the left and the side panel on the right (目录、笔记、
// 关联 in 法条精读 and 体系阅读) fold away, the text widens and its type grows a little. Resting the pointer
// at either edge of the screen slides the panel back over the text; it folds again when the pointer
// leaves, but never while one is typing in it. The choice is kept on this device (KEY-focus).
const FOCUS_KEY=KEY+'-focus';
// Phones, tablets and the Android app have no side panels to hide and no pointer to rest on an edge.
const focusAvailable=!window.FadianAndroid&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
const focus={on:false,timers:{}};
function focusPanels(){return {left:document.querySelector('.sidebar'),right:document.querySelector('main .rail,main .structure-sidebar,main .practice-side')};}
function setFocus(on,announce=false){
  focus.on=on&&focusAvailable;document.body.classList.toggle('focus-mode',focus.on);document.body.classList.remove('reveal-left','reveal-right');
  try{localStorage.setItem(FOCUS_KEY,focus.on?'1':'0');}catch{}
  for(const el of document.querySelectorAll('[data-action="focus"]')){if(el.type==='checkbox')el.checked=focus.on;else{el.setAttribute('aria-pressed',String(focus.on));if(el.classList.contains('focus-toggle'))el.title=focusTitle();}}
  if(announce)toast(focus.on?'已进入专注模式。鼠标移到屏幕左右边缘，可以打开导航和侧栏；再按 \\ 键或点按钮退出。':'已退出专注模式。');
}
function focusTitle(){return focus.on?'退出专注模式（\\ 键）':'专注模式：隐藏两侧导航（\\ 键）';}
function focusButton(){return focusAvailable?`<button class="icon-btn focus-toggle" data-action="focus" aria-pressed="${focus.on}" title="${focusTitle()}" aria-label="专注模式">${focusIcon()}</button>`:'';}
function focusIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';}
function edgeZones(){
  if(document.getElementById('focus-edge-left'))return;
  for(const side of ['left','right']){
    const zone=document.createElement('div');zone.id='focus-edge-'+side;zone.className='focus-edge '+side;zone.setAttribute('aria-hidden','true');
    zone.innerHTML=`<span>${side==='left'?'导航':'侧栏'}</span>`;
    zone.addEventListener('mouseenter',()=>revealSoon(side,200));
    zone.addEventListener('mouseleave',()=>clearTimeout(focus.timers[side+'-in']));
    // Touch screens on computers: a tap on the edge tab opens the panel at once.
    zone.addEventListener('click',()=>reveal(side));
    document.body.append(zone);
  }
}
function revealSoon(side,delay){clearTimeout(focus.timers[side+'-out']);clearTimeout(focus.timers[side+'-in']);focus.timers[side+'-in']=setTimeout(()=>reveal(side),delay);}
function reveal(side){if(!focus.on)return;if(side==='right'&&!focusPanels().right)return;document.body.classList.add('reveal-'+side);}
function typingIn(panel){const el=document.activeElement;return !!panel&&panel.contains(el)&&el.matches('input,textarea,select,[contenteditable]');}
function concealSoon(side){
  clearTimeout(focus.timers[side+'-in']);clearTimeout(focus.timers[side+'-out']);
  focus.timers[side+'-out']=setTimeout(()=>{const panel=focusPanels()[side];if(!panel?.matches(':hover')&&!typingIn(panel)&&!modal.open)document.body.classList.remove('reveal-'+side);},500);
}
// Near the edge counts too, so a scroll bar on the right (Windows) does not get in the way.
document.addEventListener('mousemove',event=>{
  if(!focus.on||event.buttons)return;const width=document.documentElement.clientWidth;
  if(event.clientX<=6&&!document.body.classList.contains('reveal-left'))revealSoon('left',200);
  else if(event.clientX>=width-6&&event.clientY>(document.querySelector('.topbar')?.getBoundingClientRect().bottom||0)&&!document.body.classList.contains('reveal-right'))revealSoon('right',200);
},{passive:true});
// The panels are re-rendered with the page, so their pointer events are watched on the document.
document.addEventListener('mouseover',event=>{
  if(!focus.on)return;const {left,right}=focusPanels();
  if(left?.contains(event.target))clearTimeout(focus.timers['left-out']);
  if(right?.contains(event.target))clearTimeout(focus.timers['right-out']);
});
document.addEventListener('mouseout',event=>{
  if(!focus.on)return;const {left,right}=focusPanels(),to=event.relatedTarget;
  for(const [side,panel] of [['left',left],['right',right]])if(panel?.contains(event.target)&&!panel.contains(to)&&!document.getElementById('focus-edge-'+side)?.contains(to)&&document.body.classList.contains('reveal-'+side))concealSoon(side);
});
// Leaving a field in a panel lets it fold again once the pointer is elsewhere.
document.addEventListener('focusout',()=>{if(focus.on)setTimeout(()=>{for(const side of ['left','right'])if(document.body.classList.contains('reveal-'+side)&&!focusPanels()[side]?.matches(':hover'))concealSoon(side);},0);});
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');
  if(el?.dataset.action==='focus'){setFocus(!focus.on,true);return;}
  // Choosing a page in the navigation folds it away again.
  if(focus.on&&el&&focusPanels().left?.contains(el)&&el.dataset.action==='nav')document.body.classList.remove('reveal-left');
});
document.addEventListener('keydown',event=>{
  if(event.key!=='\\'||event.ctrlKey||event.metaKey||event.altKey||modal.open||event.target.closest('input,textarea,select,[contenteditable]'))return;
  if(!focusAvailable)return;event.preventDefault();setFocus(!focus.on,true);
});
// The button sits in the top bar, which every render rebuilds.
const renderPageBeforeFocus=renderPage;
// A labelled switch on every reading page (体系阅读、法条精读、记忆卡片), so the mode is one click away.
function focusSwitch(){return `<label class="focus-switch" title="${focusTitle()}"><input type="checkbox" role="switch" data-action="focus" ${focus.on?'checked':''}><span>专注模式</span></label>`;}
renderPage=function(){
  renderPageBeforeFocus();if(!focusAvailable)return;
  const bar=document.querySelector('.topbar');if(bar&&!bar.querySelector('.focus-toggle'))bar.insertAdjacentHTML('beforeend',focusButton());
  const spot=document.querySelector('main .outline-toolbar,main .reader-tools,main .practice-side');
  if(spot&&!spot.querySelector('.focus-switch'))spot.insertAdjacentHTML(spot.matches('.practice-side')?'afterbegin':'beforeend',focusSwitch());
};
if(focusAvailable){edgeZones();let saved='0';try{saved=localStorage.getItem(FOCUS_KEY)||'0';}catch{}setFocus(saved==='1');}

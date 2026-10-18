// 介绍视频的截图：在手机宽度（390×844，三倍像素）下打开一个空白书库的页面，写入两则示例记录，逐页截图。
// 用法：node 截图.mjs <页面网址> <输出文件夹> <临时浏览器资料夹>，由 制作视频.py 调用。不读取任何个人笔记。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
const [url,outDir,profile]=process.argv.slice(2);
const chromePath=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome=spawn(chromePath,['--headless=new','--remote-debugging-port=9334','--user-data-dir='+profile,'--no-first-run','--allow-file-access-from-files','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tabs;for(let i=0;i<60;i++){try{tabs=await (await fetch('http://127.0.0.1:9334/json')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(200);}
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend={},errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend[m.id]){pend[m.id](m);delete pend[m.id];}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description);};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev=async js=>{const r=await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true});return r.result?.result?.value??r.result?.exceptionDetails?.exception?.description;};
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true});
await send('Page.navigate',{url});await sleep(2500);
// Sample records written for the video only; nothing from the personal notebook.
console.log(await ev(`(()=>{localStorage.clear();state=M.fresh();
const a37=M.version('a37',2018);const i=a37.paragraphs[0].indexOf('人身自由');
M.addNote(state,{unitId:'a37',year:2018,question:'“人身自由”包括哪些内容？',text:'先读本条第二、三款列举的逮捕、拘禁、搜查，再对照第三十八条至第四十条。学说上的不同理解，待核。',methods:'文义解释，体系解释',anchors:[M.anchor('a37',2018,0,i,i+4)]});
M.addMaterialRelation(state,{name:'德国《基本法》第一条第一款'},{scope:{kind:'articles',year:2018,unitIds:['a38']},reason:'我国宪法第三十八条写“人格尊严不受侵犯”，德国《基本法》第一条第一款写“人的尊严不可侵犯”。两者位置和措辞不同，含义要结合各自的制度背景理解。',text:'Die Würde des Menschen ist unantastbar.',destination:'note',methods:'比较法解释',category:'comparative',details:{subject:'外国宪法条款',jurisdiction:'德国',provision:'《基本法》第一条第一款'}});
persist();localStorage.setItem(KEY+'-exported',String(Date.now()));render();return state.notes.length;})()`));
const shot=async(name,js,wait=900)=>{const r=await ev(js);await sleep(wait);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(outDir+'/'+name+'.png',Buffer.from(s.result.data,'base64'));console.log(name,JSON.stringify(r)?.slice(0,80));};
await shot('01-welcome',`(()=>{closeModal();state.preferences.welcomed=false;ui.view='outline';ui.outlineScope='all';render();scrollTo(0,0);return 1})()`);
await shot('02-words',`(()=>{state.preferences.welcomed=true;readUnit('a37',2018,'mine');ui.words=true;render();scrollTo(0,0);return 1})()`);
await shot('03-note',`(()=>{ui.words=false;render();document.querySelector('.marginalia')?.scrollIntoView({block:'start'});scrollBy(0,-120);return 1})()`);
await shot('04-toc',`(()=>{ui.view='outline';ui.outlineScope='node:state';render();scrollTo(0,0);showToc();return 1})()`);
await shot('05-outline',`(()=>{closeModal();ui.view='outline';ui.outlineScope='node:rights';ui.outlineMode='text';render();document.querySelector('.outline-chapter')?.scrollIntoView({block:'start'});scrollBy(0,-90);return 1})()`);
await shot('06-revision',`(()=>{readUnit('a33',2004,'mine');ui.history=true;ui.historyView='timeline';ui.revisionYear=2004;render();scrollTo(0,0);document.querySelector('.reader-tools')?.scrollIntoView({block:'start'});scrollBy(0,-70);return 1})()`);
await shot('07-history-source',`(()=>{const d=document.querySelector('.revision-source');if(d){d.open=true;d.scrollIntoView({block:'start'});scrollBy(0,-80);}return !!d})()`);
await shot('08-combined',`(()=>{ui.view='outline';ui.outlineMode='history';ui.outlineScope='all';render();const s=[...document.querySelectorAll('.revision-strip')].find(x=>x.querySelectorAll('.revision-point.changed').length>=3);s.scrollIntoView({block:'start'});scrollBy(0,-150);return 1})()`);
await shot('09-compare',`(()=>{ui.outlineMode='text';ui.view='terms';ui.relationTab='comparative';render();scrollTo(0,0);document.querySelector('.category-page')?.scrollIntoView({block:'start'});scrollBy(0,-20);return 1})()`);
await shot('10-review',`(()=>{ui.relationTab='review';render();document.querySelector('.review-group')?.scrollIntoView({block:'start'});scrollBy(0,-60);return 1})()`);
await shot('11-english',`(()=>{readUnit('a33',2018,'mine');ui.history=false;ui.english=true;render();document.querySelector('.english-text')?.scrollIntoView({block:'center'});return 1})()`);
await shot('12-subtitle',`(()=>{ui.english=false;readUnit('a37',2018,'mine');render();scrollTo(0,0);document.querySelector('[data-action=edit-subtitle]').click();return 1})()`);
await shot('13-principles',`(()=>{closeModal();ui.view='guide';render();document.getElementById('guide-own').scrollIntoView({block:'start'});return 1})()`);
await shot('14-storage',`(()=>{ui.view='settings';render();document.querySelector('.storage-panel')?.scrollIntoView({block:'start'});scrollBy(0,-70);return 1})()`);
await shot('15-ai',`(()=>{ui.view='ai';render();scrollTo(0,0);return 1})()`);
await shot('16-guide-steps',`(()=>{ui.view='guide';render();scrollTo(0,0);return 1})()`);
await ev(`localStorage.clear()`);
if(errors.length){console.log('页面错误：',errors);process.exitCode=1;}
ws.close();chrome.kill();process.exit(0);

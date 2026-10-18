'use strict';

// Pure data functions. Version-specific character anchors never depend on DOM position.
function createCoreNotebookModel(data) {
  refineRevisions(data.history);
  const years = data.history.years;
  // Each code's notebook names its data pack, so a backup is never merged into a different code.
  const bookId = data.codex?.id || 'cn-constitution';
  const units = data.history.units;
  const byId = new Map(units.map(u => [u.id, u]));
  const unitOrder = new Map(units.map((u,i) => [u.id,i]));
  const legacyPreamble = {id:'preamble',kind:'legacy',number:0,label:'序言（旧版整篇笔记）',chapter:'preamble',versions:{}};
  for(const year of years) legacyPreamble.versions[year]={exists:true,label:legacyPreamble.label,paragraphs:units.filter(u=>u.kind==='preamble').flatMap(u=>u.versions[year]?.paragraphs||[]),changed:false,diff:[],sourceRefs:[]};
  byId.set('preamble',legacyPreamble);
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timestamp = () => new Date().toISOString();
  const fresh = () => ({schemaVersion:2,bookId,current:units.find(u=>u.kind==='article')?.id||units[0].id,year:years.at(-1),notes:[],bookmarks:[],read:[],reviews:{},drafts:{},materials:[],updates:[],terms:[],links:[]});
  const get = unitId => byId.get(unitId);
  const version = (unitId,year=years.at(-1)) => get(unitId)?.versions[year];
  const sequence = year => units.filter(u=>u.versions[year]?.exists).map(u=>u.id);
  const whole = (unitId,year=years.at(-1)) => ({unitId,year,block:null,start:null,end:null,quote:''});
  const signature = object => JSON.stringify(object, Object.keys(object).sort());
  const anchorKey = a => [a.unitId,a.year,a.block,a.start,a.end].join(':');
  const anchorValid = a => {
    if(!a||!byId.has(a.unitId)||!years.includes(a.year)||!version(a.unitId,a.year)?.exists)return false;
    if(a.block===null)return a.start===null&&a.end===null&&a.quote==='';
    const text=version(a.unitId,a.year).paragraphs[a.block];
    return Number.isInteger(a.block)&&a.block>=0&&typeof text==='string'&&Number.isInteger(a.start)&&Number.isInteger(a.end)&&a.start>=0&&a.end>a.start&&a.end<=text.length&&text.slice(a.start,a.end)===a.quote;
  };
  function anchor(unitId,year,block,start,end) {
    const a={unitId,year,block,start,end,quote:version(unitId,year)?.paragraphs[block]?.slice(start,end)||''};
    if(!anchorValid(a))throw Error('选中文字与该年份的原文不一致，请重新选择。');
    return a;
  }
  function mergeAnchors(list) {
    const sorted=[...list].sort((a,b)=>(unitOrder.get(a.unitId)??-1)-(unitOrder.get(b.unitId)??-1)||a.year-b.year||(a.block??-1)-(b.block??-1)||(a.start??0)-(b.start??0));
    const result=[];
    for(const a of sorted){
      if(!anchorValid(a))throw Error('文字定位无效。');
      const prev=result.at(-1);
      if(prev&&a.block!==null&&prev.unitId===a.unitId&&prev.year===a.year&&prev.block===a.block&&a.start<=prev.end){
        prev.end=Math.max(prev.end,a.end);prev.quote=version(prev.unitId,prev.year).paragraphs[prev.block].slice(prev.start,prev.end);
      }else if(!result.some(b=>anchorKey(a)===anchorKey(b)))result.push({...a});
    }
    return result;
  }
  function migrate(input) {
    if(input?.schemaVersion===2){validate(input);return JSON.parse(JSON.stringify(input));}
    if(input?.schemaVersion!==1||input.bookVersion!=='cn-constitution-2018-03-11')throw Error('无法识别备份格式或法典。');
    const s=fresh(), convert=n=>n===0?'preamble':`a${n}`;
    for(const key of ['notes','materials','updates','bookmarks','read'])if(!Array.isArray(input[key]))throw Error('旧版备份缺少必要记录。');
    s.current=input.current===0?'p1':convert(input.current);
    s.notes=input.notes.map(n=>({...n,unitId:convert(n.articleId),year:2018,anchors:[],termIds:[]}));
    s.materials=input.materials.map(m=>({...m,unitId:convert(m.articleId),year:2018}));
    s.updates=JSON.parse(JSON.stringify(input.updates));
    s.bookmarks=input.bookmarks.map(convert);s.read=input.read.map(convert);
    for(const [n,r] of Object.entries(input.reviews||{}))s.reviews[convert(Number(n))]={...r};
    for(const [n,d] of Object.entries(input.drafts||{}))s.drafts[`${convert(Number(n))}@2018`]={...d,anchors:[],year:2018};
    validate(s);return s;
  }
  const safeUrl=value=>{if(!value)return true;try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}};
  function validate(s) {
    if(!s||s.schemaVersion!==2||s.bookId!==bookId||!byId.has(s.current)||!years.includes(s.year))throw Error('备份格式、法典或当前条目无效。');
    const str=(x,max=200000)=>typeof x==='string'&&x.length<=max;
    const validDate=x=>str(x,50)&&Number.isFinite(Date.parse(x));
    const anchorsOK=xs=>Array.isArray(xs)&&xs.length<=10000&&xs.every(anchorValid);
    for(const key of ['notes','materials','updates','terms','links','bookmarks','read'])if(!Array.isArray(s[key])||s[key].length>30000)throw Error('备份记录格式不正确。');
    for(const key of ['bookmarks','read'])if(!s[key].every(x=>byId.has(x)))throw Error('备份包含未知条目。');
    for(const key of ['notes','materials','updates','terms','links']){
      const ids=new Set();
      for(const x of s[key]){
        if(!x||!str(x.id,120)||!/^[\w-]+$/.test(x.id)||ids.has(x.id)||!validDate(x.createdAt))throw Error('记录标识重复或记录日期无效。');
        ids.add(x.id);
        if(['notes','materials'].includes(key)&&(!byId.has(x.unitId)||!years.includes(x.year)))throw Error('记录所关联的条目或年份无效。');
        if(key==='notes'&&(!str(x.text)||!str(x.quote||'')||!validDate(x.updatedAt)||!anchorsOK(x.anchors)||x.anchors.some(a=>a.unitId!==x.unitId||a.year!==x.year)||!Array.isArray(x.termIds)||!x.termIds.every(t=>str(t,120))||!Array.isArray(x.textSnapshot)||!x.textSnapshot.every(t=>str(t))))throw Error('笔记内容或词语定位无效。');
        if(['materials','updates'].includes(key)&&(!str(x.title,500)||!str(x.type,100)||!str(x.url||'',10000)||!safeUrl(x.url)))throw Error('材料名称或链接无效。');
        if(key==='materials'&&(!str(x.reason)||!str(x.sourceText||'')))throw Error('材料内容无效。');
        if(key==='updates'&&(!str(x.text)||!['pending','accepted','ignored'].includes(x.status)))throw Error('收件箱记录无效。');
        if(key==='terms'&&(!str(x.name,120)||!x.name.trim()||!str(x.text)||!anchorsOK(x.anchors)||!validDate(x.updatedAt)))throw Error('词条内容或定位无效。');
        if(key==='links'&&(!anchorsOK(x.from)||!anchorsOK(x.to)||!x.from.length||!x.to.length||!str(x.reason)))throw Error('关联的两端无效。');
      }
    }
    if(!s.drafts||typeof s.drafts!=='object'||Array.isArray(s.drafts)||!s.reviews||typeof s.reviews!=='object'||Array.isArray(s.reviews))throw Error('草稿或复习数据无效。');
    for(const [key,d] of Object.entries(s.drafts)){
      const [unitId,y]=key.split('@');
      if(!byId.has(unitId)||!years.includes(Number(y))||!d||!str(d.text||'')||!str(d.quote||'')||!anchorsOK(d.anchors||[]))throw Error('草稿定位或内容无效。');
    }
    for(const [unitId,r] of Object.entries(s.reviews))if(!byId.has(unitId)||!r||!Number.isFinite(r.due)||!['again','familiar'].includes(r.rating))throw Error('复习安排无效。');
  }
  function addNote(s,{unitId,year,text,anchors=[],quote='',editId,question='',methods=[],evidenceIds=[]}) {
    if(!text.trim()&&!question.trim())throw Error('请先写下解释问题或笔记。');
    if(!byId.has(unitId)||!version(unitId,year)?.exists)throw Error('该年份没有这条正文。');
    anchors=mergeAnchors(anchors);
    if(anchors.some(a=>a.unitId!==unitId||a.year!==year))throw Error('笔记词语属于其他条目或年份。');
    const termIds=[];
    for(const match of text.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)){
      const name=match[1].trim();if(!name)continue;
      let term=s.terms.find(t=>t.name===name);
      if(!term){term={id:id(),name,text:'',anchors:[],createdAt:timestamp(),updatedAt:timestamp()};s.terms.push(term);}
      if(!termIds.includes(term.id))termIds.push(term.id);
    }
    const old=s.notes.find(n=>n.id===editId);
    const note={id:old?.id||id(),unitId,year,text:text.trim(),quote,anchors,termIds,question,methods,evidenceIds,textSnapshot:[...version(unitId,year).paragraphs],createdAt:old?.createdAt||timestamp(),updatedAt:timestamp()};
    if(old)Object.assign(old,note);else s.notes.push(note);
    return old||note;
  }
  function addTerm(s,{name,text='',anchors=[]}) {
    name=name.trim();if(!name||name.length>120)throw Error('词条名称需要 1—120 个字。');
    anchors=mergeAnchors(anchors);
    let term=s.terms.find(t=>t.name===name);
    if(term){term.anchors=mergeAnchors([...term.anchors,...anchors]);if(text.trim())term.text=text.trim();term.updatedAt=timestamp();}
    else {term={id:id(),name,text:text.trim(),anchors,createdAt:timestamp(),updatedAt:timestamp()};s.terms.push(term);}
    return term;
  }
  function addLink(s,{from,to,reason=''}) {
    from=mergeAnchors(from);to=mergeAnchors(to);if(!from.length||!to.length)throw Error('请选择关联的两端。');
    const side=xs=>xs.map(anchorKey).sort().join('|');
    if(side(from)===side(to))throw Error('两端完全相同，请选择另一处词语或段落。');
    const old=s.links.find(l=>(side(l.from)===side(from)&&side(l.to)===side(to))||(side(l.from)===side(to)&&side(l.to)===side(from)));
    if(old)return old;
    const link={id:id(),from,to,reason:reason.trim(),createdAt:timestamp()};s.links.push(link);return link;
  }
  function backlinks(s,unitId) {return s.links.filter(l=>[...l.from,...l.to].some(a=>a.unitId===unitId));}
  function termReferences(s,termId){const term=s.terms.find(t=>t.id===termId);return {anchors:term?.anchors||[],notes:s.notes.filter(n=>n.termIds.includes(termId))};}
  function merge(current,incoming) {
    incoming=migrate(incoming);validate(current);
    const next=JSON.parse(JSON.stringify(current)),remap=new Map(),materialMap=new Map();let added=0,conflicts=0;
    const stable=o=>{if(Array.isArray(o))return o.map(stable);if(o&&typeof o==='object')return Object.fromEntries(Object.entries(o).filter(([k])=>k!=='id').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return o;};
    const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
    for(const term of incoming.terms){
      const exact=next.terms.find(t=>t.id===term.id&&same(t,term));
      if(exact){remap.set(term.id,exact.id);continue;}
      const named=next.terms.find(t=>t.name===term.name);
      if(named&&named.text===term.text){named.anchors=mergeAnchors([...named.anchors,...term.anchors]);remap.set(term.id,named.id);continue;}
      const copy={...term,id:next.terms.some(t=>t.id===term.id)?id():term.id};
      const equivalent=next.terms.find(t=>same(t,copy));
      if(equivalent){remap.set(term.id,equivalent.id);continue;}
      next.terms.push(copy);remap.set(term.id,copy.id);named?conflicts++:added++;
    }
    for(const key of ['materials','updates','notes','links'])for(const item of incoming[key]){
      const record=key==='notes'?{...item,termIds:item.termIds.map(t=>remap.get(t)||t),evidenceIds:(item.evidenceIds||[]).map(t=>materialMap.get(t)||t)}:item;
      const exact=next[key].find(x=>same(x,record));
      if(exact){if(key==='materials')materialMap.set(item.id,exact.id);continue;}
      const collision=next[key].some(x=>x.id===record.id),recordId=collision?id():record.id;next[key].push({...record,id:recordId});if(key==='materials')materialMap.set(item.id,recordId);collision?conflicts++:added++;
    }
    for(const key of ['bookmarks','read'])next[key]=[...new Set([...next[key],...incoming[key]])];
    for(const [unitId,r] of Object.entries(incoming.reviews))if(!next.reviews[unitId])next.reviews[unitId]=r;
    for(const [key,draft] of Object.entries(incoming.drafts)){
      const imported={...draft,editId:undefined,evidenceIds:(draft.evidenceIds||[]).map(t=>materialMap.get(t)||t)};
      const meaningful=d=>d&&(d.text||d.question||d.quote||d.anchors?.length||d.methods?.length||d.evidenceIds?.length);
      if(!meaningful(next.drafts[key]))next.drafts[key]=imported;
      else if(meaningful(imported)&&!same({...next.drafts[key],editId:undefined},imported)){
        const [unitId,year]=key.split('@'),text=`[从备份恢复的草稿]\n${draft.text||'[尚未填写正文]'}`;
        if(!next.notes.some(n=>n.unitId===unitId&&n.year===Number(year)&&n.text===text&&n.question===(draft.question||'')&&JSON.stringify(n.methods||[])===JSON.stringify(draft.methods||[])&&JSON.stringify(n.evidenceIds||[])===JSON.stringify(imported.evidenceIds))){addNote(next,{unitId,year:Number(year),text,anchors:draft.anchors||[],quote:draft.quote||'',question:draft.question||'',methods:draft.methods||[],evidenceIds:imported.evidenceIds});conflicts++;}
      }
    }
    validate(next);return {state:next,added,conflicts};
  }
  function tokenize(text) {
    if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)].map(t=>({text:t.segment,start:t.index,end:t.index+t.segment.length,word:t.isWordLike}));
    let offset=0;return Array.from(text).map(t=>{const token={text:t,start:offset,end:offset+t.length,word:!/[\s\p{P}]/u.test(t)};offset+=t.length;return token;});
  }
  return {units,years,get,version,sequence,whole,anchor,anchorKey,anchorValid,mergeAnchors,fresh,migrate,validate,addNote,addTerm,addLink,backlinks,termReferences,merge,tokenize,id,timestamp};
}

// Revision display: align paragraphs (allowing merges and splits), then diff each pair by character.
// Short equalities trapped between edits are folded in, and edits slide to punctuation boundaries,
// so a change reads as whole words. The result replaces the stored diff; both texts are rebuilt and checked.
function refineRevisions(history) {
  if(history.revisionsRefined)return;
  const STOP='，。；：、！？）”', OPEN='（“';
  const tidy = ops => {
    const out=[];let del='',ins='';
    const equal=text=>{if(!text)return;const last=out.at(-1);if(last?.type==='equal')last.text+=text;else out.push({type:'equal',text});};
    const flush=()=>{
      let head='',tail='';
      if(del&&ins){
        while(del&&ins&&del[0]===ins[0]){head+=del[0];del=del.slice(1);ins=ins.slice(1);}
        while(del&&ins&&del.at(-1)===ins.at(-1)){tail=del.at(-1)+tail;del=del.slice(0,-1);ins=ins.slice(0,-1);}
      }
      equal(head);if(del)out.push({type:'delete',text:del});if(ins)out.push({type:'insert',text:ins});equal(tail);del=ins='';
    };
    for(const op of ops){
      if(!op.text)continue;
      if(op.type==='delete')del+=op.text;else if(op.type==='insert')ins+=op.text;
      else if(op.type==='equal'){flush();equal(op.text);}
      else{flush();out.push({...op});}
    }
    flush();return out;
  };
  const lcs = (a,b) => {
    let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
    let s=0;while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]===b[b.length-1-s])s++;
    const x=a.slice(p,a.length-s),y=b.slice(p,b.length-s),n=x.length,m=y.length;
    const L=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=x[i]===y[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
    const ops=[{type:'equal',text:a.slice(0,p).join('')}];let i=0,j=0;
    while(i<n||j<m){
      if(i<n&&j<m&&x[i]===y[j]){ops.push({type:'equal',text:x[i]});i++;j++;}
      else if(j>=m||i<n&&L[i+1][j]>=L[i][j+1])ops.push({type:'delete',text:x[i++]});
      else ops.push({type:'insert',text:y[j++]});
    }
    ops.push({type:'equal',text:a.slice(a.length-s).join('')});return tidy(ops);
  };
  const fold = ops => {
    for(let again=true,round=0;again&&round<200;round++){
      again=false;ops=tidy(ops);
      const edits=(k,step)=>{let d=0,n=0;for(;ops[k]&&ops[k].type!=='equal';k+=step)ops[k].type==='delete'?d+=ops[k].text.length:n+=ops[k].text.length;return Math.max(d,n);};
      for(let k=1;k<ops.length-1;k++){
        const e=ops[k];if(e.type!=='equal'||e.text.length>3||e.text.includes('\n'))continue;
        if(e.text.length<=edits(k-1,-1)&&e.text.length<=edits(k+1,1)){ops.splice(k,1,{type:'delete',text:e.text},{type:'insert',text:e.text});again=true;break;}
      }
    }
    return ops;
  };
  const boundary = (left,right) => {
    if(!left||!right)return 6;
    const l=left.at(-1),r=right[0];
    return l==='\n'||r==='\n'?5:STOP.includes(l)?4:OPEN.includes(r)?3:0;
  };
  const slide = ops => {
    for(let k=1;k<ops.length-1;k++){
      const a=ops[k-1],e=ops[k],b=ops[k+1];
      if(a.type!=='equal'||b.type!=='equal'||e.type==='equal')continue;
      let L=a.text,E=e.text,R=b.text;
      while(L&&L.at(-1)===E.at(-1)){R=E.at(-1)+R;E=L.at(-1)+E.slice(0,-1);L=L.slice(0,-1);}
      let best=[L,E,R],score=boundary(L,E)+boundary(E,R);
      while(R&&E[0]===R[0]){L+=E[0];E=E.slice(1)+R[0];R=R.slice(1);const s=boundary(L,E)+boundary(E,R);if(s>=score){score=s;best=[L,E,R];}}
      [a.text,e.text,b.text]=best;
    }
    return tidy(ops);
  };
  const pairDiff = (a,b,editorial) => {
    const ops=slide(fold(lcs(Array.from(a),Array.from(b))));
    for(let k=0;k<ops.length-1;k++)if(ops[k].type==='delete'&&ops[k+1].type==='insert'&&editorial.some(x=>x.previousText===ops[k].text&&x.text===ops[k+1].text))ops.splice(k,2,{type:'editorial',text:ops[k+1].text,previousText:ops[k].text});
    return ops;
  };
  const grams = new Map();
  const bigrams = t => {if(!grams.has(t)){const c=Array.from(t);grams.set(t,new Set(c.slice(0,-1).map((x,i)=>x+c[i+1])));}return grams.get(t);};
  const similarity = (a,b) => {
    if(a===b)return 1;
    const x=bigrams(a),y=bigrams(b);if(!x.size||!y.size)return 0;
    let shared=0;for(const g of x)if(y.has(g))shared++;
    return 2*shared/(x.size+y.size);
  };
  const pairCost = s => s<.12?2.1:1.8*(1-s);
  function align(before,after) {
    const n=before.length,m=after.length,cost=Array.from({length:n+1},()=>Array(m+1).fill(Infinity)),move=Array.from({length:n+1},()=>Array(m+1).fill(null));
    cost[0][0]=0;
    const relax=(i,j,di,dj,c)=>{if(i>=di&&j>=dj&&cost[i-di][j-dj]+c<cost[i][j]-1e-9){cost[i][j]=cost[i-di][j-dj]+c;move[i][j]=[di,dj];}};
    const joined=(a,b,one)=>{const s=similarity(a+b,one);return s>=.6&&s>Math.max(similarity(a,one),similarity(b,one))+.1?.4+pairCost(s):Infinity;};
    for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
      if(i&&j)relax(i,j,1,1,pairCost(similarity(before[i-1],after[j-1])));
      if(i)relax(i,j,1,0,1);
      if(j)relax(i,j,0,1,1);
      if(i>1&&j)relax(i,j,2,1,joined(before[i-2],before[i-1],after[j-1]));
      if(i&&j>1)relax(i,j,1,2,joined(after[j-2],after[j-1],before[i-1]));
    }
    const pairs=[];
    for(let i=n,j=m;i||j;){const [di,dj]=move[i][j];pairs.unshift([before.slice(i-di,i),after.slice(j-dj,j)]);i-=di;j-=dj;}
    return pairs;
  }
  const sideParts = (ops,side) => {
    const parts=[];
    for(const op of ops){
      if(side==='before'&&op.type==='insert'||side==='after'&&op.type==='delete')continue;
      const text=op.type==='editorial'&&side==='before'?op.previousText:op.text,type=op.type==='editorial'?'equal':op.type,last=parts.at(-1);
      if(last?.type===type)last.text+=text;else parts.push({text,type});
    }
    return parts;
  };
  for(const unit of history.units)history.years.forEach((year,index)=>{
    const v=unit.versions[year];
    if(!index||!v){if(v)v.rows=[];return;}
    const old=unit.versions[history.years[index-1]],before=old?.exists?old.paragraphs:[],after=v.exists?v.paragraphs:[];
    const editorial=(v.diff||[]).filter(op=>op.type==='editorial'),rows=[],diff=[];
    let seenBefore=false,seenAfter=false;
    for(const [b,a] of align(before,after)){
      const bt=b.join('\n'),at=a.join('\n'),ops=b.length&&a.length?pairDiff(bt,at,editorial):b.length?[{type:'delete',text:bt}]:[{type:'insert',text:at}];
      const sep=seenBefore&&b.length&&seenAfter&&a.length?'equal':seenBefore&&b.length?'delete':seenAfter&&a.length?'insert':null;
      if(sep)diff.push({type:sep,text:'\n'});
      diff.push(...ops);seenBefore||=b.length>0;seenAfter||=a.length>0;
      rows.push({before:b.length?{text:bt,parts:sideParts(ops,'before')}:null,after:a.length?{text:at,parts:sideParts(ops,'after')}:null,
        changed:!b.length||!a.length||ops.some(op=>op.type==='insert'||op.type==='delete'),
        note:b.length>1?'修正后合为一段':a.length>1?'修正后分为两段':''});
    }
    const merged=[];for(const op of diff){const last=merged.at(-1);if(last&&last.type===op.type&&op.type!=='editorial')last.text+=op.text;else merged.push({...op});}
    const rebuilt=side=>merged.filter(op=>op.type!==(side==='before'?'insert':'delete')).map(op=>side==='before'?op.previousText??op.text:op.text).join('');
    if(rebuilt('before')!==before.join('\n')||rebuilt('after')!==after.join('\n'))throw Error(`修正对照无法还原 ${unit.id} ${year} 年文本。`);
    v.rows=rows;v.diff=merged;
  });
  history.revisionsRefined=true;
}

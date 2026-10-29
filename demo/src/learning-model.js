'use strict';
function createLearningModel(data) {
  const base=createNotebookModel(data),copy=x=>JSON.parse(JSON.stringify(x));
  const MARK_STYLES=['yellow','green','blue','underline','bold'];
  const revision=n=>({text:n.text,question:n.question||'',methods:copy(n.methods||[]),quote:n.quote||'',updatedAt:n.updatedAt,...(n.analysis?{analysis:copy(n.analysis)}:{})});
  const revisionText=n=>JSON.stringify([n.text,n.question||'',n.methods||[],n.quote||'',n.analysis||null]);
  function validateHistory(record){
    if(record.history!==undefined&&(!Array.isArray(record.history)||record.history.some(h=>!h||typeof h.text!=='string'||h.text.length>200000||typeof h.question!=='string'||h.question.length>200000||!Array.isArray(h.methods)||h.methods.some(m=>typeof m!=='string'||m.length>100)||typeof h.quote!=='string'||h.quote.length>200000||!Number.isFinite(Date.parse(h.updatedAt)))))throw Error('笔记修改记录无效。');
    const o=record.ai?.original;
    if(o&&(!['text','question','excerpt','title'].every(k=>typeof o[k]==='string'&&o[k].length<=200000)||!Array.isArray(o.methods)||o.methods.some(m=>typeof m!=='string'||m.length>100)||!Number.isFinite(Date.parse(o.createdAt))))throw Error('助手原建议无效。');
  }
  function normalize(input){
    const s=copy(input);s.notebookVersion=4;s.subtitles||={};s.subtitleHistory||={};s.memoryCards||={};s.guideEdits||={};s.guideHistory||={};dropDefaultGuideEdits(s);s.materialRelations||=[];s.marks||=[];s.preferences={noteMode:'full',...(s.preferences||{})};
    for(const [unitId,r] of Object.entries(s.reviews)) {
      const key=unitId+'@2018';
      if(!s.memoryCards[key])s.memoryCards[key]={unitId,year:2018,keywords:[],mode:'whole',due:r.due,interval:r.rating==='again'?0:3,repetitions:0,rating:r.rating==='again'?'again':'good',updatedAt:'2026-10-01T00:00:00Z'};
    }
    return s;
  }
  function validate(s){
    base.validate(s);
    for(const n of s.notes){validateHistory(n);if(n.analysis!==undefined)validateAnalysis(n.analysis,n);}
    const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
    if(!object(s.subtitles)||!object(s.subtitleHistory)||!object(s.memoryCards)||!object(s.preferences)||!['hidden','summary','full'].includes(s.preferences.noteMode))throw Error('阅读设置格式无效。');
    for(const [unitId,t] of Object.entries(s.subtitles))if(!base.get(unitId)||!t||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||!Number.isFinite(Date.parse(t.updatedAt)))throw Error('条旨无效。');
    for(const [unitId,list] of Object.entries(s.subtitleHistory))if(!base.get(unitId)||!Array.isArray(list)||list.some(t=>typeof t!=='string'||t.length>80))throw Error('条旨修改记录无效。');
    for(const [key,c] of Object.entries(s.memoryCards)){
      const v=base.version(c.unitId,c.year);
      if(key!==c.unitId+'@'+c.year||!v?.exists||!['whole','keywords'].includes(c.mode)||!Array.isArray(c.keywords)||c.keywords.length>60||c.keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>200||!v.paragraphs.some(p=>p.includes(k)))||!Number.isFinite(c.due)||!Number.isFinite(c.interval)||c.interval<0||!Number.isInteger(c.repetitions)||c.repetitions<0||!Number.isFinite(Date.parse(c.updatedAt))||!['new','again','hard','good','easy'].includes(c.rating))throw Error('记忆卡片的关键词或复习记录无效。');
    }
    for(const n of s.notes)if(n.ai && (typeof n.ai.model!=='string'||typeof n.ai.proposalId!=='string'||!['pending','reviewed'].includes(n.ai.verification)))throw Error('助手建议的来源记录无效。');
    for(const m of s.materials)if(m.attachmentId!==undefined&&(!/^[a-f0-9]{32}$/.test(m.attachmentId)||typeof m.attachmentName!=='string'))throw Error('附件定位无效。');
    if(!object(s.guideEdits)||!object(s.guideHistory))throw Error('使用说明格式无效。');
    for(const [key,entry] of Object.entries(s.guideEdits))validateGuide(key,entry);
    for(const [key,entries] of Object.entries(s.guideHistory)){if(!Array.isArray(entries))throw Error('说明修订记录无效。');for(const entry of entries)validateGuide(key,entry);}
    if(!Array.isArray(s.marks)||s.marks.length>30000)throw Error('标记记录无效。');
    const markIds=new Set();
    for(const m of s.marks){
      if(!m||typeof m.id!=='string'||!/^[\w-]{1,120}$/.test(m.id)||markIds.has(m.id)||!MARK_STYLES.includes(m.style)||!base.anchorValid(m.anchor)||m.anchor.block===null||!Number.isFinite(Date.parse(m.createdAt)))throw Error('标记的样式或字句定位无效。');
      markIds.add(m.id);
    }
    if(!Array.isArray(s.materialRelations)||s.materialRelations.length>30000)throw Error('材料关联记录无效。');
    const relationIds=new Set();
    for(const r of s.materialRelations){
      validateHistory(r);
      validateScope(r.scope);
      if(!r.id||!/^[\w-]{1,120}$/.test(r.id)||relationIds.has(r.id)||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.updatedAt)))throw Error('材料关联标识或日期无效。');
      relationIds.add(r.id);
      for(const [field,max] of [['title',500],['text',200000],['sourceText',200000],['question',1000]])if(typeof r[field]!=='string'||r[field].length>max)throw Error('材料关联内容无效。');
      if(!['note','material'].includes(r.destination)||!['manual','ai'].includes(r.method)||!Array.isArray(r.methods)||r.methods.some(t=>typeof t!=='string'||t.length>100))throw Error('材料关联方式无效。');
      if(typeof r.url!=='string'||r.url.length>10000)throw Error('材料来源链接无效。');
      if(r.url){try{if(!['http:','https:'].includes(new URL(r.url).protocol))throw Error();}catch{throw Error('材料来源链接无效。');}}
      if(r.attachmentId&&!/^[a-f0-9]{32}$/.test(r.attachmentId))throw Error('材料附件标识无效。');
      if(r.ai&&(typeof r.ai.model!=='string'||typeof r.ai.proposalId!=='string'||!['pending','reviewed'].includes(r.ai.verification)))throw Error('助手建议的来源记录无效。');
      if(r.category!==undefined&&(typeof r.category!=='string'||!/^[a-z-]{1,40}$/.test(r.category)))throw Error('材料关联的类别无效。');
      if(r.details!==undefined&&(!object(r.details)||Object.keys(r.details).length>20||Object.entries(r.details).some(([k,v])=>!/^[a-zA-Z]{1,40}$/.test(k)||typeof v!=='string'||v.length>2000)))throw Error('材料关联的详细信息无效。');
    }
    return s;
  }
  // ---------- Marks: highlight, underline and bold on the text itself, with nothing to write ----------
  // A mark is a style on one stretch of one paragraph of one year's text. Marks of one style never
  // overlap: marking again what is already marked in that style takes the mark off.
  const sameBlock=(m,a)=>m.anchor.unitId===a.unitId&&m.anchor.year===a.year&&m.anchor.block===a.block;
  function covered(marks,a){let at=a.start;for(const m of marks.filter(m=>sameBlock(m,a)).sort((x,y)=>x.anchor.start-y.anchor.start)){if(m.anchor.start>at)break;at=Math.max(at,m.anchor.end);if(at>=a.end)return true;}return false;}
  // Takes [a.start, a.end) out of the marks of the given styles, keeping what lies on either side.
  function cut(s,a,styles){
    const kept=[];
    for(const m of s.marks){
      if(!styles.includes(m.style)||!sameBlock(m,a)||m.anchor.end<=a.start||m.anchor.start>=a.end){kept.push(m);continue;}
      if(m.anchor.start<a.start)kept.push({...m,id:base.id(),anchor:base.anchor(a.unitId,a.year,a.block,m.anchor.start,a.start)});
      if(m.anchor.end>a.end)kept.push({...m,id:base.id(),anchor:base.anchor(a.unitId,a.year,a.block,a.end,m.anchor.end)});
    }
    s.marks=kept;
  }
  function markAnchors(anchors){const list=base.mergeAnchors(anchors).filter(a=>a.block!==null);if(!list.length)throw Error('请先在正文中选中要标记的字句。');return list;}
  // Returns true when the marks were added, false when the selection was already marked and the marks came off.
  function toggleMark(s,anchors,style){
    if(!MARK_STYLES.includes(style))throw Error('标记样式无效。');
    const list=markAnchors(anchors),own=s.marks.filter(m=>m.style===style),remove=list.every(a=>covered(own,a)),trial=copy(s);
    for(const a of list){
      cut(trial,a,[style]);if(remove)continue;
      // Join with marks of the same style that touch the selection.
      const touching=trial.marks.filter(m=>m.style===style&&sameBlock(m,a)&&(m.anchor.end===a.start||m.anchor.start===a.end));
      const start=Math.min(a.start,...touching.map(m=>m.anchor.start)),end=Math.max(a.end,...touching.map(m=>m.anchor.end));
      trial.marks=trial.marks.filter(m=>!touching.includes(m));
      trial.marks.push({id:base.id(),style,anchor:base.anchor(a.unitId,a.year,a.block,start,end),createdAt:base.timestamp()});
    }
    validate(trial);s.marks=trial.marks;return !remove;
  }
  function clearMarks(s,anchors){const trial=copy(s),before=trial.marks.length;for(const a of markAnchors(anchors))cut(trial,a,MARK_STYLES);validate(trial);s.marks=trial.marks;return before!==trial.marks.length||JSON.stringify(trial.marks)!==JSON.stringify(s.marks);}
  // The styles covering each stretch of a paragraph, for drawing: [{start,end,styles}].
  function markedRanges(s,unitId,year,block){
    const marks=s.marks.filter(m=>m.anchor.unitId===unitId&&m.anchor.year===year&&m.anchor.block===block);if(!marks.length)return [];
    const cuts=[...new Set(marks.flatMap(m=>[m.anchor.start,m.anchor.end]))].sort((a,b)=>a-b),out=[];
    for(let i=0;i<cuts.length-1;i++){const styles=MARK_STYLES.filter(st=>marks.some(m=>m.style===st&&m.anchor.start<=cuts[i]&&m.anchor.end>=cuts[i+1]));if(styles.length)out.push({start:cuts[i],end:cuts[i+1],styles});}
    return out;
  }
  // A structured analysis stored on a note (法权分析 and other frameworks in frameworks/). Items are the
  // “权” found in the text; links join two items. The note text keeps the reader's prose, so exports
  // and merges handle the note as before.
  function validateAnalysis(a,n){
    const f=data.frameworks?.[a?.framework],ok=x=>typeof x==='string'&&x.length<=20000;
    if(!f||!Array.isArray(a.items)||a.items.length>200||!Array.isArray(a.links)||a.links.length>400)throw Error('分析记录无效。');
    const cats=new Set(f.categories.map(c=>c.id)),subjects=new Set(f.subjects.map(x=>x.id)),ids=new Set();
    for(const it of a.items){
      if(!/^[\w-]{1,40}$/.test(it?.id||'')||ids.has(it.id)||!ok(it.quote)||!it.quote.trim()||!(it.category===''||cats.has(it.category))||!(it.subject===''||subjects.has(it.subject))||!ok(it.reason))throw Error('分析中的“权”无效。');
      if(it.anchor&&(!base.anchorValid(it.anchor)||it.anchor.unitId!==n.unitId))throw Error('分析中的字句定位无效。');
      ids.add(it.id);
    }
    for(const l of a.links)if(!ids.has(l.from)||!ids.has(l.to)||l.from===l.to||!ok(l.form||'')||!ok(l.facts||'')||!ok(l.note||''))throw Error('分析中的法权关系无效。');
    for(const k of ['balance','basis'])if(!ok(a[k]||''))throw Error('分析内容过长。');
  }
  // 权利—权力 etc., from the categories at the two ends; '' when either end is not 权利 or 权力.
  function relationType(a,b){const name=c=>({quanli:'权利',quanli2:'权力'})[c];return name(a?.category)&&name(b?.category)?`${name(a.category)}—${name(b.category)}`:'';}
  const migrate=x=>validate(normalize(base.migrate(x))),fresh=()=>validate(normalize(base.fresh()));
  function reconcileSnapshot(local,remote,{hasLocal,clean,revision}){
    if(!remote.state)return local;
    if(!hasLocal||clean&&revision<=remote.revision)return migrate(remote.state);
    // Unsaved edits already descend from this file revision; merging its older
    // text would turn an ordinary edit into a spurious conflict copy.
    return revision===remote.revision?migrate(local):merge(local,remote.state).state;
  }
  function addNote(s,fields){
    const old=s.notes.find(n=>n.id===fields.editId),before=old?revision(old):null;
    if(fields.analysis!==undefined&&fields.analysis!==null)validateAnalysis(fields.analysis,{unitId:fields.unitId});
    const kept=fields.analysis!==undefined?fields.analysis:old?.analysis;
    const result=base.addNote(s,fields),saved=s.notes.find(n=>n.id===result.id);
    if(kept)saved.analysis=copy(kept);else delete saved.analysis;
    if(before&&revisionText(before)!==revisionText(saved))saved.history=[...(saved.history||[]),before];
    return saved;
  }
  // The guide text belongs to the code's data pack (codes/<name>/guide.json): its examples cite that code.
  function guideDefaults(){return {intro:{title:data.guide?.title||'使用说明',body:data.guide?.intro||''},...Object.fromEntries((data.guide?.steps||[]).map((step,i)=>['step'+i,step])),...copy(data.guide?.tips||{}),...copy(data.guide?.own||{})};}
  // An edit that matches the current default, apart from line breaks and list marks, adds nothing; let later defaults show through.
  function dropDefaultGuideEdits(s){
    const plain=x=>String(x||'').replace(/^\s*[-－•]\s*/gm,'').replace(/\s+/g,''),defaults=guideDefaults();
    for(const [key,entry] of Object.entries(s.guideEdits)){const d=defaults[key];if(d&&['title','body','example','action','unitId'].every(f=>plain(entry?.[f])===plain(d[f])))delete s.guideEdits[key];}
  }
  function guideEntries(s){return Object.entries({...guideDefaults(),...s.guideEdits}).map(([key,entry])=>({key,...entry}));}
  function validateGuide(key,entry){
    if(!Object.hasOwn(guideDefaults(),key)&&!/^tip-[a-zA-Z0-9-]{1,80}$/.test(key))throw Error('使用说明条目无效。');
    if(!entry||typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>120||typeof entry.body!=='string'||!entry.body.trim()||entry.body.length>12000||!Number.isFinite(Date.parse(entry.updatedAt)))throw Error('请填写说明标题与正文。');
    for(const field of ['example','action'])if(entry[field]!==undefined&&(typeof entry[field]!=='string'||entry[field].length>6000))throw Error('说明内容过长。');
    if(entry.unitId&&!base.get(entry.unitId))throw Error('说明关联的条文不存在。');
  }
  const uniqueEntries=entries=>[...new Map(entries.map(e=>[JSON.stringify(e),e])).values()];
  function saveGuide(s,key,fields){
    const entry={title:fields.title.trim(),body:fields.body.trim(),example:(fields.example||'').trim(),action:(fields.action||'').trim(),unitId:fields.unitId||'',updatedAt:base.timestamp()};validateGuide(key,entry);
    if(s.guideEdits[key])s.guideHistory[key]=uniqueEntries([...(s.guideHistory[key]||[]),s.guideEdits[key]]);
    s.guideEdits[key]=entry;return entry;
  }
  function incorporateMaterial(s,file,fields){
    if(!file||!base.version(fields.unitId,fields.year)?.exists)throw Error('请选择该年份存在的条文。');
    if(!['note','material'].includes(fields.destination))throw Error('请选择材料用途。');
    if(!fields.reason.trim())throw Error('请填写自己的理解或关联理由。');
    const trial=copy(s),material={id:base.id(),unitId:fields.unitId,year:fields.year,title:file.name,type:'本地材料',url:file.url||'',sourceText:fields.text,reason:fields.reason,question:fields.question,methods:base.tags(fields.methods),verification:'待核',evidenceRole:'背景',createdAt:base.timestamp(),attachmentId:file.id,attachmentName:file.name};
    trial.materials.push(material);
    const note=fields.destination==='note'?base.addNote(trial,{unitId:fields.unitId,year:fields.year,text:fields.reason,question:fields.question,methods:material.methods,evidenceIds:[material.id]}):null;
    validate(trial);s.materials=trial.materials;s.notes=trial.notes;return {material,note};
  }
  // Scope kinds: 'constitution' (the whole code; the name predates other codes), 'amendment',
  // 'articles', 'structure' (a 章 or 节 of the code, by node id) and 'group' (one of the reader's own 部分).
  // A group may later be deleted; its relations stay and say so.
  function validateScope(scope){
    if(!scope||!['constitution','amendment','articles','structure','group'].includes(scope.kind)||!base.years.includes(scope.year)||!Array.isArray(scope.unitIds))throw Error('请选择材料关联范围。');
    if(scope.kind==='amendment'&&scope.year===base.years[0])throw Error('请选择一次修正案。');
    if(scope.kind==='articles'&&(!scope.unitIds.length||scope.unitIds.length>base.units.length||new Set(scope.unitIds).size!==scope.unitIds.length||scope.unitIds.some(id=>!base.version(id,scope.year)?.exists)))throw Error('请至少选择一个该年份存在的法条或序言段落。');
    if(scope.kind==='structure'&&!base.node(scope.nodeId,scope.year))throw Error('请选择该年份存在的一章或一节。');
    if(scope.kind==='group'&&(typeof scope.groupId!=='string'||!/^[\w-]{1,120}$/.test(scope.groupId)))throw Error('请选择自己划分的部分。');
    if(scope.kind!=='articles'&&scope.unitIds.length)throw Error('整体关联无需指定条文。');
    return scope;
  }
  // Categories of linked material declared by the data pack, e.g. 比较阅读 and 备案审查 for the constitution;
  // details holds the category's own fields (比较对象、国家或地区…). Records without a category are ordinary materials.
  // 跨法典关联 is built in: any code can link an article to an article of another code.
  const BUILTIN={crosscode:{name:'跨法典关联',materialType:'跨法典关联',fields:[['code','法典'],['article','条文']],intro:'把本条与其他法典、其他法律的条文联系起来，写明关系和理由。装有对方的数据包时，可以直接打开那一条。',newLabel:'关联其他法典的条文',reasonLabel:'关联理由',titlePlaceholder:'如：民法典第一千一百六十五条',emptyTitle:'还没有跨法典关联。',empty:'在法条精读中，可以把本条与民法典、刑法等其他法典的条文联系起来。'}};
  const categories=()=>({...(data.codex?.relationCategories||{}),...BUILTIN});
  function cleanDetails(category,details){
    if(!category)return undefined;
    const fields=categories()[category]?.fields||[],out={};
    for(const [key] of fields){const value=String(details?.[key]??'').trim();if(value)out[key]=value.slice(0,2000);}
    return out;
  }
  function addMaterialRelation(s,file,fields){
    validateScope(fields.scope);const trial=copy(s),createdAt=base.timestamp();
    if(!fields.reason?.trim())throw Error('请写明关联理由或自己的理解。');
    const category=fields.category&&categories()[fields.category]?fields.category:undefined;
    const r={id:base.id(),scope:copy(fields.scope),title:file.name,text:fields.reason.trim(),sourceText:fields.text||'',question:fields.question||'',methods:base.tags(fields.methods||''),destination:fields.destination,method:fields.ai?'ai':'manual',createdAt,updatedAt:createdAt,...(file.id?{attachmentId:file.id}:{}),url:file.url||'',...(fields.ai?{ai:copy(fields.ai)}:{}),...(category?{category,details:cleanDetails(category,fields.details)}:{})};
    trial.materialRelations.push(r);
    if(r.scope.kind==='articles')for(const unitId of r.scope.unitIds){
      const material={id:base.id(),unitId,year:r.scope.year,title:r.title,type:category?categories()[category].materialType||categories()[category].name:r.ai?'智能辅助整理':'关联材料',url:r.url,sourceText:r.sourceText,reason:r.text,question:r.question,methods:r.methods,verification:r.ai?.verification==='reviewed'?'已核对原文':'待核',createdAt,...(file.id?{attachmentId:file.id,attachmentName:file.name}:{})};
      trial.materials.push(material);
      if(r.destination==='note'){
        const note=base.addNote(trial,{unitId,year:r.scope.year,text:r.text,question:r.question,methods:r.methods,evidenceIds:[material.id]});
        if(r.ai)note.ai=copy(r.ai);
      }
    }
    validate(trial);s.materialRelations=trial.materialRelations;s.materials=trial.materials;s.notes=trial.notes;return r;
  }
  function editMaterialRelation(s,id,fields){
    const trial=copy(s),r=trial.materialRelations.find(r=>r.id===id);if(!r)throw Error('关联记录不存在。');
    if(!fields.text?.trim())throw Error('请保留关联理由。');
    const before=revision(r);
    Object.assign(r,{text:fields.text.trim(),question:fields.question||'',methods:base.tags(fields.methods||''),updatedAt:base.timestamp()});
    if(r.category&&fields.details)r.details=cleanDetails(r.category,fields.details);
    if(revisionText(before)!==revisionText(r))r.history=[...(r.history||[]),before];
    if(r.ai&&fields.verified)r.ai.verification='reviewed';validate(trial);s.materialRelations=trial.materialRelations;return r;
  }
  function acceptProposal(s,p,fields){
    if(fields.verified!==true)throw Error('请先审阅建议并核对来源，再决定收入。');
    const existing=s.materialRelations.find(r=>r.ai?.proposalId===p.id);if(existing)return existing;
    const scope=fields.scope;validateScope(scope);
    if(p.proposalKind==='link'&&(scope.kind!=='articles'||scope.unitIds.length<2))throw Error('请至少选择两个条文来建立关联。');
    const trial=copy(s),original={text:p.text,question:p.question||'',methods:copy(p.methods||[]),excerpt:p.excerpt,title:p.title,createdAt:p.createdAt};
    const r=addMaterialRelation(trial,{id:p.attachmentId,name:p.title,url:p.url},{...fields,text:p.excerpt,destination:p.proposalKind==='link'?'material':'note',ai:{proposalId:p.id,model:p.model,generatedAt:p.createdAt,verification:'reviewed',original}});
    if(p.proposalKind==='link'){const l=base.addLink(trial,{from:[base.whole(scope.unitIds[0],scope.year)],to:scope.unitIds.slice(1).map(id=>base.whole(id,scope.year)),reason:fields.reason});l.agentProposalId=p.id;}
    validate(trial);for(const key of ['notes','materials','materialRelations','links'])s[key]=trial[key];return r;
  }
  const subtitle=(s,unitId)=>s.subtitles[unitId]?.title||data.subtitles?.[unitId]||'';
  function setSubtitle(s,unitId,title){
    title=title.trim();if(!base.get(unitId)||!title||title.length>80)throw Error('请填写 1—80 字的条旨。');
    if(s.subtitles[unitId]&&s.subtitles[unitId].title!==title)s.subtitleHistory[unitId]=[...new Set([...(s.subtitleHistory[unitId]||[]),s.subtitles[unitId].title])];
    s.subtitles[unitId]={title,updatedAt:base.timestamp()};
  }
  function card(s,unitId,year){return s.memoryCards[unitId+'@'+year]||{unitId,year,keywords:[],mode:'whole',due:0,interval:0,repetitions:0,rating:'new',updatedAt:base.timestamp()};}
  function saveCard(s,unitId,year,keywords,mode){
    const c={...card(s,unitId,year),keywords:[...new Set(keywords.map(x=>x.trim()).filter(Boolean))],mode,updatedAt:base.timestamp()};
    const trial=copy(s);trial.memoryCards[unitId+'@'+year]=c;validate(trial);s.memoryCards=trial.memoryCards;return c;
  }
  function rateCard(s,unitId,year,rating,time=Date.now()){
    if(!['again','hard','good','easy'].includes(rating))throw Error('复习评价无效。');
    const c=card(s,unitId,year),old=c.interval||0;
    const days=rating==='again'?0:rating==='hard'?Math.max(1,Math.round(old*1.2)):rating==='good'?Math.max(1,Math.round(old*2.2)):Math.max(4,Math.round(old*3));
    const next={...c,rating,interval:days,repetitions:c.repetitions+1,due:time+(rating==='again'?60000:days*86400000),updatedAt:base.timestamp()};
    if(!base.version(unitId,year)?.exists)throw Error('该年没有此条正文。');
    s.memoryCards[unitId+'@'+year]=next;return next;
  }
  function cloze(text,keywords){
    const ranges=[];
    for(const keyword of keywords){let at=0;while(keyword&&(at=text.indexOf(keyword,at))>=0){ranges.push([at,at+keyword.length]);at+=keyword.length;}}
    ranges.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);const merged=[];
    for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
    const result=[];let cursor=0;for(const [start,end] of merged){if(start>cursor)result.push({text:text.slice(cursor,start),hidden:false});result.push({text:text.slice(start,end),hidden:true});cursor=end;}if(cursor<text.length)result.push({text:text.slice(cursor),hidden:false});return result;
  }
  function comparisonRows(unitId,year){
    // Rows are aligned once when the model is created; see refineRevisions in model.js.
    return base.years.indexOf(year)>0?base.version(unitId,year)?.rows||[]:[];
  }
  function merge(current,incoming){
    current=migrate(current);incoming=migrate(incoming);const result=base.merge(current,incoming),s=normalize(result.state);
    for(const [id,t] of Object.entries(incoming.subtitles)){
      const old=s.subtitles[id];
      if(!old){s.subtitles[id]=t;result.added++;}else if(old.title!==t.title){s.subtitleHistory[id]=[...new Set([...(s.subtitleHistory[id]||[]),old.title,t.title])];if(t.updatedAt>old.updatedAt)s.subtitles[id]=t;result.conflicts++;}
    }
    for(const [id,titles] of Object.entries(incoming.subtitleHistory))s.subtitleHistory[id]=[...new Set([...(s.subtitleHistory[id]||[]),...titles])];
    for(const [key,c] of Object.entries(incoming.memoryCards)){
      const old=s.memoryCards[key];if(!old)s.memoryCards[key]=c;
      else s.memoryCards[key]={...(old.updatedAt>=c.updatedAt?old:c),keywords:[...new Set([...old.keywords,...c.keywords])].slice(0,60)};
    }
    for(const [key,entry] of Object.entries(incoming.guideEdits)){
      const old=s.guideEdits[key];
      if(!old){s.guideEdits[key]=entry;result.added++;}
      else if(JSON.stringify(old)!==JSON.stringify(entry)){
        s.guideHistory[key]=uniqueEntries([...(s.guideHistory[key]||[]),old,entry]);
        if(entry.updatedAt>old.updatedAt||(entry.updatedAt===old.updatedAt&&JSON.stringify(entry)>JSON.stringify(old)))s.guideEdits[key]=entry;
        result.conflicts++;
      }
    }
    for(const [key,entries] of Object.entries(incoming.guideHistory))s.guideHistory[key]=uniqueEntries([...(s.guideHistory[key]||[]),...entries]);
    const relationSignature=r=>JSON.stringify(Object.fromEntries(Object.entries(r).filter(([key])=>!['id','conflictOf'].includes(key)).sort(([a],[b])=>a.localeCompare(b))));
    for(const record of incoming.materialRelations){
      const existing=s.materialRelations.find(r=>r.id===record.id);
      if(!existing){s.materialRelations.push(record);result.added++;}
      else if(JSON.stringify(existing)!==JSON.stringify(record)&&!s.materialRelations.some(r=>r.conflictOf===record.id&&relationSignature(r)===relationSignature(record))){
        s.materialRelations.push({...record,id:base.id(),conflictOf:record.id});result.conflicts++;
      }
    }
    const markKey=m=>[m.style,base.anchorKey(m.anchor)].join('|');
    for(const m of incoming.marks){
      if(s.marks.some(x=>markKey(x)===markKey(m)))continue;
      s.marks.push({...m,id:s.marks.some(x=>x.id===m.id)?base.id():m.id});result.added++;
    }
    result.state=validate(s);return result;
  }
  return {MARK_STYLES,toggleMark,clearMarks,markedRanges,...base,validateAnalysis,relationType,normalize,validate,migrate,fresh,reconcileSnapshot,addNote,guideEntries,saveGuide,incorporateMaterial,validateScope,categories,addMaterialRelation,editMaterialRelation,acceptProposal,subtitle,setSubtitle,card,saveCard,rateCard,cloze,comparisonRows,merge};
}

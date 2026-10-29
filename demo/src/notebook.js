'use strict';

// Personal workspaces extend the original record format without discarding v1/v2 data.
function createNotebookModel(data) {
  const base = createCoreNotebookModel(data);
  const copy = value => JSON.parse(JSON.stringify(value));
  // The four interpretation methods as commonly taught; users may add their own tags.
  const methods = ['文义解释', '体系解释', '历史解释', '目的解释'];
  // Further methods offered beside the four basic ones; users may add any tag of their own.
  const optionalMethods = ['比较法解释', ...Object.values(data.frameworks || {}).map(f => f.method).filter(Boolean)];
  // Earlier versions stored short tags. They are shown under the doctrinal names;
  // stored notes keep their original text until the user edits them.
  const methodAliases = {'文义':'文义解释','文意':'文义解释','文意解释':'文义解释','体系':'体系解释','结构':'体系解释','体系／结构':'体系解释','体系 / 结构':'体系解释','体系/结构':'体系解释','原意':'原意解释','历史':'历史解释','目的':'目的解释'};
  const methodLabel = tag => methodAliases[tag] || tag;
  const methodLabels = list => [...new Set((list || []).map(methodLabel))];
  const tags = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[，,；;\n]/)).map(x => x.trim()).filter(Boolean))].slice(0, 20);
  // The code's own structure (编、章、节…) comes from its data pack; nodes cover a run of units
  // and are numbered per year among the siblings that exist in that year.
  const codex = data.codex || {structure: [], levels: {}};
  const unitIndex = new Map(base.units.map((u, i) => [u.id, i]));
  const CN = '零一二三四五六七八九';
  const cnOrdinal = n => n < 10 ? CN[n] : n < 20 ? '十' + (n % 10 ? CN[n % 10] : '') : n < 100 ? CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '') : String(n);
  const trees = new Map();
  // Numbering: among siblings by default. A level with "numberWithin": "<level>" counts on through the
  // nearest enclosing node of that level (民法典 chapters run on across 分编 within a 编). A node's own
  // "number" or "title" overrides the generated one.
  function tree(year) {
    if (trees.has(year)) return trees.get(year);
    const counters = new Map();
    const build = (nodes, depth, parent, ancestors) => {
      return nodes.map(node => {
        const from = unitIndex.get(node.from), to = unitIndex.get(node.to);
        if (from === undefined || to === undefined) throw Error(`目录节点 ${node.id} 的起止条文不存在。`);
        const unitIds = base.units.slice(from, to + 1).filter(u => base.version(u.id, year)?.exists).map(u => u.id);
        if (!unitIds.length) return null;
        const level = codex.levels?.[node.level] || {name: ''};
        const names = Object.entries(node.names || {}).filter(([y]) => Number(y) <= year).sort((x, y) => x[0] - y[0]);
        const name = names.length ? names.at(-1)[1] : node.name;
        const scope = (level.numberWithin && [...ancestors].reverse().find(a => a.level === level.numberWithin)?.id) || parent?.id || '';
        const key = node.level + '@' + scope, number = node.number ?? (counters.get(key) || 0) + 1;
        counters.set(key, number);
        const title = node.title || (level.numbered ? `第${cnOrdinal(number)}${level.name}　${name}` : name);
        const result = {id: node.id, level: node.level, name, title, depth, unitIds, parent: parent?.id || null, law: !!node.law};
        result.children = build(node.children || [], depth + 1, result, [...ancestors, result]);
        return result;
      }).filter(Boolean);
    };
    const roots = build(codex.structure || [], 0, null, []);
    const flat = [], walk = list => { for (const node of list) { flat.push(node); walk(node.children); } };
    walk(roots);
    const value = {roots, flat};
    trees.set(year, value);
    return value;
  }
  const node = (id, year) => tree(year).flat.find(n => n.id === id) || null;
  // Packs that bring several laws together (e.g. 网络法典) mark each law's top node with "law":
  // {name, short, aliases, citation}. A unit's law decides its citation and the name shown in lists.
  const laws = (codex.structure || []).filter(n => n.law).map(n => ({nodeId: n.id, ...n.law}));
  const lawCache = new Map();
  function lawOf(unitId) {
    if (!laws.length) return null;
    if (!lawCache.has(unitId)) { const id = base.years.map(y => path(unitId, y).find(n => n.law)?.id).find(Boolean); lawCache.set(unitId, laws.find(l => l.nodeId === id) || null); }
    return lawCache.get(unitId);
  }
  // Outermost first, e.g. [第三章 国家机构, 第一节 全国人民代表大会].
  const path = (unitId, year) => tree(year).flat.filter(n => n.unitIds.includes(unitId));
  // The first year in which a node has any unit: a law joining a code later starts there, so its
  // articles count as original text in that year rather than as additions.
  function sectionList(year) {
    return tree(year).flat.filter(n => n.depth > 0).map(n => ({id: n.id, title: n.title, unitIds: n.unitIds}));
  }
  // Scopes: 'all', 'node:<id>', and the older 'chapter:<id>' / 'section:<id>'.
  function scopeUnits(scope, year) {
    if (scope === 'all') return base.units.filter(u => base.version(u.id, year).exists);
    const target = node(scope.split(':')[1], year), ids = new Set(target?.unitIds || []);
    return base.units.filter(u => ids.has(u.id));
  }
  function normalize(input, seed = true) {
    const s = copy(input);
    s.notebookVersion = 3;
    for (const key of ['groups','groupLinks','people','discussions','installedExamples']) if (s[key] === undefined) s[key] = [];
    for (const n of s.notes) { n.methods ||= []; n.question ||= ''; n.evidenceIds ||= []; }
    if (seed) for (const example of data.seedNotes || []) {
      if (s.installedExamples.includes(example.id)) continue;
      // Stable seed IDs and a ledger keep edited/deleted examples from reappearing.
      if (!s.notes.some(n => n.id === example.id)) {
        const v = base.version(example.unitId, example.year);
        const block = v.paragraphs.findIndex(p => p.includes(example.word));
        const start = v.paragraphs[block].indexOf(example.word);
        const n = base.addNote(s,{unitId:example.unitId,year:example.year,text:example.text,anchors:[base.anchor(example.unitId,example.year,block,start,start+example.word.length)]});
        Object.assign(n,{id:example.id,methods:example.methods,question:example.question,evidenceIds:[],source:example.source,example:true});
        for (const other of example.related || []) base.addLink(s,{from:n.anchors,to:[base.whole(other,example.year)],reason:'示例笔记中的共同阅读范围；关联关系由使用者继续判断。'});
      }
      s.installedExamples.push(example.id);
    }
    if (seed) for (const imported of data.importedNotes || []) {
      if (s.installedExamples.includes(imported.id)) continue;
      if (!s.notes.some(n => n.id === imported.id)) {
        const n = base.addNote(s,{unitId:imported.unitId,year:imported.year,text:imported.text,anchors:[base.whole(imported.unitId,imported.year)]});
        Object.assign(n,{id:imported.id,methods:[],question:'',evidenceIds:[],source:copy(imported.source),imported:true});
      }
      s.installedExamples.push(imported.id);
    }
    return s;
  }
  function validate(s) {
    base.validate(s);
    const str = (x,n=200000) => typeof x === 'string' && x.length <= n;
    const date = x => str(x,50) && Number.isFinite(Date.parse(x));
    const anchors = xs => Array.isArray(xs) && xs.length > 0 && xs.length <= 10000 && xs.every(base.anchorValid);
    for (const key of ['groups','groupLinks','people','discussions']) {
      if (!Array.isArray(s[key]) || s[key].length > 30000) throw Error('个人工作区数据格式无效。');
      const seen = new Set();
      for (const x of s[key]) {
        if (!x || !str(x.id,120) || !/^[\w-]+$/.test(x.id) || seen.has(x.id) || !date(x.createdAt)) throw Error('工作区记录标识或日期无效。');
        seen.add(x.id);
      }
    }
    if (!Array.isArray(s.installedExamples) || !s.installedExamples.every(x=>str(x,120))) throw Error('示例笔记记录无效。');
    for (const n of s.notes) {
      if (!Array.isArray(n.methods) || !n.methods.every(t=>str(t,100)) || !str(n.question) || !Array.isArray(n.evidenceIds) || !n.evidenceIds.every(x=>str(x,120))) throw Error('笔记的解释标签或问题无效。');
      if (n.source && (!str(n.source.file,500) || !(Number.isInteger(n.source.page) || str(n.source.location,1000)&&n.source.location.trim()) || !str(n.source.excerpt))) throw Error('笔记来源无效。');
    }
    for (const m of s.materials) {
      if (m.methods!==undefined&&(!Array.isArray(m.methods)||!m.methods.every(t=>str(t,100))) || m.question!==undefined&&!str(m.question) || m.sourceDate!==undefined&&!str(m.sourceDate,200) || m.amendmentYear!==undefined&&m.amendmentYear!==null&&!base.years.includes(m.amendmentYear) || m.evidenceRole!==undefined&&!['背景','支持','质疑','补充'].includes(m.evidenceRole) || m.verification!==undefined&&!['待核','已核对原文'].includes(m.verification)) throw Error('解释材料的标签、年代或核验状态无效。');
    }
    for (const d of Object.values(s.drafts)) if (d.methods!==undefined&&(!Array.isArray(d.methods)||!d.methods.every(t=>str(t,100))) || d.question!==undefined&&!str(d.question) || d.evidenceIds!==undefined&&(!Array.isArray(d.evidenceIds)||!d.evidenceIds.every(x=>str(x,120)))) throw Error('草稿中的解释问题或材料引用无效。');
    const groups = new Map(s.groups.map(g=>[g.id,g]));
    for (const g of s.groups) {
      if (!str(g.name,120) || !g.name.trim() || !str(g.description) || !anchors(g.anchors) || !date(g.updatedAt) || g.parentId && !groups.has(g.parentId)) throw Error('自定义部分的名称、范围或上级无效。');
      const visited = new Set([g.id]); let parent=g.parentId;
      while (parent) { if (visited.has(parent)) throw Error('自定义部分不能循环嵌套。'); visited.add(parent); parent=groups.get(parent).parentId; }
    }
    for (const l of s.groupLinks) if (!groups.has(l.fromId)||!groups.has(l.toId)||l.fromId===l.toId||!str(l.relation,120)||!str(l.reason)) throw Error('部分之间的关联无效。');
    const people = new Set(s.people.map(p=>p.id));
    for (const p of s.people) if (!str(p.name,120)||!p.name.trim()) throw Error('成员名称无效。');
    for (const t of s.discussions) {
      if (!str(t.title,200)||!t.title.trim()||!str(t.question)||!date(t.updatedAt)||!Array.isArray(t.members)||!t.members.length||t.members.some(m=>!people.has(m.personId)||!['read','comment'].includes(m.role))||new Set(t.members.map(m=>m.personId)).size!==t.members.length||!Array.isArray(t.notes)||!Array.isArray(t.comments)||typeof t.archived!=='boolean') throw Error('讨论主题、成员或权限无效。');
      for (const n of t.notes) if (!str(n.noteId,120)||!str(n.text)||!str(n.question||'')||!base.get(n.unitId)||!base.years.includes(n.year)||!Array.isArray(n.anchors)||!n.anchors.every(base.anchorValid)||!Array.isArray(n.methods)||!n.methods.every(x=>str(x,100))) throw Error('共享笔记快照无效。');
      const comments = new Set();
      for (const c of t.comments) {
        if (!str(c.id,120)||comments.has(c.id)||!str(c.text)||!c.text.trim()||!date(c.createdAt)||c.authorId!=='self'&&!people.has(c.authorId)) throw Error('讨论留言无效。');
        comments.add(c.id);
      }
    }
    return s;
  }
  const migrate = input => validate(normalize(base.migrate(input)));
  const fresh = () => validate(normalize(base.fresh()));
  function addNote(s, fields) {
    const previous=s.notes.find(n=>n.id===fields.editId);
    const n=base.addNote(s,{...fields,methods:fields.methods??previous?.methods??[],question:fields.question??previous?.question??'',evidenceIds:fields.evidenceIds??previous?.evidenceIds??[]});
    if (fields.methods !== undefined) n.methods=tags(fields.methods); else n.methods ||= [];
    if (fields.question !== undefined) n.question=fields.question.trim(); else n.question ||= '';
    if (fields.evidenceIds !== undefined) n.evidenceIds=fields.evidenceIds; else n.evidenceIds ||= [];
    return n;
  }
  function saveGroup(s, fields) {
    const old=s.groups.find(g=>g.id===fields.id), stamp=base.timestamp();
    const group={id:old?.id||base.id(),name:fields.name.trim(),description:(fields.description||'').trim(),anchors:base.mergeAnchors(fields.anchors),parentId:fields.parentId||null,createdAt:old?.createdAt||stamp,updatedAt:stamp};
    const candidate=copy(s); candidate.groups=old?candidate.groups.map(g=>g.id===old.id?group:g):[...candidate.groups,group];
    validate(candidate); s.groups=candidate.groups; return group;
  }
  // Deleting a part keeps the text and notes; its links to other parts go with it, and its sub-parts become independent.
  function deleteGroup(s, id) {
    if (!s.groups.some(g=>g.id===id)) throw Error('这个部分已不存在。');
    const candidate=copy(s);
    candidate.groups=candidate.groups.filter(g=>g.id!==id).map(g=>g.parentId===id?{...g,parentId:null,updatedAt:base.timestamp()}:g);
    candidate.groupLinks=candidate.groupLinks.filter(l=>l.fromId!==id&&l.toId!==id);
    validate(candidate); s.groups=candidate.groups; s.groupLinks=candidate.groupLinks;
  }
  function connectGroups(s, {fromId,toId,relation,reason}) {
    const l={id:base.id(),fromId,toId,relation:relation.trim()||'关联',reason:reason.trim(),createdAt:base.timestamp()};
    const candidate=copy(s); candidate.groupLinks.push(l); validate(candidate); s.groupLinks=candidate.groupLinks; return l;
  }
  function addPerson(s,name) {
    name=name.trim(); if (!name||name.length>120) throw Error('请填写成员名称。');
    const old=s.people.find(p=>p.name===name); if (old) return old;
    const p={id:base.id(),name,createdAt:base.timestamp()};s.people.push(p);return p;
  }
  const canRead = (t, personId='self') => personId==='self'||t.members.some(m=>m.personId===personId);
  const canComment = (t, personId='self') => !t.archived&&(personId==='self'||t.members.some(m=>m.personId===personId&&m.role==='comment'));
  function saveDiscussion(s,fields) {
    const old=s.discussions.find(t=>t.id===fields.id), stamp=base.timestamp();
    const notes=fields.noteIds.map(id=>{const n=s.notes.find(n=>n.id===id);if(!n)throw Error('所选笔记不存在。');return {noteId:n.id,unitId:n.unitId,year:n.year,text:n.text,question:n.question,methods:[...n.methods],anchors:copy(n.anchors),...(n.ai?{ai:{model:n.ai.model,proposalId:n.ai.proposalId,verification:n.ai.verification,generatedAt:n.ai.generatedAt}}:{})};});
    const t={id:old?.id||base.id(),title:fields.title.trim(),question:fields.question.trim(),members:copy(fields.members),notes,comments:old?.comments||[],createdAt:old?.createdAt||stamp,updatedAt:stamp,archived:old?.archived||false};
    const candidate=copy(s);candidate.discussions=old?candidate.discussions.map(x=>x.id===old.id?t:x):[...candidate.discussions,t];
    validate(candidate);s.discussions=candidate.discussions;return t;
  }
  function addComment(s,threadId,authorId,text) {
    const t=s.discussions.find(t=>t.id===threadId);
    if (!t||!canComment(t,authorId)) throw Error('这个成员没有留言权限，或主题已归档。');
    if(!text.trim()||text.length>20000)throw Error('留言需要 1—20000 个字。');
    const c={id:base.id(),authorId,text:text.trim(),createdAt:base.timestamp()};t.comments.push(c);t.updatedAt=base.timestamp();return c;
  }
  function merge(current,incoming) {
    incoming=migrate(incoming);current=migrate(current);
    const result=base.merge(current,incoming),s=result.state;
    const same=(a,b)=>{const trim=x=>{const o=copy(x);delete o.id;return JSON.stringify(o);};return trim(a)===trim(b);};
    function append(key, records) {
      const mapping=new Map();
      for(const item of records) {
        const exact=s[key].find(x=>same(x,item)); if(exact){mapping.set(item.id,exact.id);continue;}
        const collision=s[key].some(x=>x.id===item.id), record={...copy(item),id:collision?base.id():item.id};
        s[key].push(record);mapping.set(item.id,record.id);collision?result.conflicts++:result.added++;
      }
      return mapping;
    }
    const groupMap=new Map();
    // Import parents before children so all references can be remapped deterministically.
    let waiting=[...incoming.groups];
    while(waiting.length){const ready=waiting.filter(g=>!g.parentId||groupMap.has(g.parentId));if(!ready.length)throw Error('部分层级存在循环。');for(const g of ready){const m=append('groups',[{...g,parentId:g.parentId?groupMap.get(g.parentId):null}]);groupMap.set(g.id,m.get(g.id));}waiting=waiting.filter(g=>!groupMap.has(g.id));}
    append('groupLinks',incoming.groupLinks.map(l=>({...l,fromId:groupMap.get(l.fromId),toId:groupMap.get(l.toId)})));
    const personMap=append('people',incoming.people);
    append('discussions',incoming.discussions.map(t=>({...t,members:t.members.map(m=>({...m,personId:personMap.get(m.personId)})),comments:t.comments.map(c=>({...c,authorId:c.authorId==='self'?'self':personMap.get(c.authorId)}))})));
    s.installedExamples=[...new Set([...s.installedExamples,...incoming.installedExamples])];
    validate(s);return result;
  }
  function lineage(unitId) {
    let tokens=[];
    for(const year of base.years) {
      const v=base.version(unitId,year);if(year===base.years[0]){tokens=Array.from(v.paragraphs.join('\n'),text=>({text,born:year,removed:null}));continue;}
      const next=[];let cursor=0;
      const retired=()=>{while(tokens[cursor]?.removed)next.push({...tokens[cursor++]});};
      const consume=(text,removed=false,editorial=false)=>{for(const ch of text){retired();const token=tokens[cursor++];if(!token||token.text!==ch)throw Error('修订合览与原文不一致。');next.push({...token,...(removed?{removed:year,removedEditorial:editorial}:{})});}};
      for(const op of v.diff) {
        if(op.type==='equal')consume(op.text);
        else if(op.type==='delete')consume(op.text,true);
        else if(op.type==='insert'){retired();for(const text of op.text)next.push({text,born:year,removed:null});}
        else if(op.type==='editorial'){consume(op.previousText,true,true);retired();for(const text of op.text)next.push({text,born:year,removed:null,bornEditorial:true});}
      }
      retired();if(cursor!==tokens.length)throw Error('修订合览有未处理的原文。');tokens=next;
    }
    const segments=[];
    for(const t of tokens){const last=segments.at(-1);if(last&&last.born===t.born&&last.removed===t.removed&&!!last.bornEditorial===!!t.bornEditorial&&!!last.removedEditorial===!!t.removedEditorial)last.text+=t.text;else segments.push({...t});}
    return segments;
  }
  return {...base,codex,tree,node,path,laws,lawOf,methods,optionalMethods,methodLabel,methodLabels,tags,sectionList,scopeUnits,migrate,fresh,validate,addNote,saveGroup,deleteGroup,connectGroups,addPerson,canRead,canComment,saveDiscussion,addComment,merge,lineage};
}

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const data=require('./test-data.cjs')();
const context=vm.createContext({data,URL,Intl,crypto:require('node:crypto').webcrypto});
vm.runInContext(['model.js','notebook.js','learning-model.js'].map(x=>read('src/'+x)).join('\n'),context);
const M=vm.runInContext('createLearningModel(data)',context),s=M.fresh();
assert.equal(Object.keys(data.subtitles).length,156);assert.equal(M.subtitle(s,'a37'),'人身自由');
for(const u of M.units)for(let i=1;i<M.years.length;i++){
  const y=M.years[i],rows=M.comparisonRows(u.id,y);
  assert.equal(rows.filter(r=>r.before).map(r=>r.before.text).join('\n'),M.version(u.id,M.years[i-1]).paragraphs.join('\n'));
  assert.equal(rows.filter(r=>r.after).map(r=>r.after.text).join('\n'),M.version(u.id,y).paragraphs.join('\n'));
}
const humanRows=M.comparisonRows('a33',2004);assert.equal(humanRows.filter(r=>r.changed).length,1);assert.equal(humanRows.find(r=>r.changed).before,null);
M.setSubtitle(s,'a37','人身自由与逮捕程序');assert.equal(M.subtitle(s,'a37'),'人身自由与逮捕程序');
const restored=M.migrate(JSON.parse(JSON.stringify(s)));assert.equal(M.subtitle(restored,'a37'),'人身自由与逮捕程序');
M.addNote(s,{unitId:'a37',year:2018,text:'',question:'批准与执行如何区分？'});
assert.throws(()=>M.addNote(s,{unitId:'a37',year:2018,text:'',question:''}));
M.saveCard(s,'a37',2018,['人民检察院','人民法院','执行'],'keywords');
const paragraphs=M.version('a37',2018).paragraphs;
for(const p of paragraphs){const parts=M.cloze(p,M.card(s,'a37',2018).keywords);assert.equal(parts.map(x=>x.text).join(''),p);}
assert.equal(M.cloze('甲甲乙',['甲','甲乙']).filter(x=>x.hidden).map(x=>x.text).join(''),'甲甲乙');
assert.throws(()=>M.saveCard(s,'a37',2018,['不存在的内容'],'keywords'));
const due=M.rateCard(s,'a37',2018,'again',1000);assert.equal(due.due,61000);
assert.equal(M.card(s,'a37',1982).rating,'new');
const good=M.rateCard(s,'a37',2018,'good',1000);assert.equal(good.interval,1);
assert.equal(M.rateCard(s,'a37',2018,'good',1000).interval,2);
assert.equal(M.rateCard(s,'a37',2018,'easy',1000).interval,6);
M.saveCard(s,'a37',1982,['人身自由'],'keywords');
assert.equal(M.card(s,'a37',1982).keywords[0],'人身自由');assert.equal(M.card(s,'a37',2018).keywords.length,3);
const other=M.fresh();M.setSubtitle(other,'a37','逮捕程序与人身保障');M.saveCard(other,'a37',2018,['公安机关'],'keywords');
const merged=M.merge(s,other).state;
assert(merged.subtitleHistory.a37.includes('人身自由与逮捕程序'));assert(merged.subtitleHistory.a37.includes('逮捕程序与人身保障'));
assert.equal(merged.memoryCards['a37@2018'].keywords.length,4);
const a=M.addNote(s,{unitId:'a33',year:2018,text:'测试整理',question:'测试问题'});a.ai={model:'test',proposalId:'test-id',verification:'pending'};
M.addNote(s,{unitId:'a33',year:2018,editId:a.id,text:'经过编辑的整理'});assert.equal(a.ai.verification,'pending');
const person=M.addPerson(s,'本地测试成员');const discussion=M.saveDiscussion(s,{title:'来源标记测试',question:'',noteIds:[a.id],members:[{personId:person.id,role:'read'}]});assert.equal(discussion.notes[0].ai.model,'test');
M.validate(s);M.validate(M.migrate(JSON.parse(JSON.stringify(s))));
const old=vm.runInContext('createNotebookModel(data).fresh()',context);assert.equal(M.migrate(old).notebookVersion,4);assert.equal(M.migrate(old).notes.length,data.seedNotes.length+(data.importedNotes||[]).length);
console.log('Passed: 156 subtitles, title history, question-only notes, exact cloze masks, version-specific memory cards, review intervals, v3 migration, AI provenance and conflict-preserving backup merge.');
// Editable instructions survive migration and preserve conflicting edits in backups.
const guideState=M.fresh();
assert.equal(M.guideEntries(guideState).filter(e=>e.key.startsWith('step')).length,7);
M.saveGuide(guideState,'step0',{...data.guide.steps[0],body:'用户修改后的说明'});
assert.equal(M.guideEntries(M.migrate(guideState)).find(e=>e.key==='step0').body,'用户修改后的说明');
assert.equal(M.guideEntries(guideState).find(e=>e.key==='tip-material').title,'导入材料后，如何建立关联？');
// An edit equal to the current default, apart from line breaks and list marks, gives way to the default layout.
const introDefault=M.guideEntries(M.fresh()).find(e=>e.key==='intro');
M.saveGuide(guideState,'intro',{title:introDefault.title,body:introDefault.body.replace(/^- /gm,'').replace(/\n/g,'')});
assert.equal(M.migrate(JSON.parse(JSON.stringify(guideState))).guideEdits.intro,undefined);
M.saveGuide(guideState,'intro',{title:introDefault.title,body:introDefault.body+'补充一句。'});
assert.equal(M.migrate(JSON.parse(JSON.stringify(guideState))).guideEdits.intro.body,introDefault.body+'补充一句。');
M.saveGuide(guideState,'tip-custom',{title:'自己的提示',body:'先保存材料出处。'});
M.saveGuide(guideState,'tip-custom',{title:'自己的提示',body:'先保存出处与页码。'});
assert.equal(guideState.guideHistory['tip-custom'].length,1);
assert.equal(M.migrate(JSON.parse(JSON.stringify(guideState))).guideEdits['tip-custom'].body,'先保存出处与页码。');
const alternate=M.fresh();M.saveGuide(alternate,'tip-custom',{title:'另一份提示',body:'保留原文件。'});
alternate.guideEdits['tip-custom'].updatedAt='2099-01-01T00:00:00Z';
const guideMerge=M.merge(guideState,alternate).state;
assert.equal(guideMerge.guideEdits['tip-custom'].title,'另一份提示');
assert.equal(guideMerge.guideHistory['tip-custom'].length,3);
assert.equal(M.merge(guideMerge,alternate).state.guideHistory['tip-custom'].length,3);
assert.throws(()=>M.saveGuide(guideState,'tip-x',{title:'',body:'空标题不保存'}));
assert.throws(()=>M.saveGuide(guideState,'tip-x',{title:'不存在的条文',body:'提示',unitId:'invalid'}));
assert.equal(Object.keys(M.migrate(old).guideEdits).length,0);
const file={id:'a'.repeat(32),name:'材料.txt',url:''};
const beforeNotes=guideState.notes.length;
const incorporated=M.incorporateMaterial(guideState,file,{unitId:'a37',year:2018,destination:'note',question:'材料说明了什么？',text:'来源摘记',reason:'个人理解',methods:'文义'});
assert.equal(guideState.notes.length,beforeNotes+1);
assert.equal(incorporated.note.text,'个人理解');assert.equal(incorporated.material.sourceText,'来源摘记');
assert.equal(incorporated.note.evidenceIds[0],incorporated.material.id);
assert.equal(M.migrate(JSON.parse(JSON.stringify(guideState))).materials.at(-1).attachmentId,file.id);
M.incorporateMaterial(guideState,file,{unitId:'a37',year:2018,destination:'material',question:'',text:'摘记',reason:'待考察的背景',methods:''});
assert.equal(guideState.notes.length,beforeNotes+1);
const stable=JSON.stringify(guideState);
assert.throws(()=>M.incorporateMaterial(guideState,file,{unitId:'a123',year:1982,destination:'note',reason:'x'}));
assert.equal(JSON.stringify(guideState),stable);
console.log('Passed: editable guide persistence, legacy migration, conflict history, attachment-to-note evidence links, material-only route and atomic validation.');
// Materials can relate to the constitution, an amendment, or several articles.
const relationState=M.fresh(),scopeFile={id:'b'.repeat(32),name:'范围测试.txt',url:''};
const relationFields={question:'关联问题',text:'来源摘记',reason:'个人理解',methods:'体系／结构',destination:'note'};
const startCount=relationState.notes.length;
const wholeRelation=M.addMaterialRelation(relationState,scopeFile,{...relationFields,scope:{kind:'constitution',year:2018,unitIds:[]}});
assert.equal(relationState.notes.length,startCount);assert.equal(wholeRelation.scope.kind,'constitution');
const amendmentRelation=M.addMaterialRelation(relationState,scopeFile,{...relationFields,scope:{kind:'amendment',year:2004,unitIds:[]}});
assert.equal(amendmentRelation.scope.year,2004);
M.addMaterialRelation(relationState,scopeFile,{...relationFields,scope:{kind:'articles',year:2018,unitIds:['a33','a37','p13']}});
assert.equal(relationState.notes.length,startCount+3);
for(const id of ['a33','a37','p13']){
  const n=relationState.notes.find(n=>n.unitId===id&&n.text==='个人理解');
  assert(n);assert.equal(relationState.materials.find(m=>m.id===n.evidenceIds[0]).attachmentId,scopeFile.id);
}
const aiRelation=M.addMaterialRelation(relationState,scopeFile,{...relationFields,scope:{kind:'amendment',year:2018,unitIds:[]},ai:{model:'mock',proposalId:'scope-ai',verification:'pending'}});
M.editMaterialRelation(relationState,aiRelation.id,{text:'人工修订的理解',question:'继续核对',methods:'历史',verified:true});
assert.equal(relationState.materialRelations.at(-1).ai.verification,'reviewed');
const relationRestore=M.migrate(JSON.parse(JSON.stringify(relationState)));assert.equal(relationRestore.materialRelations.length,4);
assert.equal(M.merge(M.fresh(),relationRestore).state.materialRelations.length,4);
const relationEdit=M.migrate(relationRestore);M.editMaterialRelation(relationEdit,wholeRelation.id,{text:'另一份备份中的修改'});
// An edited relation replaces the earlier one instead of standing beside it; the earlier wording is in its history.
const relationMerge=M.merge(relationRestore,relationEdit).state;assert.equal(relationMerge.materialRelations.length,4);
assert.equal(relationMerge.materialRelations.find(r=>r.id===wholeRelation.id).text,'另一份备份中的修改');
assert.equal(M.merge(relationMerge,relationEdit).state.materialRelations.length,4);
assert.equal(M.merge(relationEdit,relationRestore).state.materialRelations.find(r=>r.id===wholeRelation.id).text,'另一份备份中的修改','the order of merging does not matter');
assert.throws(()=>M.validateScope({kind:'articles',year:2018,unitIds:[]}));
assert.throws(()=>M.validateScope({kind:'articles',year:1982,unitIds:['a123']}));
assert.throws(()=>M.validateScope({kind:'amendment',year:1982,unitIds:[]}));
const unchanged=JSON.stringify(relationState);
assert.throws(()=>M.addMaterialRelation(relationState,scopeFile,{...relationFields,scope:{kind:'articles',year:2018,unitIds:['a33','bad']}}));
assert.equal(JSON.stringify(relationState),unchanged);
console.log('Passed: whole constitution/amendment associations, multi-article notes and evidence, AI editing, backup merge conflicts, invalid scope rejection.');

// Values from the VM context are compared through JSON (arrays from another realm are not deep-equal).
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
// The data pack: structure tree, scopes on 章、节 and 部分, and the 比较阅读 / 备案审查 categories.
{
  const t2018=M.tree(2018),t1982=M.tree(1982);
  same(t2018.roots.map(n=>n.title),['序言','第一章　总纲','第二章　公民的基本权利和义务','第三章　国家机构','第四章　国旗、国歌、国徽、首都']);
  assert.equal(t1982.roots.at(-1).title,'第四章　国旗、国徽、首都');
  assert.equal(M.sectionList(2018).length,8);assert.equal(M.sectionList(1982).length,7);
  assert.equal(M.sectionList(1982).at(-1).title,'第七节　人民法院和人民检察院');
  same(M.path('a124',2018).map(n=>n.title),['第三章　国家机构','第七节　监察委员会']);
  assert.equal(M.scopeUnits('node:rights',2018).length,24);
  same(M.scopeUnits('chapter:rights',2018).map(u=>u.id),M.scopeUnits('node:rights',2018).map(u=>u.id));
  assert.equal(M.scopeUnits('section:npc',2018)[0].id,'a57');
  assert.equal(M.scopeUnits('all',1982).length,M.units.filter(u=>u.versions[1982].exists).length);
  // Every unit of a year sits under exactly one top-level part.
  for(const year of M.years){const ids=M.tree(year).roots.flatMap(n=>n.unitIds);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,M.units.filter(u=>u.versions[year].exists).length);}
  const s=M.fresh(),startNotes=s.notes.length,file={name:'德国基本法',url:'https://www.gesetze-im-internet.de/gg/art_1.html'};
  const compare=M.addMaterialRelation(s,file,{scope:{kind:'structure',year:2018,nodeId:'rights',unitIds:[]},reason:'相同点与不同点',text:'Die Würde des Menschen ist unantastbar.',destination:'note',methods:'比较法解释',category:'comparative',details:{subject:'外国宪法条款',jurisdiction:'德国',provision:'第一条第一款',stray:'丢弃'}});
  same(compare.details,{subject:'外国宪法条款',jurisdiction:'德国',provision:'第一条第一款'});
  assert.equal(s.notes.length,startNotes,'a structure-wide relation is kept as an overall note, not copied under each article');
  const review=M.addMaterialRelation(s,{name:'审查案例'},{scope:{kind:'articles',year:2018,unitIds:['a45']},reason:'审查对象……',destination:'note',category:'review',details:{standard:'合宪性、合法性'}});
  assert.equal(s.materials.at(-1).type,'备案审查');assert.equal(s.notes.at(-1).unitId,'a45');
  M.editMaterialRelation(s,review.id,{text:'修改后的分析',details:{standard:'合宪性',outcome:'已修改'}});
  same(s.materialRelations.find(r=>r.id===review.id).details,{standard:'合宪性',outcome:'已修改'});
  M.addMaterialRelation(s,{name:'部分'},{scope:{kind:'group',year:2018,groupId:'g-1',unitIds:[]},reason:'与自己划分的部分有关',destination:'material'});
  assert.throws(()=>M.validateScope({kind:'structure',year:1982,nodeId:'supervision',unitIds:[]}),/一章或一节/);
  assert.equal(M.addMaterialRelation(s,{name:'长文'},{scope:{kind:'articles',year:2018,unitIds:['a1']},reason:'x',destination:'material',category:'review',details:{outcome:'x'.repeat(3000)}}).details.outcome.length,2000);
  const bad=JSON.parse(JSON.stringify(s));bad.materialRelations[0].details={'a b':'x'};assert.throws(()=>M.validate(bad),/详细信息/);
  // Backups carry the new records, and older pages' data stays readable.
  const merged=M.merge(M.fresh(),JSON.parse(JSON.stringify(s)));assert.equal(merged.state.materialRelations.length,4);
  assert.equal(M.migrate(JSON.parse(JSON.stringify(s))).materialRelations[0].category,'comparative');
}
// Official English text and 备案审查 paragraphs line up with the Chinese articles.
{
  const E=data.english;
  for(const year of ['1982','2018'])for(const u of M.units.filter(u=>u.versions[year].exists))assert(E.texts[year][u.id]?.length,`${year} ${u.id} 缺英文`);
  assert.equal(Object.values(E.amendments).reduce((n,a)=>n+Object.keys(a.articles).length,0),52);
  assert.match(E.texts['2018'].a37[0],/personal freedom/);assert.match(E.texts['1982'].a37[0],/Freedom of the person/);
  const R=data.reviewHistory;assert(R.documents.length>=20);
  for(const p of R.points){assert(R.documents.some(d=>d.id===p.doc));for(const id of p.units)assert(M.get(id));}
  assert(R.points.some(p=>p.units.includes('a45')&&p.text.includes('最低生活保障')));
}

// 宪法相关法, filing-review cases from the course, 法权分析 stored on a note.
{
  const R=data.relatedLaws;assert.equal(R.laws.length,56);assert(R.laws.every(l=>l.units.length&&l.units.every(id=>M.get(id))));
  assert(R.laws.every(l=>/^https:\/\/flk\.npc\.gov\.cn\/detail\?/.test(l.url)));
  const strict=Object.entries(R.delegations).filter(([,d])=>d.some(x=>x.strict)).map(([id])=>id);assert.equal(strict.length,12);
  for(const [id,list] of Object.entries(R.delegations))for(const d of list)assert.equal(M.version(id,2018).paragraphs[d.block].slice(d.start,d.end),d.text);
  assert.equal(data.reviewHistory.points.filter(p=>p.cases).length,15);
  assert.equal(JSON.stringify(data.frameworks.faquan.categories.map(c=>c.name)),JSON.stringify(['权','法权','剩余权','权利','权力','义务']));
  assert(M.optionalMethods.includes('法权分析')&&M.optionalMethods.includes('比较法解释'));
  const s=M.fresh(),i=M.version('a37',2018).paragraphs[0].indexOf('人身自由');
  const analysis={framework:'faquan',items:[{id:'x1',quote:'人身自由',subject:'citizen',category:'quanli',reason:'个人利益',anchor:M.anchor('a37',2018,0,i,i+4)},{id:'x2',quote:'批准',subject:'state',category:'quanli2',reason:''}],links:[{from:'x1',to:'x2',form:'',facts:''}],balance:'',basis:'童之伟 2019'};
  const n=M.addNote(s,{unitId:'a37',year:2018,text:'分析',methods:['法权分析'],analysis});
  assert.equal(M.relationType(analysis.items[0],analysis.items[1]),'权利—权力');
  const edited=M.addNote(s,{unitId:'a37',year:2018,text:'改过的结论',editId:n.id});
  assert.equal(edited.analysis.items.length,2,'editing the text keeps the analysis');assert.equal(edited.history.length,1);
  assert.equal(M.migrate(JSON.parse(JSON.stringify(s))).notes.find(x=>x.id===n.id).analysis.links.length,1);
  const bad=JSON.parse(JSON.stringify(s));bad.notes.find(x=>x.id===n.id).analysis.links[0].to='nope';assert.throws(()=>M.validate(bad),/法权关系/);
  const bad2=JSON.parse(JSON.stringify(s));bad2.notes.find(x=>x.id===n.id).analysis.items[0].category='法';assert.throws(()=>M.validate(bad2));
  assert(M.merge(M.fresh(),JSON.parse(JSON.stringify(s))).state.notes.some(x=>x.analysis));
  assert(M.categories().crosscode&&M.categories().related);
}
console.log('Passed: data-pack structure tree and scopes, 比较阅读, 备案审查 and course cases, 宪法相关法, 法权分析, official English text.');

// ---------- Merging between devices: the later version stands, deletions hold, turning pages is not a change ----------
{
  const clone=x=>JSON.parse(JSON.stringify(x)),at=min=>new Date(Date.UTC(2026,10,1,8,min)).toISOString();
  const same=(a,b)=>assert.deepEqual(clone(a),b); // values from the model live in the VM context
  const sorted=xs=>[...xs].sort((a,b)=>a.id<b.id?-1:1),contentSorted=st=>JSON.stringify(['notes','links','materials','groups','groupLinks','materialRelations','marks','deleted'].map(k=>sorted(st[k])));
  const base0=M.fresh(),n1=M.addNote(base0,{unitId:'a33',year:2018,text:'第一版'}),n2=M.addNote(base0,{unitId:'a34',year:2018,text:'另一则'});
  n1.updatedAt=n1.createdAt=n2.updatedAt=n2.createdAt=at(0);
  const own=st=>st.notes.filter(n=>[n1.id,n2.id].includes(n.id)),count=base0.notes.length;
  // 1. Edited on one device: one note, the earlier wording in its history, and no “conflict”.
  const edited=clone(base0);M.addNote(edited,{unitId:'a33',year:2018,text:'第二版',editId:n1.id}).updatedAt=at(5);
  let r=M.merge(base0,edited);
  assert.equal(r.state.notes.length,count);assert.equal(own(r.state).find(n=>n.id===n1.id).text,'第二版');
  same(r.state.notes.find(n=>n.id===n1.id).history.map(h=>h.text),['第一版']);same([r.added,r.updated,r.conflicts],[0,1,0]);
  assert.equal(M.merge(edited,base0).state.notes.find(n=>n.id===n1.id).text,'第二版','the older copy never replaces the newer one');
  // Edited on both devices: still one note; the later stands and the other wording is kept in the history.
  const editedToo=clone(base0);M.addNote(editedToo,{unitId:'a33',year:2018,text:'另一台的第二版',editId:n1.id}).updatedAt=at(3);
  r=M.merge(edited,editedToo);
  assert.equal(r.state.notes.length,count);assert.equal(r.conflicts,1);assert.equal(r.state.notes.find(n=>n.id===n1.id).text,'第二版');
  same(r.state.notes.find(n=>n.id===n1.id).history.map(h=>h.text),['第一版','另一台的第二版']);
  // 6. The order of merging does not matter, and merging again changes nothing.
  assert.equal(contentSorted(M.merge(editedToo,edited).state),contentSorted(r.state));
  const again=M.merge(r.state,editedToo);assert.equal(contentSorted(again.state),contentSorted(r.state));same([again.added,again.updated,again.conflicts],[0,0,0]);
  // 2. Deleted on one device: merging with a copy that still has the note does not bring it back, either way round.
  const removed=clone(base0);assert.equal(M.remove(removed,'notes',n1.id),true);assert.equal(removed.deleted.length,1);
  for(const result of [M.merge(removed,base0),M.merge(base0,removed)]){
    assert.equal(result.state.notes.some(n=>n.id===n1.id),false,'a deleted note stays deleted');assert.equal(result.state.notes.length,count-1);
    same(result.state.deleted.map(d=>d.id),[n1.id]);
  }
  // 3. Changed on another device after the deletion: the change stands and the deletion is dropped.
  const revived=clone(base0);M.addNote(revived,{unitId:'a33',year:2018,text:'删除之后又改',editId:n1.id}).updatedAt=new Date(Date.now()+60000).toISOString();
  for(const result of [M.merge(removed,revived),M.merge(revived,removed)]){
    assert.equal(result.state.notes.find(n=>n.id===n1.id)?.text,'删除之后又改');assert.equal(result.state.deleted.length,0);
  }
  // Links, materials and marks hold their deletion too.
  const rich=clone(base0),p=M.version('a33',2018).paragraphs[2],word=M.anchor('a33',2018,2,p.indexOf('人权'),p.indexOf('人权')+2);
  const link=M.addLink(rich,{from:[word],to:[M.whole('p7',2018)],reason:'测试'});M.toggleMark(rich,[word],'yellow');
  const stripped=clone(rich);M.remove(stripped,'links',link.id);M.toggleMark(stripped,[word],'yellow');
  r=M.merge(rich,stripped);assert.equal(r.state.links.some(l=>l.id===link.id),false);assert.equal(r.state.links.length,base0.links.length);assert.equal(r.state.marks.length,0);assert.equal(r.state.deleted.length,2);
  // 7. A parent part deleted on one device, merged with a copy that still has parent and child.
  const parts=clone(base0),parent=M.saveGroup(parts,{name:'上级部分',description:'',anchors:[M.whole('a33',2018)]}),child=M.saveGroup(parts,{name:'下级部分',description:'',anchors:[M.whole('a34',2018)],parentId:parent.id});
  const other=M.saveGroup(parts,{name:'旁的部分',description:'',anchors:[M.whole('a35',2018)]});M.connectGroups(parts,{fromId:parent.id,toId:other.id,relation:'对照',reason:'测试'});
  for(const g of parts.groups)g.updatedAt=g.createdAt=at(0);
  const partsGone=clone(parts);M.deleteGroup(partsGone,parent.id);
  same(partsGone.deleted.map(d=>d.kind).sort(),['groupLinks','groups']);
  for(const result of [M.merge(partsGone,parts),M.merge(parts,partsGone)]){
    same(result.state.groups.map(g=>g.name).sort(),['下级部分','旁的部分']);
    assert.equal(result.state.groups.find(g=>g.id===child.id).parentId,null);assert.equal(result.state.groupLinks.length,0);
  }
  // A part changed on both devices: the later one stands, and no second copy of it appears.
  const renamed=clone(parts);Object.assign(renamed.groups.find(g=>g.id===other.id),{name:'改名后的部分',updatedAt:at(9)});
  for(const result of [M.merge(parts,renamed),M.merge(renamed,parts)])same(result.state.groups.map(g=>g.name).sort(),['上级部分','下级部分','改名后的部分']);
  // 5. Turning pages and reading preferences are not a change to what is shared.
  const moved=clone(base0);Object.assign(moved,{current:'a40',year:1982,preferences:{...moved.preferences,noteMode:'hidden'}});M.validate(moved);
  assert.equal(M.contentOf(moved),M.contentOf(base0));assert.notEqual(M.contentOf(edited),M.contentOf(base0));assert.notEqual(M.contentOf(removed),M.contentOf(base0));
  // 8. A backup from before deletions were recorded is read as before.
  const older=clone(edited);delete older.deleted;
  same(M.migrate(older).deleted,[]);r=M.merge(M.fresh(),older);assert.equal(r.state.notes.find(n=>n.id===n1.id).text,'第二版');
  assert.throws(()=>M.validate({...clone(base0),deleted:[{id:'x',kind:'unknown',deletedAt:at(0)}]}));
  // A draft with nothing written does not become a note when two copies of the same notebook are merged.
  const drafts=clone(base0);drafts.drafts['a5@2018']={text:'',anchors:[],methods:['法权分析']};drafts.drafts['a10@2018']={text:'正在写的草稿',anchors:[],quote:'',editId:n2.id,year:2018,question:'',methods:[],evidenceIds:[]};
  r=M.merge(drafts,clone(drafts));assert.equal(r.state.notes.length,count);same([r.added,r.updated,r.conflicts],[0,0,0]);
  // 4. An explicitly supplied test copy merged with itself stays as it is. Never discover a live notebook.
  const realFile=process.env.FADIAN_TEST_NOTEBOOK;
  if(realFile&&fs.existsSync(realFile)){
    const real=JSON.parse(fs.readFileSync(realFile,'utf8')).state;
    if(real?.bookId===data.codex.id){const before=M.migrate(real);r=M.merge(real,real);assert.equal(r.state.notes.length,before.notes.length);same([r.added,r.updated,r.conflicts],[0,0,0]);assert.equal(M.contentOf(r.state),M.contentOf(before));}
  }
  console.log('Passed: the later version of a note, relation or part stands with the earlier wording in its history; deletions hold across devices unless changed later; merge order does not matter; turning pages is not a change; old backups without deletion records.');
}

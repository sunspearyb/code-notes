'use strict';
// Run against the shared app: node demo/codes/<pack>/test_pack.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const root=path.resolve(__dirname,'../..'),codex=json(path.join(__dirname,'codex.json'));
const data={codex,seedNotes:[],importedNotes:[]};
for(const [key,file] of Object.entries(codex.files))data[key]=json(path.join(__dirname,file));
const context=vm.createContext({data,URL,Intl,crypto:require('node:crypto').webcrypto});
vm.runInContext(['model.js','notebook.js','learning-model.js'].map(f=>read(path.join(root,'src',f))).join('\n'),context);
const M=vm.runInContext('createLearningModel(data)',context);
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
assert.equal(M.fresh().bookId,codex.id);
for(const field of ['notes','materials','links','terms','read','bookmarks','installedExamples'])assert.equal(M.fresh()[field].length,0,field);
const draft=json(path.join(__dirname,'subtitles-draft.json'));
same(data.subtitles,draft);
same(Object.keys(draft).sort(),M.units.map(u=>u.id).sort());
assert(Object.values(draft).every(s=>[...s].length>=4&&[...s].length<=10));
assert(!Object.values(codex.files).includes('subtitles-draft.json'));
for(const year of M.years){
 const live=M.units.filter(u=>u.versions[year].exists).map(u=>u.id);
 const tree=M.tree(year),ids=tree.roots.flatMap(n=>n.unitIds);
 same(ids,live);assert.equal(new Set(ids).size,ids.length);
 for(const u of M.units){
  const v=M.version(u.id,year);same(v.paragraphs,u.versions[year].paragraphs);
  if(year===M.years[0])continue;
  const previous=M.years[M.years.indexOf(year)-1],rows=M.comparisonRows(u.id,year);
  assert.equal(rows.filter(r=>r.before).map(r=>r.before.text).join('\n'),u.versions[previous].paragraphs.join('\n'));
  assert.equal(rows.filter(r=>r.after).map(r=>r.after.text).join('\n'),u.versions[year].paragraphs.join('\n'));
 }
}
const app=read(path.join(root,'src/app.js'));
Object.assign(context,{M,CODEX:codex,LATEST:M.years.at(-1),FIRST:M.years[0],state:M.fresh()});
vm.runInContext(app.slice(app.indexOf("const CN_DIGITS="),app.indexOf('// 款 are')),context);
vm.runInContext(app.slice(app.indexOf('const changeYears='),app.indexOf('function citePlace')),context);
const resolve=(q,y)=>vm.runInContext(`resolveReference(${JSON.stringify(q)},${y})`,context);
const cite=(id,y)=>vm.runInContext(`citeTitle(${y},M.get(${JSON.stringify(id)}))`,context);
if(codex.id==='cn-civil-code'){
 assert.equal(M.units.length,1260);same(M.years,[2020]);
 assert.equal(resolve('第一千一百六十五条',2020),'a1165');
 assert.equal(resolve('民法典第1260条',2020),'a1260');
 assert.equal(cite('a1165',2020),'《中华人民共和国民法典》');
 same(M.tree(2020).roots.map(n=>[n.unitIds[0],n.unitIds.at(-1)]),[['a1','a204'],['a205','a462'],['a463','a988'],['a989','a1039'],['a1040','a1118'],['a1119','a1163'],['a1164','a1258'],['a1259','a1260']]);
 assert.equal(M.tree(2020).flat.length,137);
 assert.equal(M.path('a278',2020).find(n=>n.level==='chapter').title,'第六章　业主的建筑物区分所有权');
 assert.equal(Object.keys(data.english.texts['2020']).length,1260);
}else{
 assert.equal(M.units.length,212);same(M.years,[2016,2021,2025]);
 same(M.years.map(y=>M.units.filter(u=>u.versions[y].exists).length),[79,208,210]);
 same(M.tree(2016).roots.map(n=>n.id),['cybersecurity']);
 same(M.tree(2025).roots.map(n=>n.id),['cybersecurity','data-security','personal-information']);
 assert.equal(resolve('个人信息保护法第十三条',2025),'pi13');
 assert.equal(resolve('个保法第十三条',2021),'pi13');
 assert.equal(resolve('网络安全法第三条',2016),'cs4');
 assert.equal(resolve('网络安全法第三条',2025),'cs3');
 assert.equal(cite('pi13',2025),'《中华人民共和国个人信息保护法》');
 assert.equal(cite('cs4',2021),'《中华人民共和国网络安全法》（2016 年）');
 assert.equal(cite('ds1',2021),'《中华人民共和国数据安全法》');
 for(const id of ['cs64-2016','cs66-2016']){assert(M.version(id,2016).exists);assert(!M.version(id,2025).exists);}
 assert.equal(data.history.amendments.length,14);
 assert(data.history.amendments.every(a=>a.sourceRefs.length>0));
 assert.equal(data.history.validation.all14AmendmentsReplayedAndMatched,true);
 same(Object.keys(data.english.texts['2025']).sort(),M.units.filter(u=>/^(ds|pi)/.test(u.id)).map(u=>u.id).sort());
}
for(const year of Object.keys(data.english.texts))for(const [id,ps] of Object.entries(data.english.texts[year])){assert(M.version(id,Number(year)).exists);assert(ps.length>0&&ps.every(p=>p.trim()));}
const fresh=M.fresh();M.addNote(fresh,{unitId:M.units[0].id,year:M.years.at(-1),text:'data-pack-roundtrip-test'});
assert.equal(M.migrate(JSON.parse(JSON.stringify(fresh))).notes[0].text,'data-pack-roundtrip-test');
const foreign=JSON.parse(JSON.stringify(fresh));foreign.bookId='cn-constitution';assert.throws(()=>M.migrate(foreign));
console.log(`PASS ${codex.id}: real text snapshots, full comparison reconstruction, structure, citations, search, empty initial notes, loaded subtitle drafts, English coverage, backup isolation.`);

// Data packs other than the constitution: several laws in one pack, laws joining in a later year,
// one-year codes with 编/分编/章/节, article numbers in the thousands. The texts are synthetic.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
function unit(id,number,versions){return {id,kind:'article',number,label:versions.at(-1)?.[1]||'',versions:Object.fromEntries(versions.map(([year,label,paragraphs])=>[year,paragraphs?{exists:true,label,paragraphs}:{exists:false,label:'尚未设立',paragraphs:[]}]))};}
function model(codex,history){
  const data={codex,history,subtitles:{},guide:{title:'使用说明',intro:'',steps:[],tips:{}},seedNotes:[],importedNotes:[]};
  const context=vm.createContext({data,URL,Intl,crypto:require('node:crypto').webcrypto});
  vm.runInContext(['model.js','notebook.js','learning-model.js'].map(x=>read('src/'+x)).join('\n'),context);
  return vm.runInContext('createLearningModel(data)',context);
}
// 1. Two laws in one pack: law A (2016, amended 2025) and law B (from 2021).
{
  const citation=name=>({latest:`《${name}》`,original:`《${name}》（{year} 年）`,amended:`《${name}》（{year} 年修正）`});
  const codex={id:'test-network',name:'测试网络法典',short:'测试法典',whole:'测试法典全部',amendment:'修正',citation:{latest:'',original:'',amended:'',aliases:[]},files:{},
    levels:{law:{name:'',numbered:false},chapter:{name:'章',numbered:true}},
    structure:[{id:'lawA',level:'law',name:'甲法',law:{name:'中华人民共和国甲法',short:'甲法',aliases:['甲'],citation:citation('中华人民共和国甲法')},from:'A1',to:'A3',children:[{id:'A-c1',level:'chapter',name:'总则',from:'A1',to:'A2'},{id:'A-c2',level:'chapter',name:'附则',from:'A3',to:'A3'}]},
               {id:'lawB',level:'law',name:'乙法',law:{name:'中华人民共和国乙法',short:'乙法',citation:citation('中华人民共和国乙法')},from:'B1',to:'B2'}]};
  const history={years:[2016,2021,2025],amendments:[],units:[
    unit('A1',1,[[2016,'第一条',['甲法第一条原文。']],[2021,'第一条',['甲法第一条原文。']],[2025,'第一条',['甲法第一条修正后的文字。']]]),
    unit('A2',2,[[2016,'第二条',['甲法第二条。']],[2021,'第二条',['甲法第二条。']],[2025,'第二条',['甲法第二条。']]]),
    unit('A3',3,[[2016,'第三条',['本法自公布之日起施行。']],[2021,'第三条',['本法自公布之日起施行。']],[2025,'第三条',['本法自公布之日起施行。']]]),
    unit('B1',1,[[2016,'',null],[2021,'第一条',['乙法第一条。']],[2025,'第一条',['乙法第一条。']]]),
    unit('B2',2,[[2016,'',null],[2021,'第二条',['乙法第二条。']],[2025,'第二条',['乙法第二条。']]]),
  ]};
  const M=model(codex,history);
  same(M.tree(2016).roots.map(n=>n.title),['甲法']);
  same(M.tree(2021).roots.map(n=>n.title),['甲法','乙法']);
  same(M.tree(2021).flat.map(n=>n.title),['甲法','第一章　总则','第二章　附则','乙法']);
  assert.equal(M.lawOf('B2').short,'乙法');assert.equal(M.lawOf('A1').short,'甲法');assert.equal(M.laws.length,2);
  assert.equal(M.fresh().bookId,'test-network');
  assert(M.comparisonRows('A1',2025).some(r=>r.changed));assert(!M.comparisonRows('A2',2025).some(r=>r.changed));
  const s=M.fresh();M.addNote(s,{unitId:'B1',year:2021,text:'乙法笔记'});
  assert.equal(M.migrate(JSON.parse(JSON.stringify(s))).notes.length,1);
  const constitution=JSON.parse(JSON.stringify(s));constitution.bookId='cn-constitution';
  assert.throws(()=>M.migrate(constitution),'a backup of another code is refused');
  M.addMaterialRelation(s,{name:'材料'},{scope:{kind:'structure',year:2021,nodeId:'lawB',unitIds:[]},reason:'与乙法整体有关',destination:'note'});
  assert.throws(()=>M.validateScope({kind:'structure',year:2016,nodeId:'lawB',unitIds:[]}));
}
// 2. One text, 编—章—节 levels, article numbers above one thousand.
{
  const codex={id:'test-civil',name:'测试民法典',short:'测试民法典',whole:'整部测试民法典',amendment:'修正',citation:{latest:'《测试民法典》',original:'《测试民法典》',amended:'《测试民法典》',aliases:['测试民法典']},files:{},
    levels:{part:{name:'编',numbered:true},subpart:{name:'分编',numbered:true},chapter:{name:'章',numbered:true,numberWithin:'part'},section:{name:'节',numbered:true},plain:{name:'',numbered:false}},
    structure:[{id:'p1',level:'part',name:'总则',from:'a1',to:'a3',children:[{id:'p1c1',level:'chapter',name:'基本规定',from:'a1',to:'a2',children:[{id:'p1c1s1',level:'section',name:'一般规定',from:'a1',to:'a1'}]},{id:'p1c2',level:'chapter',name:'自然人',from:'a3',to:'a3'}]},
               {id:'p2',level:'part',name:'物权',from:'a4',to:'a1259',children:[{id:'p2s1',level:'subpart',name:'通则',from:'a4',to:'a5',children:[{id:'p2c1',level:'chapter',name:'一般规定',from:'a4',to:'a4'},{id:'p2c2',level:'chapter',name:'物权的保护',from:'a5',to:'a5'}]},{id:'p2s2',level:'subpart',name:'所有权',from:'a1259',to:'a1259',children:[{id:'p2c3',level:'chapter',name:'一般规定',from:'a1259',to:'a1259'}]}]},
               {id:'tail',level:'plain',name:'附则',from:'a1260',to:'a1260'}]};
  const history={years:[2020],amendments:[],units:[unit('a1',1,[[2020,'第一条',['一。']]]),unit('a2',2,[[2020,'第二条',['二。']]]),unit('a3',3,[[2020,'第三条',['三。']]]),unit('a4',4,[[2020,'第四条',['四。']]]),unit('a5',5,[[2020,'第五条',['五。']]]),unit('a1259',1259,[[2020,'第一千二百五十九条',['甲。']]]),unit('a1260',1260,[[2020,'第一千二百六十条',['乙。']]])]};
  const M=model(codex,history);
  same(M.tree(2020).flat.map(n=>n.title),['第一编　总则','第一章　基本规定','第一节　一般规定','第二章　自然人','第二编　物权','第一分编　通则','第一章　一般规定','第二章　物权的保护','第二分编　所有权','第三章　一般规定','附则']);
  same(M.path('a1',2020).map(n=>n.title),['第一编　总则','第一章　基本规定','第一节　一般规定']);
  assert.equal(M.lawOf('a1'),null);assert.equal(M.comparisonRows('a1',2020).length,0);
  for(const year of M.years){const ids=M.tree(year).roots.flatMap(n=>n.unitIds);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,M.units.length);}
}
console.log('Passed: combined packs of several laws, laws joining later, one-year codes with nested levels, numbers above one thousand.');

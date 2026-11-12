// 塔罗研读: the card table is complete and well-formed, drawing is fair and avoids repeats,
// and an answer saved as a note is an ordinary valid note that survives backup and merge.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const data=require('./test-data.cjs')();
const tarot=JSON.parse(fs.readFileSync(path.join(__dirname,'games/tarot.json'),'utf8'));
const read=f=>fs.readFileSync(path.join(__dirname,'src',f),'utf8');
const context=vm.createContext({data,URL,Intl,console,crypto:require('node:crypto').webcrypto,document:{addEventListener(){}},deviceSettings:{tarot:true},DATA:{games:{tarot},edition:{}},ui:{}});
vm.runInContext(['model.js','notebook.js','learning-model.js','games.js'].map(read).join('\n'),context);
const M=vm.runInContext('createLearningModel({...data,seedNotes:[],importedNotes:[]})',context);
const call=(name,...args)=>context[name](...args);

assert.equal(tarot.cards.length,22);
assert.deepEqual(tarot.cards.map(c=>c.n),[...Array(22).keys()]);
assert.equal(new Set(tarot.cards.map(c=>c.name)).size,22);
for(const c of tarot.cards){
  assert.ok(M.methods.includes(c.method),`${c.name}: method`);
  for(const k of ['numeral','name','upright','reversed','meaning'])assert.ok(typeof c[k]==='string'&&c[k].trim(),`${c.name}: ${k}`);
  assert.ok(!/[【】]/.test(c.name));
}
const judgement=tarot.cards[20];
assert.equal(call('tarotQuestion',judgement,false,'cn-constitution'),judgement.upright);
assert.equal(call('tarotQuestion',judgement,true,'cn-civil-code'),judgement.reversed);
assert.equal(call('tarotQuestion',judgement,true,'cn-constitution'),judgement.reversedFor['cn-constitution']);

// Drawing: every card and both sides come up; recent articles and cards are avoided.
let seed=7;const random=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const units=M.sequence(2018),drawn=new Set(),sides=new Set();let seen=[];
for(let i=0;i<600;i++){
  const d=call('tarotDraw',tarot.cards,units,seen,random);
  assert.ok(units.includes(d.unitId));
  assert.ok(!seen.some(s=>s.unitId===d.unitId||s.n===d.n),'no repeat among the last eight');
  drawn.add(d.n);sides.add(d.reversed);seen=[...seen,{unitId:d.unitId,n:d.n}].slice(-8);
}
assert.equal(drawn.size,22);assert.equal(sides.size,2);
assert.equal(call('tarotDraw',tarot.cards,[],[]),null);
assert.equal(call('tarotDraw',tarot.cards,['a33'],[{unitId:'a33',n:3}],random).unitId,'a33','a single article can be drawn again');

// The answer is an ordinary note.
const s=M.fresh(),card=tarot.cards[11];
const note=M.addNote(s,{unitId:'a33',year:2018,text:'平衡的是……',question:call('tarotTitle',card,true)+call('tarotQuestion',card,true,'cn-constitution'),methods:[card.method]});
M.saveCard(s,'a33',2018,[],'whole');M.validate(s);
const back=call('tarotOfNote',note,tarot.cards);
assert.equal(back.card.n,11);assert.equal(back.reversed,true);
assert.equal(call('tarotOfNote',{question:'【不存在的牌·正位】x'},tarot.cards),null);
assert.equal(call('tarotOfNote',{question:'普通问题'},tarot.cards),null);
const merged=M.merge(M.fresh(),JSON.parse(JSON.stringify(s))).state;
assert.equal(merged.notes.length,1);assert.ok(call('tarotOfNote',merged.notes[0],tarot.cards));
assert.equal(M.merge(s,JSON.parse(JSON.stringify(s))).state.notes.length,1);
// With a memory card: one card per article while the page is open; 换一张牌 draws another.
const first=call('tarotFor','a33',2018);assert.deepEqual([call('tarotFor','a33',2018).n,call('tarotFor','a33',2018).reversed],[first.n,first.reversed]);
assert.notEqual(call('tarotFor','a33',2018,true).n,first.n);assert.equal(call('tarotOn'),true);
// Public editions conceal the full deck, while the teacher edition and the two study actions remain.
Object.assign(context,{state:s,CODEX:data.codex,esc:s=>String(s)});
for(const flag of [undefined,false,true]){
  context.DATA.edition.tarotDeck=flag;
  const panel=call('tarotPanel','a33',2018);
  assert.equal(panel.includes('data-action="tarot-deck"'),flag!==false);
  assert.ok(panel.includes('data-action="tarot-card"'));
  assert.ok(panel.includes('data-action="tarot-write"'));
}
console.log('Passed: 22 cards with a method and two questions each, a fair draw without recent repeats, answers saved as ordinary notes.');

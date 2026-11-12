// Modules: a code put together from modules reads like any other code; a backup of a code that is
// a module of another is merged in under the module's prefix; records on a module that was taken
// out are set aside and come back when it returns.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>JSON.parse(fs.readFileSync(path.join(__dirname,p),'utf8'));
function load(name,base=__dirname){const read=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));const data={codex:read(`codes/${name}/codex.json`),frameworks:{}};for(const [key,file] of Object.entries(data.codex.files))data[key]=read(`codes/${name}/${file}`);return data;}
const source=['model.js','notebook.js','learning-model.js'].map(f=>fs.readFileSync(path.join(__dirname,'src',f),'utf8')).join('\n');
function model(data){const context=vm.createContext({data:{...data,seedNotes:[],importedNotes:[]},URL,Intl,console,crypto:require('node:crypto').webcrypto});vm.runInContext(source,context);return {M:vm.runInContext('createLearningModel(data)',context),context};}
const clone=x=>JSON.parse(JSON.stringify(x)),eq=(a,b,m)=>assert.deepEqual(clone(a),clone(b),m);

const {M:N}=model(load('cyber-law'));
// ---------- A module is taken out: its records are set aside, and return with it ----------
const full=load('cyber-law'),state=N.fresh();
const kept=N.addNote(state,{unitId:'cs1',year:2025,text:'留下的笔记'}),gone=N.addNote(state,{unitId:'pi13',year:2025,text:'个保法的笔记',anchors:[N.anchor('pi13',2025,0,0,4)]});
N.addLink(state,{from:[N.whole('cs1',2025)],to:[N.whole('pi13',2025)],reason:'跨法'});
N.addLink(state,{from:[N.whole('cs1',2025)],to:[N.whole('ds1',2025)],reason:'留下'});
const parent=N.saveGroup(state,{name:'个保法的部分',description:'',anchors:[N.whole('pi1',2025)],parentId:null});
N.saveGroup(state,{name:'子部分',description:'',anchors:[N.whole('cs2',2025)],parentId:parent.id});
N.addTerm(state,{name:'个人信息',anchors:[N.whole('pi4',2025),N.whole('ds3',2025)]});
N.toggleMark(state,[N.anchor('pi13',2025,0,0,4)],'bold');N.saveCard(state,'pi13',2025,[],'whole');N.setSubtitle(state,'pi13','合法性基础');
state.bookmarks.push('pi13','cs1');state.drafts['pi14@2025']={text:'草稿',anchors:[],quote:''};state.current='pi13';N.validate(state);
const without=clone(full);
without.history.units=without.history.units.filter(u=>!u.id.startsWith('pi'));without.codex.structure=without.codex.structure.filter(n=>n.id!=='personal-information');
without.subtitles=Object.fromEntries(Object.entries(without.subtitles).filter(([k])=>!k.startsWith('pi')));without.english=undefined;
if(without.guide?.steps)for(const s of without.guide.steps)s.unitId='cs1';
const {M:Less}=model(without),smaller=Less.migrate(clone(state));
eq(smaller.notes.map(n=>n.id),[kept.id]);
assert.equal(smaller.links.length,1);assert.equal(smaller.groups.length,1);assert.equal(smaller.groups[0].parentId,null);
eq(smaller.bookmarks,['cs1']);assert.equal(smaller.marks.length,0);assert.equal(smaller.current.startsWith('pi'),false);
eq(smaller.terms[0].anchors.map(a=>a.unitId),['ds3']);
const kinds=smaller.parked.map(p=>p.kind).sort();
eq(kinds,['bookmarks','drafts','groups','links','marks','memoryCards','notes','subtitles','termAnchors']);
Less.addNote(smaller,{unitId:'cs2',year:2025,text:'模块取出期间写的笔记'});Less.validate(smaller);
assert.equal(Less.merge(smaller,clone(smaller)).state.parked.length,smaller.parked.length,'set-aside records survive a merge');
const back=N.migrate(clone(smaller));
assert.equal(back.parked.length,0);assert.equal(back.notes.length,3);
eq(back.notes.find(n=>n.id===gone.id),state.notes.find(n=>n.id===gone.id));
assert.equal(back.links.length,2);assert.equal(back.groups.length,2);assert.equal(back.marks.length,1);
eq(back.bookmarks.sort(),['cs1','pi13']);assert.ok(back.drafts['pi14@2025']);assert.ok(back.memoryCards['pi13@2025']);
assert.equal(back.subtitles.pi13.title,'合法性基础');assert.equal(back.terms[0].anchors.length,2);
// A complete notebook is left exactly as it was.
eq(N.migrate(clone(state)),{...N.migrate(clone(state)),parked:[]});
console.log('Passed: records on a module that was taken out are set aside, survive a merge, and return with the module.');

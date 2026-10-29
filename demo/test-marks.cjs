// Marks (高亮、下划线、加粗) in a Node VM; no browser profile or user data is touched.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=__dirname;
const data=require('./test-data.cjs')();
const src=['model.js','notebook.js','learning-model.js'].map(f=>fs.readFileSync(path.join(dir,'src',f),'utf8')).join('\n');
const ctx=vm.createContext({data,URL,Intl,console,crypto:require('node:crypto').webcrypto});vm.runInContext(src,ctx);
const M=vm.runInContext('createLearningModel({...data,seedNotes:[],importedNotes:[]})',ctx);
const s=M.fresh();const p=M.version('a33',2018).paragraphs[2];
const a=M.anchor('a33',2018,2,0,4);
assert.equal(M.toggleMark(s,[a],'yellow'),true);assert.equal(s.marks.length,1);
M.toggleMark(s,[M.anchor('a33',2018,2,4,6)],'yellow');assert.equal(s.marks.length,1);assert.equal(s.marks[0].anchor.end,6);
assert.equal(M.toggleMark(s,[M.anchor('a33',2018,2,1,3)],'yellow'),false);assert.equal(s.marks.length,2);
M.toggleMark(s,[a],'bold');assert.equal(JSON.stringify(M.markedRanges(s,'a33',2018,2).map(r=>[r.start,r.end,r.styles.join()])),JSON.stringify([[0,1,'yellow,bold'],[1,3,'bold'],[3,4,'yellow,bold'],[4,6,'yellow']]));
M.clearMarks(s,[M.anchor('a33',2018,2,0,6)]);assert.equal(s.marks.length,0);
M.toggleMark(s,[a],'blue');const other=M.fresh();M.toggleMark(other,[a],'blue');M.toggleMark(other,[a],'underline');
const merged=M.merge(s,other).state;assert.equal(merged.marks.length,2);assert.equal(M.merge(merged,other).state.marks.length,2);
const back=M.migrate(JSON.parse(JSON.stringify(merged)));assert.equal(back.marks.length,2);
console.log('Passed: highlight, underline and bold marks join, come off when chosen again, clear, survive migration and merge without duplicates.');

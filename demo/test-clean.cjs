const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const data=require('./test-data.cjs')();
assert.deepEqual(data.seedNotes,[]);assert.deepEqual(data.importedNotes,[]);
const context=vm.createContext({data,URL,Intl,crypto:require('node:crypto').webcrypto});
vm.runInContext(['model.js','notebook.js','learning-model.js'].map(x=>read('src/'+x)).join('\n'),context);
const M=vm.runInContext('createLearningModel(data)',context);
const empty=['notes','materials','updates','terms','links','groups','groupLinks','people','discussions','installedExamples','materialRelations','read','bookmarks'];
function checkEmpty(s){for(const key of empty)assert.equal(s[key].length,0,key);for(const key of ['reviews','drafts','subtitles','subtitleHistory','memoryCards','guideEdits','guideHistory'])assert.equal(Object.keys(s[key]).length,0,key);}
checkEmpty(M.fresh());checkEmpty(M.migrate(JSON.parse(JSON.stringify(M.fresh()))));
assert.equal(M.units.length,156);assert.equal(Object.keys(data.subtitles).length,156);
for(const u of M.units)for(let i=1;i<M.years.length;i++){
 const y=M.years[i],rows=M.comparisonRows(u.id,y);
 assert.equal(rows.filter(r=>r.before).map(r=>r.before.text).join('\n'),M.version(u.id,M.years[i-1]).paragraphs.join('\n'));
 assert.equal(rows.filter(r=>r.after).map(r=>r.after.text).join('\n'),M.version(u.id,y).paragraphs.join('\n'));
}
const s=M.fresh();M.addNote(s,{unitId:'a37',year:2018,text:'clean-package-persistence-check'});
const reopened=M.migrate(JSON.parse(JSON.stringify(s)));assert.equal(reopened.notes.length,1);assert.equal(reopened.notes[0].text,'clean-package-persistence-check');checkEmpty(M.fresh());
const edition=JSON.parse(read('edition.json'));
assert.equal(edition.storageKey,'fadian-notes-clean-v1');assert.equal(edition.legacyStorageKey,null);
assert.equal(edition.port,8766);assert.equal(edition.dataDirectory,'.fadian-clean-local');assert.equal(edition.exportFolder,true);
const app=read('src/app.js');assert(!app.includes('fadian-notes-demo-'));
assert.equal(Object.keys(data.english.texts['2018']).length,156);assert(data.reviewHistory.points.length>0);
// Exercise the actual startup statement with an old debug record in the same storage.
const storage=new Map([['fadian-notes-demo-v2',JSON.stringify(s)]]);
const startup=vm.createContext({M,DATA:{edition},localStorage:{getItem:key=>storage.get(key)||null}});
vm.runInContext(app.split('\n').find(line=>line.startsWith('const KEY='))+"let storageAvailable=true,storageIssue='',unreadableBackup=null,initialSaved=null;let state=M.fresh();"+app.slice(app.indexOf('try{initialSaved='),app.indexOf('const ui=')),startup);
checkEmpty(vm.runInContext('state',startup));
assert(read('serve.py').includes("default=EDITION['port']"));
assert(read('local_service.py').includes("self.project / EDITION['dataDirectory']"));
const html=read('法典笔记.html');const embedded=JSON.parse(html.match(/<script id="content-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(embedded.seedNotes,[]);assert.deepEqual(embedded.importedNotes,[]);assert(!html.includes('fadian-notes-demo-'));
assert.deepEqual(embedded.edition,{...edition,exportName:'法典笔记数据',markdownName:'法典笔记'});
assert(read('本地助手接入.html').includes('<meta charset="utf-8">'));
console.log('PASS: empty records; saved notes persist; debug records ignored; 156 units / 780 history comparisons; isolated service and compiled HTML.');

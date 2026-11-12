'use strict';
// Compare the browser fallback with the unchanged Python service using built pages and synthetic
// notebooks only. No local notebooks, browser profiles, or signing files are read by this test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const unpack=html=>JSON.parse(html.match(/<script id="content-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const own=unpack(read('法典笔记.html')),pages={},books={};
for(const c of own.codes){pages[c.name]=read(c.page);books[c.name]=unpack(pages[c.name]);}
assert.ok(books.constitution&&books['criminal-law']&&books['cyber-law']);
const states=Object.fromEntries(own.codes.map(c=>[c.name,{notes:[],materialRelations:[]} ]));
const relation=(code,article,ids,extra={})=>({category:'crosscode',scope:{kind:'articles',year:1997,unitIds:ids},details:{code,article,quote:'测试字句'},text:'测试关联',question:'为什么？',updatedAt:'2026-11-12T00:00:00Z',...extra});
states.constitution.materialRelations=[relation('刑法','第二百四十六条',['a33']),relation('个保法','13',['a38'])];
states['criminal-law'].materialRelations=[relation('宪法','33',['xs246','xs253']),relation('宪法','9999',['xs246']),relation('宪法','38',['xs246'],{category:'case'}),relation('民法典','13',['xs246'])];
states['cyber-law'].materialRelations=[relation('中华人民共和国宪法','第三十八条',['pi13']),relation('刑法','第二百五十三条之一',['pi13'])];
states['criminal-law'].notes=Array.from({length:24},(_,i)=>({unitId:'xs246',text:'笔记 '+i,question:'问题 '+i}));
states.constitution.notes=[{unitId:'a33',text:'当前法典笔记',question:''}];
const source=read('src/statutes.js'),app=read('src/app.js');
const browserCode=app.slice(app.indexOf('function cnValue('),app.indexOf('// Accepts “33”'))+'\n'+source.slice(source.indexOf('function codeHref('),source.indexOf('function crossButton('));
function browser(name,options={}){
  const DATA=books[name],calls=new Map(),storage=new Map(own.codes.map(c=>[books[c.name].edition.storageKey,JSON.stringify(states[c.name])]));
  const context=vm.createContext({DATA,CODEX:DATA.codex,state:states[name],URL,service:{connected:false},
    location:{href:'https://test.invalid/'+own.codes.find(c=>c.name===name).page},document:{querySelector(){return null;}},serviceFreeEdition(){return '';},
    localStorage:{getItem:key=>storage.get(key)||null},
    DOMParser:class{parseFromString(html){return {querySelector(){const match=html.match(/<script id="content-data" type="application\/json">([\s\S]*?)<\/script>/);return match?{textContent:match[1]}:null;}};}},
    fetch:async url=>{const c=own.codes.find(c=>c.page===decodeURIComponent(new URL(url).pathname.slice(1)));assert.ok(c,'uses a packaged page');calls.set(c.name,(calls.get(c.name)||0)+1);if(options.fail||options.missing===c.name){options.fail=false;throw Error('offline');}return {ok:true,text:async()=>pages[c.name]};},
    api:async(route,body)=>({route,body})});
  vm.runInContext(browserCode,context);
  return {context,calls,storage,call:async(action,body)=>JSON.parse(JSON.stringify(await context.crossApi(action,body)))};
}
const requests=[];
for(const name of ['constitution','criminal-law','cyber-law']){
  for(const c of own.codes)requests.push({name,action:'units',body:{code:c.name}});
  requests.push({name,action:'back',body:{}});
  for(const [code,ref] of [['刑法','246'],['刑法','第二百五十三条之一'],['刑法','253条之一'],['宪法','第三十三条第二款'],['宪法','序言第七自然段'],['网络法典','个保法13']])requests.push({name,action:'text',body:{code,ref}});
  requests.push({name,action:'text',body:{code:'criminal-law',unitId:'xs246'}});
}
const python=String.raw`
import json,sys
from pathlib import Path
from types import SimpleNamespace
import cross_code as cross
fixture=json.load(sys.stdin)
cross.notebook=lambda service,name: fixture['states'][name]
results=[]
for item in fixture['requests']:
    cross.CODEX_NAME=item['name']
    book=cross.Book(Path.cwd().parent,item['name'])
    service=SimpleNamespace(**book.__dict__,project=Path.cwd().parent,snapshot={'state':fixture['states'][item['name']]})
    results.append(cross.handle(service,dict(item['body'],action=item['action'])))
json.dump(results,sys.stdout,ensure_ascii=False)
`;
const reference=spawnSync(process.env.PYTHON||'python3',['-c',python],{cwd:__dirname,input:JSON.stringify({states,requests}),encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',FADIAN_CODEX:'constitution'}});
assert.equal(reference.status,0,reference.stderr);
const expected=JSON.parse(reference.stdout);
(async()=>{
  const clients=Object.fromEntries(['constitution','criminal-law','cyber-law'].map(name=>[name,browser(name)]));
  for(let i=0;i<requests.length;i++){
    const r=requests[i];assert.deepEqual(await clients[r.name].call(r.action,r.body),expected[i],JSON.stringify(r));
  }
  for(const client of Object.values(clients))for(const count of client.calls.values())assert.equal(count,1,'each other page fetched once');
  const c=clients.constitution,key=books['criminal-law'].edition.storageKey;
  c.storage.set(key,JSON.stringify({notes:[{unitId:'xs246',text:'刚修改的笔记'}],materialRelations:[]}));
  assert.deepEqual((await c.call('text',{code:'刑法',ref:'246'})).notes,[{text:'刚修改的笔记',question:''}]);
  assert.ok(!(await c.call('back')).records.some(r=>r.codeName==='criminal-law'),'deleted relations disappear without reloading the cached text');
  await assert.rejects(c.call('text',{code:'网络法典',ref:'13'}),/几部法律/);
  await assert.rejects(c.call('text',{code:'刑法',unitId:'missing'}),/没有这一条/);
  const retry=browser('constitution',{fail:true});
  await assert.rejects(retry.call('units',{code:'criminal-law'}),/无法读取刑法的页面/);
  assert.ok((await retry.call('units',{code:'criminal-law'})).units.length>400,'failed fetch can retry');
  const cached=browser('constitution',{fail:true});
  cached.context.caches={match:async()=>({ok:true,text:async()=>pages['criminal-law']})};
  assert.equal((await cached.call('text',{code:'刑法',ref:'246'})).unitId,'xs246','downloaded web page works offline');
  const partial=browser('constitution',{missing:'civil-code'});
  assert.ok((await partial.call('back')).records.some(r=>r.codeName==='criminal-law'),'an unavailable code does not hide available incoming links');
  c.context.service.connected=true;
  assert.deepEqual(await c.call('text',{code:'刑法',ref:'246'}),{route:'cross',body:{action:'text',code:'刑法',ref:'246'}},'connected editions still call Python');
  console.log(`PASS: ${requests.length} offline units/text/back results equal Python; notes, deletion, cache, retry, aliases, inserted articles and service routing.`);
})().catch(error=>{console.error(error);process.exitCode=1;});

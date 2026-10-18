'use strict';
// Page data for the tests, assembled the way build.py does: data/content.json plus the data pack it names.
const fs=require('node:fs'),path=require('node:path');
module.exports=function loadData(dir=__dirname){
  const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
  const data=read('data/content.json'),pack='codes/'+(data.codex||'constitution')+'/';
  data.codex=read(pack+'codex.json');
  for(const [key,name] of Object.entries(data.codex.files))data[key]=read(pack+name);
  data.frameworks={};
  if(fs.existsSync(path.join(dir,'frameworks')))for(const f of fs.readdirSync(path.join(dir,'frameworks')).filter(f=>f.endsWith('.json')).sort())data.frameworks[f.slice(0,-5)]=read('frameworks/'+f);
  return data;
};

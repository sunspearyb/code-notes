'use strict';
// 材料库 without the local service: the 网页版, the apps (Windows, Mac, Android) and pages opened directly
// keep uploaded files in this browser's IndexedDB ('fadian-files'), one record per file, tagged with the
// code's storage key so the libraries of different codes never mix. Records look like the service's
// attachments.json entries (id, name, size, sha256, text, extraction, createdAt) plus the bytes.
// Text is extracted here from TXT, MD, CSV and DOCX; PDF, DOC and images are kept as files only.
// The JSON backup can carry the files (attachmentFiles), so a library moves with the notes.
const LOCAL_FILE_MAX=16*1024*1024;
const localFiles=(()=>{
  const open=()=>new Promise((ok,fail)=>{
    if(!window.indexedDB){fail(Error('这个浏览器不能保存附件，请换用 Chrome、Edge 或 Safari 的新版本。'));return;}
    const r=indexedDB.open('fadian-files',1);
    r.onupgradeneeded=()=>{const s=r.result.createObjectStore('files',{keyPath:'id'});s.createIndex('book','book');};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error||Error('附件库打不开。'));
  });
  async function tx(mode,work){const db=await open();return new Promise((ok,fail)=>{const t=db.transaction('files',mode),store=t.objectStore('files');let result;Promise.resolve(work(store)).then(v=>{result=v;},fail);t.oncomplete=()=>{db.close();ok(result);};t.onerror=t.onabort=()=>{db.close();fail(t.error?.name==='QuotaExceededError'?Error('设备存储空间不足，附件没有保存。请先删除不需要的附件，或清理存储空间。'):t.error||Error('附件保存失败。'));};});}
  const req=r=>new Promise((ok,fail)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});
  const meta=({data,book,...rest})=>rest;
  const newId=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
  async function digest(bytes){
    if(crypto.subtle)return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    let h=0x811c9dc5;for(const b of bytes){h^=b;h=Math.imul(h,0x01000193);}return 'fnv-'+(h>>>0).toString(16)+'-'+bytes.length;
  }
  // ---------- text extraction ----------
  function decodeText(bytes){
    const utf8=new TextDecoder('utf-8').decode(bytes);
    if(!/\uFFFD/.test(utf8))return [utf8.replace(/^\uFEFF/,''),'已提取文字'];
    try{const gbk=new TextDecoder('gb18030').decode(bytes);if(!/\uFFFD/.test(gbk))return [gbk,'已提取文字（GBK 编码）'];}catch{}
    return ['','无法识别文字编码，请自己补充摘记'];
  }
  // The few ZIP entries a DOCX needs, read from the central directory.
  async function unzipEntry(bytes,name){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('不是有效的 DOCX 文件');
    let at=view.getUint32(end+16,true);const count=view.getUint16(end+10,true),utf=new TextDecoder();
    for(let n=0;n<count;n++){
      const method=view.getUint16(at+10,true),size=view.getUint32(at+20,true),nameLen=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
      if(utf.decode(bytes.subarray(at+46,at+46+nameLen))===name){
        const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),raw=bytes.subarray(start,start+size);
        if(method===0)return raw;
        if(method!==8||typeof DecompressionStream!=='function')throw Error('这个浏览器不能解压 DOCX');
        return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      }
      at+=46+nameLen+extra+comment;
    }
    throw Error('DOCX 中没有正文');
  }
  const entities=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,n)=>String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi,(m,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,'&');
  async function docxText(bytes){
    const xml=new TextDecoder().decode(await unzipEntry(bytes,'word/document.xml'));
    return xml.split(/<\/w:p>/).map(p=>entities((p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g)||[]).map(t=>t==='<w:tab/>'?'\t':t==='<w:br/>'?'\n':t.replace(/<[^>]+>/g,'')).join(''))).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  async function extract(name,bytes){
    const ext=name.split('.').pop().toLowerCase();
    if(['txt','md','csv'].includes(ext)){const [text,how]=decodeText(bytes);return [text.slice(0,160000),how];}
    if(ext==='docx'){try{const text=await docxText(bytes);return text?[text.slice(0,160000),'已提取正文；表格和脚注请核对原文件']:['','DOCX 中没有文字，请自己补充摘记'];}catch(e){return ['',`未能提取文字（${e.message}），请自己补充摘记`];}}
    if(ext==='pdf')return ['','已保存原文件。这一版本不能提取 PDF 的文字：需要引用时，请打开原文件复制段落，粘贴到摘记中'];
    if(ext==='doc')return ['','已保存原文件。旧版 DOC 不能提取文字，请在 Word 中另存为 DOCX 再上传，或自己补充摘记'];
    return ['','图片已保存，不能识别其中的文字，请自己补充摘记'];
  }
  return {
    async list(){return (await tx('readonly',s=>req(s.index('book').getAll(KEY)))).map(meta).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},
    async get(id){const r=await tx('readonly',s=>req(s.get(id)));if(!r||r.book!==KEY)throw Error('附件不在这台设备上。可能是在其他设备上传的：请在那台设备导出“含附件”的备份，再在这里导入。');return r;},
    async add(file){
      if(!file.size)throw Error('文件是空的。');
      if(file.size>LOCAL_FILE_MAX)throw Error('每个文件不超过 16 MB。');
      if(!/\.(pdf|docx|doc|txt|md|csv|png|jpe?g)$/i.test(file.name))throw Error('支持 PDF、Word、TXT、Markdown、CSV 和图片文件。');
      const bytes=new Uint8Array(await file.arrayBuffer()),sha256=await digest(bytes);
      const same=(await tx('readonly',s=>req(s.index('book').getAll(KEY)))).find(r=>r.sha256===sha256);
      if(same)return {...meta(same),duplicate:true};
      const [text,extraction]=await extract(file.name,bytes);
      const record={id:newId(),book:KEY,name:file.name.slice(-180),size:bytes.length,sha256,text,extraction,url:'',sourceKind:'upload',createdAt:now(),data:bytes.buffer};
      await tx('readwrite',s=>req(s.put(record)));return meta(record);
    },
    async remove(id){const r=await this.get(id);await tx('readwrite',s=>req(s.delete(id)));return meta(r);},
    // For the JSON backup: the files with their bytes in base64.
    async exportAll(){
      const all=await tx('readonly',s=>req(s.index('book').getAll(KEY)));
      return all.map(r=>{const bytes=new Uint8Array(r.data);let bin='';for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode(...bytes.subarray(i,i+32768));return {...meta(r),content:btoa(bin)};});
    },
    // Restores files a backup carries; ones already here (same id or same content) are skipped.
    async importAll(list){
      if(!Array.isArray(list))return 0;
      const have=await tx('readonly',s=>req(s.index('book').getAll(KEY)));let added=0;
      for(const f of list){
        if(!f||!/^[a-f0-9]{32}$/.test(f.id)||typeof f.content!=='string'||have.some(r=>r.id===f.id||r.sha256===f.sha256))continue;
        const bin=atob(f.content),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
        if(bytes.length>LOCAL_FILE_MAX)continue;
        await tx('readwrite',s=>req(s.put({id:f.id,book:KEY,name:String(f.name||'附件').slice(-180),size:bytes.length,sha256:f.sha256||'',text:String(f.text||'').slice(0,160000),extraction:String(f.extraction||''),url:String(f.url||''),sourceKind:'upload',createdAt:f.createdAt||now(),data:bytes.buffer})));
        added++;
      }
      return added;
    },
  };
})();
// The library shown when the local service is not running.
async function loadLocalFiles(){if(service.connected)return;try{service.files=await localFiles.list();}catch(error){service.files=[];service.error=error.message;}}

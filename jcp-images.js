/* Fotos en Supabase Storage.
   - collapse(state): reemplaza cada foto (data:image/...) por una referencia corta
     "jcpimg:<nombre>" y deja la foto en cola para subirla. Fotos idénticas comparten referencia.
   - flushUploads(): sube a Storage las fotos pendientes (idempotente: el nombre depende del contenido).
   - expandInPlace(state): vuelve a poner las fotos que ya están en memoria/caché local.
   - hydrate(names): baja de Storage (o de la caché local) las fotos que faltan.
   Los datos en memoria de la app siguen siendo los de siempre (con la foto completa). */
(function(root){
  'use strict';
  const PREFIX='jcpimg:';
  const MIN_CHARS=20000;
  const BUCKET='jcp-fotos';
  const isDataImage=v=>typeof v==='string'&&v.length>=MIN_CHARS&&v.startsWith('data:image/');
  const isRef=v=>typeof v==='string'&&v.startsWith(PREFIX);
  const nameOf=v=>String(v).startsWith(PREFIX)?String(v).slice(PREFIX.length):String(v);

  // Hash rápido y síncrono (dos pasadas de cyrb53 con semillas distintas + longitud).
  function cyrb53(str,seed){
    let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;
    for(let i=0;i<str.length;i++){
      const ch=str.charCodeAt(i);
      h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);
    }
    h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
    h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
    return 4294967296*(2097151&h2)+(h1>>>0);
  }
  function mimeOfDataUrl(u){
    const end=u.indexOf(';')>0?u.indexOf(';'):u.indexOf(',');
    const m=u.slice(5,end).toLowerCase();
    return /^image\/(jpeg|jpg|png|webp|gif)$/.test(m)?(m==='image/jpg'?'image/jpeg':m):'image/jpeg';
  }
  const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
  const MIME_BY_EXT={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
  function makeName(u){
    const ext=EXT[mimeOfDataUrl(u)]||'jpg';
    return cyrb53(u,1).toString(36)+cyrb53(u,7).toString(36)+u.length.toString(36)+'.'+ext;
  }
  function dataUrlToBlob(u){
    const i=u.indexOf(',');
    const bin=atob(u.slice(i+1));
    const arr=new Uint8Array(bin.length);
    for(let k=0;k<bin.length;k++)arr[k]=bin.charCodeAt(k);
    return new Blob([arr],{type:mimeOfDataUrl(u)});
  }
  async function blobToDataUrl(blob,mime){
    const buf=new Uint8Array(await blob.arrayBuffer());
    let bin='';
    for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
    return 'data:'+mime+';base64,'+btoa(bin);
  }
  function dataUrlBytes(u){
    const i=u.indexOf(',');const b64=u.slice(i+1);
    const pad=b64.endsWith('==')?2:b64.endsWith('=')?1:0;
    return Math.floor(b64.length*3/4)-pad;
  }
  const isDuplicate=e=>!!e&&(String(e.statusCode||e.status||'')==='409'||/already exists|duplicate/i.test(String(e.message||e.error||'')));
  function withTimeout(promise,ms,message){
    let t;
    return Promise.race([Promise.resolve(promise),new Promise((_,rej)=>{t=setTimeout(()=>rej(new Error(message)),ms);})]).finally(()=>clearTimeout(t));
  }
  async function pool(items,limit,worker){
    let next=0;const results=[];
    const runners=Array.from({length:Math.min(limit,items.length)},async()=>{
      while(next<items.length){const i=next++;results[i]=await worker(items[i],i);}
    });
    await Promise.all(runners);
    return results;
  }

  // Caché local en IndexedDB (si no existe, la app sigue funcionando solo con memoria).
  function defaultIdb(){
    let dbp=null;
    const open=()=>dbp||(dbp=new Promise(resolve=>{
      try{
        if(typeof indexedDB==='undefined'){resolve(null);return;}
        const req=indexedDB.open('jcp_img_v1',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('img',{keyPath:'name'});
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>resolve(null);
        req.onblocked=()=>resolve(null);
      }catch(e){resolve(null);}
    }));
    const tx=async(mode,fn)=>{
      const db=await open();if(!db)return null;
      return new Promise(resolve=>{
        try{
          const t=db.transaction('img',mode);const store=t.objectStore('img');
          const r=fn(store);
          if(r&&'onsuccess' in r){r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);}
          else t.oncomplete=()=>resolve(true);
          t.onerror=()=>resolve(null);t.onabort=()=>resolve(null);
        }catch(e){resolve(null);}
      });
    };
    return {
      get:name=>tx('readonly',s=>s.get(name)),
      put:rec=>tx('readwrite',s=>s.put(rec)),
      async pending(){const all=await tx('readonly',s=>s.getAll());return (all||[]).filter(r=>r&&r.uploaded===false);}
    };
  }

  function create({client,getUserId,bucket=BUCKET,idb=defaultIdb(),uploadTimeoutMs=90000,downloadTimeoutMs=60000}){
    const mem=new Map();        // nombre -> data URL
    const idByUrl=new Map();    // data URL -> nombre
    const queue=new Map();      // nombre -> data URL (pendientes de subir)
    const uploaded=new Set();
    const inflight=new Map();   // nombre -> Promise (descargas en curso)
    const writes=new Set();
    const store=()=>client.storage.from(bucket);
    const track=p=>{const q=Promise.resolve(p).catch(()=>{}).finally(()=>writes.delete(q));writes.add(q);return q;};

    function register(url){
      let name=idByUrl.get(url);
      if(!name){name=makeName(url);idByUrl.set(url,name);}
      if(!mem.has(name))mem.set(name,url);
      if(!uploaded.has(name)&&!queue.has(name)){
        queue.set(name,url);
        track(idb.put({name,dataUrl:url,uploaded:false,at:Date.now()}));
      }
      return name;
    }
    function collapse(node){
      if(typeof node==='string')return isDataImage(node)?PREFIX+register(node):node;
      if(Array.isArray(node))return node.map(collapse);
      if(node&&typeof node==='object'){const o={};for(const k of Object.keys(node))o[k]=collapse(node[k]);return o;}
      return node;
    }
    function expandInPlace(node,missing=new Set()){
      if(!node||typeof node!=='object')return missing;
      for(const k of Object.keys(node)){
        const v=node[k];
        if(typeof v==='string'){
          if(v.startsWith(PREFIX)){const u=mem.get(v.slice(PREFIX.length));if(u)node[k]=u;else missing.add(v.slice(PREFIX.length));}
        }else if(v&&typeof v==='object')expandInPlace(v,missing);
      }
      return missing;
    }
    function collectRefs(node,out=new Set()){
      if(!node||typeof node!=='object')return out;
      for(const k of Object.keys(node)){
        const v=node[k];
        if(typeof v==='string'){if(v.startsWith(PREFIX))out.add(v.slice(PREFIX.length));}
        else if(v&&typeof v==='object')collectRefs(v,out);
      }
      return out;
    }
    function collectImages(node,out=new Set()){
      if(!node||typeof node!=='object')return out;
      for(const k of Object.keys(node)){
        const v=node[k];
        if(typeof v==='string'){if(isDataImage(v))out.add(v);}
        else if(v&&typeof v==='object')collectImages(v,out);
      }
      return out;
    }
    const peek=ref=>mem.get(nameOf(ref))||null;

    async function flushUploads(onProgress=()=>{}){
      await Promise.all([...writes]);
      const uid=getUserId();
      // Recuperar fotos que quedaron pendientes en una sesión anterior.
      try{
        for(const rec of (await idb.pending())||[]){
          if(rec&&rec.name&&rec.dataUrl&&!uploaded.has(rec.name)&&!queue.has(rec.name)){
            queue.set(rec.name,rec.dataUrl);mem.set(rec.name,rec.dataUrl);idByUrl.set(rec.dataUrl,rec.name);
          }
        }
      }catch(e){}
      const items=[...queue.entries()];
      if(!items.length)return {uploaded:0};
      if(!uid)throw new Error('No hay sesión activa para subir las fotos.');
      let done=0;const errors=[];
      await pool(items,3,async([name,url])=>{
        try{
          const res=await withTimeout(store().upload(uid+'/'+name,dataUrlToBlob(url),{contentType:mimeOfDataUrl(url),upsert:false}),uploadTimeoutMs,'La subida de una foto tardó demasiado.');
          if(res&&res.error&&!isDuplicate(res.error))throw new Error(res.error.message||String(res.error));
          uploaded.add(name);queue.delete(name);
          await idb.put({name,dataUrl:url,uploaded:true,at:Date.now()});
          done++;onProgress(done,items.length);
        }catch(e){errors.push(e);}
      });
      if(errors.length)throw new Error('No se pudieron subir '+errors.length+' foto(s) a la nube. '+(errors[0]?.message||''));
      return {uploaded:done};
    }

    async function load(refOrName){
      const name=nameOf(refOrName);
      if(mem.has(name))return mem.get(name);
      if(inflight.has(name))return inflight.get(name);
      const p=(async()=>{
        try{
          const rec=await idb.get(name);
          if(rec&&rec.dataUrl){mem.set(name,rec.dataUrl);idByUrl.set(rec.dataUrl,name);if(rec.uploaded!==false)uploaded.add(name);else if(!queue.has(name))queue.set(name,rec.dataUrl);return rec.dataUrl;}
        }catch(e){}
        const uid=getUserId();if(!uid)return null;
        try{
          const {data,error}=await withTimeout(store().download(uid+'/'+name),downloadTimeoutMs,'La descarga de una foto tardó demasiado.');
          if(error||!data)return null;
          const ext=name.split('.').pop();
          const url=await blobToDataUrl(data,MIME_BY_EXT[ext]||'image/jpeg');
          mem.set(name,url);idByUrl.set(url,name);uploaded.add(name);
          await idb.put({name,dataUrl:url,uploaded:true,at:Date.now()});
          return url;
        }catch(e){return null;}
      })().finally(()=>inflight.delete(name));
      inflight.set(name,p);
      return p;
    }
    async function hydrate(names,{concurrency=4,onProgress=()=>{}}={}){
      const list=[...new Set([...names].map(nameOf))].filter(n=>!mem.has(n));
      let done=0;const failed=[];
      await pool(list,concurrency,async n=>{
        const u=await load(n);
        if(!u)failed.push(n);
        done++;onProgress(done,list.length,n,u);
      });
      return {requested:list.length,failed};
    }
    async function verify(names,onProgress=()=>{}){
      const uid=getUserId();const bad=[];let done=0;
      await pool([...names],3,async n=>{
        try{
          const {data,error}=await withTimeout(store().download(uid+'/'+n),downloadTimeoutMs,'Verificación tardó demasiado.');
          const expected=mem.get(n)?dataUrlBytes(mem.get(n)):-1;
          if(error||!data||data.size!==expected)bad.push(n);
        }catch(e){bad.push(n);}
        done++;onProgress(done,names.length);
      });
      return bad;
    }
    return {collapse,expandInPlace,collectRefs,collectImages,peek,load,hydrate,flushUploads,verify,
      pendingCount:()=>queue.size,knownCount:()=>mem.size,isRef,PREFIX};
  }
  root.JcpImages={create,PREFIX,MIN_CHARS,BUCKET,isRef,isDataImage,makeName,dataUrlToBlob,blobToDataUrl,dataUrlBytes};
  if(typeof module==='object'&&module.exports)module.exports=root.JcpImages;
})(typeof window==='object'?window:globalThis);

const APP_VERSION='2026.09.20.18';
const CACHE_NAME='multi-jcp-'+APP_VERSION;
const APP_BASE=self.registration.scope;
const INDEX_URL=new URL('index.html',APP_BASE).href;
const APP_SHELL=['./','index.html','app-update.js','version.json','jcp-accounting.js','jcp-sync.js','jcp-images.js'].map(path=>new URL(path,APP_BASE).href);
const OPTIONAL_SHELL=['logo-1.jpg','logo-2.jpg','logo-3.jpg','manifest.json','icon-192.png','icon-512.png','icon-maskable-192.png','icon-maskable-512.png','jay-natural.js?v=2','jay-ai.js?v=4'].map(path=>new URL(path,APP_BASE).href);

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url=>{
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error('No se pudo cachear '+url);
      await cache.put(url,response.clone());
    }));
    await Promise.all(OPTIONAL_SHELL.map(async url=>{
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(response.ok)await cache.put(url,response.clone());
      }catch(e){}
    }));
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('multi-jcp-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  const isNavigate=event.request.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/');
  const alwaysFresh=url.pathname.endsWith('/version.json')||url.pathname.endsWith('/app-update.js');

  if(isNavigate||alwaysFresh){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response&&response.ok){
            const copy=response.clone();
            caches.open(CACHE_NAME).then(cache=>cache.put(isNavigate?INDEX_URL:event.request,copy)).catch(()=>{});
          }
          return response;
        })
        .catch(()=>caches.match(isNavigate?INDEX_URL:event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});

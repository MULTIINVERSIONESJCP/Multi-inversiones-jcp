const CACHE_NAME='multi-jcp-v81-jay-natural';
const APP_SHELL=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/icon-maskable-192.png','/icon-maskable-512.png','/jay-natural.js'];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;

  const url=new URL(e.request.url);
  const isAppDocument=
    e.request.mode==='navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/Multi-inversiones-jcp/');

  if(isAppDocument){
    e.respondWith(
      fetch(e.request)
        .then(async r=>{
          const html=await r.text();
          const tag='<script src="./jay-natural.js?v=1"></script>';
          const patched=html.includes('jay-natural.js')
            ? html
            : html.replace('</body>',tag+'</body>');
          return new Response(patched,{
            status:r.status,
            statusText:r.statusText,
            headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
          });
        })
        .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const cp=r.clone();
        caches.open(CACHE_NAME).then(c=>c.put(e.request,cp)).catch(()=>{});
        return r;
      })
      .catch(()=>caches.match(e.request))
  );
});

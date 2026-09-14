(()=>{
  'use strict';
  const APP_VERSION='2026.09.12.3';
  const CHECK_EVERY_MS=10*60*1000;
  let banner=null;
  let reloading=false;
  function ensureBanner(registration){
    if(banner || !registration || !registration.waiting) return;
    banner=document.createElement('div');
    banner.id='jcp-update-banner';
    banner.setAttribute('role','status');
    banner.style.cssText=['position:fixed','left:12px','right:12px','bottom:78px','z-index:2147483647','background:#111','color:#fff','border:1px solid #d4af37','border-radius:14px','padding:14px','box-shadow:0 10px 30px rgba(0,0,0,.35)','font-family:Arial,sans-serif'].join(';');
    const text=document.createElement('div');
    text.innerHTML='<strong>Nueva versión disponible</strong><div style="font-size:13px;opacity:.82;margin-top:4px">Actualiza el programa sin modificar los datos de Supabase.</div>';
    const actions=document.createElement('div');
    actions.style.cssText='display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
    const updateBtn=document.createElement('button');
    updateBtn.type='button'; updateBtn.textContent='Actualizar ahora';
    updateBtn.style.cssText='flex:1;min-width:140px;padding:10px 12px;border:0;border-radius:10px;background:#d4af37;color:#111;font-weight:700';
    updateBtn.addEventListener('click',()=>{updateBtn.disabled=true;updateBtn.textContent='Actualizando…';const waiting=registration.waiting;if(waiting) waiting.postMessage({type:'SKIP_WAITING'});else location.reload();});
    const laterBtn=document.createElement('button');
    laterBtn.type='button'; laterBtn.textContent='Más tarde';
    laterBtn.style.cssText='padding:10px 12px;border:1px solid #666;border-radius:10px;background:#222;color:#fff';
    laterBtn.addEventListener('click',()=>{banner?.remove();banner=null;});
    actions.append(updateBtn,laterBtn); banner.append(text,actions); document.body.appendChild(banner);
  }
  async function checkForUpdate(registration){try{await registration.update();if(registration.waiting) ensureBanner(registration);}catch(err){console.warn('JCP: no fue posible comprobar actualizaciones',err);}}
  async function initUpdater(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const registration=await navigator.serviceWorker.register('./service-worker.js');
      if(registration.waiting) ensureBanner(registration);
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)ensureBanner(registration);});});
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload();});
      window.addEventListener('focus',()=>checkForUpdate(registration));
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate(registration);});
      setInterval(()=>checkForUpdate(registration),CHECK_EVERY_MS);
      checkForUpdate(registration);
    }catch(err){console.warn('JCP: actualizador no disponible',err);}
  }
  window.JCP_APP_VERSION=APP_VERSION;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initUpdater,{once:true});else initUpdater();
})();

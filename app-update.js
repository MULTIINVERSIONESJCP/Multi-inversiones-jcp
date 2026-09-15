(()=>{
  'use strict';

  const APP_VERSION='2026.09.15.3';
  const CHECK_EVERY_MS=10*60*1000;
  let registrationRef=null;
  let banner=null;
  let toast=null;
  let reloading=false;
  let latestVersion=APP_VERSION;
  let versionStatus='checking';
  let lastVersionError='';

  function cleanVersion(v){
    return String(v||'').trim();
  }

  function versionParts(v){
    return cleanVersion(v).split(/[^0-9]+/).filter(Boolean).map(Number);
  }

  function compareVersions(a,b){
    const A=versionParts(a),B=versionParts(b);
    const n=Math.max(A.length,B.length);
    for(let i=0;i<n;i++){
      const av=A[i]||0,bv=B[i]||0;
      if(av!==bv)return av>bv?1:-1;
    }
    return 0;
  }

  function appAccount(){
    return 'Consultar con DIAGNÓSTICO DE CONEXIÓN';
  }

  function syncLabel(){
    return window.jcpCloudBootstrapReady===true?'Carga central completada':'Carga central no confirmada';
  }

  async function diagnoseConnection(output){
    const lines=[];
    const add=(label,value)=>{lines.push(label+': '+value);output.textContent=lines.join('\n');};
    const limited=promise=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Tiempo de espera agotado (15 segundos)')),15000);
      Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});
    });
    add('Versión',APP_VERSION);
    add('Arranque',window.jcpCloudBootstrapMode||'Sin etapa registrada');
    add('Carga central terminada',window.jcpCloudBootstrapReady===true?'Sí':'No');
    try{
      const local=JSON.parse(localStorage.getItem('jcp_app_v1')||'null');
      add('Vehículos en copia local',Array.isArray(local?.veh)?local.veh.length:'Sin copia válida');
      add('Cambios pendientes',localStorage.getItem('jcp_cloud_pending_v1')==='1'?'Sí':'No');
    }catch(e){add('Copia local','No se pudo leer');}
    try{
      if(typeof supabaseClient==='undefined')throw new Error('El cliente Supabase no se inicializó');
      add('Proyecto',new URL(SUPABASE_URL).hostname);
      add('Consulta','Comprobando sesión…');
      const sessionResult=await limited(supabaseClient.auth.getSession());
      if(sessionResult.error)throw sessionResult.error;
      const user=sessionResult.data?.session?.user;
      if(!user){add('Sesión','No hay sesión guardada. No se consultaron registros.');return;}
      add('Cuenta',user.email||user.id);
      add('ID de cuenta',user.id);
      const result=await limited(supabaseClient.from('app_data').select('data,updated_at').eq('user_id',user.id).maybeSingle());
      if(result.error)throw result.error;
      if(!result.data){add('Supabase','No devolvió una fila visible para esta cuenta');return;}
      add('Vehículos en Supabase',Array.isArray(result.data.data?.veh)?result.data.data.veh.length:'Formato no reconocido');
      add('Actualización en Supabase',result.data.updated_at||'Sin fecha');
      add('Reinicio registrado',result.data.data?._sync?.resetId||'Sin identificador');
      add('Resultado','Lectura terminada; no se modificaron registros');
    }catch(e){add('Error de conexión',String(e?.message||e));}
  }

  function updateMenuLabel(){
    const item=document.getElementById('jcpVersionMenuItem');
    if(!item)return;
    let suffix='';
    if(versionStatus==='current')suffix=' · ✓';
    else if(versionStatus==='outdated')suffix=' · ACTUALIZAR';
    else if(versionStatus==='error')suffix=' · SIN VERIFICAR';
    item.textContent='ℹ️ Versión '+APP_VERSION+suffix;
  }

  function ensureToast(message,kind='normal',autoHide=true){
    if(!document.body)return;
    if(!toast){
      toast=document.createElement('div');
      toast.id='jcp-version-toast';
      toast.setAttribute('role','status');
      toast.style.cssText=[
        'position:fixed','left:50%','top:16px','transform:translateX(-50%)',
        'z-index:2147483646','width:min(520px,calc(100vw - 24px))',
        'padding:11px 14px','border-radius:12px','background:#111','color:#fff',
        'border:1px solid #d4af37','box-shadow:0 12px 32px rgba(0,0,0,.48)',
        'font-family:Arial,sans-serif','font-size:12px','font-weight:800','text-align:center'
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent=message;
    toast.style.borderColor=kind==='error'?'#a64b4b':kind==='ok'?'#477a58':'#d4af37';
    toast.style.display='block';
    clearTimeout(toast._hideTimer);
    if(autoHide){
      toast._hideTimer=setTimeout(()=>{if(toast)toast.style.display='none';},4200);
    }
  }

  function ensureBanner(registration,message='Nueva versión disponible'){
    if(!document.body)return;
    if(banner){
      const title=banner.querySelector('[data-jcp-update-title]');
      if(title)title.textContent=message;
      return;
    }
    banner=document.createElement('div');
    banner.id='jcp-update-banner';
    banner.setAttribute('role','status');
    banner.style.cssText=['position:fixed','left:12px','right:12px','bottom:78px','z-index:2147483647','background:#111','color:#fff','border:1px solid #d4af37','border-radius:14px','padding:14px','box-shadow:0 10px 30px rgba(0,0,0,.35)','font-family:Arial,sans-serif'].join(';');

    const text=document.createElement('div');
    text.innerHTML='<strong data-jcp-update-title>'+message+'</strong><div style="font-size:13px;opacity:.82;margin-top:4px">Instalada: '+APP_VERSION+' · Disponible: '+latestVersion+'. Los datos de Supabase no se modifican al actualizar.</div>';

    const actions=document.createElement('div');
    actions.style.cssText='display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';

    const updateBtn=document.createElement('button');
    updateBtn.type='button';
    updateBtn.textContent='Actualizar ahora';
    updateBtn.style.cssText='flex:1;min-width:140px;padding:10px 12px;border:0;border-radius:10px;background:#d4af37;color:#111;font-weight:700';
    updateBtn.addEventListener('click',async()=>{
      updateBtn.disabled=true;
      updateBtn.textContent='Preparando actualización…';
      try{
        const reg=registration||registrationRef;
        if(reg){
          await reg.update();
          if(reg.waiting){
            reg.waiting.postMessage({type:'SKIP_WAITING'});
            return;
          }
          const installing=reg.installing;
          if(installing){
            const activate=()=>{
              if(installing.state==='installed'&&reg.waiting){
                reg.waiting.postMessage({type:'SKIP_WAITING'});
              }
            };
            installing.addEventListener('statechange',activate);
            activate();
          }else{
            location.reload();
          }
        }else{
          location.reload();
        }
      }catch(err){
        console.warn('JCP: no fue posible aplicar la actualización',err);
        updateBtn.disabled=false;
        updateBtn.textContent='Reintentar actualización';
      }
    });

    const laterBtn=document.createElement('button');
    laterBtn.type='button';
    laterBtn.textContent='Más tarde';
    laterBtn.style.cssText='padding:10px 12px;border:1px solid #666;border-radius:10px;background:#222;color:#fff';
    laterBtn.addEventListener('click',()=>{banner?.remove();banner=null;});

    actions.append(updateBtn,laterBtn);
    banner.append(text,actions);
    document.body.appendChild(banner);
  }

  async function fetchLatestVersion(){
    try{
      const response=await fetch('./version.json?ts='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const info=await response.json();
      const remote=cleanVersion(info?.version);
      if(!remote)throw new Error('version.json no contiene una versión válida');
      latestVersion=remote;
      lastVersionError='';
      const cmp=compareVersions(remote,APP_VERSION);
      if(cmp>0){
        versionStatus='outdated';
        ensureBanner(registrationRef,'Nueva versión '+remote+' disponible');
      }else{
        versionStatus='current';
        if(banner){banner.remove();banner=null;}
      }
      updateMenuLabel();
      window.JCP_LATEST_VERSION=latestVersion;
      window.JCP_VERSION_STATUS=versionStatus;
      window.dispatchEvent(new CustomEvent('jcp-version-checked',{detail:{installed:APP_VERSION,latest:latestVersion,status:versionStatus}}));
      return {installed:APP_VERSION,latest:latestVersion,status:versionStatus};
    }catch(err){
      lastVersionError=String(err?.message||err);
      versionStatus='error';
      updateMenuLabel();
      window.JCP_VERSION_STATUS=versionStatus;
      console.warn('JCP: no fue posible comprobar version.json',err);
      return {installed:APP_VERSION,latest:latestVersion,status:versionStatus,error:lastVersionError};
    }
  }

  async function checkForUpdate(registration){
    try{
      if(registration)await registration.update();
    }catch(err){
      console.warn('JCP: no fue posible comprobar el service worker',err);
    }
    const result=await fetchLatestVersion();
    if(registration?.waiting && result.status!=='current')ensureBanner(registration,'Nueva versión disponible');
    return result;
  }

  function versionStatusText(){
    if(versionStatus==='current')return '✓ ESTA ES LA ÚLTIMA VERSIÓN PUBLICADA';
    if(versionStatus==='outdated')return '⚠ HAY UNA VERSIÓN MÁS RECIENTE DISPONIBLE';
    if(versionStatus==='error')return '⚠ NO SE PUDO VERIFICAR LA ÚLTIMA VERSIÓN';
    return 'VERIFICANDO…';
  }

  function closeVersionInfo(){
    document.getElementById('jcpVersionInfoOverlay')?.remove();
  }

  async function showVersionInfo(){
    await fetchLatestVersion();
    closeVersionInfo();
    const overlay=document.createElement('div');
    overlay.id='jcpVersionInfoOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif;color:#fff';
    overlay.innerHTML=`<div style="width:min(480px,100%);max-height:90vh;overflow:auto;background:#111;border:1px solid #d4af37;border-radius:18px;padding:18px;box-shadow:0 24px 70px #000">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><div style="color:#d4af37;font-weight:900;font-size:18px">MULTI INVERSIONES JCP</div><div style="color:#aaa;font-size:11px;margin-top:3px">Información de versión y sincronización</div></div>
        <button id="jcpVersionClose" type="button" style="width:34px;height:34px;padding:0;border-radius:50%;border:1px solid #444;background:#222;color:#fff">×</button>
      </div>
      <div style="display:grid;gap:8px;margin-top:16px;font-size:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #333;border-radius:10px"><span style="color:#aaa">Versión instalada</span><b>${APP_VERSION}</b></div>
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #333;border-radius:10px"><span style="color:#aaa">Última publicada</span><b>${latestVersion}</b></div>
        <div style="padding:10px;border:1px solid #5c4a18;border-radius:10px;color:#d4af37;font-weight:900;text-align:center">${versionStatusText()}</div>
        <div style="padding:10px;border:1px solid #333;border-radius:10px"><span style="color:#aaa">Cuenta Supabase</span><div style="margin-top:4px;font-weight:800;overflow-wrap:anywhere">${appAccount()}</div></div>
        <div style="padding:10px;border:1px solid #333;border-radius:10px"><span style="color:#aaa">Sincronización</span><div style="margin-top:4px;font-weight:800">${syncLabel()}</div></div>
        ${lastVersionError?`<div style="font-size:10px;color:#ff9999">Detalle de verificación: ${lastVersionError.replace(/[<>&]/g,'')}</div>`:''}
      </div>
      <div style="display:grid;grid-template-columns:1fr ${versionStatus==='outdated'?'1fr':'0fr'};gap:8px;margin-top:14px">
        <button id="jcpVerifyVersionBtn" type="button" style="min-height:42px;border:1px solid #d4af37;border-radius:10px;background:#17130a;color:#d4af37;font-weight:900">VERIFICAR AHORA</button>
        ${versionStatus==='outdated'?'<button id="jcpApplyUpdateBtn" type="button" style="min-height:42px;border:0;border-radius:10px;background:#d4af37;color:#111;font-weight:900">ACTUALIZAR</button>':''}
      </div>
    </div>`;
    const diagnosticBtn=document.createElement('button');
    diagnosticBtn.textContent='DIAGNÓSTICO DE CONEXIÓN';
    diagnosticBtn.style.cssText='width:100%;margin-top:12px;padding:12px;background:#d4af37;border:0;border-radius:10px;font-weight:bold';
    const output=document.createElement('pre');
    output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Arial;color:#fff';
    diagnosticBtn.onclick=async()=>{diagnosticBtn.disabled=true;try{await diagnoseConnection(output);}finally{diagnosticBtn.disabled=false;}};
    overlay.firstElementChild.append(diagnosticBtn,output);
    document.body.appendChild(overlay);
    overlay.querySelector('#jcpVersionClose').onclick=closeVersionInfo;
    overlay.onclick=e=>{if(e.target===overlay)closeVersionInfo();};
    overlay.querySelector('#jcpVerifyVersionBtn').onclick=async()=>{
      const btn=overlay.querySelector('#jcpVerifyVersionBtn');
      btn.disabled=true;btn.textContent='VERIFICANDO…';
      await checkForUpdate(registrationRef);
      closeVersionInfo();
      showVersionInfo();
    };
    const apply=overlay.querySelector('#jcpApplyUpdateBtn');
    if(apply)apply.onclick=()=>{ensureBanner(registrationRef,'Nueva versión '+latestVersion+' disponible');closeVersionInfo();};
  }

  async function initUpdater(){
    window.JCP_APP_VERSION=APP_VERSION;
    updateMenuLabel();
    ensureToast('MULTI INVERSIONES JCP · Versión '+APP_VERSION+' · verificando actualización…','normal',false);

    if('serviceWorker' in navigator){
      try{
        registrationRef=await navigator.serviceWorker.register('./service-worker.js');
        if(registrationRef.waiting)ensureBanner(registrationRef,'Actualización preparada');
        registrationRef.addEventListener('updatefound',()=>{
          const worker=registrationRef.installing;
          if(!worker)return;
          worker.addEventListener('statechange',()=>{
            if(worker.state==='installed'&&navigator.serviceWorker.controller){
              ensureBanner(registrationRef,'Nueva versión preparada');
            }
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange',()=>{
          if(reloading)return;
          reloading=true;
          location.reload();
        });
      }catch(err){
        console.warn('JCP: actualizador por service worker no disponible',err);
      }
    }

    const result=await checkForUpdate(registrationRef);
    if(result.status==='current')ensureToast('MULTI INVERSIONES JCP · Versión '+APP_VERSION+' · ✓ aplicación actualizada','ok',true);
    else if(result.status==='outdated')ensureToast('Hay una versión más reciente: '+result.latest,'normal',true);
    else ensureToast('Versión '+APP_VERSION+' · no fue posible verificar la última publicada','error',true);

    window.addEventListener('focus',()=>checkForUpdate(registrationRef));
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')checkForUpdate(registrationRef);
    });
    setInterval(()=>checkForUpdate(registrationRef),CHECK_EVERY_MS);
  }

  window.JCP_APP_VERSION=APP_VERSION;
  window.JCP_LATEST_VERSION=latestVersion;
  window.JCP_VERSION_STATUS=versionStatus;
  window.JCP_CHECK_VERSION=()=>checkForUpdate(registrationRef);
  window.JCP_SHOW_VERSION_INFO=showVersionInfo;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initUpdater,{once:true});
  else initUpdater();
})();

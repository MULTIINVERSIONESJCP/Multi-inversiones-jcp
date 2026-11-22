/* Colombia Autos · módulo comercial JCP v2 · 2026-11-19
 * Reemplaza el archivo homónimo en la raíz del repositorio.
 * Requiere ejecutar una única vez colombia-autos-fotos-seguras.sql.
 * Lee únicamente la foto principal del inventario local para mostrar una vista previa privada.
 * No modifica app_data, compras, ventas, gastos ni finanzas.
 */
(()=>{'use strict';
const SITE='https://colombia-autos-jeissoncamilomar-1669s-projects.vercel.app/';
const BUCKET='colombia-autos-publico';
const dbClient=()=>{try{return typeof supabaseClient!=='undefined'?supabaseClient:(window.supabaseClient||null)}catch{return null}};
const str=x=>String(x??'');
const esc=x=>str(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const cash=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
const formatPrice=n=>n?new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(Number(n)):'';
const parsePrice=v=>Number(String(v??'').replace(/[^0-9]/g,''));
// Normaliza fotos del iPhone antes de subirlas. Se mantiene el orden de selección.
async function prepareCommercialImage(original){
 const maxBytes=8*1024*1024;
 if(!original||!original.size)throw new Error('archivo vacío');
 const type=String(original.type||'').toLowerCase();
 const name=String(original.name||'foto');
 const supported=/^image\/(jpeg|png|webp|heic|heif)$/.test(type)||/\.(jpe?g|png|webp|heic|heif)$/i.test(name);
 if(!supported)throw new Error('formato de imagen no reconocido');
 const url=URL.createObjectURL(original);
 let img;
 try{
  img=await new Promise((resolve,reject)=>{
   const image=new Image();image.onload=()=>resolve(image);
   image.onerror=()=>reject(new Error('el iPhone no pudo abrir esta imagen; guárdala como JPG desde Fotos y vuelve a seleccionarla'));
   image.src=url;
  });
  let w=img.naturalWidth,h=img.naturalHeight;
  if(!(w>0&&h>0))throw new Error('imagen sin dimensiones válidas');
  const ratio=Math.min(1,2200/Math.max(w,h));w=Math.max(1,Math.round(w*ratio));h=Math.max(1,Math.round(h*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('no se pudo preparar la imagen');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.83));
  canvas.width=0;canvas.height=0;
  if(!blob||!blob.size||blob.size>maxBytes)throw new Error('la conversión no produjo una imagen válida de menos de 8 MB');
  const safeName=name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'_').slice(0,65)||'foto';
  return new File([blob],safeName+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
 }finally{URL.revokeObjectURL(url)}
}
const draftPhotos=new Map();
let publishingPhotos=false;
function discardDrafts(){
 for(const list of draftPhotos.values())for(const item of list)URL.revokeObjectURL(item.url);
 draftPhotos.clear();
}
function photoStoragePath(item,db,user,car){
 const url=photoUrl(db,item);
 const marker='/storage/v1/object/public/'+BUCKET+'/';
 const ix=url.indexOf(marker);if(ix<0)return null;
 let path;try{path=decodeURIComponent(url.slice(ix+marker.length).split('?')[0])}catch{return null}
 if(!path.startsWith(user.id+'/'+car.id+'/'))return null;
 if(path.split('/').length!==3)return null;
 return path;
}

const css=`
#ca-panel .ca-category{display:block;width:100%;background:#171717;color:#fff;border:1px solid #9d7b40;border-radius:8px;min-height:48px;padding:11px 12px;font-size:15px;margin:8px 0 10px}
#ca-overlay{position:fixed;inset:0;background:#000b;z-index:2147483644;display:none}
#ca-overlay.ca-open{display:block}
#ca-panel{position:fixed;z-index:2147483645;right:0;top:0;bottom:0;width:min(550px,100vw);background:#0e0e0e;color:#f5f5f5;box-shadow:-12px 0 45px #0008;transform:translateX(103%);transition:transform .2s;overflow:auto;font:14px system-ui,-apple-system,Arial,sans-serif;overscroll-behavior:contain}
#ca-panel.ca-open{transform:translateX(0)}
#ca-panel *{box-sizing:border-box}
#ca-panel header{position:sticky;top:0;z-index:2;background:#171717;color:#fff;padding:19px 18px;border-bottom:1px solid #53411e;display:flex;justify-content:space-between;gap:10px;align-items:center}
#ca-panel .ca-body{padding:15px 15px 100px}
#dashboard .ca-home-card{font:inherit;color:inherit;min-width:0;min-height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;text-align:center;cursor:pointer}
#dashboard .ca-home-card b{display:block;font-weight:800}
#dashboard .ca-home-emoji{font-size:29px;line-height:1.2}
#jcpHomeV2 .jcp-h2-q .ca-home-action{grid-column:span 3;justify-content:center;gap:12px;min-width:0;min-height:62px;white-space:nowrap}
#jcpHomeV2 .ca-home-symbol{font-size:23px;line-height:1}
#ca-panel h2{font-size:20px;margin:0;letter-spacing:.5px;color:#fff}
#ca-panel h3{font-size:17px;line-height:1.25;color:#fff!important;margin:0 0 7px;font-weight:800}
#ca-panel p{line-height:1.5;color:#bbb}
#ca-panel .ca-item{padding:15px;background:#191919;border:1px solid #3b3427;border-radius:13px;margin:12px 0;box-shadow:0 2px 13px #0003}
#ca-panel .ca-tag{font-size:12px;color:#bcbcbc;line-height:1.4}
#ca-panel .ca-status{padding:11px 12px;border-radius:9px;border:1px solid #493d28;background:#241f16;color:#ead1a0;margin:14px 0;line-height:1.45}
#ca-panel label{color:#f4f4f4;font-size:13px;font-weight:700;display:block;margin:13px 0 6px}
#ca-panel input.ca-price,#ca-panel input[type=file]{display:block;width:100%;border:1px solid #62512a;background:#090909;color:#fff;padding:11px;border-radius:9px;font:inherit;min-width:0}
#ca-panel input::placeholder{color:#909090}
#ca-panel input[type=file]::file-selector-button{background:#343434;color:#fff;border:0;border-radius:7px;padding:8px;margin-right:9px}
#ca-panel button{background:#c5a15d;color:#141414;border:0;border-radius:8px;padding:11px 13px;font:700 13px system-ui;cursor:pointer}
#ca-panel button:disabled{opacity:.47;cursor:not-allowed}
#ca-panel .ca-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#ca-panel .ca-row button{flex:1 1 125px}
#ca-panel .ca-light{background:#252525;color:#f5f5f5;border:1px solid #6d552d}
#ca-panel .ca-hide{background:#462e2e;color:#fff}
#ca-panel .ca-msg{background:#282318;color:#f0d29d;padding:12px;border-radius:9px;margin:12px 0;white-space:pre-wrap;line-height:1.45}
#ca-panel .ca-result{margin:10px 0 0;color:#d5c4a9;white-space:pre-wrap;min-height:16px}
#ca-panel a{color:#e5ba6c}
#ca-panel .ca-picker{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0 18px}
#ca-inventory-hint{display:none;position:sticky;top:0;z-index:1100;background:#201a10;color:#f2d69b;border:1px solid #987441;border-radius:10px;padding:12px;margin:8px 0;font:700 13px system-ui;align-items:center;justify-content:space-between;gap:8px}
#ca-inventory-hint button{background:#d4af69;color:#111;border:0;padding:9px;border-radius:8px;font-weight:800}
#ca-panel .ca-picker-unused{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0 18px}
#ca-panel .ca-choice{display:block;min-width:0;padding:0;background:#171717;border:1px solid #3d3525;border-radius:12px;overflow:hidden;text-align:left;color:#fff;cursor:pointer}
#ca-panel .ca-choice[aria-pressed="true"]{border:2px solid #d6b46a;background:#2a2419}
#ca-panel .ca-choice img{width:100%;height:113px;object-fit:cover;display:block;background:#222}
#ca-panel .ca-choice strong{display:block;padding:8px 9px 3px;color:#fff;font-size:12px;line-height:1.25;min-height:43px}
#ca-panel .ca-choice small{display:block;padding:0 9px 9px;color:#bda16c;font-size:11px}
#ca-panel .ca-picker-title{font-size:16px;font-weight:800;color:#eed095;margin:18px 0 8px}
#ca-panel .ca-item{display:none}
#ca-panel .ca-item.ca-selected{display:block}
#ca-panel .ca-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:9px 0}
#ca-panel .ca-photo-item{position:relative;min-width:0}
#ca-panel .ca-photo-item img{width:100%;height:105px;object-fit:cover;border-radius:7px;border:1px solid #594b2e;background:#111;display:block}
#ca-panel .ca-photo-item button{position:absolute;top:5px;right:5px;min-width:29px;min-height:29px;border-radius:50%;padding:0;background:#8c2020;color:white;border:1px solid #eee;font-size:17px}
#ca-panel .ca-photo-item.ca-draft img{border-color:#c5a15d}
#ca-panel .ca-photo-item small{display:block;color:#dac188;margin-top:3px;font-size:10px}
#ca-panel .ca-draft-note{color:#d8bb7b;font-size:12px;margin:8px 0}

#ca-panel .ca-muted{color:#a6a6a6;font-size:12px}
#ca-panel .ca-caption{color:#c8a76b;font-size:12px;font-weight:800;letter-spacing:.6px}
@media(max-width:600px){#ca-panel{width:100vw}#ca-panel .ca-body{padding:13px 13px 105px}#ca-panel .ca-photos img{height:90px}}
`;
function mount(){if(document.getElementById('ca-panel'))return;
 const style=document.createElement('style');style.textContent=css;document.head.append(style);
 const overlay=document.createElement('div');overlay.id='ca-overlay';
 const panel=document.createElement('aside');panel.id='ca-panel';panel.setAttribute('aria-label','Panel comercial Colombia Autos');
 panel.innerHTML=`<header><div><h2>COLOMBIA AUTOS</h2><div class="ca-caption">ADMINISTRACIÓN COMERCIAL DE JCP</div></div><button type="button" id="ca-close" class="ca-light">Cerrar</button></header><div class="ca-body"><p>Vehículo elegido desde el inventario original de JCP. Configura su precio y fotos públicas; las finanzas permanecen privadas.</p><p><a href="${SITE}" target="_blank" rel="noopener noreferrer">Abrir página pública de Colombia Autos</a></p><div id="ca-status" class="ca-msg" role="status">Abre el panel para consultar tu inventario.</div><div id="ca-picker" class="ca-picker"></div><div id="ca-cars"></div></div>`;
 document.body.append(overlay,panel);
 // Los borradores no se suben al servidor: cerrar los descarta sin borrar archivos publicados.
 const close=()=>{
   if(publishingPhotos){alert('La publicación se está guardando. Termina esta operación antes de cerrar.');return}
   overlay.classList.remove('ca-open');panel.classList.remove('ca-open');
   discardDrafts();
   panel.querySelectorAll('input.ca-file').forEach(input=>{input.value=''});
   panel.querySelectorAll('.ca-result').forEach(el=>{el.textContent=''});
 };
 overlay.addEventListener('click',close);panel.querySelector('#ca-close').addEventListener('click',close);
 // Una sola casilla en el Inicio visible, con el estilo nativo de JCP.
 const attachHomeWeb=()=>{
   const target=document.querySelector('#jcpHomeV2 .jcp-h2-q');
   if(!target)return;
   target.querySelectorAll('#ca-home-publish').forEach(node=>node.remove());
   if(!target.querySelector('#ca-home-web')){
     const web=document.createElement('button');
     web.type='button';web.id='ca-home-web';web.className='jcp-h2-tile wide ca-home-action';
     web.innerHTML='<span class="ca-home-symbol" aria-hidden="true">🌐</span><span>Página web</span>';
     web.setAttribute('aria-label','Abrir página web de Colombia Autos');
     web.onclick=()=>{window.open(SITE,'_blank','noopener,noreferrer')};
     target.appendChild(web);
   }
 };
 attachHomeWeb();
 const homeRoot=document.getElementById('dashboard');
 if(homeRoot){
   const observer=new MutationObserver(attachHomeWeb);
   observer.observe(homeRoot,{childList:true,subtree:true});
 }
 // Menú de tres puntos del DETALLE DEL VEHÍCULO: nunca abre un segundo inventario.
 const attachDetailMenu=()=>{
   const menu=document.getElementById('unifiedMenu_vehicleDetailView');
   if(!menu||menu.querySelector('#ca-detail-publish'))return;
   const btn=document.createElement('button');
   btn.type='button';btn.id='ca-detail-publish';
   btn.textContent='🌐 PUBLICAR EN PÁGINA WEB';
   btn.addEventListener('click',()=>{
     menu.classList.remove('open');
     let id=null;
     try{if(typeof selectedVehicleDetailId!=='undefined'&&selectedVehicleDetailId!=null)id=selectedVehicleDetailId}catch(_){}
     if(id==null){
       try{if(typeof selectedInventoryVehicleId!=='undefined'&&selectedInventoryVehicleId!=null)id=selectedInventoryVehicleId}catch(_){}
     }
     if(id==null){alert('Abre primero el detalle de un vehículo del inventario.');return}
     window.__caSelectedVehicle=String(id);
     close();
     overlay.classList.add('ca-open');panel.classList.add('ca-open');
     load();
   });
   menu.appendChild(btn);
 };
 attachDetailMenu();
 const detail=document.getElementById('vehicleDetailView');
 if(detail){
   const observer=new MutationObserver(attachDetailMenu);
   observer.observe(detail,{childList:true,subtree:true});
 }

}
function setStatus(s){const el=document.getElementById('ca-status');if(el)el.textContent=s}
function inventoryCover(vehicleId){
 // Solo lectura local. Una referencia jcpimg: se resuelve con la caché PRIVADA de JCP.
 try{
   const vehicles=(typeof data!=='undefined'&&Array.isArray(data?.veh))?data.veh:[];
   const v=vehicles.find(v=>String(v.id)===String(vehicleId));
   if(!v)return '';
   let photo=v.photo||v.foto||v.imagen||v.image||(Array.isArray(v.photos)?v.photos[0]:'')||'';
   if(typeof photo==='string'&&photo.startsWith('jcpimg:')){
     photo=(typeof jcpImages!=='undefined'&&jcpImages?.peek)?jcpImages.peek(photo):'';
   }
   return typeof photo==='string'&&/^(?:data:image\/|blob:|https:\/\/)/i.test(photo)?photo:'';
 }catch{return ''}
}
function inventoryEstimatedPrice(vehicleId){
 // Lee el valor comercial usando la misma normalización que la ficha de JCP.
 // No utiliza costo, precio de compra ni precios de otros vehículos.
 try{
  const vehicles=(typeof data!=='undefined'&&Array.isArray(data?.veh))?data.veh:[];
  const vehicle=vehicles.find(x=>String(x.id)===String(vehicleId));
  if(!vehicle)return 0;
  const valid=value=>{
   if(value==null||value==='')return 0;
   const n=typeof value==='number'?value:Number(String(value).replace(/[^0-9]/g,''));
   return Number.isSafeInteger(n)&&n>0&&n<=9999999999999?n:0;
  };
  // Esta función existe en el index.html de JCP y resuelve campos anidados y alias.
  if(typeof getVehicleCommercialSnapshot==='function'){
   const n=valid(getVehicleCommercialSnapshot(vehicle)?.precioEstimadoVenta);
   if(n)return n;
  }
  const aliases=new Set(['precioestimadoventa','precioventaestimado','valorestimadoventa','precioestimado','valorventaestimado']);
  const normalize=key=>String(key).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
  const seen=new Set();let found=0;
  const walk=(obj,depth)=>{
   if(found||depth>7||!obj||typeof obj!=='object'||seen.has(obj))return;
   seen.add(obj);
   for(const [key,value] of Object.entries(obj)){
    if(aliases.has(normalize(key))){const n=valid(value);if(n){found=n;return;}}
   }
   for(const value of Object.values(obj)){if(value&&typeof value==='object')walk(value,depth+1);if(found)return;}
  };
  walk(vehicle,0);return found;
 }catch{return 0}
}
function photoUrl(db,pathOrUrl){if(/^https:\/\//i.test(str(pathOrUrl)))return str(pathOrUrl);return db.storage.from(BUCKET).getPublicUrl(str(pathOrUrl)).data.publicUrl}
async function load(){const db=dbClient();if(!db){setStatus('No se encontró la conexión a Supabase. Inicia sesión en JCP.');return}
 let user;try{const r=await db.auth.getUser();if(r.error)throw r.error;user=r.data?.user}catch(err){setStatus('No se pudo verificar tu sesión: '+str(err.message));return}
 if(!user){setStatus('Inicia sesión en MULTI INVERSIONES JCP para administrar las publicaciones.');return}
 setStatus('Consultando únicamente tus publicaciones comerciales…');
 const {data:rows,error}=await db.from('colombia_autos_publicaciones').select('id,vehiculo_id,marca,referencia,modelo,precio_venta,publicado,vendido,fotos,categoria').eq('owner_id',user.id).eq('vendido',false).order('marca');
 if(error){setStatus('Error al consultar tus vehículos: '+error.message);return}
 discardDrafts();
 const root=document.getElementById('ca-cars');root.replaceChildren();
 const picker=document.getElementById('ca-picker');picker.replaceChildren();
 if(!rows?.length){setStatus('No hay publicaciones comerciales vinculadas a esta cuenta. No se han modificado datos.');return}
 setStatus(`Administrando el vehículo elegido desde Inventario. ${rows.length} vehículos disponibles; solo serán públicos los que autorices.`);
 const selectedBefore=window.__caSelectedVehicle;
 // Nunca elegir el primer vehículo como respaldo: eso podía mostrar Chery al abrir Duster.
 const inventoryVehicle=(typeof data!=='undefined'&&Array.isArray(data?.veh))
   ? data.veh.find(v=>String(v.id)===String(selectedBefore)) : null;
 const selectedRow=rows.find(c=>String(c.vehiculo_id)===String(selectedBefore));
 if(!inventoryVehicle){
   setStatus('⚠️ No se pudo identificar el vehículo seleccionado en el inventario JCP. Vuelve a abrir su ficha. No se permite publicar otro vehículo por error.');
   return;
 }
 if(!selectedRow){
   const label=[inventoryVehicle.marca||inventoryVehicle.m||'',inventoryVehicle.ref||inventoryVehicle.referencia||'',inventoryVehicle.modelo||''].filter(Boolean).join(' ');
   setStatus('⚠️ '+(label||'Este vehículo')+' todavía no tiene una publicación comercial vinculada a su ID en Colombia Autos. No hemos mostrado ni modificado otro carro. Es necesario vincularlo antes de publicar.');
   return;
 }
 const actualBrand=String(inventoryVehicle.marca||inventoryVehicle.m||'').trim().toUpperCase();
 const rowBrand=String(selectedRow.marca||'').trim().toUpperCase();
 const actualRef=String(inventoryVehicle.ref||inventoryVehicle.referencia||'').trim().toUpperCase();
 const rowRef=String(selectedRow.referencia||'').trim().toUpperCase();
 if((actualBrand&&rowBrand&&actualBrand!==rowBrand)||(actualRef&&rowRef&&actualRef!==rowRef)){
   setStatus('⚠️ La ficha de Colombia Autos no coincide con el vehículo que abriste en JCP. Por seguridad se bloqueó la publicación. Revisa la vinculación de IDs.');
   return;
 }
 const selectedId=String(selectedBefore);
 function chooseVehicle(id){window.__caSelectedVehicle=id;for(const c of picker.children)c.setAttribute('aria-pressed',String(c.dataset.vehiculoId)===String(id)?'true':'false');for(const el of root.children)el.classList.toggle('ca-selected',String(el.dataset.vehiculoId)===String(id));}
 for(const car of rows){const box=document.createElement('section');box.className='ca-item';box.dataset.vehiculoId=String(car.vehiculo_id);
  const title=[car.marca,car.referencia,car.modelo].filter(Boolean).join(' ');
  const pics=Array.isArray(car.fotos)?car.fotos.filter(Boolean):[];
  const choice=document.createElement('button');choice.type='button';choice.className='ca-choice';choice.dataset.vehiculoId=String(car.vehiculo_id);
  choice.setAttribute('aria-pressed',String(car.vehiculo_id)===selectedId?'true':'false');
  const cover=inventoryCover(car.vehiculo_id);
  const cimg=document.createElement('img');cimg.loading='lazy';cimg.alt='Foto del inventario de '+title;
  if(cover)cimg.src=cover;
  else {
    cimg.alt='Cargando foto del inventario';cimg.style.display='none';
    try{
      const inv=(typeof data!=='undefined'&&Array.isArray(data?.veh))?data.veh.find(v=>String(v.id)===String(car.vehiculo_id)):null;
      const ref=inv&&(inv.photo||inv.foto||inv.imagen||inv.image||(Array.isArray(inv.photos)?inv.photos[0]:''));
      if(typeof ref==='string'&&ref.startsWith('jcpimg:')&&typeof jcpImages!=='undefined'){
        jcpImages.load(ref).then(src=>{if(src){cimg.src=src;cimg.style.display='block'}}).catch(()=>{});
      }
    }catch{}
  }
  choice.append(cimg);
  const name=document.createElement('strong');name.textContent=title;
  const meta=document.createElement('small');meta.textContent=(car.publicado?'Publicado':'Oculto')+' · '+(car.categoria==='oportunidad'?'De oportunidad':'Disponible')+' · '+pics.length+' foto(s) públicas';
  choice.append(name,meta);choice.onclick=()=>{chooseVehicle(String(car.vehiculo_id));box.scrollIntoView({block:'nearest',behavior:'smooth'})};picker.append(choice);
  const estimate=inventoryEstimatedPrice(car.vehiculo_id);
  // No se cambia automáticamente el precio de anuncios ya publicados.
  const initialPrice=car.publicado?(Number(car.precio_venta)||estimate):(estimate||Number(car.precio_venta)||0);
  const canPublish=initialPrice>0&&pics.length>0;
  box.innerHTML=`<h3>${esc(title)}</h3><div class="ca-tag">${car.publicado?'🟢 PUBLICADO EN LA WEB':'⚪ OCULTO AL PÚBLICO'} · ${pics.length} foto(s)</div><label>Precio de venta público (COP)</label><div class="ca-muted">${estimate?'Precio estimado leído del inventario. Puedes ajustarlo.':(Number(car.precio_venta)>0?'Precio comercial guardado anteriormente; el estimado no está registrado en la ficha de inventario.':'No se encontró precio estimado en Inventario. Puedes ingresar un precio comercial.')}</div><input class="ca-price" inputmode="numeric" type="text" maxlength="19" value="${formatPrice(initialPrice)}" placeholder="Ej. 39.990.000"><label for="ca-cat-${esc(car.vehiculo_id)}">Categoría en la página web</label><select class="ca-category" id="ca-cat-${esc(car.vehiculo_id)}"><option value="disponible" ${car.categoria==='oportunidad'?'':'selected'}>Disponible para entrega</option><option value="oportunidad" ${car.categoria==='oportunidad'?'selected':''}>De oportunidad · En alistamiento</option></select><div class="ca-muted">Elige dónde aparecerá el carro. Puedes cambiarlo cuando quieras, sin volver a cargar las fotos.</div><div class="ca-photos"></div><div class="ca-draft-note">Las fotos nuevas son un borrador: solo se suben al confirmar «Publicar anuncio». Al cerrar, se descartan.</div><label>Seleccionar fotografías para la página pública</label><input class="ca-file" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="ca-muted">Fotos de iPhone (JPG, PNG, WebP o HEIC). Se adaptan automáticamente a JPG, máximo 30 por carga.</div><div class="ca-row"><button type="button" class="ca-save">Guardar precio</button><button type="button" class="ca-upload ca-light">Preparar fotografías</button><button type="button" class="ca-toggle ${car.publicado?'ca-hide':''}">${car.publicado?'Ocultar anuncio':'Publicar anuncio'}</button></div><div class="ca-result" role="status" aria-live="polite"></div>`;
  const price=box.querySelector('.ca-price'),category=box.querySelector('.ca-category'),file=box.querySelector('.ca-file'),result=box.querySelector('.ca-result');
  const msg=s=>result.textContent=s;const busy=b=>box.querySelectorAll('button').forEach(x=>x.disabled=b);
  price.addEventListener('input',()=>{const n=parsePrice(price.value);price.value=n?formatPrice(n):'';});
  const gallery=box.querySelector('.ca-photos');
  const refreshGallery=()=>{
   gallery.replaceChildren();
   for(const saved of pics){
     const item=document.createElement('div');item.className='ca-photo-item';
     const img=document.createElement('img');img.src=photoUrl(db,saved);img.loading='lazy';img.alt='Foto comercial guardada de '+title;
     const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Eliminar foto comercial guardada';del.setAttribute('aria-label','Eliminar foto comercial');
     del.onclick=async()=>{
       if(car.publicado&&pics.length===1){msg('No puedes eliminar la última fotografía de un anuncio visible. Oculta el anuncio primero.');return}
       const path=photoStoragePath(saved,db,user,car);
       if(!path){msg('No se puede eliminar esta foto antigua automáticamente. Revisa su ruta en el almacenamiento comercial.');return}
       if(!confirm('¿Eliminar esta fotografía definitivamente de Colombia Autos? No afecta al inventario.'))return;
       busy(true);
       try{
         const unlink=await db.rpc('colombia_autos_quitar_foto',{p_vehiculo_id:car.vehiculo_id,p_ruta:path});
         if(unlink.error)throw new Error('No se pudo desvincular: '+unlink.error.message);
         const removed=await db.storage.from(BUCKET).remove([path]);
         if(removed.error)throw new Error('Se desvinculó, pero no se pudo borrar el archivo: '+removed.error.message);
         pics.splice(pics.index(saved),1);refreshGallery();msg('✅ Foto comercial eliminada.');
       }catch(e){msg('No se pudo completar la eliminación: '+e.message)}finally{busy(false)}
     };
     item.append(img,del);gallery.append(item);
   }
   for(const draft of draftPhotos.get(String(car.vehiculo_id))||[]){
     const item=document.createElement('div');item.className='ca-photo-item ca-draft';
     const img=document.createElement('img');img.src=draft.url;img.alt='Borrador de '+title;
     const del=document.createElement('button');del.type='button';del.textContent='×';del.setAttribute('aria-label','Quitar foto del borrador');
     del.onclick=()=>{const key=String(car.vehiculo_id);const a=draftPhotos.get(key)||[];draftPhotos.set(key,a.filter(x=>x!==draft));URL.revokeObjectURL(draft.url);refreshGallery();box.querySelector('.ca-toggle').textContent=car.publicado?'Ocultar anuncio':'Publicar anuncio'};
     const note=document.createElement('small');note.textContent='SIN PUBLICAR';
     item.append(img,del,note);gallery.append(item);
   }
  };
  refreshGallery();
  box.querySelector('.ca-save').onclick=async()=>{const n=parsePrice(price.value);if(!Number.isSafeInteger(n)||n<=0||n>9999999999999){msg('Ingresa un precio válido en pesos colombianos.');return}busy(true);try{const r=await db.rpc('colombia_autos_guardar_precio',{p_vehiculo_id:car.vehiculo_id,p_precio:n});if(r.error)throw r.error;car.precio_venta=n;msg('✅ Precio comercial guardado: '+cash(n)+'. No modifica el costo financiero del vehículo.')}catch(ex){msg('No se pudo guardar: '+ex.message)}finally{busy(false)}};
  // Clasificación comercial. El permiso se verifica en Supabase usando la sesión del propietario.
  async function saveCategory(){
    const choice=category.value;
    if(choice!=='disponible'&&choice!=='oportunidad')throw Error('Categoría no válida');
    if(choice===(car.categoria||'disponible'))return;
    const result=await db.rpc('colombia_autos_clasificar',{
      p_vehiculo_id:String(car.vehiculo_id),p_categoria:choice
    });
    if(result.error)throw Error(result.error.message);
    car.categoria=choice;
    meta.textContent=(car.publicado?'Publicado':'Oculto')+' · '+(choice==='oportunidad'?'De oportunidad':'Disponible')+' · '+pics.length+' foto(s) públicas';
  }
  category.addEventListener('change',async()=>{
    // Guardar la categoría incluso si el vehículo aún no se ha publicado.
    busy(true);
    try{
      await saveCategory();
      msg('✅ Categoría guardada: '+(car.categoria==='oportunidad'?'De oportunidad (en alistamiento)':'Disponible')+'.');
    }catch(e){
      category.value=car.categoria||'disponible';
      msg('No se pudo clasificar: '+e.message);
    }finally{busy(false)}
  });
  box.querySelector('.ca-upload').onclick=async()=>{
    const chosen=Array.from(file.files||[]);if(!chosen.length){msg('Selecciona una o varias fotos.');return}
    const key=String(car.vehiculo_id);const previous=draftPhotos.get(key)||[];
    if(previous.length+chosen.length>30){msg('Máximo 30 fotos nuevas por publicación.');return}
    busy(true);let prepared=0;const failed=[];
    try{
      for(const f of chosen){
        msg(`Preparando fotografía ${prepared+failed.length+1} de ${chosen.length}…`);
        try{
          const converted=await prepareCommercialImage(f);
          previous.push({file:converted,url:URL.createObjectURL(converted)});
          prepared++;
        }catch(e){failed.push(`${f.name||'Sin nombre'}: ${e.message}`)}
      }
      draftPhotos.set(key,previous);file.value='';refreshGallery();
      if(car.publicado&&prepared)box.querySelector('.ca-toggle').textContent='Guardar fotos nuevas';
      if(failed.length){msg(`✅ ${prepared} foto(s) preparadas. ⚠️ No se pudieron preparar ${failed.length}: ${failed.slice(0,3).join(' | ')}${failed.length>3?' | ...':''}`)}
      else msg(`✅ ${previous.length} foto(s) preparadas en el orden seleccionado. Se convertirán a JPG y se guardarán al confirmar la publicación; cerrar las descarta.`);
    }finally{busy(false)}
  };
  box.querySelector('.ca-toggle').onclick=async()=>{
    const chosenPrice=parsePrice(price.value);const drafts=draftPhotos.get(String(car.vehiculo_id))||[];
    if(!car.publicado){
      if(!Number.isSafeInteger(chosenPrice)||chosenPrice<=0){msg('Debes indicar un precio comercial válido.');return}
      if(!pics.length&&!drafts.length){msg('Selecciona y prepara al menos una foto.');return}
      if(!confirm('¿Publicar este vehículo en la página web con '+(pics.length+drafts.length)+' fotografía(s)?'))return;
    }else if(drafts.length){
      if(!confirm('¿Guardar las fotos nuevas en el anuncio publicado?'))return;
    }else if(!confirm('¿Ocultar este anuncio? Las fotografías guardadas se conservarán.'))return;
    busy(true);publishingPhotos=true;let uploaded=0;const newPaths=[];
    try{
      await saveCategory();
      if(chosenPrice>0&&chosenPrice!==Number(car.precio_venta)){
        const saved=await db.rpc('colombia_autos_guardar_precio',{p_vehiculo_id:car.vehiculo_id,p_precio:chosenPrice});
        if(saved.error)throw new Error('No se pudo guardar el precio: '+saved.error.message);
        car.precio_venta=chosenPrice;
      }
      for(const draft of drafts){
        const f=draft.file,ext=f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg';
        const unique=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(16)}-${Math.floor(Math.random()*0xFFFFFFFF).toString(16)}`;
        const path=`${user.id}/${car.id}/${unique}.${ext}`;
        msg(`Guardando fotografía ${uploaded+1} de ${drafts.length}…`);
        const up=await db.storage.from(BUCKET).upload(path,f,{cacheControl:'3600',upsert:false,contentType:f.type});
        if(up.error)throw new Error('Almacenamiento: '+up.error.message);
        const linked=await db.rpc('colombia_autos_agregar_foto',{p_vehiculo_id:car.vehiculo_id,p_ruta:path});
        if(linked.error){
          // Evita dejar el archivo recién subido sin vincular si tenemos permiso de borrado.
          await db.storage.from(BUCKET).remove([path]);
          throw new Error('Vinculación de fotografía: '+linked.error.message);
        }
        uploaded++;newPaths.push(path);
      }
      if(!car.publicado){
        const published=await db.rpc('colombia_autos_publicar',{p_vehiculo_id:car.vehiculo_id,p_publicar:true});
        if(published.error)throw new Error('Las fotos se guardaron, pero el anuncio NO se publicó: '+published.error.message);
      }else if(!drafts.length){
        const hidden=await db.rpc('colombia_autos_publicar',{p_vehiculo_id:car.vehiculo_id,p_publicar:false});
        if(hidden.error)throw hidden.error;
      }
      msg('✅ Cambios guardados.');await load();
    }catch(e){
      // Si no se confirmó la publicación, deshacer las fotos subidas en este intento.
      // En anuncios ya publicados, preservar las fotos nuevas y avisar si hubo fallo parcial.
      let cleanupFailed=false;
      if(!car.publicado){
        for(const path of newPaths.reverse()){
          const un=await db.rpc('colombia_autos_quitar_foto',{p_vehiculo_id:car.vehiculo_id,p_ruta:path});
          const rm=await db.storage.from(BUCKET).remove([path]);
          if(un.error||rm.error)cleanupFailed=true;
        }
      }
      msg('Error: '+e.message+(cleanupFailed?' Algunas fotos quedaron guardadas por un problema al descartarlas; verifica antes de intentar de nuevo.':' Las nuevas fotos del borrador no se publicaron.'));
    }finally{publishingPhotos=false;busy(false)}
  };
  root.append(box);
 }
 chooseVehicle(selectedId);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

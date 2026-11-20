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
let selectingFromInventory=false;
const css=`
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
#ca-panel .ca-photos img{width:100%;height:105px;object-fit:cover;border-radius:7px;border:1px solid #594b2e;background:#111}
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
 // Cierra y limpia únicamente selecciones temporales de fotos; NO elimina fotos guardadas.
 const close=()=>{
   overlay.classList.remove('ca-open');panel.classList.remove('ca-open');
   panel.querySelectorAll('input.ca-file').forEach(input=>{input.value=''});
   panel.querySelectorAll('.ca-result').forEach(el=>{el.textContent=''});
   selectingFromInventory=false;
 };
 overlay.addEventListener('click',close);panel.querySelector('#ca-close').addEventListener('click',close);
 // Dos accesos permanentes dentro de INICIO, usando las tarjetas nativas de JCP.
 const home=document.querySelector('#dashboard .quick');
 if(home){
   const web=document.createElement('button');
   web.type='button';web.className='card jcp-icon-card ca-home-card';
   web.innerHTML='<span class="ca-home-emoji" aria-hidden="true">🌐</span><b>Página web</b>';
   web.setAttribute('aria-label','Abrir página web de Colombia Autos');
   web.addEventListener('click',()=>{window.open(SITE,'_blank','noopener,noreferrer')});
   const publish=document.createElement('button');
   publish.type='button';publish.className='card jcp-icon-card ca-home-card';
   publish.innerHTML='<span class="ca-home-emoji" aria-hidden="true">🚗</span><b>Publicar</b>';
   publish.setAttribute('aria-label','Elegir vehículo del inventario para publicar');
   home.append(web,publish);
   window.__caPublishFromHome=()=>publish.click();
 }
 // Abrir el INVENTARIO REAL, no una segunda lista comercial.
 const inventory=document.getElementById('vehiculos');
 if(inventory){
   const hint=document.createElement('div');hint.id='ca-inventory-hint';
   hint.innerHTML='<span>🚗 COLOMBIA AUTOS · Toca la foto del carro que quieres publicar.</span><button type="button">Cancelar</button>';
   inventory.insertBefore(hint,inventory.firstChild);
   hint.querySelector('button').onclick=()=>{selectingFromInventory=false;hint.style.display='none'};
 }
 const openPublish=()=>{
   close();
   selectingFromInventory=true;
   if(typeof openVehiclesHub==='function')openVehiclesHub();
   else if(typeof show==='function')show('vehiculos');
   else {selectingFromInventory=false;overlay.classList.add('ca-open');panel.classList.add('ca-open');load();return}
   const hint=document.getElementById('ca-inventory-hint');if(hint)hint.style.display='flex';
 };
 const publishCard=document.querySelector('#dashboard .ca-home-card:last-child');
 if(publishCard)publishCard.addEventListener('click',openPublish);
 // Mantiene intacto el comportamiento normal de las fichas fuera del modo comercial.
 const originalSelect=window.selectInventoryVehicle;
 if(typeof originalSelect==='function'){
   window.selectInventoryVehicle=function(id){
     if(!selectingFromInventory)return originalSelect.apply(this,arguments);
     selectingFromInventory=false;
     const hint=document.getElementById('ca-inventory-hint');if(hint)hint.style.display='none';
     window.__caSelectedVehicle=String(id);
     overlay.classList.add('ca-open');panel.classList.add('ca-open');
     load();
   }
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
 const {data:rows,error}=await db.from('colombia_autos_publicaciones').select('id,vehiculo_id,marca,referencia,modelo,precio_venta,publicado,vendido,fotos').eq('owner_id',user.id).eq('vendido',false).order('marca');
 if(error){setStatus('Error al consultar tus vehículos: '+error.message);return}
 const root=document.getElementById('ca-cars');root.replaceChildren();
 const picker=document.getElementById('ca-picker');picker.replaceChildren();
 if(!rows?.length){setStatus('No hay publicaciones comerciales vinculadas a esta cuenta. No se han modificado datos.');return}
 setStatus(`Administrando el vehículo elegido desde Inventario. ${rows.length} vehículos disponibles; solo serán públicos los que autorices.`);
 const selectedBefore=window.__caSelectedVehicle;
 const selectedId=rows.some(c=>String(c.vehiculo_id)===String(selectedBefore))?String(selectedBefore):String(rows[0].vehiculo_id);
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
  const meta=document.createElement('small');meta.textContent=(car.publicado?'Publicado':'Oculto')+' · '+pics.length+' foto(s) públicas';
  choice.append(name,meta);choice.onclick=()=>{chooseVehicle(String(car.vehiculo_id));box.scrollIntoView({block:'nearest',behavior:'smooth'})};picker.append(choice);
  const estimate=inventoryEstimatedPrice(car.vehiculo_id);
  // No se cambia automáticamente el precio de anuncios ya publicados.
  const initialPrice=car.publicado?(Number(car.precio_venta)||estimate):estimate;
  const canPublish=initialPrice>0&&pics.length>0;
  box.innerHTML=`<h3>${esc(title)}</h3><div class="ca-tag">${car.publicado?'🟢 PUBLICADO EN LA WEB':'⚪ OCULTO AL PÚBLICO'} · ${pics.length} foto(s)</div><label>Precio de venta público (COP)</label><div class="ca-muted">${estimate?'Precio estimado leído del inventario de este vehículo. Puedes ajustarlo.':'No se encontró precio estimado en la ficha de este vehículo; compruébalo en Inventario.'}</div><input class="ca-price" inputmode="numeric" type="text" maxlength="19" value="${formatPrice(initialPrice)}" placeholder="Ej. 39.990.000"><div class="ca-photos"></div><label>Seleccionar fotografías para la página pública</label><input class="ca-file" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="ca-muted">Solo imágenes comerciales seleccionadas por ti. JPG, PNG o WebP; hasta 30 por carga y máximo 8 MB por foto.</div><div class="ca-row"><button type="button" class="ca-save">Guardar precio</button><button type="button" class="ca-upload ca-light">Subir fotografías</button><button type="button" class="ca-toggle ${car.publicado?'ca-hide':''}">${car.publicado?'Ocultar anuncio':'Publicar anuncio'}</button></div><div class="ca-result" role="status" aria-live="polite"></div>`;
  const price=box.querySelector('.ca-price'),file=box.querySelector('.ca-file'),result=box.querySelector('.ca-result');
  const msg=s=>result.textContent=s;const busy=b=>box.querySelectorAll('button').forEach(x=>x.disabled=b);
  price.addEventListener('input',()=>{const n=parsePrice(price.value);price.value=n?formatPrice(n):'';});
  const gallery=box.querySelector('.ca-photos');for(const urlOrPath of pics){const img=document.createElement('img');img.src=photoUrl(db,urlOrPath);img.loading='lazy';img.alt='Fotografía comercial de '+title;gallery.append(img)}
  box.querySelector('.ca-save').onclick=async()=>{const n=parsePrice(price.value);if(!Number.isSafeInteger(n)||n<=0||n>9999999999999){msg('Ingresa un precio válido en pesos colombianos.');return}busy(true);try{const r=await db.rpc('colombia_autos_guardar_precio',{p_vehiculo_id:car.vehiculo_id,p_precio:n});if(r.error)throw r.error;car.precio_venta=n;msg('✅ Precio comercial guardado: '+cash(n)+'. No modifica el costo financiero del vehículo.')}catch(ex){msg('No se pudo guardar: '+ex.message)}finally{busy(false)}};
  box.querySelector('.ca-upload').onclick=async()=>{const chosen=Array.from(file.files||[]);if(!chosen.length){msg('Selecciona una o varias fotos.');return}if(chosen.length>30){msg('Selecciona máximo 30 fotos por carga.');return}
   if(chosen.some(f=>f.size>8*1024*1024||f.size===0||!['image/jpeg','image/png','image/webp'].includes(f.type))){msg('Solo JPG, PNG o WebP, hasta 8 MB por foto.');return}
   if(!car.id){msg('Falta el identificador de la publicación.');return}
   busy(true);let complete=0;
   try{for(const f of chosen){const ext=f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg';const unique=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(16)}-${Math.floor(Math.random()*0xFFFFFFFF).toString(16)}`;const path=`${user.id}/${car.id}/${unique}.${ext}`;
     msg(`Subiendo fotografía ${complete+1} de ${chosen.length}…`);
     const up=await db.storage.from(BUCKET).upload(path,f,{cacheControl:'3600',upsert:false,contentType:f.type});if(up.error)throw new Error('Error de almacenamiento: '+up.error.message+(up.error.statusCode?' (HTTP '+up.error.statusCode+')':''));
     const linked=await db.rpc('colombia_autos_agregar_foto',{p_vehiculo_id:car.vehiculo_id,p_ruta:path});
     if(linked.error)throw new Error('La foto se cargó, pero no se vinculó: '+linked.error.message);
     complete++;
   }
   msg(`✅ ${complete} fotografía(s) guardadas. Actualizando…`);await load();
   }catch(ex){msg(`Se completaron ${complete} de ${chosen.length}. ${ex.message}. Comprueba que ejecutaste la configuración de fotos seguras en Supabase.`)}finally{busy(false)}
  };
  box.querySelector('.ca-toggle').onclick=async()=>{const chosenPrice=parsePrice(price.value);if(!car.publicado){if(!Number.isSafeInteger(chosenPrice)||chosenPrice<=0){msg('Este carro no tiene un precio estimado de venta válido en Inventario.');return}if(!pics.length){msg('Primero sube al menos una fotografía comercial.');return}if(!confirm('¿Publicar este vehículo y sus fotos en la página pública de Colombia Autos?'))return}
   busy(true);try{
    // Sincroniza el precio estimado al publicar, sin pedir ingresarlo dos veces.
    if(!car.publicado&&chosenPrice!==Number(car.precio_venta)){
      const saved=await db.rpc('colombia_autos_guardar_precio',{p_vehiculo_id:car.vehiculo_id,p_precio:chosenPrice});
      if(saved.error)throw new Error('No se pudo sincronizar el precio: '+saved.error.message);
      car.precio_venta=chosenPrice;
    }
    const r=await db.rpc('colombia_autos_publicar',{p_vehiculo_id:car.vehiculo_id,p_publicar:!car.publicado});if(r.error)throw r.error;await load()
   }catch(ex){msg('No se pudo actualizar el anuncio: '+ex.message)}finally{busy(false)}
  };
  root.append(box);
 }
 chooseVehicle(selectedId);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

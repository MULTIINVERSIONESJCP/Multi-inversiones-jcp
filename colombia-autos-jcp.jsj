/* Colombia Autos · módulo comercial JCP v2 · 2026-11-19
 * Reemplaza el archivo homónimo en la raíz del repositorio.
 * Requiere ejecutar una única vez colombia-autos-fotos-seguras.sql.
 * No lee ni modifica app_data, compras, ventas, gastos ni finanzas.
 */
(()=>{'use strict';
const SITE='https://colombia-autos-jeissoncamilomar-1669s-projects.vercel.app/';
const BUCKET='colombia-autos-publico';
const dbClient=()=>{try{return typeof supabaseClient!=='undefined'?supabaseClient:(window.supabaseClient||null)}catch{return null}};
const str=x=>String(x??'');
const esc=x=>str(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const cash=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
const css=`
#ca-overlay{position:fixed;inset:0;background:#000b;z-index:2147483644;display:none}
#ca-overlay.ca-open{display:block}
#ca-panel{position:fixed;z-index:2147483645;right:0;top:0;bottom:0;width:min(550px,100vw);background:#0e0e0e;color:#f5f5f5;box-shadow:-12px 0 45px #0008;transform:translateX(103%);transition:transform .2s;overflow:auto;font:14px system-ui,-apple-system,Arial,sans-serif;overscroll-behavior:contain}
#ca-panel.ca-open{transform:translateX(0)}
#ca-panel *,#ca-fab{box-sizing:border-box}
#ca-panel header{position:sticky;top:0;z-index:2;background:#171717;color:#fff;padding:19px 18px;border-bottom:1px solid #53411e;display:flex;justify-content:space-between;gap:10px;align-items:center}
#ca-panel .ca-body{padding:15px 15px 100px}
#ca-panel h2{font-size:20px;margin:0;letter-spacing:.5px;color:#fff}
#ca-panel h3{font-size:17px;line-height:1.25;color:#fff!important;margin:0 0 7px;font-weight:800}
#ca-panel p{line-height:1.5;color:#bbb}
#ca-panel .ca-item{padding:15px;background:#191919;border:1px solid #3b3427;border-radius:13px;margin:12px 0;box-shadow:0 2px 13px #0003}
#ca-panel .ca-tag{font-size:12px;color:#bcbcbc;line-height:1.4}
#ca-panel .ca-status{padding:11px 12px;border-radius:9px;border:1px solid #493d28;background:#241f16;color:#ead1a0;margin:14px 0;line-height:1.45}
#ca-panel label{color:#f4f4f4;font-size:13px;font-weight:700;display:block;margin:13px 0 6px}
#ca-panel input[type=number],#ca-panel input[type=file]{display:block;width:100%;border:1px solid #62512a;background:#090909;color:#fff;padding:11px;border-radius:9px;font:inherit;min-width:0}
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
#ca-panel .ca-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:9px 0}
#ca-panel .ca-photos img{width:100%;height:105px;object-fit:cover;border-radius:7px;border:1px solid #594b2e;background:#111}
#ca-panel .ca-muted{color:#a6a6a6;font-size:12px}
#ca-panel .ca-caption{color:#c8a76b;font-size:12px;font-weight:800;letter-spacing:.6px}
#ca-fab{position:fixed;right:14px;bottom:88px;z-index:2147483643;padding:13px 17px;border-radius:999px;border:1px solid #b69454;background:#1d1d1d;color:#f2d08c;font:700 13px system-ui;box-shadow:0 5px 17px #0007;cursor:pointer}
@media(max-width:600px){#ca-panel{width:100vw}#ca-panel .ca-body{padding:13px 13px 105px}#ca-panel .ca-photos img{height:90px}}
`;
function mount(){if(document.getElementById('ca-panel'))return;
 const style=document.createElement('style');style.textContent=css;document.head.append(style);
 const overlay=document.createElement('div');overlay.id='ca-overlay';
 const panel=document.createElement('aside');panel.id='ca-panel';panel.setAttribute('aria-label','Panel comercial Colombia Autos');
 panel.innerHTML=`<header><div><h2>COLOMBIA AUTOS</h2><div class="ca-caption">ADMINISTRACIÓN COMERCIAL DE JCP</div></div><button type="button" id="ca-close" class="ca-light">Cerrar</button></header><div class="ca-body"><p>Elige el precio y las fotografías comerciales que deseas mostrar. Las finanzas de JCP no se publican.</p><p><a href="${SITE}" target="_blank" rel="noopener noreferrer">Abrir página pública de Colombia Autos</a></p><div id="ca-status" class="ca-msg" role="status">Abre el panel para consultar tu inventario.</div><div id="ca-cars"></div></div>`;
 const fab=document.createElement('button');fab.id='ca-fab';fab.type='button';fab.textContent='🚗 Colombia Autos';
 document.body.append(overlay,panel,fab);
 const close=()=>{overlay.classList.remove('ca-open');panel.classList.remove('ca-open')};
 overlay.addEventListener('click',close);panel.querySelector('#ca-close').addEventListener('click',close);
 fab.addEventListener('click',async()=>{overlay.classList.add('ca-open');panel.classList.add('ca-open');await load()});
}
function setStatus(s){const el=document.getElementById('ca-status');if(el)el.textContent=s}
function photoUrl(db,pathOrUrl){if(/^https:\/\//i.test(str(pathOrUrl)))return str(pathOrUrl);return db.storage.from(BUCKET).getPublicUrl(str(pathOrUrl)).data.publicUrl}
async function load(){const db=dbClient();if(!db){setStatus('No se encontró la conexión a Supabase. Inicia sesión en JCP.');return}
 let user;try{const r=await db.auth.getUser();if(r.error)throw r.error;user=r.data?.user}catch(err){setStatus('No se pudo verificar tu sesión: '+str(err.message));return}
 if(!user){setStatus('Inicia sesión en MULTI INVERSIONES JCP para administrar las publicaciones.');return}
 setStatus('Consultando únicamente tus publicaciones comerciales…');
 const {data:rows,error}=await db.from('colombia_autos_publicaciones').select('id,vehiculo_id,marca,referencia,modelo,precio_venta,publicado,vendido,fotos').eq('owner_id',user.id).eq('vendido',false).order('marca');
 if(error){setStatus('Error al consultar tus vehículos: '+error.message);return}
 const root=document.getElementById('ca-cars');root.replaceChildren();
 if(!rows?.length){setStatus('No hay publicaciones comerciales vinculadas a esta cuenta. No se han modificado datos.');return}
 setStatus(`${rows.length} vehículos disponibles. Solo serán visibles en la web cuando tú los publiques.`);
 for(const car of rows){const box=document.createElement('section');box.className='ca-item';
  const title=[car.marca,car.referencia,car.modelo].filter(Boolean).join(' ');
  const pics=Array.isArray(car.fotos)?car.fotos.filter(Boolean):[];
  const canPublish=Number(car.precio_venta)>0&&pics.length>0;
  box.innerHTML=`<h3>${esc(title)}</h3><div class="ca-tag">${car.publicado?'🟢 PUBLICADO EN LA WEB':'⚪ OCULTO AL PÚBLICO'} · ${pics.length} foto(s)</div><label>Precio de venta público (COP)</label><input class="ca-price" inputmode="numeric" type="number" min="1" max="9999999999999" step="1" value="${Number(car.precio_venta)||''}" placeholder="Ej. 39990000"><div class="ca-photos"></div><label>Seleccionar fotografías para la página pública</label><input class="ca-file" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="ca-muted">Solo imágenes comerciales seleccionadas por ti. JPG, PNG o WebP; máximo 8 MB por foto.</div><div class="ca-row"><button type="button" class="ca-save">Guardar precio</button><button type="button" class="ca-upload ca-light">Subir fotografías</button><button type="button" class="ca-toggle ${car.publicado?'ca-hide':''}">${car.publicado?'Ocultar anuncio':'Publicar anuncio'}</button></div><div class="ca-result" role="status" aria-live="polite"></div>`;
  const price=box.querySelector('.ca-price'),file=box.querySelector('.ca-file'),result=box.querySelector('.ca-result');
  const msg=s=>result.textContent=s;const busy=b=>box.querySelectorAll('button').forEach(x=>x.disabled=b);
  const gallery=box.querySelector('.ca-photos');for(const urlOrPath of pics){const img=document.createElement('img');img.src=photoUrl(db,urlOrPath);img.loading='lazy';img.alt='Fotografía comercial de '+title;gallery.append(img)}
  box.querySelector('.ca-save').onclick=async()=>{const n=Number(price.value);if(!Number.isSafeInteger(n)||n<=0||n>9999999999999){msg('Ingresa un precio válido en pesos colombianos.');return}busy(true);try{const r=await db.rpc('colombia_autos_guardar_precio',{p_vehiculo_id:car.vehiculo_id,p_precio:n});if(r.error)throw r.error;car.precio_venta=n;msg('✅ Precio comercial guardado: '+cash(n)+'. No modifica el costo financiero del vehículo.')}catch(ex){msg('No se pudo guardar: '+ex.message)}finally{busy(false)}};
  box.querySelector('.ca-upload').onclick=async()=>{const chosen=Array.from(file.files||[]);if(!chosen.length){msg('Selecciona una o varias fotos.');return}if(chosen.length>12){msg('Selecciona máximo 12 fotos por carga.');return}
   if(chosen.some(f=>f.size>8*1024*1024||f.size===0||!['image/jpeg','image/png','image/webp'].includes(f.type))){msg('Solo JPG, PNG o WebP, hasta 8 MB por foto.');return}
   if(!car.id){msg('Falta el identificador de la publicación.');return}
   busy(true);let complete=0;
   try{for(const f of chosen){const ext=f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg';const unique=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;const path=`${user.id}/${car.id}/${unique}.${ext}`;
     msg(`Subiendo fotografía ${complete+1} de ${chosen.length}…`);
     const up=await db.storage.from(BUCKET).upload(path,f,{cacheControl:'3600',upsert:false,contentType:f.type});if(up.error)throw new Error('Error de almacenamiento: '+up.error.message);
     const linked=await db.rpc('colombia_autos_agregar_foto',{p_vehiculo_id:car.vehiculo_id,p_ruta:path});
     if(linked.error)throw new Error('La foto se cargó, pero no se vinculó: '+linked.error.message);
     complete++;
   }
   msg(`✅ ${complete} fotografía(s) guardadas. Actualizando…`);await load();
   }catch(ex){msg(`Se completaron ${complete} de ${chosen.length}. ${ex.message}. Comprueba que ejecutaste la configuración de fotos seguras en Supabase.`)}finally{busy(false)}
  };
  box.querySelector('.ca-toggle').onclick=async()=>{if(!car.publicado){if(!Number(car.precio_venta)){msg('Primero guarda un precio de venta público.');return}if(!pics.length){msg('Primero sube al menos una fotografía comercial.');return}if(!confirm('¿Publicar este vehículo y sus fotos en la página pública de Colombia Autos?'))return}
   busy(true);try{const r=await db.rpc('colombia_autos_publicar',{p_vehiculo_id:car.vehiculo_id,p_publicar:!car.publicado});if(r.error)throw r.error;await load()}catch(ex){msg('No se pudo actualizar el anuncio: '+ex.message)}finally{busy(false)}
  };
  root.append(box);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

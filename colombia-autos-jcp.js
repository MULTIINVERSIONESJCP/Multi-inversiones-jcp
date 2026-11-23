
/* Colombia Autos - Modulo comercial completo JCP
   Inventario, publicaciones, fotos y vinculacion.
   Reemplaza TODO colombia-autos-jcp.js
*/
(() => {
"use strict";

const SITE =
 "https://colombia-autos-jeissoncamilomar-1669s-projects.vercel.app/";
const BUCKET = "colombia-autos-publico";

const dbClient = () => {
 try {
  return typeof supabaseClient !== "undefined"
   ? supabaseClient
   : window.supabaseClient || null;
 } catch {
  return null;
 }
};

const str = x => String(x ?? "");
const esc = x => str(x).replace(
 /[&<>"']/g,
 c => ({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  '"':"&quot;",
  "'":"&#39;"
 })[c]
);

const formatPrice = n =>
 n ? new Intl.NumberFormat("es-CO", {
  maximumFractionDigits:0
 }).format(Number(n)) : "";

const cash = n =>
 new Intl.NumberFormat("es-CO", {
  style:"currency",
  currency:"COP",
  maximumFractionDigits:0
 }).format(Number(n) || 0);

const parsePrice = v =>
 Number(String(v ?? "").replace(/[^0-9]/g, ""));

const drafts = new Map();
let saving = false;

function vehicleList() {
 try {
  return typeof data !== "undefined" &&
   Array.isArray(data.veh) ? data.veh : [];
 } catch {
  return [];
 }
}

function getVehicle(id) {
 return vehicleList().find(
  v => String(v.id) === String(id)
 ) || null;
}

function vehicleName(v) {
 return [
  v.marca || v.m || "",
  v.ref || v.referencia || "",
  v.modelo || ""
 ].filter(Boolean).join(" ");
}

function publicPhoto(db, path) {
 if (/^https:\/\//i.test(str(path))) {
  return str(path);
 }
 return db.storage.from(BUCKET)
  .getPublicUrl(str(path)).data.publicUrl;
}

function storedPhotoPath(photo, db, user, car) {
 const url = publicPhoto(db, photo);
 const marker =
  "/storage/v1/object/public/" + BUCKET + "/";
 const index = url.indexOf(marker);
 if (index < 0) return null;

 let path;
 try {
  path = decodeURIComponent(
   url.slice(index + marker.length).split("?")[0]
  );
 } catch {
  return null;
 }

 if (!path.startsWith(user.id + "/" + car.id + "/")) {
  return null;
 }

 if (path.split("/").length !== 3) {
  return null;
 }

 return path;
}

function clearDrafts() {
 for (const list of drafts.values()) {
  for (const item of list) {
   URL.revokeObjectURL(item.url);
  }
 }
 drafts.clear();
}

async function preparePhoto(original) {
 if (!original || !original.size) {
  throw Error("Archivo vacío.");
 }

 const name = String(original.name || "foto");
 const type = String(original.type || "").toLowerCase();

 if (
  !/^image\/(jpeg|png|webp|heic|heif)$/.test(type) &&
  !/\.(jpe?g|png|webp|heic|heif)$/i.test(name)
 ) {
  throw Error("Formato no compatible.");
 }

 const url = URL.createObjectURL(original);

 try {
  const image = await new Promise(
   (resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(
     Error("No se pudo abrir la imagen.")
    );
    img.src = url;
   }
  );

  const ratio = Math.min(
   1,
   2200 / Math.max(
    image.naturalWidth,
    image.naturalHeight
   )
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(
   1, Math.round(image.naturalWidth * ratio)
  );
  canvas.height = Math.max(
   1, Math.round(image.naturalHeight * ratio)
  );

  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Error preparando foto.");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
   image, 0, 0, canvas.width, canvas.height
  );

  const blob = await new Promise(resolve =>
   canvas.toBlob(resolve, "image/jpeg", 0.83)
  );

  canvas.width = 0;
  canvas.height = 0;

  if (!blob || !blob.size ||
      blob.size > 8 * 1024 * 1024) {
   throw Error("No se pudo reducir la fotografía.");
  }

  const safeName = name
   .replace(/\.[^.]+$/, "")
   .replace(/[^a-z0-9_-]/gi, "_")
   .slice(0, 60) || "foto";

  return new File(
   [blob],
   safeName + ".jpg",
   {
    type:"image/jpeg",
    lastModified:Date.now()
   }
  );
 } finally {
  URL.revokeObjectURL(url);
 }
}

function inventoryPhoto(vehicleId) {
 try {
  const v = getVehicle(vehicleId);
  if (!v) return "";

  let photo =
   v.photo ||
   v.foto ||
   v.imagen ||
   v.image ||
   (Array.isArray(v.photos) ? v.photos[0] : "") ||
   "";

  if (
   typeof photo === "string" &&
   photo.startsWith("jcpimg:")
  ) {
   photo =
    typeof jcpImages !== "undefined" &&
    jcpImages?.peek
     ? jcpImages.peek(photo)
     : "";
  }

  return (
   typeof photo === "string" &&
   /^(data:image\/|blob:|https:\/\/)/i.test(photo)
  ) ? photo : "";
 } catch {
  return "";
 }
}

function estimatedPrice(id) {
 try {
  const v = getVehicle(id);
  if (!v) return 0;

  const valid = value => {
   if (value == null || value === "") return 0;
   const n = typeof value === "number"
    ? value
    : parsePrice(value);

   return Number.isSafeInteger(n) &&
    n > 0 && n <= 9999999999999 ? n : 0;
  };

  if (
   typeof getVehicleCommercialSnapshot ===
   "function"
  ) {
   const n = valid(
    getVehicleCommercialSnapshot(v)
     ?.precioEstimadoVenta
   );
   if (n) return n;
  }

  const aliases = new Set([
   "precioestimadoventa",
   "precioventaestimado",
   "valorestimadoventa",
   "precioestimado",
   "valorventaestimado"
  ]);

  const normalize = key =>
   String(key)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  const visited = new Set();
  let found = 0;

  function walk(obj, depth) {
   if (
    found || depth > 7 || !obj ||
    typeof obj !== "object" ||
    visited.has(obj)
   ) return;

   visited.add(obj);

   for (const [key, value] of Object.entries(obj)) {
    if (aliases.has(normalize(key))) {
     const n = valid(value);
     if (n) {
      found = n;
      return;
     }
    }
   }

   for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
     walk(value, depth + 1);
    }
    if (found) return;
   }
  }

  walk(v, 0);
  return found;
 } catch {
  return 0;
 }
}

const css = `
#ca-overlay{
 position:fixed;inset:0;
 background:#000b;z-index:2147483644;
 display:none
}
#ca-overlay.ca-open{display:block}
#ca-panel{
 position:fixed;z-index:2147483645;
 right:0;top:0;bottom:0;
 width:min(550px,100vw);
 background:#0e0e0e;color:#f5f5f5;
 box-shadow:-12px 0 45px #0008;
 transform:translateX(103%);
 transition:transform .2s;
 overflow:auto;
 font:14px system-ui,-apple-system,Arial,sans-serif
}
#ca-panel.ca-open{transform:translateX(0)}
#ca-panel *{box-sizing:border-box}
#ca-panel header{
 position:sticky;top:0;z-index:2;
 background:#171717;
 padding:19px 18px;
 border-bottom:1px solid #53411e;
 display:flex;justify-content:space-between;
 align-items:center;gap:10px
}
#ca-panel .ca-body{padding:15px 15px 100px}
#ca-panel h2{font-size:20px;margin:0;color:#fff}
#ca-panel h3{
 font-size:17px;color:#fff;
 margin:0 0 8px
}
#ca-panel p{color:#bbb;line-height:1.5}
#ca-panel a{color:#e5ba6c}
#ca-panel .ca-caption{
 color:#c8a76b;font-size:12px;
 font-weight:800;letter-spacing:.6px
}
#ca-panel .ca-status{
 padding:12px;border-radius:9px;
 background:#241f16;color:#ead1a0;
 margin:14px 0;line-height:1.5
}
#ca-panel button{
 background:#c5a15d;color:#141414;
 border:0;border-radius:8px;
 padding:11px 13px;
 font:700 13px system-ui;cursor:pointer
}
#ca-panel button:disabled{
 opacity:.47;cursor:not-allowed
}
#ca-panel .ca-light{
 background:#252525;color:#fff;
 border:1px solid #6d552d
}
#ca-panel .ca-hide{
 background:#462e2e;color:#fff
}
#ca-panel .ca-item{
 display:none;padding:15px;
 background:#191919;
 border:1px solid #3b3427;
 border-radius:13px;margin:12px 0
}
#ca-panel .ca-item.ca-selected{display:block}
#ca-panel label{
 display:block;color:#fff;
 font-size:13px;font-weight:700;
 margin:13px 0 6px
}
#ca-panel input.ca-price,
#ca-panel input[type=file],
#ca-panel select.ca-category{
 display:block;width:100%;
 border:1px solid #62512a;
 background:#090909;color:#fff;
 padding:11px;border-radius:9px;
 font:inherit;min-width:0
}
#ca-panel .ca-row{
 display:flex;flex-wrap:wrap;
 gap:8px;margin-top:12px
}
#ca-panel .ca-row button{flex:1 1 125px}
#ca-panel .ca-muted{
 color:#aaa;font-size:12px;
 line-height:1.5;margin-top:6px
}
#ca-panel .ca-tag{
 font-size:12px;color:#bcbcbc
}
#ca-panel .ca-result{
 margin:12px 0;color:#d5c4a9;
 white-space:pre-wrap;line-height:1.5
}
#ca-panel .ca-photos{
 display:grid;
 grid-template-columns:repeat(3,minmax(0,1fr));
 gap:7px;margin:12px 0
}
#ca-panel .ca-photo-item{
 position:relative;min-width:0
}
#ca-panel .ca-photo-item img{
 width:100%;height:105px;
 object-fit:cover;border-radius:7px;
 border:1px solid #594b2e
}
#ca-panel .ca-photo-item button{
 position:absolute;top:5px;right:5px;
 width:29px;height:29px;
 padding:0;border-radius:50%;
 background:#8c2020;color:#fff;
 border:1px solid #eee;font-size:17px
}
#ca-panel .ca-photo-item small{
 display:block;color:#dac188;
 font-size:10px
}
#ca-panel .ca-picker{display:none}
#ca-panel .ca-link-vehicle{
 width:100%;display:block;
 margin:16px 0;background:#c5a063;
 color:#131313;border:1px solid #e5ba6c;
 border-radius:10px;padding:14px 12px;
 font-size:15px;font-weight:750
}
#ca-inventory-hint{display:none}
#ca-panel .ca-msg{
 background:#282318;color:#f0d29d;
 padding:12px;border-radius:9px;
 margin:12px 0
}
#dashboard .ca-home-card{
 font:inherit;color:inherit;
 min-height:110px;display:flex;
 flex-direction:column;align-items:center;
 justify-content:center;gap:8px;
 width:100%;text-align:center
}
#jcpHomeV2 .jcp-h2-q .ca-home-action{
 grid-column:span 3;justify-content:center;
 gap:12px;min-height:62px;white-space:nowrap
}
#jcpHomeV2 .ca-home-symbol{font-size:23px}
@media(max-width:600px){
 #ca-panel{width:100vw}
 #ca-panel .ca-body{padding:13px 13px 105px}
 #ca-panel .ca-photo-item img{height:90px}
}
`;

function setStatus(message) {
 const el = document.getElementById("ca-status");
 if (el) el.textContent = message;
}

function mount() {
 if (document.getElementById("ca-panel")) return;

 const style = document.createElement("style");
 style.textContent = css;
 document.head.appendChild(style);

 const overlay = document.createElement("div");
 overlay.id = "ca-overlay";

 const panel = document.createElement("aside");
 panel.id = "ca-panel";
 panel.setAttribute(
  "aria-label", "Panel comercial Colombia Autos"
 );

 panel.innerHTML = `
 <header>
  <div>
   <h2>COLOMBIA AUTOS</h2>
   <div class="ca-caption">
    ADMINISTRACIÓN COMERCIAL DE JCP
   </div>
  </div>
  <button type="button"
   id="ca-close" class="ca-light">
   Cerrar
  </button>
 </header>
 <div class="ca-body">
  <p>
   Administra el precio y las fotografías
   comerciales del vehículo seleccionado.
  </p>
  <p>
   <a href="${SITE}" target="_blank"
    rel="noopener noreferrer">
    Abrir Colombia Autos
   </a>
  </p>
  <div id="ca-status" class="ca-msg"
   role="status"></div>
  <div id="ca-picker" class="ca-picker"></div>
  <div id="ca-cars"></div>
 </div>`;

 document.body.append(overlay, panel);

 const close = () => {
  if (saving) {
   alert(
    "La publicación se está guardando. " +
    "Finaliza la operación antes de cerrar."
   );
   return;
  }

  overlay.classList.remove("ca-open");
  panel.classList.remove("ca-open");
  clearDrafts();
 };

 overlay.addEventListener("click", close);

 panel.querySelector("#ca-close")
  .addEventListener("click", close);

 const attachHome = () => {
  const target = document.querySelector(
   "#jcpHomeV2 .jcp-h2-q"
  );

  if (!target) return;

  target.querySelectorAll(
   "#ca-home-publish"
  ).forEach(el => el.remove());

  if (!target.querySelector("#ca-home-web")) {
   const btn = document.createElement("button");
   btn.type = "button";
   btn.id = "ca-home-web";
   btn.className =
    "jcp-h2-tile wide ca-home-action";

   btn.innerHTML = `
    <span class="ca-home-symbol"
     aria-hidden="true">🌐</span>
    <span>Página web</span>`;

   btn.setAttribute(
    "aria-label",
    "Abrir página web Colombia Autos"
   );

   btn.onclick = () =>
    window.open(
     SITE, "_blank", "noopener,noreferrer"
    );

   target.appendChild(btn);
  }
 };

 attachHome();

 const dashboard = document.getElementById(
  "dashboard"
 );

 if (dashboard) {
  const obs = new MutationObserver(attachHome);
  obs.observe(dashboard, {
   childList:true,
   subtree:true
  });
 }

 // Recupera la opción del menú de TRES PUNTOS.
 const attachDetailMenu = () => {
  const menu = document.getElementById(
   "unifiedMenu_vehicleDetailView"
  );

  if (!menu ||
      menu.querySelector("#ca-detail-publish")) {
   return;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "ca-detail-publish";
  btn.textContent = "🌐 PUBLICAR EN PÁGINA WEB";

  btn.addEventListener("click", () => {
   menu.classList.remove("open");

   let id = null;

   try {
    if (
     typeof selectedVehicleDetailId !==
      "undefined" &&
     selectedVehicleDetailId != null
    ) {
     id = selectedVehicleDetailId;
    }
   } catch {}

   if (id == null) {
    try {
     if (
      typeof selectedInventoryVehicleId !==
       "undefined" &&
      selectedInventoryVehicleId != null
     ) {
      id = selectedInventoryVehicleId;
     }
    } catch {}
   }

   if (id == null) {
    alert(
     "Abre primero el detalle de un vehículo."
    );
    return;
   }

   window.__caSelectedVehicle = String(id);

   close();
   overlay.classList.add("ca-open");
   panel.classList.add("ca-open");
   load();
  });

  menu.appendChild(btn);
 };

 attachDetailMenu();

 const detail = document.getElementById(
  "vehicleDetailView"
 );

 if (detail) {
  const obs = new MutationObserver(
   attachDetailMenu
  );

  obs.observe(detail, {
   childList:true,
   subtree:true
  });
 }
}

async function load() {
 const db = dbClient();

 if (!db) {
  setStatus(
   "No se encontró la conexión con Supabase."
  );
  return;
 }

 let user;

 try {
  const response = await db.auth.getUser();

  if (response.error) {
   throw response.error;
  }

  user = response.data?.user;
 } catch (error) {
  setStatus(
   "No se pudo verificar la sesión: " +
   error.message
  );
  return;
 }

 if (!user) {
  setStatus(
   "Inicia sesión en MULTI INVERSIONES JCP."
  );
  return;
 }

 setStatus("Consultando publicaciones...");

 const response = await db
  .from("colombia_autos_publicaciones")
  .select(
   "id,vehiculo_id,marca,referencia,modelo," +
   "precio_venta,publicado,vendido,fotos,categoria"
  )
  .eq("owner_id", user.id)
  .eq("vendido", false)
  .order("marca");

 if (response.error) {
  setStatus(
   "Error consultando vehículos: " +
   response.error.message
  );
  return;
 }

 const rows = response.data || [];
 const root = document.getElementById(
  "ca-cars"
 );

 root.replaceChildren();
 clearDrafts();

 const selectedId = String(
  window.__caSelectedVehicle ?? ""
 );

 const v = getVehicle(selectedId);

 if (!v) {
  setStatus(
   "No se pudo identificar el vehículo " +
   "seleccionado en JCP."
  );
  return;
 }

 let car = rows.find(
  row =>
   String(row.vehiculo_id) === selectedId
 );

 // Crear ficha comercial cuando no exista.
 if (!car) {
  const name = vehicleName(v);

  setStatus(
   "⚠️ " + name +
   " todavía no tiene una publicación " +
   "comercial vinculada."
  );

  const link = document.createElement("button");
  link.type = "button";
  link.className = "ca-link-vehicle";
  link.textContent =
   "🔗 Vincular este vehículo a Colombia Autos";

  link.onclick = async () => {
   if (
    String(window.__caSelectedVehicle) !==
    selectedId
   ) {
    setStatus(
     "Cambió el vehículo seleccionado."
    );
    return;
   }

   if (!confirm(
    "¿Crear una ficha comercial OCULTA para " +
    name + "?\n\n" +
    "No se publicará automáticamente."
   )) return;

   link.disabled = true;
   setStatus("Vinculando " + name + "...");

   try {
    const result = await db.rpc(
     "colombia_autos_vincular_vehiculo",
     {
      p_vehiculo_id:selectedId
     }
    );

    if (result.error) {
     throw result.error;
    }

    setStatus(
     "Vehículo vinculado. Abriendo ficha..."
    );

    await load();

   } catch (error) {
    setStatus(
     "No se pudo vincular: " +
     error.message
    );
    link.disabled = false;
   }
  };

  root.appendChild(link);
  return;
 }

 // Seguridad: nunca mostrar otro vehículo.
 const brand = String(
  v.marca || v.m || ""
 ).trim().toUpperCase();

 const ref = String(
  v.ref || v.referencia || ""
 ).trim().toUpperCase();

 const publicBrand = String(
  car.marca || ""
 ).trim().toUpperCase();

 const publicRef = String(
  car.referencia || ""
 ).trim().toUpperCase();

 if (
  (brand && publicBrand &&
   brand !== publicBrand) ||
  (ref && publicRef &&
   ref !== publicRef)
 ) {
  setStatus(
   "⚠️ La ficha comercial no coincide " +
   "con el vehículo de JCP. " +
   "Se bloqueó para evitar modificar otro carro."
  );
  return;
 }

 const title = vehicleName(v);
 const pics = Array.isArray(car.fotos)
  ? car.fotos.filter(Boolean)
  : [];

 const estimate = estimatedPrice(selectedId);

 const priceValue = car.publicado
  ? Number(car.precio_venta) || estimate
  : estimate || Number(car.precio_venta) || 0;

 setStatus(
  "Administrando " + title + ". " +
  "Solo este vehículo puede modificarse."
 );

 const box = document.createElement("section");
 box.className = "ca-item ca-selected";
 box.dataset.vehiculoId = selectedId;

 box.innerHTML = `
 <h3>${esc(title)}</h3>
 <div class="ca-tag">
  ${car.publicado
   ? "🟢 PUBLICADO EN LA WEB"
   : "⚪ OCULTO AL PÚBLICO"}
  · ${pics.length} fotografía(s)
 </div>

 <label>Precio de venta público (COP)</label>
 <div class="ca-muted">
  Precio comercial independiente
  del costo financiero en JCP.
 </div>
 <input class="ca-price"
  type="text" inputmode="numeric"
  maxlength="19"
  value="${formatPrice(priceValue)}"
  placeholder="Ej. 39.990.000">

 <label>Categoría en la página web</label>
 <select class="ca-category">
  <option value="disponible"
   ${car.categoria === "oportunidad"
     ? "" : "selected"}>
   Disponible para entrega
  </option>
  <option value="oportunidad"
   ${car.categoria === "oportunidad"
     ? "selected" : ""}>
   De oportunidad · En alistamiento
  </option>
 </select>

 <div class="ca-muted">
  Elige dónde aparecerá el vehículo.
 </div>

 <div class="ca-photos"></div>

 <label>Agregar fotografías</label>
 <input class="ca-file" type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
  multiple>

 <div class="ca-muted">
  Las fotos nuevas se preparan antes de
  publicarlas. Máximo 30 fotos por carga.
 </div>

 <div class="ca-row">
  <button type="button" class="ca-save">
   Guardar precio
  </button>
  <button type="button"
   class="ca-upload ca-light">
   Preparar fotografías
  </button>
  <button type="button" class="ca-toggle
   ${car.publicado ? "ca-hide" : ""}">
   ${car.publicado
    ? "Ocultar anuncio"
    : "Publicar anuncio"}
  </button>
 </div>

 <div class="ca-result"
  role="status" aria-live="polite"></div>
 `;

 root.appendChild(box);

 const price = box.querySelector(".ca-price");
 const category = box.querySelector(
  ".ca-category"
 );
 const file = box.querySelector(".ca-file");
 const gallery = box.querySelector(
  ".ca-photos"
 );
 const result = box.querySelector(
  ".ca-result"
 );

 const msg = message => {
  result.textContent = message;
 };

 const busy = value => {
  box.querySelectorAll("button").forEach(
   button => button.disabled = value
  );
 };

 price.addEventListener("input", () => {
  const n = parsePrice(price.value);
  price.value = n ? formatPrice(n) : "";
 });

 function refreshGallery() {
  gallery.replaceChildren();

  for (const saved of pics) {
   const item = document.createElement("div");
   item.className = "ca-photo-item";

   const img = document.createElement("img");
   img.src = publicPhoto(db, saved);
   img.loading = "lazy";
   img.alt = "Foto comercial " + title;

   const del = document.createElement("button");
   del.type = "button";
   del.textContent = "×";
   del.title = "Eliminar foto comercial";

   del.onclick = async () => {
    if (car.publicado && pics.length === 1) {
     msg(
      "Oculta el anuncio antes de eliminar " +
      "su última fotografía."
     );
     return;
    }

    const path = storedPhotoPath(
     saved, db, user, car
    );

    if (!path) {
     msg(
      "Esta fotografía tiene una ruta antigua " +
      "que no permite eliminarla automáticamente."
     );
     return;
    }

    if (!confirm(
     "¿Eliminar esta foto de Colombia Autos?"
    )) return;

    busy(true);

    try {
     const unlink = await db.rpc(
      "colombia_autos_quitar_foto",
      {
       p_vehiculo_id:car.vehiculo_id,
       p_ruta:path
      }
     );

     if (unlink.error) {
      throw unlink.error;
     }

     const removed = await db.storage
      .from(BUCKET)
      .remove([path]);

     if (removed.error) {
      throw removed.error;
     }

     const index = pics.indexOf(saved);
     if (index >= 0) pics.splice(index, 1);

     refreshGallery();
     msg("✅ Fotografía eliminada.");
    } catch (error) {
     msg(
      "No se pudo eliminar: " +
      error.message
     );
    } finally {
     busy(false);
    }
   };

   item.append(img, del);
   gallery.appendChild(item);
  }

  for (
   const draft of drafts.get(selectedId) || []
  ) {
   const item = document.createElement("div");
   item.className =
    "ca-photo-item ca-draft";

   const img = document.createElement("img");
   img.src = draft.url;
   img.alt = "Fotografía sin publicar";

   const del = document.createElement("button");
   del.type = "button";
   del.textContent = "×";

   del.onclick = () => {
    const current = drafts.get(selectedId) || [];
    drafts.set(
     selectedId,
     current.filter(x => x !== draft)
    );
    URL.revokeObjectURL(draft.url);
    refreshGallery();
   };

   const note = document.createElement("small");
   note.textContent = "SIN PUBLICAR";

   item.append(img, del, note);
   gallery.appendChild(item);
  }
 }

 refreshGallery();

 box.querySelector(".ca-save").onclick =
  async () => {
   const n = parsePrice(price.value);

   if (
    !Number.isSafeInteger(n) ||
    n <= 0 || n > 9999999999999
   ) {
    msg("Ingresa un precio válido.");
    return;
   }

   busy(true);

   try {
    const r = await db.rpc(
     "colombia_autos_guardar_precio",
     {
      p_vehiculo_id:car.vehiculo_id,
      p_precio:n
     }
    );

    if (r.error) throw r.error;

    car.precio_venta = n;

    msg(
     "✅ Precio guardado: " + cash(n)
    );
   } catch (error) {
    msg(
     "No se pudo guardar: " +
     error.message
    );
   } finally {
    busy(false);
   }
  };

 async function saveCategory() {
  const chosen = category.value;

  if (
   chosen !== "disponible" &&
   chosen !== "oportunidad"
  ) {
   throw Error("Categoría inválida.");
  }

  if (
   chosen === (car.categoria || "disponible")
  ) {
   return;
  }

  const r = await db.rpc(
   "colombia_autos_clasificar",
   {
    p_vehiculo_id:String(car.vehiculo_id),
    p_categoria:chosen
   }
  );

  if (r.error) throw r.error;

  car.categoria = chosen;
 }

 category.addEventListener(
  "change",
  async () => {
   busy(true);

   try {
    await saveCategory();
    msg("✅ Categoría guardada.");
   } catch (error) {
    category.value =
     car.categoria || "disponible";

    msg(
     "No se pudo clasificar: " +
     error.message
    );
   } finally {
    busy(false);
   }
  }
 );

 box.querySelector(".ca-upload").onclick =
  async () => {
   const selected = Array.from(
    file.files || []
   );

   if (!selected.length) {
    msg("Selecciona fotografías.");
    return;
   }

   const previous =
    drafts.get(selectedId) || [];

   if (
    previous.length + selected.length > 30
   ) {
    msg("Máximo 30 fotos nuevas.");
    return;
   }

   busy(true);
   let prepared = 0;
   const errors = [];

   try {
    for (const f of selected) {
     msg(
      "Preparando fotografía " +
      (prepared + errors.length + 1) +
      " de " + selected.length
     );

     try {
      const converted =
       await preparePhoto(f);

      previous.push({
       file:converted,
       url:URL.createObjectURL(converted)
      });

      prepared++;
     } catch (error) {
      errors.push(
       f.name + ": " + error.message
      );
     }
    }

    drafts.set(selectedId, previous);
    file.value = "";
    refreshGallery();

    if (car.publicado && prepared) {
     box.querySelector(
      ".ca-toggle"
     ).textContent = "Guardar fotos nuevas";
    }

    msg(
     "✅ " + prepared +
     " fotografía(s) preparadas." +
     (errors.length
      ? "\n⚠️ " + errors.join("\n")
      : "")
    );
   } finally {
    busy(false);
   }
  };

 box.querySelector(".ca-toggle").onclick =
  async () => {
   const n = parsePrice(price.value);
   const pending =
    drafts.get(selectedId) || [];

   if (!car.publicado) {
    if (!Number.isSafeInteger(n) || n <= 0) {
     msg("Ingresa un precio comercial.");
     return;
    }

    if (!pics.length && !pending.length) {
     msg("Agrega al menos una fotografía.");
     return;
    }

    if (!confirm(
     "¿Publicar " + title +
     " en Colombia Autos?"
    )) return;

   } else if (pending.length) {
    if (!confirm(
     "¿Guardar las fotografías nuevas?"
    )) return;

   } else if (!confirm(
    "¿Ocultar este anuncio?"
   )) {
    return;
   }

   busy(true);
   saving = true;

   const newPaths = [];

   try {
    await saveCategory();

    if (
     n > 0 &&
     n !== Number(car.precio_venta)
    ) {
     const saved = await db.rpc(
      "colombia_autos_guardar_precio",
      {
       p_vehiculo_id:car.vehiculo_id,
       p_precio:n
      }
     );

     if (saved.error) throw saved.error;

     car.precio_venta = n;
    }

    for (const draft of pending) {
     const f = draft.file;

     const unique =
      globalThis.crypto?.randomUUID?.() ||
      (
       Date.now().toString(16) + "-" +
       Math.random()
        .toString(16).slice(2)
      );

     const path =
      user.id + "/" +
      car.id + "/" +
      unique + ".jpg";

     msg("Subiendo fotografías...");

     const upload = await db.storage
      .from(BUCKET)
      .upload(path, f, {
       cacheControl:"3600",
       upsert:false,
       contentType:f.type
      });

     if (upload.error) {
      throw upload.error;
     }

     const linked = await db.rpc(
      "colombia_autos_agregar_foto",
      {
       p_vehiculo_id:car.vehiculo_id,
       p_ruta:path
      }
     );

     if (linked.error) {
      await db.storage.from(BUCKET)
       .remove([path]);

      throw linked.error;
     }

     newPaths.push(path);
    }

    if (!car.publicado) {
     const published = await db.rpc(
      "colombia_autos_publicar",
      {
       p_vehiculo_id:car.vehiculo_id,
       p_publicar:true
      }
     );

     if (published.error) {
      throw published.error;
     }
    } else if (!pending.length) {
     const hidden = await db.rpc(
      "colombia_autos_publicar",
      {
       p_vehiculo_id:car.vehiculo_id,
       p_publicar:false
      }
     );

     if (hidden.error) {
      throw hidden.error;
     }
    }

    msg("✅ Cambios guardados.");

    saving = false;
    await load();

   } catch (error) {
    if (!car.publicado) {
     for (const path of newPaths.reverse()) {
      await db.rpc(
       "colombia_autos_quitar_foto",
       {
        p_vehiculo_id:car.vehiculo_id,
        p_ruta:path
       }
      );

      await db.storage
       .from(BUCKET)
       .remove([path]);
     }
    }

    msg(
     "Error: " + error.message +
     "\nComprueba el estado de la publicación " +
     "antes de volver a intentar."
    );
   } finally {
    saving = false;
    busy(false);
   }
  };
}

if (document.readyState === "loading") {
 document.addEventListener(
  "DOMContentLoaded",
  mount,
  {once:true}
 );
} else {
 mount();
}

})();

/* MULTI INVERSIONES JCP — JAY NATURAL v1.0 */
(function(){
'use strict';

const NAME='mijcp_assistant_name_v26';
const VOICE='mijcp_assistant_voice_v26';
const ENABLED='mijcp_assistant_enabled_v26';

let rec=null;
let listening=false;
let ctx=null;

const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;

const norm=s=>String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/[¿?¡!.,;:]/g,' ')
  .replace(/\s+/g,' ')
  .trim();

const jayName=()=>((localStorage.getItem(NAME)||'Jay').trim()||'Jay');

function setStatus(title, detail, state){
  const t=document.getElementById('jcpVoiceStatus');
  const x=document.getElementById('jcpVoiceTranscript');
  const d=document.getElementById('jcpVoiceStatusDot');
  if(t)t.textContent=title;
  if(x)x.textContent=detail||'';
  if(d){
    d.classList.remove('listening','error');
    if(state)d.classList.add(state);
  }
}

function speak(text, listenAfter=false){
  if(!('speechSynthesis' in window)){
    if(listenAfter)setTimeout(startListening,250);
    return;
  }
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='es-CO';
  u.rate=.98;

  const uri=localStorage.getItem(VOICE)||'';
  const voices=speechSynthesis.getVoices();
  const voice=voices.find(v=>v.voiceURI===uri)||voices.find(v=>/^es/i.test(v.lang));
  if(voice)u.voice=voice;

  if(listenAfter)u.onend=()=>setTimeout(startListening,250);
  speechSynthesis.speak(u);
}

function money(v){
  try{
    return new Intl.NumberFormat('es-CO',{
      style:'currency',currency:'COP',maximumFractionDigits:0
    }).format(Number(v)||0);
  }catch(e){
    return '$ '+(Number(v)||0).toLocaleString('es-CO');
  }
}

function parseAmount(s){
  s=norm(s);

  const numeric=s.match(/\d[\d .]*/);
  if(numeric){
    let n=Number(numeric[0].replace(/[ .]/g,''));
    if(/millon/.test(s)&&n<1000000)n*=1000000;
    else if(/\bmil\b/.test(s)&&n<1000)n*=1000;
    return n;
  }

  const w={
    cero:0,un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,
    diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,
    dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintidos:22,veintitres:23,
    veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,
    veintinueve:29,treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,
    ochenta:80,noventa:90,cien:100,ciento:100,doscientos:200,trescientos:300,
    cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,
    ochocientos:800,novecientos:900
  };

  let total=0,current=0,found=false;
  for(const p of s.split(' ')){
    if(p==='y')continue;
    if(p==='mil'){
      current=(current||1)*1000;
      total+=current;
      current=0;
      found=true;
      continue;
    }
    if(p.startsWith('millon')){
      current=(current||1)*1000000;
      total+=current;
      current=0;
      found=true;
      continue;
    }
    if(Object.prototype.hasOwnProperty.call(w,p)){
      current+=w[p];
      found=true;
    }
  }
  return found ? total+current : 0;
}

function getVehicles(){
  try{
    return Array.isArray(data.veh)?data.veh:[];
  }catch(e){
    return [];
  }
}

function findVehicle(text){
  const q=norm(text);
  let best=null,bestScore=0;

  for(const v of getVehicles()){
    const keys=[v.pl,v.marca,v.m,v.ref,v.modelo].filter(Boolean).map(norm);
    let score=0;
    for(const k of keys){
      if(k && q.includes(k))score += k.length>2 ? 3 : 1;
    }
    if(score>bestScore){
      bestScore=score;
      best=v;
    }
  }
  return bestScore ? best : null;
}

function openSales(vehicle){
  try{
    if(typeof openOperationsSales==='function')openOperationsSales();
    if(typeof toggleSaleGrid==='function')toggleSaleGrid();
    if(vehicle && typeof selectSaleVehicle==='function'){
      setTimeout(()=>selectSaleVehicle(vehicle.id),120);
    }
  }catch(e){
    console.warn('JAY: no fue posible abrir ventas',e);
  }
}

function openModule(id,msg){
  try{
    if(typeof show==='function')show(id);
    speak(msg||'Listo.');
  }catch(e){
    speak('No pude abrir ese módulo.');
  }
}

function getFinance(){
  try{
    return typeof getFinancialSnapshotV75==='function'
      ? getFinancialSnapshotV75()
      : null;
  }catch(e){
    return null;
  }
}

function answerFinance(q){
  const f=getFinance();
  if(!f)return false;

  if(/disponible|plata tengo|dinero tengo|cuanto tengo en caja/.test(q)){
    speak(`Tienes ${money(f.available)} disponibles.`);
    return true;
  }
  if(/invertid/.test(q)&&/carro|vehiculo/.test(q)){
    speak(`Tienes ${money(f.vehicleInvestment)} invertidos en vehículos.`);
    return true;
  }
  if(/patrimonio/.test(q)){
    speak(`Tu patrimonio es de ${money(f.equity)}.`);
    return true;
  }
  if(/por cobrar|cuanto me deben|cobrar/.test(q)){
    speak(`Tienes ${money(f.receivable)} por cobrar.`);
    return true;
  }
  if(/deuda|cuanto debo|obligacion/.test(q)){
    speak(`Tus obligaciones pendientes suman ${money(f.debt)}.`);
    return true;
  }
  return false;
}

function beginSale(q){
  const v=findVehicle(q);
  openSales(v);

  if(v){
    ctx={type:'sale',stage:'price',vehicle:v};
    speak(
      `Encontré ${v.marca||v.m||''} ${v.ref||''}${v.pl?' placa '+v.pl:''}. ¿En cuánto lo vendiste?`,
      true
    );
  }else{
    ctx={type:'sale',stage:'vehicle'};
    speak('Abrí nueva venta. Dime qué vehículo quieres vender.',true);
  }
}

function continueSale(q){
  if(!ctx||ctx.type!=='sale')return false;

  if(ctx.stage==='vehicle'){
    const v=findVehicle(q);
    if(!v){
      speak('No encontré ese vehículo. Dime la marca, referencia o placa.',true);
      return true;
    }

    ctx.vehicle=v;
    ctx.stage='price';
    openSales(v);

    speak(
      `Listo, ${v.marca||v.m||''} ${v.ref||''}. ¿En cuánto lo vendiste?`,
      true
    );
    return true;
  }

  if(ctx.stage==='price'){
    const amount=parseAmount(q);

    if(amount<=0){
      speak('No alcancé a entender el valor. Puedes decir, por ejemplo, treinta y dos millones.',true);
      return true;
    }

    const el=document.getElementById('salePrice');
    if(el){
      el.value=new Intl.NumberFormat('es-CO').format(amount);
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }

    ctx.price=amount;
    ctx.stage='payment';

    speak(
      `Perfecto, ${money(amount)}. ¿Cómo te lo pagaron: efectivo, transferencia, crédito, pago mixto o permuta?`,
      true
    );
    return true;
  }

  if(ctx.stage==='payment'){
    if(/permuta|otro carro|otro vehiculo/.test(q)){
      ctx=null;
      try{
        if(typeof togglePermutaForm==='function')togglePermutaForm();
      }catch(e){}
      speak('Entendido. Abrí la permuta para registrar el vehículo que recibiste.');
      return true;
    }

    const sel=document.getElementById('saleMethod');

    if(/mixto|efectivo.*transfer|transfer.*efectivo/.test(q)){
      if(sel)sel.value='mixto';
    }else if(/transfer/.test(q)){
      if(sel)sel.value='transferencia';
    }else if(/credito|fiado|saldo pendiente/.test(q)){
      if(sel)sel.value='credito';
    }else if(/efectivo|contado/.test(q)){
      if(sel)sel.value='efectivo';
    }else{
      speak('¿Fue efectivo, transferencia, crédito, pago mixto o permuta?',true);
      return true;
    }

    if(sel)sel.dispatchEvent(new Event('change',{bubbles:true}));

    ctx=null;
    speak('Listo. Dejé preparada la forma de pago. Revisa los datos antes de guardar la venta.');
    return true;
  }

  return false;
}

function processNatural(raw){
  let q=norm(raw);
  const n=norm(jayName());

  setStatus(`${jayName().toUpperCase()} TE ESCUCHÓ`,raw);

  q=q.replace(new RegExp(`\\b(hey|oye|hola)?\\s*${n}\\b`,'g'),'').trim();

  if(ctx && continueSale(q))return;

  if(!q){
    speak('Sí, te escucho.',true);
    return;
  }

  if(/cancelar|cancela|olvida eso/.test(q)){
    ctx=null;
    speak('Listo, cancelé la conversación actual.');
    return;
  }

  if(answerFinance(q))return;

  if(/factur|vendi|vender|registrar.*venta|hacer.*venta/.test(q)){
    beginSale(q);
    return;
  }

  if(/abrir.*modulo|abrir modulos|modulos|operaciones/.test(q)){
    try{
      if(typeof openOperationsHub==='function')openOperationsHub();
      speak('Abrí Operaciones.');
    }catch(e){
      speak('No pude abrir Operaciones.');
    }
    return;
  }

  if(/vehiculo|vehiculos|inventario|carros/.test(q) &&
     /abre|abrir|ir|muestr|ver/.test(q)){
    openModule('vehiculos','Abrí Vehículos.');
    return;
  }

  if(/finanzas|financiero/.test(q)){
    openModule('cajaCapital','Abrí Finanzas.');
    return;
  }

  if(/prestamo|prestamos/.test(q) &&
     /abre|abrir|ir|muestr/.test(q)){
    openModule('prestamos','Abrí Préstamos.');
    return;
  }

  if(/inversion|inversiones/.test(q) &&
     /abre|abrir|ir|muestr/.test(q)){
    openModule('inversiones','Abrí Inversiones.');
    return;
  }

  if(/inicio|principal|home/.test(q) &&
     /abre|abrir|ir|volver|regresa/.test(q)){
    openModule('dashboard','Volví al inicio.');
    return;
  }

  const v=findVehicle(q);
  if(v && /busca|buscar|muestr|cuanto|inversion/.test(q)){
    const inv=(+v.c||0)+(+v.g||0);
    speak(
      `${v.marca||v.m||''} ${v.ref||''}${v.pl?' placa '+v.pl:''} tiene una inversión total de ${money(inv)}.`
    );
    return;
  }

  speak(
    'No entendí del todo. Puedes hablarme de forma natural. Por ejemplo: vendí el BMW, cuánto dinero tengo disponible, abre vehículos o quiero hacer una permuta.',
    true
  );
}

function makeRecognition(){
  if(!Recognition)return null;

  const r=new Recognition();
  r.lang='es-CO';
  r.interimResults=false;
  r.continuous=false;
  r.maxAlternatives=1;

  r.onstart=()=>{
    listening=true;
    setStatus(`${jayName().toUpperCase()} ESCUCHANDO`,'Habla con naturalidad.','listening');
  };

  r.onresult=e=>{
    const text=e.results?.[0]?.[0]?.transcript||'';
    if(text)processNatural(text);
  };

  r.onerror=e=>{
    listening=false;
    if(e.error!=='aborted'){
      setStatus('NO PUDE ESCUCHAR',e.error||'Intenta nuevamente.','error');
    }
  };

  r.onend=()=>{
    listening=false;
  };

  return r;
}

async function startListening(){
  if(localStorage.getItem(ENABLED)!=='1'){
    speak(`Activa ${jayName()} primero.`);
    return;
  }

  if(!Recognition){
    setStatus('RECONOCIMIENTO NO COMPATIBLE','Este navegador no ofrece reconocimiento de voz.','error');
    return;
  }

  try{
    if(navigator.mediaDevices?.getUserMedia){
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      stream.getTracks().forEach(t=>t.stop());
    }
  }catch(e){
    setStatus('MICRÓFONO BLOQUEADO','Permite el micrófono para continuar.','error');
    return;
  }

  if(!rec)rec=makeRecognition();

  try{
    rec.start();
  }catch(e){}
}

function stopListening(){
  if(rec&&listening){
    try{rec.stop();}catch(e){}
  }
  listening=false;
}

window.checkMicrophoneAndStart=startListening;
window.toggleJayListening=function(){
  if(listening)stopListening();
  else startListening();
};

window.JayNatural={
  version:'1.0',
  start:startListening,
  stop:stopListening,
  process:processNatural,
  getContext:()=>ctx
};

console.log('JAY NATURAL v1.0 activo');
})();

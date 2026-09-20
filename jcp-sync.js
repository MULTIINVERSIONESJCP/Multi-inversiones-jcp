/* Cola durable de una operación por dispositivo + comparación atómica en PostgreSQL. */
(function(root){
  'use strict';
  const PENDING_KEY='jcp_pending_write_v2';
  const RPC_TIMEOUT_MS=12000;
  const SESSION_TIMEOUT_MS=8000;
  const canonical=value=>JSON.stringify(sort(value));
  function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
  function create({client,storage,onStatus=()=>{},resolveConflict=null,uuid=()=>{
    if(root.crypto?.randomUUID)return root.crypto.randomUUID();
    return 'jcp-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }}){
    let userId=null,revision=null,busy=null,conflicted=false;
    const pending=()=>JSON.parse(storage.getItem(PENDING_KEY)||'null');
    const status=(state,message)=>onStatus({state,message,pending:!!pending(),revision});
    async function limited(promise,timeout,message){
      let timer;
      try{return await Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeout);})]);}
      finally{clearTimeout(timer);}
    }
    async function rpc(name,args){
      const result=await limited(client.rpc(name,args),RPC_TIMEOUT_MS,'Supabase tardó demasiado en responder. El cambio está protegido y se reintentará automáticamente.');
      if(result.error)throw result.error;
      return result.data;
    }
    async function read(){
      const row=await rpc('jcp_read_state');
      if(!row||!Number.isSafeInteger(row.revision)||row.revision<0)throw new Error('Respuesta de revisión inválida.');
      return row;
    }
    function adopt(row,id){
      if(busy)throw new Error('Hay un guardado en curso.');
      userId=id;revision=row.revision;conflicted=false;
    }
    function stage(snapshot){
      if(!userId||revision===null)throw new Error('Primero debe completarse la conexión con Supabase.');
      if(conflicted)throw new Error('Hay un conflicto pendiente. Revisa las dos copias antes de continuar.');
      const existing=pending();
      if(existing){
        if(existing.userId===userId&&canonical(existing.snapshot)===canonical(snapshot))return existing;
        throw new Error('Espera a que el cambio pendiente quede confirmado en Supabase antes de registrar otro.');
      }
      const request={userId,expectedRevision:revision,requestId:uuid(),snapshot:JSON.parse(JSON.stringify(snapshot))};
      storage.setItem(PENDING_KEY,JSON.stringify(request));
      storage.setItem('jcp_cloud_pending_v1','1');
      status('pending','Guardado en este dispositivo · pendiente de confirmación en Supabase');
      return request;
    }
    async function flush(){
      if(busy)return busy;
      const request=pending();if(!request)return {ok:true,revision};
      if(request.userId!==userId)throw new Error('El cambio pendiente pertenece a otra cuenta. No se enviará.');
      if(conflicted)return {ok:false,conflict:true};
      busy=(async()=>{
        try{
          status('saving','Guardando en Supabase…');
          const {data:sessionData,error}=await limited(client.auth.getSession(),SESSION_TIMEOUT_MS,'No se pudo validar la sesión a tiempo. El cambio se reintentará automáticamente.');
          if(error)throw error;
          if(sessionData?.session?.user?.id!==request.userId)throw new Error('La sesión cambió. El pendiente permanece protegido.');
          let current=request,merged=false,result;
          for(let attempt=0;;attempt++){
            result=await rpc('jcp_save_state',{p_expected_revision:current.expectedRevision,p_request_id:current.requestId,p_data:current.snapshot});
            if(!result?.conflict)break;
            // Otro dispositivo guardó primero: intentar combinar ambos cambios sin perder nada.
            let next=null,central=null;
            if(resolveConflict&&attempt<3){
              status('saving','Otro dispositivo guardó primero. Combinando cambios…');
              central=await read();
              if(central?.data){try{next=await resolveConflict({request:current,central});}catch(e){next=null;}}
            }
            if(!next){conflicted=true;status('conflict','Otro dispositivo guardó primero. Tu cambio está protegido y no sobrescribió la nube.');return result;}
            current={userId:current.userId,expectedRevision:central.revision,requestId:uuid(),snapshot:next};
            storage.setItem(PENDING_KEY,JSON.stringify(current));
            revision=central.revision;merged=true;
          }
          if(!result?.ok||!Number.isSafeInteger(result.revision))throw new Error('Respuesta de guardado inválida.');
          const acknowledged={...current,acknowledgedRevision:result.revision};
          storage.setItem(PENDING_KEY,JSON.stringify(acknowledged));
          revision=result.revision;
          status('confirmed',merged?'Cambios de dos dispositivos combinados y guardados':'Guardado confirmado en Supabase');
          return {...result,snapshot:current.snapshot,merged};
        }catch(error){status('pending',error.message||String(error));throw error;}
        finally{busy=null;}
      })();
      return busy;
    }
    function finish(){
      const p=pending();
      if(!p||!Number.isSafeInteger(p.acknowledgedRevision))throw new Error('Falta confirmación de Supabase.');
      storage.removeItem(PENDING_KEY);storage.removeItem('jcp_cloud_pending_v1');
      status('confirmed','Guardado confirmado en Supabase');
    }
    function clearAfterExport(){
      if(busy)throw new Error('Espera a que termine la petición de guardado.');
      storage.removeItem(PENDING_KEY);storage.removeItem('jcp_cloud_pending_v1');conflicted=false;
    }
    return {read,adopt,stage,flush,finish,pending,clearAfterExport,get revision(){return revision;},get busy(){return !!busy;},get conflicted(){return conflicted;}};
  }

  /* Fusión de tres vías por identificador: base (donde partió este dispositivo),
     mine (cambio de este dispositivo) y theirs (versión central actual).
     Solo combina si los dos dispositivos NO tocaron el mismo registro. */
  function mergeStates(base,mine,theirs,opts){
    const arrayKeys=opts.arrayKeys,keyOf=opts.keyOf,logKey=opts.logKey||'activityLog',logMax=opts.logMax||500;
    const eq=(a,b)=>canonical(a)===canonical(b);
    const fail=reason=>({ok:false,reason});
    function toMap(list){
      const arr=Array.isArray(list)?list:[];const map=new Map();
      for(let i=0;i<arr.length;i++){
        const item=arr[i];
        if(!item||typeof item!=='object'||Array.isArray(item))return null;
        const k=keyOf(item,i);
        if(typeof k!=='string'||k.startsWith('index:')||map.has(k))return null;
        map.set(k,item);
      }
      return map;
    }
    function mergeList(key){
      const B=toMap(base?.[key]),M=toMap(mine?.[key]),T=toMap(theirs?.[key]);
      if(!B||!M||!T)return fail('Lista «'+key+'» sin identificadores únicos');
      const order=[...T.keys()];
      for(const k of M.keys())if(!T.has(k))order.push(k);
      for(const k of B.keys())if(!T.has(k)&&!M.has(k))order.push(k);
      const list=[];
      for(const k of order){
        const hb=B.has(k),hm=M.has(k),ht=T.has(k);
        const vb=B.get(k),vm=M.get(k),vt=T.get(k);
        const mineChanged=hb!==hm||(hb&&hm&&!eq(vb,vm));
        const theirsChanged=hb!==ht||(hb&&ht&&!eq(vb,vt));
        let take;
        if(!mineChanged&&!theirsChanged)take=ht?vt:undefined;
        else if(mineChanged&&!theirsChanged)take=hm?vm:undefined;
        else if(!mineChanged&&theirsChanged)take=ht?vt:undefined;
        else if(hm&&ht&&eq(vm,vt))take=vm;
        else return fail('Los dos dispositivos cambiaron el mismo registro en «'+key+'»');
        if(take!==undefined)list.push(take);
      }
      if(key===logKey){
        list.sort((x,y)=>(Date.parse(y?.at||'')||0)-(Date.parse(x?.at||'')||0));
        list.length=Math.min(list.length,logMax);
      }
      return {ok:true,list};
    }
    if(!base||!mine||!theirs)return fail('Falta la versión base');
    const merged={};
    const names=new Set([...Object.keys(base),...Object.keys(mine),...Object.keys(theirs)]);
    for(const key of names){
      if(key==='_sync')continue;
      if(arrayKeys.includes(key)||key===logKey){
        const r=mergeList(key);if(!r.ok)return r;merged[key]=r.list;
      }else{
        const b=base[key],m=mine[key],t=theirs[key];
        let take;
        if(eq(m,b))take=t;else if(eq(t,b)||eq(m,t))take=m;
        else return fail('Los dos dispositivos cambiaron «'+key+'»');
        if(take!==undefined)merged[key]=take;
      }
    }
    merged._sync={...(theirs._sync||{})};
    return {ok:true,merged};
  }
  root.JcpSync={create,PENDING_KEY,canonical,mergeStates};
  if(typeof module==='object'&&module.exports)module.exports=root.JcpSync;
})(typeof window==='object'?window:globalThis);

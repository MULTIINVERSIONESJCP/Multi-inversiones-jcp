/* Cola durable de una operación por dispositivo + comparación atómica en PostgreSQL. */
(function(root){
  'use strict';
  const PENDING_KEY='jcp_pending_write_v2';
  const canonical=value=>JSON.stringify(sort(value));
  function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
  function create({client,storage,onStatus=()=>{},uuid=()=>{
    if(root.crypto?.randomUUID)return root.crypto.randomUUID();
    return 'jcp-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }}){
    let userId=null,revision=null,busy=null,conflicted=false;
    const pending=()=>JSON.parse(storage.getItem(PENDING_KEY)||'null');
    const status=(state,message)=>onStatus({state,message,pending:!!pending(),revision});
    async function rpc(name,args){
      let timer;
      try{
        const result=await Promise.race([client.rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Supabase no confirmó la respuesta. El cambio sigue pendiente.')),15000);})]);
        if(result.error)throw result.error;
        return result.data;
      }finally{clearTimeout(timer);}
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
      // Si se agota el almacenamiento, fallar antes de iniciar la petición.
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
          const {data:sessionData,error}=await client.auth.getSession();
          if(error)throw error;
          if(sessionData?.session?.user?.id!==request.userId)throw new Error('La sesión cambió. El pendiente permanece protegido.');
          const result=await rpc('jcp_save_state',{p_expected_revision:request.expectedRevision,p_request_id:request.requestId,p_data:request.snapshot});
          if(result?.conflict){conflicted=true;status('conflict','Otro dispositivo guardó primero. Tu cambio está protegido y no sobrescribió la nube.');return result;}
          if(!result?.ok||!Number.isSafeInteger(result.revision))throw new Error('Respuesta de guardado inválida.');
          // Persistir el acuse junto al pendiente ANTES de limpiarlo: recuperable tras un cierre.
          const acknowledged={...request,acknowledgedRevision:result.revision};
          storage.setItem(PENDING_KEY,JSON.stringify(acknowledged));
          revision=result.revision;
          status('confirmed','Guardado confirmado en Supabase');
          return {...result,snapshot:request.snapshot};
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
  root.JcpSync={create,PENDING_KEY,canonical};
  if(typeof module==='object'&&module.exports)module.exports=root.JcpSync;
})(typeof window==='object'?window:globalThis);

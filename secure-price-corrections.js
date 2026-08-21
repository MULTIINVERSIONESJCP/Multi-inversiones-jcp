(function(){
  'use strict';

  const PRICE_CHANGE_PIN='1526';

  function parseMoneyValue(value){
    if(typeof parseFormattedMoney==='function') return parseFormattedMoney(value);
    return Number(String(value||'').replace(/[^0-9]/g,''))||0;
  }

  function formatMoneyValue(value){
    return new Intl.NumberFormat('es-CO').format(Number(value)||0);
  }

  function esc(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function nowInfo(){
    const d=new Date();
    return {
      iso:d.toISOString(),
      label:d.toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'})
    };
  }

  function requestReason(kind,oldValue,newValue){
    const reason=prompt(
      'MOTIVO DE LA CORRECCIÓN\n\n'+
      kind+'\n'+
      'Valor actual: '+money(oldValue)+'\n'+
      'Nuevo valor: '+money(newValue)+'\n\n'+
      'Escribe el motivo del cambio:'
    );
    if(reason===null)return null;
    const clean=String(reason).trim().toUpperCase();
    if(!clean){
      alert('DEBES REGISTRAR EL MOTIVO DE LA CORRECCIÓN.');
      return null;
    }
    return clean;
  }

  function requestPin(){
    const pin=prompt(
      '🔒 CAMBIO DE PRECIO PROTEGIDO\n\n'+
      'Ingresa la clave de seguridad para autorizar esta corrección:'
    );
    if(pin===null)return false;
    if(String(pin).trim()!==PRICE_CHANGE_PIN){
      alert('CLAVE INCORRECTA. NO SE MODIFICÓ NINGÚN VALOR.');
      return false;
    }
    return true;
  }

  function ensurePurchasePriceField(){
    const form=document.querySelector('#vehicleEditor .vehicle-editor-form');
    if(!form || document.getElementById('editVehCompra'))return;

    const input=document.createElement('input');
    input.id='editVehCompra';
    input.type='text';
    input.inputMode='numeric';
    input.setAttribute('data-money','1');
    input.placeholder='PRECIO DE COMPRA';
    input.autocomplete='off';

    const plate=document.getElementById('editVehPlaca');
    if(plate)plate.insertAdjacentElement('afterend',input);
    else form.appendChild(input);

    const note=document.createElement('div');
    note.id='editVehCompraSecurityNote';
    note.className='full';
    note.style.cssText='font-size:11px;color:#d4af37;padding:2px 3px 5px';
    note.textContent='🔒 CAMBIAR EL PRECIO DE COMPRA REQUIERE CLAVE Y MOTIVO.';
    input.insertAdjacentElement('afterend',note);

    input.addEventListener('input',()=>{
      if(typeof formatMoneyInput==='function')formatMoneyInput(input);
      else input.value=formatMoneyValue(parseMoneyValue(input.value));
    });
  }

  const originalOpenVehicleEditPanel=window.openVehicleEditPanel;
  if(typeof originalOpenVehicleEditPanel==='function'){
    window.openVehicleEditPanel=function(){
      ensurePurchasePriceField();
      return originalOpenVehicleEditPanel.apply(this,arguments);
    };
  }

  const originalEditVehicleFromMovements=window.editVehicleFromMovements;
  if(typeof originalEditVehicleFromMovements==='function'){
    window.editVehicleFromMovements=function(id){
      ensurePurchasePriceField();
      const result=originalEditVehicleFromMovements.apply(this,arguments);
      const x=(data.veh||[]).find(v=>String(v.id)===String(id));
      const input=document.getElementById('editVehCompra');
      if(x&&input){
        input.value=formatMoneyValue(+x.c||0);
        input.dataset.originalPrice=String(+x.c||0);
      }
      return result;
    };
  }

  window.saveVehicleEdits=async function(){
    ensurePurchasePriceField();
    const x=(data.veh||[]).find(v=>String(v.id)===String(editingVehicleId));
    if(!x){alert('NO SE ENCONTRÓ EL VEHÍCULO.');return;}

    const marca=(document.getElementById('editVehMarca')?.value||'').trim().toUpperCase();
    const referencia=(document.getElementById('editVehRef')?.value||'').trim().toUpperCase();
    const modelo=(document.getElementById('editVehModelo')?.value||'').trim().toUpperCase();
    const placa=(document.getElementById('editVehPlaca')?.value||'').trim().toUpperCase().replace(/\s+/g,'');
    const compra=parseMoneyValue(document.getElementById('editVehCompra')?.value||'');

    if(!marca||!referencia||!modelo||!placa||compra<=0){
      alert('COMPLETA MARCA, REFERENCIA, MODELO, PLACA Y PRECIO DE COMPRA.');
      return;
    }

    const duplicate=(data.veh||[]).some(v=>
      String(v.id)!==String(x.id) &&
      String(v.pl||'').trim().toUpperCase().replace(/\s+/g,'')===placa
    );
    if(duplicate){
      alert('ERROR: YA EXISTE OTRO VEHÍCULO CON LA PLACA '+placa+'.');
      return;
    }

    const oldPurchase=Number(x.c||0);
    const purchaseChanged=Math.round(compra)!==Math.round(oldPurchase);
    let correctionReason='';

    if(purchaseChanged){
      correctionReason=requestReason('PRECIO DE COMPRA',oldPurchase,compra);
      if(correctionReason===null)return;
      if(!requestPin())return;

      const ok=confirm(
        '⚠️ CONFIRMAR CORRECCIÓN DE PRECIO DE COMPRA\n\n'+
        (x.pl||x.marca||'VEHÍCULO')+'\n'+
        'Anterior: '+money(oldPurchase)+'\n'+
        'Nuevo: '+money(compra)+'\n'+
        'Diferencia: '+money(compra-oldPurchase)+'\n'+
        'Motivo: '+correctionReason+'\n\n'+
        'Se actualizarán inventario, inversión, disponible y el movimiento de compra asociado.\n\n'+
        '¿Deseas continuar?'
      );
      if(!ok)return;
    }

    const btn=document.querySelector('#vehicleEditor .vehicle-editor-actions button:last-child');
    const oldText=btn?btn.textContent:'';
    if(btn){btn.disabled=true;btn.textContent='GUARDANDO...';}

    const originalVehicle=JSON.parse(JSON.stringify(x));
    const purchaseMove=(data.mov||[]).find(m=>m&&m.subtype==='compra_vehiculo'&&String(m.vehicleId||'')===String(x.id));
    const originalPurchaseMove=purchaseMove?JSON.parse(JSON.stringify(purchaseMove)):null;

    try{
      x.marca=x.m=marca;
      x.ref=referencia;
      x.modelo=modelo;
      x.pl=placa;
      x.c=compra;
      x.updatedAt=new Date().toISOString();

      if(purchaseChanged){
        const n=nowInfo();
        x.priceCorrections=Array.isArray(x.priceCorrections)?x.priceCorrections:[];
        x.priceCorrections.unshift({
          id:'pc_purchase_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
          type:'precio_compra',
          oldValue:oldPurchase,
          newValue:compra,
          difference:compra-oldPurchase,
          reason:correctionReason,
          date:n.label,
          createdAt:n.iso,
          authorized:true
        });
        if(purchaseMove){
          purchaseMove.v=compra;
          purchaseMove.correctedAt=n.iso;
          purchaseMove.correctionReason=correctionReason;
        }
      }

      const file=document.getElementById('editVehPhoto')?.files?.[0];
      let saved=false,lastErr=null;

      if(file){
        const attempts=[[900,675,.62],[720,540,.52],[560,420,.44],[420,315,.38]];
        for(const [mw,mh,q] of attempts){
          try{
            x.photo=await optimizeVehiclePhoto(file,mw,mh,q);
            localStorage.setItem(KEY,JSON.stringify(data));
            saved=true;
            break;
          }catch(err){
            lastErr=err;
            console.warn('Reintentando foto con menor tamaño...',err);
          }
        }
      }else{
        try{
          localStorage.setItem(KEY,JSON.stringify(data));
          saved=true;
        }catch(err){lastErr=err;}
      }

      if(!saved){
        x.photo=originalVehicle.photo||'';
        try{
          localStorage.setItem(KEY,JSON.stringify(data));
          saved=true;
        }catch(err){lastErr=err;}
        if(saved&&file){
          alert('LOS DATOS SE GUARDARON, PERO LA FOTO NO PUDO ALMACENARSE. PRUEBA CON UNA IMAGEN MÁS LIVIANA.');
        }
      }

      if(!saved)throw lastErr||new Error('No fue posible guardar los cambios.');

      render();
      programarGuardadoAutomatico();
      closeVehicleEditPanel();
      if(purchaseChanged){
        alert('✅ PRECIO DE COMPRA CORREGIDO Y REGISTRADO EN EL HISTORIAL DE AUDITORÍA.');
      }else{
        success('LOS DATOS INFORMATIVOS DEL VEHÍCULO HAN SIDO ACTUALIZADOS');
      }
    }catch(e){
      Object.keys(x).forEach(k=>delete x[k]);
      Object.assign(x,originalVehicle);
      if(purchaseMove&&originalPurchaseMove){
        Object.keys(purchaseMove).forEach(k=>delete purchaseMove[k]);
        Object.assign(purchaseMove,originalPurchaseMove);
      }
      console.error(e);
      alert('NO FUE POSIBLE GUARDAR LOS CAMBIOS. LOS DATOS ANTERIORES NO FUERON MODIFICADOS.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent=oldText||'💾 GUARDAR CAMBIOS';}
    }
  };

  function saleRows(){
    return (data.sold||[]).map((x,i)=>({x,i}))
      .filter(o=>o.x.status!=='permuta'&&!o.x.permuta)
      .sort((a,b)=>{
        if(typeof saleTimestamp==='function')return saleTimestamp(b.x,b.i)-saleTimestamp(a.x,a.i);
        return b.i-a.i;
      })
      .map(o=>o.x);
  }

  function bindSaleCorrectionButtons(){
    document.querySelectorAll('#soldList [data-secure-sale-id]').forEach(btn=>{
      if(btn.dataset.boundSecurePrice==='1')return;
      btn.dataset.boundSecurePrice='1';
      btn.addEventListener('click',()=>window.correctSalePriceByVehicleId(btn.dataset.secureSaleId));
    });
  }

  window.renderSalesHistory=function(){
    const el=document.getElementById('soldList');
    if(!el)return;
    const sold=saleRows();
    if(!sold.length){
      el.innerHTML='<div class="empty">NO HAY VENTAS REGISTRADAS.</div>';
      return;
    }

    el.innerHTML='<table><thead><tr>'+
      '<th>FECHA</th><th>VEHÍCULO</th><th>PLACA</th><th>VENTA</th><th>GANANCIA</th><th>RECIBIDO</th><th>POR COBRAR</th><th>ACCIÓN</th>'+
      '</tr></thead><tbody>'+
      sold.map(x=>{
        const sale=x.sale||{};
        const gain=(+sale.price||0)-((+x.c||0)+(+x.g||0));
        return '<tr>'+ 
          '<td>'+esc(typeof saleDisplayDate==='function'?saleDisplayDate(x):(sale.dateTime||sale.date||'SIN FECHA'))+'</td>'+ 
          '<td>'+esc(((x.marca||x.m||'')+' '+(x.ref||'')).trim())+'</td>'+ 
          '<td>'+esc(x.pl||'SIN PLACA')+'</td>'+ 
          '<td>'+esc(money(+sale.price||0))+'</td>'+ 
          '<td>'+esc(money(gain))+'</td>'+ 
          '<td>'+esc(money(+sale.received||0))+'</td>'+ 
          '<td>'+esc(money(+sale.pending||0))+'</td>'+ 
          '<td><button type="button" data-secure-sale-id="'+esc(x.id)+'" style="padding:7px 9px;font-size:11px">🔒 CORREGIR</button></td>'+ 
          '</tr>';
      }).join('')+
      '</tbody></table>';

    bindSaleCorrectionButtons();
  };

  window.correctSalePriceByVehicleId=function(id){
    const x=(data.sold||[]).find(v=>String(v.id)===String(id));
    if(!x||!x.sale){alert('NO SE ENCONTRÓ LA VENTA SELECCIONADA.');return false;}

    const sale=x.sale;
    const oldPrice=Number(sale.price||0);
    const raw=prompt(
      'CORREGIR PRECIO DE VENTA\n\n'+
      ((x.marca||x.m||'')+' '+(x.ref||'')+' — '+(x.pl||'SIN PLACA')).trim()+'\n'+
      'Precio actual: '+money(oldPrice)+'\n\n'+
      'Ingresa el nuevo precio de venta:',
      formatMoneyValue(oldPrice)
    );
    if(raw===null)return false;

    const newPrice=parseMoneyValue(raw);
    if(newPrice<=0){alert('INGRESA UN PRECIO DE VENTA VÁLIDO.');return false;}
    if(Math.round(newPrice)===Math.round(oldPrice)){alert('EL NUEVO PRECIO ES IGUAL AL ACTUAL. NO HAY NADA QUE MODIFICAR.');return false;}

    const received=Number(sale.received||0);
    if(newPrice<received){
      alert(
        'NO SE PUEDE DEJAR EL PRECIO DE VENTA POR DEBAJO DEL DINERO YA RECIBIDO.\n\n'+
        'Recibido registrado: '+money(received)+'\n'+
        'Nuevo precio solicitado: '+money(newPrice)+'\n\n'+
        'Primero debe corregirse el valor recibido para mantener la contabilidad consistente.'
      );
      return false;
    }

    const reason=requestReason('PRECIO DE VENTA',oldPrice,newPrice);
    if(reason===null)return false;
    if(!requestPin())return false;

    const newPending=Math.max(0,newPrice-received);
    const ok=confirm(
      '⚠️ CONFIRMAR CORRECCIÓN DE PRECIO DE VENTA\n\n'+
      (x.pl||x.marca||'VEHÍCULO')+'\n'+
      'Anterior: '+money(oldPrice)+'\n'+
      'Nuevo: '+money(newPrice)+'\n'+
      'Dinero recibido se conserva en: '+money(received)+'\n'+
      'Nuevo saldo por cobrar: '+money(newPending)+'\n'+
      'Motivo: '+reason+'\n\n'+
      '¿Deseas continuar?'
    );
    if(!ok)return false;

    const originalSale=JSON.parse(JSON.stringify(sale));
    const commercialSaleId=sale.id||'';
    const receivableIndex=(data.mov||[]).findIndex(m=>
      m&&m.t==='cuenta_por_cobrar'&&(
        (commercialSaleId&&String(m.commercialSaleId||'')===String(commercialSaleId))||
        String(m.saleVehicleId||'')===String(x.id)
      )
    );
    const originalReceivable=receivableIndex>=0?JSON.parse(JSON.stringify(data.mov[receivableIndex])):null;
    let createdReceivableId='';

    try{
      const n=nowInfo();
      sale.price=newPrice;
      sale.pending=newPending;
      sale.updatedAt=n.iso;
      sale.priceCorrections=Array.isArray(sale.priceCorrections)?sale.priceCorrections:[];
      sale.priceCorrections.unshift({
        id:'pc_sale_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        type:'precio_venta',
        oldValue:oldPrice,
        newValue:newPrice,
        difference:newPrice-oldPrice,
        receivedAtCorrection:received,
        pendingAfterCorrection:newPending,
        reason,
        date:n.label,
        createdAt:n.iso,
        authorized:true
      });

      if(newPending>0){
        if(receivableIndex>=0){
          const mov=data.mov[receivableIndex];
          mov.v=newPending;
          mov.correctedAt=n.iso;
          mov.correctionReason=reason;
        }else{
          createdReceivableId='mov_receivable_correction_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
          data.mov.unshift({
            id:createdReceivableId,
            t:'cuenta_por_cobrar',
            c:'SALDO PENDIENTE VENTA '+(x.marca||x.m||'')+' '+(x.ref||'')+(x.pl?' — '+x.pl:''),
            v:newPending,
            vehicleId:'',
            saleVehicleId:x.id,
            commercialSaleId:commercialSaleId,
            date:n.label,
            createdAt:n.iso,
            source:'sale_price_correction'
          });
        }
      }else if(receivableIndex>=0){
        data.mov.splice(receivableIndex,1);
      }

      save();
      try{renderSalesHistory();}catch(e){}
      try{renderSalesReceivables();}catch(e){}
      try{renderCashCapital();}catch(e){}
      try{renderExtractos();}catch(e){}
      try{syncFinancialUiV76();}catch(e){}
      alert('✅ PRECIO DE VENTA CORREGIDO Y REGISTRADO EN EL HISTORIAL DE AUDITORÍA.');
      return true;
    }catch(err){
      Object.keys(sale).forEach(k=>delete sale[k]);
      Object.assign(sale,originalSale);

      if(createdReceivableId){
        const i=(data.mov||[]).findIndex(m=>m.id===createdReceivableId);
        if(i>=0)data.mov.splice(i,1);
      }
      if(originalReceivable){
        const i=(data.mov||[]).findIndex(m=>
          m&&m.t==='cuenta_por_cobrar'&&(
            (commercialSaleId&&String(m.commercialSaleId||'')===String(commercialSaleId))||
            String(m.saleVehicleId||'')===String(x.id)
          )
        );
        if(i>=0)data.mov[i]=originalReceivable;
        else data.mov.unshift(originalReceivable);
      }

      console.error(err);
      alert('NO FUE POSIBLE CORREGIR EL PRECIO DE VENTA. LOS DATOS ANTERIORES FUERON RESTAURADOS.');
      return false;
    }
  };

  // Punto único para futuras integraciones (incluido JAY): la corrección real
  // siempre pasa por la misma validación de clave y auditoría.
  window.SecurePriceCorrection={
    version:'1.0',
    correctSalePriceByVehicleId:window.correctSalePriceByVehicleId,
    ensurePurchasePriceField
  };

  window.addEventListener('load',()=>{
    ensurePurchasePriceField();
    try{renderSalesHistory();}catch(e){}
  });
})();

(function(){
  'use strict';

  const PRICE_CHANGE_PIN='1526';
  const VERSION='2.0';

  function parseMoneyValue(value){
    if(typeof parseFormattedMoney==='function') return parseFormattedMoney(value);
    return Number(String(value||'').replace(/[^0-9]/g,''))||0;
  }
  function formatMoneyValue(value){
    return new Intl.NumberFormat('es-CO').format(Number(value)||0);
  }
  function moneyLabel(value){
    if(typeof money==='function') return money(Number(value)||0);
    return '$ '+formatMoneyValue(value);
  }
  function esc(value){
    return String(value??'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function nowInfo(){
    const d=new Date();
    return {iso:d.toISOString(),label:d.toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'})};
  }
  function persistAndRefresh(){
    if(typeof save==='function') save();
    else {
      localStorage.setItem(KEY,JSON.stringify(data));
      if(typeof render==='function')render();
      if(typeof programarGuardadoAutomatico==='function')programarGuardadoAutomatico();
    }
    try{renderSalesHistory();}catch(e){}
    try{renderSalesReceivables();}catch(e){}
    try{renderCashCapital();}catch(e){}
    try{renderExtractos();}catch(e){}
    try{syncFinancialUiV76();}catch(e){}
    try{renderPriceCorrectionHistory();}catch(e){}
  }
  function requestPin(){
    const pin=prompt('🔒 CAMBIO DE PRECIO PROTEGIDO\n\nIngresa la clave de seguridad para autorizar esta modificación:');
    if(pin===null)return false;
    if(String(pin).trim()!==PRICE_CHANGE_PIN){
      alert('CLAVE INCORRECTA. NO SE MODIFICÓ NINGÚN VALOR.');
      return false;
    }
    return true;
  }
  function requestReason(title,oldValue,newValue){
    const reason=prompt(
      'MOTIVO OBLIGATORIO\n\n'+title+'\n'+
      'Valor anterior: '+moneyLabel(oldValue)+'\n'+
      'Nuevo valor: '+moneyLabel(newValue)+'\n\n'+
      'Escribe el motivo del cambio:'
    );
    if(reason===null)return null;
    const clean=String(reason).trim().toUpperCase();
    if(!clean){alert('DEBES REGISTRAR EL MOTIVO DEL CAMBIO.');return null;}
    return clean;
  }
  function requestChangeType(){
    const raw=prompt(
      'TIPO DE MODIFICACIÓN\n\n'+
      '1 = ERROR DE DIGITACIÓN\n'+
      '2 = MODIFICACIÓN COMERCIAL POSTERIOR\n\n'+
      'Escribe 1 o 2:'
    );
    if(raw===null)return null;
    const v=String(raw).trim();
    if(v==='1')return 'error_digitacion';
    if(v==='2')return 'modificacion_comercial';
    alert('SELECCIONA 1 O 2.');
    return null;
  }
  function requestMethod(label){
    const raw=prompt(
      label+'\n\n1 = EFECTIVO\n2 = TRANSFERENCIA\n\nEscribe 1 o 2:',
      '2'
    );
    if(raw===null)return null;
    if(String(raw).trim()==='1')return 'efectivo';
    if(String(raw).trim()==='2')return 'transferencia';
    alert('SELECCIONA 1 O 2.');
    return null;
  }
  function auditRecord(base){
    const n=nowInfo();
    return Object.assign({
      id:'pc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      date:n.label,createdAt:n.iso,authorized:true,version:VERSION
    },base);
  }
  function pushAudit(target,record){
    target.priceCorrections=Array.isArray(target.priceCorrections)?target.priceCorrections:[];
    target.priceCorrections.unshift(record);
  }
  function addCashMovement({flow,subtype,concept,value,vehicleId='',saleVehicleId='',commercialSaleId='',method='',source=''}){
    if(!(value>0))return '';
    const n=nowInfo();
    const id='mov_price_adj_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    data.mov=data.mov||[];
    data.mov.unshift({
      id,t:flow,subtype,c:concept,v:value,vehicleId,saleVehicleId,commercialSaleId,
      method,date:n.label,createdAt:n.iso,source,nonOperatingExpense:flow==='gasto'
    });
    return id;
  }
  function findSaleIncomeMovement(x){
    const sale=x?.sale||{};
    return (data.mov||[]).find(m=>m&&m.t==='ingreso'&&m.subtype==='venta'&&(
      (sale.id&&String(m.commercialSaleId||'')===String(sale.id))||
      String(m.saleVehicleId||'')===String(x.id)
    ))||null;
  }
  function findReceivableIndex(x){
    const sale=x?.sale||{};
    return (data.mov||[]).findIndex(m=>m&&m.t==='cuenta_por_cobrar'&&(
      (sale.id&&String(m.commercialSaleId||'')===String(sale.id))||
      String(m.saleVehicleId||'')===String(x.id)
    ));
  }
  function syncReceivable(x,pending,reason,source){
    data.mov=data.mov||[];
    const i=findReceivableIndex(x);
    if(pending>0){
      if(i>=0){
        data.mov[i].v=pending;
        data.mov[i].correctedAt=new Date().toISOString();
        data.mov[i].correctionReason=reason;
      }else{
        const n=nowInfo();
        data.mov.unshift({
          id:'mov_receivable_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
          t:'cuenta_por_cobrar',
          c:'SALDO PENDIENTE VENTA '+(x.marca||x.m||'')+' '+(x.ref||'')+(x.pl?' — '+x.pl:''),
          v:pending,vehicleId:'',saleVehicleId:x.id,commercialSaleId:x.sale?.id||'',
          date:n.label,createdAt:n.iso,source
        });
      }
    }else if(i>=0){
      data.mov.splice(i,1);
    }
  }

  function ensurePurchasePriceField(){
    const form=document.querySelector('#vehicleEditor .vehicle-editor-form');
    if(!form || document.getElementById('editVehCompra'))return;
    const input=document.createElement('input');
    input.id='editVehCompra';input.type='text';input.inputMode='numeric';input.setAttribute('data-money','1');
    input.placeholder='PRECIO DE COMPRA';input.autocomplete='off';
    const plate=document.getElementById('editVehPlaca');
    if(plate)plate.insertAdjacentElement('afterend',input);else form.appendChild(input);
    const note=document.createElement('div');
    note.id='editVehCompraSecurityNote';note.className='full';
    note.style.cssText='font-size:11px;color:#d4af37;padding:2px 3px 5px';
    note.textContent='🔒 CAMBIAR EL PRECIO DE COMPRA REQUIERE TIPO DE AJUSTE, MOTIVO, CLAVE Y CONFIRMACIÓN.';
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
      const r=originalOpenVehicleEditPanel.apply(this,arguments);
      setTimeout(renderPriceCorrectionHistory,0);
      return r;
    };
  }
  const originalEditVehicleFromMovements=window.editVehicleFromMovements;
  if(typeof originalEditVehicleFromMovements==='function'){
    window.editVehicleFromMovements=function(id){
      ensurePurchasePriceField();
      const r=originalEditVehicleFromMovements.apply(this,arguments);
      const x=(data.veh||[]).find(v=>String(v.id)===String(id));
      const input=document.getElementById('editVehCompra');
      if(x&&input){input.value=formatMoneyValue(+x.c||0);input.dataset.originalPrice=String(+x.c||0);}
      return r;
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
    if(!marca||!referencia||!modelo||!placa||compra<=0){alert('COMPLETA MARCA, REFERENCIA, MODELO, PLACA Y PRECIO DE COMPRA.');return;}
    const duplicate=(data.veh||[]).some(v=>String(v.id)!==String(x.id)&&String(v.pl||'').trim().toUpperCase().replace(/\s+/g,'')===placa);
    if(duplicate){alert('ERROR: YA EXISTE OTRO VEHÍCULO CON LA PLACA '+placa+'.');return;}

    const oldPurchase=Number(x.c||0);
    const changed=Math.round(compra)!==Math.round(oldPurchase);
    let changeType='',reason='',method='',adjustmentMoveId='';
    if(changed){
      changeType=requestChangeType();if(!changeType)return;
      reason=requestReason('PRECIO DE COMPRA',oldPurchase,compra);if(reason===null)return;
      if(changeType==='modificacion_comercial'){
        method=requestMethod(compra>oldPurchase?'MEDIO DEL PAGO ADICIONAL':'MEDIO EN QUE SE RECIBIÓ LA DEVOLUCIÓN');
        if(!method)return;
      }
      if(!requestPin())return;
      const detail=changeType==='error_digitacion'
        ?'Se corregirá el registro original. No se creará un ingreso ni un gasto nuevo.'
        :'Se conservará la trazabilidad del valor anterior y la diferencia quedará como ajuste comercial separado.';
      if(!confirm(
        '⚠️ CONFIRMAR CAMBIO DE PRECIO DE COMPRA\n\n'+(x.pl||x.marca||'VEHÍCULO')+'\n'+
        'Tipo: '+(changeType==='error_digitacion'?'ERROR DE DIGITACIÓN':'MODIFICACIÓN COMERCIAL POSTERIOR')+'\n'+
        'Anterior: '+moneyLabel(oldPurchase)+'\nNuevo: '+moneyLabel(compra)+'\nDiferencia: '+moneyLabel(compra-oldPurchase)+'\n'+
        'Motivo: '+reason+'\n\n'+detail+'\n\n¿Deseas continuar?'
      ))return;
    }

    const originalVehicle=JSON.parse(JSON.stringify(x));
    const purchaseMove=(data.mov||[]).find(m=>m&&m.subtype==='compra_vehiculo'&&String(m.vehicleId||'')===String(x.id));
    const originalPurchaseMove=purchaseMove?JSON.parse(JSON.stringify(purchaseMove)):null;
    const btn=document.querySelector('#vehicleEditor .vehicle-editor-actions button:last-child');
    const oldText=btn?btn.textContent:'';if(btn){btn.disabled=true;btn.textContent='GUARDANDO...';}

    try{
      x.marca=x.m=marca;x.ref=referencia;x.modelo=modelo;x.pl=placa;x.c=compra;x.updatedAt=new Date().toISOString();
      if(changed){
        const diff=compra-oldPurchase;
        const rec=auditRecord({
          scope:'compra',changeType,oldValue:oldPurchase,newValue:compra,difference:diff,reason,
          vehicleId:x.id,plate:placa,method:method||'',cashEffect:changeType==='modificacion_comercial'?diff:0
        });
        pushAudit(x,rec);
        if(changeType==='error_digitacion'){
          if(purchaseMove){purchaseMove.v=compra;purchaseMove.correctedAt=rec.createdAt;purchaseMove.correctionReason=reason;purchaseMove.correctionType=changeType;}
        }else{
          adjustmentMoveId=addCashMovement({
            flow:diff>0?'gasto':'ingreso',subtype:'ajuste_compra_comercial',
            concept:(diff>0?'AJUSTE ADICIONAL COMPRA — ':'DEVOLUCIÓN AJUSTE COMPRA — ')+(placa||x.marca||'VEHÍCULO'),
            value:Math.abs(diff),vehicleId:x.id,method,source:'purchase_price_commercial_adjustment'
          });
          rec.adjustmentMoveId=adjustmentMoveId;
        }
      }

      const file=document.getElementById('editVehPhoto')?.files?.[0];
      if(file){x.photo=await optimizeVehiclePhoto(file,900,675,.62);}
      localStorage.setItem(KEY,JSON.stringify(data));
      if(typeof render==='function')render();
      if(typeof programarGuardadoAutomatico==='function')programarGuardadoAutomatico();
      if(typeof closeVehicleEditPanel==='function')closeVehicleEditPanel();
      if(changed)alert('✅ PRECIO DE COMPRA ACTUALIZADO CON TRAZABILIDAD CONTABLE.');
      else if(typeof success==='function')success('LOS DATOS INFORMATIVOS DEL VEHÍCULO HAN SIDO ACTUALIZADOS');
    }catch(e){
      Object.keys(x).forEach(k=>delete x[k]);Object.assign(x,originalVehicle);
      if(purchaseMove&&originalPurchaseMove){Object.keys(purchaseMove).forEach(k=>delete purchaseMove[k]);Object.assign(purchaseMove,originalPurchaseMove);}
      if(adjustmentMoveId){const i=(data.mov||[]).findIndex(m=>m.id===adjustmentMoveId);if(i>=0)data.mov.splice(i,1);}
      console.error(e);alert('NO FUE POSIBLE GUARDAR LOS CAMBIOS. LOS DATOS ANTERIORES FUERON RESTAURADOS.');
    }finally{if(btn){btn.disabled=false;btn.textContent=oldText||'💾 GUARDAR CAMBIOS';}}
  };

  function saleRows(){
    return (data.sold||[]).map((x,i)=>({x,i})).filter(o=>o.x.status!=='permuta'&&!o.x.permuta)
      .sort((a,b)=>typeof saleTimestamp==='function'?saleTimestamp(b.x,b.i)-saleTimestamp(a.x,a.i):b.i-a.i).map(o=>o.x);
  }
  function bindSaleCorrectionButtons(){
    document.querySelectorAll('#soldList [data-secure-sale-id]').forEach(btn=>{
      if(btn.dataset.boundSecurePrice==='1')return;btn.dataset.boundSecurePrice='1';
      btn.addEventListener('click',()=>window.correctSalePriceByVehicleId(btn.dataset.secureSaleId));
    });
  }
  window.renderSalesHistory=function(){
    const el=document.getElementById('soldList');if(!el)return;
    const sold=saleRows();
    if(!sold.length){el.innerHTML='<div class="empty">NO HAY VENTAS REGISTRADAS.</div>';return;}
    el.innerHTML='<table><thead><tr><th>FECHA</th><th>VEHÍCULO</th><th>PLACA</th><th>VENTA</th><th>GANANCIA</th><th>RECIBIDO</th><th>POR COBRAR</th><th>ACCIÓN</th></tr></thead><tbody>'+sold.map(x=>{
      const sale=x.sale||{},gain=(+sale.price||0)-((+x.c||0)+(+x.g||0));
      return '<tr><td>'+esc(typeof saleDisplayDate==='function'?saleDisplayDate(x):(sale.dateTime||sale.date||'SIN FECHA'))+'</td>'+ 
        '<td>'+esc(((x.marca||x.m||'')+' '+(x.ref||'')).trim())+'</td><td>'+esc(x.pl||'SIN PLACA')+'</td>'+ 
        '<td>'+esc(moneyLabel(+sale.price||0))+'</td><td>'+esc(moneyLabel(gain))+'</td>'+ 
        '<td>'+esc(moneyLabel(+sale.received||0))+'</td><td>'+esc(moneyLabel(+sale.pending||0))+'</td>'+ 
        '<td><button type="button" data-secure-sale-id="'+esc(x.id)+'" style="padding:7px 9px;font-size:11px">🔒 CORREGIR</button></td></tr>';
    }).join('')+'</tbody></table>';
    bindSaleCorrectionButtons();
  };

  function askActualReceivedForError(x,newPrice){
    const sale=x.sale||{};
    const raw=prompt(
      'DINERO REALMENTE RECIBIDO\n\nPara corregir un error de digitación debemos dejar también el valor recibido real.\n'+
      'Nuevo precio de venta: '+moneyLabel(newPrice)+'\n\nIngresa el total realmente recibido hasta hoy:',
      formatMoneyValue(+sale.received||0)
    );
    if(raw===null)return null;
    const received=parseMoneyValue(raw);
    if(received<0||received>newPrice){alert('EL VALOR RECIBIDO DEBE ESTAR ENTRE $0 Y EL NUEVO PRECIO DE VENTA.');return null;}
    let cash=0,transfer=0;
    const method=sale.method||'efectivo';
    if(method==='mixto'){
      const c=prompt('VENTA MIXTA\n\n¿Cuánto del total recibido corresponde realmente a EFECTIVO?',formatMoneyValue(+sale.cash||0));if(c===null)return null;
      const t=prompt('VENTA MIXTA\n\n¿Cuánto del total recibido corresponde realmente a TRANSFERENCIA?',formatMoneyValue(+sale.transfer||0));if(t===null)return null;
      cash=parseMoneyValue(c);transfer=parseMoneyValue(t);
      if(cash+transfer!==received){alert('EFECTIVO + TRANSFERENCIA DEBE SER IGUAL AL TOTAL REALMENTE RECIBIDO.');return null;}
    }else if(method==='transferencia'){transfer=received;}else{cash=received;}
    return {received,cash,transfer};
  }

  window.correctSalePriceByVehicleId=function(id){
    const x=(data.sold||[]).find(v=>String(v.id)===String(id));
    if(!x||!x.sale){alert('NO SE ENCONTRÓ LA VENTA SELECCIONADA.');return false;}
    const sale=x.sale,oldPrice=Number(sale.price||0);
    const raw=prompt(
      'MODIFICAR PRECIO DE VENTA\n\n'+((x.marca||x.m||'')+' '+(x.ref||'')+' — '+(x.pl||'SIN PLACA')).trim()+'\n'+
      'Precio actual: '+moneyLabel(oldPrice)+'\n\nIngresa el nuevo precio de venta:',formatMoneyValue(oldPrice)
    );
    if(raw===null)return false;
    const newPrice=parseMoneyValue(raw);
    if(newPrice<=0){alert('INGRESA UN PRECIO DE VENTA VÁLIDO.');return false;}
    if(Math.round(newPrice)===Math.round(oldPrice)){alert('EL NUEVO PRECIO ES IGUAL AL ACTUAL.');return false;}

    const changeType=requestChangeType();if(!changeType)return false;
    const reason=requestReason('PRECIO DE VENTA',oldPrice,newPrice);if(reason===null)return false;
    const oldReceived=Number(sale.received||0),oldPending=Number(sale.pending||0);
    let newReceived=oldReceived,newPending=oldPending,newCash=Number(sale.cash||0),newTransfer=Number(sale.transfer||0);
    let extraReceived=0,refund=0,method='',adjustmentMoveId='';

    if(changeType==='error_digitacion'){
      const actual=askActualReceivedForError(x,newPrice);if(!actual)return false;
      newReceived=actual.received;newCash=actual.cash;newTransfer=actual.transfer;newPending=Math.max(0,newPrice-newReceived);
    }else{
      const diff=newPrice-oldPrice;
      if(diff>0){
        const addRaw=prompt(
          'AUMENTO COMERCIAL DE PRECIO\n\nDiferencia adicional: '+moneyLabel(diff)+'\n\n'+
          '¿Cuánto de esa diferencia se recibió AHORA?\nEscribe 0 si quedó por cobrar:',
          '0'
        );
        if(addRaw===null)return false;
        extraReceived=parseMoneyValue(addRaw);
        if(extraReceived<0||extraReceived>diff){alert('EL VALOR RECIBIDO ADICIONAL NO PUEDE SUPERAR LA DIFERENCIA.');return false;}
        if(extraReceived>0){method=requestMethod('MEDIO EN QUE SE RECIBIÓ EL VALOR ADICIONAL');if(!method)return false;}
        newReceived=oldReceived+extraReceived;
        newPending=Math.max(0,newPrice-newReceived);
      }else{
        const reduction=Math.abs(diff);
        const appliedToPending=Math.min(reduction,oldPending);
        refund=Math.max(0,reduction-appliedToPending);
        if(refund>oldReceived){alert('EL AJUSTE EXIGE DEVOLVER MÁS DINERO DEL QUE FIGURA COMO RECIBIDO. REVISA LOS VALORES.');return false;}
        if(refund>0){method=requestMethod('MEDIO EN QUE SE REALIZARÁ LA DEVOLUCIÓN AL CLIENTE');if(!method)return false;}
        newReceived=Math.max(0,oldReceived-refund);
        newPending=Math.max(0,newPrice-newReceived);
      }
    }

    if(!requestPin())return false;
    const typeLabel=changeType==='error_digitacion'?'ERROR DE DIGITACIÓN':'MODIFICACIÓN COMERCIAL POSTERIOR';
    const extraDetail=changeType==='error_digitacion'
      ?'Recibido corregido: '+moneyLabel(newReceived)+'\nNuevo saldo por cobrar: '+moneyLabel(newPending)
      :(newPrice>oldPrice
        ?'Recibido adicional ahora: '+moneyLabel(extraReceived)+'\nNuevo saldo por cobrar: '+moneyLabel(newPending)
        :'Devolución al cliente: '+moneyLabel(refund)+'\nNuevo saldo por cobrar: '+moneyLabel(newPending));
    if(!confirm(
      '⚠️ CONFIRMAR CAMBIO DE PRECIO DE VENTA\n\n'+(x.pl||x.marca||'VEHÍCULO')+'\n'+
      'Tipo: '+typeLabel+'\nAnterior: '+moneyLabel(oldPrice)+'\nNuevo: '+moneyLabel(newPrice)+'\nDiferencia: '+moneyLabel(newPrice-oldPrice)+'\n'+
      extraDetail+'\nMotivo: '+reason+'\n\n¿Deseas continuar?'
    ))return false;

    const originalSale=JSON.parse(JSON.stringify(sale));
    const incomeMove=findSaleIncomeMovement(x),originalIncome=incomeMove?JSON.parse(JSON.stringify(incomeMove)):null;
    const receivableIndex=findReceivableIndex(x),originalReceivable=receivableIndex>=0?JSON.parse(JSON.stringify(data.mov[receivableIndex])):null;

    try{
      const rec=auditRecord({
        scope:'venta',changeType,oldValue:oldPrice,newValue:newPrice,difference:newPrice-oldPrice,reason,
        vehicleId:x.id,plate:x.pl||'',receivedBefore:oldReceived,receivedAfter:newReceived,
        pendingBefore:oldPending,pendingAfter:newPending,extraReceived,refund,method:method||''
      });
      sale.originalPrice=sale.originalPrice??oldPrice;
      sale.price=newPrice;sale.received=newReceived;sale.pending=newPending;sale.updatedAt=rec.createdAt;
      if(changeType==='error_digitacion'){
        sale.cash=newCash;sale.transfer=newTransfer;
        if(incomeMove){
          incomeMove.v=newReceived;incomeMove.cash=newCash;incomeMove.transfer=newTransfer;
          incomeMove.correctedAt=rec.createdAt;incomeMove.correctionReason=reason;incomeMove.correctionType=changeType;
        }else if(newReceived>0){
          adjustmentMoveId=addCashMovement({
            flow:'ingreso',subtype:'venta',concept:'VENTA CORREGIDA '+(x.pl||x.marca||'VEHÍCULO'),value:newReceived,
            saleVehicleId:x.id,commercialSaleId:sale.id||'',method:sale.method||'',source:'sale_digitization_correction'
          });
        }
      }else{
        if(newPrice>oldPrice&&extraReceived>0){
          adjustmentMoveId=addCashMovement({
            flow:'ingreso',subtype:'ajuste_venta_comercial',concept:'AJUSTE COMERCIAL VENTA — '+(x.pl||x.marca||'VEHÍCULO'),
            value:extraReceived,saleVehicleId:x.id,commercialSaleId:sale.id||'',method,source:'sale_price_commercial_adjustment'
          });
        }else if(newPrice<oldPrice&&refund>0){
          adjustmentMoveId=addCashMovement({
            flow:'gasto',subtype:'ajuste_venta_comercial',concept:'DEVOLUCIÓN AJUSTE COMERCIAL VENTA — '+(x.pl||x.marca||'VEHÍCULO'),
            value:refund,saleVehicleId:x.id,commercialSaleId:sale.id||'',method,source:'sale_price_commercial_adjustment'
          });
        }
        rec.adjustmentMoveId=adjustmentMoveId;
      }
      pushAudit(sale,rec);
      syncReceivable(x,newPending,reason,changeType==='error_digitacion'?'sale_digitization_correction':'sale_price_commercial_adjustment');
      persistAndRefresh();
      alert('✅ PRECIO DE VENTA ACTUALIZADO CON TRAZABILIDAD CONTABLE.');
      return true;
    }catch(err){
      Object.keys(sale).forEach(k=>delete sale[k]);Object.assign(sale,originalSale);
      if(incomeMove&&originalIncome){Object.keys(incomeMove).forEach(k=>delete incomeMove[k]);Object.assign(incomeMove,originalIncome);}
      if(adjustmentMoveId){const i=(data.mov||[]).findIndex(m=>m.id===adjustmentMoveId);if(i>=0)data.mov.splice(i,1);}
      const currentReceivable=findReceivableIndex(x);
      if(originalReceivable){if(currentReceivable>=0)data.mov[currentReceivable]=originalReceivable;else data.mov.unshift(originalReceivable);}
      else if(currentReceivable>=0)data.mov.splice(currentReceivable,1);
      console.error(err);alert('NO FUE POSIBLE APLICAR EL CAMBIO. LOS DATOS ANTERIORES FUERON RESTAURADOS.');
      return false;
    }
  };

  function allCorrectionRows(){
    const rows=[];
    (data.veh||[]).forEach(v=>(v.priceCorrections||[]).forEach(r=>rows.push({...r,vehicle:(v.pl||'SIN PLACA')+' — '+(v.marca||v.m||'')+' '+(v.ref||'')})));
    (data.sold||[]).forEach(v=>(v.sale?.priceCorrections||[]).forEach(r=>rows.push({...r,vehicle:(v.pl||'SIN PLACA')+' — '+(v.marca||v.m||'')+' '+(v.ref||'')})));
    return rows.sort((a,b)=>(Date.parse(b.createdAt||'')||0)-(Date.parse(a.createdAt||'')||0));
  }
  function ensureHistoryBox(){
    const panel=document.getElementById('vehicleEditPanel');if(!panel||document.getElementById('priceCorrectionHistoryBox'))return;
    const box=document.createElement('div');box.id='priceCorrectionHistoryBox';box.style.cssText='margin-top:18px;padding:14px;border:1px solid #5b4b20;border-radius:12px;background:#0f0f0f';
    box.innerHTML='<h3 style="margin:0 0 10px;color:#d4af37">🧾 HISTORIAL DE CORRECCIONES DE PRECIOS</h3><div id="priceCorrectionHistoryList"></div>';
    panel.appendChild(box);
  }
  window.renderPriceCorrectionHistory=function(){
    ensureHistoryBox();
    const el=document.getElementById('priceCorrectionHistoryList');if(!el)return;
    const rows=allCorrectionRows();
    if(!rows.length){el.innerHTML='<div class="empty">NO HAY CORRECCIONES DE PRECIOS REGISTRADAS.</div>';return;}
    el.innerHTML='<table><thead><tr><th>FECHA</th><th>VEHÍCULO</th><th>ÁREA</th><th>TIPO</th><th>ANTERIOR</th><th>NUEVO</th><th>DIFERENCIA</th><th>MOTIVO</th></tr></thead><tbody>'+rows.map(r=>
      '<tr><td>'+esc(r.date||'')+'</td><td>'+esc(r.vehicle||'')+'</td><td>'+esc(String(r.scope||'').toUpperCase())+'</td>'+ 
      '<td>'+esc(r.changeType==='error_digitacion'?'ERROR DIGITACIÓN':'MODIFICACIÓN COMERCIAL')+'</td>'+ 
      '<td>'+esc(moneyLabel(r.oldValue))+'</td><td>'+esc(moneyLabel(r.newValue))+'</td><td>'+esc(moneyLabel(r.difference))+'</td><td>'+esc(r.reason||'')+'</td></tr>'
    ).join('')+'</tbody></table>';
  };

  window.SecurePriceCorrection={version:VERSION,correctSalePriceByVehicleId:window.correctSalePriceByVehicleId,ensurePurchasePriceField,renderHistory:renderPriceCorrectionHistory};
  window.addEventListener('load',()=>{ensurePurchasePriceField();try{renderSalesHistory();}catch(e){}try{renderPriceCorrectionHistory();}catch(e){}});
})();

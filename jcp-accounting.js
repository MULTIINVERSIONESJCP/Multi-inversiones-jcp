/* Motor contable JCP. Funciones puras: no guarda ni corrige los datos de origen. */
(function(root){
  'use strict';
  const ACCOUNTS={cash:'110505',bancolombia:'111005',davivienda:'111010',daviplata:'111015',nequi:'111020'};
  const TOLERANCE=0.5;
  const chart=()=>({
    '110505':{name:'CAJA / EFECTIVO',type:'asset',group:'ACTIVOS'},
    '111005':{name:'BANCOLOMBIA',type:'asset',group:'ACTIVOS'},
    '111010':{name:'DAVIVIENDA',type:'asset',group:'ACTIVOS'},
    '111015':{name:'DAVIPLATA',type:'asset',group:'ACTIVOS'},
    '111020':{name:'NEQUI',type:'asset',group:'ACTIVOS'},
    '119999':{name:'DISPONIBLE SIN CUENTA IDENTIFICADA',type:'asset',group:'ACTIVOS'},
    '130505':{name:'CUENTAS POR COBRAR — VENTAS Y PERMUTAS',type:'asset',group:'ACTIVOS'},
    '130510':{name:'PRÉSTAMOS POR COBRAR',type:'asset',group:'ACTIVOS'},
    '143505':{name:'INVENTARIO DE VEHÍCULOS',type:'asset',group:'ACTIVOS'},
    '149005':{name:'OTRAS INVERSIONES',type:'asset',group:'ACTIVOS'},
    '210505':{name:'OBLIGACIONES FINANCIERAS',type:'liability',group:'PASIVOS'},
    '310505':{name:'CAPITAL Y APORTES',type:'equity',group:'PATRIMONIO'},
    '360505':{name:'UTILIDADES RETIRADAS',type:'withdrawal',group:'PATRIMONIO'},
    '413505':{name:'INGRESOS POR VENTA DE VEHÍCULOS',type:'income',group:'INGRESOS'},
    '421005':{name:'OTROS INGRESOS',type:'income',group:'INGRESOS'},
    '510505':{name:'GASTOS OPERACIONALES',type:'expense',group:'GASTOS'},
    '519505':{name:'OTROS GASTOS Y AJUSTES',type:'expense',group:'GASTOS'},
    '613505':{name:'COSTO DE VENTA DE VEHÍCULOS',type:'expense',group:'COSTOS'}
  });
  const list=x=>Array.isArray(x)?x:[];
  const num=x=>Number(x??0);
  function stamp(x){
    const raw=x?.createdAt||x?.dateTime||x?.date||'';
    const iso=Date.parse(raw);
    if(Number.isFinite(iso))return iso;
    if(typeof root.parseJcpDateTime==='function'){
      const t=root.parseJcpDateTime(raw);if(Number.isFinite(t))return t;
    }
    return 0;
  }
  function line(code,debit=0,credit=0,note=''){
    return {code,...(chart()[code]||{name:code,type:'other',group:'OTROS'}),debit:num(debit),credit:num(credit),note};
  }
  function treasuryRows(state){
    const rows=list(state.treasuryMovements);
    const reversed=new Set(rows.filter(x=>x.isReversal&&x.reversalOf).map(x=>String(x.reversalOf)));
    // Una anulación conserva el original y su contrapartida; no cuenta solo el reverso.
    return rows.filter(x=>!x.voided||reversed.has(String(x.id)));
  }
  function treasuryBalance(state,id,to=Infinity,from=-Infinity){
    return treasuryRows(state).filter(x=>x.accountId===id&&stamp(x)<=to&&stamp(x)>=from)
      .reduce((s,x)=>s+(x.direction==='in'?1:-1)*num(x.amount),0);
  }
  function balances(entries){
    const rows=Object.fromEntries(Object.entries(chart()).map(([code,a])=>[code,{code,...a,debit:0,credit:0,movements:0}]));
    entries.forEach(e=>e.lines.forEach(l=>{
      const r=rows[l.code];r.debit+=l.debit;r.credit+=l.credit;r.movements++;
    }));
    return Object.values(rows).map(r=>({...r,raw:r.debit-r.credit,balance:['liability','equity','income'].includes(r.type)?r.credit-r.debit:r.debit-r.credit}));
  }
  function buildReport(state={},range={}){
    const entries=[],issues=[],used=new Set(),treasury=treasuryRows(state);
    const from=range.fromTs??-Infinity,to=range.toTs??Infinity;
    const issue=(code,meta,detail,value=0,severity='critical')=>issues.push({code,id:String(meta.id||code),concept:meta.concept||'MOVIMIENTO',timestamp:meta.timestamp??stamp(meta),detail,value,severity});
    const meta=(x,id,concept,extra={})=>({id,date:x.date||'APERTURA / SIN FECHA',createdAt:x.createdAt||'',timestamp:stamp(x),concept:concept||x.c||x.concept||'MOVIMIENTO',source:x.source||x.subtype||'operacion',cashClass:'operating',...extra});
    function push(m,lines){
      const invalid=lines.some(l=>!chart()[l.code]||!Number.isFinite(l.debit)||!Number.isFinite(l.credit)||l.debit<0||l.credit<0||(l.debit>0&&l.credit>0));
      if(invalid){issue('INVALID_ENTRY',m,'El asiento contiene una cuenta o un importe inválido.');return;}
      lines=lines.filter(l=>l.debit>0||l.credit>0);
      if(!lines.length)return;
      const debit=lines.reduce((s,l)=>s+l.debit,0),credit=lines.reduce((s,l)=>s+l.credit,0);
      if(Math.abs(debit-credit)>TOLERANCE){issue('UNBALANCED_ENTRY',m,'Débitos '+debit+'; créditos '+credit+'. Asiento rechazado; operación original conservada.',Math.abs(debit-credit));return;}
      entries.push({...m,lines,debit,credit});
    }
    function moneyLines(m,amount,direction,source={},refs=[]){
      if(amount===0)return [];
      const opIds=new Set([source.id,source.capitalOpId,source.expenseOperationId,...refs].filter(Boolean).map(String));
      const number=source.receiptNumber||source.purchaseReceiptNumber||'';
      let matches=treasury.filter(t=>!used.has(String(t.id))&&!!t.isReversal===!!m.isReversal&&t.direction===direction&&opIds.has(String(t.operationId)));
      if(!matches.length&&number)matches=treasury.filter(t=>!used.has(String(t.id))&&!!t.isReversal===!!m.isReversal&&t.direction===direction&&t.receiptNumber===number);
      const total=matches.reduce((s,t)=>s+num(t.amount),0);
      if(matches.length&&Math.abs(total-amount)<=TOLERANCE&&matches.every(t=>ACCOUNTS[t.accountId]&&Number.isFinite(num(t.amount))&&num(t.amount)>0)){
        matches.forEach(t=>used.add(String(t.id)));
        return matches.map(t=>line(ACCOUNTS[t.accountId],direction==='in'?num(t.amount):0,direction==='out'?num(t.amount):0,t.id));
      }
      // Distribución explícita: nunca se infiere un banco a partir del saldo.
      const dist=source.paymentDistribution;
      if(dist&&typeof dist==='object'){
        const parts=Object.entries(dist).filter(([,v])=>num(v)!==0);
        if(parts.every(([a,v])=>ACCOUNTS[a]&&Number.isFinite(num(v))&&num(v)>0)&&Math.abs(parts.reduce((s,[,v])=>s+num(v),0)-amount)<=TOLERANCE){
          return parts.map(([a,v])=>line(ACCOUNTS[a],direction==='in'?num(v):0,direction==='out'?num(v):0));
        }
      }
      issue('UNKNOWN_CASH_ACCOUNT',m,'No se pudo identificar una distribución completa y única por cuenta. Importe pendiente de conciliación: '+amount,amount,'warning');
      return [line('119999',direction==='in'?amount:0,direction==='out'?amount:0)];
    }
    const purchaseIds=new Set(),expenseByVehicle={},groups=new Map();
    // Los ítems de un mismo gasto comparten una distribución TOTAL: contabilizarla una sola vez.
    list(state.mov).forEach((m,i)=>{
      const key=m.subtype==='vehiculos'||m.subtype==='reverso_gasto_vehiculo'?
        [m.subtype,m.vehicleId,m.expenseOperationId||m.receiptNumber||m.id||i,m.isReversal?'R':'O'].join('|'):'mov|'+i;
      if(!groups.has(key))groups.set(key,{...m,_refs:[],_sum:0,_index:i});
      const g=groups.get(key);g._sum+=num(m.v);g._refs.push(m.id,m.expenseOperationId,m.capitalOpId,m.reversalOf);
    });
    for(const m of groups.values()){
      const sub=String(m.subtype||'').toLowerCase(),value=m._sum;
      if(['venta','permuta_diferencia','ajuste_venta_comercial','reverso_venta','reverso_cuenta_por_cobrar'].includes(sub)||m.t==='cuenta_por_cobrar')continue;
      const a=meta(m,'acc_'+(m.id||m._index),m.c,{isReversal:!!m.isReversal});
      if(!Number.isFinite(value)||value<0){issue('INVALID_MOVEMENT',a,'Importe de movimiento inválido.');continue;}
      if(value===0)continue;
      let code,dir=m.t==='ingreso'?'in':'out';
      if(['capital_inicial','aporte_capital'].includes(sub)){code='310505';a.cashClass='financing';}
      else if(['credito','prestamo_recibido','tarjeta_credito','pago_deuda'].includes(sub)){code='210505';a.cashClass='financing';}
      else if(['compra_vehiculo','vehiculos','ajuste_compra_comercial','reverso_compra_vehiculo','reverso_gasto_vehiculo'].includes(sub)){
        code='143505';a.cashClass='investing';
        if(sub==='compra_vehiculo')purchaseIds.add(String(m.vehicleId));
        if(sub==='vehiculos')expenseByVehicle[m.vehicleId]=(expenseByVehicle[m.vehicleId]||0)+value;
      }else if(['gasto_operativo','varios','reverso_gasto_operativo'].includes(sub))code='510505';
      else if(sub==='retiro_ganancias'){code='360505';a.cashClass='financing';}
      else if(m.t==='ingreso')code='421005';
      else if(m.t==='gasto')code='519505';
      else{issue('UNSUPPORTED_MOVEMENT',a,'Movimiento sin regla contable.',value,'warning');continue;}
      const cash=moneyLines(a,value,dir,m,m._refs);
      push(a,[...cash,line(code,dir==='out'?value:0,dir==='in'?value:0)]);
    }
    const incoming=new Set(list(state.permutas).map(p=>String(p.incomingVehicleId||p.incomingVehicle?.id||''))),seen=new Set();
    for(const v of [...list(state.veh),...list(state.sold)]){
      const id=String(v.id||'');if(!id||seen.has(id))continue;seen.add(id);
      if(num(v.c)>0&&!purchaseIds.has(id)&&!incoming.has(id)){
        const a=meta({},'acc_open_veh_'+id,'SALDO DE APERTURA VEHÍCULO '+(v.pl||id),{cashClass:'investing'});
        push(a,[line('143505',v.c),...moneyLines(a,num(v.c),'out',v)]);
      }
      const diff=Math.max(0,num(v.g)-(expenseByVehicle[id]||0));
      if(diff>0){const a=meta({},'acc_open_exp_'+id,'GASTOS HISTÓRICOS '+(v.pl||id),{cashClass:'investing'});push(a,[line('143505',diff),...moneyLines(a,diff,'out')]);}
    }
    for(const v of list(state.sold).filter(x=>x&&x.status!=='permuta'&&!x.permuta&&x.sale)){
      const s=v.sale,price=num(s.price),received=num(s.received),pending=s.pending===undefined?price-received:num(s.pending),cost=num(v.c)+num(v.g);
      const a=meta(s,'acc_sale_'+(s.id||v.id),'VENTA '+(v.pl||''),{source:'vehicle_sale'});
      const cash=moneyLines(a,received,'in',s,[v.id]);
      push(a,[...cash,line('130505',pending),line('413505',0,price)]);
      if(cost>=0){
        push({...a,id:a.id+'_cost',concept:'COSTO '+a.concept},[line('613505',cost),line('143505',0,cost)]);
      }else{
        // Una cadena de permuta puede dejar un saldo de inversión negativo.
        // Al vender el último vehículo se cancela ese saldo acreedor de inventario
        // y se reconoce como resultado únicamente en ese momento.
        push({...a,id:a.id+'_trade_result',concept:'RESULTADO DIFERIDO '+a.concept},[line('143505',Math.abs(cost)),line('421005',0,Math.abs(cost))]);
      }
      if(s.voided){
        const r=meta({createdAt:s.voidedAt,date:s.voidedAt},a.id+'_void','REVERSIÓN '+a.concept,{isReversal:true});
        push(r,[line('413505',price),...moneyLines(r,received,'out',s,[v.id]),line('130505',0,pending)]);
        if(cost>=0)push({...r,id:r.id+'_cost'},[line('143505',cost),line('613505',0,cost)]);
        else push({...r,id:r.id+'_trade_result'},[line('421005',Math.abs(cost)),line('143505',0,Math.abs(cost))]);
      }
    }
    for(const [i,p] of list(state.permutas).entries()){
      const a=meta(p,'acc_perm_'+(p.id||i),'PERMUTA '+(p.outgoingVehicle?.pl||'')+' → '+(p.incomingVehicle?.pl||''),{cashClass:'investing'});
      const incomingCost=num(p.incomingInventoryCost),outgoingCost=num(p.outgoingInvestment),difference=num(p.difference);
      const pending=Math.max(0,num(p.pending));
      const received=p.received===undefined?Math.max(0,difference-pending):Math.max(0,num(p.received));
      const lines=[
        incomingCost>=0?line('143505',incomingCost):line('143505',0,Math.abs(incomingCost)),
        line('143505',0,outgoingCost)
      ];
      if(difference>0&&p.differenceDirection==='receive'){
        if(received>0)lines.push(...moneyLines(a,received,'in',p));
        if(pending>0)lines.push(line('130505',pending,0,'SALDO PENDIENTE DE PERMUTA'));
      }else if(difference>0&&p.differenceDirection==='pay'){
        lines.push(...moneyLines(a,difference,'out',p));
      }
      push(a,lines);
    }
    for(const [i,p] of list(state.pres).entries()){
      const a=meta(p,'acc_loan_'+(p.id||i),'PRÉSTAMO — '+(p.n||''),{cashClass:'investing'});
      push(a,[line('130510',p.c),...moneyLines(a,num(p.c),'out',p)]);
      if(num(p.p)>0){const r={...a,id:a.id+'_paid',concept:'PAGOS '+a.concept};push(r,[...moneyLines(r,num(p.p),'in',{id:p.id}),line('130510',0,p.p)]);}
    }
    for(const [i,p] of list(state.inv).entries()){
      const a=meta(p,'acc_inv_'+(p.id||i),'INVERSIÓN — '+(p.n||''),{cashClass:'investing'});push(a,[line('149005',p.c),...moneyLines(a,num(p.c),'out',p)]);
    }
    const transfers=new Map();
    for(const t of treasury){
      if(t.linkedTransferId){if(!transfers.has(t.linkedTransferId))transfers.set(t.linkedTransferId,[]);transfers.get(t.linkedTransferId).push(t);}
    }
    for(const [id,rows] of transfers){
      const a=meta(rows[0],'acc_transfer_'+id,'TRANSFERENCIA ENTRE CUENTAS',{cashClass:'internal'});
      if(rows.length!==2||new Set(rows.map(t=>t.accountId)).size!==2||!rows.some(t=>t.direction==='in')||!rows.some(t=>t.direction==='out')){issue('INVALID_TRANSFER',a,'La transferencia no tiene dos contrapartidas válidas.');continue;}
      push(a,rows.map(t=>line(ACCOUNTS[t.accountId]||'INVALID',t.direction==='in'?t.amount:0,t.direction==='out'?t.amount:0)));
      rows.forEach(t=>used.add(String(t.id)));
    }
    for(const t of treasury){
      if(!used.has(String(t.id)))issue('UNMATCHED_TREASURY',meta(t,'tm_'+t.id,t.concept),'Movimiento de tesorería sin asiento vinculado. Cuenta: '+t.accountId,num(t.amount),'warning');
    }
    entries.sort((a,b)=>a.timestamp-b.timestamp||a.id.localeCompare(b.id));
    const selected=entries.filter(e=>e.timestamp>=from&&e.timestamp<=to);
    const selectedIssues=issues.filter(e=>e.timestamp===0||e.timestamp>=from&&e.timestamp<=to);
    const totals=balances(selected);
    const reconciliation=Object.entries(ACCOUNTS).map(([accountId,code])=>{
      const ledger=totals.find(r=>r.code===code).balance,treasuryAmount=treasuryBalance(state,accountId,to,from);
      return {accountId,code,name:chart()[code].name,ledger,treasury:treasuryAmount,difference:ledger-treasuryAmount};
    });
    for(const r of reconciliation)if(!Number.isFinite(r.difference)||Math.abs(r.difference)>TOLERANCE)selectedIssues.push({code:'TREASURY_DIFFERENCE',id:r.accountId,concept:r.name,severity:'warning',detail:'Contabilidad '+r.ledger+'; tesorería '+r.treasury+'; diferencia '+r.difference,value:Math.abs(r.difference)});
    return {entries:selected,issues:selectedIssues,reconciliation,complete:selectedIssues.length===0};
  }
  const api={ACCOUNTS,TOLERANCE,chart,balances,buildReport,treasuryRows,treasuryBalance,stamp};
  root.JcpAccounting=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);

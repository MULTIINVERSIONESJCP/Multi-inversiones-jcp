(function () {
  'use strict';

  let pc = null;
  let dc = null;
  let micStream = null;
  let remoteAudio = null;
  let active = false;
  let connecting = false;
  let pendingOperation = null;
  let lastUserTranscript = '';
  let lastUserTranscriptAt = 0;

  const processedCalls = new Set();

  function setStatus(title, detail, state) {
    const t = document.getElementById('jcpVoiceStatus');
    const x = document.getElementById('jcpVoiceTranscript');
    const d = document.getElementById('jcpVoiceStatusDot');

    if (t) t.textContent = title;
    if (x) x.textContent = detail || '';

    if (d) {
      d.classList.remove('listening', 'error');
      if (state) d.classList.add(state);
    }
  }

  function cleanup() {
    active = false;
    connecting = false;
    processedCalls.clear();

    if (dc) {
      try {
        dc.close();
      } catch (e) {}
      dc = null;
    }

    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      pc = null;
    }

    if (micStream) {
      micStream
        .getTracks()
        .forEach(track => track.stop());

      micStream = null;
    }

    if (remoteAudio) {
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }
  }

  function stopJayAI() {
    cleanup();

    setStatus(
      'JAY IA EN ESPERA',
      'Toca el micrófono para volver a conversar.'
    );
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  function numberValue(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value)
        ? value
        : 0;
    }

    const text =
      String(value || '')
        .replace(/[^0-9.-]/g, '');

    const n = Number(text);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function moneyInput(value) {
    const n =
      Math.round(
        numberValue(value)
      );

    return n > 0
      ? new Intl.NumberFormat('es-CO')
          .format(n)
      : '';
  }

  function setValue(
    id,
    value,
    eventName
  ) {
    const el =
      document.getElementById(id);

    if (!el) {
      return false;
    }

    el.value =
      value == null
        ? ''
        : String(value);

    try {
      el.dispatchEvent(
        new Event(
          eventName || 'input',
          {
            bubbles: true
          }
        )
      );

      el.dispatchEvent(
        new Event(
          'change',
          {
            bubbles: true
          }
        )
      );
    } catch (e) {}

    return true;
  }

  function getDeviceContext() {
    const now =
      new Date();

    let timeZone =
      'UTC';

    try {
      timeZone =
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone ||
        'UTC';
    } catch (e) {}

    const locale =
      navigator.language ||
      'es-CO';

    let localDateTime =
      '';

    try {
      localDateTime =
        now.toLocaleString(
          locale,
          {
            timeZone:
              timeZone,

            dateStyle:
              'short',

            timeStyle:
              'medium'
          }
        );
    } catch (e) {
      localDateTime =
        now.toString();
    }

    return {
      ok: true,

      timeZone:
        timeZone,

      locale:
        locale,

      localDateTime:
        localDateTime,

      iso:
        now.toISOString(),

      offsetMinutes:
        -now.getTimezoneOffset()
    };
  }

  function getAppData() {
    try {
      if (
        typeof data !==
          'undefined' &&
        data
      ) {
        return data;
      }
    } catch (e) {}

    try {
      return JSON.parse(
        localStorage.getItem(
          'jcp_app_v1'
        ) ||
        '{}'
      );
    } catch (e) {
      return {};
    }
  }

  function vehicleRows(query) {
    const app =
      getAppData();

    const rows =
      Array.isArray(app.veh)
        ? app.veh.filter(Boolean)
        : [];

    const q =
      normalizeText(query);

    const filtered =
      q
        ? rows.filter(v => {

            const haystack =
              normalizeText(
                [
                  v.pl,
                  v.placa,
                  v.marca,
                  v.m,
                  v.ref,
                  v.referencia,
                  v.modelo
                ]
                  .filter(Boolean)
                  .join(' ')
              );

            return q
              .split(/\s+/)
              .filter(Boolean)
              .every(
                term =>
                  haystack
                    .includes(term)
              );
          })
        : rows;

    return filtered.map(
      v => ({
        id:
          String(
            v.id || ''
          ),

        placa:
          String(
            v.pl ||
            v.placa ||
            ''
          )
            .toUpperCase(),

        marca:
          String(
            v.marca ||
            v.m ||
            ''
          )
            .toUpperCase(),

        referencia:
          String(
            v.ref ||
            v.referencia ||
            ''
          )
            .toUpperCase(),

        modelo:
          String(
            v.modelo ||
            ''
          ),

        precio_compra:
          Number(
            v.c || 0
          ),

        gastos_asociados:
          Number(
            v.g || 0
          ),

        inversion_total:
          Number(
            v.c || 0
          ) +
          Number(
            v.g || 0
          )
      })
    );
  }

  function resolveVehicle(query) {
    const rows =
      vehicleRows(query);

    if (!rows.length) {
      return {
        ok: false,

        error:
          'No encontré ese vehículo en el inventario.'
      };
    }

    if (
      rows.length >
      1
    ) {
      return {
        ok: false,

        ambiguo:
          true,

        coincidencias:
          rows.slice(
            0,
            8
          ),

        error:
          'Hay varias coincidencias. Debes identificar el vehículo con mayor precisión.'
      };
    }

    const app =
      getAppData();

    const original =
      Array.isArray(
        app.veh
      )
        ? app.veh.find(
            v =>
              String(
                v.id
              ) ===
              String(
                rows[0].id
              )
          )
        : null;

    return {
      ok: true,

      vehicle:
        rows[0],

      original:
        original
    };
  }

  function getFinancialSummary() {
    let f =
      null;

    try {
      if (
        typeof
          getFinancialSnapshotV75 ===
        'function'
      ) {
        f =
          getFinancialSnapshotV75();
      }
    } catch (e) {
      console.error(
        'JAY resumen financiero:',
        e
      );
    }

    if (!f) {
      return {
        ok: false,

        error:
          'La aplicación no pudo calcular el resumen financiero.'
      };
    }

    const n =
      value =>
        Number(
          value || 0
        );

    const app =
      getAppData();

    return {
      ok: true,

      capital_inicial:
        n(f.initial),

      aportes:
        n(
          f.contributions
        ),

      capital_actual:
        n(f.capital),

      financiacion_recibida:
        n(
          f.financing
        ),

      deuda_pagada:
        n(f.debtPaid),

      deuda_pendiente:
        n(f.debt),

      inversion_vehiculos:
        n(
          f.vehicleInvestment
        ),

      otras_inversiones:
        n(
          f.otherInvestment
        ),

      total_invertido:
        n(f.invested),

      por_cobrar_prestamos:
        n(
          f.loanReceivable
        ),

      por_cobrar_ventas:
        n(
          f.saleReceivable
        ),

      utilidad_bruta:
        n(
          f.grossProfit
        ),

      utilidad_acumulada:
        n(
          f.accumulatedProfit
        ),

      gastos_operativos:
        n(
          f.operatingExpenses
        ),

      utilidad_neta:
        n(
          f.netProfit
        ),

      utilidad_disponible:
        n(
          f.profitAvailable
        ),

      disponible:
        n(f.available),

      vehiculos_en_inventario:
        Array.isArray(
          app.veh
        )
          ? app.veh.length
          : 0,

      ventas_registradas:
        Array.isArray(
          app.sold
        )
          ? app.sold.length
          : 0,

      permutas_registradas:
        Array.isArray(
          app.permutas
        )
          ? app.permutas.length
          : 0,

      prestamos_registrados:
        Array.isArray(
          app.pres
        )
          ? app.pres.length
          : 0
    };
  }

  function openModule(
    moduleName
  ) {
    const module =
      String(
        moduleName || ''
      )
        .toLowerCase();

    try {
      switch (module) {

        case 'inicio':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'dashboard'
            );
          }

          break;

        case 'vehiculos':

          if (
            typeof
              openVehiclesHub ===
            'function'
          ) {
            openVehiclesHub();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'vehiculos'
            );
          }

          break;

        case 'operaciones':

          if (
            typeof
              openOperationsHub ===
            'function'
          ) {
            openOperationsHub();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'ventas'
            );
          }

          break;

        case 'ventas':

          if (
            typeof
              openOperationsSales ===
            'function'
          ) {
            openOperationsSales();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'ventas'
            );
          }

          break;

        case 'compras':

          if (
            typeof
              openOperationsPurchase ===
            'function'
          ) {
            openOperationsPurchase();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'vehiculos'
            );
          }

          break;

        case 'gastos':

          if (
            typeof
              openOperationsExpenses ===
            'function'
          ) {
            openOperationsExpenses();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'ventas'
            );
          }

          break;

        case 'finanzas':

          if (
            typeof
              openMainNavigation ===
            'function'
          ) {
            openMainNavigation(
              'cajaCapital'
            );
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'cajaCapital'
            );
          }

          break;

        case 'capital':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'detalleCapital'
            );
          }

          break;

        case 'capital_financiacion':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'capitalFinanciacion'
            );
          }

          break;

        case 'prestamos':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'prestamos'
            );
          }

          break;

        case 'clientes':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'clientes'
            );
          }

          break;

        case 'soportes':

          if (
            typeof
              openSupportsModule ===
            'function'
          ) {
            openSupportsModule();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'soportes'
            );
          }

          break;

        case 'extractos':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'extractos'
            );
          }

          break;

        case 'cartera':

          if (
            typeof
              openSalesReceivables ===
            'function'
          ) {
            openSalesReceivables();
          } else if (
            typeof show ===
            'function'
          ) {
            show(
              'carteraCaja'
            );
          }

          break;

        case 'cierre_caja':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'cierreCaja'
            );
          }

          break;

        case 'historial_financiero':

          if (
            typeof show ===
            'function'
          ) {
            show(
              'historialFinanciero'
            );
          }

          break;

        default:

          return {
            ok: false,

            error:
              'Módulo no reconocido: ' +
              module
          };
      }

      return {
        ok: true,

        modulo:
          module,

        abierto:
          true
      };

    } catch (error) {

      return {
        ok: false,

        modulo:
          module,

        error:
          error.message ||
          'No fue posible abrir el módulo.'
      };
    }
  }

  function openVehicle(query) {
    const resolved =
      resolveVehicle(
        query
      );

    if (
      !resolved.ok
    ) {
      return resolved;
    }

    const realId =
      resolved.original
        ? resolved.original.id
        : resolved.vehicle.id;

    try {

      if (
        typeof
          openVehiclesHub ===
        'function'
      ) {
        openVehiclesHub();
      } else if (
        typeof show ===
        'function'
      ) {
        show(
          'vehiculos'
        );
      }

      setTimeout(
        () => {
          try {

            if (
              typeof
                openVehicleDetail ===
              'function'
            ) {
              openVehicleDetail(
                realId
              );
            }

          } catch (e) {}
        },
        80
      );

      return {
        ok: true,

        abierto:
          true,

        vehiculo:
          resolved.vehicle
      };

    } catch (error) {

      return {
        ok: false,

        error:
          error.message ||
          'No fue posible abrir el vehículo.'
      };
    }
  }

  function buildSupervisorSnapshot(operation) {
  const tipo = String(operation?.tipo || '').toLowerCase();

  const snapshot = {
    financiero: getFinancialSummary(),
    operacion: operation
  };

  if (
    tipo === 'venta' ||
    tipo === 'gasto_vehiculo' ||
    tipo === 'permuta' ||
    tipo === 'compra_vehiculo'
  ) {
    snapshot.inventario = vehicleRows('').slice(0, 80);
  } else {
    snapshot.inventario = [];
  }

  return snapshot;
}
    const app =
      getAppData();

    return {
      financiero:
        getFinancialSummary(),

      inventario:
        vehicleRows('')
          .slice(
            0,
            80
          ),

      movimientos_recientes:
        Array.isArray(
          app.mov
        )
          ? app.mov.slice(
              0,
              25
            )
          : [],

      ventas_recientes:
        Array.isArray(
          app.sold
        )
          ? app.sold.slice(
              0,
              15
            )
          : [],

      permutas_recientes:
        Array.isArray(
          app.permutas
        )
          ? app.permutas.slice(
              0,
              10
            )
          : [],

      operacion:
        operation
    };
  }

  async function verifyOperation(
    operation
  ) {
    const response =
      await fetch(
        '/api/verify-operation',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              operation:
                operation,

              snapshot:
                buildSupervisorSnapshot(
                  operation
                ),

              context:
                getDeviceContext()
            })
        }
      );

    let result =
      null;

    try {
      result =
        await response.json();
    } catch (e) {}

    if (
      !response.ok ||
      !result ||
      !result.ok ||
      !result.verification
    ) {
      throw new Error(
        result?.error ||
        'La IA supervisora no pudo verificar la operación.'
      );
    }

    return result.verification;
  }

  function normalizeOperation(
    raw
  ) {
    const op =
      Object.assign(
        {},
        raw || {}
      );

    op.tipo =
      String(
        op.tipo || ''
      )
        .toLowerCase();

    [
      'vehiculo',
      'comprador',
      'documento',
      'telefono',
      'forma_pago',
      'categoria',
      'concepto',
      'medio_pago',
      'observaciones',
      'marca',
      'referencia',
      'modelo',
      'placa',
      'obligacion',
      'tipo_pago',
      'vehiculo_ingresa_marca',
      'vehiculo_ingresa_referencia',
      'vehiculo_ingresa_modelo',
      'vehiculo_ingresa_placa'
    ].forEach(
      k => {

        if (
          op[k] != null
        ) {
          op[k] =
            String(
              op[k]
            )
              .trim();
        }

      }
    );

    [
      'precio_venta',
      'efectivo',
      'transferencia',
      'recibido',
      'valor',
      'precio_compra',
      'valor_vehiculo_ingresa'
    ].forEach(
      k => {

        if (
          op[k] != null
        ) {
          op[k] =
            numberValue(
              op[k]
            );
        }

      }
    );

    return op;
  }

  function validateOperation(
    op
  ) {
    const fail =
      error => ({
        ok: false,
        error:
          error
      });

    if (
      !op.tipo
    ) {
      return fail(
        'Falta el tipo de operación.'
      );
    }

    if (
      op.tipo ===
      'venta'
    ) {
      const r =
        resolveVehicle(
          op.vehiculo
        );

      if (!r.ok) {
        return r;
      }

      if (
        numberValue(
          op.precio_venta
        ) <= 0
      ) {
        return fail(
          'Falta un precio de venta válido.'
        );
      }

      if (
        !op.comprador ||
        !op.documento ||
        !op.forma_pago
      ) {
        return fail(
          'Faltan comprador, documento o forma de pago.'
        );
      }

      if (
        op.forma_pago ===
          'mixto' &&
        numberValue(
          op.efectivo
        ) +
        numberValue(
          op.transferencia
        ) !==
        numberValue(
          op.precio_venta
        )
      ) {
        return fail(
          'En pago mixto, efectivo más transferencia debe ser igual al precio de venta.'
        );
      }

      if (
        op.forma_pago ===
          'credito' &&
        numberValue(
          op.recibido
        ) < 0
      ) {
        return fail(
          'El abono recibido no puede ser negativo.'
        );
      }

      op.vehiculo_resuelto =
        r.vehicle;

      op.vehiculo_id =
        r.original
          ? r.original.id
          : r.vehicle.id;
    }

    if (
      op.tipo ===
      'gasto_operacional'
    ) {
      if (
        !op.categoria ||
        !op.concepto ||
        numberValue(
          op.valor
        ) <= 0 ||
        !op.medio_pago
      ) {
        return fail(
          'Faltan categoría, concepto, valor o medio de pago del gasto operacional.'
        );
      }
    }

    if (
      op.tipo ===
      'gasto_vehiculo'
    ) {
      const r =
        resolveVehicle(
          op.vehiculo
        );

      if (!r.ok) {
        return r;
      }

      if (
        !op.concepto ||
        numberValue(
          op.valor
        ) <= 0
      ) {
        return fail(
          'Faltan concepto o valor del gasto del vehículo.'
        );
      }

      op.vehiculo_resuelto =
        r.vehicle;

      op.vehiculo_id =
        r.original
          ? r.original.id
          : r.vehicle.id;
    }

    if (
      op.tipo ===
      'compra_vehiculo'
    ) {
      if (
        !op.marca ||
        !op.referencia ||
        !op.modelo ||
        !op.placa ||
        numberValue(
          op.precio_compra
        ) <= 0
      ) {
        return fail(
          'Faltan marca, referencia, modelo, placa o precio de compra.'
        );
      }

      const duplicate =
        vehicleRows(
          op.placa
        )
          .some(
            v =>
              normalizeText(
                v.placa
              ) ===
              normalizeText(
                op.placa
              )
          );

      if (
        duplicate
      ) {
        return fail(
          'Ya existe un vehículo activo con esa placa.'
        );
      }
    }

    if (
      op.tipo ===
      'pago_obligacion'
    ) {
      if (
        !op.obligacion ||
        !op.tipo_pago ||
        !op.medio_pago
      ) {
        return fail(
          'Faltan obligación, tipo de pago o medio de pago.'
        );
      }

      if (
        op.tipo_pago ===
          'abono' &&
        numberValue(
          op.valor
        ) <= 0
      ) {
        return fail(
          'El abono debe tener un valor mayor que cero.'
        );
      }
    }

    if (
      op.tipo ===
      'permuta'
    ) {
      const r =
        resolveVehicle(
          op.vehiculo
        );

      if (!r.ok) {
        return r;
      }

      if (
        numberValue(
          op.precio_venta
        ) <= 0
      ) {
        return fail(
          'Falta el valor acordado del vehículo que sale.'
        );
      }

      if (
        !op.vehiculo_ingresa_marca ||
        !op.vehiculo_ingresa_referencia ||
        !op.vehiculo_ingresa_modelo
      ) {
        return fail(
          'Faltan marca, referencia o modelo del vehículo que ingresa.'
        );
      }

      if (
        numberValue(
          op.valor_vehiculo_ingresa
        ) <= 0
      ) {
        return fail(
          'Falta el valor del vehículo que ingresa.'
        );
      }

      op.vehiculo_resuelto =
        r.vehicle;

      op.vehiculo_id =
        r.original
          ? r.original.id
          : r.vehicle.id;
    }

    return {
      ok: true
    };
  }

  async function prepareOperation(
    raw
  ) {
    const op =
      normalizeOperation(
        raw
      );

    const local =
      validateOperation(
        op
      );

    if (
      !local.ok
    ) {
      pendingOperation =
        null;

      return Object.assign(
        {
          ok: false,

          preparada:
            false
        },
        local
      );
    }

    setStatus(
      'JAY ESTÁ VERIFICANDO',
      'La IA supervisora está revisando la operación...',
      'listening'
    );

    const verification =
      await verifyOperation(
        op
      );

    if (
      verification.estado !==
      'APROBADA'
    ) {
      pendingOperation =
        null;

      return {
        ok: false,

        preparada:
          false,

        estado:
          verification.estado,

        resumen:
          verification.resumen,

        razon:
          verification.razon,

        riesgos:
          verification.riesgos,

        recomendacion:
          verification.recomendacion,

        confianza:
          verification.confianza
      };
    }

    pendingOperation = {
      operation:
        op,

      verification:
        verification,

      preparedAt:
        Date.now()
    };

    return {
      ok: true,

      preparada:
        true,

      estado:
        'APROBADA',

      resumen:
        verification.resumen,

      razon:
        verification.razon,

      confianza:
        verification.confianza,

      requiere_confirmacion:
        true,

      mensaje:
        'La operación está preparada y aprobada por la IA supervisora. Pide confirmación explícita antes de guardarla.'
    };
  }

  function explicitConfirmationIsFresh() {
    if (
      !lastUserTranscript ||
      Date.now() -
        lastUserTranscriptAt >
        45000
    ) {
      return false;
    }

    const q =
      normalizeText(
        lastUserTranscript
      );

    const valid = [
      'CONFIRMO',
      'SI CONFIRMO',
      'GUARDALO',
      'SI GUARDALO',
      'GUARDELO',
      'SI GUARDELO',
      'CONFIRMA LA OPERACION',
      'CONFIRMO LA OPERACION',
      'SI CONFIRMO LA OPERACION',
      'GUARDA LA OPERACION',
      'SI GUARDA LA OPERACION'
    ];

    return valid.some(
      x =>
        q === x ||
        q.includes(x)
    );
  }

  function operationSnapshot() {
    const app =
      getAppData();

    return {
      veh:
        Array.isArray(
          app.veh
        )
          ? app.veh.length
          : 0,

      sold:
        Array.isArray(
          app.sold
        )
          ? app.sold.length
          : 0,

      mov:
        Array.isArray(
          app.mov
        )
          ? app.mov.length
          : 0,

      permutas:
        Array.isArray(
          app.permutas
        )
          ? app.permutas.length
          : 0,

      capitalOps:
        Array.isArray(
          app.capitalOps
        )
          ? app.capitalOps.length
          : 0
    };
  }

  function operationChanged(
    type,
    before,
    after
  ) {
    if (
      type ===
      'venta'
    ) {
      return (
        after.sold >
          before.sold ||
        after.veh <
          before.veh
      );
    }

    if (
      type ===
      'gasto_operacional'
    ) {
      return (
        after.mov >
        before.mov
      );
    }

    if (
      type ===
      'gasto_vehiculo'
    ) {
      return (
        after.mov >
        before.mov
      );
    }

    if (
      type ===
      'compra_vehiculo'
    ) {
      return (
        after.veh >
        before.veh
      );
    }

    if (
      type ===
      'pago_obligacion'
    ) {
      return (
        after.mov >
          before.mov ||
        after.capitalOps >
          before.capitalOps
      );
    }

    if (
      type ===
      'permuta'
    ) {
      return (
        after.permutas >
        before.permutas
      );
    }

    return false;
  }

  function findDebtOption(
    query
  ) {
    try {
      if (
        typeof
          renderCashCapital ===
        'function'
      ) {
        renderCashCapital();
      }
    } catch (e) {}

    const sel =
      document.getElementById(
        'ccDebtSelect'
      );

    if (!sel) {
      return {
        ok: false,

        error:
          'No encontré el selector de obligaciones.'
      };
    }

    const q =
      normalizeText(
        query
      );

    const options =
      [
        ...sel.options
      ]
        .filter(
          o =>
            o.value
        );

    const exact =
      options.filter(
        o =>
          normalizeText(
            o.value
          ) === q ||
          normalizeText(
            o.textContent
          ) === q
      );

    const matches =
      exact.length
        ? exact
        : options.filter(
            o =>
              normalizeText(
                o.textContent
              )
                .includes(q)
          );

    if (
      !matches.length
    ) {
      return {
        ok: false,

        error:
          'No encontré esa obligación activa.'
      };
    }

    if (
      matches.length >
      1
    ) {
      return {
        ok: false,

        ambiguo:
          true,

        coincidencias:
          matches
            .slice(
              0,
              8
            )
            .map(
              o =>
                o.textContent
            ),

        error:
          'Hay varias obligaciones que coinciden.'
      };
    }

    return {
      ok: true,

      id:
        matches[0].value,

      text:
        matches[0]
          .textContent
    };
  }

  async function executeOperation(
    op
  ) {

    if (
      op.tipo ===
      'gasto_operacional'
    ) {

      if (
        typeof
          openOperatingExpenseOperation !==
          'function' ||
        typeof
          saveOperationsOperatingExpense !==
          'function'
      ) {
        throw new Error(
          'El módulo de gasto operacional no está disponible.'
        );
      }

      openOperatingExpenseOperation();

      setValue(
        'opExpenseCategory',
        String(
          op.categoria ||
          'OTROS'
        )
          .toUpperCase(),
        'change'
      );

      setValue(
        'opExpenseConcept',
        String(
          op.concepto ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'opExpenseValue',
        moneyInput(
          op.valor
        )
      );

      setValue(
        'opExpenseMethod',
        String(
          op.medio_pago ||
          'transferencia'
        )
          .toLowerCase(),
        'change'
      );

      setValue(
        'opExpenseObs',
        String(
          op.observaciones ||
          ''
        )
          .toUpperCase()
      );

      saveOperationsOperatingExpense();

      return;
    }

    if (
      op.tipo ===
      'gasto_vehiculo'
    ) {

      if (
        typeof
          openVehicleExpenseOperation !==
          'function' ||
        typeof
          selectOpVehicleExpense !==
          'function' ||
        typeof
          saveOpVehicleExpenses !==
          'function'
      ) {
        throw new Error(
          'El módulo de gasto de vehículo no está disponible.'
        );
      }

      openVehicleExpenseOperation();

      selectOpVehicleExpense(
        op.vehiculo_id
      );

      const rows = [
        ...document.querySelectorAll(
          '#opVehExpenseRows .opveh-expense-row'
        )
      ];

      if (
        !rows.length
      ) {
        throw new Error(
          'No pude preparar el formulario de gasto del vehículo.'
        );
      }

      rows.forEach(
        row => {

          const c =
            row.querySelector(
              '[data-op-exp-concept]'
            );

          const v =
            row.querySelector(
              '[data-op-exp-value]'
            );

          if (c) {
            c.value = '';
          }

          if (v) {
            v.value = '';
          }

        }
      );

      const c =
        rows[0]
          .querySelector(
            '[data-op-exp-concept]'
          );

      const v =
        rows[0]
          .querySelector(
            '[data-op-exp-value]'
          );

      if (c) {
        c.value =
          String(
            op.concepto ||
            ''
          )
            .toUpperCase();
      }

      if (v) {
        v.value =
          moneyInput(
            op.valor
          );

        v.dispatchEvent(
          new Event(
            'input',
            {
              bubbles: true
            }
          )
        );
      }

      if (
        typeof
          updateOpVehicleExpenseTotals ===
        'function'
      ) {
        updateOpVehicleExpenseTotals();
      }

      saveOpVehicleExpenses();

      return;
    }

    if (
      op.tipo ===
      'compra_vehiculo'
    ) {

      if (
        typeof
          openOperationsPurchase !==
          'function' ||
        typeof
          addVeh !==
          'function'
      ) {
        throw new Error(
          'El módulo de compra de vehículos no está disponible.'
        );
      }

      openOperationsPurchase();

      setValue(
        'vmarca',
        String(
          op.marca ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'vref',
        String(
          op.referencia ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'vmodelo',
        String(
          op.modelo ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'vplaca',
        String(
          op.placa ||
          ''
        )
          .toUpperCase()
          .replace(
            /\s+/g,
            ''
          )
      );

      setValue(
        'vcompra',
        moneyInput(
          op.precio_compra
        )
      );

      await addVeh();

      return;
    }

    if (
      op.tipo ===
      'venta'
    ) {

      if (
        typeof
          openOperationsSales !==
          'function' ||
        typeof
          selectSaleVehicle !==
          'function' ||
        typeof
          saveVehicleSale !==
          'function'
      ) {
        throw new Error(
          'El módulo de venta no está disponible.'
        );
      }

      openOperationsSales();

      selectSaleVehicle(
        op.vehiculo_id
      );

      setValue(
        'salePrice',
        moneyInput(
          op.precio_venta
        )
      );

      setValue(
        'saleBuyer',
        String(
          op.comprador ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'saleDoc',
        String(
          op.documento ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'salePhone',
        String(
          op.telefono ||
          ''
        )
      );

      setValue(
        'saleMethod',
        String(
          op.forma_pago ||
          'efectivo'
        )
          .toLowerCase(),
        'change'
      );

      if (
        typeof
          toggleMixedPayment ===
        'function'
      ) {
        toggleMixedPayment();
      }

      if (
        op.forma_pago ===
        'mixto'
      ) {

        setValue(
          'saleCash',
          moneyInput(
            op.efectivo
          )
        );

        setValue(
          'saleTransfer',
          moneyInput(
            op.transferencia
          )
        );
      }

      if (
        op.forma_pago ===
        'credito'
      ) {

        setValue(
          'saleReceived',
          moneyInput(
            op.recibido
          )
        );
      }

      setValue(
        'saleObs',
        String(
          op.observaciones ||
          ''
        )
          .toUpperCase()
      );

      if (
        typeof
          updateSaleSummary ===
        'function'
      ) {
        updateSaleSummary();
      }

      saveVehicleSale();

      return;
    }

    if (
      op.tipo ===
      'pago_obligacion'
    ) {

      if (
        typeof
          openDebtPayment !==
          'function' ||
        typeof
          saveDebtPayment !==
          'function'
      ) {
        throw new Error(
          'El módulo de pago de obligaciones no está disponible.'
        );
      }

      const debt =
        findDebtOption(
          op.obligacion
        );

      if (
        !debt.ok
      ) {
        throw new Error(
          debt.error
        );
      }

      openDebtPayment(
        debt.id
      );

      const type =
        op.tipo_pago ===
        'pago_total'
          ? 'total'
          : 'partial';

      if (
        typeof
          setDebtPaymentType ===
        'function'
      ) {
        setDebtPaymentType(
          type
        );
      } else {
        setValue(
          'ccDebtPaymentType',
          type,
          'change'
        );
      }

      if (
        type ===
        'partial'
      ) {
        setValue(
          'ccDebtValue',
          moneyInput(
            op.valor
          )
        );
      }

      setValue(
        'ccDebtMethod',
        String(
          op.medio_pago ||
          'transferencia'
        )
          .toLowerCase(),
        'change'
      );

      setValue(
        'ccDebtObs',
        String(
          op.observaciones ||
          ''
        )
          .toUpperCase()
      );

      if (
        typeof
          refreshDebtPaymentForm ===
        'function'
      ) {
        refreshDebtPaymentForm();
      }

      saveDebtPayment();

      return;
    }

    if (
      op.tipo ===
      'permuta'
    ) {

      if (
        typeof
          togglePermutaForm !==
          'function' ||
        typeof
          selectPermutaVehicle !==
          'function' ||
        typeof
          savePermuta !==
          'function'
      ) {
        throw new Error(
          'El módulo de permutas no está disponible.'
        );
      }

      togglePermutaForm();

      selectPermutaVehicle(
        op.vehiculo_id
      );

      setValue(
        'permutaSalePrice',
        moneyInput(
          op.precio_venta
        )
      );

      setValue(
        'permutaInMarca',
        String(
          op.vehiculo_ingresa_marca ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'permutaInRef',
        String(
          op.vehiculo_ingresa_referencia ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'permutaInModelo',
        String(
          op.vehiculo_ingresa_modelo ||
          ''
        )
          .toUpperCase()
      );

      setValue(
        'permutaInPlaca',
        String(
          op.vehiculo_ingresa_placa ||
          ''
        )
          .toUpperCase()
          .replace(
            /\s+/g,
            ''
          )
      );

      setValue(
        'permutaInTotalCost',
        moneyInput(
          op.valor_vehiculo_ingresa
        )
      );

      const method =
        [
          'efectivo',
          'transferencia',
          'mixto'
        ]
          .includes(
            op.forma_pago
          )
          ? op.forma_pago
          : 'efectivo';

      setValue(
        'permutaPayMethod',
        method,
        'change'
      );

      if (
        typeof
          togglePermutaMixedPayment ===
        'function'
      ) {
        togglePermutaMixedPayment();
      }

      if (
        method ===
        'mixto'
      ) {

        setValue(
          'permutaCash',
          moneyInput(
            op.efectivo
          )
        );

        setValue(
          'permutaTransfer',
          moneyInput(
            op.transferencia
          )
        );
      }

      setValue(
        'permutaObs',
        String(
          op.observaciones ||
          ''
        )
          .toUpperCase()
      );

      if (
        typeof
          updatePermutaCalculations ===
        'function'
      ) {
        updatePermutaCalculations();
      }

      await savePermuta();

      return;
    }

    throw new Error(
      'Tipo de operación no implementado: ' +
      op.tipo
    );
  }

  async function confirmOperation(
    args
  ) {
    if (
      !pendingOperation
    ) {
      return {
        ok: false,

        guardada:
          false,

        error:
          'No hay una operación pendiente por confirmar.'
      };
    }

    if (
      String(
        args?.confirmacion ||
        ''
      )
        .toUpperCase() !==
      'CONFIRMO'
    ) {
      return {
        ok: false,

        guardada:
          false,

        error:
          'La confirmación recibida no es válida.'
      };
    }

    if (
      !explicitConfirmationIsFresh()
    ) {
      return {
        ok: false,

        guardada:
          false,

        error:
          'No detecté una confirmación explícita y reciente del usuario. Pide que diga: Confirmo.'
      };
    }

    const verification =
      await verifyOperation(
        pendingOperation.operation
      );

    if (
      verification.estado !==
      'APROBADA'
    ) {
      return {
        ok: false,

        guardada:
          false,

        estado:
          verification.estado,

        razon:
          verification.razon,

        recomendacion:
          verification.recomendacion
      };
    }

    const op =
      pendingOperation.operation;

    const before =
      operationSnapshot();

    await executeOperation(
      op
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          350
        )
    );

    const after =
      operationSnapshot();

    const changed =
      operationChanged(
        op.tipo,
        before,
        after
      );

    if (
      !changed
    ) {
      return {
        ok: false,

        guardada:
          false,

        error:
          'Intenté ejecutar la operación, pero no pude comprobar que se hubiera guardado. Revisa el formulario antes de volver a intentarlo.'
      };
    }

    pendingOperation =
      null;

    return {
      ok: true,

      guardada:
        true,

      tipo:
        op.tipo,

      mensaje:
        'Operación registrada correctamente y verificada en MULTI INVERSIONES.'
    };
  }

  function cancelOperation() {
    const hadPending =
      Boolean(
        pendingOperation
      );

    pendingOperation =
      null;

    return {
      ok: true,

      cancelada:
        hadPending,

      mensaje:
        hadPending
          ? 'La operación pendiente fue cancelada. No se guardaron cambios.'
          : 'No había una operación pendiente.'
    };
  }

  async function executeTool(
    name,
    args
  ) {
    switch (name) {

      case 'obtener_resumen_financiero':

        return getFinancialSummary();

      case 'obtener_hora_dispositivo':

        return getDeviceContext();

      case 'obtener_inventario': {

        const rows =
          vehicleRows(
            args?.consulta ||
            ''
          );

        return {
          ok: true,

          consulta:
            args?.consulta ||
            '',

          cantidad:
            rows.length,

          inversion_total_inventario:
            rows.reduce(
              (
                sum,
                v
              ) =>
                sum +
                Number(
                  v.inversion_total ||
                  0
                ),
              0
            ),

          vehiculos:
            rows.slice(
              0,
              40
            )
        };
      }

      case 'abrir_vehiculo':

        return openVehicle(
          args?.consulta ||
          ''
        );

      case 'abrir_modulo':

        return openModule(
          args?.modulo ||
          ''
        );

      case 'preparar_operacion':

        return await prepareOperation(
          args || {}
        );

      case 'confirmar_operacion':

        return await confirmOperation(
          args || {}
        );

      case 'cancelar_operacion':

        return cancelOperation();

      default:

        return {
          ok: false,

          error:
            'Herramienta no implementada: ' +
            name
        };
    }
  }

  async function handleToolCall(
    msg
  ) {
    if (
      !msg ||
      !msg.call_id
    ) {
      return;
    }

    if (
      processedCalls.has(
        msg.call_id
      )
    ) {
      return;
    }

    processedCalls.add(
      msg.call_id
    );

    let args = {};

    try {
      args =
        msg.arguments
          ? JSON.parse(
              msg.arguments
            )
          : {};
    } catch (e) {}

    setStatus(
      'JAY ESTÁ TRABAJANDO',
      'Procesando en MULTI INVERSIONES...',
      'listening'
    );

    let result;

    try {
      result =
        await executeTool(
          msg.name,
          args
        );
    } catch (error) {

      console.error(
        'JAY herramienta:',
        error
      );

      result = {
        ok: false,

        error:
          error.message ||
          'Error ejecutando la herramienta.'
      };
    }

    if (
      !dc ||
      dc.readyState !==
      'open'
    ) {
      return;
    }

    dc.send(
      JSON.stringify({
        type:
          'conversation.item.create',

        item: {
          type:
            'function_call_output',

          call_id:
            msg.call_id,

          output:
            JSON.stringify(
              result
            )
        }
      })
    );

    dc.send(
      JSON.stringify({
        type:
          'response.create'
      })
    );
  }

  function handleRealtimeEvent(
    event
  ) {
    let msg;

    try {
      msg =
        JSON.parse(
          event.data
        );
    } catch (e) {
      return;
    }

    console.log(
      'JAY IA EVENT:',
      msg
    );

    if (
      msg.type ===
      'response.function_call_arguments.done'
    ) {
      handleToolCall(
        msg
      );

      return;
    }

    if (
      msg.type ===
      'response.done'
    ) {
      const outputs =
        Array.isArray(
          msg.response?.output
        )
          ? msg.response.output
          : [];

      outputs
        .filter(
          item =>
            item &&
            item.type ===
              'function_call'
        )
        .forEach(
          item =>
            handleToolCall(
              item
            )
        );
    }

    if (
      msg.type ===
      'conversation.item.input_audio_transcription.completed'
    ) {
      if (
        msg.transcript
      ) {
        lastUserTranscript =
          msg.transcript;

        lastUserTranscriptAt =
          Date.now();

        setStatus(
          'TE ESCUCHÉ',
          msg.transcript,
          'listening'
        );
      }
    }

    if (
      msg.type ===
      'input_audio_buffer.speech_started'
    ) {
      setStatus(
        'JAY TE ESCUCHA',
        'Habla con naturalidad.',
        'listening'
      );
    }

    if (
      msg.type ===
      'input_audio_buffer.speech_stopped'
    ) {
      setStatus(
        'JAY ESTÁ PENSANDO',
        'Un momento...'
      );
    }

    if (
      msg.type ===
        'response.output_audio_transcript.done' ||
      msg.type ===
        'response.audio_transcript.done'
    ) {
      if (
        msg.transcript
      ) {
        setStatus(
          'JAY IA',
          msg.transcript
        );
      }
    }

    if (
      msg.type ===
      'error'
    ) {
      console.error(
        'JAY IA ERROR:',
        msg
      );

      setStatus(
        'ERROR EN JAY IA',
        msg.error?.message ||
        'Ocurrió un problema.',
        'error'
      );
    }
  }

  async function startJayAI() {
    if (
      active
    ) {
      stopJayAI();
      return;
    }

    if (
      connecting
    ) {
      return;
    }

    connecting =
      true;

    setStatus(
      'CONECTANDO JAY IA',
      'Preparando conversación...',
      'listening'
    );

    try {
      micStream =
        await navigator
          .mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation:
                true,

              noiseSuppression:
                true,

              autoGainControl:
                true
            }
          });

      pc =
        new RTCPeerConnection();

      remoteAudio =
        document.createElement(
          'audio'
        );

      remoteAudio.autoplay =
        true;

      remoteAudio.playsInline =
        true;

      remoteAudio.style.display =
        'none';

      document.body
        .appendChild(
          remoteAudio
        );

      pc.ontrack =
        event => {

          remoteAudio.srcObject =
            event.streams[0];

          remoteAudio
            .play()
            .catch(
              () => {}
            );
        };

      micStream
        .getTracks()
        .forEach(
          track =>
            pc.addTrack(
              track,
              micStream
            )
        );

      dc =
        pc.createDataChannel(
          'oai-events'
        );

      dc.onmessage =
        handleRealtimeEvent;

      dc.onerror =
        error =>
          console.error(
            'JAY DATA CHANNEL:',
            error
          );

      dc.onclose =
        () => {

          if (
            active
          ) {
            cleanup();

            setStatus(
              'JAY IA DESCONECTADO',
              'Toca el micrófono para reconectar.'
            );
          }
        };

      dc.onopen =
        () => {

          active =
            true;

          connecting =
            false;

          setStatus(
            'JAY IA ACTIVO',
            'Conectado a MULTI INVERSIONES. Puedes consultar y ejecutar operaciones con confirmación.',
            'listening'
          );

          dc.send(
            JSON.stringify({
              type:
                'response.create',

              response: {
                instructions:
                  'Saluda brevemente. Di que ya estás conectado a MULTI INVERSIONES y que puedes consultar datos reales, abrir módulos y preparar operaciones para aprobación y confirmación.'
              }
            })
          );
        };

      const offer =
        await pc
          .createOffer();

      await pc
        .setLocalDescription(
          offer
        );

      const response =
        await fetch(
          '/api/realtime',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                sdp:
                  offer.sdp
              })
          }
        );

      if (
        !response.ok
      ) {
        const errorText =
          await response.text();

        throw new Error(
          errorText ||
          'No se pudo conectar con JAY IA'
        );
      }

      const answerSdp =
        await response.text();

      await pc
        .setRemoteDescription({
          type:
            'answer',

          sdp:
            answerSdp
        });

    } catch (error) {

      console.error(
        'JAY IA:',
        error
      );

      cleanup();

      setStatus(
        'NO PUDE CONECTAR JAY IA',
        error.message ||
        'Revisa la conexión e intenta nuevamente.',
        'error'
      );
    }
  }

  window.checkMicrophoneAndStart =
    startJayAI;

  window.toggleJayListening =
    function () {

      if (
        active
      ) {
        stopJayAI();
      } else {
        startJayAI();
      }
    };

  window.JayAI = {
    version:
      '4.0',

    start:
      startJayAI,

    stop:
      stopJayAI,

    isActive:
      () =>
        active,

    pendingOperation:
      () =>
        pendingOperation,

    tools: {

      obtenerResumenFinanciero:
        getFinancialSummary,

      obtenerInventario:
        vehicleRows,

      abrirModulo:
        openModule,

      abrirVehiculo:
        openVehicle,

      obtenerHoraDispositivo:
        getDeviceContext,

      prepararOperacion:
        prepareOperation,

      confirmarOperacion:
        confirmOperation,

      cancelarOperacion:
        cancelOperation
    }
  };

  console.log(
    'JAY IA REALTIME V4 ACTIVO'
  );
})();

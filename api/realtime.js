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
      micStream.getTracks().forEach(track => track.stop());
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
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function moneyInput(value) {
    const n = Math.max(
      0,
      Math.round(numberValue(value))
    );

    return n
      ? new Intl.NumberFormat('es-CO').format(n)
      : '';
  }

  function getAppData() {
    try {
      if (
        typeof data !== 'undefined' &&
        data
      ) {
        return data;
      }
    } catch (e) {}

    try {
      return JSON.parse(
        localStorage.getItem(
          'jcp_app_v1'
        ) || '{}'
      );
    } catch (e) {
      return {};
    }
  }

  function getDeviceContext() {
    const now = new Date();

    let timeZone = 'UTC';

    try {
      timeZone =
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone || 'UTC';
    } catch (e) {}

    const locale =
      navigator.language || 'es-CO';

    let localDateTime = '';

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

            const terms =
              q
                .split(/\s+/)
                .filter(Boolean);

            return terms.every(
              term =>
                haystack.includes(term)
            );
          })
        : rows;

    return filtered.map(v => ({
      id:
        String(v.id || ''),

      placa:
        String(
          v.pl ||
          v.placa ||
          ''
        ).toUpperCase(),

      marca:
        String(
          v.marca ||
          v.m ||
          ''
        ).toUpperCase(),

      referencia:
        String(
          v.ref ||
          v.referencia ||
          ''
        ).toUpperCase(),

      modelo:
        String(v.modelo || ''),

      precio_compra:
        numberValue(v.c),

      gastos_asociados:
        numberValue(v.g),

      inversion_total:
        numberValue(v.c) +
        numberValue(v.g)
    }));
  }

  function resolveVehicle(query) {
    const matches =
      vehicleRows(query);

    if (!matches.length) {
      return {
        ok: false,
        encontrado: false,
        mensaje:
          'No encontré ese vehículo en el inventario.'
      };
    }

    if (matches.length > 1) {
      return {
        ok: false,
        ambiguo: true,
        coincidencias:
          matches.slice(0, 8),
        mensaje:
          'Hay varias coincidencias. Debes precisar cuál vehículo.'
      };
    }

    return {
      ok: true,
      vehiculo:
        matches[0]
    };
  }

  function originalVehicleById(id) {
    const app =
      getAppData();

    if (
      !Array.isArray(app.veh)
    ) {
      return null;
    }

    return (
      app.veh.find(
        v =>
          String(v.id) ===
          String(id)
      ) || null
    );
  }

  function getFinancialSummary() {
    let f = null;

    try {
      if (
        typeof getFinancialSnapshotV75 ===
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

    const app =
      getAppData();

    return {
      ok: true,

      capital_inicial:
        numberValue(f.initial),

      aportes:
        numberValue(
          f.contributions
        ),

      capital_actual:
        numberValue(f.capital),

      financiacion_recibida:
        numberValue(
          f.financing
        ),

      deuda_pagada:
        numberValue(
          f.debtPaid
        ),

      deuda_pendiente:
        numberValue(f.debt),

      inversion_vehiculos:
        numberValue(
          f.vehicleInvestment
        ),

      otras_inversiones:
        numberValue(
          f.otherInvestment
        ),

      total_invertido:
        numberValue(
          f.invested
        ),

      por_cobrar_prestamos:
        numberValue(
          f.loanReceivable
        ),

      por_cobrar_ventas:
        numberValue(
          f.saleReceivable
        ),

      por_cobrar_total:
        numberValue(
          f.receivable
        ),

      utilidad_bruta:
        numberValue(
          f.grossProfit
        ),

      utilidad_acumulada:
        numberValue(
          f.accumulatedProfit
        ),

      gastos_operativos:
        numberValue(
          f.operatingExpenses
        ),

      utilidad_neta:
        numberValue(
          f.netProfit
        ),

      utilidad_disponible:
        numberValue(
          f.profitAvailable
        ),

      disponible:
        numberValue(
          f.available
        ),

      activos:
        numberValue(f.assets),

      patrimonio:
        numberValue(f.equity),

      vehiculos_en_inventario:
        Array.isArray(app.veh)
          ? app.veh.length
          : 0,

      ventas_registradas:
        Array.isArray(app.sold)
          ? app.sold.length
          : 0,

      permutas_registradas:
        Array.isArray(
          app.permutas
        )
          ? app.permutas.length
          : 0,

      prestamos_registrados:
        Array.isArray(app.pres)
          ? app.pres.length
          : 0
    };
  }

  function getDebtRows() {
    try {
      if (
        typeof renderCashCapital ===
        'function'
      ) {
        renderCashCapital();
      }
    } catch (e) {}

    const select =
      document.getElementById(
        'ccDebtSelect'
      );

    if (
      select &&
      select.options
    ) {
      const rows =
        [...select.options]
          .filter(
            option =>
              String(
                option.value || ''
              ).trim()
          )
          .map(option => ({
            id:
              String(
                option.value ||
                ''
              ),

            concepto:
              String(
                option.textContent ||
                ''
              )
                .replace(
                  /\s+—\s+SALDO\s+.*$/i,
                  ''
                )
                .trim(),

            saldo:
              numberValue(
                option.dataset.balance
              )
          }));

      if (rows.length) {
        return rows;
      }
    }

    const app =
      getAppData();

    const mov =
      Array.isArray(app.mov)
        ? app.mov
        : [];

    const financing =
      mov.filter(
        x =>
          x &&
          x.t === 'ingreso' &&
          (
            x.subtype ===
              'credito' ||
            x.subtype ===
              'prestamo_recibido' ||
            x.subtype ===
              'aporte_capital'
          )
      );

    const payments =
      mov.filter(
        x =>
          x &&
          x.t === 'gasto' &&
          x.subtype ===
            'pago_deuda'
      );

    return financing
      .map(f => {
        const id =
          String(
            f.capitalOpId ||
            f.id ||
            ''
          );

        const paid =
          payments
            .filter(
              p =>
                String(
                  p.financingId ||
                  ''
                ) === id
            )
            .reduce(
              (sum, p) =>
                sum +
                numberValue(p.v),
              0
            );

        return {
          id:
            id,

          concepto:
            String(
              f.c ||
              'OBLIGACIÓN'
            ).toUpperCase(),

          saldo:
            Math.max(
              0,
              numberValue(f.v) -
              paid
            )
        };
      })
      .filter(
        x =>
          x.id &&
          x.saldo > 0
      );
  }

  function resolveDebt(query) {
    const q =
      normalizeText(query);

    const rows =
      getDebtRows();

    const terms =
      q
        .split(/\s+/)
        .filter(Boolean);

    const matches =
      q
        ? rows.filter(row => {
            const hay =
              normalizeText(
                row.id +
                ' ' +
                row.concepto
              );

            return terms.every(
              term =>
                hay.includes(term)
            );
          })
        : [];

    if (!matches.length) {
      return {
        ok: false,
        encontrado: false,

        obligaciones:
          rows.slice(0, 12),

        mensaje:
          'No encontré esa obligación activa.'
      };
    }

    if (
      matches.length > 1
    ) {
      return {
        ok: false,
        ambiguo: true,

        coincidencias:
          matches.slice(0, 8),

        mensaje:
          'Hay varias obligaciones coincidentes.'
      };
    }

    return {
      ok: true,
      obligacion:
        matches[0]
    };
  }

  function openModule(moduleName) {
    const module =
      String(
        moduleName || ''
      ).toLowerCase();

    try {
      switch (module) {
        case 'inicio':
          if (
            typeof show ===
            'function'
          ) {
            show('dashboard');
          }
          break;

        case 'vehiculos':
          if (
            typeof openVehiclesHub ===
            'function'
          ) {
            openVehiclesHub();
          } else if (
            typeof show ===
            'function'
          ) {
            show('vehiculos');
          }
          break;

        case 'operaciones':
          if (
            typeof openOperationsHub ===
            'function'
          ) {
            openOperationsHub();
          } else if (
            typeof show ===
            'function'
          ) {
            show('ventas');
          }
          break;

        case 'ventas':
          if (
            typeof openOperationsSales ===
            'function'
          ) {
            openOperationsSales();
          } else if (
            typeof show ===
            'function'
          ) {
            show('ventas');
          }
          break;

        case 'compras':
          if (
            typeof openOperationsPurchase ===
            'function'
          ) {
            openOperationsPurchase();
          } else if (
            typeof show ===
            'function'
          ) {
            show('ventas');
          }
          break;

        case 'gastos':
          if (
            typeof openOperationsExpenses ===
            'function'
          ) {
            openOperationsExpenses();
          } else if (
            typeof show ===
            'function'
          ) {
            show('ventas');
          }
          break;

        case 'finanzas':
          if (
            typeof openMainNavigation ===
            'function'
          ) {
            openMainNavigation(
              'cajaCapital'
            );
          } else if (
            typeof show ===
            'function'
          ) {
            show('cajaCapital');
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
            show('prestamos');
          }
          break;

        case 'clientes':
          if (
            typeof show ===
            'function'
          ) {
            show('clientes');
          }
          break;

        case 'soportes':
          if (
            typeof openSupportsModule ===
            'function'
          ) {
            openSupportsModule();
          } else if (
            typeof show ===
            'function'
          ) {
            show('soportes');
          }
          break;

        case 'extractos':
          if (
            typeof show ===
            'function'
          ) {
            show('extractos');
          }
          break;

        case 'cartera':
          if (
            typeof openSalesReceivables ===
            'function'
          ) {
            openSalesReceivables();
          } else if (
            typeof show ===
            'function'
          ) {
            show('carteraCaja');
          }
          break;

        case 'cierre_caja':
          if (
            typeof show ===
            'function'
          ) {
            show('cierreCaja');
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
      console.error(
        'JAY abrir módulo:',
        error
      );

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
      resolveVehicle(query);

    if (!resolved.ok) {
      return resolved;
    }

    const vehicle =
      resolved.vehiculo;

    const original =
      originalVehicleById(
        vehicle.id
      );

    if (!original) {
      return {
        ok: false,
        error:
          'El vehículo dejó de estar disponible.'
      };
    }

    try {
      if (
        typeof openVehiclesHub ===
        'function'
      ) {
        openVehiclesHub();
      } else if (
        typeof show ===
        'function'
      ) {
        show('vehiculos');
      }

      setTimeout(
        () => {
          try {
            if (
              typeof openVehicleDetail ===
              'function'
            ) {
              openVehicleDetail(
                original.id
              );
            }
          } catch (e) {
            console.error(
              'JAY abrir detalle vehículo:',
              e
            );
          }
        },
        80
      );

      return {
        ok: true,
        abierto: true,
        vehiculo:
          vehicle
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

  function recentMovements() {
    const app =
      getAppData();

    return (
      Array.isArray(app.mov)
        ? app.mov
        : []
    )
      .slice(0, 30)
      .map(x => ({
        id:
          String(x.id || ''),

        tipo:
          String(x.t || ''),

        subtipo:
          String(
            x.subtype || ''
          ),

        concepto:
          String(x.c || ''),

        valor:
          numberValue(x.v),

        vehiculo_id:
          String(
            x.vehicleId ||
            ''
          ),

        fecha:
          String(x.date || ''),

        createdAt:
          String(
            x.createdAt ||
            ''
          )
      }));
  }

  function buildSupervisorSnapshot(
    operation
  ) {
    return {
      financiero:
        getFinancialSummary(),

      inventario:
        vehicleRows('')
          .slice(0, 60),

      obligaciones:
        getDebtRows()
          .slice(0, 30),

      movimientos_recientes:
        recentMovements(),

      operacion_relacionada:
        operation
    };
  }

  async function verifyOperation(
    operation,
    snapshotOverride
  ) {
    const context =
      getDeviceContext();

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
                snapshotOverride ||
                buildSupervisorSnapshot(
                  operation
                ),

              context:
                context
            })
        }
      );

    let result = null;

    try {
      result =
        await response.json();
    } catch (e) {}

    if (
      !response.ok ||
      !result?.ok ||
      !result.verification
    ) {
      throw new Error(
        result?.error ||
        result?.detail?.error?.message ||
        'La IA supervisora no pudo verificar la operación.'
      );
    }

    return result.verification;
  }

  function prepareError(
    message,
    extra
  ) {
    return Object.assign(
      {
        ok: false,
        preparada: false,
        mensaje:
          message
      },
      extra || {}
    );
  }

  async function prepareOperation(
    args
  ) {
    const type =
      String(
        args?.tipo || ''
      ).toLowerCase();

    const financial =
      getFinancialSummary();

    const available =
      financial.ok
        ? numberValue(
            financial.disponible
          )
        : 0;

    let operation = null;

    if (
      type === 'venta'
    ) {
      const resolved =
        resolveVehicle(
          args?.vehiculo || ''
        );

      if (!resolved.ok) {
        return resolved;
      }

      const v =
        resolved.vehiculo;

      const price =
        numberValue(
          args?.precio_venta
        );

      const buyer =
        String(
          args?.comprador ||
          ''
        )
          .trim()
          .toUpperCase();

      const documentId =
        String(
          args?.documento ||
          ''
        )
          .trim()
          .toUpperCase();

      const phone =
        String(
          args?.telefono ||
          ''
        ).trim();

      const method =
        String(
          args?.forma_pago ||
          ''
        ).toLowerCase();

      if (price <= 0) {
        return prepareError(
          'Falta un precio de venta válido.'
        );
      }

      if (!buyer) {
        return prepareError(
          'Falta el nombre del comprador.'
        );
      }

      if (!documentId) {
        return prepareError(
          'Falta el documento del comprador.'
        );
      }

      if (
        ![
          'efectivo',
          'transferencia',
          'mixto',
          'credito'
        ].includes(method)
      ) {
        return prepareError(
          'Falta una forma de pago válida.'
        );
      }

      let cash = 0;
      let transfer = 0;
      let received = 0;

      if (
        method === 'efectivo'
      ) {
        cash = price;
        received = price;

      } else if (
        method ===
        'transferencia'
      ) {
        transfer = price;
        received = price;

      } else if (
        method === 'mixto'
      ) {
        cash =
          numberValue(
            args?.efectivo
          );

        transfer =
          numberValue(
            args?.transferencia
          );

        received =
          cash + transfer;

        if (
          cash <= 0 ||
          transfer <= 0
        ) {
          return prepareError(
            'En pago mixto faltan los valores de efectivo y transferencia.'
          );
        }

        if (
          received !== price
        ) {
          return prepareError(
            'En pago mixto, efectivo más transferencia debe ser igual al precio de venta.',
            {
              precio_venta:
                price,

              total_recibido:
                received
            }
          );
        }

      } else {
        received =
          numberValue(
            args?.recibido
          );

        if (
          received < 0 ||
          received > price
        ) {
          return prepareError(
            'El abono recibido del crédito no es válido.'
          );
        }
      }

      operation = {
        tipo:
          'venta',

        vehiculo_id:
          v.id,

        vehiculo:
          v,

        precio_venta:
          price,

        inversion_total:
          v.inversion_total,

        utilidad_estimada:
          price -
          v.inversion_total,

        comprador:
          buyer,

        documento:
          documentId,

        telefono:
          phone,

        forma_pago:
          method,

        efectivo:
          cash,

        transferencia:
          transfer,

        recibido:
          received,

        pendiente:
          Math.max(
            0,
            price - received
          ),

        observaciones:
          String(
            args?.observaciones ||
            ''
          )
            .trim()
            .toUpperCase()
      };

    } else if (
      type ===
      'gasto_operacional'
    ) {
      const category =
        String(
          args?.categoria ||
          ''
        )
          .trim()
          .toUpperCase();

      const concept =
        String(
          args?.concepto ||
          ''
        )
          .trim()
          .toUpperCase();

      const value =
        numberValue(
          args?.valor
        );

      const method =
        String(
          args?.medio_pago ||
          ''
        ).toLowerCase();

      if (!category) {
        return prepareError(
          'Falta la categoría del gasto.'
        );
      }

      if (!concept) {
        return prepareError(
          'Falta el concepto del gasto.'
        );
      }

      if (value <= 0) {
        return prepareError(
          'Falta un valor de gasto válido.'
        );
      }

      if (
        ![
          'efectivo',
          'transferencia'
        ].includes(method)
      ) {
        return prepareError(
          'Falta el medio de pago del gasto.'
        );
      }

      operation = {
        tipo:
          'gasto_operacional',

        categoria:
          category,

        concepto:
          concept,

        valor:
          value,

        medio_pago:
          method,

        observaciones:
          String(
            args?.observaciones ||
            ''
          )
            .trim()
            .toUpperCase(),

        disponible_antes:
          available,

        disponible_suficiente:
          value <= available
      };

    } else if (
      type ===
      'gasto_vehiculo'
    ) {
      const resolved =
        resolveVehicle(
          args?.vehiculo || ''
        );

      if (!resolved.ok) {
        return resolved;
      }

      const v =
        resolved.vehiculo;

      const concept =
        String(
          args?.concepto ||
          ''
        )
          .trim()
          .toUpperCase();

      const value =
        numberValue(
          args?.valor
        );

      if (!concept) {
        return prepareError(
          'Falta el concepto del gasto del vehículo.'
        );
      }

      if (value <= 0) {
        return prepareError(
          'Falta un valor de gasto válido.'
        );
      }

      operation = {
        tipo:
          'gasto_vehiculo',

        vehiculo_id:
          v.id,

        vehiculo:
          v,

        concepto:
          concept,

        valor:
          value,

        inversion_antes:
          v.inversion_total,

        inversion_despues_esperada:
          v.inversion_total +
          value,

        disponible_antes:
          available,

        disponible_suficiente:
          value <= available,

        observaciones:
          String(
            args?.observaciones ||
            ''
          )
            .trim()
            .toUpperCase()
      };

    } else if (
      type ===
      'compra_vehiculo'
    ) {
      const brand =
        String(
          args?.marca ||
          ''
        )
          .trim()
          .toUpperCase();

      const ref =
        String(
          args?.referencia ||
          ''
        )
          .trim()
          .toUpperCase();

      const model =
        String(
          args?.modelo ||
          ''
        )
          .trim()
          .toUpperCase();

      const plate =
        String(
          args?.placa ||
          ''
        )
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '');

      const price =
        numberValue(
          args?.precio_compra
        );

      if (
        !brand ||
        !ref ||
        !model ||
        !plate
      ) {
        return prepareError(
          'Faltan marca, referencia, modelo o placa de la compra.'
        );
      }

      if (price <= 0) {
        return prepareError(
          'Falta un precio de compra válido.'
        );
      }

      const duplicate =
        vehicleRows('')
          .some(
            v =>
              normalizeText(
                v.placa
              ) ===
              normalizeText(
                plate
              )
          );

      operation = {
        tipo:
          'compra_vehiculo',

        marca:
          brand,

        referencia:
          ref,

        modelo:
          model,

        placa:
          plate,

        precio_compra:
          price,

        disponible_antes:
          available,

        disponible_suficiente:
          price <= available,

        placa_duplicada_en_inventario:
          duplicate,

        foto_pendiente_manual:
          true
      };

    } else if (
      type ===
      'pago_obligacion'
    ) {
      const resolved =
        resolveDebt(
          args?.obligacion ||
          ''
        );

      if (!resolved.ok) {
        return resolved;
      }

      const debt =
        resolved.obligacion;

      const paymentType =
        String(
          args?.tipo_pago ||
          ''
        ).toLowerCase();

      const method =
        String(
          args?.medio_pago ||
          ''
        ).toLowerCase();

      if (
        ![
          'abono',
          'pago_total'
        ].includes(paymentType)
      ) {
        return prepareError(
          'Debes indicar si es abono o pago total.'
        );
      }

      if (
        ![
          'efectivo',
          'transferencia'
        ].includes(method)
      ) {
        return prepareError(
          'Falta el medio de pago de la obligación.'
        );
      }

      const value =
        paymentType ===
        'pago_total'
          ? debt.saldo
          : numberValue(
              args?.valor
            );

      if (value <= 0) {
        return prepareError(
          'Falta un valor válido para el abono.'
        );
      }

      if (
        value >
        debt.saldo
      ) {
        return prepareError(
          'El pago supera el saldo pendiente de la obligación.',
          {
            saldo:
              debt.saldo,

            pago:
              value
          }
        );
      }

      operation = {
        tipo:
          'pago_obligacion',

        obligacion_id:
          debt.id,

        obligacion:
          debt,

        tipo_pago:
          paymentType,

        valor:
          value,

        medio_pago:
          method,

        observaciones:
          String(
            args?.observaciones ||
            ''
          )
            .trim()
            .toUpperCase(),

        saldo_antes:
          debt.saldo,

        saldo_despues_esperado:
          Math.max(
            0,
            debt.saldo -
            value
          ),

        disponible_antes:
          available,

        disponible_suficiente:
          value <= available
      };

    } else if (
      type === 'permuta'
    ) {
      const resolved =
        resolveVehicle(
          args?.vehiculo || ''
        );

      if (!resolved.ok) {
        return resolved;
      }

      const outgoing =
        resolved.vehiculo;

      const salePrice =
        numberValue(
          args?.precio_venta
        );

      const inBrand =
        String(
          args?.vehiculo_ingresa_marca ||
          ''
        )
          .trim()
          .toUpperCase();

      const inRef =
        String(
          args?.vehiculo_ingresa_referencia ||
          ''
        )
          .trim()
          .toUpperCase();

      const inModel =
        String(
          args?.vehiculo_ingresa_modelo ||
          ''
        )
          .trim()
          .toUpperCase();

      const inPlate =
        String(
          args?.vehiculo_ingresa_placa ||
          ''
        )
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '');

      const incomingValue =
        numberValue(
          args?.valor_vehiculo_ingresa
        );

      if (salePrice <= 0) {
        return prepareError(
          'Falta el valor de salida del vehículo.'
        );
      }

      if (
        !inBrand ||
        !inRef ||
        !inModel
      ) {
        return prepareError(
          'Faltan marca, referencia o modelo del vehículo que ingresa.'
        );
      }

      if (
        incomingValue <= 0
      ) {
        return prepareError(
          'Falta el valor acordado del vehículo que ingresa.'
        );
      }

      const signedDifference =
        salePrice -
        incomingValue;

      const difference =
        Math.abs(
          signedDifference
        );

      const direction =
        signedDifference > 0
          ? 'recibir'
          : signedDifference < 0
            ? 'pagar'
            : 'mano_a_mano';

      const incomingInventoryCost =
        outgoing.inversion_total -
        signedDifference;

      if (
        incomingInventoryCost <
        0
      ) {
        return prepareError(
          'El costo contable calculado del vehículo que ingresa sería negativo.'
        );
      }

      let method =
        difference > 0
          ? String(
              args?.forma_pago ||
              ''
            ).toLowerCase()
          : 'ninguno';

      let cash = 0;
      let transfer = 0;

      if (difference > 0) {
        if (
          ![
            'efectivo',
            'transferencia',
            'mixto'
          ].includes(method)
        ) {
          return prepareError(
            'Falta la forma de pago de la diferencia de la permuta.'
          );
        }

        if (
          method === 'efectivo'
        ) {
          cash =
            difference;
        }

        if (
          method ===
          'transferencia'
        ) {
          transfer =
            difference;
        }

        if (
          method === 'mixto'
        ) {
          cash =
            numberValue(
              args?.efectivo
            );

          transfer =
            numberValue(
              args?.transferencia
            );

          if (
            cash <= 0 ||
            transfer <= 0 ||
            cash + transfer !==
              difference
          ) {
            return prepareError(
              'En la permuta mixta, efectivo más transferencia debe ser igual a la diferencia.',
              {
                diferencia:
                  difference,

                total_indicado:
                  cash +
                  transfer
              }
            );
          }
        }
      }

      operation = {
        tipo:
          'permuta',

        vehiculo_sale_id:
          outgoing.id,

        vehiculo_sale:
          outgoing,

        precio_salida:
          salePrice,

        inversion_vehiculo_sale:
          outgoing.inversion_total,

        vehiculo_ingresa: {
          marca:
            inBrand,

          referencia:
            inRef,

          modelo:
            inModel,

          placa:
            inPlate,

          valor_acordado:
            incomingValue,

          costo_entrada_esperado:
            incomingInventoryCost
        },

        diferencia:
          difference,

        sentido_diferencia:
          direction,

        forma_pago:
          method,

        efectivo:
          cash,

        transferencia:
          transfer,

        disponible_antes:
          available,

        disponible_suficiente_si_hay_pago:
          direction !==
            'pagar' ||
          difference <=
            available,

        observaciones:
          String(
            args?.observaciones ||
            ''
          )
            .trim()
            .toUpperCase(),

        fotos_pendientes_manuales:
          true
      };

    } else {
      return prepareError(
        'Tipo de operación no reconocido.'
      );
    }

    setStatus(
      'JAY VERIFICA LA OPERACIÓN',
      'La IA supervisora está revisando los datos...',
      'listening'
    );

    try {
      const verification =
        await verifyOperation(
          operation
        );

      pendingOperation = {
        operation:
          operation,

        verification:
          verification,

        preparedAt:
          Date.now()
      };

      return {
        ok:
          verification.estado ===
          'APROBADA',

        preparada:
          true,

        operacion:
          operation,

        supervisor:
          verification,

        puede_confirmarse:
          verification.estado ===
          'APROBADA',

        instruccion:
          verification.estado ===
          'APROBADA'
            ? 'Resume la operación y pide confirmación explícita antes de guardarla.'
            : 'No guardes. Explica el problema y pide corregir los datos.'
      };

    } catch (error) {
      pendingOperation = null;

      return {
        ok: false,
        preparada: false,
        supervisor_disponible:
          false,

        mensaje:
          error.message ||
          'No fue posible verificar la operación.'
      };
    }
  }

  function isExplicitConfirmation(
    text
  ) {
    const value =
      normalizeText(text);

    if (!value) {
      return false;
    }

    const allowed = [
      'CONFIRMO',
      'SI CONFIRMO',
      'CONFIRMO LA OPERACION',
      'SI CONFIRMO LA OPERACION',
      'GUARDALO',
      'SI GUARDALO',
      'GUARDELO',
      'SI GUARDELO',
      'GUARDA LA OPERACION',
      'SI GUARDA LA OPERACION',
      'GUARDAR LA OPERACION',
      'CONFIRMA LA OPERACION',
      'SI CONFIRMA LA OPERACION'
    ];

    return allowed.includes(
      value
    );
  }

  function setField(
    id,
    value
  ) {
    const el =
      document.getElementById(
        id
      );

    if (!el) {
      throw new Error(
        'No se encontró el campo ' +
        id +
        '.'
      );
    }

    el.value =
      value == null
        ? ''
        : String(value);

    el.dispatchEvent(
      new Event(
        'input',
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

    return el;
  }

  async function executeSale(op) {
    const app =
      getAppData();

    const original =
      originalVehicleById(
        op.vehiculo_id
      );

    if (!original) {
      throw new Error(
        'El vehículo ya no está disponible para la venta.'
      );
    }

    const beforeSold =
      Array.isArray(app.sold)
        ? app.sold.length
        : 0;

    if (
      typeof show ===
      'function'
    ) {
      show('ventas');
    }

    if (
      typeof enterSalesOption ===
      'function'
    ) {
      enterSalesOption();
    }

    if (
      typeof renderSaleCards ===
      'function'
    ) {
      renderSaleCards();
    }

    if (
      typeof selectSaleVehicle !==
      'function'
    ) {
      throw new Error(
        'La función de venta no está disponible.'
      );
    }

    selectSaleVehicle(
      original.id
    );

    setField(
      'salePrice',
      moneyInput(
        op.precio_venta
      )
    );

    setField(
      'saleBuyer',
      op.comprador
    );

    setField(
      'saleDoc',
      op.documento
    );

    setField(
      'salePhone',
      op.telefono || ''
    );

    setField(
      'saleObs',
      op.observaciones ||
      ''
    );

    setField(
      'saleMethod',
      op.forma_pago
    );

    if (
      typeof toggleMixedPayment ===
      'function'
    ) {
      toggleMixedPayment();
    }

    if (
      op.forma_pago ===
      'mixto'
    ) {
      setField(
        'saleCash',
        moneyInput(
          op.efectivo
        )
      );

      setField(
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
      setField(
        'saleReceived',
        moneyInput(
          op.recibido
        )
      );
    }

    if (
      typeof updateSaleSummary ===
      'function'
    ) {
      updateSaleSummary();
    }

    if (
      typeof saveVehicleSale !==
      'function'
    ) {
      throw new Error(
        'La función de guardado de venta no está disponible.'
      );
    }

    await Promise.resolve(
      saveVehicleSale()
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          120
        )
    );

    const after =
      getAppData();

    const soldAfter =
      Array.isArray(after.sold)
        ? after.sold.length
        : 0;

    const vehicleStillExists =
      Array.isArray(after.veh)
        ? after.veh.some(
            v =>
              String(v.id) ===
              String(
                op.vehiculo_id
              )
          )
        : false;

    if (
      soldAfter <=
        beforeSold ||
      vehicleStillExists
    ) {
      throw new Error(
        'La aplicación no confirmó que la venta quedara registrada.'
      );
    }

    return {
      ok: true,
      tipo:
        'venta',
      venta_registrada:
        true,
      vehiculo_retirado_inventario:
        true
    };
  }

  async function executeOperatingExpense(
    op
  ) {
    const app =
      getAppData();

    const before =
      Array.isArray(app.mov)
        ? app.mov.length
        : 0;

    if (
      typeof openOperatingExpenseOperation ===
      'function'
    ) {
      openOperatingExpenseOperation();
    }

    setField(
      'opExpenseCategory',
      op.categoria
    );

    setField(
      'opExpenseConcept',
      op.concepto
    );

    setField(
      'opExpenseValue',
      moneyInput(op.valor)
    );

    setField(
      'opExpenseMethod',
      op.medio_pago
    );

    setField(
      'opExpenseObs',
      op.observaciones ||
      ''
    );

    if (
      typeof saveOperationsOperatingExpense !==
      'function'
    ) {
      throw new Error(
        'La función de gasto operacional no está disponible.'
      );
    }

    await Promise.resolve(
      saveOperationsOperatingExpense()
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          80
        )
    );

    const after =
      getAppData();

    const count =
      Array.isArray(after.mov)
        ? after.mov.length
        : 0;

    if (count <= before) {
      throw new Error(
        'El gasto operacional no quedó registrado.'
      );
    }

    return {
      ok: true,
      tipo:
        'gasto_operacional',
      movimiento_creado:
        true
    };
  }

  async function executeVehicleExpense(
    op
  ) {
    const original =
      originalVehicleById(
        op.vehiculo_id
      );

    if (!original) {
      throw new Error(
        'El vehículo ya no está disponible.'
      );
    }

    const app =
      getAppData();

    const beforeMov =
      Array.isArray(app.mov)
        ? app.mov.length
        : 0;

    if (
      typeof openVehicleExpenseOperation ===
      'function'
    ) {
      openVehicleExpenseOperation();
    }

    if (
      typeof selectOpVehicleExpense !==
      'function'
    ) {
      throw new Error(
        'La función de gastos de vehículo no está disponible.'
      );
    }

    selectOpVehicleExpense(
      original.id
    );

    const row =
      document.querySelector(
        '#opVehExpenseRows .opveh-expense-row'
      );

    if (!row) {
      throw new Error(
        'No se pudo abrir el formulario de gastos del vehículo.'
      );
    }

    const concept =
      row.querySelector(
        '[data-op-exp-concept]'
      );

    const value =
      row.querySelector(
        '[data-op-exp-value]'
      );

    if (
      !concept ||
      !value
    ) {
      throw new Error(
        'El formulario de gastos está incompleto.'
      );
    }

    concept.value =
      op.concepto;

    value.value =
      moneyInput(
        op.valor
      );

    value.dispatchEvent(
      new Event(
        'input',
        {
          bubbles: true
        }
      )
    );

    if (
      typeof updateOpVehicleExpenseTotals ===
      'function'
    ) {
      updateOpVehicleExpenseTotals();
    }

    if (
      typeof saveOpVehicleExpenses !==
      'function'
    ) {
      throw new Error(
        'La función de guardado del gasto no está disponible.'
      );
    }

    await Promise.resolve(
      saveOpVehicleExpenses()
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          80
        )
    );

    const after =
      getAppData();

    const count =
      Array.isArray(after.mov)
        ? after.mov.length
        : 0;

    if (
      count <=
      beforeMov
    ) {
      throw new Error(
        'El gasto del vehículo no quedó registrado.'
      );
    }

    return {
      ok: true,
      tipo:
        'gasto_vehiculo',
      movimiento_creado:
        true
    };
  }

  async function executePurchase(
    op
  ) {
    const app =
      getAppData();

    const before =
      Array.isArray(app.veh)
        ? app.veh.length
        : 0;

    if (
      typeof openOperationsPurchase ===
      'function'
    ) {
      openOperationsPurchase();
    }

    setField(
      'vmarca',
      op.marca
    );

    setField(
      'vref',
      op.referencia
    );

    setField(
      'vmodelo',
      op.modelo
    );

    setField(
      'vplaca',
      op.placa
    );

    setField(
      'vcompra',
      moneyInput(
        op.precio_compra
      )
    );

    const photo =
      document.getElementById(
        'vfoto'
      );

    if (photo) {
      photo.value = '';
    }

    if (
      typeof addVeh !==
      'function'
    ) {
      throw new Error(
        'La función de compra de vehículo no está disponible.'
      );
    }

    await Promise.resolve(
      addVeh()
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          120
        )
    );

    const after =
      getAppData();

    const count =
      Array.isArray(after.veh)
        ? after.veh.length
        : 0;

    const exists =
      Array.isArray(after.veh)
        ? after.veh.some(
            v =>
              normalizeText(
                v.pl ||
                v.placa
              ) ===
              normalizeText(
                op.placa
              )
          )
        : false;

    if (
      count <= before ||
      !exists
    ) {
      throw new Error(
        'La compra no quedó registrada en inventario.'
      );
    }

    return {
      ok: true,
      tipo:
        'compra_vehiculo',
      vehiculo_ingresado:
        true,
      foto_pendiente_manual:
        true
    };
  }

  async function executeDebtPayment(
    op
  ) {
    const app =
      getAppData();

    const before =
      Array.isArray(app.mov)
        ? app.mov.length
        : 0;

    if (
      typeof renderCashCapital ===
      'function'
    ) {
      renderCashCapital();
    }

    if (
      typeof openDebtPayment !==
      'function'
    ) {
      throw new Error(
        'La función de pago de obligaciones no está disponible.'
      );
    }

    openDebtPayment(
      op.obligacion_id
    );

    if (
      typeof setDebtPaymentType ===
      'function'
    ) {
      setDebtPaymentType(
        op.tipo_pago ===
          'pago_total'
          ? 'total'
          : 'partial'
      );
    } else {
      setField(
        'ccDebtPaymentType',
        op.tipo_pago ===
          'pago_total'
          ? 'total'
          : 'partial'
      );
    }

    if (
      op.tipo_pago !==
      'pago_total'
    ) {
      setField(
        'ccDebtValue',
        moneyInput(
          op.valor
        )
      );
    }

    setField(
      'ccDebtMethod',
      op.medio_pago
    );

    setField(
      'ccDebtObs',
      op.observaciones ||
      ''
    );

    if (
      typeof refreshDebtPaymentForm ===
      'function'
    ) {
      refreshDebtPaymentForm();
    }

    if (
      typeof saveDebtPayment !==
      'function'
    ) {
      throw new Error(
        'La función de guardado del pago no está disponible.'
      );
    }

    await Promise.resolve(
      saveDebtPayment()
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          80
        )
    );

    const after =
      getAppData();

    const count =
      Array.isArray(after.mov)
        ? after.mov.length
        : 0;

    if (count <= before) {
      throw new Error(
        'El pago de la obligación no quedó registrado.'
      );
    }

    return {
      ok: true,
      tipo:
        'pago_obligacion',
      pago_registrado:
        true
    };
  }

  async function executePermuta(
    op
  ) {
    const original =
      originalVehicleById(
        op.vehiculo_sale_id
      );

    if (!original) {
      throw new Error(
        'El vehículo que sale ya no está disponible.'
      );
    }

    const app =
      getAppData();

    const before =
      Array.isArray(
        app.permutas
      )
        ? app.permutas.length
        : 0;

    if (
      typeof togglePermutaForm ===
      'function'
    ) {
      togglePermutaForm();
    }

    if (
      typeof selectPermutaVehicle !==
      'function'
    ) {
      throw new Error(
        'La función de permuta no está disponible.'
      );
    }

    selectPermutaVehicle(
      original.id
    );

    setField(
      'permutaSalePrice',
      moneyInput(
        op.precio_salida
      )
    );

    setField(
      'permutaInMarca',
      op.vehiculo_ingresa
        .marca
    );

    setField(
      'permutaInRef',
      op.vehiculo_ingresa
        .referencia
    );

    setField(
      'permutaInModelo',
      op.vehiculo_ingresa
        .modelo
    );

    setField(
      'permutaInPlaca',
      op.vehiculo_ingresa
        .placa || ''
    );

    setField(
      'permutaInTotalCost',
      moneyInput(
        op.vehiculo_ingresa
          .valor_acordado
      )
    );

    setField(
      'permutaObs',
      op.observaciones ||
      ''
    );

    if (
      op.diferencia > 0
    ) {
      setField(
        'permutaPayMethod',
        op.forma_pago
      );

      if (
        typeof togglePermutaMixedPayment ===
        'function'
      ) {
        togglePermutaMixedPayment();
      }

      if (
        op.forma_pago ===
        'mixto'
      ) {
        setField(
          'permutaCash',
          moneyInput(
            op.efectivo
          )
        );

        setField(
          'permutaTransfer',
          moneyInput(
            op.transferencia
          )
        );
      }
    }

    if (
      typeof updatePermutaCalculations ===
      'function'
    ) {
      updatePermutaCalculations();
    }

    if (
      typeof savePermuta !==
      'function'
    ) {
      throw new Error(
        'La función de guardado de permuta no está disponible.'
      );
    }

    const saved =
      await Promise.resolve(
        savePermuta()
      );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          120
        )
    );

    const after =
      getAppData();

    const count =
      Array.isArray(
        after.permutas
      )
        ? after.permutas.length
        : 0;

    if (
      saved === false ||
      count <= before
    ) {
      throw new Error(
        'La permuta no quedó registrada.'
      );
    }

    return {
      ok: true,
      tipo:
        'permuta',
      permuta_registrada:
        true,
      fotos_pendientes_manuales:
        true
    };
  }

  async function executeOperation(
    op
  ) {
    if (
      op.tipo === 'venta'
    ) {
      return executeSale(op);
    }

    if (
      op.tipo ===
      'gasto_operacional'
    ) {
      return executeOperatingExpense(
        op
      );
    }

    if (
      op.tipo ===
      'gasto_vehiculo'
    ) {
      return executeVehicleExpense(
        op
      );
    }

    if (
      op.tipo ===
      'compra_vehiculo'
    ) {
      return executePurchase(
        op
      );
    }

    if (
      op.tipo ===
      'pago_obligacion'
    ) {
      return executeDebtPayment(
        op
      );
    }

    if (
      op.tipo ===
      'permuta'
    ) {
      return executePermuta(
        op
      );
    }

    throw new Error(
      'No existe un ejecutor para la operación ' +
      op.tipo +
      '.'
    );
  }

  function appStateForAudit() {
    const app =
      getAppData();

    return {
      financiero:
        getFinancialSummary(),

      vehiculos:
        Array.isArray(app.veh)
          ? app.veh.length
          : 0,

      ventas:
        Array.isArray(app.sold)
          ? app.sold.length
          : 0,

      permutas:
        Array.isArray(
          app.permutas
        )
          ? app.permutas.length
          : 0,

      movimientos:
        Array.isArray(app.mov)
          ? app.mov.length
          : 0,

      operaciones_capital:
        Array.isArray(
          app.capitalOps
        )
          ? app.capitalOps.length
          : 0
    };
  }

  async function postAudit(
    operation,
    execution,
    before,
    after
  ) {
    const auditOperation = {
      tipo:
        'auditoria_posterior',

      operacion_original:
        operation,

      resultado_ejecucion:
        execution,

      estado_antes:
        before,

      estado_despues:
        after,

      objetivo:
        'Verificar que el resultado posterior sea coherente con la operación ejecutada. Si hay inconsistencia, marcar ADVERTENCIA o BLOQUEADA y explicarla.'
    };

    try {
      return await verifyOperation(
        auditOperation,
        {
          estado_antes:
            before,

          estado_despues:
            after,

          movimientos_recientes:
            recentMovements()
        }
      );

    } catch (error) {
      return {
        estado:
          'ADVERTENCIA',

        resumen:
          'La operación fue guardada, pero no fue posible completar la auditoría posterior.',

        razon:
          error.message ||
          'Supervisor no disponible.',

        verificaciones:
          [],

        riesgos: [
          'Auditoría posterior no completada'
        ],

        recomendacion:
          'Revisar el movimiento en Extractos.',

        requiere_confirmacion:
          false,

        confianza:
          0
      };
    }
  }

  async function confirmOperation() {
    if (!pendingOperation) {
      return {
        ok: false,
        guardada: false,
        mensaje:
          'No hay una operación pendiente de confirmación.'
      };
    }

    if (
      pendingOperation
        .verification
        ?.estado !==
      'APROBADA'
    ) {
      return {
        ok: false,
        guardada: false,
        mensaje:
          'La operación no está aprobada por la IA supervisora.'
      };
    }

    const age =
      Date.now() -
      lastUserTranscriptAt;

    if (
      age > 30000 ||
      !isExplicitConfirmation(
        lastUserTranscript
      )
    ) {
      return {
        ok: false,
        guardada: false,
        confirmacion_valida:
          false,

        mensaje:
          'No detecté una confirmación explícita reciente del usuario. Pide que diga: confirmo o guárdalo.'
      };
    }

    setStatus(
      'JAY REVALIDA LA OPERACIÓN',
      'Comprobando el estado actual antes de guardar...',
      'listening'
    );

    let secondVerification;

    try {
      secondVerification =
        await verifyOperation(
          pendingOperation
            .operation
        );

    } catch (error) {
      return {
        ok: false,
        guardada: false,

        mensaje:
          'No se pudo realizar la verificación final: ' +
          error.message
      };
    }

    if (
      secondVerification.estado !==
      'APROBADA'
    ) {
      pendingOperation.verification =
        secondVerification;

      return {
        ok: false,
        guardada: false,

        supervisor:
          secondVerification,

        mensaje:
          'La verificación final ya no aprueba la operación. No se guardó.'
      };
    }

    const operation =
      pendingOperation.operation;

    const before =
      appStateForAudit();

    setStatus(
      'JAY GUARDA LA OPERACIÓN',
      'Confirmación recibida. Registrando...',
      'listening'
    );

    try {
      const execution =
        await executeOperation(
          operation
        );

      const after =
        appStateForAudit();

      const audit =
        await postAudit(
          operation,
          execution,
          before,
          after
        );

      pendingOperation =
        null;

      return {
        ok: true,
        guardada: true,

        ejecucion:
          execution,

        auditoria_posterior:
          audit,

        estado_final:
          audit.estado ===
          'APROBADA'
            ? 'VERIFICADA'
            : 'GUARDADA_CON_ADVERTENCIA'
      };

    } catch (error) {
      console.error(
        'JAY ejecución de operación:',
        error
      );

      return {
        ok: false,
        guardada: false,

        mensaje:
          error.message ||
          'La operación no pudo guardarse.'
      };
    }
  }

  function cancelOperation() {
    const existed =
      !!pendingOperation;

    pendingOperation = null;

    return {
      ok: true,
      cancelada:
        existed,

      mensaje:
        existed
          ? 'La operación pendiente fue cancelada.'
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
              (sum, v) =>
                sum +
                numberValue(
                  v.inversion_total
                ),
              0
            ),

          vehiculos:
            rows.slice(0, 40)
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

      case 'obtener_hora_dispositivo':
        return getDeviceContext();

      case 'preparar_operacion':
        return prepareOperation(
          args || {}
        );

      case 'confirmar_operacion':
        if (
          args?.confirmacion !==
          'CONFIRMO'
        ) {
          return {
            ok: false,
            guardada: false,
            mensaje:
              'Confirmación inválida.'
          };
        }

        return confirmOperation();

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
    if (!msg) return;

    const callId =
      msg.call_id;

    if (
      !callId ||
      processedCalls.has(
        callId
      )
    ) {
      return;
    }

    processedCalls.add(
      callId
    );

    let args = {};

    try {
      args =
        msg.arguments
          ? JSON.parse(
              msg.arguments
            )
          : {};
    } catch (e) {
      args = {};
    }

    setStatus(
      'JAY ESTÁ TRABAJANDO',
      'Consultando MULTI INVERSIONES...',
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
            callId,

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
      handleToolCall(msg);
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
            handleToolCall(item)
        );
    }

    if (
      msg.type ===
      'conversation.item.input_audio_transcription.completed'
    ) {
      if (msg.transcript) {
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
      if (msg.transcript) {
        setStatus(
          'JAY IA',
          msg.transcript
        );
      }
    }

    if (
      msg.type === 'error'
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
    if (active) {
      stopJayAI();
      return;
    }

    if (connecting) {
      return;
    }

    connecting = true;

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

      document.body.appendChild(
        remoteAudio
      );

      pc.ontrack =
        event => {
          remoteAudio.srcObject =
            event.streams[0];

          remoteAudio
            .play()
            .catch(() => {});
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
          if (active) {
            cleanup();

            setStatus(
              'JAY IA DESCONECTADO',
              'Toca el micrófono para reconectar.'
            );
          }
        };

      dc.onopen =
        () => {
          active = true;
          connecting = false;

          setStatus(
            'JAY IA ACTIVO',
            'Conectado a MULTI INVERSIONES. Ya puedes hablar conmigo.',
            'listening'
          );

          dc.send(
            JSON.stringify({
              type:
                'response.create',

              response: {
                instructions:
                  'Saluda brevemente. Indica que estás conectado a MULTI INVERSIONES, puedes consultar datos reales y preparar operaciones que serán revisadas antes de guardar.'
              }
            })
          );
        };

      const offer =
        await pc.createOffer();

      await pc.setLocalDescription(
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

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(
          errorText ||
          'No se pudo conectar con JAY IA'
        );
      }

      const answerSdp =
        await response.text();

      await pc.setRemoteDescription({
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
      if (active) {
        stopJayAI();
      } else {
        startJayAI();
      }
    };

  window.JayAI = {
    version:
      '3.0',

    start:
      startJayAI,

    stop:
      stopJayAI,

    isActive:
      () => active,

    getPendingOperation:
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
    'JAY IA REALTIME V3 ACTIVO'
  );
})();

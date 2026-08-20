(function () {
  'use strict';

  let pc = null;
  let dc = null;
  let micStream = null;
  let remoteAudio = null;
  let active = false;
  let connecting = false;

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
          timeZone: timeZone,
          dateStyle: 'short',
          timeStyle: 'medium'
        }
      );
  } catch (e) {
    localDateTime =
      now.toString();
  }

  return {
    ok: true,
    timeZone: timeZone,
    locale: locale,
    localDateTime: localDateTime,
    iso: now.toISOString(),
    offsetMinutes:
      -now.getTimezoneOffset()
  };
}
  function getAppData() {
    try {
      if (typeof data !== 'undefined' && data) {
        return data;
      }
    } catch (e) {}

    try {
      return JSON.parse(
        localStorage.getItem('jcp_app_v1') || '{}'
      );
    } catch (e) {
      return {};
    }
  }

  function vehicleRows(query) {
    const app = getAppData();

    const rows =
      Array.isArray(app.veh)
        ? app.veh.filter(Boolean)
        : [];

    const q = normalizeText(query);

    const filtered = q
      ? rows.filter(v => {
          const haystack = normalizeText(
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
            q.split(/\s+/).filter(Boolean);

          return terms.every(
            term => haystack.includes(term)
          );
        })
      : rows;

    return filtered.map(v => ({
      id: String(v.id || ''),

      placa: String(
        v.pl ||
        v.placa ||
        ''
      ).toUpperCase(),

      marca: String(
        v.marca ||
        v.m ||
        ''
      ).toUpperCase(),

      referencia: String(
        v.ref ||
        v.referencia ||
        ''
      ).toUpperCase(),

      modelo: String(v.modelo || ''),

      precio_compra:
        Number(v.c || 0),

      gastos_asociados:
        Number(v.g || 0),

      inversion_total:
        Number(v.c || 0) +
        Number(v.g || 0)
    }));
  }

  function getFinancialSummary() {
    let f = null;

    try {
      if (
        typeof getFinancialSnapshotV75 ===
        'function'
      ) {
        f = getFinancialSnapshotV75();
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
          'La aplicación no pudo calcular el resumen financiero en este momento.'
      };
    }

    const n = value =>
      Number(value || 0);

    const app = getAppData();

    return {
      ok: true,

      capital_inicial:
        n(f.initial),

      aportes:
        n(f.contributions),

      capital_actual:
        n(f.capital),

      financiacion_recibida:
        n(f.financing),

      deuda_pagada:
        n(f.debtPaid),

      deuda_pendiente:
        n(f.debt),

      inversion_vehiculos:
        n(f.vehicleInvestment),

      otras_inversiones:
        n(f.otherInvestment),

      total_invertido:
        n(f.invested),

      por_cobrar_prestamos:
        n(f.loanReceivable),

      por_cobrar_ventas:
        n(f.saleReceivable),

      utilidad_bruta:
        n(f.grossProfit),

      utilidad_acumulada:
        n(f.accumulatedProfit),

      gastos_operativos:
        n(f.operatingExpenses),

      utilidad_neta:
        n(f.netProfit),

      utilidad_disponible:
        n(f.profitAvailable),

      disponible:
        n(f.available),

      vehiculos_en_inventario:
        Array.isArray(app.veh)
          ? app.veh.length
          : 0,

      ventas_registradas:
        Array.isArray(app.sold)
          ? app.sold.length
          : 0,

      permutas_registradas:
        Array.isArray(app.permutas)
          ? app.permutas.length
          : 0,

      prestamos_registrados:
        Array.isArray(app.pres)
          ? app.pres.length
          : 0
    };
  }

  function openModule(moduleName) {
    const module =
      String(moduleName || '')
        .toLowerCase();

    try {
      switch (module) {
        case 'inicio':
          if (typeof show === 'function') {
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
            show('vehiculos');
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
          if (typeof show === 'function') {
            show('detalleCapital');
          }
          break;

        case 'capital_financiacion':
          if (typeof show === 'function') {
            show('capitalFinanciacion');
          }
          break;

        case 'prestamos':
          if (typeof show === 'function') {
            show('prestamos');
          }
          break;

        case 'clientes':
          if (typeof show === 'function') {
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
          if (typeof show === 'function') {
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
          if (typeof show === 'function') {
            show('cierreCaja');
          }
          break;

        case 'historial_financiero':
          if (typeof show === 'function') {
            show('historialFinanciero');
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
        modulo: module,
        abierto: true
      };

    } catch (error) {
      console.error(
        'JAY abrir módulo:',
        error
      );

      return {
        ok: false,
        modulo: module,
        error:
          error.message ||
          'No fue posible abrir el módulo.'
      };
    }
  }

  function openVehicle(query) {
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
          'Hay varias coincidencias. Pregunta al usuario cuál quiere abrir.'
      };
    }

    const vehicle =
      matches[0];

    const app =
      getAppData();

    const originalVehicle =
      Array.isArray(app.veh)
        ? app.veh.find(
            v =>
              String(v.id) ===
              String(vehicle.id)
          )
        : null;

    const realId =
      originalVehicle
        ? originalVehicle.id
        : vehicle.id;

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
                realId
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
        vehiculo: vehicle
      };

    } catch (error) {
      console.error(
        'JAY abrir vehículo:',
        error
      );

      return {
        ok: false,
        error:
          error.message ||
          'No fue posible abrir el vehículo.'
      };
    }
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
            args?.consulta || ''
          );

        return {
          ok: true,

          consulta:
            args?.consulta || '',

          cantidad:
            rows.length,

          inversion_total_inventario:
            rows.reduce(
              (sum, v) =>
                sum +
                Number(
                  v.inversion_total ||
                  0
                ),
              0
            ),

          vehiculos:
            rows.slice(0, 40)
        };
      }

      case 'abrir_vehiculo':
        return openVehicle(
          args?.consulta || ''
        );

      case 'abrir_modulo':
        return openModule(
          args?.modulo || ''
        );

      default:
        return {
          ok: false,
          error:
            'Herramienta no implementada: ' +
            name
        };
    }
  }

  async function handleToolCall(msg) {
    if (!msg) return;

    const callId =
      msg.call_id;

    if (!callId) return;

    if (
      processedCalls.has(callId)
    ) {
      return;
    }

    processedCalls.add(callId);

    let args = {};

    try {
      args =
        msg.arguments
          ? JSON.parse(msg.arguments)
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
      dc.readyState !== 'open'
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
            JSON.stringify(result)
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

  function handleRealtimeEvent(event) {
    let msg;

    try {
      msg =
        JSON.parse(event.data);
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
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
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
          track => {
            pc.addTrack(
              track,
              micStream
            );
          }
        );

      dc =
        pc.createDataChannel(
          'oai-events'
        );

      dc.onmessage =
        handleRealtimeEvent;

      dc.onerror =
        error => {
          console.error(
            'JAY DATA CHANNEL:',
            error
          );
        };

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
                  'Saluda brevemente al usuario. Dile que ya estás conectado a MULTI INVERSIONES y que puedes consultar información real y abrir módulos de la aplicación.'
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
    version: '2.0',

    start:
      startJayAI,

    stop:
      stopJayAI,

    isActive:
      () => active,

    tools: {
      obtenerResumenFinanciero:
        getFinancialSummary,

      obtenerInventario:
        vehicleRows,

      abrirModulo:
        openModule,

      abrirVehiculo:
        openVehicle
    }
  };

  console.log(
    'JAY IA REALTIME V2 ACTIVO'
  );
})();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método no permitido'
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY no está configurada'
    });
  }

  try {
    const sdp = req.body?.sdp;

    if (!sdp) {
      return res.status(400).json({
        error: 'No se recibió la oferta WebRTC'
      });
    }

    const session = {
      type: 'realtime',
      model: 'gpt-realtime',
      output_modalities: ['audio'],

      instructions: `
Eres JAY, el asistente inteligente integrado dentro de
MULTI INVERSIONES JCP.

Habla siempre en español colombiano.

Tu forma de hablar debe ser natural, cercana,
profesional, clara y breve cuando uses voz.

MULTI INVERSIONES JCP administra:

- compra de vehículos
- venta de vehículos
- inventario
- gastos asociados a vehículos
- gastos operacionales
- permutas
- capital
- financiación
- créditos
- préstamos recibidos
- obligaciones
- pagos y abonos
- préstamos realizados a clientes
- cuentas por cobrar
- clientes
- caja
- disponible
- extractos
- soportes
- cierres de caja
- utilidades

Mantén siempre el contexto de la conversación.

El usuario puede hablar normalmente.
No necesita usar comandos exactos.

Cuando el usuario pregunte por información real
de MULTI INVERSIONES debes consultar las herramientas.

Nunca inventes:

- dinero
- vehículos
- placas
- clientes
- deudas
- saldos
- disponible
- inversiones
- utilidades
- cuentas por cobrar

Para información financiera usa:
obtener_resumen_financiero.

Para vehículos usa:
obtener_inventario.

Para abrir un vehículo usa:
abrir_vehiculo.

Para navegar usa:
abrir_modulo.

Para conocer la hora y zona horaria del dispositivo usa:
obtener_hora_dispositivo.

Ahora también puedes ayudar a preparar operaciones.

Las operaciones permitidas son:

- venta
- gasto_operacional
- gasto_vehiculo
- compra_vehiculo
- pago_obligacion
- permuta

Para preparar cualquiera de ellas usa:
preparar_operacion.

PREPARAR NO SIGNIFICA GUARDAR.

Cuando prepares una operación:

1. Recoge los datos necesarios conversando con el usuario.

2. No inventes información faltante.

3. Usa preparar_operacion.

4. La aplicación enviará la operación a una segunda IA
supervisora independiente.

5. Si la supervisora responde APROBADA,
explica al usuario un resumen breve y exacto.

6. Después pide confirmación explícita.

7. Para guardar, el usuario debe confirmar claramente.

Ejemplos válidos:

"Confirmo."

"Sí, confirmo."

"Guárdalo."

"Sí, guárdalo."

"Confirma la operación."

8. Nunca interpretes silencio, una respuesta ambigua,
"ok" aislado durante otra explicación,
o una pregunta como autorización para guardar.

9. Solamente después de una confirmación explícita
puedes utilizar confirmar_operacion.

10. La aplicación tiene controles adicionales y puede
rechazar la confirmación si no detecta autorización
explícita del usuario.

11. Si la supervisora devuelve ADVERTENCIA,
explica el problema y pide corregir los datos.
No guardes.

12. Si devuelve BLOQUEADA,
explica el error y no guardes.

13. Si el usuario dice cancelar, no, déjalo así,
no guardar o algo equivalente,
usa cancelar_operacion.

14. No modifiques valores para hacer que una operación
sea aprobada.

15. Si detectas un posible error de reconocimiento de voz,
por ejemplo una cifra extraña,
confirma primero el valor con el usuario.

VENTAS:

Antes de preparar una venta debes conocer:

- vehículo
- precio de venta
- comprador
- documento
- forma de pago

Si es pago mixto también necesitas:

- valor en efectivo
- valor por transferencia

Si es crédito necesitas:

- abono recibido

COMPRAS:

Necesitas:

- marca
- referencia
- modelo
- placa
- precio de compra

La foto puede agregarse manualmente después si hace falta.

GASTO OPERACIONAL:

Necesitas:

- categoría
- concepto
- valor
- medio de pago

GASTO DE VEHÍCULO:

Necesitas:

- vehículo
- concepto
- valor

PAGO DE OBLIGACIÓN:

Necesitas:

- obligación
- tipo de pago: abono o pago total
- valor si es abono
- medio de pago

PERMUTA:

Necesitas:

- vehículo que sale
- precio acordado de salida
- marca del vehículo que ingresa
- referencia
- modelo
- placa si está disponible
- valor acordado del vehículo recibido
- forma de pago de la diferencia si existe

Nunca afirmes que una operación quedó guardada
hasta que confirmar_operacion devuelva éxito.

Después del guardado explica brevemente
qué operación quedó registrada.
      `,

      tool_choice: 'auto',

      tools: [
        {
          type: 'function',
          name: 'obtener_resumen_financiero',
          description:
            'Obtiene las cifras reales y actuales de MULTI INVERSIONES JCP.',

          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'obtener_inventario',
          description:
            'Consulta el inventario real de vehículos. Puede buscar por placa, marca, referencia o modelo.',

          parameters: {
            type: 'object',

            properties: {
              consulta: {
                type: 'string',
                description:
                  'Placa, marca, referencia o modelo. Puede dejarse vacío para listar todo.'
              }
            },

            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'abrir_vehiculo',
          description:
            'Busca un vehículo real y abre su ficha.',

          parameters: {
            type: 'object',

            properties: {
              consulta: {
                type: 'string'
              }
            },

            required: ['consulta'],
            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'abrir_modulo',
          description:
            'Abre un módulo de MULTI INVERSIONES JCP.',

          parameters: {
            type: 'object',

            properties: {
              modulo: {
                type: 'string',

                enum: [
                  'inicio',
                  'vehiculos',
                  'operaciones',
                  'ventas',
                  'compras',
                  'gastos',
                  'finanzas',
                  'capital',
                  'capital_financiacion',
                  'prestamos',
                  'clientes',
                  'soportes',
                  'extractos',
                  'cartera',
                  'cierre_caja',
                  'historial_financiero'
                ]
              }
            },

            required: ['modulo'],
            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'obtener_hora_dispositivo',
          description:
            'Obtiene la fecha, hora y zona horaria configurada en el celular, tablet o computador donde está abierta MULTI INVERSIONES.',

          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'preparar_operacion',
          description:
            'Prepara una operación financiera o comercial. No la guarda. La operación será revisada por la IA supervisora antes de solicitar confirmación.',

          parameters: {
            type: 'object',

            properties: {
              tipo: {
                type: 'string',

                enum: [
                  'venta',
                  'gasto_operacional',
                  'gasto_vehiculo',
                  'compra_vehiculo',
                  'pago_obligacion',
                  'permuta'
                ]
              },

              vehiculo: {
                type: 'string',
                description:
                  'Placa, marca, referencia o modelo del vehículo relacionado.'
              },

              precio_venta: {
                type: 'number'
              },

              comprador: {
                type: 'string'
              },

              documento: {
                type: 'string'
              },

              telefono: {
                type: 'string'
              },

              forma_pago: {
                type: 'string',

                enum: [
                  'efectivo',
                  'transferencia',
                  'mixto',
                  'credito'
                ]
              },

              efectivo: {
                type: 'number'
              },

              transferencia: {
                type: 'number'
              },

              recibido: {
                type: 'number'
              },

              categoria: {
                type: 'string'
              },

              concepto: {
                type: 'string'
              },

              valor: {
                type: 'number'
              },

              medio_pago: {
                type: 'string',

                enum: [
                  'efectivo',
                  'transferencia'
                ]
              },

              observaciones: {
                type: 'string'
              },

              marca: {
                type: 'string'
              },

              referencia: {
                type: 'string'
              },

              modelo: {
                type: 'string'
              },

              placa: {
                type: 'string'
              },

              precio_compra: {
                type: 'number'
              },

              obligacion: {
                type: 'string',
                description:
                  'Nombre, concepto o identificador de la obligación.'
              },

              tipo_pago: {
                type: 'string',

                enum: [
                  'abono',
                  'pago_total'
                ]
              },

              vehiculo_ingresa_marca: {
                type: 'string'
              },

              vehiculo_ingresa_referencia: {
                type: 'string'
              },

              vehiculo_ingresa_modelo: {
                type: 'string'
              },

              vehiculo_ingresa_placa: {
                type: 'string'
              },

              valor_vehiculo_ingresa: {
                type: 'number'
              }
            },

            required: ['tipo'],
            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'confirmar_operacion',
          description:
            'Solicita guardar la operación que ya fue preparada y aprobada por la IA supervisora. Solo puede utilizarse después de una confirmación explícita del usuario.',

          parameters: {
            type: 'object',

            properties: {
              confirmacion: {
                type: 'string',
                enum: ['CONFIRMO']
              }
            },

            required: ['confirmacion'],
            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'cancelar_operacion',
          description:
            'Cancela la operación pendiente sin guardar cambios.',

          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      ],

      audio: {
        input: {
          noise_reduction: {
            type: 'far_field'
          },

          transcription: {
            model: 'gpt-4o-mini-transcribe',
            language: 'es'
          },

          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'medium',
            create_response: true,
            interrupt_response: true
          }
        },

        output: {
          voice: 'marin',
          speed: 1
        }
      }
    };

    const boundary =
      '----JAYBOUNDARY' + Date.now();

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="sdp"\r\n` +
      `Content-Type: application/sdp\r\n\r\n` +
      sdp +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="session"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(session) +
      `\r\n` +
      `--${boundary}--\r\n`;

    const response = await fetch(
      'https://api.openai.com/v1/realtime/calls',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          'Content-Type':
            `multipart/form-data; boundary=${boundary}`
        },

        body: multipartBody
      }
    );

    const result =
      await response.text();

    if (!response.ok) {
      console.error(
        'OpenAI Realtime:',
        result
      );

      return res
        .status(response.status)
        .json({
          error:
            'No fue posible iniciar JAY IA',

          detail:
            result
        });
    }

    res.setHeader(
      'Content-Type',
      'application/sdp'
    );

    return res
      .status(201)
      .send(result);

  } catch (error) {
    console.error(
      'JAY IA:',
      error
    );

    return res.status(500).json({
      error:
        'Error interno iniciando JAY IA'
    });
  }
}

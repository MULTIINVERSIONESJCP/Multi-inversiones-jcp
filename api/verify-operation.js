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
    const body = req.body || {};
    const operation = body.operation || null;
    const snapshot = body.snapshot || {};
    const context = body.context || {};

    if (!operation || typeof operation !== 'object') {
      return res.status(400).json({
        error: 'No se recibió una operación válida'
      });
    }

    const schema = {
      type: 'object',

      properties: {
        estado: {
          type: 'string',
          enum: [
            'APROBADA',
            'ADVERTENCIA',
            'BLOQUEADA'
          ]
        },

        resumen: {
          type: 'string'
        },

        razon: {
          type: 'string'
        },

        verificaciones: {
          type: 'array',
          items: {
            type: 'string'
          }
        },

        riesgos: {
          type: 'array',
          items: {
            type: 'string'
          }
        },

        recomendacion: {
          type: 'string'
        },

        requiere_confirmacion: {
          type: 'boolean'
        },

        confianza: {
          type: 'integer',
          minimum: 0,
          maximum: 100
        }
      },

      required: [
        'estado',
        'resumen',
        'razon',
        'verificaciones',
        'riesgos',
        'recomendacion',
        'requiere_confirmacion',
        'confianza'
      ],

      additionalProperties: false
    };

    const instructions = `
Eres el supervisor financiero y operativo de
MULTI INVERSIONES JCP.

Tu función es revisar las operaciones preparadas
por JAY antes de que sean guardadas.

Debes actuar como un control independiente.

La aplicación administra:

compra y venta de vehículos,
inventario,
permutas,
gastos de vehículos,
gastos operacionales,
capital,
financiación,
créditos,
préstamos,
pagos de obligaciones,
cuentas por cobrar,
caja,
disponible,
utilidades,
clientes,
extractos
y cierres de caja.

Analiza únicamente los datos recibidos.

No inventes información.

Comprueba cuando corresponda:

que los valores sean coherentes,

que no existan valores negativos inesperados,

que el vehículo exista,

que la placa o identificación coincida,

que la operación corresponda al tipo correcto,

que exista dinero disponible cuando haya
una salida de caja,

que precio de compra más gastos coincida
con la inversión,

que una venta sea coherente con la inversión,

que efectivo y transferencia coincidan
con los valores de la operación,

que recibido más pendiente coincida
con el precio de venta,

que un pago de deuda no supere
el saldo pendiente,

que un gasto de vehículo esté asociado
a un vehículo existente,

que los campos obligatorios estén presentes,

que no parezca existir una operación duplicada,

y que la operación no produzca
una inconsistencia financiera evidente.

Usa únicamente estos estados:

APROBADA:
La operación es coherente y puede pasar
a confirmación del usuario.

ADVERTENCIA:
Existe una duda o dato que debe revisarse.
No debe guardarse todavía.

BLOQUEADA:
Existe un error o riesgo importante.
No debe guardarse.

Toda operación que modifique dinero,
vehículos, ventas, gastos, préstamos,
deudas, permutas o capital requiere
confirmación humana.

No ejecutes operaciones.

No modifiques datos.

Tu función es revisar, detectar errores
y recomendar una solución.

No reveles razonamiento interno detallado.

Entrega conclusiones breves y claras.
`;

    const input = {
      operacion_preparada: operation,

      estado_actual: snapshot,

      contexto_dispositivo: {
        zona_horaria:
          context.timeZone ||
          'NO INFORMADA',

        fecha_hora_local:
          context.localDateTime ||
          'NO INFORMADA',

        idioma:
          context.locale ||
          'es-CO'
      }
    };

    const response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          model:
            'gpt-5.6-terra',

          instructions:
            instructions,

          input:
            JSON.stringify(input),

          text: {
            format: {
              type:
                'json_schema',

              name:
                'verificacion_operacion',

              strict:
                true,

              schema:
                schema
            }
          }
        })
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      console.error(
        'SUPERVISOR IA:',
        result
      );

      return res
        .status(response.status)
        .json({
          error:
            'La IA supervisora no pudo verificar la operación',

          detail:
            result
        });
    }

    let text = '';

    const output =
      Array.isArray(result.output)
        ? result.output
        : [];

    for (const item of output) {
      const content =
        Array.isArray(item.content)
          ? item.content
          : [];

      for (const part of content) {
        if (
          part &&
          part.type === 'output_text' &&
          part.text
        ) {
          text += part.text;
        }
      }
    }

    if (!text) {
      return res.status(502).json({
        error:
          'La IA supervisora no devolvió un resultado'
      });
    }

    let verification;

    try {
      verification =
        JSON.parse(text);
    } catch (error) {
      console.error(
        'SUPERVISOR JSON:',
        text
      );

      return res.status(502).json({
        error:
          'No fue posible interpretar la verificación'
      });
    }

    return res.status(200).json({
      ok: true,
      verification:
        verification
    });

  } catch (error) {
    console.error(
      'SUPERVISOR IA:',
      error
    );

    return res.status(500).json({
      error:
        'Error interno verificando la operación'
    });
  }
}

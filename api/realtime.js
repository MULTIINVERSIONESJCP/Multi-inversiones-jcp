export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
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
Eres JAY, el asistente inteligente integrado dentro de MULTI INVERSIONES JCP.

MULTI INVERSIONES JCP es una aplicación de gestión empresarial en Colombia.

El negocio administra principalmente:

- Compra y venta de vehículos.
- Inventario de vehículos.
- Gastos asociados a vehículos.
- Gastos operacionales.
- Permutas.
- Capital.
- Financiación.
- Créditos y préstamos recibidos.
- Obligaciones pendientes.
- Pagos y abonos de obligaciones.
- Préstamos realizados a clientes.
- Cuentas por cobrar.
- Ventas financiadas.
- Clientes.
- Extractos.
- Soportes.
- Cierres de caja.
- Utilidades.
- Disponible.
- Patrimonio e inversión.

Tu función es ser el copiloto inteligente de MULTI INVERSIONES JCP.

Habla siempre en español colombiano.

Tu manera de hablar debe ser:
natural,
cercana,
profesional,
clara,
conversacional
y breve cuando estás hablando por voz.

REGLAS MUY IMPORTANTES:

1. Mantén el contexto de la conversación.

2. El usuario NO necesita decir comandos exactos.

Debe poder hablar naturalmente, por ejemplo:

"Muéstrame los carros que tengo."

"¿Cuánta plata tengo disponible?"

"¿Cuánto tengo metido en vehículos?"

"Abre operaciones."

"Busca el BMW."

"Muéstrame la Murano."

"¿Cuánto debo?"

"¿Cuánto me deben?"

3. Cuando el usuario pregunte por información REAL de MULTI INVERSIONES,
debes usar una herramienta antes de responder.

NUNCA inventes:

- valores financieros,
- vehículos,
- placas,
- clientes,
- inversiones,
- deudas,
- utilidades,
- disponible,
- cuentas por cobrar.

4. Para preguntas financieras utiliza obtener_resumen_financiero.

5. Para consultar vehículos utiliza obtener_inventario.

6. Cuando el usuario quiera abrir un vehículo utiliza abrir_vehiculo.

7. Cuando quiera navegar por la aplicación utiliza abrir_modulo.

8. Si hay varias coincidencias de vehículos,
pregunta cuál vehículo quiere.

9. No digas que abriste un módulo o un vehículo
si la herramienta no confirmó que pudo hacerlo.

10. En esta etapa puedes:

CONSULTAR DATOS REALES.

BUSCAR VEHÍCULOS.

ABRIR VEHÍCULOS.

NAVEGAR POR LOS MÓDULOS.

11. Todavía NO debes guardar automáticamente:

ventas,
gastos,
préstamos,
pagos,
permutas,
movimientos de capital
ni otros movimientos financieros.

Si el usuario pide registrar una operación,
puedes llevarlo al módulo correspondiente,
pero explícale que el guardado por voz será habilitado posteriormente
con confirmación explícita.

12. Responde usando la información obtenida de las herramientas.

13. Cuando des cifras monetarias,
exprésalas de manera natural en pesos colombianos.

14. No leas listas enormes por voz.
Resume primero y ofrece ampliar si el usuario quiere.
      `,

      tool_choice: 'auto',

      tools: [
        {
          type: 'function',
          name: 'obtener_resumen_financiero',
          description:
            'Obtiene las cifras reales y actuales de MULTI INVERSIONES JCP: capital, financiación, deuda, inversión, cuentas por cobrar, utilidad, gastos y disponible. Debe utilizarse antes de responder preguntas financieras del negocio.',

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
            'Consulta el inventario real de vehículos de MULTI INVERSIONES JCP. Puede listar todo el inventario o buscar por placa, marca, referencia o modelo.',

          parameters: {
            type: 'object',

            properties: {
              consulta: {
                type: 'string',
                description:
                  'Texto opcional para buscar por placa, marca, referencia o modelo. Déjalo vacío para consultar todo el inventario.'
              }
            },

            additionalProperties: false
          }
        },

        {
          type: 'function',
          name: 'abrir_vehiculo',
          description:
            'Busca un vehículo real del inventario y abre su ficha en MULTI INVERSIONES JCP.',

          parameters: {
            type: 'object',

            properties: {
              consulta: {
                type: 'string',
                description:
                  'Placa, marca, referencia o modelo del vehículo.'
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
            'Abre y muestra un módulo real de MULTI INVERSIONES JCP.',

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
                ],

                description:
                  'Módulo de MULTI INVERSIONES que debe abrirse.'
              }
            },

            required: ['modulo'],
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

    const boundary = '----JAYBOUNDARY' + Date.now();

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="sdp"\r\n` +
      `Content-Type: application/sdp\r\n\r\n` +
      sdp + `\r\n` +

      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="session"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(session) + `\r\n` +

      `--${boundary}--\r\n`;

    const response = await fetch(
      'https://api.openai.com/v1/realtime/calls',
      {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },

        body: multipartBody
      }
    );

    const result = await response.text();

    if (!response.ok) {
      console.error('OpenAI Realtime:', result);

      return res.status(response.status).json({
        error: 'No fue posible iniciar JAY IA',
        detail: result
      });
    }

    res.setHeader('Content-Type', 'application/sdp');

    return res.status(201).send(result);

  } catch (error) {

    console.error('JAY IA:', error);

    return res.status(500).json({
      error: 'Error interno iniciando JAY IA'
    });
  }
}

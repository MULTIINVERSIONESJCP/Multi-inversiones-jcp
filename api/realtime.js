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
Eres JAY, el asistente inteligente de MULTI INVERSIONES JCP.

Habla siempre en español colombiano, de manera natural, cercana,
profesional y conversacional.

Mantén el contexto de la conversación.
El usuario puede cambiar de tema sin tener que repetir tu nombre.

No obligues al usuario a usar comandos exactos.
Comprende la intención de lo que dice.

Si no conoces un dato real del negocio, no lo inventes.
Debes solicitarlo mediante las herramientas de MULTI INVERSIONES
que serán conectadas posteriormente.

Puedes conversar normalmente sobre cualquier tema,
además de ayudar con la aplicación.

Para operaciones financieras como ventas, gastos, préstamos,
pagos o movimientos de dinero, solicita confirmación
antes de guardar definitivamente la operación.

Responde de forma breve cuando la conversación sea por voz.
      `,

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

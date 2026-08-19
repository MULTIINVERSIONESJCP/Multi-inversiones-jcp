/* MULTI INVERSIONES JCP — JAY IA REALTIME v1 */
(function () {
  'use strict';

  let pc = null;
  let dc = null;
  let micStream = null;
  let remoteAudio = null;
  let active = false;
  let connecting = false;

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

    if (dc) {
      try { dc.close(); } catch (e) {}
      dc = null;
    }

    if (pc) {
      try { pc.close(); } catch (e) {}
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

  function handleRealtimeEvent(event) {
    let msg;

    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    console.log('JAY IA EVENT:', msg);

    if (msg.type === 'conversation.item.input_audio_transcription.completed') {
      if (msg.transcript) {
        setStatus(
          'TE ESCUCHÉ',
          msg.transcript,
          'listening'
        );
      }
    }

    if (msg.type === 'input_audio_buffer.speech_started') {
      setStatus(
        'JAY TE ESCUCHA',
        'Habla con naturalidad.',
        'listening'
      );
    }

    if (msg.type === 'input_audio_buffer.speech_stopped') {
      setStatus(
        'JAY ESTÁ PENSANDO',
        'Un momento...'
      );
    }

    if (
      msg.type === 'response.output_audio_transcript.done' ||
      msg.type === 'response.audio_transcript.done'
    ) {
      if (msg.transcript) {
        setStatus(
          'JAY IA',
          msg.transcript
        );
      }
    }

    if (msg.type === 'error') {
      console.error('JAY IA ERROR:', msg);
      setStatus(
        'ERROR EN JAY IA',
        msg.error?.message || 'Ocurrió un problema.',
        'error'
      );
    }
  }

  async function startJayAI() {
    if (active) {
      stopJayAI();
      return;
    }

    if (connecting) return;

    connecting = true;

    setStatus(
      'CONECTANDO JAY IA',
      'Preparando conversación...',
      'listening'
    );

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      pc = new RTCPeerConnection();

      remoteAudio = document.createElement('audio');
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      remoteAudio.style.display = 'none';
      document.body.appendChild(remoteAudio);

      pc.ontrack = event => {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
      };

      micStream.getTracks().forEach(track => {
        pc.addTrack(track, micStream);
      });

      dc = pc.createDataChannel('oai-events');

      dc.onmessage = handleRealtimeEvent;

      dc.onerror = error => {
        console.error('JAY DATA CHANNEL:', error);
      };

      dc.onclose = () => {
        if (active) {
          cleanup();
          setStatus(
            'JAY IA DESCONECTADO',
            'Toca el micrófono para reconectar.'
          );
        }
      };

      dc.onopen = () => {
        active = true;
        connecting = false;

        setStatus(
          'JAY IA ACTIVO',
          'Ya puedes hablar conmigo normalmente.',
          'listening'
        );

        // JAY saluda al iniciar la conversación
        dc.send(JSON.stringify({
          type: 'response.create',
          response: {
            instructions:
              'Saluda brevemente al usuario y dile que ya estás listo para conversar.'
          }
        }));
      };

      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      const response = await fetch('/api/realtime', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sdp: offer.sdp
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'No se pudo conectar con JAY IA');
      }

      const answerSdp = await response.text();

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });

    } catch (error) {
      console.error('JAY IA:', error);

      cleanup();

      setStatus(
        'NO PUDE CONECTAR JAY IA',
        error.message || 'Revisa la conexión e intenta nuevamente.',
        'error'
      );
    }
  }

  // Reemplaza el micrófono anterior por JAY IA
  window.checkMicrophoneAndStart = startJayAI;

  window.toggleJayListening = function () {
    if (active) stopJayAI();
    else startJayAI();
  };

  window.JayAI = {
    version: '1.0',
    start: startJayAI,
    stop: stopJayAI,
    isActive: () => active
  };

  console.log('JAY IA REALTIME v1 activo');
})();

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

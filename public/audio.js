// Normalize recordings in the browser so Whisper only receives 16 kHz mono
// audio, regardless of the microphone or the original file container.
async function toWav(blob) {
  if (blob.size > 40 * 1024 * 1024)
    throw Error("Choose an audio file smaller than 40 MB.");
  const decoder = new AudioContext();
  let decoded;
  try {
    decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await decoder.close();
  }
  if (decoded.duration > 300 || decoded.duration < 0.15)
    throw Error("Choose a recording between one second and five minutes.");
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * 16000),
    16000,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const bytes = new ArrayBuffer(44 + samples.length * 2),
    out = new DataView(bytes);
  const tag = (offset, str) =>
    [...str].forEach((c, i) => out.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  out.setUint32(4, bytes.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true);
  out.setUint32(28, 32000, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  tag(36, "data");
  out.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    out.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(samples[i], 1)) * 32767,
      true,
    );
  return new Blob([bytes], { type: "audio/wav" });
}
export function openAudio({ modal, ready, append }) {
  const get = (id) => document.getElementById(id);
  if (!ready) {
    modal(
      "Meeting audio",
      "<p>Enable local English transcription by running <code>scripts/setup-windows.ps1 -Feature Speech</code> from the project folder. Refresh the page afterward.</p><p>You can paste meeting notes into Capture at any time.</p>",
    );
    return;
  }
  modal(
    "Meeting audio",
    "<p>Transcribe a short English recording on this computer. Review the words before adding tasks.</p>" +
      '<p class="section-label">Sample meeting · 9 seconds</p><audio controls preload="none" src="/sample-meeting.wav"></audio>' +
      '<div class="audio-actions"><button class="primary" id="sample-audio">Transcribe sample</button><button class="small-btn" id="choose-audio">Choose audio file</button><input type="file" hidden id="audio-file" accept="audio/*,.webm,.mp4"></div>' +
      '<p class="section-label">Record up to five minutes</p><p class="fine">Start with everyone’s permission. For meeting playback, share a browser tab and enable its audio.</p>' +
      '<div class="audio-actions"><button class="small-btn" id="record-mic">Microphone</button><button class="small-btn" id="record-tab">Shared tab audio</button><button class="primary" id="stop-audio" hidden>Stop &amp; transcribe</button></div>' +
      '<p class="fine" id="audio-status" role="status"></p>',
  );
  const dialog = get("dialog"),
    status = get("audio-status");
  let stream,
    recorder,
    timer,
    cancelled = false;
  const buttons = ["sample-audio", "choose-audio", "record-mic", "record-tab"];
  const setBusy = (busy) =>
    buttons.forEach((id) => {
      get(id).disabled = busy;
    });
  const release = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
  };
  dialog.addEventListener(
    "close",
    () => {
      cancelled = true;
      if (recorder?.state === "recording") recorder.stop();
      release();
    },
    { once: true },
  );
  const process = async (blob) => {
    if (cancelled) return;
    setBusy(true);
    status.textContent = "Transcribing locally with Whisper…";
    try {
      const wav = await toWav(blob);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: wav,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (!cancelled) {
        append(data.transcript);
        dialog.close();
      }
    } catch (error) {
      if (!cancelled) {
        status.textContent =
          error.message || "This browser could not decode the recording.";
        setBusy(false);
      }
    }
  };
  get("sample-audio").onclick = async () => {
    try {
      const response = await fetch("/sample-meeting.wav");
      if (!response.ok)
        throw Error("The sample recording could not be loaded.");
      await process(await response.blob());
    } catch (error) {
      status.textContent = error.message;
    }
  };
  get("choose-audio").onclick = () => get("audio-file").click();
  get("audio-file").onchange = (e) => {
    if (e.target.files[0]) process(e.target.files[0]);
  };
  const record = async (mode) => {
    setBusy(true);
    status.textContent = "Waiting for permission…";
    try {
      if (!window.MediaRecorder)
        throw Error(
          "This browser cannot record. Choose an audio file instead.",
        );
      stream =
        mode === "mic"
          ? await navigator.mediaDevices.getUserMedia({ audio: true })
          : await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
      if (cancelled) {
        release();
        return;
      }
      if (!stream.getAudioTracks().length)
        throw Error(
          "No audio track was shared. Choose a browser tab and enable tab audio.",
        );
      recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        release();
        if (!cancelled) {
          get("stop-audio").hidden = true;
          process(new Blob(chunks, { type: recorder.mimeType }));
        }
      };
      const stop = () => {
        if (recorder.state === "recording") recorder.stop();
      };
      stream
        .getTracks()
        .forEach((track) =>
          track.addEventListener("ended", stop, { once: true }),
        );
      get("stop-audio").hidden = false;
      get("stop-audio").onclick = stop;
      recorder.start();
      timer = setTimeout(stop, 299000);
      status.textContent =
        "Recording " +
        (mode === "mic" ? "microphone" : "shared tab audio") +
        "…";
    } catch (error) {
      release();
      if (!cancelled) {
        status.textContent = error.message;
        setBusy(false);
      }
    }
  };
  get("record-mic").onclick = () => record("mic");
  get("record-tab").onclick = () => record("tab");
}

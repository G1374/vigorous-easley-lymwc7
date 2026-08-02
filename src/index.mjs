import "./styles.css";

const app = document.querySelector("#app");
const state = {
  peer: null,
  channel: null,
  stream: null,
  reconnectTimer: null,
  manuallyDisconnected: false,
  attempts: 0,
};

app.innerHTML = `
  <main class="shell">
    <section class="hero panel">
      <div>
        <p class="eyebrow">Realtime WebRTC • Voice-first</p>
        <h1>World Room</h1>
        <p class="subtitle">A Jarvis-style worldbuilding companion for lore, cultures, scenes, conflicts, maps, and campaign bibles.</p>
      </div>
      <div class="orb" aria-hidden="true"><span></span></div>
    </section>

    <section class="controls panel" aria-label="Session controls">
      <label>World name<input id="worldName" maxlength="80" value="Aetherfall" /></label>
      <label>Creative tone<input id="tone" maxlength="160" value="cinematic, mythic, practical" /></label>
      <div class="actions">
        <button id="connect" class="primary">Start voice room</button>
        <button id="disconnect" disabled>End session</button>
      </div>
      <div class="status-grid">
        <div><span>Connection</span><strong id="connectionState">Idle</strong></div>
        <div><span>Microphone</span><strong id="micState">Off</strong></div>
        <div><span>Model</span><strong id="modelState">Loading…</strong></div>
      </div>
    </section>

    <section class="panel transcript-panel">
      <div class="panel-title">
        <h2>Live room log</h2>
        <button id="clearLog" class="ghost">Clear</button>
      </div>
      <ol id="events" class="events" aria-live="polite"></ol>
    </section>

    <audio id="remoteAudio" autoplay></audio>
  </main>
`;

const elements = {
  connect: document.querySelector("#connect"),
  disconnect: document.querySelector("#disconnect"),
  clearLog: document.querySelector("#clearLog"),
  connection: document.querySelector("#connectionState"),
  mic: document.querySelector("#micState"),
  model: document.querySelector("#modelState"),
  events: document.querySelector("#events"),
  audio: document.querySelector("#remoteAudio"),
  worldName: document.querySelector("#worldName"),
  tone: document.querySelector("#tone"),
};

fetch("/api/config")
  .then((response) => response.json())
  .then((config) => {
    elements.model.textContent = config.model;
  })
  .catch(() => {
    elements.model.textContent = "Unavailable";
  });

function log(message, type = "system") {
  const item = document.createElement("li");
  item.className = type;
  item.innerHTML = `<span>${new Date().toLocaleTimeString()}</span><p>${message}</p>`;
  elements.events.prepend(item);
}

function setStatus(connection, mic) {
  elements.connection.textContent = connection;
  if (mic) elements.mic.textContent = mic;
}

async function createClientSecret() {
  const response = await fetch("/api/realtime/client-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worldName: elements.worldName.value, tone: elements.tone.value }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not mint Realtime client secret.");
  return data.value || data.client_secret?.value;
}

function handleServerEvent(event) {
  if (event.type === "session.created") log("Realtime session created. Speak naturally — server VAD will detect turns.");
  if (event.type === "input_audio_buffer.speech_started") setStatus("Listening", "Speech detected");
  if (event.type === "input_audio_buffer.speech_stopped") setStatus("Thinking", "Processing turn");
  if (event.type === "response.audio.delta") setStatus("Speaking", "Open");
  if (event.type === "response.audio_transcript.delta" && event.delta) log(event.delta, "assistant partial");
  if (event.type === "response.audio_transcript.done" && event.transcript) log(event.transcript, "assistant");
  if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) log(event.transcript, "user");
  if (event.type === "response.done") setStatus("Connected", "Open");
  if (event.type === "error") log(event.error?.message || "Realtime API error", "error");
}

async function connect() {
  state.manuallyDisconnected = false;
  elements.connect.disabled = true;
  setStatus("Requesting microphone", "Prompting");

  try {
    const ephemeralKey = await createClientSecret();
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    state.peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    state.stream.getTracks().forEach((track) => state.peer.addTrack(track, state.stream));
    elements.audio.srcObject = new MediaStream();

    state.peer.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => elements.audio.srcObject.addTrack(track));
    };

    state.peer.onconnectionstatechange = () => {
      const status = state.peer.connectionState;
      setStatus(status[0].toUpperCase() + status.slice(1), "Open");
      if (["failed", "disconnected"].includes(status) && !state.manuallyDisconnected) scheduleReconnect();
    };

    state.channel = state.peer.createDataChannel("oai-events");
    state.channel.onopen = () => {
      state.attempts = 0;
      setStatus("Connected", "Open");
      elements.disconnect.disabled = false;
      log("Data channel open. World Room is ready.");
    };
    state.channel.onmessage = (message) => handleServerEvent(JSON.parse(message.data));
    state.channel.onerror = () => log("Realtime data channel error.", "error");

    const offer = await state.peer.createOffer();
    await state.peer.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });

    if (!sdpResponse.ok) throw new Error(await sdpResponse.text());
    await state.peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    setStatus("Connecting", "Open");
  } catch (error) {
    log(error.message, "error");
    disconnect(false);
    elements.connect.disabled = false;
  }
}

function scheduleReconnect() {
  if (state.reconnectTimer || state.attempts >= 3) return;
  state.attempts += 1;
  const delay = Math.min(1000 * 2 ** state.attempts, 8000);
  setStatus(`Reconnecting in ${delay / 1000}s`, "Paused");
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    disconnect(false);
    connect();
  }, delay);
}

function disconnect(manual = true) {
  state.manuallyDisconnected = manual;
  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  state.channel?.close();
  state.peer?.close();
  state.stream?.getTracks().forEach((track) => track.stop());
  state.peer = null;
  state.channel = null;
  state.stream = null;
  elements.audio.srcObject = null;
  elements.connect.disabled = false;
  elements.disconnect.disabled = true;
  setStatus(manual ? "Idle" : "Disconnected", "Off");
  if (manual) log("Session ended.");
}

elements.connect.addEventListener("click", connect);
elements.disconnect.addEventListener("click", () => disconnect(true));
elements.clearLog.addEventListener("click", () => (elements.events.innerHTML = ""));

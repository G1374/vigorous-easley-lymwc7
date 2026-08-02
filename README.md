# World Room

World Room is a production-oriented, voice-first worldbuilding companion that connects the browser directly to the OpenAI Realtime API over WebRTC using short-lived client secrets minted by a secure Node/Express backend.

## Highlights

- Browser-to-OpenAI WebRTC audio for low-latency speech-to-speech sessions.
- Server-side `/api/realtime/client-secret` endpoint keeps `OPENAI_API_KEY` out of the browser.
- Uses the latest Realtime model default: `gpt-realtime-2.1`.
- Server VAD turn detection, interruption support, streaming audio playback, live transcript events, connection state UI, and automatic reconnect attempts.
- Modern responsive UI designed for a Jarvis-like creative room.

## Setup

```bash
npm install
cp .env.example .env
# Add your OpenAI API key to .env
npm run dev
```

Open `http://localhost:3000` and click **Start voice room**. Microphone access requires localhost or HTTPS in production.

## Environment variables

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | — | Server-side OpenAI API key. Never expose this in frontend code. |
| `OPENAI_REALTIME_MODEL` | No | `gpt-realtime-2.1` | Realtime model used when minting client secrets. |
| `OPENAI_API_BASE` | No | `https://api.openai.com/v1` | API base URL. |
| `PORT` | No | `3000` | HTTP server port. |

## Production notes

- Deploy behind HTTPS so browsers can capture microphone audio.
- Add authentication before minting client secrets in multi-user deployments.
- Keep client-secret TTL short and pass a stable, privacy-preserving safety identifier.
- Monitor Realtime API errors and connection-state transitions for observability.

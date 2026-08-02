import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv();

const port = Number(process.env.PORT ?? 3000);
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
const OPENAI_API_BASE = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";
const publicRoot = path.join(__dirname, "src");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = (match[2] ?? "").replace(/^['"]|['"]$/g, "");
    process.env[match[1]] ??= value;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, securityHeaders({ "content-type": "application/json", "content-length": Buffer.byteLength(payload) }));
  res.end(payload);
}

function securityHeaders(extra = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(self), geolocation=()",
    "content-security-policy": "default-src 'self'; connect-src 'self' https://api.openai.com https://*.openai.com; media-src 'self' blob:; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'",
    ...extra,
  };
}

function safetyIdentifier(req) {
  const forwarded = req.headers["x-forwarded-for"]?.split(",")[0]?.trim();
  const seed = req.headers["x-world-room-user"] || forwarded || req.socket.remoteAddress || "anonymous";
  return Buffer.from(seed).toString("base64url").slice(0, 64);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32768) throw new Error("Request body too large.");
  }
  return body ? JSON.parse(body) : {};
}

async function createRealtimeClientSecret(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, { error: "Missing OPENAI_API_KEY on the server." });
    return;
  }

  const body = await readJson(req);
  const worldName = String(body.worldName || "World Room").slice(0, 80);
  const tone = String(body.tone || "cinematic, curious, practical").slice(0, 160);

  const response = await fetch(`${OPENAI_API_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier(req),
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        output_modalities: ["audio"],
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: "cedar", format: { type: "audio/pcm" } },
        },
        instructions: `You are World Room, a voice-first worldbuilding companion with a Jarvis-like presence: concise, warm, cinematic, and highly collaborative. Help design cultures, maps, magic systems, factions, scenes, timelines, economies, conflicts, characters, and lore bibles. Current project: ${worldName}. Desired tone: ${tone}. Ask one focused question when details are missing, preserve continuity, summarize decisions, and keep spoken responses natural.`,
      },
      ttl_seconds: 600,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, response.status, { error: payload?.error?.message || "Unable to create a Realtime client secret." });
    return;
  }
  sendJson(res, 200, payload);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicRoot, requested));
  if (!filePath.startsWith(publicRoot)) {
    res.writeHead(403, securityHeaders());
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
    res.writeHead(200, securityHeaders({ "content-type": types[ext] || "application/octet-stream" }));
    res.end(file);
  } catch {
    const fallback = await readFile(path.join(publicRoot, "index.html"));
    res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }));
    res.end(fallback);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/config") {
      sendJson(res, 200, { model: REALTIME_MODEL });
      return;
    }
    if (req.method === "POST" && req.url === "/api/realtime/client-secret") {
      await createRealtimeClientSecret(req, res);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 500, { error: "World Room server error.", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`World Room server listening on http://localhost:${port}`);
});

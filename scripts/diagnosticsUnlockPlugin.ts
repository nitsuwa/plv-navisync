import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Plugin } from "vite";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_IDLE_MS = 10 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_BODY_BYTES = 4096;

interface AttemptWindow {
  startedAt: number;
  count: number;
}

interface UnlockSession {
  expiresAt: number;
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (normalized === "::1") return true;
  return isIP(normalized) === 4 && normalized.startsWith("127.");
}

function requestIsLocalAndSameOrigin(request: import("node:http").IncomingMessage): boolean {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!host || !origin || !/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host)) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.protocol === "http:" && parsedOrigin.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parsePasswordHash(value: string): { salt: Buffer; digest: Buffer } | null {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(value);
  if (!match) return null;
  return { salt: Buffer.from(match[1], "hex"), digest: Buffer.from(match[2], "hex") };
}

export function diagnosticsUnlockPlugin(options: {
  mode: string;
  developerId?: string;
  passwordHash?: string;
  now?: () => number;
}): Plugin {
  const enabled = options.mode === "development";
  const configuredId = options.developerId?.trim() ?? "";
  const configuredHash = options.passwordHash?.trim() ?? "";
  const parsedHash = parsePasswordHash(configuredHash);
  const now = options.now ?? Date.now;
  const attempts = new Map<string, AttemptWindow>();
  const sessions = new Map<string, UnlockSession>();

  return {
    name: "plv-local-diagnostics-unlock",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/__plv/diagnostics/unlock" && url.pathname !== "/__plv/diagnostics/session") {
          next();
          return;
        }

        if (!requestIsLocalAndSameOrigin(request)) {
          sendJson(response, 403, { error: "Diagnostics unlock is available only from this local development server." });
          return;
        }
        if (!configuredId || !parsedHash) {
          sendJson(response, 503, { error: "Local Developer Diagnostics is not configured." });
          return;
        }

        if (url.pathname.endsWith("/unlock")) {
          if (request.method !== "POST" || !request.headers["content-type"]?.toLowerCase().includes("application/json")) {
            sendJson(response, 405, { error: "Request unavailable." });
            return;
          }

          const body = await readJsonBody(request);
          const currentTime = now();
          for (const [ip, window] of attempts) if (currentTime - window.startedAt >= ATTEMPT_WINDOW_MS) attempts.delete(ip);
          for (const [token, session] of sessions) if (session.expiresAt <= currentTime) sessions.delete(token);
          const remote = request.socket.remoteAddress ?? "unknown";
          const attempt = attempts.get(remote);
          if (attempt && attempt.count >= MAX_ATTEMPTS && currentTime - attempt.startedAt < ATTEMPT_WINDOW_MS) {
            response.setHeader("Retry-After", String(Math.ceil((ATTEMPT_WINDOW_MS - (currentTime - attempt.startedAt)) / 1000)));
            sendJson(response, 429, { error: "Could not unlock Diagnostics. Try again later." });
            return;
          }
          if (!attempt || currentTime - attempt.startedAt >= ATTEMPT_WINDOW_MS) attempts.set(remote, { startedAt: currentTime, count: 1 });
          else attempt.count += 1;

          const submittedId = typeof body?.developerId === "string" ? body.developerId : "";
          const password = typeof body?.password === "string" ? body.password : "";
          let passwordMatches = false;
          if (password.length > 0 && password.length <= 1024) {
            const candidate = await scrypt(password, parsedHash.salt, parsedHash.digest.length) as Buffer;
            passwordMatches = timingSafeEqual(candidate, parsedHash.digest);
          }
          const idMatches = constantTimeTextEqual(submittedId, configuredId);
          if (!body || !idMatches || !passwordMatches) {
            sendJson(response, 401, { error: "Could not unlock Diagnostics. Check the credentials or local development configuration." });
            return;
          }

          attempts.delete(remote);
          if (sessions.size >= 100) sessions.delete(sessions.keys().next().value as string);
          const token = randomBytes(32).toString("base64url");
          sessions.set(token, { expiresAt: currentTime + SESSION_IDLE_MS });
          sendJson(response, 200, { token, expiresInMs: SESSION_IDLE_MS });
          return;
        }

        if (request.method !== "POST" && request.method !== "DELETE") {
          sendJson(response, 405, { error: "Request unavailable." });
          return;
        }
        const body = await readJsonBody(request);
        const token = typeof body?.token === "string" ? body.token : "";
        const session = sessions.get(token);
        const currentTime = now();
        if (!session || session.expiresAt <= currentTime) {
          sessions.delete(token);
          sendJson(response, 401, { authorized: false });
          return;
        }
        if (request.method === "DELETE") {
          sessions.delete(token);
          sendJson(response, 200, { authorized: false });
          return;
        }
        session.expiresAt = currentTime + SESSION_IDLE_MS;
        sendJson(response, 200, { authorized: true, expiresInMs: SESSION_IDLE_MS });
      });
    },
  };
}

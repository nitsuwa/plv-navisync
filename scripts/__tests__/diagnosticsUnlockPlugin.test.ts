// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { scryptSync } from "node:crypto";
import { createServer, type ViteDevServer } from "vite";
import { diagnosticsUnlockPlugin } from "../diagnosticsUnlockPlugin";

const password = "local-test-password-only";
const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
const passwordHash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;

describe("local diagnostics unlock server", () => {
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
  });

  async function start(now: () => number = Date.now) {
    server = await createServer({
      configFile: false,
      plugins: [diagnosticsUnlockPlugin({ mode: "development", developerId: "local-test-id", passwordHash, now })],
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      logLevel: "silent",
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Vite test server did not bind a TCP port.");
    const origin = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown, method = "POST", requestOrigin = origin) => fetch(`${origin}${path}`, {
      method,
      headers: { Origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { origin, post };
  }

  it("verifies credentials server-side, rate-limits failures, grants diagnostics-only sessions, and supports relocking", async () => {
    const { post } = await start();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failure = await post("/__plv/diagnostics/unlock", { developerId: "local-test-id", password: "wrong-test-password" });
      expect(failure.status).toBe(401);
      expect(await failure.json()).toEqual({ error: "Could not unlock Diagnostics. Check the credentials or local development configuration." });
    }
    const limited = await post("/__plv/diagnostics/unlock", { developerId: "local-test-id", password });
    expect(limited.status).toBe(429);

    // Each test server is isolated, so a second instance exercises successful auth.
    await server?.close();
    server = undefined;
    const successServer = await start();
    const unlocked = await successServer.post("/__plv/diagnostics/unlock", { developerId: "local-test-id", password });
    expect(unlocked.status).toBe(200);
    const { token, ...safeResponse } = await unlocked.json() as { token: string; expiresInMs: number };
    expect(safeResponse).toEqual({ expiresInMs: 10 * 60 * 1000 });
    expect(token).toHaveLength(43);
    expect(JSON.stringify(safeResponse)).not.toContain(password);

    const valid = await successServer.post("/__plv/diagnostics/session", { token });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ authorized: true, expiresInMs: 10 * 60 * 1000 });
    const closed = await successServer.post("/__plv/diagnostics/session", { token }, "DELETE");
    expect(closed.status).toBe(200);
    expect((await successServer.post("/__plv/diagnostics/session", { token })).status).toBe(401);
  }, 30000);

  it("rejects cross-origin verification and expires idle grants", async () => {
    let now = 1000;
    const { post } = await start(() => now);
    const crossOrigin = await post("/__plv/diagnostics/unlock", { developerId: "local-test-id", password }, "POST", "http://attacker.example");
    expect(crossOrigin.status).toBe(403);

    const unlocked = await post("/__plv/diagnostics/unlock", { developerId: "local-test-id", password });
    const { token } = await unlocked.json() as { token: string };
    now += 10 * 60 * 1000;
    expect((await post("/__plv/diagnostics/session", { token })).status).toBe(401);
  });

  it("does not mount credential verification outside local development mode", async () => {
    server = await createServer({
      configFile: false,
      plugins: [diagnosticsUnlockPlugin({ mode: "production", developerId: "local-test-id", passwordHash })],
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      logLevel: "silent",
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Vite test server did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/__plv/diagnostics/unlock`, { method: "POST" });
    expect(response.status).toBe(404);
  });
});

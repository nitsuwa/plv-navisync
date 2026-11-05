import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin, stdout } from "node:process";

const configPath = resolve(process.cwd(), ".env.diagnostics.local");
let developerId = "";
try {
  const config = readFileSync(configPath, "utf8");
  developerId = /^PLV_DIAGNOSTICS_DEVELOPER_ID=(.+)$/m.exec(config)?.[1]?.trim() ?? "";
} catch {
  console.error("Local Developer Diagnostics are not configured.");
  process.exit(1);
}
if (!developerId || !stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error("Run this verification in a local interactive terminal with Developer Diagnostics configured.");
  process.exit(1);
}

stdout.write("Developer password for local verification (input hidden): ");
stdin.setEncoding("utf8");
stdin.setRawMode(true);
stdin.resume();
let password = await new Promise((resolvePassword, rejectPassword) => {
  let value = "";
  const onData = (chunk) => {
    for (const character of chunk) {
      if (character === "\u0003") {
        stdin.off("data", onData);
        rejectPassword(new Error("Verification cancelled."));
        return;
      }
      if (character === "\r" || character === "\n") {
        stdin.off("data", onData);
        resolvePassword(value);
        return;
      }
      if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
      else if (character >= " ") value += character;
    }
  };
  stdin.on("data", onData);
});
stdin.setRawMode(false);
stdin.pause();
stdout.write("\n");

const origin = process.env.PLV_DIAGNOSTICS_TEST_ORIGIN ?? "http://127.0.0.1:5182";
let token = "";
try {
  const unlock = await fetch(`${origin}/__plv/diagnostics/unlock`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ developerId, password }),
  });
  if (!unlock.ok) throw new Error("Unlock was denied.");
  const result = await unlock.json();
  token = result.token;
  const verify = await fetch(`${origin}/__plv/diagnostics/session`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!verify.ok || !(await verify.json()).authorized) throw new Error("The local grant could not be validated.");
  const revoke = await fetch(`${origin}/__plv/diagnostics/session`, {
    method: "DELETE",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!revoke.ok) throw new Error("The local grant could not be revoked.");
  console.log("Local credentials verified by the Vite server; the diagnostics-only grant was revoked successfully.");
} catch {
  console.error("Local credential verification failed. Confirm the local Vite server, credentials, and configuration without sharing the password.");
  process.exitCode = 1;
} finally {
  password = "";
  token = "";
}

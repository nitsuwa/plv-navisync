import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), ".env.diagnostics.local");

const readline = createInterface({ input: stdin, output: stdout });
const developerId = (await readline.question("Developer ID: ")).trim();
readline.close();
if (!/^[A-Za-z0-9._-]{3,120}$/.test(developerId)) {
  console.error("Developer ID must contain 3–120 letters, numbers, dots, underscores, or hyphens.");
  process.exit(1);
}

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error("Run this setup command in a local interactive terminal so the password can be entered without echo.");
  process.exit(1);
}

stdout.write("Developer password (input hidden): ");
stdin.setEncoding("utf8");
stdin.setRawMode(true);
stdin.resume();
const password = await new Promise((resolvePassword, rejectPassword) => {
  let value = "";
  const onData = (chunk) => {
    for (const character of chunk) {
      if (character === "\u0003") {
        stdin.off("data", onData);
        rejectPassword(new Error("Setup cancelled."));
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

if (typeof password !== "string" || password.length < 12 || password.length > 1024) {
  console.error("Password must contain 12–1024 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const digest = scryptSync(password, salt, 64);
const content = [
  `PLV_DIAGNOSTICS_DEVELOPER_ID=${developerId}`,
  `PLV_DIAGNOSTICS_PASSWORD_HASH=scrypt$${salt.toString("hex")}$${digest.toString("hex")}`,
  "",
].join("\n");
writeFileSync(configPath, content, { flag: "w", mode: 0o600 });
console.log("Local Developer Diagnostics credentials configured. Only the password hash was saved.");

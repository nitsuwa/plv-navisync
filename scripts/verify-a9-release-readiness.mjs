#!/usr/bin/env node
/**
 * A9 release-readiness verification.
 *
 * This script intentionally never prints environment values, access tokens,
 * passwords, database contents, or generated dump contents. Logical dump
 * artifacts are created only under the OS temporary directory, validated, and
 * removed in `finally`.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN ${message}`);
}

function expect(condition, message) {
  if (condition) pass(message);
  else fail(message);
  return condition;
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`;
    throw new Error(`${command} ${args.join(" ")} failed: ${reason}`);
  }
  return result.stdout ?? "";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\r\n");
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

async function verifyRepositoryAndEnvironment(env, demoEnv) {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  expect(nodeMajor >= 22, `Node.js ${process.versions.node} satisfies the Supabase client Node 22+ release requirement`);

  const trackedEnv = run("git", ["ls-files", "*.env*"]).split(/\r?\n/).filter(Boolean);
  expect(
    trackedEnv.every((path) => path === ".env.example" || path === ".env.demo.example"),
    "only sanitized environment templates are tracked",
  );
  for (const ignored of [".env.local", ".env.demo.local"]) {
    const result = spawnSync("git", ["check-ignore", "--quiet", ignored], { cwd: ROOT });
    expect(result.status === 0, `${ignored} is gitignored`);
  }

  const browserSources = run("git", ["ls-files", "src", "vite.config.ts"])
    .split(/\r?\n/)
    .filter(Boolean);
  const forbiddenBrowserEnv = /VITE_[A-Z0-9_]*(?:PASSWORD|SECRET|SERVICE_ROLE|ACCESS_TOKEN|PRIVATE_KEY)/g;
  const violations = [];
  for (const path of browserSources) {
    const matches = readFileSync(resolve(ROOT, path), "utf8").match(forbiddenBrowserEnv) ?? [];
    if (matches.length > 0) violations.push(`${path}: ${[...new Set(matches)].join(", ")}`);
  }
  expect(violations.length === 0, "browser source contains no secret-shaped VITE variables");
  if (violations.length > 0) violations.forEach((item) => console.error(`  ${item}`));

  const viteConfig = readFileSync(resolve(ROOT, "vite.config.ts"), "utf8");
  expect(
    viteConfig.includes("envPrefix: 'PLV_BROWSER_EXPLICIT_'") &&
      viteConfig.includes("publicEnvironmentNames") &&
      !viteConfig.includes("envPrefix: 'VITE_'") &&
      !viteConfig.includes('envPrefix: "VITE_"'),
    "Vite exposes only explicitly named public environment values",
  );

  const legacySecretKeys = Object.keys(env).filter((key) => /^VITE_.*(?:PASSWORD|SECRET|SERVICE_ROLE|ACCESS_TOKEN|PRIVATE_KEY)/.test(key));
  if (legacySecretKeys.length > 0) {
    warn(`local environment contains legacy browser-secret key name(s) excluded by the Vite allowlist: ${legacySecretKeys.join(", ")}; move demo passwords to .env.demo.local`);
  } else {
    pass("local environment has no secret-shaped VITE variable names");
  }

  const url = env.VITE_SUPABASE_URL || demoEnv.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || demoEnv.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  expect(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url ?? ""), "Supabase URL is configured with an HTTPS project endpoint");
  expect(Boolean(key) && !/service_role|sb_secret_/i.test(key), "browser Supabase key is configured and is not a service-role/secret key");

  if (existsSync(resolve(ROOT, "dist"))) {
    const sensitiveEntries = Object.entries({ ...env, ...demoEnv, ...process.env }).filter(
      ([name, value]) => /(?:PASSWORD|SECRET|SERVICE_ROLE|ACCESS_TOKEN|PRIVATE_KEY)/.test(name) && typeof value === "string" && value.length >= 8,
    );
    const bundleFiles = listFiles(resolve(ROOT, "dist")).filter((path) => statSync(path).size <= 20 * 1024 * 1024);
    const leakedNames = [];
    for (const [name, value] of sensitiveEntries) {
      if (bundleFiles.some((path) => readFileSync(path).includes(value))) leakedNames.push(name);
    }
    expect(leakedNames.length === 0, "built application contains none of the configured secret values");
    if (leakedNames.length > 0) console.error(`  Leaked variable name(s): ${leakedNames.join(", ")}`);
  } else {
    warn("dist is absent; run pnpm build and rerun A9 verification for bundle secret scanning");
  }

  return { url, key };
}

function verifyTypesAndMigrations() {
  const generated = run("supabase", ["gen", "types", "typescript", "--linked", "--schema", "public,graphql_public"])
    .replace(/\r\n/g, "\n")
    .trim();
  const committed = readFileSync(resolve(ROOT, "src/types/database.generated.ts"), "utf8")
    .replace(/\r\n/g, "\n")
    .trim();
  expect(generated === committed, "committed Database types exactly match the linked live schemas");

  const migrationOutput = run("supabase", ["migration", "list"]);
  const rows = migrationOutput
    .split(/\r?\n/)
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => /^\d+$/.test(cells[0] ?? "") || /^\d{14}$/.test(cells[0] ?? ""));
  expect(rows.length > 0 && rows.every(([local, remote]) => local && local === remote), "local and live migration histories are fully reconciled");
}

function verifyLogicalBackupAndPhysicalBackupStatus(projectRef) {
  if (!projectRef) {
    fail("Supabase project reference could not be derived for backup verification");
    return;
  }
  const backupStatus = JSON.parse(run("supabase", ["backups", "list", "--project-ref", projectRef, "--output", "json"]));
  if ((backupStatus.backups ?? []).length === 0 && !backupStatus.pitr_enabled) {
    warn("the current Supabase plan reports no downloadable physical backup and PITR is disabled; retain verified encrypted logical backups for release");
  } else {
    pass("Supabase reports a physical backup or PITR recovery path");
  }

  const docker = spawnSync("docker", ["info"], { cwd: ROOT, encoding: "utf8" });
  if (docker.error || docker.status !== 0) {
    warn("Docker is unavailable; Supabase CLI logical-dump execution is deferred until Docker Desktop is running");
    return;
  }

  const prefix = realpathSync(tmpdir()) + sep;
  const temp = realpathSync(mkdtempSync(join(tmpdir(), "plv-navisync-a9-")));
  if (!temp.startsWith(prefix) || !temp.split(sep).at(-1)?.startsWith("plv-navisync-a9-")) {
    throw new Error("Refusing to use an unverified logical-backup temporary directory");
  }

  try {
    const roles = join(temp, "roles.sql");
    const schema = join(temp, "schema.sql");
    const data = join(temp, "data.sql");
    run("supabase", ["db", "dump", "--linked", "--role-only", "--file", roles]);
    run("supabase", ["db", "dump", "--linked", "--schema", "public,storage", "--file", schema]);
    run("supabase", ["db", "dump", "--linked", "--data-only", "--schema", "public", "--file", data]);
    expect(statSync(roles).size > 100, "linked logical role backup can be created and is non-empty");
    expect(statSync(schema).size > 1_000, "linked logical schema backup can be created and is non-empty");
    expect(statSync(data).size > 100, "linked logical selected-data backup can be created and is non-empty");
  } finally {
    const resolved = realpathSync(temp);
    if (!resolved.startsWith(prefix) || !resolved.split(sep).at(-1)?.startsWith("plv-navisync-a9-")) {
      throw new Error("Refusing to remove an unverified temporary directory");
    }
    rmSync(resolved, { recursive: true, force: true });
  }
  expect(!existsSync(temp), "temporary logical-backup artifacts were removed after verification");
}

async function verifyLiveReleaseData(url, key, env, demoEnv) {
  if (!url || !key) return;
  const guest = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const campuses = await guest
    .from("campuses")
    .select("id,name,status,is_default")
    .eq("status", "published")
    .is("archived_at", null)
    .limit(5);
  expect(!campuses.error && (campuses.data?.length ?? 0) > 0, "guest can load safe published demonstration campus data");

  const versions = await guest
    .from("campus_versions")
    .select("campus_id,version_number,snapshot,published_at")
    .eq("state", "published")
    .order("published_at", { ascending: false })
    .limit(1);
  expect(!versions.error && versions.data?.length === 1, "guest can load exactly one active published snapshot for map export verification");
  if (versions.data?.[0]) {
    const json = JSON.stringify(versions.data[0].snapshot, null, 2);
    expect(Boolean(JSON.parse(json)) && json.length > 100, "selected published-map JSON export serializes and parses successfully");
  }

  const demoAdminEmail = demoEnv.DEMO_ADMIN_EMAIL || env.VITE_DEMO_ADMIN_EMAIL;
  const demoAdminPassword = demoEnv.DEMO_ADMIN_PASSWORD || env.VITE_DEMO_ADMIN_PASSWORD;
  const demoStudentEmail = demoEnv.DEMO_STUDENT_EMAIL || env.VITE_DEMO_STUDENT_EMAIL;
  const demoStudentPassword = demoEnv.DEMO_STUDENT_PASSWORD || env.VITE_DEMO_STUDENT_PASSWORD;
  if (!demoAdminEmail || !demoAdminPassword || !demoStudentEmail || !demoStudentPassword) {
    warn("private demo credentials are incomplete; live demo-role and report-export checks were skipped");
    return;
  }

  const verifyAccount = async (email, password, role) => {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user) return { client, ok: false };
    const profile = await client.from("profiles").select("role,is_active").eq("id", signedIn.data.user.id).maybeSingle();
    return { client, ok: !profile.error && profile.data?.role === role && profile.data?.is_active === true };
  };

  const student = await verifyAccount(demoStudentEmail, demoStudentPassword, "student");
  expect(student.ok, "demo student authenticates with an active student profile");
  await student.client.auth.signOut();

  const admin = await verifyAccount(demoAdminEmail, demoAdminPassword, "admin");
  expect(admin.ok, "demo administrator authenticates with an active administrator profile");
  if (admin.ok) {
    const reports = await admin.client
      .from("reports")
      .select("title,description,category,priority,status,building_id,created_at,reporter_id")
      .order("created_at", { ascending: false });
    expect(!reports.error, "administrator can load the approved report-export dataset");
    if (!reports.error) {
      const rows = reports.data ?? [];
      const json = JSON.stringify(rows, null, 2);
      const csv = toCsv(rows);
      expect(Array.isArray(JSON.parse(json)), "selected report JSON export serializes and parses successfully");
      expect(rows.length === 0 ? csv === "" : csv.split("\r\n").length === rows.length + 1, "selected report CSV export has a valid header and row count");
    }
  }
  await admin.client.auth.signOut();
}

async function main() {
  const localEnv = parseEnvFile(resolve(ROOT, ".env.local"));
  const demoEnv = parseEnvFile(resolve(ROOT, ".env.demo.local"));
  const connection = await verifyRepositoryAndEnvironment(localEnv, demoEnv);
  verifyTypesAndMigrations();
  const projectRef = connection.url ? new URL(connection.url).hostname.split(".")[0] : null;
  verifyLogicalBackupAndPhysicalBackupStatus(projectRef);
  await verifyLiveReleaseData(connection.url, connection.key, localEnv, demoEnv);

  console.log("");
  console.log(`A9 summary: ${failures.length} failure(s), ${warnings.length} warning(s).`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`FAIL A9 verification stopped safely: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

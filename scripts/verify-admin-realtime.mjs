#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const result = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function required(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Missing ${key} in .env.local`);
  return value;
}

const env = { ...loadEnv(resolve(".env.local")), ...process.env };
const url = required(env, "VITE_SUPABASE_URL");
const key =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || required(env, "VITE_SUPABASE_ANON_KEY");
const options = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};
const admin = createClient(url, key, options);
const student = createClient(url, key, options);
let channel;
let originalDepartment;
let studentId;

function timeout(ms, message) {
  return new Promise((_, reject) => {
    const id = setTimeout(() => reject(new Error(message)), ms);
    id.unref?.();
  });
}

try {
  const [adminLogin, studentLogin] = await Promise.all([
    admin.auth.signInWithPassword({
      email: required(env, "VITE_DEMO_ADMIN_EMAIL"),
      password: required(env, "VITE_DEMO_ADMIN_PASSWORD"),
    }),
    student.auth.signInWithPassword({
      email: required(env, "VITE_DEMO_STUDENT_EMAIL"),
      password: required(env, "VITE_DEMO_STUDENT_PASSWORD"),
    }),
  ]);
  if (adminLogin.error) throw adminLogin.error;
  if (studentLogin.error) throw studentLogin.error;

  studentId = studentLogin.data.user.id;
  const original = await student
    .from("profiles")
    .select("department")
    .eq("id", studentId)
    .single();
  if (original.error) throw original.error;
  originalDepartment = original.data.department;

  let resolveEvent;
  const eventReceived = new Promise((resolve) => {
    resolveEvent = resolve;
  });
  const subscribed = new Promise((resolve, reject) => {
    channel = admin
      .channel(`admin-realtime-verification-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${studentId}`,
        },
        () => resolveEvent(true),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resolve(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Realtime subscription failed: ${status}`));
        }
      });
  });

  await Promise.race([subscribed, timeout(10_000, "Realtime subscription timed out")]);
  const update = await student
    .from("profiles")
    .update({ department: "Realtime verification" })
    .eq("id", studentId);
  if (update.error) throw update.error;

  await Promise.race([eventReceived, timeout(10_000, "Realtime update event timed out")]);
  console.log("PASS admin received a student profile UPDATE through Supabase Realtime");
} finally {
  if (studentId !== undefined && originalDepartment !== undefined) {
    const restored = await student
      .from("profiles")
      .update({ department: originalDepartment })
      .eq("id", studentId);
    if (restored.error) {
      console.error("Cleanup failed:", restored.error.message);
      process.exitCode = 1;
    }
  }
  if (channel) await admin.removeChannel(channel);
  await Promise.all([admin.auth.signOut(), student.auth.signOut()]);
  admin.realtime.disconnect();
  student.realtime.disconnect();
}

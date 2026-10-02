import { createClient } from "npm:@supabase/supabase-js@2";
import { sendManagedInvitation } from "./invitationFlow.ts";
import { isManagedRole, roleAllowed, studentNumberForInvite, type ManagedRole } from "./invitePolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  action: "invite" | "resend";
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  department?: unknown;
  studentNumber?: unknown;
  role?: unknown;
  profileId?: unknown;
  redirectTo?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanOptional(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function roleLabel(role: string): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Administrator";
  if (role === "student_org") return "Student Org";
  return "Student";
}

function inviteRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedOrigins = new Set(["http://localhost:5173", "https://plvnavisync.vercel.app"]);
    if (!allowedOrigins.has(url.origin) || url.pathname !== "/auth/invite" || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function userFacingAuthError(message: string): { error: string; status: number } {
  const normalized = message.toLowerCase();
  if (/student id is already registered|profiles_student_number_uq|student_number.*duplicate/.test(normalized)) {
    return { error: "This Student ID is already registered.", status: 409 };
  }
  if (/already registered|user already exists|email.*already/.test(normalized)) {
    return { error: "An account already uses this email.", status: 409 };
  }
  if (/rate limit|too many requests/.test(normalized)) {
    return { error: "Please wait before sending another invitation.", status: 429 };
  }
  if (/student id must use|student number/.test(normalized)) {
    return { error: "Use the format 23-3314 for Student ID.", status: 400 };
  }
  return { error: "We couldn't complete the invitation. Try again.", status: 400 };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server configuration is incomplete" }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: actorError } = await service
    .from("profiles").select("id, role, is_active, first_name, last_name")
    .eq("id", userData.user.id).maybeSingle();
  if (actorError || !actor?.is_active || !isManagedRole(actor.role) || !roleAllowed(actor.role, "student")) {
    return json({ error: "You don't have permission to make this change." }, 403);
  }

  let body: RequestBody;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request" }, 400); }
  const redirectTo = inviteRedirect(body.redirectTo);
  if (!redirectTo) return json({ error: "Invitation redirect is not allowed." }, 400);

  if (body.action === "resend") {
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    if (!profileId) return json({ error: "This invitation is no longer valid." }, 404);
    const [{ data: target, error: targetError }, { data: invitation, error: inviteRowError }] = await Promise.all([
      service.from("profiles").select("id, email, role, first_name, last_name, is_active").eq("id", profileId).maybeSingle(),
      service.from("admin_user_invitations").select("profile_id, invited_role, accepted_at, revoked_at, last_sent_at").eq("profile_id", profileId).maybeSingle(),
    ]);
    if (targetError || inviteRowError) return json({ error: "We couldn't complete the request. Try again." }, 500);
    if (!target || !invitation || invitation.accepted_at || invitation.revoked_at || target.is_active) {
      return json({ error: "This invitation is no longer valid." }, 404);
    }
    if (Date.now() - new Date(invitation.last_sent_at).getTime() < 60_000) {
      return json({ error: "Please wait before sending another invitation." }, 429);
    }
    if (!roleAllowed(actor.role, target.role)) return json({ error: "You don't have permission to make this change." }, 403);

    // This targets an existing pending Auth user. It does not insert auth.users,
    // so the consumed one-time intent must stay consumed and no replacement
    // token or profile should be created during resend.
    const { error } = await service.auth.admin.inviteUserByEmail(target.email, {
      redirectTo,
      data: { first_name: target.first_name, last_name: target.last_name, invited_role: roleLabel(target.role) },
    });
    if (error) {
      const mapped = userFacingAuthError(error.message);
      return json(mapped, mapped.status);
    }
    const { error: updateError } = await service.from("admin_user_invitations")
      .update({ last_sent_at: new Date().toISOString() }).eq("profile_id", profileId);
    if (updateError) return json({ error: "Invitation was sent, but its status could not be refreshed." }, 500);

    const actorName = [actor.first_name, actor.last_name].filter(Boolean).join(" ");
    await service.from("activity_logs").insert({
      actor_id: actor.id, action: "admin.user_invitation_resent", entity_type: "profile", entity_id: profileId,
      metadata: { target_name: [target.first_name, target.last_name].filter(Boolean).join(" "), actor_name: actorName },
    });
    return json({ id: profileId, email: target.email, resent: true });
  }

  if (body.action !== "invite") return json({ error: "Unsupported action" }, 400);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) return json({ error: "First and last name are required." }, 400);
  if (!isManagedRole(role)) return json({ error: "Select a valid role." }, 400);
  if (!roleAllowed(actor.role, role)) return json({ error: "You don't have permission to make this change." }, 403);

  const department = cleanOptional(body.department, 120);
  const { valid: studentNumberIsValid, studentNumber } = studentNumberForInvite(role, body.studentNumber);
  if (!studentNumberIsValid) return json({ error: "Use the format 23-3314 for Student ID." }, 400);

  const { data: existing, error: existingError } = await service.from("profiles")
    .select("id").eq("email", email).maybeSingle();
  if (existingError) return json({ error: "We couldn't complete the request. Try again." }, 500);
  if (existing) return json({ error: "An account already uses this email." }, 409);

  if (studentNumber) {
    const { data: matchingStudent, error: studentError } = await service.from("profiles")
      .select("id").eq("student_number", studentNumber).maybeSingle();
    if (studentError) return json({ error: "We couldn't complete the request. Try again." }, 500);
    if (matchingStudent) return json({ error: "This Student ID is already registered." }, 409);
  }

  await service.from("admin_invitation_intents").delete().lt("expires_at", new Date().toISOString());
  const inviteResult = await sendManagedInvitation(service, {
    email,
    firstName,
    lastName,
    department,
    studentNumber,
    role,
    actorId: actor.id,
    roleLabel: roleLabel(role),
    redirectTo,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    metadata: { first_name: firstName, last_name: lastName, invited_role: roleLabel(role) },
  });
  if (!inviteResult.ok) {
    if (inviteResult.reason === "intent") return json({ error: "We couldn't complete the request. Try again." }, 500);
    const mapped = userFacingAuthError(inviteResult.authMessage ?? "invitation failed");
    return json(mapped, mapped.status);
  }

  const { data: createdProfile, error: createdProfileError } = await service.from("profiles")
    .select("id, email, role, is_active").eq("id", inviteResult.userId).maybeSingle();
  if (createdProfileError || !createdProfile || createdProfile.role !== role || createdProfile.is_active) {
    return json({ error: "The invitation could not be finalized. Contact a Super Admin." }, 500);
  }

  return json({ id: createdProfile.id, email: createdProfile.email, invited: true }, 201);
});

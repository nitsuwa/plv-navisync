import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteRequest = {
  action: "invite";
  email: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  studentNumber?: string | null;
  role: "student" | "admin";
};

type AdminRequest = InviteRequest | { action: "check" };

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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const { data: callerProfile, error: profileError } = await caller
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || callerProfile?.role !== "admin" || callerProfile.is_active !== true) {
    return json({ error: "Active administrator access required" }, 403);
  }

  let body: AdminRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (body.action === "check") return json({ authorized: true, userId: userData.user.id });
  if (body.action !== "invite") return json({ error: "Unsupported action" }, 400);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "A valid email is required" }, 400);
  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) {
    return json({ error: "First and last name are required and must not exceed 80 characters" }, 400);
  }
  if (body.role !== "student" && body.role !== "admin") return json({ error: "Invalid role" }, 400);

  const department = cleanOptional(body.department, 120);
  const studentNumber = cleanOptional(body.studentNumber, 50);
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName, student_number: studentNumber },
  });
  if (inviteError || !inviteData.user) return json({ error: inviteError?.message ?? "Invitation failed" }, 400);

  const invitedId = inviteData.user.id;
  const { error: updateError } = await caller.rpc("admin_update_profile", {
    p_target_id: invitedId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_department: department,
    p_student_number: studentNumber,
    p_role: body.role,
    p_is_active: true,
  });

  if (updateError) {
    await service.auth.admin.deleteUser(invitedId);
    return json({ error: updateError.message }, 400);
  }

  await service.from("activity_logs").insert({
    actor_id: userData.user.id,
    action: "admin.user_invited",
    entity_type: "profile",
    entity_id: invitedId,
    metadata: { email, role: body.role },
  });

  return json({ id: invitedId, email, invited: true }, 201);
});

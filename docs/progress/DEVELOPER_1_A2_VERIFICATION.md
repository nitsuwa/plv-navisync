# Developer 1 A2 Verification Evidence

Verified against the shared Supabase development project `plv-navisync-dev` (`aaketmqvxqjgaznvclqc`) on August 6, 2026.

## Implemented lifecycle

- Real email/password student signup through the typed browser client.
- Validation for full name, email, student number, password length, and password confirmation.
- Verification-pending and resend route at `/auth/verify`.
- Verification callback states at `/auth/callback`.
- Forgot-password request at `/auth/forgot-password`.
- Recovery/new-password states at `/auth/reset-password`.
- Expired, invalid, loading, blocked-profile, and success behavior.
- Active student role/profile enforcement after verification and password reset.
- Login messaging for unconfirmed email and a visible forgot-password entry point.

## Server-side profile safety

Migration `20260806090026_secure_student_profile_signup.sql` replaces only the signup trigger function; the applied `001` migration remains unchanged.

The trigger accepts only bounded `first_name`, `last_name`, and `student_number` metadata. It copies the canonical Auth email, hardcodes `role = 'student'` and `is_active = true`, ignores caller-supplied authorization fields, and is not executable by browser roles.

`supabase/tests/a2_student_signup_assertions.sql` inserts a controlled Auth fixture inside a transaction, deliberately supplies `role = 'admin'` and `is_active = false`, verifies the safe student profile, then rolls the transaction back. It passed against the live project.

## Automated and live checks

- Vite production build passed.
- Four Vitest files passed: 54 tests total.
- `node scripts/verify-a2-auth.mjs` passed using only the publishable key and disposable demo student credentials.
- Hosted Auth settings verified: signup enabled, email confirmation required, email provider enabled.
- Live student authentication, active-profile enforcement, refresh, retained session, sign-out, and unauthenticated password-change denial passed.
- A1 catalog assertions still pass after the A2 migration.
- Security advisor results remain unchanged at seven warnings; six are documented A1 function grants and one is leaked-password protection.
- All five new A2 paths returned HTTP 200 from the local Vite server.

## Reviewer deployment check

The developer completed the requested site walkthrough on August 6, 2026 and reported no errors, including the lifecycle pages prepared for verification and password recovery.

Supabase Auth email redirects remain allowlist-controlled. Before deployment, confirm these patterns in **Authentication → URL Configuration**:

- `http://localhost:5173/**`
- `http://127.0.0.1:5173/**`
- Each preview and production application origin using `https://<origin>/**`

Set the production Site URL to the production application origin. Configure custom SMTP before onboarding real students; the Supabase hosted default email provider restricts recipients. Also enable leaked-password protection before production release.

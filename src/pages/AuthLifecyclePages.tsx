import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Eye, EyeOff, LoaderCircle, Mail, RefreshCw, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLVLogo } from "../components/ui/PLVLogo";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../contexts/StudentAuthContext";
import { isConnected, supabase } from "../lib/supabase";
import { publishAuthLifecycleSignal, subscribeAuthLifecycleSignal } from "../lib/authLifecycleSignal";
import {
  friendlyAccountError,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  requestStudentPasswordReset,
  resendStudentVerification,
  updateRecoveredPassword,
} from "../lib/studentAccount";

function AuthShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="min-h-screen bg-background px-5 py-6 sm:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Sign In
        </Link>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <main className="mx-auto flex min-h-[calc(100vh-88px)] max-w-md items-center justify-center py-10">
        <section className="w-full rounded-3xl border border-border bg-card p-6 text-center shadow-lg sm:p-9">
          <PLVLogo size={52} className="mx-auto mb-5 shadow-md" />
          {children}
        </section>
      </main>
    </div>
  );
}

function StatusIcon({ state }: { state: "loading" | "success" | "error" }) {
  const className = "mx-auto mb-5 h-12 w-12";
  if (state === "loading") return <LoaderCircle className={`${className} animate-spin text-primary`} />;
  if (state === "success") return <CheckCircle2 className={`${className} text-green-600`} />;
  return <AlertCircle className={`${className} text-destructive`} />;
}

function clearConsumedAuthUrl(): void {
  // Call only after the central Supabase bootstrap has resolved the callback.
  if (!window.location.search && !window.location.hash) return;
  window.history.replaceState(window.history.state, "", window.location.pathname);
}

function readAuthUrlError(): { code: string; description: string } {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    code: query.get("error_code") ?? hash.get("error_code") ?? query.get("error") ?? hash.get("error") ?? "",
    description: query.get("error_description") ?? hash.get("error_description") ?? "",
  };
}

function AuthCompletionScreen({
  title,
  description,
  openPath,
  closeMessage,
}: {
  title: string;
  description: string;
  openPath: string;
  closeMessage: string;
}) {
  const reducedMotion = useReducedMotion();
  const [seconds, setSeconds] = useState(5);
  const [closeAttempted, setCloseAttempted] = useState(false);

  useEffect(() => {
    if (closeAttempted) return;
    if (seconds === 0) {
      window.close();
      setCloseAttempted(true);
      return;
    }
    const timer = window.setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [closeAttempted, seconds]);

  const closeTab = () => {
    window.close();
    setCloseAttempted(true);
  };

  return (
    <AuthShell>
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.88, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.42, ease: "easeOut" }}
        className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400"
        aria-hidden="true"
      >
        <Check className="h-8 w-8" strokeWidth={2.5} />
      </motion.div>
      <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <p role="status" className="mt-5 min-h-5 text-xs text-muted-foreground">
        {closeAttempted ? closeMessage : `Returning to NaviSync in ${seconds} second${seconds === 1 ? "" : "s"}…`}
      </p>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button onClick={() => window.location.assign(`${window.location.origin}${openPath}`)} variant="primary" size="lg" className="w-full">
          Open NaviSync
        </Button>
        <Button onClick={closeTab} variant="secondary" size="lg" className="w-full">
          <X className="h-4 w-4" /> Close This Tab
        </Button>
      </div>
    </AuthShell>
  );
}

export function VerificationPendingPage() {
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";
  const auth = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (auth.isStudent) setVerified(true);
    return subscribeAuthLifecycleSignal((signal) => {
      if (signal === "EMAIL_VERIFIED" && auth.isStudent) setVerified(true);
    });
  }, [auth.isStudent]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (verified) {
    return (
      <AuthShell>
        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-emerald-600" />
        <h1 className="text-2xl font-extrabold text-foreground">Email verified</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Your account is ready. You can continue to NaviSync.</p>
        <Button onClick={() => window.location.assign(`${window.location.origin}${auth.isStudent ? "/home" : "/admin"}`)} variant="primary" size="lg" className="mt-7 w-full">
          Continue to NaviSync
        </Button>
      </AuthShell>
    );
  }

  const resend = async () => {
    const normalized = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter the email address used during registration.");
      return;
    }
    if (!isConnected || !supabase) {
      setError("Authentication is not configured.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { error: resendError } = await resendStudentVerification(normalized, supabase);
      if (resendError) setError(friendlyAccountError(resendError.message));
      else {
        setMessage("Verification email sent. Check your inbox.");
        setCooldown(30);
      }
    } catch (resendError) {
      setError(friendlyAccountError(resendError instanceof Error ? resendError.message : "network"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <Mail className="mx-auto mb-5 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-extrabold text-foreground">Check your email</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        We sent a verification link to the email below. Open it to activate your student account.
      </p>
      <label htmlFor="verification-email" className="mt-7 block text-left text-xs font-bold uppercase tracking-widest text-foreground">
        Registration email
      </label>
      <input
        id="verification-email"
        type="email"
        value={email}
        onChange={(event) => { setEmail(event.target.value); setError(""); setMessage(""); }}
        className="mt-2 h-11 w-full rounded-xl border border-border bg-input-background px-4 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        autoComplete="email"
      />
      {error && <p role="alert" className="mt-3 text-left text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mt-3 text-left text-sm text-green-700 dark:text-green-400">{message}</p>}
      <Button onClick={resend} disabled={loading || cooldown > 0} isLoading={loading} variant="primary" size="lg" className="mt-6 w-full">
        <RefreshCw className="h-4 w-4" /> {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification"}
      </Button>
      <Link to="/admin" className="mt-5 inline-block text-sm font-bold text-primary hover:underline">Return to Sign In</Link>
    </AuthShell>
  );
}

type CallbackState = "checking" | "success" | "already-verified" | "expired" | "invalid" | "blocked";

export function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>("checking");
  const [detail, setDetail] = useState("Confirming your email and restoring your session…");
  const auth = useAuth();
  const completionSent = useRef(false);

  useEffect(() => {
    if (!isConnected || !supabase) {
      setState("invalid");
      setDetail("Authentication is not configured.");
      return;
    }
    if (auth.status === "initializing") return;

    const { code, description } = readAuthUrlError();
    if (code || description) {
      if (/already confirmed|already verified/i.test(`${code} ${description}`)) {
        setState("already-verified");
        setDetail("Your email address was already verified.");
      } else {
        const expired = /expired|otp_expired/i.test(`${code} ${description}`);
        setState(expired ? "expired" : "invalid");
        setDetail(expired ? "This verification link has expired. Request a new one." : "This verification link is no longer valid.");
      }
      clearConsumedAuthUrl();
      return;
    }
    if (auth.status === "authenticated") {
      if (auth.profile?.is_active && (auth.profile.role === "student" || auth.profile.role === "student_org")) {
        setState("success");
        setDetail("Your email has been verified and your PLV NaviSync student account is ready.");
      } else {
        setState("blocked");
        setDetail(auth.profile?.is_active === false
          ? "Your profile is inactive. Contact an administrator."
          : "This verified account does not have an active student profile.");
      }
      clearConsumedAuthUrl();
    } else if (auth.status === "unauthenticated") {
      setState("invalid");
      setDetail("This verification link is no longer valid.");
      clearConsumedAuthUrl();
    } else if (auth.status === "error") {
      setState("blocked");
      setDetail("We couldn't finish verifying your account. Check your connection or return to sign in.");
      clearConsumedAuthUrl();
    }
  }, [auth.profile, auth.status]);

  useEffect(() => {
    if (state !== "success" || completionSent.current) return;
    completionSent.current = true;
    publishAuthLifecycleSignal("EMAIL_VERIFIED");
  }, [state]);

  if (state === "success" || state === "already-verified") {
    return <AuthCompletionScreen
      title={state === "success" ? "Account activated" : "Account already verified"}
      description={state === "success" ? "Your email has been verified and your PLV NaviSync student account is ready." : "Your email address was already verified. You can return to NaviSync."}
      openPath={auth.isStudent ? "/home" : "/admin"}
      closeMessage={state === "success" ? "Your account is activated. You can safely close this tab." : "You can safely close this tab."}
    />;
  }

  const iconState = state === "checking" ? "loading" : "error";
  return (
    <AuthShell>
      <StatusIcon state={iconState} />
      <h1 className="text-2xl font-extrabold text-foreground">
        {state === "checking" ? "Verifying your account…" : state === "expired" ? "Verification link expired" : "Verification failed"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      {(state === "expired" || state === "invalid") && <Link to="/auth/verify" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">Resend Verification</Link>}
      {(state === "invalid" || state === "blocked") && <Link to="/admin" className="mt-4 inline-block text-sm font-bold text-primary hover:underline">Return to Sign In</Link>}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeAuthLifecycleSignal((signal) => {
    if (signal === "PASSWORD_RESET_COMPLETE" && sent) setResetComplete(true);
  }), [sent]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isConnected || !supabase) {
      setError("Authentication is not configured.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: resetError } = await requestStudentPasswordReset(email, supabase);
      if (resetError) setError(friendlyAccountError(resetError.message));
      else setSent(true);
    } catch (resetError) {
      setError(friendlyAccountError(resetError instanceof Error ? resetError.message : "network"));
    } finally {
      setLoading(false);
    }
  };

  if (resetComplete) {
    return (
      <AuthShell>
        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-emerald-600" />
        <h1 className="text-2xl font-extrabold text-foreground">Password updated</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">You can now sign in using your new password.</p>
        <Link to="/admin" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">Return to Sign In</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Mail className="mx-auto mb-5 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-extrabold text-foreground">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {sent ? "If an account matches that address, password-reset instructions have been sent." : "Enter your account email and we’ll send a secure reset link."}
      </p>
      {!sent && (
        <form onSubmit={submit} className="mt-7 text-left">
          <label htmlFor="reset-email" className="text-xs font-bold uppercase tracking-widest text-foreground">Email</label>
          <input id="reset-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="email" className="mt-2 h-11 w-full rounded-xl border border-border bg-input-background px-4 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" isLoading={loading} variant="primary" size="lg" className="mt-6 w-full">{loading ? "Sending…" : "Send Reset Link"}</Button>
        </form>
      )}
      <Link to="/admin" className="mt-6 inline-block text-sm font-bold text-primary hover:underline">Return to Sign In</Link>
    </AuthShell>
  );
}

type RecoveryState = "checking" | "ready" | "invalid" | "expired" | "error" | "success";

export function ResetPasswordPage() {
  const auth = useAuth();
  const invalidUrlRef = useRef(false);
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (state === "success" || invalidUrlRef.current) return;
    if (!isConnected || !supabase) {
      setState("invalid");
      return;
    }
    if (auth.status === "initializing" || auth.recoveryState === "processing") {
      setState("checking");
      return;
    }
    const { code, description } = readAuthUrlError();
    if (code || description) {
      invalidUrlRef.current = true;
      setState(/expired|otp_expired/i.test(`${code} ${description}`) ? "expired" : "invalid");
      clearConsumedAuthUrl();
      return;
    }
    if (auth.recoveryState === "complete") {
      setState("success");
      return;
    }
    if (auth.recoveryState === "ready") {
      if (auth.session) {
        setState("ready");
        clearConsumedAuthUrl();
      } else setState("checking");
      return;
    }
    if (auth.status === "error") setState("error");
    else if (auth.recoveryState === "invalid" || auth.status === "unauthenticated" || auth.recoveryState === "idle") {
      setState("invalid");
      clearConsumedAuthUrl();
    }
  }, [auth.recoveryState, auth.session, auth.status, state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }
    setLoading(true);
    setError("");
    let updatedUser: { id: string } | null = null;
    // Supabase's recovery token authorizes the update. End this temporary
    // recovery session so the user returns through the role-aware sign-in flow.
    try {
      const { data, error: updateError } = await updateRecoveredPassword(password, supabase);
      if (updateError || !data.user) {
        setError(friendlyAccountError(updateError?.message ?? ""));
        return;
      }
      updatedUser = data.user;
    } catch (updateError) {
      setError(friendlyAccountError(updateError instanceof Error ? updateError.message : "network"));
      return;
    } finally {
      setLoading(false);
    }
    if (updatedUser) {
      publishAuthLifecycleSignal("PASSWORD_RESET_COMPLETE");
      clearConsumedAuthUrl();
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // The password update is already confirmed; keep the success state and
        // return through sign-in even if local session cleanup briefly fails.
      }
      setState("success");
    }
  };

  if (state === "checking") return <AuthShell><StatusIcon state="loading" /><h1 className="text-2xl font-extrabold text-foreground">Verifying reset link…</h1><p className="mt-3 text-sm text-muted-foreground">Please wait while Supabase restores your secure recovery session.</p></AuthShell>;
  if (state === "invalid" || state === "expired") return <AuthShell><StatusIcon state="error" /><h1 className="text-2xl font-extrabold text-foreground">{state === "expired" ? "Reset link expired" : "Invalid reset link"}</h1><p className="mt-3 text-sm text-muted-foreground">This password-reset link is no longer valid.</p><Link to="/auth/forgot-password" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">Request New Link</Link></AuthShell>;
  if (state === "error") return <AuthShell><StatusIcon state="error" /><h1 className="text-2xl font-extrabold text-foreground">Could not verify reset link</h1><p className="mt-3 text-sm text-muted-foreground">Check your connection and try again, or request a new link.</p><Button onClick={() => void auth.retryBootstrap()} variant="outline" size="lg" className="mt-6 w-full">Try Again</Button><Link to="/auth/forgot-password" className="mt-4 inline-block text-sm font-bold text-primary hover:underline">Request New Link</Link></AuthShell>;
  if (state === "success") return <AuthCompletionScreen title="Password updated" description="Your password has been changed successfully. You can return to NaviSync and sign in with your new password." openPath="/admin" closeMessage="Password updated. You can safely close this tab." />;

  return (
    <AuthShell>
      <h1 className="text-2xl font-extrabold text-foreground">Reset your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">Use at least {MIN_ACCOUNT_PASSWORD_LENGTH} characters.</p>
      <form onSubmit={submit} className="mt-7 space-y-4 text-left">
        <div>
          <label htmlFor="new-password" className="text-xs font-bold uppercase tracking-widest text-foreground">New Password</label>
          <div className="relative mt-2">
            <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="new-password" className="h-11 w-full rounded-xl border border-border bg-input-background px-4 pr-11 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-new-password" className="text-xs font-bold uppercase tracking-widest text-foreground">Confirm New Password</label>
          <input id="confirm-new-password" type={showPassword ? "text" : "password"} value={confirm} onChange={(event) => { setConfirm(event.target.value); setError(""); }} autoComplete="new-password" className="mt-2 h-11 w-full rounded-xl border border-border bg-input-background px-4 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" isLoading={loading} variant="primary" size="lg" className="w-full">{loading ? "Updating…" : "Update Password"}</Button>
      </form>
    </AuthShell>
  );
}

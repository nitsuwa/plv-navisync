import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLVLogo } from "../components/ui/PLVLogo";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { useTheme } from "../hooks/useTheme";
import { isConnected, supabase } from "../lib/supabase";
import {
  friendlyAccountError,
  loadActiveStudentProfile,
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

export function VerificationPendingPage() {
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    const { error: resendError } = await resendStudentVerification(normalized, supabase);
    setLoading(false);
    if (resendError) setError(friendlyAccountError(resendError.message));
    else setMessage("If the signup is awaiting verification, a new email has been sent.");
  };

  return (
    <AuthShell>
      <Mail className="mx-auto mb-5 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-extrabold text-foreground">Check your email</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Open the verification link to activate your student account. The link returns you securely to NaviSync.
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
      <Button onClick={resend} isLoading={loading} variant="primary" size="lg" className="mt-6 w-full">
        <RefreshCw className="h-4 w-4" /> Resend verification
      </Button>
      <Link to="/admin" className="mt-5 inline-block text-sm font-bold text-primary hover:underline">Return to Sign In</Link>
    </AuthShell>
  );
}

type CallbackState = "checking" | "success" | "expired" | "invalid" | "blocked";

export function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>("checking");
  const [detail, setDetail] = useState("Confirming your email and restoring your session…");

  useEffect(() => {
    if (!isConnected || !supabase) {
      setState("invalid");
      setDetail("Authentication is not configured.");
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = query.get("error_code") ?? hash.get("error_code") ?? "";
    const errorDescription = query.get("error_description") ?? hash.get("error_description") ?? "";
    if (errorCode || errorDescription) {
      const expired = /expired/i.test(`${errorCode} ${errorDescription}`);
      setState(expired ? "expired" : "invalid");
      setDetail(expired ? "This verification link has expired. Request a new one." : "This verification link is invalid or has already been used.");
      return;
    }

    let active = true;
    let resolving = false;
    let completed = false;
    const verify = async (userId: string) => {
      if (resolving || !active) return;
      resolving = true;
      try {
        await loadActiveStudentProfile(userId, supabase);
        if (active) {
          completed = true;
          setState("success");
          setDetail("Your email is verified and your student session is ready.");
        }
      } catch (profileError) {
        if (!active) return;
        await supabase.auth.signOut();
        completed = true;
        setState("blocked");
        setDetail(profileError instanceof Error && profileError.message === "profile_inactive"
          ? "Your profile is inactive. Contact an administrator."
          : "The verified account does not have an active student profile.");
      } finally {
        resolving = false;
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void verify(session.user.id);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (data.session?.user) void verify(data.session.user.id);
      else if (error) {
        setState("invalid");
        setDetail("The verification session could not be restored.");
      }
    });

    const timeout = window.setTimeout(() => {
      if (active && !completed) {
        setState("invalid");
        setDetail("The verification link is invalid or has expired.");
      }
    }, 5000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const iconState = state === "checking" ? "loading" : state === "success" ? "success" : "error";
  return (
    <AuthShell>
      <StatusIcon state={iconState} />
      <h1 className="text-2xl font-extrabold text-foreground">
        {state === "checking" ? "Verifying account" : state === "success" ? "Email verified" : "Verification failed"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      {state === "success" && <Button onClick={() => window.location.assign("/map")} variant="primary" size="lg" className="mt-7 w-full">Continue to Campus Map</Button>}
      {state === "expired" && <Link to="/auth/verify" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">Request another verification email</Link>}
      {(state === "invalid" || state === "blocked") && <Link to="/admin" className="mt-7 inline-block text-sm font-bold text-primary hover:underline">Return to Sign In</Link>}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

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
    const { error: resetError } = await requestStudentPasswordReset(email, supabase);
    setLoading(false);
    if (resetError) setError(friendlyAccountError(resetError.message));
    else setSent(true);
  };

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
          <Button type="submit" isLoading={loading} variant="primary" size="lg" className="mt-6 w-full">Send Reset Link</Button>
        </form>
      )}
      <Link to="/admin" className="mt-6 inline-block text-sm font-bold text-primary hover:underline">Return to Sign In</Link>
    </AuthShell>
  );
}

type RecoveryState = "checking" | "ready" | "invalid" | "expired" | "success";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const recoveryHint = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return {
      expected: query.get("flow") === "recovery" || hash.get("type") === "recovery",
      code: query.get("error_code") ?? hash.get("error_code") ?? "",
      description: query.get("error_description") ?? hash.get("error_description") ?? "",
    };
  }, []);

  useEffect(() => {
    if (recoveryHint.code || recoveryHint.description) {
      setState(/expired/i.test(`${recoveryHint.code} ${recoveryHint.description}`) ? "expired" : "invalid");
      return;
    }
    if (!recoveryHint.expected || !isConnected || !supabase) {
      setState("invalid");
      return;
    }

    let active = true;
    const acceptSession = (hasSession: boolean) => {
      if (active && hasSession) setState("ready");
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) acceptSession(!!session);
    });
    void supabase.auth.getSession().then(({ data }) => acceptSession(!!data.session));
    const timeout = window.setTimeout(() => {
      if (active) setState((current) => current === "checking" ? "invalid" : current);
    }, 5000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, [recoveryHint]);

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
    const { data, error: updateError } = await updateRecoveredPassword(password, supabase);
    if (updateError || !data.user) {
      setLoading(false);
      setError(friendlyAccountError(updateError?.message ?? ""));
      return;
    }
    try {
      await loadActiveStudentProfile(data.user.id, supabase);
      setState("success");
    } catch {
      await supabase.auth.signOut();
      setError("The password changed, but this account does not have an active student profile.");
    } finally {
      setLoading(false);
    }
  };

  if (state === "checking") return <AuthShell><StatusIcon state="loading" /><h1 className="text-2xl font-extrabold text-foreground">Checking reset link</h1><p className="mt-3 text-sm text-muted-foreground">Restoring the secure recovery session…</p></AuthShell>;
  if (state === "invalid" || state === "expired") return <AuthShell><StatusIcon state="error" /><h1 className="text-2xl font-extrabold text-foreground">{state === "expired" ? "Reset link expired" : "Invalid reset link"}</h1><p className="mt-3 text-sm text-muted-foreground">Request a fresh password-reset email to continue.</p><Link to="/auth/forgot-password" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">Request New Link</Link></AuthShell>;
  if (state === "success") return <AuthShell><StatusIcon state="success" /><h1 className="text-2xl font-extrabold text-foreground">Password updated</h1><p className="mt-3 text-sm text-muted-foreground">Your password has changed and your student session remains active.</p><Button onClick={() => navigate("/map", { replace: true })} variant="primary" size="lg" className="mt-7 w-full">Continue to Campus Map</Button></AuthShell>;

  return (
    <AuthShell>
      <h1 className="text-2xl font-extrabold text-foreground">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">Use at least {MIN_ACCOUNT_PASSWORD_LENGTH} characters.</p>
      <form onSubmit={submit} className="mt-7 space-y-4 text-left">
        <div>
          <label htmlFor="new-password" className="text-xs font-bold uppercase tracking-widest text-foreground">New password</label>
          <div className="relative mt-2">
            <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="new-password" className="h-11 w-full rounded-xl border border-border bg-input-background px-4 pr-11 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-new-password" className="text-xs font-bold uppercase tracking-widest text-foreground">Confirm password</label>
          <input id="confirm-new-password" type={showPassword ? "text" : "password"} value={confirm} onChange={(event) => { setConfirm(event.target.value); setError(""); }} autoComplete="new-password" className="mt-2 h-11 w-full rounded-xl border border-border bg-input-background px-4 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" isLoading={loading} variant="primary" size="lg" className="w-full">Update Password</Button>
      </form>
    </AuthShell>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Eye, EyeOff, ArrowLeft, CheckCircle2, User, Mail, IdCard, Lock,
  GraduationCap, ChevronRight, Sparkles, Shield,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { useTheme } from "../hooks/useTheme";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { PLVLogo } from "../components/ui/PLVLogo";
import { StarField, LavaLampBackground } from "../components/ui/HeroBackground";

// ── Left panel step progress ──
function StepProgress({ step }: { step: 1 | 2 }) {
  return (
    <div className="space-y-4">
      {[
        { n: 1, title: "Your Details", desc: "Name, email & student ID" },
        { n: 2, title: "Secure Account", desc: "Set your password" },
      ].map(s => (
        <motion.div
          key={s.n}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: s.n * 0.15 }}
          className="flex items-center gap-3"
        >
          <motion.div
            animate={{
              scale: step === s.n ? [1, 1.15, 1] : 1,
              backgroundColor: step > s.n ? "#22c55e" : step === s.n ? "#ffffff" : "rgba(255,255,255,0.2)",
              color: step > s.n ? "#ffffff" : step === s.n ? "#0e2a6e" : "rgba(255,255,255,0.4)",
            }}
            transition={{ duration: 0.3 }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 shadow-sm"
          >
            {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
          </motion.div>
          <div>
            <p className={`text-sm font-bold leading-none ${step >= s.n ? "text-white" : "text-white/35"}`}>{s.title}</p>
            <p className={`text-xs mt-0.5 ${step >= s.n ? "text-white/50" : "text-white/20"}`}>{s.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function RegistrationPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCfm, setShowCfm] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    studentId: "",
    username: "",
    password: "",
    confirm: "",
  });

  const set = (k: keyof typeof form, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrs(p => ({ ...p, [k]: "" }));
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Full name is required.";
    if (!form.email.includes("@")) e.email = "Enter a valid email address.";
    if (!form.studentId.trim()) e.studentId = "Student ID is required.";
    if (form.username.length < 4) e.username = "Username must be at least 4 characters.";
    setErrs(e);
    return !Object.keys(e).length;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (form.password.length < 6) e.password = "Password must be at least 6 characters.";
    if (form.password !== form.confirm) e.confirm = "Passwords do not match.";
    setErrs(e);
    return !Object.keys(e).length;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep2()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setSuccess(true);
  };

  // ── Success ──
  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-sm w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="w-20 h-20 rounded-3xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-6 shadow-md"
          >
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <PLVLogo size={48} className="mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-foreground mb-2">Account Created!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed mb-8">
              Welcome to PLV NaviSync, <span className="font-bold text-foreground">{form.fullName}</span>!
              Your student account is ready. Sign in to start navigating campus.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Button variant="primary" size="lg" className="w-full" onClick={() => navigate("/admin")}>
              Go to Sign In
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Note: Full access may require admin approval.
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* ══════════ LEFT PANEL ══════════ */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden flex-col justify-between p-10 xl:p-14">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 90% 70% at 45% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)",
        }} />
        <StarField opacity={0.40} />
        <LavaLampBackground />
        <div className="absolute inset-0 pointer-events-none animate-grid-pulse" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }} />

        {/* Top */}
        <div className="relative z-10 flex items-center gap-3">
          <PLVLogo size={40} />
          <div>
            <p className="font-extrabold text-white text-base leading-none">PLV NaviSync</p>
            <p className="text-white/50 text-xs font-semibold tracking-widest uppercase mt-0.5">Smart Campus Navigator</p>
          </div>
        </div>

        {/* Step progress + tagline */}
        <div className="relative z-10">
          <StepProgress step={step} />
          <div className="mt-8">
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-2">
              Join the PLV<br />NaviSync Community.
            </h2>
            <p className="text-white/45 text-sm leading-relaxed max-w-xs">
              Save your favourite routes, report campus issues, and get personalised navigation — free for all PLV students.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════ RIGHT — form ══════════ */}
      <div className="flex-1 lg:max-w-[460px] flex flex-col bg-background">
        <div className="flex items-center justify-between px-8 pt-6 pb-2">
          <Link to="/admin" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Sign In
          </Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-6">
          <div className="w-full max-w-sm">
            {/* PLV logo + heading */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center mb-6"
            >
              <PLVLogo size={52} className="mb-3 shadow-md" />
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-3">
                <GraduationCap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-extrabold text-primary uppercase tracking-widest">Student Registration</span>
              </div>
              <h1 className="text-2xl font-extrabold text-foreground text-center">
                {step === 1 ? "Create Your Account" : "Set Your Password"}
              </h1>
              <p className="text-sm text-muted-foreground text-center mt-1">
                {step === 1 ? "Enter your PLV student details below." : "Choose a strong password to protect your account."}
              </p>
            </motion.div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  animate={{ width: step === 1 ? "50%" : "100%" }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">Step {step} of 2</span>
            </div>

            {/* ── Step 1 ── */}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="reg-fullname" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input id="reg-fullname" type="text" value={form.fullName} onChange={e => set("fullName", e.target.value)} autoComplete="name"
                        placeholder="e.g. Juan Dela Cruz"
                        aria-invalid={!!errs.fullName}
                        aria-describedby={errs.fullName ? "reg-fullname-error" : undefined}
                        className={"w-full h-11 pl-9 pr-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 text-sm transition-all " + (errs.fullName ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")} />
                    </div>
                    {errs.fullName && <p id="reg-fullname-error" role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-destructive" />{errs.fullName}</p>}
                  </div>

                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">PLV Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input id="reg-email" type="email" value={form.email} onChange={e => set("email", e.target.value)} autoComplete="email"
                        placeholder="yourname@plv.edu.ph"
                        aria-invalid={!!errs.email}
                        aria-describedby={errs.email ? "reg-email-error" : undefined}
                        className={"w-full h-11 pl-9 pr-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 text-sm transition-all " + (errs.email ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")} />
                    </div>
                    {errs.email && <p id="reg-email-error" role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-destructive" />{errs.email}</p>}
                  </div>

                  <div>
                    <label htmlFor="reg-studentid" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">Student ID</label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input id="reg-studentid" type="text" value={form.studentId} onChange={e => set("studentId", e.target.value)} autoComplete="off"
                        placeholder="e.g. 2024-00001"
                        aria-invalid={!!errs.studentId}
                        aria-describedby={errs.studentId ? "reg-studentid-error" : undefined}
                        className={"w-full h-11 pl-9 pr-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 text-sm font-mono transition-all " + (errs.studentId ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")} />
                    </div>
                    {errs.studentId && <p id="reg-studentid-error" role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-destructive" />{errs.studentId}</p>}
                  </div>

                  <div>
                    <label htmlFor="reg-username" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">Username</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">@</span>
                      <input id="reg-username" type="text" value={form.username} onChange={e => set("username", e.target.value)} autoComplete="username"
                        placeholder="yourhandle" minLength={4}
                        aria-invalid={!!errs.username}
                        aria-describedby={errs.username ? "reg-username-error" : undefined}
                        className={"w-full h-11 pl-8 pr-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 text-sm font-mono transition-all " + (errs.username ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")} />
                    </div>
                    {errs.username && <p id="reg-username-error" role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-destructive" />{errs.username}</p>}
                  </div>

                  <motion.button
                    type="button"
                    onClick={handleNext}
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    whileTap={{ scale: 0.98 }}
                  >
                    Continue <ChevronRight className="h-4 w-4" />
                  </motion.button>
                </motion.div>
              )}

              {/* ── Step 2 ── */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Account summary */}
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-xl bg-muted/50 border border-border flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <GraduationCap className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-accent" /> {form.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">@{form.username} · {form.studentId}</p>
                      </div>
                      <button type="button" onClick={() => setStep(1)}
                        className="text-xs text-primary hover:underline font-semibold shrink-0">Edit</button>
                    </motion.div>

                    <div>
                      <label htmlFor="reg-password" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input id="reg-password" type={showPw ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} autoComplete="new-password"
                          placeholder="Min. 6 characters" minLength={6}
                          aria-invalid={!!errs.password}
                          aria-describedby={errs.password ? "reg-password-error" : undefined}
                          className={"w-full h-11 pl-9 pr-11 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 text-sm transition-all " + (errs.password ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")} />
                        <button type="button" onClick={() => setShowPw(!showPw)}
                          aria-label={showPw ? "Hide password" : "Show password"}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errs.password && <p id="reg-password-error" role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-destructive" />{errs.password}</p>}
                    </div>

                    <div>
                      <label htmlFor="reg-confirm" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input id="reg-confirm" type={showCfm ? "text" : "password"} value={form.confirm} onChange={e => set("confirm", e.target.value)} autoComplete="new-password"
                          placeholder="Repeat your password"
                          aria-invalid={!!errs.confirm}
                          aria-describedby={errs.confirm ? "reg-confirm-error" : undefined}
                          className={"w-full h-11 pl-9 pr-11 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 text-sm transition-all " + (errs.confirm ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")} />
                        <button type="button" onClick={() => setShowCfm(!showCfm)}
                          aria-label={showCfm ? "Hide confirm password" : "Show confirm password"}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showCfm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errs.confirm && <p id="reg-confirm-error" role="alert" className="text-xs text-destructive mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-destructive" />{errs.confirm}</p>}
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                      <Shield className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      By registering, you agree to PLV NaviSync's terms of use and privacy policy.
                    </p>

                    <div className="flex gap-3">
                      <button type="button" onClick={() => setStep(1)}
                        className="h-11 px-5 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:bg-muted transition-colors">
                        ← Back
                      </button>
                      <Button type="submit" variant="primary" size="lg" isLoading={loading} className="flex-1 h-11">
                        Create Account
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-sm text-muted-foreground text-center mt-5">
              Already have an account?{' '}
              <Link to="/admin" className="text-primary font-bold hover:underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

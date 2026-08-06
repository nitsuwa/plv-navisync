import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Eye, EyeOff, LogIn, AlertCircle, X, ChevronDown, Sparkles, ShieldCheck, GraduationCap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { supabase, isConnected } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../hooks/useTheme";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { PLVLogo } from "../components/ui/PLVLogo";
import { StarField, LavaLampBackground } from "../components/ui/HeroBackground";

/**
 * Map raw Supabase auth errors to concise, user-friendly messages.
 * Never surfaces raw server details or demo credentials.
 */
function friendlyAuthError(rawMessage?: string): string {
  const msg = (rawMessage ?? "").toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid email") || msg.includes("invalid credentials")) {
    return "Invalid email or password.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (msg.includes("user not found")) {
    return "No account found with this email address.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline")) {
    return "Unable to reach the sign-in service. Check your connection and try again.";
  }
  return "Unable to sign in. Please check your email and password.";
}

// ── Demo account dropdown configuration ──────────────────────────────────────
// The dropdown is purely a form-filling convenience for demonstrations. It
// NEVER signs in automatically and NEVER bypasses Supabase: the user must still
// press Sign In, and authentication always goes through
// supabase.auth.signInWithPassword() plus the existing profile/role/route
// checks. It is shown only when demonstration mode is explicitly enabled via
// Vite variables AND the corresponding demo credentials are configured.
// Requirement: the dropdown must appear only when VITE_ENABLE_DEMO_LOGIN is
// exactly "true" (trimmed, case-sensitive).
const DEMO_LOGIN_ENABLED =
  (import.meta.env.VITE_ENABLE_DEMO_LOGIN ?? "").trim() === "true";
const DEMO_ADMIN_EMAIL = (import.meta.env.VITE_DEMO_ADMIN_EMAIL ?? "").trim();
const DEMO_ADMIN_PASSWORD = import.meta.env.VITE_DEMO_ADMIN_PASSWORD ?? "";
const DEMO_STUDENT_EMAIL = (import.meta.env.VITE_DEMO_STUDENT_EMAIL ?? "").trim();
const DEMO_STUDENT_PASSWORD = import.meta.env.VITE_DEMO_STUDENT_PASSWORD ?? "";

interface DemoAccountOption {
  id: string;
  label: string;
  description: string;
  /** lucide icon used for the option badge */
  icon: LucideIcon;
  email: string;
  password: string;
}

// Add new demonstration accounts here — the dropdown renders them
// automatically, so the UI needs no redesign later. Each option is only
// included when its own credentials are configured (admin and student are
// independent of each other; both still require demo mode enabled).
const DEMO_ACCOUNTS: DemoAccountOption[] = [];
if (DEMO_LOGIN_ENABLED && DEMO_ADMIN_EMAIL && DEMO_ADMIN_PASSWORD) {
  DEMO_ACCOUNTS.push({
    id: "demo-admin",
    label: "Demo Administrator",
    description: "Opens the administration portal",
    icon: ShieldCheck,
    email: DEMO_ADMIN_EMAIL,
    password: DEMO_ADMIN_PASSWORD,
  });
}
if (DEMO_LOGIN_ENABLED && DEMO_STUDENT_EMAIL && DEMO_STUDENT_PASSWORD) {
  DEMO_ACCOUNTS.push({
    id: "demo-student",
    label: "Demo Student",
    description: "Opens the student experience",
    icon: GraduationCap,
    email: DEMO_STUDENT_EMAIL,
    password: DEMO_STUDENT_PASSWORD,
  });
}

// ── Campus building illustration for the left panel ───────────────────────────
function CampusIllustration() {
  return (
    <div className="w-full flex-1 flex items-center justify-center py-4">
      <svg viewBox="0 0 360 280" className="w-full max-w-md" aria-hidden="true">
        {/* Sky gradient */}
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.6"/>
            <stop offset="100%" stopColor="#0d2470" stopOpacity="0.1"/>
          </linearGradient>
          <linearGradient id="bldg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#93c5fd"/>
            <stop offset="100%" stopColor="#3b82f6"/>
          </linearGradient>
          <linearGradient id="bldg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfdbfe"/>
            <stop offset="100%" stopColor="#60a5fa"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Ground */}
        <ellipse cx="180" cy="265" rx="200" ry="18" fill="rgba(147,197,253,0.15)"/>
        <rect x="0" y="252" width="360" height="30" fill="rgba(30,58,138,0.4)" rx="2"/>

        {/* Road markings */}
        {[20,60,100,140,180,220,260,300,340].map((x,i)=>(
          <rect key={i} x={x} y="255" width="16" height="4" rx="2" fill="rgba(255,255,255,0.3)"/>
        ))}

        {/* Background buildings (far) */}
        <rect x="10"  y="185" width="50" height="68" rx="3" fill="rgba(147,197,253,0.3)"/>
        <rect x="22"  y="165" width="26" height="20" rx="2" fill="rgba(147,197,253,0.25)"/>
        <rect x="290" y="195" width="55" height="58" rx="3" fill="rgba(147,197,253,0.3)"/>
        <rect x="305" y="178" width="25" height="18" rx="2" fill="rgba(147,197,253,0.25)"/>

        {/* Main building — MAB (centre-left) */}
        <rect x="55"  y="155" width="85" height="98" rx="4" fill="url(#bldg)" filter="url(#glow)"/>
        <rect x="72"  y="115" width="52" height="40" rx="3" fill="url(#bldg)"/>
        {/* Windows */}
        {[[65,165],[95,165],[125,165],[65,185],[95,185],[125,185],[65,205],[95,205],[125,205]].map(([wx,wy],i)=>(
          <rect key={i} x={wx} y={wy} width="14" height="10" rx="1.5"
            fill={i%3===0?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.5)"}/>
        ))}
        {/* Building label */}
        <text x="97" y="240" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" opacity="0.9">MAB</text>

        {/* Admin Building */}
        <rect x="155" y="170" width="65" height="83" rx="4" fill="url(#bldg2)" filter="url(#glow)"/>
        <rect x="168" y="148" width="39" height="22" rx="3" fill="url(#bldg2)"/>
        {[[163,180],[185,180],[207,180],[163,196],[185,196],[207,196]].map(([wx,wy],i)=>(
          <rect key={i} x={wx} y={wy} width="12" height="9" rx="1.5"
            fill={i%2===0?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.5)"}/>
        ))}
        <text x="188" y="240" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" opacity="0.9">ADM</text>

        {/* SSC Building */}
        <rect x="236" y="178" width="72" height="75" rx="4" fill="url(#bldg)" filter="url(#glow)"/>
        <rect x="250" y="158" width="44" height="20" rx="3" fill="url(#bldg)"/>
        {[[244,188],[264,188],[284,188],[244,204],[264,204],[284,204]].map(([wx,wy],i)=>(
          <rect key={i} x={wx} y={wy} width="12" height="9" rx="1.5"
            fill={i%2===0?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.5)"}/>
        ))}
        <text x="272" y="240" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" opacity="0.9">SSC</text>

        {/* Flagpole */}
        <line x1="183" y1="80" x2="183" y2="150" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
        <rect x="183" y="80" width="20" height="13" rx="1"
          fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
        <rect x="183" y="80" width="20" height="6" rx="1" fill="rgba(14,42,110,0.8)"/>
        <rect x="183" y="86" width="20" height="7" rx="1" fill="rgba(200,150,12,0.9)"/>

        {/* Trees */}
        {[[40,248],[130,250],[210,248],[325,248]].map(([cx,cy],i)=>(
          <g key={i}>
            <ellipse cx={cx} cy={cy-14} rx={9} ry={12} fill="rgba(52,211,153,0.7)"/>
            <rect x={cx-2} y={cy} width="4" height="8" rx="1" fill="rgba(52,211,153,0.5)"/>
          </g>
        ))}

        {/* Animated route dot */}
        <circle r="4" fill="#c8960c" stroke="white" strokeWidth="1.5" filter="url(#glow)">
          <animateMotion dur="5s" repeatCount="indefinite">
            <mpath href="#route"/>
          </animateMotion>
        </circle>
        <path id="route" d="M 0 253 L 97 253 L 188 253 L 272 253" fill="none"/>

        {/* Pulsing markers on buildings */}
        {[[97,155],[188,170],[272,178]].map(([mx,my],i)=>(
          <g key={i}>
            <circle cx={mx} cy={my} r="5" fill="rgba(200,150,12,0.9)" stroke="white" strokeWidth="1.5"/>
            <circle cx={mx} cy={my} r="5" fill="none" stroke="rgba(200,150,12,0.6)" strokeWidth="2"
              style={{animation:`pulse-ring 2s ease-out ${i*0.6}s infinite`}}/>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminLoginPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [form, setForm]        = useState({ email: "", password: "" });
  const [showPw, setShowPw]    = useState(false);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const toast = useToast();

  // Close the demo dropdown on outside click or Escape.
  useEffect(() => {
    if (!demoOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (demoRef.current && !demoRef.current.contains(e.target as Node)) {
        setDemoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDemoOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [demoOpen]);

  // Selecting a demo account ONLY autofills the form fields and clears any
  // stale error. It never signs the user in — Sign In still runs through
  // supabase.auth.signInWithPassword() with the normal checks.
  const applyDemoAccount = (account: DemoAccountOption) => {
    setForm({ email: account.email, password: account.password });
    setSelectedDemoId(account.id);
    setError("");
    setDemoOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    if (!isConnected || !supabase) {
      setError("Authentication is not configured. Please set up Supabase credentials and restart the app.");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (error || !data.user) {
        setError(friendlyAuthError(error?.message ?? ""));
        setLoading(false);
        return;
      }

      // Retrieve the authenticated user's matching profile row.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("Your account is not fully set up. Please contact the administrator.");
        setLoading(false);
        return;
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setError("This account is inactive. Please contact the administrator.");
        setLoading(false);
        return;
      }

      if (profile.role === "admin") {
        toast.success("Welcome back", "Redirecting to admin dashboard...");
        navigate("/admin-dashboard", { replace: true });
        return;
      }

      // Students land on the student campus map experience. Any other role
      // (there are only student/admin in the schema) is rejected safely.
      if (profile.role === "student") {
        toast.success("Signed in", "Welcome to the student experience!");
        navigate("/map", { replace: true });
        return;
      }

      // Unknown role — never grant access, end the session safely.
      await supabase.auth.signOut();
      setError("This account type cannot sign in here. Please contact the administrator.");
      setLoading(false);
    } catch {
      setError("Unable to sign in right now. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "var(--font-body)" }}>

      {/* ══════════ LEFT — full-bleed campus visual ══════════ */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden flex-col justify-between p-10 xl:p-14">
        {/* Dark gradient */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 90% 70% at 45% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)",
        }}/>
        <StarField opacity={0.40}/>
        <LavaLampBackground/>
        <div className="absolute inset-0 pointer-events-none animate-grid-pulse" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),
                            linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)`,
          backgroundSize: "48px 48px",
        }}/>

        {/* Top logo */}
        <div className="relative z-10 flex items-center gap-3">
          <PLVLogo size={40}/>
          <div>
            <p className="font-extrabold text-white text-base leading-none">
              PLV NaviSync
            </p>
            <p className="text-white/50 text-xs font-semibold tracking-widest uppercase mt-0.5">
              Smart Campus Navigator
            </p>
          </div>
        </div>

        {/* Campus illustration — opaque, clearly visible */}
        <div className="relative z-10 flex-1 flex items-center">
          <CampusIllustration/>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10">
          <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-2">
            Navigate every corner<br/>of PLV campus.
          </h2>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs">
            Smart maps, real-time directions, and a Canva-style campus builder — all in one platform.
          </p>
        </div>
      </div>

      {/* ══════════ RIGHT — login form ══════════ */}
      <div className="flex-1 lg:max-w-[460px] flex flex-col bg-background">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 sm:px-8 pt-5 sm:pt-6 pb-2">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back
          </Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme}/>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 sm:px-10 py-8 sm:py-10">
          <div className="w-full max-w-[340px]">

            {/* PLV Logo — prominently at top */}
            <div className="flex flex-col items-center mb-9">
              <PLVLogo size={56} className="mb-3 shadow-md"/>
              <h1 className="text-2xl font-extrabold text-foreground text-center">
                Welcome Back
              </h1>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Sign in to your PLV NaviSync account
              </p>
            </div>

            {/* ── Demo account dropdown (only when demo mode is enabled) ── */}
            {DEMO_ACCOUNTS.length > 0 && (
              <div ref={demoRef} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Select a demonstration account
                  </span>
                  <span className="flex-1 h-px bg-border"/>
                </div>

                <button
                  type="button"
                  onClick={() => setDemoOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={demoOpen}
                  aria-controls="demo-account-menu"
                  className="w-full h-11 px-4 rounded-xl border border-dashed border-border bg-input-background text-foreground hover:border-primary/40 hover:bg-muted/50 transition-all flex items-center gap-2.5 text-sm font-medium"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-primary"/>
                  <span className="flex-1 text-left truncate">
                    {selectedDemoId
                      ? `${DEMO_ACCOUNTS.find(a => a.id === selectedDemoId)?.label ?? "Demo account"} filled — press Sign In`
                      : "Choose an account to fill the form"}
                  </span>
                  <motion.span
                    animate={{ rotate: demoOpen ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="inline-flex shrink-0"
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground"/>
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {demoOpen && (
                    <motion.div
                      id="demo-account-menu"
                      role="menu"
                      aria-label="Demonstration accounts"
                      initial={shouldReduceMotion ? false : { height: 0, opacity: 0, y: -8, scale: 0.98 }}
                      animate={shouldReduceMotion ? { height: "auto", opacity: 1 } : { height: "auto", opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: "hidden", transformOrigin: "top" }}
                      className="mt-2 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg shadow-black/5"
                    >
                      {DEMO_ACCOUNTS.map(account => (
                        <button
                          key={account.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedDemoId === account.id}
                          onClick={() => applyDemoAccount(account)}
                          className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/70 transition-colors group first:rounded-t-xl last:rounded-b-xl"
                        >
                          <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <account.icon className="h-4 w-4"/>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                              {account.label}
                            </span>
                            <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {account.description}
                            </span>
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Selecting an account only fills the login form — you still press{" "}
                  <span className="font-semibold text-foreground/80">Sign In</span> to authenticate with Supabase.
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">
                  Email
                </label>
                <input id="login-email" type="email" value={form.email} autoComplete="email"
                  onChange={e => { setForm({...form, email:e.target.value}); if (error) setError(""); }}
                  placeholder="Enter your email" required
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className={cn("w-full h-11 px-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all text-sm", error ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")}/>
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">
                  Password
                </label>
                <div className="relative">
                  <input id="login-password" type={showPw?"text":"password"} value={form.password} autoComplete="current-password"
                    onChange={e => { setForm({...form, password:e.target.value}); if (error) setError(""); }}
                    placeholder="Enter your password" required
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    className={cn("w-full h-11 px-4 pr-11 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all text-sm", error ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30 focus:border-primary")}/>
                  <button type="button" onClick={()=>setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPw?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  transition={{ duration: 0.2 }}
                  id="login-error"
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/8 border border-destructive/20 text-destructive text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </motion.div>
              )}

              <Button type="submit" variant="primary" size="lg" isLoading={loading} className="w-full h-11">
                <LogIn className="h-4 w-4"/> Sign In
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link to="/auth/forgot-password" className="text-sm font-bold text-primary hover:underline">
                Forgot your password?
              </Link>
            </div>

            {/* Footer links */}
            <div className="mt-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                New student?{" "}
                <Link to="/register" className="text-primary font-bold hover:underline">
                  Create Student Account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

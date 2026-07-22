import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { motion } from "motion/react";
import { Eye, EyeOff, LogIn, Shield, ChevronDown, Check, GraduationCap, LayoutDashboard, AlertCircle, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../hooks/useTheme";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { PLVLogo } from "../components/ui/PLVLogo";
import { StarField, LavaLampBackground } from "../components/ui/HeroBackground";

// ── Demo accounts — Admin + Student only ─────────────────────────────────────
const DEMO_ACCOUNTS = [
  {
    label:    "Admin Account",
    subtitle: "Full dashboard & map management",
    username: "admin",
    password: "plv2025",
    icon:     LayoutDashboard,
    accent:   "#0e2a6e",
  },
  {
    label:    "Student Account",
    subtitle: "Campus map & navigation access",
    username: "student",
    password: "plv2025",
    icon:     GraduationCap,
    accent:   "#c8960c",
  },
];

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
  const [form, setForm]        = useState({ username: "", password: "" });
  const [showPw, setShowPw]    = useState(false);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState("");
  const [demoOpen, setDemoOpen]    = useState(false);
  const [filledDemo, setFilledDemo] = useState<string | null>(null);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const { username, password } = form;
    const isAdmin   = username === "admin"   && password === "plv2025";
    const isStudent = username === "student" && password === "plv2025";
    const isFaculty = username === "faculty" && password === "plv2025";

    if (isAdmin) {
      sessionStorage.setItem("plv-admin-auth", "true");
      sessionStorage.removeItem("plv-student-auth");
      toast.success("Welcome back", "Redirecting to admin dashboard...");
      setTimeout(() => navigate("/admin-dashboard"), 400);
    } else if (isStudent || isFaculty) {
      // Students/faculty land on the public campus map, not the admin dashboard
      sessionStorage.setItem("plv-student-auth", JSON.stringify({ username, role: isStudent ? "student" : "faculty" }));
      sessionStorage.removeItem("plv-admin-auth");
      toast.success("Signed in", `Welcome back, ${username}!`);
      setTimeout(() => navigate("/map"), 400);
    } else {
      setError("Incorrect username or password.");
      setLoading(false);
    }
  };

  const pickDemo = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setForm({ username: acc.username, password: acc.password });
    setFilledDemo(acc.username);
    setDemoOpen(false);
    setError("");
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

            {/* Demo accounts accordion */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setDemoOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 h-11 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-all text-sm font-semibold text-foreground"
              >
                <span className="flex items-center gap-2">
                  {filledDemo ? (
                    <><Check className="h-4 w-4 text-green-500"/>
                      <span className="text-green-600 dark:text-green-400 font-bold">
                        {DEMO_ACCOUNTS.find(a=>a.username===filledDemo)?.label}
                      </span>
                    </>
                  ) : "Use a Demo Account"}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${demoOpen?"rotate-180":""}`}/>
              </button>

              <div className="transition-all duration-300 ease-in-out"
                style={{ maxHeight: demoOpen ? 160 : 0, opacity: demoOpen ? 1 : 0, overflow: demoOpen ? 'visible' : 'hidden' }}>
                <div className="mt-2 rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
                  {DEMO_ACCOUNTS.map(acc => {
                    const Icon = acc.icon;
                    return (
                      <button key={acc.username} type="button" onClick={() => pickDemo(acc)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left border-b border-border last:border-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: acc.accent }}>
                          <Icon className="h-4 w-4 text-white"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground leading-none">{acc.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{acc.subtitle}</p>
                        </div>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                          {acc.username}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-border"/>
              <span className="text-xs text-muted-foreground font-medium">or enter manually</span>
              <div className="flex-1 h-px bg-border"/>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-username" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-widest">
                  Username
                </label>
                <input id="login-username" type="text" value={form.username} autoComplete="username"
                  onChange={e => { setForm({...form, username:e.target.value}); setFilledDemo(null); if (error) setError(""); }}
                  placeholder="Enter your username" required
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
                    onChange={e => { setForm({...form, password:e.target.value}); setFilledDemo(null); if (error) setError(""); }}
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
                    <p className="text-xs text-destructive/80 mt-0.5">
                      Demo credentials are: <span className="font-mono font-bold">admin</span> / <span className="font-mono font-bold">plv2025</span> or <span className="font-mono font-bold">student</span> / <span className="font-mono font-bold">plv2025</span>
                    </p>
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

            {/* Footer links */}
            <div className="mt-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                New student?{" "}
                <Link to="/register" className="text-primary font-bold hover:underline">
                  Create Student Account
                </Link>
              </p>
              <p className="text-[11px] text-muted-foreground/50">
                Demo credentials are for presentation purposes only.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

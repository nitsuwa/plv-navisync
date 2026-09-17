import { Link } from "react-router";
import {
  Map, Search, Accessibility, AlertTriangle,
  Star, Flag, CheckCircle2, ArrowRight, ArrowDown,
  Compass, Crosshair, MapPin, Hexagon, MousePointer2,
  Navigation, Eye, Smartphone, Wifi, Shield, ChevronDown,
  Sparkles, Layers, Bookmark, Clock, Route, Zap, Wrench,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform, useSpring } from "motion/react";
import { PLVLogo } from "../components/ui/PLVLogo";
import { AccessibleRouteDemo as A11yDemo } from "../components/landing/AccessibleRouteDemo";
import { LavaLampBackground } from "../components/ui/HeroBackground";
import { useScrollReveal } from "../hooks/useScrollReveal";

// ═════════════════════════════════════════════════════════════════════════════
// ── Floating decorative shapes (Hero) ────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const FLOATING_SHAPES = [
  { Icon: Compass,   size: 20, startX: "12%", startY: "18%",  dur: 7,  delay: 0,   rotate: true,  opacity: 0.15 },
  { Icon: MapPin,    size: 16, startX: "85%", startY: "25%",  dur: 9,  delay: 1.5, rotate: false, opacity: 0.12 },
  { Icon: Hexagon,   size: 22, startX: "8%",  startY: "70%",  dur: 8,  delay: 0.8, rotate: true,  opacity: 0.10 },
  { Icon: Crosshair, size: 18, startX: "75%", startY: "10%",  dur: 11, delay: 2.5, rotate: true,  opacity: 0.12 },
  { Icon: Map,       size: 24, startX: "90%", startY: "65%",  dur: 10, delay: 1,   rotate: false, opacity: 0.10 },
  { Icon: MapPin,    size: 14, startX: "22%", startY: "50%",  dur: 12, delay: 3,   rotate: false, opacity: 0.08 },
];

const SHAPE_COLORS = ["rgba(200,150,12,0.5)", "rgba(59,110,240,0.4)", "rgba(56,189,248,0.3)", "rgba(147,51,234,0.3)"];

// ═════════════════════════════════════════════════════════════════════════════
// ── scroll-reveal (local, matches existing codebase pattern) ─────────────────
// ═════════════════════════════════════════════════════════════════════════════

function Reveal({ children, className, delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={{
      opacity:   visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(32px)",
      transition: visible
        ? `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
        : "opacity 0.3s ease, transform 0.3s ease",
    }}>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Mouse-following radial glow ──────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const mqHandler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", mqHandler);
    return () => mq.removeEventListener("change", mqHandler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const handleMouse = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setPos({ x, y });
    };
    window.addEventListener("mousemove", handleMouse, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouse);
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      className="absolute pointer-events-none select-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: 400,
        height: 400,
        transform: "translate(-50%, -50%)",
        background: "radial-gradient(circle, rgba(59,110,240,0.15) 0%, transparent 60%)",
        filter: "blur(60px)",
        transition: "left 0.8s cubic-bezier(0.16,1,0.3,1), top 0.8s cubic-bezier(0.16,1,0.3,1)",
        willChange: "left, top",
        zIndex: 1,
      }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Floating particles ───────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function FloatingParticles({ count = 20 }: { count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${(i * 17 + 7) % 100}%`,
    delay: `${(i * 1.3) % 12}s`,
    size: 1.5 + (i % 3) * 0.8,
    dur: 14 + (i % 6) * 2,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white/20"
          style={{
            left: p.left,
            bottom: "-5%",
            width: p.size,
            height: p.size,
            animation: `particle-float ${p.dur}s linear ${p.delay} infinite`,
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Animated route lines (hero background) ───────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function HeroRouteLines({ reducedMotion = false }: { reducedMotion?: boolean }) {
  // Each line draws on a loop: draws in over ~4-6s, stays visible ~12-16s, then resets
  const LINES = [
    {
      d: "M-100 300 C 200 280, 400 350, 600 300 S 900 250, 1100 320 S 1300 280, 1500 300",
      delay: "0.5s", dur: "4s", total: "18s",
      color: "rgba(200,150,12,0.4)", dash: "6 8", width: 1.5,
    },
    {
      d: "M-50 500 C 200 450, 300 600, 500 480 S 700 550, 900 500 S 1100 450, 1300 520 S 1450 480, 1550 500",
      delay: "2s", dur: "5s", total: "22s",
      color: "rgba(59,110,240,0.35)", dash: "4 10", width: 1.2,
    },
    {
      d: "M200 800 C 400 650, 600 700, 800 600 S 1000 500, 1200 650 S 1400 550, 1500 600",
      delay: "3.5s", dur: "6s", total: "25s",
      color: "rgba(56,189,248,0.3)", dash: "3 12", width: 1,
    },
    {
      d: "M300 -50 C 350 100, 400 250, 350 400 S 300 550, 400 700 S 450 800, 400 950",
      delay: "1.2s", dur: "7s", total: "20s",
      color: "rgba(200,150,12,0.25)", dash: "5 12", width: 1,
    },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20" aria-hidden="true">
      <svg className="w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        {LINES.map((line, i) => (
          <g key={i}>
            <path
              d={line.d}
              fill="none"
              stroke={line.color}
              strokeWidth={line.width}
              strokeDasharray={line.dash}
              className={reducedMotion ? undefined : "animate-route-draw-loop"}
              style={{
                animationDelay: line.delay,
                animationDuration: line.total,
              }}
            />
          </g>
        ))}
        {/* Route nodes (dots at intersections) */}
        <circle cx="600" cy="300" r="2.5" fill="rgba(200,150,12,0.5)" className={reducedMotion ? undefined : "animate-pulse-ring-soft"} style={{ animationDelay: "1s" }} />
        <circle cx="900" cy="500" r="2" fill="rgba(59,110,240,0.5)" className={reducedMotion ? undefined : "animate-pulse-ring-soft"} style={{ animationDelay: "2.5s" }} />
        <circle cx="400" cy="700" r="2.5" fill="rgba(56,189,248,0.4)" className={reducedMotion ? undefined : "animate-pulse-ring-soft"} style={{ animationDelay: "4s" }} />
      </svg>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── wavy section divider ─────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function WavyDivider({ fill = "#071440" }: { fill?: string }) {
  return (
    <div className="relative w-full pointer-events-none select-none" style={{ height: 90, marginBottom: 0 }}>
      <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <path d="M0,55 C80,25 160,72 260,44 C360,16 440,68 540,40 C640,12 730,62 840,36 C950,10 1040,60 1140,34 C1240,8 1340,52 1390,36 L1440,30 L1440,90 L0,90 Z" fill={fill} />
      </svg>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Section label component ──────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest mb-5">
      <Sparkles className="h-3 w-3" />
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── PLATFORM HIGHLIGHTS — replaces the 8-card feature grid ───────────────────
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// ── HOW NAVISYNC HELPS YOU — interactive scenario demos ──────────────────────
// ═════════════════════════════════════════════════════════════════════════════

/** Search demo — typewriter effect */
function SearchDemo() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "results" | "done">("typing");
  const fullText = "CCS Laboratory 2";
  const results = ["CCS Laboratory 2 — Main Building, 2F", "CCS Laboratory 1 — Main Building, 1F", "CCS Faculty Room — Main Building, 2F"];

  useEffect(() => {
    if (phase === "typing" && text.length < fullText.length) {
      const t = setTimeout(() => setText(fullText.slice(0, text.length + 1)), 60);
      return () => clearTimeout(t);
    }
    if (phase === "typing" && text.length === fullText.length) {
      const t = setTimeout(() => setPhase("results"), 400);
      return () => clearTimeout(t);
    }
    if (phase === "results") {
      const t = setTimeout(() => setPhase("done"), 1500);
      return () => clearTimeout(t);
    }
    // reset loop
    if (phase === "done") {
      const t = setTimeout(() => { setText(""); setPhase("typing"); }, 3000);
      return () => clearTimeout(t);
    }
  }, [text, phase]);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border bg-muted/50 border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground/85 font-medium flex-1">
          {text}
          {phase === "typing" && <span className="animate-cursor-blink text-muted-foreground">|</span>}
        </span>
        {phase === "done" && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 animate-scale-in" />
        )}
      </div>
      {/* Results dropdown */}
      {(phase === "results" || phase === "done") && (
        <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden animate-fade-in-up">
          {results.map((r, i) => (
            <div
              key={i}
              className="px-3.5 py-2.5 flex items-center gap-2.5 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <MapPin className="h-3 w-3 text-primary shrink-0" />
              <span className="text-xs text-foreground/75 font-medium">{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Route drawing demo — SVG mini-map */
function RouteDemo() {
  const [drawn, setDrawn] = useState(false);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redrawRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Initial draw after mount
    const initialDraw = setTimeout(() => setDrawn(true), 600);

    // Cycle: hide, redraw, then let the walking marker loop again.
    cycleRef.current = setInterval(() => {
      setDrawn(false);
      redrawRef.current = setTimeout(() => setDrawn(true), 120);
    }, 5000);

    return () => {
      clearTimeout(initialDraw);
      if (cycleRef.current) clearInterval(cycleRef.current);
      if (redrawRef.current) clearTimeout(redrawRef.current);
    };
  }, []);

  return (
    <div
      data-testid="route-demo"
      data-route-style="straight-building-route"
      aria-label="Walking route from Building A to Building B"
      className="relative rounded-xl overflow-hidden bg-[#0a1628] border border-white/10"
      style={{ minHeight: 160 }}
    >
      {/* Mini map grid */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }} />
      {/* Two buildings with a direct outdoor walking route between them */}
      <div className="absolute left-[10%] top-[34%] w-[22%] rounded-md border border-blue-300/30 bg-blue-500/20 px-2 py-2 text-center">
        <span className="block text-[9px] font-extrabold uppercase tracking-wider text-blue-100">Building A</span>
        <span className="mt-1 block text-[8px] text-white/50">Start</span>
      </div>
      <div className="absolute right-[10%] top-[34%] w-[22%] rounded-md border border-accent/40 bg-accent/15 px-2 py-2 text-center">
        <span className="block text-[9px] font-extrabold uppercase tracking-wider text-accent-foreground">Building B</span>
        <span className="mt-1 block text-[8px] text-white/50">Destination</span>
      </div>

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 160" style={{ pointerEvents: "none" }}>
        <defs>
          <filter id="route-demo-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M96 80 L204 80"
          fill="none"
          stroke="rgba(74,127,212,0.25)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          id="route-demo-path"
          d="M96 80 L204 80"
          pathLength="1"
          fill="none"
          stroke="rgba(111,168,255,0.95)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="0.035 0.035"
          style={{
            strokeDashoffset: drawn ? 0 : 1,
            transition: "stroke-dashoffset 2.5s ease-out",
          }}
          filter="url(#route-demo-glow)"
        />

        {/* Animated walking person moving from A to B */}
        <g
          data-testid="route-walking-marker"
          data-animation="walking"
          role="img"
          aria-label="Walking from Building A to Building B"
          transform="translate(96 80)"
        >
          <circle cx="0" cy="-6" r="2.5" fill="#f8fafc" />
          <path d="M0 -3 L0 3 M0 -1 L-4 2 M0 -1 L4 2 M0 3 L-3 7 M0 3 L3 7" fill="none" stroke="#f8fafc" strokeWidth="1.8" strokeLinecap="round" />
          <animateMotion dur="3.2s" repeatCount="indefinite" path="M0 0 L108 0" />
        </g>
      </svg>
      {/* Labels */}
      <div className="absolute bottom-2 left-2 text-[10px] text-white/50 font-mono flex items-center gap-1">
        <MapPin className="h-2.5 w-2.5" /> Building A
      </div>
      <div className="absolute bottom-2 right-2 text-[10px] text-white/50 font-mono flex items-center gap-1">
        <Flag className="h-2.5 w-2.5" /> Building B
      </div>
      <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/55">
        Walking route · 2 min
      </div>
    </div>
  );
}


/** Report demo */
function ReportDemo() {
  const [phase, setPhase] = useState<"idle" | "reporting" | "submitted" | "resolved">("idle");

  useEffect(() => {
    if (phase === "reporting") {
      const t = setTimeout(() => setPhase("submitted"), 1200);
      return () => clearTimeout(t);
    }
    if (phase === "submitted") {
      const t = setTimeout(() => setPhase("resolved"), 2500);
      return () => clearTimeout(t);
    }
    if (phase === "resolved") {
      const t = setTimeout(() => setPhase("idle"), 3000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  return (
    <div className="space-y-3">
      {/* Trigger button */}
      <button
        onClick={() => phase === "idle" && setPhase("reporting")}
        disabled={phase !== "idle"}
        className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border bg-muted/50 border-border hover:bg-muted/80 transition-all disabled:opacity-50"
      >
        <Flag className={`h-3.5 w-3.5 ${phase === "idle" ? "text-orange-500" : "text-muted-foreground/60"}`} />
        <span className="text-sm font-bold text-foreground/85">
          {phase === "idle" && "Pin a broken facility"}
          {phase === "reporting" && "Submitting report..."}
          {phase === "submitted" && "Report submitted"}
          {phase === "resolved" && "Issue marked as resolved"}
        </span>
      </button>
      {/* Flow visualization */}
      {(phase === "reporting" || phase === "submitted" || phase === "resolved") && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-3 animate-fade-in-up">
          <div className="flex items-center justify-between">
            {/* Step 1: Pin */}
            <div className={`flex flex-col items-center gap-1.5 ${phase === "reporting" ? "text-foreground/85" : "text-muted-foreground/50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${phase === "reporting" ? "bg-orange-500/15" : "bg-muted-foreground/10"}`}>
                <MapPin className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-medium">Pin Issue</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
            {/* Step 2: Admin */}
            <div className={`flex flex-col items-center gap-1.5 ${phase === "submitted" ? "text-foreground/85" : "text-muted-foreground/50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${phase === "submitted" ? "bg-blue-500/15" : "bg-muted-foreground/10"}`}>
                <Eye className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-medium">Admin</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
            {/* Step 3: Resolved */}
            <div className={`flex flex-col items-center gap-1.5 ${phase === "resolved" ? "text-foreground/85" : "text-muted-foreground/50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${phase === "resolved" ? "bg-green-500/15" : "bg-muted-foreground/10"}`}>
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-medium">Resolved</span>
            </div>
          </div>
          {phase === "submitted" && (
            <div className="mt-2 text-[10px] text-blue-600 dark:text-blue-400 text-center font-medium animate-fade-in-up">
              Admin has received your report
            </div>
          )}
          {phase === "resolved" && (
            <div className="mt-2 text-[10px] text-green-600 dark:text-green-400 text-center font-medium animate-fade-in-up">
              Issue has been resolved. Thank you!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SCENARIOS = [
  {
    id: "search",
    icon: Search,
    title: "Find a Classroom",
    desc: "Search any room, lab, or office. See results instantly, then navigate straight there.",
    demo: "search",
    color: "from-blue-500/10 to-blue-600/5",
    borderColor: "rgba(59,110,240,0.2)",
  },
  {
    id: "route",
    icon: Route,
    title: "Get Directions",
    desc: "Watch the route draw itself across the campus map. Know exactly where you're going.",
    demo: "route",
    color: "from-indigo-500/10 to-indigo-600/5",
    borderColor: "rgba(99,102,241,0.2)",
  },
  {
    id: "a11y",
    icon: Accessibility,
    title: "Accessible Routes",
    desc: "Flip the toggle. The route automatically avoids stairs—using ramps and elevators instead.",
    demo: "a11y",
    color: "from-green-500/10 to-green-600/5",
    borderColor: "rgba(34,197,94,0.2)",
  },
  {
    id: "report",
    icon: Flag,
    title: "Report an Issue",
    desc: "Pin a broken facility. Submit the report. Admin receives it. Issue gets resolved.",
    demo: "report",
    color: "from-orange-500/10 to-orange-600/5",
    borderColor: "rgba(249,115,22,0.2)",
  },
];

function HowHelpsYou() {
  const [activeScenario, setActiveScenario] = useState("search");
  const reduceMotion = useReducedMotion();
  const active = SCENARIOS.find((scenario) => scenario.id === activeScenario) ?? SCENARIOS[0];

  const renderDemo = (demo: string) => {
    switch (demo) {
      case "search": return <SearchDemo />;
      case "route":  return <RouteDemo />;
      case "a11y":   return <A11yDemo />;
      case "report": return <ReportDemo />;
      default:       return null;
    }
  };

  return (
    <section
      aria-labelledby="landing-feature-tour-heading"
      data-testid="landing-feature-tour"
      className="py-16 lg:py-24 bg-muted/30 relative overflow-hidden"
    >
      {/* Subtle background ornament */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/3 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/3 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-7 relative">
        <Reveal className="text-center mb-10 lg:mb-12">
          <SectionLabel>Choose a campus task</SectionLabel>
          <h2 id="landing-feature-tour-heading" className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            How NaviSync Helps You
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Pick a real campus need and preview the path from finding a place to getting there.
          </p>
        </Reveal>

        <div
          className="grid md:grid-cols-[minmax(190px,0.34fr)_minmax(0,1fr)] gap-4 lg:gap-6 max-w-5xl mx-auto rounded-[2rem] border border-white/45 bg-card/75 p-3 sm:p-4 shadow-[0_24px_70px_rgba(7,20,64,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]"
          style={{ WebkitBackdropFilter: "blur(18px)" }}
        >
          <div className="flex flex-col gap-2" aria-label="NaviSync feature previews">
            {SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              const isActive = activeScenario === scenario.id;

              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setActiveScenario(scenario.id)}
                  aria-expanded={isActive}
                  aria-controls="landing-feature-tour-panel"
                  className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 ${
                    isActive
                      ? "border-primary/30 bg-primary text-primary-foreground shadow-lg"
                      : "border-border/70 bg-background/65 text-muted-foreground hover:border-primary/25 hover:bg-background hover:text-foreground"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-white/15" : "bg-primary/8 text-primary"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold leading-tight">{scenario.title}</span>
                    <span className={`mt-1 block text-[11px] leading-snug ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {scenario.id === "search" ? "Find rooms and offices" : scenario.id === "route" ? "Plan your next route" : scenario.id === "a11y" ? "Choose an easier path" : "Keep campus issues visible"}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 md:-rotate-90 ${isActive ? "rotate-180 md:rotate-0" : ""}`} />
                </button>
              );
            })}
          </div>

          <div
            id="landing-feature-tour-panel"
            data-testid="landing-feature-tour-panel"
            className="min-h-[280px] rounded-[1.6rem] border p-5 sm:p-7 bg-background/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:bg-white/[0.08]"
            style={{ borderColor: active.borderColor, WebkitBackdropFilter: "blur(14px)" }}
          >
            <AnimatePresence initial={false} mode="sync">
              <motion.div
                key={active.id}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full flex-col"
              >
                <div className="mb-4 flex items-center justify-between gap-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">
                  <span aria-live="polite">Previewing {active.title}</span>
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Interactive demo
                  </span>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold" style={{ borderColor: active.borderColor, background: active.color }}>
                  <active.icon className="h-3.5 w-3.5" />
                  {active.title}
                </div>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {active.desc}
                </p>
                <div className="mt-5 flex-1 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
                  {renderDemo(active.demo)}
                </div>
                <Link
                  to="/map"
                  className="group mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-bold text-primary transition-colors hover:text-primary/80"
                >
                  Try it on the map
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── HOW IT WORKS — timeline ──────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const STEPS = [
  { icon: Search,     title: "Search Destination",   desc: "Type any building, room, or office name into the smart search bar." },
  { icon: Bookmark,   title: "Choose Your Spot",     desc: "Pick from suggested results. The building highlights on the campus map." },
  { icon: Route,      title: "Follow Navigation",    desc: "Get turn-by-turn directions with an animated route drawn in real time." },
  { icon: MapPin,     title: "Arrive Successfully",  desc: "Know exactly where you are. The map updates as you move through campus." },
  { icon: Flag,       title: "Report Issues (Optional)", desc: "Found something broken? Pin it on the map so admin can fix it." },
];

function HowItWorks() {
  return (
    <section className="py-20 lg:py-28 bg-background relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 sm:px-7">
        <Reveal className="text-center mb-16">
          <SectionLabel>User Journey</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            How It Works
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            From searching to arriving — in just a few taps.
          </p>
        </Reveal>

        <div className="relative max-w-2xl mx-auto">
          {/* Vertical connecting line */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" aria-hidden="true" />

          <div className="space-y-10">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 80}>
                <div className="relative flex items-start gap-6 pl-0">
                  {/* Step number + icon */}
                  <div className="relative z-10 flex items-center justify-center w-16 h-16 rounded-2xl bg-card border border-border shadow-sm shrink-0">
                    <div className="absolute -inset-1 rounded-2xl bg-primary/5 animate-glow-soft" style={{ animationDelay: `${i * 0.5}s` }} />
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                  {/* Content */}
                  <div className="pt-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-extrabold text-muted-foreground/60 uppercase tracking-widest">
                        Step {i + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-foreground mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal className="text-center mt-12">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/map"
              className="inline-flex items-center gap-2 h-11 px-7 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 transition-all shadow-md"
            >
              <Map className="h-4 w-4" /> Start Navigating
            </Link>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── PRODUCT SHOWCASE — alternating screenshots + descriptions ────────────────
// ═════════════════════════════════════════════════════════════════════════════

const SHOWCASE_ITEMS = [
  {
    title: "Smart Search, Instant Results",
    desc: "The search bar finds any building, room, or facility across campus. Type a name, and the map highlights your destination immediately.",
    features: ["Real-time search suggestions", "Fuzzy matching for typos", "Recent searches for quick access"],
    demo: "search" as const,
    color: "#3b6ef0",
  },
  {
    title: "Interactive Map with Routes",
    desc: "The campus map is fully interactive. Zoom, pan, and tap any building for details. Routes draw themselves as you navigate.",
    features: ["Smooth pinch-to-zoom gestures", "Animated turn-by-turn routes", "Building info cards with floor plans"],
    demo: "route" as const,
    color: "#6366f1",
  },
  {
    title: "Accessibility & Emergency Tools",
    desc: "Toggle accessible routes that avoid stairs and use ramps. In emergencies, one tap activates evacuation navigation.",
    features: ["Wheelchair-friendly route planning", "Emergency evacuation mode", "Real-time hazard alerts on map"],
    demo: "a11y" as const,
    color: "#22c55e",
  },
  {
    title: "Report Issues in Seconds",
    desc: "Spot a broken facility or hazard? Pin it on the map, submit the report, and admin gets notified instantly. Track resolution progress.",
    features: ["One-tap issue reporting from the map", "Photo attachment for visual context", "Real-time status updates on your report"],
    demo: "report" as const,
    color: "#f59e0b",
  },
];

function ShowcaseDemo({ type }: { type: "search" | "route" | "a11y" | "report" }) {
  switch (type) {
    case "search":
      return (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Search buildings, rooms &hellip;</span>
            <div className="ml-auto flex gap-1">
              <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-background text-muted-foreground border border-border">⌘K</kbd>
            </div>
          </div>
          <div className="space-y-1">
            {["Registrar Office", "CCS Laboratory 2", "Library"].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] text-primary font-bold shrink-0">
                  <MapPin className="h-2.5 w-2.5" />
                </div>
                <span className="text-xs font-medium text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "route":
      return (
        <div className="relative rounded-lg overflow-hidden bg-[#0a1628] border border-border" style={{ minHeight: 120 }}>
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
          }} />
          {/* Buildings */}
          <div className="absolute" style={{ left: "15%", top: "20%", width: 32, height: 24, background: "rgba(59,110,240,0.2)", borderRadius: 3, border: "1px solid rgba(59,110,240,0.2)" }} />
          <div className="absolute" style={{ left: "60%", top: "60%", width: 36, height: 28, background: "rgba(200,150,12,0.15)", borderRadius: 3, border: "1px solid rgba(200,150,12,0.2)" }} />
          {/* Route path */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 240 120">
            <path
              d="M36 24 C 80 20, 100 40, 120 40 S 150 60, 144 80"
              fill="none"
              stroke="rgba(74,127,212,0.5)"
              strokeWidth="1.5"
              strokeDasharray="5 3"
              className="animate-route-draw"
              style={{ animationDuration: "3s" }}
            />
          </svg>
        </div>
      );
    case "a11y":
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted border border-border">
            <div className="flex items-center gap-2">
              <Accessibility className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs font-bold text-foreground">Accessible Route</span>
            </div>
            <div className="w-8 h-4 rounded-full bg-green-500 relative">
              <div className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Route avoids stairs — uses elevator
          </div>
        </div>
      );
    case "report":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
            <Flag className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs font-bold text-foreground flex-1">Report an Issue</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-bold">NEW</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-card border border-border">
              <div className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <MapPin className="h-3 w-3 text-orange-500" />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">Pin</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-card border border-border">
              <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Eye className="h-3 w-3 text-blue-500" />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">Admin</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-card border border-green-200 dark:border-green-800">
              <div className="w-6 h-6 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              </div>
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Resolved</span>
            </div>
          </div>
        </div>
      );
  }
}

function ProductShowcase() {
  return (
    <section className="py-20 lg:py-28 bg-muted/30 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 sm:px-7">
        <Reveal className="text-center mb-16">
          <SectionLabel>Product Showcase</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            See It in Action
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Real interface previews that show how NaviSync works.
          </p>
        </Reveal>

        <div className="space-y-16 md:space-y-24">
          {SHOWCASE_ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={i * 100}>
              <div className={`grid md:grid-cols-2 gap-6 md:gap-12 items-center ${i % 2 === 1 ? "md:grid-flow-dense" : ""}`}>
                {/* Screenshot / demo */}
                <div className={i % 2 === 1 ? "md:col-start-2" : ""}>
                  <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      <span className="ml-2 text-[10px] text-muted-foreground font-mono">navisync.app</span>
                    </div>
                    <ShowcaseDemo type={item.demo} />
                  </div>
                </div>
                {/* Description */}
                <div className={i % 2 === 1 ? "md:col-start-1" : ""}>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-foreground mb-3 leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    {item.desc}
                  </p>
                  <ul className="space-y-2">
                    {item.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── WHY NAVISYNC — improved visual section ───────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const IMPROVEMENTS = [
  { icon: Zap,         title: "Navigate faster",           desc: "Real-time campus guidance that gets you where you need to be." },
  { icon: MapPin,      title: "Find instantly",            desc: "Any classroom, lab, or office — search and go in seconds." },
  { icon: Accessibility, title: "Accessible by design",    desc: "Wheelchair routes and emergency exits built into every path." },
  { icon: Layers,     title: "All in one place",           desc: "Maps, events, reports, and admin — unified on one platform." },
  { icon: MousePointer2, title: "Drag-and-drop builder",   desc: "Admin can update the map without touching code." },
  { icon: Clock,      title: "Live updates",               desc: "Building status, queue info, and alerts — always current." },
];

function WhyNaviSync() {
  return (
    <section className="py-20 lg:py-28 bg-background relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 sm:px-7">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left column — headline + CTA */}
          <Reveal>
            <SectionLabel>Why NaviSync</SectionLabel>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight mb-4">
              Built for the way <span className="text-primary">campus life</span> actually works.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-7">
              PLV NaviSync connects navigation, events, accessibility, emergencies, and administration in one seamless experience.
              No more jumping between apps or asking for directions.
            </p>

            {/* Mini preview card */}
            <div className="rounded-xl border border-border bg-card p-4 mb-7 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Star className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-foreground">Trusted by the PLV community</p>
                  <p className="text-[10px] text-muted-foreground">Pamantasan ng Lungsod ng Valenzuela</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Shield className="h-3 w-3 text-green-500" />
                Built for students, faculty, and visitors
              </div>
            </div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/map"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 transition-all shadow-md"
              >
                <Map className="h-4 w-4" /> Explore the Map
              </Link>
            </motion.div>
          </Reveal>

          {/* Right column — visual benefit cards */}
          <Reveal delay={80}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {IMPROVEMENTS.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="group rounded-xl border border-border bg-card p-4 hover:border-primary/15 hover:shadow-sm transition-all duration-200"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/8 text-primary flex items-center justify-center mb-2.5 group-hover:bg-primary/12 transition-colors">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-extrabold text-foreground mb-0.5">{item.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── A DAY WITH NAVISYNC — visual storytelling ───────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const STORIES = [
  {
    icon: MapPin,
    title: "Finding the Registrar",
    steps: [
      "You're looking for the Registrar",
      'Search "Registrar" in the search bar',
      "Map highlights the destination",
      "Follow the animated route",
      "You arrive — no detours",
    ],
  },
  {
    icon: Accessibility,
    title: "Accessible Navigation",
    steps: [
      "Need a wheelchair route?",
      "Enable Accessibility Mode",
      "Route updates automatically",
      "Avoids stairs, uses ramps",
      "Arrive safely and on time",
    ],
  },
  {
    icon: Wrench,
    title: "Reporting an Issue",
    steps: [
      "Notice a broken light?",
      "Pin the location on the map",
      "Report is sent to admin",
      "Admin assigns a fix",
      "Issue resolved. Campus improved!",
    ],
  },
];

function DayWithNaviSync() {
  return (
    <section className="py-20 lg:py-28 bg-muted/30 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 sm:px-7">
        <Reveal className="text-center mb-14">
          <SectionLabel>See It in Practice</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            A Day With NaviSync
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Real scenarios that show how NaviSync makes campus life easier, every single day.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-5">
          {STORIES.map((story, si) => {
            const StoryIcon = story.icon;
            return (
            <Reveal key={story.title} delay={si * 100}>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow duration-300 h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <StoryIcon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-extrabold text-foreground">{story.title}</h3>
                </div>
                <div className="space-y-1">
                  {story.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 py-1.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-extrabold ${
                        i === story.steps.length - 1
                          ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                          : "bg-primary/10 text-primary"
                      }`}>
                        {i === story.steps.length - 1 ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span className={`text-sm leading-snug ${
                        i === story.steps.length - 1
                          ? "text-green-600 dark:text-green-400 font-bold"
                          : "text-foreground/85"
                      }`}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          );
        })}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── HERO (enhanced) ─────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function LandingMapPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-testid="landing-map-preview"
      aria-label="Campus map preview showing a walking route between Building A and Building B"
      className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#0b1b45]/90 p-3 shadow-[0_28px_80px_rgba(1,8,30,0.35)]"
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
    >
      <div className="relative min-h-[250px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b2357] sm:min-h-[350px]">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute -left-12 bottom-8 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-8 top-10 h-44 w-44 rounded-full bg-accent/10 blur-3xl" />

        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 520 340"
          preserveAspectRatio="none"
        >
          <path
            d="M38 250 C130 205 152 104 244 130 S360 255 470 88"
            fill="none"
            stroke="rgba(255,255,255,.08)"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <path
            d="M38 250 C130 205 152 104 244 130 S360 255 470 88"
            fill="none"
            stroke="#f4bd38"
            strokeWidth="4"
            strokeDasharray="9 9"
            strokeLinecap="round"
            className={reduceMotion ? undefined : "animate-route-draw"}
          />
          <path
            d="M90 54 L440 286 M120 300 L394 42"
            stroke="rgba(106,171,255,.22)"
            strokeWidth="2"
            strokeDasharray="5 10"
          />
          <circle cx="38" cy="250" r="10" fill="none" stroke="#6aaeff" strokeWidth="2" opacity=".35" />
          <circle cx="38" cy="250" r="5.5" fill="#6aaeff" stroke="#0b2357" strokeWidth="3" opacity=".98" />
          <circle cx="470" cy="88" r="10" fill="none" stroke="#f4bd38" strokeWidth="2" opacity=".35" />
          <circle cx="470" cy="88" r="5.5" fill="#f4bd38" stroke="#0b2357" strokeWidth="3" opacity=".98" />
        </svg>

        <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/15 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.16em] text-white/70">
          Campus map, at a glance
        </div>

        <div
          data-testid="map-start-callout"
          data-callout-placement="above-start-marker"
          className="absolute left-[7%] top-[45%] rounded-xl border border-blue-200/30 bg-blue-500/25 px-3 py-2 text-white shadow-lg backdrop-blur-sm"
        >
          <span className="block text-[10px] font-extrabold uppercase tracking-[.16em] text-blue-100">Building A</span>
          <span className="mt-1 block text-[10px] text-white/60">Your starting point</span>
        </div>
        <div
          data-testid="map-end-callout"
          data-callout-placement="above-end-marker"
          className="absolute right-[6%] top-[30%] rounded-xl border border-accent/50 bg-accent/20 px-3 py-2 text-white shadow-lg backdrop-blur-sm sm:top-[5%]"
        >
          <span className="block text-[10px] font-extrabold uppercase tracking-[.16em] text-accent-foreground">Building B</span>
          <span className="mt-1 block text-[10px] text-white/60">Destination</span>
        </div>

        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-white/10 bg-[#071440]/70 px-3 py-2 text-[10px] font-semibold text-white/70 backdrop-blur-sm">
          <Navigation className="h-3.5 w-3.5 text-accent" />
          <span>Route ready to follow</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 text-xs text-white/70">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.7)]" />
          Walking route ready
        </span>
        <span className="font-mono text-white/50">2 min · 148 m</span>
      </div>
    </motion.div>
  );
}

function HeroSection() {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const smoothY = useSpring(scrollY, { stiffness: 60, damping: 35, mass: 0.6 });

  const heroBgY      = useTransform(smoothY, [0, 900], [0, 24]);
  const heroContentY = useTransform(smoothY, [0, 900], [0, -28]);
  const heroLogoY    = useTransform(smoothY, [0, 900], [0, -12]);
  const heroOpacity  = useTransform(smoothY, [0, 900], [1, 0.9]);

  return (
    <section
      data-testid="landing-hero"
      data-scroll-behavior="subtle"
      data-mobile-nav-aware="true"
      className="relative isolate flex min-h-0 items-center justify-center overflow-hidden pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-4 sm:py-12 lg:min-h-[820px] lg:py-28 lg:pb-28"
      aria-labelledby="landing-hero-heading"
    >
      {/* ── Animated gradient background — slow shift ── */}
      <motion.div
        className="absolute inset-0"
        style={{ y: reduceMotion ? 0 : heroBgY }}
      >
        <div className={`absolute inset-0 ${reduceMotion ? "" : "animate-gradient-shift"}`} style={{
          background: `
            radial-gradient(ellipse 90% 70% at 50% 35%, #0d2470 0%, #071440 50%, #020a1c 100%),
            linear-gradient(135deg, rgba(59,110,240,0.08) 0%, transparent 30%, rgba(200,150,12,0.05) 60%, transparent 100%)
          `,
          backgroundBlendMode: "overlay",
          backgroundSize: "200% 200%",
        }} />
      </motion.div>

      {/* ── Grid overlay — pulsing subtly ── */}
      <div
        className={`absolute inset-0 pointer-events-none ${reduceMotion ? "" : "animate-grid-pulse"}`}
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Cursor-interactive lava lamp blobs ── */}
      {!reduceMotion && <LavaLampBackground />}

      {/* ── Animated route lines ── */}
      <HeroRouteLines reducedMotion={Boolean(reduceMotion)} />

      {/* ── Floating particles ── */}
      {!reduceMotion && <FloatingParticles count={16} />}

      {/* ── Floating decorative shapes ── */}
      {FLOATING_SHAPES.map(({ Icon, size, startX, startY, dur, delay, rotate, opacity }, i) => (
        <div
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: startX, top: startY,
            color: SHAPE_COLORS[i % SHAPE_COLORS.length],
            opacity,
          }}
        >
          <div style={{ animation: reduceMotion ? undefined : `ag-float-${(i % 6) + 1} ${dur}s ease-in-out ${delay}s infinite` }}>
            <Icon
              size={size}
              strokeWidth={1.5}
              style={{
                filter: "blur(1px)",
                transform: rotate ? undefined : "rotate(var(--r, 0deg))",
              }}
            />
          </div>
        </div>
      ))}

      {/* ── Mouse-following radial glow ── */}
      <MouseGlow />

      {/* ── Aurora blobs ── */}
      <div
        className={`absolute pointer-events-none ${reduceMotion ? "" : "animate-aurora-1"}`}
        style={{
          top: "10%", left: "52%",
          width: 620, height: 500,
          background: "radial-gradient(ellipse, rgba(59,110,240,0.38) 0%, transparent 65%)",
          filter: "blur(72px)",
          transform: "translateX(-50%) translateY(-50%)",
        }}
      />
      <div
        className={`absolute pointer-events-none ${reduceMotion ? "" : "animate-aurora-2"}`}
        style={{
          bottom: "5%", left: "10%",
          width: 460, height: 400,
          background: "radial-gradient(ellipse, rgba(200,150,12,0.28) 0%, transparent 62%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className={`absolute pointer-events-none ${reduceMotion ? "" : "animate-aurora-3"}`}
        style={{
          top: "45%", right: "8%",
          width: 380, height: 360,
          background: "radial-gradient(ellipse, rgba(80,200,240,0.20) 0%, transparent 66%)",
          filter: "blur(56px)",
        }}
      />

      {/* ── HERO CONTENT ── */}
      <motion.div
        className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-5 py-12 sm:gap-10 sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:px-12 lg:py-0"
        style={{ y: reduceMotion ? 0 : heroContentY, opacity: reduceMotion ? 1 : heroOpacity }}
      >
        <div className="min-w-0 text-left">
        {/* PLV badge */}
        <div
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/8 border mb-8 animate-fade-in animate-border-glow"
          style={{ borderColor: "rgba(200,150,12,0.45)" }}
        >
          <PLVLogo size={20} />
          <span className="text-white/70 text-xs font-bold tracking-wide">
            Pamantasan ng Lungsod ng Valenzuela
          </span>
        </div>

        {/* PLV Seal — neon gold ring glow */}
        <motion.div
          data-testid="hero-seal"
          className="relative mt-2 mb-8 flex h-36 w-36 items-center justify-center select-none"
          style={{ y: reduceMotion ? 0 : heroLogoY }}
        >
          <div
            data-testid="hero-seal-halo"
            className="absolute inset-0 rounded-full animate-neon-gold"
            style={{ background: "radial-gradient(circle, rgba(200,150,12,0.22) 0%, transparent 70%)", filter: "blur(18px)" }}
          />
          <div data-testid="hero-seal-ring" className="absolute inset-2 rounded-full border border-accent/30 animate-border-glow" />
          <PLVLogo size={78} className="relative z-10 shadow-2xl animate-hero-breathe" />
        </motion.div>

        {/* Headline */}
        <h1
          id="landing-hero-heading"
          className="max-w-xl font-extrabold leading-[1.04] tracking-tight text-white animate-slide-up delay-100"
          style={{ fontSize: "clamp(2.8rem, 6vw, 5.4rem)" }}
        >
          Navigate PLV <span className="text-accent">Smarter</span>
        </h1>

        {/* NaviSync badge */}
        <div className="mt-5 flex items-center justify-start gap-2 mb-6 animate-slide-up delay-150">
          <span className="text-white/30 text-sm font-medium">powered by</span>
          <span
            className="font-extrabold tracking-wider px-3 py-1 rounded-full border bg-accent/15 animate-neon-gold"
            style={{
              color: "#e0a820",
              fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
              borderColor: "rgba(200,150,12,0.45)",
            }}
          >
            NaviSync
          </span>
        </div>

        {/* Tagline */}
        <p className="max-w-lg text-base leading-relaxed text-white/60 mb-7 animate-slide-up delay-200 sm:text-lg">
          Find any building, plan a walking route, and move through campus with more confidence.
        </p>

        {/* CTAs — enhanced hover effects */}
        <div className="flex flex-wrap justify-start gap-3 animate-slide-up delay-300">
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
            <Link
              to="/map"
              className="group relative inline-flex items-center gap-2.5 h-12 px-8 rounded-2xl bg-white text-primary font-extrabold text-sm transition-all shadow-2xl hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.25)]"
            >
              <Map className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110" />
              <span className="relative">
                Open Campus Map
                <span className="absolute inset-x-0 -bottom-px h-px bg-primary/20 scale-x-0 group-hover:scale-x-100 transition-transform duration-200" />
              </span>
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
            <a
              href="#landing-feature-tour"
              className="group inline-flex items-center gap-2.5 h-12 px-8 rounded-2xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/16 transition-all"
            >
              <span>Explore Features</span>
              <ArrowDown className="h-4 w-4 transition-all duration-200 group-hover:translate-y-1" />
            </a>
          </motion.div>
        </div>

        <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 border-t border-white/10 pt-5 text-left">
          <div>
            <p className="text-sm font-extrabold text-white">Campus-wide</p>
            <p className="mt-1 text-[11px] text-white/45">places to find</p>
          </div>
          <div>
            <p className="text-sm font-extrabold text-white">Walking-first</p>
            <p className="mt-1 text-[11px] text-white/45">routes to follow</p>
          </div>
          <div>
            <p className="text-sm font-extrabold text-white">Access-aware</p>
            <p className="mt-1 text-[11px] text-white/45">paths when needed</p>
          </div>
        </div>
        </div>

        <div className="min-w-0 lg:pt-8">
          <LandingMapPreview />
          <div className="mt-4 flex items-center justify-between gap-4 px-2 text-[11px] text-white/45">
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              From your starting point to the right destination.
            </span>
            <span className="hidden font-mono uppercase tracking-[.15em] text-white/35 sm:inline">NVS / 01</span>
          </div>
        </div>
      </motion.div>

      {/* Wave divider */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <svg viewBox="0 0 1440 60" fill="none" className="w-full block">
          <path d="M0 60L1440 60L1440 20C1280 52 1040 4 720 20C400 36 160 0 0 20L0 60Z" className="fill-background" />
        </svg>
      </div>
    </section>
  );
}

function CampusCapabilities() {
  const capabilities = [
    {
      icon: Search,
      title: "Find buildings and offices",
      description: "Search rooms, labs, and offices without guessing where to start.",
    },
    {
      icon: Route,
      title: "Get walking directions",
      description: "Follow a clear route from one campus building to another.",
    },
    {
      icon: Accessibility,
      title: "Choose accessible routes",
      description: "See route options that avoid stairs when accessibility matters.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-background py-16 lg:py-24">
      <svg aria-hidden="true" className="pointer-events-none absolute right-0 top-8 hidden h-56 w-[42%] text-primary/10 lg:block" viewBox="0 0 640 220" fill="none">
        <path d="M0 176 C120 46 180 206 310 88 S500 42 640 120" stroke="currentColor" strokeWidth="2" strokeDasharray="7 10" />
        <circle cx="310" cy="88" r="5" fill="currentColor" />
        <circle cx="640" cy="120" r="5" fill="currentColor" />
      </svg>
      <div className="mx-auto max-w-6xl px-5 sm:px-7">
        <Reveal className="mb-8 max-w-2xl">
          <SectionLabel>What NaviSync does</SectionLabel>
          <h2 className="mb-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Everything useful, right when you need it.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            One focused campus tool for finding places, planning your walk, and moving with more confidence.
          </p>
        </Reveal>

        <div className="relative grid gap-4 md:grid-cols-12">
          {capabilities.map((capability, index) => {
            const Icon = capability.icon;
            const featured = index === 0;
            return (
              <Reveal key={capability.title} delay={index * 80} className={featured ? "md:col-span-5 md:row-span-2" : "md:col-span-7"}>
                <motion.article
                  whileHover={{ y: -3 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={`group h-full rounded-[1.5rem] border p-5 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-lg ${featured
                    ? "min-h-[250px] border-[#2f61d5]/40 bg-[#071440] p-6 text-white shadow-[0_20px_50px_rgba(7,20,64,0.2)]"
                    : "border-border/70 bg-card/75"}`}
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${featured ? "bg-white/10 text-accent" : "bg-primary/8 text-primary"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className={`mt-6 font-extrabold leading-tight ${featured ? "max-w-[13rem] text-xl text-white" : "text-base text-foreground"}`}>
                    {capability.title}
                  </h3>
                  <p className={`mt-3 text-xs leading-relaxed ${featured ? "max-w-[16rem] text-white/60" : "text-muted-foreground"}`}>{capability.description}</p>
                  {featured && (
                    <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-white/65">
                      <Search className="h-3 w-3 text-accent" />
                      Start with a destination
                    </span>
                  )}
                </motion.article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── FINAL CTA (enhanced) ────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function FinalCTA() {
  return (
    <>
      <WavyDivider fill="#071440" />

      <section className="py-20 lg:py-24 relative overflow-hidden" style={{ marginTop: "-1px" }}>
        {/* Dark gradient */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(to bottom, #071440 0%, #071440 8%, transparent 35%), radial-gradient(ellipse 90% 70% at 50% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)",
        }} />

        {/* Glowing map preview */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Blurred map-like shapes */}
          <div className="absolute top-1/2 left-1/3 w-64 h-48 rounded-full bg-primary/8 blur-[80px] animate-glow-soft" />
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-accent/6 blur-[60px] animate-glow-soft" style={{ animationDelay: "2s" }} />

          {/* Floating map elements */}
          <div className="absolute animate-ag-2" style={{ top: "15%", right: "12%", opacity: 0.08 }}>
            <Map className="w-16 h-16 text-white" />
          </div>
          <div className="absolute animate-ag-4" style={{ bottom: "20%", left: "8%", opacity: 0.06 }}>
            <MapPin className="w-12 h-12 text-white" />
          </div>
          <div className="absolute animate-ag-6" style={{ top: "40%", left: "20%", opacity: 0.07 }}>
            <Navigation className="w-10 h-10 text-white" />
          </div>

          {/* Route line animation */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 600" style={{ opacity: 0.08 }}>
            <path
              d="M-100 300 C 200 250, 400 400, 700 300 S 1000 200, 1300 350 S 1400 280, 1550 320"
              fill="none"
              stroke="rgba(200,150,12,0.5)"
              strokeWidth="2"
              strokeDasharray="8 8"
              className="animate-route-draw"
              style={{ animationDuration: "5s", animationDelay: "0.5s" }}
            />
          </svg>
        </div>

        {/* Aurora */}
        <div
          className="absolute pointer-events-none animate-aurora-2"
          style={{
            top: "20%", left: "55%",
            width: 460, height: 380,
            background: "radial-gradient(ellipse, rgba(59,110,220,0.22) 0%, transparent 65%)",
            filter: "blur(70px)",
            transform: "translateX(-50%)",
          }}
        />

        <Reveal className="relative max-w-2xl mx-auto px-5 sm:px-7 text-center">
          <PLVLogo size={60} className="mx-auto mb-7 shadow-2xl animate-hero-breathe" />
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 leading-tight">
            Ready to explore PLV?
          </h2>
          <p className="text-white/45 text-sm mb-8 max-w-sm mx-auto">
            Open the interactive campus map and navigate every building, route, and facility.
          </p>

          <div className="flex justify-center">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                to="/map"
                className="group inline-flex items-center gap-2.5 h-12 px-9 rounded-2xl bg-white text-primary font-extrabold hover:bg-white/92 transition-all shadow-xl hover:shadow-[0_0_28px_-4px_rgba(255,255,255,0.2)]"
              >
                <Map className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110" />
                Open Interactive Map
              </Link>
            </motion.div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── MAIN LANDING PAGE ───────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

export function LandingPage() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden">
      <HeroSection />
      <HowHelpsYou />
      <CampusCapabilities />
      <FinalCTA />
    </div>
  );
}

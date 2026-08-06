import { Link } from "react-router";
import {
  Map, Search, Accessibility, AlertTriangle,
  Star, Flag, CheckCircle2, ArrowRight,
  Compass, Crosshair, MapPin, Hexagon, MousePointer2,
  Navigation, Eye, Smartphone, Wifi, Shield,
  Sparkles, Layers, Bookmark, Clock, Route, Zap, Wrench, Megaphone, Bell, Calendar, Tag,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { PLVLogo } from "../components/ui/PLVLogo";
import { LavaLampBackground } from "../components/ui/HeroBackground";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { eventService, type CampusAnnouncement, type CampusEvent } from "../services/eventService";

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

function HeroRouteLines() {
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
              className="animate-route-draw-loop"
              style={{
                animationDelay: line.delay,
                animationDuration: line.total,
              }}
            />
          </g>
        ))}
        {/* Route nodes (dots at intersections) */}
        <circle cx="600" cy="300" r="2.5" fill="rgba(200,150,12,0.5)" className="animate-pulse-ring-soft" style={{ animationDelay: "1s" }} />
        <circle cx="900" cy="500" r="2" fill="rgba(59,110,240,0.5)" className="animate-pulse-ring-soft" style={{ animationDelay: "2.5s" }} />
        <circle cx="400" cy="700" r="2.5" fill="rgba(56,189,248,0.4)" className="animate-pulse-ring-soft" style={{ animationDelay: "4s" }} />
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

const HIGHLIGHTS = [
  { icon: Map,         label: "Interactive Campus Map" },
  { icon: Search,      label: "Smart Search & Wayfinding" },
  { icon: Navigation,  label: "Indoor & Outdoor Navigation" },
  { icon: Accessibility, label: "Accessibility Support" },
  { icon: AlertTriangle, label: "Emergency Ready" },
  { icon: Smartphone,  label: "Mobile Responsive PWA" },
  { icon: Wifi,       label: "Offline Capable" },
  { icon: Shield,     label: "Real-time Campus Alerts" },
];

function PlatformHighlights() {
  return (
    <section className="py-16 lg:py-20 bg-background relative z-10">
      <div className="max-w-6xl mx-auto px-5 sm:px-7">
        <Reveal className="text-center mb-10">
          <SectionLabel>Platform Capabilities</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            Navigate PLV in Seconds
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Everything you need to move through campus with confidence.
          </p>
        </Reveal>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {HIGHLIGHTS.map(({ icon: Icon, label }, i) => (
            <Reveal key={label} delay={i * 40}>
              <div className="group flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/15 transition-all duration-200 hover:shadow-sm">
                <div className="w-9 h-9 rounded-lg bg-primary/8 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/12 transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[13px] font-bold text-foreground leading-snug">{label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

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
  const rAFRef = useRef<number | null>(null);

  useEffect(() => {
    // Initial draw after mount
    const initialDraw = setTimeout(() => setDrawn(true), 600);

    // Cycle: hide → redraw every 5s
    cycleRef.current = setInterval(() => {
      setDrawn(false);
      rAFRef.current = requestAnimationFrame(() => {
        rAFRef.current = requestAnimationFrame(() => {
          setDrawn(true);
          rAFRef.current = null;
        });
      });
    }, 5000);

    return () => {
      clearTimeout(initialDraw);
      if (cycleRef.current) clearInterval(cycleRef.current);
      if (rAFRef.current != null) cancelAnimationFrame(rAFRef.current);
    };
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden bg-[#0a1628] border border-white/10" style={{ minHeight: 160 }}>
      {/* Mini map grid */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }} />
      {/* Buildings (simple rects) */}
      <div className="absolute" style={{ left: "18%", top: "25%", width: 40, height: 32, background: "rgba(59,110,240,0.25)", borderRadius: 4, border: "1px solid rgba(59,110,240,0.3)" }} />
      <div className="absolute" style={{ left: "55%", top: "15%", width: 48, height: 36, background: "rgba(59,110,240,0.25)", borderRadius: 4, border: "1px solid rgba(59,110,240,0.3)" }} />
      <div className="absolute animate-search-highlight" style={{ left: "65%", top: "55%", width: 36, height: 28, background: "rgba(200,150,12,0.2)", borderRadius: 4, border: "1px solid rgba(200,150,12,0.25)" }} />
      {/* Start dot */}
      <div className="absolute" style={{ left: "18%", top: "62%" }}>
        <div className="w-3 h-3 rounded-full bg-green-400 shadow-lg shadow-green-400/30" />
      </div>
      {/* End dot (destination) */}
      <div className="absolute" style={{ left: "65%", top: "55%" }}>
        <div className="w-3 h-3 rounded-full bg-red-400 shadow-lg shadow-red-400/30 animate-pulse-ring-soft" />
      </div>
      {/* Route line */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 160" style={{ pointerEvents: "none" }}>
        <path
          d="M54 99 C 80 80, 120 70, 150 50 S 190 40, 195 88"
          fill="none"
          stroke="rgba(74,127,212,0.7)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="8 4"
          style={{
            strokeDashoffset: drawn ? 0 : 400,
            transition: "stroke-dashoffset 2.5s ease-out",
          }}
        />
        {drawn && (
          <circle cx="195" cy="88" r="4" fill="rgba(74,127,212,0.8)">
            <animate attributeName="r" values="2;5;2" dur="2s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
      {/* Labels */}
      <div className="absolute bottom-2 left-2 text-[9px] text-white/50 font-mono flex items-center gap-1">
        <MapPin className="h-2.5 w-2.5" /> Start
      </div>
      <div className="absolute bottom-2 right-2 text-[9px] text-white/50 font-mono flex items-center gap-1">
        <Flag className="h-2.5 w-2.5" /> CCS Lab 2
      </div>
    </div>
  );
}

/** Accessibility toggle demo */
function A11yDemo() {
  const [enabled, setEnabled] = useState(false);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    // Auto-cycle only until user interacts
    if (interacted) return;
    const t = setInterval(() => {
      setEnabled((p) => !p);
    }, 3000);
    return () => clearInterval(t);
  }, [interacted]);

  const handleToggle = () => {
    setInteracted(true);
    setEnabled((p) => !p);
  };

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border bg-muted/50 border-border">
        <div className="flex items-center gap-2.5">
          <Accessibility className={`h-4 w-4 transition-colors ${enabled ? "text-green-500" : "text-muted-foreground"}`} />
          <span className={`text-sm font-bold transition-colors ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
            Accessible Route
          </span>
        </div>
        <button
          onClick={handleToggle}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle accessible route"
          className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-muted-foreground/30"}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      {/* Visual feedback */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-3 overflow-hidden relative" style={{ minHeight: 70 }}>          {/* Mini path */}
        <svg viewBox="0 0 260 50" className="w-full h-full">
          {/* Regular path */}
          <path
            d="M10 25 L 60 25 L 100 15 L 140 25 L 180 15 L 220 25 L 250 25"
            fill="none"
            stroke="currentColor"
            className="text-muted-foreground/25"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          {/* Accessible path */}
          {enabled && (
            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              d="M10 35 L 40 35 L 60 40 L 90 35 L 120 40 L 150 35 L 180 40 L 210 35 L 250 35"
              fill="none"
              stroke="currentColor"
              className="text-green-500/60"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
        {enabled && (
          <div className="absolute bottom-1.5 right-2 flex items-center gap-1.5 text-[9px] text-green-600 dark:text-green-400 font-medium animate-fade-in-up">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Avoiding stairs — using ramps & elevators
          </div>
        )}
        <div className="absolute bottom-1.5 left-2 text-[9px] text-muted-foreground font-mono flex items-center gap-1">
          {enabled ? <><Accessibility className="h-2.5 w-2.5" /> Accessible route active</> : "Click toggle to see accessible route"}
        </div>
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
              <span className="text-[9px] font-medium">Pin Issue</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
            {/* Step 2: Admin */}
            <div className={`flex flex-col items-center gap-1.5 ${phase === "submitted" ? "text-foreground/85" : "text-muted-foreground/50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${phase === "submitted" ? "bg-blue-500/15" : "bg-muted-foreground/10"}`}>
                <Eye className="h-4 w-4" />
              </div>
              <span className="text-[9px] font-medium">Admin</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
            {/* Step 3: Resolved */}
            <div className={`flex flex-col items-center gap-1.5 ${phase === "resolved" ? "text-foreground/85" : "text-muted-foreground/50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${phase === "resolved" ? "bg-green-500/15" : "bg-muted-foreground/10"}`}>
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-[9px] font-medium">Resolved</span>
            </div>
          </div>
          {phase === "submitted" && (
            <div className="mt-2 text-[9px] text-blue-600 dark:text-blue-400 text-center font-medium animate-fade-in-up">
              Admin has received your report
            </div>
          )}
          {phase === "resolved" && (
            <div className="mt-2 text-[9px] text-green-600 dark:text-green-400 text-center font-medium animate-fade-in-up">
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
    <section className="py-20 lg:py-28 bg-muted/30 relative overflow-hidden">
      {/* Subtle background ornament */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/3 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/3 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-7 relative">
        <Reveal className="text-center mb-14">
          <SectionLabel>Interactive Demos</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            How NaviSync Helps You
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            See the platform in action. Each scenario shows how NaviSync solves a real campus need.
          </p>
        </Reveal>

        {/* Scenario selector tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveScenario(s.id)}
              aria-current={activeScenario === s.id ? "true" : undefined}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                activeScenario === s.id
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.title}
            </button>
          ))}
        </div>

        {/* Active scenario card */}
        {SCENARIOS.filter((s) => s.id === activeScenario).map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="grid md:grid-cols-2 gap-6 md:gap-10 items-center max-w-4xl mx-auto"
          >
            {/* Description */}
            <div className="order-2 md:order-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold mb-4" style={{ borderColor: s.borderColor, background: s.color, color: "var(--foreground)" }}>
                <s.icon className="h-3.5 w-3.5" />
                {s.title}
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                {s.desc}
              </p>
              <Link
                to="/map"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors group"
              >
                Try it on the map
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            {/* Interactive demo */}
            <div className="order-1 md:order-2 rounded-2xl border p-4 md:p-5 bg-card/80 backdrop-blur-sm shadow-lg" style={{ borderColor: s.borderColor, minHeight: 220 }}>
              {renderDemo(s.demo)}
            </div>
          </motion.div>
        ))}
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
              <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-background text-muted-foreground border border-border">⌘K</kbd>
            </div>
          </div>
          <div className="space-y-1">
            {["Registrar Office", "CCS Laboratory 2", "Library"].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[9px] text-primary font-bold shrink-0">
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
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-bold">NEW</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-card border border-border">
              <div className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <MapPin className="h-3 w-3 text-orange-500" />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground">Pin</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-card border border-border">
              <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Eye className="h-3 w-3 text-blue-500" />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground">Admin</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-card border border-green-200 dark:border-green-800">
              <div className="w-6 h-6 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              </div>
              <span className="text-[9px] font-medium text-green-600 dark:text-green-400">Resolved</span>
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

function HeroSection() {
  const { scrollY } = useScroll();
  const smoothY = useSpring(scrollY, { stiffness: 60, damping: 35, mass: 0.6 });

  const heroBgY      = useTransform(smoothY, [0, 600], [0, 80]);
  const heroContentY = useTransform(smoothY, [0, 600], [0, -70]);
  const heroLogoY    = useTransform(smoothY, [0, 600], [0, -40]);
  const heroOpacity  = useTransform(smoothY, [0, 420], [1, 0]);

  return (
    <section className="relative overflow-hidden flex items-center justify-center" style={{ minHeight: "96vh" }}>
      {/* ── Animated gradient background — slow shift ── */}
      <motion.div
        className="absolute inset-0"
        style={{ y: heroBgY }}
      >
        <div className="absolute inset-0 animate-gradient-shift" style={{
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
        className="absolute inset-0 pointer-events-none animate-grid-pulse"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Cursor-interactive lava lamp blobs ── */}
      <LavaLampBackground />

      {/* ── Animated route lines ── */}
      <HeroRouteLines />

      {/* ── Floating particles ── */}
      <FloatingParticles count={16} />

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
          <div style={{ animation: `ag-float-${(i % 6) + 1} ${dur}s ease-in-out ${delay}s infinite` }}>
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
        className="absolute pointer-events-none animate-aurora-1"
        style={{
          top: "10%", left: "52%",
          width: 620, height: 500,
          background: "radial-gradient(ellipse, rgba(59,110,240,0.38) 0%, transparent 65%)",
          filter: "blur(72px)",
          transform: "translateX(-50%) translateY(-50%)",
        }}
      />
      <div
        className="absolute pointer-events-none animate-aurora-2"
        style={{
          bottom: "5%", left: "10%",
          width: 460, height: 400,
          background: "radial-gradient(ellipse, rgba(200,150,12,0.28) 0%, transparent 62%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute pointer-events-none animate-aurora-3"
        style={{
          top: "45%", right: "8%",
          width: 380, height: 360,
          background: "radial-gradient(ellipse, rgba(80,200,240,0.20) 0%, transparent 66%)",
          filter: "blur(56px)",
        }}
      />

      {/* ── HERO CONTENT ── */}
      <motion.div
        className="relative w-full max-w-3xl mx-auto px-5 sm:px-10 flex flex-col items-center text-center"
        style={{ y: heroContentY, opacity: heroOpacity, paddingTop: "6vh", paddingBottom: "10vh" }}
      >
        {/* PLV badge */}
        <div
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/8 border mb-10 animate-fade-in animate-border-glow"
          style={{ borderColor: "rgba(200,150,12,0.45)" }}
        >
          <PLVLogo size={20} />
          <span className="text-white/70 text-xs font-bold tracking-wide">
            Pamantasan ng Lungsod ng Valenzuela
          </span>
        </div>

        {/* PLV Seal — neon gold ring glow */}
        <motion.div
          className="relative flex items-center justify-center mb-10 select-none"
          style={{ y: heroLogoY }}
        >
          <div
            className="absolute w-44 h-44 rounded-full animate-neon-gold"
            style={{ background: "radial-gradient(circle, rgba(200,150,12,0.22) 0%, transparent 70%)", filter: "blur(18px)" }}
          />
          <div className="absolute w-36 h-36 rounded-full border border-accent/30 animate-border-glow" />
          <PLVLogo size={106} className="relative z-10 shadow-2xl animate-hero-breathe" />
        </motion.div>

        {/* Headline */}
        <h1
          className="font-extrabold text-white leading-[1.08] tracking-tight mb-3 animate-slide-up delay-100"
          style={{ fontSize: "clamp(2.4rem, 6vw, 3.8rem)" }}
        >
          Navigate PLV Smarter
        </h1>

        {/* NaviSync badge */}
        <div className="flex items-center justify-center gap-2 mb-8 animate-slide-up delay-150">
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
        <p className="text-base text-white/50 mb-10 animate-slide-up delay-200 max-w-xs">
          Find any building, get directions, and stay updated.
        </p>

        {/* CTAs — enhanced hover effects */}
        <div className="flex flex-wrap justify-center gap-3 animate-slide-up delay-300">
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
            <Link
              to="/help"
              className="group inline-flex items-center gap-2.5 h-12 px-8 rounded-2xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/16 transition-all"
            >
              <span>Explore Features</span>
              <ArrowRight className="h-4 w-4 transition-all duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
            </Link>
          </motion.div>
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

function AnnouncementPreview() {
  const [announcements, setAnnouncements] = useState<CampusAnnouncement[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      eventService.getPublishedAnnouncements(),
      eventService.getUpcomingEvents(),
    ]).then(([ancData, evtData]) => {
      if (mounted) {
        setAnnouncements(ancData);
        setEvents(evtData);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="py-20 bg-card/60 relative border-t border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest mb-4">
            <Megaphone className="h-3.5 w-3.5" />
            Campus Updates & Events
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-3">
            Latest Announcements & Campus Events
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Stay updated with facility notices, event schedules, and navigation advisories across PLV.
          </p>
        </Reveal>

        {/* Live Announcements Row */}
        {announcements.length > 0 && (
          <div className="mb-10 space-y-3">
            {announcements.slice(0, 2).map((anc) => (
              <div
                key={anc.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-foreground">{anc.title}</h4>
                    <p className="text-xs text-muted-foreground">{anc.content}</p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/15 text-primary shrink-0">
                  {anc.category}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Events Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {events.map((evt, i) => (
            <Reveal key={evt.id} delay={i * 80}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 flex flex-col h-full overflow-hidden"
              >
                {evt.coverImage && (
                  <div className="h-32 -mx-6 -mt-6 mb-4 overflow-hidden bg-muted relative">
                    <img src={evt.coverImage} alt={evt.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border border-primary/20 text-primary bg-primary/10">
                    <Tag className="h-3 w-3" />
                    {evt.category}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                    <Calendar className="h-3 w-3" />
                    {new Date(evt.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>

                <h3 className="text-base font-extrabold text-foreground mb-2 group-hover:text-primary transition-colors leading-snug">
                  {evt.title}
                </h3>

                <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">
                  {evt.description}
                </p>

                <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground/80 truncate max-w-[170px]">
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                    {evt.locationLabel || evt.buildingName}
                  </span>
                  <Link
                    to={`/map?buildingId=${evt.buildingId || "b1"}`}
                    className="inline-flex items-center gap-1 text-primary font-extrabold text-xs hover:underline shrink-0 ml-2"
                  >
                    View Map
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/help"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card hover:bg-muted font-bold text-xs text-foreground transition-all duration-200 shadow-sm"
          >
            <Bell className="h-4 w-4 text-primary" />
            View All Advisories & Help
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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

          <div className="flex flex-wrap justify-center gap-3">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                to="/map"
                className="group inline-flex items-center gap-2.5 h-12 px-9 rounded-2xl bg-white text-primary font-extrabold hover:bg-white/92 transition-all shadow-xl hover:shadow-[0_0_28px_-4px_rgba(255,255,255,0.2)]"
              >
                <Map className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110" />
                Open Interactive Map
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                to="/help"
                className="group inline-flex items-center gap-2.5 h-12 px-8 rounded-2xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/16 transition-all"
              >
                Learn More
                <ArrowRight className="h-4 w-4 transition-all duration-200 group-hover:translate-x-1" />
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
      <PlatformHighlights />
      <HowHelpsYou />
      <HowItWorks />
      <ProductShowcase />
      <WhyNaviSync />
      <DayWithNaviSync />
      <AnnouncementPreview />
      <FinalCTA />
    </div>
  );
}

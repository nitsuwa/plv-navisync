import { Link } from "react-router";
import {
  Map, Search, Accessibility, AlertTriangle,
  Star, Zap, QrCode, Flag, CheckCircle2, ArrowRight,
  Compass, Crosshair, MapPin, Hexagon,
} from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { PLVLogo } from "../components/ui/PLVLogo";
import { LavaLampBackground } from "../components/ui/HeroBackground";
import { useScrollReveal } from "../hooks/useScrollReveal";

// ── Floating decorative shapes ──────────────────────────────────────────────
const FLOATING_SHAPES = [
  { Icon: Compass,   size: 20, startX: "12%", startY: "18%",  dur: 7,  delay: 0,   rotate: true,  opacity: 0.15 },
  { Icon: MapPin,    size: 16, startX: "85%", startY: "25%",  dur: 9,  delay: 1.5, rotate: false, opacity: 0.12 },
  { Icon: Hexagon,   size: 22, startX: "8%",  startY: "70%",  dur: 8,  delay: 0.8, rotate: true,  opacity: 0.10 },
  { Icon: Crosshair, size: 18, startX: "75%", startY: "10%",  dur: 11, delay: 2.5, rotate: true,  opacity: 0.12 },
  { Icon: Map,       size: 24, startX: "90%", startY: "65%",  dur: 10, delay: 1,   rotate: false, opacity: 0.10 },
  { Icon: MapPin,    size: 14, startX: "22%", startY: "50%",  dur: 12, delay: 3,   rotate: false, opacity: 0.08 },
];

const SHAPE_COLORS = ["rgba(200,150,12,0.5)", "rgba(59,110,240,0.4)", "rgba(56,189,248,0.3)", "rgba(147,51,234,0.3)"];

// ── scroll-reveal ─────────────────────────────────────────────────────────────
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
      /* willChange removed — avoids compositor layer thrash causing scroll jank */
    }}>
      {children}
    </div>
  );
}

// ── Mouse-following radial glow ──────────────────────────────────────────────
function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleMouse = useCallback((e: MouseEvent) => {
    if (reducedMotion) return;
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    setPos({ x, y });
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

// ── wavy section divider ──────────────────────────────────────────────────────
function WavyDivider() {
  return (
    <div className="relative w-full pointer-events-none select-none" style={{ height: 90, marginBottom: 0 }}>
      <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <path d="M0,55 C80,25 160,72 260,44 C360,16 440,68 540,40 C640,12 730,62 840,36 C950,10 1040,60 1140,34 C1240,8 1340,52 1390,36 L1440,30 L1440,90 L0,90 Z" fill="#071440" />
      </svg>
    </div>
  );
}

// ── 8 platform features — each links to the map ───────────────────────────────
const FEATURES: { icon: React.ElementType; title: string; to: string }[] = [
  { icon: Map,           title: "Interactive Campus Map",  to: "/map" },
  { icon: Search,        title: "Smart Search",            to: "/map" },
  { icon: Accessibility, title: "Accessibility Support",   to: "/map" },
  { icon: AlertTriangle, title: "Emergency Navigation",    to: "/map" },
  { icon: Star,          title: "Campus Event Mapping",    to: "/map" },
  { icon: Flag,          title: "Issue Reporting",         to: "/help" },
  { icon: Zap,           title: "AI Campus Assistant",     to: "/help" },
  { icon: QrCode,        title: "QR Building Access",      to: "/map" },
];

// ── innovations list ──────────────────────────────────────────────────────────
const INNOVATIONS = [
  "Navigate faster with real-time campus guidance",
  "Find any classroom, lab, or office instantly",
  "Accessible routes for wheelchair users",
  "Emergency evacuation in one tap",
  "Campus events on the map, not a separate page",
  "Canva-style drag-and-drop Map Builder",
  "AI assistant for any campus question",
  "Live building status and queue info",
];

// ═════════════════════════════════════════════════════════════════════════════
export function LandingPage() {
  const heroRef    = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();
  // Higher damping → less overshoot (prevents the "bounce-back" scroll illusion)
  const smoothY     = useSpring(scrollY, { stiffness: 60, damping: 35, mass: 0.6 });

  const heroBgY      = useTransform(smoothY, [0, 600], [0, 80]);
  const heroContentY = useTransform(smoothY, [0, 600], [0, -70]);
  const heroLogoY    = useTransform(smoothY, [0, 600], [0, -40]);
  const heroOpacity  = useTransform(smoothY, [0, 420], [1, 0]);

  return (
    <div className="min-h-screen">

      {/* ══════════════════════════════════════════ HERO ══ */}
      <section
        ref={heroRef}
        className="relative overflow-hidden flex items-center justify-center"
        style={{ minHeight: "96vh" }}
      >
        {/* ── Dark gradient base */}
        <motion.div
          className="absolute inset-0"
          style={{
            y: heroBgY,
            background: "radial-gradient(ellipse 90% 70% at 50% 35%, #0d2470 0%, #071440 50%, #020a1c 100%)",
          }}
        />

        {/* ── Grid overlay — pulsing subtly */}
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
            <div
              style={{
                animation: `ag-float-${(i % 6) + 1} ${dur}s ease-in-out ${delay}s infinite`,
              }}
            >
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

        {/* ── Aurora blobs — vivid, slowly drifting across the grid */}
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

        {/* ── HERO CONTENT (parallax) */}
        <motion.div
          className="relative w-full max-w-3xl mx-auto px-5 sm:px-10 flex flex-col items-center text-center"
          style={{ y: heroContentY, opacity: heroOpacity, paddingTop: "6vh", paddingBottom: "10vh" }}
        >
          {/* PLV badge — subtle neon border glow */}
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
            {/* Neon gold glow */}
            <div
              className="absolute w-44 h-44 rounded-full animate-neon-gold"
              style={{ background: "radial-gradient(circle, rgba(200,150,12,0.22) 0%, transparent 70%)", filter: "blur(18px)" }}
            />
            {/* Outer neon ring */}
            <div
              className="absolute w-36 h-36 rounded-full border border-accent/30 animate-border-glow"
            />
            <PLVLogo size={106} className="relative z-10 shadow-2xl animate-hero-breathe" />
          </motion.div>

          {/* Headline */}
          <h1
            className="font-extrabold text-white leading-[1.08] tracking-tight mb-3 animate-slide-up delay-100"
            style={{ fontSize: "clamp(2.4rem, 6vw, 3.8rem)" }}
          >
            Navigate PLV Smarter
          </h1>
          {/* NaviSync badge — neon gold highlight */}
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

          {/* Single short line */}
          <p className="text-base text-white/50 mb-10 animate-slide-up delay-200 max-w-xs">
            Find any building, get directions, and stay updated.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap justify-center gap-3 animate-slide-up delay-300">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link to="/map"
                className="inline-flex items-center gap-2 h-12 px-8 rounded-2xl bg-white text-primary font-extrabold text-sm hover:bg-white/92 transition-all shadow-2xl">
                <Map className="h-4 w-4" /> Open Campus Map
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link to="/help"
                className="inline-flex items-center gap-2 h-12 px-8 rounded-2xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/16 transition-all">
                Report an Issue <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Wave into next section */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full block">
            <path d="M0 60L1440 60L1440 20C1280 52 1040 4 720 20C400 36 160 0 0 20L0 60Z" className="fill-background" />
          </svg>
        </div>
      </section>

      {/* ══════════════ FEATURES — icon grid, each card is a link ══ */}
      {/* marginTop: -2px closes the sub-pixel gap that appears between hero wave and this section */}
      <section className="py-20 lg:py-24 bg-background relative z-10" style={{ marginTop: "-10px" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-7">

          <Reveal className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-3">
              Everything in One Map
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Every campus tool lives directly on the interactive map.
            </p>
          </Reveal>

          {/* 4×2 grid — icon + title, fully clickable links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {FEATURES.map(({ icon: Icon, title, to }, i) => (
              <Reveal key={title} delay={i * 55}>
                <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
                  <Link to={to}
                    className="group rounded-2xl border border-border bg-card p-5 text-center shadow-sm block transition-all duration-200 hover:border-primary/25 hover:shadow-md"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-250">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="font-extrabold text-foreground text-sm leading-snug group-hover:text-primary transition-colors">{title}</p>
                  </Link>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ INNOVATIONS — clean two-column ══ */}
      <section className="py-20 lg:py-24 bg-background">
        <div className="max-w-5xl mx-auto px-5 sm:px-7">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            <Reveal>
              <p className="text-primary text-xs font-extrabold uppercase tracking-widest mb-4">Why NaviSync</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight mb-5">
                Built for the way campus life actually works.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-7">
                PLV NaviSync connects navigation, events, accessibility, emergencies, and administration in one seamless experience.
              </p>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link to="/map"
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 transition-all shadow-md">
                  <Map className="h-4 w-4" /> Explore the Map
                </Link>
              </motion.div>
            </Reveal>

            <Reveal delay={80}>
              <div className="space-y-0">
                {INNOVATIONS.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground leading-snug">{item}</span>
                  </div>
                ))}
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ══════════════════════ WAVY DARK DIVIDER ══ */}
      {/* marginBottom: 0 so CTA section butt-joins with no gap behind the waves */}
      <WavyDivider />

      {/* ══════════════════════════════ CTA ══ */}
      {/* NO grid overlay here — grid lines clash with the wavy divider above */}
      <section className="py-20 lg:py-24 relative overflow-hidden" style={{ marginTop: "-1px" }}>
        {/* Dark gradient — linear top layer matches wave color (#071440) so they connect seamlessly */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(to bottom, #071440 0%, #071440 8%, transparent 35%), radial-gradient(ellipse 90% 70% at 50% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)",
        }} />
        {/* Single subtle aurora — no grid */}
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
          <p className="text-white/45 text-sm mb-8">
            Open the interactive campus map and navigate every building, route, and facility.
          </p>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link to="/map"
              className="inline-flex items-center gap-2 h-12 px-9 rounded-2xl bg-white text-primary font-extrabold hover:bg-white/92 transition-all shadow-xl">
              <Map className="h-4 w-4" /> Open Interactive Map
            </Link>
          </motion.div>
        </Reveal>
      </section>

    </div>
  );
}

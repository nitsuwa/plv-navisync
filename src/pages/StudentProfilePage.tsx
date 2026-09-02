import { useState, useRef, useEffect } from "react";
import {
  Bookmark, Flag, Navigation, MapPin, Camera, Shield, ChevronRight,
  LogOut, Settings, GraduationCap, CalendarDays, Award, Activity,
  ArrowUpRight, Map, Heart, Pencil, Mail,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { PageTransition } from "../components/ui/PageTransition";
import { Skeleton } from "../components/ui/Skeleton";


// ═════════════════════════════════════════════════════════════════════════════
// ── Scroll-reveal wrapper (shared pattern across student pages) ──────────────
// ═════════════════════════════════════════════════════════════════════════════

function Reveal({ children, className, delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? "translateY(0)" : "translateY(24px)",
      transition: visible
        ? `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
        : "opacity 0.3s ease, transform 0.3s ease",
    }}>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Section heading ─────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest">
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Data ────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const RECENT_ACTIVITY: { icon: typeof MapPin; text: string; time: string; color: string }[] = [];

// ═════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

import { studentAccountService } from "../services/studentAccountService";
import { reportService } from "../services/reportService";

export function StudentProfilePage() {
  const navigate = useNavigate();
  const { loading: authLoading, isStudent, profile, username, role, signOut } = useStudentAuth();
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState(username || "");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [reportsCount, setReportsCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      studentAccountService.getSavedBuildings(),
      reportService.getStudentReports(),
    ]).then(([saved, rpts]) => {
      if (mounted) {
        setSavedCount(saved.length);
        setReportsCount(rpts.length);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Once the real profile loads, use its display name as the default.
  useEffect(() => {
    if (username) setDisplayName(username);
  }, [username]);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  // ── Loading state while the Supabase session/profile resolves ──
  if (authLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Checking your session…
          </div>
        </div>
      </PageTransition>
    );
  }

  // ── Unauthenticated state ──
  if (!isStudent) {
    return (
      <PageTransition>
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-5 text-center" role="main" aria-label="Sign in required">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center border border-border"
          >
            <Shield className="h-9 w-9 text-primary/70" />
          </motion.div>
          <div>
            <h1 className="text-xl font-extrabold text-foreground mb-2">Sign in to view your profile</h1>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Log in with your PLV student account to access saved locations, reports, and more.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/admin"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign In
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ── Loading skeleton (only after auth is confirmed) ──
  if (loading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="max-w-2xl mx-auto px-5 pt-8 pb-10 space-y-6">
            <Skeleton className="h-5 w-28 rounded-full" />
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <Skeleton variant="avatar" className="h-24 w-24 sm:h-28 sm:w-28 rounded-[28px]" />
              <div className="flex-1 space-y-3 text-center sm:text-left">
                <Skeleton className="h-7 w-48 mx-auto sm:mx-0" />
                <Skeleton className="h-4 w-36 mx-auto sm:mx-0" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  const initials = displayName.slice(0, 2).toUpperCase();

  const saveDisplayName = () => {
    if (nameInput.trim()) {
      setDisplayName(nameInput.trim());
      setEditingName(false);
    } else {
      setNameInput(displayName);
      setEditingName(false);
    }
  };

  const QUICK_LINKS = [
    {
      to: "/student/favorites",
      icon: Bookmark,
      label: "Favorite Locations",
      desc: "Buildings and offices you saved",
      color: "color-mix(in srgb, var(--primary) 12%, transparent)",
      iconColor: "var(--primary)",
    },
    {
      to: "/student/reports",
      icon: Flag,
      label: "My Reports",
      desc: "Campus issues you reported",
      color: "color-mix(in srgb, #f59e0b 12%, transparent)",
      iconColor: "#d97706",
    },
    {
      to: "/map",
      icon: Navigation,
      label: "Get Directions",
      desc: "Navigate around campus",
      color: "color-mix(in srgb, #22c55e 12%, transparent)",
      iconColor: "#16a34a",
    },
    {
      to: "/student/settings",
      icon: Settings,
      label: "Settings",
      desc: "Account and preferences",
      color: "color-mix(in srgb, #8b5cf6 12%, transparent)",
      iconColor: "#7c3aed",
    },
  ];

  const STATS = [
    { label: "Saved", value: String(savedCount), icon: Bookmark, color: "text-primary" },
    { label: "Reports", value: String(reportsCount), icon: Flag, color: "text-amber-500" },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen" role="main" aria-label="Student profile dashboard">

        {/* ════════════════════════════════════ PROFILE HEADER ══ */}
        <section className="student-hero-header relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full opacity-30 animate-orb-1"
              style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 35%, transparent) 0%, transparent 70%)" }} />
            <div className="absolute -bottom-24 -left-12 w-56 h-56 rounded-full opacity-25 animate-orb-2"
              style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 70%)" }} />
            <div className="absolute top-1/3 right-1/4 w-40 h-40 bg-primary/[0.06] rounded-full blur-[60px] animate-glow-soft" />
          </div>

          <div className="relative max-w-2xl mx-auto px-5 pt-6 pb-8 sm:pt-8 sm:pb-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-5"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 150, damping: 12 }}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] flex items-center justify-center text-3xl font-extrabold text-primary-foreground shadow-xl ring-4 ring-background/80"
                  style={{ background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, var(--accent)) 100%)" }}
                >
                  {initials}
                </motion.div>
                <button
                  className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-xl flex items-center justify-center border bg-card text-muted-foreground shadow-sm hover:bg-muted active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Change profile photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              {/* Identity info */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* Name with edit */}
                {editingName ? (
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <input
                      ref={nameInputRef}
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveDisplayName();
                        if (e.key === "Escape") { setEditingName(false); setNameInput(displayName); }
                      }}
                      className="w-full sm:flex-1 h-10 px-3 rounded-xl border text-xl font-extrabold focus:outline-none focus:ring-2 focus:ring-primary/30 bg-input-background text-foreground"
                      aria-label="Edit display name"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button onClick={saveDisplayName} className="h-10 px-4 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Save
                      </button>
                      <button onClick={() => { setEditingName(false); setNameInput(displayName); }}
                        className="h-10 px-4 rounded-xl text-sm font-bold border text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 justify-center sm:justify-start">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                      {displayName}
                    </h1>
                    <button
                      onClick={() => { setEditingName(true); setNameInput(displayName); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Edit display name"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Email & role row */}
                <div className="flex flex-wrap items-center gap-2.5 justify-center sm:justify-start">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {profile?.email ?? `${username.toLowerCase()}@plv.edu.ph`}
                  </span>
                  <span className="hidden sm:inline text-muted-foreground/30">·</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                    <GraduationCap className="h-3 w-3" />
                    <span className="capitalize">{role}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20" aria-label="Currently logged in">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Logged In
                  </span>
                </div>

                {/* Academic info chips */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-center sm:justify-start text-xs">
                  {[
                    profile?.student_id ? { label: "Student ID", value: profile.student_id, icon: Award } : null,
                    profile?.school_year ? { label: "School Year", value: profile.school_year, icon: CalendarDays } : null,
                    profile?.program ? { label: "Program", value: profile.program, icon: Activity } : null,
                  ].filter(Boolean).map(f => f && (
                    <div key={f.label} className="flex items-center gap-1.5">
                      <f.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground font-semibold">{f.label}:</span>
                      <span className="font-bold text-foreground">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desktop sign out */}
              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97] transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Sign out of your account"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </motion.div>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="grid grid-cols-2 gap-3 mt-6"
            >
              {STATS.map(({ label, value, icon: StatIcon, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.05 }}
                  className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm px-3 py-3.5 text-center hover:shadow-md hover:border-primary/15 transition-all duration-200"
                >
                  <div className={`w-9 h-9 rounded-xl bg-primary/[0.07] flex items-center justify-center mx-auto mb-1.5 ${color}`}>
                    <StatIcon className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-extrabold text-foreground leading-none">{value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ════════════════════════════════════ CONTENT SECTIONS ══ */}
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-8">

          {/* ── Recent Activity ── */}
          <section aria-labelledby="activity-heading">
            <Reveal>
              <div className="flex items-center gap-2 mb-3">
                <SectionHeading>Activity</SectionHeading>
              </div>
              <h2 id="activity-heading" className="sr-only">Recent Activity</h2>

              <div className="relative">
                {RECENT_ACTIVITY.length > 0 && (
                  <div className="absolute left-[18px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/30 via-primary/15 to-transparent" aria-hidden="true" />
                )}

                <div className="space-y-0.5">
                  {RECENT_ACTIVITY.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No recent activity yet.</p>
                  )}
                  {RECENT_ACTIVITY.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="group relative flex items-start gap-4 px-1 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                    >
                      <div className="relative z-10 mt-0.5">
                        <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                          <item.icon className={`h-4 w-4 ${item.color}`} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 pt-1.5">
                        <p className="text-sm font-semibold text-foreground">{item.text}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 pt-1.5">{item.time}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Reveal>
          </section>

          {/* ── Quick Access ── */}
          <section aria-labelledby="quick-access-heading">
            <Reveal delay={80}>
              <SectionHeading>Navigation</SectionHeading>
              <h2 id="quick-access-heading" className="sr-only">Quick Access</h2>

              <div className="space-y-2 mt-4">
                {QUICK_LINKS.map((ql, i) => {
                  const QlIcon = ql.icon;
                  return (
                    <motion.div
                      key={ql.to}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + i * 0.06 }}
                    >
                      <Link
                        to={ql.to}
                        className="group flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/15 hover:shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                          style={{ background: ql.color }}
                        >
                          <QlIcon className="h-5 w-5" style={{ color: ql.iconColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">{ql.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{ql.desc}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary shrink-0" />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </Reveal>
          </section>

          {/* ── My Day + Open Map CTA ── */}
          <section aria-label="Quick actions">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Reveal delay={120}>
                <Link
                  to="/my-day"
                  className="group relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.04] to-primary/[0.01] p-4 sm:p-5 block hover:shadow-md hover:border-primary/20 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/8 rounded-full blur-[30px] group-hover:bg-primary/12 transition-all" aria-hidden="true" />
                  <div className="relative flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Heart className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-foreground">My Day</p>
                      <p className="text-xs text-muted-foreground mt-0.5">View your schedule and daily activities</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-primary/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                  </div>
                </Link>
              </Reveal>

              <Reveal delay={160}>
                <Link
                  to="/map"
                  className="group relative overflow-hidden rounded-2xl bg-primary text-primary-foreground p-4 sm:p-5 block shadow-md hover:shadow-lg active:shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" aria-hidden="true" />
                  <div className="relative flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Map className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold">Open Campus Map</p>
                      <p className="text-xs text-primary-foreground/70 mt-0.5">Navigate buildings and find directions</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-primary-foreground/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                  </div>
                </Link>
              </Reveal>
            </div>
          </section>

          {/* ── Mobile Sign Out ── */}
          <Reveal delay={200}>
            <div className="sm:hidden">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Sign out of your account"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </Reveal>

          {/* Safe area spacer for bottom nav */}
          <div className="h-6" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
    </PageTransition>
  );
}

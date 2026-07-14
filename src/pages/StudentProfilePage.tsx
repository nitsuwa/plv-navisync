import { useState, useRef, useEffect } from "react";
import {
  Bookmark, Flag, Clock, Navigation, MapPin, Camera, Shield, ChevronRight,
  LogOut, Settings, GraduationCap, CalendarDays, Award, Activity, Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { cn } from "../lib/utils";
import { PageTransition } from "../components/ui/PageTransition";

const RECENT_ACTIVITY = [
  { icon: MapPin, text: "Viewed ADM Building floor plan", time: "2 hours ago", color: "text-primary" },
  { icon: Navigation, text: "Got directions to Library", time: "Yesterday", color: "text-green-500" },
  { icon: Bookmark, text: "Saved MAB Building to favorites", time: "2 days ago", color: "text-accent" },
  { icon: Flag, text: "Reported broken light in GYM", time: "3 days ago", color: "text-amber-500" },
];

export function StudentProfilePage() {
  const studentAuth = useStudentAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(studentAuth?.username ?? "");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  const handleLogout = () => {
    sessionStorage.removeItem("plv-student-auth");
    navigate("/");
  };

  if (!studentAuth) {
    return (
      <PageTransition>
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-5 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center border border-border"
          >
            <Shield className="h-9 w-9 text-primary/70" />
          </motion.div>
          <div>
            <h2 className="text-xl font-extrabold text-foreground mb-2">Sign in to view your profile</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Log in with your PLV student account to access saved locations, reports, and more.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.97] transition-all"
          >
            Sign In
          </Link>
        </div>
      </PageTransition>
    );
  }

  const initials = displayName.slice(0, 2).toUpperCase();

  const saveDisplayName = () => {
    if (nameInput.trim()) setDisplayName(nameInput.trim());
    setEditingName(false);
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
    { label: "Saved Locations", value: "3", icon: Bookmark, color: "text-primary" },
    { label: "Reports", value: "3", icon: Flag, color: "text-amber-500" },
    { label: "Routes Taken", value: "12", icon: Navigation, color: "text-green-500" },
    { label: "Status", value: "Active", icon: Shield, color: "text-emerald-500" },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* ── Hero Profile Header ── */}
        <div className="student-hero-header relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full opacity-30 animate-orb-1"
              style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 35%, transparent) 0%, transparent 70%)" }} />
            <div className="absolute -bottom-24 -left-12 w-56 h-56 rounded-full opacity-25 animate-orb-2"
              style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 70%)" }} />
          </div>

          <div className="relative max-w-2xl mx-auto px-5 pt-8 pb-10 sm:pt-10 sm:pb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-6"
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
                  className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-xl flex items-center justify-center border bg-card text-muted-foreground shadow-sm hover:bg-muted transition-colors active:scale-95"
                  aria-label="Change photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex flex-col sm:flex-row items-center gap-2 mb-2">
                    <input
                      ref={nameInputRef}
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveDisplayName();
                        if (e.key === "Escape") { setEditingName(false); setNameInput(displayName); }
                      }}
                      className="w-full sm:flex-1 px-3 py-2 rounded-xl border text-xl font-extrabold focus:outline-none focus:ring-2 focus:ring-primary/30 bg-input-background"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveDisplayName} className="h-9 px-4 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:brightness-110 transition-all">
                        Save
                      </button>
                      <button onClick={() => { setEditingName(false); setNameInput(displayName); }}
                        className="h-9 px-3 rounded-xl text-sm font-bold border hover:bg-muted transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                      {displayName}
                    </h1>
                    <button
                      onClick={() => { setEditingName(true); setNameInput(displayName); }}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border hover:bg-muted/70 transition-colors text-muted-foreground"
                    >
                      Edit
                    </button>
                  </div>
                )}

                <p className="text-sm text-muted-foreground mb-3">
                  {studentAuth.username.toLowerCase()}@plv.edu.ph
                </p>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span className="capitalize">{studentAuth.role} · PLV</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 justify-center sm:justify-start text-xs">
                  {[
                    { label: "Student ID", value: "2024-00123", icon: Award },
                    { label: "School Year", value: "2024–2025", icon: CalendarDays },
                    { label: "Program", value: "BS Computer Science", icon: Activity },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-1.5">
                      <f.icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{f.label}</span>
                      <span className="font-semibold text-foreground">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3.5 rounded-xl border text-xs font-bold hover:bg-muted transition-colors shrink-0 text-muted-foreground"
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
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8"
            >
              {STATS.map(({ label, value, icon: StatIcon, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.05 }}
                  className="surface-card rounded-2xl px-3 py-3.5 text-center hover:shadow-md transition-shadow"
                >
                  <StatIcon className={cn("h-4 w-4 mx-auto mb-1.5", color)} />
                  <p className="text-lg font-extrabold text-foreground leading-none">{value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="max-w-2xl mx-auto px-5 py-7 space-y-7">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Recent Activity</p>
            </div>
            <div className="surface-card rounded-2xl overflow-hidden">
              {RECENT_ACTIVITY.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.06 }}
                  className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <item.icon className={cn("h-4 w-4", item.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.text}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{item.time}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Quick Access */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-4">
              Quick Access
            </p>
            <div className="space-y-2.5">
              {QUICK_LINKS.map((ql, i) => {
                const QlIcon = ql.icon;
                return (
                  <motion.div
                    key={ql.to}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                  >
                    <Link
                      to={ql.to}
                      className="surface-card surface-card-interactive flex items-center gap-4 px-4 py-4 rounded-2xl group"
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: ql.color }}
                      >
                        <QlIcon className="h-5 w-5" style={{ color: ql.iconColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">{ql.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{ql.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 shrink-0" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Open Map CTA */}
          <Link
            to="/map"
            className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            <MapPin className="h-4 w-4" />
            Open Campus Map
          </Link>

          {/* Mobile Logout */}
          <button
            onClick={handleLogout}
            className="sm:hidden w-full flex items-center justify-center gap-2 h-12 rounded-2xl border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.98] transition-all"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>

          {/* Safe area spacer for bottom nav */}
          <div className="h-6 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
    </PageTransition>
  );
}

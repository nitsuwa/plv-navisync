import { useState, useEffect } from "react";
import {
  Moon, Sun, Lock, Bell, ChevronDown, Shield, MapPin, HelpCircle,
  Smartphone, Globe, CheckCircle2, ChevronRight, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useTheme } from "../hooks/useTheme";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { Skeleton } from "../components/ui/Skeleton";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { cn } from "../lib/utils";

// ═════════════════════════════════════════════════════════════════════════════
// ── Scroll-reveal wrapper ───────────────────────────────────────────────────
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
// ── Section label ───────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest mb-4">
      <Sparkles className="h-3 w-3" />
      {children}
    </div>
  );
}

type SettingsSection = "appearance" | "notifications" | "security" | "support";

export function StudentSettingsPage() {
  const navigate = useNavigate();
  const { loading: authLoading, isStudent, username, role, signOut } = useStudentAuth();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  const [notifMap, setNotifMap] = useState(true);
  const [notifReports, setNotifReports] = useState(true);
  const [notifEvents, setNotifEvents] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);



  // Wait for the Supabase session/profile check before deciding. Reuse the
  // branded skeleton so there is no blank flash while the session resolves.
  if (authLoading || loading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center gap-4 mb-6">
              <Skeleton variant="avatar" className="h-12 w-12" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            {/* Tabs skeleton */}
            <Skeleton className="h-12 w-full rounded-2xl" />
            {/* Content cards */}
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  // Only active student profiles may use the student settings.
  if (!isStudent) {
    navigate("/admin");
    return null;
  }

  const handlePwSave = () => {
    setPwSaved(true);
    setTimeout(() => {
      setChangingPw(false);
      setPwSaved(false);
      setPwForm({ current: "", next: "", confirm: "" });
    }, 1800);
  };

  const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType }[] = [
    { key: "appearance", label: "Appearance", icon: theme === "dark" ? Moon : Sun },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "security", label: "Security", icon: Lock },
    { key: "support", label: "Support", icon: HelpCircle },
  ];

  function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={cn(
          "relative inline-flex items-center h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
          on ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "block h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200",
            on ? "translate-x-[25px]" : "translate-x-[3px]"
          )}
        />
      </button>
    );
  }

  function SettingRow({ icon: Icon, label, desc, action }: {
    icon: React.ElementType; label: string; desc?: string; action: React.ReactNode;
  }) {
    return (
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            {desc && <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>}
          </div>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen">
        <StudentPageHeader
          backTo="/student"
          title="Settings"
          subtitle="Manage your account, preferences, and privacy"
          icon={Shield}
          iconBg="color-mix(in srgb, #8b5cf6 14%, transparent)"
          iconColor="#7c3aed"
        >
          {/* Section tabs */}
          <div className="flex gap-1 p-1 rounded-2xl bg-muted/30 border border-border/60">
            {SECTIONS.map(({ key, label, icon: SecIcon }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex-1 justify-center relative",
                  activeSection === key
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <SecIcon className="h-4 w-4" />
                <span className="text-[10px] font-semibold leading-tight">{label}</span>
                {activeSection === key && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </StudentPageHeader>

        <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeSection === "appearance" && (
                <Reveal>
                  <div>
                    <SectionLabel>Appearance</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <div className="px-5 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted border border-border/60">
                              {theme === "dark"
                                ? <Moon className="h-4 w-4 text-muted-foreground" />
                                : <Sun className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {theme === "dark" ? "Dark Mode" : "Light Mode"}
                              </p>
                              <p className="text-xs text-muted-foreground">Switch appearance theme</p>
                            </div>
                          </div>
                          <Toggle on={theme === "dark"} onToggle={toggleTheme} />
                        </div>
                      </div>
                      <div className="px-5 py-3 border-t border-border/50 bg-muted/20 flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">System default follows your device settings</span>
                      </div>
                    </div>
                  </div>
                </Reveal>
              )}

              {activeSection === "notifications" && (
                <Reveal>
                  <div>
                    <SectionLabel>Notifications</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <SettingRow icon={MapPin} label="Map updates" desc="When published maps are updated" action={<Toggle on={notifMap} onToggle={() => setNotifMap(v => !v)} />} />
                      <SettingRow icon={Bell} label="Report status" desc="Updates when your reports change status" action={<Toggle on={notifReports} onToggle={() => setNotifReports(v => !v)} />} />
                      <SettingRow icon={Smartphone} label="Campus events" desc="Alerts for event maps and activities" action={<Toggle on={notifEvents} onToggle={() => setNotifEvents(v => !v)} />} />
                    </div>
                  </div>
                </Reveal>
              )}

              {activeSection === "security" && (
                <Reveal>
                  <div>
                    <SectionLabel>Security</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <button
                        onClick={() => setChangingPw(v => !v)}
                        className="w-full flex items-center gap-3 px-5 py-4 border-b border-border/50 hover:bg-muted/20 transition-colors text-left"
                      >
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground flex-1">Change Password</span>
                        <motion.div
                          animate={{ rotate: changingPw ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                      </button>

                      <AnimatePresence>
                        {changingPw && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 py-4 border-b border-border/50 space-y-3 bg-muted/20">
                              {([
                                { key: "current" as const, label: "Current Password", placeholder: "Enter current password", type: "password" },
                                { key: "next" as const, label: "New Password", placeholder: "Min. 8 characters", type: "password" },
                                { key: "confirm" as const, label: "Confirm New Password", placeholder: "Repeat new password", type: "password" },
                              ]).map(f => (
                                <div key={f.key}>
                                  <label className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">{f.label}</label>
                                  <input
                                    type={f.type}
                                    value={pwForm[f.key]}
                                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder}
                                    className="w-full px-3 py-2.5 rounded-xl border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all bg-input-background"
                                  />
                                </div>
                              ))}
                              {pwSaved && (
                                <motion.p
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Password updated successfully.
                                </motion.p>
                              )}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => { setChangingPw(false); setPwForm({ current: "", next: "", confirm: "" }); }}
                                  className="flex-1 h-10 rounded-xl border border-border/60 text-xs font-bold hover:bg-muted/60 transition-colors text-muted-foreground">
                                  Cancel
                                </button>
                                <button onClick={handlePwSave}
                                  disabled={!pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}
                                  className="flex-1 h-10 rounded-xl text-xs font-bold transition-all disabled:opacity-40 bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.97]">
                                  {pwSaved ? "Saved!" : "Update Password"}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
                        {[
                          { label: "Username", value: username },
                          { label: "Role", value: role },
                          { label: "School", value: "Pamantasan ng Lungsod ng Valenzuela" },
                          { label: "Status", value: "Active" },
                        ].map(f => (
                          <div key={f.label}>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-0.5">{f.label}</p>
                            <p className="text-sm font-semibold text-foreground">{f.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Reveal>
              )}

              {activeSection === "support" && (
                <Reveal>
                  <div>
                    <SectionLabel>Support</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <Link to="/help" className="flex items-center gap-3 px-5 py-4 border-b border-border/50 hover:bg-muted/20 transition-colors group">
                        <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground flex-1">Help Center</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                      <Link to="/map" className="flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors group">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground flex-1">Open Campus Map</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </Reveal>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="h-6 md:hidden" />
        </div>
      </div>
    </PageTransition>
  );
}

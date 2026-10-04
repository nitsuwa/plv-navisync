import { useState, useEffect } from "react";
import {
  Moon, Sun, Lock, Bell, ChevronDown, Shield, CheckCircle2,
  Sparkles, Monitor, Eye, EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useTheme } from "../hooks/useTheme";
import { useToast } from "../hooks/useToast";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { Skeleton } from "../components/ui/Skeleton";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { cn } from "../lib/utils";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { ThemePreference } from "../hooks/useTheme";
import { MIN_ACCOUNT_PASSWORD_LENGTH, updateStudentPassword } from "../lib/studentAccount";
import {
  DEFAULT_STUDENT_PREFERENCES,
  loadStudentPreferences,
  saveStudentPreferences,
  type StudentNotificationPreferences,
} from "../services/studentPreferencesService";

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

type SettingsSection = "appearance" | "notifications" | "security";

export function StudentSettingsPage() {
  const navigate = useNavigate();
  const { loading: authLoading, isStudent, username, role, signOut } = useStudentAuth();
  const { theme, themePreference, setThemePreference } = useTheme();
  const reducedMotion = useReducedMotion();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  const [preferences, setPreferences] = useState<StudentNotificationPreferences>(DEFAULT_STUDENT_PREFERENCES);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwVisibility, setPwVisibility] = useState({ current: false, next: false, confirm: false });
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadStudentPreferences()
      .then((loaded) => {
        if (!mounted) return;
        setPreferences(loaded);
      })
      .catch(() => {
        if (mounted) setPreferencesError("Notification preferences could not be loaded.");
      })
      .finally(() => {
        if (mounted) setPreferencesLoading(false);
      });
    return () => {
      mounted = false;
    };
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

  const handlePreferenceChange = async (key: keyof StudentNotificationPreferences, value: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingPreferences(true);
    setPreferencesError(null);
    try {
      await saveStudentPreferences(next);
      success("Preferences saved");
    } catch {
      setPreferences(previous);
      setPreferencesError("Could not save this preference. Please try again.");
      showError("Preference not saved");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handlePwSave = async () => {
    setPwError(null);
    if (pwForm.next.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
      setPwError(`Your new password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError("The new passwords do not match.");
      return;
    }
    setPwSaving(true);
    try {
      await updateStudentPassword(pwForm.current, pwForm.next);
      setPwSaved(true);
      success("Password updated", "Your new password is active.");
      setTimeout(() => {
        setChangingPw(false);
        setPwSaved(false);
        setPwForm({ current: "", next: "", confirm: "" });
      }, 1800);
    } catch {
      setPwError("Current password is incorrect or the update could not be completed.");
      showError("Password not updated");
    } finally {
      setPwSaving(false);
    }
  };

  const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType }[] = [
    { key: "appearance", label: "Appearance", icon: theme === "dark" ? Moon : Sun },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "security", label: "Security", icon: Lock },
  ];

  function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
    return (
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={on}
        onClick={onToggle}
        disabled={preferencesLoading || savingPreferences}
        className={cn(
          "relative inline-flex items-center h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
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
            {desc && <p className="break-words text-xs leading-relaxed text-muted-foreground mt-0.5">{desc}</p>}
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
                type="button"
                role="tab"
                aria-selected={activeSection === key}
                onClick={() => setActiveSection(key)}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex-1 justify-center relative",
                  activeSection === key
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <SecIcon className="h-4 w-4" />
                <span className="text-[11px] font-semibold leading-tight">{label}</span>
                {activeSection === key && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </StudentPageHeader>

        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 space-y-6">
          <AnimatePresence>
            <motion.div
              key={activeSection}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.18, ease: "easeOut" }}
            >
              {activeSection === "appearance" && (
                <Reveal>
                  <div>
                    <SectionLabel>Appearance</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted">
                          {themePreference === "system" ? <Monitor className="h-4 w-4 text-muted-foreground" /> : theme === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div><p className="text-sm font-semibold text-foreground">Theme</p><p className="text-xs text-muted-foreground">Choose how NaviSync looks on this device.</p></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance theme">
                        {([
                          ["system", "System", Monitor, "Follow device"],
                          ["light", "Light", Sun, "Always light"],
                          ["dark", "Dark", Moon, "Always dark"],
                        ] as [ThemePreference, string, React.ElementType, string][]).map(([value, label, Icon, hint]) => (
                          <button key={value} type="button" role="radio" aria-checked={themePreference === value} onClick={() => setThemePreference(value)}
                            className={cn("flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", themePreference === value ? "border-primary bg-primary/8 text-primary" : "border-border/70 text-muted-foreground hover:bg-muted/40")}>
                            <Icon className="h-4 w-4" /><span className="text-xs font-bold">{label}</span><span className="text-[10px] leading-tight">{hint}</span>
                          </button>
                        ))}
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
                      <SettingRow icon={Bell} label="Report status" desc="In-app notice when one of your reports changes status" action={<Toggle on={preferences.reportStatus} onToggle={() => void handlePreferenceChange("reportStatus", !preferences.reportStatus)} label="Report status" />} />
                      <p className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">Report status is currently the only in-app notification category NaviSync delivers. Browser and OS push alerts are not enabled.</p>
                      {(preferencesLoading || savingPreferences) && <p className="px-5 py-2 text-xs text-muted-foreground">{preferencesLoading ? "Loading preferences…" : "Saving preferences…"}</p>}
                      {preferencesError && <p role="alert" className="px-5 py-2 text-xs font-semibold text-destructive">{preferencesError}</p>}
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
                                { key: "current" as const, label: "Current Password", placeholder: "Enter current password" },
                                { key: "next" as const, label: "New Password", placeholder: `Min. ${MIN_ACCOUNT_PASSWORD_LENGTH} characters` },
                                { key: "confirm" as const, label: "Confirm New Password", placeholder: "Repeat new password" },
                              ]).map(f => (
                                <div key={f.key}>
                                  <label htmlFor={`student-${f.key}-password`} className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">{f.label}</label>
                                  <div className="relative">
                                    <input
                                      id={`student-${f.key}-password`}
                                      type={pwVisibility[f.key] ? "text" : "password"}
                                      value={pwForm[f.key]}
                                      onChange={e => { setPwForm(p => ({ ...p, [f.key]: e.target.value })); setPwError(null); }}
                                      placeholder={f.placeholder}
                                      autoComplete={f.key === "current" ? "current-password" : "new-password"}
                                      className="w-full rounded-xl border border-border/60 bg-input-background px-3 py-2.5 pr-11 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/25"
                                    />
                                    <button type="button" onClick={() => setPwVisibility((v) => ({ ...v, [f.key]: !v[f.key] }))} aria-label={`${pwVisibility[f.key] ? "Hide" : "Show"} ${f.label.toLowerCase()}`} className="absolute inset-y-0 right-2 inline-flex w-8 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                                      {pwVisibility[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <p className="text-[11px] text-muted-foreground">Use at least {MIN_ACCOUNT_PASSWORD_LENGTH} characters. Your current password is verified before the update.</p>
                              {pwForm.confirm && pwForm.next !== pwForm.confirm && <p className="text-xs font-semibold text-destructive">The new passwords do not match.</p>}
                              {pwForm.next && pwForm.next.length < MIN_ACCOUNT_PASSWORD_LENGTH && <p className="text-xs text-muted-foreground">Your new password needs at least {MIN_ACCOUNT_PASSWORD_LENGTH} characters.</p>}
                              {pwSaved && (
                                <motion.p
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Password updated successfully.
                                </motion.p>
                              )}
                              {pwError && <p role="alert" className="text-xs font-semibold text-destructive">{pwError}</p>}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => { setChangingPw(false); setPwForm({ current: "", next: "", confirm: "" }); }}
                                  className="flex-1 h-10 rounded-xl border border-border/60 text-xs font-bold hover:bg-muted/60 transition-colors text-muted-foreground">
                                  Cancel
                                </button>
                                <button onClick={() => void handlePwSave()}
                                  disabled={pwSaving || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}
                                  className="flex-1 h-10 rounded-xl text-xs font-bold transition-all disabled:opacity-40 bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.97]">
                                  {pwSaving ? "Updating…" : pwSaved ? "Saved!" : "Update Password"}
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
                      <p className="px-5 pb-4 text-xs text-muted-foreground">Account details are read-only. Contact your campus administrator if they need to change.</p>
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

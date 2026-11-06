import { lazy, Suspense, useState, useEffect, useRef } from "react";
import {
  Moon, Sun, Lock, Bell, ChevronDown, Shield, CheckCircle2,
  Sparkles, Monitor, Eye, EyeOff, Volume2, Smartphone,
  Save, RotateCcw, UserRound,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Navigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useTheme } from "../hooks/useTheme";
import { useToast } from "../hooks/useToast";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { Skeleton } from "../components/ui/Skeleton";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { cn } from "../lib/utils";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useMapFeedbackPreferences } from "../hooks/useMapFeedbackPreferences";
import type { ThemePreference } from "../hooks/useTheme";
import { MIN_ACCOUNT_PASSWORD_LENGTH, updateStudentPassword } from "../lib/studentAccount";
import { useNaviBuddy } from "../contexts/NaviBuddyStore";
import { DEFAULT_NAVIBUDDY_APPEARANCE, isNaviBuddyLookDirty, NAVIBUDDY_BACKPACKS, NAVIBUDDY_OUTFITS, NAVIBUDDY_OUTFIT_DETAILS, type NaviBuddyAppearance } from "../lib/naviBuddy";
import { triggerMapFeedbackSound } from "../lib/mapFeedback";
import { NaviBuddyPortrait } from "../components/map/NaviBuddyPortrait";
const NaviBuddy3DPreview = lazy(() => import("../components/map/NaviBuddy3DPreview").then((module) => ({ default: module.NaviBuddy3DPreview })));
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
    <div className="mt-7 mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-primary first:mt-0">
      <Sparkles className="h-3 w-3" />
      {children}
    </div>
  );
}

function Toggle({ on, onToggle, label, disabled = false }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-label={label} aria-checked={on} onClick={onToggle} disabled={disabled}
      className={cn("group relative inline-flex h-7 w-[50px] shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors duration-200 ease-out hover:brightness-[.97] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none", on ? "bg-primary" : "bg-slate-300 dark:bg-slate-700")}
      data-checked={on ? "true" : "false"}>
      <span aria-hidden="true" className={cn("h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,.26)] transition-[translate] duration-[220ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none", on ? "translate-x-[22px]" : "translate-x-0")} />
    </button>
  );
}

function SettingRow({ icon: Icon, label, desc, action }: { icon: React.ElementType; label: string; desc?: string; action: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-4 transition-colors duration-200 last:border-0 hover:bg-muted/20">
    <div className="flex min-w-0 items-center gap-3"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-sm font-semibold text-foreground">{label}</p>{desc && <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{desc}</p>}</div></div>
    <div className="shrink-0">{action}</div>
  </div>;
}

function BackpackThumbnail({ kind }: { kind: NaviBuddyAppearance["backpack"] }) {
  if (kind === "none") return <svg viewBox="0 0 48 40" aria-hidden="true" className="h-10 w-12"><path d="M11 26h26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".35"/><path d="m19 16 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const compact = kind === "compact";
  return <svg viewBox="0 0 48 40" aria-hidden="true" className="h-10 w-12"><path d={compact ? "M16 14q0-5 8-5t8 5v18H16z" : "M14 14q0-6 10-6t10 6v20H14z"} fill={kind === "classic" ? "#c8960c" : "#8b5e3c"} stroke="#0e2a6e" strokeWidth="2"/><path d={compact ? "M18 18h12v8H18z" : "M17 18h14v10H17z"} fill="#f5e6bc" stroke="#0e2a6e" strokeWidth="1.5"/><path d="M17 14q-5 2-4 10M31 14q5 2 4 10" fill="none" stroke="#0e2a6e" strokeWidth="2" strokeLinecap="round"/>{!compact && <path d="M17 31h14" stroke="#0e2a6e" strokeWidth="2"/>}</svg>;
}

type SettingsSection = "appearance" | "notifications" | "security" | "navibuddy";

export function StudentSettingsPage() {
  const { loading: authLoading, isStudent, username, role, signOut, profile } = useStudentAuth();
  const { theme, preference: themePreference, setThemePreference } = useTheme();
  const reducedMotion = useReducedMotion();
  const mapFeedback = useMapFeedbackPreferences();
  const { success, error: showError } = useToast();
  const { appearance, loaded: buddyLoaded, saveAppearance } = useNaviBuddy();
  const [buddyDraft, setBuddyDraft] = useState<NaviBuddyAppearance>(appearance);
  const [savedBuddyLook, setSavedBuddyLook] = useState<NaviBuddyAppearance>(appearance);
  const [buddySaving, setBuddySaving] = useState(false);
  const [buddySavedFeedback, setBuddySavedFeedback] = useState(false);
  const buddySaveInFlight = useRef(false);
  const buddySavedTimer = useRef<number | null>(null);
  const buddyLookDirty = isNaviBuddyLookDirty(buddyDraft, savedBuddyLook);
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
  const preferenceScope = profile?.id ?? "guest";
  const preferenceScopeRef = useRef(preferenceScope);
  preferenceScopeRef.current = preferenceScope;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    setPreferencesLoading(true);
    setPreferencesError(null);
    setPreferences(DEFAULT_STUDENT_PREFERENCES);
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
  }, [preferenceScope]);

  useEffect(() => {
    if (!buddyLoaded) return;
    setBuddyDraft(appearance);
    setSavedBuddyLook(appearance);
  }, [appearance, buddyLoaded, preferenceScope]);
  useEffect(() => {
    if (buddyLookDirty) setBuddySavedFeedback(false);
  }, [buddyLookDirty]);
  useEffect(() => () => { if (buddySavedTimer.current !== null) window.clearTimeout(buddySavedTimer.current); }, []);



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
    return <Navigate to="/admin" replace />;
  }

  const handlePreferenceChange = async (key: keyof StudentNotificationPreferences, value: boolean) => {
    const requestScope = preferenceScopeRef.current;
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingPreferences(true);
    setPreferencesError(null);
    try {
      await saveStudentPreferences(next);
      if (preferenceScopeRef.current === requestScope) success("Preferences saved");
    } catch {
      if (preferenceScopeRef.current === requestScope) {
        setPreferences(previous);
        setPreferencesError("Could not save this preference. Please try again.");
        showError("Preference not saved");
      }
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
    ...(role === "student" ? [{ key: "navibuddy" as const, label: "My NaviBuddy", icon: UserRound }] : []),
  ];

  const saveBuddyLook = async () => {
    if (!buddyLoaded || !buddyLookDirty || buddySaveInFlight.current) return;
    buddySaveInFlight.current = true;
    setBuddySaving(true);
    try {
      const next = { ...buddyDraft, companionEnabled: appearance.companionEnabled };
      await saveAppearance(next);
      setBuddyDraft(next);
      setSavedBuddyLook(next);
      setBuddySavedFeedback(true);
      if (buddySavedTimer.current !== null) window.clearTimeout(buddySavedTimer.current);
      buddySavedTimer.current = window.setTimeout(() => { setBuddySavedFeedback(false); buddySavedTimer.current = null; }, 2400);
      success("NaviBuddy look saved", "Your look will follow you across navigation.");
      triggerMapFeedbackSound("save-success");
    }
    catch { showError("Look not saved"); }
    finally { buddySaveInFlight.current = false; setBuddySaving(false); }
  };
  const toggleBuddyCompanion = async () => {
    const next = { ...appearance, companionEnabled: !appearance.companionEnabled };
    const draft = buddyDraft;
    setBuddyDraft({ ...draft, companionEnabled: next.companionEnabled });
    try {
      await saveAppearance(next);
      setBuddyDraft({ ...draft, companionEnabled: next.companionEnabled });
    } catch {
      setBuddyDraft(draft);
      showError("Companion preference not saved");
    }
  };

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
          <div role="tablist" aria-label="Settings categories" data-settings-tabs className="flex gap-1 overflow-x-auto p-1 rounded-2xl bg-muted/30 border border-border/60">
            {SECTIONS.map(({ key, label, icon: SecIcon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeSection === key}
                onClick={() => setActiveSection(key)}
                className={cn(
                  "flex min-w-[76px] flex-1 flex-col items-center justify-center gap-1 px-1 sm:min-w-[96px] sm:px-2 py-2.5 rounded-xl text-xs font-bold transition-all relative",
                  activeSection === key
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <SecIcon className="h-4 w-4" />
                <span className="text-[11px] font-semibold leading-tight">{label}</span>
                {activeSection === key && (
                  <motion.span layoutId="settings-tab-indicator" className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" transition={{ duration: reducedMotion ? 0.01 : 0.2 }} />
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
                    <SectionLabel>Map feedback</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <SettingRow icon={Volume2} label="Sound effects" desc="Short optional cues for a successful scan and arrival. Off by default." action={<Toggle on={mapFeedback.soundEnabled} onToggle={() => mapFeedback.setSoundEnabled(!mapFeedback.soundEnabled)} label="Sound effects" />} />
                      <SettingRow icon={Smartphone} label="Haptic feedback" desc="A brief vibration after a successful location scan, where supported." action={<Toggle on={mapFeedback.hapticsEnabled} onToggle={() => mapFeedback.setHapticsEnabled(!mapFeedback.hapticsEnabled)} label="Haptic feedback" />} />
                    </div>
                    <SectionLabel>NaviBuddy companion</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <SettingRow icon={Sparkles} label="Navigation reactions" desc="Show subtle NaviBuddy reactions when a route is ready and when you arrive." action={<Toggle on={buddyDraft.companionEnabled} onToggle={() => void toggleBuddyCompanion()} label="NaviBuddy navigation reactions" disabled={false} />} />
                    </div>
                  </div>
                </Reveal>
              )}

              {activeSection === "notifications" && (
                <Reveal>
                  <div>
                    <SectionLabel>Notifications</SectionLabel>
                    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
                      <SettingRow icon={Bell} label="Report status" desc="In-app notice when one of your reports changes status" action={<Toggle on={preferences.reportStatus} onToggle={() => void handlePreferenceChange("reportStatus", !preferences.reportStatus)} label="Report status" disabled={preferencesLoading || savingPreferences} />} />
                      <p className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">Report status is currently the only in-app notification category NaviSync delivers. Browser and OS push alerts are not enabled.</p>
                      {(preferencesLoading || savingPreferences) && <p className="px-5 py-2 text-xs text-muted-foreground">{preferencesLoading ? "Loading preferences…" : "Saving preferences…"}</p>}
                      {preferencesError && <p role="alert" className="px-5 py-2 text-xs font-semibold text-destructive">{preferencesError}</p>}
                    </div>
                  </div>
                </Reveal>
              )}

              {activeSection === "navibuddy" && role === "student" && (
                <Reveal>
                  <div>
                    <SectionLabel>My NaviBuddy</SectionLabel>
                    <div data-navi-studio className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-stretch">
                      <div data-navi-stage className="relative flex min-h-[330px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(ellipse_at_50%_78%,rgba(30,64,175,.10),transparent_56%)] bg-card px-3 pb-3 pt-1 shadow-sm sm:min-h-[410px] dark:bg-slate-950/40">
                        <span className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-2xl" aria-hidden="true" />
                        <Suspense fallback={<NaviBuddyPortrait appearance={buddyDraft} className="h-[270px] w-[230px]" />}>
                          <NaviBuddy3DPreview appearance={buddyDraft} reducedMotion={reducedMotion} />
                        </Suspense>
                        <span className="relative -mt-1 rounded-full border border-primary/15 bg-card/90 px-4 py-1.5 text-xs font-extrabold text-foreground shadow-sm">{NAVIBUDDY_OUTFIT_DETAILS[buddyDraft.outfit].label}</span>
                      </div>
                      <div data-navi-controls className="flex flex-col rounded-[28px] border border-border/60 bg-card p-4 shadow-sm sm:p-5">
                        <fieldset className="min-w-0 border-0 p-0">
                          <legend className="mb-3 text-sm font-extrabold text-foreground">Outfit</legend>
                          <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="radiogroup" aria-label="NaviBuddy outfit">
                            {NAVIBUDDY_OUTFITS.map((outfit) => {
                              const selected = buddyDraft.outfit === outfit;
                              const detail = NAVIBUDDY_OUTFIT_DETAILS[outfit];
                              return <button key={outfit} type="button" role="radio" aria-checked={selected} aria-label={detail.label} title={detail.label} onClick={() => setBuddyDraft((value) => ({ ...value, outfit }))}
                                className={cn("group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 pb-2 pt-1 transition duration-200 hover:-translate-y-0.5 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none", selected ? "bg-primary/8 ring-2 ring-primary shadow-sm" : "hover:bg-muted/60")}>
                                <NaviBuddyPortrait appearance={{ ...buddyDraft, outfit }} className="navibuddy-wardrobe-thumb h-[78px] w-[64px] max-w-full" excited={selected} />
                                <span className={cn("w-full whitespace-nowrap px-0.5 text-center text-[8px] font-bold leading-tight sm:text-[10px]", selected ? "text-primary" : "text-muted-foreground")}>{detail.label === "PLV Uniform" ? <>PLV<br />Uniform</> : detail.label}</span>
                                {selected && <CheckCircle2 aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full bg-card text-primary" />}
                              </button>;
                            })}
                          </div>
                        </fieldset>
                        <fieldset className="mt-5 min-w-0 border-0 border-t border-border/60 p-0 pt-4">
                          <legend className="mb-2 text-sm font-extrabold text-foreground">Backpack</legend>
                          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="NaviBuddy backpack">
                            {NAVIBUDDY_BACKPACKS.map((backpack) => {
                              const selected = buddyDraft.backpack === backpack;
                              const label = backpack === "classic" ? "Classic" : backpack === "compact" ? "Compact" : "None";
                              const spokenLabel = backpack === "none" ? "No backpack" : `${label} Backpack`;
                              return <button key={backpack} type="button" role="radio" aria-label={spokenLabel} aria-checked={selected} title={spokenLabel} onClick={() => setBuddyDraft((value) => ({ ...value, backpack }))}
                                className={cn("relative flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl transition duration-200 hover:-translate-y-0.5 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none", selected ? "bg-primary/8 ring-2 ring-primary" : "hover:bg-muted/60")}>
                                <BackpackThumbnail kind={backpack} /><span className={cn("text-[10px] font-bold", selected ? "text-primary" : "text-muted-foreground")}>{label}</span>
                                {selected && <CheckCircle2 aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full bg-card text-primary" />}
                              </button>;
                            })}
                          </div>
                        </fieldset>
                        <div className="mt-auto min-h-10 border-t border-border/60 pt-2" aria-live="polite">
                          {buddySavedFeedback && <motion.p initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.18 }} className="flex h-7 items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Look saved!</motion.p>}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" aria-label="Reset NaviBuddy to default" title="Reset" onClick={() => setBuddyDraft(DEFAULT_NAVIBUDDY_APPEARANCE)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 text-xs font-bold text-muted-foreground transition hover:bg-muted active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><RotateCcw className="h-3.5 w-3.5" /><span>Reset</span></button>
                          <button type="button" onClick={() => void saveBuddyLook()} disabled={buddySaving || !buddyLoaded || !buddyLookDirty} aria-busy={buddySaving} className={cn("inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", buddySaving || !buddyLoaded || !buddyLookDirty ? "cursor-not-allowed bg-muted text-muted-foreground shadow-none" : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[.98]")}>{buddySaving ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />Saving...</> : <><Save className="h-3.5 w-3.5" />Save Look</>}</button>
                        </div>
                      </div>
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
                                      className="w-full rounded-xl border border-border/60 bg-input-background px-3 py-2.5 pr-14 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/25"
                                    />
                                    <button type="button" onClick={() => setPwVisibility((v) => ({ ...v, [f.key]: !v[f.key] }))} aria-label={`${pwVisibility[f.key] ? "Hide" : "Show"} ${f.label.toLowerCase()}`} aria-pressed={Boolean(pwVisibility[f.key])} className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
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

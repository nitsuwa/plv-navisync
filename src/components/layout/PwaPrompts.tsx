import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Download, EllipsisVertical, Maximize2, MonitorDown, RefreshCw, Share, Sparkles, SquarePlus, WifiOff, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { applyPwaUpdate, promptPwaInstall, usePwaState, type ManualInstallPlatform } from "../../lib/pwa";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { PLVLogo } from "../ui/PLVLogo";
import { DURATION, SPRING } from "../../config/animation";
import { useReducedMotion } from "../../hooks/useReducedMotion";

const INSTALL_DISMISS_KEY = "plv-install-dismissed-at";
const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const INSTALL_DELAY_MS = 4000;

function recentlyDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0) < INSTALL_DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * Update card shown when a new deploy is installed and waiting. It never
 * reloads on its own: editors may hold unsaved work, so the user chooses.
 * "Later" hides it for this page load; it returns on the next visit.
 */
export function PwaUpdateNotifier() {
  const { updateReady } = usePwaState();
  const reduceMotion = useReducedMotion();
  const [deferred, setDeferred] = useState(false);
  const [applying, setApplying] = useState(false);
  const open = updateReady && !deferred;

  const reload = async () => {
    setApplying(true);
    await applyPwaUpdate();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pwa-update"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="pwa-update-title"
          aria-describedby="pwa-update-description"
          data-testid="pwa-update-card"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={reduceMotion ? { duration: DURATION.fast } : SPRING.modal}
          className="fixed inset-x-3 z-[90] mx-auto max-w-sm rounded-2xl border border-border bg-card p-3.5 text-card-foreground shadow-[0_18px_48px_rgba(8,25,67,0.28)] md:left-auto md:right-6 md:mx-0 md:w-[360px]"
          style={{ top: "calc(max(0.75rem, env(safe-area-inset-top, 0px)) + 0.25rem)" }}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Update available</p>
              <h2 id="pwa-update-title" className="text-sm font-extrabold leading-tight" style={{ fontFamily: "var(--font-sans)" }}>
                A new version of NaviSync is ready
              </h2>
              <p id="pwa-update-description" className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Save any open work, then reload to update.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setDeferred(true)} disabled={applying}>Later</Button>
            <Button variant="primary" size="sm" className="flex-[1.4]" isLoading={applying} onClick={() => void reload()}>
              {!applying && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Reload now
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small pill shown while the device has no connection. */
export function OfflineIndicator() {
  const { online } = usePwaState();
  if (online) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4"
      style={{ top: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-bold text-foreground shadow-lg backdrop-blur-xl">
        <WifiOff className="h-3.5 w-3.5 text-amber-500" aria-hidden />
        You're offline — map and live data need a connection
      </div>
    </div>
  );
}

const INSTALL_BENEFITS = [
  { icon: Zap, label: "One-tap launch" },
  { icon: Maximize2, label: "Full screen" },
] as const;

const inlineIcon = "mx-0.5 inline h-4 w-4 align-[-3px] text-primary";

/** Browser-specific steps for when no native install prompt is available. */
const MANUAL_INSTALL_STEPS: Record<ManualInstallPlatform, ReactNode[]> = {
  ios: [
    <>Tap <Share className={inlineIcon} aria-hidden="true" /> <span className="font-bold">Share</span> in the browser bar</>,
    <>Choose <SquarePlus className={inlineIcon} aria-hidden="true" /> <span className="font-bold">Add to Home Screen</span></>,
  ],
  android: [
    <>Tap the <EllipsisVertical className={inlineIcon} aria-hidden="true" /> <span className="font-bold">menu</span> in the browser bar</>,
    <>Choose <span className="font-bold">Install app</span> or <span className="font-bold">Add to Home screen</span></>,
  ],
  "desktop-chromium": [
    <>Click <MonitorDown className={inlineIcon} aria-hidden="true" /> <span className="font-bold">Install</span> in the address bar, or open the browser menu</>,
    <>Choose <span className="font-bold">Install PLV NaviSync</span> (Edge: <span className="font-bold">Apps → Install this site</span>)</>,
  ],
  "mac-safari": [
    <>Open the <span className="font-bold">File</span> menu in Safari</>,
    <>Choose <span className="font-bold">Add to Dock</span></>,
  ],
};

function StepNumber({ value }: { value: number }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
      {value}
    </span>
  );
}

/**
 * Install card. Uses the native prompt when the browser offers one
 * (Chromium, once its engagement checks pass); otherwise shows the manual
 * steps for the current browser. Hidden once installed or recently dismissed.
 */
export function InstallAppBanner() {
  const { canInstall, manualInstall, isStandalone } = usePwaState();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(recentlyDismissed);
  const [installing, setInstalling] = useState(false);

  const eligible = !isStandalone && !dismissed && (canInstall || manualInstall !== null);
  // The map and the event editor use the bottom of the screen for sheets.
  const blockedRoute = pathname === "/map" || /\/edit\/?$/.test(pathname);
  const open = eligible && visible && !blockedRoute;

  useEffect(() => {
    if (!eligible) return;
    const timer = window.setTimeout(() => setVisible(true), INSTALL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  const install = async () => {
    setInstalling(true);
    try {
      const accepted = await promptPwaInstall();
      if (!accepted) dismiss();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="install-app"
          role="dialog"
          aria-modal="false"
          aria-labelledby="install-app-title"
          aria-describedby="install-app-description"
          data-testid="install-app-card"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          transition={reduceMotion ? { duration: DURATION.fast } : SPRING.modal}
          className={cn(
            "fixed z-[45] mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_18px_48px_rgba(8,25,67,0.28)]",
            "inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))]",
            "md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]",
          )}
        >
          {/* Branded header: the landing CTA's navy gradient with a gold route accent */}
          <div
            className="relative overflow-hidden p-4 text-white"
            style={{ background: "radial-gradient(ellipse 120% 90% at 20% 0%, #163a96 0%, #0d2470 45%, #071440 100%)" }}
          >
            <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-5 w-full opacity-50" viewBox="0 0 380 20" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-10 16 C 80 6, 160 18, 240 10 S 340 2, 400 8" fill="none" stroke="#e0a820" strokeWidth="1.5" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />

            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss install suggestion"
              className="absolute right-2.5 top-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex items-center gap-3 pr-8">
              <PLVLogo size={48} className="shadow-lg ring-2 ring-white/25" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#e0a820]">Install the app</p>
                <h2 id="install-app-title" className="mt-0.5 text-base font-extrabold leading-tight text-white" style={{ fontFamily: "var(--font-sans)" }}>
                  PLV NaviSync
                </h2>
                <p className="text-xs text-white/70">Smart Campus Navigator</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <p id="install-app-description" className="text-sm leading-snug text-muted-foreground">
              Add NaviSync to your {manualInstall === "ios" || manualInstall === "android" ? "home screen" : "device"} for quicker access to the campus map and announcements.
            </p>

            <ul className="grid grid-cols-2 gap-1.5" aria-label="Benefits">
              {INSTALL_BENEFITS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2 py-2 text-center">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="text-[11px] font-bold leading-tight text-foreground">{label}</span>
                </li>
              ))}
            </ul>

            {canInstall ? (
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={dismiss}>Not now</Button>
                <Button variant="primary" className="flex-[1.4]" isLoading={installing} onClick={() => void install()}>
                  {!installing && <Download className="h-4 w-4" aria-hidden="true" />}
                  Install app
                </Button>
              </div>
            ) : manualInstall && (
              <>
                <ol className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground">
                  {MANUAL_INSTALL_STEPS[manualInstall].map((step, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <StepNumber value={index + 1} />
                      <span className="pt-0.5 leading-snug">{step}</span>
                    </li>
                  ))}
                </ol>
                <Button variant="outline" className="w-full" onClick={dismiss}>Got it</Button>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

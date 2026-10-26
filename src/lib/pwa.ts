import { useSyncExternalStore } from "react";

/**
 * PWA runtime: service worker registration, update hand-off, and install
 * prompt state. React reads it through `usePwaState`.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    /** Captured by the inline script in index.html before this module loads. */
    __plvInstallPrompt?: BeforeInstallPromptEvent | null;
  }
  interface Navigator {
    /** iOS Safari home-screen apps. */
    standalone?: boolean;
    /** Chromium: reports this PWA when the manifest lists itself. */
    getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string }>>;
  }
}

export type ManualInstallPlatform = "ios" | "android" | "desktop-chromium" | "mac-safari";

export interface PwaState {
  /** A new build is installed and waiting to take over. */
  updateReady: boolean;
  /** The browser offered a native install prompt (Chromium on Android/Windows). */
  canInstall: boolean;
  /** Running as an installed app rather than a browser tab. */
  isStandalone: boolean;
  /**
   * How to install by hand when no native prompt is available. Chromium only
   * fires `beforeinstallprompt` after its engagement checks pass, and Safari
   * never fires it, so the install card falls back to browser-specific steps.
   */
  manualInstall: ManualInstallPlatform | null;
  online: boolean;
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const BUILD_QUERY_TIMEOUT_MS = 2000;
const INSTALLED_KEY = "plv-app-installed";

let waitingWorker: ServiceWorker | null = null;
let installPrompt: BeforeInstallPromptEvent | null = null;
let reloadOnControllerChange = false;
const listeners = new Set<() => void>();

function detectStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.matchMedia?.("(display-mode: window-controls-overlay)").matches
    || window.matchMedia?.("(display-mode: minimal-ui)").matches
    || navigator.standalone === true;
}

export function detectManualInstall(
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
  iPadOs = typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1,
): ManualInstallPlatform | null {
  if (/iphone|ipad|ipod/i.test(ua) || iPadOs) return "ios";
  // Firefox can't install web apps on desktop, and on Android its menu
  // differs; skip it rather than show steps that may not exist.
  if (/firefox|fxios/i.test(ua)) return null;
  const chromium = /chrome|chromium|crios|edg\//i.test(ua);
  if (/android/i.test(ua)) return chromium || /samsungbrowser/i.test(ua) ? "android" : null;
  if (chromium) return "desktop-chromium";
  // Safari 17+ on macOS supports File → Add to Dock.
  if (/macintosh/i.test(ua) && /safari/i.test(ua)) return "mac-safari";
  return null;
}

let state: PwaState = {
  updateReady: false,
  canInstall: false,
  isStandalone: detectStandalone(),
  manualInstall: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
};
state.manualInstall = state.isStandalone || rememberedInstall() ? null : detectManualInstall();

function rememberedInstall() {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/**
 * Hashed entry script and stylesheet this page was loaded with. Only these
 * static tags count: Vite injects modulepreload links for lazy chunks later,
 * and those are not part of the worker's precache list.
 */
function pageBuildAssets() {
  return [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[type="module"][src*="/assets/"], link[rel="stylesheet"][href*="/assets/"]')]
    .map(element => new URL(element instanceof HTMLScriptElement ? element.src : element.href).pathname);
}

let initialPageAssets: string[] = [];

/** Resolves the waiting worker's precache list, or null if it doesn't answer. */
function queryWorkerBuild(worker: ServiceWorker): Promise<string[] | null> {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), BUILD_QUERY_TIMEOUT_MS);
    channel.port1.onmessage = event => {
      window.clearTimeout(timer);
      resolve(Array.isArray(event.data) ? event.data : null);
    };
    worker.postMessage({ type: "GET_BUILD_ASSETS" }, [channel.port2]);
  });
}

async function trackWaitingWorker(worker: ServiceWorker | null) {
  // Only an update matters here: on first install there is no controller and
  // the worker activates on its own.
  if (!worker || !navigator.serviceWorker.controller) return;
  waitingWorker = worker;

  // Navigations are network-first, so after a deploy the page usually already
  // runs the new build and only the worker is behind. Swap it silently then;
  // prompt only when this page's code is older than the waiting worker's.
  const workerAssets = await queryWorkerBuild(worker);
  const pageAssets = initialPageAssets;
  const pageIsCurrent = workerAssets !== null && pageAssets.length > 0
    && pageAssets.every(asset => workerAssets.includes(asset));
  if (pageIsCurrent) {
    worker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  setState({ updateReady: true });
}

/** Activate the waiting worker and reload once it controls the page. */
export async function applyPwaUpdate() {
  // Re-read the registration: the worker captured at detection time can be
  // superseded by a newer deploy while the toast is open.
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const worker = registration?.waiting ?? waitingWorker;
  if (!worker) {
    window.location.reload();
    return;
  }
  reloadOnControllerChange = true;
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Show the native install prompt. Resolves true when the user accepted. */
export async function promptPwaInstall(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null;
  window.__plvInstallPrompt = null;
  setState({ canInstall: false });
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}

function setupInstallTracking() {
  if (window.__plvInstallPrompt) {
    installPrompt = window.__plvInstallPrompt;
    try { localStorage.removeItem(INSTALLED_KEY); } catch { /* storage unavailable */ }
    state = { ...state, canInstall: true };
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    // The browser only offers this when the app is not installed.
    try { localStorage.removeItem(INSTALLED_KEY); } catch { /* storage unavailable */ }
    setState({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    window.__plvInstallPrompt = null;
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* storage unavailable */ }
    setState({ canInstall: false, isStandalone: detectStandalone(), manualInstall: null });
  });
  // Chromium never fires beforeinstallprompt once the app is installed, so
  // without this a browser tab would keep suggesting manual install steps.
  navigator.getInstalledRelatedApps?.()
    .then(apps => {
      if (apps.some(app => app.platform === "webapp")) setState({ canInstall: false, manualInstall: null });
    })
    .catch(() => {});
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => {
    setState({ isStandalone: detectStandalone() });
  });
  window.addEventListener("online", () => setState({ online: true }));
  window.addEventListener("offline", () => setState({ online: false }));
}

async function registerServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

  void trackWaitingWorker(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed") void trackWaitingWorker(worker);
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Never reload under an editor on its own; only after the user chose to.
    if (!reloadOnControllerChange) return;
    reloadOnControllerChange = false;
    window.location.reload();
  });

  // Installed apps can stay open for days; look for new deploys periodically.
  const checkForUpdate = () => { registration.update().catch(() => {}); };
  window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
}

export function initPwa() {
  if (typeof window === "undefined") return;
  initialPageAssets = pageBuildAssets();
  setupInstallTracking();

  // A lazy chunk from a replaced deploy can 404; reload into the new build,
  // but not in a loop if the chunk is genuinely broken.
  window.addEventListener("vite:preloadError", event => {
    // Offline, the chunk simply was never cached; reloading would not help.
    if (!navigator.onLine) return;
    const key = "plv-preload-reload-at";
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });

  // The worker is production-only; index.html clears stale workers in dev.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const start = () => { registerServiceWorker().catch(() => { /* app works without it */ }); };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

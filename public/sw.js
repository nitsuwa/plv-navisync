// PLV NaviSync — Service Worker
//
// Caching policy:
//   - App shell (index.html) is network-first with a short timeout, falling
//     back to the cached shell so every SPA route opens offline.
//   - Hashed /assets/* files are cache-first (immutable per deploy). The
//     entry chunks referenced by index.html are precached at install.
//   - Images/fonts are cache-first; map tiles are stale-while-revalidate.
//   - Supabase and any credentialed request is network-only, never cached.
//
// `vite build` (see pwaServiceWorkerPlugin in vite.config.ts) replaces the
// two placeholders below with the build id and the shell's asset list, so
// each deploy gets fresh cache buckets automatically.

const BUILD_ID = "__PLV_BUILD_ID__";
const BUILD_ASSETS = /* __PLV_PRECACHE_ASSETS__ */ [];

const CACHE_PREFIX = "plv-navisync";
const CACHES = {
  shell: `${CACHE_PREFIX}-${BUILD_ID}-shell`,
  static: `${CACHE_PREFIX}-${BUILD_ID}-static`,
  // Runtime buckets survive deploys: images and tiles are not build-specific.
  images: `${CACHE_PREFIX}-images`,
  tiles: `${CACHE_PREFIX}-tiles`,
};
const KEEP_CACHES = new Set(Object.values(CACHES));

const APP_SHELL_URL = "/index.html";
const SHELL_URLS = [
  APP_SHELL_URL,
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
];

// Module scripts are requested with an Origin header while precaching is
// not, so a `Vary: Origin` response would otherwise never match.
const MATCH_OPTIONS = { ignoreVary: true };

const NAVIGATION_TIMEOUT_MS = 4000;
const MAX_IMAGE_ENTRIES = 250;
const MAX_TILE_ENTRIES = 400;
const TILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const offlinePage = () => new Response(
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Offline — PLV NaviSync</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;background:#f6f8fc;color:#0d1b3e;text-align:center;box-sizing:border-box}.card{background:#fff;border-radius:1rem;padding:2.5rem;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.06)}img{width:64px;height:64px;margin-bottom:1rem}h1{font-size:1.25rem;font-weight:800;margin:0 0 .5rem}p{font-size:.875rem;color:#64748b;margin:0 0 1.5rem;line-height:1.5}.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.625rem 1.5rem;background:#0e2a6e;color:#fff;border:none;border-radius:.75rem;font-size:.875rem;font-weight:700;cursor:pointer}.btn:hover{background:#1a3a80}@media(prefers-color-scheme:dark){body{background:#0a0f1e;color:#e2e8f8}.card{background:#111827;border-color:rgba(255,255,255,0.08)}p{color:#94a3b8}}</style></head><body><div class="card"><img src="/icon-192x192.png" alt=""><h1>You're offline</h1><p>PLV NaviSync needs an internet connection to load campus maps and directions. Check your connection and try again.</p><button class="btn" onclick="location.reload()">Retry</button></div></body></html>`,
  { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
);

// ── Install: precache the app shell and its entry chunks ─────────────────
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHES.shell);
    // `cache: "reload"` bypasses the HTTP cache so the shell matches this build.
    await shell.addAll(SHELL_URLS.map((url) => new Request(url, { cache: "reload" })));
    if (BUILD_ASSETS.length) {
      const assets = await caches.open(CACHES.static);
      await assets.addAll(BUILD_ASSETS);
    }
    // Do not skipWaiting here. A page running the previous build may still
    // lazy-load chunks that only exist in the previous caches, and an editor
    // may hold unsaved work. The page asks for activation via SKIP_WAITING.
  })());
});

// ── Activate: drop caches from previous builds ───────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !KEEP_CACHES.has(key))
        .map((key) => caches.delete(key)),
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable().catch(() => {});
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  // Lets a page tell whether it already runs this build (navigations are
  // network-first, so it usually does) and can skip the update prompt.
  if (event.data?.type === "GET_BUILD_ASSETS") event.ports[0]?.postMessage(BUILD_ASSETS);
});

// ── Request classification ───────────────────────────────────────────────
const isSupabaseApiRequest = (url) =>
  /(^|\.)supabase\.(co|in|com)$/i.test(url.hostname)
  && /^\/(auth|rest|storage|functions|realtime)\/v1\//i.test(url.pathname);
const mustBypassCache = (request, url) =>
  request.headers.has("authorization") || request.headers.has("cookie") || isSupabaseApiRequest(url);
// Vite dev modules must never be served from cache (the worker is not
// registered in dev, but a stale production worker could still be present).
const isViteDevAsset = (url) =>
  url.pathname.startsWith("/@") || url.pathname.startsWith("/src/") || url.pathname.startsWith("/node_modules/");
const isHashedAsset = (url) => url.pathname.startsWith("/assets/");
const isStaticCode = (url) => /\.(m?js|css)$/i.test(url.pathname);
const isImageOrFont = (url) => /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i.test(url.pathname);
const isMapTile = (url) => /(^|\.)tile\.openstreetmap\.org$/i.test(url.hostname) || /tiles?\./i.test(url.hostname);
const isCdnAsset = (url) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/i.test(url.hostname);

// Vercel rewrites unknown paths to index.html, so a missing chunk can come
// back as `200 text/html`. Never store HTML under a script/style/image key.
function isCacheableResponse(response, expectHtml) {
  if (!response || !response.ok) return false;
  if (response.type !== "basic" && response.type !== "cors") return false;
  const isHtml = (response.headers.get("Content-Type") || "").includes("text/html");
  return expectHtml ? isHtml : !isHtml;
}

async function putWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", String(Date.now()));
  const body = await response.blob();
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

// ── Strategies ───────────────────────────────────────────────────────────
async function handleNavigation(event) {
  const cache = await caches.open(CACHES.shell);
  const network = (async () => {
    const preloaded = await event.preloadResponse;
    const response = preloaded || await fetch(event.request);
    if (isCacheableResponse(response, true)) {
      cache.put(APP_SHELL_URL, response.clone()).catch(() => {});
    }
    return response;
  })();
  // Keep the browser from logging an unhandled rejection when we time out.
  network.catch(() => {});

  const timeout = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS, null));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    // Network failed; fall through to the cached shell.
  }
  const cached = await cache.match(APP_SHELL_URL, MATCH_OPTIONS);
  if (cached) return cached;
  // Slow network with nothing cached yet: keep waiting for the network.
  return network.catch(offlinePage);
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, MATCH_OPTIONS);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response, false)) {
    await cache.put(request, response.clone()).catch(() => {});
    if (maxEntries) trimCache(cacheName, maxEntries).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(event, cacheName, { maxAgeMs, maxEntries } = {}) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, MATCH_OPTIONS);
  const refresh = fetch(request).then(async (response) => {
    if (isCacheableResponse(response, false)) {
      await putWithTimestamp(cache, request, response.clone());
      if (maxEntries) await trimCache(cacheName, maxEntries);
    }
    return response;
  });

  if (cached) {
    const cachedAt = Number(cached.headers.get("sw-cached-at") || 0);
    const fresh = !maxAgeMs || Date.now() - cachedAt < maxAgeMs;
    event.waitUntil(refresh.catch(() => {}));
    if (fresh) return cached;
    return refresh.catch(() => cached);
  }
  return refresh;
}

// ── Fetch routing ────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  // Account-scoped data must never enter CacheStorage; let the browser handle it.
  if (mustBypassCache(request, url)) return;

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && isViteDevAsset(url)) return;

  if (request.mode === "navigate" && sameOrigin) {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (sameOrigin && isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, CACHES.static));
    return;
  }

  if (sameOrigin && (url.pathname === "/manifest.json" || isStaticCode(url))) {
    event.respondWith(staleWhileRevalidate(event, CACHES.shell));
    return;
  }

  if (isMapTile(url)) {
    event.respondWith(staleWhileRevalidate(event, CACHES.tiles, { maxAgeMs: TILE_MAX_AGE_MS, maxEntries: MAX_TILE_ENTRIES }));
    return;
  }

  // Unhashed public files (icons, logos) can change between deploys, so
  // refresh them in the background; CDN fonts are versioned by URL.
  if (sameOrigin && isImageOrFont(url)) {
    event.respondWith(staleWhileRevalidate(event, CACHES.images, { maxEntries: MAX_IMAGE_ENTRIES }));
    return;
  }

  if (isCdnAsset(url) && isImageOrFont(url)) {
    event.respondWith(cacheFirst(request, CACHES.images, MAX_IMAGE_ENTRIES));
    return;
  }

  if (isCdnAsset(url)) {
    event.respondWith(cacheFirst(request, CACHES.static));
    return;
  }
  // Everything else goes straight to the network without interception.
});

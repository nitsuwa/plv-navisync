// PLV NaviSync — Service Worker v1.1
// Improved caching: stale-while-revalidate for navigation, cache-first for
// static assets, network-first for API calls, and an offline fallback page.

const VERSION = "v1.1";
const CACHE_PREFIX = "plv-navisync";
const CACHE = `${CACHE_PREFIX}-${VERSION}`;

// Named cache buckets for different resource types
const CACHES = {
  static: `${CACHE}-static`,
  navigation: `${CACHE}-nav`,
  images: `${CACHE}-images`,
  api: `${CACHE}-api`,
  offline: `${CACHE}-offline`,
};

// URLs to pre-cache during install
const PRECACHE_URLS = [
  "/",
  "/map",
  "/buildings",
  "/announcements",
  "/help",
  "/my-day",
  "/student",
  "/admin",
  "/admin-dashboard",
  "/admin-dashboard/map-builder",
];

// Offline fallback page (inline HTML — no external dependency)
const OFFLINE_PAGE = new Response(
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — PLV NaviSync</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;background:#f6f8fc;color:#0d1b3e;text-align:center}.card{background:#fff;border-radius:1rem;padding:2.5rem;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.06)}svg{width:48px;height:48px;color:#0e2a6e;margin-bottom:1rem}h1{font-size:1.25rem;font-weight:800;margin:0 0 .5rem}p{font-size:.875rem;color:#64748b;margin:0 0 1.5rem;line-height:1.5}.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.625rem 1.5rem;background:#0e2a6e;color:#fff;border:none;border-radius:.75rem;font-size:.875rem;font-weight:700;cursor:pointer;text-decoration:none}.btn:hover{background:#1a3a80}@media(prefers-color-scheme:dark){body{background:#0a0f1e;color:#e2e8f8}.card{background:#111827;border-color:rgba(255,255,255,0.08)}p{color:#94a3b8}}</style></head><body><div class="card"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5-4 8-10 12C6 20 2 17 2 12A10 10 0 0 1 12 2z"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="16" y1="10" x2="12" y2="12"/></svg><h1>You're Offline</h1><p>PLV NaviSync needs an internet connection to show campus maps and directions. Please check your connection and try again.</p><button class="btn" onclick="location.reload()">Retry Connection</button></div></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } }
);

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Pre-cache key navigation routes
      const cache = await caches.open(CACHES.navigation);
      await cache.addAll(PRECACHE_URLS).catch(() => {
        // Individual URL failures are non-fatal — precache what we can
      });
      self.skipWaiting();
    })()
  );
});

// ── Activate — clean up old caches ────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE && !Object.values(CACHES).includes(k))
          .map((k) => caches.delete(k))
      );
      // Take control of all clients immediately
      await self.clients.claim();
    })()
  );
});

// ── Helper: should this request be cached? ────────────────────────────────
const isGET = (r) => r.method === "GET";
const isHTML = (r) => r.headers.get("Accept")?.includes("text/html");
const isNavigation = (r) => r.mode === "navigate";
const isStaticAsset = (r) => {
  const url = new URL(r.url);
  return /\.(js|css|woff2?|ttf|eot)$/i.test(url.pathname);
};
const isImage = (r) => {
  const url = new URL(r.url);
  return /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/i.test(url.pathname);
};
const isFont = (r) => {
  const url = new URL(r.url);
  return /\.(woff2?|ttf|eot)$/i.test(url.pathname);
};
const isMapTile = (r) => {
  const url = new URL(r.url);
  return url.href.includes("tile.openstreetmap") || url.href.includes("leaflet");
};
const isSameOrigin = (r) => {
  try {
    return new URL(r.url).origin === self.location.origin;
  } catch {
    return false;
  }
};

// ── Cache strategies ──────────────────────────────────────────────────────

/** Stale-while-revalidate: serve from cache, update in background */
async function staleWhileRevalidate(request, cacheName, maxAgeMs) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const url = new URL(request.url);

  // Serve cached response immediately if it's fresh enough
  if (cached) {
    if (maxAgeMs) {
      const cachedTime = new Date(cached.headers.get("sw-cached-at") || 0).getTime();
      const age = Date.now() - cachedTime;
      if (age < maxAgeMs) {
        // Revalidate in background
        fetchAndCache(request, cache).catch(() => {});
        return cached;
      }
    } else {
      // Serve cache, update in background
      fetchAndCache(request, cache).catch(() => {});
      return cached;
    }
  }

  // No cache — fetch from network
  try {
    const response = await fetchAndCache(request, cache);
    return response;
  } catch {
    return cached || null;
  }
}

/** Cache-first: use cache, fall back to network */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    return await fetchAndCache(request, cache);
  } catch {
    return null;
  }
}

/** Network-first: try network, fall back to cache */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchAndCache(request, cache);
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || null;
  }
}

/** Fetch and optionally cache the response */
async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  // Cache same-origin (basic) and CORS (cors) responses.
  // Opaque responses (type: "opaque") are intentionally skipped since
  // they carry no usable response body for the cache.
  if (response.ok && (response.type === "basic" || response.type === "cors")) {
    const cloned = response.clone();
    // Tag with cached-at timestamp for TTL logic
    const headers = new Headers(cloned.headers);
    headers.append("sw-cached-at", Date.now().toString());
    const cachedResponse = new Response(cloned.body, {
      status: cloned.status,
      statusText: cloned.statusText,
      headers,
    });
    // Avoid caching oversized responses (> 5 MB)
    const contentLength = parseInt(cloned.headers.get("Content-Length") || "0", 10);
    if (contentLength < 5_000_000) {
      cache.put(request, cachedResponse).catch(() => {});
    }
  }
  return response;
}

// ── Fetch handler ─────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isGET(request)) return;

  const url = new URL(request.url);

  // Skip browser extension requests
  if (url.protocol === "chrome-extension:") return;

  // ── HTML / navigation requests ─────────────────────────────────────
  // Stale-while-revalidate with 2-minute TTL for fast subsequent loads
  if (isSameOrigin(request) && (isNavigation(request) || isHTML(request))) {
    event.respondWith(
      staleWhileRevalidate(request, CACHES.navigation, 2 * 60 * 1000).catch(
        () => caches.match(request).then((c) => c || OFFLINE_PAGE.clone())
      )
    );
    return;
  }

  // ── Static JS/CSS assets ───────────────────────────────────────────
  // Cache-first: these change only on deploy, so disk cache is ideal
  if (isSameOrigin(request) && isStaticAsset(request)) {
    event.respondWith(
      cacheFirst(request, CACHES.static).catch(
        () => fetch(request)
      )
    );
    return;
  }

  // ── Images and icons ───────────────────────────────────────────────
  if (isImage(request) || isFont(request)) {
    event.respondWith(
      cacheFirst(request, CACHES.images).catch(
        () => fetch(request)
      )
    );
    return;
  }

  // ── Map tiles (OpenStreetMap) ──────────────────────────────────────
  // Stale-while-revalidate with 7-day TTL for map tiles
  if (isMapTile(request)) {
    event.respondWith(
      staleWhileRevalidate(request, CACHES.images, 7 * 24 * 60 * 60 * 1000).catch(
        () => caches.match(request)
      )
    );
    return;
  }

  // ── API requests (JSON) ────────────────────────────────────────────
  // Network-first with cache fallback for resilience
  if (isSameOrigin(request) && url.pathname.startsWith("/api/")) {
    event.respondWith(
      networkFirst(request, CACHES.api).catch(
        () => new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // ── Cross-origin (fonts, CDN libs, etc.) ───────────────────────────
  // Cache-first for cross-origin resources that are commonly referenced
  const crossOriginCacheable = /fonts\.googleapis|gstatic\.com|cdn\.jsdelivr/i.test(url.host);
  if (crossOriginCacheable) {
    event.respondWith(
      cacheFirst(request, CACHES.static).catch(() => fetch(request))
    );
    return;
  }

  // ── Default: network with cache fallback ───────────────────────────
  event.respondWith(
    networkFirst(request, CACHES.navigation).catch(
      () => caches.match(request).then((c) => c || OFFLINE_PAGE.clone())
    )
  );
});

// ── Message handler — notify clients about updates ────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Background Sync (placeholder — queue mechanism not yet active) ────────
// The sync event listener is registered so Chrome requests the permission
// and the service worker can replay queued requests when connectivity
// returns. A future enhancement should store failed POST/PUT request
// metadata (url, method, body) in a dedicated IndexedDB store on fetch
// failure and replay them here.
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-reports") {
    event.waitUntil(
      // Placeholder: replay queued reports when connectivity returns
      Promise.resolve()
    );
  }
});

// ── Periodic background sync (if supported) ───────────────────────────────
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "update-cache") {
    event.waitUntil(refreshCache());
  }
});

async function refreshCache() {
  // Refresh stale navigation caches
  const cache = await caches.open(CACHES.navigation);
  const requests = await cache.keys();
  await Promise.all(
    requests.map((r) =>
      fetch(r)
        .then((res) => res.ok && cache.put(r, res))
        .catch(() => {})
    )
  );
}

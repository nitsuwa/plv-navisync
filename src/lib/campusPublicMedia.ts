import { resolvePublishedCampusImageUrl } from "../services/campusService";

const CAMPUS_IMAGE_CACHE = "plv-campus-public-images-v1";
const MAX_CAMPUS_IMAGE_BYTES = 5 * 1024 * 1024;

function cacheKey(campusId: string, kind: "cover" | "logo", path: string): Request {
  const key = new URL(`/.well-known/plv-public-campus-image/${encodeURIComponent(campusId)}/${kind}`, window.location.origin);
  key.searchParams.set("path", path);
  return new Request(key.toString());
}

async function readCachedImage(key: Request): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const response = await (await caches.open(CAMPUS_IMAGE_CACHE)).match(key);
    if (!response?.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 && blob.size <= MAX_CAMPUS_IMAGE_BYTES ? blob : null;
  } catch { return null; }
}

/** Loads a published image using a fresh RLS-authorized URL, retaining only its bytes for offline use. */
export async function loadPublishedCampusImage(
  campusId: string,
  kind: "cover" | "logo",
  path: string | null | undefined,
  online = navigator.onLine,
): Promise<string | null> {
  if (!path) return null;
  const key = cacheKey(campusId, kind, path);
  if (online) {
    try {
      const freshUrl = await resolvePublishedCampusImageUrl(path);
      if (freshUrl) {
        const response = await fetch(freshUrl, { credentials: "omit", cache: "no-store" });
        const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
        if (response.status === 200 && response.ok && ["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
          const blob = await response.blob();
          if (blob.size > 0 && blob.size <= MAX_CAMPUS_IMAGE_BYTES) {
            if (typeof caches !== "undefined") {
              try {
                const cache = await caches.open(CAMPUS_IMAGE_CACHE);
                await cache.put(key, new Response(blob, { headers: { "Content-Type": contentType } }));
              } catch { /* Media remains usable for this session if cache storage is unavailable. */ }
            }
            return URL.createObjectURL(blob);
          }
        }
      }
    } catch { /* Preserve an existing local copy when refresh fails. */ }
  }
  const cached = await readCachedImage(key);
  return cached ? URL.createObjectURL(cached) : null;
}

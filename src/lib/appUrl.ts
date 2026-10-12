const configuredAppOrigin = import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined;

function normalizeOrigin(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function getAppOrigin(origin?: string): string {
  const candidate = origin?.trim()
    || configuredAppOrigin?.trim()
    || (typeof window !== "undefined" ? window.location.origin : "");
  return candidate ? normalizeOrigin(candidate) ?? candidate : "";
}

export function appUrl(path: string, origin?: string): string {
  const baseOrigin = getAppOrigin(origin);
  return baseOrigin ? new URL(path, baseOrigin).toString() : path;
}

export function campusPlaceDeepLink(placeId: string, campusId: string, origin = window.location.origin): string {
  const url = new URL("/map", origin);
  if (campusId) url.searchParams.set("campusId", campusId);
  url.searchParams.set("placeId", placeId);
  return url.toString();
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand?.("copy") ?? false;
  field.remove();
  if (!copied) throw new Error("Clipboard is unavailable");
}

export async function shareCampusPlaceLink(name: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `${name} · PLV NaviSync`, text: `${name} — PLV NaviSync`, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  await copyText(url);
  return "copied";
}

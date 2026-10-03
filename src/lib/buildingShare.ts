export function buildingMapDeepLink(campusId: string, buildingId: string, origin = window.location.origin): string {
  const url = new URL("/map", origin);
  url.searchParams.set("campusId", campusId);
  url.searchParams.set("buildingId", buildingId);
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

export function copyBuildingLink(url: string): Promise<void> {
  return copyText(url);
}

export async function shareBuildingLink({
  buildingName,
  url,
}: {
  buildingName: string;
  url: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: `${buildingName} · PLV NaviSync`,
        text: `${buildingName} — PLV NaviSync`,
        url,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // A rejected native share can happen when a browser exposes but cannot
      // complete the share surface. Fall through to the reliable copy action.
    }
  }

  await copyText(url);
  return "copied";
}

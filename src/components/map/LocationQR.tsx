import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, Link2, X } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { appUrl } from "../../lib/appUrl";

/**
 * Scannable QR deep link to a building or an individual room.
 */
export function LocationQR({
  buildingId,
  buildingName,
  campusId,
  roomId,
  roomName,
  floorId,
  floorNumber,
  displaySize = "compact",
  dialogClassName = "",
  locationId,
  onClose,
}: {
  buildingId: string;
  buildingName: string;
  campusId?: string;
  roomId?: string;
  roomName?: string;
  floorId?: string;
  floorNumber?: number;
  displaySize?: "compact" | "large";
  /** Responsive owner class for the shared portal when desktop and mobile
   * information panels are mounted together. */
  dialogClassName?: string;
  /** Allows the same viewer to represent an authored campus place such as a gate. */
  locationId?: string;
  onClose?: () => void;
}) {
  const toast = useToast();
  const locationName = roomName ?? buildingName;
  const qrRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  const url = useMemo(() => {
    // A room QR scopes the room ID to its building and floor, avoiding any
    // ambiguity if room identifiers are reused in another building.
    const params = new URLSearchParams({ locationId: locationId ?? roomId ?? buildingId });
    if (roomId) {
      params.set("locationType", "room");
      params.set("buildingId", buildingId);
      if (floorId) params.set("floorId", floorId);
      if (floorNumber !== undefined) params.set("floorNumber", String(floorNumber));
    }
    if (campusId) params.set("campusId", campusId);
    return appUrl(`/map?${params.toString()}`);
  }, [buildingId, campusId, floorId, floorNumber, locationId, roomId]);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const download = async () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    try {
      const source = new XMLSerializer().serializeToString(svg);
      const image = new Image();
      const imageUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("QR image could not be prepared"));
          image.src = imageUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png"));
        const downloadUrl = URL.createObjectURL(png);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = `${locationName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plv-location"}-qr.png`;
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    } catch {
      toast.error("Could not download QR", { description: "Please try again or copy the location link." });
    }
  };

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: `Opening it sets ${locationName} as your current location.` });
    } catch {
      toast.error("Could not copy", { description: "Clipboard access denied." });
    }
  };

  if (displaySize === "large") return open ? createPortal(
    <div className={`fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-3 pt-[max(.75rem,env(safe-area-inset-top,0px))] pb-[max(.75rem,env(safe-area-inset-bottom,0px))] sm:p-4 ${dialogClassName}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="location-qr-dialog-title" className="flex max-h-full w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl" style={{ WebkitOverflowScrolling: "touch" }}>
        <header className="mb-3 flex shrink-0 items-start gap-3">
          <div className="min-w-0 flex-1"><h2 id="location-qr-dialog-title" className="truncate text-sm font-extrabold">Location QR</h2><p className="mt-1 truncate text-[11px] text-muted-foreground">{locationName}</p></div>
          <button type="button" onClick={close} aria-label="Close location QR" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
        </header>
        <p className="mb-3 text-center text-xs text-muted-foreground">Scan to open this location in PLV NaviSync.</p>
        <div ref={qrRef} className="mx-auto w-full max-w-[min(76vw,22rem)] rounded-xl bg-white p-2 shadow-sm"><QRCodeSVG value={url} size={512} className="block h-auto w-full" level="M" marginSize={2} fgColor="#0f172a" bgColor="#ffffff" aria-label={`QR code for ${locationName}`} /></div>
        <div className="mt-3 flex shrink-0 flex-wrap justify-center gap-2">
          <button type="button" onClick={() => void download()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Download className="h-4 w-4" />Download QR</button>
          <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Link2 className="h-4 w-4" />Copy link</button>
        </div>
      </section>
    </div>, document.body,
  ) : null;

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="rounded-xl bg-white p-2.5 shadow-sm">
        <QRCodeSVG
          value={url}
          size={132}
          level="M"
          marginSize={1}
          fgColor="#0f172a"
          bgColor="#ffffff"
          aria-label={`QR code for ${locationName}`}
        />
      </div>
      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <Link2 className="h-3 w-3" /> Copy link
      </button>
      <p className="text-[10px] text-muted-foreground text-center">
        Scan to set {locationName} as your current location
      </p>
    </div>
  );
}

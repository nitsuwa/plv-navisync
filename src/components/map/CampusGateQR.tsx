import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link2, QrCode } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import type { CampusMarker } from "../map-builder/types";

interface CampusGateQRProps {
  gate: CampusMarker;
  campusId?: string;
  locationId: string;
}

export function CampusGateQR({ gate, campusId, locationId }: CampusGateQRProps) {
  const toast = useToast();
  const url = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({ locationId });
    if (campusId) params.set("campusId", campusId);
    return `${origin}/map?${params.toString()}`;
  }, [campusId, locationId]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast.success("Gate link copied", { description: `Opening it sets ${gate.name || "this gate"} as your starting point.` });
    } catch {
      toast.error("Could not copy gate link", { description: "Clipboard access is unavailable." });
    }
  };

  return (
    <section aria-label={`${gate.name || "Campus gate"} QR code`} className="rounded-2xl border border-border bg-muted/25 p-3 text-center">
      <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-extrabold text-foreground">
        <QrCode className="h-3.5 w-3.5 text-primary" /> Gate location QR
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Scan to set {gate.name || "this gate"} as your route starting point.
      </p>
      <div className="mx-auto w-fit rounded-xl bg-white p-2.5 shadow-sm">
        <QRCodeSVG
          value={url}
          size={148}
          level="M"
          marginSize={1}
          fgColor="#0f172a"
          bgColor="#ffffff"
          aria-label={`QR code for ${gate.name || "campus gate"}`}
        />
      </div>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Link2 className="h-3 w-3" /> Copy gate link
      </button>
    </section>
  );
}

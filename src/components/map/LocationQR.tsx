import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link2 } from "lucide-react";
import { useToast } from "../../hooks/useToast";

/**
 * Real, scannable QR code that encodes a deep link to a campus location:
 *   /map?buildingId=<id>
 * Scanning it on another phone opens the interactive map at that building.
 */
export function LocationQR({
  buildingId,
  buildingName,
}: {
  buildingId: string;
  buildingName: string;
}) {
  const toast = useToast();

  const url = useMemo(() => {
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname === "/map" ? "" : ""}`
        : "";
    // Always point to the map route regardless of the current page.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/map?buildingId=${encodeURIComponent(buildingId)}`;
  }, [buildingId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(url);
      toast.success("Link copied", "Share this link to open the location.");
    } catch {
      toast.error("Could not copy", "Clipboard access denied.");
    }
  };

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
          aria-label={`QR code for ${buildingName}`}
        />
      </div>
      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <Link2 className="h-3 w-3" /> Copy link
      </button>
      <p className="text-[10px] text-muted-foreground text-center">
        Scan to open {buildingName} on the campus map
      </p>
    </div>
  );
}

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
  campusId,
}: {
  buildingId: string;
  buildingName: string;
  campusId?: string;
}) {
  const toast = useToast();

  const url = useMemo(() => {
    // A location QR sets this published campus position as the student's route origin.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({ locationId: buildingId });
    if (campusId) params.set("campusId", campusId);
    return `${origin}/map?${params.toString()}`;
  }, [buildingId, campusId]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Opening it sets this place as the route starting point." });
    } catch {
      toast.error("Could not copy", { description: "Clipboard access denied." });
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
        Scan to set {buildingName} as your current location
      </p>
    </div>
  );
}

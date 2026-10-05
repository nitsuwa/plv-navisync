import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link2 } from "lucide-react";
import { useToast } from "../../hooks/useToast";

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
}: {
  buildingId: string;
  buildingName: string;
  campusId?: string;
  roomId?: string;
  roomName?: string;
  floorId?: string;
  floorNumber?: number;
  displaySize?: "compact" | "large";
}) {
  const toast = useToast();
  const locationName = roomName ?? buildingName;

  const url = useMemo(() => {
    // A room QR scopes the room ID to its building and floor, avoiding any
    // ambiguity if room identifiers are reused in another building.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({ locationId: roomId ?? buildingId });
    if (roomId) {
      params.set("locationType", "room");
      params.set("buildingId", buildingId);
      if (floorId) params.set("floorId", floorId);
      if (floorNumber !== undefined) params.set("floorNumber", String(floorNumber));
    }
    if (campusId) params.set("campusId", campusId);
    return `${origin}/map?${params.toString()}`;
  }, [buildingId, campusId, floorId, floorNumber, roomId]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: `Opening it sets ${locationName} as your current location.` });
    } catch {
      toast.error("Could not copy", { description: "Clipboard access denied." });
    }
  };

  return (
    <div className={displaySize === "large" ? "flex w-full flex-col items-center gap-1.5" : "flex flex-col items-center gap-2.5"}>
      <div className={displaySize === "large" ? "w-full rounded-xl bg-white p-2 shadow-sm" : "rounded-xl bg-white p-2.5 shadow-sm"}>
        <QRCodeSVG
          value={url}
          size={displaySize === "large" ? 320 : 132}
          className={displaySize === "large" ? "block h-auto w-full" : undefined}
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

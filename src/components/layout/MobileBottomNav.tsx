import { Map } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "../../lib/utils";
import { MAP_SURFACE_EVENT, isFocusedMapSurface, type MapSurface } from "../../lib/mapSurface";

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onLegacySheet = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setSheetOpen(Boolean(detail?.open));
    };
    const onSurface = (event: Event) => {
      const detail = (event as CustomEvent<{ surface?: MapSurface; open?: boolean }>).detail;
      setSheetOpen(detail?.surface ? isFocusedMapSurface(detail.surface) : Boolean(detail?.open));
    };
    window.addEventListener("building-sheet-toggle", onLegacySheet);
    window.addEventListener(MAP_SURFACE_EVENT, onSurface);
    return () => {
      window.removeEventListener("building-sheet-toggle", onLegacySheet);
      window.removeEventListener(MAP_SURFACE_EVENT, onSurface);
    };
  }, []);

  if (sheetOpen) return null;

  const isMapActive = pathname.startsWith("/map");

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
      aria-label="Mobile navigation"
    >
      <div className="flex justify-center px-4 pointer-events-auto">
        <Link
          to="/map"
          aria-current={isMapActive ? "page" : undefined}
          title="Map"
          className={cn(
            "mobile-dock flex min-h-14 min-w-[104px] flex-col items-center justify-center gap-1 rounded-2xl border px-5 text-[11px] font-bold leading-none shadow-xl backdrop-blur-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95",
            isMapActive
              ? "border-primary/30 bg-primary text-primary-foreground shadow-primary/20"
              : "border-border/50 bg-card/95 text-primary hover:bg-muted",
          )}
        >
          <Map className="h-5 w-5" strokeWidth={2.4} />
          <span>Map</span>
        </Link>
      </div>
    </nav>
  );
}

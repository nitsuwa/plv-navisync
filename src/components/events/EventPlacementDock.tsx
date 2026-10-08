import type { ReactNode } from "react";
import { LayoutTemplate, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { CanvasAssetPalette } from "../canvas/CanvasAssetPalette";
import type { CanvasAssetDescriptor } from "../canvas/canvasAssetCatalog";

export interface EventPlacementDockProps {
  activeAssetKey: string | null;
  disabled: boolean;
  repeatPlacement: boolean;
  placementActive: boolean;
  touchPlacementReady: boolean;
  canPlace: boolean;
  layoutsOpen: boolean;
  layoutPreviewActive?: boolean;
  catalogOpen?: boolean;
  onSelectAsset: (asset: CanvasAssetDescriptor) => void;
  onCatalogOpenChange?: (open: boolean) => void;
  onRepeatPlacementChange: (repeat: boolean) => void;
  onOpenLayouts: () => void;
  onCloseLayouts: () => void;
  onCancelPlacement: () => void;
  onPlaceHere: () => void;
  children?: ReactNode;
  className?: string;
}

/** Event-only placement controls. The dock communicates intent and never edits the canvas itself. */
export function EventPlacementDock({
  activeAssetKey,
  disabled,
  repeatPlacement,
  placementActive,
  touchPlacementReady,
  canPlace,
  layoutsOpen,
  layoutPreviewActive = false,
  catalogOpen,
  onSelectAsset,
  onCatalogOpenChange,
  onRepeatPlacementChange,
  onOpenLayouts,
  onCloseLayouts,
  onCancelPlacement,
  onPlaceHere,
  children,
  className,
}: EventPlacementDockProps) {
  return (
    <section
      data-testid="event-placement-dock"
      data-event-editor-chrome
      aria-label="Event placement tools"
      className={cn("relative w-[min(31rem,calc(100vw-1.5rem))] max-w-full rounded-2xl border border-border bg-card p-2 shadow-md", className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {!layoutPreviewActive && <CanvasAssetPalette
        surface="event"
        activeKey={activeAssetKey}
        onSelect={onSelectAsset}
        compact
        floating
        embedded
        open={catalogOpen}
        onOpenChange={onCatalogOpenChange}
        disabled={disabled}
      />}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border/70 pt-2">
        {!layoutPreviewActive && <><button
          type="button"
          data-event-tour="arrange"
          aria-label={layoutsOpen ? "Close layouts" : "Open layouts"}
          aria-expanded={layoutsOpen}
          onClick={layoutsOpen ? onCloseLayouts : onOpenLayouts}
          disabled={disabled}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
            layoutsOpen ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
          Layouts
        </button>
        <button
          type="button"
          role="switch"
          aria-label="Place multiple"
          aria-checked={repeatPlacement}
          disabled={disabled}
          onClick={() => onRepeatPlacementChange(!repeatPlacement)}
          className="flex min-h-11 shrink-0 items-center gap-3 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <span>Place multiple</span>
          <span aria-hidden="true" className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", repeatPlacement ? "bg-primary" : "bg-muted-foreground/40")}>
            <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none", repeatPlacement ? "translate-x-4" : "translate-x-0")} />
          </span>
        </button>
        </>}
        {placementActive && (
          <button
            type="button"
            aria-label="Cancel placement"
            disabled={disabled}
            onClick={onCancelPlacement}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </button>
        )}
        {touchPlacementReady && (
          <button
            type="button"
            aria-label="Place here"
            disabled={disabled || !canPlace}
            onClick={onPlaceHere}
            className="flex min-h-11 shrink-0 items-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Place here
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

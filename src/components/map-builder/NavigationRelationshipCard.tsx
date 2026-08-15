import { Navigation, Unlink } from "lucide-react";

type PhysicalType = "room" | "door" | "stairs" | "elevator" | "ramp";

interface NavigationRelationshipCardProps {
  /** Whether the physical object is currently linked to a navigation node */
  linked: boolean;
  /** Detail text shown below the status */
  detail?: string;
  /** Optional group/circulation label */
  groupLabel?: string;
  /** Title for the group label (e.g. "Stair Connection", "Elevator Shaft") */
  title?: string;
  /** Current editor mode — affects View button label */
  mode: "design" | "navigation";
  /** Called when user clicks View in Navigation / View Linked Node */
  onView: () => void;
  /** Called when user clicks Add to Navigation (only for unlinked) */
  onAdd: () => void;
  /** Called when user clicks Remove from Navigation (only for linked) */
  onRemove: () => void;
  /** Connection count for the linked node */
  connectionCount?: number;
}

/**
 * B5 Phase 6.7: Shared navigation relationship card — pixel-identical between
 * Design mode (FloorPropertiesPanel) and Navigation mode (PhysicalNavPropertiesPanel).
 * One component = one implementation = guaranteed visual parity.
 */
export function NavigationRelationshipCard({
  linked,
  detail,
  groupLabel,
  title,
  mode,
  onView,
  onAdd,
  onRemove,
  connectionCount,
}: NavigationRelationshipCardProps) {
  return (
    <div data-testid="navigation-relationship-card" className="pt-3 border-t border-border space-y-2">
      <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
        Navigation
      </span>
      {linked ? (
        <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-900/10 px-3 py-3 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <span className="h-5 w-5 rounded-full bg-emerald-500/12 flex items-center justify-center">
                <Navigation className="h-3.5 w-3.5 shrink-0" />
              </span>
              Linked
            </div>
          </div>
          {/* Detail + group info */}
          <div className="space-y-1.5">
            {detail && (
              <p className="text-[10px] leading-snug text-emerald-700/80 dark:text-emerald-300/80">
                {detail}
              </p>
            )}
            {groupLabel && title && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                {title}: {groupLabel}
              </p>
            )}
            {connectionCount !== undefined && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Connections: {connectionCount}
              </p>
            )}
          </div>
          {/* Actions */}
          <div className="grid grid-cols-1 gap-2 pt-1">
            <button
              type="button"
              onClick={onView}
              className="h-8 rounded-lg border border-emerald-300/70 dark:border-emerald-700/50 bg-background/60 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all flex items-center justify-center gap-1.5"
            >
              <Navigation className="h-3 w-3" />{" "}
              {mode === "navigation" ? "View Linked Node" : "View in Navigation"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="h-8 rounded-lg border border-destructive/30 bg-background/60 text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-all flex items-center justify-center gap-1.5"
            >
              <Unlink className="h-3 w-3" /> Remove from Navigation
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
            <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
              <Navigation className="h-3.5 w-3.5 shrink-0" />
            </span>
            Not linked
          </div>
          {detail && (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {detail}
            </p>
          )}
          <button
            type="button"
            onClick={onAdd}
            className="w-full h-9 rounded-xl border border-emerald-300 dark:border-emerald-700/40 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all flex items-center justify-center gap-1.5"
          >
            <Navigation className="h-3 w-3" /> Add to Navigation
          </button>
        </>
      )}
    </div>
  );
}

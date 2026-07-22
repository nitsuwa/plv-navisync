import { motion } from "motion/react";
import {
  Route, Trash2, Navigation, MapPin, Plus,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { CampusRoute, RouteType } from "./types";

interface RoutesPanelProps {
  routes: CampusRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  onDeleteRoute: (id: string) => void;
  onUpdateRoute: (id: string, changes: Partial<CampusRoute>) => void;
}

const ROUTE_TYPE_COLORS: Record<RouteType, { color: string; bg: string }> = {
  walking:    { color: "text-green-600 dark:text-green-400",    bg: "bg-green-50 dark:bg-green-900/20" },
  accessible: { color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-900/20" },
  emergency:  { color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-900/20" },
};

const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  walking:    "Walking",
  accessible: "Accessible",
  emergency:  "Emergency",
};

export function RoutesPanel({
  routes, selectedRouteId, onSelectRoute, onDeleteRoute, onUpdateRoute,
}: RoutesPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className="w-56 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
    >
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
          Routes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-1.5">
        {routes.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Navigation className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">No routes yet</p>
            <p className="text-[9px] text-muted-foreground/60 mt-1">
              Switch to the Path tool to draw routes between buildings
            </p>
          </div>
        ) : (
          routes.map((r) => {
            const colors = ROUTE_TYPE_COLORS[r.type];
            return (
              <div
                key={r.id}
                onClick={() => onSelectRoute(r.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer group hover:bg-muted/50 transition-colors",
                  selectedRouteId === r.id ? "bg-primary/8 text-primary" : ""
                )}
              >
                <Route className={cn("h-3.5 w-3.5 shrink-0", colors.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate text-foreground">
                      {r.name || "Unnamed Route"}
                    </span>
                    <span className={cn(
                      "text-[8px] font-bold px-1 py-0.5 rounded-full shrink-0",
                      colors.bg, colors.color
                    )}>
                      {ROUTE_TYPE_LABELS[r.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                    <span>{r.distanceM}m</span>
                    <span>·</span>
                    <span>{r.durationMin} min</span>
                    <span>·</span>
                    <span>{r.waypoints.length} pts</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteRoute(r.id); }}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                  title="Delete route"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

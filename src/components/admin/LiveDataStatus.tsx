import { RefreshCw, Radio } from "lucide-react";
import { cn } from "../../lib/utils";

interface LiveDataStatusProps {
  connected: boolean;
  refreshing: boolean;
  lastUpdatedAt: Date | null;
  onRefresh: () => void;
}

export function LiveDataStatus({ connected, refreshing, lastUpdatedAt, onRefresh }: LiveDataStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
          connected
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
        title={lastUpdatedAt ? `Last refreshed ${lastUpdatedAt.toLocaleTimeString()}` : undefined}
      >
        <Radio className={cn("h-3 w-3", connected && "animate-pulse")} />
        {connected ? "Live" : "Connecting"}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh database data"
        title="Refresh database data"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
      </button>
    </div>
  );
}


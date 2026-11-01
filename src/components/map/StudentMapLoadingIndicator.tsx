import { MapPin } from "lucide-react";

interface StudentMapLoadingIndicatorProps {
  label?: string;
}

/** Compact, theme-aware loading status used while the Student Map prepares a scene. */
export function StudentMapLoadingIndicator({ label = "Preparing your map" }: StudentMapLoadingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-testid="student-map-loading-indicator"
      className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-4 py-2.5 text-foreground shadow-sm backdrop-blur-sm"
    >
      <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary motion-safe:animate-spin motion-reduce:animate-none" />
        <MapPin className="h-4 w-4 text-primary" strokeWidth={2.25} />
      </span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}

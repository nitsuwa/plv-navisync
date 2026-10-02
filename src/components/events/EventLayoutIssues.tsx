import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { LayoutWarning } from "../../lib/eventLayoutValidation";

interface EventLayoutIssuesProps {
  warnings: readonly LayoutWarning[];
  onFocusItems: (ids: string[]) => void;
  disabled?: boolean;
}

const severityLabel: Record<LayoutWarning["severity"], string> = {
  critical: "Needs attention",
  warning: "Review",
  info: "Design hint",
};

function warningDescription(warning: LayoutWarning) {
  if (warning.code === "narrow-aisle") {
    return "Items are close together; review walking space. Uses a 12 map-unit spacing heuristic, not a physical-distance measurement.";
  }
  return warning.message;
}

export function EventLayoutIssues({ warnings, onFocusItems, disabled = false }: EventLayoutIssuesProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const count = warnings.length;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !(event.target as Element).closest(`[data-event-layout-issues="${panelId}"]`)) setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open, panelId]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      buttonRef.current?.blur();
    }
  }, [disabled, open]);

  return (
    <div
      data-testid="event-layout-warnings"
      data-event-tour="layout-checks"
      data-event-editor-chrome
      data-event-layout-issues={panelId}
      className="relative z-50 h-9 shrink-0 border-b border-border/70 bg-card/95 px-3 sm:px-4"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full items-center justify-between gap-2 text-[10px]">
        <div className="flex min-w-0 items-center gap-2">
          {count > 0 ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
          <span className="truncate font-extrabold text-foreground">
            {count === 0 ? "Layout checks" : `${count} layout issue${count === 1 ? "" : "s"}`}
          </span>
          {count > 0 && <span className="hidden truncate text-muted-foreground sm:inline">Review before submitting</span>}
        </div>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={count === 0 ? "Open layout checks" : `Open ${count} layout issue${count === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className={cn("flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 font-extrabold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50", open && "bg-primary/10")}
        >
          {count > 0 ? "Review" : "View checks"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Layout checks"
          data-event-layout-issues={panelId}
          className="absolute left-3 right-3 top-[calc(100%+0.5rem)] max-h-64 overflow-y-auto rounded-2xl border border-border/80 bg-card p-3 shadow-2xl sm:left-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))]"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-foreground">Layout checks</p>
            <button type="button" aria-label="Close layout checks" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {count === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-4">No placement checks need attention on this map.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {warnings.map((warning, index) => (
                <div key={`${warning.code}-${warning.itemIds.join("-")}-${index}`} className="rounded-xl border border-border/70 bg-background/70 p-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-amber-700">{severityLabel[warning.severity]}</p>
                      <p className="mt-0.5 text-[11px] font-semibold leading-4 text-foreground">{warningDescription(warning)}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Show items for issue ${index + 1}`}
                      onClick={() => {
                        onFocusItems([...new Set(warning.itemIds)]);
                        setOpen(false);
                        buttonRef.current?.focus();
                      }}
                      className="shrink-0 rounded-lg border border-border/70 px-2 py-1.5 text-[10px] font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Show items
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

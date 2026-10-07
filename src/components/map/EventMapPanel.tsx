import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, ChevronUp, MapPin, RotateCw, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { formatEventDate } from "../../lib/eventPublication";
import { visibleEventCards } from "../../lib/eventMapView";
import type { EventMapFilter, PublicEventPreview } from "../../types/eventPreview";

type SheetPosition = "peek" | "list" | "expanded";

export interface EventMapPanelProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  events: PublicEventPreview[];
  nowMs: number;
  filter: EventMapFilter;
  selectedEventId: string | null;
  selectedLocationId: string | null;
  onClose: () => void;
  onRetry: () => void;
  onFilterChange: (filter: EventMapFilter) => void;
  onSelectEvent: (eventId: string) => void;
  onViewLocation: (eventId: string, locationId: string) => void;
  onBackToEvents: () => void;
}

const filterLabels: Array<{ id: EventMapFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "ongoing", label: "Ongoing" }, { id: "upcoming", label: "Upcoming" },
];

export function EventMapPanel(props: EventMapPanelProps) {
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>("list");
  const bodyRef = useRef<HTMLDivElement>(null);
  const selected = props.events.find((event) => event.id === props.selectedEventId) ?? null;
  const viewing = selected?.locations.find(location => location.id === props.selectedLocationId);
  const cards = useMemo(() => visibleEventCards(props.events, props.nowMs, props.filter), [props.events, props.nowMs, props.filter]);

  useEffect(() => {
    setSheetPosition(props.open && props.selectedEventId ? (props.selectedLocationId ? "peek" : "expanded") : "list");
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [props.open, props.selectedEventId, props.selectedLocationId]);

  if (!props.open) return null;

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
  };
  const moveSheet = () => setSheetPosition((current) => current === "peek" ? "list" : current === "list" ? "expanded" : "peek");
  const nextSheetLabel = sheetPosition === "peek" ? "Show event list" : sheetPosition === "expanded" ? "Collapse event panel" : "Expand event panel";
  const sheetMaxHeight = sheetPosition === "peek" ? "8rem" : sheetPosition === "expanded" ? "72dvh" : "52dvh";

  return (
    <section
      aria-label="Campus events"
      aria-live="polite"
      data-no-drag
      data-testid="event-map-panel"
      data-map-layer="building-sheet"
      className={cn(
        "map-layer-building-sheet absolute flex min-h-0 flex-col overflow-hidden border border-border bg-card/95 text-card-foreground shadow-xl backdrop-blur-xl",
        "left-3 right-3 bottom-[var(--student-map-utility-bottom,1rem)] h-auto max-h-[min(var(--event-sheet-max-height),calc(100%-1rem))] rounded-2xl md:left-4 md:right-auto md:top-4 md:bottom-auto md:max-h-[calc(100%-2rem)] md:w-[min(360px,calc(100%-2rem))]",
      )}
      style={{ "--event-sheet-max-height": sheetMaxHeight } as CSSProperties}
      onKeyDownCapture={onKeyDownCapture}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 md:px-4">
        {selected ? (
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Back to events" onClick={props.onBackToEvents}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>}
        <div className="min-w-0 flex-1">
          <h2 className={cn("break-words text-sm font-extrabold leading-snug", sheetPosition === "peek" && "max-md:line-clamp-2")}>{selected?.title ?? "Campus events"}</h2>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected ? viewing?.locationRef.label || "Event map preview" : `${cards.length} ${props.filter === "all" ? "published" : props.filter} event${cards.length === 1 ? "" : "s"}`}</p>
        </div>
        <button type="button" onClick={moveSheet} className="hidden min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted max-md:inline-flex" aria-label={nextSheetLabel}>
          {sheetPosition === "expanded" ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        <button type="button" onClick={props.onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Close campus events"><X className="h-4 w-4" /></button>
      </header>

      <div ref={bodyRef} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", sheetPosition === "peek" && "max-md:hidden")}>
        {selected ? (
          <div className="p-4">
            <dl className="space-y-2 rounded-xl bg-muted/50 p-3 text-xs"><div><dt className="font-medium text-muted-foreground">Starts</dt><dd className="mt-0.5 font-semibold">{formatEventDate(selected.dateStart)}</dd></div><div><dt className="font-medium text-muted-foreground">Ends</dt><dd className="mt-0.5 font-semibold">{formatEventDate(selected.dateEnd)}</dd></div></dl>
            <p className="mt-3 break-words text-xs text-muted-foreground">Asia/Manila · Organized by {selected.organizer}</p>
            <h3 className="mb-2 mt-4 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Event locations ({selected.locations.length})</h3>
            <ul className="space-y-2">
              {selected.locations.map((location) => (
                <li key={location.id}>
                  <button type="button" onClick={() => { props.onViewLocation(selected.id, location.id); setSheetPosition("peek"); }} className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left", props.selectedLocationId === location.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 text-sm font-semibold">{location.locationRef.label}</span>
                    <span className="shrink-0 text-xs font-bold text-primary">{props.selectedLocationId === location.id ? "Viewing" : "View"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {selected.posterUrl && <img src={selected.posterUrl} alt={`${selected.title} poster`} className="mt-4 aspect-video w-full rounded-xl border border-border object-cover" />}
            {selected.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{selected.description}</p>}
          </div>
        ) : (
          <div className="p-3 md:p-4">
            <div role="group" aria-label="Filter events" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {filterLabels.map(({ id, label }) => <button key={id} type="button" aria-pressed={props.filter === id} onClick={() => props.onFilterChange(id)} className={cn("min-h-11 rounded-lg px-2 text-xs font-bold", props.filter === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
            </div>
            {props.loading && <p role="status" className="px-2 py-5 text-center text-sm text-muted-foreground">Loading published events…</p>}
            {props.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3"><p role="alert" className="text-sm text-destructive">{props.error}</p><button type="button" onClick={props.onRetry} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-primary hover:bg-primary/5"><RotateCw className="h-4 w-4" />Retry</button></div>}
            {!props.loading && !props.error && cards.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center"><CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-bold">No {props.filter === "all" ? "published" : props.filter} events</p><p className="mt-1 text-xs text-muted-foreground">Check again later for campus event maps.</p></div>}
            <ul className="space-y-2">
              {cards.map((event) => <li key={event.id}><button type="button" onClick={() => props.onSelectEvent(event.id)} className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="flex items-start justify-between gap-2"><span className="min-w-0 text-sm font-extrabold leading-snug">{event.title}</span><span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase", event.phase === "ongoing" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 text-primary")}>{event.phase}</span></span>
                <span className="mt-2 block text-xs font-semibold text-muted-foreground">{formatEventDate(event.dateStart)}</span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" />{event.locations.length} location{event.locations.length === 1 ? "" : "s"} · {event.organizer}</span>
              </button></li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

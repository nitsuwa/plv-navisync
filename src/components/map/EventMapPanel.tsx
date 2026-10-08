import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, Maximize, MapPin, RotateCw, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { formatEventDate } from "../../lib/eventPublication";
import { visibleEventCards, type EventVenue } from "../../lib/eventMapView";
import type { EventMapFilter, PublicEventPreview } from "../../types/eventPreview";
import { motion, useReducedMotion } from 'motion/react';

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
  currentMap?: { label: string; locationId: string | null; isFloor?: boolean };
  onFitMap?: () => void;
  inspectedVenue?: EventVenue | null;
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
  const reducedMotion = useReducedMotion();
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>("list");
  const bodyRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const detailsId = useId();
  const selected = props.events.find((event) => event.id === props.selectedEventId) ?? null;
  const viewingId = props.currentMap ? props.currentMap.locationId : props.selectedLocationId;
  const viewing = selected?.locations.find(location => location.id === viewingId);
  const mapLabel = props.currentMap?.label ?? viewing?.locationRef.label ?? 'Campus Grounds';
  const phase = visibleEventCards(props.events, props.nowMs, 'all').find(event => event.id === selected?.id)?.phase;
  const mapMode = viewing ? 'Event layout' : props.currentMap?.isFloor ? 'Building map' : 'Event venues';
  const venue = props.inspectedVenue;
  const cards = useMemo(() => visibleEventCards(props.events, props.nowMs, props.filter), [props.events, props.nowMs, props.filter]);

  useEffect(() => {
    setSheetPosition(venue ? 'expanded' : props.open && props.selectedEventId ? "peek" : "list");
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [props.open, props.selectedEventId, props.selectedLocationId, venue?.id]);

  if (!props.open) return null;

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
  };
  const collapsed = sheetPosition === 'peek';
  const moveSheet = () => setSheetPosition(current => current === 'peek' ? 'expanded' : 'peek');
  const nextSheetLabel = `${collapsed ? 'Show' : 'Hide'} ${selected ? 'event details' : 'event list'}`;
  const sheetMaxHeight = collapsed ? "none" : sheetPosition === "expanded" ? "72dvh" : "52dvh";
  const viewLocation = (eventId: string, locationId: string) => {
    detailsRef.current?.focus({preventScroll:true});
    props.onViewLocation(eventId, locationId);
    setSheetPosition('peek');
  };

  return (
    <motion.section
      initial={reducedMotion ? false : {opacity:0}}
      animate={{opacity:1}}
      transition={{duration:reducedMotion ? 0 : 0.16}}
      aria-label="Campus events"
      data-no-drag
      data-testid="event-map-panel"
      data-map-layer="building-sheet"
      data-collapsed={collapsed}
      className={cn(
        "map-layer-building-sheet absolute flex min-h-0 flex-col overflow-hidden border border-border bg-card/95 text-card-foreground shadow-xl backdrop-blur-xl",
        "left-3 right-3 bottom-[var(--student-map-utility-bottom,1rem)] h-auto max-h-[min(var(--event-sheet-max-height),calc(100%-1rem))] rounded-2xl lg:left-4 lg:right-auto lg:top-4 lg:bottom-auto lg:max-h-[calc(100%-2rem)] lg:w-[min(360px,calc(100%-2rem))]",
      )}
      style={{ "--event-sheet-max-height": sheetMaxHeight } as CSSProperties}
      onKeyDownCapture={onKeyDownCapture}
    >
      <header data-event-context-header className="shrink-0 border-b border-border">
      <div className="flex items-start gap-1 px-2 pt-2 md:px-3">
        {selected || venue ? (
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Back to events" onClick={props.onBackToEvents}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>}
        <div className="min-w-0 flex-1">
          <h2 className={cn("break-words text-sm font-extrabold leading-snug", sheetPosition === "peek" && "max-md:line-clamp-2")}>{selected?.title ?? venue?.label ?? "Campus events"}</h2>
          {selected && venue && <p className="mt-1 break-words text-xs text-muted-foreground">Inspecting venue: <span>{venue.label}</span></p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{mapMode}</span>
            {selected && phase && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold',phase === 'ongoing' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary')}>{phase === 'ongoing' ? 'Ongoing' : 'Upcoming'}</span>}
            {!selected && <span>{venue ? `${venue.eventIds.length} event${venue.eventIds.length === 1 ? '' : 's'} at this venue` : `${cards.length} ${props.filter === 'all' ? 'published' : props.filter} event${cards.length === 1 ? '' : 's'}`}</span>}
          </div>
        </div>
        <button type="button" onClick={props.onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Close campus events"><X className="h-4 w-4" /></button>
      </div>
      <div role="status" aria-atomic="true" className="px-3 pt-1 text-xs leading-relaxed md:px-4">
        <p className="break-words font-medium">Map shown: {mapLabel}</p>
        {selected && props.currentMap?.isFloor && !viewing && <p className="mt-0.5 text-muted-foreground">No event layout on this floor.</p>}
      </div>
      <div className="flex items-center gap-2 px-3 py-1 md:px-4">
        {props.onFitMap && <button type="button" onClick={() => {setSheetPosition('peek');props.onFitMap?.();}} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/5"><Maximize aria-hidden="true" className="h-3.5 w-3.5"/>Fit map</button>}
        <button ref={detailsRef} type="button" onClick={moveSheet} aria-label={nextSheetLabel} aria-expanded={!collapsed} aria-controls={detailsId} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/5">
          {selected ? 'Event details' : 'Event list'}{collapsed ? <ChevronUp aria-hidden="true" className="h-4 w-4"/> : <ChevronDown aria-hidden="true" className="h-4 w-4"/>}
        </button>
      </div>
      </header>

      {props.error && <div data-event-refresh-error className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2"><p role="alert" className="min-w-0 flex-1 break-words text-xs text-destructive">{props.events.length ? 'Showing the last loaded events. ' : ''}{props.error}</p><button type="button" onClick={props.onRetry} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary hover:bg-primary/5"><RotateCw aria-hidden="true" className="h-3.5 w-3.5"/>Retry</button></div>}
      <div ref={bodyRef} id={detailsId} hidden={collapsed} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {venue ? <div className="space-y-3 p-3 md:p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{venue.type === 'building' ? 'Choose an event and floor to view its setup.' : 'Choose an event to view its setup on the campus grounds.'}</p>
          {visibleEventCards(props.events, props.nowMs, 'all').filter(event => venue.eventIds.includes(event.id)).map(event => <article key={event.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 break-words text-sm font-extrabold">{event.title}</h3><span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', event.phase === 'ongoing' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary')}>{event.phase === 'ongoing' ? 'Ongoing' : 'Upcoming'}</span></div>
            <p className="mt-2 break-words text-xs text-muted-foreground">Organized by {event.organizer}</p>
            <dl className="mt-2 space-y-1 text-xs"><div><dt className="inline text-muted-foreground">Starts: </dt><dd className="inline font-semibold">{formatEventDate(event.dateStart)}</dd></div><div><dt className="inline text-muted-foreground">Ends: </dt><dd className="inline font-semibold">{formatEventDate(event.dateEnd)}</dd></div></dl>
            <p className="mt-1 text-[10px] text-muted-foreground">Asia/Manila</p>
            <div className="mt-3 space-y-2">{event.locations.filter(location => venue.locations.some(entry => entry.eventId === event.id && entry.locationId === location.id)).map(location => <button key={location.id} type="button" aria-label={`View map: ${location.locationRef.label}`} onClick={() => viewLocation(event.id, location.id)} className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><MapPin className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words text-xs font-semibold">{location.locationRef.label}</span><span className="shrink-0 text-xs font-bold text-primary">View map</span></button>)}</div>
          </article>)}
        </div> : selected ? (
          <div className="p-4">
            <dl className="space-y-2 rounded-xl bg-muted/50 p-3 text-xs"><div><dt className="font-medium text-muted-foreground">Starts</dt><dd className="mt-0.5 font-semibold">{formatEventDate(selected.dateStart)}</dd></div><div><dt className="font-medium text-muted-foreground">Ends</dt><dd className="mt-0.5 font-semibold">{formatEventDate(selected.dateEnd)}</dd></div></dl>
            <p className="mt-3 break-words text-xs text-muted-foreground">Asia/Manila · Organized by {selected.organizer}</p>
            <h3 className="mb-2 mt-4 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Event locations ({selected.locations.length})</h3>
            <ul className="space-y-2">
              {selected.locations.map((location) => (
                <li key={location.id}>
                  <button type="button" aria-label={`${viewingId === location.id ? 'Currently viewing' : location.locationRef.type === 'campus' ? 'View campus layout' : 'View floor layout'}: ${location.locationRef.label}`} aria-current={viewingId === location.id ? 'location' : undefined} onClick={() => viewLocation(selected.id, location.id)} className={cn("flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left", viewingId === location.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                    {viewingId === location.id ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary"/> : <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold">{location.locationRef.label}<span className="mt-0.5 block text-xs font-medium text-primary">{viewingId === location.id ? 'Currently viewing' : location.locationRef.type === 'campus' ? 'View campus layout' : 'View floor layout'}</span></span>
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
            {!props.loading && !props.error && cards.length > 0 && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Pins show event venues. A shared venue’s badge counts its events.</p>}
            {props.loading && <p role="status" className="px-2 py-5 text-center text-sm text-muted-foreground">Loading published events…</p>}
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
    </motion.section>
  );
}

import { useId, useState } from "react";
import { Archive, CalendarDays, ChevronDown, ChevronUp, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../app/components/ui/collapsible";
import { cn } from "../../lib/utils";
import { formatOrganizationEventCreatedDate, formatOrganizationEventSchedule } from "../../lib/organizationEventPresentation";
import type { CampusEventOverlay } from "../map-builder/types";

interface OrganizationHistoryCardProps {
  event: CampusEventOverlay;
  canReuse: boolean;
  reuseSource?: CampusEventOverlay;
  onReuse: (event: CampusEventOverlay) => void;
}

const statusPresentation: Record<string, { label: string; className: string; icon?: typeof Archive }> = {
  draft: { label: "Draft", className: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200" },
  pending: { label: "Pending review", className: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
  disapproved: { label: "Needs revision", className: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
};

export function OrganizationHistoryCard({ event, canReuse, reuseSource, onReuse }: OrganizationHistoryCardProps) {
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [allLocationsOpen, setAllLocationsOpen] = useState(false);
  const archived = Boolean(event.archivedAt);
  const locations = event.locations?.map((location) => location.locationRef.label?.trim()).filter((label): label is string => Boolean(label)) ?? [];
  const visibleLocations = allLocationsOpen ? locations : locations.slice(0, 2);
  const status = statusPresentation[event.status ?? ""];
  const statusLabel = archived ? "Archived" : status?.label ?? "Status unavailable";
  const statusClass = archived ? "bg-muted text-muted-foreground" : status?.className ?? "bg-muted text-muted-foreground";
  const route = `/student/events/${event.id}/edit${archived ? "?history=1" : ""}`;

  return <article className="min-w-0 rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <h3 className="min-w-0 flex-1 break-words text-base font-extrabold leading-snug text-foreground sm:text-lg">{event.title}</h3>
      <span className={cn("inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", statusClass)}>{archived && <Archive aria-hidden="true" className="h-3.5 w-3.5" />}{statusLabel}</span>
    </div>

    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
      <p className="flex min-w-0 items-start gap-2 break-words"><CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-semibold text-foreground">Event schedule</span><br />{formatOrganizationEventSchedule(event.dateStart, event.dateEnd)}</span></p>
      <p className="flex min-w-0 items-start gap-2 break-words"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-semibold text-foreground">Academic year</span><br />{event.academicYear?.trim() || "Unknown academic year"}</span></p>
    </div>

    <div className="mt-3 flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
      <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="break-words"><span className="font-semibold text-foreground">Locations</span>{locations.length ? ` · ${visibleLocations.join(" · ")}` : " · No location recorded"}</p>
        {locations.length > 2 && <button type="button" aria-expanded={allLocationsOpen} onClick={() => setAllLocationsOpen((open) => !open)} className="mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-lg pr-2 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {allLocationsOpen ? <><ChevronUp aria-hidden="true" className="h-4 w-4" />Show fewer locations</> : <><ChevronDown aria-hidden="true" className="h-4 w-4" />Show {locations.length - 2} more location{locations.length - 2 === 1 ? "" : "s"}</>}
        </button>}
      </div>
    </div>

    <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
      {canReuse && <button type="button" onClick={() => onReuse(event)} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:order-2 sm:ml-auto sm:w-auto">Reuse as new draft</button>}
      <Link to={route} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:order-1 sm:w-auto">View event maps</Link>
    </div>

    <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-3 border-t border-border pt-2">
      <CollapsibleTrigger asChild>
        <button type="button" aria-controls={detailsId} className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2 text-sm font-semibold text-primary transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span>Event details</span>{detailsOpen ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent id={detailsId} className="mt-1 rounded-xl bg-muted/30 p-3 data-[state=closed]:hidden">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div className="min-w-0 break-words"><dt className="inline font-semibold text-foreground">Original creator: </dt><dd className="inline text-muted-foreground">{event.creatorName?.trim() || event.createdByUserId || "Name unavailable"}</dd></div>
          <div className="min-w-0 break-words"><dt className="inline font-semibold text-foreground">Created: </dt><dd className="inline text-muted-foreground">{formatOrganizationEventCreatedDate(event.createdAt)}</dd></div>
          {event.reusedFromEventId && <div className="min-w-0 break-words sm:col-span-2"><dt className="inline font-semibold text-foreground">Reuse history: </dt><dd className="inline text-muted-foreground">{reuseSource ? <>Based on <span className="font-medium text-foreground">{reuseSource.title}</span>{reuseSource.academicYear ? ` · ${reuseSource.academicYear}` : ""}. The original layout is kept.</> : "Based on an earlier organization layout that is not in the loaded page. The original layout is kept."}</dd></div>}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  </article>;
}

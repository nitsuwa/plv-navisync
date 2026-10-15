import { useId, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Clock3, MapPin, MessageSquare, MoreHorizontal } from "lucide-react";
import * as DropdownMenu from "../../app/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../app/components/ui/collapsible";
import { cn } from "../../lib/utils";
import { formatOrganizationEventCreatedDate, formatOrganizationEventSchedule } from "../../lib/organizationEventPresentation";
import { eventFeedbackText } from "../../lib/eventFeedbackPins";
import { normalizeEventOverlayLocations } from "../../lib/eventOverlayModel";
import type { CampusEventOverlay } from "../map-builder/types";

export interface CurrentWorkMenuAction {
  id: "duplicate" | "edit-details" | "withdraw" | "delete";
  label: string;
  disabled: boolean;
  disabledReason?: string;
  destructive?: boolean;
  icon: ReactNode;
  onSelect: (trigger: HTMLButtonElement) => void;
}

export interface OrganizationCurrentWorkCardProps {
  overlay: CampusEventOverlay;
  campusName: string;
  statusPresentation: { label: string; color: string; bg: string; icon: ReactNode };
  nextStep: string;
  unread: boolean;
  markingRead: boolean;
  onMarkRead: () => void;
  furnitureCount: number;
  labelsCount: number;
  openFeedbackCount: number;
  primaryAction: ReactNode;
  menuActions: CurrentWorkMenuAction[];
  detailsContent?: ReactNode;
  visibilityContent?: ReactNode;
}

export function OrganizationCurrentWorkCard({
  overlay,
  campusName,
  statusPresentation,
  nextStep,
  unread,
  markingRead,
  onMarkRead,
  furnitureCount,
  labelsCount,
  openFeedbackCount,
  primaryAction,
  menuActions,
  detailsContent,
  visibilityContent,
}: OrganizationCurrentWorkCardProps) {
  const detailsId = useId();
  const feedbackId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [allLocationsOpen, setAllLocationsOpen] = useState(false);
  const [allFeedbackOpen, setAllFeedbackOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const locations = normalizeEventOverlayLocations(overlay);
  const shownLocations = allLocationsOpen ? locations : locations.slice(0, 2);
  const feedbackEntries = Object.entries(overlay.locationFeedback ?? {}).filter(([, feedback]) => eventFeedbackText(feedback).trim());
  const shownFeedbackEntries = allFeedbackOpen ? feedbackEntries : feedbackEntries.slice(0, 2);
  const liveOpenFeedbackCount = openFeedbackCount;

  return (
    <article data-testid={`org-event-card-${overlay.id}`} data-unread={unread ? "true" : "false"} className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", unread ? "border-red-300 dark:border-red-800" : "border-border")}>
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="space-y-3 p-4 sm:space-y-2 sm:p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 break-words text-base font-extrabold leading-snug text-foreground sm:text-lg">{overlay.title}</h2>
          <span className={cn("inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold", statusPresentation.bg, statusPresentation.color)}>
            {statusPresentation.icon}{statusPresentation.label}
          </span>
        </div>

        <div className="rounded-lg border-l-2 border-primary/35 bg-muted/20 px-3 py-2 sm:border-0 sm:bg-transparent sm:p-0">
          <p className="text-sm leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Next step: </span>{nextStep}</p>
        </div>

        {unread && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/30">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-red-800 dark:text-red-200"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-600" />New GSO update</span>
          <button type="button" disabled={markingRead} aria-label={`Mark GSO update for ${overlay.title} as read`} onClick={onMarkRead} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-red-800 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 dark:text-red-200 dark:hover:bg-red-900/40">
            {markingRead ? "Saving read status…" : "Mark as read"}
          </button>
        </div>}

        {overlay.adminComment && <div className="flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-50/60 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/20">
          <MessageSquare aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" />
          <div className="min-w-0"><p className="text-xs font-bold text-red-800 dark:text-red-200">GSO feedback</p><p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-red-900 dark:text-red-100">{overlay.adminComment}</p></div>
        </div>}

        {(liveOpenFeedbackCount > 0 || feedbackEntries.length > 0) && <div className="rounded-xl border border-amber-300/80 bg-amber-50/75 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <p className="text-sm font-bold text-amber-950 dark:text-amber-100">{liveOpenFeedbackCount > 0 ? `${liveOpenFeedbackCount} open map feedback pin${liveOpenFeedbackCount === 1 ? "" : "s"}` : "Map feedback"}</p>
          <div id={feedbackId}>
            {shownFeedbackEntries.map(([locationId, feedback]) => {
              const label = locations.find((location) => location.id === locationId)?.locationRef.label ?? "Location";
              return <p key={locationId} className="mt-1 break-words text-sm text-amber-950/85 dark:text-amber-100/85"><span className="font-semibold">{label}:</span> {eventFeedbackText(feedback)}</p>;
            })}
          </div>
          {feedbackEntries.length > 2 && <button type="button" aria-expanded={allFeedbackOpen} aria-controls={feedbackId} onClick={() => setAllFeedbackOpen((open) => !open)} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-amber-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-amber-100">
            {allFeedbackOpen ? "Show fewer feedback items" : `Show all ${feedbackEntries.length} location feedback items`}
          </button>}
        </div>}

        {overlay.status === "approved" && visibilityContent}

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <p className="flex min-w-0 items-start gap-2 break-words"><CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-semibold text-foreground">Event schedule: </span>{formatOrganizationEventSchedule(overlay.dateStart, overlay.dateEnd)}</span></p>
          <p className="flex min-w-0 items-start gap-2 break-words"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-semibold text-foreground">Academic year: </span>{overlay.academicYear?.trim() || "Unknown academic year"}</span></p>
        </div>

        <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="break-words"><span className="font-semibold text-foreground">{locations.length} location{locations.length === 1 ? "" : "s"}</span>{locations.length === 0 ? " · No location set" : ` · ${shownLocations.map((location) => location.locationRef.label).join(" · ")}`}</p>
            {locations.length > 2 && <button type="button" aria-expanded={allLocationsOpen} onClick={() => setAllLocationsOpen((open) => !open)} className="mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-lg pr-2 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {allLocationsOpen ? <><ChevronUp aria-hidden="true" className="h-4 w-4" />Show fewer locations</> : <><ChevronDown aria-hidden="true" className="h-4 w-4" />Show {locations.length - 2} more location{locations.length - 2 === 1 ? "" : "s"}</>}
            </button>}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center [&_a]:justify-center [&_a]:gap-2 [&_a]:rounded-xl [&_a]:bg-primary [&_a]:px-4 [&_a]:text-sm [&_a]:font-bold [&_a]:text-primary-foreground [&_a]:hover:bg-primary/90 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-primary sm:[&_a]:w-auto">
            {primaryAction}
          </div>
          <DropdownMenu.DropdownMenu>
            <DropdownMenu.DropdownMenuTrigger asChild>
              <button ref={menuTriggerRef} type="button" aria-label={`More actions for ${overlay.title}`} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:w-auto">
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" /><span>More actions</span>
              </button>
            </DropdownMenu.DropdownMenuTrigger>
            <DropdownMenu.DropdownMenuContent align="end" sideOffset={6} className="z-[70] min-w-56 border-border bg-popover p-1.5 text-popover-foreground shadow-xl motion-reduce:animate-none">
              {menuActions.map((action) => <DropdownMenu.DropdownMenuItem
                key={action.id}
                disabled={action.disabled}
                onSelect={(event) => { if (action.disabled) { event.preventDefault(); return; } if (menuTriggerRef.current) action.onSelect(menuTriggerRef.current); }}
                className={cn("min-h-11 cursor-pointer gap-2 px-3 text-sm focus:bg-primary/10 focus:text-foreground", action.destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive")}
              >{action.icon}<span>{action.label}</span>{action.disabled && action.disabledReason && <span className="sr-only">{action.disabledReason}</span>}</DropdownMenu.DropdownMenuItem>)}
            </DropdownMenu.DropdownMenuContent>
          </DropdownMenu.DropdownMenu>
          <CollapsibleTrigger asChild>
            <button type="button" aria-controls={detailsId} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/80 px-3 text-sm font-semibold text-primary transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto">
              <span>Event details</span>{detailsOpen ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
            </button>
          </CollapsibleTrigger>
        </div>
        {menuActions.some((action) => action.disabled && action.disabledReason) && <p className="text-xs text-muted-foreground">{menuActions.find((action) => action.disabled && action.disabledReason)?.disabledReason}</p>}

          <CollapsibleContent id={detailsId} className="mt-2 rounded-xl bg-muted/30 p-3 data-[state=closed]:hidden">
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div className="min-w-0 break-words"><dt className="inline font-semibold text-foreground">Campus: </dt><dd className="inline text-muted-foreground">{campusName}</dd></div>
              <div className="min-w-0 break-words"><dt className="inline font-semibold text-foreground">Original creator: </dt><dd className="inline text-muted-foreground">{overlay.creatorName?.trim() || overlay.createdByUserId || "Name unavailable"}</dd></div>
              <div className="min-w-0 break-words"><dt className="inline font-semibold text-foreground">Created: </dt><dd className="inline text-muted-foreground">{formatOrganizationEventCreatedDate(overlay.createdAt)}</dd></div>
              <div className="min-w-0 break-words"><dt className="inline font-semibold text-foreground">Map items: </dt><dd className="inline text-muted-foreground">{furnitureCount} furniture · {labelsCount} labels</dd></div>
              {overlay.description && <div className="min-w-0 break-words sm:col-span-2"><dt className="block font-semibold text-foreground">Description</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{overlay.description}</dd></div>}
            </dl>
            {detailsContent && <div className="mt-3 border-t border-border pt-3">{detailsContent}</div>}
          </CollapsibleContent>
      </Collapsible>
    </article>
  );
}

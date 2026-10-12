import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { eventOverlayService } from "../../services/eventOverlayService";
import type { EventOrganizationContext } from "../../types/eventOrganization";
import type { CampusEventOverlay } from "../map-builder/types";
import { ReuseOrganizationEventDialog } from "./ReuseOrganizationEventDialog";

const PAGE_SIZE = 20;

function dateText(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hour12: true,
  }) + " PHT";
}

function createdDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Creation date unavailable";
  return new Date(value).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" });
}

const statusLabel: Record<string, string> = {
  draft: "Draft", pending: "Pending review", approved: "Approved", disapproved: "Needs revision",
};

interface OrganizationEventHistoryProps {
  organization: EventOrganizationContext;
}

export function OrganizationEventHistory({ organization }: OrganizationEventHistoryProps) {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CampusEventOverlay[]>([]);
  const [total, setTotal] = useState(0);
  const [yearFilter, setYearFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reuseTarget, setReuseTarget] = useState<CampusEventOverlay | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await eventOverlayService.listOrganizationEvents(organization.organizationId, {
        academicYear: yearFilter || undefined,
        search,
        limit: PAGE_SIZE,
        offset: 0,
        includeArchived: true,
      });
      if (request !== requestId.current) return;
      setEvents(result.events);
      setTotal(result.total);
    } catch (cause) {
      if (request !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "Event history could not be loaded. Reconnect and retry.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [organization.organizationId, yearFilter, search]);

  useEffect(() => {
    setEvents([]);
    setTotal(0);
    void load();
    return () => { ++requestId.current; };
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || loading || events.length >= total) return;
    const request = requestId.current;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await eventOverlayService.listOrganizationEvents(organization.organizationId, {
        academicYear: yearFilter || undefined,
        search,
        limit: PAGE_SIZE,
        offset: events.length,
        includeArchived: true,
      });
      if (request !== requestId.current) return;
      setEvents((previous) => [...previous, ...result.events.filter((item) => !previous.some((existing) => existing.id === item.id))]);
      setTotal(result.total);
    } catch (cause) {
      if (request === requestId.current) setError(cause instanceof Error ? cause.message : "More event history could not be loaded. Retry.");
    } finally {
      if (request === requestId.current) setLoadingMore(false);
    }
  };

  const years = useMemo(() => [...new Set(events.map((event) => event.academicYear?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => b.localeCompare(a)), [events]);

  return <section aria-labelledby="organization-event-history-title" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 id="organization-event-history-title" className="font-extrabold text-foreground">Event history</h2><p className="mt-1 text-sm text-muted-foreground">Past layouts stay with {organization.organizationName}; new representatives can inspect their year, status, creator, and dates.</p></div>
      <span className="self-start rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{total} record{total === 1 ? "" : "s"}</span>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)]">
      <label className="relative block"><span className="sr-only">Search event history</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="search" role="searchbox" aria-label="Search event history" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search event title" className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
      <label className="block"><span className="sr-only">Academic year</span><select aria-label="Academic year" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="">All academic years</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
    </div>

    {loading && <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-5 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Loading organization history…</div>}
    {!loading && error && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-primary"><RefreshCw className="h-4 w-4" />Retry history</button></div>}
    {!loading && !error && events.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-7 text-center"><CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-semibold text-foreground">{search || yearFilter ? "No layouts match these filters" : "No past event layouts yet"}</p><p className="mt-1 text-xs text-muted-foreground">{search || yearFilter ? "Clear the search or choose another academic year." : "Approved and archived organization layouts will appear here."}</p>{(search || yearFilter) && <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setYearFilter(""); }} className="mt-3 min-h-10 rounded-lg px-3 text-sm font-bold text-primary hover:bg-muted">Clear filters</button>}</div>}

    {!loading && !error && events.length > 0 && <div className="mt-4 space-y-3">
      {events.map((event) => {
        const locations = event.locations?.map((location) => location.locationRef.label).filter(Boolean) ?? [];
        const academicYear = event.academicYear?.trim() || "Unknown academic year";
        const archived = Boolean(event.archivedAt);
        const reusedSource = event.reusedFromEventId ? events.find(item => item.id === event.reusedFromEventId) : undefined;
        return <article key={event.id} className="min-w-0 rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 flex-1 break-words text-sm font-extrabold text-foreground">{event.title}</h3><span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{archived ? "Archived" : statusLabel[event.status ?? "draft"] ?? "Unknown status"}</span></div>
          <div className="mt-3 grid gap-x-4 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p><span className="font-semibold text-foreground">Academic year:</span> {academicYear}</p>
            <p><span className="font-semibold text-foreground">Original creator:</span> {event.creatorName?.trim() || event.createdByUserId || "Unknown"}</p>
            <p><span className="font-semibold text-foreground">Created:</span> {createdDate(event.createdAt)}</p>
            <p className="flex min-w-0 items-start gap-1"><Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><span className="font-semibold text-foreground">Event dates:</span> {dateText(event.dateStart)}{event.dateEnd ? ` – ${dateText(event.dateEnd)}` : ""}</span></p>
            <p className="sm:col-span-2"><span className="font-semibold text-foreground">Locations:</span> {locations.length ? locations.join(" · ") : "No location recorded"}</p>
            {event.reusedFromEventId && <p className="min-w-0 break-words sm:col-span-2"><span className="font-semibold text-foreground">Reuse history:</span> Based on {reusedSource?.title || "an earlier organization layout"}{reusedSource?.academicYear ? ` · ${reusedSource.academicYear}` : ""}. The original layout is kept.</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3"><Link to={`/student/events/${event.id}/edit${archived ? "?history=1" : ""}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-xs font-bold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{archived ? "Inspect archived layout" : "View event maps"}</Link>{event.campusId && event.updatedAt && (archived || event.status === "approved") && <button type="button" onClick={() => setReuseTarget(event)} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Reuse as new draft</button>}</div>
        </article>;
      })}
      {events.length < total && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-primary disabled:opacity-60">{loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}{loadingMore ? "Loading more…" : "Load more history"}</button>}
    </div>}
    {reuseTarget && <ReuseOrganizationEventDialog source={reuseTarget} organization={organization} onClose={() => setReuseTarget(null)} onCreated={(created) => navigate(`/student/events/${created.id}/edit`)} />}
  </section>;
}

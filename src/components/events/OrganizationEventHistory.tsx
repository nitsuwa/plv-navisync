import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type ComponentPropsWithoutRef } from "react";
import { CalendarDays, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { useNavigate } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../app/components/ui/select";
import { eventOverlayService } from "../../services/eventOverlayService";
import type { EventOrganizationContext } from "../../types/eventOrganization";
import type { CampusEventOverlay } from "../map-builder/types";
import { ReuseOrganizationEventDialog } from "./ReuseOrganizationEventDialog";
import { OrganizationHistoryCard } from "./OrganizationHistoryCard";

const PAGE_SIZE = 20;
const ALL_YEARS = "__all_academic_years__";

// The shared Radix wrappers forward these DOM props at runtime; their installed declarations omit them.
const HistorySelectTrigger = SelectTrigger as unknown as ComponentType<ComponentPropsWithoutRef<"button"> & { size?: "sm" | "default" | "lg" }>;
const HistorySelectContent = SelectContent as unknown as ComponentType<ComponentPropsWithoutRef<"div"> & { position?: "item-aligned" | "popper"; sideOffset?: number }>;
const HistorySelectItem = SelectItem as unknown as ComponentType<ComponentPropsWithoutRef<"div"> & { value: string; disabled?: boolean; textValue?: string }>;

interface OrganizationEventHistoryProps {
  organization: EventOrganizationContext;
  onUnfilteredTotalChange?: (total: number | null) => void;
}

interface ResultState {
  scope: string;
  events: CampusEventOverlay[];
  total: number;
}

interface RequestState {
  scope: string;
  loading: boolean;
  error: string | null;
}

interface MoreRequestState {
  scope: string;
  loading: boolean;
  error: string | null;
}

export function OrganizationEventHistory({ organization, onUnfilteredTotalChange }: OrganizationEventHistoryProps) {
  const navigate = useNavigate();
  const searchId = useId();
  const yearLabelId = useId();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [reuseTarget, setReuseTarget] = useState<CampusEventOverlay | null>(null);
  const loadingMoreRef = useRef(false);
  const requestId = useRef(0);
  const scope = JSON.stringify([organization.organizationId, organization.grantId, yearFilter, search]);
  const [results, setResults] = useState<ResultState>(() => ({ scope, events: [], total: 0 }));
  const [initialRequest, setInitialRequest] = useState<RequestState>(() => ({ scope, loading: true, error: null }));
  const [moreRequest, setMoreRequest] = useState<MoreRequestState>(() => ({ scope, loading: false, error: null }));
  const events = results.scope === scope ? results.events : [];
  const total = results.scope === scope ? results.total : 0;
  const loading = initialRequest.scope !== scope || initialRequest.loading;
  const error = initialRequest.scope === scope ? initialRequest.error : null;
  const loadingMore = moreRequest.scope === scope && moreRequest.loading;
  const moreError = moreRequest.scope === scope ? moreRequest.error : null;
  const hasFilters = Boolean(searchInput.trim() || search || yearFilter);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const rememberYears = useCallback((page: CampusEventOverlay[]) => {
    setAvailableYears((previous) => {
      const next = new Set(previous);
      for (const item of page) {
        const value = item.academicYear?.trim();
        if (value) next.add(value);
      }
      return [...next].sort((a, b) => b.localeCompare(a));
    });
  }, []);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    loadingMoreRef.current = false;
    setResults({ scope, events: [], total: 0 });
    setInitialRequest({ scope, loading: true, error: null });
    setMoreRequest({ scope, loading: false, error: null });
    try {
      const result = await eventOverlayService.listOrganizationEvents(organization.organizationId, {
        academicYear: yearFilter || undefined,
        search,
        limit: PAGE_SIZE,
        offset: 0,
        includeArchived: true,
      });
      if (request !== requestId.current) return;
      setResults({ scope, events: result.events, total: result.total });
      if (!search && !yearFilter) {
        rememberYears(result.events);
        onUnfilteredTotalChange?.(result.total);
      }
      setInitialRequest({ scope, loading: false, error: null });
    } catch (cause) {
      if (request !== requestId.current) return;
      setInitialRequest({ scope, loading: false, error: cause instanceof Error ? cause.message : "Event history could not be loaded. Reconnect and retry." });
    }
  }, [organization.organizationId, onUnfilteredTotalChange, rememberYears, scope, search, yearFilter]);

  useEffect(() => {
    void load();
    return () => {
      ++requestId.current;
      loadingMoreRef.current = false;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loading || loadingMore || events.length >= total) return;
    loadingMoreRef.current = true;
    const request = requestId.current;
    const offset = events.length;
    setMoreRequest({ scope, loading: true, error: null });
    try {
      const result = await eventOverlayService.listOrganizationEvents(organization.organizationId, {
        academicYear: yearFilter || undefined,
        search,
        limit: PAGE_SIZE,
        offset,
        includeArchived: true,
      });
      if (request !== requestId.current) return;
      setResults((previous) => {
        if (previous.scope !== scope) return previous;
        const seen = new Set(previous.events.map((item) => item.id));
        return {
          scope,
          events: [...previous.events, ...result.events.filter((item) => !seen.has(item.id))],
          total: result.total,
        };
      });
      if (!search && !yearFilter) {
        rememberYears(result.events);
        onUnfilteredTotalChange?.(result.total);
      }
      setMoreRequest({ scope, loading: false, error: null });
    } catch (cause) {
      if (request === requestId.current) setMoreRequest({ scope, loading: false, error: cause instanceof Error ? cause.message : "More event history could not be loaded. Retry." });
    } finally {
      if (request === requestId.current) loadingMoreRef.current = false;
    }
  }, [events.length, loading, loadingMore, onUnfilteredTotalChange, organization.organizationId, rememberYears, scope, search, total, yearFilter]);

  const years = useMemo(() => {
    const choices = new Set(availableYears);
    for (const item of events) {
      const value = item.academicYear?.trim();
      if (value) choices.add(value);
    }
    return [...choices].sort((a, b) => b.localeCompare(a));
  }, [availableYears, events]);

  const byId = useMemo(() => new Map(events.map((item) => [item.id, item])), [events]);
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setYearFilter("");
  };

  return <section aria-labelledby="organization-event-history-title" className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0"><h2 id="organization-event-history-title" className="text-lg font-extrabold text-foreground sm:text-xl">Event history</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">All organization records, including current work and archived layouts.</p><p className="mt-1 break-words text-xs text-muted-foreground">{organization.organizationName}</p></div>
      {!loading && !error && <span aria-live="polite" className="shrink-0 whitespace-nowrap rounded-full bg-muted px-3 py-1.5 text-xs font-bold tabular-nums text-muted-foreground">{total} record{total === 1 ? "" : "s"}</span>}
    </div>

    <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)] sm:items-end">
      <div className="min-w-0">
        <label htmlFor={searchId} className="mb-1.5 block text-sm font-semibold text-foreground">Search event title</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input id={searchId} type="text" role="searchbox" aria-label="Search event history" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search event title" className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          {searchInput && <button type="button" aria-label="Clear event search" onClick={() => { setSearchInput(""); setSearch(""); }} className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X aria-hidden="true" className="h-4 w-4" /></button>}
        </div>
      </div>
      <div className="min-w-0">
        <span id={yearLabelId} className="mb-1.5 block text-sm font-semibold text-foreground">Academic year</span>
        <Select value={yearFilter || ALL_YEARS} onValueChange={(value) => setYearFilter(value === ALL_YEARS ? "" : value)}>
        <HistorySelectTrigger size="default" aria-label="Academic year" aria-labelledby={yearLabelId} className="!h-11 w-full rounded-xl border-border bg-background px-3 text-sm text-foreground shadow-sm transition-colors hover:border-primary/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none data-[state=open]:border-primary/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/15">
            <SelectValue placeholder="All academic years" />
          </HistorySelectTrigger>
          <HistorySelectContent position="popper" sideOffset={6} className="z-[60] max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-xl motion-reduce:animate-none">
            <HistorySelectItem value={ALL_YEARS} className="min-h-11 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary">All academic years</HistorySelectItem>
            {years.map((year) => <HistorySelectItem key={year} value={year} className="min-h-11 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary">{year}</HistorySelectItem>)}
          </HistorySelectContent>
        </Select>
      </div>
    </div>

    {hasFilters && <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Filters apply to all organization history records.</p><button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Clear filters</button></div>}

    {loading && <div role="status" aria-live="polite" className="mt-4 flex min-h-16 items-center gap-2 rounded-xl bg-muted/40 px-4 py-5 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Loading organization history…</div>}
    {!loading && error && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw aria-hidden="true" className="h-4 w-4" />Retry history</button></div>}
    {!loading && !error && events.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-7 text-center"><CalendarDays aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-semibold text-foreground">{hasFilters ? "No layouts match these filters" : "No organization event records yet"}</p><p className="mt-1 text-sm text-muted-foreground">{hasFilters ? "Clear the search or choose another academic year." : "Drafts, submissions, approvals, and archived layouts will appear here."}</p>{hasFilters && <button type="button" onClick={clearFilters} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Clear filters</button>}</div>}

    {!loading && !error && events.length > 0 && <div className="mt-4 space-y-3">
      <p aria-live="polite" className="text-xs font-medium text-muted-foreground">Showing {events.length} of {total} events</p>
      {events.map((item) => {
        const reuseSource = item.reusedFromEventId ? byId.get(item.reusedFromEventId) : undefined;
        const canReuse = Boolean(item.campusId && item.updatedAt && (item.archivedAt || item.status === "approved"));
        return <OrganizationHistoryCard key={item.id} event={item} reuseSource={reuseSource} canReuse={canReuse} onReuse={setReuseTarget} />;
      })}
      {moreError && <div className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"><p role="alert" className="text-sm text-destructive">{moreError}</p><button type="button" onClick={() => void loadMore()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw aria-hidden="true" className="h-4 w-4" />Retry more history</button></div>}
      {!moreError && events.length < total && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-bold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none disabled:opacity-60">{loadingMore && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}{loadingMore ? "Loading more history…" : "Load more history"}</button>}
    </div>}
    {reuseTarget && <ReuseOrganizationEventDialog source={reuseTarget} organization={organization} onClose={() => setReuseTarget(null)} onCreated={(created) => navigate(`/student/events/${created.id}/edit`)} />}
  </section>;
}

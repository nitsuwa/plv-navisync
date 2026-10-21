/** Student Org event proposals and map submission dashboard. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ComponentPropsWithoutRef } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock, Copy, Edit2, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { EmptyState } from "../components/ui/EmptyState";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useToast } from "../hooks/useToast";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { publishedEventBuildingOptions } from "../lib/eventLocationData";
import { countEventOverlayItems, normalizeEventOverlayLocations } from "../lib/eventOverlayModel";
import { eventOverlayService, type EventOverlayStatus } from "../services/eventOverlayService";
import { EventDetailsModal, EventProposalModal } from "../components/events/EventProposalModal";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { EventRevisionHistory } from "../components/events/EventRevisionHistory";
import type { CampusEventOverlay, EventLocationRef } from "../components/map-builder/types";
import { useStudentOrgEventUpdates } from "../hooks/useStudentOrgEventUpdates";
import { EventStudentVisibility } from '../components/events/EventStudentVisibility';
import { useEventOrganizationAccess } from "../hooks/useEventOrganizationAccess";
import { useOrganizationEventWorkspace } from "../hooks/useOrganizationEventWorkspace";
import { OrganizationEventHistory } from "../components/events/OrganizationEventHistory";
import { countOpenFeedbackPins } from "../lib/eventFeedbackPins";
import { OrganizationEventsWorkspaceTabs } from "../components/events/OrganizationEventsWorkspaceTabs";
import { OrganizationCurrentWorkCard, type CurrentWorkMenuAction } from "../components/events/OrganizationCurrentWorkCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../app/components/ui/select";
import { isCurrentOrganizationWork, parseOrganizationEventsView, type OrganizationEventsView } from "../lib/organizationEventPresentation";

const OrganizationSelectTrigger = SelectTrigger as unknown as ComponentType<ComponentPropsWithoutRef<"button"> & { size?: "sm" | "default" | "lg" }>;
const OrganizationSelectContent = SelectContent as unknown as ComponentType<ComponentPropsWithoutRef<"div"> & { position?: "item-aligned" | "popper"; sideOffset?: number }>;
const OrganizationSelectItem = SelectItem as unknown as ComponentType<ComponentPropsWithoutRef<"div"> & { value: string; disabled?: boolean; textValue?: string }>;
const NO_ORGANIZATION = "__choose_organization__";

const STATUS_CONFIG: Record<EventOverlayStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/30", icon: Save },
  pending: { label: "Pending Review", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30", icon: Clock },
  approved: { label: "Approved", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30", icon: CheckCircle2 },
  disapproved: { label: "Needs Revision", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30", icon: XCircle },
};

const NEXT_STEP: Record<EventOverlayStatus, string> = {
  draft: "Continue designing your maps, then review and submit the proposal to GSO.",
  pending: "GSO is reviewing your proposal. You can edit the submitted maps or withdraw to Draft.",
  disapproved: "Read GSO feedback, revise the existing maps, then resubmit from the editor.",
  approved: "GSO approved this proposal. The administrator controls its schedule and student publication.",
};

export function StudentMyEventsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = parseOrganizationEventsView(searchParams.get("view"));
  const changeView = useCallback((view: OrganizationEventsView) => {
    const next = new URLSearchParams(searchParams);
    if (view === "current") next.delete("view");
    else next.set("view", "history");
    setSearchParams(next, { preventScrollReset: true });
  }, [searchParams, setSearchParams]);
  const { isStudentOrg, profile, username, loading: authLoading } = useStudentAuth();
  const {
    campuses,
    activeCampus,
    loading: campusLoading,
    error: campusError,
    isCached,
    refetch: refetchCampus,
  } = usePublishedCampus();
  const toast = useToast();
  const { receiptError, unreadIds, markRead } = useStudentOrgEventUpdates(profile?.id, isStudentOrg && !authLoading);
  const access = useEventOrganizationAccess(profile?.id, isStudentOrg && !authLoading);
  const requestedOrganizationId = searchParams.get("organizationId");
  useEffect(() => {
    if (requestedOrganizationId && access.organizations.some(item => item.organizationId === requestedOrganizationId)) {
      access.selectOrganization(requestedOrganizationId);
    }
  }, [access.organizations, access.selectOrganization, requestedOrganizationId]);
  const organization = requestedOrganizationId
    ? access.organizations.find((item) => item.organizationId === requestedOrganizationId) ?? access.organization
    : access.organization;
  const historyScope = `${profile?.id ?? ""}:${organization?.organizationId ?? ""}:${organization?.grantId ?? ""}`;
  const [historyCountState, setHistoryCountState] = useState<{ scope: string; total: number | null }>({ scope: "", total: null });
  const historyCount = historyCountState.scope === historyScope ? historyCountState.total ?? undefined : undefined;
  const handleHistoryTotal = useCallback((total: number | null) => setHistoryCountState({ scope: historyScope, total }), [historyScope]);
  const workspace = useOrganizationEventWorkspace(profile?.id, organization, isStudentOrg && !authLoading);
  const overlays = workspace.events;
  const loadError = access.error ?? workspace.error;
  const loading = access.loading || (Boolean(organization) && workspace.loading);
  // A previously verified grant remains usable during background revalidation;
  // protected mutations are still checked by the server and real access errors block actions.
  const actionsDisabled = Boolean(access.error || workspace.error);
  const loadOverlays = async () => { await Promise.all([access.refresh(), workspace.refresh()]); };
  const [readingIds,setReadingIds] = useState<ReadonlySet<string>>(new Set());
  const navigationRequest = useRef(0);
  useLayoutEffect(() => { ++navigationRequest.current; }, [location.key, historyScope]);
  const mounted = useRef(true);
  const currentActor = useRef(profile?.id);
  currentActor.current = profile?.id;
  useEffect(()=>{
    mounted.current=true; ++navigationRequest.current;
    return ()=>{mounted.current=false; ++navigationRequest.current;};
  },[profile?.id]);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CampusEventOverlay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampusEventOverlay | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const deleteReturnFocus = useRef<HTMLButtonElement | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<CampusEventOverlay | null>(null);
  const [withdrawError, setWithdrawError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasOpenActionDialog = Boolean(deleteTarget || withdrawTarget);
  const actionDialogWasOpen = useRef(false);
  useEffect(() => {
    let frame = 0;
    if (actionDialogWasOpen.current && !hasOpenActionDialog) {
      frame = window.requestAnimationFrame(() => {
        if (deleteReturnFocus.current?.isConnected) deleteReturnFocus.current.focus();
        else document.querySelector<HTMLButtonElement>('[role="tab"][aria-label="Current work"]')?.focus();
      });
    }
    actionDialogWasOpen.current = hasOpenActionDialog;
    return () => { if (frame) window.cancelAnimationFrame(frame); };
  }, [hasOpenActionDialog]);
  const acknowledge = async (event: CampusEventOverlay) => {
    const actor=currentActor.current;
    setReadingIds(current=>new Set(current).add(event.id));
    const result = await markRead(event);
    if(!mounted.current || currentActor.current!==actor) return;
    setReadingIds(current=>{const next=new Set(current);next.delete(event.id);return next;});
    if (result === "memory") toast.info("Read for this visit", "Browser storage is unavailable, so this read mark may return after reload.");
    if (result === 'local') toast.info('Read in this browser', 'Cross-device sync is not available yet.');
    if (result === 'failed') toast.error('Read status could not sync', 'This update stays unread. Please retry.');
    if (result === "changed") toast.info("Newer update available", "Read the latest GSO feedback before marking it as read.");
  };
  const publishedCampuses = useMemo(() => (campuses ?? []).filter((campus) => campus.lifecycleStatus === "published" || campus.publishStatus === "published"), [campuses]);
  const buildings = useMemo(
    () => activeCampus ? publishedEventBuildingOptions(activeCampus) : [],
    [activeCampus],
  );
  const canCreateProposal = Boolean(
    organization && !actionsDisabled && publishedCampuses.length > 0 && !campusLoading && !campusError && !isCached,
  );
  const handleCreate = async (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string; campusId?: string }) => {
    if (!canCreateProposal || !activeCampus || !organization || !profile?.id) {
      throw new Error("A fresh published campus map is required before creating an event proposal.");
    }
    const overlay = await eventOverlayService.createEventOverlay(
      { ...data, organization },
      profile.id,
      data.campusId ?? activeCampus.id,
    );
    await loadOverlays();
    navigate(`/student/events/${overlay.id}/edit`);
  };

  const handleEdit = async (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string }) => {
    if (!editTarget) return;
    const expectedGrantId = organization && editTarget.organizationId === organization.organizationId ? organization.grantId : undefined;
    await eventOverlayService.updateEventOverlayDetails(editTarget.id, data, editTarget.updatedAt, expectedGrantId);
    toast.success("Draft saved", `"${data.title}" is a draft. Submit to GSO when it is ready for review.`);
    setEditTarget(null);
    await loadOverlays();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const expectedGrantId = organization && deleteTarget.organizationId === organization.organizationId ? organization.grantId : undefined;
      await eventOverlayService.deleteEventOverlay(deleteTarget.id, expectedGrantId);
      toast.success("Event deleted", `"${deleteTarget.title}" has been removed.`);
      setDeleteTarget(null);
      await loadOverlays();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
      toast.error("Delete failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async (source: CampusEventOverlay) => {
    if (busy || !profile?.id || !source.campusId || !organization) return;
    setBusy(true);
    try {
      const copy = await eventOverlayService.createEventOverlay({ title: `${source.title} (copy)`, description: source.description, organizer: source.organizer, posterUrl: source.posterUrl, organization, locations: normalizeEventOverlayLocations(source).map((location) => ({ locationRef: location.locationRef, eventFurniture: location.eventFurniture, eventLabels: location.eventLabels })) }, profile.id, source.campusId);
      toast.success("Layout copied", "This is a new draft for your organization. Review it and request fresh admin approval.");
      navigate(`/student/events/${copy.id}/edit`);
    } catch (err) {
      toast.error("Copy failed", err instanceof Error ? err.message : "Unable to copy this layout.");
    } finally { setBusy(false); }
  };

  if (authLoading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>;
  if (!isStudentOrg) return <Navigate to="/home" replace />;

  const campusNotice = campusLoading
    ? "Loading published campus locations"
    : isCached
      ? "Showing a cached published map. Reconnect and retry before creating an event proposal."
      : campusError || !activeCampus
        ? "The published campus map is unavailable. Ask an administrator to publish a campus map before creating an event."
        : buildings.length === 0
          ? "This published campus has no visible buildings with usable floor maps yet. Contact an administrator."
          : null;

  const nowMs = Date.now();
  const currentItems = overlays.filter((overlay) => isCurrentOrganizationWork(overlay, nowMs));
  const exactCurrentCount = !loading && !loadError && overlays.length >= workspace.total ? currentItems.length : undefined;
  const currentPanel = organization ? (
    <div className="min-w-0 space-y-4">
      {campusNotice && <div role={campusLoading ? "status" : campusError || !activeCampus ? "alert" : "status"} className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {campusLoading ? <Loader2 aria-hidden="true" className="mt-0.5 h-4 w-4 animate-spin text-primary" /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 text-amber-600" />}
        <div className="min-w-0 flex-1"><p>{campusNotice}</p>{!campusLoading && <button type="button" onClick={() => void refetchCampus()} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw aria-hidden="true" className="h-4 w-4" />Retry campus map</button>}</div>
      </div>}

      {receiptError && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><p className="min-w-0 flex-1">{receiptError}</p><button type="button" onClick={() => void loadOverlays()} className="min-h-11 rounded-lg px-3 font-bold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Retry sync</button></div>}
      {loadError && overlays.length > 0 && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm"><p>Showing the last loaded events. {loadError}</p><button type="button" onClick={() => void loadOverlays()} className="mt-1 inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Retry events</button></div>}

      <section aria-labelledby="organization-current-work-title" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="organization-current-work-title" className="text-lg font-extrabold text-foreground">Current work</h2><p className="text-sm text-muted-foreground">Drafts, submissions, and events needing attention.</p></div><span className="text-xs font-medium text-muted-foreground">{exactCurrentCount !== undefined ? `${exactCurrentCount} current item${exactCurrentCount === 1 ? "" : "s"}` : `${currentItems.length} current items in ${overlays.length} loaded organization records`}</span></div>

        {loading ? <div role="status" aria-label="Loading event proposals" className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-muted/30" />)}</div>
          : loadError && overlays.length === 0 ? <div role="alert" className="rounded-2xl border border-border bg-card p-5"><h3 className="font-bold text-foreground">Could not load your events</h3><p className="mt-2 text-sm text-muted-foreground">{loadError}</p><button type="button" onClick={() => void loadOverlays()} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Retry events</button></div>
            : currentItems.length === 0 && overlays.length < workspace.total ? <div role="status" className="rounded-2xl border border-dashed border-border bg-card px-4 py-5"><p className="font-semibold text-foreground">No current work in the loaded records.</p><p className="mt-1 text-sm text-muted-foreground">Load the remaining organization events before treating this as the complete current-work list.</p></div>
              : currentItems.length === 0 ? <EmptyState icon={CalendarDays} title="No current event work" description="There are no current drafts, submissions, or approved events needing attention. Review Event history for earlier layouts." />
                : currentItems.map((overlay) => {
                  const status = typeof overlay.status === "string" && Object.prototype.hasOwnProperty.call(STATUS_CONFIG, overlay.status) ? overlay.status as EventOverlayStatus : null;
                  const config = status ? STATUS_CONFIG[status] : { label: "Status unavailable", color: "text-muted-foreground", bg: "bg-muted border-border", icon: AlertCircle };
                  const StatusIcon = config.icon;
                  const locations = normalizeEventOverlayLocations(overlay);
                  const counts = countEventOverlayItems(locations);
                  const unread = unreadIds.has(overlay.id);
                  const menuReason = actionsDisabled ? "Unavailable while organization access or event data is refreshing." : busy ? "Another event action is in progress." : "";
                  const menuActions: CurrentWorkMenuAction[] = [{
                    id: "duplicate",
                    label: "Duplicate layout",
                    disabled: busy || actionsDisabled || isCached || Boolean(campusError) || !overlay.campusId,
                    disabledReason: !overlay.campusId ? "This event has no campus map to copy." : isCached || campusError ? "A fresh published campus map is required." : menuReason,
                    icon: <Copy aria-hidden="true" className="h-4 w-4" />,
                    onSelect: () => void handleDuplicate(overlay),
                  }];
                  if (status && status !== "pending" && status !== "approved") menuActions.push({
                    id: "edit-details",
                    label: "Edit details",
                    disabled: actionsDisabled,
                    disabledReason: actionsDisabled ? menuReason : undefined,
                    icon: <Pencil aria-hidden="true" className="h-4 w-4" />,
                    onSelect: () => setEditTarget(overlay),
                  });
                  if (status === "pending") menuActions.push({
                    id: "withdraw",
                    label: "Withdraw submission",
                    disabled: busy || actionsDisabled || !overlay.updatedAt,
                    disabledReason: !overlay.updatedAt ? "This submission has no current version to withdraw." : menuReason,
                    icon: <ArrowLeft aria-hidden="true" className="h-4 w-4" />,
                    onSelect: (trigger) => { deleteReturnFocus.current = trigger; setWithdrawError(""); setWithdrawTarget(overlay); },
                  });
                  if (status && status !== "pending" && status !== "approved") menuActions.push({
                    id: "delete",
                    label: "Delete",
                    disabled: actionsDisabled,
                    disabledReason: actionsDisabled ? menuReason : undefined,
                    destructive: true,
                    icon: <Trash2 aria-hidden="true" className="h-4 w-4" />,
                    onSelect: (trigger) => { deleteReturnFocus.current = trigger; setDeleteError(""); setDeleteTarget(overlay); },
                  });
                  return <OrganizationCurrentWorkCard
                    key={overlay.id}
                    overlay={overlay}
                    campusName={campuses?.find((campus) => campus.id === overlay.campusId)?.name ?? "Campus"}
                    statusPresentation={{ label: config.label, color: config.color, bg: config.bg, icon: <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" /> }}
                    nextStep={status ? NEXT_STEP[status] : "This event has an unrecognized status. Check the event details or contact an administrator."}
                    unread={unread}
                    markingRead={readingIds.has(overlay.id)}
                    onMarkRead={() => void acknowledge(overlay)}
                    furnitureCount={counts.furniture}
                    labelsCount={counts.labels}
                    openFeedbackCount={countOpenFeedbackPins(overlay.locationFeedback, overlay.feedbackResolutions)}
                    visibilityContent={<EventStudentVisibility overlay={overlay} />}
                    primaryAction={<Link to={`/student/events/${overlay.id}/edit`} aria-busy={readingIds.has(overlay.id)} onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                      if (readingIds.has(overlay.id)) { event.preventDefault(); return; }
                      if (unread) {
                        event.preventDefault(); const request = ++navigationRequest.current; const actor = currentActor.current;
                        void acknowledge(overlay).then(() => { if (mounted.current && currentActor.current === actor && request === navigationRequest.current) navigate(`/student/events/${overlay.id}/edit`); });
                      }
                    }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:w-auto">{readingIds.has(overlay.id) ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Edit2 aria-hidden="true" className="h-4 w-4" />}{status === "draft" ? "Continue draft" : status === "disapproved" ? "Revise maps" : status === "approved" ? "View maps" : status === "pending" ? "Edit maps" : "Review event"}</Link>}
                    menuActions={menuActions}
                    detailsContent={<EventRevisionHistory overlay={overlay} />}
                  />;
                })}

        {overlays.length < workspace.total && <button type="button" disabled={workspace.loadingMore || actionsDisabled} onClick={() => void workspace.loadMore()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{workspace.loadingMore && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{workspace.loadingMore ? "Loading more current work…" : `Load more organization events (${overlays.length} of ${workspace.total})`}</button>}
      </section>
    </div>
  ) : null;
  const historyPanel = organization && !access.error ? <OrganizationEventHistory organization={organization} onUnfilteredTotalChange={handleHistoryTotal} /> : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-3 px-4 pb-28 pt-4 sm:px-5 md:pb-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Link to="/home" aria-label="Back to Home" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft aria-hidden="true" className="h-5 w-5" /></Link><h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">Organization Events</h1></div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Manage your organization’s current event work and inspect layouts created by past representatives.</p>
          </div>
          {organization && <div className="flex w-full shrink-0 flex-col sm:w-56 sm:items-end">
            <button type="button" disabled={!canCreateProposal} title={!canCreateProposal ? "A fresh published campus map and verified organization access are required." : undefined} onClick={() => setShowCreate(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Plus aria-hidden="true" className="h-4 w-4" />Create event</button>
            <p aria-live="polite" aria-hidden={canCreateProposal || undefined} className={`mt-1 min-h-8 text-xs text-muted-foreground sm:max-w-56 sm:text-right ${canCreateProposal ? "invisible" : ""}`}>
              {access.error ? "Organization access needs to be verified before creating an event."
                : workspace.error ? "Refresh event data before creating an event."
                  : campusLoading ? "Checking for a current published campus map…"
                    : campusError || isCached ? "Refresh the campus map before creating an event."
                      : publishedCampuses.length === 0 ? "A current published campus map is required."
                        : "Event creation is temporarily unavailable."}
            </p>
          </div>}
        </header>

        {access.organizations.length > 1 && <div className="max-w-xl">
          <span id="event-organization-context-label" className="mb-1.5 block text-sm font-semibold text-foreground">Organization workspace</span>
          <Select value={organization?.organizationId ?? NO_ORGANIZATION} onValueChange={(value) => {
            if (value === NO_ORGANIZATION || !access.organizations.some((item) => item.organizationId === value)) return;
            access.selectOrganization(value);
            const next = new URLSearchParams(searchParams);
            next.set("organizationId", value);
            setSearchParams(next, { preventScrollReset: true });
          }}>
            <OrganizationSelectTrigger size="default" aria-label="Organization workspace" aria-labelledby="event-organization-context-label" className="!h-11 w-full rounded-xl border-border bg-card px-3 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-primary/30"><SelectValue placeholder="Choose an organization" /></OrganizationSelectTrigger>
            <OrganizationSelectContent position="popper" sideOffset={6} className="max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-xl motion-reduce:animate-none">
              <OrganizationSelectItem value={NO_ORGANIZATION} disabled className="min-h-11 rounded-lg px-3 py-2 text-sm">Choose an organization</OrganizationSelectItem>
              {access.organizations.map((item) => <OrganizationSelectItem key={item.organizationId} value={item.organizationId} textValue={`${item.organizationName} ${item.academicYear}`} className="min-h-11 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary">{item.organizationName} · {item.academicYear}</OrganizationSelectItem>)}
            </OrganizationSelectContent>
          </Select>
        </div>}

        {organization && !access.error && <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2 shadow-sm"><div className="min-w-0"><p className="break-words text-sm font-bold text-foreground">{organization.organizationName}</p><p className="mt-0.5 break-words text-xs text-muted-foreground">Representative: {username || "You"} · Academic year {organization.academicYear}</p></div><span className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-emerald-50 px-3 text-xs font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Active assignment</span></div>}
        {access.error && <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"><span>Could not verify current organization access. {access.error}</span><button type="button" onClick={() => void access.refresh()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 font-bold text-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Retry access check</button></div>}
        {access.loading && <div role="status" className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />Checking organization assignment…</div>}
        {!access.loading && !access.error && access.organizations.length === 0 && <div role="status" className="rounded-2xl border border-amber-500/20 bg-amber-50/60 p-5 dark:bg-amber-950/15"><h2 className="font-bold text-foreground">No active organization assignment</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">An administrator must appoint you as the organization’s representative before you can manage event work. Ask your admin to check the Student Organizations section in Users.</p></div>}
        {!access.loading && !access.error && access.organizations.length > 1 && !organization && <div role="status" className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">Choose an organization to see its drafts, submissions, feedback, and event history.</div>}
        {organization && !access.error && !access.loading && <OrganizationEventsWorkspaceTabs key={historyScope} value={activeView} onValueChange={changeView} currentCount={exactCurrentCount} historyCount={historyCount} currentPanel={currentPanel} historyPanel={historyPanel} />}
      </div>

      {showCreate && organization && <EventProposalModal organization={organization} buildings={buildings} campuses={publishedCampuses.map((campus) => ({ id: campus.id, name: campus.name, buildings: publishedEventBuildingOptions(campus) }))} initialCampusId={activeCampus?.id} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {editTarget && <EventDetailsModal overlay={editTarget} buildings={(() => { const campus = campuses?.find((item) => item.id === editTarget.campusId) ?? (activeCampus?.id === editTarget.campusId ? activeCampus : null); return campus ? publishedEventBuildingOptions(campus) : []; })()} onClose={() => setEditTarget(null)} onSave={handleEdit} />}

      <AlertDialog.Root open={Boolean(withdrawTarget)} onOpenChange={(open) => { if (!open && !busy) { setWithdrawTarget(null); setWithdrawError(""); } }}>
        <AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl outline-none">
            <AlertDialog.Title className="font-extrabold">Withdraw submission?</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">This returns the event to Draft and removes it from the review queue. All saved locations, furniture, and labels stay. You can submit it again later.</AlertDialog.Description>
            {withdrawError && <p role="alert" className="mt-3 text-sm text-destructive">{withdrawError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AlertDialog.Cancel asChild><button type="button" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Keep submitted</button></AlertDialog.Cancel><button type="button" disabled={busy || actionsDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" onClick={async () => { if (!withdrawTarget?.updatedAt) return; setBusy(true); setWithdrawError(""); try { const grantId = organization && withdrawTarget.organizationId === organization.organizationId ? organization.grantId : undefined; await eventOverlayService.withdrawEventSubmission(withdrawTarget.id, withdrawTarget.updatedAt, grantId); setWithdrawTarget(null); toast.success("Submission withdrawn", "Your saved maps are now a draft."); await loadOverlays(); } catch (error) { setWithdrawError(error instanceof Error ? error.message : "Could not withdraw submission."); } finally { setBusy(false); } }}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{busy ? "Withdrawing…" : "Withdraw to draft"}</button></div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !busy) { setDeleteTarget(null); setDeleteError(""); } }}>
        <AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl outline-none">
            <AlertDialog.Title className="font-extrabold">Delete event proposal?</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">This removes the event and all maps you added for it. It does not change the administrator-published map.</AlertDialog.Description>
            {deleteError && <p role="alert" className="mt-3 break-words text-sm text-destructive">{deleteError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AlertDialog.Cancel asChild><button type="button" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Cancel</button></AlertDialog.Cancel><button type="button" onClick={() => void handleDelete()} disabled={busy || actionsDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40">{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{busy ? "Deleting…" : "Delete event"}</button></div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

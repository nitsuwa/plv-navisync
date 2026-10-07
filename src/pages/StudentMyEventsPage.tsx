/** Student Org event proposals and map submission dashboard. */
import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock, Edit2, Loader2, MapPin, MessageSquare, Pencil, Plus, RefreshCw, Save, Trash2, X, XCircle } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
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
import { eventFeedbackText } from "../lib/eventFeedbackPins";
import type { CampusEventOverlay, EventLocationRef } from "../components/map-builder/types";
import { useStudentOrgEventUpdates } from "../hooks/useStudentOrgEventUpdates";

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
  const { isStudentOrg, profile, loading: authLoading } = useStudentAuth();
  const {
    campuses,
    activeCampus,
    loading: campusLoading,
    error: campusError,
    isCached,
    refetch: refetchCampus,
  } = usePublishedCampus();
  const toast = useToast();
  const { events: overlays, loading, error: loadError, refresh: loadOverlays, unreadIds, markRead } = useStudentOrgEventUpdates(profile?.id, isStudentOrg && !authLoading);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CampusEventOverlay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampusEventOverlay | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<CampusEventOverlay | null>(null);
  const [withdrawError, setWithdrawError] = useState("");
  const [busy, setBusy] = useState(false);
  const acknowledge = (event: CampusEventOverlay) => {
    const result = markRead(event);
    if (result === "memory") toast.info("Read for this visit", "Browser storage is unavailable, so this read mark may return after reload.");
    if (result === "changed") toast.info("Newer update available", "Read the latest GSO feedback before marking it as read.");
  };
  const publishedCampuses = useMemo(() => (campuses ?? []).filter((campus) => campus.lifecycleStatus === "published" || campus.publishStatus === "published"), [campuses]);
  const buildings = useMemo(
    () => activeCampus ? publishedEventBuildingOptions(activeCampus) : [],
    [activeCampus],
  );
  const canCreateProposal = Boolean(
    publishedCampuses.length > 0 && !campusLoading && !campusError && !isCached,
  );
  const handleCreate = async (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string; campusId?: string }) => {
    if (!canCreateProposal || !activeCampus) {
      throw new Error("A fresh published campus map is required before creating an event proposal.");
    }
    const overlay = await eventOverlayService.createEventOverlay(
      data,
      profile?.id || "unknown",
      data.campusId ?? activeCampus.id,
    );
    await loadOverlays();
    navigate(`/student/events/${overlay.id}/edit`);
  };

  const handleEdit = async (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string }) => {
    if (!editTarget) return;
    await eventOverlayService.updateEventOverlayDetails(editTarget.id, data, editTarget.updatedAt);
    toast.success("Draft saved", `"${data.title}" is a draft. Submit to GSO when it is ready for review.`);
    setEditTarget(null);
    await loadOverlays();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await eventOverlayService.deleteEventOverlay(deleteTarget.id);
      toast.success("Event deleted", `"${deleteTarget.title}" has been removed.`);
      setDeleteTarget(null);
      await loadOverlays();
    } catch (err) {
      toast.error("Delete failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async (source: CampusEventOverlay) => {
    if (busy || !profile?.id || !source.campusId) return;
    setBusy(true);
    try {
      const copy = await eventOverlayService.createEventOverlay({ title: `${source.title} (copy)`, description: source.description, organizer: source.organizer, posterUrl: source.posterUrl, locations: normalizeEventOverlayLocations(source).map((location) => ({ locationRef: location.locationRef, eventFurniture: location.eventFurniture, eventLabels: location.eventLabels })) }, profile.id, source.campusId);
      toast.success("Layout copied", "Review the locations before submitting this draft. The administrator will set its schedule.");
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-5 pt-8 pb-24 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/home" className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-3 w-3" /> Back to Home
            </Link>
            <h1 className="text-2xl font-extrabold text-foreground">My Events</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Request one or more campus locations, design each map on top of the published base map, and send the complete proposal for one GSO decision.
            </p>
          </div>
          {overlays.length > 0 && canCreateProposal && <button type="button" onClick={() => setShowCreate(true)} className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Create event</button>}
        </div>

        {campusNotice && (
          <div
            role={campusLoading ? "status" : campusError || !activeCampus ? "alert" : "status"}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
          >
            {campusLoading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />}
            <div className="min-w-0 flex-1">
              <p>{campusNotice}</p>
              {!campusLoading && (
                <button
                  type="button"
                  onClick={() => void refetchCampus()}
                  className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry campus map
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Loading event proposals">
            {[1, 2, 3].map((item) => <div key={item} className="h-36 rounded-2xl bg-muted/30 animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Could not load your events</h2><p className="mt-2 text-sm text-muted-foreground">{loadError}</p><button type="button" onClick={() => void loadOverlays()} className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Retry events</button></div>
        ) : overlays.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No event proposals yet"
            description="Start with your event details, request every needed location, then design each map."
            action={canCreateProposal ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex w-full max-w-[220px] items-center justify-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
              >
                <Plus className="h-3.5 w-3.5" /> Create event
              </button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {overlays.map((overlay) => {
              const status = overlay.status || "draft";
              const config = STATUS_CONFIG[status];
              const StatusIcon = config.icon;
              const locations = normalizeEventOverlayLocations(overlay);
              const counts = countEventOverlayItems(locations);
              const unread = unreadIds.has(overlay.id);
              return (
                <motion.article key={overlay.id} data-testid={`org-event-card-${overlay.id}`} data-unread={unread ? "true" : "false"} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("bg-card rounded-2xl border shadow-sm overflow-hidden", unread ? "border-red-300 dark:border-red-800" : "border-border")}>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-extrabold text-foreground text-sm">{overlay.title}</h2>
                      <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0", config.bg, config.color)}>
                        <StatusIcon className="h-3 w-3" /> {config.label}
                      </span>
                    </div>
                    {overlay.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{overlay.description}</p>}
                    {unread && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/30"><span className="inline-flex items-center gap-2 text-xs font-bold text-red-700 dark:text-red-300"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-red-600" />New GSO update</span><button type="button" aria-label={`Mark GSO update for ${overlay.title} as read`} onClick={() => acknowledge(overlay)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-red-300 dark:hover:bg-red-950/50">Mark as read</button></div>}
                    <div className="mt-3 border-l-2 border-primary/30 pl-3 py-1">
                      <p className="text-xs font-bold text-foreground">Next step</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{NEXT_STEP[status]}</p>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">{campuses?.find((campus) => campus.id === overlay.campusId)?.name ?? "Campus"}{status === "approved" && overlay.dateStart && ` · ${new Date(overlay.dateStart).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hour12: true })}`}</p>
                    <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span><strong className="text-foreground">{locations.length} location{locations.length === 1 ? "" : "s"}</strong> · {locations.map((location) => location.locationRef.label).join(" · ") || "No location set"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold text-muted-foreground px-2 py-1 rounded-full bg-muted">{counts.furniture} furniture</span>
                      <span className="text-[10px] font-bold text-muted-foreground px-2 py-1 rounded-full bg-muted">{counts.labels} labels</span>
                    </div>
                  </div>
                  {overlay.adminComment && (
                    <div className="px-5 py-3 border-t border-border bg-red-50/50 dark:bg-red-900/10 flex items-start gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                      <div><p className="text-[10px] font-bold text-red-600 uppercase">GSO feedback</p><p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{overlay.adminComment}</p></div>
                    </div>
                  )}
                  {Object.entries(overlay.locationFeedback ?? {}).map(([locationId, feedback]) => <div key={locationId} className="border-t border-border bg-amber-50/50 px-5 py-3 text-xs dark:bg-amber-900/10"><p className="font-bold">GSO feedback · {locations.find((location) => location.id === locationId)?.locationRef.label ?? "Location"}</p><p className="mt-1 text-muted-foreground">{eventFeedbackText(feedback)}</p></div>)}
                  <div className="px-5 py-3"><EventRevisionHistory overlay={overlay} /></div>
                  <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                    {status === "pending" && <button type="button" disabled={busy || !overlay.updatedAt} onClick={() => { setWithdrawError(""); setWithdrawTarget(overlay); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />Withdraw submission</button>}
                    <button type="button" disabled={busy || isCached || Boolean(campusError)} onClick={() => void handleDuplicate(overlay)} className="min-h-10 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">Duplicate layout</button>
                    {status !== "pending" && status !== "approved" && <button type="button" onClick={() => setEditTarget(overlay)} className="flex min-h-10 items-center gap-1.5 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Edit details</button>}
                    <Link to={`/student/events/${overlay.id}/edit`} onClick={() => { if (unread) acknowledge(overlay); }} className="order-first flex min-h-11 items-center gap-2 px-4 rounded-xl bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"><Edit2 className="h-3.5 w-3.5" /> {status === "draft" ? "Continue draft" : status === "disapproved" ? "Revise maps" : status === "approved" ? "View maps" : "Edit maps"}</Link>
                    {status !== "pending" && status !== "approved" && <button type="button" onClick={() => setDeleteTarget(overlay)} className="flex min-h-10 items-center gap-1.5 px-3 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <EventProposalModal buildings={buildings} campuses={publishedCampuses.map((campus) => ({ id: campus.id, name: campus.name, buildings: publishedEventBuildingOptions(campus) }))} initialCampusId={activeCampus?.id} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {editTarget && <EventDetailsModal overlay={editTarget} buildings={(() => { const campus = campuses?.find((item) => item.id === editTarget.campusId) ?? (activeCampus?.id === editTarget.campusId ? activeCampus : null); return campus ? publishedEventBuildingOptions(campus) : []; })()} onClose={() => setEditTarget(null)} onSave={handleEdit} />}
      <AlertDialog.Root open={Boolean(withdrawTarget)} onOpenChange={(open) => { if (!open && !busy) setWithdrawTarget(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" /><AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl"><AlertDialog.Title className="font-extrabold">Withdraw submission?</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm text-muted-foreground">This returns the event to Draft and removes it from the review queue. All saved locations, furniture, and labels stay. You can submit it again later.</AlertDialog.Description>{withdrawError && <p role="alert" className="mt-3 text-sm text-destructive">{withdrawError}</p>}<div className="mt-5 flex gap-2"><AlertDialog.Cancel asChild><button disabled={busy} className="min-h-11 flex-1 rounded-xl border border-border text-sm font-bold">Keep submitted</button></AlertDialog.Cancel><button type="button" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40" onClick={async () => { if (!withdrawTarget?.updatedAt) return; setBusy(true); setWithdrawError(""); try { await eventOverlayService.withdrawEventSubmission(withdrawTarget.id, withdrawTarget.updatedAt); setWithdrawTarget(null); toast.success("Submission withdrawn", "Your saved maps are now a draft."); await loadOverlays(); } catch (error) { setWithdrawError(error instanceof Error ? error.message : "Could not withdraw submission."); } finally { setBusy(false); } }}>{busy ? "Withdrawing…" : "Withdraw to draft"}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-extrabold text-foreground">Delete event proposal?</h2><p className="text-sm text-muted-foreground mt-2">This removes the event and all maps you added for it. It does not change the administrator-published map.</p></div>
              <button type="button" aria-label="Close" onClick={() => setDeleteTarget(null)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground">Cancel</button>
              <button type="button" onClick={() => void handleDelete()} disabled={busy} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Student Org event proposals and map submission dashboard. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock, Edit2, Loader2, MapPin, MessageSquare, Pencil, Plus, RefreshCw, Trash2, X, XCircle } from "lucide-react";
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
import type { CampusEventOverlay, EventLocationRef } from "../components/map-builder/types";

const STATUS_CONFIG: Record<EventOverlayStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { label: "Pending Review", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30", icon: Clock },
  approved: { label: "Approved", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30", icon: CheckCircle2 },
  disapproved: { label: "Needs Revision", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30", icon: XCircle },
};

export function StudentMyEventsPage() {
  const navigate = useNavigate();
  const { isStudentOrg, profile, loading: authLoading } = useStudentAuth();
  const {
    activeCampus,
    loading: campusLoading,
    error: campusError,
    isCached,
    refetch: refetchCampus,
  } = usePublishedCampus();
  const toast = useToast();
  const [overlays, setOverlays] = useState<CampusEventOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CampusEventOverlay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampusEventOverlay | null>(null);
  const [busy, setBusy] = useState(false);
  const buildings = useMemo(
    () => activeCampus ? publishedEventBuildingOptions(activeCampus) : [],
    [activeCampus],
  );
  const canCreateProposal = Boolean(
    activeCampus && !campusLoading && !campusError && !isCached && buildings.length > 0,
  );
  const overlayRequestSequence = useRef(0);

  const loadOverlays = useCallback(async () => {
    const requestSequence = ++overlayRequestSequence.current;
    if (!profile?.id || !activeCampus?.id) {
      if (requestSequence === overlayRequestSequence.current) {
        setOverlays([]);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const result = await eventOverlayService.listEventOverlays({
        campusId: activeCampus.id,
        createdByUserId: profile.id,
      });
      if (requestSequence === overlayRequestSequence.current) setOverlays(result);
    } catch {
      if (requestSequence === overlayRequestSequence.current) setOverlays([]);
    } finally {
      if (requestSequence === overlayRequestSequence.current) setLoading(false);
    }
  }, [profile?.id, activeCampus?.id]);

  useEffect(() => {
    if (isStudentOrg && !campusLoading) void loadOverlays();
    return () => { overlayRequestSequence.current += 1; };
  }, [isStudentOrg, campusLoading, loadOverlays]);

  const handleCreate = async (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string }) => {
    if (!canCreateProposal || !activeCampus) {
      throw new Error("A fresh published campus map is required before creating an event proposal.");
    }
    const overlay = await eventOverlayService.createEventOverlay(
      data,
      profile?.id || "unknown",
      activeCampus.id,
    );
    await loadOverlays();
    navigate(`/student/events/${overlay.id}/edit`);
  };

  const handleEdit = async (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string }) => {
    if (!editTarget) return;
    await eventOverlayService.updateEventOverlayDetails(editTarget.id, data);
    toast.success("Event updated", `"${data.title}" has been updated.`);
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
              const status = overlay.status || "pending";
              const config = STATUS_CONFIG[status];
              const StatusIcon = config.icon;
              const locations = normalizeEventOverlayLocations(overlay);
              const counts = countEventOverlayItems(locations);
              return (
                <motion.article key={overlay.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-extrabold text-foreground text-sm">{overlay.title}</h2>
                      <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0", config.bg, config.color)}>
                        <StatusIcon className="h-3 w-3" /> {config.label}
                      </span>
                    </div>
                    {overlay.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{overlay.description}</p>}
                    <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span><strong className="text-foreground">{locations.length} location{locations.length === 1 ? "" : "s"}</strong> · {locations.map((location) => location.locationRef.label).join(" · ") || "No location set"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold text-muted-foreground px-2 py-1 rounded-full bg-muted">{counts.furniture} furniture</span>
                      <span className="text-[10px] font-bold text-muted-foreground px-2 py-1 rounded-full bg-muted">{counts.labels} labels</span>
                    </div>
                  </div>
                  {status === "disapproved" && overlay.adminComment && (
                    <div className="px-5 py-3 border-t border-border bg-red-50/50 dark:bg-red-900/10 flex items-start gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                      <div><p className="text-[10px] font-bold text-red-600 uppercase">GSO feedback</p><p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{overlay.adminComment}</p></div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                    <button type="button" onClick={() => setEditTarget(overlay)} className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-primary/30 text-xs font-bold text-primary hover:bg-primary/10"><Pencil className="h-3.5 w-3.5" /> Edit details</button>
                    <Link to={`/student/events/${overlay.id}/edit`} className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted"><Edit2 className="h-3.5 w-3.5" /> {status === "disapproved" ? "Revise maps" : "Edit maps"}</Link>
                    <button type="button" onClick={() => setDeleteTarget(overlay)} className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <EventProposalModal buildings={buildings} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {editTarget && <EventDetailsModal overlay={editTarget} buildings={buildings} onClose={() => setEditTarget(null)} onSave={handleEdit} />}
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

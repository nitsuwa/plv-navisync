import { useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertCircle, ArrowLeft, Eye, Loader2, MapPin } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { EventFloorEditor } from "../components/events/EventFloorEditor";
import { EventLocationSwitcher } from "../components/events/EventLocationSwitcher";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { eventOverlayService } from "../services/eventOverlayService";
import { normalizeEventOverlayLocations } from "../lib/eventOverlayModel";
import { formatEventSubmissionTime } from "../lib/eventSubmissionTime";
import { feedbackPinsWithStatus, readEventFeedback, type EventFeedbackPin } from "../lib/eventFeedbackPins";
import { CAMPUS_GROUNDS_ID, resolveFloorPlanForEvent } from "../lib/eventLocationData";
import type { Campus, CampusEventOverlay, EventLocationRef } from "../components/map-builder/types";

function PreviewError({ message }: { message: string }) {
  return <div className="min-h-[60vh] flex items-center justify-center px-4"><div className="text-center max-w-md"><AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" /><h2 className="text-lg font-extrabold text-foreground mb-2">Preview unavailable</h2><p className="text-sm text-muted-foreground mb-5">{message}</p><Link to="/admin-dashboard/event-layouts" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back to event approvals</Link></div></div>;
}

function resolveLocationBaseMap(locationRef: EventLocationRef, campus: Campus | null) {
  if (locationRef.type === "campus") {
    return resolveFloorPlanForEvent(CAMPUS_GROUNDS_ID, undefined, campus);
  }
  if (!locationRef.buildingId) return null;
  const floorNumber = locationRef.floorId
    ? Number(locationRef.floorId.split("-f").pop())
    : undefined;
  return resolveFloorPlanForEvent(locationRef.buildingId, floorNumber, campus);
}

export function AdminEventLayoutPreviewPage({ previewOverlay, onClose, onAddFeedbackPin, onPinDraftChange }: { previewOverlay?: CampusEventOverlay; onClose?: () => void; onAddFeedbackPin?: (locationId: string, pin: EventFeedbackPin) => void; onPinDraftChange?: (dirty: boolean) => void } = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAdminAuth();
  const { activeCampus, campuses, loading: campusLoading, error: campusError } = usePublishedCampus();
  const [overlay, setOverlay] = useState<CampusEventOverlay | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinPoint, setPinPoint] = useState<{ x: number; y: number; locationId: string } | null>(null);
  const [pinComment, setPinComment] = useState("");
  const [placingPin, setPlacingPin] = useState(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  useEffect(() => { onPinDraftChange?.(Boolean(pinPoint || pinComment.trim())); }, [pinPoint, pinComment, onPinDraftChange]);

  useEffect(() => {
    if (previewOverlay) {
      setOverlay(previewOverlay);
      setActiveLocationId(current => { const requested = normalizeEventOverlayLocations(previewOverlay); return requested.some(location => location.id === current) ? current : requested[0]?.id || ""; });
      setLoading(false);
      return;
    }
    if (!id) {
      setError("No event ID provided.");
      setLoading(false);
      return;
    }
    eventOverlayService.getEventOverlay(id)
      .then((data) => {
        if (!data) {
          setError("The event overlay could not be found.");
          return;
        }
        setOverlay(data);
        setActiveLocationId(normalizeEventOverlayLocations(data)[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the preview."))
      .finally(() => setLoading(false));
  }, [id, previewOverlay]);

  const locations = useMemo(() => overlay ? normalizeEventOverlayLocations(overlay) : [], [overlay]);
  const activeLocation = locations.find((location) => location.id === activeLocationId) || locations[0];
  const eventCampus = useMemo(() => {
    if (!overlay?.campusId) return activeCampus;
    return campuses.find((campus) => campus.id === overlay.campusId) ?? null;
  }, [activeCampus, campuses, overlay?.campusId]);
  const eventCampusMissing = Boolean(overlay?.campusId && !eventCampus);
  const allLocationsResolvable = useMemo(() => {
    if (eventCampusMissing || locations.length === 0) return false;
    return locations.every(({ locationRef }) => resolveLocationBaseMap(locationRef, eventCampus) !== null);
  }, [eventCampus, eventCampusMissing, locations]);
  const floorPlan = useMemo(() => {
    if (!activeLocation || !allLocationsResolvable) return null;
    return resolveLocationBaseMap(activeLocation.locationRef, eventCampus);
  }, [activeLocation, allLocationsResolvable, eventCampus]);

  if (authLoading || loading || campusLoading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <PreviewError message="Only administrators can inspect submitted event maps." />;
  if (error || !overlay) return <PreviewError message={error || "The event overlay could not be found."} />;
  if (overlay.status === "draft") return <PreviewError message="This event is still a draft and has not been submitted to GSO." />;
  if (!activeLocation) return <PreviewError message="This event has no requested locations to preview." />;
  if (eventCampusMissing) return <PreviewError message={`The published campus for this event${campusError ? ` could not be loaded: ${campusError}` : " is no longer available"}. Return to the event approvals list and contact the campus administrator.`} />;
  if (!allLocationsResolvable) return <PreviewError message="One or more requested locations no longer have a published map on this event's campus." />;

  const locationRef = activeLocation.locationRef;
  if (!floorPlan) return <PreviewError message={`There is no published map for ${locationRef.label}.`} />;

  const focusedOverlay = { ...overlay, locationRef, eventFurniture: activeLocation.eventFurniture, eventLabels: activeLocation.eventLabels };
  const cancelPin = () => { setPinPoint(null); setPinComment(""); setPlacingPin(false); };
  const confirmDiscard = (action: () => void) => {
    if (pinPoint || pinComment.trim()) setDiscardAction(() => action);
    else action();
  };
  const pinCount = readEventFeedback(overlay.locationFeedback?.[activeLocation.id]).pins.length;
  return <div className={previewOverlay ? "flex h-full min-h-0 flex-col" : "flex h-[calc(100dvh-8rem)] min-h-[420px] flex-col"}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3 [@media(max-height:500px)]:py-2">
      <div className="min-w-0"><h1 className="text-sm font-extrabold">{overlay.title}</h1><p className="mt-1 text-xs text-muted-foreground [@media(max-height:500px)]:hidden">Read-only · {locations.length} requested locations · Submitted {formatEventSubmissionTime(overlay.submittedAt)}</p></div>
      {onAddFeedbackPin && <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{pinCount}/30 pins</span><button type="button" disabled={!placingPin && pinCount >= 30} aria-pressed={placingPin} onClick={() => { if (placingPin) confirmDiscard(cancelPin); else setPlacingPin(true); }} className="min-h-10 rounded-xl border border-border bg-primary/5 px-3 text-xs font-bold text-primary disabled:opacity-40">{placingPin ? "Cancel pin placement" : "Add pin"}</button></div>}
    </div>
    <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-3 py-2" aria-label="Requested locations">{locations.map(location => <button key={location.id} type="button" aria-label={`${previewOverlay ? "View" : "Edit"} ${location.locationRef.label}`} aria-pressed={location.id === activeLocation.id} onClick={() => { if (location.id !== activeLocation.id) confirmDiscard(() => { cancelPin(); setActiveLocationId(location.id); }); }} className="min-h-10 shrink-0 rounded-xl border border-border px-3 text-xs font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground">{location.locationRef.label}</button>)}</div>
    {placingPin && <p role="status" className="shrink-0 bg-amber-500/10 px-3 py-2 text-xs text-foreground">{pinPoint ? "Draft pin marked on the map. Click another point to reposition, then save your comment." : "Click the map to position your feedback pin."}</p>}
    <div className="relative min-h-0 flex-1">
      <EventFloorEditor key={activeLocation.id} compactPreview floorPlan={floorPlan} overlay={focusedOverlay} activeCampus={eventCampus} feedbackPins={feedbackPinsWithStatus(overlay.locationFeedback?.[activeLocation.id], overlay.feedbackResolutions?.[activeLocation.id])} draftFeedbackPoint={pinPoint?.locationId === activeLocation.id ? pinPoint : null} onFeedbackPoint={onAddFeedbackPin && placingPin ? point => setPinPoint({ ...point, locationId: activeLocation.id }) : undefined} readOnly onSave={async () => {}} onSubmit={async () => {}} onBack={() => onClose ? onClose() : navigate("/admin-dashboard/event-layouts")} />
    </div>
    {pinPoint && onAddFeedbackPin && <div className="shrink-0 space-y-2 border-t border-border bg-card p-3"><p className="text-xs font-bold">New pin · {activeLocation.locationRef.label}</p><div className="flex flex-wrap items-center gap-2"><input autoFocus aria-label="Pin comment" maxLength={500} value={pinComment} onChange={event => setPinComment(event.target.value)} placeholder="Explain what needs to change at this point" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={!pinComment.trim() || pinCount >= 30} onClick={() => { onAddFeedbackPin(pinPoint.locationId, { id: crypto.randomUUID(), x: pinPoint.x, y: pinPoint.y, comment: pinComment.trim() }); cancelPin(); }} className="min-h-11 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40">Save pin</button><button type="button" onClick={() => confirmDiscard(cancelPin)} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold">Cancel</button></div><p className="text-[10px] text-muted-foreground">Feedback is committed when you approve or disapprove the proposal.</p></div>}
    <AlertDialog.Root open={Boolean(discardAction)} onOpenChange={open => { if (!open) setDiscardAction(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[130] bg-black/40" /><AlertDialog.Content className="fixed left-1/2 top-1/2 z-[131] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"><AlertDialog.Title className="font-bold">Discard this unsaved pin?</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm text-muted-foreground">The position and comment have not been added to your review yet.</AlertDialog.Description><div className="mt-5 flex flex-wrap justify-end gap-2"><AlertDialog.Cancel className="min-h-11 rounded-xl border border-border px-3 font-semibold">Keep pin draft</AlertDialog.Cancel><AlertDialog.Action onClick={() => discardAction?.()} className="min-h-11 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground">Discard pin</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}

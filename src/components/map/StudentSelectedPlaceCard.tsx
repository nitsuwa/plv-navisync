import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Navigation, Play, QrCode, X } from "lucide-react";
import type { RoomDest } from "../../lib/combinedPathfinding";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { LocationQR } from "./LocationQR";
import { StudentReportAction } from "./StudentReportAction";
import { StudentEmergencyVideoCard, type EmergencyVideoPlaybackState } from "./StudentEmergencyVideoCard";
import { StudentRoomVideoCard } from "./StudentRoomVideoCard";
import type { RoomEmergencyEvacuationConfiguration } from "../map-builder/types";
import { getPublishedRoomPhotoUrl, invalidatePublishedRoomPhotoUrl } from "../../services/roomPhotoService";

interface StudentSelectedPlaceCardProps {
  room: RoomDest;
  onDirections: () => void;
  onStartHere: () => void;
  onReport: () => void;
  onClose: () => void;
  campusId?: string;
  floorId?: string;
  description?: string;
  roomPhotoPath?: string;
  buildingId?: string;
  suspendedForFloorPicker?: boolean;
  suspendedForSearch?: boolean;
  /** Hides route actions while the same room card is reused in Discover PLV. */
  hideRouteActions?: boolean;
  emergencyVideoGuide?: RoomEmergencyEvacuationConfiguration["videoGuide"];
  emergencyVideoRouteFingerprint?: string;
  emergencyMode?: boolean;
  emergencyVideoPlaybackState?: EmergencyVideoPlaybackState;
  emergencyVideoAutoplayEnabled?: boolean;
  onWatchEmergencyVideo?: () => void;
  onEmergencyVideoPlaybackStateChange?: (state: EmergencyVideoPlaybackState) => void;
}

export function StudentSelectedPlaceCard({
  room,
  onDirections,
  onStartHere,
  onReport,
  onClose,
  campusId,
  floorId,
  description,
  roomPhotoPath,
  buildingId = room.buildingId,
  suspendedForFloorPicker = false,
  suspendedForSearch = false,
  hideRouteActions = false,
  emergencyVideoGuide,
  emergencyVideoRouteFingerprint,
  emergencyMode = false,
  emergencyVideoPlaybackState,
  emergencyVideoAutoplayEnabled = true,
  onWatchEmergencyVideo,
  onEmergencyVideoPlaybackStateChange,
}: StudentSelectedPlaceCardProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const [sheetState, setSheetState] = useState<"default" | "expanded">("default");
  const [hasRoomVideo, setHasRoomVideo] = useState(false);
  const [roomPhotoResult, setRoomPhotoResult] = useState<{ key: string; url: string } | null>(null);
  const [roomPhotoLoadingKey, setRoomPhotoLoadingKey] = useState<string | null>(null);
  const roomPhotoLookupKey = JSON.stringify([campusId, buildingId, floorId, room.roomId, roomPhotoPath]);
  const roomPhotoUrl = roomPhotoResult?.key === roomPhotoLookupKey ? roomPhotoResult.url : null;
  const hasAdditionalDetails = Boolean(description?.trim() || roomPhotoPath || hasRoomVideo);
  const stateBeforePickerRef = useRef<"default" | "expanded" | null>(null);
  const roomIdentityKey = JSON.stringify([campusId, room.buildingId, room.floorNumber, room.roomId]);
  const manualSheetChoiceRef = useRef({ roomIdentityKey, selected: false });
  if (manualSheetChoiceRef.current.roomIdentityKey !== roomIdentityKey) {
    manualSheetChoiceRef.current = { roomIdentityKey, selected: false };
  }
  const handleGestureRef = useRef<{ pointerId: number; startY: number; moved: boolean } | null>(null);
  const handleMovedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const handleRoomVideoExpanded = useCallback((expanded: boolean) => {
    // An arriving video should make its player visible on first selection, but
    // must not override a compact/expanded choice the student already made.
    if (expanded && !manualSheetChoiceRef.current.selected) setSheetState("expanded");
  }, []);
  const handleRoomVideoAvailability = useCallback((available: boolean) => {
    setHasRoomVideo(available);
  }, []);
  const scrollableDetails = sheetState === "expanded" && (hasAdditionalDetails || Boolean(campusId));

  useEffect(() => {
    setSheetState("default");
    setHasRoomVideo(false);
  }, [campusId, room.buildingId, room.floorNumber, room.roomId]);

  useEffect(() => {
    let current = true;
    let loadingTimer: number | undefined;
    setRoomPhotoResult(null);
    setRoomPhotoLoadingKey(null);
    if (!campusId || !buildingId || !floorId || !roomPhotoPath) return () => { current = false; };
    // Only reserve a compact media slot after a real published image lookup has
    // taken long enough to be perceptible. Rooms without photos never show it.
    loadingTimer = window.setTimeout(() => {
      if (current) setRoomPhotoLoadingKey(roomPhotoLookupKey);
    }, 250);
    void getPublishedRoomPhotoUrl({
      campusId,
      buildingId,
      floorId,
      roomId: room.roomId,
      path: roomPhotoPath,
    }).then(async (url) => {
      if (!url) return;
      const image = typeof Image === "undefined" ? null : new Image();
      if (image) {
        if (typeof image.decode === "function") {
          const imageLoaded = await new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (didLoad: boolean) => {
              if (settled) return;
              settled = true;
              image.onload = null;
              image.onerror = null;
              resolve(didLoad);
            };
            image.onload = () => finish(true);
            image.onerror = () => finish(false);
            image.src = url;
            if (image.complete) finish(image.naturalWidth > 0);
          });
          if (!imageLoaded) return;

          // Decode before revealing the image when it finishes promptly. A
          // successful load is enough if decode() stalls or rejects.
          let decodeTimeout: number | undefined;
          const decode = Promise.resolve()
            .then(() => image.decode())
            .then(() => undefined, () => undefined);
          await Promise.race([
            decode,
            new Promise<void>((resolve) => { decodeTimeout = window.setTimeout(resolve, 180); }),
          ]);
          if (decodeTimeout !== undefined) window.clearTimeout(decodeTimeout);
        } else {
          // Older browsers can still display the image, but cannot predecode it.
          image.src = url;
        }
      }
      if (current) setRoomPhotoResult({ key: roomPhotoLookupKey, url });
    }).catch(() => {
      // A missing, unpublished, or inaccessible photo stays out of Student UI.
    }).finally(() => {
      if (current) setRoomPhotoLoadingKey(null);
    });
    return () => {
      current = false;
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
    };
  }, [campusId, buildingId, floorId, room.roomId, roomPhotoLookupKey, roomPhotoPath]);

  useEffect(() => {
    if (suspendedForFloorPicker) {
      if (stateBeforePickerRef.current === null) stateBeforePickerRef.current = sheetState;
      if (sheetState !== "default") setSheetState("default");
      return;
    }
    if (stateBeforePickerRef.current !== null) {
      const restore = stateBeforePickerRef.current;
      stateBeforePickerRef.current = null;
      if (sheetState !== restore) setSheetState(restore);
    }
  }, [sheetState, suspendedForFloorPicker]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (suspendedForFloorPicker || (event.pointerType === "mouse" && event.button !== 0)) return;
    handleGestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      moved: false,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable in embedded browsers. */ }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = handleGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - gesture.startY) > 8) gesture.moved = true;
    if (gesture.moved) event.preventDefault();
  };

  const finishHandleGesture = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = handleGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    handleGestureRef.current = null;
    handleMovedRef.current = !cancelled && gesture.moved;
    if (!cancelled && gesture.moved) {
      const delta = event.clientY - gesture.startY;
      if (delta < -24) {
        manualSheetChoiceRef.current.selected = true;
        setSheetState("expanded");
      } else if (delta > 24) {
        manualSheetChoiceRef.current.selected = true;
        setSheetState("default");
      }
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture may already have been released by the browser. */ }
  };

  const toggleExpanded = () => {
    if (handleMovedRef.current) {
      handleMovedRef.current = false;
      return;
    }
    if (hasAdditionalDetails) {
      manualSheetChoiceRef.current.selected = true;
      setSheetState((value) => value === "default" ? "expanded" : "default");
    }
  };

  const publishedVideoGuide = emergencyVideoGuide?.enabled
    && emergencyVideoGuide.videoId
    && emergencyVideoGuide.reviewStatus === "approved"
    && emergencyVideoGuide.reviewedRouteFingerprint === emergencyVideoRouteFingerprint
    && emergencyVideoRouteFingerprint
    ? emergencyVideoGuide
    : null;

  return (
    <>
      <div
        data-no-drag
        data-testid="student-room-and-video-stack"
        data-suspended-for-search={suspendedForSearch}
        aria-hidden={suspendedForSearch || undefined}
        inert={suspendedForSearch ? ("" as never) : undefined}
        className={`fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[55] flex max-h-[var(--student-map-mobile-panel-max-height,calc(100dvh-9rem-env(safe-area-inset-bottom,0px)))] flex-col-reverse gap-2 overflow-y-auto overscroll-contain md:absolute md:inset-x-auto md:bottom-auto md:left-auto md:right-3 md:top-[calc(env(safe-area-inset-top,0px)+4.5rem)] md:max-h-[calc(100%-5.5rem)] md:flex-col md:overflow-y-auto ${hasRoomVideo ? "md:w-[min(440px,calc(100vw-1.5rem))]" : "md:w-[min(380px,calc(100vw-1.5rem))]"} ${suspendedForSearch ? "invisible pointer-events-none" : ""}`}
      >
      <motion.section
        key={`${room.buildingId}:${room.floorNumber}:${room.roomId}`}
        data-testid="student-selected-place-card"
        data-map-layer="room-sheet"
        data-sheet-state={sheetState}
        data-no-drag
        aria-hidden={suspendedForSearch || undefined}
        inert={suspendedForSearch ? ("" as never) : undefined}
        aria-label={`${room.roomName} place details`}
        initial={reducedMotion ? false : { opacity: 0, y: -7, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.99 }}
        transition={reducedMotion
          ? { duration: 0.01, layout: { duration: 0.01 } }
          : { duration: 0.19, ease: "easeOut", layout: { duration: 0.22, ease: "easeOut" }}}
        layout="size"
        className={`map-layer-room-sheet relative isolate flex max-h-[var(--student-map-mobile-panel-max-height,calc(100dvh-10rem-env(safe-area-inset-bottom,0px)))] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card bg-clip-padding text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.2)] transition-[height] duration-200 ease-out motion-reduce:transition-none md:max-h-none ${suspendedForSearch ? "invisible pointer-events-none" : ""}`}
        style={{ height: "auto" }}
        onPointerDown={(event) => { if ((event.target as HTMLElement).closest("button")) event.stopPropagation(); }}
      >
        <div className="grid h-10 shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b border-border/50 px-2 md:hidden">
          <span aria-hidden="true" />
          {hasAdditionalDetails ? (
            <button
              type="button"
              data-testid="student-room-sheet-handle"
              aria-label={sheetState === "expanded" ? "Collapse room information" : "Expand room information"}
              aria-expanded={sheetState === "expanded"}
              disabled={suspendedForFloorPicker}
              className="relative flex h-10 touch-none items-center justify-center text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => finishHandleGesture(event)}
              onPointerCancel={(event) => finishHandleGesture(event, true)}
              onLostPointerCapture={(event) => finishHandleGesture(event, true)}
              onClick={toggleExpanded}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); manualSheetChoiceRef.current.selected = true; setSheetState("expanded"); }
                if (event.key === "ArrowDown" || event.key === "Home") { event.preventDefault(); event.stopPropagation(); manualSheetChoiceRef.current.selected = true; setSheetState("default"); }
              }}
            >
              <span className="h-1 w-9 rounded-full bg-muted-foreground/25" />
              <ChevronDown className={`absolute right-1 h-4 w-4 transition-transform motion-reduce:transition-none ${sheetState === "expanded" ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          ) : <span aria-hidden="true" />}
          <button type="button" onClick={onClose} aria-label="Close selected place" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
        </div>

        <div
          className={`flex min-h-0 flex-col px-3 pb-2.5 md:p-3 ${scrollableDetails ? "flex-none overflow-y-auto overscroll-contain" : "shrink-0"}`}
          style={scrollableDetails ? { maxHeight: "max(0px, calc(var(--student-map-mobile-panel-max-height, 60dvh) - 6.5rem))" } : undefined}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary md:h-9 md:w-9 md:rounded-xl">
              <Navigation className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-2">
                <h2 className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] font-extrabold leading-tight sm:text-[14px]">{room.roomName}</h2>
                <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-muted-foreground">Room</span>
              </div>
              <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                <span className="min-w-0 truncate" title={room.buildingLabel}>{room.buildingLabel}</span>
                <span aria-hidden="true" className="shrink-0">·</span>
                <span data-testid="student-room-floor-context" className="shrink-0 whitespace-nowrap" title={room.floorLabel ?? `Floor ${room.floorNumber}`}>
                  {room.floorLabel ?? `Floor ${room.floorNumber}`}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => setQrOpen(true)} aria-label="Show room QR" title="Show room QR" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <QrCode className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={onClose} aria-label="Close selected place" className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:flex">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {sheetState === "default" && description?.trim() && <p data-testid="student-room-description-preview" className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
          {sheetState === "default" && (roomPhotoPath || hasRoomVideo) && <div data-testid="student-room-content-hints" className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold text-muted-foreground">
            {roomPhotoPath && <span className="rounded-full bg-muted px-2 py-1">Photo available</span>}
            {hasRoomVideo && <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">Room video</span>}
          </div>}
          {campusId && <div className={sheetState === "expanded" ? "" : "hidden"} aria-hidden={sheetState !== "expanded"}>
            <StudentRoomVideoCard
              key={`${campusId}:${room.roomId}:${hideRouteActions ? "discover" : "map"}`}
              campusId={campusId}
              roomId={room.roomId}
              roomName={room.roomName}
              onExpandedChange={handleRoomVideoExpanded}
              onVideoAvailabilityChange={handleRoomVideoAvailability}
              className="mt-2"
            />
          </div>}
          {sheetState === "expanded" && roomPhotoLoadingKey === roomPhotoLookupKey && !roomPhotoUrl && <div data-testid="student-room-photo-loading" role="status" aria-label="Loading room photo" className="mt-2 aspect-[4/3] max-h-48 w-full animate-pulse rounded-xl border border-border/70 bg-muted/40 motion-reduce:animate-none" />}
          {sheetState === "expanded" && roomPhotoUrl && (
            <motion.figure
              data-testid="student-room-photo"
              layout
              initial={reducedMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reducedMotion ? { duration: 0.01 } : { duration: 0.22, ease: "easeOut" }}
              className="mt-2 aspect-[4/3] max-h-48 overflow-hidden rounded-xl border border-border/70 bg-muted/10 p-1.5"
            >
              <img
                src={roomPhotoUrl}
                alt={room.roomName}
                className="h-full w-full rounded-lg object-contain"
                loading="lazy"
                decoding="async"
                onError={() => {
                  if (roomPhotoResult?.key !== roomPhotoLookupKey) return;
                  invalidatePublishedRoomPhotoUrl({ campusId: campusId!, buildingId: buildingId!, floorId: floorId!, roomId: room.roomId, path: roomPhotoPath! });
                  setRoomPhotoResult(null);
                }}
              />
            </motion.figure>
          )}
          {sheetState === "expanded" && hasAdditionalDetails && (
            <div data-testid="student-room-sheet-details" className="mt-3 space-y-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{room.buildingLabel}</p>
              <p>{room.floorLabel ?? `Floor ${room.floorNumber}`}</p>
              {description?.trim() && <section aria-labelledby="student-room-about-title" className="space-y-1">
                <h3 id="student-room-about-title" className="text-[10px] font-extrabold uppercase tracking-wide text-foreground">About This Room</h3>
                <p className="whitespace-pre-wrap leading-relaxed">{description}</p>
              </section>}
            </div>
          )}

        </div>
        <div data-testid="room-action-footer" className={`grid shrink-0 gap-1.5 border-t border-border/50 bg-card px-3 pb-[max(.5rem,env(safe-area-inset-bottom,0px))] pt-2 ${hideRouteActions ? "grid-cols-1" : "grid-cols-3"}`}>
            {!hideRouteActions && <>
            <button type="button" onClick={onDirections} className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl bg-primary px-1.5 text-[10px] font-extrabold text-primary-foreground shadow-sm transition-[filter,background-color] hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:gap-1.5 sm:px-2 sm:text-[11px]">
              <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Directions
            </button>
            <button type="button" onClick={onStartHere} title="Start here" className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl border border-border bg-card px-1.5 text-[10px] font-extrabold text-foreground transition-colors hover:bg-muted active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:gap-1.5 sm:px-2 sm:text-[11px]">
              <Play className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />Start
            </button>
            <StudentReportAction testId="room-report" ariaLabel="Report this room" onClick={onReport} className="min-h-10 gap-1 px-1.5 text-[10px] active:scale-100 sm:gap-1.5 sm:px-2 sm:text-[11px]" />
            </>}
            {hideRouteActions && <StudentReportAction testId="room-report" ariaLabel="Report this room" onClick={onReport} className="min-h-10 gap-1 px-1.5 text-[10px] active:scale-100 sm:gap-1.5 sm:px-2 sm:text-[11px]" />}
        </div>
      </motion.section>
      {publishedVideoGuide && emergencyVideoRouteFingerprint && campusId && (
        emergencyMode ? (
          <button
            type="button"
            data-testid="watch-emergency-video-compact"
            onClick={onWatchEmergencyVideo}
            className="flex min-h-11 w-full shrink-0 items-center gap-2 rounded-2xl border border-primary/20 bg-card/95 px-3 text-left text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-extrabold uppercase tracking-wide text-primary">Supplementary guide</span><span className="block truncate text-[11px] font-bold">Watch evacuation video</span></span>
          </button>
        ) : (
          <StudentEmergencyVideoCard
            key={`${publishedVideoGuide.videoId}:${emergencyVideoRouteFingerprint}`}
            campusId={campusId}
            roomId={room.roomId}
            roomName={room.roomName}
            videoId={publishedVideoGuide.videoId!}
            title={publishedVideoGuide.title}
            routeFingerprint={emergencyVideoRouteFingerprint}
            autoplayEnabled={emergencyVideoAutoplayEnabled}
            initialPlaybackState={emergencyVideoPlaybackState}
            onPlaybackStateChange={onEmergencyVideoPlaybackStateChange}
          />
        )
      )}
      </div>

      <AnimatePresence>
        {qrOpen && (
          <motion.div
            data-no-drag
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) setQrOpen(false); }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="room-location-qr-title"
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl"
              initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.16 }}
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="room-location-qr-title" className="truncate text-sm font-extrabold">Room location QR</h2>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{room.roomName} · {room.buildingLabel} · {room.floorLabel ?? `Floor ${room.floorNumber}`}</p>
                </div>
                <button type="button" onClick={() => setQrOpen(false)} aria-label="Close room QR" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <LocationQR
                  displaySize="large"
                  buildingId={room.buildingId}
                  buildingName={room.buildingLabel}
                  campusId={campusId}
                  roomId={room.roomId}
                  roomName={room.roomName}
                  floorId={floorId}
                  floorNumber={room.floorNumber}
                />
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

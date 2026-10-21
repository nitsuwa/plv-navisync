import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Play, X } from "lucide-react";
import { StudentEmergencyVideoCard, type EmergencyVideoPlaybackState } from "./StudentEmergencyVideoCard";

export interface StudentEmergencyVideoOverlayProps {
  campusId: string;
  roomId: string;
  roomName: string;
  videoId: string;
  title?: string;
  routeFingerprint: string;
  playbackState: EmergencyVideoPlaybackState;
  routePaused: boolean;
  routeTransitioning?: boolean;
  hasActiveRoute: boolean;
  onPlaybackStateChange: (state: EmergencyVideoPlaybackState) => void;
  onClose: () => void;
  onResumeRoute: () => void;
}

/**
 * The focused video viewer used while a student is inspecting an emergency
 * route. It owns the player in a body portal so the map's renderer and other
 * floating panels cannot clip it or receive clicks underneath it.
 */
export function StudentEmergencyVideoOverlay({
  campusId,
  roomId,
  roomName,
  videoId,
  title,
  routeFingerprint,
  playbackState,
  routePaused,
  routeTransitioning = false,
  hasActiveRoute,
  onPlaybackStateChange,
  onClose,
  onResumeRoute,
}: StudentEmergencyVideoOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="student-emergency-video-overlay"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title || `${roomName} evacuation guide`}
        className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-xl overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card p-3 text-foreground shadow-2xl sm:p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="student-emergency-video-overlay-title" className="truncate text-base font-extrabold">Evacuation video</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close evacuation video" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <StudentEmergencyVideoCard
          key={`${campusId}:${roomId}:${videoId}:${routeFingerprint}`}
          campusId={campusId}
          roomId={roomId}
          roomName={roomName}
          videoId={videoId}
          title={title}
          routeFingerprint={routeFingerprint}
          autoplayEnabled={false}
          initialExpanded
          initialPlaybackState={playbackState}
          onPlaybackStateChange={onPlaybackStateChange}
        />

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={onClose} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-extrabold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {hasActiveRoute ? "Return to route" : "Return to route options"}
          </button>
          {hasActiveRoute && routePaused && (
            <button type="button" onClick={onResumeRoute} disabled={routeTransitioning} aria-label={routeTransitioning ? "Wait for the floor transition before resuming navigation" : "Resume route"} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-wait disabled:opacity-60">
              {!routeTransitioning && <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}{routeTransitioning ? "Finishing floor transition…" : "Resume route"}
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">{routeTransitioning ? "Wait for the floor change to finish." : "Route paused until you resume."}</p>
      </section>
    </div>,
    document.body,
  );
}

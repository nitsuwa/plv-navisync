import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Navigation, Play, QrCode, X } from "lucide-react";
import type { RoomDest } from "../../lib/combinedPathfinding";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { LocationQR } from "./LocationQR";
import { StudentReportAction } from "./StudentReportAction";

interface StudentSelectedPlaceCardProps {
  room: RoomDest;
  onDirections: () => void;
  onStartHere: () => void;
  onReport: () => void;
  onClose: () => void;
  campusId?: string;
  floorId?: string;
}

export function StudentSelectedPlaceCard({ room, onDirections, onStartHere, onReport, onClose, campusId, floorId }: StudentSelectedPlaceCardProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <>
      <motion.section
        key={`${room.buildingId}:${room.floorNumber}:${room.roomId}`}
        data-testid="student-selected-place-card"
        data-no-drag
        aria-label={`${room.roomName} place details`}
        initial={reducedMotion ? false : { opacity: 0, y: -7, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.99 }}
        transition={reducedMotion ? { duration: 0.01 } : { duration: 0.19, ease: "easeOut" }}
        className="absolute left-3 right-3 top-[var(--student-map-room-card-top,calc(env(safe-area-inset-top,0px)+4.25rem))] z-40 rounded-2xl border border-white/55 bg-card/96 p-3 text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 sm:left-3 sm:right-auto sm:w-[min(380px,calc(100vw-1.5rem))] md:left-auto md:right-3 md:top-[calc(env(safe-area-inset-top,0px)+3.8rem)]"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Navigation className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-2">
              <h2 className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] font-extrabold leading-tight sm:text-[14px]">{room.roomName}</h2>
              <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-muted-foreground">Room</span>
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground" title={`${room.buildingLabel} · ${room.floorLabel ?? `Floor ${room.floorNumber}`}`}>
              {room.buildingLabel} · {room.floorLabel ?? `Floor ${room.floorNumber}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={() => setQrOpen(true)} aria-label="Show room QR" title="Show room QR" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <QrCode className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={onClose} aria-label="Close selected place" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <button type="button" onClick={onDirections} className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl bg-primary px-1.5 text-[10px] font-extrabold text-primary-foreground shadow-sm transition-[transform,filter] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:gap-1.5 sm:px-2 sm:text-[11px]">
            <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Directions
          </button>
          <button type="button" onClick={onStartHere} title="Start here" className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl border border-border bg-card px-1.5 text-[10px] font-extrabold text-foreground transition-colors hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:gap-1.5 sm:px-2 sm:text-[11px]">
            <Play className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />Start
          </button>
          <StudentReportAction testId="room-report" ariaLabel="Report this room" onClick={onReport} className="min-h-10 gap-1 px-1.5 text-[10px] sm:gap-1.5 sm:px-2 sm:text-[11px]" />
        </div>
      </motion.section>

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

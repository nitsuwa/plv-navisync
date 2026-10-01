import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Flag, MoreHorizontal, Navigation, Play, X } from "lucide-react";
import type { RoomDest } from "../../lib/combinedPathfinding";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface StudentSelectedPlaceCardProps {
  room: RoomDest;
  onDirections: () => void;
  onStartHere: () => void;
  onReport: () => void;
  onClose: () => void;
}

export function StudentSelectedPlaceCard({ room, onDirections, onStartHere, onReport, onClose }: StudentSelectedPlaceCardProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
      <motion.section
        key={`${room.buildingId}:${room.floorNumber}:${room.roomId}`}
        data-testid="student-selected-place-card"
        data-no-drag
        aria-label={`${room.roomName} place details`}
        initial={reducedMotion ? false : { opacity: 0, y: -7, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.99 }}
        transition={reducedMotion ? { duration: 0.01 } : { duration: 0.18, ease: "easeOut" }}
        className="absolute left-2 right-2 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] z-40 rounded-2xl border border-white/50 bg-card/95 p-3 text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 sm:left-3 sm:right-auto sm:w-[min(360px,calc(100vw-1.5rem))] md:left-auto md:right-3 md:top-[calc(env(safe-area-inset-top,0px)+3.8rem)]"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Navigation className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-[14px] font-extrabold leading-tight">{room.roomName}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-muted-foreground">Room</span>
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{room.buildingLabel} · {room.floorLabel ?? `Floor ${room.floorNumber}`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close selected place" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" onClick={onDirections} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-[11px] font-extrabold text-primary-foreground shadow-sm transition-[transform,filter] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Navigation className="h-3.5 w-3.5" />Directions</button>
          <button type="button" onClick={onStartHere} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-extrabold text-foreground transition-colors hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Play className="h-3 w-3 fill-current" />Start</button>
          <div className="relative">
            <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label="More place actions" aria-expanded={moreOpen} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><MoreHorizontal className="h-4 w-4" /></button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div initial={reducedMotion ? false : { opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.14 }} className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-xl border border-border/70 bg-card p-1 shadow-xl">
                  <button type="button" onClick={() => { setMoreOpen(false); onReport(); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] font-bold text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Flag className="h-3.5 w-3.5" />Report a room issue</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>
  );
}

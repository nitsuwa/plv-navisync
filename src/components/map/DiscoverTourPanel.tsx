import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Compass, DoorOpen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface DiscoverTourBuilding {
  name: string;
  code: string;
  description?: string;
  coverImageUrl?: string;
  adjacentCoverImageUrls?: readonly (string | null | undefined)[];
  floorCount: number;
}

export type DiscoverTourView = "showcase" | "inside";

interface DiscoverTourPanelProps {
  open: boolean;
  view: DiscoverTourView;
  building?: DiscoverTourBuilding;
  adjacentCoverImageUrls?: readonly (string | null | undefined)[];
  stopIndex: number;
  stopCount: number;
  mobileExpanded?: boolean;
  onMobileExpandedChange?: (expanded: boolean) => void;
  reducedMotion?: boolean;
  navigationGuard?: boolean;
  unavailable?: boolean;
  roomSelected?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onEnter: () => void;
  onBack: () => void;
  onExit: () => void;
  onEndNavigationAndStart?: () => void;
  onCancelNavigationGuard?: () => void;
}

export function DiscoverTourPanel({
  open,
  view,
  building,
  adjacentCoverImageUrls = [],
  stopIndex,
  stopCount,
  mobileExpanded: controlledMobileExpanded,
  onMobileExpandedChange,
  reducedMotion = false,
  navigationGuard = false,
  unavailable = false,
  onPrevious,
  onNext,
  onEnter,
  onBack,
  onExit,
  onEndNavigationAndStart,
  onCancelNavigationGuard,
}: DiscoverTourPanelProps) {
  const [localMobileExpanded, setLocalMobileExpanded] = useState(false);
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const [displayedCover, setDisplayedCover] = useState<{ url: string; name: string } | null>(null);
  const [loadedCoverCandidate, setLoadedCoverCandidate] = useState<{ url: string; name: string } | null>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const wasOpenRef = useRef(open);
  const sheetHandleDragStart = useRef<{ pointerId: number; y: number } | null>(null);
  const isInside = view === "inside";
  const mobileExpanded = controlledMobileExpanded ?? localMobileExpanded;
  const coverImageUrl = building?.coverImageUrl?.trim() || undefined;
  const coverImageUrlRef = useRef(coverImageUrl);
  coverImageUrlRef.current = coverImageUrl;
  const showCover = Boolean(coverImageUrl && coverImageUrl !== failedCoverUrl);
  const displayedCurrentCover = displayedCover?.url === coverImageUrl ? displayedCover : null;
  const adjacentCoverSignature = adjacentCoverImageUrls.filter((url): url is string => Boolean(url?.trim())).join("\u0000");
  const coverLoading = Boolean(showCover && coverImageUrl && displayedCover?.url !== coverImageUrl);
  const changeMobileExpanded = (expanded: boolean) => {
    if (controlledMobileExpanded === undefined) setLocalMobileExpanded(expanded);
    onMobileExpandedChange?.(expanded);
  };

  const beginSheetHandleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    sheetHandleDragStart.current = { pointerId: event.pointerId, y: event.clientY };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional in embedded browsers. */ }
    }
  };

  const finishSheetHandleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = sheetHandleDragStart.current;
    sheetHandleDragStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaY = start.y - event.clientY;
    if (deltaY > 36) changeMobileExpanded(true);
    else if (deltaY < -36) changeMobileExpanded(false);
  };

  useEffect(() => {
    setFailedCoverUrl(null);
    setLoadedCoverCandidate(null);
  }, [building?.code, building?.coverImageUrl]);

  useEffect(() => {
    if (typeof Image === "undefined" || !adjacentCoverSignature) return;
    adjacentCoverSignature.split("\u0000").forEach((url) => {
      const preload = new Image();
      preload.decoding = "async";
      preload.src = url;
    });
  }, [adjacentCoverSignature]);

  useLayoutEffect(() => {
    if (!isInside && scrollContentRef.current) scrollContentRef.current.scrollTop = scrollPositionRef.current;
  }, [isInside]);

  useEffect(() => {
    if (open && !wasOpenRef.current) scrollPositionRef.current = 0;
    wasOpenRef.current = open;
  }, [open]);

  return (
    <AnimatePresence initial={false}>
      {open && (navigationGuard ? (
        <motion.div
          key="discover-navigation-guard"
          data-no-drag
          data-testid="discover-navigation-guard"
          className="absolute inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.14 }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="discover-navigation-guard-title" className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-300"><Compass className="h-5 w-5" aria-hidden="true" /></div>
            <h2 id="discover-navigation-guard-title" className="text-base font-extrabold">End navigation before the tour?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">Discover PLV is a separate campus exploration. Your active route must be ended before the tour can begin.</p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={onCancelNavigationGuard} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-bold text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">Keep Navigation</button>
              <button type="button" onClick={onEndNavigationAndStart} className="min-h-11 rounded-xl bg-sky-500 px-3 text-sm font-extrabold text-white hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">End Navigation &amp; Start Tour</button>
            </div>
          </section>
        </motion.div>
      ) : (
        <motion.aside
          key="discover-tour-panel"
          data-no-drag
          data-testid="discover-tour-panel"
          aria-label="Discover PLV tour controls"
          layout
          className={`absolute z-[52] flex min-h-0 flex-col overflow-hidden border border-border/80 bg-card/95 text-foreground shadow-2xl backdrop-blur-2xl ${isInside
            ? "left-[max(0.75rem,env(safe-area-inset-left,0.75rem))] top-[max(0.75rem,env(safe-area-inset-top,0.75rem))] h-fit min-h-[52px] w-fit max-w-[calc(100vw-11rem)] flex-row items-center rounded-2xl p-1.5 md:bottom-auto md:left-4 md:right-auto md:top-4 md:max-w-[calc(100vw-26rem)] md:p-1.5"
            : `${mobileExpanded ? "inset-x-0 bottom-[max(0px,env(safe-area-inset-bottom,0px))] max-h-[min(62dvh,34rem)]" : "inset-x-0 bottom-[max(0px,env(safe-area-inset-bottom,0px))] max-h-[min(40dvh,18rem)]"} rounded-t-3xl p-0 md:inset-y-auto md:bottom-auto md:left-auto md:right-4 md:top-4 md:h-fit md:w-[min(23rem,calc(100vw-2rem))] md:max-h-[calc(100%-2rem)] md:rounded-3xl md:p-5`}`}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
          transition={{ layout: { duration: reducedMotion ? 0 : 0.24, ease: "easeOut" }, duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
        >
          {isInside ? (
            <motion.div
              key="inside-header"
              data-testid="discover-inside-header"
              className="flex min-w-0 items-center gap-1.5 md:gap-2"
              initial={{ opacity: 0, x: reducedMotion ? 0 : -3 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.14 }}
            >
              <button type="button" onClick={onBack} aria-label="Back to Building" title="Back to Building" className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background/65 px-2.5 text-[11px] font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:px-3 md:text-sm">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="whitespace-nowrap">Back to Building</span>
              </button>
            </motion.div>
          ) : (
            <>
              <div
                data-testid="discover-sheet-handle"
                aria-hidden="true"
                onPointerDown={beginSheetHandleDrag}
                onPointerUp={finishSheetHandleDrag}
                onPointerCancel={() => { sheetHandleDragStart.current = null; }}
                onLostPointerCapture={() => { sheetHandleDragStart.current = null; }}
                className="mx-auto flex h-5 w-full shrink-0 touch-none select-none items-center justify-center text-muted-foreground md:hidden"
              >
                <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
              </div>

              <motion.div
                layout
                className="flex min-h-0 flex-1 flex-col md:overflow-y-auto md:overscroll-contain"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ layout: { duration: reducedMotion ? 0 : 0.24, ease: "easeOut" }, duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
              >
                <div ref={scrollContentRef} onScroll={(event) => { scrollPositionRef.current = event.currentTarget.scrollTop; }} data-testid="discover-panel-scroll-content" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 md:px-0">
                  <motion.div key={`building-info-${building?.code ?? "tour"}`} initial={{ opacity: 0.72, y: reducedMotion ? 0 : 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }} className="flex min-w-0 shrink-0 items-start gap-2.5 md:gap-3">
                    <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary md:flex"><Compass className="h-5 w-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-primary">Discover PLV</p>
                      {building ? (
                        <>
                          <h2 data-testid="discover-building-name" title={building.name} className={`mt-0.5 break-words text-base font-extrabold leading-tight sm:text-lg md:text-xl ${mobileExpanded ? "line-clamp-none" : "line-clamp-2 md:line-clamp-none"}`}>{building.name}</h2>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{building.code} <span className="hidden md:inline">· Building</span></p>
                        </>
                      ) : <h2 className="mt-0.5 text-lg font-extrabold">Campus tour</h2>}
                    </div>
                    <button type="button" onClick={onExit} aria-label="Exit Tour" title="Exit Tour" className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><span className="hidden min-[360px]:inline">Exit</span><X className="h-4 w-4" aria-hidden="true" /></button>
                  </motion.div>

                  {unavailable || !building ? (
                    <div className="my-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-4 text-center">
                      <p className="text-sm font-bold">No published buildings are available to explore yet.</p>
                      <p className="mt-1 text-xs text-muted-foreground">You can return to the Student Map and try again later.</p>
                    </div>
                  ) : (
                    <>
                      {showCover && (
                        <div data-testid="discover-building-cover" aria-busy={coverLoading} className={`${mobileExpanded ? "block" : "hidden md:block"} relative mt-3 h-32 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/20 md:h-36`}>
                          {coverLoading && <div data-testid="discover-cover-loading" role="status" aria-label={`Loading ${building.name} building cover`} className="absolute inset-0 z-10 flex flex-col justify-end gap-2 bg-card/25 p-3 backdrop-blur-[1px] motion-reduce:transition-none">
                            <span className="sr-only">Loading building photo</span>
                            <span aria-hidden="true" className="h-2.5 w-28 rounded-full bg-white/60 shadow-sm motion-safe:animate-pulse" />
                            <span aria-hidden="true" className="h-2.5 w-20 rounded-full bg-white/45 shadow-sm motion-safe:animate-pulse" />
                          </div>}
                          {displayedCurrentCover && <img
                            alt={`${building.name} building cover`}
                            src={displayedCurrentCover.url}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                          />}
                          {loadedCoverCandidate && loadedCoverCandidate.url === coverImageUrl ? (
                            <motion.img
                              key={`cover-transition-${loadedCoverCandidate.url}`}
                              src={loadedCoverCandidate.url}
                              alt={`${building.name} building cover`}
                              loading="lazy"
                              decoding="async"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
                              className="absolute inset-0 h-full w-full object-cover"
                              onAnimationComplete={() => {
                                if (coverImageUrlRef.current !== loadedCoverCandidate.url) return;
                                setDisplayedCover(loadedCoverCandidate);
                                setLoadedCoverCandidate(null);
                              }}
                              onError={() => setFailedCoverUrl(loadedCoverCandidate.url)}
                            />
                          ) : coverImageUrl && displayedCover?.url !== coverImageUrl && (
                            <img
                              key={`cover-load-${coverImageUrl}`}
                              src={coverImageUrl}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 h-full w-full object-cover opacity-0"
                              onLoad={() => {
                                if (coverImageUrlRef.current === coverImageUrl) setLoadedCoverCandidate({ url: coverImageUrl, name: building.name });
                              }}
                              onError={() => setFailedCoverUrl(coverImageUrl)}
                            />
                          )}
                        </div>
                      )}
                      {building.description?.trim() && (
                        <motion.p key={`description-${building.code}`} initial={{ opacity: 0.72 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }} data-testid="discover-building-description" className={`${mobileExpanded ? "block" : "hidden md:block"} mt-3 shrink-0 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground`}>{building.description.trim()}</motion.p>
                      )}
                      {building.floorCount < 1 && <p className="mt-3 text-center text-[11px] text-muted-foreground">This building has no published floor plans yet.</p>}
                    </>
                  )}
                </div>

                {!unavailable && building && <div data-testid="discover-tour-actions" className="mt-2 shrink-0 border-t border-border/60 bg-card/95 px-4 pb-2 pt-2 md:px-0 md:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <motion.p key={`position-${stopIndex}-${stopCount}`} initial={{ opacity: 0.72 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} data-testid="discover-tour-position" aria-live="polite" className="min-w-0 truncate text-xs font-bold text-muted-foreground">Building {stopIndex + 1} of {stopCount}</motion.p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {stopCount > 1 && <>
                        <button type="button" onClick={onPrevious} aria-label="Previous Building" title="Previous Building" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/60 text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" onClick={onNext} aria-label="Next Building" title="Next Building" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/60 text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                      </>}
                      <button type="button" data-testid="discover-sheet-toggle" aria-label={mobileExpanded ? "Collapse Discover details" : "Expand Discover details"} aria-expanded={mobileExpanded} onClick={() => changeMobileExpanded(!mobileExpanded)} className="flex h-9 items-center gap-1 rounded-xl border border-border px-2 text-[11px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:hidden">
                        <span className="hidden min-[360px]:inline">{mobileExpanded ? "Collapse" : "Expand"}</span>
                        {mobileExpanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={onEnter} disabled={building.floorCount < 1} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/15 transition-[filter,transform] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                    <DoorOpen className="h-4 w-4" aria-hidden="true" />See What&apos;s Inside
                  </button>
                </div>}
              </motion.div>
            </>
          )}
        </motion.aside>
      ))}
    </AnimatePresence>
  );
}

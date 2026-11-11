import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Building2, Check, MapPin, X } from "lucide-react";
import type { Campus } from "../map-builder/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../app/components/ui/select";
import { CampusPublishedMapPreview } from "./CampusPublishedMapPreview";
import { loadPublishedCampusImage } from "../../lib/campusPublicMedia";
import { campusLocationQuery, googleCampusDirectionsUrl, googleCampusPlaceUrl, type CampusLocation } from "../../lib/campusDirections";

interface Props {
  campus: Campus;
  campuses: readonly Campus[];
  offline?: boolean;
  reducedMotion?: boolean;
  onExplore: () => void;
  onClose: () => void;
}

function openExternalMap(url: string | null, offline: boolean) {
  if (!url || offline) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function CampusOverviewPanel({ campus, campuses, offline = false, reducedMotion = false, onExplore, onClose }: Props) {
  const [destinationId, setDestinationId] = useState("");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? false : navigator.onLine && !offline);
  const imageKey = JSON.stringify([campus.id, campus.overviewImagePath ?? null, campus.logoPath ?? null]);
  const [cover, setCover] = useState<{ key: string; status: "loading" | "ready" | "fallback"; url: string | null }>(() => ({ key: imageKey, status: campus.overviewImagePath ? "loading" : "fallback", url: null }));
  const [logo, setLogo] = useState<{ key: string; url: string | null }>(() => ({ key: imageKey, url: null }));
  const coverIsCurrent = cover.key === imageKey;
  const coverUrl = coverIsCurrent ? cover.url : null;
  const coverState = coverIsCurrent ? cover.status : campus.overviewImagePath ? "loading" : "fallback";
  const logoUrl = logo.key === imageKey ? logo.url : null;
  const locationText = [campus.address, campus.city, campus.province, campus.postalCode].filter((part) => part?.trim()).join(", ");
  const eligibleCampuses = useMemo(() => campuses.filter((item) => campusLocationQuery(item as CampusLocation)), [campuses]);
  const destinations = eligibleCampuses.filter((item) => item.id !== campus.id);
  const destination = destinations.find((item) => item.id === destinationId);
  const campusLocation = campus as CampusLocation;
  const canShowPlace = Boolean(campusLocationQuery(campusLocation));
  const placeUrl = googleCampusPlaceUrl(campusLocation);
  const travelDirectionsUrl = destination
    ? googleCampusDirectionsUrl(destination as CampusLocation, campusLocation)
    : null;
  const unavailableOffline = offline || !online;

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let coverObjectUrl: string | null = null;
    let logoObjectUrl: string | null = null;
    setCover({ key: imageKey, status: campus.overviewImagePath ? "loading" : "fallback", url: null });
    setLogo({ key: imageKey, url: null });
    setDestinationId("");
    const loadImage = (url: string) => new Promise<boolean>((resolve) => {
      if (typeof Image === "undefined") { resolve(true); return; }
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
      if (image.complete) resolve(image.naturalWidth > 0);
    });
    void Promise.all([
      loadPublishedCampusImage(campus.id, "cover", campus.overviewImagePath, !unavailableOffline),
      loadPublishedCampusImage(campus.id, "logo", campus.logoPath, !unavailableOffline),
    ]).then(async ([cover, logo]) => {
      coverObjectUrl = cover;
      logoObjectUrl = logo;
      const coverReady = cover ? await loadImage(cover) : false;
      const logoReady = logo ? await loadImage(logo) : false;
      if (!cancelled) {
        setCover({ key: imageKey, status: coverReady ? "ready" : "fallback", url: coverReady ? cover : null });
        setLogo({ key: imageKey, url: logoReady ? logo : null });
      }
    }).catch(() => {
      if (!cancelled) setCover({ key: imageKey, status: "fallback", url: null });
    });
    return () => {
      cancelled = true;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    };
  }, [campus.id, campus.overviewImagePath, campus.logoPath, imageKey, unavailableOffline]);

  const mapActionDisabled = unavailableOffline;
  const description = campus.description?.trim();
  const entryClass = reducedMotion ? "" : "animate-in fade-in zoom-in-[.98] duration-200 motion-reduce:animate-none";

  return (
    <div
      data-no-drag
      className="absolute inset-0 z-[75] flex items-end justify-center overflow-hidden bg-background/35 px-2 pt-[calc(env(safe-area-inset-top,0px)+.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] backdrop-blur-[2px] sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:items-center md:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${campus.name} campus overview`}
        data-testid="campus-overview-panel"
        className={`flex min-h-[70dvh] max-h-[calc(100%-5.5rem)] w-full max-w-[47rem] flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card text-card-foreground shadow-[0_24px_80px_rgba(2,8,23,.34)] ${entryClass} [@media(max-height:500px)]:min-h-0 md:min-h-0 md:max-h-[min(calc(100dvh - 2rem),52rem)] md:rounded-[1.75rem]`}
        onMouseDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <div className="relative h-32 shrink-0 overflow-hidden bg-muted sm:h-36 md:h-48">
          {coverState === "ready" && coverUrl
            ? <img src={coverUrl} alt={`${campus.name} campus`} onError={() => setCover({ key: imageKey, status: "fallback", url: null })} className="absolute inset-0 h-full w-full object-cover" />
            : coverState === "loading"
              ? <div data-testid="campus-overview-cover-loading" role="status" aria-label={`Loading ${campus.name} campus image`} className="absolute inset-0 animate-pulse bg-muted"><div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-foreground/10 to-transparent" /></div>
              : <CampusPublishedMapPreview campus={campus} className="absolute inset-0 h-full w-full" />}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/10" />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/30 bg-slate-950/45 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.16em] text-white shadow-sm backdrop-blur-sm md:left-6 md:top-5">
            {logoUrl && <img src={logoUrl} alt="" className="h-5 w-5 rounded-full bg-white object-contain p-0.5" />}
            Campus overview
          </div>
          <button type="button" onClick={onClose} aria-label="Close campus overview" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/35 bg-slate-950/45 text-white shadow backdrop-blur-sm transition hover:bg-slate-950/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-5 md:top-5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div data-testid="campus-overview-information" role="region" aria-label="Campus information" tabIndex={0} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable] sm:px-6 sm:py-6 md:px-9 md:py-7">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-[1.7rem] md:text-[1.9rem]">{campus.name}</h2>
              {campus.code && <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.14em] text-primary">{campus.code}</p>}
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-600/10 px-2.5 py-1 text-[9px] font-bold text-emerald-800 dark:text-emerald-300 sm:inline-flex"><Check className="h-3 w-3" />Published campus</span>
          </div>

          {locationText && <p className="mt-4 flex gap-2 text-sm font-medium leading-relaxed text-muted-foreground sm:text-base"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{locationText}</p>}
          <section className="mt-6" aria-labelledby="campus-overview-description">
            <h3 id="campus-overview-description" className="text-[9px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">About this campus</h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-foreground sm:text-[15px] sm:leading-7">{description || "Campus information has not been added yet."}</p>
          </section>

          {eligibleCampuses.length > 1 && destinations.length > 0 && (
            <section className="mt-7 rounded-2xl border border-border bg-muted/35 p-4 sm:p-5" aria-label="Inter-campus travel">
              <p className="text-sm font-bold text-foreground">Travel to another campus</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Google Maps handles travel between campuses.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={destinationId} onValueChange={setDestinationId}>
                  <SelectTrigger aria-label="Choose destination campus" className="h-11 min-w-0 flex-1 rounded-xl border-border bg-background text-xs text-foreground focus-visible:ring-2 focus-visible:ring-primary/40">
                    <SelectValue placeholder="Choose a published campus" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={6} className="z-[120] max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-xl motion-reduce:animate-none">
                    {destinations.map((item) => <SelectItem key={item.id} value={item.id} textValue={item.name} className="min-h-11 rounded-lg py-2 text-xs focus:bg-accent focus:text-accent-foreground"><span className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" /><span className="break-words">{item.name}</span></span></SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => openExternalMap(travelDirectionsUrl, mapActionDisabled)} disabled={!destination || !travelDirectionsUrl || mapActionDisabled} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 text-xs font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-48">
                  Get Travel Directions<ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </section>
          )}

          {unavailableOffline && <p role="status" className="mt-4 rounded-xl bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">Campus information is available offline. Google Maps requires an internet connection.</p>}
          {!canShowPlace && <p className="mt-3 text-[11px] text-muted-foreground">Google Maps location is unavailable because no published campus address or coordinates are available.</p>}
        </div>

        <footer data-testid="campus-overview-actions" className="grid shrink-0 gap-2.5 border-t border-border bg-card/95 p-4 sm:grid-cols-2 sm:px-6 md:px-9 md:py-4">
          <button type="button" onClick={() => openExternalMap(placeUrl, mapActionDisabled)} disabled={!placeUrl || mapActionDisabled} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground transition hover:bg-muted active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45"><MapPin className="h-4 w-4 text-primary" />Google Maps<ArrowUpRight className="h-3 w-3" /></button>
          <button type="button" onClick={onExplore} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md transition hover:brightness-110 active:scale-[.99]"><Building2 className="h-4 w-4" />Explore Campus</button>
        </footer>
      </section>
    </div>
  );
}

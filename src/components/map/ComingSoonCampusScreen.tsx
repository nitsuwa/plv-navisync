import { useState, type CSSProperties } from "react";
import { Building2, Check, ChevronDown, Clock3, MapPin, Route } from "lucide-react";
import type { Campus } from "../map-builder/types";
import { cn } from "../../lib/utils";

interface ComingSoonCampusScreenProps {
  campus: Campus;
  campuses: Campus[];
  onSelectCampus: (id: string) => void;
  fullScreen?: boolean;
}

function locationLabel(campus: Campus): string {
  return [campus.city, campus.province].filter(Boolean).join(", ") || campus.address || "Pangasinan, Philippines";
}

export function ComingSoonCampusScreen({ campus, campuses, onSelectCampus, fullScreen = false }: ComingSoonCampusScreenProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const publishedCampuses = campuses.filter((item) => item.lifecycleStatus === "published");
  const mainCampus = publishedCampuses.find((item) => item.isDefault) ?? publishedCampuses[0];
  const accent = campus.themeColor || "#1e3a5f";

  return (
    <section
      aria-label={`${campus.name} Coming Soon`}
      className={cn("relative isolate flex w-full flex-col overflow-hidden bg-[#f5f8fc] text-slate-900", fullScreen ? "min-h-[100dvh]" : "min-h-[calc(100dvh-56px)]")}
      style={{ "--campus-accent": accent } as CSSProperties}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full opacity-[0.09] blur-3xl" style={{ background: accent }} />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sky-200/45 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.22] [background-image:radial-gradient(#8ba1b8_0.7px,transparent_0.7px)] [background-size:22px_22px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80" style={{ color: accent }}>
            <Building2 className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">PLV NaviSync</p>
            <p className="truncate text-xs font-bold text-slate-800">Campus map</p>
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSelectorOpen((open) => !open)}
            aria-expanded={selectorOpen}
            aria-label={`Selected campus: ${campus.name}. Choose another campus`}
            className="flex max-w-[min(56vw,18rem)] items-center gap-2 rounded-full border border-white/90 bg-white/90 px-3 py-2 text-left shadow-sm backdrop-blur transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} aria-hidden="true" />
            <span className="truncate text-xs font-bold text-slate-800">{campus.name}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform", selectorOpen && "rotate-180")} aria-hidden="true" />
          </button>
          {selectorOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 max-h-[min(60dvh,24rem)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <p className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Choose a campus</p>
              {campuses.map((item) => {
                const active = item.id === campus.id;
                const comingSoon = item.lifecycleStatus === "coming_soon";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelectCampus(item.id); setSelectorOpen(false); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      {comingSoon ? <Clock3 className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">{item.name}</span>
                      {item.code && <span className="block text-[10px] text-slate-500">{item.code}</span>}
                    </span>
                    {comingSoon && <span className="rounded-full bg-sky-50 px-2 py-1 text-[9px] font-extrabold text-sky-700">Coming Soon</span>}
                    {!comingSoon && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-extrabold text-emerald-700">Published</span>}
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none motion-reduce:slide-in-from-bottom-0 relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/90 bg-white/85 px-6 py-9 text-center shadow-[0_24px_80px_-42px_rgba(15,35,65,0.35)] backdrop-blur-xl sm:px-12 sm:py-14">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${accent}, #68b9e8, transparent)` }} />
          <div className="relative mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-[1.8rem] bg-slate-50 ring-1 ring-slate-200/80 sm:h-28 sm:w-28" style={{ color: accent }}>
            <div className="absolute inset-2 rounded-[1.35rem] border border-dashed border-slate-300/80" />
            <Building2 className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.5} aria-hidden="true" />
            <span className="motion-safe:animate-pulse absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-xl border-4 border-white bg-sky-100 text-sky-700 shadow-sm">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span aria-hidden="true" className="absolute -bottom-3 left-1/2 h-8 w-px -translate-x-1/2 bg-gradient-to-b from-slate-300 to-transparent" />
          </div>

          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">{campus.code || "PLV CAMPUS"}</p>
          <h1 className="mx-auto mt-2 max-w-xl text-balance text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">{campus.name}</h1>
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50 px-3.5 py-1.5 text-xs font-extrabold text-sky-800">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Coming Soon
          </div>
          <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            We’re preparing the interactive campus map. Navigation and facility information will be available here once the map is published.
          </p>
          <div className="mx-auto mt-6 inline-flex max-w-full items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80">
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} aria-hidden="true" />
            <span className="truncate">{locationLabel(campus)}</span>
          </div>
          <div aria-hidden="true" className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-2 text-slate-300">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-300" />
            <Route className="h-4 w-4" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-300" />
          </div>
          {mainCampus && mainCampus.id !== campus.id && (
            <button
              type="button"
              onClick={() => onSelectCampus(mainCampus.id)}
              className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: accent }}
            >
              <Building2 className="h-4 w-4" aria-hidden="true" /> Back to {mainCampus.name}
            </button>
          )}
        </div>
      </div>
      <div className="h-[max(0.75rem,env(safe-area-inset-bottom))]" aria-hidden="true" />
    </section>
  );
}

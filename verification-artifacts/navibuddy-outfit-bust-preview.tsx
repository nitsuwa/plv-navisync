import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/index.css";
import { NaviBuddyAppearanceContext, NaviBuddyContext } from "../src/contexts/NaviBuddyStore";
import { DEFAULT_NAVIBUDDY_APPEARANCE, NAVIBUDDY_OUTFITS, NAVIBUDDY_OUTFIT_DETAILS, type NaviBuddyAppearance } from "../src/lib/naviBuddy";
import { NaviBuddyOutfitBust, NaviBuddyPortrait } from "../src/components/map/NaviBuddyPortrait";
import { NaviBuddy3DPreview } from "../src/components/map/NaviBuddy3DPreview";

function Review() {
  const [outfit, setOutfit] = useState<NaviBuddyAppearance["outfit"]>("adventurer");
  const appearance = { ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit, backpack: "compact" as const };
  return <NaviBuddyAppearanceContext.Provider value={appearance}>
    <NaviBuddyContext.Provider value={{ appearance, loaded: true, saveAppearance: async () => {}, reaction: null, react: () => {}, clearReaction: () => {} }}>
      <div className="min-h-screen bg-background px-3 py-4 text-foreground sm:px-6 sm:py-8">
        <div style={{ maxWidth: 760 }} className="mx-auto mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold text-foreground">Isolated visual review using production NaviBuddy components; no Student session.</div>
        <main style={{ maxWidth: 760 }} className="mx-auto grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-5">
          <section className="relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(ellipse_at_50%_78%,rgba(30,64,175,.10),transparent_56%)] bg-card px-3 pb-3 pt-1 shadow-sm sm:min-h-[410px] dark:bg-slate-950/40">
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-2xl" aria-hidden="true" />
            <NaviBuddy3DPreview appearance={appearance} reducedMotion />
            <span className="relative z-10 -mt-1 inline-flex min-h-8 max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-primary/15 bg-card/95 px-5 py-1.5 text-[11px] font-extrabold leading-none text-foreground shadow-sm">{NAVIBUDDY_OUTFIT_DETAILS[outfit].label}</span>
          </section>
          <section className="flex flex-col rounded-[28px] border border-border/60 bg-card p-3 shadow-sm sm:p-5">
            <h2 className="mb-3 text-sm font-extrabold">Outfit</h2>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="radiogroup" aria-label="NaviBuddy outfit">
              {NAVIBUDDY_OUTFITS.map((item) => {
                const selected = outfit === item;
                const label = NAVIBUDDY_OUTFIT_DETAILS[item].label;
                return <button key={item} type="button" role="radio" aria-checked={selected} aria-label={label} onClick={() => setOutfit(item)} className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 pb-2 pt-1 transition duration-200 ${selected ? "bg-primary/8 ring-2 ring-primary shadow-sm" : "hover:bg-muted/60"}`}>
                  <NaviBuddyOutfitBust appearance={{ ...appearance, outfit: item }} className="h-[72px] w-[64px] max-w-full" />
                  <span className={`box-border w-full max-w-full whitespace-nowrap px-1 text-center text-[7px] font-bold leading-[1.15] tracking-tight sm:text-[9px] ${selected ? "text-primary" : "text-muted-foreground"}`}>{label === "PLV Uniform" ? <>PLV<br />Uniform</> : label}</span>
                  {selected && <span aria-hidden="true" className="absolute right-1 top-1 text-xs font-black text-primary">✓</span>}
                </button>;
              })}
            </div>
            <div className="mt-5 border-t border-border/60 pt-4">
              <h2 className="mb-2 text-xs font-extrabold text-muted-foreground">Full-body vs bust thumbnail</h2>
              <div className="flex items-end justify-center gap-6 rounded-2xl bg-muted/35 px-3 py-2">
                <div className="flex h-24 w-16 items-end justify-center"><NaviBuddyPortrait appearance={appearance} className="h-full w-full" /></div>
                <div className="flex h-24 w-16 items-end justify-center"><NaviBuddyOutfitBust appearance={appearance} className="h-[72px] w-full" /></div>
              </div>
              <div className="mt-1 flex justify-center gap-8 text-[9px] font-semibold text-muted-foreground"><span>Previous</span><span>Chooser bust</span></div>
            </div>
          </section>
        </main>
      </div>
    </NaviBuddyContext.Provider>
  </NaviBuddyAppearanceContext.Provider>;
}

createRoot(document.getElementById("root")!).render(<Review />);

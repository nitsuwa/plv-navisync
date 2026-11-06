import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/index.css";
import { NaviBuddy3DPreview } from "../src/components/map/NaviBuddy3DPreview";
import { IskolarMarkerArt } from "../src/components/map/IskolarMarkerArt";
import { NaviBuddyPortrait } from "../src/components/map/NaviBuddyPortrait";
import { NaviBuddyAppearanceContext } from "../src/contexts/NaviBuddyStore";
import { DEFAULT_NAVIBUDDY_APPEARANCE, NAVIBUDDY_OUTFITS, NAVIBUDDY_OUTFIT_DETAILS, type NaviBuddyAppearance, type NaviBuddyOutfit } from "../src/lib/naviBuddy";

function ReviewStudio() {
  const [outfit, setOutfit] = useState<NaviBuddyOutfit>("classic");
  const [backpack, setBackpack] = useState<NaviBuddyAppearance["backpack"]>("classic");
  const appearance: NaviBuddyAppearance = { ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit, backpack };
  return <main className="mx-auto min-h-screen max-w-5xl bg-background p-4 text-foreground sm:p-8">
    <p className="mb-3 rounded-full bg-amber-100 px-3 py-1 text-center text-xs font-extrabold text-amber-900">ISOLATED COMPONENT HARNESS · SYNTHETIC APPEARANCE · NO PRODUCTION AUTH</p>
    <h1 className="text-xl font-extrabold">My NaviBuddy · Visual review</h1>
    <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="min-w-0 rounded-3xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-bold">3D NaviBuddy · {NAVIBUDDY_OUTFIT_DETAILS[outfit].label}</h2>
        <NaviBuddyAppearanceContext.Provider value={appearance}>
          <div className="h-[320px] sm:h-[420px]"><NaviBuddy3DPreview appearance={appearance} reducedMotion /></div>
        </NaviBuddyAppearanceContext.Provider>
        <h3 className="mt-3 text-xs font-bold">2D map marker · 34 px display</h3>
        <svg width="34" height="34" viewBox="-16 -16 34 34" role="img" aria-label="NaviBuddy map marker at normal scale" className="mt-1 overflow-visible">
          <NaviBuddyAppearanceContext.Provider value={appearance}><IskolarMarkerArt bearing={0} /></NaviBuddyAppearanceContext.Provider>
        </svg>
      </section>
      <section className="min-w-0 rounded-3xl border border-border bg-card p-3 sm:p-5">
        <h2 className="mb-3 text-sm font-bold">Outfit portraits</h2>
        <div className="grid grid-cols-5 gap-1 sm:gap-2" role="radiogroup" aria-label="Outfit">
          {NAVIBUDDY_OUTFITS.map((variant) => <button type="button" key={variant} role="radio" aria-checked={outfit === variant} aria-label={NAVIBUDDY_OUTFIT_DETAILS[variant].label} onClick={() => setOutfit(variant)} className={`rounded-2xl border p-1.5 transition ${outfit === variant ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border bg-background"}`}>
            <NaviBuddyPortrait appearance={{ ...appearance, outfit: variant }} className="mx-auto h-[108px] w-full max-w-[90px]" />
            <span className="block min-h-7 text-center text-[9px] font-bold leading-tight sm:text-xs">{NAVIBUDDY_OUTFIT_DETAILS[variant].label}</span>
          </button>)}
        </div>
        <h2 className="mb-2 mt-5 text-sm font-bold">Backpack view</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Backpack">
          {(["none", "classic", "compact"] as const).map((kind) => <button type="button" key={kind} role="radio" aria-checked={backpack === kind} aria-label={kind === "none" ? "No backpack" : `${kind} backpack`} onClick={() => setBackpack(kind)} className={`rounded-xl border px-2 py-2 text-xs font-bold capitalize transition ${backpack === kind ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border bg-background"}`}>{kind === "none" ? "None" : `${kind} Backpack`}</button>)}
        </div>
        <div className="mt-5 rounded-2xl border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground">
          Same production portrait component used in the wardrobe and navigation reaction bubble. 3D preview and marker use their production components.
        </div>
      </section>
    </div>
  </main>;
}

const reviewContainer = document.getElementById("root")!;
const reviewHot = import.meta.hot;
const reviewRoot = reviewHot?.data.navibuddyReviewRoot ?? createRoot(reviewContainer);
if (reviewHot) reviewHot.data.navibuddyReviewRoot = reviewRoot;
reviewRoot.render(<ReviewStudio />);

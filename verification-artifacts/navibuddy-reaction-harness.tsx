import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/index.css";
import { NAVIBUDDY_OUTFITS, DEFAULT_NAVIBUDDY_APPEARANCE, type NaviBuddyAppearance } from "../src/lib/naviBuddy";
import { NaviBuddyAppearanceContext, NaviBuddyContext } from "../src/contexts/NaviBuddyStore";
import { IskolarMarkerArt } from "../src/components/map/IskolarMarkerArt";
import { NaviBuddyPortrait, NaviBuddyReactionBubble } from "../src/components/map/NaviBuddyPortrait";

function Harness() {
  const [appearance, setAppearance] = useState<NaviBuddyAppearance>({ ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit: "adventurer" });
  const [reaction, setReaction] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"expanded" | "minimized">("expanded");
  const context = {
    appearance, loaded: true, saveAppearance: async () => {}, reaction,
    react: (message: string) => setReaction(message), clearReaction: () => setReaction(null),
  };
  const detail = (outfit: NaviBuddyAppearance["outfit"]) => outfit === "plv_uniform" ? "PLV Uniform" : outfit[0].toUpperCase() + outfit.slice(1);
  return <NaviBuddyAppearanceContext.Provider value={appearance}><NaviBuddyContext.Provider value={context}>
    <main style={{ height: "100dvh", boxSizing: "border-box", padding: 12, display: "grid", gridTemplateRows: "auto auto minmax(0,1fr) auto", gap: 8, overflow: "hidden", background: "var(--background)", color: "var(--foreground)", fontFamily: "var(--font-body, Inter, sans-serif)" }}>
      <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>NaviBuddy reaction review · isolated component harness</h1>
      <section style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {NAVIBUDDY_OUTFITS.map((outfit) => <button key={outfit} type="button" onClick={() => setAppearance((value) => ({ ...value, outfit }))}>{detail(outfit)}</button>)}
        <button type="button" onClick={() => setReaction("Route ready!")}>Simulate route ready</button>
        <button type="button" onClick={() => setReaction("You've arrived!")}>Simulate final arrival</button>
        <button type="button" onClick={() => setSheet((value) => value === "expanded" ? "minimized" : "expanded")}>Toggle sheet</button>
      </section>
      <section data-testid="student-map-surface" style={{ position: "relative", minHeight: 0, overflow: "hidden", borderRadius: 20, border: "1px solid #cbd5e1", background: "linear-gradient(135deg,#dce8dc,#edf3e9 54%,#dbe7d8)" }}>
        <svg aria-label="Map artwork preview" viewBox="0 0 1000 700" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <path d="M30 570H350V320H680V170H955" fill="none" stroke="#0e2a6e" strokeWidth="28" strokeLinejoin="round" />
          <path d="M30 570H350V320H680V170H955" fill="none" stroke="white" strokeWidth="16" strokeLinejoin="round" />
          <g transform="translate(680 320) scale(1.35)"><IskolarMarkerArt bearing={0} /></g>
          <g fill="#bcc9d1" stroke="#8394a0" strokeWidth="3"><rect x="720" y="340" width="230" height="140" rx="10"/><rect x="90" y="130" width="210" height="170" rx="10"/><rect x="375" y="70" width="205" height="150" rx="10"/></g>
        </svg>
        <div data-testid="route-planner-dialog" style={{ position: "absolute", left: 12, bottom: 12, width: "min(330px, calc(100% - 24px))", height: sheet === "expanded" ? 196 : 48, borderRadius: 20, background: "rgba(255,255,255,.95)", boxShadow: "0 10px 30px rgba(15,23,42,.18)", border: "1px solid #dbe2ea", padding: 14, transition: "height .22s ease" }}>
          <div style={{ width: 34, height: 4, borderRadius: 9, background: "#cbd5e1", margin: "0 auto 10px" }} />
          <strong>Guided navigation</strong>
          {sheet === "expanded" && <><p>Step 3 of 5 · Continue to CABA</p><button type="button">Enter Building</button></>}
        </div>
      </section>
      <section style={{ display: "flex", gap: 6, overflowX: "auto" }} aria-label="Shared wardrobe art comparison">
        {NAVIBUDDY_OUTFITS.map((outfit) => <div key={outfit} style={{ minWidth: 78, display: "grid", justifyItems: "center", borderRadius: 12, background: "var(--card)", padding: 4 }}><NaviBuddyPortrait appearance={{ ...appearance, outfit }} className="h-[66px] w-[64px]" /><small>{detail(outfit)}</small></div>)}
      </section>
    </main>
    <NaviBuddyReactionBubble />
  </NaviBuddyContext.Provider></NaviBuddyAppearanceContext.Provider>;
}

createRoot(document.getElementById("root")!).render(<Harness />);

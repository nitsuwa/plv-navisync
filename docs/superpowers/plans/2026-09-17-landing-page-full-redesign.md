# NaviSync Landing Page Full Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Rework the public NaviSync landing page into a clearer, responsive, map-led experience while preserving its current routes, interactive feature tour, and PLV visual identity.

**Architecture:** Keep the landing page self-contained in src/pages/LandingPage.tsx. Add a deterministic SVG/CSS campus preview component for the hero, then compose the existing feature demos and capability cards below it. Extend the focused landing interaction test for the new hero contract, and validate with Vitest, the production build, and a browser pass.

**Tech Stack:** React 18, TypeScript, React Router, Motion, Lucide React, Tailwind CSS, Vitest, Testing Library, Vite.

## Global Constraints

- Only the landing page component, its focused interaction test, and landing-page documentation may change.
- Preserve /map, #landing-feature-tour, Open Campus Map, Explore Features, and Open Interactive Map behavior.
- Keep the PLV navy and gold identity with blue route highlights and accessible contrast.
- The hero map preview must use deterministic SVG/CSS geometry and must not require network images.
- Mobile layouts must stack without horizontal scrolling; feature controls remain full-width disclosures.
- Motion must be reduced when prefers-reduced-motion is enabled and must not carry essential meaning.
- Do not add announcements, events, authentication, backend calls, or new navigation destinations to the landing page.

---

### Task 1: Replace the centered hero with a map-led responsive hero

**Files:**
- Modify: src/pages/LandingPage.tsx:1191-1390
- Test: src/pages/__tests__/LandingPage.interaction.test.tsx

**Interfaces:**
- Produces LandingMapPreview, a local presentation component used only by HeroSection.
- Keeps HeroSection rendering a /map link, an href="#landing-feature-tour" link, the Navigate PLV Smarter heading, and the NaviSync label.

- [ ] **Step 1: Write the failing hero contract test**

Add this test to the existing landing suite:

~~~tsx
it("frames the hero around a campus map preview and practical trust signals", () => {
  renderLandingPage();

  expect(screen.getByTestId("landing-map-preview")).toHaveAttribute(
    "aria-label",
    expect.stringMatching(/campus map preview/i),
  );
  expect(screen.getByText("Campus map, at a glance")).toBeInTheDocument();
  expect(screen.getByText("Search rooms and offices")).toBeInTheDocument();
  expect(screen.getByText("Walking routes")).toBeInTheDocument();
  expect(screen.getByText("Accessibility-aware paths")).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run the test and confirm it fails**

Run:

~~~powershell
pnpm exec vitest run src/pages/__tests__/LandingPage.interaction.test.tsx -t "frames the hero" --reporter=dot --maxWorkers=1
~~~

Expected: FAIL because the hero does not yet render landing-map-preview or the new trust labels.

- [ ] **Step 3: Implement LandingMapPreview**

Add a deterministic preview before HeroSection. It must render data-testid="landing-map-preview", an accessible label, a small status chip, map-grid SVG, campus blocks, a highlighted route, two labeled pins, and a bottom route summary. Keep decorative SVG details aria-hidden and include readable text outside the SVG.

Use these visual contracts:

~~~tsx
<div
  data-testid="landing-map-preview"
  aria-label="Campus map preview showing a walking route between Building A and Building B"
  className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#0b1b45]/90 p-3 shadow-[0_28px_80px_rgba(1,8,30,0.35)]"
>
  <div className="relative min-h-[300px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b2357]">
    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
    <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 520 340" preserveAspectRatio="none">
      <path d="M38 250 C130 205 152 104 244 130 S360 255 470 88" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="20" strokeLinecap="round" />
      <path d="M38 250 C130 205 152 104 244 130 S360 255 470 88" fill="none" stroke="#f4bd38" strokeWidth="4" strokeDasharray="9 9" strokeLinecap="round" />
    </svg>
    <div className="absolute left-[9%] top-[62%] rounded-xl border border-blue-200/30 bg-blue-500/25 px-3 py-2 text-white shadow-lg">
      <span className="block text-[10px] font-extrabold uppercase tracking-[.16em] text-blue-100">Building A</span>
      <span className="mt-1 block text-[10px] text-white/60">Your starting point</span>
    </div>
    <div className="absolute right-[8%] top-[18%] rounded-xl border border-accent/50 bg-accent/20 px-3 py-2 text-white shadow-lg">
      <span className="block text-[10px] font-extrabold uppercase tracking-[.16em] text-accent-foreground">Building B</span>
      <span className="mt-1 block text-[10px] text-white/60">Destination</span>
    </div>
    <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/15 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.16em] text-white/70">
      Campus map, at a glance
    </div>
  </div>
  <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 text-xs text-white/70">
    <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Walking route ready</span>
    <span className="font-mono text-white/50">2 min · 148 m</span>
  </div>
</div>
~~~

Use useReducedMotion to skip route motion when requested; the static dashed route must remain visible.

- [ ] **Step 4: Restructure HeroSection into a responsive split layout**

Keep the dark background layers, but reduce their opacity and place the hero content in a max-w-7xl two-column grid. The left column contains the PLV identity, heading, supporting copy, CTAs, and this compact trust row:

~~~tsx
<div className="mt-10 grid max-w-xl grid-cols-3 gap-3 border-t border-white/10 pt-5 text-left">
  <div><p className="text-sm font-extrabold text-white">Campus-wide</p><p className="mt-1 text-[11px] text-white/45">places to find</p></div>
  <div><p className="text-sm font-extrabold text-white">Walking-first</p><p className="mt-1 text-[11px] text-white/45">routes to follow</p></div>
  <div><p className="text-sm font-extrabold text-white">Access-aware</p><p className="mt-1 text-[11px] text-white/45">paths when needed</p></div>
</div>
~~~

The right column contains LandingMapPreview and a short route caption. Below the lg breakpoint, stack the preview below the copy, keep the CTA row usable at mobile widths, and preserve a minimum 44px action height. Keep overflow-x-hidden on the page root.

- [ ] **Step 5: Run the focused test**

Run:

~~~powershell
pnpm exec vitest run src/pages/__tests__/LandingPage.interaction.test.tsx --reporter=dot --maxWorkers=1
~~~

Expected: all landing interaction tests pass.

### Task 2: Tighten the landing-page sections around the new hero

**Files:**
- Modify: src/pages/LandingPage.tsx:629-743
- Modify: src/pages/LandingPage.tsx:1392-1537
- Test: src/pages/__tests__/LandingPage.interaction.test.tsx

**Interfaces:**
- Keep HowHelpsYou as the only interactive tour and keep landing-feature-tour, landing-feature-tour-heading, and landing-feature-tour-panel test hooks.
- Keep CampusCapabilities and FinalCTA as presentational sections with existing map links.

- [ ] **Step 1: Add section-level assertions**

Add this test:

~~~tsx
it("keeps the landing page focused on navigation outcomes", () => {
  renderLandingPage();

  expect(screen.getByRole("heading", { name: "Everything useful, right when you need it." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Ready to explore PLV?" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Navigate PLV in Seconds" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Latest Announcements & Campus Events" })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run the new test**

Run:

~~~powershell
pnpm exec vitest run src/pages/__tests__/LandingPage.interaction.test.tsx -t "keeps the landing page focused" --reporter=dot --maxWorkers=1
~~~

Expected: PASS if the compact section copy remains; otherwise update only the focused section copy.

- [ ] **Step 3: Refine the feature tour framing**

Keep the single active panel and disclosure semantics. Add a short eyebrow describing “Choose a campus task” and a small panel status line so users understand that the preview is interactive. Do not mount more than the active demo. Keep aria-expanded, aria-controls, and Link to="/map" behavior.

- [ ] **Step 4: Refine capabilities and final CTA**

Keep three capability cards and the single final /map CTA. Improve their visual hierarchy with a larger first card, route-line ornament, and concise copy; do not add a second CTA or duplicate footer contact information.

- [ ] **Step 5: Run the focused suite**

Run:

~~~powershell
pnpm exec vitest run src/pages/__tests__/LandingPage.interaction.test.tsx --reporter=dot --maxWorkers=1
~~~

Expected: PASS with the existing and new behavior assertions.

### Task 3: Remove dead landing-page implementation and verify scope

**Files:**
- Modify: src/pages/LandingPage.tsx

- [ ] **Step 1: Remove unreachable legacy section components and unused imports**

After the new page composition is in place, remove the old unrendered PlatformHighlights, HowItWorks, ProductShowcase, WhyNaviSync, and DayWithNaviSync implementations and their data constants/imports. Keep all components still rendered by LandingPage and all demo components used by HowHelpsYou.

- [ ] **Step 2: Check the focused diff**

Run:

~~~powershell
git diff -- src/pages/LandingPage.tsx src/pages/__tests__/LandingPage.interaction.test.tsx docs/superpowers/specs/2026-09-17-landing-page-full-redesign-design.md docs/superpowers/plans/2026-09-17-landing-page-full-redesign.md
~~~

Expected: only landing-page implementation, tests, and documentation are changed by this task; existing unrelated working-tree changes remain unstaged.

- [ ] **Step 3: Check formatting**

Run:

~~~powershell
git diff --check -- src/pages/LandingPage.tsx src/pages/__tests__/LandingPage.interaction.test.tsx docs/superpowers/specs/2026-09-17-landing-page-full-redesign-design.md docs/superpowers/plans/2026-09-17-landing-page-full-redesign.md
~~~

Expected: no whitespace errors.

### Task 4: Validate the landing page in tests, build, and browser

**Files:**
- Test: src/pages/__tests__/LandingPage.interaction.test.tsx

- [ ] **Step 1: Run focused landing tests**

Run:

~~~powershell
pnpm exec vitest run src/pages/__tests__/LandingPage.interaction.test.tsx --reporter=dot --maxWorkers=1
~~~

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run:

~~~powershell
pnpm run build
~~~

Expected: Vite completes successfully. Existing non-fatal bundle-size warnings may remain, but there must be no compilation errors.

- [ ] **Step 3: Start the local app for browser inspection**

Run:

~~~powershell
pnpm run dev -- --host 127.0.0.1
~~~

Open the landing route and verify:

- Desktop: copy and map preview sit side by side.
- Mobile: map preview stacks below the copy and no horizontal scrollbar appears.
- Open Campus Map navigates to /map.
- Explore Features scrolls to #landing-feature-tour.
- Feature controls switch the single panel and remain keyboard accessible.
- The final CTA stays focused on opening the map.

- [ ] **Step 4: Verify reduced motion**

Use reduced-motion emulation or a matching system setting. Confirm the map route and panel transitions remain readable without essential information depending on animation.

- [ ] **Step 5: Review final status**

Run:

~~~powershell
git status --short
git diff --stat -- src/pages/LandingPage.tsx src/pages/__tests__/LandingPage.interaction.test.tsx docs/superpowers/specs/2026-09-17-landing-page-full-redesign-design.md docs/superpowers/plans/2026-09-17-landing-page-full-redesign.md
~~~

Expected: only intended landing-page files are part of this task’s diff; do not stage .pnpm-store, generated files, or unrelated feature work.

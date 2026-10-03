# Landing Page Interactive Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long landing-page sequence with a compact, animated, glassmorphism-supported NaviSync tour that preserves the dark navy/gold PLV identity, works without horizontal scrolling on mobile, and includes official campus contact information.

**Architecture:** Keep the existing `LandingPage.tsx` route and shared demo components. Refactor the rendered page composition to four focused landing sections: hero with scroll cue, interactive tour, capability strip, and final map CTA. Keep the route demo inside the interactive tour as the single route preview. Keep official campus information in the shared `Footer.tsx` only. Existing unused section components can remain in the file until a separate cleanup task so this change does not disturb unrelated landing-page work.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, `motion/react`, `lucide-react`, Vitest, Testing Library, Vite.

## Global Constraints

- Continue only in `C:\Users\Rj\Documents\GitHub\plv-navisync`.
- Do not run `git pull`, `git push`, `git reset`, or `git checkout`.
- Preserve all existing working-tree changes and do not overwrite unrelated user edits.
- Keep existing route paths, header/navigation labels, PLV logo assets, and map/help destinations stable.
- Use the existing local dependencies. Do not add a UI library or fetch a new repository.
- Follow RED → GREEN → REFACTOR for each behavior change.
- Avoid visible em dashes in new landing-page copy.

---

### Task 1: Lock the approved landing-page behavior with regression tests

**Files:**
- Test: `src/pages/__tests__/LandingPage.interaction.test.tsx`

- [ ] **Step 1: Write the failing tests**

Cover these user-visible contracts:

1. The feature selector uses disclosure semantics, starts with the search preview open, and swaps the single panel when “Get Directions” is selected.
2. The rendered page keeps the short “How NaviSync Helps You” section and no longer renders the removed long-page headings.
3. The final information block displays the exact address, registrar email link, establishment year, and Maysan campus inauguration date.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run src/pages/__tests__/LandingPage.interaction.test.tsx
```

Expected before implementation: failure because the current feature controls lack `aria-expanded`, the long sections are still rendered, and the contact block does not exist.

### Task 2: Refactor the interactive tour for mobile-first disclosure

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Add the motion primitives needed by the panel transition**

Import `AnimatePresence` and `useReducedMotion` from `motion/react`, plus `ChevronDown` from `lucide-react`.

- [ ] **Step 2: Replace the horizontal tab row**

Update `HowHelpsYou` so each scenario is a full-width button in a vertical selector. Add `aria-expanded`, `aria-controls`, and a visible active state. Use a responsive two-column grid on larger screens and one stacked column on small screens.

- [ ] **Step 3: Keep one active glass panel**

Render one panel with `data-testid="landing-feature-tour-panel"` and animate only the active scenario. Keep the current demo components and mount only the selected demo. Add a translucent background, border, blur, inset highlight, and readable opaque fallback.

- [ ] **Step 4: Respect reduced motion**

Use `useReducedMotion()` to remove the panel’s positional entrance/exit movement while preserving the content swap.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the same Vitest command and confirm the disclosure interaction passes.

### Task 3: Finish the compact capability strip and focused CTA

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Compact the hero spacing**

Reduce the hero minimum height and vertical gaps while keeping the existing navy gradient, gold accents, PLV seal, animated route lines, ambient glows, and map CTA.

- [ ] **Step 2: Reuse the existing section for a capability strip**

Replace the longer campus-scenario cards with three compact capabilities:

```text
Find buildings and offices
Get walking directions
Choose accessible routes
```

Keep the asymmetric visual emphasis and avoid another carousel or long card grid.

- [ ] **Step 3: Keep the final CTA focused**

Remove duplicated campus information from `FinalCTA`; the shared footer owns the official address, registrar email, establishment year, and inauguration date.

- [ ] **Step 4: Render only the approved short information architecture**

Keep `HeroSection`, `HowHelpsYou`, `CampusCapabilities`, and `FinalCTA` in `LandingPage`. Do not render an announcements/events section or a second standalone route preview. Stop rendering the old platform highlights, long timeline, product showcase, “Why NaviSync”, and “A Day With NaviSync” sections.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the landing interaction test again and confirm all three contracts pass.

### Task 4: Validate the implementation

**Files:**
- Inspect: `src/pages/LandingPage.tsx`
- Inspect: `src/pages/__tests__/LandingPage.interaction.test.tsx`

- [ ] **Step 1: Check changed-file TypeScript diagnostics**

```powershell
& .\node_modules\.bin\tsc.cmd --noEmit --pretty false 2>&1 | Select-String -Pattern 'src/pages/LandingPage|src/pages/__tests__/LandingPage.interaction'
```

Confirm there are no diagnostics matching the changed landing files.

- [ ] **Step 2: Run the production build**

```powershell
& .\node_modules\.bin\vite.cmd build
```

Confirm the build exits successfully. Treat existing large-file Babel notices as warnings unless the command fails.

- [ ] **Step 3: Run a responsive smoke check**

Inspect the landing page at desktop and narrow mobile widths. Confirm the feature selector stacks vertically, the active panel is readable below it, no horizontal scrollbar is introduced, the contact email is clickable, and reduced-motion mode does not make content unavailable.

- [ ] **Step 4: Review the diff without staging or syncing**

Run `git diff --check` and review only the files touched by this task. Do not stage, commit, pull, or push as part of this implementation.

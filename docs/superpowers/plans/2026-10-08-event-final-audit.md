# Event map clarity and final audit implementation plan

**Goal:** Make the event and actual map location clear across viewport sizes, then verify responsive, keyboard, recovery, and role behavior in the rendered event flow.

**Architecture:** Extend the existing EventMapPanel with actual map context and explicit details/fit controls. Use the current CampusMapPage camera and authored bounds to frame a location once when it changes, and on explicit Fit map. Keep data/publication/notification permissions intact.

**Tech stack:** React, TypeScript, Tailwind, Motion, Vitest/Testing Library, isolated Playwright/Edge browser contexts.

## Constraints

- Work in the existing checkout, preserving all previously approved uncommitted event work.
- User approved design and execution together; proceed inline without an additional design approval round.
- No deployment, push, schema change, account creation, or retained QA event.
- Controlled fixtures may replace event responses; live requests are read-only/sign-in only.
- Browser viewport/keyboard emulation is reported separately from physical-device testing.

## Tasks

- [x] Panel/context: first add regression cases in `src/components/map/__tests__/EventMapPanel.test.tsx` for changing to an unrelated floor, visible current-location status, details disclosure/focus, and Fit map. Observe failure; update `EventMapPanel.tsx` and `CampusMapPage.tsx`; run the focused suite.
- [x] Framing: reuse `getStudentOverviewCamera` and the authored campus/floor bounds. Test measured usable map space with independently derived expected framing in a controlled browser before fixing. Location change/explicit Fit map updates camera; detail disclosure alone preserves it.
- [x] Browser audit: create `docs/verification/event-final-audit/run-ui.mjs`; capture each viewport/mode and test panel scrollability, controls/hit areas, long text, dark/reduced-motion cases, nested modal Escape/focus, offline/retry, expired-session behavior, and owner isolation. Record defects before fixing; regression-test meaningful behavior changes.
- [x] Verify: focused event suites, Vite build, baseline-relative type diagnostics, diff check, and independent final code review. Save screenshots/results and reconcile the manual checklist with dated evidence instead of marking unavailable checks passed.

Run focused tests with `node node_modules/vitest/vitest.mjs run src/components/map/__tests__/EventMapPanel.test.tsx --reporter=dot --maxWorkers=1`. Run browser checks with `node docs/verification/event-final-audit/run-ui.mjs`. Run build with `node node_modules/vite/bin/vite.js build`.

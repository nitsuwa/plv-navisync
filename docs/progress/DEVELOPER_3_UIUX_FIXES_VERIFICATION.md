# Developer 3 — UI/UX Fixes Verification (P1–P4)

**Date:** August 11, 2026
**Scope:** 4 fixes mula sa full UI/UX audit (`docs/08_SYSTEM_AUDIT_AND_SUGGESTIONS.md` → Part 4) + ang naunang Route-Planner-vs-Steps-Panel overlap fix.
**Files changed:** `src/pages/CampusMapPage.tsx`, `src/pages/AdminAnnouncementsPage.tsx`, `src/components/layout/AdminLayout.tsx`, `src/components/layout/AdminSidebar.tsx`.
**Test result:** `pnpm build` PASS · **639/639 tests** PASS (57 files).

---

## P2 — Mode pills vs search bar overlap (0px na)

**Bago:** sa desktop na ~768–950px ang lapad, ang mode pills (Standard/Accessible/SOS) ay sumasapaw sa search bar ng **24px**.
**Ngayon:** desktop search width = `min(300px, calc(50vw - 160px))` → **0px overlap** (5px gap). Bonus: tinanggal ang duplicate search bar sa mobile.

### Testing
1. Buksan `/map` sa desktop window.
2. I-resize ang window sa lapad na **~800–900px** (o 85% zoom).
3. **DAPAT:** Hindi na magkakapatong ang search bar (kaliwa) at ang mode pills (gitna).
4. **DAPAT:** Isang search bar lang ang makikita (dati may dalawang nakapatong sa mobile — tinanggal na ang duplicate).
5. I-resize sa mobile width (<768px, hal. 390px) → **DAPAT:** isang search bar pa rin, full-width (left to right-14), kasama ang mode chips sa kanan.

---

## P4 — Mobile steps sheet (hindi na sumasapaw sa campus selector/zoom)

**Bago:** sa mobile na may active route, sumisilip ang campus selector at zoom buttons sa ilalim ng steps sheet.
**Ngayon:** sa mobile kapag may active route, itinatago ang campus selector (`hidden md:block`) at zoom controls (`hidden md:flex`); sa desktop visible pa rin sila.

### Testing (mobile width)
1. Sa mobile (hal. 390px), buksan `/map` → **Directions** → piliin ang A at B → mag-compute ang route.
2. **DAPAT:** Steps sheet lang sa ibaba — **WALA nang campus selector o zoom buttons na sumisilip** sa ilalim nito.
3. I-click ang **End** → **DAPAT:** bumalik ang campus selector (ibaba-gitna) at zoom controls (ibaba-kanan).

### Testing (desktop, regression)
1. Sa desktop, buksan `/map` → Directions → piliin ang A at B.
2. **DAPAT:** Steps panel sa ibaba-kaliwa **AT** campus selector (ibaba-gitna) + zoom controls (ibaba-kanan) ay **visible pa rin**.

---

## P3 — Announcements: Archived filter tab

**Bago:** ang Admin Events page may `Archived` tab, ang Announcements wala (inconsistent).
**Ngayon:** may status filter tabs **All / Published / Draft / Archived** na may counts; ang Archive button ay nakatago sa mga archived rows.

### Testing
1. **Admin Login** → `/admin-dashboard/announcements`.
2. **DAPAT:** Sa tabi ng search bar ay may 4 na tabs: `All (n) · Published (n) · Draft (n) · Archived (n)`.
3. I-click ang **Archived** tab → **DAPAT:** lalabas lang ang mga archived announcements (o empty state kung wala).
4. I-click ang **All** → **DAPAT:** bumalik ang lahat.
5. Sa isang published/draft row → **DAPAT:** may **Archive** button pa rin; sa isang archived row → **DAPAT:** WALA nang Archive button (Edit na lang).

---

## P1 — Admin sidebar mobile drawer

**Bago:** ang admin sidebar ay fixed `w-56` (224px) kahit sa phone → siksikan ang content.
**Ngayon:** sa desktop, sidebar pa rin (collapsible 224→64px). Sa mobile, sidebar ay nakatago at may **hamburger (☰) + overlay + slide-in drawer** na nagsasara pag pumili ng nav item o nag-tap sa labas.

### Testing (mobile width)
1. Mag-login bilang **Demo Administrator** → dadalhin ka sa `/admin-dashboard`.
2. **DAPAT:** WALANG sidebar na naka-display; sa header (top-left) may **hamburger icon (☰)**.
3. I-click ang hamburger → **DAPAT:** mag-slide-in ang sidebar drawer mula kaliwa + may dimmed overlay sa likod.
4. I-click ang isang nav item (hal. **Reports**) → **DAPAT:** mag-navigate sa page at **kusang magsasara ang drawer**.
5. Buksan muli ang drawer → i-tap ang **overlay** (labas ng drawer) → **DAPAT:** magsasara.
6. I-click ang **Sign Out** sa drawer → **DAPAT:** mag-logout.

### Testing (desktop, regression)
1. Sa desktop (>=768px), nasa `/admin-dashboard`.
2. **DAPAT:** Sidebar visible pa rin sa kaliwa (224px).
3. I-click ang **collapse button** (panel icon, top-left ng header) → **DAPAT:** nagiging 64px (icons lang) → i-click ulit → babalik sa 224px.
4. **DAPAT:** WALANG drawer/overlay na lumalabas sa desktop.

---

## Bonus — Route Planner vs Steps Panel overlap

**Bago:** pag napili ang A + B, sabay na lumalabas ang Route Planner (may ROUTE READY) at ang Steps Panel → nagpapatong sa kaliwa.
**Ngayon:** (1) auto-close ang planner pag handa na ang route (null→route transition), at (2) parehong desktop/mobile steps panel ay guarded ng `route && !directionsMode` → imposible nang mag-overlap.

### Testing
1. `/map` → **Directions** → Start: **CABA** → Dest: **SCB** (auto-filled kung galing sa building panel).
2. **DAPAT:** Pagkapili ng A, **kusang magsasara ang Route Planner** at lalabas na lang ang Steps Panel (DIST/TIME/VIA + steps + End/Replay).
3. I-click ang **Directions icon** (tabi ng search) → **DAPAT:** babalik ang planner na preserved ang A/B — walang patong habang nag-e-edit.
4. I-click ang **Navigate/Find Route** → **DAPAT:** magsasara ang planner, Steps Panel ang lalabas.

---

## Summary

| Fix | Build | Live verified |
|---|---|---|
| P2 — pills/search overlap | ✅ | ✅ 0px overlap sa 862px |
| P4 — mobile steps sheet | ✅ | ✅ desktop visible, mobile hidden |
| P3 — announcements Archived tab | ✅ | ✅ tabs All(2)/Published(2)/Draft(0)/Archived(0) + filter |
| P1 — admin mobile drawer | ✅ | ✅ desktop collapse 224→64px |
| Bonus — planner vs steps | ✅ | ✅ auto-close + no overlap |
| **Full suite** | **`pnpm build` PASS** | **639/639 tests PASS** |

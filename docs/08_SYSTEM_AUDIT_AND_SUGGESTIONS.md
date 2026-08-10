# PLV NaviSync — System Audit & Out-of-Scope Suggestions

**Date:** August 10, 2026
**Audit basis:** Live source at `main` (commit `de7019c` + uncommitted Dev-3 round-2 work), `docs/00_PROJECT_CONTEXT.md`, `docs/01_SYSTEM_FEATURES.md`, `docs/06_IMPLEMENTATION_ORDER.md`, `CURRENT_IMPLEMENTATION.md`, and the three progress files.

---

## Executive Summary (Tagalog)

Ang sistema ay **malakas na sa core**: may gumaganang auth (Supabase), interactive map na may totoong campus graph, route planning na may walking-dot animation, student portal (favorites, reports, events), at admin pages (dashboard, reports, events, announcements, settings, activity logs). Ang tatlong developers ay may kumpletong coverage ng kanilang A/B/C packages.

**Pero may mga feature sa frozen spec na WALA sa kahit sinong developer:**
1. **QR Location Sharing** — enhancement module sa spec, pero ang QR ngayon ay **fake pattern lang** (hindi scannable)
2. **Remember Last Viewed Building** — nasa spec, pero wala kahit saan

**May mga spec-adjacent gaps na hindi covered ng A/B/C:**
3. Usage Analytics (may dead-code chart primitives na `WeeklyChart`/Recharts)
4. In-app notifications (may decorative bell sa admin nav)
5. Building operating hours (Open/Closed status)
6. Emergency alert broadcast (wala pa sa kahit anong package)

**May engineering hygiene na kaya nating gawin NGAYON kahit blocked ang iba:**
7. GitHub Actions CI (zero CI ngayon)
8. Playwright e2e harness prep (para sa C10)
9. Dead-code cleanup + bundle-size audit

---

# PART 1 — SYSTEM AUDIT

## 1.1 What exists and works today

### Public / Student side
| Area | Status | Notes |
|---|---|---|
| Landing page (Home) | ✅ Working | Live announcements + events via `eventService.getPublishedAnnouncements()` |
| Interactive campus map | ✅ Working | Seeded PLV campus: SCB, Canteen, CABA, COED, CEIT, GUARD + red-brick walkway graph |
| Route planning | ✅ Working | Standard/Accessible/SOS modes, real graph routes, walking-dot animation, live step highlight, Replay |
| "You are here" | ✅ Working | GPS + tap-on-map pin, snap-to-walkway, kiosk-style UX |
| Search + Directory | ✅ Working | Building picker, details panel, floor plan entry |
| Student portal | ✅ Working | Profile, favorites, recent destinations, reports history, settings |
| Reports submission | ✅ Working | From map with location, student history |
| Events + Announcements | ✅ Working | Public list + map markers (eventService) |
| Help Center | ✅ Working | FAQ + guest AI chat (localStorage, daily limit) |

### Admin side
| Area | Status | Notes |
|---|---|---|
| Dashboard | ✅ Working | Live counts via `dashboardService` (C8-B removed fake numbers) |
| Reports management | ✅ Working | Workflow Pending → Under Review → In Progress → Resolved/Rejected + CSV/JSON export |
| Events CRUD | ✅ Working | Create/edit/archive |
| Announcements CRUD | ✅ Working | Create/edit/publish/archive |
| Activity logs | ✅ Working | `/admin-dashboard/activity-logs` (C8-A audit trail) |
| Settings | ✅ Working | Persisted via `system_settings` upsert (site name, theme, coords, zoom) |
| Users | ✅ Working | Admin user management (A3, edge function) |
| Map Builder | 🚧 Dev 2 active | Floor editor overhaul merged (PR #8); B5–B10 pending |

### Platform
| Area | Status | Notes |
|---|---|---|
| Supabase auth | ✅ | Guest/student/admin; demo accounts provisioned |
| RLS + migrations | ✅ | 9 migrations, generated types |
| PWA shell | ✅ partial | `manifest.json` + `sw.js` + icons exist; offline campus caching is C10 |
| Tests | ✅ | 43 test files, 408/408 passing; no Playwright yet |

## 1.2 Coverage matrix — what the 3 developers own

| Workstream | Packages | Status |
|---|---|---|
| **Dev 1 (A)** | A1–A5 done; A6–A9 blocked (A6/A7 needed for C8-C + Gate G3) | 🔒 mostly blocked |
| **Dev 2 (B)** | B1 done; B3 ready-to-commit; B4 floor editor overhaul pushed (PR #8); B5–B10 pending | 🔒 active |
| **Dev 3 (C)** | C1–C3, C5–C9 done; C4 Phase 1 + kiosk round-2 done (uncommitted); C4 Phase 2 blocked on Gate G3; C8-C blocked on A6/A7; C10 blocked on Gate G5 | 🔒 mostly blocked |

## 1.3 Findings — code quality & hygiene

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | **16 files uncommitted** (Dev-3 round-2: campus map, pin UX, geo.ts, tests, `07_SYSTEM_SUMMARY.md`) | ⚠️ | `git status` |
| 2 | **`src/components/map-builder-v2/` is dead code** — not imported anywhere | 🟡 | `grep -rn "map-builder-v2"` → no references |
| 3 | **`WeeklyChart.tsx` + `src/app/components/ui/chart.tsx` are unused** — analytics primitives nobody consumes | 🟡 | no imports outside `__tests__` |
| 4 | **Root has 14 legacy Python/JS fix scripts** (`fix_*.py`, `enhance_nav*.py`, `audit-*.mjs`) — one-time migration tools left in repo | 🟡 | project root listing |
| 5 | **QR feature is a fake animated pattern** (`QRPlaceholder.tsx`) — not a scannable QR, no link payload | 🔴 (spec gap) | frozen spec lists QR Location Sharing as an enhancement module |
| 6 | **Admin notification bell is decorative** — no notifications table, no badge logic | 🟡 | `AdminLayout.tsx` line 84 |
| 7 | **`console.log` in production code** (`src/lib/supabase.ts:36`) | 🟢 | minor |
| 8 | **No CI/CD** — no GitHub Actions; nothing runs build/tests on push | 🟡 | repo has no `.github/workflows` |
| 9 | **Vite chunk warning** — `AdminMapBuilderPage` > 500 kB | 🟡 | build output |
| 10 | **Campuses still persisted in localStorage** (`plv-campuses`) as fallback | 🟡 | `CURRENT_IMPLEMENTATION.md` Appendix A |

---

# PART 2 — SUGGESTIONS OUTSIDE THE 3 DEVELOPERS' SCOPE

> Lahat ng ito ay **hindi kasama** sa A1–A9, B1–B10, o C1–C10 — ibig sabihin **walang developer ang gagawa nito** maliban kung tayo mismo ang kumuha.

---

## Category A — Frozen-spec enhancement modules na WALA sa kahit sino

### A1. 🎯 Real QR Location Sharing (replaces fake placeholder)
- **Ano:** Sa Building Details panel / map, i-generate ang **totoong scannable QR** na naglalaman ng link (hal. `${origin}/map?buildingId=scb` o `?from=X&to=Y&mode=accessible`).
- **Ngayon:** `QRPlaceholder.tsx` ay animated na pixel pattern — **hindi scannable**, wala talagang ginagawa.
- **Demo value:** I-scan gamit ang pangalawang phone → bubukas ang mapa sa mismong building/route. Napaka-wow para sa panel defense.
- **Effort:** S (use a QR lib like `qrcode.react` or `uqr`; ~1-2 files).
- **Bakit wala sa scope:** enhancement module sa spec; C10 lang ang nagha-hint (offline), walang package ang may QR.

### A2. 🎯 Remember Last Viewed Building
- **Ano:** Kapag bumalik ang user sa `/map`, i-restore ang huling piniling building + zoom/pan position (localStorage, `plv-last-viewed`).
- **Ngayon:** Wala — lagi kang nagsisimula sa default view.
- **Demo value:** Maliit pero magandang UX touch; nasa frozen spec "Enhancement Modules".
- **Effort:** S (1 hook + 1 effect sa CampusMapPage).

---

## Category B — Spec-adjacent gaps (nabanggit sa CURRENT_IMPLEMENTATION, walang package)

### B1. 📊 Usage Analytics (dead chart primitives → live dashboard)
- **Ano:** Anonymous page-view/search/route-request tracking → bagong "Analytics" section sa admin dashboard gamit ang **existing** `WeeklyChart` + Recharts (dead code ngayon).
- **Ngayon:** `CURRENT_IMPLEMENTATION.md` §"Module 7": *"Any analytics feature — the module is entirely absent."* Ang `WeeklyChart.tsx` at `chart.tsx` ay hindi ginagamit.
- **Demo value:** Ang "Map views this week", "Top searches", "Most-routed destinations" ay ang klasikong panel-pleaser.
- **Effort:** M (1 table `usage_events` + 1 tracking hook + dashboard section). Pwede ring localStorage-only kung ayaw hawakan ang DB (mas mura, walang migration).

### B2. 🔔 In-app notifications (decorative bell → real)
- **Ano:** Kapag binago ng admin ang status ng report (hal. "Resolved"), makakatanggap ang student ng notification. Bell sa nav na may badge.
- **Ngayon:** Ang `Bell` sa `AdminLayout` ay display-only; walang `notifications` table sa schema.
- **Demo value:** Kumpletong loop ang report workflow — maganda sa demo ng C5/C8.
- **Effort:** M (1 table + service + bell component; polling o Supabase Realtime).

### B3. 🕐 Building operating hours (Open/Closed)
- **Ano:** `opening_hours` sa building → "● Open" / "● Closed" status sa details panel + directory (may "Open" status na ang seed data pero static).
- **Ngayon:** `CURRENT_IMPLEMENTATION.md` §Buildings: *"hours-of-operation scheduling"* ay missing.
- **Demo value:** Totoong-university feel; easy to demo (SCB "Open 7AM–8PM").
- **Effort:** S–M (schema field + display logic).

### B4. 🚨 Emergency alert broadcast
- **Ano:** Admin "Post emergency alert" → banner sa public map/landing + optional na lumalabas sa lahat ng pages. May kaugnayan sa SOS mode ng C4 pero admin-side ang broadcast.
- **Ngayon:** `CURRENT_IMPLEMENTATION.md` §Emergency: *"AdminSettings has decorative email/SMS alert toggles only"* — wala nang toggles pa nga (tinanggal sa C8-B).
- **Demo value:** Disaster-preparedness angle — malakas sa defense (ISO safety objective).
- **Effort:** M (1 table o system_settings flag + banner component).

---

## Category C — Demo-winning additions (bagong ideas, wala sa spec)

### C1. 🇵🇭 English / Tagalog language toggle
- **Ano:** Simple i18n (2 language keys) — toggle sa nav. Ang audience ng PLV ay Filipino; maraming guards/staff ang mas komportable sa Tagalog.
- **Bakit ngayon:** Wala pa kahit isang `i18n` library; lahat ng UI ay English. Ito ang pinaka-visible "extra mile".
- **Demo value:** "English / Filipino" toggle sa demo = instant wow.
- **Effort:** M (key-store + `t()` helper; huwag mag-install ng mabigat na i18n framework — custom dictionary lang).

### C2. 📷 QR scanner → instant navigation
- **Ano:** (Paired with A1) Student mode: i-scan ang QR na nakapaskil sa building → auto-open route mula "You are here" papunta sa building na iyon.
- **Effort:** M (camera-based scanner lib; kailangan HTTPS o localhost — gumagana sa preview).
- **Note:** Ito ang "SM kiosk" energy — pinag-usapan na natin ang kiosk pathfinder; ang QR scanner ang natural na partner nito.

### C3. 🔗 Route sharing via deep link
- **Ano:** "Share route" button → generate `${origin}/map?from=scb&to=caba&mode=accessible` → pag-open, auto-compute at i-animate ang route.
- **Ngayon:** May `?buildingId=` deep-link na; i-extend lang sa `from/to/mode`.
- **Effort:** S (URL parsing + auto-open logic sa CampusMapPage).

---

## Category D — Engineering hygiene (kaya NGAYON kahit blocked)

### D1. ⚙️ GitHub Actions CI
- **Ano:** `.github/workflows/ci.yml` — `pnpm install → pnpm build → pnpm test` sa bawat PR/push.
- **Ngayon:** Zero CI. Ang build + 408 tests ay manu-mano lang.
- **Demo value:** "May CI kami" — professional signal; nakaka-impress sa panel.
- **Effort:** S (1 YAML file). **Ito ang pinaka-inirerekomenda kong gawin ngayon** — walang conflict sa kahit anong package ng ibang dev.

### D2. 🧪 Playwright e2e harness (C10 prep)
- **Ano:** I-install ang Playwright + 3 smoke tests (guest login → map load; student route; admin login → dashboard). Hindi ito ang C10 mismo (blocked), pero ang harness ay prep.
- **Effort:** M (devDependency + 3 specs + config).

### D3. 🧹 Dead code cleanup
- **Ano:** Alisin/archive ang `src/components/map-builder-v2/`, `WeeklyChart` (o gamitin sa B1), at ang 14 legacy root scripts (`fix_*.py` atbp.). **Mag-ingat:** i-verify munang hindi ginagamit — may bahagi na baka part ng ibang dev.
- **Effort:** S–M.

### D4. 📦 Bundle-size + perf check
- **Ano:** I-audit ang >500 kB `AdminMapBuilderPage` chunk (manualChunks / lazy-load ng mabibigat na libs tulad ng Recharts, MUI).
- **Effort:** S (vite config tweak).

---

# RECOMMENDED NEXT ACTIONS (priority order)

| Priority | Item | Effort | Kaya ngayon? | Bakit |
|---|---|---|---|---|
| 1 | **D1 — GitHub Actions CI** | S | ✅ Oo (walang dependency) | Pinakamabilis, zero risk, professional signal |
| 2 | **A1 — Real QR Location Sharing** | S | ✅ Oo | Frozen-spec gap; maliit; malaking demo impact |
| 3 | **A2 — Remember Last Viewed Building** | S | ✅ Oo | Frozen-spec gap; 1 hook lang |
| 4 | **C3 — Route share deep-link** | S | ✅ Oo | Small; pairs with A1 |
| 5 | **C1 — EN/TL language toggle** | M | ✅ Oo | Pinaka-visible "extra mile" |
| 6 | **B2 — Notifications** | M | ⚠️ Depende sa schema | Malakas kung magawa |
| 7 | **B1 — Analytics** | M | ✅ Oo (localStorage version) | Dead code → live feature |
| 8 | **C2 — QR scanner** | M | ✅ Oo | Kiosk-style wow |
| 9 | **B3 — Operating hours** | S–M | ✅ Oo | University realism |
| 10 | **B4 — Emergency broadcast** | M | ⚠️ Depende sa schema | Demo-ready kung sakto |

> ⚠️ **Team rule reminder:** Bago gawin ang anumang item dito, i-confirm na hindi ito bahagi ng anumang A/B/C package at walang ibang developer ang gumagawa nito. Lahat ng nasa itaas ay verified na walang owner sa tatlong workstreams (base sa `06_IMPLEMENTATION_ORDER.md` coverage matrix).

---

# PART 3 — IMPLEMENTATION STATUS (August 10, 2026)

✅ **Lahat ng 6 na frozen-spec/adjacent gaps ay IMPLEMENTED, live-verified, at naka-test.**

| # | Feature | Status | Files |
|---|---|---|---|
| 1 | Real QR Location Sharing | ✅ DONE | `src/components/map/LocationQR.tsx` (new), `BuildingInfoPanel.tsx`, dep `qrcode.react`; `QRPlaceholder.tsx` deleted |
| 2 | Remember Last Viewed Building | ✅ DONE | `CampusMapPage.tsx` (`plv-last-viewed` localStorage, restores building + zoom) |
| 3 | Usage Analytics | ✅ DONE | `src/services/usageAnalyticsService.ts` (new, localStorage — no migration), `AdminDashboardPage.tsx` (Usage Analytics card, WeeklyChart now live) |
| 4 | In-app notifications | ✅ DONE | Admin bell = real activity-log feed + unread badge (`AdminLayout.tsx`); student report-status change badge + toast (`Navbar.tsx`, `src/lib/notificationService.ts` new) |
| 5 | Building operating hours | ✅ DONE | `src/lib/buildingHours.ts` (new); live Open/Busy/Closed in `BuildingInfoPanel` + `BuildingDetailsPage` |
| 6 | Emergency alert broadcast | ✅ DONE | `Emergency` tab sa `AdminSettingsPage` (persisted via `system_settings`), `EmergencyBanner.tsx` + `useEmergencyAlert.ts` (new); live-verified banner sa public pages |

**Bonus bug fix:** `BuildingDetailsPage` ay gumagamit na ng `usePublishedCampus` (hindi legacy `useCampusData`) → nawala ang "Building Not Found" sa `/buildings/b_scb` at iba pang seeded ids.

**Design decisions (para iwas conflict sa ibang dev):**
- ❌ WALANG bagong DB table o migration — lahat gumagamit ng `localStorage`, `system_settings` (existing), o `activity_logs` (existing) para hindi maabala ang migration coordination ni Dev 1
- ❌ Hindi ginalaw ang `src/components/map-builder/types.ts` (Dev 2) — ang hours registry ay hiwalay na file
- ✅ 20 bagong unit tests (`buildingHours` 10, `notificationService` 8, `usageAnalyticsService` 6) → **428/428 tests PASS**, `pnpm build` PASS

**Live verification evidence:**
- QR: real scannable QR (aria-label "QR code for Student Center Building") + Copy link
- Last-viewed: SCB na-auto-restore pagkatapos ng reload
- Hours: SCB "Closed" (11 PM) sa map panel + details page
- Bell: real feed ("Announcement published 3d ago", "Report resolved 3d ago"…)
- Analytics: Usage Analytics card + WeeklyChart sa dashboard
- Emergency: red critical banner "Class suspension due to Typhoon…" lumabas sa public map, at na-off din (malinis ang DB)

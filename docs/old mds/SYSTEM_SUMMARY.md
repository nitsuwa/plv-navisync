# PLV NaviSync — System Overview

> **A campus navigation system for Pamantasan ng Lungsod ng Valenzuela (PLV)** that helps students find buildings, rooms, and facilities — and gives administrators a full **Map Builder** to design, manage, and publish campus data.

**Tech stack:** React 18 · TypeScript · Vite · Tailwind CSS 4 · Motion (Framer Motion) · React Router 7 · Supabase (optional) · Leaflet · Recharts · Radix UI · shadcn-style component kit
**Original design:** [Figma — Build PLV NaviSync App](https://www.figma.com/design/JKsrOJBLNqkdNSv3u8702j/Build-PLV-NaviSync-App)

---

## 1. Purpose

PLV NaviSync is a **wayfinding and campus management web app** for the PLV campus. It serves two audiences:

| Audience | Goal |
|----------|------|
| **Students / visitors** | Find buildings, search rooms, get step-by-step directions (outdoor walkways + indoor floor plans), view facilities, accessibility info, events, and report issues. |
| **Administrators** | Build and maintain campus maps with a professional-grade **Map Builder** — draw buildings, floors, rooms, paths, accessibility features, emergency routes, and event overlays — then publish them live for students. |

A single published campus powers the student-facing map; the Map Builder is the "content management" layer that produces it.

---

## 2. Architecture at a Glance

```
App (React + Router)
├── Public layout
│   ├── Landing page
│   ├── Campus Map  (interactive SVG campus + floor plans + navigation)
│   ├── Buildings directory + building details
│   ├── Help Center
│   └── Student portal: My Day, Profile, Favorites, Reports, Settings
├── Auth pages
│   ├── Admin login
│   └── Student registration
└── Admin portal (auth-protected)
    ├── Dashboard, Users, Settings, Reports
    ├── Map Builder (Campus Home → Campus Editor → Floor Editor → Publish)
    └── Legacy management pages (Buildings, Locations, Routes, etc.)
```

**Data layer:**
- `CampusDataContext` — global store of campuses (published/draft/archived)
- `services/` — CRUD wrappers over Supabase tables (`campuses`, `buildings`, `floor_plans`, `markers`, `paths`, `navigation_routes`, `campus_events`, `announcements`, `reports`, `users`, …)
- **Mock-first:** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set, the app runs fully on in-memory mock data and gracefully upgrades to Supabase when configured.

**Pathfinding engines** (`lib/`):
- `pathfinding.ts` — A* over a calibrated outdoor walkway graph (≈0.22 m/SVG unit), building-entrance map, distance/time estimates, human-readable steps
- `indoorPathfinding.ts` — auto-detects corridors from room positions, builds a per-floor graph, routes stair/elevator → room
- `combinedPathfinding.ts` — stitches indoor + outdoor segments into end-to-end routes (room→room, building→room, etc.), including multi-floor transitions via stairs/elevators

---

## 3. Student-Facing Features

### Campus Map (`/map`)
- Interactive **SVG campus map** with smooth zoom/pan, inertia scrolling, pinch-to-zoom (mobile), and keyboard shortcuts
- **Search** buildings and rooms (with debounce + recent searches)
- **Directions mode** — pick from/to buildings; animated route with glow, arrows, waypoints, distance, and ETA
- **Three map modes:** Standard · Accessible (wheelchair-safe routes + markers) · Emergency (exits, rally points, EXIT overlays)
- **Floor plans** — drill into any building, switch floors, animated stair/elevator transitions, **indoor room routing** with step-by-step directions
- Building info panel: facilities, accessibility, opening status (Open/Busy/Closed), favorites bookmarking, **report an issue** modal, share/QR options
- **Multi-campus support** — students see only published, non-archived campuses, newest first

### Student Portal
- **My Day** — personalized daily view
- **Profile & Settings** — student account, preferences, theme
- **Favorites** — save and revisit buildings
- **Reports** — track submitted issue reports

### Public Pages
- **Landing page** — marketing/home with hero, features, call-to-actions
- **Buildings directory** — browse buildings, view details (facilities, floor plans, accessibility)
- **Help Center** — FAQ/support content
- **Announcements** — campus announcements

---

## 4. Admin Features

### Admin Portal (auth-protected)
- **Dashboard** — overview stats and quick actions
- **Users** — manage student/admin accounts
- **Settings** — app configuration, keybinds, theme
- **Reports** — review and manage student-submitted issues
- **Announcements** — publish campus announcements

### Map Builder (the flagship admin feature)
A full **GIS-style campus editor** inspired by Figma / Canva / Google Maps Editor, with hybrid **layers + contextual tools**:

- **Campus Home** — campus cards (status badge, building/floor counts, quick actions: open, duplicate, archive, delete), empty-state guide, campus creation wizard
- **Campus Editor** (`CampusEditor.tsx`) — the editing workspace:
  - **5 editing layers:** Campus, Navigation, Accessibility, Emergency, Events — each with its own tool palette, colors, and panels
  - **Tools:** Select, Marker (POI), Building (click-drag to draw, or palette-based placement), Path, Erase, Waypoint, Room, etc.
  - **Multi-select** — shift+click, rubber-band box selection, Ctrl+A, batch move/delete/duplicate, align & distribute
  - **Building manipulation** — drag (grid/edge snapping), **rotation** (smooth, snapped to 5°), rotation-aware resize, overlap detection, alignment guides
  - **Decor assets** — place, rotate, and uniformly scale decorative assets
  - **Hierarchy panel** — searchable tree of buildings/markers/paths/routes with visibility & lock toggles, floor expansion, drag-to-reorder
  - **Contextual properties panel** — per-selection / per-layer fields (basic, style, advanced tabs)
  - **Undo/redo**, keyboard shortcuts (with `?` cheat sheet), auto-save, validation dialog, test-navigation panel, right-click context menu
- **Floor Editor** — draw rooms per floor, room palettes, stair/elevator connections (which feed multi-floor routing), indoor path connections
- **Publish workflow** — validation checklist, save-as-draft, publish / unpublish / archive campuses, progress dialogs, pre-publish checks

### Legacy admin pages (still routable)
Buildings, Locations, Floor Plans, Routes, Accessibility, Event Maps — CRUD management pages for older workflows.

---

## 5. Key Technologies & Design Principles

- **Component kit:** shadcn-style Radix-based UI components (`src/components/ui/`) plus custom UI (ColorPicker, Combobox, ConfirmDialog, StatCard, etc.)
- **Motion design:** staggered entrances, spring tool palettes, animated route drawing (`draw-route`), marching-ants dashes, hover micro-interactions, route glow filters, pulse rings
- **Theming:** dark/light mode via `next-themes`, CSS variables, fonts (`--font-sans`, `--font-body`), PWA-ready (`public/manifest.json`, `sw.js`)
- **Map rendering:** pure SVG for campus + floor plans (no heavy map dependency), Leaflet available for alternate views
- **Testing:** Vitest + Testing Library (unit tests in `src/lib/__tests__/`)
- **Accessibility:** keyboard navigation, focus rings, ARIA labels, reduced-motion support

---

## 6. Project Structure (highlights)

```
src/
├── app/                  # Router + app shell (App.tsx, routes.tsx)
├── pages/                # Public, student, and admin pages (see Section 3 & 4)
├── components/
│   ├── layout/           # Navbar, footer, admin sidebar, mobile nav
│   ├── map/              # Student map widgets (info panel, picker, report modal…)
│   ├── map-builder/      # Campus Editor, Floor Editor, panels, dialogs
│   ├── map-builder-v2/   # Newer workspace (Buildings/FloorPlans/Layers/Routes/Preview tabs)
│   └── ui/               # Reusable component kit
├── lib/                  # Pathfinding, adapters, Supabase client, utils
├── services/             # Data-access layer (CRUD per entity)
├── contexts/             # CampusDataContext (global campus store)
├── hooks/                # useTheme, useStudentAuth, useUndoRedo, useDebounce…
├── data/                 # Mock buildings, floor plans, schedule
├── config/               # Table names, defaults, env helpers
└── types/                # Shared TypeScript types (index.ts, map.ts)
```

---

## 7. Setup & Running

```bash
npm i          # install dependencies (or pnpm i)
npm run dev    # start Vite dev server
npm run build  # production build
```

To enable persistence, create a `.env` with:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without env vars the app runs in **mock mode** using built-in seed data.

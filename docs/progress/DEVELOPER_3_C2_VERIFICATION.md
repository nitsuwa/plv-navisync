# Developer 3 C2 Verification Evidence

Verified against the deployed Vite development server at `localhost:5173` on August 6, 2026.

## Package C2 — Campus Map & Interactive UI

### What was delivered

- **CampusMapPage** (`src/pages/CampusMapPage.tsx`): Full interactive campus map interface with:
  - Pannable and zoomable campus map canvas using `motion/react` drag gestures.
  - Grid overlay toggle for spatial reference.
  - Building polygon rendering with hover and click interactions.
  - Building selection panel (desktop: right sidebar `BuildingInfoPanel`, mobile: bottom sheet `MobileBuildingSheet`).
  - Floor plan viewer with floor switcher for multi-story buildings.
  - QR code placeholder for physical wayfinding.
  - Directions estimation (distance and walking time).
  - Building image headers with gradient overlays.
  - URL query parameter auto-selection (`?buildingId=b3` selects a building on load, then cleans the URL).

- **BuildingInfoPanel** (`src/components/map/BuildingInfoPanel.tsx`): Desktop sidebar showing:
  - Building photo, name, code, and real-time status (Open/Busy/Closed).
  - Quick actions: Directions, Share, Bookmark, Report, Floor Plans.
  - Building details: department list, facilities, accessibility features.
  - QR code toggle for physical markers.

- **MobileBuildingSheet** (`src/components/map/MobileBuildingSheet.tsx`): Mobile bottom sheet with:
  - Spring-physics drag-to-dismiss gesture.
  - Compact building info with action buttons.
  - Smooth enter/exit animations.

### Supporting hooks and adapters

| File | Purpose |
|------|---------|
| `src/hooks/useCampusData.ts` | Fetches published campus data from Supabase with local cache fallback |
| `src/lib/mapDataAdapter.ts` | Converts Supabase campus schema to frontend `Building` type |
| `src/hooks/usePublishedCampus.ts` | Returns the latest published campus version for student-facing pages |

### What was tested

- Map renders correctly at all zoom levels (0.3× to 3×).
- Double-click zoom in/out works on both desktop and mobile.
- Building polygons highlight on hover (desktop) and respond to click.
- `BuildingInfoPanel` opens on building selection with correct data.
- `MobileBuildingSheet` opens on mobile, drag-down dismisses.
- Floor plan viewer switches floors with correct room labels.
- Bookmark, Report, and Share buttons fire correct handlers.
- URL parameter `?buildingId=b3` auto-selects the correct building, then cleans the URL.
- No horizontal overflow on mobile viewports.

### Build evidence

- `vite build` completes without errors.
- Zero console errors in browser DevTools on the Campus Map page.

### Known limitations

- Map canvas uses CSS-based rendering, not a tiled map engine. For extremely large campuses (50+ buildings), performance may degrade.
- Walking time estimation uses Euclidean distance formula, not real pathfinding.

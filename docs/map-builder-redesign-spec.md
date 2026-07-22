# Map Builder Redesign — Complete Workflow Specification

> **Project:** PLV NaviSync
> **Scope:** Full Map Builder workspace redesign (Admin Portal)
> **Target:** Capstone presentation — polished, smooth, professional
> **Date:** July 14, 2026
> **Status:** Draft for review

---

## 1. Vision Statement

The Map Builder should feel like **a professional GIS and campus editing application** — inspired by Figma, Canva, and Google Maps Editor. It is the **heart of the Admin Portal**, where all campus-related management happens. Every workflow should be intuitive, efficient, and enjoyable.

**Guiding principles:**
- **Quality over quantity** — fewer pages, better workflows
- **Progressive disclosure** — show high-level information first, drill down for details
- **Contextual tools** — tools change based on the active layer/mode
- **Professional polish** — smooth animations, clear feedback, no dead ends
- **Capstone-ready** — showcase-worthy without sacrificing usability

---

## 2. Architecture

### 2.1 Hybrid Layer + Contextual Tools Approach

Map Builder uses a **hybrid architecture**:
- A **horizontal layer bar** switches between editing contexts (Campus, Navigation, Accessibility, Emergency, Events)
- The **vertical tool palette** and **side panels** change depending on which layer is active
- Each layer unlocks only the tools and panels relevant to that editing context

### 2.2 Current Layers (kept and enhanced)

| Layer | Color | Purpose | Tools | Side Panel |
|-------|-------|---------|-------|------------|
| **Campus** | `var(--primary)` | Place buildings, markers, outdoor paths | Select, Marker, Building, Path, Erase | Hierarchy panel (buildings/floors) + Properties panel |
| **Navigation** | `#16a34a` | Draw walkable routes for navigation engine | Select, Path (route mode), Waypoint, Erase | Routes list panel + Waypoint properties |
| **Accessibility** | `#2563eb` | Mark ramps, accessible entrances, elevators | Select, Accessible Entrance, Ramp, Elevator Marker, Erase | Accessibility checklist panel |
| **Emergency** | `#dc2626` | Place exits, assembly areas, fire equipment | Select, Exit Marker, Assembly Area, Equipment, Erase | Emergency items panel |
| **Events** | `#d97706` | Temporary event markers and overlays | Select, Event Pin, Restricted Area, Info Booth, Erase | Event properties panel |

### 2.3 Navigation Flow

```
Admin Login
  └── Dashboard (simplified — 6 sidebar items)
        └── Map Builder (AdminMapBuilderPage)
              ├── Campus Home (CampusHome)
              │     ├── Campus cards grid (existing)
              │     ├── Quick Start wizard (NEW)
              │     └── Getting-started tutorial (NEW)
              │
              ├── Campus Editor (CampusEditor) — ENHANCED
              │     ├── Horizontal layer bar
              │     ├── Vertical tool palette (contextual)
              │     ├── SVG Canvas (multi-select + rubber-band)
              │     ├── Enhanced Hierarchy Panel (left)
              │     ├── Properties Panel (right, contextual)
              │     ├── Context Menu (right-click)
              │     └── Floor expandable preview (NEW)
              │
              ├── Floor Editor (FloorEditor) — ENHANCED
              │     ├── Floor plan canvas
              │     ├── Room palette (left)
              │     ├── Room properties panel (right)
              │     └── Stair/elevator navigation
              │
              └── Publish Dialog — ENHANCED
                    ├── Validation checklist
                    ├── Visual diff (before/after)
                    ├── Schedule publishing
                    └── Staging preview
```

---

## 3. Campus Home Screen

### 3.1 Campus Cards Grid (existing — enhanced)

- Each card shows a mini-map SVG of the campus
- Status badge (Published/Draft)
- Building/Floor/Room counts
- Updated date
- Quick Actions dropdown (Open Editor, Duplicate, Archive)
- Delete button (with confirmation)

### 3.2 Quick Start Wizard (NEW)

A prominent "Quick Start" button on the home screen launches a **guided wizard** that:
1. Creates a sample campus with pre-populated buildings
2. Runs a 30-second interactive tutorial (building drag-to-create, floor editing, publishing)
3. Lets the user customize the sample or start from scratch

**Trigger conditions:**
- First-time user (no campuses exist)
- Manual trigger via button "Quick Start"
- "Getting Started" link in empty state

### 3.3 Empty State (enhanced)

Show three workflow steps: Add buildings → Design floors → Publish live with interactive icons and a "Create First Campus" button.

---

## 4. Campus Editor — Enhanced

### 4.1 Multi-Select Support (NEW)

**Selection modes:**
- **Single click** — select one item (current)
- **Shift+click** — add/remove from selection
- **Rubber-band/box selection** — drag on empty canvas space to draw a selection rectangle; all items within the rectangle become selected
- **Select All** — Ctrl+A selects all items on the active layer

**Batch operations on multi-selection:**
- Move all selected items together (drag any one)
- Delete all selected items (Delete/Backspace)
- Duplicate all selected items (Ctrl+D)
- Group/ungroup (Ctrl+G / Ctrl+Shift+G)
- Align (left, center, right, top, middle, bottom — appear in Properties Panel toolbar)
- Distribute (horizontal, vertical — appear in Properties Panel toolbar)
- Batch property changes (opacity, visibility, lock)

**Edge snapping** works with multi-selection (treats group as a single bounding box).

### 4.2 Enhanced Hierarchy Panel (left)

**Features:**
- Search/filter input at top
- Section headers: Buildings, Markers, Paths (collapsible)
- Each item shows: color dot, name/code, visibility eye toggle, lock icon, item count badge
- Expand/collapse all buttons
- Drag-to-reorder within sections
- Right-click context menu on items
- Empty state messages when sections have no items

### 4.3 Contextual Properties Panel (right)

- Shows different fields depending on selection and active layer
- For **buildings**: Basic, Style, Advanced tabs (current — keep)
- For **markers**: name, type, color, position (current — keep)
- For **paths**: type, color, width, waypoint count
- For **navigation routes**: name, type (walking/accessible/emergency), distance, duration, from/to markers
- For **accessibility items**: feature type, notes, status
- NEW: Toolbar with alignment/distribution buttons when multiple items selected

### 4.4 Contextual Tool Palette

The tool palette changes based on the active layer:

| Active Layer | Tools Shown |
|-------------|-------------|
| Campus | Select, Marker, Building, Path, Erase |
| Navigation | Select, Path (route style), Waypoint, Erase |
| Accessibility | Select, Ramp, Elevator Marker, Accessible Entrance, Erase |
| Emergency | Select, Exit Marker, Assembly Area, Fire Equipment, Erase |
| Events | Select, Event Pin, Restricted Area, Information Booth, Erase |

Each tool has its own color-coded icon and hint text in the status bar.

### 4.5 Floor Preview Inline (NEW)

When a building is selected on the campus canvas:
- A **mini floor preview** appears as a floating panel on the canvas, showing the active floor plan
- The panel has: floor tabs (toggle between floors), room count, and a "Full Edit" button
- Clicking "Full Edit" transitions to the dedicated Floor Editor view
- The mini preview auto-hides when the building is deselected

### 4.6 Status Bar (enhanced)

- Left: object counts (B: N, M: N, P: N, R: N) — always visible
- Center: contextual hint text based on active tool
- Right: cursor coordinates (X: N, Y: N) — always visible
- NEW: Active layer indicator with color dot
- NEW: "Unsaved changes" indicator with auto-save status

---

## 5. Floor Editor — Enhancements

- Keep as a dedicated full-screen view (current approach is good)
- Add: room search/filter in the room properties panel
- Add: quick room type icons in the room palette (visual, not just text)
- Add: room dimension display when resizing (current has it)
- Keep: stair/elevator animations, indoor route drawing
- Add: ability to copy rooms across floors within the same building

---

## 6. Navigation Routes Integration (NEW)

No standalone Routes page in sidebar. Routes are managed entirely within the Map Builder.

**When Navigation layer is active:**
1. **Route drawing**: Path tool draws navigation routes (green colored, dashed pattern)
2. **Waypoint markers**: Existing markers become routable waypoints; new waypoints can be placed
3. **Route properties panel** (right): shows route name, type (walking/accessible/emergency), distance (auto-calc), duration (auto-calc from distance), from/to waypoints
4. **Existing routes** show in the enhanced hierarchy panel under a "Routes" section
5. **From/To markers** are selectable on the canvas; route waypoints appear as numbered dots
6. User can test the route by clicking "Preview" — temporarily switches to student map view

### Route Types

| Type | Color | Description |
|------|-------|-------------|
| Walking | `#0e2a6e` solid | Standard pedestrian path |
| Accessible | `#16a34a` dashed | Wheelchair-friendly path |
| Emergency | `#dc2626` dashed | Emergency evacuation route |

---

## 7. Campus Locations / POIs Integration (NEW)

No standalone Locations page in sidebar. Locations are managed within Map Builder.

**On Campus & Navigation layers:**
- Markers act as Points of Interest (POIs)
- Location types: entrance, parking, landmark, restroom, canteen, atm, clinic
- Marker style changes based on type (map icon)
- Properties panel shows type-specific fields
- POIs appear in the hierarchy panel under a "Markers" section

---

## 8. Accessibility Features Integration (NEW)

No standalone Accessibility page in sidebar. Managed within Map Builder.

**On Accessibility layer:**
- Per-building accessibility matrix: ramp, elevator, accessible restroom, ramp standards
- Visual indicators on building corners (blue 'A' badges)
- Accessibility markers can be placed on the canvas (ramp icons, elevator icons)
- Properties panel shows accessibility checklist per selected building
- Data flows directly into the pathfinding engine's `accessibleOnly` parameter

---

## 9. Event Overlays Integration (NEW)

No standalone Events page in sidebar. Managed within Map Builder.

**On Events layer:**
- Event pins can be placed on the canvas with custom colors and labels
- Temporary markers are visually distinct (star icons, gold colored)
- Restricted areas can be drawn as shaded polygons
- Event properties: title, date range, organizer, description, temporary features list
- When an event is "activated," it automatically overlays on the student map
- Only one event can be active at a time

---

## 10. Publishing Workflow — Enhanced

### 10.1 Validation Checklist (current — kept)

Check for:
- Empty buildings (no name, placeholder name)
- Buildings without descriptions
- Floors with no rooms
- Missing route configurations

### 10.2 Visual Diff (NEW)

Show a side-by-side comparison:
- **Left:** Current live version (what students see)
- **Right:** New version (what students will see after publishing)
- Highlight changed areas with color overlays (green = added, red = removed, amber = modified)

### 10.3 Scheduling (NEW)

- **Publish now** — immediate deployment
- **Schedule for later** — date/time picker; campus auto-publishes at scheduled time
- **Save as draft** — no deployment, keep working

### 10.4 Staging Preview (NEW)

- "Preview" button creates a temporary staging URL
- Admin can view the campus exactly as students would see it
- Staging preview is only accessible to admin (tokenized URL)
- Can be shared with reviewers for feedback before publishing

---

## 11. Keyboard Shortcuts — Complete System

### 11.1 Default Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `B` | Building tool (Campus layer) |
| `M` | Marker tool (Campus layer) |
| `P` | Path tool |
| `E` | Erase tool |
| `R` | Room tool (Floor Editor) |
| `1`–`5` | Switch between layers (1=Campus, 2=Nav, 3=Access, 4=Emergency, 5=Events) |
| `0` | Reset view (zoom + pan) |
| `+` / `-` | Zoom in / out |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save draft |
| `Ctrl+G` | Toggle snap to grid |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate selected |
| `Ctrl+Shift+G` | Toggle group selection |
| `Delete` / `Backspace` | Delete selected |
| `Escape` | Deselect / cancel path drawing |
| `?` | Show keyboard shortcuts cheat sheet |
| `Arrow keys` | Nudge selected item by 1px |
| `Shift+Arrow keys` | Nudge selected item by 10px |

### 11.2 Shortcut Cheat Sheet (NEW)

- Press `?` to overlay a modal showing all shortcuts
- Categories: Tools, Navigation, Editing, Selection, File
- Shows current custom keybinds if remapped
- Dismiss with Escape or click outside

### 11.3 Customization (Settings page)

Admin can remap shortcuts via Settings > Map Builder Keybinds.

---

## 12. Undo/Redo System

### 12.1 Current Implementation (keep)

- In-memory snapshot history (up to 30 entries) for both Campus Editor and Floor Editor
- `structuredClone` for deep copying campus state
- `pushHistory` called before destructive operations

### 12.2 Enhancements

- Show undo/redo count in tooltip ("Undo (3 steps available)")
- Disable undo button when at earliest snapshot, redo at latest
- Group rapid consecutive operations into a single undo step (e.g., typing in a text field)

---

## 13. Data Persistence

### 13.1 Auto-Save

- Auto-save every 30 seconds when changes are detected
- "Unsaved changes" indicator in status bar
- Auto-save triggers on: tab close / navigate away (via `beforeunload`)
- Visual feedback: subtle green flash on auto-save

### 13.2 Manual Save

- "Save draft" button in toolbar (current)
- Ctrl+S triggers manual save
- Shows "Saving..." → "Saved ✓" animation

### 13.3 Supabase Integration (prepared)

- When Supabase env vars are set, data persists to Supabase tables
- When not set, data persists in-memory (mock mode)
- Seamless migration: save triggers Supabase upsert when connected

---

## 14. Visual Design & UX Polish

### 14.1 Animations

| Element | Animation | Trigger |
|---------|-----------|---------|
| Tool palette | Spring entrance (x: 0 → 1, opacity) | On mount |
| Side panels | Slide in/out (x translate, 0.22s cubic-bezier) | On select/deselect |
| Building drag preview | Live update with dashed outline | On drag |
| Route drawing | Animated stroke-dashoffset | On route complete |
| Multi-select box | Dashed rectangle following cursor | On drag-select |
| Floor transition | Cross-fade, 0.3s | On floor switch |
| Save button | Spin icon → checkmark | On save complete |
| Publish button | Spring scale → glow | On publish success |
| Hierarchy panel items | Fade in + slide up (staggered) | On panel mount |

### 14.2 Accessibility

- All tooltips use `title` attribute
- Keyboard navigation for all interactive elements (Tab, Enter, Escape)
- Focus states visible (focus-visible ring)
- Reduced motion support (`prefers-reduced-motion`)
- ARIA labels on icon-only buttons
- Color-blind friendly tool indicators (icon + label, not color-only)
- Minimum contrast ratios met for text overlays

### 14.3 Responsiveness

- **Desktop (1280px+)** : Full layout with hierarchy panel + canvas + properties panel
- **Tablet (768–1280px)** : Collapsible side panels, tool palette becomes horizontal at bottom
- **Mobile (<768px)** : Full-screen canvas, tool palette as bottom sheet, panels as modals

---

## 15. Future Considerations (Post-Capstone)

- Multi-campus federated editing
- Version history with diff viewer (compare two saved versions)
- Batch import/export (GeoJSON, SVG)
- Offline editing with IndexedDB
- Collaborative editing (WebSocket-based)
- Template library (pre-built campus layouts)

---

## 16. Implementation Plan

### Phase 1: Foundation
1. Multi-select + rubber-band selection
2. Enhanced hierarchy panel (search, visibility, lock, sections)
3. Contextual tool palette per layer

### Phase 2: Feature Integration
4. Navigation routes layer (with route properties panel)
5. Accessibility layer (with building checklist)
6. Event overlay layer (with event properties)

### Phase 3: Publishing & Shortcuts
7. Enhanced publish dialog (visual diff, scheduling, staging)
8. Keyboard shortcut cheat sheet + customization
9. Quick Start wizard + tutorial

### Phase 4: Polish
10. Floor inline preview panel
11. Remaining animations and micro-interactions
12. Responsive layout improvements

---

## 17. Files to Modify

| File | Change |
|------|--------|
| `src/components/map-builder/types.ts` | Add multi-select types, route event types |
| `src/components/map-builder/constants.ts` | Add layer-specific tool definitions |
| `src/components/map-builder/CampusEditor.tsx` | Multi-select, contextual tools, floor preview |
| `src/components/map-builder/Canvas.tsx` | Rubber-band selection, route layer rendering |
| `src/components/map-builder/PropertiesPanel.tsx` | Contextual panels per layer |
| `src/components/map-builder/HierarchyPanel.tsx` | NEW — extracted from CampusEditor |
| `src/components/map-builder/RoutesPanel.tsx` | NEW — route management panel |
| `src/components/map-builder/AccessibilityPanel.tsx` | NEW — accessibility checklist panel |
| `src/components/map-builder/EventsPanel.tsx` | NEW — event properties panel |
| `src/components/map-builder/ShortcutCheatSheet.tsx` | NEW — keyboard shortcut overlay |
| `src/components/map-builder/QuickStartWizard.tsx` | NEW — first-time wizard |
| `src/components/map-builder/PublishDialog.tsx` | Visual diff, scheduling, staging |
| `src/components/map-builder/CampusHome.tsx` | Quick Start button, enhanced empty state |
| `src/pages/AdminMapBuilderPage.tsx` | Wizard integration |

---

## 18. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layer vs mode | Hybrid (layers + contextual tools) | Best of both: familiar structure with context-aware UX |
| Multi-select scope | Full (rubber-band + shift-click + batch ops) | Professional editing feel; essential for capstone |
| Routes management | Inside Map Builder (Navigation layer) | Consolidates workflow; no standalone page needed |
| Locations management | Inside Map Builder (Campus layer markers) | Markers already serve as POIs |
| Accessibility management | Inside Map Builder (Accessibility layer) | Data flows directly to pathfinding |
| Events management | Inside Map Builder (Events layer) | Temporary overlays are naturally map-bound |
| Floor editing | Inline preview + Full Edit button | Quick access without losing context |
| Publishing | Validation + visual diff + scheduling + staging | Professional workflow for capstone demo |
| Keyboard shortcuts | Full cheat sheet + customization | Power users expect this |
| Data persistence | Mock mode → Supabase (graceful fallback) | Works offline, upgrades seamlessly |

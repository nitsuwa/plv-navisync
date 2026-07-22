# Map Builder Redesign — Implementation Plan

> **Based on:** `docs/map-builder-redesign-spec.md`
> **Status:** Ready to build
> **Strategy:** Step-by-step, each step produces a working increment

---

## How to read this plan

Each **step** is a self-contained unit that:
1. Lists exactly which files to touch
2. Shows the exact types/code to add or change
3. Produces a **working build** at the end
4. Can be tested independently with `vite build`

---

## STEP 1: Types & Constants Foundation

### Goal
Add all new types needed by the rest of the implementation without breaking anything.

### Files to modify

#### `src/components/map-builder/types.ts`

**Add these types:**

```typescript
// ── Multi-selection ────────────────────────────────────────────────
export type MultiSelection = CampusSelection[];

// ── Rubber-band state ──────────────────────────────────────────────
export interface RubberBand {
  sx: number; sy: number; // start (canvas coords)
  cx: number; cy: number; // current (canvas coords)
}

// ── Layer-specific tool descriptors ────────────────────────────────
export type LayerToolMap = Record<EditorLayer, SimpleTool[]>;

// ── Route (on Navigation layer) ────────────────────────────────────
export interface CampusRoute {
  id: string;
  name: string;
  description?: string;
  fromMarkerId: string;
  toMarkerId: string;
  waypoints: { x: number; y: number }[];
  type: "walking" | "accessible" | "emergency";
  distanceM: number;
  durationMin: number;
  isActive: boolean;
}

// ── Accessibility feature ──────────────────────────────────────────
export interface AccessibilityFeature {
  id: string;
  buildingId: string;
  type: "ramp" | "elevator" | "accessible_entrance" | "accessible_restroom" | "wide_corridor";
  label: string;
  status: "present" | "missing" | "under_maintenance";
  notes?: string;
}

// ── Event overlay ──────────────────────────────────────────────────
export interface CampusEventOverlay {
  id: string;
  title: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  organizer: string;
  markers: { x: number; y: number; color: string; label: string }[];
  restrictedAreas: { points: { x: number; y: number }[] }[];
  isActive: boolean;
  tempFeatures: string[];
}

// ── Extended Campus type (add routes, accessibility, events) ───────
// Extend the Campus interface with new collections:
//   routes?: CampusRoute[];
//   accessibilityFeatures?: AccessibilityFeature[];
//   eventOverlays?: CampusEventOverlay[];
```

**Modify the `Campus` interface:**

```typescript
export interface Campus {
  // ...existing fields...
  routes?: CampusRoute[];
  accessibilityFeatures?: AccessibilityFeature[];
  eventOverlays?: CampusEventOverlay[];
}
```

**Modify `CampusSelection` to support multi:**

```typescript
export type CampusSelection =
  | { type: "building"; id: string }
  | { type: "marker"; id: string }
  | { type: "path"; id: string }
  | { type: "route"; id: string }
  | { type: "multi"; ids: string[]; itemType: "building" | "marker" | "path" | "route" };
```

#### `src/components/map-builder/constants.ts`

**Add layer-specific tool definitions:**

```typescript
// ── Contextual tool palette per layer ──────────────────────────────
export interface LayerTool {
  id: SimpleTool | "waypoint" | "ramp" | "elevator_marker" | "accessible_entrance" | "exit_marker" | "assembly_area" | "fire_equipment" | "event_pin" | "restricted_area" | "info_booth" | "room";
  icon: React.ElementType;
  label: string;
  hint: string;
  key: string;
  layerOnly?: EditorLayer; // which layer this tool belongs to
}

export const LAYER_TOOLS: Record<EditorLayer, LayerTool[]> = {
  campus: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click to select · Drag empty space to pan · Shift+click to multi-select", key: "V", layerOnly: "campus" },
    { id: "marker",   icon: MapPin,        label: "Marker",   hint: "Click to place a location marker",                                              key: "M", layerOnly: "campus" },
    { id: "building", icon: Square,        label: "Building", hint: "Click & drag on the canvas to draw a building",                                 key: "B", layerOnly: "campus" },
    { id: "path",     icon: GitBranch,     label: "Path",     hint: "Click waypoints · Double-click to finish · Esc to cancel",                      key: "P", layerOnly: "campus" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click any item to remove it",                                                    key: "E", layerOnly: "campus" },
  ],
  navigation: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click a route or waypoint to edit",    key: "V", layerOnly: "navigation" },
    { id: "path",     icon: GitBranch,     label: "Route",    hint: "Click waypoints · Double-click to finish route", key: "P", layerOnly: "navigation" },
    { id: "waypoint", icon: MapPin,        label: "Waypoint", hint: "Click to place a navigation waypoint",  key: "W", layerOnly: "navigation" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click a route or waypoint to remove",  key: "E", layerOnly: "navigation" },
  ],
  accessibility: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select a building to edit accessibility features", key: "V", layerOnly: "accessibility" },
    { id: "ramp",     icon: Square,        label: "Ramp",     hint: "Click on a building to mark a wheelchair ramp",    key: "R", layerOnly: "accessibility" },
    { id: "elevator_marker", icon: MapPin, label: "Elevator", hint: "Click to place an elevator marker",                key: "E", layerOnly: "accessibility" },
    { id: "accessible_entrance", icon: MapPin, label: "Entrance", hint: "Click to mark an accessible entrance",         key: "A", layerOnly: "accessibility" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click a feature to remove",                       key: "X", layerOnly: "accessibility" },
  ],
  emergency: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select an emergency item",                   key: "V", layerOnly: "emergency" },
    { id: "exit_marker", icon: MapPin,     label: "Exit",     hint: "Click to place an emergency exit marker",    key: "X", layerOnly: "emergency" },
    { id: "assembly_area", icon: Square,   label: "Assembly", hint: "Click & drag to draw an assembly area",      key: "A", layerOnly: "emergency" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click an item to remove",                    key: "E", layerOnly: "emergency" },
  ],
  events: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select an event marker",                           key: "V", layerOnly: "events" },
    { id: "event_pin", icon: MapPin,       label: "Event Pin", hint: "Click to place an event marker",                  key: "P", layerOnly: "events" },
    { id: "restricted_area", icon: Square, label: "Restrict",  hint: "Click & drag to draw a restricted area overlay",  key: "R", layerOnly: "events" },
    { id: "erase",    icon: Trash2,        label: "Erase",     hint: "Click an event item to remove",                  key: "E", layerOnly: "events" },
  ],
};

// ── New tools for floor editor (quick access) ─────────────────────
export const FLOOR_QUICK_TYPES = ROOM_TYPES.map(rt => ({
  ...rt,
  icon: Square, // placeholder — use actual icons later
}));
```

**Also add to the index exports:**

```typescript
// src/components/map-builder/index.ts — add:
export { LAYER_TOOLS } from "./constants";
```

### Build check
```bash
npx vite build
```
Expected: 0 errors (new types aren't used yet, so no breakage)

---

## STEP 2: Extract HierarchyPanel Component

### Goal
Move the hierarchy tree from `CampusEditor.tsx` into its own file. This reduces `CampusEditor` complexity and makes it reusable.

### New file: `src/components/map-builder/HierarchyPanel.tsx`

```typescript
// HierarchyPanel — shows a searchable tree of buildings/markers/paths
// with visibility toggles, lock icons, drag-to-reorder, and context menus.

interface HierarchyPanelProps {
  campus: Campus;
  selected: CampusSelection | null;
  onSelect: (sel: CampusSelection | null) => void;
  onOpenFloor: (buildingId: string, floorId: string) => void;
  onAddBuilding: () => void;
  onUpdateBuilding: (id: string, changes: Partial<CampusBuilding>) => void;
  onUpdateCampus: (c: Partial<Campus>) => void;
  pushHistory: () => void;
  toast: { success: (msg: string, detail?: string) => void; error: (msg: string, detail?: string) => void; info: (msg: string) => void };
}

// Features:
// - Search input at top filters buildings by name/code
// - Section headers: Buildings, Markers, Paths (collapsible)
// - Each building shows: color dot, code, floor count, visibility eye, lock icon
// - Floors expand under building (same as current)
// - Drag-to-reorder buildings
// - "Add Building" button at bottom
// - Markers and Paths sections with counts
```

### Modified file: `src/components/map-builder/CampusEditor.tsx`

**Remove**:
- All hierarchy rendering code (the left panel section)
- The `dragOverIndex`, `dragItemRef` states
- The `renameFloor`, `duplicateFloor`, `deleteFloor` helpers (move to HierarchyPanel or keep as passed callbacks)

**Add**:
```typescript
import { HierarchyPanel } from "./HierarchyPanel";

// Replace the left panel div with:
<HierarchyPanel
  campus={campus}
  selected={selected}
  onSelect={setSelected}
  onOpenFloor={onOpenFloor}
  onAddBuilding={onAddBuilding}
  onUpdateBuilding={onUpdateBuilding}
  onUpdateCampus={upd}
  pushHistory={pushHistory}
  toast={toast}
/>
```

### Build check
```bash
npx vite build
```

---

## STEP 3: Multi-Select + Rubber-Band Selection

### Goal
Add full multi-select capability to the campus canvas.

### Modified file: `src/components/map-builder/CampusEditor.tsx`

**Add state:**
```typescript
const [multiSelected, setMultiSelected] = useState<string[]>([]); // array of IDs
const [rubberBand, setRubberBand] = useState<RubberBand | null>(null);
const [showAlignTools, setShowAlignTools] = useState(false);
```

**Modify `onItemDown`:**
- If `e.shiftKey` and tool is "select": toggle item in `multiSelected`, don't clear other selection
- If not shift: clear `multiSelected`, start single drag (existing)
- After multi-selecting, compute bounding box of all selected items

**Modify `handleSvgDown`:**
- If tool is "select" and clicking on empty background: start rubber-band
```typescript
if (tool === "select") {
  const pt = getPoint(e, campus.canvasW, campus.canvasH);
  setRubberBand({ sx: pt.x, sy: pt.y, cx: pt.x, cy: pt.y });
  // Don't clear selection yet — user might be shift+click
  if (!e.shiftKey) { setMultiSelected([]); setSelected(null); }
  return;
}
```

**Modify `handleSvgMove` to handle rubber-band:**
```typescript
if (rubberBand) {
  const pt = getPoint(e, campus.canvasW, campus.canvasH);
  setRubberBand({ ...rubberBand, cx: pt.x, cy: pt.y });
  // Compute which items fall within band, highlight them
  return;
}
```

**Modify `handleSvgUp` to finalize rubber-band:**
```typescript
if (rubberBand) {
  const rx = Math.min(rubberBand.sx, rubberBand.cx);
  const ry = Math.min(rubberBand.sy, rubberBand.cy);
  const rw = Math.abs(rubberBand.cx - rubberBand.sx);
  const rh = Math.abs(rubberBand.cy - rubberBand.sy);
  const captured: string[] = [];
  for (const b of buildings) {
    if (b.x >= rx && b.y >= ry && b.x + b.width <= rx + rw && b.y + b.height <= ry + rh) {
      captured.push(b.id);
    }
  }
  for (const m of markers) {
    if (m.x >= rx && m.y >= ry && m.x <= rx + rw && m.y <= ry + rh) {
      captured.push(m.id);
    }
  }
  setMultiSelected(captured);
  setRubberBand(null);
  if (captured.length > 0) setShowAlignTools(true);
  return;
}
```

**Add keyboard shortcut:**
```typescript
// In the keyboard handler:
if ((e.ctrlKey || e.metaKey) && e.key === "a") {
  e.preventDefault();
  // Select all buildings
  setMultiSelected(buildings.map(b => b.id));
  setShowAlignTools(true);
}
if (e.key === "Delete" || e.key === "Backspace") {
  if (multiSelected.length > 0) {
    // Batch delete
    pushHistory();
    updBuildings(buildings.filter(b => !multiSelected.includes(b.id)));
    updMarkers(markers.filter(m => !multiSelected.includes(m.id)));
    setMultiSelected([]);
    setShowAlignTools(false);
    return;
  }
}
```

**Add alignment toolbar** (floating bar that appears when multi-selected):
```typescript
// In the JSX, above or below the canvas:
{showAlignTools && multiSelected.length > 1 && (
  <motion.div ... className="absolute top-3 left-1/2 z-30 ...">
    {/* Align left / center / right / top / middle / bottom buttons */}
    {/* Distribute horizontal / vertical buttons */}
    {/* Group / Ungroup buttons */}
  </motion.div>
)}
```

### Modified file: `src/components/map-builder/Canvas.tsx`

**Add rubber-band rendering:**
```typescript
// Inside the SVG <g>, after buildings:
{rubberBand && (
  <rect
    x={Math.min(rubberBand.sx, rubberBand.cx)}
    y={Math.min(rubberBand.sy, rubberBand.cy)}
    width={Math.abs(rubberBand.cx - rubberBand.sx)}
    height={Math.abs(rubberBand.cy - rubberBand.sy)}
    fill="rgba(14,42,110,0.06)"
    stroke="var(--primary)"
    strokeWidth={1.5}
    strokeDasharray="6 4"
    rx={2}
  />
)}
```

**Add multi-selection highlight on buildings:**
```typescript
// Inside building rendering, check if building ID is in multiSelected:
const isMultiSel = multiSelected.includes(b.id);
// If multi-selected, show a subtle blue overlay:
{isMultiSel && !isSel && (
  <rect x={b.x-4} y={b.y-4} width={b.width+8} height={b.height+8} rx={8}
    fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
)}
```

**Update CanvasProps to pass multiSelected and rubberBand:**
```typescript
interface CanvasProps {
  // ...existing props...
  multiSelected?: string[];
  rubberBand?: RubberBand | null;
}
```

### Build check
```bash
npx vite build
```

---

## STEP 4: Contextual Tool Palette

### Goal
The tool palette changes to show only relevant tools for the active layer.

### Modified file: `src/components/map-builder/CampusEditor.tsx`

**Replace the hardcoded TOOLS with LAYER_TOOLS[layer]:**
```typescript
import { LAYER_TOOLS } from "./constants";

// In the component:
const activeTools = LAYER_TOOLS[layer];
```

**Pass `activeTools` to Canvas instead of `tool` and `onSetTool`:**
```typescript
<Canvas
  // ...existing props...
  activeTools={activeTools}
  tool={tool}
  onSetTool={setTool}
  layer={layer}
/>
```

### Modified file: `src/components/map-builder/Canvas.tsx`

**Replace the static tool palette with dynamic one:**
```typescript
// Instead of TOOLS.map(...), use:
{activeTools.map((t, i) => (
  // ... same tool button rendering ...
  // Use t.icon, t.label, t.key, t.hint
))}
```

**Update the status bar hint:**
```typescript
// Replace:
const hint = TOOLS.find((t) => t.id === tool)?.hint ?? "";
// With:
const hint = activeTools.find((t) => t.id === tool)?.hint ?? "";
```

### Build check
```bash
npx vite build
```

---

## STEP 5: Contextual Properties Panel

### Goal
Properties Panel shows different fields depending on:
- What's selected (building vs marker vs path vs route)
- Which layer is active

### Modified file: `src/components/map-builder/PropertiesPanel.tsx`

**Add layer prop and route/accessibility content:**

```typescript
interface PropertiesPanelProps {
  // ...existing props...
  layer?: EditorLayer;
  selRoute?: CampusRoute;
  onUpdateRoute?: (id: string, changes: Partial<CampusRoute>) => void;
  selAccessFeature?: AccessibilityFeature;
  onUpdateAccessFeature?: (id: string, changes: Partial<AccessibilityFeature>) => void;
}
```

**Add conditional rendering by layer:**

```typescript
// Inside the content div, after building and marker sections:

{/* ── ROUTE PROPERTIES (Navigation layer) ── */}
{layer === "navigation" && selRoute && (
  <>
    <SectionTitle icon={Route} label="Route Info" />
    <Field label="Name"><input value={selRoute.name} /></Field>
    <Field label="Type">
      <select value={selRoute.type} onChange={...}>
        <option>walking</option>
        <option>accessible</option>
        <option>emergency</option>
      </select>
    </Field>
    <Field label="Distance">{selRoute.distanceM}m (auto)</Field>
    <Field label="Duration">{selRoute.durationMin} min (auto)</Field>
    <Divider />
    <button onClick={...}>Delete Route</button>
  </>
)}

{/* ── ACCESSIBILITY PROPERTIES (Accessibility layer) ── */}
{layer === "accessibility" && selected?.type === "building" && (
  <>
    <SectionTitle icon={Accessibility} label="Accessibility" />
    {/* Checklist of features with toggles */}
    {FEATURE_ITEMS.map(f => (
      <ToggleRow key={f.key} label={f.label} checked={...} onChange={...} />
    ))}
    <TextArea label="Notes" value={...} />
  </>
)}

{/* ── EVENT PROPERTIES (Events layer) ── */}
{layer === "events" && selected?.type === "marker" && (
  <>
    <SectionTitle icon={Star} label="Event Marker" />
    <Field label="Title"><input value={...} /></Field>
    <Field label="Date Range">...</Field>
    <Field label="Organizer">...</Field>
  </>
)}
```

### Build check
```bash
npx vite build
```

---

## STEP 6: Navigation Routes Panel (NEW)

### Goal
When Navigation layer is active, show a routes list panel on the right side of the hierarchy area.

### New file: `src/components/map-builder/RoutesPanel.tsx`

```typescript
// Displays a list of all routes on the campus
// Each route shows: name, type badge (color), from→to, distance, status toggle
// Click to select on canvas
// "Add Route" button starts route drawing mode
// Properties for selected route show in PropertiesPanel
```

### Modified file: `src/components/map-builder/CampusEditor.tsx`

- Track routes in campus state (part of `Campus.routes[]`)
- When on Navigation layer, hierarchy panel can show a Routes section
- When path tool draws on Navigation layer, it creates a route instead of a path
- Route properties panel shows route-specific fields

---

## STEP 7: Quick Start Wizard + Cheat Sheet + Enhanced Publish

### New file: `src/components/map-builder/QuickStartWizard.tsx`

```typescript
// Full-screen overlay that:
// 1. Welcomes the user with "Let's create your first campus"
// 2. Offers two options: "Start from template" or "Start from scratch"
// 3. "Start from template" clones SEED_CAMPUSES[0] with a dialog to rename
// 4. "Start from scratch" opens the existing CampusWizard
// 5. Includes a brief tutorial overlay explaining drag-to-create buildings
// 6. Triggers on first visit (localStorage flag)
```

### New file: `src/components/map-builder/ShortcutCheatSheet.tsx`

```typescript
// Modal overlay triggered by pressing "?"
// Shows all keyboard shortcuts grouped by category:
// - Tools: V/B/M/P/E
// - Navigation: Arrows, +/-, 0, 1-5
// - Editing: Ctrl+Z/Y/S/D/A/G, Delete
// - Selection: Shift+click, Ctrl+A
// Shows dismiss button and "Press Escape to close"
```

### Modified file: `src/components/map-builder/PublishDialog.tsx`

**Add scheduling UI:**
```typescript
// After the validation section, add:
{/* Schedule publishing */}
<div>
  <h3>Schedule</h3>
  <div className="flex gap-2">
    <button onClick={() => setScheduleMode("now")}>Publish Now</button>
    <button onClick={() => setScheduleMode("later")}>Schedule</button>
  </div>
  {scheduleMode === "later" && (
    <input type="datetime-local" value={scheduleDate} onChange={...} />
  )}
</div>

{/* Visual diff */}
<div>
  <h3>Changes</h3>
  <div className="grid grid-cols-2 gap-2">
    <div>
      <p>Current Live Version</p>
      <MiniMap campus={currentLiveCampus} />
    </div>
    <div>
      <p>New Version</p>
      <MiniMap campus={campus} />
    </div>
  </div>
</div>

{/* Staging preview */}
<button onClick={generatePreviewUrl}>Generate Preview Link</button>
{previewUrl && <p>Share this link: <code>{previewUrl}</code></p>}
```

### Build check
```bash
npx vite build
```

---

## Implementation Order — Summary

| Step | What | Files | Complexity | Build Safe? |
|------|------|-------|-----------|-------------|
| 1 | Types & Constants | `types.ts`, `constants.ts` | Low | ✅ Yes |
| 2 | Extract HierarchyPanel | NEW `HierarchyPanel.tsx`, modify `CampusEditor.tsx` | Medium | ✅ Yes |
| 3 | Multi-Select + Rubber-Band | `CampusEditor.tsx`, `Canvas.tsx` | High | ⚠️ Test builds carefully |
| 4 | Contextual Tools | `CampusEditor.tsx`, `Canvas.tsx` | Low | ✅ Yes |
| 5 | Contextual Properties | `PropertiesPanel.tsx` | Medium | ✅ Yes |
| 6 | Routes Panel | NEW `RoutesPanel.tsx` | High | ✅ New file |
| 7 | QuickStart + CheatSheet + Publish | 3 files | Medium | ✅ New files |

**After each step:** Run `npx vite build` to verify no breakage.

---

## Key Design Decisions (from the spec interview)

1. **Hybrid layers + contextual tools** — layer bar stays, tool palette changes per layer
2. **Full multi-select** — shift+click, rubber-band box, Ctrl+A, batch operations
3. **Routes inside Map Builder** — Navigation layer handles route drawing
4. **Accessibility inside Map Builder** — Accessibility layer with per-building checklist
5. **Events inside Map Builder** — Events layer with temporary overlays
6. **Floor inline preview** — mini panel on campus canvas, "Full Edit" opens FloorEditor
7. **Enhanced publish** — validation + visual diff + scheduling + staging link
8. **Shortcut cheat sheet** — press "?" to overlay

---

## How to Execute

Option A: **Manual step-by-step** — implement Steps 1→2→3→4→5→6→7 in order, building each time

Option B: **Parallel tracks** — implement Steps 1 (types) + 2 (HierarchyPanel) together, then 3+4 together, then 5+6+7 together

**Recommended:** Start with Step 1 (pure types, zero breakage), then Step 2 (extraction, no new logic), then step 3 (the big one — multi-select)

# Map Builder → Leaflet Port Guide

> **Who this is for:** an AI coding assistant (or developer) rebuilding the PLV NaviSync Map Builder inside **another system** that already has a **Leaflet map with real-time user location**.
>
> **Source system:** PLV NaviSync (React + TypeScript + Vite + Supabase). Every file path below points into this repository so it can be read as the reference implementation.
>
> **Goal:** Reproduce the same admin Map Builder (assets, pathways, connections, navigation graph, floors, designs, validation and publishing). The admin's campus drawing must sit **on top of the Leaflet map**, aligned to real-world coordinates, so a student's live GPS dot lands on the right building and path and can be routed from where they are standing.

---

## 0. Copy-paste prompt for the AI

```text
You are porting the PLV NaviSync Map Builder into this project.

Hard rules:
1. DO NOT modify the existing Leaflet map setup or the existing real-time / live-location code
   (watchPosition, location marker, accuracy circle, location store, sockets, etc.).
   Treat it as a read-only input that gives you { lat, lng, accuracy, heading? } updates.
2. The Map Builder stores all geometry in a local planar "canvas unit" space exactly like
   the source system (see §3). Do not rewrite the algorithms to work in lat/lng.
3. A single georeference transform (§4) converts canvas units <-> lat/lng. Use it for
   both rendering on Leaflet and for converting the user's live location into canvas
   space before routing.
4. Re-implement the data model (§5), asset catalogs (§6), authoring tools (§7),
   object-to-graph processing (§8), routing (§9), and validation/publishing (§10)
   with the same behaviour as the reference files.
5. The admin's drawing is rendered as a Leaflet overlay pane ABOVE the base tiles and
   BELOW the live-location marker (§11.2).

Follow the build order in §13 and confirm each acceptance check in §14.
```

---

## 1. What the Map Builder is

The Map Builder is an admin-only editor where a campus admin draws a campus and its buildings, then publishes it to students. A student then:

- browses the campus map (buildings, landmarks, gates, outdoor decor),
- opens a building and walks through its floors (rooms, doors, stairs, elevators),
- asks for a route to a building, room or place, in **Standard**, **Accessible** or **Emergency** mode.

The admin never draws "routes" by hand. They draw **physical things** (buildings, pathways, entrances, doors, stairs and so on). The builder then **derives a navigation graph** (nodes and edges) from those things, and the student router runs A* over that graph.

```
Admin draws physical objects  ──►  Reconcilers derive nav graph  ──►  Validate  ──►  Save draft
                                                                                         │
Student map  ◄──  Router (A*) over published graph  ◄──  Published snapshot  ◄──  Publish
```

Main reference files:

| Concern | File |
|---|---|
| Data model (all types) | `src/components/map-builder/types.ts` |
| Asset catalogs, tools, layers, sizes | `src/components/map-builder/constants.ts`, `src/components/canvas/canvasAssetCatalog.ts` |
| Campus (outdoor) editor | `src/components/map-builder/CampusEditor.tsx`, `Canvas.tsx`, `useCanvasControls.ts` |
| Floor (indoor) editor | `src/components/map-builder/FloorEditor.tsx`, `FloorPropertiesPanel.tsx`, `FloorNavPropertiesPanel.tsx` |
| Campus creation wizard | `src/components/map-builder/CampusWizard.tsx`, `CanvasSetupWizard.tsx` |
| Outdoor graph helpers | `src/lib/navigationGraph.ts` |
| Pathway → graph generation | `src/lib/campusPathNavigation.ts`, `src/lib/campusPathNetwork.ts` |
| Building entrances | `src/lib/buildingEntrances.ts`, `src/lib/entranceTransitions.ts` |
| Campus gates | `src/lib/campusGates.ts` |
| Indoor graph | `src/lib/indoorNavigationGraph.ts`, `src/lib/indoorPathfinding.ts` |
| Exterior verandas, steps and ramps | `src/lib/exteriorApproachNavigation.ts`, `src/lib/exteriorFloorZones.ts` |
| Routing engine (A*) | `src/lib/pathfinding.ts` (`prepareNavigationGraph`, `findNavigationRoute`) |
| Student route planner | `src/lib/routePlanner.ts`, `src/lib/combinedPathfinding.ts`, `src/lib/routineNavigationGraph.ts` |
| GPS → canvas helpers | `src/lib/geo.ts` |
| Validation | `src/lib/validateNavigationGraph.ts`, `src/lib/liveValidation.ts`, `src/lib/campusPublication.ts` |
| Persistence | `src/services/campusStructureService.ts`, `src/services/campusService.ts`, `src/lib/campusDraftPersistence.ts` |
| Read-only student rendering | `src/components/map-builder/ReadonlyOutdoorVisuals.tsx`, `ReadonlyFloorPlanVisuals.tsx`, `src/pages/CampusMapPage.tsx` |

---

## 2. What must not change in the target system

The target system already has:

- a Leaflet `L.Map` instance with base tiles (OSM, satellite or similar),
- a real-time location pipeline: browser geolocation and/or a server or socket stream, a user marker, an accuracy circle, and possibly heading and "follow me" behaviour.

**Leave all of that as it is.** The port only:

1. **reads** the live position: subscribe to the existing store, event or callback, and never create a second `watchPosition`,
2. **adds** new Leaflet panes and layers for the campus drawing and the route line,
3. **adds** the admin Map Builder screens.

If the live location code exposes no hook, add a minimal read-only adapter, such as an event emitter or store selector, at the boundary. Do not refactor the existing implementation.

---

## 3. Coordinate system used by the builder (keep it)

Everything authored in the builder lives in **planar canvas units**, not lat/lng.

- **Campus canvas:** `campus.canvasW × campus.canvasH`. Preset sizes are 600×450, **900×680 (recommended)** and 1200×900, plus custom sizes from 100 to 5000 (`CANVAS_SIZES` in `constants.ts`). The origin is the top-left corner, **+x points east (right)** and **+y points south (down)**, the same as SVG.
- **Grid:** `gridSize` of 10, 20, 40 or 80, with optional `snapToGrid`.
- **Scale:** `M_PER_UNIT = 0.22` metres per canvas unit (`src/lib/geo.ts`, `src/lib/pathfinding.ts`). All route distances are `round(units × 0.22)` metres. Floors can override this with `FloorPlan.calibration.metersPerUnit`.
- **Buildings** use a **top-left origin** `(x, y, width, height)` plus `rotation` in degrees around their centre.
- **Decor assets and markers** use a **centre origin** `(x, y)` plus `rotation` and `scale`.
- **Floors** have their own canvas (`floor.canvasW × floor.canvasH`, default 600×450). The floor canvas is **stretched onto the building footprint** and then rotated with the building:

```ts
// src/lib/exteriorApproachNavigation.ts — exteriorFloorPointToCampusWorld
local.x = building.x + (p.x / floorW) * building.width
local.y = building.y + (p.y / floorH) * building.height
// then rotate `local` around the building centre by building.rotation
```

**Why keep canvas units?** Every snapping, junction, wall-clearance, entrance-offset and A* rule in the source system is written in this space. Porting the whole thing to lat/lng would mean rewriting thousands of lines and introducing projection errors. Keep the model planar and project only at the edges, for rendering and for GPS input.

---

## 4. Georeferencing: placing the drawing on the Leaflet map

This is the only genuinely **new** concept the port adds.

### 4.1 Stored georeference

Add a `georef` object to the campus record:

```ts
interface CampusGeoreference {
  /** Real-world position of the canvas CENTRE (the source system already stores
   *  this as campus.coordinates {lat,lng} from the wizard's MapPicker). */
  anchor: { lat: number; lng: number };
  /** Metres per canvas unit. Default 0.22. */
  metersPerUnit: number;
  /** Clockwise rotation of the canvas relative to true north, in degrees.
   *  0 = canvas "up" is north. */
  bearingDeg: number;
}
```

The source system already has `campus.coordinates` and a non-rotating version of the transform in `src/lib/geo.ts → latLngToMapPoint`. The port generalises it with a rotation and an inverse.

### 4.2 Transforms (local tangent plane, accurate to centimetres at campus scale)

```ts
const M_PER_DEG_LAT = 111_320;

export function canvasToLatLng(p: {x:number;y:number}, campus: Campus): L.LatLng {
  const g = campus.georef;
  const cx = campus.canvasW / 2, cy = campus.canvasH / 2;
  // canvas → metres (east, north), before rotation
  let e = (p.x - cx) * g.metersPerUnit;
  let n = -(p.y - cy) * g.metersPerUnit;           // SVG y grows south
  // rotate by bearing (clockwise)
  const r = (g.bearingDeg * Math.PI) / 180;
  const e2 = e * Math.cos(r) + n * Math.sin(r);
  const n2 = -e * Math.sin(r) + n * Math.cos(r);
  const lat = g.anchor.lat + n2 / M_PER_DEG_LAT;
  const lng = g.anchor.lng + e2 / (M_PER_DEG_LAT * Math.cos((g.anchor.lat * Math.PI) / 180));
  return L.latLng(lat, lng);
}

export function latLngToCanvas(ll: {lat:number;lng:number}, campus: Campus) {
  const g = campus.georef;
  const n2 = (ll.lat - g.anchor.lat) * M_PER_DEG_LAT;
  const e2 = (ll.lng - g.anchor.lng) * M_PER_DEG_LAT * Math.cos((g.anchor.lat * Math.PI) / 180);
  const r = (g.bearingDeg * Math.PI) / 180;
  const e = e2 * Math.cos(r) - n2 * Math.sin(r);
  const n = e2 * Math.sin(r) + n2 * Math.cos(r);
  return {
    x: campus.canvasW / 2 + e / g.metersPerUnit,
    y: campus.canvasH / 2 - n / g.metersPerUnit,
  };
}
```

Unit-test that `latLngToCanvas(canvasToLatLng(p)) ≈ p` within 0.01 units for random points and bearings.

### 4.3 Admin alignment tool (new screen in the Campus Editor)

The admin aligns the drawing to the real map once, and can adjust it later:

1. Show the Leaflet base map with the campus drawing at about 50% opacity.
2. **Drag** the overlay to move `anchor`, use a **rotate handle** to change `bearingDeg`, and use a **scale handle** or a "two-point calibration" to change `metersPerUnit`. For two-point calibration, the admin clicks two canvas points and then the same two places on the map. Solve for scale and bearing from the vector between the points, and for the anchor from the midpoint.
3. Save `georef` with the campus, as part of the same structure save as everything else.

**Do not** move the authored objects when the georeference changes. Only the transform changes.

---

## 5. Data model (re-create these types exactly)

Full definitions are in `src/components/map-builder/types.ts`. This is the essential shape:

```
Campus
├─ id, name, code, description, address, city, province, postalCode
├─ coordinates {lat,lng}          ← becomes georef.anchor
├─ canvasW, canvasH, gridSize, snapToGrid, measurementUnit
├─ canvasGroundMaterial/Color/Texture   (neutral|grass|concrete|pavers|asphalt|custom)
├─ status (active|hidden|archived), publishStatus (draft|published), visibleToStudents
├─ features {indoorNavigation, accessibilityNavigation, emergencyRoutes, issueReporting}
├─ buildings: CampusBuilding[]
│    ├─ id, name, code, category, description, buildingType, facilities[], operatingHoursSchedule
│    ├─ x, y, width, height, rotation, color, opacity, visible, locked, zOrder
│    ├─ entrances: CampusEntrance[]  {id, edge: top|right|bottom|left, offset 0..1,
│    │                                  type: general|service|emergency_exit,
│    │                                  direction: both|entrance_only|exit_only,
│    │                                  isPrimary, accessible, name}
│    ├─ exteriorEmergencyStairs[]
│    └─ floors: FloorPlan[]
│         ├─ id, number, label, canvasW, canvasH, gridSize, appearance, calibration
│         ├─ rooms[]      {id,name,type,x,y,w,h,rotation,shapePoints?,accessDoorIds?}
│         ├─ walls[]      {id,x1,y1,x2,y2,thickness,color,managedKind?:"perimeter"}
│         ├─ doors[]      {id,x,y,width,wallId,offset,doorType,hinge,openingType,
│         │                isEmergencyExit, buildingEntranceId?, accessDirection}
│         ├─ windows[], furniture[], labels[]
│         ├─ stairs[]     {id,x,y,w,h,direction,floors[],sharedId,accessible,emergencySafe}
│         ├─ elevators[]  {id,...,floors[],sharedId,accessible}
│         ├─ ramps[]      {id,...,sharedId,slope,accessible}
│         ├─ exteriorZones[] (veranda|entrance_landing|covered_walkway|exterior_platform)
│         ├─ entranceSteps[], entranceRamps[]
│         └─ paths[]
├─ markers: CampusMarker[]   (landmarks AND campus gates: type "gate", purpose general|emergency_exit, navNodeId)
├─ paths: CampusPath[]       {id, points[], navigationVertexIds[], type walkway|road|accessible,
│                              width, color, pathNetworkId, disconnectedJunctionKeys[], visualAttachments[]}
├─ decorAssets: CampusDecorAsset[]  {id,type,x,y,width?,height?,rotation,scale,groundType?,surfaceCells?}
├─ navNodes: NavigationNode[]
├─ navEdges: NavigationEdge[]
├─ assemblyPoints[], accessibilityFeatures[], eventOverlays[]
└─ createdAt, updatedAt, publishedAt, databaseUpdatedAt (optimistic concurrency)
```

### NavigationNode (one array for the whole campus)

```ts
{ id, name, type, x, y,             // type: outdoor|entrance|hallway|room_access|stair|elevator|
                                    //       ramp|transition|emergency_exit|assembly|safe_area
  campusId?, buildingId?, floorId?, // floorId absent ⇒ OUTDOOR graph; present ⇒ that floor's INDOOR graph
  entranceId?, buildingEntranceId?, gateId?,
  roomId?, doorId?, stairId?, elevatorId?, rampId?, exteriorEmergencyStairId?,
  transitionSharedId?,              // same physical stair/elevator across floors
  generatedFromPathVertices?: {pathId, vertexId}[],   // provenance: created by a pathway
  derivedOwnerType?/derivedOwnerId?/derivedRole?,     // provenance: created by veranda/steps/ramp
  accessible, emergencySafe?, emergencyStair?, inaccessibleReason?, color }
```

### NavigationEdge

```ts
{ id, startNodeId, endNodeId,
  distance,                 // canvas units, auto-computed (polyline length if bendPoints)
  bidirectional, accessible, emergencySafe?, closed?,
  bendPoints?: {x,y}[],     // geometry only, never routing nodes
  type,                     // "walkway", "entrance_transition", "room_door_transition", "exterior_approach", ...
  generatedFromPathIds?, derivedOwnerType?, derivedOwnerId?, ... }
```

**Key principle:** there is **one canonical graph** (`campus.navNodes` and `campus.navEdges`). Indoor and outdoor are separated only by `floorId` (see `outdoorNavNodes` in `navigationGraph.ts` and `indoorNavNodes` in `indoorNavigationGraph.ts`). Every generated node or edge records **who owns it** (provenance), so deleting an object removes exactly its own topology and nothing nearby.

---

## 6. Assets and design catalogs (port all of them)

All of these live in `src/components/map-builder/constants.ts`. Each one is drawn as **inline SVG path data** in the object's local box. Copy the `parts` arrays verbatim so the visuals match.

| Catalog | Constant | Contents |
|---|---|---|
| Building presets | `BUILDING_TYPES` | academic, laboratory, library, gym, admin, other (colour, icon, default width and height) |
| Building categories | `BUILDING_CATEGORIES` | Academic, Administrative, Library, Laboratory, Sports, Dormitory, Medical, Canteen, Security, Other |
| Outdoor decor | `DECOR_ASSET_TYPES`, `DECOR_CATEGORIES`, `DECOR_PALETTE_TYPES` | **Areas:** lawn, garden, plaza, parking-lot, ground-area · **Greenery:** tree, tree-large, palm, bush, plant, flower · **Seating:** bench, bench-long, picnic-table · **Wayfinding:** sign, directory-board, flag · **Security:** gate-scanner · **Utilities:** trash-bin, recycle-bin, lamp-post, bollard, bike-rack · **Features:** guard-booth, philippine-flag, monument, fountain, gazebo |
| Ground surfaces | `CAMPUS_SURFACE_MATERIALS`, `CAMPUS_GROUND_DEFAULTS` (`src/lib/campusCanvas.ts`) | grass, planted, plaza, parking, field; tile-painted via `surfaceCells` |
| Room types | `ROOM_TYPES` | classroom, lab, office, restroom, elevator, stairs, hallway, lobby, emergency, storage (fill, stroke and text colours) |
| Indoor furniture | `FURNITURE_CATEGORIES` | About 85 items: seating, tables and desks, teaching, storage, tech, service counters, restroom fixtures, safety (extinguisher, exit sign, emergency light), misc |
| Walls | `WALL_COLORS`, `WALL_THICKNESSES` | |
| Path colours | `PATH_COLORS` | footpath, road, route, emergency |
| Layers | `LAYERS` | campus (primary colour), navigation (`#16a34a`), events (`#d97706`) |
| Tools per layer | `LAYER_TOOLS`, `FLOOR_STRUCTURE_TOOLS`, `FLOOR_INTERIOR_TOOLS` | see §7 |

Rendering components to port: `DecorAssetVisual.tsx`, `CampusGateVisual.tsx`, `FloorFurnitureSymbol.tsx`, `CampusGroundSurface.tsx`, `CampusGroundPatternDefs.tsx`, `OutdoorPathNetworkVisuals.tsx`, `FloorMapVisuals.tsx`, `FloorExteriorVisuals.tsx`, `ReadonlyOutdoorVisuals.tsx`, `ReadonlyFloorPlanVisuals.tsx`.

---

## 7. Admin authoring workflow (how the builder takes the admin's input)

### 7.1 Campus creation wizard (`CampusWizard.tsx`, `CanvasSetupWizard.tsx`)

1. Basic info: name, code, address, city, province and postal code.
2. **Location:** pick lat/lng on a map (`src/components/ui/MapPicker.tsx`, which already uses `navigator.geolocation.getCurrentPosition` for "use my location"). **In the target system, use the existing Leaflet map for this step.** The result seeds `georef.anchor`.
3. Canvas size (Small, Medium or Large preset, or Custom), grid size and snapping.
4. Ground material and colour.
5. Features toggles. This creates a **draft** campus.

### 7.2 Campus Editor: outdoor (`CampusEditor.tsx`, `Canvas.tsx`)

Layer bar: **Campus | Navigation | Events**. The tool palette changes with the layer.

| Layer | Tools | What the admin does |
|---|---|---|
| Campus | Select (V), Pan (Space), Building (B, click-drag a footprint), Pathway (P, drag a segment; ending near another path creates a junction), Gate, Decor (place from palette), Marker (landmark), Erase (E) | Place buildings, add entrances on building edges, draw walkways and roads, place gates, decor, areas and surfaces |
| Navigation | Select, Pan, Walking Point (M), Connect (P), Remove (E) | Add manual waypoints and connections where pathways are not enough. Set **accessible**, **emergencySafe** and **closed** flags on nodes and edges |
| Events | Select, Add Event pin, Restrict Area, Remove | Event overlays (separate from campus structure) |

Common editor behaviour to reproduce:

- Multi-select with Shift-click and rubber-band selection, group move (`campusGroupMove.ts`), align and distribute, copy and paste (`outdoorClipboard.ts`), undo and redo (`hooks/useUndoRedo.ts`).
- Grid snapping, alignment guides (`navigationAlignmentIndex.ts`, `editorPlacement.ts`) and overlap checks for rotated boxes (`getRotatedAABB`).
- Hierarchy panel (`HierarchyPanel.tsx`) and Properties panel (`PropertiesPanel.tsx`).
- Context menu, keyboard shortcuts (`ShortcutCheatSheet.tsx`) and the "Fit canvas to content" action (`fitCampusCanvas`).
- **Entrances:** dragging along a building edge produces `{edge, offset 0..1}` (`pointerToEntranceAttachment`). World position comes from `entranceWorldPosition` (edge point, then rotated around the building centre; the outward angle is used for the arrow).

### 7.3 Floor Editor: indoor (`FloorEditor.tsx`)

Modes: **Structure | Interior | Navigation**.

- **Structure:** walls (perimeter walls are managed automatically from the floor shape and extensions), doors and open passages snapped onto walls (`wallId` and `offset`), windows, stairs, elevators, ramps, exterior zones (veranda and similar), entrance steps and entrance ramps. Optional background image with calibration.
- **Interior:** rooms (rectangle or `shapePoints` polygon), furniture and labels. Templates come from `floorTemplates.ts` and `roomTemplates.ts`.
- **Navigation:** indoor waypoints, linking rooms to doors ("Link Location"), and corridor edges with orthogonal `bendPoints`. Edges that cross a wall without a door are rejected (`edgeCrossesWallWithoutDoor`, `WALL_ROUTE_CLEARANCE = 6`).
- Stairs and elevators on different floors that share a `sharedId` represent the same physical shaft. Their nodes get the same `transitionSharedId`.
- A **door** on the entry floor can be linked to a **building entrance** (`buildingEntranceId`).

### 7.4 Test route panel (`TestNavigationPanel.tsx`)

The admin can pick an origin and a destination and run the same router students use, in all three modes, before publishing.

---

## 8. Processing pipeline: how drawings become a navigation graph

After **every** edit, the editor runs **reconcilers**. These are pure functions of the form `Campus → Campus` that regenerate the derived topology from the physical objects. Port them as pure functions with unit tests; the source repo has extensive tests under `src/lib/__tests__`.

### 8.1 Pathways → outdoor nodes and edges (`campusPathNavigation.ts → reconcilePathwayNavigation`)

- Each `CampusPath` vertex has a stable ID in `path.navigationVertexIds[i]`.
- For each vertex, find or create **one outdoor node** whose `generatedFromPathVertices` contains `{pathId, vertexId}`. The node's `x` and `y` always follow the vertex.
- **Junctions:** vertices of different pathways at the **exact same coordinate** share one generated node, which then has several provenance refs. Proximity matching is never used to claim manual, entrance or gate nodes. A junction can be disabled with `disconnectedJunctionKeys`.
- Consecutive vertices are joined by an edge (`generatedFromPathIds: [pathId]`, `distance = segment length`, `accessible` defaults from path type, `bidirectional: true`).
- If a pathway is moved or reshaped, its nodes move in place. A shared junction splits only when its owners actually diverge.
- If a pathway is deleted, `cleanupDeletedPathwayNavigation` removes only the nodes and edges it owned.
- `convertPathwaysToNavigation` is a one-time upgrade for legacy paths.

### 8.2 Building entrances → entrance nodes (`navigationGraph.ts`, `buildingEntrances.ts`)

- Each `CampusEntrance` gets one outdoor node with `type: "entrance"`, `buildingId` and `entranceId`. Its position is always `entranceWorldPosition(building, entrance)` (`syncEntranceNodePositions`). Orphans are pruned (`pruneOrphanedEntranceNodes`).
- `reconcileEntranceOutdoorConnections` joins each entrance node to the outdoor network: its pathway handoff, or a nearest-vertex connector made at authoring time.

### 8.3 Entrance ↔ indoor door (`entranceTransitions.ts → reconcileEntranceTransitions`, `reconcileEntranceDoors`)

- Exactly **one** `entrance_transition` edge per entrance, from the outdoor entrance node to the indoor door node on the **entry floor** (`entryFloorForBuilding`).
- The edge direction follows `entrance.direction`:
  - `both` gives a bidirectional edge,
  - `entrance_only` gives entrance → door,
  - `exit_only` gives door → entrance.
- `accessible = entrance.accessible !== false`.
- Moving an entrance moves its linked door along the perimeter wall, and moving the door updates the entrance (`syncEntrancesFromFloorDoors`).

### 8.4 Campus gates (`campusGates.ts → syncCampusGateNavigation`)

A gate is a `CampusMarker` with `type: "gate"` and a `purpose` of `general` or `emergency_exit`. It owns one routable node (`gateId`, `marker.navNodeId`). Gates may sit on the canvas perimeter.

### 8.5 Indoor linked nodes (`indoorNavigationGraph.ts`)

- Nodes linked to a room, door, stair, elevator or ramp take their position from the physical object (`resolveIndoorLinkedPosition`, `syncIndoorLinkedNodePositions`). Orphans are pruned.
- Room ↔ door edges: `reconcileRoomDoorEdges` creates `room_door_transition` edges.
- Corridors are authored edges with orthogonal `bendPoints` (`orthogonalBendsFor`). `navEdgeIsBlocked` and `navEdgeIsBlockedExtended` reject wall crossings and blocking furniture.
- Between floors, nodes with the same `transitionSharedId` are connected by derived transition edges at routing time (`buildTransitionEdges` in `pathfinding.ts`).

### 8.6 Exterior approach (`exteriorApproachNavigation.ts → reconcileExteriorApproachNavigation`)

A veranda, entrance steps or entrance ramp generates its own outer, inner and zone nodes and edges, with `derivedOwnerType` and `derivedOwnerId`, and uses stable seeded UUIDs (`stableExteriorApproachUuid`). Steps are never accessible; ramps are. A non-walkable zone temporarily suspends authored edges and records the original values so they can be restored.

### 8.7 Exterior emergency stairs (`exteriorEmergencyStairs.ts`)

These are owned by the building. They appear on every floor they serve, are emergency-only, and are filtered out of routine routes (`routineNavigationGraph.ts`).

### 8.8 Normalisation

`normalizeNavGraph` removes self edges and duplicate edges, and recomputes `distance` from the geometry, including bend points.

**Order to run after an edit** (mirror the source editor): pathway reconcile → entrance node sync and outdoor connections → gate sync → entrance doors and entrance transitions → indoor linked node sync and room-door edges → exterior approach → normalise.

---

## 9. Routing (student side)

### 9.1 Engine: `src/lib/pathfinding.ts`

- `prepareNavigationGraph(nodes, edges)` builds the adjacency lists and classifies transition edges as stair, elevator or ramp, and whether they cross floors.
- `findNavigationRoute(nodes, edges, from, to, accessibleOnly, emergencySafeOnly, options)` runs **A\***:
  - `g` is the edge distance plus a **transition penalty**. A non-preferred stair or elevator costs +1,000,000, and a ramp when stairs are preferred costs +100,000. The user's preference can be best, stairs or elevator.
  - `h` is the Euclidean distance multiplied by `heuristicScale`, which is at most 1 so the heuristic stays admissible.
  - **Accessible mode** skips edges where `accessible === false`, stair nodes, and nodes where `accessible === false`.
  - **Emergency mode** skips edges where `emergencySafe === false`, elevators, and floor changes that are not stairs.
  - Closed edges are excluded when the graph is loaded.
- The output (`GraphPath`) contains the node IDs, the waypoints (including bend points), `distanceM = round(units × 0.22)` and the walking time.

### 9.2 Planner: `src/lib/routePlanner.ts`

- `planRouteFromPoint(fromPt, building, mode, graph)` is the **"You are here" entry point**. It:
  1. snaps `fromPt` to the **nearest outdoor node** (`!node.floorId`, and accessible-only in accessible mode),
  2. resolves every direction-eligible entrance node of the destination building (`resolveBuildingEntranceNodes`, inbound),
  3. runs A* to each entrance and keeps the shortest result,
  4. builds turn-by-turn steps (`authoredRouteGuidanceSteps`).
- `planPointToDestinationRoute(fromPt, destination, mode)` routes from a point to a **room** directly across the outdoor, entrance and indoor graph. Floor transitions are included in the cost.
- `planDestinationRoute` and `findCompleteRouteInCampus` (`combinedPathfinding.ts`) handle building-to-room and room-to-room routes as segments (indoor exit → outdoor → indoor entry).
- Routine (standard and accessible) routes filter out emergency-only stairs, doors and entrances with `filterRoutineNavigationNodes`.

---

## 10. Validation, saving and publishing

- **Live validation:** `liveValidation.ts → computeLiveValidationIssues` and `validateNavigationGraph.ts` report disconnected components, buildings without entrances, entrances not reachable from the outdoor network, gates not reaching the network, unlinked rooms, and floors without vertical transitions. Each issue has a `target` the UI can jump to (`issueLocate.ts`, `IssuesPopover.tsx`, `ValidationErrorsDialog.tsx`).
- **Publish gate:** `campusPublication.ts → validateCampusForPublish` requires at least one visible building, at least one named room, a canvas of at least 320×240, and no error-severity issues.
- **Draft recovery:** `campusDraftPersistence.ts` keeps a sessionStorage draft keyed by campus and base version, and clears it after a successful save.
- **Save:** `campusStructureService.ts` flattens the campus into rows and calls a single transactional RPC, `save_campus_structure(p_campus_id, p_payload)`, with:
  - `buildings`
  - `floors`
  - `map_elements`: rooms, doors, walls, furniture, decor, paths, markers, gates, `canvas_appearance` and so on. `element_type` and the JSON `metadata` hold the object.
  - `navigation_nodes`
  - `navigation_edges`

  The save is verified by reading the data back afterwards, and `databaseUpdatedAt` is used for optimistic concurrency.
- **Publish:** `campusService.ts` writes a `campus_versions` row holding a full **JSON snapshot**, then calls `publish_campus_version`. Students read the published snapshot only, never the draft.
- **Port note:** add `georef` to the campus row, or to a `canvas_appearance`-style element, so it is versioned and published together with the geometry.

The database schema reference is `supabase/migrations/*.sql`, especially `establish_campus_structure_contract`, `persist_campus_canvas_setup_state` and `event_overlay_schema`. If the target system uses a different backend, keep the same tables and fields, and keep the rule that the structure is saved in **one transaction**.

---

## 11. Leaflet integration

### 11.1 Rendering approach (choose A; B is acceptable for v1)

**A. Per-object Leaflet vectors (recommended).** Project every authored shape through `canvasToLatLng`:

| Builder object | Leaflet layer |
|---|---|
| Building footprint (4 rotated corners) | `L.polygon` (fill = building colour), label via `L.tooltip({permanent:true})` or `L.divIcon` |
| Pathway | `L.polyline` with `weight` = `path.width × metersPerUnit` converted to pixels for the current zoom (update on `zoomend`) |
| Decor asset / gate / landmark | `L.marker` with an `L.divIcon` containing the same inline SVG, rotated by `rotation + bearingDeg`, and size scaled with zoom |
| Ground areas and surfaces | `L.polygon` with the material fill colour, or a pattern via an SVG `<pattern>` in a shared `<defs>` |
| Route line | `L.polyline` of the projected `waypoints` (dashed when indoor or on another floor) |
| Nav graph (admin only) | `L.circleMarker` per node and `L.polyline` per edge |

This handles rotation, zoom and hit-testing natively, and the map stays crisp at every zoom level.

**B. Single SVG overlay.** Render the existing read-only SVG scene (`ReadonlyOutdoorCampusScene`) into an `L.svgOverlay(svgEl, bounds)`. This only works when `bearingDeg === 0`, because `svgOverlay` cannot rotate. Otherwise you need a custom layer that applies a CSS rotate around the projected centre. It is the fastest way to get exact visual parity, but it blurs at high zoom and makes hit-testing harder.

**Indoor floors:** when a student opens a building, either:

- render the floor SVG (`ReadonlyFloorPlanScene`) inside the building's projected footprint, using a rotated overlay that maps the floor canvas onto the four building corners with the same mapping as `exteriorFloorPointToCampusWorld`, or
- keep the existing full-screen floor viewer (simpler), and only draw the route on Leaflet for the outdoor part.

### 11.2 Pane order (must preserve the live dot on top)

```ts
map.createPane("campusGround");  map.getPane("campusGround")!.style.zIndex = "350";
map.createPane("campusObjects"); map.getPane("campusObjects")!.style.zIndex = "420";
map.createPane("campusRoute");   map.getPane("campusRoute")!.style.zIndex = "450";
// existing live-location marker stays in markerPane (600) / its own pane — untouched
```

Base tiles are at 200, the campus panes sit at 350–450, and the live location stays above them.

### 11.3 Admin editing on Leaflet

The builder's editors are SVG canvases with their own pan and zoom (`useCanvasControls.ts`). Two options:

1. **Keep the canvas editor exactly as it is** (recommended) and add a toggle that shows the **Leaflet base map underneath as a backdrop**. Sync the backdrop to the canvas viewport through `canvasToLatLng`, and set the map to `dragging: false` and `zoomControl: false` while editing. All tools, snapping and reconcilers work without modification.
2. Re-implement the tools as Leaflet interactions (`leaflet-geoman` or similar). In that case, convert every pointer position with `latLngToCanvas` **before** applying any builder rule, and store only canvas coordinates.

### 11.4 Live location → route (read-only use of the existing feed)

```ts
// subscribe to the EXISTING live-location source; do not create a new watcher
existingLocation.subscribe(({ lat, lng, accuracy }) => {
  const p = latLngToCanvas({ lat, lng }, campus);
  const inside = p.x >= 0 && p.y >= 0 && p.x <= campus.canvasW && p.y <= campus.canvasH;
  if (!inside) { showOffCampusState(); return; }          // e.g. "Navigate to gate" instead
  // re-plan only when moved > ~3 m (3 / metersPerUnit units) or off-route
  if (shouldReplan(p, accuracy)) {
    const route = planRouteFromPoint(p, destination, mode, publishedGraph)
              ?? planPointToDestinationRoute(p, destinationDest, mode, ...);
    routeLayer.setLatLngs(route.waypoints.map((w) => canvasToLatLng(w, campus)));
  }
  updateProgress(p, route);  // nearest point on route polyline → remaining distance / next step
});
```

Rules:

- **Do not snap the user's visible marker.** The existing marker shows the raw GPS position. Only the routing start is snapped to the nearest outdoor node.
- If `accuracy` is greater than roughly 25 m, show a "low accuracy" hint and avoid re-planning on every fix.
- **Off-route detection:** if the distance to the route polyline exceeds `max(8 m, accuracy)` for 2 or more consecutive fixes, re-plan.
- If the user is outside the canvas, route from the nearest **campus gate** (`campusGates`) and show directions to that gate.
- Indoors, GPS is unreliable. Once the route reaches an entrance, switch to step-by-step floor guidance (`RouteStepsPanel.tsx`) rather than trusting the dot.

---

## 12. Student map features to carry over

- Search across buildings, rooms and places (`destinationSearch.ts`, `searchDestinationsInCampus`).
- Building details (hours, facilities, image), floor viewer and room highlight.
- Route planner dialog with mode and stairs/elevator preference (`UnifiedRoutePlannerDialog.tsx`), step list (`RouteStepsPanel.tsx`) and transition markers (`RouteTransitionMarker.tsx`).
- Emergency mode toward assembly points and emergency exits (`studentEmergencyNavigation.ts`).
- Event overlays: approved events render on top of the campus (`eventOverlayModel.ts`) and are kept separate from structure saves.

---

## 13. Build order for the AI

1. **Types and catalogs:** copy `types.ts` and `constants.ts`, adding `georef`.
2. **Pure libs with their tests:** `geo.ts` (plus the new `canvasToLatLng` and `latLngToCanvas`), `navigationGraph.ts`, `buildingEntrances.ts`, `campusGates.ts`, `campusPathNavigation.ts`, `campusPathNetwork.ts`, `entranceTransitions.ts`, `indoorNavigationGraph.ts`, `exteriorApproachNavigation.ts`, `pathfinding.ts`, `routineNavigationGraph.ts`, `routePlanner.ts`, `combinedPathfinding.ts`, `validateNavigationGraph.ts`, `campusPublication.ts`. Port the matching tests from `src/lib/__tests__`.
3. **Persistence:** create the tables and the transactional save RPC, then build publish with versioned snapshots.
4. **Campus wizard:** use the existing Leaflet map for the location pick.
5. **Campus Editor** (canvas, tools, layers, panels, undo and redo), with the Leaflet backdrop toggle.
6. **Georeference alignment tool** (§4.3).
7. **Floor Editor.**
8. **Validation UI, test-route panel and publish dialog.**
9. **Student Leaflet rendering** (§11.1) with pane order (§11.2).
10. **Live-location routing hookup** (§11.4), using the read-only subscription.

---

## 14. Acceptance checklist

- [ ] The existing live-location code is unchanged: `git diff` shows no edits to those files.
- [ ] `latLngToCanvas(canvasToLatLng(p)) ≈ p` holds for any bearing, within 0.01 units.
- [ ] After alignment, building footprints line up with the real buildings on satellite tiles at zoom 18–20.
- [ ] Drawing two pathways that meet at the same point creates **one** shared junction node, and deleting one pathway leaves the other's nodes intact.
- [ ] Moving or rotating a building moves its entrance nodes, linked doors and exterior approach nodes with it.
- [ ] An `exit_only` entrance is never used as the way in.
- [ ] Accessible mode never uses stairs or steps. Emergency mode never uses elevators. Standard routes never use emergency-only stairs or exits.
- [ ] Standing at a real spot on campus, the route starts from the nearest walkway node and ends at the destination building's entrance or room. The live dot stays above the campus layers.
- [ ] Publishing is blocked when `validateCampusForPublish` returns errors, and students only ever see the published snapshot.
- [ ] Route distance in metres matches the real-world distance measured on Leaflet within about 10% after calibration. If it does not, recalibrate `metersPerUnit`.

---

## 15. Things to avoid

- Do not store geometry in lat/lng or convert the algorithms to lat/lng.
- Do not create a second geolocation watcher or replace the existing marker.
- Do not claim nodes by proximity during reconciliation. Use explicit provenance IDs only.
- Do not let indoor nodes (`floorId` set) render on, or snap into, the outdoor map.
- Do not merge event overlays into the campus structure save.
- Do not hand-draw routes. Routes always come from A* over the derived graph.

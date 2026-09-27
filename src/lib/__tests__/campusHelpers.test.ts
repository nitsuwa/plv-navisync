import { describe, it, expect } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { buildSharedCampus, campusMatchesQuery, campusStatusOf, createCampusClone, resolvePublishTarget, sanitizeCampus } from "../campusHelpers";
import { syncExteriorEmergencyStairs } from "../exteriorEmergencyStairs";
import { hydrateCampusStructure, serializeCampusStructure } from "../../services/campusStructureService";

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A fully-populated campus exercising every entity type and cross-reference. */
function makeSourceCampus(): Campus {
  return {
    id: "campus-1",
    name: "PLV Main Campus",
    code: "MAIN",
    description: "Main campus",
    address: "Maysan Rd",
    city: "Valenzuela",
    province: "Metro Manila",
    postalCode: "1442",
    status: "active",
    publishStatus: "published",
    visibleToStudents: true,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: false, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    canvasConfigured: true,
    themeColor: "#0e2a6e",
    settings: { accessibility: true, emergency: false, eventLayer: false, gps: true },
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    publishedAt: "2026-01-02",
    buildings: [
      {
        id: "b1",
        name: "Main Building",
        code: "MAB",
        category: "academic",
        description: "",
        x: 10, y: 10, width: 100, height: 80,
        color: "#1e40af",
        entranceNodeId: "n1",
        floors: [
          {
            id: "f1", buildingId: "b1", number: 1, label: "Ground Floor",
            rooms: [
              { id: "r1", name: "Room 101", type: "classroom", x: 0, y: 0, w: 20, h: 20, floorId: "f1", buildingId: "b1", accessNodeId: "n3" },
            ],
            paths: [{ id: "fp1", points: [{ x: 0, y: 0 }], type: "hallway", color: "#888", width: 2 }],
            walls: [{ id: "w1", x1: 0, y1: 0, x2: 10, y2: 0, thickness: 2, color: "#333" }],
            doors: [{ id: "d1", x: 5, y: 5, width: 4, direction: "left", color: "#666" }],
            windows: [{ id: "win1", x: 1, y: 1, width: 5, height: 3, color: "#aaf" }],
            furniture: [{ id: "fu1", type: "table", name: "Table", category: "furniture", x: 2, y: 2, width: 4, height: 2, rotation: 0, color: "#888" }],
            stairs: [{ id: "s1", x: 8, y: 8, width: 6, height: 6, direction: "up", label: "Stairs A", sharedId: "shA" }],
            ramps: [{ id: "ra1", x: 0, y: 8, width: 6, height: 4, label: "Ramp A", sharedId: "shR" }],
            elevators: [{ id: "e1", x: 8, y: 0, width: 5, height: 5, doorWidth: 2, label: "Elev A", sharedId: "shE" }],
            labels: [{ id: "l1", x: 1, y: 1, text: "Lobby", fontSize: 10, color: "#111", rotation: 0 }],
          },
        ],
      },
    ],
    markers: [{ id: "m1", name: "Entrance", type: "entrance", x: 50, y: 50, color: "#0ea5e9" }],
    paths: [{ id: "p1", points: [{ x: 0, y: 0 }], type: "walkway", color: "#666", width: 3 }],
    navNodes: [
      { id: "n1", name: "MAB Entrance", type: "entrance", x: 50, y: 50, buildingId: "b1", accessible: true, color: "#0ea5e9" },
      { id: "n2", name: "Junction", type: "hallway", x: 100, y: 100, accessible: true, color: "#666" },
      { id: "n3", name: "Room 101 Node", type: "room_access", x: 10, y: 10, buildingId: "b1", floorId: "f1", accessible: true, color: "#666" },
      { id: "n4", name: "Stairs A Node", type: "stair", x: 11, y: 11, buildingId: "b1", floorId: "f1", transitionSharedId: "shA", accessible: true, color: "#666" },
    ],
    navEdges: [
      { id: "ne1", startNodeId: "n1", endNodeId: "n2", distance: 50, bidirectional: true, accessible: true, type: "path", color: "#666", width: 2 },
    ],
    routes: [
      { id: "rt1", name: "Entrance to Room 101", fromBuildingId: "b1", toBuildingId: "b1", waypoints: [], type: "walking", distanceM: 60, durationMin: 2, color: "#2563eb", isActive: true },
    ],
    accessibilityFeatures: [
      { id: "af1", buildingId: "b1", type: "ramp", label: "Front Ramp", status: "present" },
    ],
    assemblyPoints: [
      { id: "ap1", name: "Oval", x: 200, y: 200, navNodeId: "n2", capacity: 500, accessible: true },
    ],
    eventOverlays: [
      {
        id: "eo1", title: "Founders Day", description: "", dateStart: "2026-08-01", dateEnd: "2026-08-02", organizer: "OSA",
        markers: [{ x: 5, y: 5, color: "#f00", label: "Stage" }],
        locationRef: { type: "room", buildingId: "b1", floorId: "f1", roomId: "r1", label: "Main Building — Floor 1 — Room 101" },
        restrictedAreas: [],
        isActive: true,
      },
    ],
    decorAssets: [
      { id: "da1", type: "tree", x: 30, y: 30 },
    ],
  };
}

/**
 * Deterministic id generator for assertions (no randomness).
 * Uses a "c-" namespace so generated ids can never collide with the fixture's
 * ids (campus-1, b1, f1, ...), mirroring the guarantee of the real random genId.
 */
function seqGen(prefixes: Record<string, number> = {}) {
  return (p: string) => {
    prefixes[p] = (prefixes[p] ?? 0) + 1;
    return `c-${p}-${prefixes[p]}`;
  };
}

/** Collect every entity id in a campus into one array. */
function allIds(c: Campus): string[] {
  const ids: string[] = [c.id];
  for (const b of c.buildings) {
    ids.push(b.id);
    for (const entrance of b.entrances ?? []) ids.push(entrance.id);
    for (const group of b.circulationGroups ?? []) ids.push(group.id);
    for (const stair of b.exteriorEmergencyStairs ?? []) ids.push(stair.id);
    for (const f of b.floors) {
      ids.push(f.id);
      for (const r of f.rooms) ids.push(r.id);
      for (const p of f.paths) ids.push(p.id);
      for (const w of f.walls ?? []) ids.push(w.id);
      for (const d of f.doors ?? []) ids.push(d.id);
      for (const w of f.windows ?? []) ids.push(w.id);
      for (const fu of f.furniture ?? []) ids.push(fu.id);
      for (const s of f.stairs ?? []) ids.push(s.id);
      for (const r of f.ramps ?? []) ids.push(r.id);
      for (const e of f.elevators ?? []) ids.push(e.id);
      for (const l of f.labels ?? []) ids.push(l.id);
      for (const zone of f.exteriorZones ?? []) ids.push(zone.id);
      for (const item of f.entranceSteps ?? []) ids.push(item.id);
      for (const item of f.entranceRamps ?? []) ids.push(item.id);
      for (const item of f.extensions ?? []) ids.push(item.id);
    }
  }
  for (const m of c.markers) ids.push(m.id);
  for (const p of c.paths) ids.push(p.id);
  for (const n of c.navNodes ?? []) ids.push(n.id);
  for (const e of c.navEdges ?? []) ids.push(e.id);
  for (const r of c.routes ?? []) ids.push(r.id);
  for (const af of c.accessibilityFeatures ?? []) ids.push(af.id);
  for (const ap of c.assemblyPoints ?? []) ids.push(ap.id);
  for (const eo of c.eventOverlays ?? []) ids.push(eo.id);
  for (const d of c.decorAssets ?? []) ids.push(d.id);
  return ids;
}

// ── buildSharedCampus ───────────────────────────────────────────────────────

describe("buildSharedCampus", () => {
  it("stamps the campus as live (published + active) so students can see it", () => {
    const src = makeSourceCampus();
    // Even if the source is somehow a draft, the shared snapshot must be live
    const shared = buildSharedCampus({ ...src, publishStatus: "draft" }, "2026-02-01");
    expect(shared.publishStatus).toBe("published");
    expect(shared.status).toBe("active");
    expect(shared.publishedAt).toBe("2026-02-01");
  });

  it("carries over identity, canvas and all buildings/markers/paths", () => {
    const src = makeSourceCampus();
    const shared = buildSharedCampus(src, "2026-02-01");
    expect(shared.id).toBe("campus-1");
    expect(shared.name).toBe("PLV Main Campus");
    expect(shared.code).toBe("MAIN");
    expect(shared.canvasW).toBe(900);
    expect(shared.canvasH).toBe(680);
    expect(shared.buildings).toHaveLength(1);
    expect(shared.buildings[0].floors).toHaveLength(1);
    expect(shared.markers).toHaveLength(1);
    expect(shared.paths).toHaveLength(1);
  });
});

// ── resolvePublishTarget ────────────────────────────────────────────────────

describe("resolvePublishTarget", () => {
  it("toggles when no force is given", () => {
    expect(resolvePublishTarget(false)).toBe(true);
    expect(resolvePublishTarget(true)).toBe(false);
  });

  it("force wins over current state (direction-safe retry)", () => {
    // Retrying an unpublish on an already-unpublished campus must stay unpublish
    expect(resolvePublishTarget(false, "unpublish")).toBe(false);
    expect(resolvePublishTarget(true, "publish")).toBe(true);
    expect(resolvePublishTarget(false, "publish")).toBe(true);
    expect(resolvePublishTarget(true, "unpublish")).toBe(false);
  });
});

// ── campusStatusOf / campusMatchesQuery ─────────────────────────────────────

describe("campusStatusOf", () => {
  it("classifies published, draft (was published) and never published", () => {
    expect(campusStatusOf({ ...makeSourceCampus(), publishStatus: "published" })).toBe("published");
    expect(campusStatusOf({ ...makeSourceCampus(), publishStatus: "draft", publishedAt: "2026-01-01" })).toBe("draft");
    expect(campusStatusOf({ ...makeSourceCampus(), publishStatus: "draft", publishedAt: undefined })).toBe("never");
  });
});

describe("campusMatchesQuery", () => {
  const src = makeSourceCampus();

  it("matches name, code, description and location case-insensitively", () => {
    expect(campusMatchesQuery(src, "PLV MAIN")).toBe(true);
    expect(campusMatchesQuery(src, "main")).toBe(true);
    expect(campusMatchesQuery(src, "MAIN")).toBe(true);
    expect(campusMatchesQuery(src, "Maysan")).toBe(true); // address
    expect(campusMatchesQuery(src, "Metro")).toBe(true);   // province
    expect(campusMatchesQuery(src, "Valenzuela")).toBe(true); // city
    expect(campusMatchesQuery(src, "does-not-exist")).toBe(false);
  });

  it("empty query matches everything (no search active)", () => {
    expect(campusMatchesQuery(src, "")).toBe(true);
    expect(campusMatchesQuery(src, "   ")).toBe(true);
  });

  it("filters by status bucket", () => {
    const published = { ...src, publishStatus: "published" as const };
    const draft = { ...src, publishStatus: "draft" as const, publishedAt: "2026-01-01" };
    const never = { ...src, publishStatus: "draft" as const, publishedAt: undefined };

    expect(campusMatchesQuery(published, "", "published")).toBe(true);
    expect(campusMatchesQuery(published, "", "draft")).toBe(false);
    expect(campusMatchesQuery(draft, "", "draft")).toBe(true);
    expect(campusMatchesQuery(draft, "", "never")).toBe(false);
    expect(campusMatchesQuery(never, "", "never")).toBe(true);
    expect(campusMatchesQuery(never, "", "published")).toBe(false);
  });

  it("combines query and filter (AND)", () => {
    const draft = { ...src, publishStatus: "draft" as const, publishedAt: "2026-01-01" };
    expect(campusMatchesQuery(draft, "main", "draft")).toBe(true);
    expect(campusMatchesQuery(draft, "main", "published")).toBe(false);
    expect(campusMatchesQuery(draft, "zzz", "draft")).toBe(false);
  });
});

// ── createCampusClone ───────────────────────────────────────────────────────

describe("createCampusClone", () => {
  it("always produces a draft copy with unique name/code and no publishedAt", () => {
    const src = makeSourceCampus();
    const clone = createCampusClone(src, new Set(), new Set(), seqGen());
    expect(clone.id).not.toBe(src.id);
    expect(clone.name).toBe("PLV Main Campus (Copy)");
    expect(clone.code).toBe("MAIN-CP");
    expect(clone.publishStatus).toBe("draft");
    expect(clone.visibleToStudents).toBe(false);
    expect(clone.publishedAt).toBeUndefined();
    // Canvas config, theme, features & settings carry over
    expect(clone.canvasConfigured).toBe(true);
    expect(clone.themeColor).toBe("#0e2a6e");
    expect(clone.features).toEqual(src.features);
    expect(clone.settings).toEqual(src.settings);
  });

  it("appends a counter when the default copy name/code is already taken", () => {
    const src = makeSourceCampus();
    const clone = createCampusClone(
      src,
      new Set(["PLV Main Campus (Copy)"]),
      new Set(["MAIN-CP"]),
      seqGen()
    );
    expect(clone.name).toBe("PLV Main Campus (Copy) 2");
    expect(clone.code).toBe("MAIN-CP-2");
  });

  it("keeps the generated copy code within the database length limit", () => {
    const src = { ...makeSourceCampus(), code: "A".repeat(30) };
    const clone = createCampusClone(src, new Set(), new Set(), seqGen());
    expect(clone.code).toHaveLength(30);
    expect(clone.code.endsWith("-CP")).toBe(true);
  });

  it("gives every nested entity a fresh id and never reuses a source id", () => {
    const src = makeSourceCampus();
    const srcIds = new Set(allIds(src));
    const clone = createCampusClone(src, new Set(), new Set(), seqGen());
    const cloneIds = allIds(clone);
    for (const id of cloneIds) {
      expect(srcIds.has(id)).toBe(false);
    }
  });

  it("produces unique ids across the whole clone (no duplicates for React keys)", () => {
    const src = makeSourceCampus();
    const clone = createCampusClone(src, new Set(), new Set(), seqGen());
    const cloneIds = allIds(clone);
    expect(new Set(cloneIds).size).toBe(cloneIds.length);
  });

  it("remaps all cross-references to the cloned ids", () => {
    const src = makeSourceCampus();
    const clone = createCampusClone(src, new Set(), new Set(), seqGen());
    const nb = clone.buildings[0];
    const nf = nb.floors[0];
    const nr = nf.rooms[0];
    const cloneNodeIds = new Set((clone.navNodes ?? []).map((n) => n.id));
    const cloneRoomIds = new Set(nf.rooms.map((r) => r.id));
    const cloneFloorIds = new Set(nb.floors.map((f) => f.id));

    // Rooms point at the cloned building/floor
    expect(nr.buildingId).toBe(nb.id);
    expect(nr.floorId).toBe(nf.id);
    expect(nf.buildingId).toBe(nb.id);
    // Room access node remapped to an existing cloned node
    expect(nr.accessNodeId).toBeDefined();
    expect(cloneNodeIds.has(nr.accessNodeId!)).toBe(true);
    // Building entrance node remapped
    expect(cloneNodeIds.has(nb.entranceNodeId!)).toBe(true);

    // Nav nodes point at cloned building/floor
    const n3 = clone.navNodes!.find((n) => n.name === "Room 101 Node")!;
    expect(n3.buildingId).toBe(nb.id);
    expect(cloneFloorIds.has(n3.floorId!)).toBe(true);

    // Nav edges connect cloned nodes
    for (const e of clone.navEdges ?? []) {
      expect(cloneNodeIds.has(e.startNodeId)).toBe(true);
      expect(cloneNodeIds.has(e.endNodeId)).toBe(true);
    }

    // Routes point at the cloned building
    for (const r of clone.routes ?? []) {
      expect(r.fromBuildingId).toBe(nb.id);
      expect(r.toBuildingId).toBe(nb.id);
    }

    // Accessibility features point at the cloned building
    for (const af of clone.accessibilityFeatures ?? []) {
      expect(af.buildingId).toBe(nb.id);
    }

    // Assembly points reference an existing cloned node
    for (const ap of clone.assemblyPoints ?? []) {
      expect(cloneNodeIds.has(ap.navNodeId!)).toBe(true);
    }

    // Event overlay locationRef points at cloned building/floor/room
    const eo = clone.eventOverlays![0];
    expect(eo.locationRef!.buildingId).toBe(nb.id);
    expect(cloneFloorIds.has(eo.locationRef!.floorId!)).toBe(true);
    expect(cloneRoomIds.has(eo.locationRef!.roomId!)).toBe(true);

    // Stairs/ramps/elevators keep valid shared ids and link to nav transition nodes
    const stair = nf.stairs[0];
    expect(stair.sharedId).toBeDefined();
    const stairNode = clone.navNodes!.find((n) => n.name === "Stairs A Node")!;
    expect(stairNode.transitionSharedId).toBe(stair.sharedId);
  });

  it("handles legacy floors that predate walls/doors/furniture/etc.", () => {
    const src = makeSourceCampus();
    const legacy: Campus = {
      ...src,
      buildings: [{
        ...src.buildings[0],
        floors: [{
          id: "f1", buildingId: "b1", number: 1, label: "Ground Floor",
          rooms: [{ id: "r1", name: "Room 101", type: "classroom", x: 0, y: 0, w: 20, h: 20, floorId: "f1", buildingId: "b1" }],
          paths: [{ id: "fp1", points: [{ x: 0, y: 0 }], type: "hallway", color: "#888", width: 2 }],
        }],
      }],
    } as unknown as Campus;

    const clone = createCampusClone(legacy, new Set(), new Set(), seqGen());
    const nf = clone.buildings[0].floors[0];
    expect(nf.walls ?? []).toEqual([]);
    expect(nf.doors ?? []).toEqual([]);
    expect(nf.windows ?? []).toEqual([]);
    expect(nf.furniture ?? []).toEqual([]);
    expect(nf.stairs ?? []).toEqual([]);
    expect(nf.ramps ?? []).toEqual([]);
    expect(nf.elevators ?? []).toEqual([]);
    expect(nf.labels ?? []).toEqual([]);
    // Room still remapped correctly
    expect(nf.rooms[0].floorId).toBe(nf.id);
    expect(nf.rooms[0].buildingId).toBe(clone.buildings[0].id);
  });

  it("does not mutate the source campus", () => {
    const src = makeSourceCampus();
    const snapshot = JSON.stringify(src);
    createCampusClone(src, new Set(), new Set(), seqGen());
    expect(JSON.stringify(src)).toBe(snapshot);
  });

  it("remaps outdoor generated vertices and circulation-group identities", () => {
    const src = makeSourceCampus();
    src.buildings[0].circulationGroups = [{ id: "cg1", buildingId: "b1", kind: "stair", name: "Stair A" }];
    src.paths[0] = { ...src.paths[0], navigationVertexIds: ["out-v1", "out-v2"] };
    src.navNodes = [
      ...(src.navNodes ?? []),
      {
        id: "n5", name: "Outdoor Generated", type: "outdoor", x: 25, y: 25,
        generatedFromPathVertices: [{ pathId: "p1", vertexId: "out-v1" }],
        accessible: true, color: "#666",
      },
    ];

    const clone = createCampusClone(src, new Set(), new Set(), seqGen());
    const clonedBuilding = clone.buildings[0];
    const clonedPath = clone.paths[0];
    const clonedNode = clone.navNodes!.find((node) => node.name === "Outdoor Generated")!;

    expect(clonedBuilding.circulationGroups?.[0].id).not.toBe("cg1");
    expect(clonedBuilding.circulationGroups?.[0].buildingId).toBe(clonedBuilding.id);
    expect(clonedPath.id).not.toBe("p1");
    expect(clonedPath.navigationVertexIds).not.toEqual(src.paths[0].navigationVertexIds);
    expect(clonedNode.generatedFromPathVertices?.[0].pathId).toBe(clonedPath.id);
    expect(clonedNode.generatedFromPathVertices?.[0].vertexId).toBe(clonedPath.navigationVertexIds?.[0]);
  });

  it("remaps Entrance-owned Floor Doors and clones all newer Floor physical identities", () => {
    const src = makeSourceCampus();
    const building = src.buildings[0];
    const floor = building.floors[0];
    building.entrances = [{ id: "entrance-source", buildingId: building.id, edge: "bottom", offset: 0.5, type: "general" }];
    floor.doors[0] = { ...floor.doors[0], wallId: "w1", buildingEntranceId: "entrance-source" };
    floor.furniture[0] = { ...floor.furniture[0], groupId: "group-source" };
    floor.exteriorZones = [{ id: "zone-source", type: "veranda", side: "bottom", offset: 0.5, width: 20, depth: 8, linkedEntranceId: "entrance-source" }];
    floor.entranceSteps = [{ id: "steps-source", x: 5, y: 5, width: 6, height: 4, label: "Steps", parentZoneId: "zone-source", linkedEntranceId: "entrance-source" }];
    floor.entranceRamps = [{ id: "ramp-source", x: 5, y: 5, width: 6, height: 4, label: "Ramp", parentZoneId: "zone-source", linkedEntranceId: "entrance-source" }];
    floor.extensions = [{ id: "extension-source", side: "bottom", offset: 40, width: 70, depth: 30 }];

    const copy = createCampusClone(src, new Set(), new Set(), seqGen());
    const copyBuilding = copy.buildings[0];
    const copyFloor = copyBuilding.floors[0];
    const copyEntrance = copyBuilding.entrances![0];

    expect(copyEntrance.id).not.toBe("entrance-source");
    expect(copyFloor.doors[0].buildingEntranceId).toBe(copyEntrance.id);
    expect(copyFloor.doors[0].wallId).toBe(copyFloor.walls[0].id);
    expect(copyFloor.exteriorZones?.[0].linkedEntranceId).toBe(copyEntrance.id);
    expect(copyFloor.entranceSteps?.[0]).toMatchObject({ parentZoneId: copyFloor.exteriorZones?.[0].id, linkedEntranceId: copyEntrance.id });
    expect(copyFloor.entranceRamps?.[0]).toMatchObject({ parentZoneId: copyFloor.exteriorZones?.[0].id, linkedEntranceId: copyEntrance.id });
    expect(copyFloor.extensions?.[0].id).not.toBe("extension-source");
    expect(copyFloor.furniture[0].groupId).not.toBe("group-source");
    expect(new Set(allIds(copy)).size).toBe(allIds(copy).length);
    expect(allIds(copy).some((id) => allIds(src).includes(id))).toBe(false);
  });

  it("clears an irrecoverable legacy Entrance attachment while keeping the Door", () => {
    const src = makeSourceCampus();
    src.buildings[0].floors[0].doors[0] = { ...src.buildings[0].floors[0].doors[0], buildingEntranceId: "deleted-entrance" };

    const copy = createCampusClone(src, new Set(), new Set(), seqGen());

    expect(copy.buildings[0].floors[0].doors).toHaveLength(1);
    expect(copy.buildings[0].floors[0].doors[0].buildingEntranceId).toBeUndefined();
    expect(copy.buildings[0].floors[0].doors[0]).toMatchObject({ x: 5, y: 5, width: 4 });
  });

  it("keeps a physical Stair when its legacy Exterior Stair owner is missing through Save/Reload", () => {
    const src = makeSourceCampus();
    src.buildings[0].floors[0].stairs.push({
      id: "orphan-stair-source", x: 100, y: 120, width: 28, height: 44,
      direction: "up", label: "Legacy Exterior Stair", exteriorEmergencyStairId: "deleted-exterior-owner",
    });

    const copy = createCampusClone(src, new Set(), new Set(), seqGen());
    const copiedFloor = copy.buildings[0].floors[0];
    expect(copiedFloor.stairs).toHaveLength(2);
    expect(copiedFloor.stairs[1]).toMatchObject({ x: 100, y: 120, width: 28, label: "Legacy Exterior Stair" });
    expect(copiedFloor.stairs[1].exteriorEmergencyStairId).toBeUndefined();

    const payload = serializeCampusStructure(copy);
    const reloaded = hydrateCampusStructure(copy, {
      buildings: payload.buildings.map((row) => row as never),
      floors: payload.floors.map((row) => row as never),
      mapElements: payload.map_elements.map((row) => row as never),
      navigationNodes: payload.navigation_nodes.map((row) => row as never),
      navigationEdges: payload.navigation_edges.map((row) => row as never),
    });
    expect(reloaded.buildings[0].floors[0].stairs).toHaveLength(2);
    expect(reloaded.buildings[0].floors[0].stairs[1]).toMatchObject({ x: 100, y: 120, width: 28, label: "Legacy Exterior Stair" });
  });

  it("remaps Exterior Stair served Floors before save-time synchronization", () => {
    const src = makeSourceCampus();
    const sourceBuilding = src.buildings[0];
    const sourceFloor = sourceBuilding.floors[0];
    const sourceStairId = "source-exterior-stair-occurrence";
    const sourceOwnerId = "source-exterior-stair-owner";
    sourceFloor.stairs.push({
      id: sourceStairId, x: 40, y: 60, width: 28, height: 44,
      direction: "both", label: "Exterior Emergency Stair", exteriorEmergencyStairId: sourceOwnerId,
    });
    sourceBuilding.exteriorEmergencyStairs = [{
      id: sourceOwnerId, buildingId: sourceBuilding.id, label: "Exterior Emergency Stair", state: "open",
      width: 28, height: 44, attachment: { edge: "right", offset: 0.5 }, servedFloorIds: [sourceFloor.id],
      occurrenceIds: { [sourceFloor.id]: sourceStairId }, emergencySafe: true,
    }];

    const copy = createCampusClone(src, new Set(), new Set(), seqGen());
    const copiedBuilding = syncExteriorEmergencyStairs(copy).buildings[0];
    const copiedFloor = copiedBuilding.floors[0];
    const copiedOwner = copiedBuilding.exteriorEmergencyStairs![0];

    expect(copiedOwner.servedFloorIds).toEqual([copiedFloor.id]);
    expect(copiedOwner.occurrenceIds).toEqual({ [copiedFloor.id]: copiedFloor.stairs.find((stair) => stair.exteriorEmergencyStairId === copiedOwner.id)?.id });
    expect(copiedFloor.stairs.some((stair) => stair.id === sourceStairId)).toBe(false);
    expect(copiedFloor.stairs.some((stair) => stair.exteriorEmergencyStairId === copiedOwner.id)).toBe(true);
    expect(copiedFloor.stairs.filter((stair) => stair.exteriorEmergencyStairId === copiedOwner.id)).toHaveLength(1);
    expect(copiedFloor.stairs).toHaveLength(sourceFloor.stairs.length);
  });
});

// ── sanitizeCampus ──────────────────────────────────────────────────────────

describe("sanitizeCampus", () => {
  it("applies safe defaults to a legacy campus missing new fields", () => {
    const legacy = {
      id: "legacy-1",
      name: "Old Campus",
      code: "OLD",
      description: "",
      address: "",
      city: "",
      province: "",
      postalCode: "",
      status: undefined,
      publishStatus: undefined,
      visibleToStudents: undefined,
      features: undefined,
      canvasW: undefined,
      canvasH: undefined,
      settings: undefined,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      buildings: undefined,
      markers: undefined,
      paths: undefined,
      routes: undefined,
      accessibilityFeatures: undefined,
      assemblyPoints: undefined,
      eventOverlays: undefined,
      decorAssets: undefined,
      navNodes: undefined,
      navEdges: undefined,
    } as unknown as Campus;

    const safe = sanitizeCampus(legacy);
    expect(safe.status).toBe("active");
    expect(safe.publishStatus).toBe("draft");
    expect(safe.visibleToStudents).toBe(false);
    expect(safe.canvasW).toBe(900);
    expect(safe.canvasH).toBe(680);
    expect(safe.features).toEqual({
      indoorNavigation: false,
      accessibilityNavigation: false,
      emergencyRoutes: false,
      issueReporting: false,
    });
    expect(safe.settings).toEqual({ accessibility: false, emergency: false, eventLayer: false, gps: false });
    expect(safe.buildings).toEqual([]);
    expect(safe.markers).toEqual([]);
    expect(safe.paths).toEqual([]);
    expect(safe.routes).toEqual([]);
    expect(safe.navNodes).toEqual([]);
    expect(safe.navEdges).toEqual([]);
    expect(safe.accessibilityFeatures).toEqual([]);
    expect(safe.assemblyPoints).toEqual([]);
    expect(safe.eventOverlays).toEqual([]);
    expect(safe.decorAssets).toEqual([]);
  });

  it("normalizes buildings with missing floors and floors with missing rooms/paths", () => {
    const legacy = {
      ...makeSourceCampus(),
      buildings: [
        { id: "b1", name: "B", code: "B1", category: "academic", description: "", x: 0, y: 0, width: 10, height: 10, color: "#fff", floors: undefined },
        {
          id: "b2", name: "C", code: "C1", category: "academic", description: "", x: 0, y: 0, width: 10, height: 10, color: "#fff",
          floors: [{ id: "f1", buildingId: "b2", number: 1, label: "Ground", rooms: undefined, paths: undefined }],
        },
      ],
    } as unknown as Campus;

    const safe = sanitizeCampus(legacy);
    expect(safe.buildings[0].floors).toEqual([]);
    expect(safe.buildings[1].floors[0].rooms).toEqual([]);
    expect(safe.buildings[1].floors[0].paths).toEqual([]);
  });

  it("preserves provided values and existing collections", () => {
    const src = makeSourceCampus();
    const safe = sanitizeCampus(src);
    expect(safe.name).toBe("PLV Main Campus");
    expect(safe.canvasW).toBe(900);
    expect(safe.buildings).toHaveLength(1);
    expect(safe.navNodes).toHaveLength(4);
    expect(safe.navEdges).toHaveLength(1);
    expect(safe.markers).toHaveLength(1);
  });
});

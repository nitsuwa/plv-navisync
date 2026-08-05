import { describe, it, expect } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { buildSharedCampus, campusMatchesQuery, campusStatusOf, createCampusClone, resolvePublishTarget } from "../campusHelpers";

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
});

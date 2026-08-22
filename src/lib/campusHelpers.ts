import type { Campus } from "../components/map-builder/types";
import type { SharedCampusData } from "../contexts/CampusDataContext";
import { normalizeBuildingEntrances } from "./buildingEntrances";
import { normalizeFloor } from "./floorPlanNormalization";

/**
 * Build the shared, student-facing snapshot of a campus used by all publish
 * flows (publish, re-publish on restore, wizard publish-status sync).
 *
 * This helper is ONLY called from publish paths, so it always stamps the
 * campus as live for students — callers never pass a draft snapshot. Students
 * filter on `publishStatus !== "draft" && status !== "archived"`, so stamping
 * both fields explicitly prevents a freshly published campus from being
 * accidentally invisible.
 */
export function buildSharedCampus(campus: Campus, publishedAt?: string): SharedCampusData {
  return {
    id: campus.id,
    name: campus.name,
    code: campus.code,
    canvasW: campus.canvasW,
    canvasH: campus.canvasH,
    buildings: campus.buildings.map((b) => ({
      id: b.id, name: b.name, code: b.code,
      category: b.category, description: b.description,
      x: b.x, y: b.y, width: b.width, height: b.height,
      color: b.color, floors: b.floors, entrances: normalizeBuildingEntrances(b),
    })),
    markers: campus.markers,
    paths: campus.paths,
    publishStatus: "published",
    status: "active",
    publishedAt: publishedAt ?? campus.publishedAt ?? new Date().toISOString(),
  };
}

/**
 * Resolve the target publish state for togglePublish.
 *
 * `force` makes the action direction-aware: retry/confirm re-run the exact
 * same action instead of toggling back (e.g. retrying an unpublish must not
 * re-publish the campus).
 */
export function resolvePublishTarget(wasPublished: boolean, force?: "publish" | "unpublish"): boolean {
  return force ? force === "publish" : !wasPublished;
}

// ── Campus list search & filter ─────────────────────────────────────────────

/** Status buckets used by the campus management list filter (mirrors card badges). */
export type CampusStatusFilter = "all" | "published" | "draft" | "never";

/**
 * Classify a campus into a status bucket. Mirrors the card badge logic:
 * published / draft (was published, now draft) / never published.
 */
export function campusStatusOf(c: Campus): "published" | "draft" | "never" {
  if (c.publishStatus === "published" || c.lifecycleStatus === "published") return "published";
  return c.lifecycleStatus === "unpublished" || !!c.publishedAt ? "draft" : "never";
}

/**
 * Normalize a campus loaded from localStorage so every field downstream
 * expects exists with a safe default.
 *
 * Campuses persisted by older versions of the app may lack `floors` on
 * buildings, `markers`/`paths`/`routes`/nav/decor collections, or the
 * status/visibility flags. Without this, CampusHome and the editors crash
 * with "Cannot read properties of undefined" and the whole Map Builder page
 * (including the New Campus button) fails to render.
 */
export function sanitizeCampus(c: Campus): Campus {
  return {
    ...c,
    status: c.status ?? "active",
    visibleToStudents: c.visibleToStudents ?? false,
    publishStatus: c.publishStatus ?? "draft",
    canvasW: c.canvasW ?? 900,
    canvasH: c.canvasH ?? 680,
    features: c.features ?? {
      indoorNavigation: false,
      accessibilityNavigation: false,
      emergencyRoutes: false,
      issueReporting: false,
    },
    settings: c.settings ?? { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: (Array.isArray(c.buildings) ? c.buildings : []).map((b) => ({
      ...b,
      entrances: Array.isArray(b?.entrances) ? normalizeBuildingEntrances(b) : [],
      floors: (Array.isArray(b?.floors) ? b.floors : []).map((f) => normalizeFloor(f, { buildingId: b.id })),
    })),
    markers: Array.isArray(c.markers) ? c.markers : [],
    paths: Array.isArray(c.paths) ? c.paths : [],
    routes: Array.isArray(c.routes) ? c.routes : [],
    accessibilityFeatures: Array.isArray(c.accessibilityFeatures) ? c.accessibilityFeatures : [],
    assemblyPoints: Array.isArray(c.assemblyPoints) ? c.assemblyPoints : [],
    eventOverlays: Array.isArray(c.eventOverlays) ? c.eventOverlays : [],
    decorAssets: Array.isArray(c.decorAssets) ? c.decorAssets : [],
    navNodes: Array.isArray(c.navNodes) ? c.navNodes : [],
    navEdges: Array.isArray(c.navEdges) ? c.navEdges : [],
  };
}

/**
 * Whether a campus matches the campus-list search query and status filter.
 * The query is matched case-insensitively against name, code, description,
 * city, province, and address.
 */
export function campusMatchesQuery(c: Campus, query: string, filter: CampusStatusFilter = "all"): boolean {
  if (filter !== "all" && campusStatusOf(c) !== filter) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [c.name, c.code, c.description, c.city, c.province, c.address]
    .some((v) => v != null && v.toLowerCase().includes(q));
}

/**
 * Deep-clone a campus into an independent draft copy.
 *
 * Every nested entity receives a fresh id (buildings, floors, rooms, floor
 * paths, walls, doors, windows, furniture, stairs, ramps, elevators, labels,
 * markers, paths, nav nodes/edges, routes, accessibility features, assembly
 * points, event overlays, decor assets) and every cross-reference is remapped
 * (buildingId/floorId/roomId, entranceNodeId, accessNodeId, navNodeId,
 * startNodeId/endNodeId, locationRef, and the shared stair/ramp/elevator ids
 * that link the same physical element across floors).
 *
 * The copy is always a draft: `publishStatus: "draft"`, not visible to
 * students, no `publishedAt`. Name/code are made unique against the provided
 * taken sets so repeated duplicates never collide.
 *
 * @param source      campus to copy (never mutated)
 * @param takenNames  names already in use (the clone avoids these)
 * @param takenCodes  codes already in use (the clone avoids these)
 * @param gen         id generator, e.g. `genId`
 */
export function createCampusClone(
  source: Campus,
  takenNames: Set<string>,
  takenCodes: Set<string>,
  gen: (prefix: string) => string,
): Campus {
  const now = new Date().toISOString().slice(0, 10);

  // ── Unique name & code so repeated duplicates never collide ──
  const baseName = `${source.name} (Copy)`;
  const baseCode = source.code ? `${source.code}-CP` : "";
  let name = baseName;
  let code = baseCode;
  let n = 2;
  while (takenNames.has(name)) { name = `${baseName} ${n}`; n++; }
  if (baseCode) {
    n = 2;
    while (takenCodes.has(code)) { code = `${baseCode}-${n}`; n++; }
  }

  // ── Build old→new id maps so every nested entity & cross-reference is remapped ──
  const bldMap = new Map<string, string>();
  const floorMap = new Map<string, string>();
  const roomMap = new Map<string, string>();
  const fpMap = new Map<string, string>();
  const markerMap = new Map<string, string>();
  const pathMap = new Map<string, string>();
  const nodeMap = new Map<string, string>();
  const edgeMap = new Map<string, string>();
  const decorMap = new Map<string, string>();
  const eventMap = new Map<string, string>();
  const assemMap = new Map<string, string>();
  // Stairs/ramps/elevators share one id across floors of the same building
  const sharedMap = new Map<string, string>();
  const remapShared = (s: string) => {
    if (!sharedMap.has(s)) sharedMap.set(s, gen("sh"));
    return sharedMap.get(s)!;
  };

  source.buildings.forEach((b) => bldMap.set(b.id, gen("bld")));
  source.buildings.forEach((b) => (Array.isArray(b.floors) ? b.floors : []).forEach((rawFloor) => {
    const f = normalizeFloor(rawFloor, { buildingId: b.id });
    floorMap.set(f.id, gen("fl"));
    f.rooms.forEach((r) => roomMap.set(r.id, gen("rm")));
    f.paths.forEach((p) => fpMap.set(p.id, gen("fp")));
  }));
  source.markers.forEach((m) => markerMap.set(m.id, gen("mk")));
  source.paths.forEach((p) => pathMap.set(p.id, gen("pt")));
  (source.navNodes ?? []).forEach((nn) => nodeMap.set(nn.id, gen("nn")));
  (source.navEdges ?? []).forEach((e) => edgeMap.set(e.id, gen("ne")));
  (source.decorAssets ?? []).forEach((d) => decorMap.set(d.id, gen("da")));
  (source.eventOverlays ?? []).forEach((eo) => eventMap.set(eo.id, gen("eo")));
  (source.assemblyPoints ?? []).forEach((ap) => assemMap.set(ap.id, gen("ap")));

  const clone: Campus = {
    ...structuredClone(source),
    id: gen("campus"),
    name,
    code,
    publishStatus: "draft",
    visibleToStudents: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: undefined,
    buildings: source.buildings.map((b) => {
      const nbId = bldMap.get(b.id)!;
      return {
        ...structuredClone(b),
        id: nbId,
        entrances: (b.entrances ?? []).map((entrance) => ({ ...structuredClone(entrance), id: gen("ent"), buildingId: nbId })),
        entranceNodeId: b.entranceNodeId ? nodeMap.get(b.entranceNodeId) ?? b.entranceNodeId : undefined,
        floors: (Array.isArray(b.floors) ? b.floors : []).map((rawFloor) => {
          const f = normalizeFloor(rawFloor, { buildingId: b.id });
          const nfId = floorMap.get(f.id)!;
          return {
            ...normalizeFloor(structuredClone(f), { buildingId: nbId }),
            id: nfId,
            buildingId: nbId,
            rooms: f.rooms.map((r) => ({
              ...structuredClone(r),
              id: roomMap.get(r.id)!,
              buildingId: nbId,
              floorId: nfId,
              accessNodeId: r.accessNodeId ? nodeMap.get(r.accessNodeId) ?? r.accessNodeId : undefined,
            })),
            paths: f.paths.map((p) => ({ ...structuredClone(p), id: fpMap.get(p.id)! })),
            // Older persisted campuses may predate these floor collections — guard with ?? []
            walls: (f.walls ?? []).map((w) => ({ ...structuredClone(w), id: gen("w") })),
            doors: (f.doors ?? []).map((d) => ({ ...structuredClone(d), id: gen("d") })),
            windows: (f.windows ?? []).map((w) => ({ ...structuredClone(w), id: gen("wi") })),
            furniture: (f.furniture ?? []).map((fu) => ({ ...structuredClone(fu), id: gen("fu") })),
            stairs: (f.stairs ?? []).map((s) => ({ ...structuredClone(s), id: gen("st"), sharedId: s.sharedId ? remapShared(s.sharedId) : undefined })),
            ramps: (f.ramps ?? []).map((r) => ({ ...structuredClone(r), id: gen("ra"), sharedId: r.sharedId ? remapShared(r.sharedId) : undefined })),
            elevators: (f.elevators ?? []).map((e) => ({ ...structuredClone(e), id: gen("el"), sharedId: e.sharedId ? remapShared(e.sharedId) : undefined })),
            labels: (f.labels ?? []).map((l) => ({ ...structuredClone(l), id: gen("lb") })),
          };
        }),
      };
    }),
    markers: source.markers.map((m) => ({ ...structuredClone(m), id: markerMap.get(m.id)! })),
    paths: source.paths.map((p) => ({ ...structuredClone(p), id: pathMap.get(p.id)! })),
    navNodes: (source.navNodes ?? []).map((nn) => ({
      ...structuredClone(nn),
      id: nodeMap.get(nn.id)!,
      buildingId: nn.buildingId ? bldMap.get(nn.buildingId) ?? nn.buildingId : undefined,
      floorId: nn.floorId ? floorMap.get(nn.floorId) ?? nn.floorId : undefined,
      transitionSharedId: nn.transitionSharedId ? remapShared(nn.transitionSharedId) : undefined,
      generatedFromPathVertices: nn.generatedFromPathVertices?.map((ref) => ({
        ...ref,
        pathId: pathMap.get(ref.pathId) ?? ref.pathId,
      })),
    })),
    navEdges: (source.navEdges ?? []).map((e) => ({
      ...structuredClone(e),
      id: edgeMap.get(e.id)!,
      startNodeId: nodeMap.get(e.startNodeId) ?? e.startNodeId,
      endNodeId: nodeMap.get(e.endNodeId) ?? e.endNodeId,
      generatedFromPathIds: e.generatedFromPathIds?.map((pathId) => pathMap.get(pathId) ?? pathId),
    })),
    routes: (source.routes ?? []).map((r) => ({
      ...structuredClone(r),
      id: gen("rt"),
      fromBuildingId: bldMap.get(r.fromBuildingId) ?? r.fromBuildingId,
      toBuildingId: bldMap.get(r.toBuildingId) ?? r.toBuildingId,
    })),
    accessibilityFeatures: (source.accessibilityFeatures ?? []).map((af) => ({
      ...structuredClone(af),
      id: gen("af"),
      buildingId: bldMap.get(af.buildingId) ?? af.buildingId,
    })),
    assemblyPoints: (source.assemblyPoints ?? []).map((ap) => ({
      ...structuredClone(ap),
      id: assemMap.get(ap.id)!,
      navNodeId: ap.navNodeId ? nodeMap.get(ap.navNodeId) ?? ap.navNodeId : undefined,
    })),
    eventOverlays: (source.eventOverlays ?? []).map((eo) => ({
      ...structuredClone(eo),
      id: eventMap.get(eo.id)!,
      locationRef: eo.locationRef ? {
        ...structuredClone(eo.locationRef),
        buildingId: bldMap.get(eo.locationRef.buildingId) ?? eo.locationRef.buildingId,
        floorId: eo.locationRef.floorId ? floorMap.get(eo.locationRef.floorId) ?? eo.locationRef.floorId : undefined,
        roomId: eo.locationRef.roomId ? roomMap.get(eo.locationRef.roomId) ?? eo.locationRef.roomId : undefined,
      } : undefined,
    })),
    decorAssets: (source.decorAssets ?? []).map((d) => ({ ...structuredClone(d), id: decorMap.get(d.id)! })),
  };

  return clone;
}

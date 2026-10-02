import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import type { Campus } from "../../components/map-builder/types";
import {
  CampusDeletionError,
  CampusServiceError,
  cleanupCampusStorage,
  comingSoonCampusFromSummary,
  createCampus,
  listCampuses,
  listComingSoonCampuses,
  listPublishedCampusSnapshots,
  mergePublishedCampusAppearance,
  normalizeCampusCode,
  permanentlyDeleteCampus,
  updateCampus,
  userFacingCampusMessage,
} from "../campusService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const campusRow = {
  id: "c1",
  name: "Test Campus",
  code: "TST",
  description: null,
  address: null,
  city: null,
  province: null,
  postal_code: null,
  latitude: null,
  longitude: null,
  logo_path: null,
  overview_image_path: null,
  theme_color: "#1e3a5f",
  canvas_width: 900,
  canvas_height: 680,
  canvas_configured: false,
  map_scale_m_per_unit: 1,
  is_default: false,
  status: "draft",
  latest_published_version_id: null,
  created_by: "u1",
  updated_by: "u1",
  created_at: "2026-08-07T00:00:00Z",
  updated_at: "2026-08-07T00:00:00Z",
  archived_at: null,
};

function makeClient(insertImpl: (payload: unknown) => unknown) {
  const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) };
  const from = vi.fn((table: string) => {
    if (table !== "campuses") throw new Error(`unexpected table ${table}`);
    return { insert: insertImpl };
  });
  vi.mocked(getSupabase).mockReturnValue({ from, auth } as never);
}

function okInsert(row: unknown) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  return vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
}

describe("normalizeCampusCode (DB contract: ^[A-Z0-9][A-Z0-9_-]{0,29}$)", () => {
  it("trims and uppercases a valid code", () => {
    expect(normalizeCampusCode("  plv-main  ")).toBe("PLV-MAIN");
  });

  it("rejects an empty or whitespace-only code", () => {
    expect(() => normalizeCampusCode("")).toThrow(/Campus code is required/);
    expect(() => normalizeCampusCode("   ")).toThrow(/Campus code is required/);
  });

  it("rejects codes containing spaces (wizard used to allow them)", () => {
    expect(() => normalizeCampusCode("PLV MAIN")).toThrow(/no spaces/);
    expect(() => normalizeCampusCode("MAIN CAMPUS")).toThrow(/no spaces/);
  });

  it("rejects codes with forbidden characters or over 30 chars", () => {
    expect(() => normalizeCampusCode("MAIN.CAMPUS")).toThrow(/no spaces/);
    expect(() => normalizeCampusCode("A".repeat(31))).toThrow(/no spaces/);
  });
});

describe("userFacingCampusMessage (concise, no DB internals leaked)", () => {
  it("maps known PostgREST codes to friendly one-liners", () => {
    expect(userFacingCampusMessage(new CampusServiceError({ operation: "create campus", message: "raw constraint text", code: "23514" }))).toBe(
      "Campus could not be saved. Please check the campus details."
    );
    expect(userFacingCampusMessage(new CampusServiceError({ operation: "create campus", message: "raw", code: "23505" }))).toBe(
      "A campus with this code already exists. Choose a different code."
    );
    expect(userFacingCampusMessage(new CampusServiceError({ operation: "create campus", message: "raw", code: "42501" }))).toBe(
      "Your account is not allowed to save campuses."
    );
  });

  it("preserves plain Error messages (e.g. client-side validation / duplicate pre-check)", () => {
    expect(userFacingCampusMessage(new Error('A campus with code "TST" already exists. Choose a different code.'))).toBe(
      'A campus with code "TST" already exists. Choose a different code.'
    );
  });

  it("never reveals the raw PostgREST constraint name to users", () => {
    const msg = userFacingCampusMessage(
      new CampusServiceError({
        operation: "create campus",
        message: 'new row violates check constraint "campuses_code_format_check" on table "campuses"',
        code: "23514",
      })
    );
    expect(msg).not.toContain("campuses_code_format_check");
  });

  it("uses lifecycle-specific messages for permanent-delete failures", () => {
    expect(userFacingCampusMessage(new CampusServiceError({
      operation: "permanently delete campus",
      message: "only archived campuses can be permanently deleted",
      code: "22023",
    }))).toBe("Only archived campuses can be permanently deleted.");
    expect(userFacingCampusMessage(new CampusDeletionError({
      stage: "storage_remove_failed",
      operation: "permanently delete campus storage",
      message: "storage denied",
    }))).toContain("stored map files");
    expect(userFacingCampusMessage(new CampusDeletionError({
      stage: "database_delete_failed",
      operation: "permanently delete campus",
      message: "append-only dependency",
      code: "P0001",
    }))).toContain("database dependency");
    expect(userFacingCampusMessage(new CampusDeletionError({
      stage: "database_delete_failed",
      operation: "permanently delete campus",
      message: "protected lifecycle dependency",
      code: "23514",
    }))).toContain("lifecycle dependency");
  });
});

describe("createCampus (create/INSERT boundary)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps the exact insert payload: normalized code, status draft, creator fields, non-zero canvas", async () => {
    const insert = okInsert(campusRow);
    makeClient(insert);

    const created = await createCampus({
      name: "Test Campus",
      code: "  tst  ",
      description: "",
      address: null,
      city: null,
      province: null,
      postal_code: null,
      latitude: null,
      longitude: null,
      logo_path: null,
      overview_image_path: null,
      theme_color: "#1e3a5f",
      canvas_width: 900,
      canvas_height: 680,
      canvas_configured: false,
      map_scale_m_per_unit: 1,
      is_default: false,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Campus",
        code: "TST", // trimmed + uppercased before the INSERT
        status: "draft",
        created_by: "u1",
        updated_by: "u1",
        canvas_width: 900,
        canvas_height: 680,
        map_scale_m_per_unit: 1,
        is_default: false,
      })
    );
    expect(created).toMatchObject({ id: "c1", code: "TST", canvasW: 900, canvasH: 680 });
  });

  it("maps Coming Soon status constraint errors to a visibility-specific message", () => {
    expect(userFacingCampusMessage(new CampusServiceError({
      operation: "create campus",
      message: 'new row for relation "campuses" violates check constraint "campuses_status_check"',
      code: "23514",
      details: "Failing row contains (..., coming_soon, ...).",
    }))).toBe("Could not save the campus visibility setting. Please try again.");
  });

  it("maps the legacy private-draft lifecycle trigger error to a visibility-specific message", () => {
    expect(userFacingCampusMessage(new CampusServiceError({
      operation: "create campus",
      message: "new campuses must begin as private drafts",
      code: "23514",
    }))).toBe("Could not save the campus visibility setting. Please try again.");
  });

  it("creates a Coming Soon row without marking it published", async () => {
    const insert = okInsert({ ...campusRow, status: "coming_soon" });
    makeClient(insert);
    const created = await createCampus({ name: "Annex", code: "ANNEX" }, "coming_soon");

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "coming_soon" }));
    expect(created).toMatchObject({
      lifecycleStatus: "coming_soon",
      publishStatus: "draft",
      visibleToStudents: true,
      buildings: [],
    });
  });

  it("fails fast on an empty code — the Supabase INSERT is never attempted", async () => {
    const insert = vi.fn();
    makeClient(insert);

    await expect(createCampus({ name: "Test Campus", code: "" })).rejects.toThrow(/Campus code is required/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails fast on a code with spaces — the Supabase INSERT is never attempted", async () => {
    const insert = vi.fn();
    makeClient(insert);

    await expect(createCampus({ name: "Test Campus", code: "PLV MAIN" })).rejects.toThrow(/no spaces/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("propagates a Supabase INSERT failure as a CampusServiceError carrying code/details/hint and the operation", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'new row violates check constraint "campuses_code_format_check" on table "campuses"',
        code: "23514",
        details: "Failing row contains (PLV MAIN, ...).",
        hint: null,
      },
    });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    makeClient(insert);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await createCampus({ name: "Test Campus", code: "PLV-MAIN" }).then(() => null, (e: unknown) => e);

    expect(error).toBeInstanceOf(CampusServiceError);
    if (error instanceof CampusServiceError) {
      expect(error.operation).toBe("create campus");
      expect(error.dbCode).toBe("23514");
      expect(error.dbDetails).toContain("Failing row");
      expect(error.message).toContain("campuses_code_format_check");
    }
    // Development diagnostics retain the structured failure.
    expect(consoleError).toHaveBeenCalledWith(
      "[campusService] create campus failed",
      expect.objectContaining({ code: "23514", details: expect.stringContaining("Failing row") })
    );
    consoleError.mockRestore();
  });
});

describe("Coming Soon student metadata", () => {
  it("maps only announcement fields into an empty campus shell", () => {
    const campus = comingSoonCampusFromSummary({
      id: "soon-1", name: "PLV Annex", code: "ANNEX", description: "Opening soon",
      address: "Lingayen", city: "Lingayen", province: "Pangasinan", theme_color: "#123456",
    });
    expect(campus).toMatchObject({
      id: "soon-1", name: "PLV Annex", city: "Lingayen", themeColor: "#123456",
      lifecycleStatus: "coming_soon", publishStatus: "draft", visibleToStudents: true,
      buildings: [], navNodes: [], navEdges: [],
    });
    expect(campus).not.toHaveProperty("logoPath");
  });

  it("loads Coming Soon metadata through the dedicated allowlisted RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "soon-1", name: "PLV Annex", code: "ANNEX", description: null, address: null, city: null, province: null, theme_color: "#1e3a5f" }],
      error: null,
    });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    const campuses = await listComingSoonCampuses();
    expect(rpc).toHaveBeenCalledWith("list_coming_soon_campuses");
    expect(campuses).toHaveLength(1);
    expect(campuses[0].buildings).toEqual([]);
  });
});

describe("updateCampus (versioned update boundary)", () => {
  it("uses the canonical authenticated client/RLS path without an eager getUser lookup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: campusRow, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const update = vi.fn(() => ({ eq: firstEq }));
    const auth = { getUser: vi.fn().mockRejectedValue(new Error("Auth session missing!")) };
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ update })), auth } as never);

    const updated = await updateCampus("c1", { canvas_width: 1200 }, campusRow.updated_at);

    expect(updated).toMatchObject({ id: "c1", canvasW: 900, canvasH: 680 });
    expect(update).toHaveBeenCalledWith({ canvas_width: 1200 });
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});

describe("listCampuses (campus preview summary boundary)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads active campus counts across every page and counts Room metadata/types before hydration", async () => {
    const buildingRows = [
      ...Array.from({ length: 500 }, (_, index) => ({ id: `building-${index}`, campus_id: "c2", archived_at: null })),
      { id: "building-c3", campus_id: "c3", archived_at: null },
      { id: "building-archived", campus_id: "c2", archived_at: "2026-01-01T00:00:00Z" },
    ];
    const floorRows = [
      ...Array.from({ length: 500 }, (_, index) => ({ id: `floor-${index}`, building_id: `building-${index}`, archived_at: null })),
      { id: "floor-c3", building_id: "building-c3", archived_at: null },
      { id: "floor-archived", building_id: "building-0", archived_at: "2026-01-01T00:00:00Z" },
    ];
    const roomRows = [
      ...Array.from({ length: 1000 }, (_, index) => ({
        id: `room-c2-${index}`, campus_id: "c2", building_id: `building-${index % 500}`,
        floor_id: `floor-${index % 500}`, element_type: ["classroom", "laboratory", "office", "room"][index % 4],
        metadata: { kind: "room", ui: {} }, archived_at: null,
      })),
      ...Array.from({ length: 201 }, (_, index) => ({
        id: `room-c3-${index}`, campus_id: "c3", building_id: "building-c3", floor_id: "floor-c3",
        element_type: "laboratory", metadata: { kind: "room", ui: {} }, archived_at: null,
      })),
      { id: "room-archived", campus_id: "c2", building_id: "building-0", floor_id: "floor-0", element_type: "room", metadata: { kind: "room" }, archived_at: "2026-01-01T00:00:00Z" },
      { id: "not-a-room", campus_id: "c2", building_id: "building-0", floor_id: "floor-0", element_type: "door", metadata: { kind: "door" }, archived_at: null },
    ];
    const rowsByTable: Record<string, unknown[]> = { buildings: buildingRows, floors: floorRows, map_elements: roomRows };
    const pagesByTable: Record<string, number[][]> = { buildings: [], floors: [], map_elements: [] };
    const orderByName = vi.fn().mockResolvedValue({
      data: [
        { ...campusRow, id: "c1", name: "Empty Campus", preview_buildings: [] },
        {
          ...campusRow,
          id: "c2",
          name: "Mapped Campus",
          preview_buildings: [
            {
              id: "b1",
              name: "Building One",
              code: "B1",
              category: "academic",
              description: "Saved building",
              x: 10,
              y: 20,
              width: 100,
              height: 80,
              rotation: 15,
              is_visible: true,
              metadata: { ui: { color: "#123456", zOrder: 7 } },
              archived_at: null,
            },
          ],
        },
        {
          ...campusRow,
          id: "c3",
          name: "Second Campus",
          preview_buildings: [],
        },
      ],
      error: null,
    });
    const orderByDefault = vi.fn(() => ({ order: orderByName }));
    const select = vi.fn(() => ({ order: orderByDefault }));
    const pageQuery = (table: string) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.select = vi.fn(() => query);
      query.in = vi.fn(() => query);
      query.is = vi.fn(() => query);
      query.or = vi.fn(() => query);
      query.range = vi.fn((from: number, to: number) => {
        pagesByTable[table].push([from, to]);
        return Promise.resolve({ data: rowsByTable[table].slice(from, to + 1), error: null });
      });
      return query;
    };
    const from = vi.fn((table: string) => {
      if (table === "campuses") return { select };
      if (table === "buildings" || table === "floors" || table === "map_elements") return pageQuery(table);
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const campuses = await listCampuses();

    expect(select).toHaveBeenCalledWith("*, preview_buildings:buildings(id,name,code,category,description,x,y,width,height,rotation,is_visible,metadata,archived_at)");
    expect(pagesByTable.buildings).toEqual([[0, 499], [500, 999]]);
    expect(pagesByTable.floors).toEqual([[0, 499], [500, 999]]);
    expect(pagesByTable.map_elements).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(campuses.map((campus) => ({
      id: campus.id,
      count: campus.previewBuildingCount,
      floors: campus.previewFloorCount,
      rooms: campus.previewRoomCount,
      previewLoaded: campus.previewBuildingsLoaded,
      buildings: campus.buildings.length,
    }))).toEqual([
      { id: "c1", count: 0, floors: 0, rooms: 0, previewLoaded: true, buildings: 0 },
      { id: "c2", count: 500, floors: 500, rooms: 1000, previewLoaded: true, buildings: 1 },
      { id: "c3", count: 1, floors: 1, rooms: 201, previewLoaded: true, buildings: 0 },
    ]);
    expect(campuses[1].buildings[0]).toMatchObject({
      id: "b1",
      color: "#123456",
      rotation: 15,
      floors: [],
    });
  });
});

describe("mergePublishedCampusAppearance (legacy snapshot compatibility)", () => {
  it("fills missing campus appearance from a legacy published structure record", () => {
    const campus = {
      id: "c-green",
      canvasW: 900,
      canvasH: 680,
      buildings: [],
      markers: [],
      paths: [],
      navNodes: [],
      navEdges: [],
      routes: [],
      decorAssets: [],
      settings: {},
    } as unknown as Campus;

    const result = mergePublishedCampusAppearance(campus, {
      map_elements: [{
        element_type: "canvas_appearance",
        metadata: {
          kind: "canvas_appearance",
          ui: {
            canvasGroundMaterial: "grass",
            canvasGroundColor: "#bfd4b8",
            canvasGroundTexture: "subtle",
            canvasColor: "#bfd4b8",
          },
        },
      }],
    });

    expect(result).toMatchObject({
      canvasGroundMaterial: "grass",
      canvasGroundColor: "#bfd4b8",
      canvasGroundTexture: "subtle",
      canvasColor: "#bfd4b8",
    });
  });

  it("keeps current top-level appearance fields ahead of legacy structure values", () => {
    const campus = {
      id: "c-current",
      canvasW: 900,
      canvasH: 680,
      canvasGroundColor: "#123456",
      buildings: [],
      markers: [],
      paths: [],
      navNodes: [],
      navEdges: [],
      routes: [],
      decorAssets: [],
      settings: {},
    } as unknown as Campus;

    const result = mergePublishedCampusAppearance(campus, {
      map_elements: [{
        metadata: {
          kind: "canvas_appearance",
          ui: { canvasGroundColor: "#bfd4b8" },
        },
      }],
    });

    expect(result.canvasGroundColor).toBe("#123456");
  });
});

describe("listPublishedCampusSnapshots (student snapshot boundary)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hydrates the configured campus appearance before returning a published snapshot", async () => {
    const snapshot = {
      campus: {
        id: "c-published",
        canvasW: 900,
        canvasH: 680,
        buildings: [],
        markers: [],
        paths: [],
        navNodes: [],
        navEdges: [],
        routes: [],
        decorAssets: [],
        settings: {},
      },
      structure: {
        map_elements: [{
          element_type: "canvas_appearance",
          metadata: { ui: { canvasGroundMaterial: "grass", canvasGroundColor: "#bfd4b8" } },
        }],
      },
    };
    const order = vi.fn().mockResolvedValue({
      data: [{ snapshot, published_at: "2026-09-14T00:00:00Z" }],
      error: null,
    });

    vi.mocked(getSupabase).mockReturnValue({
      rpc: order,
    } as never);

    const campuses = await listPublishedCampusSnapshots();

    expect(order).toHaveBeenCalledWith("list_event_safe_published_campuses");
    expect(campuses[0].eventOverlays).toEqual([]);
    expect(campuses[0]).toMatchObject({
      id: "c-published",
      canvasGroundMaterial: "grass",
      canvasGroundColor: "#bfd4b8",
      publishStatus: "published",
      visibleToStudents: true,
    });
  });
});

describe("permanentlyDeleteCampus (Storage API + authoritative RPC boundary)", () => {
  beforeEach(() => vi.clearAllMocks());

  type SupabaseTestError = { message: string; code?: string; details?: string | null; hint?: string | null };
  type StorageEntries = Record<string, Array<{ name: string; id?: string | null }>>;

  function makeDeleteClient(options: {
    status?: string;
    rpcResult?: { data: unknown; error: null | SupabaseTestError };
    lists?: Record<string, StorageEntries>;
    listError?: SupabaseTestError;
    removeError?: SupabaseTestError;
  } = {}) {
    const rpc = vi.fn().mockResolvedValue(options.rpcResult ?? { data: { deleted: true }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: options.status === undefined ? { status: "archived" } : { status: options.status },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table !== "campuses") throw new Error(`unexpected table ${table}`);
      return { select };
    });
    const list = vi.fn();
    const remove = vi.fn().mockImplementation(async () => ({ data: [], error: options.removeError ?? null }));
    const storageFrom = vi.fn((bucket: string) => ({
      list: vi.fn().mockImplementation(async (prefix: string) => {
        list(bucket, prefix);
        return { data: options.lists?.[bucket]?.[prefix] ?? [], error: options.listError ?? null };
      }),
      remove: vi.fn().mockImplementation(async (paths: string[]) => {
        remove(paths);
        return { data: [], error: options.removeError ?? null };
      }),
    }));
    vi.mocked(getSupabase).mockReturnValue({ from, storage: { from: storageFrom }, rpc } as never);
    return { rpc, from, storageFrom, list, remove };
  }

  it("calls the single database-owned delete contract after Storage API cleanup", async () => {
    const client = makeDeleteClient({
      lists: {
        "campus-images": { "campus-archived": [{ name: "logo.png", id: "image-1" }] },
        "floor-plans": {
          "campus-archived": [{ name: "building-1", id: null }],
          "campus-archived/building-1": [{ name: "floor-1", id: null }],
          "campus-archived/building-1/floor-1": [{ name: "plan.png", id: "plan-1" }],
        },
      },
    });

    await permanentlyDeleteCampus("campus-archived");

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("permanently_delete_campus", {
      target_campus_id: "campus-archived",
    });
    expect(client.remove).toHaveBeenCalledWith(["campus-archived/logo.png"]);
    expect(client.remove).toHaveBeenCalledWith(["campus-archived/building-1/floor-1/plan.png"]);
  });

  it("lists and removes nested campus files through the Storage API", async () => {
    const client = makeDeleteClient({
      lists: {
        "campus-images": { "campus-1": [{ name: "a", id: "a" }] },
        "floor-plans": {
          "campus-1": [{ name: "building", id: null }],
          "campus-1/building": [{ name: "floor", id: null }],
          "campus-1/building/floor": [{ name: "plan.pdf", id: "p" }],
        },
      },
    });

    await cleanupCampusStorage("campus-1");

    expect(client.storageFrom).toHaveBeenCalledWith("campus-images");
    expect(client.storageFrom).toHaveBeenCalledWith("floor-plans");
    expect(client.remove).toHaveBeenCalledWith(["campus-1/a"]);
    expect(client.remove).toHaveBeenCalledWith(["campus-1/building/floor/plan.pdf"]);
  });

  it("rejects a non-archived campus before touching Storage or the RPC", async () => {
    const client = makeDeleteClient({ status: "draft" });

    await expect(permanentlyDeleteCampus("campus-active")).rejects.toThrow(/Only archived campuses/);
    await expect(permanentlyDeleteCampus("campus-active")).rejects.toMatchObject({ stage: "invalid_lifecycle_state" });
    expect(client.list).not.toHaveBeenCalled();
    expect(client.remove).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("does not call the RPC when Storage listing fails", async () => {
    const client = makeDeleteClient({ listError: { message: "storage unavailable" } });

    await expect(permanentlyDeleteCampus("campus-archived")).rejects.toMatchObject({
      operation: "permanently delete campus storage (campus-images)",
      stage: "storage_list_failed",
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(userFacingCampusMessage(new CampusServiceError({
      operation: "permanently delete campus storage (campus-images)",
      message: "storage unavailable",
    }))).toBe("Campus files could not be removed. The campus was not deleted.");
  });

  it("does not call the RPC when Storage removal fails", async () => {
    const client = makeDeleteClient({
      lists: { "campus-images": { "campus-archived": [{ name: "logo.png", id: "image-1" }] } },
      removeError: { message: "remove denied", code: "storage_error" },
    });

    await expect(permanentlyDeleteCampus("campus-archived")).rejects.toMatchObject({
      operation: "permanently delete campus storage (campus-images)",
      stage: "storage_remove_failed",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("surfaces an RPC failure after Storage cleanup without claiming success", async () => {
    const client = makeDeleteClient({
      lists: { "campus-images": { "campus-archived": [{ name: "logo.png", id: "image-1" }] } },
      rpcResult: { data: null, error: { message: "database unavailable", code: "XX000" } },
    });

    await expect(permanentlyDeleteCampus("campus-archived")).rejects.toMatchObject({
      operation: "permanently delete campus",
      dbCode: "XX000",
      stage: "database_delete_failed",
    });
    expect(client.remove).toHaveBeenCalledWith(["campus-archived/logo.png"]);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("calls the RPC when no campus files exist", async () => {
    const client = makeDeleteClient();

    await permanentlyDeleteCampus("campus-archived");

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("permanently_delete_campus", {
      target_campus_id: "campus-archived",
    });
  });

  it("surfaces the real RPC failure and does not report success", async () => {
    const client = makeDeleteClient({ status: "archived", rpcResult: {
      data: null,
      error: { message: "only archived campuses can be permanently deleted", code: "22023", details: null, hint: null },
    } });
    const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(permanentlyDeleteCampus("campus-active")).rejects.toMatchObject({
      operation: "permanently delete campus",
      dbCode: "22023",
    });

    expect(client.rpc).toHaveBeenCalledTimes(1);
    diagnostics.mockRestore();
  });

  it("rejects an RPC response without the database confirmation", async () => {
    makeDeleteClient({ rpcResult: { data: null, error: null } });

    await expect(permanentlyDeleteCampus("campus-archived")).rejects.toThrow(/authoritative confirmation/);
  });
});

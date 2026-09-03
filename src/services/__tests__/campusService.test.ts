import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import {
  CampusDeletionError,
  CampusServiceError,
  cleanupCampusStorage,
  createCampus,
  listCampuses,
  normalizeCampusCode,
  permanentlyDeleteCampus,
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
      "Some campus details don't meet the required format. Check the code, name, and coordinates."
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

describe("listCampuses (campus preview summary boundary)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries persisted lightweight building footprints and maps them without full structure hydration", async () => {
    const floorRows = [
      { id: "f1", archived_at: null, buildings: { campus_id: "c2" } },
      { id: "f2", archived_at: null, buildings: { campus_id: "c2" } },
      { id: "f3", archived_at: null, buildings: { campus_id: "c3" } },
    ];
    const roomRows = [
      { id: "r1", campus_id: "c2", element_type: "room", archived_at: null },
      { id: "r2", campus_id: "c2", element_type: "room", archived_at: null },
      { id: "r3", campus_id: "c3", element_type: "room", archived_at: null },
    ];
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
    const floorIs = vi.fn().mockResolvedValue({ data: floorRows, error: null });
    const floorIn = vi.fn(() => ({ is: floorIs }));
    const floorSelect = vi.fn(() => ({ in: floorIn }));
    const roomIs = vi.fn().mockResolvedValue({ data: roomRows, error: null });
    const roomEq = vi.fn(() => ({ is: roomIs }));
    const roomIn = vi.fn(() => ({ eq: roomEq }));
    const roomSelect = vi.fn(() => ({ in: roomIn }));
    const from = vi.fn((table: string) => {
      if (table === "campuses") return { select };
      if (table === "floors") return { select: floorSelect };
      if (table === "map_elements") return { select: roomSelect };
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const campuses = await listCampuses();

    expect(select).toHaveBeenCalledWith("*, preview_buildings:buildings(id,name,code,category,description,x,y,width,height,rotation,is_visible,metadata,archived_at)");
    expect(floorSelect).toHaveBeenCalledWith("id,archived_at,buildings!inner(campus_id)");
    expect(floorIn).toHaveBeenCalledWith("buildings.campus_id", ["c1", "c2", "c3"]);
    expect(roomSelect).toHaveBeenCalledWith("id,campus_id,element_type,archived_at");
    expect(roomIn).toHaveBeenCalledWith("campus_id", ["c1", "c2", "c3"]);
    expect(roomEq).toHaveBeenCalledWith("element_type", "room");
    expect(campuses.map((campus) => ({
      id: campus.id,
      count: campus.previewBuildingCount,
      floors: campus.previewFloorCount,
      rooms: campus.previewRoomCount,
      previewLoaded: campus.previewBuildingsLoaded,
      buildings: campus.buildings.length,
    }))).toEqual([
      { id: "c1", count: 0, floors: 0, rooms: 0, previewLoaded: true, buildings: 0 },
      { id: "c2", count: 1, floors: 2, rooms: 2, previewLoaded: true, buildings: 1 },
      { id: "c3", count: 0, floors: 1, rooms: 1, previewLoaded: true, buildings: 0 },
    ]);
    expect(campuses[1].buildings[0]).toMatchObject({
      id: "b1",
      color: "#123456",
      rotation: 15,
      floors: [],
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

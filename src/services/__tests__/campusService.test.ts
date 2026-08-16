import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { CampusServiceError, createCampus, listCampuses, normalizeCampusCode, userFacingCampusMessage } from "../campusService";

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

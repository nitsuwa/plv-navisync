import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "sonner";
import type { Campus } from "../../components/map-builder/types";

// ── Mock the service boundary (the handlers themselves stay real) ──────────
vi.mock("../../services/campusService", () => ({
  CampusConflictError: class extends Error {
    name = "CampusConflictError";
  },
  userFacingCampusMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong."),
  campusService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    permanentlyDelete: vi.fn(),
    getById: vi.fn(),
    selectActive: vi.fn(),
    listVersions: vi.fn(),
    validateImage: vi.fn(),
    uploadImage: vi.fn(),
  },
}));

vi.mock("../../services/campusStructureService", () => ({
  campusStructureService: { save: vi.fn(), load: vi.fn() },
}));

// Leaflet map wrapper and lazy color picker are pure UI — keep jsdom hermetic.
vi.mock("../../components/ui/MapPicker", () => ({
  MapPicker: () => <div data-testid="map-picker-mock" />,
}));

vi.mock("../../components/ui/ColorPicker", () => {
  const MockColorPicker = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
    <input aria-label="theme color" value={value} onChange={(e) => onChange(e.target.value)} />
  );
  return { default: MockColorPicker, ColorPicker: MockColorPicker };
});

import { campusService } from "../../services/campusService";
import { campusStructureService } from "../../services/campusStructureService";
import { AdminMapBuilderPage } from "../AdminMapBuilderPage";

function makeCampus(over: Partial<Campus> = {}): Campus {
  return {
    id: "campus-1",
    name: "Main Campus",
    code: "MAIN",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    themeColor: "#1e3a5f",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900,
    canvasH: 680,
    canvasConfigured: false,
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    routes: [],
    accessibilityFeatures: [],
    assemblyPoints: [],
    eventOverlays: [],
    decorAssets: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    createdBy: "Admin",
    databaseUpdatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: false,
    lifecycleStatus: "draft",
    ...over,
  };
}

function makePreviewBuilding(id = "b1") {
  return {
    id,
    name: `Building ${id}`,
    code: id.toUpperCase(),
    category: "Academic",
    description: "",
    x: id === "b1" ? 100 : 260,
    y: id === "b1" ? 100 : 180,
    width: 120,
    height: 80,
    color: "#1e40af",
    floors: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // sonner's toast store is module-global — clear it so a toast from a previous
  // test can never leak into this test's DOM assertions.
  toast.dismiss();
});

beforeAll(() => {
  // jsdom has no scrollIntoView; the wizard's validation scrolls to the first
  // invalid field when Continue is blocked.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderPage() {
  return render(
    <>
      <Toaster position="top-center" />
      <AdminMapBuilderPage />
    </>,
  );
}

/** Flush pending microtasks (service promises) via act. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Click Continue and assert the next step heading rendered synchronously. */
async function clickContinueAndExpect(nextHeading: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  expect(screen.getByRole("heading", { name: nextHeading })).toBeInTheDocument();
}

/** Fill step 1, continue through steps 2-3, land on the review heading. */
async function walkWizardToReview(name: string, code: string, reviewHeading: string) {
  fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/campus code/i), { target: { value: code } });
  await clickContinueAndExpect("Campus Location");
  await clickContinueAndExpect("Campus Appearance");
  await clickContinueAndExpect(reviewHeading);
}

/** Let the awaited save flow and following state transition finish. */
async function completeSave() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AdminMapBuilderPage — campus lifecycle", () => {
  it("PREVIEW: initial campus list shows persisted building count and visual thumbnail without opening the campus", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampus({ id: "campus-empty", name: "Empty Campus", code: "EMPTY", canvasConfigured: true, buildings: [], previewBuildingCount: 0 }),
      makeCampus({
        id: "campus-mapped",
        name: "Mapped Campus",
        code: "MAP",
        canvasConfigured: true,
        buildings: [makePreviewBuilding("b1"), makePreviewBuilding("b2")],
        previewBuildingCount: 2,
        previewFloorCount: 5,
        previewRoomCount: 14,
        previewBuildingsLoaded: true,
      }),
      makeCampus({
        id: "campus-second",
        name: "Second Campus",
        code: "SEC",
        canvasConfigured: true,
        buildings: [makePreviewBuilding("b3")],
        previewBuildingCount: 1,
        previewFloorCount: 2,
        previewRoomCount: 3,
        previewBuildingsLoaded: true,
      }),
    ]);

    renderPage();
    expect(screen.queryByText("No buildings yet")).not.toBeInTheDocument();
    await flush();

    expect(screen.getByText("Mapped Campus")).toBeInTheDocument();
    expect((await screen.findAllByTestId("campus-mini-map")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("Buildings: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Floors: 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Rooms: 14")).toBeInTheDocument();
    expect(screen.getByLabelText("Buildings: 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Floors: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Rooms: 3")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Markers: 0").length).toBeGreaterThan(0);
    fireEvent.mouseEnter(screen.getByLabelText("Buildings: 2"));
    expect(screen.getAllByText("Buildings: 2").length).toBeGreaterThan(0);
    expect(campusStructureService.load).not.toHaveBeenCalled();
    expect(screen.getByText("No buildings yet")).toBeInTheDocument();
  });

  it("PREVIEW: positive building count never renders the false empty state while geometry is unavailable", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampus({ id: "campus-mapped", name: "Mapped Campus", code: "MAP", canvasConfigured: true, buildings: [], previewBuildingCount: 5 }),
    ]);

    renderPage();
    await flush();

    expect(screen.getByText("5 buildings mapped")).toBeInTheDocument();
    expect(screen.queryByText("No buildings yet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("campus-mini-map")).not.toBeInTheDocument();
  });

  it("PREVIEW: opening and returning from a campus does not change the list count merely because hydration happened", async () => {
    const lightweightCampus = makeCampus({
      canvasConfigured: true,
      buildings: [makePreviewBuilding("b1"), makePreviewBuilding("b2")],
      previewBuildingCount: 2,
      previewBuildingsLoaded: true,
    });
    const hydratedCampus = makeCampus({
      ...lightweightCampus,
      previewBuildingCount: undefined,
      buildings: [{
        id: "b1",
        name: "Only Hydrated Building",
        code: "B1",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 120,
        height: 80,
        color: "#1e40af",
        floors: [],
      }],
    });
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([lightweightCampus]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockResolvedValue(hydratedCampus);

    renderPage();
    await flush();
    expect(await screen.findByTestId("campus-mini-map")).toBeInTheDocument();
    expect(screen.getByLabelText("Buildings: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open editor/i }));
    fireEvent.click(await screen.findByTitle("Back to campus list"));

    expect(await screen.findByRole("heading", { name: "Campus Management" })).toBeInTheDocument();
    expect(await screen.findByTestId("campus-mini-map")).toBeInTheDocument();
    expect(screen.getByLabelText("Buildings: 2")).toBeInTheDocument();
    expect(screen.queryByText("No buildings yet")).not.toBeInTheDocument();
  });

  it("PREVIEW: metadata-only updates preserve hydrated buildings so the campus card does not show No buildings yet", async () => {
    const buildingCampus = makeCampus({
      canvasConfigured: true,
      buildings: [{
        id: "b1",
        name: "Building One",
        code: "B1",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 120,
        height: 80,
        color: "#1e40af",
        floors: [],
      }],
    });
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([buildingCampus]);
    (campusService.update as ReturnType<typeof vi.fn>).mockResolvedValue(makeCampus({
      id: buildingCampus.id,
      name: "Main Campus Renamed",
      code: buildingCampus.code,
      canvasConfigured: true,
      buildings: [],
    }));
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockResolvedValue(buildingCampus);

    renderPage();
    await flush();
    expect(screen.queryByText("No buildings yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Main Campus Renamed" } });
    await clickContinueAndExpect("Campus Location");
    await clickContinueAndExpect("Campus Appearance");
    await clickContinueAndExpect("Review & Save");
    fireEvent.click(screen.getByRole("button", { name: /^save changes$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, save changes/i }));
    await completeSave();

    expect(screen.getByRole("heading", { name: "Campus Management" })).toBeInTheDocument();
    expect(screen.getAllByText("Main Campus Renamed").length).toBeGreaterThan(0);
    expect(screen.queryByText("No buildings yet")).not.toBeInTheDocument();
  }, 10_000);

  it("PREVIEW: metadata-only updates preserve the persisted count before editor hydration", async () => {
    const lightweightCampus = makeCampus({
      canvasConfigured: true,
      buildings: [makePreviewBuilding("b1"), makePreviewBuilding("b2")],
      previewBuildingCount: 2,
      previewBuildingsLoaded: true,
    });
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([lightweightCampus]);
    (campusService.update as ReturnType<typeof vi.fn>).mockResolvedValue(makeCampus({
      id: lightweightCampus.id,
      name: "Main Campus Renamed",
      code: lightweightCampus.code,
      canvasConfigured: true,
      buildings: [],
    }));

    renderPage();
    await flush();
    expect(await screen.findByTestId("campus-mini-map")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Main Campus Renamed" } });
    await clickContinueAndExpect("Campus Location");
    await clickContinueAndExpect("Campus Appearance");
    await clickContinueAndExpect("Review & Save");
    fireEvent.click(screen.getByRole("button", { name: /^save changes$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, save changes/i }));
    await completeSave();

    expect(screen.getByRole("heading", { name: "Campus Management" })).toBeInTheDocument();
    expect(await screen.findByTestId("campus-mini-map")).toBeInTheDocument();
    expect(screen.getByLabelText("Buildings: 2")).toBeInTheDocument();
    expect(screen.queryByText("No buildings yet")).not.toBeInTheDocument();
  }, 10_000);

  it("CANVAS SETTINGS: appearance-only updates use the canonical structure save without a campus-row auth lookup", async () => {
    const campus = makeCampus({ canvasConfigured: true });
    const hydrated = { ...campus, previewBuildingsLoaded: true };
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([campus]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockResolvedValue(hydrated);
    (campusStructureService.save as ReturnType<typeof vi.fn>).mockImplementation(async (candidate: Campus) => candidate);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /open editor/i }));
    fireEvent.click(await screen.findByTestId("canvas-settings-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: /more canvas settings/i }));

    fireEvent.change(screen.getByRole("combobox", { name: "Ground material" }), { target: { value: "grass" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(campusStructureService.save).toHaveBeenCalledTimes(1));
    expect(campusService.update).not.toHaveBeenCalled();
    expect(campusStructureService.save).toHaveBeenCalledWith(expect.objectContaining({
      canvasGroundMaterial: "grass",
      canvasConfigured: true,
      buildings: hydrated.buildings,
      paths: hydrated.paths,
    }));
  });

  it("CREATE: New Campus opens the wizard; completing it calls campusService.create exactly once with valid non-zero canvas dims and lands on success", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const created = makeCampus({ id: "campus-new", name: "Test Campus", code: "TST" });
    (campusService.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    renderPage();
    await flush();

    // Home empty state renders with the Create CTA
    expect(screen.getByText("No campuses yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();

    await walkWizardToReview("Test Campus", "TST", "Review & Create");

    fireEvent.click(screen.getByRole("button", { name: /^create campus$/i }));
    // Confirmation dialog
    fireEvent.click(screen.getByRole("button", { name: /yes, save changes/i }));
    await completeSave();

    expect(campusService.create).toHaveBeenCalledTimes(1);
    const payload = (campusService.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // NOTE: `status: "draft"` is added inside the real createCampus service —
    // it is not part of the client payload.
    expect(payload).toMatchObject({
      name: "Test Campus",
      code: "TST",
      canvas_width: 900,
      canvas_height: 680,
    });
    expect(payload.canvas_width).toBeGreaterThan(0);
    expect(payload.canvas_height).toBeGreaterThan(0);

    // Success screen renders after the animated home view exits and names the campus
    expect(await screen.findByRole("heading", { name: /campus created successfully/i })).toBeInTheDocument();
    expect(screen.getAllByText("Test Campus").length).toBeGreaterThan(0);
  }, 10_000);

  it("CREATE: an empty campus code is blocked by the wizard — create is never called (DB requires a non-empty code)", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));

    // Name only; the code field is left blank.
    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Test Campus" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(screen.getByText(/campus code is required/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();
    expect(campusService.create).not.toHaveBeenCalled();
  });

  it("CREATE: a campus code with spaces is blocked by the wizard — create is never called (DB format check forbids spaces)", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));

    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Test Campus" } });
    fireEvent.change(screen.getByLabelText(/campus code/i), { target: { value: "PLV MAIN" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(screen.getByText(/no spaces/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();
    expect(campusService.create).not.toHaveBeenCalled();
  });

  it("CREATE: a duplicate campus code is rejected before the service call with a clear message — no duplicate insert", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus({ code: "TST" })]);

    renderPage();
    await flush();
    expect(screen.getByText("Main Campus")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));
    await walkWizardToReview("Second Campus", "tst", "Review & Create");
    fireEvent.click(screen.getByRole("button", { name: /^create campus$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, save changes/i }));
    await completeSave();

    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(campusService.create).not.toHaveBeenCalled();
    // The wizard stays open so the user can correct the code.
    expect(screen.getByRole("heading", { name: "Review & Create" })).toBeInTheDocument();
  });

  it("CREATE: a failing save keeps the wizard open, preserves the entered values, and surfaces an error — no duplicate create", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (campusService.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("RLS rejected"));

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));
    await walkWizardToReview("Fail Campus", "FLC", "Review & Create");
    fireEvent.click(screen.getByRole("button", { name: /^create campus$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, save changes/i }));
    await completeSave();

    // Error surfaced via toast; wizard still open (Review step); values preserved
    expect(screen.getByText(/could not save campus/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review & Create" })).toBeInTheDocument();
    expect(screen.getAllByText("Fail Campus").length).toBeGreaterThan(0);
    expect(campusService.create).toHaveBeenCalledTimes(1);
  });

  it("EDIT: changing the name and saving calls campusService.update with the campus id + expectedUpdatedAt exactly once and refreshes the list", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus()]);
    const updated = makeCampus({ name: "Main Campus Renamed" });
    (campusService.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    renderPage();
    await flush();
    expect(screen.getByText("Main Campus")).toBeInTheDocument();

    // Open the QuickActions menu on the campus card, then Edit Details
    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));

    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/campus name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Main Campus");

    fireEvent.change(nameInput, { target: { value: "Main Campus Renamed" } });
    await clickContinueAndExpect("Campus Location");
    await clickContinueAndExpect("Campus Appearance");
    await clickContinueAndExpect("Review & Save");

    fireEvent.click(screen.getByRole("button", { name: /^save changes$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, save changes/i }));
    await completeSave();

    expect(campusService.update).toHaveBeenCalledTimes(1);
    const [id, input, expectedUpdatedAt] = (campusService.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe("campus-1");
    expect(input).toMatchObject({ name: "Main Campus Renamed" });
    expect(expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");

    // Returns to the campus-management list showing the updated name
    expect(screen.getByRole("heading", { name: "Campus Management" })).toBeInTheDocument();
    expect(screen.getAllByText("Main Campus Renamed").length).toBeGreaterThan(0);
  });

  it("EDIT: a no-change save is blocked — Save Changes stays disabled until a meaningful field changes, and update is never called", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus()]);
    (campusService.update as ReturnType<typeof vi.fn>).mockResolvedValue(makeCampus());

    renderPage();
    await flush();
    expect(screen.getByText("Main Campus")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();

    // Walk to review WITHOUT changing anything
    await clickContinueAndExpect("Campus Location");
    await clickContinueAndExpect("Campus Appearance");
    await clickContinueAndExpect("Review & Save");

    const saveBtn = screen.getByRole("button", { name: /save changes/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(campusService.update).not.toHaveBeenCalled();

    // Jump back to the identity step (first summary-card Edit button), change the name → enabled
    fireEvent.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Main Campus v2" } });
    await clickContinueAndExpect("Campus Location");
    await clickContinueAndExpect("Campus Appearance");
    await clickContinueAndExpect("Review & Save");

    const saveBtn2 = screen.getByRole("button", { name: /save changes/i }) as HTMLButtonElement;
    expect(saveBtn2.disabled).toBe(false);
    expect(campusService.update).not.toHaveBeenCalled(); // no write until the user actually saves
  });

  it("EDIT: dirty state — a changed field triggers the unsaved-changes dialog on close; reverting clears it", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus()]);
    (campusService.update as ReturnType<typeof vi.fn>).mockResolvedValue(makeCampus());

    renderPage();
    await flush();
    expect(screen.getByText("Main Campus")).toBeInTheDocument();

    // Open edit wizard
    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/campus name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Changed Name" } });

    // Close (X button) with changes → unsaved dialog appears
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // Keep editing → revert name to original → close → no dialog
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    const input2 = screen.getByLabelText(/campus name/i) as HTMLInputElement;
    fireEvent.change(input2, { target: { value: "Main Campus" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("CREATE: X closes an untouched wizard immediately", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));
    expect(screen.getByRole("heading", { name: "Campus Identity" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { name: "Campus Identity" })).not.toBeInTheDocument();
    expect(screen.getByText("No campuses yet")).toBeInTheDocument();
  });

  it("CREATE: X with dirty fields shows unsaved confirmation; Keep Editing preserves values; Discard closes", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));
    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Draft Campus" } });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect((screen.getByLabelText(/campus name/i) as HTMLInputElement).value).toBe("Draft Campus");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(screen.queryByRole("heading", { name: "Campus Identity" })).not.toBeInTheDocument();
    expect(campusService.create).not.toHaveBeenCalled();
  });

  it("CREATE: Cancel follows the same dirty confirmation path as X", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /new campus/i }));
    fireEvent.change(screen.getByLabelText(/campus code/i), { target: { value: "DRAFT" } });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect((screen.getByLabelText(/campus code/i) as HTMLInputElement).value).toBe("DRAFT");
  });

  it("EDIT: X closes unchanged details immediately, and dirty Discard closes without update", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus()]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { name: "Campus Identity" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campus Management" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    fireEvent.change(screen.getByLabelText(/campus name/i), { target: { value: "Changed Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(screen.queryByRole("heading", { name: "Campus Identity" })).not.toBeInTheDocument();
    expect(campusService.update).not.toHaveBeenCalled();
  });

  it("MENU: Edit Details closes the overflow layer, so the wizard X still receives clicks", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus()]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    expect(screen.getByRole("menuitem", { name: /edit details/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));

    expect(screen.queryByRole("menuitem", { name: /edit details/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("heading", { name: "Campus Management" })).toBeInTheDocument();
  });

  it("MENU: active campus lifecycle actions match docs — Archive is present and Delete Campus is absent", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampus()]);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));

    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete campus/i })).not.toBeInTheDocument();
  });

  it("DUPLICATE: saves a real draft structure and refreshes the authoritative campus list", async () => {
    const source = makeCampus({ canvasConfigured: true });
    const copy = makeCampus({ id: "campus-copy", name: "Main Campus (Copy)", code: "MAIN-CP", canvasConfigured: true });
    (campusService.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([source, copy]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockResolvedValue(source);
    (campusService.create as ReturnType<typeof vi.fn>).mockResolvedValue(copy);
    (campusStructureService.save as ReturnType<typeof vi.fn>).mockResolvedValue(copy);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /actions for main campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /duplicate campus/i }));
    fireEvent.click(screen.getByRole("button", { name: /^duplicate$/i }));

    await waitFor(() => expect(campusStructureService.save).toHaveBeenCalled());
    await waitFor(() => expect(campusService.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Main Campus (Copy)")).toBeInTheDocument();
    expect(campusService.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Main Campus (Copy)", code: "MAIN-CP", is_default: false }));
  });

  it("DELETE: archived campus calls the authoritative RPC service and refreshes the list", async () => {
    const archived = makeCampus({ id: "campus-archived", name: "Archived Campus", status: "archived", lifecycleStatus: "archived" });
    (campusService.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([archived])
      .mockResolvedValueOnce([]);
    (campusService.permanentlyDelete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /actions for archived campus/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete permanently/i }));
    const dialog = screen.getByRole("dialog", { name: /permanently delete this campus/i });
    fireEvent.change(screen.getByRole("textbox", { name: /type archived campus to confirm/i }), { target: { value: "Archived Campus" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /delete permanently/i }));

    await waitFor(() => expect(campusService.permanentlyDelete).toHaveBeenCalledWith("campus-archived"));
    await waitFor(() => expect(campusService.list).toHaveBeenCalledTimes(2));
  });
});

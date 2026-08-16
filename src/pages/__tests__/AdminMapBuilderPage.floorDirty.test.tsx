import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "sonner";
import type { Campus, FloorPlan } from "../../components/map-builder/types";
import { normalizeFloor } from "../../lib/floorPlanNormalization";

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

vi.mock("../../services/campusPublishingService", () => ({
  campusPublishingService: { saveDraft: vi.fn(), publish: vi.fn(), archive: vi.fn() },
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
import { campusPublishingService } from "../../services/campusPublishingService";
import { AdminMapBuilderPage } from "../AdminMapBuilderPage";

// ── Fixtures — floors are built through normalizeFloor so they are canonical ──

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
    canvasConfigured: true,
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

function makeFloor(id: string, label: string, number: number, over: Partial<FloorPlan> = {}): FloorPlan {
  return normalizeFloor(
    { id, buildingId: "b1", number, label, canvasW: 600, canvasH: 450, ...over },
    { buildingId: "b1" },
  );
}

function makeCampusWithFloors(floors: FloorPlan[], over: Partial<Campus> = {}): Campus {
  return makeCampus({
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
      expanded: true,
      // A General primary entrance so the campus passes `validateCampusData`
      // (otherwise the outer Save aborts with a validation dialog).
      entrances: [{ id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true, accessible: false }],
      floors,
    }],
    ...over,
  });
}

const labelFloor = makeFloor("f1", "Ground Floor", 1, {
  labels: [{ id: "lb1", x: 40, y: 40, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  (campusPublishingService.saveDraft as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => ({
    campus: c, versionId: "draft-version", versionNumber: 1, versionUpdatedAt: c.databaseUpdatedAt,
  }));
  toast.dismiss();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

beforeAll(() => {
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

/**
 * Click `getTarget()` repeatedly (re-querying each time) until `appears()` is
 * true. The editors re-render right after mount (validation/overlap effects),
 * which can detach a node between a single query and its click under parallel
 * load — clicking a detached node silently does nothing. Re-querying per click
 * makes navigation deterministic instead of racing that re-render.
 *
 * A plain bounded loop is used instead of waitFor's retry-on-throw because
 * dispatching clicks inside waitFor can starve React's batched updates.
 */
async function clickUntil(appears: () => boolean, getTarget: () => HTMLElement, timeout = 20000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (appears()) return;
    if (Date.now() > deadline) {
      throw new Error(`clickUntil timed out after ${timeout}ms (target never appeared)`);
    }
    let el: HTMLElement | null = null;
    try {
      el = getTarget();
    } catch {
      // Target not rendered yet — keep polling.
    }
    if (el) fireEvent.click(el);
    // Yield to React so the navigation render can commit between attempts.
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
}

/** Home → open the campus editor (hydration resolves) and wait for it to mount. */
async function openCampusEditor() {
  await clickUntil(
    () => screen.queryByTitle("Back to campus list") !== null,
    () => screen.getByRole("button", { name: /open editor/i }),
  );
  await screen.findByTitle("Back to campus list", {}, { timeout: 20000 });
}

/** Click a floor row in the hierarchy and wait for the Floor Editor toolbar. */
async function openFloor(rowLabel: string) {
  // The row's accessible name starts with its label (e.g. "Ground Floor0R");
  // anchoring excludes the row's `Floor actions: <label>` button. "More tools"
  // only exists in the Floor Editor toolbar, so it is a reliable mount signal
  // (the hierarchy row `...` button shares the title "Floor actions").
  await clickUntil(
    () => screen.queryByRole("button", { name: "More tools" }) !== null,
    () => screen.getByRole("button", { name: new RegExp(`^${rowLabel}`) }),
  );
  await screen.findByRole("button", { name: "More tools" }, {}, { timeout: 20000 });
}

/** Floor Editor breadcrumb → back to the outdoor editor; wait for its Save button. */
async function backToCampus() {
  // The shared unsaved-changes guard now prompts when the floor has pending
  // edits — resolve it by persisting (Save Changes) so the edits propagate to
  // the campus draft, then wait for the outdoor editor.
  const deadline = Date.now() + 20000;
  for (;;) {
    if (screen.queryByTitle("Back to campus list") !== null) break;
    if (Date.now() > deadline) throw new Error("backToCampus timed out waiting for the campus editor");
    // Scope to the guard dialog so a co-located "Save Changes" (e.g. the
    // Floor Settings dialog) can never shadow the guard's own button.
    const guardDialog = screen.queryByRole("dialog", { name: "Unsaved Floor Changes" });
    if (guardDialog) {
      const saveChanges = within(guardDialog).queryByRole("button", { name: /Save Changes/i });
      if (saveChanges) fireEvent.click(saveChanges);
      // While the modal is open, never re-click the breadcrumb underneath.
    } else {
      const back = screen.queryByRole("button", { name: "Main Campus" });
      if (back) fireEvent.click(back);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  // The Floor Editor exits through an animated transition; its own Save button
  // stays mounted while exiting, so wait for a control that only exists in the
  // outdoor CampusEditor before asserting on the outer Save state.
  await screen.findByTitle("Back to campus list", {}, { timeout: 20000 });
  await screen.findByRole("button", { name: /^(Save|Saved)$/ }, {}, { timeout: 20000 });
}

function stubFloorSvg(container: HTMLElement, w = 600, h = 450): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`,
  ) as SVGSVGElement;
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.parentElement!, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

// ── Tests ───────────────────────────────────────────────────────────────────

// Each case drives several animated view transitions + hydration round-trips;
// under parallel load a plain 5s default can be exceeded, so 20s is used.
describe("AdminMapBuilderPage — B4 floor dirty-state integration", () => {
  it("adding a floor in the Floor Editor enables the outer Save, which then persists and clears dirty state", async () => {
    const original = makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)]);
    let persisted: Campus | null = null;
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([original]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);
    (campusPublishingService.saveDraft as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => {
      persisted = { ...c, updatedAt: "2026-01-02T00:00:00.000Z" };
      return { campus: persisted, versionId: "draft-version", versionNumber: 1, versionUpdatedAt: persisted.databaseUpdatedAt };
    });

    renderPage();
    await flush();
    await openCampusEditor();

    // No edits yet → outer Save disabled (label shows "Saved").
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();

    await openFloor("Ground Floor");
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    // Wait for the floor switch transition to finish (the new floor's editor
    // mounts after the old one exits) before leaving.
    await screen.findByTitle("Floor 2", {}, { timeout: 20000 });
    await flush();
    // Leaving the Floor Editor with the unsaved new floor prompts the shared
    // guard; backToCampus resolves it with Save Changes, which persists the
    // floor change together with the campus and clears the outer dirty state.
    await backToCampus();

    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(persisted).not.toBeNull();
    expect(persisted!.buildings[0].floors).toHaveLength(2);

    // Leave and reopen → the added floor is still there (persistence round-trip).
    await clickUntil(
      () => screen.queryByRole("heading", { name: "Campus Management" }) !== null,
      () => screen.getByTitle("Back to campus list"),
    );
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async () => persisted);
    await clickUntil(
      () => screen.queryByTitle("Back to campus list") !== null,
      () => screen.getByRole("button", { name: /open editor/i }),
    );
    await clickUntil(
      () => screen.queryByRole("button", { name: "More tools" }) !== null,
      () => screen.getByRole("button", { name: /^Floor 2/ }),
    );
    // Selector-first floor UI: the active floor is shown on the dropdown button
    // and the previous floor is one click away.
    expect(screen.getByRole("button", { name: "Select floor" })).toHaveTextContent("Floor 2");
    expect(screen.getByRole("button", { name: "Previous floor" })).toBeInTheDocument();
  });

  it("returning without any floor edit keeps the outer Save disabled", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)])]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");
    await backToCampus();

    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("editing a room in the Floor Editor enables the outer Save", async () => {
    const withRoom = makeFloor("f1", "Ground Floor", 1, {
      rooms: [{ id: "r1", name: "Room", type: "classroom", x: 30, y: 30, w: 140, h: 90, floorId: "f1", buildingId: "b1" }],
    });
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampusWithFloors([withRoom])]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    const { container } = renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");
    stubFloorSvg(container);
    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));

    // Select the room by pressing on its body rect.
    const roomRect = Array.from(container.querySelectorAll("rect")).find(
      (r) => Number(r.getAttribute("x")) === 30 && Number(r.getAttribute("y")) === 30 && Number(r.getAttribute("width")) === 140,
    );
    expect(roomRect).toBeTruthy();
    fireEvent.mouseDown(roomRect!, { clientX: 100, clientY: 75, bubbles: true });

    // Rename the room in the object properties panel → shared draft mutation.
    fireEvent.change(screen.getByPlaceholderText("Room name"), { target: { value: "Physics Lab" } });
    fireEvent.mouseUp(window);
    // Exiting with unsaved edits resolves through the guard (Save Changes),
    // which persists the rename — nothing is left for the outer Save.
    await backToCampus();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("selection and zoom only do not enable the outer Save", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)])]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    const { container } = renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");
    stubFloorSvg(container);

    // Zoom in (view only) and rubber-band the empty canvas (selection only).
    fireEvent.click(screen.getByTitle("Zoom In"));
    // Scope the rubber-band to the floor canvas svg (not a toolbar lucide icon).
    const canvasSvg = stubFloorSvg(container);
    fireEvent.mouseDown(canvasSvg, { clientX: 20, clientY: 20, bubbles: true });
    fireEvent.mouseUp(canvasSvg, { clientX: 60, clientY: 60, bubbles: true });

    await backToCampus();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renaming a floor from the actions menu enables the outer Save", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)])]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(screen.getByTestId("floor-actions-menu")).getByRole("button", { name: "Rename Floor" }));
    fireEvent.change(screen.getByLabelText("Rename floor input"), { target: { value: "Lobby 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Floor" }));
    // Exiting with unsaved edits resolves through the guard (Save Changes),
    // which persists the rename — nothing is left for the outer Save.
    await backToCampus();

    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("duplicating a floor enables the outer Save", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)])]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(screen.getByTestId("floor-actions-menu")).getByRole("button", { name: "Duplicate Floor" }));
    await backToCampus();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("reordering a floor (Move Up) enables the outer Save", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1), makeFloor("f2", "Floor 2", 2)]),
    ]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Floor 2");

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(screen.getByTestId("floor-actions-menu")).getByRole("button", { name: "Move Up" }));
    // Exiting with unsaved edits resolves through the guard (Save Changes).
    await backToCampus();

    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("deleting a floor enables the outer Save", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1), makeFloor("f2", "Floor 2", 2)]),
    ]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Floor 2");

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(screen.getByTestId("floor-actions-menu")).getByRole("button", { name: "Delete Floor" }));
    fireEvent.click(within(screen.getByTestId("delete-floor-confirm-dialog")).getByRole("button", { name: "Delete Floor" }));
    await backToCampus();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("applying Floor Settings enables the outer Save; cancelling Floor Settings does not", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)])]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");

    // Open the properties sidebar so the compact floor section is visible.
    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    await screen.findByRole("button", { name: "Open Floor Settings" }, {}, { timeout: 20000 });

    // Cancelling a settings change leaves the draft untouched.
    fireEvent.click(screen.getByRole("button", { name: "Open Floor Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Grid size 40" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await backToCampus();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();

    // Applying a settings change marks the draft dirty.
    await openFloor("Ground Floor");
    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    await screen.findByRole("button", { name: "Open Floor Settings" }, {}, { timeout: 20000 });
    fireEvent.click(screen.getByRole("button", { name: "Open Floor Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Grid size 40" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    // Exiting with unsaved settings resolves through the guard (Save Changes).
    await backToCampus();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("a text edit enables the outer Save", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampusWithFloors([labelFloor]),
    ]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    const { container } = renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");
    stubFloorSvg(container);

    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 42, clientY: 40, bubbles: true });
    const inline = screen.getByLabelText("Inline label text");
    fireEvent.change(inline, { target: { value: "Main Lobby" } });
    fireEvent.blur(inline);

    // Exiting with unsaved edits resolves through the guard (Save Changes).
    await backToCampus();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("undoing a floor edit back to the saved baseline returns the outer Save to disabled", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampusWithFloors([labelFloor]),
    ]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    const { container } = renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");
    stubFloorSvg(container);

    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 42, clientY: 40, bubbles: true });
    const inline = screen.getByLabelText("Inline label text");
    fireEvent.change(inline, { target: { value: "Main Lobby" } });
    fireEvent.blur(inline);

    // Undo the single committed edit → the floor matches the saved baseline again.
    fireEvent.click(screen.getByTitle("Undo (Ctrl+Z)"));
    await backToCampus();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("discarding from the campus back dialog restores the last saved campus including floor edits", async () => {
    (campusService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCampusWithFloors([makeFloor("f1", "Ground Floor", 1)]),
    ]);
    (campusStructureService.load as ReturnType<typeof vi.fn>).mockImplementation(async (c: Campus) => c);

    renderPage();
    await flush();
    await openCampusEditor();
    await openFloor("Ground Floor");
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    await backToCampus();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    // Leave the campus with unsaved floor changes → the unsaved prompt must appear.
    await clickUntil(
      () => screen.queryByText(/unsaved changes/i) !== null,
      () => screen.getByTitle("Back to campus list"),
    );
    await screen.findByText(/unsaved changes/i, {}, { timeout: 20000 });

    // Discard restores the last saved campus (one floor) instead of keeping two.
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    await screen.findByRole("heading", { name: "Campus Management" }, {}, { timeout: 20000 });
    await waitFor(() => expect(screen.getAllByTitle("Floors: 1").length).toBeGreaterThan(0));
  });
}, 120000);

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampusHome } from "../CampusHome";
import type { Campus } from "../types";

function archivedCampus(id: string, name: string): Campus {
  return {
    id,
    name,
    code: id.toUpperCase(),
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    themeColor: "#1e3a5f",
    status: "archived",
    publishStatus: "draft",
    lifecycleStatus: "archived",
    visibleToStudents: false,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    canvasW: 900,
    canvasH: 680,
    canvasConfigured: true,
    buildings: [],
    markers: [],
    paths: [],
    routes: [],
    navNodes: [],
    navEdges: [],
    accessibilityFeatures: [],
    assemblyPoints: [],
    eventOverlays: [],
    decorAssets: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    databaseUpdatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: false,
  };
}

function renderHome(campuses: Campus[], onBulkRestore = vi.fn(), options: {
  onPermanentDelete?: ReturnType<typeof vi.fn>;
  onBulkPermanentDelete?: ReturnType<typeof vi.fn>;
  unavailable?: string;
} = {}) {
  render(
    <CampusHome
      campuses={campuses}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onRestore={vi.fn()}
      onBulkRestore={onBulkRestore}
      onPermanentDelete={options.onPermanentDelete}
      onBulkPermanentDelete={options.onBulkPermanentDelete}
      permanentDeleteUnavailableReason={options.unavailable ?? "Permanent deletion is unavailable because protected dependent records remain."}
    />,
  );
  return onBulkRestore;
}

describe("CampusHome archived lifecycle controls", () => {
  it("selects only visible archived cards and bulk restores through the callback", async () => {
    const restore = renderHome([archivedCampus("campus-a", "Campus A"), archivedCampus("campus-b", "Campus B")]);

    fireEvent.click(screen.getByRole("checkbox", { name: /select all visible archived campuses/i }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));
    expect(screen.getByRole("dialog", { name: /restore 2 campuses/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore campuses/i }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith(["campus-a", "campus-b"]));
  });

  it("does not expose permanent deletion when the current Supabase contract is unsafe", () => {
    renderHome([archivedCampus("campus-a", "Campus A")]);

    expect(screen.queryByRole("button", { name: /delete permanently/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /select all visible archived campuses/i }));
    expect(screen.getByText("Permanent deletion unavailable")).toBeInTheDocument();
  });

  it("requires the exact campus name before a single permanent delete", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    renderHome([archivedCampus("campus-a", "Campus A")], vi.fn(), { onPermanentDelete: remove, unavailable: undefined });

    fireEvent.click(screen.getByRole("button", { name: /actions for campus a/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete permanently/i }));
    expect(screen.getByRole("dialog", { name: /permanently delete this campus/i })).toBeInTheDocument();

    const dialog = screen.getByRole("dialog", { name: /permanently delete this campus/i });
    const confirm = within(dialog).getByRole("button", { name: /delete permanently/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /type campus a to confirm/i }), { target: { value: "Campus A" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(remove).toHaveBeenCalledWith("campus-a"));
  });

  it("requires the bulk confirmation phrase and calls the authoritative bulk callback", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    renderHome([
      archivedCampus("campus-a", "Campus A"),
      archivedCampus("campus-b", "Campus B"),
    ], vi.fn(), { onBulkPermanentDelete: remove, unavailable: undefined });

    fireEvent.click(screen.getByRole("checkbox", { name: /select all visible archived campuses/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(screen.getByRole("dialog", { name: /permanently delete 2 campuses/i })).toBeInTheDocument();

    const dialog = screen.getByRole("dialog", { name: /permanently delete 2 campuses/i });
    const confirm = within(dialog).getByRole("button", { name: /delete permanently/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /type delete 2 campuses to confirm/i }), { target: { value: "DELETE 2 CAMPUSES" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(remove).toHaveBeenCalledWith(["campus-a", "campus-b"]));
  });

  it("shows failed campus details and keeps retry scoped to failed ids", async () => {
    const remove = vi.fn().mockResolvedValue({
      succeededIds: ["campus-a"],
      failedIds: ["campus-b"],
      failureMessage: "1 campus could not be deleted.",
      failures: [{
        id: "campus-b",
        name: "Campus B",
        stage: "database_delete_failed",
        code: "23503",
        message: "dependent data",
        userMessage: "A database dependency prevented deletion.",
      }],
    });
    renderHome([
      archivedCampus("campus-a", "Campus A"),
      archivedCampus("campus-b", "Campus B"),
    ], vi.fn(), { onBulkPermanentDelete: remove, unavailable: undefined });

    fireEvent.click(screen.getByRole("checkbox", { name: /select all visible archived campuses/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    const dialog = screen.getByRole("dialog", { name: /permanently delete 2 campuses/i });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /type delete 2 campuses to confirm/i }), { target: { value: "DELETE 2 CAMPUSES" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /delete permanently/i }));

    const viewFailures = await screen.findByRole("button", { name: /view failed campuses/i });
    fireEvent.click(viewFailures);
    expect(screen.getAllByText("Campus B").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("A database dependency prevented deletion.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
    await waitFor(() => expect(remove).toHaveBeenLastCalledWith(["campus-b"]));
  });
});

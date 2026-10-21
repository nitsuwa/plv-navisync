import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Campus } from "../types";
import type { ValidationIssue } from "../ValidationErrorsDialog";
import { CampusPublicationOutcomeUncertainError } from "../../../services/campusService";

vi.mock("../../../pages/CampusMapPage", () => ({
  CampusMapPage: ({ previewCampus, fullScreenHeight }: { previewCampus: Campus; fullScreenHeight?: string }) => <div data-testid="student-map" data-fullscreen-height={fullScreenHeight}>{previewCampus.name}</div>,
}));

import { StudentPreview } from "../StudentPreview";

const campus: Campus = {
  id: "c1", name: "Preview Campus", code: "PREVIEW", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "draft", visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  canvasW: 900, canvasH: 680, settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  buildings: [], markers: [], paths: [], navNodes: [], navEdges: [], routes: [], accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

const issue = (severity: ValidationIssue["severity"]): ValidationIssue => ({ type: "missing_name", severity, message: "Review this campus" });

describe("StudentPreview", () => {
  it("renders the read-only student surface and publish controls", () => {
    render(<StudentPreview campus={campus} validationIssues={[]} onBack={vi.fn()} onPublish={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByTestId("student-map")).toHaveTextContent("Preview Campus");
    expect(screen.getByTestId("student-map")).toHaveAttribute("data-fullscreen-height", "100%");
    expect(screen.getByTestId("student-preview-toolbar").tagName).toBe("HEADER");
    expect((screen.getByTestId("student-preview-toolbar").compareDocumentPosition(screen.getByTestId("student-preview-viewport")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(screen.getByText("Draft Preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  it("allows warnings with an explicit Publish Anyway action", async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<StudentPreview campus={campus} validationIssues={[issue("warning")]} onBack={vi.fn()} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByRole("button", { name: "Publish Anyway" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Publish Anyway" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  });

  it("shows the real warning message, severity, and affected location in the publish review", () => {
    const campusWithRoom: Campus = {
      ...campus,
      buildings: [{
        id: "b1", name: "Main Hall", code: "MH", category: "academic", description: "",
        x: 0, y: 0, width: 200, height: 120, color: "#ffffff",
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [{ id: "r1", name: "Bookshop", type: "retail", x: 0, y: 0, w: 20, h: 20, buildingId: "b1", floorId: "f1" }], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      }],
    } as Campus;
    const warning: ValidationIssue = { ...issue("warning"), message: "Check the room label", buildingId: "b1", floorId: "f1", roomId: "r1" };
    render(<StudentPreview campus={campusWithRoom} validationIssues={[warning]} onBack={vi.fn()} onPublish={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    const dialog = screen.getByRole("dialog", { name: "Publish campus" });
    expect(within(dialog).getByText("Check the room label")).toBeInTheDocument();
    expect(within(dialog).getByText("Warning", { exact: true })).toBeInTheDocument();
    expect(within(dialog).getByText("Main Hall · Ground Floor · Bookshop")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Hide details/ }));
    expect(within(dialog).queryByText("Check the room label")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Show details/ }));
    expect(within(dialog).getByText("Check the room label")).toBeInTheDocument();
  });

  it("locks dismissal and duplicate submissions while publishing, then reports confirmed success", async () => {
    let resolvePublish!: () => void;
    const onPublish = vi.fn(() => new Promise<void>((resolve) => { resolvePublish = resolve; }));
    render(<StudentPreview campus={campus} validationIssues={[issue("warning")]} onBack={vi.fn()} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = screen.getByRole("dialog", { name: "Publish campus" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish Anyway" }));

    expect(await screen.findByRole("heading", { name: "Publishing Campus…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close publish dialog" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to editor" })).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Publishing campus data…");
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole("heading", { name: "Publishing Campus…" })).toBeInTheDocument();
    expect(onPublish).toHaveBeenCalledTimes(1);

    await act(async () => { resolvePublish(); });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Campus Published" })).toBeInTheDocument());
  });

  it("keeps an uncertain publication open and routes retry through status reconciliation", async () => {
    const onPublish = vi.fn()
      .mockRejectedValueOnce(new CampusPublicationOutcomeUncertainError("c1", "version-1"))
      .mockResolvedValueOnce(undefined);
    const onBack = vi.fn();
    render(<StudentPreview campus={campus} validationIssues={[]} onBack={onBack} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = screen.getByRole("dialog", { name: "Publish campus" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("status could not be confirmed");
    expect(screen.getByRole("button", { name: "Back to editor" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Check status & retry" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(2));
    await screen.findByRole("heading", { name: "Campus Published" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("disables publish when a blocking validation error exists", () => {
    render(<StudentPreview campus={campus} validationIssues={[issue("error")]} onBack={vi.fn()} onPublish={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const publishButtons = screen.getAllByRole("button", { name: "Publish" });
    expect(publishButtons[publishButtons.length - 1]).toBeDisabled();
  });
});

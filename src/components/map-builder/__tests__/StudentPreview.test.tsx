import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Campus } from "../types";
import type { ValidationIssue } from "../ValidationErrorsDialog";

vi.mock("../../../pages/CampusMapPage", () => ({
  CampusMapPage: ({ previewCampus }: { previewCampus: Campus }) => <div data-testid="student-map">{previewCampus.name}</div>,
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
    expect(screen.getByText("Student Preview")).toBeInTheDocument();
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

  it("disables publish when a blocking validation error exists", () => {
    render(<StudentPreview campus={campus} validationIssues={[issue("error")]} onBack={vi.fn()} onPublish={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const publishButtons = screen.getAllByRole("button", { name: "Publish" });
    expect(publishButtons[publishButtons.length - 1]).toBeDisabled();
  });
});

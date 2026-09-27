import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportModal } from "../ReportModal";
import { reportService } from "../../../services/reportService";
import type { Building } from "../../../types";
import type { FloorPlan } from "../../map-builder/types";

vi.mock("../../../services/reportService", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/reportService")>()),
  reportService: { submitReport: vi.fn() },
}));
vi.mock("../../../hooks/useToast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const building = { id: "b1", name: "Student Center" } as Building;
const floors = [
  { id: "f1", label: "Ground Floor", rooms: [{ id: "room1", name: "Copy Shop" }] },
  { id: "f2", label: "Second Floor", rooms: [{ id: "room2", name: "Admin Office" }] },
] as FloorPlan[];
const submit = vi.mocked(reportService.submitReport);
function showForm() { render(<ReportModal building={building} campusId="c1" floors={floors} onClose={vi.fn()} />); }
describe("student building and room reporting", () => {
  beforeEach(() => vi.clearAllMocks());
  it("submits the selected room with its building and floor", async () => {
    submit.mockResolvedValue({ id: "r1" } as never);
    showForm();
    fireEvent.change(screen.getByLabelText("Floor (optional)"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Room (optional)"), { target: { value: "room1" } });
    fireEvent.click(screen.getByRole("radio", { name: "Broken Light" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await screen.findByRole("dialog", { name: "Report submitted" });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ buildingId: "b1", floorId: "f1", roomId: "room1", category: "electrical_issue" }));
    expect(screen.getByText("Student Center · Ground Floor · Copy Shop")).toBeInTheDocument();
    expect(screen.queryByText(/maintenance has been notified/)).not.toBeInTheDocument();
  });
  it("keeps the form and description available for retry on failure", async () => {
    submit.mockRejectedValue(new Error("Sign in to submit a report."));
    showForm();
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Flood near the door" } });
    fireEvent.click(screen.getByRole("radio", { name: "Flooded Area" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in");
    expect(screen.getByLabelText("Description")).toHaveValue("Flood near the door");
    expect(screen.queryByRole("dialog", { name: "Report submitted" })).not.toBeInTheDocument();
  });
  it("clears room selection when the selected floor changes", () => {
    showForm();
    fireEvent.change(screen.getByLabelText("Floor (optional)"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Room (optional)"), { target: { value: "room1" } });
    fireEvent.change(screen.getByLabelText("Floor (optional)"), { target: { value: "f2" } });
    expect(screen.getByLabelText("Room (optional)")).toHaveValue("");
    expect(screen.queryByRole("option", { name: "Copy Shop" })).not.toBeInTheDocument();
  });
  it("prefills a room report opened from an indoor room interaction", () => {
    render(<ReportModal building={building} campusId="c1" floors={floors} initialFloorId="f2" initialRoomId="room2" onClose={vi.fn()} />);
    expect(screen.getByLabelText("Floor (optional)")).toHaveValue("f2");
    expect(screen.getByLabelText("Room (optional)")).toHaveValue("room2");
  });
  it("does not accept a preselected room from a different floor", () => {
    render(<ReportModal building={building} campusId="c1" floors={floors} initialFloorId="f2" initialRoomId="room1" onClose={vi.fn()} />);
    expect(screen.getByLabelText("Room (optional)")).toHaveValue("");
  });
  it("makes partial photo failure visible after the report is saved", async () => {
    submit.mockResolvedValue({ id: "r1", submissionWarning: "Saved, but the photo failed." } as never);
    showForm();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("photo failed"));
    expect(screen.getByRole("dialog", { name: "Report submitted" })).toBeInTheDocument();
  });
});

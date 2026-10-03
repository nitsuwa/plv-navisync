import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventDetailsModal, EventProposalModal } from "../EventProposalModal";

vi.mock("../../../lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.test/poster.png" } }),
      }),
    },
  }),
}));

const buildings = [{ buildingId: "science", buildingName: "Science Building", floors: [{ number: 1, label: "Floor 1" }] }];

describe("EventProposalModal", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  it("keeps event scheduling out of the student organization draft editor", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailsModal overlay={{ id: "draft", title: "Copy", description: "", organizer: "Org", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] } as never} buildings={buildings} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.queryByLabelText(/event starts|event ends/i)).not.toBeInTheDocument();
    expect(screen.getByText(/administrator will set the event schedule/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("dateStart");
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("dateEnd");
  });
  it("uses the themed campus picker and loads buildings for the selected campus", async () => {
    render(<EventProposalModal buildings={buildings} campuses={[{ id: "north", name: "North", buildings }, { id: "south", name: "South", buildings: [{ buildingId: "arts", buildingName: "Arts", floors: [{ number: 1, label: "Ground" }] }] }]} onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(document.querySelector("select")).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Published campus" }));
    fireEvent.click(await screen.findByRole("option", { name: "South" }));

    expect(screen.getByRole("checkbox", { name: "Arts — Ground" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Science Building — Floor 1" })).not.toBeInTheDocument();
  });
  it("clears incompatible floors only after confirming a campus change", async () => {
    render(<EventProposalModal buildings={buildings} campuses={[{ id: "north", name: "North", buildings }, { id: "south", name: "South", buildings: [{ buildingId: "arts", buildingName: "Arts", floors: [{ number: 1, label: "Ground" }] }] }]} onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Science Building — Floor 1" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Published campus" }));
    fireEvent.click(await screen.findByRole("option", { name: "South" }));
    expect(screen.getByRole("alertdialog", { name: "Change campus?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep campus" }));
    expect(screen.getByRole("checkbox", { name: "Science Building — Floor 1" })).toBeChecked();
    fireEvent.click(screen.getByRole("combobox", { name: "Published campus" }));
    fireEvent.click(await screen.findByRole("option", { name: "South" }));
    fireEvent.click(screen.getByRole("button", { name: "Change and clear" }));
    expect(screen.getByRole("checkbox", { name: "Arts — Ground" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Science Building — Floor 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Selected (0)")).toBeInTheDocument();
  });
  it("requires a review before creating the proposal", () => {
    const onCreate = vi.fn();
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Review Fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /create & design maps/i }));
    expect(screen.getByRole("alertdialog", { name: /review event proposal/i })).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /back to locations/i }));
    expect(screen.getByRole("checkbox", { name: /campus grounds/i })).toBeChecked();
  });
  it("guides the org through details and multiple locations without date fields", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Student Fair" } });
    expect(screen.getByText(/administrator will set the event schedule/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/event starts|event ends|start date|end date/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]')).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    fireEvent.click(screen.getByRole("button", { name: /create & design maps/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm & design/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Student Fair",
      locations: expect.arrayContaining([
        expect.objectContaining({ type: "campus" }),
        expect.objectContaining({ type: "building", floorId: "science-f1" }),
      ]),
    })));
  });

  it("keeps details and selected locations when moving back and forward", () => {
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus Fair" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A student event" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByLabelText(/event title/i)).toHaveValue("Campus Fair");
    expect(screen.getByLabelText(/description/i)).toHaveValue("A student event");
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("checkbox", { name: /campus grounds/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /remove science building — floor 1/i })).toBeInTheDocument();
  });

  it("explains why Create is unavailable until at least one location is selected", () => {
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus Fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    const createButton = screen.getByRole("button", { name: /create & design maps/i });
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute("aria-describedby", "event-create-help");
    expect(screen.getByText(/select at least one requested location to continue/i)).toBeInTheDocument();
  });

  it("asks before discarding a dirty proposal on Escape or backdrop and closes cleanly on discard", async () => {
    const onClose = vi.fn();
    render(<EventProposalModal buildings={buildings} onClose={onClose} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Unsaved event" } });
    const dialog = screen.getByRole("dialog", { name: /create event proposal/i });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(await screen.findByRole("alertdialog", { name: /discard this proposal/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(screen.getByLabelText(/event title/i)).toHaveValue("Unsaved event");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId("proposal-modal-backdrop"), { pointerType: "mouse" });
    expect(await screen.findByRole("alertdialog", { name: /discard this proposal/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes a clean proposal directly without a discard prompt", () => {
    const onClose = vi.fn();
    render(<EventProposalModal buildings={buildings} onClose={onClose} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("submits once and prevents dismissal while the create request is pending", async () => {
    let resolveCreate!: () => void;
    const onCreate = vi.fn(() => new Promise<void>((resolve) => { resolveCreate = resolve; }));
    const onClose = vi.fn();
    render(<EventProposalModal buildings={buildings} onClose={onClose} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus Fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    const createButton = screen.getByRole("button", { name: /create & design maps/i });
    fireEvent.click(createButton);
    const confirmButton = screen.getByRole("button", { name: /confirm & design/i });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    expect(within(screen.getByRole("alertdialog", { name: /review event proposal/i })).getByRole("status")).toHaveTextContent("Preparing your event workspace");
    expect(createButton).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("alertdialog", { name: /review event proposal/i }), { key: "Escape" });
    fireEvent.pointerDown(screen.getByTestId("proposal-modal-backdrop"), { pointerType: "mouse" });
    expect(onClose).not.toHaveBeenCalled();

    resolveCreate();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("retains entered title, poster, and locations when the async create fails", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus Fair" } });
    fireEvent.change(screen.getByLabelText(/event poster/i), { target: { files: [new File(["poster"], "fair.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    fireEvent.click(screen.getByRole("button", { name: /create & design maps/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm & design/i }));
    expect(await screen.findByText(/network unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText(/event title/i)).toHaveValue("Campus Fair");
    expect(screen.getByText("fair.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("checkbox", { name: /campus grounds/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /remove science building — floor 1/i })).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps the mobile dialog footer present while ten selected floors are in the scrollable content", () => {
    const tenFloorBuilding = [{
      buildingId: "science",
      buildingName: "Science Building",
      floors: Array.from({ length: 10 }, (_, index) => ({ number: index + 1, label: `Floor ${index + 1}` })),
    }];
    render(<EventProposalModal buildings={tenFloorBuilding} onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Campus Fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    }

    expect(screen.getByRole("dialog", { name: /create event proposal/i })).toHaveClass("h-[100dvh]");
    expect(screen.getByText("Selected (10)")).toBeInTheDocument();
    expect(screen.getByTestId("proposal-modal-footer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create & design maps/i })).toBeInTheDocument();
  });
});

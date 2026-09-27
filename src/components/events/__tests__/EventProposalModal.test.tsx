import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventProposalModal } from "../EventProposalModal";

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
  it("guides the org through details and multiple locations without date fields", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Student Fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/start date|end date/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    fireEvent.click(screen.getByRole("button", { name: /create & design maps/i }));
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
    fireEvent.click(createButton);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    expect(createButton).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog", { name: /create event proposal/i }), { key: "Escape" });
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

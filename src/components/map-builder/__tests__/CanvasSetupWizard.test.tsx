import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasSetupWizard } from "../CanvasSetupWizard";
import type { Campus } from "../types";

const campus = { id: "setup-campus", name: "Test Campus" } as Campus;

async function openReview() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
}

describe("CanvasSetupWizard persistence lifecycle", () => {
  it.each([
    ["Small", 600, 450],
    ["Medium", 900, 680],
    ["Large", 1200, 900],
  ])("waits for persistence before reporting %s canvas success", async (size, width, height) => {
    let resolveSave!: () => void;
    const onComplete = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    render(<CanvasSetupWizard open campus={campus} onComplete={onComplete} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(size === "Medium" ? "Medium" : `^${size}`) }));
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Create Canvas" }));

    await screen.findByRole("status");
    expect(screen.queryByText("Canvas Ready!")).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ canvasW: width, canvasH: height }));
    resolveSave();
    expect(await screen.findByText("Canvas Ready!")).toBeInTheDocument();
  });

  it("shows save failures inline and permits a retry without losing the selected dimensions", async () => {
    const onComplete = vi.fn()
      .mockRejectedValueOnce(new Error("Structure save failed"))
      .mockResolvedValueOnce(undefined);
    render(<CanvasSetupWizard open campus={campus} onComplete={onComplete} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Small/ }));
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Create Canvas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Structure save failed");
    expect(onComplete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Create Canvas" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    expect(onComplete).toHaveBeenLastCalledWith(expect.objectContaining({ canvasW: 600, canvasH: 450 }));
    expect(await screen.findByText("Canvas Ready!")).toBeInTheDocument();
  });

  it("rejects custom dimensions below the persisted campus minimum", async () => {
    const onComplete = vi.fn();
    render(<CanvasSetupWizard open campus={campus} onComplete={onComplete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Custom Size/ }));
    fireEvent.change(screen.getByLabelText("Width (px)"), { target: { value: "200" } });
    await openReview();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("persists valid custom dimensions", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CanvasSetupWizard open campus={campus} onComplete={onComplete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Custom Size/ }));
    fireEvent.change(screen.getByLabelText("Width (px)"), { target: { value: "1024" } });
    fireEvent.change(screen.getByLabelText("Height (px)"), { target: { value: "768" } });
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Create Canvas" }));
    await screen.findByText("Canvas Ready!");
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ canvasW: 1024, canvasH: 768 }));
  });
});

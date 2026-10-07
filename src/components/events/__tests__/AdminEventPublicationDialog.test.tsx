import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay } from "../../map-builder/types";
import { eventPreviewFixture } from "../../../test/eventFullPackFixtures";
import { AdminEventPublicationDialog } from "../AdminEventPublicationDialog";

const overlay = {
  ...eventPreviewFixture(),
  updatedAt: "2026-10-02T00:00:00.000Z",
  restrictedAreas: [],
} as unknown as CampusEventOverlay;

describe("AdminEventPublicationDialog", () => {
  beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-03T02:00:00Z")); });
  afterEach(() => vi.restoreAllMocks());

  it("shows Published instead of allowing redundant publishing and avoids a stale schedule error on open", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-08T02:00:00Z"));
    const onSave = vi.fn();
    render(<AdminEventPublicationDialog overlay={overlay} onClose={vi.fn()} onSave={onSave} />);
    const published = screen.getByRole("button", { name: /^Published$/i });
    expect(published).toBeDisabled();
    fireEvent.click(published);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText("Choose a future publication time.")).not.toBeInTheDocument();
  });

  it("blocks an expired event and explains the next step", () => {
    render(<AdminEventPublicationDialog overlay={{ ...overlay, isActive: false, dateStart: "2026-10-01T01:00:00Z", dateEnd: "2026-10-02T01:00:00Z" }} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Publish now/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save schedule/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/ended.*updated.*dates/i);
  });

  it("can republish an ongoing event with a past start and future end", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-08T02:00:00Z"));
    render(<AdminEventPublicationDialog overlay={{ ...overlay, isActive: false }} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Publish now/i })).toBeEnabled();
  });

  it("shows the saved Manila publication and never asks the admin to re-enter occurrence times", () => {
    render(<AdminEventPublicationDialog overlay={overlay} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(/Configured publication: Oct 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Event starts/)).toBeInTheDocument();
    expect(screen.getByText(/Event ends/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Event starts time/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save schedule/i })).toBeEnabled();
  });

  it("allows a scheduled publication to be saved without changing approval", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AdminEventPublicationDialog overlay={overlay} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(overlay, { action: "schedule", publicationAt: "2026-10-05T01:00:00.000Z" }));
  });

  it("requires confirmation before moving a currently visible event to future publication", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-06T01:00:00.000Z"));
    try {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const visibleOverlay = {
        ...overlay,
        publicationAt: "2026-10-05T01:00:00.000Z",
      };
      render(<AdminEventPublicationDialog overlay={visibleOverlay} onClose={onClose} onSave={onSave} />);

      fireEvent.click(screen.getByRole("button", { name: /Schedule student publication date: October 5, 2026/i }));
      fireEvent.click(screen.getByRole("button", { name: "October 7, 2026" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));
        await Promise.resolve();
      });

      expect(screen.getByRole("alertdialog", { name: /Confirm schedule change/i })).toHaveTextContent(/hide its map from student view until/i);
      expect(onSave).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /Keep visible/i }));
      expect(onSave).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));
        await Promise.resolve();
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Confirm schedule/i }));
        await Promise.resolve();
      });
      expect(onSave).toHaveBeenCalledWith(visibleOverlay, { action: "schedule", publicationAt: "2026-10-07T01:00:00.000Z" });
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      now.mockRestore();
    }
  });

  it("does not unpublish if the administrator keeps it published", () => {
    const onSave = vi.fn();
    render(<AdminEventPublicationDialog overlay={overlay} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /^Unpublish$/i }));
    expect(screen.getByRole("alertdialog", { name: /Confirm unpublish event/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Keep published/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps date inputs and shows a conflict when the publication RPC fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("This event changed. Refresh it before saving."));
    render(<AdminEventPublicationDialog overlay={overlay} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/event changed/i);
    expect(screen.getByRole("button", { name: /Schedule student publication date: October 5, 2026/i })).toBeInTheDocument();
  });
});

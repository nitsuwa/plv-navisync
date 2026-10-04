import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventRevisionHistory, describeEventRevision } from "../EventRevisionHistory";
import { eventOverlayService } from "../../../services/eventOverlayService";
vi.mock("../../../services/eventOverlayService", () => ({ eventOverlayService: { listEventRevisions: vi.fn() } }));
const location = { id: "grounds", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [{ id: "chair", x: 10 }], eventLabels: [] };

describe("event revision history", () => {
  it("describes pin acknowledgements rather than reporting a silent edit", () => {
    const messages = describeEventRevision({ before: {}, after: { feedbackResolutions: { grounds: { pin: { addressedAt: '2026-10-03T00:00:00Z', addressedBy: 'org', feedback: 'text', note: 'Moved booth' } } } } } as never);
    expect(messages.some(message => message.includes('addressed'))).toBe(true);
  });
  it("labels an unavailable submission baseline instead of inventing no changes", async () => {
    vi.mocked(eventOverlayService.listEventRevisions).mockResolvedValue([{ id: 'edit', action: 'edited', createdAt: '2026-10-03T00:00:00Z', before: {}, after: {} }] as never);
    render(<EventRevisionHistory overlay={{ id: 'event', status: 'pending' } as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'View edit history' }));
    expect(await screen.findByText(/submission baseline.*unavailable/i)).toBeInTheDocument();
  });
  beforeEach(() => vi.clearAllMocks());
  it("compares pending edits against the latest recorded submission", async () => {
    vi.mocked(eventOverlayService.listEventRevisions).mockResolvedValue([{ id: "submitted", action: "submitted", createdAt: "2026-10-03T00:00:00Z", before: {}, after: { locations: [location] } }] as never);
    render(<EventRevisionHistory overlay={{ id: "event", status: "pending", locations: [{ ...location, eventFurniture: [{ id: "chair", x: 20 }] }] } as never} />);
    fireEvent.click(screen.getByRole("button", { name: "View edit history" }));
    expect(await screen.findByText("Changes since submission")).toBeInTheDocument();
    expect(await screen.findByText("Campus Grounds: 0 added · 0 removed · 1 changed")).toBeInTheDocument();
  });
  it("describes moved, added and removed assets by location", () => {
    const entry = { before: { locations: [location] }, after: { locations: [{ ...location, eventFurniture: [{ id: "chair", x: 20 }, { id: "table", x: 10 }] }] } };
    expect(describeEventRevision(entry as never)).toEqual(["Campus Grounds: 1 added · 0 removed · 1 changed"]);
    expect(describeEventRevision({ before: { locations: [location] }, after: { locations: [] } } as never)).toContain("Campus Grounds: location removed");
  });
  it("does not invent history and only loads when expanded", async () => {
    vi.mocked(eventOverlayService.listEventRevisions).mockResolvedValue([]);
    render(<EventRevisionHistory overlay={{ id: "event" } as never} />);
    expect(eventOverlayService.listEventRevisions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View edit history" }));
    expect(await screen.findByText(/older edits cannot be reconstructed/)).toBeInTheDocument();
  });
  it("keeps migration failures visible instead of reporting an empty history", async () => {
    vi.mocked(eventOverlayService.listEventRevisions).mockRejectedValue(new Error("Migration missing"));
    render(<EventRevisionHistory overlay={{ id: "event" } as never} />);
    fireEvent.click(screen.getByRole("button", { name: "View edit history" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Migration missing"));
    expect(screen.getByRole("button", { name: "Retry history" })).toBeInTheDocument();
  });
});

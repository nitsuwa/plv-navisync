import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReuseOrganizationEventDialog } from "../ReuseOrganizationEventDialog";
import { eventOverlayService } from "../../../services/eventOverlayService";

vi.mock("../../../services/eventOverlayService", () => ({ eventOverlayService: { reuseOrganizationEvent: vi.fn() } }));
const organization = { organizationId: "org-1", organizationName: "IT Organization", grantId: "grant-1", academicYear: "2026–2027", expiresAt: "2027-06-30T00:00:00Z" };
const source = { id: "10000000-0000-4000-8000-000000000001", organizationId: "org-1", updatedAt: "2026-10-08T12:00:00Z", campusId: "campus-1", title: "Past Fair", academicYear: "2024–2025", status: "approved", locations: [{ id: "ground", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] } as never;

describe("ReuseOrganizationEventDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns keyboard focus to the reuse action after Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Reuse layout</button>{open && <ReuseOrganizationEventDialog source={source} organization={organization} onClose={() => setOpen(false)} onCreated={vi.fn()} />}</>;
    }
    render(<MemoryRouter><Harness /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Reuse layout" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Reuse event layout" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains the source, destination year, and fresh approval before reuse", () => {
    render(<MemoryRouter><ReuseOrganizationEventDialog source={source} organization={organization} onClose={vi.fn()} onCreated={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("dialog", { name: "Reuse event layout" })).toBeInTheDocument();
    expect(screen.getByText("Past Fair · 2024–2025")).toBeInTheDocument();
    expect(screen.getByText("IT Organization · 2026–2027")).toBeInTheDocument();
    expect(screen.getByText(/new draft.*fresh admin approval/i)).toBeInTheDocument();
    expect(screen.getByText(/original layout remains intact/i)).toBeInTheDocument();
  });

  it("blocks duplicate submissions and dismissal while a reuse request is pending", async () => {
    let resolveReuse!: (value: never) => void;
    vi.mocked(eventOverlayService.reuseOrganizationEvent).mockImplementationOnce(() => new Promise((resolve) => { resolveReuse = resolve as typeof resolveReuse; }));
    const onClose = vi.fn();
    render(<MemoryRouter><ReuseOrganizationEventDialog source={source} organization={organization} onClose={onClose} onCreated={vi.fn()} /></MemoryRouter>);
    const dialog = screen.getByRole("dialog", { name: "Reuse event layout" });
    const form = screen.getByRole("button", { name: "Create new draft" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(eventOverlayService.reuseOrganizationEvent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Creating draft…" })).toBeDisabled();

    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
    expect(screen.getByRole("dialog", { name: "Reuse event layout" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { resolveReuse({ id: "draft-pending" } as never); });
  });

  it("keeps the request retryable and navigates only after server confirmation", async () => {
    vi.mocked(eventOverlayService.reuseOrganizationEvent).mockRejectedValueOnce(new Error("Network unavailable"));
    vi.mocked(eventOverlayService.reuseOrganizationEvent).mockResolvedValueOnce({ id: "draft-1" } as never);
    const onCreated = vi.fn();
    render(<MemoryRouter><ReuseOrganizationEventDialog source={source} organization={organization} onClose={vi.fn()} onCreated={onCreated} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox", { name: "New event title" }), { target: { value: "New Fair" } });
    fireEvent.click(screen.getByRole("button", { name: "Create new draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry reuse" }));
    await waitFor(() => expect(eventOverlayService.reuseOrganizationEvent).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(eventOverlayService.reuseOrganizationEvent).mock.calls;
    expect(calls[0][3]).toBe(calls[1][3]);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "draft-1" }));
  });
});

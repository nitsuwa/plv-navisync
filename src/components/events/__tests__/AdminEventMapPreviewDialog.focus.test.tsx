import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay } from "../../map-builder/types";
import { eventPreviewFixture } from "../../../test/eventFullPackFixtures";
import { AdminEventMapPreviewDialog } from "../AdminEventMapPreviewDialog";

vi.mock("../../../pages/AdminEventLayoutPreviewPage", () => ({
  AdminEventLayoutPreviewPage: ({ onClose }: { onClose: () => void }) => <button type="button" onClick={onClose}>Close preview for test</button>,
}));

function PreviewHarness() {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button ref={triggerRef} type="button" onClick={event => { triggerRef.current = event.currentTarget; setOpen(true); }}>Open preview</button>
    {open && <AdminEventMapPreviewDialog overlay={{ ...eventPreviewFixture(), restrictedAreas: [] } as unknown as CampusEventOverlay} onClose={() => setOpen(false)} returnFocusRef={triggerRef} />}
  </>;
}

describe("AdminEventMapPreviewDialog focus restoration", () => {
  it("returns keyboard focus to the control that opened the preview", async () => {
    render(<PreviewHarness />);
    const trigger = screen.getByRole("button", { name: "Open preview" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Close preview for test" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

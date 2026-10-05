import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Building } from "../../../types";
import type { StudentAuthState } from "../../../hooks/useStudentAuth";
import { MobileBuildingSheet, mobileBuildingSheetSnapHeights, resolveMobileBuildingSheetSnap } from "../MobileBuildingSheet";

const building: Building = {
  id: "b1", name: "College of Accountancy and Business Administration", code: "CABA",
  description: "A short authored building description.", category: "academic", floor_count: 6,
  created_at: "2026-01-01T00:00:00Z",
};

describe("mobile building details sheet", () => {
  it("resolves slow drags to the nearest snap and fast flicks to only the next snap", () => {
    const heights = mobileBuildingSheetSnapHeights(667);
    expect(heights.peek).toBeLessThan(heights.default);
    expect(heights.default).toBeLessThan(heights.expanded);
    const shortViewport = mobileBuildingSheetSnapHeights(480, 276);
    expect(shortViewport.expanded).toBeLessThanOrEqual(276);
    expect(shortViewport.default).toBeLessThanOrEqual(276);
    expect(resolveMobileBuildingSheetSnap("default", -100, 0, heights)).toBe("expanded");
    expect(resolveMobileBuildingSheetSnap("default", 80, 0, heights)).toBe("peek");
    expect(resolveMobileBuildingSheetSnap("peek", -300, -700, heights)).toBe("default");
    expect(resolveMobileBuildingSheetSnap("default", -300, -700, heights)).toBe("expanded");
  });

  it("opens in the compact default state with image, primary actions, and visible secondary actions", () => {
    render(<MobileBuildingSheet
      selected={building} campusId="campus-1" onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={["Elevator"]} accessibility={["Accessible entrance"]}
      showQR={false} onToggleQR={vi.fn()}
    />);
    const sheet = screen.getByTestId("mobile-building-sheet");
    const sheetContent = within(sheet);

    expect(sheet).toHaveAttribute("data-sheet-state", "default");
    expect(sheet.style.bottom).toContain("safe-area-inset-bottom");
    expect(sheetContent.getByTestId("building-cover-fallback")).toBeInTheDocument();
    expect(sheetContent.getByText(building.name)).toBeInTheDocument();
    expect(sheetContent.getByRole("button", { name: "Directions" })).toBeVisible();
    expect(sheetContent.getByRole("button", { name: "Enter Building" })).toBeVisible();
    expect(sheetContent.getByRole("button", { name: /Save/ })).toBeVisible();
    expect(sheetContent.getByRole("button", { name: "Show building QR code" })).toBeVisible();
    expect(sheetContent.getByRole("button", { name: "Report map issue" })).toBeVisible();
    expect(sheetContent.getByTestId("building-quick-facts-compact")).toHaveTextContent("Academic");
    expect(sheetContent.getByTestId("building-quick-facts-compact")).toHaveTextContent("6 floors");
    expect(sheetContent.queryByText(/floor plan/i)).not.toBeInTheDocument();
  });

  it("keeps Report and QR visible while More contains Share and Copy Link", () => {
    render(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "Report map issue" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show building QR code" })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More building actions" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Link" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /qr code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /report/i })).not.toBeInTheDocument();
  });

  it("shows the building QR after the QR action is activated", async () => {
    const props = {
      selected: building, campusId: "campus-1", onClose: vi.fn(), onDirections: vi.fn(), onEnterBuilding: vi.fn(),
      onSave: vi.fn(), onReport: vi.fn(), onSignInPrompt: vi.fn(), saved: new Set<string>(),
      studentAuth: { isStudent: true } as StudentAuthState, hasFloorPlans: true, floorPlanCount: 6,
      facilities: ["Elevator"], accessibility: ["Accessible entrance"],
    };
    function InteractiveBuildingSheet() {
      const [showQR, setShowQR] = useState(false);
      return <MobileBuildingSheet {...props} showQR={showQR} onToggleQR={() => setShowQR((visible) => !visible)} />;
    }
    render(<InteractiveBuildingSheet />);

    fireEvent.click(screen.getByRole("button", { name: "Show building QR code" }));
    expect(await screen.findByLabelText(`QR code for ${building.name}`)).toBeVisible();
    expect(screen.getByTestId("building-qr")).toBeVisible();
    expect(screen.getByText(`Scan to set ${building.name} as your current location`)).toBeVisible();
  });

  it("places an authored building cover in the default mobile state", () => {
    render(<MobileBuildingSheet
      selected={{ ...building, image_url: "https://images.example/caba.jpg" }} onClose={vi.fn()}
      onDirections={vi.fn()} onEnterBuilding={vi.fn()} onSave={vi.fn()} onReport={vi.fn()}
      onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
    />);
    const sheet = screen.getByTestId("mobile-building-sheet");
    const cover = within(sheet).getByTestId("building-sheet-image");
    const image = within(cover).getByAltText(`${building.name} building`);
    expect(sheet).toHaveAttribute("data-sheet-state", "default");
    expect(image).toHaveAttribute("src", "https://images.example/caba.jpg");
    expect(cover.compareDocumentPosition(within(sheet).getByRole("heading", { name: building.name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers peek and expanded sheet states without losing the current building", () => {
    render(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
    />);
    const handle = screen.getByRole("button", { name: "Expand building details" });
    fireEvent.click(handle);
    expect(screen.getByTestId("mobile-building-sheet")).toHaveAttribute("data-sheet-state", "expanded");
    expect(screen.getByText(building.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse building details" }));
    expect(screen.getByTestId("mobile-building-sheet")).toHaveAttribute("data-sheet-state", "default");
  });

  it("offers a route return action when this sheet temporarily foregrounds building details", () => {
    const onBackToRoutePlanner = vi.fn();
    render(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
      onBackToRoutePlanner={onBackToRoutePlanner}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Back to route planner" }));
    expect(onBackToRoutePlanner).toHaveBeenCalledOnce();
    expect(screen.getByTestId("mobile-building-sheet")).toHaveAttribute("data-sheet-state", "default");
  });

  it("settles a captured drag after the pointer moves outside the handle", () => {
    render(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
    />);
    const sheet = screen.getByTestId("mobile-building-sheet");
    const handle = screen.getByRole("button", { name: "Expand building details" });
    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 420 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 250 });
    expect(sheet).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 250 });
    expect(sheet).toHaveAttribute("data-dragging", "false");
    expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
  });

  it("resolves pointercancel and lostpointercapture to real snaps", () => {
    render(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
    />);
    const sheet = screen.getByTestId("mobile-building-sheet");
    const handle = screen.getByRole("button", { name: "Expand building details" });
    fireEvent.pointerDown(handle, { pointerId: 3, clientY: 160 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientY: 260 });
    fireEvent.pointerCancel(handle, { pointerId: 3, clientY: 260 });
    expect(sheet).toHaveAttribute("data-dragging", "false");
    expect(sheet).toHaveAttribute("data-sheet-state", "peek");

    fireEvent.click(screen.getByRole("button", { name: "Show building details" }));
    expect(sheet).toHaveAttribute("data-sheet-state", "default");
    const nextHandle = screen.getByRole("button", { name: "Expand building details" });
    fireEvent.pointerDown(nextHandle, { pointerId: 4, clientY: 420 });
    fireEvent.pointerMove(nextHandle, { pointerId: 4, clientY: 300 });
    fireEvent.lostPointerCapture(nextHandle, { pointerId: 4, clientY: 300 });
    expect(sheet).toHaveAttribute("data-dragging", "false");
    expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
  });

  it("keeps its snap and selection while a transient overlay pauses handle gestures", () => {
    const view = render(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()}
    />);
    const sheet = screen.getByTestId("mobile-building-sheet");
    fireEvent.click(screen.getByRole("button", { name: "Expand building details" }));
    expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
    view.rerender(<MobileBuildingSheet
      selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
      onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
      hasFloorPlans floorPlanCount={6} facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()} interactionPaused
    />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Collapse building details" }), { pointerId: 9, clientY: 200 });
    expect(sheet).toHaveAttribute("data-interaction-paused", "true");
    expect(sheet).toHaveAttribute("data-dragging", "false");
    expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
  });
});

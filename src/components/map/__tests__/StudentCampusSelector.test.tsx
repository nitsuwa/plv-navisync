import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { computeStudentCampusMenuLayout, computeStudentCampusSelectorMaxWidth, StudentCampusSelector, type StudentCampusOption } from "../StudentCampusSelector";

const campuses: StudentCampusOption[] = [
  { id: "main", name: "PLV Main Campus", code: "MAIN" },
  { id: "north", name: "Northern Campus with a Very Long Official Name", code: "NORTH" },
  { id: "soon", name: "Future Campus", lifecycleStatus: "coming_soon" },
];

describe("StudentCampusSelector", () => {
  it("shrinks beside the mobile floor picker to maintain a clear horizontal gap", () => {
    expect(computeStudentCampusSelectorMaxWidth(320, 178, 0)).toBe(158);
    expect(computeStudentCampusSelectorMaxWidth(390, 248, 0)).toBe(228);
    expect(computeStudentCampusSelectorMaxWidth(430)).toBe(260);
  });

  it("anchors a compact mobile menu and keeps it above a bottom sheet", () => {
    const layout = computeStudentCampusMenuLayout({
      trigger: { top: 112, bottom: 152, left: 16, right: 198 },
      viewport: { left: 0, top: 0, width: 390, height: 844 },
      obstacles: [
        { left: 0, right: 390, top: 500, bottom: 844 },
        { left: 264, right: 308, top: 298, bottom: 492 },
      ],
      mobile: true,
      campusCount: 18,
      safeAreaBottom: 20,
    });

    expect(layout.placement).toBe("below");
    expect(layout.left).toBe(16);
    expect(layout.width).toBe(300);
    expect(layout.top + layout.maxHeight).toBeLessThanOrEqual(290);
    expect(layout.maxHeight).toBeLessThan(200);
  });

  it("keeps the established compact desktop menu width and stays inside the viewport", () => {
    const layout = computeStudentCampusMenuLayout({
      trigger: { top: 700, bottom: 744, left: 650, right: 850 },
      viewport: { left: 0, top: 0, width: 1024, height: 768 },
      mobile: false,
      campusCount: 3,
    });

    expect(layout.width).toBe(220);
    expect(layout.placement).toBe("above");
    expect(layout.left).toBe(640);
    expect(layout.top).toBeGreaterThanOrEqual(12);
  });

  it("shows the active campus, supports keyboard dismissal, and selects another campus", () => {
    const onSelect = vi.fn(() => true);
    render(<StudentCampusSelector campuses={campuses} activeCampusId="main" onSelect={onSelect} />);

    const trigger = screen.getByRole("button", { name: /Change campus\. Current campus: PLV Main Campus/i });
    fireEvent.click(trigger);
    const activeOption = screen.getByRole("menuitemradio", { name: /PLV Main Campus.*Active/i });
    expect(activeOption).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /Northern Campus with a Very Long Official Name/ })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Future Campus/ }));
    expect(onSelect).toHaveBeenCalledWith("soon");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside pointer input and remains open when a selection is declined", () => {
    const onSelect = vi.fn(() => false);
    render(<StudentCampusSelector campuses={campuses} activeCampusId="main" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Change campus/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Northern Campus/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

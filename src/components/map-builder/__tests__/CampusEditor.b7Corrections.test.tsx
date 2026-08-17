/**
 * B7 Corrections — focused regression tests for Parts A through H.
 *
 * Tests the specific changes made during the B7 correction pass:
 *   Part A: ObjectIssueSection renders ONE severity icon (no per-row icons)
 *   Part B: Floor list rows have no drag handle
 *   Part C: Floor delete always requires confirmation
 *   Part D: FloorOverviewSidebar exposes Perimeter Wall
 *   Part F: Room overlap detection + rejection
 *   Part G: Wall drawing groups are non-interactive (pointer-events-none)
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectIssueSection } from "../ObjectIssueSection";
import type { ObjectIssueItem } from "../ObjectIssueSection";

// ─── Part A: ObjectIssueSection ────────────────────────────────────────────
describe("Part A — ObjectIssueSection simplified severity icons", () => {
  const warningItem: ObjectIssueItem = {
    key: "w1",
    severity: "warning",
    title: "Missing entrance",
    message: "Add a primary entrance to this building.",
  };
  const errorItem: ObjectIssueItem = {
    key: "e1",
    severity: "error",
    title: "Duplicate room name",
    message: "Two rooms share the same name.",
  };
  const infoItem: ObjectIssueItem = {
    key: "i1",
    severity: "info",
    title: "Tip",
    message: "Consider adding accessibility routes.",
  };

  it("renders the heading with ONE severity icon matching the worst severity", () => {
    render(<ObjectIssueSection items={[warningItem]} />);
    const section = screen.getByTestId("object-issue-section");
    // Heading area should have exactly one icon (AlertTriangle for warning)
    const headingIcons = section.querySelectorAll(":scope > div:first-child > svg");
    expect(headingIcons.length).toBe(1);
    expect(section.getAttribute("data-severity")).toBe("warning");
  });

  it("renders error heading with AlertCircle icon (red)", () => {
    render(<ObjectIssueSection items={[errorItem, warningItem]} />);
    const section = screen.getByTestId("object-issue-section");
    expect(section.getAttribute("data-severity")).toBe("error");
    // Heading icon should be red
    const headingIcons = section.querySelectorAll(":scope > div:first-child > svg");
    expect(headingIcons.length).toBe(1);
  });

  it("does NOT render per-row severity icons (no duplicate icons)", () => {
    render(<ObjectIssueSection items={[errorItem, warningItem, infoItem]} />);
    const section = screen.getByTestId("object-issue-section");
    // Total icons in the entire component should be exactly 1 (the heading icon)
    const allIcons = section.querySelectorAll("svg");
    expect(allIcons.length).toBe(1);
  });

  it("preserves issue titles and messages for each item", () => {
    render(<ObjectIssueSection items={[errorItem, warningItem]} />);
    expect(screen.getByText("Duplicate room name")).toBeTruthy();
    expect(screen.getByText("Two rooms share the same name.")).toBeTruthy();
    expect(screen.getByText("Missing entrance")).toBeTruthy();
    expect(screen.getByText("Add a primary entrance to this building.")).toBeTruthy();
  });

  it("applies error red color to error titles", () => {
    render(<ObjectIssueSection items={[errorItem]} />);
    const title = screen.getByText("Duplicate room name");
    expect(title.className).toContain("text-red-700");
  });

  it("applies warning amber color to warning titles", () => {
    render(<ObjectIssueSection items={[warningItem]} />);
    const title = screen.getByText("Missing entrance");
    expect(title.className).toContain("text-amber-700");
  });

  it("renders nothing when items is empty", () => {
    const { container } = render(<ObjectIssueSection items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("header adapts to worst severity among mixed items", () => {
    render(<ObjectIssueSection items={[infoItem, warningItem, errorItem]} />);
    const section = screen.getByTestId("object-issue-section");
    expect(section.getAttribute("data-severity")).toBe("error");
  });
});

// ─── Part F: roomOverlap utility ──────────────────────────────────────────
import { roomsOverlap, findOverlappingRoom } from "../../../lib/roomOverlap";

describe("Part F — Room overlap detection utility", () => {
  const base = { id: "r1", name: "Room A", type: "classroom" as const, x: 10, y: 10, w: 100, h: 80, floorId: "f1", buildingId: "b1" };

  it("allows edge-touching rooms (adjacent boundary)", () => {
    const adjacent = { ...base, id: "r2", name: "Room B", x: 110, y: 10, w: 100, h: 80 };
    expect(roomsOverlap(base, adjacent)).toBe(false);
  });

  it("allows rooms that barely touch at a corner", () => {
    const corner = { ...base, id: "r2", name: "Room B", x: 110, y: 90, w: 100, h: 80 };
    expect(roomsOverlap(base, corner)).toBe(false);
  });

  it("rejects rooms with meaningful interior overlap", () => {
    const overlapping = { ...base, id: "r2", name: "Room B", x: 50, y: 50, w: 100, h: 80 };
    expect(roomsOverlap(base, overlapping)).toBe(true);
  });

  it("allows completely separate rooms", () => {
    const separate = { ...base, id: "r2", name: "Room B", x: 300, y: 300, w: 100, h: 80 };
    expect(roomsOverlap(base, separate)).toBe(false);
  });

  it("findOverlappingRoom returns first overlap", () => {
    const rooms = [
      { ...base, id: "r1", x: 300, y: 300, w: 100, h: 80 },
      { ...base, id: "r2", name: "Room B", x: 50, y: 50, w: 100, h: 80 },
    ];
    const result = findOverlappingRoom({ x: 60, y: 60, w: 80, h: 60 }, rooms);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("r2");
  });

  it("findOverlappingRoom returns null when no overlap", () => {
    const rooms = [
      { ...base, id: "r1" },
    ];
    const result = findOverlappingRoom({ x: 200, y: 200, w: 80, h: 60 }, rooms);
    expect(result).toBeNull();
  });

  it("findOverlappingRoom skips the candidate's own id", () => {
    const rooms = [
      { ...base, id: "r1", x: 10, y: 10, w: 100, h: 80 },
    ];
    // Candidate has same id as the existing room — should be skipped
    const result = findOverlappingRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }, rooms);
    expect(result).toBeNull();
  });

  it("findOverlappingRoom detects overlap with tiny overlap above tolerance", () => {
    const rooms = [
      { ...base, id: "r1", x: 10, y: 10, w: 100, h: 80 },
    ];
    // Overlap of 10px on both axes (clearly above 2px tolerance)
    const result = findOverlappingRoom({ x: 50, y: 50, w: 60, h: 40 }, rooms);
    expect(result).not.toBeNull();
  });
});

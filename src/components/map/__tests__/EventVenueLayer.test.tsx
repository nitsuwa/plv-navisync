import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campus } from "../../map-builder/types";
import { eventPreviewFixture } from "../../../test/eventFullPackFixtures";
import { EventVenueLayer } from "../EventVenueLayer";

const campus = {
  id: "campus-a", canvasW: 900, canvasH: 600, markers: [],
  buildings: [{ id: "library", name: "Library", visible: true, x: 40, y: 80, width: 100, height: 90, floors: [{ id: "floor-uuid", buildingId: "library", number: 1, label: "Floor 1", rooms: [] }] }],
} as unknown as Campus;

describe("EventVenueLayer", () => {
  it("renders a large interactive location marker and opens the selected event location", () => {
    const event = eventPreviewFixture();
    const onSelect = vi.fn();
    render(<svg viewBox="0 0 900 600"><EventVenueLayer campus={campus} events={[event]} zoom={1} onSelect={onSelect} /></svg>);
    fireEvent.click(screen.getByRole("button", { name: /Campus Grounds \(approximate\), 1 event/i }));
    expect(onSelect).toHaveBeenCalledWith("event-a", "grounds");
  });

  it("shows a chooser when events share a venue", () => {
    const first = eventPreviewFixture({ locations: [{ id: "floor", locationRef: { type: "building", buildingId: "library", floorId: "library-f1", label: "Library — Floor 1" }, eventFurniture: [], eventLabels: [] }] });
    const second = eventPreviewFixture({ id: "event-b", title: "Open House", locations: [{ id: "floor-b", locationRef: { type: "building", buildingId: "library", floorId: "library-f1", label: "Library — Floor 1" }, eventFurniture: [], eventLabels: [] }] });
    const onSelect = vi.fn();
    render(<svg viewBox="0 0 900 600"><EventVenueLayer campus={campus} events={[first, second]} onSelect={onSelect} /></svg>);
    fireEvent.click(screen.getByRole("button", { name: /Library, 2 events/i }));
    fireEvent.click(screen.getByRole("button", { name: /View Open House/i }));
    expect(onSelect).toHaveBeenCalledWith("event-b", "floor-b");
  });
});

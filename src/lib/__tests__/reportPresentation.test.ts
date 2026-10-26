import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { presentReport } from "../reportPresentation";

const campus = {
  id: "campus-a",
  buildings: [{
    id: "sc",
    name: "STUDENT CENTER BUILDING",
    floors: [{ id: "sc-g", number: 1, label: "Ground Floor", rooms: [{ id: "copy", name: "COPYSHOP" }] }],
  }],
  markers: [{ id: "gate-1", name: "Main Gate" }],
} as unknown as Campus;

const base = {
  title: "Facility Problem at STUDENT CENTER BUILDING · Ground Floor · COPYSHOP",
  description: "Facility Problem reported at STUDENT CENTER BUILDING · Ground Floor · COPYSHOP.",
  category: "broken_equipment",
  campusId: "campus-a",
  buildingId: "sc",
  floorId: "sc-g",
  roomId: "copy",
};

describe("presentReport", () => {
  it("titles a room report with the room and puts its building and floor beneath", () => {
    expect(presentReport(base, [campus])).toEqual({
      place: "COPYSHOP",
      context: "STUDENT CENTER BUILDING · Ground Floor",
      issue: "Facility Problem",
      details: null,
    });
  });

  it("keeps what the student actually wrote as the description", () => {
    expect(presentReport({ ...base, description: "The printer is jammed." }, [campus]).details).toBe("The printer is jammed.");
  });

  it("titles a building-level report with the building", () => {
    const result = presentReport({
      ...base,
      title: "Broken Light at STUDENT CENTER BUILDING",
      description: "Broken Light reported at STUDENT CENTER BUILDING.",
      category: "electrical_issue",
      floorId: null,
      roomId: null,
    }, [campus]);
    expect(result).toMatchObject({ place: "STUDENT CENTER BUILDING", context: null, issue: "Broken Light", details: null });
  });

  it("titles a campus-place report with the place", () => {
    const result = presentReport({ ...base, title: "Safety Hazard at Main Gate", buildingId: null, floorId: null, roomId: null, campusPlaceId: "gate-1" }, [campus]);
    expect(result).toMatchObject({ place: "Main Gate", issue: "Safety Hazard" });
  });

  it("falls back to the title's location when the campus data is unavailable", () => {
    expect(presentReport(base, [])).toMatchObject({
      place: "COPYSHOP",
      context: "STUDENT CENTER BUILDING · Ground Floor",
      issue: "Facility Problem",
    });
  });

  it("uses the category for older titles without an issue prefix", () => {
    const result = presentReport({ ...base, title: "Copyshop printer", description: "Jammed." }, [campus]);
    expect(result).toMatchObject({ place: "COPYSHOP", issue: "Facility Problem", details: "Jammed." });
  });
});

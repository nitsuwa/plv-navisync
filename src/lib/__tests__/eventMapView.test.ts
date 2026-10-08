import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { eventPreviewFixture } from "../../test/eventFullPackFixtures";
import { buildEventVenues, resolveEventLocation, selectedEventLocation, visibleEventCards, eventVenueCandidates, eventLocationOnMap } from "../eventMapView";

const campus = {
  id: "campus-a", canvasW: 900, canvasH: 600,
  markers: [{ id: "plaza", name: "Main Quad", type: "grounds", x: 210, y: 170, color: "#fff" }],
  buildings: [{ id: "science", name: "Science Hall", visible: true, x: 30, y: 50, width: 100, height: 80, floors: [
    { id: "actual-floor-uuid", buildingId: "science", number: 2, label: "Floor 2", rooms: [] },
  ] }],
} as unknown as Campus;

describe("event map view model", () => {
  it('retains a selected room layout on its floor without choosing another requested room', () => {
    const event=eventPreviewFixture({locations:[
      {id:'room-a',locationRef:{type:'room',buildingId:'science',floorId:'science-f2',roomId:'a',label:'Room A'},eventFurniture:[],eventLabels:[]},
      {id:'room-b',locationRef:{type:'room',buildingId:'science',floorId:'science-f2',roomId:'b',label:'Room B'},eventFurniture:[],eventLabels:[]},
    ]});
    expect(eventLocationOnMap(event,'science-f2','room-b')?.id).toBe('room-b');
    expect(eventLocationOnMap(event,'science-f3','room-b')).toBeNull();
    expect(eventLocationOnMap(event,null,'room-b')).toBeNull();
  });
  it('scopes pins to the selected visible event even when its phase changes outside the list filter', () => {
    const now = Date.parse('2026-10-08T02:00:00Z');
    const selected = eventPreviewFixture();
    const other = eventPreviewFixture({ id: 'other', title: 'Another event', dateStart: '2026-10-08T04:00:00Z' });
    expect(eventVenueCandidates([selected, other], now, 'upcoming', selected.id).map(event => event.id)).toEqual(['event-a']);
    expect(eventVenueCandidates([selected, other], now, 'upcoming', null).map(event => event.id)).toEqual(['other']);
    expect(eventVenueCandidates([selected], Date.parse('2026-10-09T00:00:00Z'), 'all', selected.id)).toEqual([]);
  });
  it("centers the grounds venue at the visible central monument rather than an event marker or edge anchor", () => {
    const grounds = { ...campus, decorAssets: [{ id: "monument", type: "monument", x: 430, y: 410, visible: true }] } as Campus;
    const event = eventPreviewFixture({ markers: [{ x: 880, y: 20, color: "#fff", label: "Stage" }] });
    expect(buildEventVenues(grounds, [event]).find(venue => venue.id === "campus")).toMatchObject({ x: 430, y: 410, label: "Campus Grounds" });
  });

  it("keeps one event card with every requested venue and sorts ongoing first", () => {
    const now = Date.parse("2026-10-08T02:00:00Z");
    const multi = eventPreviewFixture({ locations: [
      { id: "grounds", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] },
      { id: "science-f2", locationRef: { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Hall — Floor 2" }, eventFurniture: [], eventLabels: [] },
    ] });
    const ongoing = eventPreviewFixture({ id: "event-b", dateStart: "2026-10-08T00:00:00.000Z" });
    expect(visibleEventCards([multi, ongoing], now, "all").map((item) => [item.id, item.phase])).toEqual([
      ["event-a", "ongoing"], ["event-b", "ongoing"],
    ]);
    expect(visibleEventCards([multi], now, "all")[0].locations).toHaveLength(2);
  });

  it("resolves only an exact published building/floor identity", () => {
    expect(resolveEventLocation(campus, { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Floor 2" })?.kind).toBe("floor");
    expect(resolveEventLocation(campus, { type: "building", buildingId: "science", floorId: "science-f3", label: "wrong floor" })).toBeNull();
    expect(resolveEventLocation(campus, { type: "building", buildingId: "other", floorId: "science-f2", label: "other campus" })).toBeNull();
  });

  it("groups shared venues and uses an approximate authored grounds anchor", () => {
    const event = eventPreviewFixture({ locations: [
      { id: "grounds", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] },
      { id: "science", locationRef: { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Hall Floor 2" }, eventFurniture: [], eventLabels: [] },
    ] });
    const venues = buildEventVenues(campus, [event, eventPreviewFixture({ id: "event-b", locations: [event.locations[1]] })]);
    expect(venues.find((item) => item.id === "campus")).toMatchObject({ x: 210, y: 170, label: "Main Quad" });
    expect(venues.find((item) => item.id === "building:science")?.eventIds).toEqual(["event-a", "event-b"]);
  });

  it("derives selection from fresh feed data and drops removed locations", () => {
    const event = eventPreviewFixture();
    expect(selectedEventLocation([event], event.id, "grounds")?.event.title).toBe("College Week");
    expect(selectedEventLocation([event], event.id, "removed")).toBeNull();
    expect(selectedEventLocation([], event.id, "grounds")).toBeNull();
  });
});

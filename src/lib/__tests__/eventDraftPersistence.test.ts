import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEventLayoutDraft,
  eventLayoutDraftStorageKey,
  readEventLayoutDraft,
  writeEventLayoutDraft,
} from "../eventDraftPersistence";
import type { EventLocationRef, FloorFurniture } from "../../components/map-builder/types";

const locationRef: EventLocationRef = {
  type: "building",
  buildingId: "science",
  floorId: "science-f2",
  label: "Science Building — Floor 2",
};

const chair: FloorFurniture = {
  id: "chair-1",
  type: "chair",
  name: "Chair",
  category: "event",
  x: 40,
  y: 56,
  width: 24,
  height: 24,
  rotation: 0,
  color: "#0ea5e9",
  layer: "events",
};

describe("event draft persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips an event layout draft per event location", () => {
    writeEventLayoutDraft("event-1", locationRef, [chair], []);

    expect(readEventLayoutDraft("event-1", locationRef)).toEqual(expect.objectContaining({
      version: 1,
      overlayId: "event-1",
      locationKey: "science-science-f2",
      eventFurniture: [chair],
      eventLabels: [],
    }));
    expect(localStorage.getItem(eventLayoutDraftStorageKey("event-1", locationRef))).toBeTruthy();

    clearEventLayoutDraft("event-1", locationRef);
    expect(readEventLayoutDraft("event-1", locationRef)).toBeNull();
  });

  it("ignores malformed drafts and drafts from another event", () => {
    localStorage.setItem(eventLayoutDraftStorageKey("event-1", locationRef), "not-json");
    expect(readEventLayoutDraft("event-1", locationRef)).toBeNull();

    localStorage.setItem(eventLayoutDraftStorageKey("event-1", locationRef), JSON.stringify({
      version: 1,
      overlayId: "event-2",
      locationKey: "science-science-f2",
      eventFurniture: [chair],
      eventLabels: [],
    }));
    expect(readEventLayoutDraft("event-1", locationRef)).toBeNull();
  });
});

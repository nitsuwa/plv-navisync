import { beforeEach, describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import {
  campusDraftStorageKey,
  canPersistCampusStructure,
  clearCampusDraft,
  readCampusDraft,
  restoreCampusDraft,
  shouldPersistCampusDraft,
  writeCampusDraft,
} from "../campusDraftPersistence";

function campus(over: Partial<Campus> = {}): Campus {
  return {
    id: "campus-1",
    name: "Main Campus",
    code: "MAIN",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    decorAssets: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    databaseUpdatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("campus draft recovery", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips an unsaved draft and restores it over the same server version", () => {
    const persisted = campus();
    const draft = campus({ buildings: [{ id: "b1" } as Campus["buildings"][number]] });
    writeCampusDraft(draft, persisted);

    expect(readCampusDraft(persisted.id)?.campus).toEqual(draft);
    expect(restoreCampusDraft(persisted)).toEqual(draft);
  });

  it("drops a draft when the server version changed elsewhere", () => {
    const persisted = campus();
    writeCampusDraft(campus({ name: "Draft" }), persisted);
    const newer = campus({ databaseUpdatedAt: "2026-01-02T00:00:00.000Z" });

    expect(restoreCampusDraft(newer)).toEqual(newer);
    expect(sessionStorage.getItem(campusDraftStorageKey(persisted.id))).toBeNull();
  });

  it("clears a draft after a successful save", () => {
    writeCampusDraft(campus({ name: "Draft" }), campus());
    clearCampusDraft("campus-1");
    expect(readCampusDraft("campus-1")).toBeNull();
  });

  it("does not treat a pre-hydration empty snapshot as a writable draft", () => {
    const persisted = campus({
      buildings: [{ id: "b1" } as Campus["buildings"][number]],
      markers: [{ id: "gate-1" } as Campus["markers"][number]],
    });
    const temporary = campus({ id: persisted.id, buildings: [], markers: [], paths: [], navNodes: [], navEdges: [] });
    expect(shouldPersistCampusDraft(temporary)).toBe(false);
    expect(shouldPersistCampusDraft(temporary, JSON.stringify(persisted))).toBe(true);
    expect(shouldPersistCampusDraft(persisted, JSON.stringify(persisted))).toBe(false);
  });

  it("blocks structure writes until hydration completes for the same campus", () => {
    const persisted = campus({ buildings: [{ id: "b1" } as Campus["buildings"][number]] });
    const temporary = campus({ buildings: [] });
    const baseline = JSON.stringify(persisted);
    expect(canPersistCampusStructure(temporary, baseline, false)).toBe(false);
    expect(canPersistCampusStructure(temporary, undefined, true)).toBe(false);
    expect(canPersistCampusStructure(temporary, baseline, true)).toBe(true);
    expect(canPersistCampusStructure(campus({ id: "other" }), baseline, true)).toBe(false);
  });

  it("does not restore a legacy lightweight draft over a complete first-load structure", () => {
    const persisted = campus({
      previewBuildingsLoaded: true,
      buildings: [{ id: "b1" } as Campus["buildings"][number]],
      paths: [{ id: "path-1" } as Campus["paths"][number]],
    });
    const legacyDraft = campus({ buildings: [{ id: "b1" } as Campus["buildings"][number]] });
    writeCampusDraft(legacyDraft, persisted);

    expect(restoreCampusDraft(persisted)).toEqual(persisted);
    expect(readCampusDraft(persisted.id)).toBeNull();
  });
});

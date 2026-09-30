import { beforeEach, describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS } from "../../services/settingsService";
import { chooseInitialCampus, lastCampusStorageKey } from "../usePublishedCampus";

const published = (id: string, isDefault = false) => ({
  id,
  name: id,
  isDefault,
  lifecycleStatus: "published",
  publishStatus: "published",
} as unknown as Campus);

const comingSoon = ({
  id: "coming-soon",
  name: "Coming Soon",
  lifecycleStatus: "coming_soon",
  publishStatus: "draft",
} as unknown as Campus);

describe("student campus defaults", () => {
  beforeEach(() => localStorage.clear());

  it("uses a configured published campus ahead of the campus-table default", () => {
    const selected = chooseInitialCampus(
      [published("database-default", true), published("configured")],
      { ...DEFAULT_PUBLIC_PLATFORM_SETTINGS, defaultCampusId: "configured" },
      "student-1",
    );
    expect(selected?.id).toBe("configured");
  });

  it("does not use a Coming Soon campus as the default map", () => {
    const selected = chooseInitialCampus(
      [comingSoon, published("published-default", true)],
      { ...DEFAULT_PUBLIC_PLATFORM_SETTINGS, defaultCampusId: "coming-soon" },
      "student-1",
    );
    expect(selected?.id).toBe("published-default");
  });

  it("restores a remembered available campus when enabled", () => {
    localStorage.setItem(lastCampusStorageKey("student-1"), "campus-b");
    const selected = chooseInitialCampus(
      [published("campus-a", true), published("campus-b")],
      { ...DEFAULT_PUBLIC_PLATFORM_SETTINGS, defaultCampusId: "campus-a", rememberLastCampus: true },
      "student-1",
    );
    expect(selected?.id).toBe("campus-b");
  });

  it("ignores remembered selection when Remember Last Campus is off", () => {
    localStorage.setItem(lastCampusStorageKey("student-1"), "campus-b");
    const selected = chooseInitialCampus(
      [published("campus-a", true), published("campus-b")],
      { ...DEFAULT_PUBLIC_PLATFORM_SETTINGS, defaultCampusId: "campus-a", rememberLastCampus: false },
      "student-1",
    );
    expect(selected?.id).toBe("campus-a");
  });
});

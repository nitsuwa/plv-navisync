import { describe, expect, it } from "vitest";
import { deriveCampusLifecycleStatus, selectActiveCampus, validateCampusImage, type CampusRow } from "../campusService";
import type { Campus } from "../../components/map-builder/types";

const row = (status: string, latest: string | null = null) => ({
  status, latest_published_version_id: latest,
}) as CampusRow;

const campus = (id: string, status: Campus["status"] = "active", isDefault = false) => ({
  id, status, isDefault,
}) as Campus;

describe("campus lifecycle contract", () => {
  it("derives draft, unpublished, published, and archived states", () => {
    expect(deriveCampusLifecycleStatus(row("draft"))).toBe("draft");
    expect(deriveCampusLifecycleStatus(row("draft", "version-id"))).toBe("unpublished");
    expect(deriveCampusLifecycleStatus(row("published", "version-id"))).toBe("published");
    expect(deriveCampusLifecycleStatus(row("archived", "version-id"))).toBe("archived");
  });

  it("selects a preferred campus, then default, then first, with a safe empty state", () => {
    const campuses = [campus("archived", "archived", true), campus("first"), campus("default", "active", true)];
    expect(selectActiveCampus(campuses, "first")?.id).toBe("first");
    expect(selectActiveCampus(campuses)?.id).toBe("default");
    expect(selectActiveCampus([campus("only")])?.id).toBe("only");
    expect(selectActiveCampus([])).toBeNull();
    expect(selectActiveCampus([campus("archived", "archived")])).toBeNull();
  });

  it("rejects unsupported and oversized campus images before creating a row", () => {
    expect(() => validateCampusImage(new Blob(["x"], { type: "image/svg+xml" }))).toThrow(/JPEG/);
    expect(() => validateCampusImage(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }))).toThrow(/5 MB/);
    expect(() => validateCampusImage(new Blob(["png"], { type: "image/png" }))).not.toThrow();
  });
});

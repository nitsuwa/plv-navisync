import { describe, expect, it } from "vitest";
import { formatActivityTimestamp, formatAdminActivity } from "../adminActivityPresentation";
import type { ActivityLogRow } from "../activityLogService";

function row(overrides: Partial<ActivityLogRow> = {}): ActivityLogRow {
  return {
    id: "log-1",
    action: "event_overlay.approved",
    actor_id: "admin-1",
    campus_id: "campus-1",
    entity_type: "event_overlay",
    entity_id: "overlay-1",
    metadata: {},
    created_at: "2026-09-29T14:40:27.075Z",
    ...overrides,
  };
}

describe("Admin activity presentation", () => {
  it("uses the same human-readable event wording for log and notification surfaces", () => {
    const formatted = formatAdminActivity(row(), {
      actorName: "Demo Administrator",
      campusName: "Main Campus",
      targetName: "College Week 2026",
    });

    expect(formatted.title).toBe("Event overlay approved");
    expect(formatted.description).toBe("“College Week 2026” was approved for Main Campus by Demo Administrator.");
    expect(formatted.notificationText).toBe("“College Week 2026” was approved.");
    expect(formatted.category).toBe("Events");
    expect(formatted.technicalAction).toBe("event_overlay.approved");
  });

  it("adds campus context to a published map entry", () => {
    const formatted = formatAdminActivity(row({
      action: "campus_version.published",
      entity_type: "campus_versions",
      entity_id: "version-1",
    }), { actorName: "Demo Administrator", campusName: "Main Campus" });

    expect(formatted.title).toBe("Campus map published");
    expect(formatted.description).toBe("Main Campus map was published by Demo Administrator.");
    expect(formatted.notificationText).toBe("Main Campus map was published.");
    expect(formatted.category).toBe("Campus");
  });

  it("humanizes unknown dotted and underscored actions instead of exposing the code", () => {
    const formatted = formatAdminActivity(row({ action: "room_access.updated" }));
    expect(formatted.title).toBe("Room access updated");
    expect(formatted.title).not.toContain(".");
    expect(formatted.title).not.toContain("_");
  });

  it("keeps legacy activity rows readable when metadata and actor are missing", () => {
    const formatted = formatAdminActivity(row({
      action: "campus version.published",
      metadata: null,
      actor_id: null,
      campus_id: null,
      entity_type: null,
      entity_id: null,
    }));

    expect(formatted.title).toBe("Campus version published");
    expect(formatted.actorLabel).toBe("System");
    expect(formatted.description).not.toContain("undefined");
    expect(formatted.description).not.toContain("null");
  });

  it("uses safe fallbacks for malformed activity fields", () => {
    const malformed = row({
      action: null as unknown as string,
      entity_type: null,
      metadata: ["unexpected"] as unknown as ActivityLogRow["metadata"],
      created_at: null as unknown as string,
    });

    expect(() => formatAdminActivity(malformed)).not.toThrow();
    const formatted = formatAdminActivity(malformed);
    expect(formatted.title).toBe("Activity recorded");
    expect(formatted.category).toBe("System");
    expect(formatted.timestamp).toBe("Date unavailable");
  });

  it("formats older campus activity with null metadata and missing actors", () => {
    const formatted = formatAdminActivity(row({
      action: "campus version.published",
      metadata: null,
      actor_id: null,
      campus_id: null,
      entity_type: null,
      entity_id: null,
    }));

    expect(formatted.title).toBe("Campus version published");
    expect(formatted.actorLabel).toBe("System");
    expect(formatted.description).not.toContain("undefined");
    expect(formatted.description).not.toContain("null");
  });

  it("uses safe fallbacks for unexpected activity row fields", () => {
    const malformed = row({
      action: null as unknown as string,
      entity_type: null,
      metadata: ["unexpected"] as unknown as ActivityLogRow["metadata"],
      created_at: null as unknown as string,
    });
    expect(() => formatAdminActivity(malformed, null as unknown as undefined)).not.toThrow();
    const formatted = formatAdminActivity(malformed);
    expect(formatted.title).toBe("Activity recorded");
    expect(formatted.category).toBe("System");
    expect(formatted.timestamp).toBe("Date unavailable");
  });

  it("formats timestamps as local date and time without showing the stored ISO string", () => {
    const formatted = formatActivityTimestamp("2026-09-29T14:40:27.07501+00:00");
    expect(formatted).toContain("Sep 29, 2026");
    expect(formatted).not.toContain("T14:");
    expect(formatted).not.toContain("+00:00");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  detectReportStatusChanges,
  countUnseenReportChanges,
  markReportStatusSeen,
  countUnseenLogs,
  markLogsSeen,
} from "../notificationService";

describe("notificationService — report status changes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports no changes on first visit", () => {
    const reports = [{ id: "r1", title: "Broken light", status: "pending" }];
    expect(detectReportStatusChanges(reports)).toHaveLength(0);
    expect(countUnseenReportChanges(reports)).toBe(0);
  });

  it("detects a status change after a snapshot exists", () => {
    markReportStatusSeen([{ id: "r1", status: "pending" }]);
    const reports = [{ id: "r1", title: "Broken light", status: "resolved" }];
    const changes = detectReportStatusChanges(reports);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: "r1", from: "Pending", to: "Resolved" });
    expect(countUnseenReportChanges(reports)).toBe(1);
  });

  it("clears the count once marked seen", () => {
    markReportStatusSeen([{ id: "r1", status: "pending" }]);
    const updated = [{ id: "r1", title: "Broken light", status: "resolved" }];
    expect(countUnseenReportChanges(updated)).toBe(1);
    markReportStatusSeen(updated);
    expect(countUnseenReportChanges(updated)).toBe(0);
  });

  it("ignores brand-new reports (not status changes)", () => {
    markReportStatusSeen([{ id: "r1", status: "pending" }]);
    const reports = [
      { id: "r1", status: "pending" },
      { id: "r2", status: "pending" }, // new
    ];
    expect(countUnseenReportChanges(reports)).toBe(0);
  });
});

describe("notificationService — admin logs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("counts only logs newer than the last seen timestamp", () => {
    const old = { created_at: new Date(Date.now() - 60_000).toISOString() };
    const fresh = { created_at: new Date().toISOString() };
    expect(countUnseenLogs([old, fresh])).toBe(2);
    markLogsSeen();
    expect(countUnseenLogs([old, fresh])).toBe(0);
  });
});

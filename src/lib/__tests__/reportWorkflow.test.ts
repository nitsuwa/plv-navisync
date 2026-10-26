import { describe, expect, it } from "vitest";
import {
  allowedNextStatuses,
  isReopen,
  reporterReopenState,
  transitionRequirement,
  validateTransition,
} from "../reportWorkflow";

const DAY = 24 * 60 * 60 * 1000;

describe("report workflow", () => {
  it("won't let a pending report jump straight to resolved", () => {
    expect(allowedNextStatuses("pending")).not.toContain("resolved");
    expect(validateTransition("pending", "resolved", "Fixed the light in the hallway.")).toBe("Review the report before resolving it.");
  });

  it("allows the normal path from review to resolution", () => {
    expect(validateTransition("pending", "under_review", "")).toBeNull();
    expect(validateTransition("under_review", "in_progress", "")).toBeNull();
    expect(validateTransition("in_progress", "resolved", "Replaced the ceiling light on Oct 27.")).toBeNull();
  });

  it("requires a meaningful reason to resolve or dismiss", () => {
    expect(validateTransition("in_progress", "resolved", "ok")).toMatch(/at least 15 characters/);
    expect(validateTransition("pending", "rejected", "")).toMatch(/at least 15 characters/);
    expect(validateTransition("pending", "rejected", "Duplicate of an earlier report.")).toBeNull();
  });

  it("only reopens closed reports back into review, with a reason", () => {
    expect(isReopen("resolved", "under_review")).toBe(true);
    expect(allowedNextStatuses("resolved")).toEqual(["under_review"]);
    expect(allowedNextStatuses("rejected")).toEqual(["under_review"]);
    expect(transitionRequirement("resolved", "under_review").noteRequired).toBe(true);
    expect(validateTransition("resolved", "under_review", "short")).toMatch(/at least 10 characters/);
    expect(validateTransition("resolved", "pending", "Reporter says it is broken again.")).toMatch(/isn't allowed/);
  });

  it("keeps notes optional for in-between steps", () => {
    expect(transitionRequirement("pending", "under_review").noteRequired).toBe(false);
    expect(validateTransition("under_review", "in_progress", "")).toBeNull();
  });

  it("lets a reporter reopen a closed report only within the window", () => {
    const now = Date.parse("2026-10-26T00:00:00Z");
    expect(reporterReopenState({ status: "resolved", updatedAt: new Date(now - 3 * DAY).toISOString() }, now)).toEqual({ allowed: true });
    expect(reporterReopenState({ status: "rejected", updatedAt: new Date(now - 31 * DAY).toISOString() }, now).allowed).toBe(false);
    expect(reporterReopenState({ status: "in_progress", updatedAt: new Date(now).toISOString() }, now).allowed).toBe(false);
  });
});

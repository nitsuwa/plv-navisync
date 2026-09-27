import { describe, expect, it } from "vitest";
import { formatEventSubmissionTime } from "../eventSubmissionTime";

describe("formatEventSubmissionTime", () => {
  it("shows an explicit Philippine submission time", () => {
    expect(formatEventSubmissionTime("2026-09-27T16:00:00.000Z")).toMatch(/Sep 28, 2026.*12:00.*PHT/);
  });

  it("does not substitute a creation time when no submission was recorded", () => {
    expect(formatEventSubmissionTime()).toBe("Submission time unavailable");
  });
});

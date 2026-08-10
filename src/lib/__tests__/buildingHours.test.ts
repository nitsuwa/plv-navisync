import { describe, expect, it } from "vitest";
import { getOpenStatus, parseHoursString, BUILDING_HOURS } from "../buildingHours";

describe("parseHoursString", () => {
  it("parses a legacy operating-hours string", () => {
    expect(parseHoursString("Mon–Fri 7:00 AM – 8:00 PM")).toEqual({ open: 7, close: 20 });
  });

  it("handles noon and midnight", () => {
    expect(parseHoursString("Mon–Fri 12:00 PM – 5:00 PM")).toEqual({ open: 12, close: 17 });
    expect(parseHoursString("Mon–Sat 12:00 AM – 6:00 AM")).toEqual({ open: 0, close: 6 });
  });

  it("returns null for unknown formats", () => {
    expect(parseHoursString(null)).toBeNull();
    expect(parseHoursString("Open 24 hours")).toBeNull();
    expect(parseHoursString("")).toBeNull();
  });
});

describe("getOpenStatus", () => {
  // Monday 2026-08-10 (a weekday).
  const monday = new Date("2026-08-10T00:00:00");

  it("returns Open during operating hours for seeded campus buildings", () => {
    const res = getOpenStatus({ id: "b_scb", code: "SCB" }, new Date("2026-08-10T10:00:00"));
    expect(res.status).toBe("Open");
    expect(res.hoursLabel).toContain("7");
  });

  it("returns Closed outside operating hours", () => {
    const res = getOpenStatus({ id: "b_caba", code: "CABA" }, new Date("2026-08-10T21:00:00"));
    expect(res.status).toBe("Closed");
  });

  it("returns Busy within 30 minutes of closing", () => {
    const res = getOpenStatus({ id: "b_scb", code: "SCB" }, new Date("2026-08-10T19:45:00"));
    expect(res.status).toBe("Busy");
  });

  it("treats the guard house as open 24 hours", () => {
    const res = getOpenStatus({ id: "b_guard", code: "GUARD" }, new Date("2026-08-10T03:00:00"));
    expect(res.status).toBe("Open");
    expect(res.hoursLabel).toContain("24");
  });

  it("falls back to parsing the legacy operating_hours string", () => {
    const res = getOpenStatus(
      { id: "b1", code: "B1", operating_hours: "Mon–Fri 7:00 AM – 8:00 PM" },
      new Date("2026-08-10T10:00:00")
    );
    expect(res.status).toBe("Open");
  });

  it("returns a null status when no hours are known", () => {
    const res = getOpenStatus({ id: "unknown", code: "X" }, monday);
    expect(res.status).toBeNull();
  });

  it("matches the registry ids used by the seeded campus", () => {
    for (const id of ["b_scb", "b_canteen", "b_caba", "b_coed", "b_ceit", "b_guard"]) {
      expect(BUILDING_HOURS[id]).toBeDefined();
    }
  });
});

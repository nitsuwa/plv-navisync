import { describe, expect, it } from "vitest";
import { selectEmergencyRouteFailureReason, type EmergencyRouteAvailabilityInput } from "../emergencyRouteStatus";

const state = (overrides: Partial<EmergencyRouteAvailabilityInput> = {}): EmergencyRouteAvailabilityInput => ({
  assignedAssemblyPointCount: 1,
  connectedAssemblyPointCount: 1,
  eligibleAssignedAssemblyPointCount: 1,
  completeGraphRouteCount: 1,
  ...overrides,
});

describe("SOS route status reason selection", () => {
  it("reports a missing assigned Assembly Point before route calculation details", () => {
    expect(selectEmergencyRouteFailureReason(state({
      assignedAssemblyPointCount: 0,
      connectedAssemblyPointCount: 0,
      eligibleAssignedAssemblyPointCount: 0,
      completeGraphRouteCount: 0,
      emergencySafeEgressAvailable: true,
    }))).toBe("no_assigned_assembly_point");
  });

  it("reports a missing emergency-safe egress before claiming the Assembly Point is missing", () => {
    expect(selectEmergencyRouteFailureReason(state({
      assignedAssemblyPointCount: 0,
      connectedAssemblyPointCount: 0,
      eligibleAssignedAssemblyPointCount: 0,
      completeGraphRouteCount: 0,
      emergencySafeEgressAvailable: false,
    }))).toBe("no_safe_route");
  });

  it("distinguishes an assigned but disconnected Assembly Point", () => {
    expect(selectEmergencyRouteFailureReason(state({
      connectedAssemblyPointCount: 0,
      eligibleAssignedAssemblyPointCount: 0,
      completeGraphRouteCount: 0,
      emergencySafeEgressAvailable: false,
    }))).toBe("assembly_point_disconnected");
  });

  it("reports a missing complete emergency-safe route when the point itself is valid", () => {
    expect(selectEmergencyRouteFailureReason(state({ completeGraphRouteCount: 0 }))).toBe("no_safe_route");
  });

  it("does not require stale per-room route approval when a complete graph route exists", () => {
    expect(selectEmergencyRouteFailureReason(state())).toBeNull();
  });
});

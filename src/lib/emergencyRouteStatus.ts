export type EmergencyRouteFailureReason =
  | "no_assigned_assembly_point"
  | "assembly_point_disconnected"
  | "no_safe_route";

export type EmergencyRouteAvailabilityInput = {
  assignedAssemblyPointCount: number;
  connectedAssemblyPointCount: number;
  eligibleAssignedAssemblyPointCount: number;
  completeGraphRouteCount: number;
  emergencySafeEgressAvailable?: boolean;
};

/** Select one primary blocker from already-validated route and destination state. */
export function selectEmergencyRouteFailureReason(
  input: EmergencyRouteAvailabilityInput,
): EmergencyRouteFailureReason | null {
  // When an assigned destination has no valid outdoor connection, report that
  // concrete blocker before the broader room-egress check. This prevents a
  // disconnected assembly point from being reduced to a generic route error.
  if (input.assignedAssemblyPointCount > 0 && input.connectedAssemblyPointCount === 0) {
    return "assembly_point_disconnected";
  }
  if (input.emergencySafeEgressAvailable === false) return "no_safe_route";
  if (input.assignedAssemblyPointCount === 0) return "no_assigned_assembly_point";
  if (input.connectedAssemblyPointCount === 0) return "assembly_point_disconnected";
  if (input.eligibleAssignedAssemblyPointCount === 0) return "no_assigned_assembly_point";
  if (input.completeGraphRouteCount === 0) return "no_safe_route";
  return null;
}

export type EmergencyPlannerAvailability =
  | {
      state: "available" | "approved" | "review-required";
      destinationName?: string;
      details: readonly string[];
    }
  | {
      state: "unavailable";
      reason: EmergencyRouteFailureReason;
      details: readonly string[];
    };

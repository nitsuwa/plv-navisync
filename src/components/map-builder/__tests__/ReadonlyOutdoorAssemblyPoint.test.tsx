import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Campus } from "../types";
import { projectReadonlyOutdoorCampus } from "../../../lib/readonlyOutdoorCampus";
import { ReadonlyOutdoorCampusScene } from "../ReadonlyOutdoorVisuals";

const campus = {
  id: "campus",
  canvasW: 500,
  canvasH: 350,
  buildings: [],
  markers: [],
  paths: [],
  decorAssets: [],
  assemblyPoints: [{
    id: "assembly-a", name: "Main Assembly Point A", x: 320, y: 210, campusId: "campus", navNodeId: "assembly-node",
    buildingAssignments: [{ buildingId: "building-a", designation: "primary" as const }],
  }],
} as unknown as Campus;

describe("Student 2D Assembly Point marker", () => {
  it("shows only the selected published SOS destinations at their authored map coordinates", () => {
    const destinations = new Set(["assembly-a"]);
    const { rerender } = render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      emergencyMode
      emergencyAssemblyPointIds={destinations}
      activeEmergencyAssemblyPointId="assembly-a"
    /></svg>);
    const marker = screen.getByTestId("student-emergency-assembly-point");
    expect(marker).toHaveAttribute("data-assembly-point-id", "assembly-a");
    expect(marker).toHaveAttribute("transform", "translate(320,210)");
    expect(marker).toHaveTextContent("Main Assembly Point A");

    rerender(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} emergencyMode={false} emergencyAssemblyPointIds={destinations} /></svg>);
    expect(screen.queryByTestId("student-emergency-assembly-point")).not.toBeInTheDocument();

    rerender(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} emergencyMode emergencyAssemblyPointIds={new Set()} /></svg>);
    expect(screen.queryByTestId("student-emergency-assembly-point")).not.toBeInTheDocument();
  });
});

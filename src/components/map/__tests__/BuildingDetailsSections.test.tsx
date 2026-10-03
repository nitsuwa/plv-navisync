import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Building } from "../../../types";
import { BuildingCover } from "../BuildingCover";
import { BuildingDetailsSections } from "../BuildingDetailsSections";
import { weeklyHoursPreset } from "../../../lib/buildingInformation";

const building: Building = {
  id: "b1", name: "College of Accountancy and Business Administration", code: "CABA",
  description: "A student-facing building description.", category: "academic", floor_count: 6,
  created_at: "2026-01-01T00:00:00Z",
};

describe("building details content", () => {
  it("shows configured image and authored description", () => {
    render(<BuildingDetailsSections building={{ ...building, image_url: "https://images.example/caba.jpg" }} facilities={[]} accessibility={[]} floorCount={6} showCover />);
    expect(screen.getByAltText(`${building.name} building`)).toHaveAttribute("src", "https://images.example/caba.jpg");
    expect(screen.getByTestId("building-description")).toHaveTextContent("A student-facing building description.");
    expect(screen.getByText("6 floors")).toBeInTheDocument();
  });

  it("uses a branded cover fallback and hides empty optional sections", () => {
    const { rerender } = render(<BuildingCover code="CABA" name="CABA" />);
    expect(screen.getByTestId("building-cover-fallback")).toBeInTheDocument();
    rerender(<BuildingDetailsSections building={{ ...building, description: " " }} facilities={[]} accessibility={[]} floorCount={0} />);
    expect(screen.queryByTestId("building-description")).not.toBeInTheDocument();
    expect(screen.queryByTestId("building-facilities")).not.toBeInTheDocument();
    expect(screen.queryByTestId("building-accessibility")).not.toBeInTheDocument();
    expect(screen.queryByText(/No facilities data yet|No accessibility data yet|No description available/i)).not.toBeInTheDocument();
  });

  it("falls back cleanly when a configured cover image cannot load", () => {
    render(<BuildingCover imageUrl="https://images.example/missing.jpg" code="CABA" name="CABA" />);
    fireEvent.error(screen.getByAltText("CABA building"));
    expect(screen.getByTestId("building-cover-fallback")).toBeInTheDocument();
  });

  it("renders only structured facility and accessibility facts", () => {
    render(<BuildingDetailsSections building={building} facilities={["Restroom", "Elevator"]} accessibility={["Accessible entrance"]} floorCount={6} />);
    expect(screen.getByTestId("building-facilities")).toHaveTextContent("Restroom");
    expect(screen.getByTestId("building-accessibility")).toHaveTextContent("Accessible entrance");
  });

  it("uses a human-friendly authored building type and structured hours in student details", () => {
    render(<BuildingDetailsSections building={{ ...building, building_type: "student_services", operating_hours_schedule: weeklyHoursPreset("weekdays") }} facilities={[]} accessibility={[]} floorCount={6} />);
    expect(screen.getByLabelText("Quick information")).toHaveTextContent("Student Services");
    expect(screen.getByTestId("building-hours")).toHaveTextContent(/Mon.*Fri.*8:00 AM.*5:00 PM/);
  });
});

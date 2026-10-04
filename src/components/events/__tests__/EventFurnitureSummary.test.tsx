import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventFurnitureSummary } from "../EventFurnitureSummary";
it("lists only requested event furniture by location and type", () => {
  render(<EventFurnitureSummary overlay={{ id: "event", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [{ id: "1", type: "booth", name: "Registration booth" }, { id: "2", type: "booth", name: "Food booth" }], eventLabels: [] }] } as never} />);
  fireEvent.click(screen.getByRole("button", { name: "Furniture summary" }));
  expect(screen.getByText("2 furniture · 0 labels · 1 locations")).toBeInTheDocument();
  expect(screen.getByText("Registration booth")).toBeInTheDocument();
  expect(screen.getByText("Food booth")).toBeInTheDocument();
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventProposalModal } from "../EventProposalModal";

const buildings = [{ buildingId: "science", buildingName: "Science Building", floors: [{ number: 1, label: "Floor 1" }] }];

describe("EventProposalModal", () => {
  it("guides the org through details and multiple locations without date fields", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<EventProposalModal buildings={buildings} onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Student Fair" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/start date|end date/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    fireEvent.click(screen.getByRole("button", { name: /create & design maps/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Student Fair",
      locations: expect.arrayContaining([
        expect.objectContaining({ type: "campus" }),
        expect.objectContaining({ type: "building", floorId: "science-f1" }),
      ]),
    })));
  });
});

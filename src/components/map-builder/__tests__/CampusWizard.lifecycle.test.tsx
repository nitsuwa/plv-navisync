import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampusWizard } from "../CampusWizard";

describe("CampusWizard student visibility", () => {
  it("defaults to Draft and creates a Coming Soon campus without publishing it", async () => {
    const onFinish = vi.fn().mockResolvedValue(true);
    render(
      <CampusWizard
        draft={{ name: "PLV Annex", code: "ANNEX" }}
        step={4}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onFinish={onFinish}
        onClose={vi.fn()}
      />,
    );

    const draftOption = screen.getByRole("button", { name: /Draft Only administrators can see this campus/i });
    const comingSoonOption = screen.getByRole("button", { name: /Coming Soon Students can see the campus listing/i });
    expect(draftOption).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(comingSoonOption);
    expect(comingSoonOption).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Create Campus" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, Save Changes" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(onFinish.mock.calls[0][0]).toMatchObject({
      lifecycleStatus: "coming_soon",
      publishStatus: "draft",
      visibleToStudents: true,
    });
  });
});

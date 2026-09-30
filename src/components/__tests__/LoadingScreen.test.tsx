import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ui/PLVLogo", () => ({ PLVLogo: () => <div aria-label="PLV logo" /> }));
import { LoadingScreen } from "../LoadingScreen";

describe("NaviSync startup screen", () => {
  it("shows the branded session restore state and exposes retry for temporary failures", () => {
    const onRetry = vi.fn();
    render(<LoadingScreen error="Check your connection and try again." onRetry={onRetry} />);

    expect(screen.getByRole("status", { name: "NaviSync could not restore your account" })).toBeInTheDocument();
    expect(screen.getByText(/NaviSync/)).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("supports the smooth exit state without replacing the startup screen content", () => {
    const { container } = render(<LoadingScreen exiting />);
    expect(container.querySelector(".ns-startup-exit")).toBeInTheDocument();
    expect(screen.getByText("Restoring your NaviSync session…")).toBeInTheDocument();
  });
});

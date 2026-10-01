import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { MobileMapAccountMenu } from "../MobileMapAccountMenu";

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({
    isStudent: true,
    loading: false,
    username: "Demo Student",
    role: "student",
    signOut: vi.fn(),
  }),
}));

describe("MobileMapAccountMenu", () => {
  it("reserves a compact 48px profile target beside the full-width responsive search", () => {
    render(
      <MemoryRouter>
        <MobileMapAccountMenu />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole("button", { name: /user menu/i });
    expect(menuButton).toHaveClass("h-12", "w-12", "min-w-12", "shrink-0");
    expect(screen.getByText("DE")).toHaveClass("h-8", "w-8");
  });
});

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
  it("matches the mobile search field height and keeps the avatar legible", () => {
    render(
      <MemoryRouter>
        <MobileMapAccountMenu />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole("button", { name: /user menu/i });
    expect(menuButton).toHaveClass("h-[58px]", "min-w-[70px]");
    expect(screen.getByText("DE")).toHaveClass("h-9", "w-9");
  });
});

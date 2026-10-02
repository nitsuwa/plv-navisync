import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supabase", () => ({ isConnected: false, supabase: null }));
vi.mock("../../contexts/StudentAuthContext", () => ({
  useAuth: () => ({ status: "unauthenticated", profile: null }),
}));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../../components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button" aria-label="Toggle theme" />,
}));
vi.mock("../../components/ui/PLVLogo", () => ({
  PLVLogo: () => <span aria-hidden="true" />,
}));
vi.mock("../../components/ui/HeroBackground", () => ({
  StarField: () => null,
  LavaLampBackground: () => null,
}));

import { AdminLoginPage } from "../AdminLoginPage";

describe("AdminLoginPage responsive layout", () => {
  it("keeps the login content shrinkable within a narrow viewport", () => {
    render(
      <MemoryRouter>
        <AdminLoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("admin-login-layout")).toHaveClass("w-full", "min-w-0", "overflow-x-hidden");
    expect(screen.getByTestId("admin-login-panel")).toHaveClass("w-full", "min-w-0");
    expect(screen.getByTestId("admin-login-content")).toHaveClass("w-full", "min-w-0");
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    expect(screen.getByLabelText("Email")).toBeVisible();
  });
});

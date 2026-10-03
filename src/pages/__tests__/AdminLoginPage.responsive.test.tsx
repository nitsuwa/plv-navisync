import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  status: "unauthenticated",
  profile: null as { role: string; is_active: boolean } | null,
}));

vi.mock("../../lib/supabase", () => ({ isConnected: false, supabase: null }));
vi.mock("../../contexts/StudentAuthContext", () => ({
  useAuth: () => authState,
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
  AuthVisualBackdrop: () => <div data-testid="auth-visual-backdrop" />,
  StarField: () => null,
  LavaLampBackground: () => null,
}));

import { AdminLoginPage } from "../AdminLoginPage";

describe("AdminLoginPage responsive layout", () => {
  beforeEach(() => {
    authState.status = "unauthenticated";
    authState.profile = null;
  });

  it.each(["admin", "super_admin"])("restores an active %s session to the admin dashboard", async (role) => {
    authState.status = "authenticated";
    authState.profile = { role, is_active: true };
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/admin-dashboard" element={<h1>Admin dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  });

  it("keeps the login content shrinkable within a narrow viewport", () => {
    render(
      <MemoryRouter>
        <AdminLoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("admin-login-layout")).toHaveClass("w-full", "min-w-0", "overflow-x-hidden");
    expect(screen.getByTestId("admin-login-layout")).toHaveClass("isolate");
    expect(screen.getByTestId("auth-visual-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("admin-login-panel")).toHaveClass("w-full", "min-w-0");
    expect(screen.getByTestId("admin-login-content")).toHaveClass("w-full", "min-w-0");
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    expect(screen.getByLabelText("Email")).toBeVisible();
  });
});

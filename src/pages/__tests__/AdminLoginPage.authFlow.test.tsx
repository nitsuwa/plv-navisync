import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  status: "unauthenticated",
  profile: null as { role: string; is_active: boolean } | null,
}));
const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } }),
}));

vi.mock("../../lib/supabase", () => ({
  isConnected: true,
  supabase: { auth: { signInWithPassword: authMocks.signInWithPassword } },
}));
vi.mock("../../contexts/StudentAuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({
    loading: false, isAdmin: false, isStudent: false, isStudentOrg: false,
    username: "", role: "faculty", profile: null, signOut: vi.fn(),
  }),
}));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../components/ui/ThemeToggle", () => ({ ThemeToggle: () => <button type="button" aria-label="Toggle theme" /> }));
vi.mock("../../components/ui/PLVLogo", () => ({ PLVLogo: () => <span aria-hidden="true" /> }));
vi.mock("../../components/ui/HeroBackground", () => ({
  AuthVisualBackdrop: () => <div data-testid="auth-visual-backdrop" />,
  StarField: () => null,
  LavaLampBackground: () => null,
}));
vi.mock("../../services/reportService", () => ({ reportService: { getStudentReports: vi.fn().mockResolvedValue([]) } }));
vi.mock("../../lib/notificationService", () => ({ notificationService: { detectReportStatusChanges: vi.fn().mockReturnValue([]) } }));

import { Navbar } from "../../components/layout/Navbar";

let AdminLoginPage: typeof import("../AdminLoginPage").AdminLoginPage;

function RouteProbe() {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}</output>;
}

function renderAuthRoutes(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<><Navbar /><RouteProbe /></>} />
        <Route path="/admin" element={<AdminLoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("public sign-in and demo quick-fill", () => {
  beforeAll(async () => {
    vi.stubEnv("VITE_ENABLE_DEMO_LOGIN", "true");
    vi.stubEnv("VITE_DEMO_ADMIN_EMAIL", "demo.admin@example.test");
    vi.stubEnv("VITE_DEMO_ADMIN_PASSWORD", "Demo-Password-Only-For-Test");
    ({ AdminLoginPage } = await import("../AdminLoginPage"));
  });

  beforeEach(() => {
    authState.status = "unauthenticated";
    authState.profile = null;
    authMocks.signInWithPassword.mockClear();
  });

  it("guest public Sign in only navigates to the login page", async () => {
    renderAuthRoutes();

    fireEvent.click(screen.getByRole("link", { name: /Login/ }));

    expect(await screen.findByRole("heading", { name: "Welcome Back" })).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("Demo Administrator selection only fills fields until Sign In is explicitly pressed", async () => {
    renderAuthRoutes("/admin");

    fireEvent.click(screen.getByRole("button", { name: /Choose an account to fill the form/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Demo Administrator/ }));

    expect(screen.getByLabelText("Email")).toHaveValue("demo.admin@example.test");
    expect(screen.getByLabelText("Password")).toHaveValue("Demo-Password-Only-For-Test");
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("calls Supabase exactly once after explicit Sign In following demo fill", async () => {
    renderAuthRoutes("/admin");

    fireEvent.click(screen.getByRole("button", { name: /Choose an account to fill the form/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Demo Administrator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(authMocks.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: "demo.admin@example.test",
      password: "Demo-Password-Only-For-Test",
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  connected: false,
  client: null as any,
  value: null as any,
}));

vi.mock("../../lib/supabase", () => ({
  get isConnected() { return authMocks.connected; },
  get supabase() { return authMocks.client; },
}));
vi.mock("../../contexts/StudentAuthContext", () => ({ useAuth: () => authMocks.value }));

import {
  AuthCallbackPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerificationPendingPage,
} from "../AuthLifecyclePages";

function renderAt(element: React.ReactNode, path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}>
      {element}
    </MemoryRouter>,
  );
}

describe("student Auth lifecycle states", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    authMocks.connected = false;
    authMocks.client = null;
    authMocks.value = {
      status: "initializing", recoveryState: "idle", session: null, profile: null,
      isStudent: false, retryBootstrap: vi.fn(),
    };
  });

  it("shows verification pending details and preserves the registration email", () => {
    renderAt(<VerificationPendingPage />, "/auth/verify", { email: "student@example.com" });
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByLabelText("Registration email")).toHaveValue("student@example.com");
    expect(screen.getByRole("button", { name: /resend verification/i })).toBeInTheDocument();
  });

  it("renders the forgot-password request without exposing account existence", () => {
    renderAt(<ForgotPasswordPage />, "/auth/forgot-password");
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
  });

  it("shows an invalid callback state when Auth is unavailable", async () => {
    renderAt(<AuthCallbackPage />, "/auth/callback?flow=signup");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Verification failed" })).toBeInTheDocument());
    expect(screen.getByText("Authentication is not configured.")).toBeInTheDocument();
  });

  it("rejects reset-page access without a recovery link", async () => {
    renderAt(<ResetPasswordPage />, "/auth/reset-password");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Invalid reset link" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Request New Link" })).toHaveAttribute("href", "/auth/forgot-password");
  });

  it("waits while the central provider processes a fresh recovery URL, then shows the form", async () => {
    authMocks.connected = true;
    authMocks.client = { auth: { updateUser: vi.fn(), signOut: vi.fn() } };
    authMocks.value = {
      status: "unauthenticated", recoveryState: "processing", session: null, profile: null,
      isStudent: false, retryBootstrap: vi.fn(),
    };
    const view = renderAt(<ResetPasswordPage />, "/auth/reset-password?code=redacted-test-value");
    expect(screen.getByRole("heading", { name: "Verifying reset link…" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();

    authMocks.value = {
      status: "authenticated", recoveryState: "ready", session: { user: { id: "user-1" } }, profile: null,
      isStudent: false, retryBootstrap: vi.fn(),
    };
    view.rerender(
      <MemoryRouter initialEntries={["/auth/reset-password?code=redacted-test-value"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByLabelText("New Password")).toBeInTheDocument());
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  session: null as any,
  listener: null as null | ((event: string, session: unknown) => void),
  client: null as any,
}));

vi.mock("../../lib/supabase", () => ({
  get isConnected() { return true; },
  get supabase() { return authMocks.client; },
}));

import { AuthProvider, useAuth } from "../StudentAuthContext";

function LogoutProbe() {
  const auth = useAuth();
  return (
    <>
      <output data-testid="auth-state">{auth.status}:{auth.isAdmin ? "admin" : "guest"}</output>
      <button type="button" onClick={() => void auth.signOut()}>Sign out</button>
    </>
  );
}

describe("shared auth logout", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    authMocks.session = {
      user: { id: "demo-admin-id", email: "demo.admin@example.test" },
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
    };
    authMocks.listener = null;
    authMocks.client = {
      auth: {
        getSession: vi.fn().mockImplementation(async () => ({ data: { session: authMocks.session }, error: null })),
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          authMocks.listener = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        getUser: vi.fn(),
        signOut: vi.fn().mockImplementation(async (options) => {
          expect(options).toEqual({ scope: "local" });
          authMocks.session = null;
          authMocks.listener?.("SIGNED_OUT", null);
          return { error: null };
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "demo-admin-id", email: "demo.admin@example.test", role: "admin", is_active: true },
              error: null,
            }),
          })),
        })),
      })),
    };
  });

  it("revokes the local Supabase session before clearing auth state", async () => {
    render(<AuthProvider><LogoutProbe /></AuthProvider>);
    expect(await screen.findByText("authenticated:admin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByTestId("auth-state")).toHaveTextContent("unauthenticated:guest"));
    expect(authMocks.client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(await authMocks.client.auth.getSession()).toEqual({ data: { session: null }, error: null });
  });

  it("coalesces the focus and visibility revalidation emitted when returning to a tab", async () => {
    render(<AuthProvider><LogoutProbe /></AuthProvider>);
    expect(await screen.findByText("authenticated:admin")).toBeInTheDocument();
    authMocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: "demo-admin-id" } }, error: null });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitFor(() => expect(authMocks.client.auth.getUser).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated:admin");
  });
});

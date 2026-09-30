import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  connected: true,
  client: null as any,
  listener: null as any,
}));

vi.mock("../../lib/supabase", () => ({
  get isConnected() { return authMocks.connected; },
  get supabase() { return authMocks.client; },
}));

import { AuthProvider, useAuth } from "../StudentAuthContext";

function RecoveryProbe() {
  const auth = useAuth();
  return <output>{auth.status}:{auth.recoveryState}</output>;
}

describe("central password recovery bootstrap", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/auth/reset-password?code=redacted-test-value");
    authMocks.listener = null;
    authMocks.connected = true;
    authMocks.client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          authMocks.listener = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        getUser: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "student-1", role: "student", is_active: true, email: "student@example.com" },
              error: null,
            }),
          })),
        })),
      })),
    };
  });

  it("keeps a fresh recovery URL processing until PASSWORD_RECOVERY supplies the session", async () => {
    render(<AuthProvider><RecoveryProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("unauthenticated:processing")).toBeInTheDocument());

    const session = { user: { id: "student-1", email: "student@example.com" } };
    await act(async () => {
      authMocks.listener("PASSWORD_RECOVERY", session);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("authenticated:ready")).toBeInTheDocument());
  });
});

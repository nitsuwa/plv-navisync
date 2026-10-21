import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  client: null as any,
  listener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock("../../lib/supabase", () => ({
  get isConnected() { return true; },
  get supabase() { return authMocks.client; },
  supabaseAuthStorageKey: "test-auth-token",
  clearPersistedSupabaseSession: vi.fn(() => true),
}));

import { AuthProvider, useAuth, useAuthBootstrap, useAuthUserId, useStudentAuth } from "../StudentAuthContext";

const renders = { student: vi.fn(), bootstrap: vi.fn(), identity: vi.fn(), fullAuth: vi.fn(), mounts: vi.fn() };

function StableMapProbe() {
  const student = useStudentAuth();
  const bootstrap = useAuthBootstrap();
  renders.student();
  renders.bootstrap();

  useEffect(() => renders.mounts(), []);

  return <output>{bootstrap.status}:{student.profile?.id ?? "none"}</output>;
}

function CurrentSessionProbe() {
  const auth = useAuth();
  renders.fullAuth();
  return <output data-testid="current-access-token">{auth.session?.access_token}</output>;
}

function IdentityProbe() {
  const userId = useAuthUserId();
  renders.identity();
  return <output data-testid="stable-user-id">{userId}</output>;
}

describe("student map auth refresh stability", () => {
  const firstSession = {
    user: { id: "student-session-1", email: "student@example.test" },
    access_token: "test-access-1",
    refresh_token: "test-refresh-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.listener = null;
    authMocks.client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: firstSession }, error: null }),
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
              data: { id: "student-session-1", role: "student", is_active: true, email: "student@example.test" },
              error: null,
            }),
          })),
        })),
      })),
    };
  });

  it("does not rerender or remount map consumers for a token-only refresh", async () => {
    render(<AuthProvider><><StableMapProbe /><IdentityProbe /><CurrentSessionProbe /></></AuthProvider>);
    expect(await screen.findByText("authenticated:student-session-1")).toBeInTheDocument();
    const studentRenderCount = renders.student.mock.calls.length;
    const bootstrapRenderCount = renders.bootstrap.mock.calls.length;
    const identityRenderCount = renders.identity.mock.calls.length;
    const fullAuthRenderCount = renders.fullAuth.mock.calls.length;
    expect(renders.mounts).toHaveBeenCalledTimes(1);

    await act(async () => {
      authMocks.listener?.("TOKEN_REFRESHED", {
        ...firstSession,
        access_token: "test-access-2",
        refresh_token: "test-refresh-2",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(screen.getByText("authenticated:student-session-1")).toBeInTheDocument());
    expect(screen.getByTestId("current-access-token")).toHaveTextContent("test-access-2");
    expect(screen.getByTestId("stable-user-id")).toHaveTextContent("student-session-1");
    expect(renders.student).toHaveBeenCalledTimes(studentRenderCount);
    expect(renders.bootstrap).toHaveBeenCalledTimes(bootstrapRenderCount);
    expect(renders.identity).toHaveBeenCalledTimes(identityRenderCount);
    expect(renders.fullAuth.mock.calls.length).toBeGreaterThan(fullAuthRenderCount);
    expect(renders.mounts).toHaveBeenCalledTimes(1);
  });
});

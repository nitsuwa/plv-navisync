import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  maybeSingle: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  isConnected: true,
  supabase: {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
    })),
  },
}));

import { AuthProvider, useAuth, useStudentAuth } from "../../contexts/StudentAuthContext";
import { useAdminAuth } from "../useAdminAuth";

const session = { access_token: "access", refresh_token: "refresh", user: { id: "admin-1" } };
const profile = {
  id: "admin-1",
  role: "admin",
  is_active: true,
  email: "admin@example.test",
  first_name: "Campus",
  last_name: "Admin",
};
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("central authentication bootstrap", () => {
  let authListener: ((event: string, nextSession: typeof session | null) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    authListener = undefined;
    mocks.onAuthStateChange.mockImplementation((callback: typeof authListener) => {
      authListener = callback;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
    mocks.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
  });

  it("restores one persisted session and shares the database role with Student and Admin hooks", async () => {
    const { result } = renderHook(() => ({ admin: useAdminAuth(), student: useStudentAuth(), auth: useAuth() }), { wrapper });

    expect(result.current.admin.loading).toBe(true);
    await waitFor(() => expect(result.current.admin.isAdmin).toBe(true));
    expect(result.current.auth.status).toBe("authenticated");
    expect(result.current.student.isStudent).toBe(false);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("recognizes Super Admin through the same centralized profile", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...profile, role: "super_admin" }, error: null });
    const { result } = renderHook(() => useAdminAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(result.current.profile?.role).toBe("super_admin");
    expect(result.current.refreshProfile).toBeTypeOf("function");
  });

  it("does not treat an early null INITIAL_SESSION event as a completed restore", async () => {
    let resolveSession: ((value: { data: { session: typeof session }; error: null }) => void) | undefined;
    mocks.getSession.mockImplementationOnce(() => new Promise((resolve) => { resolveSession = resolve; }));
    const { result } = renderHook(() => useAdminAuth(), { wrapper });

    await act(async () => {
      authListener?.("INITIAL_SESSION", null);
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current.status).toBe("initializing");

    await act(async () => resolveSession?.({ data: { session }, error: null }));
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
  });

  it("does not grant Admin access to a Student role", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...profile, role: "student" }, error: null });
    const { result } = renderHook(() => ({ admin: useAdminAuth(), student: useStudentAuth() }), { wrapper });

    await waitFor(() => expect(result.current.admin.loading).toBe(false));
    expect(result.current.admin.isAdmin).toBe(false);
    expect(result.current.student.isStudent).toBe(true);
  });

  it("restores the Student Organization role from the profile row", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...profile, role: "student_org" }, error: null });
    const { result } = renderHook(() => ({ admin: useAdminAuth(), student: useStudentAuth() }), { wrapper });

    await waitFor(() => expect(result.current.student.isStudentOrg).toBe(true));
    expect(result.current.admin.isAdmin).toBe(false);
    expect(result.current.student.role).toBe("student_org");
  });

  it("accepts a login in another tab and clears the profile after cross-tab sign-out", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));

    await act(async () => {
      authListener?.("SIGNED_IN", session);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    await act(async () => authListener?.("SIGNED_OUT", null));
    expect(result.current.profile).toBeNull();
    expect(result.current.status).toBe("unauthenticated");
  });

  it("ignores a queued sign-in event when a newer sign-out arrives first", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));

    await act(async () => {
      authListener?.("SIGNED_IN", session);
      authListener?.("SIGNED_OUT", null);
      await Promise.resolve();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.username).toBe("");
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("keeps a previously verified role during a temporary profile/network failure", async () => {
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("temporary network failure") });

    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.profile).toEqual(profile);
  });

  it("ignores a stale profile response that finishes after explicit sign-out", async () => {
    let resolveProfile: ((value: { data: typeof profile; error: null }) => void) | undefined;
    mocks.maybeSingle.mockImplementationOnce(() => new Promise((resolve) => { resolveProfile = resolve; }));
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { result, unmount } = renderHook(() => useAdminAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    await act(async () => {
      authListener?.("SIGNED_IN", session);
      await Promise.resolve();
    });
    await act(async () => authListener?.("SIGNED_OUT", null));
    await act(async () => resolveProfile?.({ data: profile, error: null }));

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.profile).toBeNull();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});

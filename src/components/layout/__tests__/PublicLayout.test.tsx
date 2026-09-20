import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { PublicLayout } from "../PublicLayout";

const authState = vi.hoisted(() => ({
  isStudent: true,
  isStudentOrg: false,
  loading: false,
  username: "Test Student",
  role: "student" as const,
  profile: null,
  signOut: vi.fn(),
}));

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../Navbar", () => ({ Navbar: () => null }));
vi.mock("../EmergencyBanner", () => ({ EmergencyBanner: () => null }));
vi.mock("../Footer", () => ({ Footer: () => <footer data-testid="site-footer">Footer</footer> }));
vi.mock("../ScrollToTop", () => ({ ScrollToTop: () => null }));
vi.mock("../MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("../../ui/NavigationProgress", () => ({ NavigationProgress: () => null }));
vi.mock("../../../app/components/ui/sonner", () => ({ Toaster: () => null }));

describe("PublicLayout student entry", () => {
  it("redirects an authenticated student from the public root to Home", async () => {
    authState.isStudent = true;
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<div>Landing page</div>} />
            <Route path="/home" element={<div>Student Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Student Home")).toBeInTheDocument());
    expect(screen.queryByText("Landing page")).not.toBeInTheDocument();
  });

  it("keeps the footer on the student Home route", () => {
    authState.isStudent = true;
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/home" element={<div>Student Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Student Home")).toBeInTheDocument();
    expect(screen.getByTestId("site-footer")).toBeInTheDocument();
  });

  it("hides the site footer on full-screen student event editing routes", () => {
    authState.isStudent = true;
    render(
      <MemoryRouter initialEntries={["/student/events/event-1/edit"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/student/events/:id/edit" element={<div>Event editor</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Event editor")).toBeInTheDocument();
    expect(screen.queryByTestId("site-footer")).not.toBeInTheDocument();
  });
});

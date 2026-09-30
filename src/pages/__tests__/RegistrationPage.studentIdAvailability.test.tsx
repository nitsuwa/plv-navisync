import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signUp: vi.fn() }));

vi.mock("../../lib/supabase", () => ({
  isConnected: true,
  supabase: { rpc: mocks.rpc, auth: { signUp: mocks.signUp } },
}));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("../../components/ui/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("../../components/ui/PLVLogo", () => ({ PLVLogo: () => null }));
vi.mock("../../components/ui/HeroBackground", () => ({ StarField: () => null, LavaLampBackground: () => null }));

import { RegistrationPage } from "../RegistrationPage";

function renderRegistration() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegistrationPage />} />
        <Route path="/auth/verify" element={<div>Check your email screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillStudentDetails() {
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alex Student" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByLabelText("Student ID"), { target: { value: "233314" } });
}

describe("RegistrationPage Student ID availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "student-1", identities: [{ provider: "email" }] }, session: null },
      error: null,
    });
  });

  it("blocks a confirmed duplicate Student ID on Step 1", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    renderRegistration();
    fillStudentDetails();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("This Student ID is already registered.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("allows valid registration to continue and finish when the availability RPC is missing", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.check_student_id_availability(p_student_number) in the schema cache",
      },
    });
    renderRegistration();
    fillStudentDetails();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/we couldn't check availability right now/i)).toBeInTheDocument();
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "campus-pass-2026" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "campus-pass-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText("Check your email screen")).toBeInTheDocument();
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
  });

  it("shows the duplicate Student ID message when the final signup hits the unique index", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "duplicate key value violates unique constraint profiles_student_number_uq" },
    });
    renderRegistration();
    fillStudentDetails();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "campus-pass-2026" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "campus-pass-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText("This Student ID is already registered.")).toBeInTheDocument();
    expect(screen.queryByText("Check your email screen")).not.toBeInTheDocument();
  });
});

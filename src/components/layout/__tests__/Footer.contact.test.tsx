import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "../Footer";

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({ isStudent: false }),
}));

describe("Footer contact information", () => {
  it("keeps useful public navigation and contact details without project or history trivia", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Maysan Road corner Tongco Street, Barangay Maysan, Valenzuela City, 1440 Metro Manila/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "registrarsoffice@plv.edu.ph" })).toHaveAttribute(
      "href",
      "mailto:registrarsoffice@plv.edu.ph",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Campus Map" })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: "Help / FAQ" })).toHaveAttribute("href", "/help#faq");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Navigate buildings, rooms, facilities, and walking routes across PLV.")).toBeInTheDocument();
    expect(screen.getByText(/NaviSync v1\.0\.3/)).toBeInTheDocument();

    expect(screen.queryByText(/Established 2002/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/campus inaugurated January 19, 2018/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GitHub/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/System Online/i)).not.toBeInTheDocument();

    expect(screen.queryByText(/Tongco Street, Karuhatan/i)).not.toBeInTheDocument();
    expect(screen.queryByText("(02) 8293-0000")).not.toBeInTheDocument();
    expect(screen.queryByText("info@plv.edu.ph")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Announcements" })).not.toBeInTheDocument();
  });
});

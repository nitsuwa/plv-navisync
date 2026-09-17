import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "../Footer";

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({ isStudent: false }),
}));

describe("Footer contact information", () => {
  it("uses the official campus details and omits retired public announcement contact links", () => {
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
    expect(screen.getByText("Established 2002")).toBeInTheDocument();
    expect(screen.getByText("Main Maysan campus inaugurated January 19, 2018")).toBeInTheDocument();

    expect(screen.queryByText(/Tongco Street, Karuhatan/i)).not.toBeInTheDocument();
    expect(screen.queryByText("(02) 8293-0000")).not.toBeInTheDocument();
    expect(screen.queryByText("info@plv.edu.ph")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Announcements" })).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { BuildingsPage } from "../BuildingsPage";

vi.mock("../../hooks", () => ({
  useDebounce: (value: string) => value,
  usePublishedCampus: () => ({ activeCampus: null, loading: false }),
}));

vi.mock("../../components/ui/BuildingCard", () => ({ BuildingCard: () => null }));
vi.mock("../../components/ui/PageTransition", () => ({ PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/ui/Skeleton", () => ({ SkeletonCard: () => null }));
vi.mock("../../components/ui/EmptyState", () => ({ EmptyState: () => null }));
vi.mock("../../components/ui/Reveal", () => ({ Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/ui/SearchBar", () => ({ SearchBar: () => null }));

describe("BuildingsPage navigation", () => {
  it("provides a direct link back to the student Home page", () => {
    render(
      <MemoryRouter initialEntries={["/buildings"]}>
        <BuildingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Back to Home/i })).toHaveAttribute("href", "/home");
  });
});

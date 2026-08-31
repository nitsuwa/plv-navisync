import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavigationRelationshipCard } from "../NavigationRelationshipCard";

const callbacks = {
  onView: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
};

describe("NavigationRelationshipCard", () => {
  it("can omit the disruptive View action for an already-selected Door", () => {
    render(
      <NavigationRelationshipCard
        linked
        connectionCount={1}
        mode="design"
        showView={false}
        {...callbacks}
      />,
    );

    expect(screen.queryByRole("button", { name: /view in navigation/i })).toBeNull();
    expect(screen.getByRole("button", { name: /remove from navigation/i })).toBeTruthy();
  });

  it("renders each Door navigation relationship state without throwing", () => {
    const { rerender } = render(
      <NavigationRelationshipCard
        linked={false}
        mode="design"
        {...callbacks}
      />,
    );

    expect(screen.getByText("Not linked")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add to navigation/i })).toBeTruthy();

    rerender(
      <NavigationRelationshipCard
        linked
        connectionCount={0}
        mode="design"
        {...callbacks}
      />,
    );

    expect(screen.getByText("Added to Navigation")).toBeTruthy();
    expect(screen.getByTestId("navigation-connection-needed")).toHaveTextContent(
      "Navigation connection needed",
    );

    rerender(
      <NavigationRelationshipCard
        linked
        connectionCount={1}
        mode="design"
        {...callbacks}
      />,
    );

    expect(screen.getByText("Connected to Walking Network")).toBeTruthy();
    expect(screen.queryByTestId("navigation-connection-needed")).toBeNull();
  });
});

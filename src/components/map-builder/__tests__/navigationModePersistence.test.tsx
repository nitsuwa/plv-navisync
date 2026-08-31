import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TestRouteSessionProvider, useTestRouteSession } from "../TestNavigationPanel";

function Probe() {
  const { navigationEnabled, setNavigationEnabled, open, setOpen } = useTestRouteSession();
  return (
    <div>
      <span data-testid="nav-state">{navigationEnabled ? "on" : "off"}</span>
      <span data-testid="route-state">{open ? "open" : "closed"}</span>
      <span data-testid="effective-nav-state">{navigationEnabled || open ? "on" : "off"}</span>
      <button type="button" onClick={() => setNavigationEnabled(!navigationEnabled)}>Toggle navigation</button>
      <button type="button" onClick={() => setOpen(!open)}>Toggle route</button>
    </div>
  );
}

describe("Map Builder navigation preference", () => {
  it("survives editor/context remounts within the same session", () => {
    const view = render(
      <TestRouteSessionProvider>
        <Probe />
      </TestRouteSessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    expect(screen.getByTestId("nav-state")).toHaveTextContent("on");

    view.rerender(
      <TestRouteSessionProvider>
        <Probe key="remounted-editor" />
      </TestRouteSessionProvider>,
    );
    expect(screen.getByTestId("nav-state")).toHaveTextContent("on");
  });

  it("keeps Test Route visibility separate from the user's navigation preference", () => {
    render(
      <TestRouteSessionProvider>
        <Probe />
      </TestRouteSessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle route" }));
    expect(screen.getByTestId("route-state")).toHaveTextContent("open");
    expect(screen.getByTestId("effective-nav-state")).toHaveTextContent("on");
    expect(screen.getByTestId("nav-state")).toHaveTextContent("off");
    fireEvent.click(screen.getByRole("button", { name: "Toggle route" }));
    expect(screen.getByTestId("route-state")).toHaveTextContent("closed");
    expect(screen.getByTestId("effective-nav-state")).toHaveTextContent("off");
    expect(screen.getByTestId("nav-state")).toHaveTextContent("off");
  });
});

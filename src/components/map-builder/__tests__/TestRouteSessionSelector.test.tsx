import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TestRouteSessionProvider,
  useTestRouteSessionActions,
  useTestRouteSessionSelector,
  type TestRouteSession,
} from "../TestNavigationPanel";

describe("Test Route session selectors", () => {
  it("does not rerender a Floor-facing open selector when only picker session data changes", () => {
    let renders = 0;
    const nextSession: TestRouteSession = {
      startValue: "room:b1:room-a",
      destValue: "room:b1:room-b",
      routeMode: "standard",
      result: null,
      error: null,
      hasCalculatedRoute: false,
      manualCollapsed: false,
      manualExpanded: false,
      liveRouteEnabled: false,
    };

    function FloorFacingProbe() {
      renders += 1;
      const panelOpen = useTestRouteSessionSelector((snapshot) => snapshot.open);
      const actions = useTestRouteSessionActions();
      return (
        <>
          <output data-testid="render-count">{renders}</output>
          <button onClick={() => actions.setSession(nextSession)}>Change picker session</button>
          <output data-testid="panel-open">{String(panelOpen)}</output>
        </>
      );
    }

    render(<TestRouteSessionProvider><FloorFacingProbe /></TestRouteSessionProvider>);
    expect(screen.getByTestId("render-count").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Change picker session" }));

    expect(screen.getByTestId("render-count").textContent).toBe("1");
    expect(screen.getByTestId("panel-open").textContent).toBe("false");
  });
});

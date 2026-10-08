import { memo, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStableCallbackProps } from "../useStableCallbackProps";

describe("useStableCallbackProps", () => {
  it("keeps memoized scene children stable for sidebar-only updates and calls the latest action", () => {
    const sceneRender = vi.fn();
    const selectedBy = vi.fn();
    const MemoScene = memo(({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) => {
      sceneRender();
      return <button onClick={() => onSelect(selectedId)}>Select scene object</button>;
    });

    function Harness() {
      const [sidebarOpen, setSidebarOpen] = useState(false);
      const sceneProps = useStableCallbackProps({
        selectedId: "walking-point-1",
        onSelect: (id: string) => selectedBy(`${sidebarOpen ? "sidebar-open" : "sidebar-closed"}:${id}`),
      });
      return (
        <>
          <button onClick={() => setSidebarOpen((open) => !open)}>Toggle properties</button>
          <MemoScene {...sceneProps} />
        </>
      );
    }

    render(<Harness />);
    expect(sceneRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Toggle properties" }));
    expect(sceneRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Select scene object" }));
    expect(selectedBy).toHaveBeenCalledWith("sidebar-open:walking-point-1");
  });
});

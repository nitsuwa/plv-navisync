import { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFloorTextPreviewStore, useFloorTextPreview } from "../floorTextPreviewStore";

describe("Floor text preview store", () => {
  it("notifies only the matching canvas label subscriber", () => {
    const store = createFloorTextPreviewStore();
    const renderCounts = { roomA: 0, roomB: 0 };
    function Label({ id }: { id: "roomA" | "roomB" }) {
      const count = useRef(0);
      count.current += 1;
      renderCounts[id] = count.current;
      const text = useFloorTextPreview(store, id, id === "roomA" ? "Room A" : "Room B");
      return <span data-testid={id}>{text}</span>;
    }

    render(<><Label id="roomA" /><Label id="roomB" /></>);
    const roomBInitialRenders = renderCounts.roomB;
    act(() => store.set("roomA", "HOLDING AREA"));

    expect(screen.getByTestId("roomA")).toHaveTextContent("HOLDING AREA");
    expect(screen.getByTestId("roomB")).toHaveTextContent("Room B");
    expect(renderCounts.roomB).toBe(roomBInitialRenders);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationQR } from "../LocationQR";

describe("LocationQR", () => {
  it("renders a QR graphic and copies the location identifier link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<LocationQR buildingId="building with spaces" buildingName="Science Hall" />);
      const code = screen.getByLabelText("QR code for Science Hall");
      expect(code.tagName.toLowerCase()).toBe("svg");
      expect(code.querySelector("path")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/map?locationId=building+with+spaces`,
      ));
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

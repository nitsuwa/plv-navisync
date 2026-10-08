import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "sonner";
import { Toaster } from "../sonner";

afterEach(() => {
  toast.dismiss();
  cleanup();
});

describe("Sonner toast pointer behavior", () => {
  it("lets clicks pass through passive notifications while keeping toast actions clickable", async () => {
    render(<Toaster position="top-right" closeButton />);
    toast.success("Draft saved", { action: { label: "Undo", onClick: () => {} } });

    const title = await screen.findByText("Draft saved");
    const toastElement = title.closest<HTMLElement>("[data-sonner-toast]");

    expect(toastElement).not.toBeNull();
    expect(toastElement).toHaveClass("pointer-events-none");
    const toastButtons = [...toastElement!.querySelectorAll("button")];
    expect(toastButtons.length).toBeGreaterThan(0);
    expect(toastButtons.every((button) => button.classList.contains("pointer-events-auto"))).toBe(true);
  });
});

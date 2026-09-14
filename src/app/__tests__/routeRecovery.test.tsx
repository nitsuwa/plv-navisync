import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorElement } from "../../components/ui/ErrorBoundary";
import { lazyPage } from "../routes";

describe("route loading recovery", () => {
  it("retries a rejected dynamic import once before surfacing the failure", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /assets/admin.js"))
      .mockResolvedValueOnce({
        default: function RecoveredPage() {
          return <p>Recovered page</p>;
        },
      });
    const LazyPage = lazyPage(load);

    render(
      <Suspense fallback={<p>Loading page</p>}>
        <LazyPage />
      </Suspense>,
    );

    expect(await screen.findByText("Recovered page")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows admin-specific recovery guidance for a failed route render", async () => {
    const router = createMemoryRouter([
      {
        path: "/admin",
        loader: () => {
          throw new TypeError("Failed to fetch dynamically imported module: /src/pages/AdminLoginPage.tsx");
        },
        element: <p>Admin page</p>,
        errorElement: <RouteErrorElement />,
      },
    ], { initialEntries: ["/admin"] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Admin page needs a refresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });

  it("routes a rejected lazy page to the configured route error element", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /src/pages/AdminLoginPage.tsx"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /src/pages/AdminLoginPage.tsx"));
    const LazyAdminPage = lazyPage(load);
    const router = createMemoryRouter([
      {
        path: "/admin",
        element: (
          <Suspense fallback={<p>Loading page</p>}>
            <LazyAdminPage />
          </Suspense>
        ),
        errorElement: <RouteErrorElement />,
      },
    ], { initialEntries: ["/admin"] });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<RouterProvider router={router} />);

      expect(await screen.findByRole("heading", { name: "Admin page needs a refresh" })).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });
});

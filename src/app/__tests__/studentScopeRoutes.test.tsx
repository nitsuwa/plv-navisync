import { describe, expect, it } from "vitest";
import { router } from "../routes";

describe("student/public route scope", () => {
  it("does not expose public announcements while keeping admin management", () => {
    const publicRoot = router.routes.find((route) => route.path === "/");
    const adminRoot = router.routes.find((route) => route.path === "/admin-dashboard");

    expect(publicRoot?.children?.some((route) => route.path === "announcements")).toBe(false);
    expect(adminRoot?.children?.some((route) => route.path === "announcements")).toBe(true);
  });
});

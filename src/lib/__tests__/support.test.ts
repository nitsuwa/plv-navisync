import { describe, expect, it } from "vitest";
import { buildSupportMailto } from "../support";

describe("support handoff", () => {
  it("builds a usable email draft with the inquiry context", () => {
    const href = buildSupportMailto({
      name: "Juan dela Cruz",
      email: "juan@example.com",
      category: "Technical Issue",
      subject: "Map search is not working",
      message: "The search result does not open the building.",
      attachmentName: "screen.png",
    });

    expect(href.startsWith("mailto:info@plv.edu.ph?")).toBe(true);
    expect(decodeURIComponent(href)).toContain("[PLV NaviSync] Map search is not working");
    expect(decodeURIComponent(href)).toContain("Name: Juan dela Cruz");
    expect(decodeURIComponent(href)).toContain("Attachment to add: screen.png");
  });
});

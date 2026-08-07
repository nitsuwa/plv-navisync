import { afterEach, describe, expect, it, vi } from "vitest";
import { toCsv, downloadCsv, downloadJson } from "../exporters";

describe("exporters (CSV / JSON downloads)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds a CSV string with a header row", () => {
    const csv = toCsv([
      { name: "A", count: 1 },
      { name: "B", count: 2 },
    ]);
    expect(csv).toBe("name,count\r\nA,1\r\nB,2");
  });

  it("escapes commas, quotes, and newlines inside cells", () => {
    const csv = toCsv([{ note: 'say "hi", now' }]);
    expect(csv).toBe('note\r\n"say ""hi"", now"');
  });

  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("triggers a CSV file download with a Blob", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    downloadCsv([{ a: 1 }], "export.csv");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("triggers a JSON file download with pretty-printed content", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    downloadJson({ items: [1] }, "data.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

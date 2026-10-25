import { afterEach, describe, expect, it, vi } from "vitest";
import { toCsv, downloadCsv, downloadJson } from "../exporters";

describe("exporters (CSV / JSON downloads)", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("preserves Unicode and multiline cell contents with RFC-style quoting", () => {
    const csv = toCsv([{ name: "José 林", description: 'Line one\r\nLine two, with "quotes"' }]);
    expect(csv).toBe('name,description\r\nJosé 林,"Line one\r\nLine two, with ""quotes"""');
  });

  it("normalizes missing values to empty cells without changing numeric values", () => {
    const csv = toCsv([{ id: "000123", missing: null, undefinedValue: undefined, amount: 12.5 }]);
    expect(csv).toBe("id,missing,undefinedValue,amount\r\n000123,,,12.5");
  });

  it("protects spreadsheet formula triggers after whitespace and control characters", () => {
    const csv = toCsv([{
      equals: "=1+1",
      plus: "  +SUM(A1:A2)",
      minus: "\t-1+2",
      at: "\u0000@SUM(A1)",
      fullWidth: "＝1+1",
      numeric: -42,
      ordinaryText: "  keep leading spaces",
    }]);

    expect(csv).toBe([
      "equals,plus,minus,at,fullWidth,numeric,ordinaryText",
      "'=1+1,\"'  +SUM(A1:A2)\",\"'\t-1+2\",\"'\u0000@SUM(A1)\",'＝1+1,-42,\"  keep leading spaces\"",
    ].join("\r\n"));
  });

  it("keeps the UTF-8 BOM in downloaded CSV content", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    let capturedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock";
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    downloadCsv([{ name: "José" }], "export.csv");

    const blob = capturedBlob!;
    expect(blob.type).toContain("text/csv");
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("name\r\nJosé");
    expect(click).toHaveBeenCalledTimes(1);
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

  it("removes the anchor and revokes the URL when the browser rejects a download click", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("Download was blocked");
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:blocked"), revokeObjectURL });
    vi.useFakeTimers();

    expect(() => downloadCsv([{ a: 1 }], "blocked.csv")).toThrow("Download was blocked");
    expect(document.querySelector('a[download="blocked.csv"]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:blocked");
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

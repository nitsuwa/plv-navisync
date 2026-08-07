/**
 * Client-side export helpers (CSV / JSON).
 * Downloads are generated entirely in the browser — no server required.
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick so the download can finish.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  // Wrap in quotes when the value contains a comma, quote, or newline.
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Build a CSV string from an array of row objects (keys become the header). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

/** Download rows as a CSV file. */
export function downloadCsv(rows: Record<string, unknown>[], filename: string): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

/** Download arbitrary data as a JSON file. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

export const exporters = { toCsv, downloadCsv, downloadJson };

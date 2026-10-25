/**
 * Client-side export helpers (CSV / JSON).
 * Downloads are generated entirely in the browser — no server required.
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  try {
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    // Release even if the browser rejects the click; allow a successful
    // download to start before revoking its object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function protectSpreadsheetFormula(value: unknown): unknown {
  if (typeof value !== "string") return value;

  // Spreadsheet applications may ignore leading whitespace/control characters
  // before interpreting a formula. Prefix the original text with an apostrophe
  // when its first significant character is a formula trigger. Non-string
  // numeric cells (including negative numbers) keep their numeric meaning.
  return /^[\s\u0000-\u001f\u007f\ufeff]*[=+\-@＝＋－＠]/u.test(value)
    ? `'${value}`
    : value;
}

function csvEscape(value: unknown): string {
  const safeValue = protectSpreadsheetFormula(value);
  const str = safeValue == null ? "" : String(safeValue);
  const originalText = typeof value === "string" ? value : str;
  // Quote delimiters, line breaks, controls and edge whitespace to preserve cell content.
  return /[",\u0000-\u001f\u007f]/.test(str) || /^\s|\s$/u.test(originalText) || /^\s|\s$/u.test(str)
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

/** Build a CSV string from row objects using the first row's stable key order. */
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
  // Excel uses the UTF-8 BOM to reliably recognize non-ASCII text in CSV files.
  const blob = new Blob(["\uFEFF", toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

/** Download arbitrary data as a JSON file. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

export const exporters = { toCsv, downloadCsv, downloadJson };

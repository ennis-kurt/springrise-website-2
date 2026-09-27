// RFC 4180 CSV rendering with formula-injection neutralization for exports
// opened in spreadsheet software.
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  // BOM so Excel opens the UTF-8 file correctly; CRLF per RFC 4180.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, columns: string[], rows: Record<string, unknown>[]): Response {
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

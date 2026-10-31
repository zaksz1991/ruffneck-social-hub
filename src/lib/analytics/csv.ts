export function safeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula execution while preserving ordinary text.
  if (/^[\u0000-\u0020]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
}

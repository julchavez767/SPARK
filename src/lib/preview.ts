/**
 * The text to preview under a title. Quick captures use the first line as the
 * title, so that line is skipped; imported items have a separate description,
 * which is shown in full.
 */
export function previewText(title: string, body: string | null): string {
  const text = (body ?? "").trim();
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const first = (lines[0] ?? "").replace(/\s+/g, " ").trim();
  const t = title.trim();
  const repeatsTitle = first === t || (t.endsWith("…") && first.startsWith(t.slice(0, -1).trimEnd()));
  return (repeatsTitle ? lines.slice(1) : lines).join(" ").replace(/\s+/g, " ").trim();
}

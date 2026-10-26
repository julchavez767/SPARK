import { z } from "zod";

export const LIMITS = {
  title: 200,
  body: 20000,
  search: 200,
} as const;

export const captureSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write or say something first.")
    .max(LIMITS.body, `Ideas are limited to ${LIMITS.body.toLocaleString()} characters.`),
  source: z.enum(["text", "voice"]).default("text"),
});

export type CaptureInput = z.infer<typeof captureSchema>;

/** The title is the first non-empty line, trimmed to a readable length. */
export function deriveTitle(body: string, max = 120): string {
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? body.trim();
  const collapsed = firstLine.replace(/\s+/g, " ");
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export const searchSchema = z.object({
  q: z.string().trim().max(LIMITS.search).optional().catch(undefined),
  status: z.enum(["spark", "exploring", "parked", "activated", "archived"]).optional().catch(undefined),
});

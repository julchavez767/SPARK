import { z } from "zod";
import { ITEM_TYPES } from "@/lib/types";

export const LIMITS = {
  title: 200,
  body: 20000,
  search: 200,
} as const;

const itemType = z.enum(ITEM_TYPES);
const uuid = z.string().uuid("That item couldn't be found.");

export const captureSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write or say something first.")
    .max(LIMITS.body, `Items are limited to ${LIMITS.body.toLocaleString()} characters.`),
  type: itemType.default("idea"),
  source: z.enum(["text", "voice"]).default("text"),
});

export const createRelatedSchema = z.object({
  fromId: uuid,
  type: itemType,
  title: z.string().trim().min(1, "Give it a name.").max(LIMITS.title),
});

export const linkSchema = z.object({
  fromId: uuid,
  toId: uuid,
});

export const statusSchema = z.object({
  id: uuid,
  status: z.string().min(1).max(40),
});

export const titleSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "The title can't be empty.").max(LIMITS.title),
});

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
  type: itemType.optional().catch(undefined),
  status: z.string().max(40).optional().catch(undefined),
});

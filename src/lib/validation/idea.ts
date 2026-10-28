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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v.replace(/\s+/g, " ")));

/** http(s) only, so a stored link can never run script when clicked. */
export const sourceUrlSchema = z
  .string()
  .trim()
  .max(2000, "That link is too long.")
  .transform((v) => (v === "" ? null : v))
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Source URL must start with http:// or https://");

export const detailsSchema = z.object({
  id: uuid,
  categoryId: z.union([uuid, z.literal(""), z.literal("__new")]),
  newCategory: optionalText(60),
  tags: z.string().max(1000).default(""),
  sourceName: optionalText(100),
  sourceUrl: sourceUrlSchema,
  origin: z.enum(["", "mine", "co_developed", "suggested"]).transform((v) => (v === "" ? null : v)),
});

export const reasoningSchema = z.object({
  itemId: uuid,
  kind: z.enum(["note", "hypothesis", "challenge", "decision", "lesson"]).catch("note"),
  body: z.string().trim().min(1, "Write something first.").max(10000, "Entries are limited to 10,000 characters."),
});

export const categoryNameSchema = z.string().trim().min(1, "Give the category a name.").max(60, "Keep it under 60 characters.").transform((v) => v.replace(/\s+/g, " "));

export const searchSchema = z.object({
  q: z.string().trim().max(LIMITS.search).optional().catch(undefined),
  type: itemType.optional().catch(undefined),
  status: z.string().max(40).optional().catch(undefined),
  cat: z.union([z.string().uuid(), z.literal("none")]).optional().catch(undefined),
  tag: z.string().uuid().optional().catch(undefined),
  import: z.string().uuid().optional().catch(undefined),
  sort: z.enum(["newest", "oldest", "updated", "title"]).optional().catch(undefined),
});

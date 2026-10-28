// An item's TYPE is what it is, its STATUS is where it stands,
// and its LINKS are what it relates to. The three are independent.

export const ITEM_TYPES = ["idea", "project", "system"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TYPE_LABEL: Record<ItemType, string> = {
  idea: "Idea",
  project: "Project",
  system: "System",
};

export const TYPE_PLURAL: Record<ItemType, string> = {
  idea: "Ideas",
  project: "Projects",
  system: "Systems",
};

/** Each type has its own short list of statuses. The first is the default. */
export const STATUSES = {
  idea: ["spark", "exploring", "parked", "archived"],
  project: ["planned", "active", "paused", "done", "archived"],
  system: ["running", "needs_attention", "retired"],
} as const satisfies Record<ItemType, readonly string[]>;

export type ItemStatus = (typeof STATUSES)[ItemType][number];

export const STATUS_LABEL: Record<ItemStatus, string> = {
  spark: "Spark",
  exploring: "Exploring",
  parked: "Parked",
  archived: "Archived",
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  done: "Done",
  running: "Running",
  needs_attention: "Needs attention",
  retired: "Retired",
};

/** How the item was entered: typed or dictated. Not the same as where the idea came from. */
export type ItemSource = "text" | "voice";

/** Whose idea it was. Optional. */
export const ORIGINS = ["mine", "co_developed", "suggested"] as const;
export type ItemOrigin = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<ItemOrigin, string> = {
  mine: "My idea",
  co_developed: "Co-developed",
  suggested: "Suggested",
};

export type ItemSummary = {
  id: string;
  type: ItemType;
  status: ItemStatus;
  title: string;
  original_body: string | null;
  source: ItemSource;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  source_name: string | null;
  source_url: string | null;
  origin: ItemOrigin | null;
  import_id: string | null;
};

export const ITEM_SUMMARY_COLUMNS =
  "id, type, status, title, original_body, source, created_at, updated_at, category_id, source_name, source_url, origin, import_id";

export type Category = { id: string; name: string };
export type Tag = { id: string; name: string };

/** Reasoning Log entry types, in the order shown. Note is the default. */
export const REASONING_KINDS = ["note", "hypothesis", "challenge", "decision", "lesson"] as const;
export type ReasoningKind = (typeof REASONING_KINDS)[number];
export const REASONING_LABEL: Record<ReasoningKind, string> = {
  note: "Note",
  hypothesis: "Hypothesis",
  challenge: "Challenge",
  decision: "Decision",
  lesson: "Lesson",
};
export const REASONING_HINT: Record<ReasoningKind, string> = {
  note: "Anything you're thinking about this…",
  hypothesis: "What do you believe might be true?",
  challenge: "What could be wrong, risky, or assumed?",
  decision: "What did you decide, and why?",
  lesson: "What did you learn?",
};
export function isReasoningKind(value: unknown): value is ReasoningKind {
  return typeof value === "string" && (REASONING_KINDS as readonly string[]).includes(value);
}

export type ReasoningEntry = {
  id: string;
  kind: ReasoningKind;
  body: string;
  /** When SPARK recorded it (for imported entries: the import time). */
  created_at: string;
  /** Original date from an import, as precise as the source: "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  occurred_on: string | null;
  import_id: string | null;
  data: { pos?: number } | null;
};

/** Newest first, by original date where known, otherwise by when it was recorded; file order within an import. */
export function compareReasoning(a: ReasoningEntry, b: ReasoningEntry): number {
  const ka = a.occurred_on ?? a.created_at;
  const kb = b.occurred_on ?? b.created_at;
  if (ka !== kb) return ka < kb ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return (b.data?.pos ?? 0) - (a.data?.pos ?? 0);
}

export const SORTS = ["newest", "oldest", "updated", "title"] as const;
export type SortKey = (typeof SORTS)[number];
export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
  title: "Title A–Z",
};

export function isOrigin(value: unknown): value is ItemOrigin {
  return typeof value === "string" && (ORIGINS as readonly string[]).includes(value);
}

/** Every status across all types, without repeats (Archived is shared). */
export const ALL_STATUSES: ItemStatus[] = Array.from(new Set(ITEM_TYPES.flatMap((t) => [...STATUSES[t]]))) as ItemStatus[];

export function isAnyStatus(value: unknown): value is ItemStatus {
  return typeof value === "string" && (ALL_STATUSES as string[]).includes(value);
}

export function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && (ITEM_TYPES as readonly string[]).includes(value);
}

export function isStatusFor(type: ItemType, value: unknown): value is ItemStatus {
  return typeof value === "string" && (STATUSES[type] as readonly string[]).includes(value);
}

/** Links are stored once per pair with the smaller id first. */
export function orderedPair(x: string, y: string): { a_id: string; b_id: string } {
  return x < y ? { a_id: x, b_id: y } : { a_id: y, b_id: x };
}

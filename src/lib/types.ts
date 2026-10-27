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

export type ItemSource = "text" | "voice";

export type ItemSummary = {
  id: string;
  type: ItemType;
  status: ItemStatus;
  title: string;
  original_body: string | null;
  source: ItemSource;
  created_at: string;
};

export const ITEM_SUMMARY_COLUMNS = "id, type, status, title, original_body, source, created_at";

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

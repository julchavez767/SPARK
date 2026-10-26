export const IDEA_STATUSES = ["spark", "exploring", "parked", "activated", "archived"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const STATUS_LABEL: Record<IdeaStatus, string> = {
  spark: "Spark",
  exploring: "Exploring",
  parked: "Parked",
  activated: "Activated",
  archived: "Archived",
};

export type IdeaSource = "text" | "voice";

export type IdeaListItem = {
  id: string;
  title: string;
  original_body: string;
  status: IdeaStatus;
  source: IdeaSource;
  created_at: string;
};

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return typeof value === "string" && (IDEA_STATUSES as readonly string[]).includes(value);
}

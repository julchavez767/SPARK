import { parseCsv } from "./csv";
import { normalizeReasoning, REASONING_LIMITS, type ImportEntry } from "./reasoning";
import {
  STATUSES,
  type ItemOrigin,
  type ItemStatus,
  type ItemType,
} from "../types";

export const IMPORT_LIMITS = {
  maxRows: 1000,
  maxFileBytes: 2 * 1024 * 1024,
  title: 200,
  description: 20000,
  category: 60,
  tag: 40,
  maxTags: 20,
  sourceName: 100,
  sourceUrl: 2000,
} as const;

/** One record from the file, cleaned and checked. */
export type ImportRow = {
  key: string; // stable id for this row within the file: "r1", "r2", …
  line: number; // 1-based position among records, for messages
  type: ItemType | null;
  title: string;
  description: string | null;
  status: ItemStatus | null;
  category: string | null;
  tags: string[];
  ref: string | null;
  related: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  origin: ItemOrigin | null;
  created: string | null; // ISO timestamp
  reasoning: ImportEntry[]; // Reasoning Log entries for this item (JSON only in practice)
  warnings: string[];
  errors: string[];
};

export type ParsedFile = {
  rows: ImportRow[];
  ignoredColumns: string[];
  fileError: string | null;
  /** File-level notes, e.g. a top-level key that isn't read. */
  fileNotes: string[];
};

type Field =
  | "type" | "title" | "description" | "status" | "category" | "tags"
  | "ref" | "related" | "source" | "source_url" | "origin" | "created" | "reasoning";

/** Column names people (and ChatGPT) tend to use, mapped to SPARK fields. */
const ALIASES: Record<string, Field> = {
  type: "type", kind: "type", item_type: "type",
  title: "title", name: "title", idea: "title",
  description: "description", notes: "description", note: "description", body: "description",
  details: "description", summary: "description", text: "description", content: "description",
  status: "status", state: "status", stage: "status",
  category: "category", area: "category",
  tags: "tags", tag: "tags", labels: "tags", keywords: "tags",
  ref: "ref", id: "ref", key: "ref",
  related: "related", links: "related", related_items: "related", relationships: "related",
  related_to: "related", connections: "related",
  source: "source", source_name: "source", platform: "source", where: "source",
  source_url: "source_url", url: "source_url", link: "source_url", source_link: "source_url",
  origin: "origin", ownership: "origin", whose: "origin",
  created: "created", created_at: "created", date: "created", created_date: "created", date_created: "created",
  reasoning: "reasoning", reasoning_log: "reasoning", reasoning_entries: "reasoning", entries: "reasoning",
  log: "reasoning", reflections: "reasoning", journal: "reasoning",
};

function headerKey(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\u0000/g, "").trim();
}

function oneLine(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

const TYPE_WORDS: Record<string, ItemType> = {
  idea: "idea", ideas: "idea",
  project: "project", projects: "project",
  system: "system", systems: "system", existing_system: "system",
};

const STATUS_ALIASES: Record<ItemType, Record<string, ItemStatus>> = {
  idea: { new: "spark", raw: "spark", exploring: "exploring", explore: "exploring", in_progress: "exploring", on_hold: "parked", paused: "parked", later: "parked" },
  project: { not_started: "planned", todo: "planned", in_progress: "active", ongoing: "active", started: "active", on_hold: "paused", completed: "done", complete: "done", finished: "done" },
  system: { active: "running", live: "running", working: "running", broken: "needs_attention", needs_work: "needs_attention", attention: "needs_attention", inactive: "retired", stopped: "retired" },
};

const ORIGIN_ALIASES: Record<string, ItemOrigin> = {
  mine: "mine", my_idea: "mine", me: "mine", own: "mine", original: "mine",
  co_developed: "co_developed", codeveloped: "co_developed", co_created: "co_developed",
  collaborative: "co_developed", collaboration: "co_developed", collab: "co_developed", together: "co_developed", shared: "co_developed", co_dev: "co_developed",
  suggested: "suggested", suggestion: "suggested", suggested_by_ai: "suggested", ai_suggested: "suggested",
};

function word(v: string): string {
  return v.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

/** "a; b; #c" (or commas when no semicolons) → clean unique list. */
export function splitList(v: unknown, maxLen: number): string[] {
  if (Array.isArray(v)) return uniqueClean(v.map(clean), maxLen);
  const s = clean(v);
  if (!s) return [];
  const parts = s.includes(";") ? s.split(";") : s.includes("|") ? s.split("|") : s.split(",");
  return uniqueClean(parts, maxLen);
}

function uniqueClean(parts: string[], maxLen: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = oneLine(p).replace(/^#/, "").slice(0, maxLen);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** Related entries can contain commas (they are titles), so only ; and | split them. */
function splitRelated(v: unknown): string[] {
  if (Array.isArray(v)) return uniqueClean(v.map(clean), IMPORT_LIMITS.title);
  const s = clean(v);
  if (!s) return [];
  return uniqueClean(s.split(/[;|]/), IMPORT_LIMITS.title);
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v;
  const t = Date.parse(isoDay);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function normalizeRecord(raw: Partial<Record<Field, unknown>>, index: number, now: number, ignored?: Set<string>): ImportRow {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Type
  const typeWord = word(clean(raw.type));
  const type = TYPE_WORDS[typeWord] ?? null;
  if (!typeWord) errors.push("Missing type (idea, project or system).");
  else if (!type) errors.push(`Unknown type “${clean(raw.type)}”. Use idea, project or system.`);

  // Title
  let title = oneLine(clean(raw.title));
  let description = clean(raw.description) || null;
  if (!title && description) {
    title = oneLine(description.split(/\r?\n/)[0] ?? "");
    warnings.push("No title, so the first line of the description is used.");
  }
  if (!title) errors.push("Missing title.");
  if (title.length > IMPORT_LIMITS.title) {
    title = `${title.slice(0, IMPORT_LIMITS.title - 1).trimEnd()}…`;
    warnings.push(`Title shortened to ${IMPORT_LIMITS.title} characters.`);
  }
  if (description && description.length > IMPORT_LIMITS.description) {
    errors.push(`Description is longer than ${IMPORT_LIMITS.description.toLocaleString()} characters.`);
  }

  // Status
  let status: ItemStatus | null = null;
  const statusWord = word(clean(raw.status));
  if (statusWord && type) {
    const allowed = STATUSES[type] as readonly string[];
    if (allowed.includes(statusWord)) status = statusWord as ItemStatus;
    else if (STATUS_ALIASES[type][statusWord]) status = STATUS_ALIASES[type][statusWord]!;
    else warnings.push(`Status “${clean(raw.status)}” doesn’t fit a ${type}; it will start as ${allowed[0]}.`);
  }

  // Category
  let category = oneLine(clean(raw.category)) || null;
  if (category && category.length > IMPORT_LIMITS.category) {
    category = category.slice(0, IMPORT_LIMITS.category);
    warnings.push(`Category shortened to ${IMPORT_LIMITS.category} characters.`);
  }

  // Tags
  const tags = splitList(raw.tags, IMPORT_LIMITS.tag);
  if (tags.length > IMPORT_LIMITS.maxTags) warnings.push(`Only the first ${IMPORT_LIMITS.maxTags} tags are kept.`);

  // Source, URL, origin
  let sourceName = oneLine(clean(raw.source)) || null;
  if (sourceName && sourceName.length > IMPORT_LIMITS.sourceName) sourceName = sourceName.slice(0, IMPORT_LIMITS.sourceName);

  let sourceUrl: string | null = clean(raw.source_url) || null;
  if (sourceUrl) {
    let ok = false;
    try {
      const u = new URL(sourceUrl);
      ok = (u.protocol === "http:" || u.protocol === "https:") && sourceUrl.length <= IMPORT_LIMITS.sourceUrl;
    } catch {
      ok = false;
    }
    if (!ok) {
      warnings.push("Source URL isn’t a valid http(s) link, so it’s left out.");
      sourceUrl = null;
    }
  }

  let origin: ItemOrigin | null = null;
  const originWord = word(clean(raw.origin));
  if (originWord) {
    origin = ORIGIN_ALIASES[originWord] ?? null;
    if (!origin) warnings.push(`Origin “${clean(raw.origin)}” isn’t one of: My idea, Co-developed, Suggested. Left blank.`);
  }

  // Created date
  let created: string | null = null;
  const createdRaw = clean(raw.created);
  if (createdRaw) {
    created = parseDate(createdRaw);
    if (!created) warnings.push(`Couldn’t read the date “${createdRaw}”; today is used.`);
    else if (Date.parse(created) > now + 24 * 3600 * 1000) {
      warnings.push("Created date is in the future; today is used.");
      created = null;
    }
  }

  // Reasoning Log entries
  const reasoning = normalizeReasoning(raw.reasoning, now, ignored);
  warnings.push(...reasoning.warnings);
  errors.push(...reasoning.errors);

  return {
    key: `r${index + 1}`,
    line: index + 1,
    type,
    title,
    description,
    status,
    category,
    tags: tags.slice(0, IMPORT_LIMITS.maxTags),
    ref: oneLine(clean(raw.ref)) || null,
    related: splitRelated(raw.related),
    sourceName,
    sourceUrl,
    origin,
    created,
    reasoning: reasoning.entries,
    warnings,
    errors,
  };
}

function mapRecord(record: Record<string, unknown>, ignored: Set<string>): Partial<Record<Field, unknown>> {
  const out: Partial<Record<Field, unknown>> = {};
  for (const [k, v] of Object.entries(record)) {
    const field = ALIASES[headerKey(k)];
    if (!field) {
      if (clean(v) !== "") ignored.add(k.trim());
      continue;
    }
    if (out[field] === undefined || clean(out[field]) === "") out[field] = v;
  }
  return out;
}

/** Reads CSV or JSON text into normalized rows. `now` is injectable for tests. */
export function parseImport(text: string, fileName = "", now = Date.now()): ParsedFile {
  const ignored = new Set<string>();
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "The file is empty." };
  if (text.length > IMPORT_LIMITS.maxFileBytes) {
    return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "The file is larger than 2 MB. Split it into smaller files." };
  }

  let records: Record<string, unknown>[] = [];
  const fileNotes: string[] = [];
  const looksJson = /\.json$/i.test(fileName) || trimmed.startsWith("[") || trimmed.startsWith("{");

  if (looksJson) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "This JSON couldn’t be read. Check for a missing comma or bracket." };
    }
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
        : null;
    if (!list) return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "JSON must be a list of items, or an object with an “items” list." };
    records = list.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object" && !Array.isArray(r));
    if (!Array.isArray(data)) {
      const extra = Object.keys(data as object).filter((k) => k !== "items");
      if (extra.length > 0) {
        fileNotes.push(`Only “items” is read. Ignored: ${extra.map((k) => `“${k}”`).join(", ")}. Reasoning goes inside each item, in its “reasoning” list.`);
      }
    }
  } else {
    const table = parseCsv(text);
    if (table.length < 2) return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "The CSV needs a header row and at least one item." };
    const headers = table[0]!.map((h) => h.trim());
    if (!headers.some((h) => ALIASES[headerKey(h)] === "title") || !headers.some((h) => ALIASES[headerKey(h)] === "type")) {
      return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "The CSV needs at least “type” and “title” columns. Download the template to see the format." };
    }
    records = table.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
  }

  if (records.length === 0) return { rows: [], ignoredColumns: [], fileNotes: [], fileError: "No items found in the file." };
  if (records.length > IMPORT_LIMITS.maxRows) {
    return { rows: [], ignoredColumns: [], fileNotes: [], fileError: `The file has ${records.length.toLocaleString()} items. The limit is ${IMPORT_LIMITS.maxRows.toLocaleString()} per import; split it into smaller files.` };
  }

  const rows = records.map((r, i) => normalizeRecord(mapRecord(r, ignored), i, now, ignored));
  const entryTotal = rows.reduce((n, r) => n + r.reasoning.length, 0);
  if (entryTotal > REASONING_LIMITS.perFile) {
    return { rows: [], ignoredColumns: [], fileNotes: [], fileError: `The file has ${entryTotal.toLocaleString()} reasoning entries. The limit is ${REASONING_LIMITS.perFile.toLocaleString()} per import; split it into smaller files.` };
  }
  return { rows, ignoredColumns: [...ignored], fileNotes, fileError: null };
}

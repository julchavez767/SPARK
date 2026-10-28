import { type ReasoningKind } from "../types";

/** Reasoning Log entries carried inside an imported item. */
export const REASONING_LIMITS = {
  perItem: 100,
  perFile: 10000,
  body: 10000,
} as const;

export type ImportEntry = {
  kind: ReasoningKind;
  body: string;
  /** The original date, only as precise as the source: "YYYY", "YYYY-MM" or "YYYY-MM-DD". Null = unknown. */
  date: string | null;
  /** 1-based position in the item's list, kept so entries show in file order. */
  pos: number;
};

/** Words people (and ChatGPT) use for each type. */
const KIND_ALIASES: Record<string, ReasoningKind> = {
  note: "note", notes: "note", thought: "note", thoughts: "note", observation: "note", comment: "note", context: "note", idea: "note",
  hypothesis: "hypothesis", hypotheses: "hypothesis", belief: "hypothesis", theory: "hypothesis", bet: "hypothesis", guess: "hypothesis",
  challenge: "challenge", challenges: "challenge", assumption: "challenge", assumptions: "challenge", risk: "challenge", risks: "challenge",
  question: "challenge", questions: "challenge", concern: "challenge", concerns: "challenge", objection: "challenge", doubt: "challenge",
  decision: "decision", decisions: "decision", choice: "decision", decided: "decision", resolution: "decision",
  lesson: "lesson", lessons: "lesson", learning: "lesson", learnings: "lesson", insight: "lesson", insights: "lesson",
  lesson_learned: "lesson", lessons_learned: "lesson", takeaway: "lesson", takeaways: "lesson",
};

type EntryField = "kind" | "body" | "date";

const ENTRY_FIELDS: Record<string, EntryField> = {
  type: "kind", kind: "kind", category: "kind", entry_type: "kind",
  text: "body", body: "body", content: "body", entry: "body", note: "body", description: "body", reasoning: "body", summary: "body",
  date: "date", occurred_on: "date", occurred: "date", when: "date", created: "date", created_at: "date", date_created: "date",
};

const UNKNOWN_DATE = new Set(["", "unknown", "n/a", "na", "none", "null", "?", "-", "tbd", "undated"]);

function key(v: string): string {
  return v.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return "";
  return String(v).replace(/\u0000/g, "").trim();
}

/** Same type and same words (ignoring case and spacing) = the same entry. */
export function entryKey(kind: string, body: string): string {
  return `${kind}|${body.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

function validDay(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Reads an original date without inventing precision: a year stays a year and a
 * month stays a month. Anything ambiguous is left blank with a reason.
 */
export function parseEntryDate(raw: string, now: number): { date: string | null; problem?: string } {
  const v = raw.trim();
  if (UNKNOWN_DATE.has(v.toLowerCase())) return { date: null };

  let date: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})$/))) {
    date = m[1]!;
  } else if ((m = v.match(/^(\d{4})-(\d{2})$/))) {
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12) date = `${m[1]}-${m[2]}`;
  } else if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/))) {
    if (validDay(+m[1]!, +m[2]!, +m[3]!)) date = `${m[1]}-${m[2]}-${m[3]}`;
  } else if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    // US style M/D/YYYY.
    if (validDay(+m[3]!, +m[1]!, +m[2]!)) date = `${m[3]}-${pad(+m[1]!)}-${pad(+m[2]!)}`;
  }

  if (!date) return { date: null, problem: `couldn’t read the date “${v}” (use YYYY-MM-DD, YYYY-MM or YYYY), so it’s left blank` };
  if (Number(date.slice(0, 4)) < 1900) return { date: null, problem: `the date “${v}” looks wrong, so it’s left blank` };
  const today = new Date(now + 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (date.slice(0, today.length) > today.slice(0, date.length)) {
    return { date: null, problem: `the date “${v}” is in the future, so it’s left blank` };
  }
  return { date };
}

export type ReasoningResult = { entries: ImportEntry[]; warnings: string[]; errors: string[] };

/**
 * Normalizes an item's `reasoning` value. Accepts a list of entries (objects or
 * plain strings), a single entry object, or a single string. Plain text is a Note.
 * Problems that would lose or misfile content are errors (the item is held back
 * so it can be fixed); harmless ones are warnings.
 */
export function normalizeReasoning(raw: unknown, now: number, ignored?: Set<string>): ReasoningResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const entries: ImportEntry[] = [];

  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { entries, warnings, errors };
  }

  let list: unknown[];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string" || (typeof raw === "object" && raw !== null)) list = [raw];
  else {
    errors.push("Reasoning must be a list of entries, like [{\"type\": \"decision\", \"text\": \"…\"}].");
    return { entries, warnings, errors };
  }

  if (list.length > REASONING_LIMITS.perItem) {
    errors.push(`Has ${list.length} reasoning entries; the limit is ${REASONING_LIMITS.perItem} per item. Split it across files.`);
    return { entries, warnings, errors };
  }

  const seen = new Map<string, number>();

  list.forEach((item, i) => {
    const n = i + 1;
    const label = `Reasoning entry ${n}`;
    let kind: ReasoningKind = "note";
    let body = "";
    let dateRaw = "";

    if (typeof item === "string" || typeof item === "number") {
      body = text(item);
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const fields: Partial<Record<EntryField, unknown>> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        const f = ENTRY_FIELDS[key(k)];
        if (!f) {
          if (text(v) !== "") ignored?.add(`reasoning → ${k.trim()}`);
          continue;
        }
        if (fields[f] === undefined || text(fields[f]) === "") fields[f] = v;
      }
      const kindRaw = text(fields.kind);
      if (kindRaw) {
        const k = KIND_ALIASES[key(kindRaw)];
        if (!k) {
          errors.push(`${label} has an unknown type “${kindRaw}”. Use note, hypothesis, challenge, decision or lesson.`);
          return;
        }
        kind = k;
      }
      if (fields.body !== undefined && typeof fields.body === "object" && fields.body !== null) {
        errors.push(`${label}: the text must be plain text, not a list or object.`);
        return;
      }
      body = text(fields.body);
      dateRaw = text(fields.date);
    } else {
      errors.push(`${label} isn’t text or an entry object.`);
      return;
    }

    if (!body) {
      warnings.push(`${label} has no text, so it’s left out.`);
      return;
    }
    if (body.length > REASONING_LIMITS.body) {
      errors.push(`${label} is ${body.length.toLocaleString()} characters; the limit is ${REASONING_LIMITS.body.toLocaleString()}.`);
      return;
    }

    let date: string | null = null;
    if (dateRaw) {
      const parsed = parseEntryDate(dateRaw, now);
      date = parsed.date;
      if (parsed.problem) warnings.push(`${label}: ${parsed.problem}.`);
    }

    const k = entryKey(kind, body);
    const earlier = seen.get(k);
    if (earlier !== undefined) {
      warnings.push(`${label} repeats entry ${earlier}, so it’s left out.`);
      return;
    }
    seen.set(k, n);
    entries.push({ kind, body, date, pos: n });
  });

  return { entries, warnings, errors };
}

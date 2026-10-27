import type { ImportRow } from "./normalize";
import type { ItemType } from "../types";

export type ExistingItem = { id: string; type: ItemType; title: string };

export type Decision = "import" | "skip";

/** What a row looks like a duplicate of. */
export type DuplicateMatch = {
  kind: "exact" | "near" | "other_type";
  title: string;
  type: ItemType;
  existingId?: string; // set when the match is already in SPARK
  rowKey?: string; // set when the match is an earlier row in this file
  rowLine?: number;
};

export type RowPlan = {
  row: ImportRow;
  duplicate: DuplicateMatch | null;
  decision: Decision | null; // null = waiting for the user
  needsReview: boolean;
  importing: boolean;
  linkCount: number;
  linkWarnings: string[];
};

/** A link endpoint is either a row key in this file or the id of an existing item. */
export type PlannedLink = { a: string; b: string };

export type ImportPlan = {
  rows: RowPlan[];
  links: PlannedLink[];
  summary: {
    byType: Record<ItemType, number>;
    importing: number;
    links: number;
    linksToExisting: number;
    exactDuplicates: number;
    needsReview: number;
    undecided: number;
    skipped: number;
    errors: number;
    warnings: number;
    newCategories: string[];
    newTags: string[];
  };
};

const STOP = new Set(["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "my", "our", "your", "its", "is", "be"]);

/** Lowercase, no accents or punctuation, single spaces. */
export function normTitle(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(norm: string): Set<string> {
  return new Set(norm.split(" ").filter((w) => w && !STOP.has(w)));
}

/** True when two titles are close but not identical. */
export function isNear(aNorm: string, bNorm: string): boolean {
  if (!aNorm || !bNorm || aNorm === bNorm) return false;
  const [short, long] = aNorm.length <= bNorm.length ? [aNorm, bNorm] : [bNorm, aNorm];
  if (short.length >= 12 && long.includes(short)) return true;
  const A = words(aNorm);
  const B = words(bNorm);
  if (Math.min(A.size, B.size) < 2) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared) >= 0.6;
}

function findDuplicate(row: ImportRow, existing: ExistingItem[], earlier: ImportRow[]): DuplicateMatch | null {
  if (!row.type) return null;
  const n = normTitle(row.title);
  const candidates: { title: string; type: ItemType; existingId?: string; rowKey?: string; rowLine?: number }[] = [
    ...existing.map((e) => ({ title: e.title, type: e.type, existingId: e.id })),
    ...earlier.filter((r) => r.type && r.errors.length === 0).map((r) => ({ title: r.title, type: r.type as ItemType, rowKey: r.key, rowLine: r.line })),
  ];

  // Strongest match wins: exact same type, then near same type, then exact other type.
  const exact = candidates.find((c) => c.type === row.type && normTitle(c.title) === n);
  if (exact) return { kind: "exact", ...exact };
  const near = candidates.find((c) => c.type === row.type && isNear(n, normTitle(c.title)));
  if (near) return { kind: "near", ...near };
  const other = candidates.find((c) => c.type !== row.type && normTitle(c.title) === n);
  if (other) return { kind: "other_type", ...other };
  return null;
}

/**
 * Builds the import plan. Pure and deterministic: the browser runs it for the
 * live preview, and the server runs it again on confirm before writing.
 */
export function analyzeImport(
  rows: ImportRow[],
  existing: ExistingItem[],
  decisions: Record<string, Decision | undefined>,
  existingCategories: string[] = [],
  existingTags: string[] = [],
): ImportPlan {
  // 1. Duplicates and decisions
  const plans: RowPlan[] = rows.map((row, i) => {
    if (row.errors.length > 0) {
      return { row, duplicate: null, decision: "skip", needsReview: false, importing: false, linkCount: 0, linkWarnings: [] };
    }
    const duplicate = findDuplicate(row, existing, rows.slice(0, i));
    const needsReview = duplicate !== null && duplicate.kind !== "exact";
    const fallback: Decision | null = duplicate === null ? "import" : duplicate.kind === "exact" ? "skip" : null;
    const decision = decisions[row.key] ?? fallback;
    return { row, duplicate, decision, needsReview, importing: decision === "import", linkCount: 0, linkWarnings: [] };
  });

  const byKey = new Map(plans.map((p) => [p.row.key, p]));
  const byRef = new Map<string, RowPlan>();
  for (const p of plans) if (p.row.ref && p.row.errors.length === 0) byRef.set(p.row.ref.toLowerCase(), p);

  // Where a row "lives" after decisions: itself if imported, or what it duplicates if skipped.
  const resolveRow = (p: RowPlan, depth = 0): string | null => {
    if (p.importing) return p.row.key;
    if (depth > 5 || !p.duplicate) return null;
    if (p.duplicate.existingId) return p.duplicate.existingId;
    const target = p.duplicate.rowKey ? byKey.get(p.duplicate.rowKey) : undefined;
    return target ? resolveRow(target, depth + 1) : null;
  };

  // 2. Relationships
  const seen = new Set<string>();
  const links: PlannedLink[] = [];
  let linksToExisting = 0;

  for (const p of plans) {
    if (!p.importing) continue;
    for (const token of p.row.related) {
      const t = token.trim();
      const tn = normTitle(t);
      let target: string | null = null;
      let problem: string | null = null;

      const refHit = byRef.get(t.toLowerCase());
      const rowHits = plans.filter((o) => o.row.errors.length === 0 && normTitle(o.row.title) === tn);
      const existingHits = existing.filter((e) => normTitle(e.title) === tn);

      if (refHit) target = resolveRow(refHit);
      else if (rowHits.length === 1) target = resolveRow(rowHits[0]!);
      else if (rowHits.length > 1) problem = `“${t}” matches ${rowHits.length} rows in the file; use a ref to be specific.`;
      else if (existingHits.length === 1) target = existingHits[0]!.id;
      else if (existingHits.length > 1) problem = `“${t}” matches ${existingHits.length} items in SPARK; link it by hand after importing.`;
      else problem = `Couldn’t find “${t}” in the file or in SPARK.`;

      if (!problem && !target) problem = `“${t}” isn’t being imported, so that link is left out.`;
      if (problem) {
        p.linkWarnings.push(problem);
        continue;
      }
      if (target === p.row.key) continue;

      const [a, b] = p.row.key < target! ? [p.row.key, target!] : [target!, p.row.key];
      const pairKey = `${a}|${b}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      links.push({ a, b });
      const isExisting = !byKey.has(target!);
      if (isExisting) linksToExisting += 1;
    }
  }

  // Count links per importing row (both directions).
  for (const l of links) {
    byKey.get(l.a)?.importing && (byKey.get(l.a)!.linkCount += 1);
    byKey.get(l.b)?.importing && (byKey.get(l.b)!.linkCount += 1);
  }

  // 3. Summary
  const importingRows = plans.filter((p) => p.importing);
  const byType: Record<ItemType, number> = { idea: 0, project: 0, system: 0 };
  for (const p of importingRows) byType[p.row.type as ItemType] += 1;

  const catLower = new Set(existingCategories.map((c) => c.toLowerCase()));
  const newCategories = Array.from(
    new Map(importingRows.filter((p) => p.row.category && !catLower.has(p.row.category.toLowerCase())).map((p) => [p.row.category!.toLowerCase(), p.row.category!])).values(),
  );
  const tagLower = new Set(existingTags.map((t) => t.toLowerCase()));
  const newTags = Array.from(
    new Map(importingRows.flatMap((p) => p.row.tags).filter((t) => !tagLower.has(t.toLowerCase())).map((t) => [t.toLowerCase(), t])).values(),
  );

  return {
    rows: plans,
    links,
    summary: {
      byType,
      importing: importingRows.length,
      links: links.length,
      linksToExisting,
      exactDuplicates: plans.filter((p) => p.duplicate?.kind === "exact").length,
      needsReview: plans.filter((p) => p.needsReview).length,
      undecided: plans.filter((p) => p.needsReview && p.decision === null).length,
      skipped: plans.filter((p) => p.row.errors.length === 0 && p.decision === "skip").length,
      errors: plans.filter((p) => p.row.errors.length > 0).length,
      warnings: plans.reduce((n, p) => n + (p.row.errors.length ? 0 : p.row.warnings.length + p.linkWarnings.length), 0),
      newCategories,
      newTags,
    },
  };
}

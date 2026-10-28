import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Category, Tag } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Number of links per item, for the ids given. */
export async function linkCounts(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const list = ids.join(",");
  const { data } = await supabase.from("item_links").select("a_id, b_id").or(`a_id.in.(${list}),b_id.in.(${list})`);
  for (const row of data ?? []) {
    for (const key of [row.a_id as string, row.b_id as string]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Reads every row a query returns, 1,000 at a time (Supabase's per-request limit). */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type LinkSummary = { count: number; first: { id: string; title: string } | null };

/** For each item: how many links it has, and the linked item that sorts first by title. */
export async function linkSummaries(supabase: Client, ids: string[]): Promise<Map<string, LinkSummary>> {
  const result = new Map<string, LinkSummary>();
  if (ids.length === 0) return result;
  const list = ids.join(",");
  const rows = await allPages<{ a_id: string; b_id: string }>((f, t) =>
    supabase.from("item_links").select("a_id, b_id").or(`a_id.in.(${list}),b_id.in.(${list})`).order("a_id").order("b_id").range(f, t),
  );
  const wanted = new Set(ids);
  const others = new Map<string, string[]>();
  for (const { a_id, b_id } of rows) {
    if (wanted.has(a_id)) others.set(a_id, [...(others.get(a_id) ?? []), b_id]);
    if (wanted.has(b_id)) others.set(b_id, [...(others.get(b_id) ?? []), a_id]);
  }
  const otherIds = Array.from(new Set(Array.from(others.values()).flat()));
  const titles = new Map<string, string>();
  for (let i = 0; i < otherIds.length; i += 200) {
    const { data } = await supabase.from("items").select("id, title").in("id", otherIds.slice(i, i + 200));
    for (const r of data ?? []) titles.set(r.id as string, r.title as string);
  }
  for (const [id, linked] of others) {
    const named = linked
      .filter((o) => titles.has(o))
      .map((o) => ({ id: o, title: titles.get(o)! }))
      .sort((x, y) => x.title.localeCompare(y.title));
    result.set(id, { count: linked.length, first: named[0] ?? null });
  }
  return result;
}

/** Number of Reasoning Log entries per item, for the ids given. */
export async function reasoningCounts(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await allPages<{ item_id: string }>((f, t) =>
    supabase
      .from("item_entries")
      .select("item_id")
      .in("item_id", ids)
      .in("kind", ["note", "hypothesis", "challenge", "decision", "lesson"])
      .order("id")
      .range(f, t),
  );
  for (const r of rows) counts.set(r.item_id, (counts.get(r.item_id) ?? 0) + 1);
  return counts;
}

/** The user's categories, alphabetical. */
export async function loadCategories(supabase: Client): Promise<Category[]> {
  const { data } = await supabase.from("categories").select("id, name").order("name");
  return (data ?? []) as Category[];
}

/** Tags per item, for the ids given. */
export async function tagsByItem(supabase: Client, ids: string[]): Promise<Map<string, Tag[]>> {
  const result = new Map<string, Tag[]>();
  if (ids.length === 0) return result;
  const { data: links } = await supabase.from("item_tags").select("item_id, tag_id").in("item_id", ids);
  const tagIds = Array.from(new Set((links ?? []).map((l) => l.tag_id as string)));
  if (tagIds.length === 0) return result;
  const { data: tags } = await supabase.from("tags").select("id, name").in("id", tagIds);
  const byId = new Map<string, Tag>((tags ?? []).map((t) => [t.id as string, { id: t.id as string, name: t.name as string }]));
  for (const l of links ?? []) {
    const tag = byId.get(l.tag_id as string);
    if (!tag) continue;
    const list = result.get(l.item_id as string) ?? [];
    list.push(tag);
    result.set(l.item_id as string, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/** Find a category by name (case-insensitive) or create it. Returns its id, or null for a blank name. */
export async function ensureCategory(supabase: Client, name: string): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  const { data: existing } = await supabase.from("categories").select("id, name");
  const match = (existing ?? []).find((c) => (c.name as string).toLowerCase() === clean.toLowerCase());
  if (match) return match.id as string;
  const { data, error } = await supabase.from("categories").insert({ name: clean }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create category");
  return data.id as string;
}

/** Split "a; b, #c" into clean, unique tag names. */
export function parseTagList(input: string): string[] {
  const parts = input.includes(";") ? input.split(";") : input.split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const name = raw.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, 20);
}

/** Make the item's tags exactly `names`, creating tags that don't exist yet. */
export async function setItemTags(supabase: Client, itemId: string, names: string[]): Promise<void> {
  const { data: allTags } = await supabase.from("tags").select("id, name");
  const byLower = new Map<string, string>((allTags ?? []).map((t) => [(t.name as string).toLowerCase(), t.id as string]));

  const missing = names.filter((n) => !byLower.has(n.toLowerCase()));
  if (missing.length) {
    const { data: created, error } = await supabase.from("tags").insert(missing.map((name) => ({ name }))).select("id, name");
    if (error) throw new Error(error.message);
    for (const t of created ?? []) byLower.set((t.name as string).toLowerCase(), t.id as string);
  }

  const wanted = new Set(names.map((n) => byLower.get(n.toLowerCase())).filter((id): id is string => Boolean(id)));
  const { data: current } = await supabase.from("item_tags").select("tag_id").eq("item_id", itemId);
  const have = new Set<string>((current ?? []).map((r) => r.tag_id as string));

  const toRemove = [...have].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !have.has(id));

  if (toRemove.length) {
    const { error } = await supabase.from("item_tags").delete().eq("item_id", itemId).in("tag_id", toRemove);
    if (error) throw new Error(error.message);
  }
  if (toAdd.length) {
    const { error } = await supabase.from("item_tags").insert(toAdd.map((tag_id) => ({ item_id: itemId, tag_id })));
    if (error) throw new Error(error.message);
  }
}

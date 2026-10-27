import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ItemCard } from "@/components/ItemCard";
import { linkCounts, loadCategories, tagsByItem } from "@/lib/items";
import {
  ITEM_SUMMARY_COLUMNS,
  ITEM_TYPES,
  STATUS_LABEL,
  TYPE_PLURAL,
  isAnyStatus,
  isStatusFor,
  type ItemStatus,
  type ItemSummary,
  type ItemType,
  type SortKey,
} from "@/lib/types";
import { searchSchema } from "@/lib/validation/idea";
import { FilterBar } from "./FilterBar";

export const metadata: Metadata = { title: "Library" };

const LIMIT = 100;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parsed = searchSchema.safeParse(await searchParams);
  const p = parsed.success ? parsed.data : {};
  const q = p.q ?? "";
  const type: ItemType | undefined = p.type;
  // A status only applies if it fits the selected type (or any type on "All").
  const status: ItemStatus | undefined =
    p.status && (type ? isStatusFor(type, p.status) : isAnyStatus(p.status)) ? (p.status as ItemStatus) : undefined;
  const sort: SortKey = p.sort ?? "newest";

  const supabase = await createClient();
  const categories = await loadCategories(supabase);
  const cat = p.cat === "none" || categories.some((c) => c.id === p.cat) ? p.cat : undefined;

  // Tag and import filters resolve to names for the chips, and to item ids for the query.
  const [tagRes, importRes] = await Promise.all([
    p.tag ? supabase.from("tags").select("id, name").eq("id", p.tag).maybeSingle() : Promise.resolve({ data: null }),
    p.import ? supabase.from("imports").select("id, file_name").eq("id", p.import).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const tag = tagRes.data as { id: string; name: string } | null;
  const imp = importRes.data as { id: string; file_name: string | null } | null;

  let taggedIds: string[] | null = null;
  if (tag) {
    const { data } = await supabase.from("item_tags").select("item_id").eq("tag_id", tag.id);
    taggedIds = (data ?? []).map((r) => r.item_id as string);
  }

  let query = supabase.from("items").select(ITEM_SUMMARY_COLUMNS).limit(LIMIT);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);
  if (cat === "none") query = query.is("category_id", null);
  else if (cat) query = query.eq("category_id", cat);
  if (imp) query = query.eq("import_id", imp.id);
  if (taggedIds) query = query.in("id", taggedIds.length ? taggedIds : ["00000000-0000-0000-0000-000000000000"]);

  query =
    sort === "oldest" ? query.order("created_at", { ascending: true })
    : sort === "updated" ? query.order("updated_at", { ascending: false })
    : sort === "title" ? query.order("title", { ascending: true })
    : query.order("created_at", { ascending: false });

  const { data, error } = await query;
  const items = (data ?? []) as ItemSummary[];
  const ids = items.map((i) => i.id);
  const [counts, tagMap] = await Promise.all([linkCounts(supabase, ids), tagsByItem(supabase, ids)]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // Builds a library URL from the current filters with some changed.
  const href = (changes: Record<string, string | undefined>) => {
    const current: Record<string, string | undefined> = { q: q || undefined, type, status, cat, tag: tag?.id, import: imp?.id, sort: sort === "newest" ? undefined : sort };
    const next = { ...current, ...changes };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const tabClass = (active: boolean) =>
    `shrink-0 border-b-2 px-1 pb-2 text-sm ${active ? "border-ember font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`;
  const filtered = Boolean(q || type || status || cat || tag || imp);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Library</h1>
        <Link href="/import" className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>
          Import
        </Link>
      </div>

      <form role="search" action="/library" className="mb-3">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={200}
          placeholder="Search ideas, projects and systems"
          className="h-11 w-full rounded-[10px] border border-line bg-surface px-4 outline-none focus:border-ember"
        />
        {type && <input type="hidden" name="type" value={type} />}
        {status && <input type="hidden" name="status" value={status} />}
        {cat && <input type="hidden" name="cat" value={cat} />}
        {tag && <input type="hidden" name="tag" value={tag.id} />}
        {imp && <input type="hidden" name="import" value={imp.id} />}
        {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
      </form>

      {/* Type */}
      <nav aria-label="Filter by type" className="mb-3 flex gap-5 overflow-x-auto border-b border-line">
        <Link href={href({ type: undefined, status: undefined })} aria-current={!type ? "page" : undefined} className={tabClass(!type)}>All</Link>
        {ITEM_TYPES.map((t) => (
          <Link
            key={t}
            href={href({ type: t, status: status && isStatusFor(t, status) ? status : undefined })}
            aria-current={type === t ? "page" : undefined}
            className={tabClass(type === t)}
          >
            {TYPE_PLURAL[t]}
          </Link>
        ))}
      </nav>

      <FilterBar q={q} type={type} status={status} cat={cat} tag={tag?.id} importId={imp?.id} sort={sort} categories={categories} />

      {(tag || imp) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tag && (
            <Link href={href({ tag: undefined })} className="inline-flex items-center gap-1 rounded-full bg-ember-soft px-3 py-1 text-sm">
              #{tag.name} <span aria-hidden="true">×</span><span className="sr-only">Remove tag filter</span>
            </Link>
          )}
          {imp && (
            <Link href={href({ import: undefined })} className="inline-flex items-center gap-1 rounded-full bg-ember-soft px-3 py-1 text-sm">
              From {imp.file_name ?? "import"} <span aria-hidden="true">×</span><span className="sr-only">Remove import filter</span>
            </Link>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-ember">Couldn’t load your library. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line p-6 text-center text-sm text-muted">
          {filtered ? (
            <>Nothing matches. <Link href="/library" className="underline underline-offset-2">Clear filters</Link></>
          ) : (
            "Nothing yet. Capture something, or import what you already have."
          )}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {items.length === LIMIT ? `Showing the first ${LIMIT}` : `${items.length} item${items.length === 1 ? "" : "s"}`}
            {status && ` · ${STATUS_LABEL[status]}`}
            {filtered && (
              <>
                {" · "}
                <Link href="/library" className="underline underline-offset-2 hover:text-ink">Clear filters</Link>
              </>
            )}
          </p>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  linkCount={counts.get(item.id)}
                  categoryName={item.category_id ? categoryName.get(item.category_id) : undefined}
                  tags={tagMap.get(item.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-sm text-muted">
        <Link href="/categories" className="hover:text-ink">Manage categories</Link>
        <Link href="/imports" className="hover:text-ink">Import history</Link>
      </footer>
    </>
  );
}

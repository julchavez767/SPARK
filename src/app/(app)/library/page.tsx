import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { linkSummaries, loadCategories, reasoningCounts, tagsByItem } from "@/lib/items";
import { getTimeCtx } from "@/lib/time-server";
import {
  ITEM_SUMMARY_COLUMNS,
  ITEM_TYPES,
  STATUS_LABEL,
  TYPE_PLURAL,
  STATUSES,
  isAnyStatus,
  isStatusFor,
  type ItemStatus,
  type ItemSummary,
  type ItemType,
  type SortKey,
} from "@/lib/types";
import { searchSchema } from "@/lib/validation/idea";
import { FilterBar } from "./FilterBar";
import { LibraryCard, LibraryRow, TYPE_ACCENT } from "./LibraryCard";
import { ViewToggle } from "./ViewToggle";
import { VIEW_COOKIE, type LibraryView } from "./view";
import { TYPE_STYLE, TypeIcon } from "@/components/ItemBadges";

export const metadata: Metadata = { title: "Library" };

const LIMIT = 100;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const parsed = searchSchema.safeParse(raw);
  // Cards by default; the last choice is remembered in a cookie. ?view= wins for this page.
  const savedView = (await cookies()).get(VIEW_COOKIE)?.value;
  const view: LibraryView = raw.view === "list" || raw.view === "cards" ? raw.view : savedView === "list" ? "list" : "cards";
  const p = parsed.success ? parsed.data : {};
  const q = p.q ?? "";
  const type: ItemType | undefined = p.type;
  // A status only applies if it fits the selected type (or any type on "All").
  const status: ItemStatus | undefined =
    p.status && (type ? isStatusFor(type, p.status) : isAnyStatus(p.status)) ? (p.status as ItemStatus) : undefined;
  const sort: SortKey = p.sort ?? "newest";

  const supabase = await createClient();
  const time = await getTimeCtx();
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

  // Overview counts: the same search, category, tag and import filters, across every type,
  // so each tile shows how many items that tile would show if tapped.
  const overviewRows: { type: ItemType; status: ItemStatus }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let cq = supabase.from("items").select("type, status").order("id").range(from, from + 999);
    if (q) cq = cq.textSearch("search", q, { type: "websearch", config: "english" });
    if (cat === "none") cq = cq.is("category_id", null);
    else if (cat) cq = cq.eq("category_id", cat);
    if (imp) cq = cq.eq("import_id", imp.id);
    if (taggedIds) cq = cq.in("id", taggedIds.length ? taggedIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: page } = await cq;
    overviewRows.push(...((page ?? []) as { type: ItemType; status: ItemStatus }[]));
    if (!page || page.length < 1000) break;
  }
  // Tapping a type keeps the status only if it fits that type (as the type links always have).
  const keepsStatus = (t: ItemType) => Boolean(status && isStatusFor(t, status));
  const inTile = (t: ItemType) => overviewRows.filter((r) => r.type === t && (!keepsStatus(t) || r.status === status));
  const allCount = overviewRows.filter((r) => !status || r.status === status).length;
  const tileSummary = (t: ItemType) => {
    const rows = inTile(t);
    const by = (STATUSES[t] as readonly ItemStatus[])
      .map((s) => ({ s, n: rows.filter((r) => r.status === s).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2);
    return by.length ? by.map((x) => `${x.n} ${STATUS_LABEL[x.s]}`).join(" · ") : "None yet";
  };

  const { data, error } = await query;
  const items = (data ?? []) as ItemSummary[];
  const ids = items.map((i) => i.id);
  const [links, tagMap, reasoning] = await Promise.all([
    linkSummaries(supabase, ids),
    tagsByItem(supabase, ids),
    reasoningCounts(supabase, ids),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  // Imported items were "added" when their import ran, whatever original date the file gave.
  const importIds = Array.from(new Set(items.map((i) => i.import_id).filter((x): x is string => Boolean(x))));
  const { data: importRows } = importIds.length
    ? await supabase.from("imports").select("id, created_at").in("id", importIds)
    : { data: [] as { id: string; created_at: string }[] };
  const importedAt = new Map((importRows ?? []).map((r) => [r.id as string, r.created_at as string]));
  const addedAt = (item: ItemSummary) => (item.import_id && importedAt.get(item.import_id)) || item.created_at;
  const shownTotal = type ? inTile(type).length : allCount;

  // Builds a library URL from the current filters with some changed.
  const href = (changes: Record<string, string | undefined>) => {
    const current: Record<string, string | undefined> = { q: q || undefined, type, status, cat, tag: tag?.id, import: imp?.id, sort: sort === "newest" ? undefined : sort };
    const next = { ...current, ...changes };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const filtered = Boolean(q || type || status || cat || tag || imp);
  const narrowed = Boolean(q || status || cat || tag || imp);
  const viewHref = (v: LibraryView) => {
    const base = href({});
    return `${base}${base.includes("?") ? "&" : "?"}view=${v}`;
  };
  const tileBase =
    "relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-surface px-3 pb-3.5 pt-2.5 transition-colors sm:px-4 sm:pb-4 sm:pt-3";

  return (
    <div data-wide="">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Library</h1>
        <Link href="/import" className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>
          Import
        </Link>
      </div>

      {/* Overview: counts by type. Tapping a tile filters by type and keeps every other filter. */}
      <nav aria-label="Filter by type" className="mb-4 grid grid-cols-4 gap-2 sm:gap-3">
        <Link
          href={href({ type: undefined })}
          aria-current={!type ? "page" : undefined}
          className={`${tileBase} ${!type ? "border-ink ring-1 ring-ink" : "border-line hover:border-muted"}`}
        >
          <span className="font-serif text-2xl leading-tight sm:text-[28px]">{allCount}</span>
          <span className="truncate text-xs font-medium sm:text-sm">All items</span>
          <span className="hidden truncate text-xs text-muted sm:block">{narrowed ? "Matching filters" : "In your library"}</span>
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-ink" />
        </Link>
        {ITEM_TYPES.map((t) => (
          <Link
            key={t}
            href={href({ type: t, status: keepsStatus(t) ? status : undefined })}
            aria-current={type === t ? "page" : undefined}
            className={`${tileBase} ${type === t ? "border-ink ring-1 ring-ink" : "border-line hover:border-muted"}`}
          >
            <span className="flex items-center gap-2">
              <span className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-[9px] sm:flex ${TYPE_STYLE[t].bg} ${TYPE_STYLE[t].text}`}>
                <TypeIcon type={t} />
              </span>
              <span className="font-serif text-2xl leading-tight sm:text-[28px]">{inTile(t).length}</span>
            </span>
            <span className="truncate text-xs font-medium sm:text-sm">{TYPE_PLURAL[t]}</span>
            <span className="hidden truncate text-xs text-muted sm:block">{tileSummary(t)}</span>
            <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-[3px] ${TYPE_ACCENT[t]}`} />
          </Link>
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-2">
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

      <FilterBar q={q} type={type} status={status} cat={cat} tag={tag?.id} importId={imp?.id} sort={sort} categories={categories} />
      </div>

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
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 text-xs text-muted">
              {items.length === LIMIT && shownTotal > LIMIT ? `Showing the first ${LIMIT} of ${shownTotal}` : `${items.length} item${items.length === 1 ? "" : "s"}`}
              {status && ` · ${STATUS_LABEL[status]}`}
              {filtered && (
                <>
                  {" · "}
                  <Link href="/library" className="underline underline-offset-2 hover:text-ink">Clear filters</Link>
                </>
              )}
            </p>
            <ViewToggle view={view} cardsHref={viewHref("cards")} listHref={viewHref("list")} />
          </div>
          {view === "cards" ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <li key={item.id}>
                  <LibraryCard
                    item={item}
                    categoryName={item.category_id ? categoryName.get(item.category_id) : undefined}
                    tags={tagMap.get(item.id)}
                    links={links.get(item.id)}
                    reasoning={reasoning.get(item.id)}
                    addedAt={addedAt(item)}
                    time={time}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
              {items.map((item) => (
                <li key={item.id}>
                  <LibraryRow
                    item={item}
                    categoryName={item.category_id ? categoryName.get(item.category_id) : undefined}
                    links={links.get(item.id)}
                    reasoning={reasoning.get(item.id)}
                    addedAt={addedAt(item)}
                    time={time}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-sm text-muted">
        <Link href="/categories" className="hover:text-ink">Manage categories</Link>
        <Link href="/imports" className="hover:text-ink">Import history</Link>
      </footer>
    </div>
  );
}

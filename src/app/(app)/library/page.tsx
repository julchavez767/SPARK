import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ItemCard } from "@/components/ItemCard";
import { linkCounts } from "@/lib/items";
import {
  ITEM_SUMMARY_COLUMNS,
  ITEM_TYPES,
  STATUS_LABEL,
  STATUSES,
  TYPE_PLURAL,
  isStatusFor,
  type ItemStatus,
  type ItemSummary,
  type ItemType,
} from "@/lib/types";
import { searchSchema } from "@/lib/validation/idea";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const parsed = searchSchema.safeParse(await searchParams);
  const q = parsed.success ? parsed.data.q ?? "" : "";
  const type: ItemType | undefined = parsed.success ? parsed.data.type : undefined;
  const rawStatus = parsed.success ? parsed.data.status : undefined;
  const status = type && isStatusFor(type, rawStatus) ? (rawStatus as ItemStatus) : undefined;

  const supabase = await createClient();
  let query = supabase.from("items").select(ITEM_SUMMARY_COLUMNS).order("created_at", { ascending: false }).limit(100);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  const items = (data ?? []) as ItemSummary[];
  const counts = await linkCounts(supabase, items.map((i) => i.id));

  const href = (next: { type?: ItemType; status?: ItemStatus }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next.type) params.set("type", next.type);
    if (next.status) params.set("status", next.status);
    const qs = params.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const tabClass = (active: boolean) =>
    `shrink-0 border-b-2 px-1 pb-2 text-sm ${active ? "border-ember font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`;
  const chipClass = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-sm ${active ? "border-ember bg-ember-soft" : "border-line text-muted"}`;

  return (
    <>
      <h1 className="mb-4 font-serif text-2xl">Library</h1>

      <form role="search" action="/library" className="mb-4">
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
      </form>

      {/* Type */}
      <nav aria-label="Filter by type" className="mb-3 flex gap-5 overflow-x-auto border-b border-line">
        <Link href={href({})} aria-current={!type ? "page" : undefined} className={tabClass(!type)}>All</Link>
        {ITEM_TYPES.map((t) => (
          <Link key={t} href={href({ type: t })} aria-current={type === t ? "page" : undefined} className={tabClass(type === t)}>
            {TYPE_PLURAL[t]}
          </Link>
        ))}
      </nav>

      {/* Status (only meaningful within one type) */}
      {type && (
        <nav aria-label="Filter by status" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href={href({ type })} aria-current={!status ? "true" : undefined} className={chipClass(!status)}>Any status</Link>
          {(STATUSES[type] as readonly ItemStatus[]).map((s) => (
            <Link key={s} href={href({ type, status: s })} aria-current={status === s ? "true" : undefined} className={chipClass(status === s)}>
              {STATUS_LABEL[s]}
            </Link>
          ))}
        </nav>
      )}

      {error ? (
        <p role="alert" className="text-sm text-ember">Couldn’t load your library. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line p-6 text-center text-sm text-muted">
          {q || type ? "Nothing matches. Try a different word or filter." : "Nothing yet. Capture something from the Capture tab."}
        </p>
      ) : (
        <>
          <p className="mb-3 mt-2 text-xs text-muted">
            {items.length === 100 ? "Showing the 100 newest matches" : `${items.length} item${items.length === 1 ? "" : "s"}`}
          </p>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} linkCount={counts.get(item.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

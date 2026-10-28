import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deleteItem, unlinkItems } from "@/app/(app)/actions";
import { StatusPill, TypeBadge } from "@/components/ItemBadges";
import {
  ITEM_SUMMARY_COLUMNS,
  ITEM_TYPES,
  STATUS_LABEL,
  STATUSES,
  TYPE_PLURAL,
  type ItemStatus,
  type ItemSummary,
  type ItemType,
  REASONING_KINDS,
  type ReasoningEntry,
  compareReasoning,
} from "@/lib/types";
import { loadCategories, tagsByItem } from "@/lib/items";
import { formatCalendarDay, formatDateTime, isCalendarDayStamp } from "@/lib/time";
import { getTimeCtx } from "@/lib/time-server";
import { Details } from "./Details";
import { RelatedForms, RenameTitle } from "./RelatedForms";
import { ReasoningLog } from "./ReasoningLog";
import { StatusPicker } from "./StatusPicker";

/** Automatic events. The Reasoning Log (written by you) is shown separately. */
const HISTORY_KINDS = ["status_change", "link_removed"] as const;

export const metadata: Metadata = { title: "Item" };


type Entry = {
  id: string;
  kind: string;
  body: string | null;
  data: { from?: string; to?: string; other_id?: string; other_title?: string | null };
  created_at: string;
};

function entryText(e: Entry): string | null {
  if (e.kind === "status_change") {
    return `Status ${STATUS_LABEL[e.data.from as ItemStatus] ?? e.data.from} → ${STATUS_LABEL[e.data.to as ItemStatus] ?? e.data.to}`;
  }
  if (e.kind === "link_removed") return `Unlinked from “${e.data.other_title ?? "a deleted item"}”`;
  return e.body;
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const time = await getTimeCtx();
  const { data: itemRow } = await supabase.from("items").select(ITEM_SUMMARY_COLUMNS).eq("id", id).maybeSingle();
  if (!itemRow) notFound();
  const item = itemRow as ItemSummary;

  // Load links (both directions), the linked items, the timeline, and candidates to link — in parallel.
  const [linksRes, entriesRes, candidatesRes] = await Promise.all([
    supabase.from("item_links").select("a_id, b_id").or(`a_id.eq.${id},b_id.eq.${id}`),
    supabase.from("item_entries").select("id, kind, body, data, created_at").eq("item_id", id).in("kind", [...HISTORY_KINDS]).order("created_at", { ascending: false }).limit(20),
    supabase.from("items").select("id, type, title").neq("id", id).order("title").limit(500),
    supabase.from("items").update({ last_viewed_at: new Date().toISOString() }).eq("id", id),
  ]);

  const [categories, tagMap, importRes, reasoningRes] = await Promise.all([
    loadCategories(supabase),
    tagsByItem(supabase, [id]),
    item.import_id
      ? supabase.from("imports").select("id, file_name, created_at").eq("id", item.import_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("item_entries").select("id, kind, body, created_at, occurred_on, import_id, data").eq("item_id", id).in("kind", [...REASONING_KINDS]).order("created_at", { ascending: false }).limit(500),
  ]);
  const reasoning = ((reasoningRes.data ?? []) as ReasoningEntry[]).sort(compareReasoning);
  const imp = importRes.data as { id: string; file_name: string | null; created_at: string } | null;

  const relatedIds = (linksRes.data ?? []).map((l) => (l.a_id === id ? l.b_id : l.a_id) as string);
  const { data: relatedRows } = relatedIds.length
    ? await supabase.from("items").select(ITEM_SUMMARY_COLUMNS).in("id", relatedIds).order("created_at", { ascending: false })
    : { data: [] };
  const related = (relatedRows ?? []) as ItemSummary[];
  const relatedSet = new Set(relatedIds);
  const candidates = ((candidatesRes.data ?? []) as { id: string; type: ItemType; title: string }[]).filter((c) => !relatedSet.has(c.id));
  const entries = (entriesRes.data ?? []) as Entry[];

  return (
    <article>
      <Link href="/library" className="mb-4 inline-block text-sm text-muted hover:text-ink">← Library</Link>

      <div className="mb-2 flex items-center gap-2">
        <TypeBadge type={item.type} />
        <StatusPill status={item.status} />
      </div>
      <RenameTitle itemId={item.id} title={item.title} />

      {/* Status: one tap to change; options depend on the type */}
      <StatusPicker itemId={item.id} current={item.status} options={STATUSES[item.type] as readonly ItemStatus[]} />

      <section aria-labelledby="details-heading" className="mt-8">
        <h2 id="details-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Details</h2>
        <Details
          itemId={item.id}
          categories={categories}
          categoryId={item.category_id}
          tags={tagMap.get(item.id) ?? []}
          sourceName={item.source_name}
          sourceUrl={item.source_url}
          origin={item.origin}
          imported={imp ? { id: imp.id, fileName: imp.file_name, date: formatDateTime(imp.created_at, time) } : null}
        />
      </section>

      {item.original_body && (
        <section aria-labelledby="original-heading" className="mt-8">
          <h2 id="original-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Original</h2>
          <div className="whitespace-pre-wrap rounded-[14px] border border-line bg-surface p-4 font-serif text-[17px] leading-relaxed">
            {item.original_body}
          </div>
        </section>
      )}

      <section aria-labelledby="reasoning-heading" className="mt-8">
        <h2 id="reasoning-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
          Reasoning log {reasoning.length > 0 && <span className="normal-case tracking-normal">({reasoning.length})</span>}
        </h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Capture what you’re thinking, questioning, deciding, and learning as your idea evolves.
        </p>
        <ReasoningLog itemId={item.id} entries={reasoning} time={time} />
      </section>

      {/* Everything linked to this item, grouped by type */}
      <section aria-labelledby="related-heading" className="mt-8">
        <h2 id="related-heading" className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          Linked {related.length > 0 && <span className="normal-case tracking-normal">({related.length})</span>}
        </h2>

        {ITEM_TYPES.map((t) => {
          const group = related.filter((r) => r.type === t);
          if (group.length === 0) return null;
          return (
            <div key={t} className="mb-4">
              <h3 className="mb-1.5 text-sm font-medium">{TYPE_PLURAL[t]}</h3>
              <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
                {group.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/items/${r.id}`} className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[16px] hover:underline">{r.title}</span>
                    </Link>
                    <StatusPill status={r.status} />
                    <form action={unlinkItems}>
                      <input type="hidden" name="fromId" value={item.id} />
                      <input type="hidden" name="toId" value={r.id} />
                      <button type="submit" aria-label={`Unlink ${r.title}`} title="Unlink" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-ember-soft hover:text-ink">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {related.length === 0 && <p className="mb-3 text-sm text-muted">Not linked to anything yet.</p>}

        <RelatedForms itemId={item.id} options={candidates} />
      </section>

      {entries.length > 0 && (
        <section aria-labelledby="history-heading" className="mt-8">
          <h2 id="history-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">History</h2>
          <ul className="space-y-1.5 text-sm text-muted">
            {entries.map((e) => (
              <li key={e.id}>
                <time dateTime={e.created_at}>{formatDateTime(e.created_at, time)}</time>
                {" · "}
                {entryText(e)}
              </li>
            ))}
            {imp ? (
              <>
                <li>
                  <time dateTime={imp.created_at}>{formatDateTime(imp.created_at, time)}</time>
                  {" · "}Imported into SPARK
                </li>
                {/* An original date from the file is a calendar day; a full timestamp from the file is a moment. */}
                {Math.abs(Date.parse(item.created_at) - Date.parse(imp.created_at)) > 60_000 && (
                  <li>
                    <time dateTime={item.created_at}>
                      {isCalendarDayStamp(item.created_at) ? formatCalendarDay(item.created_at) : formatDateTime(item.created_at, time)}
                    </time>
                    {" · "}Original date, from the import file
                  </li>
                )}
              </>
            ) : (
              <li>
                <time dateTime={item.created_at}>{formatDateTime(item.created_at, time)}</time>
                {" · "}Created{item.source === "voice" ? " by dictation" : ""}
              </li>
            )}
          </ul>
        </section>
      )}

      <details className="mt-10 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Delete this item</summary>
        <form action={deleteItem} className="mt-2 flex items-center gap-3">
          <input type="hidden" name="id" value={item.id} />
          <p className="text-muted">Deletes it and its links. Linked items stay.</p>
          <button type="submit" className="rounded-full border border-ember px-3 py-1.5 text-ember">Delete</button>
        </form>
      </details>
    </article>
  );
}

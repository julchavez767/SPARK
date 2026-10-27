import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deleteItem, setStatus, unlinkItems } from "@/app/(app)/actions";
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
} from "@/lib/types";
import { RelatedForms, RenameTitle } from "./RelatedForms";

export const metadata: Metadata = { title: "Item" };

const dateTimeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

type Entry = { id: string; kind: string; body: string | null; data: { from?: string; to?: string }; created_at: string };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: itemRow } = await supabase.from("items").select(ITEM_SUMMARY_COLUMNS).eq("id", id).maybeSingle();
  if (!itemRow) notFound();
  const item = itemRow as ItemSummary;

  // Load links (both directions), the linked items, the timeline, and candidates to link — in parallel.
  const [linksRes, entriesRes, candidatesRes] = await Promise.all([
    supabase.from("item_links").select("a_id, b_id").or(`a_id.eq.${id},b_id.eq.${id}`),
    supabase.from("item_entries").select("id, kind, body, data, created_at").eq("item_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("items").select("id, type, title").neq("id", id).order("title").limit(500),
    supabase.from("items").update({ last_viewed_at: new Date().toISOString() }).eq("id", id),
  ]);

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
      <form action={setStatus} className="mt-4 flex flex-wrap gap-1.5" aria-label="Status">
        <input type="hidden" name="id" value={item.id} />
        {(STATUSES[item.type] as readonly ItemStatus[]).map((s) => (
          <button
            key={s}
            type="submit"
            name="status"
            value={s}
            aria-pressed={item.status === s}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              item.status === s ? "border-ink bg-ink font-medium text-bg" : "border-line text-muted hover:text-ink"
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </form>

      {item.original_body && (
        <section aria-labelledby="original-heading" className="mt-8">
          <h2 id="original-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Original</h2>
          <div className="whitespace-pre-wrap rounded-[14px] border border-line bg-surface p-4 font-serif text-[17px] leading-relaxed">
            {item.original_body}
          </div>
        </section>
      )}

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
                <time dateTime={e.created_at}>{dateTimeFmt.format(new Date(e.created_at))}</time>
                {" · "}
                {e.kind === "status_change"
                  ? `Status ${STATUS_LABEL[e.data.from as ItemStatus] ?? e.data.from} → ${STATUS_LABEL[e.data.to as ItemStatus] ?? e.data.to}`
                  : e.body}
              </li>
            ))}
            <li>
              <time dateTime={item.created_at}>{dateTimeFmt.format(new Date(item.created_at))}</time>
              {" · "}Created{item.source === "voice" ? " by dictation" : ""}
            </li>
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

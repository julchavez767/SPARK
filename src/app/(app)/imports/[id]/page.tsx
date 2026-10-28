import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import { getTimeCtx } from "@/lib/time-server";
import { TypeBadge } from "@/components/ItemBadges";
import type { UndoReport } from "../actions";
import { UndoForm } from "./UndoForm";

export const metadata: Metadata = { title: "Import" };


const REASON_LABEL: Record<string, string> = {
  edited: "edited",
  "history added": "has notes, status or link changes",
  "linked since": "linked since",
  "tagged since": "tagged since",
  "has milestones or actions": "has milestones or actions",
};

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const time = await getTimeCtx();
  const { data: imp } = await supabase
    .from("imports")
    .select("id, file_name, item_count, link_count, created_at, undone_at, removed_count, entry_count, attached_entry_count, entries_removed")
    .eq("id", id)
    .maybeSingle();
  if (!imp) notFound();

  // Dry run: reports what undo would do right now, without changing anything.
  const { data: reportData } = await supabase.rpc("undo_import", { p_import: id, p_apply: false });
  const report = reportData as UndoReport | null;

  return (
    <>
      <Link href="/imports" className="mb-4 inline-block text-sm text-muted hover:text-ink">← Import history</Link>
      <h1 className="font-serif text-2xl break-words">{imp.file_name ?? "Import"}</h1>
      <p className="mt-1 text-sm text-muted">
        Imported {formatDateTime(imp.created_at as string, time)} · {imp.item_count} item{imp.item_count === 1 ? "" : "s"} · {imp.link_count} link{imp.link_count === 1 ? "" : "s"}
        {(imp.entry_count as number) > 0 &&
          ` · ${imp.entry_count} reasoning entr${imp.entry_count === 1 ? "y" : "ies"}${(imp.attached_entry_count as number) > 0 ? ` (${imp.attached_entry_count} added to existing items)` : ""}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/library?import=${id}`} className="h-10 rounded-full bg-ember px-4 text-sm font-medium leading-10 text-on-ember">
          View items still from this import ({report?.total ?? 0})
        </Link>
      </div>

      <section aria-labelledby="undo-heading" className="mt-10 rounded-[14px] border border-line bg-surface p-4">
        <h2 id="undo-heading" className="font-medium">Undo this import</h2>

        {imp.undone_at ? (
          <p className="mt-2 text-sm text-muted">
            Undone {formatDateTime(imp.undone_at as string, time)}. {imp.removed_count} item{imp.removed_count === 1 ? " was" : "s were"} removed
            {(imp.entries_removed as number) > 0 && ` and ${imp.entries_removed} reasoning entr${imp.entries_removed === 1 ? "y was" : "ies were"} taken off existing items`}
            {report && report.total > 0 ? `; ${report.total} you had worked on ${report.total === 1 ? "was" : "were"} kept.` : "."}
          </p>
        ) : !report ? (
          <p className="mt-2 text-sm text-ember">Couldn’t check this import right now. Refresh to try again.</p>
        ) : report.total === 0 && !report.entries_attached ? (
          <p className="mt-2 text-sm text-muted">There’s nothing left from this import.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Undo removes only items from this import that haven’t been touched since. Anything you’ve edited, linked, tagged or added notes to is kept. Items that were already in SPARK are never removed.
            </p>
            {(report.entries_attached ?? 0) > 0 && (
              <p className="mt-2 text-sm text-muted">
                It also takes the {report.entries_attached} reasoning entr{report.entries_attached === 1 ? "y" : "ies"} this import added to {report.attached_items} existing item{report.attached_items === 1 ? "" : "s"} back out. Entries you typed yourself, entries from other imports and History are never touched, and nothing else about those items changes.
              </p>
            )}

            {report.protected.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium">Kept ({report.protected.length})</h3>
                <ul className="mt-2 divide-y divide-line rounded-[12px] border border-line">
                  {report.protected.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <TypeBadge type={p.type} />
                      <Link href={`/items/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">{p.title}</Link>
                      <span className="shrink-0 text-xs text-muted">{p.reasons.map((r) => REASON_LABEL[r] ?? r).join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              {report.removable === 0 && !report.entries_attached ? (
                <p className="text-sm text-muted">Every remaining item has been worked on, so there’s nothing to remove.</p>
              ) : (
                <UndoForm importId={id} removable={report.removable} kept={report.protected.length} entries={report.entries_attached ?? 0} />
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}

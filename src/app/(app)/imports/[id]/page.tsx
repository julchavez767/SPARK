import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TypeBadge } from "@/components/ItemBadges";
import type { UndoReport } from "../actions";
import { UndoForm } from "./UndoForm";

export const metadata: Metadata = { title: "Import" };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const REASON_LABEL: Record<string, string> = {
  edited: "edited",
  "history added": "has a note or status change",
  "linked since": "linked since",
  "tagged since": "tagged since",
  "has milestones or actions": "has milestones or actions",
};

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: imp } = await supabase
    .from("imports")
    .select("id, file_name, item_count, link_count, created_at, undone_at, removed_count")
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
        {dateFmt.format(new Date(imp.created_at as string))} · {imp.item_count} item{imp.item_count === 1 ? "" : "s"} · {imp.link_count} link{imp.link_count === 1 ? "" : "s"}
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
            Undone on {dateFmt.format(new Date(imp.undone_at as string))}. {imp.removed_count} item{imp.removed_count === 1 ? " was" : "s were"} removed
            {report && report.total > 0 ? `; ${report.total} you had worked on ${report.total === 1 ? "was" : "were"} kept.` : "."}
          </p>
        ) : !report ? (
          <p className="mt-2 text-sm text-ember">Couldn’t check this import right now. Refresh to try again.</p>
        ) : report.total === 0 ? (
          <p className="mt-2 text-sm text-muted">There’s nothing left from this import.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Undo removes only items from this import that haven’t been touched since. Anything you’ve edited, linked, tagged or added notes to is kept. Items that were already in SPARK are never affected.
            </p>

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
              {report.removable === 0 ? (
                <p className="text-sm text-muted">Every remaining item has been worked on, so there’s nothing to remove.</p>
              ) : (
                <UndoForm importId={id} removable={report.removable} kept={report.protected.length} />
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}

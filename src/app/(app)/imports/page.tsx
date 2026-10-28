import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import { getTimeCtx } from "@/lib/time-server";

export const metadata: Metadata = { title: "Import history" };


type ImportRow = {
  id: string;
  file_name: string | null;
  item_count: number;
  link_count: number;
  created_at: string;
  undone_at: string | null;
  removed_count: number;
  entry_count: number;
  attached_entry_count: number;
};

export default async function ImportsPage() {
  const supabase = await createClient();
  const time = await getTimeCtx();
  const { data } = await supabase
    .from("imports")
    .select("id, file_name, item_count, link_count, created_at, undone_at, removed_count, entry_count, attached_entry_count")
    .order("created_at", { ascending: false })
    .limit(100);
  const imports = (data ?? []) as ImportRow[];

  return (
    <>
      <Link href="/library" className="mb-4 inline-block text-sm text-muted hover:text-ink">← Library</Link>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Import history</h1>
        <Link href="/import" className="h-9 rounded-full border border-line px-3 text-sm leading-9 text-muted hover:text-ink">New import</Link>
      </div>

      {imports.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line p-6 text-center text-sm text-muted">
          No imports yet. <Link href="/import" className="underline underline-offset-2">Import a file</Link>
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
          {imports.map((imp) => (
            <li key={imp.id}>
              <Link href={`/imports/${imp.id}`} className="block px-4 py-3 hover:bg-bg">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{imp.file_name ?? "Import"}</span>
                  {imp.undone_at && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-muted">Undone</span>}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  <time dateTime={imp.created_at}>{formatDateTime(imp.created_at, time)}</time> · {imp.item_count} item{imp.item_count === 1 ? "" : "s"} · {imp.link_count} link{imp.link_count === 1 ? "" : "s"}
                  {imp.entry_count > 0 && ` · ${imp.entry_count} reasoning entr${imp.entry_count === 1 ? "y" : "ies"}`}
                  {imp.attached_entry_count > 0 && ` (${imp.attached_entry_count} on existing items)`}
                  {imp.undone_at && ` · ${imp.removed_count} removed`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

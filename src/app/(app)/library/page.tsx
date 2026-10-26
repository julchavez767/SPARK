import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IdeaCard } from "@/components/IdeaCard";
import { IDEA_STATUSES, STATUS_LABEL, type IdeaListItem } from "@/lib/types";
import { searchSchema } from "@/lib/validation/idea";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const raw = await searchParams;
  const parsed = searchSchema.safeParse(raw);
  const q = parsed.success ? parsed.data.q ?? "" : "";
  const status = parsed.success ? parsed.data.status : undefined;

  const supabase = await createClient();
  let query = supabase
    .from("ideas")
    .select("id, title, original_body, status, source, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  const ideas = (data ?? []) as IdeaListItem[];

  const chipHref = (s?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (s) params.set("status", s);
    const qs = params.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  return (
    <>
      <h1 className="mb-4 font-serif text-2xl">Library</h1>

      <form role="search" action="/library" className="mb-3">
        <label htmlFor="q" className="sr-only">Search ideas</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={200}
          placeholder="Search your ideas"
          className="h-11 w-full rounded-[10px] border border-line bg-surface px-4 outline-none focus:border-ember"
        />
        {status && <input type="hidden" name="status" value={status} />}
      </form>

      <nav aria-label="Filter by status" className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        <Link
          href={chipHref()}
          aria-current={!status ? "true" : undefined}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${!status ? "border-ember bg-ember-soft" : "border-line text-muted"}`}
        >
          All
        </Link>
        {IDEA_STATUSES.map((s) => (
          <Link
            key={s}
            href={chipHref(s)}
            aria-current={status === s ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${status === s ? "border-ember bg-ember-soft" : "border-line text-muted"}`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="text-sm text-ember">Couldn’t load your ideas. Refresh to try again.</p>
      ) : ideas.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line p-6 text-center text-sm text-muted">
          {q || status ? "No ideas match. Try a different word or filter." : "No ideas yet. Capture one from the Capture tab."}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {ideas.length === 100 ? "Showing the 100 newest matches" : `${ideas.length} idea${ideas.length === 1 ? "" : "s"}`}
          </p>
          <ul className="space-y-3">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <IdeaCard idea={idea} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

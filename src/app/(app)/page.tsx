import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CaptureBox } from "@/components/CaptureBox";
import { IdeaCard } from "@/components/IdeaCard";
import type { IdeaListItem } from "@/lib/types";

export default async function CapturePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ideas")
    .select("id, title, original_body, status, source, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const recent = (data ?? []) as IdeaListItem[];

  return (
    <>
      <h1 className="mb-4 font-serif text-2xl">What’s sparking?</h1>
      <CaptureBox />

      <section aria-labelledby="recent-heading" className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="recent-heading" className="text-sm font-medium text-muted">Recent</h2>
          {recent.length > 0 && (
            <Link href="/library" className="text-sm text-muted hover:text-ink">See all</Link>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-ember">Couldn’t load your ideas. Refresh to try again.</p>
        ) : recent.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-line p-6 text-center text-sm text-muted">
            Nothing here yet. Your first idea doesn’t need to be good — it just needs to be saved.
          </p>
        ) : (
          <ul className="space-y-3">
            {recent.map((idea) => (
              <li key={idea.id}>
                <IdeaCard idea={idea} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

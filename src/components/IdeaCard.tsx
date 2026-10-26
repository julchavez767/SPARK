import type { IdeaListItem } from "@/lib/types";
import { StatusPill } from "./StatusPill";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function IdeaCard({ idea }: { idea: IdeaListItem }) {
  // The body preview skips the first line when it is already the title.
  const rest = idea.original_body.trim().split(/\r?\n/).slice(1).join(" ").trim();

  return (
    <article className="rounded-[14px] border border-line bg-surface p-4">
      <h3 className="font-serif text-[17px] leading-snug">{idea.title}</h3>
      {rest && <p className="mt-1 line-clamp-2 text-sm text-muted">{rest}</p>}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <StatusPill status={idea.status} />
        {idea.source === "voice" && <span>Dictated</span>}
        <time dateTime={idea.created_at} className="ml-auto">
          {dateFmt.format(new Date(idea.created_at))}
        </time>
      </div>
    </article>
  );
}

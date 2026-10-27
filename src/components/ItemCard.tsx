import Link from "next/link";
import type { ItemSummary } from "@/lib/types";
import { StatusPill, TypeBadge } from "./ItemBadges";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function ItemCard({ item, linkCount }: { item: ItemSummary; linkCount?: number }) {
  // Preview skips the first line when it is already the title.
  const rest = (item.original_body ?? "").trim().split(/\r?\n/).slice(1).join(" ").trim();

  return (
    <Link
      href={`/items/${item.id}`}
      className="block rounded-[14px] border border-line bg-surface p-4 transition-colors hover:border-muted"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <TypeBadge type={item.type} />
        <StatusPill status={item.status} />
      </div>
      <h3 className="font-serif text-[17px] leading-snug">{item.title}</h3>
      {rest && <p className="mt-1 line-clamp-2 text-sm text-muted">{rest}</p>}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        {item.source === "voice" && <span>Dictated</span>}
        {linkCount ? <span>{linkCount} linked</span> : null}
        <time dateTime={item.created_at} className="ml-auto">
          {dateFmt.format(new Date(item.created_at))}
        </time>
      </div>
    </Link>
  );
}

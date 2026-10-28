import Link from "next/link";
import type { ItemSummary, Tag } from "@/lib/types";
import { formatCalendarDay, formatShortDate, isCalendarDayStamp, type TimeCtx } from "@/lib/time";
import { StatusPill, TypeBadge } from "./ItemBadges";

type Props = { item: ItemSummary; linkCount?: number; categoryName?: string; tags?: Tag[]; time: TimeCtx };

export function ItemCard({ item, linkCount, categoryName, tags, time }: Props) {
  // An original date from an import file is a calendar day; anything else is a moment shown in local time.
  const dateText = item.import_id && isCalendarDayStamp(item.created_at)
    ? formatCalendarDay(item.created_at).replace(new RegExp(`, ${new Date().getUTCFullYear()}$`), "")
    : formatShortDate(item.created_at, time);
  // Preview skips the first line when it is already the title.
  const rest = (item.original_body ?? "").trim().split(/\r?\n/).slice(1).join(" ").trim();
  const shownTags = (tags ?? []).slice(0, 3);
  const moreTags = (tags?.length ?? 0) - shownTags.length;

  return (
    <Link
      href={`/items/${item.id}`}
      className="block rounded-[14px] border border-line bg-surface p-4 transition-colors hover:border-muted"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <TypeBadge type={item.type} />
        <StatusPill status={item.status} />
        {categoryName && <span className="truncate text-xs text-muted">{categoryName}</span>}
      </div>
      <h3 className="font-serif text-[17px] leading-snug">{item.title}</h3>
      {rest && <p className="mt-1 line-clamp-2 text-sm text-muted">{rest}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {shownTags.map((t) => (
          <span key={t.id}>#{t.name}</span>
        ))}
        {moreTags > 0 && <span>+{moreTags}</span>}
        {item.source === "voice" && <span>Dictated</span>}
        {linkCount ? <span>{linkCount} linked</span> : null}
        <time dateTime={item.created_at} className="ml-auto">
          {dateText}
        </time>
      </div>
    </Link>
  );
}

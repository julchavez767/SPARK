import Link from "next/link";
import { StatusPill, TypeBadge } from "@/components/ItemBadges";
import type { LinkSummary } from "@/lib/items";
import { previewText } from "@/lib/preview";
import { STATUS_LABEL, TYPE_LABEL, type ItemSummary, type ItemType, type Tag } from "@/lib/types";

/** Solid type colours for the card stripe, tile strip and list dot. */
export const TYPE_ACCENT: Record<ItemType, string> = {
  idea: "bg-ember",
  project: "bg-[#4f5bd5] dark:bg-[#9aa3f2]",
  system: "bg-[#2f8f5b] dark:bg-[#6fcf97]",
};

const thisYear = new Date().getFullYear();
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Added Oct 28" — when the item entered SPARK, not when the idea first came up. */
export function AddedDate({ iso, className = "" }: { iso: string; className?: string }) {
  const d = new Date(iso);
  const text = d.getFullYear() === thisYear ? shortFmt.format(d) : longFmt.format(d);
  return (
    <time
      dateTime={iso}
      title="Date added to SPARK (for imports, the import date unless the file gave one)"
      className={className}
    >
      Added {text}
    </time>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

type Props = {
  item: ItemSummary;
  categoryName?: string;
  tags?: Tag[];
  links?: LinkSummary;
  reasoning?: number;
};

export function LibraryCard({ item, categoryName, tags, links, reasoning }: Props) {
  const preview = previewText(item.title, item.original_body);
  const shownTags = (tags ?? []).slice(0, 2);
  const count = links?.count ?? 0;

  return (
    <Link
      href={`/items/${item.id}`}
      className="relative flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface py-3.5 pl-[18px] pr-3.5 transition-colors hover:border-muted focus-visible:border-ember sm:py-4 sm:pl-5 sm:pr-4"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${TYPE_ACCENT[item.type]}`} />

      <div className="mb-2 flex min-w-0 items-center gap-1.5">
        <TypeBadge type={item.type} />
        <StatusPill status={item.status} />
        {categoryName && <span className="ml-auto min-w-0 truncate pl-2 text-xs text-muted">{categoryName}</span>}
      </div>

      <h3 className="line-clamp-2 font-serif text-[17px] leading-snug">{item.title}</h3>
      {preview && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted sm:line-clamp-3">{preview}</p>}

      <div className="mt-auto pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs">
          <LinkIcon />
          {links?.first ? (
            <>
              <span className="sr-only">Linked to</span>
              <span className="min-w-0 truncate">{links.first.title}</span>
              {count > 1 && <span className="shrink-0 text-muted">+{count - 1}</span>}
            </>
          ) : (
            <span className="text-muted">No links yet</span>
          )}
        </p>

        <div className="mt-2.5 flex min-w-0 items-center gap-x-2 border-t border-line pt-2.5 text-xs text-muted">
          {shownTags.map((t) => (
            <span key={t.id} className="min-w-0 truncate">#{t.name}</span>
          ))}
          {reasoning ? <span className="shrink-0 text-[#7c3aed] dark:text-[#c4a7f5]">{reasoning} reasoning</span> : null}
          <AddedDate iso={item.created_at} className="ml-auto shrink-0 pl-2" />
        </div>
      </div>
    </Link>
  );
}

export function LibraryRow({ item, categoryName, links, reasoning }: Props) {
  const count = links?.count ?? 0;
  return (
    <Link href={`/items/${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-bg focus-visible:bg-bg">
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_ACCENT[item.type]}`} />
      <span className="min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-baseline lg:gap-4">
        <span className="block truncate font-serif text-[16px]">{item.title}</span>
        <span className="block truncate text-xs text-muted">
          {TYPE_LABEL[item.type]} · {STATUS_LABEL[item.status]}
          {categoryName ? ` · ${categoryName}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
        {count > 0 && (
          <span title={`${count} linked`} className="inline-flex items-center gap-1">
            <LinkIcon />
            {count}
            <span className="sr-only"> linked</span>
          </span>
        )}
        {reasoning ? (
          <span title={`${reasoning} reasoning entries`} className="text-[#7c3aed] dark:text-[#c4a7f5]">
            {reasoning}
            <span className="sr-only"> reasoning entries</span>
            <span aria-hidden="true"> ✎</span>
          </span>
        ) : null}
        <AddedDate iso={item.created_at} className="hidden w-24 text-right sm:inline" />
      </span>
    </Link>
  );
}

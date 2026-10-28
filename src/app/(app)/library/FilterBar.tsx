"use client";

import {
  ITEM_TYPES,
  SORT_LABEL,
  SORTS,
  STATUS_LABEL,
  STATUSES,
  TYPE_PLURAL,
  type Category,
  type ItemStatus,
  type ItemType,
  type SortKey,
} from "@/lib/types";

type Props = {
  q: string;
  type?: ItemType;
  status?: ItemStatus;
  cat?: string;
  tag?: string;
  importId?: string;
  sort: SortKey;
  categories: Category[];
};

const select =
  "h-10 w-full min-w-0 appearance-none rounded-[10px] border border-line bg-surface bg-[length:16px] bg-[right_8px_center] bg-no-repeat pl-3 pr-7 text-sm outline-none focus:border-ember";
const chevron = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236e655a' stroke-width='2' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>\")",
};

/** Category, status and sort. Changing any of them reloads the list; filters live in the address. */
export function FilterBar({ q, type, status, cat, tag, importId, sort, categories }: Props) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <form action="/library" method="get" className="mb-3 grid grid-cols-3 gap-2">
      {q && <input type="hidden" name="q" value={q} />}
      {type && <input type="hidden" name="type" value={type} />}
      {tag && <input type="hidden" name="tag" value={tag} />}
      {importId && <input type="hidden" name="import" value={importId} />}

      <label className="sr-only" htmlFor="f-cat">Category</label>
      <select id="f-cat" name="cat" defaultValue={cat ?? ""} onChange={submit} className={select} style={chevron}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value="none">Uncategorized</option>
      </select>

      <label className="sr-only" htmlFor="f-status">Status</label>
      <select id="f-status" name="status" defaultValue={status ?? ""} onChange={submit} className={select} style={chevron}>
        <option value="">Any status</option>
        {type
          ? (STATUSES[type] as readonly ItemStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))
          : ITEM_TYPES.map((t) => (
              <optgroup key={t} label={TYPE_PLURAL[t]}>
                {(STATUSES[t] as readonly ItemStatus[]).map((s) => (
                  <option key={`${t}-${s}`} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </optgroup>
            ))}
      </select>

      <label className="sr-only" htmlFor="f-sort">Sort</label>
      <select id="f-sort" name="sort" defaultValue={sort} onChange={submit} className={select} style={chevron}>
        {SORTS.map((s) => (
          <option key={s} value={s}>{SORT_LABEL[s]}</option>
        ))}
      </select>

      <noscript>
        <button type="submit" className="col-span-3 h-10 rounded-full border border-line text-sm">Apply</button>
      </noscript>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { updateDetails, type FormState } from "@/app/(app)/actions";
import { ORIGIN_LABEL, ORIGINS, type Category, type ItemOrigin, type Tag } from "@/lib/types";

type Props = {
  itemId: string;
  categories: Category[];
  categoryId: string | null;
  tags: Tag[];
  sourceName: string | null;
  sourceUrl: string | null;
  origin: ItemOrigin | null;
  imported: { id: string; fileName: string | null; date: string } | null;
};

const field = "h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] outline-none focus:border-ember";
const label = "mb-1 block text-xs font-medium text-muted";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Details(props: Props) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(updateDetails, {});
  const [categoryChoice, setCategoryChoice] = useState(props.categoryId ?? "");

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  const category = props.categories.find((c) => c.id === props.categoryId);

  if (!editing) {
    const rows: { label: string; value: React.ReactNode }[] = [
      { label: "Category", value: category ? <Link href={`/library?cat=${category.id}`} className="hover:underline">{category.name}</Link> : null },
      {
        label: "Tags",
        value: props.tags.length ? (
          <span className="flex flex-wrap gap-1.5">
            {props.tags.map((t) => (
              <Link key={t.id} href={`/library?tag=${t.id}`} className="rounded-full bg-ember-soft px-2 py-0.5 text-xs hover:underline">
                {t.name}
              </Link>
            ))}
          </span>
        ) : null,
      },
      {
        label: "Source",
        value:
          props.sourceName || props.sourceUrl ? (
            <span>
              {props.sourceName}
              {props.sourceName && props.sourceUrl && " · "}
              {props.sourceUrl && (
                <a href={props.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                  {hostOf(props.sourceUrl)} ↗
                </a>
              )}
            </span>
          ) : null,
      },
      { label: "Origin", value: props.origin ? ORIGIN_LABEL[props.origin] : null },
    ];

    return (
      <div className="rounded-[14px] border border-line bg-surface">
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-4 px-4 py-2.5 text-sm">
              <dt className="w-20 shrink-0 text-muted">{r.label}</dt>
              <dd className="min-w-0 flex-1 break-words">{r.value ?? <span className="text-muted">—</span>}</dd>
            </div>
          ))}
          {props.imported && (
            <div className="flex gap-4 px-4 py-2.5 text-sm">
              <dt className="w-20 shrink-0 text-muted">Imported</dt>
              <dd className="min-w-0 flex-1">
                <Link href={`/imports/${props.imported.id}`} className="hover:underline">
                  {props.imported.fileName ?? "Import"} · {props.imported.date}
                </Link>
              </dd>
            </div>
          )}
        </dl>
        <div className="border-t border-line px-4 py-2">
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted hover:text-ink">Edit details</button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-[14px] border border-line bg-surface p-4">
      <input type="hidden" name="id" value={props.itemId} />

      <div>
        <label htmlFor="d-category" className={label}>Category</label>
        <select id="d-category" name="categoryId" value={categoryChoice} onChange={(e) => setCategoryChoice(e.target.value)} className={field}>
          <option value="">None</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__new">+ New category…</option>
        </select>
        {categoryChoice === "__new" && (
          <input name="newCategory" maxLength={60} autoFocus placeholder="New category name" aria-label="New category name" className={`${field} mt-2`} />
        )}
      </div>

      <div>
        <label htmlFor="d-tags" className={label}>Tags <span className="font-normal">(separate with commas)</span></label>
        <input id="d-tags" name="tags" defaultValue={props.tags.map((t) => t.name).join(", ")} maxLength={1000} className={field} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="d-source" className={label}>Source</label>
          <input id="d-source" name="sourceName" defaultValue={props.sourceName ?? ""} maxLength={100} placeholder="ChatGPT, Claude, TikTok…" list="source-suggestions" className={field} />
          <datalist id="source-suggestions">
            {["ChatGPT", "Claude", "Personal thought", "Conversation", "Book", "Podcast", "TikTok", "YouTube", "Google Drive", "Notes", "Screenshot"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="d-origin" className={label}>Origin</label>
          <select id="d-origin" name="origin" defaultValue={props.origin ?? ""} className={field}>
            <option value="">Not set</option>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="d-url" className={label}>Source URL</label>
        <input id="d-url" name="sourceUrl" type="url" inputMode="url" defaultValue={props.sourceUrl ?? ""} maxLength={2000} placeholder="https://" className={field} />
      </div>

      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-ember px-5 text-sm font-medium text-on-ember disabled:opacity-40">
          {pending ? "Saving…" : "Save details"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted">Cancel</button>
        <Link href="/categories" className="ml-auto text-sm text-muted hover:text-ink">Manage categories</Link>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRelated, linkItems, renameItem, type FormState } from "@/app/(app)/actions";
import { ITEM_TYPES, TYPE_LABEL, TYPE_PLURAL, type ItemType } from "@/lib/types";
import { LIMITS } from "@/lib/validation/idea";

type Option = { id: string; type: ItemType; title: string };

const fieldClass =
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] outline-none focus:border-ember";
const buttonClass =
  "h-11 shrink-0 rounded-full bg-ember px-4 text-sm font-medium text-on-ember transition-opacity disabled:opacity-40";

/** Link an existing item, or create a new one already linked. */
export function RelatedForms({ itemId, options }: { itemId: string; options: Option[] }) {
  const [mode, setMode] = useState<"existing" | "new">(options.length > 0 ? "existing" : "new");
  const [linkState, linkAction, linking] = useActionState<FormState, FormData>(linkItems, {});
  const [newState, newAction, creating] = useActionState<FormState, FormData>(createRelated, {});
  const [newType, setNewType] = useState<ItemType>("project");
  const titleRef = useRef<HTMLInputElement>(null);
  const linkFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (newState.ok && titleRef.current) titleRef.current.value = "";
  }, [newState]);
  useEffect(() => {
    if (linkState.ok) linkFormRef.current?.reset();
  }, [linkState]);

  return (
    <div className="rounded-[14px] border border-dashed border-line p-3">
      <div role="tablist" aria-label="Add a link" className="mb-3 flex gap-1">
        {(
          [
            ["existing", "Link existing"],
            ["new", "Create new"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`rounded-full px-3 py-1 text-sm ${mode === key ? "bg-ember-soft font-medium text-ink" : "text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        options.length === 0 ? (
          <p className="text-sm text-muted">Nothing else to link yet. Create something new instead.</p>
        ) : (
          <form ref={linkFormRef} action={linkAction} className="flex gap-2">
            <input type="hidden" name="fromId" value={itemId} />
            <label htmlFor="link-to" className="sr-only">Item to link</label>
            <select id="link-to" name="toId" required defaultValue="" className={fieldClass}>
              <option value="" disabled>Choose an item…</option>
              {ITEM_TYPES.map((t) => {
                const group = options.filter((o) => o.type === t);
                if (group.length === 0) return null;
                return (
                  <optgroup key={t} label={TYPE_PLURAL[t]}>
                    {group.map((o) => (
                      <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <button type="submit" disabled={linking} className={buttonClass}>
              {linking ? "Linking…" : "Link"}
            </button>
          </form>
        )
      ) : (
        <form action={newAction} className="space-y-2">
          <input type="hidden" name="fromId" value={itemId} />
          <fieldset className="flex gap-1">
            <legend className="sr-only">Type of new item</legend>
            {ITEM_TYPES.map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  newType === t ? "border-ink font-medium" : "border-line text-muted"
                }`}
              >
                <input type="radio" name="type" value={t} checked={newType === t} onChange={() => setNewType(t)} className="sr-only" />
                {TYPE_LABEL[t]}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <label htmlFor="new-title" className="sr-only">Name</label>
            <input
              ref={titleRef}
              id="new-title"
              name="title"
              required
              maxLength={LIMITS.title}
              placeholder={`New ${TYPE_LABEL[newType].toLowerCase()} name`}
              className={fieldClass}
            />
            <button type="submit" disabled={creating} className={buttonClass}>
              {creating ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      )}

      <p role="status" aria-live="polite" className="min-h-5 pt-2 text-sm">
        {mode === "existing" && linkState.error && <span className="text-ember">{linkState.error}</span>}
        {mode === "new" && newState.error && <span className="text-ember">{newState.error}</span>}
        {mode === "existing" && linkState.ok && !linking && <span className="text-muted">Linked.</span>}
        {mode === "new" && newState.ok && !creating && <span className="text-muted">Created and linked.</span>}
      </p>
    </div>
  );
}

/** Click the title to rename it. The original text is never changed. */
export function RenameTitle({ itemId, title }: { itemId: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(renameItem, {});

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <h1 className="font-serif text-2xl leading-snug sm:text-3xl">
        <button type="button" onClick={() => setEditing(true)} className="text-left hover:underline hover:decoration-line hover:underline-offset-4" title="Rename">
          {title}
        </button>
      </h1>
    );
  }

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={itemId} />
      <label htmlFor="rename" className="sr-only">Title</label>
      <div className="flex gap-2">
        <input id="rename" name="title" defaultValue={title} maxLength={LIMITS.title} autoFocus className={`${fieldClass} font-serif text-lg`} />
        <button type="submit" disabled={pending} className={buttonClass}>Save</button>
        <button type="button" onClick={() => setEditing(false)} className="h-11 px-2 text-sm text-muted">Cancel</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
    </form>
  );
}

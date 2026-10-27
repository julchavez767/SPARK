"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCategory, renameCategory, type CategoryState } from "./actions";

const field = "h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] outline-none focus:border-ember";
const primary = "h-11 shrink-0 rounded-full bg-ember px-4 text-sm font-medium text-on-ember disabled:opacity-40";

export function AddCategory() {
  const [state, action, pending] = useActionState<CategoryState, FormData>(createCategory, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-1">
      <div className="flex gap-2">
        <label htmlFor="new-category" className="sr-only">New category</label>
        <input id="new-category" name="name" maxLength={60} required placeholder="New category, e.g. Business" className={field} />
        <button type="submit" disabled={pending} className={primary}>{pending ? "Adding…" : "Add"}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
    </form>
  );
}

export function RenameCategory({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<CategoryState, FormData>(renameCategory, {});
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline" title="Rename">
        {name}
      </button>
    );
  }
  return (
    <form action={action} className="min-w-0 flex-1 space-y-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-2">
        <label htmlFor={`rename-${id}`} className="sr-only">Category name</label>
        <input id={`rename-${id}`} name="name" defaultValue={name} maxLength={60} autoFocus className={field} />
        <button type="submit" disabled={pending} className={primary}>Save</button>
        <button type="button" onClick={() => setEditing(false)} className="px-1 text-sm text-muted">Cancel</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
    </form>
  );
}

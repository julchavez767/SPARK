"use client";

import { useActionState, useState } from "react";
import { undoImport, type UndoState } from "../actions";

export function UndoForm({ importId, removable, kept, entries = 0 }: { importId: string; removable: number; kept: number; entries?: number }) {
  const [state, action, pending] = useActionState<UndoState, FormData>(undoImport, {});
  const [confirmed, setConfirmed] = useState(false);

  if (state.removed !== undefined) {
    return (
      <p role="status" className="rounded-[12px] border border-line bg-bg px-4 py-3 text-sm">
        Removed {state.removed} item{state.removed === 1 ? "" : "s"}
        {state.entriesRemoved ? ` and ${state.entriesRemoved} reasoning entr${state.entriesRemoved === 1 ? "y" : "ies"} from existing items` : ""}.
        {state.kept ? ` Kept ${state.kept} you had worked on.` : ""}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={importId} />
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ember)]"
        />
        <span>
          I understand {removable} item{removable === 1 ? "" : "s"} from this import will be permanently deleted
          {entries > 0 ? `, and the ${entries} reasoning entr${entries === 1 ? "y" : "ies"} it added to existing items will be removed` : ""}
          {kept > 0 ? `, and the ${kept} I’ve worked on will be kept` : ""}.
        </span>
      </label>
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
      <button
        type="submit"
        disabled={!confirmed || pending}
        className="h-11 rounded-full border border-ember px-5 text-sm font-medium text-ember disabled:opacity-40"
      >
        {pending
          ? "Removing…"
          : removable > 0
            ? `Remove ${removable} item${removable === 1 ? "" : "s"}${entries > 0 ? ` + ${entries} entr${entries === 1 ? "y" : "ies"}` : ""}`
            : `Remove ${entries} entr${entries === 1 ? "y" : "ies"}`}
      </button>
    </form>
  );
}

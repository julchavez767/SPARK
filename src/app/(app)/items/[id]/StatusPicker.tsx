"use client";

import { useActionState } from "react";
import { setStatus, type FormState } from "@/app/(app)/actions";
import { STATUS_LABEL, type ItemStatus } from "@/lib/types";

/**
 * One small form per status, each carrying its own hidden status value.
 * (Relying on which submit button was clicked proved unreliable: the value
 * could go missing and the change was silently dropped.)
 */
export function StatusPicker({ itemId, current, options }: { itemId: string; current: ItemStatus; options: readonly ItemStatus[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setStatus, {});

  return (
    <div className="mt-4">
      <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
        {options.map((s) => {
          const selected = current === s;
          return (
            <form key={s} action={action}>
              <input type="hidden" name="id" value={itemId} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                disabled={pending || selected}
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1.5 text-sm transition-opacity ${
                  selected ? "border-ink bg-ink font-medium text-bg" : "border-line text-muted hover:text-ink"
                } ${pending && !selected ? "opacity-60" : ""}`}
              >
                {STATUS_LABEL[s]}
              </button>
            </form>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 pt-1 text-sm">
        {state.error && <span className="text-ember">{state.error}</span>}
      </p>
    </div>
  );
}

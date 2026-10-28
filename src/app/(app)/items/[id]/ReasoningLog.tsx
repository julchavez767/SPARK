"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addReasoning, type ReasoningState } from "@/app/(app)/actions";
import {
  REASONING_HINT,
  REASONING_KINDS,
  REASONING_LABEL,
  type ReasoningEntry,
  type ReasoningKind,
} from "@/lib/types";
import { formatDate, formatDateTime, formatPartialDate, type TimeCtx } from "@/lib/time";

// Each type gets a quiet colour so a scan of the log shows its shape.
const KIND_STYLE: Record<ReasoningKind, string> = {
  note: "bg-line/60 text-muted",
  hypothesis: "bg-[#4f5bd5]/12 text-[#4f5bd5] dark:text-[#9aa3f2]",
  challenge: "bg-[#b45309]/12 text-[#b45309] dark:text-[#f0b46b]",
  decision: "bg-[#2f8f5b]/12 text-[#2f8f5b] dark:text-[#6fcf97]",
  lesson: "bg-[#7c3aed]/12 text-[#7c3aed] dark:text-[#c4a7f5]",
};

/**
 * Typed entries show when they were written, in local time. Imported entries
 * show their original date only as precise as the source ("Sep 2025"), or
 * "Date unknown", plus when they were imported, so the import time is never
 * passed off as the date the thought was formed.
 */
function EntryDate({ e, time }: { e: ReasoningEntry; time: TimeCtx }) {
  if (!e.import_id && !e.occurred_on) {
    return <time dateTime={e.created_at} className="text-xs text-muted">{formatDateTime(e.created_at, time)}</time>;
  }
  return (
    <span className="text-xs text-muted">
      {e.occurred_on ? <time dateTime={e.occurred_on}>{formatPartialDate(e.occurred_on)}</time> : "Date unknown"}
      {e.import_id && (
        <>
          {" · imported "}
          <time dateTime={e.created_at}>{formatDate(e.created_at, time)}</time>
        </>
      )}
    </span>
  );
}

const initial: ReasoningState = {};

export function ReasoningLog({ itemId, entries, time }: { itemId: string; entries: ReasoningEntry[]; time: TimeCtx }) {
  const [state, action, pending] = useActionState(addReasoning, initial);
  const [kind, setKind] = useState<ReasoningKind>("note");
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<ReasoningKind | "all">("all");
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // On a confirmed save: clear the box and go back to Note. On error the text stays.
  useEffect(() => {
    if (!state.savedAt) return;
    setText("");
    setKind("note");
    areaRef.current?.focus();
  }, [state.savedAt]);

  const counts = useMemo(() => {
    const c = new Map<ReasoningKind, number>();
    for (const e of entries) c.set(e.kind, (c.get(e.kind) ?? 0) + 1);
    return c;
  }, [entries]);
  const shown = filter === "all" ? entries : entries.filter((e) => e.kind === filter);
  const usedKinds = REASONING_KINDS.filter((k) => counts.has(k));

  return (
    <div>
      {/* Composer */}
      <form
        ref={formRef}
        action={action}
        className="rounded-[14px] border border-line bg-surface p-3 focus-within:border-ember"
      >
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="kind" value={kind} />

        <p id={`capture-prompt-${itemId}`} className="px-1 text-sm font-medium">What would you like to capture?</p>
        <p className="mb-2 px-1 text-xs text-muted">Choose a type, write your thought, then tap Add to save it.</p>
        <div role="radiogroup" aria-labelledby={`capture-prompt-${itemId}`} className="mb-2 flex flex-wrap gap-1">
          {REASONING_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                areaRef.current?.focus();
              }}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                kind === k ? `${KIND_STYLE[k]} font-medium ring-1 ring-current` : "text-muted hover:text-ink"
              }`}
            >
              {REASONING_LABEL[k]}
            </button>
          ))}
        </div>

        <label htmlFor={`reasoning-${itemId}`} className="sr-only">
          New {REASONING_LABEL[kind].toLowerCase()}
        </label>
        <textarea
          ref={areaRef}
          id={`reasoning-${itemId}`}
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (text.trim()) formRef.current?.requestSubmit();
            }
          }}
          rows={2}
          maxLength={10000}
          placeholder={REASONING_HINT[kind]}
          className="block w-full resize-y bg-transparent px-1 py-1 text-[15px] leading-relaxed outline-none placeholder:text-muted"
        />

        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted" role="status" aria-live="polite">
            {state.error ? <span className="text-ember">{state.error}</span> : "⌘/Ctrl + Enter to save · entries can’t be edited"}
          </span>
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="ml-auto h-9 shrink-0 rounded-full bg-ember px-4 text-sm font-medium text-on-ember disabled:opacity-40"
          >
            {pending ? "Saving…" : `Add ${REASONING_LABEL[kind].toLowerCase()}`}
          </button>
        </div>
      </form>

      {/* Saved entries, under their own heading */}
      {entries.length > 0 && (
        <h3 className="mt-6 text-sm font-medium">
          Previous reflections <span className="font-normal text-muted">({entries.length})</span>
        </h3>
      )}

      {/* Filter */}
      {entries.length > 0 && usedKinds.length > 1 && (
        <div role="group" aria-label="Show" className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All {entries.length}
          </FilterChip>
          {usedKinds.map((k) => (
            <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {REASONING_LABEL[k]} {counts.get(k)}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Entries, newest first */}
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nothing logged yet. Capture a hypothesis, a challenge, a decision and why, or a lesson as this evolves.
        </p>
      ) : (
        <ol className={`${usedKinds.length > 1 ? "mt-3" : "mt-2"} space-y-2`}>
          {shown.map((e) => (
            <li key={e.id} className="rounded-[12px] border border-line bg-surface px-3 py-2.5">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[e.kind]}`}>
                  {REASONING_LABEL[e.kind]}
                </span>
                <EntryDate e={e} time={time} />
              </div>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{e.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs ${active ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

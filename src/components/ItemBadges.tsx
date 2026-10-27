import { STATUS_LABEL, TYPE_LABEL, type ItemStatus, type ItemType } from "@/lib/types";

// Type is shown in color; status is shown in neutral text. That keeps the two visibly separate.
export const TYPE_STYLE: Record<ItemType, { text: string; bg: string; border: string }> = {
  idea: { text: "text-ember", bg: "bg-ember-soft", border: "border-ember" },
  project: { text: "text-[#4f5bd5] dark:text-[#9aa3f2]", bg: "bg-[#4f5bd5]/10", border: "border-[#4f5bd5]" },
  system: { text: "text-[#2f8f5b] dark:text-[#6fcf97]", bg: "bg-[#2f8f5b]/10", border: "border-[#2f8f5b]" },
};

function TypeIcon({ type }: { type: ItemType }) {
  const common = { viewBox: "0 0 24 24", className: "h-3.5 w-3.5", "aria-hidden": true as const };
  if (type === "idea") {
    return (
      <svg {...common}>
        <path d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === "project") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 19 19 5M9 5h10v10" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TypeBadge({ type }: { type: ItemType }) {
  const s = TYPE_STYLE[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.text} ${s.bg}`}>
      <TypeIcon type={type} />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function StatusPill({ status }: { status: ItemStatus }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs text-muted">
      {STATUS_LABEL[status]}
    </span>
  );
}
